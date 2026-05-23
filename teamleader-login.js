(() => {
  "use strict";

  const PAGE = document.body?.dataset?.page || "";
  const SESSION_LOCAL_KEY = "enterprise_session_teamleader_v1";
  const SESSION_SESSION_KEY = "enterprise_session_teamleader_tmp_v1";
  const TEAMLEADER_ACCOUNTS_KEY = "enterprise_teamleader_accounts_v1";

  const $ = (selector, root = document) => root.querySelector(selector);

  const safeJsonParse = (raw, fallback) => {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  const loadJson = (key, fallback) => {
    const store = window.EnterpriseStore || null;
    if (store?.getJson) {
      const value = store.getJson(key, undefined);
      if (typeof value !== "undefined" && value !== null) return value;
    }
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return safeJsonParse(raw, fallback);
  };

  const loadBrowserJson = (key, fallback) => {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return safeJsonParse(raw, fallback);
  };

  const accountListScore = (accounts) => {
    if (!Array.isArray(accounts)) return 0;
    return accounts.reduce((latest, account) => {
      const reviewedAt = Date.parse(account?.reviewedAt || "");
      const createdAt = Date.parse(account?.createdAt || "");
      return Math.max(latest, Number.isFinite(reviewedAt) ? reviewedAt : 0, Number.isFinite(createdAt) ? createdAt : 0);
    }, accounts.length);
  };

  const bufToHex = (buffer) =>
    Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  const weakHashHex = (text) => {
    let h1 = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h1 ^= text.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193);
    }
    const hex = (h1 >>> 0).toString(16).padStart(8, "0");
    return `${hex}${hex}${hex}${hex}${hex}${hex}${hex}${hex}`.slice(0, 64);
  };

  const hashHex = async (text) => {
    try {
      if (crypto?.subtle?.digest) {
        const enc = new TextEncoder().encode(text);
        const digest = await crypto.subtle.digest("SHA-256", enc);
        return bufToHex(digest);
      }
    } catch {
      // Fall through.
    }
    return weakHashHex(text);
  };

  const getSession = () => {
    const session =
      safeJsonParse(sessionStorage.getItem(SESSION_SESSION_KEY), null) ||
      loadJson(SESSION_LOCAL_KEY, null);
    if (!session || typeof session !== "object") return null;
    if (!session.role || !session.userId) return null;
    return session;
  };

  const setSession = (session, rememberMe) => {
    const payload = { ...session, createdAt: new Date().toISOString() };
    if (rememberMe) {
      localStorage.setItem(SESSION_LOCAL_KEY, JSON.stringify(payload));
      sessionStorage.removeItem(SESSION_SESSION_KEY);
      return;
    }
    sessionStorage.setItem(SESSION_SESSION_KEY, JSON.stringify(payload));
    localStorage.removeItem(SESSION_LOCAL_KEY);
  };

  const loadAccounts = () => {
    const storeAccounts = loadJson(TEAMLEADER_ACCOUNTS_KEY, []);
    const browserAccounts = loadBrowserJson(TEAMLEADER_ACCOUNTS_KEY, []);
    const storeList = Array.isArray(storeAccounts) ? storeAccounts : [];
    const browserList = Array.isArray(browserAccounts) ? browserAccounts : [];
    return accountListScore(browserList) > accountListScore(storeList) ? browserList : storeList;
  };

  const init = async () => {
    if (PAGE !== "teamleader-login") return;

    await window.EnterpriseStore?.bootstrap?.([TEAMLEADER_ACCOUNTS_KEY]);
    const session = getSession();
    if (session?.role === "teamleader" && session?.branchId) {
      window.location.href = "TeamLeader.html";
      return;
    }

    const form = $("#teamleader-login-form");
    const identifier = $("#identifier");
    const password = $("#password");
    const rememberMe = $("#rememberMe");
    const error = $("#teamleader-login-error");
    const loginBtn = $("#teamleader-login-btn");
    if (!form || !identifier || !password || !error) return;
    window.EnterpriseCore?.rememberLogin?.restore?.("teamleader", {
      checkbox: rememberMe,
      fields: { identifier },
    });

    if (loadAccounts().length === 0) {
      if (loginBtn) loginBtn.textContent = "Login";
      error.textContent = "No team leader account is stored yet. Register first, then wait for Admin approval.";
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      error.textContent = "";

      const inputId = String(identifier.value || "").trim().toLowerCase();
      const inputPassword = String(password.value || "");
      await window.EnterpriseStore?.bootstrap?.([TEAMLEADER_ACCOUNTS_KEY]);
      await window.EnterpriseStore?.refresh?.([TEAMLEADER_ACCOUNTS_KEY]);

      const account =
        loadAccounts().find(
          (a) =>
            String(a.email || "").toLowerCase() === inputId ||
            String(a.username || "").toLowerCase() === inputId,
        ) || null;

      if (!account) return (error.textContent = "Account not found. Check your email/username.");
      const status = String(account.status || "approved").toLowerCase();
      if (status === "rejected") return (error.textContent = "Account rejected. Please contact Head Office.");
      if (status !== "approved") return (error.textContent = "Account is pending admin approval.");

      const inputHash = await hashHex(`${account.salt}:${inputPassword}`);
      if (inputHash !== account.passwordHash) {
        error.textContent = "Incorrect password.";
        password.value = "";
        password.focus();
        return;
      }

      setSession(
        {
          role: "teamleader",
          userId: account.id,
          branchId: account.branchId,
          email: account.email,
          username: account.username,
        },
        !!rememberMe?.checked,
      );
      window.EnterpriseCore?.rememberLogin?.save?.("teamleader", {
        checkbox: rememberMe,
        fields: { identifier },
      });
      window.location.href = "TeamLeader.html";
    });
  };

  init();
})();
