const { sendJson } = require("../api/_lib/http");
const { getStore } = require("../api/_lib/kv-store");
const { requireSuperAdmin } = require("../api/_lib/super-admin-auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  requireSuperAdmin(req);

  const store = getStore();
  return sendJson(res, 200, {
    ok: true,
    time: new Date().toISOString(),
    kv: {
      driver: store.driver,
      kvPath: store.driver === "file" ? store.kvPath : undefined,
    },
  });
};

