import {
  createCustomerMutationKey,
  invokeCustomerPlatformMutation,
  invokeCustomerPlatformRead,
} from "@/components/customers/customerDossierUtils";

const text = value => String(value ?? "").trim();

function required(value, label) {
  const normalized = text(value);
  if (!normalized) throw new Error(`${label} ontbreekt. Vernieuw de pagina en probeer opnieuw.`);
  return normalized;
}

export function createHandbookMutationKey(action) {
  return createCustomerMutationKey(action);
}

export function listObjectHandbook({ customerId, objectId }) {
  return invokeCustomerPlatformRead({
    action: "list_object_handbook",
    customer_id: required(customerId, "Klant-ID"),
    object_id: required(objectId, "Object-ID"),
  });
}

function mutate(action, { customerId, objectId, idempotencyKey, expectedVersion = 0, ...payload }) {
  return invokeCustomerPlatformMutation({
    action,
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: Number(expectedVersion || 0),
    customer_id: required(customerId, "Klant-ID"),
    object_id: required(objectId, "Object-ID"),
    ...payload,
  });
}

export function createHandbookCategory({ customerId, objectId, form, idempotencyKey }) {
  return mutate("create_object_handbook_category", { customerId, objectId, idempotencyKey, data: form });
}

export function updateHandbookCategory({ customerId, objectId, category, form, idempotencyKey }) {
  return mutate("update_object_handbook_category", {
    customerId,
    objectId,
    idempotencyKey,
    expectedVersion: category?.version,
    category_id: required(category?.id, "Categorie-ID"),
    data: form,
  });
}

export function archiveHandbookCategory({ customerId, objectId, category, idempotencyKey }) {
  return mutate("archive_object_handbook_category", {
    customerId,
    objectId,
    idempotencyKey,
    expectedVersion: category?.version,
    category_id: required(category?.id, "Categorie-ID"),
  });
}

export function createHandbookArticle({ customerId, objectId, form, idempotencyKey }) {
  return mutate("create_object_handbook_article", { customerId, objectId, idempotencyKey, data: form });
}

export function updateHandbookArticle({ customerId, objectId, article, form, idempotencyKey }) {
  return mutate("update_object_handbook_article", {
    customerId,
    objectId,
    idempotencyKey,
    expectedVersion: article?.version,
    article_id: required(article?.id, "Artikel-ID"),
    data: form,
  });
}

export function archiveHandbookArticle({ customerId, objectId, article, idempotencyKey }) {
  return mutate("archive_object_handbook_article", {
    customerId,
    objectId,
    idempotencyKey,
    expectedVersion: article?.version,
    article_id: required(article?.id, "Artikel-ID"),
  });
}

export function syncInstallationHandbooks({ customerId, objectId, syncToken, idempotencyKey }) {
  return mutate("sync_object_installation_handbooks", {
    customerId,
    objectId,
    idempotencyKey,
    sync_token: required(syncToken, "Synchronisatietoken"),
  });
}
