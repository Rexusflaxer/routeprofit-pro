import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function nowIso() { return new Date().toISOString(); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const accepted = [];
    const failed = [];
    for (const event of body.events || []) {
      try {
        await base44.asServiceRole.entities.MobileAuditLog.create({
          employee_id: event.payload?.employee_id || null,
          route_execution_id: event.payload?.route_execution_id || null,
          task_execution_id: event.payload?.task_execution_id || null,
          object_id: event.payload?.object_id || null,
          action: event.type,
          payload: event.payload || {},
          created_at: event.timestamp || nowIso(),
          created_offline_at: event.offline_created_at || null,
          synced_at: nowIso(),
          latitude: event.payload?.latitude ?? null,
          longitude: event.payload?.longitude ?? null,
          device_id: body.device_id || null,
          app_version: body.app_version || null,
        });
        accepted.push(event.local_event_id || event.type);
      } catch (error) {
        failed.push({ local_event_id: event.local_event_id, error: error.message });
      }
    }
    return Response.json({ accepted, failed, server_time: nowIso(), new_sync_token: `${nowIso()}:${accepted.length}` });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});