const editor = document.getElementById("editor");
const editorScroll = document.getElementById("editorScroll");
const outlineTree = document.getElementById("outlineTree");
const previewPages = document.getElementById("previewPages");
const saveState = document.getElementById("saveState");
const issueCount = document.getElementById("issueCount");
const issueList = document.getElementById("issueList");
const wordCount = document.getElementById("wordCount");
const cursorStyle = document.getElementById("cursorStyle");
const drawer = document.getElementById("templateDrawer");
const backdrop = document.getElementById("drawerBackdrop");
const projectFileInput = document.getElementById("projectFileInput");
const imageFileInput = document.getElementById("imageFileInput");

const stateKey = "thesis-editor-mvp-state-v1";
const legacyContentKey = "thesis-editor-prototype-content";

let state = createDefaultState();
let zoom = 0.82;
let activeHeadingId = "";
let saveTimer = 0;
let renderTimer = 0;
let latestIssues = [];

function createDefaultState() {
  return {
    metadata: {
      school: "示例大学",
      schoolCode: "10251",
      studentId: "Y20260707",
      paperType: "本科毕业论文",
      title: "论文格式智能排版工具设计",
      major: "软件工程",
      author: "学生示例",
      supervisor: "导师示例",
      date: "2026-07-07",
      keywords: "论文排版；富文本编辑器；模板规则；PDF 导出；Word 导出",
      abstractCn:
        "本文围绕大学生论文写作过程中反复调整格式的问题，设计一个在线富文本论文排版工具。系统通过论文结构目录、通用模板规则、实时分页预览和格式检查，帮助用户降低排版成本，并支持导出 PDF 与 Word 文件。",
      abstractEn:
        "This project designs an online rich-text thesis formatting tool for students. It combines structured editing, template rules, real-time paged preview, format checking, and PDF/Word export to reduce repetitive manual formatting work.",
    },
    template: {
      name: "通用本科论文模板",
      fontFamily: "'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
      fontSize: "15px",
      lineHeight: "1.75",
      pageMargin: "26mm 24mm 24mm 28mm",
      headingMode: "chapter",
      requirementText:
        "正文使用小四，1.5 倍行距；一级标题黑体三号居中；页边距上 2.5cm，下 2.5cm，左 3cm，右 2.5cm；参考文献采用 GB/T 7714。",
    },
    content: `
      <h1>第一章 绪论</h1>
      <p>论文格式智能排版工具面向大学生论文写作过程中的格式调整问题，提供类 Word 的富文本编辑、模板规则配置、实时分页预览和文件导出能力。系统希望让用户把主要精力放在论文内容本身，而不是反复处理字号、行距、目录、页码和参考文献格式。</p>
      <h2>1.1 研究背景</h2>
      <p>毕业论文、开题报告和课程论文通常存在明确的学校格式要求。用户在 Word 中手动调整格式时，容易遇到标题层级混乱、目录页码不准、图表编号缺失、参考文献格式不统一等问题。现有 LaTeX 工具排版能力较强，但使用门槛较高。</p>
      <p>因此，第一版产品采用网站应用形态，以富文本编辑为基础，通过结构化论文数据和通用模板规则完成排版渲染，并提供 PDF 与 Word 导出入口。</p>
      <h2>1.2 研究意义</h2>
      <p>该工具的价值在于把论文格式要求沉淀为可配置规则，使用户在编辑过程中即可看到排版结果，并通过格式检查及时发现缺失内容和格式风险。</p>
      <h1>第二章 产品方案</h1>
      <h2>2.1 页面布局</h2>
      <p>第一版主界面采用三栏结构。左侧展示论文结构目录，中间提供富文本编辑区域，右侧展示接近最终提交效果的 A4 分页预览。</p>
      <table>
        <thead>
          <tr><th>区域</th><th>用途</th><th>第一版能力</th></tr>
        </thead>
        <tbody>
          <tr><td>左侧目录</td><td>论文结构导航</td><td>自动生成章节，点击跳转</td></tr>
          <tr><td>中间编辑</td><td>正文写作</td><td>标题、正文、图片、表格、引用</td></tr>
          <tr><td>右侧预览</td><td>最终效果检查</td><td>封面、目录、正文分页预览</td></tr>
        </tbody>
      </table>
      <p class="figure-caption">表 2-1 第一版三栏页面结构</p>
      <h2>2.2 模板规则</h2>
      <p>模板规则包括页面尺寸、页边距、正文字体、字号、行距、标题层级、目录格式、页眉页脚、图表编号和参考文献格式。第一版先实现可视化配置，后续再增强格式要求自动解析。</p>
      <div class="image-placeholder">图 2-1 论文编辑与预览联动示意图</div>
      <p class="figure-caption">图 2-1 论文编辑与预览联动示意图</p>
      <h1>第三章 MVP 范围</h1>
      <h2>3.1 必须完成</h2>
      <ul>
        <li>三栏主界面与论文结构目录。</li>
        <li>类 Word 富文本编辑器。</li>
        <li>右侧 A4 分页预览。</li>
        <li>通用模板配置与格式检查。</li>
        <li>PDF 和 Word 导出入口。</li>
      </ul>
      <h2>3.2 暂不重点实现</h2>
      <p>第一版暂不重点实现多人协作、查重、复杂公式编辑、完整参考文献数据库和移动端深度适配。</p>
      <h1>参考文献</h1>
      <ol>
        <li>教育部学位论文编写规范相关要求。</li>
        <li>GB/T 7714 信息与文献参考文献著录规则。</li>
      </ol>
    `,
  };
}

function init() {
  loadState();
  editor.innerHTML = state.content;
  populateDrawer();
  applyTemplateVars();
  bindEvents();
  normalizeHeadings();
  renderAll();
  setZoom(zoom);
}

function loadState() {
  const saved = localStorage.getItem(stateKey);
  if (saved) {
    try {
      state = mergeState(createDefaultState(), JSON.parse(saved));
      return;
    } catch (error) {
      console.warn("Failed to load project state", error);
    }
  }

  const legacyContent = localStorage.getItem(legacyContentKey);
  if (legacyContent) {
    state.content = legacyContent;
  }
}

function mergeState(base, incoming) {
  return {
    metadata: { ...base.metadata, ...(incoming.metadata || {}) },
    template: { ...base.template, ...(incoming.template || {}) },
    content: incoming.content || base.content,
  };
}

function bindEvents() {
  editor.addEventListener("input", () => {
    state.content = editor.innerHTML;
    scheduleSaveAndRender();
  });
  editor.addEventListener("keyup", updateCursorState);
  editor.addEventListener("mouseup", updateCursorState);
  editorScroll.addEventListener("scroll", updateActiveHeading);

  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => {
      document.execCommand(button.dataset.command, false, null);
      editor.focus();
      state.content = editor.innerHTML;
      scheduleSaveAndRender();
    });
  });

  document.getElementById("blockStyle").addEventListener("change", (event) => {
    document.execCommand("formatBlock", false, event.target.value);
    editor.focus();
    state.content = editor.innerHTML;
    scheduleSaveAndRender();
  });

  document.getElementById("insertTable").addEventListener("click", insertTable);
  document.getElementById("insertImage").addEventListener("click", () => imageFileInput.click());
  imageFileInput.addEventListener("change", insertUploadedImage);
  document.getElementById("insertReference").addEventListener("click", insertReference);
  document.getElementById("insertFootnote").addEventListener("click", insertFootnote);
  document.getElementById("insertEquation").addEventListener("click", insertEquation);
  document.getElementById("addChapter").addEventListener("click", addChapter);

  document.getElementById("refreshPreview").addEventListener("click", renderAll);
  document.getElementById("runCheck").addEventListener("click", () => {
    const issues = runChecks(collectHeadings());
    issueRailFlash(issues.length);
  });

  document.getElementById("zoomOut").addEventListener("click", () => setZoom(zoom - 0.08));
  document.getElementById("zoomIn").addEventListener("click", () => setZoom(zoom + 0.08));
  document.getElementById("exportPdf").addEventListener("click", () => window.print());
  document.getElementById("exportWord").addEventListener("click", exportWord);
  document.getElementById("exportProject").addEventListener("click", exportProject);
  document.getElementById("importProject").addEventListener("click", () => projectFileInput.click());
  projectFileInput.addEventListener("change", importProject);
  document.getElementById("newProject").addEventListener("click", newProject);

  document.getElementById("openTemplate").addEventListener("click", openDrawer);
  document.getElementById("openTemplateTop").addEventListener("click", openDrawer);
  document.getElementById("closeTemplate").addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);
  document.getElementById("applyTemplate").addEventListener("click", applyDrawerState);
  document.getElementById("resetTemplate").addEventListener("click", resetTemplate);
  document.getElementById("parseRequirement").addEventListener("click", parseRequirement);

  getMetadataFields().forEach(([key, element]) => {
    element.addEventListener("input", () => {
      state.metadata[key] = element.value;
      scheduleSaveAndRender();
    });
  });
}

function getMetadataFields() {
  return [
    ["school", document.getElementById("metaSchool")],
    ["schoolCode", document.getElementById("metaSchoolCode")],
    ["studentId", document.getElementById("metaStudentId")],
    ["paperType", document.getElementById("metaPaperType")],
    ["title", document.getElementById("metaTitle")],
    ["major", document.getElementById("metaMajor")],
    ["author", document.getElementById("metaAuthor")],
    ["supervisor", document.getElementById("metaSupervisor")],
    ["date", document.getElementById("metaDate")],
    ["keywords", document.getElementById("metaKeywords")],
    ["abstractCn", document.getElementById("metaAbstractCn")],
    ["abstractEn", document.getElementById("metaAbstractEn")],
  ];
}

function populateDrawer() {
  getMetadataFields().forEach(([key, element]) => {
    element.value = state.metadata[key] || "";
  });

  document.getElementById("fontFamily").value = state.template.fontFamily;
  document.getElementById("fontSize").value = state.template.fontSize;
  document.getElementById("lineHeight").value = state.template.lineHeight;
  document.getElementById("pageMargin").value = state.template.pageMargin;
  document.getElementById("headingMode").value = state.template.headingMode;
  document.getElementById("requirementText").value = state.template.requirementText || "";
  updateProjectLabels();
}

function updateProjectLabels() {
  document.getElementById("projectSubtitle").textContent = `${state.metadata.paperType} · ${state.metadata.title}`;
  document.getElementById("drawerTitle").textContent = "论文信息与模板规则";
  document.querySelector(".template-pill").childNodes[0].textContent = `${state.template.name} `;
}

function applyDrawerState() {
  getMetadataFields().forEach(([key, element]) => {
    state.metadata[key] = element.value.trim();
  });

  state.template.fontFamily = document.getElementById("fontFamily").value;
  state.template.fontSize = document.getElementById("fontSize").value;
  state.template.lineHeight = document.getElementById("lineHeight").value;
  state.template.pageMargin = document.getElementById("pageMargin").value;
  state.template.headingMode = document.getElementById("headingMode").value;
  state.template.requirementText = document.getElementById("requirementText").value;

  applyTemplateVars();
  updateProjectLabels();
  persistState();
  renderAll();
  closeDrawer();
}

function applyTemplateVars() {
  document.documentElement.style.setProperty("--editor-font", state.template.fontFamily);
  document.documentElement.style.setProperty("--paper-font-size", state.template.fontSize);
  document.documentElement.style.setProperty("--paper-line-height", state.template.lineHeight);
  document.documentElement.style.setProperty("--paper-margin", state.template.pageMargin);
}

function scheduleSaveAndRender() {
  state.content = editor.innerHTML;
  clearTimeout(saveTimer);
  saveState.textContent = "保存中";
  saveTimer = window.setTimeout(() => {
    persistState();
    const now = new Date();
    saveState.textContent = `已自动保存 ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }, 260);

  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderAll, 220);
}

function persistState() {
  localStorage.setItem(stateKey, JSON.stringify(state));
}

function renderAll() {
  normalizeHeadings();
  state.content = editor.innerHTML;
  const chunks = chunkEditorBlocks();
  const pageMap = buildPageMap(chunks);
  const headings = collectHeadings(pageMap);
  renderOutline(headings);
  renderPreview(headings, chunks);
  runChecks(headings);
  updateWordCount();
  updateCursorState();
  updateProjectLabels();
}

function normalizeHeadings() {
  editor.querySelectorAll("h1, h2, h3").forEach((heading, index) => {
    if (!heading.id) {
      heading.id = `section-${index + 1}-${Date.now().toString(36)}`;
    }
  });
}

function collectHeadings(pageMap = {}) {
  return Array.from(editor.querySelectorAll("h1, h2, h3")).map((heading, index) => ({
    id: heading.id,
    level: Number(heading.tagName.slice(1)),
    title: heading.textContent.trim() || `未命名标题 ${index + 1}`,
    page: pageMap[heading.id] || Math.max(4, Math.ceil((index + 1) / 3) + 3),
  }));
}

function icon(name) {
  return `<svg><use href="#${name}"></use></svg>`;
}

function renderOutline(headings) {
  const fixed = [
    { id: "cover", level: 1, title: "封面", fixed: true },
    { id: "abstract", level: 1, title: "摘要", fixed: true },
    { id: "toc", level: 1, title: "目录", fixed: true },
  ];

  const items = [...fixed, ...headings];
  outlineTree.innerHTML = items
    .map((item) => {
      const active = item.id === activeHeadingId ? "active" : "";
      const level = item.fixed ? 1 : item.level;
      return `
        <div class="tree-section">
          <button class="tree-button ${active}" type="button" data-target="${item.id}">
            ${icon(item.fixed ? "icon-file-text" : "icon-chevron-right")}
            <span class="tree-title level-${level}">${escapeHtml(item.title)}</span>
          </button>
        </div>
      `;
    })
    .join("");

  outlineTree.querySelectorAll("[data-target]").forEach((button) => {
    button.addEventListener("click", () => jumpToSection(button.dataset.target));
  });
}

function jumpToSection(id) {
  if (["cover", "abstract", "toc"].includes(id)) {
    const page = previewPages.querySelector(`[data-preview="${id}"]`);
    page?.scrollIntoView({ behavior: "smooth", block: "start" });
    activeHeadingId = id;
    renderOutline(collectHeadings());
    return;
  }

  const target = document.getElementById(id);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    activeHeadingId = id;
    renderOutline(collectHeadings());
  }
}

function renderPreview(headings, chunks) {
  const pages = [
    renderCoverPage(1),
    renderAbstractPage(2),
    renderTocPage(headings, 3),
    ...chunks.map((html, index) => renderContentPage(html, index + 4)),
  ];
  previewPages.innerHTML = pages.join("");
}

function renderCoverPage(pageNumber) {
  return `
    <article class="paper-page cover-page" data-preview="cover">
      <div class="cover-code">
        学校代码：${escapeHtml(state.metadata.schoolCode || "")}<br />
        学号：${escapeHtml(state.metadata.studentId || "")}
      </div>
      <div class="cover-title">
        <div class="school-name">${escapeHtml(state.metadata.school || "学校名称")}</div>
        <div class="paper-kind">${escapeHtml(state.metadata.paperType || "论文")}<br />${escapeHtml(state.metadata.title || "论文题目")}</div>
      </div>
      <div class="cover-form">
        ${coverLine("论文题目", state.metadata.title)}
        ${coverLine("专业", state.metadata.major)}
        ${coverLine("姓名", state.metadata.author)}
        ${coverLine("指导教师", state.metadata.supervisor)}
      </div>
      <div class="cover-date">提交日期：${formatDate(state.metadata.date)}</div>
      ${pageFooter(pageNumber)}
    </article>
  `;
}

function coverLine(label, value) {
  return `<div class="cover-line"><span>${label}</span><span>${escapeHtml(value || "")}</span></div>`;
}

function renderAbstractPage(pageNumber) {
  return `
    <article class="paper-page compact-page" data-preview="abstract">
      <section class="abstract-block">
        <h1 class="abstract-title">中文摘要</h1>
        <p>${escapeHtml(state.metadata.abstractCn || "请在论文信息中填写中文摘要。")}</p>
        <p class="keywords">关键词：${escapeHtml(state.metadata.keywords || "请填写关键词")}</p>
      </section>
      <section class="abstract-block">
        <h1 class="abstract-title">Abstract</h1>
        <p>${escapeHtml(state.metadata.abstractEn || "Please fill in the English abstract.")}</p>
        <p class="keywords">Keywords: ${escapeHtml(toEnglishKeywords(state.metadata.keywords))}</p>
      </section>
      ${pageFooter(pageNumber)}
    </article>
  `;
}

function renderTocPage(headings, pageNumber) {
  const rows = headings
    .map((heading) => `
      <div class="toc-row level-${heading.level}">
        <span>${escapeHtml(displayHeadingTitle(heading))}</span>
        <span class="toc-dots"></span>
        <span>${heading.page}</span>
      </div>
    `)
    .join("");

  return `
    <article class="paper-page compact-page" data-preview="toc">
      <h1>目录</h1>
      <div class="toc-list">${rows}</div>
      ${pageFooter(pageNumber)}
    </article>
  `;
}

function renderContentPage(html, pageNumber) {
  return `
    <article class="paper-page">
      ${html}
      ${pageFooter(pageNumber)}
    </article>
  `;
}

function pageFooter(pageNumber) {
  return `<footer class="page-footer">第 ${pageNumber} 页</footer>`;
}

function chunkEditorBlocks() {
  const children = Array.from(editor.children);
  const chunks = [];
  let current = [];
  let score = 0;
  const maxScore = 9.2;

  children.forEach((node) => {
    const tag = node.tagName.toLowerCase();
    const textLength = node.textContent.trim().length;
    const weight =
      tag === "h1"
        ? 1.8
        : tag === "h2"
          ? 1.25
          : tag === "h3"
            ? 1
            : tag === "table"
              ? 3.3
              : tag === "figure" || node.classList.contains("image-placeholder")
                ? 3.5
                : Math.max(0.9, Math.ceil(textLength / 110));

    if (score + weight > maxScore && current.length) {
      chunks.push(current.map((item) => item.outerHTML).join(""));
      current = [];
      score = 0;
    }

    current.push(node.cloneNode(true));
    score += weight;
  });

  if (current.length) {
    chunks.push(current.map((item) => item.outerHTML).join(""));
  }

  return chunks.length ? chunks : ["<p>开始输入论文内容。</p>"];
}

function buildPageMap(chunks) {
  const map = {};
  chunks.forEach((chunk, index) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = chunk;
    wrapper.querySelectorAll("h1, h2, h3").forEach((heading) => {
      if (heading.id) {
        map[heading.id] = index + 4;
      }
    });
  });
  return map;
}

function runChecks(headings = collectHeadings()) {
  const text = editor.textContent.replace(/\s+/g, "");
  const issues = [];

  requiredMeta("school", "缺少学校名称", "metadata", issues);
  requiredMeta("title", "缺少论文题目", "metadata", issues);
  requiredMeta("author", "缺少作者姓名", "metadata", issues);
  requiredMeta("supervisor", "缺少指导教师", "metadata", issues);
  requiredMeta("abstractCn", "缺少中文摘要", "metadata", issues);
  requiredMeta("keywords", "缺少关键词", "metadata", issues);

  if (!headings.some((heading) => heading.level === 1)) {
    issues.push({ type: "error", label: "错误", text: "正文缺少一级标题", target: "editor" });
  }

  const firstHeading = headings[0];
  if (firstHeading && firstHeading.level > 1) {
    issues.push({ type: "error", label: "错误", text: "标题层级不能从二级开始", target: firstHeading.id });
  }

  for (let i = 1; i < headings.length; i += 1) {
    if (headings[i].level - headings[i - 1].level > 1) {
      issues.push({ type: "error", label: "错误", text: `标题层级跳级：${headings[i].title}`, target: headings[i].id });
    }
  }

  if (!text.includes("参考文献")) {
    issues.push({ type: "error", label: "错误", text: "缺少参考文献章节", target: "editor-end" });
  }

  editor.querySelectorAll("table").forEach((table, index) => {
    const next = table.nextElementSibling;
    if (!next || !/表\s*\d|表[一二三四五六七八九十]/.test(next.textContent)) {
      issues.push({ type: "suggest", label: "建议", text: `第 ${index + 1} 个表格缺少表题`, target: table.id || ensureNodeId(table, "table") });
    }
  });

  editor.querySelectorAll("figure, .image-placeholder").forEach((figure, index) => {
    const caption = figure.querySelector?.("figcaption") || figure.nextElementSibling;
    if (!caption || !/图\s*\d|图[一二三四五六七八九十]/.test(caption.textContent)) {
      issues.push({ type: "warning", label: "警告", text: `第 ${index + 1} 个图片缺少图题`, target: figure.id || ensureNodeId(figure, "figure") });
    }
  });

  if (editor.textContent.replace(/\s/g, "").length < 500) {
    issues.push({ type: "suggest", label: "建议", text: "正文内容较少，可继续补充章节", target: "editor" });
  }

  latestIssues = issues;
  renderIssues(issues);
  return issues;
}

function requiredMeta(key, message, target, issues) {
  if (!String(state.metadata[key] || "").trim()) {
    issues.push({ type: "error", label: "错误", text: message, target });
  }
}

function ensureNodeId(node, prefix) {
  if (!node.id) {
    node.id = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    state.content = editor.innerHTML;
    persistState();
  }
  return node.id;
}

function renderIssues(issues) {
  issueCount.textContent = `${issues.length} 个问题`;
  issueList.innerHTML = issues.length
    ? issues
        .map(
          (issue, index) => `
            <button class="issue-chip ${issue.type}" type="button" data-issue-index="${index}">
              <strong>${issue.label}</strong>
              <span>${escapeHtml(issue.text)}</span>
            </button>
          `,
        )
        .join("")
    : `<span class="issue-chip suggest"><strong>通过</strong><span>当前结构检查无阻断问题</span></span>`;

  issueList.querySelectorAll("[data-issue-index]").forEach((button) => {
    button.addEventListener("click", () => jumpToIssue(latestIssues[Number(button.dataset.issueIndex)]));
  });
}

function jumpToIssue(issue) {
  if (!issue) return;
  if (issue.target === "metadata") {
    openDrawer();
    document.getElementById("metaTitle").focus();
    return;
  }
  if (issue.target === "editor-end") {
    editor.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
    editor.focus();
    return;
  }
  if (issue.target === "editor") {
    editor.focus();
    return;
  }
  document.getElementById(issue.target)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function issueRailFlash(count) {
  const rail = document.getElementById("issueRail");
  rail.animate(
    [
      { backgroundColor: count ? "#fff7ed" : "#ecfdf5" },
      { backgroundColor: "#fbfcfe" },
    ],
    { duration: 700, easing: "ease-out" },
  );
}

function updateActiveHeading() {
  const headings = Array.from(editor.querySelectorAll("h1, h2, h3"));
  let current = headings[0]?.id || "";
  const scrollTop = editorScroll.scrollTop;

  headings.forEach((heading) => {
    const top = heading.offsetTop - 140;
    if (top <= scrollTop) {
      current = heading.id;
    }
  });

  if (current && current !== activeHeadingId) {
    activeHeadingId = current;
    renderOutline(collectHeadings());
  }
}

function updateCursorState() {
  const selection = window.getSelection();
  let node = selection?.anchorNode;

  while (node && node !== editor && node.nodeType !== Node.ELEMENT_NODE) {
    node = node.parentNode;
  }

  const element = node && node !== editor ? node.closest?.("h1,h2,h3,p,li,blockquote,td,figcaption") : null;
  const labelMap = {
    H1: "一级标题",
    H2: "二级标题",
    H3: "三级标题",
    P: "正文",
    LI: "列表",
    BLOCKQUOTE: "引用",
    TD: "表格",
    FIGCAPTION: "图题",
  };
  cursorStyle.textContent = `当前段落：${labelMap[element?.tagName] || "正文"}，${fontSizeLabel()}，${lineHeightLabel()}`;
}

function updateWordCount() {
  const count = editor.textContent.replace(/\s/g, "").length;
  const headings = editor.querySelectorAll("h1, h2, h3").length;
  wordCount.textContent = `${count} 字 · ${headings} 个标题`;
}

function insertTable() {
  insertHtml(`
    <table>
      <thead>
        <tr><th>检查项</th><th>模板要求</th><th>当前状态</th></tr>
      </thead>
      <tbody>
        <tr><td>标题格式</td><td>黑体三号居中</td><td>待检查</td></tr>
        <tr><td>正文行距</td><td>1.5 倍行距</td><td>已应用</td></tr>
      </tbody>
    </table>
    <p class="figure-caption">表 X-X 表题说明</p>
  `);
}

function insertUploadedImage() {
  const file = imageFileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    insertHtml(`
      <figure>
        <img src="${reader.result}" alt="${escapeHtml(file.name)}" />
        <figcaption>图 X-X ${escapeHtml(file.name)}</figcaption>
      </figure>
    `);
    imageFileInput.value = "";
  };
  reader.readAsDataURL(file);
}

function insertReference() {
  const referenceHeading = Array.from(editor.querySelectorAll("h1")).find((heading) => heading.textContent.includes("参考文献"));
  const item = `<ol><li>作者. 文献题名[J]. 期刊名称, 2026, 1(1): 1-8.</li></ol>`;
  if (referenceHeading) {
    referenceHeading.insertAdjacentHTML("afterend", item);
  } else {
    editor.insertAdjacentHTML("beforeend", `<h1>参考文献</h1>${item}`);
  }
  state.content = editor.innerHTML;
  scheduleSaveAndRender();
}

function insertFootnote() {
  const note = window.prompt("输入脚注内容", "这里是脚注说明");
  if (note !== null) {
    insertHtml(`<sup title="${escapeHtml(note)}">[注]</sup>`);
  }
}

function insertEquation() {
  const equation = window.prompt("输入公式内容", "E = mc²");
  if (equation !== null && equation.trim()) {
    insertHtml(`<p class="equation-block">${escapeHtml(equation.trim())}</p>`);
  }
}

function addChapter() {
  editor.insertAdjacentHTML("beforeend", `<h1>新章节标题</h1><p>在这里输入新章节内容。</p>`);
  state.content = editor.innerHTML;
  scheduleSaveAndRender();
  editor.querySelector("h1:last-of-type")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function insertHtml(html) {
  editor.focus();
  document.execCommand("insertHTML", false, html);
  state.content = editor.innerHTML;
  scheduleSaveAndRender();
}

function setZoom(nextZoom) {
  zoom = Math.max(0.48, Math.min(1.08, nextZoom));
  previewPages.style.zoom = zoom;
  document.getElementById("zoomLabel").textContent = `${Math.round(zoom * 100)}%`;
}

function openDrawer() {
  populateDrawer();
  drawer.hidden = false;
  backdrop.hidden = false;
}

function closeDrawer() {
  drawer.hidden = true;
  backdrop.hidden = true;
}

function resetTemplate() {
  state.template = createDefaultState().template;
  populateDrawer();
  applyTemplateVars();
  persistState();
  renderAll();
}

function parseRequirement() {
  const raw = document.getElementById("requirementText").value;
  const results = [];

  if (raw.includes("宋体")) {
    document.getElementById("fontFamily").value = "'Songti SC', SimSun, serif";
    results.push("正文字体：宋体");
  } else if (raw.includes("黑体")) {
    document.getElementById("fontFamily").value = "'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";
    results.push("标题/正文倾向：黑体或无衬线");
  }

  if (raw.includes("小四")) {
    document.getElementById("fontSize").value = "15px";
    results.push("正文字号：小四");
  } else if (raw.includes("四号")) {
    document.getElementById("fontSize").value = "16px";
    results.push("正文字号：四号");
  } else if (raw.includes("五号")) {
    document.getElementById("fontSize").value = "14px";
    results.push("正文字号：五号");
  }

  if (raw.includes("2 倍") || raw.includes("2倍")) {
    document.getElementById("lineHeight").value = "2";
    results.push("行距：2 倍");
  } else if (raw.includes("1.5")) {
    document.getElementById("lineHeight").value = "1.75";
    results.push("行距：1.5 倍");
  }

  if (raw.includes("左 3") || raw.includes("左3") || raw.includes("装订")) {
    document.getElementById("pageMargin").value = "30mm 25mm 25mm 30mm";
    results.push("页边距：装订版");
  } else if (raw.includes("2.5cm") || raw.includes("2.5 cm")) {
    document.getElementById("pageMargin").value = "25mm";
    results.push("页边距：四边 2.5cm");
  }

  if (raw.includes("GB/T 7714") || raw.includes("7714")) {
    results.push("参考文献：GB/T 7714");
  }

  document.getElementById("parseResult").innerHTML = results.length
    ? results.map((item) => `<span class="parse-pill">${escapeHtml(item)}</span>`).join("")
    : `<span class="parse-pill">未识别到明确规则，可手动调整上方模板项</span>`;
}

function newProject() {
  if (!window.confirm("新建项目会替换当前本地草稿。确定继续吗？")) return;
  state = createDefaultState();
  editor.innerHTML = state.content;
  populateDrawer();
  applyTemplateVars();
  persistState();
  renderAll();
}

function exportProject() {
  persistState();
  downloadBlob(
    `${safeFileName(state.metadata.title || "论文项目")}.json`,
    new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
  );
}

function importProject() {
  const file = projectFileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(String(reader.result));
      state = mergeState(createDefaultState(), incoming);
      editor.innerHTML = state.content;
      populateDrawer();
      applyTemplateVars();
      persistState();
      renderAll();
      saveState.textContent = "项目已导入";
    } catch (error) {
      window.alert("导入失败：请选择由本工具导出的 JSON 项目文件。");
    } finally {
      projectFileInput.value = "";
    }
  };
  reader.readAsText(file);
}

function exportWord() {
  const chunks = chunkEditorBlocks();
  const pageMap = buildPageMap(chunks);
  const headings = collectHeadings(pageMap);
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(state.metadata.title)}</title>
        <style>
          @page { size: A4; margin: 2.6cm 2.4cm 2.4cm 2.8cm; }
          body { font-family: SimSun, serif; font-size: 12pt; line-height: 1.7; color: #111; }
          h1 { text-align: center; font-size: 18pt; margin: 22pt 0 12pt; }
          h2 { font-size: 15pt; margin: 16pt 0 8pt; }
          h3 { font-size: 13pt; margin: 12pt 0 6pt; }
          p { text-indent: 2em; margin: 0 0 8pt; }
          table { width: 100%; border-collapse: collapse; margin: 10pt 0; }
          th, td { border: 1px solid #777; padding: 6pt; }
          th { background: #eef2f7; }
          .page-break { page-break-after: always; }
          .center { text-align: center; text-indent: 0; }
          .cover-title { margin-top: 160pt; font-size: 24pt; font-weight: bold; }
          .cover-line { width: 70%; margin: 12pt auto; border-bottom: 1px solid #555; text-align: center; text-indent: 0; }
          .toc-row { display: block; margin: 4pt 0; text-indent: 0; }
          img { max-width: 100%; }
          figcaption, .figure-caption { text-align: center; text-indent: 0; font-size: 10.5pt; }
        </style>
      </head>
      <body>
        ${wordCoverHtml()}
        <div class="page-break"></div>
        ${wordAbstractHtml()}
        <div class="page-break"></div>
        <h1>目录</h1>
        ${headings.map((heading) => `<p class="toc-row">${escapeHtml(displayHeadingTitle(heading))} ...... ${heading.page}</p>`).join("")}
        <div class="page-break"></div>
        ${editor.innerHTML}
      </body>
    </html>
  `;
  downloadBlob(`${safeFileName(state.metadata.title || "论文")}_${safeFileName(state.metadata.author || "作者")}.doc`, new Blob(["\ufeff", html], { type: "application/msword" }));
}

function wordCoverHtml() {
  return `
    <p class="center">学校代码：${escapeHtml(state.metadata.schoolCode || "")}　　学号：${escapeHtml(state.metadata.studentId || "")}</p>
    <p class="center cover-title">${escapeHtml(state.metadata.school || "")}</p>
    <h1>${escapeHtml(state.metadata.paperType || "论文")}</h1>
    <p class="cover-line">论文题目：${escapeHtml(state.metadata.title || "")}</p>
    <p class="cover-line">专业：${escapeHtml(state.metadata.major || "")}</p>
    <p class="cover-line">姓名：${escapeHtml(state.metadata.author || "")}</p>
    <p class="cover-line">指导教师：${escapeHtml(state.metadata.supervisor || "")}</p>
    <p class="center">提交日期：${formatDate(state.metadata.date)}</p>
  `;
}

function wordAbstractHtml() {
  return `
    <h1>中文摘要</h1>
    <p>${escapeHtml(state.metadata.abstractCn || "")}</p>
    <p><strong>关键词：</strong>${escapeHtml(state.metadata.keywords || "")}</p>
    <h1>Abstract</h1>
    <p>${escapeHtml(state.metadata.abstractEn || "")}</p>
    <p><strong>Keywords:</strong> ${escapeHtml(toEnglishKeywords(state.metadata.keywords))}</p>
  `;
}

function downloadBlob(filename, blob) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function displayHeadingTitle(heading) {
  return heading.title;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function toEnglishKeywords(value) {
  if (!value) return "";
  return value
    .replace(/[；;，、]/g, "; ")
    .replace(/论文排版/g, "thesis formatting")
    .replace(/富文本编辑器/g, "rich-text editor")
    .replace(/模板规则/g, "template rules")
    .replace(/导出/g, "export");
}

function fontSizeLabel() {
  return { "14px": "五号", "15px": "小四", "16px": "四号" }[state.template.fontSize] || "正文";
}

function lineHeightLabel() {
  return { "1.55": "固定紧凑", "1.75": "1.5 倍行距", "2": "2 倍行距" }[state.template.lineHeight] || "默认行距";
}

function safeFileName(value) {
  return String(value || "未命名").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

init();
