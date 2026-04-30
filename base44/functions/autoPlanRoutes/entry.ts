import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const WEEKDAY_LABELS = { 1: 'Maandag', 2: 'Dinsdag', 3: 'Woensdag', 4: 'Donderdag', 5: 'Vrijdag', 6: 'Zaterdag', 7: 'Zondag' };
const MAX_SHIFT_MINUTES = 600;
const DEFAULT_EVENING_START = '18:00';
const DEFAULT_NIGHT_END = '06:00';

function timeToMinutes(time) {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes) {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function normalizeWindow(start, end) {
  const startMinutes = timeToMinutes(start || DEFAULT_EVENING_START);
  let endMinutes = timeToMinutes(end || DEFAULT_NIGHT_END);
  if (endMinutes <= startMinutes) endMinutes += 1440;
  return { startMinutes, endMinutes };
}

function distanceKm(a, b) {
  if (!a?.latitude || !a?.longitude || !b?.latitude || !b?.longitude) return 0;
  let lat1 = a.latitude;
  let lon1 = a.longitude;
  let lat2 = b.latitude;
  let lon2 = b.longitude;
  if (lat1 < lon1) [lat1, lon1] = [lon1, lat1];
  if (lat2 < lon2) [lat2, lon2] = [lon2, lat2];
  const toRad = (value) => value * Math.PI / 180;
  const radius = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function travelMinutes(a, b) {
  return Math.max(3, Math.round((distanceKm(a, b) / 38) * 60));
}

function nextDateForWeekday(weekday) {
  const jsDay = weekday === 7 ? 0 : weekday;
  const date = new Date();
  let delta = jsDay - date.getDay();
  if (delta <= 0) delta += 7;
  date.setDate(date.getDate() + delta);
  return date.toISOString().split('T')[0];
}

function getTaskLocation(task, objects) {
  if (task.object_id) return objects.find(object => object.id === task.object_id);
  const selectedId = task.selected_object_ids?.[0];
  return selectedId ? objects.find(object => object.id === selectedId) : null;
}

function applyException(task, exceptions, weekday) {
  const targetDate = nextDateForWeekday(weekday);
  const exception = exceptions.find(item => item.task_id === task.id && item.is_active !== false && (
    (item.scope === 'permanent' && (!item.weekday || item.weekday === weekday)) ||
    (item.scope === 'one_time' && item.date === targetDate)
  ));
  if (!exception) return task;
  if (exception.is_cancelled) return null;
  return {
    ...task,
    time_window_start: exception.time_window_start || task.time_window_start,
    time_window_end: exception.time_window_end || task.time_window_end,
    duration_minutes: exception.duration_minutes || task.duration_minutes,
    planning_exception_note: exception.notes || null
  };
}

function simulateRoute(tasks, startLocation) {
  if (tasks.length === 0) return null;
  const firstStart = Math.min(...tasks.map(task => task.startMinutes));
  let currentTime = firstStart;
  let currentLocation = startLocation || tasks[0].location;
  let totalTravel = 0;
  let totalDistance = 0;

  for (const task of tasks) {
    const travel = travelMinutes(currentLocation, task.location);
    const dist = distanceKm(currentLocation, task.location);
    const arrival = currentTime + travel;
    const actualStart = Math.max(arrival, task.startMinutes);
    const departure = actualStart + task.duration;
    if (arrival > task.endMinutes || departure > task.endMinutes) return null;
    totalTravel += travel;
    totalDistance += dist;
    currentTime = departure;
    currentLocation = task.location;
  }

  const shiftStart = Math.min(firstStart, tasks[0].startMinutes);
  const shiftMinutes = currentTime - shiftStart;
  if (shiftMinutes > MAX_SHIFT_MINUTES) return null;
  return { shiftStart, shiftEnd: currentTime, shiftMinutes, totalTravel, totalDistance };
}

function canAddTask(routeTasks, task, startLocation) {
  const candidateTasks = [...routeTasks, task].sort((a, b) => a.endMinutes - b.endMinutes || a.startMinutes - b.startMinutes);
  const simulation = simulateRoute(candidateTasks, startLocation);
  return simulation ? { tasks: candidateTasks, simulation } : null;
}

function adviceForTask(task, vehiclesCount, routesUsed) {
  if (!task.location) return 'Vul coördinaten/adresgegevens aan voor dit object zodat reistijd kan worden berekend.';
  if (routesUsed >= vehiclesCount) return 'Er zijn op deze dag geen voertuigen meer beschikbaar. Voeg een extra voertuig toe of verplaats/verbreed het tijdvenster.';
  if ((task.endMinutes - task.startMinutes) < task.duration) return 'Het tijdvenster is korter dan de taakduur. Verbreed het tijdvenster of verkort de taakduur.';
  return 'Verbreed het tijdvenster, verplaats deze taak naar een rustiger moment of voeg extra voertuigcapaciteit toe.';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const [tasks, objects, vehicles, offices, folders, routes, exceptions] = await Promise.all([
      base44.entities.Task.list(),
      base44.entities.SurveillanceObject.list(),
      base44.entities.Vehicle.list(),
      base44.entities.Office.list(),
      base44.entities.RouteFolder.list(),
      base44.entities.Route.list(),
      base44.entities.TaskPlanningException.list()
    ]);

    const activeVehicles = vehicles.filter(vehicle => vehicle.is_active !== false);
    if (activeVehicles.length === 0) return Response.json({ error: 'Geen actieve voertuigen gevonden.' }, { status: 400 });

    let folder = folders.find(item => item.name === 'Automatisch gepland');
    if (!folder) {
      folder = await base44.entities.RouteFolder.create({
        name: 'Automatisch gepland',
        description: 'Routes die automatisch door de planner zijn aangemaakt',
        color: 'green'
      });
    }

    const oldAutoRoutes = routes.filter(route => route.is_auto_generated === true || route.route_group === 'automatisch_gepland');
    await Promise.all(oldAutoRoutes.map(route => base44.entities.Route.delete(route.id)));

    const startLocation = offices[0] || objects[0] || null;
    const createdRoutes = [];
    const unplanned = [];
    const daySummaries = [];

    for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
      const dayTasks = tasks
        .filter(task => (task.weekdays || []).includes(weekday))
        .map(task => applyException(task, exceptions, weekday))
        .filter(Boolean)
        .map(task => {
          const location = getTaskLocation(task, objects);
          const { startMinutes, endMinutes } = normalizeWindow(task.time_window_start, task.time_window_end);
          return {
            task,
            taskId: task.id,
            name: task.task_type,
            location,
            startMinutes,
            endMinutes,
            duration: task.duration_minutes || 0
          };
        })
        .sort((a, b) => a.endMinutes - b.endMinutes || b.duration - a.duration);

      const routePlans = [];
      for (const plannedTask of dayTasks) {
        if (!plannedTask.location) {
          unplanned.push({ weekday, task_id: plannedTask.taskId, task_type: plannedTask.name, reason: 'Geen locatie gevonden', advice: adviceForTask(plannedTask, activeVehicles.length, routePlans.length) });
          continue;
        }

        let bestRouteIndex = -1;
        let bestCandidate = null;
        for (let index = 0; index < routePlans.length; index++) {
          const candidate = canAddTask(routePlans[index].tasks, plannedTask, startLocation);
          if (!candidate) continue;
          if (!bestCandidate || candidate.simulation.shiftMinutes < bestCandidate.simulation.shiftMinutes) {
            bestRouteIndex = index;
            bestCandidate = candidate;
          }
        }

        if (bestCandidate) {
          routePlans[bestRouteIndex] = { ...routePlans[bestRouteIndex], ...bestCandidate };
          continue;
        }

        if (routePlans.length < activeVehicles.length) {
          const candidate = canAddTask([], plannedTask, startLocation);
          if (candidate) {
            routePlans.push({ vehicle: activeVehicles[routePlans.length], ...candidate });
          } else {
            unplanned.push({ weekday, task_id: plannedTask.taskId, task_type: plannedTask.name, reason: 'Past niet binnen eigen tijdvenster of maximale dienstduur', advice: adviceForTask(plannedTask, activeVehicles.length, routePlans.length) });
          }
        } else {
          unplanned.push({ weekday, task_id: plannedTask.taskId, task_type: plannedTask.name, reason: 'Maximaal aantal voertuigen bereikt', advice: adviceForTask(plannedTask, activeVehicles.length, routePlans.length) });
        }
      }

      for (let index = 0; index < routePlans.length; index++) {
        const plan = routePlans[index];
        const routeData = {
          name: `${WEEKDAY_LABELS[weekday]} route ${index + 1}`,
          folder_id: folder.id,
          assigned_tasks: plan.tasks.map(item => ({ task_id: item.taskId, days: [weekday] })),
          start_location_id: startLocation?.id || '',
          end_location_id: startLocation?.id || '',
          vehicle_id: plan.vehicle.id,
          time_window_start: minutesToTime(plan.simulation.shiftStart),
          time_window_end: minutesToTime(plan.simulation.shiftEnd),
          weekdays: [weekday],
          alarm_standby: false,
          is_auto_generated: true,
          route_group: 'automatisch_gepland',
          planning_day: weekday,
          planning_status: 'gepland',
          planning_warnings: plan.simulation.shiftMinutes > 480 ? ['Dienst is langer dan 8 uur, maar blijft onder de maximale 10 uur.'] : [],
          total_service_minutes: plan.tasks.reduce((sum, item) => sum + item.duration, 0),
          total_route_minutes: Math.round(plan.simulation.shiftMinutes),
          total_distance_km: Math.round(plan.simulation.totalDistance * 10) / 10,
          avg_travel_minutes: plan.tasks.length > 1 ? Math.round(plan.simulation.totalTravel / (plan.tasks.length - 1)) : Math.round(plan.simulation.totalTravel),
          notes: 'Automatisch aangemaakt door de routeplanner.'
        };
        const created = await base44.entities.Route.create(routeData);
        createdRoutes.push(created);
      }

      daySummaries.push({ weekday, routes: routePlans.length, tasks_planned: routePlans.reduce((sum, route) => sum + route.tasks.length, 0) });
    }

    return Response.json({
      folder_id: folder.id,
      routes_created: createdRoutes.length,
      vehicles_available: activeVehicles.length,
      max_shift_minutes: MAX_SHIFT_MINUTES,
      day_summaries: daySummaries,
      unplanned,
      created_route_ids: createdRoutes.map(route => route.id),
      message: `${createdRoutes.length} automatische routes aangemaakt.`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});