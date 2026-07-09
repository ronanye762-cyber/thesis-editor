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
const projectDialog = document.getElementById("projectDialog");
const authDialog = document.getElementById("authDialog");

const stateKey = "thesis-editor-structured-state-v2";
const legacyStateKey = "thesis-editor-mvp-state-v1";
const legacyContentKey = "thesis-editor-prototype-content";
const tokenKey = "thesis-editor-session-token";

let state = createDefaultState();
let zoom = 0.52;
let activeHeadingId = state.sections[0]?.id || "";
let saveTimer = 0;
let renderTimer = 0;
let cloudSaveTimer = 0;
let latestIssues = [];
let currentUser = null;
let authMode = "login";
let pendingFigureSectionId = "";
let cloudProjects = [];
let cloudAvailable = true;
let cloudSaveInFlight = false;
let cloudSavePending = false;

function createDefaultState() {
  const project = {
    id: null,
    revision: 0,
    clientUpdatedAt: new Date().toISOString(),
    metadata: {
      school: "",
      schoolCode: "",
      studentId: "",
      paperType: "本科毕业论文",
      title: "未命名论文",
      major: "",
      author: "",
      supervisor: "",
      date: new Date().toISOString().slice(0, 10),
      keywords: "",
      abstractCn: "",
      abstractEn: "",
    },
    template: {
      name: "通用本科论文模板",
      fontFamily: "'Songti SC', SimSun, serif",
      fontSize: "15px",
      lineHeight: "1.75",
      pageMargin: "26mm 24mm 24mm 28mm",
      headingMode: "chapter",
      requirementText:
        "正文使用小四，1.5 倍行距；一级标题黑体三号居中；页边距上 2.5cm，下 2.5cm，左 3cm，右 2.5cm；参考文献采用 GB/T 7714。",
    },
    sections: [
      {
        id: "sec-intro",
        level: 1,
        title: "绪论",
        body: "",
      },
      {
        id: "sec-background",
        level: 2,
        title: "研究背景",
        body: "",
      },
      {
        id: "sec-meaning",
        level: 2,
        title: "研究意义",
        body: "",
      },
      {
        id: "sec-product",
        level: 1,
        title: "研究内容",
        body: "",
      },
      {
        id: "sec-method",
        level: 2,
        title: "研究方法",
        body: "",
      },
      {
        id: "sec-references",
        level: 1,
        kind: "references",
        title: "参考文献",
        body: "",
      },
    ],
    content: "",
  };
  project.content = sectionsToHtml(project.sections, project.template.headingMode);
  return project;
}

async function init() {
  loadState();
  activeHeadingId = state.sections[0]?.id || "";
  populateDrawer();
  applyTemplateVars();
  renderStructuredEditor();
  bindEvents();
  renderAll();
  setZoom(zoom);
  updateAccountUi();
  await restoreSession();
}

function loadState() {
  const saved = localStorage.getItem(stateKey) || localStorage.getItem(legacyStateKey);
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
    state = mergeState(createDefaultState(), { content: legacyContent });
  }
}

function mergeState(base, incoming) {
  const sections = normalizeSections(incoming.sections) || sectionsFromHtml(incoming.content) || base.sections;
  const merged = {
    id: incoming.id || null,
    revision: Number(incoming.revision || 0),
    clientUpdatedAt: incoming.clientUpdatedAt || incoming.updatedAt || new Date().toISOString(),
    metadata: { ...base.metadata, ...(incoming.metadata || {}) },
    template: { ...base.template, ...(incoming.template || {}) },
    sections,
    content: "",
  };
  merged.content = sectionsToHtml(merged.sections, merged.template.headingMode);
  return merged;
}

function bindEvents() {
  editor.addEventListener("input", handleStructuredInput);
  editor.addEventListener("change", handleStructuredInput);
  editor.addEventListener("click", handleEditorAction);
  editor.addEventListener("focusin", (event) => {
    const metaCard = event.target.closest("[data-meta-card]");
    if (metaCard) {
      setActiveSection(metaCard.dataset.metaCard);
      return;
    }
    const card = event.target.closest("[data-section-id]");
    if (card) setActiveSection(card.dataset.sectionId);
  });
  editorScroll.addEventListener("scroll", updateActiveHeading);

  document.getElementById("addChapter").addEventListener("click", () => addSection(1));
  document.getElementById("addMajorSection").addEventListener("click", () => addSection(1));
  document.getElementById("addMinorSection").addEventListener("click", () => addSection(2));
  document.getElementById("addReferenceSection").addEventListener("click", ensureReferenceSection);
  document.getElementById("focusMetadata").addEventListener("click", () => jumpToSection("cover"));

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
  document.getElementById("projectCenter").addEventListener("click", openProjectDialog);
  document.getElementById("accountButton").addEventListener("click", openAuthDialog);
  document.getElementById("projectLogin").addEventListener("click", () => {
    projectDialog.close();
    openAuthDialog();
  });
  document.getElementById("createCloudProject").addEventListener("click", createProjectFromCurrentState);
  document.getElementById("loginMode").addEventListener("click", () => setAuthMode("login"));
  document.getElementById("registerMode").addEventListener("click", () => setAuthMode("register"));
  document.getElementById("authForm").addEventListener("submit", submitAuth);
  document.getElementById("logoutButton").addEventListener("click", logoutUser);
  document.getElementById("openProjectsFromAccount").addEventListener("click", () => {
    authDialog.close();
    openProjectDialog();
  });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => document.getElementById(button.dataset.closeDialog)?.close());
  });
  projectDialog.addEventListener("click", handleProjectDialogAction);
  document.getElementById("openIssues").addEventListener("click", () => {
    const issues = runChecks(collectHeadings());
    issueRailFlash(issues.length);
  });

  document.getElementById("openTemplate").addEventListener("click", openDrawer);
  document.getElementById("openTemplateTop").addEventListener("click", openDrawer);
  document.getElementById("closeTemplate").addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);
  document.getElementById("applyTemplate").addEventListener("click", applyDrawerState);
  document.getElementById("resetTemplate").addEventListener("click", resetTemplate);
  document.getElementById("parseRequirement").addEventListener("click", parseRequirement);
  document.getElementById("templatePreset").addEventListener("change", applyTemplatePreset);
  ["fontFamily", "fontSize", "lineHeight", "pageMargin", "headingMode"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      document.getElementById("templatePreset").value = "custom";
    });
  });
  imageFileInput.addEventListener("change", importFigureImage);
  window.addEventListener("beforeunload", persistState);
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      persistState();
      scheduleCloudSave(true);
      showToast("项目已保存");
    }
  });

  getMetadataFields().forEach(([key, element]) => {
    element.addEventListener("input", () => {
      state.metadata[key] = element.value;
      scheduleSaveAndRender();
    });
  });
}

function renderStructuredEditor() {
  const numbered = numberSections(state.sections, state.template.headingMode);
  editor.innerHTML = `${metadataCardHtml()}${abstractCardHtml()}${numbered.map((item, index) => sectionCardHtml(item.section, index, item.displayTitle)).join("")}`;
  updateCardActiveState();
}

function metadataCardHtml() {
  return `
    <section class="section-card meta-card" id="form-cover" data-meta-card="cover">
      <div class="section-card-head">
        <span class="section-number">封</span>
        <div class="fixed-card-title">
          <strong>封面信息</strong>
          <span>只填基础信息，右侧自动生成封面格式</span>
        </div>
      </div>
      <div class="field-stack meta-grid">
        ${metaInput("论文题目", "title", state.metadata.title)}
        ${metaInput("学校名称", "school", state.metadata.school)}
        ${metaInput("学校代码", "schoolCode", state.metadata.schoolCode)}
        ${metaInput("学号", "studentId", state.metadata.studentId)}
        ${metaSelect("论文类型", "paperType", state.metadata.paperType, ["本科毕业论文", "专业学位硕士论文", "开题报告", "课程论文"])}
        ${metaInput("专业", "major", state.metadata.major)}
        ${metaInput("姓名", "author", state.metadata.author)}
        ${metaInput("指导教师", "supervisor", state.metadata.supervisor)}
        ${metaInput("提交日期", "date", state.metadata.date, "date")}
      </div>
    </section>
  `;
}

function abstractCardHtml() {
  return `
    <section class="section-card meta-card" id="form-abstract" data-meta-card="abstract">
      <div class="section-card-head">
        <span class="section-number">摘</span>
        <div class="fixed-card-title">
          <strong>摘要与关键词</strong>
          <span>填写纯文本，预览区自动排成中英文摘要页</span>
        </div>
      </div>
      <div class="field-stack">
        <label class="form-field">
          <span>中文摘要</span>
          <textarea data-meta="abstractCn" rows="7" spellcheck="false">${escapeHtml(state.metadata.abstractCn || "")}</textarea>
        </label>
        <label class="form-field">
          <span>英文摘要</span>
          <textarea data-meta="abstractEn" rows="5" spellcheck="false">${escapeHtml(state.metadata.abstractEn || "")}</textarea>
        </label>
        <label class="form-field">
          <span>关键词</span>
          <input data-meta="keywords" type="text" value="${escapeHtml(state.metadata.keywords || "")}" placeholder="用分号或逗号分隔" />
        </label>
      </div>
    </section>
  `;
}

function metaInput(label, key, value, type = "text") {
  return `
    <label class="form-field">
      <span>${label}</span>
      <input data-meta="${key}" type="${type}" value="${escapeHtml(value || "")}" />
    </label>
  `;
}

function metaSelect(label, key, value, options) {
  return `
    <label class="form-field">
      <span>${label}</span>
      <select class="form-select" data-meta="${key}">
        ${options.map((option) => `<option value="${escapeHtml(option)}"${option === value ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    </label>
  `;
}

function sectionCardHtml(section, index, displayTitle) {
  const isReference = section.kind === "references";
  const hasTable = Boolean(section.table);
  const hasFigure = Boolean(section.figure);
  return `
    <section class="section-card" id="form-${section.id}" data-section-id="${section.id}">
      <div class="section-card-head">
        <span class="section-number">${index + 1}</span>
        <div class="auto-title-preview">${escapeHtml(displayTitle)}</div>
        <select class="level-select" data-field="level" aria-label="章节层级">
          <option value="1"${section.level === 1 ? " selected" : ""}>一级章节</option>
          <option value="2"${section.level === 2 ? " selected" : ""}>二级小节</option>
          <option value="3"${section.level === 3 ? " selected" : ""}>三级小节</option>
        </select>
        <div class="section-actions">
          <button class="icon-btn ghost" data-action="move-up" type="button" aria-label="上移" title="上移">↑</button>
          <button class="icon-btn ghost" data-action="move-down" type="button" aria-label="下移" title="下移">↓</button>
          <button class="icon-btn ghost danger" data-action="delete-section" type="button" aria-label="删除" title="删除">×</button>
        </div>
      </div>
      <div class="field-stack">
        <label class="form-field">
          <span>${isReference ? "章节名称" : "标题（不用输入编号）"}</span>
          <input data-field="title" type="text" value="${escapeHtml(cleanSectionTitle(section.title, section.level, section.kind))}" placeholder="例如：研究背景" />
        </label>
        <label class="form-field">
          <span>${isReference ? "参考文献条目" : "正文内容"}</span>
          <textarea data-field="body" rows="${isReference ? 7 : 8}" spellcheck="false">${escapeHtml(section.body || "")}</textarea>
        </label>
        ${hasTable ? tableFieldsHtml(section.table) : ""}
        ${hasFigure ? figureFieldsHtml(section.figure) : ""}
      </div>
      <div class="section-card-foot">
        <button class="command-btn compact" data-action="add-table" type="button">
          <svg><use href="#icon-table"></use></svg>
          ${hasTable ? "保留表格字段" : "添加表格字段"}
        </button>
        <button class="command-btn compact" data-action="add-figure" type="button">
          <svg><use href="#icon-image"></use></svg>
          ${hasFigure ? "保留图注字段" : "添加图注字段"}
        </button>
      </div>
    </section>
  `;
}

function tableFieldsHtml(table) {
  return `
    <div class="optional-field" data-optional="table">
      <div class="optional-head">
        <strong>表格字段</strong>
        <button class="command-btn compact" data-action="remove-table" type="button">移除</button>
      </div>
      <label class="form-field">
        <span>表格标题</span>
        <input data-field="tableCaption" type="text" value="${escapeHtml(table.caption || "")}" />
      </label>
      <label class="form-field">
        <span>列名（用竖线分隔）</span>
        <input data-field="tableHeaders" type="text" value="${escapeHtml((table.headers || []).join("｜"))}" placeholder="项目｜说明｜状态" />
      </label>
      <label class="form-field">
        <span>表格内容（每行一条，列之间用竖线分隔）</span>
        <textarea data-field="tableRows" rows="4" spellcheck="false">${escapeHtml(table.rows || "")}</textarea>
      </label>
    </div>
  `;
}

function figureFieldsHtml(figure) {
  return `
    <div class="optional-field" data-optional="figure">
      <div class="optional-head">
        <strong>图示字段</strong>
        <button class="command-btn compact" data-action="remove-figure" type="button">移除</button>
      </div>
      <label class="form-field">
        <span>图题</span>
        <input data-field="figureCaption" type="text" value="${escapeHtml(figure.caption || "")}" />
      </label>
      <label class="form-field">
        <span>图片说明</span>
        <input data-field="figureAlt" type="text" value="${escapeHtml(figure.alt || "")}" placeholder="用于无法显示图片时说明内容" />
      </label>
      <div class="figure-upload-preview">
        ${figure.dataUrl ? `<img src="${escapeHtml(figure.dataUrl)}" alt="${escapeHtml(figure.alt || figure.caption || "论文图片")}" />` : ""}
        <button class="command-btn compact" data-action="upload-figure" type="button">
          <svg><use href="#icon-image"></use></svg>
          ${figure.dataUrl ? "更换图片" : "选择图片"}
        </button>
      </div>
    </div>
  `;
}

function handleStructuredInput(event) {
  const metaKey = event.target.dataset.meta;
  if (metaKey) {
    state.metadata[metaKey] = event.target.value;
    setActiveSection(event.target.closest("[data-meta-card]")?.dataset.metaCard || "cover", false);
    mirrorDrawerField(metaKey, event.target.value);
    scheduleSaveAndRender();
    return;
  }

  const field = event.target.dataset.field;
  if (!field) return;
  const card = event.target.closest("[data-section-id]");
  const section = findSection(card?.dataset.sectionId);
  if (!section) return;

  if (field === "level") section.level = Number(event.target.value);
  if (field === "title") section.title = cleanSectionTitle(event.target.value, section.level, section.kind);
  if (field === "body") section.body = event.target.value;
  if (field === "tableCaption") section.table.caption = event.target.value;
  if (field === "tableHeaders") section.table.headers = event.target.value.split(/[｜|\t]/).map((item) => item.trim()).filter(Boolean);
  if (field === "tableRows") section.table.rows = event.target.value;
  if (field === "figureCaption") section.figure.caption = event.target.value;
  if (field === "figureAlt") section.figure.alt = event.target.value;

  setActiveSection(section.id, false);
  scheduleSaveAndRender();
}

function mirrorDrawerField(key, value) {
  const field = getMetadataFields().find(([fieldKey]) => fieldKey === key)?.[1];
  if (field) field.value = value;
}

function handleEditorAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const section = findSection(button.closest("[data-section-id]")?.dataset.sectionId);
  if (!section) return;

  const action = button.dataset.action;
  if (action === "delete-section") deleteSection(section.id);
  if (action === "move-up") moveSection(section.id, -1);
  if (action === "move-down") moveSection(section.id, 1);
  if (action === "add-table") addTableToSection(section.id);
  if (action === "remove-table") removeTableFromSection(section.id);
  if (action === "add-figure") addFigureToSection(section.id);
  if (action === "remove-figure") removeFigureFromSection(section.id);
  if (action === "upload-figure") {
    pendingFigureSectionId = section.id;
    imageFileInput.click();
  }
}

function findSection(id) {
  return state.sections.find((section) => section.id === id);
}

function addSection(level) {
  const index = Math.max(0, state.sections.findIndex((section) => section.id === activeHeadingId));
  const next = {
    id: createSectionId(),
    level,
    title: level === 1 ? "新章节标题" : level === 2 ? "新小节标题" : "新三级标题",
    body: "",
  };
  state.sections.splice(index + 1, 0, next);
  activeHeadingId = next.id;
  syncContent();
  renderStructuredEditor();
  scheduleSaveAndRender();
  requestAnimationFrame(() => document.getElementById(`form-${next.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
}

function ensureReferenceSection() {
  const existing = state.sections.find((section) => section.kind === "references" || section.title.includes("参考文献"));
  if (existing) {
    jumpToSection(existing.id);
    return;
  }
  const reference = {
    id: createSectionId(),
    level: 1,
    kind: "references",
    title: "参考文献",
    body: "作者. 文献题名[J]. 期刊名称, 2026, 1(1): 1-8.",
  };
  state.sections.push(reference);
  activeHeadingId = reference.id;
  syncContent();
  renderStructuredEditor();
  scheduleSaveAndRender();
}

function deleteSection(id) {
  if (state.sections.length <= 1) return;
  const index = state.sections.findIndex((section) => section.id === id);
  if (index < 0) return;
  state.sections.splice(index, 1);
  activeHeadingId = state.sections[Math.max(0, index - 1)]?.id || state.sections[0]?.id || "";
  syncContent();
  renderStructuredEditor();
  scheduleSaveAndRender();
}

function moveSection(id, direction) {
  const index = state.sections.findIndex((section) => section.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.sections.length) return;
  const [section] = state.sections.splice(index, 1);
  state.sections.splice(target, 0, section);
  activeHeadingId = id;
  syncContent();
  renderStructuredEditor();
  scheduleSaveAndRender();
}

function addTableToSection(id) {
  const section = findSection(id);
  if (!section) return;
  section.table = section.table || {
    caption: "表 X-X 表题说明",
    headers: ["项目", "说明", "状态"],
    rows: "标题格式｜由模板自动生成｜已应用\n正文格式｜由模板自动生成｜已应用",
  };
  activeHeadingId = id;
  syncContent();
  renderStructuredEditor();
  scheduleSaveAndRender();
}

function removeTableFromSection(id) {
  const section = findSection(id);
  if (!section) return;
  delete section.table;
  syncContent();
  renderStructuredEditor();
  scheduleSaveAndRender();
}

function addFigureToSection(id) {
  const section = findSection(id);
  if (!section) return;
  section.figure = section.figure || { caption: "图 X-X 图题说明" };
  activeHeadingId = id;
  syncContent();
  renderStructuredEditor();
  scheduleSaveAndRender();
}

function removeFigureFromSection(id) {
  const section = findSection(id);
  if (!section) return;
  delete section.figure;
  syncContent();
  renderStructuredEditor();
  scheduleSaveAndRender();
}

function importFigureImage() {
  const file = imageFileInput.files?.[0];
  const section = findSection(pendingFigureSectionId);
  imageFileInput.value = "";
  pendingFigureSectionId = "";
  if (!file || !section?.figure) return;
  if (!file.type.startsWith("image/")) {
    showToast("请选择图片文件", "error");
    return;
  }
  if (file.size > 3 * 1024 * 1024) {
    showToast("图片不能超过 3 MB", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    section.figure.dataUrl = String(reader.result || "");
    section.figure.alt ||= file.name.replace(/\.[^.]+$/, "");
    activeHeadingId = section.id;
    renderStructuredEditor();
    scheduleSaveAndRender();
    showToast("图片已添加");
  };
  reader.readAsDataURL(file);
}

function setActiveSection(id, updateOutline = true) {
  if (!id || activeHeadingId === id) return;
  activeHeadingId = id;
  updateCardActiveState();
  updateCursorState();
  if (updateOutline) renderOutline(collectHeadings());
}

function updateCardActiveState() {
  editor.querySelectorAll(".meta-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.metaCard === activeHeadingId);
  });
  editor.querySelectorAll(".section-card").forEach((card) => {
    if (card.dataset.sectionId) {
      card.classList.toggle("active", card.dataset.sectionId === activeHeadingId);
    }
  });
}

function scheduleSaveAndRender() {
  syncContent();
  state.clientUpdatedAt = new Date().toISOString();
  clearTimeout(saveTimer);
  saveState.textContent = "保存中";
  saveTimer = window.setTimeout(() => {
    persistState();
    const now = new Date();
    const target = currentUser && state.id ? "云端同步中" : "已保存到本机";
    saveState.textContent = `${target} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }, 260);
  scheduleCloudSave();

  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderAll, 180);
}

function persistState() {
  try {
    localStorage.setItem(stateKey, JSON.stringify(state));
  } catch (error) {
    saveState.textContent = "本地空间不足";
    showToast("本地存储空间不足，请压缩图片或导出项目备份", "error");
  }
}

function syncContent() {
  state.content = sectionsToHtml(state.sections, state.template.headingMode);
}

function renderAll() {
  syncContent();
  const chunks = chunkContentBlocks();
  const pageMap = buildPageMap(chunks);
  const headings = collectHeadings(pageMap);
  renderOutline(headings);
  renderPreview(headings, chunks);
  runChecks(headings);
  updateWordCount();
  updateProgress();
  updateCursorState();
  updateProjectLabels();
}

function collectHeadings(pageMap = {}) {
  return numberSections(state.sections, state.template.headingMode).map((item, index) => ({
    id: item.section.id,
    level: Number(item.section.level || 1),
    title: item.displayTitle || `未命名标题 ${index + 1}`,
    page: pageMap[item.section.id] || Math.max(4, Math.ceil((index + 1) / 3) + 3),
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
  if (["cover", "abstract"].includes(id)) {
    const card = document.getElementById(`form-${id}`);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
    card?.querySelector("input, textarea, select")?.focus({ preventScroll: true });
    activeHeadingId = id;
    renderOutline(collectHeadings());
    updateCardActiveState();
    return;
  }

  if (id === "toc") {
    previewPages.querySelector(`[data-preview="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    activeHeadingId = id;
    renderOutline(collectHeadings());
    updateCardActiveState();
    return;
  }

  const card = document.getElementById(`form-${id}`);
  if (card) {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.querySelector("textarea, input")?.focus({ preventScroll: true });
    activeHeadingId = id;
    updateCardActiveState();
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
        <span>${escapeHtml(heading.title)}</span>
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

function numberSections(sections, headingMode = "chapter") {
  let chapter = 0;
  let second = 0;
  let third = 0;

  return sections.map((section) => {
    const level = Math.min(3, Math.max(1, Number(section.level || 1)));
    const rawTitle = cleanSectionTitle(section.title, level, section.kind) || "未命名标题";
    const isReference = section.kind === "references" || rawTitle.includes("参考文献");
    let prefix = "";

    if (isReference) {
      return { section: { ...section, title: rawTitle }, displayTitle: "参考文献" };
    }

    if (level === 1) {
      chapter += 1;
      second = 0;
      third = 0;
      prefix = headingMode === "decimal" ? `${chapter}` : `第${toChineseNumber(chapter)}章`;
    } else if (level === 2) {
      if (chapter === 0) chapter = 1;
      second += 1;
      third = 0;
      prefix = `${chapter}.${second}`;
    } else {
      if (chapter === 0) chapter = 1;
      if (second === 0) second = 1;
      third += 1;
      prefix = `${chapter}.${second}.${third}`;
    }

    return {
      section: { ...section, title: rawTitle, level },
      displayTitle: `${prefix} ${rawTitle}`,
    };
  });
}

function sectionsToHtml(sections, headingMode = "chapter") {
  return numberSections(sections, headingMode).map((item) => sectionToHtml(item.section, item.displayTitle)).join("");
}

function sectionToHtml(section, displayTitle) {
  const level = Math.min(3, Math.max(1, Number(section.level || 1)));
  const title = escapeHtml(displayTitle || section.title || "未命名标题");
  const parts = [`<h${level} id="${section.id}">${title}</h${level}>`];

  if (section.kind === "references" || title.includes("参考文献")) {
    const rows = splitLines(section.body).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    parts.push(rows ? `<ol>${rows}</ol>` : `<p>请填写参考文献。</p>`);
    return parts.join("");
  }

  parts.push(plainTextToParagraphs(section.body));
  if (section.table) parts.push(tableToHtml(section.table));
  if (section.figure) parts.push(figureToHtml(section.figure));
  return parts.join("");
}

function plainTextToParagraphs(value) {
  const paragraphs = splitLines(value);
  return paragraphs.length ? paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join("") : `<p class="empty-hint">请填写正文内容。</p>`;
}

function tableToHtml(table) {
  const headers = table.headers?.length ? table.headers : ["项目", "说明", "状态"];
  const rows = splitLines(table.rows).map((line) => line.split(/[｜|\t]/).map((cell) => cell.trim()));
  return `
    <table>
      <thead>
        <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => `<tr>${headers.map((_, index) => `<td>${escapeHtml(row[index] || "")}</td>`).join("")}</tr>`)
          .join("")}
      </tbody>
    </table>
    <p class="figure-caption">${escapeHtml(table.caption || "表 X-X 表题说明")}</p>
  `;
}

function figureToHtml(figure) {
  if (figure.dataUrl) {
    return `
      <figure>
        <img src="${escapeHtml(figure.dataUrl)}" alt="${escapeHtml(figure.alt || figure.caption || "论文图片")}" />
        <figcaption>${escapeHtml(figure.caption || "图 X-X 图题说明")}</figcaption>
      </figure>
    `;
  }
  return `
    <div class="image-placeholder">${escapeHtml(figure.caption || "图示占位")}</div>
    <p class="figure-caption">${escapeHtml(figure.caption || "图 X-X 图题说明")}</p>
  `;
}

function chunkContentBlocks() {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = state.content;
  const children = Array.from(wrapper.children);
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
              : node.classList.contains("image-placeholder") || tag === "figure"
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

  return chunks.length ? chunks : ["<p>请填写论文内容。</p>"];
}

function buildPageMap(chunks) {
  const map = {};
  chunks.forEach((chunk, index) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = chunk;
    wrapper.querySelectorAll("h1, h2, h3").forEach((heading) => {
      if (heading.id) map[heading.id] = index + 4;
    });
  });
  return map;
}

function runChecks(headings = collectHeadings()) {
  const text = `${Object.values(state.metadata).join("")}${state.sections.map((section) => `${section.title}${section.body}`).join("")}`.replace(/\s+/g, "");
  const issues = [];

  requiredMeta("school", "缺少学校名称", "metadata", issues);
  requiredMeta("title", "缺少论文题目", "metadata", issues);
  requiredMeta("author", "缺少作者姓名", "metadata", issues);
  requiredMeta("supervisor", "缺少指导教师", "metadata", issues);
  requiredMeta("abstractCn", "缺少中文摘要", "abstract", issues);
  requiredMeta("keywords", "缺少关键词", "abstract", issues);

  if (!headings.some((heading) => heading.level === 1)) {
    issues.push({ type: "error", label: "错误", text: "正文缺少一级标题", target: state.sections[0]?.id || "editor" });
  }

  for (let i = 1; i < headings.length; i += 1) {
    if (headings[i].level - headings[i - 1].level > 1) {
      issues.push({ type: "error", label: "错误", text: `标题层级跳级：${headings[i].title}`, target: headings[i].id });
    }
  }

  state.sections.forEach((section, index) => {
    if (!section.title.trim()) {
      issues.push({ type: "error", label: "错误", text: `第 ${index + 1} 个章节缺少标题`, target: section.id });
    }
    if (!section.body.trim() && section.kind !== "references") {
      issues.push({ type: "suggest", label: "建议", text: `${section.title || "未命名章节"} 缺少正文`, target: section.id });
    }
    if (section.table && !section.table.caption.trim()) {
      issues.push({ type: "suggest", label: "建议", text: `${section.title || "章节"} 的表格缺少表题`, target: section.id });
    }
    if (section.figure && !section.figure.caption.trim()) {
      issues.push({ type: "warning", label: "警告", text: `${section.title || "章节"} 的图片缺少图题`, target: section.id });
    }
  });

  if (!state.sections.some((section) => section.kind === "references" || section.title.includes("参考文献"))) {
    issues.push({ type: "error", label: "错误", text: "缺少参考文献章节", target: state.sections.at(-1)?.id || "editor" });
  }

  if (text.length < 500) {
    issues.push({ type: "suggest", label: "建议", text: "正文内容较少，可继续补充章节", target: state.sections[0]?.id || "editor" });
  }

  latestIssues = issues;
  renderIssues(issues);
  document.getElementById("sidebarIssueText").textContent = issues.length ? `${issues.length} 项需要处理` : "结构检查已通过";
  return issues;
}

function requiredMeta(key, message, target, issues) {
  if (!String(state.metadata[key] || "").trim()) {
    issues.push({ type: "error", label: "错误", text: message, target });
  }
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
    jumpToSection("cover");
    return;
  }
  if (issue.target === "abstract") {
    jumpToSection("abstract");
    return;
  }
  if (issue.target === "editor") {
    editor.querySelector("textarea, input")?.focus();
    return;
  }
  jumpToSection(issue.target);
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
  const cards = Array.from(editor.querySelectorAll(".meta-card, .section-card"));
  let current = cards[0]?.dataset.metaCard || cards[0]?.dataset.sectionId || "";
  const scrollTop = editorScroll.scrollTop;

  cards.forEach((card) => {
    const top = card.offsetTop - 120;
    if (top <= scrollTop) current = card.dataset.metaCard || card.dataset.sectionId;
  });

  if (current && current !== activeHeadingId) {
    activeHeadingId = current;
    updateCardActiveState();
    renderOutline(collectHeadings());
    updateCursorState();
  }
}

function updateCursorState() {
  if (activeHeadingId === "cover") {
    cursorStyle.textContent = "当前填空：封面信息";
    return;
  }
  if (activeHeadingId === "abstract") {
    cursorStyle.textContent = "当前填空：摘要与关键词";
    return;
  }
  const section = findSection(activeHeadingId);
  const heading = collectHeadings().find((item) => item.id === activeHeadingId);
  const label = section ? `${heading?.title || section.title || "未命名章节"} · ${levelLabel(section.level)}` : "目录预览";
  cursorStyle.textContent = `当前填空：${label}`;
}

function updateWordCount() {
  const metadataText = `${state.metadata.title}${state.metadata.abstractCn}${state.metadata.abstractEn}${state.metadata.keywords}`;
  const sectionText = state.sections.map((section) => `${section.title}${section.body}${section.table?.rows || ""}${section.figure?.caption || ""}`).join("");
  const count = `${metadataText}${sectionText}`.replace(/\s/g, "").length;
  wordCount.textContent = `${count} 字 · ${state.sections.length} 个章节`;
}

function updateProgress() {
  const required = [
    state.metadata.school,
    state.metadata.title && state.metadata.title !== "未命名论文" ? state.metadata.title : "",
    state.metadata.author,
    state.metadata.supervisor,
    state.metadata.abstractCn,
    state.metadata.keywords,
    state.sections.some((section) => section.level === 1 && section.body.trim()) ? "yes" : "",
    state.sections.some((section) => section.kind === "references" && section.body.trim()) ? "yes" : "",
  ];
  const completed = required.filter((value) => String(value || "").trim()).length;
  const percent = Math.round((completed / required.length) * 100);
  document.getElementById("progressBar").style.width = `${percent}%`;
  document.getElementById("progressLabel").textContent = `${percent}%`;
  document.getElementById("cloudLabel").textContent = currentUser && state.id ? "已连接云端" : "本地草稿";
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
  document.getElementById("templatePreset").value = templatePresetForState();
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
  if (document.getElementById("templatePreset").value === "custom") {
    state.template.name = "自定义论文模板";
  }

  applyTemplateVars();
  updateProjectLabels();
  renderStructuredEditor();
  scheduleSaveAndRender();
  closeDrawer();
}

function applyTemplateVars() {
  document.documentElement.style.setProperty("--editor-font", state.template.fontFamily);
  document.documentElement.style.setProperty("--paper-font-size", state.template.fontSize);
  document.documentElement.style.setProperty("--paper-line-height", state.template.lineHeight);
  document.documentElement.style.setProperty("--paper-margin", state.template.pageMargin);
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
  scheduleSaveAndRender();
}

function templatePresetForState() {
  if (state.template.name.includes("硕士")) return "master";
  if (state.template.name.includes("课程")) return "course";
  if (state.template.name.includes("本科") || state.template.name.includes("通用")) return "undergraduate";
  return "custom";
}

function applyTemplatePreset(event) {
  const preset = event.target.value;
  const presets = {
    undergraduate: {
      name: "通用本科论文模板",
      fontFamily: "'Songti SC', SimSun, serif",
      fontSize: "15px",
      lineHeight: "1.75",
      pageMargin: "26mm 24mm 24mm 28mm",
      headingMode: "chapter",
    },
    master: {
      name: "通用硕士学位论文模板",
      fontFamily: "'Songti SC', SimSun, serif",
      fontSize: "15px",
      lineHeight: "1.75",
      pageMargin: "30mm 25mm 25mm 30mm",
      headingMode: "chapter",
    },
    course: {
      name: "课程论文简洁模板",
      fontFamily: "'Songti SC', SimSun, serif",
      fontSize: "14px",
      lineHeight: "1.55",
      pageMargin: "25mm",
      headingMode: "decimal",
    },
  };
  if (!presets[preset]) return;
  state.template = { ...state.template, ...presets[preset] };
  populateDrawer();
  applyTemplateVars();
  renderStructuredEditor();
  scheduleSaveAndRender();
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

async function newProject() {
  if (!window.confirm("新建项目会替换当前本地草稿。确定继续吗？")) return;
  state = createDefaultState();
  activeHeadingId = state.sections[0]?.id || "";
  populateDrawer();
  applyTemplateVars();
  renderStructuredEditor();
  scheduleSaveAndRender();
  if (currentUser && cloudAvailable) {
    await createProjectFromCurrentState(null, true);
  }
}

async function checkCloudStatus() {
  try {
    const response = await fetch("/health", { headers: { Accept: "application/json" } });
    const result = await response.json();
    cloudAvailable = result.persistent !== false;
  } catch {
    cloudAvailable = false;
  }
  updateAccountUi();
}

async function restoreSession() {
  await checkCloudStatus();
  const token = localStorage.getItem(tokenKey);
  if (!token || !cloudAvailable) return;
  try {
    const result = await apiRequest("/api/me");
    currentUser = result.user;
    updateAccountUi();
    if (state.id) {
      const cloud = await apiRequest(`/api/projects/${encodeURIComponent(state.id)}`);
      const remoteTime = new Date(cloud.project.updatedAt || 0).getTime();
      const localTime = new Date(state.clientUpdatedAt || 0).getTime();
      if (remoteTime > localTime) applyCloudProject(cloud.project);
    }
  } catch (error) {
    localStorage.removeItem(tokenKey);
    currentUser = null;
    updateAccountUi();
  }
}

async function apiRequest(path, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  const token = localStorage.getItem(tokenKey);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && typeof options.body !== "string") {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || payload.error || "请求失败，请稍后重试");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function openAuthDialog() {
  updateAccountUi();
  if (!cloudAvailable && !currentUser) {
    document.getElementById("authError").textContent = "当前部署尚未连接云数据库，仍可使用本机自动保存与项目导出。";
  }
  authDialog.showModal();
}

function setAuthMode(mode) {
  authMode = mode;
  const register = mode === "register";
  document.getElementById("loginMode").classList.toggle("active", !register);
  document.getElementById("registerMode").classList.toggle("active", register);
  document.getElementById("authNameField").hidden = !register;
  document.getElementById("authTitle").textContent = register ? "创建云端账户" : "登录并同步论文";
  document.getElementById("authSubmit").textContent = register ? "注册并登录" : "登录";
  document.getElementById("authPassword").autocomplete = register ? "new-password" : "current-password";
  document.getElementById("authError").textContent = "";
}

async function submitAuth(event) {
  event.preventDefault();
  if (!cloudAvailable) {
    document.getElementById("authError").textContent = "请先在 Vercel 为项目连接 Upstash Redis。";
    return;
  }
  const submit = document.getElementById("authSubmit");
  const errorField = document.getElementById("authError");
  submit.disabled = true;
  submit.textContent = authMode === "register" ? "正在注册..." : "正在登录...";
  errorField.textContent = "";
  try {
    const body = {
      email: document.getElementById("authEmail").value.trim(),
      password: document.getElementById("authPassword").value,
      name: document.getElementById("authName").value.trim(),
    };
    const result = await apiRequest(`/api/auth/${authMode}`, { method: "POST", body });
    localStorage.setItem(tokenKey, result.session.token);
    currentUser = result.user;
    updateAccountUi();
    authDialog.close();
    showToast(authMode === "register" ? "账户创建成功" : "登录成功");
    if (!state.id) await createProjectFromCurrentState(null, true);
  } catch (error) {
    errorField.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = authMode === "register" ? "注册并登录" : "登录";
  }
}

async function logoutUser() {
  try {
    await apiRequest("/api/auth/logout", { method: "POST", body: {} });
  } catch {
    // Local session cleanup is sufficient when the network is unavailable.
  }
  localStorage.removeItem(tokenKey);
  currentUser = null;
  state.id = null;
  state.revision = 0;
  persistState();
  updateAccountUi();
  authDialog.close();
  showToast("已退出登录，当前内容继续保存在本机");
}

function updateAccountUi() {
  const label = document.getElementById("accountLabel");
  const signedIn = Boolean(currentUser);
  label.textContent = signedIn ? currentUser.name || "账户" : cloudAvailable ? "登录" : "本机";
  document.getElementById("signedOutPanel").hidden = signedIn;
  document.getElementById("signedInPanel").hidden = !signedIn;
  document.getElementById("accountActions").hidden = !signedIn;
  if (signedIn) {
    document.getElementById("accountName").textContent = currentUser.name || "用户";
    document.getElementById("accountEmail").textContent = currentUser.email || "";
    document.getElementById("accountAvatar").textContent = (currentUser.name || currentUser.email || "U").slice(0, 1).toUpperCase();
  }
  updateProgress();
}

async function openProjectDialog() {
  projectDialog.showModal();
  if (!currentUser) {
    cloudProjects = [];
    document.getElementById("projectCallout").textContent = cloudAvailable
      ? "登录后可跨设备保存论文。未登录时，当前内容仍会自动保存在这台设备。"
      : "当前部署尚未连接云数据库。你仍可在本机编辑，并使用“导出项目”备份 JSON 文件。";
    document.getElementById("projectLogin").hidden = !cloudAvailable;
    document.getElementById("createCloudProject").innerHTML = `${icon("icon-plus")}新建本地项目`;
    renderProjectList();
    return;
  }
  document.getElementById("projectCallout").textContent = "项目已安全关联到当前账户。打开其他项目之前，当前内容会先自动保存。";
  document.getElementById("projectLogin").hidden = true;
  document.getElementById("createCloudProject").innerHTML = `${icon("icon-plus")}新建项目`;
  await loadCloudProjects();
}

async function loadCloudProjects() {
  const list = document.getElementById("projectList");
  list.innerHTML = `<div class="empty-state">正在读取项目...</div>`;
  try {
    const result = await apiRequest("/api/projects");
    cloudProjects = result.projects || [];
    renderProjectList();
  } catch (error) {
    list.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderProjectList() {
  const list = document.getElementById("projectList");
  if (!currentUser) {
    list.innerHTML = `
      <div class="project-row current">
        <div class="project-row-main">
          <strong>${escapeHtml(state.metadata.title || "未命名论文")}</strong>
          <span>本机草稿 · ${escapeHtml(state.metadata.paperType || "论文")}</span>
        </div>
      </div>
    `;
    return;
  }
  list.innerHTML = cloudProjects.length
    ? cloudProjects
        .map(
          (project) => `
            <div class="project-row ${project.id === state.id ? "current" : ""}">
              <div class="project-row-main">
                <strong>${escapeHtml(project.title || "未命名论文")}</strong>
                <span>${escapeHtml(project.paperType || "论文")} · ${project.wordCount || 0} 字 · ${formatTime(project.updatedAt)}</span>
              </div>
              <div class="project-row-actions">
                <button class="command-btn compact" data-project-action="open" data-project-id="${escapeHtml(project.id)}" type="button">
                  ${project.id === state.id ? "重新加载" : "打开"}
                </button>
                <button class="icon-btn ghost danger" data-project-action="delete" data-project-id="${escapeHtml(project.id)}" type="button" aria-label="删除项目" title="删除项目">
                  <svg><use href="#icon-trash"></use></svg>
                </button>
              </div>
            </div>
          `,
        )
        .join("")
    : `<div class="empty-state">还没有云端项目，可以把当前论文保存为第一个项目。</div>`;
}

async function handleProjectDialogAction(event) {
  const button = event.target.closest("[data-project-action]");
  if (!button) return;
  const id = button.dataset.projectId;
  if (button.dataset.projectAction === "open") await openCloudProject(id);
  if (button.dataset.projectAction === "delete") await deleteCloudProject(id);
}

async function createProjectFromCurrentState(event, silent = false) {
  if (!currentUser) {
    if (event) {
      projectDialog.close();
      if (cloudAvailable) openAuthDialog();
      else newProject();
    }
    return;
  }
  try {
    syncContent();
    const result = await apiRequest("/api/projects", {
      method: "POST",
      body: projectPayload(false),
    });
    state.id = result.project.id;
    state.revision = result.project.revision || 1;
    state.clientUpdatedAt = result.project.updatedAt;
    persistState();
    saveState.textContent = "已保存到云端";
    if (!silent) {
      await loadCloudProjects();
      showToast("新项目已创建");
    }
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function openCloudProject(id) {
  try {
    if (state.id) await saveCloudProject();
    const result = await apiRequest(`/api/projects/${encodeURIComponent(id)}`);
    applyCloudProject(result.project);
    projectDialog.close();
    showToast("项目已打开");
  } catch (error) {
    showToast(error.message, "error");
  }
}

function applyCloudProject(project) {
  state = mergeState(createDefaultState(), project);
  state.id = project.id;
  state.revision = Number(project.revision || 1);
  state.clientUpdatedAt = project.updatedAt || new Date().toISOString();
  activeHeadingId = state.sections[0]?.id || "cover";
  populateDrawer();
  applyTemplateVars();
  renderStructuredEditor();
  renderAll();
  persistState();
}

async function deleteCloudProject(id) {
  const project = cloudProjects.find((item) => item.id === id);
  if (!window.confirm(`确定删除“${project?.title || "这个项目"}”吗？删除后无法恢复。`)) return;
  try {
    await apiRequest(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (state.id === id) {
      state.id = null;
      state.revision = 0;
      persistState();
    }
    await loadCloudProjects();
    showToast("项目已删除");
  } catch (error) {
    showToast(error.message, "error");
  }
}

function scheduleCloudSave(force = false) {
  clearTimeout(cloudSaveTimer);
  if (!currentUser || !state.id || !cloudAvailable) return;
  if (force) {
    saveCloudProject();
    return;
  }
  cloudSaveTimer = window.setTimeout(saveCloudProject, 1200);
}

async function saveCloudProject() {
  if (!currentUser || !state.id || !cloudAvailable) return;
  if (cloudSaveInFlight) {
    cloudSavePending = true;
    return;
  }
  cloudSaveInFlight = true;
  try {
    syncContent();
    const result = await apiRequest(`/api/projects/${encodeURIComponent(state.id)}`, {
      method: "PUT",
      body: projectPayload(true),
    });
    state.revision = Number(result.project.revision || state.revision + 1);
    state.clientUpdatedAt = result.project.updatedAt;
    persistState();
    saveState.textContent = `已同步云端 ${formatClock(result.project.updatedAt)}`;
  } catch (error) {
    if (error.status === 409) {
      saveState.textContent = "云端版本冲突";
      showToast("项目已在其他设备更新，请从项目中心重新加载", "error");
    } else {
      saveState.textContent = "云端同步失败，本机已保存";
    }
  } finally {
    cloudSaveInFlight = false;
    if (cloudSavePending) {
      cloudSavePending = false;
      scheduleCloudSave(true);
    }
  }
}

function projectPayload(includeRevision) {
  const payload = {
    title: state.metadata.title || "未命名论文",
    metadata: state.metadata,
    template: state.template,
    sections: state.sections,
    content: state.content,
  };
  if (includeRevision) payload.revision = Number(state.revision || 1);
  return payload;
}

function showToast(message, type = "") {
  const region = document.getElementById("toastRegion");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`.trim();
  toast.textContent = message;
  region.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

function formatClock(value) {
  const date = new Date(value || Date.now());
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatTime(value) {
  const date = new Date(value || Date.now());
  return `${date.getMonth() + 1}月${date.getDate()}日 ${formatClock(date)}`;
}

function exportProject() {
  syncContent();
  persistState();
  const backup = {
    ...state,
    id: null,
    revision: 0,
    exportedAt: new Date().toISOString(),
  };
  downloadBlob(
    `${safeFileName(state.metadata.title || "论文项目")}.json`,
    new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
  );
  showToast("项目备份已导出");
}

function importProject() {
  const file = projectFileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(String(reader.result));
      state = mergeState(createDefaultState(), incoming);
      state.id = null;
      state.revision = 0;
      activeHeadingId = state.sections[0]?.id || "";
      populateDrawer();
      applyTemplateVars();
      renderStructuredEditor();
      scheduleSaveAndRender();
      saveState.textContent = "项目已导入";
      showToast("项目导入成功");
    } catch (error) {
      window.alert("导入失败：请选择由本工具导出的 JSON 项目文件。");
    } finally {
      projectFileInput.value = "";
    }
  };
  reader.readAsText(file);
}

function exportWord() {
  syncContent();
  const chunks = chunkContentBlocks();
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
          .image-placeholder { border: 1px dashed #777; padding: 30pt; text-align: center; text-indent: 0; }
          figcaption, .figure-caption { text-align: center; text-indent: 0; font-size: 10.5pt; }
        </style>
      </head>
      <body>
        ${wordCoverHtml()}
        <div class="page-break"></div>
        ${wordAbstractHtml()}
        <div class="page-break"></div>
        <h1>目录</h1>
        ${headings.map((heading) => `<p class="toc-row">${escapeHtml(heading.title)} ...... ${heading.page}</p>`).join("")}
        <div class="page-break"></div>
        ${state.content}
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

function sectionsFromHtml(html) {
  if (!html) return null;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const sections = [];
  let current = null;

  Array.from(wrapper.children).forEach((node) => {
    const tag = node.tagName?.toLowerCase();
    if (/^h[1-3]$/.test(tag)) {
      current = {
        id: node.id || createSectionId(),
        level: Number(tag.slice(1)),
        title: cleanSectionTitle(node.textContent.trim(), Number(tag.slice(1))) || "未命名标题",
        body: "",
      };
      if (current.title.includes("参考文献")) current.kind = "references";
      sections.push(current);
      return;
    }

    if (!current) return;
    if (tag === "table") {
      current.table = extractTable(node);
      return;
    }
    if (node.classList?.contains("image-placeholder") || tag === "figure") {
      const image = node.querySelector?.("img");
      current.figure = {
        caption: node.querySelector?.("figcaption")?.textContent.trim() || node.textContent.trim() || "图示占位",
        alt: image?.alt || "",
        dataUrl: image?.src?.startsWith("data:image/") ? image.src : "",
      };
      return;
    }
    if (tag === "ol" && (current.kind === "references" || current.title.includes("参考文献"))) {
      current.body = Array.from(node.querySelectorAll("li")).map((item) => item.textContent.trim()).filter(Boolean).join("\n");
      return;
    }
    if (node.classList?.contains("figure-caption")) {
      if (current.figure) current.figure.caption = node.textContent.trim();
      if (current.table) current.table.caption = node.textContent.trim();
      return;
    }

    const text = node.textContent.trim();
    if (text) current.body = [current.body, text].filter(Boolean).join("\n");
  });

  return sections.length ? sections : null;
}

function extractTable(table) {
  const headers = Array.from(table.querySelectorAll("thead th")).map((cell) => cell.textContent.trim()).filter(Boolean);
  const rows = Array.from(table.querySelectorAll("tbody tr"))
    .map((row) => Array.from(row.children).map((cell) => cell.textContent.trim()).join("｜"))
    .filter(Boolean)
    .join("\n");
  return {
    caption: "表 X-X 表题说明",
    headers: headers.length ? headers : ["项目", "说明", "状态"],
    rows,
  };
}

function normalizeSections(sections) {
  if (!Array.isArray(sections) || !sections.length) return null;
  return sections.map((section) => ({
    id: section.id || createSectionId(),
    level: Math.min(3, Math.max(1, Number(section.level || 1))),
    kind: section.kind === "references" ? "references" : undefined,
    title: cleanSectionTitle(String(section.title || "未命名标题"), Number(section.level || 1), section.kind),
    body: String(section.body || ""),
    table: section.table
      ? {
          caption: String(section.table.caption || ""),
          headers: Array.isArray(section.table.headers) ? section.table.headers : ["项目", "说明", "状态"],
          rows: String(section.table.rows || ""),
        }
      : undefined,
    figure: section.figure
      ? {
          caption: String(section.figure.caption || ""),
          alt: String(section.figure.alt || ""),
          dataUrl: /^data:image\//.test(String(section.figure.dataUrl || "")) ? String(section.figure.dataUrl) : "",
        }
      : undefined,
  }));
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

function splitLines(value) {
  return String(value || "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanSectionTitle(value, level = 1, kind = "") {
  const raw = String(value || "").trim();
  if (kind === "references" || raw === "参考文献") return "参考文献";
  return raw
    .replace(/^第[一二三四五六七八九十百零〇两0-9]+章\s*/, "")
    .replace(/^\d+(?:\.\d+){0,2}\s*/, "")
    .replace(/^第\s*\d+\s*章\s*/, "")
    .trim() || (Number(level) === 1 ? "未命名章节" : "未命名小节");
}

function toChineseNumber(value) {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return String(value);
  if (number <= 10) return number === 10 ? "十" : digits[number];
  if (number < 20) return `十${digits[number - 10]}`;
  if (number < 100) {
    const ten = Math.floor(number / 10);
    const one = number % 10;
    return `${digits[ten]}十${one ? digits[one] : ""}`;
  }
  return String(number);
}

function createSectionId() {
  return `sec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function toEnglishKeywords(value) {
  if (!value) return "";
  return String(value)
    .replace(/[；;，、]/g, "; ")
    .replace(/论文排版/g, "thesis formatting")
    .replace(/结构化写作/g, "structured writing")
    .replace(/富文本编辑器/g, "rich-text editor")
    .replace(/模板规则/g, "template rules")
    .replace(/导出/g, "export");
}

function levelLabel(level) {
  return { 1: "一级章节", 2: "二级小节", 3: "三级小节" }[level] || "章节";
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

init().catch((error) => {
  console.error(error);
  showToast("初始化失败，请刷新页面重试", "error");
});
