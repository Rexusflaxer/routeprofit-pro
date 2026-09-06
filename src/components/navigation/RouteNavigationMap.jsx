import React from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_PUBLIC_TOKEN } from "./mapboxConfig";
import { Navigation } from "lucide-react";
import { getBuildingProximityFilter, normalizeRouteCoordinatePair } from "./routeStopUtils";

mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN;

const emptyRoute = { geometry: null, instruction: "Route laden...", distance: "", duration: "" };

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "";
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "";
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}u ${minutes % 60}m` : `${minutes} min`;
}

function distanceMeters(a, b) {
  if (!a || !b) return 0;
  const earthRadius = 6371000;
  const toRad = value => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function getBearing(a, b) {
  if (!a || !b) return 0;
  const startLat = a.latitude * Math.PI / 180;
  const startLng = a.longitude * Math.PI / 180;
  const endLat = b.latitude * Math.PI / 180;
  const endLng = b.longitude * Math.PI / 180;
  const y = Math.sin(endLng - startLng) * Math.cos(endLat);
  const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function distanceToSegmentSquared(point, start, end) {
  const x = point.longitude;
  const y = point.latitude;
  const x1 = start.longitude;
  const y1 = start.latitude;
  const x2 = end.longitude;
  const y2 = end.latitude;
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) return (x - x1) ** 2 + (y - y1) ** 2;

  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  const projectionX = x1 + t * dx;
  const projectionY = y1 + t * dy;
  return (x - projectionX) ** 2 + (y - projectionY) ** 2;
}

function getRouteBearing(geometry, userPosition, fallbackBearing) {
  const coordinates = geometry?.coordinates || [];
  if (coordinates.length < 2 || !userPosition) return fallbackBearing;

  let nearestIndex = 0;
  let nearestDistance = Infinity;

  for (let index = 1; index < coordinates.length; index += 1) {
    const [startLng, startLat] = coordinates[index - 1];
    const [endLng, endLat] = coordinates[index];
    const distance = distanceToSegmentSquared(
      userPosition,
      { latitude: startLat, longitude: startLng },
      { latitude: endLat, longitude: endLng }
    );

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index - 1;
    }
  }

  for (let index = nearestIndex + 1; index < coordinates.length; index += 1) {
    const [startLng, startLat] = coordinates[index - 1];
    const [endLng, endLat] = coordinates[index];
    if (Math.abs(startLng - endLng) > 0.00001 || Math.abs(startLat - endLat) > 0.00001) {
      return getBearing(
        { latitude: startLat, longitude: startLng },
        { latitude: endLat, longitude: endLng }
      );
    }
  }

  return fallbackBearing;
}

async function fetchDirections(points) {
  const routeCoordinates = points.map(normalizeRouteCoordinatePair).filter(Boolean).slice(0, 25);
  if (routeCoordinates.length < 2) return emptyRoute;
  const coordinates = routeCoordinates.map(([longitude, latitude]) => `${longitude},${latitude}`).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&overview=full&steps=true&continue_straight=false&language=nl&access_token=${MAPBOX_PUBLIC_TOKEN}`;
  const response = await fetch(url);
  const data = await response.json();
  const route = data.routes?.[0];
  const firstStep = route?.legs?.[0]?.steps?.[0];

  return {
    geometry: route?.geometry || null,
    instruction: firstStep?.maneuver?.instruction || "Volg de blauwe route",
    distance: formatDistance(route?.distance),
    duration: formatDuration(route?.duration),
  };
}

export default function RouteNavigationMap({ stops, objects = [], userPosition, visitedIds }) {
  const mapNode = React.useRef(null);
  const mapRef = React.useRef(null);
  const markersRef = React.useRef([]);
  const userMarkerRef = React.useRef(null);
  const previousPositionRef = React.useRef(null);
  const gpsBearingRef = React.useRef(null);
  const [routeInfo, setRouteInfo] = React.useState(emptyRoute);
  const [mapReady, setMapReady] = React.useState(false);

  React.useEffect(() => {
    if (!mapNode.current || mapRef.current) return;

    const center = normalizeRouteCoordinatePair(userPosition)
      || normalizeRouteCoordinatePair(stops[0])
      || [5.1214, 52.0907];
    const map = new mapboxgl.Map({
      container: mapNode.current,
      style: "mapbox://styles/mapbox/navigation-night-v1",
      center,
      zoom: 16,
      pitch: 62,
      bearing: getBearing(userPosition || stops[0], stops[1]),
      antialias: true,
    });

    mapRef.current = map;

    map.on("load", () => {
      const layers = map.getStyle().layers;
      const labelLayer = layers.find(layer => layer.type === "symbol" && layer.layout?.["text-field"])?.id;

      map.setFog({
        color: "rgb(18, 28, 44)",
        "high-color": "rgb(55, 85, 130)",
        "horizon-blend": 0.18,
        "space-color": "rgb(4, 7, 14)",
        "star-intensity": 0.18,
      });

      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.25 });

      map.addLayer({
        id: "enhanced-grass-areas",
        source: "composite",
        "source-layer": "landuse",
        filter: ["in", ["get", "class"], ["literal", ["park", "grass", "recreation_ground", "cemetery", "golf_course"]]],
        type: "fill",
        paint: { "fill-color": "#315f4b", "fill-opacity": 0.55 },
      }, labelLayer);

      map.addLayer({
        id: "enhanced-tree-areas",
        source: "composite",
        "source-layer": "landcover",
        filter: ["in", ["get", "class"], ["literal", ["wood", "scrub", "grass"]]],
        type: "fill",
        paint: { "fill-color": "#214c3a", "fill-opacity": 0.5 },
      }, labelLayer);

      map.addLayer({
        id: "3d-buildings",
        source: "composite",
        "source-layer": "building",
        filter: ["==", "extrude", "true"],
        type: "fill-extrusion",
        minzoom: 15,
        paint: {
          "fill-extrusion-color": "#3d4858",
          "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 15, 0, 16, ["get", "height"]],
          "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 15, 0, 16, ["get", "min_height"]],
          "fill-extrusion-opacity": 0.78,
        },
      }, labelLayer);

      map.addLayer({
        id: "customer-3d-buildings",
        source: "composite",
        "source-layer": "building",
        filter: getBuildingProximityFilter(objects),
        type: "fill-extrusion",
        minzoom: 15,
        paint: {
          "fill-extrusion-color": "#2563eb",
          "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 15, 0, 16, ["get", "height"]],
          "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 15, 0, 16, ["get", "min_height"]],
          "fill-extrusion-opacity": 0.9,
        },
      }, labelLayer);

      map.addLayer({
        id: "task-3d-buildings",
        source: "composite",
        "source-layer": "building",
        filter: getBuildingProximityFilter(stops.filter(stop => !visitedIds.has(stop.id))),
        type: "fill-extrusion",
        minzoom: 15,
        paint: {
          "fill-extrusion-color": "#f59e0b",
          "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 15, 0, 16, ["get", "height"]],
          "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 15, 0, 16, ["get", "min_height"]],
          "fill-extrusion-opacity": 0.94,
        },
      }, labelLayer);

      map.addSource("navigation-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "navigation-route-glow",
        type: "line",
        source: "navigation-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#60a5fa", "line-width": 22, "line-opacity": 0.45 },
      }, labelLayer);
      map.addLayer({
        id: "navigation-route-line",
        type: "line",
        source: "navigation-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#0ea5ff", "line-width": 11, "line-opacity": 1 },
      }, labelLayer);
      map.addLayer({
        id: "navigation-route-core",
        type: "line",
        source: "navigation-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#bfdbfe", "line-width": 3, "line-opacity": 0.9 },
      }, labelLayer);
      setMapReady(true);
    });

    return () => map.remove();
  }, []);

  React.useEffect(() => {
    if (!mapRef.current || !mapReady || stops.length === 0) return;
    const map = mapRef.current;

    if (map.getLayer("customer-3d-buildings")) {
      map.setFilter("customer-3d-buildings", getBuildingProximityFilter(objects));
    }
    if (map.getLayer("task-3d-buildings")) {
      map.setFilter("task-3d-buildings", getBuildingProximityFilter(stops.filter(stop => !visitedIds.has(stop.id))));
    }

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = stops.flatMap(stop => {
      const coordinates = normalizeRouteCoordinatePair(stop);
      if (!coordinates) return [];
      const markerEl = document.createElement("div");
      markerEl.className = `flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-bold shadow-lg ${visitedIds.has(stop.id) ? "bg-emerald-500 text-white" : "bg-amber-400 text-slate-950"}`;
      markerEl.textContent = stop.sequence;
      return [new mapboxgl.Marker(markerEl).setLngLat(coordinates).setPopup(new mapboxgl.Popup().setHTML(`<strong>${stop.sequence}. ${stop.name}</strong><br>${stop.address || ""}`)).addTo(map)];
    });

    const source = map.getSource("navigation-route");
    if (source) {
      source.setData({ type: "FeatureCollection", features: [] });
    }
  }, [stops, objects, visitedIds, mapReady]);

  React.useEffect(() => {
    if (!mapRef.current || !mapReady || !userPosition) return;
    const map = mapRef.current;
    const userCoordinates = normalizeRouteCoordinatePair(userPosition);
    if (!userCoordinates) return;

    if (!userMarkerRef.current) {
      const markerEl = document.createElement("div");
      markerEl.className = "relative flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white shadow-xl ring-4 ring-blue-400/30";
      markerEl.innerHTML = "➤";
      userMarkerRef.current = new mapboxgl.Marker(markerEl)
        .setLngLat(userCoordinates)
        .addTo(map);
    }

    const nextStop = stops.find(stop => !visitedIds.has(stop.id));
    const previousPosition = previousPositionRef.current;
    const movedMeters = previousPosition ? distanceMeters(previousPosition, userPosition) : 0;
    if (previousPosition && movedMeters >= 4) {
      gpsBearingRef.current = getBearing(previousPosition, userPosition);
    }
    previousPositionRef.current = userPosition;

    userMarkerRef.current.setLngLat(userCoordinates);

    const fallbackBearing = gpsBearingRef.current ?? getBearing(userPosition, nextStop || stops[0]);

    if (nextStop) {
      fetchDirections([userPosition, nextStop]).then(info => {
        setRouteInfo(info);
        const source = map.getSource("navigation-route");
        if (source && info.geometry) {
          source.setData({
            type: "FeatureCollection",
            features: [{ type: "Feature", properties: {}, geometry: info.geometry }],
          });
        }

        const cameraBearing = gpsBearingRef.current ?? getRouteBearing(info.geometry, userPosition, fallbackBearing);
        userMarkerRef.current?.setRotation(cameraBearing);

        map.easeTo({
          center: userCoordinates,
          zoom: 18.2,
          pitch: 76,
          bearing: cameraBearing,
          duration: 700,
          padding: { top: 120, bottom: 220, left: 60, right: 60 },
        });
      });
      return;
    }

    userMarkerRef.current?.setRotation(fallbackBearing);
    map.easeTo({
      center: userCoordinates,
      zoom: 18.2,
      pitch: 76,
      bearing: fallbackBearing,
      duration: 700,
      padding: { top: 120, bottom: 220, left: 60, right: 60 },
    });
  }, [userPosition, stops, visitedIds, mapReady]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapNode} className="h-full w-full" />
      <div className="absolute left-3 right-3 top-16 z-[500] rounded-xl bg-slate-950/90 p-3 text-white shadow-2xl backdrop-blur md:left-20 md:right-auto md:top-20 md:w-[360px]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white">
            <Navigation className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold leading-none">{routeInfo.distance || "--"}</p>
            <p className="mt-1 text-sm leading-snug text-slate-200">{routeInfo.instruction}</p>
            {routeInfo.duration && <p className="mt-0.5 text-xs text-slate-400">Rijtijd: {routeInfo.duration}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
