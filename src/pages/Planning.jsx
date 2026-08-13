import React, { useEffect, useMemo, useRef, useState } from "react";
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
import {
  CancelTaskShiftDialog,
  PublishPlanningDialog,
  ShiftActionDialog,
} from "@/components/planning/PlanningDialogs";
import { invokePlanningApi } from "@/components/planning/planningApiClient";
import { applyPlanningMutationResultToCache } from "@/components/planning/planningQueryCache";
import { createPlanningRefreshScheduler } from "@/components/planning/planningRefreshScheduler";
import {
  getSharedBoundaryRepairRetryDelay,
  resolveEffectiveSharedBoundaryPlanning,
} from "@/components/planning/planningRecoveryDomain";
import {
  createPlanningMutationIntentRegistry,
  createPlanningMutationKey,
} from "@/components/planning/planningMutationIntent";
import {
  addDays,
  buildCandidateRanking,
  formatMinutesAsHours,
  getAssignmentWarnings,
  getOccurrencePlanningState,
  getOccurrenceOpenStaffingShift,
  getSafeOccurrenceDropServiceDate,
  getOccurrenceStaffingTarget,
  getPlanningRange,
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
import {
  buildTimelineResizeCompositionPayload,
  getSuggestedTaskTimelineAllocation,
} from "@/components/planning/planningTimelineDomain";
import {
  CAO_PB_PLANNING_PERIODS_2026,
  getAdjacentCaoPbPlanningPeriod,
  getCaoPbPlanningPeriodByKey,
  getCaoPbPlanningRange,
  resolveCaoPbPlanningPeriod,
} from "@/components/planning/planningCaoPeriodDomain";
import { findSamePersonnelAdjacentShiftMerge } from "@/components/planning/planningAdjacentShiftMerge";

const VALID_VIEWS = new Set(["week", "period"]);
const VALID_PERSPECTIVES = new Set(["object", "employee"]);
const PLANNING_ZOOM_LEVELS = [0.7, 0.85, 1, 1.15, 1.3];
const dateLabel = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });
const dayLabel = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" });
const compactDateLabel = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });

function personnelName(personnel) {
  return personnel?.name
    || personnel?.display_name
    || [personnel?.call_name || personnel?.first_name, personnel?.name_prefix, personnel?.last_name]
      .filter(Boolean)
      .join(" ")
    || "Onbekende medewerker";
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

function overlayPlanningRecords(baseRecords, overlayRecords) {
  const records = new Map((baseRecords || []).map(record => [String(record.id), record]));
  (overlayRecords || []).forEach(record => records.set(String(record.id), record));
  return [...records.values()];
}

function activeAssignments(assignments) {
  return assignments.filter(item => item.status !== "removed");
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
  return {
    key,
    shifts: [shift],
    segments: [taskSegment],
    assignments: assignment ? [assignment] : [],
  };
}

function mutationMessage(error) {
  if (Number(error?.status) === 409) return `${error.message} De planning wordt opnieuw geladen.`;
  return error?.message || "De planningactie kon niet worden uitgevoerd.";
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

export default function Planning() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDate = parseDateKey(searchParams.get("date")) || new Date();
  const requestedView = searchParams.get("view") === "four_weeks" ? "period" : searchParams.get("view");
  const initialView = VALID_VIEWS.has(requestedView) ? requestedView : "week";
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
  const [customerFilter, setCustomerFilter] = useState("all");
  const [selectedShiftId, setSelectedShiftId] = useState(null);
  const [shiftAction, setShiftAction] = useState(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState("tasks");
  const [pendingMatrixChanges, setPendingMatrixChanges] = useState([]);
  const [pendingResourceKeys, setPendingResourceKeys] = useState(() => new Set());
  const [composer, setComposer] = useState(null);
  const [cancelTaskShift, setCancelTaskShift] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [liveMessage, setLiveMessage] = useState("");
  const lastBootstrapKey = useRef("");
  const bootstrapRecoveryTimer = useRef(null);
  const lastBoundaryRecoveryKey = useRef("");
  const mutationIntents = useRef(null);
  if (!mutationIntents.current) mutationIntents.current = createPlanningMutationIntentRegistry();
  const refreshScheduler = useRef(null);
  const refreshPlanningRef = useRef(null);
  const pendingResourceKeysRef = useRef(new Set());
  const lastWrittenSearchKey = useRef(null);
  const hydratingFromUrl = useRef(false);

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
    const nextDate = parseDateKey(searchParams.get("date")) || new Date();
    const requestedNextView = searchParams.get("view") === "four_weeks" ? "period" : searchParams.get("view");
    const nextView = VALID_VIEWS.has(requestedNextView) ? requestedNextView : "week";
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
  }, [searchParams, searchParamsKey]);

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
  const qualificationsQuery = useQuery({
    queryKey: ["personnel-qualifications"],
    queryFn: () => listAllEntityRecords(base44.entities.PersonnelQualification),
    staleTime: 60_000,
  });
  const absencesQuery = useQuery({
    queryKey: ["personnel-absences"],
    queryFn: () => listAllEntityRecords(base44.entities.PersonnelAbsence),
    staleTime: 30_000,
  });
  const passesQuery = useQuery({
    queryKey: ["personnel-security-passes"],
    queryFn: () => listAllEntityRecords(base44.entities.PersonnelSecurityPass),
    staleTime: 60_000,
  });
  const restrictionsQuery = useQuery({
    queryKey: ["personnel-restrictions"],
    queryFn: () => listAllEntityRecords(base44.entities.PersonnelRestriction),
    staleTime: 60_000,
  });
  const contractsQuery = useQuery({
    queryKey: ["personnel-contracts"],
    queryFn: () => listAllEntityRecords(base44.entities.PersonnelContract),
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

  const refreshPlanning = async ({ includePublications = false } = {}) => {
    const requests = [
      queryClient.invalidateQueries({ queryKey: ["planning-shifts"] }),
      queryClient.invalidateQueries({ queryKey: ["planning-assignments"] }),
      queryClient.invalidateQueries({ queryKey: ["planning-task-occurrences"] }),
      queryClient.invalidateQueries({ queryKey: ["planning-task-segments"] }),
    ];
    if (includePublications) {
      requests.push(queryClient.invalidateQueries({ queryKey: ["planning-publications"] }));
    }
    await Promise.all(requests);
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

  const reconcilePlanningResult = (result, options = {}) => {
    applyPlanningMutationResultToCache(queryClient, {
      periodStart,
      periodEnd,
      result,
      ...options,
    });
  };

  const refreshPlanningInBackground = options => {
    refreshScheduler.current?.schedule(options);
  };

  const bootstrapMutation = useMutation({
    mutationFn: payload => invokePlanningApi({ action: "bootstrap_range", ...payload }),
    onSuccess: result => {
      refreshPlanningInBackground();
      if (result?.repaired_shared_boundary_occurrence_ids?.length) {
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
  const allShifts = useMemo(
    () => effectivePlanningRecords.shifts.map(normalizePlanningShift),
    [effectivePlanningRecords.shifts],
  );
  const assignments = useMemo(
    () => effectivePlanningRecords.assignments.map(normalizePlanningAssignment),
    [effectivePlanningRecords.assignments],
  );
  const taskOccurrences = effectivePlanningRecords.occurrences;
  const taskSegments = effectivePlanningRecords.segments;
  const matrixPendingResourceKeys = useMemo(() => new Set([
    ...pendingResourceKeys,
    ...effectivePlanningRecords.pendingResourceKeys,
  ]), [effectivePlanningRecords.pendingResourceKeys, pendingResourceKeys]);
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
    if (customerFilter !== "all" && String(item.customer_id) !== String(customerFilter)) return false;
    const state = occurrencePlanningStates.get(String(item.id));
    const query = search.trim().toLocaleLowerCase("nl-NL");
    if (query && ![
      item.task_name_snapshot,
      item.object_name_snapshot,
      item.customer_name_snapshot,
      item.task_type,
    ].filter(Boolean).some(value => String(value).toLocaleLowerCase("nl-NL").includes(query))) return false;
    if (statusFilter === "open") return state?.readiness === "unplanned";
    if (statusFilter === "partial") return state?.readiness === "needs_staffing";
    if (statusFilter === "vacant") return state?.readiness !== "ready";
    if (statusFilter === "draft") return state?.linkedShiftIds.some(shiftId => {
      const shift = shiftsInRangeById.get(String(shiftId));
      return shift?.status === "draft" || (assignmentsInRangeByShift.get(String(shiftId)) || [])
        .some(assignment => assignment.status === "draft");
    });
    if (statusFilter === "planned") return state?.readiness === "ready";
    if (statusFilter === "published") return state?.readiness === "ready"
      && state.linkedShiftIds.length > 0
      && state.linkedShiftIds.every(shiftId => (
        shiftsInRangeById.get(String(shiftId))?.status === "published"
      ));
    if (statusFilter === "warnings") {
      if (!item.security_plan_revision_id || !item.security_plan_snapshot?.published_revision) return true;
      return state?.linkedShiftIds.some(shiftId => (
        assignmentsInRangeByShift.get(String(shiftId)) || []
      ).some(assignment => assignmentWarnings(assignment).length > 0));
    }
    return true;
  }), [assignmentsInRangeByShift, customerFilter, occurrencePlanningStates, search, shiftsInRangeById, statusFilter, taskOccurrencesInRange]);
  const visibleWorkQueueCount = useMemo(() => visibleTaskOccurrences.filter(occurrence => (
    occurrencePlanningStates.get(String(occurrence.id))?.readiness !== "ready"
  )).length, [occurrencePlanningStates, visibleTaskOccurrences]);

  const filteredShifts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("nl-NL");
    return shiftsInRange.filter(shift => {
      const object = objectsById.get(String(shift.object_id || ""));
      const shiftSegments = activeTaskSegmentsByShift.get(String(shift.id)) || [];
      if (customerFilter !== "all") {
        const shiftCustomerIds = new Set([
          shift.customer_id,
          object?.customer_id,
          ...(shift.customer_ids || []),
          ...shiftSegments.map(item => item.customer_id),
        ].filter(Boolean).map(String));
        if (!shiftCustomerIds.has(String(customerFilter))) return false;
      }
      const shiftAssignments = assignmentsInRangeByShift.get(String(shift.id)) || [];
      const required = Math.max(1, Number(shift.required_count || 1));
      const warnings = shiftAssignments.flatMap(assignmentWarnings);
      const compositionWarnings = Array.isArray(shift.service_context_snapshot?.composition_warnings)
        ? shift.service_context_snapshot.composition_warnings
        : [];
      if (statusFilter === "vacant" && shiftAssignments.length >= required) return false;
      if (statusFilter === "draft" && shift.status !== "draft" && !shiftAssignments.some(item => item.status === "draft")) return false;
      if (statusFilter === "warnings" && warnings.length + compositionWarnings.length === 0) return false;
      if (statusFilter === "published" && shift.status !== "published") return false;
      if (!query) return true;
      return [
        shift.name,
        shift.route_name,
        shift.object_name,
        shift.group_label,
        object?.name,
        object?.address,
        ...shiftSegments.flatMap(item => [item.task_name_snapshot, item.object_name_snapshot, item.customer_name_snapshot]),
        ...shiftAssignments.map(item => item.personnel_name),
      ].filter(Boolean).some(value => String(value).toLocaleLowerCase("nl-NL").includes(query));
    });
  }, [
    activeTaskSegmentsByShift,
    assignmentsInRangeByShift,
    customerFilter,
    objectsById,
    search,
    shiftsInRange,
    statusFilter,
  ]);
  const pendingMatrixShifts = useMemo(
    () => pendingMatrixChanges.flatMap(item => item.shifts || []),
    [pendingMatrixChanges],
  );
  const pendingMatrixAssignments = useMemo(
    () => pendingMatrixChanges.flatMap(item => item.assignments || []),
    [pendingMatrixChanges],
  );
  const pendingMatrixSegments = useMemo(
    () => pendingMatrixChanges.flatMap(item => item.segments || []),
    [pendingMatrixChanges],
  );
  const matrixShifts = useMemo(
    () => overlayPlanningRecords(filteredShifts, pendingMatrixShifts),
    [filteredShifts, pendingMatrixShifts],
  );
  const matrixCoverageShifts = useMemo(
    () => overlayPlanningRecords(shiftsInRange, pendingMatrixShifts),
    [pendingMatrixShifts, shiftsInRange],
  );
  const matrixAssignments = useMemo(
    () => overlayPlanningRecords(assignmentsInRange, pendingMatrixAssignments),
    [assignmentsInRange, pendingMatrixAssignments],
  );
  const matrixSegments = useMemo(
    () => overlayPlanningRecords(taskSegments, pendingMatrixSegments),
    [pendingMatrixSegments, taskSegments],
  );

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
  const matrixObjects = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("nl-NL");
    const visibleShiftIds = new Set(filteredShifts.map(shift => String(shift.id)));
    const workObjectIds = new Set([
      ...visibleTaskOccurrences.map(item => item.object_id),
      ...filteredShifts.flatMap(shift => [shift.object_id, ...(shift.object_ids || [])]),
      ...[...visibleShiftIds].flatMap(shiftId => (
        activeTaskSegmentsByShift.get(shiftId) || []
      ).map(segment => segment.object_id)),
    ].filter(Boolean).map(String));
    return objects.filter(object => {
      if (customerFilter !== "all" && String(object.customer_id) !== String(customerFilter)) return false;
      if (!query) return true;
      const directMatch = [object.name, object.address, object.code]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase("nl-NL").includes(query));
      return directMatch || workObjectIds.has(String(object.id));
    });
  }, [activeTaskSegmentsByShift, customerFilter, filteredShifts, objects, search, visibleTaskOccurrences]);
  const matrixPersonnel = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("nl-NL");
    if (!query) return activePersonnel;
    if (visibleTaskOccurrences.length > 0) return activePersonnel;
    const visibleShiftIds = new Set(filteredShifts.map(shift => String(shift.id)));
    const matchedPersonnelIds = new Set(assignmentsInRange
      .filter(assignment => visibleShiftIds.has(String(assignment.planning_shift_id)))
      .map(assignment => String(assignment.personnel_id)));
    activePersonnel.forEach(item => {
      if ([personnelName(item), item.cao_function_group, item.function_type, item.employee_type]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase("nl-NL").includes(query))) {
        matchedPersonnelIds.add(String(item.id));
      }
    });
    return activePersonnel.filter(item => matchedPersonnelIds.has(String(item.id)));
  }, [activePersonnel, assignmentsInRange, filteredShifts, search, visibleTaskOccurrences.length]);

  const warningContext = useMemo(() => ({
    assignments,
    shifts: allShifts,
    absences,
    qualifications,
    securityPasses,
    restrictions,
    contracts,
  }), [absences, allShifts, assignments, contracts, qualifications, restrictions, securityPasses]);

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
    return ranked.map(candidate => ({
      ...candidate,
      assignedToSelectedShift: assignedPersonnelIds.has(String(candidate.personnel.id)),
    }));
  }, [activePersonnel, assignments, selectedShift, warningContext]);

  const runActionMutation = useMutation({
    mutationFn: payload => invokePlanningApi(payload),
    onError: (error, variables) => {
      if (variables?.action === "resize_shared_task_boundary") {
        void refreshPlanning();
        bootstrapMutation.mutate({ period_start: bootstrapStart, period_end: periodEnd });
      } else if (Number(error?.status) === 409) {
        refreshPlanningInBackground();
      }
      toast({
        variant: "destructive",
        title: "Planningactie niet opgeslagen",
        description: mutationMessage(error),
      });
      setLiveMessage(mutationMessage(error));
    },
  });

  const runIntentMutation = async (scope, prefix, payload) => {
    const request = mutationIntents.current.prepare(scope, payload, { prefix });
    const result = await runActionMutation.mutateAsync(request);
    mutationIntents.current.clear(scope, request.idempotency_key);
    return result;
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
    const releasePendingResources = acquirePendingResources([
      `shift:${shift.id}`,
      `personnel:${personnelItem.id}`,
    ]);
    if (!releasePendingResources) return;
    const current = activeAssignments(assignments.filter(item => String(item.planning_shift_id) === String(shift.id)));
    if (current.some(item => String(item.personnel_id) === String(personnelItem.id))) {
      toast({
        title: "Medewerker is al ingepland",
        description: `${personnelName(personnelItem)} staat al op deze dienst en kan niet dubbel worden bezet.`,
      });
      releasePendingResources();
      return;
    }
    const required = Math.max(1, Number(shift.required_count || 1));
    const occupied = new Set(current.map(item => Number(item.slot_index || 0)));
    const slotIndex = requestedSlotIndex ?? Array.from({ length: required }, (_, index) => index).find(index => !occupied.has(index));
    if (slotIndex === undefined || slotIndex === null) {
      toast({
        variant: "destructive",
        title: "Dienst is volledig bezet",
        description: "Maak eerst een plaats vrij of vervang een bestaande medewerker.",
      });
      releasePendingResources();
      return;
    }
    const warnings = candidateWarnings || getAssignmentWarnings({
      shift,
      personnel: personnelItem,
      ...warningContext,
    });
    const name = personnelName(personnelItem);
    const pendingKey = createPlanningMutationKey("pending-assignment");
    addPendingMatrixChange({
      key: pendingKey,
      shifts: [],
      segments: [],
      assignments: [normalizePlanningAssignment({
        id: `pending-assignment-${pendingKey}`,
        planning_shift_id: shift.id,
        shift_id: shift.id,
        personnel_id: personnelItem.id,
        personnel_name: name,
        slot_index: slotIndex,
        status: "draft",
        warnings,
        _optimistic_pending: true,
      })],
    });
    try {
      const result = await runIntentMutation("assign", "planning-assign", {
        action: "assign",
        shift_id: shift.id,
        slot_index: slotIndex,
        personnel_id: personnelItem.id,
        personnel_name: name,
        warnings,
        expected_shift_revision: Number(shift.revision || 1),
      });
      reconcilePlanningResult(result);
      refreshPlanningInBackground();
      const description = `${name} is eenmalig ingepland op ${shift.name}.`;
      rememberUndo(result, description);
      setLiveMessage(description);
      setSelectedShiftId(null);
      return result;
    } finally {
      removePendingMatrixChange(pendingKey);
      releasePendingResources();
    }
  };

  const handleCandidateAssign = candidate => executeAssignment(
    selectedShift,
    candidate.personnel,
    null,
    candidate.warnings,
  );

  const handleUnassign = async (shift, assignment) => {
    const releasePendingResources = acquirePendingResources([
      `shift:${shift.id}`,
      `personnel:${assignment.personnel_id}`,
    ]);
    if (!releasePendingResources) return;
    try {
      const result = await runIntentMutation("unassign", "planning-unassign", {
        action: "unassign",
        shift_id: shift.id,
        slot_index: Number(assignment.slot_index || 0),
        assignment_id: assignment.id,
        expected_shift_revision: Number(shift.revision || 1),
      });
      reconcilePlanningResult(result);
      refreshPlanningInBackground();
      const description = `${assignment.personnel_name || "Medewerker"} is vrijgemaakt van ${shift.name}.`;
      rememberUndo(result, description);
      setLiveMessage(description);
    } finally {
      releasePendingResources();
    }
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

  const finishTimelineAssignment = (result, occurrence, personnelItem) => {
    setStatusFilter("all");
    reconcilePlanningResult(result);
    refreshPlanningInBackground();
    const warnings = assignmentWarnings(result.assignment);
    const criticalWarnings = warnings.filter(warning => warning.severity === "critical");
    const description = `${personnelName(personnelItem)} is ingepland voor ${occurrence.task_name_snapshot || "de taak"} bij ${occurrence.object_name_snapshot || "het object"}.${warnings.length ? ` Controleer ${warnings.length} inzetwaarschuwing${warnings.length === 1 ? "" : "en"}.` : ""}`;
    toast({ title: criticalWarnings.length ? "Ingepland met kritieke controle" : warnings.length ? "Ingepland met aandachtspunt" : "Dienst gemaakt en ingepland", description });
    setSelectedShiftId(warnings.length ? result.shift?.id || null : null);
    setLiveMessage(description);
    return result;
  };

  const composeAndAssignOccurrenceSlice = async ({ occurrence, personnelItem, serviceDate, startTime, endTime }) => {
    if (!occurrence || !personnelItem) return;
    const segment = occurrenceSegmentForTimelineSlice(occurrence, serviceDate, startTime, endTime);
    if (!segment) return;
    const adjacentMerge = findSamePersonnelAdjacentShiftMerge({
      occurrenceId: occurrence.id,
      personnelId: personnelItem.id,
      proposedSegment: segment,
      shifts: shiftsInRange,
      segments: taskSegments,
      assignments: assignmentsInRange,
    });
    if (adjacentMerge.status === "merge") {
      const { shift, segment: existingSegment, mergedSegment } = adjacentMerge.candidate;
      const pendingKey = createPlanningMutationKey("pending-adjacent-service-merge");
      addPendingMatrixChange({
        key: pendingKey,
        shifts: [{
          ...shift,
          service_date: mergedSegment.start_date,
          end_date: mergedSegment.end_date === mergedSegment.start_date ? null : mergedSegment.end_date,
          start_time: mergedSegment.start_time,
          end_time: mergedSegment.end_time,
          duration_minutes: adjacentMerge.candidate.durationMinutes,
          _optimistic_pending: true,
        }],
        segments: [{
          ...existingSegment,
          ...mergedSegment,
          duration_minutes: adjacentMerge.candidate.durationMinutes,
          _optimistic_pending: true,
        }],
        assignments: [],
      });
      try {
        return await resizeTimelineTaskSegment({
          shift,
          segment: existingSegment,
          startDate: mergedSegment.start_date,
          endDate: mergedSegment.end_date,
          startTime: mergedSegment.start_time,
          endTime: mergedSegment.end_time,
          notification: {
            title: "Aansluitende tijd samengevoegd",
            description: `${personnelName(personnelItem)} blijft aaneengesloten ingepland van ${mergedSegment.start_time} tot ${mergedSegment.end_time}. Er is geen tweede dienst gemaakt.`,
          },
        });
      } finally {
        removePendingMatrixChange(pendingKey);
      }
    }
    if (adjacentMerge.reason === "merged_shift_exceeds_automatic_limit") {
      const description = `${personnelName(personnelItem)} staat al op een aansluitende dienst. Samenvoegen zou ${formatMinutesAsHours(adjacentMerge.durationMinutes)} worden; automatisch plannen stopt bij 12 uur. Kies een andere medewerker voor het open taakdeel.`;
      toast({ variant: "destructive", title: "Dienst zou langer dan 12 uur worden", description });
      setLiveMessage(description);
      return null;
    }
    if (adjacentMerge.status === "ambiguous") {
      const description = "Dit taakdeel sluit aan op twee bestaande diensten van dezelfde medewerker. Pas eerst één grens aan, zodat LOC geen onduidelijke derde dienst maakt.";
      toast({ variant: "destructive", title: "Aansluiting is niet eenduidig", description });
      setLiveMessage(description);
      return null;
    }
    const releasePendingResources = acquirePendingResources([
      `occurrence:${occurrence.id}`,
      `personnel:${personnelItem.id}`,
    ]);
    if (!releasePendingResources) return;
    const pendingKey = createPlanningMutationKey("pending-task-service");
    const optimisticRecords = optimisticCompositionRecords({
      key: pendingKey,
      occurrence,
      personnelItem,
      segment,
    });
    const immediateWarnings = getAssignmentWarnings({
      shift: optimisticRecords.shifts[0],
      personnel: personnelItem,
      ...warningContext,
    });
    optimisticRecords.assignments = optimisticRecords.assignments.map(item => ({
      ...item,
      warnings: immediateWarnings,
      warning_snapshot: immediateWarnings,
    }));
    addPendingMatrixChange(optimisticRecords);
    try {
      const result = await runIntentMutation(
        `timeline-compose-and-assign:${occurrence.id}`,
        "timeline-compose-and-assign",
        {
          action: "compose_and_assign",
          personnel_id: personnelItem.id,
          personnel_name: personnelName(personnelItem),
          slot_index: 0,
          required_count: 1,
          assignment_source: "object_timeline_gap_drop",
          warnings: immediateWarnings,
          expected_occurrence_revisions: {
            [occurrence.id]: Number(occurrence.revision || 1),
          },
          segments: [segment],
        },
      );
      return finishTimelineAssignment(result, occurrence, personnelItem);
    } finally {
      removePendingMatrixChange(pendingKey);
      releasePendingResources();
    }
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

  const resizeTimelineTaskSegment = async ({ shift, segment, startDate, endDate, startTime, endTime, notification = null }) => {
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
    const payload = buildTimelineResizeCompositionPayload({
      shift,
      targetSegmentId: segment.id,
      segments: activeSegments,
      occurrences: occurrenceIds.map(id => occurrenceById.get(id)),
      nextStartDate: startDate,
      nextEndDate: endDate,
      nextStartTime: startTime,
      nextEndTime: endTime,
    });
    const releasePendingResources = acquirePendingResources([
      `shift:${shift.id}`,
      ...occurrenceIds.map(id => `occurrence:${id}`),
    ]);
    if (!releasePendingResources) return;
    try {
      const result = await runIntentMutation(`timeline-resize:${shift.id}:${segment.id}`, "timeline-resize", payload);
      setStatusFilter("all");
      reconcilePlanningResult(result, { replaceShiftSegments: true });
      refreshPlanningInBackground();
      const description = notification?.description
        || `${shift.name || shift.service_name_snapshot || "Dienst"} loopt nu van ${result.shift?.start_time || startTime} tot ${result.shift?.end_time || endTime}. Het vrijgekomen taakdeel staat direct weer open.`;
      toast({ title: notification?.title || "Diensttijd aangepast", description });
      setLiveMessage(description);
      return result;
    } finally {
      releasePendingResources();
    }
  };

  const resizeTimelineSharedBoundary = async ({
    occurrence,
    boundaryDate,
    boundaryTime,
    left,
    right,
  }) => {
    if (!occurrence || !left?.shift || !left?.segment || !right?.shift || !right?.segment) return;

    const currentOccurrence = taskOccurrences.find(item => String(item.id) === String(occurrence.id));
    if (!currentOccurrence) {
      const description = "De gekoppelde klanttaak is niet meer geladen. Ververs de planning en probeer het opnieuw.";
      toast({ variant: "destructive", title: "Overdrachtsgrens kan niet worden aangepast", description });
      setLiveMessage(description);
      return;
    }

    const affectedShiftIds = new Set([String(left.shift.id), String(right.shift.id)]);
    const affectedAssignments = activeAssignments(assignments).filter(assignment => (
      affectedShiftIds.has(String(assignment.planning_shift_id || assignment.shift_id))
    ));
    const releasePendingResources = acquirePendingResources([
      `occurrence:${currentOccurrence.id}`,
      `shift:${left.shift.id}`,
      `shift:${right.shift.id}`,
      ...affectedAssignments.map(assignment => `personnel:${assignment.personnel_id}`),
    ]);
    if (!releasePendingResources) return;

    try {
      const result = await runIntentMutation(
        `timeline-boundary:${currentOccurrence.id}:${left.segment.id}:${right.segment.id}`,
        "timeline-shared-boundary",
        {
          action: "resize_shared_task_boundary",
          task_occurrence_id: currentOccurrence.id,
          left_shift_id: left.shift.id,
          left_segment_id: left.segment.id,
          right_shift_id: right.shift.id,
          right_segment_id: right.segment.id,
          boundary_date: boundaryDate,
          boundary_time: boundaryTime,
          expected_shift_revisions: {
            [left.shift.id]: Number(left.shift.revision || 1),
            [right.shift.id]: Number(right.shift.revision || 1),
          },
          expected_segment_revisions: {
            [left.segment.id]: Number(left.segment.revision || 1),
            [right.segment.id]: Number(right.segment.revision || 1),
          },
          expected_assignment_revisions: Object.fromEntries(affectedAssignments.map(assignment => [
            assignment.id,
            Number(assignment.revision || 1),
          ])),
          expected_occurrence_revision: Number(currentOccurrence.revision || 1),
        },
      );
      setStatusFilter("all");
      reconcilePlanningResult(result, { replaceShiftSegments: true });
      refreshPlanningInBackground();
      const description = `De overdracht staat nu op ${boundaryTime}; beide aansluitende diensten zijn in één keer aangepast.`;
      toast({ title: "Overdrachtsgrens aangepast", description });
      setLiveMessage(description);
      return result;
    } finally {
      releasePendingResources();
    }
  };

  const composeAndAssignOccurrence = async (occurrence, personnelItem, serviceDate) => {
    if (!occurrence || !personnelItem) return;
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

    const releasePendingResources = acquirePendingResources([
      `occurrence:${occurrence.id}`,
      `personnel:${personnelItem.id}`,
    ]);
    if (!releasePendingResources) return;

    const pendingKey = createPlanningMutationKey("pending-task-service");
    const optimisticRecords = optimisticCompositionRecords({
      key: pendingKey,
      occurrence,
      personnelItem,
      segment: segments[0],
    });
    const immediateWarnings = getAssignmentWarnings({
      shift: optimisticRecords.shifts[0],
      personnel: personnelItem,
      ...warningContext,
    });
    optimisticRecords.assignments = optimisticRecords.assignments.map(item => ({
      ...item,
      warnings: immediateWarnings,
      warning_snapshot: immediateWarnings,
    }));
    addPendingMatrixChange(optimisticRecords);
    try {
      const result = await runIntentMutation(
        `matrix-compose-and-assign:${occurrence.id}`,
        "matrix-compose-and-assign",
        {
          action: "compose_and_assign",
          personnel_id: personnelItem.id,
          personnel_name: personnelName(personnelItem),
          slot_index: 0,
          assignment_source: perspective === "object" ? "object_matrix_drop" : "employee_matrix_drop",
          warnings: immediateWarnings,
          expected_occurrence_revisions: {
            [occurrence.id]: Number(occurrence.revision || 1),
          },
          segments,
        },
      );
      return finishTimelineAssignment(result, occurrence, personnelItem);
    } finally {
      removePendingMatrixChange(pendingKey);
      releasePendingResources();
    }
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

  const handleDragEnd = result => {
    if (!editing) return;
    const drop = resolvePlanningDrop(result);
    if (!drop) return;

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
        executeAssignment(shift, personnelItem, drop.slotIndex).catch(() => undefined);
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
    composeAndAssignOccurrence(occurrence, personnelItem, dropServiceDate).catch(() => undefined);
  };

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
    const occurrenceIds = [...new Set((activeTaskSegmentsByShift.get(String(shift.id)) || [])
      .map(segment => String(segment.task_occurrence_id)))];
    const result = await runActionMutation.mutateAsync({
      action: "cancel_task_shift",
      idempotency_key: cancelTaskShift?.idempotencyKey,
      shift_id: shift.id,
      expected_shift_revision: Number(shift.revision || 1),
      expected_occurrence_revisions: Object.fromEntries(occurrenceIds.map(id => [
        id,
        Number(taskOccurrences.find(occurrence => String(occurrence.id) === id)?.revision || 1),
      ])),
    });
    reconcilePlanningResult(result);
    refreshPlanningInBackground();
    const description = `${shift.name || "Conceptdienst"} is verwijderd; ${result.removed_segment_ids?.length || occurrenceIds.length} taaksegmenten staan weer in de werkvoorraad.`;
    toast({ title: "Conceptdienst verwijderd", description });
    setSelectedShiftId(null);
    setCancelTaskShift(null);
    setSidePanelMode("tasks");
    setLiveMessage(description);
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
    return {
      draftShiftCount: ownedShiftsInRange.filter(shift => shift.status === "draft" || Number(shift.revision || 0) > Number(shift.published_revision || 0)).length,
      draftAssignmentCount: active.filter(item => item.status === "draft" || Number(item.revision || 0) > Number(item.published_revision || 0)).length,
      warningCount: warnings.length + compositionWarnings.length + coverage.open + coverage.partial + securityPlanWarningCount,
      criticalCount: warnings.filter(warning => warning.severity === "critical").length
        + compositionWarnings.filter(warning => warning.severity === "critical").length
        + coverage.open
        + coverage.partial
        + securityPlanWarningCount,
      vacantCount,
      taskCoverage: coverage,
      workQueueCount,
      staffingOnlyCount,
      securityPlanWarningCount,
    };
  }, [assignmentsInRangeByShift, occurrencePlanningStates, ownedAssignmentsInRange, ownedShiftsInRange, ownedTaskOccurrencesInRange, shiftsInRange, taskSegments]);
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
    };
  }, [ownedTaskOccurrencesInRange, planningStats, shiftsInRange, taskSegments]);

  const publishMutation = useMutation({
    mutationFn: payload => {
      const request = mutationIntents.current.prepare("publish", {
        action: "publish",
        period_start: periodStart,
        period_end: periodEnd,
        scope_type: view === "period" ? "range" : "week",
        shift_ids: ownedShiftsInRange.map(shift => shift.id),
        expected_shift_revisions: Object.fromEntries(
          ownedShiftsInRange.map(shift => [shift.id, Number(shift.revision || 1)]),
        ),
        publication_reason: `Planning gepubliceerd voor ${rangeLabel}`,
        ...payload,
      }, { prefix: "planning-publication" });
      return invokePlanningApi(request);
    },
    onSuccess: async result => {
      mutationIntents.current.clear("publish");
      await refreshPlanning({ includePublications: true });
      setPublishOpen(false);
      setEditing(false);
      setSavedDraftNotice(false);
      setSelectedShiftId(null);
      setUndoStack([]);
      const message = `Versie ${result?.publication?.version || result?.version || ""} is gepubliceerd voor ${rangeLabel}.`;
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
  });

  const changePeriod = direction => {
    if (view === "period" && selectedCaoPeriod) {
      const nextPeriod = getAdjacentCaoPbPlanningPeriod(selectedCaoPeriod, direction);
      if (!nextPeriod) return;
      setSelectedCaoPeriodId(nextPeriod.key);
      setAnchorDate(parseDateKey(nextPeriod.start_date));
    } else setAnchorDate(current => addDays(current, direction * 7));
    setSelectedShiftId(null);
  };

  const updateCustomPeriod = (nextStartValue, nextEndValue) => {
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
    taskSegmentsQuery,
    personnelQuery,
    objectsQuery,
    routesQuery,
  ].some(query => query.isLoading);
  const loadError = [
    shiftsQuery.error,
    assignmentsQuery.error,
    taskOccurrencesQuery.error,
    taskSegmentsQuery.error,
    personnelQuery.error,
  ].find(Boolean);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
      <PlanningToolbar
        perspective={perspective}
        onPerspectiveChange={nextPerspective => {
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
          dateLabel: `${compactDateLabel.format(parseDateKey(period.start_date))} – ${compactDateLabel.format(parseDateKey(period.end_date))}`,
        }))}
        selectedPeriodId={selectedCaoPeriod?.key || ""}
        onPeriodChange={periodId => {
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
        onCustomerFilterChange={setCustomerFilter}
        customers={customers}
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
        onSaveDraft={() => {
          setEditing(false);
          setSavedDraftNotice(true);
          setSelectedShiftId(null);
          const description = "Het conceptrooster is opgeslagen. Je bekijkt nu weer het volledige rooster.";
          setLiveMessage(description);
          toast({ title: "Concept opgeslagen", description });
        }}
        saveDraftDisabled={runActionMutation.isPending || pendingResourceKeys.size > 0}
        isSavingDraft={runActionMutation.isPending}
        onPublish={() => {
          mutationIntents.current.clear("publish");
          setPublishOpen(true);
        }}
        publishDisabled={ownedShiftsInRange.length === 0 || publicationStats.draftShiftCount + publicationStats.draftAssignmentCount + publicationStats.taskCoverage.open + publicationStats.taskCoverage.partial === 0}
        isPublishing={publishMutation.isPending}
      />

      {loadError && (
        <div role="alert" className="flex shrink-0 items-center gap-2 border-b border-rose-300 bg-rose-50 px-3 py-2 text-[11px] text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          <AlertCircle className="h-3.5 w-3.5" />
          {mutationMessage(loadError)}
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
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
              onSelectOccurrence={occurrence => openTaskComposer({ occurrence })}
              onSelectShift={shift => {
                setSelectedShiftId(shift.id);
                setSidePanelMode(perspective === "object" ? "employees" : "tasks");
              }}
              onUnassign={(shift, assignment) => handleUnassign(shift, assignment).catch(() => undefined)}
              onMove={shift => setShiftAction({ action: "move", shift })}
              onCopy={shift => setShiftAction({ action: "copy", shift })}
              onEditComposition={shift => openTaskComposer({ shift })}
              onCancelComposition={shift => setCancelTaskShift({
                shift,
                idempotencyKey: createPlanningMutationKey("cancel-task-shift"),
              })}
              onCreateOpenTaskSlice={payload => createOpenOccurrenceSlice(payload).catch(() => undefined)}
              onResizeTaskSegment={resizeTimelineTaskSegment}
              onResizeTaskBoundary={resizeTimelineSharedBoundary}
              mutationPending={publishMutation.isPending}
              pendingResourceKeys={matrixPendingResourceKeys}
              taskOccurrenceCount={visibleTaskOccurrences.length}
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
                onCreateShift: occurrence => openTaskComposer({ occurrence }),
                onAddToShift: occurrence => openTaskComposer({ shift: selectedShift, occurrence }),
                onFillStaffing: openOccurrenceStaffing,
                onEditShift: shift => openTaskComposer({ shift }),
                onClearShift: () => setSelectedShiftId(null),
              }}
              employeeProps={{
                selectedShift,
                candidates,
                onAssign: candidate => handleCandidateAssign(candidate).catch(() => undefined),
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
          {runActionMutation.isPending || publishMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
          ) : planningStats.draftShiftCount + planningStats.draftAssignmentCount > 0 ? (
            <Save className="h-3 w-3 text-primary" />
          ) : (
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
          )}
          <span className="font-medium text-foreground">
            {planningStats.draftShiftCount + planningStats.draftAssignmentCount} conceptwijzigingen
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
          {editing ? "Concept bewerken · wijzigingen worden direct veilig opgeslagen" : savedDraftNotice ? "Concept opgeslagen" : "Roosterweergave"}
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
        occurrences={taskOccurrencesInRange}
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
        onConfirm={payload => publishMutation.mutate(payload)}
        isPending={publishMutation.isPending}
      />
    </div>
  );
}
