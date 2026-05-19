(() => {
  "use strict";

  // Shared service images and downloaded local service photo mapping.
  const imageFor = {
    setup: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=80",
    apps: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1600&q=80",
    operations: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1600&q=80",
    retail: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1600&q=80",
    food: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=80",
    health: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1600&q=80",
    books: "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1600&q=80",
    clothing: "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=1600&q=80",
    hotel: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80",
    clinic: "https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=1600&q=80",
    technology: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1600&q=80",
  };

  const serviceImageQueries = {
    "business-onboarding": "business onboarding office team",
    "organization-setup": "company planning meeting",
    "licensing-subscriptions": "subscription billing software",
    "security-services": "cybersecurity access control",
    "support-training": "business training workshop",
    "cloud-hosting": "cloud server data center",
    "data-migration": "data migration dashboard",
    "finance-management": "finance accounting office",
    "hr-staff-access": "human resources team",
    "retail-pos": "retail point of sale",
    "inventory-control": "warehouse inventory shelves",
    "crm-workflows": "customer service crm",
    "document-management": "business documents archive",
    "reporting-tools": "business report dashboard",
    "task-management": "team task planning",
    "role-permissions": "office access control",
    "audit-trails": "audit checklist business",
    notifications: "business software notifications dashboard",
    "multi-branch-reports": "multi location business",
    "subscription-review": "business subscription review",
    "customer-support-desk": "customer support desk",
    "book-store": "bookstore shelves",
    "clothing-store": "clothing store retail",
    "furniture-store": "furniture showroom",
    "grocery-store": "grocery store produce",
    "technology-services": "technology services software team",
    wholesale: "wholesale warehouse",
    "mini-supermarket": "mini supermarket aisle",
    restaurants: "restaurant dining room",
    "fast-food": "fast food counter",
    hotels: "hotel lobby",
    "guest-house": "guest house room",
    "bar-pub": "bar pub counter",
    "sports-club": "sports club training",
    "pharmacy-store": "pharmacy shelves",
    "hair-salon": "hair salon",
    gym: "gym fitness equipment",
    clinics: "medical clinic reception",
  };

  const serviceImage = (id, fallback) => {
    if (!serviceImageQueries[id]) return fallback;
    return `images/services/${id}.jpg`;
  };

  // Subscription components used by service bundles and registration handoff.
  const components = {
    admin: ["Admin", 0, "Users, roles, permissions, workspace settings, and account control."],
    inventory: ["Inventory", 1500, "Stock records, product movement, low-stock review, and item availability."],
    sales: ["Sales / POS", 1500, "Counter sales, receipts, payments, customer orders, and daily totals."],
    finance: ["Finance", 1500, "Payments, expenses, billing records, balances, and finance summaries."],
    reporting: ["Reporting", 1000, "Operational reports, sales summaries, exports, and manager review."],
    customer: ["Customers / CRM", 1000, "Customer records, follow-ups, support notes, and relationship history."],
    staff: ["Staff Access", 1000, "Staff accounts, responsibilities, attendance links, and role-based access."],
    branch: ["Branch Management", 1500, "Multi-location records, branch teams, local operations, and branch reports."],
    departments: ["Department Management", 1500, "Department records, approval flows, internal structure, and workflow routing."],
    analytics: ["Analytics", 1500, "Trends, charts, performance insights, and activity visibility."],
    hr: ["HR", 1500, "Employee records, departments, payroll handoff, and internal responsibilities."],
    logistics: ["Logistics", 1500, "Dispatch, delivery status, transfers, and movement tracking."],
    pharmacy: ["Pharmacy Stock", 2000, "Medicine inventory, expiry review, suppliers, and controlled stock workflows."],
    procurement: ["Procurement", 1500, "Supplier records, purchase requests, purchase orders, delivery tracking, and approvals."],
    technology: ["Technology Services", 2500, "Projects, tickets, deployments, developer work, documentation, meetings, subscriptions, and client billing."],
    retail: ["Retail Operations", 1500, "Retail product records, POS workflows, returns, discounts, and shop reports."],
    manufacturing: ["Manufacturing", 2500, "Production orders, raw materials, quality control, and costing workflows."],
    academic: ["Academic", 2000, "Students, classes, records, fees, attendance, and academic reporting."],
    hospital: ["Hospital", 2500, "Patient workflows, hospital departments, billing, staff access, and reports."],
    restaurant: ["Restaurant", 1500, "Menus, orders, kitchen activity, stock usage, payments, and daily reports."],
    "real-estate": ["Real Estate", 2000, "Properties, clients, leases, payments, maintenance, and reporting."],
    director: ["Executive ERP Portal", 2500, "Executive review, branch visibility, client reports, subscriptions, approvals, and top-level control."],
    "device-branch": ["Branch Operations Portal", 2000, "Branch stock, product and service records, local sales, assets, losses, and local reports."],
    "team-leader": ["Operations Lead Portal", 1500, "Work allocation to agents, team tracking, service assignment, and portfolio status."],
    agent: ["ERP Agent Portal", 1000, "Organization onboarding, clients, commissions, subscriptions, contracts, referrals, support, and reports."],
    "device-departments": ["Department Workflow Portal", 2000, "Finance, HR, sales, procurement, operations, technology, and admin review workflows."],
  };
  const componentOrder = Object.keys(components);

  // Base bundles keep common business types consistent.
  const baseBundles = {
    retail: {
      core: ["admin", "inventory", "sales", "finance", "reporting"],
      optional: ["customer", "staff", "branch", "analytics"],
    },
    food: {
      core: ["admin", "inventory", "sales", "finance", "reporting"],
      optional: ["customer", "staff", "branch", "analytics"],
    },
    health: {
      core: ["admin", "customer", "finance", "staff", "reporting"],
      optional: ["inventory", "pharmacy", "branch", "analytics"],
    },
    setup: {
      core: ["admin", "staff", "reporting"],
      optional: ["customer", "finance", "analytics", "branch"],
    },
    operations: {
      core: ["admin", "staff", "reporting"],
      optional: ["branch", "analytics", "customer", "finance"],
    },
  };

  const serviceBundles = {
    "finance-management": { core: ["admin", "finance", "reporting"], optional: ["analytics", "staff", "customer", "branch"] },
    "hr-staff-access": { core: ["admin", "hr", "staff", "reporting"], optional: ["departments", "finance", "analytics"] },
    "retail-pos": { core: ["admin", "retail", "inventory", "sales", "finance", "reporting"], optional: ["customer", "branch", "analytics"] },
    "inventory-control": { core: ["admin", "inventory", "reporting"], optional: ["branch", "procurement", "analytics", "finance"] },
    "crm-workflows": { core: ["admin", "customer", "sales", "reporting"], optional: ["staff", "finance", "analytics"] },
    "document-management": { core: ["admin", "staff", "reporting"], optional: ["departments", "customer", "analytics"] },
    "reporting-tools": { core: ["admin", "reporting", "analytics"], optional: ["finance", "sales", "inventory"] },
    "task-management": { core: ["admin", "staff", "departments", "reporting"], optional: ["analytics", "customer"] },
    "role-permissions": { core: ["admin", "departments", "staff", "reporting"], optional: ["analytics"] },
    "audit-trails": { core: ["admin", "reporting", "analytics"], optional: ["staff", "finance"] },
    notifications: { core: ["admin", "staff", "customer", "reporting"], optional: ["analytics"] },
    "multi-branch-reports": { core: ["admin", "branch", "reporting", "analytics"], optional: ["finance", "inventory", "sales"] },
    "subscription-review": { core: ["admin", "finance", "reporting"], optional: ["analytics", "customer"] },
    "customer-support-desk": { core: ["admin", "customer", "staff", "reporting"], optional: ["sales", "analytics"] },
    "book-store": baseBundles.retail,
    "clothing-store": baseBundles.retail,
    "furniture-store": { core: ["admin", "inventory", "sales", "finance", "reporting"], optional: ["customer", "logistics", "branch", "analytics"] },
    "grocery-store": baseBundles.retail,
    wholesale: { core: ["admin", "inventory", "sales", "finance", "reporting"], optional: ["branch", "logistics", "customer", "analytics"] },
    "mini-supermarket": baseBundles.retail,
    "technology-services": { core: ["admin", "technology", "customer", "sales", "finance", "staff", "reporting"], optional: ["agent", "branch", "analytics", "hr", "procurement"] },
    restaurants: baseBundles.food,
    "fast-food": baseBundles.food,
    hotels: { core: ["admin", "customer", "finance", "staff", "reporting"], optional: ["branch", "hr", "inventory", "analytics"] },
    "guest-house": { core: ["admin", "customer", "finance", "staff", "reporting"], optional: ["inventory", "analytics"] },
    "bar-pub": baseBundles.food,
    "sports-club": baseBundles.health,
    "pharmacy-store": { core: ["admin", "pharmacy", "inventory", "sales", "finance", "reporting"], optional: ["branch", "customer", "staff", "analytics"] },
    "hair-salon": { core: ["admin", "customer", "sales", "finance", "staff", "reporting"], optional: ["inventory", "analytics"] },
    gym: baseBundles.health,
    clinics: { core: ["admin", "customer", "finance", "staff", "reporting"], optional: ["pharmacy", "inventory", "analytics"] },
  };

  // Services shown in menus and detail pages.
  const groups = [
    {
      name: "Business Setup",
      image: "setup",
      items: [
        ["business-onboarding", "Business Onboarding", "Launch a clean digital workspace with registration, verification, administrator access, and guided activation."],
        ["organization-setup", "Organization Setup", "Prepare company structure, departments, branches, staff roles, and workspace controls before daily work begins."],
        ["licensing-subscriptions", "Licensing & Subscriptions", "Choose plans, billing periods, modules, and growth options that fit the organization."],
        ["security-services", "Security Services", "Protect records, permissions, users, documents, and important activity with controlled access."],
        ["support-training", "Support & Training", "Help teams understand setup, tools, billing, modules, and daily platform use."],
        ["cloud-hosting", "Cloud Hosting Setup", "Prepare the hosted environment where the organization works securely and reliably."],
        ["data-migration", "Data Migration", "Move important business records into a cleaner digital structure with review and cleanup support."],
      ],
    },
    {
      name: "Business Apps",
      image: "apps",
      items: [
        ["finance-management", "Finance Management", "Track billing, payments, expenses, approval activity, and finance reporting from one workspace."],
        ["hr-staff-access", "HR & Staff Access", "Manage employee records, departments, roles, payroll handoff, and internal responsibilities."],
        ["retail-pos", "Retail & POS", "Support shop sales, receipts, product movement, customer activity, and branch-level retail workflows."],
        ["inventory-control", "Inventory Control", "Keep stock movement, suppliers, audits, alerts, and availability organized across the business."],
        ["crm-workflows", "CRM Workflows", "Organize customers, follow-ups, support notes, sales activity, and relationship history."],
        ["document-management", "Document Management", "Keep files, records, policies, approvals, and sensitive documents in one controlled place."],
        ["reporting-tools", "Reporting Tools", "Turn daily activity into summaries for managers, administrators, and department leaders."],
      ],
    },
    {
      name: "Operations Apps",
      image: "operations",
      items: [
        ["task-management", "Task Management", "Coordinate work, assignments, responsibilities, progress, and follow-up activity."],
        ["role-permissions", "Role Permissions", "Control who can view, change, approve, and manage each part of the workspace."],
        ["audit-trails", "Audit Trails", "Keep important user activity visible for review, investigation, and accountability."],
        ["notifications", "Notifications", "Keep teams aware of approvals, alerts, account changes, and workflow updates."],
        ["multi-branch-reports", "Multi-Branch Reports", "Compare sales, stock, staff activity, finance, and performance across locations."],
        ["subscription-review", "Subscription Review", "Review active plans, module usage, billing needs, upgrades, and service changes."],
        ["customer-support-desk", "Customer Support Desk", "Give users a place to request help, track support needs, and keep communication organized."],
      ],
    },
    {
      name: "Retail",
      image: "retail",
      items: [
        ["book-store", "Book Store", "Manage book stock, school orders, supplier records, counter sales, and daily shop activity.", "books"],
        ["clothing-store", "Clothing Store", "Track clothing stock by size, color, style, sales, returns, customers, and branch movement.", "clothing"],
        ["furniture-store", "Furniture Store", "Organize furniture items, custom orders, delivery status, payments, suppliers, and showroom stock."],
        ["grocery-store", "Grocery Store", "Support fast sales, stock counts, supplier purchases, daily cash activity, and product movement."],
        ["technology-services", "Technology Services", "Run software projects, IT support, cybersecurity, hosting, SaaS subscriptions, deployments, client billing, and support tickets.", "technology"],
        ["wholesale", "Wholesale", "Handle bulk stock, customer accounts, supplier records, invoices, dispatch, and warehouse movement."],
        ["mini-supermarket", "Mini Supermarket", "Run supermarket sales, cashier activity, product categories, supplier purchases, and reports."],
      ],
    },
    {
      name: "Food & Hospitality",
      image: "food",
      items: [
        ["restaurants", "Restaurants", "Manage menu items, table orders, kitchen flow, payments, stock usage, and daily reports."],
        ["fast-food", "Fast Food", "Support quick orders, takeaway sales, kitchen queues, ingredients, receipts, and staff shifts."],
        ["hotels", "Hotels", "Organize guest records, rooms, bookings, payments, services, staff duties, and reporting.", "hotel"],
        ["guest-house", "Guest House", "Track rooms, guests, reservations, check-ins, payments, housekeeping, and occupancy records.", "hotel"],
        ["bar-pub", "Bar & Pub", "Manage bar stock, sales, tabs, suppliers, staff shifts, event nights, and end-of-day reports."],
      ],
    },
    {
      name: "Health & Fitness",
      image: "health",
      items: [
        ["sports-club", "Sports Club", "Manage members, subscriptions, sessions, team activity, equipment, staff access, and club reports."],
        ["pharmacy-store", "Pharmacy", "Track medicine stock, suppliers, sales, expiry review, branch records, and daily pharmacy reports.", "clinic"],
        ["hair-salon", "Hair Salon", "Organize appointments, services, staff activity, customers, product stock, payments, and summaries."],
        ["gym", "Gym", "Manage memberships, subscriptions, attendance, trainers, classes, payments, and fitness center reports."],
        ["clinics", "Clinics", "Support patient records, appointments, billing, staff roles, pharmacy links, and clinic reporting.", "clinic"],
      ],
    },
  ];

  const categoryPricing = {
    "Business Setup": {
      cost: "From KSh 2,500 / month",
      plan: "Starter or Business",
      setup: "Setup included",
      subscription: "Subscription is attached to the registered organization workspace. You can renew monthly, upgrade later, and add modules, users, or branches as operations grow.",
    },
    "Business Apps": {
      cost: "From KSh 7,500 / month",
      plan: "Business",
      setup: "Module setup included",
      subscription: "Business app subscriptions run inside the organization workspace. The monthly fee covers the workspace plus selected modules, with upgrades available for more users, branches, and support.",
    },
    "Operations Apps": {
      cost: "From KSh 7,500 / month",
      plan: "Business",
      setup: "Admin setup included",
      subscription: "Operations apps are added to the organization subscription as enabled modules. Billing can renew monthly or yearly depending on the business arrangement.",
    },
    Retail: {
      cost: "From KSh 2,500 / month",
      plan: "Starter or Business",
      setup: "POS setup included",
      subscription: "Small retail shops can start on Starter. Multi-branch retail, wholesale, supermarket, and hardware workflows should use Business for stronger inventory and reporting.",
    },
    "Food & Hospitality": {
      cost: "From KSh 2,500 / month",
      plan: "Starter or Business",
      setup: "Menu/workflow setup included",
      subscription: "Restaurants and fast-food teams can start lean. Hotels, guest houses, and multi-location hospitality businesses should upgrade as rooms, staff, and reports increase.",
    },
    "Health & Fitness": {
      cost: "From KSh 2,500 / month",
      plan: "Starter or Business",
      setup: "Records setup included",
      subscription: "Simple salons, gyms, and clubs can start on Starter. Clinics and pharmacies usually need Business for controlled records, stock, staff roles, and reporting.",
    },
  };

  const servicePricing = {
    "technology-services": {
      cost: "From KSh 7,500 / month",
      plan: "Business",
      setup: "Technology workflow setup included",
      subscription: "The subscription covers software projects, IT services, support tickets, deployments, client billing, subscriptions, developer work, and technical documentation.",
    },
    "pharmacy-store": {
      cost: "From KSh 7,500 / month",
      plan: "Business",
      setup: "Pharmacy stock setup included",
      subscription: "Pharmacy subscriptions normally use Business because stock control, branch records, expiry review, and finance reporting need stronger module access.",
    },
    clinics: {
      cost: "From KSh 7,500 / month",
      plan: "Business or Enterprise",
      setup: "Clinic workflow setup required",
      subscription: "Clinics can start on Business. Enterprise is recommended when custom workflows, more users, or advanced controls are needed.",
    },
    hotels: {
      cost: "From KSh 7,500 / month",
      plan: "Business",
      setup: "Rooms and booking setup included",
      subscription: "Hotel subscriptions use Business when room records, guest activity, staff access, and reporting need to run together.",
    },
    "licensing-subscriptions": {
      cost: "Custom by selected plan",
      plan: "Starter, Business, or Enterprise",
      setup: "Billing review included",
      subscription: "The final cost depends on selected plan, modules, users, branches, support level, and monthly or yearly renewal choice.",
    },
    "security-services": {
      cost: "From KSh 2,500 / month",
      plan: "Starter or Business",
      setup: "Security setup included",
      subscription: "Security services are included with the organization subscription and can expand with role permissions, audit trails, protected records, and stronger access review as the business grows.",
    },
  };

  const catalog = Object.fromEntries(
    groups.flatMap((group) =>
      group.items.map(([id, title, description, image]) => [
        id,
        {
          id,
          title,
          description,
          category: group.name,
          image: serviceImage(id, imageFor[image || group.image]),
          features: makeFeatures(title, group.name),
          pricing: { ...(categoryPricing[group.name] || categoryPricing["Business Setup"]), ...(servicePricing[id] || {}) },
        },
      ]),
    ),
  );

  function makeFeatures(title, category) {
    const lower = title.toLowerCase();
    if (category === "Retail") {
      return [
        ["Sales and receipts", `Record ${lower} sales, payments, discounts, and daily totals.`],
        ["Stock control", "Monitor availability, movement, low stock, supplier purchases, and branch transfers."],
        ["Customer records", "Keep customer activity, orders, balances, and follow-up information organized."],
        ["Reports", "Review sales, stock movement, expenses, profit signals, and staff activity."],
      ];
    }
    if (category === "Food & Hospitality") {
      return [
        ["Orders and service", `Manage ${lower} orders, bookings, guests, tables, or counter activity.`],
        ["Stock and supplies", "Track ingredients, drinks, room supplies, purchases, usage, and reorder needs."],
        ["Staff activity", "Review shifts, responsibilities, handovers, and service progress."],
        ["Daily reports", "Summarize revenue, expenses, occupancy, orders, and operational performance."],
      ];
    }
    if (category === "Health & Fitness") {
      return [
        ["Client records", `Organize ${lower} members, patients, customers, appointments, and visit history.`],
        ["Subscriptions and billing", "Track payments, renewals, balances, receipts, and service charges."],
        ["Staff roles", "Control access for reception, managers, specialists, trainers, or administrators."],
        ["Performance reports", "Review attendance, bookings, sales, stock, and service activity."],
      ];
    }
    return [
      ["Workspace setup", `Configure ${lower} with users, permissions, branches, and records.`],
      ["Daily operations", "Keep activities, documents, approvals, customers, staff, or tasks organized."],
      ["Management visibility", "Give leaders reports and summaries they can use for decisions."],
      ["Growth support", "Add more users, branches, modules, and workflows as the organization expands."],
    ];
  }

  function serviceUrl(id) {
    return `service-detail.html?id=${encodeURIComponent(id)}`;
  }

  function componentPrice(id) {
    return components[id]?.[1] || 0;
  }

  function formatKsh(amount) {
    return `KSh ${Number(amount || 0).toLocaleString("en-KE")} / month`;
  }

  function componentCard(id, selected, required = false) {
    const [title, price, description] = components[id] || [id, 0, ""];
    return `
      <label class="component-card ${required ? "is-required" : ""}" title="${description}" data-component-id="${id}" data-component-title="${title}" data-component-description="${description}">
        <input type="checkbox" value="${id}" ${selected ? "checked" : ""} ${required ? "disabled" : ""} />
        <span class="component-icon">${title.slice(0, 2).toUpperCase()}</span>
        <span class="component-text">
          <strong>${title}</strong>
          <small>${price ? formatKsh(price) : "Included"}</small>
        </span>
      </label>
    `;
  }

  // Component selector, price estimate, and registration payload.
  function renderComponents(service) {
    const bundle = serviceBundles[service.id] || (service.category === "Retail" ? baseBundles.retail : service.category === "Food & Hospitality" ? baseBundles.food : service.category === "Health & Fitness" ? baseBundles.health : baseBundles.setup);
    const core = Array.from(new Set(bundle.core));
    const optional = Array.from(new Set(bundle.optional.filter((id) => !core.includes(id))));
    const coreTarget = document.querySelector("[data-core-components]");
    const optionalTarget = document.querySelector("[data-optional-components]");
    const allTarget = document.querySelector("[data-all-component-list]");
    if (!coreTarget || !optionalTarget) return;
    const selected = new Set(core);
    const extra = componentOrder.filter((id) => !core.includes(id) && !optional.includes(id));
    coreTarget.innerHTML = core.map((id) => componentCard(id, true, true)).join("");
    optionalTarget.innerHTML = optional.map((id) => componentCard(id, false)).join("");
    if (allTarget) allTarget.innerHTML = extra.map((id) => componentCard(id, false)).join("");

    const sync = () => {
      selected.clear();
      core.forEach((id) => selected.add(id));
      optionalTarget.querySelectorAll("input[type='checkbox']:checked").forEach((input) => selected.add(input.value));
      allTarget?.querySelectorAll("input[type='checkbox']:checked").forEach((input) => selected.add(input.value));
      const selectedIds = [...selected];
      const total = selectedIds.reduce((sum, id) => sum + componentPrice(id), 0);
      const selectedNames = selectedIds.map((id) => components[id]?.[0] || id);
      document.querySelector("[data-component-total]").textContent = formatKsh(total);
      document.querySelector("[data-selected-count]").textContent = `${selectedIds.length} component${selectedIds.length === 1 ? "" : "s"} selected`;
      document.querySelector("[data-selected-components]").textContent = selectedNames.join(", ");
      const payload = {
        serviceId: service.id,
        serviceTitle: service.title,
        serviceCategory: service.category,
        estimatedTotal: total,
        components: selectedIds,
        componentNames: selectedNames,
      };
      localStorage.setItem("mapphex_selected_service_package", JSON.stringify(payload));
      const primaryAction = document.querySelector("[data-service-primary]");
      if (primaryAction) {
        const params = new URLSearchParams();
        params.set("service", service.id);
        params.set("components", selectedIds.join(","));
        params.set("estimate", String(total));
        primaryAction.href = `organization-register.html?${params.toString()}`;
      }
    };

    optionalTarget.addEventListener("change", sync);
    allTarget?.addEventListener("change", sync);
    document.querySelector("[data-toggle-all-components]")?.addEventListener("click", (event) => {
      const body = document.querySelector("[data-all-components]");
      if (!body) return;
      body.hidden = !body.hidden;
      event.currentTarget.textContent = body.hidden ? "View all components" : "Hide all components";
    });
    document.querySelectorAll("[data-component-id]").forEach((item) => {
      item.addEventListener("click", () => {
        const detail = document.querySelector("[data-component-detail]");
        if (!detail) return;
        detail.innerHTML = `<strong>${item.dataset.componentTitle}</strong><span>${item.dataset.componentDescription}</span>`;
      });
    });
    window.MapphexServiceDetail?.renderAppPreview?.(service, core, components);
    sync();
  }

  // Page rendering and navigation.
  function renderMenu() {
    document.querySelectorAll("[data-service-menu]").forEach((menu) => {
      menu.innerHTML = groups
        .map(
          (group) => `
            <div class="mega-column">
              <h3>${group.name}</h3>
              ${group.items.map(([id, title]) => `<a href="${serviceUrl(id)}">${title}</a>`).join("")}
            </div>
          `,
        )
        .join("");
    });
  }

  function renderDetail() {
    const params = new URLSearchParams(location.search);
    const id = params.get("id") || "business-onboarding";
    const service = catalog[id] || catalog["business-onboarding"];
    const related = groups.find((group) => group.name === service.category)?.items.filter(([itemId]) => itemId !== service.id).slice(0, 4) || [];

    document.title = `${service.title} | MAPPHEX`;
    const hero = document.querySelector("[data-service-hero]");
    document.querySelector("[data-service-category]").textContent = service.category;
    document.querySelector("[data-service-title]").textContent = service.title;
    document.querySelector("[data-service-description]").textContent = service.description;
    document.querySelector("[data-service-feature-heading]").textContent = `${service.title} service features`;
    document.querySelector("[data-service-feature-copy]").textContent =
      "This page gives a clearer view of what the selected service can manage inside a MAPPHEX workspace.";
    document.querySelector("[data-service-cost]").textContent = service.pricing.cost;
    document.querySelector("[data-service-plan]").textContent = service.pricing.plan;
    document.querySelector("[data-service-setup]").textContent = service.pricing.setup;
    document.querySelector("[data-service-subscription]").textContent = service.pricing.subscription;
    const primaryAction = document.querySelector("[data-service-primary]");
    if (primaryAction) {
      primaryAction.href = "organization-register.html";
      primaryAction.textContent = "Register Organization";
    }

    if (hero) hero.style.setProperty("--service-bg", `url("${service.image}")`);
    renderComponents(service);

    document.querySelector("[data-service-features]").innerHTML = service.features
      .map(([title, text]) => `<article><strong>${title}</strong><span>${text}</span></article>`)
      .join("");

    document.querySelector("[data-related-services]").innerHTML = related
      .map(([itemId, title]) => `<a href="${serviceUrl(itemId)}">${title}</a>`)
      .join("");
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderMenu();
    renderDetail();
  });
})();
