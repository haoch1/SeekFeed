/* Read-only collection diagnostics and observed forum history. */
window.SeekFeedInsights = (() => {
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const num = value => new Intl.NumberFormat('zh-CN').format(value || 0);
    const time = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '暂无记录';
    const source = { rss: 'RSS', hot: '热榜', identity: '作者补全' };
    const authHeaders = () => { const token = localStorage.getItem('sessionId'); return token ? { Authorization: `Bearer ${token}` } : {}; };
    let dialog, opener, request = 0, controller, historyResize;
    async function read(url) {
        controller?.abort();
        controller = new AbortController();
        const current = controller;
        const timer = setTimeout(() => current.abort(), 15000);
        try {
            const response = await fetch(url, { signal: current.signal, cache: 'no-store', headers: authHeaders() });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error('读取失败');
            return result.data;
        } finally { clearTimeout(timer); }
    }
    async function quality() {
        const box = document.getElementById('collectionQuality');
        if (!box || box.closest('section').hidden) return;
        box.setAttribute('aria-busy', 'true');
        try {
            // Separate request: refreshing diagnostics never triggers remote collection.
            const response = await fetch('/api/collection/quality', { cache: 'no-store', headers: authHeaders(), signal: AbortSignal.timeout(15000) });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error('读取失败');
            const data = result.data;
            box.innerHTML = `<div class="insight-summary">${['rss', 'hot', 'identity'].map(key => {
                const row = data.summary.find(row => row.source === key);
                return `<div><span>${source[key]} · 近 24 小时</span><strong>${row ? num(row.runs - row.failed) + ' / ' + num(row.runs) : '—'}</strong><small>成功 / 总轮次 · ${row ? (row.durationMs / 1000).toFixed(1) + ' 秒 / 轮' : '等待采集'}</small></div>`;
            }).join('')}<div><span>作者主页覆盖</span><strong>${num(data.authors.linked)} / ${num(data.authors.total)}</strong><small>已关联 / 已收录作者</small></div></div>
            <div class="insight-table-scroll"><table class="insight-table"><thead><tr><th>时间</th><th>来源</th><th>状态</th><th>有效 / 返回</th><th>新增 / 更新</th><th>耗时</th><th>诊断</th></tr></thead><tbody>${data.recent.map(row => `<tr><td>${esc(time(row.started_at))}</td><td>${source[row.source] || '未知'}</td><td><span class="insight-state" data-state="${esc(row.status)}">${({ success: '正常', partial: '部分异常', failed: '失败' })[row.status] || '未知'}</span></td><td>${num(row.accepted)} / ${num(row.received)}</td><td>${num(row.inserted)} / ${num(row.updated)}</td><td>${(row.duration_ms / 1000).toFixed(1)}s</td><td>${esc(row.http_status ? 'HTTP ' + row.http_status : row.error_code || (row.invalid ? row.invalid + ' 条无效' : '—'))}</td></tr>`).join('') || '<tr><td colspan="7">尚无采集记录</td></tr>'}</tbody></table></div>`;
        } catch { box.innerHTML = '<p class="insight-note" role="status">采集记录读取失败，请重新加载。</p>'; }
        finally { box.setAttribute('aria-busy', 'false'); }
    }
    function open(title) {
        historyResize?.disconnect();
        if (!dialog) {
            dialog = document.createElement('dialog'); dialog.className = 'insight-dialog';
            dialog.setAttribute('aria-labelledby', 'insightDialogTitle');
            dialog.innerHTML = `<header><h2 id="insightDialogTitle"></h2><button type="button" class="icon-btn" aria-label="关闭详情">${window.SeekFeedControls.icon('close')}</button></header><div class="insight-dialog-body"></div>`;
            document.body.append(dialog);
            dialog.querySelector('button').onclick = () => dialog.close();
            dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
            dialog.addEventListener('close', () => { request++; controller?.abort(); historyResize?.disconnect(); window.SeekFeedControls.unlockScroll(dialog); opener?.focus({ preventScroll: true }); });
        }
        opener = document.activeElement;
        dialog.querySelector('h2').textContent = title;
        dialog.querySelector('.insight-dialog-body').innerHTML = '<p class="insight-note" role="status">正在读取…</p>';
        if (!dialog.open) { window.SeekFeedControls.dismissCharts(); dialog.showModal(); window.SeekFeedControls.lockScroll(dialog); }
        return dialog.querySelector('.insight-dialog-body');
    }
    async function revisions(id) {
        const body = open('帖子变更'); const current = ++request;
        try {
            const data = await read(`/api/posts/${id}/revisions`);
            if (current !== request || !dialog.open) return;
            body.innerHTML = '<p class="insight-note">仅展示 RSS 已观察到的内容变化，保留最近 30 天、最多 20 个版本。</p>' + (data.map(row => `<section class="insight-revision"><h3>${esc(time(row.observedAt))}</h3>${Object.keys(row.after).filter(key => row.before[key] !== row.after[key]).map(key => `<div class="revision-field"><strong>${({ title: '标题', memo: '摘要', category: '分类', creator: '作者' })[key] || esc(key)}</strong><div class="revision-before"><small>更新前</small><p>${esc(row.before[key]) || '（空）'}</p></div><div class="revision-after"><small>更新后</small><p>${esc(row.after[key]) || '（空）'}</p></div></div>`).join('')}</section>`).join('') || '<p class="insight-note">尚无已记录的变更。</p>');
        } catch (error) { if (current === request) body.innerHTML = '<p role="status" class="insight-note">变更记录读取失败，请重新打开。</p>'; }
    }
    function chart(points, metric, mode, availableWidth) {
        if (!points.length) return '<div class="insight-empty">尚无互动历史。后续采集到的观察值将按小时保留。</div>';
        const width = Math.max(240, Math.min(880, availableWidth)), height = 280, left = 44, right = 36, top = 32, bottom = 42;
        const min = Date.parse(points[0].bucket), max = Math.max(min + 3600000, Date.parse(points.at(-1).bucket));
        const peak = Math.max(1, ...points.map(point => point[metric]));
        const x = point => left + (Date.parse(point.bucket) - min) / (max - min) * (width - left - right);
        const y = point => height - bottom - point[metric] / peak * (height - top - bottom);
        const label = metric === 'views' ? '浏览量' : '回复量';
        let path = '';
        const shapes = points.map((point, i) => {
            const px = x(point), py = y(point);
            path += `${!i || Date.parse(point.bucket) - Date.parse(points[i - 1].bucket) > 3600000 ? 'M' : 'L'}${px},${py} `;
            const title = esc(`${time(point.observedAt)} · ${label} ${num(point[metric])}`);
            const barWidth = Math.max(1, Math.min(6, (width - left - right) / Math.max(1, (max - min) / 3600000) * .65));
            return mode === 'bar' ? `<rect x="${px - barWidth / 2}" y="${py}" width="${barWidth}" height="${Math.max(1, height - bottom - py)}" rx="1"><title>${title}</title></rect>` : `<circle cx="${px}" cy="${py}" r="${width < 500 ? 2 : 3.5}"><title>${title}</title></circle>`;
        }).join('');
        const grid = Array.from({ length: 5 }, (_, index) => {
            const yy = top + index * (height - top - bottom) / 4;
            return `<line x1="${left}" x2="${width - right}" y1="${yy}" y2="${yy}" class="insight-grid"/><text x="${left - 12}" y="${yy + 4}" text-anchor="end">${num(Math.round(peak * (4 - index) / 4))}</text>`;
        }).join('');
        const ticks = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].map(index => `<text x="${x(points[index])}" y="${height - 12}" text-anchor="middle">${esc(new Date(points[index].bucket).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit' }))}</text>`).join('');
        return `<svg class="insight-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="按小时保存的${label}，缺测时段不补零">${grid}${ticks}<g class="insight-series">${mode === 'line' ? `<path d="${path}" fill="none" stroke="currentColor" stroke-width="2"/>` : ''}${shapes}</g></svg>`;
    }
    async function activity(id, title) {
        const body = open('互动历史'); const current = ++request;
        let metric = 'views', mode = 'line', days = '7', points = [];
        body.innerHTML = `<p class="insight-post-title"></p><div class="insight-toolbar"><div class="insight-tabs" role="group" aria-label="互动指标"><button class="btn btn-secondary" data-metric="views" aria-pressed="true">浏览量</button><button class="btn btn-secondary" data-metric="replies" aria-pressed="false">回复量</button></div><div class="insight-tabs" role="group" aria-label="图表样式"><button class="btn btn-secondary" data-mode="bar" aria-pressed="false">柱形</button><button class="btn btn-secondary" data-mode="line" aria-pressed="true">折线</button></div><div class="insight-tabs" role="group" aria-label="历史范围"><button class="btn btn-secondary" data-days="7" aria-pressed="true">7 天</button><button class="btn btn-secondary" data-days="30" aria-pressed="false">30 天</button></div></div><div class="insight-history" aria-live="polite"></div><p class="insight-note">每小时最后一次观察到的累计值 · 仅覆盖采集到的帖子和时段 · 缺测不补零，断档不连线；计数回落按源站原值展示。</p><details class="insight-observations"><summary>查看采样明细</summary><div class="insight-table-scroll"></div></details>`;
        body.querySelector('.insight-post-title').textContent = title;
        const draw = () => { const box = body.querySelector('.insight-history'); box.innerHTML = chart(points, metric, mode, box.clientWidth); };
        historyResize = new ResizeObserver(draw); historyResize.observe(body.querySelector('.insight-history'));
        let loadId = 0;
        const load = async () => {
            const turn = ++loadId;
            body.querySelector('.insight-history').setAttribute('aria-busy', 'true');
            try {
                const data = await read(`/api/posts/${id}/activity?days=${days}`);
                if (current !== request || turn !== loadId || !dialog.open) return;
                points = data.points; draw();
                body.querySelector('.insight-observations .insight-table-scroll').innerHTML = `<table class="insight-table"><thead><tr><th>观察时间</th><th>浏览量</th><th>回复量</th></tr></thead><tbody>${[...points].reverse().map(point => `<tr><td>${esc(time(point.observedAt))}</td><td>${num(point.views)}</td><td>${num(point.replies)}</td></tr>`).join('') || '<tr><td colspan="3">尚无观察记录</td></tr>'}</tbody></table>`;
            } catch { if (current === request && turn === loadId) body.querySelector('.insight-history').innerHTML = '<p class="insight-note">读取失败，请切换范围重试。</p>'; }
            finally { if (current === request && turn === loadId) body.querySelector('.insight-history').setAttribute('aria-busy', 'false'); }
        };
        body.querySelector('.insight-toolbar').onclick = event => {
            const button = event.target.closest('button'); if (!button) return;
            button.parentElement.querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed', String(node === button)));
            if (button.dataset.metric) { metric = button.dataset.metric; draw(); }
            if (button.dataset.mode) { mode = button.dataset.mode; draw(); }
            if (button.dataset.days) { days = button.dataset.days; load(); }
        };
        await load();
    }
    function trade(info) {
        if (!info) return '';
        const labels = [info.intent, ...info.providers, ...info.regions, ...info.prices.map(price => `${price.kind} ${price.text}${price.currency === '未明确' ? '（币种未明确）' : ''}`)].filter(Boolean);
        return `<div class="post-trade-info"><span class="trade-source">标题提取</span>${labels.slice(0, 8).map(label => `<span>${esc(label)}</span>`).join('')}</div>`;
    }
    document.addEventListener('click', event => {
        const revision = event.target.closest('[data-post-revisions]');
        if (revision) revisions(Number(revision.dataset.postRevisions));
        const history = event.target.closest('[data-post-activity]');
        if (history) activity(Number(history.dataset.postActivity), history.closest('.hot-row')?.querySelector('.hot-post-title')?.textContent || '');
    });
    return { quality, trade };
})();
