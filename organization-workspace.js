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

  const fetchJson = async (url) => {
    const res = await fetch(url);
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
    const session = window.EnterpriseCore?.getSession?.();
    if (session?.tenantId) return;
    event.preventDefault();
    location.href = "organization-login.html";
  };

  let portals = [];

  const portalUrl = (portal, org) => {
    const tenant = window.EnterpriseCore?.currentTenantId?.() || "";
    const href = String(portal?.href || "organization-workspace.html");
    try {
      const url = new URL(href, location.origin);
      url.searchParams.set("tenant", tenant);
      url.searchParams.set("portal", portal.id);
      if (org?.organizationId) url.searchParams.set("org", org.organizationId);
      return url.href;
    } catch {
      return `${href}${href.includes("?") ? "&" : "?"}tenant=${encodeURIComponent(tenant)}&portal=${encodeURIComponent(portal.id)}`;
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
            <a class="btn primary" href="${escapeHtml(portalUrl(portal, org))}">Open Portal</a>
          </article>`,
      )
      .join("");
    target.innerHTML = installedCards;
  };

  document.addEventListener("DOMContentLoaded", async () => {
    document.addEventListener("click", guardPortalLink);
    const fromQuery = new URLSearchParams(location.search).get("tenant");
    const tenant = fromQuery || window.EnterpriseCore?.currentTenantId?.();
    if (tenant) window.EnterpriseCore?.setTenant?.(tenant);
    const session = window.EnterpriseCore?.getSession?.();
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
      } catch {
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
      const installed = new Set((settings.installedPortals || []).filter((id) => VALID_PORTAL_IDS.has(id)));
      portals = (admin.portalCatalog || [])
        .filter((portal) => installed.has(portal.id))
        .map((portal) => ({ ...portal, summary: portalSummary(portal, settings) }));

      const orgName = org?.name || "Organization";
      $("#workspace-title").textContent = "BYTEWAAVE";
      $("#workspace-subtitle").textContent = `${org?.organizationId || tenantId} • ${org?.businessType || settings.businessType || "company"}`;
      $("#portal-hub-heading").textContent = `BYTEWAAVE - ${orgName}`;
      $("#portal-hub-summary").textContent = `One installed workspace app for ${orgName}'s selected modules, organization data, and secure workflows.`;
      $("#profile-name").textContent = orgName;
      $("#subscription-status").textContent = org?.subscriptionStatus ? `Subscription: ${org.subscriptionStatus}` : "Subscription: active";
      $("#notification-badge").textContent = `${Math.max(1, portals.length)} notifications`;
      $("#hub-kpi-portals").textContent = portals.length;
      $("#hub-kpi-branches").textContent = settings.branches?.length || org?.metrics?.branches || 0;
      $("#hub-kpi-departments").textContent = settings.departments?.length || 0;
      $("#hub-kpi-session").textContent = `${tenantId} isolated`;
      $("#manage-portals-link").href = `portal-selection.html?tenant=${encodeURIComponent(tenantId)}`;

      renderPortals("", org);
      $("#portal-search")?.addEventListener("input", (event) => renderPortals(event.currentTarget.value, org));
    } catch (err) {
      window.EnterpriseCore?.notify?.("Portal Hub", err.message, "error");
    }
  });
})();
