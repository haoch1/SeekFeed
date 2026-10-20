import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { authRoutes } from './auth';
import { telegramRoutes } from './telegram';
import { AuthService } from '../services/auth';
import { DatabaseService } from '../services/database';
import { SessionService, sessionManagementId } from '../services/session';
import * as bcrypt from 'bcryptjs';
import { apiRoutes } from './api';
import { pageRoutes } from './pages';

let app: Hono;
let db: DatabaseService;
let sessions: SessionService;
let sessionId: string;

beforeEach(() => {
    const sqlite = new Database(':memory:');
    for (const name of ['001_initial', '002_add_rss_config', '003_add_telegram_mode', '004_subscription_controls', '005_account_preferences', '006_hot_ranking', '007_hot_samples', '008_hot_collector_cooldown']) {
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
    app.route('/telegram', telegramRoutes);
    app.route('/api', apiRoutes);
    app.route('/', pageRoutes);
});

describe('account settings and session expiry', () => {
    const headers = () => ({ Authorization: `Bearer ${sessionId}`, 'Content-Type': 'application/json' });

    it('validates keyword analysis inputs and exposes only aggregates, independently of private rules', async () => {
        db.createKeywordSub({ keyword1: 'private-rule-example' });
        const response = await app.request('/api/stats/keywords?q=DMIT&compare1=dmit&compare2=香港&date=2026-01-02&offset=480');
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data.series.map((row: any) => row.term)).toEqual(['DMIT', '香港']);
        expect(body.data.totalPosts).toBe(0);
        expect(JSON.stringify(body)).not.toContain('private-rule-example');
        expect(JSON.stringify(body)).not.toContain('unused-test-hash');
        const valid = 'q=dmit&date=2026-01-02';
        for (const query of ['q=&date=2026-01-02', 'q=hi&date=2026-02-30', 'q=hi&date=2026-13-01', 'q=hi&date=2099-01-01', valid + '&offset=840.1', valid + '&scope=full', valid + '&offset=-841', 'date=2026-01-02&q=' + 'x'.repeat(61), valid + '&compare1=' + 'x'.repeat(61)]) {
            expect((await app.request('/api/stats/keywords?' + query)).status).toBe(400);
        }
    });

    it('edits rule fields in place, permits clearing filters and preserves paused status and post history', async () => {
        const sub = db.createKeywordSub({ keyword1: 'old', keyword2: 'filter', creator: 'alice', category: 'tech', exclude_keywords: 'noise', enabled: 0 });
        db.createPost({ post_id: 101, title: 'old post', memo: '', category: 'tech', creator: 'alice', pub_date: '2026-01-02T01:00:00Z', push_status: 3, sub_id: sub.id });
        const replacement = { keyword1: 'new', keyword2: '', keyword3: '', creator: '', category: '', exclude_keywords: '' };
        const path = '/api/subscriptions/' + sub.id;
        expect((await app.request(path, { method: 'PUT', body: JSON.stringify(replacement) })).status).toBe(401);
        const response = await app.request(path, { method: 'PUT', headers: headers(), body: JSON.stringify(replacement) });
        expect(response.status).toBe(200);
        expect((await response.json()).data).toMatchObject({ id: sub.id, enabled: 0, keyword1: 'new', keyword2: null, creator: null, category: null, exclude_keywords: '' });
        expect(db.getAllKeywordSubs()).toHaveLength(1);
        expect(db.getRecentPosts(1)[0]).toMatchObject({ sub_id: sub.id, push_status: 3 });
        const empty = await app.request(path, { method: 'PUT', headers: headers(), body: JSON.stringify({ keyword1: '  ' }) });
        expect(empty.status).toBe(400);
        expect(db.getKeywordSubById(sub.id!)!.keyword1).toBe('new');
        expect((await app.request('/api/subscriptions/9999', { method: 'PUT', headers: headers(), body: JSON.stringify(replacement) })).status).toBe(404);
        expect((await app.request(path, { method: 'PUT', headers: headers(), body: JSON.stringify({ enabled: 1 }) })).status).toBe(200);
        expect(db.getKeywordSubById(sub.id!)!.enabled).toBe(1);
    });

    it('opens the hot ranking as home while preserving first-time initialization', async () => {
        const home = await app.request('/');
        expect(home.status).toBe(302);
        expect(home.headers.get('Location')).toBe('/hot');
        expect((await app.request('/posts')).status).toBe(200);
        const fresh = new Hono();
        fresh.use('*', async (c: any, next) => {
            c.set('authService', { checkInitialization: () => ({ initialized: false }) });
            await next();
        });
        fresh.route('/', pageRoutes);
        expect((await fresh.request('/')).headers.get('Location')).toBe('/init');
    });

    it('publishes safe hot ranking data while protecting collection and rejecting invalid filters', async () => {
        expect((await app.request('/api/hot')).status).toBe(200);
        const body = await (await app.request('/api/hot')).json();
        expect(body.data.posts).toEqual([]);
        expect(body.data.limit).toBe(30);
        for (const limit of [30, 50, 100]) {
            const response = await app.request('/api/hot?limit=' + limit);
            expect(response.status).toBe(200);
            expect((await response.json()).data.limit).toBe(limit);
        }
        expect(JSON.stringify(body)).not.toContain('unused-test-hash');
        for (const query of ['period=month', 'sort=unknown', 'category=%3Cscript%3E', 'limit=10', 'limit=31', 'limit=1000', 'limit=-30', 'limit=NaN', 'limit=30.5']) expect((await app.request('/api/hot?' + query)).status).toBe(400);
        expect((await app.request('/api/hot/refresh', {method:'POST'})).status).toBe(401);
        expect((await app.request('/api/hot/refresh', {method:'POST',headers:{Authorization:'Bearer forged'}})).status).toBe(401);
    });

    it('keeps analytics aggregates public and subscription identifiers and keywords authenticated', async () => {
        const sub = db.createKeywordSub({ keyword1: 'private-rule-example' });
        const response = await app.request('/api/stats/analytics?days=7&offset=480');
        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.data.ranking).toBeUndefined();
        expect(data.data.ruleStats).toBeUndefined();
        expect(JSON.stringify(data)).not.toContain('private-rule-example');
        expect((await app.request('/api/stats/subscription-ranking?days=7&offset=480')).status).toBe(401);
        const privateResponse = await app.request('/api/stats/subscription-ranking?days=7&offset=480', { headers: headers() });
        expect((await privateResponse.json()).data.ranking[0].id).toBe(sub.id);
        const scoped = await app.request('/api/stats/analytics?days=7&offset=480&category=%20tech%20');
        const scopedData = (await scoped.json()).data;
        expect(scoped.status).toBe(200);
        expect(scopedData.period.category).toBe('tech');
        expect(scopedData.ranking).toBeUndefined();
        expect(scopedData.availableCategories).toBeArray();
        for (const query of ['days=8', 'days=NaN', 'offset=9999', 'offset=1.5', 'category=' + 'x'.repeat(101)]) {
            expect((await app.request(`/api/stats/analytics?${query}`)).status).toBe(400);
        }
    });

    it('requires authentication for account details, credentials and preferences', async () => {
        for (const [path, method] of [['/auth/account', 'GET'], ['/auth/account', 'PUT'], ['/auth/preferences', 'PUT']]) {
            const response = await app.request(path, { method });
            expect(response.status).toBe(401);
        }
    });

    it('preserves existing sessions while applying the saved lifetime to a new login', async () => {
        const original = sessions.verifySession(sessionId).sessionData!.expiresAt;
        const response = await app.request('/auth/preferences', { method: 'PUT', headers: headers(), body: JSON.stringify({ session_expiry_hours: 1 }) });
        expect(response.status).toBe(200);
        expect(db.getBaseConfig()!.session_expiry_hours).toBe(1);
        expect(sessions.verifySession(sessionId).sessionData!.expiresAt).toBe(original);
        const next = sessions.createSession(1, 'tester');
        expect(Date.parse(next.expiresAt) - Date.now()).toBeGreaterThan(3590000);
        expect(Date.parse(next.expiresAt) - Date.now()).toBeLessThanOrEqual(3600000);
        const invalid = await app.request('/auth/preferences', { method: 'PUT', headers: headers(), body: JSON.stringify({ session_expiry_hours: 99999 }) });
        expect(invalid.status).toBe(400);
        expect(db.getBaseConfig()!.session_expiry_hours).toBe(1);
    });

    it('rejects an expired ISO timestamp on the same calendar day', () => {
        db.db.query('UPDATE sessions SET expires_at = ? WHERE session_id = ?').run(new Date(Date.now() - 60000).toISOString(), sessionId);
        expect(sessions.verifySession(sessionId).valid).toBe(false);
    });

    it('keeps the five newest active sessions without relying on optional SQLite DELETE LIMIT support', () => {
        for (let i = 0; i < 8; i++) sessions.createSession(1, 'tester');
        expect(sessions.getUserSessions(1)).toHaveLength(5);
        expect(sessions.verifySession(sessionId).valid).toBe(false);
    });

    it('prevents generic configuration updates from bypassing password verification', async () => {
        const response = await app.request('/api/config', { method: 'PUT', headers: headers(), body: JSON.stringify({ username: 'attacker', password: 'plain-text' }) });
        expect(response.status).toBe(400);
        expect(db.getBaseConfig()!.username).toBe('tester');
        expect(db.getBaseConfig()!.password).toBe('unused-test-hash');
    });

    it('verifies the old password, hashes the replacement and revokes every session', async () => {
        db.updateBaseConfig({ password: await bcrypt.hash('CurrentPass123!', 4) });
        const body = { username: 'new-admin', currentPassword: 'wrong', newPassword: 'NewPass456!' };
        const rejected = await app.request('/auth/account', { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
        expect(rejected.status).toBe(400);
        expect(db.getBaseConfig()!.username).toBe('tester');
        const other = sessions.createSession(1, 'tester').sessionId;
        const response = await app.request('/auth/account', { method: 'PUT', headers: headers(), body: JSON.stringify({ ...body, currentPassword: 'CurrentPass123!' }) });
        expect(response.status).toBe(200);
        const config = db.getBaseConfig()!;
        expect(config.username).toBe('new-admin');
        expect(config.password).not.toBe(body.newPassword);
        expect(await bcrypt.compare(body.newPassword, config.password)).toBe(true);
        expect(sessions.verifySession(sessionId).valid).toBe(false);
        expect(sessions.verifySession(other).valid).toBe(false);
        const auth = new AuthService(db);
        expect((await auth.login({ username: 'new-admin', password: 'CurrentPass123!' })).success).toBe(false);
        expect((await auth.login({ username: 'new-admin', password: 'NewPass456!' })).success).toBe(true);
    });

    it('persists Telegram mode through the real configuration API without exposing a password', async () => {
        const response = await app.request('/api/config', { method: 'PUT', headers: headers(), body: JSON.stringify({ telegram_mode: 'webhook' }) });
        expect(response.status).toBe(200);
        expect(db.getBaseConfig()!.telegram_mode).toBe('webhook');
        const read = await app.request('/api/config', { headers: headers() });
        const body = await read.json();
        expect(body.data.telegram_mode).toBe('webhook');
        expect(body.data.password).toBeUndefined();
        const invalid = await app.request('/api/config', { method: 'PUT', headers: headers(), body: JSON.stringify({ telegram_mode: 'invented' }) });
        expect(invalid.status).toBe(400);
        expect(db.getBaseConfig()!.telegram_mode).toBe('webhook');
    });
});

afterEach(() => db.close());

describe('session management authorization', () => {
    it('protects Telegram management before parsing input or accessing the bot', async () => {
        for (const [path, method] of [['set-webhook', 'POST'], ['bot-info', 'GET'], ['test-message', 'POST']]) {
            for (const headers of [{}, { Authorization: 'Bearer forged' }]) {
                const response = await app.request(`/telegram/${path}`, { method, headers });
                expect(response.status).toBe(401);
                expect(response.headers.get('Cache-Control')).toBe('no-store');
            }
        }
    });

    it('allows an authenticated administrator to access Telegram settings', async () => {
        const response = await app.request('/telegram/bot-info', {
            headers: { Authorization: `Bearer ${sessionId}` },
        });
        expect(response.status).toBe(400);
        expect((await response.json()).message).toContain('Bot Token');
    });

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
        expect(body.data[0].id).toMatch(/^[a-f0-9]{64}$/);
        expect((await app.request('/auth/account', { headers: { Authorization: `Bearer ${body.data[0].id}` } })).status).toBe(401);
        expect(JSON.stringify(body)).not.toContain(sessionId);
    });

    it('revokes just the selected device and keeps the calling session and other devices valid', async () => {
        const target = sessions.createSession(1, 'tester', '192.0.2.2', 'second-device').sessionId;
        const untouched = sessions.createSession(1, 'tester', '192.0.2.3', 'third-device').sessionId;
        const path = '/auth/sessions/' + sessionManagementId(target);
        const response = await app.request(path, { method: 'DELETE', headers: { Authorization: `Bearer ${sessionId}` } });
        expect(response.status).toBe(200);
        expect((await response.json()).data.current).toBe(false);
        expect(sessions.verifySession(target).valid).toBe(false);
        expect(sessions.verifySession(sessionId).valid).toBe(true);
        expect(sessions.verifySession(untouched).valid).toBe(true);
        expect((await app.request(path, { method: 'DELETE', headers: { Authorization: `Bearer ${sessionId}` } })).status).toBe(404);
    });

    it('rejects anonymous, forged, malformed and foreign device revocation requests', async () => {
        const foreign = sessions.createSession(2, 'tester').sessionId;
        const currentPath = '/auth/sessions/' + sessionManagementId(sessionId);
        for (const headers of [{}, { Authorization: 'Bearer forged' }]) {
            expect((await app.request(currentPath, { method: 'DELETE', headers })).status).toBe(401);
        }
        const headers = { Authorization: `Bearer ${sessionId}` };
        expect((await app.request('/auth/sessions/not-a-device', { method: 'DELETE', headers })).status).toBe(400);
        expect((await app.request('/auth/sessions/' + sessionManagementId(foreign), { method: 'DELETE', headers })).status).toBe(404);
        expect(sessions.verifySession(foreign).valid).toBe(true);
        expect(sessions.verifySession(sessionId).valid).toBe(true);
    });

    it('can exit the current device without logging out another device', async () => {
        const other = sessions.createSession(1, 'tester').sessionId;
        const response = await app.request('/auth/sessions/' + sessionManagementId(sessionId), { method: 'DELETE', headers: { Authorization: `Bearer ${sessionId}` } });
        expect(response.status).toBe(200);
        expect((await response.json()).data.current).toBe(true);
        expect(sessions.verifySession(sessionId).valid).toBe(false);
        expect(sessions.verifySession(other).valid).toBe(true);
        expect((await app.request('/auth/sessions', { headers: { Authorization: `Bearer ${sessionId}` } })).status).toBe(401);
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
