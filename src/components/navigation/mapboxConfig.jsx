export const MAPBOX_PUBLIC_TOKEN = "pk.eyJ1IjoiZGF2aWRtYXJ0aW5vIiwiYSI6ImNtb3R1anp3NTA3aGoyc3NobzhhbXllMHkifQ.xGJE6-HvUk3VO2LJGfob1A";

export const getMapboxTileUrl = () =>
  `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_PUBLIC_TOKEN}`;

export const getMapboxDirectionsUrl = (coordinates) =>
  `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&overview=full&steps=true&language=nl&access_token=${MAPBOX_PUBLIC_TOKEN}`;