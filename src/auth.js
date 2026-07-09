const crypto = require("node:crypto");
const appConfig = require("./config");
const { createId, now, pickPublicUser, readCollection, writeCollection } = require("./storage");
const { getBearerToken } = require("./http-utils");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function assertValidEmail(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error("请输入有效的邮箱地址"), { statusCode: 400 });
  }
}

function assertValidPassword(password) {
  if (String(password || "").length < 8) {
    throw Object.assign(new Error("密码至少需要 8 位"), { statusCode: 400 });
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = hashPassword(password, salt).split("$")[2];
  const candidateBuffer = Buffer.from(candidate, "hex");
  const hashBuffer = Buffer.from(hash, "hex");
  return candidateBuffer.length === hashBuffer.length && crypto.timingSafeEqual(candidateBuffer, hashBuffer);
}

async function register({ email, password, name }) {
  const normalizedEmail = normalizeEmail(email);
  assertValidEmail(normalizedEmail);
  assertValidPassword(password);

  const users = await readCollection("users");
  if (users.some((user) => user.email === normalizedEmail)) {
    throw Object.assign(new Error("该邮箱已注册"), { statusCode: 409 });
  }

  const user = {
    id: createId("usr"),
    email: normalizedEmail,
    name: String(name || normalizedEmail.split("@")[0]).trim().slice(0, 40),
    passwordHash: hashPassword(password),
    createdAt: now(),
    updatedAt: now(),
  };
  users.push(user);
  await writeCollection("users", users);

  return {
    user: pickPublicUser(user),
    session: await createSession(user.id),
  };
}

async function login({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const users = await readCollection("users");
  const user = users.find((item) => item.email === normalizedEmail);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw Object.assign(new Error("邮箱或密码错误"), { statusCode: 401 });
  }

  return {
    user: pickPublicUser(user),
    session: await createSession(user.id),
  };
}

async function createSession(userId) {
  const sessions = await readCollection("sessions");
  const token = crypto.randomBytes(32).toString("hex");
  const createdAt = now();
  const expiresAt = new Date(Date.now() + appConfig.sessionTtlDays * 24 * 60 * 60 * 1000).toISOString();
  sessions.push({
    id: createId("ses"),
    userId,
    tokenHash: sha256(token),
    createdAt,
    expiresAt,
  });
  await writeCollection("sessions", sessions.filter((item) => new Date(item.expiresAt).getTime() > Date.now()));
  return { token, expiresAt };
}

async function logout(req) {
  const token = getBearerToken(req);
  if (!token) return false;
  const sessions = await readCollection("sessions");
  const tokenHash = sha256(token);
  const next = sessions.filter((session) => session.tokenHash !== tokenHash);
  await writeCollection("sessions", next);
  return next.length !== sessions.length;
}

async function requireUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    throw Object.assign(new Error("请先登录"), { statusCode: 401 });
  }

  const tokenHash = sha256(token);
  const sessions = await readCollection("sessions");
  const session = sessions.find((item) => item.tokenHash === tokenHash);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    throw Object.assign(new Error("登录已过期，请重新登录"), { statusCode: 401 });
  }

  const users = await readCollection("users");
  const user = users.find((item) => item.id === session.userId);
  if (!user) {
    throw Object.assign(new Error("用户不存在"), { statusCode: 401 });
  }
  return user;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

module.exports = {
  login,
  logout,
  normalizeEmail,
  pickPublicUser,
  register,
  requireUser,
};
