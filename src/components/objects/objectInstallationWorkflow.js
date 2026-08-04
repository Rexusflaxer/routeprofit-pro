import {
  createCustomerMutationKey,
  invokeCustomerPlatformMutation,
} from "@/components/customers/customerDossierUtils";

const text = value => String(value ?? "").trim();
const invokeFor = invoke => invoke || invokeCustomerPlatformMutation;

function required(value, label) {
  const normalized = text(value);
  if (!normalized) throw new Error(`${label} ontbreekt. Vernieuw de pagina en probeer opnieuw.`);
  return normalized;
}

export function createObjectInstallationKey() {
  return createCustomerMutationKey("create_object_installation");
}

export function updateObjectInstallationKey() {
  return createCustomerMutationKey("update_object_installation");
}

export function archiveObjectInstallationKey() {
  return createCustomerMutationKey("archive_object_installation");
}

export async function listObjectInstallations({ customerId, objectId, invoke } = {}) {
  return invokeFor(invoke)({
    action: "list_object_installations",
    customer_id: required(customerId, "Klant-ID"),
    object_id: required(objectId, "Object-ID"),
  });
}

export async function saveObjectInstallation({ customerId, objectId, installation = null, form, idempotencyKey, invoke } = {}) {
  return invokeFor(invoke)({
    action: installation ? "update_object_installation" : "create_object_installation",
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: installation?.version || 0,
    customer_id: required(customerId, "Klant-ID"),
    object_id: required(objectId, "Object-ID"),
    ...(installation ? { installation_id: required(installation.id, "Installatie-ID") } : {}),
    data: form || {},
  });
}

export async function archiveObjectInstallation({ customerId, objectId, installation, idempotencyKey, invoke } = {}) {
  return invokeFor(invoke)({
    action: "archive_object_installation",
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: Number(installation?.version),
    customer_id: required(customerId, "Klant-ID"),
    object_id: required(objectId, "Object-ID"),
    installation_id: required(installation?.id, "Installatie-ID"),
  });
}
