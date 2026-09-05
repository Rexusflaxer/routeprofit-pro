import {
  getAssignmentWarnings,
  getTaskOccurrenceDayProjection,
  toDateKey,
} from "@/components/planning/planningDomain";

export const PLANNING_ELIGIBILITY_DEPENDENCIES = Object.freeze([
  "personnel",
  "shifts",
  "assignments",
  "absences",
  "qualifications",
  "securityPasses",
  "restrictions",
  "contracts",
  "objects",
]);

// Server eligibility evidence describes employee, contract, CAO and object
// facts. The current schedule is deliberately excluded from this basis: live
// overlap, rest and contract-hour warnings are recomputed below from the
// optimistic client schedule. This keeps valid server evidence warm while a
// planner makes several independent changes in quick succession.
export const PLANNING_ELIGIBILITY_REMOTE_FACT_DEPENDENCIES = Object.freeze(
  PLANNING_ELIGIBILITY_DEPENDENCIES.filter(name => name !== "shifts" && name !== "assignments"),
);

const READY_STATES = new Set(["ready", "success"]);
const CHECKING_STATES = new Set(["checking", "loading", "pending", "idle"]);
const ERROR_STATES = new Set(["error", "failed", "unavailable"]);

function records(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function timestamp(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function dependencyVersion(source) {
  return text(source?.version ?? source?.revision ?? source?.dataVersion ?? source?.data_version);
}

function normalizeDependency(name, source, now, maxAgeMs) {
  if (!source || typeof source !== "object") {
    return { name, status: "checking", reason: "dependency_missing", version: "", updatedAt: null };
  }
  const rawStatus = text(source.status || source.state).toLowerCase();
  const hasError = Boolean(source.error) || ERROR_STATES.has(rawStatus);
  const hasData = source.hasData === true || source.has_data === true || source.data !== undefined;
  const updatedAt = timestamp(source.updatedAt ?? source.dataUpdatedAt ?? source.updated_at);
  const version = dependencyVersion(source);

  if (hasError) {
    return { name, status: "unavailable", reason: "dependency_error", version, updatedAt };
  }
  if (CHECKING_STATES.has(rawStatus) && !hasData) {
    return { name, status: "checking", reason: "dependency_loading", version, updatedAt };
  }
  if (!READY_STATES.has(rawStatus) && !(CHECKING_STATES.has(rawStatus) && hasData)) {
    return { name, status: "checking", reason: "dependency_not_ready", version, updatedAt };
  }
  if (updatedAt === null && !version) {
    return { name, status: "stale", reason: "freshness_unknown", version, updatedAt };
  }
  if (updatedAt !== null && now - updatedAt > maxAgeMs) {
    return { name, status: "stale", reason: "dependency_stale", version, updatedAt };
  }
  return { name, status: "ready", reason: null, version, updatedAt };
}

function aggregateDependencyStatus(dependencies) {
  const states = Object.values(dependencies).map(item => item.status);
  if (states.includes("unavailable")) return "unavailable";
  if (states.includes("checking")) return "checking";
  if (states.includes("stale")) return "stale";
  return "ready";
}

function basisTokenFor(dependencies, names = PLANNING_ELIGIBILITY_DEPENDENCIES) {
  return names.map(name => {
    const item = dependencies[name];
    return `${name}:${item.status}:${item.version || item.updatedAt || "unknown"}`;
  }).join("|");
}

function personnelId(record) {
  return text(record?.personnel_id ?? record?.employee_id ?? record?.person_id ?? record?.personnel?.id);
}

function assignmentShiftId(record) {
  return text(record?.planning_shift_id ?? record?.shift_id ?? record?.service_id);
}

function groupPersonnelRecords(source) {
  const scoped = new Map();
  const unscoped = [];
  records(source).forEach(item => {
    const id = personnelId(item);
    if (!id) {
      unscoped.push(item);
      return;
    }
    const items = scoped.get(id) || [];
    items.push(item);
    scoped.set(id, items);
  });
  return { scoped, unscoped };
}

function recordsForPersonnel(group, id) {
  return [...group.unscoped, ...(group.scoped.get(id) || [])];
}

export function buildPlanningEligibilityObjectShiftContext({ object, occurrence } = {}) {
  return {
    company_id: object?.default_operating_company_id || occurrence?.company_id || null,
    customer_id: occurrence?.customer_id || object?.customer_id || null,
    object_id: occurrence?.object_id || object?.id || null,
    cao_key: object?.cao_key || null,
    service_function_type: object?.default_service_function_type || null,
    required_cao_function_group: object?.default_cao_function_group || null,
    required_cao_function_level: object?.default_cao_function_level || null,
    required_security_role_status: object?.default_security_role_status || null,
    required_qualification_types: records(object?.default_required_qualification_types),
    required_qualification_groups: records(object?.default_required_qualification_groups),
    required_security_pass_types: records(object?.default_required_security_pass_types),
    contract_assignment_policy: object?.contract_assignment_policy || "allow_manual_review",
    performs_security_work: object?.default_performs_security_work ?? null,
    security_work_percentage: object?.default_security_work_percentage ?? null,
    works_event_or_hospitality_security: object?.default_works_event_or_hospitality_security ?? null,
    event_hospitality_cao_applies: object?.default_event_hospitality_cao_applies ?? null,
    works_airport_schiphol: object?.default_works_airport_schiphol ?? null,
    works_cash_value_logistics: object?.default_works_cash_value_logistics ?? null,
    customer_billable: object?.default_customer_billable ?? null,
    counts_toward_required_staffing: object?.default_counts_toward_required_staffing ?? null,
    timezone: occurrence?.timezone || "Europe/Amsterdam",
  };
}

function stableFingerprintValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableFingerprintValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => (
      `${JSON.stringify(key)}:${stableFingerprintValue(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function shiftFingerprint(shift, { includeRevision = false } = {}) {
  const context = shift?.service_context_snapshot || {};
  return [
    shift?.id,
    includeRevision ? shift?.revision : null,
    shift?.status,
    shift?.lifecycle_status,
    shift?.is_active,
    shift?.source_type,
    shift?.source_id,
    shift?.service_date,
    shift?.end_date,
    shift?.start_time,
    shift?.end_time,
    shift?.company_id,
    shift?.customer_id,
    shift?.object_id,
    shift?.route_id,
    shift?.task_id,
    shift?.task_type_key ?? context.task_type_key,
    shift?.task_type ?? context.task_type,
    records(shift?.required_task_types ?? context.required_task_types).map(text).sort().join(","),
    shift?.customer_contract_line_id,
    shift?.cao_key ?? context.cao_key,
    shift?.service_function_type ?? shift?.function_type ?? context.service_function_type,
    shift?.required_cao_function_group ?? context.required_cao_function_group,
    shift?.required_cao_function_level ?? context.required_cao_function_level,
    shift?.required_security_role_status ?? context.required_security_role_status,
    shift?.requires_security_pass,
    shift?.security_pass_required,
    records(shift?.required_qualification_types).join(","),
    records(shift?.required_qualification_groups).join(","),
    records(shift?.required_security_pass_types).join(","),
    records(shift?.required_pass_types).join(","),
    shift?.required_pass_type,
    stableFingerprintValue(shift?.requirements?.security_pass_types),
    shift?.contract_assignment_policy ?? context.contract_assignment_policy,
    shift?.performs_security_work ?? context.performs_security_work,
    shift?.security_work_percentage ?? context.security_work_percentage,
    shift?.works_event_or_hospitality_security ?? context.works_event_or_hospitality_security,
    shift?.event_hospitality_cao_applies ?? context.event_hospitality_cao_applies,
    shift?.works_airport_schiphol ?? context.works_airport_schiphol,
    shift?.works_cash_value_logistics ?? context.works_cash_value_logistics,
    shift?.customer_billable ?? context.customer_billable,
    shift?.counts_toward_required_staffing ?? context.counts_toward_required_staffing,
    shift?.timezone ?? context.timezone,
    records(shift?.customer_ids).map(text).sort().join(","),
    records(shift?.object_ids).map(text).sort().join(","),
    records(shift?.task_occurrence_ids).map(text).sort().join(","),
    shift?.task_segment_count,
    shift?.company_name,
    shift?.company_name_snapshot,
    shift?.company_label,
    shift?.customer_name,
    shift?.customer_name_snapshot,
    shift?.customer_label,
    shift?.object_name,
    shift?.object_name_snapshot,
    shift?.object_label,
    shift?.location_name,
    shift?.route_name,
    shift?.route_name_snapshot,
    shift?.route_label,
    shift?.function_group_id,
    shift?.function_id,
    shift?.function_group,
    shift?.function_group_label,
    shift?.function_name,
    shift?.scope_id,
    shift?.scope_label,
    stableFingerprintValue(context),
  ].map(text).join("~");
}

export function planningEligibilitySourceSemanticsEqual(left, right, { kind = "shift" } = {}) {
  if (!left || !right || text(left.id) !== text(right.id)) return false;
  return shiftFingerprint(left, { includeRevision: kind === "occurrence" })
    === shiftFingerprint(right, { includeRevision: kind === "occurrence" });
}

export function planningEligibilityOwnSourceRevisionMatches(
  acknowledgement,
  resultSource,
  currentSource,
) {
  if (
    !acknowledgement?.source
    || resultSource?.kind !== "shift"
    || text(acknowledgement.source.id) !== text(resultSource?.id)
    || text(currentSource?.id) !== text(resultSource?.id)
  ) return false;
  const acknowledgedRevision = Number(acknowledgement.revision);
  const resultRevision = Number(resultSource?.revision);
  const currentRevision = Number(currentSource?.revision);
  if (
    !Number.isFinite(acknowledgedRevision)
    || acknowledgedRevision !== resultRevision
    || resultRevision !== currentRevision
  ) return false;
  return planningEligibilitySourceSemanticsEqual(acknowledgement.source, currentSource);
}

function compactFingerprint(value) {
  const input = text(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return `${input.length.toString(36)}-${first.toString(36)}-${second.toString(36)}`;
}

export function planningEligibilityCandidateKey({
  kind = "shift",
  personnelId: requestedPersonnelId,
  shift,
  occurrenceId = null,
  excludeAssignmentId = null,
} = {}) {
  const sourceId = text(occurrenceId || shift?.id || shift?.source_key || "preview");
  const parts = [
    kind,
    requestedPersonnelId,
    sourceId,
    compactFingerprint(shiftFingerprint(shift, { includeRevision: kind === "occurrence" })),
  ];
  if (excludeAssignmentId) parts.push(`exclude:${excludeAssignmentId}`);
  return parts
    .map(value => encodeURIComponent(text(value)))
    .join(":");
}

export function buildPlanningEligibilityPrefetchCandidate({
  kind = "shift",
  source,
  shift,
  personnelId: requestedPersonnelId,
  occurrenceId = null,
  excludeAssignmentId = null,
} = {}) {
  const sourceId = text(source?.id);
  const id = text(requestedPersonnelId);
  if (!sourceId || !id || !shift) return null;
  const sourceKind = kind === "occurrence" ? "occurrence" : "shift";
  const candidateKey = planningEligibilityCandidateKey({
    kind: sourceKind,
    personnelId: id,
    shift,
    occurrenceId: sourceKind === "occurrence" ? occurrenceId || sourceId : null,
    excludeAssignmentId,
  });
  return {
    candidate_key: candidateKey,
    personnel_id: id,
    source_kind: sourceKind,
    source_id: sourceId,
    expected_source_revision: Math.max(1, Number(source.revision || 1)),
    service_date: shift.service_date,
    ...(shift.end_date ? { end_date: shift.end_date } : {}),
    start_time: shift.start_time,
    end_time: shift.end_time,
    ...(excludeAssignmentId ? { exclude_assignment_id: excludeAssignmentId } : {}),
    _local: {
      personnelId: id,
      shift,
      source,
      ...(excludeAssignmentId ? { excludeAssignmentId } : {}),
      ...(sourceKind === "occurrence" ? {
        kind: "occurrence",
        occurrenceId: occurrenceId || sourceId,
      } : {}),
    },
  };
}

function dateAtUtcMidnight(value) {
  const key = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const parsed = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function utcDateKey(value) {
  return value.toISOString().slice(0, 10);
}

function candidateCalendarDates(candidate) {
  const start = dateAtUtcMidnight(candidate?.service_date);
  const end = dateAtUtcMidnight(candidate?.end_date || candidate?.service_date);
  if (!start || !end || end.getTime() < start.getTime()) return new Set();
  const dates = new Set();
  const cursor = new Date(start.getTime());
  let count = 0;
  while (cursor.getTime() <= end.getTime() && count < 32) {
    dates.add(utcDateKey(cursor));
    dates.add(utcDateKey(new Date(cursor.getTime() - 86_400_000)));
    dates.add(utcDateKey(new Date(cursor.getTime() + 86_400_000)));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    count += 1;
  }
  return dates;
}

export function batchPlanningEligibilityCandidates(candidates = [], {
  maxCandidates = 48,
  maxPersonnel = 20,
  maxSources = 28,
  maxDates = 14,
} = {}) {
  const batches = [];
  let current = [];
  let personnelIds = new Set();
  let sourceIds = new Set();
  let dates = new Set();
  const reset = () => {
    current = [];
    personnelIds = new Set();
    sourceIds = new Set();
    dates = new Set();
  };
  const flush = () => {
    if (current.length) batches.push(current);
    reset();
  };
  records(candidates).forEach(candidate => {
    const nextPersonnel = new Set(personnelIds);
    const nextSources = new Set(sourceIds);
    const nextDates = new Set(dates);
    nextPersonnel.add(text(candidate?.personnel_id));
    nextSources.add(`${text(candidate?.source_kind)}:${text(candidate?.source_id)}`);
    candidateCalendarDates(candidate).forEach(date => nextDates.add(date));
    const exceeds = current.length > 0 && (
      current.length + 1 > maxCandidates
      || nextPersonnel.size > maxPersonnel
      || nextSources.size > maxSources
      || nextDates.size > maxDates
    );
    if (exceeds) flush();
    current.push(candidate);
    personnelIds.add(text(candidate?.personnel_id));
    sourceIds.add(`${text(candidate?.source_kind)}:${text(candidate?.source_id)}`);
    candidateCalendarDates(candidate).forEach(date => dates.add(date));
  });
  flush();
  return batches;
}

function notice(code, title, detail) {
  return { code, severity: "warning", title, detail, source: "eligibility_index" };
}

function freshnessNotices(status, dependencyStates, remoteReason = null) {
  const notices = [];
  const affected = Object.values(dependencyStates)
    .filter(item => item.status !== "ready")
    .map(item => item.name);
  if (status === "checking") notices.push(notice(
    "eligibility_check_pending",
    "Controle wordt voorbereid",
    affected.length
      ? `Nog niet alle planningsgegevens zijn geladen: ${affected.join(", ")}.`
      : "De voorafcontrole voor deze combinatie loopt nog.",
  ));
  if (status === "stale") notices.push(notice(
    "eligibility_data_stale",
    "Controle moet worden vernieuwd",
    affected.length
      ? `De brongegevens zijn mogelijk verouderd: ${affected.join(", ")}.`
      : "De vooraf berekende controle is niet meer actueel.",
  ));
  if (status === "unavailable") notices.push(notice(
    "eligibility_check_unavailable",
    "Controle niet volledig beschikbaar",
    affected.length
      ? `Deze gegevens konden niet veilig worden gecontroleerd: ${affected.join(", ")}.`
      : "De voorafcontrole kon niet worden afgerond.",
  ));
  if (remoteReason && status !== "ready") notices.push(notice(
    `eligibility_server_${remoteReason}`,
    "CAO-controle nog niet definitief",
    remoteReason === "stale"
      ? "De vooraf berekende CAO-controle hoort bij een oudere planningsversie."
      : remoteReason === "unavailable"
        ? "De vooraf berekende CAO-controle is momenteel niet beschikbaar."
        : "De vooraf berekende CAO-controle loopt nog.",
  ));
  return notices;
}

function normalizeRemoteDecisions(source) {
  if (source instanceof Map) return new Map(source);
  if (Array.isArray(source)) {
    const scoped = new Map();
    source.forEach(item => {
      const candidateKey = text(item?.candidate_key ?? item?.candidateKey ?? item?.key);
      if (!candidateKey) return;
      const basisToken = text(item?.basis_token ?? item?.basisToken);
      if (basisToken) scoped.set(`${basisToken}\u0000${candidateKey}`, item);
      // Keep one candidate-level fallback so an older-basis result can be
      // surfaced as stale instead of looking as though no server check exists.
      // The exact basis-scoped entry above always wins when it is available.
      scoped.set(candidateKey, item);
    });
    return scoped;
  }
  if (source && typeof source === "object") return new Map(Object.entries(source));
  return new Map();
}

const REMOTE_SCHEDULE_WARNING_CODES = new Set([
  "shift_overlap",
  "double_booking",
  "insufficient_rest",
  "contract_hours_exceeded",
]);

const DRAFT_ROUTING_WARNING_CODES = new Set([
  "contract_missing",
  "contract_ambiguous",
]);

function reusableRemoteWarnings(source) {
  return records(source).filter(item => (
    text(item?.source).toLowerCase() !== "planning"
    && !REMOTE_SCHEDULE_WARNING_CODES.has(text(item?.code).toLowerCase())
  ));
}

/**
 * Merge server-side eligibility evidence without discarding other planning
 * bases. An optimistic mutation temporarily changes the basis token and may
 * later either commit to another authoritative basis or roll back to the
 * original one. Keeping a small, bounded history prevents that transition
 * from turning every visible employee/source combination cold again.
 *
 * Decisions remain strictly scoped by `basis_token`; `remoteVerdict` never
 * treats evidence from an older basis as current. This helper therefore only
 * preserves reusable evidence and does not weaken the fail-closed guard.
 */
export function mergePlanningEligibilityServerDecisions(current = [], incoming = [], {
  now = Date.now(),
  maxEntries = 1_280,
  maxBasisTokens = 4,
  retainReadySourceRevisionKeys = new Set(),
} = {}) {
  const readNow = timestamp(now) ?? Date.now();
  const entryLimit = Math.max(1, Math.trunc(Number(maxEntries) || 1));
  const basisLimit = Math.max(1, Math.trunc(Number(maxBasisTokens) || 1));
  const merged = new Map();
  let sequence = 0;

  const add = (record, preferred) => {
    const candidateKey = text(record?.candidate_key ?? record?.candidateKey ?? record?.key);
    const basisToken = text(record?.basis_token ?? record?.basisToken);
    if (!candidateKey || !basisToken) return;
    const expiresAt = timestamp(record?.expires_at ?? record?.expiresAt);
    if (expiresAt !== null && expiresAt <= readNow) return;
    const evaluatedAt = timestamp(record?.evaluated_at ?? record?.evaluatedAt) ?? 0;
    const compositeKey = `${basisToken}\u0000${candidateKey}`;
    const previous = merged.get(compositeKey);
    const warningCodes = records(record?.warning_codes).map(item => text(item).toLowerCase());
    const isSourceRevisionStale = text(record?.status).toLowerCase() === "stale"
      && warningCodes.includes("eligibility_source_revision_stale");
    const previousIsFreshReady = text(previous?.record?.status).toLowerCase() === "ready"
      && ((timestamp(previous?.record?.expires_at ?? previous?.record?.expiresAt) ?? Number.POSITIVE_INFINITY) > readNow);
    if (
      preferred
      && isSourceRevisionStale
      && previousIsFreshReady
      && retainReadySourceRevisionKeys?.has?.(compositeKey)
    ) return;
    const rank = {
      preferred: preferred ? 1 : 0,
      evaluatedAt,
      sequence: sequence += 1,
    };
    // Completion order is not evidence order: a slow background response can
    // arrive after a newer urgent check for the same basis and candidate.
    // Prefer the newest evaluation and use incoming/sequence only as stable
    // tie-breakers for otherwise equivalent records.
    if (
      !previous
      || rank.evaluatedAt > previous.rank.evaluatedAt
      || (
        rank.evaluatedAt === previous.rank.evaluatedAt
        && rank.preferred > previous.rank.preferred
      )
      || (
        rank.evaluatedAt === previous.rank.evaluatedAt
        && rank.preferred === previous.rank.preferred
        && rank.sequence > previous.rank.sequence
      )
    ) {
      merged.set(compositeKey, { record, basisToken, rank });
    }
  };

  records(current).forEach(record => add(record, false));
  records(incoming).forEach(record => add(record, true));

  const basisRecency = new Map();
  merged.forEach(item => {
    const currentRank = basisRecency.get(item.basisToken) || { preferred: 0, evaluatedAt: 0, sequence: 0 };
    const nextRank = item.rank;
    if (
      nextRank.preferred > currentRank.preferred
      || (nextRank.preferred === currentRank.preferred && nextRank.evaluatedAt > currentRank.evaluatedAt)
      || (
        nextRank.preferred === currentRank.preferred
        && nextRank.evaluatedAt === currentRank.evaluatedAt
        && nextRank.sequence > currentRank.sequence
      )
    ) basisRecency.set(item.basisToken, nextRank);
  });
  const retainedBases = new Set([...basisRecency.entries()]
    .sort((left, right) => (
      right[1].preferred - left[1].preferred
      || right[1].evaluatedAt - left[1].evaluatedAt
      || right[1].sequence - left[1].sequence
      || left[0].localeCompare(right[0])
    ))
    .slice(0, basisLimit)
    .map(([basisToken]) => basisToken));

  return [...merged.values()]
    .filter(item => retainedBases.has(item.basisToken))
    .sort((left, right) => (
      right.rank.preferred - left.rank.preferred
      || right.rank.evaluatedAt - left.rank.evaluatedAt
      || right.rank.sequence - left.rank.sequence
    ))
    .slice(0, entryLimit)
    .map(item => item.record);
}

/**
 * Selects which exact eligibility candidates may start a server request.
 * Normal hover treats every fresh non-ready result as a cooldown, preventing
 * an unavailable response from retriggering itself. A held drop can opt into
 * `forceRetry`; its separate gate still owns the strict retry budget.
 */
export function selectPlanningEligibilityRequestCandidates({
  candidates = [],
  decisions = [],
  basisToken,
  pendingRequestKeys = new Set(),
  forceRetry = false,
  now = Date.now(),
} = {}) {
  const basis = text(basisToken);
  if (!basis) return Object.freeze({ status: "blocked", candidates: Object.freeze([]), requestKeys: Object.freeze([]) });
  const readNow = timestamp(now) ?? Date.now();
  const exactDecisionByCandidate = new Map(records(decisions)
    .filter(item => (
      text(item?.basis_token ?? item?.basisToken) === basis
      && (timestamp(item?.expires_at ?? item?.expiresAt) ?? 0) > readNow
    ))
    .map(item => [text(item?.candidate_key ?? item?.candidateKey), item]));
  const pending = pendingRequestKeys instanceof Set ? pendingRequestKeys : new Set(pendingRequestKeys || []);
  let hasKnown = false;
  let hasPending = false;
  let hasCooldown = false;
  const requested = records(candidates).filter(candidate => {
    const candidateKey = text(candidate?.candidate_key ?? candidate?.candidateKey);
    if (!candidateKey) return false;
    const requestKey = `${basis}:${candidateKey}`;
    if (pending.has(requestKey)) {
      hasPending = true;
      return false;
    }
    const decision = exactDecisionByCandidate.get(candidateKey);
    if (text(decision?.status).toLowerCase() === "ready") {
      hasKnown = true;
      return false;
    }
    if (decision && !forceRetry) {
      hasCooldown = true;
      return false;
    }
    return true;
  });
  if (!requested.length) {
    const status = hasPending ? "pending" : hasCooldown ? "cooldown" : hasKnown ? "known" : "blocked";
    return Object.freeze({ status, candidates: Object.freeze([]), requestKeys: Object.freeze([]) });
  }
  return Object.freeze({
    status: "started",
    candidates: Object.freeze(requested),
    requestKeys: Object.freeze(requested.map(candidate => (
      `${basis}:${text(candidate?.candidate_key ?? candidate?.candidateKey)}`
    ))),
  });
}

/**
 * Small synchronous semaphore for hover-prefetch calls. Pointer movement can
 * emit many different candidate keys in one frame; without a shared gate each
 * key starts its own function call. Callers retry the latest visible candidate
 * when a slot is released, so queued obsolete hover positions need no network
 * request of their own.
 *
 * @param {{ maxConcurrent?: number }} [options]
 */
export function createPlanningEligibilityUrgentRequestGate(options = {}) {
  const maximum = Math.max(1, Math.floor(Number(options.maxConcurrent) || 2));
  let active = 0;
  return Object.freeze({
    acquire() {
      if (active >= maximum) return null;
      active += 1;
      let released = false;
      return () => {
        if (released) return false;
        released = true;
        active = Math.max(0, active - 1);
        return true;
      };
    },
    getSnapshot() {
      return Object.freeze({ active, maximum, available: Math.max(0, maximum - active) });
    },
  });
}

function remoteVerdict({ remoteDecisions, candidateKey, basisToken, now, required }) {
  const record = remoteDecisions.get(`${basisToken}\u0000${candidateKey}`)
    || remoteDecisions.get(candidateKey);
  if (!record) return {
    status: required ? "checking" : "ready",
    reason: required ? "checking" : null,
    warnings: [],
    routingDraftAssignmentAllowed: false,
    employmentRoutingStatus: "stale",
    employmentRoutingCodes: [],
  };
  const state = text(record.status || record.state || "ready").toLowerCase();
  // A server response can arrive after the planner has already changed the
  // optimistic schedule. Retain stable CAO/fact warnings, but never replay
  // server planning warnings that the local index can evaluate synchronously
  // against the newer schedule.
  const warnings = reusableRemoteWarnings(record.warning_snapshot || record.warnings);
  if (ERROR_STATES.has(state) || record.error) return {
    status: required ? "unavailable" : "ready",
    reason: required ? "unavailable" : null,
    warnings,
    routingDraftAssignmentAllowed: false,
    employmentRoutingStatus: text(record.employment_routing_status) || "stale",
    employmentRoutingCodes: records(record.employment_routing_codes),
  };
  if (!READY_STATES.has(state)) return {
    status: required && state === "stale" ? "stale" : required ? "checking" : "ready",
    reason: required && state === "stale" ? "stale" : required ? "checking" : null,
    warnings,
    routingDraftAssignmentAllowed: false,
    employmentRoutingStatus: text(record.employment_routing_status) || "stale",
    employmentRoutingCodes: records(record.employment_routing_codes),
  };
  const recordBasis = text(record.basis_token ?? record.basisToken);
  const expiresAt = timestamp(record.expires_at ?? record.expiresAt);
  if (
    (required && !recordBasis)
    || (recordBasis && recordBasis !== basisToken)
    || (expiresAt !== null && expiresAt <= now)
  ) return {
    status: required ? "stale" : "ready",
    reason: required ? "stale" : null,
    warnings,
    routingDraftAssignmentAllowed: false,
    employmentRoutingStatus: text(record.employment_routing_status) || "stale",
    employmentRoutingCodes: records(record.employment_routing_codes),
  };
  return {
    status: "ready",
    reason: null,
    warnings,
    // Missing means false. A legacy or partial ready response must never look
    // green before the resolver has explicitly proved this exact concept drop.
    routingDraftAssignmentAllowed: record.routing_draft_assignment_allowed === true,
    employmentRoutingStatus: text(record.employment_routing_status) || "stale",
    employmentRoutingCodes: records(record.employment_routing_codes),
  };
}

function combineStatus(localStatus, remoteStatus) {
  const states = [localStatus, remoteStatus];
  if (states.includes("unavailable")) return "unavailable";
  if (states.includes("checking")) return "checking";
  if (states.includes("stale")) return "stale";
  return "ready";
}

function dedupeWarnings(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${text(item?.code)}|${text(item?.severity)}|${text(item?.detail || item?.message)}`;
    if (!text(item?.code) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function occurrenceContext(occurrence, supplied) {
  return {
    ...(occurrence?.metadata?.eligibility_context || {}),
    ...(occurrence?.service_context_snapshot || {}),
    ...(occurrence?.eligibility_context_snapshot || {}),
    ...(supplied || {}),
  };
}

export function buildOccurrenceEligibilityShift({
  occurrence,
  serviceDate = null,
  startTime = null,
  endTime = null,
  shiftContext = null,
} = {}) {
  if (!occurrence) return null;
  const date = toDateKey(serviceDate || occurrence.service_date);
  const projection = getTaskOccurrenceDayProjection(occurrence, date);
  if (!date || (!projection && (!startTime || !endTime))) return null;
  const context = occurrenceContext(occurrence, shiftContext);
  const resolvedStart = startTime || projection?.startTime;
  const resolvedEnd = endTime || projection?.endTime;
  return {
    ...context,
    id: context.id || `eligibility-occurrence-${occurrence.id || occurrence.source_key || date}`,
    revision: Number(occurrence.revision || 1),
    source_type: "task",
    source_id: occurrence.object_task_definition_id || null,
    service_date: date,
    end_date: resolvedEnd === "24:00" ? date : (context.end_date || null),
    start_time: resolvedStart,
    end_time: resolvedEnd,
    company_id: occurrence.company_id ?? context.company_id ?? null,
    customer_id: occurrence.customer_id ?? context.customer_id ?? null,
    object_id: occurrence.object_id ?? context.object_id ?? null,
    task_occurrence_ids: [occurrence.id].filter(Boolean),
    task_id: context.task_id || occurrence.metadata?.task_id || null,
    task_type: occurrence.task_type || context.task_type || null,
    task_type_key: occurrence.task_type_key || context.task_type_key || occurrence.task_type || context.task_type || null,
    required_task_types: records(context.required_task_types || occurrence.required_task_types),
    name: occurrence.task_name_snapshot || context.name || "Taak",
    object_name_snapshot: occurrence.object_name_snapshot || context.object_name_snapshot || null,
    customer_name_snapshot: occurrence.customer_name_snapshot || context.customer_name_snapshot || null,
  };
}

export function createPlanningEligibilityIndex({
  personnel = [],
  shifts = [],
  assignments = [],
  absences = [],
  qualifications = [],
  securityPasses = [],
  restrictions = [],
  contracts = [],
  dependencies = {},
  serverDecisions = [],
  requireServerDecision = true,
  now,
  maxAgeMs = 120_000,
  minimumRestMinutes,
  evaluateWarnings = getAssignmentWarnings,
} = {}) {
  const fixedNow = now === undefined || typeof now === "function" ? null : timestamp(now);
  const readNow = typeof now === "function"
    ? () => timestamp(now()) ?? Date.now()
    : fixedNow === null
      ? () => Date.now()
      : () => fixedNow;
  const dependencyStatesAt = queryNow => Object.fromEntries(PLANNING_ELIGIBILITY_DEPENDENCIES.map(name => [
    name,
    normalizeDependency(name, dependencies[name], queryNow, maxAgeMs),
  ]));
  const dependencyStates = dependencyStatesAt(readNow());
  const localStatus = aggregateDependencyStatus(dependencyStates);
  const basisToken = basisTokenFor(dependencyStates, PLANNING_ELIGIBILITY_REMOTE_FACT_DEPENDENCIES);
  const scheduleBasisToken = basisTokenFor(dependencyStates);
  const remoteByKey = normalizeRemoteDecisions(serverDecisions);
  const personnelById = new Map(records(personnel).map(item => [text(item?.id), item]).filter(([id]) => id));
  const shiftById = new Map(records(shifts).map(item => [text(item?.id), item]).filter(([id]) => id));
  const grouped = {
    assignments: groupPersonnelRecords(assignments),
    absences: groupPersonnelRecords(absences),
    qualifications: groupPersonnelRecords(qualifications),
    securityPasses: groupPersonnelRecords(securityPasses),
    restrictions: groupPersonnelRecords(restrictions),
    contracts: groupPersonnelRecords(contracts),
  };
  const cache = new Map();
  const stats = { evaluations: 0, cacheHits: 0 };

  function queryShift({
    personnelId: requestedPersonnelId,
    shift,
    excludeAssignmentId = null,
    kind = "shift",
    occurrenceId = null,
  } = {}) {
    const id = text(requestedPersonnelId);
    const candidateKey = planningEligibilityCandidateKey({
      kind,
      personnelId: id,
      shift,
      occurrenceId,
      excludeAssignmentId,
    });
    const queryNow = readNow();
    const currentDependencyStates = dependencyStatesAt(queryNow);
    const currentLocalStatus = aggregateDependencyStatus(currentDependencyStates);
    const currentBasisToken = basisTokenFor(
      currentDependencyStates,
      PLANNING_ELIGIBILITY_REMOTE_FACT_DEPENDENCIES,
    );
    const currentScheduleBasisToken = basisTokenFor(currentDependencyStates);
    const person = personnelById.get(id);
    const remote = remoteVerdict({
      remoteDecisions: remoteByKey,
      candidateKey,
      basisToken: currentBasisToken,
      now: queryNow,
      required: requireServerDecision,
    });
    const cacheKey = `${currentScheduleBasisToken}|${candidateKey}|${text(excludeAssignmentId)}|${requireServerDecision ? "server" : "local"}|${remote.status}:${remote.reason || ""}:${remote.routingDraftAssignmentAllowed ? "draft" : "blocked"}:${remote.employmentRoutingStatus}`;
    if (cache.has(cacheKey)) {
      stats.cacheHits += 1;
      return cache.get(cacheKey);
    }

    const knownAssignments = recordsForPersonnel(grouped.assignments, id);
    const linkedShifts = knownAssignments
      .map(item => shiftById.get(assignmentShiftId(item)))
      .filter(Boolean);
    const localWarnings = person && shift
      ? evaluateWarnings({
          personnel: person,
          shift,
          assignments: knownAssignments,
          shifts: [shift, ...linkedShifts],
          absences: recordsForPersonnel(grouped.absences, id),
          qualifications: recordsForPersonnel(grouped.qualifications, id),
          securityPasses: recordsForPersonnel(grouped.securityPasses, id),
          restrictions: recordsForPersonnel(grouped.restrictions, id),
          contracts: recordsForPersonnel(grouped.contracts, id),
          excludeAssignmentId,
          minimumRestMinutes,
        })
      : [];
    stats.evaluations += 1;

    const missingTargetStatus = !person || !shift ? "unavailable" : currentLocalStatus;
    const status = combineStatus(missingTargetStatus, remote.status);
    const warnings = dedupeWarnings([...localWarnings, ...remote.warnings]);
    const hasNonRoutingCritical = warnings.some(item => (
      item.severity === "critical"
      && !DRAFT_ROUTING_WARNING_CODES.has(text(item.code).toLowerCase())
    ));
    const draftAssignmentAllowed = status === "ready"
      && remote.routingDraftAssignmentAllowed === true
      && !hasNonRoutingCritical;
    const notices = freshnessNotices(status, currentDependencyStates, remote.reason);
    if (!person) notices.push(notice(
      "eligibility_personnel_missing",
      "Medewerker niet beschikbaar",
      "De medewerker staat niet in de actuele planningsgegevens.",
    ));
    if (!shift) notices.push(notice(
      "eligibility_shift_missing",
      "Dienst niet beschikbaar",
      "De taak of dienst kan niet veilig worden gecontroleerd.",
    ));
    const result = Object.freeze({
      candidateKey,
      basisToken: currentBasisToken,
      remoteFactsBasisToken: currentBasisToken,
      scheduleBasisToken: currentScheduleBasisToken,
      status,
      warnings,
      warningSnapshot: warnings,
      notices,
      displayWarnings: dedupeWarnings([...warnings, ...notices]),
      hasCritical: warnings.some(item => item.severity === "critical"),
      hasWarnings: warnings.length > 0,
      draftAssignmentAllowed,
      draft_assignment_allowed: draftAssignmentAllowed,
      routingDraftAssignmentAllowed: remote.routingDraftAssignmentAllowed === true,
      routing_draft_assignment_allowed: remote.routingDraftAssignmentAllowed === true,
      employmentRoutingStatus: remote.employmentRoutingStatus,
      employment_routing_status: remote.employmentRoutingStatus,
      employmentRoutingCodes: Object.freeze([...remote.employmentRoutingCodes]),
      employment_routing_codes: Object.freeze([...remote.employmentRoutingCodes]),
      // Green is affirmative proof, not merely the absence of a warning. A
      // partial/legacy ready record without the explicit draft gate remains
      // amber so hover and drop can never disagree.
      isClear: draftAssignmentAllowed && warnings.length === 0,
      serverFinalAuthority: true,
      dependencyStates: currentDependencyStates,
    });
    cache.set(cacheKey, result);
    return result;
  }

  function queryOccurrence({
    personnelId: requestedPersonnelId,
    occurrence,
    serviceDate = null,
    startTime = null,
    endTime = null,
    shiftContext = null,
  } = {}) {
    const shift = buildOccurrenceEligibilityShift({ occurrence, serviceDate, startTime, endTime, shiftContext });
    return queryShift({
      personnelId: requestedPersonnelId,
      shift,
      kind: "occurrence",
      occurrenceId: occurrence?.id || occurrence?.source_key || null,
    });
  }

  function prewarm(candidates = []) {
    return candidates.map(candidate => (
      candidate?.occurrence ? queryOccurrence(candidate) : queryShift(candidate)
    ));
  }

  return Object.freeze({
    basisToken,
    remoteFactsBasisToken: basisToken,
    scheduleBasisToken,
    status: localStatus,
    dependencyStates,
    queryShift,
    queryOccurrence,
    prewarm,
    stats,
  });
}
