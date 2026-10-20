import type { FC } from 'hono/jsx';
import { Icon } from './DashboardSurface';
import { FieldInput } from './Controls';

export const StatisticsPage: FC<{ active: boolean }> = ({ active }) => (
    <section id="statsPage" class="route-page" hidden={!active}>
        <div class="workspace-heading analytics-heading">
            <div><h1>统计信息</h1></div>
            <div id="chartRangeSelector" class="analytics-period" role="group" aria-label="统计时间范围">
                {[[-1, '今日'], [7, '近 7 天'], [30, '近 30 天'], [0, '全部']].map(([days, label]) => (
                    <button type="button" class={`chart-range-btn${days === -1 ? ' active' : ''}`} data-days={days} aria-pressed={days === -1 ? 'true' : 'false'}>{label}</button>
                ))}
            </div>
        </div>
        <div class="analytics-meta"><span id="analyticsPeriodLabel">正在读取统计…</span><span id="analyticsTimezone"></span></div>
        <div id="analyticsError" class="analytics-error" role="status" hidden><span>统计加载失败。</span><button type="button" class="btn btn-secondary btn-xs" id="retryAnalytics">重试</button></div>
        <div id="analyticsContent" class="analytics-content" aria-busy="true">
            <div class="analytics-kpis">
                {[
                    ['posts', '收录帖子', 'posts', 'analyticsPosts', 'analyticsPostsDetail'],
                    ['authors', '活跃作者', 'user', 'analyticsAuthors', 'analyticsAuthorsDetail'],
                    ['categories', '活跃分类', 'list', 'analyticsCategoriesTotal', 'analyticsCategoryDetail'],
                    ['average', '日均发帖', 'chart', 'analyticsDailyAverage', 'analyticsDailyDetail'],
                ].map(([tone, label, icon, value, detail]) => (
                    <article class={`analytics-kpi analytics-${tone}`}>
                        <div class="analytics-kpi-label"><span>{label}</span><span class="analytics-icon"><Icon name={icon} /></span></div>
                        <strong id={value} class="analytics-value">—</strong><div class="analytics-kpi-detail" id={detail}>—</div>
                    </article>
                ))}
            </div>
            <div class="analytics-top-grid">
                <article class="analytics-card analytics-trend">
                    <div class="analytics-card-heading"><div><h2>发帖趋势</h2><span id="analyticsTrendUnit" class="analytics-caption">按小时</span></div><span class="analytics-legend"><span><i class="dot-posts"></i>收录帖子</span></span></div>
                    <div class="analytics-trend-readout" id="analyticsTrendReadout" aria-live="off">正在读取数据</div><div id="analyticsTrend" class="analytics-plot"></div>
                </article>
                <article class="analytics-card analytics-status">
                    <div class="analytics-card-heading"><h2>分类占比</h2><a href="#analyticsCategoryCard" class="analytics-text-link" id="analyticsCategoryLink">查看全部</a></div>
                    <div class="analytics-donut-wrap"><div id="analyticsDonut" class="analytics-donut"><div><strong id="analyticsCategoryShare">—</strong><span id="analyticsLeadingCategory">最多的分类</span></div></div></div>
                    <div id="analyticsCategoryLegend" class="analytics-status-list"></div>
                </article>
            </div>
            <article id="analyticsCategoryCard" class="analytics-card">
                <div class="analytics-card-heading"><div><h2>分类分析</h2><span id="analyticsCategoryCount" class="analytics-caption">所有分类</span></div><div class="analytics-category-search"><Icon name="search" /><FieldInput type="search" id="analyticsCategorySearch" class="input-field" placeholder="搜索分类" aria-label="搜索统计分类" /></div></div>
                <div class="analytics-category-table-wrap" tabindex="0" role="region" aria-label="全部分类统计，可滚动查看更多分类"><table class="analytics-category-table"><thead><tr><th>分类</th><th>帖子</th><th>作者</th><th>占比</th></tr></thead><tbody id="analyticsCategoryRows"></tbody></table></div>
                <div id="analyticsCategoryEmpty" class="analytics-table-empty" hidden>没有符合条件的分类</div>
            </article>
            <div class="analytics-bottom-grid">
                <article class="analytics-card"><div class="analytics-card-heading"><div><h2>作者贡献</h2><span class="analytics-caption">按发帖量分组</span></div></div><div id="analyticsAuthorDistribution" class="analytics-contribution"></div></article>
                <article class="analytics-card"><div class="analytics-card-heading"><h2>活跃作者</h2><span class="analytics-caption">TOP 6</span></div><div id="analyticsAuthorList" class="analytics-ranked-list"></div></article>
            </div>
            <article class="analytics-card analytics-activity">
                <div class="analytics-card-heading"><div><h2>发帖时段</h2><span id="analyticsActivityScope" class="analytics-caption">按星期与小时汇总</span></div><span id="analyticsActivityReadout" class="analytics-caption">—</span></div>
                <div id="analyticsActivity" class="analytics-heatmap" tabindex="0" role="group" aria-label="发帖时段热力图，使用方向键查看数据"></div>
                <div class="analytics-heatmap-footer"><span id="analyticsPeak">—</span><span class="analytics-heatmap-scale">少<i data-level="0"></i><i data-level="1"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i>多</span></div>
            </article>
            <article class="analytics-card"><div class="analytics-card-heading"><h2>热门标题词</h2><span id="analyticsTopicSample" class="analytics-caption">—</span></div><div id="analyticsTopics" class="analytics-topics"></div></article>
            <details class="analytics-definitions"><summary>统计口径<Icon name="chevron-down" /></summary><p>所有图表按所选时区的发帖时间统计，日均值按所选自然日计算；分类列表包含所选时段内所有实际出现的分类。作者贡献按每位作者的发帖量分组。标题词按包含该词的帖子计数，至少出现 2 篇，仅分析最近 5,000 篇标题。</p></details>
        </div>
    </section>
);
