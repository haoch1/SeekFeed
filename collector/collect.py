"""Fetch public NodeSeek list metrics. stdout is a single validated JSON document."""
import json
import base64
import re
import random
import sys
import os
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from bs4 import BeautifulSoup

URLS = [
    'https://www.nodeseek.com/?sortBy=replyTime',
    'https://www.nodeseek.com/?sortBy=postTime',
]

class CollectionError(ValueError):
    def __init__(self, reason, retry_after=0):
        super().__init__(reason)
        self.retry_after = retry_after


def failure_details(error):
    # Preserve a bounded reason code, never transport messages, URLs or response bodies.
    reason = str(error) if isinstance(error, ValueError) else ''
    if reason not in ('challenge_or_empty', 'unexpected_markup', 'unexpected_sort', 'verification_required', 'browser_unavailable') and not re.fullmatch(r'http_[1-5]\d\d', reason):
        code = getattr(error, 'code', None)
        if code == 28:
            reason = 'network_timeout'
        elif code in (5, 6, 7, 16, 18, 35, 52, 55, 56, 92):
            reason = 'network_error'
        elif code in (51, 58, 60, 77, 83, 90, 91):
            reason = 'tls_error'
        else:
            reason = 'transport_error'
    return {'error': reason, 'retryAfterSeconds': error.retry_after if isinstance(error, CollectionError) else 0}

def retry_after_seconds(value, now=None):
    now = now or datetime.now(timezone.utc)
    try:
        seconds = int(value) if re.fullmatch(r'\d+', value or '') else (parsedate_to_datetime(value) - now).total_seconds()
        return min(86400, max(0, int(seconds)))
    except (TypeError, ValueError, OverflowError):
        return 0


def header(response, name):
    return next((value for key, value in getattr(response, 'headers', {}).items() if key.lower() == name.lower()), None)

def count(value):
    text = (value or '').strip().replace(',', '')
    match = re.fullmatch(r'(\d+(?:\.\d+)?)\s*([kKwW万千]?)', text)
    if not match:
        return None
    multiplier = {'k': 1000, '千': 1000, 'w': 10000, '万': 10000}.get(match[2].lower(), 1)
    result = round(float(match[1]) * multiplier)
    return result if 0 <= result <= 2**53 - 1 else None

def metric(row, selector, unit):
    node = row.select_one(selector)
    if not node:
        return None
    # The outer comments title counts replies; its nested span includes the OP.
    nodes = [node] + node.select('[title]')
    for candidate in nodes:
        title = candidate.get('title', '')
        match = re.fullmatch(r'([\d,]+) ' + unit, title)
        if match:
            value = count(match[1])
            return max(0, value - 1) if unit == 'comments' and candidate is not node else value
    return count(node.get_text('', strip=True))

def parse(html, expected_sort=None):
    soup = BeautifulSoup(html, 'html.parser')
    rows = soup.select('.post-list-item')
    if not rows:
        raise ValueError('challenge_or_empty')
    # The default sort can inherit a persistent session preference. A successful
    # HTTP response alone does not prove that both requested lists were read.
    if expected_sort and not soup.select_one(f'.sorter [data-sort="{expected_sort}"].selected'):
        raise ValueError('unexpected_sort')
    posts = []
    for row in rows:
        link = row.select_one('.post-title a')
        category = row.select_one('a.post-category')
        author = row.select_one('.info-author a')
        active = row.select_one('.info-last-comment-time time[datetime]')
        match = re.fullmatch(r'/post-(\d+)-\d+', link.get('href', '')) if link else None
        views = metric(row, '.info-views', 'views')
        replies = metric(row, '.info-comments-count', 'comments')
        slug = re.fullmatch(r'/categories/([a-zA-Z0-9_-]+)', category.get('href', '')) if category else None
        if not match or views is None or replies is None or not active or not slug or not author:
            continue
        try:
            date = datetime.fromisoformat(active['datetime'].replace('Z', '+00:00'))
            if not date.tzinfo:
                continue
        except ValueError:
            continue
        profile = re.fullmatch(r'(?:https://www\.nodeseek\.com)?/space/([1-9]\d*)/?(?:#[^\s]*)?', author.get('href', ''))
        author_id = int(profile[1]) if profile and len(profile[1]) <= 16 else None
        posts.append({'postId': int(match[1]), 'title': link.get_text(' ', strip=True)[:500],
                      'author': author.get_text(' ', strip=True)[:100], 'category': slug[1],
                      'authorId': author_id if author_id and author_id <= 2**53 - 1 else None,
                      'categoryLabel': category.get_text(' ', strip=True)[:50],
                      'views': views, 'replies': replies, 'lastActiveAt': date.isoformat(),
                      'pinned': bool(row.select('.post-title [title="置顶"], .iconpark-icon.pined'))})
    # A changed page or partial parser failure must not replace the last good batch.
    if len(posts) < max(1, len(rows) * 0.8):
        raise ValueError('unexpected_markup')
    return posts

def parse_author(html, post_id):
    # NodeSeek's own page configuration identifies the OP, independent of replies.
    # Schema/selector verified against SeekMate's extractPostPageConfig parser.
    soup = BeautifulSoup(html, 'html.parser')
    script = soup.select_one('#temp-script')
    if not script:
        raise ValueError('unexpected_markup')
    try:
        config = json.loads(base64.b64decode(script.get_text(strip=True), validate=True).decode('utf-8'))
        data = config['postData']
        op = data['op']
        uid = op['uid']
        if isinstance(uid, str) and re.fullmatch(r'[1-9]\d{0,15}', uid):
            uid = int(uid)
        if data['postId'] != post_id or type(uid) is not int or not 0 < uid <= 2**53 - 1 or not isinstance(op['name'], str) or not 0 < len(op['name'].strip()) <= 100:
            raise ValueError('unexpected_markup')
        return {'postId': post_id, 'creator': op['name'].strip(), 'authorId': uid}
    except (KeyError, TypeError, ValueError, UnicodeError):
        raise ValueError('unexpected_markup')


def collect(light=False, author_post=None, session_factory=None):
    if session_factory is None:
        from curl_cffi import requests
        session = requests.Session(impersonate='chrome')
    else:
        session = session_factory()
    posts = {}
    urls = URLS
    identity = None
    identity_error = None
    identity_duration = 0
    try:
        for index, url in enumerate(urls):
            if index:
                time.sleep(random.uniform(2, 3))
            response = session.get(url, timeout=20)
            if header(response, 'cf-mitigated') == 'challenge':
                raise CollectionError('verification_required' if session_factory else 'challenge_or_empty')
            if response.status_code != 200:
                raise CollectionError('http_' + str(response.status_code), retry_after_seconds(header(response, 'Retry-After')))
            expected_sort = 'postTime' if 'sortBy=postTime' in url else 'replyTime'
            for post in parse(response.text, expected_sort):
                # A later page can repeat a pinned/bumped row with older cached counts.
                previous = posts.get(post['postId'])
                if previous:
                    post['views'] = max(previous['views'], post['views'])
                    post['replies'] = max(previous['replies'], post['replies'])
                posts[post['postId']] = post
        if author_post:
            identity_start = time.monotonic()
            known = posts.get(author_post)
            if known and known.get('authorId'):
                identity = {'postId': author_post, 'creator': known['author'], 'authorId': known['authorId']}
            else:
                time.sleep(random.uniform(2, 3))
                try:
                    response = session.get(f'https://www.nodeseek.com/post-{author_post}-1', timeout=20)
                    if response.status_code != 200:
                        raise CollectionError('http_' + str(response.status_code), retry_after_seconds(header(response, 'Retry-After')))
                    identity = parse_author(response.text, author_post)
                except Exception as error:
                    identity_error = failure_details(error)
            identity_duration = round((time.monotonic() - identity_start) * 1000)
    finally:
        session.close()
    return {'posts': list(posts.values()), 'collectedAt': datetime.now(timezone.utc).isoformat(), 'pages': len(urls),
            'identity': identity, 'identityError': identity_error, 'identityDurationMs': identity_duration}

if __name__ == '__main__':
    try:
        argument = next((value.split('=', 1)[1] for value in sys.argv if value.startswith('--author-post=')), '')
        author_post = int(argument) if re.fullmatch(r'[1-9]\d{0,15}', argument) else None
        if os.environ.get('HOT_BROWSER_ENDPOINT'):
            from browser import BrowserSession, browser_status
            result = browser_status() if '--browser-status' in sys.argv else collect(light='--light' in sys.argv, author_post=author_post, session_factory=BrowserSession)
        else:
            result = collect(light='--light' in sys.argv, author_post=author_post)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as error:
        # Do not log headers, cookies, response pages or transport exceptions.
        print(json.dumps(failure_details(error)), file=sys.stderr)
        sys.exit(1)
