import React from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeTerrainFeatureIds, terrainFeatureKey, terrainHighlightBounds } from "@/components/objects/objectMapTerrainHighlight";
import useObjectMapTerrainHighlight from "@/components/objects/useObjectMapTerrainHighlight";
import TerrainSelectionRow from "@/components/objects/TerrainSelectionRow";

const ring = [[4.48, 51.92], [4.482, 51.92], [4.482, 51.922], [4.48, 51.922], [4.48, 51.92]];
const feature = { type: "Feature", id: "terrain-1", geometry: { type: "Polygon", coordinates: [ring] } };
const other = { ...feature, id: "terrain-2", geometry: { type: "Polygon", coordinates: [ring.map(([lng, lat]) => [lng + 0.01, lat + 0.01])] } };
const collection = (...features) => ({ type: "FeatureCollection", features });
const navigationBounds = [[4.47, 51.91], [4.51, 51.95]];

function fakeMap() {
  const element = document.createElement("div");
  document.body.append(element);
  const handlers = new Map();
  return {
    element, handlers,
    getCanvasContainer: () => element,
    getMaxZoom: () => 22,
    getBearing: () => -24,
    getPitch: () => 42,
    fitBounds: vi.fn(), stop: vi.fn(),
    on: vi.fn((event, callback) => handlers.set(event, callback)),
    once: vi.fn((event, callback) => handlers.set(event, callback)),
    off: vi.fn((event, callback) => { if (handlers.get(event) === callback) handlers.delete(event); }),
  };
}
function renderHighlight(overrides = {}) {
  const props = { map: fakeMap(), ready: true, terrain: collection(feature, other), highlightedTerrainKey: feature.id, navigationBounds, ...overrides };
  return { ...renderHook(current => useObjectMapTerrainHighlight(current), { initialProps: props }), props };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); document.body.replaceChildren(); });

describe("terrain identity and bounds", () => {
  it("behoudt identiteit na herschikken en grensaanpassing; ontbrekende en dubbele ids worden eenmalig hersteld", () => {
    const missing = { ...feature, id: undefined };
    const normalized = normalizeTerrainFeatureIds(collection(missing, missing, other));
    const keys = normalized.features.map(terrainFeatureKey);
    expect(new Set(keys).size).toBe(3);
    expect(normalizeTerrainFeatureIds(collection(...normalized.features.slice().reverse())).features.map(terrainFeatureKey)).toEqual(keys.slice().reverse());
    expect(normalizeTerrainFeatureIds(collection({ ...normalized.features[0], geometry: other.geometry })).features[0].id).toBe(keys[0]);
    expect(normalized.features[0].properties.local_id).toBe(keys[0]);
    expect(missing.id).toBeUndefined();
  });
  it("omvat alle MultiPolygon-delen en weigert vreemde, open of te verre geometrie", () => {
    const multi = { ...feature, geometry: { type: "MultiPolygon", coordinates: [feature.geometry.coordinates, other.geometry.coordinates] } };
    expect(terrainHighlightBounds(multi, navigationBounds)).toEqual([[4.48, 51.92], [4.492, 51.931999999999995]]);
    expect(terrainHighlightBounds(multi, [[4.47, 51.91], [4.485, 51.95]])).toBeNull();
    expect(terrainHighlightBounds({ ...feature, geometry: { type: "Polygon", coordinates: [ring.slice(1)] } }, navigationBounds)).toBeNull();
    expect(terrainHighlightBounds({ ...feature, geometry: { type: "Point", coordinates: ring[0] } }, navigationBounds)).toBeNull();
    expect(terrainHighlightBounds({ ...feature, geometry: { type: "Polygon", coordinates: [[ring[0], ring[0], ring[0], ring[0]]] } }, navigationBounds)).toBeNull();
  });
});

describe("terrain list camera", () => {
  it("past het hele terrein met marge na dwell in beeld met behoud van pitch en bearing", () => {
    const { props } = renderHighlight();
    act(() => vi.advanceTimersByTime(179));
    expect(props.map.fitBounds).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(props.map.fitBounds).toHaveBeenCalledWith([[4.48, 51.92], [4.482, 51.922]], { padding: 56, maxZoom: 18.5, duration: 550, linear: true, bearing: -24, pitch: 42 });
  });
  it("annuleert verlaten, laat nieuwste hover winnen en springt niet terug na verlaten", () => {
    const rendered = renderHighlight();
    act(() => vi.advanceTimersByTime(120));
    rendered.rerender({ ...rendered.props, highlightedTerrainKey: null });
    act(() => vi.advanceTimersByTime(200));
    expect(rendered.props.map.fitBounds).not.toHaveBeenCalled();
    rendered.rerender({ ...rendered.props, highlightedTerrainKey: feature.id });
    act(() => vi.advanceTimersByTime(100));
    rendered.rerender({ ...rendered.props, highlightedTerrainKey: other.id });
    act(() => vi.advanceTimersByTime(180));
    expect(rendered.props.map.fitBounds).toHaveBeenCalledOnce();
    expect(rendered.props.map.fitBounds.mock.calls[0][0][0]).toEqual(other.geometry.coordinates[0][0]);
    rendered.rerender({ ...rendered.props, highlightedTerrainKey: null });
    act(() => vi.advanceTimersByTime(1000));
    expect(rendered.props.map.fitBounds).toHaveBeenCalledOnce();
  });
  it("respecteert verminderde beweging en behoudt de maximale kaartzoom", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const map = fakeMap(); map.getMaxZoom = () => 17;
    renderHighlight({ map });
    act(() => vi.advanceTimersByTime(180));
    expect(map.fitBounds.mock.calls[0][1]).toMatchObject({ duration: 0, maxZoom: 17 });
  });
  it("herstart niet na geometrie-updates en gebruikt bij lopende dwell de actuele grens", () => {
    const rendered = renderHighlight();
    rendered.rerender({ ...rendered.props, terrain: collection({ ...feature, geometry: other.geometry }) });
    act(() => vi.advanceTimersByTime(180));
    expect(rendered.props.map.fitBounds.mock.calls[0][0][0]).toEqual(other.geometry.coordinates[0][0]);
    rendered.rerender({ ...rendered.props, terrain: collection(feature) });
    act(() => vi.advanceTimersByTime(1000));
    expect(rendered.props.map.fitBounds).toHaveBeenCalledOnce();
  });
  it("annuleert geplande beweging tijdens grenspunt slepen of verwijderen van de kaart", () => {
    const rendered = renderHighlight();
    rendered.rerender({ ...rendered.props, dragging: true });
    act(() => vi.advanceTimersByTime(1000));
    expect(rendered.props.map.fitBounds).not.toHaveBeenCalled();
    rendered.rerender(rendered.props);
    rendered.props.map.element.remove();
    act(() => vi.advanceTimersByTime(1000));
    expect(rendered.props.map.fitBounds).not.toHaveBeenCalled();
  });
  it("vliegt nooit naar verdwenen, dubbelzinnige of buiten de kaart gelegen ids", () => {
    const rendered = renderHighlight({ terrain: collection(feature, feature) });
    act(() => vi.advanceTimersByTime(180));
    expect(rendered.props.map.fitBounds).not.toHaveBeenCalled();
    rendered.rerender({ ...rendered.props, highlightedTerrainKey: "missing" });
    act(() => vi.advanceTimersByTime(180));
    expect(rendered.props.map.fitBounds).not.toHaveBeenCalled();
  });
});

describe("TerrainSelectionRow", () => {
  it("ondersteunt hover, focus en aantikken in alleen bekijken zonder verwijderactie", () => {
    const onHighlight = vi.fn();
    render(<TerrainSelectionRow selectionKey="t1" label="Terreindeel 1" viewOnly onHighlight={onHighlight} />);
    const row = screen.getByRole("button", { name: "Terreindeel 1 weergeven op kaart" });
    fireEvent.mouseEnter(row); expect(onHighlight).toHaveBeenLastCalledWith("t1");
    fireEvent.mouseLeave(row); expect(onHighlight).toHaveBeenLastCalledWith(null);
    fireEvent.focus(row); expect(onHighlight).toHaveBeenLastCalledWith("t1");
    fireEvent.blur(row); expect(onHighlight).toHaveBeenLastCalledWith(null);
    fireEvent.click(row); expect(onHighlight).toHaveBeenLastCalledWith("t1");
    expect(screen.queryByRole("button", { name: /verwijderen/ })).not.toBeInTheDocument();
  });
  it("verwijderen verplaatst de camera niet en laat de bewerkactie afzonderlijk", () => {
    const onHighlight = vi.fn(), onRemove = vi.fn();
    render(<TerrainSelectionRow selectionKey="t1" label="Terreindeel 1" onHighlight={onHighlight} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Terreindeel 1 verwijderen" }));
    expect(onHighlight).toHaveBeenCalledExactlyOnceWith(null);
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
