import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin, Loader2 } from "lucide-react";

const MAPBOX_TOKEN = "pk.eyJ1IjoibG9xYXBwIiwiYSI6ImNtYjRlODB3NjBiMHkya3B3YmdkbHlvcmgifQ.dHDNHKWtfRq1nVT1u3xAXg";

async function geocodeAddress(address) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?country=NL&limit=1&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature) return null;
  const [lng, lat] = feature.center;
  return { lng, lat };
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
    setGeoError(false);

    const directLat = location.latitude;
    const directLng = location.longitude;

    if (directLat && directLng) {
      setCoords({ lat: directLat, lng: directLng });
      return;
    }

    if (!address) { setGeoError(true); return; }

    setLoading(true);
    setCoords(null);
    geocodeAddress(address).then((result) => {
      setLoading(false);
      if (result) setCoords(result);
      else setGeoError(true);
    });
  }, [open, location?.id]);

  // Init map once coords are known and container exists
  useEffect(() => {
    if (!open || !coords) return;

    let map = null;
    let cancelled = false;

    const tryInit = () => {
      if (cancelled || !mapContainerRef.current) return;

      // Dynamically import mapbox to avoid SSR issues
      import("mapbox-gl").then((mapboxglModule) => {
        if (cancelled || !mapContainerRef.current) return;
        const mapboxgl = mapboxglModule.default;

        // Ensure CSS is loaded
        if (!document.getElementById("mapbox-css")) {
          const link = document.createElement("link");
          link.id = "mapbox-css";
          link.rel = "stylesheet";
          link.href = "https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css";
          document.head.appendChild(link);
        }

        mapboxgl.accessToken = MAPBOX_TOKEN;

        map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: "mapbox://styles/mapbox/dark-v11",
          center: [coords.lng, coords.lat],
          zoom: 17,
          pitch: 55,
          bearing: -20,
          antialias: true,
        });

        mapRef.current = map;

        map.on("load", () => {
          if (cancelled) return;
          map.resize();

          const layers = map.getStyle().layers;
          const labelLayerId = layers.find(
            (l) => l.type === "symbol" && l.layout?.["text-field"]
          )?.id;

          map.addLayer(
            {
              id: "3d-buildings",
              source: "composite",
              "source-layer": "building",
              filter: ["==", "extrude", "true"],
              type: "fill-extrusion",
              minzoom: 14,
              paint: {
                "fill-extrusion-color": "#1f7aff",
                "fill-extrusion-height": ["get", "height"],
                "fill-extrusion-base": ["get", "min_height"],
                "fill-extrusion-opacity": 0.8,
              },
            },
            labelLayerId
          );

          new mapboxgl.Marker({ color: "#1f7aff" })
            .setLngLat([coords.lng, coords.lat])
            .addTo(map);
        });
      });
    };

    // Give dialog time to fully render before init
    const timer = setTimeout(tryInit, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
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