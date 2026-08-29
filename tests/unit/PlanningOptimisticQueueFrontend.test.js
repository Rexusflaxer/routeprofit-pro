import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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

function between(start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
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

    expect(queueSource).toContain("intent: entry.intent");
    expect(queueSource).toContain("originalIntent: entry.originalIntent");
    expect(resizeSource).toContain("planningMutationQueue.current.getTerminalState(parentIntentId)");
    expect(resizeSource).toContain("rebaseDependentPlanningIntent(");
    expect(resizeSource).toContain("terminalParent.originalIntent || terminalParent.intent");
    expect(resizeSource).toContain("terminalParent.result");
    expect(resizeSource).toContain("const terminalTargets = [");
    expect(resizeSource).toContain('terminalTargets.some(target => target.status !== "ready")');
    expect(resizeSource).toContain("Er is geen tweede planningactie verstuurd");
    expect(resizeSource.indexOf('terminalParent.status !== "succeeded"')).toBeLessThan(
      resizeSource.indexOf("planningMutationQueue.current.enqueue({"),
    );
    expect(resizeSource.indexOf('terminalTargets.some(target => target.status !== "ready")')).toBeLessThan(
      resizeSource.indexOf("planningMutationQueue.current.enqueue({"),
    );
    expect(resizeSource).toContain('`shift:${optimisticIntent.shift_id}`');
    expect(resizeSource).toContain("ref: intent._planning_target_refs?.shift");
    expect(resizeSource).toContain("ref: intent._planning_target_refs?.segment");
    expect(matrixSource).toContain("taskLaneServiceContinuityKey");
    expect(matrixSource).toContain("key={service.continuityKey}");
    expect(matrixSource).toContain("id: `${service.continuityKey}:end`");
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
