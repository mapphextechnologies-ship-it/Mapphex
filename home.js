(() => {
  "use strict";

  document.body?.classList.add("js-ready");

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const compactViewport = window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
  const nav = document.querySelector("[data-nav]");
  const navToggle = document.querySelector("[data-nav-toggle]");
  const navBackdrop = document.querySelector("[data-nav-backdrop]");
  const navLinks = [...document.querySelectorAll("[data-nav-menu] a")];
  const sectionIds = navLinks.map((link) => link.getAttribute("href")).filter((href) => href?.startsWith("#"));
  const sections = sectionIds.map((id) => document.querySelector(id)).filter(Boolean);

  const setNavOpen = (open) => {
    if (!nav || !navToggle) return;
    nav.classList.toggle("nav-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    navBackdrop?.setAttribute("aria-hidden", open ? "false" : "true");
  };

  const formatNumber = (value) => {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
    }
    return String(value);
  };

  const animateCounter = (element) => {
    const target = Number(element.dataset.count || 0);
    if (!target || element.dataset.done === "true") return;
    element.dataset.done = "true";

    if (prefersReducedMotion) {
      element.textContent = formatNumber(target);
      return;
    }

    const startedAt = performance.now();
    const duration = 1100;

    const tick = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = formatNumber(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  };

  const revealNow = (element) => {
    element.classList.add("is-visible");
  };

  const clearSession = () => {
    window.EnterpriseCore?.clearSession?.();
  };

  const handlePublicLogout = () => {
    const params = new URLSearchParams(location.search);
    if (params.get("logout") === "1") {
      clearSession();
      history.replaceState(null, "", location.pathname);
    }
  };

  const setActiveLink = (id) => {
    navLinks.forEach((link) => {
      const active = link.getAttribute("href") === id;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  };

  const setActivePageLink = () => {
    const currentPage = location.pathname.split("/").pop() || "index.html";
    navLinks.forEach((link) => {
      const href = link.getAttribute("href") || "";
      if (href.startsWith("#")) return;
      const linkPage = new URL(href, location.href).pathname.split("/").pop() || "index.html";
      const active = linkPage === currentPage || (currentPage === "service-detail.html" && linkPage === "services.html");
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  };

  const serviceItems = {
    "book-store": [
      ["Book inventory", "Track titles, editions, quantities, reorder needs, and supplier sources."],
      ["Sales records", "Record counter sales, discounts, receipts, and daily cash summaries."],
      ["School orders", "Organize bulk book requests, reservations, and customer follow-up."],
      ["Reports", "Review fast-moving books, low stock, and monthly performance."],
    ],
    "clothing-store": [
      ["Size and color stock", "Manage variants by size, color, style, and branch availability."],
      ["Sales and returns", "Record purchases, exchanges, returns, discounts, and customer notes."],
      ["Supplier tracking", "Keep supplier details, purchase history, and new stock arrivals organized."],
      ["Retail reports", "Review popular items, stock movement, and sales totals."],
    ],
    "furniture-store": [
      ["Product catalog", "Organize furniture items, dimensions, materials, prices, and availability."],
      ["Orders", "Track customer orders, deposits, balances, delivery status, and completion."],
      ["Suppliers", "Manage supplier records, purchase costs, and restock planning."],
      ["Delivery notes", "Keep delivery schedules, addresses, and handoff records clear."],
    ],
    "grocery-store": [
      ["Fast sales", "Record daily purchases, receipts, cashier activity, and payment totals."],
      ["Stock checks", "Monitor quantities, reorder needs, damaged goods, and fast-moving items."],
      ["Supplier purchases", "Track suppliers, purchase records, and incoming goods."],
      ["Daily summaries", "Review sales, expenses, stock movement, and cash position."],
    ],
    "hardware-shop": [
      ["Catalog records", "Track tools, materials, accessories, equipment, SKU codes, and serial numbers where needed."],
      ["Sales and services", "Record product sales, service jobs, deposits, balances, and status."],
      ["Branch allocation", "Move items between branches, agents, or sales points with visibility."],
      ["Inventory reports", "Review stock, sold items, damaged items, and pending assignments."],
    ],
    wholesale: [
      ["Bulk inventory", "Manage large stock quantities, cartons, batches, and warehouse movement."],
      ["Customer accounts", "Track wholesale buyers, invoices, balances, and order history."],
      ["Dispatch", "Prepare delivery records, branch transfers, and pickup notes."],
      ["Purchase review", "Monitor suppliers, stock costs, margins, and reorder planning."],
    ],
    "mini-supermarket": [
      ["POS sales", "Record cashier sales, receipts, product categories, and payment totals."],
      ["Inventory", "Track shelves, store room stock, low-stock items, and damaged goods."],
      ["Supplier records", "Organize purchases, vendors, restock dates, and product costs."],
      ["Management reports", "Review sales, expenses, stock movement, and branch performance."],
    ],
    restaurants: [
      ["Menu sales", "Manage menu items, prices, orders, receipts, and table activity."],
      ["Kitchen flow", "Track order status from counter or table to kitchen completion."],
      ["Stock usage", "Review ingredient movement, purchases, waste, and reorder needs."],
      ["Daily reports", "Summarize staff activity, sales, expenses, and service performance."],
    ],
    "fast-food": [
      ["Quick orders", "Support counter orders, takeaway sales, receipts, and kitchen queues."],
      ["Ingredients", "Track stock usage, product movement, and reorder needs."],
      ["Shift activity", "Review cashier activity, staff handovers, and sales totals."],
      ["Branch reports", "Compare fast-food activity across one or more outlets."],
    ],
    hotels: [
      ["Bookings", "Manage room reservations, check-ins, check-outs, and guest records."],
      ["Payments", "Track deposits, balances, invoices, and service charges."],
      ["Operations", "Organize housekeeping, staff duties, room status, and maintenance notes."],
      ["Hotel reports", "Review occupancy, revenue, expenses, and guest activity."],
    ],
    "guest-house": [
      ["Room records", "Track room availability, reservations, check-ins, and check-outs."],
      ["Guest details", "Keep guest contacts, stay history, payments, and notes organized."],
      ["Housekeeping", "Manage room status, cleaning notes, and maintenance follow-up."],
      ["Daily review", "Summarize occupancy, income, and pending guest-house tasks."],
    ],
    "bar-pub": [
      ["Bar stock", "Track drinks, quantities, supplier purchases, and reorder needs."],
      ["Sales records", "Record tabs, counter sales, receipts, and daily cash totals."],
      ["Staff shifts", "Review shift activity, handovers, and user accountability."],
      ["Event nights", "Organize special sales activity, stock usage, and performance reports."],
    ],
    "sports-club": [
      ["Members", "Manage member profiles, subscriptions, renewals, and attendance."],
      ["Sessions", "Track training sessions, bookings, staff, and facility use."],
      ["Equipment", "Organize equipment records, maintenance, and assignment notes."],
      ["Club reports", "Review subscriptions, activity, revenue, and operational needs."],
    ],
    "pharmacy-store": [
      ["Medicine stock", "Track quantities, expiry review, suppliers, and branch availability."],
      ["Sales records", "Record medicine sales, receipts, customer activity, and daily totals."],
      ["Supplier purchases", "Manage incoming products, costs, purchase history, and reorder needs."],
      ["Pharmacy reports", "Review stock movement, low stock, expiry risks, and sales summaries."],
    ],
    "hair-salon": [
      ["Appointments", "Manage bookings, walk-ins, service times, and customer visits."],
      ["Services", "Track salon services, prices, staff activity, and payments."],
      ["Product stock", "Monitor hair products, purchases, usage, and reorder needs."],
      ["Salon reports", "Review revenue, repeat customers, staff performance, and daily activity."],
    ],
    gym: [
      ["Memberships", "Manage member profiles, plans, renewals, and payment status."],
      ["Attendance", "Track check-ins, classes, trainer sessions, and facility use."],
      ["Subscriptions", "Review active plans, expired memberships, and follow-up needs."],
      ["Gym reports", "Summarize member activity, revenue, trainer work, and growth."],
    ],
    clinics: [
      ["Patient records", "Keep patient details, visits, appointments, and service history organized."],
      ["Billing", "Track consultation payments, balances, receipts, and finance summaries."],
      ["Staff roles", "Control access for reception, clinicians, pharmacy, and administration."],
      ["Clinic reports", "Review appointments, revenue, service activity, and operational needs."],
    ],
    "support-training": [
      ["Setup support", "Guide administrators through workspace setup, module activation, and first-use checks."],
      ["Staff training", "Help users understand the tools, records, and workflows they use every day."],
      ["Support requests", "Receive questions, issues, and service needs from organization users."],
      ["Usage review", "Review adoption gaps and help teams use the selected services correctly."],
    ],
    "cloud-hosting": [
      ["Workspace hosting", "Prepare the hosted environment for secure organization access."],
      ["Availability checks", "Support uptime monitoring, health review, and basic platform readiness."],
      ["Environment setup", "Organize the technical foundation required before daily work begins."],
      ["Data protection", "Keep hosted records structured and protected with controlled access."],
    ],
    "data-migration": [
      ["Record review", "Check existing files, spreadsheets, and operational records before import."],
      ["Data cleanup", "Organize duplicate, missing, or inconsistent information before migration."],
      ["Import support", "Move approved business records into the correct workspace areas."],
      ["Migration report", "Summarize moved records, pending items, and follow-up needs."],
    ],
    "finance-management": [
      ["Income records", "Track payments, sales income, subscription activity, and received funds."],
      ["Expense records", "Organize purchases, operating costs, supplier payments, and branch expenses."],
      ["Finance reports", "Review summaries for managers, directors, and administrators."],
      ["Approvals", "Support review steps before finance records are completed or marked paid."],
    ],
    "hr-staff-access": [
      ["Staff records", "Keep employee details, roles, contacts, and branch assignments organized."],
      ["Department access", "Connect users to the correct department tools and responsibilities."],
      ["Payroll support", "Prepare salary records, payroll review, and finance handoff workflows."],
      ["Permission control", "Limit access based on role, department, branch, and module needs."],
    ],
    "retail-pos": [
      ["Sales entry", "Record shop sales, customer purchases, receipts, and payment details."],
      ["Product movement", "Connect sales activity with stock movement and branch availability."],
      ["Customer activity", "Keep useful customer and transaction history for review."],
      ["Daily summaries", "Give managers clean sales totals and branch-level retail updates."],
    ],
    "inventory-control": [
      ["Stock levels", "Monitor available items, low stock, product status, and branch inventory."],
      ["Transfers", "Move stock between branches, departments, warehouses, or sales points."],
      ["Supplier links", "Connect stock records with suppliers, purchases, and receiving activity."],
      ["Audit checks", "Support stock counts, discrepancies, damage, loss, and review notes."],
    ],
    "crm-workflows": [
      ["Customer profiles", "Store customer details, contacts, notes, and relationship history."],
      ["Follow-ups", "Track pending calls, messages, support actions, and sales opportunities."],
      ["Service records", "Keep customer support activity and issue history in one place."],
      ["Pipeline view", "Review customer movement from interest to sale or support completion."],
    ],
    "document-management": [
      ["File storage", "Keep policies, contracts, business records, and workspace documents organized."],
      ["Access rules", "Control who can view, upload, change, or approve sensitive documents."],
      ["Record search", "Make important documents easier to find during daily work."],
      ["Approval notes", "Support review comments, status, and document follow-up."],
    ],
    "reporting-tools": [
      ["Operational reports", "Summarize daily work across departments, branches, and modules."],
      ["Finance reports", "Review payments, expenses, billing, and subscription activity."],
      ["Staff reports", "Track users, roles, performance, payroll status, and access activity."],
      ["Export support", "Prepare summaries for sharing, printing, or management review."],
    ],
    "pharmacy-operations": [
      ["Medicine inventory", "Track stock levels, movement, supplier records, and branch availability."],
      ["Sales records", "Connect pharmacy sales with product movement and daily summaries."],
      ["Supplier records", "Organize product sources, purchase history, and supply contacts."],
      ["Branch review", "Give managers visibility across pharmacy locations and activity."],
    ],
    "school-management": [
      ["Student records", "Organize learner information, admissions, contacts, and school records."],
      ["Finance activity", "Support fee records, payments, expenses, and school finance summaries."],
      ["Staff coordination", "Manage teachers, administrators, roles, and department access."],
      ["School reports", "Prepare operational summaries for management and administration."],
    ],
    "logistics-tracking": [
      ["Order stages", "Track requests, dispatch, movement, delivery status, and completion."],
      ["Route activity", "Keep movement notes, location updates, and operational handoff details."],
      ["Customer updates", "Support clearer communication around order and delivery progress."],
      ["Dispatch reports", "Review logistics performance, delays, and completed work."],
    ],
    "branch-management": [
      ["Branch profiles", "Create and manage locations with separate users, stock, and records."],
      ["Local activity", "Keep branch sales, staff, inventory, and reports organized by location."],
      ["Manager access", "Give branch leaders the tools they need without exposing unrelated records."],
      ["Group reporting", "Compare branch performance and movement from the main workspace."],
    ],
    "warehouse-control": [
      ["Receiving", "Record incoming goods, supplier deliveries, and storage details."],
      ["Storage view", "Organize warehouse stock, locations, counts, and movement status."],
      ["Dispatch prep", "Prepare items for branch transfer, delivery, or sales use."],
      ["Warehouse audits", "Review counts, discrepancies, damages, and operational notes."],
    ],
    "supplier-records": [
      ["Supplier profiles", "Store contacts, business details, product sources, and account notes."],
      ["Purchase history", "Review previous orders, supplied items, and payment references."],
      ["Supply review", "Track supplier reliability, pending requests, and purchasing needs."],
      ["Product links", "Connect suppliers to inventory, warehouse, and branch records."],
    ],
    "analytics-dashboard": [
      ["Performance view", "Summarize sales, finance, HR, inventory, and branch activity."],
      ["Trend review", "Show patterns in usage, growth, workload, and operational movement."],
      ["Module insights", "Help administrators understand which services are being used."],
      ["Management metrics", "Give leaders quick numbers for decisions and follow-up."],
    ],
    "task-management": [
      ["Task assignment", "Create work items for users, departments, branches, or managers."],
      ["Progress tracking", "Review pending, active, completed, and blocked work."],
      ["Responsibility notes", "Keep clear ownership, due dates, and follow-up details."],
      ["Work summaries", "Give teams a practical view of what needs attention."],
    ],
    "role-permissions": [
      ["Role setup", "Create access levels for admins, managers, staff, and department users."],
      ["Module access", "Control which services each user can open and manage."],
      ["Branch limits", "Keep branch users focused on their assigned location records."],
      ["Access review", "Check user permissions as teams and services change."],
    ],
    "audit-trails": [
      ["Activity logs", "Record important actions taken inside the organization workspace."],
      ["User tracking", "See who changed records, reviewed items, or completed key steps."],
      ["Security review", "Support investigation and accountability for sensitive activity."],
      ["Admin visibility", "Keep managers aware of important system and workflow changes."],
    ],
    "notifications": [
      ["Workflow alerts", "Notify users about approvals, assignments, updates, and changes."],
      ["Support updates", "Keep organizations aware of support responses and service progress."],
      ["Operational reminders", "Bring attention to pending work, reviews, and follow-ups."],
      ["Account notices", "Share subscription, access, and workspace status updates."],
    ],
    "multi-branch-reports": [
      ["Branch comparison", "Compare sales, stock, staff activity, and finance across locations."],
      ["Grouped summaries", "Review organization-wide activity without mixing branch records."],
      ["Manager reports", "Give directors and administrators a clearer branch performance view."],
      ["Export review", "Prepare branch reports for meetings, sharing, or audit needs."],
    ],
    "subscription-review": [
      ["Plan usage", "Review active services, users, modules, and workspace needs."],
      ["Billing needs", "Understand subscription costs, renewal requirements, and plan changes."],
      ["Upgrade options", "Identify services the organization may need as it grows."],
      ["Service cleanup", "Adjust modules that are unused, duplicated, or no longer needed."],
    ],
    "customer-support-desk": [
      ["Help requests", "Let users send setup questions, service issues, and support needs."],
      ["Ticket tracking", "Keep requests organized by status, priority, user, and organization."],
      ["Response history", "Preserve support notes, decisions, and follow-up activity."],
      ["Service review", "Help support teams understand repeated issues and training gaps."],
    ],
  };

  const setupServicePage = () => {
    const hub = document.querySelector(".services-hub");
    if (!hub) return;

    const picker = hub.querySelector(".service-picker");
    const details = [...hub.querySelectorAll(".service-detail[id]")];
    const choiceLinks = [...hub.querySelectorAll(".service-choice-grid a[href^='#']")];

    details.forEach((section) => {
      if (section.querySelector(".solution-strip, .premium-grid, .security-grid")) return;
      const items = serviceItems[section.id];
      if (!items?.length) return;
      const grid = document.createElement("div");
      grid.className = "security-grid";
      items.forEach(([title, text]) => {
        const article = document.createElement("article");
        const strong = document.createElement("strong");
        const span = document.createElement("span");
        strong.textContent = title;
        span.textContent = text;
        article.append(strong, span);
        grid.append(article);
      });
      section.append(grid);
    });

    details.forEach((section) => {
      if (section.querySelector(".service-back")) return;
      const backLink = document.createElement("a");
      backLink.className = "service-back";
      backLink.href = "services.html";
      backLink.textContent = "All services";
      section.append(backLink);
    });

    const showService = (hash, scroll = true) => {
      const id = String(hash || "").replace(/^#/, "");
      const target = details.find((section) => section.id === id);
      if (!target) {
        hub.classList.remove("service-selected");
        if (picker) picker.hidden = false;
        details.forEach((section) => {
          section.classList.remove("active-service");
          section.hidden = true;
        });
        choiceLinks.forEach((link) => link.removeAttribute("aria-current"));
        return;
      }

      hub.classList.add("service-selected");
      if (picker) picker.hidden = true;
      details.forEach((section) => {
        const active = section === target;
        section.classList.toggle("active-service", active);
        section.hidden = !active;
        if (active) section.classList.add("is-visible");
      });
      choiceLinks.forEach((link) => {
        const active = link.getAttribute("href") === `#${id}`;
        if (active) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
      if (scroll) target.scrollIntoView({ behavior: prefersReducedMotion || compactViewport ? "auto" : "smooth", block: "start" });
    };

    details.forEach((section) => {
      section.hidden = true;
    });

    choiceLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        const hash = link.getAttribute("href");
        if (!hash) return;
        event.preventDefault();
        history.replaceState(null, "", hash);
        showService(hash);
      });
    });

    hub.addEventListener("click", (event) => {
      const backLink = event.target?.closest?.(".service-back");
      if (!backLink) return;
      event.preventDefault();
      history.replaceState(null, "", location.pathname);
      showService("");
      picker?.scrollIntoView({ behavior: prefersReducedMotion || compactViewport ? "auto" : "smooth", block: "start" });
    });

    if (location.hash) showService(location.hash, false);
    window.addEventListener("hashchange", () => showService(location.hash, false));
  };

  document.addEventListener("DOMContentLoaded", () => {
    handlePublicLogout();
    setupServicePage();
    setActivePageLink();

    navToggle?.addEventListener("click", () => {
      setNavOpen(!nav?.classList.contains("nav-open"));
    });
    navBackdrop?.addEventListener("click", () => setNavOpen(false));

    navLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        const id = link.getAttribute("href");
        const target = id?.startsWith("#") ? document.querySelector(id) : null;
        setNavOpen(false);
        if (!target) return;
        event.preventDefault();
        setActiveLink(id);
        target.classList.add("section-focus");
        target.scrollIntoView({ behavior: prefersReducedMotion || compactViewport ? "auto" : "smooth", block: "start" });
        history.replaceState(null, "", id);
        setTimeout(() => target.classList.remove("section-focus"), 650);
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setNavOpen(false);
    });

    const reveals = [...document.querySelectorAll(".reveal")];
    const counters = [...document.querySelectorAll(".count-up")];

    if (!("IntersectionObserver" in window) || prefersReducedMotion) {
      reveals.forEach(revealNow);
      counters.forEach(animateCounter);
      return;
    }

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          revealNow(entry.target);
          revealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.16 },
    );

    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.5 },
    );

    reveals.forEach((item) => revealObserver.observe(item));
    counters.forEach((item) => counterObserver.observe(item));

    const activeObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActiveLink(`#${visible.target.id}`);
      },
      { rootMargin: "-28% 0px -58% 0px", threshold: [0.18, 0.32, 0.5] },
    );
    sections.forEach((section) => activeObserver.observe(section));
  });
})();
