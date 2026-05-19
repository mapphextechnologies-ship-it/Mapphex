const EVENT_KEY = "enterprise_events_v1";

const eventFingerprint = (type, payload = {}) =>
  [
    type,
    payload.workflowId,
    payload.approvalId,
    payload.transactionId,
    payload.messageId,
    payload.userId,
    Array.isArray(payload.portalIds) ? payload.portalIds.join(",") : "",
  ]
    .filter(Boolean)
    .join(":");

const appendEvent = async (store, tenantId, type, payload = {}) => {
  const key = `tenant:${tenantId || "default-company"}:${EVENT_KEY}`;
  const current = (await store.get(key)) || [];
  const events = Array.isArray(current) ? current : [];
  const fp = eventFingerprint(type, payload);
  const recentDuplicate = fp && events.slice(-20).some((event) => event.fingerprint === fp || eventFingerprint(event.type, event.payload || {}) === fp);
  if (recentDuplicate) return events[events.length - 1];
  const seq = Number(events[events.length - 1]?.seq || 0) + 1;
  const event = {
    seq,
    id: `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    fingerprint: fp || undefined,
    at: new Date().toISOString(),
    tenantId,
    type,
    payload,
  };
  await store.set(key, [...events, event].slice(-1000));
  return event;
};

const listEvents = async (store, tenantId, after = 0) => {
  const key = `tenant:${tenantId || "default-company"}:${EVENT_KEY}`;
  const current = (await store.get(key)) || [];
  const events = Array.isArray(current) ? current : [];
  const seq = Number(after || 0) || 0;
  return events.filter((event) => Number(event.seq || 0) > seq).slice(-200);
};

const clearEvents = async (store, tenantId) => {
  const key = `tenant:${tenantId || "default-company"}:${EVENT_KEY}`;
  await store.set(key, []);
};

module.exports = {
  EVENT_KEY,
  appendEvent,
  clearEvents,
  listEvents,
};
