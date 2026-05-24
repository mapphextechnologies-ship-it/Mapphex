(() => {
  const STORAGE_KEY = "mapphex_finance_generated_report_v1";
  const DATA_KEYS = {
    approvals: "mapphex_finance_approvals_v1",
    employees: "mapphex_finance_employee_payment_reviews_v1",
    invoices: "mapphex_finance_invoices_v1",
    ledger: "mapphex_finance_ledger_entries_v1",
    payroll: "mapphex_finance_payroll_requests_v1",
    payments: "mapphex_finance_payment_queue_v1",
    suppliers: "mapphex_finance_suppliers_v1",
  };
  const REPORTS = {
    "Finance summary": ["suppliers", "approvals", "employees", "payroll", "invoices", "ledger", "payments"],
    "Ledger report": ["ledger"],
    "Payroll report": ["payroll"],
    "Invoices report": ["invoices"],
    "Approvals report": ["approvals"],
    "Payments report": ["payments"],
    "Suppliers report": ["suppliers"],
    "Employee payment report": ["employees"],
  };
  const $ = (selector) => document.querySelector(selector);

  const readJson = (key, fallback) => {
    try {
      const value = window.MapphexFinanceDB?.readMemory?.(key, null);
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };

  const writeReport = (report) => {
    window.MapphexFinanceDB?.writeMemory?.(STORAGE_KEY, report);
  };

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));

  const calendarDate = (date = new Date()) =>
    date.toLocaleDateString("en-KE", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const money = (value) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));

  const actualPeriod = (period) => (String(period || "").toLowerCase() === "today" ? calendarDate() : period || "This month");

  const readRows = async (key) => {
    const storedRows = (await window.MapphexFinanceDB?.read?.(key, null)) || readJson(key, []);
    return Array.isArray(storedRows) ? storedRows : [];
  };

  const displayAmount = (row) => row.amount || row.salary && money(row.salary) || row.total || "KES 0";

  const normalizeRows = (type, rows) =>
    rows.map((row) => {
      if (type === "payroll") {
        return {
          section: "Payroll",
          name: row.name || row.employeeName || "Worker",
          detail: row.documentId || row.role || "",
          status: row.status || "Unpaid",
          amount: money(row.salary ?? row.amount ?? 0),
          date: row.paidAt || row.createdAt || "",
        };
      }
      if (type === "employees") {
        return {
          section: "Employee payments",
          name: row.name || "Employee",
          detail: row.documentId || row.role || "",
          status: row.paymentStatus || row.status || "Pending",
          amount: money(row.salary || 0),
          date: row.date || row.reviewedAt || "",
        };
      }
      if (type === "approvals") {
        return {
          section: "Approvals",
          name: row.name || "Approval request",
          detail: row.source || row.supplierId || "",
          status: row.status || "Pending",
          amount: displayAmount(row),
          date: row.date || row.createdAt || "",
        };
      }
      if (type === "suppliers") {
        return {
          section: "Suppliers",
          name: row.name || "Supplier",
          detail: row.paymentMethod || "",
          status: row.status || "Pending",
          amount: displayAmount(row),
          date: row.date || row.createdAt || "",
        };
      }
      if (type === "invoices") {
        return {
          section: "Invoices",
          name: row.invoiceNumber || row.name || "Invoice",
          detail: row.name || row.paymentStatus || "",
          status: row.paymentStatus || row.status || "Pending",
          amount: displayAmount(row),
          date: row.invoiceDate || row.dueDate || "",
        };
      }
      if (type === "ledger") {
        return {
          section: "Ledger",
          name: row.name || "Ledger entry",
          detail: row.type || "",
          status: row.type || "Entry",
          amount: money(row.amount || 0),
          date: row.date || "",
        };
      }
      return {
        section: "Payments",
        name: row.employeeName || row.name || "Payment",
        detail: row.provider || row.documentId || "",
        status: row.status || "Queued",
        amount: money(row.amount || row.salary || 0),
        date: row.createdAt || "",
      };
    });

  const buildReport = async (form) => {
    const body = Object.fromEntries(new FormData(form).entries());
    const reportType = body.reportType || "Finance summary";
    const sections = REPORTS[reportType] || REPORTS["Finance summary"];
    const data = {};
    for (const section of sections) {
      data[section] = normalizeRows(section, await readRows(DATA_KEYS[section]));
    }
    const rows = sections.flatMap((section) => data[section]);
    const report = {
      reportType,
      period: actualPeriod(body.period),
      format: body.format || "PDF",
      generatedAt: new Date().toISOString(),
      status: "Generated",
      rows,
      totals: {
        records: rows.length,
        payroll: data.payroll?.length || 0,
        approvals: data.approvals?.length || 0,
        invoices: data.invoices?.length || 0,
        suppliers: data.suppliers?.length || 0,
        employees: data.employees?.length || 0,
        ledger: data.ledger?.length || 0,
        payments: data.payments?.length || 0,
      },
    };
    writeReport(report);
    return report;
  };

  const rowTable = (rows) => {
    if (!rows.length) return `<p class="report-empty">No live records found for this report.</p>`;
    return `
      <div class="table-wrap report-table-wrap">
        <table>
          <thead><tr><th>Section</th><th>Name</th><th>Detail</th><th>Status</th><th>Amount</th><th>Date</th></tr></thead>
          <tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.section)}</td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.detail)}</td><td>${escapeHtml(row.status)}</td><td>${escapeHtml(row.amount)}</td><td>${escapeHtml(row.date)}</td></tr>`).join("")}</tbody>
        </table>
      </div>
    `;
  };

  const crcTable = (() => {
    const table = [];
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    bytes.forEach((byte) => {
      crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    });
    return (crc ^ 0xffffffff) >>> 0;
  };

  const u16 = (value) => [value & 0xff, (value >>> 8) & 0xff];
  const u32 = (value) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
  const encode = (value) => Array.from(new TextEncoder().encode(String(value)));

  const makeZip = (files) => {
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    files.forEach((file) => {
      const name = encode(file.name);
      const data = encode(file.content);
      const crc = crc32(data);
      const local = [
        ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...name, ...data,
      ];
      const central = [
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name,
      ];
      localParts.push(...local);
      centralParts.push(...central);
      offset += local.length;
    });
    const end = [
      ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
      ...u32(centralParts.length), ...u32(offset), ...u16(0),
    ];
    return new Uint8Array([...localParts, ...centralParts, ...end]);
  };

  const excelColumn = (index) => {
    let column = "";
    let number = index + 1;
    while (number > 0) {
      const remainder = (number - 1) % 26;
      column = String.fromCharCode(65 + remainder) + column;
      number = Math.floor((number - 1) / 26);
    }
    return column;
  };

  const excelCell = (value, rowIndex, columnIndex, type = "str") => {
    const ref = `${excelColumn(columnIndex)}${rowIndex}`;
    const text = String(value ?? "");
    if (type === "num" && text !== "" && !Number.isNaN(Number(text))) return `<c r="${ref}"><v>${Number(text)}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t>${escapeHtml(text)}</t></is></c>`;
  };

  const makeXlsx = (report) => {
    const sheetName = String(report.reportType || "Finance Report").replace(/[\[\]:*?/\\]/g, " ").slice(0, 31) || "Finance Report";
    const rows = [
      [report.reportType, "", "", "", "", ""],
      ["Report", report.reportType, "", "", "", ""],
      ["Period", report.period, "", "", "", ""],
      ["Generated", new Date(report.generatedAt).toLocaleString(), "", "", "", ""],
      ["Total records", report.totals.records, "", "", "", ""],
      ["Payroll", report.totals.payroll, "Approvals", report.totals.approvals, "Invoices", report.totals.invoices],
      ["Suppliers", report.totals.suppliers, "Employees", report.totals.employees, "Ledger", report.totals.ledger],
      [],
      ["Section", "Name", "Detail", "Status", "Amount", "Date"],
      ...report.rows.map((row) => [row.section, row.name, row.detail, row.status, row.amount, row.date]),
    ];
    const sheetRows = rows
      .map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => excelCell(cell, rowIndex + 1, columnIndex)).join("")}</row>`)
      .join("");
    const lastRow = Math.max(rows.length, 1);
    return makeZip([
      {
        name: "[Content_Types].xml",
        content: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
      },
      {
        name: "_rels/.rels",
        content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      },
      {
        name: "xl/workbook.xml",
        content: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeHtml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
      },
      {
        name: "xl/worksheets/sheet1.xml",
        content: `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:F${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="8" topLeftCell="A9" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="20" customWidth="1"/><col min="2" max="2" width="28" customWidth="1"/><col min="3" max="3" width="28" customWidth="1"/><col min="4" max="4" width="18" customWidth="1"/><col min="5" max="5" width="18" customWidth="1"/><col min="6" max="6" width="22" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A9:F${lastRow}"/><printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`,
      },
    ]);
  };

  const renderReport = (report) => {
    const hasReport = !!report;
    $("[data-report-status]").textContent = hasReport ? "Generated" : "Not generated";
    $("[data-report-type]").textContent = report?.reportType || "Finance";
    $("[data-report-format]").textContent = report?.format || "PDF";
    $("[data-report-date]").textContent = report?.generatedAt ? new Date(report.generatedAt).toLocaleString() : "Never";
    $("[data-export-report]").disabled = !hasReport;
    $("[data-print-report]").disabled = !hasReport;
    $("[data-report-preview]").innerHTML = hasReport
      ? `
        <div class="report-live-summary">
          <span>Records: <strong>${report.totals.records}</strong></span>
          <span>Payroll: <strong>${report.totals.payroll}</strong></span>
          <span>Approvals: <strong>${report.totals.approvals}</strong></span>
          <span>Invoices: <strong>${report.totals.invoices}</strong></span>
          <span>Suppliers: <strong>${report.totals.suppliers}</strong></span>
          <span>Employees: <strong>${report.totals.employees}</strong></span>
        </div>
        ${rowTable(report.rows)}
      `
      : "No report generated yet.";
  };

  const exportReport = () => {
    const report = readJson(STORAGE_KEY, null);
    if (!report) return;
    const workbook = makeXlsx(report);
    const blob = new Blob([workbook], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.reportType.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const report = readJson(STORAGE_KEY, null);
    if (!report) return;
    const printWindow = window.open("", "_blank", "width=1000,height=720");
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${escapeHtml(report.reportType)}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; color: #102033; }
            .eyebrow { color: #0f62fe; font-size: 12px; font-weight: 800; text-transform: uppercase; }
            h1 { margin: 6px 0 10px; font-size: 30px; }
            .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
            .meta div { border: 1px solid #dbe4ef; border-radius: 10px; padding: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { border-bottom: 1px solid #dbe4ef; padding: 10px; text-align: left; font-size: 13px; }
            th { background: #f5f8fc; }
          </style>
        </head>
        <body>
          <p class="eyebrow">MAPPHEX Finance Report</p>
          <h1>${escapeHtml(report.reportType)}</h1>
          <div class="meta">
            <div><span>Period</span><strong>${escapeHtml(report.period)}</strong></div>
            <div><span>Format</span><strong>${escapeHtml(report.format)}</strong></div>
            <div><span>Records</span><strong>${report.totals.records}</strong></div>
          </div>
          ${rowTable(report.rows)}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  document.addEventListener("DOMContentLoaded", () => {
    $("[data-menu-button]")?.addEventListener("click", () => document.body.classList.add("sidebar-open"));
    $("[data-close-sidebar]")?.addEventListener("click", () => document.body.classList.remove("sidebar-open"));

    const form = $("[data-report-form]");
    const settings = window.MapphexFinanceDB?.readSettings?.() || {};
    if (form?.elements.period && settings.reportPeriod) form.elements.period.value = settings.reportPeriod;
    if (form?.elements.format && settings.exportFormat) {
      form.elements.format.value = settings.exportFormat === "Excel" ? "Excel XLSX" : settings.exportFormat;
    }
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      renderReport(await buildReport(event.currentTarget));
    });
    $("[data-generate-report]")?.addEventListener("click", () => form?.requestSubmit());
    $("[data-export-report]")?.addEventListener("click", exportReport);
    $("[data-print-report]")?.addEventListener("click", printReport);
    renderReport(readJson(STORAGE_KEY, null));
  });
})();
