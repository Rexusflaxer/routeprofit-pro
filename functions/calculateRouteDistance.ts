import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { route_id, object_ids } = await req.json();

    // Get all tasks and objects
    const allTasks = await base44.entities.Task.list();
    const allObjects = await base44.entities.SurveillanceObject.list();

    let routeTasks, route;

    if (route_id) {
      // Fetch route by ID
      route = await base44.entities.Route.get(route_id);
      if (!route) {
        return Response.json({ error: 'Route not found' }, { status: 404 });
      }
      const assignedTaskIds = (route.assigned_tasks || []).map(at => at.task_id);
      routeTasks = allTasks.filter(t => assignedTaskIds.includes(t.id));
    } else if (object_ids && Array.isArray(object_ids)) {
      // Direct object IDs provided (for form preview)
      routeTasks = allTasks.filter(t => object_ids.includes(t.object_id));
    } else {
      return Response.json({ error: 'route_id or object_ids is required' }, { status: 400 });
    }

    // Get objects for these tasks
    const routeObjects = routeTasks
      .map(task => allObjects.find(obj => obj.id === task.object_id))
      .filter(obj => obj && obj.latitude && obj.longitude);

    if (routeObjects.length < 2) {
      return Response.json({
        total_distance_km: 0,
        avg_travel_minutes: 0,
        error: 'Not enough objects with valid coordinates'
      });
    }

    // Build waypoints for Google Maps Directions API
    const waypoints = routeObjects.map(obj => `${obj.longitude},${obj.latitude}`);
    const origin = waypoints[0];
    const destination = waypoints[waypoints.length - 1];
    const intermediates = waypoints.slice(1, -1);

    // Build Google Maps URL
    const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!googleMapsApiKey) {
      console.error('GOOGLE_MAPS_API_KEY not found in environment');
      console.error('Available env vars:', Object.keys(Deno.env.toObject()));
      return Response.json({ error: 'Google Maps API key not configured' }, { status: 500 });
    }

    let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&key=${googleMapsApiKey}`;

    if (intermediates.length > 0) {
      url += `&waypoints=${intermediates.join('|')}`;
    }

    // Call Google Maps API
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      return Response.json({ 
        error: `Google Maps API error: ${data.status}`,
        message: data.error_message 
      }, { status: 400 });
    }

    // Calculate totals from route legs
    let totalDistance = 0;
    let totalDuration = 0;

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      
      (route.legs || []).forEach(leg => {
        totalDistance += leg.distance.value; // in meters
        totalDuration += leg.duration.value; // in seconds
      });
    }

    const totalDistanceKm = totalDistance / 1000;
    const totalTravelMinutes = Math.round(totalDuration / 60);

    return Response.json({
      total_distance_km: Math.round(totalDistanceKm * 10) / 10, // Round to 1 decimal
      avg_travel_minutes: totalTravelMinutes,
      total_duration_minutes: totalTravelMinutes,
      number_of_objects: routeObjects.length
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});