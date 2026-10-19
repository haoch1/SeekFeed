import type { Context } from 'hono';
import { getConnInfo } from 'hono/bun';
import { isIP } from 'node:net';

export function resolveClientIp(peer: string | undefined, realIp: string | undefined, trustProxy: boolean): string | undefined {
    // The reverse proxy must overwrite X-Real-IP; never accept arbitrary X-Forwarded-For chains.
    const candidate = trustProxy && realIp ? realIp.trim() : peer;
    return candidate && isIP(candidate) ? candidate : peer && isIP(peer) ? peer : undefined;
}

export function getClientInfo(c: Context): { ipAddress?: string; userAgent?: string } {
    let peer: string | undefined;
    try { peer = getConnInfo(c).remote.address; } catch { /* Request-only tests have no socket. */ }
    return {
        ipAddress: resolveClientIp(peer, c.req.header('x-real-ip'), process.env.TRUST_PROXY === 'true'),
        userAgent: c.req.header('user-agent'),
    };
}
