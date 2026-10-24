import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from browser import BrowserSession, browser_status, allowed_url
from collect import CollectionError, URLS
from test_collect import row


class BrowserTests(unittest.TestCase):
    def test_only_public_list_and_canonical_post_urls_are_allowed(self):
        for url in URLS + ['https://www.nodeseek.com/post-123-1']:
            self.assertTrue(allowed_url(url))
        for url in ['https://evil.test/', 'http://www.nodeseek.com/', 'https://www.nodeseek.com/space/1',
                    'https://www.nodeseek.com/?url=http://internal/', 'https://www.nodeseek.com/post-1-2',
                    'https://www.nodeseek.com/post-0-1', 'file:///etc/passwd', 'chrome://settings']:
            self.assertFalse(allowed_url(url))

    def test_debugger_host_is_fixed_to_private_endpoint_and_never_exports_cookies(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps([{'type': 'page', 'url': URLS[0],
            'webSocketDebuggerUrl': 'ws://evil.test/devtools/page/ABC123'}]).encode()
        with patch.dict(os.environ, {'HOT_BROWSER_ENDPOINT': 'http://browser:9222'}), \
             patch('browser.urllib.request.urlopen', return_value=response), patch('browser.websocket.create_connection') as connect:
            session = BrowserSession()
            self.assertEqual(connect.call_args.args[0], 'ws://browser:9222/devtools/page/ABC123')
            self.assertEqual(connect.call_args.kwargs['host'], 'localhost')
            self.assertNotIn('cookie', str(connect.call_args).lower())
            session.close()

    def test_navigation_waits_for_new_document_after_execution_context_is_destroyed(self):
        session = BrowserSession.__new__(BrowserSession)
        session.document = {'status': 200, 'headers': {}}
        methods = []
        def call(method, params=None):
            methods.append(method)
            return {'loaderId': 'new'} if method == 'Page.navigate' else {'frameTree': {'frame': {'loaderId': 'new'}}}
        session.call = call
        session.snapshot = MagicMock(side_effect=[CollectionError('browser_unavailable'),
            {'url': URLS[0], 'title': 'NodeSeek', 'ready': 'complete', 'html': row()}])
        # Network events arrive during the subsequent snapshot command.
        def snapshot():
            session.document = {'status': 200, 'headers': {}}
            return session.snapshot_mock()
        session.snapshot_mock = session.snapshot
        session.snapshot = snapshot
        with patch('browser.time.sleep'):
            self.assertIn('post-list-item', session.get(URLS[0]).text)
        self.assertEqual(methods.count('Page.navigate'), 1)
        self.assertFalse(any('Cookie' in method or 'Input.' in method for method in methods))

    def test_challenge_stops_without_retries_or_automatic_interaction(self):
        session = BrowserSession.__new__(BrowserSession)
        session.call = MagicMock(return_value={'loaderId': 'new'})
        def snapshot():
            session.document = {'status': 403, 'headers': {'cf-mitigated': 'challenge'}}
            return {'url': URLS[0], 'title': 'Just a moment...', 'ready': 'complete', 'html': 'PRIVATE'}
        session.snapshot = snapshot
        with self.assertRaisesRegex(CollectionError, '^verification_required$'):
            session.get(URLS[0])
        self.assertEqual([c.args[0] for c in session.call.call_args_list], ['Network.enable', 'Page.navigate'])

    def test_status_is_read_only_and_requires_a_real_parsable_list(self):
        session = MagicMock()
        for title, html, ready in [('NodeSeek', row(), True), ('Just a moment...', 'private', False), ('NodeSeek', 'empty', False)]:
            session.snapshot.return_value = {'url': URLS[0], 'title': title, 'html': html}
            with patch('browser.BrowserSession', return_value=session):
                result = browser_status()
            self.assertEqual(result['ready'], ready)
            self.assertNotIn('html', result)
        session.get.assert_not_called()
        session.call.assert_not_called()


if __name__ == '__main__':
    unittest.main()
