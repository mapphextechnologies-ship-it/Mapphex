(() => {
  "use strict";

  const SESSION_KEY = "mapphex_super_admin_session_v1";

  const readSession = () => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      const session = raw ? JSON.parse(raw) : null;
      if (!session?.token || !session?.session) return null;
      if (session.session.exp && Date.now() > Number(session.session.exp)) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  };

  const writeSession = (session) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  };

  const clearSession = () => sessionStorage.removeItem(SESSION_KEY);

  const authHeaders = (headers = {}) => {
    const out = new Headers(headers);
    const session = readSession();
    if (session?.token && !out.has("Authorization")) out.set("Authorization", `Bearer ${session.token}`);
    out.set("X-Tenant-ID", "platform");
    return out;
  };

  const apiFetch = async (url, opts = {}) => {
    const res = await fetch(url, { ...opts, headers: authHeaders(opts.headers || {}) });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Super Admin request failed");
    return data;
  };

  Object.defineProperty(window, "SuperAdminSession", {
    value: Object.freeze({ readSession, writeSession, clearSession, authHeaders, apiFetch }),
    writable: false,
    enumerable: false,
    configurable: false,
  });
})();
