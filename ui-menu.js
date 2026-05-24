(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const isMobileMenu = () => window.matchMedia("(max-width: 980px)").matches;
  const getSidebar = () => $("#portal-sidebar") || $("#agent-sidebar") || $("#branch-sidebar");

  const setMenuOpen = (open) => {
    const mobile = isMobileMenu();
    const toggle = $("#menu-toggle");
    const sidebar = getSidebar();
    const backdrop = $("#menu-backdrop");

    if (mobile) {
      document.body.classList.toggle("menu-open", !!open);
      document.body.classList.remove("portal-sidebar-collapsed");
      toggle?.setAttribute("aria-expanded", open ? "true" : "false");
      sidebar?.setAttribute("aria-hidden", open ? "false" : "true");
      backdrop?.setAttribute("aria-hidden", open ? "false" : "true");
    } else {
      document.body.classList.remove("menu-open");
      document.body.classList.toggle("portal-sidebar-collapsed", !!open);
      toggle?.setAttribute("aria-expanded", open ? "false" : "true");
      sidebar?.setAttribute("aria-hidden", "false");
      backdrop?.setAttribute("aria-hidden", "true");
    }

    if (mobile && open) $("#menu-close")?.focus?.({ preventScroll: true });
  };

  const setActiveLink = () => {
    const hash = location.hash || "#dashboard";
    $$(".sidebar-link").forEach((link) => {
      const href = link.getAttribute("href") || "";
      let active = href === hash;
      try {
        const url = new URL(href, location.href);
        active = active || (url.pathname === location.pathname && url.hash === hash);
      } catch {
        // keep direct comparison result
      }
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
      toggle.addEventListener("click", (event) => {
        event.preventDefault();
        const open = isMobileMenu()
          ? !document.body.classList.contains("menu-open")
          : !document.body.classList.contains("portal-sidebar-collapsed");
        setMenuOpen(open);
      });
    }
    if (close) close.addEventListener("click", () => setMenuOpen(false));
    if (backdrop) backdrop.addEventListener("click", () => setMenuOpen(false));
    document.addEventListener("click", (e) => {
      const link = e.target?.closest?.(".sidebar-link");
      if (!link || !isMobileMenu()) return;
      setMenuOpen(false);
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    });
    window.addEventListener("resize", () => {
      if (isMobileMenu()) {
        document.body.classList.remove("portal-sidebar-collapsed");
        setMenuOpen(false);
      } else {
        document.body.classList.remove("menu-open");
        setMenuOpen(document.body.classList.contains("portal-sidebar-collapsed"));
      }
    });
    window.addEventListener("hashchange", setActiveLink);
    setActiveLink();
    setMenuOpen(false);
  });
})();
