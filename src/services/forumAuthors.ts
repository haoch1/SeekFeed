import type { Database } from 'bun:sqlite';

// Prefer direct evidence; historical posts may use an unambiguous exact-name mapping.
export function linkForumPosts<T>(db: Database, rows: T[], identity: (row: T) => { postId: number; creator: string }): (T & { authorId?: number })[] {
    if (!rows.length) return rows;
    const identities = rows.map(identity);
    const evidence = db.query(`SELECT post_id, creator, author_id FROM forum_post_authors
        WHERE post_id IN (${identities.map(() => '?').join(',')})`).all(...identities.map(row => row.postId)) as { post_id: number; creator: string; author_id: number }[];
    const byPost = new Map(evidence.map(row => [row.post_id, row]));
    const byName = new Map(linkForumAuthors(db, identities.map(row => ({ creator: row.creator }))).map(row => [row.creator.trim(), row.authorId]));
    return rows.map((row, index) => {
        const known = byPost.get(identities[index].postId);
        if (known) return known.creator === identities[index].creator.trim() ? { ...row, authorId: known.author_id } : row;
        const authorId = byName.get(identities[index].creator.trim());
        return authorId ? { ...row, authorId } : row;
    });
}

// Existing leaderboards group by exact name. Ambiguous names remain plain text.
export function linkForumAuthors<T extends { creator: string }>(db: Database, rows: T[]): (T & { authorId?: number })[] {
    if (!rows.length) return rows;
    const names = [...new Set(rows.map(row => row.creator.trim()))];
    const evidence = db.query(`SELECT creator, MIN(author_id) AS author_id FROM forum_post_authors
        WHERE creator IN (${names.map(() => '?').join(',')}) GROUP BY creator HAVING COUNT(DISTINCT author_id) = 1`)
        .all(...names) as { creator: string; author_id: number }[];
    const byName = new Map(evidence.map(row => [row.creator, row.author_id]));
    return rows.map(row => byName.has(row.creator.trim()) ? { ...row, authorId: byName.get(row.creator.trim())! } : row);
}
