import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function nowIso() { return new Date().toISOString(); }
function safeNumber(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function secondsFromTime(time) {
  if (!time) return null;
  const [h, m = 0] = String(time).split(':').map(Number);
  return Number.isFinite(h) ? h * 3600 + (Number.isFinite(m) ? m * 60 : 0) : null;
}
function getWeekday(serviceDate) {
  const date = new Date(`${serviceDate}T12:00:00`);
  const day = date.getDay();
  return day === 0 ? 7 : day;
}
function isTaskForDay(task, weekday) {
  return (task.weekdays || []).map(Number).includes(Number(weekday));
}
function isAssignmentForDay(assignment, weekday) {
  return (assignment.days || []).map(Number).includes(Number(weekday));
}
function makeTaskName(task, object, repeatIndex, repeatCount) {
  const base = object?.name || task.task_type || 'Taak';
  return repeatCount > 1 && repeatIndex ? `${base} (${repeatIndex}/${repeatCount})` : base;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const body = await req.json();
    const routeId = body.route_id;
    const serviceDate = body.service_date;
    if (!routeId || !serviceDate) return Response.json({ error: 'route_id en service_date zijn verplicht' }, { status: 400 });

    const weekday = getWeekday(serviceDate);
    const [routes, existingExecutions, tasks, objects, vehicles, offices] = await Promise.all([
      base44.asServiceRole.entities.Route.filter({ id: routeId }),
      base44.asServiceRole.entities.RouteExecution.filter({ service_date: serviceDate }),
      base44.asServiceRole.entities.Task.list(),
      base44.asServiceRole.entities.SurveillanceObject.list(),
      base44.asServiceRole.entities.Vehicle.list(),
      base44.asServiceRole.entities.Office.list(),
    ]);

    const route = routes[0];
    if (!route) return Response.json({ error: 'Route niet gevonden' }, { status: 404 });
    if (!(route.weekdays || []).map(Number).includes(Number(weekday))) {
      return Response.json({ error: 'Deze route is niet gepland op deze datum' }, { status: 400 });
    }

    const existing = existingExecutions.find(item => String(item.source_route_id || item.route_id || '') === String(route.id));
    if (existing) return Response.json({ route_execution_id: existing.id, already_exists: true });

    const vehicle = vehicles.find(v => String(v.id) === String(route.vehicle_id || '')) || null;
    const startOffice = offices.find(o => String(o.id) === String(route.start_location_id || '')) || null;
    const endOffice = offices.find(o => String(o.id) === String(route.end_location_id || '')) || startOffice || null;

    const routeExecution = await base44.asServiceRole.entities.RouteExecution.create({
      route_id: route.id,
      source_route_id: route.id,
      route_name: route.name || 'Route',
      weekday,
      service_date: serviceDate,
      employee_id: null,
      employee_name: null,
      vehicle_id: route.vehicle_id || null,
      vehicle_license_plate: vehicle?.license_plate || null,
      status: 'planned',
      shift_start_time: route.time_window_start || '00:00',
      shift_end_time: route.time_window_end || '00:00',
      start_location_name: startOffice?.name || null,
      start_latitude: safeNumber(startOffice?.latitude),
      start_longitude: safeNumber(startOffice?.longitude),
      end_location_name: endOffice?.name || null,
      end_latitude: safeNumber(endOffice?.latitude),
      end_longitude: safeNumber(endOffice?.longitude),
      total_planned_distance_km: route.total_distance_km ?? null,
      total_planned_travel_minutes: route.avg_travel_minutes ?? null,
      total_planned_service_minutes: route.total_service_minutes ?? null,
      total_planned_route_minutes: route.total_route_minutes ?? null,
      generated_at: nowIso(),
      metadata: { source: 'uitvoering', copied_to_mobile: true },
    });

    const taskById = new Map(tasks.map(task => [String(task.id), task]));
    const objectById = new Map(objects.map(object => [String(object.id), object]));
    const assignments = (route.assigned_tasks || []).filter(item => isAssignmentForDay(item, weekday));
    const taskPayloads = [];

    assignments.forEach((assignment) => {
      const task = taskById.get(String(assignment.task_id));
      if (!task || !isTaskForDay(task, weekday)) return;
      const object = objectById.get(String(task.object_id || '')) || {};
      const repeatCount = Number(task.repeat_count || 1);
      const occurrenceCount = assignment.lock_all_occurrences ? repeatCount : Number(assignment.locked_occurrence_count || 1);
      const repeatIndexes = assignment.repeat_index ? [Number(assignment.repeat_index)] : Array.from({ length: Math.max(1, occurrenceCount) }, (_, index) => index + 1);

      repeatIndexes.forEach((repeatIndex) => {
        const latitude = safeNumber(object.latitude);
        const longitude = safeNumber(object.longitude);
        if (latitude === null || longitude === null) return;
        taskPayloads.push({
          route_execution_id: routeExecution.id,
          source_route_id: route.id,
          original_task_id: String(task.id),
          object_id: String(task.object_id),
          sequence_index: taskPayloads.length + 1,
          task_name: makeTaskName(task, object, repeatIndex, repeatCount),
          object_name: object.name || 'Object',
          task_type: task.task_type || 'Taak',
          repeat_index: repeatCount > 1 ? repeatIndex : null,
          repeat_count: repeatCount > 1 ? repeatCount : null,
          status: 'pending',
          planned_arrival_time: assignment.planned_arrival_time || null,
          planned_start_time: assignment.planned_start_time || null,
          planned_departure_time: assignment.planned_departure_time || null,
          planned_arrival_seconds: secondsFromTime(assignment.planned_arrival_time),
          planned_departure_seconds: secondsFromTime(assignment.planned_departure_time),
          duration_minutes: Number(task.duration_minutes || 0),
          travel_from_previous_minutes: null,
          distance_from_previous_km: null,
          travel_to_next_minutes: null,
          distance_to_next_km: null,
          latitude,
          longitude,
          address: object.address || null,
          locked_to_route: !!assignment.locked_to_route,
          locked_sequence: !!assignment.locked_sequence,
          route_pin_hard: !!assignment.locked_to_route,
          arrival_deadline_time: task.arrival_deadline_time || null,
          uses_arrival_deadline: !!task.use_arrival_deadline,
          service_must_start_at: null,
          metadata: { source: 'uitvoering' },
        });
      });
    });

    if (taskPayloads.length) await base44.asServiceRole.entities.TaskExecution.bulkCreate(taskPayloads);
    return Response.json({ route_execution_id: routeExecution.id, created_tasks: taskPayloads.length, already_exists: false });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});