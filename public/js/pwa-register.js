// Revalidate suspended pages without discarding unsaved configuration.
(() => {
    const version = document.querySelector('meta[name="seekfeed-version"]')?.content;
    let registration, checking = false, lastCheck = 0, lastWorkerCheck = 0, notice;
    function offerUpdate() {
        if (notice) return;
        notice = document.createElement('div');
        notice.className = 'app-update-notice';
        notice.setAttribute('role', 'status');
        const label = document.createElement('span');
        label.textContent = '页面已更新';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary';
        button.textContent = '加载新版';
        button.addEventListener('click', () => location.reload());
        notice.append(label, button);
        document.body.append(notice);
    }
    async function check(force = false) {
        if (!version || document.hidden || checking || (!force && Date.now() - lastCheck < 60000)) return;
        checking = true;
        lastCheck = Date.now();
        try {
            const response = await fetch('/api/app-version', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
            if (!response.ok) return;
            const latest = (await response.json()).version;
            if (!/^[a-f0-9]{16}$/.test(latest) || latest === version) return;
            if (/^\/(settings(?:\/|$)|subscriptions(?:\/|$)|init(?:\/|$))/.test(location.pathname)
                || document.querySelector('dialog[open], .drawer-open')) {
                offerUpdate();
                return;
            }
            // A stale intermediary must not cause a reload loop.
            try {
                const previous = JSON.parse(sessionStorage.getItem('seekfeed.reload') || 'null');
                if (previous?.version === latest && Date.now() - previous.at < 30000) return offerUpdate();
                sessionStorage.setItem('seekfeed.reload', JSON.stringify({ version: latest, at: Date.now() }));
            } catch { return offerUpdate(); }
            location.reload();
        } catch { /* Retain the current page when offline or temporarily unavailable. */ }
        finally { checking = false; }
    }
    function resume(force = false) {
        if (document.hidden) return;
        check(force);
        if (registration && (force || Date.now() - lastWorkerCheck >= 60000)) {
            lastWorkerCheck = Date.now();
            registration.update().catch(() => {});
        }
    }
    window.addEventListener('pageshow', event => resume(event.persisted));
    document.addEventListener('visibilitychange', () => resume());
    if ('serviceWorker' in navigator && window.isSecureContext) {
        navigator.serviceWorker.addEventListener('controllerchange', () => check(true));
        window.addEventListener('load', async () => {
            try {
                registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
                lastWorkerCheck = Date.now();
                await registration.update();
            } catch { /* Application navigation does not require a Service Worker. */ }
            check();
        });
    }
})();
