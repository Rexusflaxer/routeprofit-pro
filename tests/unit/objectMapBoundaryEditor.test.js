import { describe, expect, it } from "vitest";
import { boundaryHandleCollection, insertBoundaryHandle, moveBoundaryHandle, removeBoundaryHandle, shiftBoundaryHandles, validBoundaryFeature } from "@/components/objects/objectMapBoundaryEditor";

const ring = [[4.48, 51.92], [4.481, 51.92], [4.481, 51.921], [4.48, 51.921], [4.48, 51.92]];
const feature = { type: "Feature", properties: { source: "pdok_brk", source_feature_id: "parcel-1" }, geometry: { type: "Polygon", coordinates: [ring] } };
const collection = { type: "FeatureCollection", features: [feature] };
const project = coordinate => ({ x: (coordinate[0] - 4.48) * 100_000, y: (coordinate[1] - 51.92) * 100_000 });
const reference = vertex_index => ({ target: "terrain", feature_index: 0, polygon_index: 0, ring_index: 0, vertex_index });

describe("objectMapBoundaryEditor", () => {
  it("houdt een perceel met 6000 punten tijdens slepen volledig intact zonder kwadratische paarvergelijkingen", () => {
    const denseRing = Array.from({ length: 6000 }, (_, index) => {
      const angle = index / 6000 * Math.PI * 2;
      return [4.48 + 0.01 * Math.cos(angle), 51.92 + 0.01 * Math.sin(angle)];
    });
    denseRing.push([...denseRing[0]]);
    let terrain = { type: "FeatureCollection", features: [{ ...feature, geometry: { type: "Polygon", coordinates: [denseRing] } }] };
    const started = performance.now();
    for (let sample = 1; sample <= 10; sample += 1) {
      const result = moveBoundaryHandle(terrain, reference(0), [denseRing[0][0] + sample * 0.0000001, denseRing[0][1]]);
      expect(result.error).toBeUndefined();
      terrain = result.collection;
    }
    // Generous regression budget: the previous all-pairs implementation did
    // about 180 million segment comparisons for these ten drag samples.
    expect(performance.now() - started).toBeLessThan(2000);
    expect(terrain.features[0].geometry.coordinates[0]).toHaveLength(6001);
    expect(terrain.features[0].geometry.coordinates[0].slice(1, -1)).toEqual(denseRing.slice(1, -1));
    expect(boundaryHandleCollection(terrain, [reference(0), reference(3000)]).features).toHaveLength(2);
    expect(removeBoundaryHandle(terrain, reference(3000)).error).toBeUndefined();
  });

  it("voegt uitsluitend op een aangeklikte lijn een punt toe, zonder andere punten te vereenvoudigen", () => {
    const result = insertBoundaryHandle(collection, { x: 50, y: 3 }, project);
    expect(result.inserted).toBe(true);
    expect(result.reference).toEqual(reference(1));
    const nextRing = result.collection.features[0].geometry.coordinates[0];
    expect(nextRing).toHaveLength(6);
    expect(nextRing[1][0]).toBeCloseTo(4.4805, 10);
    expect(nextRing[1][1]).toBe(51.92);
    expect(nextRing.filter((_, index) => index !== 1)).toEqual(ring);
    expect(result.collection.features[0].properties).toEqual(feature.properties);
    expect(collection.features[0].geometry.coordinates[0]).toHaveLength(5);
  });

  it("selecteert een bestaande hoek in plaats van er een dubbel punt naast te zetten", () => {
    const result = insertBoundaryHandle(collection, { x: 1, y: 2 }, project);
    expect(result.inserted).toBe(false);
    expect(result.reference).toEqual(reference(0));
    expect(result.collection.features[0].geometry.coordinates[0]).toEqual(ring);
  });

  it("plaatst geen punt in het midden van het terrein of buiten de grens", () => {
    expect(insertBoundaryHandle(collection, { x: 50, y: 50 }, project)).toBeNull();
    expect(insertBoundaryHandle(collection, { x: -50, y: -50 }, project)).toBeNull();
  });

  it("houdt alle bestaande handles gekoppeld aan hun eigen punt na invoegen of verwijderen", () => {
    expect(shiftBoundaryHandles([reference(0), reference(2)], reference(1), 1)).toEqual([reference(0), reference(3)]);
    expect(shiftBoundaryHandles([reference(0), reference(1), reference(3)], reference(1), -1)).toEqual([reference(0), reference(2)]);
  });

  it("bewaart de sluiting van de ring bij het verplaatsen en verwijderen van het eerste punt", () => {
    const moved = moveBoundaryHandle(collection, reference(0), [4.4799, 51.9199]);
    expect(moved.error).toBeUndefined();
    const nextRing = moved.collection.features[0].geometry.coordinates[0];
    expect(nextRing[0]).toEqual(nextRing.at(-1));
    const removed = removeBoundaryHandle(collection, reference(0));
    expect(removed.error).toBeUndefined();
    expect(removed.collection.features[0].geometry.coordinates[0]).toEqual([ring[1], ring[2], ring[3], ring[1]]);
  });

  it("laat een driehoek niet degenereren door een punt te verwijderen", () => {
    const triangle = removeBoundaryHandle(collection, reference(1)).collection;
    expect(removeBoundaryHandle(triangle, reference(0)).error).toMatch(/minimaal drie punten/);
  });

  it("wijst zelfdoorsnijdingen, dubbele punten en ongeldige coordinaten af", () => {
    expect(moveBoundaryHandle(collection, reference(1), [4.4799, 51.9208]).error).toMatch(/zichzelf kruisen/);
    expect(moveBoundaryHandle(collection, reference(1), ring[0]).error).toBeTruthy();
    expect(moveBoundaryHandle(collection, reference(1), [181, 51]).error).toBeTruthy();
  });

  it("laat een uitsparing niet buiten het eigen terrein of over de buitenrand bewegen", () => {
    const hole = [[4.4802, 51.9202], [4.4804, 51.9202], [4.4804, 51.9204], [4.4802, 51.9202]];
    const holed = { ...feature, geometry: { type: "Polygon", coordinates: [ring, hole] } };
    expect(validBoundaryFeature(holed)).toBe(true);
    expect(moveBoundaryHandle({ type: "FeatureCollection", features: [holed] }, { ...reference(0), ring_index: 1 }, [4.479, 51.9202]).error).toBeTruthy();
  });

  it("bewerkt uitsluitend het aangeklikte deel en de juiste ring van een multipolygoon", () => {
    const nextRing = ring.map(([lng, lat]) => [lng + 0.003, lat]);
    const multi = { type: "FeatureCollection", features: [{ ...feature, geometry: { type: "MultiPolygon", coordinates: [[ring], [nextRing]] } }] };
    const result = insertBoundaryHandle(multi, { x: 350, y: 0 }, project);
    expect(result.reference.polygon_index).toBe(1);
    expect(result.collection.features[0].geometry.coordinates[0]).toEqual([ring]);
    expect(result.collection.features[0].geometry.coordinates[1][0]).toHaveLength(6);
  });
});
