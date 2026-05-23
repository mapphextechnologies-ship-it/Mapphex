(() => {
  "use strict";

  const services = [
    {
      title: "Phone sales",
      icon: "images/services/logos/phones-hardware.svg",
      body: "New and clean pre-owned smartphones selected for battery life, storage, camera quality, and value.",
      deal: "Device check, basic setup, and accessory matching before handover.",
    },
    {
      title: "Repairs and diagnostics",
      icon: "images/services/logos/security-services.svg",
      body: "Screen, battery, charging, speaker, software, and performance checks with clear repair notes.",
      deal: "Inspection first, then repair advice before parts are fitted.",
    },
    {
      title: "Accessories",
      icon: "images/services/logos/retail-pos.svg",
      body: "Chargers, cables, covers, screen protectors, earbuds, storage, and day-to-day phone tools.",
      deal: "Accessories matched to your phone model and usage.",
    },
    {
      title: "Software setup",
      icon: "images/services/logos/cloud-hosting.svg",
      body: "Email setup, app installation, backup, WhatsApp transfer, security settings, and account recovery support.",
      deal: "Clean setup for personal, staff, or business phones.",
    },
    {
      title: "Business device support",
      icon: "images/services/logos/business-onboarding.svg",
      body: "Support for staff devices, POS phones, inventory apps, sales teams, and small business operations.",
      deal: "Organized support for repeated device needs.",
    },
    {
      title: "Data transfer",
      icon: "images/services/logos/data-migration.svg",
      body: "Move contacts, photos, documents, WhatsApp, email, and apps from old phones to new phones.",
      deal: "Safer transfer with a checklist before the old device is cleared.",
    },
  ];

  const recommendations = [
    {
      key: "Battery and work",
      title: "Long-battery work phone",
      copy: "Best for staff, deliveries, sales activity, calls, WhatsApp, and business apps.",
      items: ["Large battery", "Durable cover", "Fast charger", "Email and WhatsApp setup"],
    },
    {
      key: "Camera and social",
      title: "Content-ready smartphone",
      copy: "Best for photos, reels, product listings, online shops, and customer communication.",
      items: ["Strong camera", "More storage", "Tripod or ring light option", "Social app setup"],
    },
    {
      key: "Budget and value",
      title: "Value phone package",
      copy: "Best for customers who need a reliable phone and useful accessories at controlled cost.",
      items: ["Tested device", "Screen protector", "Protective cover", "Basic app setup"],
    },
    {
      key: "Repair first",
      title: "Repair and refresh package",
      copy: "Best when your current phone can still serve you after repair and cleanup.",
      items: ["Diagnostic check", "Battery/screen advice", "Storage cleanup", "Backup support"],
    },
  ];

  const plans = [
    {
      title: "Quick Help",
      body: "For one-time setup, inspection, accessory matching, or small software issues.",
      price: "From KSh 500",
    },
    {
      title: "Device Care",
      body: "For repairs, diagnostics, data transfer, cleanup, and follow-up phone support.",
      price: "Quote after check",
      featured: true,
    },
    {
      title: "Business Support",
      body: "For staff phones, repeated supply, setup standards, repair logs, and device rollout support.",
      price: "Custom plan",
    },
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const renderServices = () => {
    $("#service-grid").innerHTML = services
      .map(
        (service, index) => `
          <article class="service-card">
            <img src="${service.icon}" alt="" aria-hidden="true" />
            <h3>${service.title}</h3>
            <p>${service.body}</p>
            <button type="button" data-service-index="${index}">Show current deal</button>
          </article>
        `,
      )
      .join("");
  };

  const renderChoices = () => {
    $("[data-phone-choices]").innerHTML = recommendations
      .map(
        (item, index) => `
          <button type="button" data-choice-index="${index}" class="${index === 0 ? "active" : ""}">
            ${item.key}
          </button>
        `,
      )
      .join("");
  };

  const setRecommendation = (index) => {
    const item = recommendations[index] || recommendations[0];
    $("#recommendation-title").textContent = item.title;
    $("#recommendation-copy").textContent = item.copy;
    $("#recommendation-list").innerHTML = item.items.map((text) => `<li>${text}</li>`).join("");
    $$("[data-choice-index]").forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.choiceIndex) === index);
    });
  };

  const renderPlans = () => {
    $("#plan-grid").innerHTML = plans
      .map(
        (plan) => `
          <article class="plan-card ${plan.featured ? "featured" : ""}">
            <h3>${plan.title}</h3>
            <p>${plan.body}</p>
            <span class="plan-price">${plan.price}</span>
          </article>
        `,
      )
      .join("");
  };

  const bindNav = () => {
    const toggle = $(".nav-toggle");
    const links = $("[data-nav-links]");
    toggle?.addEventListener("click", () => {
      const open = !links.classList.contains("open");
      links.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
    });
    $$(".nav-links a").forEach((link) => {
      link.addEventListener("click", () => {
        links.classList.remove("open");
        toggle?.setAttribute("aria-expanded", "false");
      });
    });
  };

  const bindDynamicContent = () => {
    $("#service-grid").addEventListener("click", (event) => {
      const button = event.target.closest("[data-service-index]");
      if (!button) return;
      const item = services[Number(button.dataset.serviceIndex)] || services[0];
      $("#deal-title").textContent = item.title;
      $("#deal-copy").textContent = item.deal;
      location.hash = "home";
    });

    $("[data-phone-choices]").addEventListener("click", (event) => {
      const button = event.target.closest("[data-choice-index]");
      if (button) setRecommendation(Number(button.dataset.choiceIndex));
    });
  };

  const bindForm = () => {
    $("#lead-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      const saved = JSON.parse(localStorage.getItem("jixels_leads_v1") || "[]");
      saved.unshift({ ...data, createdAt: new Date().toISOString() });
      localStorage.setItem("jixels_leads_v1", JSON.stringify(saved.slice(0, 20)));
      $("#form-status").textContent = "Request saved. Jixels Technology will contact you with the right option.";
      event.currentTarget.reset();
    });
  };

  const bindActiveLinks = () => {
    const sections = $$("main section[id]");
    const links = $$(".nav-links a");
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        links.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`));
      },
      { threshold: [0.3, 0.55] },
    );
    sections.forEach((section) => observer.observe(section));
  };

  document.addEventListener("DOMContentLoaded", () => {
    renderServices();
    renderChoices();
    renderPlans();
    setRecommendation(0);
    bindNav();
    bindDynamicContent();
    bindForm();
    bindActiveLinks();
  });
})();
