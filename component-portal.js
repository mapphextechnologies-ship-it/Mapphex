(() => {
  "use strict";

  const MODULES = {
    inventory: {
      mark: "IN",
      title: "Inventory Portal",
      hero: "Stock, catalog, movement, and availability",
      copy: "Control items, transfers, warehouse movement, low stock, and operational stock reports.",
      cards: [
        ["Items", "Catalog records, SKU details, and stock status."],
        ["Transfers", "Move stock between branches and warehouses."],
        ["Alerts", "Low stock, expiry, and reorder visibility."],
        ["Reports", "Stock summaries and movement logs."],
      ],
      rows: [
        ["Catalog item", "Active", "SKU / barcode", "Inventory"],
        ["Stock transfer", "Pending", "Branch movement", "Operations"],
        ["Low stock alert", "Pending", "Reorder needed", "Procurement"],
      ],
    },
    procurement: {
      mark: "PR",
      title: "Procurement Portal",
      hero: "Suppliers, purchase orders, receiving, and invoices",
      copy: "Manage supplier records, purchase requests, order approvals, goods received, invoices, balances, and procurement reports.",
      cards: [
        ["Suppliers", "Vendor details, terms, balances, and contacts."],
        ["Purchase orders", "Create, approve, send, and receive orders."],
        ["Goods received", "Record deliveries and update inventory."],
        ["Invoices", "Track supplier invoices and payment status."],
      ],
      rows: [
        ["Supplier record", "Active", "Vendor profile", "Branch / Operations"],
        ["Purchase order", "Pending", "Approval threshold", "Director"],
        ["Goods receipt", "Received", "Inventory update", "Branch"],
      ],
    },
    retail: {
      mark: "RT",
      title: "Retail Operations",
      hero: "POS, products, returns, till, and customers",
      copy: "Run shop sales, product lookup, basket checkout, returns, discounts, cash reconciliation, and retail reports.",
      cards: [
        ["POS", "Basket checkout, customer, payment, and receipt."],
        ["Products", "Catalogue, stock status, barcode/SKU lookup."],
        ["Returns", "Refunds, restocking, and manager review."],
        ["Till", "Open, close, cash movement, and variance."],
      ],
      rows: [
        ["POS sale", "Ready", "Basket checkout", "Agent"],
        ["Return request", "Pending", "Refund review", "Branch"],
        ["Till close", "Pending", "Cash reconciliation", "Finance"],
      ],
    },
    manufacturing: {
      mark: "MF",
      title: "Manufacturing Portal",
      hero: "Production orders, BOM, quality, and costing",
      copy: "Coordinate production runs, raw materials, work centers, quality checks, finished goods, and costing.",
      cards: [
        ["Production orders", "Plan and track each production run."],
        ["BOM", "Raw material requirements and usage."],
        ["Quality", "Inspection, rejection, and approval records."],
        ["Costing", "Material, labor, overhead, and margin."],
      ],
      rows: [
        ["Production order", "Open", "Work center", "Operations"],
        ["Raw material issue", "Pending", "Inventory movement", "Warehouse"],
        ["Quality check", "Pending", "Inspection", "Supervisor"],
      ],
    },
    sales: {
      mark: "SA",
      title: "Sales Portal",
      hero: "Pipeline, orders, customers, invoices, and revenue",
      copy: "Own product sales, customer orders, quotations, invoices, discounts, promotions, and performance reports.",
      cards: [
        ["Orders", "Customer orders and fulfillment state."],
        ["Customers", "Contact records and purchase history."],
        ["Promotions", "Discounts, campaigns, and offers."],
        ["Reports", "Daily, branch, product, and agent summaries."],
      ],
      rows: [
        ["Customer order", "Open", "Invoice pending", "Sales"],
        ["Promotion", "Active", "Discount rule", "Manager"],
        ["Revenue report", "Ready", "Export", "Director"],
      ],
    },
    technology: {
      mark: "TE",
      title: "Technology Services Portal",
      hero: "Projects, support tickets, devices, and subscriptions",
      copy: "Manage service requests, repairs, deployments, client billing, subscriptions, documentation, and project activity.",
      cards: [
        ["Services", "Client work, tickets, and SLA tracking."],
        ["Devices", "Repairs, parts, warranty, and asset movement."],
        ["Projects", "Delivery tasks, milestones, and billing."],
        ["Subscriptions", "Recurring service and support plans."],
      ],
      rows: [
        ["Support ticket", "Open", "Client request", "Technology"],
        ["Device repair", "Pending", "Parts needed", "Branch"],
        ["Subscription", "Active", "Monthly billing", "Finance"],
      ],
    },
    analytics: {
      mark: "AN",
      title: "Analytics Portal",
      hero: "Insights, trends, charts, and performance analytics",
      copy: "Read shared module data and turn it into trends, comparisons, performance signals, and exportable insights.",
      cards: [
        ["Trends", "Sales, stock, staff, and finance direction."],
        ["Comparisons", "Branch, product, supplier, and team views."],
        ["Alerts", "Signals that need attention."],
        ["Exports", "Reusable analytics packs and dashboards."],
      ],
      rows: [
        ["Revenue trend", "Ready", "Finance data", "Director"],
        ["Stock trend", "Ready", "Inventory data", "Operations"],
        ["Staff performance", "Ready", "HR / sales data", "Director"],
      ],
    },
    staff: {
      mark: "ST",
      title: "Staff Portal",
      hero: "Tasks, notices, role work, and daily operations",
      copy: "Give staff role-specific actions, task queues, notifications, branch context, and daily work records.",
      cards: [
        ["Tasks", "Assigned actions and due dates."],
        ["Notices", "Announcements and reminders."],
        ["Role work", "Daily actions by department."],
        ["Activity", "What was completed and when."],
      ],
      rows: [
        ["Daily task", "Open", "Assigned work", "Staff"],
        ["Announcement", "New", "Director notice", "All users"],
        ["Activity log", "Ready", "Completed work", "Manager"],
      ],
    },
    customer: {
      mark: "CS",
      title: "Customer Service Portal",
      hero: "Tickets, complaints, feedback, and escalation",
      copy: "Handle support tickets, complaints, chat queues, customer follow-ups, escalations, and service reporting.",
      cards: [
        ["Tickets", "Support requests and resolution status."],
        ["Complaints", "Customer issues and escalation."],
        ["Feedback", "Customer comments and satisfaction."],
        ["Reports", "Response, resolution, and issue trends."],
      ],
      rows: [
        ["Support ticket", "Open", "Customer issue", "Support"],
        ["Complaint", "Pending", "Escalation", "Manager"],
        ["Feedback", "New", "Customer note", "Service"],
      ],
    },
    academic: {
      mark: "AC",
      title: "Academic Portal",
      hero: "Students, fees, attendance, exams, and communication",
      copy: "Support schools and colleges with student records, fees, classes, attendance, exam results, and parent communication.",
      cards: [
        ["Students", "Registration, classes, and guardians."],
        ["Fees", "Billing, balances, and payment records."],
        ["Attendance", "Daily student and class attendance."],
        ["Exams", "Scores, results, and reports."],
      ],
      rows: [
        ["Student record", "Active", "Class assignment", "Academic"],
        ["Fee balance", "Pending", "Payment follow-up", "Finance"],
        ["Exam report", "Ready", "Term results", "Teacher"],
      ],
    },
    hospital: {
      mark: "HO",
      title: "Hospital Portal",
      hero: "Patients, appointments, prescriptions, billing, and lab records",
      copy: "Coordinate patient records, appointment flow, doctors, nurses, prescriptions, lab reports, billing, and emergency records.",
      cards: [
        ["Patients", "Records, visits, and history."],
        ["Appointments", "Doctor schedules and bookings."],
        ["Prescriptions", "Medication and pharmacy links."],
        ["Billing", "Invoices, payments, and insurance notes."],
      ],
      rows: [
        ["Patient visit", "Open", "Consultation", "Clinic"],
        ["Prescription", "Pending", "Pharmacy", "Doctor"],
        ["Lab result", "Ready", "Report", "Lab"],
      ],
    },
    restaurant: {
      mark: "RS",
      title: "Restaurant Portal",
      hero: "Orders, menu, kitchen, reservations, and sales reports",
      copy: "Run restaurant orders, kitchen workflow, reservations, menus, staff coordination, customer orders, and sales reporting.",
      cards: [
        ["Orders", "Table, takeaway, delivery, and kitchen flow."],
        ["Menu", "Items, prices, availability, and categories."],
        ["Reservations", "Bookings and table planning."],
        ["Reports", "Sales, staff, kitchen, and inventory summaries."],
      ],
      rows: [
        ["Kitchen order", "Open", "Prep queue", "Kitchen"],
        ["Reservation", "Confirmed", "Table booking", "Front desk"],
        ["Menu update", "Active", "Price / availability", "Manager"],
      ],
    },
    "real-estate": {
      mark: "RE",
      title: "Real Estate Portal",
      hero: "Properties, tenants, rent, maintenance, and payments",
      copy: "Manage property listings, tenants, leases, rent tracking, maintenance requests, analytics, and payment records.",
      cards: [
        ["Properties", "Listings, units, and availability."],
        ["Tenants", "Tenant details and lease status."],
        ["Rent", "Invoices, payments, and balances."],
        ["Maintenance", "Requests, vendors, and completion."],
      ],
      rows: [
        ["Property", "Active", "Listing", "Admin"],
        ["Rent invoice", "Pending", "Tenant payment", "Finance"],
        ["Maintenance request", "Open", "Vendor dispatch", "Operations"],
      ],
    },
    reporting: {
      mark: "RP",
      title: "Reporting Portal",
      hero: "Operational, finance, audit, and organization reports",
      copy: "Combine module data into clean summaries, exports, recurring reports, and review packs for leaders.",
      cards: [
        ["Operational reports", "Branch, inventory, staff, and activity."],
        ["Finance reports", "Money in, money out, balances, and profit."],
        ["Audit reports", "Approvals, changes, users, and security."],
        ["Exports", "CSV, Word, PDF, and print-friendly output."],
      ],
      rows: [
        ["Operations report", "Ready", "Branch activity", "Director"],
        ["Finance report", "Ready", "Money summary", "Finance"],
        ["Audit report", "Ready", "System activity", "Admin"],
      ],
    },
    departments: {
      mark: "DP",
      title: "Department Management",
      hero: "Department roles, workflows, approvals, and routing",
      copy: "Structure internal departments, workflow ownership, approval routing, and staff responsibilities.",
      cards: [
        ["Departments", "Teams, leads, and service areas."],
        ["Workflows", "Approval chains and routing rules."],
        ["Roles", "Department permissions and users."],
        ["Activity", "Requests, approvals, and updates."],
      ],
      rows: [
        ["Department", "Active", "Workflow owner", "Admin"],
        ["Approval", "Pending", "Route to finance", "Manager"],
        ["Role update", "Ready", "Permission change", "Admin"],
      ],
    },
    pharmacy: {
      mark: "PH",
      title: "Pharmacy Portal",
      hero: "Medicine stock, prescriptions, expiry, suppliers, and sales",
      copy: "Control pharmacy inventory, batch numbers, expiry, prescriptions, supplier records, discounts, and pharmacy sales.",
      cards: [
        ["Medicine stock", "Batch, expiry, and availability."],
        ["Prescriptions", "Patient medicine dispensing records."],
        ["Suppliers", "Distributor and purchase history."],
        ["Reports", "Expiry, sales, and stock movement."],
      ],
      rows: [
        ["Medicine batch", "Active", "Expiry review", "Pharmacy"],
        ["Prescription", "Pending", "Dispensing", "Pharmacist"],
        ["Expiry alert", "Open", "Stock review", "Manager"],
      ],
    },
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const currentModuleId = () =>
    document.body?.dataset?.modulePortal ||
    new URLSearchParams(location.search).get("portal") ||
    "reporting";

  const safeModule = () => MODULES[currentModuleId()] || MODULES.reporting;

  const readOrg = () => {
    try {
      const params = new URLSearchParams(location.search);
      return params.get("tenant") || params.get("org") || localStorage.getItem("enterprise_current_tenant_v1") || "organization";
    } catch {
      return "organization";
    }
  };

  const statusClass = (status) => String(status || "").toLowerCase().includes("pending") ? "status pending" : "status";

  const setText = (selector, value) => {
    const el = $(selector);
    if (el) el.textContent = value;
  };

  const renderCards = (module) => {
    const host = $("[data-dashboard-cards]");
    if (!host) return;
    host.textContent = "";
    module.cards.forEach(([title, copy]) => {
      const card = document.createElement("button");
      card.type = "button";
      card.innerHTML = `<strong></strong><span></span>`;
      card.querySelector("strong").textContent = title;
      card.querySelector("span").textContent = copy;
      host.appendChild(card);
    });
  };

  const renderRows = (module) => {
    const body = $("[data-records-body]");
    if (!body) return;
    body.textContent = "";
    module.rows.forEach(([name, status, detail, owner]) => {
      const row = document.createElement("tr");
      row.innerHTML = `<td></td><td><span class="${statusClass(status)}"></span></td><td></td><td></td><td><button class="row-action" type="button">Open</button></td>`;
      row.children[0].textContent = name;
      row.querySelector(".status").textContent = status;
      row.children[2].textContent = detail;
      row.children[3].textContent = owner;
      body.appendChild(row);
    });
  };

  const init = () => {
    const module = safeModule();
    const org = readOrg();
    document.title = `${module.title} | MAPPHEX`;
    setText("[data-module-mark]", module.mark);
    setText("[data-module-name]", module.title);
    setText("[data-org-name]", org);
    setText("[data-page-title]", module.title.replace(" Portal", ""));
    setText("[data-hero-title]", module.hero);
    setText("[data-hero-copy]", module.copy);
    setText("[data-section-kicker]", module.title);
    setText("[data-section-title]", module.hero);
    setText("[data-section-copy]", module.copy);
    setText("[data-record-count]", String(module.rows.length));
    setText("[data-card-count]", String(module.cards.length));
    setText("[data-owner-count]", String(new Set(module.rows.map((row) => row[3])).size));
    setText("[data-status-count]", String(module.rows.filter((row) => String(row[1]).toLowerCase().includes("pending")).length));
    renderCards(module);
    renderRows(module);

    $("[data-menu-button]")?.addEventListener("click", () => document.body.classList.add("sidebar-open"));
    $("[data-close-sidebar]")?.addEventListener("click", () => document.body.classList.remove("sidebar-open"));
    $("[data-main-action]")?.addEventListener("click", () => window.print());
  };

  document.addEventListener("DOMContentLoaded", init);
})();
