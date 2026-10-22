/* Local-database facets and public listing evidence; no origin collection requests. */
window.SeekFeedTrades = (() => {
    const el = id => document.getElementById(id);
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const num = value => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value || 0);
    const when = value => value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
    const initial = () => ({ days: 0, offset: -new Date().getTimezoneOffset(), provider: '', region: '', intent: '', asset: '', q: '', page: 1, priceGroup: '' });
    let state = initial(), data, controller, sequence = 0, style = 'bar', debounce, lastLoad = 0, signature;
    const visible = () => el('tradesPage') && !el('tradesPage').hidden && !document.hidden;
    function options(id, rows, label, selected, unknown = false) {
        const select = el(id), entries = [...rows];
        if (unknown && !entries.some(r => r.name === '未识别')) entries.push({ name: '未识别', count: 0 });
        if (unknown) entries.sort((a, b) => Number(b.name === '未识别') - Number(a.name === '未识别'));
        const html = (label ? `<option value="">${label}</option>` : '') + entries.map(r => `<option value="${esc(r.name)}">${esc(r.name === '未识别' ? id === 'tradeProvider' ? '未识别商家' : '未识别地区' : r.name)}${r.count === undefined ? '' : ` (${num(r.count)})`}</option>`).join('');
        if (select.innerHTML !== html) select.innerHTML = html;
        select.value = selected;
        select.dispatchEvent(new Event('seekfeed:options'));
    }
    function facets(id, rows, key) {
        const peak = Math.max(1, ...rows.map(r => r.count));
        el(id).innerHTML = rows.slice(0, key === 'provider' ? 10 : 8).map(row => `<button type="button" class="trade-facet${state[key] === row.name ? ' selected' : ''}" data-facet="${key}" data-value="${esc(row.name)}" aria-pressed="${state[key] === row.name}"><span class="trade-facet-label">${esc(row.name)}</span><span class="trade-bar-track"><i style="width:${row.count / peak * 100}%"></i></span><strong>${num(row.count)}</strong>${key === 'provider' ? `<small>出售 ${num(row.sell)} / 求购 ${num(row.buy)}</small>` : ''}</button>`).join('') || '<p class="trade-empty">当前筛选下暂无记录</p>';
    }
    function drawTrend() {
        if (!data) return;
        const rows = data.trend, box = el('tradeTrend'), width = Math.max(270, box.clientWidth), height = 250, left = 38, right = 16, top = 26, bottom = 35;
        if (!rows.length) { box.innerHTML = '<div class="trade-empty">暂无发布记录</div>'; return; }
        const max = Math.max(1, ...rows.map(r => style === 'bar' ? r.count : Math.max(r.sell, r.buy, r.count - r.sell - r.buy)));
        const plot = width - left - right, step = plot / rows.length, x = i => left + (i + .5) * step, y = n => height - bottom - n / max * (height - top - bottom);
        const grid = Array.from({ length: 5 }, (_, i) => { const value = max * i / 4, yy = y(value); return `<line x1="${left}" x2="${width - right}" y1="${yy}" y2="${yy}" class="analytics-grid-line"/><text x="${left - 7}" y="${yy + 4}" text-anchor="end">${num(Math.round(value))}</text>`; }).join('');
        const ticks = rows.map((r, i) => i % Math.max(1, Math.ceil(rows.length / Math.max(3, width / 70))) === 0 || i === rows.length - 1 ? `<text x="${x(i)}" y="${height - 10}" text-anchor="middle">${esc(r.date.slice(5))}</text>` : '').join('');
        const series = ['sell', 'buy', 'other'];
        const value = (r, k) => k === 'other' ? r.count - r.sell - r.buy : r[k];
        const shapes = style === 'bar' ? rows.map((r, i) => {
            let base = 0; return series.map((key, j) => { const n = value(r, key), yy = y(base + n), h = n / max * (height - top - bottom); base += n; return `<rect class="trade-series-${j}" x="${x(i) - Math.min(36, step * .55) / 2}" y="${yy}" width="${Math.min(36, step * .55)}" height="${h}"><title>${esc(r.date)} · ${['出售', '求购', '其他'][j]} ${num(n)} 帖</title></rect>`; }).join('');
        }).join('') : series.map((key, j) => `<path class="trade-line trade-series-${j}" d="${rows.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${y(value(r, key))}`).join(' ')}"/>${rows.map((r, i) => `<circle class="trade-series-${j}" cx="${x(i)}" cy="${y(value(r, key))}" r="3.5"><title>${esc(r.date)} · ${['出售', '求购', '其他'][j]} ${num(value(r, key))} 帖</title></circle>`).join('')}`).join('');
        box.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="交易供求${style === 'bar' ? '柱形' : '折线'}图">${grid}${ticks}${shapes}</svg>`;
    }
    function render() {
        const d = data, total = d.totals.posts;
        el('tradeRangeInfo').textContent = `当前 ${num(total)} 帖 / 时间范围内 ${num(d.range.records)} 帖 · 已收录区间 ${when(d.range.start)} — ${when(d.range.end)}`;
        el('tradeKpis').innerHTML = [
            ['交易帖子', total, `${num(d.totals.authors)} 位发布者`, 'posts'],
            ['出售 / 求购', `${num(d.totals.sellers)} / ${num(d.totals.buyers)}`, '按帖子意图统计，非独立交易数量', 'trade'],
            ['其他', d.totals.others, '其余意图或暂无法明确识别的帖子', 'check'],
            ['含金额记录', d.coverage.money, `${num(d.coverage.comparable)} 帖有明确分组报价`, 'chart'],
        ].map(([label, value, detail, icon]) => `<article class="analytics-kpi"><div class="analytics-kpi-label"><span>${label}</span><span class="analytics-icon">${window.SeekFeedControls.icon(icon)}</span></div><strong class="analytics-value">${typeof value === 'number' ? num(value) : value}</strong><div class="analytics-kpi-detail">${detail}</div></article>`).join('');
        options('tradeProvider', d.facets.providers, '全部商家', state.provider, true); options('tradeRegion', d.facets.regions, '全部地区', state.region, true);
        options('tradeIntent', d.facets.intents, '全部意图', state.intent); options('tradeAsset', d.facets.assets, '全部商品', state.asset);
        for (const [id, rows] of [['tradeSpecs', [...d.network, ...d.specifications].sort((a, b) => b.count - a.count).slice(0, 12)], ['tradeDelivery', d.delivery]]) el(id).innerHTML = rows.map(r => `<span>${esc(r.name)}<strong>${num(r.count)}</strong></span>`).join('') || '<p class="trade-empty">暂无明确提及</p>';
        facets('tradeProviders', d.providers, 'provider'); facets('tradeAssets', d.assets, 'asset');
        el('tradeRegions').innerHTML = d.regions.slice(0, 12).map(r => `<button type="button" data-facet="region" data-value="${esc(r.name)}" aria-pressed="${state.region === r.name}" class="${state.region === r.name ? 'selected' : ''}"><span>${esc(r.name)}</span><strong>${num(r.count)}</strong></button>`).join('') || '<p class="trade-empty">暂无地区记录</p>';
        options('tradePriceGroup', d.pricing.groups.map(name => ({ name })), d.pricing.groups.length ? null : '暂无明确币种的报价', d.pricing.selectedGroup);
        const p = d.pricing, peak = Math.max(1, ...p.histogram.map(r => r.count));
        el('tradePricing').innerHTML = `<div class="trade-price-stats"><div><span>样本数</span><strong>${num(p.samples)}</strong></div><div><span>中位报价</span><strong>${p.median === null ? '—' : num(p.median)}</strong></div><div><span>中间 50%</span><strong>${p.q1 === null ? '—' : `${num(p.q1)}–${num(p.q3)}`}</strong></div></div>${p.samples ? `<div class="trade-histogram" role="img" aria-label="${esc(p.selectedGroup)}，${p.samples}个报价样本">${p.histogram.map((r, i) => `<div><strong>${num(r.count)}</strong><i style="height:${Math.max(1, r.count / peak * 100)}px"><span class="trade-bin-hint">${num(r.min)}${i === 5 ? ' ≤ 金额 ≤ ' : ' ≤ 金额 < '}${num(r.max)} · ${num(r.count)} 个</span></i><small>${num(r.min)}</small></div>`).join('')}</div>` : '<p class="trade-empty">当前范围没有明确且唯一的同组报价</p>'}${p.samples && p.samples < 5 ? '<p class="analytics-caption">样本少于 5 个，仅供核对原帖。</p>' : ''}`;
        el('tradeCoverage').innerHTML = [['商家', d.coverage.providers], ['地区', d.coverage.regions], ['求购 / 出售', d.coverage.intent], ['金额', d.coverage.money], ['有 RSS 摘要', d.coverage.summary]].map(([label, count]) => `<div><span>${label}</span><strong>${total ? (count / total * 100).toFixed(1) : '0'}%</strong><div><i style="width:${total ? count / total * 100 : 0}%"></i></div><small>${num(count)} / ${num(total)} 帖</small></div>`).join('');
        el('tradeRecordsCount').textContent = `${num(total)} 条 · 点击提取依据可核对金额原文与别名`;
        el('tradePagePosition').textContent = `${d.page} / ${d.pageCount}`; el('tradePrev').disabled = d.page <= 1; el('tradeNext').disabled = d.page >= d.pageCount;
        const open = new Set([...el('tradeRecords').querySelectorAll('details[open]')].map(n => n.dataset.post));
        el('tradeRecords').innerHTML = d.records.map(r => `<article class="trade-record"><div class="trade-record-heading"><a href="https://www.nodeseek.com/post-${r.post_id}-1" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a><span class="trade-intent" data-intent="${esc(r.fact.intent)}">${esc(r.fact.intent)}</span></div><div class="trade-record-meta">${window.SeekFeedControls.authorLink(r.creator, r.authorId)}<span>${when(r.pub_date)}</span><span>${esc(r.fact.asset)}</span></div><div class="trade-record-tags">${r.fact.needsReview ? '<span class="trade-review">原帖已修改 · 标记待复核</span>' : r.fact.manualFields.length ? '<span class="trade-manual">人工标记</span>' : r.fact.customAliases.length ? '<span class="trade-manual">自定义别名</span>' : ''}${[...r.fact.providers, ...r.fact.regions].map(v => `<span>${esc(v)}</span>`).join('')}${!r.fact.providers.length ? '<span class="trade-unknown">商家未识别</span>' : ''}</div><div class="trade-record-label-action"><button type="button" class="btn btn-secondary btn-xs" data-trade-label="${r.post_id}" data-auth-only>${r.fact.manualFields.length || r.fact.needsReview ? '修改标记' : '标记'}</button></div><details data-post="${r.post_id}"${open.has(String(r.post_id)) ? ' open' : ''}><summary>提取依据${r.fact.prices.length ? ` · ${r.fact.prices.length} 个金额` : ''}</summary><p class="trade-evidence">${esc(r.memo || '此帖无 RSS 摘要')}</p><p class="analytics-caption">商家别名：${esc(r.fact.evidence.providers.map(p => `${p.aliases.join(' / ')} → ${p.name}`).join('；') || '未识别')} · ${esc(r.fact.evidence.source)}</p>${r.fact.prices.length ? `<div class="insight-table-scroll"><table class="insight-table"><thead><tr><th>原文</th><th>金额</th><th>币种</th><th>用途</th><th>周期</th><th>出处</th></tr></thead><tbody>${r.fact.prices.map(p => `<tr><td>${esc(p.text)}</td><td>${num(p.amount)}</td><td>${esc(p.currency)}</td><td>${esc(p.kind)}</td><td>${esc(p.period)}</td><td>${p.source === 'manual' ? '人工修正' : p.source === 'title' ? '标题' : 'RSS 摘要'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="analytics-caption">未识别出明确金额表达</p>'}${r.fact.delivery.length ? `<p class="analytics-caption">交付相关提及：${esc(r.fact.delivery.join(' · '))}（未判断费用承担及可用性）</p>` : ''}</details></article>`).join('') || '<p class="trade-empty">没有符合条件的交易帖，请调整筛选条件。</p>';
        drawTrend();
    }
    async function load() {
        if (!visible()) return;
        controller?.abort(); controller = new AbortController(); const active = controller, id = ++sequence;
        lastLoad = Date.now(); el('tradeContent').setAttribute('aria-busy', 'true');
        const timer = setTimeout(() => active.abort(), 15000);
        try {
            const response = await fetch('/api/stats/trades?' + new URLSearchParams(state), { signal: active.signal, cache: 'no-store' });
            const result = await response.json(); if (!response.ok || !result.success) throw new Error('读取失败');
            if (id !== sequence || !visible()) return;
            data = result.data; state.page = data.page;
            const next = JSON.stringify({ ...data, updatedAt: undefined });
            if (next !== signature) { signature = next; render(); }
            el('tradeError').hidden = true;
        } catch (error) { if (id === sequence && visible()) el('tradeError').hidden = false; }
        finally { clearTimeout(timer); if (id === sequence) el('tradeContent').setAttribute('aria-busy', 'false'); }
    }
    function update(key, value) { state[key] = value; state.page = 1; signature = null; load(); }
    document.addEventListener('DOMContentLoaded', () => {
        if (!el('tradesPage')) return;
        for (const [id, key] of [['tradeProvider', 'provider'], ['tradeRegion', 'region'], ['tradeIntent', 'intent'], ['tradeAsset', 'asset'], ['tradePriceGroup', 'priceGroup']]) el(id).addEventListener('change', e => update(key, e.target.value));
        el('tradeSearch').addEventListener('input', e => { clearTimeout(debounce); debounce = setTimeout(() => update('q', e.target.value), 300); });
        el('tradeRanges').onclick = e => { const b = e.target.closest('[data-days]'); if (!b) return; el('tradeRanges').querySelectorAll('button').forEach(n => { n.classList.toggle('active', n === b); n.setAttribute('aria-pressed', String(n === b)); }); update('days', Number(b.dataset.days)); };
        el('tradeContent').addEventListener('click', e => { const label = e.target.closest('[data-trade-label]'); if (label) window.SeekFeedTradeLabels.open(data.records.find(r => r.post_id === Number(label.dataset.tradeLabel)), () => { signature = null; load(); }); const b = e.target.closest('[data-facet]'); if (b) update(b.dataset.facet, state[b.dataset.facet] === b.dataset.value ? '' : b.dataset.value); });
        el('tradeLabelsManage').onclick = () => window.SeekFeedTradeLabels.manage(() => { signature = null; load(); });
        el('tradeReset').onclick = () => { clearTimeout(debounce); state = initial(); signature = null; el('tradeSearch').value = ''; el('tradeRanges').querySelectorAll('button').forEach(n => { n.classList.toggle('active', n.dataset.days === '0'); n.setAttribute('aria-pressed', String(n.dataset.days === '0')); }); load(); };
        el('tradeRefresh').onclick = e => window.SeekFeedControls.pending(e.currentTarget, load);
        el('tradePrev').onclick = () => { state.page--; load(); }; el('tradeNext').onclick = () => { state.page++; load(); };
        el('tradeTrendStyle').onclick = e => { const b = e.target.closest('[data-style]'); if (!b) return; style = b.dataset.style; el('tradeTrendStyle').querySelectorAll('button').forEach(n => { n.classList.toggle('active', n === b); n.setAttribute('aria-pressed', String(n === b)); }); drawTrend(); };
        new ResizeObserver(drawTrend).observe(el('tradeTrend'));
        setInterval(() => { if (visible() && Date.now() - lastLoad >= 30000) load(); }, 5000);
    });
    return { load };
})();
