function normalizedId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function activeRolesForContact(contactId, roles) {
  return (Array.isArray(roles) ? roles : []).filter(role => (
    role?.contact_id === contactId
    && (!role.status || role.status === "active")
  ));
}

function allRolesForContact(contactId, roles) {
  return (Array.isArray(roles) ? roles : []).filter(role => role?.contact_id === contactId);
}

/**
 * Resolves the object scope represented by CustomerContactRole records.
 *
 * An active role without object IDs is customer-wide. Contacts without an
 * active role predate explicit object scoping and remain customer-wide for
 * backwards compatibility.
 */
export function resolveContactObjectScope(roles = [], contactId) {
  const activeRoles = activeRolesForContact(contactId, roles);
  if (!activeRoles.length) {
    if (allRolesForContact(contactId, roles).length > 0) {
      return {
        mode: "none",
        isAllObjects: false,
        objectIds: [],
        source: "inactive",
      };
    }
    return {
      mode: "all",
      isAllObjects: true,
      objectIds: [],
      source: "legacy",
    };
  }

  const roleObjectIds = activeRoles.map(role => (
    Array.isArray(role.object_ids)
      ? [...new Set(role.object_ids.map(normalizedId).filter(Boolean))]
      : []
  ));

  if (roleObjectIds.some(objectIds => objectIds.length === 0)) {
    return {
      mode: "all",
      isAllObjects: true,
      objectIds: [],
      source: "role",
    };
  }

  return {
    mode: "selected",
    isAllObjects: false,
    objectIds: [...new Set(roleObjectIds.flat())],
    source: "role",
  };
}

export function contactMatchesObject(roles = [], contactId, objectId = "all") {
  const normalizedObjectId = normalizedId(objectId);
  if (!normalizedObjectId || normalizedObjectId === "all") return true;

  const scope = resolveContactObjectScope(roles, contactId);
  return scope.isAllObjects || scope.objectIds.includes(normalizedObjectId);
}

export function formatContactObjectScope(roles = [], contactId, objects = []) {
  const scope = resolveContactObjectScope(roles, contactId);
  if (scope.isAllObjects) return "Alle objecten";
  if (scope.mode === "none") return "Geen actieve objectbevoegdheid";

  const objectsById = new Map();
  for (const object of Array.isArray(objects) ? objects : []) {
    const id = normalizedId(object?.id);
    if (id) objectsById.set(id, object);
  }
  const names = scope.objectIds.map(objectId => {
    const object = objectsById.get(objectId);
    return object?.name || object?.object_code || `Onbekend object (${objectId})`;
  });

  return names.join(", ");
}
