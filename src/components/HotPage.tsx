import type { FC } from 'hono/jsx';
import { Icon } from './DashboardSurface';

export const HotPage: FC<{ active: boolean }> = ({ active }) => <section id="hotPage" class="route-page" hidden={!active}>
    <div class="workspace-heading"><div><h1>热榜</h1><p>浏览与讨论，发现正在升温的话题。</p></div><button id="hotRefresh" type="button" class="btn btn-secondary"><Icon name="sync" /><span>刷新榜单</span></button></div>
    <section class="hot-panel" aria-label="社区热榜">
        <div class="hot-toolbar">
            <div class="hot-tabs" role="tablist" aria-label="热榜时间范围">
                {([['live', '实时'], ['day', '24 小时'], ['week', '7 天']] as const).map(([value, label], index) => <button type="button" role="tab" id={`hotTab-${value}`} data-hot-period={value} aria-selected={index === 0 ? 'true' : 'false'} aria-controls="hotResults" tabindex={index === 0 ? 0 : -1}><span>{label}</span></button>)}
            </div>
            <div class="hot-filters"><select id="hotCategory" class="filter-select" aria-label="热榜分类" data-1p-ignore="true" data-op-ignore="true"><option value="">全部分类</option></select><select id="hotSort" class="filter-select" aria-label="热榜排序" data-1p-ignore="true" data-op-ignore="true"><option value="heat">综合热度</option><option value="views">浏览最多</option><option value="replies">回复最多</option></select></div>
        </div>
        <div class="hot-statusbar"><span id="hotFreshness" role="status">正在读取榜单…</span><button type="button" class="btn btn-text btn-xs" id="hotNewData" hidden>榜单已更新，点击查看</button><span id="hotCoverage"></span></div>
        <div id="hotError" class="hot-notice" role="alert" hidden></div>
        <div id="hotResults" role="tabpanel" aria-labelledby="hotTab-live" aria-busy="true">
            <div class="hot-table-heading" aria-hidden="true"><span>排名</span><span>帖子</span><span><Icon name="eye" />浏览</span><span><Icon name="message" />回复</span><span>热度</span></div>
            <ol id="hotList" class="hot-list">{[1, 2, 3, 4, 5, 6].map(() => <li class="hot-skeleton"><span class="skeleton skeleton-line"></span><span class="skeleton skeleton-title"></span></li>)}</ol>
            <div id="hotEmpty" class="empty-state" hidden><Icon name="flame" /><div class="empty-title">榜单准备中</div><div class="empty-desc">首次采集完成后会自动显示。</div></div>
        </div>
        <div class="hot-footer"><span id="hotCount">最多展示 50 条</span><details class="hot-method"><summary>排名说明<Icon name="chevron-down" /></summary><div><p>每 5 分钟采集最新回复、最新发布各前 2 页，按浏览和回复计算热度，回复权重更高。</p><p>实时榜随最近讨论时间衰减，并排除置顶帖。24 小时、7 天榜按 RSS 确认的发布时间筛选，计数截至各条目最近采集时间。</p><p>榜单仅覆盖已采集的公开帖子，并非全站完整排名。</p></div></details></div>
    </section>
</section>;
