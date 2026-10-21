import type { FC, PropsWithChildren } from "hono/jsx";
import iconPaths from './icons.json';
import identityScript from '../../public/js/identity.js' with { type: 'text' };
import cadence from '../config/cadence.json';

interface LayoutProps {
  title?: string;
  description?: string;
  scriptSrc?: string | string[];
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({
  title = "SeekFeed",
  description,
  scriptSrc,
  children,
}) => {
  return (
    <html lang="zh-CN">
      <head>
        <title>{title}</title>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content" />
        {description && <meta name="description" content={description} />}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="SeekFeed" />
        <meta property="og:title" content={title} />
        {description && <meta property="og:description" content={description} />}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={title} />
        {description && <meta name="twitter:description" content={description} />}

        {/* PWA Config */}
        <meta name="theme-color" content="#4f46e5" />
        <meta name="color-scheme" content="dark light" />
        <meta name="application-name" content="SeekFeed" />
        <meta name="apple-mobile-web-app-title" content="SeekFeed" />
        <link rel="manifest" href="/manifest.json" />

        {/* Favicon */}
        <link rel="icon" type="image/svg+xml" href="/icons/seekfeed.svg" />

        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" href="/icons/seekfeed-192.png" />

        {/* Microsoft */}
        <meta name="msapplication-TileColor" content="#4f46e5" />
        <meta name="msapplication-TileImage" content="/icons/seekfeed-192.png" />

        {/* Shared component styles and one theme source */}
        <link href="/css/skeleton.css" rel="stylesheet" />
        <link href="/css/charts.css" rel="stylesheet" />
        <link href="/css/workspace.css" rel="stylesheet" />
        <link href="/css/analytics.css" rel="stylesheet" />
        <link href="/css/hot.css" rel="stylesheet" />
        <link href="/css/mobile.css" rel="stylesheet" />

        {/* Establish presentation before the first body paint. APIs still verify the session. */}
        <script dangerouslySetInnerHTML={{ __html: `window.SeekFeedCadence = ${JSON.stringify(cadence)};` }} />
        <script dangerouslySetInnerHTML={{ __html: identityScript }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
            (function() {
              let savedTheme;
              try {
                savedTheme = localStorage.getItem('theme');
              } catch { /* Use the system theme when browser storage is unavailable. */ }
              if (savedTheme === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
              } else if (savedTheme === 'light') {
                document.documentElement.setAttribute('data-theme', 'light');
              } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                document.documentElement.setAttribute('data-theme', 'dark');
              }
            })();
          `,
          }}
        />
      </head>
      <body>
        {children}
        {/* Restore account presentation before any external application script can delay parsing. */}
        <script dangerouslySetInnerHTML={{ __html: 'window.SeekFeedIdentity.render();' }} />
        <script id="seekfeedIcons" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(iconPaths).replace(/</g, '\\u003c') }} />
        <script src="/js/controls.js"></script>
        <script src="/js/chart-viewer.js"></script>
        {/* PWA Scripts */}
        <script src="/js/pwa-register.js" defer></script>

        {scriptSrc && (Array.isArray(scriptSrc) ? scriptSrc : [scriptSrc]).map(src => <script src={src}></script>)}
      </body>
    </html>
  );
};

// 专门的页面布局组件
export const PageLayout: FC<
  PropsWithChildren<LayoutProps & { containerClass?: string }>
> = ({
  title,
  description,
  scriptSrc,
  containerClass = "container",
  children,
}) => {
  return (
    <Layout title={title} description={description} scriptSrc={scriptSrc}>
      <div class={containerClass}>{children}</div>
    </Layout>
  );
};
