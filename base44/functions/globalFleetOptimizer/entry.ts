import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ============================================================
// GLOBAL FLEET OPTIMIZER - Multi-Vehicle Route Planning
// Oplost een Vehicle Routing Problem with Time Windows (VRPTW)
// ============================================================

const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');

function r2(n) { return Math.round((n || 0) * 100) / 100; }

function parseTime(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function formatTime(minutes) {
  const total = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}

// Normaliseer tijden naar minuten vanaf planningshorizon-start
function normalizeMinutes(timeMinutes, horizonStart) {
  let m = timeMinutes;
  // Als de tijd voor het horizonstart ligt, dan is het de volgende dag
  if (m < horizonStart) m += 1440;
  return m - horizonStart;
}

function normalizeWindow(windowStart, windowEnd, horizonStart) {
  let s = parseTime(windowStart);
  let e = parseTime(windowEnd);
  // Normaliseer naar absolute minuten (over middernacht heen)
  if (s < horizonStart) s += 1440;
  if (e <= s) e += 1440;
  return { start: s, end: e };
}

// Haal reistijd op van Google Maps (of cache)
async function getTravelTime(fromLat, fromLng, toLat, toLng, cacheMap, cacheKey) {
  if (cacheMap.has(cacheKey)) return cacheMap.get(cacheKey);

  if (!GOOGLE_MAPS_API_KEY) {
    // Fallback: Haversine schatting (als Google niet beschikbaar is)
    const R = 6371;
    const dLat = (toLat - fromLat) * Math.PI / 180;
    const dLon = (toLng - fromLng) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(fromLat*Math.PI/180)*Math.cos(toLat*Math.PI/180)*Math.sin(dLon/2)**2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const minutes = Math.round(dist / 0.5); // ~30 km/h gemiddeld
    const result = { minutes, km: r2(dist), estimated: true };
    cacheMap.set(cacheKey, result);
    return result;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&key=${GOOGLE_MAPS_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.status === 'OK' && data.routes?.length > 0) {
      let secs = 0, meters = 0;
      (data.routes[0].legs || []).forEach(leg => { secs += leg.duration.value; meters += leg.distance.value; });
      const result = { minutes: Math.round(secs / 60), km: r2(meters / 1000), estimated: false };
      cacheMap.set(cacheKey, result);
      return result;
    }
  } catch (e) {
    // val terug op schatting
  }

  // Fallback
  const R = 6371;
  const dLat = (toLat - fromLat) * Math.PI / 180;
  const dLon = (toLng - fromLng) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(fromLat*Math.PI/180)*Math.cos(toLat*Math.PI/180)*Math.sin(dLon/2)**2;
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const minutes = Math.round(dist / 0.5);
  const result = { minutes, km: r2(dist), estimated: true };
  cacheMap.set(cacheKey, result);
  return result;
}

// Simuleer een route en bereken tijden per stop
async function simulateRoute(stops, depot, routeStart, routeEnd, travelCache) {
  let currentTime = routeStart;
  let currentLoc = depot;
  let totalTravel = 0, totalDistance = 0, totalService = 0, totalWait = 0;
  const plannedStops = [];
  let feasible = true;

  for (const stop of stops) {
    const fromKey = `${(currentLoc.latitude||0).toFixed(5)},${(currentLoc.longitude||0).toFixed(5)}`;
    const toKey = `${(stop.latitude||0).toFixed(5)},${(stop.longitude||0).toFixed(5)}`;
    const cacheKey = `${fromKey}->${toKey}`;
    const travel = await getTravelTime(currentLoc.latitude||0, currentLoc.longitude||0, stop.latitude||0, stop.longitude||0, travelCache, cacheKey);

    const arrivalTime = currentTime + travel.minutes;
    const actualStart = Math.max(arrivalTime, stop.windowStart);
    const waitTime = actualStart - arrivalTime;
    const departureTime = actualStart + stop.durationMinutes;

    // Check of taak binnen venster past
    if (arrivalTime > stop.windowEnd || departureTime > stop.windowEnd) {
      feasible = false;
    }
    if (departureTime > routeEnd) {
      feasible = false;
    }

    totalTravel += travel.minutes;
    totalDistance += travel.km;
    totalService += stop.durationMinutes;
    totalWait += waitTime;

    plannedStops.push({
      taskId: stop.taskId,
      name: stop.name,
      address: stop.address,
      arrivalTime: formatTime(arrivalTime),
      startTime: formatTime(actualStart),
      departureTime: formatTime(departureTime),
      waitMinutes: waitTime,
      travelMinutes: travel.minutes,
      distanceKm: travel.km,
      durationMinutes: stop.durationMinutes,
      windowStart: formatTime(stop.windowStart),
      windowEnd: formatTime(stop.windowEnd),
      withinWindow: arrivalTime <= stop.windowEnd && departureTime <= stop.windowEnd,
      estimated: travel.estimated
    });

    currentTime = departureTime;
    currentLoc = stop;
  }

  // Reistijd terug naar einddepot
  const endDepot = depot;
  if (stops.length > 0 && endDepot) {
    const fromKey = `${(currentLoc.latitude||0).toFixed(5)},${(currentLoc.longitude||0).toFixed(5)}`;
    const toKey = `${(endDepot.latitude||0).toFixed(5)},${(endDepot.longitude||0).toFixed(5)}`;
    const travel = await getTravelTime(currentLoc.latitude||0, currentLoc.longitude||0, endDepot.latitude||0, endDepot.longitude||0, travelCache, `${fromKey}->${toKey}`);
    totalTravel += travel.minutes;
    totalDistance += travel.km;
    currentTime += travel.minutes;
  }

  return {
    stops: plannedStops,
    totalTravelMinutes: totalTravel,
    totalDistanceKm: r2(totalDistance),
    totalServiceMinutes: totalService,
    totalWaitMinutes: totalWait,
    endTime: currentTime,
    feasible
  };
}

// Bereken de kosten van een route op basis van tijdsduur
function calculateRouteCost(durationMinutes, distanceKm, vehicleCostPerKm, vehicleCostPerMinute, personnelCostPerMinute) {
  const personnelCost = durationMinutes * personnelCostPerMinute;
  const vehicleTimeCost = durationMinutes * vehicleCostPerMinute;
  const vehicleDistCost = distanceKm * vehicleCostPerKm;
  return r2(personnelCost + vehicleTimeCost + vehicleDistCost);
}

// Cheapest Feasible Insertion: voeg een taak in op de beste positie in een route
async function cheapestFeasibleInsertion(task, routeStops, depot, routeStart, routeEnd, travelCache) {
  let bestCost = Infinity;
  let bestPosition = -1;

  for (let i = 0; i <= routeStops.length; i++) {
    const candidate = [...routeStops.slice(0, i), task, ...routeStops.slice(i)];
    const sim = await simulateRoute(candidate, depot, routeStart, routeEnd, travelCache);
    if (sim.feasible) {
      const cost = sim.totalTravelMinutes + sim.totalWaitMinutes;
      if (cost < bestCost) {
        bestCost = cost;
        bestPosition = i;
      }
    }
  }

  return { bestPosition, bestCost };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { planning_date, weekday, horizon_start, horizon_end, vehicle_ids, folder_id, cost_per_km, cost_per_vehicle_minute, cost_per_personnel_minute } = body;

    if (!planning_date || !weekday) {
      return Response.json({ error: 'planning_date en weekday zijn verplicht' }, { status: 400 });
    }

    // ── 1. DATA OPHALEN ──────────────────────────────────────────
    const [allTasks, allObjects, allCollectiefs, allVehicles, allRoutes, allFolders, allOffices] = await Promise.all([
      base44.entities.Task.list(),
      base44.entities.SurveillanceObject.list(),
      base44.entities.Collectief.list(),
      base44.entities.Vehicle.list(),
      base44.entities.Route.list(),
      base44.entities.RouteFolder.list(),
      base44.entities.Office.list()
    ]);

    // Filter voertuigen
    const vehicles = vehicle_ids?.length > 0
      ? allVehicles.filter(v => vehicle_ids.includes(v.id) && v.is_active !== false)
      : allVehicles.filter(v => v.is_active !== false);

    if (vehicles.length === 0) {
      return Response.json({ error: 'Geen actieve voertuigen gevonden' }, { status: 400 });
    }

    // ── 2. PLANNINGSHORIZON NORMALISEREN ─────────────────────────
    const hStart = parseTime(horizon_start || '00:00');
    const hEnd = parseTime(horizon_end || '23:59');
    const absHStart = hStart;
    const absHEnd = hEnd <= hStart ? hEnd + 1440 : hEnd; // over middernacht

    // ── 3. TAKEN FILTEREN ────────────────────────────────────────
    // Taken die actief zijn op het gekozen weekdag
    const jsWeekday = weekday; // 1=ma...7=zo
    const eligibleTasks = allTasks.filter(task => {
      if (!task.weekdays || task.weekdays.length === 0) return false;
      return task.weekdays.includes(jsWeekday);
    });

    // Bouw taakinstanties met genormaliseerde tijdvensters
    const fixCoords = (obj) => {
      if (!obj) return obj;
      let lat = obj.latitude, lng = obj.longitude;
      if (lat !== undefined && lng !== undefined && lat < lng) return { ...obj, latitude: lng, longitude: lat };
      return obj;
    };

    const taskInstances = [];
    const skippedNoCoords = [];

    for (const task of eligibleTasks) {
      let location = null;
      let locationName = '';

      if (task.object_id) {
        const obj = fixCoords(allObjects.find(o => o.id === task.object_id));
        if (obj) { location = obj; locationName = obj.name; }
      } else if (task.collectief_id && task.selected_object_ids?.length > 0) {
        // Collectief: maak meerdere stops
        const totalObjs = task.selected_object_ids.length;
        const durPerObj = Math.round((task.duration_minutes || 15) / Math.max(totalObjs, 1));
        for (const objId of task.selected_object_ids) {
          const obj = fixCoords(allObjects.find(o => o.id === objId));
          if (!obj?.latitude || !obj?.longitude) {
            skippedNoCoords.push({ taskId: task.id, name: task.task_type, reason: 'Ontbrekende coördinaten' });
            continue;
          }
          const ws = task.time_window_start || '00:00';
          const we = task.time_window_end || '23:59';
          const { start: wsAbs, end: weAbs } = normalizeWindow(ws, we, absHStart);
          taskInstances.push({
            taskId: `${task.id}_${objId}`,
            originalTaskId: task.id,
            name: `${task.task_type} — ${obj.name}`,
            address: obj.address,
            latitude: obj.latitude,
            longitude: obj.longitude,
            durationMinutes: durPerObj,
            windowStart: wsAbs,
            windowEnd: weAbs,
            taskType: task.task_type,
            isFree: task.is_free,
            priceAmount: task.price_amount || 0,
            pricingType: task.pricing_type || 'per_taak',
          });
        }
        continue;
      }

      if (!location?.latitude || !location?.longitude) {
        skippedNoCoords.push({ taskId: task.id, name: task.task_type, reason: 'Geen locatie of ontbrekende coördinaten' });
        continue;
      }

      const ws = task.time_window_start || '00:00';
      const we = task.time_window_end || '23:59';
      const { start: wsAbs, end: weAbs } = normalizeWindow(ws, we, absHStart);

      // Check of taak binnen de planningshorizon valt
      if (wsAbs >= absHEnd || weAbs <= absHStart) {
        skippedNoCoords.push({ taskId: task.id, name: locationName, reason: `Tijdvenster ${ws}-${we} valt buiten de planningshorizon ${horizon_start}-${horizon_end}` });
        continue;
      }

      taskInstances.push({
        taskId: task.id,
        originalTaskId: task.id,
        name: `${task.task_type} — ${locationName}`,
        address: location.address,
        latitude: location.latitude,
        longitude: location.longitude,
        durationMinutes: task.duration_minutes || 15,
        windowStart: wsAbs,
        windowEnd: weAbs,
        taskType: task.task_type,
        isFree: task.is_free,
        priceAmount: task.price_amount || 0,
        pricingType: task.pricing_type || 'per_taak',
      });
    }

    if (taskInstances.length === 0) {
      return Response.json({
        success: true,
        message: 'Geen taken gevonden voor de gekozen dag en tijdsperiode',
        routes: [],
        unassigned_tasks: skippedNoCoords,
        stats: { total_tasks: eligibleTasks.length, assigned: 0, unassigned: skippedNoCoords.length }
      });
    }

    // ── 4. REISMATRIX CACHE ──────────────────────────────────────
    const travelCache = new Map();

    // ── 5. ROUTE KANDIDATEN MAKEN PER VOERTUIG ───────────────────
    // Elk voertuig krijgt een eigen "route slot"
    const routeSlots = vehicles.map(vehicle => {
      const depotObj = allOffices.find(o => o.id === vehicle.start_location_id) ||
                       fixCoords(allObjects.find(o => o.id === vehicle.start_location_id));
      const depot = depotObj || { latitude: 52.5, longitude: 6.0, name: 'Depot' }; // Fallback NL centrum

      return {
        vehicleId: vehicle.id,
        vehicleName: `${vehicle.brand || ''} ${vehicle.model || ''} (${vehicle.license_plate})`.trim(),
        depot,
        routeStart: absHStart,
        routeEnd: absHEnd,
        assignedStops: [],
        costPerKm: cost_per_km ?? (vehicle.fuel_cost_per_km || 0.3),
        costPerMinute: cost_per_vehicle_minute ?? 0,
        personnelCostPerMinute: cost_per_personnel_minute ?? (16 / 60), // ~€16/uur
      };
    });

    // ── 6. TAKEN SORTEREN OP URGENTIE ─────────────────────────────
    // Smalste tijdvenster eerst, dan vroegste deadline
    const sortedTasks = [...taskInstances].sort((a, b) => {
      const windowA = a.windowEnd - a.windowStart;
      const windowB = b.windowEnd - b.windowStart;
      if (windowA !== windowB) return windowA - windowB;
      return a.windowEnd - b.windowEnd;
    });

    // ── 7. GLOBALE INSERTIE-OPTIMIZER ─────────────────────────────
    const unassignedTasks = [];
    const assignedTaskIds = new Set();

    for (const task of sortedTasks) {
      if (assignedTaskIds.has(task.taskId)) continue;

      let bestSlotIdx = -1;
      let bestPosition = -1;
      let bestCost = Infinity;

      // Probeer taak in elk voertuigslot
      for (let slotIdx = 0; slotIdx < routeSlots.length; slotIdx++) {
        const slot = routeSlots[slotIdx];
        const { bestPosition: pos, bestCost: cost } = await cheapestFeasibleInsertion(
          task, slot.assignedStops, slot.depot, slot.routeStart, slot.routeEnd, travelCache
        );
        if (pos >= 0 && cost < bestCost) {
          bestCost = cost;
          bestSlotIdx = slotIdx;
          bestPosition = pos;
        }
      }

      if (bestSlotIdx >= 0) {
        routeSlots[bestSlotIdx].assignedStops.splice(bestPosition, 0, task);
        assignedTaskIds.add(task.taskId);
      } else {
        unassignedTasks.push({
          taskId: task.taskId,
          name: task.name,
          address: task.address,
          windowStart: formatTime(task.windowStart + absHStart),
          windowEnd: formatTime(task.windowEnd + absHStart),
          durationMinutes: task.durationMinutes,
          reason: 'Geen voertuig kon deze taak inpassen binnen het tijdvenster',
          advice: [
            'Overweeg een extra voertuig beschikbaar te stellen',
            `Controleer of het tijdvenster ${formatTime(task.windowStart + absHStart)}-${formatTime(task.windowEnd + absHStart)} ruim genoeg is (taak duurt ${task.durationMinutes} min)`,
            'Controleer of er voldoende reistijd is vanuit de dichtstbijzijnde stop'
          ].join('. ')
        });
      }
    }

    // ── 8. LOKALE VERBETERING: 2-OPT BINNEN ROUTES ───────────────
    for (const slot of routeSlots) {
      if (slot.assignedStops.length < 3) continue;
      let improved = true;
      while (improved) {
        improved = false;
        const currentSim = await simulateRoute(slot.assignedStops, slot.depot, slot.routeStart, slot.routeEnd, travelCache);
        const currentCost = currentSim.totalTravelMinutes + currentSim.totalWaitMinutes;

        for (let i = 0; i < slot.assignedStops.length - 1; i++) {
          for (let j = i + 1; j < slot.assignedStops.length; j++) {
            const newStops = [...slot.assignedStops];
            // Swap twee stops
            [newStops[i], newStops[j]] = [newStops[j], newStops[i]];
            const sim = await simulateRoute(newStops, slot.depot, slot.routeStart, slot.routeEnd, travelCache);
            if (sim.feasible && sim.totalTravelMinutes + sim.totalWaitMinutes < currentCost) {
              slot.assignedStops = newStops;
              improved = true;
              break;
            }
          }
          if (improved) break;
        }
      }
    }

    // ── 9. CROSS-ROUTE VERBETERING: verplaats taak naar andere route ─
    let crossImproved = true;
    let crossIterations = 0;
    while (crossImproved && crossIterations < 5) {
      crossImproved = false;
      crossIterations++;
      for (let fromIdx = 0; fromIdx < routeSlots.length; fromIdx++) {
        for (let stopIdx = 0; stopIdx < routeSlots[fromIdx].assignedStops.length; stopIdx++) {
          const task = routeSlots[fromIdx].assignedStops[stopIdx];
          const fromWithout = [...routeSlots[fromIdx].assignedStops.filter((_, i) => i !== stopIdx)];
          const simFrom = await simulateRoute(fromWithout, routeSlots[fromIdx].depot, routeSlots[fromIdx].routeStart, routeSlots[fromIdx].routeEnd, travelCache);
          const currentCostFrom = await simulateRoute(routeSlots[fromIdx].assignedStops, routeSlots[fromIdx].depot, routeSlots[fromIdx].routeStart, routeSlots[fromIdx].routeEnd, travelCache);

          for (let toIdx = 0; toIdx < routeSlots.length; toIdx++) {
            if (toIdx === fromIdx) continue;
            for (let insertPos = 0; insertPos <= routeSlots[toIdx].assignedStops.length; insertPos++) {
              const toWith = [...routeSlots[toIdx].assignedStops.slice(0, insertPos), task, ...routeSlots[toIdx].assignedStops.slice(insertPos)];
              const simTo = await simulateRoute(toWith, routeSlots[toIdx].depot, routeSlots[toIdx].routeStart, routeSlots[toIdx].routeEnd, travelCache);
              const currentCostTo = await simulateRoute(routeSlots[toIdx].assignedStops, routeSlots[toIdx].depot, routeSlots[toIdx].routeStart, routeSlots[toIdx].routeEnd, travelCache);

              if (simFrom.feasible && simTo.feasible) {
                const beforeCost = currentCostFrom.totalTravelMinutes + currentCostTo.totalTravelMinutes;
                const afterCost = simFrom.totalTravelMinutes + simTo.totalTravelMinutes;
                if (afterCost < beforeCost - 2) { // minimaal 2 min winst
                  routeSlots[fromIdx].assignedStops = fromWithout;
                  routeSlots[toIdx].assignedStops = toWith;
                  crossImproved = true;
                  break;
                }
              }
            }
            if (crossImproved) break;
          }
          if (crossImproved) break;
        }
        if (crossImproved) break;
      }
    }

    // ── 10. EINDRESULTAAT BEREKENEN ───────────────────────────────
    const generatedRoutes = [];
    let totalCostAll = 0;
    let totalKmAll = 0;
    let totalTravelAll = 0;

    for (const slot of routeSlots) {
      if (slot.assignedStops.length === 0) continue;

      const finalSim = await simulateRoute(slot.assignedStops, slot.depot, slot.routeStart, slot.routeEnd, travelCache);
      const durationMinutes = finalSim.endTime - slot.routeStart;
      const routeCost = calculateRouteCost(
        durationMinutes, finalSim.totalDistanceKm,
        slot.costPerKm, slot.costPerMinute, slot.personnelCostPerMinute
      );

      totalCostAll += routeCost;
      totalKmAll += finalSim.totalDistanceKm;
      totalTravelAll += finalSim.totalTravelMinutes;

      const hasEstimated = finalSim.stops.some(s => s.estimated);

      generatedRoutes.push({
        vehicleId: slot.vehicleId,
        vehicleName: slot.vehicleName,
        depot: slot.depot.name || 'Depot',
        plannedStartTime: formatTime(slot.routeStart),
        plannedEndTime: formatTime(finalSim.endTime),
        taskCount: slot.assignedStops.length,
        stops: finalSim.stops,
        totalTravelMinutes: finalSim.totalTravelMinutes,
        totalDistanceKm: finalSim.totalDistanceKm,
        totalServiceMinutes: finalSim.totalServiceMinutes,
        totalWaitMinutes: finalSim.totalWaitMinutes,
        totalDurationMinutes: durationMinutes,
        estimatedCost: routeCost,
        hasEstimatedTravelTimes: hasEstimated,
        feasible: finalSim.feasible
      });
    }

    // ── 11. STATISTIEKEN ──────────────────────────────────────────
    const totalAssigned = taskInstances.length - unassignedTasks.length - skippedNoCoords.length;
    const stats = {
      total_tasks_found: eligibleTasks.length,
      task_instances: taskInstances.length,
      assigned: totalAssigned,
      unassigned: unassignedTasks.length,
      skipped_no_data: skippedNoCoords.length,
      routes_generated: generatedRoutes.length,
      total_estimated_cost: r2(totalCostAll),
      total_km: r2(totalKmAll),
      total_travel_minutes: totalTravelAll,
      vehicles_used: generatedRoutes.length,
      vehicles_available: vehicles.length,
    };

    // ── 12. OPSLAAN ALS CONCEPTROUTES ─────────────────────────────
    const savedRouteIds = [];
    if (folder_id) {
      // Verwijder eerst bestaande conceptroutes voor deze dag in de map
      const existingConceptRoutes = allRoutes.filter(r =>
        r.folder_id === folder_id &&
        r.weekdays?.includes(weekday) &&
        r.notes?.includes('AUTO-OPTIMIZER')
      );
      for (const r of existingConceptRoutes) {
        await base44.asServiceRole.entities.Route.delete(r.id);
      }

      for (const route of generatedRoutes) {
        const vehicle = allVehicles.find(v => v.id === route.vehicleId);
        const newRoute = await base44.asServiceRole.entities.Route.create({
          name: `${route.vehicleName} — ${formatTime(slot?.routeStart || parseTime(horizon_start || '00:00'))}`,
          folder_id,
          vehicle_id: route.vehicleId,
          weekdays: [weekday],
          time_window_start: route.plannedStartTime,
          time_window_end: route.plannedEndTime,
          total_route_minutes: route.totalDurationMinutes,
          total_distance_km: route.totalDistanceKm,
          notes: `AUTO-OPTIMIZER | planning_date: ${planning_date} | ${route.taskCount} taken | Est. kosten: €${route.estimatedCost}`,
          cached_optimization: {
            optimized_order: route.stops.map((s, idx) => ({
              ...s,
              task_id: s.taskId,
              travel_time_minutes: s.travelMinutes,
              distance_km: s.distanceKm,
              waiting_time: s.waitMinutes,
              arrival_time: s.arrivalTime,
              actual_start_time: s.startTime,
              departure_time: s.departureTime,
            })),
            total_travel_time: route.totalTravelMinutes,
            total_distance_km: route.totalDistanceKm,
            total_service_time: route.totalServiceMinutes,
            total_waiting_time: route.totalWaitMinutes,
            total_route_time: route.totalDurationMinutes,
            tasks_optimized: route.taskCount,
            tasks_skipped: 0,
            skipped_tasks: []
          },
          optimization_calculated_at: new Date().toISOString(),
        });
        savedRouteIds.push(newRoute.id);
      }
    }

    return Response.json({
      success: true,
      planning_date,
      weekday,
      horizon: { start: horizon_start || '00:00', end: horizon_end || '23:59' },
      routes: generatedRoutes,
      unassigned_tasks: [...skippedNoCoords, ...unassignedTasks],
      stats,
      saved_route_ids: savedRouteIds,
      optimizer_run_id: `opt_${Date.now()}`,
      calculated_at: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Fleet optimizer error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});