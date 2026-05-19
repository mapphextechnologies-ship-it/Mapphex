(() => {
  "use strict";

  const MODULES_KEY = "enterprise_modules_v1";
  const LAST_EVENT_KEY = "enterprise_last_event_seq_v1";

  const core = () => window.EnterpriseCore || null;
  const store = () => window.EnterpriseStore || null;

  const safeText = (value) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 240);

  const el = (tag, className, text = "") => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  let livebar;
  let notices;
  let status;
  let lastSeq = Number(sessionStorage.getItem(LAST_EVENT_KEY) || 0) || 0;
  let pollTimer = null;
  let eventSource = null;

  const ensureShell = () => {
    if (livebar) return;
    livebar = el("div", "enterprise-livebar");
    notices = el("div", "enterprise-notices");
    status = el("div", "enterprise-status");
    status.innerHTML = '<span class="enterprise-dot" aria-hidden="true"></span><span>Live sync</span>';
    livebar.append(notices, status);
    document.body.appendChild(livebar);
  };

  const setOnline = (online) => {
    ensureShell();
    status.classList.toggle("offline", !online);
    status.lastElementChild.textContent = online ? "Live sync" : "Offline queue";
  };

  const notice = (title, body) => {
    ensureShell();
    const item = el("div", "enterprise-notice");
    item.append(el("div", "enterprise-notice-title", safeText(title)), el("div", "enterprise-notice-body", safeText(body)));
    notices.prepend(item);
    while (notices.children.length > 3) notices.lastElementChild.remove();
    setTimeout(() => item.remove(), 6500);
  };

  const handleEvent = (event) => {
    const seq = Number(event?.seq || 0) || 0;
    if (seq && seq <= lastSeq) return;
    if (seq) {
      lastSeq = seq;
      sessionStorage.setItem(LAST_EVENT_KEY, String(seq));
    }
    window.dispatchEvent(new CustomEvent("enterprise:realtime", { detail: event }));
    if (event?.type === "kv.batch.updated" || event?.type === "kv.updated") {
      notice("Realtime update", "Business data changed and dashboards are refreshing.");
      store()?.refresh?.([]).catch?.(() => null);
    } else if (event?.type === "modules.updated") {
      notice("Modules updated", "The enabled business modules changed.");
      loadModules().catch(() => null);
    } else if (event?.type === "platform.broadcast.received" || event?.type === "org.announcement.sent") {
      notice(event.displayType || event.payload?.title || "Announcement", event.displayMessage || event.payload?.message || event.payload?.title || "A new announcement is available.");
    } else if (event?.type) {
      notice(event.displayType || event.type, event.displayMessage || "A live platform event was received.");
    }
  };

  const pollEvents = async () => {
    try {
      const res = await fetch(`/api/realtime?after=${encodeURIComponent(lastSeq)}`, { method: "GET" });
      const data = await res.json();
      if (data?.ok && Array.isArray(data.events)) data.events.forEach(handleEvent);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  };

  const connectRealtime = () => {
    if (!("EventSource" in window)) {
      pollTimer = setInterval(pollEvents, 3500);
      pollEvents().catch(() => null);
      return;
    }
    try {
      eventSource = new EventSource(`/api/realtime?after=${encodeURIComponent(lastSeq)}`);
      eventSource.onopen = () => setOnline(true);
      eventSource.onerror = () => {
        setOnline(false);
        eventSource?.close();
        eventSource = null;
        if (!pollTimer) pollTimer = setInterval(pollEvents, 3500);
      };
      eventSource.onmessage = (message) => {
        try {
          handleEvent(JSON.parse(message.data));
        } catch {
          // ignore invalid event payload
        }
      };
      ["kv.updated", "kv.batch.updated", "modules.updated", "assets.synced"].forEach((type) => {
        eventSource.addEventListener(type, (message) => {
          try {
            handleEvent(JSON.parse(message.data));
          } catch {
            // ignore invalid event payload
          }
        });
      });
    } catch {
      pollTimer = setInterval(pollEvents, 3500);
      pollEvents().catch(() => null);
    }
  };

  const loadModules = async () => {
    let modules = store()?.getJson?.(MODULES_KEY, null);
    try {
      const res = await fetch("/api/modules", { method: "GET" });
      const data = await res.json();
      if (data?.ok && data.modules) {
        modules = data.modules;
        store()?.setJson?.(MODULES_KEY, modules);
      }
    } catch {
      // use cached modules
    }
    if (!modules?.catalog || document.querySelector(".enterprise-module-strip")) return;
    const enabled = new Set(modules.enabled || []);
    const strip = el("div", "enterprise-module-strip");
    modules.catalog
      .filter((item) => enabled.has(item.id))
      .slice(0, 12)
      .forEach((item) => strip.appendChild(el("span", "enterprise-module-chip", item.label)));
    const topbar = document.querySelector(".topbar");
    if (topbar?.parentNode) topbar.insertAdjacentElement("afterend", strip);
  };

  document.addEventListener("DOMContentLoaded", async () => {
    ensureShell();
    setOnline(navigator.onLine !== false);
    window.addEventListener("online", () => setOnline(true));
    window.addEventListener("offline", () => setOnline(false));
    window.addEventListener("enterprise:notify", (event) => notice(event.detail?.title, event.detail?.body));
    await store()?.bootstrap?.([MODULES_KEY]);
    loadModules().catch(() => null);
    connectRealtime();
    core()?.audit?.("page.view", { page: document.body?.dataset?.page || location.pathname });
  });
})();
