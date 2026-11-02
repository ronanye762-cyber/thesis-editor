const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(process.env.PROJECT_ROOT || process.cwd());
const isVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
const defaultDataDir = isVercel ? "/tmp/thesis-editor-data" : "./data";
const defaultPublicDir = fs.existsSync(path.resolve(rootDir, "public")) ? "./public" : "../thesis-editor-deploy";

function readNumber(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function resolvePath(input) {
  return path.isAbsolute(input) ? input : path.resolve(rootDir, input);
}

module.exports = {
  rootDir,
  isVercel,
  host: process.env.HOST || (isVercel ? "" : "127.0.0.1"),
  port: readNumber("PORT", 8787),
  dataDir: resolvePath(process.env.DATA_DIR || defaultDataDir),
  publicDir: resolvePath(process.env.PUBLIC_DIR || defaultPublicDir),
  sessionTtlDays: readNumber("SESSION_TTL_DAYS", 7),
  maxJsonBytes: readNumber("MAX_JSON_BYTES", 20 * 1024 * 1024),
  maxAssetBytes: readNumber("MAX_ASSET_BYTES", 5 * 1024 * 1024),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  redisUrl: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "",
  redisToken: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "",
  storagePrefix: process.env.STORAGE_PREFIX || "thesis-editor-v1",
  aiBaseUrl: process.env.AI_BASE_URL || "",
  aiApiKey: process.env.AI_API_KEY || "",
  aiModel: process.env.AI_MODEL || "",
  aiResponseFormat: process.env.AI_RESPONSE_FORMAT || "json_object",
  aiTimeoutMs: readNumber("AI_TIMEOUT_MS", 45000),
  latexServiceUrl: process.env.LATEX_SERVICE_URL || "",
  latexServiceToken: process.env.LATEX_SERVICE_TOKEN || "",
  latexCommand: process.env.LATEX_COMMAND || "xelatex",
  latexTimeoutMs: readNumber("LATEX_TIMEOUT_MS", 45000),
  compileConcurrency: readNumber("COMPILE_CONCURRENCY", 2),
  fonts: {
    songti: process.env.LATEX_FONT_SONG || "FandolSong-Regular.otf",
    heiti: process.env.LATEX_FONT_HEI || "FandolHei-Regular.otf",
    kaiti: process.env.LATEX_FONT_KAI || "FandolKai-Regular.otf",
    fangsong: process.env.LATEX_FONT_FANG || "FandolFang-Regular.otf",
    times: process.env.LATEX_FONT_TIMES || "texgyretermes-regular.otf",
    arial: process.env.LATEX_FONT_ARIAL || "texgyreheros-regular.otf",
  },
};
