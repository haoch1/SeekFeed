import type { Database } from 'bun:sqlite';
import type { ParsedPost, Post } from '../types';

export type CollectionRun = {
    source: 'rss' | 'hot' | 'identity'; startedAt: string; durationMs: number;
    status: 'success' | 'partial' | 'failed'; received?: number; accepted?: number;
    inserted?: number; updated?: number; invalid?: number; pages?: number;
    errorCode?: string; httpStatus?: number;
};
const content = (post: ParsedPost) => ({ title: post.title, memo: post.memo, category: post.category, creator: post.creator });
const HOUR = 3600000;

export class CollectionInsights {
    constructor(private db: Database) {}

    record(run: CollectionRun) {
        // Only controlled codes are stored; transport exceptions can contain credentials.
        const code = run.errorCode && /^[a-z_0-9]{1,48}$/.test(run.errorCode) ? run.errorCode : null;
        this.db.query(`INSERT INTO collection_runs(source,started_at,duration_ms,status,received,accepted,inserted,updated,invalid,pages,error_code,http_status)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(run.source, run.startedAt, Math.max(0, Math.round(run.durationMs)), run.status,
            run.received || 0, run.accepted || 0, run.inserted || 0, run.updated || 0, run.invalid || 0, run.pages || 0, code, run.httpStatus || null);
        this.db.query(`DELETE FROM collection_runs WHERE id NOT IN (SELECT id FROM collection_runs ORDER BY id DESC LIMIT 10000)
            OR julianday(started_at) < julianday('now') - 7`).run();
    }

    sync(posts: ParsedPost[], hasSubscriptions: boolean, now = new Date()) {
        return this.db.transaction(() => {
            let inserted = 0, updated = 0;
            const seen = new Set<number>();
            for (const post of posts) {
                if (seen.has(post.post_id)) continue;
                seen.add(post.post_id);
                const old = this.db.query('SELECT * FROM posts WHERE post_id=?').get(post.post_id) as Post | null;
                const changed = Boolean(old && JSON.stringify(content(old)) !== JSON.stringify(content(post)));
                if (!old) {
                    this.db.query(`INSERT INTO posts(post_id,title,memo,category,creator,pub_date,push_status) VALUES(?,?,?,?,?,?,?)`)
                        .run(post.post_id, post.title, post.memo, post.category, post.creator, post.pub_date, hasSubscriptions ? 0 : 2);
                    inserted++;
                } else if (changed) {
                    this.db.query('INSERT INTO post_revisions(post_id,observed_at,before_json,after_json) VALUES(?,?,?,?)')
                        .run(post.post_id, now.toISOString(), JSON.stringify(content(old)), JSON.stringify(content(post)));
                    // Preserve publication time, sent/queued state and dismissed matches.
                    this.db.query(`UPDATE posts SET title=?,memo=?,category=?,creator=?,
                        push_status=CASE WHEN push_status=2 AND match_dismissed=0 AND ? THEN 0 ELSE push_status END
                        WHERE post_id=?`).run(post.title, post.memo, post.category, post.creator, Number(hasSubscriptions), post.post_id);
                    updated++;
                    this.db.query(`DELETE FROM post_revisions WHERE post_id=? AND id NOT IN
                        (SELECT id FROM post_revisions WHERE post_id=? ORDER BY id DESC LIMIT 20)`).run(post.post_id, post.post_id);
                }
                this.db.query(`INSERT INTO post_observations(post_id,last_seen_at,changed_at,revision_count) VALUES(?,?,?,?)
                    ON CONFLICT(post_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,
                    changed_at=CASE WHEN ? THEN excluded.changed_at ELSE changed_at END,
                    revision_count=revision_count+?`).run(post.post_id, now.toISOString(), changed ? now.toISOString() : null, Number(changed), Number(changed), Number(changed));
            }
            this.db.query("DELETE FROM post_revisions WHERE julianday(observed_at)<julianday(?) - 30").run(now.toISOString());
            return { new: inserted, updated, skipped: posts.length - inserted - updated };
        })();
    }

    revisions(postId: number) {
        return this.db.query('SELECT observed_at,before_json,after_json FROM post_revisions WHERE post_id=? ORDER BY id DESC LIMIT 20')
            .all(postId).map((row: any) => ({ observedAt: row.observed_at, before: JSON.parse(row.before_json), after: JSON.parse(row.after_json) }));
    }

    decorate<T extends { post_id: number }>(posts: T[]) {
        if (!posts.length) return posts;
        const rows = this.db.query(`SELECT post_id,changed_at,revision_count FROM post_observations WHERE post_id IN (${posts.map(() => '?').join(',')})`)
            .all(...posts.map(post => post.post_id)) as any[];
        const byId = new Map(rows.map(row => [row.post_id, row]));
        return posts.map(post => ({ ...post, ...(byId.get(post.post_id) || {}) }));
    }

    nextAuthor(now = new Date()): number | undefined {
        const state = this.db.query('SELECT next_attempt_at FROM author_backfill_state WHERE id=1').get() as any;
        if (Date.parse(state.next_attempt_at) > now.getTime()) return;
        // One representative post per unknown exact name, not a full historical crawl.
        const row = this.db.query(`SELECT MAX(p.post_id) AS post_id FROM posts p
            WHERE p.creator<>'' AND NOT EXISTS(SELECT 1 FROM forum_post_authors a WHERE a.creator=p.creator)
            AND NOT EXISTS(SELECT 1 FROM author_backfill b JOIN posts x ON x.post_id=b.post_id
                WHERE x.creator=p.creator AND julianday(b.attempted_at)>julianday(?) - 7)
            GROUP BY p.creator ORDER BY COUNT(*) DESC,MAX(p.post_id) DESC LIMIT 1`).get(now.toISOString()) as any;
        if (!row) return;
        this.db.query('UPDATE author_backfill_state SET next_attempt_at=? WHERE id=1').run(new Date(now.getTime() + 5 * 60000).toISOString());
        this.db.query('INSERT OR REPLACE INTO author_backfill VALUES(?,?,?)').run(row.post_id, now.toISOString(), 'pending');
        return row.post_id as number;
    }

    saveAuthor(postId: number, creator: string, authorId: number, now = new Date()) {
        const post = this.db.query('SELECT creator FROM posts WHERE post_id=?').get(postId) as any;
        if (!post || creator.trim() !== post.creator || !Number.isSafeInteger(authorId) || authorId <= 0) return false;
        this.db.query(`INSERT INTO forum_post_authors VALUES(?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET
            creator=excluded.creator,author_id=excluded.author_id,observed_at=excluded.observed_at`).run(postId, creator.trim(), authorId, now.toISOString());
        this.db.query('UPDATE author_backfill SET result=? WHERE post_id=?').run('success', postId);
        return true;
    }

    sample(postId: number, views: number, replies: number, observedAt: string) {
        const bucket = new Date(Math.floor(Date.parse(observedAt) / HOUR) * HOUR).toISOString();
        this.db.query(`INSERT INTO hot_metric_hourly VALUES(?,?,?,?,?) ON CONFLICT(post_id,bucket) DO UPDATE SET
            observed_at=excluded.observed_at,views=excluded.views,replies=excluded.replies WHERE excluded.observed_at>observed_at`)
            .run(postId, bucket, observedAt, views, replies);
    }

    history(postId: number, days = 7, now = new Date()) {
        return this.db.query(`SELECT bucket,observed_at AS observedAt,views,replies FROM hot_metric_hourly
            WHERE post_id=? AND bucket>=? AND observed_at<=? ORDER BY bucket`)
            .all(postId, new Date(now.getTime() - days * 24 * HOUR).toISOString(), now.toISOString());
    }

    quality() {
        const recent = this.db.query('SELECT * FROM collection_runs ORDER BY id DESC LIMIT 30').all();
        const summary = this.db.query(`SELECT source,COUNT(*) AS runs,SUM(status='failed') AS failed,SUM(invalid) AS invalid,
            SUM(inserted) AS inserted,SUM(updated) AS updated,ROUND(AVG(duration_ms)) AS durationMs,
            MAX(CASE WHEN status<>'failed' THEN started_at END) AS lastSuccess
            FROM collection_runs WHERE julianday(started_at)>=julianday('now')-1 GROUP BY source`).all();
        const authors = this.db.query(`SELECT COUNT(DISTINCT creator) AS total,
            COUNT(DISTINCT CASE WHEN creator IN(SELECT creator FROM forum_post_authors GROUP BY creator HAVING COUNT(DISTINCT author_id)=1) THEN creator END) AS linked FROM posts WHERE creator<>''`).get();
        return { recent, summary, authors, retention: { runsDays: 7, historyDays: 30, revisionsPerPost: 20 } };
    }
}
