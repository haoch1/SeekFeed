import { describe, expect, it } from 'bun:test';
import { welcomeMessage, postMessage, telegramHelp, recentPostRow, displayTelegramTitle, telegramCommands } from './messages';
import { TelegramWebhookService } from './webhook';

describe('Telegram message layout and escaping', () => {
    it('keeps account details on separated lines and safely renders names', () => {
        const message = welcomeMessage('<Peter & Co>', 'peter_test', 123, true);
        expect(message).toContain('&lt;Peter &amp; Co&gt;');
        expect(message).toContain('(@peter_test)');
        expect(message).toContain('\n\n<b>🆔 Chat ID</b>');
        expect(message).toContain('👤 账号');
        expect(message).toContain('📋 常用命令');
        expect(message + telegramHelp).not.toMatch(/🧪|◇|≡/);
        expect(telegramHelp).toContain('SeekFeed');
        expect(telegramHelp).not.toContain('\\-');
    });

    it('aligns single and double digit post numbers and normalizes presentation without changing stored titles', () => {
        const post = { post_id: 42, title: '  \u200b【出】标题 & 更多  ' } as any;
        for (const [index, label] of [[0, '01'], [8, '09'], [9, '10']] as const) {
            expect(recentPostRow(post, index)).toStartWith(`<code>${label}</code>\u2002<a `);
            expect(recentPostRow(post, index)).toContain('>[出]标题 &amp; 更多</a>');
        }
        expect(post.title).toBe('  \u200b【出】标题 & 更多  ');
        expect(displayTelegramTitle('[DMIT] (test)')).toBe('[DMIT] (test)');
    });

    it('keeps recent-post link previews enabled and uses the post icon', async () => {
        const service = new TelegramWebhookService({ getRecentPosts: () => [{ post_id: 42, title: '【出】标题' }] } as any, '123:test');
        const replies: any[] = [];
        await (service as any).handlePostCommand({ reply: async (...args: any[]) => replies.push(args) });
        expect(replies[0][0]).toContain('📰 SeekFeed');
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
        const message = postMessage({ post_id: 42, title: '[DMIT] (test) <b> & stuff', creator: 'a<b>', category: 'tech' } as any, { keyword1: 'a<&', keyword2: '_b' } as any, '技术');
        expect(message).toContain('[DMIT] (test) &lt;b&gt; &amp; stuff');
        expect(message).toContain('a&lt;&amp; + _b');
        expect(message).toContain('https://www.nodeseek.com/post-42-1');
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
