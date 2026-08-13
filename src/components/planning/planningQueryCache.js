function records(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function resultRecords(result, pluralKey, singularKey) {
  const plural = records(result?.[pluralKey]);
  if (plural.length > 0) return plural;
  return result?.[singularKey] ? [result[singularKey]] : [];
}

function upsertById(current, incoming) {
  const next = new Map(records(current).map(item => [String(item.id), item]));
  records(incoming).forEach(item => {
    if (item?.id == null) return;
    next.set(String(item.id), { ...(next.get(String(item.id)) || {}), ...item });
  });
  return [...next.values()];
}

function markRemoved(current, ids) {
  const removed = new Set(records(ids).map(String));
  if (removed.size === 0) return records(current);
  return records(current).map(item => (
    removed.has(String(item.id)) ? { ...item, status: "removed" } : item
  ));
}

function recordIds(items) {
  return new Set(records(items).map(item => String(item?.id || "")).filter(Boolean));
}

function updateExistingRecords(current, incoming) {
  const incomingById = new Map(records(incoming).map(item => [String(item.id), item]));
  return records(current).map(item => {
    const next = incomingById.get(String(item.id));
    return next ? { ...item, ...next } : item;
  });
}

function updateRelevantPlanningQueries(queryClient, {
  family,
  currentKey,
  incoming = [],
  removedIds = [],
  relevantShiftIds = new Set(),
  replaceShiftSegments = false,
} = {}) {
  const matches = queryClient.getQueriesData({ queryKey: [family] });
  const removedIdSet = new Set(records(removedIds).map(String));
  matches.forEach(([queryKey, current]) => {
    const isLegacy = queryKey.length === 1;
    const isCurrent = isLegacy || (
      String(queryKey[1] || "") === String(currentKey[1] || "")
      && String(queryKey[2] || "") === String(currentKey[2] || "")
    );
    const scopedShiftIds = String(queryKey[3] || "")
      .split("|")
      .map(String)
      .filter(Boolean);
    const cachedShiftIds = new Set([
      ...scopedShiftIds,
      ...records(current).map(item => String(
        item.shift_id || item.planning_shift_id || (family === "planning-shifts" ? item.id : "") || "",
      )),
    ]);
    const intersectsRelevantShift = [...relevantShiftIds].some(id => cachedShiftIds.has(id));
    const containsRemovedRecord = records(current).some(item => removedIdSet.has(String(item.id)));
    let next = updateExistingRecords(current, incoming);
    if (isCurrent || intersectsRelevantShift || containsRemovedRecord) {
      if (replaceShiftSegments && family === "planning-task-segments" && relevantShiftIds.size > 0) {
        next = next.filter(item => !relevantShiftIds.has(String(item.shift_id)));
      }
      next = upsertById(next, incoming);
      next = markRemoved(next, removedIds);
    }
    queryClient.setQueryData(queryKey, next);
  });
  if (matches.length === 0) {
    queryClient.setQueryData(currentKey, current => markRemoved(upsertById(current, incoming), removedIds));
  }
}

/**
 * Reconcile a planning mutation response before any background refetch starts.
 * Base44 mutations already return the authoritative records they wrote, so the
 * board does not need to wait for four list endpoints before it can respond.
 */
export function applyPlanningMutationResultToCache(queryClient, {
  periodStart,
  periodEnd,
  result,
  replaceShiftSegments = false,
} = {}) {
  if (!queryClient || !result) return;
  const shiftsKey = ["planning-shifts", periodStart, periodEnd];
  const occurrencesKey = ["planning-task-occurrences", periodStart, periodEnd];
  const assignmentsKey = ["planning-assignments", periodStart, periodEnd];
  const segmentsKey = ["planning-task-segments", periodStart, periodEnd];
  const returnedShifts = resultRecords(result, "shifts", "shift");
  const returnedAssignments = resultRecords(result, "assignments", "assignment");
  const returnedSegments = resultRecords(result, "segments", "segment");
  const returnedOccurrences = resultRecords(result, "task_occurrences", "task_occurrence");
  const relevantShiftIds = new Set([
    ...returnedShifts.map(item => item?.id),
    ...returnedAssignments.map(item => item?.shift_id || item?.planning_shift_id),
    ...returnedSegments.map(item => item?.shift_id),
  ].filter(Boolean).map(String));

  if (returnedShifts.length > 0) {
    queryClient.setQueryData(shiftsKey, current => upsertById(current, returnedShifts));
    queryClient.getQueriesData({ queryKey: ["planning-shifts"] }).forEach(([queryKey, current]) => {
      if (JSON.stringify(queryKey) === JSON.stringify(shiftsKey)) return;
      queryClient.setQueryData(queryKey, updateExistingRecords(current, returnedShifts));
    });
  }

  if (returnedAssignments.length > 0 || records(result.removed_assignment_ids).length > 0) {
    updateRelevantPlanningQueries(queryClient, {
      family: "planning-assignments",
      currentKey: assignmentsKey,
      incoming: returnedAssignments,
      removedIds: result.removed_assignment_ids,
      relevantShiftIds,
    });
  }

  if (returnedSegments.length > 0 || records(result.removed_segment_ids).length > 0) {
    updateRelevantPlanningQueries(queryClient, {
      family: "planning-task-segments",
      currentKey: segmentsKey,
      incoming: returnedSegments,
      removedIds: result.removed_segment_ids,
      relevantShiftIds,
      replaceShiftSegments,
    });
  }

  if (returnedOccurrences.length > 0) {
    queryClient.setQueryData(occurrencesKey, current => upsertById(current, returnedOccurrences));
    queryClient.getQueriesData({ queryKey: ["planning-task-occurrences"] }).forEach(([queryKey, current]) => {
      if (JSON.stringify(queryKey) === JSON.stringify(occurrencesKey)) return;
      queryClient.setQueryData(queryKey, updateExistingRecords(current, returnedOccurrences));
    });
  }
}

export const planningQueryCacheInternals = {
  markRemoved,
  recordIds,
  resultRecords,
  updateExistingRecords,
  updateRelevantPlanningQueries,
  upsertById,
};
