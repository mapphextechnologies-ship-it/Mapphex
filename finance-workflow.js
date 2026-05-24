const views = {
  dashboard: {
    title: "Dashboard",
    hero: "Overview of all money",
    copy: "Totals, pending items, and recent activity at a glance.",
    action: "Add record",
    col: "Record",
    rows: [],
  },
  invoices: {
    title: "Invoices",
    hero: "All bills received and sent",
    copy: "Track invoices with approved, pending, and rejected status.",
    action: "Add invoice",
    col: "Invoice",
    empty: "No invoices yet.",
    rows: [],
  },
  approvals: {
    title: "Approvals",
    hero: "Requests waiting for sign-off",
    copy: "Review expenses, contracts, and purchases before money is committed.",
    action: "Review approvals",
    col: "Request",
    empty: "No approvals yet.",
    rows: [],
  },
  suppliers: {
    title: "Suppliers",
    hero: "Suppliers & vendors",
    copy: "All payments going to external companies and service providers.",
    action: "Add supplier",
    col: "Supplier",
    rows: [],
  },
  budgets: {
    title: "Budgets",
    hero: "Department budget allocations",
    copy: "See how much is assigned and how much has been used.",
    action: "Add budget",
    col: "Budget",
    rows: [],
  },
  employees: {
    title: "Employees",
    hero: "Staff list",
    copy: "View department, role, and contract type for each employee.",
    action: "Add employee",
    col: "Employee",
    rows: [],
  },
  payroll: {
    title: "Payroll",
    hero: "Monthly salary runs",
    copy: "See who gets paid, how much, and when.",
    action: "Run payroll",
    col: "Salary run",
    rows: [],
  },
  ledger: {
    title: "Ledger",
    hero: "Full accounting record",
    copy: "All debit and credit entries in one organized place.",
    action: "Add entry",
    col: "Entry",
    rows: [],
  },
  reports: {
    title: "Reports",
    hero: "Financial summaries",
    copy: "Reports by period, department, or record type, ready to export.",
    action: "Generate report",
    col: "Report",
    rows: [],
  },
  export: {
    title: "Export",
    hero: "Export finance files",
    copy: "Download clean finance summaries for review or sharing.",
    action: "Export files",
    col: "Export",
    rows: [],
  },
  settings: {
    title: "Settings",
    hero: "Finance settings",
    copy: "Manage finance access, approvals, and basic portal controls.",
    action: "Save settings",
    col: "Setting",
    rows: [],
  },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const INVOICES_KEY = "mapphex_finance_invoices_v1";
const APPROVALS_KEY = "mapphex_finance_approvals_v1";

function money(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function readState() {
  try {
    const params = new URLSearchParams(location.search);
    const org = params.get("org") || params.get("organization") || params.get("tenant") || "";
    const records = window.MapphexFinanceDB?.readMemory?.("mapphex_finance_records", []) || [];
    return { org, records: Array.isArray(records) ? records : [] };
  } catch {
    return { org: "", records: [] };
  }
}

const isPendingInvoice = (item) => {
  const status = String(item?.status || "").toLowerCase();
  const paymentStatus = String(item?.paymentStatus || "").toLowerCase();
  return status === "pending" || paymentStatus === "unpaid" || paymentStatus === "partly paid";
};

const isPendingApproval = (item) => String(item?.status || "").toLowerCase() === "pending";

async function readFinanceRows(key) {
  const rows = window.MapphexFinanceDB ? await window.MapphexFinanceDB.read(key, []) : [];
  return Array.isArray(rows) ? rows : [];
}

async function updatePendingItems() {
  const [invoices, approvals] = await Promise.all([
    readFinanceRows(INVOICES_KEY),
    readFinanceRows(APPROVALS_KEY),
  ]);
  const pendingCount = invoices.filter(isPendingInvoice).length + approvals.filter(isPendingApproval).length;
  $("[data-pending-count]").textContent = String(pendingCount);
}

async function updateTotals(records) {
  const moneyIn = records.filter((item) => item.type === "in").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const moneyOut = records.filter((item) => item.type === "out").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  $("[data-money-in]").textContent = money(moneyIn);
  $("[data-money-out]").textContent = money(moneyOut);
  $("[data-activity-count]").textContent = String(records.length);
  await updatePendingItems();
}

function statusClass(status) {
  return String(status).toLowerCase() === "pending" ? "status pending" : "status";
}

function renderRows(view) {
  const body = $("[data-records-body]");
  body.innerHTML = "";
  if (!view.rows.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="5">${view.empty || "No records yet."}</td>`;
    body.appendChild(row);
    return;
  }
  view.rows.forEach(([name, status, amount, date]) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${name}</td>
      <td><span class="${statusClass(status)}">${status}</span></td>
      <td>${amount}</td>
      <td>${date}</td>
      <td><button class="row-action" type="button">Open</button></td>
    `;
    body.appendChild(row);
  });
}

function setView(key) {
  const view = views[key] || views.dashboard;
  const isDashboard = (views[key] ? key : "dashboard") === "dashboard";
  const mainAction = $("[data-main-action]");
  $("[data-page-title]").textContent = view.title;
  $("[data-hero-title]").textContent = view.hero;
  $("[data-hero-copy]").textContent = view.copy;
  mainAction.textContent = view.action;
  mainAction.hidden = isDashboard;
  $("[data-section-kicker]").textContent = view.title;
  $("[data-section-title]").textContent = view.hero;
  $("[data-section-copy]").textContent = view.copy;
  $("[data-col-one]").textContent = view.col;
  document.querySelector("[data-record-table]")?.toggleAttribute("hidden", isDashboard);
  $$("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === key));
  renderRows(view);
  history.replaceState(null, "", `#${key}`);
  document.body.classList.remove("sidebar-open");
}

async function init() {
  const state = readState();
  if (state.org) $("[data-org-name]").textContent = state.org;
  await updateTotals(state.records);

  $$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  $$("[data-view-shortcut]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.viewShortcut));
  });

  $("[data-menu-button]").addEventListener("click", () => document.body.classList.add("sidebar-open"));
  $("[data-close-sidebar]").addEventListener("click", () => document.body.classList.remove("sidebar-open"));

  const initial = String(location.hash || "#dashboard").replace("#", "");
  setView(views[initial] ? initial : "dashboard");
}

document.addEventListener("DOMContentLoaded", init);
