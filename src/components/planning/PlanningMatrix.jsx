import React, { useEffect, useMemo, useRef, useState } from "react";
import { getISOWeek } from "date-fns";
import { Droppable } from "@hello-pangea/dnd";
import {
  AlertTriangle,
  Check,
  Clock3,
  Cloud,
  ClipboardPaste,
  Copy,
  GripHorizontal,
  Layers3,
  Loader2,
  Building2,
  Pencil,
  Route,
  Scissors,
  Trash2,
  UserMinus,
  UserRound,
  UserRoundPlus,
} from "lucide-react";
import CompactEmployeeIdentity from "@/components/planning/CompactEmployeeIdentity";
import PlanningEmployeePortraitOverlay from "@/components/planning/PlanningEmployeePortraitOverlay";
import PlanningObjectInfoDialog from "@/components/planning/PlanningObjectInfoDialog";
import PlanningClipboardContextMenu from "@/components/planning/PlanningClipboardContextMenu";
import TimelineTimeScale from "@/components/planning/TimelineTimeScale";

import {
  formatMinutesAsHours,
  getOccurrencePlanningState,
  getShiftInterval,
  getTaskOccurrenceDayProjection,
  isPlanningObjectActive,
  isPlanningPersonnelActive,
  parseDateKey,
  taskCoverageSummary,
  toDateKey,
} from "@/components/planning/planningDomain";
import {
  MAX_AUTOMATIC_TASK_SERVICE_MINUTES,
  clockToTimelineMinutes,
  getTaskTimelineDemand,
  getTaskTimelineGaps,
  getTaskTimelineLaneHeight,
  resizeTimelineInterval,
  timelineMinuteFromLanePointer,
  timelineMinutesToClock,
} from "@/components/planning/planningTimelineDomain";
import { cn } from "@/lib/utils";

const dayFormatter = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" });

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function personnelName(personnel) {
  return personnel?.name
    || personnel?.display_name
    || [personnel?.call_name || personnel?.first_name, personnel?.name_prefix, personnel?.last_name]
      .filter(Boolean)
      .join(" ")
    || "Onbekende medewerker";
}

function assignmentIdentity(assignment, personnelById, fallbackPersonnel = null) {
  const personnel = fallbackPersonnel
    || personnelById?.get(String(assignment?.personnel_id || ""))
    || null;
  const name = assignment?.personnel_name
    || assignment?.personnel_name_snapshot
    || assignment?.employee_name
    || personnelName(personnel);
  const photoUrl = personnel?.photo_file_url
    || assignment?.personnel_photo_file_url
    || assignment?.personnel_photo_url
    || assignment?.photo_file_url
    || null;
  return { name, photoUrl, personnel };
}

function activeAssignments(assignments) {
  return assignments.filter(item => item.status !== "removed");
}

function assignmentWarningCount(assignment) {
  if (Array.isArray(assignment?.warnings)) return assignment.warnings.length;
  if (Array.isArray(assignment?.warning_snapshot)) return assignment.warning_snapshot.length;
  return Number(assignment?.warning_count || 0);
}

function shiftWarningCount(shift, assignments) {
  const assignmentWarnings = assignments.reduce((sum, item) => sum + assignmentWarningCount(item), 0);
  const compositionWarnings = Array.isArray(shift?.service_context_snapshot?.composition_warnings)
    ? shift.service_context_snapshot.composition_warnings.length
    : 0;
  return assignmentWarnings + compositionWarnings;
}

function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

const STANDARD_CONTRACT_TASK_TYPE_KEYS = new Set([
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
  "concierge",
]);
const CONTRACT_TASK_TYPE_ALIASES = {
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
  concierge: "concierge",
};
const CUSTOM_CONTRACT_TASK_TYPE_KEY = /^other:[a-z0-9][a-z0-9._:-]{0,159}$/;

function canonicalContractTaskTypeKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (CUSTOM_CONTRACT_TASK_TYPE_KEY.test(raw)) return raw;
  const token = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const canonical = CONTRACT_TASK_TYPE_ALIASES[token] || token;
  return STANDARD_CONTRACT_TASK_TYPE_KEYS.has(canonical) ? canonical : null;
}

function recordContractTaskTypeKeys(record) {
  const values = [
    record?.task_type_key,
    record?.task_type,
    ...(Array.isArray(record?.required_task_types) ? record.required_task_types : []),
    record?.service_context_snapshot?.task_type_key,
    record?.service_context_snapshot?.task_type,
    ...(Array.isArray(record?.service_context_snapshot?.required_task_types)
      ? record.service_context_snapshot.required_task_types
      : []),
    ...(Array.isArray(record?.service_context_snapshot?.segment_contexts)
      ? record.service_context_snapshot.segment_contexts.flatMap(item => [
          item?.task_type_key,
          item?.task_type,
          ...(Array.isArray(item?.required_task_types) ? item.required_task_types : []),
        ])
      : []),
  ].filter(present);
  const mapped = values.map(canonicalContractTaskTypeKey);
  const canonical = [...new Set(mapped.filter(Boolean))];
  const hasSpecificCustomKey = canonical.some(value => value.startsWith("other:"));
  const hasInvalidValue = mapped.some((value, index) => (
    !value
    && !(hasSpecificCustomKey && String(values[index]).trim().toLowerCase() === "other")
  ));
  return values.length > 0 && !hasInvalidValue && canonical.length === 1 ? canonical : [];
}

function inclusivePlanningDates(startValue, endValue = startValue) {
  const start = String(startValue || "").slice(0, 10);
  const end = String(endValue || start).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return [];
  const dates = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const boundary = new Date(`${end}T00:00:00.000Z`);
  while (cursor <= boundary && dates.length < 32) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return cursor <= boundary ? [] : dates;
}

function positiveEvidenceVersion(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0;
}

function commercialSnapshotMatchesRecord(record, snapshot) {
  const taskTypeKeys = recordContractTaskTypeKeys(record);
  const objectId = record?.object_id;
  const recordStart = record?.service_date || record?.start_date;
  const recordEnd = record?.end_date || recordStart;
  const snapshotStart = snapshot?.service_date;
  const snapshotEnd = snapshot?.end_date || snapshotStart;
  const intervalContainsRecord = present(recordStart)
    && present(recordEnd)
    && present(snapshotStart)
    && present(snapshotEnd)
    && String(snapshotStart) <= String(recordStart)
    && String(recordEnd) <= String(snapshotEnd);
  const intervalMatches = present(record?.service_date)
    ? intervalContainsRecord
      && String(snapshotStart) === String(recordStart)
      && String(snapshotEnd) === String(recordEnd)
    : intervalContainsRecord;
  return taskTypeKeys.length === 1
    && sameRoutingValue(taskTypeKeys[0], snapshot?.task_type_key)
    && sameRoutingValue(objectId, snapshot?.object_id)
    && intervalMatches;
}

function routingWarnings(record) {
  return [
    ...(Array.isArray(record?.warning_snapshot) ? record.warning_snapshot : []),
    ...(Array.isArray(record?.warnings) ? record.warnings : []),
    ...(Array.isArray(record?.routing_warnings) ? record.routing_warnings : []),
    ...(Array.isArray(record?.commercial_routing_warnings) ? record.commercial_routing_warnings : []),
    ...(Array.isArray(record?.blocking_reasons) ? record.blocking_reasons : []),
    ...(Array.isArray(record?.manual_review_reasons) ? record.manual_review_reasons : []),
  ];
}

const SERIOUS_ROUTING_SIGNAL = /(ambig|conflict|blocked|mismatch|multiple|duplicate|manual[_ -]?review|not[_ -]?final|stale|tegenstrijd|niet eenduidig|geen eenduidige)/i;
const MISSING_ROUTING_SIGNAL = /((^|[_ -])(missing|not[_ -]?found|unresolved)($|[_ -]))|\bkoppelen\b/i;
const CUSTOMER_ROUTING_SIGNAL = /(customer[_ -]?contract|klantcontract|commercial|commercieel|selling[_ -]?company|factur|billing|tariff|tarief)/i;
const EMPLOYMENT_ROUTING_SIGNAL = /(personnel[_ -]?contract|arbeidscontract|employment|employing[_ -]?company|werkgever|payroll|loon|contract[_ -]?cao|cao[_ -]?routing|(^|[_ -])contract[_ -]?(missing|ambiguous|not[_ -]?final))/i;

function routingSignalRecords(record, kind) {
  const snapshots = (kind === "customer"
    ? [
        record?.commercial_routing_snapshot,
        record?.customer_contract_routing_snapshot,
        record?.routing_snapshot,
      ]
    : [
        record?.contract_routing_snapshot,
        record?.employment_routing_snapshot,
        record?.routing_snapshot,
      ]).filter(Boolean);
  const nestedDecisions = snapshots.flatMap(snapshot => (
    Array.isArray(snapshot?.decisions)
      ? snapshot.decisions.flatMap(item => [item, item?.decision]).filter(Boolean)
      : []
  ));
  return { snapshots, records: [record, ...snapshots, ...nestedDecisions] };
}

function routingStatusSignals(record, kind) {
  if (!record) return false;
  const { snapshots, records } = routingSignalRecords(record, kind);
  return [
    record.routing_status,
    record.decision_status,
    ...(kind === "customer" ? [
      record.customer_contract_routing_status,
      record.commercial_routing_status,
    ] : [
      record.contract_routing_status,
      record.employment_routing_status,
      record.planning_context_status,
      record.cao_runtime_status,
    ]),
    ...snapshots.concat(records.slice(1 + snapshots.length)).flatMap(item => [
      item?.status,
      item?.decision_status,
      item?.routing_status,
      ...(kind === "customer" ? [
        item?.customer_contract_routing_status,
        item?.commercial_routing_status,
      ] : [
        item?.contract_routing_status,
        item?.employment_routing_status,
        item?.planning_context_status,
        item?.cao_runtime_status,
      ]),
    ]),
  ].filter(present);
}

function explicitRoutingIndicatorState(record, kind) {
  if (!record) return null;
  const { records } = routingSignalRecords(record, kind);
  const statuses = records.flatMap(item => kind === "customer"
    ? [item?.customer_contract_routing_status, item?.commercial_routing_status]
    : [item?.employment_routing_status, item?.contract_routing_status]
  ).filter(present);
  if (statuses.some(status => SERIOUS_ROUTING_SIGNAL.test(String(status)))) return "attention";
  if (statuses.some(status => MISSING_ROUTING_SIGNAL.test(String(status)))) return "missing";
  return null;
}

function routingWarningSignals(record, kind) {
  if (!record) return [];
  const { records } = routingSignalRecords(record, kind);
  const relevantSignal = kind === "customer" ? CUSTOMER_ROUTING_SIGNAL : EMPLOYMENT_ROUTING_SIGNAL;
  return records.flatMap(routingWarnings).map(item => {
    const code = typeof item === "string" ? item : item?.code;
    const title = typeof item === "string" ? "" : item?.title;
    const detail = typeof item === "string" ? "" : item?.detail;
    const message = typeof item === "string" ? item : item?.message;
    return {
      item,
      signal: `${code || ""} ${title || ""} ${detail || ""} ${message || ""}`,
    };
  }).filter(({ signal }) => relevantSignal.test(signal));
}

function routingHasSeriousSignal(record, kind) {
  const statuses = routingStatusSignals(record, kind);
  if (!statuses) return false;
  if (statuses.some(status => SERIOUS_ROUTING_SIGNAL.test(String(status)))) return true;

  return routingWarningSignals(record, kind).some(({ item, signal }) => {
    if (SERIOUS_ROUTING_SIGNAL.test(signal)) return true;
    if (MISSING_ROUTING_SIGNAL.test(signal)) return false;
    return String(item?.severity || "").toLowerCase() === "critical";
  });
}

function routingHasMissingSignal(record, kind) {
  const statuses = routingStatusSignals(record, kind);
  if (!statuses) return false;
  if (statuses.some(status => MISSING_ROUTING_SIGNAL.test(String(status)))) return true;
  return routingWarningSignals(record, kind).some(({ signal }) => (
    MISSING_ROUTING_SIGNAL.test(signal) && !SERIOUS_ROUTING_SIGNAL.test(signal)
  ));
}

function customerContractLineId(record) {
  return record?.customer_contract_line_id
    || record?.commercial_routing_snapshot?.customer_contract_line_id
    || record?.commercial_routing_snapshot?.contract_line_id
    || record?.routing_snapshot?.customer_contract_line_id
    || record?.service_context_snapshot?.customer_contract_line_id
    || null;
}

function customerContractId(record) {
  return record?.customer_contract_id
    || record?.commercial_routing_snapshot?.customer_contract_id
    || record?.commercial_routing_snapshot?.contract_id
    || record?.routing_snapshot?.customer_contract_id
    || record?.routing_snapshot?.contract_id
    || record?.service_context_snapshot?.customer_contract_id
    || null;
}

function customerSellingCompanyId(record) {
  return record?.selling_company_id
    || record?.commercial_routing_snapshot?.selling_company_id
    || record?.commercial_routing_snapshot?.company_id
    || record?.routing_snapshot?.selling_company_id
    || record?.service_context_snapshot?.selling_company_id
    || null;
}

function customerCommercialRouteComplete(record) {
  return present(customerContractId(record))
    && present(customerContractLineId(record))
    && present(customerSellingCompanyId(record));
}

function sameRoutingValue(left, right) {
  return present(left) && present(right) && String(left) === String(right);
}

function customerCommercialEvidenceState(record) {
  if (!record) return null;
  const status = String(record.commercial_routing_status || "").trim();
  const snapshot = record.commercial_routing_snapshot;
  const snapshotStatus = String(snapshot?.status || "").trim();
  const claimsEvidence = ["resolved", "not_applicable"].includes(status)
    || ["resolved", "not_applicable"].includes(snapshotStatus);
  if (!claimsEvidence) return null;

  if (status === "resolved") {
    const valid = Number(snapshot?.schema_version) === 1
      && snapshotStatus === "resolved"
      && Number(snapshot?.candidate_count) === 1
      && positiveEvidenceVersion(snapshot?.customer_contract_version)
      && positiveEvidenceVersion(snapshot?.customer_contract_line_version)
      && commercialSnapshotMatchesRecord(record, snapshot)
      && customerCommercialRouteComplete(record)
      && sameRoutingValue(record.customer_id, snapshot?.customer_id)
      && sameRoutingValue(record.selling_company_id, snapshot?.selling_company_id)
      && sameRoutingValue(record.customer_contract_id, snapshot?.customer_contract_id)
      && sameRoutingValue(record.customer_contract_line_id, snapshot?.customer_contract_line_id);
    return valid ? "resolved" : "invalid";
  }

  const segmentContexts = Array.isArray(record?.service_context_snapshot?.segment_contexts)
    ? record.service_context_snapshot.segment_contexts
    : [];
  const hasCustomerOrCommercialIdentity = customerIdentityPresent(record) || [
    record.selling_company_id,
    record.customer_contract_id,
    record.customer_contract_line_id,
    snapshot?.customer_id,
    snapshot?.customer_name,
    snapshot?.selling_company_id,
    snapshot?.customer_contract_id,
    snapshot?.customer_contract_line_id,
    record?.service_context_snapshot?.selling_company_id,
    record?.service_context_snapshot?.customer_contract_id,
    record?.service_context_snapshot?.customer_contract_line_id,
    ...segmentContexts.flatMap(segment => [
      segment?.selling_company_id,
      segment?.customer_contract_id,
      segment?.customer_contract_line_id,
    ]),
  ].some(present);
  const valid = status === "not_applicable"
    && Number(snapshot?.schema_version) === 1
    && snapshotStatus === "not_applicable"
    && snapshot?.reason === "explicit_internal_non_billable"
    && snapshot?.customer_billable === false
    && Number(snapshot?.candidate_count) === 0
    && Array.isArray(snapshot?.evidence_shift_ids)
    && snapshot.evidence_shift_ids.some(present)
    && Array.isArray(snapshot?.evidence_segment_ids)
    && snapshot.evidence_segment_ids.some(present)
    && commercialSnapshotMatchesRecord(record, snapshot)
    && (!present(record?.id) || !present(record?.task_occurrence_id)
      || snapshot.evidence_segment_ids.map(String).includes(String(record.id)))
    && (!present(record?.shift_id)
      || snapshot.evidence_shift_ids.map(String).includes(String(record.shift_id)))
    && !hasCustomerOrCommercialIdentity;
  return valid ? "not_applicable" : "invalid";
}

function customerTaskRecord(record) {
  return Boolean(
    record?.task_occurrence_id
    || record?.object_task_definition_id
    || record?.source_type === "task"
    || record?.source_type === "route"
    || record?.task_id,
  );
}

function customerIdentityPresent(record) {
  return present(record?.customer_id)
    || (Array.isArray(record?.customer_ids) && record.customer_ids.some(present))
    || present(record?.customer_name)
    || present(record?.customer_name_snapshot)
    || present(record?.service_context_snapshot?.customer_id)
    || (Array.isArray(record?.service_context_snapshot?.customer_ids)
      && record.service_context_snapshot.customer_ids.some(present))
    || present(record?.service_context_snapshot?.customer_name)
    || (Array.isArray(record?.service_context_snapshot?.segment_contexts)
      && record.service_context_snapshot.segment_contexts.some(segment => (
        present(segment?.customer_id)
        || (Array.isArray(segment?.customer_ids) && segment.customer_ids.some(present))
        || present(segment?.customer_name)
        || present(segment?.customer_name_snapshot)
      )));
}

function customerCommercialContextPresent(record) {
  return customerIdentityPresent(record)
    || customerCommercialRouteComplete(record)
    || present(record?.selling_company_id)
    || present(record?.customer_contract_id)
    || present(record?.customer_contract_line_id)
    || present(record?.commercial_routing_status)
    || Boolean(record?.commercial_routing_snapshot);
}

export function customerTaskContractIndicatorState({
  occurrence = null,
  shift = null,
  segments = [],
  hasOpenDemand = false,
} = {}) {
  const taskSegments = segments.filter(item => item?.status !== "removed" && customerTaskRecord(item));
  const records = [occurrence, shift, ...taskSegments].filter(Boolean);
  const explicitState = records.map(record => explicitRoutingIndicatorState(record, "customer"));
  if (explicitState.includes("attention")) return "attention";
  if (explicitState.includes("missing")) return "missing";
  if (records.some(record => routingHasSeriousSignal(record, "customer"))) return "attention";
  if (records.some(record => routingHasMissingSignal(record, "customer"))) return "missing";

  const proofRecords = occurrence ? [occurrence, ...taskSegments] : taskSegments;
  const evidenceStates = proofRecords.map(customerCommercialEvidenceState);
  if (evidenceStates.includes("invalid")) return "attention";
  if (
    evidenceStates.length > 0
    && evidenceStates.every(state => state === "resolved" || state === "not_applicable")
  ) return "resolved";

  if (records.some(customerCommercialRouteComplete)) return "attention";
  const hasPartialCommercialIdentity = records.some(record => (
    present(record?.selling_company_id)
    || present(record?.customer_contract_id)
    || present(record?.customer_contract_line_id)
  ));
  if (hasPartialCommercialIdentity) return "missing";
  // An uncovered part still needs an occurrence-level commercial route: a
  // contract line on an already planned segment cannot prove the open part.
  if (hasOpenDemand) return "missing";
  if (records.some(customerCommercialContextPresent)) return "missing";
  // Zonder expliciet not_applicable-bewijs is een ogenschijnlijk interne taak
  // nog niet betrouwbaar van corrupte of onvolledige klantcontext te onderscheiden.
  return "attention";
}

function employmentEvidenceContext({ shift = null, segments = [], serviceDate = null } = {}) {
  const activeSegments = segments.filter(item => item?.status !== "removed");
  const taskTypeKeys = [...new Set([
    ...recordContractTaskTypeKeys(shift),
    ...activeSegments.flatMap(recordContractTaskTypeKeys),
  ])];
  const objectIds = [...new Set([
    shift?.object_id,
    ...(Array.isArray(shift?.object_ids) ? shift.object_ids : []),
    ...activeSegments.map(item => item?.object_id),
  ].filter(present).map(String))];
  const startDate = shift?.service_date || serviceDate;
  const endDate = shift?.end_date || startDate;
  return {
    task_type_keys: taskTypeKeys,
    object_ids: objectIds,
    covered_service_dates: inclusivePlanningDates(startDate, endDate),
  };
}

function decisionTaskTypeKeys(decision) {
  const values = decision?.service_context_readiness?.required_task_type_keys;
  if (!Array.isArray(values) || values.length === 0) return [];
  const canonical = values.map(canonicalContractTaskTypeKey);
  return canonical.every(Boolean) ? [...new Set(canonical)] : [];
}

function sameStringSet(left, right) {
  const leftValues = [...new Set(left.map(String))].sort();
  const rightValues = [...new Set(right.map(String))].sort();
  return leftValues.length === rightValues.length
    && leftValues.every((value, index) => value === rightValues[index]);
}

export function employmentContractIndicatorState(assignment, context = {}) {
  if (!assignment) return "resolved";
  const explicitState = explicitRoutingIndicatorState(assignment, "employment");
  if (explicitState) return explicitState;
  if (routingHasSeriousSignal(assignment, "employment")) return "attention";
  if (routingHasMissingSignal(assignment, "employment")) return "missing";
  const routeIds = [
    assignment.personnel_contract_id,
    assignment.employing_company_id,
    assignment.payroll_cao_key,
  ];
  const snapshot = assignment.contract_routing_snapshot;
  const decisionEntries = Array.isArray(snapshot?.decisions)
    ? snapshot.decisions.map(item => ({ service_date: item?.service_date, decision: item?.decision })).filter(item => item.decision)
    : snapshot
      ? [{ service_date: snapshot.service_date, decision: snapshot }]
      : [];
  const evidenceContext = employmentEvidenceContext(context);
  const expectedDates = evidenceContext.covered_service_dates;
  const evaluatedDates = decisionEntries.map(item => String(item.service_date || item.decision?.service_date || "")).filter(Boolean);
  const contextComplete = evidenceContext.task_type_keys.length > 0
    && expectedDates.length > 0
    && evidenceContext.object_ids.length === 1
    && sameStringSet(expectedDates, evaluatedDates);
  const resolvedEvidence = assignment.employment_routing_status === "resolved"
    && routeIds.every(present)
    && contextComplete
    && decisionEntries.length > 0
    && decisionEntries.every(({ decision }) => (
      decision?.employment_routing_status === "resolved"
      && decision?.contract_selection_policy === "personnel_interval_task_scope_unique"
      && decision?.contract_resolution_status === "resolved"
      && decision?.decision_inputs?.contract_resolution_validated === true
      && decision?.service_context_readiness?.has_canonical_task_context === true
      && sameStringSet(decisionTaskTypeKeys(decision), evidenceContext.task_type_keys)
      && sameRoutingValue(decision?.object_id, evidenceContext.object_ids[0])
      && sameRoutingValue(
        assignment.personnel_contract_id,
        decision?.contract_id || decision?.selected_contract?.id,
      )
      && sameRoutingValue(
        assignment.employing_company_id,
        decision?.employing_company_id || decision?.selected_contract?.company_id,
      )
      && sameRoutingValue(
        assignment.payroll_cao_key,
        decision?.payroll_cao_key || decision?.selected_contract?.cao_key,
      )
    ));
  if (resolvedEvidence) return "resolved";
  return routeIds.some(present) || assignment.employment_routing_status === "resolved"
    ? "attention"
    : "missing";
}

function ContractRoutingIndicator({ kind, state, className }) {
  if (state === "resolved") return null;
  const needsAttention = state === "attention";
  const customer = kind === "customer";
  const label = needsAttention
    ? customer ? "Klantcontract controleren" : "Arbeidscontract controleren"
    : customer ? "Klantcontract koppelen" : "Arbeidscontract koppelen";
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-[8px] font-semibold leading-tight shadow-sm",
        needsAttention
          ? "border-rose-300/70 bg-rose-100/95 text-rose-900 dark:border-rose-500/40 dark:bg-rose-400/15 dark:text-rose-100"
          : "border-amber-300/70 bg-amber-100/95 text-amber-900 dark:border-amber-500/40 dark:bg-amber-400/15 dark:text-amber-100",
        className,
      )}
      data-contract-routing-indicator={kind}
      data-routing-state={state}
      title={needsAttention
        ? `${label}: de geladen planning bevat een ambigue of tegenstrijdige routering.`
        : `${label}. Dit ontbrekende gegeven blokkeert de conceptplanning niet.`}
    >
      <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function timeValue(value) {
  const [hours = 0, minutes = 0] = String(value || "00:00").split(":").map(Number);
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
}

function sortByStart(items, getStart = item => item.start_time) {
  return [...items].sort((left, right) => (
    timeValue(getStart(left)) - timeValue(getStart(right))
    || String(left.name || left.task_name_snapshot || "").localeCompare(
      String(right.name || right.task_name_snapshot || ""),
      "nl",
    )
  ));
}

function appendToMap(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function isPlanningResourcePending(pendingResourceKeys, fallback, ...keys) {
  if (fallback) return true;
  if (!(pendingResourceKeys instanceof Set)) return Boolean(fallback);
  return keys.filter(Boolean).some(key => pendingResourceKeys.has(String(key)));
}

function clockLabel(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function intervalDaySlices(record) {
  const interval = getShiftInterval(record);
  if (!interval.valid) return [];
  let dayStart = parseDateKey(toDateKey(interval.start));
  dayStart.setHours(0, 0, 0, 0);
  const slices = [];

  for (let index = 0; index < 370 && dayStart < interval.end; index += 1) {
    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);
    const sliceStart = new Date(Math.max(interval.start.getTime(), dayStart.getTime()));
    const sliceEnd = new Date(Math.min(interval.end.getTime(), nextDay.getTime()));
    if (sliceEnd > sliceStart) {
      slices.push({
        date: toDateKey(dayStart),
        startTime: clockLabel(sliceStart),
        endTime: sliceEnd.getTime() === nextDay.getTime() ? "24:00" : clockLabel(sliceEnd),
        continuesBefore: interval.start < dayStart,
        continuesAfter: interval.end > nextDay,
      });
    }
    dayStart = nextDay;
  }
  return slices;
}

function mapAssignmentsToSlots(assignments, requiredCount) {
  const bySlot = new Map();
  const legacy = [];
  assignments.forEach(assignment => {
    const rawSlot = assignment.slot_index;
    const hasExplicitSlot = rawSlot !== null && rawSlot !== undefined && rawSlot !== "";
    const slotIndex = hasExplicitSlot ? Number(rawSlot) : null;
    if (Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < requiredCount) {
      if (!bySlot.has(slotIndex)) bySlot.set(slotIndex, assignment);
      return;
    }
    if (!hasExplicitSlot) legacy.push(assignment);
  });
  let legacyIndex = 0;
  for (let slotIndex = 0; slotIndex < requiredCount && legacyIndex < legacy.length; slotIndex += 1) {
    if (bySlot.has(slotIndex)) continue;
    bySlot.set(slotIndex, legacy[legacyIndex]);
    legacyIndex += 1;
  }
  return bySlot;
}

function OpenTaskIntervalCard({
  occurrence,
  planningState,
  projection,
  gap,
  onSelectOccurrence,
  onCreateOpenTaskSlice,
  onPasteService,
  serviceClipboard,
  onCopyTask,
  onEditTask,
  onDeleteTask,
  mutationPending,
  actionPending = mutationPending,
  deletePending = mutationPending,
  embeddedInLane = false,
  style,
  editable = false,
}) {
  const dropServiceDate = projection?.date || occurrence.service_date;
  const proposedEnd = gap.startMinute + Math.min(
    MAX_AUTOMATIC_TASK_SERVICE_MINUTES,
    gap.allocatableMinutes,
  );
  const proposedEndTime = timelineMinutesToClock(proposedEnd);
  const droppableId = `occurrence-gap:${encodeURIComponent(String(occurrence.id))}:${dropServiceDate}:${String(gap.startMinute).padStart(4, "0")}:${String(proposedEnd).padStart(4, "0")}`;
  const clipboardStartMinute = clockToTimelineMinutes(serviceClipboard?.startTime);
  const clipboardEndMinute = clockToTimelineMinutes(serviceClipboard?.endTime);
  const canPaste = Boolean(
    serviceClipboard
    && clipboardStartMinute >= gap.startMinute
    && clipboardEndMinute <= gap.endMinute
    && clipboardEndMinute > clipboardStartMinute,
  );
  const customerContractState = customerTaskContractIndicatorState({
    occurrence,
    hasOpenDemand: true,
  });

  const renderCard = ({ provided = null, isDraggingOver = false } = {}) => (
    <PlanningClipboardContextMenu
      mode="paste"
      available={editable}
      detail={`${occurrence.task_name_snapshot || "Taak"} · ${gap.startTime}–${gap.endTime}`}
      items={[
        { label: "Dienst hier plakken", disabled: actionPending || !canPaste, onSelect: () => onPasteService?.({ occurrence, serviceDate: dropServiceDate, startTime: serviceClipboard.startTime, endTime: serviceClipboard.endTime, personnelId: serviceClipboard.personnelId }), Icon: ClipboardPaste },
        { label: "Taak bewerken", disabled: actionPending, onSelect: () => onEditTask?.(occurrence), Icon: Pencil },
        { label: "Taak kopiëren", disabled: actionPending, onSelect: () => onCopyTask?.(occurrence), Icon: Copy },
        { label: "Taak verwijderen", disabled: deletePending, onSelect: () => onDeleteTask?.(occurrence), Icon: Trash2, destructive: true },
      ]}
    >
    <article
      ref={provided?.innerRef}
      {...(provided?.droppableProps || {})}
      data-droppable-id={editable ? droppableId : undefined}
      data-task-occurrence-id={occurrence.id}
      data-open-task-interval={`${gap.startTime}-${gap.endTime}`}
      data-planning-item-kind="open-task"
      data-planning-start-minute={gap.startMinute}
      data-planning-width="full"
      data-start-minute={gap.startMinute}
      aria-busy={actionPending ? "true" : "false"}
      style={style}
      className={cn(
        "group/open-task w-full rounded-lg border border-rose-300/20 border-l-2 border-l-rose-500 bg-[radial-gradient(circle_at_18%_90%,rgba(244,63,94,0.08),transparent_46%),linear-gradient(145deg,rgba(255,255,255,0.24)_0%,rgba(255,241,242,0.14)_58%,rgba(254,205,211,0.07)_100%)] px-2.5 py-2 text-left shadow-none backdrop-blur-xl backdrop-saturate-150 transition-[top,height,padding,border-color,background-color] duration-300 ease-out motion-reduce:transition-none hover:border-rose-400/35 dark:border-rose-700/20 dark:bg-[radial-gradient(circle_at_18%_90%,rgba(244,63,94,0.08),transparent_46%),linear-gradient(145deg,rgba(30,15,23,0.24)_0%,rgba(76,5,25,0.14)_58%,rgba(136,19,55,0.08)_100%)]",
        embeddedInLane && "absolute z-20 flex min-h-0 items-center overflow-hidden rounded-none border-0 border-l-[3px] border-l-rose-500 bg-[radial-gradient(circle_at_18%_90%,rgba(244,63,94,0.09),transparent_48%),linear-gradient(145deg,rgba(255,255,255,0.16),rgba(255,228,230,0.08))] px-2 py-1.5 shadow-none backdrop-blur-xl dark:bg-[radial-gradient(circle_at_18%_90%,rgba(244,63,94,0.09),transparent_48%),linear-gradient(145deg,rgba(76,5,25,0.15),rgba(30,15,23,0.09))]",
        editable && !embeddedInLane && "border-dashed",
        isDraggingOver && "border-primary border-l-primary bg-primary/[0.12] ring-2 ring-inset ring-primary/25",
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <button
          type="button"
          disabled={!editable || actionPending}
          className={cn("min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", embeddedInLane && "flex h-full items-center cursor-pointer")}
          onClick={() => { if (editable) onSelectOccurrence?.(occurrence); }}
        >
          <span className="flex min-w-0 items-start justify-between gap-2">
            <span className="min-w-0">
              <span className={cn(
                "block text-[11px] font-medium leading-tight text-foreground",
                !embeddedInLane && "break-words",
                embeddedInLane && "text-rose-700 dark:text-rose-300",
              )}>
                {embeddedInLane ? "Open taak" : occurrence.task_name_snapshot || "Open taak"}
              </span>
              {!embeddedInLane && (
                <ContractRoutingIndicator
                  kind="customer"
                  state={customerContractState}
                  className="mt-1"
                />
              )}
              <span className={cn("mt-1 flex items-center gap-1 text-[10px] font-semibold tabular-nums text-muted-foreground", embeddedInLane && "sr-only")}>
                <Clock3 className="h-3 w-3 shrink-0" />
                {gap.startTime}–{gap.endTime}
                {projection?.continuesBefore ? " · vervolg" : projection?.continuesAfter ? " · loopt door" : ""}
              </span>
            </span>
            {!embeddedInLane && (
              <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-semibold text-rose-700 dark:bg-rose-950/45 dark:text-rose-300">
                Open
              </span>
            )}
          </span>

        </button>
        {editable && (
          <button
            type="button"
            disabled={actionPending}
            onClick={() => onCreateOpenTaskSlice?.({
              occurrence,
              serviceDate: dropServiceDate,
              startTime: gap.startTime,
              endTime: proposedEndTime,
            })}
            className="compact-hide inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground shadow-sm hover:border-primary/35 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Open dienst maken ${gap.startTime}–${proposedEndTime}`}
            title={`Open dienst maken ${gap.startTime}–${proposedEndTime}`}
          >
            <Scissors className="h-3 w-3" />
          </button>
        )}
      </div>
      {!embeddedInLane && (
        <p className="compact-hide mt-1 text-[9px] font-medium text-muted-foreground">
          {formatMinutesAsHours(gap.allocatableMinutes)} nog niet ingepland
        </p>
      )}
      {editable && isDraggingOver && (
        <p className="compact-hide mt-1.5 flex items-center gap-1 border-t border-primary/15 pt-1.5 text-[9px] font-semibold text-primary">
          <UserRoundPlus className="h-2.5 w-2.5" />
          Loslaten voor dienst {gap.startTime}–{proposedEndTime}
        </p>
      )}
      {provided && <div className="hidden">{provided.placeholder}</div>}
    </article>
    </PlanningClipboardContextMenu>
  );

  if (!editable) return renderCard();

  return (
    <Droppable
      droppableId={droppableId}
      type="PERSONNEL"
      isDropDisabled={mutationPending}
    >
      {(provided, snapshot) => renderCard({ provided, isDraggingOver: snapshot.isDraggingOver })}
    </Droppable>
  );
}

function ShiftSlot({
  shift,
  slotIndex,
  assignment,
  personnelById,
  resourceKey,
  serviceDate,
  onSelect,
  onUnassign,
  disabled = false,
  editable = false,
  compact = false,
  visualVariant = "default",
  segments = [],
}) {
  const droppableId = `slot:${shift.id}:${slotIndex}:${serviceDate}:${encodeURIComponent(resourceKey)}`;
  const identity = assignment ? assignmentIdentity(assignment, personnelById) : null;
  const employmentContractState = employmentContractIndicatorState(assignment, { shift, segments, serviceDate });
  const renderSlot = ({ provided = null, isDraggingOver = false } = {}) => (
    <div
      ref={provided?.innerRef}
      {...(provided?.droppableProps || {})}
      data-droppable-id={editable ? droppableId : undefined}
      className={cn(
        "flex items-center",
        compact ? "min-h-8 gap-1.5 py-1" : "min-h-11 gap-2 py-1.5",
        visualVariant === "midnight" && "min-h-0 flex-1 py-0",
        visualVariant === "timeline" && "min-h-0 flex-none items-start py-0",
        assignment
          ? "bg-transparent"
          : (visualVariant === "midnight" || visualVariant === "timeline")
            ? "rounded-md border border-dashed border-white/20 bg-white/[0.07] px-2 text-white/70"
            : "rounded-md border border-dashed border-border bg-background/55 px-2 text-muted-foreground",
        isDraggingOver && (visualVariant === "midnight"
          ? "rounded-md border border-white/45 bg-white/15 px-2 text-white ring-2 ring-white/20"
          : "rounded-md border border-primary bg-primary/10 px-2 text-primary ring-2 ring-primary/25"),
      )}
    >
      {assignment ? (
        <div className="min-w-0 flex-1">
          <CompactEmployeeIdentity
            name={identity.name}
            photoUrl={identity.photoUrl}
            employee={identity.personnel}
            disabled={disabled}
            onClick={onSelect}
            warningCount={assignmentWarningCount(assignment)}
            variant={visualVariant}
          />
          <ContractRoutingIndicator
            kind="employment"
            state={employmentContractState}
            className="mt-0.5"
          />
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || !editable}
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-80"
          aria-label={`Open plaats voor ${shift.name || shift.service_name_snapshot || "dienst"} bekijken`}
        >
          <UserRoundPlus className="h-3 w-3 shrink-0" />
          <span className="break-words">{isDraggingOver ? "Loslaten" : "Open plaats"}</span>
        </button>
      )}
      {provided && <div className="hidden">{provided.placeholder}</div>}
    </div>
  );

  if (!editable) return renderSlot();

  return (
    <Droppable droppableId={droppableId} type="PERSONNEL" isDropDisabled={Boolean(assignment) || disabled}>
      {(provided, snapshot) => renderSlot({ provided, isDraggingOver: snapshot.isDraggingOver })}
    </Droppable>
  );
}

const SERVICE_RESIZE_PIXELS_PER_STEP = 2;

function ServiceCardResizeHandle({
  edge,
  startMinute,
  endMinute,
  minMinute,
  maxMinute,
  preview,
  onPreview,
  onCommit,
  onCancel,
  disabled,
  label,
}) {
  const cleanupRef = useRef(null);
  const current = preview || { startMinute, endMinute };
  const value = edge === "start" ? current.startMinute : current.endMinute;
  const propose = pointerMinute => resizeTimelineInterval({
    startMinute: current.startMinute,
    endMinute: current.endMinute,
    edge,
    pointerMinute,
    minMinute,
    maxMinute,
    snapMinutes: 5,
    minimumDurationMinutes: 5,
  });

  useEffect(() => () => cleanupRef.current?.(), []);

  const handlePointerDown = event => {
    if (disabled || (event.button != null && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    cleanupRef.current?.();
    const initialPointerY = Number(event.clientY) || 0;
    const initialBoundaryMinute = value;
    let latest = current;

    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      cleanupRef.current = null;
    };
    const move = pointerEvent => {
      const stepDelta = Math.round(
        ((Number(pointerEvent.clientY) || 0) - initialPointerY) / SERVICE_RESIZE_PIXELS_PER_STEP,
      );
      const proposal = propose(initialBoundaryMinute + stepDelta * 5);
      if (!proposal) return;
      latest = proposal;
      onPreview?.(proposal);
    };
    const finish = () => {
      cleanup();
      if (latest.startMinute !== startMinute || latest.endMinute !== endMinute) onCommit?.(latest);
      else onCancel?.();
    };
    const cancel = () => {
      cleanup();
      onCancel?.();
    };

    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
  };

  const handleKeyDown = event => {
    if (disabled) return;
    if (event.key === "Escape") {
      event.preventDefault();
      cleanupRef.current?.();
      onCancel?.();
      return;
    }
    if (event.key === "Enter" && preview) {
      event.preventDefault();
      onCommit?.(preview);
      return;
    }
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 60 : 5;
    const proposal = propose(value + (event.key === "ArrowUp" ? -step : step));
    if (proposal) onPreview?.(proposal);
  };

  return (
    <button
      type="button"
      role="slider"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={Math.round(minMinute)}
      aria-valuemax={Math.round(maxMinute)}
      aria-valuenow={Math.round(value)}
      aria-valuetext={timelineMinutesToClock(Math.round(value)) || ""}
      data-service-resize-edge={edge}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        if (preview || cleanupRef.current) {
          cleanupRef.current?.();
          onCancel?.();
        }
      }}
      className={cn(
        "absolute left-1/2 z-30 flex h-3 w-20 -translate-x-1/2 touch-none items-center justify-center text-primary/70 transition-colors hover:text-primary focus:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-35",
        edge === "start" ? "top-0 cursor-n-resize" : "bottom-0 cursor-s-resize",
      )}
      title={`${edge === "start" ? "Bovenrand" : "Onderrand"} slepen · pijltjes 5 min · Shift 60 min · Enter opslaan`}
    >
      <span className="flex h-1.5 w-12 items-center justify-center rounded-full border border-primary/25 bg-background/95 shadow-sm">
        <GripHorizontal className="h-2.5 w-2.5" />
      </span>
    </button>
  );
}

function TaskBoundaryHandle({
  boundary,
  demand,
  laneRef,
  previewMinute,
  onPreview,
  onCommit,
  onCancel,
  disabled,
  positionForMinute = null,
  minuteForPosition = null,
}) {
  const cleanupRef = useRef(null);
  const frameRef = useRef(null);
  const value = previewMinute ?? boundary.minute;

  useEffect(() => () => cleanupRef.current?.(), []);

  const handlePointerDown = event => {
    if (disabled || (event.button != null && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    cleanupRef.current?.();
    let latest = value;
    let lastClientY = Number(event.clientY) || 0;
    const initialRect = laneRef.current?.getBoundingClientRect?.();
    const demandDuration = Math.max(1, demand.endMinute - demand.startMinute);
    const boundaryPixelY = initialRect
      ? initialRect.top + (positionForMinute
        ? positionForMinute(value) / 100
        : (value - demand.startMinute) / demandDuration) * initialRect.height
      : lastClientY;
    const grabOffsetY = lastClientY - boundaryPixelY;

    const minuteForPointer = clientY => {
      const rect = laneRef.current?.getBoundingClientRect?.();
      if (!rect) return null;
      if (minuteForPosition) {
        const ratio = (clientY - grabOffsetY - rect.top) / Math.max(1, rect.height);
        const minute = Math.round(minuteForPosition(ratio) / 5) * 5;
        return Math.max(boundary.minMinute, Math.min(boundary.maxMinute, minute));
      }
      return timelineMinuteFromLanePointer({
        clientY: clientY - grabOffsetY,
        laneTop: rect.top,
        laneHeight: rect.height,
        startMinute: demand.startMinute,
        endMinute: demand.endMinute,
        minMinute: boundary.minMinute,
        maxMinute: boundary.maxMinute,
      });
    };
    const flushPreview = () => {
      frameRef.current = null;
      const minute = minuteForPointer(lastClientY);
      if (minute == null || minute === latest) return;
      latest = minute;
      onPreview?.(minute);
    };
    const cleanup = () => {
      if (frameRef.current != null) {
        window.cancelAnimationFrame?.(frameRef.current);
        frameRef.current = null;
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      cleanupRef.current = null;
    };
    const move = pointerEvent => {
      lastClientY = Number(pointerEvent.clientY) || 0;
      if (frameRef.current != null) return;
      if (window.requestAnimationFrame) frameRef.current = window.requestAnimationFrame(flushPreview);
      else flushPreview();
    };
    const finish = pointerEvent => {
      const finalClientY = Number(pointerEvent?.clientY);
      if (Number.isFinite(finalClientY)) lastClientY = finalClientY;
      if (frameRef.current != null) {
        window.cancelAnimationFrame?.(frameRef.current);
        frameRef.current = null;
      }
      flushPreview();
      cleanup();
      if (latest !== boundary.minute) onCommit?.(latest);
      else onCancel?.();
    };
    const cancel = () => {
      cleanup();
      onCancel?.();
    };

    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
  };

  const handleKeyDown = event => {
    if (disabled) return;
    if (event.key === "Escape") {
      event.preventDefault();
      cleanupRef.current?.();
      onCancel?.();
      return;
    }
    if (event.key === "Enter" && previewMinute != null && previewMinute !== boundary.minute) {
      event.preventDefault();
      onCommit?.(previewMinute);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      onPreview?.(event.key === "Home" ? boundary.minMinute : boundary.maxMinute);
      return;
    }
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 60 : 5;
    const next = Math.max(
      boundary.minMinute,
      Math.min(boundary.maxMinute, value + (event.key === "ArrowUp" ? -step : step)),
    );
    if (next !== value) onPreview?.(next);
  };

  const top = positionForMinute
    ? positionForMinute(value)
    : ((value - demand.startMinute) / Math.max(1, demand.endMinute - demand.startMinute)) * 100;
  const leftLabel = boundary.left?.kind === "service"
    ? `${boundary.left.startTime}–${timelineMinutesToClock(value)}`
    : null;
  const rightLabel = boundary.right?.kind === "service"
    ? `${timelineMinutesToClock(value)}–${boundary.right.endTime}`
    : null;
  const description = [leftLabel, rightLabel].filter(Boolean).join("; ");

  return (
    <button
      type="button"
      role="slider"
      aria-orientation="vertical"
      aria-label={boundary.kind === "service-service"
        ? "Grens tussen aansluitende diensten aanpassen"
        : boundary.left?.kind === "service"
          ? `Eindtijd van ${boundary.left.shift.name || boundary.left.shift.service_name_snapshot || "dienst"} aanpassen`
          : `Begintijd van ${boundary.right?.shift.name || boundary.right?.shift.service_name_snapshot || "dienst"} aanpassen`}
      aria-valuemin={Math.round(boundary.minMinute)}
      aria-valuemax={Math.round(boundary.maxMinute)}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${timelineMinutesToClock(Math.round(value))}${description ? `. ${description}` : ""}`}
      aria-controls={boundary.controlledIds.join(" ") || undefined}
      data-task-boundary-kind={boundary.kind}
      data-service-resize-edge={boundary.kind === "service-service" ? "shared" : boundary.left?.kind === "service" ? "end" : "start"}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        if (previewMinute != null || cleanupRef.current) {
          cleanupRef.current?.();
          onCancel?.();
        }
      }}
      className="group/boundary absolute left-11 z-40 flex h-7 w-[calc(100%_-_2.75rem)] -translate-y-1/2 touch-none cursor-row-resize items-center justify-center [@media(pointer:coarse)]:h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-wait disabled:opacity-40"
      style={{ top: `${top}%` }}
      title="Slepen · pijltjes 5 min · Shift 60 min · Enter opslaan"
    >
      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-primary/35 transition-colors group-hover/boundary:bg-primary/70" />
      <span className="pointer-events-none relative flex h-2.5 w-12 items-center justify-center rounded-full border border-primary/35 bg-background/95 text-primary shadow-sm transition-transform group-hover/boundary:scale-110">
        <GripHorizontal className="h-2.5 w-2.5" />
      </span>
    </button>
  );
}

function MatrixShiftBlock({
  shift,
  projections = [],
  assignments,
  segments,
  occurrence,
  allOccurrenceSegments = [],
  resourceKey,
  serviceDate,
  selected,
  onSelect,
  onUnassign,
  onMove,
  onCopy,
  onEditService,
  onEditComposition,
  onCancelComposition,
  onCopyService,
  onDeleteService,
  onResizeTaskSegment,
  mutationPending,
  personnelById,
  editable = false,
  controlledInterval = null,
  embeddedInLane = false,
  suppressDirectResize = false,
  externalResizeSaving = false,
  elementId,
  style,
}) {
  // Queued service mutations are already ordered and rebased by the planning
  // outbox. Only a hard server/recovery fence disables the service controls;
  // `_optimistic_pending` remains a sync indicator, not an interaction lock.
  const controlsPending = mutationPending;
  const requiredCount = Math.max(1, Number(shift.required_count || 1));
  const currentAssignments = activeAssignments(assignments);
  const isOpenService = currentAssignments.length === 0;
  const hasOpenSlots = currentAssignments.length < requiredCount;
  const assignmentsBySlot = mapAssignmentsToSlots(currentAssignments, requiredCount);
  const primaryAssignmentIdentity = assignmentsBySlot.get(0)
    ? assignmentIdentity(assignmentsBySlot.get(0), personnelById)
    : null;
  const activeSegments = segments.filter(item => item.status !== "removed");
  const hasCustomerTask = Boolean(
    occurrence
    || customerTaskRecord(shift)
    || activeSegments.some(customerTaskRecord),
  );
  const customerContractState = hasCustomerTask
    ? customerTaskContractIndicatorState({ occurrence, shift, segments: activeSegments })
    : "resolved";
  const linkedObjectCount = new Set([
    ...(shift.object_ids || []),
    ...activeSegments.map(item => item.object_id),
  ].filter(Boolean).map(String)).size;
  const orderedProjections = [...projections].sort((left, right) => (
    timeValue(left.slice?.startTime || left.segment?.start_time || shift.start_time)
      - timeValue(right.slice?.startTime || right.segment?.start_time || shift.start_time)
  ));
  const firstProjection = orderedProjections[0] || null;
  const lastProjection = orderedProjections.at(-1) || firstProjection;
  const projectionSegment = firstProjection?.segment || null;
  const segmentProjections = orderedProjections.filter(item => item.segment);
  const baseStartTime = firstProjection?.slice?.startTime || projectionSegment?.start_time || shift.start_time || "--:--";
  const baseEndTime = lastProjection?.slice?.endTime || lastProjection?.segment?.end_time || shift.end_time || "--:--";
  const baseStartMinute = clockToTimelineMinutes(baseStartTime);
  const baseEndMinute = clockToTimelineMinutes(baseEndTime);
  const continuesBefore = orderedProjections.some(item => item.slice?.continuesBefore);
  const continuesAfter = orderedProjections.some(item => item.slice?.continuesAfter);
  const crossesDate = projectionSegment?.end_date
    && projectionSegment.end_date !== (projectionSegment.start_date || shift.service_date);
  const resizeEligible = Boolean(
    occurrence
    && shift.source_type === "task"
    && activeSegments.length === 1
    && segmentProjections.length === 1,
  );
  const demand = resizeEligible ? getTaskTimelineDemand(occurrence, serviceDate) : null;
  const canResizeDirectly = Boolean(
    resizeEligible
    && demand
    && baseStartMinute != null
    && baseEndMinute != null
    && baseEndMinute > baseStartMinute,
  );
  const otherProjections = canResizeDirectly
    ? allOccurrenceSegments
      .filter(item => item.status !== "removed" && String(item.id) !== String(projectionSegment.id))
      .map(item => getTaskOccurrenceDayProjection({
        service_date: item.start_date,
        end_date: item.end_date,
        window_start_time: item.start_time,
        window_end_time: item.end_time,
      }, serviceDate))
      .filter(Boolean)
      .map(item => ({
        startMinute: clockToTimelineMinutes(item.startTime),
        endMinute: clockToTimelineMinutes(item.endTime),
      }))
      .filter(item => item.startMinute != null && item.endMinute != null)
    : [];
  const previousEnd = canResizeDirectly
    ? Math.max(demand.startMinute, ...otherProjections
      .filter(item => item.endMinute <= baseStartMinute)
      .map(item => item.endMinute))
    : 0;
  const nextStart = canResizeDirectly
    ? Math.min(demand.endMinute, ...otherProjections
      .filter(item => item.startMinute >= baseEndMinute)
      .map(item => item.startMinute))
    : 24 * 60;
  const [resizePreview, setResizePreview] = useState(null);
  const [committedResizePreview, setCommittedResizePreview] = useState(null);
  const [resizeSaving, setResizeSaving] = useState(false);
  const shownResize = controlledInterval || resizePreview || committedResizePreview;
  const displayedStartTime = shownResize
    ? timelineMinutesToClock(shownResize.startMinute)
    : baseStartTime;
  const displayedEndTime = shownResize
    ? timelineMinutesToClock(shownResize.endMinute)
    : baseEndTime;
  const isPending = shift._optimistic_pending === true;
  const isResizeSaving = resizeSaving || externalResizeSaving;
  const editAssignment = assignmentsBySlot.get(0) || null;
  const copiedAssignment = currentAssignments.length === 1 ? currentAssignments[0] : null;
  const copiedIdentity = copiedAssignment ? assignmentIdentity(copiedAssignment, personnelById) : null;

  useEffect(() => {
    setResizePreview(null);
    setCommittedResizePreview(null);
    setResizeSaving(false);
  }, [projectionSegment?.id, serviceDate]);

  useEffect(() => {
    if (!committedResizePreview) return;
    if (
      committedResizePreview.startMinute === baseStartMinute
      && committedResizePreview.endMinute === baseEndMinute
    ) {
      setCommittedResizePreview(null);
    }
  }, [baseEndMinute, baseStartMinute, committedResizePreview]);

  const commitResize = async proposal => {
    const slice = firstProjection?.slice;
    const startBoundary = slice?.continuesBefore
      ? {
          date: projectionSegment.start_date || projectionSegment.service_date || shift.service_date,
          time: projectionSegment.start_time || shift.start_time,
        }
      : timelineBoundary(serviceDate, proposal.startMinute);
    const endBoundary = slice?.continuesAfter
      ? {
          date: projectionSegment.end_date || projectionSegment.start_date || projectionSegment.service_date || shift.end_date || shift.service_date,
          time: projectionSegment.end_time || shift.end_time,
        }
      : timelineBoundary(serviceDate, proposal.endMinute);
    setResizePreview(null);
    setCommittedResizePreview(proposal);
    setResizeSaving(true);
    try {
      const result = await onResizeTaskSegment?.({
        occurrence,
        serviceDate,
        shift,
        segment: projectionSegment,
        startDate: startBoundary.date,
        endDate: endBoundary.date,
        startTime: startBoundary.time,
        endTime: endBoundary.time,
      });
      if (!result) setCommittedResizePreview(null);
    } catch {
      setCommittedResizePreview(null);
    } finally {
      setResizeSaving(false);
    }
  };

  return (
    <PlanningClipboardContextMenu
      mode="copy"
      available={editable}
      detail={`${shift.name || shift.service_name_snapshot || "Dienst"} · ${displayedStartTime}–${displayedEndTime}`}
      items={[
        { label: "Dienst bewerken", disabled: controlsPending || isResizeSaving, onSelect: () => onEditService?.({ shift, assignment: editAssignment, segments: activeSegments, startTime: displayedStartTime, endTime: displayedEndTime }), Icon: Pencil },
        { label: "Dienst kopiëren", disabled: !copiedAssignment || controlsPending || isResizeSaving, onSelect: () => onCopyService?.({ shift, personnelId: copiedAssignment.personnel_id, personnelName: copiedIdentity.name, startTime: displayedStartTime, endTime: displayedEndTime }), Icon: Copy },
        ...currentAssignments.map(assignment => ({
          label: currentAssignments.length === 1 ? "Medewerker uitplannen" : `${assignmentIdentity(assignment, personnelById).name} uitplannen`,
          disabled: controlsPending,
          onSelect: () => onUnassign?.(assignment),
          Icon: UserMinus,
        })),
        { label: "Dienst verwijderen", disabled: controlsPending || shift.status === "published", onSelect: () => onDeleteService?.(shift), Icon: Trash2, destructive: true },
      ]}
    >
    <article className={cn(
      "group/service relative min-h-[84px] w-full overflow-hidden rounded-[10px] border border-slate-400/25 bg-[radial-gradient(circle_at_18%_90%,rgba(91,141,239,0.58),transparent_42%),linear-gradient(145deg,#0F172A_0%,#11294A_58%,#16335C_100%)] px-3 pb-3 pt-3 text-white shadow-[0_8px_24px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.10)] transition-[top,height,padding,filter,box-shadow,transform] duration-300 ease-out motion-reduce:transition-none hover:-translate-y-px hover:brightness-110 hover:shadow-[0_11px_28px_rgba(15,23,42,0.28),inset_0_1px_0_rgba(255,255,255,0.14)]",
      embeddedInLane && "absolute isolate z-[35] flex min-h-0 flex-col !rounded-none !border-0 !border-l !border-l-primary/35 !bg-[linear-gradient(145deg,hsl(var(--card))_0%,hsl(var(--accent))_100%)] px-3 pb-0 pt-2.5 !shadow-none backdrop-blur-xl hover:translate-y-0 hover:brightness-100",
      shift.status === "draft" && !embeddedInLane && "border-primary/60",
      hasOpenSlots && !isOpenService && !embeddedInLane && "border-amber-300/80",
      isOpenService && "!border-rose-400/55 !bg-[radial-gradient(circle_at_18%_90%,rgba(244,63,94,0.32),transparent_44%),linear-gradient(145deg,#3F111D_0%,#5D1528_58%,#7F1D3A_100%)]",
      embeddedInLane && isOpenService && "!border-l-[3px] !border-l-rose-500 !bg-[linear-gradient(145deg,rgba(255,241,242,0.96)_0%,rgba(255,228,230,0.88)_100%)] dark:!bg-[linear-gradient(145deg,rgba(76,5,25,0.94)_0%,rgba(55,7,28,0.9)_100%)]",
      isPending && "border-primary/70",
      selected && !embeddedInLane && "border-primary ring-2 ring-primary/35 ring-offset-1 ring-offset-background",
    )}
      id={elementId}
      data-shift-id={shift.id}
      data-service-block="true"
      data-planning-item-kind="service"
      data-planning-start-minute={timeValue(displayedStartTime)}
      data-planning-width="full"
      data-segment-id={segmentProjections.length === 1 ? projectionSegment?.id : undefined}
      data-open-service={isOpenService ? "true" : "false"}
      data-resize-saving={isResizeSaving ? "true" : "false"}
      data-editable={editable ? "true" : "false"}
      style={style}
    >
      <PlanningEmployeePortraitOverlay photoUrl={primaryAssignmentIdentity?.photoUrl} embedded={embeddedInLane} />
      {embeddedInLane && !isOpenService && <span className="sr-only">{displayedStartTime}–{displayedEndTime}</span>}
      {editable && !suppressDirectResize && canResizeDirectly && !firstProjection?.slice?.continuesBefore && (
        <ServiceCardResizeHandle
          edge="start"
          startMinute={baseStartMinute}
          endMinute={baseEndMinute}
          minMinute={previousEnd}
          maxMinute={baseEndMinute - 5}
          preview={shownResize}
          onPreview={setResizePreview}
          onCommit={commitResize}
          onCancel={() => setResizePreview(null)}
          disabled={controlsPending || resizeSaving || Boolean(committedResizePreview)}
          label={`Begintijd van ${shift.name || shift.service_name_snapshot || "dienst"} aanpassen`}
        />
      )}
      <div className="relative z-10 flex items-start gap-1">
        <button type="button" disabled={controlsPending} onClick={onSelect} className={cn("min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default", embeddedInLane && "sr-only")}>
          <span className="flex min-w-0 items-center gap-1.5">
            {linkedObjectCount > 1 && <Layers3 className="h-3 w-3 shrink-0 text-primary" aria-label="Samengestelde dienst" />}
            <span className={cn(
              "min-w-0 break-words font-semibold text-white/80",
              embeddedInLane ? "text-[12px] leading-tight text-slate-900 dark:text-white" : "text-[10px]",
            )}>
              {embeddedInLane
                ? isOpenService
                  ? "Open dienst"
                  : occurrence?.task_name_snapshot || shift.name || shift.service_name_snapshot || "Dienst"
                : shift.name || shift.service_name_snapshot || "Dienst"}
            </span>
            {isPending && <Cloud className="h-3 w-3 shrink-0 text-primary" aria-label="Lokaal verwerkt; synchroniseert op de achtergrond" />}
            {isResizeSaving && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" aria-label="Diensttijd wordt opgeslagen" />}
            {shift.status === "published" && <Check className="h-3 w-3 shrink-0 text-emerald-600" aria-label="Gepubliceerd" />}
          </span>
          {!embeddedInLane && (
            <span className="mt-0.5 block text-[10px] font-semibold tabular-nums text-white">
              {displayedStartTime}–{displayedEndTime}
              {continuesBefore ? " · vervolg" : continuesAfter ? " · loopt door" : crossesDate ? " +1" : ""}
              {linkedObjectCount > 1 ? ` · ${linkedObjectCount} objecten` : ""}
            </span>
          )}
          {!embeddedInLane && segmentProjections.length === 1 && (
            <span className="compact-hide mt-0.5 block truncate text-[9px] font-medium text-blue-200">
              {projectionSegment.task_name_snapshot || projectionSegment.object_name_snapshot || "Taaksegment"}
            </span>
          )}
          {!embeddedInLane && segmentProjections.length > 1 && (
            <span className="compact-hide mt-1 block space-y-0.5 border-t border-white/10 pt-1">
              {segmentProjections.map(({ segment, slice }, index) => (
                <span
                  key={`${segment.id || index}:${slice?.date || ""}`}
                  className="flex min-w-0 items-center gap-1 text-[8px] text-white/60"
                  data-segment-id={segment.id || undefined}
                >
                  <span className="shrink-0 tabular-nums">{slice?.startTime || segment.start_time}–{slice?.endTime || segment.end_time}</span>
                  <span className="truncate">{segment.task_name_snapshot || segment.object_name_snapshot || "Taaksegment"}</span>
                </span>
              ))}
            </span>
          )}
          {!embeddedInLane && hasCustomerTask && (
            <ContractRoutingIndicator
              kind="customer"
              state={customerContractState}
              className="mt-1"
            />
          )}
        </button>

      </div>

      {embeddedInLane && isOpenService && (
        <div className="relative z-10 order-1 flex items-center justify-between gap-2 text-rose-700 dark:text-rose-200">
          <span className="text-[11px] font-semibold">Open dienst</span>
          <span className="text-[9px] font-semibold tabular-nums">{displayedStartTime}–{displayedEndTime}</span>
        </div>
      )}

      {(requiredCount > 1 || embeddedInLane) && (
        <p className={cn(
          "compact-hide relative z-10 mt-1.5 text-[9px] font-medium text-white/60",
          embeddedInLane && "order-3 mt-1 text-[9px] text-slate-600 dark:text-white/75",
        )} data-planning-dimensions="time-staffing">
          {isOpenService ? "Nog niet bezet" : `Bezetting ${Math.min(currentAssignments.length, requiredCount)}/${requiredCount}`}
        </p>
      )}
      <div className={cn("relative z-10 mt-1.5 space-y-1", embeddedInLane && "order-2 mt-1 flex min-h-0 flex-1 flex-col justify-start overflow-hidden")}>
        {Array.from({ length: requiredCount }, (_, slotIndex) => (
          <ShiftSlot
            key={slotIndex}
            shift={shift}
            slotIndex={slotIndex}
            assignment={assignmentsBySlot.get(slotIndex) || null}
            personnelById={personnelById}
            resourceKey={resourceKey}
            serviceDate={serviceDate}
            onSelect={onSelect}
            onUnassign={onUnassign}
            disabled={mutationPending}
            editable={editable}
            compact={embeddedInLane}
            visualVariant={embeddedInLane ? "timeline" : "portrait"}
            segments={activeSegments}
          />
        ))}
      </div>
      {embeddedInLane && (
        <div className="relative z-10 order-4 mt-1 flex items-center gap-1 pb-1">
          <span className={cn(
            "rounded px-1.5 py-0.5 text-[8px] font-semibold",
            shift.status === "published"
              ? "bg-blue-100/80 text-blue-700 dark:bg-blue-400/15 dark:text-blue-100"
              : "bg-amber-100/90 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200",
          )}>
            {shift.status === "published" ? "Gepubliceerd" : "Concept"}
          </span>
        </div>
      )}
      {editable && !suppressDirectResize && canResizeDirectly && !firstProjection?.slice?.continuesAfter && (
        <ServiceCardResizeHandle
          edge="end"
          startMinute={baseStartMinute}
          endMinute={baseEndMinute}
          minMinute={baseStartMinute + 5}
          maxMinute={nextStart}
          preview={shownResize}
          onPreview={setResizePreview}
          onCommit={commitResize}
          onCancel={() => setResizePreview(null)}
          disabled={controlsPending || resizeSaving || Boolean(committedResizePreview)}
          label={`Eindtijd van ${shift.name || shift.service_name_snapshot || "dienst"} aanpassen`}
        />
      )}
    </article>
    </PlanningClipboardContextMenu>
  );
}

function taskLaneSegmentInterval(entry) {
  const startTime = entry.projections[0]?.slice?.startTime
    || entry.projections[0]?.segment?.start_time
    || entry.shift.start_time;
  const endTime = entry.projections.at(-1)?.slice?.endTime
    || entry.projections.at(-1)?.segment?.end_time
    || entry.shift.end_time;
  return {
    startMinute: clockToTimelineMinutes(startTime),
    endMinute: clockToTimelineMinutes(endTime),
    startTime,
    endTime,
  };
}

function taskLaneServiceContinuityKey({ shift, segment, startTime, endTime }) {
  return [
    "task-service",
    segment?.task_occurrence_id || shift?.source_id || "unknown",
    segment?.start_date || shift?.service_date || "",
    segment?.end_date || shift?.end_date || segment?.start_date || shift?.service_date || "",
    startTime || segment?.start_time || shift?.start_time || "",
    endTime || segment?.end_time || shift?.end_time || "",
  ].map(value => encodeURIComponent(String(value))).join(":");
}

function TaskCoverageLane({
  occurrence,
  planningState,
  projection,
  serviceDate,
  serviceEntries,
  allOccurrenceSegments,
  coverageShifts,
  assignmentsByShift,
  personnelById,
  resourceKey,
  selectedShiftId,
  onSelectOccurrence,
  onSelectShift,
  onUnassign,
  onMove,
  onCopy,
  onEditService,
  onEditComposition,
  onCancelComposition,
  onCreateOpenTaskSlice,
  onCopyService,
  onPasteService,
  serviceClipboard,
  onCopyTask,
  onEditTask,
  onDeleteTask,
  onDeleteService,
  onResizeTaskSegment,
  onResizeTaskBoundary,
  mutationPending,
  actionPending = mutationPending,
  deletePending = mutationPending,
  compact,
  editable = false,
}) {
  const laneRef = useRef(null);
  const demand = getTaskTimelineDemand(occurrence, serviceDate);
  const baseServices = serviceEntries.map(entry => {
    const segment = entry.projections[0]?.segment;
    const interval = taskLaneSegmentInterval(entry);
    const continuityKey = taskLaneServiceContinuityKey({
      shift: entry.shift,
      segment,
      startTime: interval.startTime,
      endTime: interval.endTime,
    });
    return {
      ...entry,
      ...interval,
      kind: "service",
      segment,
      continuityKey,
      // The backend replaces optimistic ids with authoritative ids on ACK.
      // Time/task identity stays stable, so an in-flight pointer gesture keeps
      // the same DOM node and window listeners throughout that replacement.
      elementId: `planning-service-${continuityKey}`,
    };
  }).filter(item => item.segment?.id && item.startMinute != null && item.endMinute > item.startMinute);
  const boundaries = [];

  baseServices.forEach((service, index) => {
    const previous = baseServices[index - 1] || null;
    const next = baseServices[index + 1] || null;
    const continuesBefore = Boolean(service.projections[0]?.slice?.continuesBefore);
    const continuesAfter = Boolean(service.projections.at(-1)?.slice?.continuesAfter);
    if (!continuesBefore && (!previous || previous.endMinute !== service.startMinute)) {
      boundaries.push({
        id: `${service.continuityKey}:start`,
        kind: "open-service",
        minute: service.startMinute,
        minMinute: previous ? previous.endMinute : demand?.startMinute,
        maxMinute: service.endMinute - 5,
        left: null,
        right: service,
        controlledIds: [service.elementId],
      });
    }
    if (continuesAfter) return;
    if (next?.startMinute === service.endMinute) {
      boundaries.push({
        id: `${service.continuityKey}:end|${next.continuityKey}:start`,
        kind: "service-service",
        minute: service.endMinute,
        minMinute: service.startMinute + 5,
        maxMinute: next.endMinute - 5,
        left: service,
        right: next,
        controlledIds: [service.elementId, next.elementId],
      });
      return;
    }
    boundaries.push({
      id: `${service.continuityKey}:end`,
      kind: "service-open",
      minute: service.endMinute,
      minMinute: service.startMinute + 5,
      maxMinute: next ? next.startMinute : demand?.endMinute,
      left: service,
      right: null,
      controlledIds: [service.elementId],
    });
  });

  const [activePreview, setActivePreview] = useState(null);
  const [committedPreview, setCommittedPreview] = useState(null);
  const [resizeSaving, setResizeSaving] = useState(false);
  const shownPreview = activePreview || committedPreview;
  const previewIntervals = shownPreview?.overrides || null;

  useEffect(() => {
    setActivePreview(null);
    setCommittedPreview(null);
    setResizeSaving(false);
  }, [occurrence.id, serviceDate]);

  useEffect(() => {
    if (!committedPreview) return;
    const reconciled = Object.entries(committedPreview.overrides).every(([segmentId, interval]) => {
      const service = baseServices.find(item => String(item.segment.id) === String(segmentId));
      return service
        && service.startMinute === interval.startMinute
        && service.endMinute === interval.endMinute;
    });
    if (reconciled) setCommittedPreview(null);
  }, [baseServices, committedPreview]);

  if (!demand || baseServices.length === 0) return null;

  const intervalFor = service => previewIntervals?.[String(service.segment.id)] || {
    startMinute: service.startMinute,
    endMinute: service.endMinute,
  };
  const previewForBoundary = (boundary, minute) => {
    const overrides = {};
    if (boundary.left) {
      const interval = intervalFor(boundary.left);
      overrides[String(boundary.left.segment.id)] = { ...interval, endMinute: minute };
    }
    if (boundary.right) {
      const interval = intervalFor(boundary.right);
      overrides[String(boundary.right.segment.id)] = { ...interval, startMinute: minute };
    }
    return { boundaryId: boundary.id, minute, overrides };
  };
  const gaps = getTaskTimelineGaps({
    occurrence,
    serviceDate,
    segments: allOccurrenceSegments,
    shifts: coverageShifts,
    previewIntervalsBySegmentId: previewIntervals,
  });
  const duration = Math.max(1, demand.endMinute - demand.startMinute);
  const pieceStyle = (startMinute, endMinute) => ({
    top: `${((startMinute - demand.startMinute) / duration) * 100}%`,
    left: "44px",
    width: "calc(100% - 44px)",
    height: `${((endMinute - startMinute) / duration) * 100}%`,
  });
  const laneHeight = getTaskTimelineLaneHeight(duration, { compact });
  const isLaneBusy = mutationPending || resizeSaving;
  const isLaneActionPending = actionPending || isLaneBusy;
  const isLaneDeletePending = deletePending || isLaneBusy;
  const openMinutes = gaps.reduce((sum, gap) => sum + Number(gap.durationMinutes || 0), 0);
  const customerContractState = customerTaskContractIndicatorState({
    occurrence,
    segments: baseServices.map(service => service.segment),
    shift: baseServices.length === 1 ? baseServices[0].shift : null,
    hasOpenDemand: openMinutes > 0,
  });

  const segmentPayload = (service, interval) => {
    const slice = service.projections[0]?.slice;
    const startBoundary = slice?.continuesBefore
      ? {
          date: service.segment.start_date || service.segment.service_date || service.shift.service_date,
          time: service.segment.start_time || service.shift.start_time,
        }
      : timelineBoundary(serviceDate, interval.startMinute);
    const endBoundary = slice?.continuesAfter
      ? {
          date: service.segment.end_date || service.segment.start_date || service.shift.end_date || service.shift.service_date,
          time: service.segment.end_time || service.shift.end_time,
        }
      : timelineBoundary(serviceDate, interval.endMinute);
    return {
      shift: service.shift,
      segment: service.segment,
      startDate: startBoundary.date,
      endDate: endBoundary.date,
      startTime: startBoundary.time,
      endTime: endBoundary.time,
    };
  };

  const commitBoundary = async (boundary, minute) => {
    const preview = previewForBoundary(boundary, minute);
    setActivePreview(null);
    setCommittedPreview(preview);
    setResizeSaving(true);
    try {
      let result;
      if (boundary.kind === "service-service") {
        const boundaryValue = timelineBoundary(serviceDate, minute);
        result = await onResizeTaskBoundary?.({
          occurrence,
          serviceDate,
          boundaryDate: boundaryValue.date,
          boundaryTime: boundaryValue.time,
          left: segmentPayload(boundary.left, preview.overrides[String(boundary.left.segment.id)]),
          right: segmentPayload(boundary.right, preview.overrides[String(boundary.right.segment.id)]),
        });
      } else {
        const service = boundary.left || boundary.right;
        result = await onResizeTaskSegment?.({
          occurrence,
          serviceDate,
          ...segmentPayload(service, preview.overrides[String(service.segment.id)]),
        });
      }
      if (!result) setCommittedPreview(null);
    } catch {
      setCommittedPreview(null);
    } finally {
      setResizeSaving(false);
    }
  };

  return (
    <section
      className="w-full overflow-hidden rounded-[10px] border border-primary/20 bg-card shadow-[0_7px_22px_hsl(var(--primary)/0.08)]"
      data-task-coverage-group={occurrence.id}
      aria-busy={isLaneActionPending ? "true" : "false"}
    >
      <PlanningClipboardContextMenu
        mode="copy"
        available={editable}
        detail={`${occurrence.task_name_snapshot || "Taak"} · ${demand.startTime}–${demand.endTime}`}
        items={[
          { label: "Taak bewerken", disabled: isLaneActionPending, onSelect: () => onEditTask?.(occurrence), Icon: Pencil },
          { label: "Taak kopiëren", disabled: isLaneActionPending, onSelect: () => onCopyTask?.(occurrence), Icon: Copy },
          { label: "Taak verwijderen", disabled: isLaneDeletePending, onSelect: () => onDeleteTask?.(occurrence), Icon: Trash2, destructive: true },
        ]}
      >
      <button
        type="button"
        disabled={!editable || isLaneActionPending}
        onClick={() => { if (editable) onSelectOccurrence?.(occurrence); }}
        className="flex w-full items-start justify-between gap-2 border-b border-primary/15 bg-[linear-gradient(145deg,hsl(var(--card))_0%,hsl(var(--accent))_100%)] px-2.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="min-w-0">
          <span className="block break-words text-[11px] font-semibold leading-tight text-foreground">
            {occurrence.task_name_snapshot || "Taak"}
          </span>
          <ContractRoutingIndicator
            kind="customer"
            state={customerContractState}
            className="mt-1"
          />
        </span>
        <span className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold",
          openMinutes > 0
            ? "bg-rose-50 text-rose-700 dark:bg-rose-950/45 dark:text-rose-300"
            : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300",
        )}>
          {openMinutes > 0 ? `${formatMinutesAsHours(openMinutes)} open` : "Ingepland"}
        </span>
      </button>
      </PlanningClipboardContextMenu>
      <div
        ref={laneRef}
        className="relative isolate w-full overflow-hidden bg-primary/[0.025] transition-[height] duration-300 ease-out motion-reduce:transition-none"
        style={{ height: `${laneHeight}px` }}
        data-task-coverage-lane={occurrence.id}
        data-lane-start-minute={demand.startMinute}
        data-lane-end-minute={demand.endMinute}
        aria-label={`${occurrence.task_name_snapshot || "Taak"} ${demand.startTime}–${demand.endTime}`}
        aria-busy={isLaneBusy ? "true" : "false"}
      >
        <TimelineTimeScale
          startMinute={demand.startMinute}
          endMinute={demand.endMinute}
          boundaryMinutes={boundaries.map(boundary => (
            shownPreview?.boundaryId === boundary.id ? shownPreview.minute : boundary.minute
          ))}
          openBoundaryMinutes={gaps.flatMap(gap => [gap.startMinute, gap.endMinute])}
        />
        {baseServices.map(service => {
          const interval = intervalFor(service);
          return (
            <MatrixShiftBlock
              key={service.continuityKey}
              shift={service.shift}
              projections={service.projections}
              assignments={assignmentsByShift.get(String(service.shift.id)) || []}
              personnelById={personnelById}
              segments={[service.segment]}
              occurrence={occurrence}
              allOccurrenceSegments={allOccurrenceSegments}
              resourceKey={`${resourceKey}:shift:${service.shift.id}`}
              serviceDate={serviceDate}
              selected={String(selectedShiftId || "") === String(service.shift.id)}
              onSelect={() => onSelectShift?.(service.shift)}
              onUnassign={assignment => onUnassign?.(service.shift, assignment)}
              onEditService={onEditService}
              onMove={onMove}
              onCopy={onCopy}
              onEditComposition={onEditComposition}
              onCancelComposition={onCancelComposition}
              onCopyService={onCopyService}
              onDeleteService={onDeleteService}
              onResizeTaskSegment={onResizeTaskSegment}
              mutationPending={isLaneBusy}
              editable={editable}
              controlledInterval={interval}
              embeddedInLane
              suppressDirectResize
              externalResizeSaving={resizeSaving && Boolean(previewIntervals?.[String(service.segment.id)])}
              elementId={service.elementId}
              style={pieceStyle(interval.startMinute, interval.endMinute)}
            />
          );
        })}
        {gaps.map(gap => (
          <OpenTaskIntervalCard
            key={`${gap.startMinute}-${gap.endMinute}`}
            occurrence={occurrence}
            planningState={planningState}
            projection={projection}
            gap={gap}
            onSelectOccurrence={onSelectOccurrence}
            onCreateOpenTaskSlice={onCreateOpenTaskSlice}
            onPasteService={onPasteService}
            serviceClipboard={serviceClipboard}
            onCopyTask={onCopyTask}
            onEditTask={onEditTask}
            onDeleteTask={onDeleteTask}
            mutationPending={isLaneBusy}
            actionPending={isLaneActionPending}
            deletePending={isLaneDeletePending}
            editable={editable}
            embeddedInLane
            style={pieceStyle(gap.startMinute, gap.endMinute)}
          />
        ))}
        {editable && boundaries.map(boundary => (
          <TaskBoundaryHandle
            key={boundary.id}
            boundary={boundary}
            demand={demand}
            laneRef={laneRef}
            previewMinute={shownPreview?.boundaryId === boundary.id ? shownPreview.minute : null}
            onPreview={minute => setActivePreview(previewForBoundary(boundary, minute))}
            onCommit={minute => commitBoundary(boundary, minute)}
            onCancel={() => setActivePreview(null)}
            disabled={isLaneBusy || (boundary.kind === "service-service" && !onResizeTaskBoundary)}
          />
        ))}
      </div>
    </section>
  );
}

function EmployeeAssignmentBlock({
  shift,
  assignment,
  personnel,
  segments,
  projectionSlice,
  onSelect,
  onUnassign,
  onEditService,
  onCopyService,
  onDeleteService,
  disabled = false,
  editable = false,
}) {
  const warnings = shiftWarningCount(shift, [assignment]);
  const activeSegments = segments.filter(item => item.status !== "removed");
  const identity = assignmentIdentity(assignment, null, personnel);
  const employmentContractState = employmentContractIndicatorState(assignment, { shift, segments: activeSegments });
  const hasCustomerTask = customerTaskRecord(shift) || activeSegments.some(customerTaskRecord);
  const customerContractState = hasCustomerTask
    ? customerTaskContractIndicatorState({ shift, segments: activeSegments })
    : "resolved";
  const startTime = projectionSlice?.startTime || shift.start_time || "--:--";
  const endTime = projectionSlice?.endTime || shift.end_time || "--:--";
  return (
    <PlanningClipboardContextMenu
      mode="copy"
      available={editable}
      detail={`${identity.name} · ${startTime}–${endTime}`}
      items={[
        { label: "Dienst bewerken", disabled, onSelect: () => onEditService?.({ shift, assignment, segments: activeSegments, startTime: shift.start_time, endTime: shift.end_time }), Icon: Pencil },
        { label: "Dienst kopiëren", disabled, onSelect: () => onCopyService?.({ shift, personnelId: assignment.personnel_id, personnelName: identity.name, startTime, endTime }), Icon: Copy },
        { label: "Medewerker uitplannen", disabled, onSelect: () => onUnassign?.(assignment), Icon: UserMinus },
        { label: "Dienst verwijderen", disabled: disabled || shift.status === "published", onSelect: () => onDeleteService?.(shift), Icon: Trash2, destructive: true },
      ]}
    >
    <article aria-busy={disabled ? "true" : "false"} className="relative overflow-hidden rounded-[10px] border border-slate-400/25 bg-[radial-gradient(circle_at_18%_90%,rgba(91,141,239,0.58),transparent_42%),linear-gradient(145deg,#0F172A_0%,#11294A_58%,#16335C_100%)] p-3 text-white shadow-[0_8px_24px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.10)] transition-[top,height,padding,filter,box-shadow,transform] duration-300 ease-out motion-reduce:transition-none hover:-translate-y-px hover:brightness-110" data-shift-id={shift.id} data-editable={editable ? "true" : "false"}>
      <PlanningEmployeePortraitOverlay photoUrl={identity.photoUrl} />
      <div className="relative z-10 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <CompactEmployeeIdentity
            name={identity.name}
            photoUrl={identity.photoUrl}
            disabled={disabled}
            onClick={onSelect}
            warningCount={warnings}
            variant="portrait"
          />
          <span className="mt-1 flex flex-wrap gap-1">
            <ContractRoutingIndicator kind="employment" state={employmentContractState} />
            {hasCustomerTask && (
              <ContractRoutingIndicator kind="customer" state={customerContractState} />
            )}
          </span>
        </div>
      </div>
      <button type="button" disabled={disabled} onClick={onSelect} className="relative z-10 mt-1 block w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait">
        <span className="block text-[10px] font-semibold tabular-nums text-white">
          {projectionSlice?.startTime || shift.start_time || "--:--"}–{projectionSlice?.endTime || shift.end_time || "--:--"}
          {projectionSlice?.continuesBefore ? " · vervolg" : projectionSlice?.continuesAfter ? " · loopt door" : ""}
        </span>
        <span className="compact-hide mt-0.5 block break-words text-[9px] text-white/60">
          {shift.name || shift.service_name_snapshot || (activeSegments.length > 1 ? `${activeSegments.length} taken` : "")}
        </span>
      </button>
    </article>
    </PlanningClipboardContextMenu>
  );
}

function DayHeader({ day, hasOpenWork = false }) {
  const key = dateKey(day);
  const today = key === dateKey(new Date());
  return (
    <div className={cn("px-3 py-2.5", today && "bg-primary/[0.06]")}>
      <span className="flex items-center justify-between gap-2">
        <span className={cn("text-[14px] font-semibold capitalize", today && "text-primary")}>{dayFormatter.format(day)}</span>
        <span className="flex items-center gap-2">
          {hasOpenWork && (
            <span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_0_3px_hsl(var(--destructive)/0.10)]" title="Open dienst werk" aria-label="Open dienst werk" />
          )}
          <span className="text-[18px] font-bold leading-none text-muted-foreground/30">{getISOWeek(day)}</span>
        </span>
      </span>
      {today && <span className="mt-0.5 block text-[9px] font-medium text-primary">Vandaag</span>}
    </div>
  );
}

function formatObjectPlanningTime(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function ResourceHeader({ resource, perspective, onObjectClick }) {
  const Icon = perspective === "employee" ? UserRound : resource.kind === "route" ? Route : Building2;
  const isObject = resource.kind === "object";
  const showObjectLogo = isObject && resource.logoUrl;
  const summary = resource.planningSummary;
  const hasOpenWork = Boolean(summary?.remainingMinutes > 0 || summary?.hasOpenStaffing);
  return (
    <button
      type="button"
      disabled={!isObject}
      onClick={() => onObjectClick?.(resource)}
      className="flex h-full min-h-14 w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-accent/60 disabled:cursor-default disabled:hover:bg-transparent"
      data-planning-resource-card
      data-resource-kind={resource.kind}
      data-resource-search-text={`${resource.label || ""} ${resource.subtitle || ""}`}
    >
      <span className={cn(
        "mt-0.5 flex shrink-0 items-center justify-center overflow-hidden rounded-md text-primary",
        showObjectLogo
          ? "h-9 w-9 border border-border bg-white"
          : "h-6 w-6 bg-primary/10",
      )}>
        {showObjectLogo
          ? <img src={resource.logoUrl} alt="" className="h-full w-full object-contain p-1" />
          : <Icon className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="block min-w-0 flex-1 truncate text-[11px] font-semibold" title={resource.label}>{resource.label}</span>
          {hasOpenWork && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500 shadow-[0_0_0_3px_hsl(var(--destructive)/0.10)]" title="Open dienst werk" aria-label="Open dienst werk" />}
        </span>
        <span className="mt-0.5 block truncate text-[9px] font-normal text-muted-foreground" title={resource.subtitle}>{resource.subtitle}</span>
        {summary?.requiredMinutes > 0 && (
          <span className="mt-1 block text-[9px] font-semibold tabular-nums text-foreground">
            {formatObjectPlanningTime(summary.allocatedMinutes)} / {formatObjectPlanningTime(summary.requiredMinutes)}
          </span>
        )}
      </span>
    </button>
  );
}

function buildObjectResources({ objects, routes, shifts, occurrences, segmentsByShift, objectPlanningSummaries }) {
  const objectsById = new Map(objects.map(item => [String(item.id), item]));
  const routesById = new Map(routes.map(item => [String(item.id), item]));
  const currentOccurrences = occurrences.filter(item => item.lifecycle_status !== "cancelled");
  const currentSegments = segmentsByShift.allSegments || [];
  const relevantObjectIds = new Set([
    ...objects.filter(isPlanningObjectActive).map(item => item.id),
    ...currentOccurrences.map(item => item.object_id),
    ...currentSegments.map(item => item.object_id),
  ].filter(Boolean).map(String));
  const referencedObjectIds = new Set([
    ...currentOccurrences.map(item => item.object_id),
    ...currentSegments.map(item => item.object_id),
  ].filter(Boolean).map(String));
  const relevantRouteIds = new Set();
  let needsOther = false;

  shifts.forEach(shift => {
    const shiftSegments = segmentsByShift.get(String(shift.id)) || [];
    const objectIds = new Set([
      shift.object_id,
      ...(shift.object_ids || []),
      ...shiftSegments.map(item => item.object_id),
    ].filter(Boolean).map(String));
    objectIds.forEach(id => {
      relevantObjectIds.add(id);
      referencedObjectIds.add(id);
    });
    if (objectIds.size === 0 && shift.route_id) relevantRouteIds.add(String(shift.route_id));
    if (objectIds.size === 0 && !shift.route_id) needsOther = true;
  });

  const resources = [...relevantObjectIds].map(id => {
    const object = objectsById.get(id);
    const occurrence = currentOccurrences.find(item => String(item.object_id) === id);
    const segment = currentSegments.find(item => String(item.object_id) === id);
    const shift = shifts.find(item => (
      String(item.object_id || "") === id
      || (item.object_ids || []).some(objectId => String(objectId) === id)
    ));
    if (!isPlanningObjectActive(object || {}) && !referencedObjectIds.has(id)) return null;
    const preferSnapshot = object && !isPlanningObjectActive(object);
    return {
      key: `object:${id}`,
      id,
      kind: "object",
      label: preferSnapshot
        ? occurrence?.object_name_snapshot || segment?.object_name_snapshot || shift?.object_name_snapshot || object.name || "Onbekend object"
        : object?.name || occurrence?.object_name_snapshot || segment?.object_name_snapshot || shift?.object_name_snapshot || "Onbekend object",
      subtitle: preferSnapshot
        ? occurrence?.customer_name_snapshot || segment?.customer_name_snapshot || object.address || "Historische objectkoppeling"
        : object?.address || occurrence?.customer_name_snapshot || segment?.customer_name_snapshot || "Object",
      logoUrl: object?.logo_file_url || null,
      object: object || null,
      planningSummary: objectPlanningSummaries?.get(id) || null,
    };
  }).filter(Boolean);

  relevantRouteIds.forEach(id => {
    const route = routesById.get(id);
    resources.push({ key: `route:${id}`, id, kind: "route", label: route?.name || "Mobiele route", subtitle: "Mobiele surveillance" });
  });
  if (needsOther) resources.push({ key: "other", id: "other", kind: "other", label: "Overige diensten", subtitle: "Geen object of route gekoppeld" });

  return resources.sort((left, right) => (
    (left.kind === right.kind ? 0 : left.kind === "object" ? -1 : 1)
    || left.label.localeCompare(right.label, "nl")
  ));
}

function buildEmployeeResources(personnel) {
  return personnel
    .filter(isPlanningPersonnelActive)
    .map(item => ({
      key: `personnel:${item.id}`,
      id: String(item.id),
      kind: "employee",
      label: personnelName(item),
      subtitle: item.cao_function_group || item.function_type || item.employee_type || "Functie niet vastgelegd",
      personnel: item,
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "nl"));
}

function timelineBoundary(dayKey, minute) {
  if (minute === 24 * 60) {
    const day = parseDateKey(dayKey);
    day.setDate(day.getDate() + 1);
    return { date: toDateKey(day), time: "00:00" };
  }
  return { date: dayKey, time: timelineMinutesToClock(minute) };
}

function ObjectDayCell({
  resource,
  dayKey,
  occurrences,
  shifts,
  coverageSegmentsByOccurrence,
  coverageShiftsByOccurrence,
  assignmentsByShift,
  personnelById,
  segmentsByShift,
  selectedShiftId,
  onSelectOccurrence,
  onSelectShift,
  onUnassign,
  onMove,
  onCopy,
  onEditService,
  onEditComposition,
  onCancelComposition,
  onCreateOpenTaskSlice,
  onCopyService,
  onPasteService,
  serviceClipboard,
  onCopyTask,
  onEditTask,
  onPasteTask,
  onDeleteTask,
  onDeleteService,
  taskClipboard,
  onResizeTaskSegment,
  onResizeTaskBoundary,
  mutationPending,
  pendingResourceKeys,
  queuedResourceKeys,
  compact,
  editable,
}) {
  const cellOccurrences = sortByStart(occurrences, item => item.projection?.startTime || item.occurrence?.window_start_time);
  const occurrenceById = new Map(cellOccurrences.map(item => [String(item.occurrence.id), item]));
  const groupedShifts = new Map();
  sortByStart(shifts, item => item.slice?.startTime || item.segment?.start_time || item.shift?.start_time).forEach(projection => {
    const shiftId = String(projection.shift.id);
    if (!groupedShifts.has(shiftId)) groupedShifts.set(shiftId, { shift: projection.shift, projections: [] });
    groupedShifts.get(shiftId).projections.push(projection);
  });
  const laneServicesByOccurrence = new Map();
  [...groupedShifts.values()].forEach(entry => {
    const activeShiftSegments = segmentsByShift.get(String(entry.shift.id)) || [];
    const segmentProjections = entry.projections.filter(item => item.segment);
    const segment = segmentProjections.length === 1 ? segmentProjections[0].segment : null;
    const occurrenceItem = segment
      ? occurrenceById.get(String(segment.task_occurrence_id))
      : null;
    const eligible = Boolean(
      occurrenceItem
      && occurrenceItem.occurrence.execution_mode !== "time_window"
      && entry.shift.source_type === "task"
      && activeShiftSegments.length === 1
      && segmentProjections.length === 1,
    );
    if (eligible) appendToMap(laneServicesByOccurrence, String(segment.task_occurrence_id), entry);
  });
  laneServicesByOccurrence.forEach(entries => entries.sort((left, right) => (
    timeValue(left.projections[0]?.slice?.startTime || left.projections[0]?.segment?.start_time)
      - timeValue(right.projections[0]?.slice?.startTime || right.projections[0]?.segment?.start_time)
  )));
  const laneOccurrenceIds = new Set([...laneServicesByOccurrence].flatMap(([occurrenceId, entries]) => {
    const coveredOnDay = (coverageSegmentsByOccurrence.get(occurrenceId) || [])
      .filter(segment => getTaskOccurrenceDayProjection({
        service_date: segment.start_date,
        end_date: segment.end_date,
        window_start_time: segment.start_time,
        window_end_time: segment.end_time,
      }, dayKey))
      .map(segment => String(segment.id));
    const laneSegmentIds = new Set(entries.map(entry => String(entry.projections[0].segment.id)));
    return coveredOnDay.every(id => laneSegmentIds.has(id)) ? [occurrenceId] : [];
  }));
  const openTaskItems = cellOccurrences.flatMap(({ occurrence, planningState, projection }) => {
    const occurrenceId = String(occurrence.id);
    if (laneOccurrenceIds.has(occurrenceId)) return [];
    const gaps = getTaskTimelineGaps({
      occurrence,
      serviceDate: dayKey,
      segments: coverageSegmentsByOccurrence.get(occurrenceId) || [],
      shifts: coverageShiftsByOccurrence.get(occurrenceId) || [],
    });
    return gaps.map(gap => ({
      kind: "open-task",
      key: `open:${occurrenceId}:${dayKey}:${gap.startMinute}-${gap.endMinute}`,
      startMinute: gap.startMinute,
      occurrence,
      planningState,
      projection,
      gap,
    }));
  });
  const serviceItems = [...groupedShifts.values()].map(({ shift, projections }) => ({
    kind: "service",
    key: `service:${shift.id}:${dayKey}`,
    startMinute: timeValue(projections[0]?.slice?.startTime || projections[0]?.segment?.start_time || shift.start_time),
    shift,
    projections,
  })).filter(item => {
    const segment = item.projections.length === 1 ? item.projections[0]?.segment : null;
    return !segment || !laneOccurrenceIds.has(String(segment.task_occurrence_id));
  });
  const laneItems = cellOccurrences.flatMap(({ occurrence, planningState, projection }) => {
    const occurrenceId = String(occurrence.id);
    if (!laneOccurrenceIds.has(occurrenceId)) return [];
    const demand = getTaskTimelineDemand(occurrence, dayKey);
    return [{
      kind: "task-lane",
      key: `lane:${occurrenceId}:${dayKey}`,
      startMinute: demand?.startMinute ?? timeValue(projection?.startTime),
      occurrence,
      planningState,
      projection,
      serviceEntries: laneServicesByOccurrence.get(occurrenceId) || [],
    }];
  });
  const cellItems = [...openTaskItems, ...serviceItems, ...laneItems].sort((left, right) => (
    left.startMinute - right.startMinute
    || (left.kind === right.kind ? 0 : left.kind === "service" ? -1 : 1)
    || left.key.localeCompare(right.key)
  ));
  const canPasteTask = Boolean(taskClipboard && String(taskClipboard.object_id) === String(resource.id));
  const taskPastePending = pendingResourceKeys instanceof Set
    && pendingResourceKeys.has(`task-date:${resource.id}:${dayKey}`);
  return (
    <PlanningClipboardContextMenu
      mode="paste"
      label="Taak hier plakken"
      available={editable && resource.kind === "object"}
      disabled={mutationPending || taskPastePending || !canPasteTask}
      detail={taskClipboard
        ? canPasteTask
          ? `${taskClipboard.task_name_snapshot || "Taak"} · ${taskClipboard.window_start_time}–${taskClipboard.window_end_time}`
          : "Een taak kan alleen op hetzelfde object worden geplakt"
        : "Kopieer eerst een taak"}
      onSelect={() => onPasteTask?.({ task: taskClipboard, objectId: resource.id, serviceDate: dayKey })}
    >
    <div className="min-h-[112px] space-y-1.5 p-2" data-matrix-cell={`${resource.key}:${dayKey}`}>
      {cellItems.map(item => {
        if (item.kind === "task-lane") {
          const occurrenceId = String(item.occurrence.id);
          const laneShiftIds = item.serviceEntries.map(entry => `shift:${entry.shift.id}`);
          const lanePending = isPlanningResourcePending(
            pendingResourceKeys,
            mutationPending,
            `occurrence:${occurrenceId}`,
            ...laneShiftIds,
          );
          const laneActionPending = lanePending || isPlanningResourcePending(
            queuedResourceKeys,
            false,
            `occurrence:${occurrenceId}`,
            ...laneShiftIds,
          );
          return (
            <TaskCoverageLane
              key={item.key}
              occurrence={item.occurrence}
              planningState={item.planningState}
              projection={item.projection}
              serviceDate={dayKey}
              serviceEntries={item.serviceEntries}
              allOccurrenceSegments={coverageSegmentsByOccurrence.get(occurrenceId) || []}
              coverageShifts={coverageShiftsByOccurrence.get(occurrenceId) || []}
              assignmentsByShift={assignmentsByShift}
              personnelById={personnelById}
              resourceKey={`${resource.key}:${dayKey}:occurrence:${occurrenceId}`}
              selectedShiftId={selectedShiftId}
              onSelectOccurrence={onSelectOccurrence}
              onSelectShift={onSelectShift}
              onUnassign={onUnassign}
              onEditService={onEditService}
              onMove={onMove}
              onCopy={onCopy}
              onEditComposition={onEditComposition}
              onCancelComposition={onCancelComposition}
              onCreateOpenTaskSlice={onCreateOpenTaskSlice}
              onCopyService={onCopyService}
              onPasteService={onPasteService}
              serviceClipboard={serviceClipboard}
              onCopyTask={onCopyTask}
              onEditTask={onEditTask}
              onDeleteTask={onDeleteTask}
              onDeleteService={onDeleteService}
              onResizeTaskSegment={onResizeTaskSegment}
              onResizeTaskBoundary={onResizeTaskBoundary}
              mutationPending={lanePending}
              actionPending={laneActionPending}
              deletePending={lanePending}
              compact={compact}
              editable={editable}
            />
          );
        }
        if (item.kind === "open-task") {
          const openTaskPending = isPlanningResourcePending(
            pendingResourceKeys,
            mutationPending,
            `occurrence:${item.occurrence.id}`,
          );
          return (
            <OpenTaskIntervalCard
              key={item.key}
              occurrence={item.occurrence}
              planningState={item.planningState}
              projection={item.projection}
              gap={item.gap}
              onSelectOccurrence={onSelectOccurrence}
              onCreateOpenTaskSlice={onCreateOpenTaskSlice}
              onPasteService={onPasteService}
              serviceClipboard={serviceClipboard}
              onCopyTask={onCopyTask}
              onEditTask={onEditTask}
              onDeleteTask={onDeleteTask}
              editable={editable}
              mutationPending={openTaskPending}
              deletePending={openTaskPending}
              actionPending={openTaskPending || isPlanningResourcePending(
                queuedResourceKeys,
                false,
                `occurrence:${item.occurrence.id}`,
              )}
            />
          );
        }
        const { shift, projections } = item;
        const activeShiftSegments = segmentsByShift.get(String(shift.id)) || [];
        const projectionSegment = projections.length === 1 ? projections[0]?.segment : null;
        const occurrenceContext = projectionSegment
          ? occurrenceById.get(String(projectionSegment.task_occurrence_id))?.occurrence || null
          : null;
        const shiftPending = isPlanningResourcePending(
          pendingResourceKeys,
          mutationPending,
          `shift:${shift.id}`,
          occurrenceContext ? `occurrence:${occurrenceContext.id}` : null,
        );
        return (
          <MatrixShiftBlock
            key={item.key}
            shift={shift}
            projections={projections}
            assignments={assignmentsByShift.get(String(shift.id)) || []}
            personnelById={personnelById}
            segments={activeShiftSegments}
            occurrence={occurrenceContext}
            allOccurrenceSegments={projectionSegment
              ? coverageSegmentsByOccurrence.get(String(projectionSegment.task_occurrence_id)) || []
              : []}
            resourceKey={`${resource.key}:${dayKey}:shift:${shift.id}`}
            serviceDate={dayKey}
            selected={String(selectedShiftId || "") === String(shift.id)}
            onSelect={() => onSelectShift?.(shift)}
            onUnassign={assignment => onUnassign?.(shift, assignment)}
            onEditService={onEditService}
            onMove={onMove}
            onCopy={onCopy}
            onEditComposition={onEditComposition}
            onCancelComposition={onCancelComposition}
            onCopyService={onCopyService}
            onDeleteService={onDeleteService}
            onResizeTaskSegment={onResizeTaskSegment}
            editable={editable}
            mutationPending={shiftPending}
          />
        );
      })}
      {cellItems.length === 0 && <span className="block px-1 py-2 text-[9px] text-muted-foreground/60">Geen planning</span>}
    </div>
    </PlanningClipboardContextMenu>
  );
}

function EmployeeDayCell({
  resource,
  dayKey,
  placements,
  segmentsByShift,
  onSelectShift,
  onUnassign,
  onEditService,
  onCopyService,
  onDeleteService,
  mutationPending,
  pendingResourceKeys,
  editable,
}) {
  const droppableId = `employee-day:${resource.id}:${dayKey}`;
  const cellPending = isPlanningResourcePending(
    pendingResourceKeys,
    mutationPending,
    `personnel:${resource.id}`,
  );
  const renderCell = ({ provided = null, isDraggingOver = false } = {}) => (
    <div
      ref={provided?.innerRef}
      {...(provided?.droppableProps || {})}
      data-droppable-id={editable ? droppableId : undefined}
      data-matrix-cell={`${resource.key}:${dayKey}`}
      aria-busy={cellPending ? "true" : "false"}
      className={cn(
        "min-h-[112px] space-y-1.5 p-2 transition-colors",
        isDraggingOver && "bg-primary/[0.08] ring-2 ring-inset ring-primary/35",
      )}
    >
      {sortByStart(placements, item => item.slice?.startTime || item.shift.start_time).map(({ shift, assignment, slice }) => {
        const shiftSegments = segmentsByShift.get(String(shift.id)) || [];
        const placementPending = isPlanningResourcePending(
          pendingResourceKeys,
          mutationPending,
          `personnel:${resource.id}`,
          `shift:${shift.id}`,
          ...shiftSegments.map(segment => `occurrence:${segment.task_occurrence_id}`),
        );
        return (
          <EmployeeAssignmentBlock
            key={`${shift.id}-${assignment.id || assignment.slot_index || 0}-${dayKey}`}
            shift={shift}
            assignment={assignment}
            personnel={resource.personnel}
            segments={shiftSegments}
            projectionSlice={slice}
            onSelect={() => onSelectShift?.(shift)}
            onUnassign={item => onUnassign?.(shift, item)}
            onEditService={onEditService}
            onCopyService={onCopyService}
            onDeleteService={onDeleteService}
            disabled={placementPending}
            editable={editable}
          />
        );
      })}
      {placements.length === 0 && (
        <p className={cn(
          "flex min-h-12 items-center justify-center rounded-md border border-dashed border-transparent px-2 text-center text-[9px] text-muted-foreground/60",
          isDraggingOver && "border-primary/40 text-primary",
        )}>
          {isDraggingOver ? "Loslaten om taak bij medewerker te plannen" : editable ? "Sleep hier een open taak" : "Geen dienst"}
        </p>
      )}
      {provided?.placeholder}
    </div>
  );

  if (!editable) return renderCell();

  return (
    <Droppable droppableId={droppableId} type="TASK" isDropDisabled={cellPending}>
      {(provided, snapshot) => renderCell({ provided, isDraggingOver: snapshot.isDraggingOver })}
    </Droppable>
  );
}

/**
 * Matrix contract for Planning-page integration:
 * - occurrences: visible PlanningTaskOccurrence records for the selected range.
 * - personnel drops: `slot:<shift>:<slot>:<YYYY-MM-DD>:<resource>` plus
 *   `occurrence-gap:<occurrence>:<YYYY-MM-DD>:<start>:<end>`; both preserve
 *   the visible day, while cross-day slots require full-shift confirmation.
 * - task drops: `employee-day:<personnel>:<YYYY-MM-DD>`; resolve this to an
 *   explicit compose/add-to-shift + assignment confirmation in Planning.jsx.
 */
export default function PlanningMatrix({
  perspective,
  editable = false,
  compact = false,
  zoom = 1,
  days,
  shifts = [],
  coverageShifts = shifts,
  assignments = [],
  segments = [],
  occurrences = [],
  personnel = [],
  objects = [],
  routes = [],
  selectedShiftId,
  onSelectOccurrence,
  onSelectShift,
  onUnassign,
  onMove,
  onCopy,
  onEditService,
  onEditComposition,
  onCancelComposition,
  onCreateOpenTaskSlice,
  onCopyService,
  onPasteService,
  serviceClipboard,
  onCopyTask,
  onEditTask,
  onPasteTask,
  onDeleteTask,
  onDeleteService,
  taskClipboard,
  onResizeTaskSegment,
  onResizeTaskBoundary,
  mutationPending = false,
  pendingResourceKeys = null,
  queuedResourceKeys = null,
}) {
  const [selectedObjectResource, setSelectedObjectResource] = useState(null);
  const orientation = perspective === "object" ? "days_horizontal" : "resources_horizontal";
  const shiftsById = useMemo(() => new Map(shifts.map(item => [String(item.id), item])), [shifts]);
  const personnelById = useMemo(() => new Map(personnel.map(item => [String(item.id), item])), [personnel]);
  const assignmentsByShift = useMemo(() => {
    const map = new Map();
    activeAssignments(assignments).forEach(item => appendToMap(map, String(item.planning_shift_id || item.shift_id), item));
    return map;
  }, [assignments]);
  const segmentsByShift = useMemo(() => {
    const map = new Map();
    const activeShiftIds = new Set(shifts
      .filter(shift => shift.status !== "cancelled")
      .map(shift => String(shift.id)));
    const current = segments.filter(item => (
      item.status !== "removed" && activeShiftIds.has(String(item.shift_id))
    ));
    current.forEach(item => appendToMap(map, String(item.shift_id), item));
    map.allSegments = current;
    return map;
  }, [segments, shifts]);
  const coverageSegments = useMemo(() => {
    const activeShiftIds = new Set(coverageShifts
      .filter(shift => shift.status !== "cancelled")
      .map(shift => String(shift.id)));
    return segments.filter(item => (
      item.status !== "removed" && activeShiftIds.has(String(item.shift_id))
    ));
  }, [coverageShifts, segments]);
  const coverageSegmentsByOccurrence = useMemo(() => {
    const map = new Map();
    coverageSegments.forEach(segment => appendToMap(map, String(segment.task_occurrence_id), segment));
    return map;
  }, [coverageSegments]);
  const coverageShiftsByOccurrence = useMemo(() => {
    const shiftById = new Map(coverageShifts.map(shift => [String(shift.id), shift]));
    const map = new Map();
    coverageSegmentsByOccurrence.forEach((occurrenceSegments, occurrenceId) => {
      const seen = new Set();
      const occurrenceShifts = [];
      occurrenceSegments.forEach(segment => {
        const shiftId = String(segment.shift_id);
        const shift = shiftById.get(shiftId);
        if (!shift || seen.has(shiftId)) return;
        seen.add(shiftId);
        occurrenceShifts.push(shift);
      });
      map.set(occurrenceId, occurrenceShifts);
    });
    return map;
  }, [coverageSegmentsByOccurrence, coverageShifts]);
  const occurrencePlanningStates = useMemo(() => new Map(occurrences.map(occurrence => [
    String(occurrence.id),
    getOccurrencePlanningState({
      occurrence,
      segments: coverageSegmentsByOccurrence.get(String(occurrence.id)) || [],
      shifts: coverageShiftsByOccurrence.get(String(occurrence.id)) || [],
      assignments: (coverageShiftsByOccurrence.get(String(occurrence.id)) || [])
        .flatMap(shift => assignmentsByShift.get(String(shift.id)) || []),
    }),
  ])), [assignmentsByShift, coverageSegmentsByOccurrence, coverageShiftsByOccurrence, occurrences]);
  const objectPlanningSummaries = useMemo(() => {
    const objectIds = new Set([
      ...objects.map(item => item.id),
      ...occurrences.map(item => item.object_id),
      ...coverageSegments.map(item => item.object_id),
    ].filter(Boolean).map(String));
    return new Map([...objectIds].map(objectId => {
      const objectOccurrences = occurrences.filter(item => String(item.object_id) === objectId);
      const summary = taskCoverageSummary(objectOccurrences, coverageSegments, coverageShifts);
      const objectShiftIds = new Set(coverageSegments.filter(segment => String(segment.object_id) === objectId).map(segment => String(segment.shift_id)));
      coverageShifts.forEach(shift => {
        if (String(shift.object_id || "") === objectId || (shift.object_ids || []).some(id => String(id) === objectId)) objectShiftIds.add(String(shift.id));
      });
      const hasOpenStaffing = [...objectShiftIds].some(shiftId => {
        const shift = coverageShifts.find(item => String(item.id) === shiftId);
        return shift && (assignmentsByShift.get(shiftId) || []).length < Math.max(1, Number(shift.required_count || 1));
      });
      return [objectId, { ...summary, hasOpenStaffing }];
    }));
  }, [assignmentsByShift, coverageSegments, coverageShifts, objects, occurrences]);
  const resources = useMemo(() => perspective === "employee"
    ? buildEmployeeResources(personnel)
    : buildObjectResources({ objects, routes, shifts, occurrences, segmentsByShift, objectPlanningSummaries }),
  [objectPlanningSummaries, objects, occurrences, personnel, perspective, routes, segmentsByShift, shifts]);

  const occurrencesByCell = useMemo(() => {
    const map = new Map();
    const visibleDays = days.map(dateKey);
    occurrences.filter(item => item.lifecycle_status !== "cancelled").forEach(item => {
      if (!item.object_id) return;
      const planningState = occurrencePlanningStates.get(String(item.id));
      visibleDays.forEach(day => {
        const projection = getTaskOccurrenceDayProjection(item, day);
        if (!projection) return;
        appendToMap(map, `object:${item.object_id}:${day}`, { occurrence: item, planningState, projection });
      });
    });
    return map;
  }, [days, occurrencePlanningStates, occurrences]);
  const shiftsByObjectCell = useMemo(() => {
    const map = new Map();
    shifts.forEach(shift => {
      const shiftSegments = segmentsByShift.get(String(shift.id)) || [];
      if (shiftSegments.length > 0) {
        shiftSegments.forEach((segment, index) => {
          const fallbackDate = segment.start_date || segment.service_date || shift.service_date;
          const slices = intervalDaySlices(segment);
          const projections = slices.length > 0
            ? slices
            : [{ date: fallbackDate, startTime: segment.start_time, endTime: segment.end_time }];
          projections.forEach(slice => {
            const projectionKey = `segment:${segment.id || `${shift.id}:${index}:${slice.date}:${segment.start_time || ""}`}:${slice.date}`;
            if (segment.object_id) {
              appendToMap(map, `object:${segment.object_id}:${slice.date}`, { shift, segment, slice, projectionKey });
            } else if (shift.route_id) {
              appendToMap(map, `route:${shift.route_id}:${slice.date}`, { shift, segment, slice, projectionKey });
            } else {
              appendToMap(map, `other:${slice.date}`, { shift, segment, slice, projectionKey });
            }
          });
        });
        return;
      }
      const objectIds = new Set([
        shift.object_id,
        ...(shift.object_ids || []),
      ].filter(Boolean).map(String));
      const slices = intervalDaySlices(shift);
      const projections = slices.length > 0
        ? slices
        : [{ date: shift.service_date, startTime: shift.start_time, endTime: shift.end_time }];
      projections.forEach(slice => {
        const projection = { shift, segment: null, slice, projectionKey: `shift:${shift.id}:${slice.date}` };
        if (objectIds.size > 0) objectIds.forEach(id => appendToMap(map, `object:${id}:${slice.date}`, projection));
        else if (shift.route_id) appendToMap(map, `route:${shift.route_id}:${slice.date}`, projection);
        else appendToMap(map, `other:${slice.date}`, projection);
      });
    });
    return map;
  }, [segmentsByShift, shifts]);
  const openWorkDays = useMemo(() => {
    const visibleDays = new Set(days.map(dateKey));
    const openDays = new Set();

    occurrences.filter(item => item.lifecycle_status !== "cancelled").forEach(occurrence => {
      visibleDays.forEach(day => {
        if (!getTaskOccurrenceDayProjection(occurrence, day)) return;
        const gaps = getTaskTimelineGaps({
          occurrence,
          serviceDate: day,
          segments: coverageSegmentsByOccurrence.get(String(occurrence.id)) || [],
          shifts: coverageShiftsByOccurrence.get(String(occurrence.id)) || [],
        });
        if (gaps.length > 0) openDays.add(day);
      });
    });

    shifts.filter(shift => shift.status !== "cancelled").forEach(shift => {
      const assigned = (assignmentsByShift.get(String(shift.id)) || []).length;
      if (assigned >= Math.max(1, Number(shift.required_count || 1))) return;
      intervalDaySlices(shift).forEach(slice => {
        if (visibleDays.has(slice.date)) openDays.add(slice.date);
      });
    });
    return openDays;
  }, [assignmentsByShift, coverageSegmentsByOccurrence, coverageShiftsByOccurrence, days, occurrences, shifts]);
  const placementsByEmployeeCell = useMemo(() => {
    const map = new Map();
    const visibleDays = new Set(days.map(dateKey));
    activeAssignments(assignments).forEach(assignment => {
      const shift = shiftsById.get(String(assignment.planning_shift_id || assignment.shift_id));
      if (!shift?.service_date || !assignment.personnel_id) return;
      const slices = intervalDaySlices(shift);
      const projections = slices.length > 0
        ? slices
        : [{ date: shift.service_date, startTime: shift.start_time, endTime: shift.end_time }];
      projections.filter(slice => visibleDays.has(slice.date)).forEach(slice => {
        appendToMap(map, `${assignment.personnel_id}:${slice.date}`, { assignment, shift, slice });
      });
    });
    return map;
  }, [assignments, days, shiftsById]);
  const renderCell = (resource, day) => {
    const key = dateKey(day);
    return perspective === "employee" ? (
      <EmployeeDayCell
        resource={resource}
        dayKey={key}
        placements={placementsByEmployeeCell.get(`${resource.id}:${key}`) || []}
        segmentsByShift={segmentsByShift}
        onSelectShift={onSelectShift}
        onUnassign={onUnassign}
        onEditService={onEditService}
        onCopyService={onCopyService}
        onDeleteService={onDeleteService}
        mutationPending={mutationPending}
        pendingResourceKeys={pendingResourceKeys}
        editable={editable}
      />
    ) : (
      <ObjectDayCell
        resource={resource}
        dayKey={key}
        occurrences={occurrencesByCell.get(`${resource.key}:${key}`) || []}
        shifts={shiftsByObjectCell.get(`${resource.key}:${key}`) || []}
        coverageSegmentsByOccurrence={coverageSegmentsByOccurrence}
        coverageShiftsByOccurrence={coverageShiftsByOccurrence}
        assignmentsByShift={assignmentsByShift}
        personnelById={personnelById}
        segmentsByShift={segmentsByShift}
        selectedShiftId={selectedShiftId}
        onSelectOccurrence={onSelectOccurrence}
        onSelectShift={onSelectShift}
        onUnassign={onUnassign}
        onEditService={onEditService}
        onMove={onMove}
        onCopy={onCopy}
        onEditComposition={onEditComposition}
        onCancelComposition={onCancelComposition}
        onCreateOpenTaskSlice={onCreateOpenTaskSlice}
        onCopyService={onCopyService}
        onPasteService={onPasteService}
        serviceClipboard={serviceClipboard}
        onCopyTask={onCopyTask}
        onEditTask={onEditTask}
        onPasteTask={onPasteTask}
        onDeleteTask={onDeleteTask}
        onDeleteService={onDeleteService}
        taskClipboard={taskClipboard}
        onResizeTaskSegment={onResizeTaskSegment}
        onResizeTaskBoundary={onResizeTaskBoundary}
        mutationPending={mutationPending}
        pendingResourceKeys={pendingResourceKeys}
        queuedResourceKeys={queuedResourceKeys}
        compact={compact}
        editable={editable}
      />
    );
  };

  return (
    <div className="h-full min-h-0">
      <div
        className="planning-persistent-scrollbar h-full min-h-0 overflow-x-scroll overflow-y-auto overscroll-contain bg-background [scrollbar-gutter:stable]"
        data-testid="planning-matrix-scroll"
      >
      <table
        style={{ zoom }}
        className={cn(
          "min-w-max table-fixed border-separate border-spacing-0 [interpolate-size:allow-keywords]",
          compact && "[&_[data-matrix-cell]]:min-h-[72px] [&_[data-matrix-cell]]:p-1 [&_article]:h-[92px] [&_article]:overflow-hidden [&_article]:p-1.5 [&_[data-inline-time-editor=true]]:p-2 [&_[data-planning-dimensions]]:hidden [&_.compact-hide]:hidden",
        )}
        aria-label={perspective === "employee" ? "Planning per medewerker" : "Planning per object"}
        data-planning-layout="cards"
        data-editable={editable ? "true" : "false"}
      >
        {orientation === "resources_horizontal" ? (
          <>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 top-0 z-50 w-[138px] min-w-[138px] border-b border-r border-border bg-card text-left shadow-[4px_4px_10px_rgba(15,23,42,0.04)]">
                  <span className="block px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Dag</span>
                </th>
                {resources.map(resource => (
                  <th key={resource.key} scope="col" className="sticky top-0 z-40 w-[238px] min-w-[238px] max-w-[238px] border-b border-r border-border bg-card/95 align-top backdrop-blur last:border-r-0">
                    <ResourceHeader resource={resource} perspective={perspective} onObjectClick={setSelectedObjectResource} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map(day => {
                const key = dateKey(day);
                return (
                  <tr key={key}>
                    <th scope="row" className="sticky left-0 z-30 w-[138px] min-w-[138px] border-b border-r border-border bg-card align-top text-left shadow-[4px_0_10px_rgba(15,23,42,0.025)]">
                      <DayHeader day={day} hasOpenWork={openWorkDays.has(key)} />
                    </th>
                    {resources.map(resource => (
                      <td key={`${resource.key}:${key}`} className="w-[238px] min-w-[238px] max-w-[238px] border-b border-r border-border/80 align-top last:border-r-0">
                        {renderCell(resource, day)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </>
        ) : (
          <>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 top-0 z-50 w-[220px] min-w-[220px] border-b border-r border-border bg-card text-left shadow-[4px_4px_10px_rgba(15,23,42,0.04)]">
                  <span className="block px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {perspective === "employee" ? "Medewerker" : "Object"}
                  </span>
                </th>
                {days.map(day => {
                  const key = dateKey(day);
                  return (
                    <th key={key} scope="col" className="sticky top-0 z-40 w-[238px] min-w-[238px] max-w-[238px] border-b border-r border-border bg-card/95 align-top text-left backdrop-blur last:border-r-0">
                      <DayHeader day={day} hasOpenWork={openWorkDays.has(key)} />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {resources.map(resource => (
                <tr key={resource.key}>
                  <th scope="row" className="sticky left-0 z-30 w-[220px] min-w-[220px] max-w-[220px] border-b border-r border-border bg-card align-top text-left shadow-[4px_0_10px_rgba(15,23,42,0.025)]">
                    <ResourceHeader resource={resource} perspective={perspective} onObjectClick={setSelectedObjectResource} />
                  </th>
                  {days.map(day => {
                    const key = dateKey(day);
                    return (
                      <td key={`${resource.key}:${key}`} className="w-[238px] min-w-[238px] max-w-[238px] border-b border-r border-border/80 align-top last:border-r-0">
                        {renderCell(resource, day)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </>
        )}
      </table>
      {resources.length === 0 && (
        <div className="sticky left-0 flex min-h-48 w-[min(100vw,680px)] items-center justify-center p-6 text-center">
          <div className="rounded-lg border border-dashed border-border bg-card p-6">
            <p className="text-[12px] font-semibold">Geen planningseenheden in deze selectie</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Pas de periode of filters aan.</p>
          </div>
        </div>
      )}
      </div>
      <PlanningObjectInfoDialog resource={selectedObjectResource} onClose={() => setSelectedObjectResource(null)} />
    </div>
  );
}
