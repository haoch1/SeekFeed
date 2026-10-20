import { getClientInfo } from '../utils/clientInfo';
import { createMiddleware } from 'hono/factory';
import type { ContextVariables } from '../types';

export const requireSession = createMiddleware<{ Variables: ContextVariables }>(async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('Vary', 'Authorization');
    if (c.get('sessionData')) return next();
    const sessionId = c.req.header('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if (!sessionId) return c.json({ success: false, message: '请先登录' }, 401);
    const { ipAddress } = getClientInfo(c);
    const verification = await c.get('authService').verifySession(sessionId, ipAddress);
    if (!verification.valid || !verification.sessionData) {
        return c.json({ success: false, message: 'Session无效或已过期' }, 401);
    }
    c.set('sessionData', verification.sessionData);
    await next();
});

// Public reads may carry a real session, but a supplied credential is never trusted implicitly.
export const optionalSession = createMiddleware<{ Variables: ContextVariables }>(async (c, next) => {
    c.header('Cache-Control', 'private, no-store');
    c.header('Vary', 'Authorization');
    if (c.req.header('Authorization') !== undefined) return requireSession(c, next);
    await next();
});
