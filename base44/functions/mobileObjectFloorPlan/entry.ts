import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function nowIso() { return new Date().toISOString(); }

const MIME_EXTENSION = {
  'application/json': 'json',
  'application/octet-stream': 'bin',
  'model/vnd.usdz+zip': 'usdz',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function compact(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function ascii(value) {
  return compact(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '');
}

function safeFilenamePart(value, fallback = 'Bestand') {
  const clean = ascii(value)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+-\s+/g, ' - ')
    .replace(/-+/g, '-')
    .trim();
  return clean || fallback;
}

function slug(value, fallback = 'unknown') {
  const clean = ascii(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || fallback;
}

function extensionForAsset(asset, fallback = 'bin') {
  const original = asset?.filename || asset?.name || '';
  const fromName = original.includes('.') ? original.split('.').pop() : '';
  const clean = String(fromName || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
  return clean || MIME_EXTENSION[asset?.mime_type] || fallback;
}

function buildFloorPlanFileContext({ object, objectId, companyId, revision, label, category, sourceField, asset }) {
  const extension = extensionForAsset(asset);
  const ownerLabel = object?.name || object?.object_code || 'Object';
  const filename = `${safeFilenamePart(ownerLabel)} - ${safeFilenamePart(label)} - rev-${revision}.${extension}`;
  const objectFolder = companyId
    ? `companies/company-${companyId}/objects/${slug(ownerLabel)}_${objectId}`
    : `objects/${slug(ownerLabel)}_${objectId}`;
  const folderPath = `${objectFolder}/floorplans/revision-${revision}`;

  return {
    extension,
    filename,
    folderPath,
    logicalPath: `${folderPath}/${filename}`,
    ownerLabel,
    category,
    sourceField
  };
}

async function uploadBase64Asset(base44, asset, context) {
  if (!asset?.base64_data) return null;
  try {
    const fileContext = buildFloorPlanFileContext({ ...context, asset });
    const binaryStr = atob(asset.base64_data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const blob = new Blob([bytes], { type: asset.mime_type || 'application/octet-stream' });
    const file = typeof File === 'undefined'
      ? blob
      : new File([blob], fileContext.filename, { type: blob.type });
    const result = await base44.asServiceRole.integrations.Core.UploadFile({ file });
    const fileUrl = result?.file_url || null;
    if (!fileUrl) return null;

    const managed = await base44.asServiceRole.entities.ManagedFile.create({
      owner_type: 'object',
      owner_id: context.objectId,
      company_id: context.companyId || null,
      upload_session_id: null,
      tenant_container_key: context.companyId ? `company:${context.companyId}` : `object:${context.objectId}`,
      owner_container_key: `object:${context.objectId}`,
      access_scope: 'company',
      domain: 'operations',
      category: fileContext.category,
      source_entity: 'ObjectFloorPlan',
      source_entity_id: null,
      source_field: fileContext.sourceField,
      file_url: fileUrl,
      original_filename: asset.filename || asset.name || null,
      display_filename: fileContext.filename,
      download_filename: fileContext.filename,
      logical_path: fileContext.logicalPath,
      folder_path: fileContext.folderPath,
      extension: fileContext.extension,
      mime_type: asset.mime_type || blob.type || null,
      size_bytes: bytes.length,
      document_label: context.label || null,
      document_number: `rev-${context.revision}`,
      valid_from: null,
      valid_until: null,
      status: 'active',
      version: context.revision,
      is_sensitive: true,
      security_classification: 'strictly_confidential',
      retention_until: null,
      uploaded_at: nowIso(),
      uploaded_by: context.uploadedBy || null,
      metadata: {
        owner_label: fileContext.ownerLabel,
        commercial_container_policy: 'company-scoped-managed-files-v1',
        object_id: context.objectId,
        floor_plan_revision: context.revision
      }
    });

    return {
      file_url: fileUrl,
      file_id: managed.id,
      download_filename: managed.download_filename,
      logical_path: managed.logical_path
    };
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

      // Determine new revision
      const [existing, object] = await Promise.all([
        base44.asServiceRole.entities.ObjectFloorPlan.filter({ object_id }),
        base44.asServiceRole.entities.SurveillanceObject.get(object_id).catch(() => null)
      ]);
      const maxRevision = existing.reduce((max, r) => Math.max(max, r.revision || 0), 0);
      const newRevision = maxRevision + 1;
      const assetContext = {
        object,
        objectId: object_id,
        companyId: object?.default_operating_company_id || null,
        revision: newRevision,
        uploadedBy: user.full_name || user.email || null
      };

      // Upload assets in parallel
      const [usdzAsset, rawAsset, preview2dAsset, metadataAsset] = await Promise.all([
        uploadBase64Asset(base44, upload.usdz_asset, { ...assetContext, label: 'RoomPlan USDZ', category: 'object_floorplan_usdz', sourceField: 'usdz_file_url' }),
        uploadBase64Asset(base44, upload.raw_roomplan_asset, { ...assetContext, label: 'RoomPlan raw data', category: 'object_floorplan_raw_roomplan', sourceField: 'raw_roomplan_file_url' }),
        uploadBase64Asset(base44, upload.preview_2d_asset, { ...assetContext, label: 'RoomPlan 2D preview', category: 'object_floorplan_preview_2d', sourceField: 'preview_2d_file_url' }),
        uploadBase64Asset(base44, upload.metadata_asset, { ...assetContext, label: 'RoomPlan metadata', category: 'object_floorplan_metadata', sourceField: 'metadata.metadata_url' }),
      ]);

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
        usdz_file_url: usdzAsset?.file_url || null,
        usdz_file_id: usdzAsset?.file_id || null,
        usdz_download_filename: usdzAsset?.download_filename || null,
        usdz_logical_path: usdzAsset?.logical_path || null,
        raw_roomplan_file_url: rawAsset?.file_url || null,
        raw_roomplan_file_id: rawAsset?.file_id || null,
        raw_roomplan_download_filename: rawAsset?.download_filename || null,
        raw_roomplan_logical_path: rawAsset?.logical_path || null,
        preview_2d_file_url: preview2dAsset?.file_url || null,
        preview_2d_file_id: preview2dAsset?.file_id || null,
        preview_2d_download_filename: preview2dAsset?.download_filename || null,
        preview_2d_logical_path: preview2dAsset?.logical_path || null,
        fallback_pdf_file_url: null,
        floorplan_2d_json: upload.floorplan_2d_json || null,
        annotations_json: upload.annotations_json || null,
        sensor_catalog_version: upload.sensor_catalog_version || null,
        metadata: upload.metadata || (metadataAsset?.file_url ? { metadata_url: metadataAsset.file_url } : null),
      });

      await Promise.all([usdzAsset, rawAsset, preview2dAsset, metadataAsset]
        .filter(asset => asset?.file_id)
        .map(asset => base44.asServiceRole.entities.ManagedFile.update(asset.file_id, { source_entity_id: newRecord.id })));

      // Audit log
      await base44.asServiceRole.entities.MobileAuditLog.create({
        employee_id: user.id || null,
        object_id,
        action: 'object_floorplan_published',
        payload: {
          floor_plan_id: newRecord.id,
          revision: newRevision,
          source: upload.source || 'ios_roomplan',
          has_usdz: !!usdzAsset?.file_url,
          has_preview_2d: !!preview2dAsset?.file_url,
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
