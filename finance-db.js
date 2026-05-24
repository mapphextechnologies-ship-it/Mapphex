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
    SETTINGS_KEY,
  ]);
  const RESET_ONLY_KEYS = [
    "mapphex_finance_generated_report_v1",
    "mapphex_finance_records",
  ];
  const memoryStore = new Map();
  const rawLocalGet = Storage.prototype.getItem;
  const rawLocalRemove = Storage.prototype.removeItem;

  const isFinanceStorageKey = (key) => {
    const value = String(key || "");
    const normalized = value.startsWith("tenant:") ? value.split(":").pop() : value;
    return (
      normalized === RESET_MARKER ||
      normalized === SETTINGS_KEY ||
      normalized === "mapphex_hr_payment_notifications_v1" ||
      normalized === "mapphex_finance_records" ||
      normalized.startsWith("mapphex_finance_") ||
      normalized.startsWith(LOCAL_PREFIX)
    );
  };

  const clearPersistedFinanceStorage = () => {
    try {
      const keys = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (isFinanceStorageKey(key)) keys.push(key);
      }
      keys.forEach((key) => rawLocalRemove.call(localStorage, key));
    } catch {
      // storage can be blocked by the browser
    }
  };

  clearPersistedFinanceStorage();

  const readSettings = () => {
    try {
      const raw = memoryStore.get(SETTINGS_KEY);
      const settings = raw ? JSON.parse(raw) : null;
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

  const cleanTenantId = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);

  const tenantFromUrl = () => cleanTenantId(new URLSearchParams(location.search).get("tenant"));

  const tenantFromStorage = () => {
    try {
      return cleanTenantId(rawLocalGet.call(localStorage, "enterprise_active_tenant_v1"));
    } catch {
      return "";
    }
  };

  const readRawStorage = (storage, key) => {
    try {
      if (storage === localStorage && isFinanceStorageKey(key)) return memoryStore.get(String(key)) || null;
      return storage.getItem(key);
    } catch {
      return null;
    }
  };

  const activeSession = () => {
    const direct =
      safeJsonParse(readRawStorage(sessionStorage, "enterprise_session_meta_v1"), null) ||
      safeJsonParse(readRawStorage(localStorage, "enterprise_session_meta_v1"), null);
    if (direct?.tenantId) return direct;

    for (const storage of [sessionStorage, localStorage]) {
      try {
        for (let idx = 0; idx < storage.length; idx += 1) {
          const key = storage.key(idx);
          if (!key || !key.endsWith(":enterprise_session_meta_v1")) continue;
          const session = safeJsonParse(readRawStorage(storage, key), null);
          if (session?.tenantId) return session;
        }
      } catch {
        // storage can be blocked by the browser
      }
    }
    return null;
  };

  const tenantId = () => tenantFromUrl() || cleanTenantId(activeSession()?.tenantId) || tenantFromStorage();

  const enforceFinanceAccess = () => {
    const session = activeSession();
    if (!session?.tenantId) {
      location.replace(`organization-login.html${tenantFromUrl() ? `?tenant=${encodeURIComponent(tenantFromUrl())}` : ""}`);
      return false;
    }
    const role = String(session.role || "").toLowerCase();
    const portalAccess = Array.isArray(session.portalAccess) ? session.portalAccess : [];
    const permissions = Array.isArray(session.permissions) ? session.permissions : [];
    const allowed =
      ["org_admin", "admin", "director"].includes(role) ||
      portalAccess.includes("finance") ||
      permissions.includes("finance.read") ||
      permissions.includes("finance.manage") ||
      permissions.includes("*");
    if (!allowed) {
      location.replace("access-denied.html");
      return false;
    }
    return true;
  };

  if (!enforceFinanceAccess()) return;

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
      link.removeAttribute("data-auth-target");
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

  const localRead = (key, fallback) => safeJsonParse(memoryStore.get(localKey(key)) || null, fallback);

  const localWrite = (key, value) => {
    try {
      const serialized = JSON.stringify(value ?? null);
      memoryStore.set(localKey(key), serialized);
      memoryStore.set(String(key), serialized);
    } catch {
      // preview storage unavailable
    }
  };

  const readMemory = (key, fallback) => localRead(key, fallback);

  const writeMemory = (key, value) => {
    localWrite(key, value);
    return value;
  };

  const clearDirectLocalKey = (key) => {
    try {
      rawLocalRemove.call(localStorage, key);
      const tenant = tenantId();
      if (tenant) rawLocalRemove.call(localStorage, `tenant:${tenant}:${key}`);
      rawLocalRemove.call(localStorage, localKey(key));
      memoryStore.delete(String(key));
      if (tenant) memoryStore.delete(`tenant:${tenant}:${key}`);
      memoryStore.delete(localKey(key));
    } catch {
      // storage can be blocked by the browser
    }
  };

  const resetFinanceDataOnce = async () => {
    try {
      [...ALLOWED_KEYS, ...RESET_ONLY_KEYS].forEach(clearDirectLocalKey);
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
    readMemory,
    writeMemory,
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
