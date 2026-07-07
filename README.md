# 论文格式智能排版工具

这是一个可以直接部署到 Vercel 的全栈 MVP：

- `public/`：论文排版工具前端页面
- `src/`：Node.js 后端 API
- `vercel.json`：Vercel 路由与函数配置
- `data/`：本地开发时的 JSON 数据目录

当前版本不依赖任何 npm 第三方包，使用 Node.js 原生模块完成用户、项目、模板、资源、格式检查和导出能力。

## 本地启动

```bash
node src/server.js
```

默认地址：

```text
http://127.0.0.1:8787
```

打开根路径即可访问前端：

```text
http://127.0.0.1:8787/
```

## 部署到 Vercel

### 1. 上传到 GitHub

把本文件夹内的所有内容上传到你的 GitHub 仓库根目录，例如：

```text
README.md
package.json
vercel.json
public/
src/
scripts/
data/.gitkeep
```

如果你的仓库当前只有静态前端文件，建议直接用本文件夹的内容替换仓库根目录，因为现在前端已经放在 `public/` 里，后端入口是 `src/server.js`。

### 2. 在 Vercel 导入仓库

进入 Vercel 后：

1. 选择 `Add New Project`
2. Import 你的 GitHub 仓库
3. Framework Preset 选择 `Other`
4. Build Command 使用 `npm run build`
5. Output Directory 留空
6. 点击 Deploy

### 3. 配置环境变量

Vercel 项目里建议设置：

```text
DATA_DIR=/tmp/thesis-editor-data
PUBLIC_DIR=./public
CORS_ORIGIN=*
```

不要在 Vercel 里设置 `HOST` 和 `PORT`，Vercel 会自动分配运行端口。

### 4. 验证部署

部署完成后访问：

```text
https://你的项目域名.vercel.app/
```

健康检查接口：

```text
https://你的项目域名.vercel.app/health
```

如果 `/health` 返回：

```json
{
  "ok": true,
  "service": "thesis-editor-backend"
}
```

说明后端已经成功运行。

## 重要说明

当前版本为了快速上线，使用 JSON 文件存储数据。本地运行时数据会保存在 `data/`；部署到 Vercel 后，数据会保存在 `/tmp/thesis-editor-data`。

这适合 MVP 演示和投递作品集，但不适合长期保存真实论文数据。正式上线建议把数据层迁移到 Supabase、PostgreSQL、Neon、Vercel Postgres 或其他数据库。

## 环境变量

```text
PORT=8787
HOST=127.0.0.1
DATA_DIR=./data
PUBLIC_DIR=./public
SESSION_TTL_DAYS=7
MAX_JSON_BYTES=5242880
MAX_ASSET_BYTES=5242880
CORS_ORIGIN=*
```

当前版本不会自动读取 `.env` 文件。如需本地使用环境变量，请在命令前设置：

```bash
PORT=9000 DATA_DIR=./data node src/server.js
```

## API

所有需要登录的接口使用：

```text
Authorization: Bearer <token>
```

### 基础接口

```http
GET /health
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET /api/me
```

### 论文项目

```http
GET /api/projects
POST /api/projects
GET /api/projects/:id
PUT /api/projects/:id
DELETE /api/projects/:id
```

项目数据结构兼容当前前端：

```json
{
  "title": "论文格式智能排版工具设计",
  "metadata": {
    "school": "示例大学",
    "paperType": "本科毕业论文",
    "title": "论文格式智能排版工具设计",
    "author": "学生示例",
    "supervisor": "导师示例",
    "keywords": "论文排版；富文本编辑器"
  },
  "template": {
    "name": "通用本科论文模板",
    "fontSize": "15px",
    "lineHeight": "1.75"
  },
  "content": "<h1>第一章 绪论</h1><p>正文内容...</p>"
}
```

### 模板与资源

```http
GET /api/templates
POST /api/templates
GET /api/templates/:id
PUT /api/templates/:id
DELETE /api/templates/:id

GET /api/assets
POST /api/assets
GET /api/assets/:id/raw
DELETE /api/assets/:id
```

### 格式检查与导出

```http
POST /api/format/check
POST /api/export/word
POST /api/export/print-html
```

## 验证

```bash
npm run check
npm run smoke
```

## 后续升级路线

- 将 JSON 文件持久化迁移到数据库
- 增加正式用户系统和权限控制
- 前端接入后端项目保存接口，替代纯 localStorage
- 增加学校模板库、版本历史和多人协作
- 增加真正的 PDF 渲染服务，例如 Playwright / Puppeteer
