import { describe, expect, it } from "vitest";
import {
  appendPolygon,
  editableVertices,
  featureCollectionAreaSquareMeters,
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
});
