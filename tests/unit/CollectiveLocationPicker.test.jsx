import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ maps: [], markers: [], mapOptions: null }));
vi.mock("@/components/navigation/mapboxConfig", () => ({ MAPBOX_PUBLIC_TOKEN: "test-public-token" }));
vi.mock("mapbox-gl", () => ({ default: {
  Map: class {
    handlers = {};
    remove = vi.fn(); resize = vi.fn(); addControl = vi.fn();
    constructor(options) { state.mapOptions = options; state.maps.push(this); }
    on(event, callback) { this.handlers[event] = callback; return this; }
    getCenter() { return { lng: 5.2, lat: 52.1 }; }
  },
  Marker: class {
    remove = vi.fn();
    setLngLat = vi.fn(function(point) { this.point = point; return this; });
    addTo = vi.fn(function() { return this; });
    constructor() { state.markers.push(this); }
  },
  NavigationControl: class {},
} }));

import CollectiveLocationPicker from "@/components/collectief/CollectiveLocationPicker";

beforeEach(() => { state.maps.length = 0; state.markers.length = 0; state.mapOptions = null; });

async function ready() {
  await waitFor(() => expect(state.maps).toHaveLength(1));
  act(() => state.maps[0].handlers.load());
}

describe("kaartstartpunt voor adresloos collectief", () => {
  it("start zonder coördinaten in Nederland, niet op nul/nul, en slaat niets automatisch op", async () => {
    const confirm = vi.fn();
    render(<CollectiveLocationPicker location={{ latitude: null, longitude: null }} onConfirm={confirm} onCancel={vi.fn()} />);
    await ready();
    expect(state.mapOptions).toMatchObject({ center: [5.4, 52.2], minZoom: 6, renderWorldCopies: false, maxBounds: [[3.1, 50.65], [7.4, 53.7]] });
    expect(screen.getByRole("button", { name: "Locatie bevestigen" })).toBeDisabled();
    expect(confirm).not.toHaveBeenCalled();
  });
  it("bevestigt een klik als expliciet handmatig kaartstartpunt zonder fictief adres", async () => {
    const confirm = vi.fn();
    render(<CollectiveLocationPicker location={{}} onConfirm={confirm} onCancel={vi.fn()} />);
    await ready();
    act(() => state.maps[0].handlers.click({ lngLat: { lng: 5.15, lat: 52.24 } }));
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Locatie bevestigen" }));
    expect(confirm).toHaveBeenCalledWith({ longitude: 5.15, latitude: 52.24, geocoding_status: "manual", bag_address_id: null });
    expect(confirm.mock.calls[0][0]).not.toHaveProperty("address");
  });
  it("biedt het kaartmidden als toetsenbordalternatief en toont hetzelfde punt", async () => {
    const confirm = vi.fn();
    render(<CollectiveLocationPicker location={{}} onConfirm={confirm} onCancel={vi.fn()} />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Midden van kaart gebruiken" }));
    expect(state.markers).toHaveLength(1);
    expect(state.markers[0].point).toEqual([5.2, 52.1]);
    fireEvent.click(screen.getByRole("button", { name: "Locatie bevestigen" }));
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ longitude: 5.2, latitude: 52.1 }));
  });
  it("gebruikt het bovenliggende collectief als referentie maar niet als automatisch bevestigd punt", async () => {
    render(<CollectiveLocationPicker location={{}} referenceLocation={{ latitude: 52.25, longitude: 5.1 }} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await ready();
    expect(state.mapOptions.center).toEqual([5.1, 52.25]);
    expect(screen.getByRole("button", { name: "Locatie bevestigen" })).toBeDisabled();
  });
  it("weigert ongeldige klikpunten en houdt de oude invoer intact bij kaartfout", async () => {
    const confirm = vi.fn();
    render(<CollectiveLocationPicker location={{ latitude: 52, longitude: 5 }} onConfirm={confirm} onCancel={vi.fn()} />);
    await ready();
    act(() => state.maps[0].handlers.click({ lngLat: { lng: NaN, lat: 90 } }));
    expect(state.markers[0].point).toEqual([5, 52]);
    act(() => state.maps[0].handlers.error());
    expect(screen.getByRole("alert")).toHaveTextContent("niet volledig worden geladen");
    expect(screen.getByRole("button", { name: "Locatie bevestigen" })).toBeDisabled();
    expect(confirm).not.toHaveBeenCalled();
  });
  it("ruimt de kaart en marker op bij sluiten", async () => {
    const { unmount } = render(<CollectiveLocationPicker location={{ latitude: 52, longitude: 5 }} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await ready();
    unmount();
    expect(state.maps[0].remove).toHaveBeenCalled();
    expect(state.markers[0].remove).toHaveBeenCalled();
  });
});
