import { describe, it, expect } from 'bun:test';
import { extractTradeInfo } from './tradeInfo';

describe('conservative trade title extraction', () => {
    it('separates specifications from amounts, retains evidence and never expands matching content', () => {
        const value = extractTradeInfo('【出】BageVM SG 5G 7T流量 42.59刀年付 溢价100元', 'trade')!;
        expect(value.intent).toBe('转让');
        expect(value.providers).toEqual(['BageVM']);
        expect(value.regions).toEqual(['SG']);
        expect(value.prices).toEqual([
            { text: '42.59刀年付', amount: '42.59', currency: '未明确', period: '年', kind: '周期费用' },
            { text: '100元', amount: '100', currency: 'CNY', period: undefined, kind: '溢价' },
        ]);
        expect(value.source).toBe('title');
    });
    it('preserves explicit currencies, ambiguous dollar symbols, mixed prices and sold status', () => {
        expect(extractTradeInfo('已出 DMIT 香港 USD 12.50/月 EUR 9/年 HK$30 $20', 'trade')?.prices.map(p => p.currency)).toEqual(['USD', 'EUR', 'HKD', '未明确']);
        expect(extractTradeInfo('已出 DMIT 香港', 'trade')?.intent).toBe('已结束');
        expect(extractTradeInfo('求购 VMISS 日本 3核 4G 100GB', 'trade')?.prices).toEqual([]);
        expect(extractTradeInfo('DMIT 价格300元', 'info')).toBeNull();
        expect(extractTradeInfo('这是一条普通交易', 'trade')).toBeNull();
    });
    it('never extracts a partial amount from unsupported separators or an oversized number', () => {
        expect(extractTradeInfo('【出】DMIT EUR 1.234,56 1,99€ 1,234.56USD', 'trade')?.prices)
            .toEqual([{ text: '1,234.56USD', amount: '1234.56', currency: 'USD', period: undefined, kind: '金额' }]);
        expect(extractTradeInfo('【出】DMIT 123456789012345元', 'trade')?.prices).toEqual([]);
        expect(extractTradeInfo('【出】DMIT VPS$5', 'trade')?.prices).toEqual([]);
    });
});
