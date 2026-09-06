import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mapboxState = vi.hoisted(() => ({ instances: [] }));

vi.mock("@/components/navigation/mapboxConfig", () => ({ MAPBOX_PUBLIC_TOKEN: "test-mapbox-token" }));
vi.mock("mapbox-gl", () => {
  class FakeMap {
    constructor() {
      this.handlers = new globalThis.Map();
      this.sources = new globalThis.Map();
      this.layers = new globalThis.Map();
      this.canvas = { style: {} };
      this.dragRotate = { disable: vi.fn() };
      this.touchZoomRotate = { disableRotation: vi.fn() };
      this.dragPan = { disable: vi.fn(), enable: vi.fn() };
      mapboxState.instances.push(this);
    }

    on(eventName, layerOrHandler, maybeHandler) {
      const layer = typeof layerOrHandler === "string" ? layerOrHandler : null;
      const handler = layer ? maybeHandler : layerOrHandler;
      const key = layer ? `${eventName}:${layer}` : eventName;
      this.handlers.set(key, [...(this.handlers.get(key) || []), handler]);
      return this;
    }

    emit(eventName, event = {}) {
      (this.handlers.get(eventName) || []).forEach(handler => handler(event));
    }

    emitLayer(eventName, layer, event = {}) {
      (this.handlers.get(`${eventName}:${layer}`) || []).forEach(handler => handler(event));
    }

    addControl() {}
    addSource(id, definition) { this.sources.set(id, { ...definition, setData: vi.fn() }); }
    getSource(id) { return this.sources.get(id); }
    addLayer(definition) { this.layers.set(definition.id, definition); }
    getLayer(id) { return this.layers.get(id); }
    setFilter() {}
    getCanvas() { return this.canvas; }
    fitBounds() {}
    easeTo() {}
    resize() {}
    remove() {}
  }

  return {
    default: {
      accessToken: "",
      Map: FakeMap,
      NavigationControl: class NavigationControl {},
    },
  };
});

import ObjectMapCanvas from "@/components/objects/ObjectMapCanvas";

const empty = { type: "FeatureCollection", features: [] };
const candidate = {
  type: "Feature",
  id: "bag-1",
  properties: { source: "pdok_bag", source_feature_id: "bag-1", conflict_count: 0 },
  geometry: { type: "Polygon", coordinates: [[[4.48, 51.92], [4.481, 51.92], [4.481, 51.921], [4.48, 51.92]]] },
};

function renderCanvas(overrides = {}) {
  const props = {
    object: { id: "object-1", name: "Testobject", longitude: 4.48, latitude: 51.92 },
    candidates: [candidate],
    selectedBagFeatureIds: ["bag-1"],
    selectedBuildings: { type: "FeatureCollection", features: [candidate] },
    manualBuildings: empty,
    terrain: empty,
    drawingTarget: null,
    drawingPoints: [],
    editingTarget: null,
    disabled: false,
    focusNonce: 0,
    onToggleCandidate: vi.fn(),
    onAddDrawingPoint: vi.fn(),
    onVertexDragStart: vi.fn(),
    onMoveVertex: vi.fn(),
    onVertexDragEnd: vi.fn(),
    ...overrides,
  };
  return { ...render(<ObjectMapCanvas {...props} />), props };
}

describe("ObjectMapCanvas", () => {
  beforeEach(() => {
    mapboxState.instances.length = 0;
  });

  it("wist een tijdelijke Mapbox-fout zodra de kaartstijl en LOQ-lagen laden", async () => {
    renderCanvas();
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];

    act(() => map.emit("error", { error: new Error("Tijdelijke stijlfout") }));
    expect(screen.getByText("Tijdelijke stijlfout")).toBeInTheDocument();
    act(() => map.emit("style.load"));

    await waitFor(() => expect(screen.queryByText("Tijdelijke stijlfout")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Passend tonen" })).not.toBeDisabled();
  });

  it("verwerkt dezelfde kaartklik maar eenmaal als kandidaat en selectie overlappen", async () => {
    const { props } = renderCanvas();
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    act(() => map.emit("style.load"));
    const originalEvent = {};
    const event = { originalEvent, features: [candidate] };

    act(() => {
      map.emitLayer("click", "loq-object-map-candidates-fill", event);
      map.emitLayer("click", "loq-object-map-selected-fill", event);
      map.emit("click", { ...event, lngLat: { lng: 4.48, lat: 51.92 } });
    });

    expect(props.onToggleCandidate).toHaveBeenCalledOnce();
    expect(props.onAddDrawingPoint).not.toHaveBeenCalled();
  });
});
