import { AccountSettings } from './AccountSettings';
import { TelegramSettings } from './TelegramSettings';
import { SubscriptionAnalytics } from './SubscriptionAnalytics';
import { StatisticsPage } from './StatisticsPage';
import { HotPage } from './HotPage';
import { FieldInput } from './Controls';
import type { FC } from "hono/jsx";
import { Layout } from "./Layout";
import { DashboardSurface, Icon } from "./DashboardSurface";
import cadence from '../config/cadence.json';

export const HomePage: FC<{ path?: string }> = ({ path = "/hot" }) => {
  if (path === '/') path = '/hot';
  return (
    <Layout
      title="SeekFeed · NodeSeek 社区动态"
      description="浏览 NodeSeek 实时热榜、最新帖子与社区数据分析。"
      scriptSrc={["/js/collection-insights.js", "/js/category-breakdown.js", "/js/keyword-statistics.js", "/js/statistics.js", "/js/hot.js", "/js/home.js"]}
    >
      <DashboardSurface path={path}>

      {/* 订阅管理页面 */}
      <section id="subscriptionsPage" class="route-page" hidden={path !== "/subscriptions"}><div class="workspace-heading"><div><h1><Icon name="list" /><span>订阅管理</span></h1></div></div>
        <div class="page-body">
          {/* 添加订阅表单 */}
          <form id="addSubForm" class="sub-form" method="post">
            {/* 第一行：关键词 */}
            <div class="section-heading"><h2 id="subFormTitle">新建订阅</h2></div><div class="sub-form-row"><label class="form-label" for="keyword1">匹配关键词</label></div>
            <div class="sub-form-row"><div class="sub-keywords-inputs">
                <FieldInput type="text" id="keyword1" class="input-field" placeholder="关键词1，如 DMIT" aria-label="关键词1" maxlength="100" />
                <FieldInput type="text" id="keyword2" class="input-field" placeholder="关键词2（同时命中）" aria-label="关键词2" maxlength="100" />
                <FieldInput type="text" id="keyword3" class="input-field" placeholder="关键词3（同时命中）" aria-label="关键词3" maxlength="100" />
              </div>
            </div>
            <details class="match-rules match-rule-details"><summary><span>不区分大小写，多个关键词需同时命中。</span><span class="match-rule-toggle">规则说明<Icon name="chevron-down" /></span></summary><div><p><span id="subscriptionMatchScope">正在读取匹配范围…</span> <a href="/settings/telegram" data-route>调整范围</a></p><p>摘要由 RSS 提供，可能不含完整正文。正则表达式按所填标志匹配。</p><p>作者、分类与关键词需同时满足；留空则不限。屏蔽词命中标题或摘要时不通知。</p></div></details>
            {/* 第二行：作者和分类 */}
            <div class="sub-form-row">
              <div class="sub-form-group">
                <label for="subCreator" class="sub-form-label">作者</label>
                <FieldInput type="text" id="subCreator" class="input-field" placeholder="作者名" />
              </div>
              <div class="sub-form-group">
                <label for="subCategory" class="sub-form-label">分类</label>
                <select data-1p-ignore="true" data-op-ignore="true" id="subCategory" class="input-field">
                  <option value="">全部分类</option>
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
            <div class="sub-form-row"><div class="sub-form-group" style="width:100%"><label for="excludeKeywords" class="sub-form-label">屏蔽词</label><FieldInput type="text" id="excludeKeywords" class="input-field" placeholder="如：出号, 求购, 已出（逗号分隔）" maxlength="500" /></div></div>
            {/* 第三行：添加按钮 */}
            <div class="sub-form-row sub-form-row-action">
              <button id="saveSubscriptionBtn" type="submit" class="btn btn-primary">添加订阅</button>
              <button id="cancelSubscriptionEdit" type="button" class="btn btn-secondary" hidden>取消编辑</button>
            </div>
          </form>

          {/* 订阅列表 */}
          <section class="subscriptions-panel-shell" aria-labelledby="subscriptionsListTitle"><div class="subscriptions-panel">
          <div class="subscriptions-panel-heading"><h2 id="subscriptionsListTitle">我的订阅</h2><div class="search-box"><Icon name="search" /><FieldInput type="search" id="subscriptionSearch" class="input-field" placeholder="搜索订阅" aria-label="搜索订阅 ID、关键词或作者" /></div></div>
          <div id="subscriptionsList" class="subscriptions-list" tabindex="0" role="region" aria-label="订阅列表">
            <div class="skeleton-wrapper">
              {[1, 2, 3].map(() => (
                <div class="skeleton-list-item">
                  <div class="skeleton skeleton-badge"></div>
                  <div class="skeleton skeleton-line"></div>
                </div>
              ))}
            </div>
          </div>
          <p id="subscriptionSearchEmpty" class="subscription-search-empty" hidden>没有匹配的订阅</p>
          </div></section>
        </div>
        <SubscriptionAnalytics />
      </section>

      {/* RSS 配置页面 */}
      <section id="rssPage" class="route-page" hidden={path !== "/settings/rss"}><div class="workspace-heading"><div><h1><Icon name="rss" /><span>RSS 配置</span></h1></div></div>
        <div class="page-body">
          <form id="rssConfigForm" class="form-stack" method="post">
            <div class="form-group">
              <label for="rssUrl" class="form-label">RSS 源地址</label>
              <FieldInput type="url" id="rssUrl" class="input-field" placeholder="https://rss.nodeseek.com/" />
              <span class="form-hint">填写 NodeSeek RSS 源地址，支持 RSS 格式</span>
            </div>
            <div class="form-group">
              <label for="rssInterval" class="form-label">抓取间隔（秒）</label>
              <FieldInput type="number" id="rssInterval" class="input-field" min="10" max="3600" placeholder={String(cadence.rssIntervalSeconds)} />
              <span class="form-hint">默认 30 秒，最小 10 秒；同步失败时自动延长重试间隔。</span>
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
            <dl class="diagnostic-list rss-diagnostics"><div><dt>自动监控</dt><dd id="rssRunningStatus">读取状态中</dd></div><div><dt>抓取频率</dt><dd id="rssRunningInterval">—</dd></div><div><dt>上次成功同步</dt><dd id="rssLastSuccess">—</dd></div></dl>
            <button id="fetchRssBtn" class="btn btn-primary">
              <Icon name="sync" />
              立即刷新
            </button>
          </div>
        </div>
        <div class="settings-card collection-card"><div class="section-heading collection-heading"><div><h2>热榜采集</h2><p>持久浏览器会话；遇到验证时暂停，保留上次榜单。</p></div><button id="hotCollectionRefresh" type="button" class="icon-btn" aria-label="刷新热榜采集状态"><Icon name="sync" /></button></div>
          <dl class="diagnostic-list"><div><dt>采集状态</dt><dd id="hotCollectionState">读取中</dd></div><div><dt>采集频率</dt><dd>{cadence.hotCollectIntervalSeconds} 秒 · 最近回复、最新发布各 1 页</dd></div><div><dt>上次成功采集</dt><dd id="hotCollectionSuccess">—</dd></div></dl>
          <div class="form-actions verification-actions"><button id="hotVerificationOpen" type="button" class="btn btn-secondary">人工验证</button><button id="hotVerificationResume" type="button" class="btn btn-primary" disabled>恢复采集</button></div>
          <p id="hotVerificationMessage" class="insight-note" role="status">在服务器浏览器中完成验证并进入帖子列表，然后恢复采集。验证窗口有效期 15 分钟。</p>
        </div>
        <div class="settings-card collection-card"><div class="section-heading collection-heading"><div><h2>采集质量</h2><p>运行记录与作者补全进度。刷新记录不会触发源站请求。</p></div><button id="collectionQualityRefresh" type="button" class="icon-btn" aria-label="刷新采集记录"><Icon name="sync" /></button></div><div id="collectionQuality" aria-live="polite"><p class="insight-note">正在读取采集记录…</p></div></div>
      </section>

      <TelegramSettings active={path === "/settings/telegram"} />
      <AccountSettings active={path === "/settings/account"} />

      <StatisticsPage active={path === "/statistics"} />
      <HotPage active={path === "/hot"} />

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
