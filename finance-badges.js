(() => {
  const INVOICES_KEY = "mapphex_finance_invoices_v1";
  const APPROVALS_KEY = "mapphex_finance_approvals_v1";
  const PAYROLL_KEY = "mapphex_finance_payroll_requests_v1";
  const oldSampleInvoiceNumbers = new Set(["INV-001", "INV-002", "INV-003"]);

  const isOldSampleInvoice = (row) => {
    const sampleName = ["Customer invoice", "Supplier bill", "Service invoice"].includes(String(row?.name || ""));
    return oldSampleInvoiceNumbers.has(String(row?.invoiceNumber || "")) && sampleName && String(row?.amount || "") === "KES 0";
  };

  const updateInvoiceBadges = async () => {
    const badges = [...document.querySelectorAll("[data-invoice-badge]")];
    if (!badges.length) return;
    const storedRows = window.MapphexFinanceDB ? await window.MapphexFinanceDB.read(INVOICES_KEY, []) : [];
    const rows = Array.isArray(storedRows) ? storedRows.filter((row) => !isOldSampleInvoice(row)) : [];
    badges.forEach((badge) => {
      badge.textContent = String(rows.length);
    });
  };

  const updateApprovalBadges = async () => {
    const badges = [...document.querySelectorAll("[data-approval-badge]")];
    if (!badges.length) return;
    const storedRows = window.MapphexFinanceDB ? await window.MapphexFinanceDB.read(APPROVALS_KEY, []) : [];
    const rows = Array.isArray(storedRows) ? storedRows : [];
    badges.forEach((badge) => {
      badge.textContent = String(rows.length);
    });
  };

  const updatePayrollBadges = async () => {
    const badges = [...document.querySelectorAll("[data-payroll-badge]")];
    if (!badges.length) return;
    const storedRows = window.MapphexFinanceDB ? await window.MapphexFinanceDB.read(PAYROLL_KEY, []) : [];
    const rows = Array.isArray(storedRows) ? storedRows : [];
    const unpaid = rows.filter((row) => String(row?.status || "Unpaid").toLowerCase() !== "paid").length;
    badges.forEach((badge) => {
      badge.textContent = String(unpaid);
    });
  };

  const updateBadges = () => {
    updateInvoiceBadges();
    updateApprovalBadges();
    updatePayrollBadges();
  };

  document.addEventListener("DOMContentLoaded", updateBadges);
  window.MapphexFinanceBadges = Object.freeze({ updateInvoiceBadges, updateApprovalBadges, updatePayrollBadges, updateBadges });
})();
