import type { HotPeriod, HotService } from '../hot';
import { telegramMessage, telegramPostLink, telegramRow, telegramText, telegramTimestamp } from './messages';

export const hotEntryKeyboard = { inline_keyboard: [[{ text: '论坛热榜', callback_data: 'hot:open' }]] };

export function hotRankingKeyboard(period: HotPeriod) {
    return { inline_keyboard: [
        ([['live', '实时'], ['day', '日榜'], ['week', '周榜']] as const).map(([value, label]) => ({
            text: label, callback_data: `hot:${value}`, ...(value === period ? { style: 'primary' as const } : {}),
        })),
        [{ text: '刷新榜单', callback_data: `hot:${period}` }],
    ] };
}

export function hotRankingPreview(data: ReturnType<HotService['ranking']>) {
    const first = data.posts[0];
    return first ? {
        is_disabled: false,
        url: `https://www.nodeseek.com/post-${first.postId}-1`,
        prefer_small_media: true,
        show_above_text: false,
    } : { is_disabled: true };
}

export function hotRankingMessage(data: ReturnType<HotService['ranking']>): string {
    const title = { live: '实时热榜', day: '日榜', week: '周榜' }[data.period];
    let text = '';
    for (const [index, post] of data.posts.slice(0, 10).entries()) {
        const rank = String(index + 1).padStart(2, '0');
        const live = data.period === 'live';
        const row = telegramRow(rank, telegramPostLink(post.postId, post.title), `${live ? '新增浏览' : '浏览量'} ${(live ? post.growthViews : post.views).toLocaleString('zh-CN')} · ${live ? '新增回复' : '回复'} ${(live ? post.growthReplies : post.replies).toLocaleString('zh-CN')} · ${telegramText(post.categoryLabel)}`);
        if (text.length + row.length > 3400) break;
        text += row;
    }
    if (!data.posts.length) text += data.warmingUp ? '正在积累增量样本，下一轮采集后更新。\n\n' : data.updatedAt ? '暂无符合时间范围的帖子。\n\n' : '榜单准备中，采集完成后可再次查看。\n\n';
    if (data.error || (data.stale && data.updatedAt)) text += '采集延迟，当前为上次保存的榜单。\n';
    if (data.updatedAt) text += `更新于 ${telegramTimestamp(data.updatedAt)}\n`;
    return telegramMessage(title, text);
}
