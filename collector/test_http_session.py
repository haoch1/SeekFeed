import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import stat
import tempfile
import unittest
from unittest.mock import MagicMock, patch
from types import SimpleNamespace

from browser import save_http_session
from http_session import create_session, load_session, save_session, persist_session
from test_collect import row, listing

UA = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/150.0.0.0 Safari/537.36'
CF = {'name': 'cf_clearance', 'value': 'PRIVATE_CF_VALUE', 'domain': '.nodeseek.com', 'path': '/', 'expires': -1}


class HttpSessionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'session.json'
        self.env = patch.dict(os.environ, {'HOT_HTTP_SESSION_PATH': str(self.path)})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def test_only_cf_cookies_are_persisted_atomically_and_no_account_cookie_survives(self):
        save_session(UA, [CF, {**CF, 'name': 'session', 'value': 'PRIVATE_LOGIN'},
                          {**CF, 'name': 'sortBy'}, {**CF, 'domain': 'evil.test'}, {**CF, 'expires': 1}])
        data = load_session()
        self.assertEqual(data, {'version': 1, 'userAgent': UA, 'cookies': [CF]})
        self.assertNotIn('PRIVATE_LOGIN', self.path.read_text())
        self.assertEqual(list(self.path.parent.glob('.hot-session-*')), [])
        if os.name != 'nt':
            self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)

    def test_invalid_metadata_never_overwrites_a_working_session(self):
        save_session(UA, [CF])
        for ua, cookies in [('bad\r\nCookie: SECRET', [CF]), (UA, [{**CF, 'value': 'bad\nvalue'}]), (UA, [{**CF, 'expires': float('inf')}])]:
            with self.assertRaisesRegex(ValueError, '^http_session_unavailable$'):
                save_session(ua, cookies)
            self.assertEqual(load_session()['cookies'], [CF])

    def test_corrupt_or_oversized_session_stops_before_any_http_request_and_does_not_echo_secrets(self):
        for text in ['SECRET', 'x' * 16001, '{"version":2}', '{"version":1,"cookies":["SECRET"]}']:
            self.path.write_text(text)
            with patch('curl_cffi.requests.Session') as constructor, self.assertRaisesRegex(ValueError, '^http_session_unavailable$'):
                create_session()
            constructor.assert_not_called()

    def test_http_uses_the_local_verified_user_agent_and_refreshes_only_allowed_cookies(self):
        save_session(UA, [CF])
        session = create_session()
        try:
            self.assertEqual(session.headers['User-Agent'], UA)
            self.assertEqual(session.cookies.get('cf_clearance'), CF['value'])
            session.cookies.set('session', 'PRIVATE_LOGIN', domain='.nodeseek.com')
            session.cookies.set('cf_clearance', 'UPDATED', domain='.nodeseek.com', secure=True)
            persist_session(session)
        finally:
            session.close()
        self.assertEqual(load_session()['cookies'][0]['value'], 'UPDATED')
        self.assertNotIn('PRIVATE_LOGIN', self.path.read_text())

    def test_manual_handoff_reads_cdp_only_and_never_returns_session_values(self):
        session = MagicMock()
        session.snapshot.return_value = {'url': 'https://www.nodeseek.com/', 'title': 'NodeSeek', 'html': row()}
        session.call.side_effect = [{'result': {'value': UA}}, {'cookies': [CF, {**CF, 'name': 'session', 'value': 'PRIVATE_LOGIN'}]}]
        with patch('browser.BrowserSession', return_value=session):
            result = save_http_session()
        self.assertEqual(result, {'connected': True, 'ready': True, 'verificationRequired': False})
        self.assertNotIn('PRIVATE', json.dumps(result))
        self.assertEqual(load_session()['cookies'], [CF])
        session.get.assert_not_called()
        session.park.assert_called_once()
        session.close.assert_called_once()

    def test_anonymous_http_cookies_survive_rounds_without_changing_the_native_profile_user_agent(self):
        session = create_session()
        session.cookies.set('__cf_bm', 'NATIVE_HTTP_SESSION', domain='.nodeseek.com', secure=True)
        session.close()
        persist_session(session)
        self.assertEqual(load_session()['userAgent'], '')
        restored = create_session()
        try:
            self.assertEqual(restored.cookies.get('__cf_bm'), 'NATIVE_HTTP_SESSION')
            self.assertNotIn('User-Agent', restored.headers)
        finally:
            restored.close()

    def test_blank_or_challenged_browser_cannot_save_a_verified_http_session(self):
        session = MagicMock()
        session.snapshot.return_value = {'url': 'about:blank', 'title': '', 'html': '<html></html>'}
        with patch('browser.BrowserSession', return_value=session):
            self.assertFalse(save_http_session()['ready'])
        self.assertFalse(self.path.exists())
        session.call.assert_not_called()

    def test_normal_cli_is_http_even_when_a_browser_endpoint_is_configured(self):
        session = MagicMock()
        session.get.side_effect = lambda url, **_: SimpleNamespace(status_code=200, text=listing('postTime' if 'postTime' in url else 'replyTime'))
        output = io.StringIO()
        with patch.dict(os.environ, {'HOT_BROWSER_ENDPOINT': 'http://private-browser:9222'}), \
             patch('sys.argv', ['collect.py', '--light']), patch('http_session.create_session', return_value=session), \
             patch('browser.BrowserSession') as browser, patch('time.sleep'), contextlib.redirect_stdout(output):
            runpy.run_path(str(Path(__file__).with_name('collect.py')), run_name='__main__')
        result = json.loads(output.getvalue())
        self.assertEqual(result['pages'], 4)
        self.assertEqual(result['posts'][0]['views'], 1234)
        self.assertEqual(result['posts'][0]['replies'], 27)
        self.assertEqual(session.get.call_count, 4)
        self.assertTrue(all(call.kwargs['allow_redirects'] is False for call in session.get.call_args_list))
        browser.assert_not_called()
