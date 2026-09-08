import React, { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAPBOX_PUBLIC_TOKEN } from "@/components/navigation/mapboxConfig";
import { objectCoordinatePair } from "@/lib/coordinates";
import "mapbox-gl/dist/mapbox-gl.css";

const NL_BOUNDS = [[3.1, 50.65], [7.4, 53.7]];
const inBounds = point => point && point[0] >= NL_BOUNDS[0][0] && point[0] <= NL_BOUNDS[1][0] && point[1] >= NL_BOUNDS[0][1] && point[1] <= NL_BOUNDS[1][1];

export default function CollectiveLocationPicker({ location, referenceLocation, onConfirm, onCancel }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const placeRef = useRef(null);
  const initialRef = useRef(objectCoordinatePair(location));
  const [selected, setSelected] = useState(() => inBounds(initialRef.current) ? initialRef.current : null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!MAPBOX_PUBLIC_TOKEN) { setError("De kaartconfiguratie ontbreekt. Je kunt wel een adres zoeken of het dossier zonder kaartlocatie bewaren."); return undefined; }
    let cancelled = false;
    let map;
    const current = initialRef.current;
    const reference = objectCoordinatePair(referenceLocation);
    const center = inBounds(current) ? current : inBounds(reference) ? reference : [5.4, 52.2];
    import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (cancelled || !containerRef.current) return;
      map = new mapboxgl.Map({
        container: containerRef.current, accessToken: MAPBOX_PUBLIC_TOKEN,
        style: document.documentElement.classList.contains("dark") ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12",
        center, zoom: inBounds(current) || inBounds(reference) ? 16 : 7, minZoom: 6, maxZoom: 20,
        maxBounds: NL_BOUNDS, renderWorldCopies: false, prefetchZoomDelta: 0, pitch: 0,
      });
      mapRef.current = map;
      const place = point => {
        if (!inBounds(point)) return;
        if (!markerRef.current) markerRef.current = new mapboxgl.Marker({ color: "#087eff" }).setLngLat(point).addTo(map);
        else markerRef.current.setLngLat(point);
        setSelected(point);
      };
      placeRef.current = place;
      map.on("load", () => { if (cancelled) return; setReady(true); map.resize(); if (inBounds(current)) place(current); });
      map.on("click", event => place([event.lngLat.lng, event.lngLat.lat]));
      map.on("error", () => { if (!cancelled) setError("De kaart kon niet volledig worden geladen. Probeer het opnieuw of gebruik de adreszoeker."); });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    }).catch(() => { if (!cancelled) setError("De kaart kon niet worden geopend. Probeer het opnieuw of gebruik de adreszoeker."); });
    return () => { cancelled = true; placeRef.current = null; markerRef.current?.remove(); markerRef.current = null; map?.remove(); mapRef.current = null; };
  }, []);
  const chooseCenter = () => {
    const center = mapRef.current?.getCenter();
    if (!center || !inBounds([center.lng, center.lat])) return;
    const point = [center.lng, center.lat];
    placeRef.current?.(point);
  };
  return <div className="space-y-3 rounded-xl border border-border p-3">
    <p className="text-xs text-muted-foreground">Kies het centrale punt van het gebied. Dit is een kaartstartpunt, geen adres of terreinbegrenzing. Gebruik de muis of verschuif de kaart met de pijltjestoetsen.</p>
    <div className="relative h-80 overflow-hidden rounded-lg border border-border"><div ref={containerRef} className="h-full w-full" aria-label="Centrale locatie kiezen op kaart" />{!ready && !error && <div className="absolute inset-0 flex items-center justify-center bg-background/60"><Loader2 className="h-5 w-5 animate-spin" /></div>}</div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <p className="text-xs text-muted-foreground" role="status">{selected ? "Een centrale locatie is gekozen. Bevestig om dit kaartstartpunt te gebruiken." : "Klik op de gewenste plek of gebruik het midden van de kaart."}</p>
    <div className="flex flex-wrap justify-end gap-2"><Button size="sm" type="button" variant="outline" onClick={onCancel}>Annuleren</Button><Button size="sm" type="button" variant="outline" disabled={!ready} onClick={chooseCenter}>Midden van kaart gebruiken</Button><Button size="sm" type="button" disabled={!selected || !ready || Boolean(error)} onClick={() => onConfirm({ longitude: selected[0], latitude: selected[1], geocoding_status: "manual", bag_address_id: null })}><MapPin className="h-4 w-4" />Locatie bevestigen</Button></div>
  </div>;
}
