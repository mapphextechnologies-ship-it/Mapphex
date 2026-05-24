(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

  let state = { organizations: [], events: [], totals: {}, activity: [], health: {} };
  let monitoring = { organizations: [], totals: {}, activity: [], health: {}, approvalQueues: {} };
  const loginUrl = () => (["localhost", "127.0.0.1", ""].includes(location.hostname) ? "/_internal/mapphex-control" : "/admin-portal.html");

  const notify = (title, body) => {
    const message = body ? `${title}: ${body}` : title;
    console.info(message);
  };

  const fetchJson = async (url, opts = {}) => {
    if (!window.SuperAdminSession?.readSession?.()) {
      location.replace(loginUrl());
      throw new Error("Super Admin session required");
    }
    return window.SuperAdminSession.apiFetch(url, opts);
  };

  const num = (value) => Number(value || 0).toLocaleString();
  const monitoringRows = () => (Array.isArray(monitoring.organizations) ? monitoring.organizations : []);
  const registeredRows = () => (Array.isArray(state.organizations) ? state.organizations : []);
  const orgKey = (org) => String(org?.id || org?.organizationId || org?.referenceCode || org?.name || "").toLowerCase();
  const orgRows = () => {
    const byId = new Map();
    registeredRows().forEach((org) => {
      const key = orgKey(org);
      if (key) byId.set(key, org);
    });
    monitoringRows().forEach((row) => {
      const org = row.organization || row;
      const key = orgKey(org);
      if (key) byId.set(key, { ...(byId.get(key) || {}), ...org });
    });
    return [...byId.values()];
  };
  const allUsers = () =>
    monitoringRows().flatMap((row) =>
      (row.users || []).map((user) => ({ ...user, organization: row.organization?.name, tenantId: row.organization?.id, organizationId: row.organization?.organizationId })),
    );
  const bucketUser = (user = {}) => {
    const role = String(user.role || "").toLowerCase();
    const portal = String(user.registeredPortalId || "").toLowerCase();
    if (role === "director" || portal === "director") return "director";
    if (role === "branch" || portal === "device-branch" || portal === "branch") return "branch";
    if (["agent", "team-leader", "team_leader"].includes(role) || portal === "agent") return "agent";
    return "user";
  };
  const queue = (name) => Array.isArray(monitoring.approvalQueues?.[name]) ? monitoring.approvalQueues[name] : [];

  const renderKpis = async () => {
    const totals = monitoring.totals || state.totals || {};
    const rows = orgRows();
    const pendingTotal = queue("organizations").length + queue("directors").length + queue("branches").length + queue("agents").length + queue("users").length;
    $("#kpi-orgs").textContent = num(Math.max(Number(totals.organizations || 0), rows.length));
    $("#kpi-pending").textContent = num(pendingTotal);
    $("#kpi-branches").textContent = num(totals.branches || allUsers().filter((user) => bucketUser(user) === "branch").length);
    $("#kpi-users").textContent = num(Math.max(Number(totals.users || 0), rows.reduce((sum, org) => sum + Number(org.metrics?.users || 0), 0)));
    $("#kpi-revenue").textContent = num(Math.max(Number(totals.revenue || 0), rows.reduce((sum, org) => sum + Number(org.metrics?.revenue || 0), 0)));
    if ($("#kpi-alerts")) $("#kpi-alerts").textContent = num(totals.securityAlerts || totals.suspended);
    if ($("#mon-active-users")) $("#mon-active-users").textContent = num(totals.activeUsers);
    if ($("#mon-branches")) $("#mon-branches").textContent = num(totals.branches);
    if ($("#mon-queue")) $("#mon-queue").textContent = num(totals.queuedTasks);
    if ($("#mon-files")) $("#mon-files").textContent = num(totals.files);
    if ($("#mon-audit")) $("#mon-audit").textContent = num(totals.auditEvents);
    if ($("#mon-modules")) $("#mon-modules").textContent = num(totals.modules);
    if ($("#mon-suspended")) $("#mon-suspended").textContent = num(totals.suspended);
    try {
      const health = await fetchJson("/api/health");
      if ($("#kpi-sessions")) $("#kpi-sessions").textContent = num(health.realtimeClients);
      if ($("#kpi-health")) $("#kpi-health").textContent = monitoring.health?.api === "online" ? "Online" : "Online";
    } catch {
      if ($("#kpi-health")) $("#kpi-health").textContent = "Degraded";
    }
  };

  const tenantMetric = (orgId) => monitoringRows().find((row) => row.organization?.id === orgId)?.metrics || {};

  const renderOrgs = () => {
    const q = String($("#super-search")?.value || "").toLowerCase().trim();
    const rows = q ? orgRows().filter((org) => JSON.stringify(org).toLowerCase().includes(q)) : orgRows();
    $("#org-table").innerHTML = rows
      .map((org) => {
        const metrics = tenantMetric(org.id);
        return `
          <tr>
            <td><strong>${escapeHtml(org.name)}</strong><div class="muted">${escapeHtml(org.referenceCode || org.id)}</div></td>
            <td>${escapeHtml(org.organizationId)}</td>
            <td>${escapeHtml(org.businessType)}</td>
            <td>${escapeHtml(org.admin?.email || "")}</td>
            <td><span class="pill status-${escapeHtml(org.status)}">${escapeHtml(org.status)}</span></td>
            <td>${num(metrics.users || org.metrics?.users)}</td>
            <td>${escapeHtml(org.subscriptionStatus || "trial")}</td>
            <td class="report-buttons">
              <button class="btn" data-action="active" data-id="${escapeHtml(org.id)}" type="button">Activate</button>
              <button class="btn danger" data-action="rejected" data-id="${escapeHtml(org.id)}" type="button">Reject</button>
              <button class="btn" data-action="verified" data-id="${escapeHtml(org.id)}" type="button">Verify</button>
              <button class="btn" data-action="restricted" data-id="${escapeHtml(org.id)}" type="button">Restrict</button>
              <button class="btn danger" data-action="suspended" data-id="${escapeHtml(org.id)}" type="button">Suspend</button>
              <button class="btn danger" data-action="delete" data-id="${escapeHtml(org.id)}" type="button">Delete</button>
              <button class="btn" data-action="modules-core" data-id="${escapeHtml(org.id)}" type="button">Core Modules</button>
              <button class="btn" data-action="backup" data-id="${escapeHtml(org.id)}" type="button">Backup</button>
            </td>
          </tr>`;
      })
      .join("");
  };

  const actionButtons = (user) => {
    const role = bucketUser(user);
    const label = role === "director" ? "Approve Director" : role === "branch" ? "Approve Branch" : role === "agent" ? "Approve Agent" : "Approve";
    return `
      <button class="btn primary" type="button" data-review-user="${escapeHtml(user.id)}" data-tenant="${escapeHtml(user.tenantId)}" data-role="${escapeHtml(user.role || role)}" data-decision="approved">${label}</button>
      <button class="btn danger" type="button" data-review-user="${escapeHtml(user.id)}" data-tenant="${escapeHtml(user.tenantId)}" data-role="${escapeHtml(user.role || role)}" data-decision="rejected">Reject</button>`;
  };

  const renderApprovalCard = (item, type) => {
    if (type === "organization") {
      return `
        <div class="approval-card">
          <span>${escapeHtml(item.organizationId || item.referenceCode || "New organization")}</span>
          <strong>${escapeHtml(item.name || "Unnamed organization")}</strong>
          <p>${escapeHtml(item.businessType || "business")} - ${escapeHtml(item.contact?.email || item.admin?.email || "No contact")}</p>
          <div class="approval-actions">
            <button class="btn primary" data-action="active" data-id="${escapeHtml(item.id)}" type="button">Approve</button>
            <button class="btn danger" data-action="rejected" data-id="${escapeHtml(item.id)}" type="button">Reject</button>
          </div>
        </div>`;
    }
    return `
      <div class="approval-card">
        <span>${escapeHtml(item.organizationName || item.organizationId || "Organization")}</span>
        <strong>${escapeHtml(item.name || item.username || item.email)}</strong>
        <p>${escapeHtml(item.email || "")} - ${escapeHtml(item.registeredPortalId || item.role || type)}</p>
        <div class="approval-actions">${actionButtons(item)}</div>
      </div>`;
  };

  const renderApprovals = () => {
    const orgs = queue("organizations");
    const directors = queue("directors");
    const branches = queue("branches");
    const agents = [...queue("agents"), ...queue("users").filter((user) => bucketUser(user) === "agent")];
    if ($("#approval-org-count")) $("#approval-org-count").textContent = num(orgs.length);
    if ($("#approval-director-count")) $("#approval-director-count").textContent = num(directors.length);
    if ($("#approval-branch-count")) $("#approval-branch-count").textContent = num(branches.length);
    if ($("#approval-agent-count")) $("#approval-agent-count").textContent = num(agents.length);
    if ($("#approval-orgs")) $("#approval-orgs").innerHTML = orgs.length ? orgs.map((item) => renderApprovalCard(item, "organization")).join("") : `<div class="empty-state">No pending organizations.</div>`;
    if ($("#approval-directors")) $("#approval-directors").innerHTML = directors.length ? directors.map((item) => renderApprovalCard(item, "director")).join("") : `<div class="empty-state">No pending Directors.</div>`;
    if ($("#approval-branches")) $("#approval-branches").innerHTML = branches.length ? branches.map((item) => renderApprovalCard(item, "branch")).join("") : `<div class="empty-state">No pending branches.</div>`;
    if ($("#approval-agents")) $("#approval-agents").innerHTML = agents.length ? agents.map((item) => renderApprovalCard(item, "agent")).join("") : `<div class="empty-state">No pending agents.</div>`;
  };

  const renderUsers = () => {
    const users = allUsers();
    $("#global-users-table").innerHTML = users
      .map(
        (user) => `
          <tr>
            <td>${escapeHtml(user.name)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td>${escapeHtml(user.role)}</td>
            <td>${escapeHtml(user.organization)}</td>
            <td>${escapeHtml(user.status || "active")}</td>
            <td><button class="btn danger" type="button" data-delete-user="${escapeHtml(user.id)}" data-tenant="${escapeHtml(user.tenantId)}">Delete</button></td>
          </tr>`,
      )
      .join("");
  };

  const renderRoleTable = (selector, filter, emptyMessage) => {
    const rows = allUsers().filter(filter);
    const target = $(selector);
    if (!target) return;
    target.innerHTML = rows.length
      ? rows.map((user) => `
          <tr>
            <td><strong>${escapeHtml(user.name || user.username || user.email)}</strong><div class="muted">${escapeHtml(user.email || "")}</div></td>
            <td>${escapeHtml(user.organization || "")}<div class="muted">${escapeHtml(user.organizationId || user.tenantId || "")}</div></td>
            <td>${escapeHtml(user.branchId || user.assignedBranchId || user.area || user.registeredPortalId || "Unassigned")}</td>
            <td><span class="pill status-${escapeHtml(user.status || "active")}">${escapeHtml(user.status || "active")}</span></td>
            <td class="report-buttons">${actionButtons(user)}</td>
          </tr>`).join("")
      : `<tr><td colspan="5" class="muted">${escapeHtml(emptyMessage)}</td></tr>`;
  };

  const renderRolePanels = () => {
    renderRoleTable("#directors-table", (user) => bucketUser(user) === "director", "No Director accounts found.");
    renderRoleTable("#branches-table", (user) => bucketUser(user) === "branch", "No branch manager accounts found.");
    renderRoleTable("#agents-table", (user) => bucketUser(user) === "agent", "No agent or team leader accounts found.");
  };

  const renderModules = () => {
    const target = $("#modules-grid");
    if (!target) return;
    const rows = orgRows();
    target.innerHTML = rows.length
      ? rows.map((org) => {
          const summary = monitoringRows().find((row) => row.organization?.id === org.id);
          const installed = summary?.settings?.installedPortals || org.modules || [];
          return `
            <article class="admin-module-card">
              <span>${escapeHtml(org.organizationId || org.referenceCode || org.id)}</span>
              <strong>${escapeHtml(org.name)}</strong>
              <p>${installed.length ? installed.map(escapeHtml).join(", ") : "No modules approved yet"}</p>
              <button class="btn" data-action="modules-core" data-id="${escapeHtml(org.id)}" type="button">Enable core modules</button>
            </article>`;
        }).join("")
      : `<div class="empty-state">No organizations registered yet.</div>`;
  };

  const renderActivity = () => {
    const activity = monitoring.activity?.length ? monitoring.activity : state.events || [];
    $("#activity-table").innerHTML = activity
      .slice(0, 100)
      .map(
        (event) => `
          <tr>
            <td>${escapeHtml(new Date(event.at || event.createdAt || Date.now()).toLocaleString())}</td>
            <td>${escapeHtml(event.type || event.action || "event")}</td>
            <td>${escapeHtml(event.organizationName || event.payload?.tenantId || event.payload?.organizationId || event.tenantId)}</td>
            <td>${escapeHtml(JSON.stringify(event.payload || event.detail || {}))}</td>
          </tr>`,
      )
      .join("");
  };

  const renderSearch = () => {
    const target = $("#global-search-results");
    if (!target) return;
    const rows = monitoring.globalSearch || [];
    target.innerHTML = rows.length
      ? rows
          .map(
            (item) => `
              <div class="search-result">
                <span>${escapeHtml(item.type)}</span>
                <strong>${escapeHtml(item.label)}</strong>
                <span class="muted">${escapeHtml(item.detail)}</span>
              </div>`,
          )
          .join("")
      : "";
  };

  const renderHeatmap = () => {
    const target = $("#heatmap");
    if (!target) return;
    const max = Math.max(1, ...(monitoring.heatmap || []).map((row) => Number(row.activity || 0)));
    target.innerHTML = (monitoring.heatmap || [])
      .slice(0, 12)
      .map(
        (row) => `
          <div class="heatmap-row">
            <span>${escapeHtml(row.name)}</span>
            <div class="heatbar"><span style="width:${Math.max(8, Math.round((Number(row.activity || 0) / max) * 100))}%"></span></div>
            <span>${Number(row.activity || 0)} events</span>
          </div>`,
      )
      .join("");
  };

  const renderMonitorChart = () => {
    const target = $("#monitor-chart");
    if (!target) return;
    const rows = (monitoring.heatmap || []).slice(0, 7);
    const max = Math.max(1, ...rows.map((row) => Number(row.activity || 0)));
    target.innerHTML = rows.length
      ? rows.map((row) => `<span title="${escapeHtml(row.name)}: ${Number(row.activity || 0)} events" style="height:${Math.max(8, Math.round((Number(row.activity || 0) / max) * 100))}%"></span>`).join("")
      : `<span style="height:8%"></span>`;
  };

  const load = async () => {
    const q = encodeURIComponent(String($("#global-search-input")?.value || "").trim());
    const [orgs, monitor] = await Promise.all([fetchJson("/api/organizations"), fetchJson(`/api/platform-monitoring${q ? `?q=${q}` : ""}`)]);
    state = orgs;
    monitoring = monitor;
    renderOrgs();
    renderApprovals();
    renderUsers();
    renderRolePanels();
    renderModules();
    renderActivity();
    renderSearch();
    renderHeatmap();
    renderMonitorChart();
    $("#platform-default-plan") && ($("#platform-default-plan").value = monitoring.platformSettings?.defaultSubscriptionPlan || "starter-monthly");
    $("#platform-maintenance") && ($("#platform-maintenance").checked = monitoring.platformSettings?.maintenanceMode === true);
    await renderKpis();
  };

  const setStatus = async (id, status) => {
    await fetchJson("/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set-status", id, status }),
    });
    await load();
  };

  const reviewUser = async (tenantId, userId, role, decision) => {
    await fetchJson("/api/platform-monitoring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "review-user", tenantId, userId, role, decision }),
    });
    await load();
  };

  const setCoreModules = async (id) => {
    await fetchJson("/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set-modules", id, modules: ["admin", "finance", "hr", "sales", "inventory", "procurement", "customer", "reporting"] }),
    });
    await load();
  };

  const deleteOrganization = async (id) => {
    if (!window.confirm("Delete this organization and its tenant data? This cannot be undone.")) return;
    await fetchJson("/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-organization", id }),
    });
    await load();
  };

  const saveGlobalSettings = async () => {
    await fetchJson("/api/platform-monitoring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save-global-settings",
        defaultSubscriptionPlan: $("#platform-default-plan")?.value || "starter-monthly",
        maintenanceMode: $("#platform-maintenance")?.checked === true,
      }),
    });
    await load();
  };

  const broadcast = async (form) => {
    const data = new FormData(form);
    await fetchJson("/api/platform-monitoring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "broadcast", title: data.get("title"), message: data.get("body"), priority: data.get("priority"), expiresAt: data.get("expiresAt"), attachmentUrl: data.get("attachmentUrl"), format: data.get("format") }),
    });
    notify(data.get("title"), data.get("body"));
    form.reset();
    await load();
  };

  const backupOrganization = async (tenantId) => {
    await fetchJson("/api/platform-monitoring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "backup-organization", tenantId }),
    });
    await load();
  };

  const deleteUser = async (tenantId, id) => {
    if (!window.confirm("Delete this user from the organization?")) return;
    await fetchJson("/api/platform-monitoring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-user", tenantId, id }),
    });
    await load();
  };

  const clearPlatformEvents = async () => {
    if (!window.confirm("Clear platform-level realtime events?")) return;
    await fetchJson("/api/platform-monitoring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-platform-events", tenantId: "platform" }),
    });
    await load();
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (!window.SuperAdminSession?.readSession?.()) {
      location.replace(loginUrl());
      return;
    }
    $("#super-admin-logout")?.addEventListener("click", async () => {
      await fetchJson("/api/super-admin/session", { method: "DELETE" }).catch(() => null);
      window.SuperAdminSession.clearSession();
      location.replace(loginUrl());
    });
    $("#super-refresh")?.addEventListener("click", () => load().catch((err) => notify("Super Admin", err.message)));
    $("#super-search")?.addEventListener("input", renderOrgs);
    $("#global-search-input")?.addEventListener("input", () => load().catch(() => null));
    $("#org-table")?.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-action]");
      if (!btn) return;
      if (btn.dataset.action === "delete") return deleteOrganization(btn.dataset.id).catch((err) => notify("Delete failed", err.message));
      if (btn.dataset.action === "backup") return backupOrganization(btn.dataset.id).catch((err) => notify("Backup failed", err.message));
      if (btn.dataset.action === "modules-core") return setCoreModules(btn.dataset.id).catch((err) => notify("Module update failed", err.message));
      setStatus(btn.dataset.id, btn.dataset.action).catch((err) => notify("Organization update failed", err.message));
    });
    $("#modules-grid")?.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-action='modules-core']");
      if (!btn) return;
      setCoreModules(btn.dataset.id).catch((err) => notify("Module update failed", err.message));
    });
    document.addEventListener("click", (event) => {
      const orgBtn = event.target.closest("#approval-orgs button[data-action]");
      if (orgBtn) {
        setStatus(orgBtn.dataset.id, orgBtn.dataset.action).catch((err) => notify("Organization review failed", err.message));
        return;
      }
      const userBtn = event.target.closest("button[data-review-user]");
      if (!userBtn) return;
      reviewUser(userBtn.dataset.tenant, userBtn.dataset.reviewUser, userBtn.dataset.role, userBtn.dataset.decision).catch((err) => notify("User review failed", err.message));
    });
    $("#global-users-table")?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-delete-user]");
      if (!btn) return;
      deleteUser(btn.dataset.tenant, btn.dataset.deleteUser).catch((err) => notify("User delete failed", err.message));
    });
    $("#broadcast-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      broadcast(event.currentTarget).catch((err) => notify("Broadcast failed", err.message));
    });
    $("#platform-settings-save")?.addEventListener("click", () => saveGlobalSettings().catch((err) => notify("Settings failed", err.message)));
    $("#clear-platform-events")?.addEventListener("click", () => clearPlatformEvents().catch((err) => notify("Clear activity failed", err.message)));
    window.addEventListener("enterprise:realtime", () => load().catch(() => null));
    load().catch((err) => notify("Super Admin load failed", err.message));
  });
})();
