import { describe, expect, it } from 'bun:test';
import { HomePage } from './HomePage';
import { InitPage } from './InitPage';
import { PwaCheckPage } from './PwaCheckPage';
import { readFileSync } from 'node:fs';
import cadence from '../config/cadence.json';
import { ASSET_VERSION } from '../config/assets';

describe('server rendered workspace', () => {
    it('uses one release fingerprint for every stylesheet and external script', () => {
        const html = HomePage({ path: '/posts' }).toString();
        expect(html).toContain(`name="seekfeed-version" content="${ASSET_VERSION}"`);
        const urls = [...html.matchAll(/(?:href|src)="(\/(?:css|js)\/[^\"]+)"/g)].map(match => match[1]);
        expect(urls).toContain('/js/home.js?v=' + ASSET_VERSION);
        expect(urls).toContain('/js/controls.js?v=' + ASSET_VERSION);
        expect(urls.every(url => url.endsWith(`?v=${ASSET_VERSION}`))).toBe(true);
        expect(urls.some(url => url.startsWith('/js/statistics.js?'))).toBe(false);
        const statistics = HomePage({ path: '/statistics' }).toString();
        expect(statistics).toContain(`rel="preload" href="/js/statistics.js?v=${ASSET_VERSION}" as="script"`);
    });
    it('provides the shared refresh policy before browser workflows initialize', () => {
        const html = HomePage({ path: '/settings/rss' }).toString();
        expect(html).toContain(`window.SeekFeedCadence = ${JSON.stringify(cadence)};`);
        expect(html.indexOf('window.SeekFeedCadence =')).toBeLessThan(html.indexOf('src="/js/home.js?'));
        expect(html).toContain('默认 30 秒');
        expect(cadence).toEqual({ rssIntervalSeconds: 30, feedRefreshMs: 15000, analyticsRefreshMs: 60000, keywordRefreshMs: 60000 });
    });
    it('provides product share metadata without a misleading guest identity on first paint', () => {
        const html = HomePage({ path: '/posts' }).toString();
        expect(html).not.toContain('NodeSeek RSS 文章列表');
        expect(html).toContain('property="og:title" content="SeekFeed · NodeSeek 社区动态"');
        expect(html).toContain('property="og:description" content="浏览 NodeSeek 最新帖子与社区数据分析。"');
        expect(html).toContain('id="accountLabel" style="visibility:hidden">账户');
        expect(/id="navMatched"[^>]*data-auth-only="true"/.test(html)).toBe(true);
    });
    it('restores cached account presentation before external scripts and renders the existing logo inline', () => {
        const html = HomePage({ path: '/posts' }).toString();
        const bootstrap = html.indexOf('window.SeekFeedIdentity =');
        const render = html.indexOf('window.SeekFeedIdentity.render();');
        expect(bootstrap).toBeLessThan(html.indexOf('<body>'));
        expect(render).toBeGreaterThan(html.indexOf('id="accountLabel"'));
        expect(render).toBeLessThan(html.indexOf('src="/js/controls.js?'));
        expect(html).not.toMatch(/<img[^>]+src="\/icons\/seekfeed\.svg"/);
        const logo = readFileSync(new URL('../../public/icons/seekfeed.svg', import.meta.url), 'utf8');
        expect(html).toContain(logo.match(/<path d="([^"]+)"/)![1]);
        expect(html).toContain('class="brand-mark" aria-hidden="true"');
    });
    it('renders all independent destinations without SVG namespace/raw HTML conflicts', () => {
        for (const path of ['/', '/posts', '/matched', '/subscriptions', '/statistics', '/settings/account', '/settings/rss', '/settings/telegram']) {
            const html = HomePage({ path }).toString();
            expect(html).toContain('SeekFeed');
            expect(html).not.toContain('<use');
            expect(html).not.toContain('NodeSeek 监控');
            expect(html).not.toMatch(/🧪|test-tube|flask|beaker/);
            expect(html).toContain('id="seekfeedIcons"');
            const active = path === '/' ? 'feed' : path === '/posts' || path === '/matched' ? 'feed' : path === '/statistics' ? 'stats' : path.split('/').pop();
            expect(html).toContain(`id="${active}Page" class="route-page"`);
            expect(html).not.toContain(`id="${active}Page" class="route-page" hidden`);
            expect(html).toContain('id="botToken" class="input-field"');
            const selected = [...html.matchAll(/<a href="([^"]+)"[^>]*class="nav-item selected"[^>]*aria-current="page"/g)];
            expect(selected.map(match => match[1])).toEqual([path === '/' ? '/posts' : path]);
        }
    });
    it('renders loading regions in the initial HTML and immediately shows a ready feed', () => {
        const html = HomePage({ path: '/matched' }).toString();
        for (const id of ['feedResults', 'analyticsContent', 'subscriptionResults', 'subscriptionAnalytics',
            'rssConfigPanel', 'collectionQuality', 'accountDetails', 'sessionsList', 'telegramDelivery', 'telegramStatusPanel']) {
            expect(html).toMatch(new RegExp(`id="${id}"[^>]*aria-busy="true"`));
        }
        expect(html).toContain('data-skeleton="true" aria-hidden="true"');
        const fed = HomePage({ path: '/posts', initialFeed: { posts: [], total: 0, totalPages: 0 } }).toString();
        expect(fed).toContain('id="feedResults" aria-busy="false"');
        expect(fed).not.toMatch(/id="emptyState"[^>]*display:none/);
        expect(InitPage({}).toString()).toContain('id="initFields" aria-busy="true"');
        expect(PwaCheckPage({}).toString()).toContain('id="pwaWorker" class="skeleton-value" aria-busy="true"');
    });
});
