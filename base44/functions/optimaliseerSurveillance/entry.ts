import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const WEEKDAY_LABELS = { 1: 'Maandag', 2: 'Dinsdag', 3: 'Woensdag', 4: 'Donderdag', 5: 'Vrijdag', 6: 'Zaterdag', 7: 'Zondag' };

function parseTimeToSeconds(time, fallback = 0) {
  if (!time) return fallback;
  const [hours, minutes] = String(time).split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  return (hours * 3600) + (minutes * 60);
}

function formatSeconds(seconds) {
  const value = ((Math.round(seconds) % 86400) + 86400) % 86400;
  return `${String(Math.floor(value / 3600)).padStart(2, '0')}:${String(Math.floor((value % 3600) / 60)).padStart(2, '0')}`;
}

function fixCoords(location) {
  if (!location) return null;
  const lat = Number(location.latitude);
  const lon = Number(location.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < lon && lon > 40) return { ...location, latitude: lon, longitude: lat };
  return { ...location, latitude: lat, longitude: lon };
}

function r2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function getVehicleCostProfile(vehicle = {}) {
  return {
    cost_per_km: Number(vehicle.kostenPerKm ?? vehicle.fuel_cost_per_km ?? 0.35),
    cost_per_minute: Number(vehicle.kostenPerMinuutVoertuig ?? 0.12),
    fixed_cost: Number(vehicle.vasteKostenPerRoute ?? 8),
  };
}

function calculateRouteCost(route, routingVehicle) {
  const profile = getVehicleCostProfile(routingVehicle?._vehicle || routingVehicle);
  const distanceKm = Number(route.total_distance_km ?? (Number(route.total_distance_meters || 0) / 1000));
  const startSeconds = Number(route.start_time_seconds ?? routingVehicle?.shift_start ?? 0);
  const endSeconds = Number(route.end_time_seconds ?? routingVehicle?.shift_end ?? startSeconds);
  const routeMinutes = Math.max(0, Math.round((endSeconds - startSeconds) / 60));
  const travelMinutes = Math.round(Number(route.total_travel_seconds || 0) / 60);
  const paidMinutes = Math.max(routeMinutes, travelMinutes);
  return r2(profile.fixed_cost + (distanceKm * profile.cost_per_km) + (paidMinutes * profile.cost_per_minute));
}

function locationById(id, objects, offices) {
  return fixCoords(objects.find(item => item.id === id) || offices.find(item => item.id === id));
}

function buildVehiclesForDay(day, routes, vehicles, objects, offices) {
  const activeVehicles = vehicles.filter(vehicle => vehicle.is_active !== false);
  const manualRoutes = routes.filter(route =>
    (route.weekdays || []).includes(day) &&
    (route.source || 'manual') === 'manual' &&
    route.status !== 'vergrendeld' &&
    route.time_window_start &&
    (route.flexible_end_time || route.time_window_end)
  );
  const depot = fixCoords(offices[0]);
  const usedVehicleIds = new Set(manualRoutes.map(route => route.vehicle_id).filter(Boolean));
  const extraVehicles = activeVehicles.filter(vehicle => !usedVehicleIds.has(vehicle.id));
  const manualWindows = manualRoutes.map(route => {
    const start = parseTimeToSeconds(route.time_window_start, 0);
    let end = route.flexible_end_time
      ? start + Math.min(Number(route.max_route_minutes || 600), 600) * 60
      : parseTimeToSeconds(route.time_window_end, start + 43200);
    if (!route.flexible_end_time && end <= start) end += 86400;
    return { start, end };
  });
  const fallbackStart = manualWindows.length ? Math.min(...manualWindows.map(window => window.start)) : 0;
  const fallbackEnd = manualWindows.length ? Math.min(Math.max(...manualWindows.map(window => window.end)), fallbackStart + 600 * 60) : fallbackStart + 600 * 60;
  const source = [
    ...manualRoutes.map(route => ({ route, vehicle: activeVehicles.find(v => v.id === route.vehicle_id) })),
    ...extraVehicles.map(vehicle => ({ route: null, vehicle })),
  ];

  return source.map((item, index) => {
    const route = item.route;
    const vehicle = item.vehicle || activeVehicles[index % activeVehicles.length];
    const startDepot = locationById(route?.start_location_id || vehicle?.startDepotLocationId, objects, offices) || depot;
    const endDepot = locationById(route?.end_location_id || vehicle?.eindDepotLocationId, objects, offices) || startDepot;
    const shiftStart = route ? parseTimeToSeconds(route.time_window_start, 0) : fallbackStart;
    let shiftEnd = route
      ? (route.flexible_end_time
        ? shiftStart + Math.min(Number(route.max_route_minutes || 600), 600) * 60
        : parseTimeToSeconds(route.time_window_end, shiftStart + 43200))
      : fallbackEnd;
    if (route && !route.flexible_end_time && shiftEnd <= shiftStart) shiftEnd += 86400;

    return {
      id: index + 1,
      name: route?.name || vehicle?.license_plate || vehicle?.name || `Extra route ${index + 1}`, 
      start_lon: startDepot?.longitude,
      start_lat: startDepot?.latitude,
      end_lon: endDepot?.longitude,
      end_lat: endDepot?.latitude,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      skills: [1],
      ...getVehicleCostProfile(vehicle),
      _vehicle: vehicle,
      _manualRoute: route,
      _startDepot: startDepot,
      _endDepot: endDepot,
    };
  }).filter(vehicle => Number.isFinite(vehicle.start_lat) && Number.isFinite(vehicle.start_lon));
}

function normalizeTaskWindowForVehicles(windowStart, windowEnd, vehicles) {
  let normalizedEnd = windowEnd;
  if (normalizedEnd <= windowStart) normalizedEnd += 86400;

  const candidates = [
    { start: windowStart, end: normalizedEnd },
    { start: windowStart + 86400, end: normalizedEnd + 86400 },
  ];

  return candidates
    .map(candidate => ({
      ...candidate,
      overlap: vehicles.reduce((sum, vehicle) => {
        const overlap = Math.min(candidate.end, vehicle.shift_end) - Math.max(candidate.start, vehicle.shift_start);
        return sum + Math.max(0, overlap);
      }, 0),
    }))
    .sort((a, b) => b.overlap - a.overlap)[0];
}

function normalizeDeadlineWindowForVehicles(deadlineSeconds, serviceSeconds, vehicles, latestDepartureSeconds = null) {
  const candidates = [0, 86400]
    .map(offset => {
      const deadline = deadlineSeconds + offset;
      let end = Number.isFinite(latestDepartureSeconds)
        ? latestDepartureSeconds + offset
        : deadline + serviceSeconds;
      if (end <= deadline) end += 86400;
      if (end < deadline + serviceSeconds) end = deadline + serviceSeconds;

      return {
        start: deadline,
        end,
        deadline,
        overlap: vehicles.reduce((sum, vehicle) => {
          const overlap = Math.min(end, vehicle.shift_end) - Math.max(deadline, vehicle.shift_start);
          return sum + Math.max(0, overlap);
        }, 0),
      };
    })
    .sort((a, b) => b.overlap - a.overlap);

  return candidates[0];
}

function automaticSplitCount(task, durationMinutes) {
  if (!task.allow_split) return 1;
  if (durationMinutes < 60) return 1;
  return Math.min(4, Math.max(2, Math.ceil(durationMinutes / 60)));
}

function buildTasksForDay(day, tasks, objects, vehicles) {
  const optimizerTasks = [];
  const skipped = [];
  let numericId = 1;

  const addTask = (task, objectId, suffix = '', durationOverrideMinutes = null) => {
    const object = fixCoords(objects.find(item => item.id === objectId));
    if (!object) {
      skipped.push({ ...task, name: task.task_type || 'Taak', skip_reason: 'Geen bruikbare coördinaten gevonden.' });
      return;
    }

    const repeatCount = Math.max(1, Math.floor(Number(task.repeat_count || 1)));
    const baseDuration = Number(durationOverrideMinutes ?? task.duration_minutes ?? 15);
    const splitCount = automaticSplitCount(task, baseDuration);
    const serviceSeconds = Math.max(60, Math.ceil((baseDuration * 60) / splitCount));
    const minGapSeconds = Math.max(0, Number(task.min_minutes_between_visits || 0) * 60);
    const usesArrivalDeadline = task.task_type === 'Sluitbegeleiding' || !!task.use_arrival_deadline;
    const inferredDeadline = usesArrivalDeadline ? (task.arrival_deadline_time || task.time_window_start || task.time_window_end) : '';
    const windowStart = parseTimeToSeconds(task.time_window_start, 0);
    const windowEnd = parseTimeToSeconds(task.time_window_end, 86340);
    const latestDeparture = usesArrivalDeadline && task.latest_departure_time
      ? parseTimeToSeconds(task.latest_departure_time, NaN)
      : NaN;
    const normalizedWindow = usesArrivalDeadline
      ? normalizeDeadlineWindowForVehicles(parseTimeToSeconds(inferredDeadline, 86340), serviceSeconds, vehicles, latestDeparture)
      : normalizeTaskWindowForVehicles(windowStart, windowEnd, vehicles);
    const windowLength = Math.max(serviceSeconds, normalizedWindow.end - normalizedWindow.start);
    const totalGapSeconds = repeatCount > 1 ? (repeatCount - 1) * (minGapSeconds + serviceSeconds) : 0;
    const availableRepeatWindow = Math.max(serviceSeconds * repeatCount, windowLength - totalGapSeconds);
    const repeatSegment = repeatCount > 1 ? Math.max(serviceSeconds, Math.floor(availableRepeatWindow / repeatCount)) : windowLength;
    const repeatStep = repeatCount > 1 ? repeatSegment + minGapSeconds + serviceSeconds : repeatSegment;

    for (let repeatIndex = 1; repeatIndex <= repeatCount; repeatIndex++) {
      const repeatStart = repeatCount > 1 ? normalizedWindow.start + ((repeatIndex - 1) * repeatStep) : normalizedWindow.start;
      const repeatEnd = repeatCount > 1
        ? Math.min(normalizedWindow.end, repeatStart + repeatSegment)
        : normalizedWindow.end;

      for (let splitIndex = 1; splitIndex <= splitCount; splitIndex++) {
        const repeatLabel = repeatCount > 1 ? ` (${repeatIndex}/${repeatCount})` : '';
        const splitLabel = splitCount > 1 ? ` deel ${splitIndex}/${splitCount}` : '';
        const splitSegment = splitCount > 1 ? Math.max(serviceSeconds, Math.floor((repeatEnd - repeatStart) / splitCount)) : (repeatEnd - repeatStart);
        const splitStart = splitCount > 1 ? repeatStart + ((splitIndex - 1) * splitSegment) : repeatStart;
        const splitEnd = splitCount > 1 ? Math.min(repeatEnd, repeatStart + (splitIndex * splitSegment)) : repeatEnd;
        optimizerTasks.push({
          id: numericId++,
          name: `${object.name || task.task_type || 'Taak'}${repeatLabel}${splitLabel}`,
          lon: object.longitude,
          lat: object.latitude,
          service_seconds: serviceSeconds,
          window_start: splitStart,
          window_end: splitEnd,
          priority: usesArrivalDeadline ? 1000000 : 500000,
          skills: [1],
          _task: task,
          _object: object,
          _originalTaskId: task.id,
          _instanceId: `${task.id}${suffix}_r${repeatIndex}_p${splitIndex}`,
          _repeatIndex: repeatIndex,
          _repeatCount: repeatCount,
          _splitIndex: splitIndex,
          _splitCount: splitCount,
          _usesArrivalDeadline: usesArrivalDeadline,
          _arrivalDeadlineTime: inferredDeadline || '',
        });
      }
    }
  };

  for (const task of tasks) {
    const days = task.weekdays || [];
    if (days.length && !days.includes(day)) continue;

    if (task.collectief_id && task.selected_object_ids?.length) {
      const durationPerObject = Math.max(1, Number(task.duration_minutes || 15) / task.selected_object_ids.length);
      for (const objectId of task.selected_object_ids) addTask(task, objectId, `_${objectId}`, durationPerObject);
    } else if (task.object_id) {
      addTask(task, task.object_id);
    } else {
      skipped.push({ ...task, name: task.task_type || 'Taak', skip_reason: 'Deze taak heeft geen gekoppeld object.' });
    }
  }

  return { optimizerTasks, skipped };
}

async function callRoutingServer(payload) {
  const routingApiUrl = Deno.env.get('ROUTING_API_URL');
  const routingApiKey = Deno.env.get('ROUTING_API_KEY');
  if (!routingApiUrl || !routingApiKey) throw new Error('Routing API secrets ontbreken.');

  const response = await fetch(`${routingApiUrl.trim().replace(/\/$/, '')}/optimize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${routingApiKey}`,
      'X-API-Key': routingApiKey,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data?.error || data?.message || JSON.stringify(data) || 'Routing server gaf een fout terug.');
  return data;
}

function mapServerResult(serverResult, day, vehicles, optimizerTasks, preSkipped) {
  const taskById = new Map(optimizerTasks.map(task => [task.id, task]));
  const plannedTaskIds = new Set();

  const routes = (serverResult.routes || []).map((route, routeIndex) => {
    const vehicle = vehicles.find(item => item.id === route.vehicle_id) || vehicles[routeIndex] || {};
    const taskSteps = (route.steps || []).filter(step => step.type === 'task');
    const routeTasks = taskSteps.map((step, stepIndex) => {
      const source = taskById.get(step.task_id) || {};
      plannedTaskIds.add(step.task_id);
      const previousStep = taskSteps[stepIndex - 1];
      const previousSource = previousStep ? (taskById.get(previousStep.task_id) || {}) : null;
      const arrivalSeconds = Number(step.arrival_seconds || 0);
      const serviceSeconds = Number(step.service_seconds || source.service_seconds || 0);
      const previousArrival = previousStep ? Number(previousStep.arrival_seconds || 0) : null;
      const previousService = previousStep ? Number(previousStep.service_seconds || previousSource?.service_seconds || 0) : 0;
      const startTravelSeconds = Number(step.travel_seconds || step.travel_time_seconds || step.travel_to_next_seconds || 0);
      const travelSeconds = previousStep ? Number(previousStep.travel_to_next_seconds || 0) : startTravelSeconds;
      const waitingSeconds = previousStep
        ? Math.max(0, arrivalSeconds - previousArrival - previousService - travelSeconds)
        : Math.max(0, arrivalSeconds - (vehicle.shift_start || 0) - travelSeconds);
      return {
        task_id: source._originalTaskId || String(step.task_id),
        object_id: source._object?.id,
        name: step.name || source.name || 'Taak',
        address: source._object?.address || '',
        duration_minutes: Math.round(serviceSeconds / 60),
        time_window_start: source._usesArrivalDeadline ? (source._task?.time_window_start || formatSeconds(source.window_start || 0)) : formatSeconds(source.window_start || 0),
        time_window_end: source._usesArrivalDeadline ? (source._task?.latest_departure_time || source._task?.time_window_end || formatSeconds(source.window_end || 86340)) : formatSeconds(source.window_end || 86340),
        task_type: source._task?.task_type,
        repeat_index: source._repeatIndex,
        repeat_count: source._repeatCount,
        split_index: source._splitIndex,
        split_part_count: source._splitCount,
        is_split_part: (source._splitCount || 1) > 1,
        uses_arrival_deadline: source._usesArrivalDeadline,
        arrival_deadline_time: source._arrivalDeadlineTime,
        arrival_time: formatSeconds(arrivalSeconds),
        actual_start_time: formatSeconds(arrivalSeconds),
        departure_time: formatSeconds(arrivalSeconds + serviceSeconds),
        travel_time_minutes: Math.round(travelSeconds / 60),
        distance_km: previousStep ? Number(previousStep.distance_to_next_km || 0) : Number(step.distance_km || step.travel_distance_km || 0),
        waiting_time: Math.round(waitingSeconds / 60),
        travel_to_next_minutes: Number(step.travel_to_next_minutes ?? Math.round(Number(step.travel_to_next_seconds || 0) / 60)),
        distance_to_next_km: Number(step.distance_to_next_km || 0),
        sequence_index: stepIndex,
        placement_explanation: 'Gepland door eigen routing server.',
      };
    });

    const startLocation = vehicle._manualRoute?._startDepot || null;
    const endLocation = vehicle._manualRoute?._endDepot || null;
    const firstTask = routeTasks[0];
    const lastTask = routeTasks[routeTasks.length - 1];
    const firstArrivalSeconds = firstTask ? parseTimeToSeconds(firstTask.arrival_time, 0) + (firstTask.arrival_time < formatSeconds(vehicle.shift_start || 0) ? 86400 : 0) : null;
    const firstTravelSeconds = firstTask ? (firstTask.travel_time_minutes || 0) * 60 : 0;
    const startDepartureSeconds = firstTask ? Math.max(vehicle.shift_start || 0, firstArrivalSeconds - firstTravelSeconds) : (vehicle.shift_start || 0);
    const startBlock = startLocation ? {
      name: `START: ${startLocation.name || 'Startlocatie'}`,
      address: startLocation.address || '',
      is_start: true,
      arrival_time: formatSeconds(vehicle.shift_start || 0),
      actual_start_time: formatSeconds(vehicle.shift_start || 0),
      departure_time: formatSeconds(startDepartureSeconds),
      travel_to_next_minutes: firstTask?.travel_time_minutes || 0,
      distance_to_next_km: firstTask?.distance_km || 0,
      waiting_time: Math.max(0, Math.round((startDepartureSeconds - (vehicle.shift_start || 0)) / 60)),
    } : null;
    const endBlock = endLocation ? {
      name: `EIND: ${endLocation.name || 'Eindlocatie'}`,
      address: endLocation.address || '',
      is_end: true,
      arrival_time: lastTask?.departure_time || formatSeconds(route.end_time_seconds || vehicle.shift_end || 0),
      actual_start_time: lastTask?.departure_time || formatSeconds(route.end_time_seconds || vehicle.shift_end || 0),
      departure_time: formatSeconds(route.end_time_seconds || vehicle.shift_end || 0),
      travel_time_minutes: lastTask?.travel_to_next_minutes || 0,
      distance_km: lastTask?.distance_to_next_km || 0,
      waiting_time: 0,
    } : null;
    const optimizedOrder = [startBlock, ...routeTasks, endBlock].filter(Boolean);
    const totalServiceMinutes = routeTasks.reduce((sum, task) => sum + (task.duration_minutes || 0), 0);
    const travelMinutes = Math.round(Number(route.total_travel_seconds || 0) / 60);
    const totalDistanceKm = Number(route.total_distance_km ?? ((Number(route.total_distance_meters || 0) / 1000).toFixed(2)));
    const totalWaitMinutes = routeTasks.reduce((sum, task) => sum + (task.waiting_time || 0), 0);
    const routeCost = calculateRouteCost(route, vehicle);

    return {
      id: vehicle._manualRoute?.id || `server_route_${day}_${routeIndex + 1}`,
      candidate_id: vehicle._manualRoute?.id || `server_route_${day}_${routeIndex + 1}`,
      manual_route_id: vehicle._manualRoute?.id || null,
      manual_route_name: vehicle._manualRoute?.name || null,
      vehicle: vehicle._vehicle || { name: vehicle.name },
      weekday: day,
      time_window_start: formatSeconds(vehicle.shift_start || 0),
      time_window_end: formatSeconds(route.end_time_seconds || vehicle.shift_end || 0),
      flexible_end_time: !!vehicle._manualRoute?.flexible_end_time,
      max_route_minutes: vehicle._manualRoute?.max_route_minutes || null,
      route_cost: routeCost,
      validation: { valid: true, errors: [] },
      tasks: routeTasks,
      optimized_order: optimizedOrder,
      total_route_time: totalServiceMinutes + travelMinutes + totalWaitMinutes,
      total_travel_time: travelMinutes,
      total_service_time: totalServiceMinutes,
      total_distance_km: totalDistanceKm,
      tasks_skipped: 0,
      stats: {
        total_tasks: routeTasks.length,
        total_service_minutes: totalServiceMinutes,
        total_travel_minutes: travelMinutes,
        total_distance_km: totalDistanceKm,
        total_wait_minutes: totalWaitMinutes,
        total_route_minutes: totalServiceMinutes + travelMinutes + totalWaitMinutes,
        has_estimated_travel: false,
      },
    };
  });

  const serverUnassigned = (serverResult.unassigned || []).map(item => {
    const taskId = typeof item === 'object' ? item.task_id || item.id : item;
    const source = taskById.get(taskId) || {};
    return { ...source._task, name: source.name || 'Taak', skip_reason: 'Niet ingepland door de routing server.' };
  });
  const notVisited = optimizerTasks
    .filter(task => !plannedTaskIds.has(task.id) && !serverUnassigned.some(skipped => skipped.id === task._originalTaskId))
    .map(task => ({ ...task._task, name: task.name, skip_reason: 'Niet ingepland door de routing server.' }));
  const skippedTasks = [...preSkipped, ...serverUnassigned, ...notVisited];

  const totals = {
    total_travel_minutes: routes.reduce((sum, route) => sum + route.stats.total_travel_minutes, 0),
    total_service_minutes: routes.reduce((sum, route) => sum + route.stats.total_service_minutes, 0),
    total_wait_minutes: routes.reduce((sum, route) => sum + route.stats.total_wait_minutes, 0),
    total_distance_km: Math.round(routes.reduce((sum, route) => sum + route.stats.total_distance_km, 0) * 100) / 100,
    total_cost: r2(routes.reduce((sum, route) => sum + (route.route_cost || 0), 0)),
  };

  return {
    planning_mode: 'eigen_routing_server',
    google_route_optimization: false,
    manual_routes_used: routes.some(route => route.manual_route_id),
    routes,
    skipped_tasks: skippedTasks,
    non_relevant_tasks: [],
    advice: skippedTasks.length ? [{ type: 'server_unassigned', message: `${skippedTasks.length} taak(en) zijn niet ingepland.`, action: 'Controleer coördinaten, tijdvensters en routecapaciteit.' }] : [],
    horizons: [],
    totals,
    vehicle_count: vehicles.length,
    max_concurrent_routes: routes.length,
    total_tasks_input: optimizerTasks.length,
    total_tasks_planned: routes.reduce((sum, route) => sum + route.tasks.length, 0),
    total_tasks_skipped: skippedTasks.length,
    total_tasks_not_relevant: 0,
    total_routes_created: routes.length,
    has_estimated_travel: false,
    server_summary: serverResult.summary,
  };
}

async function savePlannedRoutes(base44, plannedResult, weekdays) {
  const folders = await base44.entities.RouteFolder.list();
  let folderId = folders[0]?.id;
  if (!folderId) {
    const folder = await base44.asServiceRole.entities.RouteFolder.create({ name: 'Eigen routing server', color: 'blue' });
    folderId = folder.id;
  }

  for (const weekday of weekdays) {
    const dayRoutes = (plannedResult.routes || []).filter(route => !route.weekday || Number(route.weekday) === Number(weekday));
    for (let index = 0; index < dayRoutes.length; index++) {
      const route = dayRoutes[index];
      const routeData = {
        folder_id: folderId,
        vehicle_id: route.vehicle?.id || null,
        weekdays: [weekday],
        assigned_tasks: route.tasks.filter(task => task.task_id).map((task, taskIndex) => ({
          task_id: task.task_id,
          days: [weekday],
          sequence_index: taskIndex,
          locked_sequence: true,
          planned_arrival_time: task.arrival_time,
          planned_start_time: task.actual_start_time,
          planned_departure_time: task.departure_time,
        })),
        total_service_minutes: route.stats.total_service_minutes,
        total_distance_km: route.stats.total_distance_km,
        total_route_minutes: route.stats.total_route_minutes,
        status: 'geoptimaliseerd',
        flexible_end_time: !!route.flexible_end_time,
        max_route_minutes: route.max_route_minutes || null,
        cached_optimization: route,
        optimization_calculated_at: new Date().toISOString(),
      };

      if (route.manual_route_id) {
        await base44.asServiceRole.entities.Route.update(route.manual_route_id, routeData);
      } else if (route.tasks.length) {
        await base44.asServiceRole.entities.Route.create({
          ...routeData,
          name: `${WEEKDAY_LABELS[weekday]} - server route ${index + 1}`,
          time_window_start: route.time_window_start,
          time_window_end: route.time_window_end,
          source: 'automatic',
        });
      }
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    if (body.vehicles && body.tasks) return Response.json(await callRoutingServer(body));

    const weekdays = body.weekdays ?? (body.weekday ? [body.weekday] : [1]);
    const saveRoutes = !!body.save_routes;
    const plannedResult = body.planned_result || null;

    if (saveRoutes && plannedResult) {
      await savePlannedRoutes(base44, plannedResult, weekdays);
      return Response.json({ ...plannedResult, saved: true });
    }

    const [tasks, objects, vehicles, offices, routes] = await Promise.all([
      base44.entities.Task.list(),
      base44.entities.SurveillanceObject.list(),
      base44.entities.Vehicle.list(),
      base44.entities.Office.list(),
      base44.entities.Route.list(),
    ]);

    const perDay = [];
    for (const weekday of weekdays) {
      const routingVehicles = buildVehiclesForDay(weekday, routes, vehicles, objects, offices);
      const { optimizerTasks, skipped } = buildTasksForDay(weekday, tasks, objects, routingVehicles);
      if (!routingVehicles.length) throw new Error('Geen bruikbare voertuigen of depots gevonden.');

      const serverResult = optimizerTasks.length
        ? await callRoutingServer({
            max_solver_seconds: body.max_solver_seconds || 60,
            objective: 'minimize_total_shift_duration',
            primary_optimization_goal: 'minimize_total_service_duration',
            vehicles: routingVehicles.map(vehicle => ({
              ...vehicle,
              fixed_cost: 0,
              cost_per_km: 0,
              cost_per_minute: 1,
            })),
            tasks: optimizerTasks,
          })
        : { routes: [], unassigned: [], summary: { tasks_received: 0, tasks_assigned: 0, tasks_unassigned: 0 } };
      perDay.push(mapServerResult(serverResult, weekday, routingVehicles, optimizerTasks, skipped));
    }

    const routesOut = perDay.flatMap(day => day.routes || []);
    const skippedTasks = perDay.flatMap(day => day.skipped_tasks || []);
    const totals = {
      total_travel_minutes: perDay.reduce((sum, day) => sum + (day.totals?.total_travel_minutes || 0), 0),
      total_service_minutes: perDay.reduce((sum, day) => sum + (day.totals?.total_service_minutes || 0), 0),
      total_wait_minutes: perDay.reduce((sum, day) => sum + (day.totals?.total_wait_minutes || 0), 0),
      total_distance_km: Math.round(perDay.reduce((sum, day) => sum + (day.totals?.total_distance_km || 0), 0) * 100) / 100,
      total_cost: r2(perDay.reduce((sum, day) => sum + (day.totals?.total_cost || 0), 0)),
    };

    return Response.json({
      planning_mode: 'eigen_routing_server',
      google_route_optimization: false,
      manual_routes_used: routesOut.some(route => route.manual_route_id),
      routes: routesOut,
      skipped_tasks: skippedTasks,
      non_relevant_tasks: [],
      advice: skippedTasks.length ? [{ type: 'server_unassigned', message: `${skippedTasks.length} taak(en) zijn niet ingepland.`, action: 'Controleer coördinaten, tijdvensters en routecapaciteit.' }] : [],
      horizons: [],
      totals,
      vehicle_count: vehicles.filter(vehicle => vehicle.is_active !== false).length,
      max_concurrent_routes: routesOut.length,
      total_tasks_input: perDay.reduce((sum, day) => sum + day.total_tasks_input, 0),
      total_tasks_planned: routesOut.reduce((sum, route) => sum + route.tasks.length, 0),
      total_tasks_skipped: skippedTasks.length,
      total_tasks_not_relevant: 0,
      total_routes_created: routesOut.length,
      has_estimated_travel: false,
      weekdays,
      generated_at: new Date().toISOString(),
      saved: false,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});