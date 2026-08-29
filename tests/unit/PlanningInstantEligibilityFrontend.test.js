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

    const dragUpdate = between("const handleDragUpdate", "const processPlanningDrop = (");
    expect(dragUpdate).toContain("resolveDropEligibilityPreview(drop)");
    expect(dragUpdate).not.toContain("requestUrgentEligibilityCandidates");
    expect(dragUpdate).not.toContain("await ");
    expect(dragUpdate).not.toContain("invokePlanningApi");
    expect(source).toContain("PLANNING_ELIGIBILITY_HOVER_DELAY_MS");
    expect(source).toContain("requestUrgentEligibilityCandidates([dragEligibilityPreview.eligibilityCandidate])");
    expect(source).toContain("const liveDragEligibilityPreview = dragEligibilityPreview?.drop");
    expect(source).toContain("resolveDropEligibilityPreview(dragEligibilityPreview.drop)");
    expect(source).toContain("setEligibilityFreshnessTick(value => value + 1)");
  });

  it("persistenteert bekende dragwaarschuwingen meteen op de optimistische assignment", () => {
    const dropSource = between("const processPlanningDrop", "const handleDragEnd");
    expect(dropSource).toContain('preview?.verdict?.status !== "ready"');
    expect(dropSource).toContain("holdPlanningDropForEligibility(result, preview)");
    expect(dropSource).toContain("const candidateWarnings = preview?.verdict?.warnings || null");
    expect(dropSource).toContain("candidateWarnings,");
    expect(dropSource).toContain("executeAssignment(shift, personnelItem, drop.slotIndex, candidateWarnings)");
    expect(dropSource).toContain("composeAndAssignOccurrence(occurrence, personnelItem, dropServiceDate, candidateWarnings)");
  });

  it("plant nooit definitief in voordat de volledige voorcontrole actueel is", () => {
    const guardSource = between("const clearPendingEligibilityDrop", "const handleDragEnd");
    const pendingSource = between(
      "const pending = pendingEligibilityDrop",
      "const handleShiftActionConfirm",
    );
    const readyResumeSource = pendingSource.slice(
      pendingSource.indexOf('if (resolution.status === "ready")'),
      pendingSource.indexOf('} else if (resolution.status === "warnings_changed")'),
    );
    const candidateSource = between("const handleCandidateAssign", "const handleUnassign");

    expect(guardSource).toContain('preview?.verdict?.status !== "ready"');
    expect(guardSource).toContain("createPendingPlanningEligibilityDrop({ result, preview })");
    expect(guardSource).toContain("u hoeft de medewerker niet opnieuw te slepen");
    expect(pendingSource).toContain("resolvePendingPlanningEligibilityDrop({");
    expect(pendingSource).toContain("recordPendingPlanningEligibilityAttempt");
    expect(pendingSource).toContain('resolution.status === "warnings_changed"');
    expect(pendingSource).toContain("processPlanningDropRef.current?.(pending.result, preview, { allowDeferred: false })");
    expect(pendingSource).not.toContain("processPlanningDropRef.current?.(pending.result, null");
    expect(readyResumeSource).not.toContain("setTimeout");
    expect(candidateSource).toContain('candidate?.eligibilityStatus !== "ready"');
    expect(candidateSource).toContain("return Promise.resolve(null)");
  });

  it("ververst zowel op serverexpiry als op het eerste verouderingsmoment van lokale brondata", () => {
    expect(source).toContain("PLANNING_ELIGIBILITY_MAX_AGE_MS");
    expect(source).toContain("const dependencyDeadlines = Object.values(eligibilityDependencies)");
    expect(source).toContain("Number(item?.dataUpdatedAt || 0) + PLANNING_ELIGIBILITY_MAX_AGE_MS");
    expect(source).toContain("refetchEligibilityDependencies");
    expect(source).toContain("planningEligibilityDependencyRetryDelay({");
    expect(source).toContain("failureCount >= maxConsecutiveFailures");
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
    const requestSource = between("const requestEligibilityPrefetch", "const requestUrgentEligibilityCandidates = useCallback");
    const prefetchSource = between("const buildEligibilityPrefetchCandidates", "const backgroundEligibilityCandidates");

    expect(requestSource).toContain("batchPlanningEligibilityCandidates(candidates)");
    expect(prefetchSource).toContain("resolveOpenShiftSamePersonnelMerge({");
    expect(prefetchSource).toContain("openShiftMerge.candidate.mergedSegment.start_time");
    expect(prefetchSource).toContain("openShiftMerge.candidate.assignment.id");
    expect(prefetchSource).toContain("openShiftMerge.candidate.shift");
  });

  it("geeft planningwrites voorrang op bulk-prefetch maar laat de exacte dragcontrole urgent door", () => {
    const requestSource = between("const requestEligibilityPrefetch", "const requestUrgentEligibilityCandidates = useCallback");
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
    expect(backgroundEffect).toContain("|| eligibilityDependencyRefreshActive");
    expect(backgroundEffect).not.toContain("setEligibilityServerDecisions([])");
    expect(requestSource).toContain("mergePlanningEligibilityServerDecisions(current, results)");
    expect(backgroundEffect).toContain('priority: "background"');
    expect(backgroundEffect).toContain("planningQueueState.isIdle,");
    expect(backgroundEffect).toContain("planningDragGestureActive,");
    expect(backgroundEffect).toContain("planningResizeGestureActive,");
    expect(queuedWriteSource).not.toContain("waitForCurrentBackgroundBatch()");
    expect(queuedWriteSource).toContain("can never be an");
    expect(queuedWriteSource).toContain("return invokePlanningApi(request)");
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

  it("houdt de planningboom stabiel tijdens delete naar directe medewerkerdrop", () => {
    const dragSource = between("const beginPlanningDragInteraction", "const bootstrapMutation");
    const deleteSource = between("const handleCancelTaskShift", "const planningStats");
    const bannerSource = between("data-planning-drag-eligibility={verdict.status}", "<DragDropContext");

    expect(dragSource).toContain("refreshScheduler.current");
    expect(dragSource).toContain("scheduler?.pause?.()");
    expect(dragSource).toContain('{ queryKey: ["planning-shifts"] }');
    expect(dragSource).toContain("planningQueryFilters.some(filter => queryClient.isFetching(filter) > 0)");
    expect(dragSource).toContain("eligibilityQueryFilters.some(filter => queryClient.isFetching(filter) > 0)");
    expect(dragSource).toContain("[...planningQueryFilters, ...eligibilityQueryFilters]");
    expect(dragSource).toContain("includeEligibility: eligibilityQueryWasFetching");
    expect(dragSource).toContain("await lifecycle.scheduler?.flush?.()");
    expect(dragSource).toContain("beginEligibilityDependencyRefresh()");
    expect(source).toContain("await planningDragLifecycleRef.current.promise");
    expect(source).toContain("const recoverQueuedPlanningAfterExecutionError = async");
    expect(source).toContain("const recoverQueuedPlanningAfterCallbackError = async");
    expect(source).toContain("setDragPersonnelOrder(candidates.map(candidate => String(candidate.personnel.id)))");
    expect(source).toContain("Starting another gesture is an explicit replacement of any drop");
    expect(source).toContain("A new explicit assignment supersedes an older held drop");
    expect(source).toContain("candidates: displayedCandidates");
    expect(deleteSource).toContain("onSuccess: async result =>");
    expect(deleteSource.indexOf("await waitForPlanningDragRelease()")).toBeLessThan(
      deleteSource.indexOf("reconcilePlanningResultForRange(result, executionRange)"),
    );
    expect(bannerSource).toContain("pointer-events-none fixed");
    expect(bannerSource).not.toContain("className={`flex shrink-0");
  });

  it("koelt een mislukte hover af en bewaakt een vastgehouden drop tot zijn harde eindtijd", () => {
    const urgentSource = between(
      "const requestUrgentEligibilityCandidates = useCallback",
      "requestUrgentEligibilityCandidatesRef.current = requestUrgentEligibilityCandidates",
    );
    const pendingSource = between(
      "if (!pendingEligibilityDrop) return undefined",
      "const handleShiftActionConfirm",
    );

    expect(urgentSource).toContain("selectPlanningEligibilityRequestCandidates({");
    expect(urgentSource).toContain("forceRetry,");
    expect(urgentSource).toContain("return selection.status");
    expect(urgentSource).toContain("const releaseUrgentSlot = requestGate.acquire()");
    expect(urgentSource).toContain("eligibilityHeldDropRequestGateRef.current");
    expect(urgentSource).toContain("const requestGate = forceRetry");
    expect(urgentSource).toContain('if (!releaseUrgentSlot) return "pending"');
    expect(urgentSource).toContain("releaseUrgentSlot()");
    expect(urgentSource).toContain("setEligibilityFreshnessTick(value => value + 1)");
    expect(pendingSource).toContain("forceRetry: true,");
    expect(pendingSource).toContain('outcome === "started"');
    expect(pendingSource).toContain("Math.min(500, remainingMs)");
    expect(pendingSource).toContain("refetchEligibilityDependencies({ maxConsecutiveFailures: 2 })");
  });

  it("annuleert een vastgehouden drop zichtbaar vóór navigatie of een periodewissel", () => {
    const navigationGuard = between(
      "const cancelHeldPlanningDrop = useCallback",
      "const beginEligibilityDependencyRefresh",
    );
    const navigationEffect = between(
      "const cancelBeforeInternalNavigation",
      "useEffect(() => {\n    let endTimer",
    );
    const periodSource = between("const changePeriod", "const isLoading");

    expect(navigationGuard).toContain("pendingEligibilityDropRef.current = null");
    expect(navigationGuard).toContain('toast({ title: "Sleepactie geannuleerd"');
    expect(navigationEffect).toContain('document.addEventListener("click", cancelBeforeInternalNavigation, true)');
    expect(source).toContain("cancelHeldPlanningDrop(undefined, { updateState: false })");
    expect(source).toContain("browsergeschiedenis werd gewijzigd");
    expect(periodSource).toContain("cancelHeldPlanningDrop(");
    expect(source).toContain('onViewChange={nextView => {\n          cancelHeldPlanningDrop(');
    expect(source).toContain('onPeriodChange={periodId => {\n          cancelHeldPlanningDrop(');
  });

  it("fencet opslaan en publiceren zolang een gecontroleerde drop nog vaststaat", () => {
    const saveSource = between("const saveDraft", "const publishMutation");
    const publishSource = between("const publishMutation", "const changePeriod");

    expect(saveSource).toContain("assertNoPendingEligibilityDrop()");
    expect(publishSource).toContain("assertNoPendingEligibilityDrop()");
    expect(source).toContain("saveDraftDisabled={runActionMutation.isPending || pendingResourceKeys.size > 0 || draftSavePending || Boolean(pendingEligibilityDrop)}");
    expect(source).toContain("publishDisabled={draftSavePending || Boolean(pendingEligibilityDrop)");
    expect(source).toContain('window.addEventListener("beforeunload", protectPendingDrop)');
  });
});
