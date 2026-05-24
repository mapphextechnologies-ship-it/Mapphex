(() => {
  const STORAGE_KEY = "mapphex_finance_payroll_requests_v1";
  const PAYMENT_QUEUE_KEY = "mapphex_finance_payment_queue_v1";
  const EMPLOYEE_REVIEWS_KEY = "mapphex_finance_employee_payment_reviews_v1";
  const HR_NOTIFICATIONS_KEY = "mapphex_hr_payment_notifications_v1";
  const BUILT_IN_SAMPLE_KEYS = new Set(["amina wanjiku|id-28475612|sales|42000", "brian otieno|p-af49321|inventory|38000", "brian otieno|p-af49321|operations|38000"]);

  const $ = (selector) => document.querySelector(selector);
  const money = (value) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));

  const readRows = () => {
    if (Array.isArray(window.__financePayrollRows)) return window.__financePayrollRows;
    try {
      const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  };

  const writeRows = (rows) => {
    window.__financePayrollRows = rows;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    window.MapphexFinanceDB?.write?.(STORAGE_KEY, rows);
  };

  const readJson = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };

  const writeJson = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
    window.MapphexFinanceDB?.write?.(key, value);
  };

  const payrollKey = (row) =>
    [row.employeeId, row.documentId, row.name]
      .map((value) => String(value || "").trim().toLowerCase())
      .join("|");

  const sampleKey = (row) =>
    [row.name || row.employeeName, row.documentId, row.role, row.salary ?? row.amount ?? 0]
      .map((value) => String(value || "").trim().toLowerCase())
      .join("|");

  const isBuiltInSample = (row) => BUILT_IN_SAMPLE_KEYS.has(sampleKey(row));

  const normalizeRows = (rows) => {
    const byKey = new Map();
    rows.forEach((row) => {
      if (isBuiltInSample(row)) return;
      const normalized = {
        ...row,
        id: row.id || `payroll-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: row.name || row.employeeName || "Worker",
        salary: Number(row.salary ?? row.amount ?? 0),
        sentBy: row.sentBy || "Finance",
        status: row.status || "Unpaid",
      };
      const key = payrollKey(normalized);
      const existing = byKey.get(key);
      if (!existing || payrollStatus(normalized) === "Paid") byKey.set(key, normalized);
    });
    return [...byKey.values()];
  };

  const queueToPayrollRows = (queue) =>
    (Array.isArray(queue) ? queue : []).filter((item) => !isBuiltInSample(item)).map((item) => ({
      id: `payroll-${item.employeeId || item.id}`,
      employeeId: item.employeeId,
      name: item.employeeName || item.name,
      documentId: item.documentId,
      role: item.role,
      salary: Number(item.amount || item.salary || 0),
      sentBy: item.sentBy || "Finance",
      paymentMethod: item.provider || "M-Pesa",
      status: "Unpaid",
      createdAt: item.createdAt || new Date().toISOString(),
    }));

  const statusClass = (status) => {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "unpaid" || normalized === "processing") return "status pending";
    if (normalized === "failed") return "status rejected";
    return "status";
  };

  const payrollStatus = (row) => {
    const status = String(row?.status || "").toLowerCase();
    if (status === "paid") return "Paid";
    if (status === "processing") return "Processing";
    if (status === "failed") return "Failed";
    return "Unpaid";
  };

  const actionButtons = (row) => {
    const clearButton = `<button class="payroll-action clear" type="button" data-payroll-action="Clear" data-id="${row.id}">Clear</button>`;
    if (payrollStatus(row) === "Paid") {
      return `<div class="payroll-actions"><button class="row-action" type="button" disabled>Paid</button>${clearButton}</div>`;
    }
    if (payrollStatus(row) === "Processing") {
      return `<div class="payroll-actions"><button class="row-action" type="button" disabled>Processing</button>${clearButton}</div>`;
    }
    return `
      <div class="payroll-actions">
        <button class="payroll-action approve" type="button" data-payroll-action="Pay" data-id="${row.id}">Pay now</button>
        ${clearButton}
      </div>
    `;
  };

  const matchesFilters = (row) => {
    const search = String($("[data-payroll-search]")?.value || "").trim().toLowerCase();
    const filter = String($("[data-payroll-filter]")?.value || "All");
    const statusMatch = filter === "All" || payrollStatus(row) === filter || (filter === "Unpaid" && payrollStatus(row) !== "Paid");
    const text = `${row.name} ${row.documentId} ${row.role}`.toLowerCase();
    return statusMatch && (!search || text.includes(search));
  };

  const updateSummary = (rows) => {
    const paid = rows.filter((row) => payrollStatus(row) === "Paid");
    const unpaid = rows.filter((row) => payrollStatus(row) !== "Paid");
    const totalUnpaid = unpaid.reduce((sum, row) => sum + Number(row.salary || 0), 0);
    $("[data-total-workers]").textContent = String(rows.length);
    $("[data-unpaid-workers]").textContent = String(unpaid.length);
    $("[data-paid-workers]").textContent = String(paid.length);
    $("[data-total-unpaid]").textContent = money(totalUnpaid);
  };

  const renderRows = () => {
    const rows = normalizeRows(readRows());
    if (rows.length !== readRows().length) writeRows(rows);
    updateSummary(rows);
    const visibleRows = rows.filter(matchesFilters);
    const body = $("[data-records-body]");
    if (!body) return;
    if (!visibleRows.length) {
      body.innerHTML = `<tr><td colspan="7">No payroll records yet.</td></tr>`;
      return;
    }
    body.innerHTML = visibleRows
      .map(
        (row) => `
          <tr>
            <td>${row.name}</td>
            <td>${row.documentId}</td>
            <td>${row.role}</td>
            <td>${money(row.salary)}</td>
            <td>${row.sentBy || "HR"}</td>
            <td><span class="${statusClass(payrollStatus(row))}">${payrollStatus(row)}</span></td>
            <td>${actionButtons(row)}</td>
          </tr>
        `,
      )
      .join("");
  };

  const addRow = (payload) => {
    const rows = readRows();
    rows.unshift({
      ...payload,
      id: `payroll-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      sentBy: payload.sentBy || "HR",
      status: payload.status || "Unpaid",
      createdAt: payload.createdAt || new Date().toISOString(),
    });
    writeRows(rows);
    renderRows();
  };

  const notifyHrPaid = async (row, paidAt) => {
    if (row.sentBy !== "HR") return;
    const storedRows = (await window.MapphexFinanceDB?.read?.(HR_NOTIFICATIONS_KEY, null)) || readJson(HR_NOTIFICATIONS_KEY, []);
    const rows = Array.isArray(storedRows) ? storedRows : [];
    rows.unshift({
      id: `hr-note-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: "Payment completed",
      body: `Finance marked ${row.name || "employee"} (${row.documentId || "no ID"}) as paid.`,
      employeeId: row.employeeId,
      employeeName: row.name,
      documentId: row.documentId,
      role: row.role,
      status: "Paid",
      to: "HR",
      from: "Finance",
      createdAt: paidAt,
      read: false,
    });
    writeJson(HR_NOTIFICATIONS_KEY, rows);
  };

  const markLinkedRecordsPaid = async (target, paidAt) => {
    const employeeRows = (await window.MapphexFinanceDB?.read?.(EMPLOYEE_REVIEWS_KEY, null)) || readJson(EMPLOYEE_REVIEWS_KEY, []);
    if (Array.isArray(employeeRows)) {
      const nextEmployees = employeeRows.map((row) =>
        row.id === target.employeeId ||
        (String(row.documentId || "") === String(target.documentId || "") && String(row.name || "").trim().toLowerCase() === String(target.name || "").trim().toLowerCase())
          ? { ...row, status: "Approved", paymentStatus: "Paid", paidAt, reviewedBy: row.reviewedBy || "Finance" }
          : row,
      );
      writeJson(EMPLOYEE_REVIEWS_KEY, nextEmployees);
    }

    const queueRows = (await window.MapphexFinanceDB?.read?.(PAYMENT_QUEUE_KEY, null)) || readJson(PAYMENT_QUEUE_KEY, []);
    if (Array.isArray(queueRows)) {
      const nextQueue = queueRows.map((row) =>
        row.employeeId === target.employeeId ||
        (String(row.documentId || "") === String(target.documentId || "") && String(row.employeeName || row.name || "").trim().toLowerCase() === String(target.name || "").trim().toLowerCase())
          ? { ...row, status: "Paid", paidAt, nextAction: "Payment completed" }
          : row,
      );
      writeJson(PAYMENT_QUEUE_KEY, nextQueue);
    }
  };

  const setStatus = async (id) => {
    const target = readRows().find((row) => row.id === id);
    if (!target) return;
    const provider = target.paymentMethod || target.paymentProvider || "M-Pesa";
    const confirmed = window.confirm(`Start ${provider} payment for ${target.name || "this worker"} (${target.documentId || "no ID"})?`);
    if (!confirmed) return;
    let payment;
    try {
      payment = await window.MapphexFinancePayments?.startPayrollPayment?.(target);
    } catch (err) {
      window.alert(err?.message || "Payment request failed");
      return;
    }
    const paymentStartedAt = new Date().toISOString();
    const rows = readRows().map((row) =>
      row.id === id
        ? {
            ...row,
            status: payment?.status || "Processing",
            reviewedBy: "Finance",
            reviewedAt: paymentStartedAt,
            paymentId: payment?.id || "",
            paymentProvider: payment?.provider || provider,
            paymentStartedAt,
          }
        : row,
    );
    writeRows(rows);
    renderRows();
    window.alert(`${payment?.provider || provider} payment started. Wait for provider confirmation before treating it as paid.`);
  };

  const clearRow = (id) => {
    const target = readRows().find((row) => row.id === id);
    if (!target) return;
    const confirmed = window.confirm(`Clear payroll record for ${target.name || "this worker"}? This cannot be undone.`);
    if (!confirmed) return;
    writeRows(readRows().filter((row) => row.id !== id));
    renderRows();
  };

  const clearAllRows = () => {
    const rows = readRows();
    if (!rows.length) return;
    const confirmed = window.confirm(`Clear all ${rows.length} payroll records? This cannot be undone.`);
    if (!confirmed) return;
    writeRows([]);
    renderRows();
  };

  document.addEventListener("DOMContentLoaded", async () => {
    $("[data-menu-button]")?.addEventListener("click", () => document.body.classList.add("sidebar-open"));
    $("[data-close-sidebar]")?.addEventListener("click", () => document.body.classList.remove("sidebar-open"));

    const params = new URLSearchParams(location.search);
    const org = params.get("org") || params.get("tenant");
    if (org) $("[data-org-name]").textContent = org;

    const localRows = readJson(STORAGE_KEY, []);
    const dbRows = await window.MapphexFinanceDB?.read?.(STORAGE_KEY, []);
    const queueRows = queueToPayrollRows((await window.MapphexFinanceDB?.read?.(PAYMENT_QUEUE_KEY, [])) || readJson(PAYMENT_QUEUE_KEY, []));
    window.__financePayrollRows = normalizeRows([...localRows, ...(Array.isArray(dbRows) ? dbRows : []), ...queueRows]);
    writeRows(window.__financePayrollRows);

    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-payroll-action]");
      if (!button) return;
      if (button.dataset.payrollAction === "Clear") {
        clearRow(button.dataset.id);
        return;
      }
      setStatus(button.dataset.id);
    });

    $("[data-payroll-search]")?.addEventListener("input", renderRows);
    $("[data-payroll-filter]")?.addEventListener("change", renderRows);
    $("[data-clear-all-payroll]")?.addEventListener("click", clearAllRows);
    renderRows();
  });
})();
