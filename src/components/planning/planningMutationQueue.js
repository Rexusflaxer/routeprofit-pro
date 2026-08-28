function normalizeResourceKeys(resourceKeys) {
  return [...new Set((resourceKeys || []).filter(Boolean).map(String))].sort();
}

function normalizeCommandIds(commandIds) {
  return [...new Set((commandIds || []).filter(Boolean).map(String))];
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

function planningDependencyError(entryId, dependencyId, dependencyState) {
  const error = /** @type {any} */ (new Error(
    "Deze lokale planningwijziging is vervallen omdat een eerdere wijziging niet kon worden opgeslagen.",
  ));
  error.name = "PlanningDependencyError";
  error.code = "PLANNING_DEPENDENCY_FAILED";
  error.commandId = String(entryId);
  error.dependencyId = String(dependencyId);
  error.dependencyState = dependencyState?.status || "failed";
  error.cause = dependencyState?.error || null;
  error.silent = true;
  return error;
}

function commandPromiseHandle(promise, commandId, requestedCommandId, coalesced = false) {
  const handle = promise.then(value => value);
  Object.defineProperties(handle, {
    commandId: { configurable: false, enumerable: false, value: String(commandId) },
    requestedCommandId: { configurable: false, enumerable: false, value: String(requestedCommandId) },
    coalesced: { configurable: false, enumerable: false, value: Boolean(coalesced) },
  });
  return handle;
}

function planningDrainReport(commandIds, terminalStateById, throughSequence = 0) {
  const states = commandIds
    .map(commandId => terminalStateById(commandId))
    .filter(Boolean);
  const succeeded = states.filter(state => state.status === "succeeded");
  const failures = states.filter(state => state.status === "failed");
  const cancellations = states.filter(state => state.status === "cancelled");
  return Object.freeze({
    ok: failures.length === 0 && cancellations.length === 0,
    throughSequence,
    commandIds: Object.freeze([...commandIds]),
    completedCount: states.length,
    succeeded: Object.freeze(succeeded),
    failures: Object.freeze(failures),
    cancellations: Object.freeze(cancellations),
  });
}

function planningDrainError(report) {
  const failedCount = report?.failures?.length || 0;
  const cancelledCount = report?.cancellations?.length || 0;
  const parts = [
    failedCount ? `${failedCount} wijziging${failedCount === 1 ? "" : "en"} mislukt` : null,
    cancelledCount ? `${cancelledCount} vervolgactie${cancelledCount === 1 ? "" : "s"} vervallen` : null,
  ].filter(Boolean);
  const error = /** @type {any} */ (new Error(
    `De planning kan nog niet worden afgerond: ${parts.join(" en ") || "de lokale wachtrij is niet volledig verwerkt"}. Controleer de gemelde wijzigingen en probeer opnieuw.`,
  ));
  error.name = "PlanningMutationDrainError";
  error.code = "PLANNING_MUTATION_BATCH_FAILED";
  error.report = report;
  return error;
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
 * Single-flight gate for low-priority eligibility batches.
 *
 * A planning mutation may start optimistically while one background request is
 * already on the wire. The write waits for that exact request to settle; once
 * the queue is non-idle the background worker can stop before launching a
 * second batch. Background failures never block the authoritative write.
 */
export function createPlanningBackgroundRequestGate() {
  let currentBatch = null;

  const clear = batch => {
    if (currentBatch === batch) currentBatch = null;
  };

  return Object.freeze({
    hasCurrentBackgroundBatch() {
      return Boolean(currentBatch);
    },
    trackBackgroundBatch(promise) {
      const batch = Promise.resolve(promise);
      currentBatch = batch;
      void batch.then(
        () => clear(batch),
        () => clear(batch),
      );
      return batch;
    },
    async waitForCurrentBackgroundBatch() {
      const batch = currentBatch;
      if (!batch) return;
      try {
        await batch;
      } catch {
        // Eligibility warming is best-effort and must not reject the write.
      }
    },
  });
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
  const commandAliases = new Map();
  const terminalStates = new Map();
  const terminalOrder = [];
  const beforeUnloadProtection = createBeforeUnloadProtection(beforeUnloadTarget);
  const parallelLimit = Math.max(1, Number(maxParallel) || 1);
  const terminalLimit = 500;
  let activeCount = 0;
  let nextSequence = 1;
  let acknowledgedSequence = 0;
  let disposed = false;
  /** @type {Readonly<{ pendingCount: number, queuedCount: number, runningCount: number, isIdle: boolean, intents: readonly any[], resourceKeys: readonly string[], terminalStates: readonly any[] }>} */
  let snapshot = Object.freeze({
    pendingCount: 0,
    queuedCount: 0,
    runningCount: 0,
    isIdle: true,
    intents: Object.freeze([]),
    resourceKeys: Object.freeze([]),
    terminalStates: Object.freeze([]),
  });

  const canonicalCommandId = value => {
    let commandId = String(value || "");
    const visited = new Set();
    while (commandAliases.has(commandId) && !visited.has(commandId)) {
      visited.add(commandId);
      commandId = String(commandAliases.get(commandId));
    }
    return commandId;
  };

  const activeEntryById = value => {
    const commandId = canonicalCommandId(value);
    return entries.find(entry => entry.id === commandId || entry.aliases.has(String(value))) || null;
  };

  const terminalStateById = value => terminalStates.get(canonicalCommandId(value)) || null;

  const trimTerminalStates = () => {
    if (terminalOrder.length <= terminalLimit) return;
    const required = new Set([
      ...entries.flatMap(entry => entry.dependsOn.map(canonicalCommandId)),
      ...[...drainWaiters].flatMap(waiter => waiter.commandIds),
      ...terminalOrder.filter(commandId => {
        const state = terminalStates.get(commandId);
        return state
          && state.sequence > acknowledgedSequence
          && (state.status === "failed" || state.status === "cancelled");
      }),
    ]);
    for (let index = 0; index < terminalOrder.length && terminalOrder.length > terminalLimit;) {
      const commandId = terminalOrder[index];
      if (required.has(commandId)) {
        index += 1;
        continue;
      }
      terminalOrder.splice(index, 1);
      terminalStates.delete(commandId);
      for (const [alias, canonical] of commandAliases) {
        if (canonical === commandId) commandAliases.delete(alias);
      }
    }
  };

  const rememberTerminalState = (entry, status, { result = null, error = null, dependencyId = null } = {}) => {
    const state = Object.freeze({
      id: entry.id,
      aliases: Object.freeze([...entry.aliases]),
      status,
      // Keep the final local identity map with the terminal result. A gesture
      // may start on an optimistic record and only enqueue after its parent
      // ACK has already left the active queue; that child can still rebase to
      // the authoritative ids/revisions without another network round-trip.
      intent: entry.intent,
      originalIntent: entry.originalIntent,
      result,
      error,
      dependencyId,
      sequence: entry.sequence,
      finishedAt: new Date().toISOString(),
    });
    terminalStates.set(entry.id, state);
    if (!terminalOrder.includes(entry.id)) terminalOrder.push(entry.id);
    entry.aliases.forEach(alias => commandAliases.set(String(alias), entry.id));
    trimTerminalStates();
    return state;
  };

  const settleDrainWaiters = () => {
    drainWaiters.forEach(waiter => {
      if (!waiter.commandIds.every(commandId => terminalStateById(commandId))) return;
      drainWaiters.delete(waiter);
      waiter.resolve(planningDrainReport(waiter.commandIds, terminalStateById, waiter.throughSequence));
    });
  };

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
      terminalStates: Object.freeze(terminalOrder
        .slice(-50)
        .map(commandId => terminalStates.get(commandId))
        .filter(Boolean)),
    });
    beforeUnloadProtection.sync(!snapshot.isIdle);
    listeners.forEach(listener => listener(snapshot));
    settleDrainWaiters();
  };

  const hasEarlierResourceConflict = (candidate, candidateIndex) => entries.some((entry, index) => (
    index < candidateIndex
    && entry.status === "queued"
    && resourcesOverlap(entry.resourceKeys, candidate.resourceKeys)
  ));

  const canStart = (entry, index) => (
    entry.status === "queued"
    && entry.dependsOn.every(dependencyId => terminalStateById(dependencyId)?.status === "succeeded")
    && !entry.resourceKeys.some(key => activeResourceKeys.has(key))
    && !hasEarlierResourceConflict(entry, index)
  );

  const removeEntry = entry => {
    const index = entries.indexOf(entry);
    if (index >= 0) entries.splice(index, 1);
  };

  const cancelDependencyDescendants = (dependencyId, dependencyState) => {
    const failedCanonicalId = canonicalCommandId(dependencyId);
    const cancelled = [];
    let found = true;
    while (found) {
      found = false;
      entries.slice().forEach(entry => {
        if (entry.status !== "queued") return;
        const failedDependencyId = entry.dependsOn.find(candidate => {
          const canonical = canonicalCommandId(candidate);
          if (canonical === failedCanonicalId) return true;
          const state = terminalStateById(canonical);
          return state?.status === "failed" || state?.status === "cancelled";
        });
        if (!failedDependencyId) return;
        found = true;
        entry.status = "cancelled";
        removeEntry(entry);
        const sourceState = terminalStateById(failedDependencyId) || dependencyState;
        const error = planningDependencyError(entry.id, failedDependencyId, sourceState);
        const terminal = rememberTerminalState(entry, "cancelled", {
          error,
          dependencyId: canonicalCommandId(failedDependencyId),
        });
        cancelled.push({ entry, error, terminal });
      });
    }
    cancelled.forEach(({ entry, error }) => entry.reject(error));
    return cancelled.length;
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
          result = await entry.execute(Object.freeze({
            id: entry.id,
            intent: entry.intent,
            resourceKeys: Object.freeze([...entry.resourceKeys]),
            dependsOn: Object.freeze([...entry.dependsOn]),
            getDependencyState: dependencyId => terminalStateById(dependencyId),
          }));
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
          const terminal = rememberTerminalState(
            entry,
            executeFailure ? "failed" : "succeeded",
            { result, error: executeFailure },
          );
          if (executeFailure) cancelDependencyDescendants(entry.id, terminal);
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
      dependsOn = [],
      coalesceKey = null,
      coalesceIntent = null,
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
      const requestedId = String(id);
      if (activeEntryById(requestedId) || terminalStateById(requestedId)) {
        return Promise.reject(new Error(`Planningintent ${id} staat al in de wachtrij.`));
      }

      const normalizedDependencies = normalizeCommandIds(dependsOn).map(canonicalCommandId);
      if (normalizedDependencies.includes(requestedId)) {
        return Promise.reject(new Error(`Planningintent ${id} kan niet van zichzelf afhangen.`));
      }
      const unknownDependency = normalizedDependencies.find(dependencyId => (
        !activeEntryById(dependencyId) && !terminalStateById(dependencyId)
      ));
      if (unknownDependency) {
        return Promise.reject(new Error(`Afhankelijke planningintent ${unknownDependency} is niet bekend.`));
      }

      const normalizedCoalesceKey = coalesceKey == null ? null : String(coalesceKey);
      const coalescedEntry = normalizedCoalesceKey
        ? entries.find(entry => entry.status === "queued" && entry.coalesceKey === normalizedCoalesceKey)
        : null;
      if (coalescedEntry) {
        coalescedEntry.aliases.add(requestedId);
        commandAliases.set(requestedId, coalescedEntry.id);
        coalescedEntry.resourceKeys = normalizeResourceKeys([
          ...coalescedEntry.resourceKeys,
          ...resourceKeys,
        ]);
        coalescedEntry.dependsOn = normalizeCommandIds([
          ...coalescedEntry.dependsOn,
          ...normalizedDependencies,
        ]).map(canonicalCommandId).filter(dependencyId => dependencyId !== coalescedEntry.id);
        coalescedEntry.intent = typeof coalesceIntent === "function"
          ? coalesceIntent(coalescedEntry.intent, intent)
          : intent;
        coalescedEntry.execute = execute;
        coalescedEntry.onSuccess = onSuccess;
        coalescedEntry.onError = onError;
        coalescedEntry.onCallbackError = onCallbackError;
        coalescedEntry.onSettled = onSettled;
        updateSnapshot();
        pump();
        return commandPromiseHandle(coalescedEntry.promise, coalescedEntry.id, requestedId, true);
      }

      /** @type {any} */
      let entry;
      const promise = new Promise((resolve, reject) => {
        entry = {
          id: requestedId,
          aliases: new Set([requestedId]),
          resourceKeys: normalizeResourceKeys(resourceKeys),
          dependsOn: normalizedDependencies,
          coalesceKey: normalizedCoalesceKey,
          originalIntent: intent,
          intent,
          execute,
          onSuccess,
          onError,
          onCallbackError,
          onSettled,
          resolve,
          reject,
          status: "queued",
          sequence: nextSequence,
          promise: null,
        };
        nextSequence += 1;
        entries.push(entry);
      });
      entry.promise = promise;
      updateSnapshot();
      pump();
      return commandPromiseHandle(promise, entry.id, requestedId, false);
    },

    createDrainCheckpoint() {
      return Object.freeze({
        afterSequence: acknowledgedSequence,
        pendingCommandIds: Object.freeze(entries
          .filter(entry => entry.status === "queued" || entry.status === "running")
          .map(entry => entry.id)),
      });
    },

    drain({ checkpoint = null, rejectOnFailure = false } = {}) {
      const throughSequence = nextSequence - 1;
      const commandIds = [...new Set([
        ...(checkpoint?.pendingCommandIds || []),
        ...entries
          .filter(entry => (
            checkpoint
              ? entry.sequence > Number(checkpoint.afterSequence || 0) && entry.sequence <= throughSequence
              : entry.status === "queued" || entry.status === "running"
          ))
          .map(entry => entry.id),
        ...(checkpoint ? terminalOrder
          .map(commandId => terminalStates.get(commandId))
          .filter(state => (
            state
            && state.sequence > Number(checkpoint.afterSequence || 0)
            && state.sequence <= throughSequence
          ))
          .map(state => state.id) : []),
      ].map(canonicalCommandId))];
      const pending = commandIds.some(commandId => !terminalStateById(commandId));
      const reportPromise = pending
        ? new Promise(resolve => drainWaiters.add({ commandIds, throughSequence, resolve }))
        : Promise.resolve(planningDrainReport(commandIds, terminalStateById, throughSequence));
      return rejectOnFailure
        ? reportPromise.then(report => {
            if (!report.ok) throw planningDrainError(report);
            return report;
          })
        : reportPromise;
    },

    acknowledgeDrain(report) {
      const throughSequence = Number(report?.throughSequence || 0);
      if (!Number.isInteger(throughSequence) || throughSequence < 0) return false;
      acknowledgedSequence = Math.max(acknowledgedSequence, throughSequence);
      trimTerminalStates();
      return true;
    },

    getSnapshot() {
      return snapshot;
    },

    getTerminalState(id) {
      return terminalStateById(id);
    },

    has(id) {
      return Boolean(activeEntryById(id));
    },

    updateIntent(id, updater) {
      const entry = activeEntryById(id);
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
  normalizeCommandIds,
  normalizeResourceKeys,
  planningDependencyError,
  resetSharedQueueForTests() {
    sharedPlanningMutationQueue?.dispose();
    sharedPlanningMutationQueue = null;
  },
  resourcesOverlap,
};
