(() => {
  const DB_KEY = "mapphex_finance_invoices_v1";
  const initialRows = [];
  const oldSampleInvoiceNumbers = new Set(["INV-001", "INV-002", "INV-003"]);
  let rows = [];
  const statusClass = (status) => {
    const normalized = String(status).toLowerCase();
    if (normalized === "pending") return "status pending";
    if (normalized === "rejected") return "status rejected";
    return "status";
  };
  const formatMoney = (amount) => `KES ${Number(amount || 0).toLocaleString("en-KE")}`;
  const formatDate = (value) => {
    if (!value) return "Today";
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-KE", { month: "short", day: "numeric", year: "numeric" });
  };
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
  const downloadXls = (row) => {
    const workbook = `
      <html>
        <head><meta charset="UTF-8" /></head>
        <body>
          <table>
            <thead>
              <tr>
                <th>Invoice Number</th>
                <th>Invoice</th>
                <th>Status</th>
                <th>Payment Status</th>
                <th>Amount</th>
                <th>Invoice Date</th>
                <th>Due Date</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${escapeHtml(row.invoiceNumber)}</td>
                <td>${escapeHtml(row.name)}</td>
                <td>${escapeHtml(row.status)}</td>
                <td>${escapeHtml(row.paymentStatus)}</td>
                <td>${escapeHtml(row.amount)}</td>
                <td>${escapeHtml(row.invoiceDate)}</td>
                <td>${escapeHtml(row.dueDate)}</td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `;
    const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${String(row.invoiceNumber || "invoice").replace(/[^a-z0-9-]/gi, "-").toLowerCase()}-report.xls`;
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
  };
  const renderRows = (body) => {
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="8">No invoices yet.</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((row, index) => `<tr><td>${escapeHtml(row.invoiceNumber)}</td><td>${escapeHtml(row.name)}</td><td><span class="${statusClass(row.status)}">${escapeHtml(row.status)}</span></td><td><span class="${statusClass(row.paymentStatus === "Paid" ? "Approved" : "Pending")}">${escapeHtml(row.paymentStatus)}</span></td><td>${escapeHtml(row.amount)}</td><td>${escapeHtml(row.invoiceDate)}</td><td>${escapeHtml(row.dueDate)}</td><td><div class="invoice-row-actions"><button class="row-action" type="button" data-open-invoice="${index}">Open</button><button class="row-action danger-action" type="button" data-clear-invoice="${index}">Clear</button></div></td></tr>`).join("");
  };
  const renderSummary = () => {
    const count = (status) => rows.filter((row) => String(row.status).toLowerCase() === status).length;
    const total = document.querySelector("[data-total-invoices]");
    const badge = document.querySelector("[data-invoice-badge]");
    const pending = document.querySelector("[data-pending-invoices]");
    const approved = document.querySelector("[data-approved-invoices]");
    const rejected = document.querySelector("[data-rejected-invoices]");
    if (total) total.textContent = String(rows.length);
    if (badge) badge.textContent = String(rows.length);
    if (pending) pending.textContent = String(count("pending"));
    if (approved) approved.textContent = String(count("approved"));
    if (rejected) rejected.textContent = String(count("rejected"));
  };
  const renderPage = (body) => {
    renderRows(body);
    renderSummary();
  };
  const saveInvoices = async () => {
    if (!window.MapphexFinanceDB) return;
    await window.MapphexFinanceDB.write(DB_KEY, rows);
  };
  const removeOldSamples = (items) => items.filter((row) => {
    const isOldSampleNumber = oldSampleInvoiceNumbers.has(String(row.invoiceNumber || ""));
    const isZeroSample = String(row.amount || "") === "KES 0" && ["Customer invoice", "Supplier bill", "Service invoice"].includes(String(row.name || ""));
    return !(isOldSampleNumber && isZeroSample);
  });
  const renderInvoiceDetail = (detail, row) => {
    detail.hidden = false;
    detail.innerHTML = `
      <div class="invoice-report-actions">
        <button class="row-action" type="button" data-print-invoice>Print</button>
        <button class="row-action" type="button" data-export-invoice>Export XLS</button>
        <button class="row-action" type="button" data-close-invoice>Close</button>
      </div>
      <article class="invoice-report" data-printable-invoice>
        <header class="invoice-report-head">
          <div>
            <p class="eyebrow">Invoice Report</p>
            <h3>${escapeHtml(row.invoiceNumber)}</h3>
            <span>${escapeHtml(row.name)}</span>
          </div>
          <div class="invoice-report-status">
            <span>${escapeHtml(row.status)}</span>
            <strong>${escapeHtml(row.paymentStatus)}</strong>
          </div>
        </header>
        <div class="invoice-report-summary">
          <div><span>Amount</span><strong>${escapeHtml(row.amount)}</strong></div>
          <div><span>Invoice date</span><strong>${escapeHtml(row.invoiceDate)}</strong></div>
          <div><span>Due date</span><strong>${escapeHtml(row.dueDate)}</strong></div>
        </div>
        <table class="invoice-report-table">
          <thead><tr><th>Description</th><th>Status</th><th>Payment</th><th>Amount</th></tr></thead>
          <tbody><tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.status)}</td><td>${escapeHtml(row.paymentStatus)}</td><td>${escapeHtml(row.amount)}</td></tr></tbody>
        </table>
        <footer class="invoice-report-footer">
          <span>Prepared by Finance Portal</span>
          <strong>Total: ${escapeHtml(row.amount)}</strong>
        </footer>
      </article>
    `;
    detail.dataset.activeInvoice = row.invoiceNumber;
  };
  const printInvoice = (detail) => {
    const printable = detail.querySelector("[data-printable-invoice]");
    if (!printable) return;
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; color: #102033; }
            .eyebrow { color: #2563eb; font-size: 12px; font-weight: 700; text-transform: uppercase; }
            .invoice-report-head, .invoice-report-footer { display: flex; justify-content: space-between; gap: 24px; border-bottom: 1px solid #dbe4ef; padding-bottom: 18px; }
            .invoice-report-footer { border-top: 1px solid #dbe4ef; border-bottom: 0; padding-top: 18px; margin-top: 24px; }
            h3 { font-size: 32px; margin: 4px 0; }
            .invoice-report-status { text-align: right; }
            .invoice-report-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 24px 0; }
            .invoice-report-summary div { border: 1px solid #dbe4ef; border-radius: 10px; padding: 14px; }
            span { color: #5c6f82; }
            strong { display: block; margin-top: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { border-bottom: 1px solid #dbe4ef; padding: 12px; text-align: left; }
          </style>
        </head>
        <body>${printable.outerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };
  const activeRow = (detail) => {
    const invoiceNumber = detail.dataset.activeInvoice;
    return rows.find((row) => row.invoiceNumber === invoiceNumber);
  };
  document.addEventListener("DOMContentLoaded", async () => {
    document.querySelector("[data-menu-button]")?.addEventListener("click", () => document.body.classList.add("sidebar-open"));
    document.querySelector("[data-close-sidebar]")?.addEventListener("click", () => document.body.classList.remove("sidebar-open"));
    const org = new URLSearchParams(location.search).get("org") || new URLSearchParams(location.search).get("tenant");
    if (org) document.querySelector("[data-org-name]").textContent = org;
    const body = document.querySelector("[data-records-body]");
    const form = document.querySelector("[data-invoice-form]");
    const detail = document.querySelector("[data-invoice-detail]");
    const toggleButton = document.querySelector("[data-toggle-invoice-form]");
    const clearAllButton = document.querySelector("[data-clear-all-invoices]");
    const invoiceDateInput = form?.elements.invoiceDate;
    const dueDateInput = form?.elements.dueDate;
    if (invoiceDateInput) invoiceDateInput.valueAsDate = new Date();
    if (dueDateInput) dueDateInput.valueAsDate = new Date();
    const storedRows = window.MapphexFinanceDB ? await window.MapphexFinanceDB.read(DB_KEY, initialRows) : initialRows;
    rows = Array.isArray(storedRows) ? removeOldSamples(storedRows) : [...initialRows];
    if (Array.isArray(storedRows) && rows.length !== storedRows.length) saveInvoices();
    renderPage(body);
    toggleButton?.addEventListener("click", () => {
      form.hidden = !form.hidden;
      if (!form.hidden) form.elements.invoiceNumber.focus();
    });
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      rows.unshift({
        invoiceNumber: form.elements.invoiceNumber.value.trim(),
        name: form.elements.name.value.trim(),
        status: form.elements.status.value,
        paymentStatus: form.elements.paymentStatus.value,
        amount: formatMoney(form.elements.amount.value),
        invoiceDate: formatDate(form.elements.invoiceDate.value),
        dueDate: formatDate(form.elements.dueDate.value),
      });
      renderPage(body);
      saveInvoices();
      form.reset();
      if (invoiceDateInput) invoiceDateInput.valueAsDate = new Date();
      if (dueDateInput) dueDateInput.valueAsDate = new Date();
      form.elements.invoiceNumber.focus();
    });
    body?.addEventListener("click", (event) => {
      const openButton = event.target.closest("[data-open-invoice]");
      if (openButton) {
        const row = rows[Number(openButton.dataset.openInvoice)];
        if (!row || !detail) return;
        renderInvoiceDetail(detail, row);
        detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }
      const clearButton = event.target.closest("[data-clear-invoice]");
      if (!clearButton) return;
      const rowIndex = Number(clearButton.dataset.clearInvoice);
      const row = rows[rowIndex];
      if (!row) return;
      const ok = window.confirm(`Clear invoice ${row.invoiceNumber}?`);
      if (!ok) return;
      rows.splice(rowIndex, 1);
      if (detail) {
        detail.hidden = true;
        detail.innerHTML = "";
      }
      renderPage(body);
      saveInvoices();
    });
    clearAllButton?.addEventListener("click", () => {
      if (!rows.length) return;
      const ok = window.confirm("Clear all invoices?");
      if (!ok) return;
      rows = [];
      if (detail) {
        detail.hidden = true;
        detail.innerHTML = "";
      }
      renderPage(body);
      saveInvoices();
    });
    detail?.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-invoice]")) {
        detail.hidden = true;
        detail.innerHTML = "";
        return;
      }
      if (event.target.closest("[data-print-invoice]")) {
        printInvoice(detail);
        return;
      }
      if (event.target.closest("[data-export-invoice]")) {
        const row = activeRow(detail);
        if (row) downloadXls(row);
      }
    });
  });
})();
