"""Small public HTTP session; verification data never leaves this server."""
import json
import os
import re
import tempfile
import time
from pathlib import Path

COOKIE_NAMES = frozenset(('cf_clearance', '__cf_bm', '_cfuvid'))
DOMAINS = frozenset(('www.nodeseek.com', '.www.nodeseek.com', 'nodeseek.com', '.nodeseek.com'))
MAX_SESSION_BYTES = 16000


def session_path():
    value = os.environ.get('HOT_HTTP_SESSION_PATH')
    return Path(value) if value else None


def public_session(user_agent, cookies):
    # An empty UA means keep curl_cffi's own pinned profile and default headers.
    if not isinstance(user_agent, str) or len(user_agent) > 512 or '\r' in user_agent or '\n' in user_agent:
        raise ValueError('http_session_unavailable')
    kept = []
    for cookie in cookies:
        if not isinstance(cookie, dict):
            raise ValueError('http_session_unavailable')
        if cookie.get('name') not in COOKIE_NAMES or cookie.get('domain') not in DOMAINS or cookie.get('path', '/') != '/':
            continue
        value = cookie.get('value')
        expires = cookie.get('expires', -1)
        if not isinstance(value, str) or not value or len(value) > 4096 or any(ord(c) < 33 or ord(c) > 126 or c == ';' for c in value):
            raise ValueError('http_session_unavailable')
        if type(expires) not in (int, float) or not -1 <= expires <= 1e12:
            raise ValueError('http_session_unavailable')
        if expires > 0 and expires <= time.time():
            continue
        kept.append({'name': cookie['name'], 'value': value, 'domain': cookie['domain'], 'path': '/', 'expires': expires})
    if len(kept) > 12:
        raise ValueError('http_session_unavailable')
    return {'version': 1, 'userAgent': user_agent, 'cookies': kept}


def save_session(user_agent, cookies):
    path = session_path()
    if not path:
        raise ValueError('http_session_unavailable')
    data = json.dumps(public_session(user_agent, cookies), separators=(',', ':')).encode('utf-8')
    if len(data) > MAX_SESSION_BYTES:
        raise ValueError('http_session_unavailable')
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.hot-session-', delete=False) as file:
            temporary = Path(file.name)
            os.chmod(temporary, 0o600)
            file.write(data)
        os.replace(temporary, path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def load_session():
    path = session_path()
    if not path or not path.exists():
        return None
    try:
        if path.stat().st_size > MAX_SESSION_BYTES:
            raise ValueError()
        data = json.loads(path.read_text(encoding='utf-8'))
        if data.get('version') != 1 or not isinstance(data.get('cookies'), list):
            raise ValueError()
        return public_session(data.get('userAgent'), data['cookies'])
    except Exception:
        raise ValueError('http_session_unavailable') from None


def create_session():
    from curl_cffi import requests
    from curl_cffi.requests.impersonate import BrowserType
    data = load_session()
    profile = 'chrome'
    if data:
        major = re.search(r'Chrome/(\d+)\.', data['userAgent'])
        if major and 'chrome' + major[1] in {target.value for target in BrowserType}:
            profile = 'chrome' + major[1]
    session = requests.Session(impersonate=profile)
    if data:
        if data['userAgent']:
            session.headers['User-Agent'] = data['userAgent']
        for cookie in data['cookies']:
            session.cookies.set(cookie['name'], cookie['value'], domain=cookie['domain'], path='/', secure=True)
    return session


def persist_session(session):
    # There is no account Cookie handoff: only the bounded CF allowlist survives.
    if not session_path():
        return
    previous = load_session()
    cookies = [{'name': c.name, 'value': c.value, 'domain': c.domain, 'path': c.path, 'expires': c.expires or -1}
               for c in session.cookies.jar]
    if previous or any(cookie['name'] in COOKIE_NAMES for cookie in cookies):
        save_session(previous['userAgent'] if previous else '', cookies)
