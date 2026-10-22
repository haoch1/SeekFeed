import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { resolve } from 'node:path';
import { logger } from '../utils/logger';
import cadence from '../config/cadence.json';
import { linkForumPosts } from './forumAuthors';
import { CollectionInsights } from './collectionInsights';

const metric = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const postSchema = z.object({
    postId: metric.positive(), title: z.string().min(1).max(500), author: z.string().min(1).max(100),
    authorId: metric.positive().nullable().optional(),
    category: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), categoryLabel: z.string().min(1).max(50),
    views: metric, replies: metric, lastActiveAt: z.string().datetime({ offset: true }), pinned: z.boolean(),
});
const batchSchema = z.object({ posts: z.array(postSchema).min(1).max(250), collectedAt: z.string().datetime({ offset: true }), pages: z.union([z.literal(2), z.literal(4)]) });
export type HotBatch = z.infer<typeof batchSchema>;
export type HotPeriod = 'live' | 'day' | 'week';
export type HotSort = 'heat' | 'views' | 'replies';
const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const COLLECT_INTERVAL = cadence.hotCollectIntervalSeconds * 1000;

type CollectorFailureCode = 'collector_error' | 'network_timeout' | 'network_error' | 'tls_error' | 'http_error' | 'challenge_or_empty' | 'unexpected_markup' | 'invalid_output';

export class CollectorUnavailable extends Error {
    constructor(public retryAfterSeconds = 0, public code: CollectorFailureCode = 'collector_error', public httpStatus?: number) {
        super('Collector unavailable');
    }
    get description() {
        if (this.code === 'http_error') return this.httpStatus === 429 ? '源站限流（HTTP 429）' : this.httpStatus === 403 ? '源站拒绝访问（HTTP 403）' : `源站响应异常（HTTP ${this.httpStatus}）`;
        return {
            collector_error: '采集进程异常', network_timeout: '采集网络超时', network_error: '采集网络连接异常',
            tls_error: '采集 TLS 校验失败', challenge_or_empty: '源站返回验证页或空页面',
            unexpected_markup: '源站页面结构异常', invalid_output: '采集结果校验失败',
        }[this.code];
    }
    get transient() {
        return this.code === 'network_timeout' || this.code === 'network_error' || (this.code === 'http_error' && this.httpStatus! >= 500);
    }
}

export function parseCollectorFailure(stderr: string, timedOut = false): CollectorUnavailable {
    if (timedOut) return new CollectorUnavailable(0, 'network_timeout');
    if (stderr.length > 16000) return new CollectorUnavailable();
    try {
        const payload = JSON.parse(stderr);
        const parsedRetry = z.number().finite().nonnegative().max(86400).safeParse(payload.retryAfterSeconds);
        const retryAfter = parsedRetry.success ? parsedRetry.data : 0;
        const http = typeof payload.error === 'string' && /^http_[1-5]\d\d$/.test(payload.error) ? Number(payload.error.slice(5)) : undefined;
        if (http) return new CollectorUnavailable(retryAfter, 'http_error', http);
        const code = z.enum(['network_timeout', 'network_error', 'tls_error', 'challenge_or_empty', 'unexpected_markup']).safeParse(payload.error);
        return new CollectorUnavailable(retryAfter, code.success ? code.data : 'collector_error');
    } catch { return new CollectorUnavailable(); }
}

export function heatScore(views: number, replies: number): number {
    return Math.log1p(Math.max(0, views)) + 3 * Math.log1p(Math.max(0, replies));
}

export function weekStart(timestamp: number): number {
    const local = new Date(timestamp + 8 * HOUR);
    const daysSinceMonday = (local.getUTCDay() + 6) % 7;
    return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysSinceMonday) - 8 * HOUR;
}

type HotSample = { post_id: number; observed_at: string; views: number; replies: number };

function recentGrowth(row: HotSample, history: HotSample[], published: number, reference: number) {
    const start = reference - HOUR;
    const observed = Date.parse(row.observed_at);
    let baseline: { views: number; replies: number; timestamp: number };
    if (published >= start) {
        // Every lifetime interaction on a genuinely new post is already inside this window.
        baseline = { views: 0, replies: 0, timestamp: published };
    } else {
        const before = history.filter(sample => Date.parse(sample.observed_at) <= start).at(-1);
        const after = history.find(sample => Date.parse(sample.observed_at) >= start);
        if (before && after && Date.parse(after.observed_at) - Date.parse(before.observed_at) <= 15 * MINUTE) {
            // Interpolate only across normal collection gaps; never extrapolate missing activity.
            const gap = Date.parse(after.observed_at) - Date.parse(before.observed_at);
            const ratio = gap ? (start - Date.parse(before.observed_at)) / gap : 0;
            baseline = { timestamp: start, views: before.views + (after.views - before.views) * ratio,
                replies: before.replies + (after.replies - before.replies) * ratio };
        } else {
            if (!after || observed - Date.parse(after.observed_at) < MINUTE) return null;
            baseline = { ...after, timestamp: Date.parse(after.observed_at) };
        }
    }
    return { growthViews: Math.max(0, Math.round(row.views - baseline.views)),
        growthReplies: Math.max(0, Math.round(row.replies - baseline.replies)),
        sampleMinutes: Math.max(0, Math.round((observed - baseline.timestamp) / MINUTE)) };
}

// Decay the time of observed interactions, not the age of the post. Integrating
// each normal sample interval avoids spikes when the collection cadence changes.
export function liveActivity(history: HotSample[], published: number, reference: number) {
    if (!history.length) return null;
    const points = history.map(sample => ({ timestamp: Date.parse(sample.observed_at), views: sample.views, replies: sample.replies }));
    const first = points[0];
    if (published >= reference - HOUR && published <= first.timestamp && first.timestamp - published <= 15 * MINUTE) {
        points.unshift({ timestamp: published, views: 0, replies: 0 });
    }
    const decay = Math.LN2 / (15 * MINUTE);
    let views = 0, replies = 0, recent = 0, measured = false;
    let peakViews = points[0].views, peakReplies = points[0].replies;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        const dv = Math.max(0, b.views - peakViews), dr = Math.max(0, b.replies - peakReplies);
        peakViews = Math.max(peakViews, b.views); peakReplies = Math.max(peakReplies, b.replies);
        const duration = b.timestamp - a.timestamp;
        if (duration <= 0 || duration > 15 * MINUTE || b.timestamp <= reference - HOUR) continue;
        measured = true;
        const start = Math.max(a.timestamp, reference - HOUR), end = b.timestamp;
        const weight = (Math.exp(-decay * (reference - end)) - Math.exp(-decay * (reference - start))) / (decay * duration);
        views += dv * weight; replies += dr * weight;
        recent += (dv + dr) * Math.max(0, end - Math.max(a.timestamp, reference - 30 * MINUTE)) / duration;
    }
    return measured ? { views, replies, active: recent > 0 } : null;
}

export class HotService {
    private timer?: ReturnType<typeof setTimeout>;
    private running = false;
    private inFlight?: Promise<boolean>;
    private lightRounds = 2;
    constructor(private db: Database, private collectBatch: (full: boolean, authorPost?: number) => Promise<unknown> = collectWithPython) {}

    start() {
        if (this.running || process.env.HOT_COLLECT_ENABLED !== 'true') return;
        this.running = true;
        this.schedule(Math.max(0, Date.parse(this.state().next_attempt_at || '') - Date.now()) || 0);
    }
    stop() { this.running = false; clearTimeout(this.timer); }
    private schedule(delay: number) {
        this.timer = setTimeout(async () => {
            await this.refresh();
            if (this.running) this.schedule(Math.max(1000, Date.parse(this.state().next_attempt_at || '') - Date.now()) || COLLECT_INTERVAL);
        }, delay);
    }
    private state() {
        return this.db.query('SELECT * FROM hot_collector_state WHERE id=1').get() as {
            last_attempt_at: string | null; last_success_at: string | null; last_error: string | null;
            failures: number; pages: number; batch_size: number; next_attempt_at: string | null;
        };
    }
    refresh(): Promise<boolean> {
        if (this.inFlight) return this.inFlight;
        const state = this.state();
        if (state.next_attempt_at && Date.now() < Date.parse(state.next_attempt_at)) return Promise.resolve(false);
        const last = state.last_attempt_at;
        if (last && Date.now() - Date.parse(last) < MINUTE) return Promise.resolve(false);
        this.inFlight = this.run().finally(() => { this.inFlight = undefined; });
        return this.inFlight;
    }
    private async run() {
        const startedAt = new Date().toISOString();
        const insights = new CollectionInsights(this.db);
        this.db.query('UPDATE hot_collector_state SET last_attempt_at=?,next_attempt_at=? WHERE id=1')
            .run(new Date().toISOString(), new Date(Date.now() + COLLECT_INTERVAL).toISOString());
        try {
            const full = this.lightRounds >= 2;
            const authorPost = insights.nextAuthor();
            const input: any = await this.collectBatch(full, authorPost);
            this.saveBatch(input);
            insights.record({ source: 'hot', startedAt, durationMs: Date.now() - Date.parse(startedAt), status: 'success',
                received: input.posts.length, accepted: input.posts.length, pages: input.pages });
            let identityDelay = 0;
            if (authorPost) {
                const identity = z.object({ postId: metric.positive(), creator: z.string().min(1).max(100), authorId: metric.positive() }).safeParse(input.identity);
                const valid = identity.success && identity.data.postId === authorPost && insights.saveAuthor(authorPost, identity.data.creator, identity.data.authorId);
                const failure = input.identityError ? parseCollectorFailure(JSON.stringify(input.identityError)) : null;
                insights.record({ source: 'identity', startedAt, durationMs: Number.isFinite(input.identityDurationMs) ? Math.min(125000, input.identityDurationMs) : Date.now() - Date.parse(startedAt), status: valid ? 'success' : 'failed',
                    received: 1, accepted: Number(valid), errorCode: failure?.code || (valid ? undefined : 'identity_mismatch'), httpStatus: failure?.httpStatus });
                if (!valid) this.db.query('UPDATE author_backfill SET result=? WHERE post_id=?').run(failure?.code || 'identity_mismatch', authorPost);
                if (failure && (failure.httpStatus === 403 || failure.httpStatus === 429 || failure.code === 'challenge_or_empty')) {
                    identityDelay = Math.max(10 * MINUTE, failure.retryAfterSeconds * 1000);
                    // Do not let successive historical lookups repeatedly stall a healthy list collector.
                    this.db.query('UPDATE author_backfill_state SET next_attempt_at=? WHERE id=1')
                        .run(new Date(Date.now() + Math.max(6 * HOUR, identityDelay)).toISOString());
                }
            }
            this.lightRounds = full ? 0 : this.lightRounds + 1;
            this.db.query('UPDATE hot_collector_state SET next_attempt_at=? WHERE id=1')
                .run(new Date(Date.now() + Math.max(identityDelay, COLLECT_INTERVAL) + Math.random() * 15 * 1000).toISOString());
            logger.info('热榜采集完成');
            return true;
        } catch (error) {
            this.db.query("DELETE FROM author_backfill WHERE result='pending'").run();
            const failure = error instanceof CollectorUnavailable ? error : new CollectorUnavailable(0, error instanceof z.ZodError ? 'invalid_output' : 'collector_error');
            const issue = error instanceof z.ZodError ? error.issues[0] : null;
            const validationCode = issue ? `invalid_${issue.path.filter(part => typeof part === 'string').join('_')}`.slice(0, 48).toLowerCase() : undefined;
            insights.record({ source: 'hot', startedAt, durationMs: Date.now() - Date.parse(startedAt), status: 'failed', errorCode: validationCode || failure.code, httpStatus: failure.httpStatus });
            const failures = this.state().failures + 1;
            const retryAfter = Number.isFinite(failure.retryAfterSeconds) ? Math.max(0, Math.min(86400, failure.retryAfterSeconds)) * 1000 : 0;
            const backoff = failure.transient ? Math.min(5 * MINUTE, COLLECT_INTERVAL * 2 ** Math.min(3, failures - 1))
                : 10 * MINUTE * Math.min(6, 2 ** Math.min(3, failures - 1));
            const delay = Math.max(backoff, retryAfter);
            this.db.query('UPDATE hot_collector_state SET failures=failures+1,last_error=?,next_attempt_at=? WHERE id=1')
                .run(`${failure.description}，已保留上次榜单`, new Date(Date.now() + delay).toISOString());
            logger.warn(`热榜采集失败：${failure.description}；${Math.ceil(delay / 1000)} 秒后重试`);
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
            const identity = this.db.query(`INSERT INTO forum_post_authors(post_id, creator, author_id, observed_at) VALUES(?,?,?,?)
                ON CONFLICT(post_id) DO UPDATE SET creator=excluded.creator,author_id=excluded.author_id,observed_at=excluded.observed_at`);
            for (const row of batch.posts) {
                if (row.authorId) identity.run(row.postId, row.author.trim(), row.authorId, observedAt);
            }
            const sample = this.db.query(`INSERT INTO hot_samples VALUES(?,?,?,?)
                ON CONFLICT(post_id,observed_at) DO UPDATE SET views=excluded.views,replies=excluded.replies`);
            for (const row of batch.posts) sample.run(row.postId, observedAt, row.views, row.replies);
            const insights = new CollectionInsights(this.db);
            for (const row of batch.posts) insights.sample(row.postId, row.views, row.replies, observedAt);
            this.db.query('DELETE FROM hot_metric_hourly WHERE bucket < ?').run(new Date(timestamp - 30 * 24 * HOUR).toISOString());
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
        const live = period === 'live';
        const cohortStart = period === 'week' ? weekStart(reference) : reference - 24 * HOUR;
        const samples = this.db.query(`SELECT * FROM hot_samples WHERE julianday(observed_at) BETWEEN julianday(?) - 75.0/1440 AND julianday(?) ORDER BY observed_at`)
            .all(new Date(reference).toISOString(), new Date(reference).toISOString()) as HotSample[];
        const histories = new Map<number, typeof samples>();
        for (const sample of samples) {
            const history = histories.get(sample.post_id) || [];
            history.push(sample); histories.set(sample.post_id, history);
        }
        const eligible = rows.filter(row => {
            if (category && row.category !== category) return false;
            if (row.pinned) return false;
            const published = Date.parse(row.published_at || '');
            const inCohort = Number.isFinite(published) && published <= reference && published >= cohortStart;
            return inCohort && (!live || reference - Date.parse(row.observed_at) <= 15 * MINUTE);
        });
        let cold = 0;
        const ranked = eligible.flatMap(r => {
            const published = Date.parse(r.published_at);
            const history = (histories.get(r.post_id) || []).filter(sample => Date.parse(sample.observed_at) <= Date.parse(r.observed_at));
            const growth = recentGrowth(r, history, published, reference);
            const activity = live ? liveActivity(history, published, reference) : null;
            if (live && !activity) { cold++; return []; }
            if (live && !activity!.active) return [];
            return [{
                postId: r.post_id, title: r.title, author: r.author, category: r.category, categoryLabel: r.category_label,
                views: r.views, replies: r.replies, observedAt: r.observed_at, publishedAt: r.published_at,
                growthViews: growth?.growthViews ?? 0, growthReplies: growth?.growthReplies ?? 0,
                sampleMinutes: growth?.sampleMinutes ?? 0,
                heat: heatScore(live ? activity!.views : r.views, live ? activity!.replies : r.replies),
            }];
        }).sort((a, b) => (sort === 'heat' ? b.heat - a.heat : b[sort] - a[sort]) || b.postId - a.postId);
        const warmingUp = live && cold > 0 && ranked.length === 0;
        return { posts: linkForumPosts(this.db, ranked.slice(0, limit), row => ({ postId: row.postId, creator: row.author })), total: ranked.length, categories, period, sort, limit,
            updatedAt: state.last_success_at, stale: !state.last_success_at || now.getTime() - Date.parse(state.last_success_at) > 15 * MINUTE,
            error: state.last_error, busy: Boolean(this.inFlight), enabled: process.env.HOT_COLLECT_ENABLED === 'true',
            coverage: state.batch_size, pages: state.pages, intervalSeconds: cadence.hotCollectIntervalSeconds, nextAttemptAt: state.next_attempt_at, warmingUp };
    }
}

async function collectWithPython(full: boolean, authorPost?: number): Promise<unknown> {
    const child = Bun.spawn([process.env.HOT_COLLECTOR_PYTHON || 'python3', resolve('collector/collect.py'), ...(full ? [] : ['--light']), ...(authorPost ? [`--author-post=${authorPost}`] : [])], {
        stdout: 'pipe', stderr: 'pipe', stdin: 'ignore', env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; child.kill(); }, 125000);
    try {
        const [output, errors, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
        if (exitCode !== 0 || timedOut) throw parseCollectorFailure(errors, timedOut);
        if (output.length > 1_000_000) throw new CollectorUnavailable(0, 'invalid_output');
        try { return JSON.parse(output); } catch { throw new CollectorUnavailable(0, 'invalid_output'); }
    } finally { clearTimeout(timeout); }
}
