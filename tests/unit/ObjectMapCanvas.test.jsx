import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      this.doubleClickZoom = { disable: vi.fn(), enable: vi.fn() };
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
    setLayoutProperty = vi.fn();
    setConfigProperty = vi.fn();
    queryRenderedFeatures = vi.fn(() => this.renderedFeatures);
    setFeatureState = vi.fn();
    getCanvas() { return this.canvas; }
    fitBounds() {}
    easeTo = vi.fn();
    getZoom() { return 17; }
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
      show3dObjects: true,
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
    expect(map.easeTo).toHaveBeenCalledWith({ pitch: 0, zoom: 18, duration: 450 });
  });

  it("bewaart een gebouw zonder BAG-match als eigen klikpunt en kleurt het native gebouw", async () => {
    const onToggleBuildingPoint = vi.fn();
    const { props } = renderCanvas({ candidates: [], selectedBuildings: empty, selectedBagFeatureIds: [], onToggleBuildingPoint });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    act(() => map.emit("style.load"));

    act(() => map.emitInteraction("loq-object-map-standard-building-click", {
      feature: standardBuilding,
      lngLat: { lng: 4.4808, lat: 51.9202 },
    }));

    expect(props.onToggleCandidate).not.toHaveBeenCalled();
    expect(onToggleBuildingPoint).toHaveBeenCalledWith({
      id: expect.any(String), source: "user_selected", provider: "mapbox", bag_status: "unlinked", longitude: 4.4808, latitude: 51.9202,
    });
    expect(Object.keys(onToggleBuildingPoint.mock.calls[0][0])).toHaveLength(6);
    expect(map.setFeatureState).toHaveBeenCalledWith(standardBuilding, { select: true, highlight: false });
  });

  it("herstelt en deselecteert een opgeslagen klikpunt zonder BAG of Mapbox-id op te slaan", async () => {
    const point = { id: "own-point", source: "user_selected", provider: "mapbox", bag_status: "unlinked", longitude: 4.4808, latitude: 51.9202 };
    const onToggleBuildingPoint = vi.fn();
    renderCanvas({ candidates: [], selectedBuildings: empty, selectedBagFeatureIds: [], buildingSelectionPoints: [point], onToggleBuildingPoint });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    map.renderedFeatures = [standardBuilding];
    act(() => map.emit("style.load"));
    expect(map.setFeatureState).toHaveBeenCalledWith(standardBuilding, { select: true });

    act(() => map.emitInteraction("loq-object-map-standard-building-click", { feature: standardBuilding }));

    expect(onToggleBuildingPoint).toHaveBeenCalledWith(point);
    expect(map.setFeatureState).toHaveBeenCalledWith(standardBuilding, { select: false, highlight: false });
  });

  it("kleurt een dubbel geladen identieke voetafdruk maar geen twee verschillende overlappende gebouwen", async () => {
    const point = { id: "own-point", source: "user_selected", provider: "mapbox", bag_status: "unlinked", longitude: 4.4808, latitude: 51.9202 };
    renderCanvas({ candidates: [], selectedBuildings: empty, selectedBagFeatureIds: [], buildingSelectionPoints: [point] });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    const duplicate = { ...standardBuilding, id: "duplicate", geometry: { type: "Polygon", coordinates: [[...standardBuilding.geometry.coordinates[0]].reverse()] } };
    map.renderedFeatures = [standardBuilding, duplicate];
    act(() => map.emit("style.load"));
    expect(map.setFeatureState).toHaveBeenCalledWith(standardBuilding, { select: true });
    expect(map.setFeatureState).toHaveBeenCalledWith(duplicate, { select: true });

    const overlapping = { ...standardBuilding, id: "other-building", geometry: { type: "Polygon", coordinates: [[[4.4806, 51.92], [4.4812, 51.92], [4.4812, 51.9205], [4.4806, 51.9205], [4.4806, 51.92]]] } };
    map.renderedFeatures = [standardBuilding, duplicate, overlapping];
    map.setFeatureState.mockClear();
    act(() => map.emit("idle"));
    expect(map.setFeatureState).toHaveBeenCalledWith(standardBuilding, { select: false });
    expect(map.setFeatureState).toHaveBeenCalledWith(duplicate, { select: false });
    expect(map.setFeatureState).not.toHaveBeenCalledWith(overlapping, { select: true });
  });

  it("bewaart geen onduidelijk klikpunt waar twee verschillende gebouwen overlappen", async () => {
    const onToggleBuildingPoint = vi.fn();
    const onBuildingMatchUnavailable = vi.fn();
    renderCanvas({ candidates: [], selectedBuildings: empty, selectedBagFeatureIds: [], onToggleBuildingPoint, onBuildingMatchUnavailable });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    map.renderedFeatures = [{ ...standardBuilding, id: "other-building", geometry: { type: "Polygon", coordinates: [[[4.4806, 51.92], [4.4812, 51.92], [4.4812, 51.9205], [4.4806, 51.9205], [4.4806, 51.92]]] } }];
    act(() => map.emit("style.load"));
    act(() => map.emitInteraction("loq-object-map-standard-building-click", { feature: standardBuilding, lngLat: { lng: 4.4808, lat: 51.9202 } }));
    expect(onToggleBuildingPoint).not.toHaveBeenCalled();
    expect(onBuildingMatchUnavailable).toHaveBeenCalledWith("Hier overlappen twee gebouwen. Klik van bovenaf op een vrij deel van het gewenste gebouw.");
  });

  it("verwijdert geen willekeurige opgeslagen selectie vanuit een overlappend gebouw", async () => {
    const point = { id: "own-point", source: "user_selected", provider: "mapbox", bag_status: "unlinked", longitude: 4.4808, latitude: 51.9202 };
    const onToggleBuildingPoint = vi.fn();
    const onBuildingMatchUnavailable = vi.fn();
    renderCanvas({ candidates: [], selectedBuildings: empty, selectedBagFeatureIds: [], buildingSelectionPoints: [point], onToggleBuildingPoint, onBuildingMatchUnavailable });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    map.renderedFeatures = [{ ...standardBuilding, id: "other-building", geometry: { type: "Polygon", coordinates: [[[4.4806, 51.92], [4.4812, 51.92], [4.4812, 51.9205], [4.4806, 51.9205], [4.4806, 51.92]]] } }];
    act(() => map.emit("style.load"));
    act(() => map.emitInteraction("loq-object-map-standard-building-click", { feature: standardBuilding, lngLat: { lng: 4.4808, lat: 51.9202 } }));
    expect(onToggleBuildingPoint).not.toHaveBeenCalled();
    expect(onBuildingMatchUnavailable).toHaveBeenCalledWith("Deze opgeslagen selectie ligt onder meerdere gebouwen. Verwijder haar uit de lijst en kies het gebouw opnieuw van bovenaf.");
  });

  it("houdt de kaart en getekende punten intact bij wisselen naar luchtfoto en toont terrein van bovenaf", async () => {
    const drawingPoints = [[4.48, 51.92], [4.481, 51.92]];
    const rendered = renderCanvas({ workspace: "terrain", drawingTarget: "terrain", drawingPoints });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    act(() => map.emit("style.load"));
    expect(map.options.pitch).toBe(0);
    expect(map.options.config.basemap.show3dBuildings).toBe(false);
    expect(map.options.config.basemap.show3dObjects).toBe(false);

    rendered.rerender(<ObjectMapCanvas {...rendered.props} mapView="satellite" />);

    expect(mapboxState.instances).toHaveLength(1);
    expect(map.remove).not.toHaveBeenCalled();
    expect(map.setLayoutProperty).toHaveBeenCalledWith("loq-object-map-satellite-layer", "visibility", "visible");
    expect(map.sources.get("loq-object-map-satellite").tiles[0]).toContain("service.pdok.nl/hwh/luchtfotorgb");
    expect(map.layers.get("loq-object-map-satellite-layer")).not.toHaveProperty("slot");
    expect([...map.layers.keys()].indexOf("loq-object-map-satellite-layer")).toBeLessThan([...map.layers.keys()].indexOf("loq-object-map-terrain-fill"));
    expect(map.setConfigProperty).toHaveBeenCalledWith("basemap", "show3dObjects", false);
    expect(map.sources.get("loq-object-map-draft").setData).toHaveBeenLastCalledWith(expect.objectContaining({
      features: expect.arrayContaining([expect.objectContaining({ geometry: { type: "LineString", coordinates: drawingPoints } })]),
    }));
    expect(map.easeTo).not.toHaveBeenCalled();
    expect(map.doubleClickZoom.disable).toHaveBeenCalled();
  });

  it("houdt luchtfoto buiten de gebouwselectie en herstelt native 3D bij terugkeren", async () => {
    const rendered = renderCanvas({ workspace: "terrain", mapView: "satellite" });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    act(() => map.emit("style.load"));
    expect(map.setLayoutProperty).toHaveBeenCalledWith("loq-object-map-satellite-layer", "visibility", "visible");

    rendered.rerender(<ObjectMapCanvas {...rendered.props} workspace="buildings" />);

    expect(mapboxState.instances).toHaveLength(1);
    expect(map.setLayoutProperty).toHaveBeenCalledWith("loq-object-map-satellite-layer", "visibility", "none");
    expect(map.setConfigProperty).toHaveBeenCalledWith("basemap", "show3dObjects", true);
    expect(map.setConfigProperty).toHaveBeenCalledWith("basemap", "show3dBuildings", true);
    expect(map.easeTo).toHaveBeenCalledWith({ pitch: 42, duration: 350 });
  });

  it("selecteert percelen uitsluitend in de actieve perceelmodus en selecteert daar geen gebouwen", async () => {
    const onToggleParcel = vi.fn();
    const rendered = renderCanvas({ workspace: "terrain", parcelCandidates: [candidate], parcelsVisible: true, parcelSelectionEnabled: true, onToggleParcel });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    act(() => map.emit("style.load"));
    act(() => map.emitLayer("click", "loq-object-map-parcels-fill", { features: [candidate], originalEvent: {} }));
    expect(onToggleParcel).toHaveBeenCalledWith("bag-1");

    act(() => map.emitInteraction("loq-object-map-standard-building-click", { feature: standardBuilding, lngLat: { lng: 4.4808, lat: 51.9202 } }));
    expect(rendered.props.onToggleCandidate).not.toHaveBeenCalled();

    rendered.rerender(<ObjectMapCanvas {...rendered.props} drawingTarget="terrain" />);
    act(() => map.emitLayer("click", "loq-object-map-parcels-fill", { features: [candidate], originalEvent: {} }));
    expect(onToggleParcel).toHaveBeenCalledOnce();
  });

  it("toont tijdens tekenen de lijn naar de muis en sluit op het eerste punt zonder extra hoekpunt", async () => {
    const drawingPoints = [[4.48, 51.92], [4.481, 51.92], [4.481, 51.921]];
    const onFinishDrawing = vi.fn();
    const { props } = renderCanvas({ workspace: "terrain", drawingTarget: "terrain", drawingPoints, onFinishDrawing });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    act(() => map.emit("style.load"));
    act(() => map.emit("mousemove", { lngLat: { lng: 4.48, lat: 51.921 } }));
    expect(map.sources.get("loq-object-map-draft").setData).toHaveBeenLastCalledWith(expect.objectContaining({
      features: expect.arrayContaining([expect.objectContaining({ geometry: { type: "LineString", coordinates: [...drawingPoints, [4.48, 51.921]] } })]),
    }));

    const originalEvent = {};
    act(() => {
      map.emitLayer("click", "loq-object-map-draft-points", { features: [{ properties: { point_index: 0 } }], originalEvent });
      map.emit("click", { originalEvent, lngLat: { lng: 4.48, lat: 51.92 } });
    });
    expect(onFinishDrawing).toHaveBeenCalledOnce();
    expect(props.onAddDrawingPoint).not.toHaveBeenCalled();
  });

  it("beperkt teken-sneltoetsen tot de kaart en laat invoervelden ongemoeid", async () => {
    const onFinishDrawing = vi.fn();
    const onCancelDrawing = vi.fn();
    const onRemoveLastDrawingPoint = vi.fn();
    renderCanvas({ workspace: "terrain", drawingTarget: "terrain", drawingPoints: [[4.48, 51.92], [4.481, 51.92], [4.481, 51.921]], onFinishDrawing, onCancelDrawing, onRemoveLastDrawingPoint });
    const canvas = screen.getByLabelText("Kaart en terrein van Testobject");
    fireEvent.keyDown(canvas, { key: "Enter" });
    fireEvent.keyDown(canvas, { key: "Backspace" });
    fireEvent.keyDown(canvas, { key: "Escape" });
    expect(onFinishDrawing).toHaveBeenCalledOnce();
    expect(onRemoveLastDrawingPoint).toHaveBeenCalledOnce();
    expect(onCancelDrawing).toHaveBeenCalledOnce();
    fireEvent.keyDown(document.body, { key: "Enter" });
    const input = document.createElement("input");
    canvas.appendChild(input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onFinishDrawing).toHaveBeenCalledOnce();
    input.remove();
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
