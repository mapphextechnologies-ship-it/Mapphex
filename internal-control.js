(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

  let state = { organizations: [], events: [], totals: {}, activity: [], health: {} };
  let monitoring = { organizations: [], totals: {}, activity: [], health: {} };
  const loginUrl = () => (["localhost", "127.0.0.1", ""].includes(location.hostname) ? "/_internal/mapphex-control" : "/super-admin-login.html");

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

  const renderKpis = async () => {
    const totals = monitoring.totals || state.totals || {};
    const rows = orgRows();
    $("#kpi-orgs").textContent = num(Math.max(Number(totals.organizations || 0), rows.length));
    $("#kpi-active").textContent = num(Math.max(Number(totals.active || 0), rows.filter((org) => String(org.status || "").toLowerCase() === "active").length));
    $("#kpi-users").textContent = num(Math.max(Number(totals.users || 0), rows.reduce((sum, org) => sum + Number(org.metrics?.users || 0), 0)));
    $("#kpi-revenue").textContent = num(Math.max(Number(totals.revenue || 0), rows.reduce((sum, org) => sum + Number(org.metrics?.revenue || 0), 0)));
    $("#kpi-alerts").textContent = num(totals.securityAlerts || totals.suspended);
    $("#mon-active-users").textContent = num(totals.activeUsers);
    $("#mon-branches").textContent = num(totals.branches);
    $("#mon-queue").textContent = num(totals.queuedTasks);
    $("#mon-files").textContent = num(totals.files);
    $("#mon-audit").textContent = num(totals.auditEvents);
    $("#mon-modules").textContent = num(totals.modules);
    $("#mon-suspended").textContent = num(totals.suspended);
    try {
      const health = await fetchJson("/api/health");
      $("#kpi-sessions").textContent = num(health.realtimeClients);
      $("#kpi-health").textContent = monitoring.health?.api === "online" ? "Online" : "Online";
    } catch {
      $("#kpi-health").textContent = "Degraded";
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

  const renderUsers = () => {
    const users = monitoringRows().flatMap((row) =>
      (row.users || []).map((user) => ({ ...user, organization: row.organization?.name, tenantId: row.organization?.id })),
    );
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
    renderUsers();
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
