import { afterEach, beforeEach, describe, expect, it, setSystemTime } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { getAnalytics } from './analytics';
import { DatabaseService } from './database';

let db: Database;
const now = new Date('2026-10-20T05:30:00Z');
function post(date: string, status = 2, category = 'tech', creator = 'alice', subId: number | null = null, pushed: string | null = null, title = 'DMIT 香港补货') {
    db.query('INSERT INTO posts (post_id, title, memo, category, creator, push_status, sub_id, pub_date, push_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(Math.random() * 100000, title, '', category, creator, status, subId, date, pushed);
}
beforeEach(() => {
    db = new Database(':memory:');
    for (const name of ['001_initial', '002_add_rss_config', '003_add_telegram_mode', '004_subscription_controls', '005_account_preferences', '010_dismissed_matches', '011_forum_author_links', '012_collection_insights']) {
        db.exec(readFileSync(new URL(`../database/migrations/${name}.sql`, import.meta.url), 'utf8'));
    }
});
afterEach(() => db.close());

describe('coherent publication-time analytics', () => {
    it('bounds shared analytics memory under many user-selected categories', () => {
        const service = new DatabaseService(db);
        for (let i = 0; i < 180; i++) service.getAnalytics(7, 480, `category-${i}`);
        expect((service as any).queryCache.size).toBeLessThanOrEqual(128);
        expect(service.getAnalytics(7, 480, 'tech').period.category).toBe('tech');
    });
    it('filters every overview dimension by one category and retains all filter choices', () => {
        post('2026-10-20T01:00:00Z', 3, 'tech', 'alice', 1, '2026-10-20T01:00:30Z');
        post('2026-10-20T02:00:00Z', 2, 'trade', 'bob');
        post('2026-10-20T03:00:00Z', 2, 'tech', 'alice');
        const data = getAnalytics(db, -1, 480, now, 'tech');
        expect(data.totals.posts).toBe(2);
        expect(data.period.category).toBe('tech');
        expect(data.availableCategories.map(row => row.category)).toEqual(['tech', 'trade']);
        expect(data.categories.map(row => row.category)).toEqual(['tech']);
        expect(data.authors).toEqual([{ creator: 'alice', count: 2, matched: 1 }]);
        expect(data.trend.reduce((sum, row) => sum + row.count, 0)).toBe(2);
        expect(data.activity.reduce((sum, row) => sum + row.count, 0)).toBe(2);
        expect(data.authorDistribution.reduce((sum, row) => sum + row.posts, 0)).toBe(2);
        expect(data.topics.sample).toBe(2);
        expect(data.delivery.samples).toBe(1);
        const empty = getAnalytics(db, -1, 480, now, "' OR 1=1 --");
        expect(empty.totals.posts).toBe(0);
        expect(empty.topics.terms).toEqual([]);
        const service = new DatabaseService(db);
        setSystemTime(now);
        try {
            expect(service.getAnalytics(-1, 480, 'tech').totals.posts).toBe(2);
            expect(service.getAnalytics(-1, 480, 'trade').totals.posts).toBe(1);
            expect(service.getAnalytics(-1, 480).totals.posts).toBe(3);
        } finally { setSystemTime(); }
    });
    it('provides fifty real ranked authors for the selectable author list without truncating totals', () => {
        for (let i = 0; i < 60; i++) {
            for (let count = 0; count <= i; count++) post('2026-10-20T01:00:00Z', 2, 'tech', 'author-' + i);
        }
        const data = getAnalytics(db, -1, 480, now);
        expect(data.authors).toHaveLength(50);
        expect(data.totals.authors).toBe(60);
        expect(data.authors[0]).toMatchObject({ creator: 'author-59', count: 60 });
        expect(data.authors[49]).toMatchObject({ creator: 'author-10', count: 11 });
    });
    it('uses local midnight and exact hourly boundaries for every breakdown', () => {
        post('2026-10-19T15:59:59Z'); // Yesterday in UTC+8.
        post('2026-10-19T16:00:00Z', 1, 'tech', 'alice', 1);
        post('2026-10-20T00:59:59Z', 3, 'trade', 'bob', 1, '2026-10-20T01:00:29Z');
        post('2026-10-20T01:00:00Z', 0);
        post('2026-10-20T05:30:01Z'); // Future data must not leak into charts.
        const data = getAnalytics(db, -1, 480, now);
        expect(data.period.from).toBe('2026-10-19T16:00:00.000Z');
        expect(data.totals).toEqual({ posts: 3, matched: 2, pushed: 1, pending: 1, unmatched: 0, unprocessed: 1, authors: 2 });
        expect(data.trend[0].count).toBe(1);
        expect(data.trend[8].count).toBe(1);
        expect(data.trend[9].count).toBe(1);
        expect(data.trend.reduce((sum, row) => sum + row.count, 0)).toBe(3);
        expect(data.categories.reduce((sum, row) => sum + row.matched, 0)).toBe(2);
        expect(data.activity.reduce((sum, row) => sum + row.count, 0)).toBe(3);
        expect(data.activity.find(row => row.hour === 0)).toEqual({ weekday: 2, hour: 0, count: 1 });
    });
    it('applies 7-day, 30-day and all-time filters to counts, authors, topics and trend together', () => {
        post('2026-09-01T12:00:00Z');
        post('2026-10-01T12:00:00Z');
        post('2026-10-14T00:00:00Z');
        post('2026-10-20T00:00:00Z');
        for (const [days, expected] of [[-1, 1], [7, 2], [30, 3], [0, 4]]) {
            const data = getAnalytics(db, days, 480, now);
            expect(data.totals.posts).toBe(expected);
            expect(data.trend.reduce((sum, row) => sum + row.count, 0)).toBe(expected);
            expect(data.topics.sample).toBe(expected);
            expect(data.authors[0].count).toBe(expected);
        }
    });
    it('retains deleted subscription IDs and separates paused and active rule performance', () => {
        db.exec("INSERT INTO keywords_sub (id, keyword1, enabled) VALUES (7, 'DMIT', 1), (19, 'lax', 0), (30, 'vps', 1)");
        post('2026-10-20T00:00:00Z', 3, 'tech', 'alice', 7, '2026-10-20T00:00:30Z');
        post('2026-10-20T01:00:00Z', 1, 'tech', 'alice', 7);
        post('2026-10-20T01:00:00Z', 3, 'trade', 'bob', 2);
        const data = getAnalytics(db, -1, 480, now);
        expect(data.ranking.map((row: any) => row.id)).toEqual([7, 2, 19, 30]);
        expect(data.ranking[1]).toMatchObject({ deleted: 1, matched: 1, pushed: 1 });
        expect(data.ruleStats).toEqual({ active: 2, withHits: 1 });
        expect(data.subscriptions).toEqual({ total: 3, active: 2 });
    });
    it('includes every category without a top-N cutoff, including newly introduced names', () => {
        for (let category = 0; category < 48; category++) {
            post('2026-10-20T00:00:00Z', 2, category === 47 ? 'future-new-category' : `category-${category}`);
        }
        const data = getAnalytics(db, -1, 480, now);
        expect(data.categories).toHaveLength(48);
        expect(data.categories.find(row => row.category === 'future-new-category')).toMatchObject({ count: 1, authors: 1 });
        expect(data.categories.reduce((sum, row) => sum + row.count, 0)).toBe(data.totals.posts);
    });
    it('groups authors consistently and partitions their contributions by post count', () => {
        for (const [creator, count] of [['alice', 1], ['bob', 3], ['charlie', 7], ['dave', 10]] as const) {
            for (let i = 0; i < count; i++) post('2026-10-20T00:00:00Z', 2, 'tech', i % 2 ? ` ${creator} ` : creator);
        }
        post('2026-10-20T00:00:00Z', 2, 'tech', '');
        const data = getAnalytics(db, -1, 480, now);
        expect(data.totals.authors).toBe(4);
        expect(data.authors[0]).toMatchObject({ creator: 'dave', count: 10 });
        expect(data.authorDistribution).toEqual([
            { band: 0, authors: 1, posts: 1 }, { band: 1, authors: 1, posts: 3 },
            { band: 2, authors: 1, posts: 7 }, { band: 3, authors: 1, posts: 10 },
        ]);
        expect(data.period.calendarDays).toBe(1);
        expect(getAnalytics(db, 7, 480, now).period.calendarDays).toBe(7);
    });
    it('computes median, P90 and non-overlapping latency bins without treating pending as failed', () => {
        for (const seconds of [30, 60, 300, 900]) post('2026-10-20T00:00:00Z', 3, 'tech', 'alice', 1, new Date(Date.parse('2026-10-20T00:00:00Z') + seconds * 1000).toISOString());
        post('2026-10-20T01:00:00Z', 1);
        post('2026-10-20T01:00:00Z', 3, 'tech', 'alice', 1, '2026-10-20T00:00:00Z'); // Invalid negative delay.
        const data = getAnalytics(db, -1, 480, now);
        expect(data.delivery).toEqual({ samples: 4, average: 322.5, median: 180, p90: 900, underMinute: 1, underFive: 1, underFifteen: 1, overFifteen: 1 });
        expect(data.totals.pending).toBe(1);
        expect(data.totals.pushed).toBe(5);
    });
    it('counts a normalized title term at most once per post and excludes filler and single occurrences', () => {
        post('2026-10-20T00:00:00Z', 2, 'tech', 'alice', null, null, 'DMIT DMIT 香港 现在');
        post('2026-10-20T01:00:00Z', 2, 'tech', 'alice', null, null, 'dmit 香港 这里 onlyonce');
        const terms = getAnalytics(db, -1, 480, now).topics.terms;
        expect(terms.find(row => row.term === 'dmit')?.count).toBe(2);
        expect(terms.some(row => ['现在', '这里', 'onlyonce'].includes(row.term))).toBe(false);
    });
    it('returns zero-filled charts and null latency samples for an empty or invalid-date dataset', () => {
        post('not-a-date');
        const data = getAnalytics(db, -1, -210, now);
        expect(data.totals.posts).toBe(0);
        expect(data.trend.length).toBeGreaterThan(0);
        expect(data.trend.every(row => row.count === 0)).toBe(true);
        expect(data.delivery.median).toBeNull();
        expect(data.delivery.samples).toBe(0);
        expect(data.period.from).toBe('2026-10-20T03:30:00.000Z');
    });
    it('bounds the number of all-time chart buckets and still includes every valid post', () => {
        post('2019-01-01T00:00:00Z');
        post('2026-10-20T00:00:00Z');
        const data = getAnalytics(db, 0, 480, now);
        expect(data.trend.length).toBeLessThanOrEqual(61);
        expect(data.trend.reduce((sum, row) => sum + row.count, 0)).toBe(2);
        expect(data.period.stepDays).toBeGreaterThan(1);
    });
    it('invalidates analytics when a subscription is added, paused or deleted', () => {
        const service = new DatabaseService(db);
        expect(service.getAnalytics(0, 480).subscriptions.total).toBe(0);
        const sub = service.createKeywordSub({ keyword1: 'DMIT' });
        expect(service.getAnalytics(0, 480).subscriptions.active).toBe(1);
        service.updateKeywordSub(sub.id!, { enabled: 0 });
        expect(service.getAnalytics(0, 480).subscriptions.active).toBe(0);
        service.deleteKeywordSub(sub.id!);
        expect(service.getAnalytics(0, 480).subscriptions.total).toBe(0);
    });
});
