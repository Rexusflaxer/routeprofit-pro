import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_SETTINGS = {
  defaultStartBufferMinutes: 30,
  defaultEndBufferMinutes: 30,
  maxReasonableIdleGapMinutes: 180,
  finishWithinTimeWindow: true,
  costPerPersonnelMinute: 0.55,
  costPerVehicleMinute: 0.12,
  costPerKm: 0.35,
  fixedCostPerRoute: 8,
  waitingCostFactor: 0.35,
  minimumPaidMinutesPerRoute: 180,
  minimumOperationalRouteMinutes: 120,
  microRoutePenalty: 500,
  routeFragmentationPenalty: 250,
  existingManualRoutePreferenceBonus: 1000,
  minSavingsRequiredForNewRoute: 180,
  depotTravelRequired: true,
  extensionCostMultiplier: 1.2,
};

function parseTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = String(timeStr).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function formatTime(minutes) {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function r2(n) {
  return Math.round((n || 0) * 100) / 100;
}

function fixCoords(obj) {
  if (!obj) return obj;
  const lat = Number(obj.latitude);
  const lng = Number(obj.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return obj;
  if (lat < lng && lng > 40) return { ...obj, latitude: lng, longitude: lat };
  return { ...obj, latitude: lat, longitude: lng };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getTravelTime(from, to, apiKey, cache) {
  if (!from?.latitude || !from?.longitude || !to?.latitude || !to?.longitude) {
    return { travelMinutes: 0, distanceKm: 0, estimated: true, status: 'missing_coordinates' };
  }

  const key = `${r2(from.latitude)},${r2(from.longitude)}->${r2(to.latitude)},${r2(to.longitude)}`;
  if (cache.has(key)) return cache.get(key);

  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${from.latitude},${from.longitude}&destination=${to.latitude},${to.longitude}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK' && data.routes?.length > 0) {
      let duration = 0;
      let distance = 0;
      for (const leg of data.routes[0].legs || []) {
        duration += leg.duration.value;
        distance += leg.distance.value;
      }
      const result = { travelMinutes: Math.round(duration / 60), distanceKm: r2(distance / 1000), estimated: false, status: 'ok' };
      cache.set(key, result);
      return result;
    }
  } catch (error) {
    console.warn('Google Maps travel fallback:', error.message);
  }

  const km = haversineKm(from.latitude, from.longitude, to.latitude, to.longitude);
  const result = { travelMinutes: Math.max(1, Math.round(km * 1.4)), distanceKm: r2(km * 1.3), estimated: true, status: 'estimated' };
  cache.set(key, result);
  return result;
}

function isInsideCircularInterval(minute, start, end) {
  if (end <= start) return minute >= start || minute <= end;
  return minute >= start && minute <= end;
}

function normalizeWindowToHorizon(startStr, endStr, horizonStart, horizonEnd) {
  let start = parseTime(startStr) ?? 0;
  let end = parseTime(endStr) ?? 1439;
  if (end <= start) end += 1440;

  const options = [
    { start, end },
    { start: start + 1440, end: end + 1440 },
    { start: start - 1440, end: end - 1440 },
  ];

  let best = options[0];
  let bestOverlap = -Infinity;
  for (const opt of options) {
    const overlap = Math.min(opt.end, horizonEnd) - Math.max(opt.start, horizonStart);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = opt;
    }
  }
  return best;
}

function collectTaskWindows(taskInstances) {
  return taskInstances.map(task => {
    const start = parseTime(task.time_window_start) ?? 0;
    let end = parseTime(task.time_window_end) ?? 1439;
    const crossesMidnight = end <= start;
    if (crossesMidnight) end += 1440;
    return { task, start, end, start24: start, end24: end % 1440, crossesMidnight };
  });
}

function findLargestInactiveGap(windows) {
  if (windows.length === 0) return { start: 0, end: 1440, minutes: 1440 };
  const points = [...new Set(windows.flatMap(w => [w.start24, w.end24]))].sort((a, b) => a - b);
  if (points.length === 1) return { start: points[0], end: points[0], minutes: 1440 };

  let bestGap = { start: 0, end: 0, minutes: -1 };
  for (let i = 0; i < points.length; i++) {
    const start = points[i];
    const end = i === points.length - 1 ? points[0] + 1440 : points[i + 1];
    const length = end - start;
    if (length <= 0) continue;
    const midpoint = (start + length / 2) % 1440;
    const covered = windows.some(w => isInsideCircularInterval(midpoint, w.start24, w.end24));
    if (!covered && length > bestGap.minutes) {
      bestGap = { start: start % 1440, end: end % 1440, minutes: length };
    }
  }

  if (bestGap.minutes < 0) {
    return { start: 0, end: 0, minutes: 0 };
  }
  return bestGap;
}

function derivePlanningHorizons(taskInstances, depotLocations = [], settings = DEFAULT_SETTINGS) {
  const plannable = taskInstances.filter(t => !t.missing_coords);
  const windows = collectTaskWindows(plannable);
  if (windows.length === 0) return [];

  const largestGap = findLargestInactiveGap(windows);
  const naturalStart = largestGap.end;
  const naturalEnd = largestGap.start <= naturalStart ? largestGap.start + 1440 : largestGap.start;

  const aligned = windows.map(w => {
    const normalized = normalizeWindowToHorizon(w.task.time_window_start, w.task.time_window_end, naturalStart, naturalEnd);
    return { ...w, normalizedStart: normalized.start, normalizedEnd: normalized.end };
  }).sort((a, b) => a.normalizedStart - b.normalizedStart);

  const groups = [];
  for (const item of aligned) {
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup) {
      groups.push([item]);
      continue;
    }
    const previousEnd = Math.max(...lastGroup.map(x => x.normalizedEnd));
    const gap = item.normalizedStart - previousEnd;
    if (gap > settings.maxReasonableIdleGapMinutes) {
      groups.push([item]);
    } else {
      lastGroup.push(item);
    }
  }

  const depotBuffer = 0;
  return groups.map((group, index) => {
    const earliest = Math.min(...group.map(g => g.normalizedStart));
    const latest = Math.max(...group.map(g => g.normalizedEnd));
    const start = Math.max(naturalStart, earliest - settings.defaultStartBufferMinutes - depotBuffer);
    const end = Math.min(naturalEnd, latest + settings.defaultEndBufferMinutes + depotBuffer);
    const label = end > 1440 && start >= 720 ? 'avond/nacht' : start >= 300 && end <= 1080 ? 'dag' : end <= 720 ? 'nacht/ochtend' : 'operationeel';

    return {
      id: `horizon_${index + 1}`,
      label,
      start_minute: Math.round(start),
      end_minute: Math.round(end),
      start_time: formatTime(start),
      end_time: formatTime(end),
      crosses_midnight: end >= 1440,
      task_count: group.length,
      task_ids: group.map(g => g.task.id),
      largest_inactive_gap: {
        start_time: formatTime(largestGap.start),
        end_time: formatTime(largestGap.end),
        minutes: Math.round(largestGap.minutes),
      },
      buffers: {
        start_minutes: settings.defaultStartBufferMinutes,
        end_minutes: settings.defaultEndBufferMinutes,
        depot_travel_buffer_minutes: depotBuffer,
      },
      explanation: `Automatisch bepaald op basis van taakvensters, reistijd en depotbuffer. De taken liggen grofweg tussen ${formatTime(earliest)} en ${formatTime(latest)}; de grootste inactieve periode ligt tussen ${formatTime(largestGap.start)} en ${formatTime(largestGap.end)}.`,
    };
  });
}

function distanceClusterKey(task) {
  return `${Math.round(task.latitude * 100) / 100}_${Math.round(task.longitude * 100) / 100}`;
}

function prepareTaskInstances(tasks, objects, collectiefs, weekday) {
  const instances = [];
  const nonRelevant = [];

  for (const task of tasks) {
    const days = task.weekdays || [];
    if (days.length > 0 && !days.includes(weekday)) {
      nonRelevant.push({
        id: task.id,
        task_id: task.id,
        name: task.task_type || 'Taak',
        status: 'niet_relevant',
        primaryReason: 'not_relevant_for_this_planning',
        skip_reason: `Niet relevant voor deze planning; beschikbaar op andere dag(en): ${days.join(', ')}.`,
      });
      continue;
    }

    const base = {
      task_id: task.id,
      duration_minutes: task.duration_minutes || 15,
      time_window_start: task.time_window_start || '00:00',
      time_window_end: task.time_window_end || '23:59',
      task_type: task.task_type,
      price_amount: task.is_free ? 0 : (task.price_amount || 0),
      pricing_type: task.pricing_type,
      weekdays: days,
      priority: task.verplichtheidsniveau || 'contractueel verplicht',
      penalty: task.penaltyAlsNietGepland || 100000,
    };

    if (task.collectief_id && task.selected_object_ids?.length > 0) {
      const durationPerObject = Math.max(1, Math.round((task.duration_minutes || 15) / task.selected_object_ids.length));
      for (const objectId of task.selected_object_ids) {
        const obj = fixCoords(objects.find(o => o.id === objectId));
        instances.push({
          ...base,
          id: `${task.id}_${objectId}`,
          object_id: objectId,
          name: obj?.name || 'Onbekend object',
          address: obj?.address || '',
          latitude: obj?.latitude || null,
          longitude: obj?.longitude || null,
          duration_minutes: durationPerObject,
          is_collectief: true,
          parent_task_id: task.id,
          missing_coords: !obj?.latitude || !obj?.longitude,
        });
      }
      continue;
    }

    if (task.object_id) {
      const obj = fixCoords(objects.find(o => o.id === task.object_id));
      instances.push({
        ...base,
        id: task.id,
        object_id: task.object_id,
        name: obj?.name || task.task_type || 'Onbekend object',
        address: obj?.address || '',
        latitude: obj?.latitude || null,
        longitude: obj?.longitude || null,
        missing_coords: !obj?.latitude || !obj?.longitude,
      });
    }
  }

  return { instances, nonRelevant };
}

async function scheduleSequence(sequence, depot, horizon, apiKey, travelCache, settings) {
  if (sequence.length === 0) return null;
  const firstWindow = normalizeWindowToHorizon(sequence[0].time_window_start, sequence[0].time_window_end, horizon.start_minute, horizon.end_minute);
  const firstTravel = await getTravelTime(depot, sequence[0], apiKey, travelCache);
  let routeStart = Math.max(horizon.start_minute, firstWindow.start - firstTravel.travelMinutes);
  let currentTime = routeStart;
  let currentLocation = depot;
  const planned = [];
  let totalTravel = 0;
  let totalDistance = 0;
  let totalWait = 0;
  let hasEstimatedTravel = firstTravel.estimated;

  for (const task of sequence) {
    const window = normalizeWindowToHorizon(task.time_window_start, task.time_window_end, horizon.start_minute, horizon.end_minute);
    const travel = await getTravelTime(currentLocation, task, apiKey, travelCache);
    hasEstimatedTravel = hasEstimatedTravel || travel.estimated;
    const arrival = currentTime + travel.travelMinutes;
    const start = Math.max(arrival, window.start);
    const departure = start + (task.duration_minutes || 0);

    if (start < window.start) return null;
    if (settings.finishWithinTimeWindow && departure > window.end) return null;
    if (!settings.finishWithinTimeWindow && start > window.end) return null;
    if (departure > horizon.end_minute) return null;

    const wait = Math.max(0, start - arrival);
    planned.push({
      ...task,
      _windowStart: window.start,
      _windowEnd: window.end,
      _travelTime: travel.travelMinutes,
      _distanceKm: travel.distanceKm,
      _arrivalTime: arrival,
      _actualStart: start,
      _departureTime: departure,
      _waitTime: wait,
      _estimated: travel.estimated,
    });

    totalTravel += travel.travelMinutes;
    totalDistance += travel.distanceKm;
    totalWait += wait;
    currentTime = departure;
    currentLocation = task;
  }

  const backTravel = await getTravelTime(currentLocation, depot, apiKey, travelCache);
  hasEstimatedTravel = hasEstimatedTravel || backTravel.estimated;
  const routeEnd = currentTime + backTravel.travelMinutes;
  if (routeEnd > horizon.end_minute) return null;

  totalTravel += backTravel.travelMinutes;
  totalDistance += backTravel.distanceKm;

  const totalService = planned.reduce((sum, task) => sum + (task.duration_minutes || 0), 0);
  const routeMinutes = routeEnd - routeStart;
  if (routeMinutes < totalTravel + totalService) return null;

  return {
    tasks: planned,
    route_start_minute: Math.round(routeStart),
    route_end_minute: Math.round(routeEnd),
    time_window_start: formatTime(routeStart),
    time_window_end: formatTime(routeEnd),
    return_travel_minutes: backTravel.travelMinutes,
    return_distance_km: backTravel.distanceKm,
    stats: {
      total_tasks: planned.length,
      total_service_minutes: Math.round(totalService),
      total_travel_minutes: Math.round(totalTravel),
      total_distance_km: r2(totalDistance),
      total_wait_minutes: Math.round(totalWait),
      total_route_minutes: Math.round(routeMinutes),
      has_estimated_travel: hasEstimatedTravel,
    },
  };
}

function calculateRouteCost(route, settings) {
  const vehicle = route.vehicle || {};
  const perKm = Number(vehicle.kostenPerKm ?? vehicle.fuel_cost_per_km ?? settings.costPerKm);
  const perVehicleMinute = Number(vehicle.kostenPerMinuutVoertuig ?? settings.costPerVehicleMinute);
  const fixed = Number(vehicle.vasteKostenPerRoute ?? settings.fixedCostPerRoute);
  return r2(
    route.stats.total_route_minutes * settings.costPerPersonnelMinute +
    route.stats.total_route_minutes * perVehicleMinute +
    route.stats.total_distance_km * perKm +
    fixed +
    route.stats.total_wait_minutes * settings.waitingCostFactor
  );
}

function assignVehicles(routes, vehicles) {
  const sorted = [...routes].sort((a, b) => a.route_start_minute - b.route_start_minute);
  const vehicleAvailability = vehicles.map(v => ({ vehicle: v, availableAt: -Infinity }));
  const assigned = [];

  for (const route of sorted) {
    const allowed = vehicleAvailability.filter(slot => {
      const allowedTypes = slot.vehicle.toegestaneTaaktypes || [];
      return allowedTypes.length === 0 || route.tasks.every(task => allowedTypes.includes(task.task_type));
    });
    const slot = allowed.find(v => v.availableAt <= route.route_start_minute);
    if (!slot) return { feasible: false, routes };
    slot.availableAt = route.route_end_minute;
    assigned.push({ ...route, vehicle: slot.vehicle });
  }

  const restoredOrder = routes.map(route => assigned.find(a => a.id === route.id) || route);
  return { feasible: true, routes: restoredOrder };
}

function maxConcurrentRoutes(routes) {
  const events = [];
  for (const route of routes) {
    events.push({ t: route.route_start_minute, delta: 1 });
    events.push({ t: route.route_end_minute, delta: -1 });
  }
  events.sort((a, b) => a.t === b.t ? a.delta - b.delta : a.t - b.t);
  let active = 0;
  let max = 0;
  for (const event of events) {
    active += event.delta;
    max = Math.max(max, active);
  }
  return max;
}

function validateRouteRun(route, vehicleCount) {
  const errors = [];
  if (!route.depot) errors.push('route heeft geen start-/einddepot');
  if (!route.tasks?.length) errors.push('route bevat geen taken');
  if (!route.vehicle) errors.push('route heeft geen voertuigtoewijzing');
  if (route.route_end_minute <= route.route_start_minute) errors.push('route heeft geen realistische eindtijd');
  if (route.stats.total_route_minutes < route.stats.total_travel_minutes + route.stats.total_service_minutes) errors.push('route is korter dan reistijd + taaktijd');
  for (const task of route.tasks || []) {
    if (!task.latitude || !task.longitude) errors.push(`${task.name}: ontbrekende coördinaten`);
    if ((task._waitTime || 0) < 0) errors.push(`${task.name}: negatieve wachttijd`);
    if (task._actualStart < task._windowStart) errors.push(`${task.name}: start vóór tijdvenster`);
    if (task._departureTime > task._windowEnd) errors.push(`${task.name}: eindigt na tijdvenster`);
  }
  return { valid: errors.length === 0, errors };
}

async function optimizeHorizonTasks(tasks, horizon, vehicles, depot, apiKey, travelCache, settings, debug) {
  const sortedTasks = [...tasks].sort((a, b) => {
    const aw = normalizeWindowToHorizon(a.time_window_start, a.time_window_end, horizon.start_minute, horizon.end_minute);
    const bw = normalizeWindowToHorizon(b.time_window_start, b.time_window_end, horizon.start_minute, horizon.end_minute);
    const aWidth = aw.end - aw.start;
    const bWidth = bw.end - bw.start;
    if (aWidth !== bWidth) return aWidth - bWidth;
    return aw.end - bw.end;
  });

  let routes = [];
  const unassigned = [];
  let routeCounter = 1;

  for (const task of sortedTasks) {
    let best = null;

    for (const route of routes) {
      for (let pos = 0; pos <= route.tasks.length; pos++) {
        const seq = [...route.tasks.slice(0, pos), task, ...route.tasks.slice(pos)];
        const scheduled = await scheduleSequence(seq, depot, horizon, apiKey, travelCache, settings);
        if (!scheduled) continue;
        const candidateRoutes = routes.map(r => r.id === route.id ? { ...r, ...scheduled, id: r.id, depot, horizon_id: horizon.id } : r);
        const assignment = assignVehicles(candidateRoutes, vehicles);
        if (!assignment.feasible) continue;
        const oldCost = calculateRouteCost(route, settings);
        const newRoute = assignment.routes.find(r => r.id === route.id);
        const score = calculateRouteCost(newRoute, settings) - oldCost;
        if (!best || score < best.score) best = { type: 'insert', routeId: route.id, route: newRoute, routes: assignment.routes, score, pos };
      }
    }

    const newScheduled = await scheduleSequence([task], depot, horizon, apiKey, travelCache, settings);
    if (newScheduled) {
      const newRoute = { ...newScheduled, id: `route_${horizon.id}_${routeCounter}`, depot, horizon_id: horizon.id, tasks: newScheduled.tasks };
      const assignment = assignVehicles([...routes, newRoute], vehicles);
      if (assignment.feasible) {
        const assignedNewRoute = assignment.routes.find(r => r.id === newRoute.id);
        const score = calculateRouteCost(assignedNewRoute, settings) + 12;
        if (!best || score < best.score) best = { type: 'new_route', route: assignedNewRoute, routes: assignment.routes, score, pos: 0 };
      }
    }

    if (best) {
      routes = best.routes;
      if (best.type === 'new_route') routeCounter++;
      debug.placement_explanations.push({
        task: task.name,
        route: best.route.id,
        reason: `Deze taak is geplaatst omdat dit de laagste haalbare extra kosten gaf (+${r2(best.score)}).`,
      });
    } else {
      const emptyAttempt = await scheduleSequence([task], depot, horizon, apiKey, travelCache, settings);
      const reason = emptyAttempt ? 'insufficient_vehicle_count_at_required_time' : 'impossible_even_with_empty_route';
      unassigned.push({
        ...task,
        primaryReason: reason,
        skip_reason: reason === 'insufficient_vehicle_count_at_required_time'
          ? 'Niet ingepland: er is op het benodigde moment geen voertuigcapaciteit vrij.'
          : 'Niet ingepland: deze taak past zelfs niet in een lege route binnen het tijdvenster inclusief aan- en terugrijtijd.',
        advice: reason === 'insufficient_vehicle_count_at_required_time' ? 'Voeg een extra voertuig toe of verruim tijdvensters.' : 'Verruim het tijdvenster, controleer duur en coördinaten.',
      });
    }
  }

  routes = assignVehicles(routes, vehicles).routes.map(route => {
    const routeWithCost = { ...route, route_cost: calculateRouteCost(route, settings) };
    return { ...routeWithCost, validation: validateRouteRun(routeWithCost, vehicles.length) };
  });

  return { routes, unassigned };
}

function buildOutputRoute(route, index) {
  return {
    id: route.id,
    candidate_id: route.id,
    horizon_id: route.horizon_id,
    vehicle: route.vehicle,
    depot: route.depot,
    time_window_start: route.time_window_start,
    time_window_end: route.time_window_end,
    route_start_minute: route.route_start_minute,
    route_end_minute: route.route_end_minute,
    route_cost: route.route_cost,
    validation: route.validation,
    tasks: route.tasks.map((task, taskIndex) => ({
      task_id: task.task_id || task.id,
      object_id: task.object_id,
      name: task.name,
      address: task.address,
      duration_minutes: task.duration_minutes,
      time_window_start: task.time_window_start,
      time_window_end: task.time_window_end,
      task_type: task.task_type,
      arrival_time: formatTime(task._arrivalTime),
      actual_start_time: formatTime(task._actualStart),
      departure_time: formatTime(task._departureTime),
      travel_time_minutes: task._travelTime || 0,
      distance_km: task._distanceKm || 0,
      waiting_time: task._waitTime || 0,
      estimated_travel: task._estimated || false,
      sequence_index: taskIndex,
      placement_explanation: `Deze taak is in Route ${index + 1} geplaatst omdat dit binnen het tijdvenster paste met de laagste extra routekosten in de greedy optimalisatie.`,
    })),
    stats: route.stats,
  };
}

function getLocationById(id, objects, offices) {
  if (!id) return null;
  return fixCoords(offices.find(o => o.id === id) || objects.find(o => o.id === id));
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

async function scheduleSequenceInManualWindow(sequence, routeState, apiKey, travelCache, settings) {
  const horizon = routeState.horizon;
  const depotStart = routeState.startDepot;
  const depotEnd = routeState.endDepot || routeState.startDepot;
  let currentTime = horizon.start_minute;
  let currentLocation = depotStart;
  const planned = [];
  let totalTravel = 0;
  let totalDistance = 0;
  let totalWait = 0;
  let hasEstimatedTravel = false;

  for (const task of sequence) {
    const window = normalizeWindowToHorizon(task.time_window_start, task.time_window_end, horizon.start_minute, horizon.end_minute);
    const travel = await getTravelTime(currentLocation, task, apiKey, travelCache);
    hasEstimatedTravel = hasEstimatedTravel || travel.estimated;
    const arrival = currentTime + travel.travelMinutes;
    const start = Math.max(arrival, window.start);
    const departure = start + (task.duration_minutes || 0);

    if (settings.finishWithinTimeWindow && departure > window.end) return null;
    if (!settings.finishWithinTimeWindow && start > window.end) return null;
    if (departure > horizon.end_minute) return null;

    const wait = Math.max(0, start - arrival);
    planned.push({
      ...task,
      _windowStart: window.start,
      _windowEnd: window.end,
      _travelTime: travel.travelMinutes,
      _distanceKm: travel.distanceKm,
      _arrivalTime: arrival,
      _actualStart: start,
      _departureTime: departure,
      _waitTime: wait,
      _estimated: travel.estimated,
    });
    totalTravel += travel.travelMinutes;
    totalDistance += travel.distanceKm;
    totalWait += wait;
    currentTime = departure;
    currentLocation = task;
  }

  if (sequence.length > 0) {
    const returnTravel = await getTravelTime(currentLocation, depotEnd, apiKey, travelCache);
    hasEstimatedTravel = hasEstimatedTravel || returnTravel.estimated;
    if (currentTime + returnTravel.travelMinutes > horizon.end_minute) return null;
    totalTravel += returnTravel.travelMinutes;
    totalDistance += returnTravel.distanceKm;
  }

  const totalService = planned.reduce((sum, task) => sum + (task.duration_minutes || 0), 0);
  const routeMinutes = horizon.end_minute - horizon.start_minute;
  if (sequence.length > 0 && totalTravel === 0 && totalDistance === 0 && !planned.every(task => task.latitude === depotStart?.latitude && task.longitude === depotStart?.longitude)) return null;
  if (routeMinutes < totalTravel + totalService) return null;

  return {
    tasks: planned,
    route_start_minute: horizon.start_minute,
    route_end_minute: horizon.end_minute,
    time_window_start: formatTime(horizon.start_minute),
    time_window_end: formatTime(horizon.end_minute),
    stats: {
      total_tasks: planned.length,
      total_service_minutes: Math.round(totalService),
      total_travel_minutes: Math.round(totalTravel),
      total_distance_km: r2(totalDistance),
      total_wait_minutes: Math.round(totalWait),
      total_route_minutes: Math.round(routeMinutes),
      has_estimated_travel: hasEstimatedTravel,
    },
  };
}

function buildManualRouteStates(manualRoutes, vehicles, objects, offices) {
  return manualRoutes.map((route, index) => {
    const start = parseTime(route.time_window_start) ?? 0;
    let end = parseTime(route.time_window_end) ?? 1439;
    if (end <= start) end += 1440;
    const vehicle = vehicles.find(v => v.id === route.vehicle_id) || vehicles[index % vehicles.length];
    const startDepot = getLocationById(route.start_location_id || vehicle?.startDepotLocationId, objects, offices) || fixCoords(offices[0]);
    const endDepot = getLocationById(route.end_location_id || vehicle?.eindDepotLocationId, objects, offices) || startDepot;
    return {
      id: route.id,
      source_route: route,
      name: route.name,
      vehicle,
      startDepot,
      endDepot,
      depot: startDepot,
      horizon: {
        id: `manual_${route.id}`,
        label: 'handmatige route',
        start_minute: start,
        end_minute: end,
        start_time: formatTime(start),
        end_time: formatTime(end),
        explanation: 'Bestaande handmatige route wordt als primaire capaciteit gebruikt.',
      },
      tasks: [],
      lockedStartTime: route.lockedStartTime !== false,
      lockedEndTime: route.lockedEndTime !== false,
      allowExtensionBefore: route.allowExtensionBefore === true,
      allowExtensionAfter: route.allowExtensionAfter !== false,
      maxExtensionBeforeMinutes: route.maxExtensionBeforeMinutes || 30,
      maxExtensionAfterMinutes: route.maxExtensionAfterMinutes || 60,
    };
  });
}

function hasVehicleOverlap(routes) {
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      if (routes[i].vehicle?.id && routes[i].vehicle.id === routes[j].vehicle?.id && overlaps(routes[i].route_start_minute, routes[i].route_end_minute, routes[j].route_start_minute, routes[j].route_end_minute)) return true;
    }
  }
  return false;
}

async function fillExistingManualRoutesOptimizer(taskInstances, manualRoutes, vehicles, objects, offices, apiKey, travelCache, weekday, settings) {
  let routeStates = buildManualRouteStates(manualRoutes, vehicles, objects, offices);
  const missingCoordTasks = taskInstances.filter(t => t.missing_coords).map(t => ({
    ...t,
    primaryReason: 'missing_coordinates',
    skip_reason: 'Ontbrekende coördinaten. Invoeging is niet geprobeerd omdat reistijd niet betrouwbaar kan worden berekend.',
    advice: 'Voeg coördinaten toe bij het object.',
  }));
  const plannableTasks = taskInstances.filter(t => !t.missing_coords);
  const debug = {
    mode: 'fillExistingManualRoutesOptimizer',
    manual_routes_used: routeStates.map(r => ({ name: r.name, start: r.horizon.start_time, end: r.horizon.end_time, vehicle: r.vehicle?.license_plate || r.vehicle?.name })),
    task_insertion_attempts: [],
    planned_routes: [],
    unassigned_tasks: [],
  };

  const sortedTasks = [...plannableTasks].sort((a, b) => {
    const aw = collectTaskWindows([a])[0];
    const bw = collectTaskWindows([b])[0];
    return (aw.end - aw.start) - (bw.end - bw.start) || aw.end - bw.end;
  });

  const unassigned = [...missingCoordTasks];

  for (const task of sortedTasks) {
    let best = null;
    const attempts = [];

    for (const route of routeStates) {
      let routeBest = null;
      for (let pos = 0; pos <= route.tasks.length; pos++) {
        const sequence = [...route.tasks.slice(0, pos), task, ...route.tasks.slice(pos)];
        const scheduled = await scheduleSequenceInManualWindow(sequence, route, apiKey, travelCache, settings);
        if (!scheduled) {
          attempts.push({ route: route.name, position: pos, feasible: false, reason: 'tijdvenster, depotrit of route-eindtijd past niet' });
          continue;
        }
        const previousCost = route.stats ? calculateRouteCost(route, settings) : 0;
        const candidate = { ...route, ...scheduled, tasks: scheduled.tasks };
        const extraCost = calculateRouteCost(candidate, settings) - previousCost - settings.existingManualRoutePreferenceBonus;
        const extraTravel = scheduled.stats.total_travel_minutes - (route.stats?.total_travel_minutes || 0);
        const extraDistance = scheduled.stats.total_distance_km - (route.stats?.total_distance_km || 0);
        const extraWait = scheduled.stats.total_wait_minutes - (route.stats?.total_wait_minutes || 0);
        const attempt = { route: route.name, position: pos, feasible: true, extraTravel, extraDistance: r2(extraDistance), extraWait, extraCost: r2(extraCost) };
        attempts.push(attempt);
        if (!routeBest || extraCost < routeBest.extraCost) routeBest = { ...attempt, candidate, extraCost };
        if (!best || extraCost < best.extraCost) best = { routeId: route.id, candidate, extraCost, attempt };
      }
      if (routeBest) attempts.push({ route: route.name, bestPosition: routeBest.position, chosenCandidateCost: r2(routeBest.extraCost) });
    }

    debug.task_insertion_attempts.push({ task: task.name, attempts, chosen_route: best?.candidate?.name || null });

    if (best) {
      routeStates = routeStates.map(route => route.id === best.routeId ? best.candidate : route);
    } else {
      unassigned.push({
        ...task,
        primaryReason: 'no_feasible_time_window',
        skip_reason: 'Invoeging is geprobeerd in alle bestaande handmatige routes en op alle posities, maar paste niet binnen route- en taakvensters inclusief depotritten.',
        advice: 'Bekijk scenario’s voor route verlengen, eerder starten of nieuwe route voorstellen.',
      });
    }
  }

  const outputRoutes = routeStates.map((route, index) => {
    const withCost = { ...route, route_cost: calculateRouteCost(route.stats ? route : { ...route, stats: { total_route_minutes: route.horizon.end_minute - route.horizon.start_minute, total_distance_km: 0, total_wait_minutes: 0 } }, settings) };
    return buildOutputRoute({ ...withCost, horizon_id: route.horizon.id, validation: validateRouteRun(withCost, vehicles.length) }, index);
  });

  const scenarios = await generateManualRoutePlanningAdvice(unassigned, routeStates, vehicles, apiKey, travelCache, settings);
  const totals = {
    total_travel_minutes: outputRoutes.reduce((s, r) => s + r.stats.total_travel_minutes, 0),
    total_service_minutes: outputRoutes.reduce((s, r) => s + r.stats.total_service_minutes, 0),
    total_wait_minutes: outputRoutes.reduce((s, r) => s + r.stats.total_wait_minutes, 0),
    total_distance_km: r2(outputRoutes.reduce((s, r) => s + r.stats.total_distance_km, 0)),
    total_cost: r2(outputRoutes.reduce((s, r) => s + (r.route_cost || 0), 0)),
  };

  debug.planned_routes = outputRoutes.map(r => ({ route: r.id, vehicle: r.vehicle?.license_plate, start: r.time_window_start, end: r.time_window_end, tasks: r.tasks.length, valid: r.validation?.valid, errors: r.validation?.errors || [] }));
  debug.unassigned_tasks = unassigned.map(t => ({ task: t.name, primaryReason: t.primaryReason, best_failed_insertion: t.skip_reason, cheapest_solution: scenarios.lowest_cost?.description || null }));

  return {
    planning_mode: 'manual_route_fill',
    manual_routes_used: true,
    horizons: routeStates.map(r => r.horizon),
    routes: outputRoutes,
    skipped_tasks: unassigned,
    advice: generateAdvice(unassigned, vehicles, outputRoutes, outputRoutes.some(r => r.stats.has_estimated_travel)),
    scenarios,
    totals,
    vehicle_count: vehicles.length,
    max_concurrent_routes: maxConcurrentRoutes(outputRoutes),
    total_tasks_input: taskInstances.length,
    total_tasks_planned: outputRoutes.reduce((s, r) => s + r.tasks.length, 0),
    total_tasks_skipped: unassigned.length,
    total_routes_created: 0,
    has_estimated_travel: outputRoutes.some(r => r.stats.has_estimated_travel),
    debug_report: debug,
  };
}

async function generateManualRoutePlanningAdvice(unassignedTasks, existingRoutes, vehicles, apiKey, travelCache, settings) {
  const extension = [];
  const earlierStart = [];
  const newRoute = [];

  for (const task of unassignedTasks.filter(t => !t.missing_coords)) {
    for (const route of existingRoutes) {
      if (route.allowExtensionAfter) {
        const extended = { ...route, horizon: { ...route.horizon, end_minute: route.horizon.end_minute + Math.min(route.maxExtensionAfterMinutes || 60, 60), end_time: formatTime(route.horizon.end_minute + Math.min(route.maxExtensionAfterMinutes || 60, 60)) } };
        const scheduled = await scheduleSequenceInManualWindow([...route.tasks, task], extended, apiKey, travelCache, settings);
        if (scheduled) extension.push({ route_id: route.id, route_name: route.name, extend_minutes: extended.horizon.end_minute - route.horizon.end_minute, tasks: [task.name], extra_cost: r2(calculateRouteCost({ ...extended, ...scheduled }, settings) - calculateRouteCost(route, settings)), extra_km: scheduled.stats.total_distance_km - (route.stats?.total_distance_km || 0), description: `Verleng ${route.name} met ${extended.horizon.end_minute - route.horizon.end_minute} minuten om ${task.name} te plaatsen.` });
      }
      const earlier = { ...route, horizon: { ...route.horizon, start_minute: route.horizon.start_minute - Math.min(route.maxExtensionBeforeMinutes || 30, 30), start_time: formatTime(route.horizon.start_minute - Math.min(route.maxExtensionBeforeMinutes || 30, 30)) } };
      const scheduledEarlier = await scheduleSequenceInManualWindow([task, ...route.tasks], earlier, apiKey, travelCache, settings);
      if (scheduledEarlier) earlierStart.push({ route_id: route.id, route_name: route.name, earlier_minutes: route.horizon.start_minute - earlier.horizon.start_minute, tasks: [task.name], extra_cost: r2(calculateRouteCost({ ...earlier, ...scheduledEarlier }, settings) - calculateRouteCost(route, settings)), description: `Start ${route.name} ${route.horizon.start_minute - earlier.horizon.start_minute} minuten eerder om ${task.name} te plaatsen.` });
    }

    if (extension.length === 0 && earlierStart.length === 0) {
      const routeWindow = normalizeWindowToHorizon(task.time_window_start, task.time_window_end, 0, 2880);
      newRoute.push({
        warning: 'Deze voorgestelde route bevat slechts 1 taak. Controleer of verlengen van een bestaande route logischer is.',
        proposed_start_time: formatTime(routeWindow.start - 30),
        proposed_end_time: formatTime(routeWindow.start + Math.max(settings.minimumOperationalRouteMinutes, task.duration_minutes + 60)),
        vehicle: vehicles[0]?.license_plate || vehicles[0]?.name,
        region: task.address,
        tasks: [task.name],
        cost_note: 'Inclusief vaste routekosten, minimum betaalde minuten en depotritten.',
        reason: 'Geen bestaande route of beperkte verlenging kon deze taak haalbaar opnemen.',
      });
    }
  }

  return {
    exact_existing_routes: { label: 'Scenario A: bestaande routes exact houden', description: 'Handmatige start- en eindtijden blijven ongewijzigd.', unassigned_count: unassignedTasks.length },
    extend_routes: { label: 'Scenario B: routes licht verlengen', suggestions: extension },
    start_earlier: { label: 'Scenario C: routes eerder starten', suggestions: earlierStart },
    propose_new_route: { label: 'Scenario D: nieuwe route voorstellen', suggestions: newRoute },
    lowest_cost: { label: 'Scenario E: laagste totale kosten', description: extension.length ? 'Routeverlenging lijkt goedkoper dan een nieuwe route.' : newRoute.length ? 'Nieuwe route is alleen als voorstel opgenomen omdat bestaande routes niet voldoende waren.' : 'Bestaande routes exact houden is voldoende.' },
  };
}

async function runGlobalFleetOptimizer(taskInstances, vehicles, offices, apiKey, travelCache, weekday, settings) {
  const depot = fixCoords(offices[0]);
  const missingCoordTasks = taskInstances.filter(t => t.missing_coords).map(t => ({
    ...t,
    primaryReason: 'missing_coordinates',
    skip_reason: 'Ontbrekende coördinaten. Voeg coördinaten of een geldig adres toe aan het object.',
    advice: 'Coördinaten toevoegen via Objecten.',
  }));
  const plannableTasks = taskInstances.filter(t => !t.missing_coords);
  const horizons = derivePlanningHorizons(plannableTasks, offices, settings);
  const debug = {
    horizons,
    tasks: taskInstances.map(t => ({
      name: t.name,
      location: t.address,
      coordinates_status: t.missing_coords ? 'missing_coordinates' : 'ok',
      duration_minutes: t.duration_minutes,
      time_window: `${t.time_window_start}–${t.time_window_end}`,
      available_days: t.weekdays || [],
      priority: t.priority,
      included: !t.missing_coords,
      reason_if_excluded: t.missing_coords ? 'missing_coordinates' : null,
    })),
    route_candidates: horizons.map(h => ({
      start_time: h.start_time,
      end_time: h.end_time,
      geographic_cluster: 'automatisch geclusterd op tijdvensters en nabijheid',
      chosen: true,
      reason_rejected: null,
      estimated_costs: null,
      feasibility: 'wordt gevalideerd na taakplaatsing',
    })),
    planned_routes: [],
    unassigned_tasks: [],
    placement_explanations: [],
  };

  let finalRoutes = [];
  let unassigned = [...missingCoordTasks];

  for (const horizon of horizons) {
    const horizonTasks = plannableTasks.filter(task => horizon.task_ids.includes(task.id));
    const optimized = await optimizeHorizonTasks(horizonTasks, horizon, vehicles, depot, apiKey, travelCache, settings, debug);
    finalRoutes.push(...optimized.routes);
    unassigned.push(...optimized.unassigned);
  }

  finalRoutes = finalRoutes.map(buildOutputRoute);
  const hasEstimatedTravel = finalRoutes.some(route => route.stats.has_estimated_travel);
  const maxConcurrent = maxConcurrentRoutes(finalRoutes);
  const totals = {
    total_travel_minutes: finalRoutes.reduce((s, r) => s + r.stats.total_travel_minutes, 0),
    total_service_minutes: finalRoutes.reduce((s, r) => s + r.stats.total_service_minutes, 0),
    total_wait_minutes: finalRoutes.reduce((s, r) => s + r.stats.total_wait_minutes, 0),
    total_distance_km: r2(finalRoutes.reduce((s, r) => s + r.stats.total_distance_km, 0)),
    total_cost: r2(finalRoutes.reduce((s, r) => s + (r.route_cost || 0), 0)),
  };

  debug.planned_routes = finalRoutes.map(route => ({
    vehicle: route.vehicle?.license_plate || route.vehicle?.name,
    start_time: route.time_window_start,
    end_time: route.time_window_end,
    total_travel_minutes: route.stats.total_travel_minutes,
    total_service_minutes: route.stats.total_service_minutes,
    total_wait_minutes: route.stats.total_wait_minutes,
    total_distance_km: route.stats.total_distance_km,
    total_cost: route.route_cost,
    validation: route.validation?.valid,
    validation_errors: route.validation?.errors || [],
  }));
  debug.unassigned_tasks = unassigned.map(task => ({
    task: task.name,
    primaryReason: task.primaryReason,
    secondaryReasons: [],
    best_failed_insertion: task.skip_reason,
    needed_extra_capacity: task.primaryReason === 'insufficient_vehicle_count_at_required_time' ? 1 : 0,
  }));

  const advice = generateAdvice(unassigned, vehicles, finalRoutes, hasEstimatedTravel);

  return {
    planning_mode: 'automatic_day_night',
    horizons,
    routes: finalRoutes,
    skipped_tasks: unassigned,
    non_relevant_tasks: [],
    advice,
    totals,
    vehicle_count: vehicles.length,
    max_concurrent_routes: maxConcurrent,
    total_tasks_input: taskInstances.length,
    total_tasks_planned: finalRoutes.reduce((s, r) => s + r.tasks.length, 0),
    total_tasks_skipped: unassigned.length,
    total_routes_created: finalRoutes.length,
    has_estimated_travel: hasEstimatedTravel,
    debug_report: debug,
  };
}

function generateAdvice(unassignedTasks, vehicles, routes, hasEstimatedTravel) {
  const advice = [];
  const missing = unassignedTasks.filter(t => t.primaryReason === 'missing_coordinates');
  if (missing.length) {
    advice.push({ type: 'missing_coordinates', message: `${missing.length} taak(en) hebben geen coördinaten.`, action: 'Voeg coördinaten toe bij de gekoppelde objecten.' });
  }
  const capacity = unassignedTasks.filter(t => t.primaryReason === 'insufficient_vehicle_count_at_required_time');
  if (capacity.length) {
    advice.push({ type: 'extra_vehicle_needed', message: `${capacity.length} taak(en) vragen extra gelijktijdige voertuigcapaciteit.`, action: 'Voeg een voertuig toe of verruim tijdvensters.' });
  }
  const impossible = unassignedTasks.filter(t => t.primaryReason === 'impossible_even_with_empty_route');
  if (impossible.length) {
    advice.push({ type: 'no_feasible_time_window', message: `${impossible.length} taak(en) passen zelfs niet in een lege route.`, action: 'Controleer tijdvenster, taakduur, locatie en depotafstand.' });
  }
  if (hasEstimatedTravel) {
    advice.push({ type: 'estimated_travel', message: 'Een deel van de reistijden is geschat omdat Google Maps geen definitieve route gaf.', action: 'Controleer de planning voordat je deze opslaat.' });
  }
  if (routes.some(r => r.validation && !r.validation.valid)) {
    advice.push({ type: 'validation', message: 'Minstens één route is ongeldig verklaard.', action: 'Bekijk de validatiefouten per route.' });
  }
  return advice;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const weekday = body.weekday;
    const saveRoutes = !!body.save_routes;
    const settings = { ...DEFAULT_SETTINGS, ...(body.settings || {}) };

    if (!weekday) return Response.json({ error: 'weekday is verplicht (1=maandag, 7=zondag)' }, { status: 400 });
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) return Response.json({ error: 'Google Maps API key niet geconfigureerd' }, { status: 500 });

    const [tasks, objects, collectiefs, vehicles, offices, folders] = await Promise.all([
      base44.entities.Task.list(),
      base44.entities.SurveillanceObject.list(),
      base44.entities.Collectief.list(),
      base44.entities.Vehicle.list(),
      base44.entities.Office.list(),
      base44.entities.RouteFolder.list(),
    ]);

    const activeVehicles = vehicles.filter(v => v.is_active !== false);
    if (activeVehicles.length === 0) return Response.json({ error: 'Geen actieve voertuigen gevonden. Voeg voertuigen toe.' }, { status: 400 });
    if (offices.length === 0) return Response.json({ error: 'Geen depot/kantoor gevonden. Voeg eerst een kantoor toe bij instellingen.' }, { status: 400 });

    const { instances, nonRelevant } = prepareTaskInstances(tasks, objects, collectiefs, weekday);
    const travelCache = new Map();
    const manualRoutes = (await base44.entities.Route.list()).filter(route =>
      (route.weekdays || []).includes(weekday) &&
      (route.source || 'manual') === 'manual' &&
      route.status !== 'vergrendeld' &&
      route.time_window_start &&
      route.time_window_end
    );

    const result = manualRoutes.length > 0
      ? await fillExistingManualRoutesOptimizer(instances, manualRoutes, activeVehicles, objects, offices, apiKey, travelCache, weekday, settings)
      : await runGlobalFleetOptimizer(instances, activeVehicles, offices, apiKey, travelCache, weekday, settings);

    result.non_relevant_tasks = nonRelevant;
    result.total_tasks_not_relevant = nonRelevant.length;

    if (saveRoutes && result.has_estimated_travel) {
      return Response.json({ error: 'Deze planning bevat geschatte reistijden. Controleer Google Maps/adressen voordat je definitief opslaat.', result }, { status: 409 });
    }

    if (saveRoutes && result.planning_mode === 'manual_route_fill') {
      for (const route of result.routes) {
        if (route.validation && !route.validation.valid) continue;
        await base44.asServiceRole.entities.Route.update(route.id, {
          assigned_tasks: route.tasks.map(task => ({ task_id: task.task_id, days: [weekday] })),
          total_service_minutes: route.stats.total_service_minutes,
          total_distance_km: route.stats.total_distance_km,
          total_route_minutes: route.stats.total_route_minutes,
          status: 'geoptimaliseerd',
          cached_optimization: {
            optimized_order: route.tasks,
            total_travel_time: route.stats.total_travel_minutes,
            total_distance_km: route.stats.total_distance_km,
            total_service_time: route.stats.total_service_minutes,
            total_waiting_time: route.stats.total_wait_minutes,
            total_route_time: route.stats.total_route_minutes,
            route_cost: route.route_cost,
            validation: route.validation,
            source: 'manual_route_fill',
            tasks_optimized: route.tasks.length,
            tasks_skipped: 0,
            skipped_tasks: [],
          },
          optimization_calculated_at: new Date().toISOString(),
          optimization_hash: JSON.stringify({ taskIds: route.tasks.map(t => t.task_id), vehicleId: route.vehicle?.id, routeId: route.id, mode: result.planning_mode }),
        });
      }
    } else if (saveRoutes && result.routes.length > 0) {
      let folderId = folders[0]?.id;
      if (!folderId) {
        const newFolder = await base44.asServiceRole.entities.RouteFolder.create({ name: 'Automatisch gegenereerd', color: 'blue' });
        folderId = newFolder.id;
      }
      const weekdayLabels = { 1: 'Maandag', 2: 'Dinsdag', 3: 'Woensdag', 4: 'Donderdag', 5: 'Vrijdag', 6: 'Zaterdag', 7: 'Zondag' };
      for (let i = 0; i < result.routes.length; i++) {
        const route = result.routes[i];
        if (route.validation && !route.validation.valid) continue;
        await base44.asServiceRole.entities.Route.create({
          name: `${weekdayLabels[weekday]} - Auto route ${i + 1}${route.vehicle ? ` (${route.vehicle.license_plate || route.vehicle.name})` : ''}`,
          folder_id: folderId,
          vehicle_id: route.vehicle?.id || null,
          time_window_start: route.time_window_start,
          time_window_end: route.time_window_end,
          weekdays: [weekday],
          assigned_tasks: route.tasks.map(task => ({ task_id: task.task_id, days: [weekday] })),
          total_service_minutes: route.stats.total_service_minutes,
          total_distance_km: route.stats.total_distance_km,
          total_route_minutes: route.stats.total_route_minutes,
          cached_optimization: {
            optimized_order: route.tasks,
            total_travel_time: route.stats.total_travel_minutes,
            total_distance_km: route.stats.total_distance_km,
            total_service_time: route.stats.total_service_minutes,
            total_waiting_time: route.stats.total_wait_minutes,
            total_route_time: route.stats.total_route_minutes,
            route_cost: route.route_cost,
            validation: route.validation,
            automatic_horizon: result.horizons.find(h => h.id === route.horizon_id),
            tasks_optimized: route.tasks.length,
            tasks_skipped: 0,
            skipped_tasks: [],
          },
          optimization_calculated_at: new Date().toISOString(),
          optimization_hash: JSON.stringify({ taskIds: route.tasks.map(t => t.task_id), vehicleId: route.vehicle?.id, horizonId: route.horizon_id, mode: result.planning_mode }),
        });
      }
    }

    return Response.json({ ...result, weekday, generated_at: new Date().toISOString(), saved: saveRoutes });
  } catch (error) {
    console.error('Fleet optimizer error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});