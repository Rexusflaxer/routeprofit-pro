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

    // Gebruik cache als hash overeenkomt en force_recalculate niet is ingesteld
    const { force_recalculate } = await req.json().catch(() => ({}));
    if (!force_recalculate && route.cached_optimization && route.optimization_hash === currentHash) {
      return Response.json(route.cached_optimization);
    }

    const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!googleMapsApiKey) {
      return Response.json({ error: 'Google Maps API key not configured' }, { status: 500 });
    }

    // Greedy nearest neighbor algoritme
    const visited = new Set();
    const optimizedOrder = [];
    
    // Start locatie
    let currentLocation = startLocation || taskObjects.reduce((earliest, task) => 
      task.time_window_start < earliest.time_window_start ? task : earliest
    );
    
    let totalTravelTime = 0;
    let totalDistanceKm = 0;
    let currentTime = parseTimeToMinutes(route.time_window_start || '00:00');
    
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

    // Vind dichtstbijzijnde volgende objecten
    while (visited.size < taskObjects.length) {
      let nearestTask = null;
      let shortestTime = Infinity;
      let travelTime = 0;

      for (const task of taskObjects) {
        if (visited.has(task.task_id)) continue;

        // Check of we binnen tijdsvenster kunnen komen
        const taskStartMinutes = parseTimeToMinutes(task.time_window_start);
        let taskEndMinutes = parseTimeToMinutes(task.time_window_end);
        // Tijdvenster eindigt na middernacht (bijv. 00:00 = volgende dag)
        if (taskEndMinutes <= parseTimeToMinutes(route.time_window_start || '00:00')) {
          taskEndMinutes += 24 * 60;
        }

        // Google Maps API call voor reistijd
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${currentLocation.latitude},${currentLocation.longitude}&destination=${task.latitude},${task.longitude}&key=${googleMapsApiKey}`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.routes && data.routes.length > 0) {
          const routeData = data.routes[0];
          let routeDuration = 0;
          let routeDistance = 0;

          (routeData.legs || []).forEach(leg => {
            routeDuration += leg.duration.value; // in seconds
            routeDistance += leg.distance.value; // in meters
          });

          const travelMinutes = Math.round(routeDuration / 60);
          const distanceKm = Math.round(routeDistance / 100) / 10;
          const arrivalTime = currentTime + travelMinutes;

          // Check of we op tijd kunnen aankomen
          if (arrivalTime <= taskEndMinutes) {
            const score = travelMinutes;

            if (score < shortestTime) {
              shortestTime = score;
              nearestTask = task;
              travelTime = travelMinutes;
              nearestTask = { ...task, _distance_km: distanceKm };
            }
          }
        }
      }

      if (!nearestTask) {
        // Geen geschikt volgend object gevonden binnen tijdsvenster
        break;
      }

      // Bereken aankomst en vertrektijd voor deze taak
      const arrivalTime = currentTime + travelTime;
      const taskStartMinutes = parseTimeToMinutes(nearestTask.time_window_start);
      const actualStartTime = Math.max(arrivalTime, taskStartMinutes);
      const waitingTime = actualStartTime - arrivalTime;
      const departureTime = actualStartTime + nearestTask.duration_minutes;

      const segmentDistanceKm = nearestTask._distance_km || 0;

      // Voeg taak toe met extra info
      const taskWithInfo = {
        ...nearestTask,
        travel_time_minutes: travelTime,
        distance_km: segmentDistanceKm,
        arrival_time: formatMinutesToTime(arrivalTime),
        actual_start_time: formatMinutesToTime(actualStartTime),
        departure_time: formatMinutesToTime(departureTime),
        waiting_time: waitingTime
      };

      optimizedOrder.push(taskWithInfo);
      visited.add(nearestTask.task_id);
      
      totalTravelTime += travelTime;
      totalDistanceKm += segmentDistanceKm;
      currentTime = departureTime;
      
      currentLocation = nearestTask;
    }

    const totalServiceTime = optimizedOrder.filter(t => !t.is_start && !t.is_end).reduce((sum, t) => sum + t.duration_minutes, 0);
    const totalWaitingTime = optimizedOrder.filter(t => !t.is_start && !t.is_end).reduce((sum, t) => sum + (t.waiting_time || 0), 0);

    const routeEndMinutes = parseTimeToMinutes(route.time_window_end || '23:59');
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
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${currentLocation.longitude},${currentLocation.latitude}&destination=${endLocation.longitude},${endLocation.latitude}&key=${googleMapsApiKey}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.status === 'OK' && data.routes && data.routes.length > 0) {
          let routeDuration = 0;
          let routeDistance = 0;
          (data.routes[0].legs || []).forEach(leg => {
            routeDuration += leg.duration.value;
            routeDistance += leg.distance.value;
          });
          const travelMinutes = Math.round(routeDuration / 60);
          const distanceKm = Math.round(routeDistance / 100) / 10;
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

    const plannedWindowMinutes = routeEndMinutes - parseTimeToMinutes(route.time_window_start || '00:00');
    const actualShiftMinutes = actualShiftEndMinutes - parseTimeToMinutes(route.time_window_start || '00:00');
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
      tasks_skipped: taskObjects.length - visited.size
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
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}