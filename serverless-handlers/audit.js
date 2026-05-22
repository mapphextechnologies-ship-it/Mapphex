const { sendJson, readJsonBody } = require("../api/_lib/http");
const { getStore } = require("../api/_lib/kv-store");
const { getTenantId, scopeTenantKey } = require("../api/_lib/tenant");
const { assertIdempotent, assertObject, assertSameOrigin, rateLimit, requireActiveTenantSession, safeString } = require("../api/_lib/security");

const AUDIT_KEY = "enterprise_audit_v1";

module.exports = async (req, res) => {
  try {
    rateLimit(req, { scope: "audit", limit: 180, windowMs: 60_000 });
    const body = req.method === "POST" ? assertObject(await readJsonBody(req)) : null;
    const tenantId = getTenantId(req, body);
    await requireActiveTenantSession(req, tenantId);
    const key = scopeTenantKey(tenantId, AUDIT_KEY);
    const store = getStore();
    const rows = (await store.get(key)) || [];

    if (req.method === "GET") return sendJson(res, 200, { ok: true, tenantId, audit: Array.isArray(rows) ? rows.slice(-500) : [] });
    if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    assertSameOrigin(req);
    assertIdempotent(req, body);

    const entry = {
      id: `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      at: new Date().toISOString(),
      tenantId,
      actor: safeString(body.actor || "system", 160),
      action: safeString(body.action || "event", 160),
      detail: body.detail && typeof body.detail === "object" && !Array.isArray(body.detail) ? body.detail : {},
    };
    await store.set(key, [...(Array.isArray(rows) ? rows : []), entry].slice(-2000));
    return sendJson(res, 200, { ok: true, entry });
  } catch (err) {
    return sendJson(res, Number(err?.statusCode || 500), { ok: false, error: err?.message || "Server error" });
  }
};
