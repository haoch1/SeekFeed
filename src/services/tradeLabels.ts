import type { Database } from 'bun:sqlite';
import type { TradeLabels } from '../utils/tradeAnalysis';
import { analyzeTrade, matchTradeAlias } from '../utils/tradeAnalysis';
import dictionary from '../config/trade-dictionary.json';

export class TradeLabelsService {
    constructor(private db: Database, private invalidate: () => void) {}
    read(exportAll = false, postId?: number) {
        const annotations = (this.db.query('SELECT * FROM trade_annotations ORDER BY updated_at DESC').all() as any[]).map(row => ({ ...row, labels: JSON.parse(row.labels_json), labels_json: undefined }));
        const aliases = this.db.query('SELECT * FROM trade_provider_aliases ORDER BY updated_at DESC').all() as any[];
        const catalog = this.db.query('SELECT * FROM trade_providers ORDER BY last_used_at DESC,name').all() as { name: string; created_at: string; last_used_at: string }[];
        const recentProviders = catalog.map(row => row.name);
        return {
            annotation: annotations.find(row => row.post_id === postId) || null,
            providers: [...new Set([...recentProviders, ...Object.keys(dictionary.providers)])], recentProviders: recentProviders.slice(0, 8),
            annotations: exportAll ? annotations : undefined, aliases, catalog: exportAll ? catalog : undefined,
            events: exportAll ? this.db.query('SELECT * FROM trade_label_events ORDER BY id').all().map((row: any) => ({ ...row, labels: JSON.parse(row.labels_json), labels_json: undefined })) : undefined,
            version: 1, exportedAt: new Date().toISOString(),
        };
    }
    save(postId: number, labels: TradeLabels, alias?: string) {
        const post = this.db.query("SELECT title,memo FROM posts WHERE post_id=? AND category IN ('trade','交易')").get(postId) as { title: string; memo: string } | null;
        if (!post) return { status: 404 as const, error: '交易帖子不存在' };
        labels = { ...labels };
        if (labels.provider) labels.provider = this.read().providers.find(name => name.toLowerCase() === labels.provider!.toLowerCase()) || labels.provider;
        const cleanAlias = alias?.normalize('NFKC').trim().toLowerCase();
        if (cleanAlias) {
            if (!labels.provider) return { status: 400 as const, error: '保存别名时需要指定商家' };
            const source = `${post.title}\n${post.memo}`.normalize('NFKC').replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[a-z]+/gi, ' ');
            if (!matchTradeAlias(source, cleanAlias)) return { status: 400 as const, error: '该别名未在帖子标题或摘要中出现' };
            const builtin = Object.entries(dictionary.providers).find(([, aliases]) => aliases.some(value => value.toLowerCase() === cleanAlias));
            if (builtin && builtin[0] !== labels.provider) return { status: 409 as const, error: '该别名已有内置商家定义，请使用单帖标记修正' };
            const old = this.db.query('SELECT provider FROM trade_provider_aliases WHERE alias=?').get(cleanAlias) as any;
            if (old && old.provider !== labels.provider) return { status: 409 as const, error: '该别名已指向其他商家，请先在别名管理中删除原规则' };
            if (!old && (this.db.query('SELECT COUNT(*) n FROM trade_provider_aliases').get() as any).n >= 1000) return { status: 400 as const, error: '自定义商家别名已达 1000 条上限' };
        }
        const now = new Date().toISOString();
        this.db.transaction(() => {
            if (labels.provider) this.db.query('INSERT INTO trade_providers VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET last_used_at=excluded.last_used_at').run(labels.provider, now, now);
            if (Object.keys(labels).length) this.db.query(`INSERT INTO trade_annotations VALUES(?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET
                labels_json=excluded.labels_json,source_title=excluded.source_title,source_memo=excluded.source_memo,updated_at=excluded.updated_at`)
                .run(postId, JSON.stringify(labels), post.title, post.memo, now);
            else this.db.query('DELETE FROM trade_annotations WHERE post_id=?').run(postId);
            this.event(Object.keys(labels).length ? 'set_post' : 'restore_post', postId, { human: labels, automatic: analyzeTrade(post.title, post.memo), ruleVersion: dictionary.version }, post, now);
            if (cleanAlias) {
                this.db.query(`INSERT INTO trade_provider_aliases(alias,provider,updated_at) VALUES(?,?,?) ON CONFLICT(alias) DO UPDATE SET updated_at=excluded.updated_at`).run(cleanAlias, labels.provider!, now);
                this.event('set_alias', postId, { alias: cleanAlias, provider: labels.provider }, post, now);
            }
        })();
        this.invalidate(); return { status: 200 as const };
    }
    removeAlias(id: number) {
        const row = this.db.query('SELECT alias,provider FROM trade_provider_aliases WHERE id=?').get(id) as any;
        if (!row) return false;
        this.db.transaction(() => {
            this.event('remove_alias', null, row, { title: '', memo: '' }, new Date().toISOString());
            this.db.query('DELETE FROM trade_provider_aliases WHERE id=?').run(id);
        })();
        this.invalidate(); return true;
    }
    private event(action: string, postId: number | null, labels: unknown, post: { title: string; memo: string }, now: string) {
        this.db.query('INSERT INTO trade_label_events(action,post_id,labels_json,source_title,source_memo,created_at) VALUES(?,?,?,?,?,?)')
            .run(action, postId, JSON.stringify(labels), post.title, post.memo, now);
    }
}
