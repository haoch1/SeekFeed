import type { FC } from "hono/jsx";
import { Layout } from "./Layout";
import { DashboardSurface, Icon } from "./DashboardSurface";

export const HomePage: FC = () => {
  return (
    <Layout
      title="SeekFeed"
      description="NodeSeek RSS 文章列表"
      scriptSrc="/js/home.js"
    >
      <DashboardSurface />

      {/* 抽屉遮罩 */}
      <div id="drawerOverlay" class="drawer-overlay" style="display: none;"></div>

      {/* 订阅管理抽屉 */}
      <div id="subscriptionsDrawer" class="drawer drawer-large" style="display: none;">
        <div class="drawer-header">
          <h3 class="drawer-title">订阅管理</h3>
          <button class="drawer-close" aria-label="关闭面板" data-drawer="subscriptions">
            <Icon name="close" />
          </button>
        </div>
        <div class="drawer-content">
          {/* 添加订阅表单 */}
          <form id="addSubForm" class="sub-form">
            {/* 第一行：关键词 */}
            <div class="sub-form-row">
              <div class="sub-keywords-inputs">
                <input type="text" id="keyword1" class="input-field" placeholder="关键词1，如 DMIT" aria-label="关键词1" maxlength="100" />
                <input type="text" id="keyword2" class="input-field" placeholder="关键词2（同时命中）" aria-label="关键词2" maxlength="100" />
                <input type="text" id="keyword3" class="input-field" placeholder="关键词3（同时命中）" aria-label="关键词3" maxlength="100" />
              </div>
            </div>
            {/* 第二行：作者和分类 */}
            <div class="sub-form-row">
              <div class="sub-form-group">
                <label for="subCreator" class="sub-form-label">作者</label>
                <input type="text" id="subCreator" class="input-field" placeholder="作者名" />
              </div>
              <div class="sub-form-group">
                <label for="subCategory" class="sub-form-label">分类</label>
                <select id="subCategory" class="input-field">
                  <option value="">全部</option>
                  <option value="daily">日常</option>
                  <option value="tech">技术</option>
                  <option value="info">情报</option>
                  <option value="review">测评</option>
                  <option value="trade">交易</option>
                  <option value="carpool">拼车</option>
                  <option value="promotion">推广</option>
                  <option value="life">生活</option>
                  <option value="dev">Dev</option><option value="photo-share">贴图</option>
                  <option value="expose">曝光</option>
                  <option value="inside">内版</option>
                  <option value="sandbox">沙盒</option>
                </select>
              </div>
            </div>
            <div class="sub-form-row"><div class="sub-form-group" style="width:100%"><label for="excludeKeywords" class="sub-form-label">屏蔽词</label><input type="text" id="excludeKeywords" class="input-field" placeholder="如：出号, 求购, 已出（用逗号分隔）" maxlength="500" /><span class="form-hint">标题或正文包含任一屏蔽词时不通知。多个关键词需同时命中。</span></div></div>
            {/* 第三行：添加按钮 */}
            <div class="sub-form-row sub-form-row-action">
              <button type="submit" class="btn btn-primary">添加订阅</button>
            </div>
          </form>

          {/* 订阅列表 */}
          <div id="subscriptionsList" class="subscriptions-list">
            <div class="skeleton-wrapper">
              {[1, 2, 3].map(() => (
                <div class="skeleton-list-item">
                  <div class="skeleton skeleton-badge"></div>
                  <div class="skeleton skeleton-line"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* RSS 配置抽屉 */}
      <div id="rssDrawer" class="drawer" style="display: none;">
        <div class="drawer-header">
          <h3 class="drawer-title">RSS 配置</h3>
          <button class="drawer-close" aria-label="关闭面板" data-drawer="rss">
            <Icon name="close" />
          </button>
        </div>
        <div class="drawer-content">
          <form id="rssConfigForm" class="form-stack">
            <div class="form-group">
              <label for="rssUrl" class="form-label">RSS 源地址</label>
              <input type="url" id="rssUrl" class="input-field" placeholder="https://rss.nodeseek.com/" />
              <span class="form-hint">填写 NodeSeek RSS 源地址，支持 RSS 格式</span>
            </div>
            <div class="form-group">
              <label for="rssInterval" class="form-label">抓取间隔（秒）</label>
              <input type="number" id="rssInterval" class="input-field" min="10" max="3600" placeholder="60" />
              <span class="form-hint">最小 10 秒，建议 60 秒以上</span>
            </div>
            <div class="form-group">
              <label for="rssProxy" class="form-label">代理地址（可选）</label>
              <input type="text" id="rssProxy" class="input-field" placeholder="http://127.0.0.1:7890" />
              <span class="form-hint">HTTP/HTTPS 代理，留空则不使用代理</span>
            </div>
            <div class="form-actions">
              <button type="button" id="testRssBtn" class="btn btn-secondary">
                测试连接
              </button>
              <button type="submit" class="btn btn-primary">
                保存配置
              </button>
            </div>
          </form>
          <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-light);">
            <button id="fetchRssBtn" class="btn btn-primary" style="width: 100%;">
              立即抓取 RSS
            </button>
          </div>
        </div>
      </div>

      {/* Telegram 配置抽屉 */}
      <div id="telegramDrawer" class="drawer drawer-large" style="display: none;">
        <div class="drawer-header">
          <h3 class="drawer-title">Telegram 配置</h3>
          <button class="drawer-close" aria-label="关闭面板" data-drawer="telegram">
            <Icon name="close" />
          </button>
        </div>
        <div class="drawer-content">
          {/* 推送服务配置 */}
          <div class="form-card">
            <h4 class="form-section-title">推送服务配置</h4>
            <form id="telegramConfigForm" class="form-stack">
              <div class="form-group">
                <label for="botToken" class="form-label">Bot Token</label>
                <input type="password" autocomplete="off" id="botToken" class="input-field" placeholder="从 @BotFather 获取" />
                <span class="form-hint">格式: 123456:ABC-DEF...</span>
              </div>
              <div class="form-group">
                <label for="chatId" class="form-label">用户 Chat ID</label>
                <input type="text" id="chatId" class="input-field" placeholder="用户或群组的 Chat ID" />
                <span class="form-hint">可通过 /start 命令自动获取（需开启交互服务）</span>
              </div>
              <div class="form-group">
                <div class="checkbox-wrapper">
                  <input type="checkbox" id="stopPush" />
                  <div class="checkbox-content">
                    <label for="stopPush" class="checkbox-label">停止推送</label>
                    <div class="checkbox-description">暂停所有 Telegram 消息推送</div>
                  </div>
                </div>
              </div>
              <div class="form-group">
                <div class="checkbox-wrapper">
                  <input type="checkbox" id="onlyTitle" />
                  <div class="checkbox-content">
                    <label for="onlyTitle" class="checkbox-label">仅匹配标题</label>
                    <div class="checkbox-description">只在文章标题中搜索关键词</div>
                  </div>
                </div>
              </div>
              <div class="form-actions">
                <button type="button" id="testTelegramBtn" class="btn btn-secondary">
                  测试连接
                </button>
                <button type="submit" class="btn btn-primary">
                  保存配置
                </button>
              </div>
            </form>
          </div>

          {/* 交互服务配置 */}
          <div class="form-card" style={{ marginTop: "24px" }}>
            <h4 class="form-section-title">交互服务配置（可选）</h4>
            <div class="form-hint" style={{ background: "var(--bg-primary)", padding: "12px", borderRadius: "8px", marginBottom: "16px" }}>
              <strong>说明：</strong>交互服务允许通过 Telegram Bot 命令管理订阅、查看文章等。
              可以选择 Webhook 模式（需要 HTTPS 公网域名）或 Polling 模式（无需公网，适合内网部署）。
            </div>
            {/* 模式选择 */}
            <div class="form-group" style={{ marginBottom: "16px" }}>
              <label class="form-label">交互模式</label>
              <div class="mode-selector" id="telegramModeSelector">
                <label class="mode-option">
                  <input type="radio" name="telegramMode" value="disabled" checked />
                  <span class="mode-label">关闭</span>
                </label>
                <label class="mode-option">
                  <input type="radio" name="telegramMode" value="polling" />
                  <span class="mode-label">Polling</span>
                </label>
                <label class="mode-option">
                  <input type="radio" name="telegramMode" value="webhook" />
                  <span class="mode-label">Webhook</span>
                </label>
              </div>
            </div>
            {/* Webhook 模式内容 */}
            <div id="webhookModePanel" style="display: none;">
              <form id="webhookConfigForm" class="form-stack">
                <div class="form-group">
                  <label for="webhookUrl" class="form-label">Webhook URL</label>
                  <input type="url" id="webhookUrl" class="input-field" placeholder="https://your-domain.com/telegram/webhook" />
                  <span class="form-hint">需要 HTTPS，用于接收 Telegram 命令</span>
                </div>
                <div class="form-actions">
                  <button type="button" id="testWebhookBtn" class="btn btn-secondary">
                    测试连接
                  </button>
                  <button type="button" id="clearWebhookBtn" class="btn btn-danger">
                    清除 Webhook
                  </button>
                  <button type="submit" class="btn btn-primary">
                    设置 Webhook
                  </button>
                </div>
              </form>
            </div>
            {/* Polling 模式内容 */}
            <div id="pollingModePanel" style="display: none;">
              <div class="form-hint" style={{ background: "var(--bg-primary)", padding: "12px", borderRadius: "8px", marginBottom: "12px" }}>
                Polling 模式不需要公网域名，服务会主动向 Telegram 服务器轮询消息。适合内网或 NAT 环境。
              </div>
              <div id="pollingStatusIndicator" class="form-hint" style={{ padding: "10px 12px", borderRadius: "8px", marginBottom: "12px", background: "var(--bg-hover)", fontWeight: "500" }}>
                Polling 未运行
              </div>
              <div class="form-actions">
                <button type="button" id="startPollingBtn" class="btn btn-primary">
                  启动 Polling
                </button>
                <button type="button" id="stopPollingBtn" class="btn btn-danger" style="display: none;">
                  停止 Polling
                </button>
              </div>
            </div>
          </div>

          {/* 状态信息 */}
          <div id="telegramStatusPanel" class="form-card" style={{ marginTop: "24px", display: "none" }}>
            <h4 class="form-section-title">服务状态</h4>
            <div class="info-grid">
              <div class="info-item">
                <strong>Bot 状态:</strong> <span id="telegramBotStatus">-</span>
              </div>
              <div class="info-item">
                <strong>Webhook 状态:</strong> <span id="telegramWebhookStatus">-</span>
              </div>
              <div class="info-item">
                <strong>用户绑定:</strong> <span id="telegramBindingStatus">-</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 统计信息抽屉 */}
      <div id="statsDrawer" class="drawer drawer-large" style="display: none;">
        <div class="drawer-header">
          <h3 class="drawer-title">统计信息</h3>
          <button class="drawer-close" aria-label="关闭面板" data-drawer="stats">
            <Icon name="close" />
          </button>
        </div>
        <div class="drawer-content">
          {/* 数字统计卡片 */}
          <p class="form-hint" style="margin-bottom:12px">今日统计时区：UTC</p>
          <div class="stats-grid-simple">
            <div class="stat-card-simple">
              <span class="stat-value" id="drawerStatTodayPushed">0</span>
              <span class="stat-label">今日已推送</span>
            </div>
            <div class="stat-card-simple">
              <span class="stat-value" id="drawerStatTodayPosts">0</span>
              <span class="stat-label">今日帖子</span>
            </div>
            <div class="stat-card-simple">
              <span class="stat-value" id="drawerStatPushed">0</span>
              <span class="stat-label">累计已推送</span>
            </div>
            <div class="stat-card-simple">
              <span class="stat-value" id="drawerStatTotalPosts">0</span>
              <span class="stat-label">历史帖子</span>
            </div>
          </div>

          {/* 最近 24小时发帖趋势 */}
          <div class="chart-section">
            <div class="chart-section-title">最近 24小时发帖趋势</div>
            <div id="hourlyChart" class="hourly-chart">
              {/* 加载占位 */}
              {[...Array(24)].map((_, i) => (
                <div class="hourly-bar-wrap">
                  <div class="hourly-bar zero-bar" style={{ height: '2px' }}></div>
                </div>
              ))}
            </div>
          </div>

          {/* 分类分布 */}
          <div class="chart-section">
            <div class="chart-section-title">分类分布</div>
            <div id="categoryChart" class="category-chart">
              <div class="chart-empty">加载中...</div>
            </div>
          </div>

          {/* 时间范围选择器 (移至底部) */}
          <div class="chart-range-selector" id="chartRangeSelector">
            <button class="chart-range-btn active" data-days="-1">今日</button>
            <button class="chart-range-btn" data-days="7">近 7 天</button>
            <button class="chart-range-btn" data-days="30">近 30 天</button>
            <button class="chart-range-btn" data-days="0">全部</button>
          </div>
        </div>
      </div>

      {/* 登录抽屉 */}
      <div id="loginModal" class="drawer" style="display: none;">
        <div class="drawer-header">
          <h3 class="drawer-title">用户登录</h3>
          <button id="closeLoginModal" class="drawer-close" data-drawer="login">
            <Icon name="close" />
          </button>
        </div>
        <div class="drawer-content">
          <form id="loginForm" class="form-stack">
            <div class="form-group">
              <label for="loginUsername" class="form-label">用户名</label>
              <input
                type="text"
                id="loginUsername" autocomplete="username"
                class="input-field"
                placeholder="请输入用户名"
                required
              />
            </div>
            <div class="form-group">
              <label for="loginPassword" class="form-label">密码</label>
              <input
                type="password"
                id="loginPassword" autocomplete="current-password"
                class="input-field"
                placeholder="请输入密码"
                required
              />
            </div>
            <div id="loginMessage" class="login-message" style="display: none;"></div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary" style="width: 100%;">
                登录
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Toast 容器 */}
      <div id="toastContainer" class="toast-container"></div>
    </Layout>
  );
};
