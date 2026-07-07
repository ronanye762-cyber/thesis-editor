function checkProject(project) {
  const metadata = project.metadata || {};
  const content = String(project.content || "");
  const text = stripHtml(content).replace(/\s+/g, "");
  const headings = extractHeadings(content);
  const issues = [];

  requireField(metadata.school, "缺少学校名称", "metadata.school", issues);
  requireField(metadata.title, "缺少论文题目", "metadata.title", issues);
  requireField(metadata.author, "缺少作者姓名", "metadata.author", issues);
  requireField(metadata.supervisor, "缺少指导教师", "metadata.supervisor", issues);
  requireField(metadata.abstractCn, "缺少中文摘要", "metadata.abstractCn", issues);
  requireField(metadata.keywords, "缺少关键词", "metadata.keywords", issues);

  if (!headings.some((heading) => heading.level === 1)) {
    issues.push(error("正文缺少一级标题", "content"));
  }

  if (headings[0] && headings[0].level > 1) {
    issues.push(error("标题层级不能从二级或三级开始", headings[0].id || "content"));
  }

  for (let index = 1; index < headings.length; index += 1) {
    if (headings[index].level - headings[index - 1].level > 1) {
      issues.push(error(`标题层级跳级：${headings[index].title}`, headings[index].id || "content"));
    }
  }

  if (!text.includes("参考文献")) {
    issues.push(error("缺少参考文献章节", "references"));
  }

  const tableCount = countMatches(content, /<table[\s>]/gi);
  const tableCaptionCount = countMatches(stripHtml(content), /表\s*[\d一二三四五六七八九十]+/g);
  if (tableCount > tableCaptionCount) {
    issues.push(warn("存在表格缺少表题或编号", "tables"));
  }

  const figureCount = countMatches(content, /(<figure[\s>]|class=["'][^"']*image-placeholder)/gi);
  const figureCaptionCount = countMatches(stripHtml(content), /图\s*[\d一二三四五六七八九十]+/g);
  if (figureCount > figureCaptionCount) {
    issues.push(warn("存在图片缺少图题或编号", "figures"));
  }

  if (text.length < 500) {
    issues.push(suggest("正文内容较少，可继续补充章节", "content"));
  }

  return {
    ok: issues.filter((issue) => issue.type === "error").length === 0,
    issues,
    stats: {
      characters: text.length,
      headings: headings.length,
      tables: tableCount,
      figures: figureCount,
    },
  };
}

function extractHeadings(html) {
  const headings = [];
  const re = /<h([1-3])([^>]*)>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = re.exec(html))) {
    const idMatch = match[2].match(/\sid=["']([^"']+)["']/i);
    headings.push({
      level: Number(match[1]),
      id: idMatch ? idMatch[1] : "",
      title: stripHtml(match[3]).trim(),
    });
  }
  return headings;
}

function requireField(value, message, target, issues) {
  if (!String(value || "").trim()) {
    issues.push(error(message, target));
  }
}

function countMatches(value, re) {
  return (String(value || "").match(re) || []).length;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function error(message, target) {
  return { type: "error", message, target };
}

function warn(message, target) {
  return { type: "warning", message, target };
}

function suggest(message, target) {
  return { type: "suggestion", message, target };
}

module.exports = {
  checkProject,
  extractHeadings,
  stripHtml,
};
