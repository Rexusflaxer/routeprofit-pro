import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ObjectMapControls from "@/components/objects/ObjectMapControls";

const callbacks = {
  "Inzoomen": "onZoomIn",
  "Uitzoomen": "onZoomOut",
  "Noord boven": "onResetNorth",
  "Passend tonen": "onFitBounds",
  "Kaart linksom draaien": "onRotateLeft",
  "Kaart rechtsom draaien": "onRotateRight",
  "3D-kijkhoek vergroten": "onPitchUp",
  "3D-kijkhoek verkleinen": "onPitchDown",
};

describe("ObjectMapControls", () => {
  it("bundelt alle kaartacties in een uniforme compacte bediening zonder undo/redo-iconen", () => {
    const props = Object.fromEntries(Object.values(callbacks).map(name => [name, vi.fn()]));
    render(<ObjectMapControls ready {...props} />);
    const group = screen.getByRole("group", { name: "Kaartbediening" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons).toHaveLength(9);
    expect(new Set(buttons.map(button => button.className)).size).toBe(1);
    expect(group).toHaveClass("grid-cols-3", "bg-background/95", "text-foreground", "border-border/80");
    expect(group.querySelector(".lucide-rotate-ccw, .lucide-rotate-cw, .lucide-undo, .lucide-redo")).toBeNull();
    expect(group.querySelectorAll(".lucide-box")).toHaveLength(4);
    for (const [label, callback] of Object.entries(callbacks)) {
      const button = screen.getByRole("button", { name: label, exact: true });
      expect(button).toHaveAttribute("type", "button");
      expect(button).toHaveAttribute("title");
      fireEvent.click(button);
      expect(props[callback]).toHaveBeenCalledOnce();
    }
  });

  it("schakelt kaartacties uit tot de kaart geladen is", () => {
    const onToggleLighting = vi.fn();
    render(<ObjectMapControls onToggleLighting={onToggleLighting} />);
    screen.getAllByRole("button").forEach(button => expect(button).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Kaartverlichting", exact: true }));
    expect(onToggleLighting).not.toHaveBeenCalled();
  });

  it("houdt tijdens grondbewerking alleen de kijkhoek vast en laat de overige besturing bruikbaar", () => {
    render(<ObjectMapControls ready groundEditing />);
    expect(screen.getByRole("button", { name: "3D-kijkhoek vergroten" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "3D-kijkhoek verkleinen" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "3D-kijkhoek vergroten" })).toHaveAttribute("title", expect.stringContaining("nauwkeurigheid"));
    for (const label of ["Inzoomen", "Uitzoomen", "Noord boven", "Passend tonen", "Kaart linksom draaien", "Kaart rechtsom draaien", "Kaartverlichting"]) {
      expect(screen.getByRole("button", { name: label, exact: true })).not.toBeDisabled();
    }
  });

  it("wisselt verlichting met één klik zonder menu, App volgen-optie of globale themawijziging", () => {
    const onToggleLighting = vi.fn();
    const beforeClass = document.documentElement.className;
    render(<ObjectMapControls ready effectiveLightPreset="night" onToggleLighting={onToggleLighting} />);
    const trigger = screen.getByRole("button", { name: "Kaartverlichting", exact: true });
    fireEvent.click(trigger);
    expect(onToggleLighting).toHaveBeenCalledOnce();
    expect(trigger).not.toHaveAttribute("aria-haspopup");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();
    expect(screen.queryByText("App volgen")).not.toBeInTheDocument();
    expect(document.documentElement.className).toBe(beforeClass);
  });

  it.each([["day", "Dag", "nacht", "sun"], ["night", "Nacht", "dag", "moon"]])("toont huidige stand %s en de tegenovergestelde actie", (preset, current, next, icon) => {
    render(<ObjectMapControls ready effectiveLightPreset={preset} />);
    const trigger = screen.getByRole("button", { name: "Kaartverlichting", exact: true });
    const description = `${current}weergave actief · ${next}weergave inschakelen · alleen tijdelijk voor deze kaart`;
    expect(trigger).toHaveAttribute("title", description);
    expect(trigger).toHaveAttribute("aria-description", description);
    expect(trigger.querySelector(`.lucide-${icon}`)).not.toBeNull();
  });

  it("laat de ouder de hele bediening plaatsen zodat kaartattributie vrij blijft", () => {
    render(<ObjectMapControls ready className="absolute bottom-10 right-3" />);
    expect(screen.getByRole("group", { name: "Kaartbediening" })).toHaveClass("absolute", "bottom-10", "right-3");
  });
});
