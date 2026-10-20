import { describe, expect, it } from 'bun:test';
import { runInNewContext } from 'node:vm';
import identityScript from '../../public/js/identity.js' with { type: 'text' };

function bootstrap(token: string | null, cached: unknown, storageUnavailable = false) {
    const local = new Map(token ? [['sessionId', token]] : []);
    const session = new Map(cached === undefined ? [] : [['seekfeed.identity', typeof cached === 'string' ? cached : JSON.stringify(cached)]]);
    const storage = (values: Map<string, string>) => ({
        getItem(key: string) { if (storageUnavailable) throw new Error('Storage unavailable'); return values.get(key) ?? null; },
        setItem(key: string, value: string) { if (storageUnavailable) throw new Error('Storage unavailable'); values.set(key, value); },
        removeItem(key: string) { if (storageUnavailable) throw new Error('Storage unavailable'); values.delete(key); },
    });
    const document = { documentElement: { dataset: {} as Record<string, string> }, getElementById: () => null, querySelectorAll: () => [] };
    const window = {} as { SeekFeedIdentity: { get: () => any; show: (...args: unknown[]) => any; clear: () => void } };
    runInNewContext(identityScript, { window, document, localStorage: storage(local), sessionStorage: storage(session) });
    return { identity: window.SeekFeedIdentity, local, session, document };
}

describe('account presentation cache', () => {
    it('restores only the identity bound to the current session before application initialization', () => {
        const avatar = 'data:image/png;base64,cached';
        const { identity, document } = bootstrap('current', { sessionId: 'current', username: 'peter', avatar });
        expect(identity.get()).toEqual({ sessionId: 'current', username: 'peter', avatar, ready: true });
        expect(document.documentElement.dataset.auth).toBe('session');
    });
    it('discards a previous session identity and waits for the current account instead of showing a guest', () => {
        for (const cache of [{ sessionId: 'old', username: 'old account' }, '{invalid', { sessionId: 'current', username: {} }]) {
            const { identity, session, document } = bootstrap('current', cache);
            expect(identity.get()).toEqual({ sessionId: 'current', username: null, avatar: null, ready: false });
            expect(session.has('seekfeed.identity')).toBe(false);
            expect(document.documentElement.dataset.auth).toBe('session');
        }
    });
    it('never restores an account for a guest, including when browser storage is unavailable', () => {
        for (const unavailable of [false, true]) {
            const { identity, document } = bootstrap(null, { sessionId: 'old', username: 'private account' }, unavailable);
            expect(identity.get()).toEqual({ sessionId: null, username: null, avatar: null, ready: true });
            expect(document.documentElement.dataset.auth).toBe('guest');
        }
    });
    it('rejects a delayed profile response after the active session changes', () => {
        const { identity, local } = bootstrap('first', { sessionId: 'first', username: 'first account' });
        local.set('sessionId', 'second');
        expect(identity.show('stale account', 'first', null)).toBeNull();
        identity.clear();
        expect(identity.get()).toEqual({ sessionId: 'second', username: null, avatar: null, ready: false });
        expect(identity.show('second account', 'second', null)?.username).toBe('second account');
    });
    it('updates the cache after login and clears it after logout', () => {
        const { identity, local, session } = bootstrap(null, undefined);
        local.set('sessionId', 'signed-in');
        identity.show('peter', 'signed-in', null);
        expect(JSON.parse(session.get('seekfeed.identity')!)).toEqual({ sessionId: 'signed-in', username: 'peter', avatar: null });
        local.delete('sessionId');
        identity.clear();
        expect(identity.get()).toEqual({ sessionId: null, username: null, avatar: null, ready: true });
        expect(session.has('seekfeed.identity')).toBe(false);
    });
    it('ignores remote, non-PNG and oversized cached avatar sources', () => {
        for (const avatar of ['https://example.com/avatar.png', 'data:image/svg+xml;base64,AA==', 'data:image/png;base64,' + 'A'.repeat(410000)]) {
            expect(bootstrap('current', { sessionId: 'current', username: 'peter', avatar }).identity.get().avatar).toBeNull();
        }
    });
});
