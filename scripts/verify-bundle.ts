import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { Database } from 'bun:sqlite';

// Exercise exactly the release files, without dependency lookup or source modules.
const base = resolve(process.env.SEEKFEED_TEST_TEMP || tmpdir());
const staging = await mkdtemp(join(base, 'seekfeed-bundle-'));
const reservation = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
const port = reservation.port!;
reservation.stop(true);
const env = { ...process.env, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'production',
    DATABASE_PATH: join(staging, 'data', 'seekfeed.db'), RSS_CHECK_ENABLED: 'false' };
let child: ReturnType<typeof Bun.spawn> | undefined;
try {
    await mkdir(join(staging, 'src', 'database'), { recursive: true });
    for (const path of ['dist', 'public', 'src/database/migrations']) await cp(path, join(staging, path), { recursive: true });
    await cp('package.json', join(staging, 'package.json'));
    assert.equal(existsSync(join(staging, 'node_modules')), false);
    child = Bun.spawn([process.execPath, '--no-install', 'dist/seekfeed.js'], { cwd: staging, env, stdout: 'ignore', stderr: 'inherit' });
    const origin = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 60; i++) {
        try { ready = (await fetch(origin + '/health', { signal: AbortSignal.timeout(500) })).ok; } catch {}
        if (ready) break;
        if (child.exitCode !== null) throw new Error('Standalone server exited before readiness');
        await Bun.sleep(100);
    }
    assert(ready, 'Standalone server did not become ready');
    const init = await fetch(origin + '/auth/init', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'bundletest', password: 'OfflineBundleTest123!', confirmPassword: 'OfflineBundleTest123!' }) });
    const initialized = await init.json();
    assert.equal(init.status, 200, initialized.message);
    const login = await fetch(origin + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'bundletest', password: 'OfflineBundleTest123!' }) });
    assert.equal(login.status, 200);
    const session = (await login.json()).sessionId;
    assert.equal(typeof session, 'string');
    const auth = { Authorization: `Bearer ${session}` };
    const db = new Database(env.DATABASE_PATH);
    const now = new Date().toISOString();
    db.query('INSERT INTO posts(post_id,title,memo,category,creator,pub_date,push_status) VALUES(?,?,?,?,?,?,?)')
        .run(123, 'DMIT offline fixture', 'RSS excerpt', 'tech', '<Alice & Co>', now, 3);
    assert.equal((db.query("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND (name LIKE 'hot_%' OR name LIKE 'author_backfill%' OR name='forum_post_authors')").get() as { n: number }).n, 0);
    const migrations = (db.query('SELECT COUNT(*) n FROM migrations').get() as { n: number }).n;
    db.close();
    for (const path of ['/posts', '/statistics', '/api/posts', '/api/stats/analytics?days=0', '/api/stats/keywords?q=DMIT&date=' + now.slice(0, 10)]) {
        const response = await fetch(origin + path);
        assert.equal(response.status, 200, path);
        if (path.startsWith('/api/')) assert.equal((await response.json()).success, true);
    }
    const quality = await fetch(origin + '/api/collection/quality', { headers: auth });
    assert.equal(quality.status, 200);
    assert.equal((await fetch(origin + '/api/hot')).status, 410);
    const health = Bun.spawn([process.execPath, '--no-install', 'dist/healthcheck.js'], { cwd: staging, env });
    assert.equal(await health.exited, 0);
    child.kill(); await child.exited; child = undefined;
    const retained = new Database(env.DATABASE_PATH, { readonly: true });
    assert.equal((retained.query('SELECT COUNT(*) n FROM posts').get() as { n: number }).n, 1);
    assert.equal((retained.query('SELECT COUNT(*) n FROM migrations').get() as { n: number }).n, migrations);
    retained.close();
    const failed = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('', { status: 503 }) });
    try {
        const health = Bun.spawn([process.execPath, '--no-install', 'dist/healthcheck.js'], { cwd: staging, env: { ...env, PORT: String(failed.port) } });
        assert.equal(await health.exited, 1);
    } finally { failed.stop(true); }
    console.log('Standalone release verified: no node_modules, current schema, authentication, posts, statistics, diagnostics and health checks.');
} finally {
    if (child) { child.kill(); await child.exited; }
    assert(resolve(staging).startsWith(base + sep) && basename(staging).startsWith('seekfeed-bundle-'));
    await rm(staging, { recursive: true, force: true });
}
