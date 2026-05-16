import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const OPEN_STATUSES = ['pending', 'en_route', 'arrived', 'started', 'postponed', 'failed'];
function safeNumber(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function statusForObject(objectId, tasks) {
  const items = tasks.filter(task => String(task.object_id) === String(objectId));
  if (!items.length) return { map_status: 'customer', open_task_count: 0, has_task_in_current_route: false, is_next_task_object: false };
  const open = items.filter(task => OPEN_STATUSES.includes(task.status));
  const active = items.some(task => ['arrived', 'started'].includes(task.status));
  const next = tasks.find(task => OPEN_STATUSES.includes(task.status));
  if (active) return { map_status: 'active_task', open_task_count: open.length, has_task_in_current_route: true, is_next_task_object: false };
  if (next && String(next.object_id) === String(objectId)) return { map_status: 'next_task', open_task_count: open.length, has_task_in_current_route: true, is_next_task_object: true };
  if (!open.length) return { map_status: 'completed', open_task_count: 0, has_task_in_current_route: true, is_next_task_object: false };
  return { map_status: 'route_task', open_task_count: open.length, has_task_in_current_route: true, is_next_task_object: false };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const [objects, tasks] = await Promise.all([
      base44.asServiceRole.entities.SurveillanceObject.list(),
      body.route_execution_id ? base44.asServiceRole.entities.TaskExecution.filter({ route_execution_id: body.route_execution_id }) : Promise.resolve([]),
    ]);
    return Response.json({
      objects: objects
        .filter(object => object.show_on_mobile_map !== false && object.is_active_customer_object !== false)
        .map(object => ({
          object_id: object.id,
          name: object.name,
          latitude: safeNumber(object.latitude),
          longitude: safeNumber(object.longitude),
          address: object.address || null,
          ...statusForObject(object.id, tasks),
          building_polygon_geojson: object.building_polygon_geojson || null,
        }))
        .filter(object => object.latitude !== null && object.longitude !== null),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});