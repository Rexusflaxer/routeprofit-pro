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

const PLANNING_EVIDENCE_FIELDS = {
  planning_shift_task_segment_id: ['planning_shift_task_segment_id', 'planning_task_segment_id', 'shift_task_segment_id', 'task_segment_id'],
  planning_task_occurrence_id: ['planning_task_occurrence_id', 'task_occurrence_id'],
  planning_shift_id: ['planning_shift_id'],
};

function planningEvidenceFromSources(...sources) {
  const projection = {};
  for (const [canonicalField, aliases] of Object.entries(PLANNING_EVIDENCE_FIELDS)) {
    const values = [...new Set(sources.flatMap(source => aliases.map(alias => source?.[alias])).filter(Boolean).map(String))];
    if (values.length > 1) {
      throw new Error(`Tegenstrijdige ${canonicalField} in het optimalisatieresultaat.`);
    }
    projection[canonicalField] = values[0] || null;
  }
  return projection;
}

function exactAssignedTask(sourceRoute, taskId, step = {}) {
  const candidates = (sourceRoute?.assigned_tasks || []).filter(item => String(item.task_id) === String(taskId));
  if (candidates.length <= 1) return candidates[0] || null;
  const repeatIndex = step.repeat_index ?? step.execution_index ?? null;
  if (repeatIndex === null) return null;
  const repeatMatches = candidates.filter(item => Number(item.repeat_index) === Number(repeatIndex));
  return repeatMatches.length === 1 ? repeatMatches[0] : null;
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
  const sourceRoutes = requestPayload.routes || requestPayload.data?.routes || [];

  const taskById = new Map(sourceTasks.map(task => [String(task.id), task]));
  const objectById = new Map(sourceObjects.map(object => [String(object.id), object]));
  const vehicleById = new Map(sourceVehicles.map(vehicle => [String(vehicle.id), vehicle]));
  const routeById = new Map(sourceRoutes.map(route => [String(route.id), route]));

  const routes = routesToUse.map((route, routeIndex) => {
    const sourceRoute = route.manual_route_id ? routeById.get(String(route.manual_route_id)) : null;
    const allowedTaskTypes = sourceRoute?.allowed_task_types || route.allowed_task_types || [];
    const excludedTaskIds = (sourceRoute?.excluded_task_ids || route.excluded_task_ids || []).map(String);
    const taskSteps = route.steps.filter(step => step.type === 'task').filter(step => {
      const taskId = String(step.original_task_id || step.task_id || '');
      const sourceTask = taskById.get(taskId) || {};
      if (excludedTaskIds.includes(taskId)) return false;
      if (allowedTaskTypes.length > 0 && !allowedTaskTypes.includes(sourceTask.task_type)) return false;
      return true;
    });
    const vehicleId = route.physical_vehicle_id || route.vehicle_id || route.vehicle?.id || null;
    const vehicle = vehicleId ? vehicleById.get(String(vehicleId)) : null;
    const routeName = route.manual_route_name || route.vehicle_name || route.license_plate || 'Route';
    const licensePlate = route.license_plate || route.vehicle?.license_plate || vehicle?.license_plate || '';
    const shiftStart = Number(route.shift_start || route.start_time_seconds || 0);
    const routeEnd = Number(route.end_time_seconds || route.shift_end || 0);

    const tasks = taskSteps.map((step, stepIndex) => {
      const taskId = step.original_task_id || step.task_id;
      const sourceTask = taskId ? (taskById.get(String(taskId)) || {}) : {};
      const assignedTask = exactAssignedTask(sourceRoute, taskId, step);
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
        ...planningEvidenceFromSources(step, assignedTask, sourceTask),
        optimizer_task_id: step.task_id,
        object_id: sourceTask.object_id || step.object_id,
        name: step.name || object.name || sourceTask.task_type || 'Taak',
        address: object.address || step.address || '',
        duration_minutes: Math.round(serviceSeconds / 60),
        time_window_start: usesDeadline ? formatSeconds(serviceStartSeconds) : (sourceTask.time_window_start || ''),
        time_window_end: usesDeadline ? formatSeconds(serviceEndSeconds) : (sourceTask.time_window_end || ''),
        task_type: sourceTask.task_type,
        operating_company_id: sourceTask.operating_company_id || object.default_operating_company_id || object.operating_company_id || sourceRoute?.operating_company_id || null,
        cao_key: sourceTask.cao_key || object.cao_key || sourceRoute?.cao_key || null,
        service_function_type: sourceTask.service_function_type || object.default_service_function_type || null,
        required_cao_function_group: sourceTask.required_cao_function_group || object.default_cao_function_group || null,
        required_cao_function_level: sourceTask.required_cao_function_level || object.default_cao_function_level || null,
        required_security_role_status: sourceTask.required_security_role_status || object.default_security_role_status || null,
        performs_security_work: sourceTask.performs_security_work ?? object.default_performs_security_work ?? object.performs_security_work ?? null,
        security_work_percentage: sourceTask.security_work_percentage ?? object.default_security_work_percentage ?? object.security_work_percentage ?? null,
        works_event_or_hospitality_security: sourceTask.works_event_or_hospitality_security ?? object.default_works_event_or_hospitality_security ?? object.works_event_or_hospitality_security ?? null,
        event_hospitality_cao_applies: sourceTask.event_hospitality_cao_applies ?? object.default_event_hospitality_cao_applies ?? object.event_hospitality_cao_applies ?? null,
        works_cash_value_logistics: sourceTask.works_cash_value_logistics ?? object.default_works_cash_value_logistics ?? object.works_cash_value_logistics ?? null,
        custom_block_label: step.custom_block_label || step.execution_block_label || sourceTask.custom_execution_blocks?.[Number(step.repeat_index || step.execution_index || 1) - 1]?.label || '',
        locked_to_route: !!step.locked_to_route || !!(sourceRoute?.assigned_tasks || []).find(item => String(item.task_id) === String(taskId) && item.locked_to_route),
        excluded_from_route_names: step.excluded_from_route_names || [],
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
      operating_company_id: sourceRoute?.operating_company_id || route.operating_company_id || null,
      cao_key: sourceRoute?.cao_key || route.cao_key || null,
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
      closed_to_extra_tasks: !!route.closed_to_extra_tasks || !!sourceRoute?.closed_to_extra_tasks,
      allowed_task_types: allowedTaskTypes,
      excluded_task_ids: excludedTaskIds,
      task_type_filter_enabled: allowedTaskTypes.length > 0,
      route_exclusions_enabled: excludedTaskIds.length > 0,
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
    meta: serverResult.meta || plannedResult.meta || {},
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
      await base44.asServiceRole.functions.invoke('createRouteExecutionsFromOptimization', {
        plannedResult: result,
        optimization_job_id: job.id,
        service_date: body.service_date || null,
        force_overwrite: !!body.force_overwrite,
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

export { exactAssignedTask, normalizeCompletedResult, planningEvidenceFromSources };
