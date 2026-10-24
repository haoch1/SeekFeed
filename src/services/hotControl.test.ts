import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { HotService, CollectorUnavailable } from './hot';
import { ManagedBrowser } from './browserControl';
import type { BrowserControl } from './browserControl';

let db: Database, service: HotService | undefined;
let env: Record<string, string | undefined>;
beforeEach(() => {
    env = Object.fromEntries(['HOT_COLLECT_ENABLED', 'HOT_BROWSER_ENDPOINT', 'HOT_BROWSER_CONTROL_SOCKET'].map(key => [key, process.env[key]]));
    process.env.HOT_COLLECT_ENABLED = 'true'; process.env.HOT_BROWSER_ENDPOINT = 'http://private-browser:9222';
    db = new Database(':memory:');
    for (const name of ['001_initial', '006_hot_ranking', '007_hot_samples', '008_hot_collector_cooldown', '011_forum_author_links', '012_collection_insights', '016_hot_browser_collection', '017_hot_collector_control']) db.exec(readFileSync(new URL(`../database/migrations/${name}.sql`, import.meta.url), 'utf8'));
});
afterEach(async () => {
    await service?.shutdown(); service = undefined; db.close();
    for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
});
const sample = () => ({ collectedAt: new Date().toISOString(), pages: 4, posts: [{ postId: 1, title: '帖子', author: '作者', category: 'tech', categoryLabel: '技术', views: 10, replies: 1, lastActiveAt: new Date().toISOString(), pinned: false }] });
function browser() {
    return { configured: true, running: false, starts: 0, stops: 0,
        async start() { this.running = true; this.starts++; }, async stop() { this.running = false; this.stops++; },
        async status() { return this.running; } } satisfies BrowserControl;
}

describe('collector and browser lifecycle', () => {
    it('cancels an active batch, releases the browser, discards late results and keeps the stop across restart', async () => {
        const resource = browser(); let finish!: () => void;
        service = new HotService(db, (_full, _author, signal) => new Promise(resolve => {
            finish = () => resolve(sample()); signal!.addEventListener('abort', finish, { once: true });
        }), resource);
        const collecting = service.refresh(); await Bun.sleep(0);
        expect(resource.running).toBe(true);
        await service.controlCollection('stop'); await collecting;
        expect(service.collectionStatus().stopped).toBe(true); expect(resource.running).toBe(false);
        expect(db.query('SELECT COUNT(*) AS n FROM hot_posts').get()).toEqual({ n: 0 });
        expect(db.query('SELECT COUNT(*) AS n FROM collection_runs').get()).toEqual({ n: 0 });
        await service.shutdown();
        service = new HotService(db, async () => { throw new Error('must not collect'); }, resource);
        await service.start(); expect(await service.refresh()).toBe(false); expect(resource.running).toBe(false);
        finish();
    });
    it('releases the browser on transient failures and retries only after cooldown, while success reuses it', async () => {
        const resource = browser(); let fail = true;
        service = new HotService(db, async () => { if (fail) throw new CollectorUnavailable(0, 'network_error'); return sample(); }, resource);
        expect(await service.refresh()).toBe(false); expect(resource.running).toBe(false); expect(resource.starts).toBe(1);
        expect(await service.refresh()).toBe(false); expect(resource.starts).toBe(1);
        db.query('UPDATE hot_collector_state SET last_attempt_at=NULL,next_attempt_at=NULL').run(); fail = false;
        expect(await service.refresh()).toBe(true); expect(resource.running).toBe(true);
    });
    it('closes on CF without automatic retry, starts only for manual verification and expires the browser lease', async () => {
        const resource = browser();
        service = new HotService(db, async () => { throw new CollectorUnavailable(0, 'verification_required'); }, resource);
        await service.refresh(); expect(resource.running).toBe(false);
        expect(await service.refresh()).toBe(false); expect(resource.starts).toBe(1);
        expect(await service.prepareVerification(async () => true)).toBe(true); expect(resource.running).toBe(true);
        const expiry = Date.parse(service.collectionStatus().verificationExpiresAt!);
        expect(await service.expireVerification(expiry - 1)).toBe(false);
        expect(await service.expireVerification(expiry + 1)).toBe(true); expect(resource.running).toBe(false);
        expect(service.collectionStatus().verificationRequired).toBe(true);
    });
    it('does not destroy a completed verification and keeps explicit Retry-After during restart', async () => {
        const resource = browser();
        service = new HotService(db, async () => sample(), resource);
        service.pauseForVerification(); await service.prepareVerification(async () => true);
        const stops = resource.stops;
        db.query('UPDATE hot_collector_state SET retry_after_at=?').run(new Date(Date.now() + 1800000).toISOString());
        expect(await service.resumeAfterVerification(async () => ({ connected: true, ready: true, verificationRequired: false }))).toBe(true);
        expect(resource.stops).toBe(stops); expect(resource.running).toBe(true);
        expect(Date.parse(service.collectionStatus().nextAttemptAt!) - Date.now()).toBeGreaterThan(1799000);
        expect(await service.expireVerification(Date.now() + 3600000)).toBe(false);
    });
    it('prevents a slow verification check from reviving a stopped collector and surfaces close failures', async () => {
        const resource = browser();
        service = new HotService(db, async () => sample(), resource); service.pauseForVerification();
        let finish!: (value: any) => void;
        const checking = service.resumeAfterVerification(() => new Promise(resolve => { finish = resolve; }));
        await service.controlCollection('stop');
        finish({ connected: true, ready: true, verificationRequired: false });
        expect(await checking).toBe(false); expect(service.collectionStatus().stopped).toBe(true);
        resource.stop = async () => { throw new Error('PRIVATE'); };
        await expect(service.controlCollection('stop')).rejects.toThrow('浏览器关闭失败');
        expect(service.collectionStatus().error).not.toContain('PRIVATE');
    });
    it('starts and restarts the scheduler without skipping cooldown or immediately contacting a source', async () => {
        const resource = browser(); let calls = 0;
        service = new HotService(db, async () => { calls++; return sample(); }, resource);
        await service.controlCollection('stop');
        const due = new Date(Date.now() + 120000).toISOString();
        db.query('UPDATE hot_collector_state SET next_attempt_at=?').run(due);
        await service.controlCollection('start'); await service.controlCollection('restart');
        expect(service.collectionStatus().enabled).toBe(true); expect(calls).toBe(0);
        expect(service.collectionStatus().nextAttemptAt).toBe(due);
        expect(await service.refresh()).toBe(false);
    });
    it('waits for the private debugger after starting and does not accept a failed resource release', async () => {
        process.env.HOT_BROWSER_CONTROL_SOCKET = '/private/test.sock';
        const calls: string[] = [];
        const control = new ManagedBrowser(async (path, method) => { calls.push(method + path); return path !== '/stop'; }, async () => { calls.push('ready'); });
        await control.start(); await control.stop();
        expect(calls).toEqual(['POST/start', 'ready', 'POST/stop']);
        const failed = new ManagedBrowser(async () => true, async () => {});
        await expect(failed.stop()).rejects.toThrow('尚未关闭');
    });
});
