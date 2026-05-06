import React from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_PUBLIC_TOKEN } from "./mapboxConfig";
import { Navigation } from "lucide-react";

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

function normalizeMapCoordinates(item) {
  const latitude = Number(item?.latitude);
  const longitude = Number(item?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  if (latitude > 40 && latitude < 60 && longitude > -10 && longitude < 15) return [longitude, latitude];
  if (longitude > 40 && longitude < 60 && latitude > -10 && latitude < 15) return [latitude, longitude];
  return [longitude, latitude];
}

function getBuildingProximityFilter(items, radiusMeters = 45) {
  const coordinates = items.map(normalizeMapCoordinates).filter(Boolean);
  if (!coordinates.length) return ["in", ["id"], ["literal", []]];

  return [
    "all",
    ["==", ["get", "extrude"], "true"],
    ["<=", ["distance", { type: "MultiPoint", coordinates }], radiusMeters]
  ];
}

async function fetchDirections(points) {
  if (points.length < 2) return emptyRoute;
  const coordinates = points.slice(0, 25).map(point => `${point.longitude},${point.latitude}`).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&overview=full&steps=true&language=nl&access_token=${MAPBOX_PUBLIC_TOKEN}`;
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
  const [routeInfo, setRouteInfo] = React.useState(emptyRoute);
  const [mapReady, setMapReady] = React.useState(false);

  React.useEffect(() => {
    if (!mapNode.current || mapRef.current) return;

    const center = userPosition || stops[0] || { latitude: 52.0907, longitude: 5.1214 };
    const map = new mapboxgl.Map({
      container: mapNode.current,
      style: "mapbox://styles/mapbox/navigation-night-v1",
      center: [center.longitude, center.latitude],
      zoom: 16,
      pitch: 62,
      bearing: getBearing(userPosition || stops[0], stops[1]),
      antialias: true,
    });

    mapRef.current = map;

    map.on("load", () => {
      const layers = map.getStyle().layers;
      const labelLayer = layers.find(layer => layer.type === "symbol" && layer.layout?.["text-field"])?.id;

      map.addLayer({
        id: "3d-buildings",
        source: "composite",
        "source-layer": "building",
        filter: ["==", "extrude", "true"],
        type: "fill-extrusion",
        minzoom: 15,
        paint: {
          "fill-extrusion-color": "#334155",
          "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 15, 0, 16, ["get", "height"]],
          "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 15, 0, 16, ["get", "min_height"]],
          "fill-extrusion-opacity": 0.72,
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
    markersRef.current = stops.map(stop => {
      const markerEl = document.createElement("div");
      markerEl.className = `flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-bold shadow-lg ${visitedIds.has(stop.id) ? "bg-emerald-500 text-white" : "bg-amber-400 text-slate-950"}`;
      markerEl.textContent = stop.sequence;
      return new mapboxgl.Marker(markerEl).setLngLat([stop.longitude, stop.latitude]).setPopup(new mapboxgl.Popup().setHTML(`<strong>${stop.sequence}. ${stop.name}</strong><br>${stop.address || ""}`)).addTo(map);
    });

    const source = map.getSource("navigation-route");
    if (source) {
      source.setData({ type: "FeatureCollection", features: [] });
    }
  }, [stops, objects, visitedIds, mapReady]);

  React.useEffect(() => {
    if (!mapRef.current || !mapReady || !userPosition) return;
    const map = mapRef.current;

    if (!userMarkerRef.current) {
      const markerEl = document.createElement("div");
      markerEl.className = "relative flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white shadow-xl ring-4 ring-blue-400/30";
      markerEl.innerHTML = "➤";
      userMarkerRef.current = new mapboxgl.Marker(markerEl)
        .setLngLat([userPosition.longitude, userPosition.latitude])
        .addTo(map);
    }

    const nextStop = stops.find(stop => !visitedIds.has(stop.id));
    userMarkerRef.current.setLngLat([userPosition.longitude, userPosition.latitude]);

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
      });
    }

    map.easeTo({
      center: [userPosition.longitude, userPosition.latitude],
      zoom: 18.2,
      pitch: 72,
      bearing: getBearing(userPosition, nextStop || stops[0]),
      duration: 700,
      padding: { top: 120, bottom: 220, left: 60, right: 60 },
    });
  }, [userPosition, stops, visitedIds, mapReady]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapNode} className="h-full w-full" />
      <div className="absolute left-3 right-3 top-16 z-[500] rounded-2xl bg-slate-950/90 p-4 text-white shadow-2xl backdrop-blur md:left-20 md:right-auto md:top-20 md:w-[430px]">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-500 text-white">
            <Navigation className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <p className="text-3xl font-bold leading-none">{routeInfo.distance || "--"}</p>
            <p className="mt-2 text-lg text-slate-200">{routeInfo.instruction}</p>
            {routeInfo.duration && <p className="mt-1 text-sm text-slate-400">Geschatte rijtijd: {routeInfo.duration}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}