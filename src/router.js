const appConfig = require("./config");
const { login, logout, pickPublicUser, register, requireUser } = require("./auth");
const { buildPrintHtml, buildWordDocument, safeFileName } = require("./exporters");
const { checkProject } = require("./format-checker");
const {
  createId,
  now,
  readCollection,
  storageMode,
  writeCollection,
} = require("./storage");
const {
  parseRequestUrl,
  readJsonBody,
  sendBuffer,
  sendError,
  sendJson,
  sendText,
  serveStaticFile,
} = require("./http-utils");

async function route(req, res) {
  const url = parseRequestUrl(req);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") {
    sendText(res, 204, "");
    return;
  }

  try {
    if (req.method === "GET" && pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "thesis-editor-backend",
        storage: storageMode(),
        persistent: storageMode() === "upstash" || !appConfig.isVercel,
        time: now(),
      });
      return;
    }

    if (pathname.startsWith("/api/")) {
      await routeApi(req, res, pathname);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      if (serveStaticFile(res, appConfig.publicDir, url.pathname)) return;
    }

    sendError(res, 404, "Not found");
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendError(res, statusCode, error.message || "Internal server error");
  }
}

async function routeApi(req, res, pathname) {
  if (req.method === "POST" && pathname === "/api/auth/register") {
    const body = await readJsonBody(req);
    sendJson(res, 201, { ok: true, ...(await register(body)) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    const body = await readJsonBody(req);
    sendJson(res, 200, { ok: true, ...(await login(body)) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/logout") {
    await logout(req);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/me") {
    const user = await requireUser(req);
    sendJson(res, 200, { ok: true, user: pickPublicUser(user) });
    return;
  }

  if (pathname.startsWith("/api/projects")) {
    await routeProjects(req, res, pathname);
    return;
  }

  if (pathname.startsWith("/api/templates")) {
    await routeTemplates(req, res, pathname);
    return;
  }

  if (pathname.startsWith("/api/assets")) {
    await routeAssets(req, res, pathname);
    return;
  }

  if (pathname.startsWith("/api/export")) {
    await routeExports(req, res, pathname);
    return;
  }

  if (req.method === "POST" && pathname === "/api/format/check") {
    const user = await requireUser(req);
    const body = await readJsonBody(req);
    const project = await resolveProjectForBody(user, body);
    sendJson(res, 200, { ok: true, result: checkProject(project) });
    return;
  }

  sendError(res, 404, "API route not found");
}

async function routeProjects(req, res, pathname) {
  const user = await requireUser(req);
  const id = pathId(pathname, "/api/projects");

  if (req.method === "GET" && !id) {
    const projects = (await readCollection("projects"))
      .filter((project) => project.ownerId === user.id)
      .map(projectListItem);
    sendJson(res, 200, { ok: true, projects });
    return;
  }

  if (req.method === "POST" && !id) {
    const body = await readJsonBody(req);
    const project = normalizeProjectInput(body, user.id);
    const projects = await readCollection("projects");
    projects.push(project);
    await writeCollection("projects", projects);
    sendJson(res, 201, { ok: true, project });
    return;
  }

  if (!id) {
    sendError(res, 405, "Method not allowed");
    return;
  }

  const projects = await readCollection("projects");
  const index = projects.findIndex((project) => project.id === id && project.ownerId === user.id);
  if (index < 0) {
    sendError(res, 404, "Project not found");
    return;
  }

  if (req.method === "GET") {
    sendJson(res, 200, { ok: true, project: projects[index] });
    return;
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    const body = await readJsonBody(req);
    if (body.revision !== undefined && Number(body.revision) !== Number(projects[index].revision || 1)) {
      sendJson(res, 409, {
        ok: false,
        error: "云端项目已在其他位置更新，请重新加载后再保存",
        project: projects[index],
      });
      return;
    }
    projects[index] = {
      ...projects[index],
      ...allowedProjectPatch(body),
      ownerId: user.id,
      id: projects[index].id,
      updatedAt: now(),
      revision: Number(projects[index].revision || 1) + 1,
    };
    await writeCollection("projects", projects);
    sendJson(res, 200, { ok: true, project: projects[index] });
    return;
  }

  if (req.method === "DELETE") {
    projects.splice(index, 1);
    await writeCollection("projects", projects);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendError(res, 405, "Method not allowed");
}

async function routeTemplates(req, res, pathname) {
  const user = await requireUser(req);
  const id = pathId(pathname, "/api/templates");

  if (req.method === "GET" && !id) {
    const templates = (await readCollection("templates")).filter((template) => template.isSystem || template.ownerId === user.id);
    sendJson(res, 200, { ok: true, templates });
    return;
  }

  if (req.method === "POST" && !id) {
    const body = await readJsonBody(req);
    const template = {
      id: createId("tpl"),
      ownerId: user.id,
      isSystem: false,
      name: nonEmpty(body.name, "未命名模板"),
      description: String(body.description || ""),
      rules: body.rules && typeof body.rules === "object" ? body.rules : {},
      createdAt: now(),
      updatedAt: now(),
    };
    const templates = await readCollection("templates");
    templates.push(template);
    await writeCollection("templates", templates);
    sendJson(res, 201, { ok: true, template });
    return;
  }

  if (!id) {
    sendError(res, 405, "Method not allowed");
    return;
  }

  const templates = await readCollection("templates");
  const index = templates.findIndex((template) => template.id === id && template.ownerId === user.id && !template.isSystem);
  if (index < 0) {
    sendError(res, 404, "Editable template not found");
    return;
  }

  if (req.method === "GET") {
    sendJson(res, 200, { ok: true, template: templates[index] });
    return;
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    const body = await readJsonBody(req);
    templates[index] = {
      ...templates[index],
      name: body.name ? String(body.name).trim() : templates[index].name,
      description: body.description === undefined ? templates[index].description : String(body.description || ""),
      rules: body.rules && typeof body.rules === "object" ? body.rules : templates[index].rules,
      updatedAt: now(),
    };
    await writeCollection("templates", templates);
    sendJson(res, 200, { ok: true, template: templates[index] });
    return;
  }

  if (req.method === "DELETE") {
    templates.splice(index, 1);
    await writeCollection("templates", templates);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendError(res, 405, "Method not allowed");
}

async function routeAssets(req, res, pathname) {
  const user = await requireUser(req);
  const rawMatch = pathname.match(/^\/api\/assets\/([^/]+)\/raw$/);
  if (rawMatch && req.method === "GET") {
    const asset = (await readCollection("assets")).find((item) => item.id === rawMatch[1] && item.ownerId === user.id);
    if (!asset) {
      sendError(res, 404, "Asset not found");
      return;
    }
    sendBuffer(res, 200, Buffer.from(asset.base64, "base64"), asset.mimeType || "application/octet-stream");
    return;
  }

  const id = pathId(pathname, "/api/assets");

  if (req.method === "GET" && !id) {
    const assets = (await readCollection("assets"))
      .filter((asset) => asset.ownerId === user.id)
      .map(({ base64, ...asset }) => ({ ...asset, url: `/api/assets/${asset.id}/raw` }));
    sendJson(res, 200, { ok: true, assets });
    return;
  }

  if (req.method === "POST" && !id) {
    const body = await readJsonBody(req, appConfig.maxAssetBytes + 1024 * 1024);
    const parsed = parseAssetPayload(body);
    if (parsed.bytes > appConfig.maxAssetBytes) {
      sendError(res, 413, "Asset is too large");
      return;
    }
    const asset = {
      id: createId("ast"),
      ownerId: user.id,
      fileName: nonEmpty(body.fileName, "asset.bin"),
      mimeType: parsed.mimeType,
      base64: parsed.base64,
      bytes: parsed.bytes,
      createdAt: now(),
      updatedAt: now(),
    };
    const assets = await readCollection("assets");
    assets.push(asset);
    await writeCollection("assets", assets);
    const { base64, ...publicAsset } = asset;
    sendJson(res, 201, { ok: true, asset: { ...publicAsset, url: `/api/assets/${asset.id}/raw` } });
    return;
  }

  if (id && req.method === "DELETE") {
    const assets = await readCollection("assets");
    const next = assets.filter((asset) => !(asset.id === id && asset.ownerId === user.id));
    await writeCollection("assets", next);
    sendJson(res, 200, { ok: true, deleted: next.length !== assets.length });
    return;
  }

  sendError(res, 405, "Method not allowed");
}

async function routeExports(req, res, pathname) {
  const user = await requireUser(req);
  const body = await readJsonBody(req);
  const project = await resolveProjectForBody(user, body);
  const filenameBase = safeFileName(`${project.metadata?.title || project.title || "论文"}_${project.metadata?.author || "作者"}`);

  if (req.method === "POST" && pathname === "/api/export/word") {
    const html = buildWordDocument(project);
    sendBuffer(res, 200, Buffer.from(`\ufeff${html}`, "utf8"), "application/msword", {
      "Content-Disposition": contentDisposition(`${filenameBase}.doc`),
    });
    return;
  }

  if (req.method === "POST" && (pathname === "/api/export/print-html" || pathname === "/api/export/pdf-html")) {
    const html = buildPrintHtml(project);
    sendText(res, 200, html, "text/html; charset=utf-8");
    return;
  }

  sendError(res, 404, "Export route not found");
}

async function resolveProjectForBody(user, body) {
  if (body.project && typeof body.project === "object") {
    return normalizeProjectForExport(body.project, user.id);
  }
  if (body.projectId) {
    const project = (await readCollection("projects")).find((item) => item.id === body.projectId && item.ownerId === user.id);
    if (!project) throw Object.assign(new Error("Project not found"), { statusCode: 404 });
    return project;
  }
  throw Object.assign(new Error("Provide projectId or project"), { statusCode: 400 });
}

function normalizeProjectInput(body, ownerId) {
  const createdAt = now();
  return {
    id: createId("prj"),
    ownerId,
    title: nonEmpty(body.title || body.metadata?.title, "未命名论文"),
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    template: body.template && typeof body.template === "object" ? body.template : {},
    sections: normalizeSections(body.sections),
    content: String(body.content || ""),
    revision: 1,
    createdAt,
    updatedAt: createdAt,
  };
}

function normalizeProjectForExport(project, ownerId) {
  return {
    id: project.id || createId("tmp"),
    ownerId,
    title: nonEmpty(project.title || project.metadata?.title, "未命名论文"),
    metadata: project.metadata && typeof project.metadata === "object" ? project.metadata : {},
    template: project.template && typeof project.template === "object" ? project.template : {},
    sections: normalizeSections(project.sections),
    content: String(project.content || ""),
    revision: Number(project.revision || 1),
    createdAt: project.createdAt || now(),
    updatedAt: project.updatedAt || now(),
  };
}

function allowedProjectPatch(body) {
  const patch = {};
  if (body.title !== undefined) patch.title = nonEmpty(body.title, "未命名论文");
  if (body.metadata !== undefined && typeof body.metadata === "object") patch.metadata = body.metadata;
  if (body.template !== undefined && typeof body.template === "object") patch.template = body.template;
  if (body.sections !== undefined) patch.sections = normalizeSections(body.sections);
  if (body.content !== undefined) patch.content = String(body.content || "");
  return patch;
}

function projectListItem(project) {
  return {
    id: project.id,
    title: project.title,
    paperType: project.metadata?.paperType || "",
    author: project.metadata?.author || "",
    templateName: project.template?.name || "",
    wordCount: projectWordCount(project),
    revision: Number(project.revision || 1),
    updatedAt: project.updatedAt,
    createdAt: project.createdAt,
  };
}

function normalizeSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections.slice(0, 300).map((section) => ({
    id: nonEmpty(section.id, createId("sec")),
    level: Math.min(3, Math.max(1, Number(section.level || 1))),
    kind: section.kind === "references" ? "references" : undefined,
    title: String(section.title || "").slice(0, 300),
    body: String(section.body || ""),
    table: section.table && typeof section.table === "object"
      ? {
          caption: String(section.table.caption || ""),
          headers: Array.isArray(section.table.headers)
            ? section.table.headers.map((item) => String(item || "").slice(0, 120)).slice(0, 20)
            : [],
          rows: String(section.table.rows || ""),
        }
      : undefined,
    figure: section.figure && typeof section.figure === "object"
      ? {
          caption: String(section.figure.caption || ""),
          alt: String(section.figure.alt || ""),
          dataUrl: /^data:image\/(?:png|jpe?g|webp|gif);base64,/.test(String(section.figure.dataUrl || ""))
            ? String(section.figure.dataUrl)
            : "",
        }
      : undefined,
  }));
}

function projectWordCount(project) {
  const metadata = project.metadata && typeof project.metadata === "object" ? Object.values(project.metadata).join("") : "";
  const sections = Array.isArray(project.sections)
    ? project.sections.map((section) => `${section.title || ""}${section.body || ""}`).join("")
    : "";
  return `${metadata}${sections}`.replace(/\s/g, "").length;
}

function parseAssetPayload(body) {
  let mimeType = String(body.mimeType || "application/octet-stream");
  let base64 = String(body.base64 || "");

  if (body.dataUrl) {
    const match = String(body.dataUrl).match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw Object.assign(new Error("Invalid dataUrl"), { statusCode: 400 });
    mimeType = match[1];
    base64 = match[2];
  }

  if (!base64) throw Object.assign(new Error("Missing base64 or dataUrl"), { statusCode: 400 });
  const buffer = Buffer.from(base64, "base64");
  return {
    mimeType,
    base64,
    bytes: buffer.length,
  };
}

function pathId(pathname, prefix) {
  if (pathname === prefix) return "";
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = pathname.match(new RegExp(`^${escaped}/([^/]+)$`));
  return match ? decodeURIComponent(match[1]) : "";
}

function nonEmpty(value, fallback) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function contentDisposition(filename) {
  return `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

module.exports = {
  route,
};
