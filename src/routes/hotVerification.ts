import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { upgradeWebSocket } from 'hono/bun';
import { randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import type { ContextVariables } from '../types';
import { getClientInfo } from '../utils/clientInfo';
import { logger } from '../utils/logger';

const PREFIX = '/hot-verification/';
const COOKIE = 'seekfeed_verification';
const LIFETIME = 15 * 60 * 1000;
type Grant = { sessionId: string; ip?: string; expires: number; connections: Set<() => void> };
const grants = new Map<string, Grant>();

function revoke(key: string, grant: Grant) {
    grants.delete(key);
    for (const close of grant.connections) close();
}
function prune() {
    for (const [key, grant] of grants) if (grant.expires <= Date.now()) revoke(key, grant);
}
function sameOrigin(c: Context) {
    const origin = c.req.header('Origin');
    if (!origin) return false;
    try {
        const parsed = new URL(origin), target = new URL(c.req.url);
        return parsed.host === target.host && (parsed.protocol === 'https:' ||
            (parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)));
    } catch { return false; }
}
function guiUrl() {
    try {
        const url = new URL(process.env.HOT_BROWSER_GUI_URL || '');
        return url.protocol === 'http:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash ? url : null;
    } catch { return null; }
}
async function authorized(c: Context<{ Variables: ContextVariables }>) {
    prune();
    const key = getCookie(c, COOKIE) || '', grant = grants.get(key);
    if (!grant || grant.ip !== getClientInfo(c).ipAddress) return null;
    const verified = await c.get('authService').verifySession(grant.sessionId, grant.ip);
    if (!verified.valid) { revoke(key, grant); return null; }
    return { key, grant };
}

// Mounted after the API's requireSession middleware. The cookie is restricted to
// the browser proxy and is checked against the real account session on every request.
export const hotVerificationApi = new Hono<{ Variables: ContextVariables }>();
hotVerificationApi.get('/collection', async c => {
    const service = c.get('dbService').getHotService();
    const browserRunning = await service.browserRunning();
    return c.json({ success: true, data: { ...service.collectionStatus(), browserRunning } });
});
for (const action of ['start', 'stop', 'restart'] as const) hotVerificationApi.post('/collection/' + action, async c => {
    if (!sameOrigin(c)) return c.json({ success: false, message: '请求来源无效' }, 403);
    const service = c.get('dbService').getHotService();
    try {
        if (action === 'stop') for (const [key, grant] of grants) revoke(key, grant);
        await service.controlCollection(action);
        if (action !== 'start') for (const [key, grant] of grants) revoke(key, grant);
        return c.json({ success: true, data: { ...service.collectionStatus(), browserRunning: await service.browserRunning() } });
    } catch (error) {
        return c.json({ success: false, message: error instanceof Error ? error.message : '采集控制失败，请稍后重试' }, 409);
    }
});
hotVerificationApi.post('/verification', async c => {
    if (!guiUrl() || !process.env.HOT_BROWSER_ENDPOINT) return c.json({ success: false, message: '服务器尚未配置采集浏览器' }, 409);
    if (!sameOrigin(c)) return c.json({ success: false, message: '请求来源无效' }, 403);
    const service = c.get('dbService').getHotService();
    if (!service.pauseForVerification()) return c.json({ success: false, message: '正在采集，请稍后打开验证窗口' }, 409);
    prune();
    const sessionId = c.get('sessionData')!.sessionId;
    for (const [key, grant] of grants) if (grant.sessionId === sessionId) revoke(key, grant);
    if (grants.size >= 20) return c.json({ success: false, message: '验证窗口数量已达上限' }, 429);
    if (!await service.prepareVerification()) return c.json({ success: false, message: '浏览器暂不可用，请稍后重试。' }, 502);
    const key = randomBytes(32).toString('hex');
    grants.set(key, { sessionId, ip: getClientInfo(c).ipAddress, expires: Date.now() + LIFETIME, connections: new Set() });
    setCookie(c, COOKIE, key, { httpOnly: true, secure: new URL(c.req.url).protocol === 'https:' ||
        (process.env.TRUST_PROXY === 'true' && c.req.header('x-forwarded-proto') === 'https'), sameSite: 'Strict', path: PREFIX, maxAge: LIFETIME / 1000 });
    return c.json({ success: true, data: { url: PREFIX, expiresInSeconds: LIFETIME / 1000 } });
});
hotVerificationApi.post('/verification/resume', async c => {
    if (!sameOrigin(c)) return c.json({ success: false, message: '请求来源无效' }, 403);
    const service = c.get('dbService').getHotService();
    if (!await service.resumeAfterVerification()) return c.json({ success: false, message: '请先在验证窗口进入帖子列表，再重启采集' }, 409);
    const sessionId = c.get('sessionData')!.sessionId;
    for (const [key, grant] of grants) if (grant.sessionId === sessionId) revoke(key, grant);
    return c.json({ success: true, data: service.collectionStatus() });
});

export const hotVerificationRoutes = new Hono<{ Variables: ContextVariables }>();
hotVerificationRoutes.use('*', async (c, next) => {
    if (!guiUrl()) return c.text('采集浏览器未配置', 404);
    if (!await authorized(c)) return c.text('验证窗口已过期，请从 RSS 配置页重新打开。', 401);
    await next();
    c.header('Cache-Control', 'no-store');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Frame-Options', 'SAMEORIGIN');
    c.header('X-Content-Type-Options', 'nosniff');
});

for (const path of ['websockify', 'ws-notification']) hotVerificationRoutes.get('/' + path, async (c, next) => {
    if (!sameOrigin(c) || c.req.header('Upgrade')?.toLowerCase() !== 'websocket') return c.text('请求来源无效', 403);
    const entry = await authorized(c);
    if (!entry || entry.grant.connections.size >= 4) return c.text('验证连接不可用', 429);
    return upgradeWebSocket(() => {
        let upstream: WebSocket | undefined, timer: ReturnType<typeof setInterval> | undefined;
        let pending: (string | ArrayBuffer)[] = [], pendingBytes = 0;
        let closeClient: (() => void) | undefined;
        let stopped = false;
        const stop = () => {
            if (stopped) return;
            stopped = true;
            clearInterval(timer); entry.grant.connections.delete(stop);
            upstream?.close(); closeClient?.(); pending = [];
        };
        return {
            onOpen(_event, client) {
                closeClient = () => client.close(1000, 'Verification ended');
                entry.grant.connections.add(stop);
                const url = new URL(path, guiUrl()!); url.protocol = 'ws:';
                upstream = new WebSocket(url, ['binary']); upstream.binaryType = 'arraybuffer';
                upstream.onopen = () => { for (const message of pending) upstream!.send(message); pending = []; pendingBytes = 0; };
                upstream.onmessage = event => {
                    if ((client.raw as { getBufferedAmount?: () => number })?.getBufferedAmount?.()! > 4_000_000) { stop(); return; }
                    if (client.readyState === 1) client.send(event.data);
                };
                upstream.onerror = stop;
                upstream.onclose = stop;
                timer = setInterval(async () => { if (!await authorized(c)) stop(); }, 15000);
            },
            onMessage(event) {
                const message = event.data as string | ArrayBuffer;
                const size = typeof message === 'string' ? Buffer.byteLength(message) : message.byteLength;
                if (size > 1_000_000 || (upstream?.bufferedAmount || 0) > 2_000_000) { stop(); return; }
                if (upstream?.readyState === 1) upstream.send(message);
                else if ((pendingBytes += size) <= 1_000_000) pending.push(message);
                else stop();
            },
            onClose: stop,
            onError: stop,
        };
    })(c, next);
});

hotVerificationRoutes.on(['GET', 'HEAD'], '/*', async c => {
    const path = c.req.path.slice(PREFIX.length);
    // Fixed GUI origin, read-only assets only. No CDP, filesystem or terminal proxy.
    if (path.includes('..') || path.includes('%') || !/^(?:|webdata\.json|favicon\.ico|apple-touch-icon\.png|site\.webmanifest|(?:app|core|vendor)\/[a-zA-Z0-9_./-]+)$/.test(path)) return c.text('Not found', 404);
    try {
        const url = new URL(path, guiUrl()!); url.search = new URL(c.req.url).search;
        const response = await fetch(url, { method: c.req.method, redirect: 'manual', signal: AbortSignal.timeout(10000) });
        if (response.status >= 300 && response.status < 400) return c.text('浏览器入口暂不可用', 502);
        const headers = new Headers();
        headers.set('Content-Type', response.headers.get('Content-Type') || 'application/octet-stream');
        return new Response(response.body, { status: response.status, headers });
    } catch (error) {
        logger.warn('采集浏览器界面连接失败');
        return c.text('浏览器暂不可用，请稍后重试。', 502);
    }
});
