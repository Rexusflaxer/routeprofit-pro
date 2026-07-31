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
import PlanningEmployeePanel from "@/components/planning/PlanningEmployeePanel";
import {
  PublishPlanningDialog,
  ShiftActionDialog,
} from "@/components/planning/PlanningDialogs";
import { invokePlanningApi } from "@/components/planning/planningApiClient";
import {
  addDays,
  buildCandidateRanking,
  getAssignmentWarnings,
  getPlanningRange,
  parseDateKey,
  splitIntoWeeks,
  toDateKey,
} from "@/components/planning/planningDomain";

const VALID_VIEWS = new Set(["day", "week", "four_weeks"]);
const VALID_PERSPECTIVES = new Set(["object", "employee"]);
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
  if (view === "day") return dayLabel.format(range.start);
  return `${dateLabel.format(range.start)} – ${dateLabel.format(range.end)}`;
}

function mutationMessage(error) {
  if (Number(error?.status) === 409) return `${error.message} De planning is opnieuw geladen.`;
  return error?.message || "De planningactie kon niet worden uitgevoerd.";
}

export default function Planning() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDate = parseDateKey(searchParams.get("date")) || new Date();
  const initialView = VALID_VIEWS.has(searchParams.get("view")) ? searchParams.get("view") : "week";
  const initialPerspective = VALID_PERSPECTIVES.has(searchParams.get("perspective"))
    ? searchParams.get("perspective")
    : "object";

  const [anchorDate, setAnchorDate] = useState(initialDate);
  const [view, setView] = useState(initialView);
  const [perspective, setPerspective] = useState(initialPerspective);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [selectedShiftId, setSelectedShiftId] = useState(null);
  const [shiftAction, setShiftAction] = useState(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [liveMessage, setLiveMessage] = useState("");
  const lastBootstrapKey = useRef("");

  const range = useMemo(() => getPlanningRange(anchorDate, view), [anchorDate, view]);
  const weeks = useMemo(() => splitIntoWeeks(range.days), [range.days]);
  const rangeLabel = rangeLabelFor(view, range);
  const periodStart = toDateKey(range.start);
  const periodEnd = toDateKey(range.end);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("date", toDateKey(anchorDate));
    next.set("view", view);
    next.set("perspective", perspective);
    setSearchParams(next, { replace: true });
    // searchParams changes after this synchronized update; it must not retrigger the state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorDate, perspective, setSearchParams, view]);

  const shiftsQuery = useQuery({
    queryKey: ["planning-shifts"],
    queryFn: () => base44.entities.PlanningShift.list("-service_date"),
    staleTime: 15_000,
  });
  const assignmentsQuery = useQuery({
    queryKey: ["planning-assignments"],
    queryFn: () => base44.entities.PlanningAssignment.list("-updated_date"),
    staleTime: 10_000,
  });
  const personnelQuery = useQuery({
    queryKey: ["personnel"],
    queryFn: () => base44.entities.Personnel.list(),
    staleTime: 60_000,
  });
  const qualificationsQuery = useQuery({
    queryKey: ["personnel-qualifications"],
    queryFn: () => base44.entities.PersonnelQualification.list(),
    staleTime: 60_000,
  });
  const absencesQuery = useQuery({
    queryKey: ["personnel-absences"],
    queryFn: () => base44.entities.PersonnelAbsence.list(),
    staleTime: 30_000,
  });
  const passesQuery = useQuery({
    queryKey: ["personnel-security-passes"],
    queryFn: () => base44.entities.PersonnelSecurityPass.list(),
    staleTime: 60_000,
  });
  const restrictionsQuery = useQuery({
    queryKey: ["personnel-restrictions"],
    queryFn: () => base44.entities.PersonnelRestriction.list(),
    staleTime: 60_000,
  });
  const contractsQuery = useQuery({
    queryKey: ["personnel-contracts"],
    queryFn: () => base44.entities.PersonnelContract.list(),
    staleTime: 60_000,
  });
  const objectsQuery = useQuery({
    queryKey: ["objects"],
    queryFn: () => base44.entities.SurveillanceObject.list(),
    staleTime: 60_000,
  });
  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list(),
    staleTime: 60_000,
  });
  const routesQuery = useQuery({
    queryKey: ["routes"],
    queryFn: () => base44.entities.Route.list(),
    staleTime: 60_000,
  });

  const refreshPlanning = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["planning-shifts"] }),
      queryClient.invalidateQueries({ queryKey: ["planning-assignments"] }),
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
    const key = `${periodStart}:${periodEnd}`;
    if (lastBootstrapKey.current === key) return;
    lastBootstrapKey.current = key;
    bootstrapMutation.mutate({ period_start: periodStart, period_end: periodEnd });
    // The mutation identity changes between renders; the range key is the intended trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodEnd, periodStart]);

  const allShifts = useMemo(
    () => (shiftsQuery.data || []).map(normalizePlanningShift),
    [shiftsQuery.data],
  );
  const assignments = useMemo(
    () => (assignmentsQuery.data || []).map(normalizePlanningAssignment),
    [assignmentsQuery.data],
  );
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
    && shift.service_date >= periodStart
    && shift.service_date <= periodEnd
  )), [allShifts, periodEnd, periodStart]);
  const shiftIdsInRange = useMemo(() => new Set(shiftsInRange.map(shift => String(shift.id))), [shiftsInRange]);
  const assignmentsInRange = useMemo(() => assignments.filter(item => shiftIdsInRange.has(String(item.planning_shift_id))), [assignments, shiftIdsInRange]);

  const filteredShifts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("nl-NL");
    const active = activeAssignments(assignmentsInRange);
    return shiftsInRange.filter(shift => {
      const object = objectsById.get(String(shift.object_id || ""));
      if (customerFilter !== "all") {
        const shiftCustomerId = String(shift.customer_id || object?.customer_id || "");
        if (shiftCustomerId !== String(customerFilter)) return false;
      }
      const shiftAssignments = active.filter(item => String(item.planning_shift_id) === String(shift.id));
      const required = Math.max(1, Number(shift.required_count || 1));
      const warnings = shiftAssignments.flatMap(assignmentWarnings);
      if (statusFilter === "vacant" && shiftAssignments.length >= required) return false;
      if (statusFilter === "draft" && shift.status !== "draft" && !shiftAssignments.some(item => item.status === "draft")) return false;
      if (statusFilter === "warnings" && warnings.length === 0) return false;
      if (statusFilter === "published" && shift.status !== "published") return false;
      if (!query) return true;
      return [
        shift.name,
        shift.route_name,
        shift.object_name,
        shift.group_label,
        object?.name,
        object?.address,
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
  ]);

  const selectedShift = useMemo(
    () => allShifts.find(shift => String(shift.id) === String(selectedShiftId)) || null,
    [allShifts, selectedShiftId],
  );
  const activePersonnel = useMemo(() => personnel.filter(item => (
    item.status === "active" || item.is_active === true
  )), [personnel]);

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
    return ranked.filter(candidate => !assignedPersonnelIds.has(String(candidate.personnel.id)));
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
    const result = await runActionMutation.mutateAsync({
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
    const result = await runActionMutation.mutateAsync({
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
    const result = await runActionMutation.mutateAsync({
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

  const handleDragEnd = result => {
    if (!result.destination || !result.draggableId.startsWith("personnel:")) return;
    if (!result.destination.droppableId.startsWith("slot:")) return;
    const [, shiftId, slotValue] = result.destination.droppableId.split(":");
    const personnelId = result.draggableId.slice("personnel:".length);
    const shift = allShifts.find(item => String(item.id) === String(shiftId));
    const personnelItem = activePersonnel.find(item => String(item.id) === String(personnelId));
    if (shift && personnelItem) {
      executeAssignment(shift, personnelItem, Number(slotValue)).catch(() => undefined);
    }
  };

  const handleShiftActionConfirm = async payload => {
    const action = shiftAction?.action;
    if (!action) return;
    const result = await runActionMutation.mutateAsync({
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

  const planningStats = useMemo(() => {
    const active = activeAssignments(assignmentsInRange);
    const warnings = active.flatMap(assignmentWarnings);
    const vacantCount = shiftsInRange.reduce((count, shift) => {
      const assigned = active.filter(item => String(item.planning_shift_id) === String(shift.id)).length;
      return count + Math.max(0, Math.max(1, Number(shift.required_count || 1)) - assigned);
    }, 0);
    return {
      draftShiftCount: shiftsInRange.filter(shift => shift.status === "draft" || Number(shift.revision || 0) > Number(shift.published_revision || 0)).length,
      draftAssignmentCount: active.filter(item => item.status === "draft" || Number(item.revision || 0) > Number(item.published_revision || 0)).length,
      warningCount: warnings.length,
      criticalCount: warnings.filter(warning => warning.severity === "critical").length,
      vacantCount,
    };
  }, [assignmentsInRange, shiftsInRange]);

  const publishMutation = useMutation({
    mutationFn: payload => invokePlanningApi({
      action: "publish",
      period_start: periodStart,
      period_end: periodEnd,
      scope_type: view === "four_weeks" ? "range" : view,
      shift_ids: shiftsInRange.map(shift => shift.id),
      expected_shift_revisions: Object.fromEntries(
        shiftsInRange.map(shift => [shift.id, Number(shift.revision || 1)]),
      ),
      publication_reason: `Planning gepubliceerd voor ${rangeLabel}`,
      ...payload,
    }),
    onSuccess: async result => {
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
    const step = view === "day" ? 1 : view === "week" ? 7 : 28;
    setAnchorDate(current => addDays(current, direction * step));
    setSelectedShiftId(null);
  };

  const isLoading = [
    shiftsQuery,
    assignmentsQuery,
    personnelQuery,
    objectsQuery,
    routesQuery,
  ].some(query => query.isLoading) || bootstrapMutation.isPending;
  const loadError = [
    shiftsQuery.error,
    assignmentsQuery.error,
    personnelQuery.error,
  ].find(Boolean);

  return (
    <div className="flex h-full min-h-0 min-w-[880px] flex-col overflow-hidden bg-background">
      <PlanningToolbar
        perspective={perspective}
        onPerspectiveChange={setPerspective}
        view={view}
        onViewChange={nextView => {
          setView(nextView);
          setSelectedShiftId(null);
        }}
        rangeLabel={rangeLabel}
        onPrevious={() => changePeriod(-1)}
        onToday={() => {
          setAnchorDate(new Date());
          setSelectedShiftId(null);
        }}
        onNext={() => changePeriod(1)}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        customerFilter={customerFilter}
        onCustomerFilterChange={setCustomerFilter}
        customers={customers}
        warningCount={planningStats.warningCount}
        onPublish={() => setPublishOpen(true)}
        publishDisabled={shiftsInRange.length === 0 || planningStats.draftShiftCount + planningStats.draftAssignmentCount === 0}
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
              view={view}
              days={range.days}
              weeks={weeks}
              shifts={filteredShifts}
              assignments={assignmentsInRange}
              personnel={activePersonnel}
              objects={objects}
              routes={routes}
              customers={customers}
              selectedShiftId={selectedShiftId}
              onSelectShift={shift => setSelectedShiftId(shift.id)}
              onUnassign={(shift, assignment) => handleUnassign(shift, assignment).catch(() => undefined)}
              onMove={shift => setShiftAction({ action: "move", shift })}
              onCopy={shift => setShiftAction({ action: "copy", shift })}
              isLoading={isLoading}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={24} minSize={19} maxSize={38}>
            <PlanningEmployeePanel
              selectedShift={selectedShift}
              candidates={candidates}
              onAssign={candidate => handleCandidateAssign(candidate).catch(() => undefined)}
              onCloseShift={() => setSelectedShiftId(null)}
              personnelCount={activePersonnel.length}
              qualifications={qualifications}
              securityPasses={securityPasses}
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
        onOpenChange={open => { if (!open) setShiftAction(null); }}
        onConfirm={payload => handleShiftActionConfirm(payload).catch(() => undefined)}
        isPending={runActionMutation.isPending}
      />
      <PublishPlanningDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        rangeLabel={rangeLabel}
        {...planningStats}
        onConfirm={payload => publishMutation.mutate(payload)}
        isPending={publishMutation.isPending}
      />
    </div>
  );
}