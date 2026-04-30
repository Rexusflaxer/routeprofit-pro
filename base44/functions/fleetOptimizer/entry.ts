import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ============================================================
// FLEET OPTIMIZER - werkt met bestaande Route + Task entities
// ============================================================

const OPTIMIZER_VERSION = '2.0.0';
const GOOGLE_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minutesToTime(m) {
  const total = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function r2(n) { return Math.round((n || 0) * 100) / 100; }

function getWeekday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

// Haversine distance in km
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getTravelTime(lat1, lng1, lat2, lng2, cache) {
  const key = `${r2(lat1)},${r2(lng1)}->${r2(lat2)},${r2(lng2)}`;
  if (cache.has(key)) return cache.get(key);

  if (GOOGLE_API_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${lat1},${lng1}&destination=${lat2},${lng2}&mode=driving&key=${GOOGLE_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'OK' && data.routes?.length > 0) {
        let secs = 0, meters = 0;
        data.routes[0].legs.forEach(l => { secs += l.duration.value; meters += l.distance.value; });
        const result = { minutes: Math.round(secs / 60), km: r2(meters / 1000) };
        cache.set(key, result);
        return result;
      }
    } catch (e) { /* fallback */ }
  }

  // Haversine fallback
  const distKm = haversineKm(lat1, lng1, lat2, lng2);
  const result = { minutes: Math.round(distKm / 0.6), km: r2(distKm) };
  cache.set(key, result);
  return result;
}

// Fix possible swapped lat/lng (NL: lat ~52, lng ~5)
function fixCoords(lat, lng) {
  if (!lat || !lng) return { lat, lng };
  if (Math.abs(lat) < Math.abs(lng) && Math.abs(lng) > 10) return { lat: lng, lng: lat };
  return { lat, lng };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { planning_date, horizon_start = '17:30', horizon_end = '08:30', settings = {} } = body;

    if (!planning_date) return Response.json({ error: 'planning_date is verplicht' }, { status: 400 });

    const weekday = getWeekday(planning_date);
    const horizonStartMin = timeToMinutes(horizon_start);
    let horizonEndMin = timeToMinutes(horizon_end);
    if (horizonEndMin <= horizonStartMin) horizonEndMin += 1440;

    // --- Laad alle benodigde data ---
    const [allRoutes, allTasks, allObjects, allOffices, allVehicles] = await Promise.all([
      base44.entities.Route.list(),
      base44.entities.Task.list(),
      base44.entities.SurveillanceObject.list(),
      base44.entities.Office.list(),
      base44.entities.Vehicle.list(),
    ]);

    const travelCache = new Map();

    // Helper: coördinaten ophalen voor een object of kantoor
    const getCoords = (id) => {
      const obj = allObjects.find(o => o.id === id);
      if (obj) {
        const { lat, lng } = fixCoords(obj.latitude, obj.longitude);
        return { lat, lng, name: obj.name, address: obj.address };
      }
      const office = allOffices.find(o => o.id === id);
      if (office) {
        const { lat, lng } = fixCoords(office.latitude, office.longitude);
        return { lat, lng, name: office.name, address: office.address };
      }
      return null;
    };

    // --- Filter routes die actief zijn op de geselecteerde weekdag ---
    const activeRoutes = allRoutes.filter(r => {
      if (!r.weekdays || r.weekdays.length === 0) return true;
      return r.weekdays.includes(weekday);
    });

    if (activeRoutes.length === 0) {
      return Response.json({ error: `Geen routes gevonden voor weekdag ${weekday}` }, { status: 400 });
    }

    // --- Bouw route-runs op basis van bestaande routes ---
    const routeRuns = [];
    const unassignedTasks = [];

    for (const route of activeRoutes) {
      // Tijdvenster van de route zelf
      const routeStart = route.time_window_start ? timeToMinutes(route.time_window_start) : horizonStartMin;
      let routeEnd = route.time_window_end ? timeToMinutes(route.time_window_end) : horizonEndMin;
      if (routeEnd <= routeStart) routeEnd += 1440;

      // Voertuig ophalen
      const vehicle = allVehicles.find(v => v.id === route.vehicle_id);
      const vehicleLabel = vehicle
        ? `${vehicle.brand || ''} ${vehicle.model || ''} (${vehicle.license_plate})`.trim()
        : `Route: ${route.name}`;

      // Depot (start/eind)
      const depotStart = route.start_location_id ? getCoords(route.start_location_id) : null;
      const depotEnd = route.end_location_id ? getCoords(route.end_location_id) : depotStart;

      // Taken ophalen die aan deze route zijn toegewezen voor deze weekdag
      const assignedTaskEntries = (route.assigned_tasks || []).filter(at => {
        if (!at.days || at.days.length === 0) return true;
        return at.days.includes(weekday);
      });

      if (assignedTaskEntries.length === 0) continue;

      // Bouw stops op
      const stops = [];
      for (const entry of assignedTaskEntries) {
        const task = allTasks.find(t => t.id === entry.task_id);
        if (!task) continue;

        // Locatiecoördinaten
        let coords = null;
        if (task.object_id) coords = getCoords(task.object_id);

        if (!coords?.lat || !coords?.lng) {
          unassignedTasks.push({
            task_id: task.id,
            task_name: task.task_type,
            route_name: route.name,
            reason: 'Geen coördinaten voor dit object',
            advice: 'Voeg een geldig adres met coördinaten toe aan het object.',
          });
          continue;
        }

        // Tijdvenster van de taak (relatief aan horizon)
        let winStart = task.time_window_start ? timeToMinutes(task.time_window_start) : routeStart;
        let winEnd = task.time_window_end ? timeToMinutes(task.time_window_end) : routeEnd;
        if (winEnd <= winStart) winEnd += 1440;
        // Zorg dat vensters niet buiten het routevenster vallen
        if (winStart < routeStart) winStart = routeStart;
        if (winEnd > routeEnd) winEnd = routeEnd;

        stops.push({
          task_id: task.id,
          name: coords.name,
          address: coords.address,
          lat: coords.lat,
          lng: coords.lng,
          duration_minutes: task.duration_minutes || 0,
          window_start: winStart,
          window_end: winEnd,
          task_type: task.task_type,
          price_amount: task.price_amount,
          pricing_type: task.pricing_type,
        });
      }

      if (stops.length === 0) continue;

      // Optimaliseer volgorde met nearest-neighbor vanuit depot (of eerste stop)
      const depotLat = depotStart?.lat || stops[0].lat;
      const depotLng = depotStart?.lng || stops[0].lng;

      // Greedy nearest-neighbor sort
      const ordered = [];
      const remaining = [...stops];
      let curLat = depotLat;
      let curLng = depotLng;
      let curTime = routeStart;

      while (remaining.length > 0) {
        // Vind dichtstbijzijnde stop die nog in het venster past
        let bestIdx = -1;
        let bestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const s = remaining[i];
          const dist = haversineKm(curLat, curLng, s.lat, s.lng);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        }
        if (bestIdx === -1) break;
        const next = remaining.splice(bestIdx, 1)[0];
        ordered.push(next);
        curLat = next.lat;
        curLng = next.lng;
      }

      // Simuleer de route met exacte tijden
      let time = routeStart;
      let prevLat = depotLat;
      let prevLng = depotLng;
      let totalTravelMin = 0;
      let totalKm = 0;
      const simulatedStops = [];

      for (const stop of ordered) {
        const travel = await getTravelTime(prevLat, prevLng, stop.lat, stop.lng, travelCache);
        time += travel.minutes;
        totalTravelMin += travel.minutes;
        totalKm += travel.km;

        const arrivalTime = time;
        const startTime = Math.max(time, stop.window_start);
        const waitMin = startTime - arrivalTime;
        time = startTime + stop.duration_minutes;

        simulatedStops.push({
          ...stop,
          arrival_time: minutesToTime(arrivalTime),
          start_time: minutesToTime(startTime),
          departure_time: minutesToTime(time),
          wait_minutes: waitMin,
          travel_from_prev_minutes: travel.minutes,
          distance_from_prev_km: travel.km,
          overdue: time > stop.window_end,
        });

        prevLat = stop.lat;
        prevLng = stop.lng;
      }

      const totalTaskMin = simulatedStops.reduce((s, t) => s + t.duration_minutes, 0);
      const totalWaitMin = simulatedStops.reduce((s, t) => s + (t.wait_minutes || 0), 0);
      const costPerKm = settings.cost_per_km || vehicle?.fuel_cost_per_km || 0.35;
      const costPerMin = settings.cost_per_minute || 0.10;
      const fixedCost = settings.fixed_cost_per_route || 50;
      const routeCost = r2(fixedCost + totalKm * costPerKm + totalTravelMin * costPerMin);

      routeRuns.push({
        id: route.id,
        route_id: route.id,
        route_name: route.name,
        vehicle_id: route.vehicle_id,
        vehicle_label: vehicleLabel,
        depot_start_name: depotStart?.name || 'Startpunt',
        depot_end_name: depotEnd?.name || 'Eindpunt',
        planned_start_time: minutesToTime(routeStart),
        planned_end_time: minutesToTime(time),
        stops: simulatedStops,
        total_stops: simulatedStops.length,
        total_travel_minutes: totalTravelMin,
        total_task_minutes: totalTaskMin,
        total_wait_minutes: totalWaitMin,
        total_distance_km: r2(totalKm),
        total_route_minutes: time - routeStart,
        route_cost: routeCost,
        status: 'concept',
      });
    }

    if (routeRuns.length === 0) {
      return Response.json({ error: 'Geen routes met taken gevonden voor deze dag' }, { status: 400 });
    }

    const totalCost = r2(routeRuns.reduce((s, r) => s + r.route_cost, 0));
    const totalKm = r2(routeRuns.reduce((s, r) => s + r.total_distance_km, 0));
    const totalTravelMin = routeRuns.reduce((s, r) => s + r.total_travel_minutes, 0);
    const totalTaskMin = routeRuns.reduce((s, r) => s + r.total_task_minutes, 0);

    // Sla op als PlanningRun
    const saved = await base44.asServiceRole.entities.PlanningRun.create({
      planning_date,
      horizon_start,
      horizon_end,
      status: 'concept',
      vehicle_ids: [...new Set(routeRuns.map(r => r.vehicle_id).filter(Boolean))],
      route_runs: routeRuns,
      unassigned_tasks: unassignedTasks,
      total_cost: totalCost,
      total_distance_km: totalKm,
      total_travel_minutes: totalTravelMin,
      total_task_minutes: totalTaskMin,
      total_routes: routeRuns.length,
      tasks_planned: routeRuns.reduce((s, r) => s + r.total_stops, 0),
      tasks_unplanned: unassignedTasks.length,
      optimizer_version: OPTIMIZER_VERSION,
      settings_used: { ...settings, horizon_start, horizon_end },
    });

    return Response.json({
      id: saved.id,
      planning_date,
      horizon_start,
      horizon_end,
      weekday,
      status: 'concept',
      route_runs: routeRuns,
      unassigned_tasks: unassignedTasks,
      total_cost: totalCost,
      total_distance_km: totalKm,
      total_travel_minutes: totalTravelMin,
      total_task_minutes: totalTaskMin,
      total_routes: routeRuns.length,
      tasks_planned: routeRuns.reduce((s, r) => s + r.total_stops, 0),
      tasks_unplanned: unassignedTasks.length,
    });

  } catch (error) {
    console.error('Fleet optimizer error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});