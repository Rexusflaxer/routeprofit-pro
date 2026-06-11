import React, { useEffect, useMemo, useRef, useState } from "react";
import { MAPBOX_PUBLIC_TOKEN } from "@/components/navigation/mapboxConfig";
import TeamhubCompanyPreview from "./TeamhubCompanyPreview";
import { Loader2, MapPin } from "lucide-react";
import "mapbox-gl/dist/mapbox-gl.css";

const NETHERLANDS_CENTER = [5.2913, 52.1326];
const SELECTED_REGIONS_SOURCE_ID = "teamhub-public-selected-regions";
const SELECTED_REGIONS_FILL_LAYER_ID = "teamhub-public-selected-regions-fill";
const SELECTED_REGIONS_LINE_LAYER_ID = "teamhub-public-selected-regions-line";
const SELECTED_POINT_SOURCE_ID = "teamhub-public-selected-point";
const SELECTED_POINT_LAYER_ID = "teamhub-public-selected-point";

function normalizeCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat > 40 && lat < 60 && lng > -10 && lng < 15) return { lat, lng };
  if (lng > 40 && lng < 60 && lat > -10 && lat < 15) return { lat: lng, lng: lat };

  return null;
}

function featureCollection(features = []) {
  return { type: "FeatureCollection", features };
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

function selectedRegionFeatures(company) {
  return featureCollection((company?.teamhub_regions || []).map(storedRegionFeature).filter(Boolean));
}

function walkCoordinates(coords, visitor) {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    visitor(coords[0], coords[1]);
    return;
  }
  coords.forEach(item => walkCoordinates(item, visitor));
}

function extendBoundsWithFeatures(bounds, features = []) {
  features.forEach(feature => {
    walkCoordinates(feature.geometry?.coordinates, (lng, lat) => bounds.extend([lng, lat]));
  });
}

function buildCompanyPoint(profile) {
  if (!profile?.coords) return featureCollection([]);
  return featureCollection([{
    type: "Feature",
    properties: { company_id: profile.company.id },
    geometry: { type: "Point", coordinates: [profile.coords.lng, profile.coords.lat] },
  }]);
}

function markerLabel(company) {
  return (company?.display_name || company?.legal_name || "?").trim().slice(0, 2).toUpperCase();
}

function createMarkerElement(company) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "teamhub-map-marker";
  element.setAttribute("aria-label", company?.display_name || "Teamhub bedrijf");

  if (company?.logo_file_url) {
    const image = document.createElement("img");
    image.src = company.logo_file_url;
    image.alt = "";
    element.appendChild(image);
  } else {
    const fallback = document.createElement("span");
    fallback.textContent = markerLabel(company);
    element.appendChild(fallback);
  }

  return element;
}

export default function TeamhubMap({
  companies = [],
  locations = [],
  className = "",
  heightClassName = "h-[640px] min-h-[520px]",
  defaultSelectedCompanyId = null,
  lockSelection = false,
  showProfileCount = true,
  emptyMessage = "Geen zichtbare bedrijven met kaartlocatie",
  effectiveWpbrLicenseType = null,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapboxRef = useRef(null);
  const markersRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState(defaultSelectedCompanyId);

  const locationById = useMemo(
    () => new Map((locations || []).filter(location => location?.id).map(location => [location.id, location])),
    [locations]
  );

  const profiles = useMemo(() => {
    return (companies || [])
      .map(company => {
        const location = locationById.get(company.teamhub_public_location_id);
        const coords = normalizeCoordinates(location?.latitude, location?.longitude);
        return { company, location, coords };
      })
      .filter(profile => profile.coords);
  }, [companies, locationById]);

  const selectedProfile = useMemo(
    () => profiles.find(profile => profile.company.id === selectedCompanyId) || null,
    [profiles, selectedCompanyId]
  );

  useEffect(() => {
    setSelectedCompanyId(defaultSelectedCompanyId);
  }, [defaultSelectedCompanyId]);

  useEffect(() => {
    let cancelled = false;
    let map = null;

    import("mapbox-gl").then((mapboxglModule) => {
      if (cancelled || !mapContainerRef.current) return;

      const mapboxgl = mapboxglModule.default;
      mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN;
      mapboxRef.current = mapboxgl;

      map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/light-v11",
        center: NETHERLANDS_CENTER,
        zoom: 6.4,
        minZoom: 5.2,
      });

      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

      map.on("load", () => {
        if (cancelled) return;

        map.addSource(SELECTED_REGIONS_SOURCE_ID, { type: "geojson", data: featureCollection([]) });
        map.addSource(SELECTED_POINT_SOURCE_ID, { type: "geojson", data: featureCollection([]) });

        map.addLayer({
          id: SELECTED_REGIONS_FILL_LAYER_ID,
          type: "fill",
          source: SELECTED_REGIONS_SOURCE_ID,
          paint: {
            "fill-color": "#1f7aff",
            "fill-opacity": 0.24,
          },
        });

        map.addLayer({
          id: SELECTED_REGIONS_LINE_LAYER_ID,
          type: "line",
          source: SELECTED_REGIONS_SOURCE_ID,
          paint: {
            "line-color": "#0f5fd7",
            "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.6, 8, 2.4, 10, 3],
          },
        });

        map.addLayer({
          id: SELECTED_POINT_LAYER_ID,
          type: "circle",
          source: SELECTED_POINT_SOURCE_ID,
          paint: {
            "circle-color": "#1f7aff",
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 5, 9, 8, 13, 12],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });

        setMapReady(true);
      });

      map.on("error", () => {
        if (!cancelled) setMapError(true);
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
      mapboxRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapReady || !mapboxgl) return;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    if (selectedProfile) return;

    profiles.forEach(profile => {
      const element = createMarkerElement(profile.company);
      element.addEventListener("click", () => setSelectedCompanyId(profile.company.id));

      const marker = new mapboxgl.Marker({ element, anchor: "center" })
        .setLngLat([profile.coords.lng, profile.coords.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [mapReady, profiles, selectedProfile]);

  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapReady || !mapboxgl || profiles.length === 0 || selectedProfile) return;

    const bounds = new mapboxgl.LngLatBounds();
    profiles.forEach(profile => bounds.extend([profile.coords.lng, profile.coords.lat]));
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 72, maxZoom: 8.4, duration: 700 });
  }, [mapReady, profiles, selectedProfile]);

  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapReady || !map.getSource(SELECTED_REGIONS_SOURCE_ID) || !map.getSource(SELECTED_POINT_SOURCE_ID)) return;

    const regions = selectedRegionFeatures(selectedProfile?.company);
    map.getSource(SELECTED_REGIONS_SOURCE_ID).setData(regions);
    map.getSource(SELECTED_POINT_SOURCE_ID).setData(buildCompanyPoint(selectedProfile));

    if (!selectedProfile) return;

    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([selectedProfile.coords.lng, selectedProfile.coords.lat]);
    extendBoundsWithFeatures(bounds, regions.features);

    if (!bounds.isEmpty()) {
      const narrow = map.getContainer().clientWidth < 760;
      map.fitBounds(bounds, {
        padding: narrow
          ? { top: 90, right: 70, bottom: 390, left: 70 }
          : { top: 90, right: 480, bottom: 90, left: 90 },
        maxZoom: 9.6,
        duration: 700,
      });
    }
  }, [mapReady, selectedProfile]);

  const closeSelected = () => {
    if (!lockSelection) setSelectedCompanyId(null);
  };

  return (
    <div className={`relative overflow-hidden rounded-md border border-border bg-card ${className}`}>
      <div className={`relative ${heightClassName}`}>
        <div ref={mapContainerRef} className="h-full w-full" />

        <style>{`
          .teamhub-map-marker {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 42px;
            height: 42px;
            border: 1px solid hsl(var(--border));
            border-radius: 10px;
            background: white;
            box-shadow: 0 10px 24px rgba(15, 23, 42, 0.22);
            cursor: pointer;
            overflow: hidden;
            transition: transform 160ms ease, box-shadow 160ms ease;
          }
          .teamhub-map-marker:hover {
            transform: translateY(-2px) scale(1.04);
            box-shadow: 0 14px 30px rgba(15, 23, 42, 0.28);
          }
          .teamhub-map-marker img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            padding: 4px;
          }
          .teamhub-map-marker span {
            font-size: 12px;
            font-weight: 700;
            color: #0f172a;
          }
        `}</style>

        {!mapReady && !mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Kaart laden
          </div>
        )}

        {mapError && (
          <div className="absolute inset-x-4 top-4 rounded-md border border-destructive/30 bg-background/95 px-3 py-2 text-sm text-destructive shadow-sm">
            Kaart kon niet worden geladen.
          </div>
        )}

        {profiles.length === 0 && mapReady && (
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-md border border-border bg-background/95 px-3 py-2 text-sm text-muted-foreground shadow-sm">
            <MapPin className="h-4 w-4" />
            {emptyMessage}
          </div>
        )}

        {selectedProfile && (
          <div className="absolute right-4 top-4 z-10 max-h-[calc(100%-2rem)] w-[min(430px,calc(100%-2rem))] overflow-y-auto">
            <TeamhubCompanyPreview
              company={selectedProfile.company}
              location={selectedProfile.location}
              effectiveWpbrLicenseType={effectiveWpbrLicenseType}
              onClose={lockSelection ? null : closeSelected}
              compact
            />
          </div>
        )}

        {showProfileCount && !selectedProfile && profiles.length > 0 && (
          <div className="absolute left-4 top-4 rounded-md border border-border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm">
            <span className="font-semibold text-foreground">{profiles.length}</span> bedrijven op de kaart
          </div>
        )}

        {selectedProfile && (
          <div className="absolute left-4 top-4 rounded-md border border-border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm">
            Werkgebied van <span className="font-semibold text-foreground">{selectedProfile.company.display_name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
