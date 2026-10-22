import type { Database } from 'bun:sqlite';
import { analyzeTrade, matchTradeAlias, type TradeFact, type TradeLabels } from '../utils/tradeAnalysis';
import { linkForumPosts } from './forumAuthors';

export type TradeQuery = { days: number; offset: number; provider: string; region: string; intent: string; asset: string; q: string; page: number; priceGroup: string };
type Row = { post_id: number; title: string; memo: string; creator: string; pub_date: string; fact: TradeFact };
const groupPrice = (p: TradeFact['prices'][number]) => `${p.currency} · ${p.kind} · ${p.period}`;
const comparable = (row: Row) => {
    // Multiple assets/providers and competing quote values cannot be priced as one item.
    if (row.fact.providers.length > 1 || row.fact.regions.length > 1 || row.fact.closed || row.fact.intent === '其他') return [];
    const known = row.fact.prices.filter(p => p.currency !== '未明确' && ['出售报价', '周期费用', '溢价'].includes(p.kind) && (p.kind !== '周期费用' || !['未明确', '不适用'].includes(p.period)));
    return known.filter(p => known.filter(q => groupPrice(q) === groupPrice(p)).length === 1);
};
const counts = (rows: Row[], values: (row: Row) => string[]) => {
    const map = new Map<string, { name: string; count: number; sell: number; buy: number; ended: number }>();
    for (const row of rows) for (const name of new Set(values(row))) {
        const value = map.get(name) || { name, count: 0, sell: 0, buy: 0, ended: 0 };
        value.count++; value.sell += Number(row.fact.intent === '出售'); value.buy += Number(row.fact.intent === '求购'); value.ended += Number(row.fact.closed); map.set(name, value);
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

export class TradeAnalytics {
    private rows: Row[] = [];
    private loadedAt = 0;
    constructor(private db: Database) {}
    invalidate() { this.rows = []; this.loadedAt = 0; }
    private read(now: Date) {
        if (this.loadedAt && now.getTime() - this.loadedAt < 10000) return this.rows;
        const old = new Map(this.rows.map(row => [row.post_id, row]));
        const overrides = new Map((this.db.query('SELECT * FROM trade_annotations').all() as { post_id: number; labels_json: string; source_title: string; source_memo: string }[]).map(row => [row.post_id, row]));
        const aliases = this.db.query('SELECT alias,provider FROM trade_provider_aliases ORDER BY id').all() as { alias: string; provider: string }[];
        // Public fields only: never load subscription/delivery state into this cache.
        this.rows = (this.db.query("SELECT post_id,title,memo,creator,pub_date FROM posts WHERE category IN ('trade','交易') ORDER BY pub_date DESC,post_id DESC").all() as Omit<Row, 'fact'>[]).map(row => {
            const previous = old.get(row.post_id);
            if (previous?.title === row.title && previous.memo === row.memo) return { ...row, fact: previous.fact };
            const fact = analyzeTrade(row.title, row.memo);
            const source = `${row.title}\n${row.memo}`.normalize('NFKC').replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[a-z]+/gi, ' ');
            for (const rule of aliases) if (matchTradeAlias(source, rule.alias)) {
                if (!fact.providers.includes(rule.provider)) fact.providers.push(rule.provider);
                fact.customAliases.push(rule.alias);
                fact.evidence.providers.push({ name: rule.provider, aliases: [rule.alias] });
            }
            const saved = overrides.get(row.post_id);
            if (saved) {
                const labels = JSON.parse(saved.labels_json) as TradeLabels;
                if (saved.source_title !== row.title || saved.source_memo !== row.memo) fact.needsReview = true;
                else {
                    if (labels.provider) fact.providers = [labels.provider];
                    if (labels.intent) fact.intent = labels.intent;
                    if (labels.region) fact.regions = [labels.region];
                    if (labels.asset) fact.asset = labels.asset;
                    if (labels.prices) fact.prices = labels.prices;
                    fact.manualFields = Object.keys(labels);
                }
            }
            return { ...row, fact };
        });
        this.loadedAt = now.getTime(); return this.rows;
    }
    query(input: TradeQuery, now = new Date()) {
        const all = this.read(now);
        const start = input.days === 0 ? 0 : input.days === -1 ? Math.floor((now.getTime() + input.offset * 60000) / 86400000) * 86400000 - input.offset * 60000 : now.getTime() - input.days * 86400000;
        const base = all.filter(row => Date.parse(row.pub_date) >= start && Date.parse(row.pub_date) <= now.getTime());
        const facet = (key: 'providers' | 'regions' | 'intent' | 'asset') => counts(base, row => Array.isArray(row.fact[key]) ? (row.fact[key] as string[]).length ? row.fact[key] as string[] : ['未识别'] : [row.fact[key] as string]).map(v => ({ name: v.name, count: v.count }));
        const search = input.q.normalize('NFKC').toLowerCase();
        const rows = base.filter(row => (!input.provider || (input.provider === '未识别' ? !row.fact.providers.length : row.fact.providers.includes(input.provider))) && (!input.region || (input.region === '未识别' ? !row.fact.regions.length : row.fact.regions.includes(input.region))) && (!input.intent || row.fact.intent === input.intent) && (!input.asset || row.fact.asset === input.asset) && (!search || `${row.title} ${row.memo} ${row.creator}`.normalize('NFKC').toLowerCase().includes(search)));
        const byDay = new Map<string, { date: string; count: number; sell: number; buy: number; ended: number }>();
        for (const row of rows) {
            const date = new Date(Date.parse(row.pub_date) + input.offset * 60000).toISOString().slice(0, 10);
            const item = byDay.get(date) || { date, count: 0, sell: 0, buy: 0, ended: 0 };
            item.count++; item.sell += Number(row.fact.intent === '出售'); item.buy += Number(row.fact.intent === '求购'); item.ended += Number(row.fact.closed); byDay.set(date, item);
        }
        // Fill only elapsed days inside the actual collected interval, never future dates.
        if (base.length) {
            const begin = new Date(Date.parse(base.at(-1)!.pub_date) + input.offset * 60000).toISOString().slice(0, 10);
            const end = new Date(now.getTime() + input.offset * 60000).toISOString().slice(0, 10);
            for (let t = Date.parse(begin); t <= Date.parse(end); t += 86400000) {
                const date = new Date(t).toISOString().slice(0, 10); if (!byDay.has(date)) byDay.set(date, { date, count: 0, sell: 0, buy: 0, ended: 0 });
            }
        }
        const quotes = rows.flatMap(row => comparable(row).map(price => ({ ...price, postId: row.post_id, intent: row.fact.intent })));
        const groups = [...new Set(quotes.map(groupPrice))].sort();
        const selectedGroup = groups.includes(input.priceGroup) ? input.priceGroup : groups.find(g => g === 'CNY · 出售报价 · 不适用') || groups[0] || '';
        const values = quotes.filter(p => groupPrice(p) === selectedGroup).map(p => p.amount).sort((a, b) => a - b);
        const quantile = (p: number) => { if (!values.length) return null; const index = (values.length - 1) * p, lo = Math.floor(index); return Math.round((values[lo] + (values[Math.ceil(index)] - values[lo]) * (index - lo)) * 100) / 100; };
        const max = values.at(-1) || 1, step = Math.max(1, Math.ceil(max / 6));
        const histogram = Array.from({ length: 6 }, (_, i) => ({ min: i * step, max: (i + 1) * step, count: values.filter(n => n >= i * step && (i === 5 ? n <= (i + 1) * step : n < (i + 1) * step)).length }));
        const pageCount = Math.max(1, Math.ceil(rows.length / 20)), page = Math.min(input.page, pageCount);
        return {
            updatedAt: new Date(this.loadedAt).toISOString(), range: { start: base.at(-1)?.pub_date || null, end: base[0]?.pub_date || null, records: base.length, allRecords: all.length },
            totals: { posts: rows.length, sellers: rows.filter(r => r.fact.intent === '出售').length, buyers: rows.filter(r => r.fact.intent === '求购').length, ended: rows.filter(r => r.fact.closed).length, others: rows.filter(r => r.fact.intent === '其他').length, authors: new Set(rows.map(r => r.creator)).size },
            coverage: { providers: rows.filter(r => r.fact.providers.length).length, regions: rows.filter(r => r.fact.regions.length).length, intent: rows.filter(r => r.fact.intent !== '其他').length, money: rows.filter(r => r.fact.prices.length).length, comparable: new Set(quotes.map(p => p.postId)).size, summary: rows.filter(r => r.memo.trim()).length },
            facets: { providers: facet('providers'), regions: facet('regions'), intents: facet('intent'), assets: facet('asset') },
            providers: counts(rows, r => r.fact.providers.length ? r.fact.providers : ['未识别']), regions: counts(rows, r => r.fact.regions.length ? r.fact.regions : ['未识别']),
            assets: counts(rows, r => [r.fact.asset]), delivery: counts(rows, r => r.fact.delivery), network: counts(rows, r => r.fact.network),
            specifications: counts(rows, r => [...r.fact.cpu.map(n => `${n} 核 CPU`), ...r.fact.ram.map(m => `${m.value} ${m.unit} 内存`)]),
            trend: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
            pricing: { groups, selectedGroup, samples: values.length, median: quantile(.5), q1: quantile(.25), q3: quantile(.75), histogram },
            records: linkForumPosts(this.db, rows.slice((page - 1) * 20, page * 20), r => ({ postId: r.post_id, creator: r.creator })), page, pageCount, version: 2,
        };
    }
}
