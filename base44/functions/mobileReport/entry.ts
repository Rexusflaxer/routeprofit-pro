import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function nowIso() { return new Date().toISOString(); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    if (body.action === 'photo') {
      const photo = await base44.asServiceRole.entities.MobilePhoto.create({
        report_id: body.report_id,
        task_execution_id: body.task_execution_id,
        route_execution_id: body.route_execution_id,
        object_id: body.object_id,
        file_url: body.file_url,
        thumbnail_url: body.thumbnail_url || null,
        caption: body.caption || null,
        taken_at: body.taken_at || null,
        uploaded_at: nowIso(),
        created_offline_at: body.created_offline_at || null,
        gps_latitude: body.latitude ?? null,
        gps_longitude: body.longitude ?? null,
        metadata: body.metadata || null,
      });
      if (body.report_id) {
        const reports = await base44.asServiceRole.entities.MobileReport.filter({ id: body.report_id });
        if (reports[0]) await base44.asServiceRole.entities.MobileReport.update(body.report_id, { photo_count: Number(reports[0].photo_count || 0) + 1 });
      }
      return Response.json({ photo, server_time: nowIso() });
    }
    const report = await base44.asServiceRole.entities.MobileReport.create({
      task_execution_id: body.task_execution_id,
      route_execution_id: body.route_execution_id,
      object_id: body.object_id,
      employee_id: body.employee_id || null,
      status: body.status || 'submitted',
      report_type: body.report_type,
      report_text: body.report_text || null,
      checklist_answers: body.checklist_answers || {},
      extra_fields: body.extra_fields || null,
      created_offline_at: body.created_offline_at || null,
      created_at: nowIso(),
      submitted_at: body.submitted_at || nowIso(),
      synced_at: nowIso(),
      gps_latitude: body.latitude ?? null,
      gps_longitude: body.longitude ?? null,
      photo_count: Number(body.photo_count || 0),
      photos: body.photos || null,
      metadata: body.metadata || null,
    });
    return Response.json({ report, server_time: nowIso() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});