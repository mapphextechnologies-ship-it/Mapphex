(() => {
  "use strict";

  let deferredPrompt = null;
  let installed = false;
  let serviceWorkerReady = null;
  const installButtons = new Set();
  const listeners = new Set();
  let installBanner = null;

  const isStandalone = () =>
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true ||
    installed;

  const setButtonState = (label, muted = false) => {
    installButtons.forEach((btn) => {
      btn.textContent = label;
      btn.classList.toggle("is-muted", !!muted);
      btn.disabled = false;
    });
  };

  const hideButtonIfInstalled = () => {
    installButtons.forEach((button) => {
      button.disabled = isStandalone();
      if (isStandalone()) button.textContent = "App Installed";
    });
  };

  const status = () => ({
    installed: isStandalone(),
    promptReady: !!deferredPrompt,
    supported: "serviceWorker" in navigator,
  });

  const allowAutoInstallBanner = () =>
    document.body?.dataset?.pwaAutoInstall !== "false" &&
    document.body?.dataset?.page !== "portal-selection";

  const registerServiceWorker = () => {
    if (!("serviceWorker" in navigator)) return Promise.resolve(false);
    if (!serviceWorkerReady) {
      serviceWorkerReady = navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(() => navigator.serviceWorker.ready)
        .then(() => true)
        .catch(() => false);
    }
    return serviceWorkerReady;
  };

  const waitForInstallPrompt = (timeoutMs = 1500) =>
    new Promise((resolve) => {
      if (deferredPrompt) {
        resolve(true);
        return;
      }
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        window.removeEventListener("beforeinstallprompt", onPrompt);
        resolve(value);
      };
      const onPrompt = () => finish(true);
      window.addEventListener("beforeinstallprompt", onPrompt, { once: true });
      window.setTimeout(() => finish(!!deferredPrompt), timeoutMs);
    });

  const emitStatus = () => {
    const detail = status();
    listeners.forEach((listener) => {
      try {
        listener(detail);
      } catch {
        // ignore listener failures
      }
    });
    window.dispatchEvent(new CustomEvent("mapphex:pwa-status", { detail }));
  };

  const requestNotifications = async () => {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    return Notification.requestPermission().catch(() => "default");
  };

  const showInstallBanner = () => {
    if (isStandalone() || installBanner || !deferredPrompt) return;
    installBanner = document.createElement("div");
    installBanner.className = "pwa-install-banner";
    installBanner.innerHTML = `
      <div><strong>Install MAPPHEX</strong><span>Use the ERP as one native-style app across your selected portals.</span></div>
      <button class="btn primary" type="button">Install</button>
      <button class="btn" type="button" data-pwa-dismiss>Later</button>
    `;
    installBanner.querySelector(".primary")?.addEventListener("click", async () => {
      const result = await promptInstall();
      if (!result.ok && result.reason === "prompt-unavailable") {
        const text = installBanner?.querySelector("span");
        if (text) text.textContent = manualInstallMessage();
      }
    });
    installBanner.querySelector("[data-pwa-dismiss]")?.addEventListener("click", () => {
      installBanner?.remove();
      installBanner = null;
    });
    document.body.appendChild(installBanner);
  };

  const promptInstall = async () => {
    if (isStandalone()) {
      setButtonState("App Installed", true);
      window.setTimeout(hideButtonIfInstalled, 800);
      return { ok: true, installed: true };
    }

    if (!deferredPrompt) {
      registerServiceWorker().then(() => null);
      await waitForInstallPrompt();
    }

    if (!deferredPrompt) {
      setButtonState("Use Browser Menu", true);
      window.setTimeout(() => setButtonState("Install MAPPHEX App", false), 2400);
      emitStatus();
      return { ok: false, reason: "prompt-unavailable" };
    }

    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    setButtonState("Installing...", true);
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice.catch(() => null);
    requestNotifications().then(() => null);
    if (choice?.outcome === "accepted") {
      installed = true;
      installBanner?.remove();
      installBanner = null;
      setButtonState("App Installed", true);
      window.setTimeout(hideButtonIfInstalled, 900);
      emitStatus();
      return { ok: true, installed: true };
    }
    setButtonState("Install MAPPHEX App", false);
    emitStatus();
    return { ok: false, reason: "dismissed" };
  };

  const manualInstallMessage = () => {
    const ua = navigator.userAgent || "";
    if (/iphone|ipad|ipod/i.test(ua)) return "Use Share, then Add to Home Screen to install MAPPHEX.";
    if (/firefox/i.test(ua)) return "Use your browser menu to install MAPPHEX if app install is available.";
    return "Use the browser menu and choose Install app or Add to Home screen.";
  };

  const createPoweredFooter = () => {
    if (document.getElementById("site-powered-footer")) return;
    const footer = document.createElement("footer");
    footer.id = "site-powered-footer";
    footer.className = "site-powered-footer";
    footer.textContent = "Powered by MAPPHEX Technology";
    document.body.appendChild(footer);
  };

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      registerServiceWorker().then(emitStatus).catch(() => null);
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    setButtonState("Install MAPPHEX App", false);
    hideButtonIfInstalled();
    if (allowAutoInstallBanner()) showInstallBanner();
    emitStatus();
  });

  window.addEventListener("appinstalled", () => {
    installed = true;
    installBanner?.remove();
    installBanner = null;
    setButtonState("Installed", true);
    window.setTimeout(hideButtonIfInstalled, 900);
    emitStatus();
  });

  window.addEventListener("DOMContentLoaded", () => {
    createPoweredFooter();
    document.querySelectorAll("[data-pwa-install]").forEach((button) => {
      installButtons.add(button);
      button.addEventListener("click", () => promptInstall());
    });
    setButtonState(isStandalone() ? "App Installed" : "Install MAPPHEX App", isStandalone());
    emitStatus();
  });

  window.addEventListener("online", () => {
    navigator.serviceWorker?.ready
      ?.then((registration) => registration.sync?.register?.("mapphex-background-sync"))
      .catch(() => null);
  });

  navigator.serviceWorker?.addEventListener?.("message", (event) => {
    if (event.data?.type !== "MAPPHEX_BACKGROUND_SYNC") return;
    window.dispatchEvent(new CustomEvent("mapphex:background-sync", { detail: event.data }));
  });

  window.MapphexPWA = Object.freeze({
    promptInstall,
    requestNotifications,
    isStandalone,
    status,
    onStatus(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      listener(status());
      return () => listeners.delete(listener);
    },
  });
})();
