import unittest
from collect import count, parse, parse_author, collect, retry_after_seconds, failure_details, CollectionError, URLS
import json
import base64
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch, MagicMock

def row(views='1,234', replies='27', inner='28', title='&lt;script&gt;'):
    return f'''<li class="post-list-item"><div class="post-title"><a href="/post-123-1">{title}</a></div>
    <span class="info-author"><a>作者</a></span><a class="post-category" href="/categories/tech">技术</a>
    <span class="info-views"><span title="{views} views">1.2k</span></span>
    <span class="info-comments-count" title="{replies} comments"><span title="{inner} comments">{replies}</span></span>
    <a class="info-last-comment-time"><time datetime="2026-10-20T01:00:00.000Z"></time></a></li>'''


def listing(sort, html=None):
    return f'<div class="sorter"><a data-sort="{sort}" class="selected">排序</a></div>' + (html or row())

class ParserTests(unittest.TestCase):
    def test_checks_actual_selected_sort_instead_of_trusting_the_url_or_cookie(self):
        self.assertEqual(len(parse(listing('postTime'), 'postTime')), 1)
        for html in [row(), listing('replyTime')]:
            with self.assertRaisesRegex(ValueError, '^unexpected_sort$'):
                parse(html, 'postTime')
        session = MagicMock()
        session.get.return_value = SimpleNamespace(status_code=200, text=listing('postTime'), headers={})
        with self.assertRaisesRegex(ValueError, '^unexpected_sort$'):
            collect(light=True, session_factory=lambda: session)
        session.get.assert_called_once()
        self.assertEqual(failure_details(ValueError('unexpected_sort'))['error'], 'unexpected_sort')

    def test_browser_header_case_preserves_retry_after_and_stops_the_batch(self):
        session = MagicMock()
        session.get.return_value = SimpleNamespace(status_code=429, text='PRIVATE', headers={'retry-after': '1800'})
        with self.assertRaises(CollectionError) as error:
            collect(light=True, session_factory=lambda: session)
        self.assertEqual(failure_details(error.exception), {'error': 'http_429', 'retryAfterSeconds': 1800})
        session.get.assert_called_once()
        session.close.assert_called_once()

    def test_op_config_is_validated_without_confusing_reply_authors(self):
        def page(data):
            return '<script id="temp-script">' + base64.b64encode(json.dumps({'postData': data}).encode()).decode() + '</script>'
        self.assertEqual(parse_author(page({'postId': 123, 'op': {'name': '作者', 'uid': 9}, 'comments': [{'poster': {'uid': 99}}]}), 123),
                         {'postId': 123, 'creator': '作者', 'authorId': 9})
        for data in [{'postId': 124, 'op': {'name': '作者', 'uid': 9}}, {'postId': 123, 'op': {'name': '作者', 'uid': True}},
                     {'postId': 123, 'op': {'name': '', 'uid': 9}}, {'postId': 123, 'op': {'name': '作者', 'uid': 'javascript:9'}}]:
            with self.assertRaises(ValueError):
                parse_author(page(data), 123)

    def test_backfill_uses_one_extra_request_and_does_not_retry_a_denial(self):
        session = MagicMock()
        session.get.side_effect = [SimpleNamespace(status_code=200, text=listing('replyTime')), SimpleNamespace(status_code=200, text=listing('postTime')),
                                   SimpleNamespace(status_code=200, text=listing('replyTime')), SimpleNamespace(status_code=200, text=listing('postTime')),
                                   SimpleNamespace(status_code=403, text='private challenge', headers={'Retry-After': '1800'})]
        with patch('curl_cffi.requests.Session', return_value=session), patch('collect.time.sleep'):
            result = collect(light=True, author_post=456)
        self.assertEqual(session.get.call_count, 5)
        self.assertEqual(session.get.call_args_list[-1].args[0], 'https://www.nodeseek.com/post-456-1')
        self.assertEqual(result['identityError'], {'error': 'http_403', 'retryAfterSeconds': 1800})
        self.assertNotIn('private', json.dumps(result))
        self.assertEqual(len(result['posts']), 1)

    def test_author_profile_ids_are_optional_and_limited_to_canonical_nodeseek_links(self):
        for href, expected in [('/space/9', 9), ('/space/72038#/discussions', 72038), ('https://www.nodeseek.com/space/12', 12), ('https://evil.test/space/9', None), ('//evil.test/space/9', None), ('/space/Alice', None), ('/space/0', None), ('/space/9007199254740992', None), ('javascript:alert(1)', None), ('', None)]:
            html = row().replace('<a>作者</a>', f'<a href="{href}">作者</a>')
            self.assertEqual(parse(html)[0]['authorId'], expected)
            self.assertEqual(parse(html)[0]['author'], '作者')

    def test_exact_counts_and_op_exclusion(self):
        result = parse(row())[0]
        self.assertEqual(result['views'], 1234)
        self.assertEqual(result['replies'], 27)
        self.assertEqual(result['title'], '<script>')
        self.assertEqual(result['postId'], 123)
        self.assertEqual(parse(row('0', '0', '1'))[0]['replies'], 0)

    def test_fallback_nested_comment_title_excludes_original_post(self):
        html = row().replace(' title="27 comments"', '')
        self.assertEqual(parse(html)[0]['replies'], 27)

    def test_units_and_missing_values(self):
        for text, expected in [('1,234', 1234), ('1.2k', 1200), ('2万', 20000), ('0', 0), ('-', None), ('1 reply', None), ('', None), ('-1', None)]:
            self.assertEqual(count(text), expected)

    def test_challenges_partial_markup_and_unsafe_links_fail(self):
        for html in ['<title>Just a moment...</title>', row().replace('info-views', 'changed-views'), row().replace('/post-123-1', 'https://evil.test/')]:
            with self.assertRaises(ValueError):
                parse(html)

    def test_pinned_icon_without_title_attribute(self):
        html = row().replace('</a></div>', '</a><svg class="iconpark-icon pined"></svg></div>')
        self.assertTrue(parse(html)[0]['pinned'])

    def test_retry_after_seconds_and_dates(self):
        now = datetime(2026, 10, 20, 5, 0, tzinfo=timezone.utc)
        for value, expected in [('120', 120), ('Tue, 20 Oct 2026 05:30:00 GMT', 1800), ('Tue, 20 Oct 2026 04:30:00 GMT', 0), ('bogus', 0), (None, 0), ('99999999', 86400)]:
            self.assertEqual(retry_after_seconds(value, now), expected)

    def test_diagnostics_preserve_safe_causes_without_transport_secrets(self):
        self.assertEqual(failure_details(CollectionError('http_429', 1800)), {'error': 'http_429', 'retryAfterSeconds': 1800})
        self.assertEqual(failure_details(ValueError('unexpected_markup'))['error'], 'unexpected_markup')
        for code, reason in [(28, 'network_timeout'), (6, 'network_error'), (92, 'network_error'), (60, 'tls_error'), (99, 'transport_error')]:
            error = RuntimeError('https://user:SECRET@example.com COOKIE=SECRET')
            error.code = code
            self.assertEqual(failure_details(error), {'error': reason, 'retryAfterSeconds': 0})
        self.assertNotIn('SECRET', str(failure_details(ValueError('TOKEN_SECRET'))))

    def test_collection_always_reads_first_two_pages_of_both_sorts_and_deduplicates(self):
        self.assertEqual(URLS, ['https://www.nodeseek.com/?sortBy=replyTime', 'https://www.nodeseek.com/?sortBy=postTime',
                               'https://www.nodeseek.com/page-2?sortBy=replyTime', 'https://www.nodeseek.com/page-2?sortBy=postTime'])
        for light, pages in [(True, 4), (False, 4)]:
            session = MagicMock()
            session.get.side_effect = lambda url, **_: SimpleNamespace(status_code=200, text=listing('postTime' if 'sortBy=postTime' in url else 'replyTime'))
            with patch('curl_cffi.requests.Session', return_value=session), patch('collect.time.sleep') as sleep:
                result = collect(light)
            self.assertEqual([c.args[0] for c in session.get.call_args_list], URLS[:pages])
            self.assertEqual(result['pages'], pages)
            self.assertEqual(len(result['posts']), 1)
            self.assertEqual(sleep.call_count, pages - 1)
            self.assertTrue(all(2 <= c.args[0] <= 3 for c in sleep.call_args_list))
            session.close.assert_called_once()

    def test_second_page_failure_discards_partial_batch_without_retry(self):
        session = MagicMock()
        session.get.side_effect = [SimpleNamespace(status_code=200, text=listing('replyTime')),
                                   SimpleNamespace(status_code=200, text=listing('postTime')),
                                   SimpleNamespace(status_code=403, text='private challenge', headers={})]
        with patch('collect.time.sleep'), self.assertRaisesRegex(CollectionError, '^http_403$'):
            collect(session_factory=lambda: session)
        self.assertEqual(session.get.call_count, 3)
        session.park.assert_called_once()
        session.close.assert_called_once()

    def test_browser_releases_its_page_after_a_successful_round(self):
        session = MagicMock()
        session.get.side_effect = lambda url, **_: SimpleNamespace(status_code=200, text=listing('postTime' if 'sortBy=postTime' in url else 'replyTime'))
        with patch('collect.time.sleep'):
            result = collect(session_factory=lambda: session)
        self.assertEqual(result['pages'], 4)
        self.assertEqual(session.get.call_count, 4)
        session.park.assert_called_once()
        session.close.assert_called_once()

    def test_rate_limit_or_challenge_aborts_without_retrying_more_pages(self):
        for status, html in [(429, ''), (403, ''), (200, '<title>Just a moment...</title>')]:
            session = MagicMock()
            session.get.return_value = SimpleNamespace(status_code=status, text=html, headers={'Retry-After': '1800'})
            with patch('curl_cffi.requests.Session', return_value=session), patch('collect.time.sleep') as sleep:
                with self.assertRaises(ValueError) as caught:
                    collect()
            self.assertEqual(session.get.call_count, 1)
            sleep.assert_not_called()
            session.close.assert_called_once()
            if status != 200:
                self.assertIsInstance(caught.exception, CollectionError)
                self.assertEqual(caught.exception.retry_after, 1800)

if __name__ == '__main__':
    unittest.main()
