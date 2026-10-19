import { FieldInput } from './Controls';
import type { FC } from "hono/jsx";
import { Layout } from "./Layout";
import { BrandMark } from "./DashboardSurface";

export const InitPage: FC = () => {
  return (
    <Layout
      title="SeekFeed - 初始化"
      description="SeekFeed初始化设置页面"
      scriptSrc="/js/init.js"
    >
      <div class="setup-page">
        {/* 顶部导航栏 */}
        <header class="setup-header">
          <a href="/" class="workspace-brand">
            <span class="brand-icon"><BrandMark /></span>
            <span><strong>SeekFeed</strong></span>
          </a>
        </header>

        {/* 初始化卡片 */}
        <main class="setup-content">
          <div class="form-card setup-card">
            <div class="setup-intro">
              <span class="brand-icon"><BrandMark /></span>
              <h2 style="font-size: 20px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">
                欢迎使用 SeekFeed
              </h2>
              <p style="font-size: 14px; color: var(--text-muted);">
                首次使用需要创建管理员账号
              </p>
            </div>

            <form id="initForm" class="form-stack">
              <div class="form-group">
                <label for="username" class="form-label" style="color: var(--text-primary); font-weight: 600;">
                  用户名
                </label>
                <FieldInput
                  type="text"
                  id="username"
                  name="username"
                  autocomplete="username"
                  minlength="3"
                  maxlength="20"
                  required
                  placeholder="请输入用户名（3-20个字符）"
                  class="input-field"
                />
              </div>

              <div class="form-group">
                <label for="password" class="form-label" style="color: var(--text-primary); font-weight: 600;">
                  密码
                </label>
                <FieldInput
                  type="password"
                  id="password"
                  name="password"
                  autocomplete="new-password"
                  minlength="6"
                  required
                  placeholder="请输入密码（至少6个字符）"
                  class="input-field"
                />
              </div>

              <div class="form-group">
                <label for="confirmPassword" class="form-label" style="color: var(--text-primary); font-weight: 600;">
                  确认密码
                </label>
                <FieldInput
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  autocomplete="new-password"
                  minlength="6"
                  required
                  placeholder="请再次输入密码"
                  class="input-field"
                />
              </div>

              <div id="initMessage" class="login-message" style="display: none;"></div>

              <button type="submit" class="btn btn-primary" style="width: 100%;">
                初始化系统
              </button>
            </form>
          </div>
        </main>
      </div>
    </Layout>
  );
};
