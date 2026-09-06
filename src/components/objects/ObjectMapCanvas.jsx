import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, LocateFixed, MousePointer2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAPBOX_PUBLIC_TOKEN } from "@/components/navigation/mapboxConfig";
import {
  editableVertices,
  featureCollectionBounds,
  featureSourceId,
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
  candidatesHover: "loq-object-map-candidates-hover",
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

function sourceData(map, id, data) {
  map.getSource(id)?.setData(data);
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
      "fill-color": ["case", ["==", ["get", "loq_selected"], true], "#1f7aff", ["==", ["get", "loq_conflict"], true], "#f59e0b", "#64748b"],
      "fill-opacity": ["case", ["==", ["get", "loq_selected"], true], 0.48, ["==", ["get", "loq_conflict"], true], 0.28, 0.12],
    },
  });
  addLayer(map, {
    id: LAYER.candidatesHover,
    type: "line",
    source: SOURCE.candidates,
    filter: ["==", ["id"], ""],
    paint: { "line-color": "#ffffff", "line-width": 4, "line-opacity": 0.95 },
  });
  addLayer(map, {
    id: LAYER.candidatesLine,
    type: "line",
    source: SOURCE.candidates,
    paint: {
      "line-color": ["case", ["==", ["get", "loq_selected"], true], "#0f5fd7", ["==", ["get", "loq_conflict"], true], "#d97706", "#64748b"],
      "line-width": ["case", ["==", ["get", "loq_selected"], true], 2.6, 1.3],
      "line-opacity": 0.92,
    },
  });
  addLayer(map, { id: LAYER.selectedFill, type: "fill", source: SOURCE.selected, paint: { "fill-color": ["case", ["==", ["get", "source"], "manual"], "#8b5cf6", "#1f7aff"], "fill-opacity": 0.34 } });
  addLayer(map, { id: LAYER.selectedLine, type: "line", source: SOURCE.selected, paint: { "line-color": ["case", ["==", ["get", "source"], "manual"], "#7c3aed", "#0759d3"], "line-width": 3 } });
  addLayer(map, { id: LAYER.terrainFill, type: "fill", source: SOURCE.terrain, paint: { "fill-color": "#10b981", "fill-opacity": 0.18 } });
  addLayer(map, { id: LAYER.terrainLine, type: "line", source: SOURCE.terrain, paint: { "line-color": "#059669", "line-width": 3, "line-dasharray": [2, 1] } });
  addLayer(map, { id: LAYER.draftFill, type: "fill", source: SOURCE.draft, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#8b5cf6", "fill-opacity": 0.18 } });
  addLayer(map, { id: LAYER.draftLine, type: "line", source: SOURCE.draft, filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#7c3aed", "line-width": 3, "line-dasharray": [2, 1] } });
  addLayer(map, { id: LAYER.draftPoints, type: "circle", source: SOURCE.draft, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": "#7c3aed", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
  addLayer(map, { id: LAYER.vertices, type: "circle", source: SOURCE.vertices, paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": "#1f7aff", "circle-stroke-width": 2.5 } });
  addLayer(map, { id: LAYER.anchor, type: "circle", source: SOURCE.anchor, paint: { "circle-radius": 6, "circle-color": "#111827", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
}

function anchorCollection(object) {
  const lng = Number(object?.longitude);
  const lat = Number(object?.latitude);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return featureCollection();
  return featureCollection([{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lng, lat] } }]);
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
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const dataRef = useRef(null);
  const interactionsRef = useRef({
    disabled: true,
    drawingTarget: null,
    editingTarget: null,
    onToggleCandidate: null,
    onAddDrawingPoint: null,
    onVertexDragStart: null,
    onMoveVertex: null,
    onVertexDragEnd: null,
  });
  const dragRef = useRef(null);
  const handledEventsRef = useRef(new WeakSet());
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
  dataRef.current = mapData;
  interactionsRef.current = {
    disabled,
    drawingTarget,
    editingTarget,
    onToggleCandidate,
    onAddDrawingPoint,
    onVertexDragStart,
    onMoveVertex,
    onVertexDragEnd,
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
    import("mapbox-gl").then(module => {
      if (cancelled || !containerRef.current) return;
      const mapboxgl = module.default;
      mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN;
      const lng = Number(object?.longitude);
      const lat = Number(object?.latitude);
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/standard",
        center: Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : [5.2913, 52.1326],
        zoom: Number.isFinite(lng) && Number.isFinite(lat) ? 17 : 7,
        pitch: Number.isFinite(lng) && Number.isFinite(lat) ? 42 : 0,
        bearing: Number.isFinite(lng) && Number.isFinite(lat) ? -12 : 0,
        minZoom: 5,
        attributionControl: true,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "bottom-right");
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();

      const ensureWorkspace = () => {
        if (cancelled || !map) return;
        try {
          addWorkspaceLayers(map, dataRef.current);
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
      map.on("error", event => {
        if (!readyRef.current && !cancelled) setError(event?.error || new Error("De kaart kon niet worden geladen."));
      });

      const toggleFeature = event => {
        const interaction = interactionsRef.current;
        if (featureEventHandled(event, handledEventsRef.current)) return;
        if (interaction.disabled || interaction.drawingTarget || interaction.editingTarget) return;
        const feature = event.features?.[0];
        if (!feature) return;
        if (feature.properties?.source && feature.properties.source !== "pdok_bag") return;
        markFeatureEventHandled(event, handledEventsRef.current);
        interaction.onToggleCandidate?.(featureSourceId(feature));
      };
      map.on("click", LAYER.candidatesFill, toggleFeature);
      map.on("click", LAYER.selectedFill, toggleFeature);
      [LAYER.candidatesFill, LAYER.selectedFill].forEach(layerId => {
        map.on("mousemove", layerId, event => {
          if (!interactionsRef.current.disabled && !interactionsRef.current.drawingTarget) map.getCanvas().style.cursor = "pointer";
          const id = event.features?.[0]?.id;
          if (map.getLayer(LAYER.candidatesHover)) map.setFilter(LAYER.candidatesHover, ["==", ["id"], id ?? ""]);
        });
        map.on("mouseleave", layerId, () => {
          if (!dragRef.current) map.getCanvas().style.cursor = "";
          if (map.getLayer(LAYER.candidatesHover)) map.setFilter(LAYER.candidatesHover, ["==", ["id"], ""]);
        });
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
      resizeObserver?.disconnect();
      map?.remove();
      mapRef.current = null;
    };
  }, [object?.id, object?.latitude, object?.longitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    sourceData(map, SOURCE.candidates, mapData.candidates);
    sourceData(map, SOURCE.selected, mapData.selected);
    sourceData(map, SOURCE.terrain, mapData.terrain);
    sourceData(map, SOURCE.draft, mapData.draft);
    sourceData(map, SOURCE.vertices, mapData.vertices);
    sourceData(map, SOURCE.anchor, mapData.anchor);
  }, [mapData, ready]);

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
