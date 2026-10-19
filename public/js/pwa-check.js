document.addEventListener('DOMContentLoaded', async () => {
    const set = (id, value) => { document.getElementById(id).textContent = value; };
    set('pwaSecure', window.isSecureContext ? '已启用' : '需要 HTTPS 或 localhost');
    set('pwaMode', matchMedia('(display-mode: standalone)').matches ? '独立应用' : '浏览器');
    try {
        const response = await fetch('/manifest.json');
        if (!response.ok) throw new Error('清单不可用');
        set('pwaName', (await response.json()).name);
    } catch {
        set('pwaName', '清单加载失败，请刷新');
    }
    if (!window.isSecureContext || !('serviceWorker' in navigator)) {
        set('pwaWorker', '当前浏览器环境不支持');
        return;
    }
    try {
        const registration = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise(resolve => setTimeout(() => resolve(null), 4000)),
        ]);
        set('pwaWorker', registration?.active ? '已激活' : '等待激活，请刷新');
    } catch {
        set('pwaWorker', '缓存不可用，请刷新');
    }
});
