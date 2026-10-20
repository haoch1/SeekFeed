// Presentation cache only. Protected data is always authorized by the server.
(function () {
  const cacheKey = 'seekfeed.identity';
  function sessionToken() {
    try { return localStorage.getItem('sessionId'); } catch { return null; }
  }
  function usernameValue(value) {
    return typeof value === 'string' && value.trim() && value.length <= 128 ? value : null;
  }
  function avatarValue(value) {
    return typeof value === 'string' && value.startsWith('data:image/png;base64,') && value.length <= 410000 ? value : null;
  }
  function forgetCache() {
    try { sessionStorage.removeItem(cacheKey); } catch { /* Storage can be unavailable. */ }
  }
  const token = sessionToken();
  let cached;
  try { cached = JSON.parse(sessionStorage.getItem(cacheKey)); } catch { /* Ignore an invalid or unavailable cache. */ }
  const username = token && cached?.sessionId === token ? usernameValue(cached.username) : null;
  let state = { sessionId: token, username, avatar: username ? avatarValue(cached.avatar) : null, ready: !token || !!username };
  if (!username) forgetCache();
  document.documentElement.dataset.auth = token ? 'session' : 'guest';

  function renderAvatar(node) {
    node.style.visibility = state.ready ? 'visible' : 'hidden';
    if (!state.ready) return;
    if (!state.avatar) {
      if (node.childElementCount || node.textContent !== 'S') node.textContent = 'S';
      return;
    }
    const existing = node.firstElementChild;
    if (existing?.tagName === 'IMG' && existing.getAttribute('src') === state.avatar) return;
    const image = document.createElement('img');
    image.alt = '';
    image.addEventListener('error', () => {
      if (node.firstElementChild === image) node.textContent = 'S';
    }, { once: true });
    image.src = state.avatar;
    node.replaceChildren(image);
  }
  function render() {
    const label = document.getElementById('accountLabel');
    const text = state.username || (state.sessionId ? '账户' : '访客');
    if (label) {
      if (label.textContent !== text) label.textContent = text;
      label.style.visibility = state.ready ? 'visible' : 'hidden';
    }
    document.querySelectorAll('[data-account-avatar]').forEach(renderAvatar);
    document.getElementById('accountAvatarButton')?.setAttribute('aria-label', state.sessionId ? '账号与头像' : '登录');
    const hint = document.getElementById('accountAvatarHint');
    if (hint) hint.textContent = state.sessionId ? '账号与头像' : '点击登录';
  }
  function show(username, token, avatar) {
    // Ignore an old response after logout or a switch to a different session.
    if (token !== sessionToken()) return null;
    state = { sessionId: token, username: token ? usernameValue(username) : null, avatar: token ? avatarValue(avatar) : null, ready: true };
    document.documentElement.dataset.auth = token ? 'session' : 'guest';
    if (state.username) {
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ sessionId: token, username: state.username, avatar: state.avatar })); } catch { /* The server remains the source of account data. */ }
    } else forgetCache();
    render();
    return { ...state };
  }
  function clear() {
    forgetCache();
    const token = sessionToken();
    state = { sessionId: token, username: null, avatar: null, ready: !token };
    document.documentElement.dataset.auth = token ? 'session' : 'guest';
    render();
  }
  window.SeekFeedIdentity = { render, show, clear, get: () => ({ ...state }) };
})();
