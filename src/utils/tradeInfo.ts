export type TradeInfo = { intent?: string; providers: string[]; regions: string[]; prices: { text: string; amount: string; currency: string; period?: string; kind: string }[]; source: 'title'; version: 1 };

// Conservative title-only extraction. No inferred currency, conversion or subscription matching.
export function extractTradeInfo(title: string, category: string): TradeInfo | null {
    if (category !== 'trade' && category !== '交易') return null;
    const text = title.normalize('NFKC');
    const intent = /已出|已收|已售|结贴/.test(text) ? '已结束' : /求购|求收|(?:^|[\s【\[(])收/.test(text) ? '求购'
        : /出售|转让|(?:^|[\s【\[(])出/.test(text) ? '转让' : undefined;
    const providers = ['DMIT', 'VMISS', 'BageVM', '搬瓦工', 'HostDare', 'RackNerd', 'BuyVM', 'Netcup', 'Hetzner', 'PPFlight', 'Skyline', 'Akile', 'CloudCone']
        .filter(name => new RegExp(`(?<![a-z])${name}(?![a-z])`, 'i').test(text));
    const regions = [...new Set((text.match(/香港|新加坡|日本|东京|大阪|美国|洛杉矶|圣何塞|德国|英国|韩国|台湾|\b(?:HKG|SG|SGP|JP|JPN|LAX|SJC|US|DE|UK|KR|TW)\b/gi) || []).map(value => value.toUpperCase()))];
    const prices: TradeInfo['prices'] = [];
    const amount = '(\\d{1,7}(?:,\\d{3})*(?:\\.\\d{1,4})?)';
    const pattern = new RegExp(`((?:USD|CNY|RMB|EUR|GBP|HKD|SGD|CAD|AUD|US\\$|HK\\$|S\\$|[$¥￥€£])\\s*${amount}|${amount}\\s*(?:USD|CNY|RMB|EUR|GBP|HKD|SGD|CAD|AUD|元|块|刀|美元|美金|人民币|欧元|英镑|港币|新币|[$¥￥€£]))`, 'gi');
    for (const match of text.matchAll(pattern)) {
        const raw = match[0], number = match[2] || match[3];
        const preceding = text[match.index! - 1] || '';
        const following = text.slice(match.index! + raw.length);
        // Reject partial numeric tokens, including unsupported comma-decimal locales.
        // A title such as 1,99€ must never silently become 99€.
        if (/[\d.,]/.test(preceding) || /^[.,]\d/.test(following) || (/^[a-z]/i.test(raw) && /[a-z]/i.test(preceding))) continue;
        const after = text.slice(match.index! + raw.length, match.index! + raw.length + 8);
        const before = text.slice(Math.max(0, match.index! - 4), match.index!);
        const period = /^(?:\s|\/)*(?:月|mo\b|month)/i.test(after) ? '月' : /^(?:\s|\/)*(?:年|yr\b|year)/i.test(after) ? '年'
            : /^(?:\s|\/)*季/.test(after) ? '季' : undefined;
        const currency = /USD|US\$|美元|美金/i.test(raw) ? 'USD' : /HKD|HK\$|港币/i.test(raw) ? 'HKD' : /SGD|S\$|新币/i.test(raw) ? 'SGD'
            : /CNY|RMB|人民币|元|块/i.test(raw) && !/欧元/.test(raw) ? 'CNY' : /EUR|€|欧元/i.test(raw) ? 'EUR'
            : /GBP|£|英镑/i.test(raw) ? 'GBP' : /CAD/i.test(raw) ? 'CAD' : /AUD/i.test(raw) ? 'AUD' : '未明确';
        prices.push({ text: raw + (period ? after.match(/^[\s/]*(?:月付?|年付?|季付?|mo\b|month|yr\b|year)/i)?.[0] || '' : ''),
            amount: number.replace(/,/g, ''), currency, period,
            kind: /溢价|加价/.test(before) ? '溢价' : period ? '周期费用' : '金额' });
        if (prices.length >= 4) break;
    }
    if (!intent && !providers.length && !regions.length && !prices.length) return null;
    return { intent, providers, regions: regions.slice(0, 5), prices, source: 'title', version: 1 };
}
