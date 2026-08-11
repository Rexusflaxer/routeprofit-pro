function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(item => (item === undefined ? null : canonicalize(item)));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function planningMutationFingerprint(payload) {
  const {
    idempotency_key: _idempotencyKey,
    correlation_id: _correlationId,
    ...requestPayload
  } = payload || {};
  return JSON.stringify(canonicalize(requestPayload));
}

export function createPlanningMutationKey(prefix = "planning") {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `${prefix}:${suffix}`;
}

export function createPlanningMutationIntentRegistry({ keyFactory = createPlanningMutationKey } = {}) {
  const intents = new Map();

  return {
    prepare(scope, payload, { prefix = "planning" } = {}) {
      const fingerprint = planningMutationFingerprint(payload);
      const current = intents.get(scope);
      const intent = current?.fingerprint === fingerprint
        ? current
        : { fingerprint, key: keyFactory(prefix) };
      intents.set(scope, intent);
      return { ...payload, idempotency_key: intent.key };
    },

    clear(scope, expectedKey = null) {
      const current = intents.get(scope);
      if (!current) return false;
      if (expectedKey && current.key !== expectedKey) return false;
      intents.delete(scope);
      return true;
    },

    clearAll() {
      intents.clear();
    },

    peek(scope) {
      const current = intents.get(scope);
      return current ? { ...current } : null;
    },
  };
}
