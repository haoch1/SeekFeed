/* Operational analytics use one publication-time cohort across every panel. */
window.SeekFeedStatistics = function ({ apiRequest, escapeHtml: esc, renderIcon: icon, getCategoryName, isLoggedIn }) {
    const el = id => document.getElementById(id);
    const number = value => Number(value || 0).toLocaleString('zh-CN');
    const percent = (part, total) => total ? `${(part / total * 100).toFixed(1).replace(/\.0$/, '')}%` : '—';
    let days = -1, requestId = 0, lastLoad = 0, inflight = false, currentData = null, chartKey = '', focusIndex = -1;
    const offset = -new Date().getTimezoneOffset();
    const shortTime = date => new Date(new Date(date).getTime() + offset * 60000);
    const label = (date, hourly) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', ...(hourly ? { hour: '2-digit', minute: '2-digit', hour12: false } : { month: 'numeric', day: 'numeric' }) }).format(shortTime(date));

    function showReadout(point) {
        const total = currentData.totals;
        el('analyticsTrendReadout').textContent = point
            ? `${label(point.time, currentData.period.hourly)} · 收录 ${number(point.count)} 篇`
            : `共收录 ${number(total.posts)} 篇`;
    }

    function renderTrend() {
        const box = el('analyticsTrend');
        if (!currentData || box.clientWidth < 10) return;
        const data = currentData.trend;
        const width = box.clientWidth, height = 220, left = 33, right = width - 12, top = 14, bottom = 190;
        const max = Math.max(...data.map(row => row.count), 1);
        const ceiling = Math.max(4, Math.ceil(max / 4) * 4);
        const x = index => left + (right - left) * (data.length === 1 ? .5 : index / (data.length - 1));
        const y = value => bottom - value / ceiling * (bottom - top);
        const path = key => data.map((row, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)},${y(row[key]).toFixed(2)}`).join(' ');
        const line = path('count');
        const grid = Array.from({ length: 5 }, (_, index) => {
            const value = ceiling * index / 4;
            return `<line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}" class="analytics-grid-line"/><text x="${left - 8}" y="${y(value) + 4}" text-anchor="end">${number(value)}</text>`;
        }).join('');
        const tickCount = Math.min(width < 400 ? 3 : 6, data.length);
        const ticks = [...new Set(Array.from({ length: tickCount }, (_, index) => Math.round(index * (data.length - 1) / Math.max(1, tickCount - 1))))];
        box.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><defs><linearGradient id="analyticsFill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="var(--primary)" stop-opacity=".17"/><stop offset="1" stop-color="var(--primary)" stop-opacity=".015"/></linearGradient></defs>${grid}
            <path d="${line} L${x(data.length - 1)},${bottom} L${x(0)},${bottom} Z" fill="url(#analyticsFill)"/>
            <path d="${line}" class="analytics-series-posts"/>
            ${data.length === 1 ? `<circle cx="${x(0)}" cy="${y(data[0].count)}" r="4" fill="var(--primary)"/>` : ''}
            ${ticks.map(index => `<text x="${x(index)}" y="214" text-anchor="${index === 0 && data.length > 1 ? 'start' : index === data.length - 1 && data.length > 1 ? 'end' : 'middle'}">${label(data[index].time, currentData.period.hourly)}</text>`).join('')}
            <g id="analyticsCursor" visibility="hidden"><line y1="${top}" y2="${bottom}" class="analytics-cursor-line"/><circle r="4" class="analytics-cursor-dot"/></g></svg>`;
        box.setAttribute('role', 'group');
        box.setAttribute('tabindex', '0');
        box.setAttribute('aria-label', `发帖趋势，${data.length} 个时间段。使用左右方向键查看数据。`);
        function select(index) {
            focusIndex = Math.max(0, Math.min(data.length - 1, index));
            const cursor = el('analyticsCursor');
            cursor.setAttribute('visibility', 'visible');
            cursor.querySelector('line').setAttribute('x1', x(focusIndex));
            cursor.querySelector('line').setAttribute('x2', x(focusIndex));
            cursor.querySelector('circle').setAttribute('cx', x(focusIndex));
            cursor.querySelector('circle').setAttribute('cy', y(data[focusIndex].count));
            showReadout(data[focusIndex]);
            box.setAttribute('aria-label', el('analyticsTrendReadout').textContent + '。左右方向键查看相邻时间段。');
        }
        box.onpointermove = event => select(Math.round((event.clientX - box.getBoundingClientRect().left - left) / (right - left) * (data.length - 1)));
        box.onpointerleave = () => { if (document.activeElement !== box) { el('analyticsCursor').setAttribute('visibility', 'hidden'); showReadout(); } };
        box.onfocus = () => select(focusIndex < 0 ? data.length - 1 : focusIndex);
        box.onblur = () => { el('analyticsCursor').setAttribute('visibility', 'hidden'); showReadout(); };
        box.onkeydown = event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            select(event.key === 'Home' ? 0 : event.key === 'End' ? data.length - 1 : focusIndex + (event.key === 'ArrowRight' ? 1 : -1));
        };
        if (document.activeElement === box) select(focusIndex);
    }

    function empty(text) { return `<div class="analytics-empty">${icon('chart')}<span>${text}</span></div>`; }
    function renderCategories(data) {
        const query = el('analyticsCategorySearch').value.trim().toLocaleLowerCase();
        const rows = data.categories.filter(row => `${getCategoryName(row.category)} ${row.category}`.toLocaleLowerCase().includes(query));
        el('analyticsCategoryCount').textContent = query ? `${number(rows.length)} / ${number(data.categories.length)} 个分类` : `全部 ${number(data.categories.length)} 个分类`;
        el('analyticsCategoryRows').innerHTML = rows.map(row => `<tr><td><span class="analytics-category-name" title="${esc(getCategoryName(row.category))}">${esc(getCategoryName(row.category))}</span><div class="analytics-category-meter"><i style="width:${row.count / data.totals.posts * 100}%"></i></div></td><td>${number(row.count)}</td><td>${number(row.authors)}</td><td>${percent(row.count, data.totals.posts)}</td></tr>`).join('');
        el('analyticsCategoryEmpty').hidden = rows.length > 0;
        el('analyticsCategoryEmpty').textContent = data.categories.length ? '没有符合条件的分类' : '所选时段暂无帖子';
        el('analyticsCategoryLink').textContent = `全部 ${number(data.categories.length)} 个分类`;
    }
    function renderCategoryOverview(data) {
        const categories = data.categories.length > 5
            ? [...data.categories.slice(0, 4), { category: '其余分类', count: data.categories.slice(4).reduce((sum, row) => sum + row.count, 0), aggregate: true }]
            : data.categories;
        let position = 0;
        const stops = categories.map((row, index) => { const begin = position; position += row.count / data.totals.posts * 100; return `var(--analytics-color-${index}) ${begin}% ${position}%`; });
        el('analyticsDonut').style.background = data.totals.posts ? `conic-gradient(${stops.join(',')})` : 'var(--bg-hover)';
        el('analyticsCategoryShare').textContent = categories.length ? percent(categories[0].count, data.totals.posts) : '—';
        el('analyticsLeadingCategory').textContent = categories.length ? getCategoryName(categories[0].category) : '暂无分类';
        el('analyticsCategoryLegend').innerHTML = categories.length ? categories.map((row, index) => `<div><span title="${esc(getCategoryName(row.category))}"><i style="background:var(--analytics-color-${index})"></i><span>${esc(getCategoryName(row.category))}</span></span><strong>${number(row.count)}</strong><span>${percent(row.count, data.totals.posts)}</span></div>`).join('') : '<span class="analytics-caption">有帖子后显示分类分布</span>';
    }
    function renderAuthorDistribution(data) {
        const names = ['1 篇', '2–4 篇', '5–9 篇', '10 篇及以上'];
        const posts = data.authorDistribution.reduce((sum, row) => sum + row.posts, 0);
        el('analyticsAuthorDistribution').innerHTML = data.totals.authors ? names.map((name, band) => {
            const row = data.authorDistribution.find(row => row.band === band) || { authors: 0, posts: 0 };
            return `<div class="analytics-contribution-row"><div><span>${name}</span><span><strong>${number(row.authors)}</strong> 位作者 · <strong>${number(row.posts)}</strong> 篇</span></div><div class="analytics-bar"><i style="width:${posts ? row.posts / posts * 100 : 0}%;--bar-color:var(--analytics-color-${band})" ${row.posts ? '' : 'hidden'}></i></div></div>`;
        }).join('') : empty('所选时段暂无作者');
    }
    function renderDelivery(data) {
        const d = data.delivery;
        el('analyticsDeliverySample').textContent = `${number(d.samples)} 个样本`;
        if (!d.samples) { el('analyticsDelivery').innerHTML = empty('推送成功后显示时效分析'); return; }
        const duration = value => value < 60 ? `${Math.round(value)} 秒` : value < 3600 ? `${(value / 60).toFixed(1)} 分` : `${(value / 3600).toFixed(1)} 小时`;
        const rows = [['1 分钟内', d.underMinute], ['1–5 分钟', d.underFive], ['5–15 分钟', d.underFifteen], ['15 分钟以上', d.overFifteen]];
        el('analyticsDelivery').innerHTML = `<div class="analytics-latency-values"><div><span>中位延迟</span><strong>${duration(d.median)}</strong></div><div><span>P90 延迟</span><strong>${duration(d.p90)}</strong></div></div><div class="analytics-latency-bars">${rows.map(([name, count]) => `<div><span>${name}</span><div class="analytics-bar"><i style="width:${count / d.samples * 100}%;--bar-color:var(--analytics-pushed)" ${count ? '' : 'hidden'}></i></div><strong>${number(count)}</strong></div>`).join('')}</div>`;
    }
    function renderActivity(data) {
        const names = ['一', '二', '三', '四', '五', '六', '日'];
        const values = Array(168).fill(0);
        for (const row of data.activity) values[((row.weekday + 6) % 7) * 24 + row.hour] = row.count;
        const max = Math.max(...values, 0);
        const box = el('analyticsActivity');
        let selected = document.activeElement === box && box.dataset.selected !== undefined ? Number(box.dataset.selected) : values.indexOf(max);
        box.innerHTML = '<span></span>' + Array.from({ length: 24 }, (_, hour) => `<span class="analytics-heatmap-hour">${hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}</span>`).join('') + names.map((name, day) => `<span class="analytics-heatmap-day">周${name}</span>` + Array.from({ length: 24 }, (_, hour) => {
            const index = day * 24 + hour, count = values[index];
            return `<i data-index="${index}" data-level="${count ? Math.max(1, Math.ceil(count / max * 4)) : 0}" title="周${name} ${hour}:00 · ${number(count)} 篇"></i>`;
        }).join('')).join('');
        const text = index => `周${names[Math.floor(index / 24)]} ${String(index % 24).padStart(2, '0')}:00 · ${number(values[index])} 篇`;
        el('analyticsPeak').textContent = max ? `最活跃：${text(selected)}` : '所选时段暂无发帖记录';
        const select = index => {
            selected = Math.max(0, Math.min(167, index));
            box.dataset.selected = String(selected);
            box.querySelector('.heatmap-selected')?.classList.remove('heatmap-selected');
            box.querySelector(`[data-index="${selected}"]`).classList.add('heatmap-selected');
            el('analyticsActivityReadout').textContent = text(selected);
            box.setAttribute('aria-label', text(selected) + '。方向键查看相邻时段。');
        };
        el('analyticsActivityReadout').textContent = '每格代表一小时';
        box.onpointermove = event => { const cell = event.target.closest('[data-index]'); if (cell) select(Number(cell.dataset.index)); };
        box.onfocus = () => select(selected);
        box.onpointerleave = box.onblur = () => { if (document.activeElement !== box) { box.querySelector('.heatmap-selected')?.classList.remove('heatmap-selected'); el('analyticsActivityReadout').textContent = '每格代表一小时'; } };
        box.onkeydown = event => {
            const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -24, ArrowDown: 24 }[event.key];
            if (delta === undefined) return;
            event.preventDefault(); select(selected + delta);
        };
        if (document.activeElement === box) select(selected);
    }
    function render(data) {
        currentData = data;
        const { totals: t, period: p } = data;
        const rangeDate = date => new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' }).format(shortTime(date));
        const range = `${rangeDate(p.from)} — ${rangeDate(p.to)}`;
        el('analyticsPeriodLabel').textContent = `${days === -1 ? '今日' : days === 0 ? '全部记录' : `近 ${days} 天`} · ${range}`;
        el('analyticsTimezone').textContent = `UTC${offset >= 0 ? '+' : '−'}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`;
        for (const [id, value] of Object.entries({ analyticsPosts: t.posts, analyticsAuthors: t.authors, analyticsCategoriesTotal: data.categories.length })) el(id).textContent = number(value);
        el('analyticsDailyAverage').textContent = (t.posts / p.calendarDays).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
        el('analyticsDailyDetail').textContent = `覆盖 ${number(p.calendarDays)} 个自然日`;
        el('analyticsPostsDetail').textContent = `峰值 ${number(Math.max(...data.trend.map(row => row.count), 0))} 篇 / ${p.hourly ? '小时' : p.stepDays > 1 ? `${p.stepDays} 天` : '天'}`;
        el('analyticsCategoryDetail').textContent = data.categories.length ? `${getCategoryName(data.categories[0].category)}占 ${percent(data.categories[0].count, t.posts)}` : '暂无分类记录';
        el('analyticsAuthorsDetail').textContent = t.authors ? `人均 ${(data.authorDistribution.reduce((sum, row) => sum + row.posts, 0) / t.authors).toFixed(1)} 篇` : '暂无发帖记录';
        el('analyticsTrendUnit').textContent = p.hourly ? '按小时' : p.stepDays > 1 ? `每 ${p.stepDays} 天` : '按天';
        const nextKey = JSON.stringify([data.trend, p.days]);
        if (chartKey !== nextKey || !el('analyticsTrend').firstElementChild) { chartKey = nextKey; focusIndex = -1; renderTrend(); showReadout(); }
        renderCategories(data);
        renderCategoryOverview(data);
        renderAuthorDistribution(data);
        el('analyticsAuthorList').innerHTML = data.authors.length ? data.authors.map((row, index) => `<div class="analytics-author-row"><span class="analytics-rank">${index + 1}</span><span class="analytics-avatar">${esc(Array.from(row.creator)[0])}</span><span class="analytics-author-name" title="${esc(row.creator)}">${esc(row.creator)}</span><strong>${number(row.count)}<small>篇</small></strong></div>`).join('') : empty('所选时段暂无作者');
        el('analyticsSubscriptionsCount').textContent = `${number(data.subscriptions.active)} 条监控中 · ${number(data.subscriptions.total)} 条订阅`;
        renderActivity(data);
        renderDelivery(data);
        el('analyticsTopicSample').textContent = `${data.topics.limited ? '最近 ' : ''}${number(data.topics.sample)} 篇标题`;
        el('analyticsTopics').innerHTML = data.topics.terms.length ? data.topics.terms.map((row, index) => `<div class="analytics-topic-row"><span class="analytics-rank">${String(index + 1).padStart(2, '0')}</span><span class="analytics-topic-name" title="${esc(row.term)}">${esc(row.term)}</span><span class="analytics-topic-meter"><i style="width:${row.count / data.topics.terms[0].count * 100}%"></i></span><strong>${number(row.count)}</strong></div>`).join('') : empty('暂无重复出现的标题词');
    }

    function renderRanking(rows) {
        el('analyticsSubscriptionList').innerHTML = rows.length ? `<div class="analytics-table-wrap"><table class="analytics-table"><thead><tr><th>订阅</th><th>状态</th><th>命中</th><th>已推送</th></tr></thead><tbody>${rows.map(row => {
            const title = row.deleted ? '已删除订阅' : [row.keyword1, row.keyword2, row.keyword3].filter(Boolean).join(' + ') || row.creator || (row.category ? getCategoryName(row.category) : '全部分类');
            return `<tr><td><div class="analytics-rule"><span class="subscription-id"><span>#${Number(row.id)}</span></span><span class="analytics-rule-name" title="${esc(title)}">${esc(title)}</span></div></td><td><span class="analytics-state${row.deleted || !row.enabled ? ' is-muted' : ''}"><i></i>${row.deleted ? '已删除' : row.enabled ? '监控中' : '已暂停'}</span></td><td>${number(row.matched)}</td><td>${number(row.pushed)}</td></tr>`;
        }).join('')}</tbody></table></div>` : empty('添加订阅后，在这里查看命中表现');
    }

    async function load(silent = false) {
        const request = ++requestId;
        inflight = true; lastLoad = Date.now();
        const query = `days=${days}&offset=${offset}`;
        if (!silent) el('analyticsContent').setAttribute('aria-busy', 'true');
        const [result, ranking] = await Promise.all([
            apiRequest(`/api/stats/analytics?${query}`, { silent: true }),
            isLoggedIn ? apiRequest(`/api/stats/subscription-ranking?${query}`, { silent: true }) : null,
        ]);
        if (request !== requestId) return;
        inflight = false;
        el('analyticsContent').setAttribute('aria-busy', 'false');
        el('analyticsError').hidden = !!result?.success;
        if (!result?.success) { el('analyticsPeriodLabel').textContent = currentData ? '更新失败，显示上次数据' : '暂时无法读取统计'; return; }
        render(result.data);
        if (!isLoggedIn) el('analyticsSubscriptionList').innerHTML = empty('登录后查看订阅表现');
        else if (ranking?.success) {
            renderRanking(ranking.data.ranking);
            const rules = ranking.data.ruleStats;
            el('analyticsRuleSummary').innerHTML = [['监控中', rules.active], ['本时段有命中', rules.withHits], ['本时段无命中', rules.active - rules.withHits]].map(([name, count]) => `<div><span>${name}</span><strong>${number(count)}</strong></div>`).join('');
        } else { el('analyticsRuleSummary').textContent = ''; el('analyticsSubscriptionList').innerHTML = empty('订阅表现暂时不可用，请重试'); }
    }

    return {
        load,
        init() {
            el('chartRangeSelector').querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
                const next = Number(button.dataset.days);
                if (days === next) return;
                days = next;
                el('chartRangeSelector').querySelectorAll('button').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
                load();
            }));
            el('retryAnalytics').addEventListener('click', () => load());
            el('analyticsCategorySearch').addEventListener('input', () => { if (currentData) renderCategories(currentData); });
            el('analyticsCategoryLink').addEventListener('click', event => {
                event.preventDefault();
                el('analyticsCategorySearch').value = '';
                if (currentData) renderCategories(currentData);
                el('analyticsCategoryCard').scrollIntoView({ block: 'start' });
                el('analyticsCategorySearch').focus({ preventScroll: true });
            });
            let width = 0;
            new ResizeObserver(entries => { const next = Math.round(entries[0].contentRect.width); if (next > 0 && next !== width) { width = next; renderTrend(); } }).observe(el('analyticsTrend'));
        },
        tick() { if (!el('statsPage').hidden && !inflight && Date.now() - lastLoad >= 30000) load(true); },
    };
};
