(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const PAGE = document.body?.dataset?.departmentPortal || "";
  const STORE_KEY = "enterprise_department_portals_v1";
  const ERP_KEY = "enterprise_erp_v1";
  const USERS_KEY = "enterprise_users_v1";

  const safeParse = (raw, fallback) => {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  const getJson = (key, fallback) => {
    const store = window.EnterpriseStore || null;
    if (store?.getJson) {
      const value = store.getJson(key, undefined);
      if (typeof value !== "undefined" && value !== null) return value;
    }
    const raw = localStorage.getItem(key);
    return raw ? safeParse(raw, fallback) : fallback;
  };

  const setJson = (key, value) => {
    try {
      window.EnterpriseStore?.setJson?.(key, value);
    } catch {
      // localStorage fallback below
    }
    localStorage.setItem(key, JSON.stringify(value ?? null));
  };

  const fmt = (value) => Number(value || 0).toLocaleString("en-US");
  const money = (value) => `KES ${fmt(value)}`;
  const iso = () => new Date().toISOString();
  const id = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  const state = () => {
    const root = getJson(STORE_KEY, {});
    const next = root && typeof root === "object" && !Array.isArray(root) ? root : {};
    next.hr = next.hr && typeof next.hr === "object" ? next.hr : {};
    next.logistics = next.logistics && typeof next.logistics === "object" ? next.logistics : {};
    next.hr.employees = Array.isArray(next.hr.employees) ? next.hr.employees : [];
    next.hr.attendance = Array.isArray(next.hr.attendance) ? next.hr.attendance : [];
    next.hr.leave = Array.isArray(next.hr.leave) ? next.hr.leave : [];
    next.hr.payroll = Array.isArray(next.hr.payroll) ? next.hr.payroll : [];
    next.hr.vacancies = Array.isArray(next.hr.vacancies) ? next.hr.vacancies : [];
    next.hr.performance = Array.isArray(next.hr.performance) ? next.hr.performance : [];
    next.hr.documents = Array.isArray(next.hr.documents) ? next.hr.documents : [];
    next.hr.settings = next.hr.settings && typeof next.hr.settings === "object" ? next.hr.settings : { departments: ["Admin", "Sales", "Operations"], titles: ["Manager", "Officer", "Assistant"], leaveTypes: ["Annual", "Sick", "Unpaid"], deductionRules: "NHIF, NSSF, PAYE" };
    next.logistics.orders = Array.isArray(next.logistics.orders) ? next.logistics.orders : [];
    next.logistics.drivers = Array.isArray(next.logistics.drivers) ? next.logistics.drivers : [];
    next.logistics.zones = Array.isArray(next.logistics.zones) ? next.logistics.zones : [];
    next.logistics.movements = Array.isArray(next.logistics.movements) ? next.logistics.movements : [];
    next.logistics.expenses = Array.isArray(next.logistics.expenses) ? next.logistics.expenses : [];
    next.logistics.settings = next.logistics.settings && typeof next.logistics.settings === "object" ? next.logistics.settings : { deliveryTypes: ["standard", "express", "same-day"], vehicleTypes: ["motorbike", "van", "truck"], commissionRule: "Per delivery", codPolicy: "Driver remits daily" };
    return next;
  };

  const save = (next) => setJson(STORE_KEY, next);
  const erp = () => getJson(ERP_KEY, { branches: [] });
  const branches = () => Array.isArray(erp().branches) ? erp().branches : [];
  const users = () => {
    const rows = getJson(USERS_KEY, []);
    return Array.isArray(rows) ? rows : [];
  };

  const requireSession = () => {
    const tenant = new URLSearchParams(location.search).get("tenant") || window.EnterpriseCore?.currentTenantId?.();
    if (tenant) window.EnterpriseCore?.setTenant?.(tenant);
    const session = window.EnterpriseCore?.requireOrganizationSession?.(tenant);
    if (!session?.tenantId) {
      location.href = "organization-login.html";
      return null;
    }
    return session;
  };

  const setText = (sel, value) => {
    const el = $(sel);
    if (el) el.textContent = value;
  };

  const fillBranches = (select, allLabel = "") => {
    if (!select) return;
    const selected = String(select.value || "");
    select.textContent = "";
    if (allLabel) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = allLabel;
      select.appendChild(opt);
    }
    for (const branch of branches()) {
      const opt = document.createElement("option");
      opt.value = branch.id;
      opt.textContent = branch.name || branch.id;
      select.appendChild(opt);
    }
    if (selected) select.value = selected;
  };

  const nav = (key) => {
    const target = key || "overview";
    $$("[data-section]").forEach((section) => {
      section.style.display = section.dataset.section === target ? "" : "none";
    });
    $$("[data-nav]").forEach((link) => link.classList.toggle("active", link.dataset.nav === target));
  };

  const wireShell = () => {
    const title = document.body.dataset.portalTitle || "Department Portal";
    setText("#portal-title", title);
    setText("#portal-subtitle", `${window.EnterpriseCore?.currentTenantId?.() || "organization"} workspace`);
    $("#workspace-link")?.setAttribute("href", `organization-workspace.html?tenant=${encodeURIComponent(window.EnterpriseCore?.currentTenantId?.() || "")}`);
    document.addEventListener("click", (event) => {
      const link = event.target?.closest?.("[data-nav]");
      if (!link) return;
      event.preventDefault();
      history.replaceState(null, "", `#${link.dataset.nav}`);
      nav(link.dataset.nav);
    });
    window.addEventListener("hashchange", () => nav(location.hash.replace("#", "") || "overview"));
    nav(location.hash.replace("#", "") || "overview");
  };

  const renderRows = (tbody, rows, empty, render) => {
    if (!tbody) return;
    tbody.textContent = "";
    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="12" class="muted">${empty}</td>`;
      tbody.appendChild(tr);
      return;
    }
    rows.forEach((row) => tbody.appendChild(render(row)));
  };

  const exportCsv = (filename, rows) => {
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const printHtml = (title, html) => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#111}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px;text-align:left}.num{text-align:right}</style></head><body>${html}<script>window.print();<\/script></body></html>`);
    win.document.close();
  };

  const initHr = () => {
    const session = requireSession();
    if (!session) return;
    wireShell();
    const data = state();
    const hr = data.hr;
    fillBranches($("#hr-branch"), "Unassigned");
    fillBranches($("#attendance-branch"), "All branches");

    const render = () => {
      const active = hr.employees.filter((e) => e.status !== "inactive").length;
      const month = new Date().toISOString().slice(0, 7);
      const hires = hr.employees.filter((e) => String(e.startDate || "").startsWith(month)).length;
      const leaveToday = hr.leave.filter((l) => l.status === "approved" && l.startDate <= new Date().toISOString().slice(0, 10) && l.endDate >= new Date().toISOString().slice(0, 10)).length;
      setText("#hr-kpi-employees", fmt(active));
      setText("#hr-kpi-hires", fmt(hires));
      setText("#hr-kpi-leave", fmt(leaveToday));
      setText("#hr-kpi-payroll", money(hr.payroll.reduce((sum, row) => sum + (Number(row.netPay || 0) || 0), 0)));

      renderRows($("#employees-tbody"), hr.employees, "No employees yet.", (e) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${e.name}</td><td>${e.role}</td><td>${e.department}</td><td>${e.branchName || e.branchId || ""}</td><td>${e.contractType}</td><td>${e.status}</td><td class="num">${money(e.salary)}</td><td><button class="btn" data-employee-toggle="${e.id}">${e.status === "inactive" ? "Reactivate" : "Deactivate"}</button></td>`;
        return tr;
      });
      renderRows($("#attendance-tbody"), hr.attendance.slice().reverse(), "No attendance entries yet.", (a) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${a.date}</td><td>${a.employee}</td><td>${a.branchName || ""}</td><td>${a.status}</td><td>${a.notes || ""}</td>`;
        return tr;
      });
      renderRows($("#leave-tbody"), hr.leave.slice().reverse(), "No leave requests yet.", (l) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${l.employee}</td><td>${l.type}</td><td>${l.startDate} to ${l.endDate}</td><td>${l.status}</td><td><button class="btn primary" data-leave-status="approved" data-leave-id="${l.id}">Approve</button><button class="btn" data-leave-status="rejected" data-leave-id="${l.id}">Reject</button></td>`;
        return tr;
      });
      renderRows($("#payroll-tbody"), hr.payroll.slice().reverse(), "No payroll runs yet.", (p) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${p.period}</td><td>${p.employee}</td><td class="num">${money(p.basePay)}</td><td class="num">${money(p.allowances)}</td><td class="num">${money(p.deductions)}</td><td class="num">${money(p.netPay)}</td><td>${p.status}</td>`;
        return tr;
      });
      renderRows($("#recruitment-tbody"), hr.vacancies.slice().reverse(), "No vacancies yet.", (v) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${v.title}</td><td>${v.branchName || ""}</td><td>${v.requirements}</td><td>${v.status}</td><td>${v.applicants || 0}</td>`;
        return tr;
      });
      renderRows($("#performance-tbody"), hr.performance.slice().reverse(), "No performance reviews yet.", (p) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${p.employee}</td><td>${p.period}</td><td>${p.reviewer}</td><td>${p.score}</td><td>${p.notes || ""}</td>`;
        return tr;
      });
      renderRows($("#documents-tbody"), hr.documents.slice().reverse(), "No document records yet.", (d) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${d.employee}</td><td>${d.documentType}</td><td>${d.expiryDate || ""}</td><td>${d.status}</td><td>${d.notes || ""}</td>`;
        return tr;
      });
      $("#hr-settings-output").textContent = `Departments: ${hr.settings.departments.join(", ")}\nJob titles: ${hr.settings.titles.join(", ")}\nLeave types: ${hr.settings.leaveTypes.join(", ")}\nPayroll rules: ${hr.settings.deductionRules}`;
    };

    $("#employee-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const branch = branches().find((b) => b.id === form.branchId.value);
      hr.employees.push({
        id: id("emp"),
        name: form.name.value.trim(),
        nationalId: form.nationalId.value.trim(),
        phone: form.phone.value.trim(),
        email: form.email.value.trim(),
        role: form.role.value.trim(),
        department: form.department.value.trim(),
        branchId: form.branchId.value,
        branchName: branch?.name || "",
        contractType: form.contractType.value,
        startDate: form.startDate.value,
        salary: Number(form.salary.value || 0),
        payrollContact: form.payrollContact.value.trim(),
        emergencyContact: form.emergencyContact.value.trim(),
        notes: form.notes.value.trim(),
        status: "active",
        createdAt: iso(),
      });
      save(data);
      form.reset();
      refreshEmployeeSelects();
      render();
    });

    $("#attendance-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const employee = hr.employees.find((e) => e.id === form.employeeId.value);
      hr.attendance.push({ id: id("att"), employeeId: form.employeeId.value, employee: employee?.name || form.employeeId.value, branchName: employee?.branchName || "", date: form.date.value || new Date().toISOString().slice(0, 10), status: form.status.value, notes: form.notes.value.trim(), createdAt: iso() });
      save(data);
      form.reset();
      render();
    });

    const employeeOptions = () => hr.employees.map((e) => `<option value="${e.id}">${e.name}</option>`).join("");
    const refreshEmployeeSelects = () => {
      $$(".employee-select").forEach((select) => {
        const selected = select.value;
        select.innerHTML = employeeOptions();
        if (selected) select.value = selected;
      });
    };

    ["leave-form", "payroll-form", "performance-form", "document-form", "vacancy-form"].forEach((idName) => {
      $(`#${idName}`)?.addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const employee = hr.employees.find((e) => e.id === form.employeeId?.value);
        if (idName === "leave-form") hr.leave.push({ id: id("leave"), employee: employee?.name || "", employeeId: form.employeeId.value, type: form.type.value, startDate: form.startDate.value, endDate: form.endDate.value, status: "pending", createdAt: iso() });
        if (idName === "payroll-form") {
          const basePay = Number(form.basePay.value || employee?.salary || 0);
          const allowances = Number(form.allowances.value || 0);
          const deductions = Number(form.deductions.value || 0);
          hr.payroll.push({ id: id("pay"), employee: employee?.name || "", employeeId: form.employeeId.value, period: form.period.value, basePay, allowances, deductions, netPay: Math.max(0, basePay + allowances - deductions), status: "prepared", createdAt: iso() });
        }
        if (idName === "performance-form") hr.performance.push({ id: id("perf"), employee: employee?.name || "", employeeId: form.employeeId.value, period: form.period.value, reviewer: form.reviewer.value.trim(), score: form.score.value, notes: form.notes.value.trim(), createdAt: iso() });
        if (idName === "document-form") hr.documents.push({ id: id("doc"), employee: employee?.name || "", employeeId: form.employeeId.value, documentType: form.documentType.value.trim(), expiryDate: form.expiryDate.value, notes: form.notes.value.trim(), status: "filed", createdAt: iso() });
        if (idName === "vacancy-form") {
          const branch = branches().find((b) => b.id === form.branchId.value);
          hr.vacancies.push({ id: id("vac"), title: form.title.value.trim(), branchId: form.branchId.value, branchName: branch?.name || "", requirements: form.requirements.value.trim(), applicants: Number(form.applicants.value || 0), status: "open", createdAt: iso() });
        }
        save(data);
        form.reset();
        render();
      });
    });

    document.addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-employee-toggle]");
      if (toggle) {
        const emp = hr.employees.find((e) => e.id === toggle.dataset.employeeToggle);
        if (emp) emp.status = emp.status === "inactive" ? "active" : "inactive";
        save(data);
        render();
      }
      const leaveBtn = event.target.closest("[data-leave-status]");
      if (leaveBtn) {
        const row = hr.leave.find((l) => l.id === leaveBtn.dataset.leaveId);
        if (row) row.status = leaveBtn.dataset.leaveStatus;
        save(data);
        render();
      }
    });

    $("#hr-export-btn")?.addEventListener("click", () => exportCsv("hr-employees.csv", [["Name", "ID", "Phone", "Email", "Role", "Department", "Branch", "Contract", "Start", "Salary", "Status"], ...hr.employees.map((e) => [e.name, e.nationalId, e.phone, e.email, e.role, e.department, e.branchName, e.contractType, e.startDate, e.salary, e.status])]));
    $("#hr-print-btn")?.addEventListener("click", () => printHtml("HR Report", `<h1>HR Report</h1><p>Total employees: ${hr.employees.length}</p><table><tr><th>Name</th><th>Role</th><th>Department</th><th>Status</th></tr>${hr.employees.map((e) => `<tr><td>${e.name}</td><td>${e.role}</td><td>${e.department}</td><td>${e.status}</td></tr>`).join("")}</table>`));
    render();
    refreshEmployeeSelects();
    document.addEventListener("change", refreshEmployeeSelects);
  };

  const logisticsRows = (logistics) => logistics.orders.slice().sort((a, z) => String(z.createdAt || "").localeCompare(String(a.createdAt || "")));

  const initLogistics = (driverOnly = false) => {
    const session = requireSession();
    if (!session) return;
    wireShell();
    const data = state();
    const logistics = data.logistics;
    fillBranches($("#order-pickup"), "Select branch/depot");
    fillBranches($("#driver-branch"), "Select depot");
    fillBranches($("#movement-location"), "Select depot");

    const render = () => {
      const today = new Date().toISOString().slice(0, 10);
      const orders = logisticsRows(logistics);
      const visibleOrders = driverOnly
        ? orders.filter((order) => String(order.driver || "").toLowerCase() === String(session.email || session.sub || session.userId || "").toLowerCase() || String(order.driverName || "").toLowerCase() === String(session.name || session.email || "").toLowerCase())
        : orders;
      setText("#log-kpi-orders", fmt(orders.filter((o) => String(o.createdAt || "").startsWith(today)).length));
      setText("#log-kpi-transit", fmt(orders.filter((o) => ["dispatched", "in_transit"].includes(o.status)).length));
      setText("#log-kpi-delivered", fmt(orders.filter((o) => o.status === "delivered" && String(o.updatedAt || o.createdAt || "").startsWith(today)).length));
      setText("#log-kpi-revenue", money(orders.reduce((sum, o) => sum + (Number(o.amount || 0) || 0), 0)));
      renderRows($("#orders-tbody"), visibleOrders, "No logistics orders yet.", (o) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${o.ref}</td><td>${o.customerName}<br><span class="muted">${o.customerPhone}</span></td><td>${o.pickupName || o.pickup}</td><td>${o.address}</td><td>${o.driverName || o.driver || "Unassigned"}</td><td>${o.status}</td><td class="num">${money(o.amount)}</td><td><button class="btn" data-order-status="in_transit" data-order-id="${o.id}">In transit</button><button class="btn primary" data-order-status="delivered" data-order-id="${o.id}">Delivered</button><button class="btn" data-order-status="failed" data-order-id="${o.id}">Failed</button></td>`;
        return tr;
      });
      renderRows($("#drivers-tbody"), logistics.drivers, "No drivers yet.", (d) => {
        const assigned = orders.filter((o) => o.driverId === d.id && !["delivered", "failed", "cancelled"].includes(o.status)).length;
        const done = orders.filter((o) => o.driverId === d.id && o.status === "delivered").length;
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${d.name}</td><td>${d.phone}</td><td>${d.vehicleType}</td><td>${d.vehicleReg}</td><td>${d.branchName || ""}</td><td>${d.status}</td><td class="num">${assigned}</td><td class="num">${done}</td>`;
        return tr;
      });
      renderRows($("#zones-tbody"), logistics.zones, "No routes or zones yet.", (z) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${z.name}</td><td>${z.areas}</td><td>${z.drivers}</td><td class="num">${money(z.fee)}</td>`;
        return tr;
      });
      renderRows($("#movements-tbody"), logistics.movements.slice().reverse(), "No depot movements yet.", (m) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${m.date}</td><td>${m.locationName}</td><td>${m.type}</td><td>${m.item}</td><td class="num">${fmt(m.qty)}</td><td>${m.condition}</td>`;
        return tr;
      });
      const codPending = orders.filter((o) => o.paymentType === "cod" && o.status !== "remitted").reduce((sum, o) => sum + (Number(o.amount || 0) || 0), 0);
      setText("#finance-summary", `Revenue: ${money(orders.reduce((sum, o) => sum + (Number(o.amount || 0) || 0), 0))} | COD pending: ${money(codPending)} | Expenses: ${money(logistics.expenses.reduce((sum, e) => sum + (Number(e.amount || 0) || 0), 0))}`);
    };

    $("#order-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const branch = branches().find((b) => b.id === form.pickup.value);
      const driver = logistics.drivers.find((d) => d.id === form.driverId.value);
      logistics.orders.push({ id: id("order"), ref: form.ref.value.trim() || `ORD-${Date.now()}`, customerName: form.customerName.value.trim(), customerPhone: form.customerPhone.value.trim(), pickup: form.pickup.value, pickupName: branch?.name || "", address: form.address.value.trim(), item: form.item.value.trim(), weight: form.weight.value.trim(), declaredValue: Number(form.declaredValue.value || 0), deliveryType: form.deliveryType.value, paymentType: form.paymentType.value, amount: Number(form.amount.value || 0), instructions: form.instructions.value.trim(), driverId: driver?.id || "", driver: driver?.email || driver?.phone || "", driverName: driver?.name || "", status: driver ? "dispatched" : "pending", createdAt: iso(), updatedAt: iso() });
      save(data);
      form.reset();
      render();
    });

    $("#driver-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const branch = branches().find((b) => b.id === form.branchId.value);
      logistics.drivers.push({ id: id("driver"), name: form.name.value.trim(), phone: form.phone.value.trim(), email: form.email.value.trim(), vehicleType: form.vehicleType.value, vehicleReg: form.vehicleReg.value.trim(), license: form.license.value.trim(), licenseExpiry: form.licenseExpiry.value, branchId: form.branchId.value, branchName: branch?.name || "", status: "active", createdAt: iso() });
      save(data);
      form.reset();
      fillDriverSelects();
      render();
    });

    const fillDriverSelects = () => {
      $$(".driver-select").forEach((select) => {
        const selected = select.value;
        select.innerHTML = `<option value="">Unassigned</option>${logistics.drivers.filter((d) => d.status !== "inactive").map((d) => `<option value="${d.id}">${d.name}</option>`).join("")}`;
        if (selected) select.value = selected;
      });
    };

    ["zone-form", "movement-form", "expense-form"].forEach((idName) => {
      $(`#${idName}`)?.addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (idName === "zone-form") logistics.zones.push({ id: id("zone"), name: form.name.value.trim(), areas: form.areas.value.trim(), drivers: form.drivers.value.trim(), fee: Number(form.fee.value || 0), createdAt: iso() });
        if (idName === "movement-form") {
          const branch = branches().find((b) => b.id === form.location.value);
          logistics.movements.push({ id: id("move"), date: form.date.value || new Date().toISOString().slice(0, 10), location: form.location.value, locationName: branch?.name || "", type: form.type.value, item: form.item.value.trim(), qty: Number(form.qty.value || 0), condition: form.condition.value, createdAt: iso() });
        }
        if (idName === "expense-form") logistics.expenses.push({ id: id("exp"), date: form.date.value || new Date().toISOString().slice(0, 10), type: form.type.value.trim(), amount: Number(form.amount.value || 0), notes: form.notes.value.trim(), createdAt: iso() });
        save(data);
        form.reset();
        render();
      });
    });

    document.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-order-status]");
      if (!btn) return;
      const order = logistics.orders.find((o) => o.id === btn.dataset.orderId);
      if (!order) return;
      order.status = btn.dataset.orderStatus;
      order.updatedAt = iso();
      save(data);
      render();
    });

    $("#logistics-export-btn")?.addEventListener("click", () => exportCsv("logistics-orders.csv", [["Ref", "Customer", "Phone", "Pickup", "Address", "Driver", "Status", "Amount"], ...logistics.orders.map((o) => [o.ref, o.customerName, o.customerPhone, o.pickupName, o.address, o.driverName, o.status, o.amount])]));
    $("#logistics-print-btn")?.addEventListener("click", () => printHtml("Logistics Report", `<h1>Logistics Report</h1><table><tr><th>Ref</th><th>Customer</th><th>Driver</th><th>Status</th><th>Amount</th></tr>${logistics.orders.map((o) => `<tr><td>${o.ref}</td><td>${o.customerName}</td><td>${o.driverName || ""}</td><td>${o.status}</td><td>${money(o.amount)}</td></tr>`).join("")}</table>`));
    fillDriverSelects();
    render();
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (PAGE === "hr") initHr();
    if (PAGE === "logistics") initLogistics(false);
    if (PAGE === "driver") initLogistics(true);
  });
})();
