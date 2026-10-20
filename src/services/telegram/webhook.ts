import { escapeTelegramHtml as h, telegramHelp, welcomeMessage, telegramCommands, recentPostRow, telegramMessage, telegramNotice, telegramListMessages, subscriptionRow, telegramText } from './messages';
import { Context } from 'grammy';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { TelegramBaseService } from './base';
import type { Post } from '../../types';
import { logger } from '../../utils/logger';
import type { HotPeriod } from '../hot';
import { hotEntryKeyboard, hotRankingKeyboard, hotRankingMessage, hotRankingPreview } from './hot';

export class TelegramWebhookService extends TelegramBaseService {
  private isPolling: boolean = false;

  private getWebhookSecret(): string {
    return createHmac('sha256', this.botToken)
      .update('SeekFeed webhook authentication v1')
      .digest('hex');
  }


  /**
   * 发送消息到 Telegram（基础版本，用于测试连接等）
   */
  async sendMessage(chatId: string | number, text: string, html = false): Promise<boolean> {
    try {
      await this.bot.api.sendMessage(chatId, text, { ...(html ? { parse_mode: 'HTML' as const } : {}), link_preview_options: { is_disabled: false, prefer_small_media: true } });
      return true;
    } catch (error) {
      logger.error('发送 Telegram 消息时出错:', error);
      return false;
    }
  }
  /**
   * 初始化并设置命令处理器
   */
  async initializeWithHandlers(): Promise<boolean> {
    const initResult = await this.initialize();
    if (initResult) {
      this.setupHandlers();
    }
    return initResult;
  }

  /**
   * 验证用户权限
   */
  private checkUserPermission(ctx: Context): boolean {
    const config = this.dbService.getBaseConfig();
    if (!config) {
      return false;
    }

    const currentChatId = ctx.chat?.id?.toString();
    // 检查是否是绑定的聊天
    return !!(config.chat_id && config.chat_id === currentChatId);
  }

  /**
   * 设置命令处理器
   */
  private setupHandlers(): void {
    // 处理 /start 命令（特殊处理，不需要权限验证）
    this.bot.command('start', async (ctx) => {
      await this.handleStartCommand(ctx);
    });

    // 处理 /stop 命令
    this.bot.command('stop', async (ctx) => {
      if (!this.checkUserPermission(ctx)) {
        await this.replyNotice(ctx, '尚未绑定', '您没有权限使用此功能。', '/start  绑定账号');
        return;
      }
      await this.handleStopCommand(ctx);
    });

    // 处理 /resume 命令
    this.bot.command('resume', async (ctx) => {
      if (!this.checkUserPermission(ctx)) {
        await this.replyNotice(ctx, '尚未绑定', '您没有权限使用此功能。', '/start  绑定账号');
        return;
      }
      await this.handleResumeCommand(ctx);
    });

    // 处理 /list 命令
    this.bot.command('list', async (ctx) => {
      if (!this.checkUserPermission(ctx)) {
        await this.replyNotice(ctx, '尚未绑定', '您没有权限使用此功能。', '/start  绑定账号');
        return;
      }
      await this.handleListCommand(ctx);
    });

    // 处理 /add 命令
    this.bot.command('add', async (ctx) => {
      if (!this.checkUserPermission(ctx)) {
        await this.replyNotice(ctx, '尚未绑定', '您没有权限使用此功能。', '/start  绑定账号');
        return;
      }
      await this.handleAddCommand(ctx);
    });

    // 处理 /del 命令
    this.bot.command('del', async (ctx) => {
      if (!this.checkUserPermission(ctx)) {
        await this.replyNotice(ctx, '尚未绑定', '您没有权限使用此功能。', '/start  绑定账号');
        return;
      }
      await this.handleDeleteCommand(ctx);
    });

    // 处理 /post 命令
    this.bot.command('post', async (ctx) => {
      if (!this.checkUserPermission(ctx)) {
        await this.replyNotice(ctx, '尚未绑定', '您没有权限使用此功能。', '/start  绑定账号');
        return;
      }
      await this.handlePostCommand(ctx);
    });

    // 处理 /hot 命令
    this.bot.command('hot', async ctx => {
      if (!this.checkUserPermission(ctx)) {
        await this.replyNotice(ctx, '尚未绑定', '您没有权限使用此功能。', '/start  绑定账号');
        return;
      }
      const period = ctx.match.trim() || 'live';
      if (!['live', 'day', 'week'].includes(period)) {
        await ctx.reply(telegramNotice('论坛热榜', '/hot  实时热榜\n/hot day  日榜\n/hot week  周榜'), { parse_mode: 'HTML', reply_markup: hotEntryKeyboard });
        return;
      }
      await this.handleHotCommand(ctx, period as HotPeriod);
    });

    this.bot.callbackQuery(/^hot:(open|live|day|week)$/, async ctx => this.handleHotCallback(ctx));

    // 处理 /help 命令（允许所有人查看）
    this.bot.command('help', async (ctx) => {
      await this.handleHelpCommand(ctx);
    });

    // 处理 /getme 命令（允许所有人查看）
    this.bot.command('getme', async (ctx) => {
      await this.handleGetMeCommand(ctx);
    });

    // 处理 /unbind 命令
    this.bot.command('unbind', async (ctx) => {
      if (!this.checkUserPermission(ctx)) {
        await this.replyNotice(ctx, '尚未绑定', '您没有权限使用此功能。', '/start  绑定账号');
        return;
      }
      await this.handleUnbindCommand(ctx);
    });

    // 处理其他消息
    this.bot.on('message:text', async (ctx) => {
      if (!ctx.message.text.startsWith('/')) {
        if (!this.checkUserPermission(ctx)) {
          await this.replyNotice(ctx, '尚未绑定', '您没有权限使用此功能。', '/start  绑定账号\n/help  查看可用命令');
          return;
        }
        await this.replyNotice(ctx, '使用说明', '请使用命令与我交互。', '/help  查看可用命令');
      }
    });
  }

  /**
   * 获取 webhook 回调（适配 Bun 环境）
   */
  getWebhookCallback() {
    return async (request: Request) => {
      const provided = Buffer.from(request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '');
      const expected = Buffer.from(this.getWebhookSecret());
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
        return new Response('Forbidden', { status: 403 });
      }
      try {
        // 确保 Bot 已初始化
        if (!this.initialized) {
          const initResult = await this.initializeWithHandlers();
          if (!initResult) {
            logger.error('Bot 初始化失败，无法处理 webhook');
            return new Response('Bot initialization failed', { status: 500 });
          }
        }

        const body = await request.json() as any;
        await this.bot.handleUpdate(body);
        return new Response('OK');
      } catch (error) {
        logger.error('处理 Telegram webhook 失败:', error);
        return new Response('Error', { status: 500 });
      }
    };
  }

  /**
   * 清空 Webhook 设置
   */
  async clearWebhook(): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      logger.telegram('正在清空 Webhook 设置...');
      await this.bot.api.deleteWebhook();
      logger.telegram('Webhook 清空成功');
      return { success: true };
    } catch (error: any) {
      logger.error('清空 Webhook 失败:', error);
      
      let errorMessage = 'Webhook 清空失败';
      if (error && error.description) {
        errorMessage = error.description;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * 启动 Long Polling 模式
   * 注意：Polling 和 Webhook 互斥，启动 Polling 前会自动清除 Webhook
   */
  async startPolling(): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (this.isPolling) {
      return { success: true };
    }

    try {
      // 确保 Bot 已初始化并注册命令处理器
      const initResult = await this.initializeWithHandlers();
      if (!initResult) {
        return { success: false, error: 'Bot 初始化失败' };
      }

      // 清除已有的 Webhook（Polling 和 Webhook 互斥）
      await this.bot.api.deleteWebhook();
      logger.telegram('已清除 Webhook，准备启动 Polling...');

      // 启动 Long Polling
      this.bot.start({
        onStart: () => {
          logger.telegram('Long Polling 已启动');
        },
      });

      this.isPolling = true;
      return { success: true };
    } catch (error: any) {
      logger.error('启动 Polling 失败:', error);
      this.isPolling = false;

      let errorMessage = 'Polling 启动失败';
      if (error && error.description) {
        errorMessage = error.description;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * 停止 Long Polling
   */
  async stopPolling(): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.isPolling) {
      return { success: true };
    }

    try {
      await this.bot.stop();
      this.isPolling = false;
      logger.telegram('Long Polling 已停止');
      return { success: true };
    } catch (error: any) {
      logger.error('停止 Polling 失败:', error);

      let errorMessage = 'Polling 停止失败';
      if (error instanceof Error) {
        errorMessage = error.message;
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * 获取 Polling 状态
   */
  getPollingStatus(): boolean {
    return this.isPolling;
  }

  /**
   * 获取 Webhook 信息（公开方法）
   */
  async getWebhookInfo() {
    try {
      return await this.bot.api.getWebhookInfo();
    } catch (error) {
      logger.error('获取 Webhook 信息失败:', error);
      return null;
    }
  }

  /**
   * 设置 Webhook
   */
  async setWebhook(webhookUrl: string): Promise<{
    success: boolean;
    error?: string;
    errorCode?: number;
    suggestions?: string[];
  }> {
    try {
      logger.telegram('正在设置 Webhook: ' + webhookUrl);
      await this.bot.api.setWebhook(webhookUrl, { secret_token: this.getWebhookSecret() });
      logger.telegram('Webhook 设置成功: ' + webhookUrl);
      return { success: true };
    } catch (error: any) {
      logger.error('设置 Webhook 失败:', error);
      logger.error('Webhook URL:', webhookUrl);

      // 解析 Grammy 错误
      let errorMessage = 'Webhook 设置失败';
      let errorCode = 0;
      let suggestions: string[] = [];

      if (error && error.error_code && error.description) {
        errorCode = error.error_code;
        errorMessage = error.description;

        // 根据不同错误类型提供建议
        if (error.description.includes('Failed to resolve host')) {
          suggestions = [
            '域名无法解析，请检查：',
            '1. 域名DNS记录是否正确配置',
            '2. 域名是否已完成DNS传播（可能需要等待几分钟到几小时）',
            '3. 尝试使用 dig 或 nslookup 命令验证DNS解析',
            '4. 确认域名拼写正确且可以从外网访问'
          ];
        } else if (error.description.includes('SSL')) {
          suggestions = [
            'SSL证书问题，请检查：',
            '1. 确保使用HTTPS协议',
            '2. SSL证书是否有效且未过期',
            '3. 证书链是否完整',
            '4. 证书是否被信任的CA签发'
          ];
        } else if (error.description.includes('Connection')) {
          suggestions = [
            '网络连接问题，请检查：',
            '1. 服务器防火墙设置',
            '2. 端口是否正确开放（通常是443）',
            '3. CDN或代理服务配置',
            '4. 网络连通性'
          ];
        } else if (error.description.includes('timeout')) {
          suggestions = [
            '连接超时，请检查：',
            '1. 服务器响应时间',
            '2. 网络延迟问题',
            '3. 服务器负载状况',
            '4. CDN配置是否正确'
          ];
        } else {
          suggestions = [
            '请检查以下项目：',
            '1. URL格式是否正确（必须是HTTPS）',
            '2. 域名是否可以从外网访问',
            '3. 端口和路径配置是否正确',
            '4. 服务器是否正常运行'
          ];
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
        errorCode,
        suggestions
      };
    }
  }

  /**
   * 设置 Bot 命令菜单
   */
  async setBotCommands(): Promise<boolean> {
    try {
      await this.bot.api.setMyCommands(telegramCommands);
      await this.bot.api.setChatMenuButton({ menu_button: { type: 'commands' } });
      logger.telegram('Bot 命令菜单设置成功');
      return true;
    } catch (error) {
      logger.error('设置 Bot 命令菜单失败:', error);
      return false;
    }
  }

  private async handleStartCommand(ctx: Context): Promise<void> {
    const config = this.dbService.getBaseConfig();
    const id = ctx.chat?.id;
    if (!config || !id) { await this.replyNotice(ctx, '尚未初始化', '请先在网页端完成系统初始化。'); return; }
    const name = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ');
    const username = ctx.from?.username || '';
    if (config.chat_id && config.chat_id !== String(id)) {
      await this.replyNotice(ctx, '账号已绑定', '此系统已绑定到其他账号。', '请由已绑定的账号发送 /unbind，或在网页端更改 Chat ID。'); return;
    }
    const returning = config.chat_id === String(id);
    if (!returning) this.dbService.updateBaseConfig({ chat_id: String(id), bound_user_name: name, bound_user_username: username });
    await ctx.reply(welcomeMessage(name, username, id, returning), { parse_mode: 'HTML', reply_markup: hotEntryKeyboard });
  }

  private async handleStopCommand(ctx: Context): Promise<void> {
    this.dbService.updateBaseConfig({ stop_push: 1 });
    await this.replyNotice(ctx, '推送已暂停', '订阅和配置已保留。', '/resume  恢复通知');
  }

  private async handleResumeCommand(ctx: Context): Promise<void> {
    this.dbService.updateBaseConfig({ stop_push: 0 });
    await this.replyNotice(ctx, '推送已恢复', '将继续接收订阅通知。');
  }

  private async handleListCommand(ctx: Context): Promise<void> {
    const subs = this.dbService.getAllKeywordSubs();
    if (!subs.length) { await this.replyNotice(ctx, '订阅列表', '暂无订阅。', '/add 关键词  添加订阅'); return; }
    const rows = subs.map(sub => subscriptionRow(sub, sub.category ? this.getCategoryName(sub.category) : ''));
    for (const text of telegramListMessages('订阅列表', rows, '/del 订阅ID  删除订阅')) {
      await ctx.reply(text, { parse_mode: 'HTML' });
    }
  }

  private async handleAddCommand(ctx: Context): Promise<void> {
    const words = ctx.message?.text?.trim().split(/\s+/).slice(1) || [];
    if (!words.length || words.length > 3 || words.some(word => word.length > 100)) {
      await this.replyNotice(ctx, '添加订阅', '请填写 1–3 个关键词，每个不超过 100 字。', '/add 关键词1 关键词2 关键词3'); return;
    }
    try {
      const sub = this.dbService.createKeywordSub({ keyword1: words[0], keyword2: words[1], keyword3: words[2] });
      await ctx.reply(telegramMessage('订阅已添加', subscriptionRow(sub, '') + '/list  查看所有订阅'), { parse_mode: 'HTML' });
    } catch { await this.replyNotice(ctx, '添加失败', '请稍后重试。'); }
  }

  private async handleDeleteCommand(ctx: Context): Promise<void> {
    const args = ctx.message?.text?.trim().split(/\s+/).slice(1) || [];
    if (args.length !== 1 || !/^[1-9]\d*$/.test(args[0]) || !Number.isSafeInteger(Number(args[0]))) {
      await this.replyNotice(ctx, '删除订阅', '请提供有效的订阅 ID。', '/del 订阅ID'); return;
    }
    const id = Number(args[0]);
    try { await this.replyNotice(ctx, '删除订阅', this.dbService.deleteKeywordSub(id) ? `订阅 #${id} 已删除。` : `订阅 #${id} 不存在。`); }
    catch { await this.replyNotice(ctx, '删除失败', '请稍后重试。'); }
  }

  private async handlePostCommand(ctx: Context): Promise<void> {
    const posts = this.dbService.getRecentPosts(10);
    if (!posts.length) { await this.replyNotice(ctx, '最近帖子', '暂无帖子，等待下一次 RSS 同步。'); return; }
    const rows = posts.map((post, index) => recentPostRow(post, index, this.getCategoryName(post.category || '')));
    const messages = telegramListMessages('最近帖子', rows);
    for (const [index, text] of messages.entries()) {
      await ctx.reply(text, { parse_mode: 'HTML', link_preview_options: { is_disabled: false, prefer_small_media: true }, ...(index === messages.length - 1 ? { reply_markup: hotEntryKeyboard } : {}) });
    }
  }

  private async handleHotCommand(ctx: Context, period: HotPeriod = 'live'): Promise<void> {
    const data = this.dbService.getHotService().ranking(period);
    await ctx.reply(hotRankingMessage(data), { parse_mode: 'HTML', reply_markup: hotRankingKeyboard(period), link_preview_options: hotRankingPreview(data) });
  }

  private async handleHotCallback(ctx: Context): Promise<void> {
    if (!this.checkUserPermission(ctx)) {
      await ctx.answerCallbackQuery({ text: '请先绑定账号后使用热榜。', show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    const action = ctx.callbackQuery?.data?.split(':')[1];
    if (action === 'open') { await this.handleHotCommand(ctx); return; }
    if (!['live', 'day', 'week'].includes(action || '')) return;
    const period = action as HotPeriod;
    const data = this.dbService.getHotService().ranking(period);
    try {
      await ctx.editMessageText(hotRankingMessage(data), { parse_mode: 'HTML', reply_markup: hotRankingKeyboard(period), link_preview_options: hotRankingPreview(data) });
    } catch (error: any) {
      if (!String(error?.description || '').includes('message is not modified')) throw error;
    }
  }

  private async handleHelpCommand(ctx: Context): Promise<void> {
    await ctx.reply(telegramHelp, { parse_mode: 'HTML', reply_markup: hotEntryKeyboard });
  }

  private async handleGetMeCommand(ctx: Context): Promise<void> {
    const config = this.dbService.getBaseConfig();
    const own = config?.chat_id === ctx.chat?.id?.toString();
    const name = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || '未命名用户';
    const status = own ? '已绑定当前账号' : config?.chat_id ? '已绑定其他账号' : '未绑定，发送 /start 绑定账号';
    await ctx.reply(telegramMessage('账号状态', `账号 ${h(telegramText(name))}\nChat ID <code>${ctx.chat?.id}</code> · ${status}\n\n/help  查看命令帮助`), { parse_mode: 'HTML' });
  }

  private async handleUnbindCommand(ctx: Context): Promise<void> {
    if (!this.checkUserPermission(ctx)) { await this.replyNotice(ctx, '解除绑定', '当前账号未绑定。'); return; }
    this.dbService.updateBaseConfig({ chat_id: '', bound_user_name: '', bound_user_username: '' });
    await this.replyNotice(ctx, '绑定已解除', '将停止向此账号推送。', '/start  重新绑定');
  }

  private async replyNotice(ctx: Context, title: string, message: string, hint?: string): Promise<void> {
    await ctx.reply(telegramNotice(title, message, hint), { parse_mode: 'HTML' });
  }
}
