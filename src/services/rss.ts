import { DatabaseService } from "./database";
import { getEnvConfig } from "../config/env";
import cadence from '../config/cadence.json';
import { logger } from "../utils/logger";
import type { Post, RSSItem, ParsedPost, RSSProcessResult } from "../types";

export class RSSService {
  private readonly TIMEOUT: number;

  constructor(private dbService: DatabaseService) {
    const config = getEnvConfig();
    this.TIMEOUT = config.RSS_TIMEOUT;
  }

  /**
   * 获取代理配置（从数据库）
   */
  private getProxy(): string | undefined {
    const config = this.dbService.getBaseConfig();
    return config?.rss_proxy || undefined;
  }

  /**
   * 获取 RSS 配置（从数据库）
   */
  private getRSSConfig(): { url: string; intervalSeconds: number } {
    const config = this.dbService.getBaseConfig();
    return {
      url: config?.rss_url || "https://rss.nodeseek.com/",
      intervalSeconds: config?.rss_interval_seconds || cadence.rssIntervalSeconds,
    };
  }

  /**
   * 从 XML 文本中提取标签内容
   */
  private extractTagContent(xml: string, tagName: string): string {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i");
    const match = xml.match(regex);
    return match ? match[1].trim() : "";
  }

  /**
   * 从 XML 文本中提取 CDATA 内容
   */
  private extractCDATA(text: string): string {
    const cdataMatch = text.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
    return cdataMatch ? cdataMatch[1] : text;
  }

  /**
   * 解析 RSS XML 数据
   */
  private parseRSSXML(xmlText: string): RSSItem[] {
    try {
      if (!/<(?:rss|rdf:RDF)(?:\s|>)/i.test(xmlText)) {
        throw new Error('RSS 源返回了非 RSS 内容，请检查源地址或访问限制');
      }
      // 提取所有 <item> 元素
      const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
      const items: RSSItem[] = [];
      let match;

      while ((match = itemRegex.exec(xmlText)) !== null) {
        const itemXML = match[1];

        // 提取各个字段
        const title = this.extractCDATA(
          this.extractTagContent(itemXML, "title"),
        );
        const link = this.extractTagContent(itemXML, "link");
        const pubDate = this.extractTagContent(itemXML, "pubDate");
        const creator = this.extractCDATA(
          this.extractTagContent(itemXML, "dc:creator"),
        );
        const category = this.extractCDATA(
          this.extractTagContent(itemXML, "category"),
        );
        const description = this.extractCDATA(
          this.extractTagContent(itemXML, "description"),
        );
        const content = this.extractCDATA(
          this.extractTagContent(itemXML, "content:encoded") || description,
        );
        const guid = this.extractTagContent(itemXML, "guid") || link;

        // 创建清理后的摘要
        let contentSnippet = description.replace(/<[^>]*>/g, "").trim();
        if (contentSnippet.length > 200) {
          contentSnippet = contentSnippet.substring(0, 200) + "...";
        }

        items.push({
          title,
          link,
          pubDate,
          creator,
          category,
          contentSnippet,
          content,
          guid,
        });
      }

      return items;
    } catch (error) {
      logger.error("RSS XML 解析失败:", error);
      throw new Error(`RSS XML 解析失败: ${error}`);
    }
  }

  /**
   * 抓取并解析 RSS 数据
   */
  async fetchAndParseRSS(): Promise<RSSItem[]> {
    let controller: AbortController | undefined;
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      const rssConfig = this.getRSSConfig();
      const proxy = this.getProxy();
      if (proxy) {
        logger.rss('使用已配置的 RSS 代理');
      }

      controller = new AbortController();
      timeoutId = setTimeout(() => controller?.abort(), this.TIMEOUT);

      // 构建 fetch 选项
      const fetchOptions: RequestInit & { proxy?: string } = {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
          "Upgrade-Insecure-Requests": "1",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Sec-Ch-Ua":
            '"Microsoft Edge";v="139", "Chromium";v="139", "Not=A?Brand";v="8"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"',
          DNT: "1",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      };

      // 如果配置了代理，添加代理选项
      if (proxy) {
        fetchOptions.proxy = proxy;
      }

      const response = await fetch(rssConfig.url, fetchOptions);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const xmlText = await response.text();

      const items = this.parseRSSXML(xmlText);
      clearTimeout(timeoutId);
      timeoutId = undefined;

      if (!items || items.length === 0) {
        return [];
      }
      return items;
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`RSS 请求超时 (${this.TIMEOUT}ms)`);
      }
      
      // 提取友好的错误信息
      let errorMessage = '未知错误';
      if (error instanceof Error) {
        const message = error.message;
        if (message.includes('socket connection was closed unexpectedly')) {
          errorMessage = '连接被意外关闭（网络不稳定或服务器拒绝连接）';
        } else if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
          errorMessage = 'DNS 解析失败（请检查 RSS 地址是否正确）';
        } else if (message.includes('ETIMEDOUT') || message.includes('timeout')) {
          errorMessage = '连接超时（网络延迟或服务器响应慢）';
        } else if (message.includes('ECONNREFUSED')) {
          errorMessage = '连接被拒绝（服务器未运行或端口错误）';
        } else if (message.includes('certificate') || message.includes('TLS') || message.includes('SSL')) {
          errorMessage = 'SSL/TLS 证书错误';
        } else {
          errorMessage = message;
        }
      }
      
      throw new Error(`RSS 抓取失败: ${errorMessage}`);
    }
  }

  /**
   * 从链接中提取 post_id
   */
  private extractPostId(link: string): number | null {
    try {
      // NodeSeek 的链接格式通常是 https://www.nodeseek.com/post-{id}-1
      const match = link.match(/post-(\d+)-/);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }

      // 备用方案：从 URL 参数中提取
      const url = new URL(link);
      const id = url.searchParams.get("id");
      if (id) {
        return parseInt(id, 10);
      }

      return null;
    } catch (error) {
      logger.error("提取 post_id 失败:", error);
      return null;
    }
  }

  /**
   * 清洗和格式化数据
   */
  private cleanAndFormatData(item: RSSItem): ParsedPost | null {
    const postId = this.extractPostId(item.link);
    if (!postId) {
      logger.warn("无法提取 post_id:", item.link);
      return null;
    }

    // 清洗标题
    const title = item.title.trim().replace(/\s+/g, " ");

    // 清洗内容摘要
    let memo = item.contentSnippet || item.content || "";
    memo = memo.replace(/<[^>]*>/g, ""); // 移除 HTML 标签
    memo = memo.trim().replace(/\s+/g, " ");
    memo = memo.substring(0, 500); // 限制长度

    // 清洗分类
    const category = item.category ? item.category.trim() : "";

    // 清洗创建者
    const creator = item.creator ? item.creator.trim() : "";

    // Invalid publication dates must not masquerade as new posts.
    const date = new Date(item.pubDate);
    if (!title || !creator || !Number.isSafeInteger(postId) || !Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 300000) return null;
    const pubDate = date.toISOString();

    return {
      post_id: postId,
      title,
      memo,
      category,
      creator,
      pub_date: pubDate,
    };
  }

  /**
   * 处理新的 RSS 数据 - 优化版本，批量查询减少数据库访问
   */
  async processNewRSSData(): Promise<RSSProcessResult> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startedAt = new Date().toISOString();
      try {
        if (attempt > 1) logger.rssDebug(`第 ${attempt} 次尝试...`);

        const rssItems = await this.fetchAndParseRSS();

        const parsedPosts = rssItems.map(item => this.cleanAndFormatData(item)).filter((post): post is ParsedPost => post !== null);
        const invalid = rssItems.length - parsedPosts.length;
        const result = this.dbService.syncRSSPosts(parsedPosts);
        this.dbService.getCollectionInsights().record({ source: 'rss', startedAt, durationMs: Date.now() - Date.parse(startedAt),
          status: invalid ? 'partial' : 'success', received: rssItems.length, accepted: parsedPosts.length,
          inserted: result.new, updated: result.updated, invalid });
        return result;
      } catch (error) {
        lastError = error as Error;
        const httpStatus = Number(String(error).match(/HTTP (\d{3})/)?.[1]) || undefined;
        this.dbService.getCollectionInsights().record({ source: 'rss', startedAt, durationMs: Date.now() - Date.parse(startedAt),
          status: 'failed', errorCode: httpStatus ? 'http_error' : /超时|timeout/i.test(String(error)) ? 'network_timeout' : 'fetch_or_parse_error', httpStatus });
        logger.warn(`第 ${attempt} 次尝试失败`);

        if (attempt < maxRetries) {
          const delayMs = attempt * 2000;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    logger.error(`RSS 处理失败，已尝试 ${maxRetries} 次`, lastError);
    throw lastError || new Error("RSS 处理失败，已达到最大重试次数");
  }

  /**
   * 获取最新的文章数据（用于测试）
   */
  getLatestPosts(limit: number = 5): Post[] {
    return this.dbService.getRecentPosts(limit);
  }

  /**
   * 手动触发 RSS 更新
   */
  async manualUpdate(): Promise<{
    success: boolean;
    message: string;
    data?: any;
  }> {
    try {
      const result = await this.processNewRSSData();
      return {
        success: true,
        message: `RSS 更新成功`,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: `RSS 更新失败: ${error}`,
      };
    }
  }

  /**
   * 验证 RSS 源是否可访问（使用数据库配置的 URL）
   */
  async validateRSSSource(): Promise<{ accessible: boolean; message: string }> {
    const rssConfig = this.getRSSConfig();
    return this.validateRSSUrl(rssConfig.url);
  }

  /**
   * 验证指定 RSS URL 是否可访问
   */
  async validateRSSUrl(url: string): Promise<{ accessible: boolean; message: string }> {
    try {
      const proxy = this.getProxy();
      if (proxy) {
        logger.rss('使用已配置的 RSS 代理测试连接');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const fetchOptions: RequestInit & { proxy?: string } = {
        method: "HEAD",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
          "Upgrade-Insecure-Requests": "1",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Sec-Ch-Ua":
            '"Microsoft Edge";v="139", "Chromium";v="139", "Not=A?Brand";v="8"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"',
          DNT: "1",
        },
      };

      // 如果配置了代理，添加代理选项
      if (proxy) {
        fetchOptions.proxy = proxy;
      }

      const response = await fetch(url, fetchOptions);

      clearTimeout(timeoutId);

      if (response.ok) {
        return {
          accessible: true,
          message: "RSS 源可正常访问",
        };
      } else {
        return {
          accessible: false,
          message: `RSS 源访问失败: HTTP ${response.status}`,
        };
      }
    } catch (error) {
      return {
        accessible: false,
        message: `RSS 源访问失败: ${error}`,
      };
    }
  }

  /**
   * 获取当前 RSS 配置
   */
  getRSSConfigFromDB(): { url: string; intervalSeconds: number } {
    return this.getRSSConfig();
  }
}
