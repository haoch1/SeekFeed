import type { FC } from 'hono/jsx';
import { Icon } from './DashboardSurface';
import { Skeleton, SkeletonChart } from './Skeleton';

export const SubscriptionAnalytics: FC = () => (
    <article id="subscriptionAnalytics" class="analytics-card analytics-notifications" aria-busy="true">
        <header class="analytics-notification-heading">
            <div><h2><Icon name="bell" />订阅与通知</h2><p id="subscriptionAnalyticsScope" class="analytics-caption skeleton-value" aria-busy="true" role="status"></p></div>
            <div id="notificationRangeSelector" class="analytics-period" role="group" aria-label="订阅统计时间范围">
                {[[-1, '今日'], [7, '近 7 天'], [30, '近 30 天'], [0, '全部']].map(([days, label]) => (
                    <button type="button" class={`notification-range-btn chart-range-btn${days === 7 ? ' active' : ''}`} data-days={days} aria-pressed={days === 7 ? 'true' : 'false'}>{label}</button>
                ))}
            </div>
        </header>
        <div class="analytics-notification-content" data-skeleton aria-hidden="true">
            <div class="analytics-notification-section skeleton-short-chart"><Skeleton /><SkeletonChart /></div>
            <div class="analytics-subscriptions"><Skeleton />{[0, 1, 2].map(() => <div class="skeleton-row"><Skeleton /><Skeleton kind="chip" /></div>)}</div>
        </div>
        <div class="analytics-notification-content" data-loading-content>
            <section class="analytics-notification-section"><div class="analytics-card-heading"><div><h2>通知时效</h2><span class="analytics-caption">发帖至推送的时间</span></div><span id="analyticsDeliverySample" class="analytics-caption">—</span></div><div id="analyticsDelivery"></div></section>
            <section class="analytics-subscriptions"><div class="analytics-card-heading"><div><h2>订阅表现</h2><span class="analytics-caption" id="analyticsSubscriptionsCount">—</span></div></div><div id="analyticsRuleSummary" class="analytics-rule-summary"></div><div id="analyticsSubscriptionList"></div></section>
        </div>
    </article>
);
