(() => {
  "use strict";

  const LOCAL_STATE_KEY = "enterprise_department_workflows_v1";
  const LOCAL_NOTIFICATIONS_KEY = "enterprise_notifications_v1";
  const LOCAL_AUDIT_KEY = "enterprise_audit_v1";
  const LOCAL_TRANSACTIONS_KEY = "enterprise_transactions_v1";
  const LOCAL_REPORTS_KEY = "enterprise_reports_v1";
  const LOCAL_MESSAGES_KEY = "enterprise_messages_v1";
  const LOCAL_INVENTORY_KEY = "enterprise_inventory_movements_v1";
  const LOCAL_LEDGER_KEY = "enterprise_finance_ledger_v1";

  const nowIso = () => new Date().toISOString();
  const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const asArray = (value) => (Array.isArray(value) ? value : []);
  const asObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

  const store = () => window.EnterpriseStore || null;

  const currentTenantId = () => window.EnterpriseCore?.currentTenantId?.() || "default-company";

  const actorName = () => {
    const session = window.EnterpriseCore?.getSession?.() || {};
    return session.email || session.name || session.username || session.role || "system";
  };

  const apiRequest = async (payload = null) => {
    const init = payload
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ tenantId: currentTenantId(), actor: actorName(), ...payload }),
        }
      : { method: "GET" };
    const res = await fetch("/api/erp", init);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || "ERP service unavailable");
    return data;
  };

  const localGet = (key, fallback) => store()?.getJson?.(key, fallback) ?? fallback;
  const localSet = (key, value) => store()?.setJson?.(key, value);

  const localAudit = (action, detail = {}) => {
    const rows = asArray(localGet(LOCAL_AUDIT_KEY, []));
    const entry = { id: makeId("audit"), at: nowIso(), tenantId: currentTenantId(), actor: actorName(), action, detail };
    localSet(LOCAL_AUDIT_KEY, [entry, ...rows].slice(0, 1000));
    window.EnterpriseCore?.audit?.(action, detail);
    return entry;
  };

  const localNotify = (moduleId, title, body, payload = {}) => {
    const rows = asArray(localGet(LOCAL_NOTIFICATIONS_KEY, []));
    const entry = { id: makeId("ntf"), at: nowIso(), moduleId, title, body, payload, read: false };
    localSet(LOCAL_NOTIFICATIONS_KEY, [entry, ...rows].slice(0, 1000));
    window.EnterpriseCore?.notify?.(title, body);
    return entry;
  };

  const localMessage = ({ from, to, body, payload }) => {
    const message = { id: makeId("msg"), moduleId: from || to || "system", from, to, body, payload: asObject(payload), createdAt: nowIso() };
    const messages = [message, ...asArray(localGet(LOCAL_MESSAGES_KEY, []))].slice(0, 1000);
    localSet(LOCAL_MESSAGES_KEY, messages);
    const state = asObject(localGet(LOCAL_STATE_KEY, {}));
    state.messages = [message, ...asArray(state.messages)].slice(0, 1000);
    localSet(LOCAL_STATE_KEY, state);
    localNotify(to || "admin", `Message from ${from || "system"}`, body, { messageId: message.id });
    localAudit("message.sent", { moduleId: from, to, messageId: message.id });
    return { ok: true, message, state };
  };

  const localWorkflow = ({ sourceModule, moduleId, targetModule, target, title, label, detail, body, amount, payload }) => {
    const source = sourceModule || moduleId || "system";
    const destination = targetModule || target || "admin";
    const workflow = {
      id: makeId("wf"),
      sourceModule: source,
      targetModule: destination,
      moduleId: source,
      label: title || label || "Workflow request",
      title: title || label || "Workflow request",
      detail: detail || body || "",
      target: destination,
      amount: Number(amount || 0) || 0,
      status: "sent",
      createdAt: nowIso(),
      payload: asObject(payload),
    };
    const state = asObject(localGet(LOCAL_STATE_KEY, {}));
    state.workflow = [workflow, ...asArray(state.workflow)].slice(0, 1000);
    if (["finance", "admin", "director"].includes(destination)) {
      state.approvals = [
        {
          id: makeId("app"),
          moduleId: source,
          source,
          target: destination,
          title: workflow.title,
          amount: workflow.amount,
          note: workflow.detail,
          status: "pending",
          reason: "",
          createdAt: workflow.createdAt,
          payload: workflow.payload,
        },
        ...asArray(state.approvals),
      ].slice(0, 1000);
    }
    localSet(LOCAL_STATE_KEY, state);
    localMessage({ from: source, to: destination, body: workflow.detail || workflow.title, payload: { workflowId: workflow.id } });
    localAudit("workflow.routed", { moduleId: source, sourceModule: source, targetModule: destination, title: workflow.title });
    return { ok: true, workflow, state };
  };

  const localApproval = ({ approvalId, id, status = "approved", reason }) => {
    const state = asObject(localGet(LOCAL_STATE_KEY, {}));
    const targetId = approvalId || id;
    let approval = null;
    state.approvals = asArray(state.approvals).map((item) => {
      if (item.id !== targetId) return item;
      approval = {
        ...item,
        status,
        reason: reason || (status === "paid" ? "Payroll approved and paid by Finance." : status === "approved" ? "Approved after review." : status === "returned" ? "Returned for correction." : "Rejected after review."),
        updatedAt: nowIso(),
      };
      return approval;
    });
    localSet(LOCAL_STATE_KEY, state);
    if (approval) {
      localMessage({ from: approval.target, to: approval.source, body: `${approval.title} was ${status}. ${approval.reason}`, payload: { approvalId: targetId } });
      localAudit(`approval.${status}`, { moduleId: approval.target, approvalId: targetId, title: approval.title });
    }
    return { ok: true, approval, state };
  };

  const localTransaction = (payload = {}) => {
    const transaction = {
      id: makeId("txn"),
      tenantId: currentTenantId(),
      type: payload.type || "transaction",
      sourceModule: payload.sourceModule || "sales",
      amount: Math.max(0, Number(payload.amount || payload.amountPaid || 0) || 0),
      quantity: Math.max(0, Number(payload.quantity || 1) || 0),
      itemId: payload.itemId || payload.serial || payload.sku || "",
      ref: payload.ref || payload.reference || makeId("ref"),
      customerId: payload.customerId || payload.customerPhone || "",
      status: payload.status || "posted",
      payload: asObject(payload.payload),
      createdAt: nowIso(),
    };
    localSet(LOCAL_TRANSACTIONS_KEY, [transaction, ...asArray(localGet(LOCAL_TRANSACTIONS_KEY, []))].slice(0, 2000));
    localSet(LOCAL_LEDGER_KEY, [{ id: makeId("ledger"), transactionId: transaction.id, moduleId: transaction.sourceModule, amount: transaction.amount, createdAt: transaction.createdAt }, ...asArray(localGet(LOCAL_LEDGER_KEY, []))].slice(0, 2000));
    if (transaction.itemId && ["sale", "pharmacy_sale", "restaurant_order"].includes(transaction.type)) {
      localSet(LOCAL_INVENTORY_KEY, [{ id: makeId("mov"), transactionId: transaction.id, itemId: transaction.itemId, quantity: -Math.abs(transaction.quantity || 1), createdAt: transaction.createdAt }, ...asArray(localGet(LOCAL_INVENTORY_KEY, []))].slice(0, 2000));
    }
    const reports = asObject(localGet(LOCAL_REPORTS_KEY, {}));
    reports.summary = {
      ...asObject(reports.summary),
      revenue: Number(asObject(reports.summary).revenue || 0) + transaction.amount,
      transactions: Number(asObject(reports.summary).transactions || 0) + 1,
      lastUpdatedAt: transaction.createdAt,
    };
    localSet(LOCAL_REPORTS_KEY, reports);
    localNotify("finance", "Transaction posted", `${transaction.sourceModule} posted ${transaction.type} for ${transaction.amount}.`, { transactionId: transaction.id });
    localAudit("transaction.posted", { moduleId: transaction.sourceModule, transactionId: transaction.id, amount: transaction.amount });
    return { ok: true, transaction };
  };

  const call = async (payload, fallback) => {
    try {
      return await apiRequest(payload);
    } catch (error) {
      const result = fallback();
      result.offline = true;
      result.error = error.message;
      await store()?.flush?.().catch(() => null);
      return result;
    }
  };

  const getState = async () => {
    try {
      return await apiRequest(null);
    } catch {
      return {
        ok: true,
        offline: true,
        tenantId: currentTenantId(),
        departmentWorkflows: localGet(LOCAL_STATE_KEY, {}),
        notifications: localGet(LOCAL_NOTIFICATIONS_KEY, []),
        audit: localGet(LOCAL_AUDIT_KEY, []),
        transactions: localGet(LOCAL_TRANSACTIONS_KEY, []),
        reports: localGet(LOCAL_REPORTS_KEY, {}),
        messages: localGet(LOCAL_MESSAGES_KEY, []),
        inventoryMovements: localGet(LOCAL_INVENTORY_KEY, []),
        financeLedger: localGet(LOCAL_LEDGER_KEY, []),
      };
    }
  };

  const api = Object.freeze({
    getState,
    sendWorkflow: (payload) => call({ action: "workflow", ...payload }, () => localWorkflow(payload)),
    decideApproval: (payload) => call({ action: "approval", ...payload }, () => localApproval(payload)),
    postTransaction: (payload) => call({ action: "transaction", ...payload }, () => localTransaction(payload)),
    sendMessage: (payload) => call({ action: "message", ...payload }, () => localMessage(payload)),
    updatePermissions: (payload) => call({ action: "permissions", ...payload }, () => {
      localAudit("permissions.updated", { moduleId: payload?.moduleId, permissions: payload?.permissions || [] });
      return { ok: true };
    }),
    notify: localNotify,
    audit: localAudit,
  });

  Object.defineProperty(window, "ERPClient", {
    value: api,
    writable: false,
    enumerable: false,
    configurable: false,
  });
})();
