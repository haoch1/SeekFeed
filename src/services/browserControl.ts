import { z } from 'zod';

export interface BrowserControl {
    readonly configured: boolean;
    start(signal?: AbortSignal): Promise<void>;
    stop(): Promise<void>;
    status(): Promise<boolean | null>;
}

export async function waitForBrowser(signal?: AbortSignal) {
    const endpoint = new URL(process.env.HOT_BROWSER_ENDPOINT!);
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        signal?.throwIfAborted();
        try {
            const response = await fetch(new URL('/json/list', endpoint), { headers: { Host: 'localhost' },
                redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(1000), ...(signal ? [signal] : [])]) });
            const pages = await response.json();
            if (response.ok && Array.isArray(pages) && pages.some(page => page.type === 'page')) return;
        } catch { signal?.throwIfAborted(); }
        await Bun.sleep(300);
    }
    throw new Error('采集浏览器启动超时');
}

export class ManagedBrowser implements BrowserControl {
    private pending: Promise<void> = Promise.resolve();
    get configured() { return Boolean(process.env.HOT_BROWSER_CONTROL_SOCKET); }
    constructor(private request = async (path: string, method: string) => {
        const response = await fetch('http://browser-control' + path, { unix: process.env.HOT_BROWSER_CONTROL_SOCKET,
            method, redirect: 'error', signal: AbortSignal.timeout(18000) });
        if (!response.ok) throw new Error('采集浏览器控制失败');
        return z.object({ running: z.boolean() }).parse(await response.json()).running;
    }, private ready = waitForBrowser) {}
    private command(path: string, method: string) {
        const result = this.pending.then(() => this.request(path, method));
        this.pending = result.then(() => {}, () => {});
        return result;
    }
    async start(signal?: AbortSignal) {
        if (!this.configured) return;
        signal?.throwIfAborted();
        if (!await this.command('/start', 'POST')) throw new Error('采集浏览器未启动');
        signal?.throwIfAborted();
        await this.ready(signal);
    }
    async stop() {
        if (this.configured && await this.command('/stop', 'POST')) throw new Error('采集浏览器尚未关闭');
    }
    async status() { return this.configured ? this.command('/status', 'GET') : null; }
}
