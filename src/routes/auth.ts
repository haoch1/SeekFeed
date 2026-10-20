import { getClientInfo } from '../utils/clientInfo';
import { z } from 'zod';
import * as bcrypt from 'bcryptjs';
import { Hono } from 'hono'
import { AuthService } from '../services/auth'
import { DatabaseService } from '../services/database'
import type { SessionData } from '../types'
import { requireSession } from '../middleware/session';
import { sessionManagementId } from '../services/session';
import { bodyLimit } from 'hono/body-limit';
import { isAccountAvatar } from '../utils/avatar';

type Bindings = {
  ENVIRONMENT: string
}

type Variables = {
  dbService: DatabaseService
  authService: AuthService
  sessionData: SessionData
}

export const authRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

authRoutes.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
});

authRoutes.use('/sessions', requireSession);
authRoutes.use('/sessions/*', requireSession);
authRoutes.use('/logout-all', requireSession);

// 检查初始化状态
authRoutes.get('/check-init', async (c) => {
  try {
    const authService = c.get('authService')
    const result = await authService.checkInitialization()
    
    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    return c.json({
      success: false,
      message: `检查初始化状态失败: ${error}`
    }, 500)
  }
})

// 用户注册（初始化）
authRoutes.post('/register', async (c) => {
  try {
    const body = await c.req.json()
    const { username, password, confirmPassword } = body
    
    if (!username || !password || !confirmPassword) {
      return c.json({
        success: false,
        message: '请填写所有必填字段'
      }, 400)
    }
    
    const authService = c.get('authService')
    const { ipAddress, userAgent } = getClientInfo(c)
    
    const result = await authService.register({
      username,
      password,
      confirmPassword
    }, ipAddress, userAgent)
    
    if (result.success) {
      return c.json({
        success: true,
        message: result.message,
        sessionId: result.sessionId,
        user: result.user
      })
    } else {
      return c.json(result, 400)
    }
  } catch (error) {
    return c.json({
      success: false,
      message: `注册失败: ${error}`
    }, 500)
  }
})

// 用户登录
authRoutes.post('/login', async (c) => {
  try {
    const body = await c.req.json()
    const { username, password } = body
    
    if (!username || !password) {
      return c.json({
        success: false,
        message: '请填写用户名和密码'
      }, 400)
    }
    
    const authService = c.get('authService')
    const { ipAddress, userAgent } = getClientInfo(c)
    
    const result = await authService.login({
      username,
      password
    }, ipAddress, userAgent)
    
    if (result.success) {
      return c.json({
        success: true,
        message: result.message,
        sessionId: result.sessionId,
        user: result.user
      })
    } else {
      return c.json(result, 401)
    }
  } catch (error) {
    return c.json({
      success: false,
      message: `登录失败: ${error}`
    }, 500)
  }
})

// 验证session
authRoutes.post('/verify', async (c) => {
  try {
    const body = await c.req.json()
    const { sessionId } = body
    
    if (!sessionId) {
      return c.json({
        success: false,
        message: '请提供sessionId'
      }, 400)
    }
    
    const authService = c.get('authService')
    const { ipAddress } = getClientInfo(c)
    
    const result = await authService.verifySession(sessionId, ipAddress)
    
    return c.json({
      success: result.valid,
      message: result.message || (result.valid ? 'Session有效' : 'Session无效'),
      data: result.sessionData || result.payload
    })
  } catch (error) {
    return c.json({
      success: false,
      message: `验证失败: ${error}`
    }, 500)
  }
})

// 刷新session
authRoutes.post('/refresh', async (c) => {
  try {
    const body = await c.req.json()
    const { sessionId } = body
    
    if (!sessionId) {
      return c.json({
        success: false,
        message: '请提供sessionId'
      }, 400)
    }
    
    const authService = c.get('authService')
    const result = await authService.refreshSession(sessionId)
    
    if (result.success) {
      return c.json({
        success: true,
        message: result.message,
        sessionId: result.sessionId,
        user: result.user
      })
    } else {
      return c.json(result, 401)
    }
  } catch (error) {
    return c.json({
      success: false,
      message: `刷新session失败: ${error}`
    }, 500)
  }
})

// 登出
authRoutes.post('/logout', async (c) => {
  try {
    const body = await c.req.json()
    const { sessionId } = body
    
    if (!sessionId) {
      return c.json({
        success: false,
        message: '请提供sessionId'
      }, 400)
    }
    
    const authService = c.get('authService')
    const result = await authService.logout(sessionId)
    
    return c.json(result)
  } catch (error) {
    return c.json({
      success: false,
      message: `登出失败: ${error}`
    }, 500)
  }
})

// 登出所有设备
authRoutes.post('/logout-all', async (c) => {
  try {
    const authService = c.get('authService')
    const result = await authService.logoutAllDevices(c.get('sessionData').userId)
    
    return c.json(result)
  } catch (error) {
    return c.json({
      success: false,
      message: `登出所有设备失败: ${error}`
    }, 500)
  }
})

// 获取活跃session列表
authRoutes.get('/sessions', async (c) => {
  try {
    const authService = c.get('authService')
    const currentSession = c.get('sessionData')
    const sessions = authService.getUserSessions(currentSession.userId).map(({ sessionId, ...session }) => ({
      ...session,
      id: sessionManagementId(sessionId),
      current: sessionId === currentSession.sessionId
    }))
    
    return c.json({
      success: true,
      data: sessions
    })
  } catch (error) {
    return c.json({
      success: false,
      message: `获取session列表失败: ${error}`
    }, 500)
  }
})

authRoutes.delete('/sessions/:id', async c => {
    const id = c.req.param('id');
    if (!/^[a-f0-9]{64}$/.test(id)) return c.json({ success: false, message: '设备标识无效。' }, 400);
    const current = c.get('sessionData');
    const authService = c.get('authService');
    const target = authService.getUserSessions(current.userId).find(session => sessionManagementId(session.sessionId) === id);
    if (!target) return c.json({ success: false, message: '该设备已退出或登录已过期。' }, 404);
    const result = await authService.logout(target.sessionId);
    if (!result.success) return c.json({ success: false, message: '退出失败，请重试。' }, 500);
    return c.json({ success: true, message: '该设备已退出。', data: { current: target.sessionId === current.sessionId } });
});

// 初始化系统（与注册相同的逻辑，但使用不同的端点）
authRoutes.post('/init', async (c) => {
  try {
    const body = await c.req.json()
    const { username, password, confirmPassword } = body
    
    if (!username || !password || !confirmPassword) {
      return c.json({
        success: false,
        message: '请填写所有必填字段'
      }, 400)
    }
    
    const authService = c.get('authService')
    const { ipAddress, userAgent } = getClientInfo(c)
    
    const result = await authService.register({
      username,
      password,
      confirmPassword
    }, ipAddress, userAgent)
    
    if (result.success) {
      return c.json({
        success: true,
        message: result.message,
        data: {
          sessionId: result.sessionId,
          user: result.user
        }
      })
    } else {
      return c.json(result, 400)
    }
  } catch (error) {
    return c.json({
      success: false,
      message: `初始化失败: ${error}`
    }, 500)
  }
})


// Account changes require the current password and revoke every existing session.
for (const path of ['/account', '/preferences', '/avatar']) authRoutes.use(path, requireSession);

authRoutes.get('/account', c => {
    const config = c.get('dbService').getBaseConfig();
    return c.json({ success: true, data: { username: config?.username, session_expiry_hours: config?.session_expiry_hours || 168, avatar: config?.avatar || null } });
});

authRoutes.put('/avatar', bodyLimit({
    maxSize: 412000,
    onError: c => c.json({ success: false, message: '头像文件过大，请重新选择图片。' }, 413),
}), async c => {
    const raw = await c.req.text();
    if (Buffer.byteLength(raw) > 412000) return c.json({ success: false, message: '头像文件过大，请重新选择图片。' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { body = null; }
    if (!body || !isAccountAvatar(body.avatar)) return c.json({ success: false, message: '请选择图片，通过头像上传入口重新上传。' }, 400);
    c.get('dbService').updateBaseConfig({ avatar: body.avatar });
    return c.json({ success: true, message: '头像已更新。', data: { avatar: body.avatar } });
});

authRoutes.delete('/avatar', c => {
    c.get('dbService').updateBaseConfig({ avatar: null });
    return c.json({ success: true, message: '已恢复默认头像。', data: { avatar: null } });
});

const accountSchema = z.object({
    username: z.string().trim().min(3).max(50),
    currentPassword: z.string().min(1).max(50),
    newPassword: z.union([z.literal(''), z.string().min(8).max(50)]).optional(),
});
authRoutes.put('/account', async c => {
    const parsed = accountSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ success: false, message: '用户名需为 3–50 个字符，新密码需为 8–50 个字符。' }, 400);
    const db = c.get('dbService');
    const config = db.getBaseConfig();
    if (!config || !await bcrypt.compare(parsed.data.currentPassword, config.password)) {
        return c.json({ success: false, message: '当前密码不正确。' }, 400);
    }
    const password = parsed.data.newPassword ? await bcrypt.hash(parsed.data.newPassword, 12) : config.password;
    db.db.transaction(() => {
        db.updateBaseConfig({ username: parsed.data.username, password });
        db.db.query('DELETE FROM sessions').run();
    })();
    return c.json({ success: true, message: '账号信息已保存，请重新登录。' });
});

authRoutes.put('/preferences', async c => {
    const parsed = z.object({ session_expiry_hours: z.union([z.literal(1), z.literal(24), z.literal(168), z.literal(720)]) }).strict().safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ success: false, message: '请选择 1 小时、1 天、7 天或 30 天。' }, 400);
    c.get('dbService').updateBaseConfig(parsed.data);
    return c.json({ success: true, message: '登录有效期已保存，对新登录的会话生效。' });
});
