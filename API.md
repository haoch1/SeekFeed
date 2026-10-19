# SeekFeed API 文档

## 基础信息

- **Base URL**: `http://localhost:3010`
- **认证方式**: 数据库 Session，使用 Bearer 请求头
- **Content-Type**: `application/json`

## 认证与账号设置

`GET /auth/check-init` 检查初始化状态。首次使用通过 `POST /auth/init` 提交 `username`、`password`、`confirmPassword`，此接口只允许初始化一次。

`POST /auth/login` 提交 JSON `{ "username": "admin", "password": "your-password" }`，成功返回 `{ "success": true, "sessionId": "随机会话凭据", "user": { "username": "admin", "isInitialized": true } }`。

后续受保护请求携带 `Authorization: Bearer <sessionId>`。会话为数据库保存的随机凭据，默认 7 天过期，每个账号最多 5 个活跃会话。

| 接口 | 请求 / 行为 |
| --- | --- |
| `POST /auth/verify` | JSON `{ "sessionId": "..." }` 验证会话 |
| `POST /auth/logout` | JSON `{ "sessionId": "..." }` 注销该会话 |
| `GET /auth/account` | 需认证；返回用户名和 `session_expiry_hours`，不返回密码 |
| `PUT /auth/account` | 需认证；JSON `{ "username": "new-admin", "currentPassword": "...", "newPassword": "..." }`。新密码为空时保留密码；用户名 3–50 字，新密码 8–50 字。成功后所有会话失效，需要重新登录 |
| `PUT /auth/preferences` | 需认证；JSON `{ "session_expiry_hours": 168 }`，仅接受 `1`、`24`、`168`、`720`；对新会话生效 |
| `GET /auth/sessions` | 需认证；返回活跃设备、创建/到期时间和 `current`，不暴露可重用的会话 ID |
| `POST /auth/logout-all` | 需认证；注销包括当前设备在内的所有会话 |

通用 `PUT /api/config` 不接受用户名、密码或会话有效期，账号设置必须使用上述接口验证。

## 配置管理

### 获取系统配置
```http
GET /api/config
Authorization: Bearer <sessionId>
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "admin",
    "bot_token": "123456:ABC-DEF...",
    "chat_id": "123456789",
    "bound_user_name": "John Doe",
    "bound_user_username": "johndoe",
    "stop_push": 0,
    "only_title": 0,
    "rss_url": "https://rss.nodeseek.com/",
    "rss_interval_seconds": 60,
    "rss_proxy": null,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

### 更新系统配置
```http
PUT /api/config
Authorization: Bearer <sessionId>
Content-Type: application/json

{
  "chat_id": "987654321",
  "stop_push": 0,
  "only_title": 1,
  "rss_url": "https://rss.nodeseek.com/",
  "rss_interval_seconds": 60,
  "rss_proxy": "http://127.0.0.1:7890"
}
```

### 设置 Telegram Bot Token
```http
POST /api/bot-token
Authorization: Bearer <sessionId>
Content-Type: application/json

{
  "bot_token": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
}
```

## 订阅管理

### 获取订阅列表
```http
GET /api/subscriptions
Authorization: Bearer <sessionId>
```

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "keyword1": "Docker",
      "keyword2": "容器",
      "keyword3": null,
      "creator": null,
      "category": "tech",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### 添加订阅
```http
POST /api/subscriptions
Authorization: Bearer <sessionId>
Content-Type: application/json

{
  "keyword1": "Docker",
  "keyword2": "容器",
  "keyword3": "部署",
  "creator": "admin",
  "category": "tech"
}
```

### 更新订阅
```http
PUT /api/subscriptions/1
Authorization: Bearer <sessionId>
Content-Type: application/json

{
  "keyword1": "Kubernetes",
  "keyword2": "K8s"
}
```

### 删除订阅
```http
DELETE /api/subscriptions/1
Authorization: Bearer <sessionId>
```

## 文章管理

### 获取文章列表
```http
GET /api/posts?page=1&limit=20&pushStatus=0&creator=admin&category=tech
Authorization: Bearer <sessionId>
```

**查询参数**:
- `page`: 页码（默认: 1）
- `limit`: 每页数量（默认: 30，最大: 100）
- `pushStatus`: 推送状态（0: 未推送, 1: 已推送, 2: 无需推送）
- `creator`: 创建者筛选
- `category`: 分类筛选

**响应示例**:
```json
{
  "success": true,
  "data": {
    "posts": [
      {
        "id": 1,
        "post_id": 12345,
        "title": "Docker 容器化部署指南",
        "memo": "详细介绍如何使用 Docker 进行应用容器化部署...",
        "category": "tech",
        "creator": "admin",
        "push_status": 0,
        "sub_id": null,
        "pub_date": "2024-01-01T00:00:00.000Z",
        "push_date": null,
        "created_at": "2024-01-01T00:00:00.000Z"
      }
    ],
    "total": 100,
    "page": 1,
    "totalPages": 5
  }
}
```

### 手动抓取 RSS
```http
POST /api/rss/fetch
Authorization: Bearer <sessionId>
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "new": 5,
    "updated": 0,
    "skipped": 15
  },
  "message": "RSS 更新成功"
}
```

### 手动推送文章
```http
POST /api/posts/12345/push/1
Authorization: Bearer <sessionId>
```

## 统计信息

### 获取系统统计
```http
GET /api/stats
Authorization: Bearer <sessionId>
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "total_posts": 1000,
    "unpushed_posts": 50,
    "pushed_posts": 800,
    "skipped_posts": 150,
    "total_subscriptions": 10,
    "today_posts": 25,
    "today_messages": 15,
    "last_update": "2024-01-01T12:00:00.000Z"
  }
}
```

### 获取匹配统计
```http
GET /api/match-stats
Authorization: Bearer <sessionId>
```

## 系统管理

### 数据清理
```http
POST /api/cleanup
Authorization: Bearer <sessionId>
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "deletedCount": 100
  },
  "message": "清理完成，删除了 100 条记录"
}
```

### RSS 配置管理

#### 获取 RSS 配置
```http
GET /api/rss/config
Authorization: Bearer <sessionId>
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "rss_url": "https://rss.nodeseek.com/",
    "rss_interval_seconds": 60,
    "rss_proxy": ""
  }
}
```

#### 更新 RSS 配置
```http
PUT /api/rss/config
Authorization: Bearer <sessionId>
Content-Type: application/json

{
  "rss_url": "https://rss.nodeseek.com/",
  "rss_interval_seconds": 60,
  "rss_proxy": "http://127.0.0.1:7890"
}
```

**参数说明**:
- `rss_url`: RSS 源地址（可选）
- `rss_interval_seconds`: 抓取间隔秒数，范围 10-3600（可选）
- `rss_proxy`: HTTP/HTTPS 代理地址，留空表示不使用代理（可选）

#### 测试 RSS 连接
```http
POST /api/rss/test-connection
Authorization: Bearer <sessionId>
Content-Type: application/json

{
  "rss_url": "https://rss.nodeseek.com/"
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "accessible": true,
    "message": "RSS 源可正常访问"
  }
}
```

#### 重启 RSS 任务
修改抓取间隔后需要重启任务才能生效：
```http
POST /api/rss/restart
Authorization: Bearer <sessionId>
```

**响应示例**:
```json
{
  "success": true,
  "message": "RSS 任务已重启"
}
```

### 获取定时任务状态
```http
GET /api/scheduler/status
Authorization: Bearer <sessionId>
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "rssTask": {
      "running": true,
      "nextRun": "2024-01-01T12:01:00.000Z"
    },
    "cleanupTask": {
      "running": true,
      "nextRun": "2024-01-02T02:00:00.000Z"
    }
  }
}
```

### 手动执行 RSS 任务
```http
POST /api/scheduler/rss/run
Authorization: Bearer <sessionId>
```

## Telegram 集成

### Webhook 处理
```http
POST /telegram/webhook
Content-Type: application/json

{
  "update_id": 123456,
  "message": {
    "message_id": 1,
    "from": {
      "id": 123456789,
      "first_name": "John",
      "username": "johndoe"
    },
    "chat": {
      "id": 123456789,
      "type": "private"
    },
    "date": 1640995200,
    "text": "/start"
  }
}
```

### 设置 Webhook
```http
POST /telegram/set-webhook
Authorization: Bearer <sessionId>
Content-Type: application/json

{
  "webhookUrl": "https://your-domain.com/telegram/webhook"
}
```

### 获取 Bot 信息
```http
GET /telegram/bot-info
Authorization: Bearer <sessionId>
```

### 发送测试消息
```http
POST /telegram/test-message
Authorization: Bearer <sessionId>
Content-Type: application/json

{
  "message": "这是一条测试消息"
}
```

## 错误响应格式

所有错误响应都遵循以下格式：

```json
{
  "success": false,
  "message": "错误描述",
  "code": "ERROR_CODE",
  "details": {}
}
```

### 常见错误码

- `400 Bad Request`: 请求参数错误
- `401 Unauthorized`: 未授权或 Token 无效
- `403 Forbidden`: 权限不足
- `404 Not Found`: 资源不存在
- `500 Internal Server Error`: 服务器内部错误

### 验证错误示例

```json
{
  "success": false,
  "message": "用户名不能为空",
  "field": "username",
  "code": "required"
}
```

## 数据模型

### BaseConfig
```typescript
interface BaseConfig {
  id?: number;
  username: string;
  password: string;
  bot_token?: string;
  chat_id: string;
  bound_user_name?: string;
  bound_user_username?: string;
  stop_push: number;
  only_title: number;
  rss_url?: string;           // RSS 源地址
  rss_interval_seconds?: number;  // 抓取间隔秒数
  rss_proxy?: string;         // HTTP/HTTPS 代理地址
  created_at?: string;
  updated_at?: string;
}
```

### Post
```typescript
interface Post {
  id?: number;
  post_id: number;
  title: string;
  memo: string;
  category: string;
  creator: string;
  push_status: number; // 0: 未推送, 1: 已推送, 2: 无需推送
  sub_id?: number;
  pub_date: string;
  push_date?: string;
  created_at?: string;
}
```

### KeywordSub
```typescript
interface KeywordSub {
  id?: number;
  keyword1?: string;
  keyword2?: string;
  keyword3?: string;
  creator?: string;
  category?: string;
  created_at?: string;
  updated_at?: string;
}
```

## 使用示例

### JavaScript/Node.js
```javascript
const API_BASE = 'http://localhost:3010';
let token = '';

// 登录
async function login(username, password) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });
  
  const result = await response.json();
  if (result.success) {
    token = result.data.token;
  }
  return result;
}

// 获取文章列表
async function getPosts(page = 1, limit = 20) {
  const response = await fetch(`${API_BASE}/api/posts?page=${page}&limit=${limit}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  
  return await response.json();
}

// 添加订阅
async function addSubscription(keywords) {
  const response = await fetch(`${API_BASE}/api/subscriptions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      keyword1: keywords[0],
      keyword2: keywords[1],
      keyword3: keywords[2],
    }),
  });
  
  return await response.json();
}
```

### Python
```python
import requests

class SeekFeedAPI:
    def __init__(self, base_url='http://localhost:3010'):
        self.base_url = base_url
        self.token = None
    
    def login(self, username, password):
        response = requests.post(f'{self.base_url}/auth/login', json={
            'username': username,
            'password': password
        })
        
        result = response.json()
        if result['success']:
            self.token = result['data']['token']
        return result
    
    def get_posts(self, page=1, limit=20):
        headers = {'Authorization': f'Bearer {self.token}'}
        response = requests.get(
            f'{self.base_url}/api/posts',
            headers=headers,
            params={'page': page, 'limit': limit}
        )
        return response.json()
    
    def add_subscription(self, keywords):
        headers = {
            'Authorization': f'Bearer {self.token}',
            'Content-Type': 'application/json'
        }
        data = {
            'keyword1': keywords[0] if len(keywords) > 0 else None,
            'keyword2': keywords[1] if len(keywords) > 1 else None,
            'keyword3': keywords[2] if len(keywords) > 2 else None,
        }
        response = requests.post(
            f'{self.base_url}/api/subscriptions',
            headers=headers,
            json=data
        )
        return response.json()

# 使用示例
api = SeekFeedAPI()
api.login('admin', 'password123')
posts = api.get_posts(page=1, limit=10)
```
