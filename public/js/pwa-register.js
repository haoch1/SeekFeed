// RSS monitoring runs on the server independently of the browser.
if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(error => console.warn('静态资源缓存不可用', error));
    });
}
