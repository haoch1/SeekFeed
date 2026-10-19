import type { FC } from 'hono/jsx';
import { Layout } from './Layout';
import { BrandMark } from './DashboardSurface';

export const PwaCheckPage: FC = () => (
    <Layout title="SeekFeed · PWA 检查" scriptSrc="/js/pwa-check.js">
        <main class="setup-page">
            <div class="setup-content">
            <section class="setup-card">
                <a href="/" class="workspace-brand"><span class="brand-icon"><BrandMark /></span><span><strong>SeekFeed</strong><small>NodeSeek 监控</small></span></a>
                <h1>PWA 状态检查</h1>
                <p class="setup-description">在浏览器菜单中选择安装应用，即可添加到桌面。</p>
                <dl class="diagnostic-list">
                    <div><dt>应用名称</dt><dd id="pwaName">检查中</dd></div>
                    <div><dt>安全上下文</dt><dd id="pwaSecure">检查中</dd></div>
                    <div><dt>静态资源缓存</dt><dd id="pwaWorker">检查中</dd></div>
                    <div><dt>显示模式</dt><dd id="pwaMode">检查中</dd></div>
                </dl>
                <p class="form-hint">消息通知通过 Telegram 发送。RSS 监控在服务端运行，关闭浏览器也会继续执行。</p>
                <a href="/" class="btn btn-primary">返回控制台</a>
            </section>
            </div>
        </main>
    </Layout>
);
