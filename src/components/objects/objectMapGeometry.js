const EARTH_RADIUS_METERS = 6378137;

export const emptyFeatureCollection = () => ({ type: "FeatureCollection", features: [] });

function parseJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function normalizeFeatureCollection(value) {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== "object") return emptyFeatureCollection();
  if (parsed.type === "FeatureCollection") {
    return {
      type: "FeatureCollection",
      features: Array.isArray(parsed.features) ? parsed.features.filter(feature => feature?.geometry) : [],
    };
  }
  if (parsed.type === "Feature" && parsed.geometry) return { type: "FeatureCollection", features: [parsed] };
  if (["Polygon", "MultiPolygon"].includes(parsed.type) && Array.isArray(parsed.coordinates)) {
    return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: parsed }] };
  }
  return emptyFeatureCollection();
}

export function featureSourceId(feature) {
  const properties = feature?.properties || {};
  return String(
    properties.source_feature_id
      || properties.pdok_feature_id
      || properties.bag_feature_id
      || feature?.id
      || properties.identificatie
      || "",
  ).trim();
}

export function selectedFeatureIds(features) {
  return [...new Set((features || []).map(featureSourceId).filter(Boolean))].sort();
}

export function polygonFeature(points, properties = {}) {
  const normalized = (points || [])
    .map(point => [Number(point?.[0]), Number(point?.[1])])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  if (normalized.length < 3) return null;
  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  const closed = first[0] === last[0] && first[1] === last[1]
    ? normalized
    : [...normalized, [...first]];
  return {
    type: "Feature",
    properties: { ...properties },
    geometry: { type: "Polygon", coordinates: [closed] },
  };
}

export function appendPolygon(collection, points, properties = {}) {
  const feature = polygonFeature(points, properties);
  if (!feature) return normalizeFeatureCollection(collection);
  const current = normalizeFeatureCollection(collection);
  return { ...current, features: [...current.features, feature] };
}

function walkGeometryCoordinates(geometry, visitor) {
  if (!geometry?.coordinates) return;
  const walk = coordinates => {
    if (!Array.isArray(coordinates)) return;
    if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
      visitor(coordinates);
      return;
    }
    coordinates.forEach(walk);
  };
  walk(geometry.coordinates);
}

export function featureCollectionBounds(...collections) {
  const bounds = { minLng: Infinity, minLat: Infinity, maxLng: -Infinity, maxLat: -Infinity };
  collections.forEach(value => {
    normalizeFeatureCollection(value).features.forEach(feature => {
      walkGeometryCoordinates(feature.geometry, coordinate => {
        const [lng, lat] = coordinate.map(Number);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
        bounds.minLng = Math.min(bounds.minLng, lng);
        bounds.minLat = Math.min(bounds.minLat, lat);
        bounds.maxLng = Math.max(bounds.maxLng, lng);
        bounds.maxLat = Math.max(bounds.maxLat, lat);
      });
    });
  });
  return Number.isFinite(bounds.minLng) ? bounds : null;
}

function polygonContainsCoordinate(rings, coordinate) {
  const inRing = ring => {
    let inside = false;
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
      const [x, y] = ring[index] || [];
      const [previousX, previousY] = ring[previous] || [];
      const intersects = ((y > coordinate[1]) !== (previousY > coordinate[1]))
        && coordinate[0] < ((previousX - x) * (coordinate[1] - y)) / ((previousY - y) || Number.EPSILON) + x;
      if (intersects) inside = !inside;
    }
    return inside;
  };
  return Array.isArray(rings?.[0])
    && inRing(rings[0])
    && !(rings.slice(1).some(inRing));
}

function featureContainsCoordinate(feature, coordinate) {
  if (feature?.geometry?.type === "Polygon") return polygonContainsCoordinate(feature.geometry.coordinates, coordinate);
  if (feature?.geometry?.type === "MultiPolygon") {
    return (feature.geometry.coordinates || []).some(polygon => polygonContainsCoordinate(polygon, coordinate));
  }
  return false;
}

function segmentDistanceSquared(point, start, end) {
  const deltaX = end[0] - start[0];
  const deltaY = end[1] - start[1];
  if (deltaX === 0 && deltaY === 0) return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2;
  const projection = Math.max(0, Math.min(1, ((point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaY) / (deltaX ** 2 + deltaY ** 2)));
  const projectedX = start[0] + projection * deltaX;
  const projectedY = start[1] + projection * deltaY;
  return (point[0] - projectedX) ** 2 + (point[1] - projectedY) ** 2;
}

function featureDistanceSquared(feature, coordinate) {
  if (featureContainsCoordinate(feature, coordinate)) return 0;
  const latitudeScale = Math.max(0.1, Math.cos(coordinate[1] * Math.PI / 180));
  const project = point => [(Number(point?.[0]) - coordinate[0]) * latitudeScale, Number(point?.[1]) - coordinate[1]];
  const polygons = feature?.geometry?.type === "MultiPolygon"
    ? feature.geometry.coordinates || []
    : feature?.geometry?.type === "Polygon"
      ? [feature.geometry.coordinates || []]
      : [];
  let minimum = Infinity;
  polygons.forEach(rings => rings.forEach(ring => {
    for (let index = 1; index < ring.length; index += 1) {
      const start = project(ring[index - 1]);
      const end = project(ring[index]);
      if (![...start, ...end].every(Number.isFinite)) continue;
      minimum = Math.min(minimum, segmentDistanceSquared([0, 0], start, end));
    }
  }));
  return minimum;
}

export function suggestAutomaticBuildingIds(candidates, anchor) {
  const coordinate = [Number(anchor?.[0]), Number(anchor?.[1])];
  if (!coordinate.every(Number.isFinite)) return [];
  const ranked = (candidates || [])
    .map(feature => ({ feature, id: featureSourceId(feature), distance: featureDistanceSquared(feature, coordinate) }))
    .filter(candidate => candidate.id && Number.isFinite(candidate.distance))
    .sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id));
  return ranked.length ? [ranked[0].id] : [];
}

function ringAreaSquareMeters(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return 0;
  const averageLatitude = ring.reduce((total, point) => total + Number(point?.[1] || 0), 0) / ring.length;
  const cosLatitude = Math.cos(averageLatitude * Math.PI / 180);
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [lngA, latA] = ring[index].map(Number);
    const [lngB, latB] = ring[index + 1].map(Number);
    if (![lngA, latA, lngB, latB].every(Number.isFinite)) continue;
    const xA = EARTH_RADIUS_METERS * lngA * Math.PI / 180 * cosLatitude;
    const yA = EARTH_RADIUS_METERS * latA * Math.PI / 180;
    const xB = EARTH_RADIUS_METERS * lngB * Math.PI / 180 * cosLatitude;
    const yB = EARTH_RADIUS_METERS * latB * Math.PI / 180;
    area += xA * yB - xB * yA;
  }
  return Math.abs(area / 2);
}

function polygonAreaSquareMeters(coordinates) {
  if (!Array.isArray(coordinates) || !coordinates.length) return 0;
  const outer = ringAreaSquareMeters(coordinates[0]);
  const holes = coordinates.slice(1).reduce((total, ring) => total + ringAreaSquareMeters(ring), 0);
  return Math.max(0, outer - holes);
}

export function featureCollectionAreaSquareMeters(value) {
  return normalizeFeatureCollection(value).features.reduce((total, feature) => {
    if (feature.geometry?.type === "Polygon") return total + polygonAreaSquareMeters(feature.geometry.coordinates);
    if (feature.geometry?.type === "MultiPolygon") {
      return total + (feature.geometry.coordinates || []).reduce((sum, polygon) => sum + polygonAreaSquareMeters(polygon), 0);
    }
    return total;
  }, 0);
}

export function editableVertices(collection, target) {
  const features = normalizeFeatureCollection(collection).features;
  const points = [];
  features.forEach((feature, featureIndex) => {
    const polygons = feature.geometry?.type === "MultiPolygon"
      ? feature.geometry.coordinates || []
      : feature.geometry?.type === "Polygon"
        ? [feature.geometry.coordinates || []]
        : [];
    polygons.forEach((rings, polygonIndex) => rings.forEach((ring, ringIndex) => {
      ring.slice(0, -1).forEach((coordinate, vertexIndex) => points.push({
        type: "Feature",
        id: `${target}:${featureIndex}:${polygonIndex}:${ringIndex}:${vertexIndex}`,
        properties: { target, feature_index: featureIndex, polygon_index: polygonIndex, ring_index: ringIndex, vertex_index: vertexIndex },
        geometry: { type: "Point", coordinates: coordinate },
      }));
    }));
  });
  return { type: "FeatureCollection", features: points };
}

export function replaceVertex(collection, reference, coordinate) {
  const current = normalizeFeatureCollection(collection);
  const features = JSON.parse(JSON.stringify(current.features));
  const feature = features[Number(reference?.feature_index)];
  if (!feature || !Array.isArray(coordinate) || coordinate.length < 2) return current;
  const nextCoordinate = [Number(coordinate[0]), Number(coordinate[1])];
  if (!nextCoordinate.every(Number.isFinite)) return current;
  const polygonIndex = Number(reference?.polygon_index || 0);
  const ringIndex = Number(reference?.ring_index);
  const rings = feature.geometry?.type === "MultiPolygon"
    ? feature.geometry.coordinates?.[polygonIndex]
    : feature.geometry?.coordinates;
  const ring = rings?.[ringIndex];
  const vertexIndex = Number(reference?.vertex_index);
  if (!ring?.[vertexIndex]) return current;
  ring[vertexIndex] = nextCoordinate;
  if (vertexIndex === 0) ring[ring.length - 1] = [...nextCoordinate];
  return { type: "FeatureCollection", features };
}

export function removeFeature(collection, index) {
  const current = normalizeFeatureCollection(collection);
  return { ...current, features: current.features.filter((_, featureIndex) => featureIndex !== index) };
}

export function geometryFingerprint(value) {
  const collection = normalizeFeatureCollection(value);
  return JSON.stringify(collection);
}
