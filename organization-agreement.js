(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const SETTINGS_KEY = "enterprise_org_settings_v1";

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

  const postJson = async (url, body) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      const err = new Error("Agreement service returned an invalid response");
      err.invalidJson = true;
      throw err;
    }
    return { res, data };
  };

  const saveLocalAgreement = (data) => {
    const current = readJson(SETTINGS_KEY, {});
    const next = {
      ...current,
      agreementAccepted: true,
      agreementAcceptedAt: new Date().toISOString(),
      subscriptionPlan: data.subscriptionPlan || current.subscriptionPlan || "business-monthly",
      supportPackage: data.supportPackage || current.supportPackage || "standard",
    };
    writeJson(SETTINGS_KEY, next);
    window.EnterpriseCore?.audit?.("organization.agreement.accepted.local", { subscriptionPlan: next.subscriptionPlan });
    return next;
  };

  const setResult = (message, color = "var(--muted)") => {
    const result = $("#agreement-result");
    if (!result) return;
    result.style.color = color;
    result.textContent = message;
  };

  const resolveTenant = () => {
    const queryTenant = new URLSearchParams(location.search).get("tenant");
    const session = window.EnterpriseCore?.requireOrganizationSession?.(queryTenant) || null;
    const tenant = session?.tenantId || queryTenant || window.EnterpriseCore?.currentTenantId?.();
    if (tenant) window.EnterpriseCore?.setTenant?.(tenant);
    return { tenant, session };
  };

  document.addEventListener("DOMContentLoaded", () => {
    const { tenant, session } = resolveTenant();
    if (!session?.tenantId) {
      location.href = tenant ? `organization-login.html?tenant=${encodeURIComponent(tenant)}` : "organization-login.html";
      return;
    }

    const form = $("#agreement-form");
    const accepted = $("#agreement-accepted");
    const submit = $("#agreement-submit");

    const syncSubmit = () => {
      const ready = accepted?.checked === true;
      if (!submit) return;
      submit.disabled = false;
      submit.classList.toggle("is-disabled", !ready);
      submit.setAttribute("aria-disabled", String(!ready));
    };

    accepted?.addEventListener("change", syncSubmit);
    accepted?.addEventListener("input", syncSubmit);
    form?.addEventListener("click", syncSubmit);
    syncSubmit();

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      syncSubmit();
      if (!accepted?.checked) {
        setResult("Please tick the agreement checkbox before continuing.", "var(--danger)");
        accepted?.focus();
        return;
      }

      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      submit.disabled = true;
      setResult("Saving agreement...");
      try {
        let nextSettings = null;
        try {
          const response = await postJson("/api/org-admin", {
            action: "accept-agreement",
            accepted: true,
            subscriptionPlan: data.subscriptionPlan,
            supportPackage: data.supportPackage,
          });
          if (!response.res.ok || !response.data?.ok) throw new Error(response.data?.error || "Agreement failed");
          nextSettings = response.data.settings || null;
        } catch (apiErr) {
          if (!isLocalDevelopment()) throw apiErr;
          nextSettings = saveLocalAgreement(data);
        }
        setResult("Agreement accepted. Opening portal manager...", "var(--ok)");
        setTimeout(() => {
          location.href = `portal-selection.html?tenant=${encodeURIComponent(window.EnterpriseCore?.currentTenantId?.() || tenant)}`;
        }, 450);
      } catch (err) {
        submit.disabled = false;
        syncSubmit();
        setResult(err.message, "var(--danger)");
      }
    });
  });
})();
