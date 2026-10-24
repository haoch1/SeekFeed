"""Read public list pages in one persistent, manually verified browser profile.

This adapter never clicks or solves challenges and never exports cookies.
The CDP endpoint must stay on a private Docker network.
"""
import json
import os
import re
import time
import urllib.request
from types import SimpleNamespace
from urllib.parse import urlsplit, urlunsplit

import websocket
from bs4 import BeautifulSoup
from collect import CollectionError, URLS, parse

MAX_MESSAGE = 4_000_000


def allowed_url(url):
    return url in URLS or url in ('https://www.nodeseek.com/', 'https://www.nodeseek.com/page-2') or bool(re.fullmatch(r'https://www\.nodeseek\.com/post-[1-9]\d{0,15}-1', url))


def public_list_url(url):
    # A person may finish verification on another public list page. Recognizing
    # that tab does not add any page to the automatic collection request budget.
    return bool(re.fullmatch(r'https://www\.nodeseek\.com/(?:page-(?:[1-9]\d?|100))?(?:\?sortBy=(?:postTime|replyTime))?', url))


class BrowserSession:
    def __init__(self):
        self.socket = None
        self.sequence = 0
        self.document = {}
        self.document_loader = None
        self.frame_id = None
        endpoint = urlsplit(os.environ.get('HOT_BROWSER_ENDPOINT', ''))
        if endpoint.scheme != 'http' or not endpoint.hostname or endpoint.username or endpoint.password or endpoint.path not in ('', '/'):
            raise CollectionError('browser_unavailable')
        try:
            request = urllib.request.Request(urlunsplit((endpoint.scheme, endpoint.netloc, '/json/list', '', '')), headers={'Host': 'localhost'})
            with urllib.request.urlopen(request, timeout=5) as response:
                pages = json.loads(response.read(MAX_MESSAGE))
            target = next((page for page in pages if page.get('type') == 'page' and (allowed_url(page.get('url', '')) or public_list_url(page.get('url', '')))), None)
            if not target:
                raise CollectionError('browser_unavailable')
            self.frame_id = target.get('id')
            original = urlsplit(target['webSocketDebuggerUrl'])
            # Never follow a debugger URL to another host or to a browser-wide endpoint.
            if not re.fullmatch(r'/devtools/page/[a-zA-Z0-9_-]+', original.path):
                raise CollectionError('browser_unavailable')
            url = urlunsplit(('ws', endpoint.netloc, original.path, '', ''))
            self.socket = websocket.create_connection(url, timeout=20, suppress_origin=True, host='localhost')
        except Exception:
            self.close()
            raise CollectionError('browser_unavailable') from None

    def call(self, method, params=None):
        self.sequence += 1
        sequence = self.sequence
        self.socket.send(json.dumps({'id': sequence, 'method': method, 'params': params or {}}))
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            raw = self.socket.recv()
            if not raw or len(raw) > MAX_MESSAGE:
                raise CollectionError('browser_unavailable')
            message = json.loads(raw)
            if message.get('method') == 'Network.responseReceived':
                params = message.get('params', {})
                if params.get('type') == 'Document' and (not self.frame_id or params.get('frameId') == self.frame_id):
                    self.document = params.get('response', {})
                    self.document_loader = params.get('loaderId')
            if message.get('id') == sequence:
                if 'error' in message:
                    raise CollectionError('browser_unavailable')
                return message.get('result', {})
        raise CollectionError('browser_unavailable')

    def snapshot(self):
        result = self.call('Runtime.evaluate', {'expression': 'JSON.stringify({html:document.documentElement.outerHTML,url:location.href,title:document.title,ready:document.readyState})', 'returnByValue': True})
        value = result.get('result', {}).get('value')
        if not isinstance(value, str) or len(value) > MAX_MESSAGE:
            raise CollectionError('browser_unavailable')
        data = json.loads(value)
        if not allowed_url(data.get('url', '')) and not public_list_url(data.get('url', '')):
            raise CollectionError('browser_unavailable')
        return data

    def get(self, url, timeout=20):
        if not allowed_url(url):
            raise CollectionError('browser_unavailable')
        self.call('Network.enable')
        self.document = {}
        self.document_loader = None
        navigation = self.call('Page.navigate', {'url': url})
        self.frame_id = navigation.get('frameId', self.frame_id)
        deadline = time.monotonic() + min(timeout, 20)
        challenged = False
        while time.monotonic() < deadline:
            # Navigation destroys the old execution context before creating the
            # new one. Poll CDP locally; this never retries the source request.
            try:
                data = self.snapshot()
            except CollectionError:
                time.sleep(0.25)
                continue
            headers = {key.lower(): str(value) for key, value in self.document.get('headers', {}).items()}
            if headers.get('cf-mitigated') == 'challenge' or data['title'].strip().lower() == 'just a moment...':
                challenged = True
                # Allow the browser's existing page load to finish normally.
                # No second navigation, checkbox click or challenge solver.
                time.sleep(0.25)
                continue
            frame = self.call('Page.getFrameTree').get('frameTree', {}).get('frame', {})
            loader = self.document_loader or navigation.get('loaderId')
            if data['url'] == url and data['ready'] == 'complete' and self.document and loader and frame.get('loaderId') == loader:
                return SimpleNamespace(status_code=int(self.document.get('status', 200)), text=data['html'], headers=headers)
            time.sleep(0.25)
        raise CollectionError('verification_required' if challenged else 'browser_unavailable')

    def close(self):
        if self.socket:
            self.socket.close()
            self.socket = None


def browser_status():
    session = BrowserSession()
    try:
        data = session.snapshot()
        soup = BeautifulSoup(data['html'], 'html.parser')
        challenged = data['title'].strip().lower() == 'just a moment...'
        ready = False
        if public_list_url(data['url']) and not challenged:
            try:
                ready = bool(parse(data['html']))
            except ValueError:
                pass
        return {'connected': True, 'ready': ready, 'verificationRequired': challenged}
    finally:
        session.close()
