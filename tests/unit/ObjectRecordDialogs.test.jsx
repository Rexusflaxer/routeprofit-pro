import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ObjectOperationsDialog, ObjectStatusDialog } from "@/components/objects/ObjectRecordDialogs";

const activeObject = {
  id: "object-1",
  name: "Hoofdkantoor",
  status: "active",
  geocoding_status: "verified",
  latitude: 52.37,
  longitude: 4.9,
  show_on_mobile_map: false,
  mobile_map_priority: 0,
};
const overlapError = Object.assign(new Error("Gebouw is al gekoppeld"), {
  status: 409,
  details: {
    code: "building_assignment_overlap_confirmation_required",
    conflict_fingerprint: "e".repeat(64),
    conflicts: [{ source_feature_id: "bag-1", objects: [{ object_id: "other-1", object_name: "Andere huurder" }] }],
  },
});

function renderOperationsDialog(object = activeObject, overrides = {}) {
  const props = {
    object,
    open: true,
    onOpenChange: vi.fn(),
    onSave: vi.fn(),
    saving: false,
    error: null,
    ...overrides,
  };

  render(<ObjectOperationsDialog {...props} />);
  return props;
}

describe("ObjectOperationsDialog", () => {
  it("rendert geen beperkte toegang-, alarm- of sleutelinformatie en stuurt die ook niet mee", () => {
    const props = renderOperationsDialog({
      ...activeObject,
      access_instruction: "GEHEIME-TOEGANG",
      alarm_instruction: "GEHEIME-ALARMCODE",
      key_instruction: "GEHEIME-SLEUTELLOCATIE",
    });

    expect(screen.queryByText("Beperkt toegankelijke informatie")).not.toBeInTheDocument();
    expect(screen.queryByText("Toegangsinformatie")).not.toBeInTheDocument();
    expect(screen.queryByText("Alarminformatie")).not.toBeInTheDocument();
    expect(screen.queryByText("Sleutelinformatie")).not.toBeInTheDocument();
    expect(screen.queryByText("GEHEIME-TOEGANG")).not.toBeInTheDocument();
    expect(screen.queryByText("GEHEIME-ALARMCODE")).not.toBeInTheDocument();
    expect(screen.queryByText("GEHEIME-SLEUTELLOCATIE")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    const saved = props.onSave.mock.calls[0][0];
    expect(saved).not.toHaveProperty("access_instruction");
    expect(saved).not.toHaveProperty("alarm_instruction");
    expect(saved).not.toHaveProperty("key_instruction");
  });

  it.each([
    ["conceptobject", { status: "concept", geocoding_status: "verified", latitude: 52.37, longitude: 4.9 }],
    ["ongeverifieerd object", { status: "active", geocoding_status: "unverified", latitude: 52.37, longitude: 4.9 }],
  ])("schakelt de mobiele kaart uit voor een %s", (_label, objectState) => {
    renderOperationsDialog({ ...activeObject, ...objectState, show_on_mobile_map: true });

    expect(screen.getByRole("switch", { name: "Zichtbaar op mobiele objectkaart" })).toBeDisabled();
  });

  it("maakt de kaartschakelaar beschikbaar voor een actief object met gecontroleerde coördinaten", () => {
    renderOperationsDialog({ ...activeObject, show_on_mobile_map: true });

    const mapSwitch = screen.getByRole("switch", { name: "Zichtbaar op mobiele objectkaart" });
    expect(mapSwitch).toBeEnabled();
    expect(mapSwitch).toBeChecked();
  });

  it.each([-1000, 1000])("accepteert kaartprioriteit %i", priority => {
    const props = renderOperationsDialog();
    const input = screen.getByRole("spinbutton", { name: "Kaartprioriteit" });

    expect(input).toHaveAttribute("min", "-1000");
    expect(input).toHaveAttribute("max", "1000");
    fireEvent.change(input, { target: { value: String(priority) } });
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));

    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({
      mobile_map_priority: String(priority),
    }));
  });

  it("toont na een overlapfout een verplichte reden en retryt mobiele kaartinschakeling", () => {
    const onSave = vi.fn();
    const baseProps = {
      object: activeObject,
      open: true,
      onOpenChange: vi.fn(),
      onSave,
      saving: false,
    };
    const { rerender } = render(<ObjectOperationsDialog {...baseProps} error={null} />);
    fireEvent.click(screen.getByRole("switch", { name: "Zichtbaar op mobiele objectkaart" }));
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ show_on_mobile_map: true }));

    rerender(<ObjectOperationsDialog {...baseProps} error={overlapError} />);
    expect(screen.getByText("Gedeeld gebouw bevestigen")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Bevestigen en opnieuw opslaan" });
    expect(retry).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reden voor gedeeld gebouw *"), { target: { value: "ab" } });
    expect(screen.getByText("Vul minimaal 3 tekens in.")).toBeInTheDocument();
    expect(retry).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reden voor gedeeld gebouw *"), { target: { value: "Gedeelde bedrijfshal" } });
    fireEvent.click(retry);

    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ show_on_mobile_map: true }),
      { confirmed: true, reason: "Gedeelde bedrijfshal", conflict_fingerprint: "e".repeat(64) },
    );
  });
});

describe("ObjectStatusDialog", () => {
  it("retryt activeren met dezelfde zichtbare overlapbevestiging", () => {
    const onConfirm = vi.fn();
    const baseProps = {
      object: { ...activeObject, status: "inactive" },
      targetStatus: "active",
      open: true,
      onOpenChange: vi.fn(),
      onConfirm,
      saving: false,
    };
    const { rerender } = render(<ObjectStatusDialog {...baseProps} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Bevestigen" }));
    expect(onConfirm).toHaveBeenLastCalledWith("");

    rerender(<ObjectStatusDialog {...baseProps} error={overlapError} />);
    expect(screen.getByText("Gedeeld gebouw bevestigen")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reden voor gedeeld gebouw *"), { target: { value: "Gedeeld verzamelgebouw" } });
    fireEvent.click(screen.getByRole("button", { name: "Bevestigen en opnieuw proberen" }));

    expect(onConfirm).toHaveBeenLastCalledWith("", {
      confirmed: true,
      reason: "Gedeeld verzamelgebouw",
      conflict_fingerprint: "e".repeat(64),
    });
  });

  it("laat een overlap zonder vingerafdruk alleen veilig opnieuw proberen", () => {
    const onSave = vi.fn();
    renderOperationsDialog(activeObject, {
      onSave,
      error: Object.assign(new Error("Bevestiging verouderd"), {
        status: 409,
        details: { code: "building_assignment_overlap_confirmation_required" },
      }),
    });

    expect(screen.getByText(/kon niet veilig worden voorbereid/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opnieuw proberen" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ show_on_mobile_map: false }));
  });

  it("wist de conflictvingerafdruk zodra de operationele configuratie verandert", () => {
    const onSave = vi.fn();
    renderOperationsDialog(activeObject, { onSave, error: overlapError });
    expect(screen.getByLabelText("Reden voor gedeeld gebouw *")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Kaartprioriteit" }), { target: { value: "12" } });

    expect(screen.queryByLabelText("Reden voor gedeeld gebouw *")).not.toBeInTheDocument();
    expect(screen.getByText(/kon niet veilig worden voorbereid/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opnieuw proberen" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ mobile_map_priority: "12" }));
  });
});
