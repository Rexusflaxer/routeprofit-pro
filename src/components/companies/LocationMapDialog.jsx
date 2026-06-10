import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin, Loader2 } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

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

function initMap(container, lng, lat) {
  mapboxgl.accessToken = MAPBOX_TOKEN;

  const map = new mapboxgl.Map({
    container,
    style: "mapbox://styles/mapbox/dark-v11",
    center: [lng, lat],
    zoom: 17,
    pitch: 55,
    bearing: -20,
    antialias: true,
  });

  map.on("load", () => {
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
      .setLngLat([lng, lat])
      .addTo(map);
  });

  return map;
}

export default function LocationMapDialog({ open, onOpenChange, location }) {
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const [coords, setCoords] = useState(null); // { lat, lng }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const address = [
    location?.street_name,
    location?.house_number,
    location?.postal_code,
    location?.city,
  ].filter(Boolean).join(" ");

  // Resolve coordinates when dialog opens
  useEffect(() => {
    if (!open || !location) return;

    const directLat = location.latitude;
    const directLng = location.longitude;

    if (directLat && directLng) {
      setCoords({ lat: directLat, lng: directLng });
      setError(false);
      return;
    }

    if (!address) {
      setError(true);
      return;
    }

    setLoading(true);
    setCoords(null);
    setError(false);

    geocodeAddress(address).then((result) => {
      setLoading(false);
      if (result) {
        setCoords(result);
      } else {
        setError(true);
      }
    });
  }, [open, location]);

  // Init map when we have coords and container
  useEffect(() => {
    if (!open || !coords || !mapContainerRef.current) return;

    // Small timeout to ensure the container is rendered
    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;
      const map = initMap(mapContainerRef.current, coords.lng, coords.lat);
      mapRef.current = map;
    }, 50);

    return () => {
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [open, coords]);

  // Cleanup on close
  useEffect(() => {
    if (!open && mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="w-4 h-4 text-primary" />
            {address || "Vestiging"}
          </DialogTitle>
        </DialogHeader>
        <div className="relative w-full h-[420px]">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <MapPin className="w-8 h-8 opacity-40" />
              <p className="text-sm">Adres kon niet op de kaart worden gevonden.</p>
            </div>
          )}
          {coords && !error && (
            <div ref={mapContainerRef} className="w-full h-full" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}