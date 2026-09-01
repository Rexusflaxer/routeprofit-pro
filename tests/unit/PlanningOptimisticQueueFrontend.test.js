import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  createPlanningMutationQueue,
  planningPersonnelShiftResourceKeys,
} from "@/components/planning/planningMutationQueue";
import {
  planningOriginIntentId,
  planningRecordReference,
  rebaseDependentPlanningIntent,
  resolvePlanningAssignmentTarget,
  resolvePlanningOccurrenceTarget,
  resolvePlanningSegmentTarget,
  resolvePlanningShiftTarget,
  withPlanningOptimisticIntentIdentity,
} from "@/components/planning/planningEffectivePlan";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "src/pages/Planning.jsx"), "utf8");
const matrixSource = fs.readFileSync(
  path.join(root, "src/components/planning/PlanningMatrix.jsx"),
  "utf8",
);
const queueSource = fs.readFileSync(
  path.join(root, "src/components/planning/planningMutationQueue.js"),
  "utf8",
);
const manualMoveHelpersSource = source.slice(
  source.indexOf("const PLANNING_MANUAL_MOVE_CONTEXT_FIELDS"),
  source.indexOf("async function listAllEntityRecords"),
);
const {
  planningEditorSegmentSemanticFingerprint,
  planningManualMoveSemanticFingerprint,
  projectPlanningManualMoveShift,
} = new Function("addDays", "toDateKey", `${manualMoveHelpersSource}
  return {
    planningEditorSegmentSemanticFingerprint,
    planningManualMoveSemanticFingerprint,
    projectPlanningManualMoveShift,
  };
`)(
  (value, amount) => {
    const date = new Date(`${value}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date;
  },
  value => value.toISOString().slice(0, 10),
);
const queuedOccurrencePersonnelResourceKeys = new Function(
  "planningPersonnelShiftResourceKeys",
  `${source.slice(
    source.indexOf("function queuedOccurrencePersonnelResourceKeys"),
    source.indexOf("function planningEligibilityCandidateSourceResourceKey"),
  )}
  return queuedOccurrencePersonnelResourceKeys;
`,
)(planningPersonnelShiftResourceKeys);
const {
  planningTaskOccurrenceLinkedRecords,
  planningTaskOccurrenceConflictResourceKeys,
  buildQueuedTaskOccurrenceDeleteIntent,
} = new Function(
  "activeAssignments",
  "planningPersonnelShiftResourceKeys",
  "withPlanningOptimisticIntentIdentity",
  `${source.slice(
    source.indexOf("function planningTaskOccurrenceLinkedRecords"),
    source.indexOf("function planningEligibilityCandidateSourceResourceKey"),
  )}
  return {
    planningTaskOccurrenceLinkedRecords,
    planningTaskOccurrenceConflictResourceKeys,
    buildQueuedTaskOccurrenceDeleteIntent,
  };
`,
)(
  assignments => assignments.filter(item => item.status !== "removed"),
  planningPersonnelShiftResourceKeys,
  withPlanningOptimisticIntentIdentity,
);
const {
  planningMutationRequiresRefresh,
  mutationMessage,
} = new Function(`${source.slice(
  source.indexOf("function planningMutationRequiresRefresh"),
  source.indexOf("function queuedPlanningRebaseError"),
)}
  return { planningMutationRequiresRefresh, mutationMessage };
`)();

function between(start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

function serviceEditorResolver({ snapshot, terminalStates = new Map(), activeIds = new Set() }) {
  const resolverSource = between(
    "const resolveQueuedServiceEditorRecords",
    "const recoverQueuedPlanningAfterExecutionError",
  );
  return new Function(
    "planningOriginIntentId",
    "planningMutationQueue",
    "rebaseDependentPlanningIntent",
    "queuedEffectiveSnapshot",
    "resolvePlanningShiftTarget",
    "planningRecordReference",
    "resolvePlanningSegmentTarget",
    "resolvePlanningAssignmentTarget",
    "activeAssignments",
    "planningManualMoveSemanticFingerprint",
    "planningEditorSegmentSemanticFingerprint",
    `${resolverSource}
    return resolveQueuedServiceEditorRecords;
  `)(
    planningOriginIntentId,
    {
      current: {
        has: id => activeIds.has(String(id)),
        getTerminalState: id => terminalStates.get(String(id)) || null,
      },
    },
    rebaseDependentPlanningIntent,
    () => snapshot,
    resolvePlanningShiftTarget,
    planningRecordReference,
    resolvePlanningSegmentTarget,
    resolvePlanningAssignmentTarget,
    assignments => assignments.filter(item => item.status !== "removed"),
    planningManualMoveSemanticFingerprint,
    planningEditorSegmentSemanticFingerprint,
  );
}

function taskOccurrenceResolver({ snapshot, terminalStates = new Map(), activeIds = new Set() }) {
  const resolverSource = between(
    "const resolveQueuedTaskOccurrenceRecords",
    "const resolveQueuedServiceEditorRecords",
  );
  return new Function(
    "planningOriginIntentId",
    "planningMutationQueue",
    "rebaseDependentPlanningIntent",
    "queuedEffectiveSnapshot",
    "resolvePlanningOccurrenceTarget",
    "planningRecordReference",
    `${resolverSource}
    return resolveQueuedTaskOccurrenceRecords;
  `)(
    planningOriginIntentId,
    {
      current: {
        has: id => activeIds.has(String(id)),
        getTerminalState: id => terminalStates.get(String(id)) || null,
      },
    },
    rebaseDependentPlanningIntent,
    () => snapshot,
    resolvePlanningOccurrenceTarget,
    planningRecordReference,
  );
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("Planning queued optimistic frontend contract", () => {
  it("bouwt alle UI-selectors op dezelfde effective planning", () => {
    const effectiveIndex = source.indexOf("const interactivePlanningRecords = useMemo");
    const rangeIndex = source.indexOf("const shiftsInRange = useMemo");
    expect(effectiveIndex).toBeGreaterThan(0);
    expect(effectiveIndex).toBeLessThan(rangeIndex);
    expect(source).toContain("const allShifts = interactivePlanningRecords.shifts");
    expect(source).toContain("const assignments = interactivePlanningRecords.assignments");
    expect(source).toContain("projectSegmentsToCurrentTaskOccurrences(interactivePlanningRecords.segments");
    expect(source).toContain("segments: taskSegments,");
    expect(source).toContain("shifts: shiftsInRange,");
    expect(source).toContain("assignments: assignmentsInRange,");
  });

  it("houdt de occurrence uniek zonder de medewerker als dragbron te blokkeren", () => {
    const sliceSource = between("const composeAndAssignOccurrenceSlice", "const saveTaskEdit");
    const matrixFunctionSource = between("const composeAndAssignOccurrence =", "const openOccurrenceStaffing");
    const assignmentSource = between("const executeAssignment =", "const handleCandidateAssign");

    expect(sliceSource).toContain("`occurrence:${occurrence.id}`");
    expect(matrixFunctionSource).toContain("`occurrence:${occurrence.id}`");
    expect(assignmentSource).toContain("`shift:${initialTarget.shift.id}`");
    expect(sliceSource).not.toContain("`personnel:${personnelItem.id}`");
    expect(matrixFunctionSource).not.toContain("`personnel:${personnelItem.id}`");
    expect(assignmentSource).not.toContain("`personnel:${personnelItem.id}`");
    expect(sliceSource).not.toContain("acquirePendingResources");
    expect(matrixFunctionSource).not.toContain("acquirePendingResources");
    expect(assignmentSource).not.toContain("acquirePendingResources");
    expect(sliceSource).toContain("const snapshot = planningExecutionSnapshotFromCache(");
    expect(matrixFunctionSource).toContain("const snapshot = planningExecutionSnapshotFromCache(");
    expect(assignmentSource).toContain("const snapshot = planningExecutionSnapshotFromCache(");
    expect(sliceSource).toContain("const executionRange = Object.freeze({ periodStart, periodEnd })");
    expect(matrixFunctionSource).toContain("const executionRange = Object.freeze({ periodStart, periodEnd })");
    expect(assignmentSource).toContain("const executionRange = Object.freeze({ periodStart, periodEnd })");
    expect(sliceSource).toContain("getActiveCommandIdsForResources([");
    expect(matrixFunctionSource).toContain("getActiveCommandIdsForResources([");
    expect(sliceSource).toContain("dependsOn: parentIntentIds");
    expect(matrixFunctionSource).toContain("dependsOn: parentIntentIds");
    expect(sliceSource).toContain("`shift:${initialResolution.adjacent.candidate.shift.id}`");
    expect(matrixFunctionSource).toContain("`shift:${initialResolution.adjacent.candidate.shift.id}`");
    expect(sliceSource).toContain("id: intent.task_occurrence_id");
    expect(matrixFunctionSource).toContain("id: intent.task_occurrence_id");
    expect(sliceSource).toContain("occurrenceId: currentOccurrence.record.id");
    expect(matrixFunctionSource).toContain("occurrenceId: currentOccurrence.record.id");
    const optimisticOccurrenceSource = between(
      "function optimisticQueuedOccurrenceRecords",
      "function planningMutationRequiresRefresh",
    );
    expect(optimisticOccurrenceSource).toContain("task_occurrence_id: occurrence?.id || null");
    expect(optimisticOccurrenceSource).toContain('occurrence_ref: planningRecordReference(occurrence, "occurrence")');
    expect(assignmentSource).toContain("resolveQueuedShiftAssignment");
    expect(source).toContain("personnelDayQueueResourceKeys(personnelItem.id");
  });

  it("fencet een adjacent merge over de oude dienst en de volledige voorgestelde dag- en weekhorizon", () => {
    const resolution = {
      kind: "merge",
      allocation: {
        segment: {
          start_date: "2026-08-31",
          end_date: "2026-08-31",
          start_time: "00:30",
          end_time: "02:00",
        },
      },
      adjacent: {
        candidate: {
          shift: {
            service_date: "2026-08-30",
            end_date: "2026-08-31",
            start_time: "23:00",
            end_time: "00:30",
          },
        },
      },
    };
    const optimisticRecords = {
      shifts: [{
        service_date: "2026-08-30",
        end_date: "2026-08-31",
        start_time: "23:00",
        end_time: "02:00",
      }],
    };

    expect(queuedOccurrencePersonnelResourceKeys(
      "personnel-merge-week-boundary",
      resolution,
      optimisticRecords,
    )).toEqual([
      "personnel-day:personnel-merge-week-boundary:2026-08-29",
      "personnel-day:personnel-merge-week-boundary:2026-08-30",
      "personnel-day:personnel-merge-week-boundary:2026-08-31",
      "personnel-day:personnel-merge-week-boundary:2026-09-01",
      "personnel-week:personnel-merge-week-boundary:2026-08-24",
      "personnel-week:personnel-merge-week-boundary:2026-08-31",
    ]);

    const sliceSource = between("const composeAndAssignOccurrenceSlice", "const saveTaskEdit");
    const matrixFunctionSource = between("const composeAndAssignOccurrence =", "const openOccurrenceStaffing");
    for (const composeSource of [sliceSource, matrixFunctionSource]) {
      expect(composeSource).toContain("...queuedOccurrencePersonnelResourceKeys(");
      expect(composeSource).toContain("initialResolution,\n          optimisticRecords,");
      expect(composeSource).not.toContain(
        "...personnelDayQueueResourceKeys(personnelItem.id, initialResolution.allocation.segment)",
      );
    }
  });

  it("behandelt een planning in het verleden als policyfout zonder cache-refreshmelding", () => {
    const error = {
      status: 409,
      message: "Taken kunnen alleen na de huidige Amsterdamse datum en tijd worden ingepland",
      details: { code: "TASK_SCHEDULE_IN_PAST" },
    };
    expect(planningMutationRequiresRefresh(error)).toBe(false);
    expect(mutationMessage(error)).toBe(error.message);

    const stale = { status: 409, message: "Planning is intussen gewijzigd", details: {} };
    expect(planningMutationRequiresRefresh(stale)).toBe(true);
    expect(mutationMessage(stale)).toBe(
      "Planning is intussen gewijzigd De planning wordt opnieuw geladen.",
    );

    const handlerSource = between("const handleActionMutationError", "const runActionMutation");
    expect(handlerSource).toContain("else if (planningMutationRequiresRefresh(error))");
    expect(handlerSource).not.toContain("else if (Number(error?.status) === 409)");
  });

  it("projecteert een taakverwijdering direct over occurrence, diensten, segmenten en bezetting", () => {
    const occurrence = {
      id: "occurrence-delete-projection",
      revision: 4,
      object_task_definition_id: "definition-delete-projection",
      object_task_schedule_series_id: "series-delete-projection",
      service_date: "2026-09-01",
      lifecycle_status: "active",
    };
    const shift = {
      id: "shift-delete-projection",
      revision: 3,
      service_date: "2026-09-01",
      start_time: "06:30",
      end_time: "18:00",
      status: "draft",
    };
    const segment = {
      id: "segment-delete-projection",
      revision: 2,
      shift_id: shift.id,
      task_occurrence_id: occurrence.id,
      status: "draft",
    };
    const assignment = {
      id: "assignment-delete-projection",
      revision: 2,
      planning_shift_id: shift.id,
      shift_id: shift.id,
      personnel_id: "personnel-delete-projection",
      status: "draft",
    };
    const linkedRecords = planningTaskOccurrenceLinkedRecords({
      shifts: [shift],
      segments: [segment],
      assignments: [assignment],
    }, occurrence.id);
    const intent = buildQueuedTaskOccurrenceDeleteIntent({
      key: "delete-projection",
      occurrence,
      linkedRecords,
    });

    expect(intent.occurrences).toEqual([
      expect.objectContaining({ id: occurrence.id, lifecycle_status: "superseded" }),
    ]);
    expect(intent.shifts).toEqual([
      expect.objectContaining({ id: shift.id, status: "cancelled" }),
    ]);
    expect(intent.segments).toEqual([
      expect.objectContaining({ id: segment.id, status: "removed" }),
    ]);
    expect(intent.assignments).toEqual([
      expect.objectContaining({ id: assignment.id, status: "removed" }),
    ]);
    expect(planningTaskOccurrenceConflictResourceKeys({ occurrence, linkedRecords })).toEqual(
      expect.arrayContaining([
        `occurrence:${occurrence.id}`,
        `shift:${shift.id}`,
        `task-definition:${occurrence.object_task_definition_id}`,
        `task-series:${occurrence.object_task_schedule_series_id}`,
        `task-exception:${occurrence.object_task_schedule_series_id}:${occurrence.service_date}`,
        "personnel-day:personnel-delete-projection:2026-08-31",
        "personnel-day:personnel-delete-projection:2026-09-01",
        "personnel-day:personnel-delete-projection:2026-09-02",
        "personnel-week:personnel-delete-projection:2026-08-31",
      ]),
    );
  });

  it("behoudt een samengestelde dienst en medewerker wanneer een andere taaksegment overblijft", () => {
    const occurrence = {
      id: "occurrence-delete-composed",
      object_task_definition_id: "definition-delete-composed",
      object_task_schedule_series_id: "series-delete-composed",
      service_date: "2026-09-01",
      lifecycle_status: "active",
    };
    const retainedOccurrence = {
      id: "occurrence-retained-composed",
      lifecycle_status: "active",
    };
    const shift = {
      id: "shift-delete-composed",
      service_date: "2026-09-01",
      end_date: null,
      start_time: "06:30",
      end_time: "18:00",
      duration_minutes: 690,
      task_occurrence_ids: [occurrence.id, retainedOccurrence.id],
      task_segment_count: 2,
      status: "draft",
    };
    const removedSegment = {
      id: "segment-delete-composed",
      shift_id: shift.id,
      task_occurrence_id: occurrence.id,
      start_date: "2026-09-01",
      end_date: "2026-09-01",
      start_time: "06:30",
      end_time: "12:00",
      status: "draft",
    };
    const retainedSegment = {
      id: "segment-retained-composed",
      shift_id: shift.id,
      task_occurrence_id: retainedOccurrence.id,
      start_date: "2026-09-01",
      end_date: "2026-09-01",
      start_time: "12:00",
      end_time: "18:00",
      status: "draft",
    };
    const assignment = {
      id: "assignment-retained-composed",
      planning_shift_id: shift.id,
      personnel_id: "personnel-retained-composed",
      status: "draft",
    };
    const linkedRecords = planningTaskOccurrenceLinkedRecords({
      shifts: [shift],
      segments: [removedSegment, retainedSegment],
      assignments: [assignment],
    }, occurrence.id);
    const intent = buildQueuedTaskOccurrenceDeleteIntent({
      key: "delete-composed",
      occurrence,
      linkedRecords,
    });

    expect(intent.shifts).toEqual([expect.objectContaining({
      id: shift.id,
      status: "draft",
      service_date: "2026-09-01",
      end_date: null,
      start_time: "12:00",
      end_time: "18:00",
      duration_minutes: 360,
      task_occurrence_ids: [retainedOccurrence.id],
      task_segment_count: 1,
    })]);
    expect(intent.segments).toEqual([
      expect.objectContaining({ id: removedSegment.id, status: "removed" }),
    ]);
    expect(intent.segments).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: retainedSegment.id }),
    ]));
    expect(intent.assignments).toEqual([]);
  });

  it("serialiseert drie snelle taakverwijderingen uit dezelfde reeks maar houdt een onafhankelijke reeks parallel", async () => {
    const queue = createPlanningMutationQueue({ maxParallel: 4 });
    const started = [];
    const gates = [deferred(), deferred(), deferred(), deferred()];
    const occurrences = [0, 1, 2].map(index => ({
      id: `occurrence-series-fifo-${index + 1}`,
      object_task_definition_id: "definition-series-fifo",
      object_task_schedule_series_id: "series-fifo",
      service_date: `2026-09-0${index + 1}`,
      lifecycle_status: "active",
    }));
    const independent = {
      id: "occurrence-independent-series",
      object_task_definition_id: "definition-independent-series",
      object_task_schedule_series_id: "series-independent",
      service_date: "2026-09-01",
      lifecycle_status: "active",
    };
    const enqueue = (occurrence, index) => queue.enqueue({
      id: `delete-series-${index}`,
      resourceKeys: planningTaskOccurrenceConflictResourceKeys({ occurrence }),
      intent: buildQueuedTaskOccurrenceDeleteIntent({
        key: `delete-series-${index}`,
        occurrence,
        linkedRecords: { shifts: [], segments: [], assignments: [] },
      }),
      execute: () => {
        started.push(occurrence.id);
        return gates[index].promise;
      },
    });
    const operations = [
      enqueue(occurrences[0], 0),
      enqueue(occurrences[1], 1),
      enqueue(occurrences[2], 2),
      enqueue(independent, 3),
    ];
    await Promise.resolve();

    expect(started).toEqual([occurrences[0].id, independent.id]);
    gates[3].resolve({ ok: true });
    gates[0].resolve({ ok: true });
    await operations[0];
    await Promise.resolve();
    expect(started).toEqual([occurrences[0].id, independent.id, occurrences[1].id]);
    gates[1].resolve({ ok: true });
    await operations[1];
    await Promise.resolve();
    expect(started).toEqual([
      occurrences[0].id,
      independent.id,
      occurrences[1].id,
      occurrences[2].id,
    ]);
    gates[2].resolve({ ok: true });
    await Promise.all(operations);
  });

  it("annuleert temp-copy-naar-delete na parentfalen en rapporteert beide aan Concept drain", async () => {
    const queue = createPlanningMutationQueue({ maxParallel: 2 });
    const checkpoint = queue.createDrainCheckpoint();
    const parentGate = deferred();
    const parent = queue.enqueue({
      id: "copy-parent-for-delete",
      resourceKeys: ["task-definition:definition-copy-delete"],
      intent: { key: "copy-parent-for-delete" },
      execute: () => parentGate.promise,
    });
    const childExecute = vi.fn();
    const child = queue.enqueue({
      id: "delete-temp-copy-child",
      dependsOn: ["copy-parent-for-delete"],
      resourceKeys: ["task-definition:definition-copy-delete"],
      intent: { key: "delete-temp-copy-child" },
      execute: childExecute,
    });
    const outcomes = Promise.allSettled([parent, child]);
    parentGate.reject(new Error("copy kon niet worden opgeslagen"));
    expect(await outcomes).toEqual([
      expect.objectContaining({ status: "rejected" }),
      expect.objectContaining({
        status: "rejected",
        reason: expect.objectContaining({ code: "PLANNING_DEPENDENCY_FAILED" }),
      }),
    ]);
    expect(childExecute).not.toHaveBeenCalled();
    const report = await queue.drain({ checkpoint });
    expect(report).toMatchObject({
      ok: false,
      failures: [expect.objectContaining({ id: "copy-parent-for-delete" })],
      cancellations: [expect.objectContaining({ id: "delete-temp-copy-child" })],
    });
  });

  it("rebased een temp-copy naar de server-occurrence voordat delete executeert", () => {
    const optimisticOccurrence = {
      id: "pending-task-copy-delete",
      revision: 1,
      object_task_definition_id: "definition-copy-delete",
      object_task_schedule_series_id: null,
      service_date: "2026-09-03",
      lifecycle_status: "active",
      _planning_origin_intent_id: "copy-parent-delete-rebase",
    };
    const parentIntent = withPlanningOptimisticIntentIdentity({
      key: "copy-parent-delete-rebase",
      task_occurrence_id: "source-copy-delete",
      shifts: [],
      segments: [],
      assignments: [],
      occurrences: [optimisticOccurrence],
    }, { originIntentId: "copy-parent-delete-rebase" });
    const serverOccurrence = {
      ...optimisticOccurrence,
      id: "server-task-copy-delete",
      revision: 6,
      object_task_schedule_series_id: "server-copy-series-delete",
    };
    const terminalStates = new Map([["copy-parent-delete-rebase", {
      status: "succeeded",
      sequence: 1,
      originalIntent: parentIntent,
      intent: parentIntent,
      result: { task_occurrence: serverOccurrence, task_occurrences: [serverOccurrence] },
    }]]);
    const resolution = taskOccurrenceResolver({
      snapshot: { shifts: [], segments: [], assignments: [], occurrences: [serverOccurrence] },
      terminalStates,
    })(parentIntent.occurrences[0]);

    expect(resolution).toMatchObject({
      status: "ready",
      occurrence: {
        id: serverOccurrence.id,
        revision: 6,
        object_task_schedule_series_id: serverOccurrence.object_task_schedule_series_id,
      },
      parentIntentIds: [],
    });
    const activeResolution = taskOccurrenceResolver({
      snapshot: { shifts: [], segments: [], assignments: [], occurrences: parentIntent.occurrences },
      activeIds: new Set(["copy-parent-delete-rebase"]),
    })(parentIntent.occurrences[0]);
    expect(activeResolution).toMatchObject({
      status: "ready",
      occurrence: { id: optimisticOccurrence.id },
      parentIntentIds: ["copy-parent-delete-rebase"],
    });
  });

  it("rebased een temp-copy naar de server-occurrence voordat compose executeert", async () => {
    const queue = createPlanningMutationQueue({ maxParallel: 2 });
    const copyGate = deferred();
    const optimisticOccurrence = {
      id: "pending-occurrence-copy-compose",
      revision: 1,
      lifecycle_status: "active",
      object_task_definition_id: "definition-copy-compose",
      object_task_schedule_series_id: null,
      logical_source_key: "copy-compose:2026-09-04",
      service_date: "2026-09-04",
      window_start_time: "06:30",
      window_end_time: "18:00",
    };
    const copyIntent = withPlanningOptimisticIntentIdentity({
      key: "copy-parent-compose-rebase",
      shifts: [],
      segments: [],
      assignments: [],
      occurrences: [optimisticOccurrence],
    }, { originIntentId: "copy-parent-compose-rebase" });
    const serverOccurrence = {
      ...optimisticOccurrence,
      id: "server-occurrence-copy-compose",
      revision: 4,
      object_task_schedule_series_id: "server-series-copy-compose",
      _optimistic_pending: false,
    };
    const parent = queue.enqueue({
      id: "copy-parent-compose-rebase",
      resourceKeys: [`occurrence:${optimisticOccurrence.id}`],
      intent: copyIntent,
      execute: () => copyGate.promise,
      onSuccess: result => {
        queue.updateIntents(intent => rebaseDependentPlanningIntent(intent, copyIntent, result));
      },
    });
    const composeIntent = withPlanningOptimisticIntentIdentity({
      key: "compose-child-after-copy",
      task_occurrence_id: optimisticOccurrence.id,
      occurrence_ref: planningRecordReference(optimisticOccurrence, "occurrence"),
      shifts: [{ id: "pending-shift-copy-compose", status: "draft" }],
      segments: [{
        id: "pending-segment-copy-compose",
        shift_id: "pending-shift-copy-compose",
        task_occurrence_id: optimisticOccurrence.id,
        status: "draft",
      }],
      assignments: [],
      occurrences: [],
    }, { originIntentId: "compose-child-after-copy" });
    const resolvedOccurrenceIds = [];
    const child = queue.enqueue({
      id: "compose-child-after-copy",
      dependsOn: queue.getActiveCommandIdsForResources([
        `occurrence:${optimisticOccurrence.id}`,
      ]),
      resourceKeys: [`occurrence:${optimisticOccurrence.id}`],
      intent: composeIntent,
      execute: ({ intent }) => {
        const target = resolvePlanningOccurrenceTarget(
          { occurrences: [serverOccurrence] },
          { id: intent.task_occurrence_id, ref: intent.occurrence_ref },
        );
        expect(target.status).toBe("ready");
        resolvedOccurrenceIds.push(target.record.id);
        expect(intent.segments).toEqual([
          expect.objectContaining({ task_occurrence_id: serverOccurrence.id }),
        ]);
        return { ok: true };
      },
    });

    copyGate.resolve({ task_occurrence: serverOccurrence, task_occurrences: [serverOccurrence] });
    await Promise.all([parent, child]);
    expect(resolvedOccurrenceIds).toEqual([serverOccurrence.id]);
    queue.dispose();
  });

  it("neemt bij adjacent compose ook de nog lopende kandidaatdienst als parent", async () => {
    const queue = createPlanningMutationQueue({ maxParallel: 2 });
    const assignGate = deferred();
    const assign = queue.enqueue({
      id: "assign-parent-adjacent-compose",
      resourceKeys: ["shift:adjacent-compose-candidate"],
      intent: { key: "assign-parent-adjacent-compose" },
      execute: () => assignGate.promise,
    });
    const composeWrite = vi.fn();
    const compose = queue.enqueue({
      id: "compose-child-adjacent",
      dependsOn: queue.getActiveCommandIdsForResources([
        "occurrence:adjacent-compose-occurrence",
        "shift:adjacent-compose-candidate",
      ]),
      resourceKeys: [
        "occurrence:adjacent-compose-occurrence",
        "shift:adjacent-compose-candidate",
      ],
      intent: { key: "compose-child-adjacent" },
      execute: composeWrite,
    });
    const outcomes = Promise.allSettled([assign, compose]);

    assignGate.reject(new Error("eerste assignment geweigerd"));
    expect(await outcomes).toEqual([
      expect.objectContaining({ status: "rejected" }),
      expect.objectContaining({
        status: "rejected",
        reason: expect.objectContaining({ code: "PLANNING_DEPENDENCY_FAILED" }),
      }),
    ]);
    expect(composeWrite).not.toHaveBeenCalled();
    queue.dispose();
  });

  it("stuurt taakdelete via de gedeelde queue en laat copy/edit dezelfde logische resources respecteren", () => {
    const deleteSource = between("const deleteTaskOccurrence", "const requestTaskDeletion");
    expect(deleteSource).toContain("if (planningCommitFenceRef.current) return null");
    expect(deleteSource).toContain("planningMutationQueue.current.enqueue({");
    expect(deleteSource).toContain("buildQueuedTaskOccurrenceDeleteIntent({");
    expect(deleteSource).toContain("planningExecutionSnapshotFromCache(");
    expect(deleteSource).toContain("planningTaskOccurrenceLinkedRecords(");
    expect(deleteSource).toContain("expected_occurrence_revision: Number(currentOccurrence.record.revision || 1)");
    expect(deleteSource).toContain("planningMutationQueue.current.updateIntent(pendingKey");
    expect(deleteSource).toContain("reconcilePlanningResultForRange(result, executionRange)");
    expect(deleteSource).toContain("rebaseDependentPlanningIntent(intent, executionIntent, result)");
    expect(deleteSource).toContain("recoverQueuedPlanningAfterExecutionError");
    expect(deleteSource).not.toContain("runIntentMutation(");
    expect(deleteSource).not.toContain("acquirePendingResources(");

    const copySource = between("const pasteTaskToDate", "const copyServiceToClipboard");
    expect(copySource).toContain("...planningTaskOccurrenceConflictResourceKeys({ occurrence: task })");
    expect(copySource).toContain("serviceDate,");
    const taskEditSource = between("const saveTaskEdit", "const copyTaskToClipboard");
    expect(taskEditSource).toContain("planningTaskOccurrenceConflictResourceKeys({ occurrence })");
    expect(source.match(/planningTaskOccurrenceConflictResourceKeys\(\{ occurrence \}\)/g)?.length)
      .toBeGreaterThanOrEqual(5);
    expect(source.match(/requestTaskDeletion\(occurrence\),\s*\{ allowQueued: true \},/g))
      .toHaveLength(2);
  });

  it("stuurt ook een snelle open-dienstactie via de queue en herberekent het taakgat bij uitvoering", () => {
    const openSource = between("const createOpenOccurrenceSlice", "const resizeTimelineTaskSegment");
    expect(openSource).toContain("resolveQueuedTaskOccurrenceRecords(occurrence)");
    expect(openSource.match(/resolveQueuedOccurrenceAllocation\(\{/g)?.length).toBe(2);
    expect(openSource).toContain("planningMutationQueue.current.enqueue({");
    expect(openSource).toContain("dependsOn: parentIntentIds");
    expect(openSource).toContain("getActiveCommandIdsForResources([");
    expect(openSource).toContain("planningTaskOccurrenceConflictResourceKeys({");
    expect(openSource).toContain("planningExecutionSnapshotFromCache(");
    expect(openSource).toContain('currentOccurrence.record.lifecycle_status !== "active"');
    expect(openSource).toContain("planningMutationQueue.current.updateIntent(pendingKey");
    expect(openSource).toContain("expected_occurrence_revisions:");
    expect(openSource).toContain("reconcilePlanningResultForRange(result, executionRange)");
    expect(openSource).toContain("rebaseDependentPlanningIntent(intent, executionIntent, result)");
    expect(openSource).not.toContain("runIntentMutation(");
    expect(openSource).not.toContain("acquirePendingResources(");
    expect(openSource).not.toContain("addPendingMatrixChange(");
  });

  it("reconcilet vóór rollback-cleanup en schermt opslaan/publiceren af tot de queue leeg is", () => {
    const saveSource = between("const saveDraft", "const publishMutation");
    const publishSource = between("const publishMutation", "const changePeriod");
    expect(source).toContain("reconcilePlanningResultForRange(result, executionRange, { replaceShiftSegments })");
    expect(source).toContain("onCallbackError: context => recoverQueuedPlanningAfterCallbackError");
    expect(queueSource.indexOf("await safeCallback(entry.onSuccess, result)")).toBeLessThan(
      queueSource.indexOf("await safeCallback(entry.onSettled"),
    );
    expect(source).toContain("await planningMutationQueue.current.drain({");
    expect(source).toContain("const saveDraft = async () =>");
    expect(source).toContain("await settlePlanningDropEnqueues()");
    expect(source).not.toContain("authoritativePlanningRef");
    expect(source).toContain("saveDraftDisabled={runActionMutation.isPending || matrixPendingResourceKeys.size > 0 || draftSavePending || Boolean(pendingEligibilityDrop)}");
    expect(source).toContain("mutationPending={publishMutation.isPending || draftSavePending}");
    expect(source).toContain("publishDisabled={draftSavePending || Boolean(pendingEligibilityDrop) || planningQueueState.pendingCount > 0");
    expect(source).toContain("const postDrainSnapshot = planningExecutionSnapshotFromCache(");
    expect(source).toContain("buildPlanningPublicationSnapshot({");
    expect(source).not.toContain("shift_ids: ownedShiftsInRange.map");
    expect(source).not.toContain("planningCommitFenceRef.current = true");
    expect(publishSource.indexOf("await settlePlanningDropEnqueues()")).toBeLessThan(
      publishSource.indexOf("planningCommitFenceRef.current = commitToken"),
    );
    expect(saveSource.indexOf("createDrainCheckpoint()")).toBeLessThan(
      saveSource.indexOf("await settlePlanningDropEnqueues()"),
    );
    expect(saveSource).toContain("checkpoint: drainCheckpoint");
    expect(saveSource).toContain("rejectOnFailure: true");
    expect(saveSource.indexOf("rejectOnFailure: true")).toBeLessThan(saveSource.indexOf("setEditing(false)"));
    expect(saveSource).toContain('title: "Concept niet opgeslagen"');
    expect(publishSource.indexOf("createDrainCheckpoint()")).toBeLessThan(
      publishSource.indexOf("await settlePlanningDropEnqueues()"),
    );
    expect(publishSource).toContain("checkpoint: drainCheckpoint");
    expect(publishSource).toContain("rejectOnFailure: true");
    expect(publishSource.indexOf("rejectOnFailure: true")).toBeLessThan(
      publishSource.indexOf("return invokePlanningApi(request)"),
    );
    expect(source).toContain("getPlanningMutationQueue()");
    expect(source).not.toContain('window.addEventListener("beforeunload", warnBeforeUnload)');
    expect(queueSource).toContain('target.addEventListener("beforeunload", handler)');
    expect(source).toContain("intents: planningQueueState.intents || []");
    expect(source).toContain("queuedResourceKeys={queuedPlanningResourceKeys}");
  });

  it("toont lokale verwerking zonder pulserende kaart of laadspinner", () => {
    expect(matrixSource).toContain('isPending && "border-primary/70"');
    expect(matrixSource).not.toContain('isPending && "animate-pulse');
    expect(matrixSource).toContain('aria-label="Lokaal verwerkt; synchroniseert op de achtergrond"');
    expect(matrixSource).not.toContain('aria-label="Dienst wordt opgeslagen"');
  });

  it("herstelt een resize die pas na de compose-ACK wordt losgelaten uit de terminale identity-map", () => {
    const resizeSource = between("const resizeTimelineTaskSegment", "const resizeTimelineSharedBoundary");
    const resolverSource = between(
      "const resolveQueuedServiceEditorRecords",
      "const recoverQueuedPlanningAfterExecutionError",
    );

    expect(queueSource).toContain("intent: entry.intent");
    expect(queueSource).toContain("originalIntent: entry.originalIntent");
    expect(resolverSource).toContain("planningMutationQueue.current.getTerminalState(originIntentId)");
    expect(resolverSource).toContain("rebaseDependentPlanningIntent(");
    expect(resolverSource).toContain("terminalParent.originalIntent || terminalParent.intent");
    expect(resolverSource).toContain("terminalParent.result");
    expect(resolverSource).toContain('terminalParent.status !== "succeeded"');
    expect(resolverSource).toContain("resolvePlanningShiftTarget(snapshot, {");
    expect(resolverSource).toContain("resolvePlanningSegmentTarget(snapshot, {");
    expect(resizeSource).toContain("const sourceResolution = resolveQueuedServiceEditorRecords({ shift, segments: [segment] })");
    expect(resizeSource.indexOf("resolveQueuedServiceEditorRecords")).toBeLessThan(
      resizeSource.indexOf("const activeSegments ="),
    );
    expect(resizeSource.indexOf("const activeSegments =")).toBeLessThan(
      resizeSource.indexOf("planningMutationQueue.current.enqueue({"),
    );
    expect(resizeSource).toContain('`shift:${optimisticIntent.shift_id}`');
    expect(resizeSource).toContain("shiftAssignments.flatMap(assignment => planningPersonnelShiftResourceKeys(");
    expect(resizeSource).toContain("[sourceShift, ...(optimisticIntent.shifts || [])]");
    expect(resizeSource).toContain("ref: intent._planning_target_refs?.shift");
    expect(resizeSource).toContain("ref: intent._planning_target_refs?.segment");
    expect(resizeSource).toContain("commandId: operation.commandId || pendingKey");
    expect(resizeSource).toContain("shift: optimisticIntent.shifts[0]");
    expect(matrixSource).toContain("taskLaneServiceContinuityKey");
    expect(matrixSource).toContain("key={service.continuityKey}");
    expect(matrixSource).toContain("id: `${service.continuityKey}:end`");
  });

  it("rebased een deletebevestiging na een terminale temp-naar-server-ACK vóór de topologyguard", () => {
    const parentIntent = withPlanningOptimisticIntentIdentity({
      key: "delete-source-parent",
      shift_id: "pending-shift-delete-source",
      shifts: [{
        id: "pending-shift-delete-source",
        revision: 1,
        source_type: "task",
        service_date: "2026-09-01",
        start_time: "06:30",
        end_time: "18:00",
        status: "draft",
      }],
      segments: [{
        id: "pending-segment-delete-source",
        revision: 1,
        shift_id: "pending-shift-delete-source",
        task_occurrence_id: "occurrence-delete-source",
        start_date: "2026-09-01",
        end_date: "2026-09-01",
        start_time: "06:30",
        end_time: "18:00",
        status: "draft",
      }],
      assignments: [],
      occurrences: [],
    }, { originIntentId: "delete-source-parent" });
    const serverShift = {
      ...parentIntent.shifts[0],
      id: "server-shift-delete-source",
      revision: 7,
    };
    const serverSegment = {
      ...parentIntent.segments[0],
      id: "server-segment-delete-source",
      shift_id: serverShift.id,
      revision: 5,
    };
    const resolver = serviceEditorResolver({
      snapshot: {
        shifts: [serverShift],
        segments: [serverSegment],
        assignments: [],
        occurrences: [{ id: "occurrence-delete-source", revision: 4 }],
      },
      terminalStates: new Map([["delete-source-parent", {
        status: "succeeded",
        sequence: 1,
        originalIntent: parentIntent,
        intent: parentIntent,
        result: { shift: serverShift, segment: serverSegment },
      }]]),
    });

    const resolution = resolver({ shift: parentIntent.shifts[0] });
    expect(resolution).toMatchObject({
      status: "ready",
      shift: { id: serverShift.id, revision: 7 },
      parentIntentIds: [],
    });
    expect(resolution.snapshot.segments.filter(item => (
      item.status !== "removed" && String(item.shift_id) === String(resolution.shift.id)
    ))).toEqual([serverSegment]);

    const deleteSource = between("const handleCancelTaskShift", "const planningStats");
    expect(deleteSource.indexOf("resolveQueuedServiceEditorRecords({ shift })")).toBeLessThan(
      deleteSource.indexOf("const targetSegments ="),
    );
    expect(deleteSource).toContain("const sourceShift = sourceResolution.shift");
    expect(deleteSource).toContain("const snapshot = sourceResolution.snapshot");
    expect(deleteSource).toContain("...(sourceResolution.parentIntentIds || [])");
    expect(deleteSource).toContain('`shift:${sourceShift.id}`');
    expect(deleteSource).not.toContain('`shift:${shift.id}`');
  });

  it("rebased een bevroren editorpayload na terminale compose- en assign-ACK naar serverrecords", () => {
    const parentIntent = withPlanningOptimisticIntentIdentity({
      key: "editor-parent",
      shift_id: "temp-shift-editor",
      segment_id: "temp-segment-editor",
      assignment_id: "temp-assignment-editor",
      shifts: [{
        id: "temp-shift-editor",
        revision: 1,
        service_date: "2026-08-24",
        start_time: "06:30",
        end_time: "18:00",
        status: "draft",
      }],
      segments: [{
        id: "temp-segment-editor",
        revision: 1,
        shift_id: "temp-shift-editor",
        task_occurrence_id: "occurrence-editor",
        start_date: "2026-08-24",
        end_date: "2026-08-24",
        start_time: "06:30",
        end_time: "18:00",
        sequence_index: 0,
        status: "draft",
      }],
      assignments: [{
        id: "temp-assignment-editor",
        revision: 1,
        shift_id: "temp-shift-editor",
        planning_shift_id: "temp-shift-editor",
        personnel_id: "person-editor-old",
        slot_index: 0,
        status: "draft",
      }],
      occurrences: [],
    }, { originIntentId: "editor-parent" });
    const result = {
      shift: {
        ...parentIntent.shifts[0],
        id: "server-shift-editor",
        revision: 8,
        service_context_snapshot: { qualification_types: ["beveiliger_2"] },
      },
      segment: {
        ...parentIntent.segments[0],
        id: "server-segment-editor",
        revision: 5,
        shift_id: "server-shift-editor",
        timezone: "Europe/Amsterdam",
        duration_minutes: 690,
      },
      assignment: {
        ...parentIntent.assignments[0],
        id: "server-assignment-editor",
        revision: 4,
        shift_id: "server-shift-editor",
        planning_shift_id: "server-shift-editor",
      },
    };
    const resolver = serviceEditorResolver({
      snapshot: {
        shifts: [result.shift],
        segments: [result.segment],
        assignments: [result.assignment],
        occurrences: [],
      },
      terminalStates: new Map([["editor-parent", {
        status: "succeeded",
        originalIntent: parentIntent,
        intent: parentIntent,
        result,
      }]]),
    });

    expect(resolver({
      shift: parentIntent.shifts[0],
      assignment: parentIntent.assignments[0],
      segments: [parentIntent.segments[0]],
    })).toMatchObject({
      status: "ready",
      shift: { id: "server-shift-editor", revision: 8 },
      assignment: {
        id: "server-assignment-editor",
        revision: 4,
        planning_shift_id: "server-shift-editor",
      },
      segments: [{ id: "server-segment-editor", revision: 5, shift_id: "server-shift-editor" }],
      parentIntentIds: [],
    });
  });

  it("past terminale parents in queuevolgorde toe zonder een nieuwere actieve move terug te draaien", () => {
    const assignIntent = {
      key: "editor-assign-sequence-1",
      shift_id: "server-shift-sequenced",
      assignment_id: "temp-assignment-sequenced",
      shifts: [{
        id: "server-shift-sequenced",
        revision: 7,
        service_date: "2026-08-24",
        start_time: "06:30",
        end_time: "18:00",
        status: "published",
        _planning_origin_intent_id: "editor-assign-sequence-1",
      }],
      assignments: [{
        id: "temp-assignment-sequenced",
        revision: 1,
        shift_id: "server-shift-sequenced",
        planning_shift_id: "server-shift-sequenced",
        personnel_id: "person-sequenced",
        slot_index: 0,
        status: "draft",
        _planning_origin_intent_id: "editor-assign-sequence-1",
      }],
      segments: [],
      occurrences: [],
    };
    const assignedShift = {
      ...assignIntent.shifts[0],
      revision: 8,
      status: "draft",
    };
    const assignedAssignment = {
      ...assignIntent.assignments[0],
      id: "server-assignment-sequenced",
      revision: 2,
    };
    const moveIntent = {
      key: "editor-move-sequence-2",
      shift_id: assignedShift.id,
      shifts: [{
        ...assignedShift,
        end_time: "15:30",
        _planning_origin_intent_id: "editor-move-sequence-2",
      }],
      assignments: [],
      segments: [],
      occurrences: [],
    };
    const movedShift = {
      ...moveIntent.shifts[0],
      revision: 9,
    };
    const frozenAssignment = {
      ...assignIntent.assignments[0],
      _planning_origin_intent_id: "editor-assign-sequence-1",
    };
    const terminalStates = new Map([["editor-assign-sequence-1", {
      status: "succeeded",
      sequence: 1,
      originalIntent: assignIntent,
      intent: assignIntent,
      result: { shift: assignedShift, assignment: assignedAssignment },
    }]]);
    const snapshot = {
      shifts: [movedShift],
      segments: [],
      assignments: [assignedAssignment],
      occurrences: [],
    };

    const whileMoveActive = serviceEditorResolver({
      snapshot,
      terminalStates,
      activeIds: new Set(["editor-move-sequence-2"]),
    })({ shift: moveIntent.shifts[0], assignment: frozenAssignment });
    expect(whileMoveActive).toMatchObject({
      status: "ready",
      shift: { id: movedShift.id, end_time: "15:30" },
      assignment: { id: assignedAssignment.id, revision: 2 },
      parentIntentIds: ["editor-move-sequence-2"],
    });

    terminalStates.set("editor-move-sequence-2", {
      status: "succeeded",
      sequence: 2,
      originalIntent: moveIntent,
      intent: moveIntent,
      result: { shift: movedShift },
    });
    const afterBothAcks = serviceEditorResolver({ snapshot, terminalStates })({
      // Field order deliberately yields move(seq2) before assignment(seq1).
      shift: moveIntent.shifts[0],
      assignment: frozenAssignment,
    });
    expect(afterBothAcks).toMatchObject({
      status: "ready",
      shift: { id: movedShift.id, revision: 9, end_time: "15:30" },
      assignment: { id: assignedAssignment.id, revision: 2 },
      parentIntentIds: [],
    });

    const resolverSource = between(
      "const resolveQueuedServiceEditorRecords",
      "const recoverQueuedPlanningAfterExecutionError",
    );
    expect(resolverSource).toContain("terminalParents.sort((left, right) =>");
    expect(resolverSource).toContain("normalizedLeft - normalizedRight || left.originOrder - right.originOrder");
    expect(resolverSource).toContain(
      'String(planningOriginIntentId(record) || "") !== String(originIntentId)',
    );
  });

  it("schrijft niets bij een mislukte parent of dubbelzinnige assignment-fallback", () => {
    const write = vi.fn();
    const staleShift = {
      id: "temp-shift-blocked",
      service_date: "2026-08-24",
      start_time: "06:30",
      end_time: "18:00",
      _planning_origin_intent_id: "blocked-parent",
    };
    const staleAssignment = {
      id: "temp-assignment-blocked",
      shift_id: staleShift.id,
      planning_shift_id: staleShift.id,
      personnel_id: "person-blocked",
      slot_index: 0,
      status: "draft",
      _planning_origin_intent_id: "blocked-parent",
    };
    const failedResolver = serviceEditorResolver({
      snapshot: { shifts: [], segments: [], assignments: [], occurrences: [] },
      terminalStates: new Map([["blocked-parent", { status: "failed" }]]),
    });
    const failed = failedResolver({ shift: staleShift, assignment: staleAssignment });
    if (failed.status === "ready") write(failed);
    expect(failed).toMatchObject({ status: "blocked", reason: "planning_parent_failed" });

    const serverShift = { ...staleShift, id: "server-shift-blocked" };
    const successfulParent = {
      key: "blocked-parent",
      shifts: [staleShift],
      assignments: [staleAssignment],
      segments: [],
      occurrences: [],
    };
    const ambiguousResolver = serviceEditorResolver({
      snapshot: {
        shifts: [serverShift],
        segments: [],
        assignments: [1, 2].map(index => ({
          id: `server-assignment-duplicate-${index}`,
          shift_id: serverShift.id,
          planning_shift_id: serverShift.id,
          personnel_id: staleAssignment.personnel_id,
          slot_index: 0,
          status: "draft",
        })),
        occurrences: [],
      },
      terminalStates: new Map([["blocked-parent", {
        status: "succeeded",
        originalIntent: successfulParent,
        intent: successfulParent,
        result: { shift: serverShift },
      }]]),
    });
    const ambiguous = ambiguousResolver({ shift: staleShift, assignment: staleAssignment });
    if (ambiguous.status === "ready") write(ambiguous);
    expect(ambiguous).toMatchObject({ status: "blocked", reason: "assignment_ambiguous" });
    expect(write).not.toHaveBeenCalled();
  });

  it("blokkeert onbekende externe diensttijd- of contextwijzigingen vóór een manual move", () => {
    const write = vi.fn();
    const frozenShift = {
      id: "shift-external-manual",
      revision: 7,
      service_date: "2026-08-24",
      end_date: null,
      start_time: "06:30",
      end_time: "18:00",
      service_name_snapshot: "Objectbeveiliging",
      company_id: "company-a",
      object_id: "object-a",
      required_count: 1,
      status: "draft",
    };
    for (const currentShift of [
      { ...frozenShift, revision: 8, end_time: "17:30" },
      { ...frozenShift, revision: 8, company_id: "company-b" },
    ]) {
      const resolver = serviceEditorResolver({
        snapshot: { shifts: [currentShift], segments: [], assignments: [], occurrences: [] },
      });
      const resolution = resolver({ shift: frozenShift });
      if (resolution.status === "ready") write(resolution);
      expect(resolution).toMatchObject({ status: "blocked", reason: "shift_source_changed" });
    }
    expect(write).not.toHaveBeenCalled();
  });

  it("blokkeert externe segmenttijd en volledige multi-segment compositiedrift", () => {
    const write = vi.fn();
    const frozenShift = {
      id: "shift-external-segments",
      revision: 7,
      service_date: "2026-08-24",
      start_time: "06:30",
      end_time: "18:00",
      service_name_snapshot: "Samengestelde dienst",
      task_occurrence_ids: ["occurrence-a", "occurrence-b"],
      task_segment_count: 2,
      required_count: 1,
      status: "draft",
    };
    const frozenSegments = [
      {
        id: "segment-external-a",
        shift_id: frozenShift.id,
        task_occurrence_id: "occurrence-a",
        object_task_definition_id: "task-a",
        sequence_index: 0,
        start_date: "2026-08-24",
        end_date: "2026-08-24",
        start_time: "06:30",
        end_time: "12:00",
        status: "draft",
      },
      {
        id: "segment-external-b",
        shift_id: frozenShift.id,
        task_occurrence_id: "occurrence-b",
        object_task_definition_id: "task-b",
        sequence_index: 1,
        start_date: "2026-08-24",
        end_date: "2026-08-24",
        start_time: "12:00",
        end_time: "18:00",
        status: "draft",
      },
    ];
    const timingResolver = serviceEditorResolver({
      snapshot: {
        shifts: [{ ...frozenShift, revision: 8 }],
        segments: [
          { ...frozenSegments[0], revision: 2, end_time: "11:30" },
          { ...frozenSegments[1], revision: 2 },
        ],
        assignments: [],
        occurrences: [],
      },
    });
    const timingChanged = timingResolver({ shift: frozenShift, segments: frozenSegments });
    if (timingChanged.status === "ready") write(timingChanged);
    expect(timingChanged).toMatchObject({ status: "blocked", reason: "segment_source_changed" });

    const extraSegment = {
      ...frozenSegments[1],
      id: "segment-external-extra",
      task_occurrence_id: "occurrence-c",
      object_task_definition_id: "task-c",
      sequence_index: 2,
      start_time: "18:00",
      end_time: "19:00",
    };
    const compositionResolver = serviceEditorResolver({
      snapshot: {
        shifts: [frozenShift],
        segments: [...frozenSegments, extraSegment],
        assignments: [],
        occurrences: [],
      },
    });
    const compositionChanged = compositionResolver({ shift: frozenShift, segments: frozenSegments });
    if (compositionChanged.status === "ready") write(compositionChanged);
    expect(compositionChanged).toMatchObject({ status: "blocked", reason: "segment_source_changed" });
    expect(write).not.toHaveBeenCalled();
  });

  it("fencet een gedeelde tijdgrens voor beide diensten en alle betrokken medewerkers", () => {
    const boundarySource = between("const resizeTimelineSharedBoundary", "const openOccurrenceStaffing");
    expect(source).toContain("planningPersonnelShiftResourceKeys,");
    expect(boundarySource).toContain("const affectedPersonnelIds = [...new Set(");
    expect(boundarySource).toContain("affectedPersonnelIds.flatMap(personnelId => planningPersonnelShiftResourceKeys(");
    expect(boundarySource).toContain("[left.shift, right.shift, leftShift, rightShift]");
    expect(boundarySource).not.toContain("planningPersonnelDayResourceKeys(");
  });

  it("zet een handmatige diensttijd direct lokaal en schrijft daarna via de gedeelde queue", () => {
    const moveSource = between("const queueManualServiceMove", "const saveServiceEdit");
    const saveSource = between("const saveServiceEdit", "const openTaskComposer");
    const assignmentSource = between("const executeAssignment =", "const handleCandidateAssign");
    const unassignSource = between("const handleUnassign =", "const handleUndo");

    expect(moveSource).toContain("const initialSnapshot = queuedEffectiveSnapshot()");
    expect(moveSource).toContain("planningOriginIntentId(sourceShift)");
    expect(moveSource).toContain("...shiftAssignments.map(planningOriginIntentId)");
    expect(moveSource).toContain("planningMutationQueue.current.enqueue({");
    expect(moveSource).toContain("dependsOn: parentIntentIds");
    expect(moveSource).toContain("shiftAssignments.flatMap(item => planningPersonnelShiftResourceKeys(");
    expect(moveSource).toContain("[sourceShift, optimisticIntent.shifts[0]]");
    expect(moveSource).toContain("const proposedShift = projectPlanningManualMoveShift(sourceShift, startTime, endTime)");
    expect(moveSource).toContain("const snapshot = planningExecutionSnapshotFromCache(");
    expect(moveSource).toContain("planningManualMoveSemanticFingerprint(currentShift.record) !== intent.source_shift_fingerprint");
    expect(moveSource).toContain('throw queuedPlanningRebaseError("shift_source_changed")');
    expect(moveSource).toContain('currentShift.record.status === "cancelled"');
    expect(moveSource).toContain("shift_id: currentShift.record.id");
    expect(moveSource).toContain("end_date: requestedShift.record.end_date || null");
    expect(moveSource).toContain("expected_shift_revision: Number(currentShift.record.revision || 1)");
    expect(moveSource).toContain("reconcilePlanningResultForRange(result, executionRange)");
    expect(moveSource).toContain("rebaseDependentPlanningIntent(intent, executionIntent, result)");
    expect(moveSource).toContain("void operation.catch(() => undefined)");
    expect(saveSource).toContain("const editorResolution = resolveQueuedServiceEditorRecords({");
    expect(saveSource).toContain("const editorAssignment = editorResolution.assignment");
    expect(saveSource).toContain("const editorSegments = editorResolution.segments");
    expect(saveSource).toContain("const queuedMove = queueManualServiceMove({ shift: editorShift, startTime, endTime })");
    expect(saveSource).toContain("const queuedResize = resizeTimelineTaskSegment({");
    expect(saveSource).toContain("if (!queuedResize?.accepted) return");
    expect(saveSource).toContain("currentShift = queuedResize.shift");
    expect(saveSource).toContain("personnelMutationDependencies = [queuedResize.commandId]");
    expect(saveSource).toContain("currentShift = queuedMove.shift");
    expect(saveSource).toContain("personnelMutationDependencies = [queuedMove.commandId]");
    expect(saveSource).toContain("dependsOn: personnelMutationDependencies");
    expect(saveSource).toContain("queuedUnassign.commandId");
    expect(saveSource).not.toContain('action: "move"');
    expect(saveSource).not.toContain("await queueManualServiceMove");
    expect(assignmentSource).toContain("...(Array.isArray(dependsOn) ? dependsOn : [])");
    expect(unassignSource).toContain("planningOriginIntentId(assignment)");
    expect(unassignSource).toContain("planningOriginIntentId(shift)");
    expect(unassignSource).toContain("dependsOn: parentIntentIds");
  });

  it("vergelijkt raw serverdiensten en genormaliseerde UI-diensten op dezelfde canonieke context", () => {
    const rawShift = {
      service_date: "2026-08-24",
      end_date: null,
      start_time: "06:30",
      end_time: "18:00",
      service_name_snapshot: "Objectbeveiliging",
      route_name_snapshot: "Route Noord",
      object_name_snapshot: "Object A",
      customer_name_snapshot: "Klant A",
      service_function_type: "objectbeveiliger",
      company_id: "company-a",
      object_id: "object-a",
      required_count: 1,
      service_context_snapshot: { qualification_types: ["beveiliger_2"] },
      status: "draft",
    };
    const normalizedUiShift = {
      ...rawShift,
      name: rawShift.service_name_snapshot,
      route_name: rawShift.route_name_snapshot,
      object_name: rawShift.object_name_snapshot,
      customer_name: rawShift.customer_name_snapshot,
      function_type: rawShift.service_function_type,
    };

    expect(planningManualMoveSemanticFingerprint(normalizedUiShift)).toBe(
      planningManualMoveSemanticFingerprint(rawShift),
    );
    expect(planningManualMoveSemanticFingerprint({
      ...normalizedUiShift,
      service_context_snapshot: { qualification_types: ["coordinator"] },
    })).not.toBe(planningManualMoveSemanticFingerprint(rawShift));
    expect(planningManualMoveSemanticFingerprint({
      ...normalizedUiShift,
      end_time: "17:30",
    })).not.toBe(planningManualMoveSemanticFingerprint(rawShift));
  });

  it("laat een technische published-naar-draft parent-ACK door zonder tijd of context te versoepelen", () => {
    const published = {
      service_date: "2026-08-24",
      end_date: null,
      start_time: "06:30",
      end_time: "18:00",
      service_name_snapshot: "Objectbeveiliging",
      company_id: "company-a",
      object_id: "object-a",
      status: "published",
      revision: 7,
    };
    const parentAcknowledgedDraft = { ...published, status: "draft", revision: 8 };

    expect(planningManualMoveSemanticFingerprint(parentAcknowledgedDraft)).toBe(
      planningManualMoveSemanticFingerprint(published),
    );
    expect(planningManualMoveSemanticFingerprint({
      ...parentAcknowledgedDraft,
      company_id: "company-b",
    })).not.toBe(planningManualMoveSemanticFingerprint(published));
  });

  it("projecteert dag- en nachtdiensten met een expliciete passende einddatum", () => {
    const overnight = projectPlanningManualMoveShift({
      service_date: "2026-08-30",
      end_date: null,
      start_time: "06:30",
      end_time: "18:00",
    }, "20:00", "06:00");
    expect(overnight).toMatchObject({
      service_date: "2026-08-30",
      end_date: "2026-08-31",
      start_time: "20:00",
      end_time: "06:00",
      _optimistic_pending: true,
    });

    expect(projectPlanningManualMoveShift(overnight, "06:30", "15:30")).toMatchObject({
      service_date: "2026-08-30",
      end_date: null,
      start_time: "06:30",
      end_time: "15:30",
    });
  });

  it("bevestigt een drop direct en toont de late compose-ACK alleen bij nieuwe waarschuwingen", () => {
    const sliceSource = between("const composeAndAssignOccurrenceSlice", "const saveTaskEdit");
    const matrixFunctionSource = between("const composeAndAssignOccurrence =", "const openOccurrenceStaffing");
    const finishSource = between("const finishTimelineAssignment", "const composeAndAssignOccurrenceSlice");

    for (const composeSource of [sliceSource, matrixFunctionSource]) {
      expect(composeSource).toContain("notifyOptimisticTimelineAssignment(occurrence, personnelItem, immediateWarnings)");
      expect(composeSource).toContain("optimisticWarnings: immediateWarnings");
      expect(composeSource.indexOf("planningMutationQueue.current.enqueue({")).toBeLessThan(
        composeSource.indexOf("notifyOptimisticTimelineAssignment(occurrence, personnelItem, immediateWarnings)"),
      );
      expect(composeSource.indexOf("notifyOptimisticTimelineAssignment(occurrence, personnelItem, immediateWarnings)")).toBeLessThan(
        composeSource.lastIndexOf("return operation"),
      );
      expect(composeSource).not.toContain('title: "Aansluitende tijd samengevoegd"');
    }

    expect(source).not.toContain('title: "Dienst gemaakt en ingepland"');
    expect(finishSource).toContain("optimisticWarnings == null || newlyReportedWarnings.length > 0");
    expect(finishSource).toContain('optimisticWarnings != null\n          ? "Inzetcontrole bijgewerkt"');
  });
});
