(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

  let tenantId = "";
  let state = { users: [], settings: {}, organization: null, events: [] };

  const csv = (value) => String(value || "").split(",").map((x) => x.trim()).filter(Boolean);
  const installedPortalIds = () => (state.settings.installedPortals || state.settings.modules || []).filter(Boolean);
  const portalLabel = (id) => (state.portalCatalog || []).find((portal) => portal.id === id)?.title || id;
  const selectedPortalInputs = (root = document) =>
    [...root.querySelectorAll("[data-user-portal]:checked")].map((input) => input.value).filter(Boolean);
  const downloadText = (filename, text, type = "text/plain") => {
    const blob = new Blob([text], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const fetchJson = async (url, opts = {}) => {
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Request failed");
    return data;
  };

  const setTenant = (id) => {
    tenantId = window.EnterpriseCore?.setTenant?.(id) || id || "default-company";
    $("#tenant-input").value = tenantId;
  };

  const visibleEvent = (event) => !String(event?.type || "").startsWith("kv.");

  const eventLabel = (event) => {
    const type = String(event?.type || "");
    const labels = {
      "organization.workspace.created": "Workspace created",
      "org.agreement.accepted": "Agreement accepted",
      "org.modules.enabled": "Portals installed",
      "org.modules.disabled": "Portal uninstalled",
      "org.user.created": "User added",
      "org.settings.updated": "Settings updated",
      "erp.message.sent": "Department message sent",
      "admin.announcement.sent": "Announcement sent",
    };
    return event.displayType || labels[type] || type.replace(/\./g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const eventDetail = (event) => {
    if (event?.displayMessage) return event.displayMessage;
    const payload = event?.payload || {};
    switch (event?.type) {
      case "organization.workspace.created":
        return `${payload.name || "Organization"} workspace is ready.`;
      case "org.agreement.accepted":
        return `Subscription plan: ${payload.subscriptionPlan || "selected plan"}.`;
      case "org.modules.enabled":
        return `${payload.count || payload.portalIds?.length || 0} portal${Number(payload.count || payload.portalIds?.length || 0) === 1 ? "" : "s"} installed: ${(payload.titles || payload.portalIds || []).join(", ")}.`;
      case "org.modules.disabled":
        return `Removed ${(payload.portalIds || []).join(", ") || "selected portal"} from the workspace.`;
      case "org.user.created":
        return `Added ${payload.role || "user"} account.`;
      case "org.settings.updated":
        return `Organization settings updated.`;
      case "erp.message.sent":
        return `Message sent from ${payload.from || "one department"} to ${payload.to || "another department"}.`;
      case "admin.announcement.sent":
        return payload.message || "Announcement sent.";
      default:
        return payload.message || payload.detail || "Activity recorded.";
    }
  };

  const render = () => {
    const session = window.EnterpriseCore?.getSession?.() || {};
    const badge = $("#internal-mode-badge");
    if (badge) badge.hidden = true;
    $("#org-admin-title").textContent = state.organization?.name || "Organization Admin";
    $("#org-admin-sub").textContent = state.organization?.organizationId || tenantId;
    $("#org-kpi-users").textContent = state.users.length;
    $("#org-kpi-branches").textContent = (state.settings.branches || []).length;
    $("#org-kpi-modules").textContent = (state.settings.modules || []).length;
    $("#org-kpi-status").textContent = state.organization?.status || "Active";
    $("#org-branches").value = (state.settings.branches || []).join(", ");
    $("#org-departments").value = (state.settings.departments || []).join(", ");
    $("#org-modules").value = (state.settings.modules || []).join(", ");
    const portalChecks = installedPortalIds()
      .map((id) => `<label class="check-chip"><input type="checkbox" data-user-portal value="${escapeHtml(id)}" /> <span>${escapeHtml(portalLabel(id))}</span></label>`)
      .join("");
    $("#org-user-portals").innerHTML = portalChecks || `<span class="muted">No installed portals yet.</span>`;
    $("#org-users-table").innerHTML = state.users
      .map((user) => {
        const portals = (user.portalAccess || []).map(portalLabel).join(", ") || "Inherited";
        const disabled = user.status === "disabled";
        return `<tr>
          <td>${escapeHtml(user.name)}</td>
          <td>${escapeHtml(user.email)}</td>
          <td><select data-user-role="${escapeHtml(user.id)}"><option ${user.role === "staff" ? "selected" : ""}>staff</option><option ${user.role === "manager" ? "selected" : ""}>manager</option><option ${user.role === "finance" ? "selected" : ""}>finance</option><option ${user.role === "hr" ? "selected" : ""}>hr</option><option ${user.role === "sales" ? "selected" : ""}>sales</option><option ${user.role === "org_admin" ? "selected" : ""}>org_admin</option></select></td>
          <td><span class="muted">${escapeHtml(portals)}</span></td>
          <td>${escapeHtml(user.status || "active")}</td>
          <td class="table-actions">
            <button class="btn" type="button" data-user-save="${escapeHtml(user.id)}">Save</button>
            <button class="btn" type="button" data-user-portals="${escapeHtml(user.id)}">Portals</button>
            <button class="btn" type="button" data-user-invite="${escapeHtml(user.id)}">Invite</button>
            <button class="btn" type="button" data-user-reset="${escapeHtml(user.id)}">Reset</button>
            <button class="btn ${disabled ? "primary" : "danger"}" type="button" data-user-status="${escapeHtml(user.id)}" data-status="${disabled ? "active" : "disabled"}">${disabled ? "Activate" : "Disable"}</button>
          </td>
        </tr>`;
      })
      .join("");
    const events = state.events.filter(visibleEvent).slice(-40);
    $("#org-activity-table").innerHTML = events.length ? events
      .reverse()
      .map((event) => `<tr><td>${escapeHtml(new Date(event.at).toLocaleString())}</td><td>${escapeHtml(eventLabel(event))}</td><td>${escapeHtml(eventDetail(event))}</td></tr>`)
      .join("") : `<tr><td colspan="3" class="muted">No important activity yet.</td></tr>`;
  };

  const load = async () => {
    const [org, admin, realtime] = await Promise.all([
      fetchJson("/api/organizations?scope=mine"),
      fetchJson("/api/org-admin"),
      fetchJson("/api/realtime?after=0"),
    ]);
    if (admin.settings?.agreementAccepted !== true) {
      location.href = `organization-agreement.html?tenant=${encodeURIComponent(tenantId)}`;
      return;
    }
    state = { organization: org.organization, users: admin.users || [], settings: admin.settings || {}, portalCatalog: admin.portalCatalog || [], events: realtime.events || [] };
    render();
  };

  document.addEventListener("DOMContentLoaded", () => {
    const fromQuery = new URLSearchParams(location.search).get("tenant");
    setTenant(fromQuery || window.EnterpriseCore?.currentTenantId?.() || "default-company");
    const session = window.EnterpriseCore?.requireOrganizationSession?.(fromQuery || tenantId);
    if (!session?.tenantId || session.role === "super_admin" || new URLSearchParams(location.search).get("support") === "1") {
      location.href = "organization-login.html";
      return;
    }
    setTenant(session.tenantId);
    $("#workspace-link").href = `organization-workspace.html?tenant=${encodeURIComponent(tenantId)}`;
    $("#load-org")?.addEventListener("click", () => {
      setTenant($("#tenant-input").value);
      load().catch((err) => window.EnterpriseCore?.notify?.("Organization load failed", err.message, "error"));
    });
    $("#org-user-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      body.action = "add-user";
      body.portalAccess = selectedPortalInputs(event.currentTarget);
      await fetchJson("/api/org-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      event.currentTarget.reset();
      await load();
    });
    $("#org-users-table")?.addEventListener("click", async (event) => {
      const save = event.target.closest("[data-user-save]");
      const portals = event.target.closest("[data-user-portals]");
      const status = event.target.closest("[data-user-status]");
      const invite = event.target.closest("[data-user-invite]");
      const reset = event.target.closest("[data-user-reset]");
      const userId = save?.dataset.userSave || portals?.dataset.userPortals || status?.dataset.userStatus || invite?.dataset.userInvite || reset?.dataset.userReset;
      if (!userId) return;
      try {
        let body;
        if (save) {
          body = {
            action: "update-user",
            userId,
            role: $(`[data-user-role="${CSS.escape(userId)}"]`)?.value || "staff",
            portalAccess: state.users.find((user) => user.id === userId)?.portalAccess || [],
          };
        } else if (portals) {
          const user = state.users.find((row) => row.id === userId) || {};
          const current = (user.portalAccess || []).join(", ");
          const value = window.prompt(`Portal IDs for ${user.email}: ${installedPortalIds().join(", ")}`, current);
          if (value === null) return;
          body = {
            action: "update-user",
            userId,
            role: user.role || "staff",
            portalAccess: csv(value).filter((id) => installedPortalIds().includes(id)),
          };
        } else if (status) {
          body = { action: "set-user-status", userId, status: status.dataset.status };
        } else if (invite) {
          body = { action: "issue-user-invite", userId };
        } else {
          body = { action: "issue-password-reset", userId };
        }
        const data = await fetchJson("/api/org-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (data.token) window.EnterpriseCore?.notify?.("User token generated", data.token);
        await load();
      } catch (err) {
        window.EnterpriseCore?.notify?.("User update failed", err.message, "error");
      }
    });
    $("#save-org-settings")?.addEventListener("click", async () => {
      await fetchJson("/api/org-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-settings",
          branches: csv($("#org-branches").value),
          departments: csv($("#org-departments").value),
          modules: csv($("#org-modules").value),
        }),
      });
      await load();
    });
    $("#export-admin-audit")?.addEventListener("click", () => {
      const rows = state.events.filter(visibleEvent).map((event) => [event.at, eventLabel(event), eventDetail(event)]);
      downloadText("organization-audit.csv", rows.map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
      window.EnterpriseCore?.audit?.("admin.audit.exported", { count: rows.length });
    });
    $("#send-global-announcement")?.addEventListener("click", () => {
      const message = `Global announcement sent to ${state.organization?.name || tenantId} portals.`;
      window.EnterpriseCore?.notify?.("Global announcement", message);
      window.EnterpriseCore?.audit?.("admin.announcement.sent", { tenantId });
      state.events.push({ at: new Date().toISOString(), type: "admin.announcement.sent", payload: { message } });
      render();
    });
    window.addEventListener("enterprise:realtime", () => load().catch(() => null));
    load().catch((err) => window.EnterpriseCore?.notify?.("Organization Admin", err.message, "error"));
  });
})();
