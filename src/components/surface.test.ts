import { describe, expect, it } from 'bun:test';
import { HomePage } from './HomePage';

describe('server rendered workspace', () => {
    it('provides product share metadata without a misleading guest identity on first paint', () => {
        const html = HomePage({ path: '/hot' }).toString();
        expect(html).not.toContain('NodeSeek RSS 文章列表');
        expect(html).toContain('property="og:title" content="SeekFeed · NodeSeek 社区动态"');
        expect(html).toContain('property="og:description" content="浏览 NodeSeek 实时热榜、最新帖子与社区数据分析。"');
        expect(html).toContain('id="accountLabel" style="visibility:hidden">账户');
        expect(/id="navMatched"[^>]*data-auth-only="true"[^>]*style="display:none"/.test(html)).toBe(true);
    });
    it('renders all independent destinations without SVG namespace/raw HTML conflicts', () => {
        for (const path of ['/', '/hot', '/posts', '/matched', '/subscriptions', '/statistics', '/settings/account', '/settings/rss', '/settings/telegram']) {
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
        }
    });
});
