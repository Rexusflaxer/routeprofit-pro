import { normalizeFeatureCollection } from "./objectMapGeometry";

export function terrainFeatureKey(feature) {
  const value = feature?.id ?? feature?.properties?.local_id;
  return value === undefined || value === null ? null : String(value);
}

// Assign missing legacy identities once when opening the form, not during a
// drag or render. Existing API normalization persists id/local_id on saving.
export function normalizeTerrainFeatureIds(value) {
  const collection = normalizeFeatureCollection(value);
  const used = new Set();
  return { ...collection, features: collection.features.map(feature => {
    let id = terrainFeatureKey(feature);
    if (id && !used.has(id)) { used.add(id); return feature; }
    if (!id || used.has(id)) {
      let hash = 2166136261;
      for (const character of JSON.stringify(feature.geometry)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
      const base = `terrain:legacy:${(hash >>> 0).toString(16)}`;
      id = base;
      let suffix = 1;
      while (used.has(id)) id = `${base}:${suffix++}`;
    }
    used.add(id);
    return { ...feature, id, properties: { ...feature.properties, local_id: id } };
  }) };
}

export function terrainHighlightBounds(feature, navigationBounds) {
  const geometry = feature?.geometry;
  const polygons = geometry?.type === "Polygon" ? [geometry.coordinates]
    : geometry?.type === "MultiPolygon" ? geometry.coordinates : null;
  if (!Array.isArray(polygons) || !polygons.length || polygons.length > 100) return null;
  let count = 0;
  const bounds = [[Infinity, Infinity], [-Infinity, -Infinity]];
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length || polygon.length > 100) return null;
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4 || (count += ring.length) > 10_000) return null;
      for (const coordinate of ring) {
        if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
        const [lng, lat] = coordinate;
        if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 85) return null;
        if (navigationBounds && (lng < navigationBounds[0][0] || lng > navigationBounds[1][0]
          || lat < navigationBounds[0][1] || lat > navigationBounds[1][1])) return null;
        bounds[0][0] = Math.min(bounds[0][0], lng);
        bounds[0][1] = Math.min(bounds[0][1], lat);
        bounds[1][0] = Math.max(bounds[1][0], lng);
        bounds[1][1] = Math.max(bounds[1][1], lat);
      }
      if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) return null;
      const origin = ring[0];
      const area = ring.slice(1).reduce((sum, point, index) => sum
        + (ring[index][0] - origin[0]) * (point[1] - origin[1])
        - (point[0] - origin[0]) * (ring[index][1] - origin[1]), 0);
      if (Math.abs(area) < 1e-14) return null;
    }
  }
  return bounds;
}
