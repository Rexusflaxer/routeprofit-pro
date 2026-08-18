import React, { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, AlertTriangle, ClipboardList, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import ObjectTaskSchedule from "./ObjectTaskSchedule";
import ObjectTaskSchedulePreviewDialog from "./ObjectTaskSchedulePreviewDialog";
import ObjectTaskTable from "./ObjectTaskTable";
import ObjectTaskWizard from "./ObjectTaskWizard";
import { getAmsterdamNow, objectTaskWeekStart } from "./objectTaskScheduleDomain";
import { taskTypeLabel } from "./objectTaskConfig";
import {
  addObjectTaskSeries,
  changeObjectTaskSeries,
  createObjectTask,
  createObjectTaskMutationKey,
  listObjectTasks,
  stopObjectTaskSeries,
} from "./objectTaskWorkflow";
import { listObjectSecurityPlans } from "./securityPlanWorkflow";

const EMPTY_TASK_DATA = {
  definitions: [],
  series: [],
  revisions: [],
  source_changes: [],
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
  const schedulePanelRef = useRef(null);
  const queryKey = useMemo(() => ["object-card", object.id, "tasks"], [object.id]);

  const query = useQuery({
    queryKey,
    queryFn: () => listObjectTasks({ customerId: object.customer_id, objectId: object.id }),
    retry: retryTaskList,
  });
  const data = useMemo(() => enrichedTaskData(query.data), [query.data]);
  const now = useMemo(() => getAmsterdamNow(
    data.server_clock?.iso && Number.isFinite(Date.parse(data.server_clock.iso))
      ? new Date(data.server_clock.iso)
      : new Date(),
  ), [data.server_clock?.iso]);
  const selectedWeek = objectTaskWeekStart(searchParams.get("task_week")) || now.weekStart;

  const setWeek = useCallback(value => {
    const normalized = objectTaskWeekStart(value);
    if (!normalized) return;
    const next = new URLSearchParams(searchParams);
    next.set("task_week", normalized);
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

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

  const refreshPlanning = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["planning-shifts"] }),
      queryClient.invalidateQueries({ queryKey: ["planning-assignments"] }),
      queryClient.invalidateQueries({ queryKey: ["planning-task-occurrences"] }),
      queryClient.invalidateQueries({ queryKey: ["planning-task-source-changes"] }),
      queryClient.invalidateQueries({ queryKey: ["planning-task-segments"] }),
    ]);
  }, [queryClient, queryKey]);

  const createMutation = useMutation({
    mutationFn: form => createObjectTask({
      customerId: object.customer_id,
      objectId: object.id,
      data: form,
      idempotencyKey: stableMutationKey(createKeyRef, "create", form),
    }),
    onSuccess: async response => {
      await refreshPlanning();
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
    mutationFn: ({ definition, values }) => addObjectTaskSeries({
      customerId: object.customer_id,
      objectId: object.id,
      entry: {
        ...values,
        definition,
        definition_id: definition.id,
      },
      data: values,
      idempotencyKey: stableMutationKey(addKeyRef, "add-series", {
        task_definition_id: definition.id,
        ...values,
      }),
    }),
    onSuccess: async response => {
      await refreshPlanning();
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
    mutationFn: ({ entry, values }) => changeObjectTaskSeries({
      customerId: object.customer_id,
      objectId: object.id,
      entry,
      data: values,
      idempotencyKey: stableMutationKey(changeKeyRef, "change-series", {
        series_id: entry.series_id,
        occurrence_date: entry.occurrence_date,
        ...values,
      }),
    }),
    onSuccess: async response => {
      await refreshPlanning();
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
    mutationFn: entry => stopObjectTaskSeries({
      customerId: object.customer_id,
      objectId: object.id,
      entry,
      idempotencyKey: stableMutationKey(stopKeyRef, "stop-series", {
        series_id: entry.series_id,
        occurrence_date: entry.occurrence_date,
      }),
    }),
    onSuccess: async response => {
      await refreshPlanning();
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
  const schedulePending = addMutation.isPending || changeMutation.isPending || stopMutation.isPending;
  const scheduleError = addMutation.error || changeMutation.error || stopMutation.error;

  const openSchedule = definition => {
    if (archived) return;
    setPreviewDefinitionId(null);
    addMutation.reset();
    changeMutation.reset();
    stopMutation.reset();
    addKeyRef.current = null;
    changeKeyRef.current = null;
    stopKeyRef.current = null;
    setScheduleDefinitionId(definition.id);
    globalThis.requestAnimationFrame?.(() => schedulePanelRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
  };

  const closeSchedule = () => {
    if (schedulePending) return;
    setScheduleDefinitionId(null);
    addMutation.reset();
    changeMutation.reset();
    stopMutation.reset();
  };

  const openCreate = () => {
    if (schedulePending) return;
    setScheduleDefinitionId(null);
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
            taskDefinitionId={scheduleDefinition.id}
            executionMode={scheduleDefinition.execution_mode}
            durationMinutes={Number(scheduleDefinition.duration_minutes || 0)}
            taskLabel={taskTypeLabel(scheduleDefinition)}
            weekStart={selectedWeek}
            onWeekChange={setWeek}
            serverClock={data.server_clock}
            pending={schedulePending}
            error={scheduleError}
            onPersistedCreate={values => addMutation.mutateAsync({ definition: scheduleDefinition, values })}
            onPersistedChange={(entry, values) => changeMutation.mutateAsync({ entry, values })}
            onPersistedStop={entry => stopMutation.mutateAsync(entry)}
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