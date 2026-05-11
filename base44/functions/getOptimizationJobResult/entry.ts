import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function routingBaseUrl() {
  const url = Deno.env.get('ROUTING_API_URL');
  if (!url) throw new Error('ROUTING_API_URL ontbreekt.');
  return url.trim().replace(/\/$/, '');
}

function routingApiKey() {
  const key = Deno.env.get('ROUTING_API_KEY');
  if (!key) throw new Error('ROUTING_API_KEY ontbreekt.');
  return key;
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (_error) {
    const preview = text.slice(0, 140).replace(/\s+/g, ' ').trim();
    throw new Error(`Routingserver gaf geen geldige JSON terug: ${preview}`);
  }
}

function normalizeResult(data) {
  return data?.result || data;
}

function formatSeconds(seconds) {
  const value = ((Math.round(Number(seconds) || 0) % 86400) + 86400) % 86400;
  return `${String(Math.floor(value / 3600)).padStart(2, '0')}:${String(Math.floor((value % 3600) / 60)).padStart(2, '0')}`;
}

function normalizeCompletedResult(serverResult, requestPayload = {}, debug = false) {
  const plannedResult = serverResult.best_result || {
    routes: serverResult.routes || [],
    unassigned: serverResult.unassigned || [],
    summary: serverResult.summary || {},
  };

  const routesToUse = (plannedResult.routes || []).filter(route => {
    const steps = Array.isArray(route.steps) ? route.steps.filter(step => step.type === 'task') : [];
    return steps.length > 0;
  });

  const sourceTasks = requestPayload.tasks || requestPayload.data?.tasks || [];
  const sourceObjects = requestPayload.objects || requestPayload.data?.objects || [];
  const sourceVehicles = requestPayload.vehicles || requestPayload.data?.vehicles || [];

  const taskById = new Map(sourceTasks.map(task => [String(task.id), task]));
  const objectById = new Map(sourceObjects.map(object => [String(object.id), object]));
  const vehicleById = new Map(sourceVehicles.map(vehicle => [String(vehicle.id), vehicle]));

  const routes = routesToUse.map((route, routeIndex) => {
    const taskSteps = route.steps.filter(step => step.type === 'task');
    const vehicleId = route.physical_vehicle_id || route.vehicle_id || route.vehicle?.id || null;
    const vehicle = vehicleId ? vehicleById.get(String(vehicleId)) : null;
    const routeName = route.manual_route_name || route.vehicle_name || route.license_plate || 'Route';
    const licensePlate = route.license_plate || route.vehicle?.license_plate || vehicle?.license_plate || '';
    const shiftStart = Number(route.shift_start || route.start_time_seconds || 0);
    const routeEnd = Number(route.end_time_seconds || route.shift_end || 0);

    const tasks = taskSteps.map((step, stepIndex) => {
      const taskId = step.original_task_id || step.task_id;
      const sourceTask = taskId ? (taskById.get(String(taskId)) || {}) : {};
      const object = objectById.get(String(sourceTask.object_id || step.object_id || '')) || {};
      const usesDeadline = !!step.uses_arrival_deadline || !!step.use_arrival_deadline || !!sourceTask.use_arrival_deadline;
      const arrivalSeconds = Number(step.arrival_seconds || 0);
      const serviceSeconds = Number(step.service_seconds || sourceTask.duration_minutes * 60 || 0);
      const serviceStartFromText = step.fixed_service_start_time || step.service_start_time;
      const serviceStartSeconds = usesDeadline
        ? Number(step.fixed_service_start_seconds ?? step.service_start_seconds ?? (serviceStartFromText ? Number(String(serviceStartFromText).split(':')[0] || 0) * 3600 + Number(String(serviceStartFromText).split(':')[1] || 0) * 60 : arrivalSeconds))
        : arrivalSeconds;
      const serviceEndSeconds = usesDeadline
        ? Number(step.service_end_seconds ?? (serviceStartSeconds + serviceSeconds))
        : arrivalSeconds + serviceSeconds;

      return {
        task_id: taskId ? String(taskId) : '',
        optimizer_task_id: step.task_id,
        object_id: sourceTask.object_id || step.object_id,
        name: step.name || object.name || sourceTask.task_type || 'Taak',
        address: object.address || step.address || '',
        duration_minutes: Math.round(serviceSeconds / 60),
        time_window_start: usesDeadline ? formatSeconds(serviceStartSeconds) : (sourceTask.time_window_start || ''),
        time_window_end: usesDeadline ? formatSeconds(serviceEndSeconds) : (sourceTask.time_window_end || ''),
        task_type: sourceTask.task_type,
        uses_arrival_deadline: usesDeadline,
        arrival_deadline_time: sourceTask.arrival_deadline_time || step.arrival_deadline_time || step.fixed_service_start_time || step.service_start_time || '',
        arrival_time: formatSeconds(arrivalSeconds),
        actual_start_time: formatSeconds(serviceStartSeconds),
        departure_time: formatSeconds(serviceEndSeconds),
        planned_arrival_time: usesDeadline ? formatSeconds(serviceStartSeconds) : formatSeconds(arrivalSeconds),
        planned_start_time: formatSeconds(serviceStartSeconds),
        planned_departure_time: formatSeconds(serviceEndSeconds),
        travel_time_minutes: Number(step.travel_from_previous_minutes ?? step.travel_time_minutes ?? Math.round(Number(step.travel_from_previous_seconds || step.travel_seconds || 0) / 60)),
        distance_km: Number(step.distance_from_previous_km ?? step.distance_km ?? 0),
        waiting_time: Number(step.waiting_minutes || 0),
        travel_to_next_minutes: Number(step.travel_to_next_minutes ?? Math.round(Number(step.travel_to_next_seconds || 0) / 60)),
        distance_to_next_km: Number(step.distance_to_next_km || 0),
        sequence_index: stepIndex,
      };
    }).filter(task => task.task_id);

    const totalServiceMinutes = Math.round(taskSteps.reduce((sum, step) => sum + Number(step.service_seconds || 0), 0) / 60);
    const totalTravelMinutes = Number(route.total_travel_minutes ?? Math.round(Number(route.total_travel_seconds || 0) / 60));
    const totalDistanceKm = Number(route.total_distance_km || 0);

    return {
      ...route,
      id: route.id || route.manual_route_id || `server_route_${routeIndex + 1}`,
      manual_route_id: route.manual_route_id || null,
      manual_route_name: route.manual_route_name || routeName,
      is_extra_route: !!route.is_extra_route,
      vehicle: {
        ...(route.vehicle || {}),
        ...(vehicle || {}),
        id: vehicleId ? String(vehicleId) : undefined,
        license_plate: licensePlate,
        name: routeName,
      },
      weekday: Number(route.weekday || serverResult?.display_weekday || requestPayload.display_weekday || requestPayload.weekday || 1),
      time_window_start: formatSeconds(shiftStart),
      time_window_end: formatSeconds(routeEnd),
      validation: { valid: true, errors: [] },
      tasks,
      stats: {
        total_tasks: taskSteps.length,
        total_service_minutes: totalServiceMinutes,
        total_travel_minutes: totalTravelMinutes,
        total_distance_km: totalDistanceKm,
        total_wait_minutes: taskSteps.reduce((sum, step) => sum + Number(step.waiting_minutes || 0), 0),
        total_route_minutes: Math.max(0, Math.round((routeEnd - shiftStart) / 60)),
      },
      route_cost: Number(route.route_cost || 0),
      cached_optimization: route,
    };
  }).filter(route => route.tasks.length > 0);

  const skippedTasks = (plannedResult.unassigned || []).map(item => {
    const taskId = typeof item === 'object' ? (item.original_task_id || item.task_id || item.id) : item;
    const sourceTask = taskById.get(String(taskId)) || {};
    const object = objectById.get(String(sourceTask.object_id || '')) || {};
    return {
      ...sourceTask,
      id: taskId ? String(taskId) : sourceTask.id,
      name: object.name || sourceTask.task_type || item?.name || 'Taak',
      skip_reason: item?.reason || item?.skip_reason || 'Niet ingepland door de routingserver.',
    };
  });

  const uniqueVehicles = new Set(routesToUse.map(route => route.physical_vehicle_id || route.vehicle_id || route.license_plate).filter(Boolean).map(String));
  const totalServiceMinutes = Math.round(routesToUse.reduce((sum, route) => {
    const taskSteps = Array.isArray(route.steps) ? route.steps.filter(step => step.type === 'task') : [];
    return sum + taskSteps.reduce((stepSum, step) => stepSum + Number(step.service_seconds || 0), 0);
  }, 0) / 60);
  const summary = plannedResult.summary || {};
  const tasksAssigned = Number(summary.tasks_assigned || 0);
  const tasksUnassigned = Number(summary.tasks_unassigned || 0);

  const totals = {
    total_travel_minutes: routesToUse.reduce((sum, route) => sum + Number(route.total_travel_minutes || 0), 0),
    total_service_minutes: totalServiceMinutes,
    total_wait_minutes: routes.reduce((sum, route) => sum + (route.stats?.total_wait_minutes || 0), 0),
    total_duty_minutes: routes.reduce((sum, route) => sum + (route.stats?.total_route_minutes || 0), 0),
    total_distance_km: Math.round(routesToUse.reduce((sum, route) => sum + Number(route.total_distance_km || 0), 0) * 100) / 100,
    total_cost: routes.reduce((sum, route) => sum + Number(route.route_cost || 0), 0),
  };

  return {
    planning_mode: 'eigen_routing_server',
    routes,
    skipped_tasks: skippedTasks,
    non_relevant_tasks: [],
    advice: skippedTasks.length ? [{
      type: 'server_unassigned',
      message: `${skippedTasks.length} taak(en) zijn niet ingepland.`,
      action: 'Controleer coördinaten, tijdvensters en routecapaciteit.',
    }] : [],
    horizons: [],
    totals,
    vehicle_count: uniqueVehicles.size,
    max_concurrent_routes: routes.length,
    total_tasks_input: tasksAssigned + tasksUnassigned,
    total_tasks_planned: tasksAssigned,
    total_tasks_skipped: tasksUnassigned,
    total_tasks_not_relevant: 0,
    total_routes_created: routesToUse.length,
    has_estimated_travel: false,
    server_summary: summary,
    debug_report: debug ? { best_result: plannedResult } : undefined,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const serverJobId = body.job_id || body.server_job_id;

    if (!serverJobId) {
      return Response.json({ error: 'job_id ontbreekt' }, { status: 400 });
    }

    const response = await fetch(`${routingBaseUrl()}/optimization-jobs/${serverJobId}/result`, {
      headers: { 'X-API-Key': routingApiKey() },
    });

    const data = await readJsonResponse(response);

    if (!response.ok) {
      return Response.json(data, { status: response.status });
    }

    const rawResult = normalizeResult(data);
    const jobs = await base44.asServiceRole.entities.OptimizationJob.filter({ server_job_id: serverJobId });
    const job = jobs[0];
    const result = normalizeCompletedResult(rawResult, job?.request_payload || {}, !!body.debug);

    if (job) {
      await base44.asServiceRole.entities.OptimizationJob.update(job.id, {
        status: 'completed',
        progress: 100,
        message: 'Optimalisatie voltooid',
        result,
        finished_at: data.finished_at || result?.finished_at || new Date().toISOString(),
      });
    }

    return Response.json({
      ...result,
      job_id: serverJobId,
      local_job_id: job?.id,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});