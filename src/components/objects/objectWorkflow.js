import {
  createCustomerMutationKey,
  invokeCustomerPlatformMutation,
} from "@/components/customers/customerDossierUtils";

const OBJECT_TYPES = new Set([
  "office",
  "retail_hospitality",
  "industrial_logistics",
  "construction_site",
  "healthcare_education",
  "residential",
  "event_temporary",
  "parking",
  "other",
]);

const IDENTITY_FIELDS = new Set([
  "name",
  "object_type",
  "address",
  "street_name",
  "house_number",
  "house_number_addition",
  "postal_code",
  "city",
  "country_code",
  "country_name",
  "latitude",
  "longitude",
  "geocoding_status",
  "bag_address_id",
  "region",
]);

const OPERATIONS_FIELDS = new Set([
  "parking_instruction",
  "entry_instruction",
  "walking_instruction",
  "object_notes",
  "safety_notes",
  "show_on_mobile_map",
  "mobile_map_priority",
  "notes",
]);

const GEOCODING_STATUSES = new Set(["unverified", "verified", "manual"]);
const OBJECT_STATUSES = new Set(["active", "inactive", "archived"]);
const OPERATION_LONG_TEXT_FIELDS = [
  "parking_instruction",
  "entry_instruction",
  "walking_instruction",
  "object_notes",
  "safety_notes",
  "notes",
];
function requiredText(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${label} is verplicht.`);
  return normalized;
}

function mutationContext({ objectId, customerId, expectedVersion, invoke }, action) {
  const normalizedObjectId = requiredText(objectId, "Object-ID");
  const normalizedCustomerId = requiredText(customerId, "Klant-ID");
  const version = Number(expectedVersion);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("De actuele objectversie ontbreekt. Vernieuw de pagina en probeer opnieuw.");
  }
  const mutationInvoke = invoke || invokeCustomerPlatformMutation;
  if (typeof mutationInvoke !== "function") throw new Error("De objectmutatie kan niet worden uitgevoerd.");
  return {
    action,
    objectId: normalizedObjectId,
    customerId: normalizedCustomerId,
    expectedVersion: version,
    invoke: mutationInvoke,
  };
}

function pickedForm(form, fields, emptyMessage) {
  if (!form || typeof form !== "object" || Array.isArray(form)) throw new Error(emptyMessage);
  const data = Object.fromEntries(Object.entries(form).filter(([field]) => fields.has(field)));
  if (!Object.keys(data).length) throw new Error(emptyMessage);
  return data;
}

function coordinate(value, minimum, maximum, label) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${label} is ongeldig.`);
  }
  return number;
}

function identityData(form) {
  const data = pickedForm(form, IDENTITY_FIELDS, "Vul objectgegevens in.");
  if (Object.hasOwn(data, "name")) {
    data.name = requiredText(data.name, "Objectnaam");
    if (data.name.length > 160) throw new Error("Objectnaam mag maximaal 160 tekens bevatten.");
  }
  if (Object.hasOwn(data, "address")) {
    data.address = requiredText(data.address, "Objectadres");
    if (data.address.length > 320) throw new Error("Objectadres mag maximaal 320 tekens bevatten.");
  }
  if (Object.hasOwn(data, "object_type")) {
    data.object_type = requiredText(data.object_type, "Objecttype");
    if (!OBJECT_TYPES.has(data.object_type)) throw new Error("Kies een geldig objecttype.");
  }
  if (Object.hasOwn(data, "country_code")) {
    data.country_code = String(data.country_code ?? "").trim().toUpperCase() || null;
    if (data.country_code && !/^[A-Z]{2}$/.test(data.country_code)) {
      throw new Error("Landcode moet uit twee letters bestaan.");
    }
  }
  if (Object.hasOwn(data, "postal_code") && data.postal_code != null) {
    data.postal_code = String(data.postal_code).trim().toUpperCase() || null;
  }
  if (Object.hasOwn(data, "latitude")) data.latitude = coordinate(data.latitude, -90, 90, "Breedtegraad");
  if (Object.hasOwn(data, "longitude")) data.longitude = coordinate(data.longitude, -180, 180, "Lengtegraad");
  const hasLatitude = Object.hasOwn(data, "latitude");
  const hasLongitude = Object.hasOwn(data, "longitude");
  if (hasLatitude !== hasLongitude) {
    throw new Error("Vul breedte- en lengtegraad samen in.");
  }
  if (hasLatitude && ((data.latitude === null) !== (data.longitude === null))) {
    throw new Error("Vul breedte- en lengtegraad samen in.");
  }
  if (Object.hasOwn(data, "geocoding_status")) {
    data.geocoding_status = String(data.geocoding_status ?? "").trim() || "unverified";
    if (!GEOCODING_STATUSES.has(data.geocoding_status)) throw new Error("Ongeldige geocodestatus.");
    if (data.geocoding_status !== "unverified" && (!hasLatitude || data.latitude === null)) {
      throw new Error("Een geverifieerde of handmatige locatie vereist coördinaten.");
    }
  }
  return data;
}

function operationsData(form) {
  const data = pickedForm(form, OPERATIONS_FIELDS, "Vul operationele objectgegevens in.");
  for (const field of OPERATION_LONG_TEXT_FIELDS) {
    if (!Object.hasOwn(data, field) || data[field] == null) continue;
    if (typeof data[field] !== "string") throw new Error(`${field} moet tekst zijn.`);
    data[field] = data[field].trim() || null;
    if (data[field]?.length > 20_000) throw new Error(`${field} mag maximaal 20000 tekens bevatten.`);
  }
  for (const field of ["show_on_mobile_map"]) {
    if (Object.hasOwn(data, field) && typeof data[field] !== "boolean") {
      throw new Error(`${field} moet ja of nee zijn.`);
    }
  }
  if (Object.hasOwn(data, "mobile_map_priority")) {
    const priority = Number(data.mobile_map_priority);
    if (!Number.isInteger(priority) || priority < -1_000 || priority > 1_000) {
      throw new Error("Kaartprioriteit moet een geheel getal tussen -1000 en 1000 zijn.");
    }
    data.mobile_map_priority = priority;
  }
  return data;
}

async function performMutation({ action, objectId, customerId, expectedVersion, invoke, data, idempotencyKey }) {
  return invoke({
    action,
    object_id: objectId,
    customer_id: customerId,
    expected_version: expectedVersion,
    idempotency_key: idempotencyKey || createCustomerMutationKey(action),
    ...(data ? { data } : {}),
  });
}

export async function updateCustomerObjectIdentity(input) {
  const context = mutationContext(input || {}, "update_customer_object_identity");
  return performMutation({
    ...context,
    data: identityData(input?.form),
    idempotencyKey: input?.idempotencyKey,
  });
}

export async function updateCustomerObjectOperations(input) {
  const context = mutationContext(input || {}, "update_customer_object_operations");
  return performMutation({
    ...context,
    data: operationsData(input?.form),
    idempotencyKey: input?.idempotencyKey,
  });
}

export async function setCustomerObjectStatus(input) {
  const context = mutationContext(input || {}, "set_customer_object_status");
  const status = requiredText(input?.status, "Objectstatus");
  if (!OBJECT_STATUSES.has(status)) throw new Error("Kies een geldige objectstatus.");
  const reason = String(input?.reason ?? "").trim();
  if (status === "archived" && !reason) throw new Error("Reden voor archiveren is verplicht.");
  if (reason.length > 1_000) throw new Error("Reden mag maximaal 1000 tekens bevatten.");
  return context.invoke({
    action: context.action,
    object_id: context.objectId,
    customer_id: context.customerId,
    expected_version: context.expectedVersion,
    idempotency_key: input?.idempotencyKey || createCustomerMutationKey(context.action),
    status,
    reason: reason || undefined,
  });
}
