# 论文格式智能排版工具

面向大学生论文写作的结构化排版 Web 应用。用户填写封面、摘要、章节正文、表格、图片和参考文献等纯文本字段，系统自动生成标准编号、目录、A4 分页预览，并支持 PDF、Word 和项目备份导出。

## 当前能力

- 结构化填空：无需手动调整字号、缩进和标题编号
- 三栏联动：目录、填空区与分页预览实时同步
- 模板预设：本科论文、硕士论文、课程论文和自定义规则
- 内容组件：三级章节、表格、图片、图题和参考文献
- 格式检查：封面字段、摘要、标题层级、图表和参考文献检查
- 自动保存：游客本机保存，登录用户云端同步
- 项目管理：创建、打开、删除和跨设备继续编辑
- 冲突保护：云端版本变化时阻止旧内容静默覆盖
- 文件导出：浏览器打印为 PDF、Word `.doc`、项目 JSON 备份

## 技术架构

项目不依赖前端框架和第三方运行库：

- `public/`：正式静态前端
- `src/`：Node.js API、身份认证、格式检查和导出
- 本地开发：JSON 文件持久化
- Vercel：连接 Upstash Redis 后自动切换为云端持久化
- 未连接数据库：自动降级为本机模式，编辑和导出仍可使用

## 本地运行

需要 Node.js 18 或更高版本。

```bash
npm run check
npm start
```

访问：

```text
http://127.0.0.1:8787/
```

完整冒烟测试：

```bash
npm run smoke
```

## Vercel 上线

### 1. 导入 GitHub 仓库

在 Vercel 选择 `Add New Project`，导入该仓库：

- Framework Preset：`Other`
- Root Directory：`./`
- Build Command：`npm run build`
- Output Directory：留空

点击 `Deploy`。此时游客已经可以使用本机自动保存、预览和导出。

### 2. 连接持久化数据库

在 Vercel 项目中进入：

```text
Storage / Marketplace -> Upstash Redis -> Create / Connect
```

将数据库连接到当前项目。Vercel 会自动注入以下任一组变量：

```text
KV_REST_API_URL
KV_REST_API_TOKEN
```

或：

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

代码会自动识别，不需要把密钥写进仓库。

### 3. 重新部署

连接数据库后，在 `Deployments` 中对最新部署选择 `Redeploy`，然后访问：

```text
https://你的域名.vercel.app/health
```

正式云端模式应返回：

```json
{
  "ok": true,
  "storage": "upstash",
  "persistent": true
}
```

如果返回 `"persistent": false`，页面仍可本机使用，但注册和云端项目会被禁用，避免误导用户。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 本地服务端口 |
| `HOST` | `127.0.0.1` | 本地监听地址 |
| `DATA_DIR` | `./data` | 本地 JSON 数据目录 |
| `PUBLIC_DIR` | `./public` | 前端静态文件目录 |
| `SESSION_TTL_DAYS` | `7` | 登录有效天数 |
| `MAX_JSON_BYTES` | `5242880` | 项目请求大小限制 |
| `MAX_ASSET_BYTES` | `5242880` | 单个资源大小限制 |
| `STORAGE_PREFIX` | `thesis-editor-v1` | Redis 数据键前缀 |

Vercel 不需要设置 `PORT`、`HOST`、`DATA_DIR` 或 `PUBLIC_DIR`。

## 主要 API

```text
GET    /health
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/me

GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PUT    /api/projects/:id
DELETE /api/projects/:id

GET    /api/templates
POST   /api/templates
PUT    /api/templates/:id
DELETE /api/templates/:id

GET    /api/assets
POST   /api/assets
GET    /api/assets/:id/raw
DELETE /api/assets/:id

POST   /api/format/check
POST   /api/export/word
POST   /api/export/print-html
```

除健康检查和注册登录外，API 使用：

```text
Authorization: Bearer <token>
```

## 上线前检查

```bash
npm run check
npm run smoke
```

再完成以下人工检查：

1. `/health` 显示 `persistent: true`
2. 注册后创建项目，刷新页面仍能恢复
3. 另一浏览器登录后能打开同一项目
4. PDF 打印预览和 Word 文件可正常打开
5. Vercel 域名全程使用 HTTPS

## 已知边界

- PDF 通过浏览器打印对话框生成，以保持中文字体和分页效果
- Word 导出为兼容 Microsoft Word/WPS 的 `.doc` HTML 文档
- 单张内嵌图片限制为 3 MB，避免浏览器本地存储溢出
- 当前版本适合个人论文写作，尚未提供多人实时协作
