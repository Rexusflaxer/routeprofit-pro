import React, { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = "pk.eyJ1IjoibG9xYXBwIiwiYSI6ImNtYjRlODB3NjBiMHkya3B3YmdkbHlvcmgifQ.dHDNHKWtfRq1nVT1u3xAXg";

export default function LocationMapDialog({ open, onOpenChange, location }) {
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);

  const lat = location?.latitude;
  const lng = location?.longitude;
  const hasCoords = lat && lng;

  const address = [
    location?.street_name,
    location?.house_number,
    location?.postal_code,
    location?.city,
  ].filter(Boolean).join(" ");

  useEffect(() => {
    if (!open || !hasCoords || !mapContainerRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [lng, lat],
      zoom: 17,
      pitch: 55,
      bearing: -20,
      antialias: true,
    });

    mapRef.current = map;

    map.on("load", () => {
      // Blue 3D buildings layer
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
            "fill-extrusion-color": [
              "interpolate",
              ["linear"],
              ["distance-from-center"],
              0, "#1f7aff",
              500, "#0f3f8a",
            ],
            "fill-extrusion-height": ["get", "height"],
            "fill-extrusion-base": ["get", "min_height"],
            "fill-extrusion-opacity": 0.85,
          },
        },
        labelLayerId
      );

      // Marker
      new mapboxgl.Marker({ color: "#1f7aff" })
        .setLngLat([lng, lat])
        .addTo(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [open, lat, lng]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="w-4 h-4 text-primary" />
            {address || "Vestiging"}
          </DialogTitle>
        </DialogHeader>
        <div className="relative">
          {hasCoords ? (
            <div ref={mapContainerRef} className="w-full h-[420px]" />
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
              <MapPin className="w-8 h-8 opacity-40" />
              <p className="text-sm">Geen coördinaten beschikbaar voor deze vestiging.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}