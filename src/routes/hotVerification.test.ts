import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import { DatabaseService } from '../services/database';
import { AuthService } from '../services/auth';
import { SessionService } from '../services/session';
import { requireSession } from '../middleware/session';
import { hotVerificationApi, hotVerificationRoutes } from './hotVerification';
import { websocket } from 'hono/bun';

let app: Hono, db: DatabaseService, sessions: SessionService, session: string;
let gui: ReturnType<typeof Bun.serve>, server: ReturnType<typeof Bun.serve> | undefined;
let oldEndpoint: string | undefined, oldGui: string | undefined;
beforeEach(() => {
    oldEndpoint = process.env.HOT_BROWSER_ENDPOINT; oldGui = process.env.HOT_BROWSER_GUI_URL;
    const sqlite = new Database(':memory:');
    for (const name of ['001_initial', '002_add_rss_config', '003_add_telegram_mode', '004_subscription_controls', '005_account_preferences', '006_hot_ranking', '007_hot_samples', '008_hot_collector_cooldown', '009_account_avatar', '011_forum_author_links', '012_collection_insights', '016_hot_browser_collection']) sqlite.exec(readFileSync(new URL(`../database/migrations/${name}.sql`, import.meta.url), 'utf8'));
    db = new DatabaseService(sqlite);
    db.createBaseConfig({ username: 'tester', password: 'hash', chat_id: '', stop_push: 0, only_title: 0 });
    sessions = new SessionService(db); session = sessions.createSession(1, 'tester').sessionId;
    gui = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch(request, server) {
        if (request.headers.get('upgrade') === 'websocket' && server.upgrade(request)) return;
        return new Response('GUI asset', { headers: { 'Content-Type': 'text/plain' } });
    }, websocket: { message(ws, message) { ws.send(message); } } });
    process.env.HOT_BROWSER_ENDPOINT = 'http://private-browser:9222';
    process.env.HOT_BROWSER_GUI_URL = `http://127.0.0.1:${gui.port}`;
    app = new Hono();
    app.use('*', async (c: any, next) => { c.set('dbService', db); c.set('authService', new AuthService(db)); await next(); });
    app.use('/api/*', requireSession); app.route('/api/hot', hotVerificationApi);
    app.route('/hot-verification', hotVerificationRoutes);
});
afterEach(() => {
    server?.stop(true); server = undefined; gui.stop(true); db.close();
    for (const [key, value] of [['HOT_BROWSER_ENDPOINT', oldEndpoint], ['HOT_BROWSER_GUI_URL', oldGui]]) {
        if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
});
const headers = () => ({ Authorization: `Bearer ${session}`, Origin: 'http://localhost' });
async function open() {
    const response = await app.request('/api/hot/verification', { method: 'POST', headers: headers() });
    expect(response.status).toBe(200);
    return response.headers.get('Set-Cookie')!.split(';')[0];
}
describe('private manual verification entry', () => {
    it('rejects guests, forged credentials, cross-origin opens and anonymous proxy requests', async () => {
        for (const path of ['/collection', '/verification', '/verification/resume']) for (const auth of [{}, { Authorization: 'Bearer forged' }]) {
            expect((await app.request('/api/hot' + path, { method: path === '/collection' ? 'GET' : 'POST', headers: auth })).status).toBe(401);
        }
        expect((await app.request('/api/hot/verification', { method: 'POST', headers: { ...headers(), Origin: 'https://evil.test' } })).status).toBe(403);
        expect((await app.request('/hot-verification/')).status).toBe(401);
        expect((await app.request('/hot-verification/websockify', { headers: { Origin: 'http://localhost', Upgrade: 'websocket' } })).status).toBe(401);
    });
    it('issues a restricted expiring cookie, pauses collection, proxies only GUI assets, and honors logout', async () => {
        const response = await app.request('/api/hot/verification', { method: 'POST', headers: headers() });
        const cookie = response.headers.get('Set-Cookie')!;
        expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Strict'); expect(cookie).toContain('Path=/hot-verification/'); expect(cookie).toContain('Max-Age=900');
        expect((await response.json()).data.url).toBe('/hot-verification/');
        expect(db.getHotService().collectionStatus().verificationRequired).toBe(true);
        const proxyHeaders = { Cookie: cookie.split(';')[0] };
        const asset = await app.request('/hot-verification/app/ui.js?v=1', { headers: proxyHeaders });
        expect(await asset.text()).toBe('GUI asset'); expect(asset.headers.get('Cache-Control')).toBe('no-store');
        expect((await app.request('/hot-verification/json/list', { headers: proxyHeaders })).status).toBe(404);
        expect((await app.request('/hot-verification/ws-terminal', { headers: proxyHeaders })).status).toBe(404);
        expect((await app.request('/hot-verification/websockify', { headers: { ...proxyHeaders, Origin: 'https://evil.test', Upgrade: 'websocket' } })).status).toBe(403);
        sessions.destroySession(session);
        expect((await app.request('/hot-verification/', { headers: proxyHeaders })).status).toBe(401);
    });
    it('forwards authenticated binary WebSocket traffic and closes it when the entry is replaced', async () => {
        server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: app.fetch, websocket });
        const origin = `http://127.0.0.1:${server.port}`;
        const response = await fetch(origin + '/api/hot/verification', { method: 'POST', headers: { ...headers(), Origin: origin } });
        expect(response.status).toBe(200);
        const cookie = response.headers.get('Set-Cookie')!.split(';')[0];
        const socket = new WebSocket(`ws://127.0.0.1:${server.port}/hot-verification/websockify`, {
            headers: { Cookie: cookie, Origin: `http://127.0.0.1:${server.port}` },
        });
        const echoed = await new Promise<Uint8Array>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Proxy timeout')), 3000);
            socket.binaryType = 'arraybuffer'; socket.onopen = () => socket.send(new Uint8Array([1, 2, 3]));
            socket.onmessage = event => { clearTimeout(timeout); resolve(new Uint8Array(event.data)); };
            socket.onerror = reject;
        });
        expect([...echoed]).toEqual([1, 2, 3]);
        const closed = new Promise(resolve => { socket.onclose = resolve; });
        await open();
        await closed;
        expect(socket.readyState).toBe(WebSocket.CLOSED);
    });
});
