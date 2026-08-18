import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

function text(value) {
  return String(value || '').trim();
}

function addDays(value, days) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

async function sha256(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function absoluteMinute(date, time) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000) * 1440 + hour * 60 + minute;
}

function interval(date, startTime, endTime, explicitEndDate = null) {
  const endDate = explicitEndDate || (endTime === '24:00' || endTime <= startTime ? addDays(date, 1) : date);
  return { start: absoluteMinute(date, startTime), end: absoluteMinute(endDate, endTime === '24:00' ? '00:00' : endTime) };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Niet ingelogd' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Alleen backofficebeheerders hebben toegang' }, { status: 403 });

    const body = await req.json();
    const required = ['occurrence_id', 'object_id', 'customer_id', 'task_definition_id', 'series_id', 'source_revision_id', 'service_date', 'start_time', 'end_time', 'idempotency_key'];
    if (required.some(field => !text(body[field]))) return Response.json({ error: 'De geselecteerde taak mist verplichte wijzigingsgegevens.' }, { status: 400 });

    const serviceDate = text(body.service_date);
    const startTime = text(body.start_time);
    const endTime = text(body.end_time);
    const series = await base44.asServiceRole.entities.ObjectTaskScheduleSeries.get(text(body.series_id));
    const occurrence = await base44.asServiceRole.entities.PlanningTaskOccurrence.get(text(body.occurrence_id));
    if (String(series.object_task_definition_id) !== text(body.task_definition_id) || String(occurrence.object_task_schedule_series_id) !== String(series.id)) {
      return Response.json({ error: 'De taak hoort niet bij de geselecteerde taakreeks.' }, { status: 409 });
    }

    const revisions = await base44.asServiceRole.entities.ObjectTaskScheduleRevision.filter({ series_id: series.id }, 'revision_number', 500);
    const sourceRevision = revisions.find(item => String(item.id) === text(body.source_revision_id));
    const currentRevision = revisions.find(item => String(item.id) === String(series.current_revision_id));
    if (!sourceRevision || !currentRevision) return Response.json({ error: 'De taakrevisie kon niet veilig worden vastgesteld.' }, { status: 409 });

    const desired = interval(serviceDate, startTime, endTime);
    const segments = (await base44.asServiceRole.entities.PlanningShiftTaskSegment.filter({ task_occurrence_id: occurrence.id }, '-start_date', 500)).filter(item => item.status !== 'removed');
    const outsideSegments = segments.filter(segment => {
      const planned = interval(segment.start_date, segment.start_time, segment.end_time, segment.end_date);
      return planned.end <= desired.start || planned.start >= desired.end;
    });
    if (outsideSegments.length && body.confirm_remove_outside_shifts !== true) {
      const shiftIds = [...new Set(outsideSegments.map(item => String(item.shift_id)))];
      const shifts = await Promise.all(shiftIds.map(id => base44.asServiceRole.entities.PlanningShift.get(id)));
      return Response.json({
        error: 'Bevestig dat volledig buitenvallende diensten mogen worden verwijderd',
        details: {
          code: 'TASK_SHIFT_REMOVAL_CONFIRMATION_REQUIRED',
          shifts: shifts.map(item => ({ id: item.id, name: item.service_name_snapshot || 'Dienst', service_date: item.service_date, start_time: item.start_time, end_time: item.end_time })),
        },
      }, { status: 409 });
    }

    const idempotencyKey = text(body.idempotency_key);
    const requestFingerprint = await sha256(stableStringify({ occurrence_id: occurrence.id, source_revision_id: sourceRevision.id, service_date: serviceDate, start_time: startTime, end_time: endTime }));
    const singleKey = `${idempotencyKey}:single`;
    const resumeKey = `${idempotencyKey}:resume`;
    let singleRevision = (await base44.asServiceRole.entities.ObjectTaskScheduleRevision.filter({ creation_idempotency_key: singleKey }, 'created_date', 10))[0] || null;
    let resumeRevision = (await base44.asServiceRole.entities.ObjectTaskScheduleRevision.filter({ creation_idempotency_key: resumeKey }, 'created_date', 10))[0] || null;
    const repeatingRevision = sourceRevision.recurrence_type === 'weekly' ? sourceRevision : currentRevision.recurrence_type === 'weekly' ? currentRevision : null;
    const firstRevisionNumber = Number(currentRevision.revision_number || 0) + 1;
    const createdAt = new Date().toISOString();
    const taskSnapshot = sourceRevision.task_snapshot || repeatingRevision?.task_snapshot || null;

    if (!singleRevision) {
      const content = {
        customer_id: series.customer_id, object_id: series.object_id, object_task_definition_id: series.object_task_definition_id,
        series_id: series.id, series_key: series.series_key, revision_number: firstRevisionNumber,
        previous_revision_id: currentRevision.id, operation: 'schedule', effective_from: serviceDate,
        recurrence_type: 'one_time', weekday: sourceRevision.weekday, start_time: startTime, end_time: endTime,
        recurrence_end_date: serviceDate, timezone: 'Europe/Amsterdam', security_plan_id: sourceRevision.security_plan_id || null,
        security_plan_revision_id: sourceRevision.security_plan_revision_id || null, task_snapshot: taskSnapshot,
      };
      singleRevision = await base44.asServiceRole.entities.ObjectTaskScheduleRevision.create({
        ...content, content_checksum: await sha256(stableStringify(content)), creation_idempotency_key: singleKey,
        creation_request_fingerprint: requestFingerprint, created_by_user_id: user.id || null, created_at: createdAt,
        metadata: { planning_only_single_occurrence: true, occurrence_id: occurrence.id },
      });
    }

    const resumeDate = addDays(serviceDate, 7);
    const shouldResume = repeatingRevision && (!repeatingRevision.recurrence_end_date || resumeDate <= repeatingRevision.recurrence_end_date);
    if (shouldResume && !resumeRevision) {
      const content = {
        customer_id: series.customer_id, object_id: series.object_id, object_task_definition_id: series.object_task_definition_id,
        series_id: series.id, series_key: series.series_key, revision_number: Number(singleRevision.revision_number) + 1,
        previous_revision_id: singleRevision.id, operation: 'schedule', effective_from: resumeDate,
        recurrence_type: 'weekly', weekday: repeatingRevision.weekday, start_time: repeatingRevision.start_time,
        end_time: repeatingRevision.end_time, recurrence_end_date: repeatingRevision.recurrence_end_date || null,
        timezone: 'Europe/Amsterdam', security_plan_id: repeatingRevision.security_plan_id || null,
        security_plan_revision_id: repeatingRevision.security_plan_revision_id || null,
        task_snapshot: repeatingRevision.task_snapshot || taskSnapshot,
      };
      resumeRevision = await base44.asServiceRole.entities.ObjectTaskScheduleRevision.create({
        ...content, content_checksum: await sha256(stableStringify(content)), creation_idempotency_key: resumeKey,
        creation_request_fingerprint: requestFingerprint, created_by_user_id: user.id || null, created_at: createdAt,
        metadata: { planning_only_resume: true, occurrence_id: occurrence.id },
      });
    }

    const targetRevision = resumeRevision || singleRevision;
    if (String(series.current_revision_id) !== String(targetRevision.id)) {
      const updated = await base44.asServiceRole.entities.ObjectTaskScheduleSeries.updateMany(
        { id: series.id, version: Number(series.version || 1) },
        { $set: { current_revision_id: targetRevision.id, current_revision_number: Number(targetRevision.revision_number), status: 'active', last_modified_by_user_id: user.id || null, last_modified_at: createdAt }, $inc: { version: 1 } },
      );
      if (!updated?.success || updated.updated !== 1) return Response.json({ error: 'De taakreeks is intussen gewijzigd.' }, { status: 409 });
    }

    const existingAudit = (await base44.asServiceRole.entities.PlanningAuditEvent.filter({ idempotency_key: idempotencyKey }, '-occurred_at', 10)).find(item => item.action === 'change_object_task_series');
    if (!existingAudit) await base44.asServiceRole.entities.PlanningAuditEvent.create({
      action: 'change_object_task_series', resource_type: 'ObjectTaskScheduleRevision', resource_id: singleRevision.id,
      before_state: { occurrence, source_revision: sourceRevision }, after_state: { single_revision: singleRevision, resume_revision: resumeRevision },
      actor_user_id: user.id || null, actor_name: user.full_name || null, actor_email: user.email || null,
      occurred_at: createdAt, correlation_id: idempotencyKey, idempotency_key: idempotencyKey, undoable: false,
      metadata: { request_hash: requestFingerprint, planning_only_single_occurrence: true },
    });

    return Response.json({ ok: true, single_revision: singleRevision, resume_revision: resumeRevision });
  } catch (error) {
    const status = Number(error?.status || 500);
    return Response.json({ error: error?.message || 'Taakwijziging mislukt', details: error?.details || null }, { status });
  }
}