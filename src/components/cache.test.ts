import { describe, expect, it } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { app } from '../index';
import { ASSET_VERSION } from '../config/assets';

const script = readFileSync(new URL('../../public/js/pwa-register.js', import.meta.url), 'utf8');
function browser(pathname = '/posts', latest = 'bbbbbbbbbbbbbbbb', offline = false) {
    const events = new Map<string, (event?: any) => void>();
    const stored = new Map<string, string>();
    let reloads = 0, requests = 0, notices = 0;
    const document = {
        hidden: false,
        querySelector: (selector: string) => selector.startsWith('meta') ? { content: 'aaaaaaaaaaaaaaaa' } : null,
        addEventListener: (name: string, listener: any) => events.set(name, listener),
        createElement: () => ({ setAttribute() {}, addEventListener() {}, append() {} }),
        body: { append() { notices++; } },
    };
    runInNewContext(script, {
        document, navigator: {}, AbortSignal,
        window: { addEventListener: (name: string, listener: any) => events.set(name, listener) },
        location: { pathname, reload() { reloads++; } },
        sessionStorage: { getItem: (key: string) => stored.get(key), setItem: (key: string, value: string) => stored.set(key, value) },
        fetch: async () => { requests++; if (offline) throw new Error('Offline'); return { ok: true, json: async () => ({ version: latest }) }; },
    });
    const resume = async (persisted = false) => {
        events.get('pageshow')!({ persisted });
        await new Promise(resolve => setTimeout(resolve, 0));
    };
    return { document, resume, state: () => ({ reloads, requests, notices }) };
}

describe('release cache and suspended-page recovery', () => {
    it('revalidates HTML-independent version checks and caches only fingerprinted resources indefinitely', async () => {
        const response = await app.request('/api/app-version');
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await response.json()).toEqual({ version: ASSET_VERSION });
        for (const suffix of ['', '?v=old', `?v=${ASSET_VERSION}`]) {
            const response = await app.request('/css/workspace.css' + suffix);
            expect(response.status).toBe(200);
            expect(response.headers.get('Cache-Control')).toBe(suffix.endsWith(ASSET_VERSION)
                ? 'public, max-age=31536000, immutable' : 'no-cache, must-revalidate');
        }
        expect((await app.request('/sw.js')).headers.get('Cache-Control')).toBe('no-cache, must-revalidate');
    });
    it('reloads an outdated read-only page once and prevents a stale-proxy reload loop', async () => {
        const page = browser();
        await page.resume();
        expect(page.state()).toEqual({ reloads: 1, requests: 1, notices: 0 });
        await page.resume(true);
        expect(page.state()).toEqual({ reloads: 1, requests: 2, notices: 1 });
    });
    it('preserves forms on configuration pages and offers a deliberate update', async () => {
        for (const path of ['/settings/account', '/subscriptions', '/init']) {
            const page = browser(path);
            await page.resume(); await page.resume(true);
            expect(page.state()).toEqual({ reloads: 0, requests: 2, notices: 1 });
        }
    });
    it('does not request a version while hidden, poll excessively, or reload offline/current pages', async () => {
        const hidden = browser();
        hidden.document.hidden = true;
        await hidden.resume(true);
        expect(hidden.state().requests).toBe(0);
        for (const page of [browser('/posts', 'aaaaaaaaaaaaaaaa'), browser('/posts', undefined, true)]) {
            await page.resume(); await page.resume();
            expect(page.state()).toEqual({ reloads: 0, requests: 1, notices: 0 });
        }
    });
});
