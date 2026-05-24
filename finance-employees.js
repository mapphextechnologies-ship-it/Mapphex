(() => {
  const STORAGE_KEY = "mapphex_finance_employee_payment_reviews_v1";
  const HR_NOTIFICATIONS_KEY = "mapphex_hr_payment_notifications_v1";
  const PAYMENT_QUEUE_KEY = "mapphex_finance_payment_queue_v1";
  const PAYROLL_KEY = "mapphex_finance_payroll_requests_v1";
  const BUILT_IN_SAMPLE_KEYS = new Set(["amina wanjiku|id-28475612|sales|42000", "brian otieno|p-af49321|operations|38000"]);

  const $ = (selector) => document.querySelector(selector);

  const readJson = (key, fallback) => {
    try {
      const value = window.MapphexFinanceDB?.readMemory?.(key, null);
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };

  const writeJson = (key, value) => {
    window.MapphexFinanceDB?.writeMemory?.(key, value);
  };

  const readRows = () => {
    const rows = window.__financeEmployeeRows || readJson(STORAGE_KEY, []);
    return Array.isArray(rows) ? rows : [];
  };

  const writeRows = (rows) => {
    window.__financeEmployeeRows = rows;
    writeJson(STORAGE_KEY, rows);
    window.MapphexFinanceDB?.write?.(STORAGE_KEY, rows);
  };

  const formatDate = (value) => {
    if (!value) return "Today";
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-KE", { month: "short", day: "numeric", year: "numeric" });
  };

  const recordKey = (row) =>
    [row.name, row.documentId, row.role, row.salary || 0]
      .map((value) => String(value || "").trim().toLowerCase())
      .join("|");

  const recordRank = (row) => {
    if (row.status === "Approved" || row.paymentStatus === "Pending Payment") return 3;
    if (row.status === "Rejected") return 2;
    return 1;
  };

  const isBuiltInSample = (row) => BUILT_IN_SAMPLE_KEYS.has(recordKey(row));

  const reconcileRows = (rows) => {
    const byKey = new Map();
    rows.forEach((row) => {
      if (isBuiltInSample(row)) return;
      const normalized = {
        ...row,
        id: row.id || `employee-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        status: row.status || "Pending",
        sentBy: row.sentBy || "Finance",
        date: row.date || "Today",
      };
      const key = recordKey(normalized);
      const existing = byKey.get(key);
      if (!existing || recordRank(normalized) >= recordRank(existing)) byKey.set(key, normalized);
    });
    return [...byKey.values()];
  };

  const statusClass = (status) => {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "pending" || normalized === "pending payment") return "status pending";
    if (normalized === "rejected") return "status rejected";
    return "status";
  };

  const notifyHr = async (row, status) => {
    const notifications =
      (await window.MapphexFinanceDB?.read?.(HR_NOTIFICATIONS_KEY, null)) || readJson(HR_NOTIFICATIONS_KEY, []);
    const list = Array.isArray(notifications) ? notifications : [];
    list.unshift({
      id: `hr-note-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: status === "Approved" ? "Payment approved and queued" : "Payment rejected",
      body:
        status === "Approved"
          ? `Finance approved ${row.name} (${row.documentId}). Payment is queued for M-Pesa or bank processing.`
          : `Finance rejected payment details for ${row.name} (${row.documentId}).`,
      employeeId: row.id,
      employeeName: row.name,
      documentId: row.documentId,
      role: row.role,
      status,
      paymentStatus: row.paymentStatus || "",
      to: "HR",
      from: "Finance",
      createdAt: new Date().toISOString(),
      read: false,
    });
    writeJson(HR_NOTIFICATIONS_KEY, list);
    window.MapphexFinanceDB?.write?.(HR_NOTIFICATIONS_KEY, list);
  };

  const queuePayment = async (row) => {
    const queue = (await window.MapphexFinanceDB?.read?.(PAYMENT_QUEUE_KEY, null)) || readJson(PAYMENT_QUEUE_KEY, []);
    const list = Array.isArray(queue) ? queue : [];
    const exists = list.some((item) => item.employeeId === row.id && item.status !== "Rejected");
    if (exists) return;
    list.unshift({
      id: `payment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      employeeId: row.id,
      employeeName: row.name,
      documentId: row.documentId,
      role: row.role,
      amount: Number(row.salary || 0),
      provider: row.paymentMethod || "M-Pesa",
      phoneNumber: row.phoneNumber || "",
      bankAccount: row.bankAccount || "",
      status: "Queued",
      nextAction: "Awaiting M-Pesa or bank processing",
      createdBy: "Finance",
      createdAt: new Date().toISOString(),
    });
    writeJson(PAYMENT_QUEUE_KEY, list);
    window.MapphexFinanceDB?.write?.(PAYMENT_QUEUE_KEY, list);
  };

  const upsertPayroll = async (row) => {
    const storedRows = (await window.MapphexFinanceDB?.read?.(PAYROLL_KEY, null)) || readJson(PAYROLL_KEY, []);
    const rows = Array.isArray(storedRows) ? storedRows : [];
    const payrollRow = {
      id: `payroll-${row.id}`,
      employeeId: row.id,
      name: row.name,
      documentId: row.documentId,
      role: row.role,
      salary: Number(row.salary || 0),
      sentBy: row.sentBy || "Finance",
      paymentMethod: row.paymentMethod || "M-Pesa",
      phoneNumber: row.phoneNumber || "",
      bankAccount: row.bankAccount || "",
      status: "Unpaid",
      createdAt: row.reviewedAt || new Date().toISOString(),
    };
    const existingIndex = rows.findIndex(
      (item) =>
        item.employeeId === row.id ||
        (String(item.documentId || "") === String(row.documentId || "") && String(item.name || "").trim().toLowerCase() === String(row.name || "").trim().toLowerCase()),
    );
    if (existingIndex >= 0) rows[existingIndex] = { ...rows[existingIndex], ...payrollRow, status: rows[existingIndex].status || "Unpaid" };
    else rows.unshift(payrollRow);
    writeJson(PAYROLL_KEY, rows);
    window.MapphexFinanceDB?.write?.(PAYROLL_KEY, rows);
  };

  const actionButtons = (row) => {
    const clearButton = `<button class="payroll-action clear" type="button" data-employee-action="Clear" data-id="${row.id}">Clear</button>`;
    if (row.status !== "Pending") {
      const displayStatus = row.paymentStatus === "Pending Payment" ? "Pending Payment" : row.status;
      const paymentText = row.paymentStatus && row.paymentStatus !== displayStatus ? `<small class="payment-note">${row.paymentStatus}</small>` : "";
      return `<div class="payroll-actions"><span class="${statusClass(displayStatus)}">${displayStatus}</span>${clearButton}</div>${paymentText}`;
    }
    return `
      <div class="payroll-actions">
        <button class="payroll-action approve" type="button" data-employee-action="Approved" data-id="${row.id}">Approve</button>
        <button class="payroll-action reject" type="button" data-employee-action="Rejected" data-id="${row.id}">Reject</button>
        ${clearButton}
      </div>
    `;
  };

  const matchesFilters = (row) => {
    const search = String($("[data-employee-search]")?.value || "").trim().toLowerCase();
    const filter = String($("[data-employee-filter]")?.value || "All");
    const text = `${row.name} ${row.documentId} ${row.role}`.toLowerCase();
    return (filter === "All" || row.status === filter) && (!search || text.includes(search));
  };

  const updateSummary = (rows) => {
    $("[data-total-employees]").textContent = String(rows.length);
    $("[data-pending-employees]").textContent = String(rows.filter((row) => row.status === "Pending").length);
    $("[data-queued-payments]").textContent = String(rows.filter((row) => row.paymentStatus === "Pending Payment").length);
    $("[data-rejected-employees]").textContent = String(rows.filter((row) => row.status === "Rejected").length);
  };

  const renderRows = () => {
    const rows = reconcileRows(readRows());
    if (rows.length !== readRows().length) writeRows(rows);
    updateSummary(rows);
    const visibleRows = rows.filter(matchesFilters);
    const body = $("[data-records-body]");
    if (!body) return;
    if (!visibleRows.length) {
      body.innerHTML = `<tr><td colspan="5">No employee payment details yet.</td></tr>`;
      return;
    }
    body.innerHTML = visibleRows
      .map(
        (row) => `
          <tr>
            <td>${row.name}</td>
            <td>${row.documentId}</td>
            <td>${row.role}</td>
            <td>${row.date || "Today"}</td>
            <td>${actionButtons(row)}</td>
          </tr>
        `,
      )
      .join("");
  };

  const addFinanceEmployee = (form) => {
    const data = Object.fromEntries(new FormData(form).entries());
    const settings = window.MapphexFinanceDB?.readSettings?.() || {};
    const rows = readRows();
    const row = {
      id: `employee-finance-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: String(data.name || "").trim(),
      documentId: String(data.documentId || "").trim(),
      role: String(data.role || "").trim(),
      date: formatDate(data.date),
      status: "Pending",
      sentBy: "Finance",
      salary: Number(data.salary || 0),
      paymentMethod: data.paymentMethod || settings.paymentMethod || "M-Pesa",
      phoneNumber: String(data.phoneNumber || "").trim(),
      bankAccount: String(data.bankAccount || "").trim(),
    };
    const existing = rows.find((item) => recordKey(item) === recordKey(row));
    if (existing) {
      Object.assign(existing, row, { id: existing.id });
    } else {
      rows.unshift(row);
    }
    writeRows(reconcileRows(rows));
    renderRows();
  };

  const setStatus = async (id, status) => {
    const rows = readRows();
    const target = rows.find((row) => row.id === id);
    if (!target) return;
    target.status = status;
    target.reviewedBy = "Finance";
    target.reviewedAt = new Date().toISOString();
    if (status === "Approved") {
      target.paymentStatus = "Pending Payment";
      target.paymentProvider = target.paymentMethod || "M-Pesa";
      await queuePayment(target);
      await upsertPayroll(target);
    } else {
      target.paymentStatus = "Not queued";
      target.paymentProvider = "";
    }
    if (target.sentBy === "HR") await notifyHr(target, status);
    writeRows(rows);
    renderRows();
  };

  const clearEmployee = (id) => {
    writeRows(readRows().filter((row) => row.id !== id));
    renderRows();
  };

  const clearAllEmployees = () => {
    writeRows([]);
    renderRows();
  };

  document.addEventListener("DOMContentLoaded", async () => {
    $("[data-menu-button]")?.addEventListener("click", () => document.body.classList.add("sidebar-open"));
    $("[data-close-sidebar]")?.addEventListener("click", () => document.body.classList.remove("sidebar-open"));
    const params = new URLSearchParams(location.search);
    const org = params.get("org") || params.get("tenant");
    if (org) $("[data-org-name]").textContent = org;
    const localRows = readRows();
    const dbRows = (await window.MapphexFinanceDB?.read?.(STORAGE_KEY, [])) || [];
    window.__financeEmployeeRows = reconcileRows([...localRows, ...(Array.isArray(dbRows) ? dbRows : [])]);
    writeRows(window.__financeEmployeeRows);

    const form = $("[data-employee-form]");
    const dateInput = form?.elements.date;
    if (dateInput) dateInput.valueAsDate = new Date();
    const settings = window.MapphexFinanceDB?.readSettings?.() || {};
    if (form?.elements.paymentMethod && settings.paymentMethod) form.elements.paymentMethod.value = settings.paymentMethod;
    $("[data-toggle-employee-form]")?.addEventListener("click", () => {
      form.hidden = !form.hidden;
      if (!form.hidden) form.elements.name.focus();
    });
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      addFinanceEmployee(event.currentTarget);
      form.reset();
      if (dateInput) dateInput.valueAsDate = new Date();
      if (form.elements.paymentMethod && settings.paymentMethod) form.elements.paymentMethod.value = settings.paymentMethod;
      form.elements.name.focus();
    });
    $("[data-employee-search]")?.addEventListener("input", renderRows);
    $("[data-employee-filter]")?.addEventListener("change", renderRows);
    $("[data-clear-all-employees]")?.addEventListener("click", (event) => {
      event.currentTarget.classList.add("is-clicked");
      window.setTimeout(clearAllEmployees, 120);
    });
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-employee-action]");
      if (!button) return;
      button.classList.add("is-clicked");
      if (button.dataset.employeeAction === "Clear") {
        window.setTimeout(() => clearEmployee(button.dataset.id), 120);
        return;
      }
      window.setTimeout(() => setStatus(button.dataset.id, button.dataset.employeeAction), 120);
    });

    renderRows();
  });
})();
