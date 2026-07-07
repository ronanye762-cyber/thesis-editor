const { extractHeadings } = require("./format-checker");

function buildWordDocument(project) {
  const metadata = project.metadata || {};
  const content = String(project.content || "");
  const headings = extractHeadings(content);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(metadata.title || "论文")}</title>
  <style>
    @page { size: A4; margin: 2.6cm 2.4cm 2.4cm 2.8cm; }
    body { font-family: SimSun, serif; font-size: 12pt; line-height: 1.7; color: #111; }
    h1 { text-align: center; font-size: 18pt; margin: 22pt 0 12pt; }
    h2 { font-size: 15pt; margin: 16pt 0 8pt; }
    h3 { font-size: 13pt; margin: 12pt 0 6pt; }
    p { text-indent: 2em; margin: 0 0 8pt; }
    table { width: 100%; border-collapse: collapse; margin: 10pt 0; }
    th, td { border: 1px solid #777; padding: 6pt; vertical-align: middle; }
    th { background: #eef2f7; }
    img { max-width: 100%; }
    figcaption, .figure-caption { text-align: center; text-indent: 0; font-size: 10.5pt; }
    .center { text-align: center; text-indent: 0; }
    .cover-title { margin-top: 150pt; font-size: 24pt; font-weight: bold; }
    .cover-line { width: 70%; margin: 12pt auto; border-bottom: 1px solid #555; text-align: center; text-indent: 0; }
    .toc-row { text-indent: 0; }
    .page-break { page-break-after: always; }
  </style>
</head>
<body>
  ${coverHtml(metadata)}
  <div class="page-break"></div>
  ${abstractHtml(metadata)}
  <div class="page-break"></div>
  <h1>目录</h1>
  ${headings.map((heading, index) => `<p class="toc-row">${escapeHtml(heading.title)} ...... ${index + 4}</p>`).join("\n")}
  <div class="page-break"></div>
  ${content}
</body>
</html>`;
}

function buildPrintHtml(project) {
  const word = buildWordDocument(project);
  return word.replace("</body>", "<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));</script></body>");
}

function coverHtml(metadata) {
  return `
    <p class="center">学校代码：${escapeHtml(metadata.schoolCode || "")}　　学号：${escapeHtml(metadata.studentId || "")}</p>
    <p class="center cover-title">${escapeHtml(metadata.school || "")}</p>
    <h1>${escapeHtml(metadata.paperType || "论文")}</h1>
    <p class="cover-line">论文题目：${escapeHtml(metadata.title || "")}</p>
    <p class="cover-line">专业：${escapeHtml(metadata.major || "")}</p>
    <p class="cover-line">姓名：${escapeHtml(metadata.author || "")}</p>
    <p class="cover-line">指导教师：${escapeHtml(metadata.supervisor || "")}</p>
    <p class="center">提交日期：${formatDate(metadata.date)}</p>
  `;
}

function abstractHtml(metadata) {
  return `
    <h1>中文摘要</h1>
    <p>${escapeHtml(metadata.abstractCn || "")}</p>
    <p><strong>关键词：</strong>${escapeHtml(metadata.keywords || "")}</p>
    <h1>Abstract</h1>
    <p>${escapeHtml(metadata.abstractEn || "")}</p>
    <p><strong>Keywords:</strong> ${escapeHtml(toEnglishKeywords(metadata.keywords || ""))}</p>
  `;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function toEnglishKeywords(value) {
  return String(value || "")
    .replace(/[；;，、]/g, "; ")
    .replace(/论文排版/g, "thesis formatting")
    .replace(/富文本编辑器/g, "rich-text editor")
    .replace(/模板规则/g, "template rules")
    .replace(/导出/g, "export");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeFileName(value) {
  return String(value || "thesis").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

module.exports = {
  buildPrintHtml,
  buildWordDocument,
  safeFileName,
};
