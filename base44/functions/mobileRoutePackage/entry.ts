import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const OPEN_STATUSES = ['pending', 'en_route', 'arrived', 'started', 'postponed', 'failed'];

function todayIso() { return new Date().toISOString().slice(0, 10); }
function nowIso() { return new Date().toISOString(); }
function isPrivileged(user) { return ['admin', 'manager', 'planner'].includes(String(user?.role || '').toLowerCase()); }
function safeNumber(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }

async function findEmployee(base44, user) {
  const personnel = await base44.asServiceRole.entities.Personnel.list();
  return personnel.find(p => String(p.email || '').toLowerCase() === String(user.email || '').toLowerCase()) ||
    personnel.find(p => String(p.name || '').toLowerCase() === String(user.full_name || '').toLowerCase()) || null;
}

async function getRouteExecution(base44, user, body) {
  if (body.route_execution_id) {
    const matches = await base44.asServiceRole.entities.RouteExecution.filter({ id: body.route_execution_id });
    return matches[0] || null;
  }
  const employee = await findEmployee(base44, user);
  const date = body.date || todayIso();
  let executions = await base44.asServiceRole.entities.RouteExecution.filter({ service_date: date });
  executions = executions.filter(route => ['planned', 'downloaded', 'active', 'paused'].includes(route.status));
  if (body.vehicle_id) executions = executions.filter(route => String(route.vehicle_id || '') === String(body.vehicle_id));
  if (employee && !isPrivileged(user)) executions = executions.filter(route => String(route.employee_id || '') === String(employee.id));
  if (isPrivileged(user) && body.employee_id) executions = executions.filter(route => String(route.employee_id || '') === String(body.employee_id));
  return executions.sort((a, b) => String(a.shift_start_time || '').localeCompare(String(b.shift_start_time || '')))[0] || null;
}

function taskTemplateId(templates, taskType) {
  return templates.find(t => t.is_active !== false && t.task_type === taskType)?.id || null;
}

function mapStatus(objectId, taskExecutions) {
  const tasks = taskExecutions.filter(task => String(task.object_id) === String(objectId));
  if (!tasks.length) return { map_status: 'customer', open_task_count: 0, has_task_in_current_route: false, is_next_task_object: false };
  const openTasks = tasks.filter(task => OPEN_STATUSES.includes(task.status));
  const active = tasks.some(task => ['arrived', 'started'].includes(task.status));
  const nextOpen = taskExecutions.find(task => OPEN_STATUSES.includes(task.status));
  if (active) return { map_status: 'active_task', open_task_count: openTasks.length, has_task_in_current_route: true, is_next_task_object: false };
  if (nextOpen && String(nextOpen.object_id) === String(objectId)) return { map_status: 'next_task', open_task_count: openTasks.length, has_task_in_current_route: true, is_next_task_object: true };
  if (!openTasks.length) return { map_status: 'completed', open_task_count: 0, has_task_in_current_route: true, is_next_task_object: false };
  return { map_status: 'route_task', open_task_count: openTasks.length, has_task_in_current_route: true, is_next_task_object: false };
}

async function buildPackage(base44, routeExecution) {
  const [taskExecutions, objects, templates, vehicles, personnel] = await Promise.all([
    base44.asServiceRole.entities.TaskExecution.filter({ route_execution_id: routeExecution.id }),
    base44.asServiceRole.entities.SurveillanceObject.list(),
    base44.asServiceRole.entities.ReportTemplate.list(),
    base44.asServiceRole.entities.Vehicle.list(),
    base44.asServiceRole.entities.Personnel.list(),
  ]);
  const sortedTasks = taskExecutions.sort((a, b) => Number(a.sequence_index || 0) - Number(b.sequence_index || 0));
  const objectById = new Map(objects.map(object => [String(object.id), object]));
  const vehicle = vehicles.find(v => String(v.id) === String(routeExecution.vehicle_id)) || null;
  const employee = personnel.find(p => String(p.id) === String(routeExecution.employee_id)) || null;
  const relevantObjectIds = new Set(sortedTasks.map(task => String(task.object_id)));

  const stops = sortedTasks.map(task => {
    const object = objectById.get(String(task.object_id)) || {};
    return {
      task_execution_id: task.id,
      route_execution_id: task.route_execution_id,
      original_task_id: task.original_task_id,
      object_id: task.object_id,
      sequence_index: task.sequence_index,
      object_name: task.object_name,
      task_name: task.task_name,
      task_type: task.task_type,
      repeat_index: task.repeat_index ?? null,
      repeat_count: task.repeat_count ?? null,
      custom_block_label: task.custom_block_label || null,
      status: task.status,
      planned_arrival: task.planned_arrival_time || null,
      planned_start: task.planned_start_time || null,
      planned_departure: task.planned_departure_time || null,
      duration_minutes: task.duration_minutes,
      travel_from_previous_minutes: task.travel_from_previous_minutes ?? null,
      distance_from_previous_km: task.distance_from_previous_km ?? null,
      travel_to_next_minutes: task.travel_to_next_minutes ?? null,
      distance_to_next_km: task.distance_to_next_km ?? null,
      latitude: task.latitude,
      longitude: task.longitude,
      address: task.address || object.address || null,
      parking_instruction: object.parking_instruction || null,
      entry_instruction: object.entry_instruction || null,
      walking_instruction: object.walking_instruction || null,
      access_instruction: object.access_instruction || null,
      alarm_instruction: object.alarm_instruction || null,
      key_instruction: object.key_instruction || null,
      object_notes: object.object_notes || object.notes || null,
      safety_notes: object.safety_notes || null,
      last_incident_notes: object.last_incident_notes || null,
      object_map_url: object.object_map_url || object.object_map_file_url || null,
      report_template_id: taskTemplateId(templates, task.task_type),
    };
  });

  const objectsOnMap = objects
    .filter(object => object.show_on_mobile_map !== false && object.is_active_customer_object !== false)
    .map(object => ({
      object_id: object.id,
      name: object.name,
      latitude: safeNumber(object.latitude),
      longitude: safeNumber(object.longitude),
      address: object.address || null,
      ...mapStatus(object.id, sortedTasks),
      building_polygon_geojson: object.building_polygon_geojson || null,
      object_area_geojson: object.object_area_geojson || null,
      mobile_map_priority: Number(object.mobile_map_priority || 0),
    }))
    .filter(object => object.latitude !== null && object.longitude !== null || relevantObjectIds.has(String(object.object_id)));

  return {
    route_execution_id: routeExecution.id,
    route_name: routeExecution.route_name,
    status: routeExecution.status,
    employee: { id: routeExecution.employee_id, name: routeExecution.employee_name || employee?.name || null },
    vehicle: { id: routeExecution.vehicle_id, license_plate: routeExecution.vehicle_license_plate || vehicle?.license_plate || null },
    shift: { start: routeExecution.shift_start_time, end: routeExecution.shift_end_time },
    start_location: { name: routeExecution.start_location_name, latitude: routeExecution.start_latitude, longitude: routeExecution.start_longitude },
    end_location: { name: routeExecution.end_location_name, latitude: routeExecution.end_latitude, longitude: routeExecution.end_longitude },
    stops,
    objects_on_map: objectsOnMap,
    report_templates: templates.filter(t => t.is_active !== false).map(t => ({ id: t.id, name: t.name, task_type: t.task_type, fields: t.fields || [] })),
    server_time: nowIso(),
    sync_token: `${routeExecution.id}:${nowIso()}`,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const routeExecution = await getRouteExecution(base44, user, body || {});
    if (!routeExecution) return Response.json({ error: 'Geen actieve of geplande route gevonden' }, { status: 404 });
    const employee = await findEmployee(base44, user);
    if (!isPrivileged(user) && employee && String(routeExecution.employee_id || '') !== String(employee.id)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const routePackage = await buildPackage(base44, routeExecution);
    await base44.asServiceRole.entities.RouteExecution.update(routeExecution.id, { mobile_route_package_cache: routePackage, last_mobile_sync_at: nowIso() });
    return Response.json(routePackage);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

export { buildPackage };