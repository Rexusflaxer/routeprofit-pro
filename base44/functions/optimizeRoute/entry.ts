import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { route_id, force_recalculate } = body;

    if (!route_id) {
      return Response.json({ error: 'route_id is required' }, { status: 400 });
    }

    // Fetch route
    const routes = await base44.entities.Route.list();
    const route = routes.find(r => r.id === route_id);
    
    if (!route) {
      return Response.json({ error: 'Route not found' }, { status: 404 });
    }

    // Get tasks and objects
    const allTasks = await base44.entities.Task.list();
    const allObjects = await base44.entities.SurveillanceObject.list();
    const allOffices = await base44.entities.Office.list();
    
    const assignedTaskIds = (route.assigned_tasks || []).map(at => at.task_id);
    const routeTasks = allTasks.filter(t => assignedTaskIds.includes(t.id));

    // Normalize coordinates: in de database zijn lat/lng omgedraaid (latitude bevat ~6 = lengtegraad, longitude bevat ~52 = breedtegraad)
    // We corrigeren dit hier door te wisselen wanneer longitude > latitude (wat betekent dat ze omgedraaid zijn opgeslagen)
    const fixCoords = (obj) => {
      if (!obj) return obj;
      let lat = obj.latitude;
      let lng = obj.longitude;
      // Als latitude kleiner is dan longitude, zijn ze waarschijnlijk omgedraaid (NL: lat ~52, lng ~4-7)
      if (lat !== undefined && lng !== undefined && lat < lng) {
        return { ...obj, latitude: lng, longitude: lat };
      }
      return obj;
    };

    // Get start and end locations (kan object of kantoor zijn)
    const startLocation = route.start_location_id ? 
      fixCoords(allObjects.find(o => o.id === route.start_location_id) || allOffices.find(o => o.id === route.start_location_id)) : null;
    const endLocation = route.end_location_id ? 
      fixCoords(allObjects.find(o => o.id === route.end_location_id) || allOffices.find(o => o.id === route.end_location_id)) : null;

    // Get collectiefs for collectief-tasks
    const allCollectiefs = await base44.entities.Collectief.list();

    // Get objects with coordinates
    // For collectief-tasks: treat each selected object as a separate stop
    const taskObjects = [];
    routeTasks.forEach(task => {
      if (task.collectief_id && task.selected_object_ids && task.selected_object_ids.length > 0) {
        // Collectief-taak: voeg elk geselecteerd object toe als aparte stop
        const totalObjects = task.selected_object_ids.length;
        const durationPerObject = Math.round((task.duration_minutes || 0) / totalObjects);
        task.selected_object_ids.forEach((objId, idx) => {
          const rawObj = allObjects.find(o => o.id === objId);
          const obj = rawObj ? fixCoords(rawObj) : null;
          if (obj && obj.latitude && obj.longitude) {
            taskObjects.push({
              task_id: `${task.id}_${idx}`,
              object_id: obj.id,
              name: obj.name,
              address: obj.address,
              latitude: obj.latitude,
              longitude: obj.longitude,
              duration_minutes: durationPerObject,
              time_window_start: task.time_window_start || route.time_window_start || '00:00',
              time_window_end: task.time_window_end || route.time_window_end || '23:59',
              task_type: task.task_type
            });
          }
        });
      } else {
        // Gewone taak: koppel aan enkel object
        const rawObj = allObjects.find(o => o.id === task.object_id);
        const obj = rawObj ? fixCoords(rawObj) : null;
        if (obj && obj.latitude && obj.longitude) {
          taskObjects.push({
            task_id: task.id,
            object_id: obj.id,
            name: obj.name,
            address: obj.address,
            latitude: obj.latitude,
            longitude: obj.longitude,
            duration_minutes: task.duration_minutes || 0,
            time_window_start: task.time_window_start || route.time_window_start || '00:00',
            time_window_end: task.time_window_end || route.time_window_end || '23:59',
            task_type: task.task_type
          });
        }
      }
    });

    if (taskObjects.length < 2) {
      return Response.json({
        optimized_order: taskObjects,
        total_travel_time: 0,
        total_route_time: taskObjects.reduce((sum, t) => sum + t.duration_minutes, 0),
        message: `Te weinig objecten voor optimalisatie (${taskObjects.length} gevonden)`
      });
    }

    // Bereken hash van relevante route-data om te detecteren of herberekening nodig is
    const hashInput = JSON.stringify({
      assigned_tasks: route.assigned_tasks,
      start_location_id: route.start_location_id,
      end_location_id: route.end_location_id,
      time_window_start: route.time_window_start,
      time_window_end: route.time_window_end,
      alarm_standby: route.alarm_standby,
      task_ids: taskObjects.map(t => t.task_id + ':' + t.duration_minutes + ':' + t.time_window_start + ':' + t.time_window_end)
    });
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashInput));
    const currentHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);

    // Gebruik cache alleen als deze actueel én compleet is; oude caches zonder waarschuwingdetails worden opnieuw berekend.
    const cachedOptimizationIsComplete = route.cached_optimization?.tasks_skipped === 0 || Array.isArray(route.cached_optimization?.skipped_tasks);
    if (!force_recalculate && route.cached_optimization && route.optimization_hash === currentHash && cachedOptimizationIsComplete) {
      return Response.json(route.cached_optimization);
    }

    const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!googleMapsApiKey) {
      return Response.json({ error: 'Google Maps API key not configured' }, { status: 500 });
    }

    // Greedy nearest neighbor algoritme
    const visited = new Set();
    const optimizedOrder = [];
    // skippedReasons wordt pas gevuld NA de volledige optimalisatie-loop
    // zodat taken die in een vroege iteratie "te laat" lijken maar later toch worden opgenomen, niet foutief worden gemarkeerd
    
    // Start locatie
    let currentLocation = startLocation || taskObjects.reduce((earliest, task) => 
      task.time_window_start < earliest.time_window_start ? task : earliest
    );
    
    let totalTravelTime = 0;
    let totalDistanceKm = 0;
    const routeStartMinutes = parseTimeToMinutes(route.time_window_start || '00:00');
    let routeEndMinutes = parseTimeToMinutes(route.time_window_end || '23:59');
    if (routeEndMinutes <= routeStartMinutes) routeEndMinutes += 24 * 60;
    let currentTime = routeStartMinutes;
    
    // Als startlocatie niet een taak is, voeg startpunt toe voor visuele weergave
    if (startLocation && !taskObjects.some(t => t.object_id === startLocation.id)) {
      optimizedOrder.push({
        name: `START: ${startLocation.name}`,
        address: startLocation.address,
        latitude: startLocation.latitude,
        longitude: startLocation.longitude,
        duration_minutes: 0,
        time_window_start: route.time_window_start || '00:00',
        time_window_end: route.time_window_end || '23:59',
        is_start: true,
        arrival_time: formatMinutesToTime(currentTime),
        departure_time: formatMinutesToTime(currentTime)
      });
    }

    // Helper: plaats elk taaktijdvenster op de juiste kalenderdag binnen het routevenster.
    // Voor een route 18:00-08:00 betekent 04:00-08:00 dus volgende ochtend, niet dezelfde ochtend.
    const normalizeTaskWindow = (task) => {
      const baseStart = parseTimeToMinutes(task.time_window_start);
      let baseEnd = parseTimeToMinutes(task.time_window_end);
      if (baseEnd <= baseStart) baseEnd += 24 * 60;

      const candidates = [-24 * 60, 0, 24 * 60].map(offset => ({
        taskStart: baseStart + offset,
        taskEnd: baseEnd + offset
      }));

      const overlapping = candidates
        .filter(window => window.taskStart < routeEndMinutes && window.taskEnd > routeStartMinutes)
        .sort((a, b) => a.taskStart - b.taskStart);

      return overlapping[0] || { taskStart: baseStart, taskEnd: baseEnd };
    };

    // Cache voor reistijden: slaat (origin_task_id, dest_task_id) -> { travelMinutes, distanceKm } op
    // om dubbele Google Maps calls te voorkomen
    const travelCache = new Map();
    const getTravelTime = async (fromLat, fromLng, toLat, toLng, cacheKey) => {
      if (travelCache.has(cacheKey)) return travelCache.get(cacheKey);
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&key=${googleMapsApiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === 'OK' && data.routes && data.routes.length > 0) {
        let routeDuration = 0;
        let routeDistance = 0;
        (data.routes[0].legs || []).forEach(leg => {
          routeDuration += leg.duration.value;
          routeDistance += leg.distance.value;
        });
        const result = {
          travelMinutes: Math.round(routeDuration / 60),
          distanceKm: Math.round(routeDistance / 100) / 10
        };
        travelCache.set(cacheKey, result);
        return result;
      }
      return null;
    };

    // Vind dichtstbijzijnde volgende objecten
    // Score = reistijd + wachttijd (totale tijd tot we de taak starten)
    // Taken waarbij we te laat aankomen (na einde tijdvenster) worden overgeslagen.
    // Taken die wachttijd vereisen (aankomst vóór vensteropening) zijn WEL toegestaan.
    // De loop stopt alleen als GEEN ENKELE resterende taak meer bereikbaar is vóór het einde van haar tijdvenster.
    while (visited.size < taskObjects.length) {
      let bestTask = null;
      let bestScore = Infinity; // score = deadline eerst, daarna reistijd
      let bestTravelTime = 0;
      let bestDistanceKm = 0;

      for (const task of taskObjects) {
        if (visited.has(task.task_id)) continue;

        const { taskStart, taskEnd } = normalizeTaskWindow(task);

        // Bereken reistijd
        const fromId = currentLocation.task_id || currentLocation.id || 'start';
        const cacheKey = `${fromId}->${task.task_id}`;
        const travel = await getTravelTime(
          currentLocation.latitude, currentLocation.longitude,
          task.latitude, task.longitude,
          cacheKey
        );
        if (!travel) continue;

        const { travelMinutes, distanceKm } = travel;
        const arrivalTime = currentTime + travelMinutes;

        // We kunnen deze taak uitvoeren als we aankomen VÓÓR het einde van het tijdvenster
        // (ook al zijn we vroeg en moeten we wachten)
        if (arrivalTime > taskEnd) continue; // te laat — sla over

        const waitingTime = Math.max(0, taskStart - arrivalTime);
        const canFinishBeforeWindowEnds = Math.max(arrivalTime, taskStart) + task.duration_minutes <= taskEnd;
        if (!canFinishBeforeWindowEnds) continue;

        // Urgente taken met vroege eindtijd krijgen prioriteit, daarna kortste reistijd/wachttijd.
        const score = (taskEnd * 10000) + (waitingTime * 10) + travelMinutes;
        if (score < bestScore) {
          bestScore = score;
          bestTask = { ...task, _distance_km: distanceKm };
          bestTravelTime = travelMinutes;
          bestDistanceKm = distanceKm;
        }
      }

      if (!bestTask) {
        break; // Geen enkele taak meer bereikbaar
      }

      // Bereken aankomst en vertrektijd voor de gekozen taak
      const { taskStart: chosenStart } = normalizeTaskWindow(bestTask);
      const arrivalTime = currentTime + bestTravelTime;
      const actualStartTime = Math.max(arrivalTime, chosenStart);
      const waitingTime = actualStartTime - arrivalTime;
      const departureTime = actualStartTime + bestTask.duration_minutes;

      optimizedOrder.push({
        ...bestTask,
        travel_time_minutes: bestTravelTime,
        distance_km: bestDistanceKm,
        arrival_time: formatMinutesToTime(arrivalTime),
        actual_start_time: formatMinutesToTime(actualStartTime),
        departure_time: formatMinutesToTime(departureTime),
        waiting_time: waitingTime
      });

      visited.add(bestTask.task_id);
      totalTravelTime += bestTravelTime;
      totalDistanceKm += bestDistanceKm;
      currentTime = departureTime;
      currentLocation = bestTask;
    }

    // Reparatiestap: probeer overgeslagen taken alsnog in te voegen op elke mogelijke positie.
    // Dit voorkomt dat een vroege greedy-keuze later onnodig taken blokkeert.
    const simulateSequence = async (sequence) => {
      const simulatedOrder = [];
      let simCurrentTime = routeStartMinutes;
      let simTotalTravelTime = 0;
      let simTotalDistanceKm = 0;
      let simCurrentLocation = startLocation || sequence[0];

      if (startLocation) {
        simulatedOrder.push({
          name: `START: ${startLocation.name}`,
          address: startLocation.address,
          latitude: startLocation.latitude,
          longitude: startLocation.longitude,
          duration_minutes: 0,
          time_window_start: route.time_window_start || '00:00',
          time_window_end: route.time_window_end || '23:59',
          is_start: true,
          arrival_time: formatMinutesToTime(simCurrentTime),
          departure_time: formatMinutesToTime(simCurrentTime)
        });
      }

      for (const task of sequence) {
        if (!simCurrentLocation) simCurrentLocation = task;
        const fromId = simCurrentLocation.task_id || simCurrentLocation.id || 'start';
        const travel = await getTravelTime(
          simCurrentLocation.latitude, simCurrentLocation.longitude,
          task.latitude, task.longitude,
          `${fromId}->${task.task_id}`
        );
        if (!travel) return null;

        const { taskStart, taskEnd } = normalizeTaskWindow(task);
        const arrivalTime = simCurrentTime + travel.travelMinutes;
        const actualStartTime = Math.max(arrivalTime, taskStart);
        const departureTime = actualStartTime + task.duration_minutes;

        if (arrivalTime > taskEnd || departureTime > taskEnd) return null;

        simulatedOrder.push({
          ...task,
          travel_time_minutes: travel.travelMinutes,
          distance_km: travel.distanceKm,
          arrival_time: formatMinutesToTime(arrivalTime),
          actual_start_time: formatMinutesToTime(actualStartTime),
          departure_time: formatMinutesToTime(departureTime),
          waiting_time: actualStartTime - arrivalTime
        });

        simTotalTravelTime += travel.travelMinutes;
        simTotalDistanceKm += travel.distanceKm;
        simCurrentTime = departureTime;
        simCurrentLocation = task;
      }

      return {
        order: simulatedOrder,
        currentTime: simCurrentTime,
        currentLocation: simCurrentLocation,
        totalTravelTime: simTotalTravelTime,
        totalDistanceKm: simTotalDistanceKm
      };
    };

    let sequenceTasks = optimizedOrder.filter(item => !item.is_start && !item.is_end && !item.is_alarm_standby);
    let repairImproved = true;
    while (repairImproved) {
      repairImproved = false;
      const remainingTasks = taskObjects.filter(task => !visited.has(task.task_id));

      let bestRepair = null;
      for (const task of remainingTasks) {
        for (let index = 0; index <= sequenceTasks.length; index++) {
          const candidateSequence = [
            ...sequenceTasks.slice(0, index),
            task,
            ...sequenceTasks.slice(index)
          ];
          const simulation = await simulateSequence(candidateSequence);
          if (!simulation) continue;

          const addedTravel = simulation.totalTravelTime - totalTravelTime;
          const score = (simulation.currentTime * 1000) + addedTravel;
          if (!bestRepair || score < bestRepair.score) {
            bestRepair = { task, simulation, candidateSequence, score };
          }
        }
      }

      if (bestRepair) {
        sequenceTasks = bestRepair.candidateSequence;
        optimizedOrder.length = 0;
        optimizedOrder.push(...bestRepair.simulation.order);
        totalTravelTime = bestRepair.simulation.totalTravelTime;
        totalDistanceKm = bestRepair.simulation.totalDistanceKm;
        currentTime = bestRepair.simulation.currentTime;
        currentLocation = bestRepair.simulation.currentLocation;
        visited.add(bestRepair.task.task_id);
        repairImproved = true;
      }
    }

    // Brede zoekstap: probeer een betere totale volgorde te vinden die méér taken bevat.
    // Dit is nodig wanneer twee gemiste taken alleen samen passen als eerdere stops worden herschikt.
    const buildOrderFromSequence = async (sequence) => {
      const simulation = await simulateSequence(sequence);
      if (!simulation) return null;
      return simulation;
    };

    const findBestSequence = async () => {
      const beamWidth = 2500;
      const taskDeadlineById = new Map(taskObjects.map(task => [task.task_id, normalizeTaskWindow(task).taskEnd]));
      let beam = [{
        sequence: [],
        visitedIds: new Set(),
        currentTime: routeStartMinutes,
        currentLocation: startLocation || taskObjects[0],
        totalTravelTime: 0,
        totalDistanceKm: 0,
        urgencyScore: 0
      }];
      let bestState = beam[0];

      const getStateKey = (state) => {
        const remainingUrgentTasks = taskObjects
          .filter(task => !state.visitedIds.has(task.task_id) && taskDeadlineById.get(task.task_id) <= state.currentTime + 90)
          .map(task => task.task_id)
          .sort()
          .join('|');
        return `${state.currentLocation.task_id || state.currentLocation.id || 'start'}::${Math.floor(state.currentTime / 10)}::${remainingUrgentTasks}`;
      };

      const keepDiverseBestStates = (states) => {
        const grouped = new Map();
        for (const state of states) {
          const key = getStateKey(state);
          const existing = grouped.get(key);
          if (!existing ||
              state.sequence.length > existing.sequence.length ||
              (state.sequence.length === existing.sequence.length && state.urgencyScore > existing.urgencyScore) ||
              (state.sequence.length === existing.sequence.length && state.urgencyScore === existing.urgencyScore && state.currentTime < existing.currentTime)) {
            grouped.set(key, state);
          }
        }
        return Array.from(grouped.values()).sort((a, b) => {
          const countDiff = b.sequence.length - a.sequence.length;
          if (countDiff !== 0) return countDiff;
          const urgencyDiff = b.urgencyScore - a.urgencyScore;
          if (urgencyDiff !== 0) return urgencyDiff;
          const timeDiff = a.currentTime - b.currentTime;
          if (timeDiff !== 0) return timeDiff;
          return a.totalTravelTime - b.totalTravelTime;
        }).slice(0, beamWidth);
      };

      for (let depth = 0; depth < taskObjects.length; depth++) {
        const nextBeam = [];

        for (const state of beam) {
          let expanded = false;

          for (const task of taskObjects) {
            if (state.visitedIds.has(task.task_id)) continue;

            const travel = await getTravelTime(
              state.currentLocation.latitude, state.currentLocation.longitude,
              task.latitude, task.longitude,
              `${state.currentLocation.task_id || state.currentLocation.id || 'start'}->${task.task_id}`
            );
            if (!travel) continue;

            const { taskStart, taskEnd } = normalizeTaskWindow(task);
            const arrivalTime = state.currentTime + travel.travelMinutes;
            const actualStartTime = Math.max(arrivalTime, taskStart);
            const departureTime = actualStartTime + task.duration_minutes;

            if (arrivalTime > taskEnd || departureTime > taskEnd) continue;

            const nextVisitedIds = new Set(state.visitedIds);
            nextVisitedIds.add(task.task_id);
            const deadlineSlack = Math.max(0, taskEnd - departureTime);
            const urgentTaskBonus = Math.max(0, 240 - deadlineSlack);
            nextBeam.push({
              sequence: [...state.sequence, task],
              visitedIds: nextVisitedIds,
              currentTime: departureTime,
              currentLocation: task,
              totalTravelTime: state.totalTravelTime + travel.travelMinutes,
              totalDistanceKm: state.totalDistanceKm + travel.distanceKm,
              urgencyScore: state.urgencyScore + urgentTaskBonus
            });
            expanded = true;
          }

          if (!expanded && (
            state.sequence.length > bestState.sequence.length ||
            (state.sequence.length === bestState.sequence.length && state.urgencyScore > bestState.urgencyScore)
          )) {
            bestState = state;
          }
        }

        if (nextBeam.length === 0) break;

        beam = keepDiverseBestStates(nextBeam);
        if (beam[0].sequence.length > bestState.sequence.length ||
            (beam[0].sequence.length === bestState.sequence.length && beam[0].urgencyScore > bestState.urgencyScore) ||
            (beam[0].sequence.length === bestState.sequence.length && beam[0].urgencyScore === bestState.urgencyScore && beam[0].totalTravelTime < bestState.totalTravelTime)) {
          bestState = beam[0];
        }
      }

      return bestState;
    };

    const bestSequenceState = await findBestSequence();
    if (bestSequenceState.sequence.length > sequenceTasks.length) {
      const bestSimulation = await buildOrderFromSequence(bestSequenceState.sequence);
      if (bestSimulation) {
        sequenceTasks = bestSequenceState.sequence;
        optimizedOrder.length = 0;
        optimizedOrder.push(...bestSimulation.order);
        totalTravelTime = bestSimulation.totalTravelTime;
        totalDistanceKm = bestSimulation.totalDistanceKm;
        currentTime = bestSimulation.currentTime;
        currentLocation = bestSimulation.currentLocation;
        visited.clear();
        sequenceTasks.forEach(task => visited.add(task.task_id));
      }
    }

    const toAbsoluteRouteMinutes = (timeString) => {
      let minutes = parseTimeToMinutes(timeString);
      if (minutes < routeStartMinutes) minutes += 24 * 60;
      return minutes;
    };

    const realPlannedStops = optimizedOrder
      .filter(item => !item.is_start && !item.is_end && !item.is_alarm_standby)
      .map(item => {
        const start = toAbsoluteRouteMinutes(item.actual_start_time || item.arrival_time);
        let end = toAbsoluteRouteMinutes(item.departure_time || item.actual_start_time || item.arrival_time);
        if (end < start) end += 24 * 60;
        return { ...item, _start: start, _end: end };
      });

    const getSkippedTaskExplanation = async (task, taskStartMin, taskEndMin, windowsOverlap) => {
      if (!windowsOverlap) {
        return {
          name: task.name,
          time_window: `${task.time_window_start} - ${task.time_window_end}`,
          reason: `Het tijdvenster van deze taak valt buiten de route (${route.time_window_start} - ${route.time_window_end}).`,
          advice: `Verplaats het tijdvenster naar binnen de route of maak hiervoor een aparte route.`
        };
      }

      const conflicts = realPlannedStops
        .filter(stop => stop._start < taskEndMin && stop._end > taskStartMin)
        .map(stop => ({
          name: stop.name,
          planned_time: `${formatMinutesToTime(stop._start)} - ${formatMinutesToTime(stop._end)}`,
          time_window: stop.time_window_start && stop.time_window_end ? `${stop.time_window_start} - ${stop.time_window_end}` : undefined
        }));

      const candidates = [];
      const possiblePreviousStops = [
        { name: startLocation?.name || 'Start route', latitude: currentLocation?.latitude || startLocation?.latitude, longitude: currentLocation?.longitude || startLocation?.longitude, _end: routeStartMinutes, task_id: 'route_start' },
        ...realPlannedStops.filter(stop => stop._end <= taskEndMin)
      ].filter(stop => stop.latitude && stop.longitude);

      for (const previousStop of possiblePreviousStops) {
        const travel = await getTravelTime(
          previousStop.latitude, previousStop.longitude,
          task.latitude, task.longitude,
          `${previousStop.task_id || previousStop.name}->skipped-${task.task_id}`
        );
        if (!travel) continue;

        const arrival = previousStop._end + travel.travelMinutes;
        const start = Math.max(arrival, taskStartMin);
        const finish = start + task.duration_minutes;
        candidates.push({ previousStop, arrival, start, finish, travelMinutes: travel.travelMinutes });
      }

      const bestCandidate = candidates.sort((a, b) => a.finish - b.finish)[0];
      const suggestedEndMinutes = bestCandidate?.finish;
      const suggestedEnd = suggestedEndMinutes ? formatMinutesToTime(suggestedEndMinutes) : null;
      const conflictText = conflicts.length > 0
        ? `Botst met ${conflicts.map(conflict => `${conflict.name} (${conflict.planned_time})`).join(', ')}.`
        : `Er is geen vrij blok groot genoeg binnen dit tijdvenster, inclusief reistijd.`;
      const needsLongerWindow = suggestedEndMinutes && suggestedEndMinutes > taskEndMin;

      return {
        name: task.name,
        time_window: `${task.time_window_start} - ${task.time_window_end}`,
        reason: `Deze taak duurt ${task.duration_minutes} minuten, maar er is binnen ${task.time_window_start} - ${task.time_window_end} geen aaneengesloten vrij blok beschikbaar door de huidige routevolgorde en reistijden. ${conflictText}`,
        conflicts,
        advice: needsLongerWindow
          ? `Maak ruimte door het tijdvenster van deze taak te verlengen tot minimaal ${suggestedEnd}, of verplaats één van de conflicterende taken naar een later of eerder moment.`
          : `Het tijdvenster zelf is ruim genoeg, maar het blok is bezet. Verplaats één of meer conflicterende taken buiten ${task.time_window_start} - ${task.time_window_end}, verkort de taakduur, of zet deze taak op een aparte route.`
      };
    };

    // Bepaal welke taken daadwerkelijk zijn overgeslagen (niet bezocht)
    // en waarom: controleer elk overgeslagen object op tijdvensterproblemen
    const skippedTasksList = [];
    for (const task of taskObjects) {
      if (visited.has(task.task_id)) continue;

      const { taskStart: taskStartMin, taskEnd: taskEndMin } = normalizeTaskWindow(task);
      const windowsOverlap = taskStartMin < routeEndMinutes && taskEndMin > routeStartMinutes;
      skippedTasksList.push(await getSkippedTaskExplanation(task, taskStartMin, taskEndMin, windowsOverlap));
    }

    const totalServiceTime = optimizedOrder.filter(t => !t.is_start && !t.is_end).reduce((sum, t) => sum + t.duration_minutes, 0);
    const totalWaitingTime = optimizedOrder.filter(t => !t.is_start && !t.is_end).reduce((sum, t) => sum + (t.waiting_time || 0), 0);

    const alarmStandby = !!route.alarm_standby;

    let actualShiftEndMinutes;
    let alarmAfterRoute = 0;
    let alarmBetweenStops = 0;

    if (alarmStandby) {
      actualShiftEndMinutes = routeEndMinutes;
      alarmAfterRoute = Math.max(0, routeEndMinutes - currentTime);
      alarmBetweenStops = totalWaitingTime;
    } else {
      actualShiftEndMinutes = currentTime;
    }

    // Volgorde: laatste taak → alarmdienst (indien van toepassing) → eindstop
    // Alarmdienst blok invoegen VOOR de eindstop
    if (alarmStandby && alarmAfterRoute > 0) {
      optimizedOrder.push({
        is_alarm_standby: true,
        name: 'Alarmdienst',
        duration_minutes: alarmAfterRoute,
        arrival_time: formatMinutesToTime(currentTime),
        departure_time: formatMinutesToTime(routeEndMinutes),
      });
    }

    // Voeg eindlocatie toe als die anders is (na alarmdienst, zonder reistijd als alarmdienst actief)
    if (endLocation && currentLocation.object_id !== endLocation.id) {
      if (alarmStandby) {
        // Bij alarmdienst: eindstop wordt bereikt aan het einde van de alarmdienst, geen extra reistijd
        optimizedOrder.push({
          name: `EIND: ${endLocation.name}`,
          address: endLocation.address,
          latitude: endLocation.latitude,
          longitude: endLocation.longitude,
          duration_minutes: 0,
          is_end: true,
          travel_time_minutes: 0,
          distance_km: 0,
          arrival_time: formatMinutesToTime(routeEndMinutes)
        });
      } else {
        const endTravel = await getTravelTime(
          currentLocation.latitude, currentLocation.longitude,
          endLocation.latitude, endLocation.longitude,
          `end->${endLocation.id}`
        );
        if (endTravel) {
          const { travelMinutes, distanceKm } = endTravel;
          totalTravelTime += travelMinutes;
          totalDistanceKm += distanceKm;
          const arrivalTimeAtEnd = currentTime + travelMinutes;
          actualShiftEndMinutes = arrivalTimeAtEnd;
          optimizedOrder.push({
            name: `EIND: ${endLocation.name}`,
            address: endLocation.address,
            latitude: endLocation.latitude,
            longitude: endLocation.longitude,
            duration_minutes: 0,
            is_end: true,
            travel_time_minutes: travelMinutes,
            distance_km: distanceKm,
            arrival_time: formatMinutesToTime(arrivalTimeAtEnd)
          });
        }
      }
    }

    const plannedWindowMinutes = routeEndMinutes - routeStartMinutes;
    const actualShiftMinutes = actualShiftEndMinutes - routeStartMinutes;
    const finishedEarly = !alarmStandby && currentTime < routeEndMinutes;
    const finishedLate = currentTime > routeEndMinutes;

    const totalRouteTime = totalServiceTime + totalTravelTime + (alarmStandby ? totalWaitingTime : 0) + alarmAfterRoute;

    const result = {
      optimized_order: optimizedOrder,
      total_travel_time: totalTravelTime,
      total_distance_km: Math.round(totalDistanceKm * 10) / 10,
      total_service_time: totalServiceTime,
      total_waiting_time: totalWaitingTime,
      total_alarm_standby_time: alarmAfterRoute + (alarmStandby ? alarmBetweenStops : 0),
      total_route_time: totalRouteTime,
      actual_shift_minutes: actualShiftMinutes,
      planned_window_minutes: plannedWindowMinutes,
      finished_early: finishedEarly,
      finished_late: finishedLate,
      early_by_minutes: finishedEarly ? routeEndMinutes - currentTime : 0,
      late_by_minutes: finishedLate ? currentTime - routeEndMinutes : 0,
      alarm_standby: alarmStandby,
      tasks_optimized: visited.size,
      tasks_skipped: taskObjects.length - visited.size,
      skipped_tasks: skippedTasksList
    };

    // Sla resultaat op in de route (cache)
    const updateData = {
      cached_optimization: result,
      optimization_calculated_at: new Date().toISOString(),
      optimization_hash: currentHash,
      total_route_minutes: actualShiftMinutes,
      total_distance_km: Math.round(totalDistanceKm * 10) / 10,
      avg_travel_minutes: taskObjects.length > 0 ? Math.round(totalTravelTime / Math.max(taskObjects.length - 1, 1)) : 0
    };
    await base44.asServiceRole.entities.Route.update(route_id, updateData);

    return Response.json(result);

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function parseTimeToMinutes(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatMinutesToTime(minutes) {
  const totalMins = minutes % (24 * 60); // Wrap naar 0-1439
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}