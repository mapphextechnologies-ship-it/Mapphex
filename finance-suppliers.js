(() => {
  const SUPPLIERS_KEY = "mapphex_finance_suppliers_v1";
  const APPROVALS_KEY = "mapphex_finance_approvals_v1";
  let rows = [];
  const statusClass = (status) => {
    const normalized = String(status).toLowerCase();
    if (normalized === "pending") return "status pending";
    if (normalized === "rejected") return "status rejected";
    return "status";
  };
  const updateSummary = () => {
    const count = (status) => rows.filter((row) => String(row.status || "Pending").toLowerCase() === status).length;
    document.querySelector("[data-supplier-count]").textContent = String(rows.length);
    document.querySelector("[data-supplier-pending]").textContent = String(count("pending"));
    document.querySelector("[data-supplier-paid]").textContent = String(count("paid"));
    document.querySelector("[data-supplier-rejected]").textContent = String(count("rejected"));
  };
  const actionButton = (action, index, label, className, disabled = false) =>
    `<button class="supplier-action ${className}" type="button" data-supplier-action="${action}" data-supplier-index="${index}"${disabled ? " disabled" : ""}>${label}</button>`;
  const renderRows = (body) => {
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="5">No suppliers yet.</td></tr>`;
      updateSummary();
      return;
    }
    body.innerHTML = rows.map((row, index) => {
      const status = String(row.status || "Pending");
      const normalized = status.toLowerCase();
      const paid = normalized === "paid";
      const rejected = normalized === "rejected";
      const payButton = rejected ? "" : actionButton("approve", index, paid ? "Paid" : "Pay", "approve", paid);
      const rejectButton = paid ? "" : actionButton("reject", index, rejected ? "Rejected" : "Reject", "reject", rejected);
      return `<tr><td data-label="Supplier">${row.name || "Supplier"}</td><td data-label="Payment Status"><span class="${statusClass(status)}">${status}</span></td><td data-label="Amount">${row.amount || "KES 0"}</td><td data-label="Date">${row.date || "Today"}</td><td data-label="Action"><div class="supplier-actions">${payButton}${rejectButton}${actionButton("clear", index, "Clear", "clear")}</div></td></tr>`;
    }).join("");
    updateSummary();
  };
  const formatMoney = (amount) => `KES ${Number(amount || 0).toLocaleString("en-KE")}`;
  const formatDate = (value) => {
    if (!value) return "Today";
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-KE", { month: "short", day: "numeric", year: "numeric" });
  };
  const makeId = () => `supplier-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const normalizeSupplier = (supplier) => {
    const id = supplier?.id || makeId();
    return {
      id,
      approvalId: supplier?.approvalId || `approval-${id}`,
      name: supplier?.name || "Supplier",
      status: supplier?.status || "Pending",
      amount: supplier?.amount || "KES 0",
      date: supplier?.date || "Today",
      createdAt: supplier?.createdAt || new Date().toISOString(),
      ...supplier,
      id,
      approvalId: supplier?.approvalId || `approval-${id}`,
    };
  };
  const readRows = async (key) => {
    const storedRows = window.MapphexFinanceDB ? await window.MapphexFinanceDB.read(key, []) : [];
    return Array.isArray(storedRows) ? storedRows : [];
  };
  const saveSuppliers = async () => {
    if (!window.MapphexFinanceDB) return;
    await window.MapphexFinanceDB.write(SUPPLIERS_KEY, rows);
  };
  const saveApprovals = async (approvals) => {
    if (!window.MapphexFinanceDB) return;
    await window.MapphexFinanceDB.write(APPROVALS_KEY, approvals);
    window.MapphexFinanceBadges?.updateApprovalBadges?.();
  };
  const queueApproval = async (supplier) => {
    const approvals = await readRows(APPROVALS_KEY);
    const existingIndex = approvals.findIndex((row) =>
      (row.source === "supplier" && row.supplierId === supplier.id) ||
      (String(row.name || "") === String(supplier.name || "") && String(row.amount || "") === String(supplier.amount || "") && String(row.date || "") === String(supplier.date || ""))
    );
    const approval = {
      id: supplier.approvalId,
      supplierId: supplier.id,
      source: "supplier",
      name: supplier.name,
      status: "Pending",
      amount: supplier.amount,
      date: supplier.date,
      createdAt: supplier.createdAt,
    };
    if (existingIndex >= 0) approvals[existingIndex] = { ...approvals[existingIndex], ...approval };
    else approvals.unshift(approval);
    await saveApprovals(approvals);
  };
  const syncApprovalStatus = async (supplier, status) => {
    const approvals = await readRows(APPROVALS_KEY);
    const nextStatus = status === "Paid" ? "Approved" : status;
    let changed = false;
    const nextApprovals = approvals.map((approval) => {
      const sameSupplier =
        (approval.source === "supplier" && approval.supplierId === supplier.id) ||
        (String(approval.name || "") === String(supplier.name || "") && String(approval.amount || "") === String(supplier.amount || "") && String(approval.date || "") === String(supplier.date || ""));
      if (!sameSupplier) return approval;
      changed = true;
      return {
        ...approval,
        id: approval.id || supplier.approvalId,
        supplierId: supplier.id,
        source: "supplier",
        status: nextStatus,
        decidedAt: new Date().toISOString(),
        decidedBy: "Finance",
      };
    });
    if (changed) {
      await saveApprovals(nextApprovals);
      return;
    }
    await saveApprovals([
      {
        id: supplier.approvalId,
        supplierId: supplier.id,
        source: "supplier",
        name: supplier.name,
        status: nextStatus,
        amount: supplier.amount,
        date: supplier.date,
        createdAt: supplier.createdAt,
        decidedAt: new Date().toISOString(),
        decidedBy: "Finance",
      },
      ...approvals,
    ]);
  };
  const removeSupplierApprovals = async (suppliers) => {
    const ids = new Set(suppliers.map((supplier) => supplier.id).filter(Boolean));
    if (!ids.size) return;
    const approvals = await readRows(APPROVALS_KEY);
    const nextApprovals = approvals.filter((approval) => approval.source !== "supplier" || !ids.has(approval.supplierId));
    if (nextApprovals.length !== approvals.length) await saveApprovals(nextApprovals);
  };
  const refreshRows = async (body) => {
    const storedRows = await readRows(SUPPLIERS_KEY);
    rows = storedRows.map(normalizeSupplier);
    if (storedRows.some((row, index) => row?.id !== rows[index].id || row?.approvalId !== rows[index].approvalId)) {
      await saveSuppliers();
    }
    renderRows(body);
  };
  document.addEventListener("DOMContentLoaded", async () => {
    document.querySelector("[data-menu-button]")?.addEventListener("click", () => document.body.classList.add("sidebar-open"));
    document.querySelector("[data-close-sidebar]")?.addEventListener("click", () => document.body.classList.remove("sidebar-open"));
    const org = new URLSearchParams(location.search).get("org") || new URLSearchParams(location.search).get("tenant");
    if (org) document.querySelector("[data-org-name]").textContent = org;
    const body = document.querySelector("[data-records-body]");
    const form = document.querySelector("[data-supplier-form]");
    const toggleButton = document.querySelector("[data-toggle-supplier-form]");
    const clearAllButton = document.querySelector("[data-clear-all-suppliers]");
    const dateInput = form?.elements.date;
    if (dateInput) dateInput.valueAsDate = new Date();
    await refreshRows(body);
    toggleButton?.addEventListener("click", () => {
      form.hidden = !form.hidden;
      if (!form.hidden) form.elements.name.focus();
    });
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const id = makeId();
      const supplier = {
        id,
        approvalId: `approval-${id}`,
        name: form.elements.name.value.trim(),
        status: "Pending",
        amount: formatMoney(form.elements.amount.value),
        date: formatDate(form.elements.date.value),
        createdAt: new Date().toISOString(),
      };
      rows.unshift(supplier);
      await saveSuppliers();
      await queueApproval(supplier);
      renderRows(body);
      form.reset();
      if (dateInput) dateInput.valueAsDate = new Date();
      form.elements.name.focus();
    });
    body.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-supplier-action]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const index = Number(button.dataset.supplierIndex);
      if (!rows[index]) return;
      const action = button.dataset.supplierAction;
      const currentStatus = String(rows[index].status || "Pending").toLowerCase();
      const isFinal = currentStatus === "paid" || currentStatus === "rejected";
      if (action === "approve") {
        if (isFinal) return;
        rows[index].status = "Paid";
        await saveSuppliers();
        await syncApprovalStatus(rows[index], "Paid");
      }
      if (action === "reject") {
        if (isFinal) return;
        rows[index].status = "Rejected";
        await saveSuppliers();
        await syncApprovalStatus(rows[index], "Rejected");
      }
      if (action === "clear") {
        const removed = rows.splice(index, 1);
        await saveSuppliers();
        await removeSupplierApprovals(removed);
      }
      renderRows(body);
    });
    clearAllButton?.addEventListener("click", async () => {
      const removed = [...rows];
      rows = [];
      await saveSuppliers();
      await removeSupplierApprovals(removed);
      renderRows(body);
    });
    window.addEventListener("focus", () => refreshRows(body));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshRows(body);
    });
    window.addEventListener("storage", (event) => {
      if (event.key?.includes(SUPPLIERS_KEY)) refreshRows(body);
    });
  });
})();
