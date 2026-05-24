(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const ORGS_KEY = "platform_organizations_v1";
  const SETTINGS_KEY = "enterprise_org_settings_v1";
  const PORTAL_CATALOG = window.EnterpriseModules?.catalog || [];
  const VALID_PORTAL_IDS = window.EnterpriseModules?.validIds || new Set(PORTAL_CATALOG.map((portal) => portal.id));
  const pricingApi = () => window.BytewavePricing || {
    priceFor: () => 0,
    totalFor: () => 0,
    formatMonthly: (amount) => `KSh ${Number(amount || 0).toLocaleString("en-KE")} / month`,
    pricingMapFor: () => ({}),
  };

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

  const isLocalDevelopment = () => ["localhost", "127.0.0.1", ""].includes(location.hostname);

  const enrichPortal = (portal) => ({
    ...(window.EnterpriseModules?.get?.(portal?.id) || {}),
    ...(portal || {}),
  });

  const fetchJson = async (url, opts) => {
    const res = await fetch(url, opts);
    const text = await res.text();
    try {
      return { res, data: text ? JSON.parse(text) : null };
    } catch {
      const err = new Error("Service returned an invalid response");
      err.invalidJson = true;
      throw err;
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

  const localAdminPayload = (tenant) => {
    window.EnterpriseCore?.setTenant?.(tenant);
    const rawSettings = readJson(SETTINGS_KEY, {});
    return {
      ok: true,
      tenantId: tenant,
      users: readJson("enterprise_org_users_v1", []),
      settings: {
        ...rawSettings,
        installedPortals: (rawSettings.installedPortals || []).filter((id) => VALID_PORTAL_IDS.has(id)),
        modules: (rawSettings.modules || []).filter((id) => VALID_PORTAL_IDS.has(id) || ["dashboard", "orders", "crm", "documents"].includes(id)),
        navigation: (rawSettings.navigation || []).filter((id) => VALID_PORTAL_IDS.has(id)),
      },
      portalCatalog: PORTAL_CATALOG,
    };
  };

  let catalog = [];
  let settings = {};
  let org = null;
  let selected = new Set();
  const TECHNOLOGY_DEVICE_PORTALS = ["admin", "technology", "branch", "inventory", "customer", "sales", "finance", "staff", "reporting", "analytics", "agent"];

  const portalPricing = (portal) => {
    const monthly = Math.max(0, Number(settings.portalPricing?.[portal.id] ?? pricingApi().priceFor(portal.id)) || 0);
    const serviceCost = monthly ? pricingApi().formatMonthly(monthly) : "Included";
    const servicePlan = settings.servicePricing?.plan || "Starter or Business";
    return {
      cost: serviceCost,
      plan: ["director", "device-branch", "team-leader", "device-departments"].includes(portal.id) ? "Business" : servicePlan,
      monthly,
      subscription: `${portal.title} runs inside the registered ${settings.serviceTitle || "organization"} workspace. Install only this portal when that role is needed; more portals can be added later under the same organization subscription.`,
    };
  };

  const recommendedPortalIds = () => {
    const ids = settings.allowedPortals?.length ? settings.allowedPortals : settings.recommendedPortals?.length ? settings.recommendedPortals : settings.installedPortals || [];
    const serviceKey = String(settings.businessType || settings.serviceTitle || "").toLowerCase();
    if (serviceKey === "technology-devices" || serviceKey === "technology devices" || serviceKey === "technology-services") {
      return new Set(TECHNOLOGY_DEVICE_PORTALS.filter((id) => VALID_PORTAL_IDS.has(id)));
    }
    return new Set((ids || []).filter((id) => VALID_PORTAL_IDS.has(id)));
  };

  const portalUrl = (portal) => {
    const tenant = window.EnterpriseCore?.currentTenantId?.() || "";
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

  const load = async () => {
    const tenant = new URLSearchParams(location.search).get("tenant") || window.EnterpriseCore?.currentTenantId?.();
    if (tenant) window.EnterpriseCore?.setTenant?.(tenant);
    const session = window.EnterpriseCore?.requireOrganizationSession?.(tenant);
    if (!session?.tenantId) {
      location.href = "organization-login.html";
      return;
    }
    window.EnterpriseCore?.setTenant?.(session.tenantId);
    let admin;
    let mine;
    try {
      const responses = await Promise.all([fetchJson("/api/org-admin"), fetchJson("/api/organizations?scope=mine")]);
      if (!responses[0].res.ok || !responses[0].data?.ok) throw new Error(responses[0].data?.error || "Unable to load portals");
      admin = responses[0].data;
      mine = responses[1].res.ok && responses[1].data?.ok ? responses[1].data : { ok: true, organization: localOrg(session.tenantId) };
    } catch (apiErr) {
      if (!isLocalDevelopment()) throw apiErr;
      admin = localAdminPayload(session.tenantId);
      mine = { ok: true, organization: localOrg(session.tenantId) };
    }
    if (!admin.ok) throw new Error(admin.error || "Unable to load portals");
    settings = admin.settings || {};
    const recommended = recommendedPortalIds();
    catalog = (admin.portalCatalog || [])
      .map(enrichPortal)
      .filter((portal) => VALID_PORTAL_IDS.has(portal.id))
      .map((portal) => ({ ...portal, recommended: recommended.has(portal.id) }));
    org = mine?.organization || null;
    if (settings.agreementAccepted !== true) {
      location.href = `organization-agreement.html?tenant=${encodeURIComponent(window.EnterpriseCore?.currentTenantId?.() || "")}`;
      return;
    }
    const orgName = org?.name || "Organization";
    const orgCode = org?.organizationId || window.EnterpriseCore?.currentTenantId?.() || tenant || "Organization ID";
    $("#portal-org-name").textContent = `${orgName}`;
    $("#portal-org-id").textContent = orgCode;
    $("#portal-org-context").textContent = `${orgName} • ${orgCode}`;
    $("#portal-workspace-link").href = `organization-workspace.html?tenant=${encodeURIComponent(window.EnterpriseCore?.currentTenantId?.() || tenant || "")}`;
    const subtitle = $(".portal-manager-subtitle");
    if (subtitle) {
      subtitle.textContent = settings.serviceTitle
        ? `All portals are available. ${settings.serviceTitle} recommendations are marked for this organization.`
        : "All portals are available. Choose the modules your organization needs.";
    }
    render();
  };

  const render = () => {
    const installed = new Set(settings.installedPortals || []);
    selected = new Set([...selected].filter((id) => !installed.has(id)));
    $("#portal-grid").innerHTML = catalog
      .map(
        (portal) => {
          const isInstalled = installed.has(portal.id);
          const isSelected = selected.has(portal.id);
          const pricing = portalPricing(portal);
          return `
          <article class="portal-install-card ${isInstalled ? "is-installed" : "is-selectable"} ${isSelected ? "is-selected" : ""}" data-portal-card="${escapeHtml(portal.id)}">
            <div class="portal-card-top">
              <div>
                <span class="module-category">${escapeHtml(portal.category || "Module")}</span>
                <h3>${escapeHtml(portal.title)}</h3>
              </div>
              ${
                isInstalled
                  ? `<span class="portal-status">Installed</span>`
                  : `${portal.recommended ? `<span class="portal-status">Recommended</span>` : ""}<label class="portal-select-control">
                      <input type="checkbox" data-portal-check="${escapeHtml(portal.id)}" ${isSelected ? "checked" : ""} />
                      Select
                    </label>`
              }
            </div>
            <p>${escapeHtml(portal.description)}</p>
            ${portal.componentRole ? `<p class="module-role">${escapeHtml(portal.componentRole)}</p>` : ""}
            <ul class="portal-feature-list">
              ${(portal.features || []).map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}
            </ul>
            ${
              portal.sharedResources?.length
                ? `<div class="module-connectors">${portal.sharedResources.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
                : ""
            }
            <div class="portal-pricing-details">
              <div><strong>${escapeHtml(pricing.cost)}</strong><span>Estimated portal subscription</span></div>
              <div><strong>${escapeHtml(pricing.plan)}</strong><span>Recommended plan</span></div>
              <p>${escapeHtml(pricing.subscription)}</p>
            </div>
            ${isInstalled ? "" : `<span class="portal-status">${isSelected ? "Selected for unified install" : "Ready to install"}</span>`}
            <div class="portal-card-actions">
              ${
                isInstalled
                  ? `<a class="btn primary" href="${escapeHtml(portalUrl(portal))}">Open Portal</a><button class="btn" data-portal-deactivate="${escapeHtml(portal.id)}" type="button">Uninstall</button>`
                  : `<button class="btn" data-portal-toggle="${escapeHtml(portal.id)}" type="button">${isSelected ? "Remove from install" : "Add to install"}</button>`
              }
            </div>
          </article>`;
        },
      )
      .join("");
    renderBulkBar();
  };

  const renderBulkBar = () => {
    const count = selected.size;
    const installed = new Set(settings.installedPortals || []);
    const available = catalog.filter((portal) => !installed.has(portal.id));
    const hasAvailable = available.length > 0;
    const names = [...selected]
      .map((id) => catalog.find((portal) => portal.id === id)?.title)
      .filter(Boolean)
      .slice(0, 3);
    const countEl = $("#portal-selected-count");
    const summaryEl = $("#portal-selected-summary");
    const installBtn = $("#portal-install-selected");
    const clearBtn = $("#portal-clear-selection");
    if (countEl) countEl.textContent = `${count} selected`;
    if (summaryEl) {
      const monthlyTotal = pricingApi().totalFor([...selected]);
      summaryEl.textContent = count
        ? `${names.join(", ")}${count > names.length ? ` and ${count - names.length} more` : ""} will install as one MAPPHEX app. Monthly total: ${pricingApi().formatMonthly(monthlyTotal)}.`
        : available.length
          ? "Pick from the portals that match this organization's registered service."
          : "All portals for this registered service are already installed.";
    }
    if (installBtn) {
      const disabled = count === 0 || !hasAvailable;
      installBtn.disabled = disabled;
      installBtn.classList.toggle("is-disabled", disabled);
      installBtn.setAttribute("aria-disabled", String(disabled));
      installBtn.textContent = hasAvailable ? (count === 0 ? "Select Portals First" : "Install Selected Portals") : "All Portals Installed";
    }
    if (clearBtn) {
      clearBtn.disabled = count === 0;
      clearBtn.setAttribute("aria-disabled", String(count === 0));
    }
    const coreBtn = $("#portal-select-core");
    const allBtn = $("#portal-select-all");
    [coreBtn, allBtn].forEach((btn) => {
      if (!btn) return;
      btn.disabled = !hasAvailable;
      btn.classList.toggle("is-disabled", !hasAvailable);
      btn.setAttribute("aria-disabled", String(!hasAvailable));
    });
  };

  const toggleSelection = (portalId, force) => {
    const installed = new Set(settings.installedPortals || []);
    if (installed.has(portalId)) return;
    const shouldSelect = typeof force === "boolean" ? force : !selected.has(portalId);
    if (shouldSelect) selected.add(portalId);
    else selected.delete(portalId);
    render();
  };

  const selectCoreSet = () => {
    const installed = new Set(settings.installedPortals || []);
    let changed = false;
    ["admin", "branch", "departments", "staff", "inventory", "finance", "reporting", "analytics"].forEach((id) => {
      if (!installed.has(id) && catalog.some((portal) => portal.id === id)) {
        selected.add(id);
        changed = true;
      }
    });
    if (!changed) {
      const progress = $("#portal-progress");
      if (progress) progress.textContent = "All matching core portals are already installed.";
    }
    render();
  };

  const selectAllAvailable = () => {
    const installed = new Set(settings.installedPortals || []);
    let changed = false;
    catalog.forEach((portal) => {
      if (!installed.has(portal.id)) {
        selected.add(portal.id);
        changed = true;
      }
    });
    if (!changed) {
      const progress = $("#portal-progress");
      if (progress) progress.textContent = "All matching portals are already installed.";
    }
    render();
  };

  const promptWorkspacePwa = async () => {
    if (!window.MapphexPWA?.promptInstall) return { ok: false, reason: "pwa-unavailable" };
    return window.MapphexPWA.promptInstall();
  };

  const promptPortalApp = async (portalId) => {
    const portal = catalog.find((item) => item.id === portalId);
    if (!portal) return;
    const progress = $("#portal-progress");
    if (progress) progress.textContent = `Preparing ${portal.title} app install...`;
    const result = await promptWorkspacePwa();
    const message = result?.ok
      ? `${portal.title} app installed. Opening portal...`
      : `${portal.title} is enabled. Open it and use the browser menu to install this portal app.`;
    if (progress) progress.textContent = message;
    showPwaHelp(message, portal);
    if (result?.ok) window.setTimeout(() => (location.href = portalUrl(portal)), 900);
  };

  const openWorkspace = () => {
    location.href = `organization-workspace.html?tenant=${encodeURIComponent(window.EnterpriseCore?.currentTenantId?.() || "")}`;
  };

  const showPwaHelp = (message, portal = null) => {
    const help = $("#pwa-install-help");
    const text = $("#pwa-install-help-text");
    const link = $("#pwa-open-workspace");
    if (link) {
      link.href = portal ? portalUrl(portal) : `organization-workspace.html?tenant=${encodeURIComponent(window.EnterpriseCore?.currentTenantId?.() || "")}`;
      link.textContent = portal ? `Open ${portal.title}` : "Open Workspace";
    }
    if (text && message) text.textContent = message;
    if (help) help.hidden = false;
  };

  const normalizePageCopy = () => {
    const subtitle = $(".portal-manager-subtitle");
    const helpText = $("#pwa-install-help-text");
    if (subtitle) subtitle.textContent = "All portals are available. Recommended portals are marked for this organization.";
    if (helpText) {
      helpText.textContent =
        "After a portal is enabled, open that portal and install it from your browser menu if the install prompt does not appear.";
    }
  };

  const manualInstallMessage = () => {
    const ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/i.test(ua)) {
      return "Portal is enabled. On iPhone or iPad, open the portal, tap Share, then Add to Home Screen.";
    }
    if (/Android/i.test(ua)) {
      return "Portal is enabled. Open the portal, then use the browser menu to install the portal app or add it to the home screen.";
    }
    return "Portal is enabled. Open the portal, then use Chrome or Edge menu to install it as an app.";
  };

  const install = async (portalIds, options = {}) => {
    const ids = Array.from(new Set((Array.isArray(portalIds) ? portalIds : [portalIds]).filter(Boolean)));
    if (!ids.length) return;
    const progress = $("#portal-progress");
    if (progress) progress.textContent = `Installing ${ids.length} portal${ids.length === 1 ? "" : "s"}...`;
    let data;
    try {
      const response = await fetchJson("/api/org-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "install-portals",
          portalIds: ids,
          portalPricing: pricingApi().pricingMapFor(ids),
          monthlyAmount: pricingApi().totalFor(ids),
        }),
      });
      data = response.data;
      if (!response.res.ok || !data?.ok) throw new Error(data?.error || "Install failed");
    } catch (apiErr) {
      if (!isLocalDevelopment()) throw apiErr;
      const portals = ids.map((id) => PORTAL_CATALOG.find((item) => item.id === id)).filter(Boolean);
      if (portals.length !== ids.length) throw new Error("One or more portals were not found");
      const installedPortals = Array.from(new Set([...(settings.installedPortals || []), ...ids]));
      const modulePermissions = { ...(settings.modulePermissions || {}) };
      ids.forEach((portalId) => {
        modulePermissions[portalId] = Array.from(new Set(window.EnterpriseModules?.permissionsFor?.(portalId) || [`${portalId}.read`, `${portalId}.manage`]));
      });
      settings = {
        ...settings,
        installedPortals,
        modules: Array.from(new Set([...(settings.modules || []), ...ids])),
        navigation: Array.from(new Set([...(settings.navigation || []), ...ids])),
        modulePermissions,
        selectedComponents: installedPortals,
        portalPricing: { ...(settings.portalPricing || {}), ...pricingApi().pricingMapFor(ids) },
        monthlyAmount: pricingApi().totalFor(installedPortals),
        estimatedTotal: pricingApi().totalFor(installedPortals),
        onboardingComplete: true,
        updatedAt: new Date().toISOString(),
      };
      writeJson(SETTINGS_KEY, settings);
      data = { ok: true, portal: portals[0], portals, settings };
    }
    settings = data.settings;
    selected.clear();
    render();
    window.EnterpriseCore?.notify?.("Portals installed", `${ids.length} portal${ids.length === 1 ? "" : "s"} enabled`);
    if (options.installPwa) {
      if (progress) progress.textContent = "Modules enabled. Installing the unified workspace app...";
      const pwaResult = await promptWorkspacePwa();
      if (pwaResult?.ok) {
        if (progress) progress.textContent = "MAPPHEX installed. Opening workspace...";
        setTimeout(openWorkspace, 900);
        return;
      }
      const reason = pwaResult?.reason;
      const message =
        reason === "dismissed"
          ? "Modules are installed. You dismissed the app install prompt; click Try install prompt again or open the workspace."
          : manualInstallMessage();
      if (progress) progress.textContent = message;
      showPwaHelp(message);
      if (reason !== "dismissed") window.setTimeout(openWorkspace, 2800);
      return;
    }
    if (progress && !options.installPwa) progress.textContent = "Portal installation complete. Use each installed portal card to open or install that portal app.";
  };

  const deactivate = async (portalId) => {
    if (!portalId) return;
    const progress = $("#portal-progress");
    if (progress) progress.textContent = "Deactivating portal...";
    try {
      const response = await fetchJson("/api/org-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "uninstall-portal", portalId }),
      });
      if (!response.res.ok || !response.data?.ok) throw new Error(response.data?.error || "Deactivate failed");
      settings = response.data.settings;
    } catch (apiErr) {
      if (!isLocalDevelopment()) throw apiErr;
      const remove = new Set([portalId]);
      const modulePermissions = { ...(settings.modulePermissions || {}) };
      delete modulePermissions[portalId];
      settings = {
        ...settings,
        installedPortals: (settings.installedPortals || []).filter((id) => !remove.has(id)),
        modules: (settings.modules || []).filter((id) => !remove.has(id)),
        navigation: (settings.navigation || []).filter((id) => !remove.has(id)),
        modulePermissions,
        updatedAt: new Date().toISOString(),
      };
      writeJson(SETTINGS_KEY, settings);
    }
    window.EnterpriseCore?.notify?.("Portal deactivated", `${portalId} disabled`);
    if (progress) progress.textContent = "Portal deactivated. It can be activated again later.";
    render();
  };

  document.addEventListener("DOMContentLoaded", () => {
    normalizePageCopy();
    document.addEventListener("click", guardPortalLink);
    $("#portal-grid")?.addEventListener("click", (event) => {
      const check = event.target.closest("input[data-portal-check]");
      if (check) {
        toggleSelection(check.dataset.portalCheck, check.checked);
        return;
      }
      const toggle = event.target.closest("button[data-portal-toggle]");
      if (toggle) {
        toggleSelection(toggle.dataset.portalToggle);
        return;
      }
      const installApp = event.target.closest("button[data-portal-install-app]");
      if (installApp) {
        promptPortalApp(installApp.dataset.portalInstallApp).catch((err) => {
          const progress = $("#portal-progress");
          if (progress) progress.textContent = "Portal app install failed. Open the portal and install from your browser menu.";
          window.EnterpriseCore?.notify?.("Portal app install", err.message, "error");
        });
        return;
      }
      const deactivateBtn = event.target.closest("button[data-portal-deactivate]");
      if (deactivateBtn) {
        deactivate(deactivateBtn.dataset.portalDeactivate).catch((err) => {
          const progress = $("#portal-progress");
          if (progress) progress.textContent = "Deactivate failed. Try again.";
          window.EnterpriseCore?.notify?.("Deactivate failed", err.message, "error");
        });
        return;
      }
      const card = event.target.closest("[data-portal-card]");
      if (card && !event.target.closest("a,button,input,label")) toggleSelection(card.dataset.portalCard);
    });
    $("#portal-select-core")?.addEventListener("click", selectCoreSet);
    $("#portal-select-all")?.addEventListener("click", selectAllAvailable);
    $("#portal-clear-selection")?.addEventListener("click", () => {
      selected.clear();
      render();
    });
    $("#portal-install-selected")?.addEventListener("click", (event) => {
      const btn = event.currentTarget;
      if (btn.disabled || btn.getAttribute("aria-disabled") === "true" || !selected.size) {
        const progress = $("#portal-progress");
        if (progress) progress.textContent = catalog.every((portal) => (settings.installedPortals || []).includes(portal.id)) ? "All matching portals are already installed." : "Select at least one portal before installing.";
        renderBulkBar();
        return;
      }
      btn.disabled = true;
      btn.textContent = "Installing portals...";
      install([...selected], { installPwa: true })
        .catch((err) => {
          const progress = $("#portal-progress");
          if (progress) progress.textContent = "Installation failed. Try again.";
          window.EnterpriseCore?.notify?.("Install failed", err.message, "error");
        })
        .finally(() => {
          btn.textContent = "Install Selected Portals";
          renderBulkBar();
        });
    });
    $("#pwa-retry-install")?.addEventListener("click", async () => {
      const progress = $("#portal-progress");
      if (progress) progress.textContent = "Trying the device app install prompt...";
      const result = await promptWorkspacePwa();
      if (result?.ok) {
        if (progress) progress.textContent = "MAPPHEX installed. Opening workspace...";
        setTimeout(openWorkspace, 900);
      } else {
        const message = manualInstallMessage();
        if (progress) progress.textContent = message;
        showPwaHelp(message);
        window.setTimeout(openWorkspace, 2800);
      }
    });
    window.MapphexPWA?.onStatus?.((status) => {
      const help = $("#pwa-install-help");
      if (status.promptReady && help?.hidden === false) {
        $("#pwa-install-help-text").textContent = "The app install prompt is ready. Click Try install prompt again to install MAPPHEX on this device.";
      }
    });
    load().catch((err) => window.EnterpriseCore?.notify?.("Portal manager", err.message, "error"));
  });
})();
