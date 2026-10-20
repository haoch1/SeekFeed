import type { FC } from 'hono/jsx';
import { Icon } from './DashboardSurface';

export const HotPage: FC<{ active: boolean }> = ({ active }) => <section id="hotPage" class="route-page" hidden={!active}>
    <div class="workspace-heading"><div><h1>热榜</h1></div><button id="hotRefresh" type="button" class="btn btn-secondary"><Icon name="sync" /><span>刷新榜单</span></button></div>
    <section class="hot-panel" aria-label="社区热榜">
        <div class="hot-toolbar">
            <div class="hot-tabs" role="tablist" aria-label="热榜时间范围">
                {([['live', '实时'], ['day', '日榜'], ['week', '周榜']] as const).map(([value, label], index) => <button type="button" role="tab" id={`hotTab-${value}`} data-hot-period={value} aria-selected={index === 0 ? 'true' : 'false'} aria-controls="hotResults" tabindex={index === 0 ? 0 : -1}><span>{label}</span></button>)}
            </div>
            <div class="hot-filters">
                <select id="hotCategory" class="filter-select" aria-label="热榜分类" data-1p-ignore="true" data-op-ignore="true"><option value="">全部分类</option></select>
                <select id="hotSort" class="filter-select" aria-label="热榜排序" data-1p-ignore="true" data-op-ignore="true"><option value="heat">综合热度</option><option value="views">浏览量最多</option><option value="replies">回复量最多</option></select>
                <select id="hotLimit" class="filter-select" aria-label="热榜条数" data-1p-ignore="true" data-op-ignore="true"><option value="30">前 30 条</option><option value="50">前 50 条</option><option value="100">前 100 条</option></select>
            </div>
        </div>
        <div class="hot-statusbar"><span id="hotFreshness" role="status">正在读取榜单…</span><span id="hotError" role="status" hidden></span></div>
        <div id="hotResults" role="tabpanel" aria-labelledby="hotTab-live" aria-busy="true">
            <div class="hot-table-heading" aria-hidden="true"><span>排名</span><span>帖子</span><span><Icon name="eye" /><span id="hotViewsLabel">浏览量</span></span><span><Icon name="message" /><span id="hotRepliesLabel">回复量</span></span><span><Icon name="flame" />热度</span></div>
            <ol id="hotList" class="hot-list">{[1, 2, 3, 4, 5, 6].map(() => <li class="hot-skeleton"><span class="skeleton skeleton-line"></span><span class="skeleton skeleton-title"></span></li>)}</ol>
            <div id="hotEmpty" class="empty-state" hidden><Icon name="flame" /><div class="empty-title">榜单准备中</div><div class="empty-desc">首次采集完成后会自动显示。</div></div>
        </div>
    </section>
</section>;
