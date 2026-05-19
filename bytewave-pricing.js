((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BytewavePricing = api;
})(typeof window !== "undefined" ? window : globalThis, () => {
  "use strict";

  const PORTAL_PRICES = Object.freeze({
    admin: 0,
    inventory: 1500,
    sales: 1500,
    finance: 1500,
    reporting: 1000,
    customer: 1000,
    staff: 1000,
    branch: 1500,
    departments: 1500,
    analytics: 1500,
    hr: 1500,
    logistics: 1500,
    pharmacy: 2000,
    procurement: 1500,
    technology: 2500,
    retail: 1500,
    manufacturing: 2500,
    academic: 2000,
    hospital: 2500,
    restaurant: 1500,
    "real-estate": 2000,
    director: 2500,
    "device-branch": 2000,
    "team-leader": 1500,
    agent: 1000,
    "device-departments": 2000,
  });

  const PORTAL_LABELS = Object.freeze({
    admin: "Admin",
    inventory: "Inventory",
    sales: "Sales / POS",
    finance: "Finance",
    reporting: "Reporting",
    customer: "Customers / CRM",
    staff: "Staff Access",
    branch: "Branch Management",
    departments: "Department Management",
    analytics: "Analytics",
    hr: "HR",
    logistics: "Logistics",
    pharmacy: "Pharmacy Stock",
    procurement: "Procurement",
    technology: "Technology Services",
    retail: "Retail Operations",
    manufacturing: "Manufacturing",
    academic: "Academic",
    hospital: "Hospital",
    restaurant: "Restaurant",
    "real-estate": "Real Estate",
    director: "Executive ERP Portal",
    "device-branch": "Branch Operations Portal",
    "team-leader": "Operations Lead Portal",
    agent: "ERP Agent Portal",
    "device-departments": "Department Workflow Portal",
  });

  const unique = (ids) => Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter(Boolean)));
  const priceFor = (id) => Number(PORTAL_PRICES[id] || 0) || 0;
  const labelFor = (id) => PORTAL_LABELS[id] || String(id || "").replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  const totalFor = (ids) => unique(ids).reduce((sum, id) => sum + priceFor(id), 0);
  const formatMonthly = (amount) => `KSh ${Number(amount || 0).toLocaleString("en-KE")} / month`;
  const breakdownFor = (ids) =>
    unique(ids).map((id) => ({
      id,
      title: labelFor(id),
      monthly: priceFor(id),
      formattedMonthly: priceFor(id) ? formatMonthly(priceFor(id)) : "Included",
    }));
  const pricingMapFor = (ids) => Object.fromEntries(breakdownFor(ids).map((item) => [item.id, item.monthly]));

  return Object.freeze({
    PORTAL_PRICES,
    PORTAL_LABELS,
    priceFor,
    labelFor,
    totalFor,
    formatMonthly,
    breakdownFor,
    pricingMapFor,
  });
});
