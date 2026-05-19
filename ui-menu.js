(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const setMenuOpen = (open) => {
    const mobile = window.innerWidth <= 980;
    if (mobile) {
      document.body.classList.toggle("menu-open", !!open);
      document.body.classList.remove("portal-sidebar-collapsed");
    } else {
      document.body.classList.remove("menu-open");
      document.body.classList.toggle("portal-sidebar-collapsed", !!open);
    }
    const toggle = $("#menu-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", mobile ? (open ? "true" : "false") : (!open ? "true" : "false"));
    const sidebar = $("#portal-sidebar");
    if (sidebar) sidebar.setAttribute("aria-hidden", open || window.innerWidth > 980 ? "false" : "true");
    const backdrop = $("#menu-backdrop");
    if (backdrop) backdrop.setAttribute("aria-hidden", mobile && open ? "false" : "true");
    if (mobile && open) $("#menu-close")?.focus?.({ preventScroll: true });
  };

  const setActiveLink = () => {
    const hash = location.hash || "#dashboard";
    $$(".sidebar-link").forEach((link) => {
      const active = link.getAttribute("href") === hash;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  };

  window.addEventListener("DOMContentLoaded", () => {
    const toggle = $("#menu-toggle");
    const close = $("#menu-close");
    const backdrop = $("#menu-backdrop");

    if (toggle) {
      toggle.addEventListener("click", () => {
        const open = window.innerWidth <= 980
          ? !document.body.classList.contains("menu-open")
          : !document.body.classList.contains("portal-sidebar-collapsed");
        setMenuOpen(open);
      });
    }
    if (close) close.addEventListener("click", () => setMenuOpen(false));
    if (backdrop) backdrop.addEventListener("click", () => setMenuOpen(false));
    document.addEventListener("click", (e) => {
      const link = e.target?.closest?.(".sidebar-link");
      if (!link || window.innerWidth > 980) return;
      setMenuOpen(false);
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth > 980) document.body.classList.remove("menu-open");
      else document.body.classList.remove("portal-sidebar-collapsed");
    });
    window.addEventListener("hashchange", setActiveLink);
    setActiveLink();
    setMenuOpen(false);
  });
})();
