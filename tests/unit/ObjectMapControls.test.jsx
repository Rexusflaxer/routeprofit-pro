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
    render(<ObjectMapControls />);
    screen.getAllByRole("button").forEach(button => expect(button).toBeDisabled());
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

  it("laat expliciet App volgen, Dag en Nacht kiezen zonder het globale thema te veranderen", async () => {
    const onLightingModeChange = vi.fn();
    const beforeClass = document.documentElement.className;
    render(<ObjectMapControls ready lightingMode="app" effectiveLightPreset="night" onLightingModeChange={onLightingModeChange} />);
    const trigger = screen.getByRole("button", { name: "Kaartverlichting", exact: true });
    expect(trigger).toHaveAttribute("title", "Kaartverlichting: App volgen · nacht");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const app = await screen.findByRole("menuitemradio", { name: "App volgen", exact: true });
    expect(app).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Dag", exact: true })).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Nacht", exact: true }));
    expect(onLightingModeChange).toHaveBeenCalledExactlyOnceWith("night");
    expect(document.documentElement.className).toBe(beforeClass);
  });

  it.each([["day", "Dag", "day", "dag"], ["night", "Nacht", "night", "nacht"]])("toont de expliciete kaartverlichting %s als gekozen optie", async (mode, label, preset, effectiveLabel) => {
    render(<ObjectMapControls ready lightingMode={mode} effectiveLightPreset={preset} />);
    const trigger = screen.getByRole("button", { name: "Kaartverlichting", exact: true });
    expect(trigger).toHaveAttribute("title", `Kaartverlichting: ${label} · ${effectiveLabel}`);
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(await screen.findByRole("menuitemradio", { name: label, exact: true })).toHaveAttribute("aria-checked", "true");
  });

  it("laat de ouder de hele bediening plaatsen zodat kaartattributie vrij blijft", () => {
    render(<ObjectMapControls ready className="absolute bottom-10 right-3" />);
    expect(screen.getByRole("group", { name: "Kaartbediening" })).toHaveClass("absolute", "bottom-10", "right-3");
  });
});
