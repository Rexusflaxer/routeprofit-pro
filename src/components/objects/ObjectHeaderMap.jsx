import React, { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { MAPBOX_PUBLIC_TOKEN } from "@/components/navigation/mapboxConfig";
import { objectCoordinatePair, trustedObjectCoordinatePair } from "@/lib/coordinates";
import "mapbox-gl/dist/mapbox-gl.css";

function objectCoordinates(object) {
  const pair = trustedObjectCoordinatePair(object);
  if (!pair) return null;
  const [lng, lat] = pair;
  return { lat, lng };
}

export default function ObjectHeaderMap({ object }) {
  const containerRef = useRef(null);
  const { resolvedTheme } = useTheme();
  const storedCoords = objectCoordinates(object);
  const [coords, setCoords] = useState(storedCoords);

  useEffect(() => {
    if (storedCoords) {
      setCoords(storedCoords);
      return undefined;
    }
    const address = String(object?.address || "").trim();
    if (!address || !MAPBOX_PUBLIC_TOKEN) {
      setCoords(null);
      return undefined;
    }
    let cancelled = false;
    setCoords(null);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${encodeURIComponent(MAPBOX_PUBLIC_TOKEN)}&country=nl&limit=1`;
    fetch(url)
      .then(response => response.ok ? response.json() : null)
      .then(result => {
        if (cancelled) return;
        const center = result?.features?.[0]?.center;
        const pair = Array.isArray(center)
          ? objectCoordinatePair({ longitude: center[0], latitude: center[1] })
          : null;
        if (pair) {
          setCoords({ lng: pair[0], lat: pair[1] });
        }
      });
    return () => { cancelled = true; };
  }, [object?.address, object?.id, storedCoords?.lat, storedCoords?.lng]);

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
        logoPosition: "bottom-right",
      });
      map.on("load", () => {
        if (!map.getLayer("object-header-buildings")) {
          const styles = window.getComputedStyle(document.documentElement);
          const buildingColor = `hsl(${styles.getPropertyValue("--muted-foreground").trim()})`;
          const buildingOutlineColor = `hsl(${styles.getPropertyValue("--foreground").trim()})`;
          map.addLayer({
            id: "object-header-buildings",
            type: "fill",
            source: "composite",
            "source-layer": "building",
            minzoom: 13,
            paint: {
              "fill-color": buildingColor,
              "fill-opacity": 0.62,
              "fill-outline-color": buildingOutlineColor,
            },
          });
        }
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
    <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[44%] overflow-hidden lg:block" aria-label={`Kaartlocatie van ${object?.name || "object"}`}>
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute inset-y-0 -left-px w-72 bg-gradient-to-r from-card via-card to-transparent" />
      <div className="absolute inset-y-0 -left-px w-72 bg-gradient-to-r from-muted/40 via-muted/40 to-transparent" />
    </div>
  );
}
