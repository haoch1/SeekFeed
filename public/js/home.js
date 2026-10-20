// ============================================
// 工作台交互 - 帖子列表、独立设置页面与登录
// ============================================

document.addEventListener("DOMContentLoaded", function () {
  const sessionId = localStorage.getItem("sessionId");
  const isLoggedIn = !!sessionId;

  // 根据登录状态显示/隐藏元素
  const loginBtn = document.getElementById("loginBtn");
  const settingsDropdown = document.getElementById("settingsDropdown");
  const subscribedOnlyChip = document.getElementById("subscribedOnlyChip");
  const filterSubscription = document.getElementById("filterSubscription");
  
  if (isLoggedIn) {
    // 已登录：显示设置菜单和订阅相关功能，隐藏登录按钮
    if (loginBtn) loginBtn.style.display = "none";
    if (settingsDropdown) settingsDropdown.style.display = "block";
    if (subscribedOnlyChip) subscribedOnlyChip.style.display = "inline-flex";
    if (filterSubscription) filterSubscription.style.display = "block";
  } else {
    // 未登录：显示登录按钮，隐藏设置菜单和订阅相关功能
    if (loginBtn) loginBtn.style.display = "flex";
    if (settingsDropdown) settingsDropdown.style.display = "none";
    if (subscribedOnlyChip) subscribedOnlyChip.style.display = "none";
    if (filterSubscription) filterSubscription.style.display = "none";
  }

  // ============================================
  // Toast 通知系统
  // ============================================
  function renderIcon(name) {
    return window.SeekFeedControls.icon(name);
  }

  const Toast = {
    container: null,

    init() {
      if (!this.container) {
        this.container = document.getElementById("toastContainer");
      }
    },

    show(message, type = "info", duration = 3000) {
      this.init();
      if (!this.container) return;

      const toast = document.createElement("div");
      toast.className = `toast ${type}`;
      toast.setAttribute("role", type === "error" ? "alert" : "status");

      const icons = {
        success: "success",
        error: "error",
        warning: "warning",
        info: "info",
      };

      toast.innerHTML = `
        <span class="toast-icon">${renderIcon(icons[type] || icons.info)}</span>
        <div class="toast-content">
          <div class="toast-message">${escapeHtml(message)}</div>
        </div>
        <button class="toast-close" aria-label="关闭提示">${renderIcon("close")}</button>
      `;

      this.container.appendChild(toast);
      while (this.container.children.length > 3) this.container.firstElementChild.remove();

      toast.querySelector(".toast-close").addEventListener("click", () => {
        this.hide(toast);
      });

      if (duration > 0) {
        setTimeout(() => this.hide(toast), duration);
      }

      return toast;
    },

    hide(toast) {
      toast.classList.add("toast-exit");
      setTimeout(() => toast.remove(), 300);
    },

    success(message, duration) {
      return this.show(message, "success", duration);
    },
    error(message, duration) {
      return this.show(message, "error", duration);
    },
    warning(message, duration) {
      return this.show(message, "warning", duration);
    },
    info(message, duration) {
      return this.show(message, "info", duration);
    },
  };

  // ============================================
  // API 请求封装
  // ============================================
  async function apiRequest(url, options = {}) {
    const { silent = false, ...requestOptions } = options;
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (sessionId) {
      headers.Authorization = `Bearer ${sessionId}`;
    }

    const defaultOptions = { headers };

    try {
      const response = await fetch(url, { ...requestOptions, ...defaultOptions });
      const result = await response.json();

      if (response.status === 401) {
        if (sessionId) {
          localStorage.removeItem("sessionId");
          window.location.reload();
        }
        return null;
      }

      return result;
    } catch (error) {
      if (error.name === "AbortError") return null;
      if (!silent) { console.error("API 请求错误:", error); Toast.error("网络错误，请重试"); }
      return null;
    }
  }

  // ============================================
  // 主题切换
  // ============================================
  function initTheme() {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      document.documentElement.setAttribute("data-theme", savedTheme);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.setAttribute("data-theme", "dark");
    }

    const themeButton = document.getElementById("themeToggleBtn");
    if (themeButton) themeButton.innerHTML = `<span class="theme-toggle-icon theme-icon-sun">${renderIcon('sun')}</span><span class="theme-toggle-icon theme-icon-moon">${renderIcon('moon')}</span>`;
    const updateThemeIcon = () => {
      if (!themeButton) return;
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      themeButton.setAttribute("aria-label", isDark ? "切换到浅色模式" : "切换到暗色模式");
      themeButton.title = themeButton.getAttribute("aria-label");
    };
    updateThemeIcon();
    let themeTimer;
    let themeTransition;
    themeButton?.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme");
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      const root = document.documentElement;
      const apply = () => {
        root.setAttribute("data-theme", newTheme);
        localStorage.setItem("theme", newTheme);
        updateThemeIcon();
      };
      if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        themeTransition?.skipTransition();
        routeTransition?.skipTransition();
        root.classList.remove('route-transition');
        themeTransition = document.startViewTransition(apply);
        return;
      }
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        clearTimeout(themeTimer);
        root.classList.add('theme-transition');
        // Resolve transition styles before changing the shared color tokens.
        getComputedStyle(document.body).backgroundColor;
        themeTimer = setTimeout(() => root.classList.remove('theme-transition'), 360);
      }
      apply();

    });
  }

  // ============================================
  // 抽屉系统
  // ============================================
  const Drawer = {
    overlay: document.getElementById("drawerOverlay"),
    activeDrawer: null,
    opener: null,
    element(name) { return document.getElementById(name === "login" ? "loginModal" : `${name}Drawer`); },
    init() {
      document.querySelectorAll(".drawer").forEach(drawer => {
        drawer.setAttribute("role", "dialog");
        drawer.setAttribute("aria-modal", "true");
        const title = drawer.querySelector(".drawer-title");
        title.id = `${drawer.id}Title`;
        drawer.setAttribute("aria-labelledby", title.id);
        drawer.querySelector(".drawer-close")?.setAttribute("aria-label", "关闭面板");
      });
      document.querySelectorAll(".drawer-close").forEach(btn => btn.addEventListener("click", () => this.closeAll()));
      this.overlay?.addEventListener("click", () => this.closeAll());
      document.addEventListener("keydown", e => {
        if (!this.activeDrawer) return;
        if (e.key === "Escape") this.closeAll();
        if (e.key !== "Tab") return;
        const items = [...this.element(this.activeDrawer).querySelectorAll('button, input, select, a[href]')].filter(el => !el.disabled && el.getClientRects().length);
        const first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      });
    },
    open(name) {
      const drawer = this.element(name);
      if (!drawer) return;
      if (this.activeDrawer) this.closeAll(false);
      this.opener = document.activeElement;
      this.activeDrawer = name;
      document.querySelector(".workspace-shell").inert = true;
      drawer.style.display = "flex";
      this.overlay.style.display = "block";
      requestAnimationFrame(() => { drawer.classList.add("drawer-open"); this.overlay.classList.add("overlay-visible"); });
      document.body.style.overflow = "hidden";
      drawer.querySelector(".drawer-close")?.focus({ preventScroll: true });
    },
    closeAll(restore = true) {
      if (!this.activeDrawer) return;
      const drawer = this.element(this.activeDrawer);
      drawer.classList.remove("drawer-open");
      drawer.style.display = "none";
      this.overlay.style.display = "none";
      this.overlay.classList.remove("overlay-visible");
      document.body.style.overflow = "";
      document.querySelector(".workspace-shell").inert = false;
      this.activeDrawer = null;
      if (restore) this.opener?.focus({ preventScroll: true });
    },
  };

  // ============================================
  // 帖子列表管理
  // ============================================
  let currentPage = 1;
  let currentFilters = {};
  let postsController;
  let postsRequest = 0;
  let renderedFilters = '';
  let latestSeenPostId = null;
  let liveRefreshing = false;
  const el = id => document.getElementById(id);

  async function loadPosts(page = currentPage, filters = currentFilters, quiet = false) {
    const list = el("postsList");
    if (quiet && (list.getAttribute('aria-busy') === 'true' || list.contains(document.activeElement) || el('pagination').contains(document.activeElement))) return;
    const anchor = quiet && window.scrollY > 0 ? [...list.querySelectorAll('.post-card')].find(item => item.getBoundingClientRect().bottom > 0) : null;
    const anchorId = anchor?.dataset.postId;
    const anchorTop = anchor?.getBoundingClientRect().top;
    const sameFilters = JSON.stringify(filters) === renderedFilters;
    if (sameFilters && list.querySelector('.post-card')) {
      list.style.minHeight = `${list.getBoundingClientRect().height}px`;
    } else {
      list.style.minHeight = '';
    }
    window.SeekFeedControls?.refreshSelects();
    postsController?.abort();
    postsController = new AbortController();
    const request = ++postsRequest;
    currentFilters = { ...filters };
    if (!quiet) el("postsList").setAttribute("aria-busy", "true");
    const params = new URLSearchParams({ page: String(page), limit: "10",
      ...Object.fromEntries(Object.entries(currentFilters).filter(([, value]) => value !== "" && value !== undefined)) });
    const result = await apiRequest(`/api/posts?${params}`, { signal: postsController.signal, silent: quiet });
    if (request !== postsRequest) return;
    el("postsList").setAttribute("aria-busy", "false");
    if (!result?.success) {
      if (list.querySelector('.post-card')) {
        if (!quiet) el('feedError').hidden = false;
        return;
      }
      el("postsList").replaceChildren();
      el("emptyState").style.display = "block";
      el("emptyState").querySelector(".empty-title").textContent = "加载失败";
      el("emptyState").querySelector(".empty-desc").textContent = "请检查网络连接，然后点击刷新重试。";
      el("pagination").style.display = "none";
      return;
    }
    const { posts, total, page: selected, totalPages } = result.data;
    currentPage = selected;
    renderedFilters = JSON.stringify(currentFilters);
    if (totalPages <= 1) list.style.minHeight = '';
    el('feedError').hidden = true;
    if (!posts.length && page > 1 && totalPages > 0) return loadPosts(totalPages);
    const existing = new Map([...list.querySelectorAll('.post-card')].map(item => [item.dataset.postId, item]));
    const keep = new Set();
    posts.forEach((post, index) => {
      const key = String(post.post_id);
      const previous = existing.get(key);
      let item = previous;
      if (!item) item = createPostElement(post);
      else if (item.dataset.signature !== JSON.stringify(post)) {
        const updated = createPostElement(post);
        for (const selector of ['.post-header', '.post-memo', '.post-meta', '.delivery-status']) {
          const old = item.querySelector(selector), next = updated.querySelector(selector);
          if (old.outerHTML !== next.outerHTML) old.replaceWith(next);
        }
        item.dataset.signature = updated.dataset.signature;
      }
      keep.add(item);
      if (list.children[index] !== item) list.insertBefore(item, list.children[index] || null);
    });
    [...list.children].filter(item => !keep.has(item)).forEach(item => item.remove());
    if (selected === 1) { latestSeenPostId = posts[0]?.post_id || null; el('newPostsBtn').hidden = true; }
    if (anchorId) {
      const kept = [...list.children].find(item => item.dataset.postId === anchorId);
      if (kept) window.scrollBy({ top: kept.getBoundingClientRect().top - anchorTop, behavior: 'instant' });
    }
    el("emptyState").style.display = posts.length ? "none" : "block";
    el("emptyState").querySelector(".empty-title").textContent = "暂无文章";
    el("emptyState").querySelector(".empty-desc").textContent = Object.values(currentFilters).some(Boolean) ? "没有符合条件的帖子，试试清除筛选。" : "同步 RSS 后，最新帖子会显示在这里。";
    updatePagination(selected, totalPages, total);
    if (!isLoggedIn && !Object.values(currentFilters).some(Boolean)) el("overviewTotal").textContent = total.toLocaleString();
  }

  async function refreshFeed() {
    if (liveRefreshing || document.hidden || el('feedPage').hidden || Drawer.activeDrawer || el('postsList').getAttribute('aria-busy') === 'true') return;
    liveRefreshing = true;
    try {
      if (currentPage === 1) await loadPosts(1, currentFilters, true);
      else {
        const snapshot = JSON.stringify(currentFilters);
        const request = postsRequest;
        const params = new URLSearchParams({ page: '1', limit: '1', ...Object.fromEntries(Object.entries(currentFilters).filter(([, value]) => value !== '' && value !== undefined)) });
        const result = await apiRequest(`/api/posts?${params}`, { silent: true });
        if (result?.success && request === postsRequest && snapshot === JSON.stringify(currentFilters)) {
          const newest = result.data.posts[0]?.post_id;
          if (latestSeenPostId && newest && newest !== latestSeenPostId) el('newPostsBtn').hidden = false;
        }
      }
    } finally { liveRefreshing = false; }
  }

  function createPostElement(post) {
    const item = document.createElement("article");
    item.className = "post-card";
    item.dataset.postId = String(post.post_id);
    item.dataset.signature = JSON.stringify(post);
    const href = `https://www.nodeseek.com/post-${Number(post.post_id)}-1`;
    const tags = [post.sub_keyword1, post.sub_keyword2, post.sub_keyword3].filter(Boolean)
      .map(word => `<span class="tag tag-blue">${escapeHtml(word)}</span>`).join("");
    const status = { 0: "待匹配", 1: "待推送", 2: "未命中", 3: "已推送" }[post.push_status] || "未知";
    const date = new Date(post.pub_date);
    const time = Number.isNaN(date.getTime()) ? "时间未知" : new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
    item.innerHTML = `<div class="post-content"><div class="post-header"><h3 class="post-title"><a href="${href}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(post.title)}">${escapeHtml(post.title)}</a></h3></div><p class="post-memo">${escapeHtml(post.memo || "")}</p><div class="post-meta"><span class="post-category">${escapeHtml(getCategoryName(post.category))}</span><span>${escapeHtml(post.creator)}</span><span class="post-date">${time}</span>${tags ? `<span class="post-sub-tags">${tags}</span>` : ""}</div></div><div class="post-actions"><span class="delivery-status" data-status="${Number(post.push_status)}">${status}</span><a class="icon-btn" href="${href}" target="_blank" rel="noopener noreferrer" aria-label="打开帖子">${renderIcon("external")}</a></div>`;
    return item;
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }
  const categoryMap = { daily: "日常", tech: "技术", info: "情报", review: "测评", trade: "交易", carpool: "拼车", promotion: "推广", life: "生活", dev: "Dev", "photo-share": "贴图", expose: "曝光", inside: "内版", sandbox: "沙盒" };
  function getCategoryName(key) { return key ? key.split(",").map(k => categoryMap[k.trim()] || k.trim()).join("、") : "未分类"; }

  function updatePagination(page, pages, total) {
    el("pagination").style.display = total ? "flex" : "none";
    el("paginationInfo").textContent = `共 ${total} 篇 · 第 ${page} / ${Math.max(pages, 1)} 页`;
    el("prevPageBtn").disabled = page <= 1;
    el("nextPageBtn").disabled = page >= pages;
    const key = JSON.stringify([page, pages]);
    if (el('pageNumbers').dataset.signature === key) return;
    el('pageNumbers').dataset.signature = key;
    const focusPage = el("pageNumbers").contains(document.activeElement) ? Number(document.activeElement.textContent) : null;
    el("pageNumbers").replaceChildren();
    let numbers;
    if (pages <= 7) numbers = Array.from({ length: pages }, (_, i) => i + 1);
    else if (page <= 4) numbers = [1, 2, 3, 4, 5, 'ellipsis-start', pages];
    else if (page >= pages - 3) numbers = [1, 'ellipsis-end', pages - 4, pages - 3, pages - 2, pages - 1, pages];
    else numbers = [1, 'ellipsis-start', page - 1, page, page + 1, 'ellipsis-end', pages];
    for (const i of numbers) {
      if (typeof i !== 'number') {
        const gap = document.createElement('span');
        gap.className = 'page-ellipsis';
        gap.textContent = '…';
        gap.setAttribute('aria-hidden', 'true');
        el('pageNumbers').append(gap);
        continue;
      }
      const button = document.createElement("button");
      button.className = `page-number ${i === page ? "active" : ""}`;
      button.textContent = i;
      button.setAttribute("aria-label", `第 ${i} 页`);
      if (i === page) button.setAttribute("aria-current", "page");
      button.addEventListener("click", () => loadPosts(i));
      el("pageNumbers").append(button);
      if (i === focusPage) button.focus({ preventScroll: true });
    }
  }
  function setMatched(active) {
    if (active) { currentFilters.pushStatusIn = "1,3"; delete currentFilters.pushStatus; el("filterStatus").value = ""; }
    else delete currentFilters.pushStatusIn;
    el("subscribedOnlyChip").classList.toggle("active", active);
    el("subscribedOnlyChip").setAttribute("aria-pressed", String(active));
    el("navMatched").classList.toggle("selected", active);
    el("navLatest").classList.toggle("selected", !active);
    ["navLatest", "navMatched"].forEach(id => el(id).removeAttribute("aria-current"));
    el(active ? "navMatched" : "navLatest").setAttribute("aria-current", "page");
    el("pageTitle").textContent = el("breadcrumbCurrent").textContent = active ? "命中订阅" : "最新帖子";
  }
  function initFilters() {
    el('newPostsBtn').addEventListener('click', async () => { await loadPosts(1); el('feedPage').scrollIntoView({ block: 'start', behavior: 'instant' }); });
    let searchTimer, creatorTimer;
    el("searchInput").addEventListener("input", e => {
      clearTimeout(searchTimer);
      el("clearSearchBtn").style.display = e.target.value ? "block" : "none";
      searchTimer = setTimeout(() => { currentFilters.search = e.target.value.trim(); loadPosts(1); }, 300);
    });
    el("clearSearchBtn").addEventListener("click", () => {
      clearTimeout(searchTimer); el("searchInput").value = ""; el("clearSearchBtn").style.display = "none";
      delete currentFilters.search; loadPosts(1);
    });
    el("filterToggleBtn").addEventListener("click", () => {
      const open = el("filterPanel").style.display === "none";
      el("filterPanel").style.display = open ? "block" : "none";
      el("filterToggleBtn").setAttribute("aria-expanded", String(open));
    });
    [["filterCategory", "category"], ["filterSubscription", "subId"], ["filterStatus", "pushStatus"]].forEach(([id, key]) => {
      el(id).addEventListener("change", e => {
        if (key === "pushStatus") setMatched(false);
        currentFilters[key] = e.target.value; loadPosts(1);
      });
    });
    el("filterCreator").addEventListener("input", e => {
      clearTimeout(creatorTimer);
      creatorTimer = setTimeout(() => { currentFilters.creator = e.target.value.trim(); loadPosts(1); }, 300);
    });
    el("clearFiltersBtn").addEventListener("click", () => {
      clearTimeout(searchTimer); clearTimeout(creatorTimer);
      ["searchInput", "filterCreator", "filterCategory", "filterSubscription", "filterStatus"].forEach(id => el(id).value = "");
      window.SeekFeedControls.refreshSelects();
      el("clearSearchBtn").style.display = "none"; currentFilters = {}; setMatched(false); loadPosts(1);
    });
    el("subscribedOnlyChip").addEventListener("click", () => { setMatched(!currentFilters.pushStatusIn); loadPosts(1); });
    el("refreshBtn").addEventListener("click", pendingClick(() => Promise.all([loadPosts(), updateStats(), updateMonitor()])));
    el("prevPageBtn").addEventListener("click", () => loadPosts(Math.max(1, currentPage - 1)));
    el("nextPageBtn").addEventListener("click", () => loadPosts(currentPage + 1));
    ["syncNowBtn", "fetchRssBtn"].forEach(id => el(id).addEventListener("click", syncNow));
  }
  let syncing = false;
  async function syncNow() {
    if (!isLoggedIn) return LoginModal.open();
    if (syncing) return;
    syncing = true;
    const finishes = ["syncNowBtn", "fetchRssBtn"].map(id => window.SeekFeedControls.beginPending(el(id), '正在同步'));
    let result;
    try { result = await apiRequest("/api/rss/fetch", { method: "POST" }); }
    finally { await Promise.all(finishes.map(finish => finish?.())); syncing = false; }
    if (result?.success) {
      const failed = result.data.notifications?.failed || 0;
      Toast.show(`同步完成，新增 ${result.data.new} 篇，成功推送 ${result.data.notifications?.pushed || 0} 篇${failed ? `；${failed} 篇发送失败，将在后续同步重试` : ""}`, failed ? "warning" : "success");
      await loadPosts(1); updateStats();
    } else Toast.error(result?.message || "同步失败，请稍后重试");
    updateMonitor();
  }
  async function updateStats(quiet = false) {
    const result = await apiRequest("/api/stats/overview", { silent: quiet });
    if (!result?.success) return;
    const data = result.data;
    const fields = { overviewTotal: data.total_posts,
      overviewMatched: data.matched_not_pushed + data.pushed_posts, overviewPushed: data.pushed_posts };
    Object.entries(fields).forEach(([id, value]) => el(id).textContent = Number(value || 0).toLocaleString());
  }
  async function updateMonitor(quiet = false) {
    const result = await apiRequest("/api/scheduler/status", { silent: quiet });
    const status = result?.data?.rssTask;
    const label = el("monitorStatus");
    label.dataset.state = !status ? "error" : status.lastError ? "error" : status.running ? "running" : "paused";
    label.querySelector("span").textContent = !status ? "状态不可用" : status.busy ? "正在同步" : status.lastError ? "同步异常，等待重试" : status.running ? `监控中 · 每 ${status.intervalSeconds} 秒` : "自动监控已关闭";
    label.title = status?.lastError || "";
    el("rssRunningStatus").textContent = !status ? "状态不可用" : status.lastError ? "同步异常，等待重试" : status.busy ? "正在同步" : status.running ? "运行中" : "已关闭";
    el("rssRunningInterval").textContent = status?.intervalSeconds ? `每 ${status.intervalSeconds} 秒` : "—";
    el("rssLastSuccess").textContent = status?.lastSuccessAt ? new Date(status.lastSuccessAt).toLocaleString("zh-CN", { hour12: false }) : "暂无记录";
    el("syncDetail").textContent = status?.lastSuccessAt ? `上次同步 ${new Date(status.lastSuccessAt).toLocaleString("zh-CN", { hour12: false })}` : "";
  }

  // ============================================
  // 统计图表
  // ============================================
  const analytics = window.SeekFeedStatistics({ apiRequest, escapeHtml, renderIcon, getCategoryName, isLoggedIn });

  // ============================================
  // RSS 配置
  // ============================================
  async function loadRssConfig() {
    const result = await apiRequest("/api/rss/config");
    if (result?.success) {
      document.getElementById("rssUrl").value = result.data.rss_url || "";
      document.getElementById("rssInterval").value = result.data.rss_interval_seconds || 60;
      document.getElementById("rssProxy").value = result.data.rss_proxy || "";
    }
  }

  function initRssConfig() {
    // 保存配置
    document.getElementById("rssConfigForm")?.addEventListener("submit", pendingSubmit(async (e) => {
      e.preventDefault();

      const data = {
        rss_url: document.getElementById("rssUrl").value.trim(),
        rss_interval_seconds: parseInt(document.getElementById("rssInterval").value, 10),
        rss_proxy: document.getElementById("rssProxy").value.trim(),
      };

      const result = await apiRequest("/api/rss/config", {
        method: "PUT",
        body: JSON.stringify(data),
      });

      if (result?.success) {
        Toast.success("RSS 配置已保存");
        if (data.rss_interval_seconds) {
          await apiRequest("/api/rss/restart", { method: "POST" });
        }
      } else {
        Toast.error(result?.message || "保存失败");
      }
    }));

    // 测试连接
    document.getElementById("testRssBtn")?.addEventListener("click", pendingClick(async () => {
      const rssUrl = document.getElementById("rssUrl").value.trim();

      const result = await apiRequest("/api/rss/test-connection", {
        method: "POST",
        body: JSON.stringify({ rss_url: rssUrl }),
      });

      if (result?.success) {
        if (result.data.accessible) {
          Toast.success("RSS 源连接正常");
        } else {
          Toast.error("连接失败：" + result.data.message);
        }
      }
    }));
  }

  // ============================================
  // Telegram 配置
  // ============================================
  async function loadTelegramConfig() {
    const result = await apiRequest("/api/config");
    if (result?.success) {
      document.getElementById("botToken").value = result.data.bot_token || "";
      document.getElementById("chatId").value = result.data.chat_id || "";
      document.getElementById("stopPush").checked = result.data.stop_push === 1;
      document.getElementById("onlyTitle").checked = result.data.only_title === 1;
    }
    if (!el("webhookUrl").value) el("webhookUrl").value = `${location.origin}/telegram/webhook`;
    // 同时加载交互模式状态
    await loadTelegramInteractionStatus();
  }

  async function loadTelegramInteractionStatus() {
    const result = await apiRequest("/api/webhook/status");
    if (!result?.success) return;

    const data = result.data;
    const mode = data.telegram_mode || "disabled";
    const pollingActive = data.polling_active || false;

    // 同步模式选择器
    const radio = document.querySelector(`input[name="telegramMode"][value="${mode}"]`);
    if (radio) radio.checked = true;

    // 切换面板显示
    updateTelegramModeUI(mode, pollingActive);

    // 更新状态面板
    const statusPanel = document.getElementById("telegramStatusPanel");
    if (statusPanel) {
      statusPanel.style.display = "block";
      const botStatus = document.getElementById("telegramBotStatus");
      const webhookStatus = document.getElementById("telegramWebhookStatus");
      const bindingStatus = document.getElementById("telegramBindingStatus");
      if (botStatus) botStatus.textContent = data.connected ? "已连接" : data.configured ? "连接失败" : "未配置";
      if (webhookStatus) {
        if (pollingActive) {
          webhookStatus.textContent = "Polling 运行中";
        } else if (data.webhook_set) {
          webhookStatus.textContent = "已设置";
        } else {
          webhookStatus.textContent = "未设置";
        }
      }
      if (bindingStatus) bindingStatus.textContent = data.bound ? "已绑定" : "未绑定";
    }
  }

  function updateTelegramModeUI(mode, pollingActive) {
    const webhookPanel = document.getElementById("webhookModePanel");
    const pollingPanel = document.getElementById("pollingModePanel");
    const startBtn = document.getElementById("startPollingBtn");
    const stopBtn = document.getElementById("stopPollingBtn");
    const statusIndicator = document.getElementById("pollingStatusIndicator");

    if (webhookPanel) webhookPanel.style.display = mode === "webhook" ? "block" : "none";
    if (pollingPanel) pollingPanel.style.display = mode === "polling" ? "block" : "none";
    el("disabledModePanel").style.display = mode === "disabled" ? "block" : "none";

    if (pollingActive) {
      if (startBtn) startBtn.style.display = "none";
      if (stopBtn) stopBtn.style.display = "inline-flex";
      if (statusIndicator) {
        statusIndicator.textContent = "Polling 运行中";
        statusIndicator.style.background = "var(--success-alpha)";
        statusIndicator.style.color = "var(--success)";
      }
    } else {
      if (startBtn) startBtn.style.display = "inline-flex";
      if (stopBtn) stopBtn.style.display = "none";
      if (statusIndicator) {
        statusIndicator.textContent = "Polling 未运行";
        statusIndicator.style.background = "var(--bg-hover)";
        statusIndicator.style.color = "";
      }
    }
  }

  function initTelegramConfig() {
    document.getElementById("telegramConfigForm")?.addEventListener("submit", pendingSubmit(async (e) => {
      e.preventDefault();

      const data = {
        bot_token: document.getElementById("botToken").value.trim(),
        chat_id: document.getElementById("chatId").value.trim(),
        stop_push: document.getElementById("stopPush").checked ? 1 : 0,
        only_title: document.getElementById("onlyTitle").checked ? 1 : 0,
      };

      const result = await apiRequest("/api/config", {
        method: "PUT",
        body: JSON.stringify(data),
      });

      if (result?.success) {
        Toast.success("Telegram 配置已保存");
      } else {
        Toast.error(result?.message || "保存失败");
      }
    }));

    document.getElementById("testTelegramBtn")?.addEventListener("click", pendingClick(async () => {

      // 1. 先测试 Bot 连接
      const result = await apiRequest("/api/webhook/test-connection", { method: "POST" });
      if (!result?.success) {
        Toast.error(result?.message || "连接测试失败");
        return;
      }

      // 2. 如果 Chat ID 已配置，发送测试消息
      const chatId = document.getElementById("chatId").value.trim();
      if (chatId) {
        const testResult = await apiRequest("/api/push/test-send", {
          method: "POST",
          body: JSON.stringify({}),
        });
        if (testResult?.success) {
          Toast.success("连接测试成功，测试消息已发送");
        } else {
          Toast.warning("连接成功，但测试消息发送失败：" + (testResult?.message || "未知错误"));
        }
      } else {
        Toast.success("Bot 连接测试成功（未配置 Chat ID，跳过消息测试）");
      }
    }));

    // 交互模式切换
    document.querySelectorAll('input[name="telegramMode"]').forEach((radio) => {
      radio.addEventListener("change", (e) => {
        const mode = e.target.value;
        updateTelegramModeUI(mode, false);
      });
    });

    // Webhook 表单提交
    document.getElementById("webhookConfigForm")?.addEventListener("submit", pendingSubmit(async (e) => {
      e.preventDefault();
      const webhookUrl = document.getElementById("webhookUrl").value.trim();
      if (!webhookUrl) {
        Toast.warning("请输入 Webhook URL");
        return;
      }

      const result = await apiRequest("/api/webhook/setup", {
        method: "POST",
        body: JSON.stringify({ webhook_url: webhookUrl }),
      });

      if (result?.success) {
        Toast.success("Webhook 设置成功");
        // 保存模式
        await apiRequest("/api/config", {
          method: "PUT",
          body: JSON.stringify({ telegram_mode: "webhook" }),
        });
        await loadTelegramInteractionStatus();
      } else {
        Toast.error(result?.message || "Webhook 设置失败");
      }
    }));

    el("disableTelegramBtn").addEventListener("click", pendingClick(async () => {
      const result = await apiRequest("/api/webhook/disable", { method: "POST" });
      if (result?.success) { Toast.success("命令交互已停用"); loadTelegramInteractionStatus(); }
      else Toast.error(result?.message || "停用失败");
    }));
    // 清除 Webhook
    document.getElementById("clearWebhookBtn")?.addEventListener("click", pendingClick(async () => {
      const result = await apiRequest("/api/webhook/clear-webhook", { method: "POST" });
      if (result?.success) {
        Toast.success("Webhook 已清除");
        await loadTelegramInteractionStatus();
      } else {
        Toast.error(result?.message || "清除失败");
      }
    }));

    // 测试 Webhook 连接
    document.getElementById("testWebhookBtn")?.addEventListener("click", pendingClick(async () => {
      const result = await apiRequest("/api/webhook/test-connection", { method: "POST" });
      if (result?.success) {
        Toast.success("Bot 连接正常");
      } else {
        Toast.error(result?.message || "连接测试失败");
      }
    }));

    // 启动 Polling
    document.getElementById("startPollingBtn")?.addEventListener("click", pendingClick(async () => {
      const result = await apiRequest("/api/webhook/start-polling", { method: "POST" });
      if (result?.success) {
        Toast.success("Polling 已启动");
        updateTelegramModeUI("polling", true);
        await loadTelegramInteractionStatus();
      } else {
        Toast.error(result?.message || "启动失败");
      }
    }));

    // 停止 Polling
    document.getElementById("stopPollingBtn")?.addEventListener("click", pendingClick(async () => {
      const result = await apiRequest("/api/webhook/stop-polling", { method: "POST" });
      if (result?.success) {
        Toast.success("Polling 已停止");
        updateTelegramModeUI("polling", false);
      } else {
        Toast.error(result?.message || "停止失败");
      }
    }));
  }

  // ============================================
  // 筛选面板订阅下拉框
  // ============================================
  async function loadFilterSubscriptions() {
    if (!isLoggedIn) return;
    const filterSubscription = document.getElementById("filterSubscription");
    if (!filterSubscription) return;

    const result = await apiRequest("/api/subscriptions");
    if (!result?.success) return;

    const subs = result.data;
    const currentValue = filterSubscription.value;

    filterSubscription.innerHTML = '<option value="">全部订阅</option>';
    subs.forEach((sub) => {
      const keywords = [sub.keyword1, sub.keyword2, sub.keyword3].filter(Boolean).join(", ");
      const extra = [
        sub.creator ? `作者 ${sub.creator}` : "",
        sub.category ? getCategoryName(sub.category) : "",
      ].filter(Boolean).join(" ");
      const label = [keywords, extra].filter(Boolean).join(" ") || `订阅 #${sub.id}`;

      const option = document.createElement("option");
      option.value = sub.id;
      option.textContent = `#${sub.id} · ${label}`;
      filterSubscription.appendChild(option);
    });

    if (currentValue) filterSubscription.value = currentValue;
  }

  // ============================================
  // 订阅管理
  // ============================================
  async function loadSubscriptions() {
    const result = await apiRequest("/api/subscriptions");
    const container = el("subscriptionsList");
    if (!result?.success) { container.textContent = "订阅加载失败，请刷新页面重试。"; return; }
    container.innerHTML = result.data.length ? result.data.map(sub => `<div class="subscription-item ${sub.enabled === 0 ? "paused" : ""}" data-id="${sub.id}"><div class="subscription-description"><div class="subscription-id">订阅 <span>#${sub.id}</span></div><div class="subscription-keywords">${[sub.keyword1, sub.keyword2, sub.keyword3].filter(Boolean).map(word => `<span class="tag tag-blue">${escapeHtml(word)}</span>`).join("") || '<span class="tag">按作者 / 分类订阅</span>'}</div><div class="subscription-filters"><span class="subscription-state">${sub.enabled === 0 ? "已暂停" : "监控中"}</span>${sub.creator ? `<span>作者 ${escapeHtml(sub.creator)}</span>` : ""}${sub.category ? `<span>${escapeHtml(getCategoryName(sub.category))}</span>` : ""}</div>${sub.exclude_keywords ? `<div class="subscription-exclusions">屏蔽：${escapeHtml(sub.exclude_keywords)}</div>` : ""}</div><div class="subscription-controls"><button class="btn btn-secondary btn-xs toggle-sub" data-enabled="${sub.enabled === 0 ? 1 : 0}">${renderIcon(sub.enabled === 0 ? 'play' : 'pause')}${sub.enabled === 0 ? "恢复" : "暂停"}</button><button class="btn btn-danger btn-xs delete-sub">${renderIcon('trash')}删除</button></div></div>`).join("") : '<div class="empty-state-small"><div class="empty-title">还没有订阅</div><p class="form-hint">添加关键词、作者或分类，开始接收有价值的动态。</p></div>';
    container.querySelectorAll(".toggle-sub").forEach(btn => btn.addEventListener("click", async () => {
      const item = btn.closest('.subscription-item');
      if (item.dataset.busy) return;
      const enabled = Number(btn.dataset.enabled);
      const other = item.querySelector('.delete-sub');
      item.dataset.busy = 'true'; other.disabled = true;
      let result;
      try { result = await window.SeekFeedControls.pending(btn, () => apiRequest(`/api/subscriptions/${item.dataset.id}`, { method: "PUT", body: JSON.stringify({ enabled }) })); }
      finally { delete item.dataset.busy; other.disabled = false; }
      if (result?.success) {
        item.classList.toggle('paused', enabled === 0);
        item.querySelector('.subscription-state').textContent = enabled === 0 ? '已暂停' : '监控中';
        btn.dataset.enabled = String(enabled === 0 ? 1 : 0);
        btn.innerHTML = `${renderIcon(enabled === 0 ? 'play' : 'pause')}${enabled === 0 ? '恢复' : '暂停'}`;
        Toast.success(enabled === 0 ? '订阅已暂停' : '订阅已恢复'); loadFilterSubscriptions(); analytics.loadNotifications();
      } else Toast.error(result?.message || "修改失败");
    }));
    container.querySelectorAll(".delete-sub").forEach(btn => btn.addEventListener("click", async () => {
      const item = btn.closest('.subscription-item');
      if (item.dataset.busy || btn.dataset.confirming) return;
      btn.dataset.confirming = 'true';
      let confirmed;
      try { confirmed = await confirmAction('删除这条订阅？', '删除后不再按此规则监控新帖，已收录的帖子会保留。', '删除订阅'); }
      finally { delete btn.dataset.confirming; }
      if (!confirmed) return;
      const other = item.querySelector('.toggle-sub');
      item.dataset.busy = 'true'; other.disabled = true;
      let result;
      try { result = await window.SeekFeedControls.pending(btn, () => apiRequest(`/api/subscriptions/${item.dataset.id}`, { method: "DELETE" })); }
      finally { delete item.dataset.busy; other.disabled = false; }
      if (result?.success) {
        item.remove();
        if (!container.querySelector('.subscription-item')) loadSubscriptions();
        Toast.success("订阅已删除"); loadFilterSubscriptions(); updateStats(); analytics.loadNotifications();
      } else Toast.error(result?.message || "删除失败");
    }));
  }
  async function loadMatchingScope() {
    const result = await apiRequest('/api/config');
    el('subscriptionMatchScope').textContent = result?.success
      ? result.data.only_title ? '当前范围：仅标题。' : '当前范围：标题、RSS 摘要、作者和分类。'
      : '匹配范围可在 Telegram 设置中查看。';
  }
  function initSubscriptions() {
    el("addSubForm").addEventListener("submit", pendingSubmit(async e => {
      e.preventDefault();
      const data = { keyword1: el("keyword1").value.trim() || undefined, keyword2: el("keyword2").value.trim() || undefined,
        keyword3: el("keyword3").value.trim() || undefined, creator: el("subCreator").value.trim() || undefined,
        category: el("subCategory").value || undefined, exclude_keywords: el("excludeKeywords").value.trim(), enabled: 1 };
      if (![data.keyword1, data.keyword2, data.keyword3, data.creator, data.category].some(Boolean)) return Toast.warning("请至少填写一个订阅条件");
      const result = await apiRequest("/api/subscriptions", { method: "POST", body: JSON.stringify(data) });
      if (!result?.success) return Toast.error(result?.message || "添加失败");
      Toast.success("订阅已添加"); el("addSubForm").reset(); loadSubscriptions(); loadFilterSubscriptions(); updateStats(); analytics.loadNotifications();
    }));
  }
  const routeMap = {
    '/': ['hot', '热榜'], '/posts': ['feed', '最新帖子'], '/matched': ['feed', '命中订阅'],
    '/hot': ['hot', '热榜'],
    '/subscriptions': ['subscriptions', '订阅管理'], '/statistics': ['stats', '统计信息'],
    '/settings/account': ['account', '账号与安全'], '/settings/rss': ['rss', 'RSS 配置'], '/settings/telegram': ['telegram', 'Telegram'],
  };
  let activePath = null;
  let routeAnimation;
  let routeTransition;
  let routeRequest = 0;
  const routeScroll = new Map();
  async function navigate(path, push = true) {
    if (path === '/settings') path = '/settings/account';
    const [name, title] = routeMap[path] || routeMap['/'];
    if (!isLoggedIn && !['feed', 'stats', 'hot'].includes(name)) { LoginModal.open(); return; }
    const id = ++routeRequest;
    routeTransition?.skipTransition();
    routeAnimation?.cancel();
    const root = document.documentElement;
    const content = el('mainContent');
    const animate = activePath && activePath !== path && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const apply = () => {
      if (id !== routeRequest) return;
      if (activePath) routeScroll.set(activePath, scrollY);
      if (push && location.pathname !== path) history.pushState({}, '', path);
      window.SeekFeedControls.closeSelect();
      document.querySelectorAll('.route-page').forEach(page => page.hidden = page.id !== `${name}Page`);
      document.querySelectorAll('.workspace-nav [data-route]').forEach(link => {
        const selected = link.pathname === path;
        link.classList.toggle('selected', selected);
        if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
      });
      el('breadcrumbCurrent').textContent = title;
      document.title = `${title} · SeekFeed`;
      if (name === 'feed') { setMatched(path === '/matched'); loadPosts(currentPage); }
      if (name === 'subscriptions') { loadSubscriptions(); loadMatchingScope(); analytics.loadNotifications(); }
      if (name === 'rss') loadRssConfig();
      if (name === 'telegram') loadTelegramConfig();
      if (name === 'stats') analytics.load();
      if (name === 'hot') window.SeekFeedHot.load();
      if (name === 'account') loadAccount();
      activePath = path;
      window.scrollTo({ top: routeScroll.get(path) || 0, behavior: 'instant' });
      if (push) document.querySelector(`#${name}Page h1`)?.focus({ preventScroll: true });
    };
    // Capture both pages before hiding either; the application shell stays in place.
    if (animate && document.startViewTransition) {
      root.classList.add('route-transition');
      routeTransition = document.startViewTransition(apply);
      try { await routeTransition.finished; }
      catch { /* Interrupted navigation still commits the latest requested route. */ }
      finally { if (id === routeRequest) root.classList.remove('route-transition'); }
    } else if (animate && content.animate) {
      root.classList.remove('route-transition');
      routeAnimation = content.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: 'forwards', easing: 'ease-out' });
      try { await routeAnimation.finished; } catch { return; }
      if (id !== routeRequest) return;
      apply();
      routeAnimation.cancel();
      routeAnimation = content.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' });
    } else {
      root.classList.remove('route-transition');
      apply();
    }
  }
  function initSettingsDropdown() {
    const closeSidebar = () => { el('workspaceSidebar').classList.remove('open'); el('sidebarBackdrop').hidden = true; el('sidebarToggle').setAttribute('aria-expanded', 'false'); };
    el('sidebarToggle').addEventListener('click', () => {
      const open = el('workspaceSidebar').classList.toggle('open');
      el('sidebarBackdrop').hidden = !open; el('sidebarToggle').setAttribute('aria-expanded', String(open));
    });
    el('sidebarBackdrop').addEventListener('click', closeSidebar);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar(); });
    document.querySelectorAll('[data-auth-only]').forEach(item => item.style.display = isLoggedIn ? 'inline-flex' : 'none');
    el('accountLabel').textContent = isLoggedIn ? '管理员' : '访客';
    document.querySelectorAll('[data-route]').forEach(link => link.addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault(); closeSidebar();
      if (link.pathname !== activePath && ['/posts', '/matched'].includes(link.pathname)) currentPage = 1;
      navigate(link.pathname);
    }));
    document.querySelectorAll('.route-page h1').forEach(h => h.tabIndex = -1);
    history.scrollRestoration = 'manual';
    addEventListener('popstate', () => navigate(location.pathname, false));
  }
  async function loadAccount() {
    const result = await apiRequest('/auth/account');
    if (result?.success) {
      el('accountUsername').value = result.data.username;
      el('accountLabel').textContent = result.data.username;
      el('sessionHours').value = String(result.data.session_expiry_hours);
      window.SeekFeedControls.refreshSelects();
    }
    const response = await apiRequest('/auth/sessions');
    if (!response?.success) return;
    el('sessionsList').innerHTML = response.data.map(session => {
      const agent = session.userAgent || '未知浏览器';
      const browser = /Edg/.test(agent) ? 'Microsoft Edge' : /Firefox/.test(agent) ? 'Firefox' : /Chrome/.test(agent) ? 'Chrome' : /Safari/.test(agent) ? 'Safari' : '浏览器 / 客户端';
      return `<div class="session-item"><span class="session-icon">${renderIcon('user')}</span><div><strong>${browser}${session.current ? '<span class="tag tag-blue">当前设备</span>' : ''}</strong><p class="session-ip">登录 IP · ${escapeHtml(session.ipAddress || "未记录（重新登录后记录）")}</p><p>登录于 ${escapeHtml(new Date(session.createdAt).toLocaleString('zh-CN'))}</p><p>到期于 ${escapeHtml(new Date(session.expiresAt).toLocaleString('zh-CN'))}</p></div></div>`;
    }).join('');
  }
  function initAccount() {
    el('accountForm').addEventListener('submit', pendingSubmit(async e => {
      e.preventDefault();
      if (el('accountNewPassword').value !== el('accountConfirmPassword').value) return Toast.error('两次输入的新密码不一致。');
      const result = await apiRequest('/auth/account', { method: 'PUT', body: JSON.stringify({ username: el('accountUsername').value.trim(), currentPassword: el('accountCurrentPassword').value, newPassword: el('accountNewPassword').value }) });
      if (!result?.success) return Toast.error(result?.message || '保存失败');
      localStorage.removeItem('sessionId'); localStorage.removeItem('user'); location.href = '/';
    }));
    el('sessionSettingsForm').addEventListener('submit', pendingSubmit(async e => {
      e.preventDefault();
      const result = await apiRequest('/auth/preferences', { method: 'PUT', body: JSON.stringify({ session_expiry_hours: Number(el('sessionHours').value) }) });
      if (result?.success) Toast.success(result.message); else Toast.error(result?.message || '保存失败');
    }));
    el('logoutAllBtn').addEventListener('click', async () => {
      if (!await confirmAction('退出所有设备？', '当前设备也会退出，所有设备都需要重新登录。', '确认退出')) return;
      const result = await window.SeekFeedControls.pending(el('logoutAllBtn'), () => apiRequest('/auth/logout-all', { method: 'POST' }));
      if (result?.success) { localStorage.removeItem('sessionId'); localStorage.removeItem('user'); location.href = '/'; }
      else Toast.error(result?.message || '退出失败');
    });
  }
  function pendingClick(handler) {
    return e => window.SeekFeedControls.pending(e.currentTarget, () => handler(e));
  }
  function pendingSubmit(handler) {
    return e => {
      e.preventDefault();
      return window.SeekFeedControls.pending(e.target.querySelector('[type="submit"]'), () => handler(e), e.target.id === 'loginForm' ? '登录中…' : e.target.id === 'addSubForm' ? '添加中…' : '保存中…');
    };
  }

  function confirmAction(title, description, label) {
    return new Promise(resolve => {
      const opener = document.activeElement;
      const dialog = document.createElement('dialog');
      dialog.className = 'confirm-dialog';
      dialog.setAttribute('aria-labelledby', 'confirmationTitle');
      dialog.setAttribute('aria-describedby', 'confirmationDescription');
      dialog.innerHTML = `<h2 id="confirmationTitle">${escapeHtml(title)}</h2><p id="confirmationDescription">${escapeHtml(description)}</p><form method="dialog" class="form-actions"><button class="btn btn-secondary" value="cancel" autofocus>取消</button><button class="btn btn-danger" value="confirm">${escapeHtml(label)}</button></form>`;
      dialog.addEventListener('close', () => { const confirmed = dialog.returnValue === 'confirm'; dialog.remove(); opener?.focus({ preventScroll: true }); resolve(confirmed); }, { once: true });
      document.body.append(dialog); dialog.showModal();
    });
  }

  // ============================================
  // 登录抽屉
  // ============================================
  const LoginModal = {
    modal: null,
    form: null,
    message: null,

    init() {
      this.modal = document.getElementById("loginModal");
      this.form = document.getElementById("loginForm");
      this.message = document.getElementById("loginMessage");

      if (!this.modal || !this.form) return;

      // 关闭按钮
      document.getElementById("closeLoginModal")?.addEventListener("click", () => {
        this.close();
      });

      // 表单提交
      this.form.addEventListener("submit", pendingSubmit(async (e) => {
        e.preventDefault();
        await this.handleSubmit();
      }));
    },

    open() {
      this.clearMessage(); this.form?.reset(); Drawer.open("login");
      document.getElementById("loginUsername")?.focus({ preventScroll: true });
    },
    close() { Drawer.closeAll(); },


    isOpen() {
      return this.modal?.classList.contains("drawer-open");
    },

    showMessage(message, type = "info") {
      if (!this.message) return;
      this.message.textContent = message;
      this.message.className = `login-message ${type}`;
      this.message.style.display = "block";
    },

    clearMessage() {
      if (!this.message) return;
      this.message.style.display = "none";
      this.message.textContent = "";
    },

    async handleSubmit() {
      const username = document.getElementById("loginUsername")?.value?.trim();
      const password = document.getElementById("loginPassword")?.value;

      if (!username || !password) {
        this.showMessage("请填写用户名和密码", "error");
        return;
      }

      this.showMessage("正在登录...", "info");

      try {
        const response = await fetch("/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username, password }),
        });

        const result = await response.json();

        if (result.success) {
          this.showMessage("登录成功！", "success");
          localStorage.setItem("sessionId", result.sessionId);
          
          // 延迟刷新页面以应用登录状态
          setTimeout(() => {
            window.location.reload();
          }, 800);
        } else {
          this.showMessage(result.message || "登录失败", "error");
        }
      } catch (error) {
        console.error("登录错误:", error);
        this.showMessage("网络错误，请重试", "error");
      }
    },
  };

  function initLoginModal() {
    LoginModal.init();

    // 登录按钮点击打开弹窗
    document.getElementById("loginBtn")?.addEventListener("click", () => {
      LoginModal.open();
    });
  }

  // ============================================
  // 退出登录
  // ============================================
  function initLogout() {
    document.getElementById("logoutBtn")?.addEventListener("click", async () => {
      try {
        await apiRequest("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ sessionId }),
        });
      } catch {
        // Local sign-out still completes if the server session has expired.
      } finally {
        localStorage.removeItem("sessionId");
        window.location.reload();
      }
    });
  }

  // ============================================
  // 初始化
  // ============================================
  function init() {
    initTheme();
    Drawer.init();
    initFilters();
    initRssConfig();
    initTelegramConfig();
    initSubscriptions();
    initSettingsDropdown();
    initLoginModal();
    initLogout();
    analytics.init();
    window.SeekFeedHot.init();

    initAccount();
    navigate(location.pathname, false);
    // 加载初始数据
    updateStats();
    loadFilterSubscriptions();
    updateMonitor();
    const liveTick = () => { if (!document.hidden) { updateMonitor(true); updateStats(true); refreshFeed(); analytics.tick(); } };
    setInterval(liveTick, 10000);
    document.addEventListener('visibilitychange', liveTick);
  }

  init();
});
