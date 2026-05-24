const CACHE_NAME = "mapphex-erp-v152";
const APP_SHELL = [
  "./",
  "./manifest.webmanifest",
  "./index.html",
  "./services.html",
  "./service-detail.html",
  "./portals.html",
  "./organization-register.html",
  "./access-denied.html",
  "./organization-login.html",
  "./organization-agreement.html",
  "./portal-selection.html",
  "./portal-auth.html",
  "./organization-workspace.html",
  "./organization-module.html",
  "./finance-workflow.html",
  "./finance-invoices.html",
  "./finance-approvals.html",
  "./finance-suppliers.html",
  "./finance-budgets.html",
  "./finance-employees.html",
  "./finance-payroll.html",
  "./finance-ledger.html",
  "./finance-reports.html",
  "./finance-export.html",
  "./finance-settings.html",
  "./organization-admin.html",
  "./Agent.html",
  "./Branch.html",
  "./Director.html",
  "./super-admin.html",
  "./TeamLeader.html",
  "./director.css",
  "./enterprise-platform.css",
  "./home.css",
  "./service-detail.css",
  "./management.css",
  "./onboarding.css",
  "./finance-workflow.css",
  "./finance-invoices.css",
  "./finance-approvals.css",
  "./finance-suppliers.css",
  "./finance-budgets.css",
  "./finance-employees.css",
  "./finance-payroll.css",
  "./finance-ledger.css",
  "./finance-reports.css",
  "./finance-export.css",
  "./finance-settings.css",
  "./portal.css",
  "./auth.css",
  "./agent.css",
  "./branch.css",
  "./teamleader.css",
  "./enterprise-core.js",
  "./auth-guard.js",
  "./enterprise-platform.js",
  "./enterprise-modules.js",
  "./kv-client.js",
  "./enterprise-store.js",
  "./bytewave-pricing.js",
  "./erp-client.js",
  "./pwa.js",
  "./ui-menu.js",
  "./home.js",
  "./service-detail.js",
  "./organization-register.js",
  "./organization-login.js",
  "./organization-agreement.js",
  "./portal-selection.js",
  "./portal-auth.js",
  "./organization-workspace.js",
  "./organization-module.js",
  "./finance-workflow.js",
  "./finance-badges.js",
  "./finance-invoices.js",
  "./finance-approvals.js",
  "./finance-suppliers.js",
  "./finance-budgets.js",
  "./finance-employees.js",
  "./finance-db.js",
  "./finance-payments.js",
  "./finance-payroll.js",
  "./finance-ledger.js",
  "./finance-reports.js",
  "./finance-export.js",
  "./finance-settings.js",
  "./organization-admin.js",
  "./agent.js",
  "./branch.js",
  "./director.js",
  "./teamleader.js",
  "./images/enterprise-logo.png",
  "./images/enterprise-icon-192.png",
  "./images/enterprise-icon-512.png",
  "./images/bytewave-logo.jpg",
  "./images/bytewave-icon-192.png",
  "./images/bytewave-icon-512.png",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return;
  if (req.method !== "GET") return;
  const protectedShell = [
    "/organization-agreement.html",
    "/portal-selection.html",
    "/organization-workspace.html",
    "/organization-module.html",
    "/organization-admin.html",
    "/Agent.html",
    "/Branch.html",
    "/Director.html",
    "/TeamLeader.html",
  ].some((path) => url.pathname.endsWith(path));
  if (protectedShell) {
    event.respondWith(fetch(req).catch(() => caches.match("./organization-login.html")));
    return;
  }
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "mapphex-background-sync") return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: "MAPPHEX_BACKGROUND_SYNC", at: new Date().toISOString() }));
    })
  );
});

self.addEventListener("push", (event) => {
  const data = event.data?.json?.() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || "MAPPHEX", {
      body: data.body || "ERP workflow update",
      icon: "/images/enterprise-icon-192.png",
      badge: "/images/enterprise-icon-192.png",
      data: data.url || "/organization-workspace.html",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data || "/organization-workspace.html";
  event.waitUntil(self.clients.openWindow(url));
});
