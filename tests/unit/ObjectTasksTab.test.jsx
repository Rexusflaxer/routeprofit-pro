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
  default: ({ rows, onAddSeries }) => (
    <div>
      {rows.map(row => (
        <button key={row.id} type="button" onClick={() => onAddSeries(row)}>
          Rooster aanvullen voor {row.task_type_label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("@/components/objects/ObjectTaskWeekSchedule", () => ({
  default: ({ allowDrawing, onDraw }) => (
    <section aria-label="Taakrooster testweergave">
      <output aria-label="Tekenmodus">{allowDrawing ? "actief" : "inactief"}</output>
      {allowDrawing && (
        <button
          type="button"
          onClick={() => onDraw({
            occurrence_date: "2026-08-21",
            start_time: "10:00",
            end_time: "18:00",
            end_day_offset: 0,
          })}
        >
          Teken tijdvak
        </button>
      )}
    </section>
  ),
}));

vi.mock("@/components/objects/ObjectTaskSeriesDialog", () => ({
  default: ({ entry, open, onSave }) => open ? (
    <div role="dialog" aria-label="Roosterreeks instellen">
      <output aria-label="Gekozen taakdefinitie">{entry.definition_id}</output>
      <button
        type="button"
        onClick={() => onSave({
          start_time: "10:00",
          end_time: "18:00",
          frequency: "weekly",
          repeat_until: "2026-09-04",
        })}
      >
        Reeks opslaan
      </button>
    </div>
  ) : null,
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

describe("ObjectTasksTab tekenmodus", () => {
  beforeEach(() => {
    Object.values(workflow).forEach(mock => mock.mockReset());
    workflow.createObjectTaskMutationKey.mockImplementation(action => `object-task:${action}:test-key`);
    workflow.listObjectTasks.mockResolvedValue({
      definitions: [definition],
      series: [],
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
  });

  it("kiest een definitie via de URL, tekent een tijdvak en bewaart een nieuwe wekelijkse reeks", async () => {
    renderTab();

    fireEvent.click(await screen.findByRole("button", { name: "Rooster aanvullen voor Receptiedienst" }));

    expect(await screen.findByRole("button", { name: "Tekenmodus sluiten" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tekenmodus")).toHaveTextContent("actief");
    expect(screen.getByLabelText("Huidige URL")).toHaveTextContent("task_definition=definition-reception");

    fireEvent.click(screen.getByRole("button", { name: "Teken tijdvak" }));
    expect(await screen.findByRole("dialog", { name: "Roosterreeks instellen" })).toBeInTheDocument();
    expect(screen.getByLabelText("Gekozen taakdefinitie")).toHaveTextContent(definition.id);

    fireEvent.click(screen.getByRole("button", { name: "Reeks opslaan" }));

    await waitFor(() => expect(workflow.addObjectTaskSeries).toHaveBeenCalledTimes(1));
    expect(workflow.addObjectTaskSeries).toHaveBeenCalledWith({
      customerId: object.customer_id,
      objectId: object.id,
      entry: expect.objectContaining({
        definition_id: definition.id,
        definition: expect.objectContaining({ id: definition.id, version: 3 }),
        occurrence_date: "2026-08-21",
        start_time: "10:00",
        end_time: "18:00",
        draft: true,
      }),
      data: {
        start_time: "10:00",
        end_time: "18:00",
        frequency: "weekly",
        repeat_until: "2026-09-04",
      },
      idempotencyKey: "object-task:add-series:test-key",
    });
  });
});
