const views = {
  dashboard: {
    title: "Dashboard",
    hero: "Overview of all money",
    copy: "Totals, pending items, and recent activity at a glance.",
    action: "Add record",
    col: "Record",
    rows: [
      ["Money summary", "Ready", "KES 0", "Today"],
      ["Recent activity", "Ready", "KES 0", "Today"],
      ["Pending review", "Pending", "7 items", "Today"],
    ],
  },
  invoices: {
    title: "Invoices",
    hero: "All bills received and sent",
    copy: "Track invoices with approved, pending, and rejected status.",
    action: "Add invoice",
    col: "Invoice",
    rows: [
      ["Customer invoice", "Approved", "KES 0", "Today"],
      ["Supplier bill", "Pending", "KES 0", "Today"],
      ["Service invoice", "Rejected", "KES 0", "Today"],
    ],
  },
  approvals: {
    title: "Approvals",
    hero: "Requests waiting for sign-off",
    copy: "Review expenses, contracts, and purchases before money is committed.",
    action: "Review approvals",
    col: "Request",
    rows: [
      ["Expense approval", "Pending", "KES 0", "Today"],
      ["Purchase approval", "Pending", "KES 0", "Today"],
      ["Contract approval", "Pending", "KES 0", "Today"],
    ],
  },
  suppliers: {
    title: "Suppliers",
    hero: "Suppliers & vendors",
    copy: "All payments going to external companies and service providers.",
    action: "Add supplier",
    col: "Supplier",
    rows: [
      ["Main supplier", "Approved", "KES 0", "Today"],
      ["Service provider", "Pending", "KES 0", "Today"],
    ],
  },
  budgets: {
    title: "Budgets",
    hero: "Department budget allocations",
    copy: "See how much is assigned and how much has been used.",
    action: "Add budget",
    col: "Budget",
    rows: [
      ["Operations budget", "Approved", "KES 0", "This month"],
      ["Staff budget", "Pending", "KES 0", "This month"],
    ],
  },
  employees: {
    title: "Employees",
    hero: "Staff list",
    copy: "View department, role, and contract type for each employee.",
    action: "Add employee",
    col: "Employee",
    rows: [
      ["Finance staff", "Approved", "Full-time", "Today"],
      ["Casual staff", "Pending", "Contract", "Today"],
    ],
  },
  payroll: {
    title: "Payroll",
    hero: "Monthly salary runs",
    copy: "See who gets paid, how much, and when.",
    action: "Run payroll",
    col: "Salary run",
    rows: [
      ["Monthly payroll", "Pending", "KES 0", "This month"],
      ["Salary adjustment", "Pending", "KES 0", "This month"],
    ],
  },
  ledger: {
    title: "Ledger",
    hero: "Full accounting record",
    copy: "All debit and credit entries in one organized place.",
    action: "Add entry",
    col: "Entry",
    rows: [
      ["Debit entry", "Approved", "KES 0", "Today"],
      ["Credit entry", "Approved", "KES 0", "Today"],
    ],
  },
  reports: {
    title: "Reports",
    hero: "Financial summaries",
    copy: "Reports by period, department, or record type, ready to export.",
    action: "Generate report",
    col: "Report",
    rows: [
      ["Monthly summary", "Ready", "KES 0", "This month"],
      ["Department report", "Ready", "KES 0", "This month"],
    ],
  },
  export: {
    title: "Export",
    hero: "Export finance files",
    copy: "Download clean finance summaries for review or sharing.",
    action: "Export files",
    col: "Export",
    rows: [
      ["PDF report", "Ready", "PDF", "Today"],
      ["Excel report", "Ready", "Excel", "Today"],
    ],
  },
  settings: {
    title: "Settings",
    hero: "Finance settings",
    copy: "Manage finance access, approvals, and basic portal controls.",
    action: "Save settings",
    col: "Setting",
    rows: [
      ["Finance users", "Ready", "Active", "Today"],
      ["Approval rules", "Ready", "Active", "Today"],
    ],
  },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

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
    const records = JSON.parse(localStorage.getItem("mapphex_finance_records") || "[]");
    return { org, records: Array.isArray(records) ? records : [] };
  } catch {
    return { org: "", records: [] };
  }
}

function updateTotals(records) {
  const moneyIn = records.filter((item) => item.type === "in").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const moneyOut = records.filter((item) => item.type === "out").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  $("[data-money-in]").textContent = money(moneyIn);
  $("[data-money-out]").textContent = money(moneyOut);
  $("[data-activity-count]").textContent = String(records.length);
}

function statusClass(status) {
  return String(status).toLowerCase() === "pending" ? "status pending" : "status";
}

function renderRows(view) {
  const body = $("[data-records-body]");
  body.innerHTML = "";
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
  $("[data-page-title]").textContent = view.title;
  $("[data-hero-title]").textContent = view.hero;
  $("[data-hero-copy]").textContent = view.copy;
  $("[data-main-action]").textContent = view.action;
  $("[data-section-kicker]").textContent = view.title;
  $("[data-section-title]").textContent = view.hero;
  $("[data-section-copy]").textContent = view.copy;
  $("[data-col-one]").textContent = view.col;
  $$("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === key));
  renderRows(view);
  history.replaceState(null, "", `#${key}`);
  document.body.classList.remove("sidebar-open");
}

function init() {
  const state = readState();
  if (state.org) $("[data-org-name]").textContent = state.org;
  updateTotals(state.records);

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
