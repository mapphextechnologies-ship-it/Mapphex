const { sendJson, readJsonBody } = require("../../api/_lib/http");
const { getStore } = require("../../api/_lib/kv-store");
const { getTenantId, scopeTenantKey } = require("../../api/_lib/tenant");
const { appendEvent } = require("../../api/_lib/events");
const { assertIdempotent, getBearerSession, rateLimit, safeString } = require("../../api/_lib/security");

const ERP_KEY = "enterprise_erp_v1";
const BRANCH_COUNT = 47;

const isoNow = () => new Date().toISOString();

const toMoney = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
};

const makeDefaultErp = () => {
  const branches = Array.from({ length: BRANCH_COUNT }, (_, idx) => {
    const id = `b${String(idx + 1).padStart(2, "0")}`;
    return {
      id,
      name: `Branch ${String(idx + 1).padStart(2, "0")}`,
      city: "",
      area: "",
      employees: 0,
      inventory: [],
      items: [],
      phones: [],
      soldItems: [],
      soldPhones: [],
      transactions: [],
      txLog: [],
      damageLoss: [],
      financeSummary: { mpesaIn: 0, bankIn: 0, txCount: 0, lastTxAt: "" },
      ledger: { head: "GENESIS" },
      updatedAt: isoNow(),
    };
  });
  return { version: 1, lastUpdated: isoNow(), branches, departments: {} };
};

const normalizeBranch = (branch) => {
  if (!branch || typeof branch !== "object") return null;
  if (!Array.isArray(branch.inventory)) branch.inventory = [];
  if (!Array.isArray(branch.items)) branch.items = Array.isArray(branch.phones) ? branch.phones : [];
  if (!Array.isArray(branch.phones)) branch.phones = [];
  if (!Array.isArray(branch.soldItems)) branch.soldItems = Array.isArray(branch.soldPhones) ? branch.soldPhones : [];
  if (!Array.isArray(branch.soldPhones)) branch.soldPhones = [];
  if (!Array.isArray(branch.transactions)) branch.transactions = [];
  if (!Array.isArray(branch.txLog)) branch.txLog = [];
  if (!Array.isArray(branch.damageLoss)) branch.damageLoss = [];
  if (!branch.financeSummary || typeof branch.financeSummary !== "object") {
    branch.financeSummary = { mpesaIn: 0, bankIn: 0, txCount: 0, lastTxAt: "" };
  }
  if (!branch.ledger || typeof branch.ledger !== "object") branch.ledger = { head: "GENESIS" };
  return branch;
};

const rebuildInventoryFromItems = (branch) => {
  const activeItems = Array.isArray(branch.items) && branch.items.length ? branch.items : branch.phones || [];
  const soldItems = Array.isArray(branch.soldItems) && branch.soldItems.length ? branch.soldItems : branch.soldPhones || [];
  const byModel = new Map();
  for (const item of [...activeItems, ...soldItems]) {
    const model = String(item.name || item.model || item.serviceName || "").trim() || "-";
    const row = byModel.get(model) || { model, name: model, stock: 0, sold: 0 };
    if (String(item.status || "in_stock") === "sold") row.sold += 1;
    else row.stock += 1;
    byModel.set(model, row);
  }
  branch.inventory = Array.from(byModel.values()).sort((a, b) => String(a.model).localeCompare(String(b.model)));
};

const rebuildInventoryFromPhones = rebuildInventoryFromItems;

const getAssignments = (body) => {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.assignments)) return body.assignments;
  if (Array.isArray(body?.allocations)) return body.allocations;
  if (Array.isArray(body?.catalogItems)) return body.catalogItems;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.products)) return body.products;
  if (Array.isArray(body?.services)) return body.services;
  if (Array.isArray(body?.assets)) return body.assets;
  if (Array.isArray(body?.assignedPhones)) return body.assignedPhones;
  if (Array.isArray(body?.phones)) return body.phones;
  if (body && typeof body === "object") return [body];
  return [];
};

const normalizeBranchToken = (value) => String(value || "").trim().toLowerCase();

const findBranch = (erp, item) => {
  const rawId = String(item.branchId || item.branch_id || item.branch || item.branchCode || item.assignedBranchId || "").trim();
  const rawName = String(item.branchName || item.assignedBranch || item.allocatedBranch || item.allocatedToBranch || "").trim();
  const numeric = rawId.match(/^\d+$/) ? `b${String(Number(rawId)).padStart(2, "0")}` : "";
  const candidates = [rawId, rawName, numeric].map(normalizeBranchToken).filter(Boolean);
  return (erp.branches || []).find((branch) => {
    const id = normalizeBranchToken(branch.id);
    const name = normalizeBranchToken(branch.name);
    return candidates.some((candidate) => candidate === id || candidate === name);
  });
};

const itemSerial = (item) =>
  String(item.serial || item.imei || item.assetTag || item.assetId || item.id || "").trim();

const hasSerial = (erp, serial) => {
  const needle = String(serial || "").trim().toLowerCase();
  if (!needle) return false;
  return (erp.branches || []).some((branch) =>
    [...(branch.items || []), ...(branch.phones || []), ...(branch.soldItems || []), ...(branch.soldPhones || [])].some((item) => itemSerial(item).toLowerCase() === needle),
  );
};

const makeCatalogItem = (item, serial) => {
  const name = String(item.name || item.model || item.serviceName || item.assetName || item.phoneModel || item.phoneName || "").trim();
  const category = String(item.category || item.type || item.itemType || item.color || "").trim();
  const unit = String(item.unit || item.uom || item.storage || item.capacity || "unit").trim();
  return {
    id: String(item.id || item.assetId || `asset-${serial}`).trim(),
    name,
    model: name,
    category,
    color: category,
    unit,
    storage: unit,
    serial,
    sku: String(item.sku || item.serviceCode || serial).trim(),
    itemType: String(item.itemType || item.kind || (item.serviceName ? "service" : "product")).trim(),
    price: toMoney(item.price || item.cost || item.value || item.amount, 0),
    status: "in_stock",
    source: "catalog-sync",
    syncedFrom: String(item.source || "External ERP feed").trim(),
    attributes: item.attributes && typeof item.attributes === "object" ? item.attributes : {},
    assignedAt: item.assignedAt || item.createdAt || isoNow(),
    createdAt: item.createdAt || isoNow(),
  };
};

const makePhone = makeCatalogItem;

module.exports = async (req, res) => {
  try {
    const origin = String(req.headers.origin || "*");
    const allowedOrigin = String(process.env.ASSET_SYNC_ALLOWED_ORIGIN || origin || "*").trim();
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Asset-Sync-Token,X-Tenant-ID");

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }

    if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });

    const body = await readJsonBody(req);
    rateLimit(req, { scope: "assets-sync", limit: 120, windowMs: 60_000 });
    assertIdempotent(req, body);
    const token = String(req.headers["x-asset-sync-token"] || body?.token || "").trim();
    const tenantId = getTenantId(req, body);
    const session = getBearerSession(req);
    const tokenAllowed = !!process.env.ASSET_SYNC_TOKEN && token === process.env.ASSET_SYNC_TOKEN;
    const sessionAllowed = !!session?.tenantId && String(session.tenantId) === String(tenantId);
    if (!tokenAllowed && !sessionAllowed) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized" });
    }

    const store = getStore();
    const scopedErpKey = scopeTenantKey(tenantId, ERP_KEY);
    const erpRaw = await store.get(scopedErpKey);
    const erp = erpRaw && typeof erpRaw === "object" && Array.isArray(erpRaw.branches) ? erpRaw : makeDefaultErp();
    erp.branches = Array.isArray(erp.branches) ? erp.branches : [];

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const item of getAssignments(body)) {
      if (!item || typeof item !== "object") {
        skipped += 1;
        errors.push("Invalid assignment item.");
        continue;
      }
      const branch = normalizeBranch(findBranch(erp, item));
      if (!branch) {
        skipped += 1;
      errors.push(`Branch not found for ${safeString(item.branchId || item.branchName || "assignment", 120)}.`);
        continue;
      }
      const serial = itemSerial(item);
      const name = String(item.name || item.model || item.serviceName || item.assetName || item.phoneModel || "").trim();
      if (!serial || !name) {
        skipped += 1;
        errors.push(`Missing item reference or name for ${branch.name || branch.id}.`);
        continue;
      }
      if (hasSerial(erp, serial)) {
        skipped += 1;
        continue;
      }

      const catalogItem = makeCatalogItem(item, serial);
      branch.items.push(catalogItem);
      branch.phones.push(catalogItem);
      branch.updatedAt = isoNow();
      rebuildInventoryFromItems(branch);
      imported += 1;
    }

    erp.lastUpdated = isoNow();
    await store.set(scopedErpKey, erp);
    await appendEvent(store, tenantId, "assets.synced", { imported, skipped });
    return sendJson(res, 200, { ok: true, imported, skipped, errors, key: scopedErpKey, tenantId, updatedAt: erp.lastUpdated });
  } catch (err) {
    const status = Number(err?.statusCode || 500) || 500;
    return sendJson(res, status, { ok: false, error: status >= 500 ? "Server error" : String(err?.message || "Invalid request") });
  }
};
