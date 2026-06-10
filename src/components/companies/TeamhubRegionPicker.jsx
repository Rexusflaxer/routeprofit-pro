import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { MAPBOX_PUBLIC_TOKEN } from "@/components/navigation/mapboxConfig";
import { Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import "mapbox-gl/dist/mapbox-gl.css";

const REGION_SOURCE_ID = "teamhub-regions";
const REGION_FILL_LAYER_ID = "teamhub-regions-fill";
const REGION_LINE_LAYER_ID = "teamhub-regions-line";
const NETHERLANDS_CENTER = [5.2913, 52.1326];
const DEFAULT_RADIUS_KM = 25;

function normalizeCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat > 40 && lat < 60 && lng > -10 && lng < 15) return { lat, lng };
  if (lng > 40 && lng < 60 && lat > -10 && lat < 15) return { lat: lng, lng: lat };

  return { lat, lng };
}

function createCirclePolygon(longitude, latitude, radiusKm, steps = 72) {
  const coords = [];
  const earthRadiusKm = 6371;
  const latRad = latitude * Math.PI / 180;
  const lonRad = longitude * Math.PI / 180;
  const distance = Math.max(Number(radiusKm) || DEFAULT_RADIUS_KM, 1) / earthRadiusKm;

  for (let i = 0; i <= steps; i += 1) {
    const bearing = (i / steps) * 2 * Math.PI;
    const pointLat = Math.asin(
      Math.sin(latRad) * Math.cos(distance)
      + Math.cos(latRad) * Math.sin(distance) * Math.cos(bearing)
    );
    const pointLon = lonRad + Math.atan2(
      Math.sin(bearing) * Math.sin(distance) * Math.cos(latRad),
      Math.cos(distance) - Math.sin(latRad) * Math.sin(pointLat)
    );
    coords.push([pointLon * 180 / Math.PI, pointLat * 180 / Math.PI]);
  }

  return coords;
}

function regionFeature(region) {
  const coords = normalizeCoordinates(region.latitude, region.longitude);
  if (!coords) return null;

  return {
    type: "Feature",
    properties: {
      id: region.id,
      label: region.label || region.city || "Regio",
    },
    geometry: {
      type: "Polygon",
      coordinates: [createCirclePolygon(coords.lng, coords.lat, region.radius_km || DEFAULT_RADIUS_KM)],
    },
  };
}

function featureCollection(features) {
  return { type: "FeatureCollection", features };
}

function createMarkerElement(label) {
  const marker = document.createElement("div");
  marker.className = "teamhub-region-marker";
  marker.style.width = "28px";
  marker.style.height = "28px";
  marker.style.borderRadius = "999px";
  marker.style.background = "#1f7aff";
  marker.style.border = "2px solid #dbeafe";
  marker.style.boxShadow = "0 10px 24px rgba(0, 0, 0, 0.35), 0 0 0 8px rgba(31, 122, 255, 0.18)";
  marker.style.display = "flex";
  marker.style.alignItems = "center";
  marker.style.justifyContent = "center";
  marker.title = label || "Teamhub-regio";

  const dot = document.createElement("div");
  dot.style.width = "8px";
  dot.style.height = "8px";
  dot.style.borderRadius = "999px";
  dot.style.background = "#eff6ff";
  marker.appendChild(dot);

  return marker;
}

function getSuggestionLabel(suggestion) {
  return suggestion.city || suggestion.municipality || suggestion.address || "Nieuwe regio";
}

export default function TeamhubRegionPicker({ value = [], onChange }) {
  const regions = Array.isArray(value) ? value : [];
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const searchTimeout = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let map = null;

    import("mapbox-gl").then((mapboxglModule) => {
      if (cancelled || !mapContainerRef.current) return;

      const mapboxgl = mapboxglModule.default;
      mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN;
      map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: NETHERLANDS_CENTER,
        zoom: 6.4,
        minZoom: 5,
      });

      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        if (!cancelled) setMapReady(true);
      });

      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      setMapReady(false);
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      if (map) map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.isStyleLoaded()) return;

    const features = regions.map(regionFeature).filter(Boolean);
    const data = featureCollection(features);

    if (map.getSource(REGION_SOURCE_ID)) {
      map.getSource(REGION_SOURCE_ID).setData(data);
    } else {
      map.addSource(REGION_SOURCE_ID, { type: "geojson", data });
      map.addLayer({
        id: REGION_FILL_LAYER_ID,
        type: "fill",
        source: REGION_SOURCE_ID,
        paint: {
          "fill-color": "#1f7aff",
          "fill-opacity": 0.2,
        },
      });
      map.addLayer({
        id: REGION_LINE_LAYER_ID,
        type: "line",
        source: REGION_SOURCE_ID,
        paint: {
          "line-color": "#60a5fa",
          "line-width": 2,
          "line-opacity": 0.9,
        },
      });
    }

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    import("mapbox-gl").then((mapboxglModule) => {
      const mapboxgl = mapboxglModule.default;
      regions.forEach((region) => {
        const coords = normalizeCoordinates(region.latitude, region.longitude);
        if (!coords) return;
        const marker = new mapboxgl.Marker({ element: createMarkerElement(region.label) })
          .setLngLat([coords.lng, coords.lat])
          .addTo(map);
        markersRef.current.push(marker);
      });
    });
  }, [regions, mapReady]);

  const search = (nextQuery) => {
    setQuery(nextQuery);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (nextQuery.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await base44.functions.invoke("searchAddress", { query: nextQuery });
        setSuggestions((data?.suggestions || []).filter(item => item.latitude && item.longitude).slice(0, 8));
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const addRegion = (suggestion) => {
    const coords = normalizeCoordinates(suggestion.latitude, suggestion.longitude);
    if (!coords) return;

    const label = getSuggestionLabel(suggestion);
    const nextRegion = {
      id: `teamhub-region-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label,
      selection_type: "city_radius",
      city: suggestion.city || label,
      province: suggestion.province || null,
      country: suggestion.country || "Nederland",
      latitude: coords.lat,
      longitude: coords.lng,
      radius_km: DEFAULT_RADIUS_KM,
      geojson: null,
    };

    const next = [...regions, nextRegion];
    onChange(next);
    setQuery("");
    setSuggestions([]);

    const map = mapRef.current;
    if (map) {
      map.flyTo({ center: [coords.lng, coords.lat], zoom: 8.5, essential: true });
    }
  };

  const updateRegion = (id, patch) => {
    onChange(regions.map(region => region.id === id ? { ...region, ...patch } : region));
  };

  const removeRegion = (id) => {
    onChange(regions.filter(region => region.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Label>Regio zoeken</Label>
        <div className="mt-1 flex gap-2">
          <div className="relative flex-1">
            <Input
              value={query}
              onChange={e => search(e.target.value)}
              placeholder="Zoek op plaats, gemeente of adres"
              autoComplete="off"
            />
            {loading && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>
        {suggestions.length > 0 && (
          <div className="absolute z-[80] mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.address}-${index}`}
                type="button"
                onClick={() => addRegion(suggestion)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{getSuggestionLabel(suggestion)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{suggestion.address}</span>
                </span>
                <Plus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative h-[340px] overflow-hidden rounded-md border border-border bg-muted">
          <div ref={mapContainerRef} className="h-full w-full" />
          {!mapReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Kaart laden
            </div>
          )}
        </div>

        <div className="rounded-md border border-border">
          <div className="border-b border-border bg-muted/30 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Geselecteerde regio's</p>
          </div>
          <div className="max-h-[292px] space-y-3 overflow-y-auto p-3">
            {regions.length === 0 && (
              <p className="text-sm text-muted-foreground">Nog geen regio's geselecteerd.</p>
            )}
            {regions.map(region => (
              <div key={region.id} className="space-y-2 rounded-md border border-border bg-background p-3">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <Input
                      value={region.label || ""}
                      onChange={e => updateRegion(region.id, { label: e.target.value })}
                      className="h-8 text-sm font-medium"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Radius {region.radius_km || DEFAULT_RADIUS_KM} km</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => removeRegion(region.id)}
                    title="Regio verwijderen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Slider
                  value={[Number(region.radius_km) || DEFAULT_RADIUS_KM]}
                  min={5}
                  max={100}
                  step={5}
                  onValueChange={([radius]) => updateRegion(region.id, { radius_km: radius })}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
