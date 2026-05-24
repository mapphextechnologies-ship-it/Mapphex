(() => {
  "use strict";

  const loginUrl = "organization-login.html";
  const deniedUrl = "access-denied.html";
  const publicPages = new Set([
    "",
    "home",
    "index",
    "access-denied",
    "about",
    "contact",
    "features",
    "pricing",
    "security",
    "services",
    "service-detail",
    "faq",
    "help",
    "help-center",
    "privacy",
    "terms",
    "terms-conditions",
    "blog",
    "blogs",
    "news",
    "careers",
    "announcements",
    "organization-landing",
    "organization-login",
    "organization-register",
    "portal-auth",
    "agent-login",
    "agent-register",
    "branch-login",
    "branch-register",
    "director-login",
    "director-register",
    "teamleader-login",
    "teamleader-register",
    "super-admin-login",
  ]);

  const protectedPages = new Set([
    "agent-dashboard",
    "branch-dashboard",
    "director-dashboard",
    "teamleader-dashboard",
    "organization-agreement",
    "portal-selection",
    "organization-workspace",
    "organization-module",
    "organization-admin",
  ]);

  const organizationPages = new Set([
    "organization-agreement",
    "portal-selection",
    "organization-workspace",
    "organization-module",
    "organization-admin",
  ]);

  const adminPages = new Set(["organization-agreement", "portal-selection", "organization-admin"]);

  const roleAllows = (session, roles = []) => {
    const role = String(session?.role || "").toLowerCase();
    if (!roles.length) return true;
    if (["org_admin", "admin"].includes(role)) return true;
    if (role === "director" && !roles.includes("org_admin") && !roles.includes("admin")) return true;
    return roles.includes(role);
  };

  const loginTarget = (tenant = "") => `${loginUrl}${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ""}`;

  const deny = () => {
    if (!location.pathname.endsWith(`/${deniedUrl}`) && !location.pathname.endsWith(deniedUrl)) location.replace(deniedUrl);
  };

  const redirectToLogin = (tenant = "") => {
    location.replace(loginTarget(tenant));
  };

  const clearAndLogin = (tenant = "") => {
    window.EnterpriseCore?.clearSession?.();
    redirectToLogin(tenant);
  };

  const validateSignedSession = async (session, tenant) => {
    if (session?.localMode === true && ["localhost", "127.0.0.1", ""].includes(location.hostname)) return true;
    if (!session?.token) return false;
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "X-Tenant-ID": tenant || session.tenantId || "",
        },
      });
      if (!res.ok) return false;
      const data = await res.json().catch(() => null);
      const serverSession = data?.session || {};
      return data?.ok === true && String(serverSession.tenantId || "") === String(tenant || session.tenantId || "");
    } catch {
      return false;
    }
  };

  const guard = async () => {
    const core = window.EnterpriseCore;
    if (!core) return;
    const page = document.body?.dataset?.page || "";
    const params = new URLSearchParams(location.search);

    if (params.get("logout") === "1") {
      core.clearSession?.();
      if (publicPages.has(page)) {
        history.replaceState(null, "", location.pathname);
      } else {
        location.replace("index.html");
      }
      return;
    }

    if (publicPages.has(page)) return;
    if (!protectedPages.has(page)) return;

    const expectedTenant = params.get("tenant") || core.currentTenantId?.();
    const session = core.requireOrganizationSession?.(expectedTenant);
    if (!session?.tenantId) {
      redirectToLogin(expectedTenant);
      return;
    }

    if (organizationPages.has(page) && !(await validateSignedSession(session, session.tenantId))) {
      clearAndLogin(expectedTenant);
      return;
    }

    const portal = String(params.get("portal") || params.get("module") || "").toLowerCase();
    const rolePages = {
      "agent-dashboard": ["agent"],
      "branch-dashboard": ["branch", "manager", "operations"],
      "director-dashboard": ["director"],
      "teamleader-dashboard": ["teamleader", "manager"],
      "organization-admin": ["org_admin", "admin"],
      "organization-agreement": ["org_admin", "admin"],
      "portal-selection": ["org_admin", "admin"],
    };
    if (!roleAllows(session, rolePages[page] || [])) {
      deny();
      return;
    }

    if (adminPages.has(page) && !roleAllows(session, ["org_admin", "admin"])) {
      deny();
      return;
    }

    if (page === "organization-module" && portal) {
      const readPerm = `${portal}.read`;
      const managePerm = `${portal}.manage`;
      const role = String(session.role || "").toLowerCase();
      const portalAccess = Array.isArray(session.portalAccess) ? session.portalAccess : [];
      if (!["org_admin", "admin", "director"].includes(role) && !portalAccess.includes(portal) && !core.hasPermission?.(readPerm, session) && !core.hasPermission?.(managePerm, session)) {
        deny();
      }
    }
  };

  guard();
})();
