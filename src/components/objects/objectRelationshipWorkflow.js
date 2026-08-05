import {
  createCustomerMutationKey,
  invokeCustomerPlatformMutation,
  invokeCustomerPlatformRead,
} from "@/components/customers/customerDossierUtils";

const required = (value, label) => {
  const result = String(value || "").trim();
  if (!result) throw new Error(`${label} ontbreekt.`);
  return result;
};

export const createObjectRelationshipKey = () => createCustomerMutationKey("create_object_relationship");
export const updateObjectRelationshipKey = () => createCustomerMutationKey("update_object_relationship");
export const archiveObjectRelationshipKey = () => createCustomerMutationKey("archive_object_relationship");

export function listObjectRelationships({ customerId, objectId, invoke = invokeCustomerPlatformRead }) {
  return invoke({ action: "list_object_relationships", customer_id: required(customerId, "Klant-ID"), object_id: required(objectId, "Object-ID") });
}

export function saveObjectRelationship({ customerId, objectId, relationship, form, idempotencyKey, invoke = invokeCustomerPlatformMutation }) {
  return invoke({
    action: relationship ? "update_object_relationship" : "create_object_relationship",
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: Number(relationship?.version || 0),
    customer_id: required(customerId, "Klant-ID"), object_id: required(objectId, "Object-ID"),
    ...(relationship ? { relationship_id: required(relationship.id, "Relatie-ID") } : {}), data: form || {},
  });
}

export function archiveObjectRelationship({ customerId, objectId, relationship, idempotencyKey, invoke = invokeCustomerPlatformMutation }) {
  return invoke({
    action: "archive_object_relationship",
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: Number(relationship?.version),
    customer_id: required(customerId, "Klant-ID"),
    object_id: required(objectId, "Object-ID"),
    relationship_id: required(relationship?.id, "Relatie-ID"),
  });
}
