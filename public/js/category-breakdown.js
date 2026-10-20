/* Shared category detail: every count stays beside its name and its share. */
window.SeekFeedCategoryBreakdown = function (box, rows, total, { escapeHtml: esc, getCategoryName, overview = false }) {
    const number = value => Number(value || 0).toLocaleString('zh-CN');
    const share = value => total ? `${(value / total * 100).toFixed(1).replace(/\.0$/, '')}%` : '—';
    const previous = box.dataset.selectedCategory;
    let pinned = rows.findIndex(row => row.category === previous);
    let position = 0;
    box.classList.add('category-breakdown');
    if (!rows.length || !total) {
        box.innerHTML = '<p class="keyword-no-data">暂无分类记录</p>';
        delete box.dataset.selectedCategory;
        box.onpointermove = box.onpointerleave = box.onfocusin = box.onfocusout = box.onclick = box.onkeydown = null;
        return;
    }
    const arcs = rows.map((row, index) => {
        const begin = position, portion = row.count / total * 100;
        position += portion;
        return `<circle data-category-arc="${index}" cx="64" cy="64" r="52" pathLength="100" transform="rotate(-90 64 64)" stroke-dasharray="${portion} ${100 - portion}" stroke-dashoffset="${-begin}" style="--category-color:var(--analytics-color-${index % 9})"/>`;
    }).join('');
    box.innerHTML = `<div ${overview ? 'id="analyticsDonut"' : ''} class="category-breakdown-ring${overview ? '' : ' keyword-category-ring'}" role="img" aria-label="${esc(rows.map(row => `${getCategoryName(row.category)} ${number(row.count)} 篇，占 ${share(row.count)}`).join('；'))}"><svg viewBox="0 0 128 128" aria-hidden="true">${arcs}</svg><div><strong ${overview ? 'id="analyticsCategoryShare"' : ''}>${number(total)}</strong><span ${overview ? 'id="analyticsLeadingCategory"' : ''}>篇帖子</span></div></div><div ${overview ? 'id="analyticsCategoryLegend"' : ''} class="category-breakdown-legend${overview ? '' : ' keyword-category-legend'}"><div class="category-breakdown-columns" aria-hidden="true"><span>分类</span><span>帖子数</span><span>占比</span></div><div class="category-breakdown-rows" role="group" aria-label="分类明细，点击查看环图，方向键切换">${rows.map((row, index) => `<button type="button" class="category-breakdown-row" data-category-index="${index}" aria-pressed="false" aria-label="${esc(getCategoryName(row.category))}，${number(row.count)} 篇，占 ${share(row.count)}" style="--category-color:var(--analytics-color-${index % 9})"><span class="category-breakdown-label"><i></i><span title="${esc(getCategoryName(row.category))}">${esc(getCategoryName(row.category))}</span></span><span class="category-breakdown-amount"><strong>${number(row.count)}</strong><small>篇</small></span><span class="category-breakdown-share">${share(row.count)}</span></button>`).join('')}</div></div>`;
    const buttons = [...box.querySelectorAll('[data-category-index]')];
    const ring = box.querySelector('.category-breakdown-ring');
    function highlight(index) {
        const row = rows[index];
        ring.querySelector('strong').textContent = number(row ? row.count : total);
        ring.querySelector('div > span').textContent = row ? `${getCategoryName(row.category)} · ${share(row.count)}` : '篇帖子';
        box.querySelectorAll('[data-category-arc]').forEach((arc, i) => arc.classList.toggle('is-muted', Boolean(row) && i !== index));
        buttons.forEach((button, i) => {
            button.classList.toggle('is-active', i === index);
            button.setAttribute('aria-pressed', String(i === pinned));
        });
    }
    const targetIndex = event => {
        const target = event.target.closest('[data-category-index], [data-category-arc]');
        return target ? Number(target.dataset.categoryIndex ?? target.dataset.categoryArc) : -1;
    };
    box.onpointermove = event => { const index = targetIndex(event); if (index >= 0) highlight(index); };
    box.onpointerleave = () => highlight(pinned);
    box.onfocusin = event => { const index = targetIndex(event); if (index >= 0) highlight(index); };
    box.onfocusout = event => { if (!box.contains(event.relatedTarget)) highlight(pinned); };
    box.onclick = event => {
        const index = targetIndex(event);
        if (index < 0) return;
        pinned = pinned === index ? -1 : index;
        if (pinned >= 0) box.dataset.selectedCategory = rows[pinned].category;
        else delete box.dataset.selectedCategory;
        highlight(pinned);
    };
    box.onkeydown = event => {
        const index = targetIndex(event);
        if (index < 0) return;
        if (event.key === 'Escape') {
            pinned = -1; delete box.dataset.selectedCategory; highlight(-1);
            event.preventDefault(); event.stopPropagation();
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length;
            const scroll = scrollY;
            buttons[next].focus({ preventScroll: true });
            const list = box.querySelector('.category-breakdown-rows'), button = buttons[next];
            if (button.offsetTop < list.scrollTop) list.scrollTop = button.offsetTop;
            else if (button.offsetTop + button.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = button.offsetTop + button.offsetHeight - list.clientHeight;
            if (scrollY !== scroll) scrollTo({ top: scroll, behavior: 'instant' });
        }
    };
    highlight(pinned);
};
