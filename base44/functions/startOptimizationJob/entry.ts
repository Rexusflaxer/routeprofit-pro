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
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { ...location, latitude, longitude };
}

function buildRoutingVehicles(vehicles, offices, body) {
  const depot = fixCoords(offices[0]);
  const shiftStart = parseTimeToSeconds(body.shift_start || body.extra_route_start, 18 * 3600);
  let shiftEnd = parseTimeToSeconds(body.shift_end || body.extra_route_end, 27 * 3600);
  if (shiftEnd <= shiftStart) shiftEnd += 86400;

  return vehicles
    .filter(vehicle => vehicle.is_active !== false)
    .map((vehicle, index) => ({
      ...vehicle,
      id: vehicle.id || index + 1,
      name: vehicle.license_plate || vehicle.name || `Voertuig ${index + 1}`,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      start_lat: depot?.latitude,
      start_lon: depot?.longitude,
      end_lat: depot?.latitude,
      end_lon: depot?.longitude,
      skills: vehicle.skills || [1],
      cost_per_km: Number(vehicle.kostenPerKm ?? vehicle.fuel_cost_per_km ?? vehicle.cost_per_km ?? 0.35),
      cost_per_minute: Number(vehicle.kostenPerMinuutVoertuig ?? vehicle.cost_per_minute ?? 0.12),
      fixed_cost: Number(vehicle.vasteKostenPerRoute ?? vehicle.fixed_cost ?? 8),
    }))
    .filter(vehicle =>
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
    const weekdays = body.weekdays ?? (body.weekday ? [body.weekday] : [1]);

    const [tasks, objects, vehicles, offices, routes] = await Promise.all([
      base44.entities.Task.list(),
      base44.entities.SurveillanceObject.list(),
      base44.entities.Vehicle.list(),
      base44.entities.Office.list(),
      base44.entities.Route.list(),
    ]);

    const activeVehicles = buildRoutingVehicles(vehicles, offices, body);

    const payload = {
      ...body,
      weekdays,
      source: 'base44',
      description: body.description || `${weekdays.length === 1 ? 'Dagplanning' : 'Weekplanning'} optimaliseren`,
      tasks,
      objects,
      vehicles: activeVehicles,
      offices,
      routes,
      selection: {
        route_count_penalty_minutes: body.route_count_penalty_minutes ?? 45,
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
        vehicles: activeVehicles,
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