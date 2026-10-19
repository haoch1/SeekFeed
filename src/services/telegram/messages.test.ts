import { describe, expect, it } from 'bun:test';
import { welcomeMessage, postMessage, telegramHelp } from './messages';
import { TelegramWebhookService } from './webhook';

describe('Telegram message layout and escaping', () => {
    it('keeps account details on separated lines and safely renders names', () => {
        const message = welcomeMessage('<Peter & Co>', 'peter_test', 123, true);
        expect(message).toContain('&lt;Peter &amp; Co&gt;');
        expect(message).toContain('(@peter_test)');
        expect(message).toContain('\n\n<b>Chat ID</b>');
        expect(message).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(telegramHelp).toContain('SeekFeed');
        expect(telegramHelp).not.toContain('\\-');
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
