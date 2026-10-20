import { FieldInput } from './Controls';
import { raw } from 'hono/html';
import type { FC, PropsWithChildren } from 'hono/jsx';
import iconPaths from './icons.json';

export const Icon: FC<{ name: string }> = ({ name }) => (
    <svg data-icon={name} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">{raw(iconPaths[name as keyof typeof iconPaths] || iconPaths.info)}</svg>
);

export const BrandMark: FC = () => (
    <img src="/icons/seekfeed.svg" width="36" height="36" alt="" class="brand-mark" />
);

const categories = [
    ['daily', '日常'], ['tech', '技术'], ['info', '情报'], ['review', '测评'],
    ['trade', '交易'], ['carpool', '拼车'], ['promotion', '推广'], ['life', '生活'],
    ['dev', 'Dev'], ['photo-share', '贴图'], ['expose', '曝光'], ['inside', '内版'], ['sandbox', '沙盒'],
];

export const DashboardSurface: FC<PropsWithChildren<{ path?: string }>> = ({ children, path = "/hot" }) => (
    <div class="workspace-shell">
        <button id="sidebarBackdrop" class="sidebar-backdrop" aria-label="关闭导航" hidden></button>
        <aside class="workspace-sidebar" id="workspaceSidebar" aria-label="主导航">
            <div class="sidebar-brand-row"><a href="/hot" data-route class="workspace-brand"><span class="brand-icon"><BrandMark /></span><span><strong>SeekFeed</strong></span></a><button id="sidebarClose" type="button" class="icon-btn mobile-menu" aria-label="关闭导航"><Icon name="close" /></button></div>
            <nav class="workspace-nav">
                <p class="nav-section-label">社区动态</p>
                <a href="/hot" class="nav-item" data-route><Icon name="flame" />热榜</a>
                <a href="/posts" id="navLatest" class="nav-item" data-route><Icon name="posts" />最新帖子</a>
                <a href="/matched" id="navMatched" class="nav-item" data-route data-auth-only><Icon name="bell" />命中订阅</a>
                <a href="/subscriptions" class="nav-item" data-route data-auth-only><Icon name="list" />订阅管理</a>
                <a href="/statistics" class="nav-item" data-route><Icon name="chart" />统计信息</a>
                <div class="nav-divider" data-auth-only></div>
                <p class="nav-section-label" data-auth-only>设置</p><a href="/settings/account" class="nav-item" data-route data-auth-only><Icon name="settings" />账号与安全</a>
                <a href="/settings/rss" class="nav-item" data-route data-auth-only><Icon name="rss" />RSS 配置</a>
                <a href="/settings/telegram" class="nav-item" data-route data-auth-only><Icon name="send" />Telegram</a>
            </nav>
            <div class="workspace-account"><span class="account-avatar-wrap"><button id="accountAvatarButton" type="button" class="account-avatar" aria-label="登录" aria-describedby="accountAvatarHint"><span data-account-avatar>S</span></button><span id="accountAvatarHint" class="account-avatar-hint" role="tooltip">点击登录</span></span><span><strong id="accountLabel" style="visibility:hidden">账户</strong><small>本地控制台</small></span><button id="logoutBtn" type="button" class="icon-btn" title="退出登录" aria-label="退出登录" data-auth-only><Icon name="logout" /></button></div>
        </aside>
        <div class="workspace-main">
            <header class="workspace-topbar">
                <div class="breadcrumb"><button id="sidebarToggle" class="icon-btn mobile-menu" aria-label="打开导航" aria-expanded="false" aria-controls="workspaceSidebar"><Icon name="menu" /></button><span id="breadcrumbSection">{path.startsWith('/settings') ? '设置' : '社区动态'}</span><span class="breadcrumb-divider">/</span><strong id="breadcrumbCurrent">{({ "/": "热榜", "/posts": "最新帖子", "/hot": "热榜", "/matched": "命中订阅", "/subscriptions": "订阅管理", "/statistics": "统计信息", "/settings/account": "账号与安全", "/settings/rss": "RSS 配置", "/settings/telegram": "Telegram" } as Record<string, string>)[path]}</strong></div>
                <div class="header-actions">
                    <a href="https://github.com/haoch1/SeekFeed" target="_blank" rel="noopener noreferrer" class="icon-btn github-link" aria-label="查看 GitHub 源码（新窗口打开）" aria-describedby="githubLinkHint"><Icon name="github" /><span id="githubLinkHint" class="github-link-hint" role="tooltip">GitHub</span></a>
                    <button id="themeToggleBtn" class="icon-btn" title="切换主题" aria-label="切换主题"><Icon name="sun" /></button>
                </div>
            </header>
            <main class="workspace-content" id="mainContent"><section id="feedPage" class="route-page" hidden={path !== "/posts" && path !== "/matched"}>
                <div class="workspace-heading"><div><h1 id="pageTitle"><Icon name={path === "/matched" ? "bell" : "posts"} /><span>{path === "/matched" ? "命中订阅" : "最新帖子"}</span></h1></div><div class="heading-actions" data-auth-only><a href="/subscriptions" data-route class="btn btn-secondary manage-subscriptions" aria-label="管理订阅" title="管理订阅"><Icon name="list" /><span>管理订阅</span></a><button id="syncNowBtn" class="btn btn-primary"><Icon name="sync" /><span>立即刷新</span></button></div></div>
                <section class="metric-strip" aria-label="监控统计">
                    <div class="metric"><Icon name="posts" /><div><span>已收录帖子</span><strong id="overviewTotal">—</strong></div></div>
                    <div class="metric" data-auth-only><Icon name="target" /><div><span>命中订阅</span><strong id="overviewMatched">—</strong></div></div>
                    <div class="metric" data-auth-only><Icon name="send" /><div><span>已成功推送</span><strong id="overviewPushed">—</strong></div></div>
                </section>
                <section class="feed-panel" aria-label="帖子动态">
                    <div class="feed-panel-heading"><h2>帖子动态</h2><div class="feed-live-actions"><button type="button" id="newPostsBtn" class="btn btn-secondary btn-xs" hidden><Icon name="arrow-up" />有新帖，查看最新</button><span id="monitorStatus" class="monitor-status" data-auth-only><i></i><span>读取监控状态</span></span></div></div>
                    <div class="feed-toolbar">
                        <div class="search-box"><Icon name="search" /><FieldInput type="search" id="searchInput" placeholder="搜索标题、作者…" aria-label="搜索标题、作者" class="search-input" /><button id="clearSearchBtn" class="search-clear" aria-label="清除搜索" style="display:none"><Icon name="close" /></button></div>
                        <select data-1p-ignore="true" data-op-ignore="true" id="filterCategory" class="filter-select" aria-label="分类筛选"><option value="">全部分类</option>{categories.map(([value, label]) => <option value={value}>{label}</option>)}</select>
                        <span data-auth-only><select data-1p-ignore="true" data-op-ignore="true" id="filterStatus" class="filter-select" aria-label="推送状态筛选"><option value="">全部状态</option><option value="0">待匹配</option><option value="1">待推送</option><option value="3">已推送</option><option value="2">未命中</option></select></span>
                        <button id="filterToggleBtn" class="btn btn-secondary" aria-expanded="false" aria-controls="filterPanel"><Icon name="filter" />筛选</button>
                        <button id="refreshBtn" class="icon-btn" title="立即刷新" aria-label="立即刷新"><Icon name="sync" /></button>
                        <nav id="paginationTop" class="feed-pagination-compact" data-feed-pagination="top" aria-label="上方帖子分页" style="display:none"><button type="button" class="pagination-btn" data-page-step="-1" aria-label="上一页"><Icon name="chevron-left" /></button><span class="pagination-position" data-page-position tabindex="-1"></span><button type="button" class="pagination-btn" data-page-step="1" aria-label="下一页"><Icon name="chevron-right" /></button></nav>
                    </div>
                    <div id="filterPanel" class="filter-panel" style="display:none"><div class="filter-panel-inner"><button id="subscribedOnlyChip" class="toggle-chip" type="button" aria-pressed="false" style="display:none"><span class="toggle-chip-label">只看订阅</span></button><select data-1p-ignore="true" data-op-ignore="true" id="filterSubscription" class="filter-select" aria-label="订阅筛选" style="display:none"><option value="">全部订阅</option></select><select data-1p-ignore="true" data-op-ignore="true" id="filterSearchMode" class="filter-select" aria-label="搜索匹配方式" title="仅影响标题与作者搜索；订阅命中和推送规则保持精准匹配"><option value="contains">包含匹配</option><option value="fuzzy">容错匹配</option></select><FieldInput type="text" id="filterCreator" placeholder="作者筛选" aria-label="作者筛选" class="filter-input" /><button id="clearFiltersBtn" class="btn btn-text">清除筛选</button></div></div>
                    <div id="feedError" class="inline-error" role="alert" hidden>列表更新失败，已保留当前内容。请点击刷新重试。</div>
                    <div id="postsList" class="posts-list" aria-live="polite" aria-busy="true"><div class="skeleton-wrapper">{[1, 2, 3, 4, 5].map(() => <div class="post-skeleton"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-line"></div></div>)}</div></div>
                    <div id="emptyState" class="empty-state" style="display:none"><Icon name="search" /><div class="empty-title">暂无文章</div><div class="empty-desc">同步 RSS 或调整筛选条件后再试。</div></div>
                    <div id="pagination" class="pagination-wrapper" data-feed-pagination="bottom" style="display:none"><span id="paginationInfo" class="pagination-info"></span><nav class="pagination-controls" aria-label="下方帖子分页"><button type="button" id="prevPageBtn" class="pagination-btn" data-page-step="-1" aria-label="上一页"><Icon name="chevron-left" /></button><div id="pageNumbers" class="page-numbers"></div><button type="button" id="nextPageBtn" class="pagination-btn" data-page-step="1" aria-label="下一页"><Icon name="chevron-right" /></button></nav></div>
                </section>
                <p id="syncDetail" class="sync-detail" aria-live="polite" data-auth-only></p>
            </section><div id="routePages">{children}</div></main>
        </div>
    </div>
);
