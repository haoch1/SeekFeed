"""Fetch public NodeSeek list metrics. stdout is a single validated JSON document."""
import json
import re
import sys
import time
from datetime import datetime, timezone
from bs4 import BeautifulSoup

URLS = [
    'https://www.nodeseek.com/',
    'https://www.nodeseek.com/page-2',
    'https://www.nodeseek.com/?sortBy=postTime',
    'https://www.nodeseek.com/page-2?sortBy=postTime',
]

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

def parse(html):
    soup = BeautifulSoup(html, 'html.parser')
    rows = soup.select('.post-list-item')
    if not rows:
        raise ValueError('challenge_or_empty')
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
        posts.append({'postId': int(match[1]), 'title': link.get_text(' ', strip=True)[:500],
                      'author': author.get_text(' ', strip=True)[:100], 'category': slug[1],
                      'categoryLabel': category.get_text(' ', strip=True)[:50],
                      'views': views, 'replies': replies, 'lastActiveAt': date.isoformat(),
                      'pinned': bool(row.select('.post-title [title="置顶"]'))})
    # A changed page or partial parser failure must not replace the last good batch.
    if len(posts) < max(1, len(rows) * 0.8):
        raise ValueError('unexpected_markup')
    return posts

def collect():
    from curl_cffi import requests
    session = requests.Session(impersonate='chrome')
    posts = {}
    for index, url in enumerate(URLS):
        if index:
            time.sleep(2)
        response = session.get(url, timeout=20)
        if response.status_code != 200:
            raise ValueError('http_' + str(response.status_code))
        for post in parse(response.text):
            posts[post['postId']] = post
    return {'posts': list(posts.values()), 'collectedAt': datetime.now(timezone.utc).isoformat(), 'pages': len(URLS)}

if __name__ == '__main__':
    try:
        print(json.dumps(collect(), ensure_ascii=False))
    except Exception as error:
        # Do not log headers, cookies, response pages or transport exceptions.
        reason = str(error) if isinstance(error, ValueError) else 'transport_error'
        print(json.dumps({'error': reason}), file=sys.stderr)
        sys.exit(1)
