import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { analyzeTrade } from '../utils/tradeAnalysis';
import { TradeAnalytics, type TradeQuery } from './tradeAnalytics';
import { TradeLabelsService } from './tradeLabels';

let db: Database, service: TradeAnalytics;
const now = new Date('2026-10-22T03:00:00.000Z');
const query = (overrides: Partial<TradeQuery> = {}) => ({ days: 0, offset: 480, provider: '', region: '', intent: '', asset: '', q: '', priceGroup: '', page: 1, ...overrides });
const seed = (id: number, title: string, memo = '', date = now.toISOString(), category = 'trade') => db.query('INSERT INTO posts(post_id,title,memo,creator,category,pub_date,push_status) VALUES(?,?,?,?,?,?,3)').run(id, title, memo, 'Alice', category, date);
beforeEach(() => {
    db = new Database(':memory:');
    for (const name of ['001_initial', '011_forum_author_links', '013_trade_provider_labels']) db.exec(readFileSync(new URL(`../database/migrations/${name}.sql`, import.meta.url), 'utf8'));
    service = new TradeAnalytics(db);
});
afterEach(() => db.close());

describe('trade evidence extraction', () => {
    it('normalizes observed aliases once, preserves model distinctions and excludes links from evidence', () => {
        const fact = analyzeTrade('【收】大妈 DMIT 香港', 'RN RackNerd 与绿云 Greencloud；https://example.com/vmiss/JPY100');
        expect(fact.providers).toEqual(['DMIT', 'GreenCloud', 'RackNerd']);
        expect(fact.regions).toEqual(['香港']);
        expect(fact.evidence.providers[0]).toEqual({ name: 'DMIT', aliases: ['dmit', '大妈'] });
        expect(fact.prices).toHaveLength(0);
        expect(analyzeTrade('gptx random LAter').providers).toEqual([]);
        expect(analyzeTrade('gptx random LAter').regions).toEqual([]);
    });
    it('prefers title intent and detects colloquial offers without treating body questions as mixed trades', () => {
        expect(analyzeTrade('600元收临期team母号', '有人出吗').intent).toBe('求购');
        expect(analyzeTrade('【已收】溢价30收VMISS TRI').intent).toBe('其他');
        expect(analyzeTrade('剩余价值出 Greencloud', '求购其他套餐').intent).toBe('出售');
        expect(analyzeTrade('【收】VMISS，100出其他机器').intent).toBe('其他');
        expect(analyzeTrade('DMIT仅置换').intent).toBe('其他');
        expect(analyzeTrade('没有统一标准的商品').intent).toBe('其他');
    });
    it('separates source, currency, recurring charge, premium, transfer, remainder and fees', () => {
        const fact = analyzeTrade('【出】DMIT 香港 月付 USD12.50 溢价100元', '总价300元出，剩余价值50元，push费5USD');
        expect(fact.prices).toEqual(expect.arrayContaining([
            expect.objectContaining({ amount: 12.5, currency: 'USD', period: '月', kind: '周期费用', source: 'title' }),
            expect.objectContaining({ amount: 100, currency: 'CNY', kind: '溢价' }),
            expect.objectContaining({ amount: 300, currency: 'CNY', kind: '出售报价', source: 'memo' }),
            expect.objectContaining({ amount: 50, kind: '剩余价值' }),
            expect.objectContaining({ amount: 5, kind: '手续费' }),
        ]));
        expect(analyzeTrade('【出】剩余+10出DMIT').prices[0]).toMatchObject({ amount: 10, currency: '未明确', kind: '溢价' });
        expect(analyzeTrade('DMIT ¥39.90CNY/月 $12USD/年').prices.map(p => [p.currency, p.period])).toEqual([['CNY', '月'], ['USD', '年']]);
    });
    it('retains currency ambiguity and never turns specifications, IPs or partial separators into prices', () => {
        expect(analyzeTrade('出VMISS 4c6g 100GB 5T 45.200.12.1 2027-11-02').prices).toHaveLength(0);
        expect(analyzeTrade('出DMIT 100r 5u 9o $10 ¥20 42刀').prices.map(p => p.currency)).toEqual(Array(6).fill('未明确'));
        expect(analyzeTrade('出DMIT 1,99€ 123456789012345元 EUR1.234,56 VPS$5').prices).toHaveLength(0);
        expect(analyzeTrade('总价1,234.56USD').prices[0]).toMatchObject({ amount: 1234.56, currency: 'USD' });
    });
    it('separates non-server assets and treats delivery and network words only as mentions', () => {
        expect(analyzeTrade('收GPT减金额优惠码').asset).toBe('优惠与邀请码');
        expect(analyzeTrade('出甲骨文升级号').asset).toBe('账号');
        expect(analyzeTrade('出VMISS CN2 GIA 家宽 原邮不包中介费').delivery).toEqual(['原邮箱', '中介']);
        expect(analyzeTrade('出VMISS CN2 GIA 家宽').network).toEqual(['CN2 GIA', '家宽']);
    });
});

describe('public trading analytics', () => {
    it('persists reusable manual fields, literal global aliases and a source-grounded review history without modifying posts', () => {
        seed(1, '收示例机房 香港 60r'); seed(2, '出示例机房 日本 70元出');
        const labels = new TradeLabelsService(db, () => service.invalidate());
        const before = db.query('SELECT * FROM posts').all();
        expect(labels.save(1, { provider: 'ExampleHost', intent: '出售', region: '德国', asset: '账号', prices: [{ text: '60r', amount: 60, currency: 'CNY', kind: '出售报价', period: '不适用', source: 'manual' }] }, '示例机房').status).toBe(200);
        const d = service.query(query(), now), marked = d.records.find(r => r.post_id === 1)!;
        expect(marked.fact).toMatchObject({ providers: ['ExampleHost'], intent: '出售', regions: ['德国'], asset: '账号', manualFields: ['provider', 'intent', 'region', 'asset', 'prices'] });
        expect(d.records.find(r => r.post_id === 2)?.fact.providers).toEqual(['ExampleHost']);
        expect(labels.read().recentProviders).toContain('ExampleHost');
        expect(labels.read(true).events?.find((r: any) => r.action === 'set_post')).toMatchObject({ source_title: '收示例机房 香港 60r', labels: { human: { provider: 'ExampleHost' }, automatic: { intent: '求购' }, ruleVersion: 2 } });
        expect(db.query('SELECT * FROM posts').all()).toEqual(before);
        const alias = labels.read().aliases[0] as any;
        expect(labels.removeAlias(alias.id)).toBe(true);
        expect(labels.save(1, {}).status).toBe(200);
        expect(service.query(query(), now).records.find(r => r.post_id === 2)?.fact.providers).toEqual([]);
        expect(labels.read().recentProviders).toContain('ExampleHost');
        expect(labels.read(true).events).toHaveLength(4);
    });
    it('suspends stale manual fields after source edits and preserves the previous confirmed example', () => {
        seed(1, '收示例商家');
        const labels = new TradeLabelsService(db, () => service.invalidate());
        labels.save(1, { intent: '出售', provider: 'ExampleHost' });
        db.query('UPDATE posts SET title=?').run('收DMIT');
        const changed = service.query(query(), now).records[0];
        expect(changed.fact).toMatchObject({ providers: ['DMIT'], intent: '求购', needsReview: true, manualFields: [] });
        expect(labels.read(true).events?.[0]).toMatchObject({ source_title: '收示例商家' });
        expect(labels.save(1, { provider: 'ExampleHost', intent: '出售' }).status).toBe(200);
        expect(service.query(query(), now).records[0].fact.needsReview).toBe(false);
    });
    it('rejects invalid alias evidence and conflicts atomically and treats regex metacharacters literally', () => {
        seed(1, '收VMISS Example.Host');
        const labels = new TradeLabelsService(db, () => service.invalidate());
        expect(labels.save(1, { provider: 'ExampleHost' }, 'not-in-the-post').status).toBe(400);
        expect(labels.save(1, { provider: 'ExampleHost' }, 'vmiss').status).toBe(409);
        expect(labels.read().annotation).toBeNull(); expect(labels.read(true).events).toHaveLength(0);
        expect(labels.save(1, { provider: 'ExampleHost' }, 'Example.Host').status).toBe(200);
        seed(2, '出ExampleXHost');
        service.invalidate();
        expect(service.query(query(), now).records.find(r => r.post_id === 2)?.fact.providers).toEqual([]);
        expect(labels.save(1, { provider: 'examplehost' }).status).toBe(200);
        expect(labels.read().providers.filter(p => p.toLowerCase() === 'examplehost')).toEqual(['ExampleHost']);
    });
    it('counts posts, normalizes multi-label facets and applies combined filters with real evidence', () => {
        seed(1, '【收】大妈 香港 300元收'); seed(2, '【出】DMIT 香港 500元出'); seed(3, '【出】VMISS 日本 50CAD/月');
        seed(4, '【出】VMISS', '', now.toISOString(), 'info');
        const data = service.query(query(), now);
        expect(data.totals).toMatchObject({ posts: 3, sellers: 2, buyers: 1 });
        expect(data.providers.find(p => p.name === 'DMIT')).toMatchObject({ count: 2, buy: 1, sell: 1 });
        expect(service.query(query({ provider: 'DMIT', intent: '求购', region: '香港' }), now).records.map(p => p.post_id)).toEqual([1]);
        expect(service.query(query({ q: '500元' }), now).totals.posts).toBe(1);
        expect(service.query(query({ provider: "' OR 1=1 --" }), now).totals.posts).toBe(0);
        expect(JSON.stringify(data)).not.toMatch(/push_status|sub_id|match_dismissed|push_date|password|bot_token/);
    });
    it('never pools ambiguous currencies, repeated alternatives, ended offers or multiple providers', () => {
        seed(1, 'DMIT 总价100元出', '100元出'); seed(2, 'DMIT 总价200元出');
        seed(3, 'DMIT 总价300刀出'); seed(4, '【已出】DMIT 总价900元出');
        seed(5, 'DMIT VMISS 总价700元出'); seed(6, 'DMIT 总价50元出，另一台总价80元出');
        const data = service.query(query({ priceGroup: 'CNY · 出售报价 · 不适用' }), now);
        expect(data.pricing).toMatchObject({ samples: 2, median: 150, q1: 125, q3: 175 });
        expect(data.pricing.histogram.reduce((sum, b) => sum + b.count, 0)).toBe(2);
        expect(data.coverage.comparable).toBe(2);
    });
    it('respects local midnight and future dates and shows only the collected elapsed day range', () => {
        seed(1, '收DMIT', '', '2026-10-21T15:59:59.000Z'); seed(2, '收DMIT', '', '2026-10-21T16:00:00.000Z'); seed(3, '收DMIT', '', '2026-10-23T00:00:00.000Z');
        const today = service.query(query({ days: -1 }), now);
        expect(today.totals.posts).toBe(1); expect(today.trend.map(p => p.date)).toEqual(['2026-10-22']);
        expect(service.query(query(), now).totals.posts).toBe(2);
    });
    it('refreshes edited evidence with a bounded single dataset cache and paginates empty and large results', () => {
        seed(1, '收DMIT');
        expect(service.query(query(), now).providers[0].name).toBe('DMIT');
        db.query('UPDATE posts SET title=?').run('收VMISS');
        expect(service.query(query(), new Date(now.getTime() + 11000)).providers[0].name).toBe('VMISS');
        for (let id = 2; id <= 43; id++) seed(id, '收VMISS');
        const d = service.query(query({ page: 99 }), new Date(now.getTime() + 22000));
        expect(d.page).toBe(3); expect(d.records).toHaveLength(3);
        expect(service.query(query({ q: 'does-not-exist' }), now).pricing.samples).toBe(0);
    });
});
