import { normalizeFeatureCollection, replaceVertex } from "./objectMapGeometry";

const EDIT_ERROR = "Deze grens zou zichzelf kruisen of geen geldig vlak meer vormen. Het vorige terrein blijft behouden.";

function ringsOf(feature) {
  const polygons = feature?.geometry?.type === "Polygon" ? [feature.geometry.coordinates]
    : feature?.geometry?.type === "MultiPolygon" ? feature.geometry.coordinates : [];
  return Array.isArray(polygons) ? polygons.filter(Array.isArray) : [];
}

function ringAt(collection, reference) {
  return ringsOf(collection.features?.[reference.feature_index])?.[reference.polygon_index || 0]?.[reference.ring_index];
}

export function boundaryHandleKey(reference) {
  return `${reference.feature_index}:${reference.polygon_index || 0}:${reference.ring_index}:${reference.vertex_index}`;
}

export function boundaryHandleCollection(value, handles) {
  const collection = normalizeFeatureCollection(value);
  return { type: "FeatureCollection", features: handles.flatMap(reference => {
    const coordinate = ringAt(collection, reference)?.[reference.vertex_index];
    return coordinate ? [{ type: "Feature", id: `terrain:${boundaryHandleKey(reference)}`, properties: { ...reference, target: "terrain" }, geometry: { type: "Point", coordinates: coordinate } }] : [];
  }) };
}

function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a, b, p) {
  return Math.abs(cross(a, b, p)) <= 1e-14 && p[0] >= Math.min(a[0], b[0]) - 1e-12
    && p[0] <= Math.max(a[0], b[0]) + 1e-12 && p[1] >= Math.min(a[1], b[1]) - 1e-12
    && p[1] <= Math.max(a[1], b[1]) + 1e-12;
}

function segmentsIntersect(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return (abC * abD < 0 && cdA * cdB < 0)
    || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

function insideRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function validRingShape(ring) {
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > 10_000) return false;
  if (!ring.every(point => Array.isArray(point) && point.length >= 2 && point.slice(0, 2).every(Number.isFinite)
    && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 85)) return false;
  if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) return false;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i], b = ring[i + 1];
    if (a[0] === b[0] && a[1] === b[1]) return false;
    area += cross(ring[0], a, b);
  }
  return Math.abs(area) > 1e-14;
}

function validRing(ring) {
  if (!validRingShape(ring)) return false;
  for (let i = 0; i < ring.length - 1; i += 1) {
    for (let j = i + 2; j < ring.length - 1; j += 1) {
      if (i === 0 && j === ring.length - 2) continue;
      if (segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) return false;
    }
  }
  return true;
}

// Starting contours have already been validated by the PDOK/storage boundary.
// A vertex edit changes only two edges (one when deleting). Checking those
// edges against every boundary preserves validity without comparing all
// unchanged pairs on each mousemove. Work for a large single ring is O(n).
function validBoundaryEdit(feature, reference, changedEdgeIndices) {
  const rings = ringsOf(feature)[reference.polygon_index || 0];
  if (!rings?.length || !rings.every(validRingShape)) return false;
  const changed = rings[reference.ring_index];
  const edgeCount = changed.length - 1;
  for (const edgeIndex of changedEdgeIndices) {
    const a = changed[edgeIndex], b = changed[edgeIndex + 1];
    for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
      const ring = rings[ringIndex];
      for (let index = 0; index < ring.length - 1; index += 1) {
        if (ringIndex === reference.ring_index) {
          if (index === edgeIndex) continue;
          // Adjacent edges may meet at their shared endpoint, but must not
          // double back and overlap beyond that endpoint.
          if (index === (edgeIndex + 1) % edgeCount) {
            if (onSegment(a, b, ring[index + 1]) || onSegment(ring[index], ring[index + 1], a)) return false;
            continue;
          }
          if ((index + 1) % edgeCount === edgeIndex) {
            if (onSegment(a, b, ring[index]) || onSegment(ring[index], ring[index + 1], b)) return false;
            continue;
          }
        }
        if (segmentsIntersect(a, b, ring[index], ring[index + 1])) return false;
      }
    }
  }
  // Only a changed ring can change containment; untouched hole pairs need
  // neither pairwise intersection nor containment checks during dragging.
  if (reference.ring_index === 0) return rings.slice(1).every(hole => insideRing(hole[0], changed));
  if (!insideRing(changed[0], rings[0])) return false;
  return rings.slice(1).every((hole, index) => index + 1 === reference.ring_index
    || (!insideRing(hole[0], changed) && !insideRing(changed[0], hole)));
}

export function validBoundaryFeature(feature) {
  const polygons = ringsOf(feature);
  if (!polygons.length) return false;
  return polygons.every(rings => {
    if (!rings?.length || !rings.every(validRing)) return false;
    for (let i = 1; i < rings.length; i += 1) {
      if (!insideRing(rings[i][0], rings[0])) return false;
      for (let j = 0; j < i; j += 1) {
        if (j > 0 && (insideRing(rings[i][0], rings[j]) || insideRing(rings[j][0], rings[i]))) return false;
        for (let a = 0; a < rings[i].length - 1; a += 1) {
          for (let b = 0; b < rings[j].length - 1; b += 1) {
            if (segmentsIntersect(rings[i][a], rings[i][a + 1], rings[j][b], rings[j][b + 1])) return false;
          }
        }
      }
    }
    return true;
  });
}

/** Pick a boundary in screen pixels; never simplify the original cadastral ring. */
export function insertBoundaryHandle(value, point, project, tolerance = 9) {
  const current = normalizeFeatureCollection(value);
  let nearest = null;
  current.features.forEach((feature, feature_index) => ringsOf(feature).forEach((rings, polygon_index) => rings.forEach((ring, ring_index) => {
    if (!Array.isArray(ring) || !ring.every(coordinate => Array.isArray(coordinate) && coordinate.slice(0, 2).every(Number.isFinite))) return;
    for (let index = 0; index < ring.length - 1; index += 1) {
      const start = project(ring[index]), end = project(ring[index + 1]);
      const dx = end.x - start.x, dy = end.y - start.y;
      const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1)));
      const distance = Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy);
      if (distance > tolerance || (nearest && distance >= nearest.distance)) continue;
      const nearStart = Math.hypot(point.x - start.x, point.y - start.y) <= 6;
      const nearEnd = Math.hypot(point.x - end.x, point.y - end.y) <= 6;
      const inserted = !nearStart && !nearEnd;
      nearest = { distance, inserted, reference: { target: "terrain", feature_index, polygon_index, ring_index,
        vertex_index: nearStart ? index : nearEnd ? (index + 1) % (ring.length - 1) : index + 1 },
      coordinate: [ring[index][0] + t * (ring[index + 1][0] - ring[index][0]), ring[index][1] + t * (ring[index + 1][1] - ring[index][1])] };
    }
  })));
  if (!nearest) return null;
  if (!nearest.inserted) return { collection: current, reference: nearest.reference, inserted: false };
  const collection = JSON.parse(JSON.stringify(current));
  ringAt(collection, nearest.reference).splice(nearest.reference.vertex_index, 0, nearest.coordinate);
  return { collection, reference: nearest.reference, inserted: true };
}

export function moveBoundaryHandle(value, reference, coordinate) {
  const ring = ringAt(normalizeFeatureCollection(value), reference);
  if (!Number.isInteger(reference?.vertex_index) || reference.vertex_index < 0 || reference.vertex_index >= (ring?.length || 0) - 1
    || !Array.isArray(coordinate) || coordinate.length < 2 || !coordinate.slice(0, 2).every(Number.isFinite)) return { error: EDIT_ERROR };
  const collection = replaceVertex(value, reference, coordinate);
  const edgeCount = ring.length - 1;
  const edges = [(reference.vertex_index + edgeCount - 1) % edgeCount, reference.vertex_index];
  return validBoundaryEdit(collection.features[reference.feature_index], reference, edges) ? { collection } : { error: EDIT_ERROR };
}

export function removeBoundaryHandle(value, reference) {
  const collection = JSON.parse(JSON.stringify(normalizeFeatureCollection(value)));
  const ring = ringAt(collection, reference);
  if (!Number.isInteger(reference?.vertex_index) || reference.vertex_index < 0 || reference.vertex_index >= (ring?.length || 0) - 1) return { error: EDIT_ERROR };
  if (!ring || ring.length <= 4) return { error: "Een terreingrens heeft minimaal drie punten nodig. Dit punt kan niet worden verwijderd." };
  ring.splice(reference.vertex_index, 1);
  ring[ring.length - 1] = [...ring[0]];
  const edgeCount = ring.length - 1;
  const edge = (reference.vertex_index + edgeCount - 1) % edgeCount;
  return validBoundaryEdit(collection.features[reference.feature_index], reference, [edge]) ? { collection } : { error: EDIT_ERROR };
}

export function shiftBoundaryHandles(handles, reference, delta) {
  return handles.filter(handle => delta > 0 || boundaryHandleKey(handle) !== boundaryHandleKey(reference)).map(handle => {
    if (handle.feature_index !== reference.feature_index || handle.polygon_index !== reference.polygon_index || handle.ring_index !== reference.ring_index) return handle;
    return handle.vertex_index >= reference.vertex_index ? { ...handle, vertex_index: handle.vertex_index + delta } : handle;
  });
}
