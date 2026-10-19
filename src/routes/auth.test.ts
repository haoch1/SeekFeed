import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { authRoutes } from './auth';
import { AuthService } from '../services/auth';
import { DatabaseService } from '../services/database';
import { SessionService } from '../services/session';

let app: Hono;
let db: DatabaseService;
let sessions: SessionService;
let sessionId: string;

beforeEach(() => {
    const sqlite = new Database(':memory:');
    for (const name of ['001_initial', '002_add_rss_config', '003_add_telegram_mode', '004_subscription_controls']) {
        sqlite.exec(readFileSync(new URL(`../database/migrations/${name}.sql`, import.meta.url), 'utf8'));
    }
    db = new DatabaseService(sqlite);
    db.createBaseConfig({ username: 'tester', password: 'unused-test-hash', chat_id: '', stop_push: 0, only_title: 0 });
    sessions = new SessionService(db);
    sessionId = sessions.createSession(1, 'tester', '127.0.0.1', 'auth-regression-test').sessionId;
    app = new Hono();
    app.use('*', async (c: any, next) => {
        c.set('dbService', db);
        c.set('authService', new AuthService(db));
        await next();
    });
    app.route('/auth', authRoutes);
});

afterEach(() => db.close());

describe('session management authorization', () => {
    it('rejects anonymous and forged session-list requests without exposing active credentials', async () => {
        for (const headers of [{}, { Authorization: 'Bearer invalid-session' }]) {
            const response = await app.request('/auth/sessions', { headers });
            expect(response.status).toBe(401);
            expect(await response.text()).not.toContain(sessionId);
        }
    });

    it('returns authenticated session metadata without reusable session IDs', async () => {
        const response = await app.request('/auth/sessions', { headers: { Authorization: `Bearer ${sessionId}` } });
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        const body = await response.json();
        expect(body.data).toHaveLength(1);
        expect(body.data[0].current).toBe(true);
        expect(JSON.stringify(body)).not.toContain(sessionId);
    });

    it('prevents anonymous logout-all from invalidating the administrator session', async () => {
        const response = await app.request('/auth/logout-all', { method: 'POST' });
        expect(response.status).toBe(401);
        expect(sessions.verifySession(sessionId).valid).toBe(true);
    });

    it('allows the administrator to revoke every session', async () => {
        const second = sessions.createSession(1, 'tester').sessionId;
        const response = await app.request('/auth/logout-all', {
            method: 'POST', headers: { Authorization: `Bearer ${sessionId}` },
        });
        expect(response.status).toBe(200);
        expect((await response.json()).count).toBe(2);
        expect(sessions.verifySession(sessionId).valid).toBe(false);
        expect(sessions.verifySession(second).valid).toBe(false);
    });
});
