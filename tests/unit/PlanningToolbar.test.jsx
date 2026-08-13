import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PlanningToolbar from "@/components/planning/PlanningToolbar";

function toolbarProps(overrides = {}) {
  return {
    perspective: "object",
    onPerspectiveChange: vi.fn(),
    compactMode: false,
    onCompactModeChange: vi.fn(),
    zoomValue: 100,
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    canZoomIn: true,
    canZoomOut: true,
    view: "period",
    onViewChange: vi.fn(),
    rangeLabel: "Periode 9 - 2026 · 10 aug – 6 sep",
    periodStart: "2026-08-10",
    periodEnd: "2026-09-06",
    periodDayCount: 28,
    onPrevious: vi.fn(),
    onToday: vi.fn(),
    onNext: vi.fn(),
    search: "",
    onSearchChange: vi.fn(),
    statusFilter: "all",
    onStatusFilterChange: vi.fn(),
    customerFilter: "all",
    onCustomerFilterChange: vi.fn(),
    customers: [],
    warningCount: 0,
    onStartEditing: vi.fn(),
    onSaveDraft: vi.fn(),
    onPublish: vi.fn(),
    publishDisabled: false,
    isPublishing: false,
    periodOptions: [
      { id: "2026-P08", label: "Periode 8 - 2026", dateLabel: "13 jul – 9 aug" },
      { id: "2026-P09", label: "Periode 9 - 2026", dateLabel: "10 aug – 6 sep" },
    ],
    selectedPeriodId: "2026-P09",
    onPeriodChange: vi.fn(),
    ...overrides,
  };
}

describe("Planning toolbar rooster- en conceptmodus", () => {
  it("opent standaard als rustige roosterweergave met één potloodactie", () => {
    const props = toolbarProps();
    render(<PlanningToolbar {...props} />);

    expect(screen.getByText("Roosterweergave")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rooster bewerken" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Concept opslaan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publiceren/i })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Beveiligingsperiode" })).toHaveTextContent("Periode 9 - 2026");

    fireEvent.click(screen.getByRole("button", { name: "Rooster bewerken" }));
    expect(props.onStartEditing).toHaveBeenCalledTimes(1);
  });

  it("toont in bewerkmodus concept opslaan en een afzonderlijke publicatiecontrole", () => {
    const props = toolbarProps({ editing: true, draftChangeCount: 3 });
    render(<PlanningToolbar {...props} />);

    expect(screen.getByText("Concept · 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Concept opslaan" }));
    fireEvent.click(screen.getByRole("button", { name: "Controleren & publiceren" }));
    expect(props.onSaveDraft).toHaveBeenCalledTimes(1);
    expect(props.onPublish).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Rooster bewerken" })).not.toBeInTheDocument();
  });
});
