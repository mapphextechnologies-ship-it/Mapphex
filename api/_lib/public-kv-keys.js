const PUBLIC_KV_KEYS = new Set([]);

const unscopedTenantKey = (key) => {
  const value = String(key || "");
  const match = value.match(/^tenant:[^:]+:(.+)$/);
  return match ? match[1] : value;
};

const isPublicKvKey = (key) => PUBLIC_KV_KEYS.has(unscopedTenantKey(key));

const allPublicKvKeys = (keys) => Array.isArray(keys) && keys.length > 0 && keys.every(isPublicKvKey);

module.exports = {
  PUBLIC_KV_KEYS,
  allPublicKvKeys,
  isPublicKvKey,
  unscopedTenantKey,
};
