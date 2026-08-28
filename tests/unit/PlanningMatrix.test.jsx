import React from "react";
import { DragDropContext } from "@hello-pangea/dnd";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    editable: true,
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
  it("toont uitsluitend de kaartmatrix en houdt een ongevormde klanttaak compact", () => {
    const longOccurrence = {
      ...occurrence,
      id: "occurrence-long-reception",
      window_start_time: "06:00",
      window_end_time: "20:00",
      required_minutes: 840,
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({ occurrences: [longOccurrence] })} />,
    );

    expect(screen.getByRole("table", { name: "Planning per object" })).toHaveAttribute("data-planning-layout", "cards");
    expect(screen.queryByText("00:00")).not.toBeInTheDocument();
    expect(screen.queryByText("24:00")).not.toBeInTheDocument();
    const card = container.querySelector('[data-task-occurrence-id="occurrence-long-reception"]');
    expect(card).not.toHaveAttribute("data-inline-time-editor");
    expect(within(card).getByText("06:00–20:00")).toBeInTheDocument();
    expect(within(card).getByText("Open")).toBeInTheDocument();
    expect(within(card).getByText("14u nog niet ingepland")).toBeInTheDocument();
    expect(card).toHaveAttribute("data-open-task-interval", "06:00-20:00");
    expect(card).toHaveAttribute("data-droppable-id", "occurrence-gap:occurrence-long-reception:2026-08-17:0360:1080");
    expect(container.querySelector('[data-service-time-rail="true"]')).not.toBeInTheDocument();
  });

  it("opent standaard als rustig leesrooster en toont de medewerker als primaire dienstinformatie", () => {
    const coveredShift = {
      ...shift,
      id: "shift-read-mode",
      source_type: "task",
      start_time: "08:00",
      end_time: "16:00",
    };
    const coveredSegment = {
      id: "segment-read-mode",
      shift_id: coveredShift.id,
      task_occurrence_id: occurrence.id,
      object_id: occurrence.object_id,
      start_date: occurrence.service_date,
      end_date: occurrence.end_date,
      start_time: "08:00",
      end_time: "16:00",
      task_name_snapshot: occurrence.task_name_snapshot,
      status: "draft",
    };
    const coveredAssignment = {
      ...assignment,
      id: "assignment-read-mode",
      planning_shift_id: coveredShift.id,
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({
        editable: false,
        shifts: [coveredShift],
        segments: [coveredSegment],
        assignments: [coveredAssignment],
      })} />,
    );

    const table = screen.getByRole("table", { name: "Planning per object" });
    const group = container.querySelector(`[data-task-coverage-group="${occurrence.id}"]`);
    const service = container.querySelector(`[data-shift-id="${coveredShift.id}"]`);
    expect(table).toHaveAttribute("data-editable", "false");
    expect(group).toBeInTheDocument();
    expect(within(group).getAllByText("Receptiedienst")).toHaveLength(1);
    expect(within(service).getByText("Anna Beveiliger")).toBeInTheDocument();
    expect(within(service).getByText("AB")).toBeInTheDocument();
    expect(service).toHaveTextContent("08:00–16:00");
    expect(container.querySelector("[data-droppable-id]")).not.toBeInTheDocument();
    expect(container.querySelector("[data-service-resize-edge]")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Acties voor Avonddienst" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anna Beveiliger vrijmaken" })).not.toBeInTheDocument();
  });

  it("maakt in bewerkmodus dropzones, acties en bestaande resizegrepen opnieuw beschikbaar", () => {
    const coveredShift = {
      ...shift,
      id: "shift-edit-mode",
      source_type: "task",
      start_time: "08:00",
      end_time: "16:00",
    };
    const coveredSegment = {
      id: "segment-edit-mode",
      shift_id: coveredShift.id,
      task_occurrence_id: occurrence.id,
      object_id: occurrence.object_id,
      start_date: occurrence.service_date,
      end_date: occurrence.end_date,
      start_time: "08:00",
      end_time: "16:00",
      task_name_snapshot: occurrence.task_name_snapshot,
      status: "draft",
    };
    const coveredAssignment = {
      ...assignment,
      id: "assignment-edit-mode",
      planning_shift_id: coveredShift.id,
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({
        editable: true,
        shifts: [coveredShift],
        segments: [coveredSegment],
        assignments: [coveredAssignment],
      })} />,
    );

    expect(screen.getByRole("table", { name: "Planning per object" })).toHaveAttribute("data-editable", "true");
    expect(container.querySelector('[data-droppable-id^="slot:shift-edit-mode:0:"]')).toBeInTheDocument();
    expect(container.querySelectorAll("[data-service-resize-edge]")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Acties voor Avonddienst" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anna Beveiliger vrijmaken" })).toBeInTheDocument();
  });

  it("houdt een open taakdeel in leesmodus compact zonder herhaalde sleepinstructie", () => {
    const onSelectOccurrence = vi.fn();
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({ editable: false, onSelectOccurrence })} />,
    );

    const openCard = container.querySelector(`[data-task-occurrence-id="${occurrence.id}"]`);
    expect(openCard).toBeInTheDocument();
    expect(within(openCard).getByText("Open")).toBeInTheDocument();
    expect(within(openCard).getByText("8u nog niet ingepland")).toBeInTheDocument();
    expect(openCard).not.toHaveAttribute("data-droppable-id");
    fireEvent.click(within(openCard).getByRole("button", { name: /receptiedienst/i }));
    expect(onSelectOccurrence).not.toHaveBeenCalled();
    expect(screen.queryByText(/sleep een medewerker/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open dienst maken/i })).not.toBeInTheDocument();
  });

  it("splitst een 24-uurs taak bij slepen in maximaal twaalf uur en toont daarna 12:00–24:00 als restkaart", () => {
    const fullDayOccurrence = {
      ...occurrence,
      id: "occurrence-full-day",
      service_date: "2026-08-17",
      end_date: "2026-08-18",
      window_start_time: "00:00",
      window_end_time: "00:00",
      required_minutes: 1440,
    };
    const initial = renderInDragContext(
      <PlanningBoard {...boardProps({ occurrences: [fullDayOccurrence] })} />,
    );

    const initialCard = initial.container.querySelector('[data-task-occurrence-id="occurrence-full-day"]');
    expect(initialCard).toHaveAttribute("data-open-task-interval", "00:00-24:00");
    expect(initialCard).toHaveAttribute(
      "data-droppable-id",
      "occurrence-gap:occurrence-full-day:2026-08-17:0000:0720",
    );
    initial.unmount();

    const firstHalfShift = {
      ...shift,
      id: "shift-full-day-first-half",
      source_type: "task",
      service_date: "2026-08-17",
      end_date: "2026-08-17",
      start_time: "00:00",
      end_time: "12:00",
    };
    const firstHalfSegment = {
      id: "segment-full-day-first-half",
      shift_id: firstHalfShift.id,
      task_occurrence_id: fullDayOccurrence.id,
      object_id: fullDayOccurrence.object_id,
      start_date: "2026-08-17",
      end_date: "2026-08-17",
      start_time: "00:00",
      end_time: "12:00",
      status: "draft",
    };
    const afterFirstHalf = renderInDragContext(
      <PlanningBoard {...boardProps({
        occurrences: [fullDayOccurrence],
        shifts: [firstHalfShift],
        segments: [firstHalfSegment],
      })} />,
    );

    const remainingCard = afterFirstHalf.container.querySelector('[data-task-occurrence-id="occurrence-full-day"]');
    const firstService = afterFirstHalf.container.querySelector('[data-shift-id="shift-full-day-first-half"]');
    expect(firstService).toHaveTextContent("00:00–12:00");
    expect(remainingCard).toHaveAttribute("data-open-task-interval", "12:00-24:00");
    expect(remainingCard).toHaveAttribute(
      "data-droppable-id",
      "occurrence-gap:occurrence-full-day:2026-08-17:0720:1440",
    );
  });

  it("toont een gedeeltelijk gevormde dienst los van uitsluitend het resterende open taakdeel", () => {
    const onCreateOpenTaskSlice = vi.fn();
    const longOccurrence = {
      ...occurrence,
      id: "occurrence-open-service",
      window_start_time: "06:00",
      window_end_time: "20:00",
      required_minutes: 840,
    };
    const firstShift = {
      ...shift,
      id: "shift-open-service-first-part",
      source_type: "task",
      start_time: "06:00",
      end_time: "12:00",
    };
    const firstSegment = {
      id: "segment-open-service-first-part",
      shift_id: firstShift.id,
      task_occurrence_id: longOccurrence.id,
      object_id: longOccurrence.object_id,
      start_date: longOccurrence.service_date,
      end_date: longOccurrence.end_date,
      start_time: "06:00",
      end_time: "12:00",
      status: "draft",
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({
        occurrences: [longOccurrence],
        shifts: [firstShift],
        segments: [firstSegment],
        onCreateOpenTaskSlice,
      })} />,
    );

    const card = container.querySelector(`[data-task-occurrence-id="${longOccurrence.id}"]`);
    const service = container.querySelector(`[data-shift-id="${firstShift.id}"]`);
    const lane = container.querySelector(`[data-task-coverage-lane="${longOccurrence.id}"]`);
    expect(card).toHaveAttribute("data-open-task-interval", "12:00-20:00");
    expect(card).not.toContainElement(service);
    expect(service).toHaveAttribute("data-service-block", "true");
    expect(service).toHaveAttribute("data-planning-width", "full");
    expect(lane.querySelector('[data-service-resize-edge="start"]')).toBeInTheDocument();
    expect(lane.querySelector('[data-service-resize-edge="end"]')).toBeInTheDocument();
    expect(within(service).queryByRole("region", { name: /diensttijd aanpassen/i })).not.toBeInTheDocument();
    expect(container.querySelector('[data-droppable-id="occurrence-gap:occurrence-open-service:2026-08-17:0720:1200"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /open dienst maken/i }));
    expect(onCreateOpenTaskSlice).toHaveBeenCalledWith({
      occurrence: longOccurrence,
      serviceDate: "2026-08-17",
      startTime: "12:00",
      endTime: "20:00",
    });
  });

  it("onderscheidt een echte open dienst van een nog ongevormd taakdeel", async () => {
    const splitOccurrence = {
      ...occurrence,
      id: "occurrence-real-open-service",
      window_start_time: "06:30",
      window_end_time: "18:00",
      required_minutes: 690,
    };
    const staffedShift = {
      ...shift,
      id: "shift-staffed-part",
      source_type: "task",
      start_time: "06:30",
      end_time: "15:30",
    };
    const openShift = {
      ...shift,
      id: "shift-open-part",
      source_type: "task",
      start_time: "15:30",
      end_time: "18:00",
    };
    const staffedSegment = {
      id: "segment-staffed-part",
      shift_id: staffedShift.id,
      task_occurrence_id: splitOccurrence.id,
      object_id: splitOccurrence.object_id,
      start_date: splitOccurrence.service_date,
      end_date: splitOccurrence.end_date,
      start_time: "06:30",
      end_time: "15:30",
      status: "draft",
    };
    const openSegment = {
      ...staffedSegment,
      id: "segment-open-part",
      shift_id: openShift.id,
      start_time: "15:30",
      end_time: "18:00",
    };
    const staffedAssignment = {
      ...assignment,
      id: "assignment-staffed-part",
      planning_shift_id: staffedShift.id,
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({
        occurrences: [splitOccurrence],
        shifts: [staffedShift, openShift],
        segments: [staffedSegment, openSegment],
        assignments: [staffedAssignment],
      })} />,
    );

    const openService = container.querySelector(`[data-shift-id="${openShift.id}"]`);
    expect(openService).toHaveAttribute("data-planning-item-kind", "service");
    expect(openService).toHaveAttribute("data-open-service", "true");
    expect(openService).toHaveTextContent("Open dienst");
    expect(openService).toHaveTextContent("15:30–18:00");
    expect(container.querySelector(`[data-task-occurrence-id="${splitOccurrence.id}"]`)).not.toBeInTheDocument();

    fireEvent.contextMenu(openService);
    expect(await screen.findByRole("menuitem", { name: "Dienst bewerken" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "Dienst verwijderen" })).toBeEnabled();
    expect(screen.queryByRole("menuitem", { name: "Taak bewerken" })).not.toBeInTheDocument();
  });

  it("laat een lokaal synchroniserende dienst direct verder bewerken en resizen", async () => {
    const optimisticShift = {
      ...shift,
      id: "pending-shift-editable",
      source_type: "task",
      start_time: "08:00",
      end_time: "16:00",
      _optimistic_pending: true,
    };
    const optimisticSegment = {
      id: "pending-segment-editable",
      shift_id: optimisticShift.id,
      task_occurrence_id: occurrence.id,
      object_id: occurrence.object_id,
      start_date: occurrence.service_date,
      end_date: occurrence.end_date,
      start_time: "08:00",
      end_time: "16:00",
      status: "draft",
      _optimistic_pending: true,
    };
    const optimisticAssignment = {
      ...assignment,
      id: "pending-assignment-editable",
      planning_shift_id: optimisticShift.id,
      _optimistic_pending: true,
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({
        shifts: [optimisticShift],
        segments: [optimisticSegment],
        assignments: [optimisticAssignment],
        queuedResourceKeys: new Set([
          `shift:${optimisticShift.id}`,
          `occurrence:${occurrence.id}`,
        ]),
      })} />,
    );

    const service = container.querySelector(`[data-shift-id="${optimisticShift.id}"]`);
    const endHandle = screen.getByRole("slider", { name: /eindtijd van avonddienst aanpassen/i });
    expect(endHandle).toBeEnabled();
    fireEvent.contextMenu(service);
    expect(await screen.findByRole("menuitem", { name: "Dienst bewerken" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "Medewerker uitplannen" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "Dienst verwijderen" })).toBeEnabled();
  });

  it("geeft een korte brand- en sluitronde directe randgrepen zonder de exacte tijd te verliezen", () => {
    const shortOccurrence = {
      ...occurrence,
      id: "occurrence-fire-round",
      task_name_snapshot: "Brand- en sluitronde",
      window_start_time: "22:00",
      window_end_time: "22:25",
      required_minutes: 25,
    };
    const shortShift = {
      ...shift,
      id: "shift-fire-round",
      source_type: "task",
      start_time: "22:00",
      end_time: "22:25",
    };
    const shortSegment = {
      id: "segment-fire-round",
      shift_id: shortShift.id,
      task_occurrence_id: shortOccurrence.id,
      object_id: shortOccurrence.object_id,
      start_date: shortOccurrence.service_date,
      end_date: shortOccurrence.end_date,
      start_time: "22:00",
      end_time: "22:25",
      status: "draft",
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({
        occurrences: [shortOccurrence],
        shifts: [shortShift],
        segments: [shortSegment],
      })} />,
    );

    const service = container.querySelector('[data-shift-id="shift-fire-round"]');
    const lane = container.querySelector('[data-task-coverage-lane="occurrence-fire-round"]');
    expect(container.querySelector('[data-task-occurrence-id="occurrence-fire-round"]')).not.toBeInTheDocument();
    expect(within(service).getByText("22:00–22:25", { exact: false })).toBeInTheDocument();
    expect(lane.querySelector('[data-service-resize-edge="start"]')).toHaveAttribute("aria-valuenow", "1320");
    expect(lane.querySelector('[data-service-resize-edge="end"]')).toHaveAttribute("aria-valuenow", "1345");
    expect(within(lane).getByRole("slider", { name: /begintijd van avonddienst aanpassen/i })).toHaveAttribute("aria-orientation", "vertical");
    expect(within(lane).getByRole("slider", { name: /eindtijd van avonddienst aanpassen/i })).toHaveAttribute("aria-orientation", "vertical");
    expect(service.querySelector('[data-service-time-rail="true"]')).not.toBeInTheDocument();
  });

  it("houdt een korte taak vlak voor middernacht compact met grepen op de kaartranden", () => {
    const midnightOccurrence = {
      ...occurrence,
      id: "occurrence-midnight-round",
      task_name_snapshot: "Late sluitronde",
      window_start_time: "23:50",
      window_end_time: "00:00",
      end_date: "2026-08-18",
      required_minutes: 10,
    };
    const midnightShift = {
      ...shift,
      id: "shift-midnight-round",
      source_type: "task",
      start_time: "23:50",
      end_time: "00:00",
      end_date: "2026-08-18",
    };
    const midnightSegment = {
      id: "segment-midnight-round",
      shift_id: midnightShift.id,
      task_occurrence_id: midnightOccurrence.id,
      object_id: midnightOccurrence.object_id,
      start_date: "2026-08-17",
      end_date: "2026-08-18",
      start_time: "23:50",
      end_time: "00:00",
      status: "draft",
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({
        occurrences: [midnightOccurrence],
        shifts: [midnightShift],
        segments: [midnightSegment],
      })} />,
    );

    const service = container.querySelector('[data-shift-id="shift-midnight-round"]');
    const lane = container.querySelector('[data-task-coverage-lane="occurrence-midnight-round"]');
    expect(container.querySelector('[data-task-occurrence-id="occurrence-midnight-round"]')).not.toBeInTheDocument();
    expect(within(service).getByText("23:50–24:00", { exact: false })).toBeInTheDocument();
    expect(lane.querySelector('[data-service-resize-edge="start"]')).toHaveAttribute("aria-valuetext", expect.stringContaining("23:50"));
    expect(lane.querySelector('[data-service-resize-edge="end"]')).toHaveAttribute("aria-valuetext", expect.stringContaining("24:00"));
    expect(service.querySelector('[data-service-time-rail="true"]')).not.toBeInTheDocument();
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
        days: [serviceDay, new Date(2026, 7, 18, 12)],
        occurrences: [overnightOccurrence],
      })} />,
    );

    expect(container.querySelectorAll('[data-task-occurrence-id="occurrence-overnight"]')).toHaveLength(2);
    expect(container.querySelector('[data-droppable-id="occurrence-gap:occurrence-overnight:2026-08-17:1320:1440"]')).toBeInTheDocument();
    expect(container.querySelector('[data-droppable-id="occurrence-gap:occurrence-overnight:2026-08-18:0000:0360"]')).toBeInTheDocument();
    expect(screen.getByText(/22:00–24:00 · loopt door/i)).toBeInTheDocument();
    expect(screen.getByText(/00:00–06:00 · vervolg/i)).toBeInTheDocument();
  });

  it("behoudt bij resize van de eerste nachthelft het oorspronkelijke einde op de volgende dag", () => {
    const onResizeTaskSegment = vi.fn(() => new Promise(() => {}));
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
      days: [serviceDay, new Date(2026, 7, 18, 12)],
      occurrences: [overnightOccurrence],
      shifts: [overnightShift],
      segments: [overnightSegment],
      onResizeTaskSegment,
    })} />);

    const startHandle = screen.getByRole("slider", { name: /begintijd van avonddienst aanpassen/i });
    expect(startHandle).toHaveAttribute("data-service-resize-edge", "start");
    expect(screen.getAllByRole("slider")).toHaveLength(2);
    fireEvent.keyDown(startHandle, { key: "ArrowDown" });
    fireEvent.keyDown(startHandle, { key: "Enter" });
    expect(onResizeTaskSegment).toHaveBeenCalledWith(expect.objectContaining({
      occurrence: overnightOccurrence,
      serviceDate: "2026-08-17",
      startDate: "2026-08-17",
      startTime: "22:05",
      endDate: "2026-08-18",
      endTime: "06:00",
    }));
  });

  it("behoudt bij resize van de tweede nachthelft de oorspronkelijke start op de vorige dag", () => {
    const onResizeTaskSegment = vi.fn(() => new Promise(() => {}));
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
      days: [serviceDay, new Date(2026, 7, 18, 12)],
      occurrences: [overnightOccurrence],
      shifts: [overnightShift],
      segments: [overnightSegment],
      onResizeTaskSegment,
    })} />);

    const endHandle = screen.getByRole("slider", { name: /eindtijd van avonddienst aanpassen/i });
    expect(endHandle).toHaveAttribute("data-service-resize-edge", "end");
    expect(screen.getAllByRole("slider")).toHaveLength(2);
    expect(endHandle).toHaveAttribute("aria-orientation", "vertical");
    fireEvent.keyDown(endHandle, { key: "ArrowUp" });
    fireEvent.keyDown(endHandle, { key: "Enter" });
    expect(onResizeTaskSegment).toHaveBeenCalledWith(expect.objectContaining({
      occurrence: overnightOccurrence,
      serviceDate: "2026-08-18",
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
      <PlanningBoard {...boardProps({
        occurrences: [longOccurrence],
        shifts: [firstShift],
        segments: [firstSegment],
      })} />,
    );

    expect(container.querySelector('[data-droppable-id="occurrence-gap:occurrence-split-reception:2026-08-17:0720:1200"]')).toBeInTheDocument();
    const service = container.querySelector('[data-shift-id="shift-first-half"]');
    expect(service).toHaveTextContent(/06:00–12:00/);
    expect(service).toHaveAttribute("data-planning-width", "full");
    expect(container.querySelector('[data-task-occurrence-id="occurrence-split-reception"]')).toHaveAttribute(
      "data-open-task-interval",
      "12:00-20:00",
    );
  });

  it("mengt open taakdelen en zelfstandige diensten in chronologische volgorde", () => {
    const dayOccurrence = {
      ...occurrence,
      id: "occurrence-chronological",
      window_start_time: "06:00",
      window_end_time: "20:00",
      required_minutes: 840,
    };
    const middleShift = {
      ...shift,
      id: "shift-chronological",
      source_type: "task",
      start_time: "08:00",
      end_time: "12:00",
    };
    const middleSegment = {
      id: "segment-chronological",
      shift_id: middleShift.id,
      task_occurrence_id: dayOccurrence.id,
      object_id: dayOccurrence.object_id,
      start_date: dayOccurrence.service_date,
      end_date: dayOccurrence.end_date,
      start_time: "08:00",
      end_time: "12:00",
      status: "draft",
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({
        occurrences: [dayOccurrence],
        shifts: [middleShift],
        segments: [middleSegment],
      })} />,
    );

    const cell = container.querySelector('[data-matrix-cell="object:object-1:2026-08-17"]');
    const lane = cell.querySelector('[data-task-coverage-lane]');
    const pieces = [...lane.querySelectorAll(':scope > article')]
      .sort((left, right) => Number.parseFloat(left.style.top) - Number.parseFloat(right.style.top));
    expect(pieces).toHaveLength(3);
    expect(pieces[0]).toHaveAttribute("data-open-task-interval", "06:00-08:00");
    expect(pieces[1]).toHaveAttribute("data-shift-id", middleShift.id);
    expect(pieces[1]).toHaveAttribute("data-planning-width", "full");
    expect(pieces[2]).toHaveAttribute("data-open-task-interval", "12:00-20:00");
  });

  it("verwijdert een volledig afgedekte klanttaakkaart en toont alleen de zelfstandige bemande dienst", () => {
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
      <PlanningBoard {...boardProps({
        shifts: [coveredShift],
        segments: [coveredSegment],
        assignments: [coveredAssignment],
      })} />,
    );

    const taskCard = container.querySelector(`[data-task-occurrence-id="${occurrence.id}"]`);
    const service = container.querySelector('[data-shift-id="shift-timeline-covered"]');
    expect(taskCard).not.toBeInTheDocument();
    expect(service).toHaveTextContent("Anna Beveiliger");
    expect(service).toHaveAttribute("data-service-block", "true");
    expect(service).toHaveAttribute("data-planning-width", "full");
    expect(container.querySelectorAll('[data-shift-id="shift-timeline-covered"]')).toHaveLength(1);
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
      <PlanningBoard {...boardProps({
        shifts: [openShift],
        segments: [openSegment],
      })} />,
    );

    expect(container.querySelector(`[data-task-occurrence-id="${occurrence.id}"]`)).not.toBeInTheDocument();
    expect(container.querySelector('[data-shift-id="shift-timeline-open"]')).toHaveTextContent("Open plaats");
    expect(container.querySelector('[data-shift-id="shift-timeline-open"]')).toHaveAttribute("data-service-block", "true");
    expect(container.querySelector('[data-droppable-id^="slot:shift-timeline-open:0:2026-08-17:"]')).toBeInTheDocument();
  });

  it("resizet met het toetsenbord in stappen van vijf minuten en schrijft pas bij Enter", () => {
    const onResizeTaskSegment = vi.fn(() => new Promise(() => {}));
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
      <PlanningBoard {...boardProps({
        shifts: [resizeShift],
        segments: [resizeSegment],
        onResizeTaskSegment,
      })} />,
    );

    const endHandle = screen.getByRole("slider", { name: /eindtijd van avonddienst aanpassen/i });
    fireEvent.keyDown(endHandle, { key: "ArrowUp" });
    expect(onResizeTaskSegment).not.toHaveBeenCalled();
    fireEvent.keyDown(endHandle, { key: "Enter" });
    expect(onResizeTaskSegment).toHaveBeenCalledWith(expect.objectContaining({
      shift: resizeShift,
      segment: resizeSegment,
      occurrence,
      serviceDate: "2026-08-17",
      startTime: "08:00",
      endTime: "15:55",
    }));
  });

  it("berekent pointer-resize proportioneel vanuit de volledige taaklane", () => {
    const onResizeTaskSegment = vi.fn(() => new Promise(() => {}));
    const resizeShift = {
      ...shift,
      id: "shift-pointer-resize-zoom",
      source_type: "task",
      start_time: "08:00",
      end_time: "16:00",
    };
    const resizeSegment = {
      id: "segment-pointer-resize-zoom",
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
      <PlanningBoard {...boardProps({
        shifts: [resizeShift],
        segments: [resizeSegment],
        onResizeTaskSegment,
      })} />,
    );

    const service = container.querySelector(`[data-shift-id="${resizeShift.id}"]`);
    const lane = container.querySelector(`[data-task-coverage-lane="${occurrence.id}"]`);
    vi.spyOn(lane, "getBoundingClientRect").mockReturnValue({
      top: 80,
      bottom: 200,
      left: 0,
      right: 220,
      width: 220,
      height: 120,
      x: 0,
      y: 80,
      toJSON: () => ({}),
    });
    const endHandle = within(lane).getByRole("slider", { name: /eindtijd van avonddienst aanpassen/i });
    expect(endHandle).toHaveAttribute("data-service-resize-edge", "end");
    expect(endHandle.parentElement).toBe(lane);
    fireEvent.pointerDown(endHandle, { button: 0, clientY: 190 });
    fireEvent.pointerUp(window, { clientY: 190 });
    expect(onResizeTaskSegment).not.toHaveBeenCalled();

    fireEvent.pointerDown(endHandle, { button: 0, clientY: 190 });
    fireEvent.pointerMove(window, { clientY: 130 });
    fireEvent.pointerUp(window, { clientY: 130 });

    expect(onResizeTaskSegment).toHaveBeenCalledTimes(1);
    expect(onResizeTaskSegment).toHaveBeenCalledWith(expect.objectContaining({
      occurrence,
      serviceDate: "2026-08-17",
      shift: resizeShift,
      segment: resizeSegment,
      startTime: "08:00",
      endTime: "12:00",
    }));
  });

  it("laat tijdens pointermove de dienst krimpen en het resterende taakdeel evenredig groeien", async () => {
    const onResizeTaskSegment = vi.fn(() => new Promise(() => {}));
    const splitOccurrence = {
      ...occurrence,
      id: "occurrence-live-split",
      window_start_time: "10:00",
      window_end_time: "18:00",
    };
    const splitShift = {
      ...shift,
      id: "shift-live-split",
      source_type: "task",
      start_time: "10:00",
      end_time: "18:00",
    };
    const splitSegment = {
      id: "segment-live-split",
      shift_id: splitShift.id,
      task_occurrence_id: splitOccurrence.id,
      object_id: splitOccurrence.object_id,
      start_date: splitOccurrence.service_date,
      end_date: splitOccurrence.end_date,
      start_time: "10:00",
      end_time: "18:00",
      status: "draft",
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({
        occurrences: [splitOccurrence],
        shifts: [splitShift],
        segments: [splitSegment],
        onResizeTaskSegment,
      })} />,
    );
    const lane = container.querySelector('[data-task-coverage-lane="occurrence-live-split"]');
    const service = lane.querySelector('[data-shift-id="shift-live-split"]');
    vi.spyOn(lane, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 120,
      left: 0,
      right: 220,
      width: 220,
      height: 120,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const endHandle = within(lane).getByRole("slider", { name: /eindtijd van avonddienst aanpassen/i });

    fireEvent.pointerDown(endHandle, { button: 0, clientY: 120 });
    fireEvent.pointerMove(window, { clientY: 60 });

    await waitFor(() => {
      expect(service).toHaveStyle({ top: "0%", height: "50%" });
      expect(service).toHaveTextContent("10:00–14:00");
      const remainder = lane.querySelector('[data-open-task-interval="14:00-18:00"]');
      expect(remainder).toHaveStyle({ top: "50%", height: "50%" });
    });
    expect(onResizeTaskSegment).not.toHaveBeenCalled();

    fireEvent.pointerUp(window, { clientY: 60 });
    expect(onResizeTaskSegment).toHaveBeenCalledTimes(1);
    expect(onResizeTaskSegment).toHaveBeenCalledWith(expect.objectContaining({
      startTime: "10:00",
      endTime: "14:00",
    }));
  });

  it("verplaatst één gedeelde lijn atomair tussen twee aansluitende diensten van dezelfde taak", () => {
    const onResizeTaskBoundary = vi.fn(() => new Promise(() => {}));
    const sharedOccurrence = {
      ...occurrence,
      id: "occurrence-shared-boundary",
      window_start_time: "10:00",
      window_end_time: "18:00",
    };
    const earlyShift = { ...shift, id: "shift-early", source_type: "task", start_time: "10:00", end_time: "14:00" };
    const lateShift = { ...shift, id: "shift-late", source_type: "task", start_time: "14:00", end_time: "18:00" };
    const earlySegment = {
      id: "segment-early",
      shift_id: earlyShift.id,
      task_occurrence_id: sharedOccurrence.id,
      object_id: sharedOccurrence.object_id,
      start_date: sharedOccurrence.service_date,
      end_date: sharedOccurrence.end_date,
      start_time: "10:00",
      end_time: "14:00",
      status: "draft",
    };
    const lateSegment = {
      ...earlySegment,
      id: "segment-late",
      shift_id: lateShift.id,
      start_time: "14:00",
      end_time: "18:00",
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({
        occurrences: [sharedOccurrence],
        shifts: [earlyShift, lateShift],
        segments: [earlySegment, lateSegment],
        onResizeTaskBoundary,
      })} />,
    );
    const lane = container.querySelector('[data-task-coverage-lane="occurrence-shared-boundary"]');
    const sharedHandle = within(lane).getByRole("slider", { name: /grens tussen aansluitende diensten aanpassen/i });
    expect(lane.querySelectorAll('[data-task-boundary-kind="service-service"]')).toHaveLength(1);
    expect(sharedHandle).toHaveAttribute("data-service-resize-edge", "shared");
    expect(sharedHandle).toHaveAttribute(
      "aria-controls",
      "planning-service-occurrence-shared-boundary-2026-08-17-segment-early planning-service-occurrence-shared-boundary-2026-08-17-segment-late",
    );

    fireEvent.keyDown(sharedHandle, { key: "ArrowDown", shiftKey: true });
    expect(lane.querySelector('[data-shift-id="shift-early"]')).toHaveStyle({ top: "0%", height: "62.5%" });
    expect(lane.querySelector('[data-shift-id="shift-late"]')).toHaveStyle({ top: "62.5%", height: "37.5%" });
    expect(lane.querySelector('[data-task-occurrence-id="occurrence-shared-boundary"]')).not.toBeInTheDocument();
    expect(onResizeTaskBoundary).not.toHaveBeenCalled();

    fireEvent.keyDown(sharedHandle, { key: "Enter" });
    expect(onResizeTaskBoundary).toHaveBeenCalledTimes(1);
    expect(onResizeTaskBoundary).toHaveBeenCalledWith(expect.objectContaining({
      occurrence: sharedOccurrence,
      serviceDate: "2026-08-17",
      boundaryDate: "2026-08-17",
      boundaryTime: "15:00",
      left: expect.objectContaining({ shift: earlyShift, segment: earlySegment, endTime: "15:00" }),
      right: expect.objectContaining({ shift: lateShift, segment: lateSegment, startTime: "15:00" }),
    }));
    expect(lane).toHaveAttribute("aria-busy", "true");
  });

  it("annuleert een actieve pointer-grensresize definitief bij Escape", async () => {
    const onResizeTaskBoundary = vi.fn();
    const sharedOccurrence = {
      ...occurrence,
      id: "occurrence-shared-boundary-cancel",
      window_start_time: "10:00",
      window_end_time: "18:00",
    };
    const earlyShift = { ...shift, id: "shift-early-cancel", source_type: "task", start_time: "10:00", end_time: "14:00" };
    const lateShift = { ...shift, id: "shift-late-cancel", source_type: "task", start_time: "14:00", end_time: "18:00" };
    const earlySegment = {
      id: "segment-early-cancel",
      shift_id: earlyShift.id,
      task_occurrence_id: sharedOccurrence.id,
      object_id: sharedOccurrence.object_id,
      start_date: sharedOccurrence.service_date,
      end_date: sharedOccurrence.end_date,
      start_time: "10:00",
      end_time: "14:00",
      status: "draft",
    };
    const lateSegment = {
      ...earlySegment,
      id: "segment-late-cancel",
      shift_id: lateShift.id,
      start_time: "14:00",
      end_time: "18:00",
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({
        occurrences: [sharedOccurrence],
        shifts: [earlyShift, lateShift],
        segments: [earlySegment, lateSegment],
        onResizeTaskBoundary,
      })} />,
    );
    const lane = container.querySelector('[data-task-coverage-lane="occurrence-shared-boundary-cancel"]');
    vi.spyOn(lane, "getBoundingClientRect").mockReturnValue({
      top: 0, bottom: 120, left: 0, right: 220, width: 220, height: 120, x: 0, y: 0,
      toJSON: () => ({}),
    });
    const handle = within(lane).getByRole("slider", { name: /grens tussen aansluitende diensten aanpassen/i });

    fireEvent.pointerDown(handle, { button: 0, clientY: 60 });
    fireEvent.pointerMove(window, { clientY: 75 });
    await waitFor(() => expect(lane.querySelector('[data-shift-id="shift-early-cancel"]'))
      .not.toHaveStyle({ height: "50%" }));
    fireEvent.keyDown(handle, { key: "Escape" });
    fireEvent.pointerUp(window, { clientY: 75 });

    expect(lane.querySelector('[data-shift-id="shift-early-cancel"]')).toHaveStyle({ height: "50%" });
    expect(onResizeTaskBoundary).not.toHaveBeenCalled();
  });

  it("blokkeert met pendingResourceKeys alleen de betrokken taaklane", () => {
    const busyShift = { ...shift, id: "shift-scoped-busy", source_type: "task", start_time: "08:00", end_time: "16:00" };
    const busySegment = {
      id: "segment-scoped-busy",
      shift_id: busyShift.id,
      task_occurrence_id: occurrence.id,
      object_id: occurrence.object_id,
      start_date: occurrence.service_date,
      end_date: occurrence.end_date,
      start_time: "08:00",
      end_time: "16:00",
      status: "draft",
    };
    const unrelatedOccurrence = {
      ...occurrence,
      id: "occurrence-unrelated-open",
      task_name_snapshot: "Losse ronde",
      window_start_time: "18:00",
      window_end_time: "19:00",
      required_minutes: 60,
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({
        occurrences: [occurrence, unrelatedOccurrence],
        shifts: [busyShift],
        segments: [busySegment],
        mutationPending: false,
        pendingResourceKeys: new Set([`shift:${busyShift.id}`]),
      })} />,
    );

    expect(container.querySelector(`[data-task-coverage-lane="${occurrence.id}"]`)).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Open dienst maken 18:00–19:00" })).toBeEnabled();
  });

  it("blokkeert bij een globale mutatie ook met een lege resource-set alle taakinteractie", () => {
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({
        occurrences: [occurrence],
        shifts: [],
        segments: [],
        mutationPending: true,
        pendingResourceKeys: new Set(),
      })} />,
    );

    expect(container.querySelector(`[data-task-occurrence-id="${occurrence.id}"]`)).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Open dienst maken 08:00–16:00" })).toBeDisabled();
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
      <PlanningBoard {...boardProps({
        shifts: [resizeShift],
        segments: [resizeSegment],
        onResizeTaskSegment,
      })} />,
    );

    const endHandle = screen.getByRole("slider", { name: /eindtijd van avonddienst aanpassen/i });
    fireEvent.keyDown(endHandle, { key: "ArrowUp" });
    expect(container.querySelector('[data-segment-id="segment-resize-blur"]')).toHaveTextContent("08:00–15:55");
    fireEvent.blur(endHandle);
    expect(container.querySelector('[data-segment-id="segment-resize-blur"]')).toHaveTextContent("08:00–16:00");
    expect(onResizeTaskSegment).not.toHaveBeenCalled();
  });

  it("houdt een resize zichtbaar tijdens opslaan en rolt hem terug wanneer opslaan mislukt", async () => {
    let rejectResize;
    const pendingResize = new Promise((resolve, reject) => {
      rejectResize = reject;
    });
    const onResizeTaskSegment = vi.fn(() => pendingResize);
    const resizeShift = { ...shift, id: "shift-resize-pending", source_type: "task", start_time: "08:00", end_time: "16:00" };
    const resizeSegment = {
      id: "segment-resize-pending",
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
      <PlanningBoard {...boardProps({
        shifts: [resizeShift],
        segments: [resizeSegment],
        onResizeTaskSegment,
      })} />,
    );

    const endHandle = screen.getByRole("slider", { name: /eindtijd van avonddienst aanpassen/i });
    fireEvent.keyDown(endHandle, { key: "ArrowUp" });
    fireEvent.keyDown(endHandle, { key: "Enter" });

    const timelineService = container.querySelector(`[data-shift-id="${resizeShift.id}"]`);
    expect(timelineService).toHaveTextContent("08:00–15:55");
    expect(timelineService).toHaveAttribute("data-resize-saving", "true");
    expect(endHandle).toBeDisabled();

    await act(async () => {
      rejectResize(new Error("Opslaan mislukt"));
      await pendingResize.catch(() => undefined);
    });

    await waitFor(() => {
      expect(timelineService).toHaveTextContent("08:00–16:00");
      expect(timelineService).toHaveAttribute("data-resize-saving", "false");
    });
    expect(screen.getByRole("slider", { name: /eindtijd van avonddienst aanpassen/i })).not.toBeDisabled();
  });

  it("laat iedere actieve medewerker van een meervoudig bezette inline dienst afzonderlijk vrijmaken", async () => {
    const onUnassign = vi.fn();
    const multiShift = {
      ...shift,
      id: "shift-inline-multiple-assignments",
      source_type: "task",
      start_time: "08:00",
      end_time: "16:00",
      required_count: 2,
    };
    const multiSegment = {
      id: "segment-inline-multiple-assignments",
      shift_id: multiShift.id,
      task_occurrence_id: occurrence.id,
      object_id: occurrence.object_id,
      start_date: occurrence.service_date,
      end_date: occurrence.end_date,
      start_time: "08:00",
      end_time: "16:00",
      status: "draft",
    };
    const annaAssignment = {
      ...assignment,
      id: "assignment-inline-anna",
      planning_shift_id: multiShift.id,
      slot_index: 0,
    };
    const borisAssignment = {
      ...assignment,
      id: "assignment-inline-boris",
      planning_shift_id: multiShift.id,
      personnel_id: "personnel-boris",
      personnel_name: "Boris Beveiliger",
      slot_index: 1,
    };
    const removedAssignment = {
      ...assignment,
      id: "assignment-inline-removed",
      planning_shift_id: multiShift.id,
      personnel_id: "personnel-removed",
      personnel_name: "Verwijderde medewerker",
      slot_index: 2,
      status: "removed",
    };
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({
        shifts: [multiShift],
        segments: [multiSegment],
        assignments: [annaAssignment, borisAssignment, removedAssignment],
        onUnassign,
      })} />,
    );

    const service = container.querySelector(`[data-shift-id="${multiShift.id}"]`);
    expect(container.querySelector(`[data-task-occurrence-id="${occurrence.id}"]`)).not.toBeInTheDocument();
    expect(service).toHaveTextContent("Anna Beveiliger");
    expect(service).toHaveTextContent("Boris Beveiliger");
    expect(service).toHaveTextContent("Bezetting 2/2");
    expect(within(service).queryByRole("button", { name: "Verwijderde medewerker vrijmaken" })).not.toBeInTheDocument();
    fireEvent.click(within(service).getByRole("button", { name: "Anna Beveiliger vrijmaken" }));
    expect(onUnassign).toHaveBeenNthCalledWith(1, multiShift, annaAssignment);

    fireEvent.click(within(service).getByRole("button", { name: "Boris Beveiliger vrijmaken" }));
    expect(onUnassign).toHaveBeenNthCalledWith(2, multiShift, borisAssignment);
  });

  it("toont objecten als vaste rijen links, dagen als kolommen boven en taakvoorkomens als dropzones", () => {
    const { container } = renderInDragContext(<PlanningBoard {...boardProps()} />);

    expect(screen.getByRole("table", { name: "Planning per object" })).toHaveAttribute("data-planning-layout", "cards");
    expect(screen.getByRole("rowheader", { name: /Object 1/i })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: /Object 2/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /17 aug/i })).toBeInTheDocument();
    expect(screen.getByText("Receptiedienst")).toBeInTheDocument();
    expect(container.querySelector('[data-droppable-id="occurrence-gap:occurrence-reception:2026-08-17:0480:0960"]')).toBeInTheDocument();

    const scrollContainer = screen.getByTestId("planning-matrix-scroll");
    expect(scrollContainer).toHaveClass("overflow-auto");
    expect(container.querySelectorAll(".overflow-auto")).toHaveLength(1);
    expect(screen.getByRole("columnheader", { name: /17 aug/i })).toHaveClass("sticky", "top-0");
    expect(screen.getByRole("rowheader", { name: /Object 1/i })).toHaveClass("sticky", "left-0");
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

  it("toont directe kaartrandgrepen zonder uitklapbare tijdeditor of afgedekte bronkaart", () => {
    const coveredShift = { ...shift, id: "shift-covered", name: "Geplande receptiedienst", source_type: "task", start_time: "08:00", end_time: "16:00" };
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

    const taskCard = container.querySelector(`[data-task-occurrence-id="${occurrence.id}"]`);
    const service = container.querySelector(`[data-shift-id="${coveredShift.id}"]`);
    const lane = container.querySelector(`[data-task-coverage-lane="${occurrence.id}"]`);
    expect(taskCard).not.toBeInTheDocument();
    expect(service).toBeInTheDocument();
    expect(service).toHaveAttribute("data-planning-width", "full");
    expect(service.querySelector('[data-service-time-rail="true"]')).not.toBeInTheDocument();
    expect(within(service).queryByRole("region", { name: /diensttijd aanpassen/i })).not.toBeInTheDocument();
    expect(within(service).queryByRole("button", { name: /tijd aanpassen/i })).not.toBeInTheDocument();
    expect(lane.querySelector('[data-service-resize-edge="start"]')).toBeInTheDocument();
    expect(lane.querySelector('[data-service-resize-edge="end"]')).toBeInTheDocument();
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

  it("toont geen directe randgrepen op een dienst die uit meerdere taaksegmenten bestaat", () => {
    const firstOccurrence = {
      ...occurrence,
      id: "occurrence-composite-first",
      window_start_time: "08:00",
      window_end_time: "12:00",
      required_minutes: 240,
    };
    const secondOccurrence = {
      ...occurrence,
      id: "occurrence-composite-second",
      object_id: "object-2",
      object_name_snapshot: "Object 2",
      window_start_time: "12:00",
      window_end_time: "16:00",
      required_minutes: 240,
    };
    const compositeShift = {
      ...shift,
      id: "shift-composite-no-direct-resize",
      name: "Samengestelde dagdienst",
      source_type: "task",
      start_time: "08:00",
      end_time: "16:00",
      object_id: null,
      object_ids: ["object-1", "object-2"],
    };
    const compositeSegments = [
      {
        id: "segment-composite-first",
        shift_id: compositeShift.id,
        task_occurrence_id: firstOccurrence.id,
        object_id: "object-1",
        start_date: "2026-08-17",
        end_date: "2026-08-17",
        start_time: "08:00",
        end_time: "12:00",
        status: "draft",
      },
      {
        id: "segment-composite-second",
        shift_id: compositeShift.id,
        task_occurrence_id: secondOccurrence.id,
        object_id: "object-2",
        start_date: "2026-08-17",
        end_date: "2026-08-17",
        start_time: "12:00",
        end_time: "16:00",
        status: "draft",
      },
    ];
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({
        shifts: [compositeShift],
        segments: compositeSegments,
        occurrences: [firstOccurrence, secondOccurrence],
      })} />,
    );

    const serviceProjections = [...container.querySelectorAll('[data-shift-id="shift-composite-no-direct-resize"]')];
    expect(serviceProjections).toHaveLength(2);
    expect(serviceProjections.every(service => (
      service.querySelector('[data-service-resize-edge]') === null
    ))).toBe(true);
    expect(screen.queryByRole("slider", { name: /samengestelde dagdienst aanpassen/i })).not.toBeInTheDocument();
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
    expect(mondayCell.querySelector('[data-droppable-id="occurrence-gap:occurrence-carry-in:2026-08-17:0000:0360"]')).toBeInTheDocument();
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

  it("opent geen taakgat opnieuw wanneer de dekkende dienst alleen visueel is uitgefilterd", () => {
    const coveredShift = { ...shift, id: "shift-filtered-covered", source_type: "task", start_time: "08:00", end_time: "16:00" };
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
    const { container } = renderInDragContext(
      <PlanningBoard {...boardProps({ shifts: [], coverageShifts: [coveredShift], segments: [coveredSegment] })} />,
    );

    const occurrenceCard = container.querySelector(`[data-task-occurrence-id="${occurrence.id}"]`);
    expect(occurrenceCard).not.toBeInTheDocument();
    expect(container.querySelector(`[data-shift-id="${coveredShift.id}"]`)).not.toBeInTheDocument();
    expect(container.querySelector(`[data-droppable-id^="occurrence-gap:${occurrence.id}:"]`)).not.toBeInTheDocument();
    expect(container.querySelector('[data-matrix-cell="object:object-1:2026-08-17"]')).toHaveTextContent("Geen planning");
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

    expect(screen.getByRole("rowheader", { name: /Snapshotlocatie West/i })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: /Snapshotlocatie Concept/i })).toBeInTheDocument();
    expect(screen.queryByRole("rowheader", { name: /Leeg gearchiveerd object/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("rowheader", { name: /Leeg conceptobject/i })).not.toBeInTheDocument();
    expect(container.querySelector('[data-droppable-id="occurrence-gap:occurrence-archived-object:2026-08-17:0480:0960"]')).toBeInTheDocument();
    expect(container.querySelector('[data-droppable-id="occurrence-gap:occurrence-concept-object:2026-08-17:0480:0960"]')).toBeInTheDocument();
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
      eligibilityStatus: "ready",
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

  it("vergrendelt een herstelende taak ook in de taakpool", () => {
    const onCreateShift = vi.fn();
    renderInDragContext(
      <PlanningTaskBacklog
        occurrences={[occurrence]}
        segments={[]}
        selectedShift={null}
        onCreateShift={onCreateShift}
        onAddToShift={vi.fn()}
        onEditShift={vi.fn()}
        onClearShift={vi.fn()}
        pendingResourceKeys={new Set([`occurrence:${occurrence.id}`])}
        enableTaskDrag
      />,
    );

    expect(screen.getByRole("button", { name: "Receptiedienst slepen" })).toBeDisabled();
    const createButton = screen.getByRole("button", { name: /nieuwe dienst/i });
    expect(createButton).toBeDisabled();
    fireEvent.click(createButton);
    expect(onCreateShift).not.toHaveBeenCalled();
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

  it("vergrendelt een betrokken medewerker in het zijpaneel tijdens herstel", () => {
    const candidate = {
      personnel: personnel[0],
      criticalCount: 0,
      warningCount: 0,
      scheduledMinutes: 0,
      contractMinutes: 2_400,
      warnings: [],
    };
    const onAssign = vi.fn();
    renderInDragContext(
      <PlanningSidePanel
        {...sidePanelProps({
          perspective: "object",
          employeeProps: {
            ...sidePanelProps().employeeProps,
            selectedShift: shift,
            candidates: [candidate],
            onAssign,
            pendingResourceKeys: new Set([`shift:${shift.id}`]),
          },
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Anna Beveiliger slepen" })).toBeDisabled();
    const assignButton = screen.getByRole("button", { name: /Anna Beveiliger inplannen op Avonddienst/i });
    expect(assignButton).toBeDisabled();
    fireEvent.click(assignButton);
    expect(onAssign).not.toHaveBeenCalled();
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

  it("biedt uitsluitend kaartweergave en geen handmatige transposebediening", () => {
    render(<PlanningToolbar {...toolbarProps()} />);

    expect(screen.queryByRole("button", { name: "Tijdlijn" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kaarten" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /matrixweergave wisselen/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Planningindeling" })).not.toBeInTheDocument();
  });
});
