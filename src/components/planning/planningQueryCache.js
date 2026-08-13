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
  const returnedShifts = resultRecords(result, "shifts", "shift");
  const returnedAssignments = resultRecords(result, "assignments", "assignment");
  const returnedSegments = resultRecords(result, "segments", "segment");
  const returnedOccurrences = resultRecords(result, "task_occurrences", "task_occurrence");

  if (returnedShifts.length > 0) {
    queryClient.setQueryData(shiftsKey, current => upsertById(current, returnedShifts));
  }

  if (returnedAssignments.length > 0 || records(result.removed_assignment_ids).length > 0) {
    queryClient.setQueryData(["planning-assignments"], current => markRemoved(
      upsertById(current, returnedAssignments),
      result.removed_assignment_ids,
    ));
  }

  if (returnedSegments.length > 0 || records(result.removed_segment_ids).length > 0) {
    queryClient.setQueryData(["planning-task-segments"], current => {
      let base = records(current);
      if (replaceShiftSegments) {
        const replacedShiftIds = new Set(returnedShifts
          .map(item => item?.id)
          .filter(value => value != null)
          .map(String));
        if (replacedShiftIds.size === 0) {
          returnedSegments.forEach(item => {
            if (item?.shift_id != null) replacedShiftIds.add(String(item.shift_id));
          });
        }
        if (replacedShiftIds.size > 0) {
          base = base.filter(item => !replacedShiftIds.has(String(item.shift_id)));
        }
      }
      return markRemoved(upsertById(base, returnedSegments), result.removed_segment_ids);
    });
  }

  if (returnedOccurrences.length > 0) {
    queryClient.setQueryData(occurrencesKey, current => upsertById(current, returnedOccurrences));
  }
}

export const planningQueryCacheInternals = { markRemoved, resultRecords, upsertById };
