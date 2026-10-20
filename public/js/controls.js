/* Shared inline icons, accessible selects, and form feedback. */
(() => {
    const paths = JSON.parse(document.getElementById('seekfeedIcons')?.textContent || '{}');
    const icon = name => `<svg data-icon="${name}" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.info || ''}</svg>`;
    const selects = new Map();
    const chartInspectors = new Map();
    function dismissCharts(target) {
        chartInspectors.forEach((dismiss, box) => { if (!target || !box.contains(target)) dismiss(); });
    }
    document.addEventListener('pointerdown', event => dismissCharts(event.target));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') dismissCharts(); });
    window.addEventListener('scroll', () => dismissCharts(), { passive: true });
    window.addEventListener('resize', () => dismissCharts());
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const pressAnimations = new Map();
    const controlSelector = 'button, a.btn, a.icon-btn, a.nav-item, a.workspace-brand, summary, label.mode-option';
    let pressed;
    function controlFor(target) {
        const control = target instanceof Element && target.closest(controlSelector);
        return control && !control.matches(':disabled, [aria-disabled="true"]') && !control.closest('[inert]') ? control : null;
    }
    function feedback(control, hold = false) {
        if (!control || reducedMotion.matches || !control.animate) return;
        const current = getComputedStyle(control);
        const previous = pressAnimations.get(control);
        const baseShadow = previous?.baseShadow ?? current.boxShadow;
        const scale = current.scale === 'none' ? '1' : current.scale;
        const shadow = current.boxShadow;
        previous?.animation.cancel();
        const shade = current.getPropertyValue('--control-press-shade').trim();
        const pressedShadow = `${baseShadow === 'none' ? '' : baseShadow + ', '}inset 0 0 0 999px ${shade}`;
        // Fixed dropdown menus need a stable trigger rectangle throughout pointer feedback.
        const pressedScale = control.matches('.select-trigger') ? '1' : '.97';
        // A quick click still completes a visible press and release, independent of request time.
        const animation = control.animate(hold ? [
            { scale, boxShadow: shadow }, { scale: pressedScale, boxShadow: pressedShadow },
        ] : [
            { scale, boxShadow: shadow },
            { scale: pressedScale, boxShadow: pressedShadow, offset: .22 },
            { scale: '1', boxShadow: baseShadow },
        ], { duration: hold ? 90 : 360, easing: 'cubic-bezier(.2,.7,.2,1)', fill: hold ? 'forwards' : 'none' });
        animation.id = hold ? 'control-press' : 'control-release';
        const state = { animation, baseShadow };
        pressAnimations.set(control, state);
        animation.finished.then(() => {
            if (!hold && pressAnimations.get(control) === state) pressAnimations.delete(control);
        }, () => {});
    }
    document.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        pressed = controlFor(event.target);
        feedback(pressed, true);
    }, true);
    document.addEventListener('pointerup', () => {
        feedback(pressed);
        pressed = null;
    }, true);
    function cancelPress() {
        if (pressed) feedback(pressed);
        pressed = null;
    }
    document.addEventListener('pointercancel', cancelPress, true);
    addEventListener('blur', cancelPress);
    document.addEventListener('click', event => {
        const control = controlFor(event.target);
        // Pointer release already starts feedback. Keyboard/assistive clicks take this path.
        if (control && (event.detail === 0 || !pressAnimations.has(control))) feedback(control);
    }, true);
    document.addEventListener('keydown', event => {
        if (event.repeat || !['Enter', ' '].includes(event.key)) return;
        const control = controlFor(event.target);
        if (control && control.matches('button, summary, label.mode-option')) feedback(control);
    }, true);
    reducedMotion.addEventListener('change', () => {
        if (!reducedMotion.matches) return;
        pressAnimations.forEach(state => state.animation.cancel());
        pressAnimations.clear();
        pressed = null;
    });
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
            if (!button.firstElementChild) button.innerHTML = `<span></span>${icon('chevron-down')}`;
            const chosen = [...select.selectedOptions].filter(option => option.value);
            const label = select.multiple ? (chosen.length === 0 ? select.options[0].textContent : chosen.length === 1 ? chosen[0].textContent : `已选 ${chosen.length} 个分类`) : select.selectedOptions[0]?.textContent || '请选择';
            if (button.firstElementChild.textContent !== label) button.firstElementChild.textContent = label;
            button.dataset.selected = String(select.multiple && chosen.length > 0);
            button.title = select.multiple && chosen.length ? chosen.map(option => option.textContent).join('、') : '';
            if (state.menu) [...state.menu.querySelectorAll('[role="option"]')].forEach((row, index) => {
                const selected = select.options[index].value ? select.options[index].selected : !chosen.length;
                row.setAttribute('aria-selected', String(selected));
                if (select.multiple) row.firstElementChild.innerHTML = selected ? icon('check') : '';
            });
            button.disabled = select.disabled;
            button.hidden = select.style.display === 'none' || select.hidden;
        };
        state.refresh = refresh;
        selects.set(select, state);
        const highlight = index => {
            const options = [...state.menu.querySelectorAll('[role="option"]')];
            state.index = (index + options.length) % options.length;
            options.forEach((option, i) => option.classList.toggle('highlighted', i === state.index));
            const current = options[state.index];
            button.setAttribute('aria-activedescendant', current.id);
            const top = current.offsetTop, bottom = top + current.offsetHeight;
            if (top < state.menu.scrollTop) state.menu.scrollTop = Math.max(0, top - 4);
            else if (bottom > state.menu.scrollTop + state.menu.clientHeight) state.menu.scrollTop = bottom - state.menu.clientHeight + 4;
        };
        const choose = index => {
            if (select.options[index].disabled) return;
            if (select.multiple) {
                if (!select.options[index].value) [...select.options].forEach(option => { option.selected = false; });
                else { select.options[0].selected = false; select.options[index].selected = !select.options[index].selected; }
                refresh();
            } else { select.selectedIndex = index; refresh(); close(); }
            select.dispatchEvent(new Event('change', { bubbles: true }));
            button.focus({ preventScroll: true });
            feedback(button);
        };
        const open = () => {
            close();
            const menu = document.createElement('div');
            menu.id = `${select.id}Menu`;
            menu.className = 'select-menu';
            menu.setAttribute('role', 'listbox');
            if (select.multiple) { menu.dataset.multiple = 'true'; menu.setAttribute('aria-multiselectable', 'true'); }
            menu.setAttribute('aria-label', button.getAttribute('aria-label'));
            [...select.options].forEach((option, i) => {
                const row = document.createElement('div');
                row.id = `${select.id}Option${i}`;
                row.className = 'select-option';
                row.setAttribute('role', 'option');
                row.setAttribute('aria-selected', String(option.selected));
                row.setAttribute('aria-disabled', String(option.disabled));
                row.innerHTML = select.multiple ? '<span class="select-check" aria-hidden="true"></span><span></span>' : `<span></span>${option.selected ? icon('check') : ''}`;
                (select.multiple ? row.lastElementChild : row.firstElementChild).textContent = option.textContent;
                row.addEventListener('pointerdown', e => e.preventDefault());
                row.addEventListener('click', () => choose(i));
                row.addEventListener('pointermove', () => highlight(i));
                menu.append(row);
            });
            if (select.multiple) {
                const actions = document.createElement('div'); actions.className = 'select-menu-actions'; actions.setAttribute('role', 'group'); actions.setAttribute('aria-label', '分类批量选择');
                for (const [text, checked] of [['全选', true], ['清空', false]]) {
                    const action = document.createElement('button'); action.type = 'button'; action.className = 'btn btn-text'; action.textContent = text;
                    action.addEventListener('click', () => { [...select.options].forEach(option => { option.selected = Boolean(option.value) && checked; }); refresh(); select.dispatchEvent(new Event('change', { bubbles: true })); button.focus({ preventScroll: true }); });
                    actions.append(action);
                }
                menu.append(actions);
            }
            document.body.append(menu);
            state.menu = menu;
            state.place = () => {
                const rect = button.getBoundingClientRect();
                if (rect.bottom < 0 || rect.top > innerHeight) return close();
                const height = Math.min(menu.scrollHeight, 260);
                const viewportWidth = document.documentElement.clientWidth;
                const width = Math.min(viewportWidth - 16, Math.max(rect.width, select.multiple ? 210 : 140));
                const below = innerHeight - rect.bottom - 12;
                menu.style.width = `${width}px`;
                menu.style.left = `${Math.max(8, Math.min(rect.left, viewportWidth - width - 8))}px`;
                menu.style.maxHeight = `${Math.max(80, Math.min(260, Math.max(below, rect.top - 12)))}px`;
                menu.style.top = `${below >= height || below >= rect.top ? rect.bottom + 5 : Math.max(8, rect.top - Math.min(height, rect.top - 12) - 5)}px`;
            };
            active = state; state.place(); refresh();
            if (active !== state) return;
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
    function beginPending(button, label = '处理中') {
        if (!button || button.disabled) return null;
        const original = { width: button.style.width, height: button.style.height, position: button.style.position, label: button.getAttribute('aria-label') };
        // Layout dimensions must not capture the temporary press scale.
        const style = getComputedStyle(button);
        const width = style.width, height = style.height;
        const content = document.createElement('span');
        content.className = 'button-content';
        content.append(...button.childNodes);
        const progress = document.createElement('span');
        progress.className = 'button-progress';
        progress.setAttribute('aria-hidden', 'true');
        progress.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" opacity=".2"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>';
        if (button.offsetWidth && button.offsetHeight) {
            button.style.width = width;
            button.style.height = height;
        }
        if (getComputedStyle(button).position === 'static') button.style.position = 'relative';
        button.append(content, progress);
        const leadingIcon = content.querySelector('svg');
        const refreshIcon = leadingIcon?.dataset.icon === 'sync';
        // Same full, eased turn as the panel refresh controls, even for cached responses.
        // Data can render immediately; only repeated button activation waits for the turn.
        const turn = refreshIcon && !reducedMotion.matches ? leadingIcon.animate([
            { transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' },
        ], { duration: 1000, easing: 'cubic-bezier(.38,.08,.24,1)' }) : null;
        if (turn) turn.id = 'refresh-turn';
        const cancelTurn = () => turn?.cancel();
        reducedMotion.addEventListener('change', cancelTurn, { once: true });
        if (leadingIcon) {
            const bounds = button.getBoundingClientRect();
            const iconBounds = leadingIcon.getBoundingClientRect();
            const scale = bounds.width / button.offsetWidth;
            progress.style.left = `${(iconBounds.left - bounds.left) / scale - button.clientLeft}px`;
            progress.style.width = getComputedStyle(leadingIcon).width;
            progress.dataset.kind = 'icon';
        } else {
            progress.dataset.kind = 'line';
            progress.replaceChildren();
        }
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.setAttribute('aria-label', `${content.textContent.trim() || original.label || ''}，${label}`);
        button.classList.add('is-pending');
        // Keep the label visible; only an existing icon or the quiet bottom rail indicates progress.
        let shownAt = 0;
        const delay = setTimeout(() => {
            if (refreshIcon) return;
            shownAt = performance.now();
            button.classList.add('is-progress-visible');
        }, 280);
        let completion;
        return () => completion ||= (async () => {
            clearTimeout(delay);
            if (turn) await turn.finished.catch(() => {});
            reducedMotion.removeEventListener('change', cancelTurn);
            if (shownAt && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
                // Once shown, progress must remain readable rather than flash for a single frame.
                await new Promise(resolve => setTimeout(resolve, Math.max(0, 420 - (performance.now() - shownAt))));
                button.classList.remove('is-progress-visible');
                await new Promise(resolve => setTimeout(resolve, 160));
            }
            button.replaceChildren(...content.childNodes);
            button.disabled = false;
            button.removeAttribute('aria-busy');
            if (original.label === null) button.removeAttribute('aria-label'); else button.setAttribute('aria-label', original.label);
            button.classList.remove('is-pending', 'is-progress-visible');
            button.style.width = original.width;
            button.style.height = original.height;
            button.style.position = original.position;
        })();
    }
    async function pending(button, action, label = '处理中') {
        const finish = beginPending(button, label);
        if (!finish) return;
        try { return await action(); }
        finally { await finish(); }
    }
    document.addEventListener('pointerdown', e => { if (active && !active.button.contains(e.target) && !active.menu.contains(e.target)) close(); });
    // Focus, scroll anchoring and browser automation can queue a scroll after click.
    // Keep the popup attached to its trigger instead of dismissing a fresh menu.
    document.addEventListener('scroll', e => { if (active && !active.menu.contains(e.target)) active.place(); }, true);
    addEventListener('resize', close);
    document.addEventListener('click', e => {
        const button = e.target.closest('[data-toggle-secret]');
        if (!button) return;
        const input = document.getElementById(button.dataset.toggleSecret);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.innerHTML = icon(show ? 'eye-off' : 'eye');
        button.setAttribute('aria-pressed', String(show));
        button.setAttribute('aria-label', `${show ? '隐藏' : '显示'}${button.dataset.secretLabel || (input.id === 'botToken' ? ' Bot Token' : '密码')}`);
    });
    window.SeekFeedControls = { icon, beginPending, pending, closeSelect: close, refreshSelects: () => selects.forEach(s => s.refresh()), dismissCharts, chartInspection: (box, dismiss) => dismiss ? chartInspectors.set(box, dismiss) : chartInspectors.delete(box) };
    document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('select').forEach(enhance));
})();
