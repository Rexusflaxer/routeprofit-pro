function records(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
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

  if (result.shift) {
    queryClient.setQueryData(shiftsKey, current => upsertById(current, [result.shift]));
  }

  const returnedAssignments = records(result.assignments).length > 0
    ? result.assignments
    : result.assignment
      ? [result.assignment]
      : [];
  if (returnedAssignments.length > 0 || records(result.removed_assignment_ids).length > 0) {
    queryClient.setQueryData(["planning-assignments"], current => markRemoved(
      upsertById(current, returnedAssignments),
      result.removed_assignment_ids,
    ));
  }

  if (records(result.segments).length > 0 || records(result.removed_segment_ids).length > 0) {
    queryClient.setQueryData(["planning-task-segments"], current => {
      let base = records(current);
      if (replaceShiftSegments && result.shift?.id) {
        base = base.filter(item => String(item.shift_id) !== String(result.shift.id));
      }
      return markRemoved(upsertById(base, result.segments), result.removed_segment_ids);
    });
  }

  if (records(result.task_occurrences).length > 0) {
    queryClient.setQueryData(occurrencesKey, current => upsertById(current, result.task_occurrences));
  }
}

export const planningQueryCacheInternals = { markRemoved, upsertById };
