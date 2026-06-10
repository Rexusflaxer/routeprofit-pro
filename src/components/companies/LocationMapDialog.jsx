import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { MAPBOX_PUBLIC_TOKEN } from "@/components/navigation/mapboxConfig";
import "mapbox-gl/dist/mapbox-gl.css";

const TARGET_POINT_SOURCE_ID = "location-target-point";
const TARGET_BUILDING_SOURCE_ID = "location-target-building";
const TARGET_BUILDING_LAYER_ID = "location-target-building-highlight";
const BUILDING_QUERY_LAYERS = ["3d-building", "2d-building", "procedural-buildings"];
const TARGET_BUILDING_QUERY_PADDING = 46;
const LOCATION_INITIAL_ZOOM = 17.25;
const LOCATION_FOCUS_ZOOM = 17.85;
const LOCATION_MIN_ZOOM = 16.8;
const LOCATION_MAX_ZOOM = 20.5;
const LOCATION_PITCH = 66;
const LOCATION_BEARING = -24;
const LOCATION_MAX_BOUNDS_RADIUS_METERS = 650;
const EMPTY_FEATURE_COLLECTION = { type: "FeatureCollection", features: [] };
const LOCATION_BASEMAP_CONFIG = {
  theme: "monochrome",
  lightPreset: "night",
  show3dObjects: true,
  show3dBuildings: true,
  show3dFacades: true,
  show3dTrees: true,
  show3dLandmarks: true,
  showIndoor: true,
  showLandmarkIcons: true,
  showLandmarkIconLabels: true,
  showPointOfInterestLabels: true,
  showRoadLabels: true,
  showPlaceLabels: true,
  showTransitLabels: false,
  showPedestrianRoads: true,
  colorBuildings: "hsl(218, 16%, 34%)",
  colorBuildingHighlight: "rgba(8, 126, 255, 1)",
  colorGreenspace: "hsl(145, 34%, 27%)",
  colorWater: "hsl(204, 55%, 23%)",
  colorRoads: "hsl(214, 15%, 34%)",
  colorLand: "hsl(220, 16%, 12%)",
};

function normalizeCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat > 40 && lat < 60 && lng > -10 && lng < 15) return { lat, lng };
  if (lng > 40 && lng < 60 && lat > -10 && lat < 15) return { lat: lng, lng: lat };

  return { lat, lng };
}

async function geocodeAddressWithPdok(address) {
  const { data } = await base44.functions.invoke("searchAddress", { query: address });
  const suggestion = data?.suggestions?.find((item) => item.latitude && item.longitude);

  if (!suggestion) return null;
  return normalizeCoordinates(suggestion.latitude, suggestion.longitude);
}

function targetPointFeature(coords) {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: [coords.lng, coords.lat] },
  };
}

function featureCollection(features) {
  return { type: "FeatureCollection", features };
}

function safeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getLocationMaxBounds(coords) {
  const latRadians = (coords.lat * Math.PI) / 180;
  const latDelta = LOCATION_MAX_BOUNDS_RADIUS_METERS / 111_320;
  const lngDelta = LOCATION_MAX_BOUNDS_RADIUS_METERS / (111_320 * Math.max(Math.cos(latRadians), 0.2));

  return [
    [coords.lng - lngDelta, coords.lat - latDelta],
    [coords.lng + lngDelta, coords.lat + latDelta],
  ];
}

function lockMapInteractions(map) {
  map.dragPan.disable();
  map.dragRotate.disable();
  map.boxZoom.disable();
  map.keyboard.disable();
  map.touchPitch?.disable();
  map.touchZoomRotate.enable();
  map.touchZoomRotate.disableRotation();
  map.scrollZoom.enable();
  map.doubleClickZoom.enable();
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInPolygon(point, polygon) {
  if (!polygon?.length || !pointInRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(point, hole));
}

function geometryContainsPoint(geometry, point) {
  if (geometry?.type === "Polygon") return pointInPolygon(point, geometry.coordinates);
  if (geometry?.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  }
  return false;
}

function createTargetBuildingFeature(feature) {
  const props = feature.properties || {};
  const height = Math.max(
    safeNumber(props.height ?? props.est_height ?? props.render_height, 10),
    8
  );
  const minHeight = Math.max(safeNumber(props.min_height, 0), 0);

  return {
    type: "Feature",
    properties: { height, min_height: minHeight },
    geometry: feature.geometry,
  };
}

function getRenderedTargetBuildingFeature(map, coords) {
  const queryLayers = BUILDING_QUERY_LAYERS.filter((layerId) => map.getLayer(layerId));
  if (!queryLayers.length) return null;

  const point = map.project([coords.lng, coords.lat]);
  const features = map.queryRenderedFeatures(
    [
      [point.x - TARGET_BUILDING_QUERY_PADDING, point.y - TARGET_BUILDING_QUERY_PADDING],
      [point.x + TARGET_BUILDING_QUERY_PADDING, point.y + TARGET_BUILDING_QUERY_PADDING],
    ],
    { layers: queryLayers }
  );
  const polygonFeatures = features.filter((feature) =>
    ["Polygon", "MultiPolygon"].includes(feature.geometry?.type)
  );
  const targetPoint = [coords.lng, coords.lat];
  const matchingFeature =
    polygonFeatures.find((feature) => geometryContainsPoint(feature.geometry, targetPoint)) ||
    polygonFeatures[0];

  return matchingFeature ? createTargetBuildingFeature(matchingFeature) : null;
}

function applyStandardMapConfig(map) {
  if (typeof map.setConfigProperty !== "function") return;

  Object.entries(LOCATION_BASEMAP_CONFIG).forEach(([key, value]) => {
    try {
      map.setConfigProperty("basemap", key, value);
    } catch {
      // Some Mapbox style revisions may not expose every Standard config key.
    }
  });
}

function addLayerBeforeLabels(map, layer, labelLayerId) {
  if (map.getLayer(layer.id)) return;
  if (labelLayerId && map.getLayer(labelLayerId)) map.addLayer(layer, labelLayerId);
  else map.addLayer(layer);
}

function addLocationDetailLayers(map, coords, labelLayerId) {
  if (!map.getSource(TARGET_BUILDING_SOURCE_ID)) {
    map.addSource(TARGET_BUILDING_SOURCE_ID, {
      type: "geojson",
      data: EMPTY_FEATURE_COLLECTION,
    });
  }

  if (!map.getSource(TARGET_POINT_SOURCE_ID)) {
    map.addSource(TARGET_POINT_SOURCE_ID, {
      type: "geojson",
      data: featureCollection([targetPointFeature(coords)]),
    });
  }

  addLayerBeforeLabels(
    map,
    {
      id: TARGET_BUILDING_LAYER_ID,
      source: TARGET_BUILDING_SOURCE_ID,
      type: "fill-extrusion",
      minzoom: 15,
      paint: {
        "fill-extrusion-color": "#087eff",
        "fill-extrusion-height": ["coalesce", ["get", "height"], 10],
        "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
        "fill-extrusion-opacity": 0.96,
        "fill-extrusion-emissive-strength": 0.85,
        "fill-extrusion-vertical-gradient": false,
      },
    },
    labelLayerId
  );

  addLayerBeforeLabels(
    map,
    {
      id: "location-target-ground-glow",
      source: TARGET_POINT_SOURCE_ID,
      type: "circle",
      paint: {
        "circle-color": "#087eff",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 16, 18, 36],
        "circle-blur": 0.35,
        "circle-opacity": 0.22,
        "circle-pitch-alignment": "map",
      },
    },
    labelLayerId
  );

  addLayerBeforeLabels(
    map,
    {
      id: "location-target-ground-core",
      source: TARGET_POINT_SOURCE_ID,
      type: "circle",
      paint: {
        "circle-color": "#60a5fa",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 4, 18, 9],
        "circle-stroke-color": "#dbeafe",
        "circle-stroke-width": 2,
        "circle-opacity": 0.95,
        "circle-pitch-alignment": "map",
      },
    },
    labelLayerId
  );
}

function createLocationMarkerElement() {
  const marker = document.createElement("div");
  marker.style.width = "28px";
  marker.style.height = "40px";
  marker.style.position = "relative";
  marker.style.filter = "drop-shadow(0 12px 18px rgba(0, 0, 0, 0.45))";

  const pin = document.createElement("div");
  pin.style.width = "28px";
  pin.style.height = "28px";
  pin.style.borderRadius = "50% 50% 50% 0";
  pin.style.background = "linear-gradient(135deg, #60a5fa 0%, #087eff 70%)";
  pin.style.border = "2px solid rgba(219, 234, 254, 0.95)";
  pin.style.transform = "rotate(-45deg)";
  pin.style.boxShadow = "0 0 0 6px rgba(8, 126, 255, 0.18)";

  const dot = document.createElement("div");
  dot.style.position = "absolute";
  dot.style.left = "8px";
  dot.style.top = "8px";
  dot.style.width = "8px";
  dot.style.height = "8px";
  dot.style.borderRadius = "999px";
  dot.style.background = "#eff6ff";
  dot.style.boxShadow = "0 0 14px rgba(255, 255, 255, 0.9)";

  pin.appendChild(dot);
  marker.appendChild(pin);
  return marker;
}

export default function LocationMapDialog({ open, onOpenChange, location }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [coords, setCoords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [geoError, setGeoError] = useState(false);

  const address = [
    location?.street_name,
    location?.house_number,
    location?.postal_code,
    location?.city,
  ].filter(Boolean).join(" ");

  // Resolve coords when dialog opens
  useEffect(() => {
    if (!open || !location) return;

    let cancelled = false;
    setGeoError(false);
    setLoading(false);

    const directLat = location.latitude;
    const directLng = location.longitude;
    const directCoords = normalizeCoordinates(directLat, directLng);

    if (directCoords) {
      setCoords(directCoords);
      return;
    }

    if (!address) {
      setCoords(null);
      setGeoError(true);
      return;
    }

    setLoading(true);
    setCoords(null);
    geocodeAddressWithPdok(address)
      .then((result) => {
        if (cancelled) return;
        if (result) setCoords(result);
        else setGeoError(true);
      })
      .catch(() => {
        if (!cancelled) setGeoError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, location?.id, location?.latitude, location?.longitude, address]);

  // Init map once coords are known and container exists
  useEffect(() => {
    if (!open || !coords) return;

    let map = null;
    let marker = null;
    let cancelled = false;
    let targetBuildingResolved = false;
    let targetBuildingAttempts = 0;

    const tryInit = () => {
      if (cancelled || !mapContainerRef.current) return;

      // Dynamically import mapbox to avoid SSR issues
      import("mapbox-gl").then((mapboxglModule) => {
        if (cancelled || !mapContainerRef.current) return;
        const mapboxgl = mapboxglModule.default;

        mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN;

        map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: "mapbox://styles/mapbox/standard",
          config: { basemap: LOCATION_BASEMAP_CONFIG },
          center: [coords.lng, coords.lat],
          zoom: LOCATION_INITIAL_ZOOM,
          minZoom: LOCATION_MIN_ZOOM,
          maxZoom: LOCATION_MAX_ZOOM,
          maxBounds: getLocationMaxBounds(coords),
          pitch: LOCATION_PITCH,
          bearing: LOCATION_BEARING,
          pitchWithRotate: false,
          renderWorldCopies: false,
          prefetchZoomDelta: 0,
          antialias: true,
        });

        mapRef.current = map;
        lockMapInteractions(map);

        const syncTargetBuilding = () => {
          if (cancelled || targetBuildingResolved || targetBuildingAttempts >= 8) return;
          targetBuildingAttempts += 1;

          const buildingSource = map.getSource(TARGET_BUILDING_SOURCE_ID);
          if (!buildingSource) return;

          const targetBuilding = getRenderedTargetBuildingFeature(map, coords);
          if (!targetBuilding) return;

          buildingSource.setData(featureCollection([targetBuilding]));
          targetBuildingResolved = true;
        };

        map.on("load", () => {
          if (cancelled) return;
          map.resize();
          applyStandardMapConfig(map);

          map.setFog({
            color: "rgb(12, 18, 30)",
            "high-color": "rgb(46, 78, 118)",
            "horizon-blend": 0.16,
            "space-color": "rgb(3, 7, 16)",
            "star-intensity": 0.16,
          });

          if (!map.getSource("mapbox-dem")) {
            map.addSource("mapbox-dem", {
              type: "raster-dem",
              url: "mapbox://mapbox.mapbox-terrain-dem-v1",
              tileSize: 512,
              maxzoom: 14,
            });
          }
          map.setTerrain({ source: "mapbox-dem", exaggeration: 1.15 });

          const layers = map.getStyle().layers;
          const labelLayerId = layers.find(
            (l) => l.type === "symbol" && l.layout?.["text-field"]
          )?.id;

          addLocationDetailLayers(map, coords, labelLayerId);

          marker = new mapboxgl.Marker({
            element: createLocationMarkerElement(),
            anchor: "bottom",
          })
            .setLngLat([coords.lng, coords.lat])
            .addTo(map);

          map.addControl(
            new mapboxgl.NavigationControl({ showCompass: false, showZoom: true }),
            "bottom-right"
          );

          map.easeTo({
            center: [coords.lng, coords.lat],
            zoom: LOCATION_FOCUS_ZOOM,
            pitch: LOCATION_PITCH,
            bearing: LOCATION_BEARING,
            duration: 900,
          });

          syncTargetBuilding();
        });

        map.on("idle", syncTargetBuilding);
        requestAnimationFrame(() => map.resize());
      });
    };

    // Give dialog time to fully render before init
    const timer = setTimeout(tryInit, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (marker) {
        marker.remove();
        marker = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [open, coords]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="w-4 h-4 text-primary" />
            {address || "Vestiging"}
          </DialogTitle>
        </DialogHeader>

        <div className="relative" style={{ width: "100%", height: 420 }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
          {geoError && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <MapPin className="w-8 h-8 opacity-40" />
              <p className="text-sm">Adres kon niet op de kaart worden gevonden.</p>
            </div>
          )}
          {/* Always render container when coords available so ref is ready */}
          {coords && !geoError && (
            <div
              ref={mapContainerRef}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
