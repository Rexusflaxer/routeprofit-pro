import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, prepare, revoke } = vi.hoisted(() => ({ invoke: vi.fn(), prepare: vi.fn(), revoke: vi.fn() }));
vi.mock("@/components/customers/customerDossierUtils", () => ({ invokeCustomerPlatformRead: invoke }));
vi.mock("@/lib/managedFiles", () => ({ prepareManagedFilePreview: prepare, revokeManagedFilePreview: revoke }));

import ObjectBuildingFloorPlanDialog from "@/components/objects/ObjectBuildingFloorPlanDialog";
import { buildingFloorPlanDrawing, getObjectBuildingFloorPlan, storedBuildingFloorPlanKeys } from "@/components/objects/objectBuildingFloorPlanWorkflow";

const scope = { customer_id: "customer-1", object_id: "object-1", building_selection_key: "bag:building-1" };
const building = { key: scope.building_selection_key, label: "Receptie" };
const plan = { id: "plan-1", object_id: scope.object_id, building_selection_key: building.key, revision: 2, status: "published", is_current: true, title: "Begane grond" };
const drawing = { unit: "m", rooms: [{ polygon: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }] }], walls: [{ start: { x: 0, y: 0 }, end: { x: 5, y: 0 } }], openings: [] };

function renderDialog(selected = building) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const onClose = vi.fn();
  const component = value => <QueryClientProvider client={client}><ObjectBuildingFloorPlanDialog customerId="customer-1" objectId="object-1" building={value} onClose={onClose} /></QueryClientProvider>;
  const view = render(component(selected));
  return { ...view, onClose, select: value => view.rerender(component(value)) };
}

describe("gebouwplattegronden", () => {
  beforeEach(() => {
    invoke.mockReset();
    prepare.mockReset();
    revoke.mockReset();
    invoke.mockResolvedValue({ ...scope, floor_plan: null });
  });

  it("laadt pas na openen en geeft de desktopmelding voor exact het gekozen gebouw", async () => {
    const view = renderDialog(null);
    expect(invoke).not.toHaveBeenCalled();
    view.select(building);
    expect(await screen.findByText("Voeg een plattegrond toe via de LOQ desktop app.")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith({ action: "get_object_building_floor_plan", ...scope });
    expect(prepare).not.toHaveBeenCalled();
  });

  it("toont een serverfout apart van een ontbrekende plattegrond en kan opnieuw laden", async () => {
    invoke.mockRejectedValueOnce(new Error("Toegang geweigerd"));
    renderDialog();
    expect(await screen.findByRole("alert")).toHaveTextContent("Toegang geweigerd");
    expect(screen.queryByText("Voeg een plattegrond toe via de LOQ desktop app.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opnieuw proberen" }));
    expect(await screen.findByText("Voeg een plattegrond toe via de LOQ desktop app.")).toBeInTheDocument();
  });

  it("opent de beheerde 2D-preview direct en ruimt deze op bij sluiten", async () => {
    const preview = { mimeType: "image/png", url: "blob:private-preview", blob: new Blob() };
    prepare.mockResolvedValue(preview);
    invoke.mockResolvedValue({ ...scope, floor_plan: { ...plan, preview_2d_file_id: "managed-preview", preview_2d_file_url: "https://unsafe.example/plan.png" } });
    const view = renderDialog();
    expect(await screen.findByRole("img", { name: "Plattegrond van Receptie" })).toHaveAttribute("src", preview.url);
    expect(prepare).toHaveBeenCalledWith({ managedFileId: "managed-preview", filename: "gebouwplattegrond-revisie-2.png" });
    expect(document.querySelector('[src^="https://unsafe.example"]')).toBeNull();
    view.select(null);
    expect(revoke).toHaveBeenCalledWith(preview);
  });

  it("verwerpt een vertraagde preview van het vorige gebouw en wist deze", async () => {
    let finish;
    prepare.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    invoke.mockResolvedValueOnce({ ...scope, floor_plan: { ...plan, preview_2d_file_id: "old-preview" } });
    const view = renderDialog();
    await waitFor(() => expect(prepare).toHaveBeenCalled());
    const next = { key: "point:building-2", label: "Magazijn" };
    invoke.mockResolvedValue({ ...scope, building_selection_key: next.key, floor_plan: null });
    view.select(next);
    expect(await screen.findByText("Voeg een plattegrond toe via de LOQ desktop app.")).toBeInTheDocument();
    const oldPreview = { mimeType: "image/png", url: "blob:old-building" };
    finish(oldPreview);
    await waitFor(() => expect(revoke).toHaveBeenCalledWith(oldPreview));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("toont bij een kapotte afbeelding de 2D-tekening met een herlaadactie", async () => {
    const preview = { mimeType: "image/png", url: "blob:invalid-image" };
    prepare.mockResolvedValue(preview);
    invoke.mockResolvedValue({ ...scope, floor_plan: { ...plan, preview_2d_file_id: "broken-preview", floorplan_2d_json: drawing } });
    renderDialog();
    fireEvent.error(await screen.findByRole("img", { name: "Plattegrond van Receptie" }));
    expect(screen.getByRole("alert")).toHaveTextContent("De opgeslagen 2D-tekening wordt getoond.");
    expect(screen.getByRole("img", { name: "Plattegrond van Receptie" }).tagName.toLowerCase()).toBe("svg");
    expect(screen.getByRole("button", { name: "Bestand opnieuw laden" })).toBeInTheDocument();
    expect(revoke).toHaveBeenCalledWith(preview);
  });

  it("tekent gepubliceerde lokale 2D-geometrie zonder bestand of editor", async () => {
    invoke.mockResolvedValue({ ...scope, floor_plan: { ...plan, floorplan_2d_json: drawing } });
    renderDialog();
    const svg = await screen.findByRole("img", { name: "Plattegrond van Receptie" });
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.querySelector("polygon")).not.toBeNull();
    expect(svg.querySelector("line")).not.toBeNull();
    // Match native RoomPlan's positive-up Y axis instead of mirroring the plan.
    expect(svg.querySelector("g")).toHaveAttribute("transform", "translate(0 4) scale(1 -1)");
    expect(prepare).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /bewerken|toevoegen/i })).not.toBeInTheDocument();
  });

  it("onderscheidt een gepubliceerde plattegrond zonder bruikbaar 2D-bestand", async () => {
    invoke.mockResolvedValue({ ...scope, floor_plan: { ...plan, floorplan_2d_json: { unit: "m", walls: [] } } });
    renderDialog();
    expect(await screen.findByText("De plattegrond kan nog niet worden weergegeven.")).toBeInTheDocument();
    expect(screen.queryByText("Nog geen plattegrond voor dit gebouw")).not.toBeInTheDocument();
  });

  it.each([
    { customer_id: "other" }, { object_id: "other" }, { building_selection_key: "bag:other" },
  ])("weigert een reactie buiten de aangevraagde scope %j", async mismatch => {
    invoke.mockResolvedValue({ ...scope, ...mismatch, floor_plan: plan });
    await expect(getObjectBuildingFloorPlan({ customerId: "customer-1", objectId: "object-1", buildingSelectionKey: building.key })).rejects.toThrow("gekozen gebouw");
  });

  it.each([
    { object_id: "other" }, { building_selection_key: null }, { status: "draft" }, { is_current: false }, { revision: 0 },
  ])("weigert een onjuiste planbinding of publicatie %j", async mismatch => {
    invoke.mockResolvedValue({ ...scope, floor_plan: { ...plan, ...mismatch } });
    await expect(getObjectBuildingFloorPlan({ customerId: "customer-1", objectId: "object-1", buildingSelectionKey: building.key })).rejects.toThrow("gecontroleerd");
  });

  it("gebruikt uitsluitend unieke stabiele opgeslagen handmatige gebouwkeys", () => {
    const configuration = { building_selection_mode: "manual", building_floor_plan_selection_keys: ["bag:b", "point:p", "manual:m", "bag:duplicate", "bag:duplicate"], selected_bag_feature_ids: ["b"], manual_building_geojson: { type: "FeatureCollection", features: [{ type: "Feature", properties: { local_id: "manual:1" }, geometry: { type: "Polygon", coordinates: [] } }] } };
    expect([...storedBuildingFloorPlanKeys(configuration)]).toEqual(["bag:b", "point:p", "manual:m"]);
    expect(storedBuildingFloorPlanKeys({ ...configuration, building_selection_mode: "automatic" }).size).toBe(0);
    expect(storedBuildingFloorPlanKeys({ ...configuration, building_floor_plan_selection_keys: undefined }).size).toBe(0);
  });

  it("verwerpt ongeldige/oneindige tekeningcoördinaten, lege vormen en onbekende eenheden", () => {
    expect(buildingFloorPlanDrawing({ ...drawing, unit: "pixels" })).toBeNull();
    expect(buildingFloorPlanDrawing({ unit: "m", rooms: [{ polygon: [{ x: 0, y: 0 }, { x: Infinity, y: 0 }, { x: 1, y: 1 }] }], walls: [{ start: { x: "1", y: 0 }, end: { x: 2, y: 1 } }] })).toBeNull();
    expect(buildingFloorPlanDrawing({ unit: "m", rooms: [{ polygon: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }] }] })).toBeNull();
    expect(buildingFloorPlanDrawing({ ...drawing, walls: [...drawing.walls, { start: { x: Infinity, y: 0 }, end: { x: 1, y: 1 } }] })).toBeNull();
    expect(buildingFloorPlanDrawing({ ...drawing, walls: Array(5001).fill(drawing.walls[0]) })).toBeNull();
  });
});
