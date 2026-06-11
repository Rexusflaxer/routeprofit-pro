import React, { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MAPBOX_PUBLIC_TOKEN } from "@/components/navigation/mapboxConfig";
import { Loader2 } from "lucide-react";

export default function TeamhubRegionsDisplay({ selectedRegions = [] }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [boundariesReady, setBoundariesReady] = useState(false);
  const [boundaryError, setBoundaryError] = useState(false);

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
        center: [5.2913, 52.1326],
        zoom: 6.45,
        minZoom: 5.2,
        maxZoom: 6.45,
        interactive: false,
      });

      map.on("load", async () => {
        if (cancelled) return;
        setMapReady(true);

        try {
          const response = await fetch("https://cartomap.github.io/nl/wgs84/gemeente_2026.geojson");
          if (!response.ok) throw new Error(`Gemeentegrenzen laden mislukt (${response.status})`);
          const geojsonData = await response.json();
          if (cancelled || !map) return;

          // Filter to only show selected regions
          const selectedCodes = new Set(
            selectedRegions
              .map((r) => r.region_code || r.id?.replace("municipality:", ""))
              .filter(Boolean)
          );

          const selectedFeatures = geojsonData.features.filter((f) => {
            const code = f.properties?.statcode || f.properties?.jrstatcode || f.properties?.id;
            return selectedCodes.has(code);
          });

          map.addSource("selected-regions-source", {
            type: "geojson",
            data: { type: "FeatureCollection", features: selectedFeatures },
          });

          map.addLayer({
            id: "selected-regions-fill",
            type: "fill",
            source: "selected-regions-source",
            paint: {
              "fill-color": "#1f7aff",
              "fill-opacity": 0.36,
            },
          });

          map.addLayer({
            id: "selected-regions-line",
            type: "line",
            source: "selected-regions-source",
            paint: {
              "line-color": "#0f5fd7",
              "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.6, 8, 2.4, 10, 3],
            },
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
      if (map) map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground mb-3">
        Werkgebied ({selectedRegions.length})
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Map */}
        <div className="relative h-[360px] overflow-hidden rounded-md border border-border bg-muted">
          <div ref={mapContainerRef} className="h-full w-full" />
          {(!mapReady || !boundariesReady) && !boundaryError && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Kaart laden
            </div>
          )}
          {boundaryError && (
            <div className="absolute inset-x-4 top-4 rounded-md border border-destructive/30 bg-background/95 px-3 py-2 text-sm text-destructive shadow-sm">
              Kaart kon niet worden geladen.
            </div>
          )}
        </div>

        {/* List */}
        <div className="rounded-md border border-border bg-background">
          <div className="border-b border-border bg-muted/30 px-3 py-2">
            <p className="text-xs font-semibold text-muted-foreground">Geselecteerde regio's</p>
          </div>
          <div className="max-h-[320px] space-y-2 overflow-y-auto p-3">
            {selectedRegions.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen regio's geselecteerd</p>
            ) : (
              selectedRegions.map((region) => (
                <div key={region.id} className="flex items-center gap-2 text-xs">
                  <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                  <span className="truncate text-foreground font-medium">{region.label || region.city}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}