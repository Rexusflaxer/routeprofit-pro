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

    let numberOfTasks = 0;
    let taskObjects = [];

    // Get task objects
    if (object_ids && Array.isArray(object_ids) && object_ids.length > 0) {
      numberOfTasks = object_ids.length;
      object_ids.forEach(objId => {
        const obj = allObjects.find(o => o.id === objId);
        if (obj && obj.latitude && obj.longitude) {
          taskObjects.push(obj);
        }
      });
    } else if (route_id) {
      const route = await base44.entities.Route.get(route_id);
      if (!route) {
        return Response.json({ error: 'Route not found' }, { status: 404 });
      }
      const allTasks = await base44.entities.Task.list();
      const assignedTaskIds = (route.assigned_tasks || []).map(at => at.task_id);
      const routeTasks = allTasks.filter(t => assignedTaskIds.includes(t.id));
      
      numberOfTasks = routeTasks.length;
      
      routeTasks.forEach(task => {
        const obj = allObjects.find(o => o.id === task.object_id);
        if (obj && obj.latitude && obj.longitude) {
          taskObjects.push(obj);
        }
      });
    } else {
      return Response.json({ error: 'route_id or object_ids is required' }, { status: 400 });
    }

    // Build array of ALL conceptual stops (start, end, and all task objects)
    const allConceptualStops = [];
    
    // Add start location
    if (start_location_id) {
      console.error(`Looking for start location: ${start_location_id}`);
      const startLoc = allLocations.find(loc => loc.id === start_location_id);
      console.error(`Start location found:`, startLoc ? { id: startLoc.id, name: startLoc.name, lat: startLoc.latitude, lng: startLoc.longitude } : 'NOT FOUND');
      if (startLoc && startLoc.latitude && startLoc.longitude) {
        allConceptualStops.push({ ...startLoc, _conceptual_id: 'start', _label: 'Startlocatie' });
        console.error(`Added start location to array`);
      } else {
        console.error(`Start location NOT added - missing coordinates`);
      }
    }
    
    // Add end location (even if same as start)
    if (end_location_id) {
      console.error(`Looking for end location: ${end_location_id}`);
      const endLoc = allLocations.find(loc => loc.id === end_location_id);
      console.error(`End location found:`, endLoc ? { id: endLoc.id, name: endLoc.name, lat: endLoc.latitude, lng: endLoc.longitude } : 'NOT FOUND');
      if (endLoc && endLoc.latitude && endLoc.longitude) {
        allConceptualStops.push({ ...endLoc, _conceptual_id: 'end', _label: 'Eindlocatie' });
        console.error(`Added end location to array`);
      } else {
        console.error(`End location NOT added - missing coordinates`);
      }
    }
    
    // Add all task objects
    allConceptualStops.push(...taskObjects);
    console.error(`Total conceptual stops in array: ${allConceptualStops.length}`);

    if (allConceptualStops.length < 2) {
      return Response.json({
        total_distance_km: 0,
        avg_travel_minutes: 0,
        number_of_pairs: 0,
        debug: `Only ${allConceptualStops.length} stops`
      });
    }

    const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!googleMapsApiKey) {
      return Response.json({ error: 'Google Maps API key not configured' }, { status: 500 });
    }

    // Calculate travel time for ALL pairs between ALL conceptual stops
    let totalTravelMinutes = 0;
    let totalDistanceKm = 0;
    let pairCount = 0;

    console.error(`Starting pair calculation for ${allConceptualStops.length} conceptual stops (${numberOfTasks} tasks + ${start_location_id ? 1 : 0} start + ${end_location_id ? 1 : 0} end)`);
    console.error(`All stops:`, allConceptualStops.map(o => ({ 
      id: o.id, 
      name: o.name || o._label, 
      lat: o.latitude, 
      lng: o.longitude, 
      conceptual_id: o._conceptual_id 
    })));

    // Calculate ALL unique pairs
    for (let i = 0; i < allConceptualStops.length; i++) {
      for (let j = i + 1; j < allConceptualStops.length; j++) {
        const obj1 = allConceptualStops[i];
        const obj2 = allConceptualStops[j];
        
        const name1 = obj1.name || obj1._label || 'Unknown';
        const name2 = obj2.name || obj2._label || 'Unknown';
        console.error(`Calculating pair ${i}-${j}: ${name1} to ${name2}`);

        // Check if coordinates are identical
        if (obj1.latitude === obj2.latitude && obj1.longitude === obj2.longitude) {
          console.error(`Same coordinates - 0 minutes travel time`);
          totalTravelMinutes += 0;
          pairCount++;
          continue;
        }

        // Database stores lat/lng swapped - swap them for Google Maps API
        const origin = `${obj1.longitude},${obj1.latitude}`;
        const destination = `${obj2.longitude},${obj2.latitude}`;
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&key=${googleMapsApiKey}`;
        
        console.error(`Fetching: ${url.substring(0, 100)}...`);
        
        const response = await fetch(url);
        const data = await response.json();

        console.error(`Response status: ${data.status}`);

        if (data.status === 'OK' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          let routeDuration = 0;

          (route.legs || []).forEach(leg => {
            routeDuration += leg.duration.value;
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

    // Average per conceptual stop: total / number of conceptual stops
    const numberOfConceptualStops = numberOfTasks + (start_location_id ? 1 : 0) + (end_location_id ? 1 : 0);
    const avgTravelMinutes = numberOfConceptualStops > 0 ? Math.round(totalTravelMinutes / numberOfConceptualStops) : 0;

    return Response.json({
      avg_travel_minutes: avgTravelMinutes,
      total_travel_minutes_all_pairs: totalTravelMinutes,
      number_of_tasks: numberOfTasks,
      number_of_conceptual_stops: numberOfConceptualStops,
      number_of_pairs: pairCount
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});