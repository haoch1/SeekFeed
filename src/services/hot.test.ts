import { beforeEach, afterEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { HotService, heatScore } from './hot';

let db: Database;
const now = new Date('2026-10-20T05:00:00Z');
const post = (id: number, changes: Record<string, unknown> = {}) => ({ postId: id, title: `帖子 ${id}`, author: 'alice', category: 'tech', categoryLabel: '技术', views: 100, replies: 10, lastActiveAt: now.toISOString(), pinned: false, ...changes });
const batch = (posts = [post(1)], date = now) => ({ posts, pages: 4, collectedAt: date.toISOString() });
const publish = (id: number, date: string) => db.query("INSERT INTO posts(post_id,title,memo,category,creator,pub_date) VALUES(?,'title','','tech','alice',?)").run(id, date);
beforeEach(() => {
    db = new Database(':memory:');
    for (const name of ['001_initial', '006_hot_ranking']) db.exec(readFileSync(new URL(`../database/migrations/${name}.sql`, import.meta.url), 'utf8'));
});
afterEach(() => db.close());

describe('independent hot ranking', () => {
    it('ranks live discussion with decay, excludes pinned posts and keeps deterministic ties', () => {
        const service = new HotService(db);
        service.saveBatch(batch([post(1), post(2), post(3, { lastActiveAt: '2026-10-19T05:00:00Z' }), post(4, { pinned: true, views: 1000000 })]), now);
        expect(service.ranking('live', '', 'heat', now).posts.map(p => p.postId)).toEqual([2, 1, 3]);
        expect(heatScore(10, 1, 0, true)).toBeGreaterThan(heatScore(10, 1, 24, true));
        expect(heatScore(100, 10, 0, false)).toBe(heatScore(100, 10, 100, false));
    });
    it('uses confirmed publication time rather than last reply or collection time for daily and weekly cohorts', () => {
        const service = new HotService(db);
        service.saveBatch(batch([post(1), post(2), post(3), post(4), post(5)]), now);
        publish(1, '2026-10-20T00:00:00Z');
        publish(2, '2026-10-18T00:00:00Z');
        publish(3, '2026-10-01T00:00:00Z');
        publish(5, '2026-10-21T00:00:00Z');
        expect(service.ranking('day', '', 'heat', now).posts.map(p => p.postId)).toEqual([1]);
        expect(service.ranking('week', '', 'heat', now).posts.map(p => p.postId)).toEqual([2, 1]);
    });
    it('filters one category, exposes all discovered categories, and sorts actual numeric counts', () => {
        const service = new HotService(db);
        service.saveBatch(batch([post(1, {views: 20000}), post(2, {category:'new-board', categoryLabel:'新板块', replies: 30})]), now);
        expect(service.ranking('live', 'new-board', 'views', now).posts.map(p => p.postId)).toEqual([2]);
        expect(service.ranking('live', '', 'views', now).posts[0].postId).toBe(1);
        expect(service.ranking('live', '', 'replies', now).posts[0].postId).toBe(2);
        expect(service.ranking('live', '', 'heat', now).categories).toHaveLength(2);
    });
    it('upserts counts without duplicates and rejects malformed or older batches atomically', () => {
        const service = new HotService(db);
        service.saveBatch(batch(), now);
        service.saveBatch(batch([post(1, {views: 222})]), now);
        expect(service.ranking('live', '', 'heat', now).posts).toHaveLength(1);
        expect(service.ranking('live', '', 'heat', now).posts[0].views).toBe(222);
        for (const input of [batch([post(1, {views:null})]), batch([post(1), post(2, {category:'<script>'})]), batch([], now), batch([post(2)], new Date('2026-10-19T00:00:00Z'))]) {
            expect(() => service.saveBatch(input, now)).toThrow();
        }
        expect(service.ranking('live', '', 'heat', now).posts[0].views).toBe(222);
    });
    it('shares concurrent collection, reports failures without leaking transport details, retains good stale results and enforces cooldown', async () => {
        let calls = 0;
        const service = new HotService(db, async () => { calls++; await Bun.sleep(5); throw new Error('secret cookie transport'); });
        service.saveBatch(batch(), now);
        const results = await Promise.all([service.refresh(), service.refresh()]);
        expect(results).toEqual([false, false]);
        expect(calls).toBe(1);
        await service.refresh();
        expect(calls).toBe(1);
        const stale = service.ranking('live', '', 'heat', new Date(now.getTime() + 2 * 3600000));
        expect(stale.posts).toHaveLength(1);
        expect(stale.stale).toBe(true);
        expect(stale.error).not.toContain('secret');
    });
    it('keeps a stable top 50 and prunes only old heat records, preserving RSS history', () => {
        const service = new HotService(db);
        const old = new Date(now.getTime() - 31 * 86400000);
        service.saveBatch(batch([post(999)], old), old);
        publish(999, old.toISOString());
        service.saveBatch(batch(Array.from({length:70}, (_, i) => post(i+1))), now);
        const result = service.ranking('live', '', 'heat', now);
        expect(result.posts).toHaveLength(50);
        expect(result.total).toBe(70);
        expect(db.query('SELECT COUNT(*) AS n FROM posts').get()).toEqual({n:1});
        expect(db.query('SELECT * FROM hot_posts WHERE post_id=999').get()).toBeNull();
    });
});
