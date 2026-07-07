const crypto = require("node:crypto");
const appConfig = require("./config");
const { createId, now, pickPublicUser, readCollection, writeCollection } = require("./storage");
const { getBearerToken } = require("./http-utils");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function assertValidEmail(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error("Email format is invalid"), { statusCode: 400 });
  }
}

function assertValidPassword(password) {
  if (String(password || "").length < 8) {
    throw Object.assign(new Error("Password must be at least 8 characters"), { statusCode: 400 });
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
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
}

function register({ email, password, name }) {
  const normalizedEmail = normalizeEmail(email);
  assertValidEmail(normalizedEmail);
  assertValidPassword(password);

  const users = readCollection("users");
  if (users.some((user) => user.email === normalizedEmail)) {
    throw Object.assign(new Error("Email is already registered"), { statusCode: 409 });
  }

  const user = {
    id: createId("usr"),
    email: normalizedEmail,
    name: String(name || normalizedEmail.split("@")[0]).trim(),
    passwordHash: hashPassword(password),
    createdAt: now(),
    updatedAt: now(),
  };
  users.push(user);
  writeCollection("users", users);

  return {
    user: pickPublicUser(user),
    session: createSession(user.id),
  };
}

function login({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const users = readCollection("users");
  const user = users.find((item) => item.email === normalizedEmail);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw Object.assign(new Error("Invalid email or password"), { statusCode: 401 });
  }

  return {
    user: pickPublicUser(user),
    session: createSession(user.id),
  };
}

function createSession(userId) {
  const sessions = readCollection("sessions");
  const token = crypto.randomBytes(32).toString("hex");
  const createdAt = now();
  const expiresAt = new Date(Date.now() + appConfig.sessionTtlDays * 24 * 60 * 60 * 1000).toISOString();
  const session = {
    id: createId("ses"),
    userId,
    tokenHash: sha256(token),
    createdAt,
    expiresAt,
  };
  sessions.push(session);
  writeCollection("sessions", sessions);
  return { token, expiresAt };
}

function logout(req) {
  const token = getBearerToken(req);
  if (!token) return false;
  const sessions = readCollection("sessions");
  const tokenHash = sha256(token);
  const next = sessions.filter((session) => session.tokenHash !== tokenHash);
  writeCollection("sessions", next);
  return next.length !== sessions.length;
}

function requireUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    throw Object.assign(new Error("Missing bearer token"), { statusCode: 401 });
  }

  const tokenHash = sha256(token);
  const sessions = readCollection("sessions");
  const session = sessions.find((item) => item.tokenHash === tokenHash);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    throw Object.assign(new Error("Session expired or invalid"), { statusCode: 401 });
  }

  const users = readCollection("users");
  const user = users.find((item) => item.id === session.userId);
  if (!user) {
    throw Object.assign(new Error("User not found"), { statusCode: 401 });
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
