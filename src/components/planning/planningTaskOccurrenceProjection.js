function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function id(value) {
  return text(value);
}

function normalizedTaskTypeKey(occurrence) {
  const explicit = text(occurrence?.task_type_key);
  if (explicit) return explicit;
  const taskType = text(occurrence?.task_type);
  if (taskType !== "other") return taskType;
  const definitionId = text(occurrence?.object_task_definition_id);
  return definitionId ? `other:${definitionId}` : taskType;
}

const TASK_OCCURRENCE_PLANNING_IMPACT_FIELDS = [
  "company_id",
  "service_responsible_company_id",
  "customer_id",
  "object_id",
  "security_plan_id",
  "security_plan_revision_id",
  "security_plan_checksum",
  "task_type",
  "task_type_key",
  "custom_task_type",
  "execution_mode",
  "service_date",
  "end_date",
  "window_start_time",
  "window_end_time",
  "timezone",
  "required_minutes",
  "task_name_snapshot",
  "customer_name_snapshot",
  "object_name_snapshot",
  "instructions_snapshot",
];

const TASK_OCCURRENCE_COMMERCIAL_PROJECTION_FIELDS = [
  "selling_company_id",
  "customer_contract_id",
  "customer_contract_line_id",
  "commercial_routing_status",
  "commercial_routing_snapshot",
];

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function planningImpactSnapshot(occurrence) {
  if (!occurrence) return null;
  const snapshot = Object.fromEntries(TASK_OCCURRENCE_PLANNING_IMPACT_FIELDS
    .filter(field => Object.prototype.hasOwnProperty.call(occurrence, field))
    .map(field => [field, occurrence[field]]));
  snapshot.service_responsible_company_id = text(
    occurrence.service_responsible_company_id || occurrence.company_id,
  );
  snapshot.task_type_key = normalizedTaskTypeKey(occurrence);
  return snapshot;
}

function hasCompleteProjectionIdentity(occurrence) {
  const requiredMinutes = Number(occurrence?.required_minutes);
  return Boolean(
    id(occurrence?.object_task_definition_id)
    && id(occurrence?.customer_id)
    && id(occurrence?.object_id)
    && text(occurrence?.service_date)
    && text(occurrence?.end_date)
    && text(occurrence?.window_start_time)
    && text(occurrence?.window_end_time)
    && text(occurrence?.timezone)
    && text(occurrence?.execution_mode)
    && Number.isFinite(requiredMinutes)
    && requiredMinutes > 0
    && normalizedTaskTypeKey(occurrence)
  );
}

function sameOccurrenceIdentity(left, right) {
  if (!hasCompleteProjectionIdentity(left) || !hasCompleteProjectionIdentity(right)) return false;
  if (id(left.object_task_definition_id) !== id(right.object_task_definition_id)) return false;
  return stableStringify(planningImpactSnapshot(left))
    === stableStringify(planningImpactSnapshot(right));
}

function sourceOccurrenceId(change) {
  return id(
    change?.source_task_occurrence_id
    || change?.task_occurrence_id
    || change?.occurrence_id,
  );
}

function changeAppliesToSegment(change, segment) {
  const segmentIds = Array.isArray(change?.segment_ids)
    ? change.segment_ids.map(id).filter(Boolean)
    : [];
  if (segmentIds.length > 0) return segmentIds.includes(id(segment?.id));

  const shiftIds = [
    change?.shift_id,
    ...(Array.isArray(change?.shift_ids) ? change.shift_ids : []),
  ].map(id).filter(Boolean);
  return Boolean(id(segment?.shift_id) && shiftIds.includes(id(segment.shift_id)));
}

function scopedOpenChanges(sourceId, segment, sourceChangesBySourceId) {
  return (sourceChangesBySourceId.get(sourceId) || []).filter(change => (
    change?.status === "open"
    && changeAppliesToSegment(change, segment)
  ));
}

function sourceChangeSnapshot(change, snapshot, fallbackOccurrence) {
  if (!snapshot) return null;
  const definitionIds = [
    fallbackOccurrence?.object_task_definition_id,
    change?.object_task_definition_id,
    snapshot?.object_task_definition_id,
  ].map(id).filter(Boolean);
  if (new Set(definitionIds).size !== 1) return null;

  const scopeFields = ["customer_id", "object_id", "service_date"];
  const scopeConflicts = scopeFields.some(field => {
    const changeValue = text(change?.[field]);
    if (!changeValue) return false;
    return [fallbackOccurrence?.[field], snapshot?.[field]]
      .map(text)
      .filter(Boolean)
      .some(value => value !== changeValue);
  });
  if (scopeConflicts) return null;

  return {
    ...snapshot,
    // Source-change snapshots contain the backend planning-impact fields, but
    // not the definition id. Recover only that scope; missing impact evidence
    // remains missing so an incomplete snapshot still fails closed.
    object_task_definition_id: definitionIds[0],
  };
}

function changesAreCompatible(changes, source, target) {
  return changes.every(change => {
    if (change.change_type !== "schedule_changed") return false;
    if (id(change.replacement_task_occurrence_id) !== id(target?.id)) return false;
    const previous = sourceChangeSnapshot(change, change.previous_snapshot, source);
    const desired = sourceChangeSnapshot(change, change.desired_snapshot, target);
    return Boolean(
      previous
      && desired
      && sameOccurrenceIdentity(previous, source)
      && sameOccurrenceIdentity(desired, target)
      && sameOccurrenceIdentity(previous, desired),
    );
  });
}

function selfReplacementChangesAreCommercialOnly(changes, source) {
  return changes.every(change => {
    const previous = sourceChangeSnapshot(change, change.previous_snapshot, source);
    const desired = sourceChangeSnapshot(change, change.desired_snapshot, source);
    return Boolean(
      previous
      && desired
      && sameOccurrenceIdentity(previous, source)
      && sameOccurrenceIdentity(desired, source)
      && sameOccurrenceIdentity(previous, desired),
    );
  });
}

function projectCommercialSelfRepair(source, changes) {
  if (changes.length === 0) return null;
  const desiredSnapshots = changes.map(change => change.desired_snapshot).filter(Boolean);
  const commercialValues = {};
  for (const field of TASK_OCCURRENCE_COMMERCIAL_PROJECTION_FIELDS) {
    const values = desiredSnapshots
      .filter(snapshot => Object.prototype.hasOwnProperty.call(snapshot, field))
      .map(snapshot => snapshot[field]);
    if (values.length && values.every(value => stableStringify(value) === stableStringify(values[0]))) {
      commercialValues[field] = values[0];
    }
  }
  return {
    ...source,
    ...commercialValues,
    lifecycle_status: "active",
    superseded_by_task_occurrence_id: null,
  };
}

function uniqueActiveKeyReplacement(source, activeOccurrencesByKey) {
  const logicalSourceKey = text(source?.logical_source_key);
  const sourceKey = text(source?.source_key);
  if (!logicalSourceKey && !sourceKey) return null;

  const candidates = [
    ...(logicalSourceKey ? activeOccurrencesByKey.logical.get(logicalSourceKey) || [] : []),
    ...(sourceKey ? activeOccurrencesByKey.source.get(sourceKey) || [] : []),
  ].filter(candidate => id(candidate?.id) !== id(source?.id));
  const uniqueIds = [...new Set(candidates.map(candidate => id(candidate.id)).filter(Boolean))];
  return uniqueIds.length === 1
    ? candidates.find(candidate => id(candidate.id) === uniqueIds[0]) || null
    : null;
}

function resolveReplacementStep({
  source,
  segment,
  occurrenceById,
  activeOccurrencesByKey,
  sourceChangesBySourceId,
}) {
  const sourceId = id(source?.id) || id(segment?.task_occurrence_id);
  if (!sourceId) return null;
  const changes = scopedOpenChanges(sourceId, segment, sourceChangesBySourceId);
  if (changes.some(change => change.change_type === "schedule_stopped")) return null;

  const rawDirectReplacementId = id(source?.superseded_by_task_occurrence_id);
  const directReplacementId = rawDirectReplacementId === sourceId
    ? null
    : rawDirectReplacementId;
  const changedSourceChanges = changes.filter(change => change.change_type === "schedule_changed");
  if (changedSourceChanges.some(change => !id(change.replacement_task_occurrence_id))) return null;
  const replacementSourceChanges = changedSourceChanges.filter(change => (
    id(change.replacement_task_occurrence_id) !== sourceId
  ));
  const selfReplacementChanges = changedSourceChanges.filter(change => (
    id(change.replacement_task_occurrence_id) === sourceId
  ));
  if (!selfReplacementChangesAreCommercialOnly(selfReplacementChanges, source)) return null;
  if (rawDirectReplacementId === sourceId) {
    if (replacementSourceChanges.length > 0) return null;
    return projectCommercialSelfRepair(source, selfReplacementChanges);
  }
  const changeReplacementIds = [...new Set(replacementSourceChanges
    .map(change => id(change.replacement_task_occurrence_id))
    .filter(Boolean))];
  if (changeReplacementIds.length > 1) return null;
  if (
    directReplacementId
    && changeReplacementIds.length === 1
    && changeReplacementIds[0] !== directReplacementId
  ) return null;

  const replacementId = directReplacementId || changeReplacementIds[0] || null;
  const replacement = replacementId
    ? occurrenceById.get(replacementId) || null
    : uniqueActiveKeyReplacement(source, activeOccurrencesByKey);
  if (!replacement || id(replacement.id) === sourceId) return null;
  if (!sameOccurrenceIdentity(source, replacement)) return null;
  if (
    replacementSourceChanges.length > 0
    && !changesAreCompatible(replacementSourceChanges, source, replacement)
  ) return null;
  return replacement;
}

function resolveCurrentOccurrence(
  segment,
  occurrenceById,
  activeOccurrencesByKey,
  sourceChangesBySourceId,
  maxSteps,
) {
  const originalId = id(segment?.task_occurrence_id);
  if (!originalId) return null;

  let current = occurrenceById.get(originalId) || null;
  if (!current) {
    const changes = scopedOpenChanges(originalId, segment, sourceChangesBySourceId);
    const sourceSnapshots = changes.map(change => (
      sourceChangeSnapshot(change, change.previous_snapshot, null)
    ));
    if (sourceSnapshots.length === 0 || sourceSnapshots.some(snapshot => !snapshot)) return null;
    if (!sourceSnapshots.every(snapshot => sameOccurrenceIdentity(snapshot, sourceSnapshots[0]))) return null;
    current = { ...sourceSnapshots[0], id: originalId, lifecycle_status: "superseded" };
  }
  if (current.lifecycle_status !== "superseded") return null;

  const visited = new Set();
  for (let step = 0; step < maxSteps; step += 1) {
    const currentId = id(current.id);
    if (!currentId || visited.has(currentId)) return null;
    visited.add(currentId);
    const replacement = resolveReplacementStep({
      source: current,
      segment,
      occurrenceById,
      activeOccurrencesByKey,
      sourceChangesBySourceId,
    });
    if (!replacement) return null;
    if (replacement.lifecycle_status === "active") return replacement;
    if (replacement.lifecycle_status !== "superseded") return null;
    current = replacement;
  }
  return null;
}

/**
 * Read projection for task coverage and planner interactions. The stored
 * segment id remains untouched; only an unambiguous, operationally identical
 * successor may stand in for a superseded occurrence.
 */
export function projectSegmentsToCurrentTaskOccurrences(
  segments = [],
  occurrences = [],
  sourceChanges = [],
) {
  const occurrenceById = new Map(occurrences
    .filter(item => id(item?.id))
    .map(item => [id(item.id), item]));
  const activeOccurrencesByKey = { logical: new Map(), source: new Map() };
  for (const occurrence of occurrences.filter(item => item?.lifecycle_status === "active")) {
    const logicalSourceKey = text(occurrence.logical_source_key);
    const sourceKey = text(occurrence.source_key);
    if (logicalSourceKey) {
      activeOccurrencesByKey.logical.set(logicalSourceKey, [
        ...(activeOccurrencesByKey.logical.get(logicalSourceKey) || []),
        occurrence,
      ]);
    }
    if (sourceKey) {
      activeOccurrencesByKey.source.set(sourceKey, [
        ...(activeOccurrencesByKey.source.get(sourceKey) || []),
        occurrence,
      ]);
    }
  }
  const sourceChangesBySourceId = new Map();
  for (const change of sourceChanges) {
    const sourceId = sourceOccurrenceId(change);
    if (!sourceId) continue;
    sourceChangesBySourceId.set(sourceId, [
      ...(sourceChangesBySourceId.get(sourceId) || []),
      change,
    ]);
  }
  const maxSteps = occurrences.length + sourceChanges.length + 2;
  return segments.map(segment => {
    const linkedOccurrence = occurrenceById.get(id(segment?.task_occurrence_id)) || null;
    const replacement = linkedOccurrence?.lifecycle_status === "active"
      ? linkedOccurrence
      : resolveCurrentOccurrence(
          segment,
          occurrenceById,
          activeOccurrencesByKey,
          sourceChangesBySourceId,
          maxSteps,
        );
    if (!replacement) return segment;
    const replacementChangesOccurrence = id(replacement.id) !== id(segment.task_occurrence_id);
    return {
      ...segment,
      task_occurrence_id: replacement.id,
      ...(replacementChangesOccurrence ? {
        source_task_occurrence_id: segment.source_task_occurrence_id || segment.task_occurrence_id,
      } : {}),
      selling_company_id: replacement.selling_company_id ?? null,
      service_responsible_company_id: replacement.service_responsible_company_id ?? null,
      customer_contract_id: replacement.customer_contract_id ?? null,
      customer_contract_line_id: replacement.customer_contract_line_id ?? null,
      commercial_routing_status: replacement.commercial_routing_status ?? null,
      commercial_routing_snapshot: replacement.commercial_routing_snapshot ?? null,
    };
  });
}
