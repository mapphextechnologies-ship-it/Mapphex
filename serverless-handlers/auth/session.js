const crypto = require("crypto");
const { sendJson, readJsonBody } = require("../../api/_lib/http");
const { getTenantId } = require("../../api/_lib/tenant");
const { verifyOrganizationAdmin, verifyOrganizationUser } = require("../organizations");
const { decodeSessionToken } = require("../../api/_lib/security");

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const secret = () => process.env.SESSION_SECRET || process.env.AUTH_SECRET || "development-session-secret";

const sign = (payload) =>
  crypto.createHmac("sha256", secret()).update(payload).digest("base64url");

const encodeToken = (claims) => {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload)}`;
};

module.exports = async (req, res) => {
  try {
    if (req.method === "POST") {
      const body = await readJsonBody(req);
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
      if (!organization) return sendJson(res, 401, { ok: false, error: "Invalid organization credentials" });
      tenantId = organization.id;
      const now = Date.now();
      const effectiveRole = user?.role || role;
      const claims = {
        sub: user?.email || organization?.admin?.email || email || identifier.toLowerCase(),
        userId: user?.id || "organization-admin",
        role: effectiveRole,
        permissions: Array.isArray(user?.permissions) ? user.permissions : effectiveRole === "org_admin" ? ["*"] : [],
        tenantId,
        organizationId: organization?.organizationId,
        iat: now,
        exp: now + SESSION_TTL_MS,
      };
      return sendJson(res, 200, { ok: true, token: encodeToken(claims), session: claims, organization });
    }

    if (req.method === "GET") {
      const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      const session = decodeSessionToken(token);
      return sendJson(res, session ? 200 : 401, session ? { ok: true, session } : { ok: false, error: "Invalid session" });
    }

    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  } catch {
    return sendJson(res, 500, { ok: false, error: "Server error" });
  }
};
