const normalizeText = (value, max = 500) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);

const normalizeEmail = (value) => normalizeText(value, 180).toLowerCase();

const normalizeId = (value, max = 80) =>
  normalizeText(value, max)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const uniqueBy = (rows, keyFn) => {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = normalizeText(typeof keyFn === "function" ? keyFn(row) : row?.[keyFn], 240).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
};

const assertUnique = (rows, keyFn, message = "Duplicate record") => {
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = normalizeText(typeof keyFn === "function" ? keyFn(row) : row?.[keyFn], 240).toLowerCase();
    if (!key) continue;
    if (seen.has(key)) {
      const err = new Error(message);
      err.statusCode = 409;
      throw err;
    }
    seen.add(key);
  }
};

const mergeUniqueStrings = (...lists) =>
  Array.from(
    new Set(
      lists
        .flat()
        .map((value) => normalizeId(value))
        .filter(Boolean),
    ),
  );

const recordFingerprint = (values = []) =>
  (Array.isArray(values) ? values : [values])
    .map((value) => normalizeText(value, 180).toLowerCase())
    .join("|");

module.exports = {
  assertUnique,
  mergeUniqueStrings,
  normalizeEmail,
  normalizeId,
  normalizeText,
  recordFingerprint,
  uniqueBy,
};
