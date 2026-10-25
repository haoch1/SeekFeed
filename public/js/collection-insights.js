/* Collection controls and read-only diagnostics. */
window.SeekFeedInsights = (() => {
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const num = value => new Intl.NumberFormat('zh-CN').format(value || 0);
    const time = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '暂无记录';
    const source = { rss: 'RSS', hot: '热榜', identity: '作者补全' };
    const authHeaders = () => { const token = localStorage.getItem('sessionId'); return token ? { Authorization: `Bearer ${token}` } : {}; };
    let collectionState = null, statusRevision = 0, actionRevision = 0, feedback = '', verificationWindow = null, returnFocus = false;
    const pending = new Map();
    function renderHotActions() {
        const primary = document.getElementById('hotCollectionAction'), stop = document.getElementById('hotCollectionStop');
        if (!primary || !stop) return;
        const data = collectionState;
        if (!data) { primary.disabled = true; stop.hidden = true; return; }
        const verifying = data.verificationRequired && Date.parse(data.verificationExpiresAt || '') > Date.now();
        const action = data.verificationRequired ? (verifying ? 'restart' : 'verify') :
            data.stopped && data.browserRunning !== true ? 'start' : 'stop';
        const available = data.configured && data.controllable;
        primary.dataset.action = action;
        if (!primary.hasAttribute('aria-busy')) primary.textContent = { start: '启动采集', stop: '停止采集', verify: '人工验证', restart: '验证完成，继续采集' }[action];
        primary.classList.toggle('btn-primary', action !== 'stop');
        primary.classList.toggle('btn-secondary', action === 'stop');
        primary.disabled = !available || pending.size > 0 || (action !== 'stop' && data.busy);
        stop.hidden = action === 'stop' || !(pending.has(primary) || (data.verificationRequired &&
            (data.controlling || !data.stopped || data.browserRunning !== false)));
        stop.disabled = !available || pending.has(stop);
        if (returnFocus && stop.hidden && !primary.disabled) { primary.focus({ preventScroll: true }); returnFocus = false; }
        document.getElementById('hotVerificationMessage').textContent = feedback || (!available ? '服务器尚未配置采集控制。' :
            verifying ? '在验证窗口进入帖子列表后继续；验证窗口有效期 15 分钟。' :
            data.verificationRequired ? '需要完成人工验证后才能继续采集。' : '采集按设定频率自动运行，停止后保留会话与榜单。');
    }
    async function hotStatus() {
        const state = document.getElementById('hotCollectionState');
        if (!state || state.closest('section').hidden) return;
        const revision = ++statusRevision, action = actionRevision;
        try {
            const response = await fetch('/api/hot/collection', { cache: 'no-store', headers: authHeaders(), signal: AbortSignal.timeout(15000) });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error();
            if (revision !== statusRevision || action !== actionRevision) return;
            const data = collectionState = result.data;
            const verifying = data.verificationExpiresAt && Date.parse(data.verificationExpiresAt) > Date.now();
            const browser = data.browserRunning === false ? ' · 浏览器已关闭' : '';
            state.textContent = !data.configured ? '浏览器未配置' : data.controlling ? '正在处理' : verifying ? '人工验证中' :
                data.verificationRequired ? '等待人工验证' + browser : data.stopped ? '已停止' + browser :
                !data.enabled ? '自动采集未启用' : data.busy ? '采集中' : data.error ? '等待重试' + browser : '自动采集中';
            document.getElementById('hotCollectionSuccess').textContent = time(data.lastSuccessAt);
            renderHotActions();
        } catch {
            if (revision !== statusRevision || action !== actionRevision) return;
            state.textContent = '状态读取失败'; collectionState = null; renderHotActions();
        }
    }
    async function runHotAction(action, button) {
        if (!action || pending.has(button) || (pending.size && action !== 'stop')) return;
        const revision = ++actionRevision;
        pending.set(button, action); feedback = '';
        // Open synchronously so mobile browsers do not block the new window.
        const popup = action === 'verify' ? window.open('about:blank', '_blank') : null;
        if (popup) { popup.opener = null; verificationWindow = popup; }
        if (action === 'stop') { verificationWindow?.close(); verificationWindow = null; returnFocus = true; }
        try {
            await window.SeekFeedControls.pending(button, async () => {
                renderHotActions();
                const message = document.getElementById('hotVerificationMessage');
                try {
                    if (action === 'verify' && !popup) throw new Error('请允许本站打开新窗口后重试。');
                    const path = action === 'verify' ? '/api/hot/verification' : '/api/hot/collection/' + action;
                    const response = await fetch(path, { method: 'POST', headers: authHeaders(), signal: AbortSignal.timeout(60000) });
                    const result = await response.json();
                    if (revision !== actionRevision) return;
                    if (!response.ok || !result.success) throw new Error(result.message || '操作失败，请稍后重试。');
                    if (popup) popup.location.replace(result.data.url);
                    if (action === 'restart') { verificationWindow?.close(); verificationWindow = null; }
                    feedback = { start: '已启动自动采集。', stop: '采集和浏览器已停止。', restart: '已继续自动采集。',
                        verify: '验证完成并进入帖子列表后，点击“验证完成，继续采集”。' }[action];
                } catch (error) {
                    popup?.close();
                    if (revision === actionRevision) feedback = error.message || '操作失败，请稍后重试。';
                }
                if (revision === actionRevision) message.textContent = feedback;
            });
        } finally { pending.delete(button); await hotStatus(); }
    }
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('hotCollectionRefresh')?.addEventListener('click', event => window.SeekFeedControls.pending(event.currentTarget, hotStatus));
        document.getElementById('hotCollectionAction')?.addEventListener('click', event => void runHotAction(event.currentTarget.dataset.action, event.currentTarget));
        document.getElementById('hotCollectionStop')?.addEventListener('click', event => void runHotAction('stop', event.currentTarget));
    });
    async function quality() {
        const box = document.getElementById('collectionQuality');
        if (!box || box.closest('section').hidden) return;
        void hotStatus();
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
    return { quality, hotStatus };
})();
