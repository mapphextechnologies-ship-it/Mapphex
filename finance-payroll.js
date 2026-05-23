(() => {
  const STORAGE_KEY = "mapphex_finance_payroll_requests_v1";
  const sampleRows = [
    {
      id: "payroll-hr-001",
      name: "Amina Wanjiku",
      documentId: "ID-28475612",
      role: "Sales",
      salary: 42000,
      sentBy: "HR",
      status: "Pending",
      createdAt: new Date().toISOString(),
    },
    {
      id: "payroll-hr-002",
      name: "Brian Otieno",
      documentId: "P-AF49321",
      role: "Inventory",
      salary: 38000,
      sentBy: "HR",
      status: "Pending",
      createdAt: new Date().toISOString(),
    },
  ];

  const $ = (selector) => document.querySelector(selector);
  const money = (value) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));

  const readRows = () => {
    try {
      const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  };

  const writeRows = (rows) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  };

  const statusClass = (status) => {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "pending") return "status pending";
    if (normalized === "rejected") return "status rejected";
    return "status";
  };

  const actionButtons = (row) => {
    if (row.status !== "Pending") return `<button class="row-action" type="button" disabled>${row.status}</button>`;
    return `
      <div class="payroll-actions">
        <button class="payroll-action approve" type="button" data-payroll-action="Approved" data-id="${row.id}">Approve</button>
        <button class="payroll-action reject" type="button" data-payroll-action="Rejected" data-id="${row.id}">Reject</button>
      </div>
    `;
  };

  const matchesFilters = (row) => {
    const search = String($("[data-payroll-search]")?.value || "").trim().toLowerCase();
    const filter = String($("[data-payroll-filter]")?.value || "All");
    const statusMatch = filter === "All" || row.status === filter;
    const text = `${row.name} ${row.documentId} ${row.role}`.toLowerCase();
    return statusMatch && (!search || text.includes(search));
  };

  const updateSummary = (rows) => {
    const pending = rows.filter((row) => row.status === "Pending");
    const approved = rows.filter((row) => row.status === "Approved");
    const totalSalary = rows
      .filter((row) => row.status !== "Rejected")
      .reduce((sum, row) => sum + Number(row.salary || 0), 0);
    $("[data-total-workers]").textContent = String(rows.length);
    $("[data-pending-workers]").textContent = String(pending.length);
    $("[data-approved-workers]").textContent = String(approved.length);
    $("[data-total-salary]").textContent = money(totalSalary);
  };

  const renderRows = () => {
    const rows = readRows();
    updateSummary(rows);
    const visibleRows = rows.filter(matchesFilters);
    const body = $("[data-records-body]");
    if (!body) return;
    if (!visibleRows.length) {
      body.innerHTML = `<tr><td colspan="7">No payroll payment requests yet. HR can send worker salary details here for Finance approval.</td></tr>`;
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
            <td><span class="${statusClass(row.status)}">${row.status}</span></td>
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
      status: payload.status || "Pending",
      createdAt: payload.createdAt || new Date().toISOString(),
    });
    writeRows(rows);
    renderRows();
  };

  const setStatus = (id, status) => {
    const rows = readRows().map((row) =>
      row.id === id
        ? {
            ...row,
            status,
            reviewedBy: "Finance",
            reviewedAt: new Date().toISOString(),
          }
        : row,
    );
    writeRows(rows);
    renderRows();
  };

  document.addEventListener("DOMContentLoaded", () => {
    $("[data-menu-button]")?.addEventListener("click", () => document.body.classList.add("sidebar-open"));
    $("[data-close-sidebar]")?.addEventListener("click", () => document.body.classList.remove("sidebar-open"));

    const params = new URLSearchParams(location.search);
    const org = params.get("org") || params.get("tenant");
    if (org) $("[data-org-name]").textContent = org;

    if (!readRows().length) writeRows(sampleRows);

    $("[data-payroll-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      addRow({
        name: String(body.name || "").trim(),
        documentId: String(body.documentId || "").trim(),
        role: String(body.role || "").trim(),
        salary: Number(body.salary || 0),
      });
      event.currentTarget.reset();
    });

    $("[data-seed-payroll]")?.addEventListener("click", () => {
      sampleRows.forEach((row) =>
        addRow({
          name: row.name,
          documentId: row.documentId,
          role: row.role,
          salary: row.salary,
        }),
      );
    });

    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-payroll-action]");
      if (!button) return;
      setStatus(button.dataset.id, button.dataset.payrollAction);
    });

    $("[data-payroll-search]")?.addEventListener("input", renderRows);
    $("[data-payroll-filter]")?.addEventListener("change", renderRows);
    renderRows();
  });
})();
