/* Public ranking view. Shared controls supply icons, selects and stable pending states. */
window.SeekFeedHot = (() => {
  let period = 'live', request = 0, lastLoaded = 0, signature = '', queued = null, queuedSignature = '', controller;
  const el = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = name => window.SeekFeedControls.icon(name);
  const number = value => new Intl.NumberFormat('zh-CN').format(value);
  function render(data) {
    const list = el('hotList');
    list.innerHTML = data.posts.map((post, index) => `<li class="hot-row"><span class="hot-rank ${index < 3 ? 'top-rank' : ''}" aria-label="第 ${index + 1} 名">${String(index + 1).padStart(2, '0')}</span><div class="hot-post"><a href="https://www.nodeseek.com/post-${post.postId}-1" target="_blank" rel="noopener noreferrer">${escape(post.title)}</a><div class="hot-post-meta"><span class="hot-category">${escape(post.categoryLabel)}</span><span>${escape(post.author)}</span></div></div><span class="hot-number hot-views" aria-label="${post.views} 次浏览" title="采集于 ${escape(new Date(post.observedAt).toLocaleString('zh-CN'))}">${icon('eye')}${number(post.views)}</span><span class="hot-number hot-replies" aria-label="${post.replies} 条回复">${icon('message')}${number(post.replies)}</span><span class="hot-number hot-heat" aria-label="热度 ${post.heat.toFixed(1)}">${post.heat.toFixed(1)}</span></li>`).join('');
    list.hidden = !data.posts.length;
    el('hotEmpty').hidden = Boolean(data.posts.length);
    if (!data.posts.length) {
      el('hotEmpty').querySelector('.empty-title').textContent = data.updatedAt ? '暂无符合条件的帖子' : '榜单准备中';
      el('hotEmpty').querySelector('.empty-desc').textContent = data.updatedAt ? '试试其他分类或时间范围。' : data.enabled ? '首次采集完成后会自动显示。' : '服务器尚未启用热榜采集。';
    }
    el('hotCount').textContent = data.posts.length ? `展示 ${data.posts.length} / ${data.total} 条` : '最多展示 50 条';
    queued = null;
    el('hotNewData').hidden = true;
    el('hotFreshness').parentElement.classList.remove('has-update');
  }
  function status(data) {
    el('hotFreshness').textContent = data.updatedAt ? `更新于 ${new Date(data.updatedAt).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'})} · 每 5 分钟采集` : '等待首次采集';
    el('hotCoverage').textContent = data.updatedAt ? `本轮采集 ${data.coverage} 篇 · ${data.pages} 页` : '';
    el('hotError').hidden = !data.error && (!data.stale || !data.updatedAt);
    el('hotError').textContent = data.error || '采集延迟，当前显示上次保存的榜单。';
    const select = el('hotCategory');
    const values = JSON.stringify(data.categories);
    if (select.dataset.categories !== values) {
      const selected = select.value;
      select.innerHTML = '<option value="">全部分类</option>' + data.categories.map(c => `<option value="${escape(c.value)}">${escape(c.label)}</option>`).join('');
      if (selected && !data.categories.some(c => c.value === selected)) select.add(new Option(selected, selected));
      select.value = selected;
      select.dataset.categories = values;
      window.SeekFeedControls.refreshSelects();
    }
  }
  async function load({background = false} = {}) {
    if (!el('hotPage') || el('hotPage').hidden || document.hidden) return;
    controller?.abort();
    controller = new AbortController();
    const activeController = controller;
    const timeout = setTimeout(() => activeController.abort('timeout'), 15000);
    const id = ++request;
    const query = new URLSearchParams({period, category:el('hotCategory').value, sort:el('hotSort').value});
    el('hotResults').setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('/api/hot?' + query, {signal:controller.signal, cache:'no-store'});
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error('unavailable');
      if (id !== request) return;
      const data = result.data;
      status(data);
      // Decay is server-side; only new observations or changed filters replace rows.
      const next = JSON.stringify([data.updatedAt, query.toString(), data.posts.map(p => [p.postId, p.views, p.replies])]);
      if (next !== signature) {
        if (background && scrollY > 160 && signature) { queued = data; queuedSignature = next; el('hotNewData').hidden = false; el('hotFreshness').parentElement.classList.add('has-update'); }
        else { render(data); signature = next; }
      }
      lastLoaded = Date.now();
    } catch (error) {
      if ((activeController.signal.aborted && activeController.signal.reason !== 'timeout') || id !== request) return;
      el('hotError').hidden = false;
      el('hotError').textContent = '榜单读取失败，已保留当前内容。请点击刷新重试。';
      if (!signature) { el('hotList').hidden = true; el('hotEmpty').hidden = false; el('hotEmpty').querySelector('.empty-desc').textContent = '连接恢复后会自动重试。'; }
    } finally { clearTimeout(timeout); if (id === request) el('hotResults').setAttribute('aria-busy', 'false'); }
  }
  function init() {
    el('hotRefresh').addEventListener('click', event => window.SeekFeedControls.pending(event.currentTarget, () => load()));
    for (const select of ['hotCategory', 'hotSort']) el(select).addEventListener('change', () => load());
    const tabs = [...document.querySelectorAll('[data-hot-period]')];
    for (const [index, tab] of tabs.entries()) {
      tab.addEventListener('click', () => {
        period = tab.dataset.hotPeriod;
        tabs.forEach(t => { t.setAttribute('aria-selected', String(t === tab)); t.tabIndex = t === tab ? 0 : -1; });
        el('hotResults').setAttribute('aria-labelledby', tab.id);
        load();
      });
      tab.addEventListener('keydown', event => {
        const target = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
        if (target !== null) { event.preventDefault(); tabs[target].focus(); tabs[target].click(); }
      });
    }
    el('hotNewData').addEventListener('click', () => { if (queued) { render(queued); signature = queuedSignature; } });
    const tick = () => { if (Date.now() - lastLoaded > 30000) load({background:true}); };
    setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
  }
  return {init, load};
})();
