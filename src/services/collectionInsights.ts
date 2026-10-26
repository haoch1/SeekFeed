import type { Database } from 'bun:sqlite';
import type { ParsedPost } from '../types';

export type CollectionRun = {
    source: 'rss'; startedAt: string; durationMs: number;
    status: 'success' | 'partial' | 'failed'; received?: number; accepted?: number;
    inserted?: number; updated?: number; invalid?: number; pages?: number;
    errorCode?: string; httpStatus?: number;
};
type PostContent = Pick<ParsedPost, 'title' | 'memo' | 'category' | 'creator'>;

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

    sync(posts: ParsedPost[], hasSubscriptions: boolean) {
        return this.db.transaction(() => {
            let inserted = 0, updated = 0;
            const seen = new Set<number>();
            for (const post of posts) {
                if (seen.has(post.post_id)) continue;
                seen.add(post.post_id);
                const old = this.db.query('SELECT title,memo,category,creator FROM posts WHERE post_id=?').get(post.post_id) as PostContent | null;
                const changed = old && (old.title !== post.title || old.memo !== post.memo
                    || old.category !== post.category || old.creator !== post.creator);
                if (!old) {
                    this.db.query(`INSERT INTO posts(post_id,title,memo,category,creator,pub_date,push_status) VALUES(?,?,?,?,?,?,?)`)
                        .run(post.post_id, post.title, post.memo, post.category, post.creator, post.pub_date, hasSubscriptions ? 0 : 2);
                    inserted++;
                } else if (changed) {
                    // Preserve publication time, sent/queued state and dismissed matches.
                    this.db.query(`UPDATE posts SET title=?,memo=?,category=?,creator=?,
                        push_status=CASE WHEN push_status=2 AND match_dismissed=0 AND ? THEN 0 ELSE push_status END
                        WHERE post_id=?`).run(post.title, post.memo, post.category, post.creator, Number(hasSubscriptions), post.post_id);
                    updated++;
                }
            }
            return { new: inserted, updated, skipped: posts.length - inserted - updated };
        })();
    }

    quality() {
        const recent = this.db.query('SELECT * FROM collection_runs ORDER BY id DESC LIMIT 30').all();
        const summary = this.db.query(`SELECT source,COUNT(*) AS runs,SUM(status='failed') AS failed,SUM(invalid) AS invalid,
            SUM(inserted) AS inserted,SUM(updated) AS updated,ROUND(AVG(duration_ms)) AS durationMs,
            MAX(CASE WHEN status<>'failed' THEN started_at END) AS lastSuccess
            FROM collection_runs WHERE julianday(started_at)>=julianday('now')-1 GROUP BY source`).all();
        return { recent, summary, retention: { runsDays: 7 } };
    }
}
