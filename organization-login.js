(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const ORGS_KEY = "platform_organizations_v1";
  const SETTINGS_KEY = "enterprise_org_settings_v1";

  const readJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const readOrganizations = () => {
    const byId = new Map();
    const addRows = (rows) => {
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        const id = row?.id || row?.organizationId || `${row?.name || "org"}-${byId.size}`;
        byId.set(id, row);
      });
    };

    addRows(readJson(ORGS_KEY, []));
    addRows(readJson(`tenant:default-company:${ORGS_KEY}`, []));
    try {
      for (let idx = 0; idx < localStorage.length; idx += 1) {
        const key = localStorage.key(idx);
        if (key && key.endsWith(`:${ORGS_KEY}`)) addRows(readJson(key, []));
      }
    } catch {
      // storage enumeration may be unavailable
    }
    return Array.from(byId.values());
  };

  const isLocalDevelopment = () => ["localhost", "127.0.0.1", ""].includes(location.hostname);

  const cleanId = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const digest = async (value) => {
    if (window.crypto?.subtle) {
      const bytes = new TextEncoder().encode(String(value || ""));
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    return btoa(unescape(encodeURIComponent(String(value || ""))));
  };

  const fetchJson = async (url, opts) => {
    const res = await fetch(url, opts);
    const text = await res.text();
    try {
      return { res, data: text ? JSON.parse(text) : null };
    } catch {
      throw new Error("Login service returned an invalid response");
    }
  };

  const localLogin = async (organizationName, identifier, password) => {
    const name = String(organizationName || "").trim().toLowerCase();
    const ident = String(identifier || "").trim().toLowerCase();
    const cleanIdent = cleanId(ident);
    const rows = readOrganizations();
    const passwordHash = await digest(password || "");
    const organization = (Array.isArray(rows) ? rows : []).find(
      (row) =>
        String(row.name || "").trim().toLowerCase() === name &&
        (row.id === cleanIdent ||
          String(row.organizationId || "").toLowerCase() === ident ||
          String(row.referenceCode || "").toLowerCase() === ident ||
          String(row.admin?.email || "").toLowerCase() === ident ||
          String(row.contact?.email || "").toLowerCase() === ident),
    );
    if (!organization || organization.localPasswordHash !== passwordHash) return null;
    return {
      ok: true,
      token: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      session: {
        role: "org_admin",
        sub: organization.admin?.email || ident,
        tenantId: organization.id,
        organizationId: organization.organizationId,
        exp: Date.now() + 8 * 60 * 60 * 1000,
      },
      organization,
      localMode: true,
    };
  };

  const nextUrlFor = async (tenantId) => {
    window.EnterpriseCore?.setTenant?.(tenantId);
    let data;
    try {
      const response = await fetchJson("/api/org-admin", { method: "GET" });
      data = response.data;
      if (!response.res.ok || !data?.ok) throw new Error(data?.error || "Unable to load organization workspace");
    } catch {
      data = { ok: true, settings: readJson(SETTINGS_KEY, {}) };
    }
    const settings = data.settings || {};
    const tenant = encodeURIComponent(tenantId);
    if (settings.agreementAccepted !== true) return `organization-agreement.html?tenant=${tenant}`;
    if (Array.isArray(settings.installedPortals) && settings.installedPortals.length) return `organization-workspace.html?tenant=${tenant}`;
    return `portal-selection.html?tenant=${tenant}`;
  };

  document.addEventListener("DOMContentLoaded", () => {
    const existing = window.EnterpriseCore?.getSession?.();
    if (existing?.tenantId) {
      nextUrlFor(existing.tenantId).then((url) => location.replace(url)).catch(() => null);
    }

    const loginForm = $("#organization-login-form");
    window.EnterpriseCore?.rememberLogin?.restore?.("organization", {
      checkbox: loginForm?.remember,
      fields: {
        organizationName: loginForm?.organizationName,
        identifier: loginForm?.identifier,
      },
    });

    loginForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget || loginForm;
      const result = $("#organization-login-result");
      result.style.color = "var(--muted)";
      result.textContent = "Verifying credentials...";
      const body = Object.fromEntries(new FormData(form).entries());
      if (!body.organizationName || !body.identifier || !body.password) {
        result.style.color = "var(--danger)";
        result.textContent = "Organization name, organization email or ID, and password are required.";
        return;
      }
      try {
        let data;
        try {
          const response = await fetchJson("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
            action: "organization-login",
            role: "org_admin",
            organizationName: body.organizationName,
            identifier: body.identifier,
            email: body.identifier,
            password: body.password,
            }),
          });
          data = response.data;
          if (!response.res.ok || !data?.ok) throw new Error(data?.error || "Login failed");
        } catch (apiErr) {
          const localData = await localLogin(body.organizationName, body.identifier, body.password);
          if (localData?.ok) {
            data = localData;
          } else if (!isLocalDevelopment()) {
            throw new Error(apiErr.message || "Login service unavailable");
          } else {
            data = localData;
          }
          if (!data?.ok) throw new Error("Login failed");
        }
        window.EnterpriseCore?.setTenant?.(data.session.tenantId);
        window.EnterpriseCore?.setSession?.(
          {
            email: data.session.sub,
            userId: data.session.userId,
            permissions: data.session.permissions || [],
            portalAccess: data.session.portalAccess || [],
            role: data.session.role || "org_admin",
            tenantId: data.session.tenantId,
            token: data.token,
            organizationId: data.organization?.organizationId,
            organizationName: data.organization?.name || body.organizationName,
            localMode: data.localMode === true,
            expiresAt: new Date(data.session.exp).toISOString(),
          },
          body.remember === "on",
        );
        window.EnterpriseCore?.rememberLogin?.save?.("organization", {
          checkbox: form?.remember,
          fields: {
            organizationName: form?.organizationName,
            identifier: form?.identifier,
          },
        });
        result.style.color = "var(--ok)";
        result.textContent = "Login successful. Opening workspace...";
        location.replace(await nextUrlFor(data.session.tenantId));
      } catch (err) {
        result.style.color = "var(--danger)";
        result.textContent = `${err.message}. If your organization is not registered, use the Register Organization button below.`;
      }
    });
  });
})();
