const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(os.tmpdir(), `thesis-editor-backend-smoke-${Date.now()}`);
const port = 8797;
const baseUrl = `http://127.0.0.1:${port}`;

async function main() {
  fs.mkdirSync(dataDir, { recursive: true });
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      DATA_DIR: dataDir,
      PUBLIC_DIR: path.resolve(rootDir, "public"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  try {
    await waitForHealth();
    const health = await (await fetch(`${baseUrl}/health`)).json();
    assert(health.storage === "filesystem", "local smoke test should use filesystem storage");
    assert(health.persistent === true, "local filesystem storage should be persistent");
    const home = await fetch(`${baseUrl}/`);
    assert(home.ok, "frontend should be served from /");
    assert((await home.text()).includes("论文"), "frontend HTML should include thesis editor copy");

    const unique = Date.now();
    const auth = await request("POST", "/api/auth/register", {
      email: `smoke-${unique}@example.com`,
      password: "password123",
      name: "Smoke Test",
    });
    assert(auth.session?.token, "register should return token");
    const token = auth.session.token;

    const templates = await request("GET", "/api/templates", null, token);
    assert(templates.templates.length >= 3, "should include three system templates");

    const created = await request(
      "POST",
      "/api/projects",
      {
        title: "后端冒烟测试论文",
        metadata: {
          school: "示例大学",
          title: "后端冒烟测试论文",
          author: "测试用户",
          supervisor: "测试导师",
          abstractCn: "这是用于验证后端接口的摘要。",
          keywords: "后端；论文排版；测试",
        },
        template: {
          name: "通用本科论文模板",
          fontSize: "15px",
          lineHeight: "1.75",
        },
        sections: [
          { id: "intro", level: 1, title: "绪论", body: "这里是结构化正文内容。" },
          { id: "references", level: 1, kind: "references", title: "参考文献", body: "测试文献。" },
        ],
        content: "<h1>第一章 绪论</h1><p>这里是正文内容。</p><h1>参考文献</h1><ol><li>测试文献。</li></ol>",
      },
      token,
    );
    assert(created.project?.id, "project should be created");
    assert(created.project.sections?.length === 2, "structured sections should be stored");
    assert(created.project.revision === 1, "new project should start at revision 1");

    const list = await request("GET", "/api/projects", null, token);
    assert(list.projects.length === 1, "project list should contain created project");
    assert(list.projects[0].wordCount > 0, "project list should include word count");

    const updated = await request(
      "PUT",
      `/api/projects/${created.project.id}`,
      {
        revision: 1,
        title: "后端冒烟测试论文（已更新）",
        metadata: created.project.metadata,
        template: created.project.template,
        sections: created.project.sections,
        content: created.project.content,
      },
      token,
    );
    assert(updated.project.revision === 2, "project update should increment revision");

    const conflict = await rawRequest(
      "PUT",
      `/api/projects/${created.project.id}`,
      { revision: 1, title: "过期更新" },
      token,
    );
    assert(conflict.status === 409, "stale project update should return conflict");

    const check = await request("POST", "/api/format/check", { projectId: created.project.id }, token);
    assert(check.result?.stats?.headings >= 2, "format check should return stats");

    const asset = await request(
      "POST",
      "/api/assets",
      {
        fileName: "hello.txt",
        mimeType: "text/plain",
        base64: Buffer.from("hello").toString("base64"),
      },
      token,
    );
    assert(asset.asset?.url, "asset upload should return url");

    const word = await fetch(`${baseUrl}/api/export/word`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ projectId: created.project.id }),
    });
    assert(word.ok, "word export should succeed");
    assert((await word.text()).includes("后端冒烟测试论文"), "word export should include title");

    await request("POST", "/api/auth/logout", {}, token);
    console.log("Smoke test passed");
  } finally {
    child.kill("SIGTERM");
  }
}

async function rawRequest(method, pathname, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });
  return { status: response.status, payload: await response.json() };
}

async function waitForHealth() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch (_) {
      await sleep(150);
    }
  }
  throw new Error("Server did not become healthy");
}

async function request(method, pathname, body, token) {
  const headers = {};
  if (body !== null && body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body === null || body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`Expected JSON from ${pathname}, got: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`${method} ${pathname} failed: ${res.status} ${text}`);
  }
  return json;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
