import {
  createCustomerMutationKey,
  invokeCustomerPlatformMutation,
  invokeCustomerPlatformRead,
} from "@/components/customers/customerDossierUtils";
import {
  OBJECT_MODULE_TYPES,
  normalizeObjectModuleConfiguration,
} from "./objectModuleConfig";

function required(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} ontbreekt.`);
  return normalized;
}

function expectedVersion(value) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 0) {
    throw new Error("De actuele versie ontbreekt. Vernieuw de pagina en probeer opnieuw.");
  }
  return version;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function nonNegativeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
}

export function createObjectModuleMutationKey(action) {
  return createCustomerMutationKey(`object-module:${action}`);
}

export function normalizeObjectModuleRevision(revision, moduleType) {
  if (!revision || typeof revision !== "object") return null;
  const configuration = normalizeObjectModuleConfiguration(
    moduleType,
    revision.configuration || revision.config || revision,
  );
  return {
    ...revision,
    id: revision.id || null,
    revision_number: Number(revision.revision_number || revision.revision || 1),
    version: Number(revision.version || 1),
    status: revision.status || "draft",
    configuration,
  };
}

export function normalizeObjectModuleSummary(value) {
  const module = value?.object_module || value?.module || value || {};
  const draftRevision = normalizeObjectModuleRevision(module.draft_revision || value?.draft_revision, module.module_type);
  const publishedRevision = normalizeObjectModuleRevision(module.published_revision || value?.published_revision, module.module_type);
  const summary = module.current_revision_summary || value?.current_revision_summary || {};
  return {
    ...module,
    id: module.id,
    module_type: module.module_type || module.type || "",
    name: String(module.display_name || module.name || ""),
    display_name: String(module.display_name || module.name || ""),
    status: module.status || "concept",
    version: Number(module.version || 1),
    latest_revision_number: Number(module.latest_revision_number || draftRevision?.revision_number || publishedRevision?.revision_number || 1),
    draft_revision: draftRevision,
    published_revision: publishedRevision,
    plan_link_count: nonNegativeCount(module.linked_plan_count ?? module.plan_link_count ?? value?.linked_plan_count ?? value?.plan_link_count),
    field_count: nonNegativeCount(summary.field_count ?? module.field_count),
    catalog_item_count: nonNegativeCount(summary.catalog_item_count ?? module.catalog_item_count),
    reference_list_count: nonNegativeCount(summary.reference_list_count ?? module.reference_list_count),
    current_revision_summary: summary,
  };
}

export function normalizeObjectModuleDetail(value) {
  const result = value?.data || value || {};
  const module = normalizeObjectModuleSummary(result.module || result.object_module || result);
  const draftRevision = normalizeObjectModuleRevision(result.draft_revision || module.draft_revision, module.module_type);
  const publishedRevision = normalizeObjectModuleRevision(result.published_revision || module.published_revision, module.module_type);
  const revisions = asArray(result.revisions || result.revision_history)
    .map(revision => normalizeObjectModuleRevision(revision, module.module_type))
    .filter(Boolean);
  return {
    ...result,
    module: {
      ...module,
      draft_revision: draftRevision,
      published_revision: publishedRevision,
    },
    draft_revision: draftRevision,
    published_revision: publishedRevision,
    revisions,
    plan_links: asArray(result.plan_links),
  };
}

export function normalizeObjectModuleList(value) {
  const result = value?.data || value || {};
  const items = asArray(result.items || result.modules || result).map(normalizeObjectModuleSummary);
  return {
    items,
    total: Number(result.total ?? items.length),
    page: Number(result.page || 1),
    page_size: Number(result.page_size || Math.max(items.length, 1)),
    has_more: Boolean(result.has_more),
  };
}

function moduleIdentityPayload(data = {}) {
  const moduleType = required(data.module_type, "Moduletype");
  if (!OBJECT_MODULE_TYPES.has(moduleType)) throw new Error("Selecteer een geldig moduletype.");
  return {
    module_type: moduleType,
    display_name: required(data.display_name || data.name, "Modulenaam"),
  };
}

export async function listObjectModules({ customerId, objectId, status = null, search = "" }) {
  const result = await invokeCustomerPlatformRead({
    action: "list_object_modules",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    ...(status ? { status } : {}),
    ...(String(search || "").trim() ? { search: String(search).trim() } : {}),
  });
  return normalizeObjectModuleList(result);
}

export async function getObjectModule({ customerId, objectId, moduleId }) {
  const result = await invokeCustomerPlatformRead({
    action: "get_object_module",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    module_id: required(moduleId, "Module"),
  });
  return normalizeObjectModuleDetail(result);
}

export async function createObjectModule({ customerId, objectId, data, idempotencyKey }) {
  const result = await invokeCustomerPlatformMutation({
    action: "create_object_module",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: 0,
    data: moduleIdentityPayload(data),
  });
  return normalizeObjectModuleDetail(result);
}

export async function saveObjectModuleDraft({ customerId, objectId, module, configuration, idempotencyKey }) {
  const result = await invokeCustomerPlatformMutation({
    action: "save_object_module_draft",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    module_id: required(module?.id, "Module"),
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: expectedVersion(module?.version),
    data: normalizeObjectModuleConfiguration(module?.module_type, configuration),
  });
  return normalizeObjectModuleDetail(result);
}

export async function publishObjectModule({ customerId, objectId, module, idempotencyKey }) {
  const result = await invokeCustomerPlatformMutation({
    action: "publish_object_module",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    module_id: required(module?.id, "Module"),
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: expectedVersion(module?.version),
  });
  return normalizeObjectModuleDetail(result);
}

export async function setObjectModuleStatus({ customerId, objectId, module, status, reason = "", idempotencyKey }) {
  const normalizedStatus = required(status, "Status");
  if (!["concept", "active", "suspended", "archived"].includes(normalizedStatus)) {
    throw new Error("Selecteer een geldige modulestatus.");
  }
  const normalizedReason = String(reason || "").trim();
  if (["suspended", "archived"].includes(normalizedStatus) && !normalizedReason) {
    throw new Error(normalizedStatus === "archived" ? "Reden voor archiveren is verplicht." : "Reden voor pauzeren is verplicht.");
  }
  if (normalizedReason.length > 500) throw new Error("Reden mag maximaal 500 tekens bevatten.");
  const result = await invokeCustomerPlatformMutation({
    action: "set_object_module_status",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    module_id: required(module?.id, "Module"),
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: expectedVersion(module?.version),
    data: {
      status: normalizedStatus,
      ...(["suspended", "archived"].includes(normalizedStatus) ? { reason: normalizedReason } : {}),
    },
  });
  return normalizeObjectModuleDetail(result);
}
