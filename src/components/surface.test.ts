import { describe, expect, it } from 'bun:test';
import { HomePage } from './HomePage';
import { readFileSync } from 'node:fs';
import cadence from '../config/cadence.json';

describe('server rendered workspace', () => {
    it('provides the shared refresh policy before browser workflows initialize', () => {
        const html = HomePage({ path: '/settings/rss' }).toString();
        expect(html).toContain(`window.SeekFeedCadence = ${JSON.stringify(cadence)};`);
        expect(html.indexOf('window.SeekFeedCadence =')).toBeLessThan(html.indexOf('src="/js/home.js"'));
        expect(html).toContain('默认 30 秒');
        expect(cadence).toEqual({ rssIntervalSeconds: 30, hotCollectIntervalSeconds: 60, feedRefreshMs: 5000, hotRefreshMs: 15000, analyticsRefreshMs: 15000, keywordRefreshMs: 30000 });
    });
    it('provides product share metadata without a misleading guest identity on first paint', () => {
        const html = HomePage({ path: '/hot' }).toString();
        expect(html).not.toContain('NodeSeek RSS 文章列表');
        expect(html).toContain('property="og:title" content="SeekFeed · NodeSeek 社区动态"');
        expect(html).toContain('property="og:description" content="浏览 NodeSeek 实时热榜、最新帖子与社区数据分析。"');
        expect(html).toContain('id="accountLabel" style="visibility:hidden">账户');
        expect(/id="navMatched"[^>]*data-auth-only="true"/.test(html)).toBe(true);
    });
    it('restores cached account presentation before external scripts and renders the existing logo inline', () => {
        const html = HomePage({ path: '/posts' }).toString();
        const bootstrap = html.indexOf('window.SeekFeedIdentity =');
        const render = html.indexOf('window.SeekFeedIdentity.render();');
        expect(bootstrap).toBeLessThan(html.indexOf('<body>'));
        expect(render).toBeGreaterThan(html.indexOf('id="accountLabel"'));
        expect(render).toBeLessThan(html.indexOf('src="/js/controls.js"'));
        expect(html).not.toMatch(/<img[^>]+src="\/icons\/seekfeed\.svg"/);
        const logo = readFileSync(new URL('../../public/icons/seekfeed.svg', import.meta.url), 'utf8');
        expect(html).toContain(logo.match(/<path d="([^"]+)"/)![1]);
        expect(html).toContain('class="brand-mark" aria-hidden="true"');
    });
    it('renders all independent destinations without SVG namespace/raw HTML conflicts', () => {
        for (const path of ['/', '/hot', '/posts', '/matched', '/subscriptions', '/statistics', '/trades', '/settings/account', '/settings/rss', '/settings/telegram']) {
            const html = HomePage({ path }).toString();
            expect(html).toContain('SeekFeed');
            expect(html).not.toContain('<use');
            expect(html).not.toContain('NodeSeek 监控');
            expect(html).not.toMatch(/🧪|test-tube|flask|beaker/);
            expect(html).toContain('id="seekfeedIcons"');
            const active = path === '/' ? 'hot' : path === '/posts' || path === '/matched' ? 'feed' : path === '/statistics' ? 'stats' : path.split('/').pop();
            expect(html).toContain(`id="${active}Page" class="route-page"`);
            expect(html).not.toContain(`id="${active}Page" class="route-page" hidden`);
            expect(html).toContain('id="botToken" class="input-field"');
            const selected = [...html.matchAll(/<a href="([^"]+)"[^>]*class="nav-item selected"[^>]*aria-current="page"/g)];
            expect(selected.map(match => match[1])).toEqual([path === '/' ? '/hot' : path]);
        }
    });
});
