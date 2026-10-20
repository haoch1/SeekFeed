import { describe, expect, it } from 'bun:test';
import { welcomeMessage, postMessage, telegramHelp, recentPostRow, displayTelegramTitle, telegramCommands, subscriptionRow, telegramListMessages, telegramNotice, telegramTimestamp, telegramTestMessage, telegramText } from './messages';
import { TelegramWebhookService } from './webhook';
import { TelegramPushService } from './push';

describe('Telegram message layout and escaping', () => {
    it('uses the plain A layout for account details and safely renders names', () => {
        const message = welcomeMessage('<Peter & Co>', 'peter_test', 123, true);
        expect(message).toContain('&lt;Peter &amp; Co&gt;');
        expect(message).toContain('(@peter_test)');
        expect(message).toContain('\nChat ID <code>123</code> · 已绑定');
        expect(message).toStartWith('<b>SeekFeed · 欢迎回来</b>\n\n账号 ');
        expect(message + telegramHelp).not.toMatch(/\p{Extended_Pictographic}|\u20e3/u);
        expect(telegramHelp).toContain('SeekFeed');
        expect(telegramHelp).not.toContain('\\-');
        expect(telegramHelp).not.toContain('/hot day');
        expect(telegramHelp).not.toContain('/hot week');
        expect(telegramHelp).toContain('榜单下方可切换实时、日榜、周榜');
    });

    it('aligns single and double digit post numbers and normalizes presentation without changing stored titles', () => {
        const post = { post_id: 42, title: '  \u200b【出】标题 & 更多  ' } as any;
        for (const [index, label] of [[0, '01'], [8, '09'], [9, '10']] as const) {
            expect(recentPostRow(post, index)).toStartWith(`<code>${label}</code>  <a `);
            expect(recentPostRow(post, index)).toContain('><b>[出]标题 &amp; 更多</b></a>');
        }
        expect(post.title).toBe('  \u200b【出】标题 & 更多  ');
        expect(displayTelegramTitle('[DMIT] (test)')).toBe('[DMIT] (test)');
    });

    it('keeps recent-post link previews enabled with a plain heading', async () => {
        const service = new TelegramWebhookService({ getRecentPosts: () => [{ post_id: 42, title: '【出】标题' }] } as any, '123:test');
        const replies: any[] = [];
        await (service as any).handlePostCommand({ reply: async (...args: any[]) => replies.push(args) });
        expect(replies[0][0]).toStartWith('<b>SeekFeed · 最近帖子</b>');
        expect(replies[0][0]).toContain('<a href="https://www.nodeseek.com/post-42-1"><b>[出]标题</b></a>');
        expect(replies[0][1].parse_mode).toBe('HTML');
        expect(replies[0][1].link_preview_options.is_disabled).toBe(false);
    });

    it('registers concise native commands and a command menu button', async () => {
        const service = new TelegramWebhookService({} as any, '123:test');
        const calls: any[] = [];
        (service as any).bot.api.setMyCommands = async (commands: any) => calls.push(commands);
        (service as any).bot.api.setChatMenuButton = async (button: any) => calls.push(button);
        expect(await service.setBotCommands()).toBe(true);
        expect(calls[0]).toEqual(telegramCommands);
        expect(calls[1]).toEqual({ menu_button: { type: 'commands' } });
        expect(telegramCommands.every(c => c.description.length <= 20)).toBe(true);
    });

    it('preserves punctuation in titles without creating HTML entities or links from untrusted text', () => {
        const message = postMessage({ post_id: 42, title: '[DMIT] (test) <b> & stuff', creator: 'a<b>', category: 'tech' } as any, { id: 4, keyword1: 'a<&', keyword2: '_b' } as any, '技术');
        expect(message).toContain('[DMIT] (test) &lt;b&gt; &amp; stuff');
        expect(message).toContain('a&lt;&amp; + _b');
        expect(message).toContain('https://www.nodeseek.com/post-42-1');
        expect(message).toContain('作者 a&lt;b&gt; · 技术 · 订阅 #4');
        expect(message).toContain('<a href="https://www.nodeseek.com/post-42-1"><b>[DMIT] (test) &lt;b&gt; &amp; stuff</b></a>');
    });

    it('rejects partial numeric deletion IDs rather than deleting a different subscription', async () => {
        let deleted = false;
        const service = new TelegramWebhookService({ deleteKeywordSub: () => { deleted = true; } } as any, '123:test');
        const replies: string[] = [];
        await (service as any).handleDeleteCommand({ message: { text: '/del 1abc' }, reply: async (text: string) => replies.push(text) });
        expect(deleted).toBe(false);
        expect(replies[0]).toContain('有效的订阅 ID');
    });
});

describe('Shared Telegram templates', () => {
    it('keeps stable subscription IDs and state, with escaped compact metadata', () => {
        const row = subscriptionRow({ id: 42, keyword1: 'a<&', keyword2: 'b', creator: 'a<b>', enabled: 0, exclude_keywords: '已出 & 出号' }, '技术');
        expect(row).toStartWith('<code>#42</code>  a&lt;&amp; + b\n');
        expect(row).toContain('已暂停 · 作者 a&lt;b&gt; · 技术 · 屏蔽 已出 &amp; 出号');
        expect(subscriptionRow({ id: 4 }, '')).toContain('监控中 · 全部分类');
    });

    it('chunks long lists at whole rows with repeated headings and preserves every ID', () => {
        const rows = Array.from({ length: 100 }, (_, i) => subscriptionRow({
            id: i + 1, keyword1: '<&'.repeat(100), keyword2: 'x'.repeat(100), keyword3: 'z'.repeat(100),
            creator: '<&'.repeat(100), exclude_keywords: '<&'.repeat(200),
        }, '技术'));
        const messages = telegramListMessages('订阅列表', rows, '/del 订阅ID  删除订阅');
        expect(messages.length).toBeGreaterThan(1);
        for (const message of messages) {
            expect(message.length).toBeLessThanOrEqual(4096);
            expect(message).toStartWith('<b>SeekFeed · 订阅列表</b>\n\n');
            expect(message.match(/<code>/g)?.length).toBe(message.match(/<\/code>/g)?.length);
            expect(message).not.toMatch(/&(?:amp|lt|gt|quot)?$/);
        }
        const combined = messages.join('\n');
        for (let i = 1; i <= 100; i++) expect(combined.split(`<code>#${i}</code>`).length).toBe(2);
        expect(messages.at(-1)).toEndWith('/del 订阅ID  删除订阅');
        const worstCase = subscriptionRow({ id: 42, keyword1: '"'.repeat(100), keyword2: '"'.repeat(100), keyword3: '"'.repeat(100), creator: '"'.repeat(100), exclude_keywords: '"'.repeat(500) }, '"'.repeat(100));
        expect(telegramListMessages('订阅列表', [worstCase], '/del 订阅ID')[0].length).toBeLessThan(4096);
    });

    it('bounds long forum content without splitting Unicode or modifying user emoji', () => {
        expect(telegramText(' 😀 '.repeat(100), 3)).toBe('😀 😀…');
        const message = postMessage({ post_id: 1, title: '优惠😀<&'.repeat(1000), creator: '<&'.repeat(1000) } as any, { id: 4, keyword1: '<&'.repeat(1000) }, '<&'.repeat(1000));
        expect(message.length).toBeLessThan(4096);
        expect(message).toContain('😀');
        expect(message).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
    });

    it('uses explicit Shanghai time and safe plain notices', () => {
        expect(telegramTimestamp('2026-10-20T02:30:00Z')).toContain('10:30:00');
        expect(telegramTimestamp('invalid')).toBe('');
        const text = telegramNotice('管理通知', '<b>内容 & 标题</b>', '稍后 <重试>');
        expect(text).toBe('<b>SeekFeed · 管理通知</b>\n\n&lt;b&gt;内容 &amp; 标题&lt;/b&gt;\n\n稍后 &lt;重试&gt;');
        expect(telegramTestMessage()).toStartWith('<b>SeekFeed · 推送测试</b>');
        expect(telegramTestMessage()).toContain('UTC+8');
    });

    it('uses HTML only for owned templates and preserves custom test content literally', async () => {
        for (const Service of [TelegramPushService, TelegramWebhookService]) {
            const service = new Service({} as any, '123:test');
            const calls: any[] = [];
            (service as any).bot.api.sendMessage = async (...args: any[]) => { calls.push(args); return {}; };
            await service.sendMessage('42', '<b>用户消息😀</b>');
            await service.sendMessage('42', telegramTestMessage(), true);
            expect(calls[0][1]).toBe('<b>用户消息😀</b>');
            expect(calls[0][2].parse_mode).toBeUndefined();
            expect(calls[1][2].parse_mode).toBe('HTML');
            expect(calls.every(c => c[2].link_preview_options.is_disabled === false)).toBe(true);
        }
        const service = new TelegramPushService({} as any, '123:test');
        const calls: any[] = [];
        (service as any).bot.api.sendMessage = async (...args: any[]) => { calls.push(args); return {}; };
        await service.testSendMessage('42');
        await service.testSendMessage('42', '<b>custom</b>');
        expect(calls[0][1]).toStartWith('<b>SeekFeed · 推送测试</b>');
        expect(calls[0][2].parse_mode).toBe('HTML');
        expect(calls[1][1]).toBe('<b>custom</b>');
        expect(calls[1][2].parse_mode).toBeUndefined();
    });

    it('sends subscription titles with native bold and link formatting in the Bot API payload', async () => {
        const updates: any[] = [];
        const service = new TelegramPushService({
            getBaseConfig: () => ({ chat_id: '42', stop_push: 0 }),
            updatePostPushStatus: (...args: any[]) => updates.push(args),
        } as any, '123:test');
        const calls: any[] = [];
        (service as any).bot.api.config.use(async (_prev: any, method: string, payload: any) => {
            calls.push({ method, payload });
            return { ok: true, result: { message_id: 1 } };
        });
        expect(await service.pushPost({ post_id: 42, title: 'VMISS <优惠> & 😀', creator: 'Tester', category: 'tech' } as any, { id: 4, keyword1: 'vmiss' } as any)).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0].method).toBe('sendMessage');
        expect(calls[0].payload.parse_mode).toBe('HTML');
        expect(calls[0].payload.text).toContain('<a href="https://www.nodeseek.com/post-42-1"><b>VMISS &lt;优惠&gt; &amp; 😀</b></a>');
        expect(calls[0].payload.text).not.toContain('<b>作者');
        expect(updates[0].slice(0, 3)).toEqual([42, 3, 4]);
    });
});

function commandFixture() {
    const calls: any[] = [], config: any = { chat_id: '42', stop_push: 0 };
    let subs: any[] = [{ id: 4, keyword1: 'DMIT', keyword2: 'lax', category: 'tech', enabled: 1 }];
    const db = {
        getBaseConfig: () => config,
        updateBaseConfig: (changes: any) => Object.assign(config, changes),
        getAllKeywordSubs: () => subs,
        createKeywordSub: (sub: any) => { const created = { ...sub, id: 10, enabled: 1 }; subs.push(created); return created; },
        deleteKeywordSub: (id: number) => { const found = subs.some(s => s.id === id); subs = subs.filter(s => s.id !== id); return found; },
        getRecentPosts: () => [{ post_id: 42, title: '标题 <测试>', creator: 'Tester', category: 'tech', pub_date: '2026-10-20T02:00:00Z' }],
    };
    const service = new TelegramWebhookService(db as any, '123:test');
    const bot = (service as any).bot;
    bot.botInfo = { id: 123, is_bot: true, first_name: 'SeekFeed', username: 'seekfeed_test_bot' };
    bot.api.config.use(async (_prev: any, method: string, payload: any) => {
        calls.push({ method, payload });
        return { ok: true, result: { message_id: 1, chat: { id: 42, type: 'private' }, date: 1, text: payload.text } };
    });
    (service as any).setupHandlers();
    let id = 0;
    return { service, calls, db, config, clearSubs: () => { subs = []; }, command: async (text: string, chat = 42) => {
        await bot.handleUpdate({ update_id: ++id, message: {
            message_id: id, date: 1, from: { id: chat, is_bot: false, first_name: '<Tester>' },
            chat: { id: chat, type: 'private' }, text,
            ...(text.startsWith('/') ? { entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] } : {}),
        } });
        return calls.at(-1).payload;
    } };
}

describe('Telegram command layout end to end', () => {
    it('unifies every command reply and empty, validation, permission and failure state', async () => {
        const test = commandFixture();
        for (const text of ['/start', '/help', '/getme', '/list', '/post', '/add DMIT lax', '/add', '/add a b c d', '/del invalid', '/del 999', '/del 10', '/stop', '/resume', '/hot invalid', 'hello']) {
            const payload = await test.command(text);
            expect(payload.text).toStartWith('<b>SeekFeed · ');
            expect(payload.text).not.toMatch(/\p{Extended_Pictographic}|\u20e3/u);
            expect(payload.parse_mode).toBe('HTML');
            expect(payload.text.length).toBeLessThan(4096);
        }
        expect(test.config.stop_push).toBe(0);
        expect((await test.command('/list')).text).toContain('<code>#4</code>  DMIT + lax\n监控中 · 技术');
        for (const text of ['/list', '/post', '/add a', '/del 4', '/stop', '/resume', '/unbind', '/hot', 'hello']) {
            expect((await test.command(text, 99)).text).toContain('没有权限');
        }
        expect((await test.command('/start', 99)).text).toContain('已绑定到其他账号');
        test.clearSubs();
        expect((await test.command('/list')).text).toContain('暂无订阅');
        test.db.getRecentPosts = () => [];
        expect((await test.command('/post')).text).toContain('暂无帖子');
        test.db.createKeywordSub = () => { throw new Error('fixture'); };
        expect((await test.command('/add a')).text).toContain('添加失败');
        test.db.deleteKeywordSub = () => { throw new Error('fixture'); };
        expect((await test.command('/del 4')).text).toContain('删除失败');
        expect((await test.command('/unbind')).text).toContain('绑定已解除');
        expect(test.config.chat_id).toBe('');
        expect((await test.command('/getme')).text).toContain('未绑定');
        expect((await test.command('/start')).text).toContain('账号已绑定');
    });
});
