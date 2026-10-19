/* Shared inline icons, accessible selects, and form feedback. */
(() => {
    const paths = JSON.parse(document.getElementById('seekfeedIcons')?.textContent || '{}');
    const icon = name => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.info || ''}</svg>`;
    const selects = new Map();
    let active;
    const close = () => {
        if (!active) return;
        active.menu.remove();
        active.button.setAttribute('aria-expanded', 'false');
        active.button.removeAttribute('aria-activedescendant');
        active = null;
    };
    function enhance(select) {
        if (selects.has(select)) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `${select.className} select-trigger`;
        button.id = `${select.id}Trigger`;
        button.setAttribute('role', 'combobox');
        button.setAttribute('aria-haspopup', 'listbox');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', `${select.id}Menu`);
        button.setAttribute('aria-label', select.getAttribute('aria-label') || document.querySelector(`label[for="${select.id}"]`)?.textContent || '选择选项');
        select.after(button);
        select.classList.add('select-native');
        select.tabIndex = -1;
        select.setAttribute('aria-hidden', 'true');
        const state = { select, button, menu: null, index: 0 };
        const refresh = () => {
            button.innerHTML = `<span></span>${icon('chevron-down')}`;
            button.firstElementChild.textContent = select.selectedOptions[0]?.textContent || '请选择';
            button.disabled = select.disabled;
            button.hidden = select.style.display === 'none' || select.hidden;
        };
        state.refresh = refresh;
        selects.set(select, state);
        const highlight = index => {
            const options = [...state.menu.children];
            state.index = (index + options.length) % options.length;
            options.forEach((option, i) => option.classList.toggle('highlighted', i === state.index));
            const current = options[state.index];
            button.setAttribute('aria-activedescendant', current.id);
            current.scrollIntoView({ block: 'nearest' });
        };
        const choose = index => {
            if (select.options[index].disabled) return;
            select.selectedIndex = index;
            refresh(); close();
            select.dispatchEvent(new Event('change', { bubbles: true }));
            button.focus({ preventScroll: true });
        };
        const open = () => {
            close();
            const menu = document.createElement('div');
            menu.id = `${select.id}Menu`;
            menu.className = 'select-menu';
            menu.setAttribute('role', 'listbox');
            menu.setAttribute('aria-label', button.getAttribute('aria-label'));
            [...select.options].forEach((option, i) => {
                const row = document.createElement('div');
                row.id = `${select.id}Option${i}`;
                row.className = 'select-option';
                row.setAttribute('role', 'option');
                row.setAttribute('aria-selected', String(option.selected));
                row.setAttribute('aria-disabled', String(option.disabled));
                row.innerHTML = `<span></span>${option.selected ? icon('check') : ''}`;
                row.firstElementChild.textContent = option.textContent;
                row.addEventListener('pointerdown', e => e.preventDefault());
                row.addEventListener('click', () => choose(i));
                row.addEventListener('pointermove', () => highlight(i));
                menu.append(row);
            });
            document.body.append(menu);
            const rect = button.getBoundingClientRect();
            const height = Math.min(menu.scrollHeight, 260);
            const below = innerHeight - rect.bottom - 12;
            menu.style.width = `${Math.max(rect.width, 140)}px`;
            menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - Math.max(rect.width, 140) - 8))}px`;
            menu.style.maxHeight = `${Math.max(80, Math.min(260, Math.max(below, rect.top - 12)))}px`;
            menu.style.top = `${below >= height || below >= rect.top ? rect.bottom + 5 : Math.max(8, rect.top - Math.min(height, rect.top - 12) - 5)}px`;
            state.menu = menu; active = state;
            button.setAttribute('aria-expanded', 'true');
            highlight(Math.max(0, select.selectedIndex));
        };
        button.addEventListener('click', () => active === state ? close() : open());
        let typed = '', timer;
        button.addEventListener('keydown', e => {
            if (e.key === 'Tab') return close();
            if (e.key === 'Escape' && active === state) { e.preventDefault(); e.stopPropagation(); return close(); }
            if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(e.key)) {
                e.preventDefault();
                if (active !== state) return open();
                if (e.key === 'Enter' || e.key === ' ') return choose(state.index);
                highlight(e.key === 'Home' ? 0 : e.key === 'End' ? select.options.length - 1 : state.index + (e.key === 'ArrowUp' ? -1 : 1));
            } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
                if (active !== state) open();
                clearTimeout(timer); typed += e.key.toLocaleLowerCase();
                const found = [...select.options].findIndex(o => o.textContent.toLocaleLowerCase().startsWith(typed));
                if (found >= 0) highlight(found);
                timer = setTimeout(() => { typed = ''; }, 700);
            }
        });
        document.querySelector(`label[for="${select.id}"]`)?.addEventListener('click', e => { e.preventDefault(); button.focus(); });
        new MutationObserver(refresh).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'style'] });
        select.addEventListener('change', refresh);
        select.form?.addEventListener('reset', () => setTimeout(refresh));
        refresh();
    }
    async function pending(button, action, label = '处理中…') {
        if (!button || button.disabled) return;
        const content = button.innerHTML;
        button.style.minWidth = `${button.getBoundingClientRect().width}px`;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.innerHTML = `${icon('sync')}<span>${label}</span>`;
        button.classList.add('is-pending');
        try { return await action(); }
        finally {
            button.innerHTML = content; button.disabled = false;
            button.removeAttribute('aria-busy'); button.classList.remove('is-pending'); button.style.minWidth = '';
        }
    }
    document.addEventListener('pointerdown', e => { if (active && !active.button.contains(e.target) && !active.menu.contains(e.target)) close(); });
    document.addEventListener('scroll', e => { if (active && !active.menu.contains(e.target)) close(); }, true);
    addEventListener('resize', close);
    document.addEventListener('click', e => {
        const button = e.target.closest('[data-toggle-secret]');
        if (!button) return;
        const input = document.getElementById(button.dataset.toggleSecret);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.innerHTML = icon(show ? 'eye-off' : 'eye');
        button.setAttribute('aria-pressed', String(show));
        button.setAttribute('aria-label', `${show ? '隐藏' : '显示'}${input.id === 'botToken' ? ' Bot Token' : '密码'}`);
    });
    window.SeekFeedControls = { icon, pending, closeSelect: close, refreshSelects: () => selects.forEach(s => s.refresh()) };
    document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('select').forEach(enhance));
})();
