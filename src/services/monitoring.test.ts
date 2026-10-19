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
    for (const name of ['001_initial', '002_add_rss_config', '003_add_telegram_mode', '004_subscription_controls', '005_account_preferences']) {
        sqlite.exec(readFileSync(new URL(`../database/migrations/${name}.sql`, import.meta.url), 'utf8'));
    }
    db = new DatabaseService(sqlite);
    db.createBaseConfig({ username: 'tester', password: 'unused-test-hash', bot_token: '123456:TEST_ONLY',
        chat_id: '123', stop_push: 0, only_title: 0 });
});
afterEach(() => db.close());

describe('subscription matching', () => {
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

describe('notification queue', () => {
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
