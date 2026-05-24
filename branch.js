(() => {
  "use strict";

  const PAGE = document.body?.dataset?.page || "";

  const SESSION_LOCAL_KEY = "enterprise_session_branch_v1";
  const SESSION_SESSION_KEY = "enterprise_session_branch_tmp_v1";
  const BRANCH_ACCOUNTS_KEY = "enterprise_branch_accounts_v1";
  const DATA_KEY = "enterprise_erp_v1";
  const ORGS_KEY = "platform_organizations_v1";
  const SETTINGS_KEY = "enterprise_org_settings_v1";
  const BRANCH_COUNT = 47;
  const API_ENABLED_KEY = "enterprise_api_enabled_v1";

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

  const formatInt = (value) => {
    const num = Number(value || 0);
    return Number.isFinite(num) ? num.toLocaleString("en-US") : "0";
  };

  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);

  const cleanTenantId = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);

  const BUSINESS_LABELS = {
    retail: { item: "Product", items: "Products", category: "Category", unit: "Unit / attributes", code: "SKU / asset reference", stock: "Products in stock", sold: "Products sold", top: "Top product", placeholder: "e.g. Sugar, cement, shoes" },
    pharmacy: { item: "Medicine", items: "Medicines", category: "Drug category", unit: "Dosage / pack size", code: "Batch / SKU code", stock: "Medicines in stock", sold: "Medicines dispensed", top: "Top medicine", placeholder: "e.g. Amoxicillin 500mg" },
    restaurant: { item: "Menu item", items: "Menu items", category: "Meal category", unit: "Portion / size", code: "Menu code", stock: "Menu items ready", sold: "Orders completed", top: "Top menu item", placeholder: "e.g. Beef stew" },
    hotel: { item: "Room / service", items: "Rooms / services", category: "Room type", unit: "Capacity / package", code: "Room / service code", stock: "Rooms / services", sold: "Bookings completed", top: "Top booking", placeholder: "e.g. Deluxe room" },
    school: { item: "Supply / fee item", items: "Supplies / fee items", category: "Department / class", unit: "Term / unit", code: "Fee / item code", stock: "Supplies / services", sold: "Fee payments", top: "Top fee item", placeholder: "e.g. Term fee" },
    clinic: { item: "Service / medicine", items: "Services / medicines", category: "Clinical category", unit: "Dose / visit", code: "Service / batch code", stock: "Services / medicines", sold: "Consultations", top: "Top service", placeholder: "e.g. Consultation" },
    logistics: { item: "Cargo / item", items: "Cargo / items", category: "Cargo type", unit: "Weight / route", code: "Waybill / item code", stock: "Cargo / items active", sold: "Deliveries completed", top: "Top route", placeholder: "e.g. Nairobi delivery" },
    warehouse: { item: "SKU", items: "SKUs", category: "Stock category", unit: "Pack / unit", code: "SKU code", stock: "SKUs in stock", sold: "Dispatches", top: "Top SKU", placeholder: "e.g. SKU-001" },
    bar: { item: "Bar item", items: "Bar stock", category: "Drink category", unit: "Bottle / crate / tot", code: "Stock code", stock: "Bar stock", sold: "Tabs / sales", top: "Top bar item", placeholder: "e.g. Lager crate" },
    company: { item: "Product / service", items: "Items / services", category: "Category", unit: "Unit / attributes", code: "SKU / service code / asset reference", stock: "Items in stock", sold: "Items sold", top: "Top product/service", placeholder: "e.g. Product, service, asset" },
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

  const makeId = (prefix, index) =>
    `${prefix}${String(index).padStart(2, "0")}`;

  const bufToHex = (buffer) =>
    Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  const weakHashHex = (text) => {
    let h1 = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h1 ^= text.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193);
    }
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
      // Fall through.
    }
    return weakHashHex(text);
  };

  const b64ToBytes = (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  };

  const bytesToB64 = (bytes) => btoa(String.fromCharCode(...bytes));

  const aesEncrypt = async (keyBytes, plaintext) => {
    try {
      if (!crypto?.subtle?.importKey) throw new Error("no subtle");
      const key = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "AES-GCM" },
        false,
        ["encrypt"],
      );
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const enc = new TextEncoder().encode(plaintext);
      const cipher = new Uint8Array(
        await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc),
      );
      return { alg: "AES-GCM", ivB64: bytesToB64(iv), dataB64: bytesToB64(cipher) };
    } catch {
      // Fallback: obfuscation (not secure) for restricted environments.
      const x = new Uint8Array(new TextEncoder().encode(plaintext));
      const out = new Uint8Array(x.length);
      for (let i = 0; i < x.length; i++) out[i] = x[i] ^ keyBytes[i % keyBytes.length];
      return { alg: "XOR", ivB64: "", dataB64: bytesToB64(out) };
    }
  };

  const aesDecrypt = async (keyBytes, payload) => {
    try {
      if (payload.alg === "AES-GCM") {
        const key = await crypto.subtle.importKey(
          "raw",
          keyBytes,
          { name: "AES-GCM" },
          false,
          ["decrypt"],
        );
        const iv = b64ToBytes(payload.ivB64);
        const data = b64ToBytes(payload.dataB64);
        const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
        return new TextDecoder().decode(plainBuf);
      }
    } catch {
      // Fall through.
    }
    const data = b64ToBytes(payload.dataB64);
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = data[i] ^ keyBytes[i % keyBytes.length];
    return new TextDecoder().decode(out);
  };

  const ensureData = () => {
    const existing = loadJson(DATA_KEY, null);
    if (
      existing &&
      typeof existing === "object" &&
      Array.isArray(existing.branches) &&
      existing.branches.length === BRANCH_COUNT
    ) {
      return existing;
    }

    const branches = Array.from({ length: BRANCH_COUNT }, (_, idx) => {
      const i = idx + 1;
      return {
        id: makeId("b", i),
        name: `Branch ${String(i).padStart(2, "0")}`,
        city: "",
        area: "",
        employees: 0,
        inventory: [],
        transactions: [],
        ledger: { head: "GENESIS" },
        updatedAt: isoNow(),
      };
    });

    const seeded = { version: 1, lastUpdated: isoNow(), branches, departments: {} };
    saveJson(DATA_KEY, seeded);
    return seeded;
  };

  const getSession = () => {
    const session =
      safeJsonParse(sessionStorage.getItem(SESSION_SESSION_KEY), null) ||
      loadJson(SESSION_LOCAL_KEY, null);
    if (!session || typeof session !== "object") return null;
    if (!session.role || !session.userId) return null;
    return session;
  };

  const clearSession = () => {
    localStorage.removeItem(SESSION_LOCAL_KEY);
    sessionStorage.removeItem(SESSION_SESSION_KEY);
  };

  const requireBranch = () => {
    const session = getSession();
    if (!session || session.role !== "branch" || !session.branchId) {
      window.location.href = "branch-login.html";
      return null;
    }
    if (session.tenantId) window.EnterpriseCore?.setTenant?.(session.tenantId);
    return session;
  };

  const loadAccounts = () => {
    const accounts = loadJson(BRANCH_ACCOUNTS_KEY, []);
    return Array.isArray(accounts) ? accounts : [];
  };

  const getAccount = (session) => {
    const accounts = loadAccounts();
    return accounts.find((a) => a.id === session.userId && (!a.tenantId || a.tenantId === session.tenantId)) || null;
  };

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

  const csvEscape = (value) => {
    const str = String(value ?? "");
    if (/[",\n]/.test(str)) return `"${str.replaceAll('"', '""')}"`;
    return str;
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

  const verifyLedger = async (branch, keyBytes) => {
    const ledger = branch.ledger || { head: "GENESIS" };
    const txs = Array.isArray(branch.transactions) ? branch.transactions : [];
    let head = "GENESIS";
    for (const tx of txs) {
      const plain = await aesDecrypt(keyBytes, tx.payload);
      const check = await hashHex(`${head}:${plain}`);
      if (check !== tx.hash) return false;
      head = tx.hash;
    }
    return String(ledger.head || "GENESIS") === String(head);
  };

  const initBranchDashboard = () => {
    if (PAGE !== "branch-dashboard") return;

    const session = requireBranch();
    if (!session) return;

    let data = ensureData();
    const account = getAccount(session);
    if (!account) {
      clearSession();
      window.location.href = "branch-login.html";
      return;
    }

    const keyBytes = b64ToBytes(account.secretB64 || "");

    const badge = $("#branch-badge");
    const logoutBtn = $("#branch-logout-btn");
    const syncBtn = $("#branch-sync-btn");
    const ledgerIndicator = $("#ledger-indicator");
    const brandTitle = $("#branch-brand-title");
    const brandSubtitle = $("#branch-brand-subtitle");

    const menuToggle = $("#menu-toggle");
    const menuClose = $("#menu-close");
    const sidebar = $("#branch-sidebar");
    const menuBackdrop = $("#menu-backdrop");

    const kpiModels = $("#b-kpi-models");
    const kpiStockLabel = $("#b-kpi-stock-label");
    const kpiStock = $("#b-kpi-stock");
    const kpiSoldLabel = $("#b-kpi-sold-label");
    const kpiSold = $("#b-kpi-sold");
    const kpiTopLabel = $("#b-kpi-top-label");
    const kpiTop = $("#b-kpi-top");

    const invTbody = $("#branch-inventory-tbody");
    const addPhoneBtn = $("#add-phone-btn");
    const phoneModel = $("#ph-model");
    const phoneColor = $("#ph-color");
    const phoneStorage = $("#ph-storage");
    const phoneSerial = $("#ph-serial");
    const phoneCost = $("#ph-cost");
    const phonePrice = $("#ph-price");
    const phoneReorder = $("#ph-reorder");
    const phoneExpiry = $("#ph-expiry");
    const phoneSaveBtn = $("#ph-save-btn");
    const phoneClearBtn = $("#ph-clear-btn");

    const dlModel = $("#dl-model");
    const dlType = $("#dl-type");
    const dlQty = $("#dl-qty");
    const dlNotes = $("#dl-notes");
    const dlAddBtn = $("#dl-add-btn");
    const dlExportBtn = $("#dl-export-btn");
    const dlTbody = $("#dl-tbody");

    const txSerial = $("#tx-serial");
    const txCustomerPhone = $("#tx-customer-phone");
    const txChannel = $("#tx-channel");
    const txSaleType = $("#tx-sale-type");
    const txRef = $("#tx-ref");
    const txAmount = $("#tx-amount");
    const txPaid = $("#tx-paid");
    const txCreditDue = $("#tx-credit-due");
    const txAddBtn = $("#tx-add-btn");
    const txExportBtn = $("#tx-export-btn");
    const txTbody = $("#tx-tbody");
    const txHelper = $("#tx-helper");
    const txSms = $("#tx-sms");
    const creditSerial = $("#credit-serial");
    const creditChannel = $("#credit-channel");
    const creditAmount = $("#credit-amount");
    const creditRef = $("#credit-ref");
    const creditPayBtn = $("#credit-pay-btn");
    const creditHelper = $("#credit-helper");

    const reportBtn = $("#branch-report-btn");
    const reportCsvBtn = $("#branch-report-csv-btn");
    const reportDocBtn = $("#branch-report-doc-btn");
    const reportPdfBtn = $("#branch-report-pdf-btn");
    const chartsBtn = $("#branch-charts-btn");
    const reportPeriod = $("#report-period");
    const dueDateInput = $("#report-due-date");
    const reportOut = $("#branch-report-output");

    const chartsPanel = $("#charts-panel");
    const chartsCloseBtn = $("#charts-close-btn");
    const chartStock = $("#chart-stock");
    const chartSold = $("#chart-sold");
    const chartDL = $("#chart-dl");

    const orgContext = getOrganizationContext(session);
    const labels = orgContext.labels;
    let editingSerial = "";

    const applyOrganizationContext = () => {
      const orgName = orgContext.organization?.name || orgContext.settings?.organizationName || "MAPPHEX";
      const orgCode = orgContext.organization?.organizationId || orgContext.tenantId || "organization";
      if (brandTitle) brandTitle.textContent = orgName;
      if (brandSubtitle) brandSubtitle.textContent = `${orgCode} - Branch workspace`;
      if (kpiStockLabel) kpiStockLabel.textContent = labels.stock;
      if (kpiSoldLabel) kpiSoldLabel.textContent = labels.sold;
      if (kpiTopLabel) kpiTopLabel.textContent = labels.top;
      const inventoryHeading = $("#inventory-heading");
      if (inventoryHeading) inventoryHeading.textContent = `${labels.item} Entry`;
      const modelLabel = $("#ph-model-label");
      const categoryLabel = $("#ph-category-label");
      const unitLabel = $("#ph-unit-label");
      const codeLabel = $("#ph-code-label");
      if (modelLabel) modelLabel.textContent = `${labels.item} name`;
      if (categoryLabel) categoryLabel.textContent = labels.category;
      if (unitLabel) unitLabel.textContent = labels.unit;
      if (codeLabel) codeLabel.textContent = labels.code;
      if (phoneModel) phoneModel.placeholder = labels.placeholder;
      const invNameHeading = $("#inv-name-heading");
      const invCategoryHeading = $("#inv-category-heading");
      const invUnitHeading = $("#inv-unit-heading");
      if (invNameHeading) invNameHeading.textContent = labels.item;
      if (invCategoryHeading) invCategoryHeading.textContent = labels.category;
      if (invUnitHeading) invUnitHeading.textContent = labels.unit;
    };
    applyOrganizationContext();

    const getBranch = () =>
      (data.branches || []).find((b) => b.id === session.branchId) || null;

    const normalizeBranch = (branch) => {
      if (!branch) return null;
      if (!Array.isArray(branch.inventory)) branch.inventory = [];
      if (!Array.isArray(branch.phones)) branch.phones = [];
      if (!Array.isArray(branch.soldPhones)) branch.soldPhones = [];
      if (!Array.isArray(branch.transactions)) branch.transactions = [];
      if (!Array.isArray(branch.txLog)) branch.txLog = [];
      if (!Array.isArray(branch.damageLoss)) branch.damageLoss = [];
      if (!branch.financeSummary || typeof branch.financeSummary !== "object") {
        branch.financeSummary = { mpesaIn: 0, bankIn: 0, txCount: 0, lastTxAt: "" };
      }
      if (!branch.ledger || typeof branch.ledger !== "object") {
        branch.ledger = { head: "GENESIS" };
      }
      return branch;
    };

    const persist = async () => {
      data.lastUpdated = isoNow();
      saveJson(DATA_KEY, data);
      try {
        await window.EnterpriseStore?.flush?.();
      } catch {
        // IndexedDB/localStorage already has the latest branch change.
      }
    };

    const isMobileMenu = () => window.matchMedia("(max-width: 980px)").matches;

    const setMenuOpen = (open) => {
      const shouldOpen = !!open && isMobileMenu();
      document.body.classList.toggle("menu-open", shouldOpen);
      if (menuToggle) menuToggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      if (sidebar) sidebar.setAttribute("aria-hidden", shouldOpen || !isMobileMenu() ? "false" : "true");
      if (menuBackdrop) menuBackdrop.setAttribute("aria-hidden", shouldOpen ? "false" : "true");
    };

    const navigateTo = (key) => {
      const k = String(key || "").trim() || "overview";
      document.querySelectorAll("[data-section]").forEach((el) => {
        el.style.display = el.getAttribute("data-section") === k ? "" : "none";
      });
      document.querySelectorAll("[data-nav]").forEach((a) => {
        a.classList.toggle("active", a.getAttribute("data-nav") === k);
      });
      if (isMobileMenu()) setMenuOpen(false);
    };

    const itemName = (item) => String(item?.name || item?.model || item?.serviceName || "Item").trim();
    const itemCategory = (item) => String(item?.category || item?.color || item?.type || "General").trim();
    const itemUnit = (item) => String(item?.unit || item?.storage || item?.attributes || "unit").trim();

    const rebuildInventoryFromPhones = (branch) => {
      const phones = Array.isArray(branch.phones) ? branch.phones : [];
      const soldPhones = Array.isArray(branch.soldPhones) ? branch.soldPhones : [];
      const byModel = new Map();
      for (const p of [...phones, ...soldPhones]) {
        const model = itemName(p) || "—";
        const row = byModel.get(model) || { model, stock: 0, sold: 0 };
        if (String(p.status || "in_stock") === "sold") row.sold += 1;
        else row.stock += 1;
        byModel.set(model, row);
      }
      branch.inventory = Array.from(byModel.values()).sort((a, z) =>
        String(a.model).localeCompare(String(z.model)),
      );
    };

    const renderKPIs = () => {
      const branch = normalizeBranch(getBranch());
      if (!branch) return;
      rebuildInventoryFromPhones(branch);
      const totals = computeBranchTotals(branch);
      if (kpiModels) kpiModels.textContent = formatInt(totals.models);
      if (kpiStock) kpiStock.textContent = formatInt(totals.stock);
      if (kpiSold) kpiSold.textContent = formatInt(totals.sold);
      if (kpiTop) kpiTop.textContent = totals.topModel;

      if (badge) badge.textContent = branch.name || "Branch";
    };

    const renderDamageLoss = () => {
      if (!dlTbody) return;
      const branch = normalizeBranch(getBranch());
      if (!branch) return;
      const items = Array.isArray(branch.damageLoss) ? branch.damageLoss : [];
      dlTbody.textContent = "";

      for (const r of items.slice().reverse().slice(0, 60)) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td></td>
          <td></td>
          <td></td>
          <td class="num"></td>
          <td></td>
        `;
        tr.children[0].textContent = new Date(r.at).toLocaleString();
        tr.children[1].textContent = String(r.type || "").toUpperCase();
        tr.children[2].textContent = r.model || "—";
        tr.children[3].textContent = formatInt(r.qty || 0);
        tr.children[4].textContent = r.notes || "";
        dlTbody.appendChild(tr);
      }
    };

    const addDamageLoss = () => {
      const branch = normalizeBranch(getBranch());
      if (!branch) return;

      const model = String(dlModel?.value || "").trim();
      const type = String(dlType?.value || "damaged");
      const qty = Math.max(0, Number(dlQty?.value || 0));
      const notes = String(dlNotes?.value || "").trim();

      if (!model) {
        dlModel?.focus?.();
        return;
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        dlQty?.focus?.();
        return;
      }

      const list = Array.isArray(branch.damageLoss) ? branch.damageLoss : [];
      list.push({
        at: isoNow(),
        type: type === "lost" ? "lost" : "damaged",
        model,
        qty,
        notes,
      });
      branch.damageLoss = list;
      branch.updatedAt = isoNow();
      persist().catch(() => null);

      if (dlModel) dlModel.value = "";
      if (dlQty) dlQty.value = "";
      if (dlNotes) dlNotes.value = "";
      renderDamageLoss();
      renderKPIs();
    };

    const exportDamageLossCsv = () => {
      const branch = normalizeBranch(getBranch());
      if (!branch) return;
      const rows = [["Date", "Type", "ProductService", "Quantity", "Notes"]];
      for (const r of branch.damageLoss || []) {
        rows.push([r.at, r.type, r.model, r.qty, r.notes || ""]);
      }
      const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
      downloadText(
        `enterprise-${branch.id}-damage-loss-${new Date().toISOString().slice(0, 10)}.csv`,
        csv,
      );
    };

    const renderInventory = () => {
      if (!invTbody) return;
      const branch = normalizeBranch(getBranch());
      if (!branch) return;
      const phones = Array.isArray(branch.phones) ? branch.phones : [];
      rebuildInventoryFromPhones(branch);

      invTbody.textContent = "";
      for (const p of phones
        .slice()
        .sort((a, z) => String(a.serial || "").localeCompare(String(z.serial || "")))) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td class="num"></td>
          <td class="num"></td>
          <td class="num"></td>
          <td></td>
          <td></td>
          <td></td>
          <td class="num"></td>
        `;

        tr.children[0].textContent = p.serial || "—";
        tr.children[1].textContent = itemName(p) || "—";
        tr.children[2].textContent = itemCategory(p) || "—";
        tr.children[3].textContent = itemUnit(p) || "—";
        tr.children[4].textContent = formatInt(p.costPrice || p.cost || 0);
        tr.children[5].textContent = formatInt(p.price || 0);
        tr.children[6].textContent = formatInt(p.reorderLevel || 0);
        tr.children[7].textContent = p.expiryDate || "N/A";
        tr.children[8].textContent = String(p.status || "in_stock").replace("_", " ");
        tr.children[9].textContent = p.assignedAgentName || p.assignedAgentUsername || "Open";

        const actions = document.createElement("div");
        actions.className = "report-buttons";
        actions.style.justifyContent = "flex-end";

        const editBtn = document.createElement("button");
        editBtn.className = "btn";
        editBtn.type = "button";
        editBtn.textContent = "Edit";
        editBtn.disabled = String(p.status || "in_stock") === "sold";
        editBtn.addEventListener("click", () => {
          editingSerial = String(p.serial || "");
          if (phoneModel) phoneModel.value = itemName(p) || "";
          if (phoneColor) phoneColor.value = itemCategory(p) || "";
          if (phoneStorage) phoneStorage.value = itemUnit(p) || "";
          if (phoneSerial) phoneSerial.value = p.serial || "";
          if (phoneCost) phoneCost.value = String(Number(p.costPrice || p.cost || 0) || "");
          if (phonePrice) phonePrice.value = String(Number(p.price || 0) || "");
          if (phoneReorder) phoneReorder.value = String(Number(p.reorderLevel || 0) || "");
          if (phoneExpiry) phoneExpiry.value = p.expiryDate || "";
          if (phoneSaveBtn) phoneSaveBtn.textContent = "Update item";
          phoneModel?.focus?.();
        });

        const delBtn = document.createElement("button");
        delBtn.className = "btn";
        delBtn.type = "button";
        delBtn.textContent = String(p.status || "in_stock") === "sold" ? "Sold" : "Remove";
        delBtn.disabled = String(p.status || "in_stock") === "sold";
        delBtn.addEventListener("click", () => {
          const serial = String(p.serial || "");
          const pos = branch.phones.findIndex((x) => String(x.serial || "") === serial);
          if (pos === -1) return;
          branch.phones.splice(pos, 1);
          rebuildInventoryFromPhones(branch);
          branch.updatedAt = isoNow();
          persist().catch(() => null);
          renderInventory();
          renderKPIs();
        });

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        tr.children[10].appendChild(actions);
        invTbody.appendChild(tr);
      }
    };

    const clearPhoneForm = () => {
      if (phoneModel) phoneModel.value = "";
      if (phoneColor) phoneColor.value = "";
      if (phoneStorage) phoneStorage.value = "";
      if (phoneSerial) phoneSerial.value = "";
      if (phoneCost) phoneCost.value = "";
      if (phonePrice) phonePrice.value = "";
      if (phoneReorder) phoneReorder.value = "";
      if (phoneExpiry) phoneExpiry.value = "";
      editingSerial = "";
      if (phoneSaveBtn) phoneSaveBtn.textContent = "Save item";
    };

    const addPhone = async () => {
      const branch = normalizeBranch(getBranch());
      if (!branch) return;

      const model = String(phoneModel?.value || "").trim();
      const color = String(phoneColor?.value || "").trim();
      const storage = String(phoneStorage?.value || "").trim();
      const serial = String(phoneSerial?.value || "").trim();
      const costPrice = Math.max(0, Number(phoneCost?.value || 0));
      const price = Math.max(0, Number(phonePrice?.value || 0));
      const reorderLevel = Math.max(0, Number(phoneReorder?.value || 0));
      const expiryDate = String(phoneExpiry?.value || "").trim();

      if (!model) return phoneModel?.focus?.();
      if (!serial) return phoneSerial?.focus?.();
      if (!Number.isFinite(price) || price <= 0) return phonePrice?.focus?.();

      const exists = (branch.phones || []).some(
        (p) => String(p.serial || "").toLowerCase() === serial.toLowerCase() && String(p.serial || "") !== editingSerial,
      );
      if (exists) {
        phoneSerial?.focus?.();
        return;
      }
      const previouslySold = (branch.soldPhones || []).some(
        (p) => String(p.serial || "").toLowerCase() === serial.toLowerCase() && String(p.serial || "") !== editingSerial,
      );
      if (previouslySold) {
        phoneSerial?.focus?.();
        return;
      }

      const itemPatch = {
        serial,
        model,
        name: model,
        color,
        category: color,
        storage,
        unit: storage,
        costPrice,
        price,
        reorderLevel,
        expiryDate,
        status: "in_stock",
        updatedAt: isoNow(),
      };

      const editIndex = editingSerial
        ? branch.phones.findIndex((p) => String(p.serial || "") === editingSerial)
        : -1;
      if (editIndex >= 0) {
        branch.phones[editIndex] = { ...branch.phones[editIndex], ...itemPatch };
      } else {
        branch.phones.push({ ...itemPatch, createdAt: isoNow() });
      }

      rebuildInventoryFromPhones(branch);
      branch.updatedAt = isoNow();
      await persist();
      clearPhoneForm();
      renderInventory();
      renderKPIs();
      if (ledgerIndicator) {
        ledgerIndicator.textContent = "Stock synced";
        window.setTimeout(() => {
          ledgerIndicator.textContent = "Ledger OK";
        }, 1400);
      }
    };

    const updateTxFromSerial = () => {
      const branch = normalizeBranch(getBranch());
      if (!branch) return;
      const serial = String(txSerial?.value || "").trim();
      if (!serial) {
        if (txHelper) txHelper.textContent = "";
        if (txSms) txSms.textContent = "";
        return;
      }
      const phone =
        (branch.phones || []).find(
          (p) => String(p.serial || "").toLowerCase() === serial.toLowerCase(),
        ) || null;
      if (!phone) {
        if (txHelper) txHelper.textContent = "Reference not found in inventory.";
        if (txSms) txSms.textContent = "";
        return;
      }
      if (txAmount && !String(txAmount.value || "").trim()) {
        txAmount.value = String(Number(phone.price || 0));
      }
      if (txPaid && !String(txPaid.value || "").trim()) {
        txPaid.value = String(Number(phone.price || 0));
      }
      if (txHelper) {
        txHelper.textContent = `${itemName(phone)} • ${itemCategory(phone)} • ${itemUnit(phone)} • KES ${formatInt(phone.price || 0)}`;
      }
      if (txSms) txSms.textContent = "";
    };

    const setTxButtonState = () => {
      if (!txAddBtn) return;
      const serial = String(txSerial?.value || "").trim();
      txAddBtn.disabled = !serial;
    };

    const sendSmsReceipt = (to, message) => {
      const OUTBOX_KEY = "enterprise_sms_outbox_v1";
      const entry = { at: isoNow(), to, message };
      try {
        const raw = localStorage.getItem(OUTBOX_KEY);
        const list = raw ? safeJsonParse(raw, []) : [];
        const arr = Array.isArray(list) ? list : [];
        arr.push(entry);
        localStorage.setItem(OUTBOX_KEY, JSON.stringify(arr.slice(-200)));
      } catch {
        // ignore
      }
      if (txSms) txSms.textContent = `SMS sent to ${to}: ${message}`;
    };

    const postJson = async (url, body) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok && data?.ok !== false, status: res.status, data };
    };

    const requestMpesaStk = async ({ amount, phoneNumber, accountReference, transactionDesc }) => {
      const callbackUrl = `${window.location.origin}/api/mpesa/callback`;
      const result = await postJson("/api/mpesa/stkpush", {
        amount,
        phoneNumber,
        accountReference,
        transactionDesc,
        callbackUrl,
      });
      if (!result.ok) throw new Error(result.data?.error || "M-Pesa STK push failed");
      return result.data;
    };

    const notifyTransaction = (tx, branch) => {
      const amount = Number(tx?.amount || 0) || 0;
      const title = "Transaction recorded";
      const body = `${branch?.name || branch?.id || "Branch"}: KES ${formatInt(amount)} via ${String(tx?.channel || "payment").toUpperCase()} (${tx?.ref || "no reference"})`;
      postJson("/api/onesignal/notify", {
        included_segments: ["Finance", "Sales", "Branches"],
        headings: { en: title },
        contents: { en: body },
        data: { type: "transaction", branchId: branch?.id || "", amountKes: amount, reference: tx?.ref || "" },
      }).catch(() => null);
    };

    const printReceipt = (tx, branch) => {
      const amount = Number(tx?.amount || 0) || 0;
      const paid = Number(tx?.amountPaid ?? tx?.paidAmount ?? amount) || 0;
      const balance = Math.max(0, Number(tx?.balance ?? (amount - paid)) || 0);
      const item = tx?.phone?.name || tx?.phone?.model || tx?.model || "Item";
      const html = `
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Receipt ${escapeHtml(tx?.ref || "")}</title>
            <style>
              body { font-family: Arial, sans-serif; color: #111; margin: 24px; }
              .receipt { max-width: 360px; margin: 0 auto; border: 1px solid #ddd; padding: 18px; }
              h1 { font-size: 20px; margin: 0 0 4px; }
              p { margin: 6px 0; }
              .row { display: flex; justify-content: space-between; gap: 16px; border-top: 1px solid #eee; padding: 8px 0; }
              .total { font-weight: 800; font-size: 18px; }
            </style>
          </head>
          <body>
            <div class="receipt">
              <h1>${escapeHtml(branch?.name || "Branch receipt")}</h1>
              <p>${escapeHtml(new Date(tx?.at || Date.now()).toLocaleString())}</p>
              <div class="row"><span>Item</span><strong>${escapeHtml(item)}</strong></div>
              <div class="row"><span>Serial</span><span>${escapeHtml(tx?.serial || "")}</span></div>
              <div class="row"><span>Customer</span><span>${escapeHtml(tx?.customerPhone || "")}</span></div>
              <div class="row"><span>Channel</span><span>${escapeHtml(String(tx?.channel || "").toUpperCase())}</span></div>
              <div class="row"><span>Reference</span><span>${escapeHtml(tx?.ref || "")}</span></div>
              <div class="row total"><span>Amount</span><span>KES ${escapeHtml(formatInt(amount))}</span></div>
              <div class="row"><span>Paid</span><span>KES ${escapeHtml(formatInt(paid))}</span></div>
              <div class="row"><span>Balance</span><span>KES ${escapeHtml(formatInt(balance))}</span></div>
              <p>Thank you.</p>
            </div>
            <script>window.print();<\/script>
          </body>
        </html>`;
      const receiptWindow = window.open("", "_blank", "width=420,height=640");
      if (!receiptWindow) {
        if (txSms) txSms.textContent = "Allow popups to print the receipt.";
        return;
      }
      receiptWindow.document.open();
      receiptWindow.document.write(html);
      receiptWindow.document.close();
    };

    const renderTransactions = async () => {
      if (!txTbody) return;
      const branch = normalizeBranch(getBranch());
      if (!branch) return;
      txTbody.textContent = "";

      const txLog = Array.isArray(branch.txLog) ? branch.txLog : [];
      const soldPhones = Array.isArray(branch.soldPhones) ? branch.soldPhones : [];

      const rows = txLog.length
        ? txLog.slice().reverse().slice(0, 60)
        : soldPhones
            .slice()
            .reverse()
            .slice(0, 60)
            .map((p) => ({
              at: p.soldAt,
              channel: p.soldChannel || "",
              ref: p.soldRef || "",
              serial: p.serial || "",
              customerPhone: p.soldTo || "",
              amount: Number(p.soldAmount || p.price || 0) || 0,
              amountPaid: Number(p.soldPaid ?? p.soldAmount ?? p.price ?? 0) || 0,
              balance: Number(p.creditBalance || 0) || 0,
              saleType: p.saleType || "cash",
              creditDueDate: p.creditDueDate || "",
              creditStatus: p.creditStatus || "",
              phone: { name: itemName(p), category: itemCategory(p), unit: itemUnit(p), model: p.model, color: p.color, storage: p.storage, price: p.price },
              agent: { username: p.soldBy || "" },
            }));

      for (const obj of rows) {
        const modelRaw = obj?.phone?.name ?? obj?.phone?.model ?? obj?.model ?? "—";
        const soldBy = obj?.agent?.username ?? obj?.soldBy ?? "";
        const amount = Number(obj.amount || 0) || 0;
        const saleType = String(obj.saleType || "cash").toLowerCase();
        const paid = saleType === "credit"
          ? Number(obj.creditPaidTotal ?? obj.amountPaid ?? obj.paidAmount ?? 0) || 0
          : Number(obj.amountPaid ?? obj.paidAmount ?? amount) || 0;
        const balance = Math.max(0, Number(obj.balance ?? (amount - paid)) || 0);
        const status =
          saleType === "credit_payment"
            ? `Credit payment • balance KES ${formatInt(balance)}`
            : saleType === "credit"
              ? balance > 0
                ? `Credit due${obj.creditDueDate ? ` ${obj.creditDueDate}` : ""}`
                : "Credit cleared"
              : "Transaction completed";
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td class="num"></td>
          <td class="num"></td>
          <td class="num"></td>
          <td></td>
          <td></td>
          <td class="num"></td>
        `;
        tr.children[0].textContent = obj.at ? new Date(obj.at).toLocaleString() : "—";
        tr.children[1].textContent = String(modelRaw || "—") || "—";
        tr.children[2].textContent = obj.serial || "—";
        tr.children[3].textContent = obj.customerPhone || "—";
        tr.children[4].textContent = String(obj.channel || "").toUpperCase() || "—";
        tr.children[5].textContent = obj.ref || "—";
        tr.children[6].textContent = formatInt(amount);
        tr.children[7].textContent = formatInt(paid);
        tr.children[8].textContent = formatInt(balance);
        tr.children[9].textContent = status;
        tr.children[10].textContent = soldBy || "—";
        const receiptBtn = document.createElement("button");
        receiptBtn.className = "btn";
        receiptBtn.type = "button";
        receiptBtn.textContent = "Print";
        receiptBtn.addEventListener("click", () => printReceipt(obj, branch));
        tr.children[11].appendChild(receiptBtn);
        txTbody.appendChild(tr);
      }

      if (ledgerIndicator) {
        const ok = await verifyLedger(branch, keyBytes);
        ledgerIndicator.textContent = ok ? "Ledger OK" : "Ledger Tampered";
        ledgerIndicator.classList.toggle("offline", !ok);
      }
    };

    const renderTransactionsSafely = async () => {
      try {
        await renderTransactions();
      } catch (err) {
        console.error("Transaction render error:", err);
        if (ledgerIndicator) {
          ledgerIndicator.textContent = "Render error";
          ledgerIndicator.classList.add("offline");
        }
      }
    };

    const findOpenCreditSale = (branch, serialRaw) => {
      const serial = String(serialRaw || "").trim().toLowerCase();
      if (!serial) return null;
      const txLog = Array.isArray(branch?.txLog) ? branch.txLog : [];
      for (let i = txLog.length - 1; i >= 0; i -= 1) {
        const tx = txLog[i];
        if (String(tx?.saleType || "").toLowerCase() !== "credit") continue;
        if (String(tx.serial || "").toLowerCase() !== serial) continue;
        const amount = Number(tx.amount || 0) || 0;
        const paid = Number(tx.amountPaid ?? tx.paidAmount ?? 0) || 0;
        const balance = Math.max(0, Number(tx.balance ?? (amount - paid)) || 0);
        if (balance > 0) return { tx, index: i, balance };
      }
      return null;
    };

    const updateSoldCreditRecord = (branch, saleTx, paidNow, nextBalance, at, ref) => {
      branch.soldPhones = Array.isArray(branch.soldPhones) ? branch.soldPhones : [];
      const sold = branch.soldPhones.find((p) => String(p.serial || "").toLowerCase() === String(saleTx.serial || "").toLowerCase());
      if (!sold) return;
      sold.soldPaid = (Number(sold.soldPaid ?? sold.soldAmount ?? 0) || 0) + paidNow;
      sold.creditPaidTotal = sold.soldPaid;
      sold.creditBalance = nextBalance;
      sold.creditStatus = nextBalance > 0 ? "open" : "cleared";
      sold.lastCreditPaymentAt = at;
      sold.lastCreditPaymentRef = ref;
    };

    const recordCreditPayment = async () => {
      const branch = normalizeBranch(getBranch());
      if (!branch) return;
      const serial = String(creditSerial?.value || "").trim();
      const channel = String(creditChannel?.value || "mpesa").toLowerCase();
      let ref = String(creditRef?.value || "").trim();
      const rawAmount = Number(creditAmount?.value || 0);
      if (!serial) {
        if (creditHelper) creditHelper.textContent = "Enter the serial or reference from the original credit sale.";
        return creditSerial?.focus?.();
      }
      if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
        if (creditHelper) creditHelper.textContent = "Enter a valid payment amount.";
        return creditAmount?.focus?.();
      }

      const found = findOpenCreditSale(branch, serial);
      if (!found) {
        if (creditHelper) creditHelper.textContent = "No open credit sale found for this reference.";
        return creditSerial?.focus?.();
      }

      const saleTx = found.tx;
      const paidNow = Math.min(rawAmount, found.balance);
      const nextBalance = Math.max(0, found.balance - paidNow);
      const at = isoNow();
      if (!ref) {
        const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
        ref = `${channel.toUpperCase()}-${branch.id}-CREDIT-${stamp}`;
      }

      let mpesaResponse = null;
      if (channel === "mpesa" && paidNow > 0) {
        if (creditHelper) creditHelper.textContent = "Sending M-Pesa STK push for credit payment...";
        try {
          mpesaResponse = await requestMpesaStk({
            amount: paidNow,
            phoneNumber: saleTx.customerPhone,
            accountReference: ref,
            transactionDesc: `MAPPHEX credit payment ${saleTx.serial || ""}`.trim(),
          });
        } catch (err) {
          if (creditHelper) creditHelper.textContent = `${String(err?.message || "M-Pesa STK push failed.")} Recording payment manually.`;
          mpesaResponse = { response: { manualFallback: true, reason: String(err?.message || "M-Pesa STK push failed") } };
        }
      }

      saleTx.creditPaidTotal = (Number(saleTx.creditPaidTotal ?? saleTx.amountPaid ?? saleTx.paidAmount ?? 0) || 0) + paidNow;
      saleTx.balance = nextBalance;
      saleTx.creditStatus = nextBalance > 0 ? "open" : "cleared";
      saleTx.creditPayments = Array.isArray(saleTx.creditPayments) ? saleTx.creditPayments : [];
      saleTx.creditPayments.push({ at, channel, ref, amount: paidNow, balanceAfter: nextBalance });

      const paymentTx = {
        at,
        channel,
        ref,
        amount: paidNow,
        amountPaid: paidNow,
        balance: nextBalance,
        saleType: "credit_payment",
        creditParentRef: saleTx.ref || "",
        creditDueDate: saleTx.creditDueDate || "",
        creditStatus: nextBalance > 0 ? "open" : "cleared",
        serial: saleTx.serial,
        customerPhone: saleTx.customerPhone,
        phone: saleTx.phone || null,
        mpesa: mpesaResponse?.response || null,
      };

      const plain = JSON.stringify(paymentTx);
      const prevHead = String(branch.ledger?.head || "GENESIS");
      const hash = await hashHex(`${prevHead}:${plain}`);
      const payload = await aesEncrypt(keyBytes, plain);
      branch.transactions = Array.isArray(branch.transactions) ? branch.transactions : [];
      branch.transactions.push({ payload, hash });
      branch.ledger = { head: hash };
      branch.txLog = Array.isArray(branch.txLog) ? branch.txLog : [];
      branch.txLog.push(paymentTx);
      branch.txLog = branch.txLog.slice(-400);

      if (!branch.financeSummary || typeof branch.financeSummary !== "object") {
        branch.financeSummary = { mpesaIn: 0, bankIn: 0, txCount: 0, lastTxAt: "" };
      }
      if (channel === "bank") branch.financeSummary.bankIn += paidNow;
      else branch.financeSummary.mpesaIn += paidNow;
      branch.financeSummary.txCount += 1;
      branch.financeSummary.lastTxAt = at;
      updateSoldCreditRecord(branch, saleTx, paidNow, nextBalance, at, ref);
      branch.updatedAt = at;
      persist().catch(() => null);
      notifyTransaction(paymentTx, branch);
      sendSmsReceipt(
        saleTx.customerPhone,
        nextBalance > 0
          ? `MAPPHEX: Credit payment received KES ${formatInt(paidNow)} for reference ${saleTx.serial}. Balance KES ${formatInt(nextBalance)}. Ref: ${ref}.`
          : `MAPPHEX: Credit cleared for reference ${saleTx.serial}. Last payment KES ${formatInt(paidNow)}. Ref: ${ref}. Thank you.`,
      );

      if (creditSerial) creditSerial.value = "";
      if (creditAmount) creditAmount.value = "";
      if (creditRef) creditRef.value = "";
      if (creditHelper) creditHelper.textContent = nextBalance > 0
        ? `Payment recorded. Remaining balance KES ${formatInt(nextBalance)}.`
        : "Payment recorded. Credit cleared.";
      await renderTransactionsSafely();
      renderKPIs();
    };

    const addTransaction = async () => {
      const branch = normalizeBranch(getBranch());
      if (!branch) return;
      const channel = String(txChannel?.value || "mpesa");
      const saleType = String(txSaleType?.value || "cash").toLowerCase() === "credit" ? "credit" : "cash";
      const serial = String(txSerial?.value || "").trim();
      const customerPhone = String(txCustomerPhone?.value || "").trim();
      let ref = String(txRef?.value || "").trim();

      if (!serial) {
        if (txHelper) txHelper.textContent = "Enter the product/service serial or reference first.";
        return txSerial?.focus?.();
      }
      if (!customerPhone) {
        if (txHelper) txHelper.textContent = "Enter the customer phone number before completing the sale.";
        return txCustomerPhone?.focus?.();
      }

      const phone =
        (branch.phones || []).find(
          (p) => String(p.serial || "").toLowerCase() === serial.toLowerCase(),
        ) || null;
      if (!phone) {
        if (txHelper) txHelper.textContent = "Reference not found in inventory.";
        if (txSms) txSms.textContent = "";
        return txSerial?.focus?.();
      }

      const amount = Math.max(0, Number(txAmount?.value || phone.price || 0));
      if (!Number.isFinite(amount) || amount <= 0) return txAmount?.focus?.();
      const paidRaw = saleType === "credit" ? Number(txPaid?.value || 0) : amount;
      const amountPaid = Math.max(0, Math.min(amount, Number.isFinite(paidRaw) ? paidRaw : 0));
      const balance = Math.max(0, amount - amountPaid);
      const creditDueDate = saleType === "credit" ? String(txCreditDue?.value || "").trim() : "";
      if (saleType === "credit" && balance <= 0) return txPaid?.focus?.();
      if (saleType === "credit" && !creditDueDate) return txCreditDue?.focus?.();

      if (!ref) {
        const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
        ref = `${channel.toUpperCase()}-${branch.id}-${stamp}`;
      }

      let mpesaResponse = null;
      if (channel === "mpesa" && amountPaid > 0) {
        if (txSms) txSms.textContent = "Sending M-Pesa STK push...";
        try {
          mpesaResponse = await requestMpesaStk({
            amount: amountPaid,
            phoneNumber: customerPhone,
            accountReference: ref,
            transactionDesc: `MAPPHEX ${itemName(phone)} sale`,
          });
        } catch (err) {
          if (txSms) txSms.textContent = `${String(err?.message || "M-Pesa STK push failed.")} Sale recorded manually; reconcile payment outside M-Pesa.`;
          mpesaResponse = { response: { manualFallback: true, reason: String(err?.message || "M-Pesa STK push failed") } };
        }
      }

      const txObj = {
        at: isoNow(),
        channel,
        ref,
        amount,
        amountPaid,
        creditPaidTotal: saleType === "credit" ? amountPaid : undefined,
        balance,
        saleType,
        creditDueDate,
        creditStatus: saleType === "credit" ? (balance > 0 ? "open" : "cleared") : "paid",
        serial: phone.serial,
        customerPhone,
        phone: {
          name: itemName(phone),
          category: itemCategory(phone),
          unit: itemUnit(phone),
          model: phone.model,
          color: phone.color,
          storage: phone.storage,
          price: phone.price,
        },
        mpesa: mpesaResponse?.response || null,
      };
      const plain = JSON.stringify(txObj);

      const payload = await aesEncrypt(keyBytes, plain);
      const txs = Array.isArray(branch.transactions) ? branch.transactions : [];

      const prevHead = String(branch.ledger?.head || "GENESIS");
      const hash = await hashHex(`${prevHead}:${plain}`);

      txs.push({ payload, hash });
      branch.transactions = txs;

      const txLog = Array.isArray(branch.txLog) ? branch.txLog : [];
      txLog.push(txObj);
      branch.txLog = txLog.slice(-200);
      branch.ledger = { head: hash };
      if (!branch.financeSummary || typeof branch.financeSummary !== "object") {
        branch.financeSummary = { mpesaIn: 0, bankIn: 0, txCount: 0, lastTxAt: "" };
      }
      if (channel === "bank") branch.financeSummary.bankIn += amountPaid;
      else branch.financeSummary.mpesaIn += amountPaid;
      branch.financeSummary.txCount += 1;
      branch.financeSummary.lastTxAt = isoNow();

      // Move the referenced item from available inventory to the sold list for reporting.
      const sold = {
        ...phone,
        status: "sold",
        soldAt: isoNow(),
        soldTo: customerPhone,
        soldRef: ref,
        soldAmount: amount,
        soldPaid: amountPaid,
        creditPaidTotal: saleType === "credit" ? amountPaid : undefined,
        creditBalance: balance,
        saleType,
        creditDueDate,
        creditStatus: saleType === "credit" ? (balance > 0 ? "open" : "cleared") : "paid",
        soldChannel: channel,
        soldBy: "branch",
      };
      const pos = branch.phones.findIndex(
        (p) => String(p.serial || "").toLowerCase() === serial.toLowerCase(),
      );
      if (pos !== -1) branch.phones.splice(pos, 1);
      branch.soldPhones = Array.isArray(branch.soldPhones) ? branch.soldPhones : [];
      branch.soldPhones.push(sold);
      rebuildInventoryFromPhones(branch);
      branch.updatedAt = isoNow();
      persist().catch(() => null);
      notifyTransaction(txObj, branch);
      window.ERPClient?.postTransaction?.({
        sourceModule: "sales",
        type: "sale",
        amount,
        amountPaid,
        quantity: 1,
        itemId: phone.serial || itemName(phone),
        ref,
        customerPhone,
        payload: {
          branchId: branch.id,
          productService: itemName(phone),
          category: itemCategory(phone),
          unit: itemUnit(phone),
          saleType,
          balance,
        },
      }).catch(() => null);

      if (txRef) txRef.value = "";
      if (txAmount) txAmount.value = "";
      if (txPaid) txPaid.value = "";
      if (txCreditDue) txCreditDue.value = "";
      if (txSerial) txSerial.value = "";
      if (txCustomerPhone) {
        txCustomerPhone.value = "";
      }
      if (txHelper) txHelper.textContent = "";

      if (saleType === "credit") {
        if (txSms) txSms.textContent = `Credit sale recorded. Paid KES ${formatInt(amountPaid)}, balance KES ${formatInt(balance)}. Ref ${ref}.`;
      } else if (channel === "mpesa") {
        const promptMsg = mpesaResponse?.response?.manualFallback
          ? `M-Pesa integration not active. Manual payment recorded for KES ${formatInt(amountPaid)}. Ref ${ref}.`
          : `M-Pesa prompt sent. Enter your M-Pesa PIN to pay KES ${formatInt(amountPaid)} for ${itemName(sold)} (${itemUnit(sold)}, ${itemCategory(sold)}) [Ref:${sold.serial}]. Ref ${ref}.`;
        if (txSms) txSms.textContent = promptMsg;
      } else {
        if (txSms) txSms.textContent = `Bank transaction recorded. Ref ${ref}.`;
      }

      sendSmsReceipt(
        customerPhone,
        saleType === "credit"
          ? `MAPPHEX: Credit sale for ${itemName(sold)} (${itemUnit(sold)}, ${itemCategory(sold)}). Paid KES ${formatInt(amountPaid)}, balance KES ${formatInt(balance)}, due ${creditDueDate}. Ref: ${ref}.`
          : `MAPPHEX: Payment received KES ${formatInt(amount)} for ${itemName(sold)} (${itemUnit(sold)}, ${itemCategory(sold)}). Ref: ${ref}. Thank you.`,
      );

      await renderTransactionsSafely();
      renderInventory();
      renderKPIs();
      setTxButtonState();
    };

    const exportTransactionsCsv = async () => {
      const branch = normalizeBranch(getBranch());
      if (!branch) return;

      const rows = [
        [
          "Date",
          "ProductService",
          "Serial",
          "CustomerContact",
          "Channel",
          "Reference",
          "AmountKES",
          "PaidKES",
          "CreditPaidToDateKES",
          "BalanceKES",
          "SaleType",
          "CreditDueDate",
          "CreditStatus",
          "CreditParentRef",
          "Status",
          "SoldBy",
        ],
      ];

      const txLog = Array.isArray(branch.txLog) ? branch.txLog : [];
      const soldPhones = Array.isArray(branch.soldPhones) ? branch.soldPhones : [];

      if (txLog.length) {
        for (const tx of txLog) {
          const modelRaw = tx?.phone?.name ?? tx?.phone?.model ?? tx?.model ?? "";
          const amount = Number(tx.amount || 0) || 0;
          const paid = Number(tx.amountPaid ?? tx.paidAmount ?? amount) || 0;
          const creditPaidTotal = Number(tx.creditPaidTotal ?? paid) || 0;
          const balance = Math.max(0, Number(tx.balance ?? (amount - paid)) || 0);
          rows.push([
            tx.at || "",
            modelRaw || "",
            tx.serial || "",
            tx.customerPhone || "",
            tx.channel || "",
            tx.ref || "",
            amount,
            paid,
            creditPaidTotal,
            balance,
            tx.saleType || "cash",
            tx.creditDueDate || "",
            tx.creditStatus || "",
            tx.creditParentRef || "",
            "completed",
            tx?.agent?.username || "",
          ]);
        }
      } else {
        for (const p of soldPhones) {
          rows.push([
            p.soldAt || "",
            itemName(p) || "",
            p.serial || "",
            p.soldTo || "",
            p.soldChannel || "",
            p.soldRef || "",
            Number(p.soldAmount || p.price || 0) || 0,
            Number(p.soldPaid ?? p.soldAmount ?? p.price ?? 0) || 0,
            Number(p.creditPaidTotal ?? p.soldPaid ?? p.soldAmount ?? p.price ?? 0) || 0,
            Number(p.creditBalance || 0) || 0,
            p.saleType || "cash",
            p.creditDueDate || "",
            p.creditStatus || "",
            "",
            "completed",
            p.soldBy || "",
          ]);
        }
      }

      const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
      downloadText(
        `enterprise-${branch.id}-sales-${new Date().toISOString().slice(0, 10)}.csv`,
        csv,
      );
    };

    const setReportHtml = (html) => {
      if (!reportOut) return;
      reportOut.innerHTML = html;
    };

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

    const getReportRange = () => {
      const key = String(reportPeriod?.value || "all").trim().toLowerCase();
      const now = new Date();
      if (key === "monthly") {
        const start = startOfDay(now);
        start.setDate(1);
        return { key, label: "This month", startMs: start.getTime(), endMs: now.getTime(), start, end: now };
      }
      if (key === "yearly") {
        const start = startOfDay(now);
        start.setMonth(0, 1);
        return { key, label: "This year", startMs: start.getTime(), endMs: now.getTime(), start, end: now };
      }
      return { key: "all", label: "All time", startMs: -Infinity, endMs: Infinity, start: null, end: now };
    };

    const inReportRange = (value, range) => {
      if (range.key === "all") return true;
      const ms = parseTimeMs(value);
      return Number.isFinite(ms) && ms >= range.startMs && ms <= range.endMs;
    };

    const makeReportModelRows = (branch) =>
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

    const makeReportDlRows = (branch, range) =>
      (branch.damageLoss || [])
        .filter((r) => inReportRange(r.at, range))
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

    const makeReportTxRows = (branch, range) =>
      (branch.txLog || [])
        .filter((t) => inReportRange(t.at, range))
        .slice()
        .sort((a, z) => String(z.at || "").localeCompare(String(a.at || "")))
        .slice(0, 30)
        .map((t) => {
          const type = String(t.saleType || "cash").toLowerCase();
          const paid = type === "credit"
            ? Number(t.creditPaidTotal ?? t.amountPaid ?? t.amount ?? 0) || 0
            : Number(t.amountPaid ?? t.amount ?? 0) || 0;
          return `
            <tr>
              <td>${new Date(t.at).toLocaleString()}</td>
              <td>${String(t.channel || "").toUpperCase()}</td>
              <td>${t.ref || "—"}</td>
              <td>${t.serial || "—"}</td>
              <td>${t.customerPhone || "—"}</td>
              <td class="num">${formatInt(t.amount || 0)}</td>
              <td class="num">${formatInt(paid)}</td>
              <td class="num">${formatInt(t.balance ?? 0)}</td>
              <td>${String(t.saleType || "cash").toUpperCase()}</td>
              <td>${t.creditDueDate || "—"}</td>
              <td>${t.creditStatus || "—"}</td>
            </tr>`;
        })
        .join("");

    const buildReportHtml = (branch) => {
      const totals = computeBranchTotals(branch);
      const range = getReportRange();
      const generatedAt = new Date();
      const dueIso = getDueDateIso();
      const dueDate = new Date(`${dueIso}T00:00:00`);
      const updated = branch.updatedAt ? new Date(branch.updatedAt) : generatedAt;

      const txCount = Array.isArray(branch.txLog)
        ? branch.txLog.filter((t) => inReportRange(t.at, range)).length
        : Array.isArray(branch.transactions)
          ? branch.transactions.length
          : 0;
      const periodSold = (branch.soldPhones || []).filter((p) => inReportRange(p.soldAt, range)).length;
      const periodRevenue = (branch.txLog || [])
        .filter((t) => inReportRange(t.at, range))
        .reduce((sum, t) => sum + (Number(t.amountPaid ?? t.amount ?? 0) || 0), 0);
      const creditRows = (branch.txLog || []).filter((t) => String(t.saleType || "").toLowerCase() === "credit" && inReportRange(t.at, range));
      const creditCount = creditRows.length;
      const creditBalance = creditRows.reduce((sum, t) => sum + (Number(t.balance || 0) || 0), 0);

      const modelRows = makeReportModelRows(branch);
      const dlRows = makeReportDlRows(branch, range);
      const txRows = makeReportTxRows(branch, range);

      return `
        <h3>Branch Operations Report</h3>
        <p><strong>${branch.name}</strong></p>
        <div class="report-grid">
          <div class="report-card">
            <div class="label">Generated</div>
            <div class="value" style="font-size:16px;">${generatedAt.toLocaleString()}</div>
          </div>
          <div class="report-card">
            <div class="label">Period</div>
            <div class="value" style="font-size:16px;">${range.label}</div>
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
            <div class="label">Categories</div>
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
            <div class="label">Sold in period</div>
            <div class="value">${formatInt(periodSold)}</div>
          </div>
          <div class="report-card">
            <div class="label">Period revenue (KES)</div>
            <div class="value">${formatInt(periodRevenue)}</div>
          </div>
          <div class="report-card">
            <div class="label">Credit accounts</div>
            <div class="value">${formatInt(creditCount)}</div>
          </div>
          <div class="report-card">
            <div class="label">Credit balance (KES)</div>
            <div class="value">${formatInt(creditBalance)}</div>
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
            <div class="label">Transactions</div>
            <div class="value">${formatInt(txCount)}</div>
          </div>
        </div>

        <p style="margin-top:12px; font-weight:800;">Inventory details</p>
        <div class="table-wrap" style="padding:12px 0 0;">
          <table class="table" aria-label="Branch inventory report">
            <thead>
              <tr>
                <th>Product / Service</th>
                <th class="num">In stock</th>
                <th class="num">Sold</th>
              </tr>
            </thead>
            <tbody>${modelRows || ""}</tbody>
          </table>
        </div>

        <p style="margin-top:12px; font-weight:800;">Damages & loss (${range.label.toLowerCase()})</p>
        <div class="table-wrap" style="padding:12px 0 0;">
          <table class="table" aria-label="Damage and loss report">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Product / Service</th>
                <th class="num">Qty</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>${dlRows || ""}</tbody>
          </table>
        </div>

        <p style="margin-top:12px; font-weight:800;">Transactions (${range.label.toLowerCase()})</p>
        <div class="table-wrap" style="padding:12px 0 0;">
          <table class="table" aria-label="Transactions report">
            <thead>
              <tr>
                <th>Date</th>
                <th>Channel</th>
                <th>Reference</th>
                <th>Serial</th>
                <th>Customer</th>
                <th class="num">Amount (KES)</th>
                <th class="num">Paid</th>
                <th class="num">Balance</th>
                <th>Sale type</th>
                <th>Due date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${txRows || ""}</tbody>
          </table>
        </div>
      `;
    };

    const generateReport = () => {
      const branch = normalizeBranch(getBranch());
      if (!branch) return;

      setReportHtml(buildReportHtml(branch));
    };

    const downloadReportCsv = () => {
      const branch = normalizeBranch(getBranch());
      if (!branch) return;
      const range = getReportRange();
      const rows = [["BranchId", "Branch", "ProductService", "Stock", "Sold"]];
      for (const row of branch.inventory || []) {
        rows.push([branch.id, branch.name, row.model, row.stock, row.sold]);
      }
      rows.push([]);
      rows.push(["Transactions", range.label]);
      rows.push(["Date", "Channel", "Reference", "Serial", "Customer", "AmountKES", "PaidKES", "CreditPaidToDateKES", "BalanceKES", "SaleType", "CreditDueDate", "CreditStatus", "CreditParentRef"]);
      for (const tx of branch.txLog || []) {
        if (!inReportRange(tx.at, range)) continue;
        const amount = Number(tx.amount || 0) || 0;
        const paid = Number(tx.amountPaid ?? tx.paidAmount ?? amount) || 0;
        const creditPaidTotal = Number(tx.creditPaidTotal ?? paid) || 0;
        const balance = Math.max(0, Number(tx.balance ?? (amount - paid)) || 0);
        rows.push([tx.at || "", tx.channel || "", tx.ref || "", tx.serial || "", tx.customerPhone || "", amount, paid, creditPaidTotal, balance, tx.saleType || "cash", tx.creditDueDate || "", tx.creditStatus || "", tx.creditParentRef || ""]);
      }
      const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
      downloadText(
        `enterprise-${branch.id}-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
        csv,
      );
    };

    const downloadReportDoc = () => {
      const branch = normalizeBranch(getBranch());
      if (!branch) return;
      const body = buildReportHtml(branch);

      const doc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Branch Report</title>
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
<body>${body}</body>
</html>`;

      const blob = new Blob([doc], { type: "application/msword;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `enterprise-${branch.id}-report-${new Date()
        .toISOString()
        .slice(0, 10)}.doc`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    };

    const printReport = () => {
      const branch = normalizeBranch(getBranch());
      if (!branch) return;
      const html = buildReportHtml(branch);
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.open();
      w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Branch Report</title>
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
<body>${html}</body>
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
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.textBaseline = "top";
      for (let i = 0; i < labels.length; i++) {
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(16, 16 + i * 18, 10, 10);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillText(`${labels[i]}: ${formatInt(values[i])}`, 32, 14 + i * 18);
      }
    };

    const openCharts = () => {
      const branch = normalizeBranch(getBranch());
      if (!branch || !chartsPanel) return;

      chartsPanel.style.display = "";

      const inv = Array.isArray(branch.inventory) ? branch.inventory : [];
      const topInv = inv
        .slice()
        .sort((a, z) => (z.stock || 0) - (a.stock || 0))
        .slice(0, 8);
      const labelsStock = topInv.map((x) => x.model || "—");
      const valuesStock = topInv.map((x) => Number(x.stock || 0));

      const topSold = inv
        .slice()
        .sort((a, z) => (z.sold || 0) - (a.sold || 0))
        .slice(0, 8);
      const labelsSold = topSold.map((x) => x.model || "—");
      const valuesSold = topSold.map((x) => Number(x.sold || 0));

      const totals = computeBranchTotals(branch);
      const dlValues = [totals.damaged, totals.lost];
      const dlLabels = ["Damaged", "Lost"];

      // Ensure crisp rendering
      for (const c of [chartStock, chartSold, chartDL]) {
        if (!c) continue;
        const rect = c.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        c.width = Math.max(320, Math.floor(rect.width * dpr));
        c.height = Math.max(220, Math.floor(Number(c.getAttribute("height") || 220) * dpr));
      }

      drawBarChart(chartStock, labelsStock, valuesStock, "rgba(34, 211, 238, 0.85)");
      drawBarChart(chartSold, labelsSold, valuesSold, "rgba(124, 58, 237, 0.85)");
      drawPie(chartDL, dlValues, dlLabels);
    };

    const closeCharts = () => {
      if (chartsPanel) chartsPanel.style.display = "none";
    };

    const sync = async () => {
      const saved = loadJson(DATA_KEY, null);
      if (saved && typeof saved === "object") data = saved;
      renderKPIs();
      renderInventory();
      renderDamageLoss();
      await renderTransactionsSafely();
    };

    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        clearSession();
        window.location.href = "branch-login.html";
      });
    }

    if (syncBtn) syncBtn.addEventListener("click", () => sync());

    if (menuToggle) {
      menuToggle.addEventListener("click", (event) => {
        event.preventDefault();
        setMenuOpen(!document.body.classList.contains("menu-open"));
      });
    }
    if (menuClose) menuClose.addEventListener("click", () => setMenuOpen(false));
    if (menuBackdrop) menuBackdrop.addEventListener("click", () => setMenuOpen(false));
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    });
    window.addEventListener("resize", () => {
      if (!isMobileMenu()) setMenuOpen(false);
    });
    setMenuOpen(false);
    if (sidebar) {
      sidebar.addEventListener("click", (e) => {
        const a = e.target?.closest?.("[data-nav]");
        if (!a) return;
        const key = a.getAttribute("data-nav");
        if (!key) return;
        navigateTo(key);
      });
    }

    window.addEventListener("hashchange", () => {
      const key = String(window.location.hash || "").replace("#", "");
      if (key) navigateTo(key);
    });

    if (addPhoneBtn) addPhoneBtn.addEventListener("click", () => phoneModel?.focus?.());
    if (phoneSaveBtn) phoneSaveBtn.addEventListener("click", () => addPhone().catch(() => null));
    if (phoneClearBtn) phoneClearBtn.addEventListener("click", () => clearPhoneForm());
    if (phoneSerial) phoneSerial.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addPhone().catch(() => null);
      }
    });

    if (dlAddBtn) dlAddBtn.addEventListener("click", () => addDamageLoss());
    if (dlExportBtn) dlExportBtn.addEventListener("click", () => exportDamageLossCsv());

    if (txAddBtn) txAddBtn.addEventListener("click", () => addTransaction());
    if (txExportBtn)
      txExportBtn.addEventListener("click", () => exportTransactionsCsv());
    if (creditPayBtn) creditPayBtn.addEventListener("click", () => recordCreditPayment());
    if (txSerial) txSerial.addEventListener("input", () => updateTxFromSerial());
    if (txSerial) txSerial.addEventListener("input", () => setTxButtonState());
    if (txCustomerPhone) txCustomerPhone.addEventListener("input", () => setTxButtonState());

    if (reportBtn) reportBtn.addEventListener("click", () => generateReport());
    if (reportPeriod) reportPeriod.addEventListener("change", () => generateReport());
    if (reportCsvBtn)
      reportCsvBtn.addEventListener("click", () => downloadReportCsv());
    if (reportDocBtn) reportDocBtn.addEventListener("click", () => downloadReportDoc());
    if (reportPdfBtn) reportPdfBtn.addEventListener("click", () => printReport());
    if (chartsBtn) chartsBtn.addEventListener("click", () => openCharts());
    if (chartsCloseBtn) chartsCloseBtn.addEventListener("click", () => closeCharts());

    // First render
    sync()
      .catch((err) => {
        console.error("Branch sync failed:", err);
        if (ledgerIndicator) ledgerIndicator.textContent = "Sync error";
      })
      .finally(() => {
        generateReport();
        navigateTo(String(window.location.hash || "").replace("#", "") || "overview");
        setTxButtonState();
      });

    // Cross-tab sync with Director/other sessions
    const store = window.EnterpriseStore || null;
    if (store?.subscribe) {
      store.subscribe((ev) => {
        if (!ev || ev.type !== "set" || ev.key !== DATA_KEY) return;
        sync();
      });
    } else {
      window.addEventListener("storage", (e) => {
        if (e.key !== DATA_KEY) return;
        sync();
      });
    }
  };

  const main = async () => {
    await bootstrapKeyFromApi(DATA_KEY);
    initBranchDashboard();
  };

  main();
})();
