import {
  OBJECT_TYPE_OPTIONS,
} from "./customerObjectConfig";

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNullable(value) {
  return cleanText(value) || null;
}

function coordinate(value, minimum, maximum, field) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${field} bevat geen geldige coördinaat.`);
  }
  return number;
}

function normalizeCode(value) {
  const code = cleanText(value).toUpperCase().replace(/\s+/g, "-");
  if (!code) return null;
  if (code.length > 50) throw new Error("De objectcode mag maximaal 50 tekens bevatten.");
  if (!/^[A-Z0-9][A-Z0-9._/-]*$/.test(code)) {
    throw new Error("Gebruik voor de objectcode alleen letters, cijfers, punten, schuine strepen, liggende streepjes of koppeltekens.");
  }
  return code;
}

/**
 * Creates one guarded concept object. Detailed instructions, credentials,
 * checkpoints, contacts, contracts and planning deliberately remain outside
 * this first object mutation.
 *
 * @param {{
 *   customerId: string,
 *   form?: Record<string, unknown>,
 *   idempotencyKey: string,
 *   invoke: (payload: Record<string, unknown>) => Promise<any>
 * }} options
 */
export async function createCustomerObject({
  customerId,
  form = {},
  idempotencyKey,
  invoke,
}) {
  if (!customerId) throw new Error("customerId is verplicht.");
  if (!idempotencyKey) throw new Error("idempotencyKey is verplicht.");
  if (typeof invoke !== "function") throw new Error("Een invoke-functie is verplicht.");

  const name = cleanText(form.name);
  const address = cleanText(form.address);
  const objectType = cleanText(form.object_type);
  const allowedTypes = new Set(OBJECT_TYPE_OPTIONS.map(option => option.key));
  if (!name) throw new Error("Vul een objectnaam in.");
  if (name.length > 160) throw new Error("De objectnaam mag maximaal 160 tekens bevatten.");
  if (!objectType || !allowedTypes.has(objectType)) throw new Error("Kies een geldig objecttype.");
  if (!address) throw new Error("Vul het adres van het object in.");

  const latitude = coordinate(form.latitude, -90, 90, "Breedtegraad");
  const longitude = coordinate(form.longitude, -180, 180, "Lengtegraad");
  const geocodingStatus = latitude !== null && longitude !== null && form.geocoding_status === "verified"
    ? "verified"
    : "unverified";

  const result = await invoke({
    action: "create_customer_object",
    idempotency_key: idempotencyKey,
    expected_version: 0,
    customer_id: customerId,
    duplicate_reviewed: Boolean(form.duplicate_reviewed),
    data: {
      object_code: normalizeCode(form.object_code),
      name,
      object_type: objectType,
      address,
      street_name: cleanNullable(form.street_name),
      house_number: cleanNullable(form.house_number),
      house_number_addition: cleanNullable(form.house_number_addition),
      postal_code: cleanText(form.postal_code).toUpperCase() || null,
      city: cleanNullable(form.city),
      country_code: cleanText(form.country_code).toUpperCase() || "NL",
      country_name: cleanText(form.country_name) || "Nederland",
      latitude,
      longitude,
      geocoding_status: geocodingStatus,
      bag_address_id: cleanNullable(form.bag_address_id),
      region: cleanNullable(form.region),
      status: "concept",
    },
  });

  if (!result?.object?.id) throw new Error("Het object is niet correct aangemaakt.");
  return result;
}
