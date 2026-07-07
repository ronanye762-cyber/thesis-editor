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

function ensureDataStore() {
  fs.mkdirSync(appConfig.dataDir, { recursive: true });
  for (const collection of Object.values(collections)) {
    const filePath = collectionPath(collection.file);
    if (!fs.existsSync(filePath)) {
      writeRaw(filePath, { [collection.root]: collection.initial });
    }
  }
  seedDefaultTemplate();
}

function seedDefaultTemplate() {
  const db = readCollection("templates");
  if (db.some((template) => template.isSystem)) return;

  db.push({
    id: createId("tpl"),
    ownerId: null,
    isSystem: true,
    name: "通用本科论文模板",
    description: "适合本科毕业论文、课程论文、开题报告的基础模板。",
    rules: {
      fontFamily: "'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
      fontSize: "15px",
      lineHeight: "1.75",
      pageMargin: "26mm 24mm 24mm 28mm",
      headingMode: "chapter",
      referenceStyle: "GB/T 7714",
    },
    createdAt: now(),
    updatedAt: now(),
  });
  writeCollection("templates", db);
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

function readCollection(name) {
  const collection = collections[name];
  if (!collection) throw new Error(`Unknown collection: ${name}`);
  const raw = readRaw(collectionPath(collection.file));
  return Array.isArray(raw[collection.root]) ? raw[collection.root] : [];
}

function writeCollection(name, rows) {
  const collection = collections[name];
  if (!collection) throw new Error(`Unknown collection: ${name}`);
  writeRaw(collectionPath(collection.file), { [collection.root]: rows });
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
  writeCollection,
};
