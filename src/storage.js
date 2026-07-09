const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const appConfig = require("./config");

const collections = {
  users: { file: "users.json", root: "users", initial: [] },
  sessions: { file: "sessions.json", root: "sessions", initial: [] },
  projects: { file: "projects.json", root: "projects", initial: [] },
  templates: { file: "templates.json", root: "templates", initial: [] },
  assets: { file: "assets.json", root: "assets", initial: [] },
};

let initialized = false;
let initializationPromise = null;

function storageMode() {
  return appConfig.redisUrl && appConfig.redisToken ? "upstash" : "filesystem";
}

async function ensureDataStore() {
  if (initialized) return;
  if (initializationPromise) return initializationPromise;
  initializationPromise = initializeDataStore();
  try {
    await initializationPromise;
    initialized = true;
  } finally {
    initializationPromise = null;
  }
}

async function initializeDataStore() {
  if (storageMode() === "filesystem") {
    fs.mkdirSync(appConfig.dataDir, { recursive: true });
    for (const collection of Object.values(collections)) {
      const filePath = collectionPath(collection.file);
      if (!fs.existsSync(filePath)) {
        writeRaw(filePath, { [collection.root]: collection.initial });
      }
    }
  }

  await seedDefaultTemplates();
}

async function seedDefaultTemplates() {
  const rows = await readCollection("templates", { skipEnsure: true });
  if (rows.some((template) => template.isSystem)) return;

  const createdAt = now();
  rows.push(
    systemTemplate(
      "通用本科论文模板",
      "适合本科毕业论文、课程论文和开题报告的基础格式。",
      {
        fontFamily: "'Songti SC', SimSun, serif",
        fontSize: "15px",
        lineHeight: "1.75",
        pageMargin: "26mm 24mm 24mm 28mm",
        headingMode: "chapter",
        referenceStyle: "GB/T 7714",
      },
      createdAt,
    ),
    systemTemplate(
      "通用硕士学位论文模板",
      "适合中文硕士学位论文的装订版页面与章节编号。",
      {
        fontFamily: "'Songti SC', SimSun, serif",
        fontSize: "15px",
        lineHeight: "1.75",
        pageMargin: "30mm 25mm 25mm 30mm",
        headingMode: "chapter",
        referenceStyle: "GB/T 7714",
      },
      createdAt,
    ),
    systemTemplate(
      "课程论文简洁模板",
      "适合课程作业、研究报告和短篇论文。",
      {
        fontFamily: "'Songti SC', SimSun, serif",
        fontSize: "14px",
        lineHeight: "1.55",
        pageMargin: "25mm",
        headingMode: "decimal",
        referenceStyle: "GB/T 7714",
      },
      createdAt,
    ),
  );
  await writeCollection("templates", rows, { skipEnsure: true });
}

function systemTemplate(name, description, rules, createdAt) {
  return {
    id: createId("tpl"),
    ownerId: null,
    isSystem: true,
    name,
    description,
    rules,
    createdAt,
    updatedAt: createdAt,
  };
}

function collectionPath(file) {
  return path.join(appConfig.dataDir, file);
}

function readRaw(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

function writeRaw(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

async function readCollection(name, options = {}) {
  const collection = collections[name];
  if (!collection) throw new Error(`Unknown collection: ${name}`);
  if (!options.skipEnsure) await ensureDataStore();

  if (storageMode() === "upstash") {
    const result = await redisCommand(["GET", redisKey(name)]);
    if (!result) return structuredClone(collection.initial);
    try {
      const rows = JSON.parse(result);
      return Array.isArray(rows) ? rows : [];
    } catch {
      throw new Error(`Stored collection is invalid: ${name}`);
    }
  }

  const raw = readRaw(collectionPath(collection.file));
  return Array.isArray(raw[collection.root]) ? raw[collection.root] : [];
}

async function writeCollection(name, rows, options = {}) {
  const collection = collections[name];
  if (!collection) throw new Error(`Unknown collection: ${name}`);
  if (!Array.isArray(rows)) throw new TypeError(`Collection must be an array: ${name}`);
  if (!options.skipEnsure) await ensureDataStore();

  if (storageMode() === "upstash") {
    await redisCommand(["SET", redisKey(name), JSON.stringify(rows)]);
    return;
  }

  writeRaw(collectionPath(collection.file), { [collection.root]: rows });
}

async function redisCommand(command) {
  const response = await fetch(appConfig.redisUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${appConfig.redisToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw new Error(`Persistent storage failed: ${payload.error || response.statusText}`);
  }
  return payload.result;
}

function redisKey(name) {
  return `${appConfig.storagePrefix}:collection:${name}`;
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function now() {
  return new Date().toISOString();
}

function pickPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

module.exports = {
  createId,
  ensureDataStore,
  now,
  pickPublicUser,
  readCollection,
  storageMode,
  writeCollection,
};
