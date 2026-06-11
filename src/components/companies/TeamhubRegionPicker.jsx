import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAPBOX_PUBLIC_TOKEN } from "@/components/navigation/mapboxConfig";
import { Loader2, MapPin, MousePointer2, Trash2 } from "lucide-react";
import "mapbox-gl/dist/mapbox-gl.css";

const MUNICIPALITY_SOURCE_ID = "teamhub-municipalities";
const SELECTED_SOURCE_ID = "teamhub-selected-regions";
const MUNICIPALITY_FILL_LAYER_ID = "teamhub-municipalities-fill";
const MUNICIPALITY_LINE_LAYER_ID = "teamhub-municipalities-line";
const MUNICIPALITY_HOVER_LAYER_ID = "teamhub-municipalities-hover";
const SELECTED_FILL_LAYER_ID = "teamhub-selected-regions-fill";
const SELECTED_LINE_LAYER_ID = "teamhub-selected-regions-line";
const NETHERLANDS_CENTER = [5.2913, 52.1326];
const MUNICIPALITY_GEOJSON_URL = "https://cartomap.github.io/nl/wgs84/gemeente_2026.geojson";

function normalizeCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat > 40 && lat < 60 && lng > -10 && lng < 15) return { lat, lng };
  if (lng > 40 && lng < 60 && lat > -10 && lat < 15) return { lat: lng, lng: lat };

  return { lat, lng };
}

function featureCollection(features = []) {
  return { type: "FeatureCollection", features };
}

function getRegionCode(feature) {
  return feature?.properties?.statcode || feature?.properties?.jrstatcode || feature?.properties?.id;
}

function getRegionLabel(feature) {
  return feature?.properties?.statnaam || feature?.properties?.name || "Gemeente";
}

function walkCoordinates(coords, visitor) {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    visitor(coords[0], coords[1]);
    return;
  }
  coords.forEach(item => walkCoordinates(item, visitor));
}

function geometryCenter(geometry) {
  const bounds = {
    minLng: Infinity,
    minLat: Infinity,
    maxLng: -Infinity,
    maxLat: -Infinity,
  };

  walkCoordinates(geometry?.coordinates, (lng, lat) => {
    bounds.minLng = Math.min(bounds.minLng, lng);
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLng = Math.max(bounds.maxLng, lng);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
  });

  if (!Number.isFinite(bounds.minLng) || !Number.isFinite(bounds.minLat)) return null;
  return {
    lng: (bounds.minLng + bounds.maxLng) / 2,
    lat: (bounds.minLat + bounds.maxLat) / 2,
  };
}

function storedRegionFeature(region) {
  if (!region?.geojson) return null;

  return {
    type: "Feature",
    properties: {
      id: region.id,
      region_code: region.region_code || region.id,
      label: region.label || region.city || "Regio",
    },
    geometry: region.geojson,
  };
}

function buildStoredRegion(feature) {
  const regionCode = getRegionCode(feature);
  const label = getRegionLabel(feature);
  const center = geometryCenter(feature.geometry);

  return {
    id: `municipality:${regionCode || label}`,
    region_code: regionCode || null,
    label,
    selection_type: "municipality",
    city: label,
    province: null,
    country: "Nederland",
    latitude: center?.lat || null,
    longitude: center?.lng || null,
    geojson: feature.geometry,
  };
}

function selectedFeatures(regions) {
  return featureCollection((regions || []).map(storedRegionFeature).filter(Boolean));
}

function getSuggestionLabel(suggestion) {
  return suggestion.city || suggestion.municipality || suggestion.address || "Locatie";
}

export default function TeamhubRegionPicker({ value = [], onChange }) {
  const regions = Array.isArray(value) ? value : [];
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const featuresByCodeRef = useRef(new Map());
  const searchTimeout = useRef(null);
  const regionsRef = useRef(regions);
  const onChangeRef = useRef(onChange);
  const [mapReady, setMapReady] = useState(false);
  const [boundariesReady, setBoundariesReady] = useState(false);
  const [boundaryError, setBoundaryError] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  useEffect(() => {
    regionsRef.current = regions;
  }, [regions]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    let map = null;

    import("mapbox-gl").then((mapboxglModule) => {
      if (cancelled || !mapContainerRef.current) return;

      const mapboxgl = mapboxglModule.default;
      mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN;
      map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/light-v11",
        center: NETHERLANDS_CENTER,
        zoom: 6.45,
        minZoom: 5.2,
      });

      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
      map.on("load", async () => {
        if (cancelled) return;
        setMapReady(true);

        try {
          const response = await fetch(MUNICIPALITY_GEOJSON_URL);
          if (!response.ok) throw new Error(`Gemeentegrenzen laden mislukt (${response.status})`);
          const data = await response.json();
          if (cancelled || !map) return;

          featuresByCodeRef.current = new Map(
            (data.features || []).map(feature => [getRegionCode(feature), feature]).filter(([code]) => code)
          );

          map.addSource(MUNICIPALITY_SOURCE_ID, { type: "geojson", data });
          map.addSource(SELECTED_SOURCE_ID, { type: "geojson", data: selectedFeatures(regionsRef.current) });

          map.addLayer({
            id: MUNICIPALITY_FILL_LAYER_ID,
            type: "fill",
            source: MUNICIPALITY_SOURCE_ID,
            paint: {
              "fill-color": "#f8fafc",
              "fill-opacity": 0.08,
            },
          });

          map.addLayer({
            id: MUNICIPALITY_HOVER_LAYER_ID,
            type: "fill",
            source: MUNICIPALITY_SOURCE_ID,
            paint: {
              "fill-color": "#1f7aff",
              "fill-opacity": 0.2,
            },
            filter: ["==", ["get", "statcode"], ""],
          });

          map.addLayer({
            id: SELECTED_FILL_LAYER_ID,
            type: "fill",
            source: SELECTED_SOURCE_ID,
            paint: {
              "fill-color": "#1f7aff",
              "fill-opacity": 0.36,
            },
          });

          map.addLayer({
            id: MUNICIPALITY_LINE_LAYER_ID,
            type: "line",
            source: MUNICIPALITY_SOURCE_ID,
            paint: {
              "line-color": "#111827",
              "line-opacity": 0.8,
              "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 8, 1.4, 10, 2],
            },
          });

          map.addLayer({
            id: SELECTED_LINE_LAYER_ID,
            type: "line",
            source: SELECTED_SOURCE_ID,
            paint: {
              "line-color": "#0f5fd7",
              "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.6, 8, 2.4, 10, 3],
            },
          });

          map.on("mousemove", MUNICIPALITY_FILL_LAYER_ID, (event) => {
            map.getCanvas().style.cursor = "pointer";
            const feature = event.features?.[0];
            map.setFilter(MUNICIPALITY_HOVER_LAYER_ID, ["==", ["get", "statcode"], getRegionCode(feature) || ""]);
          });

          map.on("mouseleave", MUNICIPALITY_FILL_LAYER_ID, () => {
            map.getCanvas().style.cursor = "";
            map.setFilter(MUNICIPALITY_HOVER_LAYER_ID, ["==", ["get", "statcode"], ""]);
          });

          map.on("click", MUNICIPALITY_FILL_LAYER_ID, (event) => {
            const feature = event.features?.[0];
            const regionCode = getRegionCode(feature);
            if (!feature || !regionCode) return;

            const current = regionsRef.current || [];
            const exists = current.some(region => region.region_code === regionCode || region.id === `municipality:${regionCode}`);
            const sourceFeature = featuresByCodeRef.current.get(regionCode) || feature;
            const next = exists
              ? current.filter(region => region.region_code !== regionCode && region.id !== `municipality:${regionCode}`)
              : [...current, buildStoredRegion(sourceFeature)];

            onChangeRef.current(next);
          });

          setBoundariesReady(true);
        } catch {
          if (!cancelled) setBoundaryError(true);
        }
      });

      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      setMapReady(false);
      setBoundariesReady(false);
      featuresByCodeRef.current = new Map();
      if (map) map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getSource(SELECTED_SOURCE_ID)) return;
    map.getSource(SELECTED_SOURCE_ID).setData(selectedFeatures(regions));
  }, [regions, mapReady]);

  const search = (nextQuery) => {
    setQuery(nextQuery);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (nextQuery.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const { data } = await base44.functions.invoke("searchAddress", { query: nextQuery });
        setSuggestions((data?.suggestions || []).filter(item => item.latitude && item.longitude).slice(0, 8));
      } finally {
        setLoadingSearch(false);
      }
    }, 300);
  };

  const flyToSuggestion = (suggestion) => {
    const coords = normalizeCoordinates(suggestion.latitude, suggestion.longitude);
    if (!coords) return;

    setQuery("");
    setSuggestions([]);
    mapRef.current?.flyTo({ center: [coords.lng, coords.lat], zoom: 9.3, essential: true });
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
              placeholder="Zoek plaats of adres om naar de kaart te zoomen"
              autoComplete="off"
            />
            {loadingSearch && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>
        {suggestions.length > 0 && (
          <div className="absolute z-[80] mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.address}-${index}`}
                type="button"
                onClick={() => flyToSuggestion(suggestion)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{getSuggestionLabel(suggestion)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{suggestion.address}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative h-[480px] overflow-hidden rounded-md border border-border bg-muted">
          <div ref={mapContainerRef} className="h-full w-full" />
          {(!mapReady || !boundariesReady) && !boundaryError && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Gemeentegrenzen laden
            </div>
          )}
          {boundaryError && (
            <div className="absolute inset-x-4 top-4 rounded-md border border-destructive/30 bg-background/95 px-3 py-2 text-sm text-destructive shadow-sm">
              Gemeentegrenzen konden niet worden geladen.
            </div>
          )}
          {boundariesReady && (
            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-md border border-border bg-background/90 px-3 py-2 text-xs text-foreground shadow-sm">
              <MousePointer2 className="h-3.5 w-3.5 text-primary" />
              Klik op een gemeente om de hele regio te selecteren
            </div>
          )}
        </div>

        <div className="rounded-md border border-border">
          <div className="border-b border-border bg-muted/30 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Geselecteerde regio's</p>
          </div>
          <div className="max-h-[432px] space-y-2 overflow-y-auto p-3">
            {regions.length === 0 && (
              <p className="text-sm text-muted-foreground">Klik op de kaart om regio's te selecteren.</p>
            )}
            {regions.map(region => (
              <div key={region.id} className="flex items-center gap-2 rounded-md border border-border bg-background p-3">
                <MapPin className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{region.label || region.city || "Regio"}</p>
                  <p className="text-xs text-muted-foreground">Gemeentegebied</p>
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
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
