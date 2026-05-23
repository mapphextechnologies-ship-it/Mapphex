(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

  const ERP_STATE_KEY = "enterprise_department_workflows_v1";
  const MODULE_DATA_KEY = "enterprise_module_records_v1";

  const params = new URLSearchParams(location.search);
  const action = params.get("action") || "Finance Action";
  const tenant = params.get("tenant") || "";

  const readJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
  const humanDate = (value) => {
    if (!value) return "No date";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  };

  const actionKey = () => {
    const key = action.toLowerCase();
    if (/payroll/.test(key)) return "payroll";
    if (/purchase/.test(key)) return "purchase";
    if (/invoice/.test(key)) return "invoice";
    if (/payment/.test(key)) return "payment";
    return "finance";
  };

  const matchesAction = (text) => {
    const haystack = String(text || "").toLowerCase();
    const key = actionKey();
    if (key === "payroll") return /payroll|salary|employee/.test(haystack);
    if (key === "purchase") return /purchase|procurement|supplier/.test(haystack);
    if (key === "invoice") return /invoice|sales|customer/.test(haystack);
    if (key === "payment") return /payment|paid|receipt/.test(haystack);
    return true;
  };

  const renderApprovals = (target, rows, emptyText) => {
    $(target).innerHTML = rows.length
      ? rows
          .map(
            (item) => `<article>
              <strong>${escapeHtml(item.title || "Finance record")}</strong>
              <span>${escapeHtml(item.source || item.moduleId || "Finance")} | ${typeof item.amount === "number" && item.amount > 99 ? money(item.amount) : escapeHtml(item.amount || 0)} | ${escapeHtml(item.status || "pending")}</span>
              <small>${escapeHtml(humanDate(item.updatedAt || item.createdAt || item.at))}</small>
            </article>`,
          )
          .join("")
      : `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
  };

  const renderLedger = (rows) => {
    $("#ledger-list").innerHTML = rows.length
      ? rows
          .map(
            (row) => `<article>
              <strong>${escapeHtml(row.values?.[0] || "Ledger entry")}</strong>
              <span>${escapeHtml(row.values?.[1] || "Category")} | ${escapeHtml(row.values?.[2] || "0")} | ${escapeHtml(row.values?.[3] || "Status")}</span>
              <small>${escapeHtml(humanDate(row.updatedAt))}</small>
            </article>`,
          )
          .join("")
      : `<div class="empty-state">No related ledger entries yet.</div>`;
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (tenant) window.EnterpriseCore?.setTenant?.(tenant);
    const session = window.EnterpriseCore?.requireOrganizationSession?.(tenant);
    if (!session?.tenantId) {
      location.href = tenant ? `organization-login.html?tenant=${encodeURIComponent(tenant)}` : "organization-login.html";
      return;
    }

    const back = $("#back-link");
    back.href = `organization-module.html?portal=finance&tenant=${encodeURIComponent(session.tenantId)}`;
    $("#workflow-title").textContent = action;
    $("#workflow-subtitle").textContent = `${action} records for this organization's Finance Portal.`;

    const state = readJson(ERP_STATE_KEY, {});
    const approvals = Array.isArray(state.approvals) ? state.approvals : [];
    const relatedApprovals = approvals.filter((item) => matchesAction(`${item.title || ""} ${item.note || ""} ${item.source || ""}`));
    const approved = relatedApprovals.filter((item) => ["approved", "paid"].includes(String(item.status || "").toLowerCase()));
    const pending = relatedApprovals.filter((item) => String(item.status || "pending").toLowerCase() === "pending");
    const moduleData = readJson(MODULE_DATA_KEY, {});
    const ledger = (Array.isArray(moduleData.finance) ? moduleData.finance : []).filter((row) => matchesAction((row.values || []).join(" ")));

    $("#approved-count").textContent = approved.length;
    $("#pending-count").textContent = pending.length;
    $("#ledger-count").textContent = ledger.length;
    $("#approved-label").textContent = `${approved.length} records`;
    $("#pending-label").textContent = `${pending.length} records`;
    $("#ledger-label").textContent = `${ledger.length} records`;

    renderApprovals("#approved-list", approved, "No approved records yet for this workflow.");
    renderApprovals("#pending-list", pending, "No pending records yet for this workflow.");
    renderLedger(ledger);
  });
})();
