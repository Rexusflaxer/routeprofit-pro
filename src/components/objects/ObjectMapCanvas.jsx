import React, { useEffect, useMemo, useRef, useState } from "react";
import { Building2, LandPlot, Loader2, LocateFixed, MousePointer2, RotateCcw, RotateCw, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAPBOX_PUBLIC_TOKEN } from "@/components/navigation/mapboxConfig";
import { trustedObjectCoordinatePair } from "@/lib/coordinates";
import {
  editableVertices,
  featureCollectionBounds,
  featureSourceId,
  featureStrictlyContainsCoordinate,
  matchMapboxBuildingToBagCandidate,
  normalizeFeatureCollection,
} from "./objectMapGeometry";
import { boundaryHandleCollection, boundaryHandleKey, insertBoundaryHandle, moveBoundaryHandle, removeBoundaryHandle, shiftBoundaryHandles } from "./objectMapBoundaryEditor";
import "mapbox-gl/dist/mapbox-gl.css";

const SOURCE = {
  candidates: "loq-object-map-candidates",
  selected: "loq-object-map-selected",
  terrain: "loq-object-map-terrain",
  draft: "loq-object-map-draft",
  vertices: "loq-object-map-vertices",
  anchor: "loq-object-map-anchor",
  satellite: "loq-object-map-satellite",
  parcels: "loq-object-map-parcels",
  hover: "loq-object-map-building-hover",
};

const LAYER = {
  candidatesFill: "loq-object-map-candidates-fill",
  candidatesLine: "loq-object-map-candidates-line",
  selectedFill: "loq-object-map-selected-fill",
  selectedLine: "loq-object-map-selected-line",
  terrainFill: "loq-object-map-terrain-fill",
  terrainLine: "loq-object-map-terrain-line",
  draftFill: "loq-object-map-draft-fill",
  draftLine: "loq-object-map-draft-line",
  draftPoints: "loq-object-map-draft-points",
  vertices: "loq-object-map-vertices-layer",
  anchor: "loq-object-map-anchor-layer",
  satellite: "loq-object-map-satellite-layer",
  parcelsFill: "loq-object-map-parcels-fill",
  parcelsLine: "loq-object-map-parcels-line",
  parcelsHalo: "loq-object-map-parcels-halo",
  hoverLine: "loq-object-map-building-hover-line",
  hoverPoint: "loq-object-map-building-hover-point",
};

const NETHERLANDS_MAP_BOUNDS = [[3, 50.6], [7.4, 53.7]];
const LOCAL_MAP_RADIUS_METERS = 1_000;
const MAP_GEOMETRY_MAX_DISTANCE_METERS = 5_000; // Same locality limit as customerPlatformApi.
const MAP_BOUNDS_PADDING_METERS = 150;

function nearbyMapCoordinate(coordinate, anchor) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return false;
  const [lng, lat] = coordinate;
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 85) return false;
  const radians = Math.PI / 180;
  const latitudeDelta = (lat - anchor[1]) * radians;
  const longitudeDelta = (lng - anchor[0]) * radians;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(lat * radians) * Math.cos(anchor[1] * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(haversine))) <= MAP_GEOMETRY_MAX_DISTANCE_METERS;
}

function localGeometryCoordinates(geometry, anchor) {
  const polygons = geometry?.type === "Polygon" ? [geometry.coordinates]
    : geometry?.type === "MultiPolygon" ? geometry.coordinates : null;
  if (!Array.isArray(polygons) || !polygons.length || polygons.length > 100) return [];
  const coordinates = [];
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length || polygon.length > 100) return [];
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4 || ring.length + coordinates.length > 10_000
        || !ring.every(coordinate => nearbyMapCoordinate(coordinate, anchor))) return [];
      if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) return [];
      const area = ring.slice(1).reduce((sum, point, index) => sum
        + (ring[index][0] - anchor[0]) * (point[1] - anchor[1])
        - (point[0] - anchor[0]) * (ring[index][1] - anchor[1]), 0);
      if (Math.abs(area) < 1e-12) return [];
      coordinates.push(...ring);
    }
  }
  return coordinates;
}

function objectNavigationBounds(object, selectedBuildings, terrain, buildingSelectionPoints) {
  const anchor = trustedObjectCoordinatePair(object);
  if (!anchor) return NETHERLANDS_MAP_BOUNDS;
  const metersPerLatitude = 111320;
  const metersPerLongitude = metersPerLatitude * Math.max(0.01, Math.cos(anchor[1] * Math.PI / 180));
  const radiusLng = LOCAL_MAP_RADIUS_METERS / metersPerLongitude;
  const radiusLat = LOCAL_MAP_RADIUS_METERS / metersPerLatitude;
  const bounds = [[anchor[0] - radiusLng, anchor[1] - radiusLat], [anchor[0] + radiusLng, anchor[1] + radiusLat]];
  const include = coordinate => {
    bounds[0][0] = Math.min(bounds[0][0], coordinate[0] - MAP_BOUNDS_PADDING_METERS / metersPerLongitude);
    bounds[0][1] = Math.min(bounds[0][1], coordinate[1] - MAP_BOUNDS_PADDING_METERS / metersPerLatitude);
    bounds[1][0] = Math.max(bounds[1][0], coordinate[0] + MAP_BOUNDS_PADDING_METERS / metersPerLongitude);
    bounds[1][1] = Math.max(bounds[1][1], coordinate[1] + MAP_BOUNDS_PADDING_METERS / metersPerLatitude);
  };
  // Only local, closed stored/edited polygons extend the workspace. Candidate
  // feeds and unfinished drawings never enlarge the navigation area.
  [selectedBuildings, terrain].forEach(collection => {
    normalizeFeatureCollection(collection).features.slice(0, 100).forEach(feature => {
      localGeometryCoordinates(feature.geometry, anchor).forEach(include);
    });
  });
  (buildingSelectionPoints || []).slice(0, 100).forEach(point => {
    const coordinate = [point.longitude, point.latitude];
    if (nearbyMapCoordinate(coordinate, anchor)) include(coordinate);
  });
  return bounds.map(([lng, lat]) => [Math.max(-180, Math.min(180, lng)), Math.max(-85, Math.min(85, lat))]);
}

const STANDARD_BUILDINGS_TARGET = { featuresetId: "buildings", importId: "basemap" };
const STANDARD_BUILDING_INTERACTION = {
  click: "loq-object-map-standard-building-click",
  mouseenter: "loq-object-map-standard-building-mouseenter",
  mouseleave: "loq-object-map-standard-building-mouseleave",
};

function featureCollection(features = []) {
  return { type: "FeatureCollection", features };
}

function drawingCollection(points, previewPoint = null) {
  if (!points?.length) return featureCollection();
  const pointFeatures = points.map((coordinate, index) => ({
    type: "Feature",
    id: `draft-point-${index}`,
    properties: { kind: "point", point_index: index },
    geometry: { type: "Point", coordinates: coordinate },
  }));
  const previewPoints = previewPoint ? [...points, previewPoint] : points;
  const line = previewPoints.length > 1 ? [{
    type: "Feature",
    id: "draft-line",
    properties: { kind: "line" },
    geometry: { type: "LineString", coordinates: previewPoints },
  }] : [];
  const polygon = previewPoints.length > 2 ? [{
    type: "Feature",
    id: "draft-polygon",
    properties: { kind: "polygon" },
    geometry: { type: "Polygon", coordinates: [[...previewPoints, points[0]]] },
  }] : [];
  return featureCollection([...polygon, ...line, ...pointFeatures]);
}

function candidateCollection(candidates, selectedIds) {
  const selected = new Set(selectedIds || []);
  return featureCollection((candidates || []).map(feature => {
    // Mapbox serializes GeoJSON properties through a worker. Keep those values
    // primitive; the richer conflict records remain available in React state.
    const { conflicts: _conflicts, ...properties } = feature.properties || {};
    return {
      ...feature,
      properties: {
        ...properties,
        loq_selected: selected.has(featureSourceId(feature)),
        loq_conflict: Number(feature.properties?.conflict_count || 0) > 0,
      },
    };
  }));
}

function buildingMatchCandidates(candidates, selectedBuildings, selectedIds) {
  const selected = new Set(selectedIds || []);
  const byId = new globalThis.Map();
  (candidates || []).forEach(feature => {
    const id = featureSourceId(feature);
    if (id) byId.set(id, feature);
  });
  normalizeFeatureCollection(selectedBuildings).features.forEach(feature => {
    const id = featureSourceId(feature);
    if (id && selected.has(id) && !byId.has(id)) byId.set(id, feature);
  });
  return [...byId.values()];
}

function sourceData(map, id, data) {
  map.getSource(id)?.setData(data);
}

function mapboxBuildingFeatureKey(feature) {
  const id = feature?.id;
  const namespace = String(feature?.namespace || "");
  if (id !== undefined && id !== null && String(id) !== "") return `${namespace}:${String(id)}`;
  return `${namespace}:geometry:${JSON.stringify(feature?.geometry || null)}`;
}

function buildingFootprintKey(feature) {
  const geometry = feature?.geometry;
  const polygons = geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
  const ringKey = ring => {
    const points = (ring || []).map(coordinate => `${Math.round(coordinate[0] * 1e7)}:${Math.round(coordinate[1] * 1e7)}`);
    if (points.length > 1 && points[0] === points.at(-1)) points.pop();
    const rotate = values => {
      const first = values.reduce((best, value, index) => value < values[best] ? index : best, 0);
      return [...values.slice(first), ...values.slice(0, first)].join(";");
    };
    return [rotate(points), rotate([...points].reverse())].sort()[0];
  };
  // Duplicate tiles and reversed rings still represent the same footprint.
  // This key remains transient and never enters the saved configuration.
  return polygons.map(polygon => polygon.map(ringKey).sort().join("/")).sort().join("|");
}

function pointBuildingAssociations(features, points) {
  return new globalThis.Map((points || []).map(point => {
    const containing = (features || []).filter(feature => featureStrictlyContainsCoordinate(feature, [point.longitude, point.latitude]));
    return [point.id, new Set(containing.map(buildingFootprintKey))];
  }));
}

function setStandardBuildingState(map, feature, state) {
  if (!feature || typeof map?.setFeatureState !== "function") return false;
  try {
    map.setFeatureState(feature, state);
    return true;
  } catch {
    return false;
  }
}

function featureEventHandled(event, handledEvents) {
  const originalEvent = event?.originalEvent;
  return Boolean(originalEvent && (Reflect.get(originalEvent, "__loqMapFeatureHandled") || handledEvents.has(originalEvent)));
}

function markFeatureEventHandled(event, handledEvents) {
  const originalEvent = event?.originalEvent;
  if (!originalEvent) return;
  handledEvents.add(originalEvent);
  if (Object.isExtensible(originalEvent)) Reflect.set(originalEvent, "__loqMapFeatureHandled", true);
}

function addSource(map, id, data) {
  if (!map.getSource(id)) map.addSource(id, { type: "geojson", data });
}

function addLayer(map, definition) {
  if (!map.getLayer(definition.id)) map.addLayer(definition);
}

function addWorkspaceLayers(map, data) {
  if (!map.getSource(SOURCE.satellite)) {
    map.addSource(SOURCE.satellite, {
      type: "raster",
      tiles: ["https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/OGC:1.0:GoogleMapsCompatible/{z}/{x}/{y}.jpeg"],
      tileSize: 256,
      minzoom: 10,
      maxzoom: 21,
      bounds: [3.2, 50.7, 7.3, 53.6],
      attribution: "PDOK / Beeldmateriaal Nederland",
    });
  }
  // Above the basemap's opaque building/road fills, below our workspace layers:
  // roof edges and terrain boundaries must remain visible for tracing.
  addLayer(map, { id: LAYER.satellite, type: "raster", source: SOURCE.satellite, layout: { visibility: "none" } });
  addSource(map, SOURCE.candidates, data.candidates);
  addSource(map, SOURCE.selected, data.selected);
  addSource(map, SOURCE.terrain, data.terrain);
  addSource(map, SOURCE.draft, data.draft);
  addSource(map, SOURCE.vertices, data.vertices);
  addSource(map, SOURCE.anchor, data.anchor);
  addSource(map, SOURCE.parcels, data.parcels);
  addSource(map, SOURCE.hover, featureCollection());

  // Candidate polygons exist only for hit-testing. Only the actual edited
  // terrain is green; the original parcel must not retain a ghost selection.
  addLayer(map, { id: LAYER.parcelsFill, type: "fill", source: SOURCE.parcels, layout: { visibility: "none" }, paint: { "fill-color": "#64748b", "fill-opacity": 0 } });
  addLayer(map, { id: LAYER.parcelsHalo, type: "line", source: SOURCE.parcels, layout: { visibility: "none" }, paint: { "line-color": "#ffffff", "line-opacity": 0.8, "line-width": 3.5, "line-dasharray": [3, 2] } });
  addLayer(map, { id: LAYER.parcelsLine, type: "line", source: SOURCE.parcels, layout: { visibility: "none" }, paint: { "line-color": "#64748b", "line-opacity": 0.65, "line-width": 1.25, "line-dasharray": [3, 2] } });

  addLayer(map, {
    id: LAYER.candidatesFill,
    type: "fill",
    source: SOURCE.candidates,
    paint: {
      "fill-color": "#f59e0b",
      "fill-opacity": ["case", ["==", ["get", "loq_conflict"], true], 0.08, 0],
    },
  });
  addLayer(map, {
    id: LAYER.candidatesLine,
    type: "line",
    source: SOURCE.candidates,
    filter: ["==", ["get", "loq_conflict"], true],
    paint: {
      "line-color": "#d97706",
      "line-width": 1.5,
      "line-opacity": 0.82,
    },
  });
  addLayer(map, { id: LAYER.selectedFill, type: "fill", source: SOURCE.selected, filter: ["==", ["get", "source"], "manual"], paint: { "fill-color": "#8b5cf6", "fill-opacity": 0.34 } });
  addLayer(map, { id: LAYER.selectedLine, type: "line", source: SOURCE.selected, filter: ["==", ["get", "source"], "manual"], paint: { "line-color": "#7c3aed", "line-width": 3 } });
  addLayer(map, { id: LAYER.terrainFill, type: "fill", source: SOURCE.terrain, paint: { "fill-color": "#10b981", "fill-opacity": 0.18 } });
  addLayer(map, { id: LAYER.terrainLine, type: "line", source: SOURCE.terrain, paint: { "line-color": "#047857", "line-width": 3 } });
  addLayer(map, { id: LAYER.hoverLine, type: "line", source: SOURCE.hover, filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": "#f59e0b", "line-width": 5 } });
  addLayer(map, { id: LAYER.hoverPoint, type: "circle", source: SOURCE.hover, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#f59e0b", "circle-radius": 10, "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
  addLayer(map, { id: LAYER.draftFill, type: "fill", source: SOURCE.draft, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#8b5cf6", "fill-opacity": 0.18 } });
  addLayer(map, { id: LAYER.draftLine, type: "line", source: SOURCE.draft, filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#7c3aed", "line-width": 3, "line-dasharray": [2, 1] } });
  addLayer(map, { id: LAYER.draftPoints, type: "circle", source: SOURCE.draft, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": ["case", ["==", ["get", "point_index"], 0], 7, 5], "circle-color": "#7c3aed", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
  addLayer(map, { id: LAYER.vertices, type: "circle", source: SOURCE.vertices, paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": "#1f7aff", "circle-stroke-width": 2.5 } });
  addLayer(map, { id: LAYER.anchor, type: "circle", source: SOURCE.anchor, paint: { "circle-radius": 6, "circle-color": "#111827", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
}

function anchorCollection(object) {
  const coordinates = trustedObjectCoordinatePair(object);
  if (!coordinates) return featureCollection();
  return featureCollection([{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates } }]);
}

export default function ObjectMapCanvas({
  object,
  candidates,
  selectedBagFeatureIds,
  selectedBuildings,
  manualBuildings,
  terrain,
  drawingTarget,
  drawingPoints,
  editingTarget,
  disabled,
  onToggleCandidate,
  onAddDrawingPoint,
  onVertexDragStart,
  onMoveVertex,
  onVertexDragEnd,
  onBuildingMatchUnavailable,
  buildingSelectionPoints = [],
  onToggleBuildingPoint,
  workspace = "buildings",
  mapView = "map",
  parcelCandidates = [],
  parcelsVisible = false,
  parcelSelectionEnabled = false,
  onToggleParcel,
  onFinishDrawing,
  onRemoveLastDrawingPoint,
  onCancelDrawing,
  onTerrainGeometryChange,
  onRemoveTerrainFeature,
  onEditError,
  highlightedBuildingKey = null,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const dataRef = useRef(null);
  const interactionsRef = useRef({
    disabled: true,
    drawingTarget: null,
    editingTarget: null,
    candidates: [],
    selectedBagFeatureIds: new Set(),
    onToggleCandidate: null,
    onAddDrawingPoint: null,
    onVertexDragStart: null,
    onMoveVertex: null,
    onVertexDragEnd: null,
    onBuildingMatchUnavailable: null,
  });
  const dragRef = useRef(null);
  const handledEventsRef = useRef(new WeakSet());
  const standardBuildingStatesRef = useRef(new globalThis.Map());
  const hoveredStandardBuildingsRef = useRef(new globalThis.Map());
  const syncStandardBuildingStatesRef = useRef(null);
  const clearStandardBuildingHoverRef = useRef(null);
  const applyWorkspaceViewRef = useRef(null);
  const appliedNavigationBoundsRef = useRef(null);
  const navigationBoundsRef = useRef(null);
  const previewPointRef = useRef(null);
  const handlesRef = useRef([]);
  const expectedTerrainRef = useRef(null);
  const suppressBoundaryClickRef = useRef(false);
  const reportedEditErrorRef = useRef(null);
  const [handles, setHandles] = useState([]);
  const [pointMenu, setPointMenu] = useState(null);
  const [editError, setEditError] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const interactionDisabled = disabled || !trustedObjectCoordinatePair(object);
  const navigationBounds = useMemo(() => objectNavigationBounds(object, selectedBuildings, terrain, buildingSelectionPoints),
    [object?.latitude, object?.longitude, object?.geocoding_status, selectedBuildings, terrain, buildingSelectionPoints]);
  const navigationBoundsKey = JSON.stringify(navigationBounds);
  navigationBoundsRef.current = navigationBounds;
  const groundEditing = workspace === "terrain" && (mapView === "satellite" || Boolean(editingTarget) || Boolean(drawingTarget));
  const updateHandles = next => { handlesRef.current = next; setHandles(next); };
  const reportEditError = message => {
    setEditError(message);
    if (reportedEditErrorRef.current !== message) onEditError?.(message);
    reportedEditErrorRef.current = message;
  };

  useEffect(() => {
    if (editingTarget !== "terrain" || (expectedTerrainRef.current && expectedTerrainRef.current !== JSON.stringify(terrain))) {
      handlesRef.current = [];
      setHandles([]);
      setPointMenu(null);
    }
    expectedTerrainRef.current = JSON.stringify(terrain);
  }, [terrain, editingTarget]);

  const mapData = useMemo(() => ({
    candidates: candidateCollection(candidates, selectedBagFeatureIds),
    selected: normalizeFeatureCollection(selectedBuildings),
    terrain: featureCollection(normalizeFeatureCollection(terrain).features.map((feature, index) => ({ ...feature, properties: { ...feature.properties, loq_feature_index: index } }))),
    draft: drawingCollection(drawingPoints),
    vertices: editingTarget === "terrain"
      ? boundaryHandleCollection(terrain, handles)
      : editingTarget === "building"
        ? editableVertices(manualBuildings, "building")
        : featureCollection(),
    anchor: anchorCollection(object),
    parcels: featureCollection(parcelCandidates.map(feature => ({
      ...feature,
      properties: { source_feature_id: featureSourceId(feature), loq_selected: feature.properties?.loq_selected === true },
    }))),
  }), [candidates, drawingPoints, editingTarget, handles, manualBuildings, object, parcelCandidates, selectedBagFeatureIds, selectedBuildings, terrain]);
  const matchCandidates = useMemo(
    () => buildingMatchCandidates(candidates, selectedBuildings, selectedBagFeatureIds),
    [candidates, selectedBagFeatureIds, selectedBuildings],
  );
  const selectedPointCollection = useMemo(() => featureCollection(buildingSelectionPoints.map(point => ({
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
  }))), [buildingSelectionPoints]);
  dataRef.current = mapData;
  interactionsRef.current = {
    disabled: interactionDisabled,
    drawingTarget,
    editingTarget,
    candidates: matchCandidates,
    selectedBagFeatureIds: new Set(selectedBagFeatureIds || []),
    onToggleCandidate,
    onAddDrawingPoint,
    onVertexDragStart,
    onMoveVertex,
    onVertexDragEnd,
    onBuildingMatchUnavailable,
    buildingSelectionPoints,
    onToggleBuildingPoint,
    workspace,
    mapView,
    parcelsVisible,
    parcelSelectionEnabled,
    drawingPoints,
    onToggleParcel,
    onFinishDrawing,
    onRemoveLastDrawingPoint,
    onCancelDrawing,
    terrain,
    onTerrainGeometryChange,
    onRemoveTerrainFeature,
    reportEditError,
    highlightedBuildingKey,
  };

  useEffect(() => {
    readyRef.current = false;
    setReady(false);
    setError(null);
    if (!containerRef.current || !MAPBOX_PUBLIC_TOKEN) {
      if (!MAPBOX_PUBLIC_TOKEN) setError(new Error("De Mapbox-configuratie ontbreekt."));
      return undefined;
    }
    let cancelled = false;
    let map;
    let resizeObserver;
    let standardBuildingInteractionsInstalled = false;
    import("mapbox-gl").then(module => {
      if (cancelled || !containerRef.current) return;
      const mapboxgl = module.default;
      mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN;
      const coordinates = trustedObjectCoordinatePair(object);
      const usesGroundView = interaction => interaction.workspace === "terrain"
        && (interaction.mapView === "satellite" || Boolean(interaction.drawingTarget) || Boolean(interaction.editingTarget));
      let appliedGroundView = usesGroundView(interactionsRef.current);
      let normalMapPitch = coordinates ? 42 : 0;
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/standard",
        // Standard defaults to globe, where maxBounds constrains only the
        // center. Mercator also constrains the visible viewport and zoom.
        projection: "mercator",
        center: coordinates || [5.2913, 52.1326],
        zoom: coordinates ? 17 : 7,
        pitch: appliedGroundView ? 0 : normalMapPitch,
        bearing: coordinates ? -12 : 0,
        // maxBounds imposes the viewport-dependent zoom floor. Keep a lower
        // absolute floor so an existing large site still fits on narrow screens.
        minZoom: coordinates ? 10 : 6,
        maxBounds: navigationBoundsRef.current,
        renderWorldCopies: false,
        dragRotate: true,
        touchZoomRotate: true,
        pitchWithRotate: true,
        maxPitch: appliedGroundView ? 0 : 65,
        attributionControl: true,
        config: {
          basemap: {
            colorBuildingHighlight: "#93c5fd",
            colorBuildingSelect: "#1f7aff",
            show3dObjects: !appliedGroundView,
            show3dBuildings: !appliedGroundView,
            show3dFacades: !appliedGroundView,
            show3dLandmarks: false,
          },
        },
      });
      appliedNavigationBoundsRef.current = JSON.stringify(navigationBoundsRef.current);
      map.addControl(new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }), "bottom-right");

      const applyWorkspaceView = () => {
        const interaction = interactionsRef.current;
        const terrainWorkspace = interaction.workspace === "terrain";
        const groundView = usesGroundView(interaction);
        map.setLayoutProperty(LAYER.satellite, "visibility", terrainWorkspace && interaction.mapView === "satellite" ? "visible" : "none");
        const parcelVisibility = terrainWorkspace && interaction.parcelsVisible ? "visible" : "none";
        map.setLayoutProperty(LAYER.parcelsFill, "visibility", parcelVisibility);
        map.setLayoutProperty(LAYER.parcelsLine, "visibility", parcelVisibility);
        map.setLayoutProperty(LAYER.parcelsHalo, "visibility", parcelVisibility);
        map.setPaintProperty(LAYER.parcelsHalo, "line-opacity", interaction.editingTarget ? 0.3 : 0.8);
        map.setPaintProperty(LAYER.parcelsLine, "line-opacity", interaction.editingTarget ? 0.25 : 0.65);
        map.setConfigProperty("basemap", "show3dObjects", !groundView);
        map.setConfigProperty("basemap", "show3dBuildings", !groundView);
        map.setConfigProperty("basemap", "show3dFacades", !groundView);
        // A workspace switch is not a camera action. Only explicit aerial
        // viewing or ground editing temporarily flattens this same map.
        if (appliedGroundView !== groundView) {
          if (groundView) normalMapPitch = map.getPitch();
          map.setMaxPitch(groundView ? 0 : 65);
          map.easeTo({ pitch: groundView ? 0 : normalMapPitch, duration: 350 });
          appliedGroundView = groundView;
        }
        if (interaction.drawingTarget) map.doubleClickZoom.disable();
        else map.doubleClickZoom.enable();
      };
      applyWorkspaceViewRef.current = applyWorkspaceView;

      const rememberStandardBuilding = (feature, bagFeatureId, selected, selectionPointId = null) => {
        const key = mapboxBuildingFeatureKey(feature);
        standardBuildingStatesRef.current.set(key, { feature, bagFeatureId, selectionPointId, selected });
        return key;
      };
      const clearStandardBuildingHover = () => {
        hoveredStandardBuildingsRef.current.forEach(feature => setStandardBuildingState(map, feature, { highlight: false }));
        hoveredStandardBuildingsRef.current.clear();
        if (!dragRef.current) map.getCanvas().style.cursor = "";
      };
      clearStandardBuildingHoverRef.current = clearStandardBuildingHover;

      const syncStandardBuildingStates = () => {
        if (cancelled || !map || typeof map.queryRenderedFeatures !== "function") return;
        const interaction = interactionsRef.current;
        const selectedIds = interaction.selectedBagFeatureIds || new Set();
        const selectedPointIds = new Set((interaction.buildingSelectionPoints || []).map(point => point.id));
        const selectedCandidates = interaction.candidates.filter(candidate => selectedIds.has(featureSourceId(candidate)));

        standardBuildingStatesRef.current.forEach(record => {
          const selected = selectedIds.has(record.bagFeatureId) || selectedPointIds.has(record.selectionPointId);
          const listHighlight = interaction.highlightedBuildingKey === `bag:${record.bagFeatureId}`
            || interaction.highlightedBuildingKey === `point:${record.selectionPointId}`;
          if (listHighlight || record.listHighlight) {
            setStandardBuildingState(map, record.feature, { select: selected && !listHighlight, highlight: listHighlight });
            record.listHighlight = listHighlight;
            record.selected = selected;
            return;
          }
          if (record.selected === selected) return;
          if (setStandardBuildingState(map, record.feature, { select: selected })) record.selected = selected;
        });

        let visibleBuildings = [];
        try {
          visibleBuildings = map.queryRenderedFeatures({ target: STANDARD_BUILDINGS_TARGET }) || [];
        } catch {
          // A style without Standard features still supports an exact stored
          // geometry/selection-point hover fallback.
          visibleBuildings = [];
        }
        const pointAssociations = pointBuildingAssociations(visibleBuildings, interaction.buildingSelectionPoints);
        visibleBuildings.forEach(feature => {
          // Prefer an already selected stable BAG contour while restoring
          // visual state. This prevents an overlapping unselected candidate
          // from making a saved selection appear uncoloured after panning.
          const bagCandidate = matchMapboxBuildingToBagCandidate(feature, selectedCandidates)
            || matchMapboxBuildingToBagCandidate(feature, interaction.candidates);
          const bagFeatureId = featureSourceId(bagCandidate);
          const selectionPoint = (interaction.buildingSelectionPoints || []).find(point => pointAssociations.get(point.id)?.size === 1 && featureStrictlyContainsCoordinate(feature, [point.longitude, point.latitude]));
          const selected = selectedIds.has(bagFeatureId) || Boolean(selectionPoint);
          const key = mapboxBuildingFeatureKey(feature);
          const previous = standardBuildingStatesRef.current.get(key);
          if (!bagFeatureId && !selectionPoint && !previous) return;
          if (!previous || previous.selected !== selected) setStandardBuildingState(map, feature, { select: selected });
          const listHighlight = interaction.highlightedBuildingKey === `bag:${bagFeatureId}`
            || interaction.highlightedBuildingKey === `point:${selectionPoint?.id}`;
          if (listHighlight) setStandardBuildingState(map, feature, { select: false, highlight: true });
          const stateKey = rememberStandardBuilding(feature, bagFeatureId, selected, selectionPoint?.id || null);
          standardBuildingStatesRef.current.get(stateKey).listHighlight = listHighlight;
        });
        // Fallback only when no native building can be highlighted, including
        // legacy hand-drawn buildings. Never persist rendered Mapbox geometry.
        const nativeHighlighted = [...standardBuildingStatesRef.current.values()].some(record => record.listHighlight);
        const fallbackFeatures = nativeHighlighted || !interaction.highlightedBuildingKey ? []
          : (dataRef.current?.selected.features || []).filter(feature => {
            const key = feature.properties?.source === "manual" ? `manual:${feature.properties.local_id || feature.id}` : `bag:${featureSourceId(feature)}`;
            return key === interaction.highlightedBuildingKey;
          });
        if (!nativeHighlighted && interaction.highlightedBuildingKey?.startsWith("point:")) {
          const point = (interaction.buildingSelectionPoints || []).find(item => `point:${item.id}` === interaction.highlightedBuildingKey);
          if (point) fallbackFeatures.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [point.longitude, point.latitude] } });
        }
        sourceData(map, SOURCE.hover, featureCollection(fallbackFeatures));
      };
      const resetAndSyncStandardBuildingStates = () => {
        standardBuildingStatesRef.current.clear();
        hoveredStandardBuildingsRef.current.clear();
        syncStandardBuildingStates();
      };
      syncStandardBuildingStatesRef.current = syncStandardBuildingStates;

      const installStandardBuildingInteractions = () => {
        if (standardBuildingInteractionsInstalled || typeof map.addInteraction !== "function") return;
        map.addInteraction(STANDARD_BUILDING_INTERACTION.mouseenter, {
          type: "mouseenter",
          target: STANDARD_BUILDINGS_TARGET,
          handler: event => {
            const interaction = interactionsRef.current;
            if (interaction.workspace !== "buildings" || interaction.disabled || interaction.drawingTarget || interaction.editingTarget || !event.feature) return false;
            const key = mapboxBuildingFeatureKey(event.feature);
            hoveredStandardBuildingsRef.current.set(key, event.feature);
            setStandardBuildingState(map, event.feature, { highlight: true });
            map.getCanvas().style.cursor = "pointer";
            return true;
          },
        });
        map.addInteraction(STANDARD_BUILDING_INTERACTION.mouseleave, {
          type: "mouseleave",
          target: STANDARD_BUILDINGS_TARGET,
          handler: event => {
            if (event.feature) {
              const record = standardBuildingStatesRef.current.get(mapboxBuildingFeatureKey(event.feature));
              setStandardBuildingState(map, event.feature, { highlight: Boolean(record?.listHighlight) });
              hoveredStandardBuildingsRef.current.delete(mapboxBuildingFeatureKey(event.feature));
            }
            if (!dragRef.current) map.getCanvas().style.cursor = "";
            return false;
          },
        });
        map.addInteraction(STANDARD_BUILDING_INTERACTION.click, {
          type: "click",
          target: STANDARD_BUILDINGS_TARGET,
          handler: event => {
            const interaction = interactionsRef.current;
            if (interaction.workspace !== "buildings" || interaction.disabled || interaction.drawingTarget || interaction.editingTarget || !event.feature) return false;
            const clickCoordinate = event.lngLat ? [event.lngLat.lng, event.lngLat.lat] : null;
            const existingPoints = (interaction.buildingSelectionPoints || []).filter(point => featureStrictlyContainsCoordinate(event.feature, [point.longitude, point.latitude]));
            if (existingPoints.length > 1) {
              interaction.onBuildingMatchUnavailable?.("Dit gebouw bevat meerdere opgeslagen selecties. Verwijder de gewenste selectie uit de lijst naast de kaart.");
              return true;
            }
            const existingPoint = existingPoints[0];
            if (existingPoint) {
              let visiblePointFootprints;
              try {
                const visible = [...(map.queryRenderedFeatures({ target: STANDARD_BUILDINGS_TARGET }) || []), event.feature];
                visiblePointFootprints = pointBuildingAssociations(visible, [existingPoint]).get(existingPoint.id);
              } catch {
                interaction.onBuildingMatchUnavailable?.("De kaart wordt nog geladen. Probeer het gebouw over een moment opnieuw te selecteren.");
                return true;
              }
              if (visiblePointFootprints?.size !== 1) {
                interaction.onBuildingMatchUnavailable?.("Deze opgeslagen selectie ligt onder meerdere gebouwen. Verwijder haar uit de lijst en kies het gebouw opnieuw van bovenaf.");
                return true;
              }
              interaction.buildingSelectionPoints = interaction.buildingSelectionPoints.filter(point => point.id !== existingPoint.id);
              setStandardBuildingState(map, event.feature, { select: false, highlight: false });
              rememberStandardBuilding(event.feature, null, false, existingPoint.id);
              interaction.onToggleBuildingPoint?.(existingPoint);
              return true;
            }
            const bagCandidate = matchMapboxBuildingToBagCandidate(event.feature, interaction.candidates, clickCoordinate);
            const bagFeatureId = featureSourceId(bagCandidate);
            if (!bagFeatureId) {
              // Persist only the operator's own click location. Mapbox's
              // transient feature IDs and building geometry stay in memory.
              if (!clickCoordinate || !featureStrictlyContainsCoordinate(event.feature, clickCoordinate)) {
                map.easeTo({ pitch: 0, zoom: Math.max(map.getZoom(), 18), duration: 450 });
                interaction.onBuildingMatchUnavailable?.("Klik nogmaals op het gebouw van bovenaf.");
                return true;
              }
              let clickBuildings;
              try {
                clickBuildings = [...(map.queryRenderedFeatures({ target: STANDARD_BUILDINGS_TARGET }) || []), event.feature];
              } catch {
                interaction.onBuildingMatchUnavailable?.("De kaart wordt nog geladen. Probeer het gebouw over een moment opnieuw te selecteren.");
                return true;
              }
              const clickFootprints = new Set(clickBuildings
                .filter(feature => featureStrictlyContainsCoordinate(feature, clickCoordinate))
                .map(buildingFootprintKey));
              if (clickFootprints.size !== 1) {
                map.easeTo({ pitch: 0, zoom: Math.max(map.getZoom(), 18), duration: 450 });
                interaction.onBuildingMatchUnavailable?.("Hier overlappen twee gebouwen. Klik van bovenaf op een vrij deel van het gewenste gebouw.");
                return true;
              }
              if (!interaction.onToggleBuildingPoint) return true;
              const selectionPoint = {
                id: globalThis.crypto.randomUUID(),
                source: "user_selected",
                provider: "mapbox",
                bag_status: "unlinked",
                longitude: clickCoordinate[0],
                latitude: clickCoordinate[1],
              };
              interaction.buildingSelectionPoints = [...interaction.buildingSelectionPoints, selectionPoint];
              setStandardBuildingState(map, event.feature, { select: true, highlight: false });
              rememberStandardBuilding(event.feature, null, true, selectionPoint.id);
              interaction.onToggleBuildingPoint(selectionPoint);
              return true;
            }
            const selectedIds = new Set(interaction.selectedBagFeatureIds || []);
            const selected = !selectedIds.has(bagFeatureId);
            if (selected) selectedIds.add(bagFeatureId);
            else selectedIds.delete(bagFeatureId);
            interaction.selectedBagFeatureIds = selectedIds;
            setStandardBuildingState(map, event.feature, { select: selected, highlight: false });
            rememberStandardBuilding(event.feature, bagFeatureId, selected);
            interaction.onToggleCandidate?.(bagFeatureId);
            return true;
          },
        });
        standardBuildingInteractionsInstalled = true;
      };

      const ensureWorkspace = () => {
        if (cancelled || !map) return;
        try {
          addWorkspaceLayers(map, dataRef.current);
          applyWorkspaceView();
          installStandardBuildingInteractions();
          resetAndSyncStandardBuildingStates();
          readyRef.current = true;
          setError(null);
          setReady(true);
        } catch (cause) {
          readyRef.current = false;
          setReady(false);
          setError(cause instanceof Error ? cause : new Error("De kaartlagen konden niet worden geladen."));
        }
      };
      map.on("style.load", ensureWorkspace);
      map.on("style.import.load", resetAndSyncStandardBuildingStates);
      map.on("idle", syncStandardBuildingStates);
      map.on("error", event => {
        if (!readyRef.current && !cancelled) setError(event?.error || new Error("De kaart kon niet worden geladen."));
      });

      const toggleFeature = event => {
        const interaction = interactionsRef.current;
        if (standardBuildingInteractionsInstalled) return;
        if (featureEventHandled(event, handledEventsRef.current)) return;
        if (interaction.workspace !== "buildings" || interaction.disabled || interaction.drawingTarget || interaction.editingTarget) return;
        const feature = event.features?.[0];
        if (!feature) return;
        if (feature.properties?.source && feature.properties.source !== "pdok_bag") return;
        markFeatureEventHandled(event, handledEventsRef.current);
        interaction.onToggleCandidate?.(featureSourceId(feature));
      };
      map.on("click", LAYER.candidatesFill, toggleFeature);
      map.on("mousemove", LAYER.candidatesFill, () => {
        if (!standardBuildingInteractionsInstalled && interactionsRef.current.workspace === "buildings" && !interactionsRef.current.disabled && !interactionsRef.current.drawingTarget) map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", LAYER.candidatesFill, () => {
        if (!standardBuildingInteractionsInstalled && !dragRef.current) map.getCanvas().style.cursor = "";
      });

      map.on("click", LAYER.parcelsFill, event => {
        const interaction = interactionsRef.current;
        if (interaction.disabled || interaction.workspace !== "terrain" || !interaction.parcelsVisible || !interaction.parcelSelectionEnabled || interaction.drawingTarget || interaction.editingTarget) return;
        const feature = event.features?.[0];
        if (!feature || featureEventHandled(event, handledEventsRef.current)) return;
        // A moved/edited selection wins over the source parcel underneath it.
        if (event.lngLat && normalizeFeatureCollection(interaction.terrain).features.some(selected => featureStrictlyContainsCoordinate(selected, [event.lngLat.lng, event.lngLat.lat]))) return;
        markFeatureEventHandled(event, handledEventsRef.current);
        interaction.onToggleParcel?.(featureSourceId(feature));
      });
      map.on("mousemove", LAYER.parcelsFill, () => {
        const interaction = interactionsRef.current;
        if (!interaction.disabled && interaction.workspace === "terrain" && interaction.parcelSelectionEnabled && !interaction.drawingTarget && !interaction.editingTarget) map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", LAYER.parcelsFill, () => {
        if (!dragRef.current) map.getCanvas().style.cursor = interactionsRef.current.drawingTarget ? "crosshair" : "";
      });

      map.on("click", LAYER.terrainFill, event => {
        const interaction = interactionsRef.current;
        if (interaction.disabled || interaction.workspace !== "terrain" || interaction.editingTarget || interaction.drawingTarget || !interaction.onRemoveTerrainFeature) return;
        if (featureEventHandled(event, handledEventsRef.current)) return;
        const index = Number(event.features?.[0]?.properties?.loq_feature_index);
        if (!Number.isInteger(index)) return;
        markFeatureEventHandled(event, handledEventsRef.current);
        interaction.onRemoveTerrainFeature(index);
      });

      map.on("contextmenu", LAYER.vertices, event => {
        const interaction = interactionsRef.current;
        if (interaction.disabled || interaction.editingTarget !== "terrain") return;
        const reference = event.features?.[0]?.properties;
        if (!reference) return;
        event.preventDefault?.();
        event.originalEvent?.preventDefault?.();
        markFeatureEventHandled(event, handledEventsRef.current);
        const point = event.point || { x: 20, y: 20 };
        const width = containerRef.current?.clientWidth || 400;
        const height = containerRef.current?.clientHeight || 400;
        setPointMenu({ reference, x: Math.max(8, Math.min(point.x, width - 200)), y: Math.max(8, Math.min(point.y, height - 90)) });
      });

      map.on("click", LAYER.draftPoints, event => {
        const interaction = interactionsRef.current;
        if (interaction.disabled || !interaction.drawingTarget || interaction.drawingPoints?.length < 3 || !interaction.onFinishDrawing) return;
        if (Number(event.features?.[0]?.properties?.point_index) !== 0) return;
        markFeatureEventHandled(event, handledEventsRef.current);
        interaction.onFinishDrawing();
      });

      map.on("click", event => {
        const interaction = interactionsRef.current;
        if (featureEventHandled(event, handledEventsRef.current)) {
          handledEventsRef.current.delete(event.originalEvent);
          return;
        }
        setPointMenu(null);
        if (suppressBoundaryClickRef.current) { suppressBoundaryClickRef.current = false; return; }
        if (!interaction.disabled && interaction.editingTarget === "terrain" && event.point) {
          const result = insertBoundaryHandle(interaction.terrain, event.point, coordinate => map.project(coordinate));
          if (!result) return;
          setEditError(null);
          reportedEditErrorRef.current = null;
          let nextHandles = result.inserted ? shiftBoundaryHandles(handlesRef.current, result.reference, 1) : handlesRef.current;
          if (!nextHandles.some(handle => boundaryHandleKey(handle) === boundaryHandleKey(result.reference))) nextHandles = [...nextHandles, result.reference];
          updateHandles(nextHandles);
          if (result.inserted) {
            expectedTerrainRef.current = JSON.stringify(result.collection);
            interaction.onTerrainGeometryChange?.(result.collection);
          }
          return;
        }
        if (interaction.disabled || !interaction.drawingTarget) return;
        containerRef.current?.focus({ preventScroll: true });
        interaction.onAddDrawingPoint?.([event.lngLat.lng, event.lngLat.lat]);
      });
      map.on("mousedown", LAYER.vertices, event => {
        const interaction = interactionsRef.current;
        const feature = event.features?.[0];
        if (interaction.disabled || !interaction.editingTarget || !feature) return;
        if (event.originalEvent?.button === 2 || event.originalEvent?.ctrlKey) return;
        suppressBoundaryClickRef.current = false;
        setPointMenu(null);
        event.preventDefault();
        if (event.originalEvent) handledEventsRef.current.add(event.originalEvent);
        dragRef.current = {
          target: String(feature.properties?.target || interaction.editingTarget),
          feature_index: Number(feature.properties?.feature_index),
          ring_index: Number(feature.properties?.ring_index),
          polygon_index: Number(feature.properties?.polygon_index || 0),
          vertex_index: Number(feature.properties?.vertex_index),
        };
        map.dragPan.disable();
        map.getCanvas().style.cursor = "grabbing";
        interaction.onVertexDragStart?.(dragRef.current.target);
      });
      map.on("mousemove", event => {
        const interaction = interactionsRef.current;
        if (dragRef.current) {
          suppressBoundaryClickRef.current = true;
          if (dragRef.current.target === "terrain") {
            const result = moveBoundaryHandle(interaction.terrain, dragRef.current, [event.lngLat.lng, event.lngLat.lat]);
            if (result.error) { interaction.reportEditError(result.error); return; }
            expectedTerrainRef.current = JSON.stringify(result.collection);
            setEditError(null);
            reportedEditErrorRef.current = null;
          }
          interaction.onMoveVertex?.(dragRef.current.target, dragRef.current, [event.lngLat.lng, event.lngLat.lat]);
          return;
        }
        if (interaction.disabled || !interaction.drawingTarget || !event.lngLat) return;
        previewPointRef.current = [event.lngLat.lng, event.lngLat.lat];
        sourceData(map, SOURCE.draft, drawingCollection(interaction.drawingPoints, previewPointRef.current));
        map.getCanvas().style.cursor = "crosshair";
      });
      const finishDrag = () => {
        if (!dragRef.current) return;
        const target = dragRef.current.target;
        dragRef.current = null;
        map.dragPan.enable();
        map.getCanvas().style.cursor = "";
        interactionsRef.current.onVertexDragEnd?.(target);
      };
      map.on("mouseup", finishDrag);
      map.on("mouseout", finishDrag);
      map.on("mouseout", () => {
        previewPointRef.current = null;
        sourceData(map, SOURCE.draft, drawingCollection(interactionsRef.current.drawingPoints));
      });

      mapRef.current = map;
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => map?.resize());
        resizeObserver.observe(containerRef.current);
      }
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause : new Error("De kaart kon niet worden geladen."));
    });
    return () => {
      cancelled = true;
      readyRef.current = false;
      setReady(false);
      syncStandardBuildingStatesRef.current = null;
      clearStandardBuildingHoverRef.current = null;
      applyWorkspaceViewRef.current = null;
      standardBuildingStatesRef.current.clear();
      hoveredStandardBuildingsRef.current.clear();
      resizeObserver?.disconnect();
      map?.remove();
      mapRef.current = null;
    };
  }, [object?.id, object?.latitude, object?.longitude, object?.geocoding_status]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    sourceData(map, SOURCE.candidates, mapData.candidates);
    sourceData(map, SOURCE.selected, mapData.selected);
    sourceData(map, SOURCE.terrain, mapData.terrain);
    sourceData(map, SOURCE.draft, mapData.draft);
    sourceData(map, SOURCE.vertices, mapData.vertices);
    sourceData(map, SOURCE.anchor, mapData.anchor);
    sourceData(map, SOURCE.parcels, mapData.parcels);
    syncStandardBuildingStatesRef.current?.();
  }, [mapData, ready]);

  useEffect(() => {
    if (!ready) return;
    syncStandardBuildingStatesRef.current?.();
  }, [buildingSelectionPoints, highlightedBuildingKey, ready]);

  useEffect(() => {
    if (!ready) return;
    applyWorkspaceViewRef.current?.();
  }, [drawingTarget, editingTarget, mapView, parcelsVisible, ready, workspace]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || appliedNavigationBoundsRef.current === navigationBoundsKey) return;
    map.setMaxBounds(navigationBoundsRef.current);
    appliedNavigationBoundsRef.current = navigationBoundsKey;
  }, [navigationBoundsKey, ready]);

  useEffect(() => {
    if (workspace === "buildings" && !disabled && !drawingTarget && !editingTarget) return;
    clearStandardBuildingHoverRef.current?.();
  }, [disabled, drawingTarget, editingTarget, workspace]);

  return (
    <div className="relative h-[540px] min-h-[420px] overflow-hidden rounded-xl border border-border/70 bg-muted/30 shadow-inner lg:h-[680px]">
      <div ref={containerRef} className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-primary" tabIndex={0} aria-label={`Kaart en terrein van ${object?.name || "object"}`} onKeyDown={event => {
        if (interactionDisabled || !drawingTarget || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.target?.closest?.("input, textarea, select, button, [contenteditable='true']")) return;
        if (event.key === "Enter" && drawingPoints?.length >= 3 && onFinishDrawing) {
          event.preventDefault();
          onFinishDrawing();
        } else if (event.key === "Escape" && onCancelDrawing) {
          event.preventDefault();
          onCancelDrawing();
        } else if (event.key === "Backspace" && onRemoveLastDrawingPoint) {
          event.preventDefault();
          onRemoveLastDrawingPoint();
        }
      }} />
      {!ready && !error && <div className="absolute inset-0 flex items-center justify-center bg-background/75 text-sm text-muted-foreground backdrop-blur-sm"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Kaart laden...</div>}
      {error && <div className="absolute inset-x-4 top-4 rounded-xl border border-destructive/30 bg-background/95 p-4 text-sm text-destructive shadow-lg backdrop-blur-xl">{error.message}</div>}
      {editError && <div role="alert" className="absolute inset-x-3 top-16 rounded-lg border border-amber-400/60 bg-background/95 p-3 text-xs text-amber-800 shadow-lg dark:text-amber-200">{editError}</div>}
      {ready && <div className="pointer-events-none absolute bottom-12 left-3 rounded-lg bg-background/85 px-2 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur-xl">{trustedObjectCoordinatePair(object) ? "Kaart begrensd tot de omgeving van dit object" : "Nederland-overzicht · bevestig eerst het objectadres"}</div>}
      {drawingTarget && !interactionDisabled && (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-xl border border-violet-300/60 bg-background/90 px-3 py-2 text-xs shadow-lg backdrop-blur-xl">
          <MousePointer2 className="h-3.5 w-3.5 text-violet-600" />
          Klik hoekpunten · sluit op het eerste punt of met Enter · Backspace: punt terug · Esc: annuleren
        </div>
      )}
      {workspace === "buildings" && !drawingTarget && !editingTarget && !interactionDisabled && (
        <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-110px)] items-center gap-2 rounded-xl border border-blue-300/50 bg-background/90 px-3 py-2 text-xs shadow-lg backdrop-blur-xl">
          <Building2 className="h-3.5 w-3.5 text-primary" />
          Klik op een 3D-gebouw; het gebouw zelf kleurt blauw
        </div>
      )}
      {workspace === "terrain" && parcelSelectionEnabled && !drawingTarget && !editingTarget && !interactionDisabled && (
        <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-110px)] items-center gap-2 rounded-xl border border-emerald-300/50 bg-background/90 px-3 py-2 text-xs shadow-lg backdrop-blur-xl">
          <LandPlot className="h-3.5 w-3.5 text-emerald-600" /> Klik een perceel om toe te voegen; klik groen terrein om te verwijderen
        </div>
      )}
      {editingTarget === "terrain" && !interactionDisabled && <div className="pointer-events-none absolute left-3 top-3 max-w-[calc(100%-110px)] rounded-xl border border-emerald-300/50 bg-background/90 px-3 py-2 text-xs shadow-lg backdrop-blur-xl">
        Klik op de groene grens voor een punt · sleep het punt · rechtermuisknop: verwijderen
      </div>}
      {ready && <div className="absolute right-3 top-3 grid grid-cols-2 gap-1 rounded-xl border bg-background/95 p-1 shadow-lg" role="group" aria-label="Kaart draaien en kantelen">
        <Button type="button" size="icon" variant="ghost" aria-label="Kaart linksom draaien" title="Linksom draaien · rechtermuisknop + slepen werkt ook" onClick={() => mapRef.current?.easeTo({ bearing: mapRef.current.getBearing() - 15, duration: 250 })}><RotateCcw className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="ghost" aria-label="Kaart rechtsom draaien" title="Rechtsom draaien · rechtermuisknop + slepen werkt ook" onClick={() => mapRef.current?.easeTo({ bearing: mapRef.current.getBearing() + 15, duration: 250 })}><RotateCw className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="ghost" aria-label="3D-kijkhoek vergroten" title={groundEditing ? "Tijdens grens aanpassen en luchtfoto blijft de kaart vlak voor nauwkeurigheid" : "Meer 3D · rechtermuisknop + verticaal slepen"} disabled={groundEditing} onClick={() => mapRef.current?.easeTo({ pitch: Math.min(65, mapRef.current.getPitch() + 10), duration: 250 })}><ChevronUp className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="ghost" aria-label="3D-kijkhoek verkleinen" title={groundEditing ? "Tijdens grens aanpassen en luchtfoto blijft de kaart vlak voor nauwkeurigheid" : "Minder 3D · rechtermuisknop + verticaal slepen"} disabled={groundEditing} onClick={() => mapRef.current?.easeTo({ pitch: Math.max(0, mapRef.current.getPitch() - 10), duration: 250 })}><ChevronDown className="h-4 w-4" /></Button>
      </div>}
      {pointMenu && editingTarget === "terrain" && <div role="menu" aria-label="Grenspunt" className="absolute z-20 rounded-xl border bg-background p-1 shadow-xl" style={{ left: pointMenu.x, top: pointMenu.y }} onKeyDown={event => {
        if (event.key === "Escape") { setPointMenu(null); containerRef.current?.focus(); }
      }}>
        <Button type="button" role="menuitem" variant="ghost" size="sm" autoFocus onClick={() => {
          const result = removeBoundaryHandle(terrain, pointMenu.reference);
          if (result.error) reportEditError(result.error);
          else {
            setEditError(null);
            reportedEditErrorRef.current = null;
            updateHandles(shiftBoundaryHandles(handlesRef.current, pointMenu.reference, -1));
            expectedTerrainRef.current = JSON.stringify(result.collection);
            onTerrainGeometryChange?.(result.collection);
          }
          setPointMenu(null);
          containerRef.current?.focus();
        }}><Trash2 className="mr-2 h-4 w-4" /> Punt verwijderen</Button>
      </div>}
      <Button type="button" size="sm" variant="secondary" className="absolute bottom-3 left-3 bg-background/90 shadow-md backdrop-blur-xl" onClick={() => {
        const map = mapRef.current;
        const bounds = featureCollectionBounds(selectedBuildings, selectedPointCollection, terrain, mapData.anchor);
        if (!map || !bounds) return;
        map.fitBounds([[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]], { padding: 70, maxZoom: 18.5, duration: 500 });
      }} disabled={!ready}>
        <LocateFixed className="h-4 w-4" /> Passend tonen
      </Button>
    </div>
  );
}
