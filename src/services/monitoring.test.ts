import { afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { DatabaseService } from './database';
import { MatcherService } from './matcher';
import { SchedulerService } from './scheduler';
import { RSSService } from './rss';
import { TelegramPushService } from './telegram/push';
import type { Post } from '../types';
import { loadEnvConfig } from '../config/env';

beforeAll(async () => { await loadEnvConfig(); });

let db: DatabaseService;
const post = (id = 1, changes: Partial<Post> = {}): Post => ({
    post_id: id, title: 'DMIT 补货', memo: '服务器最新消息', creator: 'alice', category: 'info',
    push_status: 0, pub_date: new Date().toISOString(), ...changes,
});
beforeEach(() => {
    const sqlite = new Database(':memory:');
    for (const name of ['001_initial', '002_add_rss_config', '003_add_telegram_mode', '004_subscription_controls', '005_account_preferences', '010_dismissed_matches', '011_forum_author_links', '012_collection_insights']) {
        sqlite.exec(readFileSync(new URL(`../database/migrations/${name}.sql`, import.meta.url), 'utf8'));
    }
    db = new DatabaseService(sqlite);
    db.createBaseConfig({ username: 'tester', password: 'unused-test-hash', bot_token: '123456:TEST_ONLY',
        chat_id: '123', stop_push: 0, only_title: 0 });
});
afterEach(() => db.close());

describe('subscription matching', () => {
    it('uses a 30-second RSS default and preserves an explicitly configured interval', () => {
        expect(new SchedulerService(db).getStatus().rssTask.intervalSeconds).toBe(30);
        expect(new RSSService(db).getRSSConfigFromDB().intervalSeconds).toBe(30);
        db.updateBaseConfig({ rss_interval_seconds: 45 });
        expect(new SchedulerService(db).getStatus().rssTask.intervalSeconds).toBe(45);
        expect(new RSSService(db).getRSSConfigFromDB().intervalSeconds).toBe(45);
    });
    it('requires all words and applies exclusions, exact author/category filters and pause', () => {
        const sub = db.createKeywordSub({ keyword1: 'dmit', keyword2: '补货', creator: 'alice', category: 'info', exclude_keywords: '已出，求购' });
        const matcher = new MatcherService(db);
        expect(matcher.checkPostMatches(post())).toHaveLength(1);
        expect(matcher.checkPostMatches(post(1, { title: 'DMIT 补货 已出' }))).toHaveLength(0);
        expect(matcher.checkPostMatches(post(1, { memo: '求购' }))).toHaveLength(0);
        expect(matcher.checkPostMatches(post(1, { creator: 'alice2' }))).toHaveLength(0);
        expect(matcher.checkPostMatches(post(1, { title: 'DMIT' }))).toHaveLength(0);
        db.updateKeywordSub(sub.id!, { enabled: 0 });
        expect(matcher.checkPostMatches(post())).toHaveLength(0);
    });
    it('uses original case for /regex/ and honors i flags', () => {
        const sub = db.createKeywordSub({ keyword1: '/DMIT/' });
        const matcher = new MatcherService(db);
        expect(matcher.checkPostMatches(post())).toHaveLength(1);
        expect(matcher.checkPostMatches(post(1, { title: 'dmit' }))).toHaveLength(0);
        db.updateKeywordSub(sub.id!, { keyword1: '/DMIT/i' });
        expect(matcher.checkPostMatches(post(1, { title: 'dmit' }))).toHaveLength(1);
    });
    it('restricts keyword lookup to titles in only-title mode', () => {
        db.createKeywordSub({ keyword1: 'alice' });
        const matcher = new MatcherService(db);
        expect(matcher.checkPostMatches(post())).toHaveLength(1);
        db.updateBaseConfig({ only_title: 1 });
        expect(matcher.checkPostMatches(post())).toHaveLength(0);
    });
});

describe('multi-category monitoring and search', () => {
    it('limits typo tolerance to search, preserves recorded matches and computes full pagination totals', () => {
        const sub = db.createKeywordSub({ keyword1: 'vmiss' });
        db.batchCreatePosts([
            post(1, { title: 'VMISS 补货', category: 'trade', push_status: 1, sub_id: sub.id }),
            post(2, { title: 'VMISS 评测', category: 'info', push_status: 3, sub_id: sub.id }),
            post(3, { title: 'VMISS 未命中', push_status: 2 }),
            post(4, { title: '其他帖子', creator: 'vmiss', push_status: 0 }),
            post(5, { title: '无关帖子', creator: 'dmit' }),
        ]);
        const filters = { search: 'vmsis', searchMode: 'fuzzy' as const };
        expect(db.getPostsWithPagination(1, 1, { search: 'vmsis' }).total).toBe(0);
        const first = db.getPostsWithPagination(1, 1, filters);
        expect(first.total).toBe(4);
        expect(first.totalPages).toBe(4);
        const allIds = Array.from({ length: 4 }, (_, i) => db.getPostsWithPagination(i + 1, 1, filters).posts[0].post_id);
        expect(new Set(allIds).size).toBe(4);
        expect(db.getPostsWithPagination(5, 1, filters)).toMatchObject({ total: 4, totalPages: 4, posts: [] });
        expect(db.getPostsWithPagination(1, 10, { ...filters, pushStatusIn: [1, 3], subId: sub.id }).total).toBe(2);
        expect(db.getPostsWithPagination(1, 10, { ...filters, category: 'trade' }).total).toBe(1);
        const matcher = new MatcherService(db);
        expect(matcher.checkPostMatches(post(100, { title: 'vmsis 补货' }))).toHaveLength(0);
        expect(matcher.checkPostMatches(post(100, { title: 'VMISS 补货' }))).toHaveLength(1);
        expect(db.getKeywordAnalytics(['vmsis'], new Date().toISOString().slice(0, 10), 0, 'title').series[0].total).toBe(0);
        expect(db.getPostByPostId(3)?.push_status).toBe(2);
    });
    it('matches any selected board while requiring all keywords and respecting exclusions', () => {
        db.createKeywordSub({ keyword1: 'DMIT', keyword2: '补货', category: 'info,trade', exclude_keywords: '已出' });
        const matcher = new MatcherService(db);
        expect(matcher.checkPostMatches(post(1, { category: 'info' }))).toHaveLength(1);
        expect(matcher.checkPostMatches(post(2, { category: 'trade' }))).toHaveLength(1);
        expect(matcher.checkPostMatches(post(3, { category: 'tech' }))).toHaveLength(0);
        expect(matcher.checkPostMatches(post(4, { category: 'trade', title: 'DMIT' }))).toHaveLength(0);
        expect(matcher.checkPostMatches(post(5, { category: 'trade', title: 'DMIT 补货 已出' }))).toHaveLength(0);
    });
    it('filters the union of exact board names with accurate pagination totals', () => {
        db.batchCreatePosts([post(1, { category: 'info' }), post(2, { category: 'trade' }), post(3, { category: 'tech' }), post(4, { category: 'information' })]);
        const result = db.getPostsWithPagination(1, 1, { category: 'info,trade', search: 'DMIT' });
        expect(result.total).toBe(2);
        expect(result.totalPages).toBe(2);
        expect(db.getPostsWithPagination(2, 1, { category: 'info,trade' }).posts).toHaveLength(1);
        expect(db.getPostsWithPagination(1, 10, { category: 'info' }).total).toBe(1);
    });
});

describe('notification queue', () => {
    it('excludes dismissed matches from retries and rejects a stale queued copy before sending', async () => {
        const sub = db.createKeywordSub({ keyword1: 'DMIT' });
        db.batchCreatePosts([post(1, { push_status: 1, sub_id: sub.id }), post(2)]);
        const stale = db.getPostByPostId(1)!;
        expect(db.dismissMatchedPost(1)).toBe(true);
        expect(db.getUnpushedPosts().map(item => item.post_id)).toEqual([2]);
        const telegram = new TelegramPushService(db, '123456:TEST_ONLY');
        const send = spyOn(telegram, 'sendMessage').mockResolvedValue(true);
        try {
            expect(await telegram.pushPost(stale, sub)).toBe(false);
            expect(send).not.toHaveBeenCalled();
            expect((await new MatcherService(db, telegram).processUnpushedPosts()).pushed).toBe(1);
            expect(send).toHaveBeenCalledTimes(1);
            expect(db.getPostByPostId(1)).toMatchObject({ push_status: 1, match_dismissed: 1 });
            expect(db.getPostByPostId(2)?.push_status).toBe(3);
        } finally { send.mockRestore(); }
    });

    it('retains a dismissal across repeated ingestion, rematching, and changed subscriptions', () => {
        const sub = db.createKeywordSub({ keyword1: 'DMIT' });
        db.createPost(post(1, { push_status: 1, sub_id: sub.id }));
        expect(db.dismissMatchedPost(1)).toBe(true);
        expect(db.batchCreatePosts([post(1)])).toBe(0);
        db.updateKeywordSub(sub.id!, { keyword1: '补货' });
        db.updatePostPushStatus(1, 1, sub.id);
        expect(db.getPostsWithPagination(1, 10, { pushStatusIn: [1, 3] }).total).toBe(0);
        expect(db.getUnpushedPosts()).toHaveLength(0);
        expect(db.getPostsWithPagination(1, 10).total).toBe(1);
    });

    it('rotates retry batches so permanent failures do not block later posts', async () => {
        db.createKeywordSub({ keyword1: 'DMIT' });
        db.batchCreatePosts(Array.from({ length: 12 }, (_, i) => post(i + 1)));
        const telegram = new TelegramPushService(db, '123456:TEST_ONLY');
        const push = spyOn(telegram, 'pushPost').mockResolvedValue(false);
        await new MatcherService(db, telegram).processUnpushedPosts();
        await new MatcherService(db, telegram).processUnpushedPosts();
        expect(push.mock.calls).toHaveLength(20);
        expect(new Set(push.mock.calls.map(([item]) => item.post_id)).size).toBe(12);
        push.mockRestore();
    });
    it('retries a failed send, reports actual success and never resends status 3', async () => {
        db.createKeywordSub({ keyword1: 'DMIT' });
        db.batchCreatePosts([post()]);
        const telegram = new TelegramPushService(db, '123456:TEST_ONLY');
        const send = spyOn(telegram, 'sendMessage').mockResolvedValue(false);
        const matcher = new MatcherService(db, telegram);
        expect(await matcher.processUnpushedPosts()).toMatchObject({ pushed: 0, failed: 1 });
        expect(db.getPostByPostId(1)?.push_status).toBe(1);
        send.mockResolvedValue(true);
        expect(await matcher.processUnpushedPosts()).toMatchObject({ pushed: 1, failed: 0 });
        expect(db.getPostByPostId(1)?.push_status).toBe(3);
        expect(db.getComprehensiveStats()).toMatchObject({ pushed_posts: 1, matched_not_pushed: 0, today_pushed: 1 });
        await matcher.processUnpushedPosts();
        expect(send).toHaveBeenCalledTimes(2);
        send.mockRestore();
    });
    it('retains queued notifications while their subscription is paused', async () => {
        const sub = db.createKeywordSub({ keyword1: 'DMIT' });
        db.batchCreatePosts([post(1, { push_status: 1, sub_id: sub.id })]);
        db.updateKeywordSub(sub.id!, { enabled: 0 });
        const telegram = new TelegramPushService(db, '123456:TEST_ONLY');
        const send = spyOn(telegram, 'sendMessage').mockResolvedValue(true);
        const matcher = new MatcherService(db, telegram);
        await matcher.processUnpushedPosts();
        expect(send).not.toHaveBeenCalled();
        expect(db.getPostByPostId(1)?.push_status).toBe(1);
        db.updateKeywordSub(sub.id!, { enabled: 1 });
        expect((await matcher.processUnpushedPosts()).pushed).toBe(1);
        send.mockRestore();
    });
    it('preserves overflow after the ten-message cap for the next run', async () => {
        db.createKeywordSub({ keyword1: 'DMIT' });
        db.batchCreatePosts(Array.from({ length: 12 }, (_, i) => post(i + 1)));
        const telegram = new TelegramPushService(db, '123456:TEST_ONLY');
        const send = spyOn(telegram, 'sendMessage').mockResolvedValue(true);
        const matcher = new MatcherService(db, telegram);
        expect((await matcher.processUnpushedPosts()).pushed).toBe(10);
        expect(db.getUnpushedPosts()).toHaveLength(2);
        expect((await matcher.processUnpushedPosts()).pushed).toBe(2);
        expect(send).toHaveBeenCalledTimes(12);
        send.mockRestore();
    });
});

describe('database writes and filters', () => {
    it('migrates existing posts without modifying recorded matches or delivery history', () => {
        const sqlite = new Database(':memory:');
        try {
            sqlite.exec(readFileSync(new URL('../database/migrations/001_initial.sql', import.meta.url), 'utf8'));
            sqlite.query("INSERT INTO posts(post_id, title, memo, category, creator, pub_date, push_status, push_date) VALUES (?, ?, '', 'info', 'alice', ?, ?, ?)").run(1, 'Existing post', '2026-10-20T00:00:00Z', 3, '2026-10-20T00:01:00Z');
            const original = sqlite.query('SELECT * FROM posts').get() as object;
            sqlite.exec(readFileSync(new URL('../database/migrations/010_dismissed_matches.sql', import.meta.url), 'utf8'));
            expect(sqlite.query('SELECT *, match_dismissed FROM posts').get()).toEqual({ ...original, match_dismissed: 0 });
            expect(() => sqlite.exec('UPDATE posts SET match_dismissed = 2')).toThrow();
        } finally { sqlite.close(); }
    });

    it('rolls back a failed batch without partially importing posts', () => {
        expect(() => db.batchCreatePosts([post(), post(2, { title: null as unknown as string })])).toThrow();
        expect(db.getPostsCount()).toBe(0);
    });
    it('migrates existing subscriptions with safe defaults and preserves their data', () => {
        const sqlite = new Database(':memory:');
        try {
            sqlite.exec(readFileSync(new URL('../database/migrations/001_initial.sql', import.meta.url), 'utf8'));
            sqlite.query('INSERT INTO keywords_sub(keyword1) VALUES (?)').run('existing');
            sqlite.exec(readFileSync(new URL('../database/migrations/004_subscription_controls.sql', import.meta.url), 'utf8'));
            expect(sqlite.query('SELECT keyword1, enabled, exclude_keywords FROM keywords_sub').get()).toEqual({ keyword1: 'existing', enabled: 1, exclude_keywords: '' });
        } finally { sqlite.close(); }
    });
    it('deduplicates a batch and invalidates aggregate/chart caches immediately', () => {
        expect(db.getComprehensiveStats().total_posts).toBe(0);
        expect(db.getCategoryDistribution(0)).toHaveLength(0);
        expect(db.batchCreatePosts([post(), post()])).toBe(1);
        expect(db.batchCreatePosts([post()])).toBe(0);
        expect(db.getComprehensiveStats().total_posts).toBe(1);
        expect(db.getCategoryDistribution(0)).toHaveLength(1);
        db.updatePostPushStatus(1, 3, undefined, new Date().toISOString());
        expect(db.getComprehensiveStats()).toMatchObject({ pushed_posts: 1, today_pushed: 1 });
    });
    it('filters by the recorded subscription match, including regex subscriptions', () => {
        const sub = db.createKeywordSub({ keyword1: '/DMIT/' });
        db.batchCreatePosts([post(1, { sub_id: sub.id, push_status: 1 }), post(2)]);
        expect(db.getPostsWithPagination(1, 10, { subId: sub.id }).total).toBe(1);
        expect(db.getPostsWithPagination(1, 10, { search: 'alice' }).total).toBe(2);
    });
});

describe('RSS source validation', () => {
    it('rejects an HTTP 200 challenge page instead of reporting a healthy empty feed', async () => {
        const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>Cloudflare challenge</html>', { status: 200 }));
        try {
            await expect(new RSSService(db).fetchAndParseRSS()).rejects.toThrow('非 RSS 内容');
        } finally { fetch.mockRestore(); }
    });
});

describe('scheduler', () => {
    it('shares one fetch/push operation across concurrent manual requests', async () => {
        const fetch = spyOn(RSSService.prototype, 'processNewRSSData').mockImplementation(async () => {
            await Bun.sleep(20);
            return { new: 2, updated: 0, skipped: 0 };
        });
        const matcher = spyOn(MatcherService.prototype, 'processUnpushedPosts').mockResolvedValue({ pushed: 0, failed: 0, skipped: 0 });
        try {
            const scheduler = new SchedulerService(db);
            const [a, b] = await Promise.all([scheduler.manualRSSTask(), scheduler.manualRSSTask()]);
            expect(a).toBe(b);
            expect(a.success).toBe(true);
            expect(fetch).toHaveBeenCalledTimes(1);
            expect(matcher).toHaveBeenCalledTimes(1);
            expect(scheduler.getStatus().rssTask).toMatchObject({ busy: false, consecutiveFailures: 0 });
        } finally { fetch.mockRestore(); matcher.mockRestore(); }
    });
    it('reports RSS failures while still retrying queued notifications', async () => {
        const fetch = spyOn(RSSService.prototype, 'processNewRSSData').mockRejectedValue(new Error('source offline'));
        const matcher = spyOn(MatcherService.prototype, 'processUnpushedPosts').mockResolvedValue({ pushed: 1, failed: 0, skipped: 0 });
        try {
            const scheduler = new SchedulerService(db);
            const result = await scheduler.manualRSSTask();
            expect(result.success).toBe(false);
            expect(result.data?.notifications.pushed).toBe(1);
            expect(matcher).toHaveBeenCalledTimes(1);
            expect(scheduler.getStatus().rssTask).toMatchObject({ lastError: 'source offline', consecutiveFailures: 1, lastSuccessAt: null });
        } finally { fetch.mockRestore(); matcher.mockRestore(); }
    });
});
