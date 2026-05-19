const crypto = require("crypto");
const { getStore } = require("./kv-store");
const { scopeTenantKey } = require("./tenant");

const buckets = new Map();
const seenRequests = new Map();

const now = () => Date.now();

const clientId = (req) => {
  const raw = String(
    req?.headers?.["x-forwarded-for"] ||
      req?.headers?.["x-real-ip"] ||
      req?.socket?.remoteAddress ||
      "local",
  )
    .split(",")[0]
    .trim();
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
};

const setSecurityHeaders = (res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'",
  );
};

const isProduction = () => process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

const requireProductionSecret = (value, name, fallback) => {
  const secret = String(value || "");
  if (secret) return secret;
  if (!isProduction()) return fallback;
  const err = new Error(`${name} is required in production`);
  err.statusCode = 500;
  throw err;
};

const sessionSecret = () => requireProductionSecret(process.env.SESSION_SECRET || process.env.AUTH_SECRET, "SESSION_SECRET", "development-session-secret");

const signSessionPayload = (payload) => crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");

const decodeSessionToken = (token) => {
  try {
    const [payload, sig] = String(token || "").split(".");
    if (!payload || !sig) return null;
    const expected = signSessionPayload(payload);
    const actualBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!claims.exp || Date.now() > Number(claims.exp)) return null;
    return claims;
  } catch {
    return null;
  }
};

const getBearerSession = (req) => decodeSessionToken(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""));

const requireTenantSession = (req, tenantId) => {
  const session = getBearerSession(req);
  if (!session?.tenantId || String(session.tenantId) !== String(tenantId)) {
    const err = new Error("Valid organization session required");
    err.statusCode = 401;
    throw err;
  }
  return session;
};

const readArray = async (store, key) => {
  const value = (await store.get(key)) || [];
  return Array.isArray(value) ? value : [];
};

const requireActiveTenantSession = async (req, tenantId) => {
  const session = requireTenantSession(req, tenantId);
  const store = getStore();
  const orgs = await readArray(store, "platform_organizations_v1");
  const org = orgs.find((row) => String(row.id || "") === String(tenantId));
  if (!org || !["active", "verified"].includes(String(org.status || "").toLowerCase())) {
    const err = new Error("Organization is not active");
    err.statusCode = 403;
    throw err;
  }
  if (session.userId && session.userId !== "organization-admin") {
    const users = await readArray(store, scopeTenantKey(tenantId, "enterprise_org_users_v1"));
    const user = users.find((row) => String(row.id || "") === String(session.userId) || String(row.email || "").toLowerCase() === String(session.sub || "").toLowerCase());
    if (!user || String(user.status || "active").toLowerCase() !== "active") {
      const err = new Error("User account is not active");
      err.statusCode = 403;
      throw err;
    }
  }
  return session;
};

const normalizeRole = (role) => String(role || "").trim().toLowerCase();

const elevatedOrgRoles = new Set(["org_admin", "admin"]);

const requireOrgRole = (req, tenantId, roles = []) => {
  const session = requireTenantSession(req, tenantId);
  const allowed = new Set((Array.isArray(roles) ? roles : [roles]).map(normalizeRole).filter(Boolean));
  const role = normalizeRole(session.role);
  if (!allowed.size || allowed.has(role) || (allowed.has("admin") && elevatedOrgRoles.has(role))) return session;
  const err = new Error("Access denied");
  err.statusCode = 403;
  throw err;
};

const requireOrgAdmin = (req, tenantId) => requireOrgRole(req, tenantId, ["org_admin", "admin"]);

const requireActiveOrgAdmin = async (req, tenantId) => {
  const session = await requireActiveTenantSession(req, tenantId);
  const role = normalizeRole(session.role);
  if (!elevatedOrgRoles.has(role)) {
    const err = new Error("Access denied");
    err.statusCode = 403;
    throw err;
  }
  return session;
};

const rateLimit = (req, opts = {}) => {
  const limit = Number(opts.limit || 180);
  const windowMs = Number(opts.windowMs || 60_000);
  const id = `${opts.scope || "api"}:${clientId(req)}`;
  const t = now();
  const bucket = buckets.get(id) || { count: 0, resetAt: t + windowMs };
  if (bucket.resetAt <= t) {
    bucket.count = 0;
    bucket.resetAt = t + windowMs;
  }
  bucket.count += 1;
  buckets.set(id, bucket);
  if (bucket.count > limit) {
    const err = new Error("Rate limit exceeded");
    err.statusCode = 429;
    err.retryAfter = Math.max(1, Math.ceil((bucket.resetAt - t) / 1000));
    throw err;
  }
  return bucket;
};

const assertSameOrigin = (req) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
  const origin = String(req.headers.origin || "");
  if (!origin) return;
  const host = String(req.headers.host || "");
  try {
    if (new URL(origin).host === host) return;
  } catch {
    // fall through
  }
  const err = new Error("Cross-origin request rejected");
  err.statusCode = 403;
  throw err;
};

const assertObject = (value, message = "Invalid body") => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const err = new Error(message);
    err.statusCode = 400;
    throw err;
  }
  return value;
};

const safeString = (value, max = 500) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);

const idempotencyKey = (req, body = null) =>
  safeString(req.headers["idempotency-key"] || body?.idempotencyKey || "", 160);

const assertIdempotent = (req, body = null) => {
  const key = idempotencyKey(req, body);
  if (!key) return null;
  const id = `${clientId(req)}:${key}`;
  const t = now();
  for (const [k, expiresAt] of seenRequests.entries()) {
    if (expiresAt <= t) seenRequests.delete(k);
  }
  if (seenRequests.has(id)) {
    const err = new Error("Duplicate request ignored");
    err.statusCode = 409;
    throw err;
  }
  seenRequests.set(id, t + 10 * 60_000);
  return key;
};

module.exports = {
  setSecurityHeaders,
  decodeSessionToken,
  getBearerSession,
  requireTenantSession,
  requireActiveTenantSession,
  requireOrgRole,
  requireOrgAdmin,
  requireActiveOrgAdmin,
  rateLimit,
  assertSameOrigin,
  assertObject,
  safeString,
  assertIdempotent,
};
