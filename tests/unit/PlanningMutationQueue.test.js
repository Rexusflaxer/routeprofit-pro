import { describe, expect, it, vi } from "vitest";
import {
  createPlanningMutationQueue,
  getPlanningMutationQueue,
  planningPersonnelDayResourceKey,
  planningPersonnelDayResourceKeys,
  planningMutationQueueInternals,
  settlePlanningDropEnqueues,
} from "@/components/planning/planningMutationQueue";
import {
  buildPlanningPublicationSnapshot,
  readPlanningRangeSnapshot,
} from "@/components/planning/planningEffectivePlan";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function rangeQueryClient(rowsForFamily) {
  return {
    getQueriesData({ queryKey }) {
      return rowsForFamily(queryKey[0]);
    },
  };
}

describe("planning mutation queue", () => {
  it("fencet iedere geraakte kalenderdag van een nachtdienst", () => {
    expect(planningPersonnelDayResourceKeys("person-1", "2026-08-24", "2026-08-25")).toEqual([
      "personnel-day:person-1:2026-08-24",
      "personnel-day:person-1:2026-08-25",
    ]);
  });

  it("start onafhankelijke opdrachten parallel en houdt dezelfde medewerker/dag FIFO", async () => {
    const queue = createPlanningMutationQueue({ maxParallel: 4 });
    const first = deferred();
    const second = deferred();
    const independent = deferred();
    const started = [];
    const personnelDay = planningPersonnelDayResourceKey("person-1", "2026-08-24");

    const firstPromise = queue.enqueue({
      id: "first",
      resourceKeys: [personnelDay, "occurrence:a"],
      execute: () => { started.push("first"); return first.promise; },
    });
    const secondPromise = queue.enqueue({
      id: "second",
      resourceKeys: [personnelDay, "occurrence:b"],
      execute: () => { started.push("second"); return second.promise; },
    });
    const independentPromise = queue.enqueue({
      id: "independent",
      resourceKeys: [planningPersonnelDayResourceKey("person-2", "2026-08-24"), "occurrence:c"],
      execute: () => { started.push("independent"); return independent.promise; },
    });

    await flushMicrotasks();
    expect(started).toEqual(["first", "independent"]);
    expect(queue.getSnapshot()).toMatchObject({ pendingCount: 3, queuedCount: 1, runningCount: 2 });

    first.resolve("saved-first");
    await firstPromise;
    await flushMicrotasks();
    expect(started).toEqual(["first", "independent", "second"]);

    second.resolve("saved-second");
    independent.resolve("saved-independent");
    await Promise.all([secondPromise, independentPromise, queue.drain()]);
    expect(queue.getSnapshot()).toMatchObject({ pendingCount: 0, isIdle: true });
  });

  it("houdt twee FIFO-opdrachten op hun vastgelegde periode na een zichtbare periodewissel", async () => {
    const rangeA = { periodStart: "2026-08-10", periodEnd: "2026-09-06" };
    const rangeB = { periodStart: "2026-09-07", periodEnd: "2026-10-04" };
    let revisionA = 4;
    let visibleRange = rangeA;
    const queryClient = rangeQueryClient(family => {
      if (family !== "planning-task-occurrences") return [];
      return [
        [[family, rangeA.periodStart, rangeA.periodEnd], [{ id: "occurrence-a", revision: revisionA }]],
        [[family, rangeB.periodStart, rangeB.periodEnd], [{ id: "occurrence-b", revision: 9 }]],
      ];
    });
    const queue = createPlanningMutationQueue();
    const firstServer = deferred();
    const seen = [];

    const first = queue.enqueue({
      id: "range-a-first",
      resourceKeys: ["occurrence:occurrence-a"],
      execute: () => {
        seen.push(readPlanningRangeSnapshot(queryClient, rangeA).occurrences[0].revision);
        return firstServer.promise;
      },
      onSuccess: () => { revisionA = 5; },
    });
    const second = queue.enqueue({
      id: "range-a-second",
      resourceKeys: ["occurrence:occurrence-a"],
      execute: () => {
        seen.push(readPlanningRangeSnapshot(queryClient, rangeA).occurrences[0].revision);
        return "saved-second";
      },
    });

    visibleRange = rangeB;
    expect(readPlanningRangeSnapshot(queryClient, visibleRange).occurrences[0].id).toBe("occurrence-b");
    firstServer.resolve("saved-first");
    await expect(first).resolves.toBe("saved-first");
    await expect(second).resolves.toBe("saved-second");
    expect(seen).toEqual([4, 5]);
  });

  it("reconcilet succes vóór cleanup en start daarna pas de volgende conflicterende opdracht", async () => {
    const queue = createPlanningMutationQueue();
    const first = deferred();
    const order = [];
    const shared = planningPersonnelDayResourceKey("person-1", "2026-08-24");

    const firstPromise = queue.enqueue({
      id: "first",
      resourceKeys: [shared],
      execute: () => first.promise,
      onSuccess: () => order.push("cache-reconciled"),
      onSettled: () => order.push("optimistic-removed"),
    });
    const secondPromise = queue.enqueue({
      id: "second",
      resourceKeys: [shared],
      execute: () => { order.push("second-started"); return "second-result"; },
    });

    first.resolve("first-result");
    await Promise.all([firstPromise, secondPromise]);
    await queue.drain();
    expect(order).toEqual(["cache-reconciled", "optimistic-removed", "second-started"]);
  });

  it("rolt alleen de mislukte intent terug en laat een volgende queued opdracht doorgaan", async () => {
    const queue = createPlanningMutationQueue();
    const failure = new Error("netwerkfout");
    const events = [];
    const shared = planningPersonnelDayResourceKey("person-1", "2026-08-24");

    const failedPromise = queue.enqueue({
      id: "failed",
      resourceKeys: [shared, "occurrence:a"],
      execute: () => Promise.reject(failure),
      onError: error => events.push(`rollback:${error.message}`),
    });
    const succeedingPromise = queue.enqueue({
      id: "succeeds",
      resourceKeys: [shared, "occurrence:b"],
      execute: () => { events.push("next-started"); return "saved"; },
      onSuccess: () => events.push("next-reconciled"),
    });

    await expect(failedPromise).rejects.toBe(failure);
    await expect(succeedingPromise).resolves.toBe("saved");
    await queue.drain();
    expect(events).toEqual(["rollback:netwerkfout", "next-started", "next-reconciled"]);
  });

  it("publiceert snapshots zonder mutabele resource-arrays naar subscribers", async () => {
    const queue = createPlanningMutationQueue();
    const snapshots = [];
    const unsubscribe = queue.subscribe(snapshot => snapshots.push(snapshot));
    const execute = vi.fn().mockResolvedValue("ok");

    await queue.enqueue({ id: "one", resourceKeys: ["occurrence:one"], execute });
    await queue.drain();
    unsubscribe();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(snapshots.some(snapshot => snapshot.pendingCount === 1)).toBe(true);
    expect(snapshots.at(-1)).toMatchObject({ pendingCount: 0, isIdle: true });
    expect(Object.isFrozen(snapshots.at(-1))).toBe(true);
  });

  it("behandelt een reconcile-callbackfout als UI-recovery en niet als mislukte servermutatie", async () => {
    const queue = createPlanningMutationQueue();
    const recovery = deferred();
    const events = [];
    const onError = vi.fn();
    const shared = planningPersonnelDayResourceKey("person-1", "2026-08-24");
    const first = queue.enqueue({
      id: "server-success",
      resourceKeys: [shared],
      execute: () => { events.push("server-success"); return { id: "saved" }; },
      onSuccess: () => { events.push("reconcile-failed"); throw new Error("cache callback"); },
      onError,
      onCallbackError: async context => {
        events.push(`recovery-start:${context.phase}:${context.serverSucceeded}`);
        await recovery.promise;
        events.push("recovery-finished");
      },
      onSettled: () => events.push("optimistic-cleanup"),
    });
    const second = queue.enqueue({
      id: "next",
      resourceKeys: [shared],
      execute: () => { events.push("next-started"); return "next"; },
    });

    await vi.waitFor(() => {
      expect(events).toEqual([
        "server-success",
        "reconcile-failed",
        "recovery-start:onSuccess:true",
      ]);
    });
    expect(queue.getSnapshot()).toMatchObject({ pendingCount: 2, runningCount: 1, queuedCount: 1 });
    recovery.resolve();
    await expect(first).resolves.toEqual({ id: "saved" });
    await expect(second).resolves.toBe("next");
    expect(onError).not.toHaveBeenCalled();
    expect(events).toEqual([
      "server-success",
      "reconcile-failed",
      "recovery-start:onSuccess:true",
      "recovery-finished",
      "optimistic-cleanup",
      "next-started",
    ]);
  });

  it("houdt outbox en beforeunload actief na unsubscribe totdat de modulequeue leeg is", async () => {
    const listeners = new Map();
    const target = {
      addEventListener: vi.fn((name, handler) => listeners.set(name, handler)),
      removeEventListener: vi.fn((name, handler) => {
        if (listeners.get(name) === handler) listeners.delete(name);
      }),
    };
    const queue = createPlanningMutationQueue({ beforeUnloadTarget: target });
    const pending = deferred();
    const firstSubscriber = vi.fn();
    const unsubscribe = queue.subscribe(firstSubscriber);
    const operation = queue.enqueue({
      id: "durable-intent",
      resourceKeys: ["occurrence:one"],
      intent: { key: "durable-intent", shifts: [{ id: "pending-shift" }] },
      execute: () => pending.promise,
    });
    unsubscribe();

    const remountedSubscriber = vi.fn();
    queue.subscribe(remountedSubscriber);
    expect(remountedSubscriber).toHaveBeenLastCalledWith(expect.objectContaining({
      pendingCount: 1,
      intents: [expect.objectContaining({ key: "durable-intent" })],
      resourceKeys: ["occurrence:one"],
    }));
    expect(target.addEventListener).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    const event = { preventDefault: vi.fn(), returnValue: null };
    listeners.get("beforeunload")(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.returnValue).toBe("");

    pending.resolve("saved");
    await operation;
    await queue.drain();
    expect(target.removeEventListener).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    expect(queue.getSnapshot()).toMatchObject({ pendingCount: 0, intents: [], resourceKeys: [] });
  });

  it("laat een setTimeout-drop eerst enqueueën en bevestigt conceptsave pas na de drain", async () => {
    const queue = createPlanningMutationQueue();
    const server = deferred();
    const events = [];
    let dropOperation = null;
    globalThis.setTimeout(() => {
      events.push("drop-enqueued");
      dropOperation = queue.enqueue({
        id: "same-frame-drop",
        resourceKeys: ["occurrence:same-frame"],
        execute: () => {
          events.push("drop-started");
          return server.promise;
        },
        onSuccess: () => events.push("drop-saved"),
      });
    }, 0);

    const save = (async () => {
      await settlePlanningDropEnqueues();
      events.push("save-draining");
      await queue.drain();
      events.push("concept-saved");
    })();
    await vi.waitFor(() => expect(events).toEqual(["drop-enqueued", "drop-started", "save-draining"]));
    expect(events).not.toContain("concept-saved");
    server.resolve("stored");
    await save;
    await dropOperation;
    expect(events).toEqual([
      "drop-enqueued",
      "drop-started",
      "save-draining",
      "drop-saved",
      "concept-saved",
    ]);
  });

  it("bouwt publiceren na drain met server-id en nieuwste revisie uit de periodecache", async () => {
    const range = { periodStart: "2026-08-10", periodEnd: "2026-09-06" };
    const queue = createPlanningMutationQueue();
    const server = deferred();
    let cachedShifts = [];
    const queryClient = rangeQueryClient(family => (
      family === "planning-shifts"
        ? [[[family, range.periodStart, range.periodEnd], cachedShifts]]
        : []
    ));
    const operation = queue.enqueue({
      id: "create-server-shift",
      resourceKeys: ["occurrence:publication"],
      intent: { shifts: [{ id: "pending-shift-local", _optimistic_pending: true }] },
      execute: () => server.promise,
      onSuccess: result => { cachedShifts = [result.shift]; },
    });
    const publication = (async () => {
      await queue.drain();
      return buildPlanningPublicationSnapshot({
        snapshot: readPlanningRangeSnapshot(queryClient, range),
        ...range,
      });
    })();

    server.resolve({
      shift: {
        id: "shift-server-42",
        revision: 12,
        status: "draft",
        service_date: "2026-08-24",
        start_time: "06:00",
        end_time: "12:00",
      },
    });
    await operation;
    await expect(publication).resolves.toMatchObject({
      shiftIds: ["shift-server-42"],
      expectedShiftRevisions: { "shift-server-42": 12 },
    });
  });

  it("gebruikt binnen de app steeds dezelfde modulequeue", () => {
    planningMutationQueueInternals.resetSharedQueueForTests();
    const first = getPlanningMutationQueue();
    const second = getPlanningMutationQueue();
    expect(second).toBe(first);
    planningMutationQueueInternals.resetSharedQueueForTests();
  });
});
