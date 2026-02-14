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
    
    const assignedTaskIds = (route.assigned_tasks || []).map(at => at.task_id);
    const routeTasks = allTasks.filter(t => assignedTaskIds.includes(t.id));

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
          time_window_end: task.time_window_end || route.time_window_end || '23:59'
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
    
    // Start met eerste object (of object met vroegste tijdvenster)
    let currentTask = taskObjects.reduce((earliest, task) => 
      task.time_window_start < earliest.time_window_start ? task : earliest
    );
    
    optimizedOrder.push(currentTask);
    visited.add(currentTask.task_id);
    
    let totalTravelTime = 0;
    let currentTime = parseTimeToMinutes(currentTask.time_window_start);
    currentTime += currentTask.duration_minutes;

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
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${currentTask.longitude},${currentTask.latitude}&destination=${task.longitude},${task.latitude}&key=${googleMapsApiKey}`;
        
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

      optimizedOrder.push(nearestTask);
      visited.add(nearestTask.task_id);
      
      totalTravelTime += travelTime;
      const arrivalTime = currentTime + travelTime;
      const taskStartMinutes = parseTimeToMinutes(nearestTask.time_window_start);
      currentTime = Math.max(arrivalTime, taskStartMinutes) + nearestTask.duration_minutes;
      
      currentTask = nearestTask;
    }

    const totalServiceTime = optimizedOrder.reduce((sum, t) => sum + t.duration_minutes, 0);
    const totalRouteTime = totalServiceTime + totalTravelTime;

    return Response.json({
      optimized_order: optimizedOrder,
      total_travel_time: totalTravelTime,
      total_service_time: totalServiceTime,
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