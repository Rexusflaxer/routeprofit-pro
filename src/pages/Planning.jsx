import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DragDropContext } from "@hello-pangea/dnd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Loader2,
  RotateCcw,
  Save,
  ListTodo,
  Users,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import PlanningToolbar from "@/components/planning/PlanningToolbar";
import PlanningBoard from "@/components/planning/PlanningBoard";
import PlanningSidePanel from "@/components/planning/PlanningSidePanel";
import PlanningShiftComposer from "@/components/planning/PlanningShiftComposer";
import PlanningServiceEditDialog from "@/components/planning/PlanningServiceEditDialog";
import PlanningTaskEditDialog from "@/components/planning/PlanningTaskEditDialog";
import PlanningTaskShiftRemovalDialog from "@/components/planning/PlanningTaskShiftRemovalDialog";
import PlanningTaskDeleteDialog from "@/components/planning/PlanningDeleteDialogs";
import {
  CancelTaskShiftDialog,
  PublishPlanningDialog,
  ShiftActionDialog,
} from "@/components/planning/PlanningDialogs";
import { invokePlanningApi } from "@/components/planning/planningApiClient";
import { applyPlanningMutationResultToCache } from "@/components/planning/planningQueryCache";
import { createPlanningRefreshScheduler } from "@/components/planning/planningRefreshScheduler";
import {
  buildDependentPlanningDeleteIntent,
  buildDependentPlanningResizeIntent,
  buildDependentPlanningUnassignIntent,
  buildEffectivePlanningPlan,
  buildPlanningPublicationSnapshot,
  planningOriginIntentId,
  planningRecordReference,
  rebaseDependentPlanningIntent,
  readPlanningRangeSnapshot,
  resolveOpenShiftSamePersonnelMerge,
  resolvePlanningAssignmentTarget,
  resolvePlanningOccurrenceTarget,
  resolvePlanningSegmentTarget,
  resolvePlanningShiftTarget,
  resolveQueuedOccurrenceMutation,
  resolveQueuedShiftAssignment,
  withPlanningOptimisticIntentIdentity,
} from "@/components/planning/planningEffectivePlan";
import {
  createPlanningBackgroundRequestGate,
  getPlanningMutationQueue,
  planningPersonnelDayResourceKey,
  planningPersonnelEligibilityResourceKeys,
  settlePlanningDropEnqueues,
} from "@/components/planning/planningMutationQueue";
import {
  getSharedBoundaryRepairRetryDelay,
  resolveEffectiveSharedBoundaryPlanning,
} from "@/components/planning/planningRecoveryDomain";
import {
  createPlanningMutationIntentRegistry,
  createPlanningMutationKey,
} from "@/components/planning/planningMutationIntent";
import {
  buildCopyTaskOccurrencePayload,
  buildOptimisticCopiedTaskOccurrence,
  planningTaskCopyReference,
  reconcileOptimisticTaskCopy,
} from "@/components/planning/planningTaskCopyDomain";
import {
  batchPlanningEligibilityCandidates,
  buildOccurrenceEligibilityShift,
  buildPlanningEligibilityObjectShiftContext,
  buildPlanningEligibilityPrefetchCandidate,
  createPlanningEligibilityUrgentRequestGate,
  createPlanningEligibilityIndex,
  mergePlanningEligibilityServerDecisions,
  planningEligibilityOwnSourceRevisionMatches,
  planningEligibilitySourceSemanticsEqual,
  selectPlanningEligibilityRequestCandidates,
} from "@/components/planning/planningEligibilityIndex";
import {
  createPendingPlanningEligibilityDrop,
  planningEligibilityDependencyRetryDelay,
  recordPendingPlanningEligibilityAttempt,
  resolvePendingPlanningEligibilityDrop,
} from "@/components/planning/planningEligibilityDropGate";
import {
  addDays,
  buildCandidateRanking,
  getAssignmentWarnings,
  getOccurrencePlanningState,
  getOccurrenceOpenStaffingShift,
  getSafeOccurrenceDropServiceDate,
  getOccurrenceStaffingTarget,
  getPlanningRange,
  getShiftInterval,
  getPlanningShiftRangeQuery,
  getPlanningTaskOccurrenceBootstrapStart,
  getPlanningTaskOccurrenceRangeQuery,
  isPlanningPersonnelActive,
  parseDateKey,
  planningShiftContainedInDate,
  planningShiftOverlapsRange,
  planningShiftOwnedByRange,
  planningTaskOccurrenceOverlapsRange,
  resolvePlanningDrop,
  taskOccurrenceOverlapsDate,
  taskCoverageSummary,
  toDateKey,
} from "@/components/planning/planningDomain";
import { getSuggestedTaskTimelineAllocation } from "@/components/planning/planningTimelineDomain";
import {
  CAO_PB_PLANNING_PERIODS_2026,
  getAdjacentCaoPbPlanningPeriod,
  getCaoPbPlanningPeriodByKey,
  getCaoPbPlanningRange,
  resolveCaoPbPlanningPeriod,
} from "@/components/planning/planningCaoPeriodDomain";
import { OBJECT_TASK_TYPES } from "@/components/objects/objectTaskConfig";

const VALID_VIEWS = new Set(["week", "period"]);
const VALID_PERSPECTIVES = new Set(["object", "employee"]);
const PLANNING_ZOOM_LEVELS = [0.7, 0.85, 1, 1.15, 1.3];
const PLANNING_ELIGIBILITY_MAX_AGE_MS = 120_000;
const PLANNING_ELIGIBILITY_REQUEST_TIMEOUT_MS = 12_000;
const PLANNING_ELIGIBILITY_HOVER_DELAY_MS = 80;
const PLANNING_ELIGIBILITY_PREFETCH_LEAD_MS = 15_000;
const dateLabel = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });
const dayLabel = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" });
const compactDateLabel = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });

function boundedPlanningEligibilityPromise(promise, timeoutMs = PLANNING_ELIGIBILITY_REQUEST_TIMEOUT_MS) {
  let timer = null;
  const timeout = new Promise((_resolve, reject) => {
    timer = globalThis.setTimeout(() => {
      const error = /** @type {any} */ (new Error("De planningvoorcontrole reageerde niet op tijd."));
      error.code = "PLANNING_ELIGIBILITY_TIMEOUT";
      reject(error);
    }, Math.max(1, Number(timeoutMs) || PLANNING_ELIGIBILITY_REQUEST_TIMEOUT_MS));
  });
  return Promise.race([Promise.resolve(promise), timeout])
    .finally(() => {
      if (timer !== null) globalThis.clearTimeout(timer);
    });
}

function personnelName(personnel) {
  return personnel?.name
    || personnel?.display_name
    || [personnel?.call_name || personnel?.first_name, personnel?.name_prefix, personnel?.last_name]
      .filter(Boolean)
      .join(" ")
    || "Onbekende medewerker";
}

function resolveOccurrenceEligibilityProjection({
  snapshot,
  occurrence,
  personnelItem,
  serviceDate,
  preferredSegment = null,
  shiftContext = null,
} = {}) {
  if (!occurrence || !personnelItem || !serviceDate) return null;
  const resolution = resolveQueuedOccurrenceMutation({
    snapshot,
    occurrenceId: occurrence.id,
    personnelId: personnelItem.id,
    personnelName: personnelName(personnelItem),
    serviceDate,
    preferredSegment,
    assignmentSource: "eligibility_preview",
    allowOptimisticAdjacent: true,
  });
  if (resolution.status !== "ready") return { resolution, shift: null, excludeAssignmentId: null };
  const interval = resolution.kind === "merge"
    ? resolution.adjacent.candidate.mergedSegment
    : resolution.allocation.segment;
  const shift = buildOccurrenceEligibilityShift({
    occurrence: resolution.allocation.occurrence,
    serviceDate: interval.start_date,
    startTime: interval.start_time,
    endTime: interval.end_time,
    shiftContext,
  });
  if (!shift) return { resolution, shift: null, excludeAssignmentId: null };
  return {
    resolution,
    shift: {
      ...shift,
      end_date: interval.end_date === interval.start_date ? null : interval.end_date,
    },
    excludeAssignmentId: resolution.kind === "merge"
      ? resolution.adjacent.candidate.assignment.id
      : null,
  };
}

function normalizePlanningShift(shift) {
  return {
    ...shift,
    name: shift.name || shift.service_name_snapshot || "Naamloze dienst",
    route_name: shift.route_name || shift.route_name_snapshot || null,
    object_name: shift.object_name || shift.object_name_snapshot || null,
    customer_name: shift.customer_name || shift.customer_name_snapshot || null,
    function_type: shift.function_type || shift.service_function_type || null,
  };
}

function normalizePlanningAssignment(assignment) {
  return {
    ...assignment,
    shift_id: assignment.shift_id || assignment.planning_shift_id,
    planning_shift_id: assignment.planning_shift_id || assignment.shift_id,
    personnel_name: assignment.personnel_name || assignment.personnel_name_snapshot || null,
    warnings: Array.isArray(assignment.warnings)
      ? assignment.warnings
      : assignment.warning_snapshot || [],
  };
}

function activeAssignments(assignments) {
  return assignments.filter(item => item.status !== "removed");
}

function shortPlanningVersionToken(value) {
  const input = String(value || "");
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return `${input.length.toString(36)}-${first.toString(36)}-${second.toString(36)}`;
}

function planningEligibilityRecordsVersion(source, project) {
  const records = Array.isArray(source) ? source : [];
  const serialized = records
    .map(record => JSON.stringify(project(record)))
    .sort()
    .join("|");
  return shortPlanningVersionToken(serialized);
}

function adjacentOpenTaskServiceNeighbors({ snapshot, shift, segment }) {
  const targetInterval = getShiftInterval({
    service_date: segment?.start_date,
    end_date: segment?.end_date,
    start_time: segment?.start_time,
    end_time: segment?.end_time,
    overnight: false,
  });
  if (!targetInterval.valid || !segment?.task_occurrence_id) return [];
  const assignmentsByShift = new Map();
  activeAssignments(snapshot?.assignments || []).forEach(item => {
    const key = String(item.planning_shift_id || item.shift_id);
    assignmentsByShift.set(key, [...(assignmentsByShift.get(key) || []), item]);
  });
  const segmentsByShift = new Map();
  (snapshot?.segments || []).filter(item => item.status !== "removed").forEach(item => {
    const key = String(item.shift_id);
    segmentsByShift.set(key, [...(segmentsByShift.get(key) || []), item]);
  });
  return (snapshot?.shifts || []).flatMap(candidateShift => {
    if (
      String(candidateShift.id) === String(shift?.id)
      || candidateShift.status !== "draft"
      || Number(candidateShift.published_revision || 0) > 0
      || candidateShift.source_type !== "task"
      || Number(candidateShift.required_count || 1) !== Number(shift?.required_count || 1)
      || (assignmentsByShift.get(String(candidateShift.id)) || []).length > 0
    ) return [];
    const candidateSegments = segmentsByShift.get(String(candidateShift.id)) || [];
    if (candidateSegments.length !== 1) return [];
    const candidateSegment = candidateSegments[0];
    if (String(candidateSegment.task_occurrence_id) !== String(segment.task_occurrence_id)) return [];
    const candidateInterval = getShiftInterval({
      service_date: candidateSegment.start_date,
      end_date: candidateSegment.end_date,
      start_time: candidateSegment.start_time,
      end_time: candidateSegment.end_time,
      overnight: false,
    });
    if (!candidateInterval.valid) return [];
    const side = candidateInterval.end.getTime() === targetInterval.start.getTime()
      ? "left"
      : candidateInterval.start.getTime() === targetInterval.end.getTime()
        ? "right"
        : null;
    return side ? [{ shift: candidateShift, segment: candidateSegment, side }] : [];
  }).sort((left, right) => (
    (left.side === "left" ? 0 : 1) - (right.side === "left" ? 0 : 1)
    || String(left.shift.id).localeCompare(String(right.shift.id))
  ));
}

function annotateSourceChangedShifts(shifts, sourceChangesByShift) {
  return shifts.map(shift => {
    const changes = sourceChangesByShift.get(String(shift.id)) || [];
    if (!changes.length) return shift;
    const existingWarnings = Array.isArray(shift.service_context_snapshot?.composition_warnings)
      ? shift.service_context_snapshot.composition_warnings.filter(warning => warning.code !== "task_source_changed")
      : [];
    return {
      ...shift,
      source_change_count: changes.length,
      service_context_snapshot: {
        ...(shift.service_context_snapshot || {}),
        composition_warnings: [...existingWarnings, {
          code: "task_source_changed",
          severity: "critical",
          message: `${changes.length} gekoppelde objecttaak${changes.length === 1 ? " is" : "taken zijn"} vanaf een latere week gewijzigd. Pas de dienstinhoud aan.`,
        }],
      },
    };
  });
}

function projectSegmentsToCurrentTaskOccurrences(segments, occurrences) {
  const occurrenceById = new Map(occurrences.map(item => [String(item.id), item]));
  const currentByLogicalKey = new Map();
  occurrences
    .filter(item => item.lifecycle_status === "active" && item.logical_source_key)
    .forEach(item => currentByLogicalKey.set(String(item.logical_source_key), item));

  return segments.map(segment => {
    const linked = occurrenceById.get(String(segment.task_occurrence_id));
    if (linked?.lifecycle_status !== "superseded" || !linked.logical_source_key) return segment;
    const current = currentByLogicalKey.get(String(linked.logical_source_key));
    if (!current) return segment;
    return {
      ...segment,
      task_occurrence_id: current.id,
      source_task_occurrence_id: segment.task_occurrence_id,
    };
  });
}

function assignmentWarnings(assignment) {
  return Array.isArray(assignment?.warnings)
    ? assignment.warnings
    : Array.isArray(assignment?.warning_snapshot)
    ? assignment.warning_snapshot
    : [];
}

function makeMaps(objects, customers) {
  return {
    objectsById: new Map(objects.map(item => [String(item.id), item])),
    customersById: new Map(customers.map(item => [String(item.id), item])),
  };
}

function rangeLabelFor(view, range, caoPeriod = null) {
  if (view === "period" && caoPeriod) {
    return `${caoPeriod.label} · ${compactDateLabel.format(range.start)} – ${compactDateLabel.format(range.end)}`;
  }
  if (view === "week" && range.days.length === 1) return dayLabel.format(range.start);
  return `${dateLabel.format(range.start)} – ${dateLabel.format(range.end)}`;
}

function occurrenceSegmentForTimelineSlice(occurrence, serviceDate, startTime, endTime) {
  const startDate = toDateKey(serviceDate);
  if (!occurrence?.id || !startDate || !startTime || !endTime) return null;
  if (endTime === "24:00") {
    const parsed = parseDateKey(startDate);
    if (!parsed) return null;
    return {
      task_occurrence_id: occurrence.id,
      start_date: startDate,
      end_date: toDateKey(addDays(parsed, 1)),
      start_time: startTime,
      end_time: "00:00",
    };
  }
  return {
    task_occurrence_id: occurrence.id,
    start_date: startDate,
    end_date: startDate,
    start_time: startTime,
    end_time: endTime,
  };
}

function personnelDayQueueResourceKeys(personnelId, record) {
  if (!personnelId || !record) return [];
  const interval = getShiftInterval({
    service_date: record.start_date || record.service_date,
    end_date: record.end_date || record.start_date || record.service_date,
    start_time: record.start_time,
    end_time: record.end_time,
    overnight: true,
  });
  const fallbackDate = record.start_date || record.service_date;
  if (!interval.valid) {
    const fallback = planningPersonnelDayResourceKey(personnelId, fallbackDate);
    return fallback
      ? planningPersonnelEligibilityResourceKeys(personnelId, fallbackDate)
      : [];
  }

  return planningPersonnelEligibilityResourceKeys(
    personnelId,
    toDateKey(interval.start),
    toDateKey(new Date(interval.end.getTime() - 1)),
  );
}

function planningEligibilityCandidateSourceResourceKey(candidate) {
  const sourceId = String(candidate?.source_id || "").trim();
  if (!sourceId) return null;
  return candidate?.source_kind === "occurrence"
    ? `occurrence:${sourceId}`
    : `shift:${sourceId}`;
}

function planningEligibilityCandidateHasQueuedSourceConflict(candidate, resourceKeys = []) {
  const sourceKey = planningEligibilityCandidateSourceResourceKey(candidate);
  return Boolean(sourceKey && new Set(resourceKeys || []).has(sourceKey));
}

function optimisticCompositionRecords({ key, occurrence, personnelItem = null, segment, warnings = [] }) {
  const shiftId = `pending-shift-${key}`;
  const segmentId = `pending-segment-${key}`;
  const assignmentId = personnelItem ? `pending-assignment-${key}` : null;
  const shift = normalizePlanningShift({
    id: shiftId,
    revision: 1,
    source_type: "task",
    source_id: occurrence.object_task_definition_id || null,
    company_id: occurrence.company_id || null,
    status: "draft",
    service_name_snapshot: `${occurrence.task_name_snapshot || "Taak"} · ${occurrence.object_name_snapshot || "Object"}`,
    service_date: segment.start_date,
    end_date: segment.end_date === segment.start_date ? null : segment.end_date,
    start_time: segment.start_time,
    end_time: segment.end_time,
    required_count: 1,
    customer_id: occurrence.customer_id || null,
    customer_ids: occurrence.customer_id ? [occurrence.customer_id] : [],
    object_id: occurrence.object_id || null,
    object_ids: occurrence.object_id ? [occurrence.object_id] : [],
    object_name_snapshot: occurrence.object_name_snapshot || null,
    customer_name_snapshot: occurrence.customer_name_snapshot || null,
    task_occurrence_ids: [occurrence.id],
    _optimistic_pending: true,
  });
  const taskSegment = {
    id: segmentId,
    revision: 1,
    shift_id: shiftId,
    task_occurrence_id: occurrence.id,
    customer_id: occurrence.customer_id || null,
    object_id: occurrence.object_id || null,
    customer_name_snapshot: occurrence.customer_name_snapshot || null,
    object_name_snapshot: occurrence.object_name_snapshot || null,
    task_name_snapshot: occurrence.task_name_snapshot || "Taak",
    task_type: occurrence.task_type || null,
    start_date: segment.start_date,
    end_date: segment.end_date,
    start_time: segment.start_time,
    end_time: segment.end_time,
    status: "draft",
    sequence_index: 0,
    _optimistic_pending: true,
  };
  const assignment = personnelItem ? normalizePlanningAssignment({
    id: assignmentId,
    revision: 1,
    planning_shift_id: shiftId,
    shift_id: shiftId,
    personnel_id: personnelItem.id,
    personnel_name: personnelName(personnelItem),
    slot_index: 0,
    status: "draft",
    warnings,
    _optimistic_pending: true,
  }) : null;
  return withPlanningOptimisticIntentIdentity({
    key,
    shifts: [shift],
    segments: [taskSegment],
    assignments: assignment ? [assignment] : [],
    occurrences: [],
  }, { originIntentId: key });
}

function optimisticQueuedOccurrenceRecords({ key, resolution, personnelItem, warnings = [] }) {
  if (resolution?.kind !== "merge") {
    return optimisticCompositionRecords({
      key,
      occurrence: resolution?.allocation?.occurrence,
      personnelItem,
      segment: resolution?.allocation?.segment,
      warnings,
    });
  }
  const { shift, segment, mergedSegment, durationMinutes } = resolution.adjacent.candidate;
  return withPlanningOptimisticIntentIdentity({
    key,
    shifts: [{
      ...shift,
      service_date: mergedSegment.start_date,
      end_date: mergedSegment.end_date === mergedSegment.start_date ? null : mergedSegment.end_date,
      start_time: mergedSegment.start_time,
      end_time: mergedSegment.end_time,
      duration_minutes: durationMinutes,
      _optimistic_pending: true,
    }],
    segments: [{
      ...segment,
      ...mergedSegment,
      duration_minutes: durationMinutes,
      _optimistic_pending: true,
    }],
    assignments: [],
    occurrences: [],
  }, { originIntentId: key });
}

function mutationMessage(error) {
  if (Number(error?.status) === 409) return `${error.message} De planning wordt opnieuw geladen.`;
  return error?.message || "De planningactie kon niet worden uitgevoerd.";
}

function queuedPlanningRebaseError(reason) {
  const messages = {
    shift_missing: "De dienst bestaat niet meer in de actuele planning.",
    personnel_already_assigned: "De medewerker staat inmiddels al op deze dienst.",
    shift_full: "De dienst is inmiddels volledig bezet.",
    occurrence_missing: "De klanttaak bestaat niet meer in de actuele planning.",
    occurrence_full: "De klanttaak is inmiddels volledig ingepland.",
    occurrence_gap_exhausted: "Het gekozen taakdeel is inmiddels gevuld.",
    merged_shift_exceeds_automatic_limit: "De aansluitende dienst zou langer dan twaalf uur worden.",
    multiple_eligible_adjacent_shifts: "De aansluitende dienst kan niet eenduidig worden bepaald.",
    merge_occurrence_missing: "Niet alle taken van de aansluitende dienst zijn geladen.",
  };
  return Object.assign(new Error(messages[reason] || "De planning is intussen gewijzigd; deze actie is niet meer veilig uitvoerbaar."), {
    status: 409,
    details: { code: "queued_planning_rebase_blocked", reason },
  });
}

async function listAllEntityRecords(entity, sort) {
  const records = new Map();
  const pageSize = 5000;
  const stableSort = sort || "created_date";
  for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
    const page = await entity.list(stableSort, pageSize, pageIndex * pageSize);
    page.forEach(record => records.set(String(record.id), record));
    if (page.length < pageSize) return [...records.values()];
  }
  throw new Error("De dataset is te groot om veilig in één planningsoverzicht te laden.");
}

async function filterAllEntityRecords(entity, query, sort) {
  const records = new Map();
  const pageSize = 5000;
  const stableSort = sort || "created_date";
  for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
    const page = await entity.filter(query, stableSort, pageSize, pageIndex * pageSize);
    page.forEach(record => records.set(String(record.id), record));
    if (page.length < pageSize) return [...records.values()];
  }
  throw new Error("De dataset is te groot om veilig in één planningsoverzicht te laden.");
}

async function filterEntityRecordsForShiftIds(entity, shiftIds, sort, additionalQuery = {}) {
  const uniqueShiftIds = [...new Set((shiftIds || []).map(String).filter(Boolean))];
  if (uniqueShiftIds.length === 0) return [];
  const chunks = [];
  for (let index = 0; index < uniqueShiftIds.length; index += 200) {
    chunks.push(uniqueShiftIds.slice(index, index + 200));
  }
  const records = new Map();
  for (let index = 0; index < chunks.length; index += 4) {
    const batch = await Promise.all(chunks.slice(index, index + 4).map(ids => (
      filterAllEntityRecords(entity, { ...additionalQuery, shift_id: { $in: ids } }, sort)
    )));
    batch.flat().forEach(record => records.set(String(record.id), record));
  }
  return [...records.values()];
}

async function filterEntityRecordsForPersonnelIds(entity, personnelIds, sort, additionalQuery = {}) {
  const uniquePersonnelIds = [...new Set((personnelIds || []).map(String).filter(Boolean))];
  if (uniquePersonnelIds.length === 0) return [];
  const chunks = [];
  for (let index = 0; index < uniquePersonnelIds.length; index += 200) {
    chunks.push(uniquePersonnelIds.slice(index, index + 200));
  }
  const scoped = new Map();
  for (let index = 0; index < chunks.length; index += 4) {
    const batch = await Promise.all(chunks.slice(index, index + 4).map(ids => (
      filterAllEntityRecords(entity, { ...additionalQuery, personnel_id: { $in: ids } }, sort)
    )));
    batch.flat().forEach(record => scoped.set(String(record.id), record));
  }
  return [...scoped.values()];
}

function planningExecutionSnapshotFromCache(queryClient, periodStart, periodEnd) {
  const cached = readPlanningRangeSnapshot(queryClient, { periodStart, periodEnd });
  const effective = resolveEffectiveSharedBoundaryPlanning({
    shifts: cached.shifts,
    assignments: cached.assignments,
    occurrences: cached.occurrences,
    segments: cached.segments,
  });
  return {
    shifts: effective.shifts.map(normalizePlanningShift),
    assignments: effective.assignments.map(normalizePlanningAssignment),
    segments: effective.segments,
    occurrences: effective.occurrences,
  };
}

export default function Planning() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDate = parseDateKey(searchParams.get("date")) || new Date();
  const requestedView = searchParams.get("view") === "four_weeks" ? "period" : searchParams.get("view");
  const initialView = VALID_VIEWS.has(requestedView) ? requestedView : "period";
  const initialPerspective = VALID_PERSPECTIVES.has(searchParams.get("perspective"))
    ? searchParams.get("perspective")
    : "object";
  const initialPeriod = getPlanningRange(initialDate, "period", {
    periodStart: searchParams.get("from"),
    periodEnd: searchParams.get("to"),
    maxDays: 63,
  });
  const initialCaoPeriod = getCaoPbPlanningPeriodByKey(searchParams.get("period"))
    || resolveCaoPbPlanningPeriod(searchParams.get("from"))
    || resolveCaoPbPlanningPeriod(initialDate);
  const sharedPlanningMutationQueue = getPlanningMutationQueue();

  const [anchorDate, setAnchorDate] = useState(initialDate);
  const [view, setView] = useState(initialView);
  const [customPeriodStart, setCustomPeriodStart] = useState(toDateKey(initialPeriod.start));
  const [customPeriodEnd, setCustomPeriodEnd] = useState(toDateKey(initialPeriod.end));
  const [selectedCaoPeriodId, setSelectedCaoPeriodId] = useState(initialCaoPeriod?.key || "");
  const [perspective, setPerspective] = useState(initialPerspective);
  const [editing, setEditing] = useState(false);
  const [savedDraftNotice, setSavedDraftNotice] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(2);
  const planningZoom = PLANNING_ZOOM_LEVELS[zoomIndex];
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState([]);
  const [objectFilter, setObjectFilter] = useState([]);
  const [taskTypeFilter, setTaskTypeFilter] = useState([]);
  const [selectedShiftId, setSelectedShiftId] = useState(null);
  const [shiftAction, setShiftAction] = useState(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState("tasks");
  const [pendingMatrixChanges, setPendingMatrixChanges] = useState([]);
  const [pendingResourceKeys, setPendingResourceKeys] = useState(() => new Set());
  const [planningQueueState, setPlanningQueueState] = useState(() => sharedPlanningMutationQueue.getSnapshot());
  const [draftSavePending, setDraftSavePending] = useState(false);
  const [composer, setComposer] = useState(null);
  const [serviceEditor, setServiceEditor] = useState(null);
  const [taskEditor, setTaskEditor] = useState(null);
  const [taskShiftRemovalRequest, setTaskShiftRemovalRequest] = useState(null);
  const [cancelTaskShift, setCancelTaskShift] = useState(null);
  const [taskDeleteRequest, setTaskDeleteRequest] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [liveMessage, setLiveMessage] = useState("");
  const [serviceClipboard, setServiceClipboard] = useState(null);
  const [taskClipboard, setTaskClipboard] = useState(null);
  const [eligibilityServerDecisions, setEligibilityServerDecisions] = useState([]);
  const [dragEligibilityPreview, setDragEligibilityPreview] = useState(null);
  const [eligibilityFreshnessTick, setEligibilityFreshnessTick] = useState(0);
  const [planningDragGestureActive, setPlanningDragGestureActive] = useState(false);
  const [dragPersonnelOrder, setDragPersonnelOrder] = useState(null);
  const [pendingEligibilityDrop, setPendingEligibilityDrop] = useState(null);
  const [eligibilityDependencyRefreshActive, setEligibilityDependencyRefreshActive] = useState(false);
  const [planningResizeGestureActive, setPlanningResizeGestureActive] = useState(false);
  const lastBootstrapKey = useRef("");
  const bootstrapRecoveryTimer = useRef(null);
  const lastBoundaryRecoveryKey = useRef("");
  const mutationIntents = useRef(null);
  if (!mutationIntents.current) mutationIntents.current = createPlanningMutationIntentRegistry();
  const refreshScheduler = useRef(null);
  const refreshPlanningRef = useRef(null);
  const taskMaterializationRequest = useRef(null);
  const taskMaterializationRunning = useRef(false);
  const pendingResourceKeysRef = useRef(new Set());
  const planningMutationQueue = useRef(sharedPlanningMutationQueue);
  const planningCommitFenceRef = useRef(null);
  const planningDragGestureActiveRef = useRef(false);
  const beginPlanningInteractionRef = useRef(null);
  const finishPlanningInteractionRef = useRef(null);
  const planningDragLifecycleRef = useRef({
    active: false,
    promise: Promise.resolve(),
    resolve: null,
    resumeRefresh: null,
    refreshWasInFlight: false,
    flushAfterRelease: false,
    releaseEligibilityRefresh: null,
    scheduler: null,
  });
  const pendingEligibilityDropRef = useRef(null);
  const pendingEligibilityDropBacklogRef = useRef([]);
  const resolveDropEligibilityPreviewRef = useRef(null);
  const processPlanningDropRef = useRef(null);
  const requestUrgentEligibilityCandidatesRef = useRef(null);
  const planningResizeGestureActiveRef = useRef(false);
  const eligibilityBackgroundRequestGateRef = useRef(createPlanningBackgroundRequestGate());
  const eligibilityBackgroundPrefetchGenerationRef = useRef(0);
  const eligibilityBackgroundPrefetchBasisRef = useRef("");
  const eligibilityBackgroundRetryAtRef = useRef(0);
  const eligibilityPrewarmBasisRef = useRef("");
  const eligibilityUrgentPrefetchKeysRef = useRef(new Set());
  const eligibilityUrgentRequestGateRef = useRef(null);
  const eligibilityHeldDropRequestGateRef = useRef(null);
  if (!eligibilityUrgentRequestGateRef.current) {
    // Background warming and speculative hover share one Base44 lane. A held
    // drop has one separate bounded slot so user intent can pre-empt warming
    // without recreating the former request burst.
    eligibilityUrgentRequestGateRef.current = createPlanningEligibilityUrgentRequestGate({ maxConcurrent: 1 });
  }
  if (!eligibilityHeldDropRequestGateRef.current) {
    eligibilityHeldDropRequestGateRef.current = createPlanningEligibilityUrgentRequestGate({ maxConcurrent: 1 });
  }
  const eligibilityServerDecisionsRef = useRef([]);
  const eligibilityIndexRef = useRef(null);
  const eligibilityPlanningSnapshotRef = useRef(null);
  const eligibilityOwnAckSourceRevisionsRef = useRef(new Map());
  const eligibilityDependencyRefreshTokensRef = useRef(new Set());
  const eligibilityDependencyRefreshActiveRef = useRef(false);
  const eligibilityDependencyRefreshPromiseRef = useRef(null);
  const eligibilityDependencyRefreshLastAttemptRef = useRef(0);
  const eligibilityDependencyRefreshFailureCountRef = useRef(0);
  const lastWrittenSearchKey = useRef(null);
  const hydratingFromUrl = useRef(false);

  const cancelHeldPlanningDrop = useCallback((description, { updateState = true } = {}) => {
    if (!pendingEligibilityDropRef.current) return false;
    pendingEligibilityDropRef.current = null;
    pendingEligibilityDropBacklogRef.current = [];
    if (updateState) setPendingEligibilityDrop(null);
    const message = description
      || "De vastgehouden sleepactie is geannuleerd omdat u de planning hebt verlaten of van periode bent gewisseld.";
    toast({ title: "Sleepactie geannuleerd", description: message });
    if (updateState) setLiveMessage(message);
    return true;
  }, [toast]);

  const beginEligibilityDependencyRefresh = useCallback(() => {
    const token = Symbol("planning-eligibility-refresh");
    const tokens = eligibilityDependencyRefreshTokensRef.current;
    tokens.add(token);
    if (!eligibilityDependencyRefreshActiveRef.current) {
      eligibilityDependencyRefreshActiveRef.current = true;
      setEligibilityDependencyRefreshActive(true);
    }
    let released = false;
    return () => {
      if (released) return false;
      released = true;
      tokens.delete(token);
      if (tokens.size === 0 && eligibilityDependencyRefreshActiveRef.current) {
        eligibilityDependencyRefreshActiveRef.current = false;
        setEligibilityDependencyRefreshActive(false);
      }
      return true;
    };
  }, []);

  useEffect(() => planningMutationQueue.current.subscribe(setPlanningQueueState), []);

  useEffect(() => {
    if (!pendingEligibilityDrop) return undefined;
    const protectPendingDrop = event => {
      event.preventDefault();
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", protectPendingDrop);
    return () => window.removeEventListener("beforeunload", protectPendingDrop);
  }, [pendingEligibilityDrop]);

  useEffect(() => {
    if (!pendingEligibilityDrop) return undefined;
    const cancelBeforeInternalNavigation = event => {
      if (
        event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) return;
      const anchor = event.target?.closest?.("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      let target;
      try {
        target = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (target.origin !== window.location.origin) return;
      const current = new URL(window.location.href);
      if (
        target.pathname === current.pathname
        && target.search === current.search
        && target.hash === current.hash
      ) return;
      cancelHeldPlanningDrop(
        "De vastgehouden sleepactie is geannuleerd voordat u naar een andere pagina ging. Er is geen medewerker ingepland.",
      );
    };
    document.addEventListener("click", cancelBeforeInternalNavigation, true);
    return () => document.removeEventListener("click", cancelBeforeInternalNavigation, true);
  }, [cancelHeldPlanningDrop, pendingEligibilityDrop]);

  useEffect(() => {
    let endTimer = null;
    const setActive = active => {
      if (planningResizeGestureActiveRef.current === active) return;
      planningResizeGestureActiveRef.current = active;
      setPlanningResizeGestureActive(active);
    };
    const handlePointerDown = event => {
      if (!event.target?.closest?.("[data-service-resize-edge]")) return;
      setActive(true);
      beginPlanningInteractionRef.current?.();
    };
    const handlePointerEnd = () => {
      if (!planningResizeGestureActiveRef.current) return;
      if (endTimer !== null) window.clearTimeout(endTimer);
      // Boundary handlers commit during the same pointer-up turn. Release the
      // interaction gate one macrotask later so their optimistic command is in
      // the queue before a paused consistency refresh may resume.
      endTimer = window.setTimeout(() => {
        endTimer = null;
        setActive(false);
        finishPlanningInteractionRef.current?.();
      }, 0);
    };
    // Capture sees the pointer before the resize handle stops propagation and
    // survives the optimistic-to-server rerender of that same handle.
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointerup", handlePointerEnd, true);
    window.addEventListener("pointercancel", handlePointerEnd, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointerup", handlePointerEnd, true);
      window.removeEventListener("pointercancel", handlePointerEnd, true);
      if (endTimer !== null) window.clearTimeout(endTimer);
    };
  }, []);

  const selectedCaoPeriod = useMemo(
    () => getCaoPbPlanningPeriodByKey(selectedCaoPeriodId),
    [selectedCaoPeriodId],
  );
  const range = useMemo(() => {
    if (view === "period" && selectedCaoPeriod) return getCaoPbPlanningRange(selectedCaoPeriod);
    return getPlanningRange(anchorDate, view, {
      periodStart: customPeriodStart,
      periodEnd: customPeriodEnd,
      maxDays: 63,
    });
  }, [anchorDate, customPeriodEnd, customPeriodStart, selectedCaoPeriod, view]);
  const rangeLabel = rangeLabelFor(view, range, selectedCaoPeriod);
  const periodStart = toDateKey(range.start);
  const periodEnd = toDateKey(range.end);
  const planningContextStart = toDateKey(addDays(periodStart, -7));
  const planningContextEnd = toDateKey(addDays(periodEnd, 7));
  const bootstrapStart = getPlanningTaskOccurrenceBootstrapStart(periodStart) || periodStart;
  const searchParamsKey = searchParams.toString();

  useEffect(() => {
    if (lastWrittenSearchKey.current === searchParamsKey) {
      lastWrittenSearchKey.current = null;
      return;
    }
    // Browser Back/Forward can change only /Planning's query string, so the
    // route component stays mounted and no unmount cleanup runs. Cancel the
    // held drop synchronously before hydrating a different planning context;
    // it may never resume against a target from another range.
    cancelHeldPlanningDrop(
      "De vastgehouden sleepactie is geannuleerd voordat de planning via de browsergeschiedenis werd gewijzigd. Er is geen medewerker ingepland.",
    );
    const nextDate = parseDateKey(searchParams.get("date")) || new Date();
    const requestedNextView = searchParams.get("view") === "four_weeks" ? "period" : searchParams.get("view");
    const nextView = VALID_VIEWS.has(requestedNextView) ? requestedNextView : "period";
    const nextPerspective = VALID_PERSPECTIVES.has(searchParams.get("perspective"))
      ? searchParams.get("perspective")
      : "object";
    const nextPeriod = getPlanningRange(nextDate, "period", {
      periodStart: searchParams.get("from"),
      periodEnd: searchParams.get("to"),
      maxDays: 63,
    });
    const nextCaoPeriod = getCaoPbPlanningPeriodByKey(searchParams.get("period"))
      || resolveCaoPbPlanningPeriod(searchParams.get("from"))
      || resolveCaoPbPlanningPeriod(nextDate);
    hydratingFromUrl.current = true;
    setAnchorDate(nextDate);
    setView(nextView);
    setPerspective(nextPerspective);
    setCustomPeriodStart(toDateKey(nextPeriod.start));
    setCustomPeriodEnd(toDateKey(nextPeriod.end));
    setSelectedCaoPeriodId(nextCaoPeriod?.key || "");
    setSelectedShiftId(null);
    setEditing(false);
  }, [cancelHeldPlanningDrop, searchParams, searchParamsKey]);

  useEffect(() => {
    if (hydratingFromUrl.current) {
      hydratingFromUrl.current = false;
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set("date", toDateKey(anchorDate));
    next.set("view", view);
    next.set("perspective", perspective);
    next.delete("layout");
    if (view === "period") {
      next.set("from", periodStart);
      next.set("to", periodEnd);
      if (selectedCaoPeriod) next.set("period", selectedCaoPeriod.key);
      else next.delete("period");
    } else {
      next.delete("from");
      next.delete("to");
      next.delete("period");
    }
    const nextSearchKey = next.toString();
    if (nextSearchKey === searchParamsKey) return;
    lastWrittenSearchKey.current = nextSearchKey;
    setSearchParams(next, { replace: true });
  }, [anchorDate, periodEnd, periodStart, perspective, searchParams, searchParamsKey, selectedCaoPeriod, setSearchParams, view]);

  const shiftsQuery = useQuery({
    queryKey: ["planning-shifts", periodStart, periodEnd],
    queryFn: () => filterAllEntityRecords(
      base44.entities.PlanningShift,
      getPlanningShiftRangeQuery(planningContextStart, planningContextEnd),
      "-service_date",
    ),
    staleTime: 15_000,
  });
  const planningContextShiftIds = useMemo(
    () => (shiftsQuery.data || []).map(shift => String(shift.id)).sort(),
    [shiftsQuery.data],
  );
  const planningContextShiftKey = planningContextShiftIds.join("|");
  const assignmentsQuery = useQuery({
    queryKey: ["planning-assignments", periodStart, periodEnd, planningContextShiftKey],
    queryFn: () => filterEntityRecordsForShiftIds(
      base44.entities.PlanningAssignment,
      planningContextShiftIds,
      "-updated_date",
      { status: { $ne: "removed" } },
    ),
    enabled: !shiftsQuery.isLoading,
    placeholderData: previous => previous || [],
    staleTime: 10_000,
  });
  const taskOccurrencesQuery = useQuery({
    queryKey: ["planning-task-occurrences", periodStart, periodEnd],
    queryFn: () => filterAllEntityRecords(
      base44.entities.PlanningTaskOccurrence,
      getPlanningTaskOccurrenceRangeQuery(periodStart, periodEnd),
      "-service_date",
    ),
    staleTime: 10_000,
  });
  const taskSourceChangesQuery = useQuery({
    queryKey: ["planning-task-source-changes", periodStart, periodEnd],
    queryFn: () => filterAllEntityRecords(
      base44.entities.PlanningTaskSourceChange,
      {
        status: "open",
        service_date: { $gte: periodStart, $lte: periodEnd },
      },
      "service_date",
    ),
    staleTime: 10_000,
  });
  const taskSegmentsQuery = useQuery({
    queryKey: ["planning-task-segments", periodStart, periodEnd, planningContextShiftKey],
    queryFn: () => filterEntityRecordsForShiftIds(
      base44.entities.PlanningShiftTaskSegment,
      planningContextShiftIds,
      "-start_date",
      { status: { $ne: "removed" } },
    ),
    enabled: !shiftsQuery.isLoading,
    placeholderData: previous => previous || [],
    staleTime: 10_000,
  });
  const personnelQuery = useQuery({
    queryKey: ["personnel"],
    queryFn: () => listAllEntityRecords(base44.entities.Personnel),
    staleTime: 60_000,
  });
  const eligibilityPersonnelIds = useMemo(
    () => (personnelQuery.data || []).filter(isPlanningPersonnelActive).map(item => String(item.id)).sort(),
    [personnelQuery.data],
  );
  const eligibilityPersonnelScopeKey = useMemo(
    () => shortPlanningVersionToken(eligibilityPersonnelIds.join("|")),
    [eligibilityPersonnelIds],
  );
  const qualificationsQuery = useQuery({
    queryKey: ["personnel-qualifications", eligibilityPersonnelScopeKey],
    queryFn: () => filterEntityRecordsForPersonnelIds(
      base44.entities.PersonnelQualification,
      eligibilityPersonnelIds,
      "-updated_date",
    ),
    enabled: !personnelQuery.isLoading,
    staleTime: 60_000,
  });
  const absencesQuery = useQuery({
    queryKey: ["personnel-absences", eligibilityPersonnelScopeKey, planningContextStart, planningContextEnd],
    queryFn: () => filterEntityRecordsForPersonnelIds(
      base44.entities.PersonnelAbsence,
      eligibilityPersonnelIds,
      "-start_date",
      { status: { $in: ["requested", "approved", "active"] } },
    ),
    enabled: !personnelQuery.isLoading,
    staleTime: 30_000,
  });
  const passesQuery = useQuery({
    queryKey: ["personnel-security-passes", eligibilityPersonnelScopeKey],
    queryFn: () => filterEntityRecordsForPersonnelIds(
      base44.entities.PersonnelSecurityPass,
      eligibilityPersonnelIds,
      "-updated_date",
    ),
    enabled: !personnelQuery.isLoading,
    staleTime: 60_000,
  });
  const restrictionsQuery = useQuery({
    queryKey: ["personnel-restrictions", eligibilityPersonnelScopeKey],
    queryFn: () => filterEntityRecordsForPersonnelIds(
      base44.entities.PersonnelRestriction,
      eligibilityPersonnelIds,
      "-updated_date",
    ),
    enabled: !personnelQuery.isLoading,
    staleTime: 60_000,
  });
  const contractsQuery = useQuery({
    queryKey: ["personnel-contracts", eligibilityPersonnelScopeKey],
    queryFn: () => filterEntityRecordsForPersonnelIds(
      base44.entities.PersonnelContract,
      eligibilityPersonnelIds,
      "-updated_date",
    ),
    enabled: !personnelQuery.isLoading,
    staleTime: 60_000,
  });
  const objectsQuery = useQuery({
    queryKey: ["objects"],
    queryFn: () => listAllEntityRecords(base44.entities.SurveillanceObject),
    staleTime: 60_000,
  });
  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => listAllEntityRecords(base44.entities.Customer),
    staleTime: 60_000,
  });
  const routesQuery = useQuery({
    queryKey: ["routes"],
    queryFn: () => listAllEntityRecords(base44.entities.Route),
    staleTime: 60_000,
  });

  const refreshPlanning = async ({ includePublications = false, includeEligibility = false } = {}) => {
    // Shifts and assignments are themselves eligibility dependencies. Treat
    // every planning consistency pass as one atomic fact generation; otherwise
    // its separately completing queries can launch several obsolete server
    // checks before the final basis is known.
    const releaseEligibilityRefresh = beginEligibilityDependencyRefresh();
    const requests = [
      queryClient.invalidateQueries({ queryKey: ["planning-shifts"] }),
      queryClient.invalidateQueries({ queryKey: ["planning-assignments"] }),
      queryClient.invalidateQueries({ queryKey: ["planning-task-occurrences"] }),
      queryClient.invalidateQueries({ queryKey: ["planning-task-source-changes"] }),
      queryClient.invalidateQueries({ queryKey: ["planning-task-segments"] }),
    ];
    if (includePublications) {
      requests.push(queryClient.invalidateQueries({ queryKey: ["planning-publications"] }));
    }
    if (includeEligibility) {
      requests.push(
        queryClient.invalidateQueries({ queryKey: ["personnel"] }),
        queryClient.invalidateQueries({ queryKey: ["personnel-absences"] }),
        queryClient.invalidateQueries({ queryKey: ["personnel-qualifications"] }),
        queryClient.invalidateQueries({ queryKey: ["personnel-security-passes"] }),
        queryClient.invalidateQueries({ queryKey: ["personnel-restrictions"] }),
        queryClient.invalidateQueries({ queryKey: ["personnel-contracts"] }),
        queryClient.invalidateQueries({ queryKey: ["objects"] }),
      );
    }
    try {
      await boundedPlanningEligibilityPromise(Promise.all(requests));
    } finally {
      releaseEligibilityRefresh();
    }
  };
  refreshPlanningRef.current = refreshPlanning;

  useEffect(() => {
    const scheduler = createPlanningRefreshScheduler({
      refresh: options => refreshPlanningRef.current?.(options),
      // Mutation responses update the visible cache immediately. Delay the
      // consistency pass so rapid planning never turns into a refetch storm.
      delayMs: 8_000,
    });
    refreshScheduler.current = scheduler;
    return () => {
      scheduler.dispose();
      if (refreshScheduler.current === scheduler) refreshScheduler.current = null;
    };
  }, []);

  const reconcilePlanningResultForRange = (result, targetRange, options = {}) => {
    const acknowledgedShifts = [
      ...(Array.isArray(result?.shifts) ? result.shifts : []),
      result?.shift,
    ].filter(shift => shift?.id && Number.isFinite(Number(shift?.revision)));
    for (const shift of acknowledgedShifts) {
      eligibilityOwnAckSourceRevisionsRef.current.set(String(shift.id), {
        revision: Number(shift.revision),
        source: shift,
      });
    }
    while (eligibilityOwnAckSourceRevisionsRef.current.size > 256) {
      const oldestKey = eligibilityOwnAckSourceRevisionsRef.current.keys().next().value;
      eligibilityOwnAckSourceRevisionsRef.current.delete(oldestKey);
    }
    applyPlanningMutationResultToCache(queryClient, {
      periodStart: targetRange.periodStart,
      periodEnd: targetRange.periodEnd,
      result,
      ...options,
    });
  };

  const reconcilePlanningResult = (result, options = {}) => {
    reconcilePlanningResultForRange(result, { periodStart, periodEnd }, options);
  };

  const refreshPlanningInBackground = options => {
    refreshScheduler.current?.schedule(options);
  };

  const beginPlanningDragInteraction = () => {
    if (planningDragLifecycleRef.current.active) return;
    let resolveRelease;
    const promise = new Promise(resolve => {
      resolveRelease = resolve;
    });
    const scheduler = refreshScheduler.current;
    const schedulerState = scheduler?.getState?.() || {};
    const refreshWasInFlight = Boolean(schedulerState.inFlight);
    const planningQueryFilters = [
      { queryKey: ["planning-shifts"] },
      { queryKey: ["planning-assignments"] },
      { queryKey: ["planning-task-occurrences"] },
      { queryKey: ["planning-task-source-changes"] },
      { queryKey: ["planning-task-segments"] },
    ];
    const eligibilityQueryFilters = [
      { queryKey: ["personnel"] },
      { queryKey: ["personnel-absences"] },
      { queryKey: ["personnel-qualifications"] },
      { queryKey: ["personnel-security-passes"] },
      { queryKey: ["personnel-restrictions"] },
      { queryKey: ["personnel-contracts"] },
      { queryKey: ["objects"] },
    ];
    const planningQueryWasFetching = planningQueryFilters.some(filter => queryClient.isFetching(filter) > 0);
    const eligibilityQueryWasFetching = eligibilityQueryFilters.some(filter => queryClient.isFetching(filter) > 0);
    const flushAfterRelease = Boolean(
      refreshWasInFlight
      || schedulerState.scheduled
      || planningQueryWasFetching
      || eligibilityQueryWasFetching
    );
    const releaseEligibilityRefresh = eligibilityQueryWasFetching
      ? beginEligibilityDependencyRefresh()
      : null;
    const resumeRefresh = scheduler?.pause?.() || (() => undefined);
    planningDragLifecycleRef.current = {
      active: true,
      promise,
      resolve: resolveRelease,
      resumeRefresh,
      refreshWasInFlight,
      flushAfterRelease,
      releaseEligibilityRefresh,
      scheduler,
    };
    planningDragGestureActiveRef.current = true;
    setPlanningDragGestureActive(true);

    // QueryClient can refetch independently of our consistency scheduler
    // (window focus, stale dependencies, or an earlier direct invalidation).
    // Cancel every topology/candidate source unconditionally; a no-op cancel
    // is cheap, while a late response can unmount Pangea's active publisher.
    void Promise.allSettled(
      [...planningQueryFilters, ...eligibilityQueryFilters]
        .map(filter => queryClient.cancelQueries(filter)),
    );
    if (refreshWasInFlight || planningQueryWasFetching || eligibilityQueryWasFetching) {
      refreshPlanningInBackground({
        reason: "drag-cancelled-active-refresh",
        includeEligibility: eligibilityQueryWasFetching,
      });
    }
  };

  const finishPlanningDragInteraction = () => {
    const lifecycle = planningDragLifecycleRef.current;
    if (!lifecycle.active) return;
    planningDragLifecycleRef.current = {
      active: false,
      promise: Promise.resolve(),
      resolve: null,
      resumeRefresh: null,
      refreshWasInFlight: false,
      flushAfterRelease: false,
      releaseEligibilityRefresh: null,
      scheduler: null,
    };
    planningDragGestureActiveRef.current = false;
    setPlanningDragGestureActive(false);
    lifecycle.resolve?.();
    if (!lifecycle.flushAfterRelease) {
      lifecycle.resumeRefresh?.();
      lifecycle.releaseEligibilityRefresh?.();
      return;
    }
    // The drop is processed before this function is called. Keep consistency
    // refreshes paused until that write (or the pre-existing delete) has
    // settled, then run the coalesced refresh immediately rather than leaving
    // the eligibility handshake behind the normal eight-second delay.
    void planningMutationQueue.current.drain()
      .catch(() => null)
      .then(async () => {
        lifecycle.resumeRefresh?.();
        await lifecycle.scheduler?.flush?.();
      })
      .finally(() => lifecycle.releaseEligibilityRefresh?.());
  };

  const waitForPlanningDragRelease = () => (
    planningDragLifecycleRef.current.active
      ? planningDragLifecycleRef.current.promise
      : Promise.resolve()
  );
  beginPlanningInteractionRef.current = beginPlanningDragInteraction;
  finishPlanningInteractionRef.current = finishPlanningDragInteraction;

  useEffect(() => () => {
    const lifecycle = planningDragLifecycleRef.current;
    lifecycle.resolve?.();
    lifecycle.resumeRefresh?.();
    lifecycle.releaseEligibilityRefresh?.();
    planningDragLifecycleRef.current = {
      active: false,
      promise: Promise.resolve(),
      resolve: null,
      resumeRefresh: null,
      refreshWasInFlight: false,
      flushAfterRelease: false,
      releaseEligibilityRefresh: null,
      scheduler: null,
    };
    // Browser Back and programmatic React-Router navigation can unmount the
    // page without a link click. Clear the held drop before its outstanding
    // eligibility promise can settle; the global toaster keeps the
    // cancellation visible on the destination page.
    cancelHeldPlanningDrop(undefined, { updateState: false });
  }, [cancelHeldPlanningDrop]);

  const bootstrapMutation = useMutation({
    mutationFn: payload => invokePlanningApi(
      { action: "bootstrap_range", ...payload },
      { preferLatestFunctions: true },
    ),
    onSuccess: result => {
      refreshPlanningInBackground();
      if (
        result?.repaired_shared_boundary_occurrence_ids?.length
        || result?.repaired_single_task_occurrence_ids?.length
        || result?.resolved_task_source_change_ids?.length
        || result?.created_task_occurrence_ids?.length
        || result?.refreshed_task_occurrence_ids?.length
        || result?.superseded_task_occurrence_ids?.length
      ) {
        void refreshScheduler.current?.flush();
      }
    },
    onError: error => {
      toast({
        variant: "destructive",
        title: "Diensten konden niet worden voorbereid",
        description: mutationMessage(error),
      });
    },
  });

  const materializeTaskSchedulesInBackground = () => {
    taskMaterializationRequest.current = {
      period_start: bootstrapStart,
      period_end: periodEnd,
    };
    if (taskMaterializationRunning.current) return;
    taskMaterializationRunning.current = true;

    void (async () => {
      let completed = false;
      try {
        while (taskMaterializationRequest.current) {
          const payload = taskMaterializationRequest.current;
          taskMaterializationRequest.current = null;
          await bootstrapMutation.mutateAsync(payload);
          completed = true;
        }
      } catch {
        // bootstrapMutation.onError already reports the background failure.
      } finally {
        taskMaterializationRunning.current = false;
      }
      if (completed) await refreshScheduler.current?.flush();
      if (taskMaterializationRequest.current) materializeTaskSchedulesInBackground();
    })();
  };

  useEffect(() => {
    const key = `${bootstrapStart}:${periodEnd}`;
    if (lastBootstrapKey.current === key) return;
    lastBootstrapKey.current = key;
    bootstrapMutation.mutate({ period_start: bootstrapStart, period_end: periodEnd });
    // The mutation identity changes between renders; the range key is the intended trigger.
  }, [bootstrapStart, periodEnd]);

  useEffect(() => {
    if (bootstrapRecoveryTimer.current) {
      globalThis.clearTimeout(bootstrapRecoveryTimer.current);
      bootstrapRecoveryTimer.current = null;
    }
    const pendingRepairs = bootstrapMutation.data?.pending_shared_boundary_repairs || [];
    if (bootstrapMutation.isPending || pendingRepairs.length === 0) return undefined;
    const delay = getSharedBoundaryRepairRetryDelay(pendingRepairs);
    bootstrapRecoveryTimer.current = globalThis.setTimeout(() => {
      bootstrapRecoveryTimer.current = null;
      bootstrapMutation.mutate({ period_start: bootstrapStart, period_end: periodEnd });
    }, delay);
    return () => {
      if (!bootstrapRecoveryTimer.current) return;
      globalThis.clearTimeout(bootstrapRecoveryTimer.current);
      bootstrapRecoveryTimer.current = null;
    };
  }, [bootstrapMutation.data, bootstrapMutation.isPending, bootstrapMutation.mutate, bootstrapStart, periodEnd]);

  const effectivePlanningRecords = useMemo(() => resolveEffectiveSharedBoundaryPlanning({
    shifts: shiftsQuery.data || [],
    assignments: assignmentsQuery.data || [],
    occurrences: taskOccurrencesQuery.data || [],
    segments: taskSegmentsQuery.data || [],
  }), [assignmentsQuery.data, shiftsQuery.data, taskOccurrencesQuery.data, taskSegmentsQuery.data]);
  const authoritativeShifts = useMemo(
    () => effectivePlanningRecords.shifts.map(normalizePlanningShift),
    [effectivePlanningRecords.shifts],
  );
  const authoritativeAssignments = useMemo(
    () => effectivePlanningRecords.assignments.map(normalizePlanningAssignment),
    [effectivePlanningRecords.assignments],
  );
  const authoritativeTaskOccurrences = effectivePlanningRecords.occurrences;
  const authoritativeTaskSegments = effectivePlanningRecords.segments;
  const interactivePlanningRecords = useMemo(() => buildEffectivePlanningPlan({
    shifts: authoritativeShifts,
    assignments: authoritativeAssignments,
    segments: authoritativeTaskSegments,
    occurrences: authoritativeTaskOccurrences,
    intents: [...pendingMatrixChanges, ...(planningQueueState.intents || [])],
  }), [authoritativeAssignments, authoritativeShifts, authoritativeTaskOccurrences, authoritativeTaskSegments, pendingMatrixChanges, planningQueueState.intents]);
  const allShifts = interactivePlanningRecords.shifts;
  const assignments = interactivePlanningRecords.assignments;
  const taskOccurrences = interactivePlanningRecords.occurrences;
  const taskSegments = useMemo(
    () => projectSegmentsToCurrentTaskOccurrences(interactivePlanningRecords.segments, taskOccurrences),
    [interactivePlanningRecords.segments, taskOccurrences],
  );
  const openTaskSourceChanges = useMemo(() => (taskSourceChangesQuery.data || []).filter(change => (
    change.status === "open"
    && String(change.service_date || change.effective_from || "") >= periodStart
    && String(change.service_date || change.effective_from || "") <= periodEnd
  )), [periodEnd, periodStart, taskSourceChangesQuery.data]);
  const sourceChangesByOccurrence = useMemo(() => {
    const grouped = new Map();
    openTaskSourceChanges.forEach(change => {
      const occurrenceIds = [...new Set([
        change.source_task_occurrence_id,
        change.task_occurrence_id,
        change.occurrence_id,
        change.replacement_task_occurrence_id,
      ].filter(Boolean).map(String))];
      occurrenceIds.forEach(occurrenceId => {
        grouped.set(occurrenceId, [...(grouped.get(occurrenceId) || []), change]);
      });
    });
    return grouped;
  }, [openTaskSourceChanges]);
  const sourceChangesByShift = useMemo(() => {
    const grouped = new Map();
    openTaskSourceChanges.forEach(change => {
      const shiftIds = [...new Set([change.shift_id, ...(change.shift_ids || [])].filter(Boolean).map(String))];
      shiftIds.forEach(shiftId => grouped.set(shiftId, [...(grouped.get(shiftId) || []), change]));
    });
    return grouped;
  }, [openTaskSourceChanges]);
  const matrixPendingResourceKeys = useMemo(() => new Set([
    ...pendingResourceKeys,
    ...effectivePlanningRecords.pendingResourceKeys,
  ]), [effectivePlanningRecords.pendingResourceKeys, pendingResourceKeys]);
  const queuedPlanningResourceKeys = useMemo(
    () => new Set(planningQueueState.resourceKeys || []),
    [planningQueueState.resourceKeys],
  );
  const protectedPlanningResourceKeys = useMemo(() => new Set([
    ...matrixPendingResourceKeys,
    ...queuedPlanningResourceKeys,
  ]), [matrixPendingResourceKeys, queuedPlanningResourceKeys]);
  const runProtectedPlanningAction = (resourceKeys, action, { allowQueued = false } = {}) => {
    const blockingKeys = allowQueued ? matrixPendingResourceKeys : protectedPlanningResourceKeys;
    const blocked = Boolean(planningCommitFenceRef.current)
      || (resourceKeys || []).filter(Boolean).some(key => blockingKeys.has(String(key)));
    if (!blocked) return action();
    const description = allowQueued
      ? "Deze taak of dienst wordt door een herstel- of publicatieactie vergrendeld. Probeer het opnieuw zodra die actie klaar is."
      : "Deze taak of dienst wordt nog gesynchroniseerd. Wacht tot de rustige synchronisatiestatus is verdwenen voordat u haar bewerkt of verwijdert.";
    toast({ title: "Wijziging wordt nog verwerkt", description });
    setLiveMessage(description);
    return null;
  };
  const pendingBoundaryRecoveryKey = [...effectivePlanningRecords.pendingOccurrenceIds]
    .map(String)
    .sort()
    .join("|");
  useEffect(() => {
    if (!pendingBoundaryRecoveryKey) {
      lastBoundaryRecoveryKey.current = "";
      return;
    }
    if (bootstrapMutation.isPending) return;
    const key = `${bootstrapStart}:${periodEnd}:${pendingBoundaryRecoveryKey}`;
    if (lastBoundaryRecoveryKey.current === key) return;
    lastBoundaryRecoveryKey.current = key;
    bootstrapMutation.mutate({ period_start: bootstrapStart, period_end: periodEnd });
  }, [bootstrapMutation.isPending, bootstrapMutation.mutate, bootstrapStart, pendingBoundaryRecoveryKey, periodEnd]);
  const personnel = personnelQuery.data || [];
  const qualifications = qualificationsQuery.data || [];
  const absences = absencesQuery.data || [];
  const securityPasses = passesQuery.data || [];
  const restrictions = restrictionsQuery.data || [];
  const contracts = contractsQuery.data || [];
  const objects = objectsQuery.data || [];
  const customers = customersQuery.data || [];
  const routes = routesQuery.data || [];
  const { objectsById } = useMemo(() => makeMaps(objects, customers), [objects, customers]);

  const shiftsInRange = useMemo(() => allShifts.filter(shift => (
    shift.status !== "cancelled"
    && planningShiftOverlapsRange(shift, periodStart, periodEnd)
  )), [allShifts, periodEnd, periodStart]);
  const shiftsInRangeById = useMemo(
    () => new Map(shiftsInRange.map(shift => [String(shift.id), shift])),
    [shiftsInRange],
  );
  const ownedShiftsInRange = useMemo(() => shiftsInRange.filter(shift => (
    planningShiftOwnedByRange(shift, periodStart, periodEnd)
  )), [periodEnd, periodStart, shiftsInRange]);
  const shiftIdsInRange = useMemo(() => new Set(shiftsInRange.map(shift => String(shift.id))), [shiftsInRange]);
  const assignmentsInRange = useMemo(() => assignments.filter(item => shiftIdsInRange.has(String(item.planning_shift_id))), [assignments, shiftIdsInRange]);
  const activeAssignmentsInRange = useMemo(() => activeAssignments(assignmentsInRange), [assignmentsInRange]);
  const assignmentsInRangeByShift = useMemo(() => {
    const grouped = new Map();
    activeAssignmentsInRange.forEach(assignment => {
      const key = String(assignment.planning_shift_id || assignment.shift_id);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(assignment);
    });
    return grouped;
  }, [activeAssignmentsInRange]);
  const activeTaskSegmentsByShift = useMemo(() => {
    const grouped = new Map();
    taskSegments.filter(item => item.status !== "removed").forEach(segment => {
      const key = String(segment.shift_id);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(segment);
    });
    return grouped;
  }, [taskSegments]);
  const activeTaskSegmentsByOccurrence = useMemo(() => {
    const grouped = new Map();
    taskSegments.filter(item => item.status !== "removed").forEach(segment => {
      const key = String(segment.task_occurrence_id);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(segment);
    });
    return grouped;
  }, [taskSegments]);
  const ownedShiftIdsInRange = useMemo(() => new Set(ownedShiftsInRange.map(shift => String(shift.id))), [ownedShiftsInRange]);
  const ownedAssignmentsInRange = useMemo(() => assignmentsInRange.filter(item => (
    ownedShiftIdsInRange.has(String(item.planning_shift_id))
  )), [assignmentsInRange, ownedShiftIdsInRange]);
  const taskOccurrencesInRange = useMemo(() => taskOccurrences.filter(item => (
    item.lifecycle_status === "active"
    && planningTaskOccurrenceOverlapsRange(item, periodStart, periodEnd)
  )), [periodEnd, periodStart, taskOccurrences]);
  const ownedTaskOccurrencesInRange = useMemo(() => taskOccurrencesInRange.filter(item => (
    item.service_date >= periodStart && item.service_date <= periodEnd
  )), [periodEnd, periodStart, taskOccurrencesInRange]);
  const occurrencePlanningStates = useMemo(() => new Map(taskOccurrencesInRange.map(occurrence => [
    String(occurrence.id),
    (() => {
      const occurrenceSegments = activeTaskSegmentsByOccurrence.get(String(occurrence.id)) || [];
      const occurrenceShifts = [...new Set(occurrenceSegments.map(item => String(item.shift_id)))]
        .map(id => shiftsInRangeById.get(id))
        .filter(Boolean);
      return getOccurrencePlanningState({
        occurrence,
        segments: occurrenceSegments,
        shifts: occurrenceShifts,
        assignments: occurrenceShifts.flatMap(shift => assignmentsInRangeByShift.get(String(shift.id)) || []),
      });
    })(),
  ])), [activeTaskSegmentsByOccurrence, assignmentsInRangeByShift, shiftsInRangeById, taskOccurrencesInRange]);
  const visibleTaskOccurrences = useMemo(() => taskOccurrencesInRange.filter(item => {
    if (customerFilter.length > 0 && !customerFilter.includes(String(item.customer_id))) return false;
    if (objectFilter.length > 0 && !objectFilter.includes(String(item.object_id))) return false;
    if (taskTypeFilter.length > 0 && !taskTypeFilter.includes(String(item.task_type))) return false;
    const state = occurrencePlanningStates.get(String(item.id));
    const hasSourceChange = (sourceChangesByOccurrence.get(String(item.id)) || []).length > 0;
    if (statusFilter === "open") return state?.readiness === "unplanned";
    if (statusFilter === "partial") return state?.readiness === "needs_staffing";
    if (statusFilter === "vacant") return state?.readiness !== "ready";
    if (statusFilter === "draft") return state?.linkedShiftIds.some(shiftId => {
      const shift = shiftsInRangeById.get(String(shiftId));
      return shift?.status === "draft" || (assignmentsInRangeByShift.get(String(shiftId)) || [])
        .some(assignment => assignment.status === "draft");
    });
    if (statusFilter === "planned") return state?.readiness === "ready" && !hasSourceChange;
    if (statusFilter === "published") return state?.readiness === "ready"
      && !hasSourceChange
      && state.linkedShiftIds.length > 0
      && state.linkedShiftIds.every(shiftId => (
        shiftsInRangeById.get(String(shiftId))?.status === "published"
      ));
    if (statusFilter === "warnings") {
      if (hasSourceChange) return true;
      if (!item.security_plan_revision_id || !item.security_plan_snapshot?.published_revision) return true;
      return state?.linkedShiftIds.some(shiftId => (
        assignmentsInRangeByShift.get(String(shiftId)) || []
      ).some(assignment => assignmentWarnings(assignment).length > 0));
    }
    return true;
  }), [assignmentsInRangeByShift, customerFilter, objectFilter, occurrencePlanningStates, shiftsInRangeById, sourceChangesByOccurrence, statusFilter, taskOccurrencesInRange, taskTypeFilter]);
  const visibleWorkQueueCount = useMemo(() => visibleTaskOccurrences.filter(occurrence => (
    occurrencePlanningStates.get(String(occurrence.id))?.readiness !== "ready"
    || (sourceChangesByOccurrence.get(String(occurrence.id)) || []).length > 0
  )).length, [occurrencePlanningStates, sourceChangesByOccurrence, visibleTaskOccurrences]);

  const filteredShifts = useMemo(() => shiftsInRange.filter(shift => {
      const object = objectsById.get(String(shift.object_id || ""));
      const shiftSegments = activeTaskSegmentsByShift.get(String(shift.id)) || [];
      if (customerFilter.length > 0) {
        const shiftCustomerIds = new Set([
          shift.customer_id,
          object?.customer_id,
          ...(shift.customer_ids || []),
          ...shiftSegments.map(item => item.customer_id),
        ].filter(Boolean).map(String));
        if (!customerFilter.some(id => shiftCustomerIds.has(id))) return false;
      }
      if (objectFilter.length > 0) {
        const shiftObjectIds = new Set([
          shift.object_id,
          ...(shift.object_ids || []),
          ...shiftSegments.map(item => item.object_id),
        ].filter(Boolean).map(String));
        if (!objectFilter.some(id => shiftObjectIds.has(id))) return false;
      }
      if (taskTypeFilter.length > 0 && !shiftSegments.some(item => taskTypeFilter.includes(String(item.task_type)))) return false;
      const shiftAssignments = assignmentsInRangeByShift.get(String(shift.id)) || [];
      const required = Math.max(1, Number(shift.required_count || 1));
      const warnings = shiftAssignments.flatMap(assignmentWarnings);
      const compositionWarnings = Array.isArray(shift.service_context_snapshot?.composition_warnings)
        ? shift.service_context_snapshot.composition_warnings
        : [];
      if (statusFilter === "vacant" && shiftAssignments.length >= required) return false;
      if (statusFilter === "draft" && shift.status !== "draft" && !shiftAssignments.some(item => item.status === "draft")) return false;
      if (statusFilter === "warnings" && warnings.length + compositionWarnings.length === 0 && !(sourceChangesByShift.get(String(shift.id)) || []).length) return false;
      if (statusFilter === "published" && shift.status !== "published") return false;
      return true;
    }), [
    activeTaskSegmentsByShift,
    assignmentsInRangeByShift,
    customerFilter,
    objectFilter,
    objectsById,
    taskTypeFilter,
    shiftsInRange,
    sourceChangesByShift,
    statusFilter,
  ]);
  const matrixShifts = useMemo(
    () => annotateSourceChangedShifts(filteredShifts, sourceChangesByShift),
    [filteredShifts, sourceChangesByShift],
  );
  const matrixCoverageShifts = useMemo(
    () => annotateSourceChangedShifts(shiftsInRange, sourceChangesByShift),
    [shiftsInRange, sourceChangesByShift],
  );
  const matrixAssignments = assignmentsInRange;
  const matrixSegments = taskSegments;

  const selectedShift = useMemo(
    () => allShifts.find(shift => String(shift.id) === String(selectedShiftId)) || null,
    [allShifts, selectedShiftId],
  );
  useEffect(() => {
    if (!selectedShiftId) return;
    const remainsVisible = filteredShifts.some(shift => String(shift.id) === String(selectedShiftId));
    if (!remainsVisible) setSelectedShiftId(null);
  }, [filteredShifts, selectedShiftId]);
  const activePersonnel = useMemo(() => personnel.filter(isPlanningPersonnelActive), [personnel]);
  const matrixObjects = useMemo(() => objects.filter(object => {
    if (customerFilter.length > 0 && !customerFilter.includes(String(object.customer_id))) return false;
    if (objectFilter.length > 0 && !objectFilter.includes(String(object.id))) return false;
    return true;
  }), [customerFilter, objectFilter, objects]);
  const personnelPlanningSummaries = useMemo(() => {
    const scheduledMinutes = new Map();
    activeAssignmentsInRange.forEach(assignment => {
      const shift = shiftsInRangeById.get(String(assignment.planning_shift_id || assignment.shift_id));
      if (!shift) return;
      const interval = getShiftInterval(shift);
      const minutes = interval.valid
        ? Math.max(0, (interval.end.getTime() - interval.start.getTime()) / 60000)
        : Math.max(0, Number(shift.duration_minutes || 0));
      const key = String(assignment.personnel_id);
      scheduledMinutes.set(key, (scheduledMinutes.get(key) || 0) + minutes);
    });
    return new Map(activePersonnel.map(item => {
      const employeeContracts = contracts.filter(contract => String(contract.personnel_id) === String(item.id));
      const contract = employeeContracts.find(entry => entry.is_current !== false && !["archived", "expired"].includes(entry.document_status))
        || employeeContracts[0]
        || null;
      return [String(item.id), {
        scheduledHours: (scheduledMinutes.get(String(item.id)) || 0) / 60,
        contractHoursPerWeek: contract?.contract_hours_per_week,
        contractHoursPerPayPeriod: contract?.contract_hours_per_pay_period || contract?.fixed_hours_per_pay_period,
        contractForm: contract?.contract_form,
        functionLabel: contract?.cao_function_group || contract?.function_type,
      }];
    }));
  }, [activeAssignmentsInRange, activePersonnel, contracts, shiftsInRangeById]);
  const matrixPersonnel = useMemo(() => activePersonnel.map(item => ({
    ...item,
    _planning_summary: personnelPlanningSummaries.get(String(item.id)),
  })), [activePersonnel, personnelPlanningSummaries]);

  const warningContext = useMemo(() => ({
    assignments,
    shifts: allShifts,
    absences,
    qualifications,
    securityPasses,
    restrictions,
    contracts,
  }), [absences, allShifts, assignments, contracts, qualifications, restrictions, securityPasses]);

  const eligibilityDependencyVersions = useMemo(() => ({
    personnel: planningEligibilityRecordsVersion(activePersonnel, item => [
      item.id,
      item.revision || item.version || item.updated_date,
      item.status,
      item.is_active,
      item.available_for_planning,
      item.planning_available,
      item.wpbr_status,
      item.cao_function_group,
      item.function_type,
      item.employee_type,
    ]),
    // Planning ACKs often change only a technical revision/metadata marker.
    // Eligibility depends on the semantic interval and active staffing state;
    // using those fields keeps an optimistic delete and its equivalent ACK on
    // one basis while still invalidating every real schedule change.
    shifts: planningEligibilityRecordsVersion(
      allShifts.filter(item => item.status !== "cancelled"),
      item => [
        item.id,
        item.status,
        item.service_date,
        item.end_date,
        item.start_time,
        item.end_time,
        item.company_id,
        item.customer_id,
        item.object_id,
        item.route_id,
        item.task_id,
        item.required_count,
        item.cao_key,
        item.service_function_type,
        item.required_cao_function_group,
        item.required_cao_function_level,
        item.required_security_role_status,
        item.required_qualification_types,
        item.required_qualification_groups,
        item.required_security_pass_types,
      ],
    ),
    assignments: planningEligibilityRecordsVersion(
      activeAssignments(assignments),
      item => [
        item.id,
        item.status,
        item.personnel_id,
        item.planning_shift_id || item.shift_id,
        item.slot_index,
      ],
    ),
    absences: planningEligibilityRecordsVersion(absences, item => [
      item.id,
      item.revision || item.version || item.updated_date,
      item.personnel_id,
      item.status,
      item.absence_type,
      item.start_date,
      item.end_date,
    ]),
    qualifications: planningEligibilityRecordsVersion(qualifications, item => [
      item.id,
      item.revision || item.version || item.updated_date,
      item.personnel_id,
      item.status,
      item.qualification_type,
      item.qualification_group,
      item.valid_from,
      item.valid_until,
    ]),
    securityPasses: planningEligibilityRecordsVersion(securityPasses, item => [
      item.id,
      item.revision || item.version || item.updated_date,
      item.personnel_id,
      item.company_id,
      item.status,
      item.pass_type,
      item.valid_from,
      item.valid_until,
    ]),
    restrictions: planningEligibilityRecordsVersion(restrictions, item => [
      item.id,
      item.revision || item.version || item.updated_date,
      item.personnel_id,
      item.status,
      item.scope_type,
      item.scope_id,
      item.scope_label,
      item.valid_from,
      item.valid_until,
    ]),
    contracts: planningEligibilityRecordsVersion(contracts, item => [
      item.id,
      item.revision || item.version || item.updated_date,
      item.personnel_id,
      item.status,
      item.company_id,
      item.cao_key,
      item.valid_from,
      item.valid_until,
      item.contract_form,
      item.contract_hours_per_week,
      item.contract_hours_per_pay_period,
      item.cao_function_group,
      item.cao_function_level,
    ]),
    objects: planningEligibilityRecordsVersion(objects, item => [
      item.id,
      item.revision || item.version || item.updated_date,
      ...Object.values(buildPlanningEligibilityObjectShiftContext({ object: item })),
    ]),
  }), [
    absences,
    activePersonnel,
    allShifts,
    assignments,
    contracts,
    objects,
    qualifications,
    restrictions,
    securityPasses,
  ]);
  const eligibilityDependencies = useMemo(() => {
    const dependency = (query, version) => ({
      status: query.status,
      hasData: query.data !== undefined,
      dataUpdatedAt: query.dataUpdatedAt,
      error: query.error,
      version,
    });
    return {
      personnel: dependency(personnelQuery, eligibilityDependencyVersions.personnel),
      shifts: dependency(shiftsQuery, eligibilityDependencyVersions.shifts),
      assignments: dependency(assignmentsQuery, eligibilityDependencyVersions.assignments),
      absences: dependency(absencesQuery, eligibilityDependencyVersions.absences),
      qualifications: dependency(qualificationsQuery, eligibilityDependencyVersions.qualifications),
      securityPasses: dependency(passesQuery, eligibilityDependencyVersions.securityPasses),
      restrictions: dependency(restrictionsQuery, eligibilityDependencyVersions.restrictions),
      contracts: dependency(contractsQuery, eligibilityDependencyVersions.contracts),
      objects: dependency(objectsQuery, eligibilityDependencyVersions.objects),
    };
  }, [
    absencesQuery,
    assignmentsQuery,
    contractsQuery,
    eligibilityDependencyVersions,
    passesQuery,
    personnelQuery,
    qualificationsQuery,
    restrictionsQuery,
    shiftsQuery,
    objectsQuery,
  ]);
  const eligibilityIndex = useMemo(() => createPlanningEligibilityIndex({
    personnel: activePersonnel,
    shifts: allShifts,
    assignments,
    absences,
    qualifications,
    securityPasses,
    restrictions,
    contracts,
    dependencies: eligibilityDependencies,
    serverDecisions: eligibilityServerDecisions,
    requireServerDecision: true,
    maxAgeMs: PLANNING_ELIGIBILITY_MAX_AGE_MS,
  }), [
    absences,
    activePersonnel,
    allShifts,
    assignments,
    contracts,
    eligibilityDependencies,
    eligibilityFreshnessTick,
    eligibilityServerDecisions,
    qualifications,
    restrictions,
    securityPasses,
  ]);
  eligibilityIndexRef.current = eligibilityIndex;
  eligibilityServerDecisionsRef.current = eligibilityServerDecisions;

  const eligibilityPlanningSnapshot = useMemo(() => ({
    shifts: allShifts,
    assignments,
    segments: taskSegments,
    occurrences: taskOccurrences,
  }), [allShifts, assignments, taskOccurrences, taskSegments]);
  eligibilityPlanningSnapshotRef.current = eligibilityPlanningSnapshot;
  const eligibilityPrefetchSources = useMemo(() => {
    const openShiftSources = matrixShifts
      .filter(shift => shift.status !== "cancelled")
      .filter(shift => (
        (assignmentsInRangeByShift.get(String(shift.id)) || []).length
        < Math.max(1, Number(shift.required_count || 1))
      ))
      .map(shift => ({
        kind: "shift",
        id: shift.id,
        revision: Number(shift.revision || 1),
        serviceDate: shift.service_date,
        endDate: shift.end_date || shift.service_date,
        startTime: shift.start_time,
        endTime: shift.end_time,
        shift,
      }));
    const occurrenceSources = visibleTaskOccurrences.flatMap(occurrence => {
      const serviceDate = occurrence.service_date;
      const allocation = getSuggestedTaskTimelineAllocation({
        occurrence,
        serviceDate,
        segments: taskSegments,
        shifts: shiftsInRange,
      });
      if (!allocation?.segment) return [];
      const object = objectsById.get(String(occurrence.object_id || ""));
      const shiftContext = buildPlanningEligibilityObjectShiftContext({ object, occurrence });
      const previewShift = buildOccurrenceEligibilityShift({
        occurrence,
        serviceDate,
        startTime: allocation.segment.start_time,
        endTime: allocation.segment.end_time,
        shiftContext,
      });
      if (!previewShift) return [];
      return [{
        kind: "occurrence",
        id: occurrence.id,
        revision: Number(occurrence.revision || 1),
        serviceDate: allocation.segment.start_date,
        endDate: allocation.segment.end_date,
        startTime: allocation.segment.start_time,
        endTime: allocation.segment.end_time,
        occurrence,
        shiftContext,
        shift: previewShift,
        preferredSegment: allocation.segment,
      }];
    });
    return [...openShiftSources, ...occurrenceSources]
      .sort((left, right) => (
        String(left.serviceDate).localeCompare(String(right.serviceDate))
        || String(left.startTime).localeCompare(String(right.startTime))
        || String(left.id).localeCompare(String(right.id))
      ))
      .slice(0, 16);
  }, [
    assignmentsInRangeByShift,
    matrixShifts,
    objectsById,
    shiftsInRange,
    taskSegments,
    visibleTaskOccurrences,
  ]);
  const buildEligibilityPrefetchCandidates = useCallback(personnelItems => (
    eligibilityPrefetchSources.flatMap(source => (personnelItems || []).flatMap(personnelItem => {
      const occurrenceProjection = source.kind === "occurrence"
        ? resolveOccurrenceEligibilityProjection({
            snapshot: eligibilityPlanningSnapshot,
            occurrence: source.occurrence,
            personnelItem,
            serviceDate: source.serviceDate,
            preferredSegment: source.preferredSegment,
            shiftContext: source.shiftContext,
          })
        : null;
      const openShiftMerge = source.kind === "shift"
        ? resolveOpenShiftSamePersonnelMerge({
            snapshot: eligibilityPlanningSnapshot,
            targetShift: source.shift,
            personnelId: personnelItem.id,
          })
        : null;
      const candidateShift = occurrenceProjection?.shift || (openShiftMerge?.status === "merge" ? {
        ...openShiftMerge.candidate.shift,
        service_date: openShiftMerge.candidate.mergedSegment.start_date,
        end_date: openShiftMerge.candidate.mergedSegment.end_date,
        start_time: openShiftMerge.candidate.mergedSegment.start_time,
        end_time: openShiftMerge.candidate.mergedSegment.end_time,
      } : source.kind === "shift" ? source.shift : null);
      if (!candidateShift) return [];
      const excludeAssignmentId = occurrenceProjection?.excludeAssignmentId
        || (openShiftMerge?.status === "merge" ? openShiftMerge.candidate.assignment.id : null);
      const candidateSource = source.kind === "occurrence"
        ? source.occurrence
        : openShiftMerge?.status === "merge"
          ? openShiftMerge.candidate.shift
          : source.shift;
      if (candidateSource?._optimistic_pending) return [];
      const candidate = buildPlanningEligibilityPrefetchCandidate({
        kind: source.kind,
        source: candidateSource,
        shift: candidateShift,
        personnelId: personnelItem.id,
        occurrenceId: source.kind === "occurrence" ? source.id : null,
        excludeAssignmentId,
      });
      return candidate ? [candidate] : [];
    }))
  ), [eligibilityPlanningSnapshot, eligibilityPrefetchSources]);
  const backgroundEligibilityCandidates = useMemo(
    () => buildEligibilityPrefetchCandidates(activePersonnel.slice(0, 20)).slice(0, 320),
    [activePersonnel, buildEligibilityPrefetchCandidates],
  );
  const requestEligibilityPrefetch = useCallback(async ({
    candidates,
    basisToken,
    generation = null,
    priority = "background",
    timeoutMs = PLANNING_ELIGIBILITY_REQUEST_TIMEOUT_MS,
  }) => {
    if (!candidates.length) return;
    const batches = batchPlanningEligibilityCandidates(candidates);
    let cursor = 0;
    const backgroundRequestMayContinue = () => (
      priority !== "background"
      || (
        eligibilityBackgroundPrefetchGenerationRef.current === generation
        && planningMutationQueue.current.getSnapshot().isIdle
        && !planningDragGestureActiveRef.current
        && !planningResizeGestureActiveRef.current
        && !eligibilityDependencyRefreshActiveRef.current
        && eligibilityUrgentPrefetchKeysRef.current.size === 0
      )
    );
    const worker = async () => {
      while (cursor < batches.length) {
        // Low-priority matrix warming yields immediately to a real planning
        // write. Exact drag/hover requests remain urgent and are never gated.
        if (!backgroundRequestMayContinue()) return;
        let batch = batches[cursor];
        cursor += 1;
        let backgroundRequestKeys = [];
        if (priority === "background") {
          const selection = selectPlanningEligibilityRequestCandidates({
            candidates: batch,
            decisions: eligibilityServerDecisionsRef.current,
            basisToken,
            pendingRequestKeys: eligibilityUrgentPrefetchKeysRef.current,
            // Refresh before the server proof expires, but keep the current
            // proof visible until its real expiry if warming fails.
            now: Date.now() + PLANNING_ELIGIBILITY_PREFETCH_LEAD_MS,
          });
          if (selection.status !== "started") continue;
          batch = [...selection.candidates];
          backgroundRequestKeys = [...selection.requestKeys];
          backgroundRequestKeys.forEach(key => eligibilityUrgentPrefetchKeysRef.current.add(key));
        }
        let results;
        let releaseBackgroundSlot = null;
        try {
          if (
            priority === "background"
            && eligibilityBackgroundRequestGateRef.current.hasCurrentBackgroundBatch()
          ) return;
          if (priority === "background") {
            releaseBackgroundSlot = eligibilityUrgentRequestGateRef.current.acquire();
            if (!releaseBackgroundSlot) return;
          }
          const request = boundedPlanningEligibilityPromise(invokePlanningApi({
            action: "prefetch_assignment_eligibility",
            basis_token: basisToken,
            candidates: batch.map(({ _local, ...candidate }) => candidate),
          }), timeoutMs);
          const response = priority === "background"
            ? await eligibilityBackgroundRequestGateRef.current.trackBackgroundBatch(request)
            : await request;
          results = (response?.results || []).map(item => ({
            ...item,
            basis_token: item.basis_token || response.basis_token,
            expires_at: item.expires_at || response.expires_at,
          }));
          if (priority === "background") eligibilityBackgroundRetryAtRef.current = 0;
        } catch {
          if (priority === "background") {
            // Background warming is best-effort. Do not replace a still-valid
            // ready proof with a speculative unavailable result; the expiry
            // watchdog will retry or fail closed at the real deadline.
            results = [];
            eligibilityBackgroundRetryAtRef.current = Date.now() + 5_000;
          } else {
            const evaluatedAt = new Date().toISOString();
            const expiresAt = new Date(Date.now() + 15_000).toISOString();
            results = batch.map(candidate => ({
              candidate_key: candidate.candidate_key,
              personnel_id: candidate.personnel_id,
              status: "unavailable",
              basis_token: basisToken,
              evaluated_at: evaluatedAt,
              expires_at: expiresAt,
              warning_snapshot: [],
            }));
          }
        } finally {
          releaseBackgroundSlot?.();
          backgroundRequestKeys.forEach(key => eligibilityUrgentPrefetchKeysRef.current.delete(key));
          if (priority === "background") {
            // The visible candidate set may have changed while this batch was
            // in flight. Re-run cold-key selection after releasing the shared
            // single-flight keys so newly visible work cannot remain stranded.
            setEligibilityFreshnessTick(value => value + 1);
          }
        }
        // A planning write that started while this one bounded facts batch was
        // in flight does not invalidate its static result. Keep that work, but
        // do not start another background batch until the interactive lane is
        // idle again. Only a changed facts basis makes the response obsolete.
        if (
          priority === "background"
          && eligibilityIndexRef.current?.basisToken !== basisToken
        ) return;
        if (results.length) {
          const retainReadySourceRevisionKeys = new Set(results.flatMap(result => {
            if (
              result?.status !== "stale"
              || !(result?.warning_codes || []).includes("eligibility_source_revision_stale")
              || result?.source?.kind !== "shift"
            ) return [];
            const requested = batch.find(candidate => candidate.candidate_key === result.candidate_key);
            const currentSource = (eligibilityPlanningSnapshotRef.current?.shifts || []).find(shift => (
              String(shift.id) === String(result.source?.id)
            ));
            const ownAcknowledgement = eligibilityOwnAckSourceRevisionsRef.current.get(
              String(result.source?.id || ""),
            );
            if (
              !requested?._local?.source
              || !planningEligibilityOwnSourceRevisionMatches(
                ownAcknowledgement,
                result.source,
                currentSource,
              )
              || !planningEligibilitySourceSemanticsEqual(requested._local.source, currentSource)
            ) return [];
            return [`${basisToken}\u0000${result.candidate_key}`];
          }));
          setEligibilityServerDecisions(current => {
            return mergePlanningEligibilityServerDecisions(current, results, {
              retainReadySourceRevisionKeys,
            });
          });
        }
      }
    };
    if (priority === "background") await worker();
    else await Promise.all([worker(), worker()]);
  }, []);
  const requestUrgentEligibilityCandidates = useCallback((candidates, {
    forceRetry = false,
    timeoutMs = PLANNING_ELIGIBILITY_REQUEST_TIMEOUT_MS,
  } = {}) => {
    if (eligibilityDependencyRefreshActiveRef.current) return "blocked";
    // Server evidence now contains only personnel/CAO/context facts. An
    // unrelated planning write cannot invalidate those facts, so it must not
    // stop a second drag. Only wait when the exact source is being rewritten:
    // that source may not yet exist on the server or may receive a new
    // semantic interval before the eligibility request starts.
    const queueResourceKeys = planningMutationQueue.current.getSnapshot().resourceKeys;
    const stableSourceCandidates = candidates.filter(candidate => (
      !planningEligibilityCandidateHasQueuedSourceConflict(candidate, queueResourceKeys)
    ));
    if (!stableSourceCandidates.length) return "blocked";
    const currentIndex = eligibilityIndexRef.current;
    const basisToken = currentIndex?.basisToken || "";
    if (!basisToken) return "blocked";
    const pending = eligibilityUrgentPrefetchKeysRef.current;
    const selection = selectPlanningEligibilityRequestCandidates({
      candidates: stableSourceCandidates,
      decisions: eligibilityServerDecisionsRef.current,
      basisToken,
      pendingRequestKeys: pending,
      forceRetry,
    });
    if (selection.status !== "started") return selection.status;
    const requested = selection.candidates;
    const requestKeys = selection.requestKeys;
    // Two obsolete hover calls may still be in flight when the pointer is
    // released. The exact held-drop proof gets one separate bounded slot so a
    // user's completed action never waits behind speculative pointer targets.
    const requestGate = forceRetry
      ? eligibilityHeldDropRequestGateRef.current
      : eligibilityUrgentRequestGateRef.current;
    const releaseUrgentSlot = requestGate.acquire();
    if (!releaseUrgentSlot) return "pending";
    requestKeys.forEach(key => pending.add(key));
    currentIndex.prewarm(requested.map(item => item._local));
    void requestEligibilityPrefetch({
      candidates: requested,
      basisToken,
      priority: "urgent",
      timeoutMs,
    }).finally(() => {
      requestKeys.forEach(key => pending.delete(key));
      releaseUrgentSlot();
      // A newer hover target may have arrived while both slots were occupied.
      // Re-evaluate only the currently visible candidate; obsolete pointer
      // positions are intentionally never replayed.
      setEligibilityFreshnessTick(value => value + 1);
    });
    return "started";
  }, [requestEligibilityPrefetch]);
  requestUrgentEligibilityCandidatesRef.current = requestUrgentEligibilityCandidates;
  const refetchEligibilityDependencies = useCallback(async ({
    force = false,
    maxConsecutiveFailures = Number.POSITIVE_INFINITY,
  } = {}) => {
    if (planningDragLifecycleRef.current.active) {
      await planningDragLifecycleRef.current.promise;
    }
    if (eligibilityDependencyRefreshPromiseRef.current) {
      return eligibilityDependencyRefreshPromiseRef.current;
    }
    const now = Date.now();
    const failureCount = eligibilityDependencyRefreshFailureCountRef.current;
    if (!force && failureCount >= maxConsecutiveFailures) return null;
    const retryDelayMs = planningEligibilityDependencyRetryDelay({
      failureCount,
      lastAttemptAt: eligibilityDependencyRefreshLastAttemptRef.current,
      now,
    });
    if (!force && retryDelayMs > 0) return null;
    eligibilityDependencyRefreshLastAttemptRef.current = now;
    const releaseEligibilityRefresh = beginEligibilityDependencyRefresh();
    const task = boundedPlanningEligibilityPromise(Promise.allSettled([
      queryClient.refetchQueries({ queryKey: ["personnel"], exact: true, type: "active" }, { throwOnError: true }),
      queryClient.refetchQueries({ queryKey: ["planning-shifts"], type: "active" }, { throwOnError: true }),
      queryClient.refetchQueries({ queryKey: ["planning-assignments"], type: "active" }, { throwOnError: true }),
      queryClient.refetchQueries({ queryKey: ["personnel-absences"], type: "active" }, { throwOnError: true }),
      queryClient.refetchQueries({ queryKey: ["personnel-qualifications"], type: "active" }, { throwOnError: true }),
      queryClient.refetchQueries({ queryKey: ["personnel-security-passes"], type: "active" }, { throwOnError: true }),
      queryClient.refetchQueries({ queryKey: ["personnel-restrictions"], type: "active" }, { throwOnError: true }),
      queryClient.refetchQueries({ queryKey: ["personnel-contracts"], type: "active" }, { throwOnError: true }),
      queryClient.refetchQueries({ queryKey: ["objects"], exact: true, type: "active" }, { throwOnError: true }),
    ])).then(results => {
      eligibilityDependencyRefreshFailureCountRef.current = results.some(result => result.status === "rejected")
        ? eligibilityDependencyRefreshFailureCountRef.current + 1
        : 0;
      return results;
    }).catch(() => {
      eligibilityDependencyRefreshFailureCountRef.current += 1;
      return [];
    }).finally(() => {
      if (eligibilityDependencyRefreshPromiseRef.current === task) {
        eligibilityDependencyRefreshPromiseRef.current = null;
      }
      releaseEligibilityRefresh();
      setEligibilityFreshnessTick(value => value + 1);
    });
    eligibilityDependencyRefreshPromiseRef.current = task;
    return task;
  }, [beginEligibilityDependencyRefresh, queryClient]);
  useEffect(() => {
    const now = Date.now();
    const remoteDeadlines = eligibilityServerDecisions
      .filter(item => item.basis_token === eligibilityIndex.basisToken)
      .map(item => Date.parse(item.expires_at || ""))
      .filter(Number.isFinite);
    const dependencyDeadlines = Object.values(eligibilityDependencies)
      .map(item => Number(item?.dataUpdatedAt || 0) + PLANNING_ELIGIBILITY_MAX_AGE_MS)
      .filter(value => Number.isFinite(value) && value > PLANNING_ELIGIBILITY_MAX_AGE_MS);
    const hasExpiredRemote = remoteDeadlines.some(value => value <= now);
    const hasExpiredDependency = dependencyDeadlines.some(value => value <= now);
    const nextRemoteRefresh = remoteDeadlines
      .map(value => value - PLANNING_ELIGIBILITY_PREFETCH_LEAD_MS)
      .filter(value => value > now)
      .sort((left, right) => left - right)[0];
    const nextRemoteExpiry = remoteDeadlines.filter(value => value > now).sort((left, right) => left - right)[0];
    const nextDependencyExpiry = dependencyDeadlines.filter(value => value > now).sort((left, right) => left - right)[0];
    const nextExpiry = [nextRemoteRefresh, nextRemoteExpiry, nextDependencyExpiry]
      .filter(Number.isFinite)
      .sort((left, right) => left - right)[0];
    if (!nextExpiry && !hasExpiredRemote && !hasExpiredDependency) return undefined;
    const dependencyRetryDelay = Math.max(1, planningEligibilityDependencyRetryDelay({
      failureCount: eligibilityDependencyRefreshFailureCountRef.current,
      lastAttemptAt: eligibilityDependencyRefreshLastAttemptRef.current,
      now,
    }));
    const delay = hasExpiredDependency
      ? eligibilityDependencyRefreshActive
        ? 250
        : dependencyRetryDelay
      : hasExpiredRemote
        ? 1
        : Math.min(2_147_000_000, Math.max(1, nextExpiry - now + 1));
    const handle = window.setTimeout(() => {
      const callbackNow = Date.now();
      if (hasExpiredRemote || (nextRemoteExpiry && nextRemoteExpiry <= callbackNow)) {
        setEligibilityServerDecisions(current => (
          mergePlanningEligibilityServerDecisions(current, [], { now: callbackNow })
        ));
      }
      setEligibilityFreshnessTick(value => value + 1);
      if (
        !eligibilityDependencyRefreshActiveRef.current
        && (
          hasExpiredDependency
          || (nextDependencyExpiry && nextDependencyExpiry <= nextExpiry)
        )
      ) {
        void refetchEligibilityDependencies();
      }
    }, delay);
    return () => window.clearTimeout(handle);
  }, [
    eligibilityDependencies,
    eligibilityDependencyRefreshActive,
    eligibilityFreshnessTick,
    eligibilityIndex.basisToken,
    eligibilityServerDecisions,
    refetchEligibilityDependencies,
  ]);
  useEffect(() => {
    if (!dragEligibilityPreview?.eligibilityCandidate) return;
    // Pointer sensors can cross many task gaps in one gesture. Only prefetch a
    // target that remained current for one short hover window; the held-drop
    // handshake remains immediate and uses its own exact force-retry path.
    const handle = window.setTimeout(() => {
      requestUrgentEligibilityCandidates([dragEligibilityPreview.eligibilityCandidate]);
    }, PLANNING_ELIGIBILITY_HOVER_DELAY_MS);
    return () => window.clearTimeout(handle);
  }, [dragEligibilityPreview?.eligibilityCandidate, eligibilityFreshnessTick, eligibilityIndex.basisToken, requestUrgentEligibilityCandidates]);
  useEffect(() => {
    if (eligibilityPrewarmBasisRef.current === eligibilityIndex.basisToken) return;
    eligibilityPrewarmBasisRef.current = eligibilityIndex.basisToken;
    eligibilityIndex.prewarm(backgroundEligibilityCandidates.map(item => item._local));
  }, [backgroundEligibilityCandidates, eligibilityIndex]);
  useEffect(() => {
    // A mutation gets the planning API lane exclusively. Its ACK may change
    // the local schedule, but a 320-candidate background refill must not race
    // the dependent resize that the user is already performing.
    if (
      !planningQueueState.isIdle
      || planningDragGestureActive
      || planningResizeGestureActive
      || eligibilityDependencyRefreshActive
    ) return undefined;
    if (!backgroundEligibilityCandidates.length) return undefined;
    const backgroundRetryDelay = Math.max(0, eligibilityBackgroundRetryAtRef.current - Date.now());
    if (backgroundRetryDelay > 0) {
      const retryHandle = window.setTimeout(
        () => setEligibilityFreshnessTick(value => value + 1),
        backgroundRetryDelay,
      );
      return () => window.clearTimeout(retryHandle);
    }
    const backgroundSelection = selectPlanningEligibilityRequestCandidates({
      candidates: backgroundEligibilityCandidates,
      decisions: eligibilityServerDecisionsRef.current,
      basisToken: eligibilityIndex.basisToken,
      pendingRequestKeys: eligibilityUrgentPrefetchKeysRef.current,
      now: Date.now() + PLANNING_ELIGIBILITY_PREFETCH_LEAD_MS,
    });
    // Re-renders caused by an optimistic assignment must not refill the whole
    // visible matrix. Stable facts evidence is reusable; only genuinely cold
    // candidates are scheduled in the low-priority lane.
    if (backgroundSelection.status !== "started") return undefined;
    if (eligibilityBackgroundPrefetchBasisRef.current !== eligibilityIndex.basisToken) {
      eligibilityBackgroundPrefetchBasisRef.current = eligibilityIndex.basisToken;
      eligibilityBackgroundPrefetchGenerationRef.current += 1;
    }
    const generation = eligibilityBackgroundPrefetchGenerationRef.current;
    const schedule = typeof window.requestIdleCallback === "function"
      ? callback => window.requestIdleCallback(callback, { timeout: 500 })
      : callback => window.setTimeout(callback, 200);
    const cancel = typeof window.cancelIdleCallback === "function"
      ? handle => window.cancelIdleCallback(handle)
      : handle => window.clearTimeout(handle);
    const handle = schedule(() => {
      void requestEligibilityPrefetch({
        candidates: backgroundSelection.candidates,
        basisToken: eligibilityIndex.basisToken,
        generation,
        priority: "background",
      });
    });
    return () => cancel(handle);
  }, [
    backgroundEligibilityCandidates,
    eligibilityIndex.basisToken,
    eligibilityDependencyRefreshActive,
    eligibilityFreshnessTick,
    planningDragGestureActive,
    planningQueueState.isIdle,
    planningResizeGestureActive,
    requestEligibilityPrefetch,
  ]);

  const candidates = useMemo(() => {
    const ranked = buildCandidateRanking({
      shift: selectedShift,
      personnel: activePersonnel,
      ...warningContext,
    });
    if (!selectedShift) return ranked;
    const assignedPersonnelIds = new Set(
      activeAssignments(assignments)
        .filter(item => String(item.planning_shift_id) === String(selectedShift.id))
        .map(item => String(item.personnel_id)),
    );
    return ranked.map(candidate => {
      const adjacentMerge = resolveOpenShiftSamePersonnelMerge({
        snapshot: eligibilityPlanningSnapshot,
        targetShift: selectedShift,
        personnelId: candidate.personnel.id,
      });
      const eligibilityShift = adjacentMerge.status === "merge" ? {
        ...adjacentMerge.candidate.shift,
        service_date: adjacentMerge.candidate.mergedSegment.start_date,
        end_date: adjacentMerge.candidate.mergedSegment.end_date,
        start_time: adjacentMerge.candidate.mergedSegment.start_time,
        end_time: adjacentMerge.candidate.mergedSegment.end_time,
      } : selectedShift;
      const eligibilityVerdict = eligibilityIndex.queryShift({
        personnelId: candidate.personnel.id,
        shift: eligibilityShift,
        excludeAssignmentId: adjacentMerge.status === "merge"
          ? adjacentMerge.candidate.assignment.id
          : null,
      });
      const candidateWarnings = eligibilityVerdict.warnings || [];
      const eligibilityCandidate = buildPlanningEligibilityPrefetchCandidate({
        kind: "shift",
        source: adjacentMerge.status === "merge" ? adjacentMerge.candidate.shift : selectedShift,
        shift: eligibilityShift,
        personnelId: candidate.personnel.id,
        excludeAssignmentId: adjacentMerge.status === "merge"
          ? adjacentMerge.candidate.assignment.id
          : null,
      });
      return {
        ...candidate,
        warnings: candidateWarnings,
        criticalCount: candidateWarnings.filter(item => item.severity === "critical").length,
        warningCount: candidateWarnings.filter(item => item.severity !== "critical").length,
        eligibilityStatus: eligibilityVerdict.status,
        eligibilityNotices: eligibilityVerdict.notices,
        eligibilityCandidate,
        assignedToSelectedShift: assignedPersonnelIds.has(String(candidate.personnel.id)),
      };
    });
  }, [activePersonnel, assignments, eligibilityFreshnessTick, eligibilityIndex, eligibilityPlanningSnapshot, selectedShift, warningContext]);
  const displayedCandidates = useMemo(() => {
    if (!Array.isArray(dragPersonnelOrder) || dragPersonnelOrder.length === 0) return candidates;
    const order = new Map(dragPersonnelOrder.map((id, index) => [String(id), index]));
    return [...candidates].sort((left, right) => {
      const leftIndex = order.get(String(left.personnel?.id));
      const rightIndex = order.get(String(right.personnel?.id));
      if (leftIndex == null && rightIndex == null) return 0;
      if (leftIndex == null) return 1;
      if (rightIndex == null) return -1;
      return leftIndex - rightIndex;
    });
  }, [candidates, dragPersonnelOrder]);
  useEffect(() => {
    if (!selectedShift || planningDragGestureActive || pendingEligibilityDrop) return;
    requestUrgentEligibilityCandidates(
      candidates.slice(0, 20).map(candidate => candidate.eligibilityCandidate).filter(Boolean),
    );
  }, [
    candidates,
    pendingEligibilityDrop,
    planningDragGestureActive,
    requestUrgentEligibilityCandidates,
    selectedShift,
  ]);

  const handleActionMutationError = (error, variables) => {
    if (error?.details?.code === "TASK_SHIFT_REMOVAL_CONFIRMATION_REQUIRED") return;
    if (variables?.action === "resize_shared_task_boundary") {
      void waitForPlanningDragRelease().then(() => {
        refreshPlanningInBackground({ reason: "shared-boundary-error" });
        bootstrapMutation.mutate({ period_start: bootstrapStart, period_end: periodEnd });
      });
    } else if (Number(error?.status) === 409) {
      refreshPlanningInBackground();
    }
    toast({
      variant: "destructive",
      title: "Planningactie niet opgeslagen",
      description: mutationMessage(error),
    });
    setLiveMessage(mutationMessage(error));
  };

  const runActionMutation = useMutation({
    mutationFn: payload => invokePlanningApi(payload),
    onError: handleActionMutationError,
  });

  const runIntentMutation = async (scope, prefix, payload) => {
    const request = mutationIntents.current.prepare(scope, payload, { prefix });
    const result = await runActionMutation.mutateAsync(request);
    mutationIntents.current.clear(scope, request.idempotency_key);
    return result;
  };

  const runQueuedIntentMutation = async (idempotencyKey, payload) => {
    const request = { ...payload, idempotency_key: idempotencyKey };
    // Low-priority eligibility warming is best-effort and can never be an
    // availability dependency of an interactive write. The busy queue stops
    // subsequent background batches; an already-running request may finish in
    // parallel while the idempotent write starts immediately.
    return invokePlanningApi(request);
  };

  const queuedEffectiveSnapshot = () => {
    const authoritative = planningExecutionSnapshotFromCache(queryClient, periodStart, periodEnd);
    const projected = buildEffectivePlanningPlan({
      shifts: authoritative.shifts,
      assignments: authoritative.assignments,
      segments: authoritative.segments,
      occurrences: authoritative.occurrences,
      intents: planningMutationQueue.current.getSnapshot().intents,
    });
    return { ...authoritative, ...projected };
  };

  const recoverQueuedPlanningAfterExecutionError = async (error, request) => {
    try {
      handleActionMutationError(error, request);
    } catch {
      // Reporting must never prevent authoritative recovery or queue progress.
    }
    try {
      await waitForPlanningDragRelease();
      await refreshPlanning();
    } catch {
      // The original execution error remains the actionable failure.
    }
  };

  const recoverQueuedPlanningAfterCallbackError = async ({ result }, options = {}) => {
    const {
      executionRange = { periodStart, periodEnd },
      ...reconcileOptions
    } = options;
    await waitForPlanningDragRelease();
    try {
      if (result) reconcilePlanningResultForRange(result, executionRange, reconcileOptions);
    } catch {
      // A full authoritative refresh below is the fallback reconciliation path.
    }
    let recovered = false;
    try {
      await refreshPlanning();
      recovered = true;
    } catch {
      // Keep the success classification: the server write itself did complete.
    }
    const description = recovered
      ? "De wijziging is opgeslagen en de planningweergave is opnieuw gesynchroniseerd."
      : "De wijziging is opgeslagen, maar de actuele weergave kon niet automatisch worden herladen. Ververs de planning voordat u verder publiceert.";
    toast({
      title: recovered ? "Planningweergave hersteld" : "Wijziging opgeslagen; verversen nodig",
      description,
    });
    setLiveMessage(description);
  };

  const addPendingMatrixChange = change => {
    setPendingMatrixChanges(current => [...current.filter(item => item.key !== change.key), change]);
  };

  const removePendingMatrixChange = key => {
    setPendingMatrixChanges(current => current.filter(item => item.key !== key));
  };

  const acquirePendingResources = keys => {
    const normalized = [...new Set((keys || []).filter(Boolean).map(String))];
    if (normalized.some(key => pendingResourceKeysRef.current.has(key))) return null;
    normalized.forEach(key => pendingResourceKeysRef.current.add(key));
    setPendingResourceKeys(new Set(pendingResourceKeysRef.current));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      normalized.forEach(key => pendingResourceKeysRef.current.delete(key));
      setPendingResourceKeys(new Set(pendingResourceKeysRef.current));
    };
  };

  const rememberUndo = (result, description) => {
    if (result?.undoable !== true || !result?.audit_event_id || !result?.undo_token) return;
    const item = {
      auditEventId: result.audit_event_id,
      undoToken: result.undo_token,
      shiftId: result?.shift?.id || null,
      expectedShiftRevision: Number(result?.shift?.revision || 1),
      description,
    };
    setUndoStack(current => [item, ...current].slice(0, 10));
    toast({
      title: "Conceptplanning bijgewerkt",
      description,
      action: (
        <ToastAction altText="Laatste planningactie ongedaan maken" onClick={() => handleUndo(item)}>
          Ongedaan maken
        </ToastAction>
      ),
    });
  };

  const executeAssignment = async (shift, personnelItem, requestedSlotIndex = null, candidateWarnings = null) => {
    if (!shift || !personnelItem) return;
    if (planningCommitFenceRef.current) return null;
    const initialSnapshot = queuedEffectiveSnapshot();
    const initialTarget = resolveQueuedShiftAssignment({
      snapshot: initialSnapshot,
      shiftId: shift.id,
      personnelId: personnelItem.id,
      requestedSlotIndex,
    });
    if (initialTarget.status !== "ready") {
      const error = queuedPlanningRebaseError(initialTarget.reason);
      toast({
        title: initialTarget.reason === "personnel_already_assigned" ? "Medewerker is al ingepland" : "Dienst kan niet worden bezet",
        description: error.message,
      });
      setLiveMessage(error.message);
      return;
    }
    const initialMerge = resolveOpenShiftSamePersonnelMerge({
      snapshot: initialSnapshot,
      targetShift: initialTarget.shift,
      personnelId: personnelItem.id,
    });
    const slotIndex = initialTarget.slotIndex;
    const warningShift = initialMerge.status === "merge" ? {
      ...initialMerge.candidate.shift,
      service_date: initialMerge.candidate.mergedSegment.start_date,
      end_date: initialMerge.candidate.mergedSegment.end_date,
      start_time: initialMerge.candidate.mergedSegment.start_time,
      end_time: initialMerge.candidate.mergedSegment.end_time,
    } : initialTarget.shift;
    const warnings = candidateWarnings || getAssignmentWarnings({
      shift: warningShift,
      personnel: personnelItem,
      ...warningContext,
    });
    const name = personnelName(personnelItem);
    const executionRange = Object.freeze({ periodStart, periodEnd });
    const pendingKey = createPlanningMutationKey("planning-assign");
    const mergeCandidate = initialMerge.status === "merge" ? initialMerge.candidate : null;
    const parentIntentIds = [...new Set([
      planningOriginIntentId(initialTarget.shift),
      planningOriginIntentId(initialMerge.targetSegment),
      planningOriginIntentId(mergeCandidate?.shift),
      planningOriginIntentId(mergeCandidate?.segment),
      planningOriginIntentId(mergeCandidate?.assignment),
    ].filter(id => id && planningMutationQueue.current.has(id)))];
    const optimisticIntent = initialMerge.status === "merge"
      ? withPlanningOptimisticIntentIdentity({
          ...buildDependentPlanningDeleteIntent({
            key: pendingKey,
            originIntentId: pendingKey,
            shift: initialTarget.shift,
            segments: [initialMerge.targetSegment],
            assignments: [],
            survivorShift: mergeCandidate.shift,
            survivorSegment: mergeCandidate.segment,
          }),
          key: pendingKey,
          kind: "assign_and_merge_task_shift_partition",
          shift_id: initialTarget.shift.id,
          segment_id: initialMerge.targetSegment.id,
          task_occurrence_id: initialMerge.targetSegment.task_occurrence_id,
          assignments: [normalizePlanningAssignment({
            ...mergeCandidate.assignment,
            warnings,
            warning_snapshot: warnings,
            _optimistic_pending: true,
          })],
        }, { originIntentId: pendingKey })
      : withPlanningOptimisticIntentIdentity({
          key: pendingKey,
          kind: "assign",
          shift_id: initialTarget.shift.id,
          shifts: [initialTarget.shift],
          segments: [],
          assignments: [normalizePlanningAssignment({
            id: `pending-assignment-${pendingKey}`,
            planning_shift_id: initialTarget.shift.id,
            shift_id: initialTarget.shift.id,
            personnel_id: personnelItem.id,
            personnel_name: name,
            slot_index: slotIndex,
            status: "draft",
            warnings,
            _optimistic_pending: true,
          })],
          occurrences: [],
        }, { originIntentId: pendingKey });
    let executedRequest = null;
    const operation = planningMutationQueue.current.enqueue({
      id: pendingKey,
      dependsOn: parentIntentIds,
      resourceKeys: [
        `shift:${initialTarget.shift.id}`,
        ...(mergeCandidate ? [`shift:${mergeCandidate.shift.id}`] : []),
        ...(initialMerge.targetSegment ? [`occurrence:${initialMerge.targetSegment.task_occurrence_id}`] : []),
        ...personnelDayQueueResourceKeys(personnelItem.id, warningShift),
      ],
      intent: optimisticIntent,
      execute: ({ intent }) => {
        const snapshot = planningExecutionSnapshotFromCache(
          queryClient,
          executionRange.periodStart,
          executionRange.periodEnd,
        );
        const shiftTarget = resolvePlanningShiftTarget(snapshot, { id: intent.shift_id });
        if (shiftTarget.status !== "ready") throw queuedPlanningRebaseError(shiftTarget.reason);
        if (intent.kind === "assign_and_merge_task_shift_partition") {
          const currentMerge = resolveOpenShiftSamePersonnelMerge({
            snapshot,
            targetShift: shiftTarget.record,
            personnelId: personnelItem.id,
          });
          if (currentMerge.status !== "merge") {
            throw queuedPlanningRebaseError(currentMerge.reason || "adjacent_merge_no_longer_available");
          }
          const currentOccurrence = resolvePlanningOccurrenceTarget(snapshot, {
            id: currentMerge.targetSegment.task_occurrence_id,
          });
          if (currentOccurrence.status !== "ready") throw queuedPlanningRebaseError(currentOccurrence.reason);
          const candidate = currentMerge.candidate;
          const mergedShift = {
            ...candidate.shift,
            service_date: candidate.mergedSegment.start_date,
            end_date: candidate.mergedSegment.end_date,
            start_time: candidate.mergedSegment.start_time,
            end_time: candidate.mergedSegment.end_time,
          };
          const currentWarnings = getAssignmentWarnings({
            shift: mergedShift,
            personnel: personnelItem,
            ...warningContext,
            excludeAssignmentId: candidate.assignment.id,
          });
          executedRequest = {
            action: "assign_and_merge_task_shift_partition",
            target_shift_id: shiftTarget.record.id,
            target_segment_id: currentMerge.targetSegment.id,
            adjacent_shift_id: candidate.shift.id,
            adjacent_segment_id: candidate.segment.id,
            adjacent_assignment_id: candidate.assignment.id,
            personnel_id: personnelItem.id,
            warning_snapshot: currentWarnings,
            expected_target_shift_revision: Number(shiftTarget.record.revision || 1),
            expected_target_segment_revision: Number(currentMerge.targetSegment.revision || 1),
            expected_adjacent_shift_revision: Number(candidate.shift.revision || 1),
            expected_adjacent_segment_revision: Number(candidate.segment.revision || 1),
            expected_adjacent_assignment_revision: Number(candidate.assignment.revision || 1),
            expected_occurrence_revision: Number(currentOccurrence.record.revision || 1),
          };
          return runQueuedIntentMutation(pendingKey, executedRequest);
        }
        const target = resolveQueuedShiftAssignment({
          snapshot,
          shiftId: shiftTarget.record.id,
          personnelId: personnelItem.id,
          requestedSlotIndex: slotIndex,
        });
        if (target.status !== "ready") throw queuedPlanningRebaseError(target.reason);
        const currentWarnings = getAssignmentWarnings({
          shift: target.shift,
          personnel: personnelItem,
          ...warningContext,
        });
        executedRequest = {
          action: "assign",
          shift_id: target.shift.id,
          slot_index: target.slotIndex,
          personnel_id: personnelItem.id,
          personnel_name: name,
          warnings: currentWarnings,
          expected_shift_revision: target.expectedShiftRevision,
        };
        return runQueuedIntentMutation(pendingKey, executedRequest);
      },
      onSuccess: async result => {
        await waitForPlanningDragRelease();
        reconcilePlanningResultForRange(result, executionRange, {
          replaceShiftSegments: optimisticIntent.kind === "assign_and_merge_task_shift_partition",
        });
        planningMutationQueue.current.updateIntents(intent => (
          rebaseDependentPlanningIntent(intent, optimisticIntent, result)
        ));
        refreshPlanningInBackground();
        const description = optimisticIntent.kind === "assign_and_merge_task_shift_partition"
          ? `${name} blijft als één aaneengesloten dienst ingepland; het open restant is samengevoegd.`
          : `${name} is eenmalig ingepland op ${initialTarget.shift.name}.`;
        rememberUndo(result, description);
        setLiveMessage(description);
        setSelectedShiftId(null);
      },
      onError: error => recoverQueuedPlanningAfterExecutionError(error, executedRequest || {
        action: "assign",
        shift_id: initialTarget.shift.id,
      }),
      onCallbackError: context => recoverQueuedPlanningAfterCallbackError(context, { executionRange }),
    });
    return operation;
  };

  const handleCandidateAssign = candidate => {
    if (candidate?.eligibilityStatus !== "ready") {
      if (candidate?.eligibilityCandidate) {
        requestUrgentEligibilityCandidates([candidate.eligibilityCandidate]);
      }
      const description = "De volledige CAO- en inzetcontrole is nog niet actueel. De medewerker is nog niet ingepland.";
      toast({ title: "Voorcontrole nog niet actueel", description });
      setLiveMessage(description);
      return Promise.resolve(null);
    }
    return executeAssignment(
      selectedShift,
      candidate.personnel,
      null,
      candidate.warnings,
    );
  };

  const handleUnassign = async (shift, assignment) => {
    if (!shift || !assignment || planningCommitFenceRef.current) return null;
    const executionRange = Object.freeze({ periodStart, periodEnd });
    const pendingKey = createPlanningMutationKey("planning-unassign");
    const parentIntentId = planningOriginIntentId(assignment) || planningOriginIntentId(shift);
    const relatedSegments = (activeTaskSegmentsByShift.get(String(shift.id)) || []);
    const occurrenceIds = [...new Set(relatedSegments.map(item => String(item.task_occurrence_id)))];
    const optimisticIntent = {
      ...buildDependentPlanningUnassignIntent({
        key: pendingKey,
        originIntentId: pendingKey,
        shift,
        assignment,
      }),
      shift_id: shift.id,
      assignment_id: assignment.id,
    };
    let executionIntent = optimisticIntent;
    let executedRequest = null;
    const operation = planningMutationQueue.current.enqueue({
      id: pendingKey,
      dependsOn: parentIntentId && planningMutationQueue.current.has(parentIntentId) ? [parentIntentId] : [],
      resourceKeys: [
        `shift:${shift.id}`,
        ...occurrenceIds.map(id => `occurrence:${id}`),
        ...personnelDayQueueResourceKeys(assignment.personnel_id, shift),
      ],
      intent: optimisticIntent,
      execute: ({ intent }) => {
        executionIntent = intent;
        const snapshot = planningExecutionSnapshotFromCache(
          queryClient,
          executionRange.periodStart,
          executionRange.periodEnd,
        );
        const currentShift = resolvePlanningShiftTarget(snapshot, { id: intent.shift_id });
        const currentAssignment = resolvePlanningAssignmentTarget(snapshot, { id: intent.assignment_id });
        const blocked = [currentShift, currentAssignment].find(target => target.status !== "ready");
        if (blocked) throw queuedPlanningRebaseError(blocked.reason);
        executedRequest = {
          action: "unassign",
          shift_id: currentShift.record.id,
          slot_index: Number(currentAssignment.record.slot_index || 0),
          assignment_id: currentAssignment.record.id,
          expected_shift_revision: Number(currentShift.record.revision || 1),
        };
        return runQueuedIntentMutation(pendingKey, executedRequest);
      },
      onSuccess: result => {
        reconcilePlanningResultForRange(result, executionRange);
        planningMutationQueue.current.updateIntents(intent => (
          rebaseDependentPlanningIntent(intent, executionIntent, result)
        ));
        refreshPlanningInBackground();
        const description = `${assignment.personnel_name || "Medewerker"} is vrijgemaakt van ${shift.name || "de dienst"}; de dienst blijft openstaan.`;
        rememberUndo(result, description);
        setLiveMessage(description);
      },
      onError: error => recoverQueuedPlanningAfterExecutionError(error, executedRequest || {
        action: "unassign",
        shift_id: shift.id,
        assignment_id: assignment.id,
      }),
      onCallbackError: context => recoverQueuedPlanningAfterCallbackError(context, { executionRange }),
    });
    void operation.catch(() => undefined);
    return { accepted: true, operation };
  };

  const handleUndo = async (item = undoStack[0]) => {
    if (!editing || !item) return;
    const currentShift = allShifts.find(shift => String(shift.id) === String(item.shiftId));
    const result = await runIntentMutation("undo", "planning-undo", {
      action: "undo",
      undo_token: item.undoToken,
      audit_event_id: item.auditEventId,
      shift_id: item.shiftId,
      expected_shift_revision: Math.max(
        Number(currentShift?.revision || 0),
        Number(item.expectedShiftRevision || 1),
      ),
    });
    reconcilePlanningResult(result);
    refreshPlanningInBackground();
    setUndoStack(current => current.filter(entry => entry.auditEventId !== item.auditEventId));
    const message = result?.message || `Ongedaan gemaakt: ${item.description}`;
    setLiveMessage(message);
    toast({ title: "Planning hersteld", description: message });
  };

  const timelineAssignmentDescription = (occurrence, personnelItem, warnings) => (
    `${personnelName(personnelItem)} is ingepland voor ${occurrence.task_name_snapshot || "de taak"} bij ${occurrence.object_name_snapshot || "het object"}.${warnings.length ? ` Controleer ${warnings.length} inzetwaarschuwing${warnings.length === 1 ? "" : "en"}.` : ""}`
  );

  const notifyOptimisticTimelineAssignment = (occurrence, personnelItem, warnings = []) => {
    const criticalWarnings = warnings.filter(warning => warning.severity === "critical");
    const description = timelineAssignmentDescription(occurrence, personnelItem, warnings);
    toast({
      title: criticalWarnings.length
        ? "Ingepland met kritieke controle"
        : warnings.length
          ? "Ingepland met aandachtspunt"
          : "Medewerker ingepland",
      description,
    });
    setLiveMessage(description);
  };

  const finishTimelineAssignment = (result, occurrence, personnelItem, {
    reconciled = false,
    optimisticWarnings = null,
  } = {}) => {
    setStatusFilter("all");
    if (!reconciled) {
      reconcilePlanningResult(result);
      refreshPlanningInBackground();
    }
    const warnings = assignmentWarnings(result.assignment);
    const criticalWarnings = warnings.filter(warning => warning.severity === "critical");
    const description = timelineAssignmentDescription(occurrence, personnelItem, warnings);
    const optimisticKeys = new Set((optimisticWarnings || []).map(warning => [
      warning.code,
      warning.severity,
      warning.title,
      warning.detail,
      warning.message,
    ].map(value => String(value || "")).join("|")));
    const newlyReportedWarnings = optimisticWarnings == null
      ? warnings
      : warnings.filter(warning => !optimisticKeys.has([
          warning.code,
          warning.severity,
          warning.title,
          warning.detail,
          warning.message,
        ].map(value => String(value || "")).join("|")));
    if (optimisticWarnings == null || newlyReportedWarnings.length > 0) {
      toast({
        title: optimisticWarnings != null
          ? "Inzetcontrole bijgewerkt"
          : criticalWarnings.length
            ? "Ingepland met kritieke controle"
            : warnings.length
              ? "Ingepland met aandachtspunt"
              : "Medewerker ingepland",
        description,
      });
      setLiveMessage(description);
    }
    setSelectedShiftId(warnings.length ? result.shift?.id || null : null);
    return result;
  };

  const composeAndAssignOccurrenceSlice = async ({ occurrence, personnelItem, serviceDate, startTime, endTime, candidateWarnings = null }) => {
    if (!occurrence || !personnelItem) return;
    if (planningCommitFenceRef.current) return null;
    const preferredSegment = occurrenceSegmentForTimelineSlice(occurrence, serviceDate, startTime, endTime);
    if (!preferredSegment) return;
    const initialResolution = resolveQueuedOccurrenceMutation({
      snapshot: queuedEffectiveSnapshot(),
      occurrenceId: occurrence.id,
      personnelId: personnelItem.id,
      personnelName: personnelName(personnelItem),
      serviceDate,
      preferredSegment,
      assignmentSource: "object_timeline_gap_drop",
      allowOptimisticAdjacent: true,
    });
    if (initialResolution.status !== "ready") {
      const error = queuedPlanningRebaseError(initialResolution.reason);
      toast({ variant: "destructive", title: "Taakdeel kan niet worden ingepland", description: error.message });
      setLiveMessage(error.message);
      return null;
    }
    const pendingKey = createPlanningMutationKey("timeline-compose-and-assign");
    const executionRange = Object.freeze({ periodStart, periodEnd });
    const optimisticRecords = optimisticQueuedOccurrenceRecords({
      key: pendingKey,
      resolution: initialResolution,
      personnelItem,
    });
    const immediateWarnings = candidateWarnings || getAssignmentWarnings({
      shift: optimisticRecords.shifts[0],
      personnel: personnelItem,
      ...warningContext,
    });
    optimisticRecords.assignments = optimisticRecords.assignments.map(item => ({
      ...item,
      warnings: immediateWarnings,
      warning_snapshot: immediateWarnings,
    }));
    let executionResolution = null;
    let executionOptimisticRecords = null;
    let executedRequest = null;
    const operation = planningMutationQueue.current.enqueue({
      id: pendingKey,
      resourceKeys: [
        `occurrence:${occurrence.id}`,
        ...(initialResolution.kind === "merge" ? [`shift:${initialResolution.adjacent.candidate.shift.id}`] : []),
        ...personnelDayQueueResourceKeys(personnelItem.id, initialResolution.allocation.segment),
      ],
      intent: optimisticRecords,
      execute: () => {
        executionResolution = resolveQueuedOccurrenceMutation({
          snapshot: planningExecutionSnapshotFromCache(
            queryClient,
            executionRange.periodStart,
            executionRange.periodEnd,
          ),
          occurrenceId: occurrence.id,
          personnelId: personnelItem.id,
          personnelName: personnelName(personnelItem),
          serviceDate,
          preferredSegment,
          assignmentSource: "object_timeline_gap_drop",
          warnings: immediateWarnings,
        });
        if (executionResolution.status !== "ready") throw queuedPlanningRebaseError(executionResolution.reason);
        executionOptimisticRecords = optimisticQueuedOccurrenceRecords({
          key: pendingKey,
          resolution: executionResolution,
          personnelItem,
          warnings: immediateWarnings,
        });
        executionOptimisticRecords.assignments = executionOptimisticRecords.assignments.map(item => ({
          ...item,
          warnings: immediateWarnings,
          warning_snapshot: immediateWarnings,
        }));
        planningMutationQueue.current.updateIntent(pendingKey, () => executionOptimisticRecords);
        executedRequest = executionResolution.payload;
        return runQueuedIntentMutation(pendingKey, executedRequest);
      },
      onSuccess: async result => {
        await waitForPlanningDragRelease();
        const replaceShiftSegments = executionResolution?.kind === "merge";
        reconcilePlanningResultForRange(result, executionRange, { replaceShiftSegments });
        planningMutationQueue.current.updateIntents(intent => (
          rebaseDependentPlanningIntent(intent, executionOptimisticRecords, result)
        ));
        refreshPlanningInBackground();
        if (replaceShiftSegments) {
          return;
        }
        finishTimelineAssignment(result, executionResolution.allocation.occurrence, personnelItem, {
          reconciled: true,
          optimisticWarnings: immediateWarnings,
        });
      },
      onError: error => recoverQueuedPlanningAfterExecutionError(error, executedRequest || {
        action: "compose_and_assign",
        occurrence_id: occurrence.id,
      }),
      onCallbackError: context => recoverQueuedPlanningAfterCallbackError(context, {
        executionRange,
        replaceShiftSegments: executionResolution?.kind === "merge",
      }),
    });
    notifyOptimisticTimelineAssignment(occurrence, personnelItem, immediateWarnings);
    return operation;
  };

  const saveTaskEdit = async ({ occurrence, startTime, endTime, confirmRemoval = false }) => {
    let result;
    try {
      result = await runIntentMutation(
        `edit-task:${occurrence.id}`,
        "planning-edit-single-task",
        {
          action: "change_single_task_occurrence",
          occurrence_id: occurrence.id,
          source_revision_id: occurrence.object_task_schedule_revision_id || null,
          start_time: startTime,
          end_time: endTime,
          expected_occurrence_revision: Number(occurrence.revision || 1),
          confirm_remove_outside_shifts: confirmRemoval,
        },
      );
    } catch (error) {
      if (error?.details?.code === "TASK_SHIFT_REMOVAL_CONFIRMATION_REQUIRED") {
        setTaskShiftRemovalRequest({ occurrence, startTime, endTime, shifts: error.details.shifts || [] });
        return;
      }
      throw error;
    }
    reconcilePlanningResult(result);
    refreshPlanningInBackground();
    setTaskShiftRemovalRequest(null);
    setTaskEditor(null);
    const description = `${occurrence.task_name_snapshot || "Taak"} loopt nu van ${startTime} tot ${endTime}.`;
    toast({ title: "Taaktijden aangepast", description });
    setLiveMessage(description);
  };

  const copyTaskToClipboard = task => {
    setTaskClipboard(task);
    const description = `${task.task_name_snapshot || "Taak"} is zonder diensten gekopieerd.`;
    toast({ title: "Taak gekopieerd", description });
    setLiveMessage(description);
  };

  const deleteTaskOccurrence = async request => {
    const occurrence = request?.occurrence;
    if (!occurrence) return;
    const linkedShifts = request.linkedShifts || [];
    const releasePendingResources = acquirePendingResources([
      `occurrence:${occurrence.id}`,
      ...linkedShifts.map(shift => `shift:${shift.id}`),
    ]);
    if (!releasePendingResources) return;
    try {
      const result = await runIntentMutation(
        `cancel-task-occurrence:${occurrence.id}`,
        "planning-cancel-task-occurrence",
        {
          action: "change_single_task_occurrence",
          occurrence_id: occurrence.id,
          source_revision_id: occurrence.object_task_schedule_revision_id || null,
          expected_occurrence_revision: Number(occurrence.revision || 1),
          cancel_occurrence: true,
          confirm_remove_outside_shifts: true,
        },
      );
      reconcilePlanningResult(result);
      if (String(taskClipboard?.id) === String(occurrence.id)) setTaskClipboard(null);
      setTaskDeleteRequest(null);
      refreshPlanningInBackground();
      const description = `${occurrence.task_name_snapshot || "Taak"} is verwijderd${linkedShifts.length ? `, inclusief ${linkedShifts.length} ${linkedShifts.length === 1 ? "dienst" : "diensten"}` : ""}.`;
      toast({ title: "Taak verwijderd", description });
      setLiveMessage(description);
    } finally {
      releasePendingResources();
    }
  };

  const requestTaskDeletion = occurrence => {
    const state = occurrencePlanningStates.get(String(occurrence.id));
    const linkedShifts = (state?.linkedShiftIds || []).map(id => shiftsInRangeById.get(String(id))).filter(Boolean);
    if (linkedShifts.some(shift => shift.status === "published" || Number(shift.published_revision || 0) > 0)) {
      toast({ variant: "destructive", title: "Taak kan niet rechtstreeks worden verwijderd", description: "Minimaal één gekoppelde dienst is al gepubliceerd en moet via een formele annulering worden afgehandeld." });
      return;
    }
    const employeeCount = new Set(linkedShifts.flatMap(shift => (
      assignmentsInRangeByShift.get(String(shift.id)) || []
    )).map(assignment => String(assignment.personnel_id))).size;
    const request = { occurrence, linkedShifts, employeeCount };
    if (linkedShifts.length) setTaskDeleteRequest(request);
    else deleteTaskOccurrence(request).catch(() => undefined);
  };

  const pasteTaskToDate = async ({ task, objectId, serviceDate }) => {
    if (!task || String(task.object_id) !== String(objectId)) return;
    if (planningCommitFenceRef.current) return null;
    const executionRange = Object.freeze({ periodStart, periodEnd });
    const pendingKey = createPlanningMutationKey("planning-copy-task-occurrence");
    const optimisticOccurrence = buildOptimisticCopiedTaskOccurrence({
      occurrence: task,
      targetServiceDate: serviceDate,
    });
    const reference = planningTaskCopyReference({
      sourceOccurrenceId: task.id,
      targetServiceDate: serviceDate,
    });
    const originIntentId = planningOriginIntentId(task);
    const optimisticIntent = withPlanningOptimisticIntentIdentity({
      key: pendingKey,
      kind: "copy_task_occurrence",
      task_occurrence_id: task.id,
      sourceOccurrence: {
        id: task.id,
        ref: planningRecordReference(task, "occurrence"),
      },
      shifts: [],
      assignments: [],
      segments: [],
      occurrences: [optimisticOccurrence],
    }, { originIntentId: pendingKey });
    let executedRequest = null;
    const operation = planningMutationQueue.current.enqueue({
      id: pendingKey,
      dependsOn: originIntentId && planningMutationQueue.current.has(originIntentId) ? [originIntentId] : [],
      resourceKeys: [
        `occurrence:${task.id}`,
        `occurrence:${optimisticOccurrence.id}`,
        `task-copy:${reference}`,
        `task-date:${objectId}:${serviceDate}`,
      ],
      intent: optimisticIntent,
      execute: ({ intent }) => {
        const snapshot = planningExecutionSnapshotFromCache(
          queryClient,
          executionRange.periodStart,
          executionRange.periodEnd,
        );
        const sourceTarget = resolvePlanningOccurrenceTarget(snapshot, {
          id: intent.task_occurrence_id,
          ref: intent.sourceOccurrence?.ref,
        });
        if (sourceTarget.status !== "ready") throw queuedPlanningRebaseError(sourceTarget.reason);
        executedRequest = buildCopyTaskOccurrencePayload({
          occurrence: sourceTarget.record,
          targetServiceDate: serviceDate,
        });
        return runQueuedIntentMutation(pendingKey, executedRequest);
      },
      onSuccess: result => {
        const validation = reconcileOptimisticTaskCopy({
          occurrences: queuedEffectiveSnapshot().occurrences,
          optimisticOccurrence,
          result,
        });
        if (!validation.reconciled) {
          throw new Error("De server heeft de gekopieerde taak niet autoritatief teruggegeven.");
        }
        reconcilePlanningResultForRange(result, executionRange);
        planningMutationQueue.current.updateIntents(intent => (
          rebaseDependentPlanningIntent(intent, optimisticIntent, result)
        ));
        refreshPlanningInBackground();
        const description = `${task.task_name_snapshot || "Taak"} is op ${serviceDate} geplaatst zonder diensten of medewerkers.`;
        toast({ title: "Taak geplakt", description });
        setLiveMessage(description);
      },
      onError: error => recoverQueuedPlanningAfterExecutionError(error, executedRequest || {
        action: "copy_task_occurrence",
        source_occurrence_id: task.id,
        target_service_date: serviceDate,
      }),
      onCallbackError: context => recoverQueuedPlanningAfterCallbackError(context, { executionRange }),
    });
    return operation;
  };

  const copyServiceToClipboard = clipboard => {
    setServiceClipboard(clipboard);
    const description = `${clipboard.personnelName} · ${clipboard.startTime}–${clipboard.endTime} is gekopieerd.`;
    toast({ title: "Dienst gekopieerd", description });
    setLiveMessage(description);
  };

  const pasteServiceFromClipboard = async ({ occurrence, serviceDate, startTime, endTime, personnelId }) => {
    const personnelItem = activePersonnel.find(item => String(item.id) === String(personnelId));
    if (!personnelItem) {
      toast({ variant: "destructive", title: "Medewerker niet beschikbaar", description: "De medewerker van de gekopieerde dienst is niet meer actief." });
      return;
    }
    return composeAndAssignOccurrenceSlice({ occurrence, personnelItem, serviceDate, startTime, endTime });
  };

  const createOpenOccurrenceSlice = async ({ occurrence, serviceDate, startTime, endTime }) => {
    if (!occurrence) return;
    const segment = occurrenceSegmentForTimelineSlice(occurrence, serviceDate, startTime, endTime);
    if (!segment) return;
    const releasePendingResources = acquirePendingResources([`occurrence:${occurrence.id}`]);
    if (!releasePendingResources) return;
    const pendingKey = createPlanningMutationKey("pending-open-task-service");
    addPendingMatrixChange(optimisticCompositionRecords({ key: pendingKey, occurrence, segment }));
    try {
      const result = await runIntentMutation(`timeline-open-shift:${occurrence.id}`, "timeline-open-shift", {
        action: "compose_shift",
        required_count: 1,
        expected_occurrence_revisions: {
          [occurrence.id]: Number(occurrence.revision || 1),
        },
        segments: [segment],
      });
      setStatusFilter("all");
      reconcilePlanningResult(result);
      refreshPlanningInBackground();
      const description = `Open dienst ${startTime}–${endTime} is gevormd binnen ${occurrence.task_name_snapshot || "de taak"}. Sleep nu een medewerker naar de open plaats.`;
      toast({ title: "Open dienst gemaakt", description });
      setSelectedShiftId(result.shift?.id || null);
      setSidePanelMode("employees");
      setLiveMessage(description);
      return result;
    } finally {
      removePendingMatrixChange(pendingKey);
      releasePendingResources();
    }
  };

  const resizeTimelineTaskSegment = ({ shift, segment, startDate, endDate, startTime, endTime, notification = null }) => {
    if (!shift || !segment) return;
    const activeSegments = [...(activeTaskSegmentsByShift.get(String(shift.id)) || [])]
      .sort((left, right) => Number(left.sequence_index || 0) - Number(right.sequence_index || 0));
    const occurrenceIds = [...new Set(activeSegments.map(item => String(item.task_occurrence_id)))];
    const occurrenceById = new Map(taskOccurrences.map(item => [String(item.id), item]));
    const missingOccurrenceIds = occurrenceIds.filter(id => !occurrenceById.has(id));
    if (missingOccurrenceIds.length) {
      const description = "Niet alle gekoppelde klanttaken zijn in de huidige periode geladen. Open de volledige dienstinhoud om deze dienst veilig te wijzigen.";
      toast({ variant: "destructive", title: "Dienst kan hier niet worden verkleind", description });
      setLiveMessage(description);
      return;
    }
    if (activeSegments.length !== 1 || occurrenceIds.length !== 1) {
      const description = "Alleen een enkel taakdeel kan rechtstreeks op de kaart worden gesplitst. Open de dienstinhoud voor een samengestelde dienst.";
      toast({ variant: "destructive", title: "Dienst kan hier niet worden gesplitst", description });
      setLiveMessage(description);
      return;
    }
    const pendingKey = createPlanningMutationKey("timeline-preserve-resize");
    const executionRange = Object.freeze({ periodStart, periodEnd });
    const shiftAssignments = activeAssignments(assignments).filter(item => (
      String(item.planning_shift_id || item.shift_id) === String(shift.id)
    ));
    const parentIntentId = planningOriginIntentId(shift) || planningOriginIntentId(segment);
    const staleGestureIntent = {
      ...buildDependentPlanningResizeIntent({
        key: pendingKey,
        originIntentId: pendingKey,
        shift,
        segment,
        assignments: shiftAssignments,
        nextStartDate: startDate,
        nextEndDate: endDate,
        nextStartTime: startTime,
        nextEndTime: endTime,
      }),
      shift_id: shift.id,
      segment_id: segment.id,
      task_occurrence_id: occurrenceIds[0],
    };
    const terminalParent = parentIntentId
      ? planningMutationQueue.current.getTerminalState(parentIntentId)
      : null;
    if (terminalParent && terminalParent.status !== "succeeded") {
      const description = "De oorspronkelijke dienst kon niet worden opgeslagen; deze tijdswijziging is daarom vervallen.";
      toast({ variant: "destructive", title: "Diensttijd niet aangepast", description });
      setLiveMessage(description);
      return null;
    }
    // Pointer listeners intentionally retain the optimistic records they were
    // started with. If the compose ACK completed before pointer-up, recover
    // its terminal identity map and enqueue the resize directly against the
    // authoritative ids/revisions instead of retrying the stale temp ids.
    const optimisticIntent = terminalParent?.status === "succeeded"
      ? rebaseDependentPlanningIntent(
          staleGestureIntent,
          terminalParent.originalIntent || terminalParent.intent,
          terminalParent.result,
        )
      : staleGestureIntent;
    if (terminalParent?.status === "succeeded") {
      const terminalSnapshot = planningExecutionSnapshotFromCache(
        queryClient,
        executionRange.periodStart,
        executionRange.periodEnd,
      );
      const terminalTargets = [
        resolvePlanningShiftTarget(terminalSnapshot, {
          id: optimisticIntent.shift_id,
          ref: optimisticIntent._planning_target_refs?.shift,
        }),
        resolvePlanningSegmentTarget(terminalSnapshot, {
          id: optimisticIntent.segment_id,
          ref: optimisticIntent._planning_target_refs?.segment,
        }),
      ];
      if (terminalTargets.some(target => target.status !== "ready")) {
        const description = "De opgeslagen dienst kon niet eenduidig aan de lokale tijdsgreep worden gekoppeld. Er is geen tweede planningactie verstuurd; ververs de planning en probeer opnieuw.";
        toast({ variant: "destructive", title: "Diensttijd niet aangepast", description });
        setLiveMessage(description);
        return null;
      }
    }
    let executionIntent = optimisticIntent;
    let executedRequest = null;
    const operation = planningMutationQueue.current.enqueue({
      id: pendingKey,
      dependsOn: parentIntentId && planningMutationQueue.current.has(parentIntentId) ? [parentIntentId] : [],
      coalesceKey: `resize:${planningRecordReference(shift, "shift")}:${planningRecordReference(segment, "segment")}`,
      coalesceIntent: (_current, incoming) => incoming,
      resourceKeys: [
        `shift:${optimisticIntent.shift_id}`,
        ...occurrenceIds.map(id => `occurrence:${id}`),
      ],
      intent: optimisticIntent,
      execute: ({ intent }) => {
        executionIntent = intent;
        const snapshot = planningExecutionSnapshotFromCache(
          queryClient,
          executionRange.periodStart,
          executionRange.periodEnd,
        );
        const currentShift = resolvePlanningShiftTarget(snapshot, {
          id: intent.shift_id,
          ref: intent._planning_target_refs?.shift,
        });
        const currentSegment = resolvePlanningSegmentTarget(snapshot, {
          id: intent.segment_id,
          ref: intent._planning_target_refs?.segment,
        });
        const currentOccurrence = resolvePlanningOccurrenceTarget(snapshot, { id: intent.task_occurrence_id });
        const requestedShift = resolvePlanningShiftTarget(intent, { ref: intent._planning_target_refs?.shift });
        const requestedSegment = resolvePlanningSegmentTarget(intent, { ref: intent._planning_target_refs?.segment });
        const blocked = [currentShift, currentSegment, currentOccurrence, requestedShift, requestedSegment]
          .find(target => target.status !== "ready");
        if (blocked) throw queuedPlanningRebaseError(blocked.reason);
        const currentAssignments = activeAssignments(snapshot.assignments).filter(item => (
          String(item.planning_shift_id || item.shift_id) === String(currentShift.record.id)
        ));
        executedRequest = {
          action: "resize_task_shift_preserving_coverage",
          shift_id: currentShift.record.id,
          segment_id: currentSegment.record.id,
          start_date: requestedSegment.record.start_date,
          end_date: requestedSegment.record.end_date,
          start_time: requestedSegment.record.start_time,
          end_time: requestedSegment.record.end_time,
          expected_shift_revision: Number(currentShift.record.revision || 1),
          expected_segment_revision: Number(currentSegment.record.revision || 1),
          expected_occurrence_revision: Number(currentOccurrence.record.revision || 1),
          expected_assignment_revisions: Object.fromEntries(currentAssignments.map(item => [
            item.id,
            Number(item.revision || 1),
          ])),
        };
        return runQueuedIntentMutation(pendingKey, executedRequest);
      },
      onSuccess: async result => {
        await waitForPlanningDragRelease();
        setStatusFilter("all");
        reconcilePlanningResultForRange(result, executionRange);
        planningMutationQueue.current.updateIntents(intent => (
          rebaseDependentPlanningIntent(intent, executionIntent, result)
        ));
        refreshPlanningInBackground();
        const description = notification?.description
          || `${shift.name || shift.service_name_snapshot || "Dienst"} loopt nu van ${result.shift?.start_time || startTime} tot ${result.shift?.end_time || endTime}. Het vrijgekomen deel is een echte open dienst.`;
        toast({ title: notification?.title || "Diensttijd aangepast", description });
        setLiveMessage(description);
      },
      onError: error => recoverQueuedPlanningAfterExecutionError(error, executedRequest || {
        action: "resize_task_shift_preserving_coverage",
        shift_id: shift.id,
        segment_id: segment.id,
      }),
      onCallbackError: context => recoverQueuedPlanningAfterCallbackError(context, { executionRange }),
    });
    void operation.catch(() => undefined);
    setStatusFilter("all");
    return { accepted: true, operation };
  };

  const resizeTimelineSharedBoundary = ({
    occurrence,
    boundaryDate,
    boundaryTime,
    left,
    right,
  }) => {
    if (!occurrence || !left?.shift || !left?.segment || !right?.shift || !right?.segment) return;

    const initialSnapshot = queuedEffectiveSnapshot();
    const currentOccurrence = resolvePlanningOccurrenceTarget(initialSnapshot, { id: occurrence.id });
    if (currentOccurrence.status !== "ready") {
      const description = "De gekoppelde klanttaak is niet meer geladen. Ververs de planning en probeer het opnieuw.";
      toast({ variant: "destructive", title: "Overdrachtsgrens kan niet worden aangepast", description });
      setLiveMessage(description);
      return;
    }

    const pendingKey = createPlanningMutationKey("timeline-shared-boundary");
    const executionRange = Object.freeze({ periodStart, periodEnd });
    const leftShift = {
      ...left.shift,
      end_date: boundaryDate,
      end_time: boundaryTime,
      _optimistic_pending: true,
    };
    const rightShift = {
      ...right.shift,
      service_date: boundaryDate,
      start_date: boundaryDate,
      start_time: boundaryTime,
      _optimistic_pending: true,
    };
    const leftSegment = {
      ...left.segment,
      end_date: boundaryDate,
      end_time: boundaryTime,
      _optimistic_pending: true,
    };
    const rightSegment = {
      ...right.segment,
      start_date: boundaryDate,
      start_time: boundaryTime,
      _optimistic_pending: true,
    };
    const optimisticIntent = withPlanningOptimisticIntentIdentity({
      key: pendingKey,
      kind: "resize_shared_task_boundary",
      task_occurrence_id: currentOccurrence.record.id,
      left_shift_id: left.shift.id,
      left_segment_id: left.segment.id,
      right_shift_id: right.shift.id,
      right_segment_id: right.segment.id,
      boundary_date: boundaryDate,
      boundary_time: boundaryTime,
      shifts: [leftShift, rightShift],
      segments: [leftSegment, rightSegment],
      assignments: [],
      occurrences: [],
    }, { originIntentId: pendingKey });
    const parentIntentIds = [...new Set([
      planningOriginIntentId(left.shift),
      planningOriginIntentId(left.segment),
      planningOriginIntentId(right.shift),
      planningOriginIntentId(right.segment),
    ].filter(id => id && planningMutationQueue.current.has(id)))];
    let executionIntent = optimisticIntent;
    let executedRequest = null;
    const operation = planningMutationQueue.current.enqueue({
      id: pendingKey,
      dependsOn: parentIntentIds,
      coalesceKey: `shared-boundary:${planningRecordReference(occurrence, "occurrence")}:${planningRecordReference(left.segment, "segment")}:${planningRecordReference(right.segment, "segment")}`,
      coalesceIntent: (_current, incoming) => incoming,
      resourceKeys: [
        `occurrence:${occurrence.id}`,
        `shift:${left.shift.id}`,
        `shift:${right.shift.id}`,
        ...activeAssignments(initialSnapshot.assignments)
          .filter(assignment => [String(left.shift.id), String(right.shift.id)].includes(String(assignment.planning_shift_id || assignment.shift_id)))
          .flatMap(assignment => planningPersonnelDayResourceKeys(assignment.personnel_id, left.shift)),
      ],
      intent: optimisticIntent,
      execute: ({ intent }) => {
        executionIntent = intent;
        const snapshot = planningExecutionSnapshotFromCache(
          queryClient,
          executionRange.periodStart,
          executionRange.periodEnd,
        );
        const targets = {
          occurrence: resolvePlanningOccurrenceTarget(snapshot, { id: intent.task_occurrence_id }),
          leftShift: resolvePlanningShiftTarget(snapshot, { id: intent.left_shift_id }),
          leftSegment: resolvePlanningSegmentTarget(snapshot, { id: intent.left_segment_id }),
          rightShift: resolvePlanningShiftTarget(snapshot, { id: intent.right_shift_id }),
          rightSegment: resolvePlanningSegmentTarget(snapshot, { id: intent.right_segment_id }),
        };
        const blocked = Object.values(targets).find(target => target.status !== "ready");
        if (blocked) throw queuedPlanningRebaseError(blocked.reason);
        const shiftIds = new Set([String(targets.leftShift.record.id), String(targets.rightShift.record.id)]);
        const affectedAssignments = activeAssignments(snapshot.assignments).filter(assignment => (
          shiftIds.has(String(assignment.planning_shift_id || assignment.shift_id))
        ));
        executedRequest = {
          action: "resize_shared_task_boundary",
          task_occurrence_id: targets.occurrence.record.id,
          left_shift_id: targets.leftShift.record.id,
          left_segment_id: targets.leftSegment.record.id,
          right_shift_id: targets.rightShift.record.id,
          right_segment_id: targets.rightSegment.record.id,
          boundary_date: intent.boundary_date,
          boundary_time: intent.boundary_time,
          expected_shift_revisions: {
            [targets.leftShift.record.id]: Number(targets.leftShift.record.revision || 1),
            [targets.rightShift.record.id]: Number(targets.rightShift.record.revision || 1),
          },
          expected_segment_revisions: {
            [targets.leftSegment.record.id]: Number(targets.leftSegment.record.revision || 1),
            [targets.rightSegment.record.id]: Number(targets.rightSegment.record.revision || 1),
          },
          expected_assignment_revisions: Object.fromEntries(affectedAssignments.map(assignment => [
            assignment.id,
            Number(assignment.revision || 1),
          ])),
          expected_occurrence_revision: Number(targets.occurrence.record.revision || 1),
        };
        return runQueuedIntentMutation(pendingKey, executedRequest);
      },
      onSuccess: async result => {
        await waitForPlanningDragRelease();
        setStatusFilter("all");
        reconcilePlanningResultForRange(result, executionRange, { replaceShiftSegments: true });
        planningMutationQueue.current.updateIntents(intent => (
          rebaseDependentPlanningIntent(intent, executionIntent, result)
        ));
        refreshPlanningInBackground();
        const description = `De overdracht staat nu op ${boundaryTime}; beide aansluitende diensten zijn in één keer aangepast.`;
        toast({ title: "Overdrachtsgrens aangepast", description });
        setLiveMessage(description);
      },
      onError: error => recoverQueuedPlanningAfterExecutionError(error, executedRequest || {
        action: "resize_shared_task_boundary",
        task_occurrence_id: occurrence.id,
      }),
      onCallbackError: context => recoverQueuedPlanningAfterCallbackError(context, {
        executionRange,
        replaceShiftSegments: true,
      }),
    });
    void operation.catch(() => undefined);
    setStatusFilter("all");
    return { accepted: true, operation };
  };

  const composeAndAssignOccurrence = async (occurrence, personnelItem, serviceDate, candidateWarnings = null) => {
    if (!occurrence || !personnelItem) return;
    if (planningCommitFenceRef.current) return null;
    const state = getOccurrencePlanningState({
      occurrence,
      segments: taskSegments,
      shifts: shiftsInRange,
      assignments: assignmentsInRange,
    });
    if (state.coverage.status === "full") {
      const openShiftTarget = getOccurrenceStaffingTarget({
        occurrence,
        planningState: state,
        personnelId: personnelItem.id,
        serviceDate,
        shifts: shiftsInRange,
        assignments: assignmentsInRange,
        segments: taskSegments,
      });

      if (openShiftTarget) {
        const targetShift = shiftsInRangeById.get(String(openShiftTarget.shiftId));
        await executeAssignment(targetShift, personnelItem, openShiftTarget.slotIndex);
        return;
      }
      const description = `${personnelName(personnelItem)} is al gekoppeld of er is op ${serviceDate} geen vrije dienst die volledig binnen deze kalenderdag valt. Open een nachtdienst expliciet om de volledige inzet te beoordelen.`;
      toast({ title: "Geen vrije plaats voor deze taak", description });
      setLiveMessage(description);
      return;
    }

    const timelineSuggestion = getSuggestedTaskTimelineAllocation({
      occurrence,
      serviceDate,
      segments: taskSegments,
      shifts: shiftsInRange,
    });
    const segments = timelineSuggestion?.segment ? [timelineSuggestion.segment] : [];
    if (segments.length === 0) {
      toast({
        title: "Geen open taakdeel op deze dag",
        description: "Kies een dag waarop nog klantvraag openstaat, of vul een bestaande open dienst.",
      });
      return;
    }
    const assignmentSource = perspective === "object" ? "object_matrix_drop" : "employee_matrix_drop";
    const initialResolution = resolveQueuedOccurrenceMutation({
      snapshot: queuedEffectiveSnapshot(),
      occurrenceId: occurrence.id,
      personnelId: personnelItem.id,
      personnelName: personnelName(personnelItem),
      serviceDate,
      preferredSegment: segments[0],
      assignmentSource,
      allowOptimisticAdjacent: true,
    });
    if (initialResolution.status !== "ready") {
      const error = queuedPlanningRebaseError(initialResolution.reason);
      toast({ variant: "destructive", title: "Taakdeel kan niet worden ingepland", description: error.message });
      setLiveMessage(error.message);
      return null;
    }

    const pendingKey = createPlanningMutationKey("matrix-compose-and-assign");
    const executionRange = Object.freeze({ periodStart, periodEnd });
    const optimisticRecords = optimisticQueuedOccurrenceRecords({
      key: pendingKey,
      resolution: initialResolution,
      personnelItem,
    });
    const immediateWarnings = candidateWarnings || getAssignmentWarnings({
      shift: optimisticRecords.shifts[0],
      personnel: personnelItem,
      ...warningContext,
    });
    optimisticRecords.assignments = optimisticRecords.assignments.map(item => ({
      ...item,
      warnings: immediateWarnings,
      warning_snapshot: immediateWarnings,
    }));
    let executionResolution = null;
    let executionOptimisticRecords = null;
    let executedRequest = null;
    const operation = planningMutationQueue.current.enqueue({
      id: pendingKey,
      resourceKeys: [
        `occurrence:${occurrence.id}`,
        ...(initialResolution.kind === "merge" ? [`shift:${initialResolution.adjacent.candidate.shift.id}`] : []),
        ...personnelDayQueueResourceKeys(personnelItem.id, initialResolution.allocation.segment),
      ],
      intent: optimisticRecords,
      execute: () => {
        executionResolution = resolveQueuedOccurrenceMutation({
          snapshot: planningExecutionSnapshotFromCache(
            queryClient,
            executionRange.periodStart,
            executionRange.periodEnd,
          ),
          occurrenceId: occurrence.id,
          personnelId: personnelItem.id,
          personnelName: personnelName(personnelItem),
          serviceDate,
          preferredSegment: segments[0],
          assignmentSource,
          warnings: immediateWarnings,
        });
        if (executionResolution.status !== "ready") throw queuedPlanningRebaseError(executionResolution.reason);
        executionOptimisticRecords = optimisticQueuedOccurrenceRecords({
          key: pendingKey,
          resolution: executionResolution,
          personnelItem,
          warnings: immediateWarnings,
        });
        executionOptimisticRecords.assignments = executionOptimisticRecords.assignments.map(item => ({
          ...item,
          warnings: immediateWarnings,
          warning_snapshot: immediateWarnings,
        }));
        planningMutationQueue.current.updateIntent(pendingKey, () => executionOptimisticRecords);
        executedRequest = executionResolution.payload;
        return runQueuedIntentMutation(pendingKey, executedRequest);
      },
      onSuccess: async result => {
        await waitForPlanningDragRelease();
        const replaceShiftSegments = executionResolution?.kind === "merge";
        reconcilePlanningResultForRange(result, executionRange, { replaceShiftSegments });
        planningMutationQueue.current.updateIntents(intent => (
          rebaseDependentPlanningIntent(intent, executionOptimisticRecords, result)
        ));
        refreshPlanningInBackground();
        if (replaceShiftSegments) {
          return;
        }
        finishTimelineAssignment(result, executionResolution.allocation.occurrence, personnelItem, {
          reconciled: true,
          optimisticWarnings: immediateWarnings,
        });
      },
      onError: error => recoverQueuedPlanningAfterExecutionError(error, executedRequest || {
        action: "compose_and_assign",
        occurrence_id: occurrence.id,
      }),
      onCallbackError: context => recoverQueuedPlanningAfterCallbackError(context, {
        executionRange,
        replaceShiftSegments: executionResolution?.kind === "merge",
      }),
    });
    notifyOptimisticTimelineAssignment(occurrence, personnelItem, immediateWarnings);
    return operation;
  };

  const openOccurrenceStaffing = occurrence => {
    const planningState = occurrencePlanningStates.get(String(occurrence?.id));
    const openShift = getOccurrenceOpenStaffingShift({
      occurrence,
      planningState,
      shifts: shiftsInRange,
      assignments: assignmentsInRange,
      segments: taskSegments,
    });
    if (!openShift) {
      toast({
        title: "Geen open bezettingsplaats",
        description: "De gekoppelde diensten zijn inmiddels volledig bezet of niet meer actief.",
      });
      return;
    }
    setStatusFilter("all");
    setPerspective("object");
    setSidePanelMode("employees");
    setSelectedShiftId(openShift.id);
    setLiveMessage(`Bezetting geopend voor ${openShift.name || "de gekoppelde dienst"}.`);
  };

  const eligibilityShiftContextForOccurrence = occurrence => {
    const object = objectsById.get(String(occurrence?.object_id || ""));
    return buildPlanningEligibilityObjectShiftContext({ object, occurrence });
  };

  const resolveDropEligibilityPreview = drop => {
    if (!drop?.personnelId) return null;
    const personnelItem = activePersonnel.find(item => String(item.id) === String(drop.personnelId));
    if (!personnelItem) return null;
    if (drop.kind === "assign_personnel_to_shift") {
      const shift = allShifts.find(item => String(item.id) === String(drop.shiftId));
      if (!shift) return null;
      const adjacentMerge = resolveOpenShiftSamePersonnelMerge({
        snapshot: queuedEffectiveSnapshot(),
        targetShift: shift,
        personnelId: personnelItem.id,
      });
      const previewShift = adjacentMerge.status === "merge" ? {
        ...adjacentMerge.candidate.shift,
        service_date: adjacentMerge.candidate.mergedSegment.start_date,
        end_date: adjacentMerge.candidate.mergedSegment.end_date,
        start_time: adjacentMerge.candidate.mergedSegment.start_time,
        end_time: adjacentMerge.candidate.mergedSegment.end_time,
      } : shift;
      const excludeAssignmentId = adjacentMerge.status === "merge"
        ? adjacentMerge.candidate.assignment.id
        : null;
      const eligibilityCandidate = buildPlanningEligibilityPrefetchCandidate({
        kind: "shift",
        source: adjacentMerge.status === "merge" ? adjacentMerge.candidate.shift : shift,
        shift: previewShift,
        personnelId: personnelItem.id,
        excludeAssignmentId,
      });
      return {
        drop,
        personnel: personnelItem,
        targetLabel: previewShift.name || previewShift.service_name_snapshot || "Open dienst",
        eligibilityCandidate,
        verdict: eligibilityIndex.queryShift({
          personnelId: personnelItem.id,
          shift: previewShift,
          excludeAssignmentId,
        }),
      };
    }
    if (!["compose_occurrence_slice_for_personnel", "compose_occurrence_for_personnel", "assign_task_to_employee_day"].includes(drop.kind)) {
      return null;
    }
    const occurrence = taskOccurrencesInRange.find(item => String(item.id) === String(drop.occurrenceId));
    if (!occurrence) return null;
    const serviceDate = getSafeOccurrenceDropServiceDate(occurrence, drop.serviceDate || occurrence.service_date);
    if (!serviceDate) return null;
    let preferredSegment = null;
    if (drop.startTime && drop.endTime) {
      preferredSegment = occurrenceSegmentForTimelineSlice(
        occurrence,
        serviceDate,
        drop.startTime,
        drop.endTime,
      );
    } else {
      const allocation = getSuggestedTaskTimelineAllocation({
        occurrence,
        serviceDate,
        segments: taskSegments,
        shifts: shiftsInRange,
      });
      preferredSegment = allocation?.segment || null;
    }
    if (!preferredSegment) return null;
    const occurrenceProjection = resolveOccurrenceEligibilityProjection({
      snapshot: queuedEffectiveSnapshot(),
      occurrence,
      personnelItem,
      serviceDate,
      preferredSegment,
      shiftContext: eligibilityShiftContextForOccurrence(occurrence),
    });
    if (!occurrenceProjection?.shift) return null;
    const eligibilityCandidate = buildPlanningEligibilityPrefetchCandidate({
      kind: "occurrence",
      source: occurrence,
      shift: occurrenceProjection.shift,
      personnelId: personnelItem.id,
      occurrenceId: occurrence.id,
      excludeAssignmentId: occurrenceProjection.excludeAssignmentId,
    });
    return {
      drop,
      personnel: personnelItem,
      occurrence,
      serviceDate,
      targetLabel: occurrence.task_name_snapshot || "Open taak",
      occurrenceResolution: occurrenceProjection.resolution,
      eligibilityCandidate,
      verdict: eligibilityIndex.queryShift({
        personnelId: personnelItem.id,
        shift: occurrenceProjection.shift,
        excludeAssignmentId: occurrenceProjection.excludeAssignmentId,
        kind: "occurrence",
        occurrenceId: occurrence.id,
      }),
    };
  };
  resolveDropEligibilityPreviewRef.current = resolveDropEligibilityPreview;

  const handleBeforeDragStart = start => {
    // A new gesture must never silently discard an earlier accepted drop.
    // Warm facts make ordinary rapid planning ready immediately; a genuinely
    // source-conflicted drop remains owned by its handshake until it settles.
    beginPlanningDragInteraction();
    const draggableId = String(start?.draggableId || "");
    if (!draggableId.startsWith("personnel:")) return;
    // Candidate ranking includes live scheduled hours. A delete ACK can change
    // that ranking while Pangea owns a draggable; pin its index until onDragEnd
    // so the publisher and pointer sensor keep the same source node.
    setDragPersonnelOrder(candidates.map(candidate => String(candidate.personnel.id)));
  };

  const handleDragUpdate = update => {
    const drop = resolvePlanningDrop(update);
    const preview = drop ? resolveDropEligibilityPreview(drop) : null;
    setDragEligibilityPreview(preview);
  };

  const clearPendingEligibilityDrop = pendingId => {
    if (pendingId && pendingEligibilityDropRef.current?.id !== pendingId) return false;
    const next = pendingEligibilityDropBacklogRef.current.shift() || null;
    pendingEligibilityDropRef.current = next;
    setPendingEligibilityDrop(next);
    return true;
  };

  const holdPlanningDropForEligibility = (result, preview) => {
    const pending = createPendingPlanningEligibilityDrop({ result, preview });
    if (!pending) return false;
    if (pendingEligibilityDropRef.current) {
      const backlog = pendingEligibilityDropBacklogRef.current;
      if (!backlog.some(item => item.id === pending.id)) backlog.push(pending);
    } else {
      pendingEligibilityDropRef.current = pending;
      setPendingEligibilityDrop(pending);
    }
    const description = "De volledige CAO- en inzetcontrole wordt op de achtergrond afgerond; u hoeft de medewerker niet opnieuw te slepen.";
    // Keep the rare cold/source-conflicted path accessible without interrupting
    // rapid planning with a toast. The normal warm path never enters this gate.
    setLiveMessage(description);
    return true;
  };

  const reportUnavailablePlanningDrop = preview => {
    const description = preview?.verdict?.status === "stale"
      ? "De brongegevens voor deze medewerker zijn gewijzigd. De medewerker is niet ingepland; probeer het opnieuw zodra de controle actueel is."
      : preview?.verdict?.status === "unavailable"
        ? "De volledige CAO- en inzetcontrole kon niet veilig worden afgerond. De medewerker is niet ingepland."
        : "De taak of medewerker staat niet meer in de actuele planning. De medewerker is niet ingepland.";
    toast({ variant: "destructive", title: "Voorcontrole niet afgerond", description });
    setLiveMessage(description);
  };

  const processPlanningDrop = (result, eligibilityPreview = null, { allowDeferred = true } = {}) => {
    if (!editing) return;
    const drop = resolvePlanningDrop(result);
    if (!drop) return;
    const preview = eligibilityPreview || resolveDropEligibilityPreview(drop);
    if (preview?.verdict?.status !== "ready") {
      if (allowDeferred && preview?.eligibilityCandidate && holdPlanningDropForEligibility(result, preview)) return;
      reportUnavailablePlanningDrop(preview);
      return;
    }
    const candidateWarnings = preview?.verdict?.warnings || null;

    if (drop.kind === "compose_occurrence_slice_for_personnel") {
      const occurrence = taskOccurrencesInRange.find(item => String(item.id) === String(drop.occurrenceId));
      const personnelItem = activePersonnel.find(item => String(item.id) === String(drop.personnelId));
      if (occurrence && personnelItem) {
        composeAndAssignOccurrenceSlice({
          occurrence,
          personnelItem,
          serviceDate: drop.serviceDate,
          startTime: drop.startTime,
          endTime: drop.endTime,
          candidateWarnings,
        }).catch(() => undefined);
      }
      return;
    }

    if (drop.kind === "assign_personnel_to_shift") {
      const shift = allShifts.find(item => String(item.id) === String(drop.shiftId));
      const personnelItem = activePersonnel.find(item => String(item.id) === String(drop.personnelId));
      if (shift && personnelItem) {
        const projectionDate = drop.serviceDate || shift.service_date;
        if (!planningShiftContainedInDate(shift, projectionDate)) {
          const description = `${shift.name || "Deze dienst"} loopt buiten ${projectionDate}. Open de dienst en kies daarna bewust een medewerker voor de volledige nachtdienst.`;
          setStatusFilter("all");
          setPerspective("object");
          setSidePanelMode("employees");
          setSelectedShiftId(shift.id);
          setLiveMessage(description);
          toast({ title: "Volledige nachtdienst bevestigen", description });
          return;
        }
        executeAssignment(shift, personnelItem, drop.slotIndex, candidateWarnings).catch(() => undefined);
      }
      return;
    }

    const occurrence = taskOccurrencesInRange.find(item => String(item.id) === String(drop.occurrenceId));
    const personnelItem = activePersonnel.find(item => String(item.id) === String(drop.personnelId));
    if (!occurrence || !personnelItem) return;
    const dropServiceDate = getSafeOccurrenceDropServiceDate(occurrence, drop.serviceDate);
    if (!dropServiceDate || !taskOccurrenceOverlapsDate(occurrence, dropServiceDate)) {
      const description = drop.serviceDate
        ? `Deze taak raakt ${drop.serviceDate} niet. Sleep haar naar een dag binnen het taakvenster.`
        : "Deze oudere sleepactie bevat geen veilige kalenderdag. Sleep de taak of medewerker opnieuw vanuit het actuele planningsoverzicht.";
      toast({ variant: "destructive", title: "Taak staat op een andere dag", description });
      setLiveMessage(description);
      return;
    }
    composeAndAssignOccurrence(occurrence, personnelItem, dropServiceDate, candidateWarnings).catch(() => undefined);
  };
  processPlanningDropRef.current = processPlanningDrop;

  const handleDragEnd = result => {
    setDragEligibilityPreview(null);
    // Let the drag engine release its publisher and input lock before any
    // planning mutation changes or unmounts draggable/droppable elements.
    window.setTimeout(() => {
      try {
        const preview = resolveDropEligibilityPreviewRef.current?.(resolvePlanningDrop(result)) || null;
        processPlanningDropRef.current?.(result, preview);
      } finally {
        finishPlanningDragInteraction();
        // Keep source indices fixed through Pangea's own onDragEnd cleanup.
        window.setTimeout(() => setDragPersonnelOrder(null), 0);
      }
    }, 0);
  };

  useEffect(() => {
    if (!pendingEligibilityDrop) return undefined;
    const pending = pendingEligibilityDrop;
    let cancelled = false;
    let timer = null;
    const isCurrent = () => (
      !cancelled && pendingEligibilityDropRef.current?.id === pending.id
    );
    const currentDrop = resolvePlanningDrop(pending.result);
    const preview = resolveDropEligibilityPreviewRef.current?.(currentDrop) || null;
    const queuedSourceConflict = planningEligibilityCandidateHasQueuedSourceConflict(
      preview?.eligibilityCandidate,
      planningMutationQueue.current.getSnapshot().resourceKeys,
    );
    const resolution = resolvePendingPlanningEligibilityDrop({
      pending,
      preview,
      queueIdle: (
        !queuedSourceConflict
        && !eligibilityDependencyRefreshActiveRef.current
        && !planningResizeGestureActiveRef.current
      ),
    });

    const finishWithoutWrite = (title, description, variant = "destructive") => {
      if (!isCurrent() || !clearPendingEligibilityDrop(pending.id)) return;
      toast({ variant, title, description });
      setLiveMessage(description);
    };

    if (resolution.status === "ready" && !editing) {
      finishWithoutWrite(
        "Sleepactie geannuleerd",
        "De bewerkmodus of zichtbare planning is intussen gewijzigd. De medewerker is niet op de achtergrond alsnog ingepland.",
        "default",
      );
    } else if (resolution.status === "ready") {
      if (clearPendingEligibilityDrop(pending.id)) {
        // Use the exact preview that was proven ready in this render. Clearing
        // the pending state must not cancel the commit, and recomputing later
        // could pair the drop with a different basis or an unseen warning.
        processPlanningDropRef.current?.(pending.result, preview, { allowDeferred: false });
      }
    } else if (resolution.status === "warnings_changed") {
      const warningSummary = resolution.newWarnings
        .slice(0, 2)
        .map(item => item.title || item.detail || item.message)
        .filter(Boolean)
        .join(" · ");
      finishWithoutWrite(
        "Nieuwe inzetwaarschuwing",
        warningSummary
          ? `${warningSummary} De medewerker is nog niet ingepland; de waarschuwing is vóór de planningactie getoond.`
          : "De actuele inzetcontrole bevat een nieuwe waarschuwing. De medewerker is nog niet ingepland.",
        resolution.newWarnings.some(item => item.severity === "critical") ? "destructive" : "default",
      );
    } else if (resolution.status === "request") {
      const requestDelayMs = Math.min(
        Math.max(0, Number(resolution.delayMs || 0)),
        Math.max(1, Number(pending.expiresAt || 0) - Date.now()),
      );
      timer = window.setTimeout(() => {
        if (!isCurrent() || !preview?.eligibilityCandidate) return;
        if (Date.now() >= Number(pending.expiresAt || 0)) {
          setEligibilityFreshnessTick(value => value + 1);
          return;
        }
        const outcome = requestUrgentEligibilityCandidatesRef.current?.(
          [preview.eligibilityCandidate],
          {
            forceRetry: true,
            timeoutMs: Math.max(1, Number(pending.expiresAt || 0) - Date.now()),
          },
        );
        if (outcome === "started" && isCurrent()) {
          const attempted = recordPendingPlanningEligibilityAttempt(pending, resolution.attemptKey);
          pendingEligibilityDropRef.current = attempted;
          setPendingEligibilityDrop(attempted);
          return;
        }
        if (outcome === "known" && !eligibilityDependencyRefreshActiveRef.current) {
          // The server evidence is current but one of the local fact queries is
          // not. Refresh that bounded dependency wave; do not spend another
          // server attempt or leave the held drop waiting forever.
          void refetchEligibilityDependencies({ maxConsecutiveFailures: 2 });
        }
        // Pending, blocked and known-local-stale states all retain a watchdog.
        // This guarantees the 15-second fail-closed deadline even when a
        // network promise never settles or a dependency refresh is cancelled.
        const remainingMs = Math.max(1, Number(pending.expiresAt || 0) - Date.now());
        timer = window.setTimeout(
          () => setEligibilityFreshnessTick(value => value + 1),
          Math.min(500, remainingMs),
        );
      }, requestDelayMs);
    } else if (resolution.status === "unavailable") {
      finishWithoutWrite(
        "Voorcontrole tijdelijk niet beschikbaar",
        "De CAO- en inzetcontrole bleef na twee begrensde pogingen niet beschikbaar. De medewerker is niet ingepland.",
      );
    } else if (resolution.status === "expired") {
      finishWithoutWrite(
        "Voorcontrole verlopen",
        "De planning veranderde te lang tijdens de controle. De medewerker is niet ingepland.",
      );
    } else if (resolution.status === "target_missing") {
      finishWithoutWrite(
        "Planningdoel gewijzigd",
        "De open taak bestaat niet meer in deze vorm. De medewerker is niet ingepland.",
      );
    } else {
      const remainingMs = Math.max(1, Number(pending.expiresAt || 0) - Date.now());
      timer = window.setTimeout(
        () => setEligibilityFreshnessTick(value => value + 1),
        resolution.status === "wait_queue" ? remainingMs : Math.min(500, remainingMs),
      );
    }

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [
    eligibilityFreshnessTick,
    eligibilityDependencyRefreshActive,
    eligibilityServerDecisions,
    editing,
    pendingEligibilityDrop,
    planningQueueState.isIdle,
    planningQueueState.resourceKeys,
    planningResizeGestureActive,
    refetchEligibilityDependencies,
  ]);

  const handleShiftActionConfirm = async payload => {
    const action = shiftAction?.action;
    if (!action) return;
    const result = await runIntentMutation("shift-action", `planning-${action}`, {
      action,
      shift_id: payload.shift.id,
      service_date: payload.service_date,
      start_time: payload.start_time,
      end_time: payload.end_time,
      expected_shift_revision: Number(payload.shift.revision || 1),
    });
    reconcilePlanningResult(result);
    refreshPlanningInBackground();
    const description = action === "copy"
      ? `${payload.shift.name} is zonder medewerkers gekopieerd naar ${payload.service_date}.`
      : `${payload.shift.name} is verplaatst naar ${payload.service_date}.`;
    rememberUndo(result, description);
    if (result?.undoable !== true) {
      toast({ title: "Conceptplanning bijgewerkt", description });
    }
    setLiveMessage(description);
    setShiftAction(null);
  };

  const saveServiceEdit = async ({ shift, assignment, segments: requestSegments = [], startTime, endTime, personnelId }) => {
    let currentShift = shift;
    const timesChanged = startTime !== shift.start_time || endTime !== shift.end_time;
    if (timesChanged && requestSegments.length === 1) {
      const segment = requestSegments[0];
      const startDate = segment.start_date || shift.service_date;
      const endDate = toDateKey(addDays(startDate, endTime <= startTime ? 1 : 0));
      resizeTimelineTaskSegment({
        shift,
        segment,
        startDate,
        endDate,
        startTime,
        endTime,
        notification: {
          title: "Dienst bijgewerkt",
          description: `${shift.name || "Dienst"} loopt nu van ${startTime} tot ${endTime}.`,
        },
      });
    } else if (timesChanged && requestSegments.length) {
      if (shift._optimistic_pending) {
        const description = "Een samengestelde dienst kan pas na de eerste serversynchronisatie via Dienstinhoud worden aangepast.";
        toast({ title: "Dienstinhoud wordt voorbereid", description });
        setLiveMessage(description);
        return;
      }
      const ordered = [...requestSegments].sort((a, b) => Number(a.sequence_index || 0) - Number(b.sequence_index || 0));
      const affectedIds = [...new Set(ordered.map(item => String(item.task_occurrence_id)))];
      const result = await runIntentMutation(`service-edit-time:${shift.id}`, "planning-service-edit-time", {
        action: "update_shift_composition",
        shift_id: shift.id,
        expected_shift_revision: Number(shift.revision || 1),
        service_name: shift.name || shift.service_name_snapshot,
        required_count: Number(shift.required_count || 1),
        expected_occurrence_revisions: Object.fromEntries(affectedIds.map(id => [id, Number(taskOccurrences.find(item => String(item.id) === id)?.revision || 1)])),
        segments: ordered.map((segment, index) => ({
          task_occurrence_id: segment.task_occurrence_id,
          start_date: segment.start_date,
          end_date: index === ordered.length - 1
            ? toDateKey(addDays(segment.start_date, endTime <= (index === 0 ? startTime : segment.start_time) ? 1 : 0))
            : segment.end_date,
          start_time: index === 0 ? startTime : segment.start_time,
          end_time: index === ordered.length - 1 ? endTime : segment.end_time,
        })),
      });
      reconcilePlanningResult(result, { replaceShiftSegments: true });
      currentShift = result.shift || currentShift;
    } else if (timesChanged) {
      const result = await runIntentMutation(`service-edit-time:${shift.id}`, "planning-service-edit-time", {
        action: "move",
        shift_id: shift.id,
        service_date: shift.service_date,
        start_time: startTime,
        end_time: endTime,
        expected_shift_revision: Number(shift.revision || 1),
      });
      reconcilePlanningResult(result);
      currentShift = result.shift || currentShift;
    }
    const currentPersonnelId = assignment?.personnel_id ? String(assignment.personnel_id) : null;
    if (currentPersonnelId !== personnelId) {
      if (assignment) {
        await handleUnassign(currentShift, assignment);
      }
      if (personnelId) {
        const person = activePersonnel.find(item => String(item.id) === String(personnelId));
        if (person) void executeAssignment(currentShift, person, Number(assignment?.slot_index || 0)).catch(() => undefined);
      }
    }
    refreshPlanningInBackground();
    setServiceEditor(null);
    setLiveMessage(`${shift.name || "Dienst"} is bijgewerkt.`);
  };

  const openTaskComposer = ({ shift = null, occurrence = null } = {}) => {
    if (!editing) return;
    setComposer({ shift, occurrence });
    setSidePanelMode("tasks");
  };

  const handleCompositionSave = async payload => {
    const result = await runActionMutation.mutateAsync(payload);
    reconcilePlanningResult(result, { replaceShiftSegments: Boolean(composer?.shift) });
    refreshPlanningInBackground();
    const description = `${result.shift?.service_name_snapshot || result.shift?.name || "Dienst"} is als concept opgeslagen met ${result.segments?.length || 0} taaksegmenten.`;
    toast({
      title: composer?.shift ? "Dienstinhoud bijgewerkt" : "Conceptdienst samengesteld",
      description,
    });
    setSelectedShiftId(null);
    setComposer(null);
    setSidePanelMode("tasks");
    setLiveMessage(description);
  };

  const handleCancelTaskShift = async shift => {
    if (!shift || planningCommitFenceRef.current) return null;
    const snapshot = queuedEffectiveSnapshot();
    const targetSegments = snapshot.segments.filter(item => (
      item.status !== "removed" && String(item.shift_id) === String(shift.id)
    ));
    if (targetSegments.length !== 1) {
      const description = "Deze samengestelde dienst kan alleen via Dienstinhoud veilig worden verwijderd.";
      toast({ variant: "destructive", title: "Dienst niet rechtstreeks verwijderd", description });
      setLiveMessage(description);
      return null;
    }
    const targetSegment = targetSegments[0];
    const occurrenceId = String(targetSegment.task_occurrence_id);
    const targetAssignments = activeAssignments(snapshot.assignments).filter(item => (
      String(item.planning_shift_id || item.shift_id) === String(shift.id)
    ));
    const initialNeighbors = adjacentOpenTaskServiceNeighbors({
      snapshot,
      shift,
      segment: targetSegment,
    });
    const initialLeftNeighbor = initialNeighbors.find(item => item.side === "left") || null;
    const initialRightNeighbor = initialNeighbors.find(item => item.side === "right") || null;
    const initialSurvivor = initialLeftNeighbor || (initialRightNeighbor ? {
      shift,
      segment: targetSegment,
      side: "target",
    } : null);
    const initialAbsorbedNeighbors = initialSurvivor
      ? initialNeighbors.filter(item => String(item.shift.id) !== String(initialSurvivor.shift.id))
      : [];
    const pendingKey = cancelTaskShift?.idempotencyKey || createPlanningMutationKey("vacate-task-shift-partition");
    const executionRange = Object.freeze({ periodStart, periodEnd });
    const parentIntentIds = [...new Set([
      planningOriginIntentId(shift),
      planningOriginIntentId(targetSegment),
      ...initialNeighbors.flatMap(item => [
        planningOriginIntentId(item.shift),
        planningOriginIntentId(item.segment),
      ]),
    ].filter(id => id && planningMutationQueue.current.has(id)))];
    const optimisticIntent = {
      ...buildDependentPlanningDeleteIntent({
        key: pendingKey,
        originIntentId: pendingKey,
        shift,
        segments: targetSegments,
        assignments: targetAssignments,
        survivorShift: initialSurvivor?.shift || null,
        survivorSegment: initialSurvivor?.segment || null,
        absorbedShifts: initialAbsorbedNeighbors.map(item => item.shift),
        absorbedSegments: initialAbsorbedNeighbors.map(item => item.segment),
      }),
      shift_id: shift.id,
      segment_id: targetSegment.id,
      task_occurrence_id: occurrenceId,
    };
    let executionIntent = optimisticIntent;
    let executedRequest = null;
    const operation = planningMutationQueue.current.enqueue({
      id: pendingKey,
      dependsOn: parentIntentIds,
      resourceKeys: [
        `shift:${shift.id}`,
        `occurrence:${occurrenceId}`,
        ...initialNeighbors.map(item => `shift:${item.shift.id}`),
        ...targetAssignments.flatMap(item => personnelDayQueueResourceKeys(item.personnel_id, shift)),
      ],
      intent: optimisticIntent,
      execute: ({ intent }) => {
        executionIntent = intent;
        const currentSnapshot = planningExecutionSnapshotFromCache(
          queryClient,
          executionRange.periodStart,
          executionRange.periodEnd,
        );
        const currentShift = resolvePlanningShiftTarget(currentSnapshot, { id: intent.shift_id });
        const currentSegment = resolvePlanningSegmentTarget(currentSnapshot, { id: intent.segment_id });
        const currentOccurrence = resolvePlanningOccurrenceTarget(currentSnapshot, { id: intent.task_occurrence_id });
        const blocked = [currentShift, currentSegment, currentOccurrence]
          .find(target => target.status !== "ready");
        if (blocked) throw queuedPlanningRebaseError(blocked.reason);
        const currentAssignments = activeAssignments(currentSnapshot.assignments).filter(item => (
          String(item.planning_shift_id || item.shift_id) === String(currentShift.record.id)
        ));
        const neighbors = adjacentOpenTaskServiceNeighbors({
          snapshot: currentSnapshot,
          shift: currentShift.record,
          segment: currentSegment.record,
        });
        executedRequest = neighbors.length > 0 ? {
          action: "vacate_task_shift_partition",
          shift_id: currentShift.record.id,
          segment_id: currentSegment.record.id,
          expected_shift_revision: Number(currentShift.record.revision || 1),
          expected_segment_revision: Number(currentSegment.record.revision || 1),
          expected_occurrence_revision: Number(currentOccurrence.record.revision || 1),
          expected_assignment_revisions: Object.fromEntries(currentAssignments.map(item => [
            item.id,
            Number(item.revision || 1),
          ])),
          expected_neighbor_shift_revisions: Object.fromEntries(neighbors.map(item => [
            item.shift.id,
            Number(item.shift.revision || 1),
          ])),
          expected_neighbor_segment_revisions: Object.fromEntries(neighbors.map(item => [
            item.segment.id,
            Number(item.segment.revision || 1),
          ])),
        } : {
          action: "cancel_task_shift",
          shift_id: currentShift.record.id,
          expected_shift_revision: Number(currentShift.record.revision || 1),
          expected_occurrence_revisions: {
            [currentOccurrence.record.id]: Number(currentOccurrence.record.revision || 1),
          },
        };
        return runQueuedIntentMutation(pendingKey, executedRequest);
      },
      onSuccess: async result => {
        // The optimistic open gap is already visible while the delete is in
        // flight. Do not replace its registered droppable or reorder the
        // employee source list until Pangea has released the active pointer.
        await waitForPlanningDragRelease();
        reconcilePlanningResultForRange(result, executionRange);
        planningMutationQueue.current.updateIntents(intent => (
          rebaseDependentPlanningIntent(intent, executionIntent, result)
        ));
        refreshPlanningInBackground();
        const retainedOpenShift = (result.shifts || []).find(item => (
          item.status !== "cancelled"
          && !activeAssignments(result.assignments || []).some(assignment => (
            String(assignment.planning_shift_id || assignment.shift_id) === String(item.id)
          ))
        ));
        const description = retainedOpenShift
          ? `${shift.name || "Dienst"} is verwijderd; de aansluitende open dienst bestrijkt nu ${retainedOpenShift.start_time}–${retainedOpenShift.end_time}.`
          : `${shift.name || "Dienst"} is verwijderd; het taakdeel staat weer open.`;
        toast({ title: "Dienst verwijderd", description });
        setLiveMessage(description);
      },
      onError: error => recoverQueuedPlanningAfterExecutionError(error, executedRequest || {
        action: initialSurvivor ? "vacate_task_shift_partition" : "cancel_task_shift",
        shift_id: shift.id,
      }),
      onCallbackError: context => recoverQueuedPlanningAfterCallbackError(context, { executionRange }),
    });
    void operation.catch(() => undefined);
    setSelectedShiftId(null);
    setCancelTaskShift(null);
    setSidePanelMode("tasks");
    return { accepted: true, operation };
  };

  const planningStats = useMemo(() => {
    const active = activeAssignments(ownedAssignmentsInRange);
    const warnings = active.flatMap(assignmentWarnings);
    const compositionWarnings = ownedShiftsInRange.flatMap(shift => (
      Array.isArray(shift.service_context_snapshot?.composition_warnings)
        ? shift.service_context_snapshot.composition_warnings
        : []
    ));
    const vacantCount = ownedShiftsInRange.reduce((count, shift) => {
      const assigned = (assignmentsInRangeByShift.get(String(shift.id)) || []).length;
      return count + Math.max(0, Math.max(1, Number(shift.required_count || 1)) - assigned);
    }, 0);
    const coverage = taskCoverageSummary(ownedTaskOccurrencesInRange, taskSegments, shiftsInRange);
    const ownedPlanningStates = ownedTaskOccurrencesInRange.map(occurrence => (
      occurrencePlanningStates.get(String(occurrence.id))
    )).filter(Boolean);
    const workQueueCount = ownedPlanningStates.filter(state => state.readiness !== "ready").length;
    const staffingOnlyCount = ownedPlanningStates.filter(state => (
      state.coverage.status === "full" && state.readiness === "needs_staffing"
    )).length;
    const securityPlanWarningCount = ownedTaskOccurrencesInRange.filter(occurrence => (
      !occurrence.security_plan_revision_id || !occurrence.security_plan_snapshot?.published_revision
    )).length;
    const sourceChangeCount = openTaskSourceChanges.filter(change => (
      ownedTaskOccurrencesInRange.some(occurrence => String(occurrence.id) === String(change.task_occurrence_id || change.occurrence_id))
      || [...new Set([change.shift_id, ...(change.shift_ids || [])].filter(Boolean).map(String))]
        .some(shiftId => ownedShiftIdsInRange.has(shiftId))
    )).length;
    return {
      draftShiftCount: ownedShiftsInRange.filter(shift => shift.status === "draft" || Number(shift.revision || 0) > Number(shift.published_revision || 0)).length,
      draftAssignmentCount: active.filter(item => item.status === "draft" || Number(item.revision || 0) > Number(item.published_revision || 0)).length,
      warningCount: warnings.length + compositionWarnings.length + coverage.open + coverage.partial + securityPlanWarningCount + sourceChangeCount,
      criticalCount: warnings.filter(warning => warning.severity === "critical").length
        + compositionWarnings.filter(warning => warning.severity === "critical").length
        + coverage.open
        + coverage.partial
        + securityPlanWarningCount
        + sourceChangeCount,
      vacantCount,
      taskCoverage: coverage,
      workQueueCount,
      staffingOnlyCount,
      securityPlanWarningCount,
      sourceChangeCount,
    };
  }, [assignmentsInRangeByShift, occurrencePlanningStates, openTaskSourceChanges, ownedAssignmentsInRange, ownedShiftIdsInRange, ownedShiftsInRange, ownedTaskOccurrencesInRange, shiftsInRange, taskSegments]);
  const publicationStats = useMemo(() => {
    const taskCoverage = taskCoverageSummary(ownedTaskOccurrencesInRange, taskSegments, shiftsInRange);
    const securityPlanWarningCount = ownedTaskOccurrencesInRange.filter(occurrence => (
      !occurrence.security_plan_revision_id || !occurrence.security_plan_snapshot?.published_revision
    )).length;
    const nonTaskWarningCount = planningStats.warningCount
      - planningStats.taskCoverage.open
      - planningStats.taskCoverage.partial
      - planningStats.securityPlanWarningCount;
    const nonTaskCriticalCount = planningStats.criticalCount
      - planningStats.taskCoverage.open
      - planningStats.taskCoverage.partial
      - planningStats.securityPlanWarningCount;
    return {
      ...planningStats,
      taskCoverage,
      securityPlanWarningCount,
      warningCount: nonTaskWarningCount + taskCoverage.open + taskCoverage.partial + securityPlanWarningCount,
      criticalCount: nonTaskCriticalCount + taskCoverage.open + taskCoverage.partial + securityPlanWarningCount,
      sourceChangeCount: planningStats.sourceChangeCount,
    };
  }, [ownedTaskOccurrencesInRange, planningStats, shiftsInRange, taskSegments]);

  const assertNoPendingEligibilityDrop = () => {
    if (!pendingEligibilityDropRef.current) return;
    const error = /** @type {any} */ (new Error(
      "De vastgehouden sleepactie wordt nog gecontroleerd. Wacht tot de medewerker is ingepland of de voorcontrole veilig is gestopt.",
    ));
    error.code = "PLANNING_ELIGIBILITY_DROP_PENDING";
    throw error;
  };

  const saveDraft = async () => {
    if (planningCommitFenceRef.current) return;
    const commitToken = Symbol("planning-draft-save");
    const drainCheckpoint = planningMutationQueue.current.createDrainCheckpoint();
    setDraftSavePending(true);
    setLiveMessage("De laatste lokale roosterwijzigingen worden op de achtergrond afgerond.");
    try {
      assertNoPendingEligibilityDrop();
      await settlePlanningDropEnqueues();
      assertNoPendingEligibilityDrop();
      if (planningCommitFenceRef.current) return;
      planningCommitFenceRef.current = commitToken;
      const drainReport = await planningMutationQueue.current.drain({
        checkpoint: drainCheckpoint,
        rejectOnFailure: true,
      });
      planningMutationQueue.current.acknowledgeDrain(drainReport);
      setEditing(false);
      setSavedDraftNotice(true);
      setSelectedShiftId(null);
      const description = "Het conceptrooster is opgeslagen. Je bekijkt nu weer het volledige rooster.";
      setLiveMessage(description);
      toast({ title: "Concept opgeslagen", description });
    } catch (error) {
      if (error?.report) planningMutationQueue.current.acknowledgeDrain(error.report);
      const description = mutationMessage(error);
      setLiveMessage(description);
      toast({
        variant: "destructive",
        title: "Concept niet opgeslagen",
        description,
      });
      throw error;
    } finally {
      if (planningCommitFenceRef.current === commitToken) planningCommitFenceRef.current = null;
      setDraftSavePending(false);
    }
  };

  const publishMutation = useMutation({
    mutationFn: async (/** @type {any} */ payload) => {
      const {
        _planningRange: requestedRange,
        _planningCommitToken: commitToken,
        ...publicationPayload
      } = payload || {};
      const targetRange = requestedRange || {
        periodStart,
        periodEnd,
        view,
        rangeLabel,
      };
      const drainCheckpoint = planningMutationQueue.current.createDrainCheckpoint();
      await settlePlanningDropEnqueues();
      assertNoPendingEligibilityDrop();
      if (planningCommitFenceRef.current) {
        throw new Error("Een andere opslag- of publicatieactie wordt al afgerond.");
      }
      planningCommitFenceRef.current = commitToken;
      let drainReport;
      try {
        drainReport = await planningMutationQueue.current.drain({
          checkpoint: drainCheckpoint,
          rejectOnFailure: true,
        });
      } catch (error) {
        if (error?.report) planningMutationQueue.current.acknowledgeDrain(error.report);
        throw error;
      }
      planningMutationQueue.current.acknowledgeDrain(drainReport);
      const postDrainSnapshot = planningExecutionSnapshotFromCache(
        queryClient,
        targetRange.periodStart,
        targetRange.periodEnd,
      );
      const publicationSnapshot = buildPlanningPublicationSnapshot({
        snapshot: postDrainSnapshot,
        periodStart: targetRange.periodStart,
        periodEnd: targetRange.periodEnd,
      });
      if (publicationSnapshot.shiftIds.length === 0) {
        throw new Error("Er staan na synchronisatie geen diensten in deze periode om te publiceren.");
      }
      const request = mutationIntents.current.prepare("publish", {
        action: "publish",
        period_start: targetRange.periodStart,
        period_end: targetRange.periodEnd,
        scope_type: targetRange.view === "period" ? "range" : "week",
        shift_ids: publicationSnapshot.shiftIds,
        expected_shift_revisions: publicationSnapshot.expectedShiftRevisions,
        publication_reason: `Planning gepubliceerd voor ${targetRange.rangeLabel}`,
        ...publicationPayload,
      }, { prefix: "planning-publication" });
      return invokePlanningApi(request);
    },
    onSuccess: async (result, /** @type {any} */ variables) => {
      mutationIntents.current.clear("publish");
      await refreshPlanning({ includePublications: true });
      setPublishOpen(false);
      setEditing(false);
      setSavedDraftNotice(false);
      setSelectedShiftId(null);
      setUndoStack([]);
      const publishedRangeLabel = variables?._planningRange?.rangeLabel || rangeLabel;
      const message = `Versie ${result?.publication?.version || result?.version || ""} is gepubliceerd voor ${publishedRangeLabel}.`;
      setLiveMessage(message);
      toast({ title: "Planning gepubliceerd", description: message });
    },
    onError: error => {
      toast({
        variant: "destructive",
        title: "Publiceren mislukt",
        description: mutationMessage(error),
      });
    },
    onSettled: (_result, _error, /** @type {any} */ variables) => {
      if (planningCommitFenceRef.current === variables?._planningCommitToken) {
        planningCommitFenceRef.current = null;
      }
    },
  });

  const changePeriod = direction => {
    cancelHeldPlanningDrop(
      "De vastgehouden sleepactie is geannuleerd voordat de zichtbare periode werd gewijzigd. Er is geen medewerker ingepland.",
    );
    if (view === "period" && selectedCaoPeriod) {
      const nextPeriod = getAdjacentCaoPbPlanningPeriod(selectedCaoPeriod, direction);
      if (!nextPeriod) return;
      setSelectedCaoPeriodId(nextPeriod.key);
      setAnchorDate(parseDateKey(nextPeriod.start_date));
    } else setAnchorDate(current => addDays(current, direction * 7));
    setSelectedShiftId(null);
  };

  const updateCustomPeriod = (nextStartValue, nextEndValue) => {
    cancelHeldPlanningDrop(
      "De vastgehouden sleepactie is geannuleerd voordat de zichtbare periode werd gewijzigd. Er is geen medewerker ingepland.",
    );
    const nextRange = getPlanningRange(parseDateKey(nextStartValue) || anchorDate, "period", {
      periodStart: nextStartValue,
      periodEnd: nextEndValue,
      maxDays: 63,
    });
    setCustomPeriodStart(toDateKey(nextRange.start));
    setCustomPeriodEnd(toDateKey(nextRange.end));
    setAnchorDate(nextRange.start);
    setSelectedShiftId(null);
  };

  const goToToday = () => {
    cancelHeldPlanningDrop(
      "De vastgehouden sleepactie is geannuleerd voordat de zichtbare periode werd gewijzigd. Er is geen medewerker ingepland.",
    );
    const today = parseDateKey(new Date());
    if (view === "period") {
      const currentCaoPeriod = resolveCaoPbPlanningPeriod(today);
      if (currentCaoPeriod) setSelectedCaoPeriodId(currentCaoPeriod.key);
      else {
        const dayCount = Math.max(1, range.days.length);
        setCustomPeriodStart(toDateKey(today));
        setCustomPeriodEnd(toDateKey(addDays(today, dayCount - 1)));
      }
    }
    setAnchorDate(today);
    setSelectedShiftId(null);
  };

  const isLoading = [
    shiftsQuery,
    assignmentsQuery,
    taskOccurrencesQuery,
    taskSourceChangesQuery,
    taskSegmentsQuery,
    personnelQuery,
    objectsQuery,
    routesQuery,
  ].some(query => query.isLoading);
  const loadError = [
    shiftsQuery.error,
    assignmentsQuery.error,
    taskOccurrencesQuery.error,
    taskSourceChangesQuery.error,
    taskSegmentsQuery.error,
    personnelQuery.error,
  ].find(Boolean);

  const liveDragEligibilityPreview = dragEligibilityPreview?.drop
    ? resolveDropEligibilityPreview(dragEligibilityPreview.drop)
    : dragEligibilityPreview;

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
      onContextMenu={event => event.preventDefault()}
    >
      <PlanningToolbar
        perspective={perspective}
        onPerspectiveChange={nextPerspective => {
          cancelHeldPlanningDrop(
            "De vastgehouden sleepactie is geannuleerd voordat de planningweergave werd gewijzigd. Er is geen medewerker ingepland.",
          );
          setPerspective(nextPerspective);
          setSelectedShiftId(null);
        }}
        compactMode={compactMode}
        onCompactModeChange={setCompactMode}
        zoomValue={Math.round(planningZoom * 100)}
        onZoomOut={() => setZoomIndex(current => Math.max(0, current - 1))}
        onZoomIn={() => setZoomIndex(current => Math.min(PLANNING_ZOOM_LEVELS.length - 1, current + 1))}
        canZoomOut={zoomIndex > 0}
        canZoomIn={zoomIndex < PLANNING_ZOOM_LEVELS.length - 1}
        view={view}
        onViewChange={nextView => {
          cancelHeldPlanningDrop(
            "De vastgehouden sleepactie is geannuleerd voordat de planningweergave werd gewijzigd. Er is geen medewerker ingepland.",
          );
          if (nextView === "period" && view !== "period") {
            const nextCaoPeriod = resolveCaoPbPlanningPeriod(anchorDate)
              || resolveCaoPbPlanningPeriod(range.start)
              || CAO_PB_PLANNING_PERIODS_2026[0];
            setSelectedCaoPeriodId(nextCaoPeriod.key);
            setAnchorDate(parseDateKey(nextCaoPeriod.start_date));
          }
          setView(nextView);
          setSelectedShiftId(null);
        }}
        rangeLabel={rangeLabel}
        periodStart={periodStart}
        periodEnd={periodEnd}
        periodDayCount={range.days.length}
        onPeriodStartChange={value => updateCustomPeriod(value, periodEnd)}
        onPeriodEndChange={value => updateCustomPeriod(periodStart, value)}
        periodOptions={CAO_PB_PLANNING_PERIODS_2026.map(period => ({
          id: period.key,
          label: period.label,
        }))}
        selectedPeriodId={selectedCaoPeriod?.key || ""}
        onPeriodChange={periodId => {
          cancelHeldPlanningDrop(
            "De vastgehouden sleepactie is geannuleerd voordat de zichtbare periode werd gewijzigd. Er is geen medewerker ingepland.",
          );
          const period = getCaoPbPlanningPeriodByKey(periodId);
          if (!period) return;
          setSelectedCaoPeriodId(period.key);
          setAnchorDate(parseDateKey(period.start_date));
          setSelectedShiftId(null);
        }}
        onPrevious={() => changePeriod(-1)}
        onToday={goToToday}
        onNext={() => changePeriod(1)}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        customerFilter={customerFilter}
        onCustomerFilterChange={values => {
          setCustomerFilter(values);
          if (values.length > 0) setObjectFilter(current => current.filter(id => objects.some(object => String(object.id) === String(id) && values.includes(String(object.customer_id)))));
        }}
        customers={customers}
        objectFilter={objectFilter}
        onObjectFilterChange={setObjectFilter}
        objects={objects
          .filter(object => customerFilter.length === 0 || customerFilter.includes(String(object.customer_id)))
          .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "nl"))}
        taskTypeFilter={taskTypeFilter}
        onTaskTypeFilterChange={setTaskTypeFilter}
        taskTypes={OBJECT_TASK_TYPES.filter(option => taskOccurrencesInRange.some(item => item.task_type === option.value))}
        warningCount={planningStats.warningCount}
        editing={editing}
        draftChangeCount={planningStats.draftShiftCount + planningStats.draftAssignmentCount}
        onStartEditing={() => {
          setEditing(true);
          setSavedDraftNotice(false);
          setSelectedShiftId(null);
          setSidePanelMode(perspective === "object" ? "employees" : "tasks");
          setLiveMessage("Bewerkstand geopend. Wijzigingen worden als concept bewaard en zijn pas na publiceren definitief zichtbaar.");
        }}
        onSaveDraft={() => saveDraft().catch(() => undefined)}
        saveDraftDisabled={runActionMutation.isPending || pendingResourceKeys.size > 0 || draftSavePending || Boolean(pendingEligibilityDrop)}
        isSavingDraft={runActionMutation.isPending || draftSavePending}
        onPublish={() => {
          if (pendingEligibilityDropRef.current) {
            const description = "De vastgehouden sleepactie wordt nog gecontroleerd. Wacht op de uitkomst voordat u publiceert.";
            toast({ title: "Voorcontrole wordt afgerond", description });
            setLiveMessage(description);
            return;
          }
          mutationIntents.current.clear("publish");
          setPublishOpen(true);
        }}
        publishDisabled={draftSavePending || Boolean(pendingEligibilityDrop) || planningQueueState.pendingCount > 0 || planningStats.sourceChangeCount > 0 || ownedShiftsInRange.length === 0 || publicationStats.draftShiftCount + publicationStats.draftAssignmentCount + publicationStats.taskCoverage.open + publicationStats.taskCoverage.partial === 0}
        isPublishing={publishMutation.isPending}
      />

      {loadError && (
        <div role="alert" className="flex shrink-0 items-center gap-2 border-b border-rose-300 bg-rose-50 px-3 py-2 text-[11px] text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          <AlertCircle className="h-3.5 w-3.5" />
          {mutationMessage(loadError)}
        </div>
      )}

      {planningStats.sourceChangeCount > 0 && (
        <div role="alert" className="flex shrink-0 items-center gap-2 border-b border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span><strong>{planningStats.sourceChangeCount} {planningStats.sourceChangeCount === 1 ? "dienst vraagt" : "diensten vragen"} controle.</strong> Het objectrooster is gewijzigd; pas de gemarkeerde dienst aan voordat u opnieuw publiceert.</span>
        </div>
      )}

      {liveDragEligibilityPreview?.verdict && (() => {
        const verdict = liveDragEligibilityPreview.verdict;
        const messages = verdict.displayWarnings.slice(0, 2);
        const critical = verdict.hasCritical;
        const clear = verdict.isClear;
        const tone = critical
          ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100"
          : clear
            ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
            : "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100";
        return (
          <div
            role="status"
            aria-live="assertive"
            data-planning-drag-eligibility={verdict.status}
            className={`pointer-events-none fixed left-1/2 top-16 z-[90] flex w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 items-start gap-2 rounded-lg border px-3 py-2 text-[11px] shadow-xl ${tone}`}
          >
            {critical ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : clear ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            <div className="min-w-0">
              <strong>
                {liveDragEligibilityPreview.personnel ? personnelName(liveDragEligibilityPreview.personnel) : "Medewerker"}
                {" · "}
                {liveDragEligibilityPreview.targetLabel}
              </strong>
              {clear ? (
                <span> — Geen bekende inzetwaarschuwingen; de voorafcontrole is actueel.</span>
              ) : (
                <span> — {messages.map(item => item.title || item.detail || item.message).filter(Boolean).join(" · ")}</span>
              )}
            </div>
          </div>
        );
      })()}

      <DragDropContext
        onBeforeDragStart={handleBeforeDragStart}
        onDragUpdate={handleDragUpdate}
        onDragEnd={handleDragEnd}
      >
        <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
          <ResizablePanel id="planning-board" order={1} defaultSize={editing ? 76 : 100} minSize={editing ? 56 : 100}>
            <PlanningBoard
              editable={editing}
              perspective={perspective}
              compact={compactMode}
              zoom={planningZoom}
              days={range.days}
              shifts={matrixShifts}
              coverageShifts={matrixCoverageShifts}
              assignments={matrixAssignments}
              segments={matrixSegments}
              occurrences={visibleTaskOccurrences}
              personnel={matrixPersonnel}
              objects={matrixObjects}
              routes={routes}
              customers={customers}
              selectedShiftId={selectedShiftId}
              onSelectOccurrence={occurrence => runProtectedPlanningAction(
                [`occurrence:${occurrence.id}`],
                () => openTaskComposer({ occurrence }),
              )}
              onSelectShift={shift => {
                setSelectedShiftId(shift.id);
                setSidePanelMode(perspective === "object" ? "employees" : "tasks");
              }}
              onUnassign={(shift, assignment) => runProtectedPlanningAction(
                [`shift:${shift.id}`],
                () => handleUnassign(shift, assignment).catch(() => undefined),
                { allowQueued: true },
              )}
              onMove={shift => runProtectedPlanningAction(
                [`shift:${shift.id}`],
                () => setShiftAction({ action: "move", shift }),
              )}
              onCopy={shift => runProtectedPlanningAction(
                [`shift:${shift.id}`],
                () => setShiftAction({ action: "copy", shift }),
              )}
              onEditService={payload => runProtectedPlanningAction(
                [`shift:${payload.shift.id}`],
                () => setServiceEditor(payload),
                { allowQueued: true },
              )}
              onEditComposition={shift => runProtectedPlanningAction(
                [`shift:${shift.id}`, ...(shift.task_occurrence_ids || []).map(id => `occurrence:${id}`)],
                () => openTaskComposer({ shift }),
              )}
              onCancelComposition={shift => runProtectedPlanningAction(
                [`shift:${shift.id}`, ...(shift.task_occurrence_ids || []).map(id => `occurrence:${id}`)],
                () => setCancelTaskShift({
                  shift,
                  idempotencyKey: createPlanningMutationKey("cancel-task-shift"),
                }),
                { allowQueued: true },
              )}
              onCreateOpenTaskSlice={payload => runProtectedPlanningAction(
                [`occurrence:${payload.occurrence.id}`],
                () => createOpenOccurrenceSlice(payload).catch(() => undefined),
              )}
              onCopyService={copyServiceToClipboard}
              onPasteService={payload => pasteServiceFromClipboard(payload).catch(() => undefined)}
              serviceClipboard={serviceClipboard}
              onCopyTask={copyTaskToClipboard}
              onEditTask={occurrence => runProtectedPlanningAction(
                [`occurrence:${occurrence.id}`],
                () => setTaskEditor(occurrence),
              )}
              onPasteTask={payload => pasteTaskToDate(payload).catch(() => undefined)}
              onDeleteTask={occurrence => runProtectedPlanningAction(
                [`occurrence:${occurrence.id}`],
                () => requestTaskDeletion(occurrence),
              )}
              onDeleteService={shift => runProtectedPlanningAction(
                [`shift:${shift.id}`, ...(shift.task_occurrence_ids || []).map(id => `occurrence:${id}`)],
                () => setCancelTaskShift({ shift, idempotencyKey: createPlanningMutationKey("cancel-task-shift") }),
                { allowQueued: true },
              )}
              taskClipboard={taskClipboard}
              onResizeTaskSegment={payload => runProtectedPlanningAction(
                [`shift:${payload.shift.id}`, `occurrence:${payload.occurrence.id}`],
                () => resizeTimelineTaskSegment(payload),
                { allowQueued: true },
              )}
              onResizeTaskBoundary={payload => runProtectedPlanningAction(
                [
                  `occurrence:${payload.occurrence.id}`,
                  `shift:${payload.left.shift.id}`,
                  `shift:${payload.right.shift.id}`,
                ],
                () => resizeTimelineSharedBoundary(payload),
                { allowQueued: true },
              )}
              mutationPending={publishMutation.isPending || draftSavePending}
              pendingResourceKeys={matrixPendingResourceKeys}
              queuedResourceKeys={queuedPlanningResourceKeys}
              taskOccurrenceCount={visibleTaskOccurrences.length}
              searchQuery={search}
              isLoading={isLoading}
            />
          </ResizablePanel>
          {editing && <ResizableHandle id="planning-sidebar-handle" withHandle />}
          {editing && <ResizablePanel id="planning-sidebar" order={2} defaultSize={24} minSize={19} maxSize={38}>
            <PlanningSidePanel
              perspective={perspective}
              mode={sidePanelMode}
              onModeChange={setSidePanelMode}
              taskCount={visibleWorkQueueCount}
              taskProps={{
                occurrences: visibleTaskOccurrences,
                segments: taskSegments,
                shifts: shiftsInRange,
                assignments: assignmentsInRange,
                periodStart,
                selectedShift,
                pendingResourceKeys: matrixPendingResourceKeys,
                sourceChanges: openTaskSourceChanges,
                onCreateShift: occurrence => runProtectedPlanningAction(
                  [`occurrence:${occurrence.id}`],
                  () => openTaskComposer({ occurrence }),
                ),
                onAddToShift: occurrence => runProtectedPlanningAction(
                  [`occurrence:${occurrence.id}`, selectedShift ? `shift:${selectedShift.id}` : null],
                  () => openTaskComposer({ shift: selectedShift, occurrence }),
                ),
                onFillStaffing: openOccurrenceStaffing,
                onEditShift: shift => runProtectedPlanningAction(
                  [`shift:${shift.id}`, ...(shift.task_occurrence_ids || []).map(id => `occurrence:${id}`)],
                  () => openTaskComposer({ shift }),
                ),
                onClearShift: () => setSelectedShiftId(null),
                onCopyTask: copyTaskToClipboard,
                onDeleteTask: occurrence => runProtectedPlanningAction(
                  [`occurrence:${occurrence.id}`],
                  () => requestTaskDeletion(occurrence),
                ),
                }}
              employeeProps={{
                selectedShift,
                candidates: displayedCandidates,
                onAssign: candidate => handleCandidateAssign(candidate).catch(() => undefined),
                onPrefetchCandidate: candidate => {
                  if (candidate?.eligibilityCandidate) {
                    requestUrgentEligibilityCandidates([candidate.eligibilityCandidate]);
                  }
                },
                onCloseShift: () => {
                  mutationIntents.current.clear("assign");
                  setSelectedShiftId(null);
                },
                personnelCount: activePersonnel.length,
                qualifications,
                securityPasses,
                pendingResourceKeys: matrixPendingResourceKeys,
              }}
            />
          </ResizablePanel>}
        </ResizablePanelGroup>
      </DragDropContext>

      <footer className="flex h-9 shrink-0 items-center gap-3 border-t border-border bg-card px-3 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          {runActionMutation.isPending || publishMutation.isPending || draftSavePending ? (
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
          ) : planningQueueState.pendingCount > 0 ? (
            <Cloud className="h-3 w-3 text-primary" aria-label="Conceptwijzigingen synchroniseren op de achtergrond" />
          ) : planningStats.draftShiftCount + planningStats.draftAssignmentCount > 0 ? (
            <Save className="h-3 w-3 text-primary" />
          ) : (
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
          )}
          <span className="font-medium text-foreground">
            {planningStats.draftShiftCount + planningStats.draftAssignmentCount} conceptwijzigingen
            {planningQueueState.pendingCount > 0 && ` · ${planningQueueState.pendingCount} synchroniseren`}
          </span>
        </div>
        <span className="h-3 w-px bg-border" />
        <div className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {planningStats.vacantCount} open plaatsen
        </div>
        <span className="h-3 w-px bg-border" />
        <button
          type="button"
          onClick={() => {
            setEditing(true);
            setSavedDraftNotice(false);
            setPerspective("employee");
            setSidePanelMode("tasks");
            setSelectedShiftId(null);
          }}
          className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted hover:text-foreground"
        >
          <ListTodo className="h-3 w-3" />
          {planningStats.workQueueCount} te doen · {planningStats.taskCoverage.open} open · {planningStats.taskCoverage.partial} deels · {planningStats.staffingOnlyCount} bezetten
        </button>
        {planningStats.warningCount > 0 && (
          <>
            <span className="h-3 w-px bg-border" />
            <div className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" />
              {planningStats.warningCount} waarschuwingen
            </div>
          </>
        )}
        {editing && undoStack.length > 0 && (
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[10px]" onClick={() => handleUndo().catch(() => undefined)}>
            <RotateCcw className="h-3 w-3" />
            Ongedaan maken
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          {editing ? <Save className="h-3 w-3 text-amber-600" /> : <Cloud className="h-3 w-3 text-emerald-600" />}
          {planningQueueState.pendingCount > 0
            ? "Lokaal verwerkt · synchronisatie op de achtergrond"
            : editing
              ? "Concept bewerken · wijzigingen zijn gesynchroniseerd"
              : savedDraftNotice ? "Concept opgeslagen" : "Roosterweergave"}
        </div>
        <span className="sr-only" aria-live="polite">{liveMessage}</span>
      </footer>

      <ShiftActionDialog
        action={shiftAction?.action}
        shift={shiftAction?.shift}
        open={Boolean(shiftAction)}
        onOpenChange={open => {
          if (!open && !runActionMutation.isPending) {
            mutationIntents.current.clear("shift-action");
            setShiftAction(null);
          }
        }}
        onConfirm={payload => handleShiftActionConfirm(payload).catch(() => undefined)}
        isPending={runActionMutation.isPending}
      />
      <PlanningTaskEditDialog
        occurrence={taskEditor}
        open={Boolean(taskEditor)}
        onOpenChange={open => { if (!open && !runActionMutation.isPending) setTaskEditor(null); }}
        onSave={payload => saveTaskEdit(payload).catch(() => undefined)}
        isPending={runActionMutation.isPending}
      />
      <PlanningTaskShiftRemovalDialog
        request={taskShiftRemovalRequest}
        onCancel={() => setTaskShiftRemovalRequest(null)}
        onConfirm={() => saveTaskEdit({ ...taskShiftRemovalRequest, confirmRemoval: true }).catch(() => undefined)}
        isPending={runActionMutation.isPending}
      />
      <PlanningServiceEditDialog
        request={serviceEditor}
        personnel={activePersonnel}
        open={Boolean(serviceEditor)}
        onOpenChange={open => { if (!open && !runActionMutation.isPending) setServiceEditor(null); }}
        onSave={payload => saveServiceEdit(payload).catch(() => undefined)}
        isPending={runActionMutation.isPending || pendingResourceKeys.size > 0}
      />
      <PlanningTaskDeleteDialog
        request={taskDeleteRequest}
        open={Boolean(taskDeleteRequest)}
        onOpenChange={open => { if (!open && !runActionMutation.isPending) setTaskDeleteRequest(null); }}
        onConfirm={request => deleteTaskOccurrence(request).catch(() => undefined)}
        isPending={runActionMutation.isPending || bootstrapMutation.isPending}
      />
      <CancelTaskShiftDialog
        shift={cancelTaskShift?.shift || null}
        open={Boolean(cancelTaskShift)}
        onOpenChange={open => { if (!open && !runActionMutation.isPending) setCancelTaskShift(null); }}
        onConfirm={shift => handleCancelTaskShift(shift).catch(() => undefined)}
        isPending={runActionMutation.isPending}
      />
      <PlanningShiftComposer
        open={Boolean(composer)}
        onOpenChange={open => { if (!open) setComposer(null); }}
        shift={composer?.shift || null}
        initialOccurrence={composer?.occurrence || null}
        occurrences={taskOccurrences.filter(item => planningTaskOccurrenceOverlapsRange(item, periodStart, periodEnd))}
        segments={taskSegments}
        shifts={shiftsInRange}
        onSave={handleCompositionSave}
        isPending={runActionMutation.isPending}
      />
      <PublishPlanningDialog
        open={publishOpen}
        onOpenChange={open => {
          setPublishOpen(open);
          if (!open && !publishMutation.isPending) mutationIntents.current.clear("publish");
        }}
        rangeLabel={rangeLabel}
        {...publicationStats}
        onConfirm={payload => {
          if (planningCommitFenceRef.current || draftSavePending) return;
          publishMutation.mutate({
            ...payload,
            _planningRange: { periodStart, periodEnd, view, rangeLabel },
            _planningCommitToken: Symbol("planning-publication"),
          });
        }}
        isPending={publishMutation.isPending}
      />
    </div>
  );
}
