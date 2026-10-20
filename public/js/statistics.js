/* Operational analytics use one publication-time cohort across every panel. */
window.SeekFeedStatistics = function ({ apiRequest, escapeHtml: esc, renderIcon: icon, getCategoryName, isLoggedIn }) {
    const el = id => document.getElementById(id);
    const number = value => Number(value || 0).toLocaleString('zh-CN');
    const percent = (part, total) => total ? `${(part / total * 100).toFixed(1).replace(/\.0$/, '')}%` : '—';
    let days = -1, requestId = 0, lastLoad = 0, inflight = false, currentData = null, chartKey = '', focusIndex = -1;
    const offset = -new Date().getTimezoneOffset();
    const shortTime = date => new Date(new Date(date).getTime() + offset * 60000);
    const label = (date, hourly) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', ...(hourly ? { hour: '2-digit', minute: '2-digit', hour12: false } : { month: 'numeric', day: 'numeric' }) }).format(shortTime(date));

    const timezone = `UTC${offset >= 0 ? '+' : '−'}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`;
    const dateTime = date => new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(shortTime(date));
    const dateOnly = date => label(date, false);
    const rangeText = period => `${dateTime(period.from)} — ${dateTime(period.to)} · ${timezone}`;
    function bucketText(point, axis = false) {
        const p = currentData.period, start = new Date(point.time).getTime();
        const nominalEnd = start + (p.hourly ? 3600000 : p.stepDays * 86400000);
        const end = Math.max(start, Math.min(nominalEnd, new Date(p.to).getTime()));
        const partial = end < nominalEnd;
        if (axis) {
            return p.hourly ? label(start, true) : dateOnly(start);
        }
        const endTime = label(end, true);
        return `${dateTime(start)} — ${p.hourly ? endTime : dateTime(end)}${partial ? '（截至目前）' : ''}`;
    }

    function showReadout(point) {
        const total = currentData.totals;
        el('analyticsTrendReadout').textContent = point
            ? `${bucketText(point)} · 收录 ${number(point.count)} 篇`
            : `共收录 ${number(total.posts)} 篇`;
    }

    function renderTrend() {
        const box = el('analyticsTrend');
        if (!currentData || box.clientWidth < 10) return;
        const data = currentData.trend;
        if (!data.length) {
            box.innerHTML = empty('所选时段暂无发帖数据');
            box.removeAttribute('tabindex');
            box.onpointermove = box.onpointerleave = box.onfocus = box.onblur = box.onkeydown = null;
            return;
        }
        const max = Math.max(...data.map(row => row.count), 1);
        const slot = Math.max(38, number(max).length * 7 + 22);
        const width = Math.max(box.clientWidth, 45 + data.length * slot), height = 228, left = 33, right = width - 12, top = 34, bottom = 196;
        const ceiling = Math.max(4, Math.ceil(max / 4) * 4);
        const step = (right - left) / data.length, barWidth = Math.min(34, step * .64);
        const x = index => left + step * (index + .5);
        const y = value => bottom - value / ceiling * (bottom - top);
        const bars = data.map((row, index) => {
            const start = x(index) - barWidth / 2, end = start + barWidth, barTop = y(row.count);
            const radius = Math.min(4, barWidth / 2, bottom - barTop);
            const path = `M${start},${bottom} V${barTop + radius} Q${start},${barTop} ${start + radius},${barTop} H${end - radius} Q${end},${barTop} ${end},${barTop + radius} V${bottom} Z`;
            const value = number(row.count), labelWidth = Math.max(28, value.length * 7 + 14);
            return `<path class="analytics-post-bar" data-bar-index="${index}" data-count="${row.count}" d="${path}"/>
                <g class="analytics-bar-label" data-label-index="${index}"><rect x="${x(index) - labelWidth / 2}" y="${barTop - 28}" width="${labelWidth}" height="21" rx="5"/><text class="analytics-bar-value" x="${x(index)}" y="${barTop - 17.5}" text-anchor="middle" dominant-baseline="central">${value}</text></g>`;
        }).join('');
        const grid = Array.from({ length: 5 }, (_, index) => {
            const value = ceiling * index / 4;
            return `<line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}" class="analytics-grid-line"/><text x="${left - 8}" y="${y(value) + 4}" text-anchor="end">${number(value)}</text>`;
        }).join('');
        const capacity = Math.max(2, Math.floor((right - left) / 60));
        const minimumStride = Math.ceil(data.length / capacity);
        const strides = currentData.period.hourly ? [1, 2, 3, 4, 6, 12, 24] : [1, 2, 5, 7, 14, 30, 60];
        const stride = strides.find(value => value >= minimumStride) || minimumStride;
        const ticks = data.map((_, index) => index).filter(index => index % stride === 0);
        box.innerHTML = `<div class="analytics-plot-scroll"><div class="analytics-plot-canvas" style="width:${width}px"><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">${grid}
            <rect id="analyticsCursor" y="${top}" width="${step}" height="${bottom - top}" class="analytics-bar-cursor" visibility="hidden" rx="4"/>${bars}
            ${ticks.map(index => `<text class="analytics-time-tick" x="${x(index)}" y="220" text-anchor="middle">${bucketText(data[index], true)}</text>`).join('')}
            </svg><div class="analytics-chart-tooltip" id="analyticsTrendTooltip" aria-hidden="true" hidden><span></span><div><i></i>收录帖子<strong></strong></div></div></div></div>`;
        box.setAttribute('role', 'group');
        box.setAttribute('tabindex', '0');
        box.setAttribute('aria-label', `发帖趋势柱形图，${data.length} 个时间段。使用左右方向键查看数据。`);
        const columns = [...box.querySelectorAll('.analytics-post-bar')], labels = [...box.querySelectorAll('.analytics-bar-label')], tooltip = el('analyticsTrendTooltip'), scroller = box.querySelector('.analytics-plot-scroll');
        let selected = -1;
        function select(index) {
            focusIndex = Math.max(0, Math.min(data.length - 1, index));
            const cursor = el('analyticsCursor');
            cursor.setAttribute('visibility', 'visible');
            cursor.setAttribute('x', left + step * focusIndex);
            if (selected >= 0) { columns[selected].removeAttribute('data-active'); labels[selected].removeAttribute('data-active'); }
            columns[focusIndex].setAttribute('data-active', 'true');
            labels[focusIndex].setAttribute('data-active', 'true');
            selected = focusIndex;
            showReadout(data[focusIndex]);
            tooltip.firstElementChild.textContent = bucketText(data[focusIndex]);
            tooltip.querySelector('strong').textContent = number(data[focusIndex].count) + ' 篇';
            tooltip.hidden = false;
            if (document.activeElement === box) {
                const start = Math.max(0, x(focusIndex) - slot / 2 - 8), end = x(focusIndex) + slot / 2 + 8;
                if (focusIndex === 0) scroller.scrollLeft = 0;
                else if (start < scroller.scrollLeft) scroller.scrollLeft = start;
                else if (end > scroller.scrollLeft + box.clientWidth) scroller.scrollLeft = end - box.clientWidth;
            }
            tooltip.style.left = `${Math.max(scroller.scrollLeft + 8, Math.min(scroller.scrollLeft + box.clientWidth - tooltip.offsetWidth - 8, x(focusIndex) - tooltip.offsetWidth / 2))}px`;
            tooltip.style.top = `${Math.max(0, y(data[focusIndex].count) - tooltip.offsetHeight - 10)}px`;
            box.setAttribute('aria-label', el('analyticsTrendReadout').textContent + '。左右方向键查看相邻时间段。');
        }
        function clearSelection() {
            el('analyticsCursor').setAttribute('visibility', 'hidden'); tooltip.hidden = true;
            if (selected >= 0) { columns[selected].removeAttribute('data-active'); labels[selected].removeAttribute('data-active'); }
            selected = -1; showReadout();
        }
        box.onpointermove = event => select(Math.floor((event.clientX - box.getBoundingClientRect().left + scroller.scrollLeft - left) / step));
        box.onpointerleave = () => { if (document.activeElement !== box) clearSelection(); };
        box.onfocus = () => select(focusIndex < 0 ? data.length - 1 : focusIndex);
        box.onblur = clearSelection;
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
        const values = Array(168).fill(0), dates = new Map();
        const p = data.period;
        if (p.calendarDays <= 7) {
            for (let time = new Date(p.from).getTime(); time <= new Date(p.to).getTime(); time += 86400000) {
                dates.set((shortTime(time).getUTCDay() + 6) % 7, dateOnly(time));
            }
        }
        el('analyticsActivityScope').textContent = `${rangeText(p)}${p.calendarDays > 7 ? ' · 同一星期、时段合计' : ''}`;
        for (const row of data.activity) values[((row.weekday + 6) % 7) * 24 + row.hour] = row.count;
        const rowDays = p.calendarDays <= 7 ? [...dates.keys()] : names.map((_, index) => index);
        const visibleIndices = rowDays.flatMap(day => Array.from({length:24}, (_, hour) => day * 24 + hour));
        const max = Math.max(...values, 0), box = el('analyticsActivity');
        let selected = document.activeElement === box && box.dataset.selected !== undefined ? Number(box.dataset.selected) : values.indexOf(max);
        if (!visibleIndices.includes(selected)) selected = visibleIndices[0];
        const text = index => {
            const day = Math.floor(index / 24), hour = index % 24;
            return `${dates.has(day) ? dates.get(day) + ' ' : ''}周${names[day]} ${String(hour).padStart(2, '0')}:00–${String(hour + 1).padStart(2, '0')}:00${p.calendarDays > 7 ? '（各周合计）' : ''} · ${number(values[index])} 篇`;
        };
        box.innerHTML = '<span></span>' + Array.from({ length: 8 }, (_, index) => `<span class="analytics-heatmap-hour" style="grid-column:span 3">${String(index * 3).padStart(2, '0')}:00</span>`).join('') + rowDays.map(day => `<span class="analytics-heatmap-day">${dates.has(day) ? dates.get(day) + ' ' : ''}周${names[day]}</span>` + Array.from({ length: 24 }, (_, hour) => {
            const index = day * 24 + hour, count = values[index];
            return `<i data-index="${index}" data-level="${count ? Math.max(1, Math.ceil(count / max * 4)) : 0}" title="${text(index)}"></i>`;
        }).join('')).join('');
        el('analyticsPeak').textContent = max ? `最活跃：${text(values.indexOf(max))}` : '所选时段暂无发帖记录';
        const select = index => {
            selected = visibleIndices.includes(index) ? index : visibleIndices[0];
            box.dataset.selected = String(selected);
            box.querySelector('.heatmap-selected')?.classList.remove('heatmap-selected');
            box.querySelector(`[data-index="${selected}"]`).classList.add('heatmap-selected');
            el('analyticsActivityReadout').textContent = text(selected);
            box.setAttribute('aria-label', text(selected) + '。方向键查看相邻时段。');
        };
        el('analyticsActivityReadout').textContent = '每格 1 小时';
        box.onpointermove = event => { const cell = event.target.closest('[data-index]'); if (cell) select(Number(cell.dataset.index)); };
        box.onfocus = () => select(selected);
        box.onpointerleave = box.onblur = () => { if (document.activeElement !== box) { box.querySelector('.heatmap-selected')?.classList.remove('heatmap-selected'); el('analyticsActivityReadout').textContent = '每格 1 小时'; } };
        box.onkeydown = event => {
            const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -24, ArrowDown: 24 }[event.key];
            if (delta === undefined) return;
            event.preventDefault(); select(visibleIndices[Math.max(0, Math.min(visibleIndices.length - 1, visibleIndices.indexOf(selected) + delta))]);
        };
        if (document.activeElement === box) select(selected);
    }
    function render(data) {
        currentData = data;
        const { totals: t, period: p } = data;
        const range = rangeText(p);
        el('analyticsPeriodLabel').textContent = `${days === -1 ? '今日' : days === 0 ? '全部记录' : `近 ${days} 天`} · ${range}`;
        el('analyticsTimezone').textContent = '按发帖时间';
        for (const [id, value] of Object.entries({ analyticsPosts: t.posts, analyticsAuthors: t.authors, analyticsCategoriesTotal: data.categories.length })) el(id).textContent = number(value);
        el('analyticsDailyAverage').textContent = (t.posts / p.calendarDays).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
        el('analyticsDailyDetail').textContent = `覆盖 ${number(p.calendarDays)} 个自然日`;
        el('analyticsPostsDetail').textContent = `峰值 ${number(Math.max(...data.trend.map(row => row.count), 0))} 篇 / ${p.hourly ? '小时' : p.stepDays > 1 ? `${p.stepDays} 天` : '天'}`;
        el('analyticsCategoryDetail').textContent = data.categories.length ? `${getCategoryName(data.categories[0].category)}占 ${percent(data.categories[0].count, t.posts)}` : '暂无分类记录';
        el('analyticsAuthorsDetail').textContent = t.authors ? `人均 ${(data.authorDistribution.reduce((sum, row) => sum + row.posts, 0) / t.authors).toFixed(1)} 篇` : '暂无发帖记录';
        el('analyticsTrendUnit').textContent = `${p.hourly ? '每小时' : p.stepDays > 1 ? `每 ${p.stepDays} 天` : '每天'} · ${timezone}`;
        const nextKey = JSON.stringify([data.trend, p.days]);
        if (chartKey !== nextKey || !el('analyticsTrend').firstElementChild) { chartKey = nextKey; focusIndex = -1; renderTrend(); showReadout(); }
        renderCategories(data);
        renderCategoryOverview(data);
        renderAuthorDistribution(data);
        el('analyticsAuthorList').innerHTML = data.authors.length ? data.authors.map((row, index) => `<div class="analytics-author-row"><span class="analytics-rank">${index + 1}</span><span class="analytics-avatar">${esc(Array.from(row.creator)[0])}</span><span class="analytics-author-name" title="${esc(row.creator)}">${esc(row.creator)}</span><strong>${number(row.count)}<small>篇</small></strong></div>`).join('') : empty('所选时段暂无作者');
        renderActivity(data);
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
        const result = await apiRequest(`/api/stats/analytics?${query}`, { silent: true });
        if (request !== requestId) return;
        inflight = false;
        el('analyticsContent').setAttribute('aria-busy', 'false');
        el('analyticsError').hidden = !!result?.success;
        if (!result?.success) { el('analyticsPeriodLabel').textContent = currentData ? '更新失败，显示上次数据' : '暂时无法读取统计'; return; }
        render(result.data);
    }

    let notificationDays = 7, notificationLoad = 0, notificationBusy = false, notificationRequest = 0;
    async function loadNotifications() {
        if (!isLoggedIn) return;
        const request = ++notificationRequest;
        notificationBusy = true; notificationLoad = Date.now();
        const query = `days=${notificationDays}&offset=${offset}`;
        const [result, ranking] = await Promise.all([
            apiRequest(`/api/stats/analytics?${query}`, { silent: true }),
            apiRequest(`/api/stats/subscription-ranking?${query}`, { silent: true }),
        ]);
        if (request !== notificationRequest) return;
        notificationBusy = false;
        if (!result?.success || !ranking?.success) {
            el('subscriptionAnalyticsScope').textContent = '统计更新失败，稍后自动重试';
            return;
        }
        const data = result.data;
        el('subscriptionAnalyticsScope').textContent = rangeText(data.period);
        el('analyticsSubscriptionsCount').textContent = `${number(data.subscriptions.active)} 条监控中 · ${number(data.subscriptions.total)} 条订阅`;
        renderDelivery(data);
        renderRanking(ranking.data.ranking);
        const rules = ranking.data.ruleStats;
        el('analyticsRuleSummary').innerHTML = [['监控中', rules.active], ['本时段有命中', rules.withHits], ['本时段无命中', rules.active - rules.withHits]].map(([name, count]) => `<div><span>${name}</span><strong>${number(count)}</strong></div>`).join('');
    }

    return {
        load,
        loadNotifications,
        init() {
            el('notificationRangeSelector').querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
                const next = Number(button.dataset.days);
                if (notificationDays === next) return;
                notificationDays = next;
                el('notificationRangeSelector').querySelectorAll('button').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
                loadNotifications();
            }));
            el('chartRangeSelector').querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
                const next = Number(button.dataset.days);
                if (days === next) return;
                days = next;
                el('chartRangeSelector').querySelectorAll('button').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
                load();
            }));
            el('retryAnalytics').addEventListener('click', event => window.SeekFeedControls.pending(event.currentTarget, () => load()));
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
        tick() {
            if (!el('statsPage').hidden && !inflight && Date.now() - lastLoad >= 30000) load(true);
            if (!el('subscriptionsPage').hidden && !notificationBusy && Date.now() - notificationLoad >= 30000) loadNotifications();
        },
    };
};
