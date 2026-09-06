import { useEffect, useMemo, useRef, useState } from "react";
import { featureSourceId, featureStrictlyContainsCoordinate, normalizeFeatureCollection } from "./objectMapGeometry";

const HOVER_DELAY_MS = 180;
const MAX_BUILDINGS = 100;

function validCoordinate(coordinate) {
  return Array.isArray(coordinate) && coordinate.length >= 2
    && coordinate.slice(0, 2).every(value => typeof value === "number" && Number.isFinite(value))
    && Math.abs(coordinate[0]) <= 180 && Math.abs(coordinate[1]) <= 85.051129;
}

function polygonArea(ring) {
  const origin = ring[0];
  return Math.abs(ring.slice(1).reduce((sum, point, index) => sum
    + (ring[index][0] - origin[0]) * (point[1] - origin[1])
    - (point[0] - origin[0]) * (ring[index][1] - origin[1]), 0)) / 2;
}

// A bounding-box center or vertex average may lie in a courtyard or outside a
// concave building. Intersect a horizontal scanline with the stored polygon,
// including its holes, and use an interior interval instead. No native Mapbox
// geometry, nearby-building lookup or address fallback is involved.
export function buildingLabelCoordinate(feature) {
  const geometry = feature?.geometry;
  const polygons = geometry?.type === "Polygon" ? [geometry.coordinates]
    : geometry?.type === "MultiPolygon" ? geometry.coordinates : null;
  if (!Array.isArray(polygons) || !polygons.length || polygons.length > MAX_BUILDINGS) return null;
  let pointCount = 0;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length || polygon.length > MAX_BUILDINGS) return null;
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4 || (pointCount += ring.length) > 10_000
        || !ring.every(validCoordinate)
        || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) return null;
    }
  }
  const largestFirst = [...polygons].sort((left, right) => polygonArea(right[0]) - polygonArea(left[0]));
  for (const polygon of largestFirst) {
    if (polygonArea(polygon[0]) <= 1e-14) continue;
    const latitudes = [...new Set(polygon.flatMap(ring => ring.map(point => point[1])))].sort((left, right) => left - right);
    const middle = Math.floor((latitudes.length - 1) / 2);
    if (latitudes.length < 2) continue;
    const latitude = (latitudes[middle] + latitudes[middle + 1]) / 2;
    const intersections = [];
    polygon.forEach(ring => {
      for (let index = 1; index < ring.length; index += 1) {
        const left = ring[index - 1], right = ring[index];
        if ((left[1] > latitude) !== (right[1] > latitude)) {
          intersections.push(left[0] + (latitude - left[1]) * (right[0] - left[0]) / (right[1] - left[1]));
        }
      }
    });
    intersections.sort((left, right) => left - right);
    let best = null;
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const width = intersections[index + 1] - intersections[index];
      const coordinate = [(intersections[index] + intersections[index + 1]) / 2, latitude];
      if (width > (best?.width || 0) && featureStrictlyContainsCoordinate(feature, coordinate)) best = { coordinate, width };
    }
    if (best) return best.coordinate;
  }
  return null;
}

function labelEntries(selectedBuildings, points, labels) {
  const entries = new Map();
  const duplicates = new Set();
  const add = (key, coordinate, fallback) => {
    if (!key || !coordinate) return;
    if (entries.has(key)) { duplicates.add(key); return; }
    const name = typeof labels?.[key] === "string" ? labels[key].trim().slice(0, 100) : "";
    entries.set(key, { key, coordinate, name, text: name || fallback });
  };
  normalizeFeatureCollection(selectedBuildings).features.slice(0, MAX_BUILDINGS).forEach((feature, index) => {
    const manual = feature.properties?.source === "manual";
    const id = manual ? feature.properties?.local_id || feature.id : featureSourceId(feature);
    if (id === undefined || id === null || String(id).trim() === "") return;
    add(`${manual ? "manual" : "bag"}:${id}`, buildingLabelCoordinate(feature), manual
      ? `Eerder ingetekend gebouw ${index + 1}`
      : `BAG-pand ${feature.properties?.source_identificatie || id}`);
  });
  (Array.isArray(points) ? points : []).slice(0, MAX_BUILDINGS).forEach((point, index) => {
    if (!point?.id || !validCoordinate([point.longitude, point.latitude])) return;
    add(`point:${point.id}`, [point.longitude, point.latitude], `Gebouw ${index + 1} · Zonder BAG-koppeling`);
  });
  // Ambiguous persisted keys are never resolved by choosing an arbitrary part.
  duplicates.forEach(key => entries.delete(key));
  return new Map([...entries].slice(0, MAX_BUILDINGS));
}

function coordinateInMapBounds(map, coordinate) {
  try {
    const bounds = map.getMaxBounds?.();
    return !bounds || typeof bounds.contains !== "function" || bounds.contains(coordinate);
  } catch { return false; }
}

function liveMapContainer(map) {
  try {
    const container = map?.getCanvasContainer?.();
    return container?.isConnected && typeof container.appendChild === "function" ? container : null;
  } catch { return null; }
}

function removeLabel(record) {
  // Mapbox may already have removed the marker together with its map. Cleanup
  // is idempotent even if a partially attached marker still holds that map.
  try { record.marker?.remove(); } catch { /* The DOM cleanup below remains safe. */ }
  record.element?.remove();
}

const LABEL_ERROR = "Een gebouw kon niet op de kaart worden aangewezen. Je kaart en wijzigingen blijven bewaard.";

export default function useObjectMapBuildingLabels({
  map,
  ready,
  selectedBuildings,
  buildingSelectionPoints = [],
  buildingLabels = {},
  highlightedBuildingKey = null,
  workspace = "buildings",
  editingTarget = null,
  drawingTarget = null,
}) {
  const entries = useMemo(() => labelEntries(selectedBuildings, buildingSelectionPoints, buildingLabels),
    [selectedBuildings, buildingSelectionPoints, buildingLabels]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const markersRef = useRef(new Map());
  const [MarkerConstructor, setMarkerConstructor] = useState(null);
  const [labelError, setLabelError] = useState(null);
  const active = ready && workspace === "buildings" && !editingTarget && !drawingTarget;

  useEffect(() => {
    if (!map || !ready || !liveMapContainer(map)) return undefined;
    let cancelled = false;
    import("mapbox-gl").then(module => {
      if (cancelled || !liveMapContainer(map)) return;
      if (typeof module.default?.Marker === "function") setMarkerConstructor(() => module.default.Marker);
      else setLabelError(LABEL_ERROR);
    }).catch(() => { if (!cancelled && liveMapContainer(map)) setLabelError(LABEL_ERROR); });
    return () => { cancelled = true; };
  }, [map, ready]);

  useEffect(() => {
    const clearLabels = () => {
      markersRef.current.forEach(removeLabel);
      markersRef.current.clear();
    };
    map?.on?.("remove", clearLabels);
    return () => { map?.off?.("remove", clearLabels); clearLabels(); };
  }, [map]);

  useEffect(() => {
    const visible = new Set();
    let failed = false;
    if (map && active && MarkerConstructor && liveMapContainer(map)) entries.forEach(entry => {
      if ((!entry.name && highlightedBuildingKey !== entry.key) || !coordinateInMapBounds(map, entry.coordinate)) return;
      if (!liveMapContainer(map)) return;
      visible.add(entry.key);
      let record = markersRef.current.get(entry.key);
      if (!record) {
        const element = document.createElement("div");
        element.style.pointerEvents = "none";
        element.setAttribute("aria-hidden", "true");
        element.dataset.buildingKey = entry.key;
        const label = document.createElement("div");
        element.append(label);
        let marker;
        try {
          marker = new MarkerConstructor({ element, anchor: "bottom", offset: [0, -12], pitchAlignment: "viewport", rotationAlignment: "viewport" });
          marker.setLngLat(entry.coordinate);
          if (!liveMapContainer(map)) { removeLabel({ marker, element }); return; }
          marker.addTo(map);
        } catch {
          removeLabel({ marker, element });
          if (liveMapContainer(map)) failed = true;
          return;
        }
        record = { marker, element, label, coordinate: entry.coordinate };
        markersRef.current.set(entry.key, record);
      }
      const highlighted = highlightedBuildingKey === entry.key;
      record.label.textContent = entry.text;
      record.element.dataset.highlighted = String(highlighted);
      // The outer element belongs to Mapbox: replacing its className would
      // discard marker positioning/anchor classes and break camera tracking.
      record.label.className = `pointer-events-none max-w-[220px] truncate rounded-lg border bg-background/95 px-2.5 py-1 text-xs font-semibold text-foreground shadow-md ${highlighted ? "border-amber-400 ring-2 ring-amber-300/60" : "border-primary/50"}`;
      if (record.coordinate[0] !== entry.coordinate[0] || record.coordinate[1] !== entry.coordinate[1]) {
        try {
          if (!liveMapContainer(map)) { visible.delete(entry.key); return; }
          record.marker.setLngLat(entry.coordinate);
          record.coordinate = entry.coordinate;
        } catch {
          visible.delete(entry.key);
          if (liveMapContainer(map)) failed = true;
        }
      }
    });
    markersRef.current.forEach((record, key) => {
      if (visible.has(key)) return;
      removeLabel(record);
      markersRef.current.delete(key);
    });
    if (failed) setLabelError(LABEL_ERROR);
    else if (MarkerConstructor) setLabelError(null);
  }, [map, active, MarkerConstructor, entries, highlightedBuildingKey]);

  useEffect(() => {
    if (!map || !active || !highlightedBuildingKey || !liveMapContainer(map)) return undefined;
    let ownMovement = false;
    let cancelled = false;
    const finishMovement = () => { ownMovement = false; };
    const timer = setTimeout(() => {
      if (cancelled || !liveMapContainer(map)) return;
      const entry = entriesRef.current.get(highlightedBuildingKey);
      if (!entry || !coordinateInMapBounds(map, entry.coordinate)) return;
      try {
        const currentZoom = map.getZoom();
        const zoom = Math.min(map.getMaxZoom?.() ?? 22,
          Math.max(map.getMinZoom?.() ?? 0, Math.min(18.5, Math.max(18, Number.isFinite(currentZoom) ? currentZoom : 18))));
        const camera = { center: entry.coordinate, zoom, duration: 550 };
        const bearing = map.getBearing?.(), pitch = map.getPitch?.();
        if (Number.isFinite(bearing)) camera.bearing = bearing;
        if (Number.isFinite(pitch)) camera.pitch = pitch;
        // easeTo itself stops an earlier animation and emits its moveend. Finish
        // that movement before subscribing, so it cannot finish our new hover.
        map.stop?.();
        if (!liveMapContainer(map)) return;
        ownMovement = true;
        map.once?.("moveend", finishMovement);
        map.easeTo(camera);
      } catch { if (liveMapContainer(map)) setLabelError(LABEL_ERROR); }
    }, HOVER_DELAY_MS);
    const cancelRemovedMap = () => { cancelled = true; ownMovement = false; clearTimeout(timer); };
    map.on?.("remove", cancelRemovedMap);
    return () => {
      clearTimeout(timer);
      map.off?.("remove", cancelRemovedMap);
      map.off?.("moveend", finishMovement);
      if (ownMovement && liveMapContainer(map)) map.stop?.();
    };
    // Labels, geometry refreshes and unrelated renders must not refocus the
    // camera. A queued hover reads the latest entry through entriesRef.
  }, [map, active, highlightedBuildingKey]);
  return active ? labelError : null;
}
