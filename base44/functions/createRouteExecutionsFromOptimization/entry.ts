import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function nowIso() { return new Date().toISOString(); }
function secondsFromTime(time) { if (!time) return null; const [h, m = 0] = String(time).split(':').map(Number); return Number.isFinite(h) ? h * 3600 + (Number.isFinite(m) ? m * 60 : 0) : null; }
function safeNumber(value) {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function normalizeCoordinatePair(latitudeValue, longitudeValue) {
  const latitude = safeNumber(latitudeValue);
  const longitude = safeNumber(longitudeValue);
  if (
    latitude === null || latitude < -90 || latitude > 90 ||
    longitude === null || longitude < -180 || longitude > 180 ||
    (latitude === 0 && longitude === 0)
  ) return null;
  return { latitude, longitude };
}
function taskCoordinatePair(task, object) {
  return normalizeCoordinatePair(task?.latitude, task?.longitude)
    || normalizeCoordinatePair(object?.latitude, object?.longitude);
}
function taskName(task, index, count) { return count > 1 && index ? `${task.name || task.object_name || task.task_type} (${index}/${count})` : (task.name || task.object_name || task.task_type || 'Taak'); }
function unwrapFunctionData(response) { return response?.data || response || null; }
function unique(values) { return [...new Set((values || []).filter(Boolean).map(String))]; }

const COMMERCIAL_TASK_TYPE_KEYS = new Set([
  'object_security', 'fire_closing_round', 'external_closing_round',
  'external_control_round', 'opening_round', 'mobile_control_round',
  'reception', 'closing_assistance', 'access_control', 'fire_watch', 'concierge',
]);
const LEGACY_COMMERCIAL_TASK_TYPE_ALIASES = {
  objectbeveiliging: 'object_security',
  brand_en_sluitronde: 'fire_closing_round',
  brand_sluitronde: 'fire_closing_round',
  externe_sluitronde: 'external_closing_round',
  externe_controleronde: 'external_control_round',
  openingsronde: 'opening_round',
  mobiele_controleronde: 'mobile_control_round',
  receptie: 'reception',
  receptiedienst: 'reception',
  sluitbegeleiding: 'closing_assistance',
  toegangscontrole: 'access_control',
  brandwacht: 'fire_watch',
  portier: 'concierge',
  portier_concierge: 'concierge',
  concierge: 'concierge',
};

function compactRoutingValue(value) { return String(value ?? '').trim(); }
function normalizedCommercialTaskToken(value) {
  return compactRoutingValue(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
function legacyCommercialTaskTypeKey(value) {
  const normalized = normalizedCommercialTaskToken(value);
  if (!normalized) return null;
  if (COMMERCIAL_TASK_TYPE_KEYS.has(normalized) && normalized !== 'other') return normalized;
  return LEGACY_COMMERCIAL_TASK_TYPE_ALIASES[normalized] || null;
}
function isCanonicalCommercialTaskTypeKey(value) {
  const key = compactRoutingValue(value);
  return COMMERCIAL_TASK_TYPE_KEYS.has(key) || /^other:[a-z0-9][a-z0-9._:-]{0,159}$/.test(key);
}
function routingProjectionError(code, message, details = {}) {
  const error = new Error(message);
  error.status = 409;
  error.code = code;
  error.details = details;
  return error;
}
function consistentRoutingValue(sources, field) {
  const values = unique(sources.map(source => compactRoutingValue(source?.[field])));
  if (values.length > 1) {
    throw routingProjectionError('TASK_EXECUTION_ROUTING_MISMATCH', `Tegenstrijdige ${field} in de taakroutering.`, { field, values });
  }
  return values[0] || null;
}
function publishedRoutingSources(evidence) {
  return [
    evidence?.segment,
    evidence?.segment?.commercial_routing_snapshot,
    evidence?.occurrence,
    evidence?.occurrence?.commercial_routing_snapshot,
    evidence?.shift,
    evidence?.shift?.service_context_snapshot,
  ].filter(Boolean);
}
function projectedTaskTypeKey(task, sourceTask = {}, evidence = null) {
  const routingSources = [
    ...publishedRoutingSources(evidence),
    task,
    task?.commercial_routing_snapshot,
    sourceTask,
    sourceTask?.commercial_routing_snapshot,
  ].filter(Boolean);
  const explicitKeys = unique(routingSources.map(source => compactRoutingValue(source?.task_type_key)));
  const invalidExplicitKeys = explicitKeys.filter(key => !isCanonicalCommercialTaskTypeKey(key));
  if (invalidExplicitKeys.length) {
    throw routingProjectionError('TASK_EXECUTION_TASK_TYPE_INVALID', 'De taak bevat geen geldige canonieke task_type_key.', { task_type_keys: invalidExplicitKeys });
  }
  const legacyKeys = unique([task?.task_type, sourceTask?.task_type].map(legacyCommercialTaskTypeKey));
  const candidates = unique([...explicitKeys, ...legacyKeys]);
  if (candidates.length > 1) {
    throw routingProjectionError('TASK_EXECUTION_TASK_TYPE_MISMATCH', 'De canonieke taaksoort komt niet overeen met de legacy taaksoort.', { task_type_keys: candidates });
  }
  return candidates[0] || null;
}
function projectedCustomerBillable(task, sourceTask = {}, object = {}, evidence = null) {
  const directValues = [
    evidence?.segment?.customer_billable,
    evidence?.segment?.commercial_routing_snapshot?.customer_billable,
    evidence?.occurrence?.customer_billable,
    evidence?.occurrence?.commercial_routing_snapshot?.customer_billable,
    evidence?.shift?.customer_billable,
    evidence?.shift?.service_context_snapshot?.customer_billable,
    task?.customer_billable,
    task?.commercial_routing_snapshot?.customer_billable,
    sourceTask?.customer_billable,
    sourceTask?.commercial_routing_snapshot?.customer_billable,
  ].filter(value => typeof value === 'boolean');
  const uniqueDirectValues = [...new Set(directValues)];
  if (uniqueDirectValues.length > 1) {
    throw routingProjectionError('TASK_EXECUTION_CUSTOMER_BILLABLE_MISMATCH', 'De facturatie-indicatie van de taak is tegenstrijdig.');
  }
  if (evidence?.verified && !directValues.some(value => typeof value === 'boolean')) {
    throw routingProjectionError('TASK_EXECUTION_PUBLISHED_BILLABLE_MISSING', 'De gepubliceerde dienst mist een expliciete facturatie-indicatie.');
  }
  if (uniqueDirectValues.length === 1) return uniqueDirectValues[0];
  if (typeof object?.default_customer_billable === 'boolean') return object.default_customer_billable;
  throw routingProjectionError('TASK_EXECUTION_CUSTOMER_BILLABLE_MISSING', 'De taak mist een expliciete indicatie of deze klantfactureerbaar is.');
}
function buildTaskExecutionRoutingProjection(task, sourceTask = {}, object = {}, resolution = null, evidence = null) {
  const evidenceSources = publishedRoutingSources(evidence);
  const routingSources = [
    ...evidenceSources,
    task,
    task?.commercial_routing_snapshot,
    sourceTask,
    sourceTask?.commercial_routing_snapshot,
  ].filter(Boolean);
  const claimedCommercialRoutingStatus = consistentRoutingValue([
    { commercial_routing_status: evidence?.segment?.commercial_routing_status },
    { commercial_routing_status: evidence?.segment?.commercial_routing_snapshot?.status },
    { commercial_routing_status: evidence?.occurrence?.commercial_routing_status },
    { commercial_routing_status: evidence?.occurrence?.commercial_routing_snapshot?.status },
    { commercial_routing_status: task?.commercial_routing_status },
    { commercial_routing_status: sourceTask?.commercial_routing_status },
    { commercial_routing_status: task?.commercial_routing_snapshot?.status },
    { commercial_routing_status: sourceTask?.commercial_routing_snapshot?.status },
  ], 'commercial_routing_status');
  const employingCompanyId = resolution ? consistentRoutingValue([
    { employing_company_id: resolution?.employing_company_id },
    { employing_company_id: resolution?.company_id },
    { employing_company_id: resolution?.selected_contract?.company_id },
  ], 'employing_company_id') : null;
  const payrollCaoKey = resolution ? consistentRoutingValue([
    { payroll_cao_key: resolution?.payroll_cao_key },
    { payroll_cao_key: resolution?.cao_key },
    { payroll_cao_key: resolution?.selected_contract?.cao_key },
  ], 'payroll_cao_key') : null;
  const taskTypeKey = projectedTaskTypeKey(task, sourceTask, evidence);
  const sellingCompanyId = consistentRoutingValue([
    ...routingSources,
    { selling_company_id: evidence?.contract?.company_id },
    { selling_company_id: evidence?.line?.company_id },
  ], 'selling_company_id');
  const customerId = consistentRoutingValue([
    ...routingSources,
    { customer_id: evidence?.contract?.customer_id },
    { customer_id: evidence?.line?.customer_id },
    { customer_id: object?.customer_id },
  ], 'customer_id');
  const customerAccountId = consistentRoutingValue([
    ...routingSources,
    { customer_account_id: evidence?.contract?.customer_account_id },
    { customer_account_id: evidence?.line?.customer_account_id },
  ], 'customer_account_id');
  const customerContractId = consistentRoutingValue([
    ...routingSources,
    { customer_contract_id: evidence?.contract?.id },
    { customer_contract_id: evidence?.line?.contract_id },
  ], 'customer_contract_id');
  const customerContractLineId = consistentRoutingValue([
    ...routingSources,
    { customer_contract_line_id: evidence?.line?.id },
  ], 'customer_contract_line_id');
  const customerBillable = projectedCustomerBillable(task, sourceTask, object, evidence);
  const verifiedSnapshot = evidence?.verified
    ? {
        ...(evidence.segment?.commercial_routing_snapshot || evidence.occurrence?.commercial_routing_snapshot || {}),
        schema_version: 1,
        status: claimedCommercialRoutingStatus,
        task_type_key: taskTypeKey,
        customer_id: customerId,
        customer_account_id: customerAccountId,
        selling_company_id: sellingCompanyId,
        customer_contract_id: customerContractId,
        customer_contract_line_id: customerContractLineId,
        customer_billable: customerBillable,
        planning_shift_id: evidence.shift?.id || null,
        planning_task_occurrence_id: evidence.occurrence?.id || null,
        planning_shift_task_segment_id: evidence.segment?.id || null,
      }
    : null;
  const commercialRoutingStatus = evidence?.verified ? claimedCommercialRoutingStatus : 'stale';
  const commercialRoutingSnapshot = verifiedSnapshot || {
    schema_version: 1,
    status: 'stale',
    reason: 'published_commercial_route_evidence_missing',
    task_type_key: taskTypeKey,
    customer_id: customerId,
    customer_account_id: customerAccountId,
    selling_company_id: sellingCompanyId,
    customer_contract_id: customerContractId,
    customer_contract_line_id: customerContractLineId,
    customer_billable: customerBillable,
    planning_shift_id: evidence?.shift?.id || null,
    planning_task_occurrence_id: evidence?.occurrence?.id || null,
    planning_shift_task_segment_id: evidence?.segment?.id || null,
  };
  const projection = {
    task_type_key: taskTypeKey,
    selling_company_id: sellingCompanyId,
    service_responsible_company_id: consistentRoutingValue(routingSources, 'service_responsible_company_id'),
    supplying_company_id: resolution
      ? consistentRoutingValue([{ supplying_company_id: resolution?.supplying_company_id }], 'supplying_company_id')
      : null,
    customer_id: customerId,
    customer_account_id: customerAccountId,
    customer_contract_id: customerContractId,
    customer_contract_line_id: customerContractLineId,
    customer_contract_rate_id: consistentRoutingValue(routingSources, 'customer_contract_rate_id'),
    customer_snapshot: task?.customer_snapshot || sourceTask?.customer_snapshot || null,
    operating_company_snapshot: task?.operating_company_snapshot || sourceTask?.operating_company_snapshot || null,
    selling_company_snapshot: task?.selling_company_snapshot || sourceTask?.selling_company_snapshot || null,
    commercial_contract_snapshot: task?.commercial_contract_snapshot || sourceTask?.commercial_contract_snapshot || commercialRoutingSnapshot,
    commercial_rate_snapshot: task?.commercial_rate_snapshot || sourceTask?.commercial_rate_snapshot || null,
    commercial_routing_status: commercialRoutingStatus,
    commercial_routing_snapshot: commercialRoutingSnapshot,
    customer_billable: customerBillable,
    employing_company_id: employingCompanyId,
    payroll_cao_key: payrollCaoKey,
  };
  if (claimedCommercialRoutingStatus === 'resolved' && (
    !projection.task_type_key
    || !projection.selling_company_id
    || !projection.customer_id
    || !projection.customer_account_id
    || !projection.customer_contract_id
    || !projection.customer_contract_line_id
  )) {
    throw routingProjectionError('TASK_EXECUTION_COMMERCIAL_ROUTE_INCOMPLETE', 'De opgeloste commerciële taakroutering mist verplichte bewijsvelden.');
  }
  if (claimedCommercialRoutingStatus === 'not_applicable' && (
    projection.customer_billable !== false
    || projection.customer_id
    || projection.customer_account_id
    || projection.selling_company_id
    || projection.customer_contract_id
    || projection.customer_contract_line_id
    || projection.customer_contract_rate_id
  )) {
    throw routingProjectionError('TASK_EXECUTION_COMMERCIAL_ROUTE_MISMATCH', 'Een niet-factureerbare taak bevat toch commerciële contractroutering.');
  }
  return projection;
}

function routingIdFromAliases(sources, fields, label) {
  const values = unique(sources.flatMap(source => fields.map(field => compactRoutingValue(source?.[field]))));
  if (values.length > 1) {
    throw routingProjectionError('TASK_EXECUTION_PLANNING_LINK_MISMATCH', `Tegenstrijdige ${label} in de planningskoppeling.`, { label, values });
  }
  return values[0] || null;
}

function recordRevision(value) {
  const revision = Number(value?.revision ?? value?.version ?? 0);
  return Number.isFinite(revision) ? revision : 0;
}

function dateWithin(value, from, until, requireStart = false) {
  const date = compactRoutingValue(value);
  const start = compactRoutingValue(from);
  const end = compactRoutingValue(until);
  if (!date || (requireStart && !start)) return false;
  return (!start || start <= date) && (!end || date <= end);
}

async function publishedRoutingRecord(base44, entityName, id) {
  const entity = base44?.asServiceRole?.entities?.[entityName];
  if (!entity?.get) {
    throw routingProjectionError('TASK_EXECUTION_PLANNING_EVIDENCE_UNAVAILABLE', `${entityName} is niet beschikbaar voor routeverificatie.`, { entity: entityName, id });
  }
  let record = null;
  try {
    record = await entity.get(id);
  } catch (_error) {
    record = null;
  }
  if (!record) {
    throw routingProjectionError('TASK_EXECUTION_PLANNING_EVIDENCE_MISSING', `Gepubliceerd planningsbewijs ${entityName} bestaat niet.`, { entity: entityName, id });
  }
  return record;
}

function requireFreshPublishedRecord(record, entityName) {
  const revision = recordRevision(record);
  const publishedRevision = Number(record?.published_revision || 0);
  const statusOk = entityName === 'PlanningTaskOccurrence'
    ? record?.lifecycle_status === 'active'
    : record?.status === 'published';
  if (!statusOk || revision < 1 || publishedRevision !== revision) {
    throw routingProjectionError('TASK_EXECUTION_PLANNING_EVIDENCE_STALE', `${entityName} is niet meer gelijk aan de gepubliceerde revisie.`, {
      entity: entityName,
      id: record?.id || null,
      revision,
      published_revision: publishedRevision,
      status: record?.status || record?.lifecycle_status || null,
    });
  }
}

function commercialEvidenceStatus(segment, occurrence) {
  return consistentRoutingValue([
    { commercial_routing_status: segment?.commercial_routing_status },
    { commercial_routing_status: segment?.commercial_routing_snapshot?.status },
    { commercial_routing_status: occurrence?.commercial_routing_status },
    { commercial_routing_status: occurrence?.commercial_routing_snapshot?.status },
  ], 'commercial_routing_status');
}

async function loadPublishedTaskRoutingEvidence(base44, task, sourceTask = {}, serviceDate = null) {
  const linkSources = [task, sourceTask].filter(Boolean);
  const directSegmentId = routingIdFromAliases(linkSources, [
    'planning_shift_task_segment_id', 'planning_task_segment_id', 'shift_task_segment_id', 'task_segment_id',
  ], 'PlanningShiftTaskSegment-id');
  const directOccurrenceId = routingIdFromAliases(linkSources, [
    'planning_task_occurrence_id', 'task_occurrence_id',
  ], 'PlanningTaskOccurrence-id');
  const directShiftId = routingIdFromAliases(linkSources, ['planning_shift_id'], 'PlanningShift-id');
  if (!directSegmentId && !directOccurrenceId && !directShiftId) return null;

  const segment = directSegmentId
    ? await publishedRoutingRecord(base44, 'PlanningShiftTaskSegment', directSegmentId)
    : null;
  if (segment) requireFreshPublishedRecord(segment, 'PlanningShiftTaskSegment');
  const occurrenceId = routingIdFromAliases([
    { planning_task_occurrence_id: directOccurrenceId },
    { planning_task_occurrence_id: segment?.task_occurrence_id },
  ], ['planning_task_occurrence_id'], 'PlanningTaskOccurrence-id');
  const shiftId = routingIdFromAliases([
    { planning_shift_id: directShiftId },
    { planning_shift_id: segment?.shift_id },
  ], ['planning_shift_id'], 'PlanningShift-id');
  const [occurrence, shift] = await Promise.all([
    occurrenceId ? publishedRoutingRecord(base44, 'PlanningTaskOccurrence', occurrenceId) : null,
    shiftId ? publishedRoutingRecord(base44, 'PlanningShift', shiftId) : null,
  ]);
  if (occurrence) requireFreshPublishedRecord(occurrence, 'PlanningTaskOccurrence');
  if (shift) requireFreshPublishedRecord(shift, 'PlanningShift');
  if (segment && occurrence && String(segment.task_occurrence_id) !== String(occurrence.id)) {
    throw routingProjectionError('TASK_EXECUTION_PLANNING_LINK_MISMATCH', 'Taaksegment en taakoccurrence horen niet bij elkaar.');
  }
  if (segment && shift && String(segment.shift_id) !== String(shift.id)) {
    throw routingProjectionError('TASK_EXECUTION_PLANNING_LINK_MISMATCH', 'Taaksegment en dienst horen niet bij elkaar.');
  }
  if (serviceDate && occurrence?.service_date && String(occurrence.service_date) !== String(serviceDate)) {
    throw routingProjectionError('TASK_EXECUTION_PLANNING_DATE_MISMATCH', 'De taakoccurrence hoort bij een andere servicedatum.');
  }
  if (serviceDate && shift?.service_date && String(shift.service_date) !== String(serviceDate)) {
    throw routingProjectionError('TASK_EXECUTION_PLANNING_DATE_MISMATCH', 'De gepubliceerde dienst hoort bij een andere servicedatum.');
  }
  if (serviceDate && segment && !dateWithin(serviceDate, segment.start_date, segment.end_date || segment.start_date)) {
    throw routingProjectionError('TASK_EXECUTION_PLANNING_DATE_MISMATCH', 'Het taaksegment dekt de servicedatum niet.');
  }

  const evidence = { linked: true, verified: Boolean(segment && occurrence && shift), segment, occurrence, shift, contract: null, line: null };
  if (!evidence.verified) return evidence;
  const status = commercialEvidenceStatus(segment, occurrence);
  const snapshot = segment.commercial_routing_snapshot || occurrence.commercial_routing_snapshot || null;
  if (!status || Number(snapshot?.schema_version) !== 1 || snapshot?.status !== status) {
    throw routingProjectionError('TASK_EXECUTION_COMMERCIAL_EVIDENCE_INVALID', 'Het gepubliceerde commerciële routebewijs is ongeldig of incompleet.');
  }
  const customerBillableValues = [
    segment.customer_billable,
    segment.commercial_routing_snapshot?.customer_billable,
    occurrence.customer_billable,
    occurrence.commercial_routing_snapshot?.customer_billable,
    shift.customer_billable,
    shift.service_context_snapshot?.customer_billable,
  ].filter(value => typeof value === 'boolean');
  if (customerBillableValues.length === 0) {
    throw routingProjectionError('TASK_EXECUTION_PUBLISHED_BILLABLE_MISSING', 'Het gepubliceerde commerciële routebewijs mist een expliciete facturatie-indicatie.');
  }
  if (new Set(customerBillableValues).size > 1) {
    throw routingProjectionError('TASK_EXECUTION_CUSTOMER_BILLABLE_MISMATCH', 'De gepubliceerde facturatie-indicatie is tegenstrijdig.');
  }
  if (status === 'not_applicable') {
    const identityValues = unique([
      segment.customer_id, occurrence.customer_id, shift.customer_id, ...unique(shift.customer_ids),
      segment.selling_company_id, occurrence.selling_company_id, shift.selling_company_id,
      ...unique(shift.selling_company_ids),
      segment.customer_contract_id, occurrence.customer_contract_id, shift.customer_contract_id,
      segment.customer_contract_line_id, occurrence.customer_contract_line_id, shift.customer_contract_line_id,
      snapshot.customer_id, snapshot.customer_account_id, snapshot.selling_company_id,
      snapshot.customer_contract_id, snapshot.customer_contract_line_id,
      shift.service_context_snapshot?.customer_id,
      ...unique(shift.service_context_snapshot?.customer_ids),
    ]);
    if (
      customerBillableValues[0] !== false
      || snapshot.reason !== 'explicit_internal_non_billable'
      || snapshot.customer_billable !== false
      || Number(snapshot.candidate_count) !== 0
      || identityValues.length > 0
      || !unique(snapshot.evidence_shift_ids).includes(String(shift.id))
      || !unique(snapshot.evidence_segment_ids).includes(String(segment.id))
    ) {
      throw routingProjectionError('TASK_EXECUTION_COMMERCIAL_EVIDENCE_INVALID', 'De interne niet-factureerbare taak mist sluitend gepubliceerd bewijs.');
    }
    return evidence;
  }
  if (status !== 'resolved') {
    throw routingProjectionError('TASK_EXECUTION_COMMERCIAL_ROUTE_UNRESOLVED', 'De gepubliceerde commerciële route is niet opgelost.', { status });
  }
  if (customerBillableValues[0] !== true || snapshot.customer_billable !== true) {
    throw routingProjectionError('TASK_EXECUTION_COMMERCIAL_EVIDENCE_INVALID', 'Een opgeloste commerciële route moet expliciet klantfactureerbaar zijn.');
  }

  const contractId = consistentRoutingValue([segment, segment.commercial_routing_snapshot, occurrence, occurrence.commercial_routing_snapshot], 'customer_contract_id');
  const lineId = consistentRoutingValue([segment, segment.commercial_routing_snapshot, occurrence, occurrence.commercial_routing_snapshot], 'customer_contract_line_id');
  if (!contractId || !lineId) {
    throw routingProjectionError('TASK_EXECUTION_COMMERCIAL_EVIDENCE_INVALID', 'Het gepubliceerde routebewijs mist contract- of regelidentiteit.');
  }
  const [contract, line] = await Promise.all([
    publishedRoutingRecord(base44, 'CustomerContract', contractId),
    publishedRoutingRecord(base44, 'CustomerContractLine', lineId),
  ]);
  const snapshotContractVersion = Number(snapshot.customer_contract_version || 0);
  const snapshotLineVersion = Number(snapshot.customer_contract_line_version || 0);
  const serviceEndDate = occurrence.end_date || occurrence.service_date;
  const explicitLineTaskType = compactRoutingValue(line.task_type_key);
  const lineTaskTypeKey = explicitLineTaskType
    ? (isCanonicalCommercialTaskTypeKey(explicitLineTaskType) ? explicitLineTaskType : null)
    : legacyCommercialTaskTypeKey(line.service_code);
  const expectedTaskTypeKey = projectedTaskTypeKey(task, sourceTask, evidence);
  let lineScopeMatches = line.scope_type === 'customer'
    ? !compactRoutingValue(line.object_id) && !compactRoutingValue(line.collective_id)
    : line.scope_type === 'object'
      ? !compactRoutingValue(line.collective_id) && String(line.object_id || '') === String(occurrence.object_id || '')
      : false;
  if (line.scope_type === 'collective' && !compactRoutingValue(line.object_id) && compactRoutingValue(line.collective_id)) {
    const collective = await publishedRoutingRecord(base44, 'Collectief', line.collective_id);
    lineScopeMatches = String(collective.customer_id || '') === String(occurrence.customer_id || '')
      && unique(collective.object_ids).includes(String(occurrence.object_id));
  }
  if (
    !['active', 'ended', 'superseded'].includes(contract.status)
    || !['active', 'ended'].includes(line.status)
    || String(line.contract_id) !== String(contract.id)
    || !compactRoutingValue(contract.company_id)
    || String(line.company_id) !== String(contract.company_id)
    || String(line.customer_id) !== String(contract.customer_id)
    || String(line.customer_account_id) !== String(contract.customer_account_id)
    || lineTaskTypeKey !== expectedTaskTypeKey
    || !lineScopeMatches
    || !dateWithin(occurrence.service_date, contract.start_date, contract.end_date, true)
    || !dateWithin(serviceEndDate, contract.start_date, contract.end_date, true)
    || !dateWithin(occurrence.service_date, line.valid_from, line.valid_until)
    || !dateWithin(serviceEndDate, line.valid_from, line.valid_until)
    || snapshotContractVersion < 1
    || snapshotLineVersion < 1
    || recordRevision(contract) < snapshotContractVersion
    || recordRevision(line) < snapshotLineVersion
  ) {
    throw routingProjectionError('TASK_EXECUTION_COMMERCIAL_EVIDENCE_MISMATCH', 'Contract, regel en gepubliceerd routebewijs zijn niet meer aantoonbaar consistent.');
  }
  evidence.contract = contract;
  evidence.line = line;
  return evidence;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function normalizeRoutingStatus(resolution) {
  if (!resolution) return 'blocked';
  if (resolution.status === 'resolved' && resolution.planning_allowed === true) return 'resolved';
  if (resolution.status === 'blocked' || (resolution.blocking_reasons || []).length > 0) return 'blocked';
  if (resolution.status === 'manual_review_required' || resolution.manual_review_required === true) return 'manual_review_required';
  return 'blocked';
}

function resolvedEmploymentProjection(resolution) {
  const contractIds = unique([resolution?.contract_id, resolution?.selected_contract?.id]);
  const employingCompanyIds = unique([
    resolution?.employing_company_id,
    resolution?.company_id,
    resolution?.selected_contract?.company_id,
  ]);
  const payrollCaoKeys = unique([
    resolution?.payroll_cao_key,
    resolution?.cao_key,
    resolution?.selected_contract?.cao_key,
  ]);
  if (contractIds.length !== 1 || employingCompanyIds.length !== 1 || payrollCaoKeys.length !== 1) {
    throw routingProjectionError('TASK_EXECUTION_EMPLOYMENT_ROUTE_MISMATCH', 'Arbeidscontract, werkgever of loon-CAO is niet eenduidig voor deze taak.', {
      personnel_contract_ids: contractIds,
      employing_company_ids: employingCompanyIds,
      payroll_cao_keys: payrollCaoKeys,
    });
  }
  return {
    personnel_contract_id: contractIds[0],
    employing_company_id: employingCompanyIds[0],
    payroll_cao_key: payrollCaoKeys[0],
    supplying_company_id: resolution?.supplying_company_id || null,
  };
}

function compactRoutingSnapshot(resolution, serviceContext, source) {
  if (!resolution) return {
    status: 'blocked',
    source,
    service_context: serviceContext,
    blocking_reasons: ['Contractresolver gaf geen resultaat terug.'],
    resolved_at: nowIso(),
  };
  return {
    status: normalizeRoutingStatus(resolution),
    source,
    resolved_at: nowIso(),
    personnel_id: resolution.personnel_id || null,
    company_id: resolution.company_id || serviceContext.operating_company_id || null,
    employing_company_id: resolution.employing_company_id || resolution.company_id || resolution.selected_contract?.company_id || null,
    contract_id: resolution.contract_id || resolution.selected_contract?.id || null,
    cao_key: resolution.cao_key || resolution.selected_contract?.cao_key || serviceContext.cao_key || null,
    payroll_cao_key: resolution.payroll_cao_key || resolution.cao_key || resolution.selected_contract?.cao_key || null,
    cao_configuration_id: resolution.cao_configuration_id || null,
    cao_version_label: resolution.cao_version_label || null,
    planning_allowed: resolution.planning_allowed === true,
    payroll_final_allowed: resolution.payroll_final_allowed === true,
    manual_review_required: resolution.manual_review_required === true,
    blocking_reasons: resolution.blocking_reasons || [],
    manual_review_reasons: resolution.manual_review_reasons || [],
    warnings: resolution.warnings || [],
    contract_selection_policy: resolution.contract_selection_policy || null,
    selected_contract: resolution.selected_contract ? {
      id: resolution.selected_contract.id,
      function_type: resolution.selected_contract.function_type || null,
      allowed_function_types: resolution.selected_contract.allowed_function_types || [],
      contract_start_date: resolution.selected_contract.contract_start_date || null,
      contract_end_date: resolution.selected_contract.statutory_conversion_applies === true
        ? (resolution.selected_contract.effective_contract_end_date || null)
        : (resolution.selected_contract.effective_contract_end_date
          ?? resolution.selected_contract.contract_end_date
          ?? null),
      legal_validation_status: resolution.selected_contract.legal_validation_status || null,
    } : null,
    function_match: resolution.function_match || null,
    qualification_check_status: resolution.qualification_check?.status || null,
    wpbr_permission_check_status: resolution.wpbr_permission_check?.status || null,
    service_context: serviceContext,
  };
}

function buildTaskContext(task, sourceTask, object, sourceRoute, route, serviceDate, evidence = null) {
  const operatingCompanyId = task.operating_company_id
    || sourceTask.operating_company_id
    || object.default_operating_company_id
    || object.operating_company_id
    || route.operating_company_id
    || sourceRoute.operating_company_id
    || null;
  return {
    service_date: serviceDate,
    operating_company_id: operatingCompanyId,
    company_id: operatingCompanyId,
    selling_company_id: consistentRoutingValue([
      ...publishedRoutingSources(evidence),
      task,
      task?.commercial_routing_snapshot,
      sourceTask,
      sourceTask?.commercial_routing_snapshot,
    ], 'selling_company_id'),
    service_responsible_company_id: consistentRoutingValue([
      ...publishedRoutingSources(evidence),
      task,
      task?.commercial_routing_snapshot,
      sourceTask,
      sourceTask?.commercial_routing_snapshot,
    ], 'service_responsible_company_id'),
    cao_key: task.cao_key || sourceTask.cao_key || object.cao_key || route.cao_key || sourceRoute.cao_key || null,
    function_type: task.service_function_type || sourceTask.service_function_type || object.default_service_function_type || null,
    task_type: task.task_type || sourceTask.task_type || null,
    task_type_key: projectedTaskTypeKey(task, sourceTask, evidence),
    cao_function_group: task.required_cao_function_group || sourceTask.required_cao_function_group || object.default_cao_function_group || null,
    cao_function_level: task.required_cao_function_level || sourceTask.required_cao_function_level || object.default_cao_function_level || null,
    security_role_status: task.required_security_role_status || sourceTask.required_security_role_status || object.default_security_role_status || null,
    performs_security_work: task.performs_security_work ?? sourceTask.performs_security_work ?? object.default_performs_security_work ?? object.performs_security_work ?? null,
    security_work_percentage: task.security_work_percentage ?? sourceTask.security_work_percentage ?? object.default_security_work_percentage ?? object.security_work_percentage ?? null,
    works_event_or_hospitality_security: task.works_event_or_hospitality_security ?? sourceTask.works_event_or_hospitality_security ?? object.default_works_event_or_hospitality_security ?? object.works_event_or_hospitality_security ?? null,
    event_hospitality_cao_applies: task.event_hospitality_cao_applies ?? sourceTask.event_hospitality_cao_applies ?? object.default_event_hospitality_cao_applies ?? object.event_hospitality_cao_applies ?? null,
    works_cash_value_logistics: task.works_cash_value_logistics ?? sourceTask.works_cash_value_logistics ?? object.default_works_cash_value_logistics ?? object.works_cash_value_logistics ?? null,
    object_id: task.object_id || sourceTask.object_id || object.id || null,
    contract_assignment_policy: 'strict_contract_match',
  };
}

function taskContextKey(context) {
  return JSON.stringify({
    service_date: context.service_date,
    operating_company_id: context.operating_company_id,
    selling_company_id: context.selling_company_id,
    service_responsible_company_id: context.service_responsible_company_id,
    cao_key: context.cao_key,
    function_type: context.function_type,
    task_type: context.task_type,
    task_type_key: context.task_type_key,
    cao_function_group: context.cao_function_group,
    cao_function_level: context.cao_function_level,
    security_role_status: context.security_role_status,
    performs_security_work: context.performs_security_work,
    security_work_percentage: context.security_work_percentage,
    works_event_or_hospitality_security: context.works_event_or_hospitality_security,
    event_hospitality_cao_applies: context.event_hospitality_cao_applies,
    works_cash_value_logistics: context.works_cash_value_logistics,
  });
}

function contextByKey(contexts, key) {
  return contexts.find(context => taskContextKey(context) === key) || {};
}

async function resolveTaskContexts(base44, employeeId, contexts) {
  const uniqueContexts = new Map();
  contexts.forEach(context => uniqueContexts.set(taskContextKey(context), context));
  const resolved = await Promise.all([...uniqueContexts.entries()].map(async ([key, context]) => {
    try {
      const response = await base44.asServiceRole.functions.invoke('resolvePersonnelContractForService', {
        personnel_id: employeeId,
        company_id: context.operating_company_id,
        operating_company_id: context.operating_company_id,
        object_id: context.object_id,
        service_date: context.service_date,
        service_context: context,
      });
      return [key, unwrapFunctionData(response)];
    } catch (error) {
      return [key, {
        status: 'blocked',
        planning_allowed: false,
        payroll_final_allowed: false,
        manual_review_required: true,
        blocking_reasons: [`Contractresolver fout: ${error?.message || String(error)}`],
      }];
    }
  }));
  return new Map(resolved);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    const body = await req.json();
    const plannedResult = body.plannedResult || body.result || body;
    const serviceDate = body.service_date || null;
    const optimizationJobId = body.optimization_job_id || body.local_job_id || null;
    const [objects, routeExecutions, sourceRoutes, sourceTasks] = await Promise.all([
      base44.asServiceRole.entities.SurveillanceObject.list(),
      base44.asServiceRole.entities.RouteExecution.list(),
      base44.asServiceRole.entities.Route.list(),
      base44.asServiceRole.entities.Task.list(),
    ]);
    const objectById = new Map(objects.map(object => [String(object.id), object]));
    const routeById = new Map(sourceRoutes.map(route => [String(route.id), route]));
    const taskById = new Map(sourceTasks.map(task => [String(task.id), task]));
    const created = [];
    const blocked = [];

    for (const route of plannedResult.routes || []) {
      const sourceRouteId = route.manual_route_id || route.route_id || route.id || null;
      const sourceRoute = routeById.get(String(sourceRouteId || '')) || {};
      const existing = routeExecutions.find(item => String(item.source_route_id || item.route_id || '') === String(sourceRouteId || '') && (serviceDate ? item.service_date === serviceDate : item.weekday === route.weekday));
      if (existing && ['active', 'completed'].includes(existing.status) && !body.force_overwrite) {
        blocked.push({ route_id: sourceRouteId, route_execution_id: existing.id, reason: 'Bestaande actieve of voltooide uitvoering wordt niet overschreven.' });
        continue;
      }
      const routeTasks = route.tasks || route.optimized_order || [];
      const taskCoordinatePairs = routeTasks.map(task => {
        const sourceTask = taskById.get(String(task.original_task_id || task.task_id || '')) || {};
        const object = objectById.get(String(task.object_id || sourceTask.object_id || '')) || {};
        return taskCoordinatePair(task, object);
      });
      const invalidCoordinateIndex = taskCoordinatePairs.findIndex(coordinates => !coordinates);
      if (invalidCoordinateIndex >= 0) {
        const invalidTask = routeTasks[invalidCoordinateIndex] || {};
        blocked.push({
          route_id: sourceRouteId,
          reason: `Stop zonder bruikbare coördinaten: ${invalidTask.name || invalidTask.task_id || invalidTask.original_task_id || 'Taak'}`,
          code: 'TASK_EXECUTION_COORDINATES_INVALID',
          details: {
            task_id: String(invalidTask.original_task_id || invalidTask.task_id || ''),
            object_id: String(invalidTask.object_id || ''),
          },
        });
        continue;
      }
      let publishedRoutingEvidence;
      try {
        publishedRoutingEvidence = await mapWithConcurrency(routeTasks, 8, async task => {
          const sourceTask = taskById.get(String(task.original_task_id || task.task_id || '')) || {};
          return loadPublishedTaskRoutingEvidence(base44, task, sourceTask, serviceDate);
        });
      } catch (error) {
        blocked.push({
          route_id: sourceRouteId,
          reason: error?.message || String(error),
          code: error?.code || 'TASK_EXECUTION_PLANNING_EVIDENCE_INVALID',
          details: error?.details || null,
        });
        continue;
      }
      let taskContexts;
      try {
        taskContexts = routeTasks.map((task, index) => {
          const sourceTask = taskById.get(String(task.original_task_id || task.task_id || '')) || {};
          const object = objectById.get(String(task.object_id || sourceTask.object_id || '')) || {};
          return buildTaskContext(task, sourceTask, object, sourceRoute, route, serviceDate, publishedRoutingEvidence[index]);
        });
      } catch (error) {
        blocked.push({
          route_id: sourceRouteId,
          reason: error?.message || String(error),
          code: error?.code || 'TASK_EXECUTION_ROUTING_INVALID',
          details: error?.details || null,
        });
        continue;
      }
      const operatingCompanyIds = unique(taskContexts.map(context => context.operating_company_id));
      if (operatingCompanyIds.length > 1) {
        blocked.push({ route_id: sourceRouteId, reason: 'Een route kan niet over meerdere juridische werkgevers worden verdeeld.', operating_company_ids: operatingCompanyIds });
        continue;
      }
      const routeEmployeeId = route.employee_id || route.personnel_id || null;
      let routeRoutingStatus = routeEmployeeId ? 'manual_review_required' : 'not_applicable';
      let routeRoutingSnapshot = routeEmployeeId ? {
        status: 'manual_review_required',
        source: 'optimization_route_without_service_date',
        resolved_at: nowIso(),
        manual_review_reasons: ['Een concrete servicedatum is nodig voordat het arbeidscontract definitief aan de route kan worden gekoppeld.'],
      } : { status: 'not_applicable', source: 'optimization_route_without_employee', resolved_at: nowIso() };
      let resolutionByContext = new Map();
      if (routeEmployeeId && serviceDate) {
        resolutionByContext = await resolveTaskContexts(base44, routeEmployeeId, taskContexts);
        const failed = taskContexts.map(context => ({ context, resolution: resolutionByContext.get(taskContextKey(context)) }))
          .filter(item => normalizeRoutingStatus(item.resolution) !== 'resolved');
        if (failed.length > 0) {
          blocked.push({
            route_id: sourceRouteId,
            reason: 'Contract-, functie- of CAO-koppeling blokkeert deze personeelsinzet.',
            details: failed.map(item => compactRoutingSnapshot(item.resolution, item.context, 'optimization_task')),
          });
          continue;
        }
        const routeResolutions = taskContexts.map(context => resolutionByContext.get(taskContextKey(context)));
        let routeEmploymentProjections;
        try {
          routeEmploymentProjections = routeResolutions.map(resolvedEmploymentProjection);
        } catch (error) {
          blocked.push({
            route_id: sourceRouteId,
            reason: error?.message || String(error),
            code: error?.code || 'TASK_EXECUTION_EMPLOYMENT_ROUTE_MISMATCH',
            details: error?.details || null,
          });
          continue;
        }
        const contractIds = unique(routeEmploymentProjections.map(projection => projection.personnel_contract_id));
        const employingCompanyIds = unique(routeEmploymentProjections.map(projection => projection.employing_company_id));
        const payrollCaoKeys = unique(routeEmploymentProjections.map(projection => projection.payroll_cao_key));
        routeRoutingStatus = 'resolved';
        routeRoutingSnapshot = {
          status: 'resolved',
          source: 'optimization_route',
          resolved_at: nowIso(),
          personnel_id: routeEmployeeId,
          company_id: operatingCompanyIds[0] || null,
          employing_company_id: employingCompanyIds.length === 1 ? employingCompanyIds[0] : null,
          employing_company_ids: employingCompanyIds,
          contract_id: contractIds.length === 1 ? contractIds[0] : null,
          contract_ids: contractIds,
          payroll_cao_key: payrollCaoKeys.length === 1 ? payrollCaoKeys[0] : null,
          payroll_cao_keys: payrollCaoKeys,
          cao_keys: unique(routeResolutions.map(resolution => resolution?.cao_key || resolution?.selected_contract?.cao_key)),
          function_keys: unique([
            ...taskContexts.map(context => context.function_type),
            ...routeResolutions.map(resolution => resolution?.selected_contract?.function_type),
          ]),
          task_contexts: unique(taskContexts.map(taskContextKey)).map(key => compactRoutingSnapshot(resolutionByContext.get(key), contextByKey(taskContexts, key), 'optimization_task')),
        };
      }
      let taskRoutingProjections;
      try {
        taskRoutingProjections = routeTasks.map((task, index) => {
          const sourceTask = taskById.get(String(task.original_task_id || task.task_id || '')) || {};
          const object = objectById.get(String(task.object_id || sourceTask.object_id || '')) || {};
          const serviceContext = taskContexts[index];
          const resolution = routeEmployeeId && serviceDate
            ? resolutionByContext.get(taskContextKey(serviceContext))
            : null;
          return buildTaskExecutionRoutingProjection(task, sourceTask, object, resolution, publishedRoutingEvidence[index]);
        });
      } catch (error) {
        blocked.push({
          route_id: sourceRouteId,
          reason: error?.message || String(error),
          code: error?.code || 'TASK_EXECUTION_ROUTING_INVALID',
          details: error?.details || null,
        });
        continue;
      }
      const startCoordinates = normalizeCoordinatePair(route.start_latitude, route.start_longitude);
      const endCoordinates = normalizeCoordinatePair(route.end_latitude, route.end_longitude);
      const routePayload = {
        route_id: sourceRouteId,
        route_name: route.manual_route_name || route.name || route.vehicle?.name || 'Route',
        source_route_id: sourceRouteId,
        weekday: Number(route.weekday || 1),
        service_date: serviceDate,
        employee_id: routeEmployeeId,
        employee_name: route.employee_name || route.personnel_name || null,
        operating_company_id: operatingCompanyIds[0] || route.operating_company_id || sourceRoute.operating_company_id || null,
        personnel_contract_id: routeRoutingSnapshot.contract_id || null,
        contract_function_key: routeRoutingSnapshot.function_keys?.length === 1 ? routeRoutingSnapshot.function_keys[0] : null,
        contract_cao_key: routeRoutingSnapshot.cao_keys?.length === 1 ? routeRoutingSnapshot.cao_keys[0] : null,
        contract_routing_status: routeRoutingStatus,
        contract_routing_snapshot: routeRoutingSnapshot,
        vehicle_id: route.vehicle?.id || route.vehicle_id || null,
        vehicle_license_plate: route.vehicle?.license_plate || route.license_plate || null,
        status: 'planned',
        shift_start_time: route.time_window_start || route.shift_start_time || '00:00',
        shift_end_time: route.time_window_end || route.shift_end_time || '00:00',
        start_location_name: route.start_location_name || null,
        start_latitude: startCoordinates?.latitude ?? null,
        start_longitude: startCoordinates?.longitude ?? null,
        end_location_name: route.end_location_name || null,
        end_latitude: endCoordinates?.latitude ?? null,
        end_longitude: endCoordinates?.longitude ?? null,
        total_planned_distance_km: route.stats?.total_distance_km ?? route.total_distance_km ?? null,
        total_planned_travel_minutes: route.stats?.total_travel_minutes ?? route.total_travel_minutes ?? null,
        total_planned_service_minutes: route.stats?.total_service_minutes ?? route.total_service_minutes ?? null,
        total_planned_route_minutes: route.stats?.total_route_minutes ?? route.total_route_minutes ?? null,
        generated_at: nowIso(),
        optimization_job_id: optimizationJobId,
        metadata: { source: 'optimization', contract_routing_status: routeRoutingStatus },
      };
      const routeExecution = existing ? await base44.asServiceRole.entities.RouteExecution.update(existing.id, routePayload) : await base44.asServiceRole.entities.RouteExecution.create(routePayload);
      const oldTasks = await base44.asServiceRole.entities.TaskExecution.filter({ route_execution_id: routeExecution.id });
      for (const oldTask of oldTasks.filter(task => !['arrived', 'started', 'completed'].includes(task.status))) await base44.asServiceRole.entities.TaskExecution.delete(oldTask.id);
      const taskPayloads = routeTasks.map((task, index) => {
        const sourceTask = taskById.get(String(task.original_task_id || task.task_id || '')) || {};
        const object = objectById.get(String(task.object_id || sourceTask.object_id || '')) || {};
        const coordinates = taskCoordinatePairs[index];
        const repeatCount = task.repeat_count ?? null;
        const repeatIndex = task.repeat_index ?? null;
        const serviceContext = buildTaskContext(task, sourceTask, object, sourceRoute, route, serviceDate, publishedRoutingEvidence[index]);
        const resolution = routeEmployeeId && serviceDate ? resolutionByContext.get(taskContextKey(serviceContext)) : null;
        const routingSnapshot = routeEmployeeId
          ? (serviceDate
            ? compactRoutingSnapshot(resolution, serviceContext, 'optimization_task')
            : { ...routeRoutingSnapshot, service_context: serviceContext })
          : { status: 'not_applicable', source: 'optimization_task_without_employee', service_context: serviceContext, resolved_at: nowIso() };
        const routingProjection = taskRoutingProjections[index];
        return {
          route_execution_id: routeExecution.id,
          source_route_id: sourceRouteId,
          original_task_id: String(task.original_task_id || task.task_id || sourceTask.id),
          object_id: String(task.object_id || sourceTask.object_id),
          sequence_index: Number(task.sequence_index ?? index + 1),
          task_name: taskName(task, repeatIndex, repeatCount),
          object_name: object.name || task.object_name || task.name || 'Object',
          task_type: task.task_type || sourceTask.task_type || 'Taak',
          ...routingProjection,
          operating_company_id: serviceContext.operating_company_id || null,
          personnel_contract_id: resolution ? resolvedEmploymentProjection(resolution).personnel_contract_id : null,
          contract_function_key: serviceContext.function_type || resolution?.selected_contract?.function_type || null,
          contract_cao_key: resolution?.cao_key || resolution?.selected_contract?.cao_key || serviceContext.cao_key || null,
          contract_routing_status: routeEmployeeId ? (serviceDate ? normalizeRoutingStatus(resolution) : 'manual_review_required') : 'not_applicable',
          contract_routing_snapshot: routingSnapshot,
          repeat_index: repeatIndex,
          repeat_count: repeatCount,
          split_index: task.split_index ?? null,
          split_count: task.split_count ?? null,
          custom_block_label: task.custom_block_label || null,
          status: 'pending',
          planned_arrival_time: task.planned_arrival_time || task.arrival_time || null,
          planned_start_time: task.planned_start_time || task.actual_start_time || null,
          planned_departure_time: task.planned_departure_time || task.departure_time || null,
          planned_arrival_seconds: secondsFromTime(task.planned_arrival_time || task.arrival_time),
          planned_departure_seconds: secondsFromTime(task.planned_departure_time || task.departure_time),
          duration_minutes: Number(task.duration_minutes || 0),
          travel_from_previous_minutes: task.travel_from_previous_minutes ?? task.travel_time_minutes ?? null,
          distance_from_previous_km: task.distance_from_previous_km ?? task.distance_km ?? null,
          travel_to_next_minutes: task.travel_to_next_minutes ?? null,
          distance_to_next_km: task.distance_to_next_km ?? null,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          address: task.address || object.address || null,
          locked_to_route: !!task.locked_to_route,
          locked_sequence: !!task.locked_sequence,
          route_pin_hard: !!task.locked_to_route,
          arrival_deadline_time: task.arrival_deadline_time || null,
          uses_arrival_deadline: !!task.uses_arrival_deadline,
          service_must_start_at: task.service_must_start_at || null,
          metadata: { optimizer_task_id: task.optimizer_task_id || null, contract_routing_status: routingSnapshot.status },
        };
      });
      if (taskPayloads.length) await base44.asServiceRole.entities.TaskExecution.bulkCreate(taskPayloads);
      created.push(routeExecution.id);
    }
    return Response.json({ created, blocked, server_time: nowIso() });
  } catch (error) {
    return Response.json({ error: error.message, code: error.code || null, details: error.details || null }, { status: Number(error.status || 500) });
  }
});

export {
  buildTaskExecutionRoutingProjection,
  loadPublishedTaskRoutingEvidence,
  normalizeCoordinatePair,
  projectedTaskTypeKey,
  resolvedEmploymentProjection,
  taskCoordinatePair,
};
