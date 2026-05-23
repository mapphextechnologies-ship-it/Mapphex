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

  const PORTAL_CATALOG = window.EnterpriseModules?.catalog || [];
  const VALID_PORTAL_IDS = window.EnterpriseModules?.validIds || new Set(PORTAL_CATALOG.map((portal) => portal.id));
  const store = () => window.EnterpriseStore || null;
  let orgContext = { businessType: "general", settings: {}, organization: {} };

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
    hr: {
      entity: "Employee",
      form: ["Employee", "Department", "Salary", "Payroll Status"],
      responsibilities: ["Employee management", "Recruitment", "Attendance", "Leave requests", "Payroll preparation", "Promotions", "Employee documents", "Work schedules", "Performance reviews", "Training management", "Department assignments"],
      reports: ["Employee register", "Attendance", "Leave", "Payroll preparation", "Payslips", "Payroll history", "Tax deductions", "Approval logs", "Recruitment", "Performance", "Training"],
      workflows: [["Forward payroll to Finance", "finance"], ["Request role access", "admin"], ["Start recruitment", "department"], ["Schedule training", "staff"]],
    },
    finance: {
      entity: "Finance Entry",
      form: ["Entry", "Category", "Amount", "Status"],
      responsibilities: ["Record income", "Record expenses", "Review invoices", "Confirm payments", "Approve payroll", "Track budgets", "Prepare finance reports"],
      reports: ["Income", "Expenses", "Invoices", "Payments", "Payroll", "Budgets", "Taxes", "Audit log"],
      workflows: [["Approve payroll", "hr"], ["Approve purchase", "procurement"], ["Send invoice", "sales"], ["Confirm payment", "reporting"]],
    },
    sales: {
      entity: "Sales Order",
      form: ["Customer", "Order/Quotation", "Amount", "Invoice Status"],
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
    const pending = (state.approvals || []).filter((item) => (item.target === moduleId || item.moduleId === moduleId) && item.status === "pending").length;
    const moduleTransactions = (Array.isArray(transactions) ? transactions : []).filter((tx) => tx.sourceModule === moduleId).length;
    const revenue = Number(reports?.[moduleId]?.revenue || 0);
    return {
      kpis: [
        [standard.entity === "Finance Record" ? "Transactions" : `${standard.entity}s`, rows],
        ["Pending approvals", pending],
        ["Posted transactions", moduleTransactions],
        [revenue > 0 ? "Revenue" : "Reports", revenue > 0 ? revenue : standard.reports.length],
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
      title: `${standard.entity} Management`,
      labels,
      sample: labels.map(() => ""),
    };
  };

  const PORTAL_MENUS = {
    finance: ["Dashboard", "Revenue", "Expenses", "Payroll Approvals", "Transactions", "Budgets", "Reports", "Taxes", "Analytics", "Settings"],
    hr: ["Dashboard", "Employees", "Attendance", "Leave Requests", "Payroll", "Recruitment", "Performance", "Schedules", "Reports"],
    pharmacy: ["Dashboard", "Medicines", "Inventory", "Prescriptions", "Customers", "Suppliers", "Sales", "Expiry Alerts", "Reports"],
    technology: ["Dashboard", "Projects", "Tasks", "Clients", "Developers", "Support Tickets", "Documentation", "Billing", "Analytics"],
    sales: ["Dashboard", "Orders", "Products", "Customers", "Discounts", "Reports", "Revenue"],
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

  const menuItemsFor = (moduleId, moduleDef) => {
    const blueprint = blueprintFor(moduleId);
    const base = PORTAL_MENUS[moduleId] || ["Dashboard", blueprint.title || "Records", "Approvals", "Messages", "Reports", "Activity", "Settings"];
    return base.map((label, idx) => ({
      label,
      target: idx === 0
        ? "dashboard"
        : /approval|payroll/i.test(label)
          ? "approvals"
          : /report|tax|analytic|revenue|budget|expense|transaction|billing|cost/i.test(label)
            ? "reports"
            : "portal-records",
      hash: idx === 0 ? "dashboard" : label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "records",
      icon: (label || moduleDef?.title || "M").slice(0, 1).toUpperCase(),
    }));
  };

  const PORTAL_VIEW_GROUPS = {
    dashboard: ["portal-dashboard", "portal-kpis", "dashboard"],
    "portal-records": ["portal-records"],
    approvals: ["approvals"],
    reports: ["reports"],
  };

  const setPortalView = (target = "dashboard") => {
    const group = PORTAL_VIEW_GROUPS[target] || PORTAL_VIEW_GROUPS["portal-records"];
    const visible = new Set(group);
    ["portal-dashboard", "portal-kpis", "portal-records", "dashboard", "approvals", "reports"].forEach((id) => {
      const section = document.getElementById(id);
      if (section) section.hidden = !visible.has(id);
    });
  };

  const hydrateSharedData = async () => {
    const shared = store();
    if (!shared?.bootstrap) return;
    await shared.bootstrap([MODULE_DATA_KEY, ACTIVITY_KEY, ERP_STATE_KEY, TRANSACTIONS_KEY, REPORTS_KEY]).catch(() => null);
    const remote = await window.ERPClient?.getState?.().catch(() => null);
    if (remote?.departmentWorkflows) storeSet(ERP_STATE_KEY, remote.departmentWorkflows);
    if (remote?.moduleRecords) storeSet(MODULE_DATA_KEY, remote.moduleRecords);
    if (remote?.moduleActivity) storeSet(ACTIVITY_KEY, remote.moduleActivity);
    if (remote?.transactions) storeSet(TRANSACTIONS_KEY, remote.transactions);
    if (remote?.reports) storeSet(REPORTS_KEY, remote.reports);
  };

  const moduleData = () => storeGet(MODULE_DATA_KEY, {});
  const saveModuleData = (data) => storeSet(MODULE_DATA_KEY, data);
  const erpState = () => storeGet(ERP_STATE_KEY, {});
  const saveErpState = (data) => storeSet(ERP_STATE_KEY, data);

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
    $("#module-nav").innerHTML = items
      .map((item, idx) => `<a class="${idx === 0 ? "active" : ""}" href="#${escapeHtml(item.hash)}" data-module-nav="${escapeHtml(item.hash)}" data-module-target="${escapeHtml(item.target)}"><span><b aria-hidden="true">${escapeHtml(item.icon)}</b>${escapeHtml(item.label)}</span><small>${idx === 0 ? "Open" : "View"}</small></a>`)
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

  const setActivePortalNav = (hash = location.hash) => {
    const current = String(hash || "#dashboard").replace(/^#/, "");
    let target = "dashboard";
    document.querySelectorAll("[data-module-nav]").forEach((link) => {
      const active = link.dataset.moduleNav === current || (!hash && link.dataset.moduleNav === "dashboard");
      link.classList.toggle("active", active);
      if (active) {
        target = link.dataset.moduleTarget || "dashboard";
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
    setPortalView(target);
  };

  const renderForm = (workflow) => {
    $("#module-record-form").innerHTML =
      workflow.labels
        .map((label, idx) => `<label class="field"><span>${escapeHtml(label)}</span><input name="field${idx}" required /></label>`)
        .join("") + `<button class="btn primary" type="submit">Add Record</button>`;
  };

  const renderRows = (moduleId, workflow, query = "") => {
    const data = moduleData();
    const rows = Array.isArray(data[moduleId]) ? data[moduleId] : [];
    const q = query.trim().toLowerCase();
    const visible = q ? rows.filter((row) => row.values.join(" ").toLowerCase().includes(q)) : rows;
    $("#module-empty").hidden = visible.length > 0;
    $("#module-table-head").innerHTML = [...workflow.labels, "Updated", "Actions"].map((label) => `<th>${escapeHtml(label)}</th>`).join("");
    $("#module-table-body").innerHTML = visible
      .map((row) => `<tr>${row.values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}<td>${escapeHtml(humanDate(row.updatedAt))}</td><td><button class="btn danger" type="button" data-record-delete="${escapeHtml(row.id)}">Delete</button></td></tr>`)
      .join("");
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
    const recordCopy = document.querySelector(".module-record-head p");
    if (recordCopy) recordCopy.textContent = "Add simple ledger entries for income, expenses, invoices, payments, payroll, budgets, and taxes.";
    $("#module-record-form")?.classList.add("finance-entry-form");
    const recordTitle = $("#portal-records .panel-header h2");
    if (recordTitle) recordTitle.textContent = "Finance Ledger";
    const recordActions = $("#portal-records .panel-header .panel-actions");
    if (recordActions) {
      recordActions.innerHTML = `<input id="module-search" type="search" placeholder="Search finance entries..." /><button class="btn" data-erp-export="csv" type="button">Export Excel</button><button class="btn" data-erp-export="pdf" type="button">Print / PDF</button>`;
    }
    const portalKpis = $("#portal-kpis");
    if (portalKpis && !portalKpis.classList.contains("finance-kpis")) {
      portalKpis.classList.add("finance-kpis");
      portalKpis.innerHTML = `
        <article class="kpi"><div class="kpi-label">Finance Entries</div><div id="module-kpi-a" class="kpi-value">0</div><div class="kpi-foot muted">Ledger rows</div></article>
        <article class="kpi"><div class="kpi-label">Money In</div><div id="finance-money-in" class="kpi-value">KES 0</div><div class="kpi-foot muted">Income and received payments</div></article>
        <article class="kpi"><div class="kpi-label">Money Out</div><div id="finance-money-out" class="kpi-value">KES 0</div><div class="kpi-foot muted">Expenses, purchases, payroll</div></article>
        <article class="kpi"><div class="kpi-label">Open Items</div><div id="finance-open-items" class="kpi-value">0</div><div class="kpi-foot muted">Pending or unpaid entries</div></article>`;
    }
    if ($("#finance-workspace-sections")) return;
    $("#portal-records")?.insertAdjacentHTML(
      "beforebegin",
      `<div id="finance-workspace-sections" class="finance-workspace-sections">
      <section class="finance-primary-workspace">
        <article class="panel">
          <div class="panel-header"><h2>Finance Actions</h2><span class="badge">Workflow</span></div>
          <div id="erp-actions" class="erp-action-list"></div>
        </article>
        <article id="reports" class="panel">
          <div class="panel-header"><h2>Finance Reports</h2><span class="badge">Export Ready</span></div>
          <div id="erp-reports" class="erp-report-grid"></div>
        </article>
      </section>
      <aside id="approvals" class="finance-side-workspace">
        <article class="panel">
          <div class="panel-header"><h2>Approvals</h2><span id="erp-approval-count" class="badge">0 pending</span></div>
          <div id="erp-approvals" class="erp-approval-list"></div>
        </article>
        <article class="panel">
          <div class="panel-header"><h2>Audit Activity</h2><span class="badge">Live</span></div>
          <div id="erp-activity" class="erp-activity-list"></div>
        </article>
      </aside>
      </div>`,
    );
  };

  const financeTotals = () => {
    const rows = Array.isArray(moduleData().finance) ? moduleData().finance : [];
    return rows.reduce(
      (totals, row) => {
        const category = String(row.values?.[1] || "").toLowerCase();
        const amount = Number(String(row.values?.[2] || "").replace(/[^\d.-]/g, "")) || 0;
        const status = String(row.values?.[3] || "").toLowerCase();
        if (/income|revenue|payment|paid|receipt|sale|invoice/.test(category)) totals.moneyIn += amount;
        if (/expense|purchase|payroll|tax|budget|debt|cost|bill/.test(category)) totals.moneyOut += amount;
        if (/pending|unpaid|draft|open|waiting/.test(status)) totals.openItems += 1;
        return totals;
      },
      { entries: rows.length, moneyIn: 0, moneyOut: 0, openItems: 0 },
    );
  };

  const renderEnterpriseSections = (moduleId, moduleDef) => {
    if (moduleId === "finance") {
      renderFinanceSections();
      return;
    }
    document.body.classList.remove("finance-simple-page");
    if ($("#erp-sections")) return;
    const blueprint = blueprintFor(moduleId);
    $(".portal-hub-widgets").insertAdjacentHTML(
      "afterend",
      `<div id="erp-sections" class="erp-sections">
        <section id="dashboard" class="panel erp-dashboard-panel">
          <div class="panel-header">
            <div><h2>${escapeHtml(moduleDef.title)} Dashboard</h2><p class="portal-manager-subtitle">Live departmental KPIs, workflow status, and role-specific responsibilities.</p></div>
            <div class="panel-actions">
              <button class="btn" data-erp-export="csv" type="button">Export Excel</button>
              <button class="btn" data-erp-export="pdf" type="button">Print / PDF</button>
            </div>
          </div>
          <div id="erp-kpis" class="erp-kpi-grid"></div>
          <div class="erp-dashboard-grid">
            <article class="erp-card"><strong>Performance</strong>${renderBars(blueprint.chart)}<span class="muted">Realtime-ready trend view</span></article>
            <article class="erp-card"><strong>Responsibilities</strong><ul>${blueprint.responsibilities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>
          </div>
        </section>
        <section id="approvals" class="erp-work-grid">
          <article class="panel">
            <div class="panel-header"><h2>Department Actions</h2><span class="badge">Workflow</span></div>
            <div id="erp-actions" class="erp-action-list"></div>
          </article>
          <article class="panel">
            <div class="panel-header"><h2>Approvals Inbox</h2><span id="erp-approval-count" class="badge">0 pending</span></div>
            <div id="erp-approvals" class="erp-approval-list"></div>
          </article>
        </section>
        <section id="reports" class="erp-work-grid">
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
            <div class="panel-header"><h2>Reports & Audit</h2><span class="badge">PDF / Excel</span></div>
            <div id="erp-reports" class="erp-report-grid"></div>
            <div id="erp-activity" class="erp-activity-list"></div>
          </article>
        </section>
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
        .map(([label, value]) => `<article class="kpi"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value">${typeof value === "number" && label.toLowerCase().match(/revenue|sales|expenses|billing|amount/) ? money(value) : escapeHtml(value)}</div><div class="kpi-foot muted">Live workspace metric</div></article>`)
        .join("");
    }

    if (moduleId === "finance") {
      const totals = financeTotals();
      const entries = $("#module-kpi-a");
      const moneyIn = $("#finance-money-in");
      const moneyOut = $("#finance-money-out");
      const openItems = $("#finance-open-items");
      if (entries) entries.textContent = totals.entries;
      if (moneyIn) moneyIn.textContent = money(totals.moneyIn);
      if (moneyOut) moneyOut.textContent = money(totals.moneyOut);
      if (openItems) openItems.textContent = totals.openItems;
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
              <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.source)} • ${typeof item.amount === "number" && item.amount > 99 ? money(item.amount) : escapeHtml(item.amount)} • ${escapeHtml(item.status)}</span><p>${escapeHtml(item.note)} ${item.reason ? `Reason: ${escapeHtml(item.reason)}` : ""}</p>${employeeText}</div>
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
      : `<div class="empty-state">No approvals yet.</div>`;

    const messageList = $("#erp-messages");
    if (messageList) {
      messageList.innerHTML = messages.length
        ? messages.map((item) => `<article><strong>${escapeHtml(item.from)} to ${escapeHtml(item.to)}</strong><span>${escapeHtml(item.body)}</span><small>${escapeHtml(humanDate(item.createdAt))}</small></article>`).join("")
        : `<div class="empty-state">No messages yet.</div>`;
    }

    $("#erp-reports").innerHTML = blueprint.reports
      .map(
        (item) => `<article class="erp-report-card">
          <strong>${escapeHtml(item)}</strong>
          <div class="erp-report-periods">
            ${REPORT_PERIODS.map((period) => `<button class="btn" data-report-name="${escapeHtml(item)}" data-report-period="${period}" type="button">${period[0].toUpperCase()}${period.slice(1)}</button>`).join("")}
          </div>
        </article>`,
      )
      .join("");
    $("#erp-activity").innerHTML = activities.length
      ? activities.map((item) => `<article><strong>${escapeHtml(item.action)}</strong><span>${escapeHtml(item.detail?.message || item.detail?.label || "Activity recorded")}</span><small>${escapeHtml(humanDate(item.at))}</small></article>`).join("")
      : `<div class="empty-state">Activity will appear as this portal is used.</div>`;
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

  const exportCsv = (moduleId) => {
    const data = moduleData();
    const rows = Array.isArray(data[moduleId]) ? data[moduleId] : [];
    const csv = rows.map((row) => row.values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv || "No records"], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${moduleId}-report.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadText = (filename, text, type = "text/plain") => {
    const blob = new Blob([text], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
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

  const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

  const exportPayrollReport = (moduleId, reportName, period = "monthly") => {
    const history = Array.isArray(erpState().payrollHistory) ? erpState().payrollHistory : [];
    const periodHistory = history.filter((row) => inPeriod(row.createdAt, period));
    if (/payslip/i.test(reportName)) {
      const paid = periodHistory.filter((row) => row.status === "paid");
      const payslips = paid
        .flatMap((row) =>
          (row.employees || []).map(
            (employee) =>
              `Bytewave PAYSLIP\nMonth: ${row.month}\nEmployee: ${employee.name}\nDepartment: ${employee.department}\nGross Salary: ${money(employee.salary)}\nTax/Deductions: ${money(Math.round(employee.salary * 0.1))}\nNet Pay: ${money(Math.round(employee.salary * 0.9))}\nStatus: Paid\nReference: ${row.approvalId}\n`,
          ),
        )
        .join("\n---\n");
      downloadText(`${moduleId}-${period}-payslips.txt`, payslips || `No paid payrolls available for ${period} payslip generation.`);
      return true;
    }
    if (/payroll history|approval logs|tax deductions|payroll payments/i.test(reportName)) {
      const csv = [
        "Month,Title,Status,Amount,Employees,Reason,Created",
        ...periodHistory.map((row) =>
          [
            row.month,
            row.title,
            row.status,
            row.amount,
            (row.employees || []).map((employee) => employee.name).join("; "),
            row.reason,
            row.createdAt,
          ]
            .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
            .join(","),
        ),
      ].join("\n");
      downloadText(`${moduleId}-${period}-${reportName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`, csv, "text/csv");
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
    const csv = [
      "Section,Date,Reference,Status,Amount,Details",
      ...filteredRecords.map((row) => ["Record", row.updatedAt, row.id, "active", "", row.values?.join(" | ")]),
      ...filteredApprovals.map((row) => ["Approval", row.updatedAt || row.createdAt, row.id, row.status, row.amount, `${row.title} - ${row.reason || row.note || ""}`]),
      ...filteredMessages.map((row) => ["Message", row.createdAt, row.id, "sent", "", `${row.from} to ${row.to}: ${row.body}`]),
      ...filteredActivities.map((row) => ["Activity", row.at, row.id, row.action, "", row.detail?.message || row.detail?.label || JSON.stringify(row.detail || {})]),
      ...filteredTransactions.map((row) => ["Transaction", row.createdAt, row.id, row.status, row.amount, `${row.type} ${row.ref || ""}`]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\n");
    const filename = `${moduleId}-${period}-${reportName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "report"}.csv`;
    downloadText(filename, csv, "text/csv");
    return true;
  };

  const postModuleRecordTransaction = async (moduleId, row) => {
    const amount = row.values
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
      itemId: row.values[0] || row.id,
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

      const installed = new Set(
        [
          ...(settings.installedPortals || []),
          ...(settings.selectedComponents || []),
          ...(settings.allowedPortals || []),
          ...(settings.recommendedPortals || []),
        ].filter((id) => VALID_PORTAL_IDS.has(id)),
      );
      if (!moduleId || !installed.has(moduleId)) {
        location.replace(`portal-selection.html?tenant=${encodeURIComponent(session.tenantId)}`);
        return;
      }

      const moduleDef = enrichPortal((admin.portalCatalog || PORTAL_CATALOG).find((item) => item.id === moduleId));
      const workflow = workflowFor(moduleId);
      const org = mine?.organization || {};
      const permissions = settings.modulePermissions?.[moduleId] || [];
      const moduleCode = (moduleDef.title || "M").slice(0, 2).toUpperCase();

      document.title = `${moduleDef.title} • Bytewave`;
      $("#module-title").textContent = moduleDef.title;
      $("#module-subtitle").textContent = `${org.organizationId || session.tenantId} • enterprise portal`;
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
      ensurePortalState(moduleId);

      renderNav(moduleId, moduleDef);
      renderForm(workflow);
      renderRows(moduleId, workflow);
      renderEnterpriseSections(moduleId, moduleDef);
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
          const target = document.getElementById(link.dataset.moduleTarget || "");
          event.preventDefault();
          history.replaceState(null, "", `#${link.dataset.moduleNav}`);
          setActivePortalNav();
          closeMobileMenu();
        }
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") setMenuOpen(false);
      });
      window.addEventListener("hashchange", () => setActivePortalNav());
      window.addEventListener("storage", (event) => {
        if (![ERP_STATE_KEY, MODULE_DATA_KEY, ACTIVITY_KEY, TRANSACTIONS_KEY, REPORTS_KEY].some((key) => event.key?.includes(key))) return;
        renderRows(moduleId, workflow, $("#module-search")?.value || "");
        refreshEnterpriseSections(moduleId);
      });
      window.addEventListener("bytewave:background-sync", async () => {
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
        renderRows(moduleId, workflow, $("#module-search")?.value || "");
        refreshEnterpriseSections(moduleId);
        await store()?.flush?.().catch(() => null);
      });

      document.addEventListener("click", (event) => {
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
        if (exportBtn?.dataset.erpExport === "csv") exportCsv(moduleId);
        if (exportBtn?.dataset.erpExport === "pdf") window.print();
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
    } catch (err) {
      window.EnterpriseCore?.notify?.("Module", err.message, "error");
    }
  });
})();
