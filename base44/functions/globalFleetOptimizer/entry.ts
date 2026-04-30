import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ============================================================
// HELPER FUNCTIES
// ============================================================

const HOLIDAYS_2025 = ['2025-01-01','2025-04-20','2025-04-21','2025-04-27','2025-05-29','2025-06-08','2025-06-09','2025-12-25','2025-12-26'];
const HOLIDAYS_2026 = ['2026-01-01','2026-04-05','2026-04-06','2026-04-27','2026-05-14','2026-05-24','2026-05-25','2026-12-25','2026-12-26'];

function isHoliday(dateStr) {
  return HOLIDAYS_2025.includes(dateStr) || HOLIDAYS_2026.includes(dateStr);
}

function parseTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function formatTime(minutes) {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function r2(n) { return Math.round((n || 0) * 100) / 100; }

// Normaliseer een taak-tijdvenster zodat het overlap met routevenster heeft
function normalizeTaskWindow(taskStart, taskEnd, routeStart, routeEnd) {
  let ts = parseTime(taskStart) ?? 0;
  let te = parseTime(taskEnd) ?? 1439;
  if (te <= ts) te += 1440; // over middernacht

  // Probeer offsets om overlap te vinden met routevenster
  for (const offset of [0, 1440, -1440]) {
    const s = ts + offset;
    const e = te + offset;
    if (s < routeEnd && e > routeStart) {
      return { taskStart: s, taskEnd: e };
    }
  }
  return { taskStart: ts, taskEnd: te };
}

// Haversine afstand in km
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Fix omgewisselde lat/lng (NL: lat ~52, lng ~4-7)
function fixCoords(obj) {
  if (!obj) return obj;
  let lat = obj.latitude, lng = obj.longitude;
  if (lat !== undefined && lng !== undefined && lat < lng) return { ...obj, latitude: lng, longitude: lat };
  return obj;
}

// ============================================================
// REISMATRIX - Google Maps met caching
// ============================================================

async function getTravelTime(fromLat, fromLng, toLat, toLng, apiKey, cache) {
  const key = `${r2(fromLat)},${r2(fromLng)}->${r2(toLat)},${r2(toLng)}`;
  if (cache.has(key)) return cache.get(key);

  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK' && data.routes?.length > 0) {
      let duration = 0, distance = 0;
      for (const leg of (data.routes[0].legs || [])) {
        duration += leg.duration.value;
        distance += leg.distance.value;
      }
      const result = { travelMinutes: Math.round(duration / 60), distanceKm: Math.round(distance / 100) / 10, estimated: false };
      cache.set(key, result);
      return result;
    }
  } catch (_) {}

  // Fallback: schatting op basis van Haversine
  const km = haversineKm(fromLat, fromLng, toLat, toLng);
  const result = { travelMinutes: Math.round(km * 1.4), distanceKm: r2(km * 1.3), estimated: true };
  cache.set(key, result);
  return result;
}

// ============================================================
// STAP 1: Taken voorbereiden
// ============================================================

function prepareTaskInstances(tasks, objects, collectiefs, weekday) {
  const instances = [];

  for (const task of tasks) {
    // Filter op weekdag
    if (task.weekdays && task.weekdays.length > 0 && !task.weekdays.includes(weekday)) continue;

    const taskStart = parseTime(task.time_window_start) ?? 0;
    const taskEnd = parseTime(task.time_window_end) ?? 1439;

    if (task.collectief_id && task.selected_object_ids?.length > 0) {
      // Collectief taak: splits per object
      const totalObjs = task.selected_object_ids.length;
      const durationPer = Math.round((task.duration_minutes || 15) / Math.max(totalObjs, 1));
      for (const objId of task.selected_object_ids) {
        const rawObj = objects.find(o => o.id === objId);
        const obj = fixCoords(rawObj);
        if (!obj?.latitude || !obj?.longitude) continue;
        instances.push({
          id: `${task.id}_${objId}`,
          task_id: task.id,
          object_id: objId,
          name: obj.name,
          address: obj.address,
          latitude: obj.latitude,
          longitude: obj.longitude,
          duration_minutes: durationPer,
          time_window_start: task.time_window_start,
          time_window_end: task.time_window_end,
          task_type: task.task_type,
          price_amount: task.is_free ? 0 : (task.price_amount || 0),
          pricing_type: task.pricing_type,
          is_collectief: true,
          parent_task_id: task.id,
        });
      }
    } else if (task.object_id) {
      const rawObj = objects.find(o => o.id === task.object_id);
      const obj = fixCoords(rawObj);
      if (!obj?.latitude || !obj?.longitude) {
        instances.push({
          id: task.id,
          task_id: task.id,
          object_id: task.object_id,
          name: obj?.name || 'Onbekend object',
          address: obj?.address || '',
          latitude: null,
          longitude: null,
          duration_minutes: task.duration_minutes || 15,
          time_window_start: task.time_window_start,
          time_window_end: task.time_window_end,
          task_type: task.task_type,
          price_amount: task.is_free ? 0 : (task.price_amount || 0),
          pricing_type: task.pricing_type,
          missing_coords: true,
        });
        continue;
      }
      instances.push({
        id: task.id,
        task_id: task.id,
        object_id: task.object_id,
        name: obj.name,
        address: obj.address,
        latitude: obj.latitude,
        longitude: obj.longitude,
        duration_minutes: task.duration_minutes || 15,
        time_window_start: task.time_window_start,
        time_window_end: task.time_window_end,
        task_type: task.task_type,
        price_amount: task.is_free ? 0 : (task.price_amount || 0),
        pricing_type: task.pricing_type,
      });
    }
  }

  return instances;
}

// ============================================================
// STAP 3: Kandidaat routes genereren op basis van tijdclusters
// ============================================================

function generateRouteCandidates(taskInstances, vehicles, offices, existingDepot) {
  // Cluster taken op tijdvenster: avond (18-01), nacht (23-08), dag (07-18)
  const clusters = [];

  const starts = taskInstances.map(t => parseTime(t.time_window_start) ?? 0);
  const minStart = Math.min(...starts);
  const maxStart = Math.max(...starts);

  // Detecteer tijdgroepen automatisch
  const timeGroups = [];
  const eveningTasks = taskInstances.filter(t => {
    const s = parseTime(t.time_window_start) ?? 0;
    return s >= 18*60 || s < 6*60;
  });
  const morningTasks = taskInstances.filter(t => {
    const s = parseTime(t.time_window_start) ?? 0;
    return s >= 6*60 && s < 14*60;
  });
  const afternoonTasks = taskInstances.filter(t => {
    const s = parseTime(t.time_window_start) ?? 0;
    return s >= 14*60 && s < 18*60;
  });

  const groups = [eveningTasks, morningTasks, afternoonTasks].filter(g => g.length > 0);

  // Per tijdgroep: genereer kandidaat-routes op basis van beschikbare voertuigen
  const candidates = [];
  let vehicleIndex = 0;

  for (const group of groups) {
    if (group.length === 0) continue;
    const starts = group.map(t => parseTime(t.time_window_start) ?? 0);
    const ends = group.map(t => {
      let e = parseTime(t.time_window_end) ?? 1439;
      const s = parseTime(t.time_window_start) ?? 0;
      if (e < s) e += 1440;
      return e;
    });

    const groupStart = Math.min(...starts);
    const groupEnd = Math.max(...ends);

    // Hoeveel voertuigen passen in dit cluster (splits geografisch)
    const vehicle = vehicles[vehicleIndex % vehicles.length];
    vehicleIndex++;

    const depot = offices[0] ? fixCoords(offices[0]) : null;

    candidates.push({
      id: `candidate_${candidates.length}`,
      vehicle,
      time_window_start: formatTime(groupStart),
      time_window_end: formatTime(groupEnd),
      depot,
      tasks: [],
      routeMinutes: 0,
    });
  }

  // Als geen tijdgroepen, maak één route per voertuig
  if (candidates.length === 0 && vehicles.length > 0) {
    const depot = offices[0] ? fixCoords(offices[0]) : null;
    candidates.push({
      id: 'candidate_0',
      vehicle: vehicles[0],
      time_window_start: '00:00',
      time_window_end: '23:59',
      depot,
      tasks: [],
      routeMinutes: 0,
    });
  }

  return candidates;
}

// ============================================================
// STAP 4+5: Cheapest Feasible Insertion + Lokale verbetering
// ============================================================

async function cheapestFeasibleInsertion(routeCandidate, taskInstances, apiKey, travelCache) {
  const { time_window_start, time_window_end, depot } = routeCandidate;
  const routeStart = parseTime(time_window_start) ?? 0;
  let routeEnd = parseTime(time_window_end) ?? 1439;
  if (routeEnd <= routeStart) routeEnd += 1440;

  // Sorteer taken op urgentie: smalste venster eerst, vroegste deadline
  const sortedTasks = [...taskInstances].sort((a, b) => {
    const { taskStart: as, taskEnd: ae } = normalizeTaskWindow(a.time_window_start, a.time_window_end, routeStart, routeEnd);
    const { taskStart: bs, taskEnd: be } = normalizeTaskWindow(b.time_window_start, b.time_window_end, routeStart, routeEnd);
    const aWindow = ae - as;
    const bWindow = be - bs;
    if (aWindow !== bWindow) return aWindow - bWindow;
    return ae - be;
  });

  const planned = []; // geplande taken in volgorde
  const skipped = []; // niet inplanbare taken

  const getCurrentLocation = () => {
    if (planned.length > 0) return planned[planned.length - 1];
    return depot;
  };

  const getCurrentTime = () => {
    if (planned.length > 0) {
      const last = planned[planned.length - 1];
      return last._departureTime;
    }
    return routeStart;
  };

  for (const task of sortedTasks) {
    if (task.missing_coords) {
      skipped.push({ ...task, skip_reason: 'Ontbrekende coördinaten voor dit object. Voeg een adres toe aan het object.' });
      continue;
    }

    const { taskStart, taskEnd } = normalizeTaskWindow(task.time_window_start, task.time_window_end, routeStart, routeEnd);

    // Probeer beste insertie positie
    let bestPos = -1;
    let bestScore = Infinity;
    let bestArrival = null;

    // Probeer invoegen op elke positie (inclusief aan het eind)
    for (let pos = 0; pos <= planned.length; pos++) {
      // Simuleer de planning met taak op positie pos
      const simResult = await simulateInsert(planned, task, pos, depot, routeStart, routeEnd, apiKey, travelCache);
      if (!simResult.feasible) continue;

      const score = simResult.extraTravelMinutes * 2 + simResult.waitingMinutes + simResult.latePenalty;
      if (score < bestScore) {
        bestScore = score;
        bestPos = pos;
        bestArrival = simResult.arrivalTime;
      }
    }

    if (bestPos >= 0) {
      // Voeg in op beste positie
      const insertResult = await simulateInsert(planned, task, bestPos, depot, routeStart, routeEnd, apiKey, travelCache);
      // Rebuild planned array met taak op bestPos
      const newPlanned = await rebuildSequence([...planned.slice(0, bestPos), task, ...planned.slice(bestPos)], depot, routeStart, routeEnd, apiKey, travelCache);
      if (newPlanned) {
        planned.length = 0;
        planned.push(...newPlanned);
      } else {
        skipped.push({ ...task, skip_reason: 'Kan niet ingepland worden: tijdvensterconflict met andere taken in deze route.' });
      }
    } else {
      const { taskStart: ts, taskEnd: te } = normalizeTaskWindow(task.time_window_start, task.time_window_end, routeStart, routeEnd);
      let reason = 'Geen geschikte positie gevonden in route binnen tijdvenster.';
      if (ts >= routeEnd || te <= routeStart) {
        reason = `Tijdvenster (${task.time_window_start}–${task.time_window_end}) valt buiten de route (${time_window_start}–${time_window_end}).`;
      }
      skipped.push({ ...task, skip_reason: reason });
    }
  }

  return { planned, skipped };
}

// Simuleer het invoegen van een taak op positie pos
async function simulateInsert(planned, task, pos, depot, routeStart, routeEnd, apiKey, travelCache) {
  const sequence = [...planned.slice(0, pos), task, ...planned.slice(pos)];
  const result = await rebuildSequence(sequence, depot, routeStart, routeEnd, apiKey, travelCache);
  if (!result) return { feasible: false };

  const taskEntry = result[pos];
  return {
    feasible: true,
    arrivalTime: taskEntry._arrivalTime,
    extraTravelMinutes: result.reduce((s, t) => s + (t._travelTime || 0), 0) - planned.reduce((s, t) => s + (t._travelTime || 0), 0),
    waitingMinutes: taskEntry._waitTime || 0,
    latePenalty: 0,
  };
}

// Herbereken een volledige taakvolgorde en geef null terug als het niet haalbaar is
async function rebuildSequence(sequence, depot, routeStart, routeEnd, apiKey, travelCache) {
  let currentLoc = depot;
  let currentTime = routeStart;
  const result = [];

  for (const task of sequence) {
    const { taskStart, taskEnd } = normalizeTaskWindow(task.time_window_start, task.time_window_end, routeStart, routeEnd);

    let travelMinutes = 0, distanceKm = 0, estimated = false;
    if (currentLoc?.latitude && task.latitude) {
      const travel = await getTravelTime(currentLoc.latitude, currentLoc.longitude, task.latitude, task.longitude, apiKey, travelCache);
      travelMinutes = travel.travelMinutes;
      distanceKm = travel.distanceKm;
      estimated = travel.estimated;
    }

    const arrival = currentTime + travelMinutes;
    const actualStart = Math.max(arrival, taskStart);
    const departure = actualStart + task.duration_minutes;

    // Hard constraint: taak moet starten voor einde venster
    if (arrival > taskEnd) return null;
    if (actualStart + task.duration_minutes > taskEnd + 15) return null; // 15 min tolerantie

    result.push({
      ...task,
      _travelTime: travelMinutes,
      _distanceKm: distanceKm,
      _arrivalTime: arrival,
      _waitTime: Math.max(0, taskStart - arrival),
      _actualStart: actualStart,
      _departureTime: departure,
      _estimated: estimated,
    });

    currentLoc = task;
    currentTime = departure;
  }

  return result;
}

// ============================================================
// STAP 6: Lokale verbetering (2-opt + relocate)
// ============================================================

async function improveWithLocalSearch(planned, depot, routeStart, routeEnd, apiKey, travelCache, maxIterations = 50) {
  let best = planned;
  let bestCost = totalCost(planned);

  for (let iter = 0; iter < maxIterations; iter++) {
    let improved = false;

    // Relocate: verplaats één taak naar andere positie
    for (let from = 0; from < best.length; from++) {
      for (let to = 0; to <= best.length; to++) {
        if (to === from || to === from + 1) continue;
        const task = best[from];
        const withoutTask = best.filter((_, i) => i !== from);
        const insertAt = to > from ? to - 1 : to;
        const candidate = [...withoutTask.slice(0, insertAt), task, ...withoutTask.slice(insertAt)];
        const result = await rebuildSequence(candidate, depot, routeStart, routeEnd, apiKey, travelCache);
        if (!result) continue;
        const cost = totalCost(result);
        if (cost < bestCost - 0.01) {
          best = result;
          bestCost = cost;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }

    if (!improved) break;
  }

  return best;
}

function totalCost(sequence) {
  return sequence.reduce((s, t) => s + (t._travelTime || 0) + (t._waitTime || 0), 0);
}

// ============================================================
// STAP 7+8: Globale fleet optimizer
// ============================================================

async function globalFleetOptimizer(taskInstances, vehicles, offices, apiKey, travelCache, weekday) {
  // Genereer kandidaat routes
  const routeCandidates = generateRouteCandidates(taskInstances, vehicles, offices, null);

  const plannableInstances = taskInstances.filter(t => !t.missing_coords);
  const missingCoordInstances = taskInstances.filter(t => t.missing_coords);

  let allSkipped = [...missingCoordInstances.map(t => ({ ...t, skip_reason: 'Ontbrekende coördinaten. Voeg een adres toe aan het object.' }))];
  const finalRoutes = [];

  // Verdeelstrategie: per routekandidate taken toewijzen die in het tijdvenster passen
  // Gebruik cheapest insertion
  let remainingTasks = [...plannableInstances];

  for (let ri = 0; ri < routeCandidates.length && remainingTasks.length > 0; ri++) {
    const candidate = routeCandidates[ri];
    const routeStart = parseTime(candidate.time_window_start) ?? 0;
    let routeEnd = parseTime(candidate.time_window_end) ?? 1439;
    if (routeEnd <= routeStart) routeEnd += 1440;

    // Selecteer taken die (deels) in dit tijdvenster passen
    const eligible = remainingTasks.filter(t => {
      const { taskStart, taskEnd } = normalizeTaskWindow(t.time_window_start, t.time_window_end, routeStart, routeEnd);
      return taskStart < routeEnd && taskEnd > routeStart;
    });

    if (eligible.length === 0) continue;

    const { planned, skipped } = await cheapestFeasibleInsertion(candidate, eligible, apiKey, travelCache);

    // Verbetering
    let improved = planned;
    if (planned.length > 2) {
      improved = await improveWithLocalSearch(planned, candidate.depot, routeStart, routeEnd, apiKey, travelCache, 30);
    }

    if (improved.length > 0) {
      const totalTravel = improved.reduce((s, t) => s + (t._travelTime || 0), 0);
      const totalDistance = improved.reduce((s, t) => s + (t._distanceKm || 0), 0);
      const totalService = improved.reduce((s, t) => s + t.duration_minutes, 0);
      const totalWait = improved.reduce((s, t) => s + (t._waitTime || 0), 0);

      finalRoutes.push({
        candidate_id: candidate.id,
        vehicle: candidate.vehicle,
        time_window_start: candidate.time_window_start,
        time_window_end: candidate.time_window_end,
        depot: candidate.depot,
        tasks: improved.map((t, idx) => ({
          task_id: t.task_id || t.id,
          object_id: t.object_id,
          name: t.name,
          address: t.address,
          duration_minutes: t.duration_minutes,
          time_window_start: t.time_window_start,
          time_window_end: t.time_window_end,
          task_type: t.task_type,
          arrival_time: formatTime(t._arrivalTime),
          actual_start_time: formatTime(t._actualStart),
          departure_time: formatTime(t._departureTime),
          travel_time_minutes: t._travelTime || 0,
          distance_km: t._distanceKm || 0,
          waiting_time: t._waitTime || 0,
          estimated_travel: t._estimated || false,
          sequence_index: idx,
        })),
        stats: {
          total_tasks: improved.length,
          total_service_minutes: totalService,
          total_travel_minutes: Math.round(totalTravel),
          total_distance_km: r2(totalDistance),
          total_wait_minutes: Math.round(totalWait),
          total_route_minutes: Math.round(totalService + totalTravel + totalWait),
          has_estimated_travel: improved.some(t => t._estimated),
        }
      });
    }

    // Taken die niet inplanbaar waren in deze route gaan door naar volgende ronde
    const plannedIds = new Set(improved.map(t => t.id));
    remainingTasks = remainingTasks.filter(t => !plannedIds.has(t.id));
    allSkipped.push(...skipped);
  }

  // Taken die in geen enkele route passen
  for (const task of remainingTasks) {
    if (!allSkipped.find(s => s.id === task.id)) {
      allSkipped.push({ ...task, skip_reason: 'Geen geschikte route gevonden voor dit tijdvenster. Voeg een extra voertuig toe.' });
    }
  }

  // Genereer adviezen voor niet ingeplande taken
  const advice = generateAdvice(allSkipped, vehicles, routeCandidates);

  return {
    routes: finalRoutes,
    skipped_tasks: allSkipped,
    advice,
    total_tasks_input: taskInstances.length,
    total_tasks_planned: finalRoutes.reduce((s, r) => s + r.tasks.length, 0),
    total_tasks_skipped: allSkipped.length,
  };
}

function generateAdvice(skippedTasks, vehicles, routeCandidates) {
  const advice = [];

  const missingCoords = skippedTasks.filter(t => t.missing_coords);
  if (missingCoords.length > 0) {
    advice.push({
      type: 'missing_coords',
      message: `${missingCoords.length} taak(en) hebben geen coördinaten. Controleer de adressen van: ${missingCoords.map(t => t.name).join(', ')}.`,
      action: 'Ga naar Objecten en voeg coördinaten toe via adresopzoeken.',
    });
  }

  const windowConflicts = skippedTasks.filter(t => t.skip_reason?.includes('tijdvenster'));
  if (windowConflicts.length > 0) {
    advice.push({
      type: 'window_conflict',
      message: `${windowConflicts.length} taak(en) passen niet binnen een routetijdvenster.`,
      action: 'Verruim de tijdvensters van de taken of voeg een extra route toe voor dit tijdblok.',
    });
  }

  const noRoute = skippedTasks.filter(t => t.skip_reason?.includes('geen geschikte route') || t.skip_reason?.includes('Geen geschikte route'));
  if (noRoute.length > 0) {
    advice.push({
      type: 'extra_vehicle_needed',
      message: `${noRoute.length} taak(en) konden niet ingepland worden omdat er geen voertuig beschikbaar is.`,
      action: `Voeg ${Math.ceil(noRoute.length / 5)} extra voertuig/voertuigen toe om alle taken te rijden.`,
    });
  }

  return advice;
}

// ============================================================
// MAIN HANDLER
// ============================================================

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { weekday, save_routes } = await req.json();

    if (!weekday) return Response.json({ error: 'weekday is verplicht (1=maandag, 7=zondag)' }, { status: 400 });

    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) return Response.json({ error: 'Google Maps API key niet geconfigureerd' }, { status: 500 });

    // Data ophalen
    const [tasks, objects, collectiefs, vehicles, offices, folders] = await Promise.all([
      base44.entities.Task.list(),
      base44.entities.SurveillanceObject.list(),
      base44.entities.Collectief.list(),
      base44.entities.Vehicle.list(),
      base44.entities.Office.list(),
      base44.entities.RouteFolder.list(),
    ]);

    const activeVehicles = vehicles.filter(v => v.is_active !== false);
    if (activeVehicles.length === 0) {
      return Response.json({ error: 'Geen actieve voertuigen gevonden. Voeg voertuigen toe.' }, { status: 400 });
    }

    // Taken voorbereiden
    const taskInstances = prepareTaskInstances(tasks, objects, collectiefs, weekday);
    if (taskInstances.filter(t => !t.missing_coords).length === 0) {
      return Response.json({
        routes: [],
        skipped_tasks: taskInstances,
        advice: [{ type: 'no_tasks', message: 'Geen taken met coördinaten gevonden voor deze dag.', action: 'Maak taken aan en koppel ze aan objecten met een adres.' }],
        total_tasks_input: taskInstances.length,
        total_tasks_planned: 0,
        total_tasks_skipped: taskInstances.length,
      });
    }

    const travelCache = new Map();

    // Globale optimizer uitvoeren
    const result = await globalFleetOptimizer(taskInstances, activeVehicles, offices, apiKey, travelCache, weekday);

    // Optioneel: sla routes op in database
    if (save_routes && result.routes.length > 0) {
      // Zorg voor een standaard folder
      let folderId = folders[0]?.id;
      if (!folderId) {
        const newFolder = await base44.asServiceRole.entities.RouteFolder.create({ name: 'Automatisch gegenereerd', color: 'blue' });
        folderId = newFolder.id;
      }

      const weekdayLabels = { 1:'Maandag',2:'Dinsdag',3:'Woensdag',4:'Donderdag',5:'Vrijdag',6:'Zaterdag',7:'Zondag' };

      for (let i = 0; i < result.routes.length; i++) {
        const r = result.routes[i];
        const routeName = `${weekdayLabels[weekday]} - Route ${i + 1}${r.vehicle ? ` (${r.vehicle.license_plate})` : ''}`;
        const assignedTasks = r.tasks.map(t => ({ task_id: t.task_id, days: [weekday] }));

        await base44.asServiceRole.entities.Route.create({
          name: routeName,
          folder_id: folderId,
          vehicle_id: r.vehicle?.id || null,
          time_window_start: r.time_window_start,
          time_window_end: r.time_window_end,
          weekdays: [weekday],
          assigned_tasks: assignedTasks,
          cached_optimization: {
            optimized_order: r.tasks,
            total_travel_time: r.stats.total_travel_minutes,
            total_distance_km: r.stats.total_distance_km,
            total_service_time: r.stats.total_service_minutes,
            total_waiting_time: r.stats.total_wait_minutes,
            total_route_time: r.stats.total_route_minutes,
            tasks_optimized: r.tasks.length,
            tasks_skipped: 0,
            skipped_tasks: [],
          },
          optimization_calculated_at: new Date().toISOString(),
        });
      }
    }

    return Response.json({
      ...result,
      weekday,
      generated_at: new Date().toISOString(),
      saved: !!save_routes,
    });

  } catch (error) {
    console.error('Fleet optimizer error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});