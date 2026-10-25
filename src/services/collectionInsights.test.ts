import { afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { CollectionInsights } from './collectionInsights';
import { DatabaseService } from './database';
import { RSSService } from './rss';
import { MatcherService } from './matcher';
import { TelegramPushService } from './telegram/push';
import { HotService } from './hot';
import { loadEnvConfig } from '../config/env';
import type { ParsedPost } from '../types';

let sqlite: Database, db: DatabaseService, insights: CollectionInsights;
const now = new Date('2026-10-22T06:00:00.000Z');
const post = (id: number, title = 'DMIT 补货'): ParsedPost => ({ post_id: id, title, memo: '原始摘要', creator: 'Alice', category: 'info', pub_date: now.toISOString() });
beforeAll(async () => { await loadEnvConfig(); });
beforeEach(() => {
    sqlite = new Database(':memory:');
    for (const file of ['001_initial', '002_add_rss_config', '003_add_telegram_mode', '004_subscription_controls', '005_account_preferences', '006_hot_ranking', '007_hot_samples', '008_hot_collector_cooldown', '010_dismissed_matches', '011_forum_author_links', '012_collection_insights', '016_hot_browser_collection', '017_hot_collector_control', '015_remove_post_history']) {
        sqlite.exec(readFileSync(new URL(`../database/migrations/${file}.sql`, import.meta.url), 'utf8'));
    }
    db = new DatabaseService(sqlite); insights = new CollectionInsights(sqlite);
    db.createBaseConfig({ username: 'tester', password: 'hash', bot_token: '123456:TEST_ONLY', chat_id: '123', stop_push: 0, only_title: 0 });
});
afterEach(() => db.close());

describe('collection observations and delivery invariants', () => {
    it('removes retired analysis metadata idempotently while preserving forum data and subscriptions', () => {
        const rule = db.createKeywordSub({ keyword1: 'DMIT' });
        insights.sync([post(1)], true);
        insights.record({ source: 'rss', startedAt: now.toISOString(), durationMs: 20, status: 'success', received: 1 });
        const tables = ['trade_annotations', 'trade_label_events', 'trade_provider_aliases', 'trade_providers'];
        for (const table of tables) sqlite.exec(`CREATE TABLE ${table}(value TEXT); INSERT INTO ${table} VALUES('legacy label')`);
        const retained = ['base_config', 'keywords_sub', 'posts', 'collection_runs'];
        const before = retained.map(table => sqlite.query(`SELECT * FROM ${table}`).all());
        const removal = readFileSync(new URL('../database/migrations/014_remove_trade_analysis.sql', import.meta.url), 'utf8');
        sqlite.exec(removal);
        sqlite.exec(removal);
        expect(sqlite.query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'trade_%'").all()).toEqual([]);
        expect(retained.map(table => sqlite.query(`SELECT * FROM ${table}`).all())).toEqual(before);
        expect(db.getAllKeywordSubs()[0].id).toBe(rule.id);
        expect(db.getPostsWithPagination(1, 10).posts[0]).not.toHaveProperty('tradeInfo');
    });
    it('updates current content atomically without historical writes, preserves dates and ignores duplicate entries', () => {
        expect(insights.sync([post(1), post(1)], true)).toEqual({ new: 1, updated: 0, skipped: 1 });
        const original = db.getPostByPostId(1)!;
        expect(insights.sync([{ ...post(1), pub_date: '2026-10-22T07:00:00Z' }], true).updated).toBe(0);
        for (let i = 0; i < 25; i++) insights.sync([post(1, `DMIT 修订 ${i}`)], true);
        expect(db.getPostByPostId(1)?.pub_date).toBe(original.pub_date);
        expect(db.getPostByPostId(1)?.created_at).toBe(original.created_at);
        expect(db.getPostByPostId(1)?.title).toBe('DMIT 修订 24');
        expect(sqlite.query("SELECT name FROM sqlite_master WHERE name IN ('post_revisions','post_observations','hot_metric_hourly')").all()).toEqual([]);
    });
    it('never requeues sent or dismissed records, but rechecks newly matching edited posts with the exact matcher', async () => {
        const sub = db.createKeywordSub({ keyword1: 'DMIT', keyword2: '补货' });
        insights.sync([post(1), post(2), post(3, '其他')], true);
        db.updatePostPushStatus(1, 3, sub.id, now.toISOString());
        db.updatePostPushStatus(2, 1, sub.id);
        db.dismissMatchedPost(2);
        db.updatePostPushStatus(3, 2);
        insights.sync([post(1, 'DMIT 补货更新'), post(2, 'DMIT 补货更新'), post(3, 'dmit 补货')], true);
        expect(db.getPostByPostId(1)).toMatchObject({ push_status: 3, push_date: now.toISOString(), sub_id: sub.id });
        expect(db.getPostByPostId(2)).toMatchObject({ push_status: 1, match_dismissed: 1 });
        expect(db.getUnpushedPosts().map(p => p.post_id)).toEqual([3]);
        expect(new MatcherService(db).checkPostMatches({ ...post(3, 'DMTI 补货'), push_status: 0 })).toHaveLength(0);
        db.updateBaseConfig({ stop_push: 1 });
        await new MatcherService(db).processUnpushedPosts();
        expect(db.getPostByPostId(3)).toMatchObject({ push_status: 1, sub_id: sub.id });
    });
    it('rejects stale sent copies and overlapping sends before calling Telegram', async () => {
        const sub = db.createKeywordSub({ keyword1: 'DMIT' });
        insights.sync([post(1)], true); db.updatePostPushStatus(1, 1, sub.id);
        const stale = db.getPostByPostId(1)!;
        const service = new TelegramPushService(db, '123456:TEST_ONLY');
        let release!: (value: boolean) => void;
        const send = spyOn(service, 'sendMessage').mockImplementation(() => new Promise(resolve => { release = resolve; }));
        try {
            const first = service.pushPost(stale, sub);
            expect(await service.pushPost(stale, sub)).toBe(false);
            release(true); expect(await first).toBe(true);
            expect(await service.pushPost(stale, sub)).toBe(false);
            expect(send).toHaveBeenCalledTimes(1);
        } finally { send.mockRestore(); }
    });
    it('uses safe RSS dates, records partial runs, and synchronizes edits without an additional post', async () => {
        const rss = new RSSService(db);
        const item = { title: 'DMIT', link: 'https://www.nodeseek.com/post-1-1', pubDate: new Date().toISOString(), creator: 'Alice', category: 'info', contentSnippet: '摘要', content: '', guid: '' };
        const fetch = spyOn(rss, 'fetchAndParseRSS').mockResolvedValue([item, { ...item, link: 'https://www.nodeseek.com/post-2-1', pubDate: 'invalid' }]);
        try {
            expect(await rss.processNewRSSData()).toMatchObject({ new: 1, updated: 0 });
            expect(db.getPostByPostId(2)).toBeNull();
            fetch.mockResolvedValue([{ ...item, title: 'DMIT 更新' }]);
            expect(await rss.processNewRSSData()).toMatchObject({ new: 0, updated: 1 });
            expect(insights.quality().recent).toHaveLength(2);
            expect(insights.quality().recent[1]).toMatchObject({ status: 'partial', invalid: 1 });
        } finally { fetch.mockRestore(); }
    });
    it('rate limits persistent backfill, checks exact OP identity and keeps mismatched data unlinked', () => {
        insights.sync([post(1), post(2)], false);
        const chosen = insights.nextAuthor(now)!;
        expect(chosen).toBe(2);
        expect(insights.nextAuthor(new Date(now.getTime() + 60000))).toBeUndefined();
        expect(insights.saveAuthor(chosen, 'alice', 42, now)).toBe(false);
        expect(insights.saveAuthor(chosen, 'Alice', -1, now)).toBe(false);
        expect(insights.saveAuthor(chosen, 'Alice', 42, now)).toBe(true);
        expect(db.getPostsWithPagination(1, 10).posts.map(p => p.authorId)).toEqual([42, 42]);
        expect(insights.nextAuthor(new Date(now.getTime() + 8 * 86400000))).toBeUndefined();
    });
    it('permits at most one historical author lookup every thirty minutes while retaining exact-name retry suppression', () => {
        insights.sync([{ ...post(1), creator: 'Alice' }, { ...post(2), creator: 'Bob' }, { ...post(3), creator: 'Carol' }], false);
        expect(insights.nextAuthor(now)).toBe(3);
        expect(insights.nextAuthor(new Date(now.getTime() + 1799999))).toBeUndefined();
        expect(insights.nextAuthor(new Date(now.getTime() + 1800000))).toBe(2);
        expect(insights.nextAuthor(new Date(now.getTime() + 1800001))).toBeUndefined();
    });
    it('never stores raw error messages or secrets in diagnostic codes', () => {
        insights.record({ source: 'rss', startedAt: new Date().toISOString(), durationMs: 10, status: 'failed', errorCode: 'https://user:secret@example.com' });
        expect(JSON.stringify(insights.quality())).not.toContain('secret');
    });
    it('keeps the valid list batch but shares detail-page rate limits with the collector', async () => {
        insights.sync([post(1)], false, new Date());
        const service = new HotService(sqlite, async (_full, candidate) => {
            expect(candidate).toBe(1);
            return { posts: [{ postId: 1, title: 'DMIT', author: 'Alice', category: 'info', categoryLabel: '情报', views: 10, replies: 1,
                lastActiveAt: new Date().toISOString(), pinned: false }], pages: 2, collectedAt: new Date().toISOString(),
                identity: null, identityError: { error: 'http_429', retryAfterSeconds: 1800 } };
        });
        expect(await service.refresh()).toBe(true);
        const state = sqlite.query('SELECT * FROM hot_collector_state').get() as any;
        expect(Date.parse(state.next_attempt_at) - Date.now()).toBeGreaterThanOrEqual(1799000);
        const backfill = sqlite.query('SELECT next_attempt_at FROM author_backfill_state').get() as any;
        expect(Date.parse(backfill.next_attempt_at) - Date.now()).toBeGreaterThanOrEqual(6 * 3600000 - 1000);
        expect(sqlite.query('SELECT COUNT(*) AS count FROM hot_posts').get()).toEqual({ count: 1 });
        expect(insights.quality().recent[0]).toMatchObject({ source: 'identity', status: 'failed', http_status: 429 });
        expect(await service.refresh()).toBe(false);
    });
    it('rolls back the content batch if a write fails', () => {
        insights.sync([post(1)], false);
        sqlite.exec("CREATE TRIGGER reject_update BEFORE UPDATE ON posts BEGIN SELECT RAISE(ABORT,'test write failure'); END");
        expect(() => insights.sync([post(2), post(1, 'changed')], true)).toThrow();
        expect(db.getPostByPostId(2)).toBeNull();
        expect(db.getPostByPostId(1)?.title).toBe('DMIT 补货');
    });
});
