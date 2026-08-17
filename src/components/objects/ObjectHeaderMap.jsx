import React, { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { MAPBOX_PUBLIC_TOKEN } from "@/components/navigation/mapboxConfig";
import "mapbox-gl/dist/mapbox-gl.css";

function objectCoordinates(object) {
  const lat = Number(object?.latitude);
  const lng = Number(object?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export default function ObjectHeaderMap({ object }) {
  const containerRef = useRef(null);
  const { resolvedTheme } = useTheme();
  const coords = objectCoordinates(object);

  useEffect(() => {
    if (!coords || !containerRef.current) return undefined;
    let cancelled = false;
    let map;
    let marker;

    import("mapbox-gl").then(module => {
      if (cancelled || !containerRef.current) return;
      const mapboxgl = module.default;
      mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN;
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: resolvedTheme === "dark" ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11",
        center: [coords.lng, coords.lat],
        zoom: 14.5,
        interactive: false,
        attributionControl: false,
      });
      marker = new mapboxgl.Marker({ color: "#1f7aff" }).setLngLat([coords.lng, coords.lat]).addTo(map);
    });

    return () => {
      cancelled = true;
      marker?.remove();
      map?.remove();
    };
  }, [coords?.lat, coords?.lng, resolvedTheme]);

  if (!coords) return null;

  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[38%] overflow-hidden lg:block" aria-label={`Kaartlocatie van ${object?.name || "object"}`}>
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-muted via-muted/70 to-transparent" />
    </div>
  );
}