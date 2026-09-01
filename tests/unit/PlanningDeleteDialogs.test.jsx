import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PlanningTaskDeleteDialog from "@/components/planning/PlanningDeleteDialogs";

describe("Planning taakverwijdering", () => {
  it("legt uit dat een samengestelde dienst en haar medewerkers behouden blijven", () => {
    const onConfirm = vi.fn();
    const request = {
      occurrence: {
        id: "occurrence-composed-delete",
        task_name_snapshot: "Receptietaak",
        service_date: "2026-09-01",
        window_start_time: "06:30",
        window_end_time: "12:00",
      },
      linkedShifts: [{ id: "shift-composed" }],
      employeeCount: 1,
    };

    render(
      <PlanningTaskDeleteDialog
        request={request}
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        isPending={false}
      />,
    );

    expect(screen.getByRole("heading", { name: "Taak uit planning verwijderen" })).toBeInTheDocument();
    expect(screen.getByText(/verwijdert alleen dit taakdeel/i)).toBeInTheDocument();
    expect(screen.getByText(/samengestelde dienst blijft met haar medewerkers bestaan/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Taak verwijderen" }));
    expect(onConfirm).toHaveBeenCalledWith(request);
  });
});
