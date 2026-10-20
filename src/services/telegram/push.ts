import { postMessage, telegramTestMessage } from './messages';
import { TelegramBaseService } from './base';
import type { Post, KeywordSub } from '../../types';
import { logger } from '../../utils/logger';

export class TelegramPushService extends TelegramBaseService {
  /**
   * 发送消息到 Telegram
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
   * 推送文章到 Telegram
   */
  async pushPost(post: Post, matchedSub: KeywordSub): Promise<boolean> {
    try {
      const config = this.dbService.getBaseConfig();
      if (!config || config.stop_push === 1) {
        return false;
      }

      if (post.match_dismissed === 1 || this.dbService.getPostByPostId(post.post_id)?.match_dismissed === 1) {
        return false;
      }

      const text = postMessage(post, matchedSub, this.getCategoryName(post.category));
      const success = await this.sendMessage(config.chat_id, text, true);

      if (success) {
        // 更新推送状态为 3（已匹配且已推送成功）
        this.dbService.updatePostPushStatus(
          post.post_id,
          3, // 已匹配且已推送成功
          matchedSub.id,
          new Date().toISOString()
        );
        return true;
      }

      return false;
    } catch (error) {
      logger.error('推送文章失败:', error);
      return false;
    }
  }

  /**
   * 测试发送消息（简化版，仅用于测试连通性）
   */
  async testSendMessage(chatId: string | number, message?: string): Promise<boolean> {
    return await this.sendMessage(chatId, message || telegramTestMessage(), !message);
  }
}
