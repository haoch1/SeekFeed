import { DatabaseService } from './database';
import { RSSService } from './rss';
import { TelegramPushService } from './telegram/push';
import { MatcherService } from './matcher';
import { getEnvConfig } from '../config/env';
import { logger } from '../utils/logger';
import type { RSSProcessResult, PushResult } from '../types';

type TaskResult = {
    success: boolean;
    message: string;
    data?: RSSProcessResult & { notifications: PushResult };
};

export class SchedulerService {
    private timer?: ReturnType<typeof setTimeout>;
    private running = false;
    private inFlight?: Promise<TaskResult>;
    private lastRunAt: string | null = null;
    private lastSuccessAt: string | null = null;
    private lastError: string | null = null;
    private nextRunAt: string | null = null;
    private consecutiveFailures = 0;

    constructor(private dbService: DatabaseService) {}

    private getRSSIntervalSeconds(): number {
        return Math.max(10, this.dbService.getBaseConfig()?.rss_interval_seconds || 60);
    }

    start(): void {
        if (this.running || !getEnvConfig().RSS_CHECK_ENABLED) return;
        this.running = true;
        this.schedule(0);
    }

    stop(): void {
        this.running = false;
        if (this.timer) clearTimeout(this.timer);
        this.timer = undefined;
        this.nextRunAt = null;
    }

    private schedule(delay: number): void {
        if (!this.running) return;
        this.nextRunAt = new Date(Date.now() + delay).toISOString();
        this.timer = setTimeout(async () => {
            this.timer = undefined;
            this.nextRunAt = null;
            await this.executeRSSTask();
            // A restart may already have scheduled a replacement timer.
            if (this.running && !this.timer) {
                const backoff = Math.min(8, 2 ** Math.min(this.consecutiveFailures, 3));
                this.schedule(this.getRSSIntervalSeconds() * 1000 * backoff);
            }
        }, delay);
    }

    private executeRSSTask(): Promise<TaskResult> {
        // Manual sync and timers share one promise, including the push phase.
        if (this.inFlight) return this.inFlight;
        this.inFlight = this.runOnce().finally(() => { this.inFlight = undefined; });
        return this.inFlight;
    }

    private async runOnce(): Promise<TaskResult> {
        this.lastRunAt = new Date().toISOString();
        const config = this.dbService.getBaseConfig();
        if (!config) return { success: false, message: '请先初始化系统' };
        let rss: RSSProcessResult = { new: 0, updated: 0, skipped: 0 };
        let rssError: string | null = null;
        try {
            rss = await new RSSService(this.dbService).processNewRSSData();
        } catch (error) {
            rssError = error instanceof Error ? error.message : String(error);
        }
        // Retry pending notifications even when the RSS source is unavailable.
        let notifications: PushResult = { pushed: 0, failed: 0, skipped: 0 };
        try {
            const telegram = config.bot_token ? new TelegramPushService(this.dbService, config.bot_token) : null;
            notifications = await new MatcherService(this.dbService, telegram).processUnpushedPosts();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.lastError = message;
            this.consecutiveFailures++;
            logger.error('匹配与推送任务失败:', error);
            return { success: false, message };
        }
        if (rssError) {
            this.lastError = rssError;
            this.consecutiveFailures++;
            logger.warn(`RSS 同步失败: ${rssError}`);
            return { success: false, message: rssError, data: { ...rss, notifications } };
        }
        this.lastError = null;
        this.consecutiveFailures = 0;
        this.lastSuccessAt = new Date().toISOString();
        return { success: true, message: 'RSS 同步完成', data: { ...rss, notifications } };
    }

    manualRSSTask(): Promise<TaskResult> {
        return this.executeRSSTask();
    }

    getStatus() {
        return { rssTask: {
            running: this.running,
            busy: Boolean(this.inFlight),
            intervalSeconds: this.getRSSIntervalSeconds(),
            lastRunAt: this.lastRunAt,
            lastSuccessAt: this.lastSuccessAt,
            nextRunAt: this.nextRunAt,
            lastError: this.lastError,
            consecutiveFailures: this.consecutiveFailures,
        } };
    }

    restartRSSTask(): void {
        this.stop();
        this.start();
    }

    async updateIntervalAndRestart(newIntervalSeconds: number): Promise<{ success: boolean; message: string }> {
        const seconds = Math.max(10, Math.min(3600, newIntervalSeconds));
        this.dbService.updateBaseConfig({ rss_interval_seconds: seconds });
        this.restartRSSTask();
        return { success: true, message: `RSS 间隔已更新为 ${seconds} 秒` };
    }
}
