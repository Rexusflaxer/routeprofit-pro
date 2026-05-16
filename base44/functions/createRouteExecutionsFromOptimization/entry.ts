import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function nowIso() { return new Date().toISOString(); }
function secondsFromTime(time) { if (!time) return null; const [h, m = 0] = String(time).split(':').map(Number); return Number.isFinite(h) ? h * 3600 + (Number.isFinite(m) ? m * 60 : 0) : null; }
function safeNumber(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function taskName(task, index, count) { return count > 1 && index ? `${task.name || task.object_name || task.task_type} (${index}/${count})` : (task.name || task.object_name || task.task_type || 'Taak'); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    const body = await req.json();
    const plannedResult = body.plannedResult || body.result || body;
    const serviceDate = body.service_date || null;
    const optimizationJobId = body.optimization_job_id || body.local_job_id || null;
    const [objects, routes] = await Promise.all([
      base44.asServiceRole.entities.SurveillanceObject.list(),
      base44.asServiceRole.entities.RouteExecution.list(),
    ]);
    const objectById = new Map(objects.map(object => [String(object.id), object]));
    const created = [];
    const blocked = [];

    for (const route of plannedResult.routes || []) {
      const sourceRouteId = route.manual_route_id || route.route_id || route.id || null;
      const existing = routes.find(item => String(item.source_route_id || item.route_id || '') === String(sourceRouteId || '') && (serviceDate ? item.service_date === serviceDate : item.weekday === route.weekday));
      if (existing && ['active', 'completed'].includes(existing.status) && !body.force_overwrite) { blocked.push(existing.id); continue; }
      const routePayload = {
        route_id: sourceRouteId,
        route_name: route.manual_route_name || route.name || route.vehicle?.name || 'Route',
        source_route_id: sourceRouteId,
        weekday: Number(route.weekday || 1),
        service_date: serviceDate,
        employee_id: route.employee_id || null,
        employee_name: route.employee_name || null,
        vehicle_id: route.vehicle?.id || route.vehicle_id || null,
        vehicle_license_plate: route.vehicle?.license_plate || route.license_plate || null,
        status: 'planned',
        shift_start_time: route.time_window_start || route.shift_start_time || '00:00',
        shift_end_time: route.time_window_end || route.shift_end_time || '00:00',
        start_location_name: route.start_location_name || null,
        start_latitude: safeNumber(route.start_latitude),
        start_longitude: safeNumber(route.start_longitude),
        end_location_name: route.end_location_name || null,
        end_latitude: safeNumber(route.end_latitude),
        end_longitude: safeNumber(route.end_longitude),
        total_planned_distance_km: route.stats?.total_distance_km ?? route.total_distance_km ?? null,
        total_planned_travel_minutes: route.stats?.total_travel_minutes ?? route.total_travel_minutes ?? null,
        total_planned_service_minutes: route.stats?.total_service_minutes ?? route.total_service_minutes ?? null,
        total_planned_route_minutes: route.stats?.total_route_minutes ?? route.total_route_minutes ?? null,
        generated_at: nowIso(),
        optimization_job_id: optimizationJobId,
        metadata: { source: 'optimization' },
      };
      const routeExecution = existing ? await base44.asServiceRole.entities.RouteExecution.update(existing.id, routePayload) : await base44.asServiceRole.entities.RouteExecution.create(routePayload);
      const oldTasks = await base44.asServiceRole.entities.TaskExecution.filter({ route_execution_id: routeExecution.id });
      for (const oldTask of oldTasks.filter(task => !['arrived', 'started', 'completed'].includes(task.status))) await base44.asServiceRole.entities.TaskExecution.delete(oldTask.id);
      const taskPayloads = (route.tasks || route.optimized_order || []).map((task, index) => {
        const object = objectById.get(String(task.object_id)) || {};
        if (!safeNumber(task.latitude ?? object.latitude) || !safeNumber(task.longitude ?? object.longitude)) throw new Error(`Stop zonder coördinaten: ${task.name || task.task_id}`);
        const repeatCount = task.repeat_count ?? null;
        const repeatIndex = task.repeat_index ?? null;
        return {
          route_execution_id: routeExecution.id,
          source_route_id: sourceRouteId,
          original_task_id: String(task.original_task_id || task.task_id),
          object_id: String(task.object_id),
          sequence_index: Number(task.sequence_index ?? index + 1),
          task_name: taskName(task, repeatIndex, repeatCount),
          object_name: object.name || task.object_name || task.name || 'Object',
          task_type: task.task_type || 'Taak',
          repeat_index: repeatIndex,
          repeat_count: repeatCount,
          split_index: task.split_index ?? null,
          split_count: task.split_count ?? null,
          custom_block_label: task.custom_block_label || null,
          status: 'pending',
          planned_arrival_time: task.planned_arrival_time || task.arrival_time || null,
          planned_start_time: task.planned_start_time || task.actual_start_time || null,
          planned_departure_time: task.planned_departure_time || task.departure_time || null,
          planned_arrival_seconds: secondsFromTime(task.planned_arrival_time || task.arrival_time),
          planned_departure_seconds: secondsFromTime(task.planned_departure_time || task.departure_time),
          duration_minutes: Number(task.duration_minutes || 0),
          travel_from_previous_minutes: task.travel_from_previous_minutes ?? task.travel_time_minutes ?? null,
          distance_from_previous_km: task.distance_from_previous_km ?? task.distance_km ?? null,
          travel_to_next_minutes: task.travel_to_next_minutes ?? null,
          distance_to_next_km: task.distance_to_next_km ?? null,
          latitude: safeNumber(task.latitude ?? object.latitude),
          longitude: safeNumber(task.longitude ?? object.longitude),
          address: task.address || object.address || null,
          locked_to_route: !!task.locked_to_route,
          locked_sequence: !!task.locked_sequence,
          route_pin_hard: !!task.locked_to_route,
          arrival_deadline_time: task.arrival_deadline_time || null,
          uses_arrival_deadline: !!task.uses_arrival_deadline,
          service_must_start_at: task.service_must_start_at || null,
          metadata: { optimizer_task_id: task.optimizer_task_id || null },
        };
      });
      if (taskPayloads.length) await base44.asServiceRole.entities.TaskExecution.bulkCreate(taskPayloads);
      created.push(routeExecution.id);
    }
    return Response.json({ created, blocked, server_time: nowIso() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});