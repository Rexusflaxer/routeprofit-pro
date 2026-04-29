import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

    const routes = await base44.entities.Route.list();
    const route = routes.find((item) => item.id === route_id);
    const optimization = route?.cached_optimization;

    if (!optimization) {
      return Response.json({ error: 'No optimization found' }, { status: 404 });
    }

    return Response.json({
      tasks_optimized: optimization.tasks_optimized,
      tasks_skipped: optimization.tasks_skipped,
      skipped_tasks: optimization.skipped_tasks || [],
      total_travel_time: optimization.total_travel_time,
      total_service_time: optimization.total_service_time,
      total_waiting_time: optimization.total_waiting_time,
      actual_shift_minutes: optimization.actual_shift_minutes,
      total_distance_km: optimization.total_distance_km,
      order: (optimization.optimized_order || []).map((item) => ({
        name: item.name,
        arrival_time: item.arrival_time,
        actual_start_time: item.actual_start_time,
        departure_time: item.departure_time,
        time_window_start: item.time_window_start,
        time_window_end: item.time_window_end,
        duration_minutes: item.duration_minutes,
        travel_time_minutes: item.travel_time_minutes,
        is_start: item.is_start,
        is_end: item.is_end
      }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});