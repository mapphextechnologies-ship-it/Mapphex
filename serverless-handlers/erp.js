const { sendJson, readJsonBody } = require("../api/_lib/http");
const { getStore } = require("../api/_lib/kv-store");
const { getTenantId } = require("../api/_lib/tenant");
const { appendEvent } = require("../api/_lib/events");
const { scopedErpKeys } = require("../api/_lib/erp-keys");
const {
  assertObject,
  assertIdempotent,
  assertSameOrigin,
  rateLimit,
  requireTenantSession,
  safeString,
} = require("../api/_lib/security");
const { recordFingerprint, uniqueBy } = require("../api/_lib/data-hygiene");

const nowIso = () => new Date().toISOString();
const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const asArray = (value) => (Array.isArray(value) ? value : []);
const asObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

const readState = async (store, tenantId) => {
  const keys = scopedErpKeys(tenantId);
  const raw = await store.mget(Object.values(keys));
  const value = (name, fallback) => {
    const current = raw[keys[name]];
    return current === null || typeof current === "undefined" ? fallback : current;
  };

  const settings = asObject(value("settings", {}));
  const enabledModules = Array.from(
    new Set(asArray(settings.installedPortals || settings.enabledModules).map((id) => safeString(id, 80)).filter(Boolean)),
  );

  return {
    keys,
    settings,
    enabledModules,
    users: asArray(value("users", [])),
    moduleRecords: asObject(value("moduleRecords", {})),
    moduleActivity: uniqueBy(asArray(value("moduleActivity", [])), (row) => row.id || recordFingerprint([row.at, row.moduleId, row.action])),
    departmentWorkflows: asObject(value("departmentWorkflows", {})),
    notifications: uniqueBy(asArray(value("notifications", [])), (row) => row.id || recordFingerprint([row.moduleId, row.title, row.body, row.at])),
    announcements: uniqueBy(asArray(value("announcements", [])), (row) => row.id || recordFingerprint([row.title, row.body, row.createdAt])),
    audit: uniqueBy(asArray(value("audit", [])), (row) => row.id || recordFingerprint([row.at, row.actor, row.action])),
    transactions: uniqueBy(asArray(value("transactions", [])), (row) => row.ref || row.id),
    reports: asObject(value("reports", {})),
    messages: uniqueBy(asArray(value("messages", [])), (row) => row.id || recordFingerprint([row.createdAt, row.from, row.to, row.body])),
    documents: uniqueBy(asArray(value("documents", [])), (row) => row.id || row.title),
    inventoryMovements: uniqueBy(asArray(value("inventoryMovements", [])), (row) => row.id || recordFingerprint([row.transactionId, row.itemId, row.quantity])),
    financeLedger: uniqueBy(asArray(value("financeLedger", [])), (row) => row.transactionId || row.id),
  };
};

const publicState = (tenantId, state) => ({
  tenantId,
  settings: state.settings,
  enabledModules: state.enabledModules,
  users: state.users,
  moduleRecords: state.moduleRecords,
  moduleActivity: state.moduleActivity,
  departmentWorkflows: state.departmentWorkflows,
  notifications: state.notifications,
  announcements: state.announcements,
  audit: state.audit,
  transactions: state.transactions,
  reports: state.reports,
  messages: state.messages,
  documents: state.documents,
  inventoryMovements: state.inventoryMovements,
  financeLedger: state.financeLedger,
});

const moduleActive = (state, moduleId) => !moduleId || state.enabledModules.length === 0 || state.enabledModules.includes(moduleId);

const appendAudit = (state, action, actor, detail) => {
  const entry = {
    id: makeId("audit"),
    at: nowIso(),
    actor: safeString(actor || "system", 120),
    action: safeString(action, 120),
    detail: asObject(detail),
  };
  state.audit = [entry, ...asArray(state.audit)].slice(0, 1000);
  state.moduleActivity = [
    { id: makeId("act"), at: entry.at, moduleId: detail?.moduleId || detail?.sourceModule || "system", action: entry.action, detail: entry.detail },
    ...asArray(state.moduleActivity),
  ].slice(0, 500);
  return entry;
};

const appendNotification = (state, moduleId, title, body, payload = {}) => {
  const notification = {
    id: makeId("ntf"),
    at: nowIso(),
    moduleId: safeString(moduleId || "admin", 80),
    title: safeString(title, 160),
    body: safeString(body, 500),
    read: false,
    payload: asObject(payload),
  };
  state.notifications = [notification, ...asArray(state.notifications)].slice(0, 1000);
  return notification;
};

const appendMessage = (state, from, to, body, payload = {}) => {
  const message = {
    id: makeId("msg"),
    createdAt: nowIso(),
    moduleId: safeString(from || to || "system", 80),
    from: safeString(from || "system", 80),
    to: safeString(to || "admin", 80),
    body: safeString(body, 800),
    payload: asObject(payload),
  };
  state.messages = [message, ...asArray(state.messages)].slice(0, 1000);
  const workflowState = asObject(state.departmentWorkflows);
  workflowState.messages = [message, ...asArray(workflowState.messages)].slice(0, 1000);
  state.departmentWorkflows = workflowState;
  return message;
};

const writeState = async (store, state, names) => {
  const items = {};
  for (const name of names) items[state.keys[name]] = state[name];
  await store.setManyAtomic(items);
};

const routeWorkflow = async (store, tenantId, body, actor) => {
  const state = await readState(store, tenantId);
  const sourceModule = safeString(body.sourceModule || body.moduleId || "system", 80);
  const targetModule = safeString(body.targetModule || body.target || "admin", 80);
  const title = safeString(body.title || body.label || "Workflow request", 160);
  const detail = safeString(body.detail || body.body || body.note || "", 800);
  const approvalRequired = body.approvalRequired !== false && ["finance", "admin", "director"].includes(targetModule);
  const active = moduleActive(state, targetModule);

  const workflow = {
    id: makeId("wf"),
    tenantId,
    sourceModule,
    targetModule,
    title,
    detail,
    amount: Number(body.amount || 0) || 0,
    status: active ? "sent" : "queued-disabled-module",
    approvalRequired,
    payload: asObject(body.payload),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const workflowState = asObject(state.departmentWorkflows);
  workflowState.workflow = [workflow, ...asArray(workflowState.workflow)].slice(0, 1000);

  if (approvalRequired) {
    workflowState.approvals = [
      {
        id: makeId("app"),
        moduleId: sourceModule,
        source: sourceModule,
        target: targetModule,
        title,
        amount: workflow.amount,
        note: detail,
        status: active ? "pending" : "queued-disabled-module",
        reason: "",
        payload: workflow.payload,
        createdAt: workflow.createdAt,
      },
      ...asArray(workflowState.approvals),
    ].slice(0, 1000);
  }
  state.departmentWorkflows = workflowState;

  appendMessage(state, sourceModule, targetModule, detail || `${title} was routed to ${targetModule}.`, { workflowId: workflow.id });
  appendNotification(state, targetModule, title, detail || `New workflow from ${sourceModule}`, { workflowId: workflow.id, sourceModule });
  appendAudit(state, "workflow.routed", actor, { moduleId: sourceModule, sourceModule, targetModule, title, status: workflow.status });

  await writeState(store, state, ["departmentWorkflows", "messages", "notifications", "audit", "moduleActivity"]);
  const event = await appendEvent(store, tenantId, "erp.workflow.routed", { workflowId: workflow.id, sourceModule, targetModule });
  return { workflow, event, state: publicState(tenantId, state) };
};

const decideApproval = async (store, tenantId, body, actor) => {
  const state = await readState(store, tenantId);
  const approvalId = safeString(body.approvalId || body.id, 120);
  const status = safeString(body.status || "approved", 40);
  if (!approvalId || !["approved", "rejected", "returned", "paid"].includes(status)) {
    const err = new Error("Invalid approval decision");
    err.statusCode = 400;
    throw err;
  }
  const reason =
    safeString(body.reason, 500) ||
    (status === "paid" ? "Payroll approved and paid by Finance." : status === "approved" ? "Approved after review." : status === "returned" ? "Returned for correction." : "Rejected after review.");
  const workflowState = asObject(state.departmentWorkflows);
  let approval = null;
  workflowState.approvals = asArray(workflowState.approvals).map((item) => {
    if (item.id !== approvalId) return item;
    approval = { ...item, status, reason, updatedAt: nowIso(), decidedBy: safeString(actor || "system", 120) };
    return approval;
  });
  if (!approval) {
    const err = new Error("Approval not found");
    err.statusCode = 404;
    throw err;
  }
  state.departmentWorkflows = workflowState;
  appendMessage(state, approval.target, approval.source, `${approval.title} was ${status}. ${reason}`, { approvalId });
  appendNotification(state, approval.source, `Approval ${status}`, `${approval.title}: ${reason}`, { approvalId, status });
  appendAudit(state, `approval.${status}`, actor, { moduleId: approval.target, approvalId, title: approval.title, reason });

  await writeState(store, state, ["departmentWorkflows", "messages", "notifications", "audit", "moduleActivity"]);
  const event = await appendEvent(store, tenantId, "erp.approval.decided", { approvalId, status });
  return { approval, event, state: publicState(tenantId, state) };
};

const postTransaction = async (store, tenantId, body, actor) => {
  const state = await readState(store, tenantId);
  const sourceModule = safeString(body.sourceModule || "sales", 80);
  const type = safeString(body.type || "transaction", 80);
  const amount = Math.max(0, Number(body.amount || body.amountPaid || 0) || 0);
  const quantity = Math.max(0, Number(body.quantity || 1) || 0);
  const itemId = safeString(body.itemId || body.serial || body.sku || "", 160);
  const ref = safeString(body.ref || body.reference || makeId("ref"), 160);
  if (ref && asArray(state.transactions).some((row) => safeString(row.ref, 160).toLowerCase() === ref.toLowerCase())) {
    const err = new Error("Duplicate transaction reference");
    err.statusCode = 409;
    throw err;
  }
  const createdAt = nowIso();
  const transaction = {
    id: makeId("txn"),
    tenantId,
    type,
    sourceModule,
    targetModules: Array.from(new Set(asArray(body.targetModules).map((id) => safeString(id, 80)).filter(Boolean))),
    amount,
    quantity,
    itemId,
    ref,
    customerId: safeString(body.customerId || body.customerPhone || "", 160),
    status: safeString(body.status || "posted", 60),
    payload: asObject(body.payload),
    createdAt,
  };

  state.transactions = [transaction, ...asArray(state.transactions)].slice(0, 2000);

  const financeTypes = new Set(["sale", "pharmacy_sale", "hospital_billing", "restaurant_order", "customer_payment", "subscription_payment", "service_invoice", "delivery_service", "production_order"]);
  if (financeTypes.has(type) || amount > 0) {
    state.financeLedger = [
      {
        id: makeId("ledger"),
        transactionId: transaction.id,
        moduleId: sourceModule,
        ref,
        amount,
        direction: type.includes("refund") ? "out" : "in",
        createdAt,
      },
      ...asArray(state.financeLedger),
    ].slice(0, 2000);
  }

  const shouldReduceStock = ["sale", "pharmacy_sale", "restaurant_order", "production_order"].includes(type);
  const shouldIncreaseStock = ["procurement_delivery", "stock_receipt", "finished_goods_receipt"].includes(type);
  if (itemId && (shouldReduceStock || shouldIncreaseStock)) {
    state.inventoryMovements = [
      {
        id: makeId("mov"),
        transactionId: transaction.id,
        moduleId: sourceModule,
        itemId,
        quantity: shouldReduceStock ? -Math.abs(quantity || 1) : Math.abs(quantity || 1),
        reason: type,
        createdAt,
      },
      ...asArray(state.inventoryMovements),
    ].slice(0, 2000);
  }

  const reports = asObject(state.reports);
  const summary = asObject(reports.summary);
  summary.revenue = Number(summary.revenue || 0) + amount;
  summary.transactions = Number(summary.transactions || 0) + 1;
  summary.lastUpdatedAt = createdAt;
  reports.summary = summary;
  reports[sourceModule] = {
    ...asObject(reports[sourceModule]),
    revenue: Number(asObject(reports[sourceModule]).revenue || 0) + amount,
    transactions: Number(asObject(reports[sourceModule]).transactions || 0) + 1,
    lastUpdatedAt: createdAt,
  };
  state.reports = reports;

  appendNotification(state, "finance", "Transaction posted", `${sourceModule} posted ${type} for ${amount}.`, { transactionId: transaction.id });
  if (state.inventoryMovements[0]?.transactionId === transaction.id) {
    appendNotification(state, "inventory", "Inventory movement", `${sourceModule} posted ${state.inventoryMovements[0].quantity} units for ${itemId}.`, { transactionId: transaction.id });
  }
  appendAudit(state, "transaction.posted", actor, { moduleId: sourceModule, transactionId: transaction.id, type, amount, itemId });

  await writeState(store, state, ["transactions", "financeLedger", "inventoryMovements", "reports", "notifications", "audit", "moduleActivity"]);
  const event = await appendEvent(store, tenantId, "erp.transaction.posted", { transactionId: transaction.id, sourceModule, type });
  return { transaction, event, state: publicState(tenantId, state) };
};

const sendMessage = async (store, tenantId, body, actor) => {
  const state = await readState(store, tenantId);
  const from = safeString(body.from || body.sourceModule || "system", 80);
  const to = safeString(body.to || body.targetModule || "admin", 80);
  const message = appendMessage(state, from, to, safeString(body.body || body.message, 800), asObject(body.payload));
  appendNotification(state, to, `Message from ${from}`, message.body, { messageId: message.id });
  appendAudit(state, "message.sent", actor, { moduleId: from, to, messageId: message.id });
  await writeState(store, state, ["departmentWorkflows", "messages", "notifications", "audit", "moduleActivity"]);
  const event = await appendEvent(store, tenantId, "erp.message.sent", { messageId: message.id, from, to });
  return { message, event, state: publicState(tenantId, state) };
};

const updatePermissions = async (store, tenantId, body, actor) => {
  const state = await readState(store, tenantId);
  const moduleId = safeString(body.moduleId || "admin", 80);
  const permissions = asArray(body.permissions).map((permission) => safeString(permission, 120)).filter(Boolean);
  const settings = asObject(state.settings);
  settings.modulePermissions = asObject(settings.modulePermissions);
  settings.modulePermissions[moduleId] = permissions;
  settings.updatedAt = nowIso();
  state.settings = settings;
  appendNotification(state, "admin", "Permissions updated", `${moduleId} permissions were updated.`, { moduleId, permissions });
  appendAudit(state, "permissions.updated", actor, { moduleId, permissions });
  await writeState(store, state, ["settings", "notifications", "audit", "moduleActivity"]);
  const event = await appendEvent(store, tenantId, "erp.permissions.updated", { moduleId, permissions });
  return { settings, event, state: publicState(tenantId, state) };
};

module.exports = async (req, res) => {
  try {
    rateLimit(req, { scope: "erp", limit: 240, windowMs: 60_000 });
    assertSameOrigin(req);
    const store = getStore();

    if (req.method === "GET") {
      const tenantId = getTenantId(req);
      requireTenantSession(req, tenantId);
      const state = await readState(store, tenantId);
      return sendJson(res, 200, { ok: true, ...publicState(tenantId, state) });
    }

    if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });

    const body = assertObject(await readJsonBody(req));
    assertIdempotent(req, body);
    const tenantId = getTenantId(req, body);
    const session = requireTenantSession(req, tenantId);
    const actor = safeString(body.actor || body.actorName || session.sub || req.headers["x-actor"] || "system", 120);
    const action = safeString(body.action || body.kind || "", 80);

    if (action === "workflow") return sendJson(res, 200, { ok: true, ...(await routeWorkflow(store, tenantId, body, actor)) });
    if (action === "approval") return sendJson(res, 200, { ok: true, ...(await decideApproval(store, tenantId, body, actor)) });
    if (action === "transaction") return sendJson(res, 200, { ok: true, ...(await postTransaction(store, tenantId, body, actor)) });
    if (action === "message") return sendJson(res, 200, { ok: true, ...(await sendMessage(store, tenantId, body, actor)) });
    if (action === "permissions") return sendJson(res, 200, { ok: true, ...(await updatePermissions(store, tenantId, body, actor)) });

    return sendJson(res, 400, { ok: false, error: "Unsupported ERP action" });
  } catch (err) {
    return sendJson(res, Number(err?.statusCode || 500), { ok: false, error: err?.message || "Server error" });
  }
};
