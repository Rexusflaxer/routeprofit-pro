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
import {
  createPlanningMutationIntentRegistry,
  createPlanningMutationKey,
} from "@/components/planning/planningMutationIntent";
import {
  addDays,
  buildCandidateRanking,
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

const VALID_VIEWS = new Set(["week", "period"]);
const VALID_PERSPECTIVES = new Set(["object", "employee"]);
const PLANNING_ZOOM_LEVELS = [0.7, 0.85, 1, 1.15, 1.3];
const dateLabel = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });
const dayLabel = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" });

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

function rangeLabelFor(view, range) {
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

function mutationMessage(error) {
  if (Number(error?.status) === 409) return `${error.message} De planning is opnieuw geladen.`;
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

  const [anchorDate, setAnchorDate] = useState(initialDate);
  const [view, setView] = useState(initialView);
  const [customPeriodStart, setCustomPeriodStart] = useState(toDateKey(initialPeriod.start));
  const [customPeriodEnd, setCustomPeriodEnd] = useState(toDateKey(initialPeriod.end));
  const [perspective, setPerspective] = useState(initialPerspective);
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
  const [expandedTaskCardKey, setExpandedTaskCardKey] = useState(null);
  const [composer, setComposer] = useState(null);
  const [cancelTaskShift, setCancelTaskShift] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [liveMessage, setLiveMessage] = useState("");
  const lastBootstrapKey = useRef("");
  const mutationIntents = useRef(null);
  if (!mutationIntents.current) mutationIntents.current = createPlanningMutationIntentRegistry();
  const lastWrittenSearchKey = useRef(null);
  const hydratingFromUrl = useRef(false);

  const range = useMemo(() => getPlanningRange(anchorDate, view, {
    periodStart: customPeriodStart,
    periodEnd: customPeriodEnd,
    maxDays: 63,
  }), [anchorDate, customPeriodEnd, customPeriodStart, view]);
  const rangeLabel = rangeLabelFor(view, range);
  const periodStart = toDateKey(range.start);
  const periodEnd = toDateKey(range.end);
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
    hydratingFromUrl.current = true;
    setAnchorDate(nextDate);
    setView(nextView);
    setPerspective(nextPerspective);
    setCustomPeriodStart(toDateKey(nextPeriod.start));
    setCustomPeriodEnd(toDateKey(nextPeriod.end));
    setSelectedShiftId(null);
    setExpandedTaskCardKey(null);
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
    } else {
      next.delete("from");
      next.delete("to");
    }
    const nextSearchKey = next.toString();
    if (nextSearchKey === searchParamsKey) return;
    lastWrittenSearchKey.current = nextSearchKey;
    setSearchParams(next, { replace: true });
  }, [anchorDate, periodEnd, periodStart, perspective, searchParams, searchParamsKey, setSearchParams, view]);

  const shiftsQuery = useQuery({
    queryKey: ["planning-shifts", periodStart, periodEnd],
    queryFn: () => filterAllEntityRecords(
      base44.entities.PlanningShift,
      getPlanningShiftRangeQuery(periodStart, periodEnd),
      "-service_date",
    ),
    staleTime: 15_000,
  });
  const assignmentsQuery = useQuery({
    queryKey: ["planning-assignments"],
    queryFn: () => listAllEntityRecords(base44.entities.PlanningAssignment, "-updated_date"),
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
    queryKey: ["planning-task-segments"],
    queryFn: () => listAllEntityRecords(base44.entities.PlanningShiftTaskSegment, "-start_date"),
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

  const refreshPlanning = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["planning-shifts"] }),
      queryClient.invalidateQueries({ queryKey: ["planning-assignments"] }),
      queryClient.invalidateQueries({ queryKey: ["planning-task-occurrences"] }),
      queryClient.invalidateQueries({ queryKey: ["planning-task-segments"] }),
      queryClient.invalidateQueries({ queryKey: ["planning-publications"] }),
    ]);
  };

  const bootstrapMutation = useMutation({
    mutationFn: payload => invokePlanningApi({ action: "bootstrap_range", ...payload }),
    onSuccess: refreshPlanning,
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

  const allShifts = useMemo(
    () => (shiftsQuery.data || []).map(normalizePlanningShift),
    [shiftsQuery.data],
  );
  const assignments = useMemo(
    () => (assignmentsQuery.data || []).map(normalizePlanningAssignment),
    [assignmentsQuery.data],
  );
  const taskOccurrences = taskOccurrencesQuery.data || [];
  const taskSegments = taskSegmentsQuery.data || [];
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
  const ownedShiftsInRange = useMemo(() => shiftsInRange.filter(shift => (
    planningShiftOwnedByRange(shift, periodStart, periodEnd)
  )), [periodEnd, periodStart, shiftsInRange]);
  const shiftIdsInRange = useMemo(() => new Set(shiftsInRange.map(shift => String(shift.id))), [shiftsInRange]);
  const assignmentsInRange = useMemo(() => assignments.filter(item => shiftIdsInRange.has(String(item.planning_shift_id))), [assignments, shiftIdsInRange]);
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
    getOccurrencePlanningState({
      occurrence,
      segments: taskSegments,
      shifts: shiftsInRange,
      assignments: assignmentsInRange,
    }),
  ])), [assignmentsInRange, shiftsInRange, taskOccurrencesInRange, taskSegments]);
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
      const shift = shiftsInRange.find(itemShift => String(itemShift.id) === shiftId);
      return shift?.status === "draft" || assignmentsInRange.some(assignment => (
        String(assignment.planning_shift_id) === shiftId && assignment.status === "draft"
      ));
    });
    if (statusFilter === "planned") return state?.readiness === "ready";
    if (statusFilter === "published") return state?.readiness === "ready"
      && state.linkedShiftIds.length > 0
      && state.linkedShiftIds.every(shiftId => (
        shiftsInRange.find(shift => String(shift.id) === shiftId)?.status === "published"
      ));
    if (statusFilter === "warnings") {
      if (!item.security_plan_revision_id || !item.security_plan_snapshot?.published_revision) return true;
      return state?.linkedShiftIds.some(shiftId => assignmentsInRange.some(assignment => (
        String(assignment.planning_shift_id) === shiftId && assignmentWarnings(assignment).length > 0
      )));
    }
    return true;
  }), [assignmentsInRange, customerFilter, occurrencePlanningStates, search, shiftsInRange, statusFilter, taskOccurrencesInRange]);
  const visibleWorkQueueCount = useMemo(() => visibleTaskOccurrences.filter(occurrence => (
    occurrencePlanningStates.get(String(occurrence.id))?.readiness !== "ready"
  )).length, [occurrencePlanningStates, visibleTaskOccurrences]);

  const filteredShifts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("nl-NL");
    const active = activeAssignments(assignmentsInRange);
    return shiftsInRange.filter(shift => {
      const object = objectsById.get(String(shift.object_id || ""));
      const shiftSegments = taskSegments.filter(item => item.status !== "removed" && String(item.shift_id) === String(shift.id));
      if (customerFilter !== "all") {
        const shiftCustomerIds = new Set([
          shift.customer_id,
          object?.customer_id,
          ...(shift.customer_ids || []),
          ...shiftSegments.map(item => item.customer_id),
        ].filter(Boolean).map(String));
        if (!shiftCustomerIds.has(String(customerFilter))) return false;
      }
      const shiftAssignments = active.filter(item => String(item.planning_shift_id) === String(shift.id));
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
    assignmentsInRange,
    customerFilter,
    objectsById,
    search,
    shiftsInRange,
    statusFilter,
    taskSegments,
  ]);

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
      ...taskSegments
        .filter(segment => segment.status !== "removed" && visibleShiftIds.has(String(segment.shift_id)))
        .map(segment => segment.object_id),
    ].filter(Boolean).map(String));
    return objects.filter(object => {
      if (customerFilter !== "all" && String(object.customer_id) !== String(customerFilter)) return false;
      if (!query) return true;
      const directMatch = [object.name, object.address, object.code]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase("nl-NL").includes(query));
      return directMatch || workObjectIds.has(String(object.id));
    });
  }, [customerFilter, filteredShifts, objects, search, taskSegments, visibleTaskOccurrences]);
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
    onError: async error => {
      if (Number(error?.status) === 409) await refreshPlanning();
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
    const current = activeAssignments(assignments.filter(item => String(item.planning_shift_id) === String(shift.id)));
    if (current.some(item => String(item.personnel_id) === String(personnelItem.id))) {
      toast({
        title: "Medewerker is al ingepland",
        description: `${personnelName(personnelItem)} staat al op deze dienst en kan niet dubbel worden bezet.`,
      });
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
      return;
    }
    const warnings = candidateWarnings || getAssignmentWarnings({
      shift,
      personnel: personnelItem,
      ...warningContext,
    });
    const name = personnelName(personnelItem);
    const result = await runIntentMutation("assign", "planning-assign", {
      action: "assign",
      shift_id: shift.id,
      slot_index: slotIndex,
      personnel_id: personnelItem.id,
      personnel_name: name,
      warnings,
      expected_shift_revision: Number(shift.revision || 1),
    });
    await refreshPlanning();
    const description = `${name} is eenmalig ingepland op ${shift.name}.`;
    rememberUndo(result, description);
    setLiveMessage(description);
    setSelectedShiftId(null);
  };

  const handleCandidateAssign = candidate => executeAssignment(
    selectedShift,
    candidate.personnel,
    null,
    candidate.warnings,
  );

  const handleUnassign = async (shift, assignment) => {
    const result = await runIntentMutation("unassign", "planning-unassign", {
      action: "unassign",
      shift_id: shift.id,
      slot_index: Number(assignment.slot_index || 0),
      assignment_id: assignment.id,
      expected_shift_revision: Number(shift.revision || 1),
    });
    await refreshPlanning();
    const description = `${assignment.personnel_name || "Medewerker"} is vrijgemaakt van ${shift.name}.`;
    rememberUndo(result, description);
    setLiveMessage(description);
  };

  const handleUndo = async (item = undoStack[0]) => {
    if (!item) return;
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
    await refreshPlanning();
    setUndoStack(current => current.filter(entry => entry.auditEventId !== item.auditEventId));
    const message = result?.message || `Ongedaan gemaakt: ${item.description}`;
    setLiveMessage(message);
    toast({ title: "Planning hersteld", description: message });
  };

  const finishTimelineAssignment = async (result, occurrence, personnelItem, serviceDate) => {
    setStatusFilter("all");
    await refreshPlanning();
    const warnings = assignmentWarnings(result.assignment);
    const criticalWarnings = warnings.filter(warning => warning.severity === "critical");
    const description = `${personnelName(personnelItem)} is ingepland voor ${occurrence.task_name_snapshot || "de taak"} bij ${occurrence.object_name_snapshot || "het object"}.${warnings.length ? ` Controleer ${warnings.length} inzetwaarschuwing${warnings.length === 1 ? "" : "en"}.` : ""}`;
    toast({ title: criticalWarnings.length ? "Ingepland met kritieke controle" : warnings.length ? "Ingepland met aandachtspunt" : "Dienst gemaakt en ingepland", description });
    setSelectedShiftId(warnings.length ? result.shift?.id || null : null);
    setExpandedTaskCardKey(`${occurrence.id}:${serviceDate || occurrence.service_date}`);
    setLiveMessage(description);
    return result;
  };

  const composeAndAssignOccurrenceSlice = async ({ occurrence, personnelItem, serviceDate, startTime, endTime }) => {
    if (!occurrence || !personnelItem || runActionMutation.isPending) return;
    const segment = occurrenceSegmentForTimelineSlice(occurrence, serviceDate, startTime, endTime);
    if (!segment) return;
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
        expected_occurrence_revisions: {
          [occurrence.id]: Number(occurrence.revision || 1),
        },
        segments: [segment],
      },
    );
    return finishTimelineAssignment(result, occurrence, personnelItem, serviceDate);
  };

  const createOpenOccurrenceSlice = async ({ occurrence, serviceDate, startTime, endTime }) => {
    if (!occurrence || runActionMutation.isPending) return;
    const segment = occurrenceSegmentForTimelineSlice(occurrence, serviceDate, startTime, endTime);
    if (!segment) return;
    const result = await runIntentMutation(`timeline-open-shift:${occurrence.id}`, "timeline-open-shift", {
      action: "compose_shift",
      required_count: 1,
      expected_occurrence_revisions: {
        [occurrence.id]: Number(occurrence.revision || 1),
      },
      segments: [segment],
    });
    setStatusFilter("all");
    await refreshPlanning();
    const description = `Open dienst ${startTime}–${endTime} is gevormd binnen ${occurrence.task_name_snapshot || "de taak"}. Sleep nu een medewerker naar de open plaats.`;
    toast({ title: "Open dienst gemaakt", description });
    setSelectedShiftId(result.shift?.id || null);
    setExpandedTaskCardKey(`${occurrence.id}:${serviceDate || occurrence.service_date}`);
    setSidePanelMode("employees");
    setLiveMessage(description);
    return result;
  };

  const resizeTimelineTaskSegment = async ({ occurrence, serviceDate, shift, segment, startDate, endDate, startTime, endTime }) => {
    if (!shift || !segment || runActionMutation.isPending) return;
    const activeSegments = taskSegments
      .filter(item => item.status !== "removed" && String(item.shift_id) === String(shift.id))
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
    const result = await runIntentMutation(`timeline-resize:${shift.id}:${segment.id}`, "timeline-resize", payload);
    setStatusFilter("all");
    await refreshPlanning();
    const description = `${shift.name || shift.service_name_snapshot || "Dienst"} loopt nu van ${result.shift?.start_time || startTime} tot ${result.shift?.end_time || endTime}. Het vrijgekomen taakdeel staat direct weer open.`;
    toast({ title: "Diensttijd aangepast", description });
    if (occurrence?.id) setExpandedTaskCardKey(`${occurrence.id}:${serviceDate || startDate}`);
    setLiveMessage(description);
    return result;
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
        const targetShift = shiftsInRange.find(shift => String(shift.id) === openShiftTarget.shiftId);
        await executeAssignment(targetShift, personnelItem, openShiftTarget.slotIndex);
        setExpandedTaskCardKey(`${occurrence.id}:${serviceDate || occurrence.service_date}`);
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

    const result = await runIntentMutation("matrix-compose-and-assign", "matrix-compose-and-assign", {
      action: "compose_and_assign",
      personnel_id: personnelItem.id,
      personnel_name: personnelName(personnelItem),
      slot_index: 0,
      assignment_source: perspective === "object" ? "object_matrix_drop" : "employee_matrix_drop",
      expected_occurrence_revisions: {
        [occurrence.id]: Number(occurrence.revision || 1),
      },
      segments,
    });
    return finishTimelineAssignment(result, occurrence, personnelItem, serviceDate);
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
    const drop = resolvePlanningDrop(result);
    if (!drop || runActionMutation.isPending) return;

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
    await refreshPlanning();
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
    setComposer({ shift, occurrence });
    setSidePanelMode("tasks");
  };

  const handleCompositionSave = async payload => {
    const result = await runActionMutation.mutateAsync(payload);
    await refreshPlanning();
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
    const occurrenceIds = [...new Set(taskSegments
      .filter(segment => segment.status !== "removed" && String(segment.shift_id) === String(shift.id))
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
    await refreshPlanning();
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
      const assigned = active.filter(item => String(item.planning_shift_id) === String(shift.id)).length;
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
  }, [occurrencePlanningStates, ownedAssignmentsInRange, ownedShiftsInRange, ownedTaskOccurrencesInRange, shiftsInRange, taskSegments]);
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
      await refreshPlanning();
      setPublishOpen(false);
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
    const step = view === "week" ? 7 : Math.max(1, range.days.length);
    if (view === "period") {
      const nextStart = addDays(range.start, direction * step);
      const nextEnd = addDays(range.end, direction * step);
      setCustomPeriodStart(toDateKey(nextStart));
      setCustomPeriodEnd(toDateKey(nextEnd));
      setAnchorDate(nextStart);
    } else {
      setAnchorDate(current => addDays(current, direction * step));
    }
    setSelectedShiftId(null);
    setExpandedTaskCardKey(null);
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
    setExpandedTaskCardKey(null);
  };

  const goToToday = () => {
    const today = parseDateKey(new Date());
    if (view === "period") {
      const dayCount = Math.max(1, range.days.length);
      setCustomPeriodStart(toDateKey(today));
      setCustomPeriodEnd(toDateKey(addDays(today, dayCount - 1)));
    }
    setAnchorDate(today);
    setSelectedShiftId(null);
    setExpandedTaskCardKey(null);
  };

  const isLoading = [
    shiftsQuery,
    assignmentsQuery,
    taskOccurrencesQuery,
    taskSegmentsQuery,
    personnelQuery,
    objectsQuery,
    routesQuery,
  ].some(query => query.isLoading) || bootstrapMutation.isPending;
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
          setExpandedTaskCardKey(null);
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
            const nextStart = range.start;
            setCustomPeriodStart(toDateKey(nextStart));
            setCustomPeriodEnd(toDateKey(addDays(nextStart, 27)));
            setAnchorDate(nextStart);
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
          <ResizablePanel defaultSize={76} minSize={56}>
            <PlanningBoard
              perspective={perspective}
              compact={compactMode}
              zoom={planningZoom}
              days={range.days}
              shifts={filteredShifts}
              coverageShifts={shiftsInRange}
              assignments={assignmentsInRange}
              segments={taskSegments}
              occurrences={visibleTaskOccurrences}
              personnel={matrixPersonnel}
              objects={matrixObjects}
              routes={routes}
              customers={customers}
              selectedShiftId={selectedShiftId}
              expandedTaskCardKey={expandedTaskCardKey}
              onExpandedTaskCardChange={setExpandedTaskCardKey}
              onSelectOccurrence={occurrence => openTaskComposer({ occurrence })}
              onFillStaffing={openOccurrenceStaffing}
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
              onResizeTaskSegment={payload => resizeTimelineTaskSegment(payload).catch(() => undefined)}
              mutationPending={runActionMutation.isPending}
              taskOccurrenceCount={visibleTaskOccurrences.length}
              isLoading={isLoading}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={24} minSize={19} maxSize={38}>
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
              }}
            />
          </ResizablePanel>
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
            setPerspective("employee");
            setSidePanelMode("tasks");
            setSelectedShiftId(null);
            setExpandedTaskCardKey(null);
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
        {undoStack.length > 0 && (
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[10px]" onClick={() => handleUndo().catch(() => undefined)}>
            <RotateCcw className="h-3 w-3" />
            Ongedaan maken
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Cloud className="h-3 w-3 text-emerald-600" />
          Concept automatisch opgeslagen
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
