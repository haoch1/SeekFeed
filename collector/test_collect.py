import unittest
from collect import count, parse

def row(views='1,234', replies='27', inner='28', title='&lt;script&gt;'):
    return f'''<li class="post-list-item"><div class="post-title"><a href="/post-123-1">{title}</a></div>
    <span class="info-author"><a>作者</a></span><a class="post-category" href="/categories/tech">技术</a>
    <span class="info-views"><span title="{views} views">1.2k</span></span>
    <span class="info-comments-count" title="{replies} comments"><span title="{inner} comments">{replies}</span></span>
    <a class="info-last-comment-time"><time datetime="2026-10-20T01:00:00.000Z"></time></a></li>'''

class ParserTests(unittest.TestCase):
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

if __name__ == '__main__':
    unittest.main()
