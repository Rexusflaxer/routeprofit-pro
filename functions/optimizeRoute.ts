import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { route_id } = await req.json();

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

    // Get start and end locations (kan object of kantoor zijn)
    const startLocation = route.start_location_id ? 
      (allObjects.find(o => o.id === route.start_location_id) || allOffices.find(o => o.id === route.start_location_id)) : null;
    const endLocation = route.end_location_id ? 
      (allObjects.find(o => o.id === route.end_location_id) || allOffices.find(o => o.id === route.end_location_id)) : null;

    // Get objects with coordinates
    const taskObjects = [];
    routeTasks.forEach(task => {
      const obj = allObjects.find(o => o.id === task.object_id);
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
    });

    if (taskObjects.length < 2) {
      return Response.json({
        optimized_order: taskObjects,
        total_travel_time: 0,
        total_route_time: taskObjects.reduce((sum, t) => sum + t.duration_minutes, 0),
        message: 'Te weinig objecten voor optimalisatie'
      });
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
        const taskEndMinutes = parseTimeToMinutes(task.time_window_end);

        // Google Maps API call voor reistijd
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${currentLocation.longitude},${currentLocation.latitude}&destination=${task.longitude},${task.latitude}&key=${googleMapsApiKey}`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          let routeDuration = 0;

          (route.legs || []).forEach(leg => {
            routeDuration += leg.duration.value; // in seconds
          });

          const travelMinutes = Math.round(routeDuration / 60);
          const arrivalTime = currentTime + travelMinutes;

          // Check of we op tijd kunnen aankomen
          if (arrivalTime <= taskEndMinutes) {
            // Start tijd is de latere van: aankomsttijd of begin tijdvenster
            const startTime = Math.max(arrivalTime, taskStartMinutes);
            
            // Score gebaseerd op reistijd (lagere is beter)
            const score = travelMinutes;

            if (score < shortestTime) {
              shortestTime = score;
              nearestTask = task;
              travelTime = travelMinutes;
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

      // Voeg taak toe met extra info
      const taskWithInfo = {
        ...nearestTask,
        travel_time_minutes: travelTime,
        arrival_time: formatMinutesToTime(arrivalTime),
        actual_start_time: formatMinutesToTime(actualStartTime),
        departure_time: formatMinutesToTime(departureTime),
        waiting_time: waitingTime
      };

      optimizedOrder.push(taskWithInfo);
      visited.add(nearestTask.task_id);
      
      totalTravelTime += travelTime;
      currentTime = departureTime;
      
      currentLocation = nearestTask;
    }

    // Voeg eindlocatie toe als die anders is
    if (endLocation && currentLocation.object_id !== endLocation.id) {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${currentLocation.longitude},${currentLocation.latitude}&destination=${endLocation.longitude},${endLocation.latitude}&key=${googleMapsApiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'OK' && data.routes && data.routes.length > 0) {
        let routeDuration = 0;
        (data.routes[0].legs || []).forEach(leg => {
          routeDuration += leg.duration.value;
        });
        const travelMinutes = Math.round(routeDuration / 60);
        totalTravelTime += travelMinutes;
        
        const arrivalTimeAtEnd = currentTime + travelMinutes;
        
        optimizedOrder.push({
          name: `EIND: ${endLocation.name}`,
          address: endLocation.address,
          latitude: endLocation.latitude,
          longitude: endLocation.longitude,
          duration_minutes: 0,
          time_window_start: route.time_window_start || '00:00',
          time_window_end: route.time_window_end || '23:59',
          is_end: true,
          travel_time_minutes: travelMinutes,
          arrival_time: formatMinutesToTime(arrivalTimeAtEnd)
        });
      }
    }

    const totalServiceTime = optimizedOrder.filter(t => !t.is_start && !t.is_end).reduce((sum, t) => sum + t.duration_minutes, 0);
    const totalWaitingTime = optimizedOrder.filter(t => !t.is_start && !t.is_end).reduce((sum, t) => sum + (t.waiting_time || 0), 0);
    const totalRouteTime = totalServiceTime + totalTravelTime + totalWaitingTime;

    return Response.json({
      optimized_order: optimizedOrder,
      total_travel_time: totalTravelTime,
      total_service_time: totalServiceTime,
      total_waiting_time: totalWaitingTime,
      total_route_time: totalRouteTime,
      tasks_optimized: visited.size,
      tasks_skipped: taskObjects.length - visited.size
    });

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