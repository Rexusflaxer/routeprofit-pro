import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mapboxState = vi.hoisted(() => ({ instances: [] }));

vi.mock("@/components/navigation/mapboxConfig", () => ({ MAPBOX_PUBLIC_TOKEN: "test-mapbox-token" }));
vi.mock("mapbox-gl", () => {
  class FakeMap {
    constructor(options) {
      this.options = options;
      this.handlers = new globalThis.Map();
      this.interactions = new globalThis.Map();
      this.sources = new globalThis.Map();
      this.layers = new globalThis.Map();
      this.renderedFeatures = [];
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

    emitInteraction(id, event = {}) {
      return this.interactions.get(id)?.handler(event);
    }

    addControl() {}
    addInteraction(id, interaction) { this.interactions.set(id, interaction); return this; }
    addSource(id, definition) { this.sources.set(id, { ...definition, setData: vi.fn() }); }
    getSource(id) { return this.sources.get(id); }
    addLayer(definition) { this.layers.set(definition.id, definition); }
    getLayer(id) { return this.layers.get(id); }
    setFilter() {}
    queryRenderedFeatures = vi.fn(() => this.renderedFeatures);
    setFeatureState = vi.fn();
    getCanvas() { return this.canvas; }
    fitBounds() {}
    easeTo() {}
    resize() {}
    remove = vi.fn();
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
const standardBuilding = {
  type: "Feature",
  id: 991,
  namespace: "standard-buildings",
  target: { featuresetId: "buildings", importId: "basemap" },
  properties: { height: 8 },
  geometry: candidate.geometry,
};

function renderCanvas(overrides = {}) {
  const props = {
    object: { id: "object-1", name: "Testobject", longitude: 4.48, latitude: 51.92, geocoding_status: "verified" },
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
    expect(map.options.config.basemap).toMatchObject({
      colorBuildingSelect: "#1f7aff",
      show3dBuildings: true,
      show3dFacades: true,
      show3dLandmarks: false,
    });
    expect(map.interactions.get("loq-object-map-standard-building-click")?.target).toEqual({ featuresetId: "buildings", importId: "basemap" });
    expect(map.layers.get("loq-object-map-candidates-fill")?.paint["fill-opacity"]).toEqual(["case", ["==", ["get", "loq_conflict"], true], 0.08, 0]);
    expect(map.layers.get("loq-object-map-selected-fill")?.filter).toEqual(["==", ["get", "source"], "manual"]);
  });

  it("selecteert het echte Mapbox 3D-gebouw en bewaart alleen het bijbehorende BAG-id", async () => {
    const { props } = renderCanvas();
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    act(() => map.emit("style.load"));

    let result;
    act(() => {
      result = map.emitInteraction("loq-object-map-standard-building-click", {
        feature: standardBuilding,
        originalEvent: {},
        lngLat: { lng: 4.4805, lat: 51.9204 },
      });
    });

    expect(result).toBe(true);
    expect(props.onToggleCandidate).toHaveBeenCalledOnce();
    expect(props.onToggleCandidate).toHaveBeenCalledWith("bag-1");
    expect(props.onAddDrawingPoint).not.toHaveBeenCalled();
    expect(map.setFeatureState).toHaveBeenCalledWith(standardBuilding, { select: false, highlight: false });
  });

  it("kleurt zichtbare opgeslagen panden opnieuw via de Standard buildings feature-state", async () => {
    renderCanvas();
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    map.renderedFeatures = [standardBuilding];

    act(() => map.emit("style.load"));
    act(() => map.emit("idle"));

    expect(map.queryRenderedFeatures).toHaveBeenCalledWith({ target: { featuresetId: "buildings", importId: "basemap" } });
    expect(map.setFeatureState).toHaveBeenCalledWith(standardBuilding, { select: true });
  });

  it("herstelt de 3D-selectie nadat de Mapbox-stijl opnieuw is geladen", async () => {
    renderCanvas();
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    map.renderedFeatures = [standardBuilding];
    act(() => map.emit("style.load"));
    map.setFeatureState.mockClear();

    act(() => map.emit("style.load"));

    expect(map.setFeatureState).toHaveBeenCalledWith(standardBuilding, { select: true });
  });

  it("houdt een opgeslagen 3D-gebouw gekleurd als de actuele BAG-kandidaten ontbreken", async () => {
    renderCanvas({ candidates: [] });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    map.renderedFeatures = [standardBuilding];

    act(() => map.emit("style.load"));

    expect(map.setFeatureState).toHaveBeenCalledWith(standardBuilding, { select: true });
  });

  it("laat een zichtbaar Mapbox-gebouw zonder veilige BAG-match ongemoeid", async () => {
    const onBuildingMatchUnavailable = vi.fn();
    const { props } = renderCanvas({ onBuildingMatchUnavailable });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    act(() => map.emit("style.load"));
    const unmatched = {
      ...standardBuilding,
      id: 992,
      geometry: { type: "Polygon", coordinates: [[[4.5, 51.94], [4.501, 51.94], [4.501, 51.941], [4.5, 51.94]]] },
    };

    act(() => map.emitInteraction("loq-object-map-standard-building-click", {
      feature: unmatched,
      originalEvent: {},
      lngLat: { lng: 4.5005, lat: 51.9405 },
    }));

    expect(props.onToggleCandidate).not.toHaveBeenCalled();
    expect(onBuildingMatchUnavailable).toHaveBeenCalledOnce();
    expect(map.setFeatureState).not.toHaveBeenCalledWith(unmatched, expect.objectContaining({ select: true }));
  });

  it("centreert ontbrekende coördinaten veilig op Nederland zonder 0,0-marker", async () => {
    renderCanvas({ object: { id: "object-zonder-locatie", name: "Onbevestigd", latitude: null, longitude: " ", geocoding_status: "unverified" } });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];

    expect(map.options).toMatchObject({ center: [5.2913, 52.1326], zoom: 7, pitch: 0, bearing: 0 });
    act(() => map.emit("style.load"));
    expect(map.sources.get("loq-object-map-anchor").data.features).toEqual([]);
  });

  it("gebruikt ook een handmatig vastgelegde 0,0-locatie nooit als kaartanker", async () => {
    renderCanvas({ object: { id: "object-null-island", name: "Null Island", latitude: 0, longitude: "0", geocoding_status: "manual" } });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];

    expect(map.options).toMatchObject({ center: [5.2913, 52.1326], zoom: 7, pitch: 0, bearing: 0 });
    act(() => map.emit("style.load"));
    expect(map.sources.get("loq-object-map-anchor").data.features).toEqual([]);
  });

  it("gebruikt een ongecontroleerde 0,0-waarde nooit als kaartanker", async () => {
    renderCanvas({ object: { id: "object-ongecontroleerd", name: "Ongecontroleerd", latitude: 0, longitude: 0, geocoding_status: "unverified" } });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];

    expect(map.options.center).toEqual([5.2913, 52.1326]);
    act(() => map.emit("style.load"));
    expect(map.sources.get("loq-object-map-anchor").data.features).toEqual([]);
  });

  it("bouwt de kaart opnieuw op wanneer dezelfde coördinaten worden bevestigd", async () => {
    const initialObject = {
      id: "object-statuswijziging",
      name: "Statuswijziging",
      latitude: 52.44874121,
      longitude: 6.07245109,
      geocoding_status: "unverified",
    };
    const rendered = renderCanvas({ object: initialObject });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    expect(mapboxState.instances[0].options.center).toEqual([5.2913, 52.1326]);

    rendered.rerender(<ObjectMapCanvas {...rendered.props} object={{ ...initialObject, geocoding_status: "verified" }} />);

    await waitFor(() => expect(mapboxState.instances).toHaveLength(2));
    expect(mapboxState.instances[0].remove).toHaveBeenCalledOnce();
    expect(mapboxState.instances[1].options).toMatchObject({
      center: [6.07245109, 52.44874121],
      zoom: 17,
      pitch: 42,
      bearing: -12,
    });
  });
});
