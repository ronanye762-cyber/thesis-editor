# 格式助手

用户先输入完整的论文格式要求，系统调用可配置的 AI 服务提取排版规则，再进入目录、正文输入和 PDF 预览三栏界面。正文、图片与引用共同生成 LaTeX，使用真实 XeLaTeX 编译。最终提供 PDF 和可编辑 Word `.docx`，不提供 LaTeX 源文件下载。

## 已实现的流程

- 首屏输入/粘贴格式要求，解析成功直接进入编辑，无额外规则核对页。
- 模板涵盖 A4 页边距、中英文字体、字号、倍数/固定行距、首行缩进、三级标题、页眉页脚、封面、摘要、目录、图表标题与编号等。
- 顶部“＋ 插入附件”支持图片、表格图片、公式图片与文献引用。
- 上传对话框保留正文光标；图片独立成行插入，原段落前后文字保留；插入后可调整宽度、替换、修改标题、移动、删除和撤销。
- 图、表、公式分别编号；图片与标题使用非浮动 LaTeX 块，空间不足时整块换页，保持正文顺序。过长表格提示拆图。
- 录入参考文献信息或完整著录文本；正文引用为上标；重复引用复用编号；删除引用保留文献信息并标记未引用。
- 编辑后延迟编译，过期请求不能覆盖新预览；失败保留上次成功 PDF，并明确提示未更新。
- 草稿及图片保存在 IndexedDB；兼容旧版 localStorage/JSON 项目。账户、云端项目和项目 JSON 备份保留。
- 云端项目保存使用原子比较更新；失败/冲突会阻止切换到另一项目，本机草稿保留；旧请求不会改写另一项目的版本。

## 本地运行

需要 Node.js 22 或以上，以及带中文排版包的 TeX Live / XeLaTeX。

```bash
npm ci
cp .env.example .env
# 编辑 .env，填写 AI_BASE_URL、AI_API_KEY 和 AI_MODEL
npm start
```

打开 http://127.0.0.1:8787/ 。`npm start` 自动读取 `.env`。AI 密钥只在服务端使用。

Linux 编译依赖可安装为：

```bash
apt-get update
apt-get install -y texlive-xetex texlive-lang-chinese texlive-latex-extra texlive-fonts-recommended
```

也可以将 `LATEX_COMMAND` 设置为本机 `xelatex` 的绝对路径。LaTeX 源码从经过校验的规则与转义后的内容生成；不接受用户上传的任意 TeX，编译关闭 shell escape，限制并发与超时，完成后清理临时文件。

## Docker 运行

镜像包含 XeLaTeX、中文包和开源字体，无需在宿主机安装 TeX Live。

```bash
docker build -t thesis-editor .
docker run --rm -p 8787:8787 --env-file .env -e HOST=0.0.0.0 -e DATA_DIR=/app/data -v thesis-data:/app/data thesis-editor
```

单实例本地文件存储用于开发/个人部署；多实例部署请连接 Upstash。

## AI 服务配置

| 变量 | 说明 |
| --- | --- |
| `AI_BASE_URL` | Chat Completions 兼容服务的基础 URL（如以 `/v1` 结尾），也接受完整 `/chat/completions` 地址 |
| `AI_API_KEY` | 服务端密钥 |
| `AI_MODEL` | 服务支持的模型 ID |
| `AI_RESPONSE_FORMAT` | 默认 `json_object`；供应商不支持该参数时设为 `none` |
| `AI_TIMEOUT_MS` | 默认 45000 毫秒 |

AI 只处理格式要求，不接收论文正文。普通输入、图片插入和预览只使用已保存的规则并重新编译。模型输出经过结构、范围和枚举校验；冲突、无法表达的要求或无效结果会明确报错，不静默用默认值代替。

未配置 AI 时首屏会提示服务未连接，不能把关键词匹配结果当成 AI 解析。模型供应商仍由部署者选择，仓库不包含可用密钥。

## Vercel 与独立编译服务

Vercel 通过 `api/index.js` 处理 API 与静态资源。Node 函数不打包 TeX Live，需要另行运行仓库提供的编译容器。

1. 将 Docker 镜像部署到支持长驻容器的平台，使用启动命令 `node compiler/server.js`。
2. 在编译容器设置 `PORT`，以及至少 24 字符的随机 `LATEX_SERVICE_TOKEN`。编译容器不需要 AI 密钥或数据库凭证。
3. 在 Vercel 主应用设置 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`、`LATEX_SERVICE_URL` 和相同的 `LATEX_SERVICE_TOKEN`。
4. 云端账户/项目还需连接 Upstash，设置 `KV_REST_API_URL` / `KV_REST_API_TOKEN`，或 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`。
5. 构建命令 `npm run build`，无需设置静态 Output Directory。重新部署后检查 `/health` 和 `/api/capabilities`。

`/health` 的 `persistent: true` 表示持久化模式已配置，不代表数据库读写验收完成；`/api/capabilities` 只报告 AI 配置和编译模式是否存在，不返回任何密钥。仍需用真实服务做首屏解析、预览、账户保存和导出验收。

Vercel 请求/响应体有平台限制，图片较多的长论文建议使用完整 Docker 部署。前端会在超过当前部署请求上限时提示压缩图片。平台限制参考 [Vercel Functions Limits](https://vercel.com/docs/functions/limitations)，函数超时配置参考 [Maximum Duration](https://vercel.com/docs/functions/configuring-functions/duration)。

GitHub Pages 和纯静态 Netlify 托管无法执行 AI 请求与 LaTeX 编译，只适合读取前端资源；完整功能使用 Node / Docker 或 Vercel + 编译服务。

## 字体与交付文件

- 默认 PDF 使用 TeX Live 的 Fandol 中文字体和 TeX Gyre 西文字体，字体会嵌入 PDF。需要学校指定的宋体/黑体或 Times New Roman 时，应在编译环境安装相应授权字体，并通过 `LATEX_FONT_*` 指定真实字体名称。
- Word 使用同一字号、行距、页边距、标题等规则，正文可编辑，图表和公式保留为图片；收件人的 Word/WPS 需要相应字体。
- Word 目录为可更新域，打开时允许更新字段。Word 与 PDF 使用不同排版引擎，具体分页可能随 Word/WPS 版本和字体环境变化，不能保证逐页像素一致。
- 参考文献支持基础著录字段拼接；需要复杂的文献著录细节时可输入完整、已整理的著录文本，不进行联网检索或自动补全。
- 当前规则模型覆盖三级标题与 A4 常见论文格式；特定学校的精确封面绝对布局、额外审核表或自定义复杂文献样式若无法表达，会在解析时提示，不能假称已经完全应用。

## 验证

```bash
npm run check
npm test
npm run smoke
npm run test:browser
# 必须安装 XeLaTeX；生成真实编译的 PDF 与 DOCX 示例到指定临时目录
node scripts/verify-latex.js /tmp/thesis-output-qa
```

浏览器测试默认使用已安装的 Chrome。CI 使用 Playwright Chromium，可在本机执行 `npx playwright install chromium --no-shell` 后设置 `PLAYWRIGHT_CHANNEL=chromium`。浏览器测试对 AI 和预览失败路径使用固定测试响应；真实 AI 供应商尚需部署后验收。LaTeX 验证脚本使用真实 XeLaTeX，无模拟 PDF。

`.github/workflows/check.yml` 分别执行 Node/浏览器回归与 Linux 真实 LaTeX 编译。前端源文件位于 `public/`；根目录保留静态镜像，修改后运行 `npm run sync`，CI 校验两套文件一致。

## 主要接口

```text
GET  /health
GET  /api/capabilities
POST /api/requirements/parse  { requirements }
POST /api/preview             { project } -> application/pdf
POST /api/export/pdf          { project } -> application/pdf
POST /api/export/word         { project } -> .docx
```

以上编辑/导出接口支持游客。已登录用户也可用 `projectId` 请求导出（需要 Bearer token）。账户、项目、模板、资源和格式检查的原有 API 保留；项目更新必须提供当前 `revision`，版本冲突返回 409。
