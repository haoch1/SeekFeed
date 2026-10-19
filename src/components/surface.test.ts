import { describe, expect, it } from 'bun:test';
import { HomePage } from './HomePage';

describe('server rendered workspace', () => {
    it('renders all independent destinations without SVG namespace/raw HTML conflicts', () => {
        for (const path of ['/', '/matched', '/subscriptions', '/statistics', '/settings/account', '/settings/rss', '/settings/telegram']) {
            const html = HomePage({ path }).toString();
            expect(html).toContain('SeekFeed');
            expect(html).not.toContain('<use');
            expect(html).not.toContain('NodeSeek 监控');
            expect(html).not.toMatch(/🧪|test-tube|flask|beaker/);
            expect(html).toContain('id="seekfeedIcons"');
            const active = path === '/' || path === '/matched' ? 'feed' : path === '/statistics' ? 'stats' : path.split('/').pop();
            expect(html).toContain(`id="${active}Page" class="route-page"`);
            expect(html).not.toContain(`id="${active}Page" class="route-page" hidden`);
            expect(html).toContain('id="botToken" class="input-field"');
        }
    });
});
