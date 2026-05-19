const { sendJson, readJsonBody } = require("../../api/_lib/http");
const { appendEvent } = require("../../api/_lib/events");
const { getStore } = require("../../api/_lib/kv-store");
const { assertObject, assertSameOrigin, rateLimit, safeString } = require("../../api/_lib/security");
const {
  createSuperAdminSession,
  getSuperAdminBearer,
  requireSuperAdmin,
  verifySuperAdminCredentials,
} = require("../../api/_lib/super-admin-auth");

const cookieAttrs = "HttpOnly; SameSite=Strict; Path=/_internal/mapphex-control; Max-Age=14400";

module.exports = async (req, res) => {
  try {
    rateLimit(req, { scope: "super-admin-session", limit: 60, windowMs: 60_000 });

    if (req.method === "POST") {
      assertSameOrigin(req);
      const body = assertObject(await readJsonBody(req));
      const username = safeString(body.username || body.email, 160).toLowerCase();
      const password = String(body.password || "");
      if (!verifySuperAdminCredentials(username, password)) {
        await appendEvent(getStore(), "platform", "super_admin.login.failed", { username });
        return sendJson(res, 401, { ok: false, error: "Invalid Super Admin credentials" });
      }
      const session = createSuperAdminSession(username);
      await appendEvent(getStore(), "platform", "super_admin.login.succeeded", { username });
      res.setHeader("Set-Cookie", `mapphex_super_admin=${session.token}; ${cookieAttrs}`);
      return sendJson(res, 200, { ok: true, ...session });
    }

    if (req.method === "GET") {
      const session = getSuperAdminBearer(req);
      return sendJson(res, session ? 200 : 401, session ? { ok: true, session } : { ok: false, error: "Invalid Super Admin session" });
    }

    if (req.method === "DELETE") {
      const session = requireSuperAdmin(req);
      await appendEvent(getStore(), "platform", "super_admin.logout", { username: session.sub });
      res.setHeader("Set-Cookie", "mapphex_super_admin=; HttpOnly; SameSite=Strict; Path=/_internal/mapphex-control; Max-Age=0");
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  } catch (err) {
    return sendJson(res, Number(err?.statusCode || 500), { ok: false, error: err?.message || "Server error" });
  }
};
