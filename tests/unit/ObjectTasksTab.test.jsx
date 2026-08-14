import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@/components/objects/objectTaskWorkflow", () => workflow);

vi.mock("@/components/objects/securityPlanWorkflow", () => ({
  listObjectSecurityPlans: vi.fn(),
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
  default: ({ taskDefinitionId, onPersistedCreate, onPersistedChange, onPersistedStop }) => {
    const [editorOpen, setEditorOpen] = React.useState(false);
    const [editorError, setEditorError] = React.useState(null);
    const applyChange = async () => {
      setEditorError(null);
      try {
        await onPersistedChange(persistedEntry, {
          start_time: "10:00",
          end_time: "18:00",
          frequency: "weekly",
          repeat_until: "2026-09-04",
        });
        setEditorOpen(false);
      } catch (error) {
        setEditorError(error);
      }
    };
    return (
      <section aria-label="Oud taakrooster">
        <output aria-label="Gekozen taakdefinitie">{taskDefinitionId}</output>
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

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Huidige URL">{`${location.pathname}${location.search}`}</output>;
}

function renderTab() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/ObjectDetail?id=object-saturn&tab=tasks&task_week=2026-08-17"]}>
        <ObjectTasksTab
          object={object}
          view=""
          searchTerm=""
          onSearchChange={vi.fn()}
          onOpenCreate={vi.fn()}
          onCloseView={vi.fn()}
        />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ObjectTasksTab compacte roosterbediening", () => {
  beforeEach(() => {
    Object.values(workflow).forEach(mock => mock.mockReset());
    workflow.createObjectTaskMutationKey.mockImplementation(action => `object-task:${action}:test-key`);
    workflow.listObjectTasks.mockResolvedValue({
      definitions: [definition],
      series: [{
        id: "series-reception",
        task_definition_id: definition.id,
        status: "active",
        version: 2,
        current_revision: {
          id: "revision-reception",
          series_id: "series-reception",
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
    });
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

  it("wijzigt tijd en herhaling van een bestaand moment veilig vanaf die occurrence", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Rooster wijzigen voor Receptiedienst" }));
    fireEvent.click(await screen.findByRole("button", { name: "Bestaand taakmoment openen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Wijziging toepassen" }));

    await waitFor(() => expect(workflow.changeObjectTaskSeries).toHaveBeenCalledTimes(1));
    expect(workflow.changeObjectTaskSeries).toHaveBeenCalledWith({
      customerId: object.customer_id,
      objectId: object.id,
      entry: persistedEntry,
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
      entry: persistedEntry,
      idempotencyKey: "object-task:stop-series:test-key",
    });
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
