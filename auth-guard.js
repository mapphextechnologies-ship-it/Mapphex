(() => {
  "use strict";

  const loginUrl = "organization-login.html";
  const deniedUrl = "access-denied.html";
  const publicPages = new Set([
    "home",
    "access-denied",
    "organization-login",
    "organization-register",
    "agent-login",
    "agent-register",
    "branch-login",
    "branch-register",
    "director-login",
    "director-register",
    "teamleader-login",
    "teamleader-register",
  ]);

  const roleAllows = (session, roles = []) => {
    const role = String(session?.role || "").toLowerCase();
    if (!roles.length) return true;
    if (["org_admin", "admin", "director"].includes(role)) return true;
    return roles.includes(role);
  };

  const deny = () => {
    if (!location.pathname.endsWith(`/${deniedUrl}`) && !location.pathname.endsWith(deniedUrl)) location.replace(deniedUrl);
  };

  const guard = () => {
    const core = window.EnterpriseCore;
    if (!core) return;
    const page = document.body?.dataset?.page || "";
    if (publicPages.has(page)) return;

    const expectedTenant = new URLSearchParams(location.search).get("tenant") || core.currentTenantId?.();
    const session = core.requireOrganizationSession?.(expectedTenant);
    if (!session?.tenantId) {
      location.replace(`${loginUrl}${expectedTenant ? `?tenant=${encodeURIComponent(expectedTenant)}` : ""}`);
      return;
    }

    const params = new URLSearchParams(location.search);
    const portal = String(params.get("portal") || params.get("module") || "").toLowerCase();
    const rolePages = {
      "agent-dashboard": ["agent"],
      "branch-dashboard": ["branch", "manager", "operations"],
      "director-dashboard": ["director"],
      "teamleader-dashboard": ["teamleader", "manager"],
      "organization-admin": ["org_admin", "admin"],
    };
    if (!roleAllows(session, rolePages[page] || [])) {
      deny();
      return;
    }

    if (page === "organization-module" && portal) {
      const readPerm = `${portal}.read`;
      const managePerm = `${portal}.manage`;
      const role = String(session.role || "").toLowerCase();
      if (!["org_admin", "admin", "director"].includes(role) && !core.hasPermission?.(readPerm, session) && !core.hasPermission?.(managePerm, session)) {
        deny();
      }
    }
  };

  guard();
})();
