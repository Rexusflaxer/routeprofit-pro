import React, { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Loader2, LocateFixed, MousePointer2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAPBOX_PUBLIC_TOKEN } from "@/components/navigation/mapboxConfig";
import { trustedObjectCoordinatePair } from "@/lib/coordinates";
import {
  editableVertices,
  featureCollectionBounds,
  featureSourceId,
  matchMapboxBuildingToBagCandidate,
  normalizeFeatureCollection,
} from "./objectMapGeometry";
import "mapbox-gl/dist/mapbox-gl.css";

const SOURCE = {
  candidates: "loq-object-map-candidates",
  selected: "loq-object-map-selected",
  terrain: "loq-object-map-terrain",
  draft: "loq-object-map-draft",
  vertices: "loq-object-map-vertices",
  anchor: "loq-object-map-anchor",
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
};

const STANDARD_BUILDINGS_TARGET = { featuresetId: "buildings", importId: "basemap" };
const STANDARD_BUILDING_INTERACTION = {
  click: "loq-object-map-standard-building-click",
  mouseenter: "loq-object-map-standard-building-mouseenter",
  mouseleave: "loq-object-map-standard-building-mouseleave",
};

function featureCollection(features = []) {
  return { type: "FeatureCollection", features };
}

function drawingCollection(points) {
  if (!points?.length) return featureCollection();
  const pointFeatures = points.map((coordinate, index) => ({
    type: "Feature",
    id: `draft-point-${index}`,
    properties: { kind: "point" },
    geometry: { type: "Point", coordinates: coordinate },
  }));
  const line = points.length > 1 ? [{
    type: "Feature",
    id: "draft-line",
    properties: { kind: "line" },
    geometry: { type: "LineString", coordinates: points },
  }] : [];
  const polygon = points.length > 2 ? [{
    type: "Feature",
    id: "draft-polygon",
    properties: { kind: "polygon" },
    geometry: { type: "Polygon", coordinates: [[...points, points[0]]] },
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
  addSource(map, SOURCE.candidates, data.candidates);
  addSource(map, SOURCE.selected, data.selected);
  addSource(map, SOURCE.terrain, data.terrain);
  addSource(map, SOURCE.draft, data.draft);
  addSource(map, SOURCE.vertices, data.vertices);
  addSource(map, SOURCE.anchor, data.anchor);

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
  addLayer(map, { id: LAYER.terrainLine, type: "line", source: SOURCE.terrain, paint: { "line-color": "#059669", "line-width": 3, "line-dasharray": [2, 1] } });
  addLayer(map, { id: LAYER.draftFill, type: "fill", source: SOURCE.draft, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#8b5cf6", "fill-opacity": 0.18 } });
  addLayer(map, { id: LAYER.draftLine, type: "line", source: SOURCE.draft, filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#7c3aed", "line-width": 3, "line-dasharray": [2, 1] } });
  addLayer(map, { id: LAYER.draftPoints, type: "circle", source: SOURCE.draft, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": "#7c3aed", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
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
  focusNonce,
  onToggleCandidate,
  onAddDrawingPoint,
  onVertexDragStart,
  onMoveVertex,
  onVertexDragEnd,
  onBuildingMatchUnavailable,
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
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const mapData = useMemo(() => ({
    candidates: candidateCollection(candidates, selectedBagFeatureIds),
    selected: normalizeFeatureCollection(selectedBuildings),
    terrain: normalizeFeatureCollection(terrain),
    draft: drawingCollection(drawingPoints),
    vertices: editingTarget === "terrain"
      ? editableVertices(terrain, "terrain")
      : editingTarget === "building"
        ? editableVertices(manualBuildings, "building")
        : featureCollection(),
    anchor: anchorCollection(object),
  }), [candidates, drawingPoints, editingTarget, manualBuildings, object, selectedBagFeatureIds, selectedBuildings, terrain]);
  const matchCandidates = useMemo(
    () => buildingMatchCandidates(candidates, selectedBuildings, selectedBagFeatureIds),
    [candidates, selectedBagFeatureIds, selectedBuildings],
  );
  dataRef.current = mapData;
  interactionsRef.current = {
    disabled,
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
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/standard",
        center: coordinates || [5.2913, 52.1326],
        zoom: coordinates ? 17 : 7,
        pitch: coordinates ? 42 : 0,
        bearing: coordinates ? -12 : 0,
        minZoom: 5,
        attributionControl: true,
        config: {
          basemap: {
            colorBuildingHighlight: "#93c5fd",
            colorBuildingSelect: "#1f7aff",
            show3dBuildings: true,
            show3dFacades: true,
            show3dLandmarks: false,
          },
        },
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "bottom-right");
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();

      const rememberStandardBuilding = (feature, bagFeatureId, selected) => {
        const key = mapboxBuildingFeatureKey(feature);
        standardBuildingStatesRef.current.set(key, { feature, bagFeatureId, selected });
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
        const selectedCandidates = interaction.candidates.filter(candidate => selectedIds.has(featureSourceId(candidate)));

        standardBuildingStatesRef.current.forEach(record => {
          const selected = selectedIds.has(record.bagFeatureId);
          if (record.selected === selected) return;
          if (setStandardBuildingState(map, record.feature, { select: selected })) record.selected = selected;
        });

        let visibleBuildings = [];
        try {
          visibleBuildings = map.queryRenderedFeatures({ target: STANDARD_BUILDINGS_TARGET }) || [];
        } catch {
          return;
        }
        visibleBuildings.forEach(feature => {
          // Prefer an already selected stable BAG contour while restoring
          // visual state. This prevents an overlapping unselected candidate
          // from making a saved selection appear uncoloured after panning.
          const bagCandidate = matchMapboxBuildingToBagCandidate(feature, selectedCandidates)
            || matchMapboxBuildingToBagCandidate(feature, interaction.candidates);
          const bagFeatureId = featureSourceId(bagCandidate);
          if (!bagFeatureId) return;
          const selected = selectedIds.has(bagFeatureId);
          const key = mapboxBuildingFeatureKey(feature);
          const previous = standardBuildingStatesRef.current.get(key);
          if (!previous || previous.selected !== selected) setStandardBuildingState(map, feature, { select: selected });
          rememberStandardBuilding(feature, bagFeatureId, selected);
        });
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
            if (interaction.disabled || interaction.drawingTarget || interaction.editingTarget || !event.feature) return false;
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
              setStandardBuildingState(map, event.feature, { highlight: false });
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
            if (interaction.disabled || interaction.drawingTarget || interaction.editingTarget || !event.feature) return false;
            const clickCoordinate = event.lngLat ? [event.lngLat.lng, event.lngLat.lat] : null;
            const bagCandidate = matchMapboxBuildingToBagCandidate(event.feature, interaction.candidates, clickCoordinate);
            const bagFeatureId = featureSourceId(bagCandidate);
            if (!bagFeatureId) {
              interaction.onBuildingMatchUnavailable?.();
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
        if (interaction.disabled || interaction.drawingTarget || interaction.editingTarget) return;
        const feature = event.features?.[0];
        if (!feature) return;
        if (feature.properties?.source && feature.properties.source !== "pdok_bag") return;
        markFeatureEventHandled(event, handledEventsRef.current);
        interaction.onToggleCandidate?.(featureSourceId(feature));
      };
      map.on("click", LAYER.candidatesFill, toggleFeature);
      map.on("mousemove", LAYER.candidatesFill, () => {
        if (!standardBuildingInteractionsInstalled && !interactionsRef.current.disabled && !interactionsRef.current.drawingTarget) map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", LAYER.candidatesFill, () => {
        if (!standardBuildingInteractionsInstalled && !dragRef.current) map.getCanvas().style.cursor = "";
      });

      map.on("click", event => {
        const interaction = interactionsRef.current;
        if (featureEventHandled(event, handledEventsRef.current)) {
          handledEventsRef.current.delete(event.originalEvent);
          return;
        }
        if (interaction.disabled || !interaction.drawingTarget) return;
        interaction.onAddDrawingPoint?.([event.lngLat.lng, event.lngLat.lat]);
      });
      map.on("mousedown", LAYER.vertices, event => {
        const interaction = interactionsRef.current;
        const feature = event.features?.[0];
        if (interaction.disabled || !interaction.editingTarget || !feature) return;
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
        if (!dragRef.current) return;
        interactionsRef.current.onMoveVertex?.(dragRef.current.target, dragRef.current, [event.lngLat.lng, event.lngLat.lat]);
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
    syncStandardBuildingStatesRef.current?.();
  }, [mapData, ready]);

  useEffect(() => {
    if (!disabled && !drawingTarget && !editingTarget) return;
    clearStandardBuildingHoverRef.current?.();
  }, [disabled, drawingTarget, editingTarget]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !focusNonce) return;
    const bounds = featureCollectionBounds(selectedBuildings, terrain, mapData.anchor);
    if (!bounds) return;
    if (bounds.minLng === bounds.maxLng && bounds.minLat === bounds.maxLat) {
      map.easeTo({ center: [bounds.minLng, bounds.minLat], zoom: 17, duration: 500 });
      return;
    }
    map.fitBounds([[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]], { padding: 70, maxZoom: 18.5, duration: 500 });
  }, [focusNonce, mapData.anchor, ready, selectedBuildings, terrain]);

  return (
    <div className="relative h-[540px] min-h-[420px] overflow-hidden rounded-xl border border-border/70 bg-muted/30 shadow-inner lg:h-[680px]">
      <div ref={containerRef} className="absolute inset-0" aria-label={`Kaart en terrein van ${object?.name || "object"}`} />
      {!ready && !error && <div className="absolute inset-0 flex items-center justify-center bg-background/75 text-sm text-muted-foreground backdrop-blur-sm"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Kaart laden...</div>}
      {error && <div className="absolute inset-x-4 top-4 rounded-xl border border-destructive/30 bg-background/95 p-4 text-sm text-destructive shadow-lg backdrop-blur-xl">{error.message}</div>}
      {drawingTarget && !disabled && (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-xl border border-violet-300/60 bg-background/90 px-3 py-2 text-xs shadow-lg backdrop-blur-xl">
          <MousePointer2 className="h-3.5 w-3.5 text-violet-600" />
          Klik hoekpunten op de kaart en sluit daarna het vlak
        </div>
      )}
      {!drawingTarget && !editingTarget && !disabled && (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-xl border border-blue-300/50 bg-background/90 px-3 py-2 text-xs shadow-lg backdrop-blur-xl">
          <Building2 className="h-3.5 w-3.5 text-primary" />
          Klik op een 3D-gebouw; het gebouw zelf kleurt blauw
        </div>
      )}
      <Button type="button" size="sm" variant="secondary" className="absolute bottom-3 left-3 bg-background/90 shadow-md backdrop-blur-xl" onClick={() => {
        const map = mapRef.current;
        const bounds = featureCollectionBounds(selectedBuildings, terrain, mapData.anchor);
        if (!map || !bounds) return;
        map.fitBounds([[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]], { padding: 70, maxZoom: 18.5, duration: 500 });
      }} disabled={!ready}>
        <LocateFixed className="h-4 w-4" /> Passend tonen
      </Button>
    </div>
  );
}
