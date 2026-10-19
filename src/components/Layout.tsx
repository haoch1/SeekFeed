import type { FC, PropsWithChildren } from "hono/jsx";
import iconPaths from './icons.json';

interface LayoutProps {
  title?: string;
  description?: string;
  scriptSrc?: string;
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
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {description && <meta name="description" content={description} />}

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

        {/* 主题初始化脚本 - 防止闪烁 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
            (function() {
              const savedTheme = localStorage.getItem('theme');
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
        <script id="seekfeedIcons" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(iconPaths).replace(/</g, '\\u003c') }} />
        <script src="/js/controls.js"></script>
        {/* PWA Scripts */}
        <script src="/js/pwa-register.js" defer></script>

        {scriptSrc && <script src={scriptSrc}></script>}
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
