import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DAY_SECONDS = 86400;
const WEEK_SECONDS = 7 * DAY_SECONDS;

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

function parseTimeToSeconds(time, fallback = 0) {
  if (!time) return fallback;
  const [hours, minutes = 0] = String(time).split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  return (hours * 3600) + (minutes * 60);
}

function normalizeWeekday(day, fallback = 1) {
  const value = Number(day);
  if (value >= 1 && value <= 7) return value;
  return fallback;
}

function nextWeekday(day) {
  const n = normalizeWeekday(day, 1);
  return n === 7 ? 1 : n + 1;
}

function weekdayOffset(day) {
  return (normalizeWeekday(day, 1) - 1) * DAY_SECONDS;
}

function absoluteSeconds(weekday, time) {
  return weekdayOffset(weekday) + parseTimeToSeconds(time, 0);
}

function buildPlanningBlock(startWeekday, startTime, endWeekday, endTime) {
  const startAbs = absoluteSeconds(startWeekday, startTime);
  let endAbs = absoluteSeconds(endWeekday, endTime);

  if (endAbs <= startAbs) {
    endAbs += WEEK_SECONDS;
  }

  return {
    start_weekday: normalizeWeekday(startWeekday),
    start_time: startTime,
    end_weekday: normalizeWeekday(endWeekday),
    end_time: endTime,
    start_abs: startAbs,
    end_abs: endAbs,
  };
}

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return Math.min(aEnd, bEnd) > Math.max(aStart, bStart);
}

function isGeneratedRoute(route) {
  const source = String(route.source || 'manual').toLowerCase();
  const status = String(route.status || '').toLowerCase();

  return (
    ['automatic', 'server', 'generated', 'eigen_routing_server', 'suggested'].includes(source) ||
    ['geoptimaliseerd_automatisch', 'generated', 'suggested'].includes(status)
  );
}

function routeWindows(route) {
  const weekdays = Array.isArray(route.weekdays) && route.weekdays.length
    ? route.weekdays.map(day => normalizeWeekday(day)).filter(Boolean)
    : [];

  if (!weekdays.length || !route.time_window_start) return [];

  const windows = [];

  for (const weekday of weekdays) {
    const startClock = parseTimeToSeconds(route.time_window_start, null);
    if (startClock === null) continue;

    const startAbs = weekdayOffset(weekday) + startClock;
    let endAbs;

    if (route.flexible_end_time) {
      const maxMinutes = Math.max(1, Number(route.max_route_minutes || 600));
      endAbs = startAbs + (maxMinutes * 60);
    } else {
      const endClock = parseTimeToSeconds(route.time_window_end, null);
      if (endClock === null) continue;

      endAbs = weekdayOffset(weekday) + endClock;
      if (endAbs <= startAbs) endAbs += DAY_SECONDS;
    }

    windows.push({ weekday, start_abs: startAbs, end_abs: endAbs });
    windows.push({ weekday, start_abs: startAbs + WEEK_SECONDS, end_abs: endAbs + WEEK_SECONDS });
  }

  return windows;
}

function routeOverlapsPlanningBlock(route, planningBlock) {
  if (isGeneratedRoute(route)) return false;

  return routeWindows(route).some(window =>
    intervalsOverlap(window.start_abs, window.end_abs, planningBlock.start_abs, planningBlock.end_abs)
  );
}

function normalizeTaskType(value) {
  return String(value || '').trim();
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function taskTypesForObject(objectId, tasks) {
  const id = String(objectId);
  return unique(
    tasks
      .filter(task => String(task.object_id || '') === id)
      .map(task => normalizeTaskType(task.task_type))
      .filter(Boolean)
  );
}

function sanitizeTaskSpacingGroups(groups = [], objectTaskTypes = []) {
  const allowedTypes = new Set(objectTaskTypes || []);

  return (groups || [])
    .map((group, index) => {
      let taskTypes = unique(group.task_types || []);
      if (allowedTypes.size) taskTypes = taskTypes.filter(type => allowedTypes.has(type));

      return {
        id: String(group.id || `group_${index + 1}`),
        label: group.label || 'Taaksoorten uit elkaar houden',
        task_types: taskTypes,
        min_minutes: Number(group.min_minutes || 0),
        include_same_type: false,
      };
    })
    .filter(group => group.task_types.length >= 2 && Number(group.min_minutes) > 0);
}

function expandTaskSpacingGroups(groups = []) {
  const rules = [];

  for (const group of groups || []) {
    const types = unique(group.task_types || []);
    const minutes = Number(group.min_minutes || 0);

    if (types.length < 2 || minutes <= 0) continue;

    for (let i = 0; i < types.length; i++) {
      for (let j = i + 1; j < types.length; j++) {
        if (types[i] === types[j]) continue;
        rules.push({ task_type_a: types[i], task_type_b: types[j], min_minutes: minutes });
      }
    }
  }

  return rules;
}

function sanitizeManualSpacingRules(rules = [], objectTaskTypes = []) {
  const allowedTypes = new Set(objectTaskTypes || []);

  return (rules || [])
    .filter(rule => rule && rule.task_type_a && rule.task_type_b)
    .filter(rule => String(rule.task_type_a) !== String(rule.task_type_b))
    .filter(rule => Number(rule.min_minutes) > 0)
    .filter(rule => !allowedTypes.size || (allowedTypes.has(rule.task_type_a) && allowedTypes.has(rule.task_type_b)))
    .map(rule => ({
      task_type_a: rule.task_type_a,
      task_type_b: rule.task_type_b,
      min_minutes: Number(rule.min_minutes),
    }));
}

function getObjectTaskSpacingRules(object = {}, objectTaskTypes = []) {
  const groups = sanitizeTaskSpacingGroups(object.task_spacing_groups || [], objectTaskTypes);
  const fromGroups = expandTaskSpacingGroups(groups);
  const manualRules = sanitizeManualSpacingRules(object.task_spacing_rules || [], objectTaskTypes);
  const merged = new Map();

  for (const rule of [...fromGroups, ...manualRules]) {
    const key = [rule.task_type_a, rule.task_type_b].sort().join('||');
    const current = merged.get(key);
    if (!current || Number(rule.min_minutes) > Number(current.min_minutes)) merged.set(key, rule);
  }

  return [...merged.values()];
}

function relevantAssignedTasksForRoute(route) {
  return (route.assigned_tasks || []).map(item => ({
    task_id: String(item.task_id),
    locked_to_route: !!item.locked_to_route,
    locked_occurrence_count: item.locked_occurrence_count ?? null,
    repeat_index: item.repeat_index ?? null,
    lock_all_occurrences: !!item.lock_all_occurrences,
    locked_sequence: !!item.locked_sequence,
    sequence_index: item.sequence_index ?? null,
    days: item.days || [],
  }));
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const requestedWeekdays = body.weekdays ?? (body.weekday ? [body.weekday] : [1]);
    const displayWeekday = normalizeWeekday(body.display_weekday ?? requestedWeekdays[0] ?? 1);
    const selectedWeekday = displayWeekday;
    const selectedStartTime = body.planning_start_time || body.start_time || '17:30';
    const selectedEndWeekday = normalizeWeekday(body.planning_end_weekday || nextWeekday(selectedWeekday));
    const selectedEndTime = body.planning_end_time || body.end_time || '08:30';
    const planningBlock = buildPlanningBlock(selectedWeekday, selectedStartTime, selectedEndWeekday, selectedEndTime);
    const weekdays = [selectedWeekday];

    const [tasks, objects, vehicles, offices, routes] = await Promise.all([
      base44.entities.Task.list(),
      base44.entities.SurveillanceObject.list(),
      base44.entities.Vehicle.list(),
      base44.entities.Office.list(),
      base44.entities.Route.list(),
    ]);

    const cleanRoutes = routes
      .filter(route => routeOverlapsPlanningBlock(route, planningBlock))
      .map(route => ({
        id: String(route.id),
        name: route.name,
        source: route.source || 'manual',
        status: route.status || null,
        weekdays: (route.weekdays || []).map(Number),
        time_window_start: route.time_window_start,
        time_window_end: route.time_window_end,
        flexible_end_time: !!route.flexible_end_time,
        max_route_minutes: route.max_route_minutes || null,
        vehicle_id: route.vehicle_id ? String(route.vehicle_id) : null,
        start_location_id: route.start_location_id || null,
        end_location_id: route.end_location_id || null,
        closed_to_extra_tasks: !!route.closed_to_extra_tasks,
        allowed_task_types: route.allowed_task_types || [],
        excluded_task_ids: (route.excluded_task_ids || []).map(String),
        assigned_tasks: relevantAssignedTasksForRoute(route),
      }));

    const payloadTasks = tasks.map(task => ({
      ...task,
      id: String(task.id),
      object_id: task.object_id ? String(task.object_id) : task.object_id,
      task_type: task.task_type,
      repeat_count: Math.max(1, Number(task.repeat_count || 1)),
      min_minutes_between_visits: Math.max(0, Number(task.min_minutes_between_visits || 0)),
      use_custom_execution_blocks: !!task.use_custom_execution_blocks,
      custom_execution_blocks: Array.isArray(task.custom_execution_blocks) ? task.custom_execution_blocks : [],
      task_spacing_rules: Array.isArray(task.task_spacing_rules)
        ? sanitizeManualSpacingRules(task.task_spacing_rules, [task.task_type])
        : [],
    }));

    const payloadObjects = objects.map(object => {
      const objectId = String(object.id);
      const objectTaskTypes = taskTypesForObject(objectId, tasks);
      const cleanGroups = sanitizeTaskSpacingGroups(object.task_spacing_groups || [], objectTaskTypes);
      const cleanRules = getObjectTaskSpacingRules(object, objectTaskTypes);

      return {
        ...object,
        id: objectId,
        task_spacing_groups: cleanGroups,
        task_spacing_rules: cleanRules,
      };
    });

    const payload = {
      mode: 'time_block',
      source: 'timeblock_planning',
      display_weekday: selectedWeekday,
      planning_start_weekday: selectedWeekday,
      planning_start_time: selectedStartTime,
      planning_end_weekday: selectedEndWeekday,
      planning_end_time: selectedEndTime,
      planning_block: planningBlock,
      selection: {
        route_count_penalty_minutes: 60,
        min_auto_route_minutes: 180,
        wait_penalty_multiplier: 1,
        travel_penalty_multiplier: 1,
        max_solver_seconds: 60,
        max_extra_windows: 2,
        allow_extra_for_manual_vehicle: false,
        prefer_fewer_routes_first: body.prefer_fewer_routes_first !== false,
        enforce_cross_type_spacing_hard: false,
        spacing_repair_enabled: true,
        spacing_repair_iterations: 2,
        spacing_repair_max_constraints: 40,
        spacing_violation_fixed_penalty: 2500000,
        spacing_violation_minute_penalty: 100000,
      },
      tasks: payloadTasks,
      objects: payloadObjects,
      vehicles: vehicles.map(vehicle => ({ ...vehicle, id: String(vehicle.id) })),
      offices: offices.map(office => ({ ...office, id: String(office.id) })),
      routes: cleanRoutes,
      routing_debug: {
        route_count_before_filter: routes.length,
        route_count_after_filter: cleanRoutes.length,
        planning_block: planningBlock,
      },
    };

    const response = await fetch(`${routingBaseUrl()}/optimization-jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': routingApiKey(),
      },
      body: JSON.stringify(payload),
    });

    const data = await readJsonResponse(response);

    if (!response.ok) {
      return Response.json(data, { status: response.status });
    }

    const serverJobId = data.job_id || data.server_job_id;
    if (!serverJobId) {
      throw new Error('Routingserver gaf geen job_id terug.');
    }

    const job = await base44.asServiceRole.entities.OptimizationJob.create({
      server_job_id: serverJobId,
      status: data.status || 'queued',
      progress: Number(data.progress || 0),
      message: data.message || 'Optimalisatiejob aangemaakt',
      weekdays,
      request_payload: payload,
      started_at: data.started_at || null,
    });

    return Response.json({
      ...data,
      job_id: serverJobId,
      local_job_id: job.id,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});