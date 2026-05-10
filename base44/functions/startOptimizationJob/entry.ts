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

function parseTimeToSeconds(time, fallback) {
  if (!time) return fallback;
  const [hours, minutes = 0] = String(time).split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  return (hours * 3600) + (minutes * 60);
}

function fixCoords(location) {
  if (!location) return null;
  const lat = Number(location.latitude);
  const lon = Number(location.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  if (lat < lon && lon > 40) {
    return { ...location, latitude: lon, longitude: lat };
  }

  return { ...location, latitude: lat, longitude: lon };
}

function locationById(id, objects, offices) {
  if (!id) return null;
  return fixCoords(objects.find(item => item.id === id) || offices.find(item => item.id === id));
}

function isGeneratedRoute(route) {
  const source = String(route.source || 'manual').toLowerCase();
  return ['automatic', 'server', 'generated', 'eigen_routing_server', 'suggested'].includes(source);
}

function vehicleCostProfile(vehicle = {}) {
  return {
    cost_per_km: Number(vehicle.kostenPerKm ?? vehicle.fuel_cost_per_km ?? vehicle.cost_per_km ?? 0.35),
    cost_per_minute: Number(vehicle.kostenPerMinuutVoertuig ?? vehicle.cost_per_minute ?? 0.12),
    fixed_cost: Number(vehicle.vasteKostenPerRoute ?? vehicle.fixed_cost ?? 8),
  };
}

function makeRoutingVehicle({ id, vehicle, route, startDepot, endDepot, shiftStart, shiftEnd, weekday, isManualRoute }) {
  return {
    ...vehicle,
    ...vehicleCostProfile(vehicle),
    id,
    source_vehicle_id: vehicle.id,
    manual_route_id: route?.id || null,
    manual_route_name: route?.name || null,
    name: route?.name || vehicle.license_plate || vehicle.name || 'Voertuig',
    license_plate: vehicle.license_plate,
    shift_start: shiftStart,
    shift_end: shiftEnd,
    start_lat: startDepot?.latitude,
    start_lon: startDepot?.longitude,
    end_lat: endDepot?.latitude,
    end_lon: endDepot?.longitude,
    skills: vehicle.skills || [1],
    weekday,
    is_manual_route: !!isManualRoute,
  };
}

function buildRoutingVehicles(vehicles, routes, offices, objects, weekdays, body) {
  const activeVehicles = vehicles.filter(vehicle => vehicle.is_active !== false);
  const depot = fixCoords(offices[0]);
  const routingVehicles = [];

  for (const weekday of weekdays) {
    const manualRoutes = routes.filter(route =>
      (route.weekdays || []).includes(Number(weekday)) &&
      !isGeneratedRoute(route) &&
      route.vehicle_id &&
      route.time_window_start &&
      (route.flexible_end_time || route.time_window_end)
    );

    const usedVehicleIds = new Set();

    for (const route of manualRoutes) {
      const vehicle = activeVehicles.find(item => item.id === route.vehicle_id);
      if (!vehicle) continue;

      const shiftStart = parseTimeToSeconds(route.time_window_start, 18 * 3600);
      let shiftEnd = route.flexible_end_time
        ? shiftStart + (Number(route.max_route_minutes || 600) * 60)
        : parseTimeToSeconds(route.time_window_end, shiftStart + (9 * 3600));
      if (shiftEnd <= shiftStart) shiftEnd += 86400;

      routingVehicles.push(makeRoutingVehicle({
        id: `manual_${route.id}`,
        vehicle,
        route,
        startDepot: locationById(route.start_location_id || vehicle.startDepotLocationId, objects, offices) || depot,
        endDepot: locationById(route.end_location_id || vehicle.eindDepotLocationId, objects, offices) || depot,
        shiftStart,
        shiftEnd,
        weekday: Number(weekday),
        isManualRoute: true,
      }));

      usedVehicleIds.add(vehicle.id);
    }

    const extraShiftStart = parseTimeToSeconds(body.shift_start || body.extra_route_start, 18 * 3600);
    let extraShiftEnd = parseTimeToSeconds(body.shift_end || body.extra_route_end, 27 * 3600);
    if (extraShiftEnd <= extraShiftStart) extraShiftEnd += 86400;

    for (const vehicle of activeVehicles.filter(item => !usedVehicleIds.has(item.id))) {
      routingVehicles.push(makeRoutingVehicle({
        id: `extra_${weekday}_${vehicle.id}`,
        vehicle,
        route: null,
        startDepot: locationById(vehicle.startDepotLocationId, objects, offices) || depot,
        endDepot: locationById(vehicle.eindDepotLocationId, objects, offices) || depot,
        shiftStart: extraShiftStart,
        shiftEnd: extraShiftEnd,
        weekday: Number(weekday),
        isManualRoute: false,
      }));
    }
  }

  return routingVehicles.filter(vehicle =>
    Number.isFinite(vehicle.shift_start) &&
    Number.isFinite(vehicle.shift_end) &&
    vehicle.shift_end > vehicle.shift_start &&
    Number.isFinite(vehicle.start_lat) &&
    Number.isFinite(vehicle.start_lon) &&
    Number.isFinite(vehicle.end_lat) &&
    Number.isFinite(vehicle.end_lon)
  );
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
    const displayWeekday = Number(body.display_weekday ?? requestedWeekdays[0] ?? 1);
    const weekdays = [1, 2, 3, 4, 5, 6, 7];

    const [tasks, objects, vehicles, offices, routes] = await Promise.all([
      base44.entities.Task.list(),
      base44.entities.SurveillanceObject.list(),
      base44.entities.Vehicle.list(),
      base44.entities.Office.list(),
      base44.entities.Route.list(),
    ]);

    const routingVehicles = buildRoutingVehicles(vehicles, routes, offices, objects, weekdays, body);

    const payload = {
      ...body,
      mode: 'week',
      source: 'weekplanning',
      display_weekday: displayWeekday,
      weekdays,
      service_day_cutoff: body.service_day_cutoff || '12:00',
      description: body.description || `Weekplanning optimaliseren — tonen dag ${displayWeekday}`,
      tasks,
      objects,
      vehicles: routingVehicles,
      offices,
      routes,
      routing_debug: {
        routing_vehicle_count: routingVehicles.length,
        manual_route_vehicle_count: routingVehicles.filter(vehicle => vehicle.is_manual_route).length,
        extra_vehicle_count: routingVehicles.filter(vehicle => !vehicle.is_manual_route).length,
        routing_vehicles: routingVehicles.map(vehicle => ({
          id: vehicle.id,
          license_plate: vehicle.license_plate,
          manual_route_name: vehicle.manual_route_name,
          shift_start: vehicle.shift_start,
          shift_end: vehicle.shift_end,
          weekday: vehicle.weekday,
          is_manual_route: vehicle.is_manual_route,
        })),
      },
      selection: {
        route_count_penalty_minutes: body.route_count_penalty_minutes ?? 45,
        min_auto_route_minutes: body.min_auto_route_minutes ?? 180,
        wait_penalty_multiplier: body.wait_penalty_multiplier ?? 1,
        travel_penalty_multiplier: body.travel_penalty_multiplier ?? 1,
        max_solver_seconds: body.max_solver_seconds ?? 60,
        max_extra_windows: body.max_extra_windows ?? 3,
        priority_order: [
          'min_unassigned_required_tasks',
          'min_total_duty_minutes',
          'min_extra_routes',
          'min_wait_minutes',
          'min_travel_minutes',
          'min_distance_km',
        ],
        ...(body.selection || {}),
      },
      data: {
        tasks,
        objects,
        vehicles: routingVehicles,
        offices,
        routes,
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