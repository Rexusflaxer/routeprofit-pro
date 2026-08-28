import { describe, expect, it, vi } from "vitest";
import {
  createPlanningBackgroundRequestGate,
  createPlanningMutationQueue,
  getPlanningMutationQueue,
  planningPersonnelDayResourceKey,
  planningPersonnelDayResourceKeys,
  planningMutationQueueInternals,
  settlePlanningDropEnqueues,
} from "@/components/planning/planningMutationQueue";
import {
  buildDependentPlanningResizeIntent,
  buildPlanningPublicationSnapshot,
  readPlanningRangeSnapshot,
  rebaseDependentPlanningIntent,
  withPlanningOptimisticIntentIdentity,
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

  it("laat een lokale compose-write alleen de reeds lopende achtergrondbatch uitdrainen", async () => {
    const queue = createPlanningMutationQueue();
    const requestGate = createPlanningBackgroundRequestGate();
    const firstBackgroundBatch = deferred();
    const invokeBackgroundBatch = vi.fn(() => firstBackgroundBatch.promise);
    const invokePlanningWrite = vi.fn(() => ({ shift: { id: "shift-server-single-flight" } }));

    const backgroundWorker = (async () => {
      if (!queue.getSnapshot().isIdle || requestGate.hasCurrentBackgroundBatch()) return;
      await requestGate.trackBackgroundBatch(invokeBackgroundBatch("first"));
      if (!queue.getSnapshot().isIdle || requestGate.hasCurrentBackgroundBatch()) return;
      await requestGate.trackBackgroundBatch(invokeBackgroundBatch("second"));
    })();
    await flushMicrotasks();

    const operation = queue.enqueue({
      id: "compose-after-background-prefetch",
      resourceKeys: ["occurrence:single-flight"],
      intent: {
        key: "compose-after-background-prefetch",
        shifts: [{ id: "pending-shift-single-flight", _optimistic_pending: true }],
      },
      execute: async () => {
        await requestGate.waitForCurrentBackgroundBatch();
        return invokePlanningWrite();
      },
    });
    await flushMicrotasks();

    expect(queue.getSnapshot()).toMatchObject({ pendingCount: 1, runningCount: 1, isIdle: false });
    expect(queue.getSnapshot().intents).toContainEqual(expect.objectContaining({
      key: "compose-after-background-prefetch",
      shifts: [expect.objectContaining({ id: "pending-shift-single-flight" })],
    }));
    expect(invokeBackgroundBatch).toHaveBeenCalledTimes(1);
    expect(invokePlanningWrite).not.toHaveBeenCalled();

    firstBackgroundBatch.resolve({ results: [] });
    await expect(operation).resolves.toEqual({ shift: { id: "shift-server-single-flight" } });
    await backgroundWorker;

    expect(invokePlanningWrite).toHaveBeenCalledTimes(1);
    expect(invokeBackgroundBatch).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot().isIdle).toBe(true);
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

  it("rapporteert failures en afhankelijke cancellations uit precies de gedraineerde batch", async () => {
    const queue = createPlanningMutationQueue();
    const checkpoint = queue.createDrainCheckpoint();
    const failure = new Error("opslaan geweigerd");
    const parent = queue.enqueue({
      id: "batch-parent-fails",
      resourceKeys: ["occurrence:batch"],
      execute: () => Promise.reject(failure),
    });
    const child = queue.enqueue({
      id: "batch-child-cancelled",
      dependsOn: [parent.commandId],
      resourceKeys: ["occurrence:batch"],
      execute: vi.fn(),
    });
    const independent = queue.enqueue({
      id: "batch-independent-succeeds",
      resourceKeys: ["occurrence:other"],
      execute: () => "opgeslagen",
    });
    const reportPromise = queue.drain({ checkpoint });

    await Promise.allSettled([parent, child, independent]);
    await expect(reportPromise).resolves.toMatchObject({
      ok: false,
      completedCount: 3,
      succeeded: [{ id: "batch-independent-succeeds", status: "succeeded" }],
      failures: [{ id: "batch-parent-fails", status: "failed", error: failure }],
      cancellations: [{
        id: "batch-child-cancelled",
        status: "cancelled",
        dependencyId: "batch-parent-fails",
      }],
    });
    await expect(queue.drain({ checkpoint, rejectOnFailure: true })).rejects.toMatchObject({
      name: "PlanningMutationDrainError",
      code: "PLANNING_MUTATION_BATCH_FAILED",
      report: expect.objectContaining({
        ok: false,
        failures: [expect.objectContaining({ id: "batch-parent-fails" })],
        cancellations: [expect.objectContaining({ id: "batch-child-cancelled" })],
      }),
    });
  });

  it("onthoudt een snelle dropfout tussen commit-checkpoint en macrotask-drain", async () => {
    const queue = createPlanningMutationQueue();
    const checkpoint = queue.createDrainCheckpoint();
    let operation = null;
    globalThis.setTimeout(() => {
      operation = queue.enqueue({
        id: "same-frame-fast-failure",
        resourceKeys: ["occurrence:same-frame-fast-failure"],
        execute: () => Promise.reject(new Error("direct geweigerd")),
      });
      void operation.catch(() => undefined);
    }, 0);

    await settlePlanningDropEnqueues();
    await vi.waitFor(() => expect(queue.getSnapshot().isIdle).toBe(true));
    await expect(queue.drain({ checkpoint, rejectOnFailure: true })).rejects.toMatchObject({
      code: "PLANNING_MUTATION_BATCH_FAILED",
      report: expect.objectContaining({
        failures: [expect.objectContaining({ id: "same-frame-fast-failure" })],
      }),
    });
    await expect(operation).rejects.toThrow("direct geweigerd");
  });

  it("blokkeert een commit op een eerder afgehandelde maar nog niet bevestigde fout", async () => {
    const queue = createPlanningMutationQueue();
    const operation = queue.enqueue({
      id: "failed-before-save-click",
      resourceKeys: ["occurrence:failed-before-save-click"],
      execute: () => Promise.reject(new Error("server weigerde de wijziging")),
    });
    await expect(operation).rejects.toThrow("server weigerde de wijziging");
    expect(queue.getSnapshot().isIdle).toBe(true);

    const checkpoint = queue.createDrainCheckpoint();
    let report;
    try {
      await queue.drain({ checkpoint, rejectOnFailure: true });
    } catch (error) {
      report = error.report;
    }
    expect(report).toMatchObject({
      ok: false,
      failures: [expect.objectContaining({ id: "failed-before-save-click" })],
    });
    expect(queue.acknowledgeDrain(report)).toBe(true);
    await expect(queue.drain({
      checkpoint: queue.createDrainCheckpoint(),
      rejectOnFailure: true,
    })).resolves.toMatchObject({ ok: true, failures: [] });
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

  it("start een afhankelijke actie pas na parent-reconcile met de actueel gerebased intent", async () => {
    const queue = createPlanningMutationQueue();
    const parentServer = deferred();
    const executions = [];
    const parent = queue.enqueue({
      id: "compose-temp-shift",
      resourceKeys: ["occurrence:one"],
      intent: { shifts: [{ id: "pending-shift" }] },
      execute: () => parentServer.promise,
      onSuccess: result => {
        queue.updateIntent("resize-temp-shift", current => ({
          ...current,
          shift_id: result.shift.id,
          shifts: current.shifts.map(item => ({ ...item, id: result.shift.id })),
        }));
      },
    });
    const child = queue.enqueue({
      id: "resize-temp-shift",
      dependsOn: [parent.commandId],
      resourceKeys: ["occurrence:one", "shift:pending-shift"],
      intent: { shift_id: "pending-shift", shifts: [{ id: "pending-shift", end_time: "15:30" }] },
      execute: context => {
        executions.push(context);
        return { resized: context.intent.shift_id };
      },
    });

    await flushMicrotasks();
    expect(executions).toEqual([]);
    expect(queue.getSnapshot()).toMatchObject({ pendingCount: 2, runningCount: 1, queuedCount: 1 });
    parentServer.resolve({ shift: { id: "shift-server", revision: 2 } });

    await expect(parent).resolves.toMatchObject({ shift: { id: "shift-server" } });
    await expect(child).resolves.toEqual({ resized: "shift-server" });
    expect(executions).toHaveLength(1);
    expect(executions[0]).toMatchObject({
      id: "resize-temp-shift",
      dependsOn: ["compose-temp-shift"],
      intent: {
        shift_id: "shift-server",
        shifts: [{ id: "shift-server", end_time: "15:30" }],
      },
    });
    expect(executions[0].getDependencyState("compose-temp-shift")).toMatchObject({ status: "succeeded" });
  });

  it("rebased een pas na de parent-ACK losgelaten resize vanuit de terminale intent", async () => {
    const queue = createPlanningMutationQueue();
    const parentServer = deferred();
    const parentExecute = vi.fn(() => parentServer.promise);
    const childExecute = vi.fn(({ intent }) => ({
      shiftId: intent.shift_id,
      segmentId: intent.segment_id,
      shiftRevision: intent.shifts[0].revision,
      segmentRevision: intent.segments[0].revision,
      endTime: intent.segments[0].end_time,
    }));
    const parentIntent = withPlanningOptimisticIntentIdentity({
      key: "compose-before-pointer-up",
      shifts: [{
        id: "pending-shift-before-pointer-up",
        source_type: "task",
        source_id: "definition-one",
        service_date: "2026-08-24",
        start_time: "06:30",
        end_time: "18:00",
        required_count: 1,
        status: "draft",
      }],
      segments: [{
        id: "pending-segment-before-pointer-up",
        shift_id: "pending-shift-before-pointer-up",
        task_occurrence_id: "occurrence-one",
        start_date: "2026-08-24",
        end_date: "2026-08-24",
        start_time: "06:30",
        end_time: "18:00",
        status: "draft",
      }],
      assignments: [{
        id: "pending-assignment-before-pointer-up",
        planning_shift_id: "pending-shift-before-pointer-up",
        shift_id: "pending-shift-before-pointer-up",
        personnel_id: "employee-one",
        slot_index: 0,
        status: "draft",
      }],
      occurrences: [],
    });
    const parent = queue.enqueue({
      id: parentIntent.key,
      resourceKeys: ["occurrence:occurrence-one"],
      intent: parentIntent,
      execute: parentExecute,
      onSuccess: result => {
        queue.updateIntents(intent => rebaseDependentPlanningIntent(intent, parentIntent, result));
      },
    });
    const composeResult = {
      shift: {
        ...parentIntent.shifts[0],
        id: "shift-server-before-pointer-up",
        revision: 7,
        _planning_ref: undefined,
      },
      segments: [{
        ...parentIntent.segments[0],
        id: "segment-server-before-pointer-up",
        shift_id: "shift-server-before-pointer-up",
        revision: 8,
        _planning_ref: undefined,
      }],
      assignment: {
        ...parentIntent.assignments[0],
        id: "assignment-server-before-pointer-up",
        planning_shift_id: "shift-server-before-pointer-up",
        shift_id: "shift-server-before-pointer-up",
        revision: 9,
        _planning_ref: undefined,
      },
    };

    parentServer.resolve(composeResult);
    await expect(parent).resolves.toBe(composeResult);
    expect(queue.has(parentIntent.key)).toBe(false);
    const terminalParent = queue.getTerminalState(parentIntent.key);
    expect(terminalParent).toMatchObject({
      status: "succeeded",
      originalIntent: {
        key: parentIntent.key,
        shifts: [{ id: "pending-shift-before-pointer-up" }],
        segments: [{ id: "pending-segment-before-pointer-up" }],
      },
      intent: {
        key: parentIntent.key,
        shifts: [{ id: "shift-server-before-pointer-up", revision: 7 }],
        segments: [{ id: "segment-server-before-pointer-up", revision: 8 }],
      },
      result: composeResult,
    });

    const staleGestureIntent = {
      ...buildDependentPlanningResizeIntent({
        key: "resize-released-after-parent-ack",
        shift: parentIntent.shifts[0],
        segment: parentIntent.segments[0],
        assignments: parentIntent.assignments,
        nextEndTime: "15:30",
      }),
      shift_id: parentIntent.shifts[0].id,
      segment_id: parentIntent.segments[0].id,
      task_occurrence_id: "occurrence-one",
    };
    const rebasedFromAlreadyCommittedIdentity = rebaseDependentPlanningIntent(
      staleGestureIntent,
      terminalParent.intent,
      terminalParent.result,
    );
    expect(rebasedFromAlreadyCommittedIdentity).toMatchObject({
      shift_id: "pending-shift-before-pointer-up",
      segment_id: "pending-segment-before-pointer-up",
    });
    const rebasedGestureIntent = rebaseDependentPlanningIntent(
      staleGestureIntent,
      terminalParent.originalIntent,
      terminalParent.result,
    );
    const child = queue.enqueue({
      id: rebasedGestureIntent.key,
      resourceKeys: [`shift:${rebasedGestureIntent.shift_id}`],
      intent: rebasedGestureIntent,
      execute: childExecute,
    });

    await expect(child).resolves.toEqual({
      shiftId: "shift-server-before-pointer-up",
      segmentId: "segment-server-before-pointer-up",
      shiftRevision: 7,
      segmentRevision: 8,
      endTime: "15:30",
    });
    expect(parentExecute).toHaveBeenCalledTimes(1);
    expect(childExecute).toHaveBeenCalledTimes(1);
  });

  it("annuleert afhankelijke children transitief na parent-fout zonder execute- of toastcallbacks", async () => {
    const queue = createPlanningMutationQueue();
    const failure = new Error("compose geweigerd");
    const childExecute = vi.fn();
    const childError = vi.fn();
    const childSettled = vi.fn();
    const grandchildExecute = vi.fn();
    const parent = queue.enqueue({
      id: "compose-fails",
      resourceKeys: ["occurrence:one"],
      execute: () => Promise.reject(failure),
    });
    const child = queue.enqueue({
      id: "dependent-resize",
      dependsOn: [parent.commandId],
      resourceKeys: ["occurrence:one"],
      execute: childExecute,
      onError: childError,
      onSettled: childSettled,
    });
    const grandchild = queue.enqueue({
      id: "dependent-unassign",
      dependsOn: [child.commandId],
      resourceKeys: ["occurrence:one"],
      execute: grandchildExecute,
    });

    const [parentState, childState, grandchildState] = await Promise.allSettled([parent, child, grandchild]);
    await queue.drain();

    expect(parentState).toMatchObject({ status: "rejected", reason: failure });
    expect(childState).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({
        name: "PlanningDependencyError",
        code: "PLANNING_DEPENDENCY_FAILED",
        silent: true,
        dependencyId: "compose-fails",
      }),
    });
    expect(grandchildState).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({
        name: "PlanningDependencyError",
        code: "PLANNING_DEPENDENCY_FAILED",
        silent: true,
      }),
    });
    expect(childExecute).not.toHaveBeenCalled();
    expect(childError).not.toHaveBeenCalled();
    expect(childSettled).not.toHaveBeenCalled();
    expect(grandchildExecute).not.toHaveBeenCalled();
    expect(queue.getTerminalState("compose-fails")).toMatchObject({ status: "failed" });
    expect(queue.getTerminalState("dependent-resize")).toMatchObject({
      status: "cancelled",
      dependencyId: "compose-fails",
    });
    expect(queue.getTerminalState("dependent-unassign")).toMatchObject({ status: "cancelled" });
    expect(queue.getSnapshot()).toMatchObject({ pendingCount: 0, isIdle: true });
  });

  it("coalescet alleen queued resizes latest-wins en deelt één canonieke completion", async () => {
    const queue = createPlanningMutationQueue();
    const composeServer = deferred();
    const firstResizeExecute = vi.fn();
    const latestResizeExecute = vi.fn(context => ({ savedEnd: context.intent.end_time }));
    const firstSuccess = vi.fn();
    const latestSuccess = vi.fn();
    const compose = queue.enqueue({
      id: "compose",
      resourceKeys: ["occurrence:one"],
      execute: () => composeServer.promise,
    });
    const firstResize = queue.enqueue({
      id: "resize-1",
      dependsOn: [compose.commandId],
      coalesceKey: "resize:pending-shift:bottom",
      resourceKeys: ["occurrence:one", "shift:pending-shift"],
      intent: { end_time: "16:00" },
      execute: firstResizeExecute,
      onSuccess: firstSuccess,
    });
    const latestResize = queue.enqueue({
      id: "resize-2",
      dependsOn: [compose.commandId],
      coalesceKey: "resize:pending-shift:bottom",
      resourceKeys: ["segment:pending-segment"],
      intent: { end_time: "15:30" },
      execute: latestResizeExecute,
      onSuccess: latestSuccess,
    });

    expect(firstResize.commandId).toBe("resize-1");
    expect(firstResize.coalesced).toBe(false);
    expect(latestResize.commandId).toBe("resize-1");
    expect(latestResize.requestedCommandId).toBe("resize-2");
    expect(latestResize.coalesced).toBe(true);
    expect(queue.has("resize-2")).toBe(true);
    expect(queue.getSnapshot()).toMatchObject({ pendingCount: 2, runningCount: 1, queuedCount: 1 });
    expect(queue.getSnapshot().intents).toContainEqual({ end_time: "15:30" });
    expect(queue.getSnapshot().resourceKeys).toEqual([
      "occurrence:one",
      "segment:pending-segment",
      "shift:pending-shift",
    ]);

    composeServer.resolve("composed");
    await expect(compose).resolves.toBe("composed");
    await expect(firstResize).resolves.toEqual({ savedEnd: "15:30" });
    await expect(latestResize).resolves.toEqual({ savedEnd: "15:30" });
    expect(firstResizeExecute).not.toHaveBeenCalled();
    expect(latestResizeExecute).toHaveBeenCalledTimes(1);
    expect(firstSuccess).not.toHaveBeenCalled();
    expect(latestSuccess).toHaveBeenCalledWith({ savedEnd: "15:30" });
    expect(queue.getTerminalState("resize-2")).toMatchObject({
      id: "resize-1",
      status: "succeeded",
      aliases: ["resize-1", "resize-2"],
    });
  });

  it("houdt drain en beforeunload actief totdat ook het laatste dependency-child klaar is", async () => {
    const listeners = new Map();
    const target = {
      addEventListener: vi.fn((name, handler) => listeners.set(name, handler)),
      removeEventListener: vi.fn((name, handler) => {
        if (listeners.get(name) === handler) listeners.delete(name);
      }),
    };
    const queue = createPlanningMutationQueue({ beforeUnloadTarget: target });
    const parentServer = deferred();
    const childServer = deferred();
    const parent = queue.enqueue({
      id: "parent-save",
      execute: () => parentServer.promise,
    });
    const child = queue.enqueue({
      id: "child-save",
      dependsOn: [parent.commandId],
      execute: () => childServer.promise,
    });
    let drained = false;
    const drain = queue.drain().then(() => { drained = true; });

    expect(listeners.has("beforeunload")).toBe(true);
    parentServer.resolve("parent-ok");
    await parent;
    await flushMicrotasks();
    expect(queue.getSnapshot()).toMatchObject({ pendingCount: 1, runningCount: 1 });
    expect(listeners.has("beforeunload")).toBe(true);
    expect(drained).toBe(false);

    childServer.resolve("child-ok");
    await child;
    await drain;
    expect(drained).toBe(true);
    expect(listeners.has("beforeunload")).toBe(false);
  });

  it("gebruikt binnen de app steeds dezelfde modulequeue", () => {
    planningMutationQueueInternals.resetSharedQueueForTests();
    const first = getPlanningMutationQueue();
    const second = getPlanningMutationQueue();
    expect(second).toBe(first);
    planningMutationQueueInternals.resetSharedQueueForTests();
  });
});
