import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, AlertTriangle, ClipboardList, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import ObjectTaskSeriesDialog from "./ObjectTaskSeriesDialog";
import ObjectTaskTable from "./ObjectTaskTable";
import ObjectTaskWeekSchedule from "./ObjectTaskWeekSchedule";
import ObjectTaskWizard from "./ObjectTaskWizard";
import {
  createObjectTaskClientId,
  getAmsterdamNow,
  objectTaskWeekStart,
  projectObjectTaskSchedules,
} from "./objectTaskScheduleDomain";
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
  const [selectedEntry, setSelectedEntry] = useState(null);
  const createKeyRef = useRef(null);
  const addKeyRef = useRef(null);
  const changeKeyRef = useRef(null);
  const stopKeyRef = useRef(null);
  const boardRef = useRef(null);
  const queryKey = useMemo(() => ["object-card", object.id, "tasks"], [object.id]);

  const query = useQuery({
    queryKey,
    queryFn: () => listObjectTasks({ customerId: object.customer_id, objectId: object.id }),
    retry: 1,
  });
  const data = useMemo(() => enrichedTaskData(query.data), [query.data]);
  const now = useMemo(() => getAmsterdamNow(
    data.server_clock?.iso && Number.isFinite(Date.parse(data.server_clock.iso))
      ? new Date(data.server_clock.iso)
      : new Date(),
  ), [data.server_clock?.iso]);
  const requestedWeek = objectTaskWeekStart(searchParams.get("task_week"));
  const selectedWeek = requestedWeek && requestedWeek >= now.weekStart ? requestedWeek : now.weekStart;

  const setWeek = useCallback((value, replace = false) => {
    const normalized = objectTaskWeekStart(value);
    if (!normalized) return;
    const next = new URLSearchParams(searchParams);
    next.set("task_week", normalized);
    setSearchParams(next, { replace });
    setSelectedEntry(null);
  }, [searchParams, setSearchParams]);

  const setDrawingDefinition = useCallback(definition => {
    const definitionId = typeof definition === "string" ? definition : definition?.id;
    const next = new URLSearchParams(searchParams);
    if (definitionId && String(definitionId) !== next.get("task_definition")) next.set("task_definition", String(definitionId));
    else next.delete("task_definition");
    setSearchParams(next);
    setSelectedEntry(null);
    globalThis.requestAnimationFrame?.(() => boardRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (searchParams.get("task_week") !== selectedWeek) setWeek(selectedWeek, true);
  }, [searchParams, selectedWeek, setWeek]);

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
          : "De taakmomenten staan in het weekrooster en zijn beschikbaar voor Planning.",
      });
    },
  });

  const addMutation = useMutation({
    mutationFn: ({ entry, values }) => addObjectTaskSeries({
      customerId: object.customer_id,
      objectId: object.id,
      entry,
      data: values,
      idempotencyKey: stableMutationKey(addKeyRef, "add-series", {
        task_definition_id: entry.definition_id,
        occurrence_date: entry.occurrence_date,
        ...values,
      }),
    }),
    onSuccess: async response => {
      await refreshPlanning();
      addKeyRef.current = null;
      setSelectedEntry(null);
      const affected = sourceChangeCount(response);
      toast({
        title: "Roosterreeks toegevoegd",
        description: affected
          ? `${affected} reeds ingeplande ${affected === 1 ? "dienst is" : "diensten zijn"} gemarkeerd voor controle.`
          : "Het nieuwe taakmoment is aan de bestaande taak toegevoegd.",
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
      setSelectedEntry(null);
      const affected = sourceChangeCount(response);
      toast({
        title: "Taakreeks gewijzigd",
        description: affected
          ? `${affected} reeds ingeplande ${affected === 1 ? "dienst is" : "diensten zijn"} gemarkeerd voor controle.`
          : "De wijziging geldt vanaf het gekozen taakmoment; eerdere weken blijven behouden.",
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
      setSelectedEntry(null);
      const affected = sourceChangeCount(response);
      toast({
        title: "Taakreeks gestopt",
        description: affected
          ? `${affected} reeds ingeplande ${affected === 1 ? "dienst is" : "diensten zijn"} gemarkeerd voor controle.`
          : "Vanaf de gekozen datum worden geen nieuwe taakmomenten aangemaakt.",
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
      task.execution_mode,
    ].some(value => String(value || "").toLowerCase().includes(term)));
  }, [activeDefinitions, searchTerm]);
  const drawingDefinitionId = searchParams.get("task_definition");
  const drawingDefinition = activeDefinitions.find(definition => String(definition.id) === String(drawingDefinitionId)) || null;
  const projectionRows = drawingDefinition ? activeDefinitions : rows;
  const visibleIds = useMemo(() => new Set(projectionRows.map(row => String(row.id))), [projectionRows]);
  const visibleData = useMemo(() => ({
    ...data,
    definitions: projectionRows,
    series: data.series.filter(item => visibleIds.has(String(item.task_definition_id))),
    source_changes: data.source_changes.filter(change => visibleIds.has(String(change.object_task_definition_id))),
  }), [data, projectionRows, visibleIds]);
  const weekEntries = useMemo(() => projectObjectTaskSchedules({
    definitions: visibleData.definitions,
    series: visibleData.series,
    revisions: visibleData.revisions,
    sourceChanges: visibleData.source_changes,
    weekStart: selectedWeek,
  }), [selectedWeek, visibleData]);
  const ownWeekEntries = drawingDefinition
    ? weekEntries.filter(entry => String(entry.definition_id) === String(drawingDefinition.id))
    : weekEntries;
  const contextWeekEntries = drawingDefinition
    ? weekEntries.filter(entry => String(entry.definition_id) !== String(drawingDefinition.id))
    : [];
  const openSourceChanges = data.source_changes.filter(change => !["resolved", "closed"].includes(change.status));
  const archived = object.status === "archived";
  const wizardOpen = !archived && view === "new";
  const seriesPending = addMutation.isPending || changeMutation.isPending || stopMutation.isPending;
  const seriesError = addMutation.error || changeMutation.error || stopMutation.error;

  const openEntry = entry => {
    if (archived) return;
    addMutation.reset();
    changeMutation.reset();
    stopMutation.reset();
    changeKeyRef.current = null;
    stopKeyRef.current = null;
    setSelectedEntry(entry);
  };

  const drawSeries = interval => {
    if (!drawingDefinition || archived) return;
    addMutation.reset();
    changeMutation.reset();
    stopMutation.reset();
    addKeyRef.current = null;
    const clientId = createObjectTaskClientId("new-series");
    setSelectedEntry({
      ...interval,
      id: clientId,
      client_id: clientId,
      definition: drawingDefinition,
      definition_id: drawingDefinition.id,
      frequency: "once",
      repeat_until: null,
      draft: true,
      label: taskTypeLabel(drawingDefinition),
    });
  };

  return (
    <div className="flex min-h-[620px] flex-col bg-card/35 backdrop-blur-xl">
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

      <div className="flex flex-col gap-3 border-b border-border/70 bg-card/25 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Taken en weekrooster</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{activeDefinitions.length} {activeDefinitions.length === 1 ? "taak" : "taken"} voor dit object</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchTerm} onChange={event => onSearchChange(event.target.value)} placeholder="Zoek taak..." className="h-9 pl-9 pr-9" />
            {searchTerm && <button type="button" onClick={() => onSearchChange("")} aria-label="Zoekopdracht wissen" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-4 w-4" /></button>}
          </div>
          {!wizardOpen && <Button size="sm" onClick={onOpenCreate} disabled={archived}><Plus /> Taak toevoegen</Button>}
        </div>
      </div>

      {query.isLoading ? (
        <div className="flex min-h-[420px] items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Taken en rooster laden...</div>
      ) : query.isError ? (
        <div className="m-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1"><p className="font-medium">De taken konden niet worden geladen.</p><p className="mt-1 text-xs opacity-80">{query.error.message}</p></div>
          <Button size="sm" variant="outline" onClick={() => query.refetch()}><RefreshCw className="h-3.5 w-3.5" /> Opnieuw</Button>
        </div>
      ) : (
        <div className="flex-1">
          {openSourceChanges.length > 0 && (
            <div className="m-4 flex flex-col gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 sm:flex-row sm:items-center">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Planning moet worden bijgewerkt</p><p className="mt-0.5 text-xs text-muted-foreground">{openSourceChanges.length} {openSourceChanges.length === 1 ? "ingeplande dienst wijkt" : "ingeplande diensten wijken"} af van het actuele taakrooster.</p></div>
              <Button size="sm" variant="outline" onClick={() => navigate("/Planning")}>Open Planning</Button>
            </div>
          )}

          <div ref={boardRef} className="scroll-mt-4 p-4">
            {drawingDefinition && (
              <div className="mb-3 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/[0.07] p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Rooster aanvullen voor {taskTypeLabel(drawingDefinition)}</p><p className="mt-0.5 text-xs text-muted-foreground">Teken een nieuw toekomstig tijdvak en stel daarna de wekelijkse herhaling in. Bestaande reeksen blijven ongewijzigd.</p></div>
                <Button type="button" size="sm" variant="outline" onClick={() => setDrawingDefinition(null)}>Tekenmodus sluiten</Button>
              </div>
            )}
            <ObjectTaskWeekSchedule
              weekStart={selectedWeek}
              onWeekChange={setWeek}
              entries={ownWeekEntries}
              contextEntries={contextWeekEntries}
              allowDrawing={Boolean(drawingDefinition) && !archived}
              allowEntryEditing={!archived}
              executionMode={drawingDefinition?.execution_mode || "continuous"}
              durationMinutes={Number(drawingDefinition?.duration_minutes || 0)}
              serverClock={data.server_clock}
              onDraw={drawSeries}
              onEntryClick={openEntry}
            />
          </div>

          <section className="border-t border-border/70">
            <div className="border-b border-border/60 bg-card/20 px-4 py-3"><h3 className="text-sm font-semibold">Taakdefinities</h3><p className="mt-0.5 text-xs text-muted-foreground">Het rooster hierboven bevat de uitvoeringsmomenten uit deze taken.</p></div>
            {rows.length ? (
              <ObjectTaskTable
                rows={rows}
                series={data.series}
                sourceChanges={data.source_changes}
                addingDefinitionId={drawingDefinition?.id || null}
                disabled={archived}
                onAddSeries={setDrawingDefinition}
              />
            ) : (
              <div className="flex min-h-[240px] flex-col items-center justify-center px-4 text-center">
                <ClipboardList className="mb-3 h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-medium">{searchTerm ? "Geen taken gevonden" : "Nog geen taken"}</p>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">{searchTerm ? "Pas de zoekopdracht aan." : "Maak een taak vanuit een beveiligingsplan en teken de eerste uitvoeringsmomenten direct in de kalenderweek."}</p>
                {!searchTerm && !archived && !wizardOpen && <Button size="sm" className="mt-4" onClick={onOpenCreate}><Plus /> Eerste taak toevoegen</Button>}
              </div>
            )}
          </section>
        </div>
      )}

      <ObjectTaskSeriesDialog
        entry={selectedEntry}
        open={Boolean(selectedEntry)}
        fixedDuration={selectedEntry?.definition?.execution_mode === "time_window"
          ? Number(selectedEntry.definition.duration_minutes || 0)
          : null}
        pending={seriesPending}
        error={seriesError}
        serverClock={data.server_clock}
        onOpenChange={open => !open && !seriesPending && setSelectedEntry(null)}
        onSave={values => selectedEntry?.draft
          ? addMutation.mutate({ entry: selectedEntry, values })
          : changeMutation.mutate({ entry: selectedEntry, values })}
        onDelete={() => selectedEntry?.draft ? setSelectedEntry(null) : stopMutation.mutate(selectedEntry)}
      />
    </div>
  );
}
