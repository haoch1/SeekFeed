import dictionary from '../config/trade-dictionary.json';

export type TradePrice = { text: string; amount: number; currency: string; period: string; kind: string; source: 'title' | 'memo' | 'manual' };
export type TradeLabels = { provider?: string; intent?: string; region?: string; asset?: string; prices?: TradePrice[] };
export type TradeFact = ReturnType<typeof analyzeTrade>;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const matchTradeAlias = (text: string, alias: string) => new RegExp(`${/^[a-z]/i.test(alias) ? '(?<![a-z])' : ''}${escape(alias)}${/[a-z]$/i.test(alias) ? '(?![a-z])' : ''}`, 'i').test(text);
const matchAlias = matchTradeAlias;
const entities = (text: string, entries: Record<string, string[]>) => Object.entries(entries).filter(([, aliases]) => aliases.some(alias => matchAlias(text, alias))).map(([name]) => name);
const normalize = (value: string) => value.normalize('NFKC').replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[a-z]+/gi, ' ');

function intent(text: string): string {
    if (/(?:已经|已)(?:出完|售出|出售|出|收|售)|结[帖贴]|交易结束/.test(text)) return '其他';
    const buy = /求购|求收|收(?!款|费|入|益|集)|买(?:个|一|[a-z])|求一[个台]/i.test(text);
    const sell = /出售|转让|在售|(?:^|[\s【\[(「〖])出|[\d元块rR]\s*出|(?:剩余价值|剩余|改邮|改油|打包|push)出|出(?:个|一|台|鸡|售)/i.test(text);
    if (/置换|交换/.test(text) && !buy && !sell) return '其他';
    return buy && sell ? '其他' : buy ? '求购' : sell ? '出售' : '其他';
}

function prices(text: string, source: 'title' | 'memo'): TradePrice[] {
    const result: TradePrice[] = [], occupied: [number, number][] = [];
    const n = '(\\d{1,7}(?:,\\d{3})*(?:\\.\\d{1,4})?)';
    const unit = '(?:USDT|USD|CNY|RMB|EUR|GBP|HKD|SGD|CAD|AUD|NZD|US\\$|HK\\$|S\\$|人民币|美元|美金|欧元|英镑|港币|新币|元|块|刀|欧|[$¥￥€£]|[ruo](?![a-z]))';
    const re = new RegExp(`${unit}\\s*${n}(?:\\s*(?:USDT|USD|CNY|RMB|EUR|GBP|HKD|SGD|CAD|AUD|NZD))?|${n}\\s*${unit}`, 'gi');
    const add = (raw: string, amount: string, index: number, bare = false) => {
        const previous = text[index - 1] || '', after = text.slice(index + raw.length), before = text.slice(Math.max(0, index - 14), index);
        if (/[\d.,]/.test(previous) || /^[.,]\d/.test(after) || (/^[a-z]/i.test(raw) && /[a-z]/i.test(previous))) return;
        const prefixPeriod = before.match(/(?:^|[^\d])(三年|两年|二年|2年|3年|年|月|季)(?:付|费|租)?\s*[:：]?\s*$/)?.[1];
        const suffixPeriod = after.match(/^[\s/·]*(三年|两年|二年|2年|3年|年|月|季|year\b|yr\b|month\b|mo\b)(?:付)?/i)?.[1];
        const p = suffixPeriod || prefixPeriod || '';
        const period = /三年|3年/.test(p) ? '三年' : /两年|二年|2年/.test(p) ? '两年' : /年|year|yr/i.test(p) ? '年' : /月|month|mo/i.test(p) ? '月' : /季/.test(p) ? '季' : '未明确';
        const currency = bare ? '未明确' : /USDT/i.test(raw) ? 'USDT' : /USD|US\$|美元|美金/i.test(raw) ? 'USD' : /HKD|HK\$|港币/i.test(raw) ? 'HKD' : /SGD|S\$|新币/i.test(raw) ? 'SGD' : /CAD/i.test(raw) ? 'CAD' : /AUD/i.test(raw) ? 'AUD' : /NZD/i.test(raw) ? 'NZD' : /EUR|€|欧/i.test(raw) ? 'EUR' : /GBP|£|英镑/i.test(raw) ? 'GBP' : /CNY|RMB|人民币|元|块/i.test(raw) ? 'CNY' : '未明确';
        const context = before.replace(/[\s:：+]+$/g, '');
        let kind = /(?:溢价|加价|折价|溢价\/)\D{0,3}$/.test(context) || /\+\s*$/.test(before) && /^\s*(?:出|收)/.test(after) ? '溢价' : /(?:剩余价值|剩余)\D{0,3}$/.test(context) ? '剩余价值' : /(?:手续费|push费|中介费)\D{0,3}$/i.test(context) ? '手续费' : /(?:总价|售价|明盘|实付卖家|买家总支出|预算|一口价)\D{0,3}$/.test(context) || /^\s*(?:出|收)(?![\d])/i.test(after) ? '出售报价' : period !== '未明确' || /(?:续费|续约价格)\D{0,3}$/.test(context) ? '周期费用' : '金额待分类';
        // A payment method or FX conversion is not a listing price.
        if (/汇率[^。;；]{0,24}$|\d\s*=\s*$|[≈≃]\s*$/.test(before)) kind = '金额待分类';
        result.push({ text: raw.trim(), amount: Number(amount.replace(/,/g, '')), currency, period: kind === '周期费用' ? period : '不适用', kind, source });
        occupied.push([index, index + raw.length]);
    };
    for (const m of text.matchAll(re)) { add(m[0], m[1] || m[2], m.index!); if (result.length >= 16) break; }
    // Bare amounts require an explicit price/transfer context; never infer a currency.
    const bare = new RegExp(`(?:溢价|加价|总价|售价|明盘|预算|剩余价值)\\s*[:：+]?\\s*${n}|${n}\\s*(?=出|收)`, 'g');
    for (const m of text.matchAll(bare)) {
        const number = m[1] || m[2], pos = m.index! + m[0].lastIndexOf(number);
        if (occupied.some(([a, b]) => pos < b && pos + number.length > a)) continue;
        if (/^[\d.,]/.test(text.slice(pos + number.length))) continue;
        add(number, number, pos, true); if (result.length >= 20) break;
    }
    return result;
}

export function analyzeTrade(title: string, memo = '') {
    const head = normalize(title), body = normalize(memo), all = `${head}\n${body}`;
    const providers = entities(all, dictionary.providers), regions = entities(all, dictionary.regions);
    // Intent is taken from the title first; summaries often quote other offers.
    const titleIntent = intent(head), chosenIntent = titleIntent === '其他' && !/(?:已出|已收|已售|结[帖贴]|置换|交换)/.test(head) && !(/收/.test(head) && /出/.test(head)) ? intent(body) : titleIntent;
    const asset = /优惠码|折扣码|减金额|邀请码|注册码|机票|捐赠码/.test(head) ? '优惠与邀请码' : /代充|代购|代续费|接码|车找人|车位|席位|招.*车友/.test(head) ? '服务与席位' : /账号|账户|母号|成品号|升级号|免费号/.test(head) ? '账号' : /域名/.test(head) ? '域名' : /授权|专业版|永久|软件/.test(head) ? '软件授权' : /实体卡|电话卡|esim|流量卡/i.test(head) ? '通信产品' : providers.some(p => !['Google', 'OpenAI', 'Anthropic'].includes(p)) || /VPS|VDS|小鸡|杜甫|服务器|家宽|IPLC|\d[HC]\dG/i.test(head) ? '服务器与网络' : '其他或未明确';
    const found = [...prices(head, 'title'), ...prices(body, 'memo')];
    const unique = found.filter((p, i) => found.findIndex(q => q.amount === p.amount && q.currency === p.currency && q.kind === p.kind && q.period === p.period) === i);
    const cpu = [...all.matchAll(/(?:CPU\s*[:：]?\s*)?(\d{1,3})\s*(?:vCPU\b|cores?\b|核)/gi)].map(m => Number(m[1])).filter(n => n > 0 && n <= 256);
    const ram = [...all.matchAll(/(?:内存|RAM)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(GB?|MB?)\b|(\d+(?:\.\d+)?)\s*(GB?|MB?)\s*(?:RAM|内存)/gi)].map(m => ({ value: Number(m[1] || m[3]), unit: /m/i.test(m[2] || m[4]) ? 'MB' : 'GB' }));
    const delivery = [['PUSH', /push/i], ['改邮箱', /改邮|改油|邮箱转移/], ['原邮箱', /原邮|原油/], ['中介', /中介/]].filter(([, re]) => (re as RegExp).test(all)).map(([name]) => name as string);
    const network = [['CN2 GIA', /CN2[\s.-]*GIA/i], ['三网优化', /三网(?:精品|优化)/], ['家宽', /家宽/], ['IPLC', /IPLC/i], ['NAT', /\bNAT\b/i], ['IPv6 Only', /ipv6[\s-]*only|纯v6/i]].filter(([, re]) => (re as RegExp).test(all)).map(([name]) => name as string);
    return { intent: chosenIntent, closed: /(?:已经|已)(?:出完|售出|出售|出|收|售)|结[帖贴]|交易结束/.test(head), asset, providers, regions, prices: unique, delivery, network, cpu: [...new Set(cpu)], ram,
        evidence: { providers: providers.map(name => ({ name, aliases: dictionary.providers[name as keyof typeof dictionary.providers].filter(alias => matchAlias(all, alias)) })), source: memo ? '标题与RSS摘要' : '标题' }, manualFields: [] as string[], needsReview: false, customAliases: [] as string[], version: dictionary.version };
}
