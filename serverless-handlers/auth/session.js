const crypto = require("crypto");
const { sendJson, readJsonBody } = require("../../api/_lib/http");
const { getTenantId, scopeTenantKey } = require("../../api/_lib/tenant");
const { getStore } = require("../../api/_lib/kv-store");
const { appendEvent } = require("../../api/_lib/events");
const {
  AUTH_ACTIVITY_KEY,
  SESSION_DEVICES_KEY,
  hashOrganizationSecret,
  randomOrganizationToken,
  verifyOrganizationAdmin,
  verifyOrganizationUser,
} = require("../organizations");
const { assertSameOrigin, decodeSessionToken, rateLimit, requireActiveTenantSession } = require("../../api/_lib/security");

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const isProduction = () => process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

const secret = () => {
  const value = process.env.SESSION_SECRET || process.env.AUTH_SECRET;
  if (value) return value;
  if (!isProduction()) return "development-session-secret";
  const err = new Error("SESSION_SECRET is required in production");
  err.statusCode = 500;
  throw err;
};

const sign = (payload) =>
  crypto.createHmac("sha256", secret()).update(payload).digest("base64url");

const encodeToken = (claims) => {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload)}`;
};

const ORGS_KEY = "platform_organizations_v1";
const USERS_KEY = "enterprise_org_users_v1";

const clientDevice = (req) => ({
  ip: String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket?.remoteAddress || "").split(",")[0].trim(),
  userAgent: String(req.headers["user-agent"] || "").slice(0, 240),
});

const recordAuthActivity = async (store, tenantId, entry) => {
  const key = scopeTenantKey(tenantId, AUTH_ACTIVITY_KEY);
  const rows = (await store.get(key)) || [];
  await store.set(key, [...(Array.isArray(rows) ? rows : []), { id: `auth-${Date.now()}-${crypto.randomBytes(5).toString("hex")}`, at: new Date().toISOString(), tenantId, ...entry }].slice(-1000));
};

const recordSessionDevice = async (store, tenantId, claims, req) => {
  const key = scopeTenantKey(tenantId, SESSION_DEVICES_KEY);
  const rows = (await store.get(key)) || [];
  const device = clientDevice(req);
  await store.set(key, [
    ...(Array.isArray(rows) ? rows : []),
    {
      id: `session-${claims.iat}-${crypto.randomBytes(5).toString("hex")}`,
      userId: claims.userId,
      email: claims.sub,
      role: claims.role,
      issuedAt: new Date(claims.iat).toISOString(),
      expiresAt: new Date(claims.exp).toISOString(),
      ...device,
    },
  ].slice(-500));
};

const findUserForToken = async (store, token) => {
  const rows = (await store.get(ORGS_KEY)) || [];
  for (const org of Array.isArray(rows) ? rows : []) {
    const usersKey = scopeTenantKey(org.id, USERS_KEY);
    const users = (await store.get(usersKey)) || [];
    const idx = (Array.isArray(users) ? users : []).findIndex((user) => user.activationToken === token || user.passwordResetToken === token || user.passwordSetupToken === token);
    if (idx >= 0) return { org, usersKey, users, idx, user: users[idx] };
  }
  return null;
};

module.exports = async (req, res) => {
  try {
    rateLimit(req, { scope: "auth-session", limit: 80, windowMs: 60_000 });
    assertSameOrigin(req);
    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const store = getStore();
      const action = String(body?.action || "organization-login").trim().toLowerCase();

      if (action === "activate-invite" || action === "reset-password") {
        const token = String(body?.token || "").trim();
        const password = String(body?.password || "");
        if (!token || password.length < 8) return sendJson(res, 400, { ok: false, error: "Valid token and 8+ character password are required" });
        const match = await findUserForToken(store, token);
        if (!match) return sendJson(res, 404, { ok: false, error: "Invalid or expired token" });
        const nextUser = {
          ...match.user,
          passwordHash: hashOrganizationSecret(password),
          activationToken: "",
          passwordResetToken: "",
          passwordSetupToken: "",
          emailVerified: true,
          status: "active",
          activatedAt: new Date().toISOString(),
        };
        const nextUsers = [...match.users];
        nextUsers[match.idx] = nextUser;
        await store.set(match.usersKey, nextUsers);
        await recordAuthActivity(store, match.org.id, { type: "user.activated", userId: nextUser.id, email: nextUser.email, role: nextUser.role });
        await appendEvent(store, match.org.id, "auth.user.activated", { userId: nextUser.id, role: nextUser.role });
        return sendJson(res, 200, { ok: true, tenantId: match.org.id });
      }

      if (action === "request-password-reset") {
        const identifier = String(body?.identifier || body?.tenantId || "").trim().toLowerCase();
        const email = String(body?.email || "").trim().toLowerCase();
        const rows = (await store.get(ORGS_KEY)) || [];
        const org = (Array.isArray(rows) ? rows : []).find(
          (row) =>
            row.id === identifier ||
            String(row.organizationId || "").toLowerCase() === identifier ||
            String(row.referenceCode || "").toLowerCase() === identifier ||
            String(row.admin?.email || "").toLowerCase() === identifier ||
            String(row.contact?.email || "").toLowerCase() === identifier,
        );
        if (org && email) {
          const usersKey = scopeTenantKey(org.id, USERS_KEY);
          const users = (await store.get(usersKey)) || [];
          const idx = (Array.isArray(users) ? users : []).findIndex((user) => String(user.email || "").toLowerCase() === email);
          if (idx >= 0) {
            const nextUsers = [...users];
            nextUsers[idx] = { ...nextUsers[idx], passwordResetToken: randomOrganizationToken("reset"), passwordResetRequestedAt: new Date().toISOString() };
            await store.set(usersKey, nextUsers);
            await recordAuthActivity(store, org.id, { type: "password.reset.requested", userId: nextUsers[idx].id, email, portalId: body?.portalId || "" });
          }
        }
        return sendJson(res, 200, { ok: true });
      }

      const requestedRole = String(body?.role || "org_admin").trim().toLowerCase();
      const role = ["super_admin", "platform_admin"].includes(requestedRole) ? "org_admin" : requestedRole;
      const identifier = String(body?.identifier || body?.tenantId || body?.email || body?.username || "").trim();
      const email = String(body?.email || body?.username || body?.identifier || "").trim().toLowerCase();
      const organizationName = String(body?.organizationName || body?.name || "").trim();
      if (!organizationName || !identifier || !body?.password) {
        return sendJson(res, 400, { ok: false, error: "Organization name, organization email or ID, and password are required" });
      }
      let tenantId = getTenantId(req, body);
      let organization = await verifyOrganizationAdmin(identifier || tenantId, email, body?.password, organizationName);
      let user = null;
      if (!organization) {
        const userMatch = await verifyOrganizationUser(identifier || tenantId, email, body?.password, organizationName);
        organization = userMatch?.organization || null;
        user = userMatch?.user || null;
      }
      if (!organization) {
        await recordAuthActivity(store, tenantId, { type: "login.failed", email, portalId: body?.portalId || "", ...clientDevice(req) }).catch(() => null);
        return sendJson(res, 401, { ok: false, error: "Invalid organization credentials" });
      }
      tenantId = organization.id;
      const now = Date.now();
      const effectiveRole = user?.role || role;
      const claims = {
        sub: user?.email || organization?.admin?.email || email || identifier.toLowerCase(),
        userId: user?.id || "organization-admin",
        role: effectiveRole,
        permissions: Array.isArray(user?.permissions) ? user.permissions : effectiveRole === "org_admin" ? ["*"] : [],
        portalAccess: Array.isArray(user?.portalAccess) ? user.portalAccess : [],
        tenantId,
        organizationId: organization?.organizationId,
        iat: now,
        exp: now + SESSION_TTL_MS,
      };
      const token = encodeToken(claims);
      await recordAuthActivity(store, tenantId, { type: "login.success", userId: claims.userId, email: claims.sub, role: claims.role, portalId: body?.portalId || "", ...clientDevice(req) });
      await recordSessionDevice(store, tenantId, claims, req);
      await appendEvent(store, tenantId, "auth.login.success", { userId: claims.userId, role: claims.role, portalId: body?.portalId || "" });
      return sendJson(res, 200, { ok: true, token, session: claims, organization });
    }

    if (req.method === "GET") {
      const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      const session = decodeSessionToken(token);
      if (!session) return sendJson(res, 401, { ok: false, error: "Invalid session" });
      await requireActiveTenantSession(req, session.tenantId);
      return sendJson(res, 200, { ok: true, session });
    }

    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  } catch {
    return sendJson(res, 500, { ok: false, error: "Server error" });
  }
};
