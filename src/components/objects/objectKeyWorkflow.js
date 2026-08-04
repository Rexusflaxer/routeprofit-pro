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

export function createObjectKeyMutationKey(action = "create_object_key") {
  return createCustomerMutationKey(action);
}

export async function listObjectKeys({ customerId, objectId, invoke } = {}) {
  return invokeFor(invoke)({
    action: "list_object_keys",
    customer_id: required(customerId, "Klant-ID"),
    object_id: required(objectId, "Object-ID"),
  });
}

export async function saveObjectKey({ customerId, objectId, current = null, form, idempotencyKey, invoke } = {}) {
  return invokeFor(invoke)({
    action: current ? "update_object_key" : "create_object_key",
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: Number(current?.version || 0),
    customer_id: required(customerId, "Klant-ID"),
    object_id: required(objectId, "Object-ID"),
    ...(current ? {
      key_id: required(current.id, "Sleutel-ID"),
      key_assignment_id: required(current.assignment_id, "Sleutelkoppeling"),
      assignment_expected_version: Number(current.assignment_version),
    } : {}),
    data: form || {},
  });
}

export async function archiveObjectKey({ customerId, objectId, key, idempotencyKey, invoke } = {}) {
  return invokeFor(invoke)({
    action: "archive_object_key",
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: Number(key?.assignment_version),
    customer_id: required(customerId, "Klant-ID"),
    object_id: required(objectId, "Object-ID"),
    key_assignment_id: required(key?.assignment_id, "Sleutelkoppeling"),
    key_id: required(key?.id, "Sleutel-ID"),
  });
}
