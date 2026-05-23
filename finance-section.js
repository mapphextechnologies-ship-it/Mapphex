(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

  const MODULE_DATA_KEY = "enterprise_module_records_v1";
  const ERP_STATE_KEY = "enterprise_department_workflows_v1";
  const REPORTS_KEY = "enterprise_reports_v1";

  const SECTIONS = {
    dashboard: { title: "Finance Dashboard", label: "Dashboard", page: "finance-dashboard.html", note: "Live finance summary from this organization's ledger." },
    revenue: { title: "Revenue", label: "Revenue", page: "finance-revenue.html", note: "Money received from income, invoices, receipts, payments, and sales." },
    expenses: { title: "Expenses", label: "Expenses", page: "finance-expenses.html", note: "Money out for purchases, payroll, bills, costs, debts, and operating spend." },
    "payroll-approvals": { title: "Payroll Approvals", label: "Payroll", page: "finance-payroll-approvals.html", note: "Approved and pending salary records routed between HR and Finance." },
    transactions: { title: "Transactions", label: "Transactions", page: "finance-transactions.html", note: "All Finance Ledger rows recorded by the organization." },
    budgets: { title: "Budgets", label: "Budgets", page: "finance-budgets.html", note: "Budget records, planned spend, and allocation entries." },
    reports: { title: "Reports", label: "Reports", page: "finance-reports.html", note: "Export-ready views for income, expenses, invoices, payments, payroll, tax, and audit review." },
    taxes: { title: "Taxes", label: "Taxes", page: "finance-taxes.html", note: "Tax entries and compliance-related finance records." },
    analytics: { title: "Analytics", label: "Analytics", page: "finance-analytics.html", note: "Finance totals, net position, and open-item summary." },
    settings: { title: "Settings", label: "Settings", page: "finance-settings.html", note: "Finance workspace configuration and organization data context." },
  };

  const params = new URLSearchParams(location.search);
  const tenant = params.get("tenant") || "";
  const sectionKey = document.body.dataset.financeSection || "transactions";

  const readJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
  const amountOf = (row) => Number(String(row.values?.[2] || "").replace(/[^\d.-]/g, "")) || 0;
  const categoryOf = (row) => String(row.values?.[1] || "").toLowerCase();
  const statusOf = (row) => String(row.values?.[3] || "").toLowerCase();
  const textOf = (row) => (row.values || []).join(" ").toLowerCase();
  const humanDate = (value) => {
    if (!value) return "No date";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  };

  const isMoneyIn = (row) => /income|revenue|payment|paid|receipt|sale|invoice/.test(categoryOf(row));
  const isMoneyOut = (row) => /expense|purchase|payroll|tax|budget|debt|cost|bill/.test(categoryOf(row));
  const isOpen = (row) => /pending|unpaid|draft|open|waiting/.test(statusOf(row));

  const filterRows = (rows, key) => {
    if (key === "revenue") return rows.filter((row) => isMoneyIn(row) || /income|revenue|receipt|sale|invoice|payment/.test(textOf(row)));
    if (key === "expenses") return rows.filter((row) => isMoneyOut(row) || /expense|purchase|payroll|tax|debt|cost|bill/.test(textOf(row)));
    if (key === "budgets") return rows.filter((row) => /budget|allocation|planned/.test(textOf(row)));
    if (key === "taxes") return rows.filter((row) => /tax|vat|kra|withholding|compliance/.test(textOf(row)));
    if (key === "payroll-approvals") return rows.filter((row) => /payroll|salary|employee|wage/.test(textOf(row)));
    return rows;
  };

  const totalsFor = (rows) =>
    rows.reduce(
      (total, row) => {
        const amount = amountOf(row);
        if (isMoneyIn(row)) total.moneyIn += amount;
        if (isMoneyOut(row)) total.moneyOut += amount;
        if (isOpen(row)) total.openItems += 1;
        total.entries += 1;
        return total;
      },
      { entries: 0, moneyIn: 0, moneyOut: 0, openItems: 0 },
    );

  const renderNav = (tenantId) => {
    $("#section-nav").innerHTML = Object.entries(SECTIONS)
      .map(([key, item]) => {
        const href = `${item.page}?tenant=${encodeURIComponent(tenantId)}`;
        return `<a class="${key === sectionKey ? "active" : ""}" href="${href}">${escapeHtml(item.label)}</a>`;
      })
      .join("");
  };

  const renderRows = (rows) => {
    $("#finance-table-body").innerHTML = rows.length
      ? rows
          .map((row) => {
            const status = row.values?.[3] || "Open";
            const statusClass = /approved|paid|complete|closed/i.test(status) ? "good" : /pending|unpaid|open|draft/i.test(status) ? "open" : "";
            return `<tr>
              <td><strong>${escapeHtml(row.values?.[0] || "Finance entry")}</strong><div class="table-subtext">${escapeHtml(row.id || "")}</div></td>
              <td>${escapeHtml(row.values?.[1] || "Category")}</td>
              <td>${escapeHtml(row.values?.[2] || money(0))}</td>
              <td><span class="status-pill ${statusClass}">${escapeHtml(status)}</span></td>
              <td>${escapeHtml(humanDate(row.updatedAt))}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="5"><div class="empty-state">No records yet. Add entries from the main Finance Ledger.</div></td></tr>`;
  };

  const renderApprovals = (state) => {
    const approvals = Array.isArray(state.approvals) ? state.approvals : [];
    const matching = approvals.filter((item) => /finance|payroll|purchase|invoice|payment|salary/i.test(`${item.title || ""} ${item.source || ""} ${item.note || ""} ${item.moduleId || ""}`));
    const approved = matching.filter((item) => /approved|paid/i.test(item.status || ""));
    const pending = matching.filter((item) => !/approved|paid/i.test(item.status || ""));
    $("#side-title").textContent = sectionKey === "payroll-approvals" ? "Approved list" : "Approvals";
    $("#side-list").innerHTML = (sectionKey === "payroll-approvals" ? approved : matching).length
      ? (sectionKey === "payroll-approvals" ? approved : matching)
          .map(
            (item) => `<article>
              <strong>${escapeHtml(item.title || "Approval item")}</strong>
              <span>${escapeHtml(item.source || item.moduleId || "Finance")} | ${escapeHtml(item.status || "pending")}</span>
              <small>${escapeHtml(humanDate(item.updatedAt || item.createdAt || item.at))}</small>
            </article>`,
          )
          .join("")
      : `<div class="empty-state">${sectionKey === "payroll-approvals" ? "No approved payroll records yet." : "No finance approvals yet."}</div>`;
    return { approved: approved.length, pending: pending.length };
  };

  const renderReports = (rows, reports) => {
    const names = ["Income", "Expenses", "Invoices", "Payments", "Payroll", "Budgets", "Taxes", "Audit log"];
    $("#side-title").textContent = "Export views";
    $("#side-list").classList.add("report-grid");
    $("#side-list").innerHTML = names
      .map((name) => `<article class="report-tile"><strong>${escapeHtml(name)}</strong><span>${rows.length} ledger rows available for ${escapeHtml(name.toLowerCase())} review.</span></article>`)
      .join("");
    if (reports?.finance?.lastExport) {
      $("#section-subtitle").textContent = `Latest export: ${humanDate(reports.finance.lastExport)}`;
    }
  };

  const renderSettings = (session) => {
    $("#side-title").textContent = "Finance context";
    $("#side-list").innerHTML = `
      <article><strong>Tenant</strong><span>${escapeHtml(session.tenantId)}</span></article>
      <article><strong>Data scope</strong><span>Organization finance records only</span></article>
      <article><strong>Access</strong><span>Uses the signed-in organization session</span></article>`;
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (tenant) window.EnterpriseCore?.setTenant?.(tenant);
    const session = window.EnterpriseCore?.requireOrganizationSession?.(tenant);
    if (!session?.tenantId) {
      location.href = tenant ? `organization-login.html?tenant=${encodeURIComponent(tenant)}` : "organization-login.html";
      return;
    }

    const active = SECTIONS[sectionKey] || SECTIONS.transactions;
    document.title = `${active.title} | Finance Portal`;
    $("#section-eyebrow").textContent = "Finance Portal";
    $("#section-title").textContent = active.title;
    $("#section-subtitle").textContent = active.note;
    $("#back-link").href = `organization-module.html?portal=finance&tenant=${encodeURIComponent(session.tenantId)}`;
    renderNav(session.tenantId);

    const moduleData = readJson(MODULE_DATA_KEY, {});
    const allRows = Array.isArray(moduleData.finance) ? moduleData.finance : [];
    const visibleRows = sectionKey === "dashboard" || sectionKey === "analytics" || sectionKey === "reports" || sectionKey === "settings" ? allRows : filterRows(allRows, sectionKey);
    const state = readJson(ERP_STATE_KEY, {});
    const reports = readJson(REPORTS_KEY, {});
    const totals = totalsFor(visibleRows);
    const allTotals = totalsFor(allRows);
    const approvalCounts = renderApprovals(state);

    $("#metric-a-label").textContent = sectionKey === "analytics" ? "Ledger Entries" : "Entries";
    $("#metric-a").textContent = totals.entries;
    $("#metric-b-label").textContent = "Money In";
    $("#metric-b").textContent = money(sectionKey === "analytics" ? allTotals.moneyIn : totals.moneyIn);
    $("#metric-c-label").textContent = "Money Out";
    $("#metric-c").textContent = money(sectionKey === "analytics" ? allTotals.moneyOut : totals.moneyOut);
    $("#metric-d-label").textContent = sectionKey === "payroll-approvals" ? "Approved" : "Open Items";
    $("#metric-d").textContent = sectionKey === "payroll-approvals" ? approvalCounts.approved : totals.openItems;
    $("#table-title").textContent = sectionKey === "dashboard" || sectionKey === "transactions" ? "Finance Ledger" : `${active.title} Records`;
    $("#table-count").textContent = `${visibleRows.length} rows`;

    if (sectionKey === "reports") renderReports(allRows, reports);
    if (sectionKey === "settings") renderSettings(session);
    if (sectionKey === "analytics") {
      $("#side-title").textContent = "Net position";
      $("#side-list").innerHTML = `<article><strong>${escapeHtml(money(allTotals.moneyIn - allTotals.moneyOut))}</strong><span>Money in minus money out across the Finance Ledger.</span></article>
        <article><strong>${approvalCounts.pending}</strong><span>Pending finance approval items.</span></article>`;
    }

    renderRows(visibleRows);

    $("#finance-search")?.addEventListener("input", (event) => {
      const term = event.target.value.trim().toLowerCase();
      renderRows(term ? visibleRows.filter((row) => textOf(row).includes(term)) : visibleRows);
    });
  });
})();
