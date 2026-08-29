import { describe, expect, it, vi } from "vitest";
import {
  createPlanningBackgroundRequestGate,
  createPlanningMutationQueue,
  getPlanningMutationQueue,
  planningPersonnelDayResourceKey,
  planningPersonnelDayResourceKeys,
  planningPersonnelEligibilityResourceKeys,
  planningPersonnelShiftResourceKeys,
  planningPersonnelWeekResourceKey,
  planningMutationQueueInternals,
  settlePlanningDropEnqueues,
} from "@/components/planning/planningMutationQueue";
import {
  buildDependentPlanningResizeIntent,
  buildPlanningPublicationSnapshot,
  readPlanningRangeSnapshot,
  rebaseDependentPlanningIntent,
  resolvePlanningShiftTarget,
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

  it("fencet rustdagen en contractweek zonder verschillende medewerkers te blokkeren", () => {
    expect(planningPersonnelWeekResourceKey("person-1", "2026-08-30")).toBe(
      "personnel-week:person-1:2026-08-24",
    );
    expect(planningPersonnelWeekResourceKey("person-1", "2026-08-31")).toBe(
      "personnel-week:person-1:2026-08-31",
    );
    expect(planningPersonnelEligibilityResourceKeys("person-1", "2026-08-24", "2026-08-25")).toEqual([
      "personnel-day:person-1:2026-08-23",
      "personnel-day:person-1:2026-08-24",
      "personnel-day:person-1:2026-08-25",
      "personnel-day:person-1:2026-08-26",
      "personnel-week:person-1:2026-08-24",
    ]);
    expect(planningPersonnelEligibilityResourceKeys("person-2", "2026-08-24")).not.toContain(
      "personnel-week:person-1:2026-08-24",
    );
  });

  it("spiegelt expliciete einddatums inclusief 00:00 over een ISO-weekgrens", () => {
    expect(planningPersonnelShiftResourceKeys("person-midnight", [{
      service_date: "2026-08-30",
      end_date: "2026-08-31",
      start_time: "20:00",
      end_time: "00:00",
    }])).toEqual([
      "personnel-day:person-midnight:2026-08-29",
      "personnel-day:person-midnight:2026-08-30",
      "personnel-day:person-midnight:2026-08-31",
      "personnel-day:person-midnight:2026-09-01",
      "personnel-week:person-midnight:2026-08-24",
      "personnel-week:person-midnight:2026-08-31",
    ]);
  });

  it("neemt voor een tijdswijziging de unie van het oude en voorgestelde interval", () => {
    expect(planningPersonnelShiftResourceKeys("person-resize", [
      {
        service_date: "2026-08-24",
        end_date: "2026-08-24",
        start_time: "06:30",
        end_time: "18:00",
      },
      {
        service_date: "2026-08-24",
        end_date: "2026-08-25",
        start_time: "15:30",
        end_time: "00:00",
      },
    ])).toEqual([
      "personnel-day:person-resize:2026-08-23",
      "personnel-day:person-resize:2026-08-24",
      "personnel-day:person-resize:2026-08-25",
      "personnel-day:person-resize:2026-08-26",
      "personnel-week:person-resize:2026-08-24",
    ]);
  });

  it("voert snelle diensten op aangrenzende dagen en in dezelfde contractweek FIFO uit", async () => {
    const queue = createPlanningMutationQueue({ maxParallel: 2 });
    const first = deferred();
    const started = [];
    const firstOperation = queue.enqueue({
      id: "same-week-first",
      resourceKeys: planningPersonnelEligibilityResourceKeys("person-1", "2026-08-24"),
      execute: () => {
        started.push("first");
        return first.promise;
      },
    });
    const adjacentOperation = queue.enqueue({
      id: "same-week-adjacent",
      resourceKeys: planningPersonnelEligibilityResourceKeys("person-1", "2026-08-25"),
      execute: () => {
        started.push("adjacent");
        return "adjacent";
      },
    });
    const nonAdjacentOperation = queue.enqueue({
      id: "same-week-non-adjacent",
      resourceKeys: planningPersonnelEligibilityResourceKeys("person-1", "2026-08-28"),
      execute: () => {
        started.push("non-adjacent");
        return "non-adjacent";
      },
    });
    const otherPersonnelOperation = queue.enqueue({
      id: "other-personnel",
      resourceKeys: planningPersonnelEligibilityResourceKeys("person-2", "2026-08-25"),
      execute: () => {
        started.push("other-personnel");
        return "other-personnel";
      },
    });

    await flushMicrotasks();
    expect(started).toEqual(["first", "other-personnel"]);
    await otherPersonnelOperation;
    first.resolve("first");
    await firstOperation;
    await Promise.all([adjacentOperation, nonAdjacentOperation]);
    expect(started).toEqual(["first", "other-personnel", "adjacent", "non-adjacent"]);
    queue.dispose();
  });

  it("serialiseert assign-resize-assign voor dezelfde medewerker terwijl een andere medewerker parallel blijft", async () => {
    const queue = createPlanningMutationQueue({ maxParallel: 2 });
    const firstAssign = deferred();
    const resize = deferred();
    const otherPersonnel = deferred();
    const started = [];
    const first = queue.enqueue({
      id: "rapid-assign-one",
      resourceKeys: [
        "occurrence:task-a",
        ...planningPersonnelShiftResourceKeys("person-rapid", [{
          service_date: "2026-08-24",
          start_time: "06:30",
          end_time: "18:00",
        }]),
      ],
      execute: () => {
        started.push("assign-one");
        return firstAssign.promise;
      },
    });
    const resizeOperation = queue.enqueue({
      id: "rapid-resize-one",
      dependsOn: ["rapid-assign-one"],
      resourceKeys: [
        "shift:pending-a",
        "occurrence:task-a",
        ...planningPersonnelShiftResourceKeys("person-rapid", [
          { service_date: "2026-08-24", start_time: "06:30", end_time: "18:00" },
          { service_date: "2026-08-24", start_time: "06:30", end_time: "15:30" },
        ]),
      ],
      execute: () => {
        started.push("resize-one");
        return resize.promise;
      },
    });
    const second = queue.enqueue({
      id: "rapid-assign-two",
      resourceKeys: [
        "occurrence:task-b",
        ...planningPersonnelShiftResourceKeys("person-rapid", [{
          service_date: "2026-08-28",
          start_time: "08:00",
          end_time: "12:00",
        }]),
      ],
      intent: {
        key: "rapid-assign-two",
        assignments: [{ id: "pending-assignment-two", _optimistic_pending: true }],
      },
      execute: () => {
        started.push("assign-two");
        return "assign-two";
      },
    });
    const other = queue.enqueue({
      id: "rapid-other-personnel",
      resourceKeys: planningPersonnelShiftResourceKeys("person-other", [{
        service_date: "2026-08-24",
        start_time: "08:00",
        end_time: "12:00",
      }]),
      execute: () => {
        started.push("other-personnel");
        return otherPersonnel.promise;
      },
    });

    await flushMicrotasks();
    expect(started).toEqual(["assign-one", "other-personnel"]);
    expect(queue.getSnapshot().intents).toContainEqual(expect.objectContaining({
      key: "rapid-assign-two",
      assignments: [expect.objectContaining({ id: "pending-assignment-two" })],
    }));
    firstAssign.resolve("assign-one");
    await first;
    await flushMicrotasks();
    expect(started).toEqual(["assign-one", "other-personnel", "resize-one"]);
    otherPersonnel.resolve("other-personnel");
    await other;
    await flushMicrotasks();
    expect(started).not.toContain("assign-two");
    expect(queue.getSnapshot().intents).toContainEqual(expect.objectContaining({
      key: "rapid-assign-two",
    }));
    resize.resolve("resize-one");
    await resizeOperation;
    await expect(second).resolves.toBe("assign-two");
    expect(started).toEqual(["assign-one", "other-personnel", "resize-one", "assign-two"]);
    queue.dispose();
  });

  it("houdt ook assign-assign-resize voor dezelfde medewerker strikt FIFO", async () => {
    const queue = createPlanningMutationQueue({ maxParallel: 2 });
    const first = deferred();
    const second = deferred();
    const resize = deferred();
    const started = [];
    const personnelKeys = planningPersonnelShiftResourceKeys("person-reverse-order", [{
      service_date: "2026-08-24",
      start_time: "06:30",
      end_time: "18:00",
    }]);
    const firstOperation = queue.enqueue({
      id: "reverse-assign-one",
      resourceKeys: ["occurrence:reverse-a", ...personnelKeys],
      execute: () => { started.push("assign-one"); return first.promise; },
    });
    const secondOperation = queue.enqueue({
      id: "reverse-assign-two",
      resourceKeys: ["occurrence:reverse-b", ...personnelKeys],
      execute: () => { started.push("assign-two"); return second.promise; },
    });
    const resizeOperation = queue.enqueue({
      id: "reverse-resize-one",
      dependsOn: ["reverse-assign-one"],
      resourceKeys: ["shift:reverse-a", "occurrence:reverse-a", ...personnelKeys],
      execute: () => { started.push("resize-one"); return resize.promise; },
    });

    await flushMicrotasks();
    expect(started).toEqual(["assign-one"]);
    first.resolve("assign-one");
    await firstOperation;
    await flushMicrotasks();
    expect(started).toEqual(["assign-one", "assign-two"]);
    second.resolve("assign-two");
    await secondOperation;
    await flushMicrotasks();
    expect(started).toEqual(["assign-one", "assign-two", "resize-one"]);
    resize.resolve("resize-one");
    await resizeOperation;
    queue.dispose();
  });

  it("behoudt zowel tijdelijke als serverresource tijdens een intent-rebase", async () => {
    const queue = createPlanningMutationQueue({ maxParallel: 2 });
    const parent = deferred();
    const child = queue.enqueue({
      id: "resource-rebase-child",
      resourceKeys: ["shift:pending-shift", "occurrence:occurrence-1"],
      intent: {
        shift_id: "pending-shift",
        task_occurrence_id: "occurrence-1",
      },
      execute: () => parent.promise,
    });
    await flushMicrotasks();

    expect(queue.updateIntent("resource-rebase-child", intent => ({
      ...intent,
      shift_id: "server-shift",
    }))).toBe(true);
    expect(queue.getSnapshot().resourceKeys).toEqual([
      "occurrence:occurrence-1",
      "shift:pending-shift",
      "shift:server-shift",
    ]);

    parent.resolve("done");
    await child;
    queue.dispose();
  });

  it("rebased een handmatige move na de assign-ACK en houdt de vervolgactie FIFO", async () => {
    const queue = createPlanningMutationQueue({ maxParallel: 2 });
    const assignmentGate = deferred();
    const moveGate = deferred();
    const started = [];
    const moveWrite = vi.fn(request => {
      started.push("move");
      return moveGate.promise;
    });
    const unassignWrite = vi.fn(() => {
      started.push("unassign");
      return "unassigned";
    });
    const reassignWrite = vi.fn(() => {
      started.push("reassign");
      return "reassigned";
    });
    const sourceShift = {
      id: "pending-shift-manual-move",
      revision: 7,
      service_date: "2026-08-24",
      start_time: "06:30",
      end_time: "18:00",
      status: "draft",
    };
    const parentIntent = withPlanningOptimisticIntentIdentity({
      key: "assign-before-manual-move",
      shift_id: sourceShift.id,
      shifts: [sourceShift],
      assignments: [{
        id: "pending-assignment-manual-move",
        planning_shift_id: sourceShift.id,
        shift_id: sourceShift.id,
        personnel_id: "person-manual-move",
        status: "draft",
      }],
      segments: [],
      occurrences: [],
    }, { originIntentId: "assign-before-manual-move" });
    const sharedResources = [
      `shift:${sourceShift.id}`,
      ...planningPersonnelShiftResourceKeys("person-manual-move", [sourceShift]),
    ];
    let authoritativeShift = null;
    const assignmentOperation = queue.enqueue({
      id: "assign-before-manual-move",
      resourceKeys: sharedResources,
      intent: parentIntent,
      execute: () => {
        started.push("assign");
        return assignmentGate.promise;
      },
      onSuccess: result => {
        authoritativeShift = result.shift;
        queue.updateIntents(intent => rebaseDependentPlanningIntent(intent, parentIntent, result));
      },
    });
    const moveIntent = withPlanningOptimisticIntentIdentity({
      key: "manual-move-child",
      kind: "move_shift",
      shift_id: sourceShift.id,
      shifts: [{ ...sourceShift, end_time: "15:30" }],
      assignments: [],
      segments: [],
      occurrences: [],
    }, { originIntentId: "manual-move-child" });
    const moveOperation = queue.enqueue({
      id: "manual-move-child",
      dependsOn: ["assign-before-manual-move"],
      resourceKeys: sharedResources,
      intent: moveIntent,
      execute: ({ intent }) => {
        const currentShift = resolvePlanningShiftTarget(
          { shifts: [authoritativeShift] },
          { id: intent.shift_id },
        );
        const requestedShift = resolvePlanningShiftTarget(intent, { id: intent.shift_id });
        expect(currentShift.status).toBe("ready");
        expect(requestedShift.status).toBe("ready");
        return moveWrite({
          action: "move",
          shift_id: currentShift.record.id,
          end_date: requestedShift.record.end_date || null,
          start_time: requestedShift.record.start_time,
          end_time: requestedShift.record.end_time,
          expected_shift_revision: currentShift.record.revision,
        });
      },
    });
    const unassignAfterMove = queue.enqueue({
      id: "unassign-after-manual-move",
      dependsOn: [moveOperation.commandId],
      resourceKeys: sharedResources,
      execute: unassignWrite,
    });
    const reassignAfterMove = queue.enqueue({
      id: "reassign-after-manual-move",
      dependsOn: [moveOperation.commandId, unassignAfterMove.commandId],
      resourceKeys: sharedResources,
      execute: reassignWrite,
    });

    await flushMicrotasks();
    expect(started).toEqual(["assign"]);
    assignmentGate.resolve({
      shift: { ...sourceShift, id: "server-shift-manual-move", revision: 8 },
      assignment: {
        id: "server-assignment-manual-move",
        planning_shift_id: "server-shift-manual-move",
        shift_id: "server-shift-manual-move",
        personnel_id: "person-manual-move",
        status: "draft",
      },
    });
    await assignmentOperation;
    await flushMicrotasks();

    expect(moveWrite).toHaveBeenCalledTimes(1);
    expect(moveWrite).toHaveBeenCalledWith({
      action: "move",
      shift_id: "server-shift-manual-move",
      end_date: null,
      start_time: "06:30",
      end_time: "15:30",
      expected_shift_revision: 8,
    });
    expect(started).toEqual(["assign", "move"]);

    moveGate.resolve({
      shift: {
        ...sourceShift,
        id: "server-shift-manual-move",
        revision: 9,
        end_time: "15:30",
      },
    });
    await moveOperation;
    await expect(unassignAfterMove).resolves.toBe("unassigned");
    await expect(reassignAfterMove).resolves.toBe("reassigned");
    expect(started).toEqual(["assign", "move", "unassign", "reassign"]);
    expect(moveWrite).toHaveBeenCalledTimes(1);
    expect(unassignWrite).toHaveBeenCalledTimes(1);
    expect(reassignWrite).toHaveBeenCalledTimes(1);
    queue.dispose();
  });

  it("annuleert unassign en reassign na een mislukte queued move en draint de keten exact eenmaal", async () => {
    const queue = createPlanningMutationQueue({ maxParallel: 2 });
    const checkpoint = queue.createDrainCheckpoint();
    const moveFailure = new Error("move geweigerd");
    const moveWrite = vi.fn(() => Promise.reject(moveFailure));
    const unassignWrite = vi.fn(() => "unassigned");
    const reassignWrite = vi.fn(() => "reassigned");
    const move = queue.enqueue({
      id: "manual-move-fails",
      resourceKeys: ["shift:manual-cascade"],
      execute: moveWrite,
    });
    const unassign = queue.enqueue({
      id: "manual-move-unassign-child",
      dependsOn: [move.commandId],
      resourceKeys: ["shift:manual-cascade", "personnel-day:old:2026-08-24"],
      execute: unassignWrite,
    });
    const reassign = queue.enqueue({
      id: "manual-move-reassign-grandchild",
      dependsOn: [move.commandId, unassign.commandId],
      resourceKeys: ["shift:manual-cascade", "personnel-day:new:2026-08-24"],
      execute: reassignWrite,
    });
    const drain = queue.drain({ checkpoint });

    const states = await Promise.allSettled([move, unassign, reassign]);
    const report = await drain;

    expect(states[0]).toMatchObject({ status: "rejected", reason: moveFailure });
    expect(states.slice(1)).toEqual([
      expect.objectContaining({
        status: "rejected",
        reason: expect.objectContaining({ code: "PLANNING_DEPENDENCY_FAILED" }),
      }),
      expect.objectContaining({
        status: "rejected",
        reason: expect.objectContaining({ code: "PLANNING_DEPENDENCY_FAILED" }),
      }),
    ]);
    expect(moveWrite).toHaveBeenCalledTimes(1);
    expect(unassignWrite).not.toHaveBeenCalled();
    expect(reassignWrite).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      ok: false,
      completedCount: 3,
      failures: [{ id: "manual-move-fails", status: "failed", error: moveFailure }],
      cancellations: [
        expect.objectContaining({ id: "manual-move-unassign-child", status: "cancelled" }),
        expect.objectContaining({ id: "manual-move-reassign-grandchild", status: "cancelled" }),
      ],
    });
    expect(new Set([
      ...report.failures.map(item => item.id),
      ...report.cancellations.map(item => item.id),
    ])).toEqual(new Set([
      "manual-move-fails",
      "manual-move-unassign-child",
      "manual-move-reassign-grandchild",
    ]));

    expect(queue.acknowledgeDrain(report)).toBe(true);
    await expect(queue.drain({ checkpoint: queue.createDrainCheckpoint() })).resolves.toMatchObject({
      ok: true,
      completedCount: 0,
      failures: [],
      cancellations: [],
    });
    queue.dispose();
  });

  it("voert resize, unassign en reassign bij een geslaagde single-segment edit strikt als keten uit", async () => {
    const queue = createPlanningMutationQueue({ maxParallel: 2 });
    const resizeGate = deferred();
    const order = [];
    const resizeWrite = vi.fn(() => {
      order.push("resize");
      return resizeGate.promise;
    });
    const unassignWrite = vi.fn(() => {
      order.push("unassign");
      return "unassigned";
    });
    const reassignWrite = vi.fn(() => {
      order.push("reassign");
      return "reassigned";
    });
    const resize = queue.enqueue({
      id: "single-segment-resize-success",
      resourceKeys: ["shift:single-segment", "occurrence:single-segment"],
      execute: resizeWrite,
    });
    const unassign = queue.enqueue({
      id: "single-segment-unassign-after-resize",
      dependsOn: [resize.commandId],
      resourceKeys: ["shift:single-segment", "personnel-day:old:2026-08-24"],
      execute: unassignWrite,
    });
    const reassign = queue.enqueue({
      id: "single-segment-reassign-after-resize",
      dependsOn: [resize.commandId, unassign.commandId],
      resourceKeys: ["shift:single-segment", "personnel-day:new:2026-08-24"],
      execute: reassignWrite,
    });

    await flushMicrotasks();
    expect(order).toEqual(["resize"]);
    expect(unassignWrite).not.toHaveBeenCalled();
    expect(reassignWrite).not.toHaveBeenCalled();

    resizeGate.resolve({ shift: { id: "shift-single-segment", revision: 9 } });
    await expect(resize).resolves.toMatchObject({ shift: { revision: 9 } });
    await expect(unassign).resolves.toBe("unassigned");
    await expect(reassign).resolves.toBe("reassigned");
    expect(order).toEqual(["resize", "unassign", "reassign"]);
    expect(resizeWrite).toHaveBeenCalledTimes(1);
    expect(unassignWrite).toHaveBeenCalledTimes(1);
    expect(reassignWrite).toHaveBeenCalledTimes(1);
    queue.dispose();
  });

  it("annuleert de volledige medewerkerwissel als de single-segment resize faalt", async () => {
    const queue = createPlanningMutationQueue({ maxParallel: 2 });
    const checkpoint = queue.createDrainCheckpoint();
    const failure = new Error("resize geweigerd");
    const resizeWrite = vi.fn(() => Promise.reject(failure));
    const unassignWrite = vi.fn();
    const reassignWrite = vi.fn();
    const resize = queue.enqueue({
      id: "single-segment-resize-fails",
      resourceKeys: ["shift:single-segment-failure", "occurrence:single-segment-failure"],
      execute: resizeWrite,
    });
    const unassign = queue.enqueue({
      id: "single-segment-unassign-cancelled",
      dependsOn: [resize.commandId],
      resourceKeys: ["shift:single-segment-failure"],
      execute: unassignWrite,
    });
    const reassign = queue.enqueue({
      id: "single-segment-reassign-cancelled",
      dependsOn: [resize.commandId, unassign.commandId],
      resourceKeys: ["shift:single-segment-failure"],
      execute: reassignWrite,
    });
    const drain = queue.drain({ checkpoint });

    await Promise.allSettled([resize, unassign, reassign]);
    const report = await drain;
    expect(resizeWrite).toHaveBeenCalledTimes(1);
    expect(unassignWrite).not.toHaveBeenCalled();
    expect(reassignWrite).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      ok: false,
      completedCount: 3,
      failures: [{ id: "single-segment-resize-fails", error: failure }],
      cancellations: [
        expect.objectContaining({ id: "single-segment-unassign-cancelled" }),
        expect.objectContaining({ id: "single-segment-reassign-cancelled" }),
      ],
    });
    expect(queue.acknowledgeDrain(report)).toBe(true);
    await expect(queue.drain({ checkpoint: queue.createDrainCheckpoint() })).resolves.toMatchObject({
      ok: true,
      completedCount: 0,
    });
    queue.dispose();
  });

  it("gebruikt bij een times-unchanged editorwissel de terminale server-assignment exact eenmaal", async () => {
    const queue = createPlanningMutationQueue({ maxParallel: 2 });
    const parentIntent = withPlanningOptimisticIntentIdentity({
      key: "terminal-editor-assignment-parent",
      shift_id: "temp-shift-terminal-editor",
      shifts: [{
        id: "temp-shift-terminal-editor",
        revision: 7,
        service_date: "2026-08-24",
        start_time: "06:30",
        end_time: "18:00",
        status: "draft",
      }],
      assignments: [{
        id: "temp-assignment-terminal-editor",
        revision: 1,
        shift_id: "temp-shift-terminal-editor",
        planning_shift_id: "temp-shift-terminal-editor",
        personnel_id: "person-terminal-old",
        slot_index: 0,
        status: "draft",
      }],
      segments: [],
      occurrences: [],
    }, { originIntentId: "terminal-editor-assignment-parent" });
    const parentResult = {
      shift: { ...parentIntent.shifts[0], id: "server-shift-terminal-editor", revision: 8 },
      assignment: {
        ...parentIntent.assignments[0],
        id: "server-assignment-terminal-editor",
        revision: 4,
        shift_id: "server-shift-terminal-editor",
        planning_shift_id: "server-shift-terminal-editor",
      },
    };
    const frozenEditorIntent = rebaseDependentPlanningIntent({
      shift_id: parentIntent.shifts[0].id,
      assignment_id: parentIntent.assignments[0].id,
      shifts: [parentIntent.shifts[0]],
      assignments: [parentIntent.assignments[0]],
      segments: [],
      occurrences: [],
    }, parentIntent, parentResult);
    const unassignWrite = vi.fn(() => "unassigned");
    const replacementAssignWrite = vi.fn(() => "replacement-assigned");
    const unassign = queue.enqueue({
      id: "terminal-editor-unassign",
      resourceKeys: ["shift:server-shift-terminal-editor"],
      execute: () => unassignWrite({
        action: "unassign",
        shift_id: frozenEditorIntent.shift_id,
        assignment_id: frozenEditorIntent.assignment_id,
        expected_shift_revision: parentResult.shift.revision,
      }),
    });
    const replacementAssign = queue.enqueue({
      id: "terminal-editor-replacement-assign",
      dependsOn: [unassign.commandId],
      resourceKeys: ["shift:server-shift-terminal-editor"],
      execute: replacementAssignWrite,
    });

    await expect(unassign).resolves.toBe("unassigned");
    await expect(replacementAssign).resolves.toBe("replacement-assigned");
    expect(frozenEditorIntent).toMatchObject({
      shift_id: "server-shift-terminal-editor",
      assignment_id: "server-assignment-terminal-editor",
      shifts: [{ revision: 8 }],
      assignments: [{ revision: 4, planning_shift_id: "server-shift-terminal-editor" }],
    });
    expect(unassignWrite).toHaveBeenCalledTimes(1);
    expect(unassignWrite).toHaveBeenCalledWith({
      action: "unassign",
      shift_id: "server-shift-terminal-editor",
      assignment_id: "server-assignment-terminal-editor",
      expected_shift_revision: 8,
    });
    expect(replacementAssignWrite).toHaveBeenCalledTimes(1);
    queue.dispose();
  });

  it("verstuurd een stale terminale single-segment editorresize exact eenmaal met en zonder personeelketen", async () => {
    for (const replacePersonnel of [false, true]) {
      const queue = createPlanningMutationQueue({ maxParallel: 2 });
      const suffix = replacePersonnel ? "with-personnel" : "without-personnel";
      const parentIntent = withPlanningOptimisticIntentIdentity({
        key: `terminal-resize-parent-${suffix}`,
        shift_id: `temp-shift-${suffix}`,
        segment_id: `temp-segment-${suffix}`,
        shifts: [{
          id: `temp-shift-${suffix}`,
          revision: 1,
          service_date: "2026-08-24",
          start_time: "06:30",
          end_time: "18:00",
          status: "draft",
        }],
        segments: [{
          id: `temp-segment-${suffix}`,
          revision: 1,
          shift_id: `temp-shift-${suffix}`,
          task_occurrence_id: `occurrence-${suffix}`,
          start_date: "2026-08-24",
          end_date: "2026-08-24",
          start_time: "06:30",
          end_time: "18:00",
          status: "draft",
        }],
        assignments: [{
          id: `temp-assignment-${suffix}`,
          revision: 1,
          shift_id: `temp-shift-${suffix}`,
          planning_shift_id: `temp-shift-${suffix}`,
          personnel_id: `person-old-${suffix}`,
          slot_index: 0,
          status: "draft",
        }],
        occurrences: [],
      }, { originIntentId: `terminal-resize-parent-${suffix}` });
      const parentResult = {
        shift: { ...parentIntent.shifts[0], id: `server-shift-${suffix}`, revision: 8 },
        segment: {
          ...parentIntent.segments[0],
          id: `server-segment-${suffix}`,
          revision: 5,
          shift_id: `server-shift-${suffix}`,
        },
        assignment: {
          ...parentIntent.assignments[0],
          id: `server-assignment-${suffix}`,
          revision: 4,
          shift_id: `server-shift-${suffix}`,
          planning_shift_id: `server-shift-${suffix}`,
        },
      };
      const frozenEditorIntent = rebaseDependentPlanningIntent({
        shift_id: parentIntent.shifts[0].id,
        segment_id: parentIntent.segments[0].id,
        assignment_id: parentIntent.assignments[0].id,
        shifts: [parentIntent.shifts[0]],
        segments: [parentIntent.segments[0]],
        assignments: [parentIntent.assignments[0]],
        occurrences: [],
      }, parentIntent, parentResult);
      let currentShift = parentResult.shift;
      const resizeWrite = vi.fn(() => ({
        shift: { ...currentShift, revision: 9, end_time: "15:30" },
        segment: { ...parentResult.segment, revision: 6, end_time: "15:30" },
        assignment: { ...parentResult.assignment, revision: 5 },
      }));
      const unassignWrite = vi.fn(() => "unassigned");
      const replacementAssignWrite = vi.fn(() => "replacement-assigned");
      const resize = queue.enqueue({
        id: `terminal-resize-${suffix}`,
        resourceKeys: [`shift:${parentResult.shift.id}`, `occurrence:${parentResult.segment.task_occurrence_id}`],
        execute: () => resizeWrite({
          action: "resize_task_shift_preserving_coverage",
          shift_id: frozenEditorIntent.shift_id,
          segment_id: frozenEditorIntent.segment_id,
          expected_shift_revision: currentShift.revision,
          expected_segment_revision: parentResult.segment.revision,
        }),
        onSuccess: result => { currentShift = result.shift; },
      });
      const operations = [resize];
      if (replacePersonnel) {
        const unassign = queue.enqueue({
          id: `terminal-resize-unassign-${suffix}`,
          dependsOn: [resize.commandId],
          resourceKeys: [`shift:${parentResult.shift.id}`],
          execute: () => unassignWrite({
            assignment_id: frozenEditorIntent.assignment_id,
            expected_shift_revision: currentShift.revision,
          }),
        });
        operations.push(unassign, queue.enqueue({
          id: `terminal-resize-reassign-${suffix}`,
          dependsOn: [resize.commandId, unassign.commandId],
          resourceKeys: [`shift:${parentResult.shift.id}`],
          execute: replacementAssignWrite,
        }));
      }

      await Promise.all(operations);
      expect(resizeWrite).toHaveBeenCalledTimes(1);
      expect(resizeWrite).toHaveBeenCalledWith({
        action: "resize_task_shift_preserving_coverage",
        shift_id: `server-shift-${suffix}`,
        segment_id: `server-segment-${suffix}`,
        expected_shift_revision: 8,
        expected_segment_revision: 5,
      });
      expect(unassignWrite).toHaveBeenCalledTimes(replacePersonnel ? 1 : 0);
      expect(replacementAssignWrite).toHaveBeenCalledTimes(replacePersonnel ? 1 : 0);
      if (replacePersonnel) {
        expect(unassignWrite).toHaveBeenCalledWith({
          assignment_id: `server-assignment-${suffix}`,
          expected_shift_revision: 9,
        });
      }
      queue.dispose();
    }
  });

  it("begrensd de appbrede write-lane op twee gelijktijdige Base44-mutaties", async () => {
    planningMutationQueueInternals.resetSharedQueueForTests();
    const queue = getPlanningMutationQueue();
    const first = deferred();
    const second = deferred();
    const third = deferred();
    const started = [];
    const operations = [first, second, third].map((gate, index) => queue.enqueue({
      id: `bounded-write-${index + 1}`,
      resourceKeys: [`occurrence:bounded-${index + 1}`],
      execute: () => {
        started.push(index + 1);
        return gate.promise;
      },
    }));

    await flushMicrotasks();
    expect(started).toEqual([1, 2]);
    expect(queue.getSnapshot()).toMatchObject({ runningCount: 2, queuedCount: 1 });

    first.resolve("first");
    await operations[0];
    await flushMicrotasks();
    expect(started).toEqual([1, 2, 3]);

    second.resolve("second");
    third.resolve("third");
    await Promise.all(operations);
    planningMutationQueueInternals.resetSharedQueueForTests();
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
