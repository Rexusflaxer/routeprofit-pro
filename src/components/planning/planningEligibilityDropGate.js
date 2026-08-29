function text(value) {
  return value == null ? "" : String(value).trim();
}

function warningKey(warning) {
  return [
    text(warning?.code),
    text(warning?.severity),
    text(warning?.detail || warning?.message || warning?.title),
  ].join("|");
}

/**
 * @param {{ result?: any, preview?: any, now?: number, timeoutMs?: number }} [options]
 */
export function createPendingPlanningEligibilityDrop(options = {}) {
  const {
    result,
    preview,
    now = Date.now(),
    timeoutMs = 15_000,
  } = options;
  const candidateKey = text(preview?.eligibilityCandidate?.candidate_key);
  if (!result || !preview?.drop || !candidateKey) return null;
  const requestedAt = Number(now) || Date.now();
  return Object.freeze({
    id: `${candidateKey}:${requestedAt}`,
    result,
    drop: preview.drop,
    requestedAt,
    expiresAt: requestedAt + Math.max(1_000, Number(timeoutMs) || 15_000),
    initialWarningKeys: Object.freeze((preview.verdict?.warnings || []).map(warningKey)),
    attemptsByCandidate: Object.freeze({}),
  });
}

/** @param {any} pending */
export function recordPendingPlanningEligibilityAttempt(pending, candidateKey) {
  if (!pending) return null;
  const key = text(candidateKey);
  if (!key) return pending;
  return Object.freeze({
    ...pending,
    attemptsByCandidate: Object.freeze({
      ...(pending.attemptsByCandidate || {}),
      [key]: Number(pending.attemptsByCandidate?.[key] || 0) + 1,
    }),
  });
}

/**
 * Returns the remaining cooldown before another dependency refresh may start.
 * The first failed wave waits two seconds, then 4, 8, 16 and at most 30
 * seconds. Keeping this rule outside React makes every caller share the same
 * rate-limit protection instead of only the background expiry timer.
 *
 * @param {{ failureCount?: number, lastAttemptAt?: number, now?: number, baseDelayMs?: number, maxDelayMs?: number }} [options]
 */
export function planningEligibilityDependencyRetryDelay(options = {}) {
  const {
    failureCount = 0,
    lastAttemptAt = 0,
    now = Date.now(),
    baseDelayMs = 2_000,
    maxDelayMs = 30_000,
  } = options;
  const failures = Math.max(0, Math.floor(Number(failureCount) || 0));
  const base = Math.max(1, Number(baseDelayMs) || 2_000);
  const maximum = Math.max(base, Number(maxDelayMs) || 30_000);
  const delay = failures > 0
    ? Math.min(maximum, base * (2 ** Math.min(4, failures - 1)))
    : base;
  return Math.max(0, Number(lastAttemptAt || 0) + delay - Number(now || Date.now()));
}

/**
 * @param {{ pending?: any, preview?: any, queueIdle?: boolean, now?: number, maximumAttempts?: number }} [options]
 */
export function resolvePendingPlanningEligibilityDrop(options = {}) {
  const {
    pending,
    preview,
    queueIdle,
    now = Date.now(),
    maximumAttempts = 2,
  } = options;
  if (!pending) return Object.freeze({ status: "none", newWarnings: Object.freeze([]) });
  const currentTime = Number(now) || Date.now();
  if (currentTime >= Number(pending.expiresAt || 0)) {
    return Object.freeze({ status: "expired", newWarnings: Object.freeze([]) });
  }
  if (!preview?.drop || !preview?.eligibilityCandidate) {
    return Object.freeze({ status: "target_missing", newWarnings: Object.freeze([]) });
  }
  if (!queueIdle) {
    return Object.freeze({ status: "wait_queue", newWarnings: Object.freeze([]) });
  }

  const verdict = preview.verdict || {};
  if (verdict.status === "ready") {
    const known = new Set(pending.initialWarningKeys || []);
    const newWarnings = (verdict.warnings || []).filter(warning => !known.has(warningKey(warning)));
    return Object.freeze({
      status: newWarnings.length ? "warnings_changed" : "ready",
      newWarnings: Object.freeze(newWarnings),
    });
  }

  const candidateKey = text(preview.eligibilityCandidate.candidate_key);
  const basisToken = text(verdict.basisToken || verdict.basis_token || "unknown-basis");
  const attemptKey = `${basisToken}\u0000${candidateKey}`;
  const attemptCount = Number(pending.attemptsByCandidate?.[attemptKey] || 0);
  if (attemptCount >= Math.max(1, Number(maximumAttempts) || 1)) {
    return Object.freeze({
      status: verdict.status === "unavailable" ? "unavailable" : "wait_result",
      newWarnings: Object.freeze([]),
    });
  }
  return Object.freeze({
    status: "request",
    candidateKey,
    attemptKey,
    delayMs: verdict.status === "unavailable" && attemptCount > 0 ? 750 : 0,
    newWarnings: Object.freeze([]),
  });
}

export const planningEligibilityDropGateInternals = Object.freeze({ warningKey });
