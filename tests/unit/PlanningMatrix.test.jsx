import React from "react";
import { DragDropContext } from "@hello-pangea/dnd";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PlanningBoard from "@/components/planning/PlanningBoard";
import PlanningSidePanel from "@/components/planning/PlanningSidePanel";
import PlanningTaskBacklog from "@/components/planning/PlanningTaskBacklog";
import PlanningToolbar from "@/components/planning/PlanningToolbar";
import {
  planningShiftContainedInDate,
  resolvePlanningDrop,
} from "@/components/planning/planningDomain";

const serviceDay = new Date(2026, 7, 17, 12);

const occurrence = {
  id: "occurrence-reception",
  object_task_definition_id: "definition-reception",
  revision: 1,
  lifecycle_status: "active",
  service_date: "2026-08-17",
  end_date: "2026-08-17",
  window_start_time: "08:00",
  window_end_time: "16:00",
  required_minutes: 480,
  execution_mode: "continuous",
  task_name_snapshot: "Receptiedienst",
  object_name_snapshot: "Object 1",
  customer_name_snapshot: "Klant 1",
  customer_id: "customer-1",
  object_id: "object-1",
};

const objects = [
  { id: "object-1", name: "Object 1", address: "Havenstraat 1", status: "active" },
  { id: "object-2", name: "Object 2", address: "Marktplein 2", status: "active" },
];

const personnel = [
  { id: "personnel-anna", name: "Anna Beveiliger", status: "active", function_type: "Objectbeveiliger" },
  { id: "personnel-boris", name: "Boris Beveiliger", status: "active", function_type: "Objectbeveiliger" },
];

const shift = {
  id: "shift-evening",
  name: "Avonddienst",
  service_date: "2026-08-17",
  start_time: "16:00",
  end_time: "23:30",
  required_count: 1,
  status: "draft",
  object_id: "object-1",
  object_ids: ["object-1"],
};

const assignment = {
  id: "assignment-anna",
  planning_shift_id: shift.id,
  personnel_id: "personnel-anna",
  personnel_name: "Anna Beveiliger",
  slot_index: 0,
  status: "assigned",
  warnings: [],
};

function renderInDragContext(ui) {
  return render(<DragDropContext onDragEnd={vi.fn()}>{ui}</DragDropContext>);
}

function boardProps(overrides = {}) {
  return {
    perspective: "object",
    view: "week",
    days: [serviceDay],
    weeks: [[serviceDay]],
    shifts: [],
    assignments: [],
    segments: [],
    occurrences: [occurrence],
    personnel,
    objects,
    routes: [],
    customers: [{ id: "customer-1", name: "Klant 1" }],
    selectedShiftId: null,
    onSelectOccurrence: vi.fn(),
    onFillStaffing: vi.fn(),
    onSelectShift: vi.fn(),
    onUnassign: vi.fn(),
    onMove: vi.fn(),
    onCopy: vi.fn(),
    onEditComposition: vi.fn(),
    onCancelComposition: vi.fn(),
    taskOccurrenceCount: 1,
    isLoading: false,
    ...overrides,
  };
}

function sidePanelProps(overrides = {}) {
  return {
    mode: "tasks",
    onModeChange: vi.fn(),
    taskCount: 1,
    taskProps: {
      occurrences: [occurrence],
      segments: [],
      selectedShift: null,
      onCreateShift: vi.fn(),
      onAddToShift: vi.fn(),
      onEditShift: vi.fn(),
      onClearShift: vi.fn(),
    },
    employeeProps: {
      selectedShift: null,
      candidates: [],
      onAssign: vi.fn(),
      onCloseShift: vi.fn(),
      personnelCount: personnel.length,
      qualifications: [],
      securityPasses: [],
    },
    ...overrides,
  };
}

function toolbarProps(overrides = {}) {
  return {
    perspective: "object",
    onPerspectiveChange: vi.fn(),
    orientation: "resources_horizontal",
    onOrientationChange: vi.fn(),
    planningLayout: "timeline",
    onPlanningLayoutChange: vi.fn(),
    view: "week",
    onViewChange: vi.fn(),
    rangeLabel: "17 – 23 augustus 2026",
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
    onPublish: vi.fn(),
    publishDisabled: false,
    isPublishing: false,
    customStart: "2026-08-17",
    customEnd: "2026-08-23",
    onCustomStartChange: vi.fn(),
    onCustomEndChange: vi.fn(),
    ...overrides,
  };
}

describe("Planning matrix", () => {
  it("toont in tijdlijnmodus de klanttaak als vaste 24-uursvraag met een exact open dienstvoorstel", () => {
    const longOccurrence = {
      ...occurrence,
      id: "occurrence-long-reception",
      window_start_time: "06:00",
      window_end_time: "20:00",
      required_minutes: 840,
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({ layout: "timeline", occurrences: [longOccurrence] })} />,
    );

    expect(screen.getByRole("table", { name: "Planning per object" })).toHaveAttribute("data-planning-layout", "timeline");
    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.getByText("24:00")).toBeInTheDocument();
    const overlay = container.querySelector('[data-task-occurrence-id="occurrence-long-reception"]');
    expect(overlay).toHaveAttribute("data-timeline-task-overlay", "true");
    expect(within(overlay).getByText("06:00–20:00")).toBeInTheDocument();
    expect(within(overlay).getByText("Taak nog niet verdeeld")).toBeInTheDocument();
    expect(container.querySelector('[data-droppable-id="occurrence-gap:occurrence-long-reception:2026-08-17:0360:0840"]')).toBeInTheDocument();
    expect(within(overlay).getByRole("button", { name: /open dienst maken/i })).toBeInTheDocument();
  });

  it("maakt via de snelle actie exact de voorgestelde eerste dienst van maximaal acht uur", () => {
    const onCreateOpenTaskSlice = vi.fn();
    const longOccurrence = {
      ...occurrence,
      id: "occurrence-open-service",
      window_start_time: "06:00",
      window_end_time: "20:00",
      required_minutes: 840,
    };
    renderInDragContext(
      <PlanningBoard {...boardProps({ layout: "timeline", occurrences: [longOccurrence], onCreateOpenTaskSlice })} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open dienst maken/i }));
    expect(onCreateOpenTaskSlice).toHaveBeenCalledWith({
      occurrence: longOccurrence,
      serviceDate: "2026-08-17",
      startTime: "06:00",
      endTime: "14:00",
    });
  });

  it("behoudt een korte brand- en sluitronde als exact sleepbaar taakvenster", () => {
    const onCreateOpenTaskSlice = vi.fn();
    const shortOccurrence = {
      ...occurrence,
      id: "occurrence-fire-round",
      task_name_snapshot: "Brand- en sluitronde",
      window_start_time: "22:00",
      window_end_time: "22:25",
      required_minutes: 25,
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({ layout: "timeline", occurrences: [shortOccurrence], onCreateOpenTaskSlice })} />,
    );

    const overlay = container.querySelector('[data-task-occurrence-id="occurrence-fire-round"]');
    expect(parseFloat(overlay.style.top)).toBeCloseTo(22 * 32, 4);
    expect(within(overlay).getByText("22:00–22:25")).toBeInTheDocument();
    expect(container.querySelector('[data-droppable-id="occurrence-gap:occurrence-fire-round:2026-08-17:1320:1345"]')).toBeInTheDocument();
    fireEvent.click(within(overlay).getByRole("button", { name: "Open dienst maken 22:00–22:25" }));
    expect(onCreateOpenTaskSlice).toHaveBeenCalledWith({
      occurrence: shortOccurrence,
      serviceDate: "2026-08-17",
      startTime: "22:00",
      endTime: "22:25",
    });
  });

  it("houdt een korte taak vlak voor middernacht volledig binnen het dagcanvas", () => {
    const midnightOccurrence = {
      ...occurrence,
      id: "occurrence-midnight-round",
      task_name_snapshot: "Late sluitronde",
      window_start_time: "23:50",
      window_end_time: "00:00",
      end_date: "2026-08-18",
      required_minutes: 10,
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({ layout: "timeline", occurrences: [midnightOccurrence] })} />,
    );

    const overlay = container.querySelector('[data-task-occurrence-id="occurrence-midnight-round"]');
    const canvas = overlay.closest("[data-timeline-day-canvas]");
    expect(parseFloat(overlay.style.top) + parseFloat(overlay.style.height)).toBeLessThanOrEqual(parseFloat(canvas.style.height));
    expect(within(overlay).getByText("23:50–24:00")).toBeInTheDocument();
  });

  it("projecteert een nachttaak op beide kalenderdagen zonder klantvraag te verliezen", () => {
    const overnightOccurrence = {
      ...occurrence,
      id: "occurrence-overnight",
      service_date: "2026-08-17",
      end_date: "2026-08-18",
      window_start_time: "22:00",
      window_end_time: "06:00",
      required_minutes: 480,
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({
        layout: "timeline",
        days: [serviceDay, new Date(2026, 7, 18, 12)],
        occurrences: [overnightOccurrence],
      })} />,
    );

    expect(container.querySelectorAll('[data-task-occurrence-id="occurrence-overnight"]')).toHaveLength(2);
    expect(container.querySelector('[data-droppable-id="occurrence-gap:occurrence-overnight:2026-08-17:1320:1440"]')).toBeInTheDocument();
    expect(container.querySelector('[data-droppable-id="occurrence-gap:occurrence-overnight:2026-08-18:0000:0360"]')).toBeInTheDocument();
  });

  it("behoudt bij resize van de eerste nachthelft het oorspronkelijke einde op de volgende dag", () => {
    const onResizeTaskSegment = vi.fn();
    const overnightOccurrence = {
      ...occurrence,
      id: "occurrence-overnight-start-resize",
      service_date: "2026-08-17",
      end_date: "2026-08-18",
      window_start_time: "22:00",
      window_end_time: "06:00",
      required_minutes: 480,
    };
    const overnightShift = {
      ...shift,
      id: "shift-overnight-start-resize",
      source_type: "task",
      service_date: "2026-08-17",
      end_date: "2026-08-18",
      start_time: "22:00",
      end_time: "06:00",
    };
    const overnightSegment = {
      id: "segment-overnight-start-resize",
      shift_id: overnightShift.id,
      task_occurrence_id: overnightOccurrence.id,
      object_id: overnightOccurrence.object_id,
      start_date: "2026-08-17",
      end_date: "2026-08-18",
      start_time: "22:00",
      end_time: "06:00",
      status: "draft",
    };
    renderInDragContext(<PlanningBoard {...boardProps({
      layout: "timeline",
      days: [serviceDay, new Date(2026, 7, 18, 12)],
      occurrences: [overnightOccurrence],
      shifts: [overnightShift],
      segments: [overnightSegment],
      onResizeTaskSegment,
    })} />);

    const startHandle = screen.getByRole("slider", { name: /begintijd van avonddienst aanpassen/i });
    fireEvent.keyDown(startHandle, { key: "ArrowDown" });
    fireEvent.keyDown(startHandle, { key: "Enter" });
    expect(onResizeTaskSegment).toHaveBeenCalledWith(expect.objectContaining({
      startDate: "2026-08-17",
      startTime: "22:05",
      endDate: "2026-08-18",
      endTime: "06:00",
    }));
  });

  it("behoudt bij resize van de tweede nachthelft de oorspronkelijke start op de vorige dag", () => {
    const onResizeTaskSegment = vi.fn();
    const overnightOccurrence = {
      ...occurrence,
      id: "occurrence-overnight-end-resize",
      service_date: "2026-08-17",
      end_date: "2026-08-18",
      window_start_time: "22:00",
      window_end_time: "06:00",
      required_minutes: 480,
    };
    const overnightShift = {
      ...shift,
      id: "shift-overnight-end-resize",
      source_type: "task",
      service_date: "2026-08-17",
      end_date: "2026-08-18",
      start_time: "22:00",
      end_time: "06:00",
    };
    const overnightSegment = {
      id: "segment-overnight-end-resize",
      shift_id: overnightShift.id,
      task_occurrence_id: overnightOccurrence.id,
      object_id: overnightOccurrence.object_id,
      start_date: "2026-08-17",
      end_date: "2026-08-18",
      start_time: "22:00",
      end_time: "06:00",
      status: "draft",
    };
    renderInDragContext(<PlanningBoard {...boardProps({
      layout: "timeline",
      days: [serviceDay, new Date(2026, 7, 18, 12)],
      occurrences: [overnightOccurrence],
      shifts: [overnightShift],
      segments: [overnightSegment],
      onResizeTaskSegment,
    })} />);

    const endHandle = screen.getByRole("slider", { name: /eindtijd van avonddienst aanpassen/i });
    expect(endHandle).toHaveAttribute("aria-orientation", "vertical");
    fireEvent.keyDown(endHandle, { key: "ArrowUp" });
    fireEvent.keyDown(endHandle, { key: "Enter" });
    expect(onResizeTaskSegment).toHaveBeenCalledWith(expect.objectContaining({
      startDate: "2026-08-17",
      startTime: "22:00",
      endDate: "2026-08-18",
      endTime: "05:55",
    }));
  });

  it("maakt na een eerste deel precies het resterende taakdeel als volgende dropzone zichtbaar", () => {
    const longOccurrence = {
      ...occurrence,
      id: "occurrence-split-reception",
      window_start_time: "06:00",
      window_end_time: "20:00",
      required_minutes: 840,
    };
    const firstShift = {
      ...shift,
      id: "shift-first-half",
      source_type: "task",
      start_time: "06:00",
      end_time: "12:00",
    };
    const firstSegment = {
      id: "segment-first-half",
      shift_id: firstShift.id,
      task_occurrence_id: longOccurrence.id,
      object_id: longOccurrence.object_id,
      start_date: longOccurrence.service_date,
      end_date: longOccurrence.service_date,
      start_time: "06:00",
      end_time: "12:00",
      status: "draft",
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({ layout: "timeline", occurrences: [longOccurrence], shifts: [firstShift], segments: [firstSegment] })} />,
    );

    expect(container.querySelector('[data-droppable-id="occurrence-gap:occurrence-split-reception:2026-08-17:0720:1200"]')).toBeInTheDocument();
    expect(container.querySelector('[data-segment-id="segment-first-half"]')).toHaveTextContent(/06:00–12:00/);
  });

  it("houdt een volledig afgedekte klanttaak zichtbaar onder de bemande dienst", () => {
    const coveredShift = { ...shift, id: "shift-timeline-covered", source_type: "task", start_time: "08:00", end_time: "16:00" };
    const coveredSegment = {
      id: "segment-timeline-covered",
      shift_id: coveredShift.id,
      task_occurrence_id: occurrence.id,
      object_id: occurrence.object_id,
      start_date: occurrence.service_date,
      end_date: occurrence.end_date,
      start_time: "08:00",
      end_time: "16:00",
      status: "draft",
    };
    const coveredAssignment = { ...assignment, planning_shift_id: coveredShift.id };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({ layout: "timeline", shifts: [coveredShift], segments: [coveredSegment], assignments: [coveredAssignment] })} />,
    );

    expect(container.querySelector(`[data-task-occurrence-id="${occurrence.id}"]`)).toBeInTheDocument();
    expect(container.querySelector('[data-segment-id="segment-timeline-covered"]')).toHaveTextContent("Anna Beveiliger");
    expect(container.querySelector(`[data-timeline-gap^="${occurrence.id}:"]`)).not.toBeInTheDocument();
  });

  it("maakt een gevormde maar onbemande dienst tot een expliciete medewerkersdropzone", () => {
    const openShift = { ...shift, id: "shift-timeline-open", source_type: "task", start_time: "08:00", end_time: "16:00" };
    const openSegment = {
      id: "segment-timeline-open",
      shift_id: openShift.id,
      task_occurrence_id: occurrence.id,
      object_id: occurrence.object_id,
      start_date: occurrence.service_date,
      end_date: occurrence.end_date,
      start_time: "08:00",
      end_time: "16:00",
      status: "draft",
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({ layout: "timeline", shifts: [openShift], segments: [openSegment] })} />,
    );

    expect(container.querySelector('[data-segment-id="segment-timeline-open"]')).toHaveTextContent("Open dienst");
    expect(container.querySelector('[data-droppable-id^="slot:shift-timeline-open:0:2026-08-17:"]')).toBeInTheDocument();
  });

  it("resizet met het toetsenbord in stappen van vijf minuten en schrijft pas bij Enter", () => {
    const onResizeTaskSegment = vi.fn();
    const resizeShift = { ...shift, id: "shift-resize", source_type: "task", start_time: "08:00", end_time: "16:00" };
    const resizeSegment = {
      id: "segment-resize",
      shift_id: resizeShift.id,
      task_occurrence_id: occurrence.id,
      object_id: occurrence.object_id,
      start_date: occurrence.service_date,
      end_date: occurrence.end_date,
      start_time: "08:00",
      end_time: "16:00",
      status: "draft",
    };
    renderInDragContext(
      <PlanningBoard {...boardProps({ layout: "timeline", shifts: [resizeShift], segments: [resizeSegment], onResizeTaskSegment })} />,
    );

    const endHandle = screen.getByRole("slider", { name: /eindtijd van avonddienst aanpassen/i });
    fireEvent.keyDown(endHandle, { key: "ArrowUp" });
    expect(onResizeTaskSegment).not.toHaveBeenCalled();
    fireEvent.keyDown(endHandle, { key: "Enter" });
    expect(onResizeTaskSegment).toHaveBeenCalledWith(expect.objectContaining({
      shift: resizeShift,
      segment: resizeSegment,
      startTime: "08:00",
      endTime: "15:55",
    }));
  });

  it("annuleert een niet-opgeslagen toetsenbordresize wanneer de greep focus verliest", () => {
    const onResizeTaskSegment = vi.fn();
    const resizeShift = { ...shift, id: "shift-resize-blur", source_type: "task", start_time: "08:00", end_time: "16:00" };
    const resizeSegment = {
      id: "segment-resize-blur",
      shift_id: resizeShift.id,
      task_occurrence_id: occurrence.id,
      object_id: occurrence.object_id,
      start_date: occurrence.service_date,
      end_date: occurrence.end_date,
      start_time: "08:00",
      end_time: "16:00",
      status: "draft",
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({ layout: "timeline", shifts: [resizeShift], segments: [resizeSegment], onResizeTaskSegment })} />,
    );

    const endHandle = screen.getByRole("slider", { name: /eindtijd van avonddienst aanpassen/i });
    fireEvent.keyDown(endHandle, { key: "ArrowUp" });
    expect(container.querySelector('[data-segment-id="segment-resize-blur"]')).toHaveTextContent("08:00–15:55");
    fireEvent.blur(endHandle);
    expect(container.querySelector('[data-segment-id="segment-resize-blur"]')).toHaveTextContent("08:00–16:00");
    expect(onResizeTaskSegment).not.toHaveBeenCalled();
  });

  it("toont objecten horizontaal, dagen verticaal en taakvoorkomens als expliciete dropzones", () => {
    const { container } = renderInDragContext(<PlanningBoard {...boardProps()} />);

    expect(screen.getByRole("table", { name: "Planning per object" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Object 1/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Object 2/i })).toBeInTheDocument();
    expect(screen.getByRole("rowheader")).toHaveTextContent(/17 aug/i);
    expect(screen.getByText("Receptiedienst")).toBeInTheDocument();
    expect(container.querySelector('[data-droppable-id="occurrence:occurrence-reception:2026-08-17"]')).toBeInTheDocument();

    const scrollContainer = screen.getByTestId("planning-matrix-scroll");
    expect(scrollContainer).toHaveClass("overflow-auto");
    expect(container.querySelectorAll(".overflow-auto")).toHaveLength(1);
    expect(screen.getByRole("columnheader", { name: /Object 1/i })).toHaveClass("sticky", "top-0");
    expect(screen.getByRole("rowheader")).toHaveClass("sticky", "left-0");
  });

  it("toont medewerkers horizontaal met bezetting en een TASK-dropzone per medewerker en dag", () => {
    const { container } = renderInDragContext(
      <PlanningBoard
        {...boardProps({
          perspective: "employee",
          shifts: [shift],
          assignments: [assignment],
          occurrences: [],
          taskOccurrenceCount: 0,
        })}
      />,
    );

    expect(screen.getByRole("table", { name: "Planning per medewerker" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Anna Beveiliger/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Boris Beveiliger/i })).toBeInTheDocument();
    expect(screen.getByText("Avonddienst")).toBeInTheDocument();
    expect(container.querySelector('[data-droppable-id="employee-day:personnel-boris:2026-08-17"]')).toBeInTheDocument();
  });

  it("toont alleen operationeel actieve medewerkers en ondersteunt expliciete legacyrecords", () => {
    renderInDragContext(
      <PlanningBoard
        {...boardProps({
          perspective: "employee",
          occurrences: [],
          personnel: [
            { id: "active", name: "Actieve medewerker", status: "active", is_active: false },
            { id: "draft", name: "Conceptmedewerker", status: "draft", is_active: true },
            { id: "new", name: "Nieuwe medewerker", status: "new", is_active: true },
            { id: "legacy", name: "Legacy medewerker", is_active: true },
          ],
        })}
      />,
    );

    expect(screen.getByRole("columnheader", { name: /Actieve medewerker/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Legacy medewerker/i })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Conceptmedewerker/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Nieuwe medewerker/i })).not.toBeInTheDocument();
  });

  it("toont volledig afgedekte taakvraag niet dubbel naast de gekoppelde dienst", () => {
    const coveredShift = { ...shift, id: "shift-covered", name: "Geplande receptiedienst", start_time: "08:00", end_time: "16:00" };
    const coveredSegment = {
      id: "segment-covered",
      shift_id: coveredShift.id,
      task_occurrence_id: occurrence.id,
      object_id: occurrence.object_id,
      start_date: occurrence.service_date,
      end_date: occurrence.end_date,
      start_time: "08:00",
      end_time: "16:00",
      duration_minutes: 480,
      task_name_snapshot: occurrence.task_name_snapshot,
      object_name_snapshot: occurrence.object_name_snapshot,
      status: "draft",
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({ shifts: [coveredShift], segments: [coveredSegment] })} />,
    );

    expect(container.querySelector(`[data-shift-id="${coveredShift.id}"]`)).toBeInTheDocument();
    expect(container.querySelector(`[data-segment-id="${coveredSegment.id}"]`)).toBeInTheDocument();
    expect(container.querySelector(`[data-task-occurrence-id="${occurrence.id}"]`)).not.toBeInTheDocument();
    expect(container.querySelector(`[data-droppable-id="occurrence:${occurrence.id}:2026-08-17"]`)).not.toBeInTheDocument();
  });

  it("projecteert een samengestelde dienst per object en segmentdatum, inclusief het nachtsegment", () => {
    const nextDay = new Date(2026, 7, 18, 12);
    const compositeShift = {
      ...shift,
      id: "shift-composite",
      name: "Samengestelde beveiligingsdienst",
      start_time: "15:30",
      end_time: "01:00",
      object_id: null,
      object_ids: ["object-1", "object-2"],
      source_type: "task",
    };
    const compositeSegments = [
      {
        id: "segment-reception",
        shift_id: compositeShift.id,
        task_occurrence_id: "occurrence-composite-reception",
        object_id: "object-1",
        start_date: "2026-08-17",
        end_date: "2026-08-17",
        start_time: "15:30",
        end_time: "18:15",
        task_name_snapshot: "Receptie Object 1",
        object_name_snapshot: "Object 1",
        status: "draft",
      },
      {
        id: "segment-night-round",
        shift_id: compositeShift.id,
        task_occurrence_id: "occurrence-composite-round",
        object_id: "object-2",
        start_date: "2026-08-18",
        end_date: "2026-08-18",
        start_time: "00:15",
        end_time: "01:00",
        task_name_snapshot: "Nachtronde Object 2",
        object_name_snapshot: "Object 2",
        status: "draft",
      },
    ];
    const { container } = renderInDragContext(
      <PlanningBoard
        {...boardProps({
          days: [serviceDay, nextDay],
          weeks: [[serviceDay, nextDay]],
          shifts: [compositeShift],
          segments: compositeSegments,
          occurrences: [],
        })}
      />,
    );

    const receptionCell = container.querySelector('[data-matrix-cell="object:object-1:2026-08-17"]');
    const nightCell = container.querySelector('[data-matrix-cell="object:object-2:2026-08-18"]');
    expect(within(receptionCell).getByText(/15:30–18:15/)).toBeInTheDocument();
    expect(within(receptionCell).getByText("Receptie Object 1")).toBeInTheDocument();
    expect(within(nightCell).getByText(/00:15–01:00/)).toBeInTheDocument();
    expect(within(nightCell).getByText("Nachtronde Object 2")).toBeInTheDocument();
    expect(container.querySelector('[data-matrix-cell="object:object-2:2026-08-17"] [data-shift-id="shift-composite"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-matrix-cell="object:object-1:2026-08-18"] [data-shift-id="shift-composite"]')).not.toBeInTheDocument();
    const projections = [...container.querySelectorAll('[data-shift-id="shift-composite"]')];
    expect(projections).toHaveLength(2);
    expect(projections.every(item => item.dataset.shiftId === compositeShift.id)).toBe(true);
    expect(container.querySelector('[data-segment-id="segment-reception"]')).toBeInTheDocument();
    expect(container.querySelector('[data-segment-id="segment-night-round"]')).toBeInTheDocument();
    expect(screen.getAllByLabelText("Samengestelde dienst")).toHaveLength(2);
  });

  it("projecteert een nachtdienst vanaf de vorige dag als vervolg in beide matrices", () => {
    const overnightShift = {
      ...shift,
      id: "shift-overnight-boundary",
      service_date: "2026-08-16",
      start_time: "22:00",
      end_time: "06:00",
    };
    const overnightAssignment = {
      ...assignment,
      id: "assignment-overnight-boundary",
      planning_shift_id: overnightShift.id,
    };
    const { container, rerender } = renderInDragContext(
      <PlanningBoard {...boardProps({ shifts: [overnightShift], assignments: [overnightAssignment], occurrences: [] })} />,
    );

    const objectCell = container.querySelector('[data-matrix-cell="object:object-1:2026-08-17"]');
    expect(within(objectCell).getByText(/00:00–06:00 · vervolg/)).toBeInTheDocument();

    rerender(
      <DragDropContext onDragEnd={vi.fn()}>
        <PlanningBoard {...boardProps({ perspective: "employee", shifts: [overnightShift], assignments: [overnightAssignment], occurrences: [] })} />
      </DragDropContext>,
    );
    const employeeCell = container.querySelector('[data-matrix-cell="personnel:personnel-anna:2026-08-17"]');
    expect(within(employeeCell).getByText(/00:00–06:00 · vervolg/)).toBeInTheDocument();
  });

  it("projecteert een taak uit de vorige nacht op de eerste zichtbare dag", () => {
    const carryInOccurrence = {
      ...occurrence,
      id: "occurrence-carry-in",
      service_date: "2026-08-16",
      end_date: "2026-08-17",
      window_start_time: "22:00",
      window_end_time: "06:00",
      task_name_snapshot: "Nachtelijke receptie",
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({ occurrences: [carryInOccurrence] })} />,
    );

    const mondayCell = container.querySelector('[data-matrix-cell="object:object-1:2026-08-17"]');
    expect(within(mondayCell).getByText(/00:00–06:00 · vervolg/)).toBeInTheDocument();
    expect(mondayCell.querySelector('[data-task-occurrence-id="occurrence-carry-in"]')).toBeInTheDocument();
    expect(mondayCell.querySelector('[data-droppable-id="occurrence:occurrence-carry-in:2026-08-17"]')).toBeInTheDocument();
  });

  it("houdt expliciete sparse slots vrij zonder een bestaande medewerker te dupliceren", () => {
    const twoPersonShift = { ...shift, id: "shift-two-person", required_count: 2 };
    const slotOneAssignment = {
      ...assignment,
      id: "assignment-slot-one",
      planning_shift_id: twoPersonShift.id,
      slot_index: 1,
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({ shifts: [twoPersonShift], assignments: [slotOneAssignment], occurrences: [] })} />,
    );

    const shiftCard = container.querySelector('[data-shift-id="shift-two-person"]');
    expect(within(shiftCard).getAllByText("Anna Beveiliger")).toHaveLength(1);
    expect(within(shiftCard).getByText("Open plaats")).toBeInTheDocument();
    expect(shiftCard.querySelector('[data-droppable-id^="slot:shift-two-person:0:"]')).toBeInTheDocument();
    expect(shiftCard.querySelector('[data-droppable-id^="slot:shift-two-person:1:"]')).toBeInTheDocument();
  });

  it("groepeert meerdere segmenten van dezelfde dienst binnen één object-dagkaart", () => {
    const groupedShift = { ...shift, id: "shift-grouped", source_type: "task" };
    const groupedSegments = [
      {
        id: "segment-opening",
        shift_id: groupedShift.id,
        task_occurrence_id: "occurrence-opening",
        object_id: "object-1",
        start_date: "2026-08-17",
        end_date: "2026-08-17",
        start_time: "16:00",
        end_time: "17:00",
        task_name_snapshot: "Openingsronde",
        status: "draft",
      },
      {
        id: "segment-closing",
        shift_id: groupedShift.id,
        task_occurrence_id: "occurrence-closing",
        object_id: "object-1",
        start_date: "2026-08-17",
        end_date: "2026-08-17",
        start_time: "20:00",
        end_time: "21:00",
        task_name_snapshot: "Sluitronde",
        status: "draft",
      },
    ];
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({ shifts: [groupedShift], segments: groupedSegments, occurrences: [] })} />,
    );

    const cell = container.querySelector('[data-matrix-cell="object:object-1:2026-08-17"]');
    expect(cell.querySelectorAll('[data-shift-id="shift-grouped"]')).toHaveLength(1);
    expect(cell.querySelectorAll('[data-droppable-id^="slot:shift-grouped:0:"]')).toHaveLength(1);
    expect(within(cell).getByText("Openingsronde")).toBeInTheDocument();
    expect(within(cell).getByText("Sluitronde")).toBeInTheDocument();
  });

  it("houdt taakdekking volledig wanneer een gekoppelde shift alleen visueel is uitgefilterd", () => {
    const coveredShift = { ...shift, id: "shift-filtered-covered", start_time: "08:00", end_time: "16:00" };
    const coveredSegment = {
      id: "segment-filtered-covered",
      shift_id: coveredShift.id,
      task_occurrence_id: occurrence.id,
      object_id: occurrence.object_id,
      start_date: occurrence.service_date,
      end_date: occurrence.end_date,
      start_time: "08:00",
      end_time: "16:00",
      status: "published",
    };
    const onFillStaffing = vi.fn();
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({ shifts: [], coverageShifts: [coveredShift], segments: [coveredSegment], onFillStaffing })} />,
    );

    const occurrenceCard = container.querySelector(`[data-task-occurrence-id="${occurrence.id}"]`);
    expect(occurrenceCard).toHaveTextContent("Volledig gepland");
    expect(occurrenceCard).not.toHaveTextContent("Nog niet gepland");
    expect(occurrenceCard).toHaveTextContent("Tijd 8u/8u");
    expect(occurrenceCard).toHaveTextContent("Bezetting 0/1");
    expect(occurrenceCard).toHaveTextContent("Sleep medewerker naar de open bezettingsplaats");
    expect(container.querySelector(`[data-droppable-id="occurrence:${occurrence.id}:2026-08-17"]`)).toBeInTheDocument();
    fireEvent.click(within(occurrenceCard).getByRole("button", { name: "Bezetting invullen" }));
    expect(onFillStaffing).toHaveBeenCalledWith(occurrence);
  });

  it("behoudt snapshotkolommen voor taakvraag bij gearchiveerde en conceptobjecten", () => {
    const archivedOccurrence = {
      ...occurrence,
      id: "occurrence-archived-object",
      object_id: "object-archived",
      object_name_snapshot: "Snapshotlocatie West",
      customer_name_snapshot: "Historische klant",
    };
    const archivedObjects = [
      { id: "object-archived", name: "Gewijzigde objectnaam", status: "archived" },
      { id: "object-empty-archived", name: "Leeg gearchiveerd object", status: "archived" },
      { id: "object-concept", name: "Conceptnaam intern", status: "concept", is_active_customer_object: true },
      { id: "object-empty-concept", name: "Leeg conceptobject", status: "concept", is_active_customer_object: true },
    ];
    const conceptOccurrence = {
      ...occurrence,
      id: "occurrence-concept-object",
      object_id: "object-concept",
      object_name_snapshot: "Snapshotlocatie Concept",
      customer_name_snapshot: "Klant uit snapshot",
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({ objects: archivedObjects, occurrences: [archivedOccurrence, conceptOccurrence] })} />,
    );

    expect(screen.getByRole("columnheader", { name: /Snapshotlocatie West/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Snapshotlocatie Concept/i })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Leeg gearchiveerd object/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Leeg conceptobject/i })).not.toBeInTheDocument();
    expect(container.querySelector('[data-droppable-id="occurrence:occurrence-archived-object:2026-08-17"]')).toBeInTheDocument();
    expect(container.querySelector('[data-droppable-id="occurrence:occurrence-concept-object:2026-08-17"]')).toBeInTheDocument();
  });
});

describe("Planning matrix-bediening", () => {
  it("opent vanuit een Monday-slot eerst de volledige Sunday–Monday nachtdienstcontext", () => {
    const overnightShift = {
      ...shift,
      id: "shift-confirm-overnight",
      name: "Nachtbewaking",
      service_date: "2026-08-16",
      end_date: "2026-08-17",
      start_time: "23:00",
      end_time: "01:00",
    };
    const candidate = {
      personnel: personnel[0],
      criticalCount: 0,
      warningCount: 0,
      scheduledMinutes: 0,
      contractMinutes: 2_400,
      warnings: [],
    };
    const onAssign = vi.fn();

    function OvernightSlotHarness() {
      const [selectedShift, setSelectedShift] = React.useState(null);
      return (
        <>
          <PlanningBoard
            {...boardProps({
              shifts: [overnightShift],
              assignments: [],
              occurrences: [],
              onSelectShift: setSelectedShift,
            })}
          />
          <PlanningSidePanel
            {...sidePanelProps({
              perspective: "object",
              employeeProps: {
                ...sidePanelProps().employeeProps,
                selectedShift,
                candidates: [candidate],
                onAssign,
              },
            })}
          />
        </>
      );
    }

    const { container } = renderInDragContext(<OvernightSlotHarness />);
    const mondaySlot = container.querySelector('[data-droppable-id^="slot:shift-confirm-overnight:0:2026-08-17:"]');
    expect(mondaySlot).toBeInTheDocument();
    const resolved = resolvePlanningDrop({
      draggableId: "personnel:personnel-anna",
      destination: { droppableId: mondaySlot.dataset.droppableId },
    });
    expect(resolved.serviceDate).toBe("2026-08-17");
    expect(planningShiftContainedInDate(overnightShift, resolved.serviceDate)).toBe(false);

    fireEvent.click(within(mondaySlot).getByRole("button", { name: /open plaats voor nachtbewaking bekijken/i }));
    expect(screen.getByRole("heading", { name: "Medewerker kiezen" })).toBeInTheDocument();
    expect(screen.getByTestId("selected-shift-full-interval")).toHaveTextContent(/16 aug 2026 23:00.*17 aug 2026 01:00/i);
    expect(screen.getByText("Bevestig de volledige nachtdienst")).toBeInTheDocument();
    const confirmButton = screen.getByRole("button", { name: /Anna Beveiliger op de volledige dienst inplannen.*16 aug 2026 23:00.*17 aug 2026 01:00/i });
    expect(onAssign).not.toHaveBeenCalled();
    fireEvent.click(confirmButton);
    expect(onAssign).toHaveBeenCalledWith(candidate);
  });

  it("maakt iedere open taak in de taakpool draggable met het task:<id>-contract", () => {
    const { container } = renderInDragContext(
      <PlanningTaskBacklog
        occurrences={[occurrence]}
        segments={[]}
        selectedShift={null}
        onCreateShift={vi.fn()}
        onAddToShift={vi.fn()}
        onEditShift={vi.fn()}
        onClearShift={vi.fn()}
        enableTaskDrag
      />,
    );

    expect(screen.getByRole("button", { name: "Receptiedienst slepen" })).toBeInTheDocument();
    expect(container.querySelector('[data-rfd-draggable-id="task:occurrence-reception"]')).toBeInTheDocument();
    expect(container.querySelector('[data-rfd-droppable-id="task-pool"]')).toBeInTheDocument();
  });

  it("nummerert taakdraggables in dezelfde oplopende datumvolgorde als de DOM", () => {
    const nextOccurrence = {
      ...occurrence,
      id: "occurrence-next-day",
      service_date: "2026-08-18",
      end_date: "2026-08-18",
      task_name_snapshot: "Nachtronde",
    };
    const { container } = renderInDragContext(
      <PlanningTaskBacklog
        occurrences={[nextOccurrence, occurrence]}
        segments={[]}
        selectedShift={null}
        onCreateShift={vi.fn()}
        onAddToShift={vi.fn()}
        onEditShift={vi.fn()}
        onClearShift={vi.fn()}
        enableTaskDrag
      />,
    );

    const cards = [...container.querySelectorAll("[data-task-draggable-id]")];
    expect(cards.map(card => card.dataset.taskDraggableId)).toEqual([
      "task:occurrence-reception",
      "task:occurrence-next-day",
    ]);
    expect(cards.map(card => card.dataset.taskDraggableIndex)).toEqual(["0", "1"]);
  });

  it("houdt een volledig afgedekte maar nog onbezet gebleven taak draggable", () => {
    const coveredSegment = {
      id: "segment-covered-unassigned",
      shift_id: shift.id,
      task_occurrence_id: occurrence.id,
      start_date: occurrence.service_date,
      end_date: occurrence.end_date,
      start_time: "08:00",
      end_time: "16:00",
      status: "draft",
    };
    const onFillStaffing = vi.fn();
    renderInDragContext(
      <PlanningTaskBacklog
        occurrences={[occurrence]}
        segments={[coveredSegment]}
        shifts={[{ ...shift, start_time: "08:00", end_time: "16:00" }]}
        assignments={[]}
        selectedShift={null}
        onCreateShift={vi.fn()}
        onAddToShift={vi.fn()}
        onEditShift={vi.fn()}
        onClearShift={vi.fn()}
        onFillStaffing={onFillStaffing}
        enableTaskDrag
      />,
    );

    expect(screen.getByText("1 plaats open")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Receptiedienst slepen" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bezetting invullen" }));
    expect(onFillStaffing).toHaveBeenCalledWith(occurrence);
  });

  it("groepeert een carry-in taak op de eerste zichtbare dag met een vervolglabel", () => {
    const carryInOccurrence = {
      ...occurrence,
      id: "backlog-carry-in",
      service_date: "2026-08-16",
      end_date: "2026-08-17",
      window_start_time: "22:00",
      window_end_time: "06:00",
      task_name_snapshot: "Nachtelijke balie",
    };
    renderInDragContext(
      <PlanningTaskBacklog
        occurrences={[carryInOccurrence]}
        segments={[]}
        selectedShift={null}
        onCreateShift={vi.fn()}
        onAddToShift={vi.fn()}
        onEditShift={vi.fn()}
        onClearShift={vi.fn()}
        periodStart="2026-08-17"
        enableTaskDrag
      />,
    );

    expect(screen.getByText(/ma 17 aug/i)).toBeInTheDocument();
    expect(screen.getByText(/Object 1 · 00:00–06:00 · vervolg/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nachtelijke balie slepen" })).toBeInTheDocument();
  });

  it("zet het zijpaneel vast op medewerkers bij objecten en op taken bij medewerkers", () => {
    const { rerender } = renderInDragContext(
      <PlanningSidePanel {...sidePanelProps({ perspective: "object" })} />,
    );

    expect(screen.getByRole("heading", { name: "Medewerkers" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();

    rerender(
      <DragDropContext onDragEnd={vi.fn()}>
        <PlanningSidePanel {...sidePanelProps({ perspective: "employee" })} />
      </DragDropContext>,
    );

    expect(screen.getByRole("heading", { name: "Taken om in te plannen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Receptiedienst slepen" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("houdt een reeds toegewezen medewerker zichtbaar als dragbron zonder dubbele sneltoewijzing", () => {
    renderInDragContext(
      <PlanningSidePanel
        {...sidePanelProps({
          perspective: "object",
          employeeProps: {
            ...sidePanelProps().employeeProps,
            selectedShift: shift,
            candidates: [{
              personnel: personnel[0],
              assignedToSelectedShift: true,
              criticalCount: 0,
              warningCount: 0,
              scheduledMinutes: 480,
              contractMinutes: 2_400,
              warnings: [],
            }],
          },
        })}
      />,
    );

    expect(screen.getByText("Anna Beveiliger")).toBeInTheDocument();
    expect(screen.getByText("al ingepland")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anna Beveiliger slepen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Anna Beveiliger inplannen/i })).not.toBeInTheDocument();
  });

  it("beperkt de toolbar tot week of eigen periode en geeft beide datums door", () => {
    const onViewChange = vi.fn();
    const onCustomStartChange = vi.fn();
    const onCustomEndChange = vi.fn();
    const props = toolbarProps({ onViewChange, onCustomStartChange, onCustomEndChange });
    const { rerender } = render(<PlanningToolbar {...props} />);

    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Objectweergave" })).toHaveAttribute("aria-label", "Objectweergave");
    expect(screen.getByRole("button", { name: "Medewerkerweergave" })).toHaveAttribute("aria-label", "Medewerkerweergave");
    expect(screen.queryByRole("button", { name: "Dag" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "4 weken" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Periode" }));
    expect(onViewChange).toHaveBeenCalledWith("period");

    rerender(<PlanningToolbar {...props} view="custom" />);
    fireEvent.change(screen.getByLabelText("Begindatum periode"), { target: { value: "2026-08-18" } });
    fireEvent.change(screen.getByLabelText("Einddatum periode"), { target: { value: "2026-08-25" } });
    expect(onCustomStartChange).toHaveBeenCalledWith("2026-08-18");
    expect(onCustomEndChange).toHaveBeenCalledWith("2026-08-25");
  });

  it("wisselt expliciet tussen tijdlijn en kaarten en verbergt transponeren in de tijdlijn", () => {
    const onPlanningLayoutChange = vi.fn();
    const props = toolbarProps({ onPlanningLayoutChange, planningLayout: "timeline" });
    const { rerender } = render(<PlanningToolbar {...props} />);

    expect(screen.getByRole("button", { name: "Tijdlijn" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /matrixweergave wisselen/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Kaarten" }));
    expect(onPlanningLayoutChange).toHaveBeenCalledWith("cards");

    rerender(<PlanningToolbar {...props} planningLayout="cards" />);
    expect(screen.getByRole("button", { name: "Kaarten" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /matrixweergave wisselen/i })).toBeInTheDocument();
  });
});
