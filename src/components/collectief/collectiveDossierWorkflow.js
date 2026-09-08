import {
  createCustomerMutationKey,
  invokeCustomerPlatformMutation,
  invokeCustomerPlatformRead,
} from "@/components/customers/customerDossierUtils";

export const COLLECTIVE_TYPES = {
  bedrijventerrein: "Bedrijventerrein",
  woonwijk: "Woonwijk",
  bedrijfsverzamelgebouw: "Bedrijfsverzamelgebouw",
  regio_groep: "Gebied / groep",
};

export const COLLECTIVE_TABS = [
  { key: "participants", label: "Objecten & deelnemers" },
  { key: "tasks", label: "Taken" },
  { key: "security-plan", label: "Beveiligingsplan" },
  { key: "modules", label: "Modules" },
  { key: "handbook", label: "Handboek" },
  { key: "floor-plan", label: "Plattegrond" },
  { key: "map-area", label: "Kaart & terrein" },
  { key: "warning-addresses", label: "Waarschuwingsadressen" },
  { key: "relationships", label: "Relaties" },
  { key: "keys", label: "Sleutels" },
  { key: "installations", label: "Installaties" },
  { key: "logbook", label: "Logboek" },
];

export function listCollectiveDossiers() {
  return invokeCustomerPlatformRead({ action: "list_collective_dossiers" });
}

export function getCollectiveDossier(collectiveId) {
  return invokeCustomerPlatformRead({ action: "get_collective_dossier", collective_id: collectiveId });
}

/** Retry the same operation with its original key; an edited payload is a new operation. */
export function collectiveMutationRequest(action, payload, retryRef) {
  const signature = JSON.stringify({ action, ...payload });
  if (!retryRef.current || retryRef.current.signature !== signature) {
    retryRef.current = { signature, key: createCustomerMutationKey(action) };
  }
  return invokeCustomerPlatformMutation({ action, ...payload, idempotency_key: retryRef.current.key });
}

export function collectiveParentOptions(items = [], currentId) {
  const excluded = new Set(currentId ? [currentId] : []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (excluded.has(item.parent_collectief_id) && !excluded.has(item.id)) {
        excluded.add(item.id);
        changed = true;
      }
    }
  }
  return items.filter(item => !excluded.has(item.id) && item.status !== "archived");
}

export function collectiveManagerId(collective) {
  // Explicit null means manager-free, even when a legacy billing customer remains.
  return Object.prototype.hasOwnProperty.call(collective || {}, "manager_customer_id")
    ? collective.manager_customer_id || ""
    : collective?.customer_id || "";
}

export function collectiveMemberRows(dossier = {}, { includeIndirect = false } = {}) {
  const objects = new Map((dossier.objects || []).map(object => [object.id, object]));
  const customers = new Map((dossier.customers || []).map(customer => [customer.id, customer]));
  const memberships = [...(dossier.memberships || []), ...(includeIndirect ? dossier.indirect_memberships || [] : [])];
  const seen = new Set(memberships.map(row => `${row.collective_id || dossier.collective?.id}:${row.object_id}`));
  // Display legacy links without changing the separate commercial object_ids scope.
  for (const objectId of dossier.collective?.object_ids || []) {
    const key = `${dossier.collective.id}:${objectId}`;
    if (!seen.has(key)) {
      memberships.push({ id: `legacy:${objectId}`, collective_id: dossier.collective.id, object_id: objectId, status: "active", legacy: true });
      seen.add(key);
    }
  }
  return memberships.map(membership => {
    const object = membership.object || objects.get(membership.object_id);
    const customer = membership.customer || customers.get(object?.customer_id);
    return { ...membership, object, customer, indirect: Boolean(membership.indirect || membership.collective_id && membership.collective_id !== dossier.collective?.id) };
  });
}

export function uniqueMemberCount(rows) {
  return new Set(rows.filter(row => row.status !== "inactive" && row.status !== "archived").map(row => row.object_id)).size;
}

export function activeRecord(record) {
  return record?.status !== "archived";
}
