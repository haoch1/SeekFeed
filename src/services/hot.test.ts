import { beforeEach, afterEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { HotService, heatScore, dayStart, weekStart, liveActivity, CollectorUnavailable, parseCollectorFailure } from './hot';

let db: Database;
const now = new Date('2026-10-20T05:00:00Z');
const post = (id: number, changes: Record<string, unknown> = {}) => ({ postId: id, title: `帖子 ${id}`, author: 'alice', category: 'tech', categoryLabel: '技术', views: 100, replies: 10, lastActiveAt: now.toISOString(), pinned: false, ...changes });
const batch = (posts = [post(1)], date = now) => ({ posts, pages: 4, collectedAt: date.toISOString() });
const publish = (id: number, date: string) => db.query("INSERT INTO posts(post_id,title,memo,category,creator,pub_date) VALUES(?,'title','','tech','alice',?)").run(id, date);
beforeEach(() => {
    db = new Database(':memory:');
    for (const name of ['001_initial', '006_hot_ranking', '007_hot_samples', '008_hot_collector_cooldown', '011_forum_author_links', '012_collection_insights']) db.exec(readFileSync(new URL(`../database/migrations/${name}.sql`, import.meta.url), 'utf8'));
});
afterEach(() => db.close());

describe('independent hot ranking', () => {
    it('removes optional history idempotently without changing heat inputs or ranking', () => {
        const service = new HotService(db);
        publish(1, '2026-10-20T03:00:00Z');
        const earlier = new Date(now.getTime() - 10 * 60000);
        service.saveBatch(batch([post(1, { views: 100, replies: 1 })], earlier), earlier);
        service.saveBatch(batch([post(1, { views: 500, replies: 30 })]), now);
        db.exec(`CREATE TABLE hot_metric_hourly(value TEXT); INSERT INTO hot_metric_hourly VALUES('legacy');
            CREATE TABLE post_revisions(value TEXT); INSERT INTO post_revisions VALUES('legacy');
            CREATE TABLE post_observations(value TEXT); INSERT INTO post_observations VALUES('legacy');`);
        const tables = ['posts', 'hot_posts', 'hot_samples', 'hot_collector_state', 'forum_post_authors', 'collection_runs', 'keywords_sub'];
        const before = tables.map(table => db.query(`SELECT * FROM ${table}`).all());
        const ranking = service.ranking('live', '', 'heat', now);
        expect(ranking.posts[0].growthViews).toBe(400);
        const removal = readFileSync(new URL('../database/migrations/015_remove_post_history.sql', import.meta.url), 'utf8');
        db.exec(removal); db.exec(removal);
        expect(db.query("SELECT name FROM sqlite_master WHERE name IN ('hot_metric_hourly','post_revisions','post_observations')").all()).toEqual([]);
        expect(tables.map(table => db.query(`SELECT * FROM ${table}`).all())).toEqual(before);
        expect(service.ranking('live', '', 'heat', now)).toEqual(ranking);
        service.saveBatch(batch([post(1, { views: 600, replies: 40 })], new Date(now.getTime() + 60000)), new Date(now.getTime() + 60000));
        expect(db.query('SELECT views FROM hot_posts WHERE post_id=1').get()).toEqual({ views: 600 });
    });
    it('uses confirmed recent publication, excludes bumped old/unknown/pinned posts and keeps deterministic ties', () => {
        const service = new HotService(db);
        for (const id of [1, 2, 4]) publish(id, '2026-10-20T04:50:00Z');
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
        for (const id of [1, 2]) publish(id, '2026-10-20T04:50:00Z');
        service.saveBatch(batch([post(1, {views: 20000}), post(2, {category:'new-board', categoryLabel:'新板块', replies: 30})]), now);
        expect(service.ranking('live', 'new-board', 'views', now).posts.map(p => p.postId)).toEqual([2]);
        expect(service.ranking('live', '', 'views', now).posts[0].postId).toBe(1);
        expect(service.ranking('live', '', 'replies', now).posts[0].postId).toBe(2);
        expect(service.ranking('live', '', 'heat', now).categories).toHaveLength(2);
    });
    it('upserts counts without duplicates and rejects malformed or older batches atomically', () => {
        const service = new HotService(db);
        publish(1, '2026-10-20T04:50:00Z');
        service.saveBatch(batch(), now);
        service.saveBatch(batch([post(1, {views: 222})]), now);
        expect(service.ranking('live', '', 'heat', now).posts).toHaveLength(1);
        expect(service.ranking('live', '', 'heat', now).posts[0].views).toBe(222);
        for (const input of [batch([post(1, {views:null})]), batch([post(1), post(2, {category:'<script>'})]), batch([], now), batch([post(2)], new Date('2026-10-19T00:00:00Z'))]) {
            expect(() => service.saveBatch(input, now)).toThrow();
        }
        expect(service.ranking('live', '', 'heat', now).posts[0].views).toBe(222);
    });
    it('accepts a complete four-page batch above 250 rows and retains an atomic upper bound', () => {
        const service = new HotService(db);
        const rows = Array.from({ length: 300 }, (_, index) => post(index + 1));
        service.saveBatch({ ...batch(rows, now), pages: 4 }, now);
        expect(db.query('SELECT COUNT(*) AS count FROM hot_posts').get()).toEqual({ count: 300 });
        expect(db.query('SELECT COUNT(*) AS count FROM hot_samples').get()).toEqual({ count: 300 });
        expect(() => service.saveBatch({ ...batch(Array.from({ length: 501 }, (_, index) => post(index + 1)), now), pages: 4 }, now)).toThrow();
        expect(db.query('SELECT COUNT(*) AS count FROM hot_posts').get()).toEqual({ count: 300 });
    });
    it('shares concurrent collection, reports failures without leaking transport details, retains good stale results and enforces cooldown', async () => {
        let calls = 0;
        const service = new HotService(db, async () => { calls++; await Bun.sleep(5); throw new Error('secret cookie transport'); });
        publish(1, '2026-10-20T04:50:00Z');
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
        for (let id = 1; id <= 140; id++) publish(id, '2026-10-20T04:50:00Z');
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
        const earlier = new Date(now.getTime() - 5 * MINUTE);
        service.saveBatch(batch([post(1, {views:10000,replies:300}), post(2, {views:100,replies:1}), post(3)], earlier), earlier);
        service.saveBatch(batch([post(1, {views:10000,replies:300}), post(2, {views:500,replies:30}), post(3, {views:90,replies:9})]), now);
        const live = service.ranking('live', '', 'heat', now);
        expect(live.warmingUp).toBe(false);
        expect(live.posts.map(p => p.postId)).toEqual([2]);
        expect(live.posts[0].growthViews).toBe(400);
        expect(live.posts.some(p => p.postId === 3)).toBe(false);
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
        publish(2, new Date(now.getTime() - 10 * MINUTE).toISOString());
        publish(3, new Date(now.getTime() - 2 * MINUTE).toISOString());
        const earlier = new Date(now.getTime() - 10 * MINUTE);
        service.saveBatch(batch([post(1, {views:10000, replies:300})], earlier), earlier);
        service.saveBatch(batch([post(1, {views:10400, replies:320}), post(2, {views:400,replies:20}), post(3, {views:40,replies:2})]), now);
        const live = service.ranking('live', '', 'heat', now).posts;
        expect(live.map(p => p.postId)).toEqual([2, 1, 3]);
        expect(live[0].heat).toBe(live[1].heat);
        expect(live[2].heat).toBeGreaterThan(0);
        expect(live[2].heat).toBeLessThan(heatScore(40, 2));
        expect(service.ranking('live', '', 'views', now).posts.map(p => p.postId)).toEqual([1, 2, 3]);
        expect(service.ranking('live', '', 'replies', now).posts.map(p => p.postId)).toEqual([1, 2, 3]);
    });
    it('interpolates the one-hour boundary without counting the older portion or projecting short observations', () => {
        const service = new HotService(db);
        publish(1, new Date(now.getTime() - 4 * HOUR).toISOString());
        publish(2, new Date(now.getTime() - 4 * HOUR).toISOString());
        for (const [minutes, views, replies] of [[65,100,10],[55,200,20], ...Array.from({ length: 11 }, (_, i) => { const m = 50 - i * 5; return [m, 750 - m * 10, 75 - m]; })]) {
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
        expect(live[1].heat).toBeGreaterThan(0);
        expect(live[1].heat).toBeLessThan(heatScore(10,1));
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
        const result = service.ranking('live', '', 'heat', later).posts[0];
        expect(result.growthViews).toBe(10);
        expect(result.heat).toBeGreaterThan(0);
        expect(result.heat).toBeLessThan(heatScore(10,1));
    });
    it('starts calendar days and weeks at Beijing midnight independent of the server timezone', () => {
        for (const [instant, expected] of [
            ['2026-10-19T15:59:59.999Z', '2026-10-18T16:00:00Z'],
            ['2026-10-19T16:00:00Z', '2026-10-19T16:00:00Z'],
            ['2026-10-20T00:00:00Z', '2026-10-19T16:00:00Z'],
            ['2027-01-01T00:00:00+08:00', '2026-12-31T16:00:00Z'],
            ['2028-02-29T23:59:59+08:00', '2028-02-28T16:00:00Z'],
            ['2028-03-01T00:00:00+08:00', '2028-02-29T16:00:00Z'],
        ]) expect(new Date(dayStart(Date.parse(instant))).toISOString()).toBe(new Date(expected).toISOString());
        for (const [instant, expected] of [
            ['2026-10-18T15:59:59.999Z','2026-10-11T16:00:00Z'],
            ['2026-10-18T16:00:00Z','2026-10-18T16:00:00Z'],
            ['2026-11-01T15:59:59Z','2026-10-25T16:00:00Z'],
            ['2026-11-01T16:00:00Z','2026-11-01T16:00:00Z'],
            ['2027-01-01T00:00:00+08:00','2026-12-27T16:00:00Z'],
        ]) expect(new Date(weekStart(Date.parse(instant))).toISOString()).toBe(new Date(expected).toISOString());
    });
    it('includes today from 00:00 and this week from Monday 00:00, excluding yesterday and last Sunday', () => {
        const service = new HotService(db);
        const dates = ['2026-10-19T16:00:00Z','2026-10-19T15:59:59.999Z','2026-10-18T16:00:00Z','2026-10-18T15:59:59.999Z','2026-10-20T05:00:01Z',now.toISOString()];
        dates.forEach((date,i) => publish(i+1,date));
        service.saveBatch(batch(dates.map((_,i) => post(i+1))),now);
        for (const sort of ['heat', 'views', 'replies'] as const) {
            expect(service.ranking('day', '', sort, now).posts.map(p => p.postId)).toEqual([6,1]);
            expect(service.ranking('week', '', sort, now).posts.map(p => p.postId)).toEqual([6,3,2,1]);
            expect(service.ranking('day', 'tech', sort, now).posts.map(p => p.postId)).toEqual([6,1]);
        }
    });
    it('advances calendar periods during delayed collection and keeps live scores fixed', () => {
        const service = new HotService(db);
        const collected = new Date('2026-10-18T15:59:59.999Z'); // Sunday 23:59:59.999 Beijing.
        publish(1, '2026-10-18T15:50:00Z');
        service.saveBatch(batch([post(1)], collected), collected);
        const live = service.ranking('live', '', 'heat', collected);
        expect(live.posts).toHaveLength(1);
        expect(service.ranking('day', '', 'heat', collected).posts).toHaveLength(1);
        expect(service.ranking('week', '', 'heat', collected).posts).toHaveLength(1);
        for (const current of ['2026-10-18T16:00:00Z', '2026-10-18T16:20:00Z']) {
            const next = new Date(current);
            expect(service.ranking('day', '', 'heat', next).posts).toEqual([]);
            expect(service.ranking('week', '', 'heat', next).posts).toEqual([]);
            expect(service.ranking('live', '', 'heat', next).posts).toEqual(live.posts);
        }
        publish(2, '2026-10-18T16:00:00Z');
        const resumed = new Date('2026-10-18T16:21:00Z');
        service.saveBatch(batch([post(1), post(2)], resumed), resumed);
        expect(service.ranking('day', '', 'heat', resumed).posts.map(p => p.postId)).toEqual([2]);
        expect(service.ranking('week', '', 'heat', resumed).posts.map(p => p.postId)).toEqual([2]);
    });
    it('resets the daily cohort at midnight while retaining the current week', () => {
        const service = new HotService(db);
        const collected = new Date('2026-10-20T15:59:59.999Z'); // Tuesday 23:59:59.999 Beijing.
        publish(1, '2026-10-19T16:00:00Z');
        publish(2, '2026-10-18T16:00:00Z');
        service.saveBatch(batch([post(1), post(2)], collected), collected);
        expect(service.ranking('day', '', 'heat', collected).posts.map(p => p.postId)).toEqual([1]);
        const next = new Date('2026-10-20T16:00:00Z');
        expect(service.ranking('day', '', 'heat', next).posts).toEqual([]);
        expect(service.ranking('week', '', 'heat', next).posts.map(p => p.postId)).toEqual([2,1]);
    });

    it('promotes a fresh burst over an equal cooling burst and removes inactive posts without rotating active leaders arbitrarily', () => {
        const service = new HotService(db);
        for (const id of [1, 2, 3]) publish(id, new Date(+now - 3 * HOUR).toISOString());
        for (let minutes = 60; minutes >= 0; minutes -= 5) {
            const date = new Date(+now - minutes * MINUTE);
            // Post 1 peaked 40 minutes ago; post 2 is heating up now; post 3 stays busy.
            service.saveBatch(batch([
                post(1, { views: minutes <= 40 ? 1000 : 0, replies: minutes <= 40 ? 40 : 0 }),
                post(2, { views: minutes === 0 ? 1000 : 0, replies: minutes === 0 ? 40 : 0 }),
                post(3, { views: (60 - minutes) * 400, replies: (60 - minutes) * 20 }),
            ], date), date);
        }
        const live = service.ranking('live', '', 'heat', now);
        expect(live.posts.map(p => p.postId)).toEqual([3, 2]);
        expect(live.warmingUp).toBe(false);
        expect(service.ranking('day', '', 'heat', now).posts.some(p => p.postId === 1)).toBe(true);
        expect(service.ranking('live', '', 'heat', new Date(+now + 1000)).posts).toEqual(live.posts);
    });

    it('weights activity time smoothly and gives equivalent results for two- and five-minute sample cadence', () => {
        const history = (step: number, burstAge = 0) => Array.from({ length: 60 / step + 1 }, (_, i) => {
            const minutes = 60 - i * step;
            return { post_id: 1, observed_at: new Date(+now - minutes * MINUTE).toISOString(),
                views: minutes >= burstAge + 10 ? 0 : minutes <= burstAge ? 1000 : (burstAge + 10 - minutes) * 100,
                replies: minutes >= burstAge + 10 ? 0 : minutes <= burstAge ? 100 : (burstAge + 10 - minutes) * 10 };
        });
        const fresh = liveActivity(history(2), +now - 3 * HOUR, +now)!;
        const other = liveActivity(history(5), +now - 3 * HOUR, +now)!;
        const cooling = liveActivity(history(5, 15), +now - 3 * HOUR, +now)!;
        expect(fresh.views).toBeCloseTo(other.views, 8);
        expect(fresh.replies).toBeCloseTo(other.replies, 8);
        expect(fresh.views).toBeCloseTo(cooling.views * 2, 8);
        expect(fresh.replies).toBeCloseTo(cooling.replies * 2, 8);
        expect(fresh.active).toBe(true);
        expect(liveActivity(history(5, 40), +now - 3 * HOUR, +now)?.active).toBe(false);
    });

    it('does not invent activity across collection outages, unknown baselines, or counter rollbacks', () => {
        const sample = (minutes: number, views: number) => ({ post_id: 1, observed_at: new Date(+now - minutes * MINUTE).toISOString(), views, replies: 0 });
        expect(liveActivity([sample(0, 99999)], +now - 3 * HOUR, +now)).toBeNull();
        expect(liveActivity([sample(60, 100), sample(0, 99999)], +now - 3 * HOUR, +now)).toBeNull();
        expect(liveActivity([sample(10, 1000), sample(5, 900), sample(0, 1000)], +now - 3 * HOUR, +now)?.active).toBe(false);
        const zero = liveActivity([sample(5, 0), sample(0, 0)], +now - 3 * HOUR, +now)!;
        expect(zero).toEqual({ views: 0, replies: 0, active: false });
    });

    it('paces fast scans, performs a full scan every third success, and persists the cooldown across restarts', async () => {
        const modes: boolean[] = [];
        const service = new HotService(db, async full => { modes.push(full); return { ...batch([post(1)], new Date()), pages: full ? 4 : 2 }; });
        for (let i = 0; i < 4; i++) {
            db.query('UPDATE hot_collector_state SET next_attempt_at=NULL,last_attempt_at=NULL WHERE id=1').run();
            expect(await service.refresh()).toBe(true);
            const state = db.query('SELECT next_attempt_at FROM hot_collector_state').get() as any;
            expect(Date.parse(state.next_attempt_at) - Date.now()).toBeGreaterThan(59000);
            expect(Date.parse(state.next_attempt_at) - Date.now()).toBeLessThanOrEqual(75000);
            expect(service.ranking().intervalSeconds).toBe(60);
            expect(Date.parse(state.next_attempt_at) - Date.now()).toBeLessThanOrEqual(135000);
            expect(await service.refresh()).toBe(false);
            const restarted = new HotService(db, async () => { throw new Error('must not collect'); });
            expect(await restarted.refresh()).toBe(false);
        }
        expect(modes).toEqual([true, false, false, true]);
    });

    it('respects upstream Retry-After and progressively backs off failures even for manual triggers', async () => {
        let calls = 0;
        const service = new HotService(db, async () => { calls++; throw new CollectorUnavailable(calls === 1 ? 1800 : 0); });
        for (const [i, minimum] of [1800, 1200, 2400, 3600, 3600].entries()) {
            db.query('UPDATE hot_collector_state SET next_attempt_at=NULL,last_attempt_at=NULL WHERE id=1').run();
            expect(await service.refresh()).toBe(false);
            const state = db.query('SELECT failures,next_attempt_at FROM hot_collector_state').get() as any;
            expect(state.failures).toBe(i + 1);
            expect(Date.parse(state.next_attempt_at) - Date.now()).toBeGreaterThan(minimum * 1000 - 1000);
            expect(await service.refresh()).toBe(false);
            expect(calls).toBe(i + 1);
        }
    });
    it('recovers transient transport and server failures without applying the long blocked-source cooldown', async () => {
        for (const failure of [new CollectorUnavailable(0, 'network_timeout'), new CollectorUnavailable(0, 'network_error'), new CollectorUnavailable(0, 'http_error', 503)]) {
            db.query('UPDATE hot_collector_state SET failures=0,last_error=NULL,next_attempt_at=NULL,last_attempt_at=NULL WHERE id=1').run();
            let broken = true, calls = 0;
            const service = new HotService(db, async () => { calls++; if (broken) throw failure; return batch([post(1)], new Date()); });
            for (const seconds of [60, 120, 240, 300]) {
                db.query('UPDATE hot_collector_state SET next_attempt_at=NULL,last_attempt_at=NULL WHERE id=1').run();
                expect(await service.refresh()).toBe(false);
                const state = db.query('SELECT next_attempt_at,last_error FROM hot_collector_state').get() as any;
                expect(Date.parse(state.next_attempt_at) - Date.now()).toBeGreaterThan(seconds * 1000 - 1000);
                expect(Date.parse(state.next_attempt_at) - Date.now()).toBeLessThanOrEqual(seconds * 1000);
                expect(state.last_error).toContain(failure.description);
                expect(await service.refresh()).toBe(false);
            }
            expect(calls).toBe(4);
            broken = false;
            db.query('UPDATE hot_collector_state SET next_attempt_at=NULL,last_attempt_at=NULL WHERE id=1').run();
            expect(await service.refresh()).toBe(true);
            expect(db.query('SELECT failures,last_error FROM hot_collector_state').get()).toEqual({ failures: 0, last_error: null });
        }
    });
    it('retains long cooldowns for blocked, rate-limited and invalid pages and honors Retry-After on transient errors', async () => {
        for (const failure of [new CollectorUnavailable(0, 'http_error', 403), new CollectorUnavailable(0, 'http_error', 429), new CollectorUnavailable(0, 'challenge_or_empty'), new CollectorUnavailable(0, 'unexpected_markup'), new CollectorUnavailable(1800, 'http_error', 503)]) {
            db.query('UPDATE hot_collector_state SET failures=0,next_attempt_at=NULL,last_attempt_at=NULL WHERE id=1').run();
            const service = new HotService(db, async () => { throw failure; });
            expect(await service.refresh()).toBe(false);
            const state = db.query('SELECT next_attempt_at,last_error FROM hot_collector_state').get() as any;
            expect(Date.parse(state.next_attempt_at) - Date.now()).toBeGreaterThan(Math.max(600, failure.retryAfterSeconds) * 1000 - 1000);
            expect(state.last_error).toContain(failure.description);
        }
    });
    it('accepts only bounded diagnostic codes without exposing subprocess output or transport secrets', () => {
        expect(parseCollectorFailure('{"error":"http_429","retryAfterSeconds":1800}')).toMatchObject({ code: 'http_error', httpStatus: 429, retryAfterSeconds: 1800, transient: false });
        expect(parseCollectorFailure('{"error":"network_timeout"}')).toMatchObject({ code: 'network_timeout', transient: true });
        expect(parseCollectorFailure('', true)).toMatchObject({ code: 'network_timeout', transient: true });
        for (const stderr of ['COOKIE_TOKEN_SECRET', 'null', '{"error":"COOKIE_TOKEN_SECRET","retryAfterSeconds":-1}', 'A'.repeat(16001)]) {
            const failure = parseCollectorFailure(stderr);
            expect(failure.code).toBe('collector_error');
            expect(failure.description).not.toContain('SECRET');
            expect(failure.retryAfterSeconds).toBe(0);
        }
    });
});

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
