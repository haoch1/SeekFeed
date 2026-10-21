// ============================================
// 工作台交互 - 帖子列表、独立设置页面与登录
// ============================================

document.addEventListener("DOMContentLoaded", function () {
  const sessionId = localStorage.getItem("sessionId");
  const isLoggedIn = !!sessionId;
  const identity = window.SeekFeedIdentity;
  let currentAvatar = null, identityUsername = null, avatarBusy = false, identityVersion = 0;
  function renderAccountAvatars() {
    identity.render();
    const remove = document.getElementById('avatarRemoveBtn');
    if (remove) remove.disabled = !currentAvatar || avatarBusy;
  }
  function clearIdentity() {
    identityVersion++;
    identityUsername = null;
    document.documentElement.dataset.auth = 'guest';
    localStorage.removeItem('sessionId');
    localStorage.removeItem('user');
    identity.clear();
    currentAvatar = null;
    renderAccountAvatars();
  }
  function showIdentity(username, token = sessionId, avatar = currentAvatar) {
    const shown = identity.show(username, token, avatar);
    if (!shown) return;
    identityUsername = shown.username;
    currentAvatar = shown.avatar;
    renderAccountAvatars();
  }
  function initIdentity() {
    const cached = identity.get();
    identityUsername = cached.username;
    currentAvatar = cached.avatar;
    renderAccountAvatars();
    const refreshProfile = async () => {
      const version = identityVersion;
      const result = await apiRequest('/auth/account', { silent: true });
      if (result?.success && version === identityVersion) showIdentity(result.data.username, sessionId, result.data.avatar);
    };
    if (isLoggedIn) refreshProfile();
    window.addEventListener('storage', event => {
      if (event.key === 'sessionId' || event.key === null) {
        if (localStorage.getItem('sessionId') !== sessionId) {
          identity.clear();
          document.getElementById('mainContent').replaceChildren();
          location.reload();
        }
      }
      if (event.key === 'seekfeed.avatarChanged' && isLoggedIn) refreshProfile();
    });
  }

  // 根据登录状态显示/隐藏元素
  const settingsDropdown = document.getElementById("settingsDropdown");
  const subscribedOnlyChip = document.getElementById("subscribedOnlyChip");
  const filterSubscription = document.getElementById("filterSubscription");
  
  if (isLoggedIn) {
    // 已登录：显示设置菜单和订阅相关功能，隐藏登录按钮
    if (settingsDropdown) settingsDropdown.style.display = "block";
    if (subscribedOnlyChip) subscribedOnlyChip.style.display = "inline-flex";
    if (filterSubscription) filterSubscription.style.display = "block";
  } else {
    // 未登录：显示登录按钮，隐藏设置菜单和订阅相关功能
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
          clearIdentity();
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
  // 抽屉系统
  // ============================================
  let closeMobileSidebar = () => {};
  const mobileViewport = matchMedia('(max-width: 760px), (max-width: 1000px) and (pointer: coarse)');
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
      closeMobileSidebar();
      if (this.activeDrawer) this.closeAll(false);
      this.opener = document.activeElement;
      this.activeDrawer = name;
      document.querySelector(".workspace-shell").inert = true;
      drawer.style.display = "flex";
      this.overlay.style.display = "block";
      requestAnimationFrame(() => { drawer.classList.add("drawer-open"); this.overlay.classList.add("overlay-visible"); });
      window.SeekFeedControls.lockScroll('drawer');
      drawer.querySelector(".drawer-close")?.focus({ preventScroll: true });
    },
    closeAll(restore = true) {
      if (!this.activeDrawer) return;
      const drawer = this.element(this.activeDrawer);
      drawer.classList.remove("drawer-open");
      drawer.style.display = "none";
      this.overlay.style.display = "none";
      this.overlay.classList.remove("overlay-visible");
      window.SeekFeedControls.unlockScroll('drawer');
      document.querySelector(".workspace-shell").inert = false;
      this.activeDrawer = null;
      if (restore) this.opener?.focus({ preventScroll: true });
    },
  };

  // ============================================
  // 帖子列表管理
  // ============================================
  let currentPage = 1;
  let requestedPage = 1;
  let pageCount = 1;
  let paginationTotal = 0;
  let currentFilters = {};
  let postsController;
  let postsRequest = 0;
  let renderedFilters = '';
  let latestSeenPostId = null;
  let liveRefreshing = false;
  let searchTimer, creatorTimer;
  const feedStates = new Map();
  const matchedPostActions = new Set();
  const isFeedPath = path => path === '/posts' || path === '/matched';
  const el = id => document.getElementById(id);

  function saveFeedState(path) {
    const pendingSearch = searchTimer || creatorTimer;
    clearTimeout(searchTimer); clearTimeout(creatorTimer);
    searchTimer = creatorTimer = null;
    feedStates.set(path, {
      filters: { ...currentFilters }, page: pendingSearch ? 1 : requestedPage,
      search: el('searchInput').value, creator: el('filterCreator').value,
      expanded: el('filterPanel').style.display !== 'none',
    });
    postsController?.abort();
    ++postsRequest;
    el('postsList').setAttribute('aria-busy', 'false');
  }

  function restoreFeedState(path) {
    const state = feedStates.get(path);
    currentFilters = { ...(state?.filters || {}) };
    currentPage = requestedPage = state?.page || 1;
    el('searchInput').value = state?.search || '';
    el('filterCreator').value = state?.creator || '';
    el('filterSearchMode').value = currentFilters.searchMode || 'contains';
    for (const [id, key] of [['filterCategory', 'category'], ['filterSubscription', 'subId'], ['filterStatus', 'pushStatus']]) el(id).value = currentFilters[key] || '';
    el('clearSearchBtn').style.display = el('searchInput').value ? 'block' : 'none';
    el('filterPanel').style.display = state?.expanded ? 'block' : 'none';
    el('filterToggleBtn').setAttribute('aria-expanded', String(Boolean(state?.expanded)));
    setMatched(path === '/matched' || Boolean(currentFilters.pushStatusIn));
    el('postsList').replaceChildren();
    el('postsList').style.minHeight = '';
    renderedFilters = '';
    latestSeenPostId = null;
    el('newPostsBtn').hidden = true;
    window.SeekFeedControls.refreshSelects();
  }

  async function loadPosts(page = currentPage, filters = currentFilters, quiet = false) {
    const list = el("postsList");
    if (quiet && (list.getAttribute('aria-busy') === 'true' || list.contains(document.activeElement) || document.activeElement?.closest('[data-feed-pagination]'))) return;
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
    requestedPage = page;
    currentFilters = { ...filters };
    if (!quiet) {
      el("postsList").setAttribute("aria-busy", "true");
      document.querySelectorAll('[data-feed-pagination]').forEach(pager => pager.setAttribute('aria-busy', 'true'));
    }
    const params = new URLSearchParams({ page: String(page), limit: "10",
      ...Object.fromEntries(Object.entries(currentFilters).filter(([, value]) => value !== "" && value !== undefined)) });
    const result = await apiRequest(`/api/posts?${params}`, { signal: postsController.signal, silent: quiet });
    if (request !== postsRequest) return;
    el("postsList").setAttribute("aria-busy", "false");
    document.querySelectorAll('[data-feed-pagination]').forEach(pager => pager.removeAttribute('aria-busy'));
    if (!result?.success) {
      requestedPage = currentPage;
      if (list.querySelector('.post-card')) {
        if (!quiet) el('feedError').hidden = false;
        return;
      }
      el("postsList").replaceChildren();
      el("emptyState").style.display = "block";
      el("emptyState").querySelector(".empty-title").textContent = "加载失败";
      el("emptyState").querySelector(".empty-desc").textContent = "请检查网络连接，然后点击刷新重试。";
      el("pagination").style.display = "none";
      el("paginationTop").style.display = "none";
      return;
    }
    const { posts, total, totalPages } = result.data;
    const selected = totalPages ? result.data.page : 1;
    currentPage = selected;
    requestedPage = selected;
    pageCount = Math.max(1, totalPages);
    renderedFilters = JSON.stringify(currentFilters);
    if (totalPages <= 1 || selected === totalPages) list.style.minHeight = '';
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
          if (old && next && old.outerHTML !== next.outerHTML) old.replaceWith(next);
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
    el("emptyState").querySelector(".empty-title").textContent = activePath === '/matched' ? "暂无命中帖子" : "暂无文章";
    el("emptyState").querySelector(".empty-desc").textContent = Object.values(currentFilters).some(Boolean) ? "没有符合条件的帖子，试试清除筛选。" : "同步 RSS 后，最新帖子会显示在这里。";
    updatePagination(selected, totalPages, total);
    if (!isLoggedIn && !Object.values(currentFilters).some(Boolean)) el("overviewTotal").textContent = total.toLocaleString();
    return true;
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
    const tags = (isLoggedIn ? [post.sub_keyword1, post.sub_keyword2, post.sub_keyword3] : []).filter(Boolean)
      .map(word => `<span class="tag tag-blue">${escapeHtml(word)}</span>`).join("");
    const status = { 0: "待匹配", 1: "待推送", 2: "未命中", 3: "已推送" }[post.push_status] || "未知";
    const date = new Date(post.pub_date);
    const time = Number.isNaN(date.getTime()) ? "时间未知" : new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
    const canDeleteMatch = isLoggedIn && activePath === '/matched' && [1, 3].includes(Number(post.push_status));
    item.innerHTML = `<div class="post-content"><div class="post-header"><h3 class="post-title"><a href="${href}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(post.title)}">${escapeHtml(post.title)}</a></h3></div><p class="post-memo">${escapeHtml(post.memo || "")}</p><div class="post-meta"><span class="post-category">${escapeHtml(getCategoryName(post.category))}</span><span>${escapeHtml(post.creator)}</span><span class="post-date">${time}</span>${tags ? `<span class="post-sub-tags">${tags}</span>` : ""}</div></div><div class="post-actions">${isLoggedIn ? `<span class="delivery-status" data-status="${Number(post.push_status)}">${status}</span>` : ''}<div class="post-action-buttons"><a class="icon-btn" href="${href}" target="_blank" rel="noopener noreferrer" aria-label="打开帖子">${renderIcon("external")}</a>${canDeleteMatch ? `<button type="button" class="icon-btn delete-matched" aria-label="从命中订阅删除" title="删除命中帖子">${renderIcon('trash')}</button>` : ''}</div></div>`;
    item.querySelector('.delete-matched')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      if (matchedPostActions.has(post.post_id)) return;
      matchedPostActions.add(post.post_id);
      try {
        if (!await confirmAction('删除这条命中帖子？', '删除后不再显示，也不会继续推送。最新帖子和已发送的 Telegram 消息会保留。', '删除帖子')) return;
        const result = await window.SeekFeedControls.pending(button, () => apiRequest(`/api/matched-posts/${Number(post.post_id)}`, { method: 'DELETE' }));
        if (!result?.success) { Toast.error(result?.message || '删除失败，请重试'); return; }
        Toast.success('已从命中订阅删除');
        item.remove();
        if (activePath === '/matched') await loadPosts(currentPage);
        await updateStats();
      } finally { matchedPostActions.delete(post.post_id); }
    });
    return item;
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }
  const categoryMap = { daily: "日常", tech: "技术", info: "情报", review: "测评", trade: "交易", carpool: "拼车", promotion: "推广", life: "生活", dev: "Dev", "photo-share": "贴图", expose: "曝光", inside: "内版", sandbox: "沙盒" };
  function getCategoryName(key) { return key ? key.split(",").map(k => categoryMap[k.trim()] || k.trim()).join("、") : "未分类"; }

  function updatePagination(page, pages, total) {
    paginationTotal = total;
    el("pagination").style.display = total ? "flex" : "none";
    el("paginationTop").style.display = pages > 1 ? "flex" : "none";
    const position = el('paginationTop').querySelector('[data-page-position]');
    position.textContent = `${page} / ${Math.max(pages, 1)}`;
    position.setAttribute('aria-label', `第 ${page} 页，共 ${Math.max(pages, 1)} 页`);
    el("paginationInfo").textContent = `共 ${total} 篇 · 第 ${page} / ${Math.max(pages, 1)} 页`;
    document.querySelectorAll('[data-page-step]').forEach(button => { button.disabled = Number(button.dataset.pageStep) < 0 ? page <= 1 : page >= pages; });
    const key = JSON.stringify([page, pages, mobileViewport.matches]);
    if (el('pageNumbers').dataset.signature === key) return;
    el('pageNumbers').dataset.signature = key;
    const focused = el('pageNumbers').contains(document.activeElement);
    const existing = new Map([...el('pageNumbers').children].map(button => [button.dataset.pageKey, button]));
    const next = [];
    let numbers;
    if (mobileViewport.matches) {
      const start = Math.max(1, Math.min(page - 1, pages - 2));
      numbers = Array.from({ length: Math.min(3, pages) }, (_, i) => start + i);
    } else if (pages <= 7) numbers = Array.from({ length: pages }, (_, i) => i + 1);
    else if (page <= 4) numbers = [1, 2, 3, 4, 5, 'ellipsis-start', pages];
    else if (page >= pages - 3) numbers = [1, 'ellipsis-end', pages - 4, pages - 3, pages - 2, pages - 1, pages];
    else numbers = [1, 'ellipsis-start', page - 1, page, page + 1, 'ellipsis-end', pages];
    for (const i of numbers) {
      if (typeof i !== 'number') {
        const gap = existing.get(i) || document.createElement('span');
        gap.dataset.pageKey = i;
        gap.className = 'page-ellipsis';
        gap.textContent = '…';
        gap.setAttribute('aria-hidden', 'true');
        next.push(gap);
        continue;
      }
      const button = existing.get(String(i)) || document.createElement("button");
      button.type = 'button';
      button.dataset.pageKey = String(i);
      button.dataset.page = String(i);
      button.className = `page-number ${i === page ? "active" : ""}`;
      button.textContent = i;
      button.setAttribute("aria-label", `第 ${i} 页`);
      if (i === page) button.setAttribute("aria-current", "page");
      else button.removeAttribute('aria-current');
      next.push(button);
    }
    next.forEach((item, index) => { if (el('pageNumbers').children[index] !== item) el('pageNumbers').insertBefore(item, el('pageNumbers').children[index] || null); });
    [...el('pageNumbers').children].filter(item => !next.includes(item)).forEach(item => item.remove());
    if (focused) el('pageNumbers').querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
  }
  async function changePage(page, source) {
    const target = Math.max(1, Math.min(pageCount, page));
    if (target === requestedPage) return;
    const changed = await loadPosts(target);
    if (!changed || el('feedPage').hidden) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) el('postsList').animate([{ opacity: .82, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)' });
    const toolbar = document.querySelector('.feed-toolbar');
    const top = toolbar.getBoundingClientRect().top;
    const inset = document.querySelector('.workspace-topbar').getBoundingClientRect().height + 12;
    if (top < inset || top > innerHeight - 100) window.scrollTo({ top: Math.max(0, scrollY + top - inset), behavior: reduced ? 'instant' : 'smooth' });
    if (source?.closest('[data-feed-pagination="bottom"]')) {
      const step = source.dataset.pageStep;
      const focus = step ? el('paginationTop').querySelector(`[data-page-step="${step}"]:not(:disabled)`) : null;
      (focus || el('paginationTop').querySelector('[data-page-position]')).focus({ preventScroll: true });
    }
  }
  function setMatched(active) {
    if (active) {
      if (!['1', '3'].includes(String(currentFilters.pushStatus))) delete currentFilters.pushStatus;
      currentFilters.pushStatusIn = currentFilters.pushStatus || "1,3";
      el("filterStatus").value = currentFilters.pushStatus || "";
    }
    else delete currentFilters.pushStatusIn;
    [...el('filterStatus').options].forEach(option => { option.disabled = active && Boolean(option.value) && !['1', '3'].includes(option.value); });
    el("subscribedOnlyChip").classList.toggle("active", active);
    el("subscribedOnlyChip").setAttribute("aria-pressed", String(active));
    el("navMatched").classList.toggle("selected", active);
    el("navLatest").classList.toggle("selected", !active);
    ["navLatest", "navMatched"].forEach(id => el(id).removeAttribute("aria-current"));
    el(active ? "navMatched" : "navLatest").setAttribute("aria-current", "page");
    el("breadcrumbCurrent").textContent = active ? "命中订阅" : "最新帖子";
    el("pageTitle").innerHTML = renderIcon(active ? "bell" : "posts") + `<span>${active ? "命中订阅" : "最新帖子"}</span>`;
  }
  function initFilters() {
    el('newPostsBtn').addEventListener('click', async () => { await loadPosts(1); el('feedPage').scrollIntoView({ block: 'start', behavior: 'instant' }); });
    el("searchInput").addEventListener("input", e => {
      clearTimeout(searchTimer);
      el("clearSearchBtn").style.display = e.target.value ? "block" : "none";
      currentFilters.search = e.target.value.trim();
      searchTimer = setTimeout(() => { searchTimer = null; loadPosts(1); }, 300);
    });
    el("clearSearchBtn").addEventListener("click", () => {
      clearTimeout(searchTimer); searchTimer = null; el("searchInput").value = ""; el("clearSearchBtn").style.display = "none";
      delete currentFilters.search; loadPosts(1);
    });
    el("filterToggleBtn").addEventListener("click", () => {
      const open = el("filterPanel").style.display === "none";
      el("filterPanel").style.display = open ? "block" : "none";
      el("filterToggleBtn").setAttribute("aria-expanded", String(open));
    });
    [["filterCategory", "category"], ["filterSubscription", "subId"], ["filterStatus", "pushStatus"], ["filterSearchMode", "searchMode"]].forEach(([id, key]) => {
      el(id).addEventListener("change", e => {
        currentFilters[key] = e.target.value;
        if (key === "pushStatus") setMatched(activePath === '/matched');
        window.SeekFeedControls.refreshSelects();
        loadPosts(1);
      });
    });
    el("filterCreator").addEventListener("input", e => {
      clearTimeout(creatorTimer);
      currentFilters.creator = e.target.value.trim();
      creatorTimer = setTimeout(() => { creatorTimer = null; loadPosts(1); }, 300);
    });
    el("clearFiltersBtn").addEventListener("click", () => {
      clearTimeout(searchTimer); clearTimeout(creatorTimer);
      searchTimer = creatorTimer = null;
      ["searchInput", "filterCreator", "filterCategory", "filterSubscription", "filterStatus"].forEach(id => el(id).value = "");
      el('filterSearchMode').value = 'contains';
      window.SeekFeedControls.refreshSelects();
      el("clearSearchBtn").style.display = "none"; currentFilters = {}; setMatched(activePath === '/matched'); loadPosts(1);
    });
    el("subscribedOnlyChip").addEventListener("click", () => navigate(activePath === '/matched' ? '/posts' : '/matched'));
    el("refreshBtn").addEventListener("click", pendingClick(() => Promise.all([loadPosts(), updateStats(), updateMonitor()])));
    document.querySelectorAll('[data-feed-pagination]').forEach(pager => pager.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.dataset.page) changePage(Number(button.dataset.page), button);
      else if (button.dataset.pageStep) changePage(requestedPage + Number(button.dataset.pageStep), button);
    }));
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
      overviewMatched: data.visible_matched_posts, overviewPushed: data.pushed_posts };
    Object.entries(fields).forEach(([id, value]) => el(id).textContent = Number(value || 0).toLocaleString());
  }
  async function updateMonitor(quiet = false) {
    if (!isLoggedIn) return;
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
      document.getElementById("rssInterval").value = result.data.rss_interval_seconds || window.SeekFeedCadence.rssIntervalSeconds;
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
  let editingSubscription = null;
  const subscriptionRecords = new Map();
  function cancelSubscriptionEdit() {
    editingSubscription = null;
    el('addSubForm').reset();
    el('subFormTitle').textContent = '新建订阅';
    const saveButton = el('saveSubscriptionBtn');
    (saveButton.querySelector('.button-content') || saveButton).textContent = '添加订阅';
    el('cancelSubscriptionEdit').hidden = true;
    el('subscriptionsList').querySelectorAll('.is-editing').forEach(item => item.classList.remove('is-editing'));
    window.SeekFeedControls.refreshSelects();
  }
  function editSubscription(id) {
    const sub = subscriptionRecords.get(id);
    if (!sub || el('saveSubscriptionBtn').disabled) return;
    editingSubscription = id;
    for (const field of ['keyword1', 'keyword2', 'keyword3', 'excludeKeywords', 'subCreator', 'subCategory']) {
      const key = { excludeKeywords: 'exclude_keywords', subCreator: 'creator', subCategory: 'category' }[field] || field;
      const input = el(field), value = sub[key] || '';
      if (field === 'subCategory' && value && ![...input.options].some(option => option.value === value)) input.add(new Option(getCategoryName(value), value));
      input.value = value;
    }
    el('subFormTitle').textContent = `编辑订阅 #${id}`;
    el('saveSubscriptionBtn').textContent = '保存修改';
    el('cancelSubscriptionEdit').hidden = false;
    el('subscriptionsList').querySelectorAll('.subscription-item').forEach(item => item.classList.toggle('is-editing', Number(item.dataset.id) === id));
    window.SeekFeedControls.refreshSelects();
    const form = el('addSubForm');
    if (form.getBoundingClientRect().top < 80 || form.getBoundingClientRect().top > innerHeight - 160) form.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    el('keyword1').focus({preventScroll:true});
  }
  function filterSubscriptions() {
    const query = el('subscriptionSearch').value.trim().toLocaleLowerCase();
    const items = [...el('subscriptionsList').querySelectorAll('.subscription-item')];
    let visible = 0;
    for (const item of items) {
      item.hidden = !item.querySelector('.subscription-description').textContent.toLocaleLowerCase().includes(query);
      if (!item.hidden) visible++;
    }
    el('subscriptionSearchEmpty').hidden = !items.length || visible > 0;
  }
  async function loadSubscriptions() {
    const result = await apiRequest("/api/subscriptions");
    const container = el("subscriptionsList");
    if (!result?.success) { container.textContent = "订阅加载失败，请刷新页面重试。"; return; }
    subscriptionRecords.clear(); result.data.forEach(sub => subscriptionRecords.set(sub.id, sub));
    container.innerHTML = result.data.length ? result.data.map(sub => `<div class="subscription-item ${sub.enabled === 0 ? "paused" : ""}" data-id="${sub.id}"><div class="subscription-description"><div class="subscription-id">订阅 <span>#${sub.id}</span></div><div class="subscription-keywords">${[sub.keyword1, sub.keyword2, sub.keyword3].filter(Boolean).map(word => `<span class="tag tag-blue">${escapeHtml(word)}</span>`).join("") || '<span class="tag">按作者 / 分类订阅</span>'}</div><div class="subscription-filters"><span class="subscription-state">${sub.enabled === 0 ? "已暂停" : "监控中"}</span>${sub.creator ? `<span>作者 ${escapeHtml(sub.creator)}</span>` : ""}${sub.category ? `<span>${escapeHtml(getCategoryName(sub.category))}</span>` : ""}</div>${sub.exclude_keywords ? `<div class="subscription-exclusions">屏蔽：${escapeHtml(sub.exclude_keywords)}</div>` : ""}</div><div class="subscription-controls"><button type="button" class="btn btn-secondary btn-xs edit-sub">${renderIcon('edit')}编辑</button><button class="btn btn-secondary btn-xs toggle-sub" data-enabled="${sub.enabled === 0 ? 1 : 0}">${renderIcon(sub.enabled === 0 ? 'play' : 'pause')}${sub.enabled === 0 ? "恢复" : "暂停"}</button><button class="btn btn-danger btn-xs delete-sub">${renderIcon('trash')}删除</button></div></div>`).join("") : '<div class="empty-state-small"><div class="empty-title">还没有订阅</div><p class="form-hint">添加关键词、作者或分类，开始接收有价值的动态。</p></div>';
    filterSubscriptions();
    container.querySelectorAll('.edit-sub').forEach(button => button.addEventListener('click', () => editSubscription(Number(button.closest('.subscription-item').dataset.id))));
    container.querySelectorAll('.subscription-item').forEach(item => item.classList.toggle('is-editing', Number(item.dataset.id) === editingSubscription));
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
        if (Number(item.dataset.id) === editingSubscription) cancelSubscriptionEdit();
        item.remove();
        filterSubscriptions();
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
    el('cancelSubscriptionEdit').addEventListener('click', cancelSubscriptionEdit);
    el('subscriptionSearch').addEventListener('input', () => { filterSubscriptions(); el('subscriptionsList').scrollTop = 0; });
    el("addSubForm").addEventListener("submit", pendingSubmit(async e => {
      e.preventDefault();
      const data = { keyword1: el("keyword1").value.trim(), keyword2: el("keyword2").value.trim(),
        keyword3: el("keyword3").value.trim(), creator: el("subCreator").value.trim(),
        category: el("subCategory").value, exclude_keywords: el("excludeKeywords").value.trim() };
      const editId = editingSubscription;
      if (![data.keyword1, data.keyword2, data.keyword3, data.creator, data.category].some(Boolean)) return Toast.warning("请至少填写一个订阅条件");
      el('cancelSubscriptionEdit').disabled = true;
      let result;
      try { result = await apiRequest(editId ? `/api/subscriptions/${editId}` : "/api/subscriptions", { method: editId ? "PUT" : "POST", body: JSON.stringify(data) }); }
      finally { el('cancelSubscriptionEdit').disabled = false; }
      if (!result?.success) return Toast.error(result?.message || (editId ? "修改失败" : "添加失败"));
      Toast.success(editId ? '订阅已更新' : '订阅已添加'); cancelSubscriptionEdit(); loadSubscriptions(); loadFilterSubscriptions(); updateStats(); analytics.loadNotifications();
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
  let routeRequest = 0;
  const routeScroll = new Map();
  async function navigate(path, push = true) {
    window.SeekFeedControls.dismissCharts();
    if (path === '/settings') path = '/settings/account';
    const [name, title] = routeMap[path] || routeMap['/'];
    if (!isLoggedIn && !['/', '/posts', '/statistics', '/hot'].includes(path)) {
      if (!activePath) {
        history.replaceState({}, '', '/hot');
        navigate('/hot', false);
      }
      LoginModal.open(); return;
    }
    const id = ++routeRequest;
    const root = document.documentElement;
    const content = el('mainContent');
    const opacity = getComputedStyle(content).opacity;
    window.SeekFeedTheme.cancelTransition();
    routeAnimation?.cancel();
    const animate = activePath && activePath !== path && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const apply = () => {
      if (id !== routeRequest) return;
      if (activePath) routeScroll.set(activePath, scrollY);
      if (isFeedPath(activePath) && activePath !== path) saveFeedState(activePath);
      if (push && location.pathname !== path) history.pushState({}, '', path);
      window.SeekFeedControls.closeSelect();
      document.querySelectorAll('.route-page').forEach(page => page.hidden = page.id !== `${name}Page`);
      document.querySelectorAll('.workspace-nav [data-route]').forEach(link => {
        const selected = link.pathname === path;
        link.classList.toggle('selected', selected);
        if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
      });
      el('breadcrumbSection').textContent = path.startsWith('/settings') ? '设置' : '社区动态';
      el('breadcrumbCurrent').textContent = title;
      document.title = `${title} · SeekFeed`;
      if (name === 'feed') {
        if (activePath !== path) restoreFeedState(path);
        loadPosts(currentPage);
      }
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
    // Finish fading the current DOM before switching content. No overlapping snapshots
    // or text translation: matching headings stay sharp even during rapid navigation.
    root.classList.remove('route-transition');
    if (animate && content.animate) {
      routeAnimation = content.animate([{ opacity }, { opacity: 0 }], { duration: 100, fill: 'forwards', easing: 'ease-out' });
      routeAnimation.id = 'route-leave';
      try { await routeAnimation.finished; } catch { return; }
      if (id !== routeRequest) return;
      apply();
      routeAnimation.cancel();
      routeAnimation = content.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'cubic-bezier(.2,.7,.2,1)' });
      routeAnimation.id = 'route-enter';
    } else {
      apply();
    }
  }
  function initSettingsDropdown() {
    const sidebar = el('workspaceSidebar'), main = document.querySelector('.workspace-main');
    const closeSidebar = (restoreFocus = true) => {
      const wasOpen = sidebar.classList.contains('open');
      sidebar.classList.remove('open');
      el('sidebarBackdrop').hidden = true;
      el('sidebarToggle').setAttribute('aria-expanded', 'false');
      sidebar.removeAttribute('role'); sidebar.removeAttribute('aria-modal');
      sidebar.inert = mobileViewport.matches;
      main.inert = false;
      window.SeekFeedControls.unlockScroll('navigation');
      if (wasOpen && restoreFocus && mobileViewport.matches) el('sidebarToggle').focus({ preventScroll: true });
    };
    closeMobileSidebar = closeSidebar;
    closeSidebar(false);
    el('sidebarToggle').addEventListener('click', () => {
      if (sidebar.classList.contains('open')) return closeSidebar();
      window.SeekFeedControls.closeSelect();
      window.SeekFeedControls.dismissCharts();
      window.SeekFeedControls.lockScroll('navigation');
      sidebar.inert = false;
      sidebar.classList.add('open');
      sidebar.setAttribute('role', 'dialog'); sidebar.setAttribute('aria-modal', 'true');
      el('sidebarBackdrop').hidden = false;
      el('sidebarToggle').setAttribute('aria-expanded', 'true');
      main.inert = true;
      el('sidebarClose').focus({ preventScroll: true });
    });
    el('sidebarBackdrop').addEventListener('click', () => closeSidebar());
    el('sidebarClose').addEventListener('click', () => closeSidebar());
    document.addEventListener('keydown', e => {
      if (!sidebar.classList.contains('open')) return;
      if (e.key === 'Escape') { e.preventDefault(); closeSidebar(); }
      if (e.key !== 'Tab') return;
      const items = [...sidebar.querySelectorAll('a[href], button')].filter(item => !item.disabled && item.getClientRects().length);
      if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0]?.focus(); }
    });
    mobileViewport.addEventListener('change', () => {
      closeSidebar(false);
      updatePagination(currentPage, pageCount, paginationTotal);
    });
    document.querySelectorAll('[data-auth-only]').forEach(item => item.style.display = isLoggedIn ? '' : 'none');
    document.querySelector('.metric-strip').classList.toggle('is-public', !isLoggedIn);
    document.querySelectorAll('[data-route]').forEach(link => link.addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault(); closeSidebar();
      navigate(link.pathname);
    }));
    document.querySelectorAll('.route-page h1').forEach(h => h.tabIndex = -1);
    history.scrollRestoration = 'manual';
    addEventListener('popstate', () => navigate(location.pathname, false));
  }
  async function loadAccount() {
    const version = identityVersion;
    const result = await apiRequest('/auth/account');
    if (result?.success) {
      el('accountUsername').value = result.data.username;
      if (version === identityVersion) showIdentity(result.data.username, sessionId, result.data.avatar);
      el('sessionHours').value = String(result.data.session_expiry_hours);
      window.SeekFeedControls.refreshSelects();
    }
    const response = await apiRequest('/auth/sessions');
    if (!response?.success) return;
    el('sessionsList').innerHTML = response.data.map(session => {
      const agent = session.userAgent || '未知浏览器';
      const browser = /Edg/.test(agent) ? 'Microsoft Edge' : /Firefox/.test(agent) ? 'Firefox' : /Chrome/.test(agent) ? 'Chrome' : /Safari/.test(agent) ? 'Safari' : '浏览器 / 客户端';
      return `<div class="session-item"><span class="session-icon">${renderIcon('user')}</span><div class="session-details"><strong>${browser}${session.current ? '<span class="tag tag-blue">当前设备</span>' : ''}</strong><p class="session-ip">登录 IP · ${escapeHtml(session.ipAddress || "未记录（重新登录后记录）")}</p><p>登录于 ${escapeHtml(new Date(session.createdAt).toLocaleString('zh-CN'))}</p><p>到期于 ${escapeHtml(new Date(session.expiresAt).toLocaleString('zh-CN'))}</p></div><button type="button" class="btn btn-secondary btn-xs revoke-session" data-session-id="${escapeHtml(session.id || '')}" aria-label="退出${escapeHtml(session.current ? '当前设备' : browser + '，' + (session.ipAddress || '未记录 IP'))}">退出</button></div>`;
    }).join('');
  }
  function initAccount() {
    const upload = el('avatarUploadBtn'), remove = el('avatarRemoveBtn'), fileInput = el('avatarFile');
    upload.addEventListener('click', () => fileInput.click());
    const saveAvatar = async (button, action) => {
      if (avatarBusy) return;
      avatarBusy = true;
      const version = ++identityVersion;
      (button === upload ? remove : upload).disabled = true;
      try {
        await window.SeekFeedControls.pending(button, async () => {
          const result = await action();
          if (!result?.success) return Toast.error(result?.message || '头像保存失败，请重试。');
          if (version !== identityVersion) return;
          showIdentity(identityUsername, sessionId, result.data.avatar);
          try { localStorage.setItem('seekfeed.avatarChanged', String(Date.now())); } catch { /* Cross-tab refresh is optional. */ }
          Toast.success(result.message);
        }, '保存中…');
      } catch (error) {
        Toast.error(error.message || '图片读取失败，请重新选择。');
      } finally {
        avatarBusy = false; upload.disabled = false; remove.disabled = !currentAvatar;
      }
    };
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0]; fileInput.value = '';
      if (!file) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return Toast.error('请选择 JPG、PNG 或 WebP 图片。');
      if (file.size > 5 * 1024 * 1024) return Toast.error('图片不能超过 5 MB。');
      await saveAvatar(upload, async () => {
        const source = new Image(), url = URL.createObjectURL(file);
        try {
          source.src = url;
          await source.decode();
          if (!source.naturalWidth || !source.naturalHeight || source.naturalWidth * source.naturalHeight > 32000000) throw new Error('图片尺寸过大或无法读取，请换一张图片。');
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
          const side = Math.min(source.naturalWidth, source.naturalHeight);
          canvas.getContext('2d').drawImage(source, (source.naturalWidth - side) / 2, (source.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
          const avatar = canvas.toDataURL('image/png');
          return await apiRequest('/auth/avatar', { method: 'PUT', body: JSON.stringify({ avatar }) });
        } finally { URL.revokeObjectURL(url); }
      });
    });
    remove.addEventListener('click', () => saveAvatar(remove, () => apiRequest('/auth/avatar', { method: 'DELETE' })));
    el('sessionsList').addEventListener('click', event => {
      const button = event.target.closest('.revoke-session');
      if (!button) return;
      window.SeekFeedControls.pending(button, async () => {
        const result = await apiRequest('/auth/sessions/' + encodeURIComponent(button.dataset.sessionId), { method: 'DELETE' });
        if (!result?.success) return Toast.error(result?.message || '退出失败，请重试。');
        if (result.data.current) {
          clearIdentity(); location.href = '/';
        } else {
          const row = button.closest('.session-item');
          const next = row.nextElementSibling?.querySelector('.revoke-session') || row.previousElementSibling?.querySelector('.revoke-session') || el('logoutAllBtn');
          row.remove(); next.focus({ preventScroll: true }); Toast.success(result.message);
        }
      });
    });
    el('accountForm').addEventListener('submit', pendingSubmit(async e => {
      e.preventDefault();
      if (el('accountNewPassword').value !== el('accountConfirmPassword').value) return Toast.error('两次输入的新密码不一致。');
      const result = await apiRequest('/auth/account', { method: 'PUT', body: JSON.stringify({ username: el('accountUsername').value.trim(), currentPassword: el('accountCurrentPassword').value, newPassword: el('accountNewPassword').value }) });
      if (!result?.success) return Toast.error(result?.message || '保存失败');
      clearIdentity(); location.href = '/';
    }));
    el('sessionSettingsForm').addEventListener('submit', pendingSubmit(async e => {
      e.preventDefault();
      const result = await apiRequest('/auth/preferences', { method: 'PUT', body: JSON.stringify({ session_expiry_hours: Number(el('sessionHours').value) }) });
      if (result?.success) Toast.success(result.message); else Toast.error(result?.message || '保存失败');
    }));
    el('logoutAllBtn').addEventListener('click', async () => {
      if (!await confirmAction('退出所有设备？', '当前设备也会退出，所有设备都需要重新登录。', '确认退出')) return;
      const result = await window.SeekFeedControls.pending(el('logoutAllBtn'), () => apiRequest('/auth/logout-all', { method: 'POST' }));
      if (result?.success) { clearIdentity(); location.href = '/'; }
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
          showIdentity(result.user?.username, result.sessionId, result.user?.avatar);
          
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

    document.getElementById('accountAvatarButton')?.addEventListener('click', () => {
      if (!isLoggedIn) return LoginModal.open();
      closeMobileSidebar(false);
      navigate('/settings/account');
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
        clearIdentity();
        window.location.reload();
      }
    });
  }

  // ============================================
  // 初始化
  // ============================================
  function init() {
    initIdentity();
    window.SeekFeedTheme.init({ canAnimate: () => routeAnimation?.playState !== 'running' });
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
    setInterval(liveTick, window.SeekFeedCadence.feedRefreshMs);
    document.addEventListener('visibilitychange', liveTick);
  }

  init();
});
