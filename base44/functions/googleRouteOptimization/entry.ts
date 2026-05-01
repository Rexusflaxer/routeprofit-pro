import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

function base64UrlEncode(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToArrayBuffer(pem) {
  const clean = pem.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: GOOGLE_SCOPE,
    aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64UrlEncode(signature)}`;

  const tokenResponse = await fetch(serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) throw new Error(tokenData.error_description || tokenData.error || 'Google token ophalen mislukt');
  return tokenData.access_token;
}

function parseTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = String(timeStr).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function formatTimeFromIso(iso) {
  if (!iso) return '';
  return String(iso).slice(11, 16);
}

function secondsFromDuration(value) {
  if (!value) return 0;
  const match = String(value).match(/([0-9.]+)s/);
  return match ? Number(match[1]) : 0;
}

function r2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function withRateLimitRetry(action, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (error?.status !== 429 || attempt === retries) throw error;
      await sleep(750 * (attempt + 1));
    }
  }
}

function fixCoords(obj) {
  if (!obj) return obj;
  const lat = Number(obj.latitude);
  const lng = Number(obj.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return obj;
  if (lat < lng && lng > 40) return { ...obj, latitude: lng, longitude: lat };
  return { ...obj, latitude: lat, longitude: lng };
}

function dateForWeekday(weekday) {
  const now = new Date();
  const jsDay = now.getUTCDay() || 7;
  const diff = (weekday - jsDay + 7) % 7;
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
  return date.toISOString().slice(0, 10);
}

function isoForMinute(date, minute) {
  const dayOffset = Math.floor(minute / 1440);
  const minuteOfDay = ((minute % 1440) + 1440) % 1440;
  const [y, m, d] = date.split('-').map(Number);
  const value = new Date(Date.UTC(y, m - 1, d + dayOffset, Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0));
  return value.toISOString();
}

function formatMinute(minute) {
  const wrapped = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

function getTaskTiming(task) {
  const useArrivalDeadline = task.task_type === 'Sluitbegeleiding' || (task.task_type === 'Openingsronde' && task.use_arrival_deadline && task.arrival_deadline_time);
  const arrivalDeadline = parseTime(task.arrival_deadline_time) ?? 1439;
  const departureDeadline = arrivalDeadline + (task.duration_minutes || 0);
  return {
    time_window_start: useArrivalDeadline ? formatMinute(arrivalDeadline) : (task.time_window_start || '00:00'),
    time_window_end: useArrivalDeadline ? formatMinute(departureDeadline) : (task.time_window_end || '23:59'),
    use_arrival_deadline: useArrivalDeadline,
    arrival_deadline_time: task.arrival_deadline_time || '',
  };
}

function buildRepeatWindows(task, timing) {
  const repeatCount = Math.max(1, Math.floor(Number(task.repeat_count || 1)));
  if (repeatCount === 1 || timing.use_arrival_deadline) return [{ start: timing.time_window_start, end: timing.time_window_end, index: 1 }];

  const duration = Math.max(1, Number(task.duration_minutes || 1));
  const minGap = Math.max(0, Number(task.min_minutes_between_visits || 0));
  const start = parseTime(timing.time_window_start) ?? 0;
  let end = parseTime(timing.time_window_end) ?? 1439;
  if (end <= start) end += 1440;

  const usable = end - start - (minGap * (repeatCount - 1));
  if (usable < duration * repeatCount) return [{ start: timing.time_window_start, end: timing.time_window_end, index: 1 }];

  const slotSize = usable / repeatCount;
  return Array.from({ length: repeatCount }, (_, index) => {
    const slotStart = start + index * (slotSize + minGap);
    const slotEnd = index === repeatCount - 1 ? end : slotStart + slotSize;
    return { start: formatMinute(slotStart), end: formatMinute(slotEnd), index: index + 1 };
  });
}

function explainSkippedTask(task, code = '') {
  const repeatText = task.repeat_count > 1 ? ` Dit is uitvoering ${task.repeat_index || 1} van ${task.repeat_count}; herhaalde uitvoeringen moeten minimaal ${task.min_minutes_between_visits || 0} minuten uit elkaar blijven.` : '';
  if (task.primaryReason === 'missing_coordinates') return { reason: 'De gekoppelde locatie heeft geen bruikbare coördinaten.', advice: 'Vul de coördinaten of het adres van dit object aan.' };
  if (task.primaryReason === 'missing_object') return { reason: 'Deze taak heeft geen gekoppeld object.', advice: 'Koppel de taak aan een object of collectief.' };
  if (code === 'CANNOT_BE_PERFORMED_WITHIN_VEHICLE_TIME_WINDOWS') return { reason: `De taak past niet binnen de beschikbare route- of voertuigvensters, inclusief reistijd en bestaande taken.${repeatText}`, advice: 'Vergroot het routevenster, voeg voertuigcapaciteit toe, verruim het taakvenster of verlaag de minimale tussentijd bij herhaalde taken.' };
  return { reason: `Google kon deze taak niet combineren met de gekozen routes, tijdvensters en reistijden.${repeatText}`, advice: 'Controleer of het taakvenster binnen een route valt en of er voldoende ruimte is inclusief reistijd.' };
}

function prepareTaskInstances(tasks, objects, weekday) {
  const instances = [];
  const nonRelevant = [];
  const skipped = [];

  for (const task of tasks) {
    const days = task.weekdays || [];
    if (days.length > 0 && !days.includes(weekday)) {
      nonRelevant.push({ id: task.id, task_id: task.id, name: task.task_type || 'Taak', primaryReason: 'not_relevant_for_this_planning' });
      continue;
    }

    const timing = getTaskTiming(task);
    const repeatWindows = buildRepeatWindows(task, timing);
    const base = {
      task_id: task.id,
      duration_minutes: task.duration_minutes || 15,
      use_arrival_deadline: timing.use_arrival_deadline,
      arrival_deadline_time: timing.arrival_deadline_time,
      latest_departure_time: timing.latest_departure_time,
      task_type: task.task_type,
      price_amount: task.is_free ? 0 : (task.price_amount || 0),
      pricing_type: task.pricing_type,
      weekdays: days,
      repeat_count: repeatWindows.length,
      min_minutes_between_visits: task.min_minutes_between_visits || 0,
    };

    const addInstance = (objectId, idSuffix = '') => {
      const obj = fixCoords(objects.find(o => o.id === objectId));
      for (const repeatWindow of repeatWindows) {
        const repeatSuffix = repeatWindows.length > 1 ? `_r${repeatWindow.index}` : '';
        const instanceBase = {
          ...base,
          time_window_start: repeatWindow.start,
          time_window_end: repeatWindow.end,
          repeat_index: repeatWindow.index,
        };
        if (!obj?.latitude || !obj?.longitude) {
          skipped.push({ ...instanceBase, id: `${task.id}${idSuffix}${repeatSuffix}`, task_id: task.id, name: obj?.name || task.task_type || 'Onbekend object', primaryReason: 'missing_coordinates', skip_reason: 'Ontbrekende coördinaten bij het object.' });
          return;
        }
        instances.push({
          ...instanceBase,
          id: `${task.id}${idSuffix}${repeatSuffix}`,
          object_id: objectId,
          name: repeatWindows.length > 1 ? `${obj.name || task.task_type || 'Taak'} (${repeatWindow.index}/${repeatWindows.length})` : (obj.name || task.task_type || 'Taak'),
          address: obj.address || '',
          latitude: obj.latitude,
          longitude: obj.longitude,
        });
      }
    };

    if (task.collectief_id && task.selected_object_ids?.length > 0) {
      const durationPerObject = Math.max(1, Math.round((task.duration_minutes || 15) / task.selected_object_ids.length));
      for (const objectId of task.selected_object_ids) addInstance(objectId, `_${objectId}`);
      instances.filter(i => i.task_id === task.id).forEach(i => { i.duration_minutes = durationPerObject; i.is_collectief = true; });
    } else if (task.object_id) {
      addInstance(task.object_id);
    } else {
      skipped.push({ ...base, id: task.id, task_id: task.id, name: task.task_type || 'Taak', primaryReason: 'missing_object', skip_reason: 'Geen gekoppeld object gevonden.' });
    }
  }

  return { instances, nonRelevant, skipped };
}

function getLocationById(id, objects, offices) {
  if (!id) return null;
  return fixCoords(objects.find(o => o.id === id) || offices.find(o => o.id === id));
}

function buildPlanningVehicles(manualRoutes, activeVehicles, objects, offices) {
  if (!manualRoutes.length) {
    const depot = fixCoords(offices[0]);
    return activeVehicles.map((vehicle, index) => ({
      ...vehicle,
      _planningLabel: vehicle.license_plate || vehicle.name || `Voertuig ${index + 1}`,
      _startDepot: getLocationById(vehicle.startDepotLocationId, objects, offices) || depot,
      _endDepot: getLocationById(vehicle.eindDepotLocationId, objects, offices) || getLocationById(vehicle.startDepotLocationId, objects, offices) || depot,
      _windowStart: 0,
      _windowEnd: 1439,
      _manualRouteId: null,
      _manualRouteName: null,
    }));
  }

  return manualRoutes.map((route, index) => {
    const vehicle = activeVehicles.find(v => v.id === route.vehicle_id) || activeVehicles[index % activeVehicles.length];
    const depot = fixCoords(offices[0]);
    const start = parseTime(route.time_window_start) ?? 0;
    let end = parseTime(route.time_window_end) ?? 1439;
    if (end <= start) end += 1440;
    const startDepot = getLocationById(route.start_location_id || vehicle?.startDepotLocationId, objects, offices) || depot;
    const endDepot = getLocationById(route.end_location_id || vehicle?.eindDepotLocationId, objects, offices) || startDepot;
    return {
      ...vehicle,
      _planningLabel: route.name || vehicle?.license_plate || vehicle?.name || `Route ${index + 1}`,
      _startDepot: startDepot,
      _endDepot: endDepot,
      _windowStart: start,
      _windowEnd: end,
      _manualRouteId: route.id,
      _manualRouteName: route.name,
    };
  });
}

function buildTaskTimeWindows(date, start, end, globalStart, globalEnd) {
  const candidates = [
    { start, end },
    { start: start + 1440, end: end + 1440 },
  ];

  return candidates
    .filter(window => window.end > globalStart && window.start < globalEnd)
    .map(window => ({ startTime: isoForMinute(date, window.start), endTime: isoForMinute(date, window.end) }));
}

function buildGoogleRequest(taskInstances, vehicles, offices, objects, weekday) {
  const date = dateForWeekday(weekday);
  const shipmentStarts = taskInstances.map(task => parseTime(task.time_window_start) ?? 0);
  const shipmentEnds = taskInstances.map(task => {
    const start = parseTime(task.time_window_start) ?? 0;
    let end = parseTime(task.time_window_end) ?? 1439;
    return end <= start ? end + 1440 : end;
  });
  const globalStart = Math.min(...vehicles.map(v => v._windowStart ?? 0), ...shipmentStarts);
  const globalEnd = Math.max(...vehicles.map(v => v._windowEnd ?? 1439), ...shipmentEnds);

  const shipments = taskInstances.map((task, index) => {
    const start = parseTime(task.time_window_start) ?? 0;
    let end = task.use_arrival_deadline ? start + 1 : (parseTime(task.time_window_end) ?? 1439);
    if (end <= start) end += 1440;
    task._shipmentIndex = index;
    return {
      label: task.id,
      deliveries: [{
        arrivalLocation: { latitude: task.latitude, longitude: task.longitude },
        duration: `${Math.max(1, task.duration_minutes || 1) * 60}s`,
        timeWindows: buildTaskTimeWindows(date, start, end, globalStart, globalEnd),
      }],
    };
  });

  const googleVehicles = vehicles.map((vehicle, index) => ({
    label: vehicle._planningLabel || vehicle.license_plate || vehicle.name || `Voertuig ${index + 1}`,
    startLocation: { latitude: vehicle._startDepot.latitude, longitude: vehicle._startDepot.longitude },
    endLocation: { latitude: vehicle._endDepot.latitude, longitude: vehicle._endDepot.longitude },
    startTimeWindows: [{ startTime: isoForMinute(date, vehicle._windowStart ?? globalStart), endTime: isoForMinute(date, vehicle._windowEnd ?? globalEnd) }],
    endTimeWindows: [{ startTime: isoForMinute(date, vehicle._windowStart ?? globalStart), endTime: isoForMinute(date, vehicle._windowEnd ?? globalEnd) }],
    costPerKilometer: Number(vehicle.kostenPerKm ?? vehicle.fuel_cost_per_km ?? 0.35),
    costPerHour: Number(vehicle.kostenPerMinuutVoertuig ?? 0.12) * 60,
  }));

  return {
    model: {
      globalStartTime: isoForMinute(date, globalStart),
      globalEndTime: isoForMinute(date, globalEnd),
      shipments,
      vehicles: googleVehicles,
    },
  };
}

function mapGoogleResult(apiResult, taskInstances, vehicles, skipped, nonRelevant, weekday) {
  const plannedShipmentIndexes = new Set();
  const routes = (apiResult.routes || [])
    .filter(route => route.visits?.length > 0)
    .map((route, routeIndex) => {
      const vehicleIndex = Number.isInteger(route.vehicleIndex)
        ? route.vehicleIndex
        : vehicles.findIndex(vehicle => vehicle._planningLabel === route.vehicleLabel || vehicle._planningLabel === route.label);
      const vehicle = vehicles[vehicleIndex] || {};
      let totalTravelSeconds = 0;
      let totalWaitSeconds = 0;
      let totalDistanceMeters = 0;

      for (const transition of route.transitions || []) {
        totalTravelSeconds += secondsFromDuration(transition.travelDuration || transition.totalDuration);
        totalWaitSeconds += secondsFromDuration(transition.waitDuration);
        totalDistanceMeters += Number(transition.travelDistanceMeters || 0);
      }

      const tasks = (route.visits || [])
        .map((visit, index) => ({ visit, index }))
        .filter(({ visit }) => Number.isInteger(visit.shipmentIndex) && taskInstances[visit.shipmentIndex]?.task_id)
        .map(({ visit, index }) => {
        const task = taskInstances[visit.shipmentIndex];
        plannedShipmentIndexes.add(visit.shipmentIndex);
        const transition = route.transitions?.[index] || {};
        const travelMinutes = Math.round(secondsFromDuration(transition.travelDuration || transition.totalDuration) / 60);
        const distanceKm = r2(Number(transition.travelDistanceMeters || 0) / 1000);
        const startTime = formatTimeFromIso(visit.startTime);
        const departureMinute = (parseTime(startTime) ?? 0) + (task.duration_minutes || 0);
        return {
          task_id: task.task_id || task.id,
          object_id: task.object_id,
          name: task.name || visit.shipmentLabel || 'Taak',
          address: task.address || '',
          duration_minutes: task.duration_minutes || 0,
          time_window_start: task.time_window_start,
          time_window_end: task.time_window_end,
          task_type: task.task_type,
          repeat_index: task.repeat_index,
          repeat_count: task.repeat_count,
          min_minutes_between_visits: task.min_minutes_between_visits,
          arrival_time: startTime,
          actual_start_time: startTime,
          departure_time: `${String(Math.floor((departureMinute % 1440) / 60)).padStart(2, '0')}:${String(departureMinute % 60).padStart(2, '0')}`,
          travel_time_minutes: travelMinutes,
          distance_km: distanceKm,
          waiting_time: 0,
          estimated_travel: false,
          sequence_index: index,
          placement_explanation: 'Gepland door Google Route Optimization API.',
        };
      });

      const startTime = formatTimeFromIso(route.vehicleStartTime || route.routeStartTime || tasks[0]?.actual_start_time);
      const endTime = formatTimeFromIso(route.vehicleEndTime || route.routeEndTime || tasks[tasks.length - 1]?.departure_time);
      const optimizedOrder = [
        ...(vehicle._startDepot ? [{
          name: `START: ${vehicle._startDepot.name || 'Startlocatie'}`,
          address: vehicle._startDepot.address || '',
          duration_minutes: 0,
          is_start: true,
          arrival_time: startTime,
          departure_time: startTime,
        }] : []),
        ...tasks,
        ...(vehicle._endDepot ? [{
          name: `EIND: ${vehicle._endDepot.name || 'Eindlocatie'}`,
          address: vehicle._endDepot.address || '',
          duration_minutes: 0,
          is_end: true,
          arrival_time: endTime,
          departure_time: endTime,
        }] : []),
      ];
      const serviceMinutes = tasks.reduce((sum, task) => sum + (task.duration_minutes || 0), 0);
      const travelMinutes = Math.round(totalTravelSeconds / 60);
      const waitMinutes = Math.round(totalWaitSeconds / 60);
      const routeMinutes = Math.max(serviceMinutes + travelMinutes + waitMinutes, 0);

      return {
        id: vehicle._manualRouteId || `google_route_${weekday}_${routeIndex + 1}`,
        candidate_id: vehicle._manualRouteId || `google_route_${weekday}_${routeIndex + 1}`,
        manual_route_id: vehicle._manualRouteId || null,
        manual_route_name: vehicle._manualRouteName || null,
        vehicle,
        time_window_start: startTime,
        time_window_end: endTime,
        route_cost: r2(Number(route.routeCosts?.modelCost || route.metrics?.costs?.modelCost || 0)),
        validation: { valid: true, errors: [] },
        tasks,
        optimized_order: optimizedOrder,
        total_route_time: routeMinutes,
        total_travel_time: travelMinutes,
        total_service_time: serviceMinutes,
        total_distance_km: r2(totalDistanceMeters / 1000),
        tasks_skipped: 0,
        stats: {
          total_tasks: tasks.length,
          total_service_minutes: serviceMinutes,
          total_travel_minutes: travelMinutes,
          total_distance_km: r2(totalDistanceMeters / 1000),
          total_wait_minutes: waitMinutes,
          total_route_minutes: routeMinutes,
          has_estimated_travel: false,
        },
      };
    });

  const googleSkipped = (apiResult.skippedShipments || []).map(item => {
    const task = taskInstances[item.index] || {};
    const code = item.reasons?.[0]?.code || '';
    const details = explainSkippedTask({ ...task, primaryReason: 'google_skipped' }, code);
    return { ...task, primaryReason: 'Niet ingepland', skip_reason: details.reason, google_code: code, advice: details.advice };
  });

  const notVisited = taskInstances
    .filter(task => !plannedShipmentIndexes.has(task._shipmentIndex) && !googleSkipped.some(s => s._shipmentIndex === task._shipmentIndex))
    .map(task => {
      const details = explainSkippedTask({ ...task, primaryReason: 'not_planned' });
      return { ...task, primaryReason: 'Niet ingepland', skip_reason: details.reason, advice: details.advice };
    });

  const allSkipped = [...skipped, ...googleSkipped, ...notVisited];
  const totals = {
    total_travel_minutes: routes.reduce((s, r) => s + r.stats.total_travel_minutes, 0),
    total_service_minutes: routes.reduce((s, r) => s + r.stats.total_service_minutes, 0),
    total_wait_minutes: routes.reduce((s, r) => s + r.stats.total_wait_minutes, 0),
    total_distance_km: r2(routes.reduce((s, r) => s + r.stats.total_distance_km, 0)),
    total_cost: r2(routes.reduce((s, r) => s + (r.route_cost || 0), 0)),
  };

  return {
    planning_mode: 'google_route_optimization',
    google_route_optimization: true,
    manual_routes_used: routes.some(route => route.manual_route_id),
    routes,
    skipped_tasks: allSkipped,
    non_relevant_tasks: nonRelevant,
    advice: allSkipped.length ? [{ type: 'google_skipped', message: `${allSkipped.length} taak(en) zijn niet ingepland.`, action: 'Controleer coördinaten, tijdvensters en voertuigcapaciteit.' }] : [],
    horizons: [],
    totals,
    vehicle_count: vehicles.length,
    max_concurrent_routes: routes.length,
    total_tasks_input: taskInstances.length,
    total_tasks_planned: routes.reduce((s, r) => s + r.tasks.length, 0),
    total_tasks_skipped: allSkipped.length,
    total_tasks_not_relevant: nonRelevant.length,
    total_routes_created: routes.length,
    has_estimated_travel: false,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const weekdays = body.weekdays ?? (body.weekday ? [body.weekday] : [1]);
    const saveRoutes = !!body.save_routes;
    const plannedResult = body.planned_result || null;
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    const projectId = Deno.env.get('GOOGLE_CLOUD_PROJECT_ID');
    if (!serviceAccountJson || !projectId) return Response.json({ error: 'Google service-account secrets ontbreken.' }, { status: 500 });

    const serviceAccount = JSON.parse(serviceAccountJson);
    const accessToken = await getAccessToken(serviceAccount);

    const [tasks, objects, vehicles, offices, folders, allRoutes] = await Promise.all([
      base44.entities.Task.list(),
      base44.entities.SurveillanceObject.list(),
      base44.entities.Vehicle.list(),
      base44.entities.Office.list(),
      base44.entities.RouteFolder.list(),
      base44.entities.Route.list(),
    ]);

    const activeVehicles = vehicles.filter(v => v.is_active !== false);
    if (activeVehicles.length === 0) return Response.json({ error: 'Geen actieve voertuigen gevonden.' }, { status: 400 });
    if (offices.length === 0) return Response.json({ error: 'Geen depot/kantoor gevonden.' }, { status: 400 });

    const perDay = [];
    if (!plannedResult) {
      for (const weekday of weekdays) {
      const { instances, nonRelevant, skipped } = prepareTaskInstances(tasks, objects, weekday);
      const manualRoutes = allRoutes.filter(route =>
        (route.weekdays || []).includes(weekday) &&
        (route.source || 'manual') === 'manual' &&
        route.status !== 'vergrendeld' &&
        route.time_window_start &&
        route.time_window_end
      );
      const planningVehicles = buildPlanningVehicles(manualRoutes, activeVehicles, objects, offices);
      if (instances.length === 0) {
        perDay.push(mapGoogleResult({ routes: [], skippedShipments: [] }, instances, planningVehicles, skipped, nonRelevant, weekday));
        continue;
      }

      const googleRequest = buildGoogleRequest(instances, planningVehicles, offices, objects, weekday);
      const response = await fetch(`https://routeoptimization.googleapis.com/v1/projects/${projectId}:optimizeTours`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(googleRequest),
      });
      const apiResult = await response.json();
      if (!response.ok) throw new Error(apiResult.error?.message || 'Google Route Optimization API gaf een fout terug.');
      perDay.push(mapGoogleResult(apiResult, instances, planningVehicles, skipped, nonRelevant, weekday));
      }
    }

    const routes = plannedResult?.routes || perDay.flatMap(day => day.routes || []);
    const skippedTasks = plannedResult?.skipped_tasks || perDay.flatMap(day => day.skipped_tasks || []);
    const nonRelevantTasks = plannedResult?.non_relevant_tasks || perDay.flatMap(day => day.non_relevant_tasks || []);
    const totals = plannedResult?.totals || {
      total_travel_minutes: perDay.reduce((s, d) => s + (d.totals?.total_travel_minutes || 0), 0),
      total_service_minutes: perDay.reduce((s, d) => s + (d.totals?.total_service_minutes || 0), 0),
      total_wait_minutes: perDay.reduce((s, d) => s + (d.totals?.total_wait_minutes || 0), 0),
      total_distance_km: r2(perDay.reduce((s, d) => s + (d.totals?.total_distance_km || 0), 0)),
      total_cost: r2(perDay.reduce((s, d) => s + (d.totals?.total_cost || 0), 0)),
    };

    if (saveRoutes) {
      let folderId = folders[0]?.id;
      if (!folderId) {
        const newFolder = await withRateLimitRetry(() => base44.asServiceRole.entities.RouteFolder.create({ name: 'Google Route Optimization', color: 'green' }));
        folderId = newFolder.id;
      }

      const weekdayLabels = { 1: 'Maandag', 2: 'Dinsdag', 3: 'Woensdag', 4: 'Donderdag', 5: 'Vrijdag', 6: 'Zaterdag', 7: 'Zondag' };
      for (const weekday of weekdays) {
        const dayRoutes = routes.filter(route => route.manual_route_id || route.id?.startsWith(`google_route_${weekday}_`));
        for (let i = 0; i < dayRoutes.length; i++) {
          const route = dayRoutes[i];
          const routeData = {
            folder_id: folderId,
            vehicle_id: route.vehicle?.id || null,
            weekdays: [weekday],
            assigned_tasks: route.tasks
              .filter(task => task.task_id)
              .map((task, index) => ({
                task_id: task.task_id,
                days: [weekday],
                sequence_index: index,
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
            await withRateLimitRetry(() => base44.asServiceRole.entities.Route.update(route.manual_route_id, routeData));
          } else {
            await withRateLimitRetry(() => base44.asServiceRole.entities.Route.create({
              ...routeData,
              name: `${weekdayLabels[weekday]} - Google route ${i + 1}${route.vehicle ? ` (${route.vehicle.license_plate || route.vehicle.name})` : ''}`,
              time_window_start: route.time_window_start,
              time_window_end: route.time_window_end,
              source: 'automatic',
            }));
          }
        }
      }
    }

    return Response.json({
      planning_mode: 'google_route_optimization',
      google_route_optimization: true,
      manual_routes_used: routes.some(route => route.manual_route_id),
      routes,
      skipped_tasks: skippedTasks,
      non_relevant_tasks: nonRelevantTasks,
      advice: skippedTasks.length ? [{ type: 'google_skipped', message: `${skippedTasks.length} taak(en) zijn niet ingepland.`, action: 'Controleer coördinaten, tijdvensters en voertuigcapaciteit.' }] : [],
      horizons: [],
      totals,
      vehicle_count: activeVehicles.length,
      max_concurrent_routes: routes.length,
      total_tasks_input: plannedResult?.total_tasks_input ?? perDay.reduce((s, d) => s + (d.total_tasks_input || 0), 0),
      total_tasks_planned: plannedResult?.total_tasks_planned ?? routes.reduce((s, r) => s + r.tasks.length, 0),
      total_tasks_skipped: skippedTasks.length,
      total_tasks_not_relevant: nonRelevantTasks.length,
      total_routes_created: routes.length,
      has_estimated_travel: false,
      weekdays,
      generated_at: new Date().toISOString(),
      saved: saveRoutes,
    });
  } catch (error) {
    console.error('Google Route Optimization error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});