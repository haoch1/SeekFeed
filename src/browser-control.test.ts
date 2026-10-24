import { describe, expect, it } from 'bun:test';
import { createBrowserController } from './browser-control';

describe('restricted browser controller', () => {
    it('exposes only fixed start, stop, status and health operations', async () => {
        let running = true;
        const calls: string[] = [];
        const handler = createBrowserController(async (path, method) => {
            calls.push(method + ' ' + path);
            if (method === 'GET') return Response.json({ Config: { Labels: { 'com.docker.compose.project': 'seekfeed', 'com.docker.compose.service': 'seekfeed-browser' } }, State: { Running: running } });
            running = path.endsWith('/start');
            return new Response(null, { status: 204 });
        });
        for (const path of ['/containers/other/stop', '/start?container=other', '/start/other', '/restart', '/exec']) {
            expect((await handler(new Request('http://local' + path, { method: 'POST' }))).status).toBeGreaterThanOrEqual(400);
        }
        expect((await handler(new Request('http://local/start'))).status).toBe(404);
        expect((await handler(new Request('http://local/stop', { method: 'POST', body: '{}' }))).status).toBe(400);
        expect(calls).toEqual([]);
        expect((await handler(new Request('http://local/stop', { method: 'POST' }))).status).toBe(200);
        expect(running).toBe(false);
        await handler(new Request('http://local/stop', { method: 'POST' }));
        await handler(new Request('http://local/start', { method: 'POST' }));
        expect(running).toBe(true);
        expect(calls.filter(call => call.startsWith('POST'))).toEqual(['POST /v1.45/containers/seekfeed-browser/stop?t=8', 'POST /v1.45/containers/seekfeed-browser/start']);
    });
    it('refuses mismatched labels and reports stop failures without exposing daemon data', async () => {
        const wrong = createBrowserController(async () => Response.json({ Config: { Labels: {} }, State: { Running: true }, secret: 'PRIVATE' }));
        const mismatch = await wrong(new Request('http://local/stop', { method: 'POST' }));
        expect(mismatch.status).toBe(502);
        expect(await mismatch.text()).not.toContain('PRIVATE');
        const failed = createBrowserController(async (_path, method) => method === 'POST' ? new Response('PRIVATE', { status: 500 }) : Response.json({ Config: { Labels: { 'com.docker.compose.project': 'seekfeed', 'com.docker.compose.service': 'seekfeed-browser' } }, State: { Running: true } }));
        const stop = await failed(new Request('http://local/stop', { method: 'POST' }));
        expect(stop.status).toBe(502);
        expect(await stop.text()).not.toContain('PRIVATE');
    });
});
