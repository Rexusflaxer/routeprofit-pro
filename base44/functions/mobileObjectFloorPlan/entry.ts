import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function nowIso() { return new Date().toISOString(); }

async function uploadBase64Asset(base44, asset) {
  if (!asset?.base64_data) return null;
  try {
    const binaryStr = atob(asset.base64_data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const blob = new Blob([bytes], { type: asset.mime_type || 'application/octet-stream' });
    const result = await base44.asServiceRole.integrations.Core.UploadFile({ file: blob });
    return result?.file_url || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, object_id } = body;

    if (!object_id) return Response.json({ error: 'object_id is verplicht' }, { status: 400 });

    // GET: return current floorplan
    if (action === 'get') {
      const records = await base44.asServiceRole.entities.ObjectFloorPlan.filter({ object_id, is_current: true });
      const current = records.find(r => r.is_current && r.status === 'published') || null;
      return Response.json({ floor_plan: current });
    }

    // PUBLISH
    if (action === 'publish') {
      const upload = body.upload || {};

      // Upload assets in parallel
      const [usdzUrl, rawUrl, preview2dUrl, metadataUrl] = await Promise.all([
        uploadBase64Asset(base44, upload.usdz_asset),
        uploadBase64Asset(base44, upload.raw_roomplan_asset),
        uploadBase64Asset(base44, upload.preview_2d_asset),
        uploadBase64Asset(base44, upload.metadata_asset),
      ]);

      // Determine new revision
      const existing = await base44.asServiceRole.entities.ObjectFloorPlan.filter({ object_id });
      const maxRevision = existing.reduce((max, r) => Math.max(max, r.revision || 0), 0);
      const newRevision = maxRevision + 1;

      // Mark old current records as not current
      const currentRecords = existing.filter(r => r.is_current);
      await Promise.all(currentRecords.map(r =>
        base44.asServiceRole.entities.ObjectFloorPlan.update(r.id, { is_current: false })
      ));

      // Create new floorplan record
      const newRecord = await base44.asServiceRole.entities.ObjectFloorPlan.create({
        object_id,
        status: 'published',
        revision: newRevision,
        is_current: true,
        title: upload.title || null,
        source: upload.source || 'ios_roomplan',
        captured_by: user.full_name || user.email || null,
        captured_at: upload.captured_at || null,
        published_at: upload.published_at || nowIso(),
        usdz_file_url: usdzUrl,
        raw_roomplan_file_url: rawUrl,
        preview_2d_file_url: preview2dUrl,
        fallback_pdf_file_url: null,
        floorplan_2d_json: upload.floorplan_2d_json || null,
        annotations_json: upload.annotations_json || null,
        sensor_catalog_version: upload.sensor_catalog_version || null,
        metadata: upload.metadata || (metadataUrl ? { metadata_url: metadataUrl } : null),
      });

      // Audit log
      await base44.asServiceRole.entities.MobileAuditLog.create({
        employee_id: user.id || null,
        object_id,
        action: 'object_floorplan_published',
        payload: {
          floor_plan_id: newRecord.id,
          revision: newRevision,
          source: upload.source || 'ios_roomplan',
          has_usdz: !!usdzUrl,
          has_preview_2d: !!preview2dUrl,
        },
        created_at: nowIso(),
      });

      return Response.json({ floor_plan: newRecord });
    }

    return Response.json({ error: 'Onbekende action. Gebruik "get" of "publish".' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});