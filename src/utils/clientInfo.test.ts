import { describe, expect, it } from 'bun:test';
import { resolveClientIp } from './clientInfo';

describe('login IP attribution', () => {
    it('ignores spoofed proxy headers on direct deployments', () => {
        expect(resolveClientIp('203.0.113.5', '198.51.100.8', false)).toBe('203.0.113.5');
    });
    it('accepts a single validated IPv4 or IPv6 from the configured reverse proxy', () => {
        expect(resolveClientIp('172.18.0.1', '198.51.100.8', true)).toBe('198.51.100.8');
        expect(resolveClientIp('172.18.0.1', '2001:db8::5', true)).toBe('2001:db8::5');
        expect(resolveClientIp('172.18.0.1', 'bad, 198.51.100.8', true)).toBe('172.18.0.1');
        expect(resolveClientIp(undefined, undefined, false)).toBeUndefined();
    });
});
