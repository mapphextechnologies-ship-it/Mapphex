(() => {
  const DB_KEY = "mapphex_finance_approvals_v1";
  const ARCHIVE_KEY = "mapphex_finance_approvals_archive_v1";
  const SUPPLIERS_KEY = "mapphex_finance_suppliers_v1";
  let rows = [];
  const statusClass = (status) => {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "pending") return "status pending";
    if (normalized === "rejected") return "status rejected";
    return "status";
  };
  const renderSummary = () => {
    const countStatus = (status) => rows.filter((row) => String(row.status || "Pending").toLowerCase() === status).length;
    document.querySelector("[data-approval-count]").textContent = String(rows.length);
    document.querySelector("[data-approval-pending]").textContent = String(countStatus("pending"));
    document.querySelector("[data-approval-approved]").textContent = String(countStatus("approved"));
    document.querySelector("[data-approval-rejected]").textContent = String(countStatus("rejected"));
  };
  const renderRows = (body) => {
    const approvedRows = rows
      .map((row, index) => ({ row, index }))
      .filter((item) => String(item.row.status || "Pending").toLowerCase() === "approved");
    if (!approvedRows.length) {
      body.innerHTML = `<tr><td colspan="5">No approved items yet.</td></tr>`;
      renderSummary();
      return;
    }
    body.innerHTML = approvedRows.map(({ row, index }) => {
      const status = String(row.status || "Pending");
      const approveButton = `<button class="approval-action approve" type="button" disabled>Approved</button>`;
      const clearButton = `<button class="approval-action clear" type="button" data-approval-action="clear" data-approval-index="${index}">Clear</button>`;
      return `<tr><td>${row.name || "Approval request"}</td><td><span class="${statusClass(status)}">${status}</span></td><td>${row.amount || "KES 0"}</td><td>${row.date || "Today"}</td><td><div class="approval-actions">${approveButton}${clearButton}</div></td></tr>`;
    }).join("");
    renderSummary();
  };
  const readArchive = async () => {
    const storedRows = window.MapphexFinanceDB ? await window.MapphexFinanceDB.read(ARCHIVE_KEY, []) : [];
    return Array.isArray(storedRows) ? storedRows : [];
  };
  const saveRows = async () => {
    if (!window.MapphexFinanceDB) return;
    await window.MapphexFinanceDB.write(DB_KEY, rows);
    window.MapphexFinanceBadges?.updateApprovalBadges?.();
  };
  const syncSupplierStatus = async (approval, status) => {
    if (approval?.source !== "supplier" || !approval.supplierId || !window.MapphexFinanceDB) return;
    const storedRows = await window.MapphexFinanceDB.read(SUPPLIERS_KEY, []);
    const suppliers = Array.isArray(storedRows) ? storedRows : [];
    const paymentStatus = status === "Approved" ? "Paid" : status;
    let changed = false;
    const nextSuppliers = suppliers.map((supplier) => {
      if (supplier.id !== approval.supplierId) return supplier;
      changed = true;
      return {
        ...supplier,
        status: paymentStatus,
        decidedAt: new Date().toISOString(),
        decidedBy: "Finance",
      };
    });
    if (changed) await window.MapphexFinanceDB.write(SUPPLIERS_KEY, nextSuppliers);
  };
  const archiveRows = async (items) => {
    if (!items.length || !window.MapphexFinanceDB) return;
    const archive = await readArchive();
    const clearedAt = new Date().toISOString();
    await window.MapphexFinanceDB.write(ARCHIVE_KEY, [
      ...archive,
      ...items.map((item) => ({ ...item, clearedAt, backupStatus: "cleared" })),
    ]);
  };
  const clearOne = async (body, index) => {
    const item = rows[index];
    if (!item) return;
    rows.splice(index, 1);
    await archiveRows([item]);
    await saveRows();
    renderRows(body);
  };
  const clearAll = async (body) => {
    if (!rows.length) return;
    const cleared = [...rows];
    rows = [];
    await archiveRows(cleared);
    await saveRows();
    renderRows(body);
  };
  const refreshRows = async (body) => {
    const storedRows = window.MapphexFinanceDB ? await window.MapphexFinanceDB.read(DB_KEY, []) : [];
    rows = Array.isArray(storedRows) ? storedRows : [];
    renderRows(body);
    window.MapphexFinanceBadges?.updateApprovalBadges?.();
  };
  const decideOne = async (body, index, status) => {
    const item = rows[index];
    if (!item) return;
    const currentStatus = String(item.status || "Pending").toLowerCase();
    if (currentStatus === "approved" || currentStatus === "rejected") return;
    rows[index] = {
      ...item,
      status,
      decidedAt: new Date().toISOString(),
      decidedBy: "Finance",
    };
    await syncSupplierStatus(rows[index], status);
    await saveRows();
    renderRows(body);
  };
  document.addEventListener("DOMContentLoaded", async () => {
    document.querySelector("[data-menu-button]")?.addEventListener("click", () => document.body.classList.add("sidebar-open"));
    document.querySelector("[data-close-sidebar]")?.addEventListener("click", () => document.body.classList.remove("sidebar-open"));
    const org = new URLSearchParams(location.search).get("org") || new URLSearchParams(location.search).get("tenant");
    if (org) document.querySelector("[data-org-name]").textContent = org;
    const body = document.querySelector("[data-records-body]");
    const clearAllButton = document.querySelector("[data-clear-all-approvals]");
    await refreshRows(body);
    body.addEventListener("click", (event) => {
      const button = event.target.closest("[data-approval-action]");
      if (!button) return;
      if (button.disabled) return;
      const index = Number(button.dataset.approvalIndex);
      if (button.dataset.approvalAction === "approve") decideOne(body, index, "Approved");
      if (button.dataset.approvalAction === "reject") decideOne(body, index, "Rejected");
      if (button.dataset.approvalAction === "clear") clearOne(body, index);
    });
    clearAllButton?.addEventListener("click", () => clearAll(body));
    window.addEventListener("focus", () => refreshRows(body));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshRows(body);
    });
    window.addEventListener("storage", (event) => {
      if (event.key?.includes(DB_KEY)) refreshRows(body);
    });
  });
})();
