import type { Database } from 'bun:sqlite';

const DAY = 86400000, HOUR = 3600000;
const normalized = (text: string) => text.normalize('NFKC').toLocaleLowerCase('zh-CN');

// Literal matching, once per post per term. Comparison terms may overlap.
export function getKeywordAnalytics(db: Database, terms: string[], date: string, offset: number, scope: 'title' | 'content', now = new Date()) {
    const shift = offset * 60000;
    const start = Date.parse(`${date}T00:00:00Z`) - shift;
    const end = Math.min(start + DAY, now.getTime());
    const elapsed = Math.max(0, end - start);
    const first = start - 6 * DAY;
    type Row = { title: string; memo: string; creator: string; category: string; time: number };
    const rows = db.query(`SELECT title, COALESCE(memo, '') AS memo, COALESCE(creator, '') AS creator,
        COALESCE(category, '') AS category, ROUND((julianday(pub_date) - 2440587.5) * 86400000) AS time FROM posts
        WHERE julianday(pub_date) >= julianday(?) AND julianday(pub_date) < julianday(?)
        AND julianday(pub_date) <= julianday(?) ORDER BY julianday(pub_date), id`)
        .all(new Date(first).toISOString(), new Date(start + DAY).toISOString(), now.toISOString()) as Row[];
    const prepared = rows.map(row => ({ ...row, text: normalized(scope === 'content' ? `${row.title}\n${row.memo}` : row.title) }));
    const dayRows = prepared.filter(row => row.time >= start && row.time < end + (end === now.getTime() ? 1 : 0));
    const series = terms.map(term => {
        const query = normalized(term);
        const matched = prepared.filter(row => row.text.includes(query));
        const today = matched.filter(row => row.time >= start);
        const authors = new Map<string, number>(), categories = new Map<string, number>();
        const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, available: start + hour * HOUR <= now.getTime() }));
        const daily = Array.from({ length: 7 }, (_, index) => ({ date: new Date(first + index * DAY + shift).toISOString().slice(0, 10), count: 0 }));
        for (const row of matched) {
            daily[Math.min(6, Math.floor((row.time - first) / DAY))].count++;
            if (row.time < start) continue;
            hourly[Math.floor((row.time - start) / HOUR)].count++;
            const author = row.creator.trim();
            if (author) authors.set(author, (authors.get(author) || 0) + 1);
            categories.set(row.category, (categories.get(row.category) || 0) + 1);
        }
        const previous = matched.filter(row => row.time >= start - DAY && row.time < start - DAY + elapsed).length;
        const ranked = (map: Map<string, number>, key: string) => [...map].map(([value, count]) => ({ [key]: value, count })).sort((a, b) => b.count - a.count || String(a[key]).localeCompare(String(b[key])));
        const peak = Math.max(...hourly.map(row => row.count));
        return {
            term, total: today.length, previous, authors: authors.size, categoryCount: categories.size,
            hourly, daily, peak: peak ? { hour: hourly.findIndex(row => row.count === peak), count: peak } : null,
            categories: ranked(categories, 'category'), topAuthors: ranked(authors, 'creator').slice(0, 50),
        };
    });
    const earliest = db.query('SELECT MIN(julianday(pub_date)) AS value FROM posts WHERE julianday(pub_date) <= julianday(?)').get(now.toISOString()) as { value: number | null };
    const overlaps = terms.flatMap((term, index) => terms.slice(index + 1).map(other => ({
        terms: [term, other],
        count: dayRows.filter(row => row.text.includes(normalized(term)) && row.text.includes(normalized(other))).length,
    })));
    return {
        date, offset, scope, from: new Date(start).toISOString(), to: new Date(end).toISOString(), partial: elapsed < DAY,
        totalPosts: dayRows.length, series, overlaps,
        coverageFrom: earliest.value === null ? null : new Date((earliest.value - 2440587.5) * DAY).toISOString(),
    };
}
