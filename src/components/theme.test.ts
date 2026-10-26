import { describe, expect, it } from 'bun:test';
import { runInNewContext } from 'node:vm';
import themeScript from '../../public/js/theme.js' with { type: 'text' };
import { HomePage } from './HomePage';

function bootstrap(saved: string | null, dark = false, blocked = false, legacy?: string) {
    const local = new Map(saved ? [['seekfeed.themePreference', saved]] : []);
    if (legacy) local.set('theme', legacy);
    const events = new Map<string, (event?: any) => void>();
    const metas = new Map<string, string>();
    const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string>, classList: { remove() {} } };
    const media = { matches: dark, addEventListener(_name: string, handler: () => void) { events.set('system', handler); } };
    const document = { documentElement: root, hidden: false, querySelector: (query: string) => ({ setAttribute(_key: string, value: string) { metas.set(query, value); } }), querySelectorAll: () => [], getElementById: () => null, addEventListener: (name: string, handler: () => void) => events.set(name, handler) };
    const window = { matchMedia: (query: string) => query.includes('color-scheme') ? media : { matches: true }, addEventListener: (name: string, handler: () => void) => events.set(name, handler) } as any;
    const localStorage = {
        getItem(key: string) { if (blocked) throw new Error('Storage unavailable'); return local.get(key) ?? null; },
        setItem(key: string, value: string) { if (blocked) throw new Error('Storage unavailable'); local.set(key, value); },
    };
    runInNewContext(themeScript, { window, document, localStorage, clearTimeout });
    return { root, local, events, metas, media, theme: window.SeekFeedTheme };
}

describe('resolved appearance preference', () => {
    it('follows a changing system before UI initialization and resolves both palettes explicitly', () => {
        const { theme, root, media, events, metas } = bootstrap(null);
        expect(theme.getPreference()).toBe('system');
        expect(root.dataset.theme).toBe('light');
        expect(root.style.colorScheme).toBe('only light');
        media.matches = true; events.get('system')!();
        expect(root.dataset.theme).toBe('dark');
        expect(root.style.colorScheme).toBe('only dark');
        expect(metas.get('meta[name="theme-color"]')).toBe('#101012');
        media.matches = false; events.get('visibilitychange')!();
        expect(root.dataset.theme).toBe('light');
    });
    it('defaults legacy binary choices to system and retains later explicit choices', () => {
        for (const legacy of ['light', 'dark']) {
            const { theme, root, events } = bootstrap(null, true, false, legacy);
            expect(theme.getPreference()).toBe('system');
            expect(root.dataset.theme).toBe('dark');
            events.get('storage')!({ key: 'theme', newValue: 'light' });
            expect(root.dataset.theme).toBe('dark');
        }
        expect(bootstrap('light', true, false, 'dark').root.dataset.theme).toBe('light');
    });
    it('retains new explicit choices and resumes automatic updates only after system is selected', () => {
        const { theme, root, media, events, local } = bootstrap('light', true);
        expect(root.dataset.theme).toBe('light');
        events.get('system')!();
        expect(root.dataset.theme).toBe('light');
        theme.setPreference('system');
        expect(local.get('seekfeed.themePreference')).toBe('system');
        expect(root.dataset.theme).toBe('dark');
        theme.setPreference('dark');
        media.matches = false; events.get('system')!();
        expect(root.dataset.theme).toBe('dark');
    });
    it('synchronizes other tabs and clearing preferences without accepting invalid palette names', () => {
        const { root, events, theme } = bootstrap('dark');
        events.get('storage')!({ key: 'other', newValue: 'light' });
        expect(root.dataset.theme).toBe('dark');
        events.get('storage')!({ key: 'seekfeed.themePreference', newValue: 'light' });
        expect(root.dataset.theme).toBe('light');
        events.get('storage')!({ key: null, newValue: null });
        expect(theme.getPreference()).toBe('system');
        expect(bootstrap('invalid', true).root.dataset.theme).toBe('dark');
    });
    it('works with unavailable browser storage', () => {
        const { root, theme, media, events } = bootstrap('light', true, true);
        expect(root.dataset.theme).toBe('dark');
        theme.setPreference('light');
        media.matches = false; events.get('system')!();
        expect(root.dataset.theme).toBe('light');
    });
    it('resolves the initial palette in the document head and exposes all three explicit choices', () => {
        const html = HomePage({ path: '/posts' }).toString();
        expect(html.indexOf('window.SeekFeedTheme =')).toBeLessThan(html.indexOf('</head>'));
        expect(html).toContain('data-theme-option="system"');
        expect(html).toContain('data-theme-option="light"');
        expect(html).toContain('data-theme-option="dark"');
    });
});
