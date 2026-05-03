(() => {
  "use strict";

  const PAGE = document.body?.dataset?.page || "";

  const SESSION_LOCAL_KEY = "jixels_session_branch_v1";
  const SESSION_SESSION_KEY = "jixels_session_branch_tmp_v1";
  const BRANCH_ACCOUNTS_KEY = "jixels_branch_accounts_v1";

  const $ = (selector, root = document) => root.querySelector(selector);

  const safeJsonParse = (raw, fallback) => {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  const loadJson = (key, fallback) => {
    const store = window.JixelsStore || null;
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

  const loadBranchAccounts = () => {
    const storeAccounts = loadJson(BRANCH_ACCOUNTS_KEY, []);
    const browserAccounts = loadBrowserJson(BRANCH_ACCOUNTS_KEY, []);
    const storeList = Array.isArray(storeAccounts) ? storeAccounts : [];
    const browserList = Array.isArray(browserAccounts) ? browserAccounts : [];
    return accountListScore(browserList) > accountListScore(storeList) ? browserList : storeList;
  };

  const init = async () => {
    if (PAGE !== "branch-login") return;

    await window.JixelsStore?.bootstrap?.([BRANCH_ACCOUNTS_KEY]);

    const session = getSession();
    if (session?.role === "branch" && session?.branchId) {
      window.location.href = "Branch.html";
      return;
    }

    const form = $("#branch-login-form");
    const identifier = $("#identifier");
    const password = $("#password");
    const rememberMe = $("#rememberMe");
    const error = $("#branch-login-error");
    const loginBtn = $("#branch-login-btn");

    if (!form || !identifier || !password || !error) return;

    if (loadBranchAccounts().length === 0) {
      if (loginBtn) loginBtn.textContent = "Login";
      error.textContent = "No branch account is stored yet. Register first, then wait for Admin approval.";
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      error.textContent = "";

      const inputId = String(identifier.value || "").trim().toLowerCase();
      const inputPassword = String(password.value || "");

      await window.JixelsStore?.bootstrap?.([BRANCH_ACCOUNTS_KEY]);
      await window.JixelsStore?.refresh?.([BRANCH_ACCOUNTS_KEY]);
      const latestAccounts = loadBranchAccounts();
      const account =
        latestAccounts.find(
          (a) =>
            String(a.email || "").toLowerCase() === inputId ||
            String(a.username || "").toLowerCase() === inputId,
        ) || null;

      if (!account) {
        error.textContent = "Account not found. Check your email/username.";
        return;
      }

      const status = String(account.status || "approved").toLowerCase();
      if (status === "rejected") {
        error.textContent = "Account rejected. Please contact Head Office.";
        return;
      }
      if (status !== "approved") {
        error.textContent = "Account is pending admin approval.";
        return;
      }

      const inputHash = await hashHex(`${account.salt}:${inputPassword}`);
      if (inputHash !== account.passwordHash) {
        error.textContent = "Incorrect password.";
        password.value = "";
        password.focus();
        return;
      }

      setSession(
        {
          role: "branch",
          userId: account.id,
          branchId: account.branchId,
          email: account.email,
          username: account.username,
        },
        !!rememberMe?.checked,
      );

      window.location.href = "Branch.html";
    });
  };

  init();
})();
