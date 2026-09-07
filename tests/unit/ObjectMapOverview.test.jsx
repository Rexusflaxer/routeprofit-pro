import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ObjectMapOverview, { objectMapInventoryRows } from "@/components/objects/ObjectMapOverview";

const collection = features => ({ type: "FeatureCollection", features });
const square = (id, properties = {}, size = 0.001) => ({
  type: "Feature", id, properties,
  geometry: { type: "Polygon", coordinates: [[[5, 52], [5 + size, 52], [5 + size, 52 + size], [5, 52 + size], [5, 52]]] },
});
const bag = square("bag-1", { source: "pdok_bag", source_feature_id: "bag-1", source_identificatie: "0246100000012576" });
const manual = square("own-1", { source: "manual", local_id: "own-1" });
const configuration = overrides => ({ building_selection_mode: "manual", selected_bag_feature_ids: [],
  building_polygon_geojson: collection([]), manual_building_geojson: collection([]), building_selection_points: [], building_labels: {},
  object_area_geojson: collection([]), ...overrides });

describe("ObjectMapOverview", () => {
  it("toont opgeslagen BAG-gebouwen in de standaard inventaristabel zonder eigen acties of kaart", () => {
    render(<ObjectMapOverview configuration={configuration({ selected_bag_feature_ids: ["bag-1"], building_polygon_geojson: collection([bag]), building_labels: { "bag:bag-1": "Receptie" } })} workspace="buildings" />);
    const table = screen.getByRole("table", { name: "Opgeslagen gebouwen" });
    expect(within(table).getAllByRole("columnheader").map(item => item.textContent)).toEqual(["Naam", "Bron", "Identificatie", "Oppervlakte"]);
    const row = screen.getByText("Receptie").closest("tr");
    expect(within(row).getByText("BAG / Kadaster")).toBeInTheDocument();
    expect(within(row).getByText("0246100000012576")).toBeInTheDocument();
    expect(within(row).getByText(/m²$/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("behoudt een geselecteerde BAG-ID zonder geladen contour met onbekende oppervlakte", () => {
    const saved = configuration({ selected_bag_feature_ids: ["missing-bag", "missing-bag"], building_labels: { "bag:missing-bag": "Magazijn" } });
    render(<ObjectMapOverview configuration={saved} />);
    const row = screen.getByText("Magazijn").closest("tr");
    expect(within(row).getByText("missing-bag")).toBeInTheDocument();
    expect(within(row).getByText("Onbekend")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  it("toont eigen gebouwpunten expliciet zonder BAG of verzonnen oppervlakte", () => {
    const saved = configuration({ building_selection_points: [{ id: "point-1", latitude: 52, longitude: 5 }, { id: "point-1", latitude: 52, longitude: 5 }],
      building_labels: { "point:point-1": "Fietsenstalling" } });
    render(<ObjectMapOverview configuration={saved} />);
    const row = screen.getByText("Fietsenstalling").closest("tr");
    expect(within(row).getByText("Kaartselectie · zonder BAG")).toBeInTheDocument();
    expect(within(row).getByText("Geen BAG-identificatie")).toBeInTheDocument();
    expect(within(row).getByText("Onbekend")).toBeInTheDocument();
    expect(screen.queryByText("point-1")).not.toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  it("telt handmatige contouren in zowel het gecombineerde als aparte veld niet dubbel", () => {
    const saved = configuration({ building_polygon_geojson: collection([manual]), manual_building_geojson: collection([{ ...manual, properties: { ...manual.properties, source: "user_drawn" } }]),
      building_labels: { "manual:own-1": "Oude werkplaats" } });
    expect(objectMapInventoryRows(saved)).toHaveLength(1);
    render(<ObjectMapOverview configuration={saved} />);
    expect(screen.getAllByText("Oude werkplaats")).toHaveLength(1);
    expect(screen.getByText("Eigen contour · zonder BAG")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  it("herkent ook identieke oude contouren zonder stabiele ID in beide velden", () => {
    const { id: _id, ...withoutId } = manual;
    const old = { ...withoutId, properties: {} };
    expect(objectMapInventoryRows(configuration({ building_polygon_geojson: collection([old]), manual_building_geojson: collection([old]) }))).toHaveLength(1);
  });

  it("voegt niet-geselecteerde BAG-contouren niet aan een bewust lege handmatige selectie toe", () => {
    render(<ObjectMapOverview configuration={configuration({ building_polygon_geojson: collection([bag]) })} />);
    expect(screen.getByText("Bewust geen gebouwen gemarkeerd")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("0246100000012576")).not.toBeInTheDocument();
  });

  it("legt automatische bepaling uit zonder kandidaat-ID's of punten als opgeslagen handmatige selectie te tellen", () => {
    render(<ObjectMapOverview configuration={configuration({ building_selection_mode: "automatic", selected_bag_feature_ids: ["candidate-1"], building_selection_points: [{ id: "point-1" }] })} />);
    expect(screen.getByText("Gebouwen worden automatisch bepaald")).toBeInTheDocument();
    expect(screen.getByText(/op basis van de adresnabijheid/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/candidate-1/)).not.toBeInTheDocument();
    expect(screen.queryByText("Bewust geen gebouwen gemarkeerd")).not.toBeInTheDocument();
  });

  it("markeert oude opgeslagen contouren in automatische modus uitdrukkelijk als historisch", () => {
    render(<ObjectMapOverview configuration={configuration({ building_selection_mode: "automatic", building_polygon_geojson: collection([bag]) })} />);
    expect(screen.getByRole("table", { name: "Opgeslagen gebouwen" })).toBeInTheDocument();
    expect(screen.getByText(/eerder opgeslagen contouren; deze zijn geen handmatige selectie/)).toBeInTheDocument();
    expect(screen.getByText("0246100000012576")).toBeInTheDocument();
  });

  it("kan legacy GeoJSON zonder selectielijst lezen zonder een onbekende bron als BAG voor te stellen", () => {
    const rows = objectMapInventoryRows({ building_polygon_geojson: JSON.stringify(collection([bag, square("legacy-1")])) });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ key: "bag:bag-1", source: "BAG / Kadaster" });
    expect(rows[1]).toMatchObject({ key: "manual:legacy-1", source: "Eigen contour · zonder BAG", identification: "Geen BAG-identificatie" });
    expect(rows[1].area).toBeGreaterThan(0);
  });

  it("toont terreindelen met eigen namen, perceelherkomst, identificatie en berekende oppervlakte", () => {
    const parcel = square("terrain-1", { name: "Noordterrein", derived_from: "pdok_brk", derived_from_id: "HDE00-C-4979" }, 0.01);
    const own = square("terrain-2", { label: "Binnenplaats" });
    render(<ObjectMapOverview configuration={configuration({ object_area_geojson: collection([parcel, own, square("terrain-3")]) })} workspace="terrain" />);
    expect(screen.getByRole("table", { name: "Opgeslagen terreinen" })).toBeInTheDocument();
    const row = screen.getByText("Noordterrein").closest("tr");
    expect(within(row).getByText("Kadastraal perceel (PDOK)")).toBeInTheDocument();
    expect(within(row).getByText("HDE00-C-4979")).toBeInTheDocument();
    expect(within(row).getByText(/ha$/)).toBeInTheDocument();
    expect(screen.getByText("Binnenplaats")).toBeInTheDocument();
    expect(screen.getByText("Terreindeel 3")).toBeInTheDocument();
    expect(screen.getByText(/kunnen afwijken van het oorspronkelijke kadastrale perceel/)).toBeInTheDocument();
  });

  it("heeft gerichte lege toestanden voor een oningesteld object en ontbrekend terrein", () => {
    const rendered = render(<ObjectMapOverview />);
    expect(screen.getByText("Nog geen gebouwen vastgelegd")).toBeInTheDocument();
    rendered.rerender(<ObjectMapOverview configuration={configuration()} workspace="terrain" />);
    expect(screen.getByText("Nog geen terrein vastgelegd")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("toont opgeslagen namen als veilige tekst en laat ontbrekende of ongeldige oppervlakte onbekend", () => {
    const unsafeName = "<img src=x onerror=alert(1)>";
    const malformed = { ...bag, geometry: { type: "Polygon", coordinates: [[[5, 52], [6, 52], [6, 53]]] } };
    const saved = configuration({ selected_bag_feature_ids: ["bag-1"], building_polygon_geojson: collection([malformed]), building_labels: { "bag:bag-1": unsafeName } });
    const before = JSON.stringify(saved);
    render(<ObjectMapOverview configuration={saved} />);
    expect(screen.getByText(unsafeName)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("Onbekend")).toBeInTheDocument();
    expect(JSON.stringify(saved)).toBe(before);
    expect(objectMapInventoryRows({ building_polygon_geojson: "invalid json" })).toEqual([]);
  });
});
