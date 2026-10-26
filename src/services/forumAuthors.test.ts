import { beforeEach, afterEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { linkForumAuthors, linkForumPosts } from './forumAuthors';
import { DatabaseService } from './database';
import { getAnalytics } from './analytics';
import { getKeywordAnalytics } from './keywordAnalytics';

let db: Database;
const now = new Date('2026-10-22T02:00:00Z');
const identity = (row: { post_id: number; creator: string }) => ({ postId: row.post_id, creator: row.creator });
function evidence(id: number, creator: string, authorId: number) {
    db.query('INSERT INTO forum_post_authors VALUES(?,?,?,?)').run(id, creator, authorId, now.toISOString());
}
function post(id: number, creator = 'Alice') {
    db.query("INSERT INTO posts(post_id,title,memo,creator,category,pub_date,push_status) VALUES(?,'DMIT','',?,'tech',?,3)").run(id, creator, now.toISOString());
}
beforeEach(() => {
    db = new Database(':memory:');
    for (const file of ['001_initial', '002_add_rss_config', '003_add_telegram_mode', '004_subscription_controls', '005_account_preferences', '006_hot_ranking', '007_hot_samples', '008_hot_collector_cooldown', '010_dismissed_matches', '011_forum_author_links', '012_collection_insights', '016_hot_browser_collection', '017_hot_collector_control']) {
        db.exec(readFileSync(new URL(`../database/migrations/${file}.sql`, import.meta.url), 'utf8'));
    }
});
afterEach(() => db.close());

describe('verified public forum profiles', () => {
    it('prefers direct evidence and fills historical posts only from an unambiguous exact name', () => {
        evidence(1, 'Alice', 9);
        evidence(2, 'Bob', 12);
        const rows = [{ post_id: 1, creator: 'Alice' }, { post_id: 2, creator: 'Alice' }, { post_id: 3, creator: 'Alice' }, { post_id: 1, creator: 'alice' }];
        expect(linkForumPosts(db, rows, identity)).toEqual([{ ...rows[0], authorId: 9 }, rows[1], { ...rows[2], authorId: 9 }, rows[3]]);
        expect(rows[0]).not.toHaveProperty('authorId');
        expect(linkForumPosts(db, [], identity)).toEqual([]);
    });
    it('preserves ambiguity across different posts and does not link a same-name leaderboard to either account', () => {
        evidence(1, 'Alice', 9);
        const rows = [{ creator: 'Alice', count: 5 }, { creator: 'alice', count: 2 }];
        expect(linkForumAuthors(db, rows)).toEqual([{ ...rows[0], authorId: 9 }, rows[1]]);
        evidence(2, 'Alice', 12);
        expect(linkForumAuthors(db, rows)).toEqual(rows);
        expect(linkForumPosts(db, [{ post_id: 2, creator: 'Alice' }], identity)[0].authorId).toBe(12);
    });
    it('adds links to feed and both author boards without changing counts, matches or local account IDs', () => {
        post(1); post(2); evidence(1, 'Alice', 9);
        const service = new DatabaseService(db);
        const feed = service.getPostsWithPagination(1, 10);
        expect(feed.posts.find(row => row.post_id === 1)?.authorId).toBe(9);
        expect(feed.posts.find(row => row.post_id === 2)?.authorId).toBe(9);
        expect(feed.total).toBe(2);
        expect(getAnalytics(db, -1, 480, now).authors).toEqual([{ creator: 'Alice', count: 2, matched: 2, authorId: 9 }]);
        expect(getKeywordAnalytics(db, ['DMIT'], '2026-10-22', 480, 'title', now).series[0].topAuthors).toEqual([{ creator: 'Alice', count: 2, authorId: 9 }]);
        expect(db.query('SELECT push_status FROM posts').all()).toEqual([{ push_status: 3 }, { push_status: 3 }]);
    });
});
