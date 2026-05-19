(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const params = new URLSearchParams(location.search);
  const portalId = String(params.get("portal") || "workspace").trim().toLowerCase();
  const tenant = params.get("tenant") || "";
  const modeParam = String(params.get("mode") || "login").toLowerCase();
  const catalog = window.EnterpriseModules?.catalog || [];
  const portal = window.EnterpriseModules?.get?.(portalId) || catalog.find((item) => item.id === portalId) || null;

  const fetchJson = async (url, opts = {}) => {
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Request failed");
    return data;
  };

  const portalTarget = () => {
    const href = String(portal?.href || "organization-workspace.html");
    const url = new URL(href, location.origin);
    if (tenant) url.searchParams.set("tenant", tenant);
    if (portalId && portalId !== "workspace") url.searchParams.set("portal", portalId);
    return `${url.pathname}${url.search}${url.hash}`;
  };

  const setMode = (mode) => {
    const safeMode = ["login", "register", "forgot"].includes(mode) ? mode : "login";
    $("#portal-login-form").hidden = safeMode !== "login";
    $("#portal-register-form").hidden = safeMode !== "register";
    $("#portal-forgot-form").hidden = safeMode !== "forgot";
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      const active = button.dataset.authMode === safeMode;
      button.classList.toggle("primary", active);
    });
    params.set("mode", safeMode);
    history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
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
    const installed = new Set((data.settings?.installedPortals || []).map(String));
    if (portalId !== "workspace" && !installed.has(portalId)) throw new Error("This portal is not installed for your organization");
    if (portalId !== "workspace" && !roleCanOpen(session)) throw new Error("Access denied for this portal");
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (tenant) window.EnterpriseCore?.setTenant?.(tenant);
    const title = portal?.title || "Bytewave Portal";
    document.title = `${title} Login • Bytewave`;
    $("#portal-auth-title").textContent = `${title} Login`;
    $("#portal-auth-subtitle").textContent = "Use your organization account. New users must be invited by an admin or HR.";
    $("#portal-login-btn").textContent = `Open ${title}`;
    $("#portal-auth-back").href = `organization-workspace.html${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ""}`;
    setMode(modeParam);

    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.authMode));
    });

    $("#portal-login-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const result = $("#portal-auth-result");
      result.style.color = "var(--muted)";
      result.textContent = "Checking access...";
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      try {
        const data = await fetchJson("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "organization-login",
            organizationName: body.organizationName,
            identifier: body.identifier,
            email: body.email,
            password: body.password,
            portalId,
          }),
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
        await ensureAllowed(session);
        result.style.color = "var(--ok)";
        result.textContent = "Access approved. Opening portal...";
        location.replace(portalTarget());
      } catch (err) {
        window.EnterpriseCore?.clearSession?.();
        result.style.color = "var(--danger)";
        result.textContent = err.message;
      }
    });

    $("#portal-register-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const result = $("#portal-auth-result");
      result.style.color = "var(--muted)";
      result.textContent = "Activating account...";
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      try {
        await fetchJson("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "activate-invite", token: body.token, password: body.password }),
        });
        result.style.color = "var(--ok)";
        result.textContent = "Account activated. Login with your new password.";
        setMode("login");
      } catch (err) {
        result.style.color = "var(--danger)";
        result.textContent = err.message;
      }
    });

    $("#portal-forgot-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const result = $("#portal-auth-result");
      result.style.color = "var(--muted)";
      result.textContent = "Creating password reset request...";
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      try {
        await fetchJson("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "request-password-reset", identifier: body.identifier, email: body.email, portalId }),
        });
        result.style.color = "var(--ok)";
        result.textContent = "Password reset request saved. Contact your organization admin for the secure reset token.";
      } catch (err) {
        result.style.color = "var(--danger)";
        result.textContent = err.message;
      }
    });
  });
})();
