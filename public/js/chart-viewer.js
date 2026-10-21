/* Move the live panel into a modal so controls, data and inspection stay shared. */
(() => {
    let state;
    const dialog = document.createElement('dialog');
    dialog.className = 'chart-dialog';
    document.body.appendChild(dialog);
    function restore() {
        if (!state) return;
        const { panel, placeholder, button, markup, label, scrolls } = state;
        state = null;
        window.SeekFeedControls.dismissCharts();
        placeholder.replaceWith(panel);
        panel.classList.remove('chart-expanded');
        button.innerHTML = markup;
        button.setAttribute('aria-label', label);
        button.removeAttribute('aria-expanded');
        window.SeekFeedControls.unlockScroll(dialog);
        // ResizeObservers redraw at the original card width before restoring its scroll.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            scrolls.forEach(([selector, left]) => { const node = panel.querySelector(selector); if (node) node.scrollLeft = left; });
            if (!panel.closest('[hidden]')) button.focus({ preventScroll: true });
        }));
    }
    function close() { if (dialog.open) dialog.close(); restore(); }
    document.addEventListener('click', event => {
        const button = event.target.closest('[data-chart-expand]');
        if (!button) return;
        if (state) { close(); return; }
        const chart = document.getElementById(button.dataset.chartExpand);
        const panel = chart?.closest('.analytics-card, .keyword-panel');
        if (!panel || panel.closest('[hidden]')) return;
        window.SeekFeedControls.closeSelect();
        window.SeekFeedControls.dismissCharts();
        const placeholder = document.createElement('div');
        placeholder.style.height = `${panel.getBoundingClientRect().height}px`;
        placeholder.setAttribute('aria-hidden', 'true');
        const selectors = ['.analytics-plot-scroll', '.keyword-chart-scroll', '.keyword-line-scroll', '.analytics-heatmap-scroll'];
        const scrolls = selectors.map(selector => [selector, panel.querySelector(selector)?.scrollLeft || 0]);
        state = { panel, placeholder, button, markup: button.innerHTML, label: button.getAttribute('aria-label'), scrolls };
        panel.before(placeholder);
        panel.classList.add('chart-expanded');
        dialog.setAttribute('aria-label', state.label.replace('放大查看', '') + '，放大视图');
        dialog.appendChild(panel);
        button.innerHTML = window.SeekFeedControls.icon('shrink') + '<span class="header-tooltip" role="tooltip" id="' + chart.id + 'ExpandHint">缩小还原</span>';
        button.setAttribute('aria-label', '缩小图表');
        button.setAttribute('aria-expanded', 'true');
        window.SeekFeedControls.lockScroll(dialog);
        dialog.showModal();
        button.focus({ preventScroll: true });
    });
    // Capture Escape before a focused chart consumes it to clear a pinned tooltip.
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }, true);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', () => { if (!dialog.open) restore(); });
    let backdropPress = false;
    dialog.addEventListener('pointerdown', event => { backdropPress = event.target === dialog; });
    dialog.addEventListener('click', event => { if (backdropPress && event.target === dialog) close(); backdropPress = false; });
    window.addEventListener('popstate', close);
    // Programmatic route changes can hide the source page while the panel is moved.
    new MutationObserver(() => { if (state?.placeholder.closest('[hidden]')) close(); }).observe(document.getElementById('statsPage') || document.body, { attributes: true, attributeFilter: ['hidden'], subtree: true });
})();
