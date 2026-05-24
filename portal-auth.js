(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const params = new URLSearchParams(location.search);
  const portalId = String(params.get("portal") || "workspace").trim().toLowerCase();
  const tenant = params.get("tenant") || "";
  const catalog = window.EnterpriseModules?.catalog || [];
  const portal = window.EnterpriseModules?.get?.(portalId) || catalog.find((item) => item.id === portalId) || null;
  const technologyPortalIds = new Set(["technology"]);
  const branchPortalIds = new Set(["branch", "device-branch"]);
  let organizationContext = null;

  const allowsSelfRegistration = () => {
    if (portalId === "admin") return false;
    if (technologyPortalIds.has(portalId)) return false;
    return String(portal?.category || "").toLowerCase() !== "technology";
  };

  const fetchJson = async (url, opts = {}) => {
    const res = await fetch(url, opts);
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(text?.trim() || `Request failed with status ${res.status}`);
    }
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Request failed");
    return data;
  };

  const portalTarget = () => {
    const href = String(portal?.href || "organization-workspace.html");
    const url = new URL(href, location.origin);
    const targetTenant = tenant || window.EnterpriseCore?.getSession?.()?.tenantId || window.EnterpriseCore?.currentTenantId?.() || "";
    if (targetTenant) url.searchParams.set("tenant", targetTenant);
    if (portalId && portalId !== "workspace" && !href.includes("finance-workflow.html")) url.searchParams.set("portal", portalId);
    return `${url.pathname}${url.search}${url.hash}`;
  };

  const workspaceTarget = () => {
    const targetTenant = tenant || window.EnterpriseCore?.getSession?.()?.tenantId || window.EnterpriseCore?.currentTenantId?.() || "";
    return `organization-workspace.html${targetTenant ? `?tenant=${encodeURIComponent(targetTenant)}` : ""}`;
  };

  const roleCanOpen = (session) => {
    const role = String(session?.role || "").toLowerCase();
    if (["org_admin", "admin", "director"].includes(role)) return true;
    if (Array.isArray(session?.portalAccess) && session.portalAccess.includes(portalId)) return true;
    return (
      window.EnterpriseCore?.hasPermission?.(`${portalId}.read`, session) ||
      window.EnterpriseCore?.hasPermission?.(`${portalId}.manage`, session)
    );
  };

  const ensureAllowed = async (session) => {
    const data = await fetchJson("/api/org-admin");
    if (data.settings?.agreementAccepted !== true) {
      throw new Error("Organization setup is not complete. Ask the organization admin to accept the agreement first.");
    }
    const available = new Set(
      [
        ...(data.settings?.installedPortals || []),
        ...(data.settings?.selectedComponents || []),
        ...(data.settings?.allowedPortals || []),
        ...(data.settings?.recommendedPortals || []),
      ].map(String),
    );
    if (portalId !== "workspace" && !available.has(portalId)) throw new Error("This portal is not available for your organization");
    if (portalId !== "workspace" && !roleCanOpen(session)) throw new Error("Access denied for this portal");
  };

  const organizationNameFor = (body) => body.organizationName || organizationContext?.name || "";
  const identifierFor = (body) => body.identifier || organizationContext?.contact?.email || organizationContext?.admin?.email || tenant || "";

  const loginPayload = (body) => ({
    action: "organization-login",
    organizationName: organizationNameFor(body),
    identifier: identifierFor(body),
    email: body.email || identifierFor(body),
    password: body.portalPassword,
    portalId,
  });

  const registerPayload = (body) => ({
    action: "register-portal-user",
    organizationName: organizationNameFor(body),
    identifier: identifierFor(body),
    userName: body.name,
    email: body.email,
    password: body.portalPassword,
    portalId,
  });

  const loadOrganizationContext = async () => {
    const session = window.EnterpriseCore?.getSession?.();
    if (!session?.tenantId && !tenant) return null;
    try {
      return (await fetchJson("/api/organizations?scope=mine")).organization || null;
    } catch {
      return null;
    }
  };

  const applyOrganizationContext = (organization) => {
    if (!organization) return;
    organizationContext = organization;
    document.querySelectorAll('input[name="organizationName"]').forEach((input) => {
      if (!input.value) input.value = organization.name || "";
    });
    document.querySelectorAll('input[name="identifier"]').forEach((input) => {
      if (!input.value) input.value = organization.contact?.email || "";
    });
  };

  document.addEventListener("DOMContentLoaded", () => {
    const session = window.EnterpriseCore?.getSession?.();
    const currentTenant = tenant || session?.tenantId || window.EnterpriseCore?.currentTenantId?.() || "";
    if (currentTenant) window.EnterpriseCore?.setTenant?.(currentTenant);
    const title = portal?.title || "MAPPHEX Portal";
    document.title = `${title} Login`;
    $("#portal-auth-title").textContent = `${title} Login`;
    $("#portal-auth-subtitle").textContent =
      portalId === "admin"
        ? "Use your organization admin account. Admin access is created by the organization owner."
        : "Use your organization account, or register your portal account before opening this portal.";
    if (branchPortalIds.has(portalId)) {
      document.querySelectorAll('input[name="organizationName"], input[name="identifier"]').forEach((input) => {
        input.required = false;
        input.closest(".field")?.setAttribute("hidden", "");
      });
      $("#portal-auth-subtitle").textContent = "Use your branch account to open this portal.";
    }
    $("#portal-login-btn").textContent = `Open ${title}`;
    if (!allowsSelfRegistration()) $("#portal-register-btn").hidden = true;
    $("#portal-auth-back").href = workspaceTarget();
    const form = $("#portal-login-form");
    if (form?.email) form.email.value = "";
    if (form?.portalPassword) form.portalPassword.value = "";
    window.EnterpriseCore?.rememberLogin?.restore?.(`portal-${portalId}`, {
      checkbox: form?.remember,
      fields: {
        organizationName: form?.organizationName,
        identifier: form?.identifier,
        name: form?.name,
        email: form?.email,
      },
    });
    loadOrganizationContext().then(applyOrganizationContext).catch(() => null);
    $("#portal-login-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formEl = event.currentTarget || form;
      const result = $("#portal-auth-result");
      result.style.color = "var(--muted)";
      const intent = event.submitter?.value === "register" ? "register" : "login";
      result.textContent = intent === "register" ? "Creating your portal account..." : "Checking access...";
      const body = Object.fromEntries(new FormData(formEl).entries());
      try {
        if (intent === "register") {
          await fetchJson("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(registerPayload(body)),
          });
          result.textContent = "Account created. Opening portal...";
        }
        const data = await fetchJson("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(loginPayload(body)),
        });
        window.EnterpriseCore?.setTenant?.(data.session.tenantId);
        const session = window.EnterpriseCore?.setSession?.(
          {
            email: data.session.sub,
            userId: data.session.userId,
            permissions: data.session.permissions || [],
            portalAccess: data.session.portalAccess || [],
            role: data.session.role || "staff",
            tenantId: data.session.tenantId,
            token: data.token,
            organizationId: data.organization?.organizationId,
            expiresAt: new Date(data.session.exp).toISOString(),
          },
          body.remember === "on",
        );
        window.EnterpriseCore?.rememberLogin?.save?.(`portal-${portalId}`, {
          checkbox: formEl?.remember,
          fields: {
            organizationName: formEl?.organizationName,
            identifier: formEl?.identifier,
            name: formEl?.name,
            email: formEl?.email,
          },
        });
        await ensureAllowed(session);
        result.style.color = "var(--ok)";
        result.textContent = "Access approved. Opening portal...";
        location.replace(portalTarget());
      } catch (err) {
        result.style.color = "var(--danger)";
        result.textContent = err.message;
      }
    });
  });
})();
