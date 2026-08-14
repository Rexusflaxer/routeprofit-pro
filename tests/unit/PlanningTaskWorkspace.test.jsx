import React from "react";
import { DragDropContext } from "@hello-pangea/dnd";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("blokkeert toevoegen aan een geselecteerde dienst zolang die wordt hersteld", () => {
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
    const selectedShift = {
      id: "shift-selected",
      source_type: "task",
      service_date: "2026-08-17",
      name: "Avonddienst",
      start_time: "12:00",
      end_time: "16:00",
    };
    render(
      <PlanningTaskBacklog
        occurrences={[occurrence]}
        segments={[partial]}
        selectedShift={selectedShift}
        pendingResourceKeys={new Set([`shift:${selectedShift.id}`])}
        onCreateShift={vi.fn()}
        onAddToShift={onAddToShift}
        onEditShift={vi.fn()}
      />,
    );

    const addButton = screen.getByRole("button", { name: /aan deze dienst/i });
    expect(addButton).toBeDisabled();
    fireEvent.click(addButton);
    expect(onAddToShift).not.toHaveBeenCalled();
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

  it("houdt een volledig ingeplande taak met gewijzigde bron zichtbaar en dwingt dienstbewerking af", () => {
    const onEditShift = vi.fn();
    const shift = {
      id: "shift-reception",
      source_type: "task",
      service_date: occurrence.service_date,
      name: "Receptiedienst",
      start_time: "08:00",
      end_time: "16:00",
      required_count: 1,
      status: "draft",
    };
    const segment = {
      id: "segment-reception",
      shift_id: shift.id,
      task_occurrence_id: "occurrence-reception-old",
      start_date: occurrence.service_date,
      end_date: occurrence.service_date,
      start_time: "08:00",
      end_time: "16:00",
      status: "draft",
    };
    render(
      <PlanningTaskBacklog
        occurrences={[occurrence]}
        segments={[segment]}
        shifts={[shift]}
        assignments={[{ id: "assignment-1", shift_id: shift.id, status: "draft" }]}
        sourceChanges={[{
          id: "source-change-1",
          status: "open",
          task_occurrence_id: "occurrence-reception-old",
          source_task_occurrence_id: "occurrence-reception-old",
          replacement_task_occurrence_id: occurrence.id,
          shift_ids: [shift.id],
          service_date: occurrence.service_date,
          effective_from: occurrence.service_date,
          previous_snapshot: { start_time: "08:00", end_time: "16:00" },
          desired_snapshot: { start_time: "10:00", end_time: "18:00" },
        }]}
        selectedShift={null}
        onCreateShift={vi.fn()}
        onAddToShift={vi.fn()}
        onEditShift={onEditShift}
      />,
    );

    expect(screen.getByText("Bron gewijzigd")).toBeInTheDocument();
    expect(screen.getByText(/08:00–16:00 → 10:00–18:00/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nieuwe dienst/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /dienst aanpassen/i }));
    expect(onEditShift).toHaveBeenCalledWith(shift);
  });
});

describe("Planning dienstcomposer", () => {
  it("vult het resterende taakvenster voor en bewaart een key alleen voor exact dezelfde retry", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("response verloren"));
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
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      action: "compose_shift",
      idempotency_key: expect.any(String),
      expected_occurrence_revisions: { [occurrence.id]: 1 },
      segments: [expect.objectContaining({
        task_occurrence_id: occurrence.id,
        start_time: "08:00",
        end_time: "16:00",
      })],
    })));

    const firstKey = onSave.mock.calls[0][0].idempotency_key;
    fireEvent.click(screen.getByRole("button", { name: /conceptdienst opslaan/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0].idempotency_key).toBe(firstKey);

    fireEvent.change(screen.getByLabelText("Einde"), { target: { value: "15:00" } });
    fireEvent.click(screen.getByRole("button", { name: /conceptdienst opslaan/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(3));
    expect(onSave.mock.calls[2][0].idempotency_key).not.toBe(firstKey);
  });

  it("wist de composer-intent na een bevestigde succesvolle save", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
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

    fireEvent.click(screen.getByRole("button", { name: /conceptdienst opslaan/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const completedKey = onSave.mock.calls[0][0].idempotency_key;

    fireEvent.click(screen.getByRole("button", { name: /conceptdienst opslaan/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0].idempotency_key).not.toBe(completedKey);
  });

  it("blokkeert een vervangen taaksegment totdat de planner het verwijdert en de actieve vervanger toevoegt", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    const supersededOccurrence = {
      ...occurrence,
      id: "occurrence-reception-old",
      revision: 2,
      lifecycle_status: "superseded",
      superseded_by_occurrence_id: "occurrence-reception-current",
      window_start_time: "08:00",
      window_end_time: "16:00",
    };
    const replacementOccurrence = {
      ...occurrence,
      id: "occurrence-reception-current",
      revision: 1,
      lifecycle_status: "active",
      supersedes_task_occurrence_id: supersededOccurrence.id,
      window_start_time: "10:00",
      window_end_time: "18:00",
    };
    const existingShift = {
      id: "shift-reception-source-change",
      name: "Receptiedienst",
      service_date: occurrence.service_date,
      start_time: "08:00",
      end_time: "16:00",
      required_count: 1,
      revision: 4,
      status: "draft",
    };
    const oldSegment = {
      id: "segment-reception-old",
      shift_id: existingShift.id,
      task_occurrence_id: supersededOccurrence.id,
      start_date: occurrence.service_date,
      end_date: occurrence.service_date,
      start_time: "08:00",
      end_time: "16:00",
      status: "draft",
      task_name_snapshot: occurrence.task_name_snapshot,
      object_name_snapshot: occurrence.object_name_snapshot,
      execution_mode: "continuous",
    };

    render(
      <PlanningShiftComposer
        open
        onOpenChange={vi.fn()}
        shift={existingShift}
        initialOccurrence={null}
        occurrences={[supersededOccurrence, replacementOccurrence]}
        segments={[oldSegment]}
        shifts={[existingShift]}
        onSave={onSave}
        isPending={false}
      />,
    );

    expect(screen.getByText(/de objecttaak is gewijzigd/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Begin")).toHaveValue("08:00");
    expect(screen.getByLabelText("Begin")).toBeDisabled();
    expect(screen.getByLabelText("Einde")).toBeDisabled();
    expect(screen.getByText(/oude taakuitvoering is vervangen/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /conceptdienst opslaan/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Taaksegment verwijderen" }));
    fireEvent.change(screen.getByLabelText(/taak toevoegen vanaf/i), {
      target: { value: replacementOccurrence.id },
    });
    fireEvent.click(screen.getByRole("button", { name: /toevoegen/i }));

    expect(screen.getByLabelText("Begin")).toHaveValue("10:00");
    expect(screen.getByLabelText("Einde")).toHaveValue("18:00");
    expect(screen.getByLabelText("Begin")).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /conceptdienst opslaan/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /conceptdienst opslaan/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      action: "update_shift_composition",
      shift_id: existingShift.id,
      expected_shift_revision: 4,
      expected_occurrence_revisions: {
        [supersededOccurrence.id]: 2,
        [replacementOccurrence.id]: 1,
      },
      segments: [expect.objectContaining({
        task_occurrence_id: replacementOccurrence.id,
        start_time: "10:00",
        end_time: "18:00",
      })],
    })));
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

  it("voegt een chronologisch aansluitende taak van de volgende dag aan dezelfde dienst toe", () => {
    const onSave = vi.fn();
    const overnightOccurrence = {
      ...occurrence,
      id: "occurrence-overnight",
      service_date: "2026-08-17",
      end_date: "2026-08-18",
      window_start_time: "22:00",
      window_end_time: "02:00",
      required_minutes: 240,
      task_name_snapshot: "Nachtbalie",
    };
    const nextOccurrence = {
      ...occurrence,
      id: "occurrence-next-day",
      service_date: "2026-08-18",
      end_date: "2026-08-18",
      window_start_time: "02:00",
      window_end_time: "04:00",
      required_minutes: 120,
      task_name_snapshot: "Openingsronde",
    };
    render(
      <PlanningShiftComposer
        open
        onOpenChange={vi.fn()}
        shift={null}
        initialOccurrence={overnightOccurrence}
        occurrences={[overnightOccurrence, nextOccurrence]}
        segments={[]}
        shifts={[]}
        onSave={onSave}
        isPending={false}
      />,
    );

    fireEvent.change(screen.getByLabelText(/taak toevoegen vanaf/i), { target: { value: nextOccurrence.id } });
    fireEvent.click(screen.getByRole("button", { name: /toevoegen/i }));
    expect(screen.getAllByLabelText("Begin").map(input => input.value)).toEqual(["22:00", "02:00"]);
    expect(screen.getAllByLabelText("Einde").map(input => input.value)).toEqual(["02:00", "04:00"]);

    fireEvent.click(screen.getByRole("button", { name: /conceptdienst opslaan/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      segments: [
        expect.objectContaining({ task_occurrence_id: overnightOccurrence.id, start_date: "2026-08-17", end_date: "2026-08-18" }),
        expect.objectContaining({ task_occurrence_id: nextOccurrence.id, start_date: "2026-08-18", end_date: "2026-08-18" }),
      ],
    }));
  });

  it("stuurt bij het verwijderen van een bestaand taaksegment ook de revisie van die vrijgegeven klanttaak mee", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    const closingOccurrence = {
      ...occurrence,
      id: "occurrence-closing",
      revision: 3,
      window_start_time: "16:00",
      window_end_time: "17:00",
      required_minutes: 60,
      task_name_snapshot: "Sluitronde",
    };
    const existingShift = {
      id: "shift-existing-composite",
      name: "Receptie en sluitronde",
      service_date: occurrence.service_date,
      start_time: "08:00",
      end_time: "17:00",
      required_count: 1,
      revision: 7,
    };
    const storedSegments = [
      {
        id: "segment-existing-reception",
        shift_id: existingShift.id,
        task_occurrence_id: occurrence.id,
        start_date: occurrence.service_date,
        end_date: occurrence.service_date,
        start_time: "08:00",
        end_time: "16:00",
        status: "draft",
        task_name_snapshot: occurrence.task_name_snapshot,
      },
      {
        id: "segment-existing-closing",
        shift_id: existingShift.id,
        task_occurrence_id: closingOccurrence.id,
        start_date: closingOccurrence.service_date,
        end_date: closingOccurrence.service_date,
        start_time: "16:00",
        end_time: "17:00",
        status: "draft",
        task_name_snapshot: closingOccurrence.task_name_snapshot,
      },
    ];
    render(
      <PlanningShiftComposer
        open
        onOpenChange={vi.fn()}
        shift={existingShift}
        initialOccurrence={null}
        occurrences={[occurrence, closingOccurrence]}
        segments={storedSegments}
        shifts={[existingShift]}
        onSave={onSave}
        isPending={false}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Taaksegment verwijderen" })[1]);
    fireEvent.click(screen.getByRole("button", { name: /conceptdienst opslaan/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      action: "update_shift_composition",
      shift_id: existingShift.id,
      expected_shift_revision: 7,
      expected_occurrence_revisions: {
        [occurrence.id]: 1,
        [closingOccurrence.id]: 3,
      },
      segments: [expect.objectContaining({ task_occurrence_id: occurrence.id })],
    })));
  });

  it.each([
    ["geannuleerde", [{ id: "shift-stale", status: "cancelled" }]],
    ["ontbrekende", []],
  ])("laat een segment uit een %s dienst de taak niet blokkeren", (_label, shifts) => {
    const staleSegment = {
      id: "segment-stale",
      shift_id: "shift-stale",
      task_occurrence_id: occurrence.id,
      start_date: occurrence.service_date,
      end_date: occurrence.end_date,
      start_time: "08:00",
      end_time: "16:00",
      status: "draft",
    };
    render(
      <PlanningShiftComposer
        open
        onOpenChange={vi.fn()}
        shift={null}
        initialOccurrence={occurrence}
        occurrences={[occurrence]}
        segments={[staleSegment]}
        shifts={shifts}
        onSave={vi.fn()}
        isPending={false}
      />,
    );

    expect(screen.getByLabelText("Begin")).toHaveValue("08:00");
    expect(screen.getByLabelText("Einde")).toHaveValue("16:00");
    expect(screen.getByRole("button", { name: /conceptdienst opslaan/i })).toBeEnabled();
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
