import type { FC } from 'hono/jsx';
import { Layout } from './Layout';
import { BrandMark } from './DashboardSurface';

interface ErrorPageProps {
  message: string;
}

export const ErrorPage: FC<ErrorPageProps> = ({ message }) => {
  return (
    <Layout 
      title="SeekFeed · 页面错误"
      description="SeekFeed错误页面"
    >
      <main class="setup-page setup-content">
        <section class="form-card setup-card" role="alert">
          <div class="setup-intro"><span class="brand-icon"><BrandMark /></span><h1>页面暂时不可用</h1><p class="form-hint">{message}</p></div>
          <a href="/" class="btn btn-primary">返回首页</a>
        </section>
      </main>
    </Layout>
  );
};
