(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const ORGS_KEY = "platform_organizations_v1";
  const SETTINGS_KEY = "enterprise_org_settings_v1";
  const PORTAL_CATALOG = window.EnterpriseModules?.catalog || [];
  const VALID_PORTAL_IDS = window.EnterpriseModules?.validIds || new Set(PORTAL_CATALOG.map((portal) => portal.id));

  const readJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const writeJson = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value ?? null));
  };

  const fetchJson = async (url, opts) => {
    const res = await fetch(url, opts);
    const text = await res.text();
    try {
      return { res, data: text ? JSON.parse(text) : null };
    } catch {
      throw new Error("Service returned an invalid response");
    }
  };

  const localOrg = (tenant) => {
    const rows = readJson(ORGS_KEY, []);
    return (Array.isArray(rows) ? rows : []).find((row) => row.id === tenant) || null;
  };

  const guardPortalLink = (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    if (!link.href.includes("organization-module.html") && !link.href.includes("organization-admin.html")) return;
    const session = window.EnterpriseCore?.requireOrganizationSession?.();
    if (session?.tenantId) return;
    event.preventDefault();
    location.href = "organization-login.html";
  };

  let portals = [];
  let settingsState = {};
  let orgState = null;

  const portalUrl = (portal, org) => {
    const tenant = window.EnterpriseCore?.currentTenantId?.() || "";
    if (portal.id === "finance") {
      return `finance-workflow.html${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ""}`;
    }
    try {
      const url = new URL("portal-auth.html", location.origin);
      url.searchParams.set("tenant", tenant);
      url.searchParams.set("portal", portal.id);
      if (org?.organizationId) url.searchParams.set("org", org.organizationId);
      return url.href;
    } catch {
      return `portal-auth.html?tenant=${encodeURIComponent(tenant)}&portal=${encodeURIComponent(portal.id)}`;
    }
  };

  const portalSummary = (portal, settings) => {
    const branches = settings.branches?.length || 0;
    const departments = settings.departments?.length || 0;
    const summaries = {
      hr: `${departments || 1} department groups ready`,
      finance: "Finance reports enabled",
      pharmacy: "Controlled inventory workspace",
      inventory: `${branches || 1} stock location scope`,
      logistics: "Dispatch and tracking ready",
      reporting: "Operational reports available",
      staff: "Staff access enabled",
      branch: `${branches || 1} branch workspace`,
      departments: `${departments || 1} department workflow`,
      analytics: "Realtime insights ready",
      admin: "Organization controls enabled",
      sales: "Customer and sales tracking",
      procurement: "Purchase and supplier workflow",
      technology: "Technology services workspace",
      customer: "Customer operations enabled",
      academic: "School operations enabled",
      hospital: "Hospital operations enabled",
      restaurant: "Restaurant operations enabled",
      "real-estate": "Property operations enabled",
      director: "Director review enabled",
      "device-branch": `${branches || 1} branch operations workspace`,
      "team-leader": "Operations lead allocation ready",
      agent: "ERP agent onboarding enabled",
      "device-departments": `${departments || 1} department workflow`,
    };
    return summaries[portal.id] || "Workspace module ready";
  };

  const canOpenPortal = (portalId) => {
    const session = window.EnterpriseCore?.getSession?.() || {};
    const role = String(session.role || "").toLowerCase();
    if (["org_admin", "admin", "director"].includes(role)) return true;
    if (Array.isArray(session.portalAccess) && session.portalAccess.includes(portalId)) return true;
    return (
      window.EnterpriseCore?.hasPermission?.(`${portalId}.read`, session) ||
      window.EnterpriseCore?.hasPermission?.(`${portalId}.manage`, session)
    );
  };

  const renderPortals = (query = "", org = null) => {
    const target = $("#installed-portals");
    const empty = $("#portal-empty");
    const q = query.trim().toLowerCase();
    const installedRows = q
      ? portals.filter((portal) => `${portal.title} ${portal.description} ${(portal.features || []).join(" ")}`.toLowerCase().includes(q))
      : portals;
    empty.hidden = installedRows.length > 0 || !q;
    const installedCards = installedRows
      .map(
        (portal) => `
          <article class="portal-hub-card">
            <div class="portal-hub-card-top">
              <span class="portal-hub-icon">${escapeHtml((portal.title || "M").slice(0, 2).toUpperCase())}</span>
              <span class="portal-status">Installed in app</span>
            </div>
            <h3>${escapeHtml(portal.title)}</h3>
            <p>${escapeHtml(portal.description)}</p>
            <div class="portal-hub-summary">${escapeHtml(portal.summary)}</div>
            <ul class="portal-feature-list">
              ${(portal.features || []).slice(0, 3).map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}
            </ul>
            <div class="portal-card-actions">
              <a class="btn primary" href="${escapeHtml(portalUrl(portal, org))}">Open Portal</a>
              <button class="btn" type="button" data-portal-uninstall="${escapeHtml(portal.id)}">Uninstall</button>
            </div>
          </article>`,
      )
      .join("");
    target.innerHTML = installedCards;
  };

  const refreshPortalState = (settings, org = orgState) => {
    settingsState = settings || {};
    const installed = new Set((settingsState.installedPortals || []).filter((id) => VALID_PORTAL_IDS.has(id)));
    portals = (settingsState.portalCatalog || PORTAL_CATALOG)
      .filter((portal) => installed.has(portal.id) && canOpenPortal(portal.id))
      .map((portal) => ({ ...portal, summary: portalSummary(portal, settingsState) }));
    $("#hub-kpi-portals").textContent = portals.length;
    renderPortals($("#portal-search")?.value || "", org);
  };

  const uninstallPortal = async (portalId) => {
    if (!portalId) return;
    const portal = portals.find((item) => item.id === portalId);
    const name = portal?.title || portalId;
    const ok = window.confirm(`Uninstall ${name} from this Bytewave workspace? You can install it again later from Portal Manager.`);
    if (!ok) return;
    try {
      const response = await fetchJson("/api/org-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "uninstall-portal", portalId }),
      });
      if (!response.res.ok || !response.data?.ok) throw new Error(response.data?.error || "Uninstall failed");
      refreshPortalState({ ...(response.data.settings || {}), portalCatalog: settingsState.portalCatalog }, orgState);
    } catch (apiErr) {
      if (!isLocalDevelopment()) throw apiErr;
      const modulePermissions = { ...(settingsState.modulePermissions || {}) };
      delete modulePermissions[portalId];
      const next = {
        ...settingsState,
        installedPortals: (settingsState.installedPortals || []).filter((id) => id !== portalId),
        modules: (settingsState.modules || []).filter((id) => id !== portalId),
        navigation: (settingsState.navigation || []).filter((id) => id !== portalId),
        modulePermissions,
        updatedAt: new Date().toISOString(),
      };
      writeJson(SETTINGS_KEY, next);
      refreshPortalState(next, orgState);
    }
    window.EnterpriseCore?.notify?.("Portal uninstalled", `${name} was removed from the workspace`);
    if (!portals.length) {
      location.href = `portal-selection.html?tenant=${encodeURIComponent(window.EnterpriseCore?.currentTenantId?.() || "")}`;
    }
  };

  const isLocalDevelopment = () => ["localhost", "127.0.0.1", ""].includes(location.hostname);

  document.addEventListener("DOMContentLoaded", async () => {
    document.addEventListener("click", guardPortalLink);
    const fromQuery = new URLSearchParams(location.search).get("tenant");
    const tenant = fromQuery || window.EnterpriseCore?.currentTenantId?.();
    if (tenant) window.EnterpriseCore?.setTenant?.(tenant);
    const session = window.EnterpriseCore?.requireOrganizationSession?.(tenant);
    if (!session?.tenantId) {
      location.href = "organization-login.html";
      return;
    }
    window.EnterpriseCore?.setTenant?.(session.tenantId);
    try {
      let admin;
      let mine;
      try {
        const responses = await Promise.all([fetchJson("/api/org-admin"), fetchJson("/api/organizations?scope=mine")]);
        if (!responses[0].res.ok || !responses[0].data?.ok) throw new Error(responses[0].data?.error || "Unable to load Portal Hub");
        admin = responses[0].data;
        mine = responses[1].res.ok && responses[1].data?.ok ? responses[1].data : { ok: true, organization: localOrg(session.tenantId) };
      } catch (apiErr) {
        if (!isLocalDevelopment()) throw apiErr;
        admin = {
          ok: true,
          settings: readJson(SETTINGS_KEY, {}),
          portalCatalog: PORTAL_CATALOG,
        };
        mine = { ok: true, organization: localOrg(session.tenantId) };
      }
      if (!admin.ok) throw new Error(admin.error || "Unable to load Portal Hub");
      const settings = admin.settings || {};
      const tenantId = session.tenantId;
      if (settings.agreementAccepted !== true) {
        location.href = `organization-agreement.html?tenant=${encodeURIComponent(tenantId)}`;
        return;
      }
      if (!settings.installedPortals?.length) {
        location.href = `portal-selection.html?tenant=${encodeURIComponent(tenantId)}`;
        return;
      }

      const org = mine?.organization;
      orgState = org || null;
      settingsState = { ...settings, portalCatalog: admin.portalCatalog || PORTAL_CATALOG };

      const orgName = org?.name || "Organization";
      document.title = orgName;
      $("#workspace-title").textContent = orgName;
      $("#workspace-subtitle").textContent = `${org?.organizationId || tenantId} • ${org?.businessType || settings.businessType || "company"}`;
      $("#portal-hub-heading").textContent = orgName;
      $("#portal-hub-summary").textContent = `One installed workspace app for ${orgName}'s selected modules, organization data, and secure workflows.`;
      $("#profile-name").textContent = orgName;
      const monthly = Number(settings.monthlyAmount || settings.estimatedTotal || org?.monthlyAmount || org?.estimatedTotal || 0) || 0;
      $("#subscription-status").textContent = `${org?.subscriptionStatus ? `Subscription: ${org.subscriptionStatus}` : "Subscription: active"}${monthly ? ` • KSh ${monthly.toLocaleString("en-KE")} / month` : ""}`;
      $("#notification-badge").textContent = `${Math.max(1, (settings.installedPortals || []).length)} notifications`;
      $("#hub-kpi-branches").textContent = settings.branches?.length || org?.metrics?.branches || 0;
      $("#hub-kpi-departments").textContent = settings.departments?.length || 0;
      $("#hub-kpi-session").textContent = `${tenantId} isolated`;
      $("#manage-portals-link").href = `portal-selection.html?tenant=${encodeURIComponent(tenantId)}`;

      refreshPortalState(settingsState, org);
      $("#portal-search")?.addEventListener("input", (event) => renderPortals(event.currentTarget.value, org));
      $("#installed-portals")?.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-portal-uninstall]");
        if (!button) return;
        uninstallPortal(button.dataset.portalUninstall).catch((err) => {
          window.EnterpriseCore?.notify?.("Uninstall failed", err.message, "error");
        });
      });
    } catch (err) {
      window.EnterpriseCore?.notify?.("Portal Hub", err.message, "error");
    }
  });
})();
