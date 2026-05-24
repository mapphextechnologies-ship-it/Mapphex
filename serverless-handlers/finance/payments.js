const { sendJson, readJsonBody } = require("../../api/_lib/http");
const { getStore } = require("../../api/_lib/kv-store");
const { getTenantId, scopeTenantKey } = require("../../api/_lib/tenant");
const { assertIdempotent, assertObject, assertSameOrigin, rateLimit, requireActiveTenantSession, safeString } = require("../../api/_lib/security");
const { baseUrl, mustEnv, nowTimestamp, normalizeMsisdn, getAccessToken, stkPassword } = require("../../api/_lib/mpesa");

const PAYMENTS_KEY = "mapphex_finance_payment_transactions_v1";
const PAYROLL_KEY = "mapphex_finance_payroll_requests_v1";
const QUEUE_KEY = "mapphex_finance_payment_queue_v1";
const CHECKOUT_INDEX_KEY = "enterprise_mpesa_checkout_index_v1";

const readArray = async (store, key) => {
  const rows = (await store.get(key)) || [];
  return Array.isArray(rows) ? rows : [];
};

const writeLinkedStatus = async (store, tenantId, recordId, status, patch = {}) => {
  const keys = [PAYROLL_KEY, QUEUE_KEY].map((key) => scopeTenantKey(tenantId, key));
  for (const key of keys) {
    const rows = await readArray(store, key);
    let changed = false;
    const nextRows = rows.map((row) => {
      const matches =
        String(row.id || "") === String(recordId || "") ||
        String(row.employeeId || "") === String(recordId || "") ||
        String(`payroll-${row.employeeId || ""}`) === String(recordId || "");
      if (!matches) return row;
      changed = true;
      return { ...row, status, paymentStatus: status, ...patch };
    });
    if (changed) await store.set(key, nextRows);
  }
};

const appendPayment = async (store, tenantId, payment) => {
  const key = scopeTenantKey(tenantId, PAYMENTS_KEY);
  const rows = await readArray(store, key);
  rows.unshift(payment);
  await store.set(key, rows.slice(0, 800));
};

const callMpesa = async ({ amount, phoneNumber, accountReference, transactionDesc, callbackUrl }) => {
  const phone = normalizeMsisdn(phoneNumber);
  if (!phone) {
    const err = new Error("Invalid M-Pesa phone number");
    err.statusCode = 400;
    throw err;
  }
  const shortcode = mustEnv("MPESA_SHORTCODE");
  const passkey = mustEnv("MPESA_PASSKEY");
  const txType = String(process.env.MPESA_TX_TYPE || "CustomerPayBillOnline").trim() || "CustomerPayBillOnline";
  const timestamp = nowTimestamp();
  const token = await getAccessToken();
  const payload = {
    BusinessShortCode: shortcode,
    Password: stkPassword(shortcode, passkey, timestamp),
    Timestamp: timestamp,
    TransactionType: txType,
    Amount: Math.round(Number(amount || 0)),
    PartyA: phone,
    PartyB: shortcode,
    PhoneNumber: phone,
    CallBackURL: callbackUrl,
    AccountReference: String(accountReference || "MAPPHEX").slice(0, 32),
    TransactionDesc: String(transactionDesc || "Finance payment").slice(0, 64),
  };
  const res = await fetch(`${baseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    const err = new Error("M-Pesa request failed");
    err.statusCode = 502;
    err.details = data;
    throw err;
  }
  const { Password, ...safeRequest } = payload;
  return { providerStatus: "Processing", request: safeRequest, response: data };
};

const callBank = async ({ amount, bankAccount, accountName, reference, description }) => {
  const apiUrl = String(process.env.BANK_API_URL || "").trim();
  const apiToken = String(process.env.BANK_API_TOKEN || "").trim();
  if (!apiUrl || !apiToken) {
    const err = new Error("Bank API is not configured");
    err.statusCode = 501;
    throw err;
  }
  const payload = {
    amount: Math.round(Number(amount || 0)),
    accountNumber: safeString(bankAccount, 80),
    accountName: safeString(accountName, 120),
    reference: safeString(reference, 80),
    description: safeString(description, 160),
  };
  if (!payload.accountNumber) {
    const err = new Error("Bank account is required");
    err.statusCode = 400;
    throw err;
  }
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error("Bank payment request failed");
    err.statusCode = 502;
    err.details = data;
    throw err;
  }
  return { providerStatus: "Processing", request: { ...payload, accountNumber: "***" + payload.accountNumber.slice(-4) }, response: data };
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });

  try {
    rateLimit(req, { scope: "finance-payments", limit: 40, windowMs: 60_000 });
    assertSameOrigin(req);
    const body = assertObject(await readJsonBody(req));
    assertIdempotent(req, body);
    const tenantId = getTenantId(req, body);
    const session = await requireActiveTenantSession(req, tenantId);
    const provider = String(body.provider || body.paymentMethod || "").toLowerCase();
    const amount = Math.round(Number(body.amount || 0));
    if (!Number.isFinite(amount) || amount <= 0) return sendJson(res, 400, { ok: false, error: "Invalid amount" });
    if (!["m-pesa", "mpesa", "bank"].includes(provider)) return sendJson(res, 400, { ok: false, error: "Unsupported payment provider" });

    const store = getStore();
    const paymentId = `finance-payment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const recordId = safeString(body.recordId || body.payrollId || body.employeeId, 120);
    const employeeName = safeString(body.employeeName || body.name || "Employee", 160);
    const callbackToken = String(process.env.MPESA_CALLBACK_TOKEN || "").trim();
    const envCallback = String(process.env.MPESA_CALLBACK_URL || "").trim();
    const requestOrigin = String(body.origin || "").replace(/\/+$/, "");
    const callbackUrl = envCallback || (requestOrigin ? `${requestOrigin}/api/mpesa/callback${callbackToken ? `?token=${encodeURIComponent(callbackToken)}` : ""}` : "");
    if (provider !== "bank" && !callbackUrl) return sendJson(res, 500, { ok: false, error: "Missing M-Pesa callback URL" });

    const providerResult = provider === "bank"
      ? await callBank({
          amount,
          bankAccount: body.bankAccount,
          accountName: employeeName,
          reference: body.reference || recordId || paymentId,
          description: body.description || `Payroll payment for ${employeeName}`,
        })
      : await callMpesa({
          amount,
          phoneNumber: body.phoneNumber,
          accountReference: body.reference || recordId || "PAYROLL",
          transactionDesc: body.description || `Payroll payment for ${employeeName}`,
          callbackUrl,
        });

    const now = new Date().toISOString();
    const payment = {
      id: paymentId,
      tenantId,
      recordId,
      employeeId: safeString(body.employeeId, 120),
      employeeName,
      documentId: safeString(body.documentId, 120),
      provider: provider === "bank" ? "Bank" : "M-Pesa",
      amount,
      status: providerResult.providerStatus,
      createdAt: now,
      createdBy: session.sub || session.userId || "Finance",
      providerRequest: providerResult.request,
      providerResponse: providerResult.response,
    };
    await appendPayment(store, tenantId, payment);
    await writeLinkedStatus(store, tenantId, recordId, "Processing", { paymentId, paymentProvider: payment.provider, paymentStartedAt: now });

    const checkoutRequestId = providerResult.response?.CheckoutRequestID || providerResult.response?.CheckoutRequestId || "";
    if (checkoutRequestId) {
      const index = (await store.get(CHECKOUT_INDEX_KEY)) || {};
      index[checkoutRequestId] = { tenantId, paymentId, recordId };
      await store.set(CHECKOUT_INDEX_KEY, index);
    }

    return sendJson(res, 200, { ok: true, payment });
  } catch (err) {
    const status = Number(err?.statusCode || 500) || 500;
    return sendJson(res, status, { ok: false, error: status >= 500 ? "Server error" : String(err.message || "Payment request failed"), details: err?.details || undefined });
  }
};
