import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ObjectTaskSchedule from "@/components/objects/ObjectTaskSchedule";

const SERVER_CLOCK = {
  timezone: "Europe/Amsterdam",
  date: "2026-08-14",
  time: "14:36",
  iso: "2026-08-14T12:36:30.000Z",
};

const contextData = {
  definitions: [{
    id: "definition-reception",
    status: "active",
    task_type: "reception",
    execution_mode: "continuous",
  }],
  series: [{
    id: "series-reception",
    status: "active",
    version: 1,
    task_definition_id: "definition-reception",
    current_revision_id: "revision-reception-1",
  }],
  revisions: [{
    id: "revision-reception-1",
    series_id: "series-reception",
    revision_number: 1,
    operation: "schedule",
    effective_from: "2026-08-19",
    recurrence_anchor_date: "2026-08-19",
    recurrence_type: "weekly",
    weekday: 3,
    start_time: "06:30",
    end_time: "12:00",
  }],
  exceptions: [],
  source_changes: [],
};

const mondayContextData = {
  ...contextData,
  series: [{
    ...contextData.series[0],
    current_revision_id: "revision-monday-1",
  }],
  revisions: [{
    ...contextData.revisions[0],
    id: "revision-monday-1",
    effective_from: "2026-08-17",
    recurrence_anchor_date: "2026-08-17",
    weekday: 1,
    start_time: "06:00",
    end_time: "18:00",
  }],
};

function taskBlocks(container) {
  return Array.from(container.querySelectorAll("[style]")).filter(element => (
    element.classList.contains("border-primary/40")
    && element.classList.contains("bg-primary/25")
  ));
}

function slotOn(dateLabel, accessibleName) {
  const row = rowFor(dateLabel);
  return within(row).getByRole("button", { name: accessibleName });
}

function rowFor(dateLabel) {
  return screen.getByText(dateLabel).parentElement.parentElement;
}

function taskBlocksInRow(dateLabel) {
  return taskBlocks(rowFor(dateLabel));
}

async function clickSave() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

function mockScheduleGeometry() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SERVER_CLOCK.iso));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    right: 1440,
    top: 0,
    bottom: 48,
    width: 1440,
    height: 48,
    x: 0,
    y: 0,
    toJSON: () => {},
  });
}

function eraseSlot(dateLabel, accessibleName) {
  const slot = slotOn(dateLabel, accessibleName);
  fireEvent.pointerDown(slot);
  fireEvent.pointerUp(slot);
  fireEvent.pointerUp(window);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ObjectTaskSchedule herstartveilige conceptbatch", () => {
  it("bewaart de hele batch en hergebruikt per operatie dezelfde idempotency key na een gedeeltelijke fout", async () => {
    mockScheduleGeometry();

    const secondOperationError = new Error("De tweede taakmutatie kon niet worden opgeslagen.");
    const onPersistedChange = vi.fn().mockResolvedValue({ ok: true });
    const onPersistedCreate = vi.fn()
      .mockRejectedValueOnce(secondOperationError)
      .mockResolvedValueOnce({ ok: true });
    const onPersistedStop = vi.fn().mockResolvedValue({ ok: true });
    const onSaved = vi.fn();

    const { container } = render(
      <ObjectTaskSchedule
        contextData={contextData}
        taskDefinitionId="definition-reception"
        executionMode="continuous"
        weekStart="2026-08-17"
        serverClock={SERVER_CLOCK}
        onPersistedCreate={onPersistedCreate}
        onPersistedChange={onPersistedChange}
        onPersistedStop={onPersistedStop}
        onSaved={onSaved}
      />,
    );

    const initialBlockCount = taskBlocks(container).length;
    expect(initialBlockCount).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Wissen" }));
    const persistedBoundary = slotOn("19 aug", "Woensdag 06:30");
    fireEvent.pointerDown(persistedBoundary);
    fireEvent.pointerUp(persistedBoundary);
    fireEvent.pointerUp(window);

    fireEvent.click(screen.getByRole("button", { name: "Taak uitvoeren" }));
    const newDraftSlot = slotOn("18 aug", "Dinsdag 13:00");
    fireEvent.pointerDown(newDraftSlot);
    fireEvent.pointerUp(newDraftSlot);
    fireEvent.pointerUp(window);

    expect(taskBlocks(container)).toHaveLength(initialBlockCount + 1);
    expect(taskBlocksInRow("19 aug")[0]).toHaveStyle({ left: `${(7 / 24) * 100}%` });
    expect(screen.getByRole("button", { name: "Opslaan" })).toBeEnabled();

    await clickSave();

    expect(screen.getByRole("alert")).toHaveTextContent(secondOperationError.message);
    expect(taskBlocks(container)).toHaveLength(initialBlockCount + 1);
    expect(taskBlocksInRow("19 aug")[0]).toHaveStyle({ left: `${(7 / 24) * 100}%` });
    expect(screen.getByRole("button", { name: "Opslaan" })).toBeEnabled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onPersistedChange).toHaveBeenCalledTimes(1);
    expect(onPersistedCreate).toHaveBeenCalledTimes(1);
    expect(onPersistedStop).not.toHaveBeenCalled();

    const firstChangeKey = onPersistedChange.mock.calls[0][2].idempotencyKey;
    const firstCreateKey = onPersistedCreate.mock.calls[0][1].idempotencyKey;
    expect(firstChangeKey).toMatch(/^object-task:draft:.+:change:0$/);
    expect(firstCreateKey).toMatch(/^object-task:draft:.+:create:1$/);

    await clickSave();

    expect(onPersistedChange).toHaveBeenCalledTimes(2);
    expect(onPersistedCreate).toHaveBeenCalledTimes(2);
    expect(onPersistedChange.mock.calls[1][2].idempotencyKey).toBe(firstChangeKey);
    expect(onPersistedCreate.mock.calls[1][1].idempotencyKey).toBe(firstCreateKey);
    expect(onPersistedChange.mock.calls[1][1]).toEqual(onPersistedChange.mock.calls[0][1]);
    expect(onPersistedCreate.mock.calls[1][0]).toEqual(onPersistedCreate.mock.calls[0][0]);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opslaan" })).toBeDisabled();
    expect(taskBlocks(container)).toHaveLength(initialBlockCount);
    expect(taskBlocksInRow("19 aug")[0]).toHaveStyle({ left: `${(6.5 / 24) * 100}%` });
  });

  it("slaat meerdere conceptwijzigingen van dezelfde reeks chronologisch op", async () => {
    mockScheduleGeometry();
    const onPersistedChange = vi.fn().mockResolvedValue({ ok: true });
    const onPersistedCreate = vi.fn().mockResolvedValue({ ok: true });

    render(
      <ObjectTaskSchedule
        contextData={mondayContextData}
        taskDefinitionId="definition-reception"
        executionMode="continuous"
        weekStart="2026-08-17"
        serverClock={SERVER_CLOCK}
        onPersistedCreate={onPersistedCreate}
        onPersistedChange={onPersistedChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Wissen" }));
    eraseSlot("31 aug", "Maandag 17:30");
    eraseSlot("24 aug", "Maandag 17:30");
    eraseSlot("24 aug", "Maandag 17:00");

    await clickSave();

    expect(onPersistedCreate).not.toHaveBeenCalled();
    expect(onPersistedChange).toHaveBeenCalledTimes(2);
    expect(onPersistedChange.mock.calls.map(([entry, values, options]) => ({
      date: entry.occurrence_date,
      end: values.end_time,
      key: options.idempotencyKey,
    }))).toEqual([
      {
        date: "2026-08-24",
        end: "17:00",
        key: expect.stringMatching(/:change:0$/),
      },
      {
        date: "2026-08-31",
        end: "17:30",
        key: expect.stringMatching(/:change:1$/),
      },
    ]);
  });

  it("bouwt een latere datum voort op de al zichtbare eerdere conceptwijziging", async () => {
    mockScheduleGeometry();
    const onPersistedChange = vi.fn().mockResolvedValue({ ok: true });
    const onPersistedCreate = vi.fn().mockResolvedValue({ ok: true });

    render(
      <ObjectTaskSchedule
        contextData={mondayContextData}
        taskDefinitionId="definition-reception"
        executionMode="continuous"
        weekStart="2026-08-17"
        serverClock={SERVER_CLOCK}
        onPersistedCreate={onPersistedCreate}
        onPersistedChange={onPersistedChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Wissen" }));
    eraseSlot("24 aug", "Maandag 17:30");
    eraseSlot("24 aug", "Maandag 17:00");
    expect(taskBlocksInRow("31 aug")[0]).toHaveStyle({ width: `${(11 / 24) * 100}%` });

    eraseSlot("31 aug", "Maandag 16:30");
    await clickSave();

    expect(onPersistedCreate).not.toHaveBeenCalled();
    expect(onPersistedChange.mock.calls.map(([entry, values]) => ({
      date: entry.occurrence_date,
      end: values.end_time,
    }))).toEqual([
      { date: "2026-08-24", end: "17:00" },
      { date: "2026-08-31", end: "16:30" },
    ]);
  });
});
