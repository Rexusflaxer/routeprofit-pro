import { act, cleanup, renderHook } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { featureStrictlyContainsCoordinate } from "@/components/objects/objectMapGeometry";

const markerState = vi.hoisted(() => ({ instances: [], onCreate: null, addError: null }));
vi.mock("mapbox-gl", () => ({
  default: {
    Marker: class Marker {
      constructor(options) {
        this.options = options;
        options.element.classList.add("mapboxgl-marker", "mapboxgl-marker-anchor-bottom");
        markerState.instances.push(this);
        markerState.onCreate?.();
      }
      setLngLat = vi.fn(coordinate => { this.coordinate = coordinate; return this; });
      addTo = vi.fn(map => {
        if (markerState.addError) throw markerState.addError;
        map.getCanvasContainer().appendChild(this.options.element);
        return this;
      });
      remove = vi.fn(() => this.options.element.remove());
    },
  },
}));

import useObjectMapBuildingLabels, { buildingLabelCoordinate } from "@/components/objects/useObjectMapBuildingLabels";

const ring = [[4.48, 51.92], [4.482, 51.92], [4.482, 51.922], [4.48, 51.922], [4.48, 51.92]];
const building = { type: "Feature", id: "building-1", properties: { source: "pdok_bag", source_feature_id: "bag-1" }, geometry: { type: "Polygon", coordinates: [ring] } };
const collection = (...features) => ({ type: "FeatureCollection", features });
const point = { id: "point-1", longitude: 4.486, latitude: 51.921 };

function createMap() {
  const container = document.createElement("div");
  document.body.append(container);
  const handlers = new Map();
  let removed = false;
  const subscribe = (event, handler, once = false) => handlers.set(event, [...(handlers.get(event) || []), { handler, once }]);
  const unsubscribe = (event, handler) => handlers.set(event, (handlers.get(event) || []).filter(entry => entry.handler !== handler));
  const emit = event => [...(handlers.get(event) || [])].forEach(entry => {
    if (entry.once) unsubscribe(event, entry.handler);
    entry.handler();
  });
  let moving = false;
  const finishMovement = () => {
    moving = false;
    emit("moveend");
  };
  return {
    container,
    getCanvasContainer: () => removed ? undefined : container,
    getZoom: vi.fn(() => 17),
    getMinZoom: vi.fn(() => 10),
    getMaxZoom: vi.fn(() => 22),
    getBearing: vi.fn(() => -12),
    getPitch: vi.fn(() => 42),
    getMaxBounds: vi.fn(() => ({ contains: coordinate => coordinate[0] > 4 && coordinate[0] < 5 && coordinate[1] > 51 && coordinate[1] < 53 })),
    easeTo: vi.fn(() => { if (moving) finishMovement(); moving = true; }),
    stop: vi.fn(() => { if (moving) finishMovement(); }),
    once: vi.fn((event, handler) => subscribe(event, handler, true)),
    on: vi.fn((event, handler) => subscribe(event, handler)),
    off: vi.fn(unsubscribe),
    remove: () => { removed = true; container.remove(); emit("remove"); },
    finishMovement,
    startOtherMovement: () => { moving = true; },
  };
}

async function renderLabels(overrides = {}) {
  const props = { map: createMap(), ready: true, selectedBuildings: collection(building), buildingSelectionPoints: [], buildingLabels: {}, ...overrides };
  const rendered = renderHook(current => useObjectMapBuildingLabels(current), { initialProps: props });
  await act(async () => { await vi.dynamicImportSettled(); });
  return { ...rendered, props, map: props.map };
}

beforeEach(() => { vi.useFakeTimers(); markerState.instances = []; markerState.onCreate = null; markerState.addError = null; });
afterEach(() => { cleanup(); document.body.replaceChildren(); vi.useRealTimers(); });

describe("buildingLabelCoordinate", () => {
  it("kiest een punt binnen een concave gebouwcontour in plaats van buiten het gebouw", () => {
    const concave = { ...building, geometry: { type: "Polygon", coordinates: [[[4, 51], [4.006, 51], [4.006, 51.001], [4.001, 51.001], [4.001, 51.005], [4.006, 51.005], [4.006, 51.006], [4, 51.006], [4, 51]]] } };
    const coordinate = buildingLabelCoordinate(concave);
    expect(coordinate).not.toBeNull();
    expect(featureStrictlyContainsCoordinate(concave, coordinate)).toBe(true);
    expect(coordinate[0]).toBeLessThan(4.001);
  });

  it("plaatst een naam niet in de binnenplaats en kiest bij meerdere delen het grootste gebouwdeel", () => {
    const courtyard = { ...building, geometry: { type: "Polygon", coordinates: [ring, [[4.4805, 51.9205], [4.4815, 51.9205], [4.4815, 51.9215], [4.4805, 51.9215], [4.4805, 51.9205]]] } };
    expect(featureStrictlyContainsCoordinate(courtyard, buildingLabelCoordinate(courtyard))).toBe(true);
    const smallRing = ring.map(([lng, lat]) => [4.49 + (lng - 4.48) / 5, lat]);
    const multi = { ...building, geometry: { type: "MultiPolygon", coordinates: [[smallRing], [ring]] } };
    expect(buildingLabelCoordinate(multi)[0]).toBeLessThan(4.483);
  });

  it.each([
    { type: "Point", coordinates: [4.48, 51.92] },
    { type: "Polygon", coordinates: [ring.slice(0, -1)] },
    { type: "Polygon", coordinates: [[[181, 52], [182, 52], [182, 53], [181, 52]]] },
    { type: "Polygon", coordinates: [[...ring.slice(0, 2), [NaN, 52], ...ring.slice(3)]] },
    { type: "Polygon", coordinates: [[...ring.slice(0, 2), [4.481, "51.921"], ...ring.slice(3)]] },
    { type: "Polygon", coordinates: [[[4.48, 51.92], [4.48, 51.92], [4.48, 51.92], [4.48, 51.92]]] },
  ])("weigert ongeldige geometrie zonder een vervangende locatie te gokken (%j)", geometry => {
    expect(buildingLabelCoordinate({ ...building, geometry })).toBeNull();
  });
});

describe("useObjectMapBuildingLabels", () => {
  it("toont benoemde BAG-, eigen punt- en bestaande handmatige selecties als veilige niet-klikbare tekst", async () => {
    const manual = { ...building, id: "old-id", properties: { source: "manual", local_id: "manual-1" } };
    const name = '<img src=x onerror="alert(1)">';
    const { map } = await renderLabels({ selectedBuildings: collection(building, manual), buildingSelectionPoints: [point], buildingLabels: { "bag:bag-1": name, "manual:manual-1": "Opslag", "point:point-1": "Portier", "bag:not-selected": "Niet zichtbaar" } });
    expect(markerState.instances).toHaveLength(3);
    expect(map.container.querySelector("img")).toBeNull();
    const label = map.container.querySelector('[data-building-key="bag:bag-1"]');
    expect(label.textContent).toBe(name);
    expect(label.style.pointerEvents).toBe("none");
    expect(label).toHaveAttribute("aria-hidden", "true");
    expect(map.container.textContent).not.toContain("Niet zichtbaar");
    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it("gebruikt stabiele sleutels voor gelijke namen en werkt tekst bij zonder nieuwe marker of camerabeweging", async () => {
    const rendered = await renderLabels({ buildingSelectionPoints: [point], buildingLabels: { "bag:bag-1": "Opslag", "point:point-1": "Opslag" } });
    expect(markerState.instances).toHaveLength(2);
    rendered.rerender({ ...rendered.props, buildingLabels: { "bag:bag-1": "Hoofdgebouw", "point:point-1": "Opslag" } });
    expect(markerState.instances).toHaveLength(2);
    expect(markerState.instances[0].setLngLat).toHaveBeenCalledOnce();
    expect(rendered.map.container.textContent).toContain("Hoofdgebouw");
    expect(markerState.instances[0].options.element).toHaveClass("mapboxgl-marker", "mapboxgl-marker-anchor-bottom");
    rendered.rerender({ ...rendered.props, highlightedBuildingKey: "bag:bag-1" });
    expect(markerState.instances[0].options.element).toHaveClass("mapboxgl-marker", "mapboxgl-marker-anchor-bottom");
    rendered.rerender(rendered.props);
    act(() => vi.advanceTimersByTime(500));
    expect(rendered.map.easeTo).not.toHaveBeenCalled();
  });

  it("toont alleen voor aangewezen naamloze gebouwen een fallbacklabel en vliegt na 180ms met behoud van kijkrichting", async () => {
    const rendered = await renderLabels();
    expect(markerState.instances).toHaveLength(0);
    rendered.rerender({ ...rendered.props, highlightedBuildingKey: "bag:bag-1" });
    expect(rendered.map.container.textContent).toBe("BAG-pand bag-1");
    expect(rendered.map.container.firstChild).toHaveAttribute("data-highlighted", "true");
    act(() => vi.advanceTimersByTime(179));
    expect(rendered.map.easeTo).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(rendered.map.easeTo).toHaveBeenCalledExactlyOnceWith({ center: buildingLabelCoordinate(building), zoom: 18, duration: 550, bearing: -12, pitch: 42 });
    rendered.rerender({ ...rendered.props, highlightedBuildingKey: "bag:bag-1", buildingLabels: { "bag:bag-1": "Nieuw" }, selectedBuildings: collection({ ...building }) });
    act(() => vi.advanceTimersByTime(1000));
    expect(rendered.map.easeTo).toHaveBeenCalledOnce();
  });

  it("annuleert snel verlaten rijen en beweegt alleen naar de laatst aangewezen rij", async () => {
    const rendered = await renderLabels({ buildingSelectionPoints: [point] });
    rendered.rerender({ ...rendered.props, highlightedBuildingKey: "bag:bag-1" });
    act(() => vi.advanceTimersByTime(100));
    rendered.rerender({ ...rendered.props, highlightedBuildingKey: null });
    act(() => vi.advanceTimersByTime(200));
    expect(rendered.map.easeTo).not.toHaveBeenCalled();
    rendered.rerender({ ...rendered.props, highlightedBuildingKey: "bag:bag-1" });
    act(() => vi.advanceTimersByTime(100));
    rendered.rerender({ ...rendered.props, highlightedBuildingKey: "point:point-1" });
    act(() => vi.advanceTimersByTime(180));
    expect(rendered.map.easeTo).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ center: [point.longitude, point.latitude] }));
  });

  it("annuleert alleen de eigen lopende hoverbeweging; na moveend wordt geen handmatige kaartbeweging gestopt", async () => {
    const rendered = await renderLabels({ highlightedBuildingKey: "bag:bag-1" });
    act(() => vi.advanceTimersByTime(180));
    rendered.map.stop.mockClear();
    rendered.rerender({ ...rendered.props, highlightedBuildingKey: null });
    expect(rendered.map.stop).toHaveBeenCalledOnce();
    rendered.rerender(rendered.props);
    act(() => vi.advanceTimersByTime(180));
    rendered.map.stop.mockClear();
    rendered.map.finishMovement();
    rendered.rerender({ ...rendered.props, highlightedBuildingKey: null });
    expect(rendered.map.stop).not.toHaveBeenCalled();
  });

  it("vangt het moveend van een eerdere animatie niet als het einde van de nieuwe hoverbeweging", async () => {
    const map = createMap();
    map.startOtherMovement();
    const oldMoveEnd = vi.fn();
    map.once("moveend", oldMoveEnd);
    const rendered = await renderLabels({ map, highlightedBuildingKey: "bag:bag-1" });
    act(() => vi.advanceTimersByTime(180));
    expect(oldMoveEnd).toHaveBeenCalledOnce();
    expect(map.stop).toHaveBeenCalledOnce();
    expect(map.easeTo).toHaveBeenCalledOnce();
    rendered.rerender({ ...rendered.props, highlightedBuildingKey: null });
    expect(map.stop).toHaveBeenCalledTimes(2);
  });

  it.each([{ workspace: "terrain" }, { editingTarget: "terrain" }, { drawingTarget: "building" }, { ready: false }])("verstoort bewerken of ongereed kaartwerk niet (%j)", async blocked => {
    const rendered = await renderLabels({ highlightedBuildingKey: "bag:bag-1", buildingLabels: { "bag:bag-1": "Hoofdgebouw" }, ...blocked });
    act(() => vi.advanceTimersByTime(500));
    expect(rendered.map.easeTo).not.toHaveBeenCalled();
    expect(markerState.instances).toHaveLength(0);
  });

  it("verwijdert labels bij deselecteren/werkmoduswissel en ruimt alle markers op bij unmount", async () => {
    const rendered = await renderLabels({ buildingSelectionPoints: [point], buildingLabels: { "bag:bag-1": "Kantoor", "point:point-1": "Portier" } });
    rendered.rerender({ ...rendered.props, selectedBuildings: collection() });
    expect(markerState.instances[0].remove).toHaveBeenCalledOnce();
    rendered.rerender({ ...rendered.props, selectedBuildings: collection(), workspace: "terrain" });
    expect(markerState.instances[1].remove).toHaveBeenCalledOnce();
    rendered.rerender(rendered.props);
    expect(markerState.instances).toHaveLength(4);
    rendered.unmount();
    expect(markerState.instances[2].remove).toHaveBeenCalledOnce();
    expect(markerState.instances[3].remove).toHaveBeenCalledOnce();
    expect(rendered.map.container).toBeEmptyDOMElement();
  });

  it("slaat ongeldige punten, onbekende/ambigue sleutels en locaties buiten de kaartgrens over", async () => {
    const rendered = await renderLabels({ selectedBuildings: collection(building, { ...building }), buildingSelectionPoints: [point, { id: "invalid", longitude: null, latitude: 52 }, { id: "far", longitude: 6, latitude: 52 }], buildingLabels: { "bag:bag-1": "Dubbel", "point:invalid": "Fout", "point:far": "Ver weg" }, highlightedBuildingKey: "bag:bag-1" });
    act(() => vi.advanceTimersByTime(180));
    expect(markerState.instances).toHaveLength(0);
    expect(rendered.map.easeTo).not.toHaveBeenCalled();
    rendered.rerender({ ...rendered.props, highlightedBuildingKey: "point:far" });
    act(() => vi.advanceTimersByTime(180));
    expect(rendered.map.easeTo).not.toHaveBeenCalled();
    rendered.rerender({ ...rendered.props, highlightedBuildingKey: "unknown" });
    act(() => vi.advanceTimersByTime(180));
    expect(rendered.map.easeTo).not.toHaveBeenCalled();
  });

  it("begrensd hoverzoomen respecteert kaartlimieten en neemt de nieuwste benoeming tijdens wachten mee", async () => {
    const map = createMap();
    map.getZoom.mockReturnValue(21);
    const rendered = await renderLabels({ map, highlightedBuildingKey: "bag:bag-1" });
    rendered.rerender({ ...rendered.props, buildingLabels: { "bag:bag-1": "Gewijzigd" } });
    act(() => vi.advanceTimersByTime(180));
    expect(map.easeTo).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ zoom: 18.5 }));
    expect(map.container.textContent).toBe("Gewijzigd");
  });

  it("tekent niet op een kaart die tussen render en het passieve effect is verwijderd", async () => {
    const map = createMap();
    const rendered = renderHook(() => {
      const error = useObjectMapBuildingLabels({ map, ready: true, selectedBuildings: collection(building), buildingLabels: { "bag:bag-1": "Kantoor" }, highlightedBuildingKey: "bag:bag-1" });
      useLayoutEffect(() => { map.remove(); }, []);
      return error;
    });
    await act(async () => { await vi.dynamicImportSettled(); });
    act(() => vi.advanceTimersByTime(300));
    expect(markerState.instances).toHaveLength(0);
    expect(map.easeTo).not.toHaveBeenCalled();
    expect(rendered.result.current).toBeNull();
  });

  it("ruimt een kaartverwijdering op en annuleert een wachtende hover zonder waarschuwing of crash", async () => {
    const rendered = await renderLabels({ buildingLabels: { "bag:bag-1": "Kantoor" }, highlightedBuildingKey: "bag:bag-1" });
    act(() => rendered.map.remove());
    expect(markerState.instances[0].remove).toHaveBeenCalledOnce();
    rendered.rerender({ ...rendered.props, buildingLabels: { "bag:bag-1": "Nieuwe naam" } });
    act(() => vi.advanceTimersByTime(300));
    expect(rendered.map.easeTo).not.toHaveBeenCalled();
    expect(markerState.instances).toHaveLength(1);
    expect(rendered.result.current).toBeNull();
  });

  it("controleert de kaart opnieuw tussen Markerconstructie en toevoegen", async () => {
    const map = createMap();
    markerState.onCreate = () => map.remove();
    const rendered = await renderLabels({ map, buildingLabels: { "bag:bag-1": "Kantoor" } });
    expect(markerState.instances).toHaveLength(1);
    expect(markerState.instances[0].addTo).not.toHaveBeenCalled();
    expect(markerState.instances[0].remove).toHaveBeenCalledOnce();
    expect(rendered.result.current).toBeNull();
  });

  it("bouwt labels op de nieuwe kaart na een object-/locatiewissel zonder de oude kaart te gebruiken", async () => {
    const rendered = await renderLabels({ buildingLabels: { "bag:bag-1": "Kantoor" } });
    act(() => rendered.map.remove());
    const nextMap = createMap();
    rendered.rerender({ ...rendered.props, map: nextMap });
    await act(async () => { await vi.dynamicImportSettled(); });
    expect(markerState.instances).toHaveLength(2);
    expect(markerState.instances[1].addTo).toHaveBeenCalledWith(nextMap);
    expect(nextMap.container.textContent).toBe("Kantoor");
    expect(rendered.result.current).toBeNull();
  });

  it("meldt echte markerfouten veilig en niet-blokkerend, zonder naam of ruwe foutgegevens", async () => {
    markerState.addError = new Error("Private locatie of gebruikersnaam");
    const rendered = await renderLabels({ buildingLabels: { "bag:bag-1": "Kantoor" } });
    expect(rendered.result.current).toBe("Een gebouw kon niet op de kaart worden aangewezen. Je kaart en wijzigingen blijven bewaard.");
    expect(rendered.result.current).not.toContain("Private");
    expect(markerState.instances[0].remove).toHaveBeenCalledOnce();
    markerState.addError = null;
    rendered.rerender({ ...rendered.props, buildingLabels: { "bag:bag-1": "Nieuwe naam" } });
    expect(rendered.result.current).toBeNull();
    expect(rendered.map.container.textContent).toBe("Nieuwe naam");
  });
});
