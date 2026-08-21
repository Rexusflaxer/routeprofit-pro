import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const workflow = vi.hoisted(() => ({
  addObjectTaskSeries: vi.fn(),
  changeObjectTaskSeries: vi.fn(),
  createObjectTask: vi.fn(),
  createObjectTaskMutationKey: vi.fn(action => `object-task:${action}:test-key`),
  listObjectTasks: vi.fn(),
  stopObjectTaskSeries: vi.fn(),
}));

const coverageEntities = vi.hoisted(() => ({
  occurrences: vi.fn(),
  segments: vi.fn(),
  shifts: vi.fn(),
}));

vi.mock("@/components/objects/objectTaskWorkflow", () => workflow);

vi.mock("@/components/objects/securityPlanWorkflow", () => ({
  listObjectSecurityPlans: vi.fn(),
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      PlanningTaskOccurrence: { filter: coverageEntities.occurrences },
      PlanningShiftTaskSegment: { filter: coverageEntities.segments },
      PlanningShift: { filter: coverageEntities.shifts },
    },
  },
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/objects/ObjectTaskTable", () => ({
  default: ({ rows, onOpenSchedule }) => (
    <div>
      {rows.map(row => (
        <button key={row.id} type="button" onClick={() => onOpenSchedule(row)}>
          Rooster wijzigen voor {row.task_type_label}
        </button>
      ))}
    </div>
  ),
}));

const persistedEntry = {
  id: "series-reception:2026-08-17",
  occurrence_date: "2026-08-17",
  start_time: "06:30",
  end_time: "18:00",
  end_day_offset: 0,
  frequency: "weekly",
  repeat_until: null,
  definition_id: "definition-reception",
  definition: { id: "definition-reception", version: 3, execution_mode: "continuous" },
  series_id: "series-reception",
  series_version: 2,
};

vi.mock("@/components/objects/ObjectTaskSchedule", () => ({
  default: ({ taskDefinitionId, planningCoverage, onPersistedCreate, onPersistedChange, onPersistedStop }) => {
    const [editorOpen, setEditorOpen] = React.useState(false);
    const [editorError, setEditorError] = React.useState(null);
    const [batchError, setBatchError] = React.useState(null);
    const changedValues = {
      start_time: "10:00",
      end_time: "18:00",
      frequency: "weekly",
      repeat_until: "2026-09-04",
    };
    const applyChange = async () => {
      setEditorError(null);
      try {
        await onPersistedChange(persistedEntry, changedValues);
        setEditorOpen(false);
      } catch (error) {
        setEditorError(error);
      }
    };
    const applyBatch = async () => {
      setBatchError(null);
      try {
        await onPersistedChange(persistedEntry, changedValues, {
          idempotencyKey: "draft-session:change:0",
        });
        await onPersistedStop(persistedEntry, {
          idempotencyKey: "draft-session:stop:1",
        });
        await onPersistedCreate({
          occurrence_date: "2026-08-18",
          start_time: "08:00",
          end_time: "16:00",
          frequency: "once",
          repeat_until: null,
        }, {
          idempotencyKey: "draft-session:create:2",
        });
      } catch (error) {
        setBatchError(error);
      }
    };
    return (
      <section aria-label="Oud taakrooster">
        <output aria-label="Gekozen taakdefinitie">{taskDefinitionId}</output>
        <output aria-label="Dekkingsregels">{planningCoverage.length}</output>
        <button
          type="button"
          onClick={() => onPersistedCreate({
            occurrence_date: "2026-08-18",
            start_time: "08:00",
            end_time: "16:00",
            frequency: "once",
            repeat_until: null,
          })}
        >
          Nieuw taakmoment opslaan
        </button>
        <button type="button" onClick={() => setEditorOpen(true)}>Bestaand taakmoment openen</button>
        {editorOpen && (
          <div role="dialog" aria-label="Tijd en herhaling wijzigen">
            {editorError && <p>{editorError.message}</p>}
            <button type="button" onClick={applyChange}>Wijziging toepassen</button>
          </div>
        )}
        <button type="button" onClick={() => onPersistedStop(persistedEntry)}>Taakmomenten stoppen</button>
        <button type="button" onClick={applyBatch}>Conceptbewerkingen opslaan</button>
        {batchError && <p>{batchError.message}</p>}
      </section>
    );
  },
}));

import ObjectTasksTab from "@/components/objects/ObjectTasksTab";

const object = {
  id: "object-saturn",
  customer_id: "customer-saturn",
  name: "Saturn Petcare",
  status: "active",
};

const definition = {
  id: "definition-reception",
  customer_id: object.customer_id,
  object_id: object.id,
  task_type: "reception",
  execution_mode: "continuous",
  duration_minutes: null,
  status: "active",
  version: 3,
};

function taskListSnapshot({
  objectRecord = object,
  taskDefinition = definition,
  seriesId = "series-reception",
  seriesVersion = 2,
} = {}) {
  return {
    object_id: objectRecord.id,
    customer_id: objectRecord.customer_id,
    definitions: [taskDefinition],
    series: [{
      id: seriesId,
      task_definition_id: taskDefinition.id,
      status: "active",
      version: seriesVersion,
      current_revision: {
        id: `revision-${seriesId}`,
        series_id: seriesId,
        revision_number: 1,
        effective_from: "2026-08-17",
        start_time: "06:30",
        end_time: "18:00",
        frequency: "weekly",
        weekday: 1,
      },
    }],
    revisions: [],
    source_changes: [],
    server_clock: {
      timezone: "Europe/Amsterdam",
      date: "2026-08-14",
      time: "14:36",
      iso: "2026-08-14T12:36:30.000Z",
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Huidige URL">{`${location.pathname}${location.search}`}</output>;
}

function renderTab(initialObject = object) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const tree = activeObject => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/ObjectDetail?id=object-saturn&tab=tasks&task_week=2026-08-17"]}>
        <ObjectTasksTab
          object={activeObject}
          view=""
          searchTerm=""
          onSearchChange={vi.fn()}
          onOpenCreate={vi.fn()}
          onCloseView={vi.fn()}
        />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const rendered = render(tree(initialObject));
  return {
    ...rendered,
    client,
    rerenderObject(nextObject) {
      rendered.rerender(tree(nextObject));
    },
  };
}

describe("ObjectTasksTab compacte roosterbediening", () => {
  beforeEach(() => {
    Object.values(workflow).forEach(mock => mock.mockReset());
    Object.values(coverageEntities).forEach(mock => {
      mock.mockReset();
      mock.mockResolvedValue([]);
    });
    workflow.createObjectTaskMutationKey.mockImplementation(action => `object-task:${action}:test-key`);
    workflow.listObjectTasks.mockResolvedValue(taskListSnapshot());
    workflow.addObjectTaskSeries.mockResolvedValue({ ok: true, source_changes: [] });
    workflow.changeObjectTaskSeries.mockResolvedValue({ ok: true, source_changes: [] });
    workflow.stopObjectTaskSeries.mockResolvedValue({ ok: true, source_changes: [] });
  });

  it("toont standaard alleen de oude compacte tabel en opent het rooster pas via de taak", async () => {
    renderTab();

    const openButton = await screen.findByRole("button", { name: "Rooster wijzigen voor Receptiedienst" });
    expect(screen.queryByRole("region", { name: "Oud taakrooster" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Huidige URL")).not.toHaveTextContent("task_definition");

    fireEvent.click(openButton);

    expect(await screen.findByRole("region", { name: "Oud taakrooster" })).toBeInTheDocument();
    expect(screen.getByLabelText("Gekozen taakdefinitie")).toHaveTextContent(definition.id);
  });

  it("laadt meer dan 500 dekkingsregels object-scoped en behoudt samengestelde multi-objectdiensten", async () => {
    coverageEntities.occurrences.mockResolvedValueOnce(Array.from({ length: 501 }, (_, index) => ({
      id: `occurrence-${index}`,
      object_id: object.id,
      service_date: "2026-08-17",
    })));
    coverageEntities.segments.mockResolvedValue([{
      id: "segment-coverage",
      shift_id: "shift-coverage",
      task_occurrence_id: "occurrence-0",
      start_date: "2026-08-17",
      end_date: "2026-08-17",
      start_time: "08:00",
      end_time: "10:00",
      status: "draft",
    }]);
    coverageEntities.shifts.mockResolvedValue([{
      id: "shift-coverage",
      status: "draft",
      object_id: null,
      object_ids: [object.id, "object-other"],
    }]);
    const { client } = renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Rooster wijzigen voor Receptiedienst" }));

    await waitFor(() => expect(screen.getByLabelText("Dekkingsregels")).toHaveTextContent("501"));
    expect(coverageEntities.occurrences).toHaveBeenCalledWith(
      {
        object_id: object.id,
        lifecycle_status: "active",
        service_date: { $gte: "2026-08-10", $lte: "2026-09-06" },
      },
      "-service_date",
      5000,
      0,
      ["id", "object_task_definition_id", "service_date", "lifecycle_status"],
    );
    expect(coverageEntities.segments).toHaveBeenCalledTimes(3);
    const occurrenceIds = coverageEntities.segments.mock.calls.flatMap(([filter]) => (
      filter.task_occurrence_id.$in
    ));
    expect(occurrenceIds).toHaveLength(501);
    expect(new Set(occurrenceIds).size).toBe(501);
    coverageEntities.segments.mock.calls.forEach(([filter, sort, limit, skip, fields]) => {
      expect(filter).toEqual(expect.objectContaining({
        object_id: object.id,
        status: { $ne: "removed" },
        task_occurrence_id: { $in: expect.any(Array) },
      }));
      expect(filter.task_occurrence_id.$in.length).toBeLessThanOrEqual(200);
      expect([sort, limit, skip, fields]).toEqual([
        "-start_date",
        5000,
        0,
        ["id", "shift_id", "task_occurrence_id", "start_date", "end_date", "start_time", "end_time", "status"],
      ]);
    });
    expect(coverageEntities.shifts).toHaveBeenCalledWith(
      {
        status: { $ne: "cancelled" },
        id: { $in: ["shift-coverage"] },
      },
      "-service_date",
      5000,
      0,
      ["id", "status"],
    );
    expect(client.getQueryData([
      "object-card",
      object.id,
      "task-coverage",
      "2026-08-10",
      "2026-09-06",
    ])).toHaveLength(501);
  });

  it("wijzigt tijd en herhaling van een bestaand moment veilig vanaf die occurrence", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Rooster wijzigen voor Receptiedienst" }));
    fireEvent.click(await screen.findByRole("button", { name: "Bestaand taakmoment openen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Wijziging toepassen" }));

    await waitFor(() => expect(workflow.changeObjectTaskSeries).toHaveBeenCalledTimes(1));
    expect(workflow.changeObjectTaskSeries).toHaveBeenCalledWith({
      customerId: object.customer_id,
      objectId: object.id,
      entry: expect.objectContaining({
        ...persistedEntry,
        definition: expect.objectContaining({ id: definition.id, version: 3 }),
        series: expect.objectContaining({ id: "series-reception", version: 2 }),
        series_version: 2,
      }),
      data: {
        start_time: "10:00",
        end_time: "18:00",
        frequency: "weekly",
        repeat_until: "2026-09-04",
      },
      idempotencyKey: "object-task:change-series:test-key",
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Tijd en herhaling wijzigen" })).not.toBeInTheDocument());
  });

  it.each([
    [409, "De taakreeks is intussen gewijzigd"],
    [503, "De planningsservice is tijdelijk niet beschikbaar"],
  ])("houdt de tijd- en herhalingspopup open bij backendfout %s", async (status, message) => {
    workflow.changeObjectTaskSeries.mockRejectedValueOnce(Object.assign(new Error(message), { status }));
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Rooster wijzigen voor Receptiedienst" }));
    fireEvent.click(await screen.findByRole("button", { name: "Bestaand taakmoment openen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Wijziging toepassen" }));

    expect(await screen.findByRole("dialog", { name: "Tijd en herhaling wijzigen" })).toBeInTheDocument();
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(workflow.changeObjectTaskSeries).toHaveBeenCalledTimes(1);
  });

  it("vraagt expliciete bevestiging en hervat dezelfde taakwijziging met dienstverwijdering", async () => {
    workflow.changeObjectTaskSeries
      .mockRejectedValueOnce(Object.assign(new Error("Bevestig dat de dienst mag worden verwijderd"), {
        status: 409,
        details: {
          code: "TASK_SHIFT_REMOVAL_CONFIRMATION_REQUIRED",
          shifts: [{
            id: "shift-evening",
            name: "Avonddienst",
            service_date: "2026-08-17",
            start_time: "18:00",
            end_time: "22:00",
          }],
        },
      }))
      .mockResolvedValueOnce({ ok: true, source_changes: [] });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Rooster wijzigen voor Receptiedienst" }));
    fireEvent.click(screen.getByRole("button", { name: "Bestaand taakmoment openen" }));
    fireEvent.click(screen.getByRole("button", { name: "Wijziging toepassen" }));

    expect(await screen.findByRole("alertdialog", { name: "Gekoppelde diensten verwijderen?" })).toBeInTheDocument();
    expect(screen.getByText(/2026-08-17 · 18:00–22:00 · Avonddienst/)).toBeInTheDocument();
    expect(workflow.changeObjectTaskSeries.mock.calls[0][0]).not.toHaveProperty("confirmRemoveOutsideShifts");

    fireEvent.click(screen.getByRole("button", { name: "Diensten verwijderen en taak wijzigen" }));

    await waitFor(() => expect(workflow.changeObjectTaskSeries).toHaveBeenCalledTimes(2));
    expect(workflow.changeObjectTaskSeries.mock.calls[1][0]).toEqual(expect.objectContaining({
      idempotencyKey: "object-task:change-series:test-key",
      confirmRemoveOutsideShifts: true,
      entry: expect.objectContaining({ series_version: 2 }),
    }));
    await waitFor(() => expect(screen.queryByRole("alertdialog", { name: "Gekoppelde diensten verwijderen?" })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Tijd en herhaling wijzigen" })).not.toBeInTheDocument());
  });

  it("hergebruikt bij conceptretry de custom sleutels en eerste CAS-snapshots exact", async () => {
    const authoritativeChange = {
      ok: true,
      definition: { ...definition, version: 4 },
      series: {
        id: "series-reception",
        object_task_definition_id: definition.id,
        status: "active",
        version: 3,
        current_revision_id: "revision-reception-2",
      },
      current_revision: {
        id: "revision-reception-2",
        series_id: "series-reception",
        revision_number: 2,
        effective_from: "2026-08-17",
        start_time: "10:00",
        end_time: "18:00",
        recurrence_type: "weekly",
      },
      source_changes: [],
    };
    workflow.changeObjectTaskSeries.mockResolvedValue(authoritativeChange);
    workflow.stopObjectTaskSeries
      .mockRejectedValueOnce(new Error("Tijdelijke stopfout"))
      .mockResolvedValueOnce({ ok: true, source_changes: [] });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Rooster wijzigen voor Receptiedienst" }));

    fireEvent.click(screen.getByRole("button", { name: "Conceptbewerkingen opslaan" }));
    expect(await screen.findByText("Tijdelijke stopfout")).toBeInTheDocument();
    expect(workflow.changeObjectTaskSeries).toHaveBeenCalledTimes(1);
    expect(workflow.stopObjectTaskSeries).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Conceptbewerkingen opslaan" }));
    await waitFor(() => expect(workflow.addObjectTaskSeries).toHaveBeenCalledTimes(1));

    expect(workflow.changeObjectTaskSeries).toHaveBeenCalledTimes(2);
    workflow.changeObjectTaskSeries.mock.calls.forEach(([request]) => {
      expect(request).toEqual(expect.objectContaining({
        idempotencyKey: "draft-session:change:0",
        entry: expect.objectContaining({
          series_version: 2,
          series: expect.objectContaining({ version: 2 }),
        }),
      }));
    });
    expect(workflow.stopObjectTaskSeries).toHaveBeenCalledTimes(2);
    workflow.stopObjectTaskSeries.mock.calls.forEach(([request]) => {
      expect(request).toEqual(expect.objectContaining({
        idempotencyKey: "draft-session:stop:1",
        entry: expect.objectContaining({
          series_version: 3,
          series: expect.objectContaining({ version: 3 }),
        }),
      }));
    });
    expect(workflow.addObjectTaskSeries).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "draft-session:create:2",
      entry: expect.objectContaining({
        definition: expect.objectContaining({ version: 4 }),
      }),
    }));
  });

  it("replayt een eerder bevestigde batchwijziging met exact dezelfde bevestigde payload", async () => {
    const confirmationError = Object.assign(new Error("Bevestig dat de dienst mag worden verwijderd"), {
      status: 409,
      details: {
        code: "TASK_SHIFT_REMOVAL_CONFIRMATION_REQUIRED",
        shifts: [{
          id: "shift-evening",
          name: "Avonddienst",
          service_date: "2026-08-17",
          start_time: "18:00",
          end_time: "22:00",
        }],
      },
    });
    workflow.changeObjectTaskSeries
      .mockRejectedValueOnce(confirmationError)
      .mockResolvedValueOnce({ ok: true, source_changes: [] })
      .mockResolvedValueOnce({ ok: true, source_changes: [] });
    workflow.stopObjectTaskSeries
      .mockRejectedValueOnce(new Error("Tijdelijke latere batchfout"))
      .mockResolvedValueOnce({ ok: true, source_changes: [] });
    workflow.addObjectTaskSeries.mockResolvedValue({ ok: true, source_changes: [] });

    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Rooster wijzigen voor Receptiedienst" }));
    fireEvent.click(screen.getByRole("button", { name: "Conceptbewerkingen opslaan" }));

    expect(await screen.findByRole("alertdialog", { name: "Gekoppelde diensten verwijderen?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Diensten verwijderen en taak wijzigen" }));

    expect(await screen.findByText("Tijdelijke latere batchfout")).toBeInTheDocument();
    expect(workflow.changeObjectTaskSeries).toHaveBeenCalledTimes(2);
    expect(workflow.changeObjectTaskSeries.mock.calls[1][0]).toEqual(expect.objectContaining({
      idempotencyKey: "draft-session:change:0",
      confirmRemoveOutsideShifts: true,
    }));

    fireEvent.click(screen.getByRole("button", { name: "Conceptbewerkingen opslaan" }));
    await waitFor(() => expect(workflow.addObjectTaskSeries).toHaveBeenCalledTimes(1));

    expect(workflow.changeObjectTaskSeries).toHaveBeenCalledTimes(3);
    expect(workflow.changeObjectTaskSeries.mock.calls[2][0])
      .toEqual(workflow.changeObjectTaskSeries.mock.calls[1][0]);
    expect(workflow.stopObjectTaskSeries).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alertdialog", { name: "Gekoppelde diensten verwijderen?" }))
      .not.toBeInTheDocument();
  });

  it("voegt nieuwe momenten toe en stopt reeksen via de veilige acties", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Rooster wijzigen voor Receptiedienst" }));

    fireEvent.click(await screen.findByRole("button", { name: "Nieuw taakmoment opslaan" }));
    await waitFor(() => expect(workflow.addObjectTaskSeries).toHaveBeenCalledTimes(1));
    expect(workflow.addObjectTaskSeries).toHaveBeenCalledWith(expect.objectContaining({
      customerId: object.customer_id,
      objectId: object.id,
      entry: expect.objectContaining({
        definition_id: definition.id,
        occurrence_date: "2026-08-18",
      }),
      idempotencyKey: "object-task:add-series:test-key",
    }));

    fireEvent.click(screen.getByRole("button", { name: "Taakmomenten stoppen" }));
    await waitFor(() => expect(workflow.stopObjectTaskSeries).toHaveBeenCalledTimes(1));
    expect(workflow.stopObjectTaskSeries).toHaveBeenCalledWith({
      customerId: object.customer_id,
      objectId: object.id,
      entry: expect.objectContaining({
        ...persistedEntry,
        definition: expect.objectContaining({ id: definition.id, version: 3 }),
        series: expect.objectContaining({ id: "series-reception", version: 2 }),
        series_version: 2,
      }),
      idempotencyKey: "object-task:stop-series:test-key",
    });
  });

  it("gebruikt de autoritatieve mutatieversie direct voor de volgende actie zonder geforceerde lijstread", async () => {
    workflow.changeObjectTaskSeries.mockResolvedValueOnce({
      ok: true,
      definition: { ...definition, version: 4 },
      series: {
        id: "series-reception",
        object_task_definition_id: definition.id,
        status: "active",
        version: 3,
      },
      current_revision: {
        id: "revision-reception-2",
        series_id: "series-reception",
        revision_number: 2,
        effective_from: "2026-08-17",
        start_time: "10:00",
        end_time: "18:00",
        recurrence_type: "weekly",
      },
      source_changes: [],
    });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Rooster wijzigen voor Receptiedienst" }));
    fireEvent.click(screen.getByRole("button", { name: "Bestaand taakmoment openen" }));
    fireEvent.click(screen.getByRole("button", { name: "Wijziging toepassen" }));
    await waitFor(() => expect(workflow.changeObjectTaskSeries).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Tijd en herhaling wijzigen" })).not.toBeInTheDocument());

    expect(workflow.listObjectTasks).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Taakmomenten stoppen" }));

    await waitFor(() => expect(workflow.stopObjectTaskSeries).toHaveBeenCalledTimes(1));
    expect(workflow.stopObjectTaskSeries.mock.calls[0][0].entry).toEqual(expect.objectContaining({
      series_version: 3,
      definition: expect.objectContaining({ version: 4 }),
      series: expect.objectContaining({ id: "series-reception", version: 3 }),
    }));
    expect(workflow.listObjectTasks).toHaveBeenCalledTimes(1);
  });

  it("laat een vóór de mutatie gestarte late lijstresponse de nieuwe versies niet terugzetten", async () => {
    const staleListResponse = taskListSnapshot();
    const lateList = deferred();
    workflow.listObjectTasks
      .mockResolvedValueOnce(staleListResponse)
      .mockImplementationOnce(() => lateList.promise)
      .mockResolvedValue(staleListResponse);
    workflow.changeObjectTaskSeries.mockResolvedValueOnce({
      ok: true,
      definition: { ...definition, version: 4 },
      series: {
        id: "series-reception",
        object_task_definition_id: definition.id,
        status: "active",
        version: 3,
      },
      current_revision: {
        id: "revision-reception-2",
        series_id: "series-reception",
        revision_number: 2,
        effective_from: "2026-08-17",
        start_time: "10:00",
        end_time: "18:00",
        recurrence_type: "weekly",
      },
      source_changes: [],
    });
    const rendered = renderTab();
    const taskQueryKey = ["object-card", object.id, "tasks"];

    fireEvent.click(await screen.findByRole("button", { name: "Rooster wijzigen voor Receptiedienst" }));
    const lateRefresh = rendered.client.refetchQueries({ queryKey: taskQueryKey });
    await waitFor(() => expect(workflow.listObjectTasks).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "Bestaand taakmoment openen" }));
    fireEvent.click(screen.getByRole("button", { name: "Wijziging toepassen" }));
    await waitFor(() => expect(workflow.changeObjectTaskSeries).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(rendered.client.getQueryData(taskQueryKey)).toEqual(expect.objectContaining({
      definitions: [expect.objectContaining({ id: definition.id, version: 4 })],
      series: [expect.objectContaining({ id: "series-reception", version: 3 })],
    })));

    await act(async () => {
      lateList.resolve(staleListResponse);
      await lateRefresh;
    });

    expect(rendered.client.getQueryData(taskQueryKey)).toEqual(expect.objectContaining({
      definitions: [expect.objectContaining({ id: definition.id, version: 4 })],
      series: [expect.objectContaining({ id: "series-reception", version: 3 })],
    }));
  });

  it("neemt bij een objectwissel in dezelfde componentinstantie geen taken van het vorige object mee", async () => {
    const nextObject = {
      id: "object-jupiter",
      customer_id: "customer-jupiter",
      name: "Jupiter Logistics",
      status: "active",
    };
    const nextDefinition = {
      ...definition,
      id: "definition-closing-round",
      customer_id: nextObject.customer_id,
      object_id: nextObject.id,
      task_type: "fire_closing_round",
      execution_mode: "time_window",
      duration_minutes: 25,
      version: 1,
    };
    workflow.listObjectTasks.mockImplementation(({ objectId }) => Promise.resolve(
      objectId === nextObject.id
        ? taskListSnapshot({
            objectRecord: nextObject,
            taskDefinition: nextDefinition,
            seriesId: "series-closing-round",
            seriesVersion: 1,
          })
        : taskListSnapshot(),
    ));
    const rendered = renderTab();

    expect(await screen.findByRole("button", { name: "Rooster wijzigen voor Receptiedienst" })).toBeInTheDocument();
    rendered.rerenderObject(nextObject);

    expect(await screen.findByRole("button", { name: "Rooster wijzigen voor Brand- & sluitronde" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rooster wijzigen voor Receptiedienst" })).not.toBeInTheDocument();
    expect(rendered.client.getQueryData(["object-card", nextObject.id, "tasks"])).toEqual(expect.objectContaining({
      object_id: nextObject.id,
      definitions: [expect.objectContaining({ id: nextDefinition.id, object_id: nextObject.id })],
      series: [expect.objectContaining({ id: "series-closing-round" })],
    }));
  });

  it("herhaalt een mislukte takenlijst niet bij een backendfout 400", async () => {
    workflow.listObjectTasks.mockRejectedValueOnce(Object.assign(new Error("De planningbackend is nog niet gepubliceerd."), {
      status: 400,
    }));

    renderTab();

    expect(await screen.findByText("De taken konden niet worden geladen.")).toBeInTheDocument();
    expect(screen.getByText("De planningbackend is nog niet gepubliceerd.")).toBeInTheDocument();
    expect(workflow.listObjectTasks).toHaveBeenCalledTimes(1);
  });
});
