(() => {
  const rows = [
    ["Finance staff", "Approved", "Full-time", "Today"],
    ["Casual staff", "Pending", "Contract", "Today"],
  ];
  const statusClass = (status) => (String(status).toLowerCase() === "pending" ? "status pending" : "status");
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelector("[data-menu-button]")?.addEventListener("click", () => document.body.classList.add("sidebar-open"));
    document.querySelector("[data-close-sidebar]")?.addEventListener("click", () => document.body.classList.remove("sidebar-open"));
    const org = new URLSearchParams(location.search).get("org") || new URLSearchParams(location.search).get("tenant");
    if (org) document.querySelector("[data-org-name]").textContent = org;
    const body = document.querySelector("[data-records-body]");
    body.innerHTML = rows.map(([name, status, amount, date]) => `<tr><td>${name}</td><td><span class="${statusClass(status)}">${status}</span></td><td>${amount}</td><td>${date}</td><td><button class="row-action" type="button">Open</button></td></tr>`).join("");
  });
})();
