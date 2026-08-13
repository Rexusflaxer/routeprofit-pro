const DEFAULT_REFRESH_DELAY_MS = 1_200;

function mergeRefreshOptions(current, incoming) {
  const next = incoming && typeof incoming === "object" ? incoming : {};
  return {
    ...(current || {}),
    ...next,
    includePublications: Boolean(current?.includePublications || next.includePublications),
  };
}

/**
 * Coalesces bursty planning consistency refreshes without coupling the helper
 * to React or QueryClient. Authoritative mutation results can update the cache
 * immediately; this scheduler performs one delayed consistency pass afterwards.
 * The first request owns the timer, so continuous planning can never postpone
 * the server consistency pass indefinitely.
 */
export function createPlanningRefreshScheduler({
  refresh,
  delayMs = DEFAULT_REFRESH_DELAY_MS,
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = timer => globalThis.clearTimeout(timer),
  onError = () => undefined,
} = {}) {
  if (typeof refresh !== "function") {
    throw new TypeError("Een refresh-functie is verplicht voor de planningverversing.");
  }

  const safeDelayMs = Math.max(0, Number(delayMs) || 0);
  let pendingOptions = null;
  let scheduledTimer = null;
  let inFlight = null;
  let disposed = false;

  const clearScheduledTimer = () => {
    if (scheduledTimer === null) return;
    clearTimer(scheduledTimer);
    scheduledTimer = null;
  };

  const executePending = () => {
    clearScheduledTimer();
    if (disposed || !pendingOptions) return inFlight || Promise.resolve(null);
    if (inFlight) return inFlight.then(() => executePending());

    const options = pendingOptions;
    pendingOptions = null;
    const task = Promise.resolve()
      .then(() => refresh(options))
      .catch(error => {
        onError(error);
        return null;
      })
      .finally(() => {
        if (inFlight === task) inFlight = null;
      });
    inFlight = task;
    return task;
  };

  return {
    schedule(options = {}) {
      if (disposed) return false;
      pendingOptions = mergeRefreshOptions(pendingOptions, options);
      if (scheduledTimer !== null) return true;
      scheduledTimer = setTimer(() => {
        scheduledTimer = null;
        void executePending();
      }, safeDelayMs);
      return true;
    },

    flush() {
      return executePending();
    },

    cancel() {
      clearScheduledTimer();
      pendingOptions = null;
    },

    dispose() {
      disposed = true;
      clearScheduledTimer();
      pendingOptions = null;
    },

    getState() {
      return {
        disposed,
        inFlight: Boolean(inFlight),
        scheduled: scheduledTimer !== null,
      };
    },
  };
}

export const planningRefreshSchedulerInternals = {
  DEFAULT_REFRESH_DELAY_MS,
  mergeRefreshOptions,
};
