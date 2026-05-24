const { sendJson, readJsonBody } = require("../../api/_lib/http");
const { getStore } = require("../../api/_lib/kv-store");

const isProduction = () => process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

const callbackToken = (req) => {
  const baseUrl = `http://${req.headers.host || "localhost"}`;
  const url = new URL(req.url || "/", baseUrl);
  return String(req.headers["x-mpesa-callback-token"] || url.searchParams.get("token") || "").trim();
};

const assertCallbackAuthorized = (req) => {
  const expected = String(process.env.MPESA_CALLBACK_TOKEN || "").trim();
  if (!expected && !isProduction()) return;
  if (!expected) {
    const err = new Error("MPESA_CALLBACK_TOKEN is required in production");
    err.statusCode = 500;
    throw err;
  }
  if (callbackToken(req) === expected) return;
  const err = new Error("Invalid M-Pesa callback token");
  err.statusCode = 403;
  throw err;
};

const postOneSignal = async (path, payload) => {
  const appId = String(process.env.ONESIGNAL_APP_ID || "").trim();
  const apiKey = String(process.env.ONESIGNAL_API_KEY || "").trim();
  if (!appId || !apiKey) return null;
  const url = path === "sms" ? "https://api.onesignal.com/notifications?c=sms" : "https://api.onesignal.com/notifications";
  const body = { app_id: appId, ...payload };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${apiKey}` },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => null);
};

const pickItem = (items, name) => {
  if (!Array.isArray(items)) return null;
  const found = items.find((x) => x && typeof x === "object" && String(x.Name || "") === name) || null;
  return found && Object.prototype.hasOwnProperty.call(found, "Value") ? found.Value : null;
};

const updateFinancePayment = async (store, entry) => {
  const index = (await store.get("enterprise_mpesa_checkout_index_v1")) || {};
  const match = index[String(entry.checkoutRequestId || "")];
  if (!match?.tenantId || !match?.paymentId) return;

  const status = Number(entry.resultCode) === 0 ? "Paid" : "Failed";
  const paidAt = status === "Paid" ? new Date().toISOString() : "";
  const tenantPrefix = `tenant:${match.tenantId}:`;
  const paymentKey = `${tenantPrefix}mapphex_finance_payment_transactions_v1`;
  const payrollKey = `${tenantPrefix}mapphex_finance_payroll_requests_v1`;
  const queueKey = `${tenantPrefix}mapphex_finance_payment_queue_v1`;
  const payments = (await store.get(paymentKey)) || [];

  if (Array.isArray(payments)) {
    await store.set(paymentKey, payments.map((row) =>
      row.id === match.paymentId
        ? { ...row, status, paidAt, failedAt: status === "Failed" ? new Date().toISOString() : "", receipt: entry.receipt || "", callback: entry }
        : row,
    ));
  }

  for (const key of [payrollKey, queueKey]) {
    const rows = (await store.get(key)) || [];
    if (!Array.isArray(rows)) continue;
    await store.set(key, rows.map((row) => {
      const matches =
        row.paymentId === match.paymentId ||
        String(row.id || "") === String(match.recordId || "") ||
        String(row.employeeId || "") === String(match.recordId || "");
      return matches ? { ...row, status, paymentStatus: status, paidAt, receipt: entry.receipt || row.receipt || "" } : row;
    }));
  }
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });

  try {
    assertCallbackAuthorized(req);
    const body = await readJsonBody(req);
    const cb = body?.Body?.stkCallback || null;
    if (!cb || typeof cb !== "object") return sendJson(res, 400, { ok: false, error: "Invalid callback" });

    const resultCode = Number(cb.ResultCode);
    const resultDesc = String(cb.ResultDesc || "");
    const metaItems = cb?.CallbackMetadata?.Item || [];

    const entry = {
      at: new Date().toISOString(),
      merchantRequestId: String(cb.MerchantRequestID || ""),
      checkoutRequestId: String(cb.CheckoutRequestID || ""),
      resultCode: Number.isFinite(resultCode) ? resultCode : null,
      resultDesc,
      amount: pickItem(metaItems, "Amount"),
      receipt: pickItem(metaItems, "MpesaReceiptNumber"),
      transactionDate: pickItem(metaItems, "TransactionDate"),
      phoneNumber: pickItem(metaItems, "PhoneNumber"),
      raw: body,
    };

    const store = getStore();
    const logKey = "enterprise_mpesa_stk_callbacks_v1";
    const current = (await store.get(logKey)) || [];
    const arr = Array.isArray(current) ? current : [];
    arr.push(entry);
    await store.set(logKey, arr.slice(-800));
    await updateFinancePayment(store, entry);

    const success = Number(entry.resultCode) === 0;
    const amount = Number(entry.amount || 0) || 0;
    const receipt = String(entry.receipt || entry.checkoutRequestId || "");
    if (success) {
      const title = "M-Pesa payment confirmed";
      const msg = `KES ${amount.toLocaleString("en-US")} confirmed. Receipt ${receipt}`;
      await postOneSignal("push", {
        included_segments: ["Finance", "Sales", "Branches"],
        headings: { en: title },
        contents: { en: msg },
        data: { type: "mpesa_callback", amountKes: amount, receipt, checkoutRequestId: entry.checkoutRequestId },
      }).catch(() => null);
      if (entry.phoneNumber) {
        await postOneSignal("sms", {
          include_phone_numbers: [String(entry.phoneNumber)],
          contents: { en: `MAPPHEX: Payment received KES ${amount.toLocaleString("en-US")}. Receipt ${receipt}.` },
          data: { type: "mpesa_receipt", receipt },
        }).catch(() => null);
      }
    }

    // Acknowledge to Safaricom.
    return sendJson(res, 200, { ResultCode: 0, ResultDesc: "Accepted" });
  } catch (err) {
    const status = Number(err?.statusCode || 500) || 500;
    return sendJson(res, status, { ok: false, error: status >= 500 ? "Server error" : String(err.message || "Server error") });
  }
};
