import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  planningOriginIntentId,
  planningRecordReference,
  rebaseDependentPlanningIntent,
  resolvePlanningAssignmentTarget,
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
    expect(sliceSource).toContain("snapshot: planningExecutionSnapshotFromCache(");
    expect(matrixFunctionSource).toContain("snapshot: planningExecutionSnapshotFromCache(");
    expect(assignmentSource).toContain("const snapshot = planningExecutionSnapshotFromCache(");
    expect(sliceSource).toContain("const executionRange = Object.freeze({ periodStart, periodEnd })");
    expect(matrixFunctionSource).toContain("const executionRange = Object.freeze({ periodStart, periodEnd })");
    expect(assignmentSource).toContain("const executionRange = Object.freeze({ periodStart, periodEnd })");
    expect(assignmentSource).toContain("resolveQueuedShiftAssignment");
    expect(source).toContain("personnelDayQueueResourceKeys(personnelItem.id");
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
    expect(source).toContain("saveDraftDisabled={runActionMutation.isPending || pendingResourceKeys.size > 0 || draftSavePending || Boolean(pendingEligibilityDrop)}");
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
    expect(source).toContain("intents: [...pendingMatrixChanges, ...(planningQueueState.intents || [])]");
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
