import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ============================================================
// FLEET OPTIMIZER - Multi-Vehicle Routing with Time Windows
// ============================================================

const OPTIMIZER_VERSION = '1.0.0';
const GOOGLE_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');

// ----- Helpers -----
function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minutesToTime(m) {
  const total = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}
function r2(n) { return Math.round((n||0) * 100) / 100; }

// Normalize a task time window relative to horizon start (in minutes from horizon start).
// Handles windows that cross midnight.
function normalizeWindow(winStart, winEnd, horizonStartMin) {
  let s = timeToMinutes(winStart);
  let e = timeToMinutes(winEnd);
  if (e <= s) e += 1440; // crosses midnight
  // shift so that s is relative to horizon start
  // if s is before horizon start, shift by 1440
  if (s < horizonStartMin) s += 1440;
  if (e < horizonStartMin) e += 1440;
  // ensure s >= horizonStartMin
  return { start: s, end: e };
}

// Weekday of a date: 1=Mon, 7=Sun
function getWeekday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const js = d.getDay(); // 0=Sun
  return js === 0 ? 7 : js;
}

// ----- Travel Matrix -----
async function getTravelTime(originLat, originLng, destLat, destLng, cache) {
  const key = `${r2(originLat)},${r2(originLng)}->${r2(destLat)},${r2(destLng)}`;
  if (cache.has(key)) return cache.get(key);

  if (!GOOGLE_API_KEY) {
    // Fallback: Haversine estimate
    const R = 6371;
    const dLat = (destLat - originLat) * Math.PI / 180;
    const dLng = (destLng - originLng) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(originLat*Math.PI/180)*Math.cos(destLat*Math.PI/180)*Math.sin(dLng/2)**2;
    const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const minutes = Math.round(distKm / 0.6); // ~36 km/h avg
    const result = { minutes, km: r2(distKm), estimated: true };
    cache.set(key, result);
    return result;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&mode=driving&key=${GOOGLE_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK' && data.routes?.length > 0) {
      let secs = 0, meters = 0;
      (data.routes[0].legs || []).forEach(leg => { secs += leg.duration.value; meters += leg.distance.value; });
      const result = { minutes: Math.round(secs/60), km: r2(meters/1000), estimated: false };
      cache.set(key, result);
      return result;
    }
  } catch(e) { /* fallback */ }

  // Fallback on error
  const fallback = { minutes: 30, km: 15, estimated: true };
  cache.set(key, fallback);
  return fallback;
}

// ----- Cost calculation for a route -----
function calcRouteCost(route, settings) {
  const { cost_per_km = 0.35, cost_per_minute = 0.10, fixed_cost_per_route = 50 } = settings;
  const travelCost = route.total_travel_km * cost_per_km + route.total_travel_minutes * cost_per_minute;
  return r2(fixed_cost_per_route + travelCost);
}

// ----- Check if a task fits in a route at a given insertion position -----
function canInsert(route, taskStop, insertPos, horizonStartMin, horizonEndMin) {
  // Build trial sequence
  const seq = [...route.stops];
  seq.splice(insertPos, 0, taskStop);

  let time = route.available_from; // absolute minutes from midnight, relative to horizon
  let prevLat = route.depot_start_lat;
  let prevLng = route.depot_start_lng;

  for (const stop of seq) {
    const travel = stop._travel_from_prev || 0;
    time += travel;
    // Wait until window opens
    if (time < stop.window_start) time = stop.window_start;
    // Check window
    if (time > stop.window_end) return { feasible: false, reason: `Te laat bij ${stop.name}: aankomst ${minutesToTime(time)}, venster sluit ${minutesToTime(stop.window_end)}` };
    time += stop.duration_minutes;
    if (time > horizonEndMin) return { feasible: false, reason: `Route overschrijdt planningshorizon` };
  }
  return { feasible: true, endTime: time };
}

// ----- Simulation: get departure time from a route with a specific sequence -----
async function simulateRoute(depotLat, depotLng, stops, availableFrom, travelCache) {
  let time = availableFrom;
  let prevLat = depotLat;
  let prevLng = depotLng;
  let totalTravelMin = 0;
  let totalKm = 0;
  const result = [];

  for (const stop of stops) {
    const travel = await getTravelTime(prevLat, prevLng, stop.lat, stop.lng, travelCache);
    time += travel.minutes;
    totalTravelMin += travel.minutes;
    totalKm += travel.km;
    const arrivalTime = time;
    const startTime = Math.max(time, stop.window_start);
    const waitTime = startTime - arrivalTime;
    time = startTime + stop.duration_minutes;
    result.push({ ...stop, arrival_time: minutesToTime(arrivalTime), start_time: minutesToTime(startTime), departure_time: minutesToTime(time), wait_minutes: waitTime, travel_from_prev: travel.minutes, distance_from_prev: travel.km });
    prevLat = stop.lat;
    prevLng = stop.lng;
  }

  return { stops: result, end_time: time, total_travel_minutes: totalTravelMin, total_distance_km: r2(totalKm) };
}

// ----- Main fleet optimizer -----
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { planning_date, vehicle_ids, horizon_start = '17:30', horizon_end = '08:30', settings = {} } = body;

    if (!planning_date) return Response.json({ error: 'planning_date is verplicht' }, { status: 400 });

    const weekday = getWeekday(planning_date);
    const horizonStartMin = timeToMinutes(horizon_start);
    let horizonEndMin = timeToMinutes(horizon_end);
    if (horizonEndMin <= horizonStartMin) horizonEndMin += 1440;

    // --- Load data ---
    const [allTasks, allObjects, allCollectiefs, allVehicles, allAvailabilities, allOffices] = await Promise.all([
      base44.entities.PlanningTask.list(),
      base44.entities.SurveillanceObject.list(),
      base44.entities.Collectief.list(),
      base44.entities.Vehicle.list(),
      base44.entities.VehicleAvailability.list(),
      base44.entities.Office.list(),
    ]);

    // Filter active tasks for this weekday
    const eligibleTasks = allTasks.filter(t => {
      if (t.is_active === false) return false;
      if (t.weekdays && t.weekdays.length > 0 && !t.weekdays.includes(weekday)) return false;
      return true;
    });

    if (eligibleTasks.length === 0) {
      return Response.json({ error: 'Geen taken gevonden voor deze planningsdag', tasks_checked: allTasks.length }, { status: 400 });
    }

    // Resolve coordinates for each task
    const travelCache = new Map();

    const getCoords = (locationId) => {
      const obj = allObjects.find(o => o.id === locationId);
      if (obj) {
        let lat = obj.latitude, lng = obj.longitude;
        if (lat && lng && lat < lng) { [lat, lng] = [lng, lat]; } // fix swapped coords
        return { lat, lng, name: obj.name, address: obj.address };
      }
      const office = allOffices.find(o => o.id === locationId);
      if (office) {
        let lat = office.latitude, lng = office.longitude;
        if (lat && lng && lat < lng) { [lat, lng] = [lng, lat]; }
        return { lat, lng, name: office.name, address: office.address };
      }
      return null;
    };

    // Build task stops
    const taskStops = [];
    for (const task of eligibleTasks) {
      const windows = task.time_windows || [];
      if (windows.length === 0) {
        // No window defined: use full horizon
        windows.push({ start: horizon_start, end: horizon_end });
      }

      // Get primary location
      let coords = null;
      if (task.object_id) coords = getCoords(task.object_id);
      else if (task.collectief_id) {
        // Use collectief centroid or first object
        const coll = allCollectiefs.find(c => c.id === task.collectief_id);
        if (coll && coll.object_ids?.length > 0) {
          const firstObj = allObjects.find(o => o.id === coll.object_ids[0]);
          if (firstObj) coords = getCoords(firstObj.id);
        }
      }

      // For collectief tasks with selected_object_ids: one stop per object
      if (task.selected_object_ids?.length > 0) {
        const durationPerObj = Math.round(task.duration_minutes / task.selected_object_ids.length);
        for (const objId of task.selected_object_ids) {
          const c = getCoords(objId);
          if (c?.lat && c?.lng) {
            const normalizedWindows = windows.map(w => normalizeWindow(w.start, w.end, horizonStartMin));
            taskStops.push({
              id: `${task.id}_${objId}`,
              task_id: task.id,
              task_name: task.name || task.task_type,
              name: c.name,
              address: c.address,
              lat: c.lat, lng: c.lng,
              duration_minutes: durationPerObj,
              windows: normalizedWindows,
              priority: task.priority || 'contractueel_verplicht',
              penalty: task.penalty_if_unplanned || 1000,
              required_vehicle_ids: task.required_vehicle_ids || [],
            });
          }
        }
      } else if (coords?.lat && coords?.lng) {
        const normalizedWindows = windows.map(w => normalizeWindow(w.start, w.end, horizonStartMin));
        taskStops.push({
          id: task.id,
          task_id: task.id,
          task_name: task.name || task.task_type,
          name: coords.name,
          address: coords.address,
          lat: coords.lat, lng: coords.lng,
          duration_minutes: task.duration_minutes,
          windows: normalizedWindows,
          priority: task.priority || 'contractueel_verplicht',
          penalty: task.penalty_if_unplanned || 1000,
          required_vehicle_ids: task.required_vehicle_ids || [],
        });
      } else {
        // No coordinates — mark as unplannable
        taskStops.push({
          id: task.id,
          task_id: task.id,
          task_name: task.name || task.task_type,
          name: task.name,
          address: 'Onbekend',
          lat: null, lng: null,
          duration_minutes: task.duration_minutes,
          windows: [],
          priority: task.priority || 'contractueel_verplicht',
          penalty: task.penalty_if_unplanned || 1000,
          required_vehicle_ids: task.required_vehicle_ids || [],
          unplannable: true,
          reason: 'Geen coördinaten beschikbaar voor dit object',
          advice: 'Voeg een geldig adres toe aan het object zodat coördinaten bepaald kunnen worden.'
        });
      }
    }

    // Filter vehicles
    const vehiclesToUse = vehicle_ids?.length > 0
      ? allVehicles.filter(v => vehicle_ids.includes(v.id) && v.is_active !== false)
      : allVehicles.filter(v => v.is_active !== false);

    if (vehiclesToUse.length === 0) {
      return Response.json({ error: 'Geen actieve voertuigen gevonden' }, { status: 400 });
    }

    // Build route slots per vehicle (from VehicleAvailability)
    const routeSlots = [];
    for (const vehicle of vehiclesToUse) {
      const avails = allAvailabilities.filter(a =>
        a.vehicle_id === vehicle.id &&
        a.is_active !== false &&
        (!a.weekdays || a.weekdays.length === 0 || a.weekdays.includes(weekday))
      );

      if (avails.length === 0) {
        // Default: use full horizon
        const depotId = vehicle.start_depot_id || null;
        const depotCoords = depotId ? getCoords(depotId) : { lat: null, lng: null, name: 'Depot' };
        const endDepotId = vehicle.end_depot_id || depotId || null;
        const endDepotCoords = endDepotId ? getCoords(endDepotId) : depotCoords;
        routeSlots.push({
          id: `${vehicle.id}_default`,
          vehicle_id: vehicle.id,
          vehicle_label: `${vehicle.brand || ''} ${vehicle.model || ''} (${vehicle.license_plate})`.trim(),
          available_from: horizonStartMin,
          available_until: horizonEndMin,
          depot_start_lat: depotCoords?.lat,
          depot_start_lng: depotCoords?.lng,
          depot_end_lat: endDepotCoords?.lat,
          depot_end_lng: endDepotCoords?.lng,
          depot_start_name: depotCoords?.name || 'Depot',
          depot_end_name: endDepotCoords?.name || 'Depot',
          cost_per_km: settings.cost_per_km || vehicle.fuel_cost_per_km || 0.35,
          cost_per_minute: settings.cost_per_minute || 0.10,
          fixed_cost: settings.fixed_cost_per_route || 50,
          stops: [],
        });
      } else {
        for (const avail of avails) {
          let availFrom = timeToMinutes(avail.start_time);
          let availUntil = timeToMinutes(avail.end_time);
          if (availUntil <= availFrom) availUntil += 1440;
          if (availFrom < horizonStartMin) availFrom = horizonStartMin;
          if (availUntil > horizonEndMin) availUntil = horizonEndMin;

          const depotId = avail.start_depot_id || vehicle.start_depot_id || null;
          const depotCoords = depotId ? getCoords(depotId) : { lat: null, lng: null, name: 'Depot' };
          const endDepotId = avail.end_depot_id || vehicle.end_depot_id || depotId;
          const endDepotCoords = endDepotId ? getCoords(endDepotId) : depotCoords;

          routeSlots.push({
            id: `${vehicle.id}_${avail.id}`,
            vehicle_id: vehicle.id,
            vehicle_label: `${vehicle.brand || ''} ${vehicle.model || ''} (${vehicle.license_plate})`.trim(),
            available_from: availFrom,
            available_until: availUntil,
            depot_start_lat: depotCoords?.lat,
            depot_start_lng: depotCoords?.lng,
            depot_end_lat: endDepotCoords?.lat,
            depot_end_lng: endDepotCoords?.lng,
            depot_start_name: depotCoords?.name || 'Depot',
            depot_end_name: endDepotCoords?.name || 'Depot',
            cost_per_km: avail.cost_per_km || settings.cost_per_km || 0.35,
            cost_per_minute: avail.cost_per_minute || settings.cost_per_minute || 0.10,
            fixed_cost: avail.fixed_cost_per_shift || settings.fixed_cost_per_route || 50,
            stops: [],
          });
        }
      }
    }

    // ============================================================
    // STEP 1: Sort tasks by urgency
    // ============================================================
    const plannable = taskStops.filter(t => !t.unplannable && t.lat && t.lng);
    const unpannable_initial = taskStops.filter(t => t.unplannable || !t.lat || !t.lng);

    // Urgency score: smaller window = more urgent; higher penalty = more urgent
    const urgencyScore = (stop) => {
      const minWindow = stop.windows.reduce((min, w) => Math.min(min, w.end - w.start), Infinity);
      const penaltyScore = stop.penalty || 0;
      return minWindow / 60 - penaltyScore / 100; // lower = more urgent
    };
    plannable.sort((a, b) => urgencyScore(a) - urgencyScore(b));

    // ============================================================
    // STEP 2: Cheapest feasible insertion
    // ============================================================
    const assigned = new Map(); // stopId -> routeSlot
    const unassigned = [];

    for (const stop of plannable) {
      let bestSlot = null;
      let bestPos = -1;
      let bestDelta = Infinity;
      let bestReason = '';

      for (const slot of routeSlots) {
        // Check vehicle restriction
        if (stop.required_vehicle_ids?.length > 0 && !stop.required_vehicle_ids.includes(slot.vehicle_id)) continue;

        // Try each window
        for (const window of stop.windows) {
          // Try inserting at each position
          for (let pos = 0; pos <= slot.stops.length; pos++) {
            // Quick time feasibility check
            const prevStop = pos > 0 ? slot.stops[pos - 1] : null;
            const prevLat = prevStop ? prevStop.lat : slot.depot_start_lat;
            const prevLng = prevStop ? prevStop.lng : slot.depot_start_lng;

            if (!prevLat || !prevLng) continue;

            // Get travel from prev to this stop (from cache or estimate)
            const travelKey = `${r2(prevLat)},${r2(prevLng)}->${r2(stop.lat)},${r2(stop.lng)}`;
            let travelMin = 30; // optimistic estimate
            if (travelCache.has(travelKey)) travelMin = travelCache.get(travelKey).minutes;

            // Estimate current time at position pos
            let estimatedCurrentTime = slot.available_from;
            for (let i = 0; i < pos; i++) {
              const s = slot.stops[i];
              estimatedCurrentTime += (s._travel_min || 30) + s.duration_minutes;
              if (estimatedCurrentTime < s.window_start) estimatedCurrentTime = s.window_start;
            }

            const arrivalAtStop = estimatedCurrentTime + travelMin;
            const startAtStop = Math.max(arrivalAtStop, window.start);

            if (startAtStop > window.end) continue;
            if (startAtStop + stop.duration_minutes > window.end) continue;
            if (startAtStop + stop.duration_minutes > slot.available_until) continue;

            const delta = (startAtStop - arrivalAtStop) + travelMin; // wachttijd + reistijd
            if (delta < bestDelta) {
              bestDelta = delta;
              bestSlot = slot;
              bestPos = pos;
              bestReason = '';
            }
          }
        }
      }

      if (bestSlot !== null) {
        const stopWithWindow = { ...stop, window_start: stop.windows[0]?.start || horizonStartMin, window_end: stop.windows[0]?.end || horizonEndMin, _travel_min: 30 };
        bestSlot.stops.splice(bestPos, 0, stopWithWindow);
        assigned.set(stop.id, bestSlot.id);
      } else {
        unassigned.push({
          ...stop,
          reason: bestReason || 'Geen route beschikbaar binnen het tijdvenster van deze taak',
          advice: 'Controleer of er een voertuig beschikbaar is tijdens het tijdvenster van deze taak, of verruim het tijdvenster.'
        });
      }
    }

    // ============================================================
    // STEP 3: Simulate each route to get accurate timings
    // ============================================================
    const routeRuns = [];

    for (const slot of routeSlots) {
      if (slot.stops.length === 0) continue;

      const depotLat = slot.depot_start_lat || (slot.stops[0]?.lat);
      const depotLng = slot.depot_start_lng || (slot.stops[0]?.lng);

      if (!depotLat || !depotLng) {
        // Use first stop as pseudo-depot
      }

      const sim = await simulateRoute(
        depotLat || slot.stops[0]?.lat,
        depotLng || slot.stops[0]?.lng,
        slot.stops,
        slot.available_from,
        travelCache
      );

      const totalTaskMin = slot.stops.reduce((s, t) => s + t.duration_minutes, 0);
      const totalWaitMin = sim.stops.reduce((s, t) => s + (t.wait_minutes || 0), 0);
      const routeCost = r2(slot.fixed_cost + sim.total_distance_km * slot.cost_per_km + sim.total_travel_minutes * slot.cost_per_minute);

      routeRuns.push({
        id: slot.id,
        vehicle_id: slot.vehicle_id,
        vehicle_label: slot.vehicle_label,
        depot_start_name: slot.depot_start_name,
        depot_end_name: slot.depot_end_name,
        planned_start_time: minutesToTime(slot.available_from),
        planned_end_time: minutesToTime(sim.end_time),
        stops: sim.stops,
        total_stops: sim.stops.length,
        total_travel_minutes: sim.total_travel_minutes,
        total_task_minutes: totalTaskMin,
        total_wait_minutes: totalWaitMin,
        total_distance_km: sim.total_distance_km,
        total_route_minutes: sim.end_time - slot.available_from,
        route_cost: routeCost,
        status: 'concept'
      });
    }

    // ============================================================
    // STEP 4: Analyze unassigned tasks
    // ============================================================
    const allUnassigned = [...unpannable_initial, ...unassigned];

    // Check if extra vehicle could help
    for (const ua of allUnassigned) {
      if (!ua.advice) {
        const windowMin = ua.windows?.[0];
        if (windowMin) {
          ua.advice = `Voeg een voertuig toe dat beschikbaar is tussen ${minutesToTime(windowMin.start)} en ${minutesToTime(windowMin.end)}`;
        } else {
          ua.advice = 'Definieer een tijdvenster voor deze taak of voeg een beschikbaar voertuig toe.';
        }
      }
    }

    // ============================================================
    // STEP 5: Totals & save
    // ============================================================
    const totalCost = r2(routeRuns.reduce((s, r) => s + r.route_cost, 0));
    const totalKm = r2(routeRuns.reduce((s, r) => s + r.total_distance_km, 0));
    const totalTravelMin = routeRuns.reduce((s, r) => s + r.total_travel_minutes, 0);
    const totalTaskMin = routeRuns.reduce((s, r) => s + r.total_task_minutes, 0);

    const planningResult = {
      planning_date: planning_date,
      horizon_start,
      horizon_end,
      weekday,
      status: 'concept',
      vehicle_ids: vehiclesToUse.map(v => v.id),
      route_runs: routeRuns,
      unassigned_tasks: allUnassigned,
      total_cost: totalCost,
      total_distance_km: totalKm,
      total_travel_minutes: totalTravelMin,
      total_task_minutes: totalTaskMin,
      total_routes: routeRuns.length,
      tasks_planned: routeRuns.reduce((s, r) => s + r.total_stops, 0),
      tasks_unplanned: allUnassigned.length,
      optimizer_version: OPTIMIZER_VERSION,
      settings_used: { ...settings, horizon_start, horizon_end },
    };

    // Save to PlanningRun entity
    const saved = await base44.asServiceRole.entities.PlanningRun.create({
      planning_date,
      horizon_start,
      horizon_end,
      status: 'concept',
      vehicle_ids: vehiclesToUse.map(v => v.id),
      route_runs: routeRuns,
      unassigned_tasks: allUnassigned,
      total_cost: totalCost,
      total_distance_km: totalKm,
      total_travel_minutes: totalTravelMin,
      total_task_minutes: totalTaskMin,
      total_routes: routeRuns.length,
      tasks_planned: routeRuns.reduce((s, r) => s + r.total_stops, 0),
      tasks_unplanned: allUnassigned.length,
      optimizer_version: OPTIMIZER_VERSION,
      settings_used: { ...settings, horizon_start, horizon_end },
    });

    return Response.json({ ...planningResult, id: saved.id });

  } catch (error) {
    console.error('Fleet optimizer error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});