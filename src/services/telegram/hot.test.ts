import { describe, expect, it } from 'bun:test';
import { hotEntryKeyboard, hotRankingKeyboard, hotRankingMessage, hotRankingPreview } from './hot';
import { TelegramWebhookService } from './webhook';
import { telegramCommands } from './messages';

function ranking(period = 'live', overrides = {}) {
    return { period, posts: Array.from({ length: 10 }, (_, i) => ({
        postId: i + 1, title: `标题 ${i + 1}`, views: 1000, replies: 45, growthViews: 100, growthReplies: 4, categoryLabel: '技术',
    })), updatedAt: '2026-10-20T02:00:00Z', stale: false, error: null, ...overrides } as any;
}

function botFixture() {
    const calls: { method: string; payload: any }[] = [], periods: string[] = [];
    const db = { getBaseConfig: () => ({ chat_id: '42' }), getHotService: () => ({
        ranking: (period: string) => { periods.push(period); return ranking(period); },
    }) };
    const service = new TelegramWebhookService(db as any, '123:test');
    const bot = (service as any).bot;
    bot.botInfo = { id: 123, is_bot: true, first_name: 'SeekFeed', username: 'seekfeed_test_bot' };
    bot.api.config.use(async (_prev: any, method: string, payload: any) => {
        calls.push({ method, payload });
        return { ok: true, result: method === 'answerCallbackQuery' ? true : {
            message_id: 5, chat: { id: 42, type: 'private' }, date: 1, text: payload.text,
        } };
    });
    (service as any).setupHandlers();
    let id = 0;
    const user = { id: 42, is_bot: false, first_name: 'Tester' };
    return { calls, periods, service,
        command: (text: string, chat = 42) => bot.handleUpdate({ update_id: ++id, message: {
            message_id: id, date: 1, from: user, chat: { id: chat, type: 'private' }, text,
            entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }],
        } }),
        click: (data: string, chat = 42) => bot.handleUpdate({ update_id: ++id, callback_query: {
            id: String(id), from: user, chat_instance: 'test', data,
            message: { message_id: 5, date: 1, chat: { id: chat, type: 'private' }, text: 'SeekFeed' },
        } }),
    };
}

describe('Telegram hot ranking', () => {
    it('renders aligned numbers, safe titles, actual zero counts and a bounded message', () => {
        const text = hotRankingMessage(ranking());
        expect(text).toContain('<b>01</b>  <a');
        expect(text).toContain('<b>10</b>  <a');
        expect(text.match(/<b>\d{2}<\/b>  <a/g)).toHaveLength(10);
        expect(text).not.toContain('<code>');
        expect(text.match(/<a href="https:\/\/www\.nodeseek\.com\/post-\d+-1"><b>标题 \d+<\/b><\/a>/g)).toHaveLength(10);
        for (const period of ['live', 'day', 'week']) {
            const message = hotRankingMessage(ranking(period));
            expect(message).toContain('浏览量 1,000 · 回复量 45 · 技术');
            expect(message).not.toMatch(/新增浏览|新增回复/);
        }
        expect(text).toEndWith('更新于 2026/10/20 10:00:00（UTC+8）');
        expect(text).not.toContain('每 5 分钟采集');
        expect(text).not.toContain('仅覆盖');
        expect(text).not.toMatch(/\p{Extended_Pictographic}|\u20e3/u);
        const long = hotRankingMessage(ranking('live', { posts: Array.from({ length: 50 }, () => ({
            postId: 42, title: '<script>&😀'.repeat(300), views: 0, replies: 0, growthViews: 0, growthReplies: 0, categoryLabel: '<&',
        })) }));
        expect(long.length).toBeLessThan(4096);
        expect(long).toContain('浏览量 0 · 回复量 0');
        expect(long).toContain('&lt;script&gt;&amp;');
        expect(long).not.toContain('<script>');
        expect(long.match(/<a /g)!.length).toBeLessThanOrEqual(10);
    });

    it('explicitly previews the current first post for every period and disables previews on an empty board', () => {
        for (const period of ['live', 'day', 'week']) {
            const data = ranking(period);
            data.posts[0].postId = 42;
            expect(hotRankingPreview(data)).toEqual({ is_disabled: false, url: 'https://www.nodeseek.com/post-42-1', prefer_small_media: true, show_above_text: false });
        }
        expect(hotRankingPreview(ranking('live', { posts: [] }))).toEqual({ is_disabled: true });
    });

    it('describes missing and stale data and exposes short native and inline commands', () => {
        expect(hotRankingMessage(ranking('day', { posts: [] }))).toContain('暂无符合时间范围');
        expect(hotRankingMessage(ranking('week', { posts: [], updatedAt: null }))).toContain('榜单准备中');
        expect(hotRankingMessage(ranking('live', { stale: true }))).toContain('上次保存的榜单');
        expect(telegramCommands.some(c => c.command === 'hot')).toBe(true);
        expect(hotEntryKeyboard.inline_keyboard[0][0].callback_data).toBe('hot:open');
        const keyboard = hotRankingKeyboard('day').inline_keyboard;
        expect(keyboard[0].map(b => b.text)).toEqual(['实时', '日榜', '周榜']);
        expect(keyboard.flat().every(b => !/\p{Extended_Pictographic}/u.test(b.text))).toBe(true);
        expect(keyboard[0].map(b => b.style)).toEqual([undefined, 'primary', undefined]);
        expect(hotRankingKeyboard('week').inline_keyboard[0].map(b => b.style)).toEqual([undefined, undefined, 'primary']);
        expect(keyboard[1][0].callback_data).toBe('hot:day');
        expect(keyboard.flat().every(b => Buffer.byteLength(b.callback_data) <= 64)).toBe(true);
    });

    it('dispatches native commands and buttons to the shared cache, edits tabs in place and acknowledges first', async () => {
        const test = botFixture();
        await test.command('/hot');
        await test.command('/hot week');
        await test.click('hot:open');
        await test.click('hot:day');
        await test.click('hot:day');
        expect(test.periods).toEqual(['live', 'week', 'live', 'day', 'day']);
        expect(test.calls.map(c => c.method)).toEqual(['sendMessage', 'sendMessage',
            'answerCallbackQuery', 'sendMessage', 'answerCallbackQuery', 'editMessageText',
            'answerCallbackQuery', 'editMessageText']);
        expect(test.calls[0].payload.reply_markup).toEqual(hotRankingKeyboard('live'));
        expect(test.calls[0].payload.link_preview_options.is_disabled).toBe(false);
        for (const call of test.calls.filter(c => c.method === 'sendMessage' || c.method === 'editMessageText')) {
            expect(call.payload.link_preview_options).toEqual(hotRankingPreview(ranking()));
            expect(call.payload.parse_mode).toBe('HTML');
            expect(call.payload.text).toContain('<b>01</b>  <a');
            expect(call.payload.text).not.toContain('<code>');
            expect(call.payload.text).toContain('<a href="https://www.nodeseek.com/post-1-1"><b>标题 1</b></a>');
        }
        expect(test.calls[5].payload.text).toContain('日榜');
    });

    it('rejects unbound chats and invalid periods before reading ranking data', async () => {
        const test = botFixture();
        await test.command('/hot', 99);
        await test.click('hot:day', 99);
        await test.command('/hot invalid');
        expect(test.periods).toEqual([]);
        expect(test.calls[0].payload.text).toContain('没有权限');
        expect(test.calls[1].payload.show_alert).toBe(true);
        expect(test.calls[2].payload.text).toContain('下方按钮切换');
    });

    it('ignores unchanged refreshes but propagates delivery failures', async () => {
        const test = botFixture();
        const ctx = { chat: { id: 42 }, callbackQuery: { data: 'hot:live' }, answerCallbackQuery: async () => {},
            editMessageText: async () => { throw { description: 'Bad Request: message is not modified' }; } };
        await (test.service as any).handleHotCallback(ctx);
        ctx.editMessageText = async () => { throw new Error('unavailable'); };
        await expect((test.service as any).handleHotCallback(ctx)).rejects.toThrow('unavailable');
    });
});
