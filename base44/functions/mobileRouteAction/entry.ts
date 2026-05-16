import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function nowIso() { return new Date().toISOString(); }
async function audit(base44, action, route, body) {
  await base44.asServiceRole.entities.MobileAuditLog.create({
    employee_id: route.employee_id || null,
    route_execution_id: route.id,
    task_execution_id: null,
    object_id: null,
    action,
    payload: body || {},
    created_at: nowIso(),
    created_offline_at: body?.offline_created_at || body?.downloaded_at || null,
    synced_at: nowIso(),
    latitude: body?.latitude ?? null,
    longitude: body?.longitude ?? null,
    device_id: body?.device_id || null,
    app_version: body?.app_version || null,
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const routeId = body.route_execution_id;
    const action = body.action;
    if (!routeId || !action) return Response.json({ error: 'route_execution_id en action zijn verplicht' }, { status: 400 });
    const routes = await base44.asServiceRole.entities.RouteExecution.filter({ id: routeId });
    const route = routes[0];
    if (!route) return Response.json({ error: 'RouteExecution niet gevonden' }, { status: 404 });

    const patch = { last_mobile_sync_at: nowIso() };
    if (action === 'downloaded') { patch.status = route.status === 'planned' ? 'downloaded' : route.status; patch.downloaded_by_employee_at = body.downloaded_at || nowIso(); }
    if (action === 'start') { patch.status = 'active'; patch.actual_started_at = body.timestamp || nowIso(); }
    if (action === 'complete') {
      const tasks = await base44.asServiceRole.entities.TaskExecution.filter({ route_execution_id: routeId });
      const openTasks = tasks.filter(task => !['completed', 'skipped'].includes(task.status));
      if (openTasks.length && !body.force_complete) return Response.json({ error: 'Er staan nog open taken in deze route', open_task_count: openTasks.length }, { status: 409 });
      patch.status = 'completed'; patch.actual_completed_at = body.timestamp || nowIso();
    }
    if (!['downloaded', 'start', 'complete', 'pause', 'cancel'].includes(action)) return Response.json({ error: 'Onbekende route-actie' }, { status: 400 });
    if (action === 'pause') patch.status = 'paused';
    if (action === 'cancel') patch.status = 'cancelled';

    const updated = await base44.asServiceRole.entities.RouteExecution.update(routeId, patch);
    await audit(base44, action === 'downloaded' ? 'route_downloaded' : `route_${action}ed`, route, body);
    return Response.json({ route_execution: updated, server_time: nowIso() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});