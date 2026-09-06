import { describe, expect, it } from "vitest";
import {
  appendPolygon,
  editableVertices,
  featureCollectionAreaSquareMeters,
  matchMapboxBuildingToBagCandidate,
  normalizeFeatureCollection,
  replaceVertex,
  suggestAutomaticBuildingIds,
} from "../../src/components/objects/objectMapGeometry";

describe("objectkaartgeometrie", () => {
  it("normaliseert GeoJSON en sluit een getekend vlak", () => {
    const first = appendPolygon(null, [
      [4.48, 51.92],
      [4.481, 51.92],
      [4.481, 51.921],
    ], { source: "user_drawn" });
    const collection = appendPolygon(first, [
      [4.482, 51.92],
      [4.483, 51.92],
      [4.483, 51.921],
    ], { source: "user_drawn" });

    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features).toHaveLength(2);
    const ring = collection.features[0].geometry.coordinates[0];
    expect(ring).toHaveLength(4);
    expect(ring.at(-1)).toEqual(ring[0]);
    expect(featureCollectionAreaSquareMeters(collection)).toBeGreaterThan(1_000);
  });

  it("leest ook opgeslagen JSON-strings zonder ongeldige features door te geven", () => {
    const collection = normalizeFeatureCollection(JSON.stringify({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[4, 52], [5, 52], [5, 53], [4, 52]]] } },
        { type: "Feature", properties: {}, geometry: null },
      ],
    }));

    expect(collection.features).toHaveLength(1);
    expect(normalizeFeatureCollection("geen json").features).toEqual([]);
  });

  it("kan hoekpunten van Polygon en MultiPolygon veilig verplaatsen", () => {
    const collection = normalizeFeatureCollection({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {},
        geometry: {
          type: "MultiPolygon",
          coordinates: [
            [[[4, 52], [4.1, 52], [4, 52.1], [4, 52]]],
            [[[5, 53], [5.1, 53], [5, 53.1], [5, 53]]],
          ],
        },
      }],
    });
    const vertices = editableVertices(collection, "terrain");
    const reference = vertices.features.find(feature => feature.properties.polygon_index === 1 && feature.properties.vertex_index === 0).properties;
    const updated = replaceVertex(collection, reference, [5.2, 53.2]);

    expect(updated.features[0].geometry.coordinates[1][0][0]).toEqual([5.2, 53.2]);
    expect(updated.features[0].geometry.coordinates[1][0].at(-1)).toEqual([5.2, 53.2]);
    expect(collection.features[0].geometry.coordinates[1][0][0]).toEqual([5, 53]);
  });

  it("stelt het pand rond de objectpositie voor en anders het dichtstbijzijnde pand", () => {
    const feature = (id, ring) => ({
      type: "Feature",
      id,
      properties: { source: "pdok_bag", source_feature_id: id },
      geometry: { type: "Polygon", coordinates: [ring] },
    });
    const nearby = feature("bag-near", [[4.001, 52], [4.002, 52], [4.002, 52.001], [4.001, 52]]);
    const containing = feature("bag-containing", [[3.999, 51.999], [4.002, 51.999], [4.002, 52.002], [3.999, 51.999]]);

    expect(suggestAutomaticBuildingIds([nearby, containing], [4, 52])).toEqual(["bag-containing"]);
    expect(suggestAutomaticBuildingIds([nearby], [4, 52])).toEqual(["bag-near"]);
    expect(suggestAutomaticBuildingIds([nearby], [Number.NaN, 52])).toEqual([]);
    expect(suggestAutomaticBuildingIds([nearby], [null, null])).toEqual([]);
    expect(suggestAutomaticBuildingIds([nearby], ["", " "])).toEqual([]);
    expect(suggestAutomaticBuildingIds([nearby], [0, 0])).toEqual([]);
  });

  it("koppelt een klein Mapbox 3D-gebouw aan het overlappende BAG-pand", () => {
    const feature = (id, minLng, minLat, maxLng, maxLat) => ({
      type: "Feature",
      id,
      properties: { source: "pdok_bag", source_feature_id: id },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [minLng, minLat],
          [maxLng, minLat],
          [maxLng, maxLat],
          [minLng, maxLat],
          [minLng, minLat],
        ]],
      },
    });
    const left = feature("bag-left", 6.0700, 52.4470, 6.0702, 52.4472);
    const right = feature("bag-right", 6.0705, 52.4470, 6.0707, 52.4472);
    const mapboxBuilding = feature("temporary-mapbox-id", 6.07049, 52.44699, 6.07071, 52.44721);

    expect(matchMapboxBuildingToBagCandidate(mapboxBuilding, [left, right], [6.0706, 52.4471]))
      .toMatchObject({ properties: { source_feature_id: "bag-right" } });
  });

  it("gebruikt de gebouwgeometrie wanneer het 3D-perspectief het klikpunt verschuift", () => {
    const bag = {
      type: "Feature",
      properties: { source: "pdok_bag", source_feature_id: "bag-small" },
      geometry: { type: "Polygon", coordinates: [[[6, 52], [6.0002, 52], [6.0002, 52.0002], [6, 52.0002], [6, 52]]] },
    };
    const mapboxBuilding = {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[6.00001, 52.00001], [6.00019, 52.00001], [6.00019, 52.00019], [6.00001, 52.00019], [6.00001, 52.00001]]] },
    };

    expect(matchMapboxBuildingToBagCandidate(mapboxBuilding, [bag], [6.0004, 52.0004]))
      .toMatchObject({ properties: { source_feature_id: "bag-small" } });
  });

  it("weigert een verre of niet-eenduidige Mapbox-koppeling", () => {
    const candidate = (id, offset = 0) => ({
      type: "Feature",
      properties: { source: "pdok_bag", source_feature_id: id },
      geometry: { type: "Polygon", coordinates: [[[4 + offset, 52], [4.001 + offset, 52], [4.001 + offset, 52.001], [4 + offset, 52.001], [4 + offset, 52]]] },
    });
    const building = candidate("mapbox");

    expect(matchMapboxBuildingToBagCandidate(building, [candidate("bag-a"), candidate("bag-b")], [4.0005, 52.0005])).toBeNull();
    expect(matchMapboxBuildingToBagCandidate(building, [candidate("far-away", 0.02)], [4.0005, 52.0005])).toBeNull();
  });

  it("laat alleen een exacte klik één van meerdere overlappende BAG-panden kiezen", () => {
    const feature = (id, minLng, maxLng) => ({
      type: "Feature",
      properties: { source: "pdok_bag", source_feature_id: id },
      geometry: {
        type: "Polygon",
        coordinates: [[[minLng, 52], [maxLng, 52], [maxLng, 52.001], [minLng, 52.001], [minLng, 52]]],
      },
    });
    const mapboxBuilding = feature("mapbox", 4, 4.002);
    const left = feature("bag-left", 4, 4.0011);
    const right = feature("bag-right", 4.0009, 4.002);

    expect(matchMapboxBuildingToBagCandidate(mapboxBuilding, [left, right])).toBeNull();
    expect(matchMapboxBuildingToBagCandidate(mapboxBuilding, [left, right], [4.0004, 52.0005]))
      .toMatchObject({ properties: { source_feature_id: "bag-left" } });
    expect(matchMapboxBuildingToBagCandidate(mapboxBuilding, [left, right], [4.0016, 52.0005]))
      .toMatchObject({ properties: { source_feature_id: "bag-right" } });
    expect(matchMapboxBuildingToBagCandidate(mapboxBuilding, [left, right], [4.001, 52.0005])).toBeNull();
    expect(matchMapboxBuildingToBagCandidate(mapboxBuilding, [left, right], [4.0009, 52.0005]))
      .toMatchObject({ properties: { source_feature_id: "bag-left" } });
  });

  it("herkent echte gedeeltelijke overlap met evenwijdige randen", () => {
    const feature = (id, minLng, maxLng) => ({
      type: "Feature",
      properties: { source: "pdok_bag", source_feature_id: id },
      geometry: { type: "Polygon", coordinates: [[[minLng, 52], [maxLng, 52], [maxLng, 52.001], [minLng, 52.001], [minLng, 52]]] },
    });
    const mapboxBuilding = feature("mapbox", 4, 4.002);
    const partiallyOverlappingBag = feature("bag-partial", 4.001, 4.003);

    expect(matchMapboxBuildingToBagCandidate(mapboxBuilding, [partiallyOverlappingBag]))
      .toMatchObject({ properties: { source_feature_id: "bag-partial" } });
  });

  it("negeert een minimale geometrische splinter met een buurgebouw", () => {
    const feature = (id, minLng, maxLng) => ({
      type: "Feature",
      properties: { source: "pdok_bag", source_feature_id: id },
      geometry: { type: "Polygon", coordinates: [[[minLng, 52], [maxLng, 52], [maxLng, 52.001], [minLng, 52.001], [minLng, 52]]] },
    });
    const mapboxBuilding = feature("mapbox", 4, 4.002);
    const matchingBag = feature("bag-correct", 4, 4.002);
    const neighbouringBag = feature("bag-neighbour", 4.00198, 4.003);

    expect(matchMapboxBuildingToBagCandidate(mapboxBuilding, [matchingBag, neighbouringBag], [4.0025, 52.0005]))
      .toMatchObject({ properties: { source_feature_id: "bag-correct" } });
  });

  it("ziet een binnenplaats of ruimte tussen MultiPolygon-delen niet als gebouwmatch", () => {
    const bagFeature = (id, geometry) => ({ type: "Feature", properties: { source: "pdok_bag", source_feature_id: id }, geometry });
    const courtyard = bagFeature("bag-u-vorm", {
      type: "Polygon",
      coordinates: [[
        [4, 52], [4.004, 52], [4.004, 52.004], [4.003, 52.004],
        [4.003, 52.001], [4.001, 52.001], [4.001, 52.004], [4, 52.004], [4, 52],
      ]],
    });
    const multipart = bagFeature("bag-meerdelig", {
      type: "MultiPolygon",
      coordinates: [
        [[[4.01, 52], [4.011, 52], [4.011, 52.004], [4.01, 52.004], [4.01, 52]]],
        [[[4.013, 52], [4.014, 52], [4.014, 52.004], [4.013, 52.004], [4.013, 52]]],
      ],
    });
    const shedInCourtyard = bagFeature("mapbox-shed", {
      type: "Polygon",
      coordinates: [[[4.0015, 52.002], [4.0025, 52.002], [4.0025, 52.003], [4.0015, 52.003], [4.0015, 52.002]]],
    });
    const shedInMultipartGap = bagFeature("mapbox-gap", {
      type: "Polygon",
      coordinates: [[[4.0115, 52.002], [4.0125, 52.002], [4.0125, 52.003], [4.0115, 52.003], [4.0115, 52.002]]],
    });

    expect(matchMapboxBuildingToBagCandidate(shedInCourtyard, [courtyard], [4.002, 52.0025])).toBeNull();
    expect(matchMapboxBuildingToBagCandidate(shedInMultipartGap, [multipart], [4.012, 52.0025])).toBeNull();
  });

  it("ziet alleen overlappende begrenzingsvakken niet als geometrische overlap", () => {
    const feature = (id, coordinates) => ({
      type: "Feature",
      properties: { source: "pdok_bag", source_feature_id: id },
      geometry: { type: "Polygon", coordinates: [[...coordinates, coordinates[0]]] },
    });
    const lowerLeftTriangle = feature("bag-driehoek", [[4, 52], [4.002, 52], [4, 52.002]]);
    const upperRightTriangle = feature("mapbox-driehoek", [[4.002, 52.002], [4.002, 52.0008], [4.0008, 52.002]]);

    expect(matchMapboxBuildingToBagCandidate(upperRightTriangle, [lowerLeftTriangle], [4.0015, 52.0015])).toBeNull();
  });
});
