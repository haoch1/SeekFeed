import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { resolve } from 'node:path';
import { logger } from '../utils/logger';

const metric = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const postSchema = z.object({
    postId: metric.positive(), title: z.string().min(1).max(500), author: z.string().min(1).max(100),
    category: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), categoryLabel: z.string().min(1).max(50),
    views: metric, replies: metric, lastActiveAt: z.string().datetime({ offset: true }), pinned: z.boolean(),
});
const batchSchema = z.object({ posts: z.array(postSchema).min(1).max(250), collectedAt: z.string().datetime({ offset: true }), pages: z.literal(4) });
export type HotBatch = z.infer<typeof batchSchema>;
export type HotPeriod = 'live' | 'day' | 'week';
export type HotSort = 'heat' | 'views' | 'replies';
const MINUTE = 60000;
const HOUR = 60 * MINUTE;

export function heatScore(views: number, replies: number, ageHours: number, live: boolean): number {
    const engagement = Math.log1p(Math.max(0, views)) + 3 * Math.log1p(Math.max(0, replies));
    return engagement / (live ? (1 + Math.max(0, ageHours) / 6) ** 1.5 : 1);
}

export class HotService {
    private timer?: ReturnType<typeof setTimeout>;
    private running = false;
    private inFlight?: Promise<boolean>;
    constructor(private db: Database, private collectBatch: () => Promise<unknown> = collectWithPython) {}

    start() {
        if (this.running || process.env.HOT_COLLECT_ENABLED !== 'true') return;
        this.running = true;
        this.schedule(0);
    }
    stop() { this.running = false; clearTimeout(this.timer); }
    private schedule(delay: number) {
        this.timer = setTimeout(async () => {
            await this.refresh();
            const failures = this.state().failures;
            if (this.running) this.schedule(5 * MINUTE * Math.min(12, 2 ** Math.min(4, failures)));
        }, delay);
    }
    private state() {
        return this.db.query('SELECT * FROM hot_collector_state WHERE id=1').get() as {
            last_attempt_at: string | null; last_success_at: string | null; last_error: string | null;
            failures: number; pages: number; batch_size: number;
        };
    }
    refresh(): Promise<boolean> {
        if (this.inFlight) return this.inFlight;
        const last = this.state().last_attempt_at;
        if (last && Date.now() - Date.parse(last) < MINUTE) return Promise.resolve(false);
        this.inFlight = this.run().finally(() => { this.inFlight = undefined; });
        return this.inFlight;
    }
    private async run() {
        this.db.query('UPDATE hot_collector_state SET last_attempt_at=? WHERE id=1').run(new Date().toISOString());
        try {
            this.saveBatch(await this.collectBatch());
            logger.info('热榜采集完成');
            return true;
        } catch {
            this.db.query("UPDATE hot_collector_state SET failures=failures+1,last_error='采集暂不可用，已保留上次榜单' WHERE id=1").run();
            logger.warn('热榜采集失败，保留缓存并退避重试');
            return false;
        }
    }
    saveBatch(input: unknown, now = new Date()) {
        const batch = batchSchema.parse(input);
        const timestamp = Date.parse(batch.collectedAt);
        if (timestamp > now.getTime() + MINUTE || timestamp < now.getTime() - 5 * MINUTE) throw new Error('Invalid collection time');
        if (this.state().last_success_at && timestamp < Date.parse(this.state().last_success_at!)) throw new Error('Older batch');
        const observedAt = new Date(timestamp).toISOString();
        this.db.transaction(() => {
            const insert = this.db.query(`INSERT INTO hot_posts VALUES (?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(post_id) DO UPDATE SET title=excluded.title,author=excluded.author,category=excluded.category,
                category_label=excluded.category_label,views=excluded.views,replies=excluded.replies,
                last_active_at=excluded.last_active_at,observed_at=excluded.observed_at,pinned=excluded.pinned`);
            for (const row of batch.posts) insert.run(row.postId, row.title, row.author, row.category, row.categoryLabel,
                row.views, row.replies, row.lastActiveAt, observedAt, Number(row.pinned));
            const sample = this.db.query(`INSERT INTO hot_samples VALUES(?,?,?,?)
                ON CONFLICT(post_id,observed_at) DO UPDATE SET views=excluded.views,replies=excluded.replies`);
            for (const row of batch.posts) sample.run(row.postId, observedAt, row.views, row.replies);
            this.db.query('DELETE FROM hot_samples WHERE julianday(observed_at) < julianday(?) - 2.0/24').run(observedAt);
            this.db.query('DELETE FROM hot_samples WHERE post_id IN (SELECT post_id FROM hot_posts WHERE julianday(observed_at) < julianday(?) - 30)').run(observedAt);
            this.db.query("DELETE FROM hot_posts WHERE julianday(observed_at) < julianday(?) - 30").run(observedAt);
            this.db.query('UPDATE hot_collector_state SET last_success_at=?, last_error=NULL,failures=0,pages=?,batch_size=? WHERE id=1')
                .run(observedAt, batch.pages, new Set(batch.posts.map(p => p.postId)).size);
        })();
    }
    ranking(period: HotPeriod = 'live', category = '', sort: HotSort = 'heat', now = new Date(), limit: 30 | 50 | 100 = 30) {
        const state = this.state();
        // Scores stay fixed between successful collections, including while serving stale data.
        const reference = Math.min(now.getTime(), Date.parse(state.last_success_at || now.toISOString()));
        const rows = this.db.query(`SELECT h.*, (SELECT MIN(pub_date) FROM posts p WHERE p.post_id=h.post_id) AS published_at
            FROM hot_posts h WHERE julianday(h.observed_at) <= julianday(?) AND julianday(h.observed_at) >= julianday(?) - 7`)
            .all(now.toISOString(), now.toISOString()) as any[];
        const categories = Array.from(new Map(rows.map(r => [r.category, r.category_label])).entries())
            .map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
        const duration = period === 'day' ? 24 * HOUR : 7 * 24 * HOUR;
        const samples = this.db.query(`SELECT * FROM hot_samples WHERE julianday(observed_at) BETWEEN julianday(?) - 75.0/1440 AND julianday(?) ORDER BY observed_at`)
            .all(new Date(reference).toISOString(), new Date(reference - 4 * MINUTE).toISOString()) as {post_id: number; observed_at: string; views: number; replies: number}[];
        const histories = new Map<number, typeof samples>();
        for (const sample of samples) {
            const history = histories.get(sample.post_id) || [];
            history.push(sample); histories.set(sample.post_id, history);
        }
        const warmingUp = period === 'live' && !samples.length;
        const eligible = rows.filter(row => {
            if (category && row.category !== category) return false;
            if (row.pinned) return false;
            const published = Date.parse(row.published_at || '');
            const inCohort = Number.isFinite(published) && published <= now.getTime() && published >= now.getTime() - (period === 'live' ? 24 * HOUR : duration);
            return inCohort && (period !== 'live' || reference - Date.parse(row.observed_at) <= 15 * MINUTE);
        });
        const ranked = eligible.flatMap(r => {
            const published = Date.parse(r.published_at);
            const history = (histories.get(r.post_id) || []).filter(s => Date.parse(s.observed_at) <= Date.parse(r.observed_at) - 4 * MINUTE);
            // Nearest observation at/before one hour ago, or earliest available inside the hour.
            const baseline = history.filter(s => Date.parse(s.observed_at) <= reference - HOUR).at(-1) || history[0];
            const sincePublication = !baseline && published >= reference - HOUR;
            if (period === 'live' && !warmingUp && !baseline && !sincePublication) return [];
            const growthViews = baseline ? Math.max(0, r.views - baseline.views) : sincePublication ? r.views : 0;
            const growthReplies = baseline ? Math.max(0, r.replies - baseline.replies) : sincePublication ? r.replies : 0;
            const elapsed = Math.max(5 * MINUTE, Date.parse(r.observed_at) - (baseline ? Date.parse(baseline.observed_at) : published));
            const rate = HOUR / elapsed;
            const live = period === 'live';
            return [{
                postId: r.post_id, title: r.title, author: r.author, category: r.category, categoryLabel: r.category_label,
                views: r.views, replies: r.replies, observedAt: r.observed_at, publishedAt: r.published_at,
                growthViews, growthReplies,
                heat: heatScore(live && !warmingUp ? growthViews * rate : r.views, live && !warmingUp ? growthReplies * rate : r.replies,
                    (reference - published) / HOUR, live),
            }];
        }).sort((a, b) => (sort === 'heat' ? b.heat - a.heat : b[sort] - a[sort]) || b.postId - a.postId);
        return { posts: ranked.slice(0, limit), total: ranked.length, categories, period, sort, limit,
            updatedAt: state.last_success_at, stale: !state.last_success_at || now.getTime() - Date.parse(state.last_success_at) > 15 * MINUTE,
            error: state.last_error, busy: Boolean(this.inFlight), enabled: process.env.HOT_COLLECT_ENABLED === 'true',
            coverage: state.batch_size, pages: state.pages, intervalSeconds: 300, warmingUp };
    }
}

async function collectWithPython(): Promise<unknown> {
    const child = Bun.spawn([process.env.HOT_COLLECTOR_PYTHON || 'python3', resolve('collector/collect.py')], {
        stdout: 'pipe', stderr: 'pipe', stdin: 'ignore', env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    const timeout = setTimeout(() => child.kill(), 100000);
    try {
        const [output, , exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
        if (exitCode !== 0 || output.length > 1_000_000) throw new Error('Collector unavailable');
        return JSON.parse(output);
    } finally { clearTimeout(timeout); }
}
