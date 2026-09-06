import { trustedObjectCoordinatePair } from "@/lib/coordinates";
import { featureCollectionAreaSquareMeters } from "./objectMapGeometry";

const PARCEL_ITEMS_URL = "https://api.pdok.nl/kadaster/brk-kadastrale-kaart/ogc/v1/collections/perceel/items";
const MAX_RESPONSE_BYTES = 5_000_000;
const MAX_FEATURE_BYTES = 750_000;
const MAX_VERTICES = 10_000;
const MAX_DISTANCE_METERS = 5_000;
const MAX_AREA_SQUARE_METERS = 100_000_000;
const TIMEOUT_MS = 8_000;
const EPSILON = 1e-12;

function parcelError(code, reason, status = 503) {
  const error = new Error(status === 409
    ? "Controleer eerst de kaartpositie van het object."
    : status === 400
      ? "De aanvraag voor perceelgrenzen is ongeldig."
      : code === "pdok_parcel_invalid_response"
        ? "PDOK gaf geen bruikbare perceelgrenzen terug. Zelf tekenen blijft mogelijk."
        : "De verbinding met de perceeldienst is niet beschikbaar. Zelf tekenen blijft mogelijk.");
  error.status = status;
  error.details = { code, reason, retryable: false, transport: "browser" };
  return error;
}

function safeCursor(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 180 || !/^[a-zA-Z0-9_|-]+$/.test(value)) {
    throw parcelError("pdok_parcel_invalid_request", "cursor", 400);
  }
  return value;
}

function nextCursor(links, requestUrl) {
  if (links === undefined) return null;
  if (!Array.isArray(links)) throw parcelError("pdok_parcel_invalid_response", "pagination");
  const nextLinks = links.filter(link => link?.rel === "next");
  if (!nextLinks.length) return null;
  try {
    if (nextLinks.length !== 1 || typeof nextLinks[0].href !== "string") throw new Error();
    const next = new URL(nextLinks[0].href, requestUrl);
    if (next.origin !== requestUrl.origin || next.pathname !== requestUrl.pathname
      || next.username || next.password || next.hash || next.searchParams.getAll("cursor").length !== 1) throw new Error();
    const cursor = safeCursor(next.searchParams.get("cursor"));
    if (!cursor || cursor === requestUrl.searchParams.get("cursor")) throw new Error();
    const expected = new URLSearchParams(requestUrl.search);
    const actual = new URLSearchParams(next.search);
    expected.delete("cursor"); actual.delete("cursor");
    expected.sort(); actual.sort();
    if (expected.toString() !== actual.toString()) throw new Error();
    return cursor;
  } catch {
    throw parcelError("pdok_parcel_invalid_response", "pagination");
  }
}

function distanceMeters(left, right) {
  const radians = value => value * Math.PI / 180;
  const a = Math.sin(radians(right[1] - left[1]) / 2) ** 2
    + Math.cos(radians(left[1])) * Math.cos(radians(right[1])) * Math.sin(radians(right[0] - left[0]) / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function orientation(left, middle, right) {
  return (middle[1] - left[1]) * (right[0] - middle[0])
    - (middle[0] - left[0]) * (right[1] - middle[1]);
}

function onSegment(left, point, right) {
  return point[0] <= Math.max(left[0], right[0]) + EPSILON && point[0] >= Math.min(left[0], right[0]) - EPSILON
    && point[1] <= Math.max(left[1], right[1]) + EPSILON && point[1] >= Math.min(left[1], right[1]) - EPSILON;
}

function segmentsIntersect(a, b, c, d, budget) {
  // Remote public data must not freeze the UI with adversarial quadratic work.
  budget.remaining -= 1;
  if (budget.remaining < 0) throw new Error("complexity_limit");
  if (Math.max(a[0], b[0]) + EPSILON < Math.min(c[0], d[0])
    || Math.max(c[0], d[0]) + EPSILON < Math.min(a[0], b[0])
    || Math.max(a[1], b[1]) + EPSILON < Math.min(c[1], d[1])
    || Math.max(c[1], d[1]) + EPSILON < Math.min(a[1], b[1])) return false;
  const first = orientation(a, b, c), second = orientation(a, b, d);
  const third = orientation(c, d, a), fourth = orientation(c, d, b);
  if (((first > EPSILON && second < -EPSILON) || (first < -EPSILON && second > EPSILON))
    && ((third > EPSILON && fourth < -EPSILON) || (third < -EPSILON && fourth > EPSILON))) return true;
  return (Math.abs(first) <= EPSILON && onSegment(a, c, b))
    || (Math.abs(second) <= EPSILON && onSegment(a, d, b))
    || (Math.abs(third) <= EPSILON && onSegment(c, a, d))
    || (Math.abs(fourth) <= EPSILON && onSegment(c, b, d));
}

function insideRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const current = ring[index], prior = ring[previous];
    if ((current[1] > point[1]) !== (prior[1] > point[1])
      && point[0] < (prior[0] - current[0]) * (point[1] - current[1]) / (prior[1] - current[1]) + current[0]) inside = !inside;
  }
  return inside;
}

function ringsIntersect(left, right, budget) {
  for (let a = 0; a < left.length - 1; a += 1) {
    for (let b = 0; b < right.length - 1; b += 1) {
      if (segmentsIntersect(left[a], left[a + 1], right[b], right[b + 1], budget)) return true;
    }
  }
  return false;
}

function area(geometry) {
  return featureCollectionAreaSquareMeters({ type: "FeatureCollection", features: [{ type: "Feature", geometry }] });
}

function canonicalFeature(feature, anchor, retrievedAt, budget) {
  if (feature?.type !== "Feature" || typeof feature.id !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(feature.id)
    || new TextEncoder().encode(JSON.stringify(feature)).byteLength > MAX_FEATURE_BYTES) throw new Error("invalid_feature");
  const geometry = feature.geometry;
  if (!["Polygon", "MultiPolygon"].includes(geometry?.type)) throw new Error("invalid_geometry");
  let vertices = 0;
  const normalizeRing = raw => {
    if (!Array.isArray(raw) || raw.length < 4 || (vertices += raw.length) > MAX_VERTICES) throw new Error("invalid_ring");
    const ring = raw.map(position => {
      if (!Array.isArray(position) || position.length < 2
        || !position.slice(0, 2).every(value => typeof value === "number" && Number.isFinite(value))
        || Math.abs(position[0]) > 180 || Math.abs(position[1]) > 90) throw new Error("invalid_position");
      const normalized = position.slice(0, 2).map(value => Number(value.toFixed(7)));
      if (distanceMeters(anchor, normalized) > MAX_DISTANCE_METERS) throw new Error("distance_limit");
      return normalized;
    });
    const equal = (a, b) => a[0] === b[0] && a[1] === b[1];
    if (!equal(ring[0], ring.at(-1))) throw new Error("open_ring");
    for (let index = 1; index < ring.length; index += 1) {
      if (equal(ring[index], ring[index - 1])) throw new Error("duplicate_position");
    }
    for (let left = 0; left < ring.length - 1; left += 1) {
      for (let right = left + 1; right < ring.length - 1; right += 1) {
        if (right === left + 1 || (left === 0 && right === ring.length - 2)) continue;
        if (segmentsIntersect(ring[left], ring[left + 1], ring[right], ring[right + 1], budget)) throw new Error("self_intersection");
      }
    }
    if (area({ type: "Polygon", coordinates: [ring] }) < 0.1) throw new Error("empty_ring");
    return ring;
  };
  const normalizePolygon = raw => {
    if (!Array.isArray(raw) || !raw.length || raw.length > MAX_VERTICES / 4) throw new Error("missing_rings");
    const rings = raw.map(normalizeRing);
    for (let hole = 1; hole < rings.length; hole += 1) {
      if (ringsIntersect(rings[0], rings[hole], budget) || !insideRing(rings[hole][0], rings[0])) throw new Error("invalid_hole");
      for (let other = 1; other < hole; other += 1) {
        if (ringsIntersect(rings[hole], rings[other], budget) || insideRing(rings[hole][0], rings[other])
          || insideRing(rings[other][0], rings[hole])) throw new Error("overlapping_holes");
      }
    }
    return rings;
  };
  if (!Array.isArray(geometry.coordinates) || !geometry.coordinates.length) throw new Error("missing_coordinates");
  const coordinates = geometry.type === "Polygon" ? normalizePolygon(geometry.coordinates) : geometry.coordinates.map(normalizePolygon);
  const normalized = { type: geometry.type, coordinates };
  if (area(normalized) > MAX_AREA_SQUARE_METERS) throw new Error("area_limit");
  const properties = feature.properties || {};
  const text = (value, length) => ["string", "number"].includes(typeof value) ? String(value).trim().slice(0, length) : "";
  const label = [text(properties.kadastrale_gemeente_waarde || properties.akr_kadastrale_gemeente_code_waarde, 80),
    text(properties.sectie, 10), text(properties.perceelnummer, 20)].filter(Boolean).join(" ") || "Kadastraal perceel";
  return {
    type: "Feature", id: feature.id, geometry: normalized,
    properties: { source: "pdok_brk", source_feature_id: feature.id,
      source_identificatie: text(properties.identificatie_lokaal_id, 80) || null, label, source_retrieved_at: retrievedAt },
  };
}

async function readBoundedJson(response, signal) {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw parcelError("pdok_parcel_invalid_response", "oversized_response");
  }
  // Never use response.text(): a missing/dishonest Content-Length must not allow
  // the entire unbounded body to be allocated before enforcing the size limit.
  const reader = response.body?.getReader();
  if (!reader) throw parcelError("pdok_parcel_invalid_response", "missing_body");
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  let bytes = 0, text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw parcelError("pdok_parcel_invalid_response", "oversized_response");
      try { text += decoder.decode(value, { stream: true }); } catch {
        throw parcelError("pdok_parcel_invalid_response", "invalid_encoding");
      }
    }
    if (signal.aborted) throw parcelError("pdok_parcel_unavailable", "timeout");
    try { text += decoder.decode(); } catch { throw parcelError("pdok_parcel_invalid_response", "invalid_encoding"); }
    try { return JSON.parse(text); } catch { throw parcelError("pdok_parcel_invalid_response", "invalid_json"); }
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}

/** Read-only public-source transport. The caller must first obtain this object
 * through the authenticated, scoped get_object_map_configuration endpoint.
 * Parcel candidates remain editable user terrain; saving is server-validated. */
export async function fetchObjectParcelCandidatesDirect({ object, radiusMeters = 250, limit = 100, cursor = null, fetchImpl = globalThis.fetch }) {
  const anchor = trustedObjectCoordinatePair(object);
  if (!anchor || typeof object?.id !== "string" || !object.id.trim()) {
    throw parcelError("object_map_location_unverified", "location", 409);
  }
  if (!Number.isInteger(radiusMeters) || radiusMeters < 25 || radiusMeters > 500
    || !Number.isInteger(limit) || limit < 1 || limit > 100) throw parcelError("pdok_parcel_invalid_request", "bounds", 400);
  const currentCursor = safeCursor(cursor);
  const latitudeDelta = radiusMeters / 110_540;
  const longitudeDelta = radiusMeters / (111_320 * Math.max(0.1, Math.cos(anchor[1] * Math.PI / 180)));
  const url = new URL(PARCEL_ITEMS_URL);
  url.searchParams.set("bbox", [anchor[0] - longitudeDelta, anchor[1] - latitudeDelta,
    anchor[0] + longitudeDelta, anchor[1] + latitudeDelta].map(value => value.toFixed(7)).join(","));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("f", "json");
  url.searchParams.set("crs", "http://www.opengis.net/def/crs/OGC/1.3/CRS84");
  if (currentCursor) url.searchParams.set("cursor", currentCursor);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(parcelError("pdok_parcel_unavailable", "timeout"));
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    const response = await Promise.race([fetchImpl(url, {
      headers: { accept: "application/geo+json, application/json" },
      credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", signal: controller.signal,
    }).then(async result => {
      if (!result.ok) {
        void result.body?.cancel().catch(() => undefined);
        throw parcelError("pdok_parcel_unavailable", "http");
      }
      return readBoundedJson(result, controller.signal);
    }), aborted]);
    if (response?.type !== "FeatureCollection" || !Array.isArray(response.features) || response.features.length > limit
      || (response.crs && response.crs?.properties?.name !== "urn:ogc:def:crs:OGC:1.3:CRS84")) {
      throw parcelError("pdok_parcel_invalid_response", "collection");
    }
    const followingCursor = nextCursor(response.links, url);
    const retrievedAt = new Date().toISOString();
    let skippedInvalidCount = 0;
    const budget = { remaining: 2_000_000 };
    const features = response.features.flatMap(feature => {
      try { return [canonicalFeature(feature, anchor, retrievedAt, budget)]; } catch { skippedInvalidCount += 1; return []; }
    });
    return {
      candidates: { type: "FeatureCollection", features },
      source: { id: "pdok_brk", name: "PDOK Kadastrale kaart", collection: "perceel", crs: "OGC:CRS84", retrieved_at: retrievedAt },
      center: { longitude: anchor[0], latitude: anchor[1] }, radius_meters: radiusMeters, total: features.length,
      cursor: currentCursor, next_cursor: followingCursor, has_more: Boolean(followingCursor), skipped_invalid_count: skippedInvalidCount,
    };
  } catch (error) {
    if (error?.details?.transport === "browser") throw error;
    throw parcelError("pdok_parcel_unavailable", controller.signal.aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener("abort", onAbort);
  }
}
