import { Hono } from 'hono';
import { DatabaseService } from '../services/database';
import { AuthService } from '../services/auth';
import { InitPage, HomePage, ErrorPage } from '../components';
import { PwaCheckPage } from '../components/PwaCheckPage';
import type { ContextVariables } from '../types';

type Variables = ContextVariables & {
  authService: AuthService;
}

export const pageRoutes = new Hono<{ Variables: Variables }>();

pageRoutes.get('/pwa-check', c => c.html(<PwaCheckPage />));

// 首页 - 检查初始化状态，未初始化跳转到初始化页面
for (const path of ['/', '/hot', '/posts', '/matched', '/subscriptions', '/statistics', '/trades', '/settings', '/settings/account', '/settings/rss', '/settings/telegram']) pageRoutes.get(path, async (c) => {
  try {
    const authService = c.get('authService');
    const initStatus = authService.checkInitialization();
    
    // 未初始化时跳转到初始化页面
    if (!initStatus.initialized) {
      return c.redirect('/init');
    }
    
    if (path === '/') return c.redirect('/hot');
    return c.html(<HomePage path={path === "/settings" ? "/settings/account" : path} />);
  } catch (error) {
    return c.html(<ErrorPage message={`加载页面失败: ${error}`} />);
  }
});

// 初始化页面
pageRoutes.get('/init', async (c) => {
  try {
    const authService = c.get('authService');
    const initStatus = authService.checkInitialization();
    
    if (initStatus.initialized) {
      return c.redirect('/');
    }
    
    return c.html(<InitPage />);
  } catch (error) {
    return c.html(<ErrorPage message={`加载初始化页面失败: ${error}`} />);
  }
});
