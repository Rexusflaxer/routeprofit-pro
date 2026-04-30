import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const WEEKDAY_LABELS = { 1: 'Maandag', 2: 'Dinsdag', 3: 'Woensdag', 4: 'Donderdag', 5: 'Vrijdag', 6: 'Zaterdag', 7: 'Zondag' };
const AUTO_FOLDER_NAME = 'Automatische planning';

function parseMinutes(time) {
  if (!time) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function formatMinutes(minutes) {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayFromDate(dateStr) {
  const day = new Date(`${dateStr}T12:00:00`).getDay();
  return day === 0 ? 7 : day;
}

function normalizeWindow(start, end) {
  const startMin = parseMinutes(start || '00:00');
  let endMin = parseMinutes(end || '23:59');
  if (endMin <= startMin) endMin += 1440;
  return { startMin, endMin };
}

function validPoint(item) {
  if (!item) return false;
  const lat = Number(item.latitude);
  const lng = Number(item.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function fixCoords(obj) {
  if (!obj) return null;
  const lat = Number(obj.latitude);
  const lng = Number(obj.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < lng) return { ...obj, latitude: lng, longitude: lat };
  return { ...obj, latitude: lat, longitude: lng };
}

function averagePoint(items) {
  const valid = items.map(fixCoords).filter(validPoint);
  if (valid.length === 0) return null;
  return {
    latitude: valid.reduce((sum, item) => sum + item.latitude, 0) / valid.length,
    longitude: valid.reduce((sum, item) => sum + item.longitude, 0) / valid.length,
    address: valid[0].address,
  };
}

function applyAdjustment(task, adjustment) {
  if (!adjustment) return task;
  return {
    ...task,
    time_window_start: adjustment.time_window_start || task.time_window_start,
    time_window_end: adjustment.time_window_end || task.time_window_end,
    duration_minutes: adjustment.duration_minutes || task.duration_minutes,
    adjustment_id: adjustment.id,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const startDate = payload.start_date || new Date().toISOString().slice(0, 10);
    const horizonDays = Math.min(Math.max(Number(payload.horizon_days || 7), 1), 31);
    const maxShiftMinutes = Math.min(Math.max(Number(payload.max_shift_hours || 10), 4), 12) * 60;
    const targetShiftMinutes = Math.min(Math.max(Number(payload.target_shift_hours || 8), 4), maxShiftMinutes / 60) * 60;

    const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!googleMapsApiKey) return Response.json({ error: 'Google Maps API key ontbreekt' }, { status: 500 });

    const [tasks, objects, collectiefs, vehicles, offices, folders, existingRoutes, adjustments] = await Promise.all([
      base44.entities.Task.list(),
      base44.entities.SurveillanceObject.list(),
      base44.entities.Collectief.list(),
      base44.entities.Vehicle.list(),
      base44.entities.Office.list(),
      base44.entities.RouteFolder.list(),
      base44.entities.Route.list(),
      base44.entities.TaskAdjustment.list(),
    ]);

    const activeVehicles = vehicles.filter(vehicle => vehicle.is_active !== false);
    if (activeVehicles.length === 0) {
      return Response.json({ error: 'Er zijn geen actieve voertuigen beschikbaar.' }, { status: 400 });
    }

    let autoFolder = folders.find(folder => folder.name === AUTO_FOLDER_NAME);
    if (!autoFolder) {
      autoFolder = await base44.asServiceRole.entities.RouteFolder.create({
        name: AUTO_FOLDER_NAME,
        description: 'Automatisch aangemaakte routes per datum op basis van taken, voertuigen en tijdvensters.',
        color: 'blue'
      });
    }

    const oldAutoRoutes = existingRoutes.filter(route => route.folder_id === autoFolder.id || route.generated_by === 'auto_planner');
    await Promise.all(oldAutoRoutes.map(route => base44.asServiceRole.entities.Route.delete(route.id)));

    const office = offices.map(fixCoords).find(validPoint) || null;
    const fallbackStart = office;
    const objectsById = new Map(objects.map(object => [object.id, object]));
    const collectiefsById = new Map(collectiefs.map(collectief => [collectief.id, collectief]));
    const travelCache = new Map();

    const getTravel = async (from, to) => {
      if (!validPoint(from) || !validPoint(to)) return { minutes: 0, km: 0 };
      const key = `${from.latitude},${from.longitude}->${to.latitude},${to.longitude}`;
      if (travelCache.has(key)) return travelCache.get(key);
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${from.latitude},${from.longitude}&destination=${to.latitude},${to.longitude}&key=${googleMapsApiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status !== 'OK' || !data.routes?.length) return { minutes: 15, km: 0 };
      const leg = data.routes[0].legs?.[0];
      const result = {
        minutes: Math.max(1, Math.round((leg?.duration?.value || 900) / 60)),
        km: Math.round(((leg?.distance?.value || 0) / 1000) * 10) / 10,
      };
      travelCache.set(key, result);
      return result;
    };

    const getTaskPoint = (task) => {
      if (task.object_id) return fixCoords(objectsById.get(task.object_id));
      const collectief = collectiefsById.get(task.collectief_id);
      const objectIds = new Set(task.selected_object_ids || collectief?.object_ids || []);
      (task.selected_sub_collectief_ids || []).forEach(subId => {
        const sub = collectiefsById.get(subId);
        (sub?.object_ids || []).forEach(objectId => objectIds.add(objectId));
      });
      return averagePoint(Array.from(objectIds).map(id => objectsById.get(id)).filter(Boolean));
    };

    const createdRoutes = [];
    const unplannedTasks = [];
    const dailySummaries = [];
    const batchId = crypto.randomUUID();

    for (let dayOffset = 0; dayOffset < horizonDays; dayOffset++) {
      const date = addDays(startDate, dayOffset);
      const weekday = weekdayFromDate(date);
      const activeAdjustments = adjustments.filter(item => item.is_active !== false && item.mode === 'one_time' && item.date === date);
      const adjustmentByTaskId = new Map(activeAdjustments.map(item => [item.task_id, item]));

      const dayTasks = tasks
        .filter(task => (task.weekdays || []).includes(weekday) || adjustmentByTaskId.has(task.id))
        .map(task => applyAdjustment(task, adjustmentByTaskId.get(task.id)))
        .map(task => {
          const point = getTaskPoint(task);
          const { startMin, endMin } = normalizeWindow(task.time_window_start || '00:00', task.time_window_end || '23:59');
          return {
            task,
            task_id: task.id,
            name: task.task_type,
            point,
            duration: Number(task.duration_minutes || 0),
            startMin,
            endMin,
          };
        })
        .filter(item => item.duration > 0)
        .sort((a, b) => a.endMin - b.endMin || a.startMin - b.startMin);

      const routesForDay = [];

      for (const item of dayTasks) {
        if (!validPoint(item.point)) {
          unplannedTasks.push({
            date,
            weekday: WEEKDAY_LABELS[weekday],
            task_id: item.task_id,
            task_type: item.task.task_type,
            reason: 'Geen geldige locatie/coördinaten gevonden.',
            advice: 'Controleer het adres en de coördinaten van het object of collectief.'
          });
          continue;
        }

        let bestCandidate = null;
        for (let index = 0; index < routesForDay.length; index++) {
          const route = routesForDay[index];
          const travelToTask = await getTravel(route.lastPoint, item.point);
          const returnTravel = await getTravel(item.point, route.startPoint);
          const arrival = route.currentEnd + travelToTask.minutes;
          const actualStart = Math.max(arrival, item.startMin);
          const departure = actualStart + item.duration;
          const routeEndWithReturn = departure + returnTravel.minutes;
          const shiftLength = routeEndWithReturn - route.routeStart;
          if (departure > item.endMin || shiftLength > maxShiftMinutes) continue;
          const addedMinutes = routeEndWithReturn - route.routeEndWithReturn;
          const targetPenalty = routeEndWithReturn - route.routeStart > targetShiftMinutes ? 30 : 0;
          const score = addedMinutes + targetPenalty;
          if (!bestCandidate || score < bestCandidate.score) {
            bestCandidate = { index, travelToTask, returnTravel, actualStart, departure, routeEndWithReturn, score };
          }
        }

        if (bestCandidate) {
          const route = routesForDay[bestCandidate.index];
          route.tasks.push(item);
          route.currentEnd = bestCandidate.departure;
          route.routeEndWithReturn = bestCandidate.routeEndWithReturn;
          route.lastPoint = item.point;
          route.totalTravel += bestCandidate.travelToTask.minutes + bestCandidate.returnTravel.minutes;
          route.totalDistance += bestCandidate.travelToTask.km + bestCandidate.returnTravel.km;
          continue;
        }

        if (routesForDay.length < activeVehicles.length) {
          const startPoint = fallbackStart || item.point;
          const travelToFirst = await getTravel(startPoint, item.point);
          const returnTravel = await getTravel(item.point, startPoint);
          const firstStart = Math.max(item.startMin, travelToFirst.minutes);
          const routeStart = Math.max(0, firstStart - travelToFirst.minutes);
          const departure = firstStart + item.duration;
          const routeEndWithReturn = departure + returnTravel.minutes;
          if (departure <= item.endMin && routeEndWithReturn - routeStart <= maxShiftMinutes) {
            routesForDay.push({
              vehicle: activeVehicles[routesForDay.length],
              tasks: [item],
              routeStart,
              currentEnd: departure,
              routeEndWithReturn,
              startPoint,
              lastPoint: item.point,
              totalTravel: travelToFirst.minutes + returnTravel.minutes,
              totalDistance: travelToFirst.km + returnTravel.km,
            });
          } else {
            unplannedTasks.push({
              date,
              weekday: WEEKDAY_LABELS[weekday],
              task_id: item.task_id,
              task_type: item.task.task_type,
              reason: `Taak past niet binnen het tijdvenster of maximale dienstduur van ${maxShiftMinutes / 60} uur.`,
              advice: 'Verbreed het tijdvenster, verkort de taakduur of plan deze taak als aparte uitzondering.'
            });
          }
          continue;
        }

        unplannedTasks.push({
          date,
          weekday: WEEKDAY_LABELS[weekday],
          task_id: item.task_id,
          task_type: item.task.task_type,
          reason: `Alle ${activeVehicles.length} beschikbare voertuigen/routes zitten vol of passen niet binnen de tijdvensters.`,
          advice: 'Verbreed het tijdvenster, voeg een extra voertuig toe, of verplaats minder urgente taken naar een andere route/dag.'
        });
      }

      for (let index = 0; index < routesForDay.length; index++) {
        const planned = routesForDay[index];
        const assignedTasks = Array.from(new Set(planned.tasks.map(item => item.task_id))).map(taskId => ({ task_id: taskId, days: [weekday] }));
        const serviceMinutes = planned.tasks.reduce((sum, item) => sum + item.duration, 0);
        const routeData = {
          name: `${WEEKDAY_LABELS[weekday]} ${date} - Route ${index + 1}`,
          folder_id: autoFolder.id,
          assigned_tasks: assignedTasks,
          start_location_id: office?.id || '',
          end_location_id: office?.id || '',
          vehicle_id: planned.vehicle.id,
          time_window_start: formatMinutes(planned.routeStart),
          time_window_end: formatMinutes(planned.routeEndWithReturn),
          weekdays: [weekday],
          planned_date: date,
          generated_by: 'auto_planner',
          planning_batch_id: batchId,
          total_service_minutes: serviceMinutes,
          total_route_minutes: Math.round(planned.routeEndWithReturn - planned.routeStart),
          total_distance_km: Math.round(planned.totalDistance * 10) / 10,
          avg_travel_minutes: assignedTasks.length > 1 ? Math.round(planned.totalTravel / Math.max(assignedTasks.length - 1, 1)) : Math.round(planned.totalTravel),
          planning_summary: {
            task_count: assignedTasks.length,
            vehicle: planned.vehicle.license_plate,
            date,
            max_shift_hours: maxShiftMinutes / 60,
          },
          notes: 'AUTO_PLANNED: automatisch aangemaakt door routeplanner.'
        };
        const created = await base44.asServiceRole.entities.Route.create(routeData);
        createdRoutes.push(created);
      }

      dailySummaries.push({
        date,
        weekday: WEEKDAY_LABELS[weekday],
        routes_created: routesForDay.length,
        tasks_planned: routesForDay.reduce((sum, route) => sum + route.tasks.length, 0),
        tasks_unplanned: unplannedTasks.filter(item => item.date === date).length,
      });
    }

    return Response.json({
      batch_id: batchId,
      folder_id: autoFolder.id,
      routes_created: createdRoutes.length,
      max_routes_per_day: activeVehicles.length,
      daily_summaries: dailySummaries,
      unplanned_tasks: unplannedTasks,
      advice: unplannedTasks.length > 0
        ? 'Niet alle taken konden logisch worden ingepland. Bekijk per taak het advies en verbreed waar nodig tijdvensters of voeg capaciteit toe.'
        : 'Alle taken zijn ingepland binnen de beschikbare voertuigen en maximale dienstduur.'
    });
  } catch (error) {
    console.error('autoGenerateRoutes error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});