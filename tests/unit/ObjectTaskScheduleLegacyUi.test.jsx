import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ObjectTaskSchedule from "@/components/objects/ObjectTaskSchedule";

const SERVER_CLOCK = {
  timezone: "Europe/Amsterdam",
  date: "2026-08-14",
  time: "14:36",
  iso: "2026-08-14T12:36:30.000Z",
};

const exactEntry = {
  client_id: "exact-monday",
  occurrence_date: "2026-08-17",
  start_time: "08:15",
  end_time: "17:45",
  end_day_offset: 0,
  frequency: "once",
  repeat_until: null,
};
const adjacentEntry = {
  client_id: "adjacent-monday",
  occurrence_date: "2026-08-17",
  start_time: "17:45",
  end_time: "18:15",
  end_day_offset: 0,
  frequency: "weekly",
  repeat_until: null,
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ObjectTaskSchedule vertrouwde tijdlijn", () => {
  it("houdt de oude 00–24-besturing, blokkeert het verleden en laat de huidige tijd doorlopen", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(SERVER_CLOCK.iso));
    const onChange = vi.fn();
    const onWeekChange = vi.fn();
    render(
      <ObjectTaskSchedule
        entries={[]}
        onChange={onChange}
        onWeekChange={onWeekChange}
        executionMode="continuous"
        durationMinutes={0}
        weekStart="2026-08-10"
        serverClock={SERVER_CLOCK}
      />,
    );

    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.getByText("24:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Taak uitvoeren" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wissen" })).toBeInTheDocument();
    expect(screen.getByText(/vandaag 14:36/i)).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Maandag 09:00" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Vrijdag 14:30" }));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Vrijdag 15:00" }));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ occurrence_date: "2026-08-14", start_time: "15:00", end_time: "15:30" }),
    ]);

    act(() => vi.advanceTimersByTime(31_000));
    expect(screen.getByText(/vandaag 14:37/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Volgende week" }));
    expect(onWeekChange).toHaveBeenCalledWith("2026-08-17");
  });

  it("behoudt een exact kwartierinterval wanneer elders in de week wordt getekend", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(SERVER_CLOCK.iso));
    const onChange = vi.fn();
    render(
      <ObjectTaskSchedule
        entries={[exactEntry, adjacentEntry]}
        onChange={onChange}
        executionMode="continuous"
        durationMinutes={0}
        weekStart="2026-08-17"
        serverClock={SERVER_CLOCK}
      />,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "Dinsdag 09:00" }));

    const next = onChange.mock.calls.at(-1)[0];
    expect(next).toEqual(expect.arrayContaining([
      expect.objectContaining({
        client_id: "exact-monday",
        start_time: "08:15",
        end_time: "17:45",
      }),
      expect.objectContaining({
        client_id: "adjacent-monday",
        start_time: "17:45",
        end_time: "18:15",
        frequency: "weekly",
      }),
      expect.objectContaining({
        occurrence_date: "2026-08-18",
        start_time: "09:00",
        end_time: "09:30",
      }),
    ]));
  });

  it("vult een preset om exacte tijden heen zonder deze naar halve uren af te ronden", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(SERVER_CLOCK.iso));
    const onChange = vi.fn();
    render(
      <ObjectTaskSchedule
        entries={[exactEntry]}
        onChange={onChange}
        executionMode="continuous"
        durationMinutes={0}
        weekStart="2026-08-17"
        serverClock={SERVER_CLOCK}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Werkdagen 08:00–18:00" }));

    const next = onChange.mock.calls.at(-1)[0];
    expect(next).toContainEqual(exactEntry);
    expect(next).toEqual(expect.arrayContaining([
      expect.objectContaining({ occurrence_date: "2026-08-17", start_time: "08:00", end_time: "08:15" }),
      expect.objectContaining({ occurrence_date: "2026-08-17", start_time: "17:45", end_time: "18:00" }),
    ]));
  });

  it("stelt exacte tijd en wekelijkse herhaling in via de kleine taak-pop-up", () => {
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
    const onChange = vi.fn();
    render(
      <ObjectTaskSchedule
        entries={[exactEntry]}
        onChange={onChange}
        executionMode="continuous"
        durationMinutes={0}
        weekStart="2026-08-17"
        serverClock={SERVER_CLOCK}
      />,
    );

    const mondaySlot = screen.getByRole("button", { name: "Maandag 08:00" });
    fireEvent.pointerDown(mondaySlot, { clientX: 720, clientY: 20 });
    fireEvent.pointerUp(mondaySlot, { clientX: 720, clientY: 20 });

    expect(screen.getByRole("dialog", { name: "Taaktijd instellen voor Maandag" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Wekelijks" }));
    fireEvent.change(screen.getByLabelText(/Einddatum/), { target: { value: "2026-12-28" } });
    fireEvent.click(screen.getByRole("button", { name: "Toepassen" }));

    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        client_id: "exact-monday",
        start_time: "08:15",
        end_time: "17:45",
        frequency: "weekly",
        repeat_until: "2026-12-28",
      }),
    ]);
  });
});
