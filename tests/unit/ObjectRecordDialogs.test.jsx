import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ObjectOperationsDialog } from "@/components/objects/ObjectRecordDialogs";

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
});
