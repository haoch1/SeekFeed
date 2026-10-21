import type { FC } from 'hono/jsx';
import { Icon } from './DashboardSurface';
import { FieldInput } from './Controls';

const ChartExpand: FC<{ target: string; label: string }> = ({ target, label }) => (
    <button type="button" class="icon-btn chart-expand-button header-tooltip-trigger" data-chart-expand={target} aria-haspopup="dialog" aria-label={`放大查看${label}`} aria-describedby={`${target}ExpandHint`}><Icon name="expand" /><span id={`${target}ExpandHint`} class="header-tooltip" role="tooltip">放大查看</span></button>
);

const ChartStyle: FC<{ id: string; label: string; selected: 'bar' | 'line' }> = ({ id, label, selected }) => (
    <div id={id} class="analytics-period analytics-style-selector" role="group" aria-label={label}>{[['bar', '柱形'], ['line', '折线']].map(([style, text]) => <button type="button" class={`chart-range-btn${selected === style ? ' active' : ''}`} data-chart-style={style} aria-pressed={selected === style ? 'true' : 'false'}>{text}</button>)}</div>
);

export const StatisticsPage: FC<{ active: boolean }> = ({ active }) => (
    <section id="statsPage" class="route-page" hidden={!active}>
        <div class="workspace-heading analytics-heading">
            <div><h1><Icon name="chart" /><span>统计信息</span></h1></div>
            <div id="chartRangeSelector" class="analytics-period" role="group" aria-label="统计时间范围">
                {[[-1, '今日'], [7, '近 7 天'], [30, '近 30 天'], [0, '全部']].map(([days, label]) => (
                    <button type="button" class={`chart-range-btn${days === -1 ? ' active' : ''}`} data-days={days} aria-pressed={days === -1 ? 'true' : 'false'}>{label}</button>
                ))}
            </div>
        </div>
        <div class="analytics-meta"><span id="analyticsPeriodLabel">正在读取统计…</span><span id="analyticsTimezone"></span></div>
        <div class="analytics-toolbar"><div class="analytics-toolbar-filters"><select id="analyticsCategoryFilter" class="input-field" aria-label="总览统计分类"><option value="">全部分类</option></select><button type="button" id="analyticsClearCategory" class="btn btn-secondary btn-xs" hidden>清除筛选</button><span class="analytics-caption">总览随分类筛选 · 关键词分析独立统计</span></div><button type="button" id="analyticsExport" class="btn btn-secondary btn-xs" disabled>导出 CSV</button></div>
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
                        <div class="analytics-kpi-label"><span id={tone === 'average' ? 'analyticsDailyLabel' : undefined}>{label}</span><span class="analytics-icon"><Icon name={icon} /></span></div>
                        <strong id={value} class="analytics-value">—</strong><div class="analytics-kpi-detail" id={detail}>—</div>
                    </article>
                ))}
            </div>
            <div class="analytics-top-grid">
                <article class="analytics-card analytics-trend">
                    <div class="analytics-card-heading"><div><h2>发帖趋势</h2><span id="analyticsTrendUnit" class="analytics-caption">按小时</span></div><div class="chart-heading-actions"><ChartStyle id="analyticsTrendStyle" label="趋势图样式" selected="bar" /><ChartExpand target="analyticsTrend" label="发帖趋势" /></div></div>
                    <div class="analytics-trend-readout" id="analyticsTrendReadout" aria-live="off">正在读取数据</div><div id="analyticsTrend" class="analytics-plot"></div>
                </article>
                <article class="analytics-card analytics-status">
                    <div class="analytics-card-heading"><h2>分类占比</h2><a href="#analyticsCategoryCard" class="analytics-text-link" id="analyticsCategoryLink">查看全部</a></div>
                    <div id="analyticsCategoryOverview" class="category-breakdown"></div>
                </article>
            </div>
            <article id="keywordAnalysis" class="analytics-card keyword-analysis">
                <div class="analytics-card-heading"><div><h2>关键词分析</h2><span class="analytics-caption">按所选日期统计，每个词独立计数</span></div><div class="keyword-module-actions"><button id="keywordReset" type="button" class="btn btn-secondary btn-xs">重置</button><button id="keywordToggle" type="button" class="btn btn-secondary btn-xs" aria-expanded="true" aria-controls="keywordAnalysisBody"><span>收起</span><Icon name="chevron-down" /></button></div></div>
                <div id="keywordAnalysisBody">
                <form id="keywordAnalysisForm" class="keyword-analysis-form">
                    <div class="keyword-query-fields">
                        <div class="keyword-query"><Icon name="search" /><FieldInput id="analysisKeyword" type="search" class="input-field" placeholder="关键词，如 DMIT" aria-label="分析关键词" required maxlength="60" /></div>
                        {[1, 2].map(index => <div id={`analysisCompareField${index}`} class="keyword-compare-field" hidden><FieldInput id={`analysisCompare${index}`} class="input-field" placeholder={`对比关键词 ${index}`} aria-label={`对比关键词 ${index}`} maxlength="60" hidden /><button type="button" class="icon-btn" data-remove-compare={index} aria-label={`移除对比关键词 ${index}`}><Icon name="close" /></button></div>)}
                        <button id="keywordAddCompare" type="button" class="btn btn-secondary" aria-label="添加对比" title="添加对比"><Icon name="plus" /><span>添加对比</span></button>
                    </div>
                    <div class="keyword-query-options">
                        <FieldInput id="analysisDate" type="date" class="input-field" aria-label="关键词分析日期" required />
                        <select id="analysisScope" class="input-field" aria-label="关键词匹配范围"><option value="title">仅标题</option><option value="content">标题与 RSS 摘要</option></select>
                        <button id="keywordAnalyzeBtn" type="submit" class="btn btn-primary">开始分析</button>
                    </div>
                </form>
                <div id="keywordSuggestions" class="keyword-suggestions" aria-label="快速分析热门标题词"></div>
                <p id="keywordAnalysisStatus" class="keyword-analysis-status" role="status">输入关键词，查看全天与各时段的发帖分布。</p>
                <div id="keywordAnalysisResults" class="keyword-analysis-results" hidden>
                    <div id="keywordComparison" class="keyword-comparison" role="group" aria-label="选择关键词的分类、作者与详细指标"></div>
                    <p id="keywordDetailLabel" class="keyword-detail-label"></p>
                    <div id="keywordMetrics" class="keyword-metrics"></div>
                    <div id="keywordOverlap" class="keyword-overlap" hidden></div>
                    <div class="keyword-panels">
                        <section class="keyword-panel">
                            <div class="keyword-chart-heading"><h3>时段分布</h3><div class="chart-heading-actions"><ChartStyle id="keywordHourStyle" label="时段分布图样式" selected="bar" /><ChartExpand target="keywordHourChart" label="关键词时段分布" /></div></div>
                            <div class="keyword-chart-toolbar"><div id="keywordHourLegend" class="keyword-chart-legend"></div><div id="keywordBucketSelector" class="analytics-period" role="group" aria-label="关键词时间粒度">{[1, 3, 6].map(hours => <button type="button" class={`chart-range-btn${hours === 1 ? ' active' : ''}`} data-hours={hours} aria-pressed={hours === 1 ? 'true' : 'false'}>{hours} 小时</button>)}</div></div>
                            <div id="keywordChartReadout" class="analytics-caption keyword-panel-readout" aria-live="polite"></div>
                            <div id="keywordHourChart" class="keyword-hour-chart" tabindex="0" role="group" aria-label="关键词时段柱形图，方向键查看数据"></div>
                        </section>
                        <section class="keyword-panel">
                            <div class="keyword-chart-heading"><h3>近 7 天趋势</h3><div class="chart-heading-actions"><ChartStyle id="keywordDailyStyle" label="近七天趋势图样式" selected="line" /><ChartExpand target="keywordDailyChart" label="关键词近 7 天趋势" /></div></div>
                            <div class="keyword-chart-toolbar"><div id="keywordDailyLegend" class="keyword-chart-legend"></div><span class="analytics-caption">篇 / 天</span></div>
                            <div id="keywordDailyReadout" class="analytics-caption keyword-panel-readout">点击日期查看当天</div>
                            <div id="keywordDailyChart" class="keyword-daily-chart"></div>
                        </section>
                        <section class="keyword-panel">
                            <div class="keyword-chart-heading"><h3>分类分布</h3><span id="keywordCategoryTerm" class="analytics-caption"></span></div>
                            <div id="keywordCategories" class="keyword-category-chart"></div>
                        </section>
                        <section class="keyword-panel">
                            <div class="keyword-chart-heading"><h3>活跃作者</h3><div class="analytics-author-controls"><span id="keywordAuthorTerm" class="analytics-caption"></span><select id="keywordAuthorLimit" class="input-field" aria-label="关键词活跃作者数量">{[5, 10, 20, 50].map(limit => <option value={limit}>TOP {limit}</option>)}</select></div></div>
                            <div id="keywordAuthors" class="keyword-ranked" tabindex="0" role="region" aria-label="关键词活跃作者排名，可滚动查看更多"></div>
                        </section>
                    </div>
                </div>
                </div>
            </article>
            <article id="analyticsCategoryCard" class="analytics-card">
                <div class="analytics-card-heading"><div><h2>分类分析</h2><span id="analyticsCategoryCount" class="analytics-caption">所有分类</span></div><div class="analytics-category-search"><Icon name="search" /><FieldInput type="search" id="analyticsCategorySearch" class="input-field" placeholder="搜索分类" aria-label="搜索统计分类" /></div></div>
                <div class="analytics-category-table-wrap" tabindex="0" role="region" aria-label="全部分类统计，可滚动查看更多分类"><table class="analytics-category-table"><thead><tr><th>分类</th><th>帖子</th><th>作者</th><th>占比</th></tr></thead><tbody id="analyticsCategoryRows"></tbody></table></div>
                <div id="analyticsCategoryEmpty" class="analytics-table-empty" hidden>没有符合条件的分类</div>
            </article>
            <div class="analytics-bottom-grid">
                <article class="analytics-card"><div class="analytics-card-heading"><div><h2>作者贡献</h2><span class="analytics-caption">按发帖量分组</span></div></div><div id="analyticsAuthorDistribution" class="analytics-contribution"></div></article>
                <article class="analytics-card"><div class="analytics-card-heading"><h2>活跃作者</h2><select id="analyticsAuthorLimit" class="input-field" aria-label="活跃作者数量">{[5, 10, 20, 50].map(limit => <option value={limit}>TOP {limit}</option>)}</select></div><div id="analyticsAuthorList" class="analytics-ranked-list" tabindex="0" role="region" aria-label="活跃作者排名，可滚动查看更多"></div></article>
            </div>
            <article class="analytics-card analytics-activity">
                <div class="analytics-card-heading"><div><h2>发帖时段</h2><span id="analyticsActivityScope" class="analytics-caption">按星期与小时汇总</span></div><div class="chart-heading-actions"><span id="analyticsActivityReadout" class="analytics-caption">—</span><ChartExpand target="analyticsActivity" label="发帖时段" /></div></div>
                <div class="analytics-heatmap-scroll"><div id="analyticsActivity" class="analytics-heatmap" tabindex="0" role="group" aria-label="发帖时段热力图，点按或使用方向键查看数据，可横向滚动"></div></div>
                <div class="analytics-heatmap-footer"><span id="analyticsPeak">—</span><span class="analytics-heatmap-scale">少<i data-level="0"></i><i data-level="1"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i>多</span></div>
            </article>
            <article class="analytics-card"><div class="analytics-card-heading"><h2>热门标题词</h2><span id="analyticsTopicSample" class="analytics-caption">—</span></div><div id="analyticsTopics" class="analytics-topics"></div></article>
            <details class="analytics-definitions"><summary>统计口径<Icon name="chevron-down" /></summary><p>所有图表按所选时区的发帖时间统计，日均值按所选自然日计算；分类列表包含所选时段内所有实际出现的分类。作者贡献按每位作者的发帖量分组。标题词按包含该词的帖子计数，至少出现 2 篇，仅分析最近 5,000 篇标题。</p></details>
        </div>
    </section>
);
