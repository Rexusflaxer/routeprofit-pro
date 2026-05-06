import React from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, CircleMarker, useMap } from "react-leaflet";
import { getMapboxTileUrl } from "./mapboxConfig";
import "leaflet/dist/leaflet.css";

function Recenter({ position }) {
  const map = useMap();
  React.useEffect(() => {
    if (position) map.setView([position.latitude, position.longitude], Math.max(map.getZoom(), 16));
  }, [map, position]);
  return null;
}

export default function RouteNavigationMap({ stops, userPosition, visitedIds }) {
  const center = userPosition || stops[0] || { latitude: 52.0907, longitude: 5.1214 };
  const line = stops.map(stop => [stop.latitude, stop.longitude]);

  return (
    <MapContainer center={[center.latitude, center.longitude]} zoom={14} className="h-full w-full" zoomControl={false}>
      <TileLayer url={getMapboxTileUrl()} attribution="© Mapbox © OpenStreetMap" />
      {line.length > 1 && <Polyline positions={line} pathOptions={{ color: "#f59e0b", weight: 5, opacity: 0.85 }} />}
      {stops.map(stop => {
        const visited = visitedIds.has(stop.id);
        return (
          <CircleMarker
            key={stop.id}
            center={[stop.latitude, stop.longitude]}
            radius={visited ? 9 : 7}
            pathOptions={{ color: visited ? "#22c55e" : "#f59e0b", fillColor: visited ? "#22c55e" : "#f59e0b", fillOpacity: 0.9 }}
          >
            <Popup>{stop.sequence}. {stop.name}<br />{visited ? "Bezocht" : "Nog te bezoeken"}</Popup>
          </CircleMarker>
        );
      })}
      {userPosition && (
        <Marker position={[userPosition.latitude, userPosition.longitude]}>
          <Popup>Jouw huidige locatie</Popup>
        </Marker>
      )}
      <Recenter position={userPosition} />
    </MapContainer>
  );
}