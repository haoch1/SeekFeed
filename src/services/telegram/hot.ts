import type { HotPeriod, HotService } from '../hot';
import { displayTelegramTitle, escapeTelegramHtml as h } from './messages';

export const hotEntryKeyboard = { inline_keyboard: [[{ text: '🔥 论坛热榜', callback_data: 'hot:open' }]] };

export function hotRankingKeyboard(period: HotPeriod) {
    return { inline_keyboard: [
        ([['live', '实时'], ['day', '24 小时'], ['week', '7 天']] as const).map(([value, label]) => ({
            text: `${value === period ? '✓ ' : ''}${label}`, callback_data: `hot:${value}`,
        })),
        [{ text: '🔄 刷新榜单', callback_data: `hot:${period}` }],
    ] };
}

export function hotRankingMessage(data: ReturnType<HotService['ranking']>): string {
    const title = { live: '实时热榜', day: '24 小时热榜', week: '7 天热榜' }[data.period];
    let text = `<b>🔥 SeekFeed · ${title}</b>\n\n`;
    for (const [index, post] of data.posts.slice(0, 10).entries()) {
        const chars = Array.from(displayTelegramTitle(post.title).replace(/\s+/g, ' '));
        const name = chars.slice(0, 110).join('') + (chars.length > 110 ? '…' : '');
        const row = `<code>${String(index + 1).padStart(2, '0')}</code>\u2002<a href="https://www.nodeseek.com/post-${post.postId}-1">${h(name)}</a>\n👁 ${post.views.toLocaleString('zh-CN')}  ·  💬 ${post.replies.toLocaleString('zh-CN')}  ·  ${h(post.categoryLabel)}\n\n`;
        if (text.length + row.length > 3400) break;
        text += row;
    }
    if (!data.posts.length) text += data.updatedAt ? '暂无符合时间范围的帖子。\n\n' : '榜单准备中，采集完成后可再次查看。\n\n';
    if (data.error || (data.stale && data.updatedAt)) text += '⚠️ 采集延迟，当前为上次保存的榜单。\n';
    if (data.updatedAt) text += `更新于 ${new Date(data.updatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（UTC+8）\n`;
    return text + '每 5 分钟采集 · 仅覆盖已采集的公开帖子';
}
