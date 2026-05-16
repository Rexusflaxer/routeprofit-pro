import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function nowIso() { return new Date().toISOString(); }
async function audit(base44, action, task, body) {
  await base44.asServiceRole.entities.MobileAuditLog.create({
    employee_id: body.employee_id || null,
    route_execution_id: task.route_execution_id,
    task_execution_id: task.id,
    object_id: task.object_id,
    action,
    payload: body || {},
    created_at: nowIso(),
    created_offline_at: body?.offline_created_at || null,
    synced_at: nowIso(),
    latitude: body?.latitude ?? null,
    longitude: body?.longitude ?? null,
    device_id: body?.device_id || null,
    app_version: body?.app_version || null,
  });
}
async function createReport(base44, task, body) {
  if (!body.report) return null;
  const report = await base44.asServiceRole.entities.MobileReport.create({
    task_execution_id: task.id,
    route_execution_id: task.route_execution_id,
    object_id: task.object_id,
    employee_id: body.employee_id || null,
    status: 'submitted',
    report_type: body.report.report_type || task.task_type,
    report_text: body.report.report_text || null,
    checklist_answers: body.report.checklist_answers || {},
    extra_fields: body.report.extra_fields || null,
    created_offline_at: body.offline_created_at || null,
    created_at: nowIso(),
    submitted_at: body.timestamp || nowIso(),
    synced_at: nowIso(),
    gps_latitude: body.latitude ?? null,
    gps_longitude: body.longitude ?? null,
    photo_count: 0,
    photos: null,
    metadata: body.report.metadata || null,
  });
  return report;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const taskId = body.task_execution_id;
    const action = body.action;
    if (!taskId || !action) return Response.json({ error: 'task_execution_id en action zijn verplicht' }, { status: 400 });
    const tasks = await base44.asServiceRole.entities.TaskExecution.filter({ id: taskId });
    const task = tasks[0];
    if (!task) return Response.json({ error: 'TaskExecution niet gevonden' }, { status: 404 });

    const timestamp = body.timestamp || nowIso();
    const patch = {};
    if (action === 'arrived') Object.assign(patch, { status: 'arrived', actual_arrival_at: timestamp, gps_arrival_latitude: body.latitude ?? null, gps_arrival_longitude: body.longitude ?? null });
    if (action === 'start') Object.assign(patch, { status: 'started', actual_started_at: timestamp, gps_started_latitude: body.latitude ?? null, gps_started_longitude: body.longitude ?? null });
    if (action === 'postpone') {
      if (!body.reason) return Response.json({ error: 'Reden is verplicht' }, { status: 400 });
      Object.assign(patch, { status: 'postponed', actual_postponed_at: timestamp, postpone_reason: body.reason });
    }
    if (action === 'skip') {
      if (!body.reason) return Response.json({ error: 'Reden is verplicht' }, { status: 400 });
      Object.assign(patch, { status: 'skipped', actual_skipped_at: timestamp, skip_reason: body.reason });
    }
    let report = null;
    if (action === 'complete') {
      report = await createReport(base44, task, body);
      Object.assign(patch, { status: 'completed', actual_completed_at: timestamp, gps_completed_latitude: body.latitude ?? null, gps_completed_longitude: body.longitude ?? null, report_id: report?.id || body.report_id || null });
    }
    if (!Object.keys(patch).length) return Response.json({ error: 'Onbekende taakactie' }, { status: 400 });

    const updated = await base44.asServiceRole.entities.TaskExecution.update(taskId, patch);
    await base44.asServiceRole.entities.RouteExecution.update(task.route_execution_id, { last_mobile_sync_at: nowIso() });
    await audit(base44, `task_${action === 'start' ? 'started' : action}`, task, body);
    return Response.json({ task_execution: updated, report, server_time: nowIso() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});