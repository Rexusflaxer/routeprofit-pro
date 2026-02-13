import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    console.error('=== calculateRouteDistance started ===');
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    console.error('User authenticated:', user?.email);

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { route_id, object_ids } = await req.json();

    // Get all tasks and objects
    const allTasks = await base44.entities.Task.list();
    const allObjects = await base44.entities.SurveillanceObject.list();

    let uniqueObjects = [];

    if (route_id) {
      // Fetch route by ID
      const route = await base44.entities.Route.get(route_id);
      if (!route) {
        return Response.json({ error: 'Route not found' }, { status: 404 });
      }
      const assignedTaskIds = (route.assigned_tasks || []).map(at => at.task_id);
      const routeTasks = allTasks.filter(t => assignedTaskIds.includes(t.id));
      
      const seenIds = new Set();
      routeTasks.forEach(task => {
        const obj = allObjects.find(o => o.id === task.object_id);
        if (obj && obj.latitude && obj.longitude && !seenIds.has(obj.id)) {
          uniqueObjects.push(obj);
          seenIds.add(obj.id);
        }
      });
    } else if (object_ids && Array.isArray(object_ids) && object_ids.length > 0) {
      // Direct object IDs provided (for form preview)
      object_ids.forEach(objId => {
        const obj = allObjects.find(o => o.id === objId);
        if (obj && obj.latitude && obj.longitude) {
          uniqueObjects.push(obj);
        }
      });
    } else {
      return Response.json({ error: 'route_id or object_ids is required' }, { status: 400 });
    }

    console.log(`Found ${uniqueObjects.length} unique objects`);
    uniqueObjects.forEach((obj, i) => {
      console.log(`  ${i+1}. ${obj.name}: lat=${obj.latitude}, lon=${obj.longitude}`);
    });

    if (uniqueObjects.length < 2) {
      return Response.json({
        total_distance_km: 0,
        avg_travel_minutes: 0,
        number_of_pairs: 0,
        debug: `Only ${uniqueObjects.length} objects found`
      });
    }

    const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!googleMapsApiKey) {
      return Response.json({ error: 'Google Maps API key not configured' }, { status: 500 });
    }

    console.log('Starting pair calculations...');

    // Calculate travel time for all unique pairs of objects
    let totalTravelMinutes = 0;
    let totalDistanceKm = 0;
    let pairCount = 0;

    // Generate all unique pairs
    for (let i = 0; i < uniqueObjects.length; i++) {
      for (let j = i + 1; j < uniqueObjects.length; j++) {
        const obj1 = uniqueObjects[i];
        const obj2 = uniqueObjects[j];

        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${obj1.latitude},${obj1.longitude}&destination=${obj2.latitude},${obj2.longitude}&key=${googleMapsApiKey}`;

        try {
          const response = await fetch(url);
          const data = await response.json();

          console.log(`Pair ${i+1}-${j+1} (${obj1.name} to ${obj2.name}):`, data.status);

          if (data.status === 'OK' && data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            let routeDistance = 0;
            let routeDuration = 0;

            (route.legs || []).forEach(leg => {
              routeDistance += leg.distance.value; // in meters
              routeDuration += leg.duration.value; // in seconds
            });

            totalDistanceKm += routeDistance / 1000;
            totalTravelMinutes += Math.round(routeDuration / 60);
            pairCount++;
            console.log(`  Added: ${Math.round(routeDuration / 60)} min, ${(routeDistance / 1000).toFixed(1)} km`);
          } else {
            console.log(`  Failed: ${data.error_message || 'Unknown error'}`);
          }
        } catch (err) {
          console.log(`  Error fetching pair ${i+1}-${j+1}:`, err.message);
        }
      }
    }

    // Calculate average travel time per pair
    const avgTravelMinutes = pairCount > 0 ? Math.round(totalTravelMinutes / pairCount) : 0;

    return Response.json({
      total_distance_km: Math.round(totalDistanceKm * 10) / 10,
      avg_travel_minutes: avgTravelMinutes,
      total_travel_minutes_all_pairs: totalTravelMinutes,
      number_of_objects: uniqueObjects.length,
      number_of_pairs: pairCount
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});