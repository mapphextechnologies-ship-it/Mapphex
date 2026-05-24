(() => {
  "use strict";

  const LOCAL_PREFIX = "finance_preview_";
  const RESET_MARKER = "mapphex_finance_data_reset_2026_05_24_v2";
  const SETTINGS_KEY = "mapphex_finance_settings_v1";
  const DEFAULT_SETTINGS = {
    theme: "dark",
    compactTables: false,
    currency: "KES",
    paymentMethod: "M-Pesa",
    supplierApproval: true,
    payrollApproval: true,
    notifyHr: true,
    reportPeriod: "This month",
    exportFormat: "Excel",
  };
  const ALLOWED_KEYS = new Set([
    "mapphex_finance_employee_payment_reviews_v1",
    "mapphex_hr_payment_notifications_v1",
    "mapphex_finance_payment_queue_v1",
    "mapphex_finance_payroll_requests_v1",
    "mapphex_finance_ledger_entries_v1",
    "mapphex_finance_invoices_v1",
    "mapphex_finance_approvals_v1",
    "mapphex_finance_approvals_archive_v1",
    "mapphex_finance_payment_transactions_v1",
    "mapphex_finance_suppliers_v1",
  ]);
  const RESET_ONLY_KEYS = [
    "mapphex_finance_generated_report_v1",
    "mapphex_finance_records",
  ];

  const readSettings = () => {
    try {
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      return { ...DEFAULT_SETTINGS, ...(settings && typeof settings === "object" ? settings : {}) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  };

  const applyTheme = (theme = readSettings().theme || "dark") => {
    const normalized = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.financeTheme = normalized;
    if (document.body) document.body.dataset.financeTheme = normalized;
  };

  const applyPreferences = (settings = readSettings()) => {
    applyTheme(settings.theme);
    if (document.body) document.body.classList.toggle("finance-compact-tables", Boolean(settings.compactTables));
  };

  const apiHeaders = (extra = {}) => headers(extra);

  applyPreferences();

  const safeJsonParse = (raw, fallback) => {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const tenantFromUrl = () => new URLSearchParams(location.search).get("tenant") || "";

  const readRawStorage = (storage, key) => {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };

  const activeSession = () => {
    const direct =
      safeJsonParse(readRawStorage(sessionStorage, "enterprise_session_meta_v1"), null) ||
      safeJsonParse(readRawStorage(localStorage, "enterprise_session_meta_v1"), null);
    if (direct?.token) return direct;

    for (const storage of [sessionStorage, localStorage]) {
      try {
        for (let idx = 0; idx < storage.length; idx += 1) {
          const key = storage.key(idx);
          if (!key || !key.endsWith(":enterprise_session_meta_v1")) continue;
          const session = safeJsonParse(readRawStorage(storage, key), null);
          if (session?.token) return session;
        }
      } catch {
        // storage can be blocked by the browser
      }
    }
    return null;
  };

  const tenantId = () => tenantFromUrl() || activeSession()?.tenantId || "";

  const readAnyLocalJson = (key, fallback) => {
    const direct = safeJsonParse(readRawStorage(localStorage, key), null);
    if (direct !== null) return direct;
    const tenant = tenantId();
    if (tenant) {
      const scoped = safeJsonParse(readRawStorage(localStorage, `tenant:${tenant}:${key}`), null);
      if (scoped !== null) return scoped;
    }
    return fallback;
  };

  const organizationName = () => {
    const params = new URLSearchParams(location.search);
    const explicit = params.get("org") || params.get("organization") || params.get("organizationName");
    if (explicit) return explicit;

    const session = activeSession();
    if (session?.organizationName) return session.organizationName;

    const profile = readAnyLocalJson("enterprise_org_profile_v1", null);
    if (profile?.name) return profile.name;

    const tenant = tenantId();
    const orgs = readAnyLocalJson("platform_organizations_v1", []);
    const match = (Array.isArray(orgs) ? orgs : []).find((org) =>
      [org?.id, org?.tenantId, org?.organizationId, org?.referenceCode].some((value) => String(value || "") === String(tenant || "")),
    );
    if (match?.name) return match.name;

    return "";
  };

  const applyOrganizationName = () => {
    const name = organizationName();
    if (!name) return;
    document.querySelectorAll("[data-org-name]").forEach((el) => {
      el.textContent = name;
    });
  };

  const applyPortalBackLinks = () => {
    const tenant = tenantId();
    const href = tenant ? `organization-workspace.html?tenant=${encodeURIComponent(tenant)}` : "organization-workspace.html";
    document.querySelectorAll("[data-finance-back]").forEach((link) => {
      link.setAttribute("href", href);
    });
  };

  const headers = (extra = {}) => {
    const out = { ...extra };
    const session = activeSession();
    if (session?.token) out.Authorization = `Bearer ${session.token}`;
    const tenant = tenantId();
    if (tenant) out["X-Tenant-ID"] = tenant;
    return out;
  };

  const assertAllowedKey = (key) => {
    if (!ALLOWED_KEYS.has(String(key || ""))) throw new Error("Finance DB key is not allowed");
  };

  const localKey = (key) => `${LOCAL_PREFIX}${tenantId() || "preview"}_${key}`;

  const localRead = (key, fallback) => safeJsonParse(readRawStorage(localStorage, localKey(key)), fallback);

  const localWrite = (key, value) => {
    try {
      localStorage.setItem(localKey(key), JSON.stringify(value ?? null));
    } catch {
      // preview storage unavailable
    }
  };

  const clearDirectLocalKey = (key) => {
    try {
      localStorage.removeItem(key);
      const tenant = tenantId();
      if (tenant) localStorage.removeItem(`tenant:${tenant}:${key}`);
      localStorage.removeItem(localKey(key));
    } catch {
      // storage can be blocked by the browser
    }
  };

  const clearRemoteKey = async (key) => {
    const tenant = tenantId();
    if (!tenant) return;
    try {
      await fetch("/api/kv", {
        method: "POST",
        headers: headers({
          "Content-Type": "application/json",
          "Idempotency-Key": `finance-reset-${key}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        }),
        credentials: "same-origin",
        body: JSON.stringify({ key, value: [], tenantId: tenant }),
      });
    } catch {
      // API can be unavailable in preview mode
    }
  };

  const resetFinanceDataOnce = async () => {
    try {
      if (localStorage.getItem(RESET_MARKER) === "done") return;
      [...ALLOWED_KEYS, ...RESET_ONLY_KEYS].forEach(clearDirectLocalKey);
      [...ALLOWED_KEYS].forEach((key) => localWrite(key, []));
      localStorage.setItem(RESET_MARKER, "done");
      await Promise.all([...ALLOWED_KEYS].map(clearRemoteKey));
    } catch {
      // If reset cannot run, normal page behavior should continue.
    }
  };

  const resetReady = resetFinanceDataOnce();

  const dbRead = async (key, fallback) => {
    assertAllowedKey(key);
    await resetReady;
    const tenant = tenantId();
    if (!tenant) return localRead(key, fallback);
    try {
      const res = await fetch(`/api/kv?key=${encodeURIComponent(key)}`, {
        method: "GET",
        headers: headers(),
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "DB read failed");
      if (data.value === null || typeof data.value === "undefined") return fallback;
      localWrite(key, data.value);
      return data.value;
    } catch {
      return localRead(key, fallback);
    }
  };

  const dbWrite = async (key, value) => {
    assertAllowedKey(key);
    await resetReady;
    localWrite(key, value);
    const tenant = tenantId();
    if (!tenant) return { ok: false, mode: "preview" };
    try {
      const res = await fetch("/api/kv", {
        method: "POST",
        headers: headers({
          "Content-Type": "application/json",
          "Idempotency-Key": `finance-${key}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        }),
        credentials: "same-origin",
        body: JSON.stringify({ key, value, tenantId: tenant }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "DB write failed");
      return { ok: true, mode: "api", data };
    } catch {
      return { ok: false, mode: "preview" };
    }
  };

  window.MapphexFinanceDB = Object.freeze({
    read: dbRead,
    write: dbWrite,
    tenantId,
    organizationName,
    applyOrganizationName,
    applyPortalBackLinks,
    applyTheme,
    applyPreferences,
    apiHeaders,
    readSettings,
    mode: () => (tenantId() ? "api-first" : "preview"),
  });

  document.addEventListener("DOMContentLoaded", () => {
    applyPreferences();
    applyOrganizationName();
    applyPortalBackLinks();
    setTimeout(applyOrganizationName, 0);
    setTimeout(applyPortalBackLinks, 0);
  });
})();
