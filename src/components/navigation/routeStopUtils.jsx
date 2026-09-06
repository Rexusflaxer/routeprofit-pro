import { objectCoordinatePair } from "@/lib/coordinates";

export function normalizeRouteCoordinatePair(object) {
  const coordinates = objectCoordinatePair(object);
  if (!coordinates) return null;
  const [longitude, latitude] = coordinates;

  if (latitude > 40 && latitude < 60 && longitude > -10 && longitude < 15) {
    return [longitude, latitude];
  }

  if (latitude !== 0 && longitude !== 0 && longitude > 40 && longitude < 60 && latitude > -10 && latitude < 15) {
    return [latitude, longitude];
  }

  return [longitude, latitude];
}

function normalizeObjectCoordinates(object) {
  const coordinates = normalizeRouteCoordinatePair(object);
  return coordinates
    ? { ...object, longitude: coordinates[0], latitude: coordinates[1] }
    : null;
}

export function getBuildingProximityFilter(items, radiusMeters = 45) {
  const coordinates = (items || []).map(normalizeRouteCoordinatePair).filter(Boolean);
  if (!coordinates.length) return ["in", ["id"], ["literal", []]];

  return [
    "all",
    ["==", ["get", "extrude"], "true"],
    ["<=", ["distance", { type: "MultiPoint", coordinates }], radiusMeters],
  ];
}

export function routeStopsFromData(route, tasks, objects) {
  const objectById = new Map(objects.map(object => [object.id, normalizeObjectCoordinates(object)]));
  const taskById = new Map(tasks.map(task => [task.id, task]));
  const seen = new Set();

  return (route.assigned_tasks || [])
    .flatMap(assignment => {
      const task = taskById.get(assignment.task_id);
      if (!task) return [];
      const objectIds = task.object_id ? [task.object_id] : (task.selected_object_ids || []);
      return objectIds.map(objectId => ({ task, object: objectById.get(objectId) }));
    })
    .filter(({ object }) => Boolean(object))
    .filter(({ object }) => {
      if (seen.has(object.id)) return false;
      seen.add(object.id);
      return true;
    })
    .map(({ task, object }, index) => ({
      id: object.id,
      sequence: index + 1,
      name: object.name,
      address: object.address,
      latitude: Number(object.latitude),
      longitude: Number(object.longitude),
      task_type: task.task_type,
    }));
}

export function distanceMeters(a, b) {
  const earthRadius = 6371000;
  const toRad = value => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}
