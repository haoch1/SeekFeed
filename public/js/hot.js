/* Public ranking view. Shared controls supply icons, selects and stable pending states. */
window.SeekFeedHot = (() => {
  let period = 'live', request = 0, lastLoaded = 0, signature = '', controller, loading = false;
  const el = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = name => window.SeekFeedControls.icon(name);
  const number = value => new Intl.NumberFormat('zh-CN').format(value);
  function render(data, background) {
    const list = el('hotList');
    const existing = new Map([...list.querySelectorAll('.hot-row')].map(row => [row.dataset.postId, row]));
    const anchor = background && scrollY > 160 ? [...existing.values()].find(row => row.getBoundingClientRect().bottom > 80 && data.posts.some(p => String(p.postId) === row.dataset.postId)) : null;
    const anchorTop = anchor?.getBoundingClientRect().top;
    const keep = new Set();
    for (const [index, post] of data.posts.entries()) {
      const key = String(post.postId);
      let row = existing.get(key);
      if (!row) {
        row = document.createElement('li'); row.className = 'hot-row'; row.dataset.postId = key;
        row.innerHTML = `<span class="hot-rank"></span><div class="hot-post"><a class="hot-post-title" target="_blank" rel="noopener noreferrer"></a><div class="hot-post-meta"><span class="hot-category"></span><span class="hot-author"></span></div></div><span class="hot-number hot-views">${icon('eye')}<span></span></span><span class="hot-number hot-replies">${icon('message')}<span></span></span><span class="hot-number hot-heat"></span>`;
        row.querySelector('a').href = `https://www.nodeseek.com/post-${Number(post.postId)}-1`;
      }
      const text = (selector, value) => { const node = row.querySelector(selector); if (node.textContent !== value) node.textContent = value; };
      text('.hot-rank', String(index + 1).padStart(2, '0'));
      row.querySelector('.hot-rank').classList.toggle('top-rank', index < 3);
      row.querySelector('.hot-rank').setAttribute('aria-label', `第 ${index + 1} 名`);
      text('.hot-post-title', post.title); text('.hot-category', post.categoryLabel);
      const authorSignature = JSON.stringify([post.author, post.authorId]);
      if (row.dataset.authorSignature !== authorSignature) {
        row.querySelector('.hot-author').outerHTML = window.SeekFeedControls.authorLink(post.author, post.authorId, 'hot-author');
        row.dataset.authorSignature = authorSignature;
      }
      const views = post.views, replies = post.replies;
      const heat = String(Math.round(post.heat * 40));
      text('.hot-views span', number(views)); text('.hot-replies span', number(replies)); text('.hot-heat', heat);
      row.querySelector('.hot-views').setAttribute('aria-label', `浏览量 ${number(views)}`);
      row.querySelector('.hot-replies').setAttribute('aria-label', `回复量 ${number(replies)}`);
      row.querySelector('.hot-heat').setAttribute('aria-label', `热度 ${heat}`);
      keep.add(row);
      if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
    }
    [...list.children].filter(row => !keep.has(row)).forEach(row => row.remove());
    if (anchor?.isConnected) window.scrollBy({top:anchor.getBoundingClientRect().top - anchorTop, behavior:'instant'});
    list.hidden = !data.posts.length;
    el('hotEmpty').hidden = Boolean(data.posts.length);
    if (!data.posts.length) {
      el('hotEmpty').querySelector('.empty-title').textContent = data.warmingUp ? '正在积累增量样本' : data.updatedAt ? '暂无符合条件的帖子' : '榜单准备中';
      el('hotEmpty').querySelector('.empty-desc').textContent = data.warmingUp ? '下一轮采集后自动更新。' : data.updatedAt ? '试试其他分类或时间范围。' : data.enabled ? '首次采集完成后会自动显示。' : '服务器尚未启用热榜采集。';
    }
  }
  function status(data) {
    el('hotViewsLabel').textContent = '浏览量';
    el('hotRepliesLabel').textContent = '回复量';
    const sort = el('hotSort');
    sort.options[1].textContent = '浏览量最多';
    sort.options[2].textContent = '回复量最多';
    window.SeekFeedControls.refreshSelects();
    const freshness = data.updatedAt ? `最近采集 ${new Date(data.updatedAt).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'})}` : '等待首次采集';
    if (el('hotFreshness').textContent !== freshness) el('hotFreshness').textContent = freshness;
    el('hotError').hidden = !data.error && (!data.stale || !data.updatedAt);
    el('hotError').textContent = data.error || '采集延迟，当前显示上次保存的榜单。';
    el('hotFreshness').closest('.hot-statusbar').classList.toggle('has-error', !el('hotError').hidden);
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
    if (background && loading) return;
    controller?.abort();
    controller = new AbortController();
    const activeController = controller;
    const timeout = setTimeout(() => activeController.abort('timeout'), 15000);
    const id = ++request;
    loading = true;
    const query = new URLSearchParams({period, category:el('hotCategory').value, sort:el('hotSort').value, limit:el('hotLimit').value});
    if (!background) el('hotResults').setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('/api/hot?' + query, {signal:controller.signal, cache:'no-store'});
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error('unavailable');
      if (id !== request) return;
      const data = result.data;
      status(data);
      const next = JSON.stringify([query.toString(), data.posts]);
      if (next !== signature) {
        render(data, background); signature = next;
      }
      lastLoaded = Date.now();
    } catch (error) {
      if ((activeController.signal.aborted && activeController.signal.reason !== 'timeout') || id !== request) return;
      el('hotError').hidden = false;
      el('hotError').textContent = '榜单读取失败，已保留当前内容。请点击刷新重试。';
      el('hotFreshness').closest('.hot-statusbar').classList.add('has-error');
      if (!signature) { el('hotList').hidden = true; el('hotEmpty').hidden = false; el('hotEmpty').querySelector('.empty-desc').textContent = '连接恢复后会自动重试。'; }
    } finally { clearTimeout(timeout); if (id === request) { loading = false; el('hotResults').setAttribute('aria-busy', 'false'); } }
  }
  function init() {
    const mobile = matchMedia('(max-width: 760px), (max-width: 1000px) and (pointer: coarse)');
    let desktopLimit = el('hotLimit').value;
    const placeRefresh = () => {
      el('hotPage').querySelector(mobile.matches ? '.hot-filters' : '.workspace-heading').appendChild(el('hotRefresh'));
      if (mobile.matches) { desktopLimit = el('hotLimit').value; el('hotLimit').value = '30'; }
      else el('hotLimit').value = desktopLimit;
      window.SeekFeedControls.refreshSelects();
      if (lastLoaded) load();
    };
    placeRefresh();
    mobile.addEventListener('change', placeRefresh);
    el('hotRefresh').addEventListener('click', event => window.SeekFeedControls.pending(event.currentTarget, () => load()));
    for (const select of ['hotCategory', 'hotSort', 'hotLimit']) el(select).addEventListener('change', () => load());
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
    const tick = () => load({background:true});
    setInterval(tick, window.SeekFeedCadence.hotRefreshMs);
    document.addEventListener('visibilitychange', tick);
  }
  return {init, load};
})();
