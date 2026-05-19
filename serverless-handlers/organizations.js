const crypto = require("crypto");
const { sendJson, readJsonBody } = require("../api/_lib/http");
const { getStore } = require("../api/_lib/kv-store");
const { cleanTenantId, getTenantId, scopeTenantKey } = require("../api/_lib/tenant");
const { appendEvent, listEvents } = require("../api/_lib/events");
const { assertIdempotent, assertObject, assertSameOrigin, rateLimit, requireTenantSession, safeString } = require("../api/_lib/security");
const { requireSuperAdmin } = require("../api/_lib/super-admin-auth");
const { VALID_PORTAL_IDS } = require("../api/_lib/portal-catalog");
const pricing = require("../bytewave-pricing");

const ORGS_KEY = "platform_organizations_v1";
const USERS_KEY = "enterprise_org_users_v1";
const PROFILE_KEY = "enterprise_org_profile_v1";
const SETTINGS_KEY = "enterprise_org_settings_v1";
const INVITES_KEY = "enterprise_user_invites_v1";
const AUTH_ACTIVITY_KEY = "enterprise_auth_activity_v1";
const SESSION_DEVICES_KEY = "enterprise_session_devices_v1";
const BASE_PORTALS = ["admin", "staff", "reporting"];
const SERVICE_PORTALS = {
  company: ["admin", "departments", "staff", "reporting"],
  agency: ["admin", "staff", "customer", "sales", "reporting"],
  corporate: ["admin", "branch", "departments", "hr", "finance", "procurement", "customer", "reporting", "analytics"],
  service: ["admin", "staff", "customer", "sales", "reporting"],
  "business-onboarding": ["admin", "staff", "customer", "reporting"],
  "organization-setup": ["admin", "branch", "departments", "staff", "reporting"],
  "licensing-subscriptions": ["admin", "finance", "reporting"],
  "security-services": ["admin", "departments", "staff", "reporting"],
  "support-training": ["admin", "staff", "customer", "reporting"],
  "cloud-hosting": ["admin", "technology", "customer", "finance", "staff", "reporting", "analytics"],
  "data-migration": ["admin", "inventory", "staff", "reporting", "analytics"],
  "finance-management": ["admin", "finance", "reporting", "analytics"],
  "hr-staff-access": ["admin", "hr", "departments", "staff", "reporting"],
  "retail-pos": ["admin", "branch", "retail", "inventory", "sales", "finance", "procurement", "customer", "reporting"],
  "inventory-control": ["admin", "branch", "inventory", "reporting", "analytics"],
  "crm-workflows": ["admin", "customer", "sales", "staff", "reporting"],
  "document-management": ["admin", "staff", "reporting"],
  "reporting-tools": ["admin", "reporting", "analytics"],
  "pharmacy-operations": ["admin", "branch", "pharmacy", "inventory", "sales", "finance", "procurement", "customer", "reporting"],
  "school-management": ["admin", "academic", "departments", "hr", "finance", "customer", "staff", "reporting"],
  "logistics-tracking": ["admin", "branch", "logistics", "inventory", "finance", "customer", "reporting", "analytics"],
  "branch-management": ["admin", "branch", "staff", "reporting", "analytics"],
  "warehouse-control": ["admin", "branch", "inventory", "logistics", "reporting"],
  "supplier-records": ["admin", "procurement", "inventory", "finance", "reporting"],
  "analytics-dashboard": ["admin", "reporting", "analytics"],
  "task-management": ["admin", "staff", "departments", "reporting"],
  "role-permissions": ["admin", "departments", "staff", "reporting"],
  "audit-trails": ["admin", "reporting", "analytics"],
  notifications: ["admin", "staff", "customer", "reporting"],
  "multi-branch-reports": ["admin", "branch", "reporting", "analytics"],
  "subscription-review": ["admin", "finance", "reporting"],
  "customer-support-desk": ["admin", "customer", "staff", "reporting"],
  retail: ["admin", "branch", "retail", "inventory", "sales", "finance", "procurement", "customer", "reporting"],
  manufacturing: ["admin", "manufacturing", "inventory", "procurement", "finance", "sales", "logistics", "reporting", "analytics"],
  ngo: ["admin", "finance", "hr", "procurement", "customer", "reporting", "analytics"],
  government: ["admin", "finance", "hr", "procurement", "customer", "reporting", "analytics"],
  startup: ["admin", "technology", "sales", "finance", "customer", "hr", "reporting"],
  "book-store": ["admin", "inventory", "sales", "finance", "reporting"],
  "clothing-store": ["admin", "inventory", "sales", "customer", "reporting"],
  "furniture-store": ["admin", "inventory", "sales", "customer", "logistics", "reporting"],
  "grocery-store": ["admin", "inventory", "sales", "finance", "reporting"],
  "hardware-shop": ["admin", "branch", "inventory", "sales", "finance", "procurement", "customer", "reporting"],
  wholesale: ["admin", "branch", "inventory", "sales", "finance", "logistics", "reporting"],
  supermarket: ["admin", "branch", "inventory", "sales", "finance", "hr", "reporting"],
  "mini-supermarket": ["admin", "inventory", "sales", "finance", "reporting"],
  warehouse: ["admin", "branch", "inventory", "logistics", "reporting"],
  restaurant: ["admin", "restaurant", "inventory", "sales", "finance", "procurement", "staff", "reporting"],
  "fast-food": ["admin", "restaurant", "inventory", "sales", "finance", "staff", "reporting"],
  hotels: ["admin", "branch", "customer", "finance", "hr", "staff", "reporting"],
  "guest-house": ["admin", "customer", "finance", "staff", "reporting"],
  "bar-pub": ["admin", "inventory", "sales", "finance", "staff", "reporting"],
  "sports-club": ["admin", "customer", "finance", "staff", "reporting"],
  pharmacy: ["admin", "branch", "pharmacy", "inventory", "sales", "finance", "procurement", "customer", "reporting"],
  "hair-salon": ["admin", "customer", "sales", "finance", "staff", "reporting"],
  gym: ["admin", "customer", "finance", "staff", "reporting"],
  clinics: ["admin", "hospital", "customer", "finance", "staff", "pharmacy", "reporting"],
  hospital: ["admin", "hospital", "hr", "finance", "pharmacy", "customer", "reporting"],
  school: ["admin", "academic", "hr", "finance", "customer", "staff", "reporting"],
  "real-estate": ["admin", "real-estate", "finance", "customer", "procurement", "reporting"],
  "software-company": ["admin", "technology", "departments", "staff", "customer", "sales", "finance", "reporting", "analytics"],
  "it-support": ["admin", "technology", "staff", "customer", "finance", "reporting", "analytics"],
  "cybersecurity-services": ["admin", "technology", "departments", "staff", "customer", "finance", "reporting", "analytics"],
  "web-development": ["admin", "technology", "staff", "customer", "sales", "finance", "reporting"],
  "app-development": ["admin", "technology", "staff", "customer", "sales", "finance", "reporting", "analytics"],
  "device-repair": ["admin", "technology", "inventory", "customer", "sales", "finance", "reporting"],
  "technology-devices": ["admin", "technology", "branch", "inventory", "customer", "finance", "staff", "reporting", "analytics"],
  "technology-services": ["admin", "technology", "customer", "sales", "finance", "staff", "reporting", "analytics"],
  "internet-services": ["admin", "technology", "branch", "customer", "finance", "staff", "reporting"],
  "digital-agency": ["admin", "technology", "staff", "customer", "sales", "finance", "reporting"],
};

const slug = (value) =>
  safeString(value, 90)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42) || "organization";

const publicOrg = (org) => {
  const { adminPasswordHash, ...safe } = org || {};
  return safe;
};

const hashSecret = (value, salt = crypto.randomBytes(16).toString("hex")) => {
  const hash = crypto.pbkdf2Sync(String(value || ""), salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
};

const verifySecret = (value, encoded) => {
  const [salt, expected] = String(encoded || "").split(":");
  if (!salt || !expected) return false;
  const actual = hashSecret(value, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
};

const randomToken = (prefix = "token") => `${prefix}-${crypto.randomBytes(18).toString("base64url")}`;

const modulePermissionsFor = (portalIds = []) =>
  Object.fromEntries(Array.from(new Set(portalIds)).map((id) => [id, [`${id}.read`, `${id}.manage`]]));

const defaultRoleTemplates = (portalIds = []) => {
  const portals = Array.from(new Set(portalIds));
  return [
    { id: "org_admin", name: "Organization Admin", permissions: ["*"], portals },
    { id: "hr", name: "HR", permissions: ["hr.read", "hr.manage", "staff.read"], portals: portals.filter((id) => ["hr", "staff", "departments"].includes(id)) },
    { id: "finance", name: "Finance", permissions: ["finance.read", "finance.manage", "reporting.read"], portals: portals.filter((id) => ["finance", "reporting", "analytics"].includes(id)) },
    { id: "manager", name: "Manager", permissions: ["reports.read", "staff.read"], portals: portals.filter((id) => id !== "admin") },
    { id: "staff", name: "Staff", permissions: ["staff.read"], portals: portals.filter((id) => id === "staff") },
    { id: "agent", name: "Agent", permissions: ["agent.read", "sales.create"], portals: portals.filter((id) => ["agent", "sales", "customer"].includes(id)) },
  ].map((role) => ({ ...role, modulePermissions: modulePermissionsFor(role.portals) }));
};

const loadOrganizations = async (store) => {
  const rows = (await store.get(ORGS_KEY)) || [];
  return Array.isArray(rows) ? rows : [];
};

const saveOrganizations = (store, rows) => store.set(ORGS_KEY, rows);

const createOrganization = async (req, res, body) => {
  const store = getStore();
  const rows = await loadOrganizations(store);
  const registrationSource = safeString(body.registrationSource || body.source || "", 80);
  if (!["organization-onboarding", "authorized-agent", "super-admin"].includes(registrationSource)) {
    return sendJson(res, 403, { ok: false, error: "Organization registration must use the authorized onboarding flow" });
  }
  const name = safeString(body.name || body.organizationName, 140);
  const businessType = safeString(body.businessType || "retail", 80);
  const serviceCategory = safeString(body.serviceCategory || "", 80);
  const serviceTitle = safeString(body.serviceTitle || businessType, 120);
  const servicePricing = {
    cost: safeString(body.serviceCost || "", 80),
    plan: safeString(body.servicePlan || "", 80),
    setup: safeString(body.serviceSetup || "", 80),
  };
  const selectedComponents = Array.isArray(body.selectedComponents)
    ? body.selectedComponents.map((id) => safeString(id, 40)).filter(Boolean)
    : safeString(body.selectedComponents || "", 500).split(",").map((id) => safeString(id, 40)).filter(Boolean);
  const requestedPortalPricing = body.portalPricing && typeof body.portalPricing === "object" && !Array.isArray(body.portalPricing) ? body.portalPricing : {};
  const servicePortals = Array.from(new Set(Array.isArray(body.recommendedPortals) && body.recommendedPortals.length ? body.recommendedPortals.map((id) => safeString(id, 40)).filter(Boolean) : SERVICE_PORTALS[businessType] || BASE_PORTALS));
  const installedPortals = Array.from(new Set((selectedComponents.length ? selectedComponents : servicePortals).filter((id) => VALID_PORTAL_IDS.has(id))));
  const billablePortals = installedPortals.length ? installedPortals : servicePortals;
  const portalPricing = Object.fromEntries(
    billablePortals.map((id) => [id, Math.max(0, Number(requestedPortalPricing[id] ?? pricing.priceFor(id)) || 0)]),
  );
  const estimatedTotal = Math.max(0, Number(body.estimatedTotal || body.monthlyAmount || body.serviceEstimate || 0) || 0) || Object.values(portalPricing).reduce((sum, amount) => sum + amount, 0);
  const monthlyAmount = Math.max(0, Number(body.monthlyAmount || estimatedTotal) || 0);
  const adminName = safeString(body.adminName || "Organization Admin", 120);
  const adminEmail = safeString(body.adminEmail || body.email, 160).toLowerCase();
  const orgEmail = safeString(body.email || body.organizationEmail || adminEmail, 160).toLowerCase();
  const phone = safeString(body.phone || body.phoneNumber, 60);
  const location = safeString(body.location || body.country, 140);
  const companySize = safeString(body.companySize || "1-10", 40);
  const branchCount = Math.max(0, Number(body.branchCount || body.branches || 0) || 0);
  const adminPassword = safeString(body.adminPassword || body.password || "", 240);
  if (!name || !adminEmail || adminPassword.length < 6) {
    return sendJson(res, 400, { ok: false, error: "Organization name, admin email, and 6+ character password are required" });
  }

  const base = slug(name);
  const unique = crypto.randomBytes(3).toString("hex").toUpperCase();
  const tenantId = cleanTenantId(`${base}-${unique.toLowerCase()}`);
  const orgCode = `${base.toUpperCase().replace(/-/g, "").slice(0, 10)}-${unique}`;
  const now = new Date().toISOString();
  const adminUsername = adminEmail;
  const passwordSetupToken = randomToken("setup");
  const adminPasswordHash = hashSecret(adminPassword);
  const org = {
    id: tenantId,
    organizationId: `ORG-${orgCode}`,
    referenceCode: orgCode,
    name,
    businessType,
    serviceCategory,
    serviceTitle,
    servicePricing,
    registrationSource,
    selectedComponents: installedPortals,
    estimatedTotal,
    monthlyAmount,
    portalPricing,
    contact: { email: orgEmail, phone, location },
    companySize,
    status: "active",
    subscriptionStatus: "trial",
    admin: { name: adminName, email: adminEmail, username: adminUsername, role: "org_admin", passwordSetupRequired: false },
    metrics: { users: 1, branches: branchCount, inventoryItems: 0, orders: 0, revenue: 0 },
    createdAt: now,
    updatedAt: now,
    adminPasswordHash,
  };

  const usersKey = scopeTenantKey(tenantId, USERS_KEY);
  const profileKey = scopeTenantKey(tenantId, PROFILE_KEY);
  const settingsKey = scopeTenantKey(tenantId, SETTINGS_KEY);
  const invitesKey = scopeTenantKey(tenantId, INVITES_KEY);
  await store.set(usersKey, [
    {
      id: `user-${Date.now()}`,
      name: adminName,
      email: adminEmail,
      username: adminUsername,
      role: "org_admin",
      permissions: ["*"],
      portalAccess: installedPortals,
      passwordHash: adminPasswordHash,
      passwordSetupToken,
      emailVerified: false,
      status: "active",
      createdAt: now,
    },
  ]);
  await store.set(invitesKey, []);
  await store.set(profileKey, publicOrg(org));
  await store.set(settingsKey, {
    modules: Array.from(new Set(["dashboard", ...installedPortals])),
    installedPortals,
    recommendedPortals: servicePortals,
    allowedPortals: servicePortals,
    navigation: installedPortals,
    defaultRoles: defaultRoleTemplates(installedPortals),
    modulePermissions: modulePermissionsFor(installedPortals),
    agreementAccepted: false,
    onboardingComplete: false,
    businessType,
    serviceCategory,
    serviceTitle,
    servicePricing,
    selectedComponents: installedPortals,
    estimatedTotal,
    monthlyAmount,
    portalPricing,
    branches: Array.from({ length: branchCount }, (_, idx) => `Branch ${idx + 1}`),
    departments: ["technology-services", "technology-devices", "software-company", "it-support", "digital-agency"].includes(businessType) ? ["Sales", "Operations", "Finance", "HR", "Technology", "Support"] : [],
    createdAt: now,
  });
  await saveOrganizations(store, [org, ...rows]);
  await appendEvent(store, "platform", "organization.registered", { organizationId: org.organizationId, name, tenantId });
  await appendEvent(store, tenantId, "organization.workspace.created", { organizationId: org.organizationId, name });
  return sendJson(res, 201, {
    ok: true,
    organization: publicOrg(org),
    tenantId,
    organizationId: org.organizationId,
    adminAccount: { email: adminEmail, username: adminUsername, passwordSetupToken },
    installedPortals,
  });
};

module.exports = async (req, res) => {
  try {
    rateLimit(req, { scope: "organizations", limit: 160, windowMs: 60_000 });
    const store = getStore();

    if (req.method === "GET") {
      const rows = await loadOrganizations(store);
      const tenantId = getTenantId(req);
      if (req.query?.scope === "mine") {
        requireTenantSession(req, tenantId);
        const org = rows.find((row) => row.id === tenantId);
        return sendJson(res, 200, { ok: true, organization: org ? publicOrg(org) : null });
      }
      requireSuperAdmin(req);
      const events = await listEvents(store, "platform", Number(req.query?.after || 0) || 0);
      return sendJson(res, 200, {
        ok: true,
        organizations: rows.map(publicOrg),
        events,
        totals: {
          organizations: rows.length,
          active: rows.filter((o) => o.status === "active").length,
          suspended: rows.filter((o) => o.status === "suspended").length,
          users: rows.reduce((sum, o) => sum + Number(o.metrics?.users || 0), 0),
          revenue: rows.reduce((sum, o) => sum + Number(o.metrics?.revenue || 0), 0),
        },
      });
    }

    if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    assertSameOrigin(req);
    const body = assertObject(await readJsonBody(req));
    assertIdempotent(req, body);

    if (body.action === "register") return createOrganization(req, res, body);

    const superSession = requireSuperAdmin(req);
    const rows = await loadOrganizations(store);
    const id = cleanTenantId(body.organizationId || body.id || body.tenantId);
    const idx = rows.findIndex((org) => org.id === id || org.organizationId === body.organizationId);
    if (idx < 0) return sendJson(res, 404, { ok: false, error: "Organization not found" });

    if (body.action === "set-status") {
      const status = safeString(body.status, 40);
      if (!["active", "suspended", "restricted", "verified"].includes(status)) return sendJson(res, 400, { ok: false, error: "Invalid status" });
      rows[idx] = { ...rows[idx], status, updatedAt: new Date().toISOString() };
      await saveOrganizations(store, rows);
      await appendEvent(store, "platform", "organization.status.changed", { organizationId: rows[idx].organizationId, status, actor: superSession.sub });
      await appendEvent(store, rows[idx].id, "organization.status.changed", { status });
      return sendJson(res, 200, { ok: true, organization: publicOrg(rows[idx]) });
    }

    if (body.action === "set-subscription") {
      const subscriptionStatus = safeString(body.subscriptionStatus || "trial", 40);
      const plan = safeString(body.plan || "standard", 60);
      rows[idx] = { ...rows[idx], subscriptionStatus, plan, updatedAt: new Date().toISOString() };
      await saveOrganizations(store, rows);
      await appendEvent(store, "platform", "organization.subscription.changed", {
        organizationId: rows[idx].organizationId,
        subscriptionStatus,
        plan,
        actor: superSession.sub,
      });
      await appendEvent(store, rows[idx].id, "organization.subscription.changed", { subscriptionStatus, plan });
      return sendJson(res, 200, { ok: true, organization: publicOrg(rows[idx]) });
    }

    if (body.action === "set-modules") {
      const requested = Array.isArray(body.modules) ? body.modules : [];
      const modules = Array.from(new Set(requested.map((id) => safeString(id, 80)).filter((id) => VALID_PORTAL_IDS.has(id))));
      const settingsKey = scopeTenantKey(rows[idx].id, SETTINGS_KEY);
      const settings = ((await store.get(settingsKey)) || {});
      const nextSettings = {
        ...settings,
        installedPortals: modules,
        modules,
        navigation: modules,
        modulePermissions: Object.fromEntries(modules.map((id) => [id, [`${id}.read`, `${id}.manage`]])),
        updatedAt: new Date().toISOString(),
      };
      rows[idx] = { ...rows[idx], modules, updatedAt: nextSettings.updatedAt };
      await store.setManyAtomic({
        [ORGS_KEY]: rows,
        [settingsKey]: nextSettings,
      });
      await appendEvent(store, "platform", "organization.modules.changed", { organizationId: rows[idx].organizationId, modules, actor: superSession.sub });
      await appendEvent(store, rows[idx].id, "organization.modules.changed", { modules });
      return sendJson(res, 200, { ok: true, organization: publicOrg(rows[idx]), settings: nextSettings });
    }

    return sendJson(res, 400, { ok: false, error: "Unsupported organization action" });
  } catch (err) {
    return sendJson(res, Number(err?.statusCode || 500), { ok: false, error: err?.message || "Server error" });
  }
};

module.exports.verifyOrganizationAdmin = async (identifier, email, password, organizationName = "") => {
  const store = getStore();
  const rows = await loadOrganizations(store);
  const ident = String(identifier || "").trim().toLowerCase();
  const cleanIdent = cleanTenantId(ident);
  const mail = String(email || ident || "").trim().toLowerCase();
  const name = String(organizationName || "").trim().toLowerCase();
  const org = rows.find(
    (row) =>
      (!name || String(row.name || "").trim().toLowerCase() === name) &&
      (row.id === cleanIdent ||
        String(row.organizationId || "").toLowerCase() === ident ||
        String(row.referenceCode || "").toLowerCase() === ident ||
        String(row.admin?.email || "").toLowerCase() === mail ||
        String(row.contact?.email || "").toLowerCase() === mail),
  );
  if (!org || org.status !== "active" || !verifySecret(password, org.adminPasswordHash)) return null;
  return publicOrg(org);
};

module.exports.verifyOrganizationUser = async (identifier, email, password, organizationName = "") => {
  const store = getStore();
  const rows = await loadOrganizations(store);
  const ident = String(identifier || "").trim().toLowerCase();
  const cleanIdent = cleanTenantId(ident);
  const mail = String(email || ident || "").trim().toLowerCase();
  const name = String(organizationName || "").trim().toLowerCase();
  const org = rows.find(
    (row) =>
      (!name || String(row.name || "").trim().toLowerCase() === name) &&
      (row.id === cleanIdent ||
        String(row.organizationId || "").toLowerCase() === ident ||
        String(row.referenceCode || "").toLowerCase() === ident ||
        String(row.admin?.email || "").toLowerCase() === mail ||
        String(row.contact?.email || "").toLowerCase() === mail),
  );
  if (!org || org.status !== "active") return null;
  const usersKey = scopeTenantKey(org.id, USERS_KEY);
  const users = (await store.get(usersKey)) || [];
  const user = (Array.isArray(users) ? users : []).find((row) => String(row.email || "").trim().toLowerCase() === mail);
  if (!user || String(user.status || "active").toLowerCase() !== "active" || !user.passwordHash || !verifySecret(password, user.passwordHash)) return null;
  return { organization: publicOrg(org), user };
};

module.exports.hashOrganizationSecret = hashSecret;
module.exports.verifyOrganizationSecret = verifySecret;
module.exports.randomOrganizationToken = randomToken;
module.exports.AUTH_ACTIVITY_KEY = AUTH_ACTIVITY_KEY;
module.exports.SESSION_DEVICES_KEY = SESSION_DEVICES_KEY;
module.exports.INVITES_KEY = INVITES_KEY;
