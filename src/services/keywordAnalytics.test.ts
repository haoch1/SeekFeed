import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { getKeywordAnalytics } from './keywordAnalytics';

let db: Database;
let id = 0;
const now = new Date('2026-10-20T05:30:00Z');
function post(date: string, title = 'DMIT 香港', creator = 'alice', category = 'tech', memo = '') {
    db.query('INSERT INTO posts VALUES (?, ?, ?, ?, ?, ?)').run(++id, title, memo, creator, category, date);
}
beforeEach(() => {
    db = new Database(':memory:');
    db.exec(readFileSync(new URL('../database/migrations/011_forum_author_links.sql', import.meta.url), 'utf8'));
    db.exec('CREATE TABLE posts (id INTEGER, title TEXT, memo TEXT, creator TEXT, category TEXT, pub_date TEXT)');
});
afterEach(() => db.close());

describe('keyword publication cohorts', () => {
    it('aligns local midnight, SQL UTC dates and exact hour boundaries across every dimension', () => {
        post('2026-10-19T15:59:59Z');
        post('2026-10-19T16:00:00Z', 'ＤＭＩＴ DMIT 香港', ' alice ');
        post('2026-10-20 00:59:59', 'dmit', 'bob', 'trade');
        post('2026-10-20T09:00:00+08:00', 'dmit 香港');
        post('2026-10-20T05:30:00Z', 'dmit');
        post('2026-10-20T05:30:00.001Z', 'future DMIT');
        post('invalid', 'DMIT');
        const data = getKeywordAnalytics(db, ['DMIT', '香港'], '2026-10-20', 480, 'title', now);
        expect(data.from).toBe('2026-10-19T16:00:00.000Z');
        expect(data.totalPosts).toBe(4);
        expect(data.baseline.hourly.reduce((sum, row) => sum + row.count, 0)).toBe(data.totalPosts);
        expect(data.baseline.daily[6].count).toBe(data.totalPosts);
        expect(data.series[0].total).toBe(4);
        expect(data.series[0].authors).toBe(2);
        expect(data.series[0].hourly.filter(row => row.count).map(row => row.hour)).toEqual([0, 8, 9, 13]);
        expect(data.series[0].hourly[14]).toEqual({ hour: 14, count: 0, available: false });
        expect(data.overlaps).toEqual([{ terms: ['DMIT', '香港'], count: 2 }]);
        for (const series of data.series) {
            expect(series.hourly.reduce((sum, row) => sum + row.count, 0)).toBe(series.total);
            expect(series.categories.reduce((sum, row) => sum + row.count, 0)).toBe(series.total);
            expect(series.daily[6].count).toBe(series.total);
        }
    });
    it('compares the same elapsed time of the previous day and excludes older or later posts', () => {
        post('2026-10-18T15:59:59Z');
        post('2026-10-18T16:00:00Z');
        post('2026-10-19T05:29:59Z');
        post('2026-10-19T05:30:00Z');
        post('2026-10-19T14:00:00Z');
        post('2026-10-19T16:00:00Z');
        expect(getKeywordAnalytics(db, ['dmit'], '2026-10-20', 480, 'title', now).series[0].previous).toBe(2);
        const historical = getKeywordAnalytics(db, ['dmit'], '2026-10-19', 480, 'title', now);
        expect(historical.partial).toBe(false);
        expect(historical.series[0].total).toBe(4);
        expect(historical.series[0].hourly.every(row => row.available)).toBe(true);
        expect(historical.totalPosts).toBe(4);
    });
    it('matches literal text once per post, normalizes case and width and keeps comparisons independent', () => {
        post('2026-10-20T01:00:00Z', 'DMIT dmit 香港', 'alice', 'tech', 'DMIT DMIT');
        post('2026-10-20T02:00:00Z', '别的标题', 'alice', 'tech', '香港 ＤＭＩＴ');
        post('2026-10-20T03:00:00Z', '100% _ [a] .*');
        const terms = ['DMIT', '香港', '.*'];
        const title = getKeywordAnalytics(db, terms, '2026-10-20', 480, 'title', now);
        expect(title.series.map(row => row.total)).toEqual([1, 1, 1]);
        const content = getKeywordAnalytics(db, terms, '2026-10-20', 480, 'content', now);
        expect(content.series.map(row => row.total)).toEqual([2, 2, 1]);
        expect(content.totalPosts).toBe(3);
        expect(content.overlaps.map(row => row.count)).toEqual([2, 0, 0]);
        expect(getKeywordAnalytics(db, ["' OR 1=1 --"], '2026-10-20', 480, 'title', now).series[0].total).toBe(0);
    });
    it('does not truncate categories or counts and returns stable zero-filled empty cohorts', () => {
        for (let i = 0; i < 60; i++) post('2026-10-20T01:00:00Z', 'DMIT', 'author-' + i, 'category-' + i);
        const data = getKeywordAnalytics(db, ['DMIT', 'unmatched'], '2026-10-20', 480, 'title', now);
        expect(data.series[0].categories).toHaveLength(60);
        expect(data.series[0].authors).toBe(60);
        expect(data.series[0].topAuthors).toHaveLength(50);
        expect(data.series[1]).toMatchObject({ total: 0, previous: 0, peak: null, authors: 0, categories: [], topAuthors: [] });
        expect(data.series[1].hourly).toHaveLength(24);
        expect(data.series[1].daily).toHaveLength(7);
    });
    it('handles half-hour western offsets and day/week boundaries without moving dates', () => {
        post('2026-10-20T03:29:59Z');
        post('2026-10-20T03:30:00Z');
        const data = getKeywordAnalytics(db, ['dmit'], '2026-10-20', -210, 'title', now);
        expect(data.from).toBe('2026-10-20T03:30:00.000Z');
        expect(data.series[0].daily.map(row => row.date)).toEqual(['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20']);
        expect(data.series[0].total).toBe(1);
        expect(data.series[0].daily[5].count).toBe(1);
    });
    it('returns all-post denominators without keyword filters or duplicate counting, including partial and empty intervals', () => {
        post('2026-10-19T17:00:00Z', 'DMIT 香港');
        post('2026-10-19T17:20:00Z', '另一篇帖子');
        post('2026-10-19T18:00:00Z', '只有普通文字');
        post('2026-10-20T05:30:00Z', 'DMIT');
        post('2026-10-20T05:30:00.001Z', '未来帖子');
        post('2026-10-18T17:00:00Z', '历史普通帖子');
        const data = getKeywordAnalytics(db, ['DMIT', '香港', '无匹配'], '2026-10-20', 480, 'title', now);
        expect(data.totalPosts).toBe(4);
        expect(data.baseline.hourly[1]).toEqual({ hour: 1, count: 2, available: true });
        expect(data.baseline.hourly[2].count).toBe(1);
        expect(data.baseline.hourly[3].count).toBe(0);
        expect(data.baseline.hourly[13].count).toBe(1);
        expect(data.baseline.hourly[14].available).toBe(false);
        expect(data.baseline.daily.map(row => row.count)).toEqual([0, 0, 0, 0, 0, 1, 4]);
        expect(data.series.map(row => row.total)).toEqual([2, 1, 0]);
        for (const series of data.series) {
            series.hourly.forEach((row, i) => expect(row.count).toBeLessThanOrEqual(data.baseline.hourly[i].count));
            series.daily.forEach((row, i) => expect(row.count).toBeLessThanOrEqual(data.baseline.daily[i].count));
        }
        const content = getKeywordAnalytics(db, ['DMIT'], '2026-10-20', 480, 'content', now);
        expect(content.baseline).toEqual(data.baseline);
        const empty = getKeywordAnalytics(db, ['DMIT'], '2026-10-17', 480, 'title', now);
        expect(empty.totalPosts).toBe(0);
        expect(empty.baseline.hourly.every(row => row.count === 0 && row.available)).toBe(true);
    });
});
