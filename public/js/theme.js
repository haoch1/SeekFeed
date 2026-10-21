/* One preference, resolved before paint and kept in sync with the operating system. */
(() => {
    const root = document.documentElement;
    const system = window.matchMedia?.('(prefers-color-scheme: dark)');
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    // New preference namespace makes system the upgrade default as well as the first-visit default.
    const storageKey = 'seekfeed.themePreference';
    const normalize = value => ['light', 'dark', 'system'].includes(value) ? value : 'system';
    const names = { light: '浅色模式', dark: '深色模式', system: '跟随系统' };
    let preference = 'system', transition, timer, initialized = false, canAnimate = () => true;
    try { preference = normalize(localStorage.getItem(storageKey)); } catch { /* System preference remains available without storage. */ }
    const resolved = () => preference === 'system' ? (system?.matches ? 'dark' : 'light') : preference;
    function apply() {
        const theme = resolved();
        root.dataset.theme = theme;
        root.dataset.themePreference = preference;
        // Declare the palette actually rendered; avoid a second automatic recoloring pass.
        root.style.colorScheme = `only ${theme}`;
        document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', `only ${theme}`);
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101012' : '#f4f5f7');
        const label = `主题：${names[preference]}${preference === 'system' ? `（当前${theme === 'dark' ? '深色' : '浅色'}）` : ''}`;
        document.getElementById('themeToggleBtn')?.setAttribute('aria-label', label);
        const hint = document.getElementById('themeToggleHint');
        if (hint) hint.textContent = label;
        document.querySelectorAll('[data-theme-option]').forEach(button => button.setAttribute('aria-checked', String(button.dataset.themeOption === preference)));
    }
    function cancelTransition() {
        transition?.skipTransition();
        clearTimeout(timer);
        root.classList.remove('theme-transition');
    }
    function setPreference(value) {
        preference = normalize(value);
        try { localStorage.setItem(storageKey, preference); } catch { /* Keep the choice for this page. */ }
        cancelTransition();
        if (reduced?.matches || !canAnimate()) return apply();
        if (document.startViewTransition) {
            transition = document.startViewTransition(apply);
            transition.ready.catch(() => {});
        } else {
            root.classList.add('theme-transition');
            getComputedStyle(document.body).backgroundColor;
            apply();
            timer = setTimeout(() => root.classList.remove('theme-transition'), 360);
        }
    }
    function systemChanged() { if (preference === 'system') { cancelTransition(); apply(); } }
    system?.addEventListener('change', systemChanged);
    window.addEventListener('pageshow', systemChanged);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) systemChanged(); });
    window.addEventListener('storage', event => {
        if (event.key !== storageKey && event.key !== null) return;
        preference = normalize(event.newValue);
        cancelTransition(); apply();
    });
    function init(options = {}) {
        if (initialized) return;
        initialized = true;
        canAnimate = options.canAnimate || canAnimate;
        const button = document.getElementById('themeToggleBtn'), menu = document.getElementById('themeOptions');
        apply();
        if (!button || !menu) return;
        const items = [...menu.querySelectorAll('[data-theme-option]')];
        function close(focus = false) {
            menu.hidden = true;
            button.setAttribute('aria-expanded', 'false');
            if (focus) button.focus({ preventScroll: true });
        }
        function open(last = false) {
            window.SeekFeedControls?.closeSelect();
            menu.hidden = false;
            button.setAttribute('aria-expanded', 'true');
            (last ? items.at(-1) : items.find(item => item.dataset.themeOption === preference) || items[0]).focus();
        }
        button.addEventListener('click', () => menu.hidden ? open() : close(true));
        button.addEventListener('keydown', event => {
            if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
            event.preventDefault(); open(event.key === 'ArrowUp');
        });
        menu.addEventListener('click', event => {
            const item = event.target.closest('[data-theme-option]');
            if (!item) return;
            close(true); setPreference(item.dataset.themeOption);
        });
        menu.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
            if (event.key === 'Tab') { close(); return; }
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const index = items.indexOf(document.activeElement);
            items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
        });
        document.addEventListener('pointerdown', event => { if (!button.parentElement.contains(event.target)) close(); });
        document.addEventListener('focusin', event => { if (!button.parentElement.contains(event.target)) close(); });
        window.addEventListener('popstate', () => close());
    }
    window.SeekFeedTheme = { init, setPreference, cancelTransition, getPreference: () => preference };
    apply();
})();
