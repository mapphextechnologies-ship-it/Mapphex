const { scopeTenantKey } = require("./tenant");

const ERP_KEYS = Object.freeze({
  settings: "enterprise_org_settings_v1",
  users: "enterprise_org_users_v1",
  moduleRecords: "enterprise_module_records_v1",
  moduleActivity: "enterprise_module_activity_v1",
  departmentWorkflows: "enterprise_department_workflows_v1",
  notifications: "enterprise_notifications_v1",
  audit: "enterprise_audit_v1",
  transactions: "enterprise_transactions_v1",
  reports: "enterprise_reports_v1",
  messages: "enterprise_messages_v1",
  documents: "enterprise_documents_v1",
  inventoryMovements: "enterprise_inventory_movements_v1",
  financeLedger: "enterprise_finance_ledger_v1",
});

const scopedErpKey = (tenantId, key) => scopeTenantKey(tenantId, ERP_KEYS[key] || key);

const scopedErpKeys = (tenantId, keys = Object.keys(ERP_KEYS)) =>
  Object.fromEntries(keys.map((key) => [key, scopedErpKey(tenantId, key)]));

module.exports = {
  ERP_KEYS,
  scopedErpKey,
  scopedErpKeys,
};
