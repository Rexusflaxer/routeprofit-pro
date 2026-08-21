import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ObjectTaskSchedule, {
  PLANNING_ALTERNATIVE_SPLIT_ERROR,
  planningAlternativeSplitError,
} from "@/components/objects/ObjectTaskSchedule";

const SERVER_CLOCK = {
  timezone: "Europe/Amsterdam",
  date: "2026-08-14",
  time: "14:36",
  iso: "2026-08-14T12:36:30.000Z",
};

const alternativeEntry = {
  id: "series-alternative:2026-08-19",
  series_id: "series-alternative",
  occurrence_date: "2026-08-19",
  start_time: "08:00",
  end_time: "12:00",
  frequency: "once",
  recurrence_type: "once",
  alternative: true,
};

const contextData = {
  definitions: [{
    id: "definition-reception",
    status: "active",
    task_type: "reception",
    execution_mode: "continuous",
  }],
  series: [{
    id: "series-alternative",
    status: "active",
    version: 2,
    task_definition_id: "definition-reception",
    current_revision_id: "revision-alternative",
    metadata: { schedule_kind: "alternative", alternative: true },
  }],
  revisions: [{
    id: "revision-alternative",
    series_id: "series-alternative",
    revision_number: 1,
    operation: "schedule",
    effective_from: "2026-08-19",
    recurrence_anchor_date: "2026-08-19",
    recurrence_type: "one_time",
    start_time: "08:00",
    end_time: "12:00",
    recurrence_end_date: "2026-08-19",
  }],
  exceptions: [{
    id: "exception-alternative",
    source_series_id: "series-source",
    alternative_series_id: "series-alternative",
    alternative_revision_id: "revision-alternative",
    service_date: "2026-08-19",
    kind: "alternative",
    status: "active",
  }],
  source_changes: [],
};

function staged(ranges) {
  return [{
    key: "series-alternative:2026-08-19",
    original: alternativeEntry,
    ranges,
    additions: [],
  }];
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ObjectTaskSchedule guard voor losse taakafwijkingen", () => {
  it("weigert twee losse restblokken maar staat inkorten en volledig verwijderen toe", () => {
    expect(planningAlternativeSplitError(staged([{ start: 9 * 60, end: 10 * 60 }]), []))
      .toMatchObject({ message: PLANNING_ALTERNATIVE_SPLIT_ERROR });
    expect(planningAlternativeSplitError(staged([{ start: 8 * 60, end: 9 * 60 }]), []))
      .toBeNull();
    expect(planningAlternativeSplitError(staged([{ start: 8 * 60, end: 12 * 60 }]), []))
      .toBeNull();
  });

  it("stopt vóór alle callbacks wanneer de gebruiker een alternatief in tweeën wist", async () => {
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
    const onPersistedCreate = vi.fn().mockResolvedValue({ ok: true });
    const onPersistedChange = vi.fn().mockResolvedValue({ ok: true });
    const onPersistedStop = vi.fn().mockResolvedValue({ ok: true });

    render(
      <ObjectTaskSchedule
        contextData={contextData}
        taskDefinitionId="definition-reception"
        executionMode="continuous"
        weekStart="2026-08-17"
        serverClock={SERVER_CLOCK}
        onPersistedCreate={onPersistedCreate}
        onPersistedChange={onPersistedChange}
        onPersistedStop={onPersistedStop}
      />,
    );

    const row = screen.getByText("19 aug").parentElement.parentElement;
    fireEvent.click(screen.getByRole("button", { name: "Wissen" }));
    const middleSlot = within(row).getByRole("button", { name: "Woensdag 09:30" });
    fireEvent.pointerDown(middleSlot);
    fireEvent.pointerUp(middleSlot);
    fireEvent.pointerUp(window);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Opslaan" })));

    expect(screen.getByRole("alert")).toHaveTextContent(PLANNING_ALTERNATIVE_SPLIT_ERROR);
    expect(onPersistedChange).not.toHaveBeenCalled();
    expect(onPersistedCreate).not.toHaveBeenCalled();
    expect(onPersistedStop).not.toHaveBeenCalled();
  });
});
