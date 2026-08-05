import {
  createCustomerMutationKey,
  invokeCustomerPlatformMutation,
  invokeCustomerPlatformRead,
} from "@/components/customers/customerDossierUtils";
import {
  normalizeInstructionBlocks,
  normalizeRouteOverlay,
  securityPlanExecutionModeForTaskType,
} from "./securityPlanConfig";

function required(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} ontbreekt.`);
  return normalized;
}

function expectedVersion(value) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 0) throw new Error("De actuele versie ontbreekt. Vernieuw de pagina en probeer opnieuw.");
  return version;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compactNullable(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function nonNegativeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
}

export function createSecurityPlanMutationKey(action) {
  return createCustomerMutationKey(`object-security-plan:${action}`);
}

export function normalizeSecurityPlanRevision(revision) {
  if (!revision || typeof revision !== "object") return null;
  return {
    ...revision,
    revision_number: Number(revision.revision_number || revision.version || 1),
    version: Number(revision.version || 1),
    summary: String(revision.summary || ""),
    duration_mode: revision.duration_mode || (Number(revision.duration_minutes || 0) > 0 ? "fixed" : "none"),
    duration_minutes: revision.duration_minutes == null ? null : Number(revision.duration_minutes),
    section_policy: revision.section_policy || (revision.scope_type === "full" ? "fixed" : "not_applicable"),
    default_section_ids: asArray(revision.default_section_ids),
    allowed_section_ids: asArray(revision.allowed_section_ids),
    instruction_blocks: normalizeInstructionBlocks(
      revision.instruction_blocks || (
        asArray(revision.instructions).length
          ? [{ id: "legacy-instructions", title: "Uitvoering", steps: revision.instructions.map((instruction, index) => ({ title: `Stap ${index + 1}`, instruction })) }]
          : []
      ),
    ),
    floorplan_id: revision.floorplan_id || null,
    floorplan_revision: revision.floorplan_revision == null ? null : Number(revision.floorplan_revision),
    route_overlay: normalizeRouteOverlay(revision.route_overlay),
  };
}

export function normalizeSecurityPlanSummary(value) {
  const plan = value?.security_plan || value?.plan || value || {};
  const summary = plan.current_revision_summary || value?.current_revision_summary || null;
  const revision = normalizeSecurityPlanRevision(
    plan.draft_revision || plan.current_revision || plan.published_revision || summary || value?.revision || value?.draft_revision,
  );
  const legacyActive = plan.status === "active";
  return {
    ...plan,
    id: plan.id,
    task_type: plan.task_type || plan.category || "other",
    custom_task_type: plan.custom_task_type || null,
    variant_name: plan.variant_name || plan.title || "Naamloze variant",
    execution_mode: plan.execution_mode || (["object_security", "reception"].includes(plan.category) ? "continuous_post" : "round"),
    status: legacyActive ? "draft" : plan.status || "draft",
    latest_revision_number: Number(plan.latest_revision_number || revision?.revision_number || plan.version || 1),
    version: Number(plan.version || 1),
    draft_revision: plan.draft_revision ? normalizeSecurityPlanRevision(plan.draft_revision) : null,
    current_revision: revision,
    current_revision_summary: summary ? {
      ...summary,
      duration_mode: summary.duration_mode || null,
      duration_minutes: summary.duration_minutes == null ? null : Number(summary.duration_minutes),
      default_section_count: Number(summary.default_section_count || 0),
      allowed_section_count: Number(summary.allowed_section_count || 0),
      instruction_block_count: Number(summary.instruction_block_count || 0),
      instruction_step_count: Number(summary.instruction_step_count || 0),
      has_route: Boolean(summary.has_route),
      readiness_warning_count: Number(summary.readiness_warning_count || 0),
    } : null,
    migration_required: Boolean(plan.migration_required || legacyActive),
  };
}

export function normalizeSecurityPlanDetail(value) {
  const result = value?.data || value || {};
  const plan = normalizeSecurityPlanSummary(result.plan || result.security_plan || result);
  const draftRevision = normalizeSecurityPlanRevision(result.draft_revision || plan.draft_revision);
  const publishedRevision = normalizeSecurityPlanRevision(result.published_revision);
  const revisionHistory = asArray(result.revision_history || result.revisions).map(normalizeSecurityPlanRevision).filter(Boolean);
  return {
    ...result,
    plan: { ...plan, draft_revision: draftRevision, current_revision: draftRevision || publishedRevision || plan.current_revision },
    draft_revision: draftRevision,
    published_revision: publishedRevision,
    revision_history: revisionHistory,
    sections: asArray(result.sections),
    installations: asArray(result.installations),
    floorplans: asArray(result.floorplans),
    readiness: result.readiness || null,
  };
}

export function normalizeSecurityPlanList(value) {
  const result = value?.data || value || {};
  const items = asArray(result.items || result.plans || result).map(normalizeSecurityPlanSummary);
  return {
    items,
    category_summary: asArray(result.category_summary).map(summary => ({
      task_type: String(summary?.task_type || "other"),
      total: nonNegativeCount(summary?.total),
      published: nonNegativeCount(summary?.published),
      draft: nonNegativeCount(summary?.draft),
      attention: nonNegativeCount(summary?.attention),
    })),
    migration_required_count: nonNegativeCount(result.migration_required_count),
    total: Number(result.total ?? items.length),
    page: Number(result.page || 1),
    page_size: Number(result.page_size || Math.max(items.length, 1)),
    has_more: Boolean(result.has_more),
  };
}

function revisionPayload(data = {}) {
  const durationMode = data.duration_mode || "none";
  const duration = durationMode === "fixed" ? Number(data.duration_minutes) : null;
  const normalizedRoute = normalizeRouteOverlay(data.route_overlay);
  return {
    summary: compactNullable(data.summary),
    duration_mode: durationMode,
    duration_minutes: Number.isFinite(duration) && duration > 0 ? duration : null,
    section_policy: data.section_policy || data.selection_policy || "not_applicable",
    default_section_ids: [...new Set(asArray(data.default_section_ids).filter(Boolean))],
    allowed_section_ids: [...new Set(asArray(data.allowed_section_ids).filter(Boolean))],
    instruction_blocks: normalizeInstructionBlocks(data.instruction_blocks),
    floorplan_id: data.floorplan_id || null,
    floorplan_revision: data.floorplan_revision == null ? null : Number(data.floorplan_revision),
    route_overlay: normalizedRoute.path.length || normalizedRoute.markers.length ? normalizedRoute : null,
  };
}

function planPayload(data = {}) {
  const taskType = required(data.task_type, "Taaktype");
  return {
    task_type: taskType,
    custom_task_type: taskType === "other" ? required(data.custom_task_type, "Eigen taaktype") : null,
    variant_name: required(data.variant_name || data.title, "Variantnaam"),
    execution_mode: securityPlanExecutionModeForTaskType(taskType),
  };
}

export async function listObjectSecurityPlans({ customerId, objectId, status = null, taskType = null, search = "", page = 1, pageSize = 250 }) {
  const result = await invokeCustomerPlatformRead({
    action: "list_object_security_plans",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    ...(status ? { status } : {}),
    ...(taskType && taskType !== "all" ? { task_type: taskType } : {}),
    ...(String(search || "").trim() ? { search: String(search).trim() } : {}),
    page,
    page_size: pageSize,
  });
  return normalizeSecurityPlanList(result);
}

export async function getObjectSecurityPlan({ customerId, objectId, securityPlanId }) {
  const result = await invokeCustomerPlatformRead({
    action: "get_object_security_plan",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    security_plan_id: required(securityPlanId, "Beveiligingsplan"),
  });
  return normalizeSecurityPlanDetail(result);
}

export async function listObjectSections({ customerId, objectId, status = "active" }) {
  const result = await invokeCustomerPlatformRead({
    action: "list_object_sections",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    ...(status ? { status } : {}),
  });
  const items = asArray(result?.items || result?.data?.items || result).map(section => ({
    ...section,
    version: Number(section.version || 1),
  }));
  return { items, total: Number(result?.total ?? result?.data?.total ?? items.length) };
}

export async function createObjectSecurityPlan({ customerId, objectId, data, idempotencyKey }) {
  const result = await invokeCustomerPlatformMutation({
    action: "create_object_security_plan",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: 0,
    data: { ...planPayload(data), ...revisionPayload(data) },
  });
  return normalizeSecurityPlanDetail(result);
}

export async function saveObjectSecurityPlanDraft({ customerId, objectId, securityPlanId, version, data, idempotencyKey }) {
  const result = await invokeCustomerPlatformMutation({
    action: "save_object_security_plan_draft",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    security_plan_id: required(securityPlanId, "Beveiligingsplan"),
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: expectedVersion(version),
    data: { ...planPayload(data), ...revisionPayload(data) },
  });
  return normalizeSecurityPlanDetail(result);
}

export async function duplicateObjectSecurityPlan({ customerId, objectId, securityPlan, variantName = null, idempotencyKey }) {
  const result = await invokeCustomerPlatformMutation({
    action: "duplicate_object_security_plan",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    security_plan_id: required(securityPlan?.id, "Beveiligingsplan"),
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: expectedVersion(securityPlan?.version),
    data: { variant_name: compactNullable(variantName) },
  });
  return normalizeSecurityPlanDetail(result);
}

export async function publishObjectSecurityPlan({ customerId, objectId, securityPlan, idempotencyKey }) {
  const result = await invokeCustomerPlatformMutation({
    action: "publish_object_security_plan",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    security_plan_id: required(securityPlan?.id, "Beveiligingsplan"),
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: expectedVersion(securityPlan?.version),
  });
  return normalizeSecurityPlanDetail(result);
}

export async function archiveObjectSecurityPlan({ customerId, objectId, securityPlan, idempotencyKey }) {
  return invokeCustomerPlatformMutation({
    action: "archive_object_security_plan",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    security_plan_id: required(securityPlan?.id, "Beveiligingsplan"),
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: expectedVersion(securityPlan?.version),
  });
}

export async function upsertObjectSection({ customerId, objectId, section = null, data, idempotencyKey }) {
  return invokeCustomerPlatformMutation({
    action: "upsert_object_section",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    ...(section?.id ? { section_id: section.id } : {}),
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: section?.id ? expectedVersion(section.version) : 0,
    data: {
      code: required(data.code, "Sectiecode"),
      name: required(data.name, "Sectienaam"),
      description: compactNullable(data.description),
      floorplan_id: data.floorplan_id || null,
      floorplan_revision: data.floorplan_revision == null ? null : Number(data.floorplan_revision),
      geometry: data.geometry || null,
    },
  });
}

export async function archiveObjectSection({ customerId, objectId, section, idempotencyKey }) {
  return invokeCustomerPlatformMutation({
    action: "archive_object_section",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    section_id: required(section?.id, "Objectsectie"),
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: expectedVersion(section?.version),
  });
}

export async function migrateLegacyObjectSecurityPlans({ customerId, objectId, dryRun = true, idempotencyKey }) {
  return invokeCustomerPlatformMutation({
    action: "migrate_legacy_object_security_plans",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    dry_run: dryRun !== false,
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: 0,
  });
}