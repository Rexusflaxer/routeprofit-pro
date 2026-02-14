import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { route_id, object_ids, start_location_id, end_location_id } = await req.json();

    // Get all objects and offices
    const allObjects = await base44.entities.SurveillanceObject.list();
    const allOffices = await base44.entities.Office.list();
    const allLocations = [...allObjects, ...allOffices];

    let uniqueObjects = [];
    let numberOfTasks = 0;

    if (object_ids && Array.isArray(object_ids) && object_ids.length > 0) {
      // Direct object IDs provided (for form preview)
      numberOfTasks = object_ids.length;
      object_ids.forEach(objId => {
        const obj = allObjects.find(o => o.id === objId);
        if (obj && obj.latitude && obj.longitude) {
          uniqueObjects.push(obj);
        }
      });
    } else if (route_id) {
      // Fetch route by ID
      const route = await base44.entities.Route.get(route_id);
      if (!route) {
        return Response.json({ error: 'Route not found' }, { status: 404 });
      }
      const allTasks = await base44.entities.Task.list();
      const assignedTaskIds = (route.assigned_tasks || []).map(at => at.task_id);
      const routeTasks = allTasks.filter(t => assignedTaskIds.includes(t.id));
      
      // Count total number of tasks
      numberOfTasks = routeTasks.length;
      
      const seenIds = new Set();
      routeTasks.forEach(task => {
        const obj = allObjects.find(o => o.id === task.object_id);
        if (obj && obj.latitude && obj.longitude && !seenIds.has(obj.id)) {
          uniqueObjects.push(obj);
          seenIds.add(obj.id);
        }
      });
    } else {
      return Response.json({ error: 'route_id or object_ids is required' }, { status: 400 });
    }

    // Add start location at the beginning if provided
    if (start_location_id) {
      const startLoc = allLocations.find(loc => loc.id === start_location_id);
      if (startLoc && startLoc.latitude && startLoc.longitude) {
        // Check if this location is not already in the list
        const alreadyExists = uniqueObjects.some(obj => obj.id === startLoc.id);
        if (!alreadyExists) {
          uniqueObjects.unshift(startLoc);
        }
      }
    }
    
    // Add end location at the end if provided
    if (end_location_id) {
      const endLoc = allLocations.find(loc => loc.id === end_location_id);
      if (endLoc && endLoc.latitude && endLoc.longitude) {
        // Check if this location is not already in the list (including if it's the same as start)
        const alreadyExists = uniqueObjects.some(obj => obj.id === endLoc.id);
        if (!alreadyExists) {
          uniqueObjects.push(endLoc);
        }
      }
    }

    if (uniqueObjects.length < 2) {
      return Response.json({
        total_distance_km: 0,
        avg_travel_minutes: 0,
        number_of_pairs: 0,
        debug: `Only ${uniqueObjects.length} objects`
      });
    }

    const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!googleMapsApiKey) {
      return Response.json({ error: 'Google Maps API key not configured' }, { status: 500 });
    }

    // Calculate travel time for all unique pairs of objects
    let totalTravelMinutes = 0;
    let totalDistanceKm = 0;
    let pairCount = 0;

    console.error(`Starting pair calculation for ${uniqueObjects.length} objects`);
    console.error(`Objects:`, uniqueObjects.map(o => ({ id: o.id, name: o.name, lat: o.latitude, lng: o.longitude })));

    // Generate all unique pairs
    for (let i = 0; i < uniqueObjects.length; i++) {
      for (let j = i + 1; j < uniqueObjects.length; j++) {
        const obj1 = uniqueObjects[i];
        const obj2 = uniqueObjects[j];
        
        console.error(`Calculating pair ${i}-${j}: ${obj1.name} to ${obj2.name}`);
        
        // Google Maps API expects: latitude,longitude format
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${obj1.longitude},${obj1.latitude}&destination=${obj2.longitude},${obj2.latitude}&key=${googleMapsApiKey}`;
        
        console.error(`Fetching: ${url.substring(0, 100)}...`);
        
        const response = await fetch(url);
        const data = await response.json();

        console.error(`Response status: ${data.status}`);

        if (data.status === 'OK' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          let routeDuration = 0;

          (route.legs || []).forEach(leg => {
            routeDuration += leg.duration.value; // in seconds
          });

          const minutes = Math.round(routeDuration / 60);
          console.error(`Duration: ${minutes} minutes`);
          totalTravelMinutes += minutes;
          pairCount++;
        } else {
          console.error(`Failed: ${data.status}, error: ${data.error_message || 'none'}`);
        }
      }
    }

    console.error(`Final: ${pairCount} pairs calculated, total ${totalTravelMinutes} minutes`);

    // Count total stops: tasks + start location (1) + end location (1)
    const totalStops = numberOfTasks + 1 + (end_location_id ? 1 : 0);
    
    // Calculate average travel time per task (total travel time divided by total stops)
    const avgTravelMinutes = totalStops > 0 ? Math.round(totalTravelMinutes / totalStops) : 0;

    return Response.json({
      avg_travel_minutes: avgTravelMinutes,
      total_travel_minutes_all_pairs: totalTravelMinutes,
      number_of_tasks: numberOfTasks,
      total_stops: totalStops,
      number_of_unique_locations: uniqueObjects.length,
      number_of_pairs: pairCount
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});