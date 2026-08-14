import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ObjectTaskWeekSchedule from "@/components/objects/ObjectTaskWeekSchedule";
import ObjectTaskWizard from "@/components/objects/ObjectTaskWizard";

const receptionPlan = {
  id: "security-plan-reception-weekdays",
  status: "active",
  task_type: "reception",
  variant_name: "Receptie werkdagen",
  execution_mode: "continuous_post",
  current_revision: {
    id: "security-plan-revision-reception-weekdays",
    duration_minutes: null,
    status: "published",
  },
};

afterEach(() => {
  vi.useRealTimers();
});

describe("ObjectTaskWizard", () => {
  it("loopt rechtstreeks via Categorie en Plan naar Rooster zonder aparte stap Herhaling", async () => {
    render(
      <ObjectTaskWizard
        securityPlans={[receptionPlan]}
        plansLoading={false}
        plansError={null}
        weekStart="2026-08-10"
        serverClock={{
          timezone: "Europe/Amsterdam",
          date: "2026-08-14",
          time: "14:36",
          iso: "2026-08-14T12:36:30.000Z",
        }}
        saving={false}
        error={null}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const progress = screen.getByRole("list", { name: "Voortgang taak" });
    expect(progress).toHaveTextContent("Categorie");
    expect(progress).toHaveTextContent("Plan");
    expect(progress).toHaveTextContent("Rooster");
    expect(progress).not.toHaveTextContent("Herhaling");
    expect(screen.getByText("Wat betreft de taak?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Receptie/i }));
    expect(await screen.findByText("Welk beveiligingsplan geldt?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Receptie werkdagen/i }));

    expect(await screen.findByText("Teken de taak in het rooster")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Taakrooster per week" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Taak opslaan" })).toBeDisabled();
  });
});

describe("ObjectTaskWeekSchedule huidige tijd en weeknavigatie", () => {
  it("vergrendelt verleden, plaatst vandaag na nu en laat de tijdindicatie doorlopen", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T12:36:30.000Z"));
    const onDraw = vi.fn();
    const onWeekChange = vi.fn();
    render(
      <ObjectTaskWeekSchedule
        weekStart="2026-08-10"
        entries={[]}
        editable
        allowDrawing
        executionMode="continuous"
        serverClock={{
          timezone: "Europe/Amsterdam",
          date: "2026-08-14",
          time: "14:36",
          iso: "2026-08-14T12:36:30.000Z",
        }}
        onDraw={onDraw}
        onWeekChange={onWeekChange}
      />,
    );

    expect(screen.getByRole("heading", { name: "Week 33" })).toBeInTheDocument();
    expect(screen.getByText("Vandaag · 14:36")).toBeInTheDocument();
    expect(screen.getAllByText("Verleden", { selector: "span" })).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /Taakmoment handmatig toevoegen op do 13 aug/i }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vorige week" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", {
      name: /Taakmoment handmatig toevoegen op vr 14 aug/i,
    }));
    expect(onDraw).toHaveBeenCalledWith({
      occurrence_date: "2026-08-14",
      start_time: "14:40",
      end_time: "15:10",
      end_day_offset: 0,
    });

    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(screen.getByText("Vandaag · 14:37")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Volgende week" }));
    expect(onWeekChange).toHaveBeenCalledWith("2026-08-17");
  });
});
