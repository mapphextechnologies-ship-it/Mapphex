(() => {
  "use strict";

  const form = () => document.querySelector("#super-admin-login-form");
  const errorEl = () => document.querySelector("#super-admin-login-error");
  const isLocal = () => ["localhost", "127.0.0.1", ""].includes(location.hostname);
  const dashboardUrl = () => (isLocal() ? "/_internal/mapphex-control/dashboard" : "/admin-dashboard.html");

  document.addEventListener("DOMContentLoaded", async () => {
    if (window.SuperAdminSession?.readSession?.()) {
      location.replace(dashboardUrl());
      return;
    }

    form()?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const err = errorEl();
      if (err) err.textContent = "";
      const data = new FormData(event.currentTarget);
      try {
        const res = await fetch("/api/super-admin/session", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            username: data.get("username"),
            password: data.get("password"),
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.ok) throw new Error(body?.error || "Login failed");
        window.SuperAdminSession.writeSession({ token: body.token, session: body.session });
        location.replace(dashboardUrl());
      } catch (error) {
        if (err) err.textContent = error.message || "Login failed";
      }
    });
  });
})();
