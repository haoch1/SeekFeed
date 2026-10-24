/* Read-only collection diagnostics. */
window.SeekFeedInsights = (() => {
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const num = value => new Intl.NumberFormat('zh-CN').format(value || 0);
    const time = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '暂无记录';
    const source = { rss: 'RSS', hot: '热榜', identity: '作者补全' };
    const authHeaders = () => { const token = localStorage.getItem('sessionId'); return token ? { Authorization: `Bearer ${token}` } : {}; };
    async function hotStatus() {
        const state = document.getElementById('hotCollectionState');
        if (!state || state.closest('section').hidden) return;
        try {
            const response = await fetch('/api/hot/collection', { cache: 'no-store', headers: authHeaders(), signal: AbortSignal.timeout(15000) });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error();
            const data = result.data;
            state.textContent = !data.configured ? '浏览器未配置' : !data.enabled ? '自动采集未启用' : data.verificationRequired ? '等待人工验证 · 已暂停' : data.busy ? '采集中' : '自动采集中';
            document.getElementById('hotCollectionSuccess').textContent = time(data.lastSuccessAt);
            document.getElementById('hotVerificationOpen').disabled = !data.configured || data.busy;
            document.getElementById('hotVerificationResume').disabled = !data.configured || !data.verificationRequired || data.busy;
        } catch { state.textContent = '状态读取失败'; }
    }
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('hotCollectionRefresh')?.addEventListener('click', event => window.SeekFeedControls.pending(event.currentTarget, hotStatus));
        for (const action of ['Open', 'Resume']) document.getElementById('hotVerification' + action)?.addEventListener('click', event => {
            // Open synchronously so mobile browsers do not block the new window.
            const popup = action === 'Open' ? window.open('about:blank', '_blank') : null;
            if (popup) popup.opener = null;
            window.SeekFeedControls.pending(event.currentTarget, async () => {
                const message = document.getElementById('hotVerificationMessage');
                try {
                    if (action === 'Open' && !popup) throw new Error('请允许本站打开新窗口后重试。');
                    const response = await fetch('/api/hot/verification' + (action === 'Resume' ? '/resume' : ''), { method: 'POST', headers: authHeaders(), signal: AbortSignal.timeout(20000) });
                    const result = await response.json();
                    if (!response.ok || !result.success) throw new Error(result.message || '操作失败，请稍后重试。');
                    if (popup) popup.location.replace(result.data.url);
                    message.textContent = action === 'Open' ? '采集已暂停。请在新窗口完成验证、进入帖子列表，再点击恢复采集。' : '已恢复自动采集，后续更新仍遵守采集间隔和源站等待时间。';
                } catch (error) { popup?.close(); message.textContent = error.message || '操作失败，请稍后重试。'; }
            }).finally(hotStatus);
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
