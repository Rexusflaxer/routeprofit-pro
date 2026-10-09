import { invokeCustomerPlatformRead } from "@/components/customers/customerDossierUtils";

// The server distinguishes real saved IDs from normalization fallback IDs.
// An older configuration response grants no building-plan identity.
export function storedBuildingFloorPlanKeys(configuration) {
  if (configuration?.building_selection_mode !== "manual") return new Set();
  const keys = (Array.isArray(configuration.building_floor_plan_selection_keys)
    ? configuration.building_floor_plan_selection_keys : [])
    .filter(key => typeof key === "string" && /^(?:bag|point|manual):.+$/.test(key));
  return new Set(keys.filter((key, index) => keys.indexOf(key) === index && keys.lastIndexOf(key) === index));
}

export async function getObjectBuildingFloorPlan({ customerId, objectId, buildingSelectionKey, invoke = invokeCustomerPlatformRead }) {
  const result = await invoke({
    action: "get_object_building_floor_plan",
    customer_id: customerId,
    object_id: objectId,
    building_selection_key: buildingSelectionKey,
  });
  if (result?.customer_id !== customerId || result?.object_id !== objectId
    || result?.building_selection_key !== buildingSelectionKey) {
    throw new Error("De plattegrondreactie hoort niet bij het gekozen gebouw. Probeer opnieuw.");
  }
  const plan = result.floor_plan;
  if (plan === null) return null;
  if (!plan?.id || plan.object_id !== objectId || plan.building_selection_key !== buildingSelectionKey
    || plan.status !== "published" || plan.is_current !== true
    || !Number.isInteger(plan.revision) || plan.revision < 1) {
    throw new Error("De actuele gebouwplattegrond kon niet worden gecontroleerd. Probeer opnieuw.");
  }
  return plan;
}

// The existing RoomPlan 2D contract uses room polygons and wall/opening endpoints
// in local metres. Bound the drawing and reject broken shapes as a whole.
export function buildingFloorPlanDrawing(value) {
  if (!value || value.unit !== "m") return null;
  const validPoint = point => point && typeof point.x === "number" && typeof point.y === "number"
    && Number.isFinite(point.x) && Number.isFinite(point.y) && Math.abs(point.x) <= 100_000 && Math.abs(point.y) <= 100_000;
  const endpoints = row => validPoint(row?.start) && validPoint(row?.end)
    && (row.start.x !== row.end.x || row.start.y !== row.end.y);
  const rooms = value.rooms ?? [];
  const walls = value.walls ?? [];
  const openings = value.openings ?? [];
  if (!Array.isArray(rooms) || !Array.isArray(walls) || !Array.isArray(openings)
    || rooms.length > 500 || walls.length > 5000 || openings.length > 5000) return null;
  let count = (walls.length + openings.length) * 2;
  if (!walls.every(endpoints) || !openings.every(endpoints)) return null;
  for (const room of rooms) {
    const polygon = room?.polygon;
    if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 1000
      || (count += polygon.length) > 10_000 || !polygon.every(validPoint)) return null;
    const area = polygon.reduce((sum, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0);
    if (Math.abs(area) < 0.000001) return null;
  }
  if (count > 10_000) return null;
  const points = [...rooms.flatMap(room => room.polygon), ...[...walls, ...openings].flatMap(row => [row.start, row.end])];
  if (!points.length) return null;
  const minX = Math.min(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxY = Math.max(...points.map(point => point.y));
  const width = Math.max(1, Math.max(...points.map(point => point.x)) - minX);
  const height = Math.max(1, maxY - minY);
  const padding = Math.max(width, height) * 0.05;
  return { rooms, walls, openings, reflectY: minY + maxY, viewBox: `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}` };
}
