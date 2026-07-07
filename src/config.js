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
  maxJsonBytes: readNumber("MAX_JSON_BYTES", 5 * 1024 * 1024),
  maxAssetBytes: readNumber("MAX_ASSET_BYTES", 5 * 1024 * 1024),
  corsOrigin: process.env.CORS_ORIGIN || "*",
};
