// base44/functions/_shared/mobile/createMobileRouteExecution.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function secondsFromTime(time) {
  if (!time) return null;
  const [h, m = 0] = String(time).split(":").map(Number);
  return Number.isFinite(h) ? h * 3600 + (Number.isFinite(m) ? m * 60 : 0) : null;
}
function getWeekday(serviceDate) {
  const date = /* @__PURE__ */ new Date(`${serviceDate}T12:00:00`);
  const day = date.getDay();
  return day === 0 ? 7 : day;
}
function isTaskForDay(task, weekday) {
  return (task.weekdays || []).map(Number).includes(Number(weekday));
}
function isAssignmentForDay(assignment, weekday) {
  return (assignment.days || []).map(Number).includes(Number(weekday));
}
function makeTaskName(task, object, repeatIndex, repeatCount) {
  const base = object?.name || task.task_type || "Taak";
  return repeatCount > 1 && repeatIndex ? `${base} (${repeatIndex}/${repeatCount})` : base;
}
function unique(values) {
  return [...new Set((values || []).filter(Boolean).map(String))];
}
var COMMERCIAL_TASK_TYPE_KEYS = /* @__PURE__ */ new Set([
  "object_security",
  "fire_closing_round",
  "external_closing_round",
  "external_control_round",
  "opening_round",
  "mobile_control_round",
  "reception",
  "closing_assistance",
  "access_control",
  "fire_watch",
  "concierge"
]);
var LEGACY_COMMERCIAL_TASK_TYPE_ALIASES = {
  objectbeveiliging: "object_security",
  brand_en_sluitronde: "fire_closing_round",
  brand_sluitronde: "fire_closing_round",
  externe_sluitronde: "external_closing_round",
  externe_controleronde: "external_control_round",
  openingsronde: "opening_round",
  mobiele_controleronde: "mobile_control_round",
  receptie: "reception",
  receptiedienst: "reception",
  sluitbegeleiding: "closing_assistance",
  toegangscontrole: "access_control",
  brandwacht: "fire_watch",
  portier: "concierge",
  portier_concierge: "concierge",
  concierge: "concierge"
};
function compactRoutingValue(value) {
  return String(value ?? "").trim();
}
function normalizedCommercialTaskToken(value) {
  return compactRoutingValue(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function legacyCommercialTaskTypeKey(value) {
  const normalized = normalizedCommercialTaskToken(value);
  if (!normalized) return null;
  if (COMMERCIAL_TASK_TYPE_KEYS.has(normalized) && normalized !== "other") return normalized;
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
  const values = unique(sources.map((source) => compactRoutingValue(source?.[field])));
  if (values.length > 1) {
    throw routingProjectionError("TASK_EXECUTION_ROUTING_MISMATCH", `Tegenstrijdige ${field} in de taakroutering.`, { field, values });
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
    evidence?.shift?.service_context_snapshot
  ].filter(Boolean);
}
function projectedTaskTypeKey(task, sourceTask = {}, evidence = null) {
  const routingSources = [
    ...publishedRoutingSources(evidence),
    task,
    task?.commercial_routing_snapshot,
    sourceTask,
    sourceTask?.commercial_routing_snapshot
  ].filter(Boolean);
  const explicitKeys = unique(routingSources.map((source) => compactRoutingValue(source?.task_type_key)));
  const invalidExplicitKeys = explicitKeys.filter((key) => !isCanonicalCommercialTaskTypeKey(key));
  if (invalidExplicitKeys.length) {
    throw routingProjectionError("TASK_EXECUTION_TASK_TYPE_INVALID", "De taak bevat geen geldige canonieke task_type_key.", { task_type_keys: invalidExplicitKeys });
  }
  const legacyKeys = unique([task?.task_type, sourceTask?.task_type].map(legacyCommercialTaskTypeKey));
  const candidates = unique([...explicitKeys, ...legacyKeys]);
  if (candidates.length > 1) {
    throw routingProjectionError("TASK_EXECUTION_TASK_TYPE_MISMATCH", "De canonieke taaksoort komt niet overeen met de legacy taaksoort.", { task_type_keys: candidates });
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
    sourceTask?.commercial_routing_snapshot?.customer_billable
  ].filter((value) => typeof value === "boolean");
  const uniqueDirectValues = [...new Set(directValues)];
  if (uniqueDirectValues.length > 1) {
    throw routingProjectionError("TASK_EXECUTION_CUSTOMER_BILLABLE_MISMATCH", "De facturatie-indicatie van de taak is tegenstrijdig.");
  }
  if (evidence?.verified && !directValues.some((value) => typeof value === "boolean")) {
    throw routingProjectionError("TASK_EXECUTION_PUBLISHED_BILLABLE_MISSING", "De gepubliceerde dienst mist een expliciete facturatie-indicatie.");
  }
  if (uniqueDirectValues.length === 1) return uniqueDirectValues[0];
  if (typeof object?.default_customer_billable === "boolean") return object.default_customer_billable;
  throw routingProjectionError("TASK_EXECUTION_CUSTOMER_BILLABLE_MISSING", "De taak mist een expliciete indicatie of deze klantfactureerbaar is.");
}
function buildTaskExecutionRoutingProjection(task, sourceTask = {}, object = {}, resolution = null, evidence = null) {
  const evidenceSources = publishedRoutingSources(evidence);
  const routingSources = [
    ...evidenceSources,
    task,
    task?.commercial_routing_snapshot,
    sourceTask,
    sourceTask?.commercial_routing_snapshot
  ].filter(Boolean);
  const taskTypeKey = projectedTaskTypeKey(task, sourceTask, evidence);
  const claimedCommercialRoutingStatus = consistentRoutingValue([
    { commercial_routing_status: evidence?.segment?.commercial_routing_status },
    { commercial_routing_status: evidence?.segment?.commercial_routing_snapshot?.status },
    { commercial_routing_status: evidence?.occurrence?.commercial_routing_status },
    { commercial_routing_status: evidence?.occurrence?.commercial_routing_snapshot?.status },
    { commercial_routing_status: task?.commercial_routing_status },
    { commercial_routing_status: sourceTask?.commercial_routing_status },
    { commercial_routing_status: task?.commercial_routing_snapshot?.status },
    { commercial_routing_status: sourceTask?.commercial_routing_snapshot?.status }
  ], "commercial_routing_status");
  const employingCompanyId = resolution ? consistentRoutingValue([
    { employing_company_id: resolution?.employing_company_id },
    { employing_company_id: resolution?.company_id },
    { employing_company_id: resolution?.selected_contract?.company_id }
  ], "employing_company_id") : null;
  const payrollCaoKey = resolution ? consistentRoutingValue([
    { payroll_cao_key: resolution?.payroll_cao_key },
    { payroll_cao_key: resolution?.cao_key },
    { payroll_cao_key: resolution?.selected_contract?.cao_key }
  ], "payroll_cao_key") : null;
  const sellingCompanyId = consistentRoutingValue([
    ...routingSources,
    { selling_company_id: evidence?.contract?.company_id },
    { selling_company_id: evidence?.line?.company_id }
  ], "selling_company_id");
  const customerId = consistentRoutingValue([
    ...routingSources,
    { customer_id: evidence?.contract?.customer_id },
    { customer_id: evidence?.line?.customer_id },
    { customer_id: object?.customer_id }
  ], "customer_id");
  const customerAccountId = consistentRoutingValue([
    ...routingSources,
    { customer_account_id: evidence?.contract?.customer_account_id },
    { customer_account_id: evidence?.line?.customer_account_id }
  ], "customer_account_id");
  const customerContractId = consistentRoutingValue([
    ...routingSources,
    { customer_contract_id: evidence?.contract?.id },
    { customer_contract_id: evidence?.line?.contract_id }
  ], "customer_contract_id");
  const customerContractLineId = consistentRoutingValue([
    ...routingSources,
    { customer_contract_line_id: evidence?.line?.id }
  ], "customer_contract_line_id");
  const customerBillable = projectedCustomerBillable(task, sourceTask, object, evidence);
  const verifiedSnapshot = evidence?.verified ? {
    ...evidence.segment?.commercial_routing_snapshot || evidence.occurrence?.commercial_routing_snapshot || {},
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
    planning_shift_task_segment_id: evidence.segment?.id || null
  } : null;
  const commercialRoutingStatus = evidence?.verified ? claimedCommercialRoutingStatus : "stale";
  const commercialRoutingSnapshot = verifiedSnapshot || {
    schema_version: 1,
    status: "stale",
    reason: "published_commercial_route_evidence_missing",
    task_type_key: taskTypeKey,
    customer_id: customerId,
    customer_account_id: customerAccountId,
    selling_company_id: sellingCompanyId,
    customer_contract_id: customerContractId,
    customer_contract_line_id: customerContractLineId,
    customer_billable: customerBillable,
    planning_shift_id: evidence?.shift?.id || null,
    planning_task_occurrence_id: evidence?.occurrence?.id || null,
    planning_shift_task_segment_id: evidence?.segment?.id || null
  };
  const projection = {
    task_type_key: taskTypeKey,
    selling_company_id: sellingCompanyId,
    service_responsible_company_id: consistentRoutingValue(routingSources, "service_responsible_company_id"),
    supplying_company_id: resolution ? consistentRoutingValue([
      { supplying_company_id: resolution?.supplying_company_id }
    ], "supplying_company_id") : null,
    customer_id: customerId,
    customer_account_id: customerAccountId,
    customer_contract_id: customerContractId,
    customer_contract_line_id: customerContractLineId,
    customer_contract_rate_id: consistentRoutingValue(routingSources, "customer_contract_rate_id"),
    customer_snapshot: task?.customer_snapshot || sourceTask?.customer_snapshot || null,
    operating_company_snapshot: task?.operating_company_snapshot || sourceTask?.operating_company_snapshot || null,
    selling_company_snapshot: task?.selling_company_snapshot || sourceTask?.selling_company_snapshot || null,
    commercial_contract_snapshot: task?.commercial_contract_snapshot || sourceTask?.commercial_contract_snapshot || commercialRoutingSnapshot,
    commercial_rate_snapshot: task?.commercial_rate_snapshot || sourceTask?.commercial_rate_snapshot || null,
    commercial_routing_status: commercialRoutingStatus,
    commercial_routing_snapshot: commercialRoutingSnapshot,
    customer_billable: customerBillable,
    employing_company_id: employingCompanyId,
    payroll_cao_key: payrollCaoKey
  };
  if (claimedCommercialRoutingStatus === "resolved" && (!projection.task_type_key || !projection.selling_company_id || !projection.customer_id || !projection.customer_account_id || !projection.customer_contract_id || !projection.customer_contract_line_id)) {
    throw routingProjectionError("TASK_EXECUTION_COMMERCIAL_ROUTE_INCOMPLETE", "De opgeloste commerciële taakroutering mist verplichte bewijsvelden.");
  }
  if (claimedCommercialRoutingStatus === "not_applicable" && (
    projection.customer_billable !== false || projection.customer_id || projection.customer_account_id || projection.selling_company_id || projection.customer_contract_id || projection.customer_contract_line_id || projection.customer_contract_rate_id
  )) {
    throw routingProjectionError("TASK_EXECUTION_COMMERCIAL_ROUTE_MISMATCH", "Een niet-factureerbare taak bevat toch commerciële contractroutering.");
  }
  return projection;
}

function routingIdFromAliases(sources, fields, label) {
  const values = unique(sources.flatMap((source) => fields.map((field) => compactRoutingValue(source?.[field]))));
  if (values.length > 1) {
    throw routingProjectionError("TASK_EXECUTION_PLANNING_LINK_MISMATCH", `Tegenstrijdige ${label} in de planningskoppeling.`, { label, values });
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
  if (!date || requireStart && !start) return false;
  return (!start || start <= date) && (!end || date <= end);
}
async function publishedRoutingRecord(base44, entityName, id) {
  const entity = base44?.asServiceRole?.entities?.[entityName];
  if (!entity?.get) {
    throw routingProjectionError("TASK_EXECUTION_PLANNING_EVIDENCE_UNAVAILABLE", `${entityName} is niet beschikbaar voor routeverificatie.`, { entity: entityName, id });
  }
  let record = null;
  try {
    record = await entity.get(id);
  } catch (_error) {
    record = null;
  }
  if (!record) {
    throw routingProjectionError("TASK_EXECUTION_PLANNING_EVIDENCE_MISSING", `Gepubliceerd planningsbewijs ${entityName} bestaat niet.`, { entity: entityName, id });
  }
  return record;
}
function requireFreshPublishedRecord(record, entityName) {
  const revision = recordRevision(record);
  const publishedRevision = Number(record?.published_revision || 0);
  const statusOk = entityName === "PlanningTaskOccurrence" ? record?.lifecycle_status === "active" : record?.status === "published";
  if (!statusOk || revision < 1 || publishedRevision !== revision) {
    throw routingProjectionError("TASK_EXECUTION_PLANNING_EVIDENCE_STALE", `${entityName} is niet meer gelijk aan de gepubliceerde revisie.`, {
      entity: entityName,
      id: record?.id || null,
      revision,
      published_revision: publishedRevision,
      status: record?.status || record?.lifecycle_status || null
    });
  }
}
function commercialEvidenceStatus(segment, occurrence) {
  return consistentRoutingValue([
    { commercial_routing_status: segment?.commercial_routing_status },
    { commercial_routing_status: segment?.commercial_routing_snapshot?.status },
    { commercial_routing_status: occurrence?.commercial_routing_status },
    { commercial_routing_status: occurrence?.commercial_routing_snapshot?.status }
  ], "commercial_routing_status");
}
async function loadPublishedTaskRoutingEvidence(base44, task, sourceTask = {}, serviceDate = null) {
  const linkSources = [task, sourceTask].filter(Boolean);
  const directSegmentId = routingIdFromAliases(linkSources, [
    "planning_shift_task_segment_id",
    "planning_task_segment_id",
    "shift_task_segment_id",
    "task_segment_id"
  ], "PlanningShiftTaskSegment-id");
  const directOccurrenceId = routingIdFromAliases(linkSources, ["planning_task_occurrence_id", "task_occurrence_id"], "PlanningTaskOccurrence-id");
  const directShiftId = routingIdFromAliases(linkSources, ["planning_shift_id"], "PlanningShift-id");
  if (!directSegmentId && !directOccurrenceId && !directShiftId) return null;
  const segment = directSegmentId ? await publishedRoutingRecord(base44, "PlanningShiftTaskSegment", directSegmentId) : null;
  if (segment) requireFreshPublishedRecord(segment, "PlanningShiftTaskSegment");
  const occurrenceId = routingIdFromAliases([
    { planning_task_occurrence_id: directOccurrenceId },
    { planning_task_occurrence_id: segment?.task_occurrence_id }
  ], ["planning_task_occurrence_id"], "PlanningTaskOccurrence-id");
  const shiftId = routingIdFromAliases([
    { planning_shift_id: directShiftId },
    { planning_shift_id: segment?.shift_id }
  ], ["planning_shift_id"], "PlanningShift-id");
  const [occurrence, shift] = await Promise.all([
    occurrenceId ? publishedRoutingRecord(base44, "PlanningTaskOccurrence", occurrenceId) : null,
    shiftId ? publishedRoutingRecord(base44, "PlanningShift", shiftId) : null
  ]);
  if (occurrence) requireFreshPublishedRecord(occurrence, "PlanningTaskOccurrence");
  if (shift) requireFreshPublishedRecord(shift, "PlanningShift");
  if (segment && occurrence && String(segment.task_occurrence_id) !== String(occurrence.id)) {
    throw routingProjectionError("TASK_EXECUTION_PLANNING_LINK_MISMATCH", "Taaksegment en taakoccurrence horen niet bij elkaar.");
  }
  if (segment && shift && String(segment.shift_id) !== String(shift.id)) {
    throw routingProjectionError("TASK_EXECUTION_PLANNING_LINK_MISMATCH", "Taaksegment en dienst horen niet bij elkaar.");
  }
  if (serviceDate && occurrence?.service_date && String(occurrence.service_date) !== String(serviceDate)) {
    throw routingProjectionError("TASK_EXECUTION_PLANNING_DATE_MISMATCH", "De taakoccurrence hoort bij een andere servicedatum.");
  }
  if (serviceDate && shift?.service_date && String(shift.service_date) !== String(serviceDate)) {
    throw routingProjectionError("TASK_EXECUTION_PLANNING_DATE_MISMATCH", "De gepubliceerde dienst hoort bij een andere servicedatum.");
  }
  if (serviceDate && segment && !dateWithin(serviceDate, segment.start_date, segment.end_date || segment.start_date)) {
    throw routingProjectionError("TASK_EXECUTION_PLANNING_DATE_MISMATCH", "Het taaksegment dekt de servicedatum niet.");
  }
  const evidence = { linked: true, verified: Boolean(segment && occurrence && shift), segment, occurrence, shift, contract: null, line: null };
  if (!evidence.verified) return evidence;
  const status = commercialEvidenceStatus(segment, occurrence);
  const snapshot = segment.commercial_routing_snapshot || occurrence.commercial_routing_snapshot || null;
  if (!status || Number(snapshot?.schema_version) !== 1 || snapshot?.status !== status) {
    throw routingProjectionError("TASK_EXECUTION_COMMERCIAL_EVIDENCE_INVALID", "Het gepubliceerde commerciële routebewijs is ongeldig of incompleet.");
  }
  const customerBillableValues = [
    segment.customer_billable,
    segment.commercial_routing_snapshot?.customer_billable,
    occurrence.customer_billable,
    occurrence.commercial_routing_snapshot?.customer_billable,
    shift.customer_billable,
    shift.service_context_snapshot?.customer_billable
  ].filter((value) => typeof value === "boolean");
  if (customerBillableValues.length === 0) {
    throw routingProjectionError("TASK_EXECUTION_PUBLISHED_BILLABLE_MISSING", "Het gepubliceerde commerciële routebewijs mist een expliciete facturatie-indicatie.");
  }
  if (new Set(customerBillableValues).size > 1) {
    throw routingProjectionError("TASK_EXECUTION_CUSTOMER_BILLABLE_MISMATCH", "De gepubliceerde facturatie-indicatie is tegenstrijdig.");
  }
  if (status === "not_applicable") {
    const identityValues = unique([
      segment.customer_id,
      occurrence.customer_id,
      shift.customer_id,
      ...unique(shift.customer_ids),
      segment.selling_company_id,
      occurrence.selling_company_id,
      shift.selling_company_id,
      ...unique(shift.selling_company_ids),
      segment.customer_contract_id,
      occurrence.customer_contract_id,
      shift.customer_contract_id,
      segment.customer_contract_line_id,
      occurrence.customer_contract_line_id,
      shift.customer_contract_line_id,
      snapshot.customer_id,
      snapshot.customer_account_id,
      snapshot.selling_company_id,
      snapshot.customer_contract_id,
      snapshot.customer_contract_line_id,
      shift.service_context_snapshot?.customer_id,
      ...unique(shift.service_context_snapshot?.customer_ids)
    ]);
    if (customerBillableValues[0] !== false || snapshot.reason !== "explicit_internal_non_billable" || snapshot.customer_billable !== false || Number(snapshot.candidate_count) !== 0 || identityValues.length > 0 || !unique(snapshot.evidence_shift_ids).includes(String(shift.id)) || !unique(snapshot.evidence_segment_ids).includes(String(segment.id))) {
      throw routingProjectionError("TASK_EXECUTION_COMMERCIAL_EVIDENCE_INVALID", "De interne niet-factureerbare taak mist sluitend gepubliceerd bewijs.");
    }
    return evidence;
  }
  if (status !== "resolved") {
    throw routingProjectionError("TASK_EXECUTION_COMMERCIAL_ROUTE_UNRESOLVED", "De gepubliceerde commerciële route is niet opgelost.", { status });
  }
  if (customerBillableValues[0] !== true || snapshot.customer_billable !== true) {
    throw routingProjectionError("TASK_EXECUTION_COMMERCIAL_EVIDENCE_INVALID", "Een opgeloste commerciële route moet expliciet klantfactureerbaar zijn.");
  }
  const contractId = consistentRoutingValue([segment, segment.commercial_routing_snapshot, occurrence, occurrence.commercial_routing_snapshot], "customer_contract_id");
  const lineId = consistentRoutingValue([segment, segment.commercial_routing_snapshot, occurrence, occurrence.commercial_routing_snapshot], "customer_contract_line_id");
  if (!contractId || !lineId) {
    throw routingProjectionError("TASK_EXECUTION_COMMERCIAL_EVIDENCE_INVALID", "Het gepubliceerde routebewijs mist contract- of regelidentiteit.");
  }
  const [contract, line] = await Promise.all([
    publishedRoutingRecord(base44, "CustomerContract", contractId),
    publishedRoutingRecord(base44, "CustomerContractLine", lineId)
  ]);
  const snapshotContractVersion = Number(snapshot.customer_contract_version || 0);
  const snapshotLineVersion = Number(snapshot.customer_contract_line_version || 0);
  const serviceEndDate = occurrence.end_date || occurrence.service_date;
  const explicitLineTaskType = compactRoutingValue(line.task_type_key);
  const lineTaskTypeKey = explicitLineTaskType ? isCanonicalCommercialTaskTypeKey(explicitLineTaskType) ? explicitLineTaskType : null : legacyCommercialTaskTypeKey(line.service_code);
  const expectedTaskTypeKey = projectedTaskTypeKey(task, sourceTask, evidence);
  let lineScopeMatches = line.scope_type === "customer" ? !compactRoutingValue(line.object_id) && !compactRoutingValue(line.collective_id) : line.scope_type === "object" ? !compactRoutingValue(line.collective_id) && String(line.object_id || "") === String(occurrence.object_id || "") : false;
  if (line.scope_type === "collective" && !compactRoutingValue(line.object_id) && compactRoutingValue(line.collective_id)) {
    const collective = await publishedRoutingRecord(base44, "Collectief", line.collective_id);
    lineScopeMatches = String(collective.customer_id || "") === String(occurrence.customer_id || "") && unique(collective.object_ids).includes(String(occurrence.object_id));
  }
  if (!["active", "ended", "superseded"].includes(contract.status) || !["active", "ended"].includes(line.status) || String(line.contract_id) !== String(contract.id) || !compactRoutingValue(contract.company_id) || String(line.company_id) !== String(contract.company_id) || String(line.customer_id) !== String(contract.customer_id) || String(line.customer_account_id) !== String(contract.customer_account_id) || lineTaskTypeKey !== expectedTaskTypeKey || !lineScopeMatches || !dateWithin(occurrence.service_date, contract.start_date, contract.end_date, true) || !dateWithin(serviceEndDate, contract.start_date, contract.end_date, true) || !dateWithin(occurrence.service_date, line.valid_from, line.valid_until) || !dateWithin(serviceEndDate, line.valid_from, line.valid_until) || snapshotContractVersion < 1 || snapshotLineVersion < 1 || recordRevision(contract) < snapshotContractVersion || recordRevision(line) < snapshotLineVersion) {
    throw routingProjectionError("TASK_EXECUTION_COMMERCIAL_EVIDENCE_MISMATCH", "Contract, regel en gepubliceerd routebewijs zijn niet meer aantoonbaar consistent.");
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
function buildTaskContext(task, object, route, serviceDate, evidence = null) {
  const operatingCompanyId = task.operating_company_id || object.default_operating_company_id || object.operating_company_id || route.operating_company_id || null;
  return {
    service_date: serviceDate,
    operating_company_id: operatingCompanyId,
    company_id: operatingCompanyId,
    cao_key: task.cao_key || object.cao_key || route.cao_key || null,
    function_type: task.service_function_type || object.default_service_function_type || null,
    task_type: task.task_type || null,
    task_type_key: projectedTaskTypeKey(task, {}, evidence),
    cao_function_group: task.required_cao_function_group || object.default_cao_function_group || null,
    cao_function_level: task.required_cao_function_level || object.default_cao_function_level || null,
    security_role_status: task.required_security_role_status || object.default_security_role_status || null,
    performs_security_work: task.performs_security_work ?? object.default_performs_security_work ?? object.performs_security_work ?? null,
    security_work_percentage: task.security_work_percentage ?? object.default_security_work_percentage ?? object.security_work_percentage ?? null,
    works_event_or_hospitality_security: task.works_event_or_hospitality_security ?? object.default_works_event_or_hospitality_security ?? object.works_event_or_hospitality_security ?? null,
    event_hospitality_cao_applies: task.event_hospitality_cao_applies ?? object.default_event_hospitality_cao_applies ?? object.event_hospitality_cao_applies ?? null,
    works_cash_value_logistics: task.works_cash_value_logistics ?? object.default_works_cash_value_logistics ?? object.works_cash_value_logistics ?? null,
    route_id: route.id || null,
    task_id: task.id || null,
    object_id: object.id || task.object_id || null,
    contract_assignment_policy: "strict_contract_match"
  };
}
async function handleCreateMobileRouteExecution(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== "admin") return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    const body = await req.json();
    const routeId = body.route_id;
    const serviceDate = body.service_date;
    if (!routeId || !serviceDate) return Response.json({ error: "route_id en service_date zijn verplicht" }, { status: 400 });
    const weekday = getWeekday(serviceDate);
    const [routes, existingExecutions, tasks, objects, vehicles, offices] = await Promise.all([
      base44.asServiceRole.entities.Route.filter({ id: routeId }),
      base44.asServiceRole.entities.RouteExecution.filter({ service_date: serviceDate }),
      base44.asServiceRole.entities.Task.list(),
      base44.asServiceRole.entities.SurveillanceObject.list(),
      base44.asServiceRole.entities.Vehicle.list(),
      base44.asServiceRole.entities.Office.list()
    ]);
    const route = routes[0];
    if (!route) return Response.json({ error: "Route niet gevonden" }, { status: 404 });
    if (!(route.weekdays || []).map(Number).includes(Number(weekday))) {
      return Response.json({ error: "Deze route is niet gepland op deze datum" }, { status: 400 });
    }
    const existing = existingExecutions.find((item) => String(item.source_route_id || item.route_id || "") === String(route.id));
    if (existing) return Response.json({ route_execution_id: existing.id, already_exists: true });
    const vehicle = vehicles.find((v) => String(v.id) === String(route.vehicle_id || "")) || null;
    const startOffice = offices.find((o) => String(o.id) === String(route.start_location_id || "")) || null;
    const endOffice = offices.find((o) => String(o.id) === String(route.end_location_id || "")) || startOffice || null;
    const taskById = new Map(tasks.map((task) => [String(task.id), task]));
    const objectById = new Map(objects.map((object) => [String(object.id), object]));
    // Filter both assignment- and task-day before touching immutable planning
    // evidence. An assignment for this route day whose source task is not due
    // today must be skipped, not allowed to block the whole route with an old
    // planning link that cannot apply to this service date.
    const assignments = (route.assigned_tasks || []).filter((item) => {
      if (!isAssignmentForDay(item, weekday)) return false;
      const task = taskById.get(String(item.task_id));
      return Boolean(task && isTaskForDay(task, weekday));
    });
    let publishedRoutingEvidence;
    try {
      publishedRoutingEvidence = await mapWithConcurrency(assignments, 8, async (assignment) => {
        const task = taskById.get(String(assignment.task_id)) || {};
        return loadPublishedTaskRoutingEvidence(base44, assignment, task, serviceDate);
      });
    } catch (error) {
      return Response.json({ error: error.message, code: error.code || null, details: error.details || null }, { status: Number(error.status || 409) });
    }
    const assignedTaskContexts = assignments.map((assignment, index) => {
      const task = taskById.get(String(assignment.task_id));
      if (!task || !isTaskForDay(task, weekday)) return null;
      const object = objectById.get(String(task.object_id || "")) || {};
      return buildTaskContext(task, object, route, serviceDate, publishedRoutingEvidence[index]);
    }).filter(Boolean);
    let routingProjections;
    try {
      routingProjections = assignments.map((assignment, index) => {
        const task = taskById.get(String(assignment.task_id));
        if (!task || !isTaskForDay(task, weekday)) return null;
        const object = objectById.get(String(task.object_id || "")) || {};
        return buildTaskExecutionRoutingProjection(assignment, task, object, null, publishedRoutingEvidence[index]);
      });
    } catch (error) {
      return Response.json({ error: error.message, code: error.code || null, details: error.details || null }, { status: Number(error.status || 409) });
    }
    const assignedTaskCoordinates = assignments.map((assignment) => {
      const task = taskById.get(String(assignment.task_id));
      const object = objectById.get(String(task?.object_id || "")) || {};
      return {
        task_id: String(task?.id || assignment.task_id || ""),
        object_id: String(task?.object_id || ""),
        ...mobileMapCoordinatePair(object.latitude, object.longitude)
      };
    });
    const invalidTaskCoordinates = assignedTaskCoordinates.filter(({ latitude, longitude }) => latitude === null || longitude === null);
    if (invalidTaskCoordinates.length) {
      return Response.json({
        error: "De route bevat taken zonder geldige objectlocatie. Corrigeer eerst het objectadres.",
        code: "TASK_EXECUTION_COORDINATES_INVALID",
        details: {
          task_ids: unique(invalidTaskCoordinates.map((item) => item.task_id)),
          object_ids: unique(invalidTaskCoordinates.map((item) => item.object_id))
        }
      }, { status: 409 });
    }
    const operatingCompanyIds = unique(assignedTaskContexts.map((context) => context.operating_company_id));
    if (operatingCompanyIds.length > 1) {
      return Response.json({
        error: "Een route kan niet over meerdere juridische werkgevers worden verdeeld. Splits de route per bedrijf.",
        operating_company_ids: operatingCompanyIds
      }, { status: 409 });
    }
    const operatingCompanyId = operatingCompanyIds[0] || route.operating_company_id || null;
    const startCoordinates = mobileMapCoordinatePair(startOffice?.latitude, startOffice?.longitude);
    const endCoordinates = mobileMapCoordinatePair(endOffice?.latitude, endOffice?.longitude);
    const routeRoutingSnapshot = {
      status: "not_applicable",
      source: "manual_route_without_employee",
      resolved_at: nowIso(),
      company_id: operatingCompanyId,
      service_contexts: assignedTaskContexts
    };
    const routeExecution = await base44.asServiceRole.entities.RouteExecution.create({
      route_id: route.id,
      source_route_id: route.id,
      route_name: route.name || "Route",
      weekday,
      service_date: serviceDate,
      employee_id: null,
      employee_name: null,
      operating_company_id: operatingCompanyId,
      personnel_contract_id: null,
      contract_function_key: null,
      contract_cao_key: null,
      contract_routing_status: "not_applicable",
      contract_routing_snapshot: routeRoutingSnapshot,
      vehicle_id: route.vehicle_id || null,
      vehicle_license_plate: vehicle?.license_plate || null,
      status: "planned",
      shift_start_time: route.time_window_start || "00:00",
      shift_end_time: route.time_window_end || "00:00",
      start_location_name: startOffice?.name || null,
      start_latitude: startCoordinates.latitude,
      start_longitude: startCoordinates.longitude,
      end_location_name: endOffice?.name || null,
      end_latitude: endCoordinates.latitude,
      end_longitude: endCoordinates.longitude,
      total_planned_distance_km: route.total_distance_km ?? null,
      total_planned_travel_minutes: route.avg_travel_minutes ?? null,
      total_planned_service_minutes: route.total_service_minutes ?? null,
      total_planned_route_minutes: route.total_route_minutes ?? null,
      generated_at: nowIso(),
      metadata: { source: "uitvoering", copied_to_mobile: true }
    });
    const taskPayloads = [];
    assignments.forEach((assignment, assignmentIndex) => {
      const task = taskById.get(String(assignment.task_id));
      if (!task || !isTaskForDay(task, weekday)) return;
      const object = objectById.get(String(task.object_id || "")) || {};
      const serviceContext = buildTaskContext(task, object, route, serviceDate, publishedRoutingEvidence[assignmentIndex]);
      const repeatCount = Number(task.repeat_count || 1);
      const occurrenceCount = assignment.lock_all_occurrences ? repeatCount : Number(assignment.locked_occurrence_count || 1);
      const repeatIndexes = assignment.repeat_index ? [Number(assignment.repeat_index)] : Array.from({ length: Math.max(1, occurrenceCount) }, (_, index) => index + 1);
      repeatIndexes.forEach((repeatIndex) => {
        const { latitude, longitude } = assignedTaskCoordinates[assignmentIndex];
        const routingProjection = routingProjections[assignmentIndex] || buildTaskExecutionRoutingProjection(assignment, task, object, null, publishedRoutingEvidence[assignmentIndex]);
        taskPayloads.push({
          route_execution_id: routeExecution.id,
          source_route_id: route.id,
          original_task_id: String(task.id),
          object_id: String(task.object_id),
          sequence_index: taskPayloads.length + 1,
          task_name: makeTaskName(task, object, repeatIndex, repeatCount),
          object_name: object.name || "Object",
          task_type: task.task_type || "Taak",
          ...routingProjection,
          operating_company_id: serviceContext.operating_company_id || operatingCompanyId,
          personnel_contract_id: null,
          contract_function_key: serviceContext.function_type || null,
          contract_cao_key: serviceContext.cao_key || null,
          contract_routing_status: "not_applicable",
          contract_routing_snapshot: {
            status: "not_applicable",
            source: "manual_task_without_employee",
            resolved_at: nowIso(),
            service_context: serviceContext
          },
          repeat_index: repeatCount > 1 ? repeatIndex : null,
          repeat_count: repeatCount > 1 ? repeatCount : null,
          status: "pending",
          planned_arrival_time: assignment.planned_arrival_time || null,
          planned_start_time: assignment.planned_start_time || null,
          planned_departure_time: assignment.planned_departure_time || null,
          planned_arrival_seconds: secondsFromTime(assignment.planned_arrival_time),
          planned_departure_seconds: secondsFromTime(assignment.planned_departure_time),
          duration_minutes: Number(task.duration_minutes || 0),
          travel_from_previous_minutes: null,
          distance_from_previous_km: null,
          travel_to_next_minutes: null,
          distance_to_next_km: null,
          latitude,
          longitude,
          address: object.address || null,
          locked_to_route: !!assignment.locked_to_route,
          locked_sequence: !!assignment.locked_sequence,
          route_pin_hard: !!assignment.locked_to_route,
          arrival_deadline_time: task.arrival_deadline_time || null,
          uses_arrival_deadline: !!task.use_arrival_deadline,
          service_must_start_at: null,
          metadata: { source: "uitvoering", contract_routing_status: "not_applicable" }
        });
      });
    });
    if (taskPayloads.length) await base44.asServiceRole.entities.TaskExecution.bulkCreate(taskPayloads);
    return Response.json({ route_execution_id: routeExecution.id, created_tasks: taskPayloads.length, already_exists: false });
  } catch (error) {
    return Response.json({ error: error.message, code: error.code || null, details: error.details || null }, { status: Number(error.status || 500) });
  }
}

// base44/functions/_shared/mobile/mobileMe.ts
import { createClientFromRequest as createClientFromRequest2 } from "npm:@base44/sdk@0.8.31";
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}
function isPrivileged(user) {
  return ["admin", "director", "hr", "manager", "planner"].includes(String(user?.role || "").toLowerCase());
}
async function getEmployeeContext(base44, user) {
  const linked = await base44.asServiceRole.entities.Personnel.filter({ linked_user_id: user.id });
  const employee = linked[0] || null;
  if (employee) {
    const assignments = await base44.asServiceRole.entities.PersonnelCompanyAssignment.filter({ personnel_id: employee.id });
    const allCos = assignments.length > 0 ? await base44.asServiceRole.entities.Company.list() : [];
    const companies = assignments.filter((a) => a.assignment_status === "active" || !a.assignment_status).map((a) => {
      const co = allCos.find((c) => c.id === a.company_id);
      return co ? { company_id: co.id, company_name: co.display_name, trade_name: co.trade_name || null, is_primary: a.is_primary || false } : null;
    }).filter(Boolean);
    return {
      is_linked: true,
      employee_id: employee.id,
      employee_display_name: employee.name || null,
      linked_user_id: user.id,
      companies,
      pending_invitations: []
    };
  }
  const normalizedEmail = normalizeEmail(user.email);
  const pendingInvitations = await base44.asServiceRole.entities.EmployeeInvitation.filter({ normalized_email: normalizedEmail, status: "pending" });
  const validInvites = pendingInvitations.filter((inv) => !inv.expires_at || new Date(inv.expires_at) > /* @__PURE__ */ new Date());
  let inviteList = [];
  if (validInvites.length > 0) {
    const allCos = await base44.asServiceRole.entities.Company.list();
    const allP = await base44.asServiceRole.entities.Personnel.list();
    inviteList = validInvites.map((inv) => {
      const co = allCos.find((c) => c.id === inv.company_id);
      const p = allP.find((p2) => p2.id === inv.personnel_id);
      return { id: inv.id, personnel_id: inv.personnel_id, company_id: inv.company_id || null, company_name: co?.display_name || null, employee_display_name: p?.name || null, email: inv.email, expires_at: inv.expires_at || null };
    });
  }
  return {
    is_linked: false,
    employee_id: null,
    linked_user_id: user.id,
    companies: [],
    pending_invitations: inviteList
  };
}
async function handleMobileMe(req) {
  try {
    const base44 = createClientFromRequest2(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const employeeCtx = await getEmployeeContext(base44, user);
    const canViewRoute = isPrivileged(user) || employeeCtx.is_linked;
    const canSubmitReports = isPrivileged(user) || employeeCtx.is_linked;
    return Response.json({
      user: { id: user.id, name: user.full_name || user.email, email: user.email, role: user.role || "user" },
      permissions: { can_view_mobile_route: canViewRoute, can_submit_reports: canSubmitReports },
      employee_context: {
        ...employeeCtx,
        permissions: { can_view_employee_portal: true, can_view_mobile_route: canViewRoute, can_submit_reports: canSubmitReports }
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// base44/functions/_shared/mobile/mobileObjectFloorPlan.ts
import { createClientFromRequest as createClientFromRequest3 } from "npm:@base44/sdk@0.8.31";
function nowIso2() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
var MIME_EXTENSION = {
  "application/json": "json",
  "application/octet-stream": "bin",
  "model/vnd.usdz+zip": "usdz",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};
function compact(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}
function ascii(value) {
  return compact(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "");
}
function safeFilenamePart(value, fallback = "Bestand") {
  const clean = ascii(value).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+-\s+/g, " - ").replace(/-+/g, "-").trim();
  return clean || fallback;
}
function fromBase64(value) {
  const binary = atob(value || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function toBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function masterKeyId() {
  return Deno.env.get("MANAGED_FILE_MASTER_KEY_ID") || "managed-file-master-v1";
}
async function importMasterKey(usage) {
  const raw = Deno.env.get("MANAGED_FILE_MASTER_KEY_B64");
  if (!raw) throw new Error("MANAGED_FILE_MASTER_KEY_B64 is niet geconfigureerd.");
  const bytes = fromBase64(raw);
  if (bytes.byteLength !== 32) throw new Error("MANAGED_FILE_MASTER_KEY_B64 moet exact 32 bytes base64 bevatten.");
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, usage);
}
async function sha256Base64(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return toBase64(digest);
}
async function encryptBytesForStorage(bytes) {
  const dataKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const rawDataKey = await crypto.subtle.exportKey("raw", dataKey);
  const fileIv = crypto.getRandomValues(new Uint8Array(12));
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: fileIv }, dataKey, bytes);
  const masterKey = await importMasterKey(["encrypt"]);
  const wrappedKey = await crypto.subtle.encrypt({ name: "AES-GCM", iv: wrapIv }, masterKey, rawDataKey);
  return {
    ciphertext,
    encryption_algorithm: "AES-256-GCM",
    encryption_key_id: masterKeyId(),
    encryption_iv: toBase64(fileIv),
    encrypted_data_key: toBase64(wrappedKey),
    key_wrap_algorithm: "AES-256-GCM",
    key_wrap_iv: toBase64(wrapIv),
    plaintext_sha256: await sha256Base64(bytes),
    ciphertext_sha256: await sha256Base64(ciphertext)
  };
}
function slug(value, fallback = "unknown") {
  const clean = ascii(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return clean || fallback;
}
function extensionForAsset(asset, fallback = "bin") {
  const original = asset?.filename || asset?.name || "";
  const fromName = original.includes(".") ? original.split(".").pop() : "";
  const clean = String(fromName || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  return clean || MIME_EXTENSION[asset?.mime_type] || fallback;
}
function buildFloorPlanFileContext({ object, objectId, companyId, revision, label, category, sourceField, asset }) {
  const extension = extensionForAsset(asset);
  const ownerLabel = object?.name || object?.object_code || "Object";
  const filename = `${safeFilenamePart(ownerLabel)} - ${safeFilenamePart(label)} - rev-${revision}.${extension}`;
  const objectFolder = companyId ? `companies/company-${companyId}/objects/${slug(ownerLabel)}_${objectId}` : `objects/${slug(ownerLabel)}_${objectId}`;
  const folderPath = `${objectFolder}/floorplans/revision-${revision}`;
  return {
    extension,
    filename,
    folderPath,
    logicalPath: `${folderPath}/${filename}`,
    ownerLabel,
    category,
    sourceField
  };
}
async function uploadBase64Asset(base44, asset, context) {
  if (!asset?.base64_data) return null;
  try {
    const fileContext = buildFloorPlanFileContext({ ...context, asset });
    const binaryStr = atob(asset.base64_data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const encrypted = await encryptBytesForStorage(bytes);
    const storageFilename = `${fileContext.filename}.enc`;
    const blob = new Blob([encrypted.ciphertext], { type: "application/octet-stream" });
    const file = typeof File === "undefined" ? blob : new File([blob], storageFilename, { type: blob.type });
    const result = await base44.asServiceRole.integrations.Core.UploadFile({ file });
    const fileUrl = result?.file_url || null;
    if (!fileUrl) return null;
    const managed = await base44.asServiceRole.entities.ManagedFile.create({
      owner_type: "object",
      owner_id: context.objectId,
      company_id: context.companyId || null,
      upload_session_id: null,
      tenant_container_key: context.companyId ? `company:${context.companyId}` : `object:${context.objectId}`,
      owner_container_key: `object:${context.objectId}`,
      access_scope: "company",
      domain: "operations",
      category: fileContext.category,
      source_entity: "ObjectFloorPlan",
      source_entity_id: null,
      source_field: fileContext.sourceField,
      file_url: fileUrl,
      storage_filename: storageFilename,
      original_filename: asset.filename || asset.name || null,
      display_filename: fileContext.filename,
      download_filename: fileContext.filename,
      logical_path: fileContext.logicalPath,
      folder_path: fileContext.folderPath,
      extension: fileContext.extension,
      mime_type: asset.mime_type || blob.type || null,
      stored_mime_type: "application/octet-stream",
      size_bytes: bytes.length,
      ciphertext_size_bytes: encrypted.ciphertext.byteLength,
      encrypted: true,
      encryption_algorithm: encrypted.encryption_algorithm,
      encryption_key_id: encrypted.encryption_key_id,
      encryption_iv: encrypted.encryption_iv,
      encrypted_data_key: encrypted.encrypted_data_key,
      key_wrap_algorithm: encrypted.key_wrap_algorithm,
      key_wrap_iv: encrypted.key_wrap_iv,
      plaintext_sha256: encrypted.plaintext_sha256,
      ciphertext_sha256: encrypted.ciphertext_sha256,
      document_label: context.label || null,
      document_number: `rev-${context.revision}`,
      valid_from: null,
      valid_until: null,
      status: "active",
      version: context.revision,
      is_sensitive: true,
      security_classification: "strictly_confidential",
      retention_until: null,
      uploaded_at: nowIso2(),
      uploaded_by: context.uploadedBy || null,
      metadata: {
        owner_label: fileContext.ownerLabel,
        commercial_container_policy: "company-scoped-managed-files-v1",
        object_id: context.objectId,
        floor_plan_revision: context.revision
      }
    });
    return {
      file_url: fileUrl,
      file_id: managed.id,
      download_filename: managed.download_filename,
      logical_path: managed.logical_path
    };
  } catch (error) {
    console.error("Encrypted floorplan upload failed:", error);
    throw error;
  }
}
async function handleMobileObjectFloorPlan(req) {
  try {
    const base44 = createClientFromRequest3(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const { action, object_id } = body;
    if (!object_id) return Response.json({ error: "object_id is verplicht" }, { status: 400 });
    if (action === "get") {
      const records = await base44.asServiceRole.entities.ObjectFloorPlan.filter({ object_id, is_current: true });
      const current = records.find((r) => r.is_current && r.status === "published") || null;
      return Response.json({ floor_plan: current });
    }
    if (action === "publish") {
      const upload = body.upload || {};
      const [existing, object] = await Promise.all([
        base44.asServiceRole.entities.ObjectFloorPlan.filter({ object_id }),
        base44.asServiceRole.entities.SurveillanceObject.get(object_id).catch(() => null)
      ]);
      const maxRevision = existing.reduce((max, r) => Math.max(max, r.revision || 0), 0);
      const newRevision = maxRevision + 1;
      const assetContext = {
        object,
        objectId: object_id,
        companyId: object?.default_operating_company_id || null,
        revision: newRevision,
        uploadedBy: user.full_name || user.email || null
      };
      const [usdzAsset, rawAsset, preview2dAsset, metadataAsset] = await Promise.all([
        uploadBase64Asset(base44, upload.usdz_asset, { ...assetContext, label: "RoomPlan USDZ", category: "object_floorplan_usdz", sourceField: "usdz_file_url" }),
        uploadBase64Asset(base44, upload.raw_roomplan_asset, { ...assetContext, label: "RoomPlan raw data", category: "object_floorplan_raw_roomplan", sourceField: "raw_roomplan_file_url" }),
        uploadBase64Asset(base44, upload.preview_2d_asset, { ...assetContext, label: "RoomPlan 2D preview", category: "object_floorplan_preview_2d", sourceField: "preview_2d_file_url" }),
        uploadBase64Asset(base44, upload.metadata_asset, { ...assetContext, label: "RoomPlan metadata", category: "object_floorplan_metadata", sourceField: "metadata.metadata_url" })
      ]);
      const currentRecords = existing.filter((r) => r.is_current);
      await Promise.all(currentRecords.map(
        (r) => base44.asServiceRole.entities.ObjectFloorPlan.update(r.id, { is_current: false })
      ));
      const newRecord = await base44.asServiceRole.entities.ObjectFloorPlan.create({
        object_id,
        status: "published",
        revision: newRevision,
        is_current: true,
        title: upload.title || null,
        source: upload.source || "ios_roomplan",
        captured_by: user.full_name || user.email || null,
        captured_at: upload.captured_at || null,
        published_at: upload.published_at || nowIso2(),
        usdz_file_url: usdzAsset?.file_url || null,
        usdz_file_id: usdzAsset?.file_id || null,
        usdz_download_filename: usdzAsset?.download_filename || null,
        usdz_logical_path: usdzAsset?.logical_path || null,
        raw_roomplan_file_url: rawAsset?.file_url || null,
        raw_roomplan_file_id: rawAsset?.file_id || null,
        raw_roomplan_download_filename: rawAsset?.download_filename || null,
        raw_roomplan_logical_path: rawAsset?.logical_path || null,
        preview_2d_file_url: preview2dAsset?.file_url || null,
        preview_2d_file_id: preview2dAsset?.file_id || null,
        preview_2d_download_filename: preview2dAsset?.download_filename || null,
        preview_2d_logical_path: preview2dAsset?.logical_path || null,
        fallback_pdf_file_url: null,
        floorplan_2d_json: upload.floorplan_2d_json || null,
        annotations_json: upload.annotations_json || null,
        sensor_catalog_version: upload.sensor_catalog_version || null,
        metadata: upload.metadata || (metadataAsset?.file_url ? { metadata_url: metadataAsset.file_url } : null)
      });
      await Promise.all([usdzAsset, rawAsset, preview2dAsset, metadataAsset].filter((asset) => asset?.file_id).map((asset) => base44.asServiceRole.entities.ManagedFile.update(asset.file_id, { source_entity_id: newRecord.id })));
      await base44.asServiceRole.entities.MobileAuditLog.create({
        employee_id: user.id || null,
        object_id,
        action: "object_floorplan_published",
        payload: {
          floor_plan_id: newRecord.id,
          revision: newRevision,
          source: upload.source || "ios_roomplan",
          has_usdz: !!usdzAsset?.file_url,
          has_preview_2d: !!preview2dAsset?.file_url
        },
        created_at: nowIso2()
      });
      return Response.json({ floor_plan: newRecord });
    }
    return Response.json({ error: 'Onbekende action. Gebruik "get" of "publish".' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// base44/functions/_shared/mobile/mobileObjectsMap.ts
import { createClientFromRequest as createClientFromRequest4 } from "npm:@base44/sdk@0.8.25";
var OPEN_STATUSES = ["pending", "en_route", "arrived", "started", "postponed", "failed"];
function safeNumber2(value) {
  if (!["number", "string"].includes(typeof value) || typeof value === "string" && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function mobileMapCoordinatePair(latitudeValue, longitudeValue) {
  const latitude = safeNumber2(latitudeValue);
  const longitude = safeNumber2(longitudeValue);
  if (
    latitude === null || latitude < -90 || latitude > 90 ||
    longitude === null || longitude < -180 || longitude > 180 ||
    (latitude === 0 && longitude === 0)
  ) return { latitude: null, longitude: null };
  return { latitude, longitude };
}
function mobileGeoJsonHasGeometry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.type === "FeatureCollection") return Array.isArray(value.features) && value.features.length > 0;
  return value.type === "Feature" || value.type === "Polygon" || value.type === "MultiPolygon";
}
function mobileBuildingSelectionMode(object) {
  if (String(object?.building_selection_mode || "") === "manual" || mobileGeoJsonHasGeometry(object?.building_polygon_geojson)) return "manual";
  return "automatic";
}
function mobileMapGeometryStatus(object) {
  if (["configured", "needs_review"].includes(String(object?.map_geometry_status || ""))) return object.map_geometry_status;
  return mobileGeoJsonHasGeometry(object?.building_polygon_geojson) || mobileGeoJsonHasGeometry(object?.object_area_geojson) ? "configured" : "unconfigured";
}
function mobileMapGeometryRevision(object) {
  const revision = Number(object?.map_geometry_revision);
  return Number.isInteger(revision) && revision >= 0 ? revision : 0;
}
var MOBILE_MAP_MAX_FEATURES_BUILDING = 100;
var MOBILE_MAP_MAX_FEATURES_TERRAIN = 25;
var MOBILE_MAP_MAX_VERTICES = 1e4;
var MOBILE_MAP_MAX_BYTES = 75e4;
var MOBILE_MAP_MAX_DISTANCE_METERS = 5e3;
var MOBILE_MAP_MAX_BUILDING_AREA_SQM = 5e6;
var MOBILE_MAP_MAX_TERRAIN_AREA_SQM = 1e8;
function mobileMapHttpError(status, message, code = null) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}
function mobileMapFeatures(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  if (value.type === "FeatureCollection" && Array.isArray(value.features)) return value.features;
  if (value.type === "Feature") return [value];
  if (["Polygon", "MultiPolygon"].includes(String(value.type || ""))) return [{ type: "Feature", properties: {}, geometry: value }];
  return [];
}
function mobileMapPayloadConfigured(value) {
  if (value === null || value === void 0) return false;
  return !(value?.type === "FeatureCollection" && Array.isArray(value.features) && value.features.length === 0);
}
function mobileMapDistanceMeters(left, right) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(right[1] - left[1]);
  const longitudeDelta = radians(right[0] - left[0]);
  const latitude1 = radians(left[1]);
  const latitude2 = radians(right[1]);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
}
function mobileMapOrientation(left, middle, right) {
  return (middle[1] - left[1]) * (right[0] - middle[0]) - (middle[0] - left[0]) * (right[1] - middle[1]);
}
function mobileMapPointOnSegment(left, point, right) {
  const epsilon = 1e-12;
  return point[0] <= Math.max(left[0], right[0]) + epsilon && point[0] >= Math.min(left[0], right[0]) - epsilon && point[1] <= Math.max(left[1], right[1]) + epsilon && point[1] >= Math.min(left[1], right[1]) - epsilon;
}
function mobileMapSegmentsIntersect(leftStart, leftEnd, rightStart, rightEnd) {
  const first = mobileMapOrientation(leftStart, leftEnd, rightStart);
  const second = mobileMapOrientation(leftStart, leftEnd, rightEnd);
  const third = mobileMapOrientation(rightStart, rightEnd, leftStart);
  const fourth = mobileMapOrientation(rightStart, rightEnd, leftEnd);
  const epsilon = 1e-12;
  if ((first > epsilon && second < -epsilon || first < -epsilon && second > epsilon) && (third > epsilon && fourth < -epsilon || third < -epsilon && fourth > epsilon)) return true;
  if (Math.abs(first) <= epsilon && mobileMapPointOnSegment(leftStart, rightStart, leftEnd)) return true;
  if (Math.abs(second) <= epsilon && mobileMapPointOnSegment(leftStart, rightEnd, leftEnd)) return true;
  if (Math.abs(third) <= epsilon && mobileMapPointOnSegment(rightStart, leftStart, rightEnd)) return true;
  return Math.abs(fourth) <= epsilon && mobileMapPointOnSegment(rightStart, leftEnd, rightEnd);
}
function mobileMapRingSelfIntersects(ring) {
  const segmentCount = ring.length - 1;
  for (let left = 0; left < segmentCount; left += 1) {
    for (let right = left + 1; right < segmentCount; right += 1) {
      if (right === left + 1 || left === 0 && right === segmentCount - 1) continue;
      if (mobileMapSegmentsIntersect(ring[left], ring[left + 1], ring[right], ring[right + 1])) return true;
    }
  }
  return false;
}
function mobileMapRingsIntersect(leftRing, rightRing) {
  for (let left = 0; left < leftRing.length - 1; left += 1) {
    for (let right = 0; right < rightRing.length - 1; right += 1) {
      if (mobileMapSegmentsIntersect(leftRing[left], leftRing[left + 1], rightRing[right], rightRing[right + 1])) return true;
    }
  }
  return false;
}
function mobileMapPositionInsideRing(position, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPosition = ring[index];
    const previousPosition = ring[previous];
    const crossesLatitude = currentPosition[1] > position[1] !== previousPosition[1] > position[1];
    if (!crossesLatitude) continue;
    const crossingLongitude = (previousPosition[0] - currentPosition[0]) * (position[1] - currentPosition[1]) / (previousPosition[1] - currentPosition[1]) + currentPosition[0];
    if (position[0] < crossingLongitude) inside = !inside;
  }
  return inside;
}
function mobileMapRingAreaSquareMeters(ring) {
  const referenceLatitude = ring.reduce((sum, position) => sum + position[1], 0) / ring.length;
  const longitudeScale = 111320 * Math.cos(referenceLatitude * Math.PI / 180);
  const latitudeScale = 110540;
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    twiceArea += ring[index][0] * longitudeScale * (ring[index + 1][1] * latitudeScale) - ring[index + 1][0] * longitudeScale * (ring[index][1] * latitudeScale);
  }
  return Math.abs(twiceArea) / 2;
}
function mobileMapNormalizePosition(value) {
  if (!Array.isArray(value) || value.length < 2) throw new Error("invalid_position");
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error("invalid_position");
  return [Number(longitude.toFixed(7)), Number(latitude.toFixed(7))];
}
function mobileMapNormalizeRing(value, anchor, state) {
  if (!Array.isArray(value) || value.length < 4) throw new Error("invalid_ring");
  const ring = value.map(mobileMapNormalizePosition);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) throw new Error("open_ring");
  for (let index = 1; index < ring.length; index += 1) {
    if (ring[index][0] === ring[index - 1][0] && ring[index][1] === ring[index - 1][1]) throw new Error("duplicate_position");
  }
  const unique = new Set(ring.slice(0, -1).map((position) => position.join(",")));
  if (unique.size < 3 || mobileMapRingSelfIntersects(ring) || mobileMapRingAreaSquareMeters(ring) < 0.1) throw new Error("invalid_ring");
  ring.forEach((position) => {
    state.vertices += 1;
    if (state.vertices > MOBILE_MAP_MAX_VERTICES || mobileMapDistanceMeters(anchor, position) > MOBILE_MAP_MAX_DISTANCE_METERS) throw new Error("geometry_limits");
  });
  return ring;
}
function mobileMapNormalizeGeometry(value, anchor, state) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !["Polygon", "MultiPolygon"].includes(String(value.type || ""))) throw new Error("invalid_geometry");
  const normalizePolygon = (polygon) => {
    if (!Array.isArray(polygon) || !polygon.length) throw new Error("invalid_polygon");
    const rings = polygon.map((ring) => mobileMapNormalizeRing(ring, anchor, state));
    for (let holeIndex = 1; holeIndex < rings.length; holeIndex += 1) {
      if (mobileMapRingsIntersect(rings[0], rings[holeIndex]) || !mobileMapPositionInsideRing(rings[holeIndex][0], rings[0])) throw new Error("invalid_hole");
      for (let otherHoleIndex = 1; otherHoleIndex < holeIndex; otherHoleIndex += 1) {
        if (mobileMapRingsIntersect(rings[holeIndex], rings[otherHoleIndex]) || mobileMapPositionInsideRing(rings[holeIndex][0], rings[otherHoleIndex]) || mobileMapPositionInsideRing(rings[otherHoleIndex][0], rings[holeIndex])) throw new Error("overlapping_holes");
      }
    }
    state.area += Math.max(0, mobileMapRingAreaSquareMeters(rings[0]) - rings.slice(1).reduce((sum, ring) => sum + mobileMapRingAreaSquareMeters(ring), 0));
    if (state.area > state.maxArea) throw new Error("geometry_area_limit");
    return rings;
  };
  const coordinates = value.type === "Polygon" ? normalizePolygon(value.coordinates) : Array.isArray(value.coordinates) && value.coordinates.length ? value.coordinates.map(normalizePolygon) : (() => {
    throw new Error("invalid_multipolygon");
  })();
  return { type: value.type, coordinates };
}
function mobileMapSafeLocalId(feature, index, prefix) {
  return String(feature?.id || feature?.properties?.local_id || "").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 120) || `${prefix}:${index + 1}`;
}
function mobileMapSafeCollection(value, object, kind) {
  if (!mobileMapPayloadConfigured(value)) return { value: null, invalid: false };
  try {
    const text = JSON.stringify(value);
    if (new TextEncoder().encode(text).byteLength > MOBILE_MAP_MAX_BYTES) throw new Error("payload_too_large");
    const { latitude, longitude } = mobileMapCoordinatePair(object?.latitude, object?.longitude);
    if (latitude === null || latitude < -90 || latitude > 90 || longitude === null || longitude < -180 || longitude > 180) throw new Error("missing_anchor");
    const rawFeatures = mobileMapFeatures(value);
    const isCollection = value?.type === "FeatureCollection" && Array.isArray(value.features);
    if (!rawFeatures.length && !isCollection) throw new Error("invalid_collection");
    const maxFeatures = kind === "building" ? MOBILE_MAP_MAX_FEATURES_BUILDING : MOBILE_MAP_MAX_FEATURES_TERRAIN;
    if (rawFeatures.length > maxFeatures) throw new Error("too_many_features");
    const state = {
      vertices: 0,
      area: 0,
      maxArea: kind === "building" ? MOBILE_MAP_MAX_BUILDING_AREA_SQM : MOBILE_MAP_MAX_TERRAIN_AREA_SQM
    };
    const features = rawFeatures.map((feature, index) => {
      const rawGeometry = feature?.type === "Feature" ? feature.geometry : feature;
      let properties;
      if (kind === "building" && feature?.properties?.source === "pdok_bag") {
        const sourceFeatureId = String(feature.properties.source_feature_id || feature.id || "").trim();
        const sourceStatus = String(feature.properties.source_status || "").trim().slice(0, 120);
        if (!sourceFeatureId || sourceFeatureId.length > 120 || !/^[a-zA-Z0-9_-]+$/.test(sourceFeatureId) || !sourceStatus || ["gesloopt", "ten onrechte", "ingetrokken", "niet gerealiseerd"].some((term) => sourceStatus.toLowerCase().includes(term))) throw new Error("invalid_pdok_source");
        const sourceRetrievedAt = String(feature.properties.source_retrieved_at || "").trim();
        properties = {
          source: "pdok_bag",
          source_feature_id: sourceFeatureId,
          source_identificatie: String(feature.properties.source_identificatie || "").trim().slice(0, 80) || null,
          source_status: sourceStatus,
          source_retrieved_at: Number.isFinite(Date.parse(sourceRetrievedAt)) ? new Date(sourceRetrievedAt).toISOString() : null
        };
      } else {
        const source = kind === "building" ? "manual" : "user_drawn";
        properties = { source, local_id: mobileMapSafeLocalId(feature, index, source) };
      }
      return {
        type: "Feature",
        id: mobileMapSafeLocalId(feature, index, kind),
        properties,
        geometry: mobileMapNormalizeGeometry(rawGeometry, [longitude, latitude], state)
      };
    });
    const collection = features.length ? { type: "FeatureCollection", features } : null;
    if (collection && new TextEncoder().encode(JSON.stringify(collection)).byteLength > MOBILE_MAP_MAX_BYTES) throw new Error("payload_too_large");
    return { value: collection, invalid: false };
  } catch {
    return { value: null, invalid: true };
  }
}
function mobileSafeMapState(object) {
  const building = mobileMapSafeCollection(object?.building_polygon_geojson, object, "building");
  const terrain = mobileMapSafeCollection(object?.object_area_geojson, object, "terrain");
  const invalid = building.invalid || terrain.invalid;
  return {
    building_polygon_geojson: building.value,
    object_area_geojson: terrain.value,
    building_selection_mode: mobileBuildingSelectionMode(object),
    map_geometry_status: invalid ? "needs_review" : mobileMapGeometryStatus(object),
    invalid
  };
}
async function requireMobilePersonnel(base44, user) {
  if (isPrivileged2(user)) return null;
  const linked = await base44.asServiceRole.entities.Personnel.filter({ linked_user_id: user.id });
  if (linked.length !== 1) {
    throw mobileMapHttpError(403, "Gebruikersaccount is niet eenduidig aan een actieve medewerker gekoppeld", "mobile_personnel_link_required");
  }
  const employee = linked[0];
  if (String(employee.status || "").toLowerCase() !== "active") {
    throw mobileMapHttpError(403, "Het gekoppelde medewerkersaccount is niet actief", "mobile_personnel_inactive");
  }
  return employee;
}
async function requireAuthorizedMobileRoute(base44, user, routeExecutionId, employee = void 0) {
  const routeId = String(routeExecutionId || "").trim();
  if (!routeId || routeId.length > 180) throw mobileMapHttpError(400, "route_execution_id is ongeldig", "mobile_route_id_invalid");
  const resolvedEmployee = employee === void 0 ? await requireMobilePersonnel(base44, user) : employee;
  const routes = await base44.asServiceRole.entities.RouteExecution.filter({ id: routeId });
  const route = routes[0] || null;
  if (!route) throw mobileMapHttpError(404, "Route-uitvoering niet gevonden", "mobile_route_not_found");
  if (!isPrivileged2(user) && (!resolvedEmployee || String(route.employee_id || "") !== String(resolvedEmployee.id))) {
    throw mobileMapHttpError(403, "Geen toegang tot deze route-uitvoering", "mobile_route_forbidden");
  }
  return { route, employee: resolvedEmployee };
}
function statusForObject(objectId, tasks) {
  const items = tasks.filter((task) => String(task.object_id) === String(objectId));
  if (!items.length) return { map_status: "customer", open_task_count: 0, has_task_in_current_route: false, is_next_task_object: false };
  const open = items.filter((task) => OPEN_STATUSES.includes(task.status));
  const active = items.some((task) => ["arrived", "started"].includes(task.status));
  const next = tasks.find((task) => OPEN_STATUSES.includes(task.status));
  if (active) return { map_status: "active_task", open_task_count: open.length, has_task_in_current_route: true, is_next_task_object: false };
  if (next && String(next.object_id) === String(objectId)) return { map_status: "next_task", open_task_count: open.length, has_task_in_current_route: true, is_next_task_object: true };
  if (!open.length) return { map_status: "completed", open_task_count: 0, has_task_in_current_route: true, is_next_task_object: false };
  return { map_status: "route_task", open_task_count: open.length, has_task_in_current_route: true, is_next_task_object: false };
}
async function handleMobileObjectsMap(req) {
  try {
    const base44 = createClientFromRequest4(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const employee = await requireMobilePersonnel(base44, user);
    const authorizedRoute = body.route_execution_id
      ? (await requireAuthorizedMobileRoute(base44, user, body.route_execution_id, employee)).route
      : null;
    const [objects, tasks, floorPlans] = await Promise.all([
      base44.asServiceRole.entities.SurveillanceObject.list(),
      authorizedRoute ? base44.asServiceRole.entities.TaskExecution.filter({ route_execution_id: authorizedRoute.id }) : Promise.resolve([]),
      base44.asServiceRole.entities.ObjectFloorPlan.filter({ is_current: true, status: "published" })
    ]);
    const floorPlanByObjectId = new Map(floorPlans.map((fp) => [String(fp.object_id), fp]));
    return Response.json({
      objects: objects.map((object) => {
        const coordinates = mobileMapCoordinatePair(object.latitude, object.longitude);
        const mobileObject = { ...object, ...coordinates };
        return { object: mobileObject, geometryState: mobileSafeMapState(mobileObject) };
      }).filter(({ object, geometryState }) => object.show_on_mobile_map !== false && object.is_active_customer_object !== false && geometryState.map_geometry_status !== "needs_review").map(({ object, geometryState }) => {
        const fp = floorPlanByObjectId.get(String(object.id));
        const taskMapState = statusForObject(object.id, tasks);
        return {
          object_id: object.id,
          name: object.name,
          latitude: object.latitude,
          longitude: object.longitude,
          address: object.address || null,
          ...taskMapState,
          building_selection_mode: geometryState.building_selection_mode,
          map_geometry_status: geometryState.map_geometry_status,
          map_geometry_revision: mobileMapGeometryRevision(object),
          map_geometry_hash: object.map_geometry_hash || null,
          building_polygon_geojson: geometryState.building_polygon_geojson,
          object_area_geojson: taskMapState.has_task_in_current_route ? geometryState.object_area_geojson : null,
          mobile_map_priority: Number(object.mobile_map_priority || 0),
          floor_plan_summary: fp ? {
            floor_plan_id: fp.id,
            revision: fp.revision,
            usdz_file_url: fp.usdz_file_url || null,
            preview_2d_file_url: fp.preview_2d_file_url || null,
            updated_at: fp.published_at || fp.updated_date || null
          } : null
        };
      }).filter((object) => object.latitude !== null && object.longitude !== null || object.has_task_in_current_route)
    });
  } catch (error) {
    return Response.json({ error: error.message, code: error.code || null }, { status: Number(error.status) || 500 });
  }
}

// base44/functions/_shared/mobile/mobileReport.ts
import { createClientFromRequest as createClientFromRequest5 } from "npm:@base44/sdk@0.8.25";
function nowIso3() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
async function handleMobileReport(req) {
  try {
    const base44 = createClientFromRequest5(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    if (body.action === "photo") {
      const photo = await base44.asServiceRole.entities.MobilePhoto.create({
        report_id: body.report_id,
        task_execution_id: body.task_execution_id,
        route_execution_id: body.route_execution_id,
        object_id: body.object_id,
        file_url: body.file_url,
        thumbnail_url: body.thumbnail_url || null,
        caption: body.caption || null,
        taken_at: body.taken_at || null,
        uploaded_at: nowIso3(),
        created_offline_at: body.created_offline_at || null,
        gps_latitude: body.latitude ?? null,
        gps_longitude: body.longitude ?? null,
        metadata: body.metadata || null
      });
      if (body.report_id) {
        const reports = await base44.asServiceRole.entities.MobileReport.filter({ id: body.report_id });
        if (reports[0]) await base44.asServiceRole.entities.MobileReport.update(body.report_id, { photo_count: Number(reports[0].photo_count || 0) + 1 });
      }
      return Response.json({ photo, server_time: nowIso3() });
    }
    const report = await base44.asServiceRole.entities.MobileReport.create({
      task_execution_id: body.task_execution_id,
      route_execution_id: body.route_execution_id,
      object_id: body.object_id,
      employee_id: body.employee_id || null,
      status: body.status || "submitted",
      report_type: body.report_type,
      report_text: body.report_text || null,
      checklist_answers: body.checklist_answers || {},
      extra_fields: body.extra_fields || null,
      created_offline_at: body.created_offline_at || null,
      created_at: nowIso3(),
      submitted_at: body.submitted_at || nowIso3(),
      synced_at: nowIso3(),
      gps_latitude: body.latitude ?? null,
      gps_longitude: body.longitude ?? null,
      photo_count: Number(body.photo_count || 0),
      photos: body.photos || null,
      metadata: body.metadata || null
    });
    return Response.json({ report, server_time: nowIso3() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// base44/functions/_shared/mobile/mobileRouteAction.ts
import { createClientFromRequest as createClientFromRequest6 } from "npm:@base44/sdk@0.8.25";
function nowIso4() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
async function audit(base44, action, route, body) {
  await base44.asServiceRole.entities.MobileAuditLog.create({
    employee_id: route.employee_id || null,
    route_execution_id: route.id,
    task_execution_id: null,
    object_id: null,
    action,
    payload: body || {},
    created_at: nowIso4(),
    created_offline_at: body?.offline_created_at || body?.downloaded_at || null,
    synced_at: nowIso4(),
    latitude: body?.latitude ?? null,
    longitude: body?.longitude ?? null,
    device_id: body?.device_id || null,
    app_version: body?.app_version || null
  });
}
async function executeMobileRouteAction(base44, user, body) {
  const routeId = String(body?.route_execution_id || "").trim();
  const action = String(body?.action || "").trim();
  if (!routeId || !action) throw mobileMapHttpError(400, "route_execution_id en action zijn verplicht");
  if (!["downloaded", "start", "complete", "pause", "cancel"].includes(action)) {
    throw mobileMapHttpError(400, "Onbekende route-actie");
  }
  const employee = await requireMobilePersonnel(base44, user);
  const { route } = await requireAuthorizedMobileRoute(base44, user, routeId, employee);
  const patch = { last_mobile_sync_at: nowIso4() };
  if (action === "downloaded") {
    patch.status = route.status === "planned" ? "downloaded" : route.status;
    patch.downloaded_by_employee_at = body.downloaded_at || nowIso4();
  }
  if (action === "start") {
    patch.status = "active";
    patch.actual_started_at = body.timestamp || nowIso4();
  }
  if (action === "complete") {
    const tasks = await base44.asServiceRole.entities.TaskExecution.filter({ route_execution_id: route.id });
    const openTasks = tasks.filter((task) => !["completed", "skipped"].includes(task.status));
    if (openTasks.length && !body.force_complete) {
      const error = mobileMapHttpError(409, "Er staan nog open taken in deze route");
      error.open_task_count = openTasks.length;
      throw error;
    }
    patch.status = "completed";
    patch.actual_completed_at = body.timestamp || nowIso4();
  }
  if (action === "pause") patch.status = "paused";
  if (action === "cancel") patch.status = "cancelled";
  const updated = await base44.asServiceRole.entities.RouteExecution.update(route.id, patch);
  await audit(base44, action === "downloaded" ? "route_downloaded" : `route_${action}ed`, route, body);
  return { route_execution: updated, server_time: nowIso4() };
}
async function handleMobileRouteAction(req) {
  try {
    const base44 = createClientFromRequest6(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    return Response.json(await executeMobileRouteAction(base44, user, body));
  } catch (error) {
    return Response.json({
      error: error.message,
      code: error.code || null,
      ...(Number.isInteger(error.open_task_count) ? { open_task_count: error.open_task_count } : {})
    }, { status: Number(error.status) || 500 });
  }
}

// base44/functions/_shared/mobile/mobileRoutePackage.ts
import { createClientFromRequest as createClientFromRequest7 } from "npm:@base44/sdk@0.8.31";
var OPEN_STATUSES2 = ["pending", "en_route", "arrived", "started", "postponed", "failed"];
function todayIso() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function nowIso5() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function isPrivileged2(user) {
  return ["admin", "director", "hr", "manager", "planner"].includes(String(user?.role || "").toLowerCase());
}
async function findEmployee(base44, user) {
  return requireMobilePersonnel(base44, user);
}
async function getRouteExecution(base44, user, body, employee) {
  if (body.route_execution_id) {
    return (await requireAuthorizedMobileRoute(base44, user, body.route_execution_id, employee)).route;
  }
  const date = body.date || todayIso();
  const routeQuery = {
    service_date: date,
    ...(!isPrivileged2(user) ? { employee_id: employee?.id } : {}),
    ...(isPrivileged2(user) && body.employee_id ? { employee_id: body.employee_id } : {})
  };
  let executions = await base44.asServiceRole.entities.RouteExecution.filter(routeQuery);
  executions = executions.filter((route) => ["planned", "downloaded", "active", "paused"].includes(route.status));
  if (body.vehicle_id) executions = executions.filter((route) => String(route.vehicle_id || "") === String(body.vehicle_id));
  if (!isPrivileged2(user)) executions = executions.filter((route) => String(route.employee_id || "") === String(employee?.id || ""));
  if (isPrivileged2(user) && body.employee_id) executions = executions.filter((route) => String(route.employee_id || "") === String(body.employee_id));
  return executions.sort((a, b) => String(a.shift_start_time || "").localeCompare(String(b.shift_start_time || "")))[0] || null;
}
function taskTemplateId(templates, taskType) {
  return templates.find((t) => t.is_active !== false && t.task_type === taskType)?.id || null;
}
function mapStatus(objectId, taskExecutions) {
  const tasks = taskExecutions.filter((task) => String(task.object_id) === String(objectId));
  if (!tasks.length) return { map_status: "customer", open_task_count: 0, has_task_in_current_route: false, is_next_task_object: false };
  const openTasks = tasks.filter((task) => OPEN_STATUSES2.includes(task.status));
  const active = tasks.some((task) => ["arrived", "started"].includes(task.status));
  const nextOpen = taskExecutions.find((task) => OPEN_STATUSES2.includes(task.status));
  if (active) return { map_status: "active_task", open_task_count: openTasks.length, has_task_in_current_route: true, is_next_task_object: false };
  if (nextOpen && String(nextOpen.object_id) === String(objectId)) return { map_status: "next_task", open_task_count: openTasks.length, has_task_in_current_route: true, is_next_task_object: true };
  if (!openTasks.length) return { map_status: "completed", open_task_count: 0, has_task_in_current_route: true, is_next_task_object: false };
  return { map_status: "route_task", open_task_count: openTasks.length, has_task_in_current_route: true, is_next_task_object: false };
}
async function buildPackage(base44, routeExecution) {
  const [taskExecutions, objects, templates, vehicles, personnel, floorPlans] = await Promise.all([
    base44.asServiceRole.entities.TaskExecution.filter({ route_execution_id: routeExecution.id }),
    base44.asServiceRole.entities.SurveillanceObject.list(),
    base44.asServiceRole.entities.ReportTemplate.list(),
    base44.asServiceRole.entities.Vehicle.list(),
    base44.asServiceRole.entities.Personnel.list(),
    base44.asServiceRole.entities.ObjectFloorPlan.filter({ is_current: true, status: "published" })
  ]);
  const sortedTasks = taskExecutions.sort((a, b) => Number(a.sequence_index || 0) - Number(b.sequence_index || 0));
  const objectById = new Map(objects.map((object) => [String(object.id), object]));
  const floorPlanByObjectId = new Map(floorPlans.map((fp) => [String(fp.object_id), fp]));
  const vehicle = vehicles.find((v) => String(v.id) === String(routeExecution.vehicle_id)) || null;
  const employee = personnel.find((p) => String(p.id) === String(routeExecution.employee_id)) || null;
  const relevantObjectIds = new Set(sortedTasks.map((task) => String(task.object_id)));
  const stops = sortedTasks.map((task) => {
    const object = objectById.get(String(task.object_id)) || {};
    const coordinates = mobileMapCoordinatePair(task.latitude, task.longitude);
    return {
      task_execution_id: task.id,
      route_execution_id: task.route_execution_id,
      original_task_id: task.original_task_id,
      object_id: task.object_id,
      sequence_index: task.sequence_index,
      object_name: task.object_name,
      task_name: task.task_name,
      task_type: task.task_type,
      repeat_index: task.repeat_index ?? null,
      repeat_count: task.repeat_count ?? null,
      custom_block_label: task.custom_block_label || null,
      status: task.status,
      planned_arrival: task.planned_arrival_time || null,
      planned_start: task.planned_start_time || null,
      planned_departure: task.planned_departure_time || null,
      duration_minutes: task.duration_minutes,
      travel_from_previous_minutes: task.travel_from_previous_minutes ?? null,
      distance_from_previous_km: task.distance_from_previous_km ?? null,
      travel_to_next_minutes: task.travel_to_next_minutes ?? null,
      distance_to_next_km: task.distance_to_next_km ?? null,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      address: task.address || object.address || null,
      parking_instruction: object.parking_instruction || null,
      entry_instruction: object.entry_instruction || null,
      walking_instruction: object.walking_instruction || null,
      access_instruction: object.access_instruction || null,
      alarm_instruction: object.alarm_instruction || null,
      key_instruction: object.key_instruction || null,
      object_notes: object.object_notes || object.notes || null,
      safety_notes: object.safety_notes || null,
      last_incident_notes: object.last_incident_notes || null,
      object_map_url: object.object_map_url || object.object_map_file_url || null,
      report_template_id: taskTemplateId(templates, task.task_type)
    };
  });
  const objectsOnMap = objects.map((object) => {
    const coordinates = mobileMapCoordinatePair(object.latitude, object.longitude);
    const mobileObject = { ...object, ...coordinates };
    return { object: mobileObject, geometryState: mobileSafeMapState(mobileObject) };
  }).filter(({ object, geometryState }) => object.show_on_mobile_map !== false && object.is_active_customer_object !== false && geometryState.map_geometry_status !== "needs_review").map(({ object, geometryState }) => ({
    object_id: object.id,
    name: object.name,
    latitude: object.latitude,
    longitude: object.longitude,
    address: object.address || null,
    ...mapStatus(object.id, sortedTasks),
    building_selection_mode: geometryState.building_selection_mode,
    map_geometry_status: geometryState.map_geometry_status,
    map_geometry_revision: mobileMapGeometryRevision(object),
    map_geometry_hash: object.map_geometry_hash || null,
    building_polygon_geojson: geometryState.building_polygon_geojson,
    object_area_geojson: relevantObjectIds.has(String(object.id)) ? geometryState.object_area_geojson : null,
    mobile_map_priority: Number(object.mobile_map_priority || 0),
    floor_plan_summary: (() => {
      const fp = floorPlanByObjectId.get(String(object.id));
      return fp ? {
        floor_plan_id: fp.id,
        revision: fp.revision,
        usdz_file_url: fp.usdz_file_url || null,
        preview_2d_file_url: fp.preview_2d_file_url || null,
        updated_at: fp.published_at || fp.updated_date || null
      } : null;
    })()
  })).filter((object) => object.latitude !== null && object.longitude !== null || relevantObjectIds.has(String(object.object_id)));
  return {
    route_execution_id: routeExecution.id,
    route_name: routeExecution.route_name,
    status: routeExecution.status,
    employee: { id: routeExecution.employee_id, name: routeExecution.employee_name || employee?.name || null },
    vehicle: { id: routeExecution.vehicle_id, license_plate: routeExecution.vehicle_license_plate || vehicle?.license_plate || null },
    shift: { start: routeExecution.shift_start_time, end: routeExecution.shift_end_time },
    start_location: { name: routeExecution.start_location_name, latitude: routeExecution.start_latitude, longitude: routeExecution.start_longitude },
    end_location: { name: routeExecution.end_location_name, latitude: routeExecution.end_latitude, longitude: routeExecution.end_longitude },
    stops,
    objects_on_map: objectsOnMap,
    report_templates: templates.filter((t) => t.is_active !== false).map((t) => ({ id: t.id, name: t.name, task_type: t.task_type, fields: t.fields || [] })),
    server_time: nowIso5(),
    sync_token: `${routeExecution.id}:${nowIso5()}`
  };
}
async function handleMobileRoutePackage(req) {
  try {
    const base44 = createClientFromRequest7(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const employee = await findEmployee(base44, user);
    const routeExecution = await getRouteExecution(base44, user, body || {}, employee);
    if (!routeExecution) return Response.json({ error: "Geen actieve of geplande route gevonden" }, { status: 404 });
    const routePackage = await buildPackage(base44, routeExecution);
    await base44.asServiceRole.entities.RouteExecution.update(routeExecution.id, { mobile_route_package_cache: routePackage, last_mobile_sync_at: nowIso5() });
    return Response.json(routePackage);
  } catch (error) {
    return Response.json({ error: error.message, code: error.code || null }, { status: Number(error.status) || 500 });
  }
}

// base44/functions/_shared/mobile/mobileSync.ts
import { createClientFromRequest as createClientFromRequest8 } from "npm:@base44/sdk@0.8.25";
function nowIso6() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
async function handleMobileSync(req) {
  try {
    const base44 = createClientFromRequest8(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const accepted = [];
    const failed = [];
    for (const event of body.events || []) {
      try {
        await base44.asServiceRole.entities.MobileAuditLog.create({
          employee_id: event.payload?.employee_id || null,
          route_execution_id: event.payload?.route_execution_id || null,
          task_execution_id: event.payload?.task_execution_id || null,
          object_id: event.payload?.object_id || null,
          action: event.type,
          payload: event.payload || {},
          created_at: event.timestamp || nowIso6(),
          created_offline_at: event.offline_created_at || null,
          synced_at: nowIso6(),
          latitude: event.payload?.latitude ?? null,
          longitude: event.payload?.longitude ?? null,
          device_id: body.device_id || null,
          app_version: body.app_version || null
        });
        accepted.push(event.local_event_id || event.type);
      } catch (error) {
        failed.push({ local_event_id: event.local_event_id, error: error.message });
      }
    }
    return Response.json({ accepted, failed, server_time: nowIso6(), new_sync_token: `${nowIso6()}:${accepted.length}` });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// base44/functions/mobileApi/entry.ts
var HANDLERS = {
  create_route_execution: handleCreateMobileRouteExecution,
  me: handleMobileMe,
  object_floor_plan: handleMobileObjectFloorPlan,
  objects_map: handleMobileObjectsMap,
  report: handleMobileReport,
  route_action: handleMobileRouteAction,
  route_package: handleMobileRoutePackage,
  sync: handleMobileSync
};
var OPERATION_ACTIONS = /* @__PURE__ */ new Set([
  "object_floor_plan",
  "report",
  "route_action"
]);
function json(data, status = 200) {
  return Response.json(data, { status });
}
function requestForHandler(req, body, includeOperation) {
  const headers = new Headers(req.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  const nestedPayload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload : {};
  const { action: _routerAction, operation, payload: _payload, ...flatPayload } = body;
  const legacyPayload = {
    ...flatPayload,
    ...nestedPayload
  };
  if (includeOperation) legacyPayload.action = operation;
  return new Request(req.url, {
    method: req.method,
    headers,
    body: JSON.stringify(legacyPayload)
  });
}
Deno.serve(async (req) => {
  try {
    const body = await req.clone().json().catch(() => ({}));
    const action = String(body?.action || "");
    const handler = HANDLERS[action];
    if (!handler) {
      return json({
        error: "Onbekende mobiele actie",
        allowed_actions: Object.keys(HANDLERS)
      }, 400);
    }
    if (OPERATION_ACTIONS.has(action)) {
      if (!body.operation) {
        return json({ error: `operation is verplicht voor ${action}` }, 400);
      }
      return handler(requestForHandler(req, body, true));
    }
    return handler(requestForHandler(req, body, false));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

export { buildTaskExecutionRoutingProjection, loadPublishedTaskRoutingEvidence, projectedTaskTypeKey };
