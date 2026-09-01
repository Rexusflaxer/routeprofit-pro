import React from "react";
import { DragDropContext } from "@hello-pangea/dnd";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PlanningBoard from "@/components/planning/PlanningBoard";

const serviceDay = new Date(2026, 8, 1, 12);

function occurrence(overrides = {}) {
  return {
    id: "pending-occurrence-copy-delete",
    object_task_definition_id: "definition-shared-delete",
    object_task_schedule_series_id: "series-shared-delete",
    revision: 1,
    lifecycle_status: "active",
    service_date: "2026-09-01",
    end_date: "2026-09-01",
    window_start_time: "06:30",
    window_end_time: "18:00",
    required_minutes: 690,
    execution_mode: "continuous",
    task_name_snapshot: "Receptietaak",
    object_name_snapshot: "Object 1",
    customer_name_snapshot: "Klant 1",
    customer_id: "customer-1",
    object_id: "object-1",
    _optimistic_pending: true,
    ...overrides,
  };
}

function renderBoard(overrides = {}) {
  const props = {
    perspective: "object",
    editable: true,
    view: "week",
    days: [serviceDay],
    weeks: [[serviceDay]],
    shifts: [],
    assignments: [],
    segments: [],
    occurrences: [occurrence()],
    personnel: [],
    objects: [{ id: "object-1", name: "Object 1", status: "active" }],
    routes: [],
    customers: [{ id: "customer-1", name: "Klant 1" }],
    selectedShiftId: null,
    onSelectOccurrence: vi.fn(),
    onSelectShift: vi.fn(),
    onUnassign: vi.fn(),
    onMove: vi.fn(),
    onCopy: vi.fn(),
    onEditComposition: vi.fn(),
    onCancelComposition: vi.fn(),
    onCopyTask: vi.fn(),
    onEditTask: vi.fn(),
    onDeleteTask: vi.fn(),
    taskOccurrenceCount: 1,
    isLoading: false,
    ...overrides,
  };
  return {
    ...render(
      <DragDropContext onDragEnd={vi.fn()}>
        <PlanningBoard {...props} />
      </DragDropContext>,
    ),
    props,
  };
}

describe("Planning matrix snelle taakverwijdering", () => {
  it("laat een optimistische taakkopie verwijderen terwijl bewerken en kopiëren wachten", async () => {
    const copiedOccurrence = occurrence();
    const { container, props } = renderBoard({
      occurrences: [copiedOccurrence],
      queuedResourceKeys: new Set([
        `occurrence:${copiedOccurrence.id}`,
        `task-definition:${copiedOccurrence.object_task_definition_id}`,
        `task-series:${copiedOccurrence.object_task_schedule_series_id}`,
      ]),
      pendingResourceKeys: new Set(),
    });

    fireEvent.contextMenu(container.querySelector(`[data-task-occurrence-id="${copiedOccurrence.id}"]`));
    expect(await screen.findByRole("menuitem", { name: "Taak bewerken" }))
      .toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "Taak kopiëren" }))
      .toHaveAttribute("aria-disabled", "true");
    const deleteItem = screen.getByRole("menuitem", { name: "Taak verwijderen" });
    expect(deleteItem).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(deleteItem);
    expect(props.onDeleteTask).toHaveBeenCalledWith(copiedOccurrence);
  });

  it("houdt taakverwijdering geblokkeerd tijdens autoritatief herstel", async () => {
    const recoveringOccurrence = occurrence({ id: "occurrence-recovery-delete" });
    const { container, props } = renderBoard({
      occurrences: [recoveringOccurrence],
      pendingResourceKeys: new Set([`occurrence:${recoveringOccurrence.id}`]),
      queuedResourceKeys: new Set([`occurrence:${recoveringOccurrence.id}`]),
    });

    fireEvent.contextMenu(container.querySelector(`[data-task-occurrence-id="${recoveringOccurrence.id}"]`));
    const deleteItem = await screen.findByRole("menuitem", { name: "Taak verwijderen" });
    expect(deleteItem).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(deleteItem);
    expect(props.onDeleteTask).not.toHaveBeenCalled();
  });

  it("houdt taakverwijdering geblokkeerd tijdens conceptopslag of publicatie", async () => {
    const committingOccurrence = occurrence({ id: "occurrence-commit-delete" });
    const { container, props } = renderBoard({
      occurrences: [committingOccurrence],
      mutationPending: true,
      pendingResourceKeys: new Set(),
      queuedResourceKeys: new Set(),
    });

    fireEvent.contextMenu(container.querySelector(`[data-task-occurrence-id="${committingOccurrence.id}"]`));
    const deleteItem = await screen.findByRole("menuitem", { name: "Taak verwijderen" });
    expect(deleteItem).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(deleteItem);
    expect(props.onDeleteTask).not.toHaveBeenCalled();
  });

  it("laat een tweede occurrence uit dezelfde reeks via de echte taaklane verwijderen", async () => {
    const secondOccurrence = occurrence({
      id: "occurrence-series-second-delete",
      _optimistic_pending: false,
    });
    const shift = {
      id: "shift-series-second-delete",
      revision: 2,
      source_type: "task",
      status: "draft",
      service_date: secondOccurrence.service_date,
      start_time: "06:30",
      end_time: "18:00",
      required_count: 1,
      object_id: secondOccurrence.object_id,
      object_ids: [secondOccurrence.object_id],
    };
    const segment = {
      id: "segment-series-second-delete",
      revision: 2,
      shift_id: shift.id,
      task_occurrence_id: secondOccurrence.id,
      object_id: secondOccurrence.object_id,
      start_date: secondOccurrence.service_date,
      end_date: secondOccurrence.end_date,
      start_time: "06:30",
      end_time: "18:00",
      status: "draft",
    };
    const { container, props } = renderBoard({
      occurrences: [secondOccurrence],
      shifts: [shift],
      segments: [segment],
      queuedResourceKeys: new Set([
        "occurrence:occurrence-series-first-delete",
        `task-definition:${secondOccurrence.object_task_definition_id}`,
        `task-series:${secondOccurrence.object_task_schedule_series_id}`,
      ]),
      pendingResourceKeys: new Set(),
    });

    const taskLane = container.querySelector(`[data-task-coverage-group="${secondOccurrence.id}"]`);
    fireEvent.contextMenu(taskLane.querySelector("button"));
    const deleteItem = await screen.findByRole("menuitem", { name: "Taak verwijderen" });
    expect(deleteItem).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(deleteItem);
    expect(props.onDeleteTask).toHaveBeenCalledWith(secondOccurrence);
  });
});
