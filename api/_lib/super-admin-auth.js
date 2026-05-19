const crypto = require("crypto");
const { getStore } = require("./kv-store");

const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const SUPER_ADMIN_CREDENTIALS_KEY = "platform:super_admin_credentials_v1";

const isProduction = () => process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

const requireProductionSecret = (value, name, fallback) => {
  const secret = String(value || "");
  if (secret) return secret;
  if (!isProduction()) return fallback;
  throw new Error(`${name} is required in production`);
};

const secret = () => requireProductionSecret(process.env.SUPER_ADMIN_SESSION_SECRET || process.env.SESSION_SECRET || process.env.AUTH_SECRET, "SUPER_ADMIN_SESSION_SECRET", "development-super-admin-secret");

const sign = (payload) => crypto.createHmac("sha256", secret()).update(payload).digest("base64url");

const encodeSuperAdminToken = (claims) => {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload)}`;
};

const decodeSuperAdminToken = (token) => {
  try {
    const [payload, sig] = String(token || "").split(".");
    if (!payload || !sig) return null;
    const expected = sign(payload);
    const actualBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (claims.type !== "super_admin" || claims.role !== "super_admin") return null;
    if (!claims.exp || Date.now() > Number(claims.exp)) return null;
    return claims;
  } catch {
    return null;
  }
};

const configuredIdentity = () => {
  const usernames = [
    process.env.SUPER_ADMIN_USERNAME,
    process.env.SUPER_ADMIN_EMAIL,
    !isProduction() && !process.env.SUPER_ADMIN_USERNAME && !process.env.SUPER_ADMIN_EMAIL ? "platform-admin" : "",
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  const passwords = [
    process.env.SUPER_ADMIN_PASSWORD,
    process.env.SUPER_ADMIN_KEY,
    process.env.INTERNAL_ADMIN_KEY,
    !isProduction() && !process.env.SUPER_ADMIN_PASSWORD && !process.env.SUPER_ADMIN_KEY && !process.env.INTERNAL_ADMIN_KEY ? "mapphex-internal" : "",
  ]
    .map((value) => String(value || ""))
    .filter(Boolean);
  return {
    username: usernames[0] || (isProduction() ? "" : "platform-admin"),
    usernames,
    password: passwords[0] || (isProduction() ? "" : "mapphex-internal"),
    passwords,
  };
};

const verifySuperAdminCredentials = (username, password) => {
  const configured = configuredIdentity();
  const providedUser = String(username || "").trim().toLowerCase();
  const providedPassword = String(password || "");
  return configured.usernames.includes(providedUser) && configured.passwords.includes(providedPassword);
};

const sha256 = (value) => crypto.createHash("sha256").update(String(value || "")).digest("hex");

const verifyStoredSuperAdminCredentials = async (username, password) => {
  try {
    const value = await getStore().get(SUPER_ADMIN_CREDENTIALS_KEY);
    if (!value || typeof value !== "object") return false;
    const providedUser = String(username || "").trim().toLowerCase();
    const providedPassword = String(password || "");
    const usernames = Array.isArray(value.usernames)
      ? value.usernames
      : [value.username, value.email];
    const allowedUsers = usernames.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
    if (!allowedUsers.includes(providedUser)) return false;

    const hash = String(value.passwordHash || value.password_hash || "").trim().toLowerCase();
    if (hash && hash === sha256(providedPassword)) return true;

    const plain = String(value.password || "").trim();
    return !!plain && plain === providedPassword;
  } catch {
    return false;
  }
};

const verifySuperAdminCredentialsAny = async (username, password) =>
  verifySuperAdminCredentials(username, password) || (await verifyStoredSuperAdminCredentials(username, password));

const createSuperAdminSession = (username) => {
  const now = Date.now();
  const claims = {
    sub: String(username || configuredIdentity().username).trim().toLowerCase(),
    role: "super_admin",
    type: "super_admin",
    tenantId: "platform",
    permissions: [
      "platform.monitor",
      "platform.organizations.manage",
      "platform.users.manage",
      "platform.security.read",
      "platform.settings.manage",
      "platform.backups.manage",
      "platform.workflow.manage",
      "platform.permissions.manage",
    ],
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  return { token: encodeSuperAdminToken(claims), session: claims };
};

const getSuperAdminBearer = (req) => decodeSuperAdminToken(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""));

const requireSuperAdmin = (req) => {
  const session = getSuperAdminBearer(req);
  if (session) return session;

  const err = new Error("Super admin authorization required");
  err.statusCode = 403;
  throw err;
};

module.exports = {
  createSuperAdminSession,
  decodeSuperAdminToken,
  getSuperAdminBearer,
  requireSuperAdmin,
  verifySuperAdminCredentials,
  verifySuperAdminCredentialsAny,
};
