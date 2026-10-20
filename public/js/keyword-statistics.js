/* Focused, literal keyword cohorts: the selected date is independent of overview range. */
window.SeekFeedKeywordAnalysis = function ({ apiRequest, escapeHtml: esc, getCategoryName }) {
    const el = id => document.getElementById(id), number = n => Number(n || 0).toLocaleString('zh-CN');
    const offset = -new Date().getTimezoneOffset();
    const localDate = () => new Date(Date.now() + offset * 60000).toISOString().slice(0, 10);
    const percent = (n, total) => total ? (n / total * 100).toFixed(1).replace(/\.0$/, '') + '%' : '—';
    let data, selected = 0, hours = 1, request = 0, lastLoad = 0, busy = false, controller, config, chartIndex = 0, collapsed = false;
    const selectedTerm = () => data.series[selected];
    const normalize = term => (term || '').normalize('NFKC').toLocaleLowerCase('zh-CN').trim();
    const color = index => `var(--analytics-color-${index})`;
    const time = hour => String(hour).padStart(2, '0') + ':00';
    const legend = () => data.series.map((row, index) => `<span title="${esc(row.term)}"><i class="keyword-series-key series-${index}" style="--series-color:${color(index)}"></i><span>${esc(row.term)}</span></span>`).join('');
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
        el('keywordAuthors').innerHTML = rows.length ? rows.map((row, index) => `<div class="keyword-rank-row"><span class="keyword-rank">${String(index + 1).padStart(2, '0')}</span><span class="keyword-author-name" title="${esc(row.creator)}">${esc(row.creator)}</span><span><strong>${number(row.count)}<small>篇</small></strong><small>${percent(row.count, series.total)}</small></span></div>`).join('') : '<p class="keyword-no-data">暂无作者记录</p>';
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
            show(label, values, cx, cy, pinned = false, available = true) {
                tooltip.innerHTML = `<span>${esc(label)}</span>${available ? data.series.map((series, i) => `<div><i style="background:${color(i)}"></i><span title="${esc(series.term)}">${esc(series.term)}</span><strong>${number(values[i])} 篇</strong></div>`).join('') : '<div>尚未到该时段</div>'}`;
                tooltip.hidden = false;
                tooltip.dataset.pinned = String(pinned);
                tooltip.style.left = `${Math.max(6, Math.min(box.clientWidth - tooltip.offsetWidth - 6, cx - tooltip.offsetWidth / 2))}px`;
                tooltip.style.top = `${Math.max(0, cy - tooltip.offsetHeight - 12)}px`;
            },
        };
    }
    function renderDailyChart() {
        const box = el('keywordDailyChart');
        if (!data || !box.clientWidth) return;
        const scrollLeft = box.querySelector('.keyword-line-scroll')?.scrollLeft || 0;
        const rows = data.series[0].daily, multiple = data.series.length > 1;
        const max = Math.max(...data.series.flatMap(series => series.daily.map(row => row.count)), 1);
        const width = Math.max(box.clientWidth, 7 * 34 + 36), height = 178;
        const left = 10, right = width - 26, top = 26, bottom = 154, step = (right - left) / rows.length;
        const ceiling = Math.max(4, Math.ceil(max / 4) * 4);
        const x = index => left + (index + .5) * step, y = value => bottom - value / ceiling * (bottom - top);
        // End labels are separated vertically so equal/near-equal series stay legible.
        const endLabels = data.series.map((series, index) => ({ index, y: y(series.daily[6].count) - 12 })).sort((a, b) => a.y - b.y);
        endLabels.forEach((label, index) => { label.y = Math.max(12, label.y, index ? endLabels[index - 1].y + 17 : 0); });
        const labelY = index => endLabels.find(label => label.index === index).y;
        const counts = index => data.series.map(series => `${series.term} ${number(series.daily[index].count)} 篇`).join('；');
        box.innerHTML = `<div class="keyword-line-scroll"><div class="keyword-line-canvas" style="width:${width}px"><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(rows.map((row, index) => `${row.date}：${counts(index)}`).join('。'))}">${[0, .5, 1].map(ratio => `<line x1="${left}" x2="${right}" y1="${y(ceiling * ratio)}" y2="${y(ceiling * ratio)}" class="analytics-grid-line"/>`).join('')}${data.series.map((series, termIndex) => {
            const points = series.daily.map((row, index) => `${x(index)},${y(row.count)}`).join(' ');
            const marker = (cx, cy) => termIndex === 1 ? `<rect x="${cx - 3.5}" y="${cy - 3.5}" width="7" height="7" rx="1"/>` : termIndex === 2 ? `<path d="M${cx},${cy - 4.5}l4.5,4.5 -4.5,4.5 -4.5,-4.5Z"/>` : `<circle cx="${cx}" cy="${cy}" r="3.5"/>`;
            return `<g data-trend-series="${termIndex}" class="keyword-trend-series series-${termIndex}" style="--series-color:${color(termIndex)}">${!multiple ? `<polygon class="keyword-line-area" points="${x(0)},${bottom} ${points} ${x(6)},${bottom}"/>` : ''}<polyline class="keyword-trend-line" points="${points}"/>${series.daily.map((row, index) => `<g class="keyword-trend-point${row.date === data.date ? ' is-selected' : ''}" data-daily-count="${row.count}" data-daily-index="${index}"><g class="keyword-trend-marker">${marker(x(index), y(row.count))}</g>${!multiple || index === 6 ? `<text x="${x(index)}" y="${multiple ? labelY(termIndex) : y(row.count) - 13}" text-anchor="middle">${number(row.count)}</text>` : ''}<title>${esc(series.term)} · ${row.date} · ${number(row.count)} 篇</title></g>`).join('')}</g>`;
        }).join('')}<line class="keyword-day-guide" x1="0" x2="0" y1="${top}" y2="${bottom}" hidden/></svg><div class="keyword-day-tabs" style="padding-left:${left}px;padding-right:${width - right}px">${rows.map((row, index) => `<button type="button" class="keyword-day${row.date === data.date ? ' is-selected' : ''}" data-analysis-date="${row.date}" data-day-index="${index}" aria-pressed="${row.date === data.date}" aria-label="查看 ${row.date}，${esc(counts(index))}">${row.date.slice(5).replace('-', '/')}</button>`).join('')}</div></div></div><p class="keyword-daily-note">${data.partial ? '末日截至 ' + new Date(Date.parse(data.to) + offset * 60000).toISOString().slice(11, 16) : '各日按全天统计'}</p>`;
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
            tooltip.show(rows[index].date, data.series.map(series => series.daily[index].count), x(index) - box.querySelector('.keyword-line-scroll').scrollLeft, y(Math.max(...data.series.map(series => series.daily[index].count))), pinned === index);
        };
        const pointerIndex = event => Math.max(0, Math.min(6, Math.floor((event.clientX - box.querySelector('svg').getBoundingClientRect().left - left) / step)));
        box.onpointermove = event => {
            if (event.pointerType !== 'touch') inspect(pointerIndex(event));
        };
        box.onclick = event => {
            if (!event.target.closest('svg')) return;
            const index = pointerIndex(event);
            pinned = pinned === index ? -1 : index;
            if (pinned < 0) reset(); else inspect(pinned);
        };
        box.onkeydown = event => { if (event.key === 'Escape') { pinned = -1; reset(); event.preventDefault(); } };
        box.querySelectorAll('[data-day-index]').forEach(button => {
            button.onfocus = () => inspect(Number(button.dataset.dayIndex));
            button.onblur = event => { if (!box.contains(event.relatedTarget)) dismiss(); };
        });
        box.querySelector('.keyword-line-scroll').scrollLeft = scrollLeft;
        const dismiss = () => { pinned = -1; reset(); };
        window.SeekFeedControls.chartInspection(box, dismiss);
        box.onpointerleave = dismiss;
        reset();
    }
    function renderChart() {
        if (!data || !el('keywordHourChart').clientWidth) return;
        const box = el('keywordHourChart'), multiple = data.series.length > 1;
        const scrollLeft = box.querySelector('.keyword-chart-scroll')?.scrollLeft || 0;
        const buckets = Array.from({ length: 24 / hours }, (_, index) => {
            const values = data.series.map(series => {
                const rows = series.hourly.slice(index * hours, (index + 1) * hours);
                return rows.reduce((sum, row) => sum + row.count, 0);
            });
            return { hour: index * hours, values, available: data.series[0].hourly.slice(index * hours, (index + 1) * hours).some(row => row.available) };
        });
        const max = Math.max(...buckets.flatMap(row => row.values), 1), ceiling = Math.max(4, Math.ceil(max / 4) * 4);
        const slot = Math.max(30, number(max).length * 7 + 16);
        const width = Math.max(box.clientWidth, 46 + buckets.length * Math.max(42, data.series.length * slot + 14));
        const left = 32, right = width - 12, top = 34, bottom = 184, step = (right - left) / buckets.length, barStep = Math.min(slot, step * .8 / data.series.length), bar = Math.min(30, barStep * .72);
        const x = index => left + (index + .5) * step, y = n => bottom - n / ceiling * (bottom - top);
        box.innerHTML = `<div class="keyword-chart-scroll"><svg width="${width}" height="220" viewBox="0 0 ${width} 220" aria-hidden="true">${Array.from({length:5},(_,i)=>{const n=ceiling*i/4;return `<line x1="${left}" x2="${right}" y1="${y(n)}" y2="${y(n)}" class="analytics-grid-line"/><text x="${left-8}" y="${y(n)+4}" text-anchor="end">${number(n)}</text>`;}).join('')}${buckets.map((row,index)=>{
            return `<g data-keyword-bucket="${index}" class="keyword-chart-column${row.available?'':' is-future'}">${row.values.map((count, termIndex) => {
                const cx = x(index) + (termIndex - (data.series.length - 1) / 2) * barStep;
                const value = row.available ? number(count) : '—', labelWidth = Math.max(24, value.length * 7 + 10), cy = row.available ? y(count) : top;
                return `<g data-keyword-series="${termIndex}" style="--series-color:${color(termIndex)}"><rect class="keyword-bar" x="${cx-bar/2}" y="${cy}" width="${bar}" height="${row.available?bottom-cy:bottom-top}" rx="3"/><g class="analytics-bar-label"><rect x="${cx-labelWidth/2}" y="${cy-27}" width="${labelWidth}" height="20" rx="5"/><text class="analytics-bar-value" x="${cx}" y="${cy-17}" dominant-baseline="central" text-anchor="middle">${value}</text></g><title>${esc(data.series[termIndex].term)} · ${time(row.hour)} · ${row.available?number(count)+' 篇':'尚未到该时段'}</title></g>`;
            }).join('')}<text x="${x(index)}" y="209" text-anchor="middle">${time(row.hour)}</text></g>`;
        }).join('')}</svg></div>`;
        const scroller=box.firstElementChild;
        scroller.scrollLeft = scrollLeft;
        const tooltip = chartTooltip(box);
        let pinned = -1;
        const select = index => {
            chartIndex=Math.max(0,Math.min(buckets.length-1,index));
            const row=buckets[chartIndex];
            const end=Math.min(Date.parse(data.from)+(row.hour+hours)*3600000,Date.parse(data.to));
            const endText=new Date(end+offset*60000).toISOString().slice(11,16);
            const readout=`${data.date} ${time(row.hour)}–${row.hour+hours===24&&!data.partial?'24:00':endText} · ${row.available?data.series.map((series,index)=>series.term+' '+number(row.values[index])+' 篇').join('；'):'尚未到该时段'}`;
            el('keywordChartReadout').textContent=row.available?readout:`${data.date} ${time(row.hour)}–${time(row.hour+hours)} · 尚未到该时段`;
            box.setAttribute('aria-label',el('keywordChartReadout').textContent+'。左右方向键查看相邻时段。');
            box.querySelectorAll('[data-keyword-bucket]').forEach((column,i)=>column.classList.toggle('is-active',i===chartIndex));
            if(document.activeElement===box){const start=x(chartIndex)-step/2;if(start<scroller.scrollLeft)scroller.scrollLeft=start;else if(start+step>scroller.scrollLeft+box.clientWidth)scroller.scrollLeft=start+step-box.clientWidth;}
            tooltip.show(`${data.date} · ${time(row.hour)}–${row.hour + hours === 24 ? '24:00' : time(row.hour + hours)}`, row.values, x(chartIndex) - scroller.scrollLeft, y(Math.max(...row.values)), pinned === chartIndex, row.available);
        };
        const pointerIndex = event => Math.max(0, Math.min(buckets.length - 1, Math.floor((event.clientX - box.getBoundingClientRect().left + scroller.scrollLeft - left) / step)));
        box.onpointerdown = event => { chartIndex = pointerIndex(event); box.focus({ preventScroll: true }); };
        box.onpointermove=e=>{if(e.pointerType !== 'touch')select(pointerIndex(e));};
        box.onclick = event => { if (!event.target.closest('svg')) return; const index = pointerIndex(event); pinned = pinned === index ? -1 : index; if (pinned < 0) reset(true); else select(pinned); };
        box.onfocus=()=>select(chartIndex);
        box.onkeydown=e=>{
            if(e.key==='Escape'){pinned=-1;reset(true);e.preventDefault();return;}
            if(e.key==='Enter'||e.key===' '){e.preventDefault();pinned=pinned===chartIndex?-1:chartIndex;if(pinned<0)reset(true);else select(pinned);return;}
            if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();select(e.key==='Home'?0:e.key==='End'?buckets.length-1:chartIndex+(e.key==='ArrowRight'?1:-1));
        };
        const reset=(force=false)=>{if(!force && pinned>=0){select(pinned);return;}if(!force && document.activeElement===box)return;tooltip.hide();box.querySelectorAll('.is-active').forEach(n=>n.classList.remove('is-active'));el('keywordChartReadout').textContent=`${data.date} · ${multiple?'各词并排对比，':'每柱 '}${hours} 小时 · ${data.partial?'截至 '+new Date(Date.parse(data.to)+offset*60000).toISOString().slice(11,16):'全天'} · UTC${offset>=0?'+':'−'}${Math.abs(offset/60)}`;};
        const dismiss = () => { pinned = -1; reset(true); };
        window.SeekFeedControls.chartInspection(box, dismiss);
        box.onpointerleave = box.onblur = dismiss;
        reset();
    }
    function render() {
        el('keywordAnalysisResults').hidden=false;
        const series=selectedTerm(),total=series.total;
        el('keywordComparison').innerHTML=data.series.map((row,i)=>`<button type="button" data-term-index="${i}" class="keyword-summary${i===selected?' is-selected':''}" aria-pressed="${i===selected}"><span>${esc(row.term)}</span><strong>${number(row.total)}<small>篇</small></strong><span>占当日收录 ${percent(row.total,data.totalPosts)}</span></button>`).join('');
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
        el('keywordAnalysisStatus').textContent=`${data.date} · ${data.scope==='title'?'标题包含':'标题或 RSS 摘要包含'} · 每篇每词计 1 次${data.coverageFrom&&Date.parse(data.coverageFrom)>Date.parse(data.from)-6*86400000?' · 历史记录未覆盖完整 7 天':''}`;
        chartIndex=0;renderChart();
    }
    async function load(silent=false) {
        if(!config || collapsed)return;
        const id=++request;busy=true;lastLoad=Date.now();controller?.abort();controller=new AbortController();
        if(!silent)el('keywordAnalysisResults').setAttribute('aria-busy','true');
        const result=await apiRequest('/api/stats/keywords?'+new URLSearchParams(config),{signal:controller.signal,silent:true});
        if(id!==request)return;busy=false;el('keywordAnalysisResults').setAttribute('aria-busy','false');
        if(!result?.success){el('keywordAnalysisStatus').textContent='分析读取失败，请重试。'+(data?'已保留上次结果。':'');return;}
        const active=data?.series[selected]?.term;
        const signature=value=>JSON.stringify(value&&{...value,to:null});
        const unchanged=signature(result.data)===signature(data);data=result.data;selected=Math.max(0,data.series.findIndex(row=>row.term===active));
        if(!unchanged)render();
    }
    function submit() {
        if(!el('keywordAnalysisForm').reportValidity())return;
        if(!el('analysisKeyword').value.trim()){el('keywordAnalysisStatus').textContent='请输入分析关键词。';el('analysisKeyword').focus();return;}
        config={q:el('analysisKeyword').value.trim(),compare1:el('analysisCompare1').value.trim(),compare2:el('analysisCompare2').value.trim(),date:el('analysisDate').value,offset:String(offset),scope:el('analysisScope').value};
        return window.SeekFeedControls.pending(el('keywordAnalyzeBtn'),()=>load());
    }
    return {
        analyze(term) {
            cancelRequest();
            if (collapsed) el('keywordToggle').click();
            el('analysisKeyword').value = term;
            el('analysisDate').value = localDate();
            el('keywordAnalysis').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
            el('analysisKeyword').focus({ preventScroll: true });
            submit();
        },
        init() {
            el('analysisDate').value=el('analysisDate').max=localDate();
            el('keywordAnalysisForm').addEventListener('submit',e=>{e.preventDefault();submit();});
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
                else if (config && Date.now() - lastLoad > 60000) load(true);
            });
            el('keywordComparison').addEventListener('click',e=>{const button=e.target.closest('[data-term-index]');if(button){selected=Number(button.dataset.termIndex);render();el('keywordComparison').querySelector(`[data-term-index="${selected}"]`).focus({preventScroll:true});}});
            el('keywordBucketSelector').addEventListener('click',e=>{const button=e.target.closest('[data-hours]');if(!button)return;hours=Number(button.dataset.hours);el('keywordBucketSelector').querySelectorAll('button').forEach(n=>{n.classList.toggle('active',n===button);n.setAttribute('aria-pressed',String(n===button));});renderChart();});
            el('keywordDailyChart').addEventListener('click',e=>{const button=e.target.closest('[data-analysis-date]');if(button){el('analysisDate').value=button.dataset.analysisDate;submit();}});
            el('keywordSuggestions').addEventListener('click',e=>{const button=e.target.closest('[data-keyword]');if(button){el('analysisKeyword').value=button.dataset.keyword;submit();}});
            let width=0;new ResizeObserver(entries=>{const next=Math.round(entries[0].contentRect.width);if(next&&next!==width){width=next;renderChart();}}).observe(el('keywordHourChart'));
            let dailyWidth=0;new ResizeObserver(entries=>{const next=Math.round(entries[0].contentRect.width);if(next&&next!==dailyWidth){dailyWidth=next;renderDailyChart();}}).observe(el('keywordDailyChart'));
        },
        suggestions(terms) {
            const next=JSON.stringify(terms.slice(0,6).map(row=>row.term));if(el('keywordSuggestions').dataset.terms===next)return;
            el('keywordSuggestions').dataset.terms=next;el('keywordSuggestions').innerHTML=terms.slice(0,6).map(row=>`<button class="btn btn-text" type="button" data-keyword="${esc(row.term)}">${esc(row.term)}</button>`).join('');
        },
        tick(){if(config&&!collapsed&&!busy&&Date.now()-lastLoad>60000)load(true);el('analysisDate').max=localDate();},
    };
};
