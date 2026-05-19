const { sendJson, readJsonBody } = require("../api/_lib/http");
const { getStore } = require("../api/_lib/kv-store");
const { getTenantId } = require("../api/_lib/tenant");
const { appendEvent, listEvents } = require("../api/_lib/events");
const { assertObject, rateLimit, requireTenantSession, safeString } = require("../api/_lib/security");

const visibleEvent = (event) => !String(event?.type || "").startsWith("kv.");

const cleanEvent = (event) => {
  const payload = event?.payload || {};
  const messages = {
    "organization.workspace.created": `${payload.name || "Organization"} workspace is ready.`,
    "org.agreement.accepted": `Subscription plan: ${payload.subscriptionPlan || "selected plan"}.`,
    "org.modules.enabled": `${payload.count || payload.portalIds?.length || 0} portal${Number(payload.count || payload.portalIds?.length || 0) === 1 ? "" : "s"} installed: ${(payload.titles || payload.portalIds || []).join(", ")}.`,
    "org.modules.disabled": `Removed ${(payload.portalIds || []).join(", ") || "selected portal"} from the workspace.`,
    "org.user.created": `Added ${payload.role || "user"} account.`,
    "org.settings.updated": "Organization settings updated.",
    "erp.message.sent": `Message sent from ${payload.from || "one department"} to ${payload.to || "another department"}.`,
  };
  return {
    ...event,
    displayType: {
      "organization.workspace.created": "Workspace created",
      "org.agreement.accepted": "Agreement accepted",
      "org.modules.enabled": "Portals installed",
      "org.modules.disabled": "Portal uninstalled",
      "org.user.created": "User added",
      "org.settings.updated": "Settings updated",
      "erp.message.sent": "Department message sent",
    }[event.type] || String(event.type || "Activity").replace(/\./g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
    displayMessage: messages[event.type] || payload.message || payload.detail || "Activity recorded.",
  };
};

module.exports = async (req, res) => {
  try {
    rateLimit(req, { scope: "realtime", limit: 300, windowMs: 60_000 });
    const store = getStore();

    if (req.method === "GET") {
      const tenantId = getTenantId(req);
      requireTenantSession(req, tenantId);
      const after = Number(req.query?.after || 0) || 0;
      const events = (await listEvents(store, tenantId, after)).filter(visibleEvent).map(cleanEvent);
      return sendJson(res, 200, { ok: true, tenantId, events });
    }

    if (req.method === "POST") {
      const body = assertObject(await readJsonBody(req));
      const tenantId = getTenantId(req, body);
      requireTenantSession(req, tenantId);
      const event = await appendEvent(store, tenantId, safeString(body.type || "notification", 80), body.payload || {});
      return sendJson(res, 200, { ok: true, event });
    }

    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  } catch (err) {
    return sendJson(res, Number(err?.statusCode || 500), { ok: false, error: err?.message || "Server error" });
  }
};
