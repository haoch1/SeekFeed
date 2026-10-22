import type { FC } from 'hono/jsx';
import { Icon } from './DashboardSurface';
import { FieldInput } from './Controls';

export const TradeAnalyticsPage: FC<{ active: boolean }> = ({ active }) => (
    <section id="tradesPage" class="route-page" hidden={!active}>
        <div class="workspace-heading analytics-heading"><h1><Icon name="trade" /><span>交易分析</span></h1><div class="analytics-period" id="tradeRanges" role="group" aria-label="交易时间范围">{[[0, '全部'], [-1, '今日'], [7, '近7天'], [30, '近30天']].map(([value, label]) => <button type="button" class={`chart-range-btn${value === 0 ? ' active' : ''}`} data-days={value} aria-pressed={String(value === 0)}>{label}</button>)}</div></div>
        <p class="analytics-caption trade-intro">从交易帖中观察供求与报价 · 标题与 RSS 摘要规则识别</p>
        <div class="trade-filters analytics-card">
            <div class="search-box"><Icon name="search" /><FieldInput id="tradeSearch" type="search" placeholder="搜索交易…" aria-label="搜索交易" /></div>
            <select id="tradeProvider" class="input-field" aria-label="交易商家"><option value="">全部商家</option></select>
            <select id="tradeRegion" class="input-field" aria-label="交易地区"><option value="">全部地区</option></select>
            <select id="tradeIntent" class="input-field" aria-label="交易意图"><option value="">全部意图</option></select>
            <select id="tradeAsset" class="input-field" aria-label="商品类型"><option value="">全部商品</option></select>
            <div class="trade-filter-actions"><button id="tradeReset" type="button" class="btn btn-secondary btn-xs">重置</button><button id="tradeRefresh" type="button" class="icon-btn" aria-label="刷新交易分析" title="刷新交易分析"><Icon name="sync" /></button></div>
        </div>
        <p id="tradeRangeInfo" class="analytics-caption" aria-live="polite">正在读取交易数据…</p>
        <div id="tradeError" class="inline-error" role="status" hidden>交易分析读取失败，已保留当前内容。请点击刷新重试。</div>
        <div id="tradeContent" class="analytics-content" aria-busy="true">
            <div class="analytics-kpis" id="tradeKpis"></div>
            <div class="analytics-top-grid">
                <article class="analytics-card" id="tradeTrendCard"><div class="analytics-card-heading"><div><h2>供求发布趋势</h2><span class="analytics-caption">按发帖日期 · 帖子数量</span></div><div class="chart-heading-actions"><div class="analytics-period" id="tradeTrendStyle" role="group" aria-label="交易趋势样式"><button type="button" class="chart-range-btn active" data-style="bar" aria-pressed="true">柱形</button><button type="button" class="chart-range-btn" data-style="line" aria-pressed="false">折线</button></div><button type="button" class="icon-btn chart-expand-button" data-chart-expand="tradeTrendCard" aria-label="放大查看供求趋势"><Icon name="expand" /></button></div></div><div class="trade-legend"><span><i></i>出售</span><span><i></i>求购</span><span><i></i>其余</span></div><div id="tradeTrend" class="trade-trend"></div></article>
                <article class="analytics-card"><div class="analytics-card-heading"><div><h2>商家供求</h2><span class="analytics-caption">点击商家筛选 · 每帖可涉及多个商家</span></div><span class="analytics-caption">TOP 10</span></div><div id="tradeProviders" class="trade-facets"></div></article>
            </div>
            <div class="analytics-top-grid">
                <article class="analytics-card"><div class="analytics-card-heading"><div><h2>地区与商品</h2><span class="analytics-caption">点击切换分析范围</span></div></div><div id="tradeRegions" class="trade-region-grid"></div><h3 class="trade-subheading">商品类型</h3><div id="tradeAssets" class="trade-facets"></div></article>
                <article class="analytics-card"><div class="analytics-card-heading"><div><h2>报价分布</h2><span class="analytics-caption">币种、金额用途与付费周期分别统计</span></div></div><select id="tradePriceGroup" class="input-field" aria-label="报价分组"><option value="">暂无明确币种的报价</option></select><div id="tradePricing"></div><p class="analytics-caption trade-price-note">排除多商家、多地区、同组多金额、结束及其他意图记录；套餐、配置和意图仍可能不同。此处为帖子报价，不是成交价。</p></article>
            </div>
            <div class="analytics-top-grid"><article class="analytics-card"><div class="analytics-card-heading"><div><h2>规格与线路提及</h2><span class="analytics-caption">仅展示明确单位及线路文字，不将简写强制解释为配置</span></div></div><div id="tradeSpecs" class="trade-mentioned"></div></article><article class="analytics-card"><div class="analytics-card-heading"><div><h2>交付方式提及</h2><span class="analytics-caption">不判断是否支持或由哪方承担费用</span></div></div><div id="tradeDelivery" class="trade-mentioned"></div></article></div>
            <article class="analytics-card trade-quality"><div class="analytics-card-heading"><div><h2>识别覆盖与口径</h2><span class="analytics-caption">字段未出现或无法可靠识别时保持未知</span></div><div class="trade-quality-actions"><button id="tradeLabelsManage" type="button" class="btn btn-secondary btn-xs" data-auth-only>标记管理</button><span class="trade-version">规则 v2</span></div></div><div id="tradeCoverage"></div><details><summary>查看提取规则与限制</summary><p>仅分析已收录的交易分类帖子，RSS 摘要可能截断。商家与地区按词表归一，例如“大妈 / DMIT”合并为 DMIT；提及某商家不代表交易主体已确认。意图优先采用标题。意图仅分为求购、出售、其他。已结束、服务、混合或无法明确判断的内容归为其他。</p><p>金额保留原文、出处、币种与用途。裸金额、r / u / o、单独 $ / ¥ / 刀均不推断币种，不换汇、不合计交易额。多商家、多地区、同组多金额、结束及其他意图帖子不进入报价分布。正文明细、完整成交数量均不在本页统计范围内。供求数量按帖子计数，同一作者多次发帖不会合并成独立交易。</p></details></article>
            <article class="analytics-card trade-records"><div class="analytics-card-heading"><div><h2>交易帖明细</h2><span id="tradeRecordsCount" class="analytics-caption"></span></div><nav class="trade-pagination" aria-label="交易帖子分页"><button type="button" id="tradePrev" class="icon-btn" aria-label="上一页交易帖"><Icon name="chevron-left" /></button><span id="tradePagePosition"></span><button type="button" id="tradeNext" class="icon-btn" aria-label="下一页交易帖"><Icon name="chevron-right" /></button></nav></div><div id="tradeRecords"></div></article>
        </div>
    </section>
);
