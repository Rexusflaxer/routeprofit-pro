import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const WEEKDAY_LABELS = {
  1: 'Maandag',
  2: 'Dinsdag',
  3: 'Woensdag',
  4: 'Donderdag',
  5: 'Vrijdag',
  6: 'Zaterdag',
  7: 'Zondag',
};

const DEFAULT_SERVICE_DAY_CUTOFF = '12:00';
const DEFAULT_AUTO_ROUTE_MINUTES = 480; // normale richtlijn 8 uur
const DEFAULT_MAX_AUTO_ROUTE_MINUTES = 600; // absolute max 10 uur
const DEFAULT_MIN_AUTO_ROUTE_MINUTES = 180; // wenselijke ondergrens 3 uur

function parseTimeToSeconds(time, fallback = 0) {
  if (time === null || time === undefined || time === '') return fallback;
  if (typeof time === 'number' && Number.isFinite(time)) return time;

  const parts = String(time).split(':').map(Number);
  const hours = parts[0];
  const minutes = parts[1] ?? 0;

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  return (hours * 3600) + (minutes * 60);
}

function normalizeEndAfterStart(start, end) {
  let normalizedEnd = end;
  if (normalizedEnd <= start) normalizedEnd += 86400;
  return normalizedEnd;
}

function formatSeconds(seconds) {
  const value = ((Math.round(seconds) % 86400) + 86400) % 86400;
  return `${String(Math.floor(value / 3600)).padStart(2, '0')}:${String(Math.floor((value % 3600) / 60)).padStart(2, '0')}`;
}

function r2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function nextWeekday(day) {
  return Number(day) === 7 ? 1 : Number(day) + 1;
}

function fixCoords(location) {
  if (!location) return null;

  const lat = Number(location.latitude);
  const lon = Number(location.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  // Veiligheidscheck voor omgewisselde lat/lon.
  if (lat < lon && lon > 40) {
    return {
      ...location,
      latitude: lon,
      longitude: lat,
    };
  }

  return {
    ...location,
    latitude: lat,
    longitude: lon,
  };
}

function getPlanningOptions(body = {}) {
  const serviceDayCutoff = parseTimeToSeconds(
    body.service_day_cutoff || DEFAULT_SERVICE_DAY_CUTOFF,
    parseTimeToSeconds(DEFAULT_SERVICE_DAY_CUTOFF)
  );

  return {
    serviceDayCutoff,
    weekdayMode: body.weekday_mode || 'service_day',
    shiftEarlyTasksToNextMorning: body.shift_early_tasks_to_next_morning !== false,
    includeNextDayEarlyTasks: !!body.include_next_day_early_tasks,
    allowAutomaticExtraRoutes: body.allow_automatic_extra_routes !== false,
    maxExtraVehiclesPerScenario: Math.max(0, Number(body.max_extra_vehicles_per_scenario ?? 2)),
    minAutoRouteMinutes: Math.max(0, Number(body.min_auto_route_minutes ?? DEFAULT_MIN_AUTO_ROUTE_MINUTES)),
    defaultAutoRouteMinutes: Math.max(60, Number(body.default_auto_route_minutes ?? DEFAULT_AUTO_ROUTE_MINUTES)),
    maxAutoRouteMinutes: Math.max(60, Number(body.max_auto_route_minutes ?? DEFAULT_MAX_AUTO_ROUTE_MINUTES)),
    routeCountPenaltyMinutes: Math.max(0, Number(body.route_count_penalty_minutes ?? 45)),
    waitPenaltyMultiplier: Math.max(0, Number(body.wait_penalty_multiplier ?? 1)),
    travelPenaltyMultiplier: Math.max(0, Number(body.travel_penalty_multiplier ?? 1)),
    debug: !!body.debug,
  };
}

function getVehicleCostProfile(vehicle = {}) {
  return {
    cost_per_km: Number(vehicle.kostenPerKm ?? vehicle.fuel_cost_per_km ?? vehicle.cost_per_km ?? 0.35),
    cost_per_minute: Number(vehicle.kostenPerMinuutVoertuig ?? vehicle.cost_per_minute ?? 0.12),
    fixed_cost: Number(vehicle.vasteKostenPerRoute ?? vehicle.fixed_cost ?? 8),
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

  return r2(
    profile.fixed_cost +
    (distanceKm * profile.cost_per_km) +
    (paidMinutes * profile.cost_per_minute)
  );
}

function locationById(id, objects, offices) {
  if (!id) return null;
  return fixCoords(
    objects.find(item => item.id === id) ||
    offices.find(item => item.id === id)
  );
}

function getManualRoutesForDay(day, routes) {
  return routes.filter(route =>
    (route.weekdays || []).includes(day) &&
    (route.source || 'manual') === 'manual' &&
    route.status !== 'vergrendeld' &&
    route.time_window_start &&
    (route.flexible_end_time || route.time_window_end)
  );
}

function getActiveVehicles(vehicles) {
  return vehicles.filter(vehicle => vehicle.is_active !== false);
}

function getUnusedActiveVehiclesForDay(day, routes, vehicles) {
  const activeVehicles = getActiveVehicles(vehicles);
  const manualRoutes = getManualRoutesForDay(day, routes);
  const usedVehicleIds = new Set(manualRoutes.map(route => route.vehicle_id).filter(Boolean));

  return activeVehicles.filter(vehicle => !usedVehicleIds.has(vehicle.id));
}

function buildExtraVehicleSubsets(extraVehicles, options) {
  if (!options.allowAutomaticExtraRoutes || !extraVehicles.length) return [[]];

  const maxVehicles = Math.min(
    Math.max(0, options.maxExtraVehiclesPerScenario),
    extraVehicles.length
  );

  const candidates = extraVehicles.slice(0, maxVehicles);
  const subsets = [[]];

  for (const vehicle of candidates) {
    subsets.push([vehicle.id]);
  }

  if (candidates.length > 1) {
    subsets.push(candidates.map(vehicle => vehicle.id));
  }

  if (candidates.length <= 3) {
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        subsets.push([candidates[i].id, candidates[j].id]);
      }
    }
  }

  const seen = new Set();
  return subsets.filter(subset => {
    const key = subset.slice().sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeWindow(startSeconds, endSeconds, label) {
  return {
    startSec: startSeconds,
    endSec: normalizeEndAfterStart(startSeconds, endSeconds),
    label,
  };
}

function generateExtraWindowCandidates(body, options) {
  const explicitStart = body.extra_route_start;
  const explicitEnd = body.extra_route_end;

  if (explicitStart || explicitEnd) {
    const startSec = parseTimeToSeconds(explicitStart, 18 * 3600);
    const rawEnd = parseTimeToSeconds(explicitEnd, startSec + (options.defaultAutoRouteMinutes * 60));

    return [
      makeWindow(startSec, rawEnd, 'explicit'),
    ];
  }

  const candidates = [
    makeWindow(18 * 3600, 27 * 3600, 'avond_18_03'),
    makeWindow((18 * 3600) + (30 * 60), 27 * 3600, 'avond_1830_03'),
    makeWindow(19 * 3600, (27 * 3600) + (30 * 60), 'avond_19_0330'),
    makeWindow((19 * 3600) + (30 * 60), (27 * 3600) + (30 * 60), 'avond_1930_0330'),

    // Belangrijk: echte nachtkandidaten.
    makeWindow(22 * 3600, (32 * 3600) + (30 * 60), 'nacht_22_0830'),
    makeWindow((23 * 3600) + (30 * 60), (32 * 3600) + (30 * 60), 'nacht_2330_0830'),

    // Belangrijk: ochtend-only kandidaten binnen dezelfde service-day.
    makeWindow(24 * 3600, (32 * 3600) + (30 * 60), 'nacht_00_0830'),
    makeWindow((28 * 3600) + (30 * 60), (32 * 3600) + (30 * 60), 'ochtend_0430_0830'),
    makeWindow(29 * 3600, (32 * 3600) + (30 * 60), 'ochtend_05_0830'),
  ];

  return candidates;
}

function buildVehiclesForDay(day, routes, vehicles, objects, offices, options = {}) {
  const activeVehicles = getActiveVehicles(vehicles);
  const manualRoutes = getManualRoutesForDay(day, routes);
  const depot = fixCoords(offices[0]);

  const usedVehicleIds = new Set(manualRoutes.map(route => route.vehicle_id).filter(Boolean));
  const allowedExtraVehicleIds = new Set(options.extraVehicleIds || []);

  const extraVehicles = activeVehicles.filter(vehicle =>
    !usedVehicleIds.has(vehicle.id) &&
    allowedExtraVehicleIds.has(vehicle.id)
  );

  const manualWindows = manualRoutes.map(route => {
    const start = parseTimeToSeconds(route.time_window_start, 0);

    let end = route.flexible_end_time
      ? start + Math.min(
          Number(route.max_route_minutes || options.defaultAutoRouteMinutes || DEFAULT_AUTO_ROUTE_MINUTES),
          Number(options.maxAutoRouteMinutes || DEFAULT_MAX_AUTO_ROUTE_MINUTES)
        ) * 60
      : parseTimeToSeconds(route.time_window_end, start + 43200);

    if (!route.flexible_end_time) {
      end = normalizeEndAfterStart(start, end);
    }

    return { start, end };
  });

  const fallbackStart = Number.isFinite(options.extraRouteStartSec)
    ? options.extraRouteStartSec
    : (manualWindows.length ? Math.min(...manualWindows.map(window => window.start)) : 18 * 3600);

  const fallbackEnd = Number.isFinite(options.extraRouteEndSec)
    ? options.extraRouteEndSec
    : (
        manualWindows.length
          ? Math.max(...manualWindows.map(window => window.end))
          : fallbackStart + Math.min(
              Number(options.defaultAutoRouteMinutes || DEFAULT_AUTO_ROUTE_MINUTES),
              Number(options.maxAutoRouteMinutes || DEFAULT_MAX_AUTO_ROUTE_MINUTES)
            ) * 60
      );

  const source = [
    ...manualRoutes.map(route => ({
      route,
      vehicle: activeVehicles.find(v => v.id === route.vehicle_id),
    })),
    ...extraVehicles.map(vehicle => ({
      route: null,
      vehicle,
    })),
  ];

  return source.map((item, index) => {
    const route = item.route;
    const vehicle = item.vehicle || activeVehicles[index % Math.max(1, activeVehicles.length)];

    if (!vehicle && !route) return null;

    const startDepot =
      locationById(route?.start_location_id || vehicle?.startDepotLocationId, objects, offices) ||
      depot;

    const endDepot =
      locationById(route?.end_location_id || vehicle?.eindDepotLocationId, objects, offices) ||
      startDepot;

    const shiftStart = route
      ? parseTimeToSeconds(route.time_window_start, 0)
      : fallbackStart;

    let shiftEnd = route
      ? (
          route.flexible_end_time
            ? shiftStart + Math.min(
                Number(route.max_route_minutes || options.defaultAutoRouteMinutes || DEFAULT_AUTO_ROUTE_MINUTES),
                Number(options.maxAutoRouteMinutes || DEFAULT_MAX_AUTO_ROUTE_MINUTES)
              ) * 60
            : parseTimeToSeconds(route.time_window_end, shiftStart + 43200)
        )
      : fallbackEnd;

    if (route && !route.flexible_end_time) {
      shiftEnd = normalizeEndAfterStart(shiftStart, shiftEnd);
    }

    if (!route && shiftEnd <= shiftStart) {
      shiftEnd += 86400;
    }

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
      _isExtraRoute: !route,
      _startDepot: startDepot,
      _endDepot: endDepot,
      _extraWindowLabel: options.extraWindowLabel || null,
    };
  }).filter(vehicle =>
    vehicle &&
    Number.isFinite(vehicle.start_lat) &&
    Number.isFinite(vehicle.start_lon) &&
    Number.isFinite(vehicle.end_lat) &&
    Number.isFinite(vehicle.end_lon) &&
    Number.isFinite(vehicle.shift_start) &&
    Number.isFinite(vehicle.shift_end) &&
    vehicle.shift_end > vehicle.shift_start
  );
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

      let latestDeparture = Number.isFinite(latestDepartureSeconds)
        ? latestDepartureSeconds + offset
        : deadline + serviceSeconds;

      if (latestDeparture <= deadline) latestDeparture += 86400;
      if (latestDeparture < deadline + serviceSeconds) latestDeparture = deadline + serviceSeconds;

      return {
        start: deadline,
        end: deadline,
        deadline,
        latestDeparture,
        overlap: vehicles.reduce((sum, vehicle) => {
          const overlap = Math.min(latestDeparture, vehicle.shift_end) - Math.max(deadline, vehicle.shift_start);
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

function getTaskOccurrencesForServiceDay(serviceDay, task, options) {
  const days = task.weekdays || [];
  const startSeconds = parseTimeToSeconds(task.time_window_start, 0);
  const occurrences = [];

  const noWeekdaysConfigured = !days.length;
  const isEarlyTask = startSeconds < options.serviceDayCutoff;

  if (noWeekdaysConfigured || days.includes(serviceDay)) {
    const offset = options.shiftEarlyTasksToNextMorning && isEarlyTask ? 86400 : 0;

    occurrences.push({
      occurrenceWeekday: serviceDay,
      serviceDay,
      offset,
      reason: isEarlyTask && offset ? 'early_shifted_to_next_morning' : 'same_service_day',
    });
  }

  if (options.weekdayMode === 'calendar' || options.includeNextDayEarlyTasks) {
    const nextDay = nextWeekday(serviceDay);

    if (days.includes(nextDay) && isEarlyTask) {
      occurrences.push({
        occurrenceWeekday: nextDay,
        serviceDay,
        offset: 86400,
        reason: 'next_calendar_day_early_morning',
      });
    }
  }

  const seen = new Set();
  return occurrences.filter(item => {
    const key = `${item.occurrenceWeekday}_${item.offset}_${item.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildTasksForDay(day, tasks, objects, vehicles, options = {}) {
  const optimizerTasks = [];
  const skipped = [];
  let numericId = 1;

  const addTask = (task, objectId, occurrence, suffix = '', durationOverrideMinutes = null) => {
    const object = fixCoords(objects.find(item => item.id === objectId));

    if (!object) {
      skipped.push({
        ...task,
        name: task.task_type || 'Taak',
        skip_reason: 'Geen bruikbare coördinaten gevonden.',
      });
      return;
    }

    const repeatCount = Math.max(1, Math.floor(Number(task.repeat_count || 1)));
    const baseDuration = Number(durationOverrideMinutes ?? task.duration_minutes ?? 15);
    const splitCount = automaticSplitCount(task, baseDuration);
    const serviceSeconds = Math.max(60, Math.ceil((baseDuration * 60) / splitCount));
    const minGapSeconds = Math.max(0, Number(task.min_minutes_between_visits || 0) * 60);

    const usesArrivalDeadline = task.task_type === 'Sluitbegeleiding' || !!task.use_arrival_deadline;
    const inferredDeadline = usesArrivalDeadline
      ? (task.arrival_deadline_time || task.time_window_start || task.time_window_end)
      : '';

    const occurrenceOffset = Number(occurrence?.offset || 0);

    const windowStart = parseTimeToSeconds(task.time_window_start, 0) + occurrenceOffset;
    const windowEnd = parseTimeToSeconds(task.time_window_end, 86340) + occurrenceOffset;

    const latestDeparture = usesArrivalDeadline && task.latest_departure_time
      ? parseTimeToSeconds(task.latest_departure_time, NaN) + occurrenceOffset
      : NaN;

    const normalizedWindow = usesArrivalDeadline
      ? normalizeDeadlineWindowForVehicles(
          parseTimeToSeconds(inferredDeadline, 86340) + occurrenceOffset,
          serviceSeconds,
          vehicles,
          latestDeparture
        )
      : normalizeTaskWindowForVehicles(windowStart, windowEnd, vehicles);

    const windowLength = Math.max(serviceSeconds, normalizedWindow.end - normalizedWindow.start);
    const totalGapSeconds = repeatCount > 1 ? (repeatCount - 1) * (minGapSeconds + serviceSeconds) : 0;
    const availableRepeatWindow = Math.max(serviceSeconds * repeatCount, windowLength - totalGapSeconds);
    const repeatSegment = repeatCount > 1
      ? Math.max(serviceSeconds, Math.floor(availableRepeatWindow / repeatCount))
      : windowLength;
    const repeatStep = repeatCount > 1
      ? repeatSegment + minGapSeconds + serviceSeconds
      : repeatSegment;

    for (let repeatIndex = 1; repeatIndex <= repeatCount; repeatIndex++) {
      const repeatStart = repeatCount > 1
        ? normalizedWindow.start + ((repeatIndex - 1) * repeatStep)
        : normalizedWindow.start;

      const repeatEnd = repeatCount > 1
        ? Math.min(normalizedWindow.end, repeatStart + repeatSegment)
        : normalizedWindow.end;

      for (let splitIndex = 1; splitIndex <= splitCount; splitIndex++) {
        const repeatLabel = repeatCount > 1 ? ` (${repeatIndex}/${repeatCount})` : '';
        const splitLabel = splitCount > 1 ? ` deel ${splitIndex}/${splitCount}` : '';
        const splitSegment = splitCount > 1
          ? Math.max(serviceSeconds, Math.floor((repeatEnd - repeatStart) / splitCount))
          : (repeatEnd - repeatStart);

        const splitStart = splitCount > 1
          ? repeatStart + ((splitIndex - 1) * splitSegment)
          : repeatStart;

        const splitEnd = splitCount > 1
          ? Math.min(repeatEnd, repeatStart + (splitIndex * splitSegment))
          : repeatEnd;

        const completeBeforeWindowEnd =
          task.task_type === 'Openingsronde' ||
          !!task.complete_before_window_end ||
          !!task.must_finish_within_window;

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

          // Deze velden kan de Python API later expliciet gebruiken.
          required: task.required !== false,
          complete_before_window_end: completeBeforeWindowEnd,
          cost_weight: Number(task.cost_weight || 1),

          _task: task,
          _object: object,
          _originalTaskId: task.id,
          _instanceId: `${task.id}${suffix}_d${occurrence?.occurrenceWeekday || day}_o${occurrence?.offset || 0}_r${repeatIndex}_p${splitIndex}`,
          _repeatIndex: repeatIndex,
          _repeatCount: repeatCount,
          _splitIndex: splitIndex,
          _splitCount: splitCount,
          _usesArrivalDeadline: usesArrivalDeadline,
          _arrivalDeadlineTime: inferredDeadline || '',
          _latestDepartureSeconds: usesArrivalDeadline ? normalizedWindow.latestDeparture : null,
          _serviceDay: day,
          _occurrenceWeekday: occurrence?.occurrenceWeekday || day,
          _occurrenceOffset: occurrenceOffset,
          _occurrenceReason: occurrence?.reason || '',
        });
      }
    }
  };

  for (const task of tasks) {
    const occurrences = getTaskOccurrencesForServiceDay(day, task, options);

    if (!occurrences.length) continue;

    for (const occurrence of occurrences) {
      if (task.collectief_id && task.selected_object_ids?.length) {
        const durationPerObject = Math.max(1, Number(task.duration_minutes || 15) / task.selected_object_ids.length);

        for (const objectId of task.selected_object_ids) {
          addTask(task, objectId, occurrence, `_${objectId}`, durationPerObject);
        }
      } else if (task.object_id) {
        addTask(task, task.object_id, occurrence);
      } else {
        skipped.push({
          ...task,
          name: task.task_type || 'Taak',
          skip_reason: 'Deze taak heeft geen gekoppeld object.',
        });
      }
    }
  }

  return { optimizerTasks, skipped };
}

async function callRoutingServer(payload) {
  const routingApiUrl = Deno.env.get('ROUTING_API_URL');
  const routingApiKey = Deno.env.get('ROUTING_API_KEY');

  if (!routingApiUrl || !routingApiKey) {
    throw new Error('Routing API secrets ontbreken.');
  }

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
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch (_error) {
    data = { raw_response: text };
  }

  if (!response.ok) {
    throw new Error(data?.error || data?.detail || data?.message || JSON.stringify(data) || 'Routing server gaf een fout terug.');
  }

  return data;
}

function applyMinimumRouteDuration(start, end, shiftStart, shiftEnd, minMinutes) {
  const minSeconds = Math.max(0, Number(minMinutes || 0) * 60);

  if (!minSeconds || end - start >= minSeconds) {
    return { start, end };
  }

  const currentDuration = Math.max(0, end - start);
  const missing = minSeconds - currentDuration;

  let newStart = Math.max(shiftStart, start - Math.floor(missing / 2));
  let newEnd = Math.min(shiftEnd, newStart + minSeconds);

  if (newEnd - newStart < minSeconds) {
    newStart = Math.max(shiftStart, newEnd - minSeconds);
  }

  if (newEnd < end) newEnd = end;
  if (newStart > start) newStart = start;

  return {
    start: newStart,
    end: Math.max(newEnd, newStart),
  };
}

function mapServerResult(serverResult, day, vehicles, optimizerTasks, preSkipped, options = {}) {
  const taskById = new Map(optimizerTasks.map(task => [task.id, task]));
  const plannedTaskIds = new Set();

  const routes = (serverResult.routes || [])
    .map((route, routeIndex) => {
      const vehicle = vehicles.find(item => item.id === route.vehicle_id) || vehicles[routeIndex] || {};
      const taskSteps = (route.steps || []).filter(step => step.type === 'task');

      // Extra automatische route zonder taken niet tonen en niet laten meetellen.
      if (vehicle._isExtraRoute && taskSteps.length === 0) {
        return null;
      }

      const routeTasks = taskSteps.map((step, stepIndex) => {
        const source = taskById.get(step.task_id) || {};
        plannedTaskIds.add(step.task_id);

        const previousStep = taskSteps[stepIndex - 1];
        const previousSource = previousStep ? (taskById.get(previousStep.task_id) || {}) : null;

        const arrivalSeconds = Number(step.arrival_seconds || 0);
        const serviceSeconds = Number(step.service_seconds || source.service_seconds || 0);

        const serviceStartSeconds = source._usesArrivalDeadline
          ? Math.max(arrivalSeconds, Number(source.window_start || arrivalSeconds))
          : arrivalSeconds;

        const departureSeconds = serviceStartSeconds + serviceSeconds;

        const previousArrival = previousStep ? Number(previousStep.arrival_seconds || 0) : null;
        const previousService = previousStep ? Number(previousStep.service_seconds || previousSource?.service_seconds || 0) : 0;

        const startTravelSeconds = Number(
          step.travel_from_previous_seconds ||
          step.travel_seconds ||
          step.travel_time_seconds ||
          0
        );

        const travelSeconds = previousStep
          ? Number(previousStep.travel_to_next_seconds || 0)
          : startTravelSeconds;

        const travelWaitingSeconds = previousStep
          ? Math.max(0, arrivalSeconds - previousArrival - previousService - travelSeconds)
          : Math.max(0, arrivalSeconds - (vehicle.shift_start || 0) - travelSeconds);

        const deadlineWaitingSeconds = Math.max(0, serviceStartSeconds - arrivalSeconds);
        const waitingSeconds = source._usesArrivalDeadline ? deadlineWaitingSeconds : travelWaitingSeconds;

        return {
          task_id: source._originalTaskId || String(step.task_id),
          optimizer_task_id: step.task_id,
          object_id: source._object?.id,
          name: step.name || source.name || 'Taak',
          address: source._object?.address || '',
          duration_minutes: Math.round(serviceSeconds / 60),

          time_window_start: source._usesArrivalDeadline
            ? (source._task?.time_window_start || formatSeconds(source.window_start || 0))
            : formatSeconds(source.window_start || 0),

          time_window_end: source._usesArrivalDeadline
            ? (source._task?.latest_departure_time || source._task?.time_window_end || formatSeconds(source._latestDepartureSeconds || source.window_start || 0))
            : formatSeconds(source.window_end || 86340),

          task_type: source._task?.task_type,
          repeat_index: source._repeatIndex,
          repeat_count: source._repeatCount,
          split_index: source._splitIndex,
          split_part_count: source._splitCount,
          is_split_part: (source._splitCount || 1) > 1,
          uses_arrival_deadline: source._usesArrivalDeadline,
          arrival_deadline_time: source._arrivalDeadlineTime,
          service_day: source._serviceDay,
          occurrence_weekday: source._occurrenceWeekday,
          occurrence_reason: source._occurrenceReason,

          arrival_time: formatSeconds(arrivalSeconds),
          actual_start_time: formatSeconds(serviceStartSeconds),
          departure_time: formatSeconds(departureSeconds),

          travel_time_minutes: Math.round(travelSeconds / 60),
          distance_km: previousStep
            ? Number(previousStep.distance_to_next_km || 0)
            : Number(step.distance_from_previous_km || step.distance_km || step.travel_distance_km || 0),

          waiting_time: Math.round(waitingSeconds / 60),
          travel_to_next_minutes: Number(step.travel_to_next_minutes ?? Math.round(Number(step.travel_to_next_seconds || 0) / 60)),
          distance_to_next_km: Number(step.distance_to_next_km || 0),
          sequence_index: stepIndex,
          placement_explanation: 'Gepland door eigen routing server.',
        };
      });

      const startLocation = vehicle._startDepot || null;
      const endLocation = vehicle._endDepot || null;

      const firstTask = routeTasks[0];
      const lastTask = routeTasks[routeTasks.length - 1];

      const shiftStartFormatted = formatSeconds(vehicle.shift_start || 0);

      const firstArrivalSeconds = firstTask
        ? parseTimeToSeconds(firstTask.arrival_time, 0) + (firstTask.arrival_time < shiftStartFormatted ? 86400 : 0)
        : null;

      const firstTravelSeconds = firstTask ? (firstTask.travel_time_minutes || 0) * 60 : 0;
      const startDepartureSeconds = firstTask
        ? Math.max(vehicle.shift_start || 0, firstArrivalSeconds - firstTravelSeconds)
        : (vehicle.shift_start || 0);

      const lastDepartureSeconds = lastTask
        ? parseTimeToSeconds(lastTask.departure_time, 0) + (lastTask.departure_time < shiftStartFormatted ? 86400 : 0)
        : null;

      const returnTravelSeconds = lastTask ? (lastTask.travel_to_next_minutes || 0) * 60 : 0;

      const compactStart = !!vehicle._isExtraRoute;
      const compactEnd = !!vehicle._isExtraRoute || !!vehicle._manualRoute?.flexible_end_time;

      let actualRouteStartSeconds = compactStart && firstTask
        ? startDepartureSeconds
        : (vehicle.shift_start || 0);

      let actualRouteEndSeconds = compactEnd && lastTask
        ? lastDepartureSeconds + returnTravelSeconds
        : (vehicle.shift_end || route.end_time_seconds || 0);

      if (vehicle._isExtraRoute && firstTask) {
        const adjusted = applyMinimumRouteDuration(
          actualRouteStartSeconds,
          actualRouteEndSeconds,
          vehicle.shift_start || actualRouteStartSeconds,
          vehicle.shift_end || actualRouteEndSeconds,
          options.minAutoRouteMinutes
        );

        actualRouteStartSeconds = adjusted.start;
        actualRouteEndSeconds = adjusted.end;
      }

      const startBlock = startLocation ? {
        name: `START: ${startLocation.name || 'Startlocatie'}`,
        address: startLocation.address || '',
        is_start: true,
        arrival_time: formatSeconds(actualRouteStartSeconds),
        actual_start_time: formatSeconds(actualRouteStartSeconds),
        departure_time: formatSeconds(startDepartureSeconds),
        travel_to_next_minutes: firstTask?.travel_time_minutes || 0,
        distance_to_next_km: firstTask?.distance_km || 0,
        waiting_time: Math.max(0, Math.round((startDepartureSeconds - actualRouteStartSeconds) / 60)),
      } : null;

      const endBlock = endLocation ? {
        name: `EIND: ${endLocation.name || 'Eindlocatie'}`,
        address: endLocation.address || '',
        is_end: true,
        arrival_time: formatSeconds(actualRouteEndSeconds),
        actual_start_time: formatSeconds(actualRouteEndSeconds),
        departure_time: formatSeconds(actualRouteEndSeconds),
        travel_time_minutes: lastTask?.travel_to_next_minutes || 0,
        distance_km: lastTask?.distance_to_next_km || 0,
        waiting_time: 0,
      } : null;

      const optimizedOrder = [startBlock, ...routeTasks, endBlock].filter(Boolean);
      const totalServiceMinutes = routeTasks.reduce((sum, task) => sum + (task.duration_minutes || 0), 0);
      const travelMinutes = Math.round(Number(route.total_travel_seconds || 0) / 60);
      const totalDistanceKm = Number(route.total_distance_km ?? ((Number(route.total_distance_meters || 0) / 1000).toFixed(2)));
      const totalWaitMinutes = routeTasks.reduce((sum, task) => sum + (task.waiting_time || 0), 0);

      const routeCost = calculateRouteCost({
        ...route,
        start_time_seconds: actualRouteStartSeconds,
        end_time_seconds: actualRouteEndSeconds,
      }, vehicle);

      return {
        id: vehicle._manualRoute?.id || `server_route_${day}_${routeIndex + 1}`,
        candidate_id: vehicle._manualRoute?.id || `server_route_${day}_${routeIndex + 1}`,
        manual_route_id: vehicle._manualRoute?.id || null,
        manual_route_name: vehicle._manualRoute?.name || null,
        is_extra_route: !!vehicle._isExtraRoute,
        extra_window_label: vehicle._extraWindowLabel || null,
        vehicle: vehicle._vehicle || { name: vehicle.name },
        weekday: day,
        time_window_start: formatSeconds(actualRouteStartSeconds),
        time_window_end: formatSeconds(actualRouteEndSeconds),
        flexible_end_time: !!vehicle._manualRoute?.flexible_end_time || !!vehicle._isExtraRoute,
        max_route_minutes: vehicle._manualRoute?.max_route_minutes || null,
        route_cost: routeCost,
        validation: { valid: true, errors: [] },
        tasks: routeTasks,
        optimized_order: optimizedOrder,
        total_route_time: Math.max(0, Math.round((actualRouteEndSeconds - actualRouteStartSeconds) / 60)),
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
          total_route_minutes: Math.max(0, Math.round((actualRouteEndSeconds - actualRouteStartSeconds) / 60)),
          has_estimated_travel: false,
        },
      };
    })
    .filter(Boolean);

  const serverUnassigned = (serverResult.unassigned || []).map(item => {
    const taskId = typeof item === 'object' ? item.task_id || item.id : item;
    const source = taskById.get(taskId) || {};

    return {
      ...source._task,
      name: source.name || 'Taak',
      skip_reason: item?.reason || 'Niet ingepland door de routing server.',
    };
  });

  const notVisited = optimizerTasks
    .filter(task =>
      !plannedTaskIds.has(task.id) &&
      !serverUnassigned.some(skipped => skipped.id === task._originalTaskId)
    )
    .map(task => ({
      ...task._task,
      name: task.name,
      skip_reason: 'Niet ingepland door de routing server.',
    }));

  const skippedTasks = [...preSkipped, ...serverUnassigned, ...notVisited];

  const totals = {
    total_travel_minutes: routes.reduce((sum, route) => sum + route.stats.total_travel_minutes, 0),
    total_service_minutes: routes.reduce((sum, route) => sum + route.stats.total_service_minutes, 0),
    total_wait_minutes: routes.reduce((sum, route) => sum + route.stats.total_wait_minutes, 0),
    total_duty_minutes: routes.reduce((sum, route) => sum + route.stats.total_route_minutes, 0),
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
    advice: skippedTasks.length
      ? [{
          type: 'server_unassigned',
          message: `${skippedTasks.length} taak(en) zijn niet ingepland.`,
          action: 'Controleer coördinaten, tijdvensters, dienstvensters en routecapaciteit.',
        }]
      : [],
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

function scorePlanningResult(result, options = {}) {
  const skipped = Number(result.total_tasks_skipped || result.skipped_tasks?.length || 0);
  const totals = result.totals || {};
  const routes = result.routes || [];

  const duty = Number(totals.total_duty_minutes || 0);
  const travel = Number(totals.total_travel_minutes || 0);
  const wait = Number(totals.total_wait_minutes || 0);
  const distance = Number(totals.total_distance_km || 0);
  const extraRoutes = routes.filter(route => route.is_extra_route).length;

  // Rangorde:
  // 1. Geen taken overslaan
  // 2. Zo laag mogelijke totale dienstduur
  // 3. Minder extra routes
  // 4. Minder wachttijd
  // 5. Minder reistijd
  // 6. Minder kilometers
  return (
    skipped * 1000000000 +
    duty * 10000 +
    extraRoutes * Number(options.routeCountPenaltyMinutes || 0) * 10000 +
    wait * Number(options.waitPenaltyMultiplier || 1) * 1000 +
    travel * Number(options.travelPenaltyMultiplier || 1) * 250 +
    distance * 10
  );
}

function summarizePlanningResult(result) {
  const routes = result.routes || [];

  const routeSummaries = routes.map(route => ({
    name: route.manual_route_name || route.vehicle?.license_plate || route.vehicle?.name || route.id,
    manual_route_id: route.manual_route_id || null,
    is_extra_route: !!route.is_extra_route,
    start: route.time_window_start,
    end: route.time_window_end,
    service_minutes: route.stats?.total_service_minutes || 0,
    travel_minutes: route.stats?.total_travel_minutes || 0,
    wait_minutes: route.stats?.total_wait_minutes || 0,
    duty_minutes: route.stats?.total_route_minutes || route.total_route_time || 0,
    task_count: route.tasks?.length || 0,
  }));

  return {
    routes: routeSummaries,
    total_duty_minutes: routeSummaries.reduce((sum, route) => sum + route.duty_minutes, 0),
    total_service_minutes: result.totals?.total_service_minutes || 0,
    total_travel_minutes: result.totals?.total_travel_minutes || 0,
    total_wait_minutes: result.totals?.total_wait_minutes || 0,
    total_distance_km: result.totals?.total_distance_km || 0,
    total_tasks_planned: result.total_tasks_planned || 0,
    total_tasks_skipped: result.total_tasks_skipped || 0,
    skipped_tasks: (result.skipped_tasks || []).map(task => ({
      name: task.name || task.task_type || 'Taak',
      reason: task.skip_reason || task.reason || '',
    })),
    scenario: result.selected_scenario || null,
  };
}

async function evaluateScenario({
  weekday,
  tasks,
  objects,
  vehicles,
  offices,
  routes,
  extraVehicleIds,
  extraWindow,
  body,
  options,
}) {
  const routingVehicles = buildVehiclesForDay(weekday, routes, vehicles, objects, offices, {
    ...options,
    extraVehicleIds,
    extraRouteStartSec: extraWindow?.startSec,
    extraRouteEndSec: extraWindow?.endSec,
    extraWindowLabel: extraWindow?.label || null,
  });

  if (!routingVehicles.length) {
    throw new Error('Geen bruikbare voertuigen of depots gevonden.');
  }

  const { optimizerTasks, skipped } = buildTasksForDay(weekday, tasks, objects, routingVehicles, options);

  const serverResult = optimizerTasks.length
    ? await callRoutingServer({
        max_solver_seconds: body.max_solver_seconds || 45,

        // Deze hints worden nu meegestuurd.
        // De Python API moet ze later ook echt gebruiken in de objective.
        objective: 'minimize_total_duty_duration',
        primary_optimization_goal: 'minimize_total_duty_duration',
        secondary_optimization_goal: 'minimize_travel_time',
        minimize_wait_time: true,
        minimize_vehicle_count: true,

        planning_options: {
          min_auto_route_minutes: options.minAutoRouteMinutes,
          default_auto_route_minutes: options.defaultAutoRouteMinutes,
          max_auto_route_minutes: options.maxAutoRouteMinutes,
        },

        vehicles: routingVehicles.map(vehicle => ({
          ...vehicle,

          // Voor toekomstige Python API objective.
          fixed_cost: vehicle._isExtraRoute ? Number(body.extra_vehicle_fixed_cost ?? 180) : 0,
          cost_per_km: Number(vehicle.cost_per_km ?? 0.35),
          cost_per_minute: Number(body.cost_per_minute ?? 1),
          cost_per_wait_minute: Number(body.cost_per_wait_minute ?? 1),
          cost_per_duty_minute: Number(body.cost_per_duty_minute ?? 1),
        })),

        tasks: optimizerTasks,
      })
    : {
        routes: [],
        unassigned: [],
        summary: {
          tasks_received: 0,
          tasks_assigned: 0,
          tasks_unassigned: 0,
        },
      };

  const mappedResult = mapServerResult(serverResult, weekday, routingVehicles, optimizerTasks, skipped, options);

  mappedResult.selected_scenario = {
    weekday,
    extra_vehicle_ids: extraVehicleIds,
    extra_vehicle_count: extraVehicleIds.length,
    extra_window_label: extraWindow?.label || null,
    extra_window_start: extraWindow ? formatSeconds(extraWindow.startSec) : null,
    extra_window_end: extraWindow ? formatSeconds(extraWindow.endSec) : null,
  };

  mappedResult._score = scorePlanningResult(mappedResult, options);
  mappedResult._total_duty_minutes = mappedResult.totals?.total_duty_minutes || 0;
  mappedResult._total_travel_minutes = mappedResult.totals?.total_travel_minutes || 0;
  mappedResult._total_wait_minutes = mappedResult.totals?.total_wait_minutes || 0;

  return mappedResult;
}

async function planServiceDay({
  weekday,
  tasks,
  objects,
  vehicles,
  offices,
  routes,
  body,
  options,
}) {
  const unusedVehicles = getUnusedActiveVehiclesForDay(weekday, routes, vehicles);
  const extraVehicleSubsets = buildExtraVehicleSubsets(unusedVehicles, options);
  const extraWindowCandidates = generateExtraWindowCandidates(body, options);

  const scenarios = [];

  for (const subset of extraVehicleSubsets) {
    const windowsToTry = subset.length
      ? extraWindowCandidates
      : [null];

    for (const window of windowsToTry) {
      const scenario = await evaluateScenario({
        weekday,
        tasks,
        objects,
        vehicles,
        offices,
        routes,
        extraVehicleIds: subset,
        extraWindow: window,
        body,
        options,
      });

      scenarios.push(scenario);
    }
  }

  scenarios.sort((a, b) => {
    const skippedDiff = (a.total_tasks_skipped || 0) - (b.total_tasks_skipped || 0);
    if (skippedDiff !== 0) return skippedDiff;

    return (a._score || 0) - (b._score || 0);
  });

  const best = scenarios[0];

  if (options.debug) {
    best.scenario_debug = scenarios.map(item => ({
      score: item._score,
      total_tasks_skipped: item.total_tasks_skipped,
      total_tasks_planned: item.total_tasks_planned,
      total_duty_minutes: item.totals?.total_duty_minutes || 0,
      total_travel_minutes: item.totals?.total_travel_minutes || 0,
      total_wait_minutes: item.totals?.total_wait_minutes || 0,
      total_distance_km: item.totals?.total_distance_km || 0,
      scenario: item.selected_scenario,
    }));
  }

  return best;
}

async function savePlannedRoutes(base44, plannedResult, weekdays) {
  const folders = await base44.entities.RouteFolder.list();
  let folderId = folders[0]?.id;

  if (!folderId) {
    const folder = await base44.asServiceRole.entities.RouteFolder.create({
      name: 'Eigen routing server',
      color: 'blue',
    });
    folderId = folder.id;
  }

  for (const weekday of weekdays) {
    const dayRoutes = (plannedResult.routes || []).filter(route =>
      !route.weekday || Number(route.weekday) === Number(weekday)
    );

    for (let index = 0; index < dayRoutes.length; index++) {
      const route = dayRoutes[index];

      const routeData = {
        folder_id: folderId,
        vehicle_id: route.vehicle?.id || null,
        weekdays: [weekday],
        time_window_start: route.time_window_start,
        time_window_end: route.time_window_end,
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

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // Directe passthrough voor losse API-tests vanuit Base44.
    if (body.vehicles && body.tasks) {
      return Response.json(await callRoutingServer(body));
    }

    const weekdays = body.weekdays ?? (body.weekday ? [body.weekday] : [1]);
    const saveRoutes = !!body.save_routes;
    const plannedResult = body.planned_result || null;

    if (saveRoutes && plannedResult) {
      await savePlannedRoutes(base44, plannedResult, weekdays);
      return Response.json({ ...plannedResult, saved: true });
    }

    const options = getPlanningOptions(body);

    const [tasks, objects, vehicles, offices, routes] = await Promise.all([
      base44.entities.Task.list(),
      base44.entities.SurveillanceObject.list(),
      base44.entities.Vehicle.list(),
      base44.entities.Office.list(),
      base44.entities.Route.list(),
    ]);

    const perDay = [];

    for (const weekday of weekdays) {
      const dayResult = await planServiceDay({
        weekday,
        tasks,
        objects,
        vehicles,
        offices,
        routes,
        body,
        options,
      });

      perDay.push(dayResult);
    }

    const routesOut = perDay.flatMap(day => day.routes || []);
    const skippedTasks = perDay.flatMap(day => day.skipped_tasks || []);

    const totals = {
      total_travel_minutes: perDay.reduce((sum, day) => sum + (day.totals?.total_travel_minutes || 0), 0),
      total_service_minutes: perDay.reduce((sum, day) => sum + (day.totals?.total_service_minutes || 0), 0),
      total_wait_minutes: perDay.reduce((sum, day) => sum + (day.totals?.total_wait_minutes || 0), 0),
      total_duty_minutes: perDay.reduce((sum, day) => sum + (day.totals?.total_duty_minutes || 0), 0),
      total_distance_km: Math.round(perDay.reduce((sum, day) => sum + (day.totals?.total_distance_km || 0), 0) * 100) / 100,
      total_cost: r2(perDay.reduce((sum, day) => sum + (day.totals?.total_cost || 0), 0)),
    };

    const finalResult = {
      planning_mode: 'eigen_routing_server',
      google_route_optimization: false,
      manual_routes_used: routesOut.some(route => route.manual_route_id),
      routes: routesOut,
      skipped_tasks: skippedTasks,
      non_relevant_tasks: [],
      advice: skippedTasks.length
        ? [{
            type: 'server_unassigned',
            message: `${skippedTasks.length} taak(en) zijn niet ingepland.`,
            action: 'Controleer coördinaten, tijdvensters, dienstvensters en routecapaciteit.',
          }]
        : [],
      horizons: [],
      totals,
      vehicle_count: vehicles.filter(vehicle => vehicle.is_active !== false).length,
      max_concurrent_routes: routesOut.length,
      total_tasks_input: perDay.reduce((sum, day) => sum + (day.total_tasks_input || 0), 0),
      total_tasks_planned: routesOut.reduce((sum, route) => sum + route.tasks.length, 0),
      total_tasks_skipped: skippedTasks.length,
      total_tasks_not_relevant: 0,
      total_routes_created: routesOut.length,
      has_estimated_travel: false,
      weekdays,
      selected_scenarios: perDay.map(day => day.selected_scenario),
      scenario_debug: options.debug ? perDay.map(day => day.scenario_debug || []) : undefined,
      generated_at: new Date().toISOString(),
      saved: false,
    };

    if (body.summary_only) {
      return Response.json(summarizePlanningResult(finalResult));
    }

    return Response.json(finalResult);
  } catch (error) {
    return Response.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
});