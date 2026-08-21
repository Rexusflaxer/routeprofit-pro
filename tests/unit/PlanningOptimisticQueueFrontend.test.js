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
    expect(assignmentSource).toContain("snapshot: planningExecutionSnapshotFromCache(");
    expect(sliceSource).toContain("const executionRange = Object.freeze({ periodStart, periodEnd })");
    expect(matrixFunctionSource).toContain("const executionRange = Object.freeze({ periodStart, periodEnd })");
    expect(assignmentSource).toContain("const executionRange = Object.freeze({ periodStart, periodEnd })");
    expect(assignmentSource).toContain("resolveQueuedShiftAssignment");
    expect(source).toContain("personnelDayQueueResourceKeys(personnelItem.id");
  });

  it("reconcilet vóór rollback-cleanup en schermt opslaan/publiceren af tot de queue leeg is", () => {
    const publishSource = between("const publishMutation", "const changePeriod");
    expect(source).toContain("reconcilePlanningResultForRange(result, executionRange, { replaceShiftSegments })");
    expect(source).toContain("onCallbackError: context => recoverQueuedPlanningAfterCallbackError");
    expect(queueSource.indexOf("await safeCallback(entry.onSuccess, result)")).toBeLessThan(
      queueSource.indexOf("await safeCallback(entry.onSettled"),
    );
    expect(source).toContain("await planningMutationQueue.current.drain()");
    expect(source).toContain("const saveDraft = async () =>");
    expect(source).toContain("await settlePlanningDropEnqueues()");
    expect(source).not.toContain("authoritativePlanningRef");
    expect(source).toContain("saveDraftDisabled={runActionMutation.isPending || pendingResourceKeys.size > 0 || draftSavePending}");
    expect(source).toContain("mutationPending={publishMutation.isPending || draftSavePending}");
    expect(source).toContain("publishDisabled={draftSavePending || planningQueueState.pendingCount > 0");
    expect(source).toContain("const postDrainSnapshot = planningExecutionSnapshotFromCache(");
    expect(source).toContain("buildPlanningPublicationSnapshot({");
    expect(source).not.toContain("shift_ids: ownedShiftsInRange.map");
    expect(source).not.toContain("planningCommitFenceRef.current = true");
    expect(publishSource.indexOf("await settlePlanningDropEnqueues()")).toBeLessThan(
      publishSource.indexOf("planningCommitFenceRef.current = commitToken"),
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
});
