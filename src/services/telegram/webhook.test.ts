import { describe, expect, it, mock } from 'bun:test';
import { TelegramWebhookService } from './webhook';
import type { DatabaseService } from '../database';

function fixture(token = '123456:test-only-token') {
    const service = new TelegramWebhookService({} as DatabaseService, token);
    const internals = service as any;
    const register = mock(async () => true);
    const dispatch = mock(async () => {});
    const initialize = mock(async () => true);
    internals.bot.api.setWebhook = register;
    internals.bot.handleUpdate = dispatch;
    service.initializeWithHandlers = initialize;
    return { service, internals, register, dispatch, initialize };
}

async function registeredSecret(test: ReturnType<typeof fixture>) {
    expect((await test.service.setWebhook('https://example.com/telegram/webhook')).success).toBe(true);
    const options = test.register.mock.calls[0][1] as { secret_token: string };
    expect(options.secret_token).toMatch(/^[a-f0-9]{64}$/);
    return options.secret_token;
}

function request(secret?: string) {
    return new Request('https://example.com/telegram/webhook', {
        method: 'POST',
        headers: secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {},
        body: JSON.stringify({ update_id: 123 }),
    });
}

describe('Telegram webhook authentication', () => {
    it('rejects missing, incorrect and non-ASCII secrets before initialization or dispatch', async () => {
        const test = fixture();
        for (const secret of [undefined, 'forged', 'x'.repeat(64), 'é'.repeat(64)]) {
            const response = await test.service.getWebhookCallback()(request(secret));
            expect(response.status).toBe(403);
        }
        expect(test.initialize).not.toHaveBeenCalled();
        expect(test.dispatch).not.toHaveBeenCalled();
    });

    it('dispatches an update only with the secret registered with Telegram', async () => {
        const test = fixture();
        const secret = await registeredSecret(test);
        const response = await test.service.getWebhookCallback()(request(secret));
        expect(response.status).toBe(200);
        expect(test.initialize).toHaveBeenCalledTimes(1);
        expect(test.dispatch).toHaveBeenCalledWith({ update_id: 123 });
    });

    it('keeps the secret stable when the application restarts', async () => {
        const first = fixture();
        const restarted = fixture();
        const secret = await registeredSecret(first);
        expect(await registeredSecret(restarted)).toBe(secret);
        restarted.internals.initialized = true;
        expect((await restarted.service.getWebhookCallback()(request(secret))).status).toBe(200);
        expect(restarted.initialize).not.toHaveBeenCalled();
    });

    it('rejects the previous secret after the Bot Token changes', async () => {
        const previous = fixture();
        const rotated = fixture('654321:different-test-token');
        const oldSecret = await registeredSecret(previous);
        expect(await registeredSecret(rotated)).not.toBe(oldSecret);
        expect((await rotated.service.getWebhookCallback()(request(oldSecret))).status).toBe(403);
        expect(rotated.dispatch).not.toHaveBeenCalled();
    });
});
