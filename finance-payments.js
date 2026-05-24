(() => {
  "use strict";

  const requiredValue = (current, message) => {
    const existing = String(current || "").trim();
    if (existing) return existing;
    const value = window.prompt(message, "");
    return value === null ? "" : String(value || "").trim();
  };

  const startPayrollPayment = async (row) => {
    const provider = row.paymentMethod || row.paymentProvider || "M-Pesa";
    const isBank = String(provider).toLowerCase() === "bank";
    const phoneNumber = isBank ? "" : requiredValue(row.phoneNumber, `Enter M-Pesa phone number for ${row.name || "employee"}`);
    const bankAccount = isBank ? requiredValue(row.bankAccount, `Enter bank account/reference for ${row.name || "employee"}`) : "";
    if (!isBank && !phoneNumber) throw new Error("M-Pesa phone number is required");
    if (isBank && !bankAccount) throw new Error("Bank account is required");

    const payload = {
      tenantId: window.MapphexFinanceDB?.tenantId?.() || "",
      origin: location.origin,
      provider,
      recordId: row.id,
      payrollId: row.id,
      employeeId: row.employeeId || row.id,
      employeeName: row.name || row.employeeName || "Employee",
      documentId: row.documentId || "",
      amount: Number(row.salary ?? row.amount ?? 0),
      phoneNumber,
      bankAccount,
      reference: row.documentId || row.employeeId || row.id,
      description: `Payroll payment for ${row.name || row.employeeName || "employee"}`,
    };

    const res = await fetch("/api/finance/payments", {
      method: "POST",
      headers: window.MapphexFinanceDB?.apiHeaders?.({
        "Content-Type": "application/json",
        "Idempotency-Key": `finance-payment-${row.id}-${Date.now()}`,
      }) || { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Payment request failed");
    return data.payment;
  };

  window.MapphexFinancePayments = Object.freeze({ startPayrollPayment });
})();
