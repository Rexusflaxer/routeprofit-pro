// base44/functions/_shared/mobile/createMobileRouteExecution.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function secondsFromTime(time) {
  if (!time) return null;
  const [h, m = 0] = String(time).split(":").map(Number);
  return Number.isFinite(h) ? h * 3600 + (Number.isFinite(m) ? m * 60 : 0) : null;
}
function getWeekday(serviceDate) {
  const date = /* @__PURE__ */ new Date(`${serviceDate}T12:00:00`);
  const day = date.getDay();
  return day === 0 ? 7 : day;
}
function isTaskForDay(task, weekday) {
  return (task.weekdays || []).map(Number).includes(Number(weekday));
}
function isAssignmentForDay(assignment, weekday) {
  return (assignment.days || []).map(Number).includes(Number(weekday));
}
function makeTaskName(task, object, repeatIndex, repeatCount) {
  const base = object?.name || task.task_type || "Taak";
  return repeatCount > 1 && repeatIndex ? `${base} (${repeatIndex}/${repeatCount})` : base;
}
function unique(values) {
  return [...new Set((values || []).filter(Boolean).map(String))];
}
function buildTaskContext(task, object, route, serviceDate) {
  const operatingCompanyId = task.operating_company_id || object.default_operating_company_id || object.operating_company_id || route.operating_company_id || null;
  return {
    service_date: serviceDate,
    operating_company_id: operatingCompanyId,
    company_id: operatingCompanyId,
    cao_key: task.cao_key || object.cao_key || route.cao_key || null,
    function_type: task.service_function_type || object.default_service_function_type || null,
    task_type: task.task_type || null,
    cao_function_group: task.required_cao_function_group || object.default_cao_function_group || null,
    cao_function_level: task.required_cao_function_level || object.default_cao_function_level || null,
    security_role_status: task.required_security_role_status || object.default_security_role_status || null,
    performs_security_work: task.performs_security_work ?? object.default_performs_security_work ?? object.performs_security_work ?? null,
    security_work_percentage: task.security_work_percentage ?? object.default_security_work_percentage ?? object.security_work_percentage ?? null,
    works_event_or_hospitality_security: task.works_event_or_hospitality_security ?? object.default_works_event_or_hospitality_security ?? object.works_event_or_hospitality_security ?? null,
    event_hospitality_cao_applies: task.event_hospitality_cao_applies ?? object.default_event_hospitality_cao_applies ?? object.event_hospitality_cao_applies ?? null,
    works_cash_value_logistics: task.works_cash_value_logistics ?? object.default_works_cash_value_logistics ?? object.works_cash_value_logistics ?? null,
    route_id: route.id || null,
    task_id: task.id || null,
    object_id: object.id || task.object_id || null,
    contract_assignment_policy: "strict_contract_match"
  };
}
async function handleCreateMobileRouteExecution(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== "admin") return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    const body = await req.json();
    const routeId = body.route_id;
    const serviceDate = body.service_date;
    if (!routeId || !serviceDate) return Response.json({ error: "route_id en service_date zijn verplicht" }, { status: 400 });
    const weekday = getWeekday(serviceDate);
    const [routes, existingExecutions, tasks, objects, vehicles, offices] = await Promise.all([
      base44.asServiceRole.entities.Route.filter({ id: routeId }),
      base44.asServiceRole.entities.RouteExecution.filter({ service_date: serviceDate }),
      base44.asServiceRole.entities.Task.list(),
      base44.asServiceRole.entities.SurveillanceObject.list(),
      base44.asServiceRole.entities.Vehicle.list(),
      base44.asServiceRole.entities.Office.list()
    ]);
    const route = routes[0];
    if (!route) return Response.json({ error: "Route niet gevonden" }, { status: 404 });
    if (!(route.weekdays || []).map(Number).includes(Number(weekday))) {
      return Response.json({ error: "Deze route is niet gepland op deze datum" }, { status: 400 });
    }
    const existing = existingExecutions.find((item) => String(item.source_route_id || item.route_id || "") === String(route.id));
    if (existing) return Response.json({ route_execution_id: existing.id, already_exists: true });
    const vehicle = vehicles.find((v) => String(v.id) === String(route.vehicle_id || "")) || null;
    const startOffice = offices.find((o) => String(o.id) === String(route.start_location_id || "")) || null;
    const endOffice = offices.find((o) => String(o.id) === String(route.end_location_id || "")) || startOffice || null;
    const taskById = new Map(tasks.map((task) => [String(task.id), task]));
    const objectById = new Map(objects.map((object) => [String(object.id), object]));
    const assignments = (route.assigned_tasks || []).filter((item) => isAssignmentForDay(item, weekday));
    const assignedTaskContexts = assignments.map((assignment) => {
      const task = taskById.get(String(assignment.task_id));
      if (!task || !isTaskForDay(task, weekday)) return null;
      const object = objectById.get(String(task.object_id || "")) || {};
      return buildTaskContext(task, object, route, serviceDate);
    }).filter(Boolean);
    const operatingCompanyIds = unique(assignedTaskContexts.map((context) => context.operating_company_id));
    if (operatingCompanyIds.length > 1) {
      return Response.json({
        error: "Een route kan niet over meerdere juridische werkgevers worden verdeeld. Splits de route per bedrijf.",
        operating_company_ids: operatingCompanyIds
      }, { status: 409 });
    }
    const operatingCompanyId = operatingCompanyIds[0] || route.operating_company_id || null;
    const routeRoutingSnapshot = {
      status: "not_applicable",
      source: "manual_route_without_employee",
      resolved_at: nowIso(),
      company_id: operatingCompanyId,
      service_contexts: assignedTaskContexts
    };
    const routeExecution = await base44.asServiceRole.entities.RouteExecution.create({
      route_id: route.id,
      source_route_id: route.id,
      route_name: route.name || "Route",
      weekday,
      service_date: serviceDate,
      employee_id: null,
      employee_name: null,
      operating_company_id: operatingCompanyId,
      personnel_contract_id: null,
      contract_function_key: null,
      contract_cao_key: null,
      contract_routing_status: "not_applicable",
      contract_routing_snapshot: routeRoutingSnapshot,
      vehicle_id: route.vehicle_id || null,
      vehicle_license_plate: vehicle?.license_plate || null,
      status: "planned",
      shift_start_time: route.time_window_start || "00:00",
      shift_end_time: route.time_window_end || "00:00",
      start_location_name: startOffice?.name || null,
      start_latitude: safeNumber(startOffice?.latitude),
      start_longitude: safeNumber(startOffice?.longitude),
      end_location_name: endOffice?.name || null,
      end_latitude: safeNumber(endOffice?.latitude),
      end_longitude: safeNumber(endOffice?.longitude),
      total_planned_distance_km: route.total_distance_km ?? null,
      total_planned_travel_minutes: route.avg_travel_minutes ?? null,
      total_planned_service_minutes: route.total_service_minutes ?? null,
      total_planned_route_minutes: route.total_route_minutes ?? null,
      generated_at: nowIso(),
      metadata: { source: "uitvoering", copied_to_mobile: true }
    });
    const taskPayloads = [];
    assignments.forEach((assignment) => {
      const task = taskById.get(String(assignment.task_id));
      if (!task || !isTaskForDay(task, weekday)) return;
      const object = objectById.get(String(task.object_id || "")) || {};
      const serviceContext = buildTaskContext(task, object, route, serviceDate);
      const repeatCount = Number(task.repeat_count || 1);
      const occurrenceCount = assignment.lock_all_occurrences ? repeatCount : Number(assignment.locked_occurrence_count || 1);
      const repeatIndexes = assignment.repeat_index ? [Number(assignment.repeat_index)] : Array.from({ length: Math.max(1, occurrenceCount) }, (_, index) => index + 1);
      repeatIndexes.forEach((repeatIndex) => {
        const latitude = safeNumber(object.latitude);
        const longitude = safeNumber(object.longitude);
        if (latitude === null || longitude === null) return;
        taskPayloads.push({
          route_execution_id: routeExecution.id,
          source_route_id: route.id,
          original_task_id: String(task.id),
          object_id: String(task.object_id),
          sequence_index: taskPayloads.length + 1,
          task_name: makeTaskName(task, object, repeatIndex, repeatCount),
          object_name: object.name || "Object",
          task_type: task.task_type || "Taak",
          operating_company_id: serviceContext.operating_company_id || operatingCompanyId,
          personnel_contract_id: null,
          contract_function_key: serviceContext.function_type || null,
          contract_cao_key: serviceContext.cao_key || null,
          contract_routing_status: "not_applicable",
          contract_routing_snapshot: {
            status: "not_applicable",
            source: "manual_task_without_employee",
            resolved_at: nowIso(),
            service_context: serviceContext
          },
          repeat_index: repeatCount > 1 ? repeatIndex : null,
          repeat_count: repeatCount > 1 ? repeatCount : null,
          status: "pending",
          planned_arrival_time: assignment.planned_arrival_time || null,
          planned_start_time: assignment.planned_start_time || null,
          planned_departure_time: assignment.planned_departure_time || null,
          planned_arrival_seconds: secondsFromTime(assignment.planned_arrival_time),
          planned_departure_seconds: secondsFromTime(assignment.planned_departure_time),
          duration_minutes: Number(task.duration_minutes || 0),
          travel_from_previous_minutes: null,
          distance_from_previous_km: null,
          travel_to_next_minutes: null,
          distance_to_next_km: null,
          latitude,
          longitude,
          address: object.address || null,
          locked_to_route: !!assignment.locked_to_route,
          locked_sequence: !!assignment.locked_sequence,
          route_pin_hard: !!assignment.locked_to_route,
          arrival_deadline_time: task.arrival_deadline_time || null,
          uses_arrival_deadline: !!task.use_arrival_deadline,
          service_must_start_at: null,
          metadata: { source: "uitvoering", contract_routing_status: "not_applicable" }
        });
      });
    });
    if (taskPayloads.length) await base44.asServiceRole.entities.TaskExecution.bulkCreate(taskPayloads);
    return Response.json({ route_execution_id: routeExecution.id, created_tasks: taskPayloads.length, already_exists: false });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// base44/functions/_shared/mobile/mobileMe.ts
import { createClientFromRequest as createClientFromRequest2 } from "npm:@base44/sdk@0.8.31";
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}
function isPrivileged(user) {
  return ["admin", "director", "hr", "manager", "planner"].includes(String(user?.role || "").toLowerCase());
}
async function getEmployeeContext(base44, user) {
  const linked = await base44.asServiceRole.entities.Personnel.filter({ linked_user_id: user.id });
  const employee = linked[0] || null;
  if (employee) {
    const assignments = await base44.asServiceRole.entities.PersonnelCompanyAssignment.filter({ personnel_id: employee.id });
    const allCos = assignments.length > 0 ? await base44.asServiceRole.entities.Company.list() : [];
    const companies = assignments.filter((a) => a.assignment_status === "active" || !a.assignment_status).map((a) => {
      const co = allCos.find((c) => c.id === a.company_id);
      return co ? { company_id: co.id, company_name: co.display_name, trade_name: co.trade_name || null, is_primary: a.is_primary || false } : null;
    }).filter(Boolean);
    return {
      is_linked: true,
      employee_id: employee.id,
      employee_display_name: employee.name || null,
      linked_user_id: user.id,
      companies,
      pending_invitations: []
    };
  }
  const normalizedEmail = normalizeEmail(user.email);
  const pendingInvitations = await base44.asServiceRole.entities.EmployeeInvitation.filter({ normalized_email: normalizedEmail, status: "pending" });
  const validInvites = pendingInvitations.filter((inv) => !inv.expires_at || new Date(inv.expires_at) > /* @__PURE__ */ new Date());
  let inviteList = [];
  if (validInvites.length > 0) {
    const allCos = await base44.asServiceRole.entities.Company.list();
    const allP = await base44.asServiceRole.entities.Personnel.list();
    inviteList = validInvites.map((inv) => {
      const co = allCos.find((c) => c.id === inv.company_id);
      const p = allP.find((p2) => p2.id === inv.personnel_id);
      return { id: inv.id, personnel_id: inv.personnel_id, company_id: inv.company_id || null, company_name: co?.display_name || null, employee_display_name: p?.name || null, email: inv.email, expires_at: inv.expires_at || null };
    });
  }
  return {
    is_linked: false,
    employee_id: null,
    linked_user_id: user.id,
    companies: [],
    pending_invitations: inviteList
  };
}
async function handleMobileMe(req) {
  try {
    const base44 = createClientFromRequest2(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const employeeCtx = await getEmployeeContext(base44, user);
    const canViewRoute = isPrivileged(user) || employeeCtx.is_linked;
    const canSubmitReports = isPrivileged(user) || employeeCtx.is_linked;
    return Response.json({
      user: { id: user.id, name: user.full_name || user.email, email: user.email, role: user.role || "user" },
      permissions: { can_view_mobile_route: canViewRoute, can_submit_reports: canSubmitReports },
      employee_context: {
        ...employeeCtx,
        permissions: { can_view_employee_portal: true, can_view_mobile_route: canViewRoute, can_submit_reports: canSubmitReports }
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// base44/functions/_shared/mobile/mobileObjectFloorPlan.ts
import { createClientFromRequest as createClientFromRequest3 } from "npm:@base44/sdk@0.8.31";
function nowIso2() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
var MIME_EXTENSION = {
  "application/json": "json",
  "application/octet-stream": "bin",
  "model/vnd.usdz+zip": "usdz",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};
function compact(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}
function ascii(value) {
  return compact(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "");
}
function safeFilenamePart(value, fallback = "Bestand") {
  const clean = ascii(value).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+-\s+/g, " - ").replace(/-+/g, "-").trim();
  return clean || fallback;
}
function fromBase64(value) {
  const binary = atob(value || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function toBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function masterKeyId() {
  return Deno.env.get("MANAGED_FILE_MASTER_KEY_ID") || "managed-file-master-v1";
}
async function importMasterKey(usage) {
  const raw = Deno.env.get("MANAGED_FILE_MASTER_KEY_B64");
  if (!raw) throw new Error("MANAGED_FILE_MASTER_KEY_B64 is niet geconfigureerd.");
  const bytes = fromBase64(raw);
  if (bytes.byteLength !== 32) throw new Error("MANAGED_FILE_MASTER_KEY_B64 moet exact 32 bytes base64 bevatten.");
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, usage);
}
async function sha256Base64(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return toBase64(digest);
}
async function encryptBytesForStorage(bytes) {
  const dataKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const rawDataKey = await crypto.subtle.exportKey("raw", dataKey);
  const fileIv = crypto.getRandomValues(new Uint8Array(12));
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: fileIv }, dataKey, bytes);
  const masterKey = await importMasterKey(["encrypt"]);
  const wrappedKey = await crypto.subtle.encrypt({ name: "AES-GCM", iv: wrapIv }, masterKey, rawDataKey);
  return {
    ciphertext,
    encryption_algorithm: "AES-256-GCM",
    encryption_key_id: masterKeyId(),
    encryption_iv: toBase64(fileIv),
    encrypted_data_key: toBase64(wrappedKey),
    key_wrap_algorithm: "AES-256-GCM",
    key_wrap_iv: toBase64(wrapIv),
    plaintext_sha256: await sha256Base64(bytes),
    ciphertext_sha256: await sha256Base64(ciphertext)
  };
}
function slug(value, fallback = "unknown") {
  const clean = ascii(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return clean || fallback;
}
function extensionForAsset(asset, fallback = "bin") {
  const original = asset?.filename || asset?.name || "";
  const fromName = original.includes(".") ? original.split(".").pop() : "";
  const clean = String(fromName || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  return clean || MIME_EXTENSION[asset?.mime_type] || fallback;
}
function buildFloorPlanFileContext({ object, objectId, companyId, revision, label, category, sourceField, asset }) {
  const extension = extensionForAsset(asset);
  const ownerLabel = object?.name || object?.object_code || "Object";
  const filename = `${safeFilenamePart(ownerLabel)} - ${safeFilenamePart(label)} - rev-${revision}.${extension}`;
  const objectFolder = companyId ? `companies/company-${companyId}/objects/${slug(ownerLabel)}_${objectId}` : `objects/${slug(ownerLabel)}_${objectId}`;
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
    const encrypted = await encryptBytesForStorage(bytes);
    const storageFilename = `${fileContext.filename}.enc`;
    const blob = new Blob([encrypted.ciphertext], { type: "application/octet-stream" });
    const file = typeof File === "undefined" ? blob : new File([blob], storageFilename, { type: blob.type });
    const result = await base44.asServiceRole.integrations.Core.UploadFile({ file });
    const fileUrl = result?.file_url || null;
    if (!fileUrl) return null;
    const managed = await base44.asServiceRole.entities.ManagedFile.create({
      owner_type: "object",
      owner_id: context.objectId,
      company_id: context.companyId || null,
      upload_session_id: null,
      tenant_container_key: context.companyId ? `company:${context.companyId}` : `object:${context.objectId}`,
      owner_container_key: `object:${context.objectId}`,
      access_scope: "company",
      domain: "operations",
      category: fileContext.category,
      source_entity: "ObjectFloorPlan",
      source_entity_id: null,
      source_field: fileContext.sourceField,
      file_url: fileUrl,
      storage_filename: storageFilename,
      original_filename: asset.filename || asset.name || null,
      display_filename: fileContext.filename,
      download_filename: fileContext.filename,
      logical_path: fileContext.logicalPath,
      folder_path: fileContext.folderPath,
      extension: fileContext.extension,
      mime_type: asset.mime_type || blob.type || null,
      stored_mime_type: "application/octet-stream",
      size_bytes: bytes.length,
      ciphertext_size_bytes: encrypted.ciphertext.byteLength,
      encrypted: true,
      encryption_algorithm: encrypted.encryption_algorithm,
      encryption_key_id: encrypted.encryption_key_id,
      encryption_iv: encrypted.encryption_iv,
      encrypted_data_key: encrypted.encrypted_data_key,
      key_wrap_algorithm: encrypted.key_wrap_algorithm,
      key_wrap_iv: encrypted.key_wrap_iv,
      plaintext_sha256: encrypted.plaintext_sha256,
      ciphertext_sha256: encrypted.ciphertext_sha256,
      document_label: context.label || null,
      document_number: `rev-${context.revision}`,
      valid_from: null,
      valid_until: null,
      status: "active",
      version: context.revision,
      is_sensitive: true,
      security_classification: "strictly_confidential",
      retention_until: null,
      uploaded_at: nowIso2(),
      uploaded_by: context.uploadedBy || null,
      metadata: {
        owner_label: fileContext.ownerLabel,
        commercial_container_policy: "company-scoped-managed-files-v1",
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
  } catch (error) {
    console.error("Encrypted floorplan upload failed:", error);
    throw error;
  }
}
async function handleMobileObjectFloorPlan(req) {
  try {
    const base44 = createClientFromRequest3(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const { action, object_id } = body;
    if (!object_id) return Response.json({ error: "object_id is verplicht" }, { status: 400 });
    if (action === "get") {
      const records = await base44.asServiceRole.entities.ObjectFloorPlan.filter({ object_id, is_current: true });
      const current = records.find((r) => r.is_current && r.status === "published") || null;
      return Response.json({ floor_plan: current });
    }
    if (action === "publish") {
      const upload = body.upload || {};
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
      const [usdzAsset, rawAsset, preview2dAsset, metadataAsset] = await Promise.all([
        uploadBase64Asset(base44, upload.usdz_asset, { ...assetContext, label: "RoomPlan USDZ", category: "object_floorplan_usdz", sourceField: "usdz_file_url" }),
        uploadBase64Asset(base44, upload.raw_roomplan_asset, { ...assetContext, label: "RoomPlan raw data", category: "object_floorplan_raw_roomplan", sourceField: "raw_roomplan_file_url" }),
        uploadBase64Asset(base44, upload.preview_2d_asset, { ...assetContext, label: "RoomPlan 2D preview", category: "object_floorplan_preview_2d", sourceField: "preview_2d_file_url" }),
        uploadBase64Asset(base44, upload.metadata_asset, { ...assetContext, label: "RoomPlan metadata", category: "object_floorplan_metadata", sourceField: "metadata.metadata_url" })
      ]);
      const currentRecords = existing.filter((r) => r.is_current);
      await Promise.all(currentRecords.map(
        (r) => base44.asServiceRole.entities.ObjectFloorPlan.update(r.id, { is_current: false })
      ));
      const newRecord = await base44.asServiceRole.entities.ObjectFloorPlan.create({
        object_id,
        status: "published",
        revision: newRevision,
        is_current: true,
        title: upload.title || null,
        source: upload.source || "ios_roomplan",
        captured_by: user.full_name || user.email || null,
        captured_at: upload.captured_at || null,
        published_at: upload.published_at || nowIso2(),
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
        metadata: upload.metadata || (metadataAsset?.file_url ? { metadata_url: metadataAsset.file_url } : null)
      });
      await Promise.all([usdzAsset, rawAsset, preview2dAsset, metadataAsset].filter((asset) => asset?.file_id).map((asset) => base44.asServiceRole.entities.ManagedFile.update(asset.file_id, { source_entity_id: newRecord.id })));
      await base44.asServiceRole.entities.MobileAuditLog.create({
        employee_id: user.id || null,
        object_id,
        action: "object_floorplan_published",
        payload: {
          floor_plan_id: newRecord.id,
          revision: newRevision,
          source: upload.source || "ios_roomplan",
          has_usdz: !!usdzAsset?.file_url,
          has_preview_2d: !!preview2dAsset?.file_url
        },
        created_at: nowIso2()
      });
      return Response.json({ floor_plan: newRecord });
    }
    return Response.json({ error: 'Onbekende action. Gebruik "get" of "publish".' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// base44/functions/_shared/mobile/mobileObjectsMap.ts
import { createClientFromRequest as createClientFromRequest4 } from "npm:@base44/sdk@0.8.25";
var OPEN_STATUSES = ["pending", "en_route", "arrived", "started", "postponed", "failed"];
function safeNumber2(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function statusForObject(objectId, tasks) {
  const items = tasks.filter((task) => String(task.object_id) === String(objectId));
  if (!items.length) return { map_status: "customer", open_task_count: 0, has_task_in_current_route: false, is_next_task_object: false };
  const open = items.filter((task) => OPEN_STATUSES.includes(task.status));
  const active = items.some((task) => ["arrived", "started"].includes(task.status));
  const next = tasks.find((task) => OPEN_STATUSES.includes(task.status));
  if (active) return { map_status: "active_task", open_task_count: open.length, has_task_in_current_route: true, is_next_task_object: false };
  if (next && String(next.object_id) === String(objectId)) return { map_status: "next_task", open_task_count: open.length, has_task_in_current_route: true, is_next_task_object: true };
  if (!open.length) return { map_status: "completed", open_task_count: 0, has_task_in_current_route: true, is_next_task_object: false };
  return { map_status: "route_task", open_task_count: open.length, has_task_in_current_route: true, is_next_task_object: false };
}
async function handleMobileObjectsMap(req) {
  try {
    const base44 = createClientFromRequest4(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const [objects, tasks, floorPlans] = await Promise.all([
      base44.asServiceRole.entities.SurveillanceObject.list(),
      body.route_execution_id ? base44.asServiceRole.entities.TaskExecution.filter({ route_execution_id: body.route_execution_id }) : Promise.resolve([]),
      base44.asServiceRole.entities.ObjectFloorPlan.filter({ is_current: true, status: "published" })
    ]);
    const floorPlanByObjectId = new Map(floorPlans.map((fp) => [String(fp.object_id), fp]));
    return Response.json({
      objects: objects.filter((object) => object.show_on_mobile_map !== false && object.is_active_customer_object !== false).map((object) => {
        const fp = floorPlanByObjectId.get(String(object.id));
        return {
          object_id: object.id,
          name: object.name,
          latitude: safeNumber2(object.latitude),
          longitude: safeNumber2(object.longitude),
          address: object.address || null,
          ...statusForObject(object.id, tasks),
          building_polygon_geojson: object.building_polygon_geojson || null,
          floor_plan_summary: fp ? {
            floor_plan_id: fp.id,
            revision: fp.revision,
            usdz_file_url: fp.usdz_file_url || null,
            preview_2d_file_url: fp.preview_2d_file_url || null,
            updated_at: fp.published_at || fp.updated_date || null
          } : null
        };
      }).filter((object) => object.latitude !== null && object.longitude !== null)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// base44/functions/_shared/mobile/mobileReport.ts
import { createClientFromRequest as createClientFromRequest5 } from "npm:@base44/sdk@0.8.25";
function nowIso3() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
async function handleMobileReport(req) {
  try {
    const base44 = createClientFromRequest5(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    if (body.action === "photo") {
      const photo = await base44.asServiceRole.entities.MobilePhoto.create({
        report_id: body.report_id,
        task_execution_id: body.task_execution_id,
        route_execution_id: body.route_execution_id,
        object_id: body.object_id,
        file_url: body.file_url,
        thumbnail_url: body.thumbnail_url || null,
        caption: body.caption || null,
        taken_at: body.taken_at || null,
        uploaded_at: nowIso3(),
        created_offline_at: body.created_offline_at || null,
        gps_latitude: body.latitude ?? null,
        gps_longitude: body.longitude ?? null,
        metadata: body.metadata || null
      });
      if (body.report_id) {
        const reports = await base44.asServiceRole.entities.MobileReport.filter({ id: body.report_id });
        if (reports[0]) await base44.asServiceRole.entities.MobileReport.update(body.report_id, { photo_count: Number(reports[0].photo_count || 0) + 1 });
      }
      return Response.json({ photo, server_time: nowIso3() });
    }
    const report = await base44.asServiceRole.entities.MobileReport.create({
      task_execution_id: body.task_execution_id,
      route_execution_id: body.route_execution_id,
      object_id: body.object_id,
      employee_id: body.employee_id || null,
      status: body.status || "submitted",
      report_type: body.report_type,
      report_text: body.report_text || null,
      checklist_answers: body.checklist_answers || {},
      extra_fields: body.extra_fields || null,
      created_offline_at: body.created_offline_at || null,
      created_at: nowIso3(),
      submitted_at: body.submitted_at || nowIso3(),
      synced_at: nowIso3(),
      gps_latitude: body.latitude ?? null,
      gps_longitude: body.longitude ?? null,
      photo_count: Number(body.photo_count || 0),
      photos: body.photos || null,
      metadata: body.metadata || null
    });
    return Response.json({ report, server_time: nowIso3() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// base44/functions/_shared/mobile/mobileRouteAction.ts
import { createClientFromRequest as createClientFromRequest6 } from "npm:@base44/sdk@0.8.25";
function nowIso4() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
async function audit(base44, action, route, body) {
  await base44.asServiceRole.entities.MobileAuditLog.create({
    employee_id: route.employee_id || null,
    route_execution_id: route.id,
    task_execution_id: null,
    object_id: null,
    action,
    payload: body || {},
    created_at: nowIso4(),
    created_offline_at: body?.offline_created_at || body?.downloaded_at || null,
    synced_at: nowIso4(),
    latitude: body?.latitude ?? null,
    longitude: body?.longitude ?? null,
    device_id: body?.device_id || null,
    app_version: body?.app_version || null
  });
}
async function handleMobileRouteAction(req) {
  try {
    const base44 = createClientFromRequest6(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const routeId = body.route_execution_id;
    const action = body.action;
    if (!routeId || !action) return Response.json({ error: "route_execution_id en action zijn verplicht" }, { status: 400 });
    const routes = await base44.asServiceRole.entities.RouteExecution.filter({ id: routeId });
    const route = routes[0];
    if (!route) return Response.json({ error: "RouteExecution niet gevonden" }, { status: 404 });
    const patch = { last_mobile_sync_at: nowIso4() };
    if (action === "downloaded") {
      patch.status = route.status === "planned" ? "downloaded" : route.status;
      patch.downloaded_by_employee_at = body.downloaded_at || nowIso4();
    }
    if (action === "start") {
      patch.status = "active";
      patch.actual_started_at = body.timestamp || nowIso4();
    }
    if (action === "complete") {
      const tasks = await base44.asServiceRole.entities.TaskExecution.filter({ route_execution_id: routeId });
      const openTasks = tasks.filter((task) => !["completed", "skipped"].includes(task.status));
      if (openTasks.length && !body.force_complete) return Response.json({ error: "Er staan nog open taken in deze route", open_task_count: openTasks.length }, { status: 409 });
      patch.status = "completed";
      patch.actual_completed_at = body.timestamp || nowIso4();
    }
    if (!["downloaded", "start", "complete", "pause", "cancel"].includes(action)) return Response.json({ error: "Onbekende route-actie" }, { status: 400 });
    if (action === "pause") patch.status = "paused";
    if (action === "cancel") patch.status = "cancelled";
    const updated = await base44.asServiceRole.entities.RouteExecution.update(routeId, patch);
    await audit(base44, action === "downloaded" ? "route_downloaded" : `route_${action}ed`, route, body);
    return Response.json({ route_execution: updated, server_time: nowIso4() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// base44/functions/_shared/mobile/mobileRoutePackage.ts
import { createClientFromRequest as createClientFromRequest7 } from "npm:@base44/sdk@0.8.31";
var OPEN_STATUSES2 = ["pending", "en_route", "arrived", "started", "postponed", "failed"];
function todayIso() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function nowIso5() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function isPrivileged2(user) {
  return ["admin", "director", "hr", "manager", "planner"].includes(String(user?.role || "").toLowerCase());
}
function safeNumber3(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
async function findEmployee(base44, user) {
  const linkedByUserId = await base44.asServiceRole.entities.Personnel.filter({ linked_user_id: user.id });
  if (linkedByUserId.length > 0) return linkedByUserId[0];
  const byEmail = await base44.asServiceRole.entities.Personnel.filter({ email: user.email });
  if (byEmail.length > 0) return byEmail[0];
  const byLoginEmail = await base44.asServiceRole.entities.Personnel.filter({ login_email: user.email });
  if (byLoginEmail.length > 0) return byLoginEmail[0];
  const all = await base44.asServiceRole.entities.Personnel.list();
  return all.find((p) => String(p.name || "").toLowerCase() === String(user.full_name || "").toLowerCase()) || null;
}
async function getRouteExecution(base44, user, body) {
  if (body.route_execution_id) {
    const matches = await base44.asServiceRole.entities.RouteExecution.filter({ id: body.route_execution_id });
    return matches[0] || null;
  }
  const employee = await findEmployee(base44, user);
  const date = body.date || todayIso();
  let executions = await base44.asServiceRole.entities.RouteExecution.filter({ service_date: date });
  executions = executions.filter((route) => ["planned", "downloaded", "active", "paused"].includes(route.status));
  if (body.vehicle_id) executions = executions.filter((route) => String(route.vehicle_id || "") === String(body.vehicle_id));
  if (employee && !isPrivileged2(user)) executions = executions.filter((route) => String(route.employee_id || "") === String(employee.id));
  if (isPrivileged2(user) && body.employee_id) executions = executions.filter((route) => String(route.employee_id || "") === String(body.employee_id));
  return executions.sort((a, b) => String(a.shift_start_time || "").localeCompare(String(b.shift_start_time || "")))[0] || null;
}
function taskTemplateId(templates, taskType) {
  return templates.find((t) => t.is_active !== false && t.task_type === taskType)?.id || null;
}
function mapStatus(objectId, taskExecutions) {
  const tasks = taskExecutions.filter((task) => String(task.object_id) === String(objectId));
  if (!tasks.length) return { map_status: "customer", open_task_count: 0, has_task_in_current_route: false, is_next_task_object: false };
  const openTasks = tasks.filter((task) => OPEN_STATUSES2.includes(task.status));
  const active = tasks.some((task) => ["arrived", "started"].includes(task.status));
  const nextOpen = taskExecutions.find((task) => OPEN_STATUSES2.includes(task.status));
  if (active) return { map_status: "active_task", open_task_count: openTasks.length, has_task_in_current_route: true, is_next_task_object: false };
  if (nextOpen && String(nextOpen.object_id) === String(objectId)) return { map_status: "next_task", open_task_count: openTasks.length, has_task_in_current_route: true, is_next_task_object: true };
  if (!openTasks.length) return { map_status: "completed", open_task_count: 0, has_task_in_current_route: true, is_next_task_object: false };
  return { map_status: "route_task", open_task_count: openTasks.length, has_task_in_current_route: true, is_next_task_object: false };
}
async function buildPackage(base44, routeExecution) {
  const [taskExecutions, objects, templates, vehicles, personnel, floorPlans] = await Promise.all([
    base44.asServiceRole.entities.TaskExecution.filter({ route_execution_id: routeExecution.id }),
    base44.asServiceRole.entities.SurveillanceObject.list(),
    base44.asServiceRole.entities.ReportTemplate.list(),
    base44.asServiceRole.entities.Vehicle.list(),
    base44.asServiceRole.entities.Personnel.list(),
    base44.asServiceRole.entities.ObjectFloorPlan.filter({ is_current: true, status: "published" })
  ]);
  const sortedTasks = taskExecutions.sort((a, b) => Number(a.sequence_index || 0) - Number(b.sequence_index || 0));
  const objectById = new Map(objects.map((object) => [String(object.id), object]));
  const floorPlanByObjectId = new Map(floorPlans.map((fp) => [String(fp.object_id), fp]));
  const vehicle = vehicles.find((v) => String(v.id) === String(routeExecution.vehicle_id)) || null;
  const employee = personnel.find((p) => String(p.id) === String(routeExecution.employee_id)) || null;
  const relevantObjectIds = new Set(sortedTasks.map((task) => String(task.object_id)));
  const stops = sortedTasks.map((task) => {
    const object = objectById.get(String(task.object_id)) || {};
    return {
      task_execution_id: task.id,
      route_execution_id: task.route_execution_id,
      original_task_id: task.original_task_id,
      object_id: task.object_id,
      sequence_index: task.sequence_index,
      object_name: task.object_name,
      task_name: task.task_name,
      task_type: task.task_type,
      repeat_index: task.repeat_index ?? null,
      repeat_count: task.repeat_count ?? null,
      custom_block_label: task.custom_block_label || null,
      status: task.status,
      planned_arrival: task.planned_arrival_time || null,
      planned_start: task.planned_start_time || null,
      planned_departure: task.planned_departure_time || null,
      duration_minutes: task.duration_minutes,
      travel_from_previous_minutes: task.travel_from_previous_minutes ?? null,
      distance_from_previous_km: task.distance_from_previous_km ?? null,
      travel_to_next_minutes: task.travel_to_next_minutes ?? null,
      distance_to_next_km: task.distance_to_next_km ?? null,
      latitude: task.latitude,
      longitude: task.longitude,
      address: task.address || object.address || null,
      parking_instruction: object.parking_instruction || null,
      entry_instruction: object.entry_instruction || null,
      walking_instruction: object.walking_instruction || null,
      access_instruction: object.access_instruction || null,
      alarm_instruction: object.alarm_instruction || null,
      key_instruction: object.key_instruction || null,
      object_notes: object.object_notes || object.notes || null,
      safety_notes: object.safety_notes || null,
      last_incident_notes: object.last_incident_notes || null,
      object_map_url: object.object_map_url || object.object_map_file_url || null,
      report_template_id: taskTemplateId(templates, task.task_type)
    };
  });
  const objectsOnMap = objects.filter((object) => object.show_on_mobile_map !== false && object.is_active_customer_object !== false).map((object) => ({
    object_id: object.id,
    name: object.name,
    latitude: safeNumber3(object.latitude),
    longitude: safeNumber3(object.longitude),
    address: object.address || null,
    ...mapStatus(object.id, sortedTasks),
    building_polygon_geojson: object.building_polygon_geojson || null,
    object_area_geojson: object.object_area_geojson || null,
    mobile_map_priority: Number(object.mobile_map_priority || 0),
    floor_plan_summary: (() => {
      const fp = floorPlanByObjectId.get(String(object.id));
      return fp ? {
        floor_plan_id: fp.id,
        revision: fp.revision,
        usdz_file_url: fp.usdz_file_url || null,
        preview_2d_file_url: fp.preview_2d_file_url || null,
        updated_at: fp.published_at || fp.updated_date || null
      } : null;
    })()
  })).filter((object) => object.latitude !== null && object.longitude !== null || relevantObjectIds.has(String(object.object_id)));
  return {
    route_execution_id: routeExecution.id,
    route_name: routeExecution.route_name,
    status: routeExecution.status,
    employee: { id: routeExecution.employee_id, name: routeExecution.employee_name || employee?.name || null },
    vehicle: { id: routeExecution.vehicle_id, license_plate: routeExecution.vehicle_license_plate || vehicle?.license_plate || null },
    shift: { start: routeExecution.shift_start_time, end: routeExecution.shift_end_time },
    start_location: { name: routeExecution.start_location_name, latitude: routeExecution.start_latitude, longitude: routeExecution.start_longitude },
    end_location: { name: routeExecution.end_location_name, latitude: routeExecution.end_latitude, longitude: routeExecution.end_longitude },
    stops,
    objects_on_map: objectsOnMap,
    report_templates: templates.filter((t) => t.is_active !== false).map((t) => ({ id: t.id, name: t.name, task_type: t.task_type, fields: t.fields || [] })),
    server_time: nowIso5(),
    sync_token: `${routeExecution.id}:${nowIso5()}`
  };
}
async function handleMobileRoutePackage(req) {
  try {
    const base44 = createClientFromRequest7(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const routeExecution = await getRouteExecution(base44, user, body || {});
    if (!routeExecution) return Response.json({ error: "Geen actieve of geplande route gevonden" }, { status: 404 });
    const employee = await findEmployee(base44, user);
    if (!isPrivileged2(user) && employee && String(routeExecution.employee_id || "") !== String(employee.id)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const routePackage = await buildPackage(base44, routeExecution);
    await base44.asServiceRole.entities.RouteExecution.update(routeExecution.id, { mobile_route_package_cache: routePackage, last_mobile_sync_at: nowIso5() });
    return Response.json(routePackage);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// base44/functions/_shared/mobile/mobileSync.ts
import { createClientFromRequest as createClientFromRequest8 } from "npm:@base44/sdk@0.8.25";
function nowIso6() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
async function handleMobileSync(req) {
  try {
    const base44 = createClientFromRequest8(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
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
          created_at: event.timestamp || nowIso6(),
          created_offline_at: event.offline_created_at || null,
          synced_at: nowIso6(),
          latitude: event.payload?.latitude ?? null,
          longitude: event.payload?.longitude ?? null,
          device_id: body.device_id || null,
          app_version: body.app_version || null
        });
        accepted.push(event.local_event_id || event.type);
      } catch (error) {
        failed.push({ local_event_id: event.local_event_id, error: error.message });
      }
    }
    return Response.json({ accepted, failed, server_time: nowIso6(), new_sync_token: `${nowIso6()}:${accepted.length}` });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// base44/functions/mobileApi/entry.ts
var HANDLERS = {
  create_route_execution: handleCreateMobileRouteExecution,
  me: handleMobileMe,
  object_floor_plan: handleMobileObjectFloorPlan,
  objects_map: handleMobileObjectsMap,
  report: handleMobileReport,
  route_action: handleMobileRouteAction,
  route_package: handleMobileRoutePackage,
  sync: handleMobileSync
};
var OPERATION_ACTIONS = /* @__PURE__ */ new Set([
  "object_floor_plan",
  "report",
  "route_action"
]);
function json(data, status = 200) {
  return Response.json(data, { status });
}
function requestForHandler(req, body, includeOperation) {
  const headers = new Headers(req.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  const nestedPayload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload : {};
  const { action: _routerAction, operation, payload: _payload, ...flatPayload } = body;
  const legacyPayload = {
    ...flatPayload,
    ...nestedPayload
  };
  if (includeOperation) legacyPayload.action = operation;
  return new Request(req.url, {
    method: req.method,
    headers,
    body: JSON.stringify(legacyPayload)
  });
}
Deno.serve(async (req) => {
  try {
    const body = await req.clone().json().catch(() => ({}));
    const action = String(body?.action || "");
    const handler = HANDLERS[action];
    if (!handler) {
      return json({
        error: "Onbekende mobiele actie",
        allowed_actions: Object.keys(HANDLERS)
      }, 400);
    }
    if (OPERATION_ACTIONS.has(action)) {
      if (!body.operation) {
        return json({ error: `operation is verplicht voor ${action}` }, 400);
      }
      return handler(requestForHandler(req, body, true));
    }
    return handler(requestForHandler(req, body, false));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
