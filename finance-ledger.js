(() => {
  const STORAGE_KEY = "mapphex_finance_ledger_entries_v1";
  const BUILT_IN_SAMPLE_IDS = new Set(["ledger-001", "ledger-002"]);

  const $ = (selector) => document.querySelector(selector);
  const money = (value) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));

  const readRows = () => {
    if (Array.isArray(window.__financeLedgerRows)) return window.__financeLedgerRows;
    try {
      const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  };

  const writeRows = (rows) => {
    window.__financeLedgerRows = rows;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    window.MapphexFinanceDB?.write?.(STORAGE_KEY, rows);
  };
  const typeClass = (type) => (String(type).toLowerCase() === "debit" ? "status pending" : "status");

  const formatDate = (value) => {
    if (!value) return "Today";
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-KE", { month: "short", day: "numeric", year: "numeric" });
  };

  const normalizeRows = (rows) => {
    const seen = new Set();
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => !BUILT_IN_SAMPLE_IDS.has(String(row.id || "")) && !(Number(row.amount || 0) === 0 && ["Sales income", "Expense payment"].includes(String(row.name || ""))))
      .map((row, index) => ({
        id: row.id || `ledger-row-${index}-${String(row.name || "entry").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: row.name || "Ledger entry",
        type: row.type === "Debit" ? "Debit" : "Credit",
        amount: Number(row.amount || 0),
        date: row.date || "Today",
      }))
      .filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });
  };

  const saveEntry = (form) => {
    const data = Object.fromEntries(new FormData(form).entries());
    const rows = readRows();
    rows.unshift({
      id: `ledger-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: String(data.name || "").trim(),
      type: data.type === "Credit" ? "Credit" : "Debit",
      amount: Number(data.amount || 0),
      date: formatDate(data.date),
      createdAt: new Date().toISOString(),
    });
    writeRows(normalizeRows(rows));
    renderRows();
  };

  const matchesFilters = (row) => {
    const search = String($("[data-ledger-search]")?.value || "").trim().toLowerCase();
    const filter = String($("[data-ledger-filter]")?.value || "All");
    const text = `${row.name} ${row.type}`.toLowerCase();
    return (filter === "All" || row.type === filter) && (!search || text.includes(search));
  };

  const updateSummary = (rows) => {
    const debit = rows.filter((row) => row.type === "Debit").reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const credit = rows.filter((row) => row.type === "Credit").reduce((sum, row) => sum + Number(row.amount || 0), 0);
    $("[data-debit-total]").textContent = money(debit);
    $("[data-credit-total]").textContent = money(credit);
    $("[data-entry-count]").textContent = String(rows.length);
    $("[data-ledger-status]").textContent = credit >= debit ? "Balanced" : "Review";
  };

  const renderRows = () => {
    const rows = readRows();
    updateSummary(rows);
    const visibleRows = rows.filter(matchesFilters);
    const body = $("[data-records-body]");
    if (!body) return;
    if (!visibleRows.length) {
      body.innerHTML = `<tr><td colspan="5">No ledger entries yet.</td></tr>`;
      return;
    }
    body.innerHTML = visibleRows
      .map(
        (row) => `
          <tr>
            <td>${row.name}</td>
            <td><span class="${typeClass(row.type)}">${row.type}</span></td>
            <td>${money(row.amount)}</td>
            <td>${row.date || "Today"}</td>
            <td><button class="row-action" type="button" data-delete-ledger="${row.id}">Remove</button></td>
          </tr>
        `,
      )
      .join("");
  };

  const removeEntry = (id) => {
    writeRows(readRows().filter((row) => row.id !== id));
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
    window.__financeLedgerRows = normalizeRows([...localRows, ...(Array.isArray(dbRows) ? dbRows : [])]);
    writeRows(window.__financeLedgerRows);
    const form = $("[data-ledger-form]");
    const dateInput = form?.elements.date;
    if (dateInput) dateInput.valueAsDate = new Date();
    $("[data-toggle-ledger-form]")?.addEventListener("click", () => {
      form.hidden = !form.hidden;
      if (!form.hidden) form.elements.name.focus();
    });
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      saveEntry(event.currentTarget);
      form.reset();
      if (dateInput) dateInput.valueAsDate = new Date();
      form.elements.name.focus();
    });
    $("[data-ledger-search]")?.addEventListener("input", renderRows);
    $("[data-ledger-filter]")?.addEventListener("change", renderRows);
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-delete-ledger]");
      if (!button) return;
      removeEntry(button.dataset.deleteLedger);
    });

    renderRows();
  });
})();
