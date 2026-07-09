const fs = require("node:fs");
const path = require("node:path");
const appConfig = require("./config");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...securityHeaders(),
    ...corsHeaders(),
    ...extraHeaders,
  });
  res.end(body);
}

function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8", extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(text),
    ...securityHeaders(),
    ...corsHeaders(),
    ...extraHeaders,
  });
  res.end(text);
}

function sendBuffer(res, statusCode, buffer, contentType, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": buffer.length,
    ...securityHeaders(),
    ...corsHeaders(),
    ...extraHeaders,
  });
  res.end(buffer);
}

function sendError(res, statusCode, message, details) {
  sendJson(res, statusCode, {
    ok: false,
    error: {
      message,
      details: details || undefined,
    },
  });
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": appConfig.corsOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
}

function readJsonBody(req, maxBytes = appConfig.maxJsonBytes) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error("Request body is too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("error", reject);
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(Object.assign(new Error("Invalid JSON body"), { statusCode: 400 }));
      }
    });
  });
}

function parseRequestUrl(req) {
  const base = `http://${req.headers.host || "localhost"}`;
  return new URL(req.url, base);
}

function getBearerToken(req) {
  const raw = req.headers.authorization || "";
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function serveStaticFile(res, publicDir, requestPath) {
  const normalized = decodeURIComponent(requestPath.split("?")[0] || "/");
  const relative = normalized === "/" ? "index.html" : normalized.replace(/^\/+/, "");
  const target = path.resolve(publicDir, relative);

  if (!target.startsWith(publicDir)) {
    sendError(res, 403, "Forbidden");
    return true;
  }

  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    const fallback = path.join(publicDir, "index.html");
    if (!fs.existsSync(fallback)) {
      return false;
    }
    return sendFile(res, fallback);
  }

  return sendFile(res, target);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";
  const data = fs.readFileSync(filePath);
  sendBuffer(res, 200, data, contentType);
  return true;
}

module.exports = {
  corsHeaders,
  getBearerToken,
  parseRequestUrl,
  readJsonBody,
  securityHeaders,
  sendBuffer,
  sendError,
  sendJson,
  sendText,
  serveStaticFile,
};
