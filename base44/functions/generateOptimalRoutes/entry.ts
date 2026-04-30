import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const GENERATED_MARKER = '[AUTO_PLANNING]';
const WEEKDAY_NAMES = { 1: 'Maandag', 2: 'Dinsdag', 3: 'Woensdag', 4: 'Donderdag', 5: 'Vrijdag', 6: 'Zaterdag', 7: 'Zondag' };
const ROUTE_TEMPLATES = [
  { key: 'avond-1', name: 'Avondroute 1', folder: 'Avondroutes', color: 'amber', start: '18:00', end: '00:00' },
  { key: 'avond-2', name: 'Avondroute 2', folder: 'Avondroutes', color: 'amber', start: '18:00', end: '00:00' },
  { key: 'nacht', name: 'Nachtroute', folder: 'Nachtroute', color: 'blue', start: '00:00', end: '07:00' },
];

function timeToMinutes(time) {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function absoluteEnd(start, end) {
  let endMinutes = timeToMinutes(end);
  if (endMinutes <= start) endMinutes += 24 * 60;
  return endMinutes;
}

function overlapsWindow(task, start, end) {
  const routeStart = timeToMinutes(start);
  const routeEnd = absoluteEnd(routeStart, end);
  const taskStart = timeToMinutes(task.time_window_start || start);
  let taskEnd = timeToMinutes(task.time_window_end || end);
  if (taskEnd <= taskStart) taskEnd += 24 * 60;
  const candidates = [taskStart - 24 * 60, taskStart, taskStart + 24 * 60].map((candidateStart) => ({
    start: candidateStart,
    end: candidateStart + (taskEnd - taskStart),
  }));
  return candidates.some(window => window.start < routeEnd && window.end > routeStart);
}

function isNightTask(task) {
  const start = timeToMinutes(task.time_window_start || '18:00');
  const end = timeToMinutes(task.time_window_end || '23:59');
  return start < 7 * 60 || end <= 8 * 60 || (task.time_window_end && task.time_window_end <= task.time_window_start);
}

function distanceKm(a, b) {
  if (!a || !b) return 0;
  const lat1 = Number(a.latitude);
  const lon1 = Number(a.longitude);
  const lat2 = Number(b.latitude);
  const lon2 = Number(b.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 0;
  const r = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function fixCoords(obj) {
  if (!obj) return obj;
  const lat = obj.latitude;
  const lng = obj.longitude;
  if (lat !== undefined && lng !== undefined && lat < lng) return { ...obj, latitude: lng, longitude: lat };
  return obj;
}

function splitEveningTasks(tasks) {
  if (tasks.length <= 1) return [tasks, []];
  let seedA = tasks[0];
  let seedB = tasks[1];
  let maxDistance = -1;
  for (const a of tasks) {
    for (const b of tasks) {
      const d = distanceKm(a.location, b.location);
      if (d > maxDistance) {
        maxDistance = d;
        seedA = a;
        seedB = b;
      }
    }
  }
  const clusters = [[], []];
  for (const task of tasks) {
    const dA = distanceKm(task.location, seedA.location);
    const dB = distanceKm(task.location, seedB.location);
    clusters[dA <= dB ? 0 : 1].push(task);
  }
  return clusters;
}

function applyOverrides(task, overrides, planningDate) {
  const override = overrides.find(item => item.task_id === task.id && item.is_active !== false && item.effective_date === planningDate);
  if (!override) return task;
  return {
    ...task,
    time_window_start: override.time_window_start || task.time_window_start,
    time_window_end: override.time_window_end || task.time_window_end,
    duration_minutes: override.duration_minutes || task.duration_minutes,
    _override_reason: override.reason || 'Eenmalige wijziging',
  };
}

async function ensureFolder(base44, folders, name, color) {
  const existing = folders.find(folder => folder.name === name);
  if (existing) return existing;
  return base44.entities.RouteFolder.create({ name, color, description: `${GENERATED_MARKER} Automatisch aangemaakt voor optimale routeplanning` });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { planning_date } = await req.json();
    const planningDate = planning_date || new Date().toISOString().split('T')[0];
    const targetJsDay = new Date(`${planningDate}T12:00:00`).getDay();
    const targetWeekday = targetJsDay === 0 ? 7 : targetJsDay;

    const [routes, folders, tasksRaw, objectsRaw, collectiefs, offices, vehiclesRaw, overrides] = await Promise.all([
      base44.entities.Route.list(),
      base44.entities.RouteFolder.list(),
      base44.entities.Task.list(),
      base44.entities.SurveillanceObject.list(),
      base44.entities.Collectief.list(),
      base44.entities.Office.list(),
      base44.entities.Vehicle.list(),
      base44.entities.TaskOverride.list(),
    ]);

    const vehicles = vehiclesRaw.filter(vehicle => vehicle.is_active !== false);
    const warnings = [];
    if (vehicles.length < 2) warnings.push('Er zijn minder dan 2 actieve voertuigen beschikbaar; avondroutes kunnen dan niet tegelijk worden gereden.');

    const objects = objectsRaw.map(fixCoords);
    const defaultLocation = fixCoords(offices[0]) || objects[0] || null;
    const avondFolder = await ensureFolder(base44, folders, 'Avondroutes', 'amber');
    const nachtFolder = await ensureFolder(base44, [...folders, avondFolder], 'Nachtroute', 'blue');

    const oldGeneratedRoutes = routes.filter(route => (route.notes || '').includes(GENERATED_MARKER) && (route.weekdays || []).includes(targetWeekday));
    await Promise.all(oldGeneratedRoutes.map(route => base44.entities.Route.delete(route.id)));

    const tasksForDay = tasksRaw
      .filter(task => (task.weekdays || []).includes(targetWeekday))
      .map(task => applyOverrides(task, overrides, planningDate));

    const expandedTasks = [];
    for (const task of tasksForDay) {
      if (task.collectief_id && (task.selected_object_ids || []).length > 0) {
        const selectedObjects = (task.selected_object_ids || []).map(id => objects.find(obj => obj.id === id)).filter(Boolean);
        const durationPerObject = Math.max(1, Math.round((task.duration_minutes || 0) / Math.max(selectedObjects.length, 1)));
        selectedObjects.forEach((object, index) => expandedTasks.push({ ...task, id: `${task.id}_${index}`, original_task_id: task.id, duration_minutes: durationPerObject, location: object }));
      } else {
        const location = objects.find(obj => obj.id === task.object_id);
        if (!location) {
          warnings.push(`Taak ${task.task_type} heeft geen object met coördinaten en is overgeslagen.`);
        } else {
          expandedTasks.push({ ...task, original_task_id: task.id, location });
        }
      }
    }

    const nightTasks = expandedTasks.filter(task => isNightTask(task) || overlapsWindow(task, '00:00', '07:00'));
    const eveningTasks = expandedTasks.filter(task => !nightTasks.includes(task));
    const [eveningA, eveningB] = splitEveningTasks(eveningTasks);
    const buckets = { 'avond-1': eveningA, 'avond-2': eveningB, nacht: nightTasks };

    const createdRoutes = [];
    const routeFolders = { 'avond-1': avondFolder.id, 'avond-2': avondFolder.id, nacht: nachtFolder.id };

    for (const template of ROUTE_TEMPLATES) {
      const routeTasks = buckets[template.key] || [];
      if (routeTasks.length === 0) continue;

      const assignedTasksByOriginalId = new Map();
      for (const task of routeTasks) {
        const taskId = task.original_task_id || task.id;
        assignedTasksByOriginalId.set(taskId, { task_id: taskId, days: [targetWeekday] });
      }

      const vehicle = vehicles[template.key === 'avond-2' ? 1 : 0] || vehicles[0];
      const route = await base44.entities.Route.create({
        name: `${template.name} ${WEEKDAY_NAMES[targetWeekday]}`,
        folder_id: routeFolders[template.key],
        assigned_tasks: Array.from(assignedTasksByOriginalId.values()),
        start_location_id: defaultLocation?.id || '',
        end_location_id: defaultLocation?.id || '',
        vehicle_id: vehicle?.id || '',
        time_window_start: template.start,
        time_window_end: template.end,
        weekdays: [targetWeekday],
        alarm_standby: false,
        notes: `${GENERATED_MARKER} Automatisch berekend op ${new Date().toISOString()} voor ${planningDate}. ${routeTasks.some(task => task._override_reason) ? 'Bevat eenmalige taakaanpassing.' : ''}`,
      });
      createdRoutes.push(route);
    }

    const optimizationResults = [];
    for (const route of createdRoutes) {
      try {
        const response = await base44.functions.invoke('optimizeRoute', { route_id: route.id, force_recalculate: true });
        optimizationResults.push(response.data);
        if (response.data?.tasks_skipped > 0) {
          warnings.push(`${route.name}: ${response.data.tasks_skipped} taak/taken passen niet in het tijdvenster.`);
        }
      } catch (error) {
        warnings.push(`${route.name}: optimalisatie kon niet volledig worden uitgevoerd (${error.message}).`);
      }
    }

    const plannedTaskIds = new Set(createdRoutes.flatMap(route => (route.assigned_tasks || []).map(item => item.task_id)));
    const tasksUnplanned = tasksForDay.filter(task => !plannedTaskIds.has(task.id)).length;

    return Response.json({
      planning_date: planningDate,
      weekday: targetWeekday,
      routes_created: createdRoutes.length,
      tasks_planned: plannedTaskIds.size,
      tasks_unplanned: tasksUnplanned,
      route_names: createdRoutes.map(route => route.name),
      optimization_results: optimizationResults,
      warnings,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});