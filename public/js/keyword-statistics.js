/* Focused, literal keyword cohorts: the selected date is independent of overview range. */
window.SeekFeedKeywordAnalysis = function ({ apiRequest, escapeHtml: esc, getCategoryName }) {
    const el = id => document.getElementById(id), number = n => Number(n || 0).toLocaleString('zh-CN');
    const offset = -new Date().getTimezoneOffset();
    const localDate = () => new Date(Date.now() + offset * 60000).toISOString().slice(0, 10);
    const share = (count, total) => total > 0 ? count / total * 100 : null;
    const percentage = value => value === null ? '—' : value > 0 && value < .1 ? '＜0.1%' : value.toFixed(1).replace(/\.0$/, '') + '%';
    const percent = (count, total) => percentage(share(count, total));
    let data, selected = 0, hours = 1, request = 0, lastLoad = 0, busy = false, controller, config, chartIndex = 0, collapsed = false, draft = false;
    let hourStyle = 'bar', dailyStyle = 'line', hourMetric = 'count', dailyMetric = 'count';
    const plotted = (count, total, metric) => metric === 'share' ? share(count, total) : count;
    const valueLabel = (value, metric) => metric === 'share' ? percentage(value) : number(value);
    const ceilingFor = (values, metric) => {
        const max = Math.max(...values.filter(value => value !== null), 0);
        return metric === 'count' ? Math.max(4, Math.ceil(max / 4) * 4) : max ? [.1, .2, .5, 1, 2, 5, 10, 20, 25, 50, 75, 100].find(value => value >= max) || 100 : 100;
    };
    const axisLabel = (value, metric) => metric === 'share' ? number(Number(value.toFixed(3))) + '%' : number(value);
    const totalLabel = total => total === null ? '总帖数暂不可用' : `总发帖 ${number(total)} 篇${total ? '' : ' · 无收录数据'}`;
    const dailyTotal = index => data.baseline?.daily?.[index]?.count ?? null;
    const lineSegments = (values, x, y) => {
        const segments = []; let points = [];
        for (let index = 0; index < values.length; index++) {
            if (values[index] === null) { if (points.length) segments.push(points.join(' ')); points = []; }
            else points.push(`${x(index)},${y(values[index])}`);
        }
        if (points.length) segments.push(points.join(' '));
        return segments;
    };
    function emptyShare(box, values, metric) {
        if (metric !== 'share' || values.some(value => value !== null)) return;
        const hint = document.createElement('p');
        hint.className = 'keyword-share-empty';
        hint.textContent = '暂无收录数据，无法计算发帖占比';
        box.appendChild(hint);
    }
    const selectedTerm = () => data.series[selected];
    const normalize = term => (term || '').normalize('NFKC').toLocaleLowerCase('zh-CN').trim();
    const color = index => `var(--analytics-color-${index})`;
    const time = hour => String(hour).padStart(2, '0') + ':00';
    const legend = () => data.series.map((row, index) => `<span title="${esc(row.term)}"><i class="keyword-series-key series-${index}" style="--series-color:${color(index)}"></i><span>${esc(row.term)}</span></span>`).join('');
    const marker = (index, cx, cy) => index === 1 ? `<rect x="${cx - 3.5}" y="${cy - 3.5}" width="7" height="7" rx="1"/>` : index === 2 ? `<path d="M${cx},${cy - 4.5}l4.5,4.5 -4.5,4.5 -4.5,-4.5Z"/>` : `<circle cx="${cx}" cy="${cy}" r="3.5"/>`;
    function cancelRequest() {
        ++request;
        controller?.abort();
        busy = false;
        el('keywordAnalysisResults').setAttribute('aria-busy', 'false');
    }
    function compareVisible(index, visible) {
        el('analysisCompareField' + index).hidden = el('analysisCompare' + index).hidden = !visible;
        el('keywordAddCompare').hidden = !el('analysisCompare2').hidden;
    }
    function removeCompare(index) {
        cancelRequest();
        const active = data?.series[selected]?.term;
        if (index === 1) el('analysisCompare1').value = el('analysisCompare2').value;
        el('analysisCompare2').value = '';
        if (index === 1 && !el('analysisCompare2').hidden) compareVisible(2, false);
        else {
            el('analysisCompare' + index).value = '';
            compareVisible(index, false);
        }
        if (config) {
            config = { ...config, compare1: index === 1 ? config.compare2 : config.compare1, compare2: '' };
            const remaining = new Set([config.q, config.compare1].map(normalize).filter(Boolean));
            if (data) {
                data = { ...data, series: data.series.filter(row => remaining.has(normalize(row.term))), overlaps: data.overlaps.filter(row => row.terms.every(term => remaining.has(normalize(term)))) };
                selected = Math.max(0, data.series.findIndex(row => row.term === active));
                if (data.series.length) render();
                else { clearChartInspections(); data = undefined; el('keywordAnalysisResults').hidden = true; }
            }
        }
        (el('keywordAddCompare').hidden ? el('analysisCompare1') : el('keywordAddCompare')).focus({ preventScroll: true });
    }
    function clearChartInspections() {
        for (const id of ['keywordHourChart', 'keywordDailyChart']) {
            const chart = el(id);
            window.SeekFeedControls.chartInspection(chart);
            chart.onpointerdown = chart.onpointermove = chart.onpointerleave = chart.onclick = chart.onkeydown = chart.onfocus = chart.onblur = null;
        }
    }
    function reset() {
        clearChartInspections();
        el('keywordAuthorLimit').value = '5';
        cancelRequest();
        data = config = undefined;
        draft = false;
        selected = chartIndex = 0; hours = 1; lastLoad = 0;
        el('keywordAnalysisForm').reset();
        el('analysisDate').value = el('analysisDate').max = localDate();
        compareVisible(1, false); compareVisible(2, false);
        el('keywordAnalysisResults').hidden = true;
        for (const id of ['keywordComparison', 'keywordMetrics', 'keywordOverlap', 'keywordHourChart', 'keywordDailyChart', 'keywordCategories', 'keywordAuthors']) el(id).replaceChildren();
        el('keywordBucketSelector').querySelectorAll('button').forEach(button => {
            const active = button.dataset.hours === '1';
            button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
        });
        el('keywordAnalysisStatus').textContent = '输入关键词，查看全天与各时段的发帖分布。';
        window.SeekFeedControls.refreshSelects();
        if (!collapsed) el('analysisKeyword').focus({ preventScroll: true });
    }
    function renderAuthors(series) {
        const rows = series.topAuthors.slice(0, Number(el('keywordAuthorLimit').value));
        el('keywordAuthors').scrollTop = 0;
        el('keywordAuthors').innerHTML = rows.length ? rows.map((row, index) => `<div class="keyword-rank-row"><span class="keyword-rank">${String(index + 1).padStart(2, '0')}</span><span class="keyword-author-name">${esc(row.creator)}</span><span><strong>${number(row.count)}<small>篇</small></strong><small>${percent(row.count, series.total)}</small></span></div>`).join('') : '<p class="keyword-no-data">暂无作者记录</p>';
    }
    function renderCategoryChart(series) {
        window.SeekFeedCategoryBreakdown(el('keywordCategories'), series.categories, series.total, { escapeHtml: esc, getCategoryName });
    }
    function chartTooltip(box) {
        const tooltip = document.createElement('div');
        tooltip.className = 'analytics-chart-tooltip keyword-chart-tooltip';
        tooltip.setAttribute('aria-hidden', 'true');
        tooltip.hidden = true;
        box.appendChild(tooltip);
        return {
            hide() { tooltip.hidden = true; },
            show(label, values, total, cx, cy, pinned = false) {
                tooltip.innerHTML = `<span>${esc(label)}</span><span class="keyword-tooltip-total">${totalLabel(total)}</span>${data.series.map((series, i) => `<div><i style="background:${color(i)}"></i><span title="${esc(series.term)}">${esc(series.term)}</span><strong>${number(values[i])} 篇<small>${percent(values[i], total)}</small></strong></div>`).join('')}`;
                tooltip.hidden = false;
                tooltip.dataset.pinned = String(pinned);
                tooltip.style.left = `${Math.max(6, Math.min(box.clientWidth - tooltip.offsetWidth - 6, cx - tooltip.offsetWidth / 2))}px`;
                tooltip.style.top = `${Math.max(0, cy - tooltip.offsetHeight - 12)}px`;
            },
        };
    }
    function renderDailyChart() {
        const metric = dailyMetric;
        const box = el('keywordDailyChart');
        if (!data || !box.clientWidth) return;
        const scrollLeft = box.querySelector('.keyword-line-scroll')?.scrollLeft || 0;
        const rows = data.series[0].daily, multiple = data.series.length > 1;
        const values = data.series.map(series => series.daily.map((row, index) => plotted(row.count, dailyTotal(index), metric)));
        const expanded = !!box.closest('.chart-expanded');
        const width = expanded ? box.clientWidth : Math.max(box.clientWidth, 7 * (dailyStyle === 'bar' ? Math.max(42, data.series.length * 22 + 14) : 34) + 36), height = expanded ? Math.max(178, Math.min(420, innerHeight * .5)) : 178;
        box.style.height = `${height + 58}px`;
        const showAxis = dailyStyle === 'bar' || metric === 'share';
        const left = metric === 'share' ? 46 : showAxis ? 32 : 10, right = width - 26, top = 26, bottom = height - 24, step = (right - left) / rows.length;
        const barStep = Math.min(22, step * .8 / data.series.length), barWidth = Math.min(18, barStep * .72);
        const barX = (index, termIndex) => x(index) + (termIndex - (data.series.length - 1) / 2) * barStep;
        box.dataset.chartStyle = dailyStyle; box.dataset.metric = metric;
        const ceiling = ceilingFor(values.flat(), metric);
        const x = index => left + (index + .5) * step, y = value => bottom - value / ceiling * (bottom - top);
        // End labels are separated vertically so equal/near-equal series stay legible.
        const endLabels = values.map((rows, index) => rows[6] === null ? null : { index, y: y(rows[6]) - 12 }).filter(Boolean).sort((a, b) => a.y - b.y);
        endLabels.forEach((label, index) => { label.y = Math.max(12, label.y, index ? endLabels[index - 1].y + 17 : 0); });
        const labelY = index => endLabels.find(label => label.index === index).y;
        const counts = index => `${totalLabel(dailyTotal(index))}；` + data.series.map(series => `${series.term} ${number(series.daily[index].count)} 篇 · ${percent(series.daily[index].count, dailyTotal(index))}`).join('；');
        box.innerHTML = `<div class="keyword-line-scroll"><div class="keyword-line-canvas" style="width:${width}px"><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(rows.map((row, index) => `${row.date}：${counts(index)}`).join('。'))}">${[0, .5, 1].map(ratio => `<line x1="${left}" x2="${right}" y1="${y(ceiling * ratio)}" y2="${y(ceiling * ratio)}" class="analytics-grid-line"/>${showAxis ? `<text class="keyword-axis-label" x="${left - 7}" y="${y(ceiling * ratio) + 4}" text-anchor="end">${axisLabel(ceiling * ratio, metric)}</text>` : ''}`).join('')}${data.series.map((series, termIndex) => {
            const segmentPoints = lineSegments(values[termIndex], x, y);
            if (dailyStyle === 'bar') return `<g data-trend-series="${termIndex}" class="keyword-trend-series series-${termIndex}" style="--series-color:${color(termIndex)}">${series.daily.map((row, index) => {
                const value = values[termIndex][index];
                return value === null ? '' : `<g class="keyword-trend-point${row.date === data.date ? ' is-selected' : ''}" data-daily-count="${row.count}" data-daily-value="${value}" data-daily-index="${index}"><rect class="keyword-daily-bar" x="${barX(index, termIndex) - barWidth / 2}" y="${y(value)}" width="${barWidth}" height="${bottom - y(value)}" rx="3"/>${!multiple && step >= 44 ? `<text x="${barX(index, termIndex)}" y="${y(value) - 12}" text-anchor="middle">${valueLabel(value, metric)}</text>` : ''}<title>${esc(series.term)} · ${row.date} · ${number(row.count)} 篇 · ${percent(row.count, dailyTotal(index))}</title></g>`;
            }).join('')}</g>`;
            return `<g data-trend-series="${termIndex}" class="keyword-trend-series series-${termIndex}" style="--series-color:${color(termIndex)}">${!multiple && values[termIndex].every(value => value !== null) ? `<polygon class="keyword-line-area" points="${x(0)},${bottom} ${segmentPoints[0]} ${x(6)},${bottom}"/>` : ''}${segmentPoints.map(points => `<polyline class="keyword-trend-line" points="${points}"/>`).join('')}${series.daily.map((row, index) => {
                const value = values[termIndex][index];
                return value === null ? '' : `<g class="keyword-trend-point${row.date === data.date ? ' is-selected' : ''}" data-daily-count="${row.count}" data-daily-value="${value}" data-daily-index="${index}"><g class="keyword-trend-marker">${marker(termIndex, x(index), y(value))}</g>${!multiple || index === 6 ? `<text x="${x(index)}" y="${multiple ? labelY(termIndex) : y(value) - 13}" text-anchor="middle">${valueLabel(value, metric)}</text>` : ''}<title>${esc(series.term)} · ${row.date} · ${number(row.count)} 篇 · ${percent(row.count, dailyTotal(index))}</title></g>`;
            }).join('')}</g>`;
        }).join('')}<line class="keyword-day-guide" x1="0" x2="0" y1="${top}" y2="${bottom}" hidden/></svg><div class="keyword-day-tabs" style="padding-left:${left}px;padding-right:${width - right}px">${rows.map((row, index) => `<button type="button" class="keyword-day${row.date === data.date ? ' is-selected' : ''}" data-analysis-date="${row.date}" data-day-index="${index}" aria-pressed="${row.date === data.date}" aria-label="查看 ${row.date}，${esc(counts(index))}">${row.date.slice(5).replace('-', '/')}</button>`).join('')}</div></div></div><p class="keyword-daily-note">${data.partial ? '末日截至 ' + new Date(Date.parse(data.to) + offset * 60000).toISOString().slice(11, 16) : '各日按全天统计'}</p>`;
        emptyShare(box, values.flat(), metric);
        const tooltip = chartTooltip(box);
        let pinned = -1;
        const readout = el('keywordDailyReadout'), reset = () => {
            readout.textContent = '各词分别统计 · 点击日期查看当天';
            box.querySelector('.keyword-day-guide').setAttribute('hidden', '');
            tooltip.hide();
        };
        const inspect = index => {
            readout.textContent = rows[index].date + ' · ' + counts(index);
            const guide = box.querySelector('.keyword-day-guide');
            guide.removeAttribute('hidden'); guide.setAttribute('x1', x(index)); guide.setAttribute('x2', x(index));
            tooltip.show(rows[index].date, data.series.map(series => series.daily[index].count), dailyTotal(index), x(index) - box.querySelector('.keyword-line-scroll').scrollLeft, y(Math.max(0, ...values.map(rows => rows[index]).filter(value => value !== null))), pinned === index);
        };
        const pointerIndex = event => {
            const point = window.SeekFeedControls.chartPointer(event, box.querySelector('svg'));
            if (!point) return -1;
            if (dailyStyle === 'bar') {
                const tolerance = event.pointerType === 'touch' ? 14 : 5;
                return rows.findIndex((_, i) => values.some((series, termIndex) => series[i] !== null && Math.abs(point.x - barX(i, termIndex)) <= barWidth / 2 + tolerance && point.y >= y(series[i]) - tolerance && point.y <= bottom + tolerance));
            }
            for (const series of values) for (let i = 0; i < rows.length; i++) {
                if (series[i] === null) continue;
                const start = { x: x(i), y: y(series[i]) }, next = Math.min(i + 1, rows.length - 1), tolerance = event.pointerType === 'touch' ? 14 : 7;
                if (Math.hypot(point.x - start.x, point.y - start.y) <= tolerance) return i;
                if (series[next] !== null && window.SeekFeedControls.nearChartSegment(point, start, { x: x(next), y: y(series[next]) }, tolerance)) return Math.abs(point.x - x(i)) <= Math.abs(point.x - x(next)) ? i : next;
            }
            return -1;
        };
        box.onpointermove = event => {
            if (event.pointerType !== 'touch') { const index = pointerIndex(event); if (index < 0) dismiss(); else inspect(index); }
        };
        box.onclick = event => {
            const index = pointerIndex(event);
            if (index < 0) return dismiss();
            pinned = pinned === index ? -1 : index;
            if (pinned < 0) reset(); else inspect(pinned);
        };
        box.onkeydown = event => { if (event.key === 'Escape') { pinned = -1; reset(); event.preventDefault(); } };
        box.querySelectorAll('[data-day-index]').forEach(button => {
            button.onfocus = () => { if (button.matches(':focus-visible')) inspect(Number(button.dataset.dayIndex)); };
            button.onblur = event => { if (!box.contains(event.relatedTarget)) dismiss(); };
        });
        box.querySelector('.keyword-line-scroll').scrollLeft = scrollLeft;
        const dismiss = () => { pinned = -1; reset(); };
        box.querySelector('.keyword-line-scroll').onscroll = dismiss;
        window.SeekFeedControls.chartInspection(box, dismiss);
        box.onpointerleave = dismiss;
        reset();
    }
    function renderChart() {
        const metric = hourMetric;
        if (!data || !el('keywordHourChart').clientWidth) return;
        const box = el('keywordHourChart'), multiple = data.series.length > 1;
        const scrollLeft = box.querySelector('.keyword-chart-scroll')?.scrollLeft || 0;
        const buckets = Array.from({ length: 24 / hours }, (_, index) => {
            const values = data.series.map(series => {
                const rows = series.hourly.slice(index * hours, (index + 1) * hours);
                return rows.reduce((sum, row) => sum + row.count, 0);
            });
            const allPosts = data.baseline?.hourly?.slice(index * hours, (index + 1) * hours);
            const total = allPosts ? allPosts.reduce((sum, row) => sum + row.count, 0) : null;
            return { hour: index * hours, values, total, plotted: values.map(count => plotted(count, total, metric)), available: data.series[0].hourly.slice(index * hours, (index + 1) * hours).some(row => row.available) };
        }).filter(row => row.available);
        const max = Math.max(...buckets.flatMap(row => row.plotted).filter(value => value !== null), 0), ceiling = ceilingFor(buckets.flatMap(row => row.plotted), metric);
        const slot = metric === 'share' ? 54 : Math.max(30, number(max).length * 7 + 16);
        const expanded = !!box.closest('.chart-expanded');
        const width = expanded || hourStyle === 'line' ? box.clientWidth : Math.max(box.clientWidth, 46 + buckets.length * Math.max(42, data.series.length * slot + 14));
        const height = expanded ? Math.max(220, Math.min(480, innerHeight * .55)) : 220;
        box.style.height = `${height + 16}px`;
        const left = metric === 'share' ? 46 : 32, right = width - 12, top = 34, bottom = height - 36, step = (right - left) / buckets.length, barStep = Math.min(slot, step * .8 / data.series.length), bar = Math.min(30, barStep * .72);
        const tickStride = Math.max(1, Math.ceil(55 / step));
        box.dataset.chartStyle = hourStyle; box.dataset.multiple = String(multiple); box.dataset.metric = metric;
        const x = index => left + (index + .5) * step, y = n => bottom - n / ceiling * (bottom - top);
        const lines = hourStyle === 'line' ? data.series.map((_, termIndex) => `<g class="keyword-trend-series series-${termIndex}" style="--series-color:${color(termIndex)}">${lineSegments(buckets.map(row => row.plotted[termIndex]), x, y).map(points => `<polyline class="keyword-trend-line" points="${points}"/>`).join('')}</g>`).join('') : '';
        box.innerHTML = `<div class="keyword-chart-scroll"><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">${Array.from({length:5},(_,i)=>{const n=ceiling*i/4;return `<line x1="${left}" x2="${right}" y1="${y(n)}" y2="${y(n)}" class="analytics-grid-line"/><text x="${left-8}" y="${y(n)+4}" text-anchor="end">${axisLabel(n, metric)}</text>`;}).join('')}${lines}${buckets.map((row,index)=>{
            return `<g data-keyword-bucket="${index}" data-total-posts="${row.total ?? ''}" class="keyword-chart-column">${row.values.map((count, termIndex) => {
                const plotValue = row.plotted[termIndex];
                if (plotValue === null) return '';
                const cx = hourStyle === 'line' ? x(index) : x(index) + (termIndex - (data.series.length - 1) / 2) * barStep;
                const value = valueLabel(plotValue, metric), labelWidth = Math.max(24, value.length * 7 + 10), cy = y(plotValue);
                return `<g data-keyword-series="${termIndex}" data-count="${count}" data-value="${plotValue}" style="--series-color:${color(termIndex)}">${hourStyle === 'line' ? `<g class="keyword-trend-marker">${marker(termIndex, cx, cy)}</g>` : `<rect class="keyword-bar" x="${cx-bar/2}" y="${cy}" width="${bar}" height="${bottom-cy}" rx="3"/>`}<g class="analytics-bar-label${(hourStyle === 'line' ? step < slot || multiple : expanded && barStep < slot) ? ' is-compact' : ''}"><rect x="${cx-labelWidth/2}" y="${cy-27}" width="${labelWidth}" height="20" rx="5"/><text class="analytics-bar-value" x="${cx}" y="${cy-17}" dominant-baseline="central" text-anchor="middle">${value}</text></g><title>${esc(data.series[termIndex].term)} · ${time(row.hour)} · ${number(count)} 篇</title></g>`;
            }).join('')}${index % tickStride === 0 ? `<text x="${x(index)}" y="${height - 11}" text-anchor="middle">${time(row.hour)}</text>` : ''}</g>`;
        }).join('')}</svg></div>`;
        const scroller=box.firstElementChild;
        scroller.scrollLeft = scrollLeft;
        emptyShare(box, buckets.flatMap(row => row.plotted), metric);
        const tooltip = chartTooltip(box);
        let pinned = -1;
        const select = index => {
            chartIndex=Math.max(0,Math.min(buckets.length-1,index));
            const row=buckets[chartIndex];
            const end=Math.min(Date.parse(data.from)+(row.hour+hours)*3600000,Date.parse(data.to));
            const endText=new Date(end+offset*60000).toISOString().slice(11,16);
            const displayEnd = row.hour + hours === 24 && !data.partial ? '24:00' : endText;
            el('keywordChartReadout').textContent=`${data.date} ${time(row.hour)}–${displayEnd} · ${totalLabel(row.total)}；${data.series.map((series,index)=>series.term+' '+number(row.values[index])+' 篇 · '+percent(row.values[index], row.total)).join('；')}`;
            box.setAttribute('aria-label',el('keywordChartReadout').textContent+'。左右方向键查看相邻时段。');
            box.querySelectorAll('[data-keyword-bucket]').forEach((column,i)=>column.classList.toggle('is-active',i===chartIndex));
            if(document.activeElement===box && box.matches(':focus-visible')){const start=x(chartIndex)-step/2;if(start<scroller.scrollLeft)scroller.scrollLeft=start;else if(start+step>scroller.scrollLeft+box.clientWidth)scroller.scrollLeft=start+step-box.clientWidth;}
            tooltip.show(`${data.date} · ${time(row.hour)}–${displayEnd}`, row.values, row.total, x(chartIndex) - scroller.scrollLeft, y(Math.max(0, ...row.plotted.filter(value => value !== null))), pinned === chartIndex);
        };
        const pointerIndex = event => {
            const point = window.SeekFeedControls.chartPointer(event, box.querySelector('svg'));
            if (!point) return -1;
            const tolerance = event.pointerType === 'touch' ? 14 : 5;
            if (hourStyle === 'line') {
                for (let termIndex = 0; termIndex < data.series.length; termIndex++) for (let i = 0; i < buckets.length; i++) {
                    const value = buckets[i].plotted[termIndex];
                    if (value === null) continue;
                    const start = { x: x(i), y: y(value) }, next = Math.min(i + 1, buckets.length - 1), endValue = buckets[next].plotted[termIndex];
                    if (Math.hypot(point.x - start.x, point.y - start.y) <= tolerance + 2) return i;
                    if (endValue !== null && window.SeekFeedControls.nearChartSegment(point, start, { x: x(next), y: y(endValue) }, tolerance + 2)) return Math.abs(point.x - x(i)) <= Math.abs(point.x - x(next)) ? i : next;
                }
                return -1;
            }
            return buckets.findIndex((row, i) => row.plotted.some((value, termIndex) => {
                if (value === null) return false;
                const cx = x(i) + (termIndex - (data.series.length - 1) / 2) * barStep;
                return Math.abs(point.x - cx) <= bar / 2 + tolerance && point.y >= y(value) - tolerance && point.y <= bottom + tolerance;
            }));
        };
        box.onpointerdown = event => { const index = pointerIndex(event); if (index < 0) return dismiss(); chartIndex = index; box.focus({ preventScroll: true }); };
        box.onpointermove=e=>{if(e.pointerType !== 'touch'){const index=pointerIndex(e);if(index<0)dismiss();else select(index);}};
        box.onclick = event => { const index = pointerIndex(event); if (index < 0) return dismiss(); pinned = pinned === index ? -1 : index; if (pinned < 0) reset(true); else select(pinned); };
        box.onfocus=()=>{if(box.matches(':focus-visible'))select(chartIndex);};
        box.onkeydown=e=>{
            if(e.key==='Escape'){pinned=-1;reset(true);e.preventDefault();return;}
            if(e.key==='Enter'||e.key===' '){e.preventDefault();pinned=pinned===chartIndex?-1:chartIndex;if(pinned<0)reset(true);else select(pinned);return;}
            if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();select(e.key==='Home'?0:e.key==='End'?buckets.length-1:chartIndex+(e.key==='ArrowRight'?1:-1));
        };
        const reset=(force=false)=>{if(!force && pinned>=0){select(pinned);return;}if(!force && document.activeElement===box)return;tooltip.hide();box.querySelectorAll('.is-active').forEach(n=>n.classList.remove('is-active'));el('keywordChartReadout').textContent=`${data.date} · ${metric === 'share' ? '占同时段总发帖，' : ''}${multiple?'各词独立对比，':hourStyle === 'bar'?'每柱 ':'每点 '}${hours} 小时 · ${data.partial?'截至 '+new Date(Date.parse(data.to)+offset*60000).toISOString().slice(11,16):'全天'} · UTC${offset>=0?'+':'−'}${Math.abs(offset/60)}`;};
        const dismiss = () => { pinned = -1; reset(true); };
        scroller.onscroll = () => { if (!box.matches(':focus-visible')) dismiss(); };
        window.SeekFeedControls.chartInspection(box, dismiss);
        box.onpointerleave = box.onblur = dismiss;
        reset();
        box.setAttribute('aria-label', `关键词时段${hourStyle === 'bar' ? '柱形' : '折线'}图，左右方向键查看数据。`);
    }
    function render() {
        el('keywordAnalysisResults').hidden=false;
        const series=selectedTerm(),total=series.total;
        el('keywordShareContext').textContent = `${data.date} · 总发帖 ${number(data.totalPosts)} 篇${data.partial ? '（截至查询时刻）' : ''}`;
        el('keywordShareNote').textContent = data.totalPosts ? `关键词帖子数 ÷ 该日期已收录总帖数${data.series.length > 1 ? '；各词独立计算，同一帖子可同时计入多个词，占比不相加。' : '。'}` : '该日期暂无收录帖子，暂无法计算占比。';
        el('keywordComparison').innerHTML=data.series.map((row,i)=>`<button type="button" data-term-index="${i}" class="keyword-summary${i===selected?' is-selected':''}" style="--series-color:${color(i)}" aria-pressed="${i===selected}" aria-label="${esc(row.term)}，${number(row.total)} 篇，占总发帖 ${percent(row.total,data.totalPosts)}，查看详细指标"><span class="keyword-summary-term"><i aria-hidden="true"></i><span title="${esc(row.term)}">${esc(row.term)}</span></span><span class="keyword-summary-values"><strong>${number(row.total)}<small>篇</small></strong><b>${percent(row.total,data.totalPosts)}</b></span><span class="keyword-share-track" role="${data.totalPosts ? 'meter' : 'img'}" aria-label="${esc(row.term)} 发帖占比${data.totalPosts ? '' : '，无收录数据'}" aria-valuemin="0" aria-valuemax="100" ${data.totalPosts ? `aria-valuenow="${share(row.total,data.totalPosts)}"` : ''} aria-valuetext="${data.totalPosts ? `${number(row.total)} / ${number(data.totalPosts)} 篇，${percent(row.total,data.totalPosts)}` : '无收录数据'}"><i style="width:${share(row.total,data.totalPosts) ?? 0}%" ${row.total ? '' : 'hidden'}></i></span><span class="keyword-summary-base">${number(row.total)} / ${number(data.totalPosts)} 篇${i === selected ? ' · 当前明细' : ''}</span></button>`).join('');
        el('keywordHourLegend').innerHTML = el('keywordDailyLegend').innerHTML = legend();
        el('keywordDetailLabel').textContent = series.term + ' · 详细指标（点击上方关键词切换）';
        el('keywordCategoryTerm').textContent = series.term + ' · 帖子占比';
        el('keywordAuthorTerm').textContent = series.term;
        const difference=total-series.previous;
        const previousCovered=data.coverageFrom&&Date.parse(data.coverageFrom)<=Date.parse(data.from)-86400000;
        const comparison=!previousCovered?'上日记录不完整':`上日${data.partial?'同时段':''} ${number(series.previous)} 篇`;
        el('keywordMetrics').innerHTML=[['活跃作者',number(series.authors),'位'],['覆盖分类',number(series.categoryCount),'类'],['高峰时段',series.peak?String(series.peak.hour).padStart(2,'0')+':00':'—',series.peak?number(series.peak.count)+' 篇':'暂无记录'],['较上一日',previousCovered?(difference>0?'+':'')+number(difference):'—',comparison]].map(([label,value,unit])=>`<div><span>${label}</span><strong>${value}</strong><small>${unit}</small></div>`).join('');
        el('keywordOverlap').hidden=!data.overlaps?.length;
        el('keywordOverlap').innerHTML=(data.overlaps||[]).map(row=>`<span>${row.terms.map(esc).join(' ∩ ')}<strong>${number(row.count)} 篇共同命中</strong></span>`).join('');
        renderCategoryChart(series);
        renderAuthors(series);
        renderDailyChart();
        el('keywordDailyUnit').textContent = dailyMetric === 'share' ? '占当日总发帖' : '篇 / 天';
        el('keywordAnalysisStatus').textContent=`${data.date} · ${data.scope==='title'?'标题包含':'标题或 RSS 摘要包含'} · 每篇每词计 1 次${data.coverageFrom&&Date.parse(data.coverageFrom)>Date.parse(data.from)-6*86400000?' · 历史记录未覆盖完整 7 天':''}`;
        chartIndex=0;renderChart();
    }
    async function load(silent=false) {
        if(!config || collapsed)return;
        const id=++request;busy=true;lastLoad=Date.now();controller?.abort();controller=new AbortController();
        if(!silent)el('keywordAnalysisResults').setAttribute('aria-busy','true');
        const result=await apiRequest('/api/stats/keywords?'+new URLSearchParams(config),{signal:controller.signal,silent:true});
        if(id!==request)return;busy=false;el('keywordAnalysisResults').setAttribute('aria-busy','false');
        if(!result?.success){el('keywordAnalysisStatus').dataset.error='true';el('keywordAnalysisStatus').textContent='分析读取失败，请重试。'+(data?'已保留上次结果。':'');return;}
        const active=data?.series[selected]?.term;
        const signature=value=>JSON.stringify(value&&{...value,to:null});
        const unchanged=signature(result.data)===signature(data);data=result.data;selected=Math.max(0,data.series.findIndex(row=>row.term===active));
        const recovered = el('keywordAnalysisStatus').dataset.error === 'true';
        delete el('keywordAnalysisStatus').dataset.error;
        if(!unchanged || !silent || recovered)render();
    }
    function submit() {
        if(!el('keywordAnalysisForm').reportValidity())return;
        if(!el('analysisKeyword').value.trim()){el('keywordAnalysisStatus').textContent='请输入分析关键词。';el('analysisKeyword').focus();return;}
        draft = false;
        config={q:el('analysisKeyword').value.trim(),compare1:el('analysisCompare1').value.trim(),compare2:el('analysisCompare2').value.trim(),date:el('analysisDate').value,offset:String(offset),scope:el('analysisScope').value};
        return window.SeekFeedControls.pending(el('keywordAnalyzeBtn'),()=>load());
    }
    return {
        prepare(term, scroll = true) {
            cancelRequest();
            draft = true;
            if (collapsed) el('keywordToggle').click();
            el('analysisKeyword').value = term;
            if (scroll) el('keywordAnalysis').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
            el('analysisKeyword').focus({ preventScroll: true });
            el('keywordAnalysisStatus').textContent = '关键词已填入，请点击“开始分析”或按回车提交。';
        },
        init() {
            const mobile = matchMedia('(max-width: 760px), (max-width: 1000px) and (pointer: coarse)');
            const placeAnalyze = () => el('keywordAnalysisForm').querySelector(mobile.matches ? '.keyword-query-fields' : '.keyword-query-options').appendChild(el('keywordAnalyzeBtn'));
            placeAnalyze();
            mobile.addEventListener('change', placeAnalyze);
            el('analysisDate').value=el('analysisDate').max=localDate();
            el('keywordAnalysisForm').addEventListener('submit',e=>{e.preventDefault();submit();});
            const markDraft = event => {
                if (!event.target.matches('#analysisKeyword, #analysisCompare1, #analysisCompare2, #analysisDate, #analysisScope')) return;
                draft = true;
                cancelRequest();
                if (config) el('keywordAnalysisStatus').textContent = '分析条件已修改，请点击“开始分析”或按回车提交。';
            };
            el('keywordAnalysisForm').addEventListener('input', markDraft);
            el('keywordAnalysisForm').addEventListener('change', markDraft);
            el('keywordAddCompare').addEventListener('click',()=>{const index=[1,2].find(index=>el('analysisCompare'+index).hidden);if(!index)return;compareVisible(index,true);el('analysisCompare'+index).focus();});
            el('keywordAnalysisForm').addEventListener('click', event => { const button = event.target.closest('[data-remove-compare]'); if (button) removeCompare(Number(button.dataset.removeCompare)); });
            el('keywordReset').addEventListener('click', reset);
            el('keywordAuthorLimit').addEventListener('change', () => { if (data) renderAuthors(selectedTerm()); });
            el('keywordToggle').addEventListener('click', () => {
                collapsed = !collapsed;
                el('keywordAnalysisBody').hidden = collapsed;
                el('keywordToggle').setAttribute('aria-expanded', String(!collapsed));
                el('keywordToggle').querySelector('span').textContent = collapsed ? '展开' : '收起';
                if (collapsed) { const wasBusy = busy; cancelRequest(); if (wasBusy) lastLoad = 0; }
                else if (config && !draft && Date.now() - lastLoad >= window.SeekFeedCadence.keywordRefreshMs) load(true);
            });
            el('keywordComparison').addEventListener('click',e=>{const button=e.target.closest('[data-term-index]');if(button){selected=Number(button.dataset.termIndex);render();el('keywordComparison').querySelector(`[data-term-index="${selected}"]`).focus({preventScroll:true});}});
            for (const [id, renderChartStyle] of [['keywordHourStyle', renderChart], ['keywordDailyStyle', renderDailyChart]]) {
                el(id).addEventListener('click', event => {
                    const button = event.target.closest('[data-chart-style]');
                    if (!button) return;
                    const style = button.dataset.chartStyle;
                    if (id === 'keywordHourStyle') { if (hourStyle === style) return; hourStyle = style; }
                    else { if (dailyStyle === style) return; dailyStyle = style; }
                    el(id).querySelectorAll('button').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
                    renderChartStyle();
                });
            }
            for (const [id, draw] of [['keywordHourMetric', renderChart], ['keywordDailyMetric', renderDailyChart]]) {
                el(id).addEventListener('click', event => {
                    const button = event.target.closest('[data-keyword-metric]');
                    if (!button) return;
                    if (id === 'keywordHourMetric') { if (hourMetric === button.dataset.keywordMetric) return; hourMetric = button.dataset.keywordMetric; }
                    else { if (dailyMetric === button.dataset.keywordMetric) return; dailyMetric = button.dataset.keywordMetric; el('keywordDailyUnit').textContent = dailyMetric === 'share' ? '占当日总发帖' : '篇 / 天'; }
                    el(id).querySelectorAll('button').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
                    draw();
                });
            }
            el('keywordBucketSelector').addEventListener('click',e=>{const button=e.target.closest('[data-hours]');if(!button)return;hours=Number(button.dataset.hours);el('keywordBucketSelector').querySelectorAll('button').forEach(n=>{n.classList.toggle('active',n===button);n.setAttribute('aria-pressed',String(n===button));});renderChart();});
            el('keywordDailyChart').addEventListener('click',e=>{const button=e.target.closest('[data-analysis-date]');if(button){el('analysisDate').value=button.dataset.analysisDate;submit();}});
            el('keywordSuggestions').addEventListener('click',e=>{const button=e.target.closest('[data-keyword]');if(button)this.prepare(button.dataset.keyword,false);});
            let width=0;new ResizeObserver(entries=>{const next=Math.round(entries[0].contentRect.width);if(next&&next!==width){width=next;renderChart();}}).observe(el('keywordHourChart'));
            let dailyWidth=0;new ResizeObserver(entries=>{const next=Math.round(entries[0].contentRect.width);if(next&&next!==dailyWidth){dailyWidth=next;renderDailyChart();}}).observe(el('keywordDailyChart'));
            window.addEventListener('resize', () => { if (el('keywordHourChart').closest('.chart-expanded')) renderChart(); if (el('keywordDailyChart').closest('.chart-expanded')) renderDailyChart(); });
        },
        suggestions(terms) {
            const next=JSON.stringify(terms.slice(0,6).map(row=>row.term));if(el('keywordSuggestions').dataset.terms===next)return;
            el('keywordSuggestions').dataset.terms=next;el('keywordSuggestions').innerHTML=terms.slice(0,6).map(row=>`<button class="btn btn-text" type="button" data-keyword="${esc(row.term)}">${esc(row.term)}</button>`).join('');
        },
        tick(){if(config&&!draft&&!collapsed&&!busy&&Date.now()-lastLoad>=window.SeekFeedCadence.keywordRefreshMs)load(true);el('analysisDate').max=localDate();},
    };
};
