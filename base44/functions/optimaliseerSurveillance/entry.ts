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
    route.time_window_end
  );
  const depot = fixCoords(offices[0]);
  const source = manualRoutes.length ? manualRoutes : activeVehicles;

  return source.map((item, index) => {
    const route = manualRoutes.length ? item : null;
    const vehicle = route ? (activeVehicles.find(v => v.id === route.vehicle_id) || activeVehicles[index % activeVehicles.length]) : item;
    const startDepot = locationById(route?.start_location_id || vehicle?.startDepotLocationId, objects, offices) || depot;
    const endDepot = locationById(route?.end_location_id || vehicle?.eindDepotLocationId, objects, offices) || startDepot;
    const shiftStart = parseTimeToSeconds(route?.time_window_start, 0);
    let shiftEnd = parseTimeToSeconds(route?.time_window_end, 86340);
    if (shiftEnd <= shiftStart) shiftEnd += 86400;

    return {
      id: index + 1,
      name: route?.name || vehicle?.license_plate || vehicle?.name || `Voertuig ${index + 1}`,
      start_lon: startDepot?.longitude,
      start_lat: startDepot?.latitude,
      end_lon: endDepot?.longitude,
      end_lat: endDepot?.latitude,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      skills: [1],
      _vehicle: vehicle,
      _manualRoute: route,
    };
  }).filter(vehicle => Number.isFinite(vehicle.start_lat) && Number.isFinite(vehicle.start_lon));
}

function buildTasksForDay(day, tasks, objects) {
  const optimizerTasks = [];
  const skipped = [];
  let numericId = 1;

  const addTask = (task, objectId, suffix = '') => {
    const object = fixCoords(objects.find(item => item.id === objectId));
    if (!object) {
      skipped.push({ ...task, name: task.task_type || 'Taak', skip_reason: 'Geen bruikbare coördinaten gevonden.' });
      return;
    }
    const serviceSeconds = Math.max(60, Number(task.duration_minutes || 15) * 60);
    const windowStart = parseTimeToSeconds(task.time_window_start, 0);
    let windowEnd = parseTimeToSeconds(task.time_window_end, 86340);
    if (windowEnd <= windowStart) windowEnd += 86400;
    optimizerTasks.push({
      id: numericId++,
      name: object.name || task.task_type || 'Taak',
      lon: object.longitude,
      lat: object.latitude,
      service_seconds: serviceSeconds,
      window_start: windowStart,
      window_end: windowEnd,
      priority: 80,
      skills: [1],
      _task: task,
      _object: object,
      _originalTaskId: task.id,
      _instanceId: `${task.id}${suffix}`,
    });
  };

  for (const task of tasks) {
    const days = task.weekdays || [];
    if (days.length && !days.includes(day)) continue;

    if (task.collectief_id && task.selected_object_ids?.length) {
      for (const objectId of task.selected_object_ids) addTask(task, objectId, `_${objectId}`);
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
    const routeTasks = (route.steps || []).filter(step => step.type === 'task').map((step, stepIndex) => {
      const source = taskById.get(step.task_id) || {};
      plannedTaskIds.add(step.task_id);
      const arrivalSeconds = Number(step.arrival_seconds || 0);
      const serviceSeconds = Number(step.service_seconds || source.service_seconds || 0);
      return {
        task_id: source._originalTaskId || String(step.task_id),
        object_id: source._object?.id,
        name: step.name || source.name || 'Taak',
        address: source._object?.address || '',
        duration_minutes: Math.round(serviceSeconds / 60),
        time_window_start: formatSeconds(source.window_start || 0),
        time_window_end: formatSeconds(source.window_end || 86340),
        task_type: source._task?.task_type,
        arrival_time: step.arrival_time || formatSeconds(arrivalSeconds),
        actual_start_time: step.arrival_time || formatSeconds(arrivalSeconds),
        departure_time: formatSeconds(arrivalSeconds + serviceSeconds),
        travel_time_minutes: 0,
        distance_km: 0,
        waiting_time: 0,
        sequence_index: stepIndex,
        placement_explanation: 'Gepland door eigen routing server.',
      };
    });

    const totalServiceMinutes = routeTasks.reduce((sum, task) => sum + (task.duration_minutes || 0), 0);
    const travelMinutes = Math.round(Number(route.total_travel_seconds || 0) / 60);

    return {
      id: vehicle._manualRoute?.id || `server_route_${day}_${routeIndex + 1}`,
      candidate_id: vehicle._manualRoute?.id || `server_route_${day}_${routeIndex + 1}`,
      manual_route_id: vehicle._manualRoute?.id || null,
      manual_route_name: vehicle._manualRoute?.name || null,
      vehicle: vehicle._vehicle || { name: vehicle.name },
      weekday: day,
      time_window_start: formatSeconds(vehicle.shift_start || 0),
      time_window_end: formatSeconds(route.end_time_seconds || vehicle.shift_end || 0),
      route_cost: 0,
      validation: { valid: true, errors: [] },
      tasks: routeTasks,
      optimized_order: routeTasks,
      total_route_time: totalServiceMinutes + travelMinutes,
      total_travel_time: travelMinutes,
      total_service_time: totalServiceMinutes,
      total_distance_km: 0,
      tasks_skipped: 0,
      stats: {
        total_tasks: routeTasks.length,
        total_service_minutes: totalServiceMinutes,
        total_travel_minutes: travelMinutes,
        total_distance_km: 0,
        total_wait_minutes: 0,
        total_route_minutes: totalServiceMinutes + travelMinutes,
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
    total_wait_minutes: 0,
    total_distance_km: 0,
    total_cost: 0,
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
      const { optimizerTasks, skipped } = buildTasksForDay(weekday, tasks, objects);
      if (!routingVehicles.length) throw new Error('Geen bruikbare voertuigen of depots gevonden.');

      const serverResult = optimizerTasks.length
        ? await callRoutingServer({ max_solver_seconds: body.max_solver_seconds || 30, vehicles: routingVehicles, tasks: optimizerTasks })
        : { routes: [], unassigned: [], summary: { tasks_received: 0, tasks_assigned: 0, tasks_unassigned: 0 } };
      perDay.push(mapServerResult(serverResult, weekday, routingVehicles, optimizerTasks, skipped));
    }

    const routesOut = perDay.flatMap(day => day.routes || []);
    const skippedTasks = perDay.flatMap(day => day.skipped_tasks || []);
    const totals = {
      total_travel_minutes: perDay.reduce((sum, day) => sum + (day.totals?.total_travel_minutes || 0), 0),
      total_service_minutes: perDay.reduce((sum, day) => sum + (day.totals?.total_service_minutes || 0), 0),
      total_wait_minutes: 0,
      total_distance_km: 0,
      total_cost: 0,
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