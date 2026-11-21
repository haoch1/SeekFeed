#!/usr/bin/env bun
import { app, startServer } from './index';
import { DatabaseService } from './services/database';
import { SchedulerService } from './services/scheduler';
import { logger } from './utils/logger';
import { setScheduler } from './services/runtime';
import { websocket } from 'hono/bun';

process.title = 'SeekFeed';

export let schedulerService: SchedulerService | null = null;
let serverInstance: ReturnType<typeof Bun.serve> | null = null;
let dbInstance: DatabaseService | null = null;
let shuttingDown = false;

// 启动服务器
async function main() {
    try {
        // 初始化应用和数据库
        const config = await startServer();

        // 创建定时任务服务
        dbInstance = DatabaseService.create();
        schedulerService = new SchedulerService(dbInstance);
        setScheduler(schedulerService);

        // 启动定时任务
        schedulerService.start();

        // 启动 Bun 服务器
        serverInstance = Bun.serve({
            port: config!.PORT,
            hostname: config!.HOST,
            idleTimeout: 60,
            fetch: app.fetch,
            websocket,
        });

        logger.server(`服务器运行在: http://${serverInstance.hostname}:${serverInstance.port}`);

        // 优雅关闭处理
        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);

    } catch (error) {
        logger.error('启动失败:', error);
        process.exit(1);
    }
}

// 优雅关闭
async function gracefulShutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn('收到关闭信号，正在优雅关闭...');

    if (schedulerService) {
        schedulerService.stop();
        schedulerService = null;
    }

    if (serverInstance) {
        try { serverInstance.stop(true); } catch {}
        serverInstance = null;
    }

    if (dbInstance) {
        try { dbInstance.close(); } catch {}
        dbInstance = null;
    }

    logger.success('服务器已关闭');
    process.exit(0);
}

// 运行主函数
main();
