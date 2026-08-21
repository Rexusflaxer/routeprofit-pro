import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, AlertTriangle, ClipboardList, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import ObjectTaskSchedule from "./ObjectTaskSchedule";
import ObjectTaskSchedulePreviewDialog from "./ObjectTaskSchedulePreviewDialog";
import ObjectTaskTable from "./ObjectTaskTable";
import ObjectTaskWizard from "./ObjectTaskWizard";
import { getAmsterdamNow, objectTaskWeek, objectTaskWeekStart } from "./objectTaskScheduleDomain";
import { taskTypeLabel } from "./objectTaskConfig";
import { resolveCaoPbPlanningPeriod } from "@/components/planning/planningCaoPeriodDomain";
import {
  addObjectTaskSeries,
  changeObjectTaskSeries,
  createObjectTask,
  createObjectTaskMutationKey,
  listObjectTasks,
  stopObjectTaskSeries,
} from "./objectTaskWorkflow";
import { listObjectSecurityPlans } from "./securityPlanWorkflow";
import {
  applyObjectTaskMutationResult,
  authoritativeObjectTaskEntry,
  createObjectTaskRefreshCoordinator,
  mergeObjectTaskQuerySnapshot,
} from "./objectTaskQueryCache";

const EMPTY_TASK_DATA = {
  definitions: [],
  series: [],
  revisions: [],
  source_changes: [],
  planning_coverage: [],
  server_clock: null,
};

function enrichedTaskData(value) {
  if (!value) return EMPTY_TASK_DATA;
  return {
    ...value,
    definitions: (value.definitions || []).map(definition => ({
      ...definition,
      task_type_label: taskTypeLabel(definition),
    })),
  };
}

function stableMutationKey(ref, action, payload) {
  const fingerprint = JSON.stringify(payload);
  if (ref.current?.fingerprint !== fingerprint) {
    ref.current = { fingerprint, key: createObjectTaskMutationKey(action) };
  }
  return ref.current.key;
}

function sourceChangeCount(response) {
  const reconciled = response?.reconciled?.source_change_ids;
  if (Array.isArray(reconciled)) return reconciled.length;
  return (response?.source_changes || []).filter(change => !["resolved", "closed"].includes(change.status)).length;
}

function retryTaskList(failureCount, error) {
  const status = Number(error?.status || 0);
  return failureCount < 1 && (!status || status >= 500);
}

const COVERAGE_PAGE_SIZE = 5000;
const COVERAGE_ID_CHUNK_SIZE = 200;
const COVERAGE_CONCURRENCY = 4;
const OCCURRENCE_COVERAGE_FIELDS = [
  "id",
  "object_task_definition_id",
  "service_date",
  "lifecycle_status",
];
const SEGMENT_COVERAGE_FIELDS = [
  "id",
  "shift_id",
  "task_occurrence_id",
  "start_date",
  "end_date",
  "start_time",
  "end_time",
  "status",
];
const SHIFT_COVERAGE_FIELDS = ["id", "status"];

async function filterAllCoverageRecords(entity, filter, sort, fields) {
  const result = new Map();
  for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
    const page = await entity.filter(
      filter,
      sort,
      COVERAGE_PAGE_SIZE,
      pageIndex * COVERAGE_PAGE_SIZE,
      fields,
    );
    page.forEach(record => result.set(String(record.id), record));
    if (page.length < COVERAGE_PAGE_SIZE) return [...result.values()];
  }
  throw new Error("De planningsdekking is te groot om veilig in het takenrooster te laden.");
}

async function filterCoverageRecordsForIds({ entity, field, ids, filter, sort, fields }) {
  const uniqueIds = [...new Set((ids || []).map(String).filter(Boolean))];
  if (uniqueIds.length === 0) return [];
  const chunks = [];
  for (let index = 0; index < uniqueIds.length; index += COVERAGE_ID_CHUNK_SIZE) {
    chunks.push(uniqueIds.slice(index, index + COVERAGE_ID_CHUNK_SIZE));
  }
  const records = new Map();
  for (let index = 0; index < chunks.length; index += COVERAGE_CONCURRENCY) {
    const pages = await Promise.all(chunks.slice(index, index + COVERAGE_CONCURRENCY).map(chunk => (
      filterAllCoverageRecords(
        entity,
        { ...filter, [field]: { $in: chunk } },
        sort,
        fields,
      )
    )));
    pages.flat().forEach(record => records.set(String(record.id), record));
  }
  return [...records.values()];
}

function shiftRemovalConfirmationRequired(error) {
  return error?.details?.code === "TASK_SHIFT_REMOVAL_CONFIRMATION_REQUIRED";
}

function mutationOptionsIdempotencyKey(options) {
  return String(options?.idempotencyKey || "").trim() || null;
}

function cancelledShiftRemovalError() {
  return Object.assign(
    new Error("De taakwijziging is niet opgeslagen. De gekoppelde diensten zijn behouden."),
    { code: "TASK_SHIFT_REMOVAL_CONFIRMATION_CANCELLED" },
  );
}

export default function ObjectTasksTab({
  object,
  view,
  searchTerm,
  onSearchChange,
  onOpenCreate,
  onCloseView,
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scheduleDefinitionId, setScheduleDefinitionId] = useState(null);
  const [previewDefinitionId, setPreviewDefinitionId] = useState(null);
  const createKeyRef = useRef(null);
  const addKeyRef = useRef(null);
  const changeKeyRef = useRef(null);
  const stopKeyRef = useRef(null);
  const batchEntrySnapshotsRef = useRef(new Map());
  const confirmedShiftRemovalBatchKeysRef = useRef(new Set());
  const shiftRemovalConfirmationRef = useRef(null);
  const schedulePanelRef = useRef(null);
  const taskDataRef = useRef(/** @type {any} */ (EMPTY_TASK_DATA));
  const taskDataObjectIdRef = useRef(object.id);
  const taskMutationCountRef = useRef(0);
  const [shiftRemovalConfirmation, setShiftRemovalConfirmation] = useState(null);
  if (taskDataObjectIdRef.current !== object.id) {
    taskDataObjectIdRef.current = object.id;
    taskDataRef.current = EMPTY_TASK_DATA;
  }
  const queryKey = useMemo(() => ["object-card", object.id, "tasks"], [object.id]);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const incoming = await listObjectTasks({ customerId: object.customer_id, objectId: object.id });
      const current = taskDataObjectIdRef.current === object.id
        ? taskDataRef.current
        : EMPTY_TASK_DATA;
      return mergeObjectTaskQuerySnapshot(current, incoming);
    },
    retry: retryTaskList,
  });
  useEffect(() => {
    if (query.data) taskDataRef.current = query.data;
  }, [query.data]);
  const data = useMemo(() => enrichedTaskData(query.data), [query.data]);
  const now = useMemo(() => getAmsterdamNow(
    data.server_clock?.iso && Number.isFinite(Date.parse(data.server_clock.iso))
      ? new Date(data.server_clock.iso)
      : new Date(),
  ), [data.server_clock?.iso]);
  const selectedWeek = objectTaskWeekStart(searchParams.get("task_week")) || now.weekStart;
  const coverageRange = useMemo(() => {
    const period = resolveCaoPbPlanningPeriod(selectedWeek);
    if (period) return { start: period.start_date, end: period.end_date };
    const week = objectTaskWeek(selectedWeek);
    return { start: week.start, end: week.end };
  }, [selectedWeek]);
  const coverageQueryKey = useMemo(() => [
    "object-card",
    object.id,
    "task-coverage",
    coverageRange.start,
    coverageRange.end,
  ], [coverageRange.end, coverageRange.start, object.id]);

  const setWeek = useCallback(value => {
    const normalized = objectTaskWeekStart(value);
    if (!normalized) return;
    const next = new URLSearchParams(searchParams);
    next.set("task_week", normalized);
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const coverageQuery = useQuery({
    queryKey: coverageQueryKey,
    queryFn: async () => {
      const occurrences = await filterAllCoverageRecords(
        base44.entities.PlanningTaskOccurrence,
        {
          object_id: object.id,
          lifecycle_status: "active",
          service_date: { $gte: coverageRange.start, $lte: coverageRange.end },
        },
        "-service_date",
        OCCURRENCE_COVERAGE_FIELDS,
      );
      const segments = await filterCoverageRecordsForIds({
        entity: base44.entities.PlanningShiftTaskSegment,
        field: "task_occurrence_id",
        ids: occurrences.map(item => item.id),
        filter: { object_id: object.id, status: { $ne: "removed" } },
        sort: "-start_date",
        fields: SEGMENT_COVERAGE_FIELDS,
      });
      const shifts = await filterCoverageRecordsForIds({
        entity: base44.entities.PlanningShift,
        field: "id",
        ids: segments.map(item => item.shift_id),
        // Segment IDs are already derived from object-scoped occurrences. Do
        // not filter the parent on object_id: a composed service spanning
        // multiple objects intentionally has object_id=null and object_ids[].
        filter: { status: { $ne: "cancelled" } },
        sort: "-service_date",
        fields: SHIFT_COVERAGE_FIELDS,
      });
      const activeShiftIds = new Set(shifts.map(shift => String(shift.id)));
      const servicesByOccurrence = new Map();
      segments.forEach(segment => {
        if (segment.status === "removed" || !activeShiftIds.has(String(segment.shift_id))) return;
        const occurrenceId = String(segment.task_occurrence_id);
        const current = servicesByOccurrence.get(occurrenceId) || [];
        current.push(segment);
        servicesByOccurrence.set(occurrenceId, current);
      });
      return occurrences.map(occurrence => ({
        ...occurrence,
        services: servicesByOccurrence.get(String(occurrence.id)) || [],
      }));
    },
    enabled: Boolean(scheduleDefinitionId),
  });

  const planQuery = useQuery({
    queryKey: ["object-card", object.id, "security-plans", "task-options"],
    queryFn: () => listObjectSecurityPlans({
      customerId: object.customer_id,
      objectId: object.id,
      page: 1,
      pageSize: 250,
    }),
    enabled: view === "new",
    retry: 1,
  });

  const refreshCoordinator = useMemo(() => createObjectTaskRefreshCoordinator({
    queryClient,
    taskQueryKey: queryKey,
    taskCoverageQueryKey: coverageQueryKey,
    isBusy: () => taskMutationCountRef.current > 0,
  }), [coverageQueryKey, queryClient, queryKey]);
  useEffect(() => () => refreshCoordinator.dispose(), [refreshCoordinator]);

  const runTaskMutation = useCallback(async operation => {
    taskMutationCountRef.current += 1;
    try {
      return await operation();
    } finally {
      taskMutationCountRef.current = Math.max(0, taskMutationCountRef.current - 1);
    }
  }, []);

  const authoritativeEntryForMutation = useCallback((action, idempotencyKey, entry, fallbackDefinition = null) => {
    const currentEntry = authoritativeObjectTaskEntry(taskDataRef.current, entry, fallbackDefinition);
    if (!idempotencyKey) return currentEntry;
    const snapshotKey = `${object.id}:${action}:${idempotencyKey}`;
    if (!batchEntrySnapshotsRef.current.has(snapshotKey)) {
      batchEntrySnapshotsRef.current.set(snapshotKey, currentEntry);
    }
    return batchEntrySnapshotsRef.current.get(snapshotKey);
  }, [object.id]);

  useEffect(() => {
    batchEntrySnapshotsRef.current.clear();
    confirmedShiftRemovalBatchKeysRef.current.clear();
    const pending = shiftRemovalConfirmationRef.current;
    if (pending && pending.objectId !== object.id) {
      shiftRemovalConfirmationRef.current = null;
      pending.reject(cancelledShiftRemovalError());
    }
    setShiftRemovalConfirmation(current => (current?.objectId === object.id ? current : null));
  }, [object.id]);

  useEffect(() => () => {
    const pending = shiftRemovalConfirmationRef.current;
    shiftRemovalConfirmationRef.current = null;
    pending?.reject(cancelledShiftRemovalError());
  }, []);

  const acceptTaskMutation = useCallback(response => {
    const next = queryClient.setQueryData(queryKey, current => applyObjectTaskMutationResult(
      current || taskDataRef.current,
      response,
    ));
    if (next) taskDataRef.current = next;
    refreshCoordinator.schedule();
  }, [queryClient, queryKey, refreshCoordinator]);

  const createMutation = useMutation({
    mutationFn: form => runTaskMutation(() => createObjectTask({
      customerId: object.customer_id,
      objectId: object.id,
      data: form,
      idempotencyKey: stableMutationKey(createKeyRef, "create", form),
    })),
    onSuccess: response => {
      acceptTaskMutation(response);
      createKeyRef.current = null;
      onCloseView();
      const affected = sourceChangeCount(response);
      toast({
        title: "Taak toegevoegd",
        description: affected
          ? `${affected} bestaande ${affected === 1 ? "dienst vraagt" : "diensten vragen"} controle in Planning.`
          : "De taak is toegevoegd en staat in het objectrooster.",
      });
    },
  });

  const addMutation = useMutation({
    mutationFn: (/** @type {any} */ payload) => runTaskMutation(() => {
      const { definition, values, options } = payload;
      const customIdempotencyKey = mutationOptionsIdempotencyKey(options);
      const currentEntry = authoritativeEntryForMutation(
        "add-series",
        customIdempotencyKey,
        values,
        definition,
      );
      return addObjectTaskSeries({
        customerId: object.customer_id,
        objectId: object.id,
        entry: currentEntry,
        data: values,
        idempotencyKey: customIdempotencyKey || stableMutationKey(
          addKeyRef,
          "add-series",
          { task_definition_id: currentEntry.definition_id, ...values },
        ),
      });
    }),
    onSuccess: response => {
      acceptTaskMutation(response);
      addKeyRef.current = null;
      const affected = sourceChangeCount(response);
      toast({
        title: "Taakmoment toegevoegd",
        description: affected
          ? `${affected} reeds ingeplande ${affected === 1 ? "dienst is" : "diensten zijn"} gemarkeerd voor controle.`
          : "Het taakmoment is aan het rooster toegevoegd.",
      });
    },
  });

  const changeMutation = useMutation({
    mutationFn: (/** @type {any} */ payload) => runTaskMutation(() => {
      const {
        entry,
        values,
        options,
        confirmRemoveOutsideShifts = false,
      } = payload;
      const customIdempotencyKey = mutationOptionsIdempotencyKey(options);
      const currentEntry = authoritativeEntryForMutation(
        "change-series",
        customIdempotencyKey,
        entry,
      );
      return changeObjectTaskSeries({
        customerId: object.customer_id,
        objectId: object.id,
        entry: currentEntry,
        data: values,
        idempotencyKey: customIdempotencyKey || stableMutationKey(
          changeKeyRef,
          "change-series",
          {
            series_id: currentEntry.series_id,
            occurrence_date: currentEntry.occurrence_date,
            ...values,
            confirm_remove_outside_shifts: confirmRemoveOutsideShifts,
          },
        ),
        ...(confirmRemoveOutsideShifts ? { confirmRemoveOutsideShifts: true } : {}),
      });
    }),
    onSuccess: response => {
      acceptTaskMutation(response);
      changeKeyRef.current = null;
      const affected = sourceChangeCount(response);
      toast({
        title: "Taakmoment gewijzigd",
        description: affected
          ? `${affected} reeds ingeplande ${affected === 1 ? "dienst is" : "diensten zijn"} gemarkeerd voor controle.`
          : "De wijziging geldt vanaf dit taakmoment; eerdere weken blijven behouden.",
      });
    },
  });

  const stopMutation = useMutation({
    mutationFn: (/** @type {any} */ payload) => runTaskMutation(() => {
      const { entry, options } = payload;
      const customIdempotencyKey = mutationOptionsIdempotencyKey(options);
      const currentEntry = authoritativeEntryForMutation(
        "stop-series",
        customIdempotencyKey,
        entry,
      );
      return stopObjectTaskSeries({
        customerId: object.customer_id,
        objectId: object.id,
        entry: currentEntry,
        idempotencyKey: customIdempotencyKey || stableMutationKey(
          stopKeyRef,
          "stop-series",
          {
            series_id: currentEntry.series_id,
            occurrence_date: currentEntry.occurrence_date,
          },
        ),
      });
    }),
    onSuccess: response => {
      acceptTaskMutation(response);
      stopKeyRef.current = null;
      const affected = sourceChangeCount(response);
      toast({
        title: "Taakmomenten gestopt",
        description: affected
          ? `${affected} reeds ingeplande ${affected === 1 ? "dienst is" : "diensten zijn"} gemarkeerd voor controle.`
          : "Vanaf dit taakmoment worden geen nieuwe momenten meer aangemaakt.",
      });
    },
  });

  const persistTaskChange = async (entry, values, options = {}) => {
    const customIdempotencyKey = mutationOptionsIdempotencyKey(options);
    const alreadyConfirmed = Boolean(
      customIdempotencyKey
      && confirmedShiftRemovalBatchKeysRef.current.has(customIdempotencyKey),
    );
    try {
      return await changeMutation.mutateAsync({
        entry,
        values,
        options,
        ...(alreadyConfirmed ? { confirmRemoveOutsideShifts: true } : {}),
      });
    } catch (error) {
      if (!shiftRemovalConfirmationRequired(error)) throw error;
      if (shiftRemovalConfirmationRef.current) {
        throw new Error("Rond eerst de openstaande bevestiging voor de gekoppelde diensten af.");
      }
      return new Promise((resolve, reject) => {
        const request = {
          objectId: object.id,
          entry,
          values,
          options,
          shifts: Array.isArray(error?.details?.shifts) ? error.details.shifts : [],
          error: null,
          resolve,
          reject,
        };
        shiftRemovalConfirmationRef.current = request;
        setShiftRemovalConfirmation(request);
      });
    }
  };

  const cancelShiftRemovalConfirmation = () => {
    if (changeMutation.isPending) return;
    const request = shiftRemovalConfirmationRef.current;
    if (!request) return;
    shiftRemovalConfirmationRef.current = null;
    setShiftRemovalConfirmation(null);
    changeMutation.reset();
    request.reject(cancelledShiftRemovalError());
  };

  const confirmShiftRemovalChange = async event => {
    event?.preventDefault?.();
    const request = shiftRemovalConfirmationRef.current;
    if (!request || changeMutation.isPending) return;
    setShiftRemovalConfirmation({ ...request, error: null });
    try {
      const response = await changeMutation.mutateAsync({
        entry: request.entry,
        values: request.values,
        options: request.options,
        confirmRemoveOutsideShifts: true,
      });
      const customIdempotencyKey = mutationOptionsIdempotencyKey(request.options);
      if (customIdempotencyKey) {
        confirmedShiftRemovalBatchKeysRef.current.add(customIdempotencyKey);
      }
      shiftRemovalConfirmationRef.current = null;
      setShiftRemovalConfirmation(null);
      request.resolve(response);
    } catch (error) {
      const next = {
        ...request,
        shifts: shiftRemovalConfirmationRequired(error) && Array.isArray(error?.details?.shifts)
          ? error.details.shifts
          : request.shifts,
        error: shiftRemovalConfirmationRequired(error) ? null : error,
      };
      shiftRemovalConfirmationRef.current = next;
      setShiftRemovalConfirmation(next);
    }
  };

  const activeDefinitions = useMemo(
    () => data.definitions.filter(definition => definition.status !== "archived"),
    [data.definitions],
  );
  const rows = useMemo(() => {
    const term = String(searchTerm || "").trim().toLowerCase();
    return activeDefinitions.filter(task => !term || [
      taskTypeLabel(task),
      task.instructions,
      task.start_time,
      task.end_time,
    ].some(value => String(value || "").toLowerCase().includes(term)));
  }, [activeDefinitions, searchTerm]);
  const scheduleDefinition = activeDefinitions.find(definition => String(definition.id) === String(scheduleDefinitionId)) || null;
  const previewDefinition = activeDefinitions.find(definition => String(definition.id) === String(previewDefinitionId)) || null;
  const openSourceChanges = data.source_changes.filter(change => !["resolved", "closed"].includes(change.status));
  const archived = object.status === "archived";
  const wizardOpen = !archived && view === "new";
  const schedulePending = addMutation.isPending
    || changeMutation.isPending
    || stopMutation.isPending
    || Boolean(shiftRemovalConfirmation);
  const scheduleError = shiftRemovalConfirmation
    ? addMutation.error || stopMutation.error
    : addMutation.error || changeMutation.error || stopMutation.error;

  const openSchedule = definition => {
    if (archived) return;
    setPreviewDefinitionId(null);
    addMutation.reset();
    changeMutation.reset();
    stopMutation.reset();
    addKeyRef.current = null;
    changeKeyRef.current = null;
    stopKeyRef.current = null;
    batchEntrySnapshotsRef.current.clear();
    confirmedShiftRemovalBatchKeysRef.current.clear();
    setScheduleDefinitionId(definition.id);
    globalThis.requestAnimationFrame?.(() => schedulePanelRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
  };

  const closeSchedule = () => {
    if (schedulePending) return;
    setScheduleDefinitionId(null);
    addMutation.reset();
    changeMutation.reset();
    stopMutation.reset();
    addKeyRef.current = null;
    changeKeyRef.current = null;
    stopKeyRef.current = null;
    batchEntrySnapshotsRef.current.clear();
    confirmedShiftRemovalBatchKeysRef.current.clear();
  };

  const openCreate = () => {
    if (schedulePending) return;
    closeSchedule();
    onOpenCreate();
  };

  return (
    <div className="flex min-h-[620px] flex-col bg-card/35 backdrop-blur-xl">
      <ObjectTaskSchedulePreviewDialog
        definition={previewDefinition}
        contextData={data}
        weekStart={selectedWeek}
        onWeekChange={setWeek}
        open={Boolean(previewDefinition)}
        onOpenChange={open => !open && setPreviewDefinitionId(null)}
      />

      <AlertDialog
        open={Boolean(shiftRemovalConfirmation)}
        onOpenChange={open => {
          if (!open) cancelShiftRemovalConfirmation();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Gekoppelde diensten verwijderen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {shiftRemovalConfirmation?.shifts?.length === 1
                ? "Deze dienst valt volledig buiten de nieuwe taaktijd en wordt bij bevestiging verwijderd."
                : `${shiftRemovalConfirmation?.shifts?.length || "Meerdere"} diensten vallen volledig buiten de nieuwe taaktijd en worden bij bevestiging verwijderd.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {shiftRemovalConfirmation?.shifts?.length > 0 && (
            <div className="space-y-1 rounded-md border bg-muted/35 p-3 text-xs">
              {shiftRemovalConfirmation.shifts.map((shift, index) => (
                <p key={shift.id || `${shift.service_date}:${shift.start_time}:${index}`}>
                  {shift.service_date} · {shift.start_time}–{shift.end_time} · {shift.name || "Dienst"}
                </p>
              ))}
            </div>
          )}
          {shiftRemovalConfirmation?.error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {shiftRemovalConfirmation.error.message}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={changeMutation.isPending}>Diensten behouden</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={changeMutation.isPending}
              onClick={confirmShiftRemovalChange}
            >
              {changeMutation.isPending ? "Wijziging verwerken…" : "Diensten verwijderen en taak wijzigen"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {wizardOpen && (
        <ObjectTaskWizard
          key="new-task"
          contextData={data}
          securityPlans={planQuery.data?.items || []}
          plansLoading={planQuery.isLoading}
          plansError={planQuery.error}
          weekStart={selectedWeek}
          onWeekChange={setWeek}
          serverClock={data.server_clock}
          saving={createMutation.isPending}
          error={createMutation.error}
          onSave={form => createMutation.mutate(form)}
          onCancel={() => {
            createMutation.reset();
            createKeyRef.current = null;
            onCloseView();
          }}
        />
      )}

      {scheduleDefinition && !wizardOpen && (
        <section ref={schedulePanelRef} className="scroll-mt-4 border-b border-border/70 bg-card/25 p-4" aria-label={`Rooster wijzigen voor ${taskTypeLabel(scheduleDefinition)}`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Rooster wijzigen</p>
              <h2 className="mt-1 text-base font-semibold">{taskTypeLabel(scheduleDefinition)}</h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">Teken zoals voorheen in het rooster. Klik op een bestaand taakblok om de exacte tijd en herhaling vanaf dat moment te wijzigen.</p>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={schedulePending} onClick={closeSchedule}>Annuleren</Button>
          </div>
          <ObjectTaskSchedule
            contextData={data}
            planningCoverage={coverageQuery.data || []}
            taskDefinitionId={scheduleDefinition.id}
            executionMode={scheduleDefinition.execution_mode}
            durationMinutes={Number(scheduleDefinition.duration_minutes || 0)}
            taskLabel={taskTypeLabel(scheduleDefinition)}
            weekStart={selectedWeek}
            onWeekChange={setWeek}
            serverClock={data.server_clock}
            pending={schedulePending}
            error={scheduleError}
            onPersistedCreate={(values, options) => addMutation.mutateAsync({
              definition: scheduleDefinition,
              values,
              options,
            })}
            onPersistedChange={persistTaskChange}
            onPersistedStop={(entry, options) => stopMutation.mutateAsync({ entry, options })}
            onCancel={closeSchedule}
            onSaved={closeSchedule}
          />
        </section>
      )}

      <div className="flex flex-col gap-3 border-b border-border/70 bg-card/25 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Taken</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{activeDefinitions.length} {activeDefinitions.length === 1 ? "taak" : "taken"} voor dit object</p>
        </div>
        <div className="flex gap-2">
          <div className="relative min-w-0 sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchTerm} onChange={event => onSearchChange(event.target.value)} placeholder="Zoek taak..." className="h-9 pl-9 pr-9" />
            {searchTerm && <button type="button" onClick={() => onSearchChange("")} aria-label="Zoekopdracht wissen" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-4 w-4" /></button>}
          </div>
          {!wizardOpen && <Button size="sm" onClick={openCreate} disabled={archived || schedulePending}><Plus /> Taak toevoegen</Button>}
        </div>
      </div>

      <div className="flex-1">
        {query.isLoading ? (
          <div className="flex min-h-[360px] items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Taken laden...</div>
        ) : query.isError ? (
          <div className="m-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1"><p className="font-medium">De taken konden niet worden geladen.</p><p className="mt-1 text-xs opacity-80">{query.error.message}</p></div>
            <Button size="sm" variant="outline" onClick={() => query.refetch()}><RefreshCw className="h-3.5 w-3.5" /> Opnieuw</Button>
          </div>
        ) : (
          <>
            {openSourceChanges.length > 0 && (
              <div className="m-4 flex flex-col gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 sm:flex-row sm:items-center">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Planning moet worden bijgewerkt</p><p className="mt-0.5 text-xs text-muted-foreground">{openSourceChanges.length} {openSourceChanges.length === 1 ? "ingeplande dienst wijkt" : "ingeplande diensten wijken"} af van het actuele taakrooster.</p></div>
                <Button size="sm" variant="outline" onClick={() => navigate("/Planning")}>Open Planning</Button>
              </div>
            )}

            {rows.length ? (
              <ObjectTaskTable
                rows={rows}
                series={data.series}
                revisions={data.revisions}
                sourceChanges={data.source_changes}
                selectedDefinitionId={scheduleDefinition?.id || null}
                disabled={archived || wizardOpen || schedulePending}
                onViewSchedule={definition => setPreviewDefinitionId(definition.id)}
                onOpenSchedule={openSchedule}
              />
            ) : (
              <div className="flex min-h-[360px] flex-col items-center justify-center px-4 text-center">
                <ClipboardList className="mb-3 h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-medium">{searchTerm ? "Geen taken gevonden" : "Nog geen taken"}</p>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">{searchTerm ? "Pas de zoekopdracht aan." : "Leg vast welke taken op dit object moeten worden uitgevoerd."}</p>
                {!searchTerm && !archived && !wizardOpen && <Button size="sm" className="mt-4" onClick={openCreate}><Plus /> Taak toevoegen</Button>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
