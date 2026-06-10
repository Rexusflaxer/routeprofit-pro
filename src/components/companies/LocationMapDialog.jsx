import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2, Map, Satellite } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { MAPBOX_PUBLIC_TOKEN } from "@/components/navigation/mapboxConfig";
import "mapbox-gl/dist/mapbox-gl.css";

const TARGET_POINT_SOURCE_ID = "location-target-point";
const LOCATION_INITIAL_ZOOM = 16.4;
const LOCATION_FOCUS_ZOOM = 17.1;
const LOCATION_MIN_ZOOM = 15.9;
const LOCATION_MAX_ZOOM = 20.5;
const LOCATION_MAX_BOUNDS_RADIUS_METERS = 650;
const MAP_STYLES = {
  map: "mapbox://styles/mapbox/dark-v11",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
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

function addLayerBeforeLabels(map, layer, labelLayerId) {
  if (map.getLayer(layer.id)) return;
  if (labelLayerId && map.getLayer(labelLayerId)) map.addLayer(layer, labelLayerId);
  else map.addLayer(layer);
}

function addLocationDetailLayers(map, coords, labelLayerId) {
  if (!map.getSource(TARGET_POINT_SOURCE_ID)) {
    map.addSource(TARGET_POINT_SOURCE_ID, {
      type: "geojson",
      data: featureCollection([targetPointFeature(coords)]),
    });
  }

  addLayerBeforeLabels(
    map,
    {
      id: "location-target-ground-glow",
      source: TARGET_POINT_SOURCE_ID,
      type: "circle",
      paint: {
        "circle-color": "#087eff",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 18, 19, 44],
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
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 5, 19, 11],
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

function getMapStyle(mode) {
  return MAP_STYLES[mode] || MAP_STYLES.map;
}

function syncLocationOverlay(map, coords) {
  if (!map.isStyleLoaded()) return;

  const layers = map.getStyle().layers || [];
  const labelLayerId = layers.find((layer) => layer.type === "symbol" && layer.layout?.["text-field"])?.id;
  addLocationDetailLayers(map, coords, labelLayerId);
}

export default function LocationMapDialog({ open, onOpenChange, location }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [coords, setCoords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [geoError, setGeoError] = useState(false);
  const [mapMode, setMapMode] = useState("map");

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

    const tryInit = () => {
      if (cancelled || !mapContainerRef.current) return;

      // Dynamically import mapbox to avoid SSR issues
      import("mapbox-gl").then((mapboxglModule) => {
        if (cancelled || !mapContainerRef.current) return;
        const mapboxgl = mapboxglModule.default;

        mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN;

        map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: getMapStyle(mapMode),
          center: [coords.lng, coords.lat],
          zoom: LOCATION_INITIAL_ZOOM,
          minZoom: LOCATION_MIN_ZOOM,
          maxZoom: LOCATION_MAX_ZOOM,
          maxBounds: getLocationMaxBounds(coords),
          pitch: 0,
          bearing: 0,
          pitchWithRotate: false,
          renderWorldCopies: false,
          prefetchZoomDelta: 0,
          antialias: false,
        });

        mapRef.current = map;
        lockMapInteractions(map);

        map.on("load", () => {
          if (cancelled) return;
          map.resize();
          syncLocationOverlay(map, coords);

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
            pitch: 0,
            bearing: 0,
            duration: 900,
          });
        });

        map.on("style.load", () => {
          if (!cancelled) syncLocationOverlay(map, coords);
        });
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return;

    map.setStyle(getMapStyle(mapMode));
    map.jumpTo({ center: [coords.lng, coords.lat], pitch: 0, bearing: 0 });
  }, [mapMode, coords]);

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
            <>
              <div
                ref={mapContainerRef}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              />
              <div className="absolute right-3 top-3 z-10 flex rounded-md border border-border bg-background/90 p-0.5 shadow-sm backdrop-blur">
                <Button
                  type="button"
                  size="sm"
                  variant={mapMode === "map" ? "secondary" : "ghost"}
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={() => setMapMode("map")}
                  title="Kaart"
                >
                  <Map className="h-3.5 w-3.5" />
                  Kaart
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mapMode === "satellite" ? "secondary" : "ghost"}
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={() => setMapMode("satellite")}
                  title="Satelliet"
                >
                  <Satellite className="h-3.5 w-3.5" />
                  Satelliet
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
