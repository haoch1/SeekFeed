/* Administrator annotations are persistent review data, independent of subscriptions. */
window.SeekFeedTradeLabels = (() => {
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const currencies = ['未明确', 'CNY', 'USD', 'CAD', 'EUR', 'GBP', 'HKD', 'SGD', 'AUD', 'NZD', 'USDT'];
    const kinds = ['出售报价', '周期费用', '溢价', '剩余价值', '手续费', '金额待分类'];
    const periods = ['不适用', '未明确', '月', '季', '年', '两年', '三年'];
    const assets = ['服务器与网络', '账号', '优惠与邀请码', '服务与席位', '软件授权', '域名', '通信产品', '其他或未明确'];
    let dialog, sequence = 0, opener;
    async function api(path = '', options = {}) {
        const token = localStorage.getItem('sessionId');
        const response = await fetch('/api/trades/labels' + path, { ...options, headers: { Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(response.status === 401 ? '请先登录后标记交易信息' : result.message || '操作失败，请重试');
        return result.data;
    }
    function shell(title) {
        if (!dialog) {
            dialog = document.createElement('dialog'); dialog.className = 'insight-dialog trade-label-dialog';
            dialog.setAttribute('aria-labelledby', 'tradeLabelTitle');
            dialog.innerHTML = `<header><h2 id="tradeLabelTitle"></h2><button class="icon-btn" type="button" aria-label="关闭标记窗口">${window.SeekFeedControls.icon('close')}</button></header><div class="insight-dialog-body"></div>`;
            document.body.append(dialog); dialog.querySelector('header button').onclick = () => dialog.close();
            dialog.addEventListener('close', () => { sequence++; window.SeekFeedControls.closeSelect(); window.SeekFeedControls.unlockScroll(dialog); opener?.focus({ preventScroll: true }); });
            dialog.addEventListener('click', e => { const r = dialog.getBoundingClientRect(); if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close(); });
        }
        sequence++; opener = document.activeElement; dialog.querySelector('h2').textContent = title;
        const body = dialog.querySelector('.insight-dialog-body'); body.innerHTML = '<p class="analytics-caption">正在读取…</p>';
        window.SeekFeedControls.closeSelect(); window.SeekFeedControls.dismissCharts();
        if (!dialog.open) { dialog.showModal(); window.SeekFeedControls.lockScroll(dialog); }
        return body;
    }
    const select = (id, values, value, label, auto = false) => `<select id="${id}" class="input-field" aria-label="${label}">${auto ? '<option value="">自动识别</option>' : ''}${values.map(v => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
    const priceRow = (price, index) => `<div class="trade-price-edit" data-price-row data-text="${esc(price.text || '人工录入')}" data-index="${index}"><div class="trade-price-edit-heading"><span>${esc(price.text || '新增金额')}</span><button type="button" class="icon-btn" data-remove-price aria-label="移除这项金额">${window.SeekFeedControls.icon('trash')}</button></div><div class="trade-price-fields"><label>金额<input class="input-field" data-amount type="number" min="0" max="1000000000" step="any" value="${price.amount ?? ''}" aria-label="人工金额" /></label><label>币种${select('manualCurrency' + index, currencies, price.currency || '未明确', '人工币种')}</label><label>用途${select('manualKind' + index, kinds, price.kind || '金额待分类', '人工金额用途')}</label><label>周期${select('manualPeriod' + index, periods, price.period || '不适用', '人工付费周期')}</label></div></div>`;
    async function open(row, changed) {
        if (!row) return;
        const body = shell('标记交易'); const turn = sequence;
        try {
            const saved = await api('?postId=' + row.post_id);
            if (turn !== sequence || !dialog.open) return;
            const labels = saved.annotation?.labels || {};
            let manualIntent = labels.intent || '', priceDirty = false, priceReset = false, nextPrice = row.fact.prices.length;
            body.innerHTML = `<p class="manual-post-title">${esc(row.title)}</p>${row.fact.needsReview ? '<p class="manual-review-note">原帖已修改。请核对后保存，人工标记才会重新生效。</p>' : ''}<form id="tradeLabelForm"><div class="manual-field"><label for="manualProvider">商家</label><input class="input-field" id="manualProvider" list="manualProviders" maxlength="60" value="${esc(labels.provider || '')}" placeholder="留空自动识别；可输入或选择商家" autocomplete="off" /><datalist id="manualProviders">${saved.providers.map(p => `<option value="${esc(p)}"></option>`).join('')}</datalist>${saved.recentProviders.length ? `<div class="manual-recent" aria-label="最近使用的商家">${saved.recentProviders.map(p => `<button type="button" data-use-provider="${esc(p)}">${esc(p)}</button>`).join('')}</div>` : ''}</div><div class="manual-field"><label>交易意图</label><div class="manual-intent" role="group" aria-label="人工交易意图">${[['求购', '求购'], ['出售', '出售'], ['其他', '其他']].map(([value, label]) => `<button type="button" data-manual-intent="${value}" aria-pressed="${(manualIntent || row.fact.intent) === value}">${label}</button>`).join('')}</div></div><details class="manual-more"><summary>更多字段与别名</summary><div class="manual-extra-fields"><div class="manual-field"><label for="manualRegion">地区</label><input class="input-field" id="manualRegion" list="manualRegions" maxlength="60" placeholder="留空自动识别" value="${esc(labels.region || '')}" /><datalist id="manualRegions">${['香港', '日本', '新加坡', '美国', '德国', '英国', '韩国', '台湾', '荷兰', '加拿大', '中国大陆'].map(v => `<option value="${v}"></option>`).join('')}</datalist></div><div class="manual-field"><label for="manualAsset">商品类型</label>${select('manualAsset', assets, labels.asset || '', '人工商品类型', true)}</div></div><div class="manual-alias"><label><input type="checkbox" id="manualLearnAlias" /> 保存商家别名，后续自动归类</label><input class="input-field" id="manualAlias" maxlength="60" minlength="2" placeholder="填写帖子中出现的别名" disabled /><p class="analytics-caption">仅勾选后生效，应用于全部包含该别名的交易帖。单帖标记不会自动推广为全局规则。</p></div><details id="manualPriceDetails"><summary>金额与币种 · ${row.fact.prices.length} 项</summary><p class="analytics-caption">只修改确定的金额。不同币种、售价与续费应分别标记。</p><div id="manualPrices">${row.fact.prices.map(priceRow).join('')}</div><div class="manual-price-actions"><button type="button" class="btn btn-secondary btn-xs" id="manualAddPrice">添加金额</button><button type="button" class="btn btn-secondary btn-xs" id="manualRestorePrices">金额恢复自动识别</button></div></details></details><p class="manual-message" role="status" id="manualMessage"></p><div class="manual-footer"><button type="button" class="btn btn-secondary" id="manualRestoreAll">恢复自动识别</button><button type="submit" class="btn btn-primary" id="manualSave">保存标记</button></div><p class="analytics-caption manual-privacy-note">保留原文与修正记录，供后续改进识别规则使用；不改变订阅及推送。</p></form>`;
            window.SeekFeedControls.enhanceSelects(body);
            const provider = body.querySelector('#manualProvider');
            body.querySelector('.manual-intent').onclick = e => { const button = e.target.closest('[data-manual-intent]'); if (!button) return; manualIntent = button.dataset.manualIntent; button.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button))); };
            body.querySelector('.manual-recent')?.addEventListener('click', e => { const b = e.target.closest('[data-use-provider]'); if (b) provider.value = b.dataset.useProvider; });
            body.querySelector('#manualLearnAlias').onchange = e => { body.querySelector('#manualAlias').disabled = !e.target.checked; if (e.target.checked) body.querySelector('#manualAlias').focus(); };
            body.querySelector('#manualPrices').addEventListener('input', () => { priceDirty = true; priceReset = false; });
            body.querySelector('#manualPrices').addEventListener('change', () => { priceDirty = true; priceReset = false; });
            body.querySelector('#manualPrices').onclick = e => { const b = e.target.closest('[data-remove-price]'); if (b) { b.closest('[data-price-row]').remove(); priceDirty = true; priceReset = false; } };
            body.querySelector('#manualAddPrice').onclick = () => { if (body.querySelectorAll('[data-price-row]').length >= 20) return; body.querySelector('#manualPrices').insertAdjacentHTML('beforeend', priceRow({}, nextPrice++)); window.SeekFeedControls.enhanceSelects(body); priceDirty = true; priceReset = false; };
            body.querySelector('#manualRestorePrices').onclick = () => { priceReset = true; priceDirty = false; body.querySelector('#manualMessage').textContent = '保存后，金额字段恢复自动识别。'; };
            const persist = async (payload, button) => window.SeekFeedControls.pending(button, async () => {
                try { await api('', { method: 'POST', body: JSON.stringify(payload) }); dialog.close(); changed(); }
                catch (error) { body.querySelector('#manualMessage').textContent = error.message; }
            });
            body.querySelector('#manualRestoreAll').onclick = e => persist({ postId: row.post_id, labels: {} }, e.currentTarget);
            body.querySelector('form').onsubmit = e => {
                e.preventDefault(); const next = {};
                if (provider.value.trim()) next.provider = provider.value.trim();
                if (manualIntent) next.intent = manualIntent;
                const region = body.querySelector('#manualRegion').value.trim(), asset = body.querySelector('#manualAsset').value;
                if (region) next.region = region; if (asset) next.asset = asset;
                if (labels.prices && !priceReset) next.prices = labels.prices;
                if (priceDirty) {
                    next.prices = [...body.querySelectorAll('[data-price-row]')].map(node => ({ text: node.dataset.text, amount: Number(node.querySelector('[data-amount]').value), currency: node.querySelector('select[aria-label="人工币种"]').value, kind: node.querySelector('select[aria-label="人工金额用途"]').value, period: node.querySelector('select[aria-label="人工付费周期"]').value, source: 'manual' }));
                    if ([...body.querySelectorAll('[data-amount]')].some(n => n.value === '') || next.prices.some(p => !Number.isFinite(p.amount) || p.amount < 0 || p.amount > 1000000000)) { body.querySelector('#manualMessage').textContent = '请填写有效金额。'; return; }
                    next.prices.forEach(p => { if (p.kind !== '周期费用') p.period = '不适用'; else if (p.period === '不适用') p.period = '未明确'; });
                }
                const payload = { postId: row.post_id, labels: next };
                if (body.querySelector('#manualLearnAlias').checked) {
                    payload.alias = body.querySelector('#manualAlias').value.trim();
                    if (!next.provider || payload.alias.length < 2) { body.querySelector('#manualMessage').textContent = '请指定商家，并填写至少两个字符的原文别名。'; return; }
                }
                persist(payload, body.querySelector('#manualSave'));
            };
            provider.focus();
        } catch (error) { if (turn === sequence) body.innerHTML = `<p class="manual-message" role="status">${esc(error.message)}</p>`; }
    }
    async function manage(changed) {
        const body = shell('标记与别名管理'); const turn = sequence;
        try {
            const data = await api(); if (turn !== sequence || !dialog.open) return;
            body.innerHTML = `<p class="analytics-caption">单帖标记可在相应帖子中修改或恢复；删除别名只撤销共享归类规则，不删除历史修正记录。</p><div class="manual-manage-heading"><h3>自定义商家别名</h3><button type="button" class="btn btn-secondary btn-xs" id="manualExport">导出标记数据</button></div><div class="manual-alias-list">${data.aliases.map(a => `<div><span><strong>${esc(a.alias)}</strong><span> → ${esc(a.provider)}</span></span><button type="button" class="icon-btn" data-remove-alias="${a.id}" aria-label="删除别名 ${esc(a.alias)}">${window.SeekFeedControls.icon('trash')}</button></div>`).join('') || '<p class="analytics-caption">尚无自定义别名。标记商家后可在“更多字段与别名”中保存。</p>'}</div><p class="manual-message" role="status"></p>`;
            body.querySelector('#manualExport').onclick = e => window.SeekFeedControls.pending(e.currentTarget, async () => {
                try { const all = await api('?export=1'), url = URL.createObjectURL(new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' })), a = document.createElement('a'); a.href = url; a.download = 'seekfeed-trade-labels-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
                catch (error) { body.querySelector('.manual-message').textContent = error.message; }
            });
            body.querySelector('.manual-alias-list').onclick = e => { const b = e.target.closest('[data-remove-alias]'); if (!b) return; window.SeekFeedControls.pending(b, async () => { try { await api('/aliases/' + b.dataset.removeAlias, { method: 'DELETE' }); b.parentElement.remove(); changed(); } catch (error) { body.querySelector('.manual-message').textContent = error.message; } }); };
        } catch (error) { if (turn === sequence) body.innerHTML = `<p class="manual-message" role="status">${esc(error.message)}</p>`; }
    }
    return { open, manage };
})();
