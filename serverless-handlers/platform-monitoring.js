const { sendJson, readJsonBody } = require("../api/_lib/http");
const { getStore } = require("../api/_lib/kv-store");
const { scopeTenantKey } = require("../api/_lib/tenant");
const { appendEvent, listEvents } = require("../api/_lib/events");
const { assertIdempotent, assertObject, assertSameOrigin, rateLimit, safeString } = require("../api/_lib/security");
const { requireSuperAdmin } = require("../api/_lib/super-admin-auth");

const ORGS_KEY = "platform_organizations_v1";
const USERS_KEY = "enterprise_org_users_v1";
const SETTINGS_KEY = "enterprise_org_settings_v1";
const AUDIT_KEY = "enterprise_audit_v1";
const TASK_KEY = "enterprise_task_queue_v1";
const FILES_KEY = "enterprise_files_v1";
const BACKUPS_KEY = "platform_backups_v1";
const ANNOUNCEMENTS_KEY = "enterprise_announcements_v1";
const NOTIFICATIONS_KEY = "enterprise_notifications_v1";
const PLATFORM_SETTINGS_KEY = "platform_settings_v1";

const ROLE_PORTAL_MAP = {
  director: ["director"],
  branch: ["device-branch", "branch"],
  "team-leader": ["agent", "sales", "reporting"],
  team_leader: ["agent", "sales", "reporting"],
  agent: ["agent", "sales"],
  staff: ["staff"],
};

const publicOrg = (org) => {
  const { adminPasswordHash, ...safe } = org || {};
  return safe;
};

const readArray = async (store, key) => {
  const value = (await store.get(key)) || [];
  return Array.isArray(value) ? value : [];
};

const roleBucket = (user = {}) => {
  const role = String(user.role || "").trim().toLowerCase();
  const portalId = String(user.registeredPortalId || user.portalId || "").trim().toLowerCase();
  if (role === "director" || portalId === "director") return "directors";
  if (role === "branch" || portalId === "device-branch" || portalId === "branch") return "branches";
  if (role === "agent" || role === "team-leader" || role === "team_leader" || portalId === "agent") return "agents";
  return "users";
};

const publicUser = (user = {}) => {
  const { activationToken, password, passwordHash, passwordResetToken, passwordSetupToken, salt, secretB64, ...safe } = user;
  return safe;
};

const approvalQueuesFor = (tenantSummaries) => {
  const queues = {
    organizations: [],
    directors: [],
    branches: [],
    agents: [],
    users: [],
  };
  tenantSummaries.forEach((row) => {
    const org = row.organization || {};
    if (["pending", "rejected"].includes(String(org.status || "").toLowerCase())) queues.organizations.push(org);
    (row.users || []).forEach((user) => {
      if (String(user.status || "").toLowerCase() !== "pending") return;
      queues[roleBucket(user)].push({
        ...user,
        organizationName: org.name,
        tenantId: org.id,
        organizationId: org.organizationId,
      });
    });
  });
  return queues;
};

const permissionsForRole = (role, portals) => {
  const cleanRole = String(role || "staff").trim().toLowerCase();
  const portalIds = Array.from(new Set((Array.isArray(portals) ? portals : []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (cleanRole === "director") return ["director.read", "director.manage", "reporting.read", "branch.read"];
  if (cleanRole === "branch") return ["device-branch.read", "device-branch.manage", "branch.read", "sales.create", "inventory.read"];
  if (cleanRole === "agent") return ["agent.read", "sales.create", "customer.read"];
  if (cleanRole === "team-leader" || cleanRole === "team_leader") return ["agent.read", "agent.manage", "sales.read", "reporting.read"];
  return portalIds.map((id) => `${id}.read`);
};

const reviewTenantUser = async (store, organizations, body, actor) => {
  const tenantId = safeString(body.tenantId, 80);
  const userId = safeString(body.userId || body.id, 180);
  const decision = safeString(body.decision || body.status || "active", 40).toLowerCase();
  const org = organizations.find((row) => row.id === tenantId);
  if (!org) return { status: 404, body: { ok: false, error: "Organization not found" } };
  if (!userId) return { status: 400, body: { ok: false, error: "User id is required" } };
  if (!["approved", "active", "rejected", "disabled"].includes(decision)) {
    return { status: 400, body: { ok: false, error: "Invalid review decision" } };
  }

  const usersKey = scopeTenantKey(tenantId, USERS_KEY);
  const settingsKey = scopeTenantKey(tenantId, SETTINGS_KEY);
  const [users, settingsRaw] = await Promise.all([readArray(store, usersKey), store.get(settingsKey)]);
  const idx = users.findIndex((user) => String(user.id || "") === userId);
  if (idx < 0) return { status: 404, body: { ok: false, error: "User not found" } };

  const user = users[idx];
  const requestedRole = safeString(body.role || user.role || "staff", 60).toLowerCase();
  const role = requestedRole === "team_leader" ? "team-leader" : requestedRole;
  if (role === "director") {
    const alreadyHasDirector = users.some((candidate, candidateIdx) =>
      candidateIdx !== idx &&
      String(candidate.role || "").toLowerCase() === "director" &&
      String(candidate.status || "").toLowerCase() === "active",
    );
    if (decision === "approved" || decision === "active") {
      if (alreadyHasDirector) return { status: 409, body: { ok: false, error: "This organization already has an active Director" } };
    }
  }

  const registeredPortal = String(user.registeredPortalId || "").trim().toLowerCase();
  const defaultPortals = ROLE_PORTAL_MAP[role] || (registeredPortal ? [registeredPortal] : ["staff"]);
  const portalAccess = Array.from(new Set([
    ...defaultPortals,
    ...(Array.isArray(body.portalAccess) ? body.portalAccess : []),
  ].map((id) => String(id || "").trim()).filter(Boolean)));
  const settings = settingsRaw && typeof settingsRaw === "object" ? settingsRaw : {};
  const installedPortals = Array.from(new Set([...(settings.installedPortals || []), ...portalAccess].filter(Boolean)));
  const status = decision === "rejected" ? "rejected" : decision === "disabled" ? "disabled" : "active";
  const reviewedAt = new Date().toISOString();
  const nextUser = {
    ...user,
    role,
    status,
    portalAccess: status === "active" ? portalAccess : user.portalAccess || [],
    permissions: status === "active" ? Array.from(new Set([...(user.permissions || []), ...permissionsForRole(role, portalAccess)])) : user.permissions || [],
    assignedBranchId: safeString(body.branchId || user.assignedBranchId || user.branchId || "", 80),
    teamLeaderId: safeString(body.teamLeaderId || user.teamLeaderId || "", 80),
    reviewReason: safeString(body.reason || "", 500),
    reviewedAt,
    reviewedBy: actor,
  };
  const nextUsers = [...users];
  nextUsers[idx] = nextUser;
  await store.setManyAtomic({
    [usersKey]: nextUsers,
    [settingsKey]: {
      ...settings,
      installedPortals,
      modules: Array.from(new Set([...(settings.modules || []), ...installedPortals])),
      navigation: Array.from(new Set([...(settings.navigation || []), ...installedPortals])),
      updatedAt: reviewedAt,
    },
  });
  await appendEvent(store, "platform", "platform.user.reviewed", { tenantId, userId, role, status, actor });
  await appendEvent(store, tenantId, "org.user.reviewed", { userId, role, status });
  return { status: 200, body: { ok: true, user: publicUser(nextUser) } };
};

const normalizeOrganizationRows = (value) => {
  if (Array.isArray(value)) return value.filter((row) => row && typeof row === "object");
  if (value && typeof value === "object") {
    const rows = Array.isArray(value.organizations) ? value.organizations : Array.isArray(value.rows) ? value.rows : Object.values(value);
    return rows.filter((row) => row && typeof row === "object" && (row.id || row.organizationId || row.name));
  }
  return [];
};

const summarizeTenant = async (store, org) => {
  const tenantId = org.id;
  const [users, settings, audit, tasks, files, events] = await Promise.all([
    readArray(store, scopeTenantKey(tenantId, USERS_KEY)),
    store.get(scopeTenantKey(tenantId, SETTINGS_KEY)).then((v) => (v && typeof v === "object" ? v : {})),
    readArray(store, scopeTenantKey(tenantId, AUDIT_KEY)),
    readArray(store, scopeTenantKey(tenantId, TASK_KEY)),
    readArray(store, scopeTenantKey(tenantId, FILES_KEY)),
    listEvents(store, tenantId, 0),
  ]);
  const activeUsers = users.filter((user) => user.status !== "suspended").length;
  const securityAlerts =
    audit.filter((row) => /failed|denied|suspend|unauthor|security/i.test(`${row.action} ${JSON.stringify(row.detail || {})}`)).length +
    (org.status === "suspended" ? 1 : 0);
  return {
    organization: publicOrg(org),
    users: users.map(publicUser),
    settings,
    metrics: {
      users: users.length,
      activeUsers,
      branches: Array.isArray(settings.branches) ? settings.branches.length : Number(org.metrics?.branches || 0),
      departments: Array.isArray(settings.departments) ? settings.departments.length : 0,
      modules: Array.isArray(settings.modules) ? settings.modules.length : 0,
      auditEvents: audit.length,
      queuedTasks: tasks.filter((task) => task.status === "queued").length,
      files: files.length,
      realtimeEvents: events.length,
      revenue: Number(org.metrics?.revenue || 0),
      securityAlerts,
    },
    latestActivity: [...events.slice(-10), ...audit.slice(-10)]
      .sort((a, b) => String(b.at || b.createdAt || "").localeCompare(String(a.at || a.createdAt || "")))
      .slice(0, 10),
  };
};

module.exports = async (req, res) => {
  try {
    rateLimit(req, { scope: "platform-monitoring", limit: 180, windowMs: 60_000 });
    const superSession = requireSuperAdmin(req);
    const store = getStore();
    const organizations = normalizeOrganizationRows((await store.get(ORGS_KEY)) || []);

    if (req.method === "POST") {
      assertSameOrigin(req);
      const body = assertObject(await readJsonBody(req));
      assertIdempotent(req, body);
      if (body.action === "broadcast") {
        const title = safeString(body.title || "Platform notification", 120);
        const message = safeString(body.message || body.body || "", 2000);
        const announcement = {
          id: `ann-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          title,
          body: message,
          priority: safeString(body.priority || "normal", 40),
          expiresAt: safeString(body.expiresAt || "", 80),
          attachmentUrl: safeString(body.attachmentUrl || "", 500),
          format: safeString(body.format || "plain", 40),
          scope: "global",
          actor: superSession.sub,
          createdAt: new Date().toISOString(),
        };
        await appendEvent(store, "platform", "platform.broadcast.sent", { title, message, count: organizations.length, actor: superSession.sub });
        await Promise.all(
          organizations.map(async (org) => {
            const annKey = scopeTenantKey(org.id, ANNOUNCEMENTS_KEY);
            const ntfKey = scopeTenantKey(org.id, NOTIFICATIONS_KEY);
            const [announcements, notifications] = await Promise.all([readArray(store, annKey), readArray(store, ntfKey)]);
            await store.setManyAtomic({
              [annKey]: [announcement, ...announcements].slice(0, 500),
              [ntfKey]: [{ id: `ntf-${announcement.id}`, at: announcement.createdAt, moduleId: "admin", title, body: message, priority: announcement.priority, read: false, payload: { announcementId: announcement.id, global: true } }, ...notifications].slice(0, 1000),
            });
            await appendEvent(store, org.id, "platform.broadcast.received", { title, message, announcementId: announcement.id });
          }),
        );
        return sendJson(res, 200, { ok: true, delivered: organizations.length });
      }
      if (body.action === "save-global-settings") {
        const settings = {
          maintenanceMode: body.maintenanceMode === true,
          defaultSubscriptionPlan: safeString(body.defaultSubscriptionPlan || "starter-monthly", 80),
          permissionPolicy: safeString(body.permissionPolicy || "rbac-obac", 80),
          updatedAt: new Date().toISOString(),
          updatedBy: superSession.sub,
        };
        await store.set(PLATFORM_SETTINGS_KEY, settings);
        await appendEvent(store, "platform", "platform.settings.updated", { actor: superSession.sub });
        return sendJson(res, 200, { ok: true, settings });
      }
      if (body.action === "delete-platform-events") {
        const tenantId = safeString(body.tenantId || "platform", 80);
        if (typeof store.delete === "function") await store.delete(scopeTenantKey(tenantId, "enterprise_events_v1"));
        else await store.set(scopeTenantKey(tenantId, "enterprise_events_v1"), []);
        await appendEvent(store, "platform", "platform.events.deleted", { tenantId, actor: superSession.sub });
        return sendJson(res, 200, { ok: true });
      }
      if (["delete-user", "delete-module", "delete-notification", "delete-audit-log"].includes(body.action)) {
        const tenantId = safeString(body.tenantId, 80);
        const id = safeString(body.id || body.userId || body.moduleId, 180);
        const org = organizations.find((row) => row.id === tenantId);
        if (!org) return sendJson(res, 404, { ok: false, error: "Organization not found" });
        if (!id) return sendJson(res, 400, { ok: false, error: "Record id is required" });
        if (body.action === "delete-user") {
          const key = scopeTenantKey(tenantId, USERS_KEY);
          await store.set(key, (await readArray(store, key)).filter((user) => user.id !== id));
        }
        if (body.action === "delete-module") {
          const key = scopeTenantKey(tenantId, SETTINGS_KEY);
          const settings = (await store.get(key)) || {};
          const remove = new Set([id]);
          await store.set(key, {
            ...settings,
            installedPortals: (settings.installedPortals || []).filter((moduleId) => !remove.has(moduleId)),
            modules: (settings.modules || []).filter((moduleId) => !remove.has(moduleId)),
            navigation: (settings.navigation || []).filter((moduleId) => !remove.has(moduleId)),
            updatedAt: new Date().toISOString(),
          });
        }
        if (body.action === "delete-notification") {
          const key = scopeTenantKey(tenantId, NOTIFICATIONS_KEY);
          await store.set(key, (await readArray(store, key)).filter((row) => row.id !== id));
        }
        if (body.action === "delete-audit-log") {
          const key = scopeTenantKey(tenantId, AUDIT_KEY);
          await store.set(key, (await readArray(store, key)).filter((row) => row.id !== id));
        }
        await appendEvent(store, "platform", `platform.${body.action}`, { tenantId, id, actor: superSession.sub });
        return sendJson(res, 200, { ok: true });
      }
      if (body.action === "review-user") {
        const result = await reviewTenantUser(store, organizations, body, superSession.sub);
        return sendJson(res, result.status, result.body);
      }
      if (body.action === "backup-organization") {
        const org = organizations.find((row) => row.id === safeString(body.tenantId || body.id, 80));
        if (!org) return sendJson(res, 404, { ok: false, error: "Organization not found" });
        const summary = await summarizeTenant(store, org);
        const backup = {
          id: `backup-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          tenantId: org.id,
          organizationId: org.organizationId,
          createdAt: new Date().toISOString(),
          type: "tenant-summary",
          summary,
        };
        const backups = await readArray(store, BACKUPS_KEY);
        await store.set(BACKUPS_KEY, [backup, ...backups].slice(0, 500));
        await appendEvent(store, "platform", "organization.backup.created", { tenantId: org.id, backupId: backup.id, actor: superSession.sub });
        return sendJson(res, 200, { ok: true, backup: { ...backup, summary: undefined } });
      }
      return sendJson(res, 400, { ok: false, error: "Unsupported monitoring action" });
    }

    if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "Method not allowed" });

    const tenantSummaries = await Promise.all(organizations.map((org) => summarizeTenant(store, org)));
    const platformEvents = await listEvents(store, "platform", Number(req.query?.after || 0) || 0);
    const totals = tenantSummaries.reduce(
      (acc, row) => {
        acc.organizations += 1;
        acc.active += row.organization.status === "active" ? 1 : 0;
        acc.suspended += row.organization.status === "suspended" ? 1 : 0;
        acc.users += row.metrics.users;
        acc.activeUsers += row.metrics.activeUsers;
        acc.branches += row.metrics.branches;
        acc.modules += row.metrics.modules;
        acc.auditEvents += row.metrics.auditEvents;
        acc.queuedTasks += row.metrics.queuedTasks;
        acc.files += row.metrics.files;
        acc.revenue += row.metrics.revenue;
        acc.securityAlerts += row.metrics.securityAlerts;
        return acc;
      },
      {
        organizations: 0,
        active: 0,
        suspended: 0,
        users: 0,
        activeUsers: 0,
        branches: 0,
        modules: 0,
        auditEvents: 0,
        queuedTasks: 0,
        files: 0,
        revenue: 0,
        securityAlerts: 0,
      },
    );

    const activity = [
      ...platformEvents,
      ...tenantSummaries.flatMap((row) =>
        row.latestActivity.map((event) => ({
          ...event,
          tenantId: row.organization.id,
          organizationName: row.organization.name,
        })),
      ),
    ]
      .sort((a, b) => String(b.at || b.createdAt || "").localeCompare(String(a.at || a.createdAt || "")))
      .slice(0, 100);

    const q = safeString(req.query?.q || "", 120).toLowerCase();
    const globalSearch = q
      ? tenantSummaries
          .flatMap((row) => [
            { type: "organization", tenantId: row.organization.id, label: row.organization.name, detail: row.organization.organizationId },
            ...(row.users || []).map((user) => ({
              type: "user",
              tenantId: row.organization.id,
              label: user.name || user.email,
              detail: `${row.organization.name} • ${user.role}`,
            })),
          ])
          .filter((item) => JSON.stringify(item).toLowerCase().includes(q))
          .slice(0, 50)
      : [];

    const heatmap = tenantSummaries.map((row) => ({
      tenantId: row.organization.id,
      name: row.organization.name,
      activity: row.metrics.realtimeEvents + row.metrics.auditEvents,
      alerts: row.metrics.securityAlerts,
    }));

    const platformSettings = (await store.get(PLATFORM_SETTINGS_KEY)) || {};

    const approvalQueues = approvalQueuesFor(tenantSummaries);

    return sendJson(res, 200, {
      ok: true,
      totals,
      organizations: tenantSummaries,
      activity,
      globalSearch,
      heatmap,
      approvalQueues,
      platformSettings,
      health: {
        database: "online",
        realtime: "online",
        api: "online",
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return sendJson(res, Number(err?.statusCode || 500), { ok: false, error: err?.message || "Server error" });
  }
};
