import { beforeEach, afterEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { HotService, heatScore, weekStart } from './hot';

let db: Database;
const now = new Date('2026-10-20T05:00:00Z');
const post = (id: number, changes: Record<string, unknown> = {}) => ({ postId: id, title: `帖子 ${id}`, author: 'alice', category: 'tech', categoryLabel: '技术', views: 100, replies: 10, lastActiveAt: now.toISOString(), pinned: false, ...changes });
const batch = (posts = [post(1)], date = now) => ({ posts, pages: 4, collectedAt: date.toISOString() });
const publish = (id: number, date: string) => db.query("INSERT INTO posts(post_id,title,memo,category,creator,pub_date) VALUES(?,'title','','tech','alice',?)").run(id, date);
beforeEach(() => {
    db = new Database(':memory:');
    for (const name of ['001_initial', '006_hot_ranking', '007_hot_samples']) db.exec(readFileSync(new URL(`../database/migrations/${name}.sql`, import.meta.url), 'utf8'));
});
afterEach(() => db.close());

describe('independent hot ranking', () => {
    it('uses confirmed recent publication, excludes bumped old/unknown/pinned posts and keeps deterministic ties', () => {
        const service = new HotService(db);
        for (const id of [1, 2, 4]) publish(id, '2026-10-20T04:00:00Z');
        publish(3, '2026-10-19T06:00:00Z');
        publish(5, '2026-10-17T05:00:00Z');
        service.saveBatch(batch([post(1), post(2), post(3), post(4, { pinned: true, views: 1000000 }), post(5, {views: 999999}), post(6)]), now);
        expect(service.ranking('live', '', 'heat', now).posts.map(p => p.postId)).toEqual([2, 1]);
        expect(heatScore(100, 10)).toBeGreaterThan(heatScore(10, 1));
    });
    it('uses confirmed publication time rather than last reply or collection time for daily and weekly cohorts', () => {
        const service = new HotService(db);
        service.saveBatch(batch([post(1), post(2), post(3), post(4), post(5)]), now);
        publish(1, '2026-10-20T00:00:00Z');
        publish(2, '2026-10-18T20:00:00Z');
        publish(3, '2026-10-01T00:00:00Z');
        publish(5, '2026-10-21T00:00:00Z');
        expect(service.ranking('day', '', 'heat', now).posts.map(p => p.postId)).toEqual([1]);
        expect(service.ranking('week', '', 'heat', now).posts.map(p => p.postId)).toEqual([2, 1]);
    });
    it('filters one category, exposes all discovered categories, and sorts actual numeric counts', () => {
        const service = new HotService(db);
        for (const id of [1, 2]) publish(id, '2026-10-20T04:00:00Z');
        service.saveBatch(batch([post(1, {views: 20000}), post(2, {category:'new-board', categoryLabel:'新板块', replies: 30})]), now);
        expect(service.ranking('live', 'new-board', 'views', now).posts.map(p => p.postId)).toEqual([2]);
        expect(service.ranking('live', '', 'views', now).posts[0].postId).toBe(1);
        expect(service.ranking('live', '', 'replies', now).posts[0].postId).toBe(2);
        expect(service.ranking('live', '', 'heat', now).categories).toHaveLength(2);
    });
    it('upserts counts without duplicates and rejects malformed or older batches atomically', () => {
        const service = new HotService(db);
        publish(1, '2026-10-20T04:00:00Z');
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
        publish(1, '2026-10-20T04:00:00Z');
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
    it('defaults to 30, supports 50/100 after sorting, and prunes only old heat records', () => {
        const service = new HotService(db);
        const old = new Date(now.getTime() - 31 * 86400000);
        service.saveBatch(batch([post(999)], old), old);
        publish(999, old.toISOString());
        for (let id = 1; id <= 140; id++) publish(id, '2026-10-20T04:00:00Z');
        service.saveBatch(batch(Array.from({length:140}, (_, i) => post(i+1, {views:i, category:i < 110 ? 'tech' : 'daily'}))), now);
        const result = service.ranking('live', '', 'heat', now);
        expect(result.posts).toHaveLength(30);
        expect(result.total).toBe(140);
        for (const limit of [30, 50, 100] as const) {
            const ranked = service.ranking('day', '', 'views', now, limit);
            expect(ranked.posts.map(p => p.postId)).toEqual(Array.from({length:limit}, (_, i) => 140-i));
            expect(ranked.total).toBe(140);
            const filtered = service.ranking('week', 'tech', 'views', now, limit);
            expect(filtered.posts.map(p => p.postId)).toEqual(Array.from({length:limit}, (_, i) => 110-i));
            expect(filtered.total).toBe(110);
        }
        expect(db.query('SELECT COUNT(*) AS n FROM posts').get()).toEqual({n:141});
        expect(db.query('SELECT * FROM hot_posts WHERE post_id=999').get()).toBeNull();
    });
    it('ranks recent growth above large static lifetime counts and never resets age on a reply', () => {
        const service = new HotService(db);
        for (const id of [1, 2, 3]) publish(id, '2026-10-20T03:00:00Z');
        const earlier = new Date(now.getTime() - HOUR);
        service.saveBatch(batch([post(1, {views:10000,replies:300}), post(2, {views:100,replies:1}), post(3)], earlier), earlier);
        service.saveBatch(batch([post(1, {views:10000,replies:300}), post(2, {views:500,replies:30}), post(3, {views:90,replies:9})]), now);
        const live = service.ranking('live', '', 'heat', now);
        expect(live.warmingUp).toBe(false);
        expect(live.posts.map(p => p.postId)).toEqual([2, 3, 1]);
        expect(live.posts[0].growthViews).toBe(400);
        expect(live.posts.find(p => p.postId === 3)?.growthReplies).toBe(0);
        expect(service.ranking('day', '', 'heat', now).posts[0].postId).toBe(1);
        db.query('UPDATE hot_posts SET last_active_at=?').run(new Date(now.getTime() + HOUR).toISOString());
        expect(service.ranking('live', '', 'heat', new Date(now.getTime() + MINUTE)).posts).toEqual(live.posts);
    });
    it('uses an hour baseline, avoids treating first-seen old counts as growth, and bounds history', () => {
        const service = new HotService(db);
        for (const id of [1, 2]) publish(id, '2026-10-20T02:00:00Z');
        publish(3, '2026-10-20T04:58:00Z');
        for (const minutes of [180, 70, 60, 5, 0]) {
            const date = new Date(now.getTime() - minutes * MINUTE);
            service.saveBatch(batch([post(1, {views:1000 - minutes,replies:10})], date), date);
        }
        service.saveBatch(batch([post(1, {views:1000}), post(2, {views:99999}), post(3, {views:20})]), now);
        const live = service.ranking('live', '', 'heat', now);
        expect(live.posts.find(p => p.postId === 1)?.growthViews).toBe(60);
        expect(live.posts.some(p => p.postId === 2)).toBe(false);
        expect(live.posts.some(p => p.postId === 3)).toBe(true);
        expect((db.query('SELECT COUNT(*) n FROM hot_samples WHERE julianday(observed_at)<julianday(?)-2.0/24').get(now.toISOString()) as any).n).toBe(0);
    });
    it('treats the same recent activity equally regardless of publication age and does not amplify short samples', () => {
        const service = new HotService(db);
        publish(1, new Date(now.getTime() - 23 * HOUR).toISOString());
        publish(2, new Date(now.getTime() - 20 * MINUTE).toISOString());
        publish(3, new Date(now.getTime() - 2 * MINUTE).toISOString());
        const earlier = new Date(now.getTime() - HOUR);
        service.saveBatch(batch([post(1, {views:10000, replies:300})], earlier), earlier);
        service.saveBatch(batch([post(1, {views:10400, replies:320}), post(2, {views:400,replies:20}), post(3, {views:40,replies:2})]), now);
        const live = service.ranking('live', '', 'heat', now).posts;
        expect(live.map(p => p.postId)).toEqual([2, 1, 3]);
        expect(live[0].heat).toBe(live[1].heat);
        expect(live[2].heat).toBe(heatScore(40, 2));
        expect(service.ranking('live', '', 'views', now).posts.map(p => p.postId)).toEqual([1, 2, 3]);
        expect(service.ranking('live', '', 'replies', now).posts.map(p => p.postId)).toEqual([1, 2, 3]);
    });
    it('interpolates the one-hour boundary without counting the older portion or projecting short observations', () => {
        const service = new HotService(db);
        publish(1, new Date(now.getTime() - 4 * HOUR).toISOString());
        publish(2, new Date(now.getTime() - 4 * HOUR).toISOString());
        for (const [minutes, views, replies] of [[65,100,10],[55,200,20],[0,750,75]]) {
            const date = new Date(now.getTime() - minutes * MINUTE);
            service.saveBatch(batch([post(1,{views,replies})], date), date);
        }
        const recent = new Date(now.getTime() - 5 * MINUTE);
        // Insert the first observation for another post without rewinding the collector state.
        db.query('INSERT INTO hot_posts SELECT 2,title,author,category,category_label,1000,100,last_active_at,?,0 FROM hot_posts WHERE post_id=1').run(recent.toISOString());
        db.query('INSERT INTO hot_samples VALUES(2,?,1000,100)').run(recent.toISOString());
        service.saveBatch(batch([post(1,{views:750,replies:75}),post(2,{views:1010,replies:101})]), now);
        const live = service.ranking('live', '', 'heat', now).posts;
        expect(live[0].growthViews).toBe(600);
        expect(live[0].growthReplies).toBe(60);
        expect(live[0].sampleMinutes).toBe(60);
        expect(live[1].growthViews).toBe(10);
        expect(live[1].heat).toBe(heatScore(10,1));
        expect(live[1].sampleMinutes).toBe(5);
    });
    it('waits for measured growth on first-seen old posts instead of falling back to lifetime popularity', () => {
        const service = new HotService(db);
        publish(1, new Date(now.getTime() - 4 * HOUR).toISOString());
        service.saveBatch(batch([post(1,{views:999999,replies:9999})]), now);
        expect(service.ranking('live', '', 'heat', now).posts).toEqual([]);
        expect(service.ranking('live', '', 'heat', now).warmingUp).toBe(true);
        expect(service.ranking('day', '', 'heat', now).posts).toHaveLength(1);
        const later = new Date(now.getTime() + 5 * MINUTE);
        service.saveBatch(batch([post(1,{views:1000009,replies:10000})],later),later);
        expect(service.ranking('live', '', 'heat', later).posts[0].heat).toBe(heatScore(10,1));
    });
    it('uses a rolling 24-hour day and the current Beijing calendar week, including Monday and Sunday boundaries', () => {
        for (const [instant, expected] of [
            ['2026-10-18T15:59:59Z','2026-10-11T16:00:00Z'],
            ['2026-10-18T16:00:00Z','2026-10-18T16:00:00Z'],
            ['2026-11-01T15:59:59Z','2026-10-25T16:00:00Z'],
            ['2026-11-01T16:00:00Z','2026-11-01T16:00:00Z'],
        ]) expect(new Date(weekStart(Date.parse(instant))).toISOString()).toBe(new Date(expected).toISOString());
        const service = new HotService(db);
        const dates = ['2026-10-19T05:00:00Z','2026-10-19T04:59:59Z','2026-10-18T16:00:00Z','2026-10-18T15:59:59Z','2026-10-20T05:00:01Z'];
        dates.forEach((date,i) => publish(i+1,date));
        service.saveBatch(batch(dates.map((_,i) => post(i+1))),now);
        expect(service.ranking('day', '', 'heat', now).posts.map(p => p.postId)).toEqual([1]);
        expect(service.ranking('week', '', 'heat', now).posts.map(p => p.postId)).toEqual([3,2,1]);
    });
});

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
