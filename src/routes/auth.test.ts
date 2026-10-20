import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { authRoutes } from './auth';
import { telegramRoutes } from './telegram';
import { telegramPushRoutes } from './telegramPush';
import { telegramWebhookRoutes } from './telegramWebhook';
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

const avatar = 'data:image/png;base64,' + readFileSync(new URL('../../public/icons/seekfeed-192.png', import.meta.url)).toString('base64');

beforeEach(() => {
    const sqlite = new Database(':memory:');
    for (const name of ['001_initial', '002_add_rss_config', '003_add_telegram_mode', '004_subscription_controls', '005_account_preferences', '006_hot_ranking', '007_hot_samples', '008_hot_collector_cooldown', '009_account_avatar']) {
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

describe('account avatar', () => {
    const headers = () => ({ Authorization: `Bearer ${sessionId}`, 'Content-Type': 'application/json' });
    const upload = (value: unknown, requestHeaders = headers()) => app.request('/auth/avatar', { method: 'PUT', headers: requestHeaders, body: JSON.stringify({ avatar: value }) });

    it('requires a valid session for avatar reads and mutations', async () => {
        for (const requestHeaders of [{ 'Content-Type': 'application/json' }, { ...headers(), Authorization: 'Bearer forged' }]) {
            expect((await upload(avatar, requestHeaders)).status).toBe(401);
            expect((await app.request('/auth/avatar', { method: 'DELETE', headers: requestHeaders })).status).toBe(401);
            expect((await app.request('/auth/account', { headers: requestHeaders })).status).toBe(401);
        }
        db.db.query('UPDATE sessions SET expires_at = ?').run(new Date(Date.now() - 1000).toISOString());
        expect((await upload(avatar)).status).toBe(401);
        expect((await app.request('/auth/avatar', { method: 'DELETE', headers: headers() })).status).toBe(401);
        expect(db.getBaseConfig()!.avatar).toBeNull();
    });

    it('persists a bounded PNG, invalidates cached profile data and preserves sessions and password', async () => {
        expect(db.getBaseConfig()!.avatar).toBeNull();
        const response = await upload(avatar);
        expect(response.status).toBe(200);
        expect((await response.json()).data.avatar).toBe(avatar);
        const profile = await app.request('/auth/account', { headers: headers() });
        expect(profile.headers.get('Cache-Control')).toContain('no-store');
        expect((await profile.json()).data.avatar).toBe(avatar);
        expect(db.getBaseConfig()!.avatar).toBe(avatar);
        expect(db.getBaseConfig()!.password).toBe('unused-test-hash');
        expect(sessions.verifySession(sessionId).valid).toBe(true);
        const publicPage = await (await app.request('/hot')).text();
        expect(publicPage).not.toContain(avatar);
        expect((await app.request('/api/config', { method: 'PUT', headers: headers(), body: JSON.stringify({ avatar }) })).status).toBe(400);
    });

    it('returns the avatar after a fresh login and restores the default independently', async () => {
        db.updateBaseConfig({ password: await bcrypt.hash('AvatarTest123!', 4) });
        await upload(avatar);
        const login = await new AuthService(db).login({ username: 'tester', password: 'AvatarTest123!' });
        expect(login.success).toBe(true);
        expect(login.user!.avatar).toBe(avatar);
        const response = await app.request('/auth/avatar', { method: 'DELETE', headers: headers() });
        expect(response.status).toBe(200);
        expect((await response.json()).data.avatar).toBeNull();
        expect(db.getBaseConfig()!.avatar).toBeNull();
        expect(sessions.verifySession(sessionId).valid).toBe(true);
        expect(sessions.verifySession(login.sessionId!).valid).toBe(true);
    });

    it('rejects remote URLs, SVG, oversized dimensions, malformed data and animation without replacing the saved avatar', async () => {
        await upload(avatar);
        const raw = Buffer.from(avatar.split(',')[1], 'base64');
        const wide = Buffer.from(raw); wide.writeUInt32BE(257, 16);
        const animation = Buffer.concat([raw.subarray(0, 33), Buffer.from([0, 0, 0, 0, 97, 99, 84, 76, 0, 0, 0, 0]), raw.subarray(33)]);
        for (const value of [null, 12, 'https://example.com/avatar.png', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,dGV4dA==', avatar + '!', 'data:image/png;base64,' + wide.toString('base64'), 'data:image/png;base64,' + animation.toString('base64'), 'data:image/png;base64,' + raw.subarray(0, -12).toString('base64')]) {
            expect((await upload(value)).status).toBe(400);
            expect(db.getBaseConfig()!.avatar).toBe(avatar);
        }
        expect((await upload('x'.repeat(413000))).status).toBe(413);
        expect(db.getBaseConfig()!.avatar).toBe(avatar);
    });
});

describe('account settings and session expiry', () => {
    const headers = () => ({ Authorization: `Bearer ${sessionId}`, 'Content-Type': 'application/json' });

    it('publishes only forum fields to guests, including after an authenticated cache read', async () => {
        const sub = db.createKeywordSub({ keyword1: 'private-rule-example', creator: 'secret-author', exclude_keywords: 'secret-exclusion' });
        db.createPost({ post_id: 101, title: 'Public forum title', memo: 'Public excerpt', category: 'tech', creator: 'public-author', pub_date: new Date().toISOString(), push_status: 3, sub_id: sub.id });
        const privateRead = await app.request('/api/posts', { headers: headers() });
        const privatePost = (await privateRead.json()).data.posts[0];
        expect(privatePost.sub_keyword1).toBe('private-rule-example');
        expect(privatePost.push_status).toBe(3);
        expect(privateRead.headers.get('Cache-Control')).toContain('no-store');
        const publicRead = await app.request('/api/posts');
        const body = await publicRead.json();
        expect(publicRead.status).toBe(200);
        expect(Object.keys(body.data.posts[0]).sort()).toEqual(['category', 'creator', 'memo', 'post_id', 'pub_date', 'title']);
        expect(body.data.total).toBe(1);
        expect(JSON.stringify(body)).not.toMatch(/private-rule-example|secret-author|secret-exclusion|sub_id|push_status|push_date/);
        expect(publicRead.headers.get('Cache-Control')).toContain('no-store');
        expect(publicRead.headers.get('Vary')).toContain('Authorization');
        expect((await (await app.request('/api/posts?subId=' + sub.id, { headers: headers() })).json()).data.total).toBe(1);
    });

    it('rejects private guest filters and invalid credentials on public and private APIs', async () => {
        for (const query of ['pushStatus=3', 'pushStatusIn=1,3', 'pushStatusNot=2', 'subId=1', 'pushStatusIn=']) {
            expect((await app.request('/api/posts?' + query)).status).toBe(401);
        }
        const paths = ['/api/posts', '/api/hot', '/api/stats/overview', '/api/stats/analytics', '/api/stats/subscription-ranking', '/api/config', '/api/subscriptions'];
        for (const path of paths) {
            expect((await app.request(path, { headers: { Authorization: 'Bearer forged' } })).status).toBe(401);
        }
        db.db.query('UPDATE sessions SET expires_at = ? WHERE session_id = ?').run(new Date(Date.now() - 1000).toISOString(), sessionId);
        for (const path of paths) expect((await app.request(path, { headers: headers() })).status).toBe(401);
    });

    it('keeps fuzzy search public fields and private match filters isolated', async () => {
        const sub = db.createKeywordSub({ keyword1: 'vmiss' });
        for (const [id, status] of [[101, 1], [102, 2], [103, 3]]) {
            db.createPost({ post_id: id, title: 'VMISS 补货', memo: '', category: 'trade', creator: 'alice', pub_date: new Date().toISOString(), push_status: status, sub_id: status === 2 ? undefined : sub.id });
        }
        const query = '/api/posts?search=vmsis&searchMode=fuzzy';
        const publicData = (await (await app.request(query)).json()).data;
        expect(publicData.total).toBe(3);
        expect(Object.keys(publicData.posts[0]).sort()).toEqual(['category', 'creator', 'memo', 'post_id', 'pub_date', 'title']);
        expect((await app.request(query + '&pushStatusIn=1,3')).status).toBe(401);
        const matched = (await (await app.request(query + '&pushStatusIn=1,3', { headers: headers() })).json()).data;
        expect(matched.total).toBe(2);
        expect(matched.posts.every((post: any) => [1, 3].includes(post.push_status))).toBe(true);
        expect((await app.request('/api/posts?searchMode=invalid')).status).toBe(400);
    });

    it('keeps private delivery aggregates out of every public analytics level', async () => {
        const sub = db.createKeywordSub({ keyword1: 'private-rule-example' });
        db.createPost({ post_id: 101, title: 'Public forum title', memo: '', category: 'tech', creator: 'public-author', pub_date: new Date().toISOString(), push_status: 3, sub_id: sub.id });
        const privateData = (await (await app.request('/api/stats/analytics', { headers: headers() })).json()).data;
        expect(privateData.totals.matched).toBe(1);
        expect(privateData.subscriptions.total).toBe(1);
        const publicData = (await (await app.request('/api/stats/analytics')).json()).data;
        expect(publicData.totals).toEqual({ posts: 1, authors: 1 });
        expect(publicData.categories[0]).toEqual({ category: 'tech', count: 1, authors: 1 });
        expect(publicData.authors[0]).toEqual({ creator: 'public-author', count: 1 });
        expect(Object.keys(publicData.trend[0]).sort()).toEqual(['count', 'time']);
        expect(JSON.stringify(publicData)).not.toMatch(/matched|pushed|pending|unprocessed|subscriptions|delivery|ranking|ruleStats|private-rule-example/);
        const overview = (await (await app.request('/api/stats/overview')).json()).data;
        expect(Object.keys(overview).sort()).toEqual(['last_update', 'today_posts', 'total_posts']);
    });

    it('requires a valid session for every subscription operation', async () => {
        const sub = db.createKeywordSub({ keyword1: 'private-rule-example' });
        for (const authorization of [undefined, 'Bearer forged']) {
            for (const [method, path] of [['GET', '/api/subscriptions'], ['POST', '/api/subscriptions'], ['PUT', '/api/subscriptions/' + sub.id], ['DELETE', '/api/subscriptions/' + sub.id]]) {
                const response = await app.request(path, { method, headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) }, ...(method === 'GET' ? {} : { body: JSON.stringify({ keyword1: 'changed' }) }) });
                expect(response.status).toBe(401);
                expect(await response.text()).not.toContain('private-rule-example');
            }
        }
        expect(db.getKeywordSubById(sub.id!)!.keyword1).toBe('private-rule-example');
        const response = await app.request('/api/subscriptions', { headers: headers() });
        expect(response.status).toBe(200);
        expect(await response.text()).toContain('private-rule-example');
    });

    it('protects Telegram management even when its routers are mounted independently', async () => {
        const isolated = new Hono();
        isolated.use('*', async (c: any, next) => { c.set('authService', new AuthService(db)); c.set('dbService', db); await next(); });
        isolated.route('/push', telegramPushRoutes);
        isolated.route('/webhook', telegramWebhookRoutes);
        for (const [path, method] of [['/push/bot-info', 'GET'], ['/push/send-message', 'POST'], ['/webhook/status', 'GET'], ['/webhook/disable', 'POST']]) {
            for (const authorization of [undefined, 'Bearer forged']) {
                expect((await isolated.request(path, { method, headers: authorization ? { Authorization: authorization } : {} })).status).toBe(401);
            }
        }
    });

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
