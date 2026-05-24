(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const ORGS_KEY = "platform_organizations_v1";
  const USERS_KEY = "enterprise_org_users_v1";
  const PROFILE_KEY = "enterprise_org_profile_v1";
  const SETTINGS_KEY = "enterprise_org_settings_v1";
  const PORTAL_LABELS = {
    admin: "Admin Module",
    branch: "Branch Management",
    departments: "Department Management",
    hr: "HR Module",
    finance: "Finance Module",
    pharmacy: "Pharmacy Module",
    inventory: "Inventory Module",
    logistics: "Logistics Module",
    retail: "Retail Operations Module",
    manufacturing: "Manufacturing Module",
    sales: "Sales Module",
    analytics: "Analytics Module",
    procurement: "Procurement Portal",
    technology: "Technology Services Portal",
    staff: "Staff Module",
    customer: "Customer Module",
    reporting: "Reporting Module",
    director: "Executive ERP Portal",
    "device-branch": "Branch Operations Portal",
    "team-leader": "Operations Lead Portal",
    agent: "ERP Agent Portal",
    "device-departments": "Department Workflow Portal",
  };
  const BASE_PORTALS = ["admin", "staff", "reporting"];
  const SERVICE_PORTALS = {
    company: ["admin", "departments", "staff", "reporting"],
    agency: ["admin", "staff", "customer", "sales", "reporting"],
    corporate: ["admin", "branch", "departments", "hr", "finance", "reporting", "analytics"],
    service: ["admin", "staff", "customer", "sales", "reporting"],
    "business-onboarding": ["admin", "staff", "customer", "reporting"],
    "organization-setup": ["admin", "branch", "departments", "staff", "reporting"],
    "licensing-subscriptions": ["admin", "finance", "reporting"],
    "security-services": ["admin", "departments", "staff", "reporting"],
    "support-training": ["admin", "staff", "customer", "reporting"],
    "cloud-hosting": ["admin", "technology", "customer", "finance", "staff", "reporting", "analytics"],
    "data-migration": ["admin", "inventory", "staff", "reporting", "analytics"],
    "finance-management": ["admin", "finance", "reporting", "analytics"],
    "hr-staff-access": ["admin", "hr", "departments", "staff", "reporting"],
    "retail-pos": ["admin", "branch", "retail", "inventory", "sales", "finance", "reporting"],
    "inventory-control": ["admin", "branch", "inventory", "reporting", "analytics"],
    "crm-workflows": ["admin", "customer", "sales", "staff", "reporting"],
    "document-management": ["admin", "staff", "reporting"],
    "reporting-tools": ["admin", "reporting", "analytics"],
    "pharmacy-operations": ["admin", "branch", "pharmacy", "inventory", "sales", "finance", "reporting"],
    "school-management": ["admin", "departments", "hr", "finance", "staff", "reporting"],
    "logistics-tracking": ["admin", "branch", "logistics", "inventory", "finance", "customer", "reporting", "analytics"],
    "branch-management": ["admin", "branch", "staff", "reporting", "analytics"],
    "warehouse-control": ["admin", "branch", "inventory", "logistics", "reporting"],
    "supplier-records": ["admin", "inventory", "finance", "reporting"],
    "analytics-dashboard": ["admin", "reporting", "analytics"],
    "task-management": ["admin", "staff", "departments", "reporting"],
    "role-permissions": ["admin", "departments", "staff", "reporting"],
    "audit-trails": ["admin", "reporting", "analytics"],
    notifications: ["admin", "staff", "customer", "reporting"],
    "multi-branch-reports": ["admin", "branch", "reporting", "analytics"],
    "subscription-review": ["admin", "finance", "reporting"],
    "customer-support-desk": ["admin", "customer", "staff", "reporting"],
    retail: ["admin", "branch", "retail", "inventory", "sales", "finance", "reporting"],
    manufacturing: ["admin", "manufacturing", "inventory", "procurement", "finance", "sales", "logistics", "reporting", "analytics"],
    ngo: ["admin", "finance", "hr", "procurement", "customer", "reporting", "analytics"],
    government: ["admin", "finance", "hr", "procurement", "customer", "reporting", "analytics"],
    startup: ["admin", "technology", "sales", "finance", "customer", "hr", "reporting"],
    "book-store": ["admin", "inventory", "sales", "finance", "reporting"],
    "clothing-store": ["admin", "inventory", "sales", "customer", "reporting"],
    "furniture-store": ["admin", "inventory", "sales", "customer", "logistics", "reporting"],
    "grocery-store": ["admin", "inventory", "sales", "finance", "reporting"],
    "technology-services": ["admin", "technology", "customer", "sales", "finance", "staff", "reporting", "analytics"],
    wholesale: ["admin", "branch", "inventory", "sales", "finance", "logistics", "reporting"],
    supermarket: ["admin", "branch", "inventory", "sales", "finance", "hr", "reporting"],
    "mini-supermarket": ["admin", "inventory", "sales", "finance", "reporting"],
    warehouse: ["admin", "branch", "inventory", "logistics", "reporting"],
    restaurant: ["admin", "inventory", "sales", "finance", "staff", "reporting"],
    "fast-food": ["admin", "inventory", "sales", "finance", "staff", "reporting"],
    hotels: ["admin", "branch", "customer", "finance", "hr", "staff", "reporting"],
    "guest-house": ["admin", "customer", "finance", "staff", "reporting"],
    "bar-pub": ["admin", "inventory", "sales", "finance", "staff", "reporting"],
    "sports-club": ["admin", "customer", "finance", "staff", "reporting"],
    pharmacy: ["admin", "branch", "pharmacy", "inventory", "sales", "finance", "reporting"],
    "hair-salon": ["admin", "customer", "sales", "finance", "staff", "reporting"],
    gym: ["admin", "customer", "finance", "staff", "reporting"],
    clinics: ["admin", "customer", "finance", "staff", "pharmacy", "reporting"],
    "software-company": ["admin", "technology", "departments", "staff", "customer", "sales", "finance", "reporting", "analytics"],
    "it-support": ["admin", "technology", "staff", "customer", "finance", "reporting", "analytics"],
    "cybersecurity-services": ["admin", "technology", "departments", "staff", "customer", "finance", "reporting", "analytics"],
    "web-development": ["admin", "technology", "staff", "customer", "sales", "finance", "reporting"],
    "app-development": ["admin", "technology", "staff", "customer", "sales", "finance", "reporting", "analytics"],
    "device-repair": ["admin", "technology", "inventory", "customer", "sales", "finance", "reporting"],
    "technology-devices": ["admin", "technology", "branch", "inventory", "customer", "finance", "staff", "reporting", "analytics"],
    "internet-services": ["admin", "technology", "branch", "customer", "finance", "staff", "reporting"],
    "digital-agency": ["admin", "technology", "staff", "customer", "sales", "finance", "reporting"],
  };

  const CATEGORY_DETAILS = {
    "General & Setup": {
      cost: "From KSh 2,500 / month",
      plan: "Starter or Business",
      setup: "Setup included",
      summary: "General organization workspace for teams that need secure users, modules, and reporting.",
      subscription: "Subscription is attached to the registered organization workspace. You can renew monthly, upgrade later, and add modules, users, or branches as operations grow.",
    },
    "Business Apps": {
      cost: "From KSh 7,500 / month",
      plan: "Business",
      setup: "Module setup included",
      summary: "Operational module for finance, HR, inventory, CRM, documents, reports, or daily business workflows.",
      subscription: "Business app subscriptions run inside the organization workspace. The monthly fee covers the workspace plus selected modules, with upgrades available for more users, branches, and support.",
    },
    "Industry Apps": {
      cost: "From KSh 7,500 / month",
      plan: "Business or Enterprise",
      setup: "Workflow setup required",
      summary: "Industry-focused workspace for specialized operations such as pharmacy, school, logistics, warehouse, supplier, or analytics workflows.",
      subscription: "Industry apps usually need the Business plan. Larger operations can request Enterprise pricing when they need custom limits, advanced setup, or dedicated support.",
    },
    "Operations Apps": {
      cost: "From KSh 7,500 / month",
      plan: "Business",
      setup: "Admin setup included",
      summary: "Management tools for tasks, roles, audit trails, notifications, reports, subscriptions, and customer support.",
      subscription: "Operations apps are added to the organization subscription as enabled modules. Billing can renew monthly or yearly depending on the business arrangement.",
    },
    Retail: {
      cost: "From KSh 2,500 / month",
      plan: "Starter or Business",
      setup: "POS setup included",
      summary: "Retail workspace for stock, sales, customers, suppliers, branches, and daily shop reporting.",
      subscription: "Small retail shops can start on Starter. Multi-branch retail, wholesale, supermarket, and hardware workflows should use Business for stronger inventory and reporting.",
    },
    "Food & Hospitality": {
      cost: "From KSh 2,500 / month",
      plan: "Starter or Business",
      setup: "Menu/workflow setup included",
      summary: "Food and hospitality workspace for orders, guests, staff, stock usage, sales, and daily reports.",
      subscription: "Restaurants and fast-food teams can start lean. Hotels, guest houses, and multi-location hospitality businesses should upgrade as rooms, staff, and reports increase.",
    },
    "Health & Fitness": {
      cost: "From KSh 2,500 / month",
      plan: "Starter or Business",
      setup: "Records setup included",
      summary: "Health and fitness workspace for members, patients, appointments, stock, staff roles, subscriptions, and reports.",
      subscription: "Simple salons, gyms, and clubs can start on Starter. Clinics and pharmacies usually need Business for controlled records, stock, staff roles, and reporting.",
    },
    Technologies: {
      cost: "From KSh 7,500 / month",
      plan: "Business or Enterprise",
      setup: "Technology workspace setup included",
      summary: "Technology workspace for software services, IT support, devices, subscriptions, customers, projects, and reporting.",
      subscription: "Technology businesses can start with Business for service tracking, customers, support, finance, and reports. Enterprise is available for larger teams, branches, and advanced controls.",
    },
  };

  const SERVICE_OVERRIDES = {
    "technology-services": {
      cost: "From KSh 7,500 / month",
      plan: "Business",
      setup: "Technology workflow setup included",
      summary: "Technology services setup for software projects, IT support, cybersecurity, hosting, SaaS subscriptions, deployments, client billing, and tickets.",
      subscription: "The subscription covers projects, service tickets, developer work, documentation, subscriptions, invoices, and client support workflows.",
    },
    "pharmacy": {
      cost: "From KSh 7,500 / month",
      plan: "Business",
      setup: "Pharmacy stock setup included",
      summary: "Pharmacy workspace for medicine stock, sales, suppliers, expiry review, staff roles, and reports.",
      subscription: "Pharmacy subscriptions normally use Business because stock control, branch records, expiry review, and finance reporting need stronger module access.",
    },
    clinics: {
      cost: "From KSh 7,500 / month",
      plan: "Business or Enterprise",
      setup: "Clinic workflow setup required",
      summary: "Clinic workspace for patient records, appointments, billing, service history, staff roles, and reporting.",
      subscription: "Clinics can start on Business. Enterprise is recommended when custom workflows, more users, or advanced controls are needed.",
    },
    hotels: {
      cost: "From KSh 7,500 / month",
      plan: "Business",
      setup: "Rooms and booking setup included",
      summary: "Hotel workspace for rooms, bookings, guests, payments, staff duties, and reports.",
      subscription: "Hotel subscriptions use Business when room records, guest activity, staff access, and reporting need to run together.",
    },
    "licensing-subscriptions": {
      cost: "Custom by selected plan",
      plan: "Starter, Business, or Enterprise",
      setup: "Billing review included",
      summary: "Subscription planning service for choosing modules, billing period, active users, and growth options.",
      subscription: "The final cost depends on selected plan, modules, users, branches, support level, and monthly or yearly renewal choice.",
    },
  };

  const BUSINESS_TYPE_GROUPS = [
    {
      category: "General & Setup",
      options: [
        ["company", "Company"],
        ["agency", "Agency"],
        ["corporate", "Corporate"],
        ["service", "Service Business"],
        ["business-onboarding", "Business Onboarding"],
        ["organization-setup", "Organization Setup"],
        ["licensing-subscriptions", "Licensing & Subscriptions"],
        ["security-services", "Security Services"],
        ["support-training", "Support & Training"],
        ["cloud-hosting", "Cloud Hosting Setup"],
        ["data-migration", "Data Migration"],
      ],
    },
    {
      category: "Business Apps",
      options: [
        ["finance-management", "Finance Management"],
        ["hr-staff-access", "HR & Staff Access"],
        ["retail-pos", "Retail & POS"],
        ["inventory-control", "Inventory Control"],
        ["crm-workflows", "CRM Workflows"],
        ["document-management", "Document Management"],
        ["reporting-tools", "Reporting Tools"],
      ],
    },
    {
      category: "Industry Apps",
      options: [
        ["pharmacy-operations", "Pharmacy Operations"],
        ["school-management", "School Management"],
        ["logistics-tracking", "Logistics Tracking"],
        ["branch-management", "Branch Management"],
        ["warehouse-control", "Warehouse Control"],
        ["supplier-records", "Supplier Records"],
        ["analytics-dashboard", "Analytics Dashboard"],
      ],
    },
    {
      category: "Operations Apps",
      options: [
        ["task-management", "Task Management"],
        ["role-permissions", "Role Permissions"],
        ["audit-trails", "Audit Trails"],
        ["notifications", "Notifications"],
        ["multi-branch-reports", "Multi-Branch Reports"],
        ["subscription-review", "Subscription Review"],
        ["customer-support-desk", "Customer Support Desk"],
      ],
    },
    {
      category: "Retail",
      options: [
        ["retail", "Retail Business"],
        ["book-store", "Book Store"],
        ["clothing-store", "Clothing Store"],
        ["furniture-store", "Furniture Store"],
        ["grocery-store", "Grocery Store"],
        ["technology-services", "Technology Services"],
        ["wholesale", "Wholesale"],
        ["supermarket", "Supermarket"],
        ["mini-supermarket", "Mini Supermarket"],
        ["warehouse", "Warehouse"],
      ],
    },
    {
      category: "Food & Hospitality",
      options: [
        ["restaurant", "Restaurants"],
        ["fast-food", "Fast Food"],
        ["hotels", "Hotels"],
        ["guest-house", "Guest House"],
        ["bar-pub", "Bar & Pub"],
      ],
    },
    {
      category: "Health & Fitness",
      options: [
        ["sports-club", "Sports Club"],
        ["pharmacy", "Pharmacy"],
        ["hair-salon", "Hair Salon"],
        ["gym", "Gym"],
        ["clinics", "Clinics"],
      ],
    },
    {
      category: "Technologies",
      options: [
        ["software-company", "Software Company"],
        ["it-support", "IT Support"],
        ["cybersecurity-services", "Cybersecurity Services"],
        ["web-development", "Web Development"],
        ["app-development", "App Development"],
        ["device-repair", "Device Repair"],
        ["technology-services", "Technology Services"],
        ["internet-services", "Internet Services"],
        ["digital-agency", "Digital Agency"],
      ],
    },
  ];

  const CATEGORY_SERVICE = {
    "General & Setup": ["company", "Company"],
    "Business Apps": ["finance-management", "Business Apps"],
    "Industry Apps": ["pharmacy-operations", "Industry Apps"],
    "Operations Apps": ["task-management", "Operations Apps"],
    Retail: ["retail", "Retail Business"],
    "Food & Hospitality": ["restaurant", "Food & Hospitality"],
    "Health & Fitness": ["clinics", "Health & Fitness"],
    Technologies: ["technology-services", "Technology Services"],
  };

  const readJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const writeJson = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value ?? null));
  };

  const isLocalDevelopment = () => ["localhost", "127.0.0.1", ""].includes(location.hostname);

  const pricing = () => window.BytewavePricing || {
    formatMonthly: (amount) => `KSh ${Number(amount || 0).toLocaleString("en-KE")} / month`,
    totalFor: () => 0,
    breakdownFor: () => [],
    pricingMapFor: () => ({}),
    labelFor: (id) => PORTAL_LABELS[id] || id,
  };

  const formatKsh = (amount) => pricing().formatMonthly(amount);

  const renderPortalPriceChips = (ids, names = []) => {
    const priceApi = pricing();
    const breakdown = priceApi.breakdownFor(ids);
    if (breakdown.length) {
      return breakdown.map((item) => `<span>${item.title}: ${item.formattedMonthly}</span>`).join("");
    }
    return names.length
      ? names.map((name) => `<span>${name}</span>`).join("")
      : "<span>Portal manager will be configured after registration</span>";
  };

  const readSelectedPackage = () => {
    const params = new URLSearchParams(location.search);
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem("mapphex_selected_service_package") || "null");
    } catch {
      stored = null;
    }
    const serviceId = params.get("service") || stored?.serviceId || "company";
    const components = (params.get("components") || stored?.components?.join(",") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const serviceTitle = stored?.serviceId === serviceId ? stored.serviceTitle : serviceId === "company" ? "Company" : serviceId.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
    const estimate = Number(params.get("estimate") || stored?.estimatedTotal || 0) || 0;
    const serviceCategory = stored?.serviceId === serviceId ? stored.serviceCategory : "Selected Service";
    const componentNames = stored?.serviceId === serviceId && Array.isArray(stored.componentNames) ? stored.componentNames : components.map((id) => PORTAL_LABELS[id] || id.replace(/-/g, " "));
    const fallbackComponents = components.length ? components : SERVICE_PORTALS[serviceId] || BASE_PORTALS;
    const computedEstimate = estimate || pricing().totalFor(fallbackComponents);
    return { serviceId, serviceTitle, serviceCategory, components: fallbackComponents, componentNames, estimate: computedEstimate };
  };

  const renderSelectedPackage = () => {
    const pkg = readSelectedPackage();
    $("#selected-service-id").value = pkg.serviceId;
    $("#selected-service-category").value = pkg.serviceCategory;
    $("#selected-service-name").value = pkg.serviceTitle;
    $("#selected-service-estimate").value = String(pkg.estimate);
    $("#selected-service-components-input").value = pkg.components.join(",");
    $("#selected-service-title").textContent = pkg.serviceTitle;
    $("#selected-service-copy").textContent =
      pkg.serviceId === "company"
        ? "No service package has been selected yet. You can still register, then choose portals from the portal manager."
        : "This package was selected from the service page. The organization will use these components as its allowed portal choices.";
    $("#selected-service-total").textContent = pkg.estimate ? formatKsh(pkg.estimate) : "To be confirmed";
    $("#selected-service-components").innerHTML = renderPortalPriceChips(pkg.components, pkg.componentNames);
    return pkg;
  };

  const updateBusinessTypeDetails = () => {
    const categorySelect = $("#business-type-category-select");
    if (!categorySelect) return;
    const category = categorySelect.value || "General & Setup";
    const [serviceId, title] = CATEGORY_SERVICE[category] || CATEGORY_SERVICE["General & Setup"];
    const base = CATEGORY_DETAILS[category] || CATEGORY_DETAILS["General & Setup"];
    const detail = { ...base, ...(SERVICE_OVERRIDES[serviceId] || {}) };
    const portalIds = SERVICE_PORTALS[serviceId] || BASE_PORTALS;
    $("#business-type-category").textContent = category;
    $("#business-type-title").textContent = title;
    $("#business-type-summary").textContent = detail.summary;
    $("#business-type-cost").textContent = detail.cost;
    $("#business-type-plan").textContent = detail.plan;
    $("#business-type-setup").textContent = detail.setup;
    $("#business-type-subscription").textContent = detail.subscription;
    const portalTarget = $("#business-type-portals");
    if (portalTarget) {
      portalTarget.innerHTML = pricing().breakdownFor(portalIds).map((item) => `<span>${item.title}: ${item.formattedMonthly}</span>`).join(" ");
    }
  };

  const selectedServiceConfig = (body) => {
    const selectedInput = $("#selected-service-id");
    if (selectedInput) {
      const pkg = readSelectedPackage();
      const serviceId = body.businessType || pkg.serviceId || "company";
      const portals = pkg.components.length ? pkg.components : SERVICE_PORTALS[serviceId] || BASE_PORTALS;
      const estimatedTotal = pkg.estimate || pricing().totalFor(portals);
      const detail = {
        cost: formatKsh(estimatedTotal),
        plan: "Selected package",
        setup: "Component setup included",
        summary: `${pkg.serviceTitle} workspace with selected components and portal choices.`,
        subscription: "Subscription is calculated from the selected service components. More components can be added later from the portal manager.",
      };
      return {
        category: pkg.serviceCategory || "Selected Service",
        serviceId,
        serviceTitle: pkg.serviceTitle || serviceId,
        detail,
        portals,
        selectedComponents: portals,
        estimatedTotal,
        portalPricing: pricing().pricingMapFor(portals),
      };
    }
    const categorySelect = $("#business-type-category-select");
    const category = categorySelect?.value || "General & Setup";
    const [serviceId, serviceTitle] = CATEGORY_SERVICE[category] || CATEGORY_SERVICE["General & Setup"];
    const base = CATEGORY_DETAILS[category] || CATEGORY_DETAILS["General & Setup"];
    const detail = { ...base, ...(SERVICE_OVERRIDES[serviceId] || {}) };
    const portals = Array.from(new Set(SERVICE_PORTALS[serviceId] || BASE_PORTALS));
    const estimatedTotal = pricing().totalFor(portals);
    return { category, serviceId, serviceTitle, detail: { ...detail, cost: formatKsh(estimatedTotal) }, portals, selectedComponents: portals, estimatedTotal, portalPricing: pricing().pricingMapFor(portals) };
  };

  const populateBusinessTypePicker = () => {
    const categorySelect = $("#business-type-category-select");
    if (!categorySelect) return;
    categorySelect.innerHTML = BUSINESS_TYPE_GROUPS.map((group) => `<option value="${group.category}">${group.category}</option>`).join("");
    categorySelect.addEventListener("change", updateBusinessTypeDetails);
    updateBusinessTypeDetails();
  };

  const cleanTenantId = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);

  const slug = (value) => cleanTenantId(value).slice(0, 42) || "organization";

  const digest = async (value) => {
    if (window.crypto?.subtle) {
      const bytes = new TextEncoder().encode(String(value || ""));
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    return btoa(unescape(encodeURIComponent(String(value || ""))));
  };

  const parseJsonResponse = async (res) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      const contentType = res.headers?.get?.("content-type") || "";
      const err = new Error(
        `Registration service returned an invalid response${contentType ? ` (${contentType})` : ""}. Using local workspace mode.`,
      );
      err.invalidJson = true;
      err.status = res.status;
      err.preview = text.slice(0, 80);
      throw err;
    }
  };

  const postJson = async (url, body) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await parseJsonResponse(res);
    return { res, data };
  };

  const createLocalOrganization = async (body) => {
    const now = new Date().toISOString();
    const selected = selectedServiceConfig(body);
    const base = slug(body.name || body.organizationName);
    const unique = Math.random().toString(16).slice(2, 8).toUpperCase();
    const tenantId = cleanTenantId(`${base}-${unique.toLowerCase()}`);
    const orgCode = `${base.toUpperCase().replace(/-/g, "").slice(0, 10)}-${unique}`;
    const adminEmail = String(body.adminEmail || body.email || "").trim().toLowerCase();
    const organization = {
      id: tenantId,
      organizationId: `ORG-${orgCode}`,
      referenceCode: orgCode,
      name: String(body.name || "Organization").trim(),
      businessType: selected.serviceId,
      serviceCategory: selected.category,
      serviceTitle: selected.serviceTitle,
      servicePricing: selected.detail,
      selectedComponents: selected.selectedComponents || selected.portals,
      estimatedTotal: selected.estimatedTotal || 0,
      monthlyAmount: selected.estimatedTotal || 0,
      portalPricing: selected.portalPricing || pricing().pricingMapFor(selected.portals),
      contact: {
        email: String(body.email || adminEmail).trim().toLowerCase(),
        phone: String(body.phone || "").trim(),
        location: String(body.location || "").trim(),
      },
      companySize: String(body.companySize || "1-10").trim(),
      status: "active",
      subscriptionStatus: "trial",
      admin: { name: String(body.adminName || "Organization Admin").trim(), email: adminEmail, role: "org_admin" },
      metrics: { users: 1, branches: Number(body.branchCount || 0) || 0, inventoryItems: 0, orders: 0, revenue: 0 },
      createdAt: now,
      updatedAt: now,
      localPasswordHash: await digest(body.adminPassword || body.password || ""),
    };

    const rows = readJson(ORGS_KEY, []);
    writeJson(ORGS_KEY, [organization, ...(Array.isArray(rows) ? rows : [])]);
    window.EnterpriseCore?.setTenant?.(tenantId);
    writeJson(USERS_KEY, [
      {
        id: `user-${Date.now()}`,
        name: organization.admin.name,
        email: adminEmail,
        role: "org_admin",
        permissions: ["*"],
        status: "active",
        createdAt: now,
      },
    ]);
    writeJson(PROFILE_KEY, organization);
    writeJson(SETTINGS_KEY, {
      modules: ["dashboard"],
      installedPortals: [],
      recommendedPortals: selected.portals,
      allowedPortals: selected.portals,
      agreementAccepted: false,
      onboardingComplete: false,
      businessType: selected.serviceId,
      serviceCategory: selected.category,
      serviceTitle: selected.serviceTitle,
      servicePricing: selected.detail,
      selectedComponents: selected.selectedComponents || selected.portals,
      estimatedTotal: selected.estimatedTotal || 0,
      monthlyAmount: selected.estimatedTotal || 0,
      portalPricing: selected.portalPricing || pricing().pricingMapFor(selected.portals),
      branches: Array.from({ length: organization.metrics.branches }, (_, idx) => `Branch ${idx + 1}`),
      departments: ["technology-services", "technology-devices", "software-company", "it-support", "digital-agency"].includes(selected.serviceId) ? ["Sales", "Operations", "Finance", "HR", "Technology", "Support"] : [],
      createdAt: now,
    });
    window.EnterpriseCore?.audit?.("organization.registered.local", { organizationId: organization.organizationId });
    return { ok: true, organization, tenantId, organizationId: organization.organizationId, localMode: true };
  };

  document.addEventListener("DOMContentLoaded", () => {
    populateBusinessTypePicker();
    renderSelectedPackage();

    $("#org-register-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const result = $("#org-register-result");
      result.textContent = "Creating organization...";
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      const phoneCode = String(body.phoneCode || "").trim();
      const phoneNumber = String(body.phoneNumber || "").trim().replace(/^\+/, "");
      body.phone = `${phoneCode} ${phoneNumber}`.trim();
      body.action = "register";
      body.registrationSource = "organization-onboarding";
      const selected = selectedServiceConfig(body);
      body.serviceCategory = selected.category;
      body.serviceTitle = selected.serviceTitle;
      body.serviceCost = selected.detail.cost;
      body.servicePlan = selected.detail.plan;
      body.serviceSetup = selected.detail.setup;
      body.recommendedPortals = selected.portals;
      body.selectedComponents = selected.selectedComponents || selected.portals;
      body.estimatedTotal = selected.estimatedTotal || 0;
      body.monthlyAmount = selected.estimatedTotal || 0;
      body.portalPricing = selected.portalPricing || pricing().pricingMapFor(selected.portals);
      try {
        let data;
        try {
          const response = await postJson("/api/organizations", body);
          data = response.data;
          if (!response.res.ok || !data?.ok) throw new Error(data?.error || "Registration failed");
        } catch (apiErr) {
          if (!isLocalDevelopment()) throw apiErr;
          data = await createLocalOrganization(body);
        }
        window.EnterpriseCore?.setTenant?.(data.tenantId);
        if (data.pendingApproval) {
          result.style.color = "var(--ok)";
          result.textContent = `Registration submitted for ${data.organization.name}. ID: ${data.organizationId}. Admin must approve the organization before the workspace opens.`;
          event.currentTarget.reset();
          return;
        }
        let sessionData = null;
        try {
          const sessionResponse = await postJson("/api/auth/session", {
            action: "organization-login",
            role: "org_admin",
            organizationName: body.name,
            identifier: data.organizationId || data.tenantId || body.adminEmail || body.email,
            tenantId: data.tenantId,
            email: body.adminEmail || body.email,
            password: body.adminPassword,
          });
          if (!sessionResponse.res.ok || !sessionResponse.data?.ok) throw new Error(sessionResponse.data?.error || "Login failed");
          sessionData = sessionResponse.data;
        } catch (sessionErr) {
          if (!isLocalDevelopment()) throw new Error(`Organization created, but automatic login failed: ${sessionErr.message}`);
        }
        window.EnterpriseCore?.setSession?.(
          {
            role: "org_admin",
            email: body.adminEmail || body.email,
            userId: sessionData?.session?.userId || "organization-admin",
            permissions: sessionData?.session?.permissions || ["*"],
            tenantId: data.tenantId,
            token: sessionData?.token || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            organizationId: data.organizationId,
            organizationName: data.organization?.name || body.name,
            localMode: data.localMode === true || !sessionData?.token,
            expiresAt: sessionData?.session?.exp ? new Date(sessionData.session.exp).toISOString() : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
          },
          true,
        );
        result.style.color = "var(--ok)";
        result.textContent = `Created ${data.organization.name}. ID: ${data.organizationId}. Opening agreement...`;
        setTimeout(() => {
          location.href = `organization-agreement.html?tenant=${encodeURIComponent(data.tenantId)}`;
        }, 900);
      } catch (err) {
        result.style.color = "var(--danger)";
        result.textContent = err.message;
      }
    });
  });
})();
