import { AccountSettings } from './AccountSettings';
import { TelegramSettings } from './TelegramSettings';
import { FieldInput } from './Controls';
import type { FC } from "hono/jsx";
import { Layout } from "./Layout";
import { DashboardSurface, Icon } from "./DashboardSurface";

export const HomePage: FC<{ path?: string }> = ({ path = "/" }) => {
  return (
    <Layout
      title="SeekFeed"
      description="NodeSeek RSS 文章列表"
      scriptSrc="/js/home.js"
    >
      <DashboardSurface path={path}>

      {/* 订阅管理页面 */}
      <section id="subscriptionsPage" class="route-page" hidden={path !== "/subscriptions"}><div class="workspace-heading"><div><h1>订阅管理</h1><p>创建关键词规则，让重要的新帖自动找到你。</p></div></div>
        <div class="page-body">
          {/* 添加订阅表单 */}
          <form id="addSubForm" class="sub-form" method="post">
            {/* 第一行：关键词 */}
            <div class="section-heading"><h2>新建订阅</h2><p>填写至少一个关键词、作者或分类。多个关键词需要同时命中。</p></div><div class="sub-form-row"><label class="form-label" for="keyword1">匹配关键词</label></div>
            <div class="sub-form-row"><div class="sub-keywords-inputs">
                <FieldInput type="text" id="keyword1" class="input-field" placeholder="关键词1，如 DMIT" aria-label="关键词1" maxlength="100" />
                <FieldInput type="text" id="keyword2" class="input-field" placeholder="关键词2（同时命中）" aria-label="关键词2" maxlength="100" />
                <FieldInput type="text" id="keyword3" class="input-field" placeholder="关键词3（同时命中）" aria-label="关键词3" maxlength="100" />
              </div>
            </div>
            {/* 第二行：作者和分类 */}
            <div class="sub-form-row">
              <div class="sub-form-group">
                <label for="subCreator" class="sub-form-label">作者</label>
                <FieldInput type="text" id="subCreator" class="input-field" placeholder="作者名" />
              </div>
              <div class="sub-form-group">
                <label for="subCategory" class="sub-form-label">分类</label>
                <select data-1p-ignore="true" data-op-ignore="true" id="subCategory" class="input-field">
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
            <div class="sub-form-row"><div class="sub-form-group" style="width:100%"><label for="excludeKeywords" class="sub-form-label">屏蔽词</label><FieldInput type="text" id="excludeKeywords" class="input-field" placeholder="如：出号, 求购, 已出（用逗号分隔）" maxlength="500" /><span class="form-hint">标题或正文包含任一屏蔽词时不通知。多个关键词需同时命中。</span></div></div>
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
      </section>

      {/* RSS 配置页面 */}
      <section id="rssPage" class="route-page" hidden={path !== "/settings/rss"}><div class="workspace-heading"><div><h1>RSS 配置</h1><p>管理内容来源、抓取频率与网络连接。</p></div></div>
        <div class="page-body">
          <form id="rssConfigForm" class="form-stack" method="post">
            <div class="form-group">
              <label for="rssUrl" class="form-label">RSS 源地址</label>
              <FieldInput type="url" id="rssUrl" class="input-field" placeholder="https://rss.nodeseek.com/" />
              <span class="form-hint">填写 NodeSeek RSS 源地址，支持 RSS 格式</span>
            </div>
            <div class="form-group">
              <label for="rssInterval" class="form-label">抓取间隔（秒）</label>
              <FieldInput type="number" id="rssInterval" class="input-field" min="10" max="3600" placeholder="60" />
              <span class="form-hint">最小 10 秒，建议 60 秒以上</span>
            </div>
            <div class="form-group">
              <label for="rssProxy" class="form-label">代理地址（可选）</label>
              <FieldInput type="text" id="rssProxy" class="input-field" placeholder="http://127.0.0.1:7890" />
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
          <div class="rss-sync-section"><div class="section-heading"><h2>手动同步</h2><p>保存源配置后，可立即抓取新帖。自动监控会按照设定的间隔持续运行。</p></div>
            <button id="fetchRssBtn" class="btn btn-primary" style="width: 100%;">
              立即抓取 RSS
            </button>
          </div>
        </div>
      </section>

      <TelegramSettings active={path === "/settings/telegram"} />
      <AccountSettings active={path === "/settings/account"} />

      {/* 统计页面 */}
      <section id="statsPage" class="route-page" hidden={path !== "/statistics"}><div class="workspace-heading"><div><h1>统计信息</h1><p>了解收录趋势与通知发送情况。</p></div></div>
        <div class="page-body">
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
      </section>

      </DashboardSurface>
      <div id="drawerOverlay" class="drawer-overlay" style="display:none"></div>
      {/* 登录对话框 */}
      <div id="loginModal" class="drawer" style="display: none;">
        <div class="drawer-header">
          <h3 class="drawer-title">用户登录</h3>
          <button id="closeLoginModal" class="drawer-close" data-drawer="login">
            <Icon name="close" />
          </button>
        </div>
        <div class="drawer-content">
          <form id="loginForm" class="form-stack" method="post" action="/auth/login">
            <div class="form-group">
              <label for="loginUsername" class="form-label">用户名</label>
              <input
                type="text"
                id="loginUsername" name="username" autocomplete="username"
                class="input-field"
                placeholder="请输入用户名"
                required
              />
            </div>
            <div class="form-group">
              <label for="loginPassword" class="form-label">密码</label>
              <input
                type="password"
                id="loginPassword" name="password" autocomplete="current-password"
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
