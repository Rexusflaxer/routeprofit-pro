import { createCustomerMutationKey } from "@/components/customers/customerDossierUtils";
import { base44 } from "@/api/base44Client";

async function invoke(payload) {
  const response = await base44.functions.invoke("objectRelationshipsApi", payload);
  const result = response?.data?.data || response?.data || {};
  if (result.error) throw new Error(result.error);
  return result;
}

const required = (value, label) => {
  const result = String(value || "").trim();
  if (!result) throw new Error(`${label} ontbreekt.`);
  return result;
};

export const createObjectRelationshipKey = () => createCustomerMutationKey("create_object_relationship");
export const updateObjectRelationshipKey = () => createCustomerMutationKey("update_object_relationship");
export const archiveObjectRelationshipKey = () => createCustomerMutationKey("archive_object_relationship");

export function listObjectRelationships({ customerId, objectId }) {
  return invoke({ action: "list_object_relationships", customer_id: required(customerId, "Klant-ID"), object_id: required(objectId, "Object-ID") });
}

export function saveObjectRelationship({ customerId, objectId, relationship, form, idempotencyKey }) {
  return invoke({
    action: relationship ? "update_object_relationship" : "create_object_relationship",
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: relationship?.version || 0,
    customer_id: required(customerId, "Klant-ID"), object_id: required(objectId, "Object-ID"),
    ...(relationship ? { relationship_id: relationship.id } : {}), data: form,
  });
}

export function archiveObjectRelationship({ customerId, objectId, relationship, idempotencyKey }) {
  return invoke({ action: "archive_object_relationship", idempotency_key: idempotencyKey, expected_version: relationship.version, customer_id: customerId, object_id: objectId, relationship_id: relationship.id });
}