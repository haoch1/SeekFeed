/* Focused, literal keyword cohorts: the selected date is independent of overview range. */
window.SeekFeedKeywordAnalysis = function ({ apiRequest, escapeHtml: esc, getCategoryName }) {
    const el = id => document.getElementById(id), number = n => Number(n || 0).toLocaleString('zh-CN');
    const offset = -new Date().getTimezoneOffset();
    const localDate = () => new Date(Date.now() + offset * 60000).toISOString().slice(0, 10);
    const percent = (n, total) => total ? (n / total * 100).toFixed(1).replace(/\.0$/, '') + '%' : '—';
    let data, selected = 0, hours = 1, request = 0, lastLoad = 0, busy = false, controller, config, chartIndex = 0;
    const selectedTerm = () => data.series[selected];
    function renderAuthors(series) {
        el('keywordAuthors').innerHTML = series.topAuthors.length ? series.topAuthors.map((row, index) => `<div class="keyword-rank-row"><span class="keyword-rank">${String(index + 1).padStart(2, '0')}</span><span class="keyword-author-name" title="${esc(row.creator)}">${esc(row.creator)}</span><span><strong>${number(row.count)}<small>篇</small></strong><small>${percent(row.count, series.total)}</small></span></div>`).join('') : '<p class="keyword-no-data">暂无作者记录</p>';
    }
    function renderCategoryChart(series) {
        const rows = series.categories.length > 5 ? [...series.categories.slice(0, 4), { category: '其他分类', count: series.categories.slice(4).reduce((sum, row) => sum + row.count, 0) }] : series.categories;
        let cursor = 0;
        const segments = rows.map((row, index) => {
            const start = cursor;
            cursor += row.count / series.total * 100;
            return `var(--analytics-color-${index}) ${start}% ${cursor}%`;
        });
        el('keywordCategories').innerHTML = !rows.length ? '<p class="keyword-no-data">暂无分类记录</p>' : `<div class="keyword-category-ring" role="img" aria-label="${esc(rows.map(row => `${getCategoryName(row.category)} ${number(row.count)} 篇，占 ${percent(row.count, series.total)}`).join('；'))}" style="background:conic-gradient(${segments.join(',')})"><div><strong>${number(series.total)}</strong><span>篇帖子</span></div></div><div class="keyword-category-legend">${rows.map((row, index) => `<div><i style="background:var(--analytics-color-${index})"></i><span title="${esc(getCategoryName(row.category))}">${esc(getCategoryName(row.category))}</span><strong>${number(row.count)}</strong><small>${percent(row.count, series.total)}</small></div>`).join('')}</div>`;
    }
    function renderDailyChart() {
        const box = el('keywordDailyChart');
        if (!data || !box.clientWidth) return;
        const rows = selectedTerm().daily, max = Math.max(...rows.map(row => row.count), 1);
        const width = Math.max(box.clientWidth, rows.length * Math.max(26, number(max).length * 6 + 8) + 12), height = 178;
        const inset = width < 336 ? 6 : 24;
        const left = inset, right = width - inset, top = 26, bottom = 160, step = (right - left) / rows.length;
        const ceiling = Math.max(4, Math.ceil(max / 4) * 4);
        const x = index => left + (index + .5) * step, y = value => bottom - value / ceiling * (bottom - top);
        const points = rows.map((row, index) => `${x(index)},${y(row.count)}`).join(' ');
        box.innerHTML = `<div class="keyword-line-scroll"><div class="keyword-line-canvas" style="width:${width}px"><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(rows.map(row => `${row.date} ${number(row.count)} 篇`).join('；'))}">${[0, .5, 1].map(ratio => `<line x1="${left}" x2="${right}" y1="${y(ceiling * ratio)}" y2="${y(ceiling * ratio)}" class="analytics-grid-line"/>`).join('')}<polygon class="keyword-line-area" points="${x(0)},${bottom} ${points} ${x(rows.length - 1)},${bottom}"/><polyline class="keyword-trend-line" points="${points}"/>${rows.map((row, index) => `<g class="keyword-trend-point${row.date === data.date ? ' is-selected' : ''}" data-daily-count="${row.count}"><circle cx="${x(index)}" cy="${y(row.count)}" r="4"/><text x="${x(index)}" y="${y(row.count) - 13}" text-anchor="middle">${number(row.count)}</text></g>`).join('')}</svg><div class="keyword-day-tabs" style="padding-inline:${left}px">${rows.map(row => `<button type="button" class="keyword-day${row.date === data.date ? ' is-selected' : ''}" data-analysis-date="${row.date}" aria-pressed="${row.date === data.date}" aria-label="查看 ${row.date}，${number(row.count)} 篇">${row.date.slice(5).replace('-', '/')}</button>`).join('')}</div></div></div><p class="keyword-daily-note">${data.partial ? '末日截至 ' + new Date(Date.parse(data.to) + offset * 60000).toISOString().slice(11, 16) : '各日按全天统计'}</p>`;
    }
    function renderChart() {
        if (!data || !el('keywordHourChart').clientWidth) return;
        const series = selectedTerm(), box = el('keywordHourChart');
        const buckets = Array.from({ length: 24 / hours }, (_, index) => {
            const rows = series.hourly.slice(index * hours, (index + 1) * hours);
            return { hour: index * hours, count: rows.reduce((sum, row) => sum + row.count, 0), available: rows.some(row => row.available) };
        });
        const max = Math.max(...buckets.map(row => row.count), 1), ceiling = Math.max(4, Math.ceil(max / 4) * 4);
        const width = Math.max(box.clientWidth, 46 + buckets.length * Math.max(42, number(max).length * 7 + 20));
        const left = 32, right = width - 12, top = 34, bottom = 184, step = (right - left) / buckets.length, bar = Math.min(38, step * .56);
        const x = index => left + (index + .5) * step, y = n => bottom - n / ceiling * (bottom - top);
        const time = hour => String(hour).padStart(2, '0') + ':00';
        box.innerHTML = `<div class="keyword-chart-scroll"><svg width="${width}" height="220" viewBox="0 0 ${width} 220" aria-hidden="true">${Array.from({length:5},(_,i)=>{const n=ceiling*i/4;return `<line x1="${left}" x2="${right}" y1="${y(n)}" y2="${y(n)}" class="analytics-grid-line"/><text x="${left-8}" y="${y(n)+4}" text-anchor="end">${number(n)}</text>`;}).join('')}${buckets.map((row,index)=>{
            const h = bottom-y(row.count), value=row.available?number(row.count):'—', labelWidth=Math.max(28,value.length*7+14);
            return `<g data-keyword-bucket="${index}" class="keyword-chart-column${row.available?'':' is-future'}"><rect class="keyword-bar" x="${x(index)-bar/2}" y="${row.available?y(row.count):top}" width="${bar}" height="${row.available?h:bottom-top}" rx="3"/><g class="analytics-bar-label"><rect x="${x(index)-labelWidth/2}" y="${(row.available?y(row.count):top)-27}" width="${labelWidth}" height="20" rx="5"/><text class="analytics-bar-value" x="${x(index)}" y="${(row.available?y(row.count):top)-17}" dominant-baseline="central" text-anchor="middle">${value}</text></g><text x="${x(index)}" y="209" text-anchor="middle">${time(row.hour)}</text></g>`;
        }).join('')}</svg></div>`;
        const scroller=box.firstElementChild;
        const select = index => {
            chartIndex=Math.max(0,Math.min(buckets.length-1,index));
            const row=buckets[chartIndex];
            const end=Math.min(Date.parse(data.from)+(row.hour+hours)*3600000,Date.parse(data.to));
            const endText=new Date(end+offset*60000).toISOString().slice(11,16);
            const readout=`${data.date} ${time(row.hour)}–${row.hour+hours===24&&!data.partial?'24:00':endText} · ${row.available?number(row.count)+' 篇':'尚未到该时段'}`;
            el('keywordChartReadout').textContent=row.available?readout:`${data.date} ${time(row.hour)}–${time(row.hour+hours)} · 尚未到该时段`;
            box.setAttribute('aria-label',el('keywordChartReadout').textContent+'。左右方向键查看相邻时段。');
            box.querySelectorAll('[data-keyword-bucket]').forEach((column,i)=>column.classList.toggle('is-active',i===chartIndex));
            if(document.activeElement===box){const start=x(chartIndex)-step/2;if(start<scroller.scrollLeft)scroller.scrollLeft=start;else if(start+step>scroller.scrollLeft+box.clientWidth)scroller.scrollLeft=start+step-box.clientWidth;}
        };
        box.onpointermove=e=>{const column=e.target.closest('[data-keyword-bucket]');if(column)select(Number(column.dataset.keywordBucket));};
        box.onfocus=()=>select(chartIndex);
        box.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();select(e.key==='Home'?0:e.key==='End'?buckets.length-1:chartIndex+(e.key==='ArrowRight'?1:-1));};
        const reset=()=>{if(document.activeElement===box)return;box.querySelectorAll('.is-active').forEach(n=>n.classList.remove('is-active'));el('keywordChartReadout').textContent=`${data.date} · 每柱 ${hours} 小时 · ${data.partial?'截至 '+new Date(Date.parse(data.to)+offset*60000).toISOString().slice(11,16):'全天'} · UTC${offset>=0?'+':'−'}${Math.abs(offset/60)}`;};
        box.onpointerleave=box.onblur=reset;reset();
    }
    function render() {
        el('keywordAnalysisResults').hidden=false;
        const series=selectedTerm(),total=series.total;
        el('keywordComparison').innerHTML=data.series.map((row,i)=>`<button type="button" data-term-index="${i}" class="keyword-summary${i===selected?' is-selected':''}" aria-pressed="${i===selected}"><span>${esc(row.term)}</span><strong>${number(row.total)}<small>篇</small></strong><span>占当日收录 ${percent(row.total,data.totalPosts)}</span></button>`).join('');
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
        if(!config)return;
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
        init() {
            el('analysisDate').value=el('analysisDate').max=localDate();
            el('keywordAnalysisForm').addEventListener('submit',e=>{e.preventDefault();submit();});
            el('keywordAddCompare').addEventListener('click',()=>{const input=[el('analysisCompare1'),el('analysisCompare2')].find(n=>n.hidden);if(!input)return;input.hidden=false;input.focus();el('keywordAddCompare').hidden=!el('analysisCompare2').hidden;});
            el('keywordComparison').addEventListener('click',e=>{const button=e.target.closest('[data-term-index]');if(button){selected=Number(button.dataset.termIndex);render();}});
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
        tick(){if(config&&!busy&&Date.now()-lastLoad>60000)load(true);el('analysisDate').max=localDate();},
    };
};
