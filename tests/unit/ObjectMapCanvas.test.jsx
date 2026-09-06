import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mapboxState = vi.hoisted(() => ({ instances: [] }));

vi.mock("@/components/navigation/mapboxConfig", () => ({ MAPBOX_PUBLIC_TOKEN: "test-mapbox-token" }));
vi.mock("mapbox-gl", () => {
  class FakeMap {
    constructor(options) {
      this.options = options;
      this.pitch = options.pitch;
      this.bearing = options.bearing;
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
    setPaintProperty = vi.fn();
    setMaxPitch = vi.fn();
    setConfigProperty = vi.fn();
    setMaxBounds = vi.fn();
    queryRenderedFeatures = vi.fn(() => this.renderedFeatures);
    setFeatureState = vi.fn();
    getCanvas() { return this.canvas; }
    fitBounds() {}
    easeTo = vi.fn(options => { if (options.pitch !== undefined) this.pitch = options.pitch; if (options.bearing !== undefined) this.bearing = options.bearing; });
    getPitch() { return this.pitch; }
    getBearing() { return this.bearing; }
    project(coordinate) { return { x: (coordinate[0] - 4.48) * 100_000, y: (coordinate[1] - 51.92) * 100_000 }; }
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

  it("biedt draaien, kantelen en standaard muisbesturing zonder de kaart opnieuw op te bouwen", async () => {
    const rendered = renderCanvas();
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    act(() => map.emit("style.load"));
    expect(map.options).toMatchObject({ dragRotate: true, touchZoomRotate: true, pitchWithRotate: true, maxPitch: 65 });
    expect(map.dragRotate.disable).not.toHaveBeenCalled();
    expect(map.touchZoomRotate.disableRotation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Kaart linksom draaien" }));
    expect(map.easeTo).toHaveBeenLastCalledWith({ bearing: -27, duration: 250 });
    fireEvent.click(screen.getByRole("button", { name: "Kaart rechtsom draaien" }));
    expect(map.easeTo).toHaveBeenLastCalledWith({ bearing: -12, duration: 250 });
    fireEvent.click(screen.getByRole("button", { name: "3D-kijkhoek vergroten" }));
    expect(map.easeTo).toHaveBeenLastCalledWith({ pitch: 52, duration: 250 });
    fireEvent.click(screen.getByRole("button", { name: "3D-kijkhoek verkleinen" }));
    expect(map.easeTo).toHaveBeenLastCalledWith({ pitch: 42, duration: 250 });
    rendered.rerender(<ObjectMapCanvas {...rendered.props} workspace="terrain" editingTarget="terrain" />);
    expect(screen.getByRole("button", { name: "3D-kijkhoek vergroten" })).toBeDisabled();
    expect(map.setMaxPitch).toHaveBeenLastCalledWith(0);
    expect(screen.getByRole("button", { name: "Kaart linksom draaien" })).not.toBeDisabled();
    rendered.rerender(<ObjectMapCanvas {...rendered.props} />);
    expect(map.setMaxPitch).toHaveBeenLastCalledWith(65);
    expect(mapboxState.instances).toHaveLength(1);
  });

  it("kleurt alleen het werkelijke terrein groen en laat bronpercelen transparant", async () => {
    renderCanvas({ workspace: "terrain", terrain: { type: "FeatureCollection", features: [candidate] }, parcelsVisible: true, parcelCandidates: [{ ...candidate, properties: { ...candidate.properties, loq_selected: true } }] });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    act(() => map.emit("style.load"));
    expect(map.layers.get("loq-object-map-parcels-fill").paint["fill-opacity"]).toBe(0);
    expect(map.layers.get("loq-object-map-parcels-line").paint["line-color"]).toBe("#64748b");
    expect(map.layers.get("loq-object-map-terrain-fill").paint["fill-color"]).toBe("#10b981");
    expect(map.layers.get("loq-object-map-terrain-line").paint["line-dasharray"]).toBeUndefined();
  });

  it("toont geen automatische grenspunten en maakt uitsluitend op een aangeklikte grens een bewerkpunt", async () => {
    const onTerrainGeometryChange = vi.fn();
    const initial = { type: "FeatureCollection", features: [candidate] };
    const rendered = renderCanvas({ workspace: "terrain", editingTarget: "terrain", terrain: initial, onTerrainGeometryChange });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    act(() => map.emit("style.load"));
    expect(map.sources.get("loq-object-map-vertices").data.features).toEqual([]);
    act(() => map.emit("click", { point: { x: 50, y: 0 }, originalEvent: {} }));
    expect(onTerrainGeometryChange).toHaveBeenCalledOnce();
    const next = onTerrainGeometryChange.mock.calls[0][0];
    rendered.rerender(<ObjectMapCanvas {...rendered.props} terrain={next} />);
    const points = map.sources.get("loq-object-map-vertices").setData.mock.lastCall[0].features;
    expect(points).toHaveLength(1);
    expect(points[0].properties.vertex_index).toBe(1);
    expect(next.features[0].geometry.coordinates[0]).toHaveLength(5);

    // Undo from the parent restores the original polygon and clears transient handles.
    rendered.rerender(<ObjectMapCanvas {...rendered.props} terrain={initial} />);
    expect(map.sources.get("loq-object-map-vertices").setData.mock.lastCall[0].features).toEqual([]);
  });

  it("verwijdert een door de gebruiker gemaakt punt via een rechtermuisknopmenu", async () => {
    const onTerrainGeometryChange = vi.fn();
    const initial = { type: "FeatureCollection", features: [candidate] };
    const rendered = renderCanvas({ workspace: "terrain", editingTarget: "terrain", terrain: initial, onTerrainGeometryChange });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    act(() => map.emit("style.load"));
    act(() => map.emit("click", { point: { x: 50, y: 0 }, originalEvent: {} }));
    const next = onTerrainGeometryChange.mock.calls[0][0];
    rendered.rerender(<ObjectMapCanvas {...rendered.props} terrain={next} />);
    const handle = map.sources.get("loq-object-map-vertices").setData.mock.lastCall[0].features[0];
    const preventDefault = vi.fn();
    act(() => map.emitLayer("contextmenu", "loq-object-map-vertices-layer", { features: [handle], point: { x: 50, y: 10 }, preventDefault, originalEvent: { preventDefault } }));
    expect(screen.getByRole("menu", { name: "Grenspunt" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Punt verwijderen" }));
    expect(onTerrainGeometryChange).toHaveBeenLastCalledWith(initial);
    expect(preventDefault).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("verwijdert bij klikken het huidige gewijzigde terreindeel en niet een oud perceel eronder", async () => {
    const onRemoveTerrainFeature = vi.fn(), onToggleParcel = vi.fn();
    renderCanvas({ workspace: "terrain", terrain: { type: "FeatureCollection", features: [candidate] }, parcelsVisible: true, parcelSelectionEnabled: true, onRemoveTerrainFeature, onToggleParcel });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    act(() => map.emit("style.load"));
    const originalEvent = {};
    const event = { features: [candidate], lngLat: { lng: 4.4807, lat: 51.9202 }, originalEvent };
    act(() => map.emitLayer("click", "loq-object-map-parcels-fill", event));
    act(() => map.emitLayer("click", "loq-object-map-terrain-fill", { ...event, features: [{ properties: { loq_feature_index: 0 } }] }));
    expect(onToggleParcel).not.toHaveBeenCalled();
    expect(onRemoveTerrainFeature).toHaveBeenCalledWith(0);
  });

  it("highlight een gebouw vanuit de lijst en herstelt de blauwe selectie wanneer de muis vertrekt", async () => {
    const rendered = renderCanvas();
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    map.renderedFeatures = [standardBuilding];
    act(() => map.emit("style.load"));
    rendered.rerender(<ObjectMapCanvas {...rendered.props} highlightedBuildingKey="bag:bag-1" />);
    expect(map.setFeatureState).toHaveBeenCalledWith(standardBuilding, { select: false, highlight: true });
    rendered.rerender(<ObjectMapCanvas {...rendered.props} highlightedBuildingKey={null} />);
    expect(map.setFeatureState).toHaveBeenCalledWith(standardBuilding, { select: true, highlight: false });
  });

  it("highlight een ongelinkt 3D-gebouw met de stabiele opgeslagen selectiepuntkey", async () => {
    const point = { id: "point-1", longitude: 4.4807, latitude: 51.9202 };
    renderCanvas({ candidates: [], selectedBagFeatureIds: [], selectedBuildings: empty, buildingSelectionPoints: [point], highlightedBuildingKey: "point:point-1" });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    map.renderedFeatures = [standardBuilding];
    act(() => map.emit("style.load"));
    expect(map.setFeatureState).toHaveBeenCalledWith(standardBuilding, { select: false, highlight: true });
    expect(map.sources.get("loq-object-map-building-hover").setData.mock.lastCall[0].features).toEqual([]);
  });

  it("gebruikt een exacte hovercontour als de kaart geen native gebouwfeature aanbiedt", async () => {
    const manual = { ...candidate, properties: { source: "manual", local_id: "legacy-1" } };
    const rendered = renderCanvas({ selectedBuildings: { type: "FeatureCollection", features: [manual] }, highlightedBuildingKey: "manual:legacy-1" });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    map.queryRenderedFeatures.mockImplementation(() => { throw new Error("Style has no featureset"); });
    act(() => map.emit("style.load"));
    expect(map.sources.get("loq-object-map-building-hover").setData.mock.lastCall[0].features).toEqual([manual]);
    rendered.rerender(<ObjectMapCanvas {...rendered.props} highlightedBuildingKey={null} />);
    expect(map.sources.get("loq-object-map-building-hover").setData.mock.lastCall[0].features).toEqual([]);
  });

  it("geeft ongeldige puntverplaatsingen niet door en laat een rechter muisklik nooit slepen", async () => {
    const onEditError = vi.fn();
    const terrain = { type: "FeatureCollection", features: [{ ...candidate, geometry: { type: "Polygon", coordinates: [[[4.48, 51.92], [4.481, 51.92], [4.481, 51.921], [4.48, 51.921], [4.48, 51.92]]] } }] };
    const { props } = renderCanvas({ workspace: "terrain", terrain, editingTarget: "terrain", onEditError });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    act(() => map.emit("style.load"));
    // Reveal a real boundary corner without modifying the existing shape.
    act(() => map.emit("click", { point: { x: 100, y: 0 }, originalEvent: {} }));
    const handle = map.sources.get("loq-object-map-vertices").setData.mock.lastCall[0].features[0];
    act(() => map.emitLayer("mousedown", "loq-object-map-vertices-layer", { features: [handle], originalEvent: { button: 2 }, preventDefault: vi.fn() }));
    expect(props.onVertexDragStart).not.toHaveBeenCalled();
    act(() => map.emitLayer("mousedown", "loq-object-map-vertices-layer", { features: [handle], originalEvent: { button: 0 }, preventDefault: vi.fn() }));
    act(() => map.emit("mousemove", { lngLat: { lng: 4.4799, lat: 51.9208 } }));
    act(() => map.emit("mousemove", { lngLat: { lng: 4.4799, lat: 51.9209 } }));
    act(() => map.emit("mousemove", { lngLat: { lng: 4.4798, lat: 51.9209 } }));
    expect(props.onMoveVertex).not.toHaveBeenCalled();
    expect(onEditError).toHaveBeenCalledWith(expect.stringContaining("zichzelf kruisen"));
    expect(onEditError).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent("Het vorige terrein blijft behouden");
    act(() => map.emit("mouseup"));
    expect(map.dragPan.enable).toHaveBeenCalled();
    expect(props.onVertexDragEnd).toHaveBeenCalledWith("terrain");
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

  it("behoudt dezelfde 3D-kaart en camera bij wisselen tussen gebouwen en terrein", async () => {
    const rendered = renderCanvas();
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    act(() => map.emit("style.load"));
    map.pitch = 27;

    rendered.rerender(<ObjectMapCanvas {...rendered.props} workspace="terrain" parcelsVisible />);

    expect(mapboxState.instances).toHaveLength(1);
    expect(map.remove).not.toHaveBeenCalled();
    expect(map.easeTo).not.toHaveBeenCalled();
    expect(map.pitch).toBe(27);
    expect(map.setLayoutProperty).toHaveBeenCalledWith("loq-object-map-satellite-layer", "visibility", "none");
    expect(map.setConfigProperty).toHaveBeenCalledWith("basemap", "show3dBuildings", true);
    expect(map.setLayoutProperty).toHaveBeenCalledWith("loq-object-map-parcels-fill", "visibility", "visible");

    rendered.rerender(<ObjectMapCanvas {...rendered.props} workspace="buildings" />);
    expect(map.easeTo).not.toHaveBeenCalled();
    expect(map.pitch).toBe(27);
    expect(mapboxState.instances).toHaveLength(1);
  });

  it("vlakt alleen de gekozen luchtfoto af en herstelt de werkelijk gekozen kaarthoek", async () => {
    const rendered = renderCanvas();
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    act(() => map.emit("style.load"));
    map.pitch = 29;
    rendered.rerender(<ObjectMapCanvas {...rendered.props} workspace="terrain" mapView="satellite" />);
    expect(map.easeTo).toHaveBeenLastCalledWith({ pitch: 0, duration: 350 });
    expect(map.setConfigProperty).toHaveBeenCalledWith("basemap", "show3dBuildings", false);

    // Drawing and layer updates must not overwrite the remembered normal view.
    rendered.rerender(<ObjectMapCanvas {...rendered.props} workspace="terrain" mapView="satellite" drawingTarget="terrain" drawingPoints={[[4.48, 51.92]]} parcelsVisible />);
    expect(map.easeTo).toHaveBeenCalledTimes(1);
    rendered.rerender(<ObjectMapCanvas {...rendered.props} workspace="terrain" mapView="map" />);
    expect(map.easeTo).toHaveBeenLastCalledWith({ pitch: 29, duration: 350 });
    expect(mapboxState.instances).toHaveLength(1);
    expect(map.remove).not.toHaveBeenCalled();
  });

  it.each(["drawingTarget", "editingTarget"])("houdt grondbewerking tijdelijk recht van boven voor %s zonder verplaatsing", async target => {
    const rendered = renderCanvas({ workspace: "terrain" });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    act(() => map.emit("style.load"));
    map.pitch = 33;
    rendered.rerender(<ObjectMapCanvas {...rendered.props} {...{ [target]: "terrain" }} />);
    expect(map.easeTo).toHaveBeenLastCalledWith({ pitch: 0, duration: 350 });
    rendered.rerender(<ObjectMapCanvas {...rendered.props} />);
    expect(map.easeTo).toHaveBeenLastCalledWith({ pitch: 33, duration: 350 });
    expect(mapboxState.instances).toHaveLength(1);
  });

  it("behoudt zonder grondbewerking de bestaande 3D-kaarthoek in terreinmodus", async () => {
    renderCanvas({ workspace: "terrain" });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    act(() => map.emit("style.load"));
    expect(map.options.pitch).toBe(42);
    expect(map.easeTo).not.toHaveBeenCalled();
    expect(map.setConfigProperty).toHaveBeenCalledWith("basemap", "show3dBuildings", true);
    expect(screen.queryByRole("button", { name: "Bovenaanzicht" })).not.toBeInTheDocument();
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

    expect(map.options).toMatchObject({ center: [5.2913, 52.1326], zoom: 7, pitch: 0, bearing: 0, minZoom: 6, maxBounds: [[3, 50.6], [7.4, 53.7]], renderWorldCopies: false });
    act(() => map.emit("style.load"));
    expect(map.sources.get("loq-object-map-anchor").data.features).toEqual([]);
  });

  it("beperkt uitzoomen en verschuiven tot ongeveer een kilometer rond het bevestigde adres", async () => {
    const rendered = renderCanvas();
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    const [[west, south], [east, north]] = map.options.maxBounds;
    expect(map.options).toMatchObject({ center: [4.48, 51.92], zoom: 17, minZoom: 10, renderWorldCopies: false, projection: "mercator" });
    expect(west).toBeCloseTo(4.4654, 3);
    expect(east).toBeCloseTo(4.4946, 3);
    expect(south).toBeCloseTo(51.911, 3);
    expect(north).toBeCloseTo(51.929, 3);
    act(() => map.emit("style.load"));
    expect(screen.getByText("Kaart begrensd tot de omgeving van dit object")).toBeInTheDocument();
    rendered.rerender(<ObjectMapCanvas {...rendered.props} workspace="terrain" parcelsVisible />);
    expect(map.setMaxBounds).not.toHaveBeenCalled();
    expect(map.easeTo).not.toHaveBeenCalled();
    expect(mapboxState.instances).toHaveLength(1);
  });

  it("houdt verder gelegen geldig terrein en gebouwselecties binnen de lokale kaartbegrenzing", async () => {
    const fartherTerrain = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[[4.51, 51.92], [4.515, 51.92], [4.515, 51.925], [4.51, 51.925], [4.51, 51.92]]] } }] };
    renderCanvas({ terrain: fartherTerrain, buildingSelectionPoints: [{ id: "west-building", longitude: 4.44, latitude: 51.92 }] });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const [[west], [east]] = mapboxState.instances[0].options.maxBounds;
    expect(west).toBeLessThan(4.44);
    expect(west).toBeGreaterThan(4.43);
    expect(east).toBeGreaterThan(4.515);
    expect(east).toBeLessThan(4.525);
  });

  it("actualiseert gewijzigde terreingrenzen zonder de kaart opnieuw te openen of te centreren", async () => {
    const rendered = renderCanvas();
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    act(() => map.emit("style.load"));
    const terrain = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "MultiPolygon", coordinates: [[[[4.51, 51.92], [4.515, 51.92], [4.515, 51.925], [4.51, 51.925], [4.51, 51.92]]]] } }] };
    rendered.rerender(<ObjectMapCanvas {...rendered.props} terrain={terrain} />);
    expect(map.setMaxBounds).toHaveBeenCalledOnce();
    expect(map.setMaxBounds.mock.calls[0][0][1][0]).toBeGreaterThan(4.515);
    expect(map.easeTo).not.toHaveBeenCalled();
    expect(mapboxState.instances).toHaveLength(1);
    expect(map.remove).not.toHaveBeenCalled();
    rendered.rerender(<ObjectMapCanvas {...rendered.props} terrain={terrain} workspace="terrain" />);
    expect(map.setMaxBounds).toHaveBeenCalledOnce();
    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it("verruimt de kaart niet door wereldwijde, ongesloten of ongeldige geometrie", async () => {
    const invalidTerrain = { type: "FeatureCollection", features: [
      { type: "Feature", geometry: { type: "Polygon", coordinates: [[[-20, 20], [20, 20], [20, 70], [-20, 20]]] } },
      { type: "Feature", geometry: { type: "Polygon", coordinates: [[[4.51, 51.92], [4.52, 51.92], [4.52, 51.925], [4.51, 51.925]]] } },
      { type: "Feature", geometry: { type: "Polygon", coordinates: [[[4.48, 51.92], [Infinity, 51.92], [4.49, 51.93], [4.48, 51.92]]] } },
      { type: "Feature", geometry: { type: "LineString", coordinates: [[4.44, 51.92], [4.52, 51.92]] } },
    ] };
    renderCanvas({ terrain: invalidTerrain, buildingSelectionPoints: [{ longitude: 0, latitude: 0 }, { longitude: 4.6, latitude: 51.92 }, { longitude: "4.44", latitude: 51.92 }] });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const [[west, south], [east, north]] = mapboxState.instances[0].options.maxBounds;
    expect(west).toBeCloseTo(4.4654, 3);
    expect(east).toBeCloseTo(4.4946, 3);
    expect(south).toBeCloseTo(51.911, 3);
    expect(north).toBeCloseTo(51.929, 3);
  });

  it("laat zonder bevestigd adres geen wereldwijde opgeslagen contouren of tekenacties toe", async () => {
    const onAddDrawingPoint = vi.fn();
    renderCanvas({ object: { id: "unchecked", name: "Onbevestigd", longitude: 4.48, latitude: 51.92, geocoding_status: "unverified" }, workspace: "terrain", drawingTarget: "terrain", disabled: false, onAddDrawingPoint });
    await waitFor(() => expect(mapboxState.instances).toHaveLength(1));
    const map = mapboxState.instances[0];
    expect(map.options.maxBounds).toEqual([[3, 50.6], [7.4, 53.7]]);
    act(() => map.emit("style.load"));
    act(() => map.emit("click", { lngLat: { lng: 4.48, lat: 51.92 } }));
    expect(onAddDrawingPoint).not.toHaveBeenCalled();
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
