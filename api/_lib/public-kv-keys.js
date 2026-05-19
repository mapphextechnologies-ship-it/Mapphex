const PUBLIC_KV_KEYS = new Set([
  "enterprise_agent_accounts_v1",
  "enterprise_branch_accounts_v1",
  "enterprise_teamleader_accounts_v1",
  "enterprise_departments_accounts_v1",
  "enterprise_director_account_v1",
  "enterprise_erp_v1",
]);

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
