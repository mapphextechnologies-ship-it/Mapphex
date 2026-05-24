(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

  const ORGS_KEY = "platform_organizations_v1";
  const SETTINGS_KEY = "enterprise_org_settings_v1";
  const USERS_KEY = "enterprise_org_users_v1";
  const MODULE_DATA_KEY = "enterprise_module_records_v1";
  const ACTIVITY_KEY = "enterprise_module_activity_v1";
  const ERP_STATE_KEY = "enterprise_department_workflows_v1";
  const TRANSACTIONS_KEY = "enterprise_transactions_v1";
  const REPORTS_KEY = "enterprise_reports_v1";
  const MODULE_PREFS_KEY = "enterprise_module_preferences_v1";

  const PORTAL_CATALOG = window.EnterpriseModules?.catalog || [];
  const VALID_PORTAL_IDS = window.EnterpriseModules?.validIds || new Set(PORTAL_CATALOG.map((portal) => portal.id));
  const store = () => window.EnterpriseStore || null;
  let orgContext = { businessType: "general", settings: {}, organization: {} };
  let activeModuleId = "";

  const currentModuleView = () => {
    const params = new URLSearchParams(location.search);
    return String(params.get("view") || location.hash.replace(/^#/, "") || "dashboard").trim().toLowerCase() || "dashboard";
  };

  const moduleViewUrl = (view) => {
    const next = new URL(location.href);
    next.searchParams.set("view", view || "dashboard");
    next.hash = view || "dashboard";
    return `${next.pathname}${next.search}${next.hash}`;
  };

  const redirectFinanceModule = () => {
    const params = new URLSearchParams(location.search);
    const moduleId = String(params.get("portal") || params.get("module") || "").trim().toLowerCase();
    if (moduleId !== "finance") return false;
    const section = String(location.hash || "").replace(/^#/, "").trim().toLowerCase();
    const pages = {
      approvals: "finance-approvals.html",
      budgets: "finance-budgets.html",
      employees: "finance-employees.html",
      export: "finance-export.html",
      invoices: "finance-invoices.html",
      ledger: "finance-ledger.html",
      payroll: "finance-payroll.html",
      reports: "finance-reports.html",
      settings: "finance-settings.html",
      suppliers: "finance-suppliers.html",
    };
    const target = pages[section] || "finance-workflow.html";
    const next = new URL(target, location.href);
    const tenant = params.get("tenant") || window.EnterpriseCore?.currentTenantId?.() || "";
    if (tenant) next.searchParams.set("tenant", tenant);
    location.replace(`${next.pathname}${next.search}${next.hash}`);
    return true;
  };

  if (redirectFinanceModule()) return;

  const readJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const isLocalDevelopment = () => ["localhost", "127.0.0.1", ""].includes(location.hostname);

  const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value ?? null));
  const storeGet = (key, fallback) => store()?.getJson?.(key, null) ?? (isLocalDevelopment() ? readJson(key, fallback) : fallback);
  const storeSet = (key, value) => {
    if (isLocalDevelopment()) writeJson(key, value);
    store()?.setJson?.(key, value);
  };

  const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
  const nowIso = () => new Date().toISOString();
  const humanDate = (value) => new Date(value || Date.now()).toLocaleString();
  const REPORT_PERIODS = ["daily", "weekly", "monthly", "yearly"];

  const defaultBlueprint = {
    kpis: [],
    chart: [18, 24, 32, 40, 48, 56],
    actions: [],
    approvals: [],
    reports: ["Dashboard", "Workflow", "Approvals", "Activity", "Audit trail", "Exports"],
    responsibilities: ["Manage records", "Route approvals", "Track dashboards", "Send messages", "Export reports", "Maintain audit trail"],
  };

  const fetchJson = async (url) => {
    const res = await fetch(url);
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("Service returned an invalid response");
    }
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Request failed");
    return data;
  };

  const localOrg = (tenant) => {
    const rows = readJson(ORGS_KEY, []);
    return (Array.isArray(rows) ? rows : []).find((row) => row.id === tenant) || null;
  };

  const enrichPortal = (portal) => ({ ...(window.EnterpriseModules?.get?.(portal?.id) || {}), ...(portal || {}) });

  const STANDARD_MODULES = {
    branch: {
      entity: "Branch Record",
      form: ["Branch", "Manager", "Region", "Status"],
      responsibilities: ["Approve branch accounts", "Maintain branch records", "Track local teams", "Review branch activity", "Coordinate branch reports", "Keep operational status current"],
      reports: ["Branch directory", "Pending approvals", "Active branches", "Branch activity", "Operations summary"],
      workflows: [["Add branch record", "admin"], ["Review branch account", "admin"], ["Send branch update", "staff"], ["Export branch report", "reporting"]],
    },
    hr: {
      entity: "Employee",
      form: ["Employee", "Department", "Salary", "Payroll Status"],
      responsibilities: ["Employee management", "Recruitment", "Attendance", "Leave requests", "Payroll preparation", "Promotions", "Employee documents", "Work schedules", "Performance reviews", "Training management", "Department assignments"],
      reports: ["Employee register", "Attendance", "Leave", "Payroll preparation", "Payslips", "Payroll history", "Tax deductions", "Approval logs", "Recruitment", "Performance", "Training"],
      workflows: [["Forward payroll to Finance", "finance"], ["Request role access", "admin"], ["Start recruitment", "department"], ["Schedule training", "staff"]],
    },
    finance: {
      entity: "Transaction",
      form: ["What happened", "Money type", "Amount", "Paid or waiting"],
      responsibilities: ["Money In", "Money Out", "Sales", "Expenses", "Payments", "Reports", "Activity"],
      reports: ["Daily report", "Weekly report", "Monthly report", "Sales", "Expenses", "Payments"],
      workflows: [["Add sale", "sales"], ["Add expense", "finance"], ["Add product", "inventory"], ["Generate report", "reporting"]],
    },
    sales: {
      entity: "Sales Order",
      form: ["Customer", "Item / Service", "Purpose / Delivery", "Amount", "Invoice Status"],
      responsibilities: ["Orders", "Customers", "Quotations", "Product sales", "Discounts", "Invoices", "Revenue tracking", "Sales reports", "Customer history"],
      reports: ["Orders", "Quotations", "Invoices", "Revenue", "Discounts", "Customer history"],
      workflows: [["Create order", "inventory"], ["Send invoice", "finance"], ["Request discount approval", "finance"], ["Submit sales report", "reporting"]],
    },
    inventory: {
      entity: "Stock Item",
      form: ["Item", "Warehouse/Branch", "Movement", "Quantity"],
      responsibilities: ["Stock management", "Warehouses", "Product movement", "Low stock alerts", "Transfers", "Supplier stock", "Batch tracking", "Product categories"],
      reports: ["Stock levels", "Warehouses", "Movement", "Transfers", "Low stock", "Batch tracking"],
      workflows: [["Create low stock alert", "procurement"], ["Receive delivery", "procurement"], ["Transfer stock", "branch"], ["Report stock variance", "finance"]],
    },
    procurement: {
      entity: "Purchase Request",
      form: ["Request", "Supplier", "Amount", "Approval Status"],
      responsibilities: ["Suppliers", "Purchase requests", "Purchase approvals", "Orders", "Deliveries", "Procurement reports"],
      reports: ["Suppliers", "Purchase requests", "Purchase orders", "Deliveries", "Approvals"],
      workflows: [["Create purchase request", "finance"], ["Issue purchase order", "supplier"], ["Confirm delivery", "inventory"], ["Submit procurement report", "reporting"]],
    },
    technology: {
      entity: "Technology Work",
      form: ["Project/Service", "Client", "Status", "Billing"],
      responsibilities: ["Projects", "Developers", "Tasks", "Clients", "IT support", "Software services", "Bug tracking", "Technical documentation", "Team collaboration"],
      reports: ["Projects", "Tasks", "Bugs", "Support tickets", "Deployments", "Documentation", "Billing"],
      workflows: [["Create project", "staff"], ["Open support ticket", "customer"], ["Track deployment", "finance"], ["Update documentation", "reporting"]],
    },
    customer: {
      entity: "Support Ticket",
      form: ["Customer", "Issue", "Priority", "Status"],
      responsibilities: ["Tickets", "Complaints", "Customer communication", "Support tracking", "Issue escalation", "Service analytics"],
      reports: ["Tickets", "Complaints", "Escalations", "Feedback", "Service analytics"],
      workflows: [["Open ticket", "sales"], ["Escalate issue", "admin"], ["Request refund approval", "finance"], ["Submit feedback analytics", "reporting"]],
    },
    pharmacy: {
      entity: "Pharmacy Record",
      form: ["Medicine/Item", "Batch", "Expiry/Status", "Stock/Action"],
      responsibilities: ["Medicine inventory", "Prescriptions", "Customers", "Suppliers", "Sales", "Expiry alerts", "Returns", "Regulated reports"],
      reports: ["Medicine stock", "Expiry alerts", "Prescriptions", "Supplier activity", "Sales", "Returns"],
      workflows: [["Dispense prescription", "finance"], ["Create expiry alert", "inventory"], ["Request medicine stock", "procurement"], ["Submit pharmacy sales", "reporting"]],
    },
    hospital: {
      entity: "Patient Service",
      form: ["Patient", "Service", "Clinician", "Billing Status"],
      responsibilities: ["Patient records", "Appointments", "Doctor schedules", "Prescriptions", "Billing", "Laboratory reports", "Nurse management", "Emergency records"],
      reports: ["Patients", "Appointments", "Prescriptions", "Billing", "Laboratory", "Emergency"],
      workflows: [["Create patient bill", "finance"], ["Issue prescription", "pharmacy"], ["Request stock", "procurement"], ["Submit hospital report", "reporting"]],
    },
    academic: {
      entity: "Academic Record",
      form: ["Student/Class", "Activity", "Fee/Attendance", "Status"],
      responsibilities: ["Student registration", "Fee tracking", "Attendance", "Exam management", "Results", "Timetables", "Teacher management", "Parent communication"],
      reports: ["Students", "Fees", "Attendance", "Exams", "Results", "Timetables"],
      workflows: [["Register student billing", "finance"], ["Assign teacher", "hr"], ["Publish results", "reporting"], ["Request fee approval", "finance"]],
    },
    restaurant: {
      entity: "Restaurant Order",
      form: ["Order/Table", "Menu Item", "Kitchen Status", "Payment"],
      responsibilities: ["Orders", "Kitchen dashboard", "Table reservations", "Menu management", "Staff management", "Sales reports", "Customer order tracking"],
      reports: ["Orders", "Kitchen", "Reservations", "Menu", "Sales", "Staff"],
      workflows: [["Close bill", "finance"], ["Deduct ingredients", "inventory"], ["Request stock", "procurement"], ["Submit restaurant sales", "reporting"]],
    },
    "real-estate": {
      entity: "Property Record",
      form: ["Property", "Tenant/Client", "Payment/Maintenance", "Status"],
      responsibilities: ["Property listings", "Tenant management", "Rent tracking", "Maintenance requests", "Property analytics", "Payment records"],
      reports: ["Properties", "Tenants", "Rent", "Maintenance", "Payments", "Analytics"],
      workflows: [["Record rent", "finance"], ["Open maintenance", "procurement"], ["Escalate tenant issue", "customer"], ["Submit property report", "reporting"]],
    },
    retail: {
      entity: "Retail Transaction",
      form: ["Sale/Return", "Register", "Amount", "Stock Impact"],
      responsibilities: ["POS operations", "Product catalog", "Customer purchases", "Returns", "Discounts", "Register close", "Shelf stock"],
      reports: ["POS sales", "Returns", "Discounts", "Register close", "Stock variance"],
      workflows: [["Post POS sale", "finance"], ["Deduct stock", "inventory"], ["Process return", "customer"], ["Submit retail report", "reporting"]],
    },
    manufacturing: {
      entity: "Production Order",
      form: ["Production Order", "Work Center", "Material Status", "Quality"],
      responsibilities: ["Production orders", "Bills of materials", "Work centers", "Raw material usage", "Finished goods", "Quality checks", "Production costing"],
      reports: ["Production orders", "BOM", "Materials", "Work centers", "Quality", "Costing"],
      workflows: [["Issue raw materials", "inventory"], ["Request materials", "procurement"], ["Receive finished goods", "inventory"], ["Post production cost", "finance"]],
    },
    logistics: {
      entity: "Shipment",
      form: ["Shipment", "Fleet/Driver", "Route", "Status"],
      responsibilities: ["Dispatch", "Shipments", "Routes", "Fleet", "Delivery confirmations", "Exceptions", "Delivery costing"],
      reports: ["Shipments", "Dispatch", "Fleet", "Routes", "Exceptions", "Delivery costs"],
      workflows: [["Create shipment", "inventory"], ["Confirm delivery", "sales"], ["Escalate exception", "customer"], ["Post delivery cost", "finance"]],
    },
  };

  const standardFor = (moduleId) => STANDARD_MODULES[moduleId] || {
    entity: "Record",
    form: ["Record", "Owner", "Status", "Next Action"],
    responsibilities: defaultBlueprint.responsibilities,
    reports: defaultBlueprint.reports,
    workflows: [["Create record", "admin"], ["Request approval", "finance"], ["Send update", "staff"], ["Export report", "reporting"]],
  };

  const countRows = (moduleId) => (Array.isArray(moduleData()[moduleId]) ? moduleData()[moduleId].length : 0);

  const blueprintFor = (moduleId) => {
    const standard = standardFor(moduleId);
    const state = erpState();
    const reports = storeGet(REPORTS_KEY, {});
    const transactions = storeGet(TRANSACTIONS_KEY, []);
    const rows = countRows(moduleId);
    const salesRows = Array.isArray(moduleData().sales) ? moduleData().sales : [];
    const pending = (state.approvals || []).filter((item) => (item.target === moduleId || item.moduleId === moduleId) && item.status === "pending").length;
    const moduleTransactions = (Array.isArray(transactions) ? transactions : []).filter((tx) => tx.sourceModule === moduleId).length;
    const revenue = moduleId === "sales"
      ? salesRows.reduce((sum, row) => sum + (Number(String(row.values?.[3] || "").replace(/[^\d.-]/g, "")) || 0), 0)
      : Number(reports?.[moduleId]?.revenue || 0);
    return {
      kpis: [
        [moduleId === "finance" ? "Activity" : standard.entity === "Finance Record" ? "Transactions" : `${standard.entity}s`, rows],
        [moduleId === "finance" ? "Pending Payments" : "Pending approvals", pending],
        [moduleId === "finance" ? "Payments" : "Posted transactions", moduleTransactions],
        [moduleId === "sales" ? "Total revenue" : revenue > 0 ? "Revenue" : "Reports", moduleId === "sales" || revenue > 0 ? revenue : standard.reports.length],
      ],
      chart: [24, 36, 48, 60, 72, Math.min(96, 72 + rows + pending + moduleTransactions)],
      actions: standard.workflows.map(([label, target]) => [label, target, `${moduleId} requested ${label.toLowerCase()} for ${orgContext.businessType || "general"} operations.`]),
      approvals: [],
      reports: standard.reports,
      responsibilities: standard.responsibilities,
      form: standard.form,
      entity: standard.entity,
    };
  };

  const workflowFor = (moduleId) => {
    const standard = standardFor(moduleId);
    const custom = orgContext.settings?.moduleSchemas?.[moduleId];
    const labels = Array.isArray(custom?.labels) && custom.labels.length ? custom.labels : standard.form;
    return {
      title: moduleId === "finance" ? "Transactions" : `${standard.entity} Management`,
      labels,
      sample: labels.map(() => ""),
    };
  };

  const PORTAL_MENUS = {
    branch: ["Dashboard", "Branch Accounts", "Branch Records", "Approvals", "Reports", "Activity"],
    finance: ["Dashboard", "Invoices", "Approvals", "Suppliers", "Budgets", "Employees", "Payroll", "Ledger", "Reports", "Export", "Settings"],
    hr: ["Dashboard", "Employees", "Attendance", "Leave Requests", "Payroll", "Recruitment", "Performance", "Schedules", "Reports"],
    pharmacy: ["Dashboard", "Medicines", "Inventory", "Prescriptions", "Customers", "Suppliers", "Sales", "Expiry Alerts", "Reports"],
    technology: ["Dashboard", "Projects", "Tasks", "Clients", "Developers", "Support Tickets", "Documentation", "Billing", "Analytics"],
    sales: ["Dashboard", "Orders", "Products", "Customers", "Discounts", "Reports", "Revenue", "Settings"],
    inventory: ["Dashboard", "Stock", "Warehouses", "Transfers", "Suppliers", "Alerts", "Reports"],
    procurement: ["Dashboard", "Suppliers", "Purchase Requests", "Approvals", "Purchase Orders", "Deliveries", "Reports"],
    customer: ["Dashboard", "Tickets", "Complaints", "Live Chat", "Escalations", "Feedback", "Reports"],
    academic: ["Dashboard", "Students", "Fees", "Attendance", "Exams", "Results", "Timetables", "Parents", "Reports"],
    hospital: ["Dashboard", "Patients", "Appointments", "Doctors", "Prescriptions", "Billing", "Laboratory", "Emergency", "Reports"],
    restaurant: ["Dashboard", "Orders", "Kitchen", "Reservations", "Menu", "Inventory", "Staff", "Sales", "Reports"],
    "real-estate": ["Dashboard", "Properties", "Tenants", "Rent", "Maintenance", "Payments", "Analytics", "Reports"],
    logistics: ["Dashboard", "Shipments", "Dispatch", "Fleet", "Routes", "Deliveries", "Exceptions", "Reports"],
    retail: ["Dashboard", "POS", "Products", "Customers", "Returns", "Discounts", "Stock", "Reports"],
    manufacturing: ["Dashboard", "Production Orders", "BOM", "Work Centers", "Materials", "Quality", "Finished Goods", "Costing", "Reports"],
    reporting: ["Dashboard", "Operational Reports", "Finance Reports", "Audit Reports", "Exports", "Analytics", "Settings"],
  };

  const SALES_REPORT_TYPES = ["Orders", "Quotations", "Invoices", "Revenue", "Discounts", "Customer history"];

  const menuItemsFor = (moduleId, moduleDef) => {
    if (moduleId === "branch") {
      return [
        ["Main", "Dashboard", "dashboard", "dashboard", "D"],
        ["Branch", "Branch Accounts", "approvals", "accounts", "A"],
        ["Branch", "Branch Records", "portal-records", "records", "R"],
        ["Workflow", "Approvals", "approvals", "approvals", "P"],
        ["Insights", "Reports", "reports", "reports", "S"],
        ["Insights", "Activity", "reports", "activity", "T"],
      ].map(([group, label, target, hash, icon]) => ({ group, label, target, hash, icon }));
    }
    if (moduleId === "finance") {
      return [
        ["Main", "Dashboard", "dashboard", "dashboard", "D", ""],
        ["Finance", "Invoices", "finance-invoices-page", "invoices", "I", "3"],
        ["Finance", "Approvals", "approvals", "approvals", "A", "4"],
        ["Finance", "Suppliers", "finance-suppliers-page", "suppliers", "S", ""],
        ["Finance", "Budgets", "finance-budgets-page", "budgets", "B", ""],
        ["People", "Employees", "finance-employees-page", "employees", "E", ""],
        ["People", "Payroll", "finance-payroll-page", "payroll", "P", "!"],
        ["Accounting", "Ledger", "portal-records", "ledger", "L", ""],
        ["Accounting", "Reports", "reports", "reports", "R", ""],
        ["Tools", "Export", "finance-export-page", "export", "X", ""],
        ["Tools", "Settings", "finance-settings", "settings", "*", ""],
      ].map(([group, label, target, hash, icon, badge]) => ({
        group,
        label,
        target,
        hash,
        icon,
        badge,
      }));
    }
    const blueprint = blueprintFor(moduleId);
    const base = PORTAL_MENUS[moduleId] || ["Dashboard", blueprint.title || "Records", "Approvals", "Messages", "Reports", "Activity", "Settings"];
    const groupFor = (label, idx) => {
      if (idx === 0) return "Main";
      if (/approval|payroll|leave|ticket|complaint|escalation|alert|request/i.test(label)) return "Workflow";
      if (/report|tax|analytic|revenue|budget|expense|transaction|billing|cost|sales|fees|payments/i.test(label)) return "Insights";
      if (/setting|export|activity|audit/i.test(label)) return "Tools";
      if (/employee|student|patient|customer|tenant|parent|staff|doctor|developer|client/i.test(label)) return "People";
      return "Operations";
    };
    return base.map((label, idx) => {
      const hash = idx === 0 ? "dashboard" : label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "records";
      const target = idx === 0
        ? "dashboard"
        : /approval|payroll/i.test(label)
          ? "approvals"
          : moduleId === "sales" && /revenue/i.test(label)
            ? `module-page:${hash}`
          : /report|tax|analytic|revenue|budget|expense|transaction|billing|cost/i.test(label)
            ? "reports"
            : `module-page:${hash}`;
      return {
        group: groupFor(label, idx),
        label,
        target,
        hash,
        icon: (label || moduleDef?.title || "M").slice(0, 1).toUpperCase(),
      };
    });
  };

  const DEFAULT_PORTAL_VIEW_GROUPS = {
    dashboard: ["portal-dashboard", "portal-kpis", "dashboard"],
    "portal-records": ["portal-records"],
    approvals: ["approvals"],
    reports: ["reports"],
    "module-page": ["module-detail-page"],
    logout: [],
  };

  const FINANCE_PORTAL_VIEW_GROUPS = {
    dashboard: ["finance-dashboard"],
    "portal-records": ["portal-records"],
    approvals: ["approvals"],
    reports: ["reports"],
    "finance-invoices-page": ["finance-invoices-page"],
    "finance-suppliers-page": ["finance-suppliers-page"],
    "finance-budgets-page": ["finance-budgets-page"],
    "finance-employees-page": ["finance-employees-page"],
    "finance-payroll-page": ["finance-payroll-page"],
    "finance-export-page": ["finance-export-page"],
    "finance-settings": ["finance-settings"],
    logout: [],
  };

  const setPortalView = (target = "dashboard") => {
    const branchViewGroups = {
      dashboard: ["portal-dashboard", "portal-kpis", "branch-management-overview"],
      "portal-records": ["portal-records"],
      approvals: ["approvals"],
      reports: ["reports"],
      logout: [],
    };
    const viewGroups =
      activeModuleId === "branch"
        ? branchViewGroups
        : activeModuleId === "finance"
          ? FINANCE_PORTAL_VIEW_GROUPS
          : DEFAULT_PORTAL_VIEW_GROUPS;
    const normalizedTarget = String(target || "dashboard").startsWith("module-page:") ? "module-page" : target;
    const group =
      viewGroups[normalizedTarget] ||
      viewGroups["portal-records"] ||
      viewGroups.dashboard ||
      [];
    const visible = new Set(group);
    const managedIds = new Set([
      "portal-dashboard",
      "portal-kpis",
      "branch-management-overview",
      "portal-records",
      "dashboard",
      "finance-actions-panel",
      "approvals",
      "reports",
      "module-detail-page",
      "finance-guide",
      "finance-dashboard",
      "finance-invoices-page",
      "finance-suppliers-page",
      "finance-budgets-page",
      "finance-employees-page",
      "finance-payroll-page",
      "finance-export-page",
      "finance-settings",
      ...Array.from(document.querySelectorAll(".module-content > section[id], #erp-sections > section[id]")).map((section) => section.id),
    ]);
    managedIds.forEach((id) => {
      const section = document.getElementById(id);
      if (section) section.hidden = !visible.has(id);
    });
  };

  const hydrateSharedData = async () => {
    const shared = store();
    if (!shared?.bootstrap) return;
    await shared.bootstrap([MODULE_DATA_KEY, ACTIVITY_KEY, ERP_STATE_KEY, TRANSACTIONS_KEY, REPORTS_KEY, MODULE_PREFS_KEY]).catch(() => null);
    const remote = await window.ERPClient?.getState?.().catch(() => null);
    if (remote?.departmentWorkflows) storeSet(ERP_STATE_KEY, remote.departmentWorkflows);
    if (remote?.moduleRecords) storeSet(MODULE_DATA_KEY, remote.moduleRecords);
    if (remote?.moduleActivity) storeSet(ACTIVITY_KEY, remote.moduleActivity);
    if (remote?.transactions) storeSet(TRANSACTIONS_KEY, remote.transactions);
    if (remote?.reports) storeSet(REPORTS_KEY, remote.reports);
  };

  const moduleData = () => storeGet(MODULE_DATA_KEY, {});
  const saveModuleData = (data) => storeSet(MODULE_DATA_KEY, data);
  const modulePrefs = () => storeGet(MODULE_PREFS_KEY, {});
  const saveModulePrefs = (data) => storeSet(MODULE_PREFS_KEY, data);
  const erpState = () => storeGet(ERP_STATE_KEY, {});
  const saveErpState = (data) => storeSet(ERP_STATE_KEY, data);

  const resetSalesRecordsOnce = (tenantId) => {
    const key = `sales_records_reset_v2:${tenantId || "default"}`;
    try {
      if (localStorage.getItem(key) === "done") return;
    } catch {
      // Storage can be blocked; still clear stale in-memory records for this session.
    }
    const data = moduleData();
    if (Array.isArray(data.sales) && data.sales.length) {
      data.sales = [];
      saveModuleData(data);
    }
    try {
      localStorage.setItem(key, "done");
    } catch {
      // Ignore blocked storage.
    }
  };

  const appendActivity = (moduleId, action, detail = {}) => {
    const rows = Array.isArray(storeGet(ACTIVITY_KEY, [])) ? storeGet(ACTIVITY_KEY, []) : [];
    const entry = { id: `act-${Date.now()}-${Math.random().toString(16).slice(2)}`, moduleId, action, detail, at: nowIso() };
    rows.unshift(entry);
    storeSet(ACTIVITY_KEY, rows.slice(0, 500));
    window.EnterpriseCore?.audit?.(action, { moduleId, ...detail });
    window.EnterpriseCore?.notify?.("Workflow updated", `${action} in ${moduleId}`);
    return entry;
  };

  const ensurePortalState = (moduleId) => {
    const state = erpState();
    if (!state.approvals) state.approvals = [];
    if (!state.messages) state.messages = [];
    if (!state.workflow) state.workflow = [];
    saveErpState(state);
    return state;
  };

  const renderNav = (moduleId, moduleDef) => {
    const items = menuItemsFor(moduleId, moduleDef);
    $("#module-sidebar-title").textContent = `${moduleDef.title} Menu`;
    const navCount = (item) => {
      if (item.badge) return item.badge;
      const state = ensurePortalState(moduleId);
      const records = Array.isArray(moduleData()[moduleId]) ? moduleData()[moduleId] : [];
      const hash = String(item.hash || "");
      const label = String(item.label || "").toLowerCase();
      if (hash === "dashboard") return records.length;
      if (item.target === "approvals") return (state.approvals || []).filter((row) => row.status === "pending").length;
      if (item.target === "reports") return blueprintFor(moduleId).reports.length;
      if (/setting/.test(label)) return "";
      if (/revenue/.test(label)) return records.filter((row) => /\d/.test((row.values || []).join(" "))).length;
      const matching = records.filter((row) => (row.values || []).join(" ").toLowerCase().includes(label));
      return matching.length || 0;
    };
    const groupOrder = ["Main", "Finance", "Branch", "Operations", "People", "Workflow", "Accounting", "Insights", "Tools"];
    const groups = items.reduce((list, item) => {
      const label = item.group || "Menu";
      let group = list.find((entry) => entry.label === label);
      if (!group) {
        group = { label, items: [] };
        list.push(group);
      }
      group.items.push(item);
      return list;
    }, []).sort((a, b) => {
      const aIdx = groupOrder.includes(a.label) ? groupOrder.indexOf(a.label) : 99;
      const bIdx = groupOrder.includes(b.label) ? groupOrder.indexOf(b.label) : 99;
      return aIdx - bIdx;
    });
    $("#module-nav").innerHTML = groups
      .map(
        (group) => `<div class="module-nav-group"><strong>${escapeHtml(group.label)}</strong>${group.items
          .map((item) => `<a class="${item.hash === "dashboard" ? "active" : ""}" href="${escapeHtml(moduleViewUrl(item.hash))}" data-module-nav="${escapeHtml(item.hash)}" data-module-target="${escapeHtml(item.target)}" data-module-label="${escapeHtml(item.label)}"><span><b aria-hidden="true">${escapeHtml(item.icon)}</b>${escapeHtml(item.label)}</span><small${item.badge ? ` class="nav-badge"` : ""}>${escapeHtml(navCount(item))}</small></a>`)
          .join("")}</div>`,
      )
      .join("");
  };

  const setMenuOpen = (open) => {
    const sidebar = $("#module-sidebar");
    const backdrop = $("#module-menu-backdrop");
    const mobile = window.matchMedia("(max-width: 980px)").matches;
    if (mobile) {
      const shouldOpen = !!open;
      sidebar?.classList.toggle("is-open", shouldOpen);
      document.body.classList.toggle("module-menu-open", shouldOpen);
      backdrop?.setAttribute("aria-hidden", shouldOpen ? "false" : "true");
      sidebar?.setAttribute("aria-hidden", shouldOpen ? "false" : "true");
    } else {
      sidebar?.classList.toggle("is-collapsed", !!open);
      document.body.classList.remove("module-menu-open");
      backdrop?.setAttribute("aria-hidden", "true");
      sidebar?.setAttribute("aria-hidden", "false");
    }
    $("#module-menu-toggle")?.setAttribute("aria-expanded", String(mobile ? open : !sidebar?.classList.contains("is-collapsed")));
  };

  const closeMobileMenu = () => {
    if (window.matchMedia("(max-width: 980px)").matches) setMenuOpen(false);
  };

  const setActivePortalNav = (view = currentModuleView()) => {
    const current = String(view || "dashboard").replace(/^#/, "");
    let target = "dashboard";
    let activeLink = null;
    document.querySelectorAll("[data-module-nav]").forEach((link) => {
      const active = link.dataset.moduleNav === current || (!view && link.dataset.moduleNav === "dashboard");
      link.classList.toggle("active", active);
      if (active) {
        target = link.dataset.moduleTarget || "dashboard";
        activeLink = link;
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
    setPortalView(target);
    if (String(target).startsWith("module-page:")) renderModuleDetailPage(activeModuleId, blueprintFor(activeModuleId), activeLink);
  };

  const renderModuleDetailPage = (moduleId, moduleDef, link) => {
    const page = $("#module-detail-page");
    if (!page || !link) return;
    const label = link.dataset.moduleLabel || "Records";
    const hash = link.dataset.moduleNav || label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const workflow = workflowFor(moduleId);
    const rows = Array.isArray(moduleData()[moduleId]) ? moduleData()[moduleId] : [];
    const matchingRows = rows.filter((row) => {
      const text = (row.values || []).join(" ").toLowerCase();
      return text.includes(label.toLowerCase()) || text.includes(hash.replace(/-/g, " "));
    });
    const displayRows = (matchingRows.length ? matchingRows : rows).slice(0, 8);
    const rowsHtml = displayRows.length
      ? displayRows
          .map(
            (row) => `<tr>${workflow.labels
              .map((field, idx) => `<td data-label="${escapeHtml(field)}">${escapeHtml(row.values?.[idx] || "-")}</td>`)
              .join("")}<td data-label="Updated">${escapeHtml(humanDate(row.updatedAt))}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="${workflow.labels.length + 1}" class="muted">No ${escapeHtml(label.toLowerCase())} records yet.</td></tr>`;
    const actionCopy = {
      orders: "Track who ordered, what they are buying, where it is going, amount, and invoice status.",
      products: "Keep products, pricing, and sales items easy to review.",
      customers: "Review customer records and sales history.",
      discounts: "See discounts and promotion requests before they affect revenue.",
      settings: "Choose how this portal looks and how sales work should be handled.",
    };
    if (hash === "settings") {
      const prefs = { theme: "dark", density: "comfortable", defaultReport: "Orders", requireDiscountApproval: true, notifyFinance: true, showRevenue: true, ...(modulePrefs()[moduleId] || {}) };
      page.innerHTML = `
        <div class="panel-header">
          <div>
            <span class="eyebrow">${escapeHtml(moduleDef.title)}</span>
            <h2>Settings</h2>
            <p class="portal-manager-subtitle">Set the portal theme, sales approvals, reporting defaults, and workspace display.</p>
          </div>
          <span class="badge">Preferences</span>
        </div>
        <div class="module-settings-summary">
          <article><span>Portal display</span><strong data-module-pref-summary="theme">${escapeHtml(prefs.theme === "light" ? "Light" : "Dark")}</strong><small>Theme used across Sales</small></article>
          <article><span>Approval workflow</span><strong data-module-pref-summary="approvals">${prefs.requireDiscountApproval ? "Required" : "Optional"}</strong><small>Discount control</small></article>
          <article><span>Default report</span><strong data-module-pref-summary="report">${escapeHtml(prefs.defaultReport)}</strong><small>Used when reporting opens</small></article>
        </div>
        <form id="module-settings-form" class="module-settings-form">
          <fieldset class="settings-fieldset">
            <legend><span>Display</span><small>Theme and table spacing</small></legend>
            <label class="field"><span>Theme</span><select name="theme"><option value="dark" ${prefs.theme === "dark" ? "selected" : ""}>Dark</option><option value="light" ${prefs.theme === "light" ? "selected" : ""}>Light</option></select></label>
            <label class="field"><span>Table density</span><select name="density"><option value="comfortable" ${prefs.density === "comfortable" ? "selected" : ""}>Comfortable</option><option value="compact" ${prefs.density === "compact" ? "selected" : ""}>Compact</option></select></label>
          </fieldset>
          <fieldset class="settings-fieldset">
            <legend><span>Sales workflow</span><small>Approvals and Finance notices</small></legend>
            <label class="check-chip"><input type="checkbox" name="requireDiscountApproval" ${prefs.requireDiscountApproval ? "checked" : ""} /> <span>Require approval for discounts</span></label>
            <label class="check-chip"><input type="checkbox" name="notifyFinance" ${prefs.notifyFinance ? "checked" : ""} /> <span>Notify Finance when invoices are created</span></label>
            <label class="check-chip"><input type="checkbox" name="showRevenue" ${prefs.showRevenue ? "checked" : ""} /> <span>Show revenue cards on dashboard</span></label>
          </fieldset>
          <fieldset class="settings-fieldset">
            <legend><span>Reports</span><small>Default Sales report</small></legend>
            <label class="field"><span>Default report</span><select name="defaultReport">${SALES_REPORT_TYPES.map((item) => `<option ${prefs.defaultReport === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
          </fieldset>
          <div class="module-settings-actions">
            <button class="btn primary" type="submit">Save Settings</button>
            <button class="btn" data-module-settings-reset type="button">Reset</button>
            <span data-module-settings-note class="muted"></span>
          </div>
        </form>`;
      applyModulePreferences(moduleId);
      return;
    }
    page.innerHTML = `
      <div class="panel-header">
        <div>
          <span class="eyebrow">${escapeHtml(moduleDef.title)}</span>
          <h2>${escapeHtml(label)}</h2>
          <p class="portal-manager-subtitle">${escapeHtml(actionCopy[hash] || `Review and manage ${label.toLowerCase()} for this workspace.`)}</p>
        </div>
        <div class="panel-actions">
          <button class="btn" data-erp-export="xlsx" type="button">Export XLSX</button>
          <button class="btn" data-focus-record-form type="button">Add Record</button>
          ${moduleId === "sales" ? `<button class="btn danger" data-clear-module-records type="button">Clear All</button>` : ""}
        </div>
      </div>
      <div class="module-page-summary">
        <article><span>Records</span><strong>${displayRows.length}</strong><small>${escapeHtml(label)} in view</small></article>
        <article><span>Workspace</span><strong>Ready</strong><small>Uses shared organization data</small></article>
        <article><span>${moduleId === "sales" ? "Total revenue" : "Next action"}</span><strong>${moduleId === "sales" ? escapeHtml(money(rows.reduce((sum, row) => sum + (Number(String(row.values?.[3] || "").replace(/[^\d.-]/g, "")) || 0), 0))) : "Add"}</strong><small>${moduleId === "sales" ? "From saved sales records" : `Create a new ${escapeHtml(label.toLowerCase())} record`}</small></article>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr>${workflow.labels.map((field) => `<th>${escapeHtml(field)}</th>`).join("")}<th>Updated</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
  };

  const readModuleSettingsForm = (form) => ({
    theme: form.elements.namedItem("theme")?.value || "dark",
    density: form.elements.namedItem("density")?.value || "comfortable",
    defaultReport: form.elements.namedItem("defaultReport")?.value || "Orders",
    requireDiscountApproval: !!form.elements.namedItem("requireDiscountApproval")?.checked,
    notifyFinance: !!form.elements.namedItem("notifyFinance")?.checked,
    showRevenue: !!form.elements.namedItem("showRevenue")?.checked,
  });

  const applyModulePreferences = (moduleId) => {
    const prefs = { theme: "dark", density: "comfortable", showRevenue: true, ...(modulePrefs()[moduleId] || {}) };
    document.documentElement.dataset.moduleTheme = prefs.theme === "light" ? "light" : "dark";
    document.body.classList.toggle("module-density-compact", prefs.density === "compact");
  };

  const activatePortalMenuItem = (link) => {
    if (!link) return;
    const nav = link.dataset.moduleNav || "dashboard";
    const target = link.dataset.moduleTarget || "dashboard";
    if (target === "logout") {
      location.href = "index.html?logout=1";
      return;
    }
    document.querySelectorAll("[data-module-nav]").forEach((item) => {
      const active = item === link;
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    history.pushState({ moduleView: nav }, "", moduleViewUrl(nav));
    setPortalView(target);
    if (String(target).startsWith("module-page:")) renderModuleDetailPage(activeModuleId, blueprintFor(activeModuleId), link);
  };

  const renderForm = (moduleId, workflow) => {
    if (moduleId === "sales") {
      $("#module-record-form").innerHTML = `
        <label class="field"><span>Customer</span><input name="field0" placeholder="Customer name" required /></label>
        <label class="field"><span>Item / Service</span><input name="field1" placeholder="What the customer is buying" required /></label>
        <label class="field"><span>Purpose / Delivery</span><input name="field2" placeholder="What it is for or where it is going" required /></label>
        <label class="field"><span>Amount</span><input name="field3" type="number" min="0" step="0.01" placeholder="KES 0" required /></label>
        <label class="field"><span>Invoice Status</span><select name="field4" required><option value="">Select status</option><option>Pending</option><option>Paid</option><option>Unpaid</option><option>Draft</option><option>Rejected</option></select></label>
        <button class="btn primary" type="submit">Add Sale</button>`;
      return;
    }
    $("#module-record-form").innerHTML =
      workflow.labels
        .map((label, idx) => `<label class="field"><span>${escapeHtml(label)}</span><input name="field${idx}" placeholder="${escapeHtml(label)}" required /></label>`)
        .join("") + `<button class="btn primary" type="submit">Add Record</button>`;
  };

  const renderRows = (moduleId, workflow, query = "") => {
    const data = moduleData();
    const rows = Array.isArray(data[moduleId]) ? data[moduleId] : [];
    const q = query.trim().toLowerCase();
    const filter = moduleId === "finance" ? String($("#finance-filter")?.value || "all").toLowerCase() : "all";
    const matchesFilter = (row) => {
      if (filter === "all") return true;
      const text = (row.values || []).join(" ").toLowerCase();
      if (filter === "money-in") return /sale|income|payment received|customer payment|mobile money|bank deposit|receipt/.test(text);
      if (filter === "money-out") return /expense|salary|purchase|bill|tax|supplier|paid out/.test(text);
      return text.includes(filter);
    };
    const visible = rows.filter((row) => (!q || row.values.join(" ").toLowerCase().includes(q)) && matchesFilter(row));
    $("#module-empty").hidden = visible.length > 0;
    if ($("#module-empty")) $("#module-empty").textContent = moduleId === "finance" ? "No transactions yet. Record the first sale when it is ready." : "No records here yet.";
    $("#module-table-head").innerHTML = [...workflow.labels, "Updated", "Actions"].map((label) => `<th>${escapeHtml(label)}</th>`).join("");
    $("#module-table-body").innerHTML = visible
      .map((row) => `<tr>${workflow.labels.map((label, idx) => `<td data-label="${escapeHtml(label)}">${escapeHtml(row.values?.[idx] || "-")}</td>`).join("")}<td data-label="Updated">${escapeHtml(humanDate(row.updatedAt))}</td><td data-label="Actions"><button class="btn danger" type="button" data-record-delete="${escapeHtml(row.id)}">Delete</button></td></tr>`)
      .join("") || `<tr><td colspan="${workflow.labels.length + 2}" class="muted">No records yet.</td></tr>`;
    $("#module-kpi-a").textContent = rows.length;
  };

  const renderBars = (values) =>
    `<div class="erp-chart" aria-label="Performance chart">${values
      .map((value, idx) => `<span style="height:${Math.max(18, Number(value) || 0)}%" title="Period ${idx + 1}: ${escapeHtml(value)}%"></span>`)
      .join("")}</div>`;

  const renderFinanceSections = () => {
    document.body.classList.add("finance-simple-page");
    document.querySelector(".module-feature-strip")?.remove();
    document.querySelector(".module-shared-grid")?.remove();
    $("#portal-dashboard")?.classList.add("finance-hero-section");
    $("#portal-records")?.classList.add("finance-transactions-panel");
    const recordCopy = $("#module-workflow-subtitle");
    if (recordCopy) recordCopy.textContent = "Full accounting record of all debit and credit entries.";
    $("#module-record-form")?.classList.add("finance-entry-form");
    const recordTitle = $("#portal-records .panel-header h2");
    if (recordTitle) recordTitle.textContent = "Ledger";
    const financeInputs = Array.from(document.querySelectorAll("#module-record-form input"));
    ["Sold tomatoes", "Money In, Sale, Expense, Salary, Bill", "500", "Paid or Waiting"].forEach((placeholder, idx) => {
      if (financeInputs[idx]) financeInputs[idx].placeholder = placeholder;
    });
    const recordActions = $("#portal-records .panel-header .panel-actions");
    if (recordActions) {
      recordActions.innerHTML = `<input id="module-search" type="search" placeholder="Search transactions..." /><select id="finance-filter" aria-label="Filter transactions"><option value="all">All</option><option value="money-in">Money In</option><option value="money-out">Money Out</option><option value="sale">Sales</option><option value="payment">Payments</option><option value="expense">Expenses</option></select><button class="btn" data-erp-export="xlsx" type="button">Export XLSX</button><button class="btn" data-erp-export="pdf" type="button">Export PDF</button>`;
    }
    const portalKpis = $("#portal-kpis");
    if (portalKpis && !portalKpis.classList.contains("finance-kpis")) {
      portalKpis.classList.add("finance-kpis");
      portalKpis.innerHTML = `
        <article class="kpi"><div class="kpi-label">Money In</div><div id="finance-money-in" class="kpi-value">KES 0</div><div class="kpi-foot muted">Sales and payments received</div></article>
        <article class="kpi"><div class="kpi-label">Money Out</div><div id="finance-money-out" class="kpi-value">KES 0</div><div class="kpi-foot muted">Expenses and bills paid</div></article>
        <article class="kpi"><div class="kpi-label">Profit</div><div id="finance-dashboard-net-kpi" class="kpi-value">KES 0</div><div class="kpi-foot muted">Money In minus Money Out</div></article>
        <article class="kpi"><div class="kpi-label">Pending Payments</div><div id="finance-open-items" class="kpi-value">0</div><div class="kpi-foot muted">Payments waiting to be completed</div></article>`;
    }
    if (!$("#finance-dashboard")) {
      $("#portal-kpis")?.insertAdjacentHTML(
        "afterend",
        `<section id="finance-dashboard" class="panel finance-home finance-structure-dashboard" aria-label="Financial dashboard">
          <div class="finance-home-head">
            <div>
              <p class="eyebrow">Dashboard</p>
              <h2>Finance Portal</h2>
              <p>Overview of all money — totals, pending items, recent activity at a glance.</p>
            </div>
            <span class="finance-soft-badge">Main</span>
          </div>
          <div class="finance-simple-cards">
            <article><span>Total In</span><strong id="finance-dashboard-in">KES 0</strong><small>Money received</small></article>
            <article><span>Total Out</span><strong id="finance-dashboard-out">KES 0</strong><small>Money spent</small></article>
            <article><span>Balance</span><strong id="finance-dashboard-net">KES 0</strong><small>In minus out</small></article>
            <article><span>Pending</span><strong id="finance-dashboard-approvals">0</strong><small>Needs review</small></article>
          </div>
          <div class="finance-structure-groups">
            <article class="finance-home-block">
              <h3>Main</h3>
              <button class="finance-structure-card" data-finance-jump="dashboard" type="button"><strong>Dashboard</strong><span>Overview of all money — totals, pending items, recent activity at a glance.</span></button>
            </article>
            <article class="finance-home-block">
              <h3>Finance</h3>
              <div class="finance-structure-list">
                <button class="finance-structure-card" data-finance-jump="invoices" type="button"><strong>Invoices <em>3</em></strong><span>All bills received and sent — with approved / pending / rejected status.</span></button>
                <button class="finance-structure-card" data-finance-jump="approvals" type="button"><strong>Approvals <em>4</em></strong><span>Requests waiting for sign-off — expenses, contracts, purchases.</span></button>
                <button class="finance-structure-card" data-finance-jump="suppliers" type="button"><strong>Suppliers & vendors</strong><span>All payments going to external companies and service providers.</span></button>
                <button class="finance-structure-card" data-finance-jump="budgets" type="button"><strong>Budgets</strong><span>Department budget allocations — how much is assigned and how much is used.</span></button>
              </div>
            </article>
            <article class="finance-home-block">
              <h3>People</h3>
              <div class="finance-structure-list">
                <button class="finance-structure-card" data-finance-jump="employees" type="button"><strong>Employees</strong><span>Staff list with department, role, and contract type.</span></button>
                <button class="finance-structure-card" data-finance-jump="payroll" type="button"><strong>Payroll <em>!</em></strong><span>Monthly salary runs — who gets paid, how much, and when.</span></button>
              </div>
            </article>
            <article class="finance-home-block">
              <h3>Accounting</h3>
              <div class="finance-structure-list">
                <button class="finance-structure-card" data-finance-jump="ledger" type="button"><strong>Ledger</strong><span>Full accounting record of all debit and credit entries.</span></button>
                <button class="finance-structure-card" data-finance-jump="reports" type="button"><strong>Reports</strong><span>Financial summaries by period, department, or record type — exportable.</span></button>
              </div>
            </article>
            <article class="finance-home-block">
              <h3>Tools</h3>
              <div class="finance-structure-list">
                <button class="finance-structure-card" data-finance-jump="export" type="button"><strong>Export</strong><span>Download finance records for sharing or filing.</span></button>
                <button class="finance-structure-card" data-finance-jump="settings" type="button"><strong>Settings</strong><span>Finance preferences, users, and business controls.</span></button>
              </div>
            </article>
            <article class="finance-home-block">
              <h3>Recent activity</h3>
              <div class="finance-alert-list">
                <article><strong id="finance-open-invoices">0</strong><span>Pending items</span></article>
                <article><strong id="finance-dashboard-health">Ready</strong><span id="finance-dashboard-note">Finance activity will appear here.</span></article>
              </div>
            </article>
            </div>
        </section>`,
      );
    }
    if ($("#finance-workspace-sections")) return;
    $("#portal-records")?.insertAdjacentHTML(
      "afterend",
      `<div id="finance-workspace-sections" class="finance-workspace-sections">
        <article id="approvals" class="panel">
          <div class="panel-header"><div><h2>Approvals</h2><p class="portal-manager-subtitle">Requests waiting for sign-off — expenses, contracts, purchases.</p></div><span id="erp-approval-count" class="badge">0 pending</span></div>
          <div id="erp-approvals" class="erp-approval-list"></div>
        </article>
        <article id="finance-actions-panel" class="panel finance-actions-panel">
          <div class="panel-header"><h2>More Actions</h2><span class="badge">Simple</span></div>
          <div id="erp-actions" class="erp-action-list"></div>
        </article>
        <article id="reports" class="panel">
          <div class="panel-header"><div><h2>Reports</h2><p class="portal-manager-subtitle">Financial summaries by period, department, or record type — exportable.</p></div><span class="badge">Ready</span></div>
          <div id="erp-reports" class="erp-report-grid"></div>
        </article>
      </div>`,
    );
    $("#finance-workspace-sections")?.insertAdjacentHTML(
      "afterend",
      `<section id="finance-invoices-page" class="panel finance-focus-panel" hidden>
        <div class="panel-header"><div><h2>Invoices</h2><p class="portal-manager-subtitle">All bills received and sent — with approved / pending / rejected status.</p></div><button class="btn primary" data-focus-finance-form type="button">Add Invoice</button></div>
        <div class="finance-page-summary"><article><span>Total invoices</span><strong>3</strong></article><article><span>Status</span><strong>Mixed</strong></article></div>
      </section>
      <section id="finance-suppliers-page" class="panel finance-focus-panel" hidden>
        <div class="panel-header"><div><h2>Suppliers & vendors</h2><p class="portal-manager-subtitle">All payments going to external companies and service providers.</p></div><button class="btn primary" data-focus-finance-form type="button">Add Supplier</button></div>
        <div class="finance-page-summary"><article><span>Suppliers</span><strong>0</strong></article><article><span>Payments</span><strong id="finance-expense-total">KES 0</strong></article></div>
      </section>
      <section id="finance-budgets-page" class="panel finance-focus-panel" hidden>
        <div class="panel-header"><div><h2>Budgets</h2><p class="portal-manager-subtitle">Department budget allocations — how much is assigned and how much is used.</p></div><button class="btn primary" data-focus-finance-form type="button">Add Budget</button></div>
        <div class="finance-page-summary"><article><span>Assigned</span><strong id="finance-budget-total">KES 0</strong></article><article><span>Used</span><strong id="finance-expense-count">0</strong></article></div>
      </section>
      <section id="finance-employees-page" class="panel finance-focus-panel" hidden>
        <div class="panel-header"><div><h2>Employees</h2><p class="portal-manager-subtitle">Staff list with department, role, and contract type.</p></div><button class="btn primary" data-focus-finance-form type="button">Add Employee</button></div>
        <div class="finance-focus-body"><strong>Staff list</strong><p>Department, role, and contract type for each employee.</p></div>
      </section>
      <section id="finance-payroll-page" class="panel finance-focus-panel" hidden>
        <div class="panel-header"><div><h2>Payroll</h2><p class="portal-manager-subtitle">Monthly salary runs — who gets paid, how much, and when.</p></div><button class="btn primary" data-focus-finance-form type="button">Add Payroll</button></div>
        <div class="finance-page-summary"><article><span>Salary runs</span><strong>0</strong></article><article><span>Alert</span><strong>!</strong></article></div>
      </section>
      <section id="finance-export-page" class="panel finance-focus-panel" hidden>
        <div class="panel-header"><div><h2>Export</h2><p class="portal-manager-subtitle">Download finance records for sharing or filing.</p></div><button class="btn primary" data-erp-export="xlsx" type="button">Export XLSX</button></div>
        <div class="finance-focus-body"><strong>Export tools</strong><p>Use Export XLSX or Export PDF from the records table when you need a copy.</p></div>
      </section>
      <section id="finance-settings" class="panel finance-focus-panel" hidden>
        <div class="panel-header"><h2>Settings</h2></div>
        <div class="finance-focus-body"><strong>Finance settings</strong><p>Finance preferences, users, and business controls.</p></div>
      </section>`,
    );
  };

  const renderBranchManagementSections = (moduleId, moduleDef) => {
    document.body.classList.add("branch-management-page");
    document.body.classList.remove("finance-simple-page");
    const subtitle = $("#module-workflow-subtitle");
    if (subtitle) subtitle.textContent = "Create and maintain branch records for locations, managers, regions, and operating status.";
    const recordTitle = $("#portal-records .panel-header h2");
    if (recordTitle) recordTitle.textContent = "Branch Records";
    const recordActions = $("#portal-records .panel-header .panel-actions");
    if (recordActions) {
      recordActions.innerHTML = `<input id="module-search" type="search" placeholder="Search branch records..." /><button class="btn" data-erp-export="xlsx" type="button">Export XLSX</button>`;
    }
    const portalKpis = $("#portal-kpis");
    if (portalKpis && !portalKpis.classList.contains("branch-management-kpis")) {
      portalKpis.classList.add("branch-management-kpis");
      portalKpis.innerHTML = `
        <article class="kpi"><div class="kpi-label">Branch Records</div><div id="module-kpi-a" class="kpi-value">0</div><div class="kpi-foot muted">Saved locations</div></article>
        <article class="kpi"><div class="kpi-label">Shared Users</div><div id="module-kpi-users" class="kpi-value">0</div><div class="kpi-foot muted">Organization access</div></article>
        <article class="kpi"><div class="kpi-label">Enabled Modules</div><div id="module-kpi-modules" class="kpi-value">0</div><div class="kpi-foot muted">Workspace tools</div></article>
        <article class="kpi"><div class="kpi-label">Workspace</div><div class="kpi-value">Connected</div><div id="module-kpi-tenant" class="kpi-foot muted">Data kept together</div></article>`;
    }
    if (!$("#branch-management-overview")) {
      $("#portal-kpis")?.insertAdjacentHTML(
        "afterend",
        `<section id="branch-management-overview" class="panel branch-management-overview">
          <div class="panel-header">
            <div>
              <h2>Branch Operations</h2>
              <p class="portal-manager-subtitle">Manage branch setup, account review, local records, and reporting from one workspace.</p>
            </div>
            <span class="badge">Operations</span>
          </div>
          <div class="branch-management-grid">
            <article><strong>Account Review</strong><span>Approve or return branch access requests before managers can sign in.</span></article>
            <article><strong>Branch Directory</strong><span>Keep location, manager, and region records easy to scan.</span></article>
            <article><strong>Operational Status</strong><span>Track active, pending, returned, and rejected branch work.</span></article>
          </div>
        </section>`,
      );
    }
    if ($("#erp-sections")) return;
    $("#portal-records")?.insertAdjacentHTML(
      "afterend",
      `<div id="erp-sections" class="erp-sections branch-management-sections">
        <section id="approvals" class="erp-work-grid">
          <article class="panel">
            <div class="panel-header"><div><h2>Branch Actions</h2><p class="portal-manager-subtitle">Common actions for branch setup and operations.</p></div><span class="badge">Workflow</span></div>
            <div id="erp-actions" class="erp-action-list"></div>
          </article>
          <article class="panel">
            <div class="panel-header"><div><h2>Branch Approvals</h2><p class="portal-manager-subtitle">Requests that need admin or finance review.</p></div><span id="erp-approval-count" class="badge">0 pending</span></div>
            <div id="erp-approvals" class="erp-approval-list"></div>
          </article>
        </section>
        <section id="reports" class="erp-work-grid">
          <article class="panel">
            <div class="panel-header"><div><h2>Messages</h2><p class="portal-manager-subtitle">Send updates to departments or branch teams.</p></div><span class="badge">Connected</span></div>
            <form id="erp-message-form" class="erp-message-form">
              <label class="field"><span>Send to</span><input name="to" value="admin" required /></label>
              <label class="field"><span>Message</span><input name="body" value="Please review the latest branch update." required /></label>
              <button class="btn primary" type="submit">Send</button>
            </form>
            <div id="erp-messages" class="erp-message-list"></div>
          </article>
          <article class="panel">
            <div class="panel-header"><div><h2>Reports & Activity</h2><p class="portal-manager-subtitle">Export branch records and review recent activity.</p></div><span class="badge">Ready</span></div>
            <div id="erp-reports" class="erp-report-grid"></div>
            <div id="erp-activity" class="erp-activity-list"></div>
          </article>
        </section>
      </div>`,
    );
  };

  const openFinanceWorkflowPage = (label, target, detail) => {
    const params = new URLSearchParams();
    params.set("tenant", window.EnterpriseCore?.currentTenantId?.() || "");
    params.set("action", label || "");
    params.set("target", target || "");
    params.set("detail", detail || "");
    location.href = `finance-workflow.html?${params.toString()}`;
  };

  const financeTotals = () => {
    const rows = Array.isArray(moduleData().finance) ? moduleData().finance : [];
    return rows.reduce(
      (totals, row) => {
        const category = String(row.values?.[1] || "").toLowerCase();
        const text = (row.values || []).join(" ").toLowerCase();
        const amount = Number(String(row.values?.[2] || "").replace(/[^\d.-]/g, "")) || 0;
        const status = String(row.values?.[3] || "").toLowerCase();
        if (/income|revenue|payment|paid|receipt|sale|invoice|mobile money|bank deposit|customer payment/.test(text)) totals.moneyIn += amount;
        if (/expense|purchase|payroll|salary|tax|budget|debt|cost|bill|supplier/.test(text)) totals.moneyOut += amount;
        if (/sale|receipt|order/.test(text)) totals.sales += 1;
        if (/payment|mobile money|bank deposit/.test(text)) totals.payments += 1;
        if (/expense|purchase|salary|bill|tax|supplier/.test(text)) totals.expenses += 1;
        if (/budget/.test(category)) totals.budgets += amount;
        if (/tax/.test(category)) totals.taxes += amount;
        if (/pending|unpaid|draft|open|waiting/.test(status)) totals.openItems += 1;
        return totals;
      },
      { entries: rows.length, moneyIn: 0, moneyOut: 0, budgets: 0, taxes: 0, openItems: 0, sales: 0, payments: 0, expenses: 0 },
    );
  };

  const renderEnterpriseSections = (moduleId, moduleDef) => {
    if (moduleId === "finance") {
      renderFinanceSections();
      return;
    }
    if (moduleId === "branch") {
      renderBranchManagementSections(moduleId, moduleDef);
      return;
    }
    document.body.classList.remove("finance-simple-page");
    document.body.classList.remove("branch-management-page");
    if (moduleId === "sales") {
      const recordActions = $("#portal-records .panel-header .panel-actions");
      if (recordActions) {
        recordActions.innerHTML = `<input id="module-search" type="search" placeholder="Search sales records..." /><button class="btn danger" data-clear-module-records type="button">Clear All</button>`;
      }
    }
    if ($("#erp-sections")) return;
    const blueprint = blueprintFor(moduleId);
    const salesDashboardSection = moduleId === "sales"
      ? `<section id="dashboard" class="panel sales-dashboard-page">
          <div class="panel-header">
            <div>
              <span class="eyebrow">Sales workspace</span>
              <h2>Sales command center</h2>
              <p class="portal-manager-subtitle">Track orders, invoices, discounts, customers, and revenue without mixing every task into one page.</p>
            </div>
            <div class="panel-actions">
              <button class="btn" data-erp-export="xlsx" type="button">Export XLSX</button>
              <button class="btn" data-focus-record-form type="button">Add Sale</button>
            </div>
          </div>
          <div id="erp-kpis" class="sales-metric-grid"></div>
          <div class="sales-work-layout">
            <article class="sales-pipeline-card">
              <div class="sales-card-head"><strong>Pipeline</strong><span>Current flow</span></div>
              <div class="sales-pipeline-list">
                <button data-module-jump="orders" type="button"><span>Orders</span><strong data-sales-pipeline="orders">0</strong></button>
                <button data-module-jump="customers" type="button"><span>Customers</span><strong data-sales-pipeline="customers">0</strong></button>
                <button data-module-jump="discounts" type="button"><span>Discounts</span><strong data-sales-pipeline="discounts">0</strong></button>
                <button data-module-jump="revenue" type="button"><span>Revenue</span><strong data-sales-pipeline="revenue">KES 0</strong></button>
              </div>
            </article>
            <article class="sales-pipeline-card">
              <div class="sales-card-head"><strong>Focus Areas</strong><span>Sales work</span></div>
              <div class="sales-focus-list">
                ${["Orders", "Quotations", "Invoices", "Revenue tracking", "Discounts", "Customer history"].map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
              </div>
            </article>
          </div>
        </section>`
      : `<section id="dashboard" class="panel erp-dashboard-panel">
          <div class="panel-header">
            <div><h2>${escapeHtml(moduleDef.title)} Dashboard</h2><p class="portal-manager-subtitle">See the latest work, pending items, and the jobs this team handles.</p></div>
            <div class="panel-actions">
              <button class="btn" data-erp-export="xlsx" type="button">Export XLSX</button>
              <button class="btn" data-erp-export="pdf" type="button">Export PDF</button>
            </div>
          </div>
          <div id="erp-kpis" class="erp-kpi-grid"></div>
          <div class="erp-dashboard-grid">
            <article class="erp-card"><strong>Performance</strong>${renderBars(blueprint.chart)}<span class="muted">A quick look at recent movement</span></article>
            <article class="erp-card"><strong>Responsibilities</strong><ul>${blueprint.responsibilities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>
          </div>
        </section>`;
    const salesWorkflowSection = moduleId === "sales"
      ? `<section id="approvals" class="sales-review-layout">
          <article class="panel">
            <div class="panel-header"><div><h2>Sales work queue</h2><p class="portal-manager-subtitle">Send invoices, request discount approval, and move sales work forward.</p></div><span class="badge">Actions</span></div>
            <div id="erp-actions" class="sales-action-list"></div>
          </article>
          <article class="panel">
            <div class="panel-header"><div><h2>Approval review</h2><p class="portal-manager-subtitle">Discount and invoice requests that need a decision.</p></div><span id="erp-approval-count" class="badge">0 pending</span></div>
            <div id="erp-approvals" class="erp-approval-list sales-approval-list"></div>
          </article>
        </section>`
      : `<section id="approvals" class="erp-work-grid">
          <article class="panel">
            <div class="panel-header"><h2>Department Actions</h2><span class="badge">Workflow</span></div>
            <div id="erp-actions" class="erp-action-list"></div>
          </article>
          <article class="panel">
            <div class="panel-header"><h2>Approvals Inbox</h2><span id="erp-approval-count" class="badge">0 pending</span></div>
            <div id="erp-approvals" class="erp-approval-list"></div>
          </article>
        </section>`;
    const salesReportSection = moduleId === "sales"
      ? `<section id="reports" class="panel sales-report-workspace">
          <div class="panel-header">
            <div>
              <span class="eyebrow">Accounting</span>
              <h2>Generate and export reports</h2>
              <p class="portal-manager-subtitle">Create clean sales reports from orders, quotations, invoices, revenue, discounts, and customer history.</p>
            </div>
          </div>
          <div class="sales-report-status-grid">
            <article><span>Report status</span><strong data-sales-report-status>Not generated</strong><small>Ready after generation</small></article>
            <article><span>Report type</span><strong data-sales-report-type>Sales</strong><small>Selected output</small></article>
            <article><span>Export format</span><strong data-sales-report-format>PDF</strong><small>PDF or XLSX</small></article>
            <article><span>Last generated</span><strong data-sales-report-time>Never</strong><small>Current session</small></article>
          </div>
          <div class="sales-report-generator">
            <div class="content-head">
              <div>
                <p class="eyebrow">Reports</p>
                <h2>Report generation</h2>
                <p>Select what Sales should generate, then export the report.</p>
              </div>
            </div>
            <form id="sales-report-form" class="sales-report-form">
              <label class="field"><span>Report</span><select name="report">${SALES_REPORT_TYPES.map((item) => `<option>${escapeHtml(item)}</option>`).join("")}</select></label>
              <label class="field"><span>Period</span><select name="period">${REPORT_PERIODS.map((period) => `<option value="${escapeHtml(period)}">${escapeHtml(period[0].toUpperCase() + period.slice(1))}</option>`).join("")}</select></label>
              <label class="field"><span>Format</span><select name="format"><option value="pdf">PDF</option><option value="excel">XLSX</option></select></label>
              <button class="btn primary" type="submit">Generate</button>
              <button class="btn" data-sales-report-export="pdf" type="button">Export PDF</button>
              <button class="btn" data-sales-report-export="excel" type="button">Export XLSX</button>
            </form>
            <div id="sales-report-output" class="report-preview">No report generated yet.</div>
          </div>
        </section>`
      : `<section id="reports" class="erp-work-grid">
          <article class="panel">
            <div class="panel-header"><h2>Department Messaging</h2><span class="badge">Connected</span></div>
            <form id="erp-message-form" class="erp-message-form">
              <label class="field"><span>Send to department</span><input name="to" value="${moduleId === "finance" ? "hr" : "finance"}" required /></label>
              <label class="field"><span>Message</span><input name="body" value="Please review the latest ${escapeHtml(moduleDef.title)} workflow." required /></label>
              <button class="btn primary" type="submit">Send</button>
            </form>
            <div id="erp-messages" class="erp-message-list"></div>
          </article>
          <article class="panel">
            <div class="panel-header"><h2>Reports & Audit</h2><span class="badge">PDF / XLSX</span></div>
            <div id="erp-reports" class="erp-report-grid"></div>
            <div id="erp-activity" class="erp-activity-list"></div>
          </article>
        </section>`;
    $(".portal-hub-widgets").insertAdjacentHTML(
      "afterend",
      `<div id="erp-sections" class="erp-sections">
        ${salesDashboardSection}
        <section id="module-detail-page" class="panel module-detail-page" hidden></section>
        ${salesWorkflowSection}
        ${salesReportSection}
      </div>`,
    );
  };

  const refreshEnterpriseSections = (moduleId) => {
    const blueprint = blueprintFor(moduleId);
    const state = ensurePortalState(moduleId);
    const activities = (storeGet(ACTIVITY_KEY, []) || []).filter((item) => item.moduleId === moduleId).slice(0, 8);
    const approvals = (state.approvals || []).filter((item) => item.target === moduleId || item.moduleId === moduleId).slice(0, 8);
    const messages = (state.messages || []).filter((item) => item.moduleId === moduleId || item.to === moduleId || item.from === moduleId).slice(0, 8);

    const kpiGrid = $("#erp-kpis");
    if (kpiGrid) {
      kpiGrid.innerHTML = blueprint.kpis
        .map(([label, value]) => {
          const foot = moduleId === "sales"
            ? label.toLowerCase().includes("approval")
              ? "Needs review"
              : label.toLowerCase().includes("transaction")
                ? "Posted to records"
                : label.toLowerCase().includes("report")
                  ? "Available exports"
                  : "Sales records"
            : "Updated from this workspace";
          return `<article class="kpi"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value">${typeof value === "number" && label.toLowerCase().match(/revenue|sales|expenses|billing|amount/) ? money(value) : escapeHtml(value)}</div><div class="kpi-foot muted">${escapeHtml(foot)}</div></article>`;
        })
        .join("");
    }

    if (moduleId === "sales") {
      const rows = Array.isArray(moduleData().sales) ? moduleData().sales : [];
      const textFor = (row) => (row.values || []).join(" ").toLowerCase();
      const countBy = (pattern) => rows.filter((row) => pattern.test(textFor(row))).length;
      const revenue = rows.reduce((sum, row) => {
        const amount = Number(String(row.values?.[3] || "").replace(/[^\d.-]/g, "")) || 0;
        return sum + amount;
      }, 0);
      document.querySelector('[data-sales-pipeline="orders"]')?.replaceChildren(document.createTextNode(String(countBy(/order|invoice|sale/) || rows.length)));
      document.querySelector('[data-sales-pipeline="customers"]')?.replaceChildren(document.createTextNode(String(countBy(/customer|client/) || 0)));
      document.querySelector('[data-sales-pipeline="discounts"]')?.replaceChildren(document.createTextNode(String(countBy(/discount|promotion/) || approvals.filter((item) => /discount/i.test(`${item.title} ${item.note}`)).length)));
      document.querySelector('[data-sales-pipeline="revenue"]')?.replaceChildren(document.createTextNode(money(revenue)));
      $("#module-kpi-a-label") && ($("#module-kpi-a-label").textContent = "Sales orders");
      $("#module-kpi-a") && ($("#module-kpi-a").textContent = rows.length);
      $("#module-kpi-a-foot") && ($("#module-kpi-a-foot").textContent = "Saved sales records");
      $("#module-kpi-b-label") && ($("#module-kpi-b-label").textContent = "Total revenue");
      $("#module-kpi-users") && ($("#module-kpi-users").textContent = money(revenue));
    }

    if (moduleId === "finance") {
      const totals = financeTotals();
      const entries = $("#module-kpi-a");
      const moneyIn = $("#finance-money-in");
      const moneyOut = $("#finance-money-out");
      const openItems = $("#finance-open-items");
      const netKpi = $("#finance-dashboard-net-kpi");
      if (entries) entries.textContent = totals.entries;
      if (moneyIn) moneyIn.textContent = money(totals.moneyIn);
      if (moneyOut) moneyOut.textContent = money(totals.moneyOut);
      if (openItems) openItems.textContent = totals.openItems;
      if (netKpi) netKpi.textContent = money(totals.moneyIn - totals.moneyOut);
      const revenueTotal = $("#finance-revenue-total");
      const expenseTotal = $("#finance-expense-total");
      const budgetTotal = $("#finance-budget-total");
      const taxTotal = $("#finance-tax-total");
      const netTotal = $("#finance-net-total");
      const openTotal = $("#finance-open-total");
      const entryTotal = $("#finance-entry-total");
      const dashNet = $("#finance-dashboard-net");
      const dashIn = $("#finance-dashboard-in");
      const dashOut = $("#finance-dashboard-out");
      const dashApprovals = $("#finance-dashboard-approvals");
      const dashHealth = $("#finance-dashboard-health");
      const dashNote = $("#finance-dashboard-note");
      const meterIn = $("#finance-meter-in");
      const meterOut = $("#finance-meter-out");
      const paymentCount = $("#finance-payment-count");
      const expenseCount = $("#finance-expense-count");
      const salesCount = $("#finance-sales-count");
      const scale = Math.max(totals.moneyIn, totals.moneyOut, 1);
      const pendingApprovals = approvals.filter((item) => item.status === "pending").length;
      if (revenueTotal) revenueTotal.textContent = money(totals.moneyIn);
      if (expenseTotal) expenseTotal.textContent = money(totals.moneyOut);
      if (budgetTotal) budgetTotal.textContent = money(totals.budgets);
      if (taxTotal) taxTotal.textContent = money(totals.taxes);
      if (netTotal) netTotal.textContent = money(totals.moneyIn - totals.moneyOut);
      if (openTotal) openTotal.textContent = totals.openItems;
      if (entryTotal) entryTotal.textContent = totals.entries;
      if (dashNet) dashNet.textContent = money(totals.moneyIn - totals.moneyOut);
      if (dashIn) dashIn.textContent = money(totals.moneyIn);
      if (dashOut) dashOut.textContent = money(totals.moneyOut);
      if (dashApprovals) dashApprovals.textContent = pendingApprovals;
      if (dashHealth) dashHealth.textContent = totals.entries ? "Active" : "Ready";
      if (dashNote) dashNote.textContent = totals.entries ? `${totals.entries} transaction${totals.entries === 1 ? "" : "s"} recorded.` : "Start by recording your first sale.";
      if (meterIn) meterIn.style.width = `${Math.max(4, Math.round((totals.moneyIn / scale) * 100))}%`;
      if (meterOut) meterOut.style.width = `${Math.max(4, Math.round((totals.moneyOut / scale) * 100))}%`;
      if (paymentCount) paymentCount.textContent = totals.payments;
      if (expenseCount) expenseCount.textContent = totals.expenses;
      if (salesCount) salesCount.textContent = totals.sales;
      const heroRevenue = $("#finance-hero-revenue");
      const heroBudgets = $("#finance-hero-budgets");
      const dailyRevenue = $("#finance-daily-revenue");
      const expenseRequests = $("#finance-expense-requests");
      const budgetUsage = $("#finance-budget-usage");
      const openInvoices = $("#finance-open-invoices");
      const budgetReviewCount = $("#finance-budget-review-count");
      if (heroRevenue) heroRevenue.textContent = money(totals.moneyIn);
      if (heroBudgets) heroBudgets.textContent = pendingApprovals;
      if (dailyRevenue) dailyRevenue.textContent = money(totals.moneyIn);
      if (expenseRequests) expenseRequests.textContent = pendingApprovals || totals.openItems;
      if (budgetUsage) budgetUsage.textContent = totals.budgets ? `${Math.min(100, Math.round((totals.moneyOut / Math.max(totals.budgets, 1)) * 100))}%` : "0%";
      if (openInvoices) openInvoices.textContent = totals.openItems;
      if (budgetReviewCount) budgetReviewCount.textContent = pendingApprovals;
    }

    $("#erp-actions").innerHTML = blueprint.actions
      .map(([label, target, detail]) => `<button class="erp-action" data-erp-action="${escapeHtml(label)}" data-erp-target="${escapeHtml(target)}" data-erp-detail="${escapeHtml(detail)}" type="button"><strong>${escapeHtml(label)}</strong><span>Routes to ${escapeHtml(target)}</span></button>`)
      .join("");

    $("#erp-approval-count").textContent = `${approvals.filter((item) => item.status === "pending").length} pending`;
    $("#erp-approvals").innerHTML = approvals.length
      ? approvals
          .map(
            (item) => {
              const isPayroll = /payroll/i.test(`${item.title} ${item.note}`);
              const employees = Array.isArray(item.payload?.employees) ? item.payload.employees : [];
              const employeeText = employees.length ? `<p>${escapeHtml(employees.map((employee) => `${employee.name} (${money(employee.salary)})`).join(", "))}</p>` : "";
              return `<article class="erp-approval ${escapeHtml(item.status)}">
              <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.source)} - ${typeof item.amount === "number" && item.amount > 99 ? money(item.amount) : escapeHtml(item.amount)} - ${escapeHtml(item.status)}</span><p>${escapeHtml(item.note)} ${item.reason ? `Reason: ${escapeHtml(item.reason)}` : ""}</p>${employeeText}</div>
              <div class="erp-row-actions">
                <button class="btn primary" data-approval-id="${escapeHtml(item.id)}" data-approval-status="approved" type="button">Approve</button>
                ${isPayroll ? `<button class="btn primary" data-approval-id="${escapeHtml(item.id)}" data-approval-status="paid" type="button">Mark Paid</button>` : ""}
                <button class="btn" data-approval-id="${escapeHtml(item.id)}" data-approval-status="returned" type="button">Return</button>
                <button class="btn danger" data-approval-id="${escapeHtml(item.id)}" data-approval-status="rejected" type="button">Reject</button>
              </div>
            </article>`;
            },
          )
          .join("")
      : `<div class="empty-state">No approvals are waiting right now.</div>`;

    const messageList = $("#erp-messages");
    if (messageList) {
      messageList.innerHTML = messages.length
        ? messages.map((item) => `<article><strong>${escapeHtml(item.from)} to ${escapeHtml(item.to)}</strong><span>${escapeHtml(item.body)}</span><small>${escapeHtml(humanDate(item.createdAt))}</small></article>`).join("")
        : `<div class="empty-state">No messages have been sent yet.</div>`;
    }

    const reportGrid = $("#erp-reports");
    if (reportGrid) {
      reportGrid.innerHTML =
        moduleId === "finance"
          ? blueprint.reports.map((item) => `<button class="finance-report-button" data-report-name="${escapeHtml(item)}" data-report-period="monthly" type="button">${escapeHtml(item)} XLSX</button>`).join("")
          : blueprint.reports
              .map(
                (item) => `<article class="erp-report-card">
          <strong>${escapeHtml(item)}</strong>
          <div class="erp-report-periods">
            ${REPORT_PERIODS.map((period) => `<button class="btn" data-report-name="${escapeHtml(item)}" data-report-period="${period}" type="button">${period[0].toUpperCase()}${period.slice(1)} XLSX</button>`).join("")}
          </div>
        </article>`,
              )
              .join("");
    }
    const activityList = $("#erp-activity");
    if (activityList) {
      activityList.innerHTML = activities.length
        ? activities.map((item) => `<article><strong>${escapeHtml(item.action)}</strong><span>${escapeHtml(item.detail?.message || item.detail?.label || "Activity recorded")}</span><small>${escapeHtml(humanDate(item.at))}</small></article>`).join("")
        : `<div class="empty-state">Recent activity will show here once the team starts working.</div>`;
    }
  };

  const payrollPayloadForHr = () => {
    const rows = Array.isArray(moduleData().hr) ? moduleData().hr : [];
    const employees = rows
      .map((row) => {
        const salary = Number(String(row.values?.[2] || "").replace(/[^\d.-]/g, "")) || 0;
        return { id: row.id, name: row.values?.[0] || "Employee", department: row.values?.[1] || "Unassigned", salary };
      })
      .filter((employee) => employee.salary > 0);
    const total = employees.reduce((sum, employee) => sum + employee.salary, 0);
    return { employees, total };
  };

  const addWorkflowEvent = async (moduleId, label, target, detail) => {
    const isHrPayroll = moduleId === "hr" && /payroll/i.test(label);
    const payroll = isHrPayroll ? payrollPayloadForHr() : null;
    const workflowTitle = isHrPayroll ? `Payroll for ${payroll.employees.length} employee${payroll.employees.length === 1 ? "" : "s"}` : label;
    const workflowDetail = isHrPayroll
      ? payroll.employees.length
        ? `HR forwarded payroll to Finance for ${payroll.employees.map((employee) => employee.name).join(", ")}. Total payroll ${money(payroll.total)}.`
        : "HR forwarded payroll to Finance, but no employee salary records were found. Return to HR for correction."
      : detail;
    const remote = await window.ERPClient?.sendWorkflow?.({
      sourceModule: moduleId,
      targetModule: target,
      title: workflowTitle,
      detail: workflowDetail,
      amount: payroll?.total || 0,
      approvalRequired: ["finance", "admin", "director"].includes(target),
      payload: payroll ? { type: "payroll", employees: payroll.employees } : {},
    }).catch(() => null);
    if (remote?.state?.departmentWorkflows) {
      storeSet(ERP_STATE_KEY, remote.state.departmentWorkflows);
      if (remote.state.moduleActivity) storeSet(ACTIVITY_KEY, remote.state.moduleActivity);
      refreshEnterpriseSections(moduleId);
      return;
    }

    const state = erpState();
    state.workflow = Array.isArray(state.workflow) ? state.workflow : [];
    state.messages = Array.isArray(state.messages) ? state.messages : [];
    state.workflow.unshift({ id: `wf-${Date.now()}`, moduleId, label: workflowTitle, target, detail: workflowDetail, status: "sent", createdAt: nowIso(), payload: payroll ? { type: "payroll", employees: payroll.employees } : {} });
    state.messages.unshift({ id: `msg-${Date.now()}`, moduleId, from: moduleId, to: target, body: workflowDetail, createdAt: nowIso() });

    if (["finance", "admin", "director"].includes(target) && !["approved", "rejected"].includes(label.toLowerCase())) {
      state.approvals = Array.isArray(state.approvals) ? state.approvals : [];
      state.approvals.unshift({
        id: `app-${Date.now()}`,
        moduleId,
        source: moduleId,
        target,
        title: workflowTitle,
        amount: payroll?.total || 0,
        note: workflowDetail,
        status: "pending",
        reason: "",
        payload: payroll ? { type: "payroll", employees: payroll.employees } : {},
        createdAt: nowIso(),
      });
    }
    saveErpState(state);
    appendActivity(moduleId, "workflow.sent", { label: workflowTitle, target, message: workflowDetail });
    await store()?.flush?.().catch(() => null);
    refreshEnterpriseSections(moduleId);
  };

  const updateApproval = async (moduleId, approvalId, status) => {
    const existingApproval = (erpState().approvals || []).find((item) => item.id === approvalId);
    const comment = ["rejected", "returned"].includes(status)
      ? window.prompt(status === "rejected" ? "Add rejection reason for HR:" : "Add correction notes for HR:", "")
      : status === "paid"
        ? window.prompt("Add payment note for HR records:", "Payroll paid by Finance.")
        : "";
    if (["rejected", "returned"].includes(status) && comment === null) return;
    const reason = String(comment || "").trim();
    const remote = await window.ERPClient?.decideApproval?.({ approvalId, status, reason }).catch(() => null);
    if (remote?.state?.departmentWorkflows) {
      storeSet(ERP_STATE_KEY, remote.state.departmentWorkflows);
      if (remote.state.moduleActivity) storeSet(ACTIVITY_KEY, remote.state.moduleActivity);
      if (remote.approval && /payroll/i.test(`${remote.approval.title} ${remote.approval.note}`)) {
        recordPayrollHistory(remote.approval, status, reason || remote.approval.reason || "");
      }
      if (status === "paid") {
        window.ERPClient?.postTransaction?.({
          sourceModule: "finance",
          type: "payroll_payment",
          amount: Number(existingApproval?.amount || remote.approval?.amount || 0),
          ref: approvalId,
          status: "posted",
          payload: existingApproval?.payload || remote.approval?.payload || {},
        }).catch(() => null);
      }
      refreshEnterpriseSections(moduleId);
      return;
    }

    const state = erpState();
    state.approvals = (state.approvals || []).map((item) => {
      if (item.id !== approvalId) return item;
      const isPayroll = /payroll/i.test(`${item.title} ${item.note}`);
      const reason = String(comment || "").trim() || (status === "paid"
          ? "Payroll approved and paid by Finance."
          : status === "approved"
            ? "Approved after review."
            : status === "returned"
              ? "Returned to HR for correction with Finance notes."
              : isPayroll
                ? "Payroll rejected by Finance. HR must correct and resend."
                : "Rejected due to policy or budget issue.");
      return { ...item, status, reason, updatedAt: nowIso() };
    });
    const approval = state.approvals.find((item) => item.id === approvalId);
    if (approval) {
      state.messages = Array.isArray(state.messages) ? state.messages : [];
      state.messages.unshift({
        id: `msg-${Date.now()}`,
        moduleId,
        from: moduleId,
        to: approval.source,
        body: `${approval.title} was ${status}. ${approval.reason}`,
        createdAt: nowIso(),
      });
      if (/payroll/i.test(`${approval.title} ${approval.note}`)) {
        recordPayrollHistory(approval, status, approval.reason || reason);
        window.EnterpriseCore?.notify?.("Payroll update sent to HR", `${approval.title} was ${status}.`, status === "rejected" ? "error" : "info");
      }
      if (status === "paid") {
        window.ERPClient?.postTransaction?.({
          sourceModule: "finance",
          type: "payroll_payment",
          amount: Number(approval.amount || 0),
          ref: approval.id,
          status: "posted",
          payload: approval.payload || {},
        }).catch(() => null);
      }
    }
    saveErpState(state);
    appendActivity(moduleId, `approval.${status}`, { label: approval?.title || approvalId, message: approval?.reason || status });
    refreshEnterpriseSections(moduleId);
  };

  const recordPayrollHistory = (approval, status, reason = "") => {
    if (!approval) return;
    const state = erpState();
    const employees = Array.isArray(approval.payload?.employees) ? approval.payload.employees : [];
    const entry = {
      id: `pay-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      approvalId: approval.id,
      source: approval.source,
      target: approval.target,
      title: approval.title,
      amount: Number(approval.amount || 0),
      employees,
      status,
      reason,
      month: new Date().toISOString().slice(0, 7),
      createdAt: nowIso(),
    };
    state.payrollHistory = [entry, ...(Array.isArray(state.payrollHistory) ? state.payrollHistory : [])].slice(0, 500);
    saveErpState(state);
    appendActivity("hr", `payroll.${status}`, {
      label: approval.title,
      message: `${approval.title} ${status}${reason ? `: ${reason}` : ""}`,
    });
    appendActivity("finance", `payroll.${status}`, {
      label: approval.title,
      message: `${approval.title} ${status}${reason ? `: ${reason}` : ""}`,
    });
  };

  const exportExcel = (moduleId) => {
    const data = moduleData();
    const rows = Array.isArray(data[moduleId]) ? data[moduleId] : [];
    const workflow = blueprintFor(moduleId);
    const labels = Array.isArray(workflow.labels) ? workflow.labels : [];
    const workbookRows = [
      [`${workflow.title || moduleId} Export`],
      ["Generated", new Date().toLocaleString()],
      ["Records", rows.length],
      [],
      [...labels, "Updated"],
      ...(rows.length ? rows.map((row) => [...(row.values || []), humanDate(row.updatedAt)]) : [["No records yet."]]),
    ];
    downloadWorkbook(`${moduleId}-records.xlsx`, `${workflow.title || moduleId} Records`, workbookRows);
  };

  const downloadBlob = (filename, blob) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadText = (filename, text, type = "text/plain") => {
    downloadBlob(filename, new Blob([text], { type }));
  };

  const zipCrcTable = (() => {
    const table = [];
    for (let idx = 0; idx < 256; idx += 1) {
      let value = idx;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      table[idx] = value >>> 0;
    }
    return table;
  })();

  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    bytes.forEach((byte) => {
      crc = zipCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    });
    return (crc ^ 0xffffffff) >>> 0;
  };

  const writeZipNumber = (target, offset, value, bytes) => {
    for (let idx = 0; idx < bytes; idx += 1) target[offset + idx] = (value >>> (idx * 8)) & 0xff;
  };

  const createStoredZip = (files) => {
    const encoder = new TextEncoder();
    const entries = files.map((file) => {
      const name = encoder.encode(file.name);
      const data = typeof file.content === "string" ? encoder.encode(file.content) : file.content;
      return { name, data, crc: crc32(data), offset: 0 };
    });
    const localSize = entries.reduce((sum, entry) => sum + 30 + entry.name.length + entry.data.length, 0);
    const centralSize = entries.reduce((sum, entry) => sum + 46 + entry.name.length, 0);
    const output = new Uint8Array(localSize + centralSize + 22);
    let offset = 0;
    entries.forEach((entry) => {
      entry.offset = offset;
      writeZipNumber(output, offset, 0x04034b50, 4);
      writeZipNumber(output, offset + 4, 20, 2);
      writeZipNumber(output, offset + 6, 0, 2);
      writeZipNumber(output, offset + 8, 0, 2);
      writeZipNumber(output, offset + 10, 0, 2);
      writeZipNumber(output, offset + 12, 0, 2);
      writeZipNumber(output, offset + 14, entry.crc, 4);
      writeZipNumber(output, offset + 18, entry.data.length, 4);
      writeZipNumber(output, offset + 22, entry.data.length, 4);
      writeZipNumber(output, offset + 26, entry.name.length, 2);
      writeZipNumber(output, offset + 28, 0, 2);
      output.set(entry.name, offset + 30);
      output.set(entry.data, offset + 30 + entry.name.length);
      offset += 30 + entry.name.length + entry.data.length;
    });
    const centralOffset = offset;
    entries.forEach((entry) => {
      writeZipNumber(output, offset, 0x02014b50, 4);
      writeZipNumber(output, offset + 4, 20, 2);
      writeZipNumber(output, offset + 6, 20, 2);
      writeZipNumber(output, offset + 8, 0, 2);
      writeZipNumber(output, offset + 10, 0, 2);
      writeZipNumber(output, offset + 12, 0, 2);
      writeZipNumber(output, offset + 14, 0, 2);
      writeZipNumber(output, offset + 16, entry.crc, 4);
      writeZipNumber(output, offset + 20, entry.data.length, 4);
      writeZipNumber(output, offset + 24, entry.data.length, 4);
      writeZipNumber(output, offset + 28, entry.name.length, 2);
      writeZipNumber(output, offset + 30, 0, 2);
      writeZipNumber(output, offset + 32, 0, 2);
      writeZipNumber(output, offset + 34, 0, 2);
      writeZipNumber(output, offset + 36, 0, 2);
      writeZipNumber(output, offset + 38, 0, 4);
      writeZipNumber(output, offset + 42, entry.offset, 4);
      output.set(entry.name, offset + 46);
      offset += 46 + entry.name.length;
    });
    writeZipNumber(output, offset, 0x06054b50, 4);
    writeZipNumber(output, offset + 4, 0, 2);
    writeZipNumber(output, offset + 6, 0, 2);
    writeZipNumber(output, offset + 8, entries.length, 2);
    writeZipNumber(output, offset + 10, entries.length, 2);
    writeZipNumber(output, offset + 12, centralSize, 4);
    writeZipNumber(output, offset + 16, centralOffset, 4);
    writeZipNumber(output, offset + 20, 0, 2);
    return output;
  };

  const safeSheetName = (value) => String(value || "Report").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Report";

  const downloadWorkbook = (filename, sheetName, rows) => {
    const xml = (value) => escapeHtml(value ?? "");
    const sheetData = rows
      .map(
        (row, rowIndex) =>
          `<row r="${rowIndex + 1}">${row
            .map((cell) => `<c t="inlineStr"><is><t>${xml(cell)}</t></is></c>`)
            .join("")}</row>`,
      )
      .join("");
    const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <cols><col min="1" max="12" width="24" customWidth="1"/></cols>
        <sheetData>${sheetData}</sheetData>
      </worksheet>`;
    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="${xml(safeSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`;
    const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
      </Relationships>`;
    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`;
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
        <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
      </Types>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
        <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
        <borders count="1"><border/></borders>
        <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
        <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
      </styleSheet>`;
    const zipBytes = createStoredZip([
      { name: "[Content_Types].xml", content: contentTypes },
      { name: "_rels/.rels", content: rootRels },
      { name: "xl/workbook.xml", content: workbook },
      { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
      { name: "xl/styles.xml", content: styles },
      { name: "xl/worksheets/sheet1.xml", content: worksheet },
    ]);
    downloadBlob(filename, new Blob([zipBytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  };

  const periodStart = (period) => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (period === "weekly") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    if (period === "monthly") start.setDate(1);
    if (period === "yearly") {
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
    }
    return start;
  };

  const inPeriod = (dateValue, period) => {
    const date = new Date(dateValue || Date.now());
    if (Number.isNaN(date.getTime())) return false;
    return date >= periodStart(period);
  };

  const exportPayrollReport = (moduleId, reportName, period = "monthly") => {
    const history = Array.isArray(erpState().payrollHistory) ? erpState().payrollHistory : [];
    const periodHistory = history.filter((row) => inPeriod(row.createdAt, period));
    if (/payslip/i.test(reportName)) {
      const paid = periodHistory.filter((row) => row.status === "paid");
      const payslips = paid
        .flatMap((row) =>
          (row.employees || []).map(
            (employee) =>
              `MAPPHEX PAYSLIP\nMonth: ${row.month}\nEmployee: ${employee.name}\nDepartment: ${employee.department}\nGross Salary: ${money(employee.salary)}\nTax/Deductions: ${money(Math.round(employee.salary * 0.1))}\nNet Pay: ${money(Math.round(employee.salary * 0.9))}\nStatus: Paid\nReference: ${row.approvalId}\n`,
          ),
        )
        .join("\n---\n");
      downloadText(`${moduleId}-${period}-payslips.txt`, payslips || `No paid payrolls available for ${period} payslip generation.`);
      return true;
    }
    if (/payroll history|approval logs|tax deductions|payroll payments/i.test(reportName)) {
      const rows = [
        [`${reportName} Report`],
        ["Module", moduleId],
        ["Period", period],
        ["Generated", new Date().toLocaleString()],
        [],
        ["Month", "Title", "Status", "Amount", "Employees", "Reason", "Created"],
        ...periodHistory.map((row) =>
          [
            row.month,
            row.title,
            row.status,
            row.amount,
            (row.employees || []).map((employee) => employee.name).join("; "),
            row.reason,
            humanDate(row.createdAt),
          ],
        ),
      ];
      if (!periodHistory.length) rows.push(["No payroll records for this period."]);
      downloadWorkbook(`${moduleId}-${period}-${reportName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.xlsx`, reportName, rows);
      return true;
    }
    return false;
  };

  const exportPeriodReport = (moduleId, reportName, period = "monthly") => {
    if (exportPayrollReport(moduleId, reportName, period)) return true;
    const rows = Array.isArray(moduleData()[moduleId]) ? moduleData()[moduleId] : [];
    const state = ensurePortalState(moduleId);
    const activities = Array.isArray(storeGet(ACTIVITY_KEY, [])) ? storeGet(ACTIVITY_KEY, []) : [];
    const transactions = Array.isArray(storeGet(TRANSACTIONS_KEY, [])) ? storeGet(TRANSACTIONS_KEY, []) : [];
    const filteredRecords = rows.filter((row) => inPeriod(row.updatedAt, period));
    const filteredApprovals = (state.approvals || []).filter((item) => (item.target === moduleId || item.moduleId === moduleId || item.source === moduleId) && inPeriod(item.updatedAt || item.createdAt, period));
    const filteredMessages = (state.messages || []).filter((item) => (item.moduleId === moduleId || item.to === moduleId || item.from === moduleId) && inPeriod(item.createdAt, period));
    const filteredActivities = activities.filter((item) => item.moduleId === moduleId && inPeriod(item.at, period));
    const filteredTransactions = transactions.filter((item) => item.sourceModule === moduleId && inPeriod(item.createdAt, period));
    const reportRows = [
      [`${reportName || moduleId} Report`],
      ["Module", moduleId],
      ["Period", period],
      ["Generated", new Date().toLocaleString()],
      [],
      ["Section", "Date", "Reference", "Status", "Amount", "Details"],
      ...filteredRecords.map((row) => ["Record", row.updatedAt, row.id, "active", "", row.values?.join(" | ")]),
      ...filteredApprovals.map((row) => ["Approval", row.updatedAt || row.createdAt, row.id, row.status, row.amount, `${row.title} - ${row.reason || row.note || ""}`]),
      ...filteredMessages.map((row) => ["Message", row.createdAt, row.id, "sent", "", `${row.from} to ${row.to}: ${row.body}`]),
      ...filteredActivities.map((row) => ["Activity", row.at, row.id, row.action, "", row.detail?.message || row.detail?.label || JSON.stringify(row.detail || {})]),
      ...filteredTransactions.map((row) => ["Transaction", row.createdAt, row.id, row.status, row.amount, `${row.type} ${row.ref || ""}`]),
    ];
    if (reportRows.length === 6) reportRows.push(["No report records for this period."]);
    const filename = `${moduleId}-${period}-${reportName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "report"}.xlsx`;
    downloadWorkbook(filename, reportName || `${moduleId} Report`, reportRows);
    return true;
  };

  const salesReportDetails = (reportName, period) => {
    const rows = Array.isArray(moduleData().sales) ? moduleData().sales : [];
    const state = ensurePortalState("sales");
    const activities = Array.isArray(storeGet(ACTIVITY_KEY, [])) ? storeGet(ACTIVITY_KEY, []) : [];
    const transactions = Array.isArray(storeGet(TRANSACTIONS_KEY, [])) ? storeGet(TRANSACTIONS_KEY, []) : [];
    const filteredRecords = rows.filter((row) => inPeriod(row.updatedAt, period));
    const filteredApprovals = (state.approvals || []).filter((item) => (item.target === "sales" || item.moduleId === "sales" || item.source === "sales") && inPeriod(item.updatedAt || item.createdAt, period));
    const filteredMessages = (state.messages || []).filter((item) => (item.moduleId === "sales" || item.to === "sales" || item.from === "sales") && inPeriod(item.createdAt, period));
    const filteredActivities = activities.filter((item) => item.moduleId === "sales" && inPeriod(item.at, period));
    const filteredTransactions = transactions.filter((item) => item.sourceModule === "sales" && inPeriod(item.createdAt, period));
    const totalAmount = filteredRecords.reduce((sum, row) => {
      const amount = Number(String(row.values?.[3] || "").replace(/[^\d.-]/g, "")) || 0;
      return sum + amount;
    }, 0);
    return {
      reportName: reportName || "Orders",
      period: period || "monthly",
      records: filteredRecords,
      approvals: filteredApprovals,
      messages: filteredMessages,
      activities: filteredActivities,
      transactions: filteredTransactions,
      totalAmount,
    };
  };

  const renderSalesReportPreview = (details, formatLabel, generatedAtText) => {
    const recordRows = details.records.length
      ? details.records
          .slice(0, 8)
          .map((row) => `<tr><td>${escapeHtml(row.values?.[0] || "-")}</td><td>${escapeHtml(row.values?.[1] || "-")}</td><td>${escapeHtml(row.values?.[2] || "-")}</td><td>${escapeHtml(row.values?.[3] || "-")}</td><td>${escapeHtml(row.values?.[4] || "-")}</td><td>${escapeHtml(humanDate(row.updatedAt))}</td></tr>`)
          .join("")
      : `<tr><td colspan="6" class="muted">No sales records for this period.</td></tr>`;
    const approvalRows = details.approvals.length
      ? details.approvals
          .slice(0, 6)
          .map((row) => `<li><strong>${escapeHtml(row.title || "Approval")}</strong><span>${escapeHtml(row.status || "pending")} - ${escapeHtml(row.reason || row.note || "No note")}</span></li>`)
          .join("")
      : `<li><span>No approval records for this period.</span></li>`;
    return `<div class="sales-report-result">
      <strong>${escapeHtml(details.reportName)} report ready</strong>
      <span>${escapeHtml(details.period)} - ${escapeHtml(formatLabel)} - ${escapeHtml(generatedAtText)}</span>
      <div class="sales-report-summary">
        <article><span>Sales records</span><strong>${details.records.length}</strong></article>
        <article><span>Approvals</span><strong>${details.approvals.length}</strong></article>
        <article><span>Transactions</span><strong>${details.transactions.length}</strong></article>
        <article><span>Total amount</span><strong>${escapeHtml(money(details.totalAmount))}</strong></article>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Customer</th><th>Item / Service</th><th>Purpose / Delivery</th><th>Amount</th><th>Invoice Status</th><th>Updated</th></tr></thead>
          <tbody>${recordRows}</tbody>
        </table>
      </div>
      <div class="sales-report-notes"><h3>Approval notes</h3><ul>${approvalRows}</ul></div>
      <div class="sales-report-actions">
        <button class="btn" data-sales-report-export="pdf" type="button">Export PDF</button>
        <button class="btn primary" data-sales-report-export="excel" type="button">Export XLSX</button>
      </div>
    </div>`;
  };

  const exportSalesReportExcel = (reportName, period, generatedAtText) => {
    const details = salesReportDetails(reportName, period);
    const generatedAt = generatedAtText || document.querySelector("[data-sales-report-time]")?.dataset.salesGeneratedAt || new Date().toLocaleString();
    const rows = [
      ["Sales Report"],
      ["Report", details.reportName],
      ["Period", details.period],
      ["Generated", generatedAt],
      ["Total amount", money(details.totalAmount)],
      ["Sales records", details.records.length],
      ["Approvals", details.approvals.length],
      ["Messages", details.messages.length],
      ["Activities", details.activities.length],
      ["Transactions", details.transactions.length],
      [],
      ["Sales Records"],
      ["Customer", "Item / Service", "Purpose / Delivery", "Amount", "Invoice Status", "Updated"],
      ...(details.records.length
        ? details.records.map((row) => [row.values?.[0] || "-", row.values?.[1] || "-", row.values?.[2] || "-", row.values?.[3] || "-", row.values?.[4] || "-", humanDate(row.updatedAt)])
        : [["No sales records for this period."]]),
      [],
      ["Approvals"],
      ["Title", "Status", "Amount", "Note / Reason", "Updated"],
      ...(details.approvals.length
        ? details.approvals.map((row) => [row.title || "Approval", row.status || "pending", row.amount || 0, row.reason || row.note || "", humanDate(row.updatedAt || row.createdAt)])
        : [["No approvals for this period."]]),
      [],
      ["Transactions"],
      ["Type", "Reference", "Status", "Amount", "Created"],
      ...(details.transactions.length
        ? details.transactions.map((row) => [row.type || "", row.ref || row.id || "", row.status || "", row.amount || 0, humanDate(row.createdAt)])
        : [["No transactions for this period."]]),
      [],
      ["Messages"],
      ["From", "To", "Message", "Created"],
      ...(details.messages.length
        ? details.messages.map((row) => [row.from || "", row.to || "", row.body || "", humanDate(row.createdAt)])
        : [["No messages for this period."]]),
      [],
      ["Activity"],
      ["Action", "Details", "Created"],
      ...(details.activities.length
        ? details.activities.map((row) => [row.action || "", row.detail?.message || row.detail?.label || JSON.stringify(row.detail || {}), humanDate(row.at)])
        : [["No activity for this period."]]),
    ];
    const filename = `sales-${details.period}-${details.reportName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "report"}.xlsx`;
    downloadWorkbook(filename, "Sales Report", rows);
  };

  const setSalesReportStatus = (reportName, period, format) => {
    const report = reportName || "Orders";
    const selectedPeriod = period || "monthly";
    const selectedFormat = format || "pdf";
    const formatLabel = selectedFormat === "excel" ? "XLSX" : "PDF";
    const status = document.querySelector("[data-sales-report-status]");
    const type = document.querySelector("[data-sales-report-type]");
    const formatEl = document.querySelector("[data-sales-report-format]");
    const time = document.querySelector("[data-sales-report-time]");
    const output = $("#sales-report-output");
    const generatedAtText = time?.dataset.salesGeneratedAt || new Date().toLocaleString();
    if (status) status.textContent = "Generated";
    if (type) type.textContent = report;
    if (formatEl) formatEl.textContent = formatLabel;
    if (time) {
      time.dataset.salesGeneratedAt = generatedAtText;
      time.textContent = generatedAtText;
    }
    if (output) {
      output.innerHTML = renderSalesReportPreview(salesReportDetails(report, selectedPeriod), formatLabel, generatedAtText);
    }
    return generatedAtText;
  };

  const printSalesReport = (reportName, period, generatedAtText) => {
    const title = `${reportName || "Orders"} report`;
    const generatedAt = generatedAtText || document.querySelector("[data-sales-report-time]")?.dataset.salesGeneratedAt || new Date().toLocaleString();
    const details = salesReportDetails(reportName, period);
    const recordRows = details.records.length
      ? details.records
          .map((row) => `<tr><td>${escapeHtml(row.values?.[0] || "-")}</td><td>${escapeHtml(row.values?.[1] || "-")}</td><td>${escapeHtml(row.values?.[2] || "-")}</td><td>${escapeHtml(row.values?.[3] || "-")}</td><td>${escapeHtml(row.values?.[4] || "-")}</td><td>${escapeHtml(humanDate(row.updatedAt))}</td></tr>`)
          .join("")
      : `<tr><td colspan="6">No sales records for this period.</td></tr>`;
    const approvalRows = details.approvals.length
      ? details.approvals.map((row) => `<tr><td>${escapeHtml(row.title || "Approval")}</td><td>${escapeHtml(row.status || "pending")}</td><td>${escapeHtml(row.reason || row.note || "")}</td><td>${escapeHtml(humanDate(row.updatedAt || row.createdAt))}</td></tr>`).join("")
      : `<tr><td colspan="4">No approval records for this period.</td></tr>`;
    const reportWindow = window.open("", "_blank", "width=900,height=700");
    if (!reportWindow) {
      window.print();
      return;
    }
    reportWindow.document.write(`<!doctype html>
      <html>
        <head>
          <title>${escapeHtml(title)}</title>
          <style>
            body { margin: 32px; color: #111827; font-family: Arial, sans-serif; }
            h1 { margin: 0 0 8px; font-size: 24px; }
            p { margin: 0 0 18px; color: #4b5563; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { padding: 12px; border: 1px solid #d1d5db; text-align: left; }
            th { background: #f3f4f6; }
            .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
            .summary div { border: 1px solid #d1d5db; padding: 12px; }
            .summary span { display: block; color: #6b7280; font-size: 12px; }
            .summary strong { display: block; margin-top: 4px; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(period || "daily")} - PDF - ${escapeHtml(generatedAt)}</p>
          <div class="summary">
            <div><span>Sales records</span><strong>${details.records.length}</strong></div>
            <div><span>Approvals</span><strong>${details.approvals.length}</strong></div>
            <div><span>Transactions</span><strong>${details.transactions.length}</strong></div>
            <div><span>Total amount</span><strong>${escapeHtml(money(details.totalAmount))}</strong></div>
          </div>
          <h2>Sales records</h2>
          <table>
            <thead><tr><th>Customer</th><th>Item / Service</th><th>Purpose / Delivery</th><th>Amount</th><th>Invoice Status</th><th>Updated</th></tr></thead>
            <tbody>${recordRows}</tbody>
          </table>
          <h2>Approval review</h2>
          <table>
            <thead><tr><th>Title</th><th>Status</th><th>Note</th><th>Updated</th></tr></thead>
            <tbody>${approvalRows}</tbody>
          </table>
        </body>
      </html>`);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  };

  const postModuleRecordTransaction = async (moduleId, row) => {
    const amount = moduleId === "sales"
      ? Number(String(row.values?.[3] || "").replace(/[^\d.-]/g, "")) || 0
      : row.values
          .map((value) => Number(String(value).replace(/[^\d.-]/g, "")))
          .find((value) => Number.isFinite(value) && value > 0) || 0;
    const transactionTypes = {
      sales: "sale",
      retail: "sale",
      pharmacy: "pharmacy_sale",
      hospital: "hospital_billing",
      restaurant: "restaurant_order",
      technology: "service_invoice",
      procurement: "procurement_delivery",
      manufacturing: "production_order",
      logistics: "delivery_service",
    };
    if (!transactionTypes[moduleId] && amount <= 0) return;
    await window.ERPClient?.postTransaction?.({
      sourceModule: moduleId,
      type: transactionTypes[moduleId] || "module_record",
      amount,
      quantity: 1,
      itemId: moduleId === "sales" ? row.values?.[1] || row.id : row.values[0] || row.id,
      ref: row.id,
      payload: { values: row.values },
    }).catch(() => null);
  };

  document.addEventListener("DOMContentLoaded", async () => {
    const params = new URLSearchParams(location.search);
    const moduleId = String(params.get("portal") || params.get("module") || "").trim().toLowerCase();
    const tenant = params.get("tenant") || window.EnterpriseCore?.currentTenantId?.();
    if (tenant) window.EnterpriseCore?.setTenant?.(tenant);

    const session = window.EnterpriseCore?.requireOrganizationSession?.(tenant);
    if (!session?.tenantId) {
      location.href = "organization-login.html";
      return;
    }
    window.EnterpriseCore?.setTenant?.(session.tenantId);

    try {
      let admin;
      let mine;
      try {
        [admin, mine] = await Promise.all([fetchJson("/api/org-admin"), fetchJson("/api/organizations?scope=mine").catch(() => null)]);
      } catch (apiErr) {
        if (!isLocalDevelopment()) throw apiErr;
        admin = { ok: true, users: readJson(USERS_KEY, []), settings: readJson(SETTINGS_KEY, {}), portalCatalog: PORTAL_CATALOG };
        mine = { ok: true, organization: localOrg(session.tenantId) };
      }

      const settings = admin.settings || {};
      orgContext = {
        businessType: settings.businessType || mine?.organization?.businessType || "general",
        settings,
        organization: mine?.organization || {},
      };
      if (settings.agreementAccepted !== true) {
        location.href = `organization-agreement.html?tenant=${encodeURIComponent(session.tenantId)}`;
        return;
      }

      const installed = new Set((settings.installedPortals || []).filter((id) => VALID_PORTAL_IDS.has(id)));
      if (!moduleId || !installed.has(moduleId)) {
        location.replace(`portal-selection.html?tenant=${encodeURIComponent(session.tenantId)}`);
        return;
      }
      if (!window.EnterpriseCore?.canOpenPortal?.(moduleId, session, { installedPortals: [...installed] })) {
        location.replace("access-denied.html");
        return;
      }

      const moduleDef = enrichPortal((admin.portalCatalog || PORTAL_CATALOG).find((item) => item.id === moduleId));
      activeModuleId = moduleId;
      const workflow = workflowFor(moduleId);
      const org = mine?.organization || {};
      const permissions = settings.modulePermissions?.[moduleId] || [];
      const moduleCode = (moduleDef.title || "M").slice(0, 2).toUpperCase();

      document.title = `${moduleDef.title} • MAPPHEX`;
      $("#module-title").textContent = moduleDef.title;
      $("#module-subtitle").textContent = `${org.organizationId || session.tenantId} • workspace portal`;
      $("#module-heading").textContent = moduleDef.title;
      $("#module-description").textContent = moduleDef.description;
      $("#module-icon").textContent = moduleCode;
      $("#module-org-name").textContent = org.name || "Organization";
      $("#module-org-id").textContent = org.organizationId || session.tenantId;
      $("#module-kpi-a-label").textContent = workflow.labels[0];
      $("#module-kpi-a-foot").textContent = workflow.title;
      $("#module-kpi-users").textContent = Array.isArray(admin.users) ? admin.users.length : 0;
      $("#module-kpi-modules").textContent = installed.size;
      $("#module-kpi-tenant").textContent = session.tenantId;
      $("#hub-link").href = `organization-workspace.html?tenant=${encodeURIComponent(session.tenantId)}`;
      $("#module-workflow-title").textContent = workflow.title;
      $("#module-workflow-subtitle").textContent = moduleDef.componentRole || moduleDef.description;
      if ($("#module-permissions")) $("#module-permissions").textContent = permissions.length ? permissions.join(", ") : "Uses inherited organization permissions.";
      if ($("#module-activity-note")) $("#module-activity-note").textContent = moduleDef.componentRole || "Actions are recorded in the workspace activity stream.";

      await hydrateSharedData();
      if (moduleId === "sales") {
        resetSalesRecordsOnce(session.tenantId);
        await store()?.flush?.().catch(() => null);
      }
      ensurePortalState(moduleId);
      applyModulePreferences(moduleId);

      renderNav(moduleId, moduleDef);
      renderForm(moduleId, workflow);
      renderRows(moduleId, workflow);
      renderEnterpriseSections(moduleId, moduleDef);
      $("#module-kpi-users").textContent = Array.isArray(admin.users) ? admin.users.length : 0;
      $("#module-kpi-modules").textContent = installed.size;
      $("#module-kpi-tenant").textContent = session.tenantId;
      refreshEnterpriseSections(moduleId);

      $("#module-menu-toggle")?.addEventListener("click", () => {
        const mobile = window.matchMedia("(max-width: 980px)").matches;
        if (mobile) setMenuOpen(!$("#module-sidebar")?.classList.contains("is-open"));
        else setMenuOpen(!$("#module-sidebar")?.classList.contains("is-collapsed"));
      });
      $("#module-menu-close")?.addEventListener("click", () => setMenuOpen(false));
      $("#module-menu-backdrop")?.addEventListener("click", () => setMenuOpen(false));
      $("#module-nav")?.addEventListener("click", (event) => {
        const link = event.target.closest("[data-module-nav]");
        if (link) {
          event.preventDefault();
          activatePortalMenuItem(link);
          closeMobileMenu();
        }
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") setMenuOpen(false);
      });
      window.addEventListener("hashchange", () => setActivePortalNav());
      window.addEventListener("popstate", () => setActivePortalNav());
      window.addEventListener("storage", (event) => {
        if (![ERP_STATE_KEY, MODULE_DATA_KEY, ACTIVITY_KEY, TRANSACTIONS_KEY, REPORTS_KEY, MODULE_PREFS_KEY].some((key) => event.key?.includes(key))) return;
        renderRows(moduleId, workflow, $("#module-search")?.value || "");
        applyModulePreferences(moduleId);
        refreshEnterpriseSections(moduleId);
      });
      window.addEventListener("mapphex:background-sync", async () => {
        await hydrateSharedData();
        renderRows(moduleId, workflow, $("#module-search")?.value || "");
        refreshEnterpriseSections(moduleId);
      });
      window.addEventListener("resize", () => {
        if (!window.matchMedia("(max-width: 980px)").matches) {
          $("#module-sidebar")?.classList.remove("is-open");
          document.body.classList.remove("module-menu-open");
          $("#module-menu-backdrop")?.setAttribute("aria-hidden", "true");
          $("#module-sidebar")?.setAttribute("aria-hidden", "false");
        }
      });
      setActivePortalNav();
      $("#module-search")?.addEventListener("input", (event) => renderRows(moduleId, workflow, event.currentTarget.value));
      $("#finance-filter")?.addEventListener("change", () => renderRows(moduleId, workflow, $("#module-search")?.value || ""));
      $("#module-table-body")?.addEventListener("click", async (event) => {
        const btn = event.target.closest("[data-record-delete]");
        if (!btn) return;
        if (!window.confirm("Delete this module record?")) return;
        const data = moduleData();
        const rows = Array.isArray(data[moduleId]) ? data[moduleId] : [];
        const row = rows.find((item) => item.id === btn.dataset.recordDelete);
        data[moduleId] = rows.filter((item) => item.id !== btn.dataset.recordDelete);
        saveModuleData(data);
        appendActivity(moduleId, "record.deleted", { id: btn.dataset.recordDelete, message: `${row?.values?.[0] || "Record"} deleted.` });
        renderRows(moduleId, workflow, $("#module-search")?.value || "");
        refreshEnterpriseSections(moduleId);
        await store()?.flush?.().catch(() => null);
      });
      $("#module-record-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = workflow.labels.map((_, idx) => String(new FormData(event.currentTarget).get(`field${idx}`) || "").trim());
        if (values.some((value) => !value)) return;
        const data = moduleData();
        const rows = Array.isArray(data[moduleId]) ? data[moduleId] : [];
        const fingerprint = values.map((value) => value.toLowerCase().replace(/\s+/g, " ")).join("|");
        if (rows.some((row) => (row.values || []).map((value) => String(value || "").toLowerCase().replace(/\s+/g, " ")).join("|") === fingerprint)) {
          window.EnterpriseCore?.notify?.("Duplicate record", "This module record already exists.", "error");
          return;
        }
        const row = { id: `${moduleId}-${Date.now()}`, values, updatedAt: nowIso(), tenantId: session.tenantId };
        rows.unshift(row);
        data[moduleId] = rows.slice(0, 500);
        saveModuleData(data);
        appendActivity(moduleId, "record.created", { values, message: values.join(" • ") });
        await postModuleRecordTransaction(moduleId, row);
        event.currentTarget.reset();
        renderRows(moduleId, workflow, $("#module-search")?.value || "");
        refreshEnterpriseSections(moduleId);
        await store()?.flush?.().catch(() => null);
      });

      document.addEventListener("click", (event) => {
        const financeJump = event.target.closest("[data-finance-jump]");
        if (financeJump) {
          event.preventDefault();
          const target = financeJump.dataset.financeJump || "transactions";
          const link = Array.from(document.querySelectorAll("[data-module-nav]")).find((item) => item.dataset.moduleNav === target);
          if (link) activatePortalMenuItem(link);
          return;
        }
        const focusFinanceForm = event.target.closest("[data-focus-finance-form]");
        if (focusFinanceForm) {
          event.preventDefault();
          document.getElementById("portal-records")?.scrollIntoView({ behavior: "smooth", block: "start" });
          document.querySelector("#module-record-form input, #module-record-form select, #module-record-form textarea")?.focus();
          return;
        }
        const focusRecordForm = event.target.closest("[data-focus-record-form]");
        if (focusRecordForm) {
          event.preventDefault();
          const recordsLink = Array.from(document.querySelectorAll("[data-module-nav]")).find((item) => item.dataset.moduleTarget === "portal-records");
          if (recordsLink) activatePortalMenuItem(recordsLink);
          else setPortalView("portal-records");
          document.getElementById("portal-records")?.scrollIntoView({ behavior: "smooth", block: "start" });
          document.querySelector("#module-record-form input, #module-record-form select, #module-record-form textarea")?.focus();
          return;
        }
        const moduleJump = event.target.closest("[data-module-jump]");
        if (moduleJump) {
          event.preventDefault();
          const target = moduleJump.dataset.moduleJump || "dashboard";
          const link = Array.from(document.querySelectorAll("[data-module-nav]")).find((item) => item.dataset.moduleNav === target);
          if (link) activatePortalMenuItem(link);
          return;
        }
        const settingsReset = event.target.closest("[data-module-settings-reset]");
        if (settingsReset) {
          event.preventDefault();
          const prefs = modulePrefs();
          prefs[moduleId] = { theme: "dark", density: "comfortable", defaultReport: "Orders", requireDiscountApproval: true, notifyFinance: true, showRevenue: true };
          saveModulePrefs(prefs);
          applyModulePreferences(moduleId);
          renderModuleDetailPage(moduleId, blueprintFor(moduleId), document.querySelector('[data-module-nav="settings"]'));
          return;
        }
        const clearRecords = event.target.closest("[data-clear-module-records]");
        if (clearRecords) {
          if (!window.confirm(`Delete all ${moduleDef.title} records?`)) return;
          const data = moduleData();
          const deleted = Array.isArray(data[moduleId]) ? data[moduleId].length : 0;
          data[moduleId] = [];
          saveModuleData(data);
          appendActivity(moduleId, "records.cleared", { message: `${deleted} ${moduleDef.title} records cleared.` });
          renderRows(moduleId, workflow, $("#module-search")?.value || "");
          refreshEnterpriseSections(moduleId);
          if (String(moduleViewFromUrl()).startsWith("module-page:")) {
            const activeLink = document.querySelector("[data-module-nav].active");
            renderModuleDetailPage(moduleId, blueprintFor(moduleId), activeLink);
          }
          store()?.flush?.().catch(() => null);
          return;
        }
        const action = event.target.closest("[data-erp-action]");
        if (action) {
          addWorkflowEvent(moduleId, action.dataset.erpAction, action.dataset.erpTarget, action.dataset.erpDetail);
          return;
        }
        const approval = event.target.closest("[data-approval-id]");
        if (approval) {
          updateApproval(moduleId, approval.dataset.approvalId, approval.dataset.approvalStatus);
          return;
        }
        const report = event.target.closest("[data-report-name]");
        if (report) {
          const period = report.dataset.reportPeriod || "monthly";
          if (exportPeriodReport(moduleId, report.dataset.reportName || "", period)) {
            appendActivity(moduleId, "report.downloaded", { label: report.dataset.reportName, message: `${period} ${report.dataset.reportName} downloaded.` });
            refreshEnterpriseSections(moduleId);
            return;
          }
          window.ERPClient?.sendWorkflow?.({
            sourceModule: moduleId,
            targetModule: "reporting",
            title: `${report.dataset.reportName} report generated`,
            detail: `${moduleId} generated ${report.dataset.reportName} for shared analytics.`,
            approvalRequired: false,
          }).catch(() => null);
          appendActivity(moduleId, "report.generated", { label: report.dataset.reportName, message: `${report.dataset.reportName} report generated.` });
          refreshEnterpriseSections(moduleId);
          return;
        }
        const exportBtn = event.target.closest("[data-erp-export]");
        if (exportBtn?.dataset.erpExport === "xlsx" || exportBtn?.dataset.erpExport === "csv") exportExcel(moduleId);
        if (exportBtn?.dataset.erpExport === "pdf") window.print();
        const salesExport = event.target.closest("[data-sales-report-export]");
        if (salesExport) {
          const form = $("#sales-report-form");
          const reportName = form?.elements?.namedItem("report")?.value || "Orders";
          const period = form?.elements?.namedItem("period")?.value || "monthly";
          const format = salesExport.dataset.salesReportExport || form?.elements?.namedItem("format")?.value || "pdf";
          const generatedAt = setSalesReportStatus(reportName, period, format);
          if (format === "excel") exportSalesReportExcel(reportName, period, generatedAt);
          else printSalesReport(reportName, period, generatedAt);
          appendActivity(moduleId, "report.exported", { label: reportName, message: `${period} ${reportName} exported as ${format}.` });
          refreshEnterpriseSections(moduleId);
        }
      });

      $("#sales-report-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const reportName = form.elements.namedItem("report")?.value || "Orders";
        const period = form.elements.namedItem("period")?.value || "monthly";
        const format = form.elements.namedItem("format")?.value || "pdf";
        setSalesReportStatus(reportName, period, format);
        appendActivity(moduleId, "report.generated", { label: reportName, message: `${period} ${reportName} report generated.` });
        await window.ERPClient?.sendWorkflow?.({
          sourceModule: moduleId,
          targetModule: "reporting",
          title: `${reportName} report generated`,
          detail: `${moduleId} generated ${reportName} for shared analytics.`,
          approvalRequired: false,
        }).catch(() => null);
        refreshEnterpriseSections(moduleId);
      });

      $("#erp-message-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const to = String(form.get("to") || "").trim();
        const body = String(form.get("body") || "").trim();
        const remote = await window.ERPClient?.sendMessage?.({ from: moduleId, to, body }).catch(() => null);
        if (remote?.state?.departmentWorkflows) {
          storeSet(ERP_STATE_KEY, remote.state.departmentWorkflows);
          if (remote.state.moduleActivity) storeSet(ACTIVITY_KEY, remote.state.moduleActivity);
          refreshEnterpriseSections(moduleId);
          return;
        }
        const state = erpState();
        state.messages = Array.isArray(state.messages) ? state.messages : [];
        state.messages.unshift({ id: `msg-${Date.now()}`, moduleId, from: moduleId, to, body, createdAt: nowIso() });
        saveErpState(state);
        appendActivity(moduleId, "message.sent", { message: `Message sent to ${to}` });
        refreshEnterpriseSections(moduleId);
      });
      document.addEventListener("submit", async (event) => {
        if (event.target?.id !== "module-settings-form") return;
        event.preventDefault();
        const prefs = modulePrefs();
        prefs[moduleId] = readModuleSettingsForm(event.target);
        saveModulePrefs(prefs);
        applyModulePreferences(moduleId);
        const saved = prefs[moduleId];
        const themeSummary = document.querySelector('[data-module-pref-summary="theme"]');
        const approvalsSummary = document.querySelector('[data-module-pref-summary="approvals"]');
        const reportSummary = document.querySelector('[data-module-pref-summary="report"]');
        if (themeSummary) themeSummary.textContent = saved.theme === "light" ? "Light" : "Dark";
        if (approvalsSummary) approvalsSummary.textContent = saved.requireDiscountApproval ? "Required" : "Optional";
        if (reportSummary) reportSummary.textContent = saved.defaultReport || "Orders";
        const note = document.querySelector("[data-module-settings-note]");
        if (note) note.textContent = "Settings saved.";
        refreshEnterpriseSections(moduleId);
        await store()?.flush?.().catch(() => null);
      });
    } catch (err) {
      window.EnterpriseCore?.notify?.("Module", err.message, "error");
    }
  });
})();
