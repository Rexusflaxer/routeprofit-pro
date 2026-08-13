function records(value) {
  return Array.isArray(value) ? value.filter(item => item?.id != null) : [];
}

function unresolvedBoundaryState(occurrence) {
  const state = occurrence?.metadata?.shared_boundary_mutation;
  return state && state.phase !== "completed" ? state : null;
}

function applyEffectiveRecord(map, snapshot) {
  if (!snapshot?.id) return;
  const current = map.get(String(snapshot.id)) || {};
  map.set(String(snapshot.id), {
    ...current,
    ...snapshot,
    revision: current.revision ?? snapshot.revision,
    metadata: current.metadata ?? snapshot.metadata ?? null,
  });
}

/**
 * Base44 cannot atomically update four business rows. While the durable
 * boundary journal is being rolled forward, project one complete logical
 * state: the old boundary before the occurrence commit point, or the target
 * boundary after it. The matrix therefore never renders a mixed raw gap.
 */
export function resolveEffectiveSharedBoundaryPlanning({
  occurrences = [],
  shifts = [],
  segments = [],
  assignments = [],
} = {}) {
  const shiftMap = new Map(records(shifts).map(item => [String(item.id), item]));
  const segmentMap = new Map(records(segments).map(item => [String(item.id), item]));
  const assignmentMap = new Map(records(assignments).map(item => [String(item.id), item]));
  const pendingResourceKeys = new Set();
  const pendingOccurrenceIds = [];

  records(occurrences).forEach(occurrence => {
    const state = unresolvedBoundaryState(occurrence);
    if (!state) return;
    const effectiveState = state.effective_view === "target"
      ? state.target_state
      : state.before_state;
    pendingOccurrenceIds.push(String(occurrence.id));
    pendingResourceKeys.add(`occurrence:${occurrence.id}`);
    records(effectiveState?.shifts).forEach(item => {
      applyEffectiveRecord(shiftMap, item);
      pendingResourceKeys.add(`shift:${item.id}`);
    });
    records(effectiveState?.segments).forEach(item => applyEffectiveRecord(segmentMap, item));
    records(effectiveState?.assignments).forEach(item => {
      applyEffectiveRecord(assignmentMap, item);
      if (item.personnel_id) pendingResourceKeys.add(`personnel:${item.personnel_id}`);
    });
  });

  return {
    occurrences: records(occurrences),
    shifts: [...shiftMap.values()],
    segments: [...segmentMap.values()],
    assignments: [...assignmentMap.values()],
    pendingResourceKeys,
    pendingOccurrenceIds,
  };
}

export function getSharedBoundaryRepairRetryDelay(
  repairs,
  { now = Date.now(), fallbackMs = 5_000, graceMs = 250, maxMs = 125_000 } = {},
) {
  const retryTimes = (Array.isArray(repairs) ? repairs : [])
    .map(item => Date.parse(item?.retry_after || ""))
    .filter(Number.isFinite);
  if (!retryTimes.length) return Math.max(graceMs, fallbackMs);
  const delay = Math.min(...retryTimes) - Number(now) + graceMs;
  return Math.max(graceMs, Math.min(maxMs, delay));
}

export const planningRecoveryDomainInternals = {
  applyEffectiveRecord,
  unresolvedBoundaryState,
};
