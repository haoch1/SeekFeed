import type { Database } from 'bun:sqlite';
import { linkForumAuthors } from './forumAuthors';

const DAY = 86400000;
const HOUR = 3600000;
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
const stopWords = new Set('一个 这个 什么 有没有 一下 现在 自己 可以 就是 怎么 不是 还是 还有 已经 分享 大家 最近 今天 大佬 关于 目前 问题 求助 请问 知道 没有 感觉 比较 如何 有人 但是 或者 一些 你们 他们 发现 看到 东西 这里 那么 这样 需要 多少 我们 继续 the for and with from http https com www nodeseek'.split(' '));

function titleTerms(titles: { title: string }[]) {
    const counts = new Map<string, number>();
    for (const { title } of titles) {
        const terms = new Set(Array.from(segmenter.segment(title.normalize('NFKC').toLowerCase()))
            .filter(part => part.isWordLike).map(part => part.segment)
            .filter(term => term.length >= 2 && term.length <= 20 && !/^\d+$/.test(term) && !stopWords.has(term)));
        for (const term of terms) counts.set(term, (counts.get(term) || 0) + 1);
    }
    return Array.from(counts, ([term, count]) => ({ term, count })).filter(row => row.count >= 2)
        .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term)).slice(0, 12);
}

export function getAnalytics(db: Database, days: number, offset: number, now = new Date(), category = '') {
    const end = now.getTime();
    const shift = offset * 60000;
    const midnight = Math.floor((end + shift) / DAY) * DAY - shift;
    const earliest = db.query('SELECT MIN(julianday(pub_date)) AS date FROM posts WHERE julianday(pub_date) <= julianday(?)').get(now.toISOString()) as { date: number | null };
    const first = earliest.date === null ? midnight : Math.floor(((earliest.date - 2440587.5) * DAY + shift + 1) / DAY) * DAY - shift;
    const start = days === 0 ? Math.min(first, midnight) : midnight - (days === -1 ? 0 : days - 1) * DAY;
    const from = new Date(start).toISOString();
    const to = now.toISOString();
    // All panels describe the same cohort, selected by publication time.
    const dateScope = 'julianday(pub_date) >= julianday(?) AND julianday(pub_date) <= julianday(?)';
    const scope = dateScope + (category ? ' AND category = ?' : '');
    const cohort = category ? [from, to, category] : [from, to];
    const availableCategories = db.query(`SELECT category, COUNT(*) AS count FROM posts WHERE ${dateScope} GROUP BY category ORDER BY count DESC, category`).all(from, to) as { category: string; count: number }[];
    const totals = db.query(`SELECT COUNT(*) AS posts,
        COALESCE(SUM(push_status IN (1, 3)), 0) AS matched,
        COALESCE(SUM(push_status = 3), 0) AS pushed,
        COALESCE(SUM(push_status = 1), 0) AS pending,
        COALESCE(SUM(push_status = 2), 0) AS unmatched,
        COALESCE(SUM(push_status = 0), 0) AS unprocessed,
        COUNT(DISTINCT NULLIF(TRIM(creator), '')) AS authors
        FROM posts WHERE ${scope}`).get(...cohort) as Record<string, number>;
    const categories = db.query(`SELECT category, COUNT(*) AS count, COUNT(DISTINCT NULLIF(TRIM(creator), '')) AS authors, SUM(push_status IN (1, 3)) AS matched,
        SUM(push_status = 3) AS pushed FROM posts WHERE ${scope}
        GROUP BY category ORDER BY count DESC, category`).all(...cohort) as { category: string; count: number; authors: number; matched: number; pushed: number }[];
    const authors = db.query(`SELECT TRIM(creator) AS creator, COUNT(*) AS count,
        SUM(push_status IN (1, 3)) AS matched FROM posts WHERE ${scope} AND TRIM(creator) <> ''
        GROUP BY TRIM(creator) ORDER BY count DESC, creator LIMIT 50`).all(...cohort) as { creator: string; count: number; matched: number }[];
    const authorDistribution = db.query(`WITH authors AS (SELECT COUNT(*) AS posts FROM posts WHERE ${scope}
        AND TRIM(creator) <> '' GROUP BY TRIM(creator)) SELECT CASE WHEN posts = 1 THEN 0 WHEN posts < 5 THEN 1 WHEN posts < 10 THEN 2 ELSE 3 END AS band,
        COUNT(*) AS authors, SUM(posts) AS posts FROM authors GROUP BY band ORDER BY band`).all(...cohort) as { band: number; authors: number; posts: number }[];
    const activity = db.query(`SELECT CAST(strftime('%w', pub_date, ?) AS INTEGER) AS weekday,
        CAST(strftime('%H', pub_date, ?) AS INTEGER) AS hour, COUNT(*) AS count
        FROM posts WHERE ${scope} GROUP BY weekday, hour`).all(`${offset} minutes`, `${offset} minutes`, ...cohort) as { weekday: number; hour: number; count: number }[];
    const stepDays = Math.max(1, Math.ceil((midnight - start + DAY) / DAY / 60));
    const step = days === -1 ? HOUR : stepDays * DAY;
    const bucketCount = Math.floor((end - start) / step) + 1;
    // Bucket keys use the same UTC start instant as the range predicate, including timezone offsets.
    const buckets = db.query(`SELECT CAST(((julianday(pub_date) - julianday(?)) * 86400000 + 1) / ? AS INTEGER) AS bucket,
        COUNT(*) AS count, SUM(push_status IN (1, 3)) AS matched FROM posts WHERE ${scope}
        GROUP BY bucket ORDER BY bucket`).all(from, step, ...cohort) as { bucket: number; count: number; matched: number }[];
    const byBucket = new Map(buckets.map(row => [row.bucket, row]));
    const trend = Array.from({ length: bucketCount }, (_, bucket) => ({
        time: new Date(start + bucket * step).toISOString(),
        count: byBucket.get(bucket)?.count || 0,
        matched: byBucket.get(bucket)?.matched || 0,
    }));
    const subscriptions = db.query('SELECT COUNT(*) AS total, COALESCE(SUM(enabled = 1), 0) AS active FROM keywords_sub').get() as { total: number; active: number };
    const ranking = db.query(`WITH hits AS (
        SELECT sub_id, COUNT(*) AS matched, SUM(push_status = 3) AS pushed FROM posts
        WHERE ${scope} AND push_status IN (1, 3) AND sub_id IS NOT NULL GROUP BY sub_id
    ), ids AS (SELECT id FROM keywords_sub UNION SELECT sub_id FROM hits)
    SELECT ids.id, s.keyword1, s.keyword2, s.keyword3, s.creator, s.category, s.enabled,
        CASE WHEN s.id IS NULL THEN 1 ELSE 0 END AS deleted,
        COALESCE(h.matched, 0) AS matched, COALESCE(h.pushed, 0) AS pushed
    FROM ids LEFT JOIN keywords_sub s ON s.id = ids.id LEFT JOIN hits h ON h.sub_id = ids.id
    ORDER BY matched DESC, ids.id LIMIT 8`).all(...cohort);
    const ruleStats = db.query(`WITH hits AS (SELECT DISTINCT sub_id FROM posts WHERE ${scope} AND push_status IN (1, 3))
        SELECT COUNT(*) AS active, COALESCE(SUM(id IN (SELECT sub_id FROM hits WHERE sub_id IS NOT NULL)), 0) AS withHits
        FROM keywords_sub WHERE enabled = 1`).get(...cohort) as { active: number; withHits: number };
    const titles = db.query(`SELECT title FROM posts WHERE ${scope} ORDER BY julianday(pub_date) DESC, id DESC LIMIT 5000`).all(...cohort) as { title: string }[];
    const topics = { sample: titles.length, limited: totals.posts > titles.length, terms: titleTerms(titles) };
    const delivery = db.query(`WITH timings AS (
        SELECT ROUND((julianday(push_date) - julianday(pub_date)) * 86400, 3) AS seconds
        FROM posts WHERE ${scope} AND push_status = 3 AND julianday(push_date) >= julianday(pub_date)
    ), ordered AS (SELECT seconds, ROW_NUMBER() OVER (ORDER BY seconds) AS rn, COUNT(*) OVER () AS n FROM timings)
    SELECT COUNT(*) AS samples, AVG(seconds) AS average,
        (SELECT AVG(seconds) FROM ordered WHERE rn IN ((n + 1) / 2, (n + 2) / 2)) AS median,
        (SELECT seconds FROM ordered WHERE rn = CAST((n * 9 + 9) / 10 AS INTEGER)) AS p90,
        COALESCE(SUM(seconds < 60), 0) AS underMinute,
        COALESCE(SUM(seconds >= 60 AND seconds < 300), 0) AS underFive,
        COALESCE(SUM(seconds >= 300 AND seconds < 900), 0) AS underFifteen,
        COALESCE(SUM(seconds >= 900), 0) AS overFifteen FROM timings`).get(...cohort) as {
            samples: number; average: number | null; median: number | null; p90: number | null;
            underMinute: number; underFive: number; underFifteen: number; overFifteen: number;
        };
    return { period: { days, offset, from, to, category, stepDays, calendarDays: Math.round((midnight - start) / DAY) + 1, hourly: days === -1 }, totals, trend, categories, availableCategories, authors: linkForumAuthors(db, authors), authorDistribution, activity, subscriptions, ranking, ruleStats, topics, delivery };
}
