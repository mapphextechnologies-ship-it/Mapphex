const { sendJson, readJsonBody } = require("../api/_lib/http");
const { getStore } = require("../api/_lib/kv-store");
const { getTenantId, scopeTenantKey } = require("../api/_lib/tenant");
const { appendEvent } = require("../api/_lib/events");
const { assertIdempotent, assertObject, assertSameOrigin, rateLimit, requireOrgAdmin, requireTenantSession, safeString } = require("../api/_lib/security");
const { hashOrganizationSecret, randomOrganizationToken } = require("./organizations");

const USERS_KEY = "enterprise_org_users_v1";
const SETTINGS_KEY = "enterprise_org_settings_v1";

const { PORTAL_CATALOG, VALID_PORTAL_IDS } = require("../api/_lib/portal-catalog");
const { mergeUniqueStrings, normalizeEmail, normalizeText, uniqueBy } = require("../api/_lib/data-hygiene");
const pricing = require("../bytewave-pricing");
const sanitizeSettings = (settings = {}) => ({
  ...settings,
  installedPortals: (settings.installedPortals || []).filter((id) => VALID_PORTAL_IDS.has(id)),
  modules: (settings.modules || []).filter((id) => VALID_PORTAL_IDS.has(id) || ["dashboard", "orders", "crm", "documents"].includes(id)),
  navigation: (settings.navigation || []).filter((id) => VALID_PORTAL_IDS.has(id)),
  modulePermissions: Object.fromEntries(Object.entries(settings.modulePermissions || {}).filter(([id]) => VALID_PORTAL_IDS.has(id))),
});

const publicUser = (user = {}) => {
  const { activationToken, passwordHash, passwordResetToken, passwordSetupToken, ...safe } = user;
  return safe;
};

module.exports = async (req, res) => {
  try {
    rateLimit(req, { scope: "org-admin", limit: 180, windowMs: 60_000 });
    const store = getStore();
    const body = req.method === "POST" ? assertObject(await readJsonBody(req)) : null;
    const tenantId = getTenantId(req, body);
    const session = requireTenantSession(req, tenantId);
    assertSameOrigin(req);
    const usersKey = scopeTenantKey(tenantId, USERS_KEY);
    const settingsKey = scopeTenantKey(tenantId, SETTINGS_KEY);

    if (req.method === "GET") {
      const role = String(session.role || "").toLowerCase();
      const canManageUsers = ["org_admin", "admin"].includes(role);
      const users = canManageUsers ? uniqueBy((await store.get(usersKey)) || [], (user) => normalizeEmail(user.email || user.username)) : [];
      const settings = sanitizeSettings((await store.get(settingsKey)) || {});
      return sendJson(res, 200, { ok: true, tenantId, users: Array.isArray(users) ? users.map(publicUser) : [], settings, portalCatalog: PORTAL_CATALOG });
    }

    if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    requireOrgAdmin(req, tenantId);
    assertIdempotent(req, body);
    const users = uniqueBy((await store.get(usersKey)) || [], (user) => normalizeEmail(user.email || user.username));
    const settings = sanitizeSettings((await store.get(settingsKey)) || {});

    if (body.action === "add-user") {
      const password = safeString(body.password || body.tempPassword || "", 240);
      const activationToken = randomOrganizationToken("invite");
      const role = safeString(body.role || "staff", 80);
      const roleTemplate = (settings.defaultRoles || []).find((item) => item.id === role) || null;
      const permissions = Array.isArray(body.permissions) && body.permissions.length
        ? body.permissions.map((p) => safeString(p, 80)).filter(Boolean)
        : roleTemplate?.permissions || [];
      const portalAccess = Array.isArray(body.portalAccess) && body.portalAccess.length
        ? body.portalAccess.map((p) => safeString(p, 80)).filter(Boolean)
        : roleTemplate?.portals || [];
      const user = {
        id: `user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: safeString(body.name, 120),
        email: safeString(body.email, 160).toLowerCase(),
        role,
        permissions,
        portalAccess,
        passwordHash: password ? hashOrganizationSecret(password) : "",
        activationToken,
        emailVerified: false,
        status: "active",
        createdAt: new Date().toISOString(),
      };
      if (!user.name || !user.email) return sendJson(res, 400, { ok: false, error: "Name and email are required" });
      if (password.length < 6) return sendJson(res, 400, { ok: false, error: "A 6+ character user password is required" });
      if (users.some((row) => normalizeEmail(row.email || row.username) === normalizeEmail(user.email))) {
        return sendJson(res, 409, { ok: false, error: "User email already exists in this organization" });
      }
      const next = [user, ...(Array.isArray(users) ? users : [])].slice(0, 2000);
      await store.set(usersKey, next);
      await appendEvent(store, tenantId, "org.user.created", { userId: user.id, role: user.role });
      return sendJson(res, 200, { ok: true, user: publicUser(user), activationToken, users: next.map(publicUser) });
    }

    if (body.action === "save-settings") {
      const next = {
        ...settings,
        businessType: safeString(body.businessType || settings.businessType || "retail", 80),
        modules: Array.isArray(body.modules) ? mergeUniqueStrings(body.modules) : mergeUniqueStrings(settings.modules || []),
        branches: uniqueBy(Array.isArray(body.branches) ? body.branches.map((b) => normalizeText(b, 120)).filter(Boolean) : settings.branches || [], (value) => value),
        departments: uniqueBy(Array.isArray(body.departments) ? body.departments.map((d) => normalizeText(d, 120)).filter(Boolean) : settings.departments || [], (value) => value),
        updatedAt: new Date().toISOString(),
      };
      await store.set(settingsKey, next);
      await appendEvent(store, tenantId, "org.settings.updated", { modules: next.modules.length });
      return sendJson(res, 200, { ok: true, settings: next });
    }

    if (body.action === "accept-agreement") {
      const accepted = body.accepted === true || body.accepted === "true";
      if (!accepted) return sendJson(res, 400, { ok: false, error: "Agreement acceptance is required" });
      const next = {
        ...settings,
        agreementAccepted: true,
        agreementAcceptedAt: new Date().toISOString(),
        subscriptionPlan: safeString(body.subscriptionPlan || settings.subscriptionPlan || "business-monthly", 80),
        supportPackage: safeString(body.supportPackage || settings.supportPackage || "standard", 80),
      };
      await store.set(settingsKey, next);
      await appendEvent(store, tenantId, "org.agreement.accepted", { subscriptionPlan: next.subscriptionPlan });
      return sendJson(res, 200, { ok: true, settings: next });
    }

    if (body.action === "install-portal" || body.action === "install-portals") {
      const requested = body.action === "install-portals" && Array.isArray(body.portalIds) ? body.portalIds : [body.portalId];
      const portalIds = Array.from(new Set(requested.map((id) => safeString(id, 80)).filter((id) => VALID_PORTAL_IDS.has(id))));
      const portals = portalIds.map((portalId) => PORTAL_CATALOG.find((item) => item.id === portalId)).filter(Boolean);
      if (!portals.length || portals.length !== portalIds.length) return sendJson(res, 404, { ok: false, error: "One or more portals were not found" });
      if (settings.agreementAccepted !== true) return sendJson(res, 403, { ok: false, error: "Accept licensing terms before installing portals" });
      const installedPortals = mergeUniqueStrings(settings.installedPortals || [], portalIds).filter((id) => VALID_PORTAL_IDS.has(id));
      const modules = mergeUniqueStrings(settings.modules || [], portalIds);
      const modulePermissions = { ...(settings.modulePermissions || {}) };
      portalIds.forEach((portalId) => {
        modulePermissions[portalId] = Array.from(new Set([`${portalId}.read`, `${portalId}.manage`]));
      });
      const navigation = mergeUniqueStrings(settings.navigation || [], portalIds).filter((id) => VALID_PORTAL_IDS.has(id));
      const portalPricing = {
        ...(settings.portalPricing || {}),
        ...Object.fromEntries(portalIds.map((id) => [id, Math.max(0, Number(body.portalPricing?.[id] ?? pricing.priceFor(id)) || 0)])),
      };
      const monthlyAmount = installedPortals.reduce((sum, id) => sum + Math.max(0, Number(portalPricing[id] ?? pricing.priceFor(id)) || 0), 0);
      const next = {
        ...settings,
        installedPortals,
        modules,
        modulePermissions,
        navigation,
        selectedComponents: installedPortals,
        portalPricing,
        monthlyAmount,
        estimatedTotal: monthlyAmount,
        onboardingComplete: installedPortals.length > 0,
        updatedAt: new Date().toISOString(),
      };
      await store.set(settingsKey, next);
      await appendEvent(store, tenantId, "org.modules.enabled", {
        portalIds,
        count: portalIds.length,
        titles: portals.map((portal) => portal.title),
        sharedWorkspace: true,
      });
      return sendJson(res, 200, { ok: true, portal: portals[0], portals, settings: next });
    }

    if (body.action === "uninstall-portal" || body.action === "uninstall-portals") {
      const requested = body.action === "uninstall-portals" && Array.isArray(body.portalIds) ? body.portalIds : [body.portalId];
      const portalIds = Array.from(new Set(requested.map((id) => safeString(id, 80)).filter((id) => VALID_PORTAL_IDS.has(id))));
      if (!portalIds.length) return sendJson(res, 404, { ok: false, error: "One or more portals were not found" });
      const remove = new Set(portalIds);
      const modulePermissions = { ...(settings.modulePermissions || {}) };
      portalIds.forEach((portalId) => delete modulePermissions[portalId]);
      const next = {
        ...settings,
        installedPortals: (settings.installedPortals || []).filter((id) => !remove.has(id)),
        modules: (settings.modules || []).filter((id) => !remove.has(id)),
        navigation: (settings.navigation || []).filter((id) => !remove.has(id)),
        modulePermissions,
        updatedAt: new Date().toISOString(),
      };
      next.selectedComponents = next.installedPortals;
      next.monthlyAmount = next.installedPortals.reduce((sum, id) => sum + Math.max(0, Number(next.portalPricing?.[id] ?? pricing.priceFor(id)) || 0), 0);
      next.estimatedTotal = next.monthlyAmount;
      await store.set(settingsKey, next);
      await appendEvent(store, tenantId, "org.modules.disabled", { portalIds, count: portalIds.length });
      return sendJson(res, 200, { ok: true, settings: next });
    }

    return sendJson(res, 400, { ok: false, error: "Unsupported org admin action" });
  } catch (err) {
    return sendJson(res, Number(err?.statusCode || 500), { ok: false, error: err?.message || "Server error" });
  }
};
