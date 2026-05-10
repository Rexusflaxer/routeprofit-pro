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

function normalizeCompletedResult(rawResult, requestPayload = {}) {
  if (rawResult?.totals && Array.isArray(rawResult?.routes)) return rawResult;

  const solverResult = rawResult?.best?.result || rawResult?.result || rawResult;
  const summary = solverResult?.summary || {};
  const sourceTasks = requestPayload.tasks || requestPayload.data?.tasks || [];
  const sourceObjects = requestPayload.objects || requestPayload.data?.objects || [];
  const sourceVehicles = requestPayload.vehicles || requestPayload.data?.vehicles || [];

  const taskById = new Map(sourceTasks.map(task => [task.id, task]));
  const objectById = new Map(sourceObjects.map(object => [object.id, object]));
  const vehicleById = new Map(sourceVehicles.map(vehicle => [vehicle.id, vehicle]));

  const routes = (solverResult?.routes || []).map((route, routeIndex) => {
    const vehicle = vehicleById.get(route.vehicle_id) || { id: route.vehicle_id, license_plate: route.vehicle_name, name: route.vehicle_name };
    const taskSteps = (route.steps || []).filter(step => step.type === 'task');

    const tasks = taskSteps.map((step, stepIndex) => {
      const sourceTask = taskById.get(step.task_id) || {};
      const object = objectById.get(sourceTask.object_id) || {};
      const arrivalSeconds = Number(step.arrival_seconds || 0);
      const serviceSeconds = Number(step.service_seconds || 0);

      return {
        task_id: step.task_id,
        optimizer_task_id: step.task_id,
        object_id: sourceTask.object_id,
        name: step.name || sourceTask.task_type || 'Taak',
        address: object.address || '',
        duration_minutes: Math.round(serviceSeconds / 60),
        time_window_start: sourceTask.time_window_start || '',
        time_window_end: sourceTask.time_window_end || '',
        task_type: sourceTask.task_type,
        arrival_time: step.arrival_time || formatSeconds(arrivalSeconds),
        actual_start_time: step.arrival_time || formatSeconds(arrivalSeconds),
        departure_time: formatSeconds(arrivalSeconds + serviceSeconds),
        travel_time_minutes: Number(step.travel_from_previous_minutes ?? step.travel_time_minutes ?? 0),
        distance_km: Number(step.distance_from_previous_km ?? step.distance_km ?? 0),
        waiting_time: 0,
        travel_to_next_minutes: Number(step.travel_to_next_minutes || 0),
        distance_to_next_km: Number(step.distance_to_next_km || 0),
        sequence_index: stepIndex,
      };
    });

    const totalServiceMinutes = tasks.reduce((sum, task) => sum + (task.duration_minutes || 0), 0);
    const totalTravelMinutes = Number(route.total_travel_minutes ?? Math.round(Number(route.total_travel_seconds || 0) / 60));
    const totalDistanceKm = Number(route.total_distance_km ?? (Number(route.total_distance_meters || 0) / 1000));
    const startTime = tasks[0]?.arrival_time || '18:00';
    const endTime = route.end_time || (route.end_time_seconds ? formatSeconds(route.end_time_seconds) : startTime);

    return {
      id: route.id || route.vehicle_id || `server_route_${routeIndex + 1}`,
      vehicle,
      time_window_start: startTime,
      time_window_end: endTime,
      validation: { valid: true, errors: [] },
      tasks,
      stats: {
        total_tasks: tasks.length,
        total_service_minutes: totalServiceMinutes,
        total_travel_minutes: totalTravelMinutes,
        total_distance_km: Math.round(totalDistanceKm * 100) / 100,
        total_wait_minutes: 0,
        total_route_minutes: totalServiceMinutes + totalTravelMinutes,
      },
      route_cost: 0,
    };
  });

  const unassigned = solverResult?.unassigned || rawResult?.best?.unassigned || [];
  const skippedTasks = unassigned.map(item => {
    const taskId = typeof item === 'object' ? (item.task_id || item.id) : item;
    const sourceTask = taskById.get(taskId) || {};
    const object = objectById.get(sourceTask.object_id) || {};
    return {
      ...sourceTask,
      name: object.name || sourceTask.task_type || 'Taak',
      skip_reason: item?.reason || 'Niet ingepland door de routingserver.',
    };
  });

  const totals = {
    total_travel_minutes: Number(summary.total_travel_minutes || 0),
    total_service_minutes: routes.reduce((sum, route) => sum + route.stats.total_service_minutes, 0),
    total_wait_minutes: 0,
    total_duty_minutes: routes.reduce((sum, route) => sum + route.stats.total_route_minutes, 0),
    total_distance_km: Number(summary.total_distance_km || 0),
    total_cost: 0,
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
    vehicle_count: Number(summary.vehicles || routes.length || 0),
    max_concurrent_routes: routes.length,
    total_tasks_input: Number(summary.tasks_received || 0),
    total_tasks_planned: Number(summary.tasks_assigned || routes.reduce((sum, route) => sum + route.tasks.length, 0)),
    total_tasks_skipped: Number(summary.tasks_unassigned || skippedTasks.length),
    total_tasks_not_relevant: 0,
    total_routes_created: routes.length,
    has_estimated_travel: false,
    server_summary: summary,
    raw_result: rawResult,
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
    const result = normalizeCompletedResult(rawResult, job?.request_payload || {});

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