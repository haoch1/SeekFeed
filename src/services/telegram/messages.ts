import type { Post, KeywordSub } from '../../types';

export const escapeTelegramHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
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

export const telegramHelp = `<b>📖 SeekFeed · 命令帮助</b>

<b>👤 账号与通知</b>
/start  绑定账号
/getme  查看绑定状态
/stop  暂停推送
/resume  恢复推送
/unbind  解除绑定

<b>📋 订阅与帖子</b>
/list  查看订阅
/add 关键词1 关键词2 关键词3
/del 订阅ID
/post  最近 10 条帖子
/hot  论坛热榜
/help  查看帮助

<b>💡 使用提示</b>
最多填写 3 个关键词，帖子需同时包含所有关键词才会通知。作者、分类、屏蔽词和暂停规则可在网页端设置。`;

export function welcomeMessage(name: string, username: string, chatId: number, returning: boolean): string {
    return `<b>👋 SeekFeed · ${returning ? '欢迎回来' : '账号已绑定'}</b>\n\n<b>👤 账号</b>  ${escapeTelegramHtml(name || '未命名用户')}${username ? ` (@${escapeTelegramHtml(username)})` : ''}\n\n<b>🆔 Chat ID</b>  <code>${chatId}</code>\n\n✅ 已绑定，可以接收订阅通知。\n\n<b>📋 常用命令</b>\n/hot  论坛热榜\n/list  查看订阅\n/post  最近帖子\n/help  完整帮助`;
}

export function postMessage(post: Post, sub: KeywordSub, category: string): string {
    const words = [sub.keyword1, sub.keyword2, sub.keyword3].filter(Boolean).join(' + ');
    return `<b>🔔 SeekFeed · 订阅命中</b>\n\n<a href="https://www.nodeseek.com/post-${Number(post.post_id)}-1"><b>${escapeTelegramHtml(displayTelegramTitle(post.title))}</b></a>\n\n<b>👤 作者</b>  ${escapeTelegramHtml(post.creator)}\n\n<b>🏷 分类</b>  ${escapeTelegramHtml(category)}${words ? `\n\n<b>🔎 关键词</b>  ${escapeTelegramHtml(words)}` : ''}\n\n💡 点击标题查看帖子`;
}

// Normalize presentation only; keep the original forum title in storage.
export function displayTelegramTitle(title: string): string {
    return title.replace(/[\u200b-\u200d\ufeff]/g, '').trim().replace(/[【［]/g, '[').replace(/[】］]/g, ']');
}

export function recentPostRow(post: Post, index: number): string {
    return `<code>${String(index + 1).padStart(2, '0')}</code>\u2002<a href="https://www.nodeseek.com/post-${Number(post.post_id)}-1">${escapeTelegramHtml(displayTelegramTitle(post.title))}</a>\n\n`;
}
