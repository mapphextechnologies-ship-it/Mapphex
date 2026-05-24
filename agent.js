(() => {
  "use strict";

  const PAGE = document.body?.dataset?.page || "";

  const SESSION_LOCAL_KEY = "enterprise_session_agent_v1";
  const SESSION_SESSION_KEY = "enterprise_session_agent_tmp_v1";
  const AGENT_ACCOUNTS_KEY = "enterprise_agent_accounts_v1";
  const ERP_KEY = "enterprise_erp_v1";
  const API_ENABLED_KEY = "enterprise_api_enabled_v1";
  const SMS_OUTBOX_KEY = "enterprise_sms_outbox_v1";
  const AGENT_PIPELINE_KEY = "enterprise_agent_pipeline_v1";
  const BRANCH_COUNT = 47;

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

  const apiEnabled = () => {
    try {
      return localStorage.getItem(API_ENABLED_KEY) === "1";
    } catch {
      return false;
    }
  };

  const apiPostKv = (key, value) => {
    if (!apiEnabled()) return;
    fetch("/api/kv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    }).catch(() => null);
  };

  const saveJson = (key, value) => {
    try {
      window.EnterpriseStore?.setJson?.(key, value);
    } catch {
      // fall back below
    }
    localStorage.setItem(key, JSON.stringify(value));
    try {
      apiPostKv(key, value);
    } catch {
      // ignore
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

  const isoNow = () => new Date().toISOString();

  const makeId = (prefix, index) =>
    `${prefix}${String(index).padStart(2, "0")}`;

  const ensureERP = () => {
    const existing = loadJson(ERP_KEY, null);
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
        if (!Array.isArray(b.phones)) {
          b.phones = [];
          changed = true;
        }
        if (!Array.isArray(b.soldPhones)) {
          b.soldPhones = [];
          changed = true;
        }
        if (!Array.isArray(b.transactions)) {
          b.transactions = [];
          changed = true;
        }
        if (!Array.isArray(b.txLog)) {
          b.txLog = [];
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
        if (!b.updatedAt) {
          b.updatedAt = isoNow();
          changed = true;
        }
      }
      if (changed) {
        existing.lastUpdated = isoNow();
        saveJson(ERP_KEY, existing);
      }
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
        phones: [],
        soldPhones: [],
        transactions: [],
        txLog: [],
        damageLoss: [],
        financeSummary: { mpesaIn: 0, bankIn: 0, txCount: 0, lastTxAt: "" },
        ledger: { head: "GENESIS" },
        updatedAt: isoNow(),
      };
    });

    const seeded = { version: 1, lastUpdated: isoNow(), branches, departments: {} };
    saveJson(ERP_KEY, seeded);
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

  const requireAgent = () => {
    const session = getSession();
    if (!session || session.role !== "agent" || !session.branchId) {
      window.location.href = "agent-login.html";
      return null;
    }
    return session;
  };

  const loadAgentAccounts = () => {
    const accounts = loadJson(AGENT_ACCOUNTS_KEY, []);
    return Array.isArray(accounts) ? accounts : [];
  };

  const getAgentAccount = (session) => {
    const accounts = loadAgentAccounts();
    return accounts.find((a) => a.id === session.userId) || null;
  };

  const rebuildInventoryFromPhones = (branch) => {
    const phones = Array.isArray(branch.phones) ? branch.phones : [];
    const soldPhones = Array.isArray(branch.soldPhones) ? branch.soldPhones : [];
    const byModel = new Map();
    for (const p of [...phones, ...soldPhones]) {
      const model = String(p.model || "").trim() || "—";
      const row = byModel.get(model) || { model, stock: 0, sold: 0 };
      if (String(p.status || "in_stock") === "sold") row.sold += 1;
      else row.stock += 1;
      byModel.set(model, row);
    }
    branch.inventory = Array.from(byModel.values()).sort((a, z) =>
      String(a.model).localeCompare(String(z.model)),
    );
  };

  const computeBranchTotals = (branch) => {
    const inventory = Array.isArray(branch.inventory) ? branch.inventory : [];
    let stock = 0;
    let sold = 0;
    let topModel = { model: "—", sold: -1 };
    for (const row of inventory) {
      const rowStock = Number(row.stock || 0);
      const rowSold = Number(row.sold || 0);
      stock += rowStock;
      sold += rowSold;
      if (rowSold > topModel.sold) topModel = { model: row.model, sold: rowSold };
    }
    return { stock, sold, topModel: topModel.model || "—" };
  };

  const csvEscape = (value) => {
    const str = String(value ?? "");
    if (/[",\n]/.test(str)) return `"${str.replaceAll('"', '""')}"`;
    return str;
  };

  const htmlEscape = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

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

  const queueSms = (to, message) => {
    const entry = { at: isoNow(), to, message };
    try {
      const raw = localStorage.getItem(SMS_OUTBOX_KEY);
      const list = raw ? safeJsonParse(raw, []) : [];
      const arr = Array.isArray(list) ? list : [];
      arr.push(entry);
      localStorage.setItem(SMS_OUTBOX_KEY, JSON.stringify(arr.slice(-200)));
    } catch {
      // ignore
    }
    return entry;
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
    const branchName = String(branch?.name || tx?.branchId || "Branch");
    const title = "Transaction recorded";
    const body = `${branchName}: KES ${formatInt(amount)} via ${String(tx?.channel || "payment").toUpperCase()} (${tx?.ref || "no reference"})`;
    postJson("/api/onesignal/notify", {
      included_segments: ["Finance", "Sales", "Branches"],
      headings: { en: title },
      contents: { en: body },
      data: { type: "transaction", branchId: branch?.id || "", amountKes: amount, reference: tx?.ref || "" },
    }).catch(() => null);
  };

  const initAgentDashboard = () => {
    if (PAGE !== "agent-dashboard") return;

    const session = requireAgent();
    if (!session) return;

    let erp = ensureERP();
    const account = getAgentAccount(session);
    if (!account) {
      clearSession();
      window.location.href = "agent-login.html";
      return;
    }

    const badge = $("#agent-badge");
    const logoutBtn = $("#agent-logout-btn");
    const syncBtn = $("#agent-sync-btn");
    const indicator = $("#agent-indicator");

    const menuToggle = $("#menu-toggle");
    const menuClose = $("#menu-close");
    const sidebar = $("#agent-sidebar");
    const menuBackdrop = $("#menu-backdrop");

    const kpiStock = $("#a-kpi-stock");
    const kpiSold = $("#a-kpi-sold");
    const kpiTx = $("#a-kpi-tx");
    const kpiTop = $("#a-kpi-top");

    const serialInput = $("#tx-serial");
    const serialList = $("#serial-list");
    const posSearch = $("#pos-search");
    const posQty = $("#pos-qty");
    const posDiscount = $("#pos-discount");
    const posCustomerPhone = $("#pos-customer-phone");
    const posChannel = $("#pos-channel");
    const posCash = $("#pos-cash");
    const posAddBtn = $("#pos-add-btn");
    const posCheckoutBtn = $("#pos-checkout-btn");
    const posClearBtn = $("#pos-clear-btn");
    const posBasketTbody = $("#pos-basket-tbody");
    const posSummary = $("#pos-summary");
    const customerPhone = $("#tx-customer-phone");
    const channelSel = $("#tx-channel");
    const saleTypeSel = $("#tx-sale-type");
    const refInput = $("#tx-ref");
    const amountInput = $("#tx-amount");
    const paidInput = $("#tx-paid");
    const creditDueInput = $("#tx-credit-due");
    const addBtn = $("#tx-add-btn");
    const exportBtn = $("#tx-export-btn");
    const helper = $("#tx-helper");
    const smsLine = $("#tx-sms");
    const creditSerial = $("#credit-serial");
    const creditChannel = $("#credit-channel");
    const creditAmount = $("#credit-amount");
    const creditRef = $("#credit-ref");
    const creditPayBtn = $("#credit-pay-btn");
    const creditHelper = $("#credit-helper");

    const txTbody = $("#tx-tbody");
    const invTbody = $("#inv-tbody");
    const orgNameInput = $("#agent-org-name");
    const orgIndustryInput = $("#agent-org-industry");
    const orgPlanInput = $("#agent-org-plan");
    const orgStatusInput = $("#agent-org-status");
    const orgValueInput = $("#agent-org-value");
    const orgNextInput = $("#agent-org-next");
    const orgSaveBtn = $("#agent-org-save");
    const orgReportBtn = $("#agent-org-report");
    const orgTbody = $("#agent-org-tbody");
    let basket = [];

    const getBranch = () => (erp.branches || []).find((b) => b.id === session.branchId) || null;

    const itemAvailableToAgent = (item) => {
      const assignedId = String(item?.assignedAgentId || "").trim();
      const assignedName = String(item?.assignedAgentUsername || item?.assignedAgentName || "").trim().toLowerCase();
      if (!assignedId && !assignedName) return true;
      if (assignedId && assignedId === String(account.id || "")) return true;
      return assignedName && assignedName === String(account.username || "").trim().toLowerCase();
    };

    const phoneAvailableToAgent = itemAvailableToAgent;
    const itemName = (item) => String(item?.name || item?.model || item?.serviceName || "Item").trim();
    const itemCategory = (item) => String(item?.category || item?.color || item?.type || "General").trim();
    const itemUnit = (item) => String(item?.unit || item?.storage || item?.attributes || "unit").trim();
    const pipelineKey = () => `${AGENT_PIPELINE_KEY}:${account.id || session.userId || "agent"}`;
    const loadPipeline = () => {
      const rows = loadJson(pipelineKey(), []);
      return Array.isArray(rows) ? rows : [];
    };
    const savePipeline = (rows) => saveJson(pipelineKey(), rows.slice(0, 300));

    const normalizeBranch = (branch) => {
      if (!branch) return null;
      if (!Array.isArray(branch.inventory)) branch.inventory = [];
      if (!Array.isArray(branch.phones)) branch.phones = [];
      if (!Array.isArray(branch.soldPhones)) branch.soldPhones = [];
      if (!Array.isArray(branch.txLog)) branch.txLog = [];
      if (!branch.financeSummary || typeof branch.financeSummary !== "object") {
        branch.financeSummary = { mpesaIn: 0, bankIn: 0, txCount: 0, lastTxAt: "" };
      }
      return branch;
    };

    const persist = () => {
      erp.lastUpdated = isoNow();
      saveJson(ERP_KEY, erp);
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

    const renderKPIs = () => {
      const branch = normalizeBranch(getBranch());
      if (!branch) return;
      rebuildInventoryFromPhones(branch);
      const totals = computeBranchTotals(branch);
      const pipeline = loadPipeline();
      if (kpiStock) kpiStock.textContent = formatInt(totals.stock + pipeline.length);
      if (kpiSold) kpiSold.textContent = formatInt(totals.sold);
      if (kpiTop) kpiTop.textContent = totals.topModel;
      if (kpiTx) kpiTx.textContent = formatInt((branch.txLog || []).length);
      if (badge) badge.textContent = `${account.username || "Agent"} • ${branch.name || branch.id || ""}`.trim();
    };

    const renderPipeline = () => {
      if (!orgTbody) return;
      const rows = loadPipeline();
      orgTbody.innerHTML = rows.length
        ? rows
            .map((row) => `<tr><td>${htmlEscape(row.name || "—")}</td><td>${htmlEscape(row.industry || "—")}</td><td>${htmlEscape(row.plan || "—")}</td><td>${htmlEscape(row.status || "—")}</td><td class="num">${formatInt(row.value || 0)}</td><td>${htmlEscape(row.next || "—")}</td></tr>`)
            .join("")
        : `<tr><td colspan="6" class="muted">No organizations onboarded yet. Add a client from any industry.</td></tr>`;
    };

    const savePipelineRow = () => {
      const name = String(orgNameInput?.value || "").trim();
      if (!name) return orgNameInput?.focus?.();
      const rows = loadPipeline();
      rows.unshift({
        id: `client-${Date.now()}`,
        name,
        industry: String(orgIndustryInput?.value || "Retail"),
        plan: String(orgPlanInput?.value || "Starter"),
        status: String(orgStatusInput?.value || "Lead"),
        value: Math.max(0, Number(orgValueInput?.value || 0) || 0),
        next: String(orgNextInput?.value || "").trim(),
        agentId: account.id || session.userId,
        createdAt: isoNow(),
      });
      savePipeline(rows);
      [orgNameInput, orgValueInput, orgNextInput].forEach((el) => {
        if (el) el.value = "";
      });
      window.EnterpriseCore?.notify?.("Organization onboarding", "Client pipeline updated");
      renderPipeline();
      renderKPIs();
    };

    const renderInventory = () => {
      const branch = normalizeBranch(getBranch());
      if (!branch) return;

      const phones = (Array.isArray(branch.phones) ? branch.phones : []).filter(phoneAvailableToAgent);
      if (serialList) {
        serialList.textContent = "";
        for (const p of phones.slice().sort((a, z) => String(a.serial || "").localeCompare(String(z.serial || "")))) {
          const opt = document.createElement("option");
          opt.value = String(p.serial || "");
          serialList.appendChild(opt);
        }
      }

      if (!invTbody) return;
      invTbody.textContent = "";
      for (const p of phones.slice().sort((a, z) => itemName(a).localeCompare(itemName(z))).slice(0, 120)) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td></td><td></td><td></td><td></td><td class="num"></td><td></td>`;
        tr.children[0].textContent = p.serial || "—";
        tr.children[1].textContent = itemName(p) || "—";
        tr.children[2].textContent = itemCategory(p) || "—";
        tr.children[3].textContent = itemUnit(p) || "—";
        tr.children[4].textContent = formatInt(Number(p.price || 0) || 0);
        tr.children[5].textContent = p.assignedAgentName || p.assignedAgentUsername || "Open";
        invTbody.appendChild(tr);
      }
    };

    const findPosItems = (query, qty) => {
      const branch = normalizeBranch(getBranch());
      if (!branch) return [];
      const q = String(query || "").trim().toLowerCase();
      if (!q) return [];
      const needed = Math.max(1, Number(qty || 1));
      return (branch.phones || [])
        .filter(phoneAvailableToAgent)
        .filter((item) => {
          const text = [item.serial, item.name, item.model, item.category, item.color, item.unit, item.storage].join(" ").toLowerCase();
          return text.includes(q);
        })
        .slice(0, needed);
    };

    const renderBasket = () => {
      if (posBasketTbody) {
        posBasketTbody.textContent = "";
        if (!basket.length) {
          posBasketTbody.innerHTML = `<tr><td colspan="6" class="muted">Basket is empty. Search an item and add it.</td></tr>`;
        } else {
          basket.forEach((item, index) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td></td><td></td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td>`;
            tr.children[0].textContent = itemName(item);
            tr.children[1].textContent = item.serial || "";
            tr.children[2].textContent = "1";
            tr.children[3].textContent = formatInt(item.price || 0);
            tr.children[4].textContent = formatInt(item.price || 0);
            const remove = document.createElement("button");
            remove.className = "btn";
            remove.type = "button";
            remove.textContent = "Remove";
            remove.addEventListener("click", () => {
              basket.splice(index, 1);
              renderBasket();
            });
            tr.children[5].appendChild(remove);
            posBasketTbody.appendChild(tr);
          });
        }
      }
      const subtotal = basket.reduce((sum, item) => sum + Number(item.price || 0), 0);
      const discount = Math.min(subtotal, Math.max(0, Number(posDiscount?.value || 0)));
      const total = Math.max(0, subtotal - discount);
      const cash = Number(posCash?.value || 0);
      const change = String(posChannel?.value || "") === "cash" ? Math.max(0, cash - total) : 0;
      if (posSummary) {
        posSummary.textContent = `Items: ${formatInt(basket.length)}\nSubtotal: KES ${formatInt(subtotal)}\nDiscount: KES ${formatInt(discount)}\nTotal: KES ${formatInt(total)}\nChange: KES ${formatInt(change)}`;
      }
    };

    const addToBasket = () => {
      const items = findPosItems(posSearch?.value, posQty?.value);
      if (!items.length) {
        if (posSummary) posSummary.textContent = "No matching in-stock item found for this search.";
        return posSearch?.focus?.();
      }
      const existing = new Set(basket.map((item) => String(item.serial || "").toLowerCase()));
      for (const item of items) {
        if (!existing.has(String(item.serial || "").toLowerCase())) basket.push(item);
      }
      if (posSearch) posSearch.value = "";
      if (posQty) posQty.value = "1";
      renderBasket();
    };

    const printPosReceipt = (tx) => {
      const win = window.open("", "_blank", "width=420,height=640");
      if (!win) {
        if (posSummary) posSummary.textContent = "Allow popups to print the receipt.";
        return;
      }
      const rows = (tx.items || []).map((item) => `<div class="row"><span>${htmlEscape(item.name)}</span><span>KES ${formatInt(item.price)}</span></div>`).join("");
      win.document.write(`<html><head><meta charset="utf-8"><title>Receipt ${htmlEscape(tx.ref)}</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#111}.receipt{max-width:360px;margin:auto;border:1px solid #ddd;padding:18px}.row{display:flex;justify-content:space-between;gap:12px;border-top:1px solid #eee;padding:8px 0}.total{font-weight:800;font-size:18px}</style></head><body><div class="receipt"><h2>${htmlEscape(tx.branchName || "MAPPHEX POS")}</h2><p>${new Date(tx.at).toLocaleString()}</p>${rows}<div class="row"><span>Discount</span><span>KES ${formatInt(tx.discount)}</span></div><div class="row total"><span>Total</span><span>KES ${formatInt(tx.amount)}</span></div><div class="row"><span>Paid via</span><span>${htmlEscape(String(tx.channel || "").toUpperCase())}</span></div><div class="row"><span>Receipt</span><span>${htmlEscape(tx.ref)}</span></div><p>Thank you.</p></div><script>window.print();<\/script></body></html>`);
      win.document.close();
    };

    const checkoutBasket = async () => {
      const branch = normalizeBranch(getBranch());
      if (!branch) return;
      if (!basket.length) return posSearch?.focus?.();
      const channel = String(posChannel?.value || "mpesa");
      const customer = String(posCustomerPhone?.value || "").trim() || "Walk-in";
      const subtotal = basket.reduce((sum, item) => sum + Number(item.price || 0), 0);
      const discount = Math.min(subtotal, Math.max(0, Number(posDiscount?.value || 0)));
      const amount = Math.max(0, subtotal - discount);
      const cash = Number(posCash?.value || 0);
      if (channel === "cash" && cash < amount) {
        if (posSummary) posSummary.textContent = "Cash received is less than the basket total.";
        return posCash?.focus?.();
      }
      const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
      const ref = `${channel.toUpperCase()}-${branch.id}-POS-${stamp}`;
      let mpesaResponse = null;
      if (channel === "mpesa" && amount > 0 && customer !== "Walk-in") {
        if (posSummary) posSummary.textContent = "Sending M-Pesa STK push...";
        try {
          mpesaResponse = await requestMpesaStk({
            amount,
            phoneNumber: customer,
            accountReference: ref,
            transactionDesc: "MAPPHEX POS sale",
          });
        } catch (err) {
          if (posSummary) posSummary.textContent = String(err?.message || "M-Pesa STK push failed.");
          return;
        }
      }
      const at = isoNow();
      const txObj = {
        at,
        channel,
        ref,
        amount,
        amountPaid: channel === "credit" ? 0 : amount,
        balance: channel === "credit" ? amount : 0,
        saleType: channel === "credit" ? "credit" : "cash",
        serial: basket.map((item) => item.serial).join(", "),
        customerPhone: customer,
        agent: { id: account.id, username: account.username },
        phone: { name: `POS basket (${basket.length} items)`, category: "Retail", unit: "basket", price: amount },
        items: basket.map((item) => ({ serial: item.serial, name: itemName(item), category: itemCategory(item), unit: itemUnit(item), price: Number(item.price || 0) })),
        discount,
        mpesa: mpesaResponse?.response || null,
        branchName: branch.name || branch.id || "",
      };
      branch.txLog = Array.isArray(branch.txLog) ? branch.txLog : [];
      branch.txLog.push(txObj);
      branch.txLog = branch.txLog.slice(-400);
      branch.soldPhones = Array.isArray(branch.soldPhones) ? branch.soldPhones : [];
      for (const item of basket) {
        const pos = branch.phones.findIndex((phone) => String(phone.serial || "").toLowerCase() === String(item.serial || "").toLowerCase());
        if (pos !== -1) {
          const [soldItem] = branch.phones.splice(pos, 1);
          branch.soldPhones.push({ ...soldItem, status: "sold", soldAt: at, soldTo: customer, soldRef: ref, soldAmount: Number(soldItem.price || 0), soldChannel: channel, soldBy: account.username || "" });
        }
      }
      if (!branch.financeSummary || typeof branch.financeSummary !== "object") {
        branch.financeSummary = { mpesaIn: 0, bankIn: 0, txCount: 0, lastTxAt: "" };
      }
      if (channel === "bank") branch.financeSummary.bankIn += amount;
      else branch.financeSummary.mpesaIn += amount;
      branch.financeSummary.txCount += 1;
      branch.financeSummary.lastTxAt = at;
      rebuildInventoryFromPhones(branch);
      branch.updatedAt = at;
      persist();
      notifyTransaction(txObj, branch);
      if (customer !== "Walk-in") queueSms(customer, `MAPPHEX: POS sale KES ${formatInt(amount)}. Receipt ${ref}. Thank you.`);
      printPosReceipt(txObj);
      basket = [];
      [posSearch, posDiscount, posCustomerPhone, posCash].forEach((el) => {
        if (el) el.value = "";
      });
      renderBasket();
      renderKPIs();
      renderInventory();
      renderHistory();
    };

    const renderHistory = () => {
      if (!txTbody) return;
      const branch = normalizeBranch(getBranch());
      if (!branch) return;
      txTbody.textContent = "";

      const txLog = Array.isArray(branch.txLog) ? branch.txLog : [];
      const rows = txLog.slice().reverse().slice(0, 80);
      for (const tx of rows) {
        const saleType = String(tx.saleType || "cash").toLowerCase();
        const amount = Number(tx.amount || 0) || 0;
        const paid = saleType === "credit"
          ? Number(tx.creditPaidTotal ?? tx.amountPaid ?? tx.paidAmount ?? 0) || 0
          : Number(tx.amountPaid ?? tx.paidAmount ?? amount) || 0;
        const balance = Math.max(0, Number(tx.balance ?? (amount - paid)) || 0);
        const status =
          saleType === "credit_payment"
            ? `Credit payment • balance KES ${formatInt(balance)}`
            : saleType === "credit"
              ? balance > 0
                ? `Credit due${tx.creditDueDate ? ` ${tx.creditDueDate}` : ""}`
                : "Credit cleared"
              : "Completed";
        const tr = document.createElement("tr");
        tr.innerHTML = `<td></td><td></td><td></td><td></td><td></td><td></td><td class="num"></td><td class="num"></td><td class="num"></td><td></td>`;
        tr.children[0].textContent = tx.at ? new Date(tx.at).toLocaleString() : "—";
        tr.children[1].textContent = String(tx?.phone?.name ?? tx?.phone?.model ?? tx?.model ?? "—") || "—";
        tr.children[2].textContent = tx.serial || "—";
        tr.children[3].textContent = tx.customerPhone || "—";
        tr.children[4].textContent = String(tx.channel || "").toUpperCase() || "—";
        tr.children[5].textContent = tx.ref || "—";
        tr.children[6].textContent = formatInt(amount);
        tr.children[7].textContent = formatInt(paid);
        tr.children[8].textContent = formatInt(balance);
        tr.children[9].textContent = status;
        txTbody.appendChild(tr);
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
        if (creditHelper) creditHelper.textContent = "Enter the sale, subscription, or asset reference for the open credit account.";
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
          if (creditHelper) creditHelper.textContent = String(err?.message || "M-Pesa STK push failed.");
          return;
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
        agent: { id: account.id, username: account.username },
        phone: saleTx.phone || null,
        mpesa: mpesaResponse?.response || null,
      };

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
      persist();
      notifyTransaction(paymentTx, branch);
      queueSms(
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
      renderKPIs();
      renderHistory();
    };

    const updateTxFromSerial = () => {
      const branch = normalizeBranch(getBranch());
      if (!branch) return;
      const serial = String(serialInput?.value || "").trim();
      if (!serial) {
        if (helper) helper.textContent = "";
        if (amountInput) amountInput.value = "";
        return;
      }

      const phone =
        (branch.phones || []).find(
          (p) => String(p.serial || "").toLowerCase() === serial.toLowerCase(),
        ) || null;

      if (!phone) {
        if (helper) helper.textContent = "Reference not found in inventory.";
        if (amountInput) amountInput.value = "";
        return;
      }
      if (!phoneAvailableToAgent(phone)) {
        if (helper) helper.textContent = "This item or service is allocated to another agent.";
        if (amountInput) amountInput.value = "";
        return;
      }

      if (helper) {
        helper.textContent = `${itemName(phone)} • ${itemCategory(phone)} • ${itemUnit(phone)} • KES ${formatInt(Number(phone.price || 0) || 0)}`.replaceAll("  ", " ").trim();
      }
      if (amountInput && !String(amountInput.value || "").trim()) {
        amountInput.value = String(Math.max(0, Number(phone.price || 0) || 0));
      }
      if (paidInput && !String(paidInput.value || "").trim()) {
        paidInput.value = String(Math.max(0, Number(phone.price || 0) || 0));
      }
    };

    const completeSale = async () => {
      const branch = normalizeBranch(getBranch());
      if (!branch) return;

      const channel = String(channelSel?.value || "mpesa");
      const saleType = String(saleTypeSel?.value || "cash").toLowerCase() === "credit" ? "credit" : "cash";
      const serial = String(serialInput?.value || "").trim();
      const cust = String(customerPhone?.value || "").trim();
      let ref = String(refInput?.value || "").trim();

      if (!serial) return serialInput?.focus?.();
      if (!cust) return customerPhone?.focus?.();

      const phone =
        (branch.phones || []).find(
          (p) => String(p.serial || "").toLowerCase() === serial.toLowerCase(),
        ) || null;
      if (!phone) {
        if (helper) helper.textContent = "Reference not found in inventory.";
        return serialInput?.focus?.();
      }
      if (!phoneAvailableToAgent(phone)) {
        if (helper) helper.textContent = "This item or service is allocated to another agent.";
        return serialInput?.focus?.();
      }

      const amount = Math.max(0, Number(amountInput?.value || phone.price || 0));
      if (!Number.isFinite(amount) || amount <= 0) return amountInput?.focus?.();
      const paidRaw = saleType === "credit" ? Number(paidInput?.value || 0) : amount;
      const amountPaid = Math.max(0, Math.min(amount, Number.isFinite(paidRaw) ? paidRaw : 0));
      const balance = Math.max(0, amount - amountPaid);
      const creditDueDate = saleType === "credit" ? String(creditDueInput?.value || "").trim() : "";
      if (saleType === "credit" && balance <= 0) return paidInput?.focus?.();
      if (saleType === "credit" && !creditDueDate) return creditDueInput?.focus?.();

      if (!ref) {
        const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
        ref = `${channel.toUpperCase()}-${branch.id}-${stamp}`;
      }

      const at = isoNow();

      let mpesaResponse = null;
      if (channel === "mpesa" && amountPaid > 0) {
        if (smsLine) smsLine.textContent = "Sending M-Pesa STK push...";
        try {
          mpesaResponse = await requestMpesaStk({
            amount: amountPaid,
            phoneNumber: cust,
            accountReference: ref,
            transactionDesc: `MAPPHEX ${itemName(phone)} sale`,
          });
        } catch (err) {
          if (smsLine) smsLine.textContent = String(err?.message || "M-Pesa STK push failed.");
          return;
        }
      }

      const txObj = {
        at,
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
        customerPhone: cust,
        agent: { id: account.id, username: account.username },
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

      branch.txLog = Array.isArray(branch.txLog) ? branch.txLog : [];
      branch.txLog.push(txObj);
      branch.txLog = branch.txLog.slice(-400);

      if (!branch.financeSummary || typeof branch.financeSummary !== "object") {
        branch.financeSummary = { mpesaIn: 0, bankIn: 0, txCount: 0, lastTxAt: "" };
      }
      if (channel === "bank") branch.financeSummary.bankIn += amountPaid;
      else branch.financeSummary.mpesaIn += amountPaid;
      branch.financeSummary.txCount += 1;
      branch.financeSummary.lastTxAt = at;

      const sold = {
        ...phone,
        status: "sold",
        soldAt: at,
        soldTo: cust,
        soldRef: ref,
        soldAmount: amount,
        soldPaid: amountPaid,
        creditPaidTotal: saleType === "credit" ? amountPaid : undefined,
        creditBalance: balance,
        saleType,
        creditDueDate,
        creditStatus: saleType === "credit" ? (balance > 0 ? "open" : "cleared") : "paid",
        soldChannel: channel,
        soldBy: account.username || "",
      };
      const pos = branch.phones.findIndex(
        (p) => String(p.serial || "").toLowerCase() === serial.toLowerCase(),
      );
      if (pos !== -1) branch.phones.splice(pos, 1);
      branch.soldPhones = Array.isArray(branch.soldPhones) ? branch.soldPhones : [];
      branch.soldPhones.push(sold);

      rebuildInventoryFromPhones(branch);
      branch.updatedAt = at;
      persist();
      notifyTransaction(txObj, branch);
      window.ERPClient?.postTransaction?.({
        sourceModule: "sales",
        type: "sale",
        amount,
        amountPaid,
        quantity: 1,
        itemId: phone.serial || itemName(phone),
        ref,
        customerPhone: cust,
        payload: {
          branchId: branch.id,
          agentId: account.id,
          productService: itemName(phone),
          category: itemCategory(phone),
          unit: itemUnit(phone),
          saleType,
          balance,
        },
      }).catch(() => null);

      // UI cleanup
      if (refInput) refInput.value = "";
      if (amountInput) amountInput.value = "";
      if (paidInput) paidInput.value = "";
      if (creditDueInput) creditDueInput.value = "";
      if (serialInput) serialInput.value = "";
      if (customerPhone) customerPhone.value = "";
      if (helper) helper.textContent = "";

      const msg =
        saleType === "credit"
          ? `Credit sale recorded. Paid KES ${formatInt(amountPaid)}, balance KES ${formatInt(balance)}. Ref ${ref}.`
          : channel === "mpesa"
            ? `M-Pesa payment recorded. Ref ${ref}.`
            : `Bank payment recorded. Ref ${ref}.`;
      if (smsLine) smsLine.textContent = msg;

      queueSms(
        cust,
        saleType === "credit"
          ? `MAPPHEX: Credit sale for ${itemName(sold)} (${itemCategory(sold)}, ${itemUnit(sold)}). Paid KES ${formatInt(amountPaid)}, balance KES ${formatInt(balance)}, due ${creditDueDate}. Ref: ${ref}.`
          : `MAPPHEX: Payment received KES ${formatInt(amount)} for ${itemName(sold)} (${itemCategory(sold)}, ${itemUnit(sold)}). Ref: ${ref}. Thank you.`,
      );

      renderKPIs();
      renderInventory();
      renderHistory();
      updateTxFromSerial();
    };

    const exportCsv = () => {
      const branch = normalizeBranch(getBranch());
      if (!branch) return;
      const rows = [
        ["Date", "Channel", "Reference", "ItemReference", "ClientContact", "AmountKES", "PaidKES", "CreditPaidToDateKES", "BalanceKES", "SaleType", "CreditDueDate", "CreditStatus", "CreditParentRef", "ProductService", "Agent"],
      ];
      for (const tx of branch.txLog || []) {
        const modelRaw = tx?.phone?.name ?? tx?.phone?.model ?? tx?.model ?? "";
        const amount = Number(tx.amount || 0) || 0;
        const paid = Number(tx.amountPaid ?? tx.paidAmount ?? amount) || 0;
        const creditPaidTotal = Number(tx.creditPaidTotal ?? paid) || 0;
        const balance = Math.max(0, Number(tx.balance ?? (amount - paid)) || 0);
        rows.push([
          tx.at || "",
          tx.channel || "",
          tx.ref || "",
          tx.serial || "",
          tx.customerPhone || "",
          amount,
          paid,
          creditPaidTotal,
          balance,
          tx.saleType || "cash",
          tx.creditDueDate || "",
          tx.creditStatus || "",
          tx.creditParentRef || "",
          modelRaw || "",
          tx?.agent?.username || "",
        ]);
      }
      const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
      downloadText(
        `enterprise-${branch.id}-sales-${new Date().toISOString().slice(0, 10)}.csv`,
        csv,
      );
    };

    const sync = () => {
      const saved = loadJson(ERP_KEY, null);
      if (saved && typeof saved === "object") erp = saved;
      renderKPIs();
      renderInventory();
      renderHistory();
      renderPipeline();
      renderBasket();
      updateTxFromSerial();
      if (indicator) {
        indicator.textContent = "Live";
        indicator.classList.remove("offline");
      }
    };

    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        clearSession();
        window.location.href = "agent-login.html";
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

    if (serialInput) serialInput.addEventListener("input", () => updateTxFromSerial());
    if (posAddBtn) posAddBtn.addEventListener("click", () => addToBasket());
    if (posCheckoutBtn) posCheckoutBtn.addEventListener("click", () => checkoutBasket());
    if (posClearBtn) posClearBtn.addEventListener("click", () => {
      basket = [];
      renderBasket();
    });
    if (posDiscount) posDiscount.addEventListener("input", () => renderBasket());
    if (posCash) posCash.addEventListener("input", () => renderBasket());
    if (posSearch) posSearch.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addToBasket();
      }
    });
    if (addBtn) addBtn.addEventListener("click", () => completeSale());
    if (exportBtn) exportBtn.addEventListener("click", () => exportCsv());
    if (creditPayBtn) creditPayBtn.addEventListener("click", () => recordCreditPayment());
    if (orgSaveBtn) orgSaveBtn.addEventListener("click", () => savePipelineRow());
    if (orgReportBtn) orgReportBtn.addEventListener("click", () => {
      const rows = [["Organization", "Industry", "Plan", "Status", "ValueKES", "NextAction"], ...loadPipeline().map((row) => [row.name, row.industry, row.plan, row.status, row.value, row.next])];
      downloadText(`agent-onboarding-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((r) => r.map(csvEscape).join(",")).join("\n"));
    });

    sync();
    navigateTo(String(window.location.hash || "").replace("#", "") || "overview");

    const store = window.EnterpriseStore || null;
    if (store?.subscribe) {
      store.subscribe((ev) => {
        if (!ev || ev.type !== "set" || ev.key !== ERP_KEY) return;
        sync();
      });
    } else {
      window.addEventListener("storage", (e) => {
        if (e.key !== ERP_KEY) return;
        sync();
      });
    }
  };

  const main = async () => {
    await bootstrapKeyFromApi(ERP_KEY);
    initAgentDashboard();
  };

  main();
})();
