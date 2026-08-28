import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "src/pages/Planning.jsx"), "utf8");

function between(start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

describe("directe planningwaarschuwingen en vervolgacties", () => {
  it("warmt zichtbare combinaties vooraf op en leest bij hover uitsluitend de lokale index", () => {
    expect(source).toContain("createPlanningEligibilityIndex({");
    expect(source).toContain('action: "prefetch_assignment_eligibility"');
    expect(source).toContain("eligibilityIndex.prewarm(backgroundEligibilityCandidates");
    expect(source).toContain("onBeforeDragStart={handleBeforeDragStart}");
    expect(source).toContain("onDragUpdate={handleDragUpdate}");
    expect(source).toContain("data-planning-drag-eligibility={verdict.status}");

    const dragUpdate = between("const handleDragUpdate", "const processPlanningDrop");
    expect(dragUpdate).toContain("resolveDropEligibilityPreview(drop)");
    expect(dragUpdate).toContain("requestUrgentEligibilityCandidates([preview.eligibilityCandidate])");
    expect(dragUpdate).not.toContain("await ");
    expect(dragUpdate).not.toContain("invokePlanningApi");
    expect(source).toContain("const liveDragEligibilityPreview = dragEligibilityPreview?.drop");
    expect(source).toContain("resolveDropEligibilityPreview(dragEligibilityPreview.drop)");
    expect(source).toContain("setEligibilityFreshnessTick(value => value + 1)");
  });

  it("persistenteert bekende dragwaarschuwingen meteen op de optimistische assignment", () => {
    const dropSource = between("const processPlanningDrop", "const handleDragEnd");
    expect(dropSource).toContain("requireCurrentEligibilityVerdict(preview)");
    expect(dropSource).toContain("const candidateWarnings = preview?.verdict?.warnings || null");
    expect(dropSource).toContain("candidateWarnings,");
    expect(dropSource).toContain("executeAssignment(shift, personnelItem, drop.slotIndex, candidateWarnings)");
    expect(dropSource).toContain("composeAndAssignOccurrence(occurrence, personnelItem, dropServiceDate, candidateWarnings)");
  });

  it("plant nooit definitief in voordat de volledige voorcontrole actueel is", () => {
    const guardSource = between("const requireCurrentEligibilityVerdict", "const processPlanningDrop");
    const candidateSource = between("const handleCandidateAssign", "const handleUnassign");

    expect(guardSource).toContain('preview?.verdict?.status === "ready"');
    expect(guardSource).toContain("requestUrgentEligibilityCandidates([preview.eligibilityCandidate])");
    expect(guardSource).toContain("De medewerker is nog niet ingepland");
    expect(candidateSource).toContain('candidate?.eligibilityStatus !== "ready"');
    expect(candidateSource).toContain("return Promise.resolve(null)");
  });

  it("ververst zowel op serverexpiry als op het eerste verouderingsmoment van lokale brondata", () => {
    expect(source).toContain("PLANNING_ELIGIBILITY_MAX_AGE_MS");
    expect(source).toContain("const dependencyDeadlines = Object.values(eligibilityDependencies)");
    expect(source).toContain("Number(item?.dataUpdatedAt || 0) + PLANNING_ELIGIBILITY_MAX_AGE_MS");
    expect(source).toContain("refetchEligibilityDependencies");
    expect(source).toContain('queryClient.refetchQueries({ queryKey: ["personnel-contracts"]');
    expect(source).toContain("eligibilityFreshnessTick,");
  });

  it("controleert dezelfde medewerker op de samengevoegde dienst in plaats van op het losse open restant", () => {
    const previewSource = between("const resolveDropEligibilityPreview", "const handleBeforeDragStart");
    expect(previewSource).toContain("resolveOpenShiftSamePersonnelMerge({");
    expect(previewSource).toContain("mergedSegment.start_time");
    expect(previewSource).toContain("mergedSegment.end_time");
    expect(previewSource).toContain("excludeAssignmentId:");
    expect(previewSource).toContain("adjacentMerge.candidate.assignment.id");
  });

  it("projecteert occurrence-gaps voor hover en prefetch met exact dezelfde union-resolver als de drop", () => {
    const projectionSource = between("function resolveOccurrenceEligibilityProjection", "function normalizePlanningShift");
    const previewSource = between("const resolveDropEligibilityPreview", "const handleBeforeDragStart");
    const prefetchSource = between("const buildEligibilityPrefetchCandidates", "const backgroundEligibilityCandidates");

    expect(projectionSource).toContain("resolveQueuedOccurrenceMutation({");
    expect(projectionSource).toContain("allowOptimisticAdjacent: true");
    expect(projectionSource).toContain('resolution.kind === "merge"');
    expect(projectionSource).toContain("resolution.adjacent.candidate.mergedSegment");
    expect(projectionSource).toContain("resolution.adjacent.candidate.assignment.id");
    expect(previewSource).toContain("resolveOccurrenceEligibilityProjection({");
    expect(previewSource).toContain("verdict: eligibilityIndex.queryShift({");
    expect(previewSource).toContain("excludeAssignmentId: occurrenceProjection.excludeAssignmentId");
    expect(prefetchSource).toContain("resolveOccurrenceEligibilityProjection({");
    expect(prefetchSource).toContain("shift: candidateShift");
    expect(prefetchSource).toContain("const excludeAssignmentId = occurrenceProjection?.excludeAssignmentId");
    expect(prefetchSource).toContain("buildPlanningEligibilityPrefetchCandidate({");
    expect(prefetchSource).toContain("excludeAssignmentId,");
  });

  it("batcht nooit alleen op 48 records en projecteert open-dienst-unions per medewerker", () => {
    const requestSource = between("const requestEligibilityPrefetch", "const requestUrgentEligibilityCandidates");
    const prefetchSource = between("const buildEligibilityPrefetchCandidates", "const backgroundEligibilityCandidates");

    expect(requestSource).toContain("batchPlanningEligibilityCandidates(candidates)");
    expect(prefetchSource).toContain("resolveOpenShiftSamePersonnelMerge({");
    expect(prefetchSource).toContain("openShiftMerge.candidate.mergedSegment.start_time");
    expect(prefetchSource).toContain("openShiftMerge.candidate.assignment.id");
    expect(prefetchSource).toContain("openShiftMerge.candidate.shift");
  });

  it("geeft planningwrites voorrang op bulk-prefetch maar laat de exacte dragcontrole urgent door", () => {
    const requestSource = between("const requestEligibilityPrefetch", "const requestUrgentEligibilityCandidates");
    const queuedWriteSource = between("const runQueuedIntentMutation", "const queuedEffectiveSnapshot");
    const backgroundEffect = between(
      "const generation = eligibilityBackgroundPrefetchGenerationRef.current + 1",
      "const candidates = useMemo",
    );

    expect(requestSource).toContain('priority = "background"');
    expect(requestSource).toContain("planningMutationQueue.current.getSnapshot().isIdle");
    expect(requestSource).toContain("!planningResizeGestureActiveRef.current");
    expect(requestSource).toContain("hasCurrentBackgroundBatch()");
    expect(requestSource).toContain("trackBackgroundBatch(request)");
    expect(requestSource).toContain('if (priority === "background") await worker()');
    expect(source).toContain('priority: "urgent"');
    expect(source).toContain('window.addEventListener("pointerdown", handlePointerDown, true)');
    expect(backgroundEffect).toContain("if (!planningQueueState.isIdle || planningResizeGestureActive) return undefined");
    expect(backgroundEffect.indexOf("if (!planningQueueState.isIdle || planningResizeGestureActive) return undefined")).toBeLessThan(
      backgroundEffect.indexOf("setEligibilityServerDecisions([])"),
    );
    expect(backgroundEffect).toContain('priority: "background"');
    expect(backgroundEffect).toContain("planningQueueState.isIdle,");
    expect(backgroundEffect).toContain("planningResizeGestureActive,");
    expect(queuedWriteSource).toContain("waitForCurrentBackgroundBatch()");
    expect(queuedWriteSource.indexOf("waitForCurrentBackgroundBatch()")).toBeLessThan(
      queuedWriteSource.indexOf("invokePlanningApi(request)"),
    );
  });

  it("toont een medewerker alleen groen wanneer ook de servervoorcontrole actueel is", () => {
    const candidateSource = between("const candidates = useMemo", "const handleActionMutationError");
    const employeePanel = fs.readFileSync(
      path.join(root, "src/components/planning/PlanningEmployeePanel.jsx"),
      "utf8",
    );

    expect(candidateSource).toContain("eligibilityStatus: eligibilityVerdict.status");
    expect(employeePanel).toContain('const eligibilityReady = candidate.eligibilityStatus === "ready"');
    expect(employeePanel).toContain("selectedShift && !eligibilityReady");
    expect(employeePanel).toContain("controle voorbereiden");
    expect(employeePanel).toContain("voorcontrole actueel");
    expect(employeePanel).not.toContain("> passend<");
  });

  it("laadt personeelsbewijzen alleen voor actieve medewerkers in plaats van de volledige organisatiehistorie", () => {
    expect(source).toContain("filterEntityRecordsForPersonnelIds(");
    expect(source).toContain('queryKey: ["personnel-qualifications", eligibilityPersonnelScopeKey]');
    expect(source).toContain('queryKey: ["personnel-absences", eligibilityPersonnelScopeKey, planningContextStart, planningContextEnd]');
    expect(source).toContain('{ status: { $in: ["requested", "approved", "active"] } }');
    expect(source).not.toContain("listAllEntityRecords(base44.entities.PersonnelQualification)");
    expect(source).not.toContain("listAllEntityRecords(base44.entities.PersonnelAbsence)");
    expect(source).not.toContain("listAllEntityRecords(base44.entities.PersonnelSecurityPass)");
    expect(source).not.toContain("listAllEntityRecords(base44.entities.PersonnelRestriction)");
    expect(source).not.toContain("listAllEntityRecords(base44.entities.PersonnelContract)");
  });

  it("laat een gekopieerde taak ook op een objectdag met andere planning plakken", () => {
    const matrix = fs.readFileSync(
      path.join(root, "src/components/planning/PlanningMatrix.jsx"),
      "utf8",
    );
    expect(matrix).toContain('label="Taak hier plakken"');
    expect(matrix).toContain('available={editable && resource.kind === "object"}');
    expect(matrix).not.toContain('available={editable && resource.kind === "object" && cellItems.length === 0}');
  });

  it("maakt resize, uitplannen, grenswijziging en verwijderen queuebaar zonder queued hard lock", () => {
    const protectionSource = between("const runProtectedPlanningAction", "const pendingBoundaryRecoveryKey");
    expect(protectionSource).toContain("allowQueued = false");
    expect(protectionSource).toContain("allowQueued ? matrixPendingResourceKeys : protectedPlanningResourceKeys");
    expect(source).toContain('action: "resize_task_shift_preserving_coverage"');
    expect(source).toContain('action: "vacate_task_shift_partition"');
    expect(source).toContain('kind: "assign_and_merge_task_shift_partition"');
    expect(source).toContain("{ allowQueued: true }");
  });
});
