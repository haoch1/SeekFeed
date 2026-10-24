/* Collection controls and read-only diagnostics. */
window.SeekFeedInsights = (() => {
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const num = value => new Intl.NumberFormat('zh-CN').format(value || 0);
    const time = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '暂无记录';
    const source = { rss: 'RSS', hot: '热榜', identity: '作者补全' };
    const authHeaders = () => { const token = localStorage.getItem('sessionId'); return token ? { Authorization: `Bearer ${token}` } : {}; };
    let changing = false;
    async function hotStatus() {
        const state = document.getElementById('hotCollectionState');
        if (!state || state.closest('section').hidden) return;
        try {
            const response = await fetch('/api/hot/collection', { cache: 'no-store', headers: authHeaders(), signal: AbortSignal.timeout(15000) });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error();
            const data = result.data;
            const verifying = data.verificationExpiresAt && Date.parse(data.verificationExpiresAt) > Date.now();
            const browser = data.browserRunning === false ? ' · 浏览器已关闭' : '';
            state.textContent = !data.configured ? '浏览器未配置' : data.controlling ? '正在处理' : verifying ? '人工验证中' : data.stopped ? '已停止' + browser :
                !data.enabled ? '自动采集未启用' : data.verificationRequired ? '等待人工验证' + browser : data.busy ? '采集中' : data.error ? '等待重试' + browser : '自动采集中';
            document.getElementById('hotCollectionSuccess').textContent = time(data.lastSuccessAt);
            document.getElementById('hotCollectionStart').disabled = changing || !data.controllable || data.enabled || data.controlling;
            document.getElementById('hotCollectionStop').disabled = changing || !data.controllable || data.controlling || (data.stopped && data.browserRunning === false);
            document.getElementById('hotVerificationOpen').disabled = changing || !data.configured || !data.controllable || data.busy;
            document.getElementById('hotVerificationResume').disabled = changing || !data.controllable || data.controlling || (data.stopped && !verifying);
        } catch { state.textContent = '状态读取失败'; }
    }
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('hotCollectionRefresh')?.addEventListener('click', event => window.SeekFeedControls.pending(event.currentTarget, hotStatus));
        const controls = [
            ['hotCollectionStart', '/api/hot/collection/start', '已启动自动采集。'],
            ['hotCollectionStop', '/api/hot/collection/stop', '采集和浏览器已停止。'],
            ['hotVerificationResume', '/api/hot/collection/restart', '已重启自动采集。'],
            ['hotVerificationOpen', '/api/hot/verification', '验证完成并进入帖子列表后，点击重启采集。'],
        ];
        for (const [id, path, success] of controls) document.getElementById(id)?.addEventListener('click', event => {
            if (changing) return;
            changing = true;
            // Open synchronously so mobile browsers do not block the new window.
            const popup = id === 'hotVerificationOpen' ? window.open('about:blank', '_blank') : null;
            if (popup) popup.opener = null;
            for (const [other] of controls) if (other !== id) document.getElementById(other).disabled = true;
            window.SeekFeedControls.pending(event.currentTarget, async () => {
                const message = document.getElementById('hotVerificationMessage');
                try {
                    if (id === 'hotVerificationOpen' && !popup) throw new Error('请允许本站打开新窗口后重试。');
                    const response = await fetch(path, { method: 'POST', headers: authHeaders(), signal: AbortSignal.timeout(60000) });
                    const result = await response.json();
                    if (!response.ok || !result.success) throw new Error(result.message || '操作失败，请稍后重试。');
                    if (popup) popup.location.replace(result.data.url);
                    message.textContent = success;
                } catch (error) { popup?.close(); message.textContent = error.message || '操作失败，请稍后重试。'; }
            }).finally(() => { changing = false; return hotStatus(); });
        });
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
