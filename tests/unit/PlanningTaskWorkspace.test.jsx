import React from "react";
import { DragDropContext } from "@hello-pangea/dnd";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PlanningShiftComposer from "@/components/planning/PlanningShiftComposer";
import PlanningShiftCard from "@/components/planning/PlanningShiftCard";
import PlanningTaskBacklog from "@/components/planning/PlanningTaskBacklog";

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

describe("Planning taakwerkvoorraad", () => {
  it("toont een objecttaak en start alleen via een expliciete actie een nieuwe dienst", () => {
    const onCreateShift = vi.fn();
    render(
      <PlanningTaskBacklog
        occurrences={[occurrence]}
        segments={[]}
        selectedShift={null}
        onCreateShift={onCreateShift}
        onAddToShift={vi.fn()}
        onEditShift={vi.fn()}
      />,
    );

    expect(screen.getByText("Receptiedienst")).toBeInTheDocument();
    expect(screen.getByText("Nog niet gepland")).toBeInTheDocument();
    expect(onCreateShift).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /nieuwe dienst/i }));
    expect(onCreateShift).toHaveBeenCalledWith(occurrence);
  });

  it("biedt een gedeeltelijke taak expliciet aan de geselecteerde samengestelde dienst aan", () => {
    const onAddToShift = vi.fn();
    const partial = {
      id: "segment-first-half",
      shift_id: "shift-other",
      task_occurrence_id: occurrence.id,
      start_date: "2026-08-17",
      end_date: "2026-08-17",
      start_time: "08:00",
      end_time: "12:00",
      status: "draft",
    };
    render(
      <PlanningTaskBacklog
        occurrences={[occurrence]}
        segments={[partial]}
        selectedShift={{ id: "shift-selected", source_type: "task", service_date: "2026-08-17", name: "Avonddienst", start_time: "12:00", end_time: "16:00" }}
        onCreateShift={vi.fn()}
        onAddToShift={onAddToShift}
        onEditShift={vi.fn()}
      />,
    );

    expect(screen.getByText("4u resterend")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /aan deze dienst/i }));
    expect(onAddToShift).toHaveBeenCalledWith(occurrence);
  });

  it("laat de planner een gekozen doeldienst expliciet wissen", () => {
    const onClearShift = vi.fn();
    render(
      <PlanningTaskBacklog
        occurrences={[]}
        segments={[]}
        selectedShift={{ id: "shift-selected", source_type: "task", service_date: "2026-08-17", name: "Avonddienst", start_time: "12:00", end_time: "16:00" }}
        onCreateShift={vi.fn()}
        onAddToShift={vi.fn()}
        onEditShift={vi.fn()}
        onClearShift={onClearShift}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /doeldienst wissen/i }));
    expect(onClearShift).toHaveBeenCalledTimes(1);
  });
});

describe("Planning dienstcomposer", () => {
  it("vult het resterende taakvenster voor en bewaart pas na bevestiging", () => {
    const onSave = vi.fn();
    render(
      <PlanningShiftComposer
        open
        onOpenChange={vi.fn()}
        shift={null}
        initialOccurrence={occurrence}
        occurrences={[occurrence]}
        segments={[]}
        onSave={onSave}
        isPending={false}
      />,
    );

    expect(screen.getByRole("dialog", { name: /nieuwe dienst samenstellen/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Begin")).toHaveValue("08:00");
    expect(screen.getByLabelText("Einde")).toHaveValue("16:00");
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /conceptdienst opslaan/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      action: "compose_shift",
      idempotency_key: expect.any(String),
      expected_occurrence_revisions: { [occurrence.id]: 1 },
      segments: [expect.objectContaining({
        task_occurrence_id: occurrence.id,
        start_time: "08:00",
        end_time: "16:00",
      })],
    }));

    const firstKey = onSave.mock.calls[0][0].idempotency_key;
    fireEvent.click(screen.getByRole("button", { name: /conceptdienst opslaan/i }));
    expect(onSave.mock.calls[1][0].idempotency_key).toBe(firstKey);
  });

  it("toont exact welk taakdeel na een gesplitste dienst resteert", () => {
    render(
      <PlanningShiftComposer
        open
        onOpenChange={vi.fn()}
        shift={null}
        initialOccurrence={occurrence}
        occurrences={[occurrence]}
        segments={[]}
        onSave={vi.fn()}
        isPending={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("Einde"), { target: { value: "12:00" } });
    expect(screen.getByText("4u resterend")).toBeInTheDocument();
    expect(screen.getByText("Nog open: 12:00–16:00")).toBeInTheDocument();
  });

  it("blokkeert opslaan wanneer een segment buiten het taakvenster valt", () => {
    render(
      <PlanningShiftComposer
        open
        onOpenChange={vi.fn()}
        shift={null}
        initialOccurrence={occurrence}
        occurrences={[occurrence]}
        segments={[]}
        onSave={vi.fn()}
        isPending={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("Begin"), { target: { value: "07:00" } });
    expect(screen.getByText(/valt buiten het taakvenster 08:00–16:00/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Begin")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: /conceptdienst opslaan/i })).toBeDisabled();
  });

  it("blokkeert lokaal overlap met een taakdeel in een andere dienst", () => {
    const existing = {
      id: "segment-morning",
      shift_id: "shift-morning",
      task_occurrence_id: occurrence.id,
      start_date: occurrence.service_date,
      end_date: occurrence.service_date,
      start_time: "08:00",
      end_time: "12:00",
      status: "draft",
    };
    render(
      <PlanningShiftComposer
        open
        onOpenChange={vi.fn()}
        shift={null}
        initialOccurrence={occurrence}
        occurrences={[occurrence]}
        segments={[existing]}
        onSave={vi.fn()}
        isPending={false}
      />,
    );

    expect(screen.getByLabelText("Begin")).toHaveValue("12:00");
    fireEvent.change(screen.getByLabelText("Begin"), { target: { value: "11:00" } });
    expect(screen.getByText(/overlapt met een segment in een andere dienst/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /conceptdienst opslaan/i })).toBeDisabled();
  });
});

describe("Planning dienstkaart", () => {
  it("maakt opgeslagen compositiewaarschuwingen zichtbaar op de dienst", () => {
    render(
      <DragDropContext onDragEnd={vi.fn()}>
        <PlanningShiftCard
          shift={{
            id: "shift-composite",
            name: "Receptie en rondes",
            service_date: "2026-08-17",
            start_time: "15:30",
            end_time: "23:30",
            required_count: 1,
            status: "draft",
            service_context_snapshot: {
              composition_warnings: [{ code: "object_transition_review", message: "Controleer de reistijd." }],
            },
          }}
          assignments={[]}
          segments={[]}
          selected={false}
          onSelect={vi.fn()}
          onUnassign={vi.fn()}
          onMove={vi.fn()}
          onCopy={vi.fn()}
          onEditComposition={vi.fn()}
        />
      </DragDropContext>,
    );

    expect(screen.getByLabelText(/1 waarschuwingen, waarvan 1 dienstcontroles/i)).toBeInTheDocument();
    expect(screen.getByText("controle")).toBeInTheDocument();
  });
});
