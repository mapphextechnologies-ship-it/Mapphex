(() => {
  "use strict";

  const PAGE = document.body?.dataset?.page || "";

  const SESSION_LOCAL_KEY = "enterprise_session_director_v1";
  const SESSION_SESSION_KEY = "enterprise_session_director_tmp_v1";
  const DIRECTOR_ACCOUNT_KEY = "enterprise_director_account_v1";
  const BRANCH_ACCOUNTS_KEY = "enterprise_branch_accounts_v1";
  const DATA_KEY = "enterprise_erp_v1";
  const ORGS_KEY = "platform_organizations_v1";
  const SETTINGS_KEY = "enterprise_org_settings_v1";
  const USERS_KEY = "enterprise_users_v1";
  const NOTIFICATIONS_KEY = "enterprise_notifications_v1";
  const AUDIT_KEY = "enterprise_audit_v1";
  const UI_BRANCHES_OPEN_KEY = "enterprise_ui_branches_open_v1";
  const UI_REPORTS_OPEN_KEY = "enterprise_ui_reports_open_v1";
  const API_ENABLED_KEY = "enterprise_api_enabled_v1";

  const BRANCH_COUNT = 47;
  const REALTIME_INTERVAL_MS = 4500;

  const $ = (selector, root = document) => root.querySelector(selector);

  const safeJsonParse = (raw, fallback) => {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  const loadJson = (key, fallback) => {
    const store = window.EnterpriseStore || null;
    if (store?.getJson) {
      const value = store.getJson(key, undefined);
      if (typeof value !== "undefined" && value !== null) return value;
    }
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return safeJsonParse(raw, fallback);
  };

  const saveJson = (key, value) => {
    try {
      window.EnterpriseStore?.setJson?.(key, value);
    } catch {
      // fall back below
    }
    localStorage.setItem(key, JSON.stringify(value));
    try {
      if (localStorage.getItem(API_ENABLED_KEY) === "1") {
        fetch("/api/kv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        }).catch(() => null);
      }
    } catch {
      // ignore
    }
  };

  const apiEnabled = () => {
    try {
      return localStorage.getItem(API_ENABLED_KEY) === "1";
    } catch {
      return false;
    }
  };

  const bootstrapKeyFromApi = async (key) => {
    const store = window.EnterpriseStore || null;
    if (store?.bootstrap) {
      const res = await store.bootstrap([key]);
      return !!res?.ok;
    }
    if (!apiEnabled()) return false;
    if (localStorage.getItem(key)) return true;
    try {
      const res = await fetch(`/api/kv?key=${encodeURIComponent(String(key || ""))}`);
      if (!res.ok) return false;
      const data = await res.json();
      if (!data || data.ok !== true) return false;
      if (data.value === null || typeof data.value === "undefined") return false;
      localStorage.setItem(key, JSON.stringify(data.value));
      return true;
    } catch {
      return false;
    }
  };

  const subscribeDataChanges = (callback) => {
    const cb = typeof callback === "function" ? callback : () => {};
    const store = window.EnterpriseStore || null;
    if (store?.subscribe) {
      store.subscribe((ev) => {
        if (!ev || ev.type !== "set" || ev.key !== DATA_KEY) return;
        store.refresh?.([DATA_KEY]).finally(() => cb());
      });
      return;
    }
    window.addEventListener("storage", (e) => {
      if (e.key !== DATA_KEY) return;
      cb();
    });
  };

  const bufToHex = (buffer) =>
    Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  const weakHashHex = (text) => {
    // Non-cryptographic fallback for file:// deployments where SubtleCrypto may be unavailable.
    // Use a real backend + proper password hashing for production.
    let h1 = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h1 ^= text.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193);
    }
    // Convert to 8-hex and repeat to look like a longer digest.
    const hex = (h1 >>> 0).toString(16).padStart(8, "0");
    return `${hex}${hex}${hex}${hex}${hex}${hex}${hex}${hex}`.slice(0, 64);
  };

  const hashHex = async (text) => {
    try {
      if (crypto?.subtle?.digest) {
        const enc = new TextEncoder().encode(text);
        const digest = await crypto.subtle.digest("SHA-256", enc);
        return bufToHex(digest);
      }
    } catch {
      // Fall through to weak hash.
    }
    return weakHashHex(text);
  };

  const formatInt = (value) => {
    const num = Number(value || 0);
    return Number.isFinite(num) ? num.toLocaleString("en-US") : "0";
  };

  const cleanTenantId = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);

  const BUSINESS_LABELS = {
    retail: { stock: "Products in stock", sold: "Products sold", item: "Product", items: "Products", staff: "Cashiers / Agents", top: "Top product" },
    pharmacy: { stock: "Medicines in stock", sold: "Medicines dispensed", item: "Medicine", items: "Medicines", staff: "Pharmacists", top: "Top medicine" },
    restaurant: { stock: "Menu items ready", sold: "Orders completed", item: "Menu item", items: "Menu items", staff: "Waiters / Chefs", top: "Top menu item" },
    hotel: { stock: "Rooms / services", sold: "Bookings completed", item: "Room / service", items: "Rooms / services", staff: "Receptionists", top: "Top booking" },
    school: { stock: "Supplies / services", sold: "Fee payments", item: "Supply / service", items: "Supplies / services", staff: "Teachers / Admin", top: "Top fee item" },
    clinic: { stock: "Services / medicines", sold: "Consultations", item: "Service / medicine", items: "Services / medicines", staff: "Doctors / Nurses", top: "Top service" },
    logistics: { stock: "Cargo / items active", sold: "Deliveries completed", item: "Cargo / item", items: "Cargo / items", staff: "Drivers / Dispatch", top: "Top route" },
    warehouse: { stock: "SKUs in stock", sold: "Dispatches", item: "SKU", items: "SKUs", staff: "Operators", top: "Top SKU" },
    bar: { stock: "Bar stock", sold: "Tabs / sales", item: "Bar item", items: "Bar stock", staff: "Bartenders", top: "Top bar item" },
    company: { stock: "Items in stock", sold: "Items sold", item: "Item / service", items: "Items / services", staff: "Staff", top: "Top product/service" },
  };

  const businessKey = (value) => {
    const key = String(value || "company").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (key.includes("pharmacy")) return "pharmacy";
    if (key.includes("restaurant") || key.includes("food")) return "restaurant";
    if (key.includes("hotel") || key.includes("guest")) return "hotel";
    if (key.includes("school") || key.includes("academic")) return "school";
    if (key.includes("clinic") || key.includes("hospital")) return "clinic";
    if (key.includes("logistics") || key.includes("delivery")) return "logistics";
    if (key.includes("warehouse") || key.includes("wholesale")) return "warehouse";
    if (key.includes("bar") || key.includes("pub")) return "bar";
    if (key.includes("retail") || key.includes("shop")) return "retail";
    return BUSINESS_LABELS[key] ? key : "company";
  };

  const getBusinessLabels = (value) => BUSINESS_LABELS[businessKey(value)] || BUSINESS_LABELS.company;

  const isoNow = () => new Date().toISOString();

  const clamp = (num, min, max) => Math.min(max, Math.max(min, num));

  const makeId = (prefix, index) =>
    `${prefix}${String(index).padStart(2, "0")}`;

  const toast = (title, body) => {
    const existing = $(".toast");
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<p class="t-title"></p><p class="t-body"></p>`;
    el.querySelector(".t-title").textContent = title;
    el.querySelector(".t-body").textContent = body;
    document.body.appendChild(el);

    window.setTimeout(() => el.remove(), 3400);
  };

  const loadDirectorAccount = () => {
    const acc = loadJson(DIRECTOR_ACCOUNT_KEY, null);
    if (!acc || typeof acc !== "object") return null;
    if (!acc.id || !acc.email || !acc.passwordHash || !acc.salt) return null;
    return acc;
  };

  const saveDirectorAccount = (account) => {
    saveJson(DIRECTOR_ACCOUNT_KEY, {
      ...account,
      role: "director",
      createdAt: isoNow(),
    });
  };

  const getSession = () => {
    const session =
      safeJsonParse(sessionStorage.getItem(SESSION_SESSION_KEY), null) ||
      loadJson(SESSION_LOCAL_KEY, null);
    if (!session || typeof session !== "object") return null;
    if (!session.role || !session.userId) return null;
    return session;
  };

  const setSession = (session, rememberMe) => {
    const payload = { ...session, createdAt: isoNow() };
    if (rememberMe) {
      localStorage.setItem(SESSION_LOCAL_KEY, JSON.stringify(payload));
      sessionStorage.removeItem(SESSION_SESSION_KEY);
      return;
    }
    sessionStorage.setItem(SESSION_SESSION_KEY, JSON.stringify(payload));
    localStorage.removeItem(SESSION_LOCAL_KEY);
  };

  const clearSession = () => {
    localStorage.removeItem(SESSION_LOCAL_KEY);
    sessionStorage.removeItem(SESSION_SESSION_KEY);
  };

  const isDirector = (session) =>
    !!session && session.role === "director" && !!session.userId;

  const requireDirector = () => {
    const orgSession = window.EnterpriseCore?.requireOrganizationSession?.();
    const orgRole = String(orgSession?.role || "").toLowerCase();
    if (orgSession && (orgRole === "director" || orgRole === "org_admin" || orgRole === "admin")) {
      if (orgSession.tenantId) window.EnterpriseCore?.setTenant?.(orgSession.tenantId);
      return {
        role: "director",
        userId: orgSession.userId || orgSession.sub || "organization-director",
        email: orgSession.sub || orgSession.email || "",
        username: orgSession.name || orgSession.sub || "",
        tenantId: orgSession.tenantId || "",
        organizationId: orgSession.organizationId || "",
        portalAccess: orgSession.portalAccess || [],
        organizationSession: true,
      };
    }

    const session = getSession();
    if (!isDirector(session)) {
      window.location.href = "director-login.html";
      return null;
    }
    const tenantId = cleanTenantId(session.tenantId || window.EnterpriseCore?.currentTenantId?.());
    if (tenantId) window.EnterpriseCore?.setTenant?.(tenantId);
    return session;
  };

  const modelsCatalog = () => [
    "Retail product",
    "Pharmacy medicine",
    "School fee service",
    "Hospital consultation",
    "Restaurant menu item",
    "Hardware stock item",
    "Software subscription",
    "IT support package",
    "Cloud hosting plan",
    "Real estate rent",
    "Logistics delivery",
    "Manufacturing raw material",
  ];

  const getOrganizationContext = (session = {}) => {
    const tenantId = cleanTenantId(session.tenantId || window.EnterpriseCore?.currentTenantId?.());
    if (tenantId) window.EnterpriseCore?.setTenant?.(tenantId);
    const settings = loadJson(SETTINGS_KEY, {}) || {};
    const orgs = loadJson(ORGS_KEY, []);
    const organization = Array.isArray(orgs)
      ? orgs.find((org) => cleanTenantId(org?.id) === tenantId || cleanTenantId(org?.organizationId) === tenantId) || null
      : null;
    const businessType = settings.businessType || organization?.businessType || "company";
    return { tenantId, settings, organization, businessType, labels: getBusinessLabels(businessType) };
  };

  const kenyaCities = () => [
    "Nairobi",
    "Mombasa",
    "Kisumu",
    "Nakuru",
    "Eldoret",
    "Thika",
    "Meru",
    "Nyeri",
    "Machakos",
    "Kitale",
    "Malindi",
    "Naivasha",
    "Kericho",
    "Embu",
    "Garissa",
    "Kakamega",
    "Nanyuki",
    "Bungoma",
  ];

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const seededData = () => {
    const cities = kenyaCities();
    const models = modelsCatalog();

    const branches = Array.from({ length: BRANCH_COUNT }, (_, idx) => {
      const i = idx + 1;
      const city = cities[idx % cities.length];
      const name = `Branch ${String(i).padStart(2, "0")} • ${city}`;

      const inventoryCount = clamp(6 + Math.floor(Math.random() * 6), 4, 10);
      const inventorySet = new Set();
      while (inventorySet.size < inventoryCount) inventorySet.add(pick(models));

      const inventory = Array.from(inventorySet).map((model) => ({
        model,
        stock: 10 + Math.floor(Math.random() * 55),
        sold: 40 + Math.floor(Math.random() * 520),
      }));

      return {
        id: makeId("b", i),
        name,
        city,
        employees: 12 + Math.floor(Math.random() * 42),
        inventory,
        damageLoss: [],
        transactions: [],
        financeSummary: { mpesaIn: 0, bankIn: 0, txCount: 0, lastTxAt: "" },
        ledger: { head: "GENESIS" },
        updatedAt: isoNow(),
      };
    });

    const employeesTotal = branches.reduce((sum, b) => sum + (b.employees || 0), 0);

    return {
      version: 1,
      lastUpdated: isoNow(),
      branches,
      departments: {
        hr: { employeesTotal },
        finance: {
          currency: "KES",
          revenueMTD: 18_500_000,
          expensesMTD: 12_300_000,
        },
      },
    };
  };

  const ensureData = () => {
    const existing = loadJson(DATA_KEY, null);
    if (
      existing &&
      typeof existing === "object" &&
      Array.isArray(existing.branches) &&
      existing.branches.length === BRANCH_COUNT
    ) {
      let changed = false;
      for (const b of existing.branches) {
        if (!b || typeof b !== "object") continue;
        if (!Array.isArray(b.inventory)) {
          b.inventory = [];
          changed = true;
        }
        if (!Array.isArray(b.transactions)) {
          b.transactions = [];
          changed = true;
        }
        if (!Array.isArray(b.damageLoss)) {
          b.damageLoss = [];
          changed = true;
        }
        if (!b.financeSummary || typeof b.financeSummary !== "object") {
          b.financeSummary = { mpesaIn: 0, bankIn: 0, txCount: 0, lastTxAt: "" };
          changed = true;
        }
        if (!b.ledger || typeof b.ledger !== "object") {
          b.ledger = { head: "GENESIS" };
          changed = true;
        }
        if (typeof b.employees !== "number") {
          b.employees = Number(b.employees || 0) || 0;
          changed = true;
        }
        if (!b.updatedAt) {
          b.updatedAt = isoNow();
          changed = true;
        }
      }
      if (changed) {
        existing.lastUpdated = isoNow();
        saveJson(DATA_KEY, existing);
      }
      return existing;
    }
    const seeded = seededData();
    saveJson(DATA_KEY, seeded);
    return seeded;
  };

  const computeBranchTotals = (branch) => {
    const inventory = Array.isArray(branch.inventory) ? branch.inventory : [];
    const dl = Array.isArray(branch.damageLoss) ? branch.damageLoss : [];
    let stock = 0;
    let sold = 0;
    let topModel = { model: "—", sold: -1 };
    let damaged = 0;
    let lost = 0;

    for (const row of inventory) {
      const rowStock = Number(row.stock || 0);
      const rowSold = Number(row.sold || 0);
      stock += rowStock;
      sold += rowSold;
      if (rowSold > topModel.sold) topModel = { model: row.model, sold: rowSold };
    }

    for (const r of dl) {
      const qty = Number(r.qty || 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (r.type === "lost") lost += qty;
      else damaged += qty;
    }

    return {
      models: inventory.length,
      stock,
      sold,
      topModel: topModel.model || "—",
      damaged,
      lost,
    };
  };

  const isExternallyAllocatedPhone = (phone) => {
    const source = String(phone?.source || "").trim().toLowerCase();
    const syncedFrom = String(phone?.syncedFrom || "").trim().toLowerCase();
    return source === "asset-management" || syncedFrom === "external asset feed";
  };

  const computeExternalAllocations = (branch, range = null) => {
    const phones = Array.isArray(branch?.phones) ? branch.phones : [];
    const soldPhones = Array.isArray(branch?.soldPhones) ? branch.soldPhones : [];
    let allocated = 0;
    let inStock = 0;
    let sold = 0;

    for (const phone of [...phones, ...soldPhones]) {
      if (!isExternallyAllocatedPhone(phone)) continue;
      if (range) {
        const at = phone.assignedAt || phone.createdAt || phone.soldAt || "";
        const ms = new Date(at).getTime();
        if (!Number.isFinite(ms) || ms < range.startMs || ms > range.endMs) continue;
      }
      allocated += 1;
      if (String(phone.status || "in_stock") === "sold") sold += 1;
      else inStock += 1;
    }

    return { allocated, inStock, sold };
  };

  const getFinanceSummary = (branch) => {
    const fs = branch?.financeSummary;
    if (!fs || typeof fs !== "object") {
      return { mpesaIn: 0, bankIn: 0, txCount: 0, lastTxAt: "" };
    }
    return {
      mpesaIn: Number(fs.mpesaIn || 0) || 0,
      bankIn: Number(fs.bankIn || 0) || 0,
      txCount: Number(fs.txCount || 0) || 0,
      lastTxAt: String(fs.lastTxAt || ""),
    };
  };

  const computeCompanyTotals = (data) => {
    const branches = Array.isArray(data.branches) ? data.branches : [];
    let totalStock = 0;
    let totalSold = 0;
    let employees = 0;
    let damaged = 0;
    let lost = 0;
    let mpesaIn = 0;
    let bankIn = 0;
    let txCount = 0;
    let externalAllocated = 0;
    let externalStock = 0;
    let externalSold = 0;

    for (const b of branches) {
      const t = computeBranchTotals(b);
      const aw = computeExternalAllocations(b);
      totalStock += t.stock;
      totalSold += t.sold;
      employees += Number(b.employees || 0);
      damaged += t.damaged;
      lost += t.lost;
      const fin = getFinanceSummary(b);
      mpesaIn += fin.mpesaIn;
      bankIn += fin.bankIn;
      txCount += fin.txCount;
      externalAllocated += aw.allocated;
      externalStock += aw.inStock;
      externalSold += aw.sold;
    }

    return { totalStock, totalSold, employees, damaged, lost, mpesaIn, bankIn, txCount, externalAllocated, externalStock, externalSold };
  };

  const mutateRealtime = (data) => {
    const branches = data.branches;
    if (!Array.isArray(branches) || branches.length === 0) return data;

    const branch = branches[Math.floor(Math.random() * branches.length)];
    const inv = Array.isArray(branch.inventory) ? branch.inventory : [];
    if (inv.length === 0) return data;

    const row = inv[Math.floor(Math.random() * inv.length)];

    const chance = Math.random();
    if (chance < 0.72) {
      if (row.stock > 0) {
        row.stock -= 1;
        row.sold += 1;
      } else {
        row.stock += 10 + Math.floor(Math.random() * 25);
      }
    } else {
      row.stock += 2 + Math.floor(Math.random() * 12);
    }

    branch.updatedAt = isoNow();
    data.lastUpdated = isoNow();
    return data;
  };

  const downloadText = (filename, text) => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const csvEscape = (value) => {
    const str = String(value ?? "");
    if (/[",\n]/.test(str)) return `"${str.replaceAll('"', '""')}"`;
    return str;
  };

  const downloadWordDocFile = (filename, reportHtml) => {
    const doc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Report</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; }
    h3 { margin: 0 0 6px; }
    p { margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
    th { background: #f6f6f6; text-align: left; }
    .num { text-align: right; }
  </style>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument xmlns:w="urn:schemas-microsoft-com:office:word">
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
    </w:WordDocument>
  </xml>
  <![endif]-->
</head>
<body>${reportHtml}</body>
</html>`;
    const blob = new Blob([doc], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const printHtmlReport = (reportHtml, title = "Report") => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; padding: 18px; }
    h3 { margin: 0 0 6px; }
    p { margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
    th { background: #f6f6f6; text-align: left; }
    .num { text-align: right; }
  </style>
</head>
<body>${reportHtml}</body>
</html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const chartColors = () => [
    "rgba(34, 211, 238, 0.85)",
    "rgba(124, 58, 237, 0.85)",
    "rgba(52, 211, 153, 0.85)",
    "rgba(251, 191, 36, 0.85)",
    "rgba(251, 113, 133, 0.85)",
  ];

  const resizeCanvasForDpr = (canvas) => {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(320, Math.floor(rect.width * dpr));
    canvas.height = Math.max(
      220,
      Math.floor(Number(canvas.getAttribute("height") || 220) * dpr),
    );
  };

  const drawBarChart = (canvas, labels, values, color) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const padding = 28;
    const w = width - padding * 2;
    const h = height - padding * 2;
    const max = Math.max(1, ...values);

    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(0, 0, width, height);

    const barW = w / Math.max(1, values.length);
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textBaseline = "top";

    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      const barH = (v / max) * h;
      const x = padding + i * barW + 6;
      const y = padding + (h - barH);

      ctx.fillStyle = color;
      ctx.fillRect(x, y, Math.max(6, barW - 12), barH);

      ctx.fillStyle = "rgba(255,255,255,0.75)";
      const short = String(labels[i] || "").slice(0, 10);
      ctx.save();
      ctx.translate(x, padding + h + 6);
      ctx.rotate(-Math.PI / 6);
      ctx.fillText(short, 0, 0);
      ctx.restore();
    }
  };

  const drawPie = (canvas, values, labels) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(0, 0, width, height);

    const total = values.reduce((s, v) => s + v, 0) || 1;
    const colors = chartColors();
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) / 2 - 26;

    let start = -Math.PI / 2;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      const ang = (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + ang);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      start += ang;
    }

    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textBaseline = "top";
    for (let i = 0; i < labels.length; i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(16, 16 + i * 18, 10, 10);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillText(`${labels[i]}: ${formatInt(values[i])}`, 32, 14 + i * 18);
    }
  };

  const initDirectorDashboard = () => {
    const session = requireDirector();
    if (!session) return;

    let data = ensureData();
    const orgContext = getOrganizationContext(session);
    const tenantId = orgContext.tenantId;
    const labels = orgContext.labels;

    const sessionBadge = $("#session-badge");
    const brandTitle = $("#director-brand-title");
    const brandSubtitle = $("#director-brand-subtitle");
    const logoutBtn = $("#logout-btn");
    const syncBtn = $("#sync-btn");
    const realtimeIndicator = $("#realtime-indicator");

    const kpiBranches = $("#kpi-branches");
    const kpiBranchesFoot = $("#kpi-branches-foot");
    const kpiStockLabel = $("#kpi-stock-label");
    const kpiStock = $("#kpi-stock");
    const kpiSoldLabel = $("#kpi-sold-label");
    const kpiSold = $("#kpi-sold");
    const kpiEmployeesLabel = $("#kpi-employees-label");
    const kpiEmployees = $("#kpi-employees");
    const branchAccountSummary = $("#branch-account-summary");
    const branchAccountsRefreshBtn = $("#branch-accounts-refresh-btn");
    const branchAccountsTbody = $("#branch-accounts-tbody");

    const inventoryPanel = $("#inventory-panel");
    const branchesToggleBtn = $("#branches-toggle-btn");
    const branchSearch = $("#branch-search");
    const tbody = $("#branches-tbody");
    const branchSelect = $("#branch-select");
    const reportOutput = $("#report-output");
    const reportsToggleBtn = $("#reports-toggle-btn");
    const reportsDrawer = $("#reports-drawer");

    const generalReportBtn = $("#general-report-btn");
    const weeklyReportBtn = $("#weekly-report-btn");
    const monthlyReportBtn = $("#monthly-report-btn");
    const yearlyReportBtn = $("#yearly-report-btn");
    const generalReportCsvBtn = $("#general-report-csv-btn");
    const generalReportDocBtn = $("#general-report-doc-btn");
    const generalReportPdfBtn = $("#general-report-pdf-btn");
    const directorChartsBtn = $("#director-charts-btn");
    const dueDateInput = $("#director-report-due-date");
    const branchReportBtn = $("#branch-report-btn");
    const branchReportCsvBtn = $("#branch-report-csv-btn");
    const branchReportDocBtn = $("#branch-report-doc-btn");
    const branchReportPdfBtn = $("#branch-report-pdf-btn");

    const directorStaffTbody = $("#director-staff-tbody");
    const directorSalesTbody = $("#director-sales-tbody");
    const directorSalesBranchFilter = $("#director-sales-branch-filter");
    const directorSalesTypeFilter = $("#director-sales-type-filter");
    const directorSalesChannelFilter = $("#director-sales-channel-filter");
    const directorSalesExportBtn = $("#director-sales-export-btn");
    const directorProcurementTbody = $("#director-procurement-tbody");
    const dirProcOrders = $("#dir-proc-orders");
    const dirProcPending = $("#dir-proc-pending");
    const dirProcSpend = $("#dir-proc-spend");
    const dirProcBalances = $("#dir-proc-balances");
    const directorCustomersTbody = $("#director-customers-tbody");
    const directorCustomersExportBtn = $("#director-customers-export-btn");
    const directorTaskBranch = $("#director-task-branch");
    const directorTaskTitle = $("#director-task-title");
    const directorTaskOwner = $("#director-task-owner");
    const directorTaskDue = $("#director-task-due");
    const directorTaskSaveBtn = $("#director-task-save-btn");
    const directorTasksTbody = $("#director-tasks-tbody");
    const directorAnnouncementBranch = $("#director-announcement-branch");
    const directorAnnouncementMessage = $("#director-announcement-message");
    const directorAnnouncementBtn = $("#director-announcement-btn");
    const directorNotificationsTbody = $("#director-notifications-tbody");
    const directorAuditTbody = $("#director-audit-tbody");
    const directorAuditExportBtn = $("#director-audit-export-btn");
    const directorSettingsGrid = $("#director-settings-grid");

    const chartsPanel = $("#director-charts-panel");
    const chartsCloseBtn = $("#director-charts-close-btn");
    const chartSold = $("#director-chart-sold");
    const chartStock = $("#director-chart-stock");
    const chartDL = $("#director-chart-dl");

    const deptCards = Array.from(document.querySelectorAll("[data-dept]"));

    const isMobileMenu = () => window.matchMedia("(max-width: 980px)").matches;

    const setMenuOpen = (open) => {
      const shouldOpen = !!open && isMobileMenu();
      document.body.classList.toggle("menu-open", shouldOpen);
      $("#menu-toggle")?.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      $("#portal-sidebar")?.setAttribute("aria-hidden", shouldOpen || !isMobileMenu() ? "false" : "true");
      $("#menu-backdrop")?.setAttribute("aria-hidden", shouldOpen ? "false" : "true");
    };

    const navigateTo = (key) => {
      const target = String(key || "").trim() || "overview";
      document.querySelectorAll("[data-section]").forEach((section) => {
        section.style.display = section.getAttribute("data-section") === target ? "" : "none";
      });
      document.querySelectorAll("[data-nav]").forEach((link) => {
        link.classList.toggle("active", link.getAttribute("data-nav") === target);
      });
      if (isMobileMenu()) setMenuOpen(false);
    };

    const applyOrganizationContext = () => {
      const orgName = orgContext.organization?.name || orgContext.settings?.organizationName || "MAPPHEX";
      const orgCode = orgContext.organization?.organizationId || tenantId || "organization";
      if (brandTitle) brandTitle.textContent = orgName;
      if (brandSubtitle) brandSubtitle.textContent = `${orgCode} - Director workspace`;
      if (sessionBadge) sessionBadge.textContent = `${labels.items} Director`;
      if (kpiBranchesFoot) kpiBranchesFoot.textContent = orgName === "MAPPHEX" ? "This organization" : orgName;
      if (kpiStockLabel) kpiStockLabel.textContent = labels.stock;
      if (kpiSoldLabel) kpiSoldLabel.textContent = labels.sold;
      if (kpiEmployeesLabel) kpiEmployeesLabel.textContent = labels.staff;
      const itemsHeading = $("#branches-items-heading");
      const topHeading = $("#branches-top-heading");
      if (itemsHeading) itemsHeading.textContent = labels.items;
      if (topHeading) topHeading.textContent = labels.top;
    };
    applyOrganizationContext();

    const loadBranchAccounts = () => {
      const accounts = loadJson(BRANCH_ACCOUNTS_KEY, []);
      const list = Array.isArray(accounts) ? accounts : [];
      if (!tenantId) return list;
      return list.filter((account) => !account.tenantId || cleanTenantId(account.tenantId) === tenantId);
    };

    const saveBranchAccounts = (accounts) => {
      const all = loadJson(BRANCH_ACCOUNTS_KEY, []);
      if (!tenantId || !Array.isArray(all)) {
        saveJson(BRANCH_ACCOUNTS_KEY, accounts);
        return;
      }
      const scopedIds = new Set(accounts.map((account) => account.id));
      const merged = all.filter((account) => !scopedIds.has(account.id)).concat(accounts);
      saveJson(BRANCH_ACCOUNTS_KEY, merged);
    };

    const branchById = (branchId) =>
      (Array.isArray(data.branches) ? data.branches : []).find((branch) => branch.id === branchId) || null;

    const updateBranchRegistrationStatus = (account, status) => {
      const branch = branchById(account?.branchId);
      if (!branch) return;
      branch.registrationStatus = status;
      branch.accountId = account.id;
      branch.city = account.county || branch.city || "";
      branch.area = account.area || branch.area || "";
      if (account.county || account.area) {
        const number = String(branch.id || "").replace(/^b/i, "") || branch.id;
        branch.name = `Branch ${number} - ${[account.county, account.area].filter(Boolean).join(" - ")}`;
      }
      branch.updatedAt = isoNow();
    };

    const setBranchAccountStatus = (accountId, status) => {
      const nextStatus = String(status || "").toLowerCase();
      const accounts = loadBranchAccounts();
      const idx = accounts.findIndex((account) => account.id === accountId);
      if (idx === -1) return;
      const account = {
        ...accounts[idx],
        status: nextStatus,
        reviewedAt: isoNow(),
        reviewedBy: session.email || session.username || "director",
      };
      accounts[idx] = account;
      saveBranchAccounts(accounts);
      updateBranchRegistrationStatus(account, nextStatus);
      persist();
      renderBranchAccounts();
      renderKPIs();
      renderBranchesTable();
      refreshCurrentReport();
      toast(
        nextStatus === "approved" ? "Branch approved" : "Branch rejected",
        `${account.username || account.email || "Branch account"} is now ${nextStatus}.`,
      );
    };

    const renderBranchAccounts = () => {
      if (!branchAccountsTbody) return;
      const accounts = loadBranchAccounts().slice().sort((a, b) => {
        const statusRank = { pending: 0, approved: 1, rejected: 2 };
        return (statusRank[String(a.status || "pending").toLowerCase()] ?? 9) - (statusRank[String(b.status || "pending").toLowerCase()] ?? 9)
          || String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
      const pendingCount = accounts.filter((account) => String(account.status || "pending").toLowerCase() === "pending").length;
      if (branchAccountSummary) branchAccountSummary.textContent = `${formatInt(pendingCount)} pending`;
      branchAccountsTbody.textContent = "";
      if (!accounts.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="6" class="muted">No branch account requests yet.</td>`;
        branchAccountsTbody.appendChild(tr);
        return;
      }
      for (const account of accounts) {
        const status = String(account.status || "pending").toLowerCase();
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        `;
        tr.children[0].textContent = `${account.branchId || "Branch"} - ${[account.county, account.area].filter(Boolean).join(" - ") || "Location pending"}`;
        tr.children[1].textContent = `${account.username || "User"} / ${account.email || "No email"}`;
        tr.children[2].textContent = status.toUpperCase();
        tr.children[3].textContent = account.createdAt ? new Date(account.createdAt).toLocaleString() : "-";
        tr.children[4].textContent = account.reviewedAt ? new Date(account.reviewedAt).toLocaleString() : "-";
        const actions = document.createElement("div");
        actions.className = "report-buttons";
        actions.innerHTML = `
          <button class="btn primary" type="button" data-account-action="approved" data-account-id="${account.id}">Approve</button>
          <button class="btn" type="button" data-account-action="rejected" data-account-id="${account.id}">Reject</button>
        `;
        actions.querySelectorAll("button").forEach((button) => {
          button.disabled = status !== "pending";
        });
        tr.children[5].appendChild(actions);
        branchAccountsTbody.appendChild(tr);
      }
    };

    const renderKPIs = () => {
      const totals = computeCompanyTotals(data);
      if (kpiBranches) {
        const accounts = loadBranchAccounts();
        const activeBranches = accounts.length
          ? accounts.filter((account) => String(account.status || "").toLowerCase() === "approved").length
          : (Array.isArray(data.branches) ? data.branches : []).filter((branch) => {
              const status = String(branch.registrationStatus || "").toLowerCase();
              return status === "approved" || branch.city || branch.area || computeBranchTotals(branch).models > 0;
            }).length;
        kpiBranches.textContent = formatInt(activeBranches);
      }
      if (kpiStock) kpiStock.textContent = formatInt(totals.totalStock);
      if (kpiSold) kpiSold.textContent = formatInt(totals.totalSold);
      if (kpiEmployees) kpiEmployees.textContent = formatInt(totals.employees);
    };

    const setBranchesOpen = (open) => {
      if (inventoryPanel) inventoryPanel.classList.toggle("collapsed", !open);
      if (branchesToggleBtn)
        branchesToggleBtn.textContent = open ? "Hide branches" : "Show branches";
      localStorage.setItem(UI_BRANCHES_OPEN_KEY, open ? "1" : "0");
      if (open) {
        renderBranchesTable();
        window.setTimeout(() => branchSearch?.focus?.(), 0);
      }
    };

    const isBranchesOpen = () =>
      localStorage.getItem(UI_BRANCHES_OPEN_KEY) === "1";

    const setReportsOpen = (open) => {
      if (reportsDrawer) reportsDrawer.hidden = !open;
      if (reportsToggleBtn) {
        reportsToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
        reportsToggleBtn.textContent = open ? "Hide reports" : "Reports";
      }
      localStorage.setItem(UI_REPORTS_OPEN_KEY, open ? "1" : "0");
    };

    const isReportsOpen = () =>
      localStorage.getItem(UI_REPORTS_OPEN_KEY) === "1";

    const getFilteredBranches = () => {
      const q = String(branchSearch?.value || "")
        .trim()
        .toLowerCase();
      const branches = Array.isArray(data.branches) ? data.branches : [];
      if (!q) return branches;
      return branches.filter((b) =>
        String(b.name || "").toLowerCase().includes(q),
      );
    };

    const renderBranchesTable = () => {
      if (!tbody) return;
      tbody.textContent = "";
      const branches = getFilteredBranches();

      for (const b of branches) {
        const t = computeBranchTotals(b);
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td></td>
          <td class="num"></td>
          <td class="num"></td>
          <td class="num"></td>
          <td class="num"></td>
          <td class="num"></td>
          <td></td>
        `;
        tr.children[0].textContent = b.name || b.id;
        tr.children[1].textContent = formatInt(t.models);
        tr.children[2].textContent = formatInt(t.stock);
        tr.children[3].textContent = formatInt(t.sold);
        tr.children[4].textContent = formatInt(t.damaged);
        tr.children[5].textContent = formatInt(t.lost);
        tr.children[6].textContent = t.topModel;
        tbody.appendChild(tr);
      }
    };

    const renderBranchSelect = () => {
      if (!branchSelect) return;
      branchSelect.textContent = "";

      const branches = Array.isArray(data.branches) ? data.branches : [];
      for (const b of branches) {
        const opt = document.createElement("option");
        opt.value = b.id;
        opt.textContent = b.name || b.id;
        branchSelect.appendChild(opt);
      }
    };

    const setReportHtml = (html) => {
      if (!reportOutput) return;
      reportOutput.innerHTML = html;
    };

    let currentReport = { type: "general", branchId: "", period: "" };

    const getDueDateIso = () => {
      const v = String(dueDateInput?.value || "").trim();
      if (v) return v;
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toISOString().slice(0, 10);
    };

    const parseTimeMs = (value) => {
      const ms = new Date(value).getTime();
      return Number.isFinite(ms) ? ms : NaN;
    };

    const startOfDay = (date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const startOfIsoWeek = (date) => {
      const d = startOfDay(date);
      // Mon=0 ... Sun=6
      const day = d.getDay();
      const diff = (day + 6) % 7;
      d.setDate(d.getDate() - diff);
      return d;
    };

    const getPeriodRange = (periodKey) => {
      const key = String(periodKey || "").trim().toLowerCase();
      const now = new Date();
      let label = "Period";
      let start = startOfDay(now);

      if (key === "weekly") {
        label = "Weekly";
        start = startOfIsoWeek(now);
      } else if (key === "monthly") {
        label = "Monthly";
        start = startOfDay(now);
        start.setDate(1);
      } else if (key === "yearly") {
        label = "Yearly";
        start = startOfDay(now);
        start.setMonth(0, 1);
      }

      return {
        key,
        label,
        start,
        end: now,
        startMs: start.getTime(),
        endMs: now.getTime(),
      };
    };

    const inRange = (value, range) => {
      const ms = parseTimeMs(value);
      if (!Number.isFinite(ms)) return false;
      return ms >= range.startMs && ms <= range.endMs;
    };

    const computeBranchPeriodTotals = (branch, range) => {
      const txLog = Array.isArray(branch.txLog) ? branch.txLog : [];
      const soldPhones = Array.isArray(branch.soldPhones) ? branch.soldPhones : [];
      const dl = Array.isArray(branch.damageLoss) ? branch.damageLoss : [];

      let sold = 0;
      let fallbackRevenue = 0;
      let mpesaIn = 0;
      let bankIn = 0;
      let txCount = 0;
      let creditCount = 0;
      let creditBalance = 0;
      const byModel = new Map();

      if (soldPhones.length) {
        for (const p of soldPhones) {
          if (!inRange(p.soldAt, range)) continue;
          sold += 1;
          const model = String(p.model || "").trim() || "—";
          byModel.set(model, (byModel.get(model) || 0) + 1);
          const price = Number(p.price || 0);
          if (Number.isFinite(price) && price > 0) fallbackRevenue += price;
        }
      } else {
        for (const tx of txLog) {
          if (!inRange(tx.at, range)) continue;
          sold += 1;
          const modelRaw = tx?.phone?.model ?? tx?.model ?? "";
          const model = String(modelRaw || "").trim() || "—";
          byModel.set(model, (byModel.get(model) || 0) + 1);
        }
      }

      for (const tx of txLog) {
        if (!inRange(tx.at, range)) continue;
        if (String(tx.saleType || "").toLowerCase() === "credit") {
          creditCount += 1;
          creditBalance += Number(tx.balance || 0) || 0;
        }
        txCount += 1;
        const amount = Number(tx.amountPaid ?? tx.amount ?? 0);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        const channel = String(tx.channel || "").toLowerCase();
        if (channel === "bank") bankIn += amount;
        else mpesaIn += amount;
      }

      // If this branch has sales but no tx log for the period, estimate totals from sold phones.
      if (sold > 0 && txCount === 0) {
        txCount = sold;
        if (fallbackRevenue > 0) mpesaIn = fallbackRevenue;
      } else {
        txCount = Math.max(txCount, sold);
      }

      let topModel = "—";
      let topCount = -1;
      for (const [model, count] of byModel.entries()) {
        if (count > topCount) {
          topModel = model;
          topCount = count;
        }
      }

      let damaged = 0;
      let lost = 0;
      for (const r of dl) {
        if (!inRange(r.at, range)) continue;
        const qty = Number(r.qty || 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        if (r.type === "lost") lost += qty;
        else damaged += qty;
      }

      return { sold, damaged, lost, mpesaIn, bankIn, txCount, topModel, creditCount, creditBalance };
    };

    const buildCompanyPeriodReportHtml = (periodKey) => {
      const range = getPeriodRange(periodKey);
      const branches = Array.isArray(data.branches) ? data.branches : [];

      const rows = branches.map((b) => {
        const t = computeBranchTotals(b);
        const p = computeBranchPeriodTotals(b, range);
        const aw = computeExternalAllocations(b, range);
        const revenue = p.mpesaIn + p.bankIn;
        return { b, t, p, aw, revenue };
      });

      const totals = rows.reduce(
        (acc, row) => {
          acc.stock += row.t.stock;
          acc.sold += row.p.sold;
          acc.damaged += row.p.damaged;
          acc.lost += row.p.lost;
          acc.mpesaIn += row.p.mpesaIn;
          acc.bankIn += row.p.bankIn;
          acc.txCount += row.p.txCount;
          acc.creditCount += row.p.creditCount;
          acc.creditBalance += row.p.creditBalance;
          acc.externalAllocated += row.aw.allocated;
          acc.externalStock += row.aw.inStock;
          acc.employees += Number(row.b.employees || 0);
          return acc;
        },
        {
          stock: 0,
          sold: 0,
          damaged: 0,
          lost: 0,
          mpesaIn: 0,
          bankIn: 0,
          txCount: 0,
          creditCount: 0,
          creditBalance: 0,
          externalAllocated: 0,
          externalStock: 0,
          employees: 0,
        },
      );

      const hasActivity =
        totals.sold > 0 ||
        totals.txCount > 0 ||
        totals.damaged > 0 ||
        totals.lost > 0 ||
        totals.mpesaIn > 0 ||
        totals.bankIn > 0;

      const hintHtml = hasActivity
        ? ""
        : `<p class="muted" style="margin-top:10px;">No dated activity found yet. Weekly/Monthly/Yearly reports are based on Branch sales logs (transactions/sold phones) and damage/loss logs.</p>`;

      const ranked = rows
        .slice()
        .sort((a, z) => z.p.sold - a.p.sold)
        .slice(0, 5);

      const updated = data.lastUpdated ? new Date(data.lastUpdated) : new Date();
      const updatedLabel = updated.toLocaleString();
      const generatedAt = new Date();
      const dueIso = getDueDateIso();
      const dueDate = new Date(`${dueIso}T00:00:00`);

      const startLabel = range.start.toLocaleDateString();
      const endLabel = range.end.toLocaleDateString();
      const periodLabel = `${range.label} • ${startLabel} → ${endLabel}`;

      const topRows = ranked
        .map(
          (row) => `
            <div class="report-card">
              <div class="label">${row.b.name || row.b.id}</div>
              <div class="value">${formatInt(row.p.sold)} sold</div>
              <div class="muted" style="font-size:12px; margin-top:6px;">Revenue: KES ${formatInt(row.revenue)} • Tx: ${formatInt(row.p.txCount)}</div>
            </div>`,
        )
        .join("");

      const tableRows = rows
        .slice()
        .sort((a, z) => z.p.sold - a.p.sold)
        .map(
          (row) => `
            <tr>
              <td>${row.b.name || row.b.id}</td>
              <td class="num">${formatInt(row.t.stock)}</td>
              <td class="num">${formatInt(row.p.sold)}</td>
              <td class="num">${formatInt(row.p.txCount)}</td>
              <td class="num">${formatInt(row.p.mpesaIn)}</td>
              <td class="num">${formatInt(row.p.bankIn)}</td>
              <td class="num">${formatInt(row.p.creditCount)}</td>
              <td class="num">${formatInt(row.p.creditBalance)}</td>
              <td class="num">${formatInt(row.aw.allocated)}</td>
              <td class="num">${formatInt(row.p.damaged)}</td>
              <td class="num">${formatInt(row.p.lost)}</td>
              <td>${row.p.topModel || "—"}</td>
            </tr>`,
        )
        .join("");

      return `
        <h3>${range.label} Company Report</h3>
        <p><strong>MAPPHEX</strong> • All branches</p>
        <div class="report-grid">
          <div class="report-card">
            <div class="label">Generated</div>
            <div class="value" style="font-size:16px;">${generatedAt.toLocaleString()}</div>
          </div>
          <div class="report-card">
            <div class="label">Period</div>
            <div class="value" style="font-size:16px;">${periodLabel}</div>
          </div>
          <div class="report-card">
            <div class="label">Due date</div>
            <div class="value" style="font-size:16px;">${dueDate.toDateString()}</div>
          </div>
          <div class="report-card">
            <div class="label">Last ERP update</div>
            <div class="value" style="font-size:16px;">${updatedLabel}</div>
          </div>
        </div>

        ${hintHtml}

        <p style="margin-top:12px; font-weight:800;">Executive summary</p>
        <div class="report-grid">
          <div class="report-card">
            <div class="label">Stock (now)</div>
            <div class="value">${formatInt(totals.stock)}</div>
          </div>
          <div class="report-card">
            <div class="label">Sold (${range.label.toLowerCase()})</div>
            <div class="value">${formatInt(totals.sold)}</div>
          </div>
          <div class="report-card">
            <div class="label">Damaged</div>
            <div class="value">${formatInt(totals.damaged)}</div>
          </div>
          <div class="report-card">
            <div class="label">Lost</div>
            <div class="value">${formatInt(totals.lost)}</div>
          </div>
          <div class="report-card">
            <div class="label">M-Pesa (KES)</div>
            <div class="value">${formatInt(totals.mpesaIn)}</div>
          </div>
          <div class="report-card">
            <div class="label">Bank (KES)</div>
            <div class="value">${formatInt(totals.bankIn)}</div>
          </div>
          <div class="report-card">
            <div class="label">Transactions</div>
            <div class="value">${formatInt(totals.txCount)}</div>
          </div>
          <div class="report-card">
            <div class="label">Credit phones</div>
            <div class="value">${formatInt(totals.creditCount)}</div>
          </div>
          <div class="report-card">
            <div class="label">Credit balance (KES)</div>
            <div class="value">${formatInt(totals.creditBalance)}</div>
          </div>
          <div class="report-card">
            <div class="label">Externally allocated</div>
            <div class="value">${formatInt(totals.externalAllocated)}</div>
          </div>
          <div class="report-card">
            <div class="label">External stock</div>
            <div class="value">${formatInt(totals.externalStock)}</div>
          </div>
          <div class="report-card">
            <div class="label">Employees (snapshot)</div>
            <div class="value">${formatInt(totals.employees)}</div>
          </div>
        </div>

        <p style="margin-top:12px; font-weight:800;">Top branches by sales (${range.label.toLowerCase()})</p>
        <div class="report-grid">${topRows || "<p class='muted'>No sales recorded for this period.</p>"}</div>

        <p style="margin-top:12px; font-weight:800;">Branches overview (${range.label.toLowerCase()})</p>
        <div class="table-wrap" style="padding:12px 0 0;">
          <table class="table" aria-label="Branches overview period report">
            <thead>
              <tr>
                <th>Branch</th>
                <th class="num">Stock</th>
                <th class="num">Sold</th>
                <th class="num">Tx</th>
                <th class="num">M-Pesa</th>
                <th class="num">Bank</th>
                <th class="num">Credit phones</th>
                <th class="num">Credit balance</th>
                <th class="num">Externally allocated</th>
                <th class="num">Damaged</th>
                <th class="num">Lost</th>
                <th>Top model</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      `;
    };

    const generateCompanyPeriodReport = (periodKey) => {
      const period = String(periodKey || "").trim().toLowerCase();
      currentReport = { type: "period", branchId: "", period };
      setReportHtml(buildCompanyPeriodReportHtml(period));
    };

    const generateCompanyPeriodReportCsv = (periodKey) => {
      const range = getPeriodRange(periodKey);
      const startIso = range.start.toISOString().slice(0, 10);
      const endIso = range.end.toISOString().slice(0, 10);

      const rows = [
        [
          "BranchId",
          "Branch",
          "Period",
          "StartDate",
          "EndDate",
          "StockNow",
          "Sold",
          "Transactions",
          "MpesaInKES",
          "BankInKES",
          "CreditPhones",
          "CreditBalanceKES",
          "ExternalAllocated",
          "Damaged",
          "Lost",
          "TopModel",
        ],
      ];

      for (const b of data.branches || []) {
        const t = computeBranchTotals(b);
        const p = computeBranchPeriodTotals(b, range);
        const aw = computeExternalAllocations(b, range);
        rows.push([
          b.id,
          b.name,
          range.label,
          startIso,
          endIso,
          t.stock,
          p.sold,
          p.txCount,
          p.mpesaIn,
          p.bankIn,
          p.creditCount,
          p.creditBalance,
          aw.allocated,
          p.damaged,
          p.lost,
          p.topModel,
        ]);
      }

      const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
      const stamp = new Date().toISOString().slice(0, 10);
      downloadText(`enterprise-${range.key}-report-${stamp}.csv`, csv);
    };

    const makeGeneralBranchesTableRows = () => {
      const branches = Array.isArray(data.branches) ? data.branches : [];
      return branches
        .map((b) => ({ b, t: computeBranchTotals(b), aw: computeExternalAllocations(b) }))
        .sort((a, z) => z.t.sold - a.t.sold)
        .map(
          (row) => `
            <tr>
              <td>${row.b.name || row.b.id}</td>
              <td class="num">${formatInt(row.t.models)}</td>
              <td class="num">${formatInt(row.t.stock)}</td>
              <td class="num">${formatInt(row.t.sold)}</td>
              <td class="num">${formatInt(row.aw.allocated)}</td>
              <td class="num">${formatInt(row.t.damaged)}</td>
              <td class="num">${formatInt(row.t.lost)}</td>
              <td>${row.t.topModel}</td>
            </tr>`,
        )
        .join("");
    };

    const buildGeneralReportHtml = () => {
      const totals = computeCompanyTotals(data);
      const branches = Array.isArray(data.branches) ? data.branches : [];

      const ranked = branches
        .map((b) => ({ b, t: computeBranchTotals(b) }))
        .sort((a, z) => z.t.sold - a.t.sold)
        .slice(0, 5);

      const updated = data.lastUpdated ? new Date(data.lastUpdated) : new Date();
      const updatedLabel = updated.toLocaleString();
      const generatedAt = new Date();
      const dueIso = getDueDateIso();
      const dueDate = new Date(`${dueIso}T00:00:00`);

      const topRows = ranked
        .map(
          (row) => `
            <div class="report-card">
              <div class="label">${row.b.name}</div>
              <div class="value">${formatInt(row.t.sold)} sold</div>
              <div class="muted" style="font-size:12px; margin-top:6px;">Stock: ${formatInt(row.t.stock)} • Models: ${formatInt(row.t.models)}</div>
            </div>`,
        )
        .join("");

      const tableRows = makeGeneralBranchesTableRows();

      return `
        <h3>Company Operations Report</h3>
        <p><strong>MAPPHEX</strong> • All branches</p>
        <div class="report-grid">
          <div class="report-card">
            <div class="label">Generated</div>
            <div class="value" style="font-size:16px;">${generatedAt.toLocaleString()}</div>
          </div>
          <div class="report-card">
            <div class="label">Due date</div>
            <div class="value" style="font-size:16px;">${dueDate.toDateString()}</div>
          </div>
          <div class="report-card">
            <div class="label">Last ERP update</div>
            <div class="value" style="font-size:16px;">${updatedLabel}</div>
          </div>
        </div>

        <p style="margin-top:12px; font-weight:800;">Executive summary</p>
        <div class="report-grid">
          <div class="report-card">
            <div class="label">Total stock</div>
            <div class="value">${formatInt(totals.totalStock)}</div>
          </div>
          <div class="report-card">
            <div class="label">Total sold</div>
            <div class="value">${formatInt(totals.totalSold)}</div>
          </div>
          <div class="report-card">
            <div class="label">Externally allocated</div>
            <div class="value">${formatInt(totals.externalAllocated)}</div>
          </div>
          <div class="report-card">
            <div class="label">External in stock</div>
            <div class="value">${formatInt(totals.externalStock)}</div>
          </div>
          <div class="report-card">
            <div class="label">Damaged</div>
            <div class="value">${formatInt(totals.damaged)}</div>
          </div>
          <div class="report-card">
            <div class="label">Lost</div>
            <div class="value">${formatInt(totals.lost)}</div>
          </div>
          <div class="report-card">
            <div class="label">M-Pesa (KES)</div>
            <div class="value">${formatInt(totals.mpesaIn)}</div>
          </div>
          <div class="report-card">
            <div class="label">Bank (KES)</div>
            <div class="value">${formatInt(totals.bankIn)}</div>
          </div>
          <div class="report-card">
            <div class="label">Transactions</div>
            <div class="value">${formatInt(totals.txCount)}</div>
          </div>
          <div class="report-card">
            <div class="label">Employees (HR snapshot)</div>
            <div class="value">${formatInt(totals.employees)}</div>
          </div>
        </div>

        <p style="margin-top:12px; font-weight:800;">Top branches by sales</p>
        <div class="report-grid">${topRows}</div>

        <p style="margin-top:12px; font-weight:800;">Branches overview</p>
        <div class="table-wrap" style="padding:12px 0 0;">
          <table class="table" aria-label="Branches overview report">
            <thead>
              <tr>
                <th>Branch</th>
                <th class="num">Models</th>
                <th class="num">Stock</th>
                <th class="num">Sold</th>
                <th class="num">Externally allocated</th>
                <th class="num">Damaged</th>
                <th class="num">Lost</th>
                <th>Top model</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      `;
    };

    const generateGeneralReport = () => {
      currentReport = { type: "general", branchId: "", period: "" };
      setReportHtml(buildGeneralReportHtml());
    };

    const generateGeneralReportCsv = () => {
      const rows = [
        [
          "BranchId",
          "Branch",
          "City",
          "Models",
          "Stock",
          "Sold",
          "ExternalAllocated",
          "ExternalInStock",
          "ExternalSold",
          "Damaged",
          "Lost",
          "MpesaInKES",
          "BankInKES",
          "TxCount",
          "TopModel",
        ],
      ];

      for (const b of data.branches || []) {
        const t = computeBranchTotals(b);
        const aw = computeExternalAllocations(b);
        const fin = getFinanceSummary(b);
        rows.push([
          b.id,
          b.name,
          b.city,
          t.models,
          t.stock,
          t.sold,
          aw.allocated,
          aw.inStock,
          aw.sold,
          t.damaged,
          t.lost,
          fin.mpesaIn,
          fin.bankIn,
          fin.txCount,
          t.topModel,
        ]);
      }

      const csv = rows
        .map((row) => row.map(csvEscape).join(","))
        .join("\n");

      downloadText(
        `enterprise-general-report-${new Date().toISOString().slice(0, 10)}.csv`,
        csv,
      );
    };

    const getBranchById = (id) =>
      (data.branches || []).find((b) => b.id === id) || null;

    const makeBranchInventoryRows = (branch) =>
      (branch.inventory || [])
        .slice()
        .sort((a, z) => (z.sold || 0) - (a.sold || 0))
        .map(
          (row) => `
            <tr>
              <td>${row.model}</td>
              <td class="num">${formatInt(row.stock)}</td>
              <td class="num">${formatInt(row.sold)}</td>
            </tr>`,
        )
        .join("");

    const makeBranchDlRows = (branch) =>
      (branch.damageLoss || [])
        .slice()
        .sort((a, z) => String(z.at).localeCompare(String(a.at)))
        .slice(0, 40)
        .map(
          (r) => `
            <tr>
              <td>${new Date(r.at).toLocaleString()}</td>
              <td>${String(r.type || "").toUpperCase()}</td>
              <td>${r.model}</td>
              <td class="num">${formatInt(r.qty)}</td>
              <td>${r.notes || ""}</td>
            </tr>`,
        )
        .join("");

    const buildBranchReportHtml = (branchId) => {
      const branch = getBranchById(branchId);
      if (!branch) {
        return "<p>Select a branch to view report.</p>";
      }

      const totals = computeBranchTotals(branch);
      const externalAllocation = computeExternalAllocations(branch);
      const fin = getFinanceSummary(branch);
      const updated = branch.updatedAt ? new Date(branch.updatedAt) : new Date();
      const generatedAt = new Date();
      const dueIso = getDueDateIso();
      const dueDate = new Date(`${dueIso}T00:00:00`);

      const items = makeBranchInventoryRows(branch);
      const dlRows = makeBranchDlRows(branch);

      return `
        <h3>Branch Operations Report</h3>
        <p><strong>${branch.name}</strong></p>
        <div class="report-grid">
          <div class="report-card">
            <div class="label">Generated</div>
            <div class="value" style="font-size:16px;">${generatedAt.toLocaleString()}</div>
          </div>
          <div class="report-card">
            <div class="label">Due date</div>
            <div class="value" style="font-size:16px;">${dueDate.toDateString()}</div>
          </div>
          <div class="report-card">
            <div class="label">Last branch update</div>
            <div class="value" style="font-size:16px;">${updated.toLocaleString()}</div>
          </div>
        </div>

        <p style="margin-top:12px; font-weight:800;">Executive summary</p>
        <div class="report-grid">
          <div class="report-card">
            <div class="label">Models</div>
            <div class="value">${formatInt(totals.models)}</div>
          </div>
          <div class="report-card">
            <div class="label">In stock</div>
            <div class="value">${formatInt(totals.stock)}</div>
          </div>
          <div class="report-card">
            <div class="label">Sold</div>
            <div class="value">${formatInt(totals.sold)}</div>
          </div>
          <div class="report-card">
            <div class="label">Externally allocated</div>
            <div class="value">${formatInt(externalAllocation.allocated)}</div>
          </div>
          <div class="report-card">
            <div class="label">External in stock</div>
            <div class="value">${formatInt(externalAllocation.inStock)}</div>
          </div>
          <div class="report-card">
            <div class="label">Damaged</div>
            <div class="value">${formatInt(totals.damaged)}</div>
          </div>
          <div class="report-card">
            <div class="label">Lost</div>
            <div class="value">${formatInt(totals.lost)}</div>
          </div>
          <div class="report-card">
            <div class="label">M-Pesa (KES)</div>
            <div class="value">${formatInt(fin.mpesaIn)}</div>
          </div>
          <div class="report-card">
            <div class="label">Bank (KES)</div>
            <div class="value">${formatInt(fin.bankIn)}</div>
          </div>
          <div class="report-card">
            <div class="label">Transactions</div>
            <div class="value">${formatInt(fin.txCount)}</div>
          </div>
        </div>

        <p style="margin-top:12px; font-weight:800;">Inventory details</p>
        <div class="table-wrap" style="padding:12px 0 0;">
          <table class="table" aria-label="Branch inventory report">
            <thead>
              <tr>
                <th>Model</th>
                <th class="num">In stock</th>
                <th class="num">Sold</th>
              </tr>
            </thead>
            <tbody>${items}</tbody>
          </table>
        </div>

        <p style="margin-top:12px; font-weight:800;">Damages & loss (latest)</p>
        <div class="table-wrap" style="padding:12px 0 0;">
          <table class="table" aria-label="Damage and loss report">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Model</th>
                <th class="num">Qty</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>${dlRows || ""}</tbody>
          </table>
        </div>
      `;
    };

    const generateBranchReport = (branchId) => {
      currentReport = { type: "branch", branchId: String(branchId || ""), period: "" };
      setReportHtml(buildBranchReportHtml(branchId));
    };

    const downloadWordDoc = (filename, reportHtml) => {
      const doc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Report</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; }
    h3 { margin: 0 0 6px; }
    p { margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
    th { background: #f6f6f6; text-align: left; }
    .num { text-align: right; }
  </style>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument xmlns:w="urn:schemas-microsoft-com:office:word">
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
    </w:WordDocument>
  </xml>
  <![endif]-->
</head>
<body>${reportHtml}</body>
</html>`;
      const blob = new Blob([doc], { type: "application/msword;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    };

    const printReport = (reportHtml) => {
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.open();
      w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Report</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; padding: 18px; }
    h3 { margin: 0 0 6px; }
    p { margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
    th { background: #f6f6f6; text-align: left; }
    .num { text-align: right; }
  </style>
</head>
<body>${reportHtml}</body>
</html>`);
      w.document.close();
      w.focus();
      w.print();
    };

    const chartColors = () => [
      "rgba(34, 211, 238, 0.85)",
      "rgba(124, 58, 237, 0.85)",
      "rgba(52, 211, 153, 0.85)",
      "rgba(251, 191, 36, 0.85)",
      "rgba(251, 113, 133, 0.85)",
    ];

    const drawBarChart = (canvas, labels, values, color) => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const padding = 28;
      const w = width - padding * 2;
      const h = height - padding * 2;
      const max = Math.max(1, ...values);

      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(0, 0, width, height);

      const barW = w / Math.max(1, values.length);
      ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textBaseline = "top";

      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        const barH = (v / max) * h;
        const x = padding + i * barW + 6;
        const y = padding + (h - barH);

        ctx.fillStyle = color;
        ctx.fillRect(x, y, Math.max(6, barW - 12), barH);

        ctx.fillStyle = "rgba(255,255,255,0.75)";
        const short = String(labels[i] || "").slice(0, 10);
        ctx.save();
        ctx.translate(x, padding + h + 6);
        ctx.rotate(-Math.PI / 6);
        ctx.fillText(short, 0, 0);
        ctx.restore();
      }
    };

    const drawPie = (canvas, values, labels) => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(0, 0, width, height);

      const total = values.reduce((s, v) => s + v, 0) || 1;
      const colors = chartColors();
      const cx = width / 2;
      const cy = height / 2;
      const r = Math.min(width, height) / 2 - 26;

      let start = -Math.PI / 2;
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        const ang = (v / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, start, start + ang);
        ctx.closePath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();
        start += ang;
      }

      ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textBaseline = "top";
      for (let i = 0; i < labels.length; i++) {
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(16, 16 + i * 18, 10, 10);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillText(`${labels[i]}: ${formatInt(values[i])}`, 32, 14 + i * 18);
      }
    };

    const openCharts = () => {
      if (!chartsPanel) return;
      navigateTo("director-charts-panel");
      chartsPanel.style.display = "";

      const branches = Array.isArray(data.branches) ? data.branches : [];
      const scored = branches.map((b) => ({ b, t: computeBranchTotals(b) }));

      const topSold = scored
        .slice()
        .sort((a, z) => z.t.sold - a.t.sold)
        .slice(0, 10);
      const soldLabels = topSold.map((x) => x.b.name || x.b.id);
      const soldValues = topSold.map((x) => Number(x.t.sold || 0));

      const topStock = scored
        .slice()
        .sort((a, z) => z.t.stock - a.t.stock)
        .slice(0, 10);
      const stockLabels = topStock.map((x) => x.b.name || x.b.id);
      const stockValues = topStock.map((x) => Number(x.t.stock || 0));

      const totals = computeCompanyTotals(data);
      const dlValues = [totals.damaged, totals.lost];
      const dlLabels = ["Damaged", "Lost"];

      for (const c of [chartSold, chartStock, chartDL]) {
        if (!c) continue;
        const rect = c.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        c.width = Math.max(320, Math.floor(rect.width * dpr));
        c.height = Math.max(
          220,
          Math.floor(Number(c.getAttribute("height") || 220) * dpr),
        );
      }

      drawBarChart(chartSold, soldLabels, soldValues, "rgba(124, 58, 237, 0.85)");
      drawBarChart(chartStock, stockLabels, stockValues, "rgba(34, 211, 238, 0.85)");
      drawPie(chartDL, dlValues, dlLabels);
    };

    const closeCharts = () => {
      if (chartsPanel) chartsPanel.style.display = "none";
      navigateTo("report-center");
    };

    const downloadBranchReportCsv = (branchId) => {
      const branch = getBranchById(branchId);
      if (!branch) return;

      const aw = computeExternalAllocations(branch);
      const rows = [["BranchId", "Branch", "Model", "Stock", "Sold"]];
      for (const row of branch.inventory || []) {
        rows.push([branch.id, branch.name, row.model, row.stock, row.sold]);
      }
      rows.push([]);
      rows.push(["ExternalAllocated", aw.allocated]);
      rows.push(["ExternalInStock", aw.inStock]);
      rows.push(["ExternalSold", aw.sold]);

      const csv = rows
        .map((r) => r.map(csvEscape).join(","))
        .join("\n");

      downloadText(
        `enterprise-${branch.id}-report-${new Date().toISOString().slice(0, 10)}.csv`,
        csv,
      );
    };

    const refreshCurrentReport = () => {
      if (currentReport.type === "general") {
        setReportHtml(buildGeneralReportHtml());
        return;
      }
      if (currentReport.type === "period" && currentReport.period) {
        setReportHtml(buildCompanyPeriodReportHtml(currentReport.period));
        return;
      }
      if (currentReport.type === "branch" && currentReport.branchId) {
        setReportHtml(buildBranchReportHtml(currentReport.branchId));
      }
    };

    const allTransactions = () => {
      const rows = [];
      for (const branch of data.branches || []) {
        for (const tx of branch.txLog || []) {
          rows.push({ branch, tx });
        }
      }
      return rows.sort((a, z) => String(z.tx?.at || "").localeCompare(String(a.tx?.at || "")));
    };

    const populateDirectorSelects = () => {
      const branches = Array.isArray(data.branches) ? data.branches : [];
      const fill = (select, includeAll = false) => {
        if (!select) return;
        const selected = String(select.value || "");
        select.textContent = "";
        if (includeAll) {
          const opt = document.createElement("option");
          opt.value = "";
          opt.textContent = "All branches";
          select.appendChild(opt);
        }
        for (const branch of branches) {
          const opt = document.createElement("option");
          opt.value = branch.id;
          opt.textContent = branch.name || branch.id;
          select.appendChild(opt);
        }
        if (selected) select.value = selected;
      };
      fill(directorSalesBranchFilter, true);
      fill(directorTaskBranch, false);
      fill(directorAnnouncementBranch, true);
    };

    const staffSalesTotals = () => {
      const totals = new Map();
      for (const { tx } of allTransactions()) {
        const actor = tx?.agent?.username || tx?.soldBy || "branch";
        const current = totals.get(actor) || { count: 0, revenue: 0 };
        current.count += 1;
        current.revenue += Number(tx.amountPaid ?? tx.amount ?? 0) || 0;
        totals.set(actor, current);
      }
      return totals;
    };

    const renderDirectorStaff = () => {
      if (!directorStaffTbody) return;
      const users = loadJson(USERS_KEY, []);
      const list = Array.isArray(users) ? users : [];
      const totals = staffSalesTotals();
      directorStaffTbody.textContent = "";
      if (!list.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="8" class="muted">No organization users have been assigned yet.</td>`;
        directorStaffTbody.appendChild(tr);
        return;
      }
      for (const user of list.slice().sort((a, z) => String(a.role || "").localeCompare(String(z.role || "")))) {
        const branchId = user.branchId || user.assignedBranchId || user.branch || "";
        const branch = branchById(branchId);
        const key = user.username || user.name || user.email || "branch";
        const total = totals.get(key) || totals.get(user.email) || { count: 0, revenue: 0 };
        const tr = document.createElement("tr");
        tr.innerHTML = `<td></td><td></td><td></td><td></td><td></td><td></td><td class="num"></td><td class="num"></td>`;
        tr.children[0].textContent = user.name || user.username || user.email || "User";
        tr.children[1].textContent = user.email || "";
        tr.children[2].textContent = user.role || "";
        tr.children[3].textContent = branch?.name || branchId || "All branches";
        tr.children[4].textContent = user.status || "active";
        tr.children[5].textContent = Array.isArray(user.portalAccess) ? user.portalAccess.join(", ") : "";
        tr.children[6].textContent = formatInt(total.count);
        tr.children[7].textContent = formatInt(total.revenue);
        directorStaffTbody.appendChild(tr);
      }
    };

    const filteredDirectorSales = () => {
      const branchId = String(directorSalesBranchFilter?.value || "");
      const type = String(directorSalesTypeFilter?.value || "").toLowerCase();
      const channel = String(directorSalesChannelFilter?.value || "").toLowerCase();
      return allTransactions().filter(({ branch, tx }) => {
        if (branchId && branch.id !== branchId) return false;
        if (type && String(tx.saleType || "").toLowerCase() !== type) return false;
        if (channel && String(tx.channel || "").toLowerCase() !== channel) return false;
        return true;
      });
    };

    const renderDirectorSales = () => {
      if (!directorSalesTbody) return;
      const rows = filteredDirectorSales();
      directorSalesTbody.textContent = "";
      if (!rows.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="9" class="muted">No sales match this view yet.</td>`;
        directorSalesTbody.appendChild(tr);
        return;
      }
      for (const { branch, tx } of rows.slice(0, 120)) {
        const amount = Number(tx.amount || 0) || 0;
        const paid = Number(tx.amountPaid ?? tx.paidAmount ?? amount) || 0;
        const balance = Math.max(0, Number(tx.balance ?? (amount - paid)) || 0);
        const tr = document.createElement("tr");
        tr.innerHTML = `<td></td><td></td><td></td><td></td><td></td><td></td><td></td><td class="num"></td><td class="num"></td>`;
        tr.children[0].textContent = tx.at ? new Date(tx.at).toLocaleString() : "";
        tr.children[1].textContent = branch.name || branch.id;
        tr.children[2].textContent = tx?.phone?.name || tx?.phone?.model || tx.serial || "";
        tr.children[3].textContent = tx.customerPhone || "";
        tr.children[4].textContent = String(tx.channel || "").toUpperCase();
        tr.children[5].textContent = tx.saleType || "cash";
        tr.children[6].textContent = tx.ref || "";
        tr.children[7].textContent = formatInt(paid);
        tr.children[8].textContent = formatInt(balance);
        directorSalesTbody.appendChild(tr);
      }
    };

    const exportDirectorSalesCsv = () => {
      const rows = [["Date", "Branch", "Item", "Customer", "Channel", "Type", "Reference", "PaidKES", "BalanceKES"]];
      filteredDirectorSales().forEach(({ branch, tx }) => {
        const amount = Number(tx.amount || 0) || 0;
        const paid = Number(tx.amountPaid ?? tx.paidAmount ?? amount) || 0;
        const balance = Math.max(0, Number(tx.balance ?? (amount - paid)) || 0);
        rows.push([tx.at || "", branch.name || branch.id, tx?.phone?.name || tx.serial || "", tx.customerPhone || "", tx.channel || "", tx.saleType || "cash", tx.ref || "", paid, balance]);
      });
      downloadText(`enterprise-director-sales-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((row) => row.map(csvEscape).join(",")).join("\n"));
    };

    const procurementRows = () => {
      const rows = [];
      for (const branch of data.branches || []) {
        for (const order of branch.purchaseOrders || []) rows.push({ branch, order });
      }
      return rows.sort((a, z) => String(z.order.createdAt || "").localeCompare(String(a.order.createdAt || "")));
    };

    const renderDirectorProcurement = () => {
      const rows = procurementRows();
      const spend = rows.reduce((sum, row) => sum + Number(row.order.total || 0), 0);
      const pending = rows.filter((row) => /approval pending|required/i.test(`${row.order.status || ""} ${row.order.approvalStatus || ""}`)).length;
      const balances = (data.branches || []).reduce((sum, branch) => sum + (branch.suppliers || []).reduce((sub, supplier) => sub + Number(supplier.balance || 0), 0), 0);
      if (dirProcOrders) dirProcOrders.textContent = formatInt(rows.length);
      if (dirProcPending) dirProcPending.textContent = formatInt(pending);
      if (dirProcSpend) dirProcSpend.textContent = `KES ${formatInt(spend)}`;
      if (dirProcBalances) dirProcBalances.textContent = `KES ${formatInt(balances)}`;
      if (!directorProcurementTbody) return;
      directorProcurementTbody.textContent = "";
      if (!rows.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="7" class="muted">No branch purchase orders yet.</td>`;
        directorProcurementTbody.appendChild(tr);
        return;
      }
      rows.slice(0, 120).forEach(({ branch, order }) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td></td><td></td><td></td><td></td><td class="num"></td><td></td><td></td>`;
        tr.children[0].textContent = branch.name || branch.id;
        tr.children[1].textContent = order.ref || order.id || "";
        tr.children[2].textContent = order.supplier || "";
        tr.children[3].textContent = order.item || "";
        tr.children[4].textContent = formatInt(order.total || 0);
        tr.children[5].textContent = order.approvalStatus || "auto-approved";
        tr.children[6].textContent = order.status || "";
        directorProcurementTbody.appendChild(tr);
      });
    };

    const directorCustomerRows = () => {
      const map = new Map();
      for (const { branch, tx } of allTransactions()) {
        const phone = String(tx.customerPhone || "").trim();
        if (!phone) continue;
        const amount = Number(tx.amount || 0) || 0;
        const paid = Number(tx.amountPaid ?? tx.paidAmount ?? amount) || 0;
        const balance = Math.max(0, Number(tx.balance ?? (amount - paid)) || 0);
        const current = map.get(phone) || { phone, branches: new Set(), count: 0, paid: 0, balance: 0, lastAt: "" };
        current.branches.add(branch.name || branch.id);
        current.count += 1;
        current.paid += paid;
        current.balance += balance;
        if (!current.lastAt || String(tx.at || "") > current.lastAt) current.lastAt = tx.at || "";
        map.set(phone, current);
      }
      return Array.from(map.values()).sort((a, z) => String(z.lastAt).localeCompare(String(a.lastAt)));
    };

    const renderDirectorCustomers = () => {
      if (!directorCustomersTbody) return;
      const rows = directorCustomerRows();
      directorCustomersTbody.textContent = "";
      if (!rows.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="6" class="muted">Customer records appear after branches complete sales.</td>`;
        directorCustomersTbody.appendChild(tr);
        return;
      }
      for (const row of rows.slice(0, 120)) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td></td><td></td><td class="num"></td><td class="num"></td><td class="num"></td><td></td>`;
        tr.children[0].textContent = row.phone;
        tr.children[1].textContent = Array.from(row.branches).join(", ");
        tr.children[2].textContent = formatInt(row.count);
        tr.children[3].textContent = formatInt(row.paid);
        tr.children[4].textContent = formatInt(row.balance);
        tr.children[5].textContent = row.lastAt ? new Date(row.lastAt).toLocaleString() : "";
        directorCustomersTbody.appendChild(tr);
      }
    };

    const exportDirectorCustomersCsv = () => {
      const rows = [["Customer", "Branches", "Transactions", "PaidKES", "CreditBalanceKES", "LastPurchase"]];
      directorCustomerRows().forEach((row) => rows.push([row.phone, Array.from(row.branches).join("; "), row.count, row.paid, row.balance, row.lastAt]));
      downloadText(`enterprise-director-customers-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((row) => row.map(csvEscape).join(",")).join("\n"));
    };

    const makeRecordId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    const renderDirectorTasks = () => {
      if (!directorTasksTbody) return;
      directorTasksTbody.textContent = "";
      const tasks = [];
      for (const branch of data.branches || []) {
        for (const task of branch.tasks || []) tasks.push({ branch, task });
      }
      if (!tasks.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="5" class="muted">No branch tasks yet.</td>`;
        directorTasksTbody.appendChild(tr);
        return;
      }
      for (const { branch, task } of tasks.sort((a, z) => String(a.task.dueDate || "").localeCompare(String(z.task.dueDate || ""))).slice(0, 100)) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td></td><td></td><td></td><td></td><td></td>`;
        tr.children[0].textContent = branch.name || branch.id;
        tr.children[1].textContent = task.title || "";
        tr.children[2].textContent = task.owner || "Branch";
        tr.children[3].textContent = task.dueDate || "";
        tr.children[4].textContent = task.status || "open";
        directorTasksTbody.appendChild(tr);
      }
    };

    const saveDirectorTask = () => {
      const branch = branchById(String(directorTaskBranch?.value || ""));
      if (!branch) return;
      if (!Array.isArray(branch.tasks)) branch.tasks = [];
      const title = String(directorTaskTitle?.value || "").trim();
      if (!title) return directorTaskTitle?.focus?.();
      branch.tasks.push({
        id: makeRecordId("director-task"),
        title,
        owner: String(directorTaskOwner?.value || "").trim() || "Branch",
        dueDate: String(directorTaskDue?.value || "").trim(),
        status: "open",
        createdBy: session.email || session.username || "director",
        createdAt: isoNow(),
      });
      branch.updatedAt = isoNow();
      persist();
      if (directorTaskTitle) directorTaskTitle.value = "";
      if (directorTaskOwner) directorTaskOwner.value = "";
      if (directorTaskDue) directorTaskDue.value = "";
      renderDirectorTasks();
      renderDirectorNotifications();
      toast("Task assigned", `Task sent to ${branch.name || branch.id}.`);
    };

    const saveNotification = (note) => {
      const current = loadJson(NOTIFICATIONS_KEY, []);
      const list = Array.isArray(current) ? current : [];
      list.push({ id: makeRecordId("note"), createdAt: isoNow(), read: false, ...note });
      saveJson(NOTIFICATIONS_KEY, list.slice(-300));
    };

    const sendDirectorAnnouncement = () => {
      const message = String(directorAnnouncementMessage?.value || "").trim();
      if (!message) return directorAnnouncementMessage?.focus?.();
      const branchId = String(directorAnnouncementBranch?.value || "");
      saveNotification({
        branchId,
        title: "Director announcement",
        body: message,
        actor: session.email || session.username || "director",
      });
      if (directorAnnouncementMessage) directorAnnouncementMessage.value = "";
      renderDirectorNotifications();
      toast("Announcement sent", branchId ? "Message sent to selected branch." : "Message sent to all branches.");
    };

    const directorNotifications = () => {
      const rows = [];
      const saved = loadJson(NOTIFICATIONS_KEY, []);
      if (Array.isArray(saved)) {
        saved.forEach((note) => rows.push({
          at: note.createdAt || note.at || "",
          branchId: note.branchId || "",
          type: note.title || "Notice",
          message: note.body || note.message || "",
          status: note.read ? "read" : "new",
        }));
      }
      for (const branch of data.branches || []) {
        for (const task of branch.tasks || []) {
          if (task.status !== "complete") rows.push({ at: task.dueDate || task.createdAt || "", branchId: branch.id, type: "Task", message: task.title || "", status: task.status || "open" });
        }
        for (const tx of branch.txLog || []) {
          const balance = Number(tx.balance || 0) || 0;
          if (String(tx.saleType || "").toLowerCase() === "credit" && balance > 0) {
            rows.push({ at: tx.creditDueDate || tx.at || "", branchId: branch.id, type: "Credit", message: `${tx.customerPhone || "Customer"} owes KES ${formatInt(balance)}`, status: "open" });
          }
        }
      }
      return rows.sort((a, z) => String(z.at || "").localeCompare(String(a.at || "")));
    };

    const renderDirectorNotifications = () => {
      if (!directorNotificationsTbody) return;
      directorNotificationsTbody.textContent = "";
      const rows = directorNotifications();
      if (!rows.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="5" class="muted">No notifications yet.</td>`;
        directorNotificationsTbody.appendChild(tr);
        return;
      }
      for (const note of rows.slice(0, 120)) {
        const branch = branchById(note.branchId);
        const tr = document.createElement("tr");
        tr.innerHTML = `<td></td><td></td><td></td><td></td><td></td>`;
        tr.children[0].textContent = note.at ? new Date(note.at).toLocaleString() : "";
        tr.children[1].textContent = branch?.name || note.branchId || "All branches";
        tr.children[2].textContent = note.type || "";
        tr.children[3].textContent = note.message || "";
        tr.children[4].textContent = note.status || "";
        directorNotificationsTbody.appendChild(tr);
      }
    };

    const directorAuditRows = () => {
      const rows = [];
      const audit = loadJson(AUDIT_KEY, []);
      if (Array.isArray(audit)) audit.forEach((row) => rows.push({ at: row.at || row.createdAt || "", branchId: row.branchId || "", action: row.action || row.type || "audit", detail: JSON.stringify(row.detail || row.payload || {}) }));
      for (const account of loadBranchAccounts()) {
        if (account.reviewedAt) rows.push({ at: account.reviewedAt, branchId: account.branchId || "", action: `branch.${account.status}`, detail: `${account.email || account.username || "Branch"} reviewed by ${account.reviewedBy || "director"}` });
      }
      for (const branch of data.branches || []) {
        if (branch.updatedAt) rows.push({ at: branch.updatedAt, branchId: branch.id, action: "branch.updated", detail: branch.name || branch.id });
      }
      return rows.sort((a, z) => String(z.at || "").localeCompare(String(a.at || "")));
    };

    const renderDirectorAudit = () => {
      if (!directorAuditTbody) return;
      directorAuditTbody.textContent = "";
      const rows = directorAuditRows();
      if (!rows.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="4" class="muted">No audit entries yet.</td>`;
        directorAuditTbody.appendChild(tr);
        return;
      }
      for (const row of rows.slice(0, 150)) {
        const branch = branchById(row.branchId);
        const tr = document.createElement("tr");
        tr.innerHTML = `<td></td><td></td><td></td><td></td>`;
        tr.children[0].textContent = row.at ? new Date(row.at).toLocaleString() : "";
        tr.children[1].textContent = branch?.name || row.branchId || "Organization";
        tr.children[2].textContent = row.action || "";
        tr.children[3].textContent = row.detail || "";
        directorAuditTbody.appendChild(tr);
      }
    };

    const exportDirectorAuditCsv = () => {
      const rows = [["Time", "Branch", "Action", "Detail"]];
      directorAuditRows().forEach((row) => rows.push([row.at, branchById(row.branchId)?.name || row.branchId || "Organization", row.action, row.detail]));
      downloadText(`enterprise-director-audit-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((row) => row.map(csvEscape).join(",")).join("\n"));
    };

    const renderDirectorSettings = () => {
      if (!directorSettingsGrid) return;
      const modules = orgContext.settings?.installedPortals || orgContext.settings?.navigation || [];
      directorSettingsGrid.innerHTML = `
        <div class="report-card"><div class="label">Organization</div><div class="value" style="font-size:16px;">${orgContext.organization?.name || "MAPPHEX"}</div></div>
        <div class="report-card"><div class="label">Tenant</div><div class="value" style="font-size:16px;">${tenantId || "local"}</div></div>
        <div class="report-card"><div class="label">Business type</div><div class="value" style="font-size:16px;">${orgContext.businessType || "company"}</div></div>
        <div class="report-card"><div class="label">Enabled modules</div><div class="value" style="font-size:16px;">${Array.isArray(modules) && modules.length ? modules.join(", ") : "Configured by admin"}</div></div>
      `;
    };

    const renderOperationsPanels = () => {
      populateDirectorSelects();
      renderDirectorStaff();
      renderDirectorSales();
      renderDirectorProcurement();
      renderDirectorCustomers();
      renderDirectorTasks();
      renderDirectorNotifications();
      renderDirectorAudit();
      renderDirectorSettings();
    };

    const syncAndRender = (opts = { toast: false }) => {
      const saved = loadJson(DATA_KEY, null);
      if (saved && typeof saved === "object") data = saved;

      const selectedBranchId = String(branchSelect?.value || "");
      renderBranchSelect();
      if (branchSelect && selectedBranchId) {
        branchSelect.value = selectedBranchId;
      }
      renderKPIs();
      renderBranchAccounts();
      renderBranchesTable();
      renderOperationsPanels();
      refreshCurrentReport();
      if (opts.toast) toast("Synced", "Dashboard refreshed from ERP store.");

      if (realtimeIndicator) {
        realtimeIndicator.textContent = "Live";
        realtimeIndicator.classList.remove("offline");
      }
    };

    const persist = () => saveJson(DATA_KEY, data);

    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        clearSession();
        window.location.href = "director-login.html";
      });
    }

    $("#menu-toggle")?.addEventListener("click", (event) => {
      event.preventDefault();
      setMenuOpen(!document.body.classList.contains("menu-open"));
    });
    $("#menu-close")?.addEventListener("click", () => setMenuOpen(false));
    $("#menu-backdrop")?.addEventListener("click", () => setMenuOpen(false));
    $("#portal-sidebar")?.addEventListener("click", (event) => {
      const link = event.target?.closest?.("[data-nav]");
      if (!link) return;
      const target = link.getAttribute("data-nav");
      if (!target) return;
      event.preventDefault();
      history.replaceState(null, "", `#${target}`);
      navigateTo(target);
    });
    window.addEventListener("hashchange", () => {
      navigateTo(String(window.location.hash || "").replace("#", "") || "overview");
    });
    window.addEventListener("resize", () => {
      if (!isMobileMenu()) setMenuOpen(false);
    });

    if (branchSearch) {
      branchSearch.addEventListener("input", () => renderBranchesTable());
    }

    if (branchesToggleBtn) {
      branchesToggleBtn.addEventListener("click", () => {
        setBranchesOpen(!isBranchesOpen());
      });
    }

    if (reportsToggleBtn) {
      reportsToggleBtn.addEventListener("click", () => {
        setReportsOpen(!isReportsOpen());
      });
    }

    if (syncBtn) {
      syncBtn.addEventListener("click", () => syncAndRender({ toast: true }));
    }

    [directorSalesBranchFilter, directorSalesTypeFilter, directorSalesChannelFilter].forEach((filter) => {
      filter?.addEventListener("change", () => renderDirectorSales());
    });
    directorSalesExportBtn?.addEventListener("click", () => exportDirectorSalesCsv());
    directorCustomersExportBtn?.addEventListener("click", () => exportDirectorCustomersCsv());
    directorTaskSaveBtn?.addEventListener("click", () => saveDirectorTask());
    directorAnnouncementBtn?.addEventListener("click", () => sendDirectorAnnouncement());
    directorAuditExportBtn?.addEventListener("click", () => exportDirectorAuditCsv());

    if (branchAccountsRefreshBtn) {
      branchAccountsRefreshBtn.addEventListener("click", () => {
        window.EnterpriseStore?.refresh?.([BRANCH_ACCOUNTS_KEY]).finally(() => {
          renderBranchAccounts();
          toast("Refreshed", "Branch account requests updated.");
        });
      });
    }

    if (branchAccountsTbody) {
      branchAccountsTbody.addEventListener("click", (event) => {
        const button = event.target?.closest?.("[data-account-action]");
        if (!button) return;
        const id = button.getAttribute("data-account-id");
        const action = button.getAttribute("data-account-action");
        if (id && action) setBranchAccountStatus(id, action);
      });
    }

    if (generalReportBtn) {
      generalReportBtn.addEventListener("click", () => {
        generateGeneralReport();
        toast("Report ready", "General report generated.");
        setReportsOpen(false);
      });
    }

    if (weeklyReportBtn) {
      weeklyReportBtn.addEventListener("click", () => {
        generateCompanyPeriodReport("weekly");
        toast("Report ready", "Weekly report generated.");
        setReportsOpen(false);
      });
    }

    if (monthlyReportBtn) {
      monthlyReportBtn.addEventListener("click", () => {
        generateCompanyPeriodReport("monthly");
        toast("Report ready", "Monthly report generated.");
        setReportsOpen(false);
      });
    }

    if (yearlyReportBtn) {
      yearlyReportBtn.addEventListener("click", () => {
        generateCompanyPeriodReport("yearly");
        toast("Report ready", "Yearly report generated.");
        setReportsOpen(false);
      });
    }

    if (generalReportCsvBtn) {
      generalReportCsvBtn.addEventListener("click", () => {
        if (currentReport.type === "period" && currentReport.period) {
          const range = getPeriodRange(currentReport.period);
          generateCompanyPeriodReportCsv(currentReport.period);
          toast("Downloaded", `${range.label} report CSV saved.`);
          setReportsOpen(false);
          return;
        }

        generateGeneralReportCsv();
        toast("Downloaded", "General report CSV saved.");
        setReportsOpen(false);
      });
    }

    if (generalReportDocBtn) {
      generalReportDocBtn.addEventListener("click", () => {
        const stamp = new Date().toISOString().slice(0, 10);

        if (currentReport.type === "period" && currentReport.period) {
          const range = getPeriodRange(currentReport.period);
          const html = buildCompanyPeriodReportHtml(currentReport.period);
          downloadWordDoc(
            `enterprise-company-${range.label.toLowerCase()}-report-${stamp}.doc`,
            html,
          );
          toast("Downloaded", `${range.label} report (Word) saved.`);
          setReportsOpen(false);
          return;
        }

        const html = buildGeneralReportHtml();
        downloadWordDoc(`enterprise-company-report-${stamp}.doc`, html);
        toast("Downloaded", "Company report (Word) saved.");
        setReportsOpen(false);
      });
    }

    if (generalReportPdfBtn) {
      generalReportPdfBtn.addEventListener("click", () => {
        if (currentReport.type === "period" && currentReport.period) {
          printReport(buildCompanyPeriodReportHtml(currentReport.period));
          setReportsOpen(false);
          return;
        }

        printReport(buildGeneralReportHtml());
        setReportsOpen(false);
      });
    }

    if (directorChartsBtn) {
      directorChartsBtn.addEventListener("click", () => {
        openCharts();
      });
    }

    if (chartsCloseBtn) {
      chartsCloseBtn.addEventListener("click", () => {
        closeCharts();
      });
    }

    if (branchReportBtn) {
      branchReportBtn.addEventListener("click", () => {
        const branchId = String(branchSelect?.value || "");
        generateBranchReport(branchId);
        toast("Report ready", "Branch report generated.");
        setReportsOpen(false);
      });
    }

    if (branchReportCsvBtn) {
      branchReportCsvBtn.addEventListener("click", () => {
        const branchId = String(branchSelect?.value || "");
        downloadBranchReportCsv(branchId);
        toast("Downloaded", "Branch report CSV saved.");
        setReportsOpen(false);
      });
    }

    if (branchReportDocBtn) {
      branchReportDocBtn.addEventListener("click", () => {
        const branchId = String(branchSelect?.value || "");
        const branch = getBranchById(branchId);
        if (!branch) return;
        const html = buildBranchReportHtml(branchId);
        downloadWordDoc(
          `enterprise-${branch.id}-director-report-${new Date()
            .toISOString()
            .slice(0, 10)}.doc`,
          html,
        );
        toast("Downloaded", "Branch report (Word) saved.");
        setReportsOpen(false);
      });
    }

    if (branchReportPdfBtn) {
      branchReportPdfBtn.addEventListener("click", () => {
        const branchId = String(branchSelect?.value || "");
        const branch = getBranchById(branchId);
        if (!branch) return;
        printReport(buildBranchReportHtml(branchId));
        setReportsOpen(false);
      });
    }

    for (const card of deptCards) {
      card.addEventListener("click", (e) => {
        const href = card.getAttribute("href");
        if (!href || href === "#") {
          e.preventDefault();
          const dept = card.getAttribute("data-dept") || "department";
          toast("Department access", `Director has access to ${dept.toUpperCase()}.`);
        }
      });
    }

    // Default: collapsed until user opens once.
    if (!localStorage.getItem(UI_BRANCHES_OPEN_KEY)) {
      localStorage.setItem(UI_BRANCHES_OPEN_KEY, "0");
    }
    if (!localStorage.getItem(UI_REPORTS_OPEN_KEY)) {
      localStorage.setItem(UI_REPORTS_OPEN_KEY, "0");
    }

    renderBranchSelect();
    syncAndRender();
    generateGeneralReport();
    navigateTo(String(window.location.hash || "").replace("#", "") || "overview");
    setMenuOpen(false);
    setBranchesOpen(isBranchesOpen());
    setReportsOpen(isReportsOpen());
    window.setInterval(() => {
      data = mutateRealtime(data);
      persist();
      renderKPIs();
      renderBranchesTable();
      renderOperationsPanels();
      refreshCurrentReport();
    }, REALTIME_INTERVAL_MS);

    // Cross-tab sync
    subscribeDataChanges(syncAndRender);
  };

  const initDirectorHR = () => {
    const session = requireDirector();
    if (!session) return;

    let data = ensureData();

    const logoutBtn = $("#logout-btn");
    const syncBtn = $("#sync-btn");
    const realtimeIndicator = $("#realtime-indicator");

    const kpiTotal = $("#hr-kpi-total");
    const kpiReporting = $("#hr-kpi-reporting");
    const kpiAvg = $("#hr-kpi-avg");
    const kpiUpdated = $("#hr-kpi-updated");

    const tbody = $("#hr-tbody");

    const chartsBtn = $("#hr-charts-btn");
    const chartsPanel = $("#hr-charts-panel");
    const chartsCloseBtn = $("#hr-charts-close-btn");
    const chartEmployees = $("#hr-chart-employees");

    const dueDateInput = $("#hr-report-due-date");
    const reportBtn = $("#hr-report-btn");
    const reportDocBtn = $("#hr-report-doc-btn");
    const reportPdfBtn = $("#hr-report-pdf-btn");
    const reportOut = $("#hr-report-output");

    const persist = () => {
      data.lastUpdated = isoNow();
      saveJson(DATA_KEY, data);
    };

    const getDueDateIso = () => {
      const v = String(dueDateInput?.value || "").trim();
      if (v) return v;
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toISOString().slice(0, 10);
    };

    const computeHr = () => {
      const branches = Array.isArray(data.branches) ? data.branches : [];
      const total = branches.reduce((s, b) => s + (Number(b.employees || 0) || 0), 0);
      const reporting = branches.filter((b) => Number(b.employees || 0) > 0).length;
      const avg = Math.round(total / Math.max(1, BRANCH_COUNT));
      return { total, reporting, avg };
    };

    const renderKPIs = () => {
      const hr = computeHr();
      if (kpiTotal) kpiTotal.textContent = formatInt(hr.total);
      if (kpiReporting) kpiReporting.textContent = formatInt(hr.reporting);
      if (kpiAvg) kpiAvg.textContent = formatInt(hr.avg);
      const updated = data.lastUpdated ? new Date(data.lastUpdated) : null;
      if (kpiUpdated) kpiUpdated.textContent = updated ? updated.toLocaleString() : "—";

      if (realtimeIndicator) {
        realtimeIndicator.textContent = "Live";
        realtimeIndicator.classList.remove("offline");
      }
    };

    const renderTable = () => {
      if (!tbody) return;
      tbody.textContent = "";
      for (const b of data.branches || []) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td></td><td class="num"></td>`;
        tr.children[0].textContent = b.name || b.id;

        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.step = "1";
        input.value = String(Number(b.employees || 0));
        input.addEventListener("input", () => {
          b.employees = Math.max(0, Number(input.value || 0));
          b.updatedAt = isoNow();
          persist();
          renderKPIs();
        });

        tr.children[1].appendChild(input);
        tbody.appendChild(tr);
      }
    };

    const buildHrReportHtml = () => {
      const generatedAt = new Date();
      const dueIso = getDueDateIso();
      const dueDate = new Date(`${dueIso}T00:00:00`);
      const updated = data.lastUpdated ? new Date(data.lastUpdated) : generatedAt;
      const hr = computeHr();

      const rows = (data.branches || [])
        .slice()
        .sort((a, z) => (z.employees || 0) - (a.employees || 0))
        .map(
          (b) => `
            <tr>
              <td>${b.name || b.id}</td>
              <td class="num">${formatInt(b.employees || 0)}</td>
            </tr>`,
        )
        .join("");

      return `
        <h3>HR Operations Report</h3>
        <p><strong>MAPPHEX</strong> • HR (All branches)</p>
        <div class="report-grid">
          <div class="report-card">
            <div class="label">Generated</div>
            <div class="value" style="font-size:16px;">${generatedAt.toLocaleString()}</div>
          </div>
          <div class="report-card">
            <div class="label">Due date</div>
            <div class="value" style="font-size:16px;">${dueDate.toDateString()}</div>
          </div>
          <div class="report-card">
            <div class="label">Last ERP update</div>
            <div class="value" style="font-size:16px;">${updated.toLocaleString()}</div>
          </div>
        </div>

        <p style="margin-top:12px; font-weight:800;">Executive summary</p>
        <div class="report-grid">
          <div class="report-card">
            <div class="label">Total employees</div>
            <div class="value">${formatInt(hr.total)}</div>
          </div>
          <div class="report-card">
            <div class="label">Branches reporting</div>
            <div class="value">${formatInt(hr.reporting)}</div>
          </div>
          <div class="report-card">
            <div class="label">Avg employees / branch</div>
            <div class="value">${formatInt(hr.avg)}</div>
          </div>
        </div>

        <p style="margin-top:12px; font-weight:800;">Employees by branch</p>
        <div class="table-wrap" style="padding:12px 0 0;">
          <table class="table" aria-label="HR employees report">
            <thead>
              <tr>
                <th>Branch</th>
                <th class="num">Employees</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    };

    const setReportHtml = (html) => {
      if (!reportOut) return;
      reportOut.innerHTML = html;
    };

    const generateReport = () => setReportHtml(buildHrReportHtml());

    const openCharts = () => {
      if (!chartsPanel || !chartEmployees) return;
      chartsPanel.style.display = "";
      resizeCanvasForDpr(chartEmployees);
      const top = (data.branches || [])
        .slice()
        .sort((a, z) => (z.employees || 0) - (a.employees || 0))
        .slice(0, 12);
      const labels = top.map((b) => b.name || b.id);
      const values = top.map((b) => Number(b.employees || 0));
      drawBarChart(chartEmployees, labels, values, "rgba(34, 211, 238, 0.85)");
    };

    const closeCharts = () => {
      if (chartsPanel) chartsPanel.style.display = "none";
    };

    const sync = () => {
      const saved = loadJson(DATA_KEY, null);
      if (saved && typeof saved === "object") data = saved;
      renderKPIs();
      renderTable();
    };

    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        clearSession();
        window.location.href = "director-login.html";
      });
    }

    if (syncBtn) syncBtn.addEventListener("click", () => sync());
    if (chartsBtn) chartsBtn.addEventListener("click", () => openCharts());
    if (chartsCloseBtn) chartsCloseBtn.addEventListener("click", () => closeCharts());

    if (reportBtn) reportBtn.addEventListener("click", () => generateReport());
    if (reportDocBtn)
      reportDocBtn.addEventListener("click", () => {
        const html = buildHrReportHtml();
        downloadWordDocFile(
          `enterprise-hr-report-${new Date().toISOString().slice(0, 10)}.doc`,
          html,
        );
      });
    if (reportPdfBtn)
      reportPdfBtn.addEventListener("click", () => {
        printHtmlReport(buildHrReportHtml(), "HR Report");
      });

    sync();
    generateReport();

    subscribeDataChanges(sync);
  };

  const initDirectorFinance = () => {
    const session = requireDirector();
    if (!session) return;

    let data = ensureData();

    const logoutBtn = $("#logout-btn");
    const syncBtn = $("#sync-btn");
    const realtimeIndicator = $("#realtime-indicator");

    const kpiMpesa = $("#fin-kpi-mpesa");
    const kpiBank = $("#fin-kpi-bank");
    const kpiTx = $("#fin-kpi-tx");
    const kpiUpdated = $("#fin-kpi-updated");

    const tbody = $("#fin-tbody");

    const chartsBtn = $("#fin-charts-btn");
    const chartsPanel = $("#fin-charts-panel");
    const chartsCloseBtn = $("#fin-charts-close-btn");
    const chartMpesa = $("#fin-chart-mpesa");
    const chartBank = $("#fin-chart-bank");

    const dueDateInput = $("#fin-report-due-date");
    const reportBtn = $("#fin-report-btn");
    const reportDocBtn = $("#fin-report-doc-btn");
    const reportPdfBtn = $("#fin-report-pdf-btn");
    const reportOut = $("#fin-report-output");

    const getDueDateIso = () => {
      const v = String(dueDateInput?.value || "").trim();
      if (v) return v;
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toISOString().slice(0, 10);
    };

    const computeFin = () => {
      const totals = computeCompanyTotals(data);
      const updated = data.lastUpdated ? new Date(data.lastUpdated) : null;
      return { totals, updated };
    };

    const renderKPIs = () => {
      const { totals, updated } = computeFin();
      if (kpiMpesa) kpiMpesa.textContent = formatInt(totals.mpesaIn);
      if (kpiBank) kpiBank.textContent = formatInt(totals.bankIn);
      if (kpiTx) kpiTx.textContent = formatInt(totals.txCount);
      if (kpiUpdated) kpiUpdated.textContent = updated ? updated.toLocaleString() : "—";

      if (realtimeIndicator) {
        realtimeIndicator.textContent = "Live";
        realtimeIndicator.classList.remove("offline");
      }
    };

    const renderTable = () => {
      if (!tbody) return;
      tbody.textContent = "";
      for (const b of data.branches || []) {
        const fin = getFinanceSummary(b);
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td></td>
          <td class="num"></td>
          <td class="num"></td>
          <td class="num"></td>
          <td></td>
        `;
        tr.children[0].textContent = b.name || b.id;
        tr.children[1].textContent = formatInt(fin.mpesaIn);
        tr.children[2].textContent = formatInt(fin.bankIn);
        tr.children[3].textContent = formatInt(fin.txCount);
        tr.children[4].textContent = fin.lastTxAt ? new Date(fin.lastTxAt).toLocaleString() : "—";
        tbody.appendChild(tr);
      }
    };

    const buildFinanceReportHtml = () => {
      const generatedAt = new Date();
      const dueIso = getDueDateIso();
      const dueDate = new Date(`${dueIso}T00:00:00`);
      const updated = data.lastUpdated ? new Date(data.lastUpdated) : generatedAt;
      const totals = computeCompanyTotals(data);

      const rows = (data.branches || [])
        .slice()
        .map((b) => ({ b, f: getFinanceSummary(b) }))
        .sort((a, z) => z.f.mpesaIn + z.f.bankIn - (a.f.mpesaIn + a.f.bankIn))
        .map(
          (row) => `
            <tr>
              <td>${row.b.name || row.b.id}</td>
              <td class="num">${formatInt(row.f.mpesaIn)}</td>
              <td class="num">${formatInt(row.f.bankIn)}</td>
              <td class="num">${formatInt(row.f.txCount)}</td>
              <td>${row.f.lastTxAt ? new Date(row.f.lastTxAt).toLocaleString() : "—"}</td>
            </tr>`,
        )
        .join("");

      return `
        <h3>Finance Operations Report</h3>
        <p><strong>MAPPHEX</strong> • Finance (All branches)</p>
        <div class="report-grid">
          <div class="report-card">
            <div class="label">Generated</div>
            <div class="value" style="font-size:16px;">${generatedAt.toLocaleString()}</div>
          </div>
          <div class="report-card">
            <div class="label">Due date</div>
            <div class="value" style="font-size:16px;">${dueDate.toDateString()}</div>
          </div>
          <div class="report-card">
            <div class="label">Last ERP update</div>
            <div class="value" style="font-size:16px;">${updated.toLocaleString()}</div>
          </div>
        </div>

        <p style="margin-top:12px; font-weight:800;">Executive summary</p>
        <div class="report-grid">
          <div class="report-card">
            <div class="label">M-Pesa (KES)</div>
            <div class="value">${formatInt(totals.mpesaIn)}</div>
          </div>
          <div class="report-card">
            <div class="label">Bank (KES)</div>
            <div class="value">${formatInt(totals.bankIn)}</div>
          </div>
          <div class="report-card">
            <div class="label">Transactions</div>
            <div class="value">${formatInt(totals.txCount)}</div>
          </div>
        </div>

        <p style="margin-top:12px; font-weight:800;">Branch finance (summary)</p>
        <div class="table-wrap" style="padding:12px 0 0;">
          <table class="table" aria-label="Finance summary report">
            <thead>
              <tr>
                <th>Branch</th>
                <th class="num">M-Pesa (KES)</th>
                <th class="num">Bank (KES)</th>
                <th class="num">Tx</th>
                <th>Last tx</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    };

    const setReportHtml = (html) => {
      if (!reportOut) return;
      reportOut.innerHTML = html;
    };

    const generateReport = () => setReportHtml(buildFinanceReportHtml());

    const openCharts = () => {
      if (!chartsPanel) return;
      chartsPanel.style.display = "";
      if (chartMpesa) resizeCanvasForDpr(chartMpesa);
      if (chartBank) resizeCanvasForDpr(chartBank);

      const scored = (data.branches || [])
        .map((b) => ({ b, f: getFinanceSummary(b) }))
        .slice();

      const topMpesa = scored
        .slice()
        .sort((a, z) => z.f.mpesaIn - a.f.mpesaIn)
        .slice(0, 10);
      drawBarChart(
        chartMpesa,
        topMpesa.map((x) => x.b.name || x.b.id),
        topMpesa.map((x) => x.f.mpesaIn),
        "rgba(34, 211, 238, 0.85)",
      );

      const topBank = scored
        .slice()
        .sort((a, z) => z.f.bankIn - a.f.bankIn)
        .slice(0, 10);
      drawBarChart(
        chartBank,
        topBank.map((x) => x.b.name || x.b.id),
        topBank.map((x) => x.f.bankIn),
        "rgba(124, 58, 237, 0.85)",
      );
    };

    const closeCharts = () => {
      if (chartsPanel) chartsPanel.style.display = "none";
    };

    const sync = () => {
      const saved = loadJson(DATA_KEY, null);
      if (saved && typeof saved === "object") data = saved;
      renderKPIs();
      renderTable();
    };

    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        clearSession();
        window.location.href = "director-login.html";
      });
    }

    if (syncBtn) syncBtn.addEventListener("click", () => sync());
    if (chartsBtn) chartsBtn.addEventListener("click", () => openCharts());
    if (chartsCloseBtn) chartsCloseBtn.addEventListener("click", () => closeCharts());

    if (reportBtn) reportBtn.addEventListener("click", () => generateReport());
    if (reportDocBtn)
      reportDocBtn.addEventListener("click", () => {
        const html = buildFinanceReportHtml();
        downloadWordDocFile(
          `enterprise-finance-report-${new Date().toISOString().slice(0, 10)}.doc`,
          html,
        );
      });
    if (reportPdfBtn)
      reportPdfBtn.addEventListener("click", () => {
        printHtmlReport(buildFinanceReportHtml(), "Finance Report");
      });

    sync();
    generateReport();

    subscribeDataChanges(sync);
  };

  const initDirectorOperations = () => {
    const session = requireDirector();
    if (!session) return;

    let data = ensureData();

    const logoutBtn = $("#logout-btn");
    const syncBtn = $("#sync-btn");
    const realtimeIndicator = $("#realtime-indicator");

    const kpiStock = $("#ops-kpi-stock");
    const kpiDamaged = $("#ops-kpi-damaged");
    const kpiLost = $("#ops-kpi-lost");
    const kpiUpdated = $("#ops-kpi-updated");

    const render = () => {
      const totals = computeCompanyTotals(data);
      if (kpiStock) kpiStock.textContent = formatInt(totals.totalStock);
      if (kpiDamaged) kpiDamaged.textContent = formatInt(totals.damaged);
      if (kpiLost) kpiLost.textContent = formatInt(totals.lost);
      const updated = data.lastUpdated ? new Date(data.lastUpdated) : null;
      if (kpiUpdated) kpiUpdated.textContent = updated ? updated.toLocaleString() : "—";
      if (realtimeIndicator) {
        realtimeIndicator.textContent = "Live";
        realtimeIndicator.classList.remove("offline");
      }
    };

    const sync = () => {
      const saved = loadJson(DATA_KEY, null);
      if (saved && typeof saved === "object") data = saved;
      render();
    };

    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        clearSession();
        window.location.href = "director-login.html";
      });
    }
    if (syncBtn) syncBtn.addEventListener("click", () => sync());

    sync();
    subscribeDataChanges(sync);
  };

  const initDirectorSales = () => {
    const session = requireDirector();
    if (!session) return;

    let data = ensureData();

    const logoutBtn = $("#logout-btn");
    const syncBtn = $("#sync-btn");
    const realtimeIndicator = $("#realtime-indicator");

    const kpiSold = $("#sales-kpi-sold");
    const kpiTopBranch = $("#sales-kpi-top-branch");
    const kpiTopModel = $("#sales-kpi-top-model");
    const kpiUpdated = $("#sales-kpi-updated");
    const modelsTbody = $("#sales-models-tbody");

    const aggregateModels = () => {
      const map = new Map();
      for (const b of data.branches || []) {
        for (const r of b.inventory || []) {
          const model = String(r.model || "").trim() || "—";
          const entry = map.get(model) || { model, sold: 0, stock: 0 };
          entry.sold += Number(r.sold || 0) || 0;
          entry.stock += Number(r.stock || 0) || 0;
          map.set(model, entry);
        }
      }
      return Array.from(map.values()).sort((a, z) => z.sold - a.sold);
    };

    const render = () => {
      const totals = computeCompanyTotals(data);
      if (kpiSold) kpiSold.textContent = formatInt(totals.totalSold);
      const updated = data.lastUpdated ? new Date(data.lastUpdated) : null;
      if (kpiUpdated) kpiUpdated.textContent = updated ? updated.toLocaleString() : "—";

      const branches = (data.branches || []).map((b) => ({ b, t: computeBranchTotals(b) }));
      branches.sort((a, z) => z.t.sold - a.t.sold);
      if (kpiTopBranch) kpiTopBranch.textContent = branches[0]?.b?.name || "—";

      const models = aggregateModels();
      if (kpiTopModel) kpiTopModel.textContent = models[0]?.model || "—";

      if (modelsTbody) {
        modelsTbody.textContent = "";
        for (const m of models.slice(0, 20)) {
          const tr = document.createElement("tr");
          tr.innerHTML = `<td></td><td class="num"></td><td class="num"></td>`;
          tr.children[0].textContent = m.model;
          tr.children[1].textContent = formatInt(m.sold);
          tr.children[2].textContent = formatInt(m.stock);
          modelsTbody.appendChild(tr);
        }
      }

      if (realtimeIndicator) {
        realtimeIndicator.textContent = "Live";
        realtimeIndicator.classList.remove("offline");
      }
    };

    const sync = () => {
      const saved = loadJson(DATA_KEY, null);
      if (saved && typeof saved === "object") data = saved;
      render();
    };

    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        clearSession();
        window.location.href = "director-login.html";
      });
    }
    if (syncBtn) syncBtn.addEventListener("click", () => sync());

    sync();
    subscribeDataChanges(sync);
  };

  const main = async () => {
    await Promise.all([bootstrapKeyFromApi(DATA_KEY), bootstrapKeyFromApi(BRANCH_ACCOUNTS_KEY)]);
    if (PAGE === "director-dashboard") initDirectorDashboard();
    if (PAGE === "director-hr") initDirectorHR();
    if (PAGE === "director-finance") initDirectorFinance();
    if (PAGE === "director-operations") initDirectorOperations();
    if (PAGE === "director-sales") initDirectorSales();
  };

  main();
})();


