import type { FC } from 'hono/jsx';

export const Skeleton: FC<{ kind?: string }> = ({ kind = 'line' }) => (
    <span class={`skeleton skeleton-${kind}`} aria-hidden="true"></span>
);

export const PostSkeleton: FC = () => (
    <div data-skeleton aria-hidden="true">
        {Array.from({ length: 10 }, () => (
            <div class="post-card skeleton-post">
                <div class="post-content">
                    <div class="post-header"><Skeleton kind="post-title" /></div>
                    <div class="post-memo"><Skeleton kind="post-summary" /></div>
                    <div class="post-meta"><Skeleton kind="chip" /><Skeleton /><Skeleton /></div>
                </div>
                <Skeleton kind="action" />
            </div>
        ))}
    </div>
);

export const SkeletonForm: FC<{ fields: number; profile?: boolean; hints?: boolean }> = ({ fields, profile, hints }) => (
    <div class="form-stack skeleton-form" data-skeleton aria-hidden="true">
        {profile && <div class="account-profile"><Skeleton kind="avatar" /><div class="skeleton-form-profile"><Skeleton /><Skeleton kind="button" /></div></div>}
        {Array.from({ length: fields }, () => (
            <div class="form-group"><Skeleton /><Skeleton kind="input" />{hints && <Skeleton kind="hint" />}</div>
        ))}
        <Skeleton kind="button" />
    </div>
);

export const SkeletonRows: FC<{ rows?: number; kind?: 'subscription' | 'session' }> = ({ rows = 3, kind }) => (
    <div class="skeleton-rows" data-skeleton aria-hidden="true">
        {Array.from({ length: rows }, () => (
            <div class={kind === 'subscription' ? 'subscription-item' : kind === 'session' ? 'session-item' : 'skeleton-row'}>
                {kind === 'session' && <Skeleton kind="avatar" />}
                <div class="skeleton-row-text"><Skeleton /><Skeleton kind="hint" /></div>
                <Skeleton kind={kind ? 'button' : 'chip'} />
            </div>
        ))}
    </div>
);

export const SkeletonChart: FC<{ ring?: boolean }> = ({ ring }) => ring
    ? <div class="skeleton-chart skeleton-chart-ring" aria-hidden="true"><Skeleton kind="ring" /><div class="skeleton-row-text"><Skeleton /><Skeleton /><Skeleton kind="hint" /></div></div>
    : <div class="skeleton-chart skeleton-chart-bars" aria-hidden="true">{[36, 55, 42, 70, 61, 82, 55].map(height => <span class="skeleton" style={`height:${height}%`}></span>)}</div>;

export const SettingsLoadError: FC = () => (
    <p class="inline-error" data-loading-error role="status">读取失败，请重新打开此页面重试。</p>
);
