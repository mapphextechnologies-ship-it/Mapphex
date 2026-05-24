const { sendJson, readJsonBody } = require("../api/_lib/http");
const { getStore } = require("../api/_lib/kv-store");
const { getTenantId, scopeTenantKey } = require("../api/_lib/tenant");
const { appendEvent, clearEvents } = require("../api/_lib/events");
const { assertIdempotent, assertObject, assertSameOrigin, rateLimit, requireActiveOrgAdmin, requireActiveTenantSession, safeString } = require("../api/_lib/security");
const { hashOrganizationSecret, randomOrganizationToken } = require("./organizations");

const USERS_KEY = "enterprise_org_users_v1";
const SETTINGS_KEY = "enterprise_org_settings_v1";
const NOTIFICATIONS_KEY = "enterprise_notifications_v1";
const ANNOUNCEMENTS_KEY = "enterprise_announcements_v1";
const AUDIT_KEY = "enterprise_audit_v1";
const ACTIVITY_KEY = "enterprise_module_activity_v1";
const MESSAGES_KEY = "enterprise_messages_v1";
const REPORTS_KEY = "enterprise_reports_v1";

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

const makeAnnouncement = (body, actor, scope = "organization") => ({
  id: `ann-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  title: safeString(body.title || "Announcement", 160),
  body: safeString(body.body || body.message || "", 2000),
  priority: safeString(body.priority || "normal", 40),
  portals: Array.isArray(body.portals) ? body.portals.map((id) => safeString(id, 80)).filter(Boolean) : [],
  departments: Array.isArray(body.departments) ? body.departments.map((id) => safeString(id, 120)).filter(Boolean) : [],
  expiresAt: safeString(body.expiresAt || "", 80),
  attachmentUrl: safeString(body.attachmentUrl || "", 500),
  format: safeString(body.format || "plain", 40),
  scope,
  actor: safeString(actor || "system", 160),
  createdAt: new Date().toISOString(),
});

const readArray = async (store, key) => {
  const value = (await store.get(key)) || [];
  return Array.isArray(value) ? value : [];
};

module.exports = async (req, res) => {
  try {
    rateLimit(req, { scope: "org-admin", limit: 180, windowMs: 60_000 });
    const store = getStore();
    const body = req.method === "POST" ? assertObject(await readJsonBody(req)) : null;
    const tenantId = getTenantId(req, body);
    const session = await requireActiveTenantSession(req, tenantId);
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
    await requireActiveOrgAdmin(req, tenantId);
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

    if (body.action === "update-user") {
      const userId = safeString(body.userId || body.id, 120);
      const idx = users.findIndex((user) => user.id === userId);
      if (idx < 0) return sendJson(res, 404, { ok: false, error: "User not found" });
      const role = safeString(body.role || users[idx].role || "staff", 80);
      const roleTemplate = (settings.defaultRoles || []).find((item) => item.id === role) || null;
      const portalAccess = Array.isArray(body.portalAccess)
        ? mergeUniqueStrings(body.portalAccess).filter((id) => VALID_PORTAL_IDS.has(id))
        : mergeUniqueStrings(users[idx].portalAccess || roleTemplate?.portals || []).filter((id) => VALID_PORTAL_IDS.has(id));
      const permissions = Array.isArray(body.permissions)
        ? body.permissions.map((p) => safeString(p, 80)).filter(Boolean)
        : users[idx].permissions || roleTemplate?.permissions || [];
      const status = safeString(body.status || users[idx].status || "active", 40);
      if (!["active", "disabled", "invited", "pending"].includes(status)) return sendJson(res, 400, { ok: false, error: "Invalid user status" });
      const next = [...users];
      next[idx] = {
        ...next[idx],
        role,
        permissions,
        portalAccess,
        status,
        updatedAt: new Date().toISOString(),
      };
      await store.set(usersKey, next);
      await appendEvent(store, tenantId, "org.user.updated", { userId, role, status, portalAccess });
      return sendJson(res, 200, { ok: true, user: publicUser(next[idx]), users: next.map(publicUser) });
    }

    if (body.action === "set-user-status") {
      const userId = safeString(body.userId || body.id, 120);
      const status = safeString(body.status || "active", 40);
      if (!["active", "disabled", "invited", "pending"].includes(status)) return sendJson(res, 400, { ok: false, error: "Invalid user status" });
      const idx = users.findIndex((user) => user.id === userId);
      if (idx < 0) return sendJson(res, 404, { ok: false, error: "User not found" });
      const next = [...users];
      next[idx] = { ...next[idx], status, updatedAt: new Date().toISOString() };
      await store.set(usersKey, next);
      await appendEvent(store, tenantId, "org.user.status.changed", { userId, status });
      return sendJson(res, 200, { ok: true, user: publicUser(next[idx]), users: next.map(publicUser) });
    }

    if (body.action === "delete-user") {
      const userId = safeString(body.userId || body.id, 120);
      const idx = users.findIndex((user) => user.id === userId);
      if (idx < 0) return sendJson(res, 404, { ok: false, error: "User not found" });
      if (
        String(users[idx].id || "") === String(session.userId || "") ||
        normalizeEmail(users[idx].email || users[idx].username) === normalizeEmail(session.sub || session.email)
      ) {
        return sendJson(res, 400, { ok: false, error: "You cannot delete your own admin account" });
      }
      const activeAdmins = users.filter((user) => ["org_admin", "admin"].includes(String(user.role || "").toLowerCase()) && user.status !== "disabled");
      if (["org_admin", "admin"].includes(String(users[idx].role || "").toLowerCase()) && activeAdmins.length <= 1) {
        return sendJson(res, 400, { ok: false, error: "At least one active organization admin is required" });
      }
      const next = users.filter((user) => user.id !== userId);
      await store.set(usersKey, next);
      await appendEvent(store, tenantId, "org.user.deleted", { userId, email: users[idx].email });
      return sendJson(res, 200, { ok: true, deleted: userId, users: next.map(publicUser) });
    }

    if (body.action === "issue-user-invite" || body.action === "issue-password-reset") {
      const userId = safeString(body.userId || body.id, 120);
      const idx = users.findIndex((user) => user.id === userId);
      if (idx < 0) return sendJson(res, 404, { ok: false, error: "User not found" });
      const token = randomOrganizationToken(body.action === "issue-password-reset" ? "reset" : "invite");
      const next = [...users];
      next[idx] =
        body.action === "issue-password-reset"
          ? { ...next[idx], passwordResetToken: token, passwordResetRequestedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
          : { ...next[idx], activationToken: token, status: "invited", updatedAt: new Date().toISOString() };
      await store.set(usersKey, next);
      await appendEvent(store, tenantId, body.action === "issue-password-reset" ? "org.user.password_reset.issued" : "org.user.invite.issued", { userId });
      return sendJson(res, 200, { ok: true, token, user: publicUser(next[idx]), users: next.map(publicUser) });
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
      if (portalIds.includes("admin")) return sendJson(res, 400, { ok: false, error: "The admin portal is required and cannot be uninstalled" });
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

    if (body.action === "send-announcement") {
      const announcement = makeAnnouncement(body, session.sub || session.email || session.role);
      const announcementsKey = scopeTenantKey(tenantId, ANNOUNCEMENTS_KEY);
      const notificationsKey = scopeTenantKey(tenantId, NOTIFICATIONS_KEY);
      const [announcements, notifications] = await Promise.all([readArray(store, announcementsKey), readArray(store, notificationsKey)]);
      const notification = {
        id: `ntf-${announcement.id}`,
        at: announcement.createdAt,
        moduleId: announcement.portals[0] || "admin",
        title: announcement.title,
        body: announcement.body,
        priority: announcement.priority,
        read: false,
        payload: { announcementId: announcement.id, portals: announcement.portals, departments: announcement.departments },
      };
      await store.setManyAtomic({
        [announcementsKey]: [announcement, ...announcements].slice(0, 500),
        [notificationsKey]: [notification, ...notifications].slice(0, 1000),
      });
      await appendEvent(store, tenantId, "org.announcement.sent", { announcementId: announcement.id, title: announcement.title, priority: announcement.priority });
      return sendJson(res, 200, { ok: true, announcement });
    }

    if (["delete-notification", "clear-notifications", "delete-audit-log", "clear-audit-logs", "delete-activity", "clear-activity", "clear-live-activity", "delete-message", "clear-messages", "delete-report", "clear-reports", "delete-branch"].includes(body.action)) {
      const keyMap = {
        "delete-notification": NOTIFICATIONS_KEY,
        "clear-notifications": NOTIFICATIONS_KEY,
        "delete-audit-log": AUDIT_KEY,
        "clear-audit-logs": AUDIT_KEY,
        "delete-activity": ACTIVITY_KEY,
        "clear-activity": ACTIVITY_KEY,
        "delete-message": MESSAGES_KEY,
        "clear-messages": MESSAGES_KEY,
        "delete-report": REPORTS_KEY,
        "clear-reports": REPORTS_KEY,
      };
      if (body.action === "delete-branch") {
        const name = normalizeText(body.name || body.branch || "", 120).toLowerCase();
        const next = { ...settings, branches: (settings.branches || []).filter((branch) => normalizeText(branch, 120).toLowerCase() !== name), updatedAt: new Date().toISOString() };
        await store.set(settingsKey, next);
        await appendEvent(store, tenantId, "org.branch.deleted", { name });
        return sendJson(res, 200, { ok: true, settings: next });
      }
      if (body.action === "clear-live-activity") {
        await clearEvents(store, tenantId);
        await appendEvent(store, tenantId, "org.live_activity.cleared", { actor: session.sub });
        return sendJson(res, 200, { ok: true });
      }
      const keyName = keyMap[body.action];
      const scopedKey = scopeTenantKey(tenantId, keyName);
      if (body.action.startsWith("clear-")) {
        await store.set(scopedKey, keyName === REPORTS_KEY ? {} : []);
        await appendEvent(store, tenantId, `org.${body.action}`, { actor: session.sub });
        return sendJson(res, 200, { ok: true });
      }
      const id = safeString(body.id, 180);
      if (!id) return sendJson(res, 400, { ok: false, error: "Record id is required" });
      const current = await store.get(scopedKey);
      if (keyName === REPORTS_KEY && current && typeof current === "object" && !Array.isArray(current)) {
        const next = { ...current };
        delete next[id];
        await store.set(scopedKey, next);
      } else {
        const rows = await readArray(store, scopedKey);
        await store.set(scopedKey, rows.filter((row) => String(row.id || row.seq || "") !== id));
      }
      await appendEvent(store, tenantId, `org.${body.action}`, { id, actor: session.sub });
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 400, { ok: false, error: "Unsupported org admin action" });
  } catch (err) {
    return sendJson(res, Number(err?.statusCode || 500), { ok: false, error: err?.message || "Server error" });
  }
};
