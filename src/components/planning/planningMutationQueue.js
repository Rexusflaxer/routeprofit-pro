function normalizeResourceKeys(resourceKeys) {
  return [...new Set((resourceKeys || []).filter(Boolean).map(String))].sort();
}

function resourcesOverlap(left, right) {
  if (!left.length || !right.length) return false;
  const rightKeys = new Set(right);
  return left.some(key => rightKeys.has(key));
}

function safeCallback(callback, value) {
  if (typeof callback !== "function") return Promise.resolve();
  return Promise.resolve().then(() => callback(value));
}

function createBeforeUnloadProtection(target) {
  let attached = false;
  const handler = event => {
    event?.preventDefault?.();
    if (event) event.returnValue = "";
    return "";
  };
  return {
    sync(active) {
      if (!target?.addEventListener || !target?.removeEventListener) return;
      if (active && !attached) {
        target.addEventListener("beforeunload", handler);
        attached = true;
      } else if (!active && attached) {
        target.removeEventListener("beforeunload", handler);
        attached = false;
      }
    },
    dispose() {
      if (attached) target?.removeEventListener?.("beforeunload", handler);
      attached = false;
    },
  };
}

/**
 * Small React-independent command scheduler for planning mutations.
 *
 * The UI applies an optimistic intent before enqueueing it. Commands that
 * touch the same logical resource remain FIFO, while unrelated commands can
 * persist in parallel. Callback completion is part of the command: cache
 * reconciliation and optimistic cleanup therefore finish before the next
 * conflicting command starts.
 */
export function createPlanningMutationQueue({ maxParallel = 4, beforeUnloadTarget = null } = {}) {
  const listeners = new Set();
  const entries = [];
  const activeResourceKeys = new Set();
  const drainWaiters = new Set();
  const beforeUnloadProtection = createBeforeUnloadProtection(beforeUnloadTarget);
  const parallelLimit = Math.max(1, Number(maxParallel) || 1);
  let activeCount = 0;
  let disposed = false;
  /** @type {Readonly<{ pendingCount: number, queuedCount: number, runningCount: number, isIdle: boolean, intents: readonly any[], resourceKeys: readonly string[] }>} */
  let snapshot = Object.freeze({
    pendingCount: 0,
    queuedCount: 0,
    runningCount: 0,
    isIdle: true,
    intents: Object.freeze([]),
    resourceKeys: Object.freeze([]),
  });

  const updateSnapshot = () => {
    const queuedCount = entries.filter(entry => entry.status === "queued").length;
    const runningCount = entries.filter(entry => entry.status === "running").length;
    snapshot = Object.freeze({
      pendingCount: queuedCount + runningCount,
      queuedCount,
      runningCount,
      isIdle: queuedCount + runningCount === 0,
      intents: Object.freeze(entries
        .filter(entry => entry.status === "queued" || entry.status === "running")
        .map(entry => entry.intent)
        .filter(Boolean)),
      resourceKeys: Object.freeze([...new Set(entries
        .filter(entry => entry.status === "queued" || entry.status === "running")
        .flatMap(entry => entry.resourceKeys))].sort()),
    });
    beforeUnloadProtection.sync(!snapshot.isIdle);
    listeners.forEach(listener => listener(snapshot));
    if (snapshot.isIdle) {
      drainWaiters.forEach(resolve => resolve());
      drainWaiters.clear();
    }
  };

  const hasEarlierResourceConflict = (candidate, candidateIndex) => entries.some((entry, index) => (
    index < candidateIndex
    && entry.status === "queued"
    && resourcesOverlap(entry.resourceKeys, candidate.resourceKeys)
  ));

  const canStart = (entry, index) => (
    entry.status === "queued"
    && !entry.resourceKeys.some(key => activeResourceKeys.has(key))
    && !hasEarlierResourceConflict(entry, index)
  );

  const removeEntry = entry => {
    const index = entries.indexOf(entry);
    if (index >= 0) entries.splice(index, 1);
  };

  const pump = () => {
    if (disposed) return;
    while (activeCount < parallelLimit) {
      const nextIndex = entries.findIndex(canStart);
      if (nextIndex < 0) break;
      const entry = entries[nextIndex];
      entry.status = "running";
      activeCount += 1;
      entry.resourceKeys.forEach(key => activeResourceKeys.add(key));
      updateSnapshot();

      void (async () => {
        let result;
        let executeFailure = null;
        const reportCallbackFailure = async (error, phase) => {
          try {
            await safeCallback(entry.onCallbackError, {
              error,
              phase,
              result,
              serverSucceeded: executeFailure == null,
              executeError: executeFailure,
            });
          } catch {
            // Callback recovery is best effort. A successful server write must
            // never be reclassified as a failed mutation because UI recovery failed.
          }
        };
        try {
          result = await entry.execute();
        } catch (error) {
          executeFailure = error;
        }

        if (executeFailure) {
          try {
            await safeCallback(entry.onError, executeFailure);
          } catch (callbackError) {
            await reportCallbackFailure(callbackError, "onError");
          }
        } else {
          try {
            await safeCallback(entry.onSuccess, result);
          } catch (callbackError) {
            await reportCallbackFailure(callbackError, "onSuccess");
          }
        }

        try {
          await safeCallback(entry.onSettled, {
            result,
            error: executeFailure,
            serverSucceeded: executeFailure == null,
          });
        } catch (callbackError) {
          await reportCallbackFailure(callbackError, "onSettled");
        } finally {
          entry.resourceKeys.forEach(key => activeResourceKeys.delete(key));
          activeCount = Math.max(0, activeCount - 1);
          removeEntry(entry);
          updateSnapshot();
          pump();
        }

        if (executeFailure) entry.reject(executeFailure);
        else entry.resolve(result);
      })();
    }
  };

  return {
    enqueue(/** @type {any} */ {
      id,
      resourceKeys = [],
      intent = null,
      execute,
      onSuccess,
      onError,
      onCallbackError,
      onSettled,
    } = {}) {
      if (disposed) return Promise.reject(new Error("De planningwachtrij is gesloten."));
      if (!id) return Promise.reject(new TypeError("Een planningintent-id is verplicht."));
      if (typeof execute !== "function") return Promise.reject(new TypeError("Een execute-functie is verplicht."));
      if (entries.some(entry => entry.id === String(id))) {
        return Promise.reject(new Error(`Planningintent ${id} staat al in de wachtrij.`));
      }

      const promise = new Promise((resolve, reject) => {
        entries.push({
          id: String(id),
          resourceKeys: normalizeResourceKeys(resourceKeys),
          intent,
          execute,
          onSuccess,
          onError,
          onCallbackError,
          onSettled,
          resolve,
          reject,
          status: "queued",
        });
      });
      updateSnapshot();
      pump();
      return promise;
    },

    drain() {
      if (snapshot.isIdle) return Promise.resolve();
      return new Promise(resolve => drainWaiters.add(resolve));
    },

    getSnapshot() {
      return snapshot;
    },

    updateIntent(id, updater) {
      const entry = entries.find(item => (
        item.id === String(id) && (item.status === "queued" || item.status === "running")
      ));
      if (!entry || typeof updater !== "function") return false;
      const nextIntent = updater(entry.intent, entry);
      if (nextIntent === entry.intent) return false;
      entry.intent = nextIntent;
      updateSnapshot();
      return true;
    },

    updateIntents(updater) {
      if (typeof updater !== "function") return 0;
      let changed = 0;
      entries.forEach(entry => {
        if (entry.status !== "queued" && entry.status !== "running") return;
        const nextIntent = updater(entry.intent, entry);
        if (nextIntent === entry.intent) return;
        entry.intent = nextIntent;
        changed += 1;
      });
      if (changed > 0) updateSnapshot();
      return changed;
    },

    subscribe(listener) {
      if (typeof listener !== "function") return () => undefined;
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },

    dispose() {
      disposed = true;
      beforeUnloadProtection.dispose();
      listeners.clear();
    },
  };
}

let sharedPlanningMutationQueue = null;

/** Lets the drag engine's setTimeout(0) drop callback enqueue before a commit drains the outbox. */
export function settlePlanningDropEnqueues(schedule = callback => globalThis.setTimeout(callback, 0)) {
  return new Promise(resolve => schedule(resolve));
}

/**
 * One app-level queue survives Planning route unmount/remount. Its global
 * beforeunload fence makes a full reload with outstanding writes explicit.
 */
export function getPlanningMutationQueue() {
  if (!sharedPlanningMutationQueue) {
    const target = typeof window !== "undefined" ? window : null;
    sharedPlanningMutationQueue = createPlanningMutationQueue({
      maxParallel: 4,
      beforeUnloadTarget: target,
    });
  }
  return sharedPlanningMutationQueue;
}

export function planningPersonnelDayResourceKey(personnelId, serviceDate) {
  if (!personnelId || !serviceDate) return null;
  return `personnel-day:${personnelId}:${serviceDate}`;
}

export function planningPersonnelDayResourceKeys(personnelId, startDate, endDate = startDate) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!personnelId || !datePattern.test(String(startDate || "")) || !datePattern.test(String(endDate || ""))) {
    return [];
  }
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (
    !Number.isFinite(start.getTime())
    || !Number.isFinite(end.getTime())
    || start.toISOString().slice(0, 10) !== startDate
    || end.toISOString().slice(0, 10) !== endDate
    || end < start
  ) return [];
  const keys = [];
  for (let cursor = start, index = 0; cursor <= end && index < 370; index += 1) {
    const date = cursor.toISOString().slice(0, 10);
    keys.push(planningPersonnelDayResourceKey(personnelId, date));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return keys;
}

export const planningMutationQueueInternals = {
  createBeforeUnloadProtection,
  normalizeResourceKeys,
  resetSharedQueueForTests() {
    sharedPlanningMutationQueue?.dispose();
    sharedPlanningMutationQueue = null;
  },
  resourcesOverlap,
};
