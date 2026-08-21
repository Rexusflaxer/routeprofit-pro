import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ObjectTaskTable from "@/components/objects/ObjectTaskTable";

const task = {
  id: "definition-reception",
  task_type: "reception",
  execution_mode: "continuous",
  status: "active",
  schedule_periods: [{ days: ["mon"], start_time: "07:00", end_time: "17:00" }],
};

describe("ObjectTaskTable oude compacte weergave", () => {
  it("toont tijd, herhaling en weekdag vanuit de actuele veilige reeks", () => {
    const onOpenSchedule = vi.fn();
    render(
      <ObjectTaskTable
        rows={[task]}
        series={[{
          id: "series-1",
          task_definition_id: task.id,
          status: "active",
          current_revision_id: "revision-2",
          current_revision: {
            id: "revision-2",
            series_id: "series-1",
            revision_number: 2,
            operation: "upsert",
            start_time: "06:30",
            end_time: "18:00",
            frequency: "weekly",
            weekday: 1,
          },
        }]}
        onOpenSchedule={onOpenSchedule}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Tijd" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Herhaling" })).toBeInTheDocument();
    expect(screen.getAllByText("06:30 – 18:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Wekelijks").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ma").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Rooster wijzigen voor Receptiedienst" })[0]);
    expect(onOpenSchedule).toHaveBeenCalledWith(task);
  });

  it("valt na een gestopte reeks niet terug op een verouderd legacytijdvak", () => {
    render(
      <ObjectTaskTable
        rows={[task]}
        series={[{ id: "series-1", task_definition_id: task.id, status: "stopped" }]}
      />,
    );

    expect(screen.queryByText("07:00 – 17:00")).not.toBeInTheDocument();
  });

  it("toont geen orphan revisie zolang een moderne reeks geen current pointer heeft", () => {
    render(
      <ObjectTaskTable
        rows={[task]}
        series={[{
          id: "series-1",
          task_definition_id: task.id,
          status: "active",
          current_revision_id: null,
          current_revision: {
            id: "revision-uncommitted",
            operation: "schedule",
            start_time: "13:00",
            end_time: "14:00",
          },
        }]}
        revisions={[{
          id: "revision-uncommitted",
          series_id: "series-1",
          revision_number: 99,
          operation: "upsert",
          start_time: "13:00",
          end_time: "14:00",
          frequency: "weekly",
          weekday: 1,
        }]}
      />,
    );

    expect(screen.queryByText("13:00 – 14:00")).not.toBeInTheDocument();
    expect(screen.queryByText("07:00 – 17:00")).not.toBeInTheDocument();
  });
});
