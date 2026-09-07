import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const maps = vi.hoisted(() => []);

vi.mock("@/components/navigation/mapboxConfig", () => ({ MAPBOX_PUBLIC_TOKEN: "test-token" }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("@/components/objects/useObjectMapBuildingLabels", () => ({ default: () => null }));
vi.mock("mapbox-gl", () => {
  class FakeMap {
    constructor(options) {
      this.options = options;
      this.handlers = new Map();
      this.sources = new Map();
      this.layers = new Map();
      this.renderedFeatures = [];
      this.canvas = { style: {}, clientWidth: 800, clientHeight: 600, width: 800, height: 600 };
      this.dragPan = { enable: vi.fn(), disable: vi.fn() };
      this.doubleClickZoom = { enable: vi.fn(), disable: vi.fn() };
      maps.push(this);
    }
    on(event, layerOrHandler, handler) {
      if (typeof layerOrHandler !== "function") return this;
      this.handlers.set(event, [...(this.handlers.get(event) || []), handler || layerOrHandler]);
      return this;
    }
    emit(event) { this.handlers.get(event)?.forEach(handler => handler()); }
    addInteraction() {}
    addSource(id, definition) { this.sources.set(id, { ...definition, setData: vi.fn() }); }
    getSource(id) { return this.sources.get(id); }
    addLayer(definition) { this.layers.set(definition.id, definition); }
    getLayer(id) { return this.layers.get(id); }
    getSlot(id) { return this.layers.get(id)?.slot; }
    setSlot(id, slot) { this.layers.get(id).slot = slot; }
    setLayoutProperty() {}
    setPaintProperty() {}
    setConfigProperty() {}
    setFilter() {}
    getCanvas() { return this.canvas; }
    getPitch() { return 42; }
    getBearing() { return -12; }
    getZoom() { return 18.5; }
    project() { return { x: 400, y: 300 }; }
    fitBounds() {}
    resize() {}
    remove() {}
    queryRenderedFeatures = vi.fn(() => this.renderedFeatures);
    setFeatureState = vi.fn();
  }
  return { default: { Map: FakeMap } };
});

import ObjectMapCanvas from "@/components/objects/ObjectMapCanvas";

const empty = { type: "FeatureCollection", features: [] };
const savedPoint = { id: "saved-office", longitude: 6.0768135, latitude: 52.4494234 };
const nativeBuilding = {
  type: "Feature", id: 100,
  namespace: "standard-buildings",
  target: { featuresetId: "buildings", importId: "basemap" },
  properties: { group: "building-3d", height: 10 },
  geometry: { type: "Polygon", coordinates: [[[6.0767, 52.4493], [6.077, 52.4493], [6.077, 52.4496], [6.0767, 52.4496], [6.0767, 52.4493]]] },
};

function rectangularPart(id, west, east, south = 52.4493, north = 52.4496) {
  return { ...nativeBuilding, id, geometry: { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] } };
}

function queryParts(map, viewportParts, pointParts) {
  map.queryRenderedFeatures.mockImplementation((pointOrOptions, options) => options?.target
    ? pointParts
    : pointOrOptions?.target ? viewportParts : []);
}

async function renderSavedViewer() {
  let props = {
    object: { id: "object-1", longitude: 6.0768135, latitude: 52.4494234, geocoding_status: "verified" },
    candidates: [], selectedBagFeatureIds: [], selectedBuildings: empty, manualBuildings: empty,
    terrain: empty, buildingSelectionPoints: [savedPoint], buildingLabels: { "point:saved-office": "Kantoor" },
    drawingTarget: null, drawingPoints: [], editingTarget: null, disabled: true, viewOnly: true,
  };
  const rendered = render(<ObjectMapCanvas {...props} />);
  await waitFor(() => expect(maps).toHaveLength(1));
  maps[0].rerenderProps = overrides => {
    props = { ...props, ...overrides };
    rendered.rerender(<ObjectMapCanvas {...props} />);
  };
  return maps[0];
}

describe("ObjectMapCanvas native selectieherstel", () => {
  beforeEach(() => { maps.length = 0; });

  it("herstelt een opgeslagen no-BAG-selectie als de native feature pas na de eerste style.load beschikbaar komt", async () => {
    const map = await renderSavedViewer();
    act(() => map.emit("style.load"));
    expect(map.setFeatureState).not.toHaveBeenCalled();
    map.renderedFeatures = [nativeBuilding];
    act(() => map.emit("idle"));
    expect(map.setFeatureState).toHaveBeenCalledExactlyOnceWith(nativeBuilding, { select: true });
    act(() => map.emit("idle"));
    expect(map.setFeatureState).toHaveBeenCalledOnce();
  });

  it("probeert een tijdelijk geweigerde native selectiestatus opnieuw voordat herstel als voltooid geldt", async () => {
    const map = await renderSavedViewer();
    map.renderedFeatures = [nativeBuilding];
    let acceptsWrites = false;
    map.setFeatureState.mockImplementation(() => { if (!acceptsWrites) throw new Error("Style is not done loading"); });
    act(() => map.emit("style.load"));
    const failedAttempts = map.setFeatureState.mock.calls.length;
    expect(failedAttempts).toBeGreaterThan(0);
    acceptsWrites = true;
    act(() => map.emit("idle"));
    expect(map.setFeatureState).toHaveBeenCalledTimes(failedAttempts + 1);
    expect(map.setFeatureState).toHaveBeenLastCalledWith(nativeBuilding, { select: true });
    act(() => map.emit("idle"));
    expect(map.setFeatureState).toHaveBeenCalledTimes(failedAttempts + 1);
  });

  it("probeert een tijdelijk geweigerde deselectie opnieuw en stopt na de eerste geslaagde write", async () => {
    const map = await renderSavedViewer();
    map.renderedFeatures = [nativeBuilding];
    act(() => map.emit("style.load"));
    expect(map.setFeatureState).toHaveBeenCalledWith(nativeBuilding, { select: true });
    map.setFeatureState.mockClear();
    let acceptsWrites = false;
    map.setFeatureState.mockImplementation(() => { if (!acceptsWrites) throw new Error("Temporarily unavailable"); });
    map.rerenderProps({ buildingSelectionPoints: [] });
    const failedAttempts = map.setFeatureState.mock.calls.length;
    expect(failedAttempts).toBeGreaterThan(0);
    expect(map.setFeatureState).toHaveBeenLastCalledWith(nativeBuilding, { select: false });
    acceptsWrites = true;
    act(() => map.emit("idle"));
    expect(map.setFeatureState).toHaveBeenCalledTimes(failedAttempts + 1);
    expect(map.setFeatureState).toHaveBeenLastCalledWith(nativeBuilding, { select: false });
    act(() => map.emit("idle"));
    expect(map.setFeatureState).toHaveBeenCalledTimes(failedAttempts + 1);
  });

  it.each([true, false])("herstelt een geweigerde lijsthighlight-overgang naar %s zonder blijvende idle-writes", async highlighted => {
    const map = await renderSavedViewer();
    map.renderedFeatures = [nativeBuilding];
    act(() => map.emit("style.load"));
    if (!highlighted) map.rerenderProps({ highlightedBuildingKey: "point:saved-office" });
    map.setFeatureState.mockClear();
    let acceptsWrites = false;
    map.setFeatureState.mockImplementation(() => { if (!acceptsWrites) throw new Error("Temporarily unavailable"); });
    map.rerenderProps({ highlightedBuildingKey: highlighted ? "point:saved-office" : null });
    const failedAttempts = map.setFeatureState.mock.calls.length;
    expect(failedAttempts).toBeGreaterThan(0);
    const expectedState = { select: !highlighted, highlight: highlighted };
    expect(map.setFeatureState).toHaveBeenLastCalledWith(nativeBuilding, expectedState);
    acceptsWrites = true;
    act(() => map.emit("idle"));
    expect(map.setFeatureState).toHaveBeenCalledTimes(failedAttempts + 1);
    expect(map.setFeatureState).toHaveBeenLastCalledWith(nativeBuilding, expectedState);
    act(() => map.emit("idle"));
    expect(map.setFeatureState).toHaveBeenCalledTimes(failedAttempts + 1);
  });

  it("herstelt een opgeslagen punt wanneer de viewport-query alleen de andere geknipte gebouwvleugel teruggeeft", async () => {
    const map = await renderSavedViewer();
    const east = rectangularPart(100, 6.0769, 6.0771);
    const west = rectangularPart(100, 6.0767, 6.0769);
    // Standard deduplicates featureset results by native ID/layer before the
    // app sees them. A point query can recover the omitted clicked tile part.
    queryParts(map, [east], [west]);
    act(() => map.emit("style.load"));
    expect(map.queryRenderedFeatures.mock.calls.some(([, options]) => options?.target?.featuresetId === "buildings")).toBe(true);
    expect(map.setFeatureState).toHaveBeenCalledWith(expect.objectContaining({ id: 100 }), { select: true });
    map.setFeatureState.mockClear();
    act(() => map.emit("idle"));
    expect(map.setFeatureState).not.toHaveBeenCalled();
  });

  it("kleurt geen nabij dak uit de puntquery wanneer het opgeslagen grondpunt daar niet strikt binnen ligt", async () => {
    const map = await renderSavedViewer();
    const east = rectangularPart(100, 6.0769, 6.0771);
    const neighboringRoof = rectangularPart(200, 6.07682, 6.07689);
    queryParts(map, [east], [neighboringRoof]);
    act(() => map.emit("style.load"));
    act(() => map.emit("idle"));
    expect(map.setFeatureState.mock.calls.some(([, state]) => state.select)).toBe(false);
  });

  it("voegt verschillende native identiteiten niet samen alleen omdat de puntquery een aangrenzende vleugel vindt", async () => {
    const map = await renderSavedViewer();
    const east = rectangularPart(100, 6.0769, 6.0771);
    const separateWestBuilding = rectangularPart(200, 6.0767, 6.0769);
    queryParts(map, [east], [separateWestBuilding]);
    act(() => map.emit("style.load"));
    expect(map.setFeatureState).toHaveBeenCalledWith(expect.objectContaining({ id: 200 }), { select: true });
    expect(map.setFeatureState).not.toHaveBeenCalledWith(expect.objectContaining({ id: 100 }), expect.objectContaining({ select: true }));
  });

  it("kiest geen willekeurig gebouw als de puntquery een echt andere overlappende identiteit oplevert", async () => {
    const map = await renderSavedViewer();
    const east = rectangularPart(100, 6.0769, 6.0771);
    const overlapping = rectangularPart(200, 6.07675, 6.0769, 52.44935, 52.4495);
    queryParts(map, [east], [nativeBuilding, overlapping]);
    act(() => map.emit("style.load"));
    expect(map.setFeatureState.mock.calls.some(([, state]) => state.select)).toBe(false);
  });
});
