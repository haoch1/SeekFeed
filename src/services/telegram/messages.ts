import type { Post, KeywordSub } from '../../types';

export const escapeTelegramHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

// Bound text before escaping so entities and Unicode characters are never split.
export function telegramText(value: unknown, limit = 100): string {
    const chars = Array.from(String(value ?? '').replace(/\s+/g, ' ').trim());
    return chars.slice(0, limit).join('') + (chars.length > limit ? '…' : '');
}

export function telegramMessage(title: string, bodyHtml: string): string {
    return `<b>SeekFeed · ${escapeTelegramHtml(title)}</b>\n\n${bodyHtml.trim()}`;
}

export function telegramNotice(title: string, message: string, hint?: string): string {
    return telegramMessage(title, escapeTelegramHtml(message) + (hint ? `\n\n${escapeTelegramHtml(hint)}` : ''));
}

export function telegramTimestamp(value: string | Date = new Date()): string {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? `${date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（UTC+8）` : '';
}

export function telegramTestMessage(title = '推送测试', message = '通知通道工作正常。'): string {
    return telegramNotice(title, message, `时间 ${telegramTimestamp()}`);
}

export function telegramPostLink(postId: number, title: string): string {
    return `<a href="https://www.nodeseek.com/post-${Number(postId)}-1"><b>${escapeTelegramHtml(telegramText(displayTelegramTitle(title), 80))}</b></a>`;
}

// The same two-line layout is used for rankings, recent posts and subscriptions.
export function telegramRow(label: string, contentHtml: string, metadata: string): string {
    return `<code>${escapeTelegramHtml(label)}</code>  ${contentHtml}\n${escapeTelegramHtml(metadata)}\n\n`;
}

// Split only between complete rows, retaining a heading on every message.
export function telegramListMessages(title: string, rows: string[], footer = ''): string[] {
    const messages: string[] = [];
    let body = '';
    for (const row of rows) {
        if (telegramMessage(title, body + row).length > 3400 && body) {
            messages.push(telegramMessage(title, body));
            body = '';
        }
        body += row;
    }
    if (footer && telegramMessage(title, body + escapeTelegramHtml(footer)).length > 4000) {
        messages.push(telegramMessage(title, body));
        body = '';
    }
    messages.push(telegramMessage(title, body + escapeTelegramHtml(footer)));
    return messages;
}
export const telegramCommands = [
    { command: 'start', description: '绑定账号，开始接收通知' },
    { command: 'help', description: '查看命令与使用说明' },
    { command: 'hot', description: '查看论坛热榜' },
    { command: 'post', description: '查看最近 10 条帖子' },
    { command: 'list', description: '查看全部订阅' },
    { command: 'add', description: '添加订阅，最多 3 个关键词' },
    { command: 'del', description: '按订阅 ID 删除订阅' },
    { command: 'stop', description: '暂停订阅通知' },
    { command: 'resume', description: '恢复订阅通知' },
    { command: 'getme', description: '查看账号与绑定状态' },
    { command: 'unbind', description: '解除当前账号绑定' },
];

export const telegramHelp = telegramMessage('命令帮助', `<b>账号与通知</b>
/start  绑定账号
/getme  查看绑定状态
/stop  暂停推送
/resume  恢复推送
/unbind  解除绑定

<b>订阅与帖子</b>
/list  查看订阅
/add 关键词1 关键词2 关键词3
/del 订阅ID
/post  最近 10 条帖子
/hot  论坛热榜
/help  查看帮助

榜单下方可切换实时、日榜、周榜。
关键词不区分大小写，最多 3 个，需同时命中。匹配范围与其他规则可在网页端设置。`);

export function welcomeMessage(name: string, username: string, chatId: number, returning: boolean): string {
    const account = escapeTelegramHtml(telegramText(name || '未命名用户'));
    return telegramMessage(returning ? '欢迎回来' : '账号已绑定', `账号 ${account}${username ? ` (@${escapeTelegramHtml(username)})` : ''}\nChat ID <code>${chatId}</code> · 已绑定\n\n/hot  论坛热榜\n/list  查看订阅\n/post  最近帖子\n/help  完整帮助`);
}

export function subscriptionRow(sub: KeywordSub, category: string): string {
    const words = telegramText([sub.keyword1, sub.keyword2, sub.keyword3].filter(Boolean).join(' + '), 300);
    const metadata = [sub.enabled === 0 ? '已暂停' : '监控中', sub.creator ? `作者 ${telegramText(sub.creator, 80)}` : '', category ? telegramText(category, 80) : '全部分类', sub.exclude_keywords ? `屏蔽 ${telegramText(sub.exclude_keywords, 120)}` : ''].filter(Boolean).join(' · ');
    return telegramRow(`#${sub.id}`, escapeTelegramHtml(words || '按作者 / 分类匹配'), metadata);
}

export function postMessage(post: Post, sub: KeywordSub, category: string): string {
    const words = telegramText([sub.keyword1, sub.keyword2, sub.keyword3].filter(Boolean).join(' + '), 300);
    const metadata = [`作者 ${telegramText(post.creator) || '未知'}`, telegramText(category), `订阅 #${sub.id}`].filter(Boolean).join(' · ');
    return telegramMessage('订阅命中', `${telegramPostLink(post.post_id, post.title)}\n${escapeTelegramHtml(metadata)}${words ? `\n\n关键词 ${escapeTelegramHtml(words)}` : ''}`);
}

// Normalize presentation only; keep the original forum title in storage.
export function displayTelegramTitle(title: string): string {
    return title.replace(/[\u200b-\u200d\ufeff]/g, '').trim().replace(/[【［]/g, '[').replace(/[】］]/g, ']');
}

export function recentPostRow(post: Post, index: number, category = post.category): string {
    const metadata = [telegramText(post.creator), telegramText(category), telegramTimestamp(post.pub_date)].filter(Boolean).join(' · ');
    return telegramRow(String(index + 1).padStart(2, '0'), telegramPostLink(post.post_id, post.title), metadata);
}
