import {
  createCustomerMutationKey,
  invokeCustomerPlatformMutation,
} from "@/components/customers/customerDossierUtils";
import {
  AVAILABILITY_OPTIONS,
  WARNING_RELATIONSHIP_OPTIONS,
  WEEKDAY_OPTIONS,
} from "./objectWarningAddressConfig";

const RELATIONSHIP_TYPES = new Set(WARNING_RELATIONSHIP_OPTIONS.map(option => option.key));
const AVAILABILITY_MODES = new Set(AVAILABILITY_OPTIONS.map(option => option.key));
const WEEKDAYS = new Set(WEEKDAY_OPTIONS.map(option => option.key));

function cleanText(value) {
  return String(value ?? "").trim();
}

function requiredText(value, label) {
  const normalized = cleanText(value);
  if (!normalized) throw new Error(`${label} is verplicht.`);
  return normalized;
}

function validEmail(value) {
  const normalized = cleanText(value).toLowerCase();
  if (normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Vul een geldig e-mailadres in.");
  }
  return normalized;
}

function validPhone(value, label, required = true) {
  const normalized = cleanText(value);
  if (!normalized) {
    if (required) throw new Error(`${label} is verplicht.`);
    return "";
  }
  const digits = normalized.replace(/\D/g, "");
  if (!/^\+?[0-9\s()./-]+$/.test(normalized) || digits.length < 7 || digits.length > 15) {
    throw new Error(`Vul een geldig ${label.toLowerCase()} in.`);
  }
  return normalized;
}

function validOrder(value) {
  const order = Number(value);
  if (!Number.isInteger(order) || order < 1 || order > 999) {
    throw new Error("Belvolgorde moet een geheel getal tussen 1 en 999 zijn.");
  }
  return order;
}

function normalizedAvailability(form) {
  const availabilityMode = cleanText(form?.availability_mode) || "schedule";
  if (!AVAILABILITY_MODES.has(availabilityMode)) {
    throw new Error("Kies een geldige bereikbaarheid.");
  }
  if (availabilityMode === "always") {
    return { availability_mode: "always", not_call_periods: [] };
  }
  if (availabilityMode === "not_call_periods") {
    const source = Array.isArray(form?.not_call_periods) ? form.not_call_periods[0] : null;
    const days = [...new Set(
      (Array.isArray(source?.days) ? source.days : [])
        .map(cleanText)
        .filter(day => WEEKDAYS.has(day)),
    )];
    const startTime = cleanText(source?.start_time);
    const endTime = cleanText(source?.end_time);
    if (!days.length) throw new Error("Kies minimaal één dag voor de niet-bellenperiode.");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
      throw new Error("Vul een geldige begin- en eindtijd in.");
    }
    if (startTime === endTime) {
      throw new Error("Begin- en eindtijd van de niet-bellenperiode mogen niet gelijk zijn.");
    }
    return {
      availability_mode: "not_call_periods",
      not_call_periods: [{ days, start_time: startTime, end_time: endTime }],
    };
  }

  const source = Array.isArray(form?.availability_periods) ? form.availability_periods : [];
  if (!source.length) throw new Error("Teken minimaal één bereikbaarheidsblok in het weekrooster.");
  const periods = source.map(period => {
    const days = [...new Set((Array.isArray(period?.days) ? period.days : []).map(cleanText).filter(day => WEEKDAYS.has(day)))];
    const startTime = cleanText(period?.start_time), endTime = cleanText(period?.end_time), kind = cleanText(period?.kind);
    if (days.length !== 1 || !["available", "emergency_only"].includes(kind)) throw new Error("Het weekrooster bevat een ongeldig blok.");
    if (!/^([01]\d|2[0-3]):(?:00|30)$/.test(startTime) || !/^(?:([01]\d|2[0-3]):(?:00|30)|24:00)$/.test(endTime) || startTime >= endTime) throw new Error("Roosterblokken moeten op stappen van 30 minuten liggen.");
    return { days, start_time: startTime, end_time: endTime, kind };
  });
  return { availability_mode: "schedule", availability_periods: periods, not_call_periods: [] };
}

function assignmentData(form) {
  const relationshipType = requiredText(form?.relationship_type, "Relatie tot het object");
  if (!RELATIONSHIP_TYPES.has(relationshipType)) {
    throw new Error("Kies een geldige relatie tot het object.");
  }
  const relationshipLabel = requiredText(form?.relationship_label, "Relatie tot het object");
  if (relationshipLabel.length > 120) {
    throw new Error("Relatie tot het object mag maximaal 120 tekens bevatten.");
  }
  return {
    relationship_type: relationshipType,
    relationship_label: relationshipLabel,
    call_order: validOrder(form?.call_order),
    ...normalizedAvailability(form),
  };
}

function mutationInvoke(input) {
  return input?.invoke || invokeCustomerPlatformMutation;
}

export function createObjectWarningAddressKey() {
  return createCustomerMutationKey("create_object_warning_address");
}

export function updateObjectWarningAddressKey() {
  return createCustomerMutationKey("update_object_warning_address");
}

export function deleteObjectWarningAddressKey() {
  return createCustomerMutationKey("delete_object_warning_address");
}

export function reorderObjectWarningAddressesKey() {
  return createCustomerMutationKey("reorder_object_warning_addresses");
}

export function upsertWarningAvailabilityOverridesKey() {
  return createCustomerMutationKey("upsert_warning_availability_overrides");
}

export function deleteWarningAvailabilityOverrideKey() {
  return createCustomerMutationKey("delete_warning_availability_override");
}

export async function listObjectWarningAddresses({ customerId, objectId, invoke = undefined } = {}) {
  return mutationInvoke({ invoke })({
    action: "list_object_warning_addresses",
    customer_id: requiredText(customerId, "Klant-ID"),
    object_id: requiredText(objectId, "Object-ID"),
  });
}

export async function listObjectLogbook({ customerId, objectId, search = "", page = 1, pageSize = 50, invoke = undefined } = {}) {
  return mutationInvoke({ invoke })({
    action: "list_object_logbook",
    customer_id: requiredText(customerId, "Klant-ID"),
    object_id: requiredText(objectId, "Object-ID"),
    search: cleanText(search).slice(0, 120) || null,
    page: Math.max(1, Number.parseInt(String(page), 10) || 1),
    page_size: Math.min(100, Math.max(1, Number.parseInt(String(pageSize), 10) || 50)),
  });
}

async function createContactForWarningAddress({ customerId, form, idempotencyKey, invoke }) {
  const firstName = requiredText(form?.first_name, "Voornaam");
  const middleName = cleanText(form?.middle_name);
  const lastName = requiredText(form?.last_name, "Achternaam");
  const displayName = [firstName, middleName, lastName].filter(Boolean).join(" ");
  const email = validEmail(form?.email);
  const primaryPhone = validPhone(form?.primary_phone, "Primair telefoonnummer");
  const secondaryPhone = validPhone(form?.secondary_phone, "Alternatief telefoonnummer", false);

  const contactResult = await invoke({
    action: "create_customer_contact",
    idempotency_key: `${idempotencyKey}:contact`,
    expected_version: 0,
    customer_id: customerId,
    data: {
      display_name: displayName,
      first_name: firstName,
      middle_name: middleName || null,
      last_name: lastName,
      job_title: "Waarschuwingscontact",
      preferred_language: "nl",
      preferred_channel: "phone",
      is_primary: false,
      status: "active",
    },
  });
  const contact = contactResult?.contact;
  if (!contact?.id) throw new Error("De contactpersoon is niet correct aangemaakt.");

  const primaryResult = await invoke({
    action: "create_contact_point",
    idempotency_key: `${idempotencyKey}:primary-phone`,
    expected_version: 0,
    contact_id: contact.id,
    data: {
      point_type: "phone",
      label: "Waarschuwingsnummer",
      value: primaryPhone,
      is_primary: true,
      purposes: ["warning"],
      status: "active",
    },
  });
  if (!primaryResult?.contact_point?.id) {
    throw new Error("Het primaire telefoonnummer is niet correct aangemaakt.");
  }

  let secondaryPointId = null;
  if (secondaryPhone) {
    const secondaryResult = await invoke({
      action: "create_contact_point",
      idempotency_key: `${idempotencyKey}:secondary-phone`,
      expected_version: 0,
      contact_id: contact.id,
      data: {
        point_type: "phone",
        label: "Alternatief waarschuwingsnummer",
        value: secondaryPhone,
        is_primary: false,
        purposes: ["warning"],
        status: "active",
      },
    });
    secondaryPointId = secondaryResult?.contact_point?.id || null;
  }

  if (email) {
    await invoke({
      action: "create_contact_point",
      idempotency_key: `${idempotencyKey}:email`,
      expected_version: 0,
      contact_id: contact.id,
      data: {
        point_type: "email",
        label: "Zakelijk",
        value: email,
        is_primary: true,
        purposes: ["warning"],
        status: "active",
      },
    });
  }

  return {
    contactId: contact.id,
    primaryPointId: primaryResult.contact_point.id,
    secondaryPointId,
  };
}

async function resolveExistingContactPoints({ form, idempotencyKey, invoke }) {
  const contactId = requiredText(form?.contact_id, "Contactpersoon");
  let primaryPointId = cleanText(form?.primary_contact_point_id);
  let secondaryPointId = cleanText(form?.secondary_contact_point_id) || null;

  if (!primaryPointId) {
    const phone = validPhone(form?.primary_phone, "Primair telefoonnummer");
    const pointResult = await invoke({
      action: "create_contact_point",
      idempotency_key: `${idempotencyKey}:existing-primary-phone`,
      expected_version: 0,
      contact_id: contactId,
      data: {
        point_type: "phone",
        label: "Waarschuwingsnummer",
        value: phone,
        is_primary: false,
        purposes: ["warning"],
        status: "active",
      },
    });
    primaryPointId = pointResult?.contact_point?.id || "";
  }
  if (!primaryPointId) throw new Error("Kies of vul een primair telefoonnummer in.");
  if (secondaryPointId === primaryPointId) secondaryPointId = null;
  return { contactId, primaryPointId, secondaryPointId };
}

export async function createObjectWarningAddress(input = {}) {
  const customerId = requiredText(input.customerId, "Klant-ID");
  const objectId = requiredText(input.objectId, "Object-ID");
  const form = input.form || {};
  const invoke = mutationInvoke(input);
  const idempotencyKey = requiredText(input.idempotencyKey, "Mutatiesleutel");
  const contactMode = cleanText(form.contact_mode) || "new";
  if (!["new", "existing"].includes(contactMode)) throw new Error("Kies een geldige contactoptie.");
  const assignment = assignmentData(form);

  const contact = contactMode === "new"
    ? await createContactForWarningAddress({ customerId, form, idempotencyKey, invoke })
    : await resolveExistingContactPoints({ form, idempotencyKey, invoke });

  return invoke({
    action: "create_object_warning_address",
    idempotency_key: `${idempotencyKey}:assignment`,
    expected_version: 0,
    customer_id: customerId,
    object_id: objectId,
    data: {
      contact_id: contact.contactId,
      primary_contact_point_id: contact.primaryPointId,
      secondary_contact_point_id: contact.secondaryPointId,
      ...assignment,
    },
  });
}

export async function deleteObjectWarningAddress(input = {}) {
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("De actuele versie ontbreekt. Vernieuw de pagina en probeer opnieuw.");
  return mutationInvoke(input)({
    action: "delete_object_warning_address",
    idempotency_key: requiredText(input.idempotencyKey, "Mutatiesleutel"),
    expected_version: expectedVersion,
    customer_id: requiredText(input.customerId, "Klant-ID"),
    object_id: requiredText(input.objectId, "Object-ID"),
    warning_address_id: requiredText(input.warningAddressId, "Waarschuwingsadres-ID"),
  });
}

export async function reorderObjectWarningAddresses(input = {}) {
  const rows = Array.isArray(input.orderedRows) ? input.orderedRows : [];
  if (!rows.length) throw new Error("Er zijn geen waarschuwingsadressen om te sorteren.");
  const expectedOrderVersion = Number(input.expectedOrderVersion);
  if (!Number.isInteger(expectedOrderVersion) || expectedOrderVersion < 0) {
    throw new Error("De actuele belvolgorde ontbreekt. Vernieuw de pagina en probeer opnieuw.");
  }
  return mutationInvoke(input)({
    action: "reorder_object_warning_addresses",
    idempotency_key: requiredText(input.idempotencyKey, "Mutatiesleutel"),
    expected_version: 0,
    customer_id: requiredText(input.customerId, "Klant-ID"),
    object_id: requiredText(input.objectId, "Object-ID"),
    ordered_ids: rows.map(row => row.id),
    expected_versions: Object.fromEntries(rows.map(row => [row.id, Number(row.version)])),
    expected_order_version: expectedOrderVersion,
  });
}

export async function updateObjectWarningAddress(input = {}) {
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error("De actuele versie ontbreekt. Vernieuw de pagina en probeer opnieuw.");
  }
  const form = input.form || {};
  const invoke = mutationInvoke(input);
  const idempotencyKey = input.idempotencyKey || updateObjectWarningAddressKey();
  let primaryContactPointId = cleanText(form.primary_contact_point_id);
  if (!primaryContactPointId) {
    const contactId = requiredText(form.contact_id, "Contactpersoon");
    const phone = validPhone(form.primary_phone, "Primair telefoonnummer");
    const pointResult = await invoke({
      action: "create_contact_point",
      idempotency_key: `${idempotencyKey}:replacement-primary-phone`,
      expected_version: 0,
      contact_id: contactId,
      data: {
        point_type: "phone",
        label: "Waarschuwingsnummer",
        value: phone,
        is_primary: false,
        purposes: ["warning"],
        status: "active",
      },
    });
    primaryContactPointId = pointResult?.contact_point?.id || "";
  }
  if (!primaryContactPointId) throw new Error("Het vervangende telefoonnummer is niet correct aangemaakt.");
  return invoke({
    action: "update_object_warning_address",
    idempotency_key: idempotencyKey,
    expected_version: expectedVersion,
    customer_id: requiredText(input.customerId, "Klant-ID"),
    object_id: requiredText(input.objectId, "Object-ID"),
    warning_address_id: requiredText(input.warningAddressId, "Waarschuwingsadres-ID"),
    data: {
      primary_contact_point_id: primaryContactPointId,
      secondary_contact_point_id: cleanText(form.secondary_contact_point_id) || null,
      ...assignmentData(form),
    },
  });
}

export async function upsertWarningAvailabilityOverrides(input = {}) {
  const record = input.record || {};
  const drafts = input.drafts && typeof input.drafts === "object" ? input.drafts : {};
  const items = Object.entries(drafts).map(([date, slots]) => ({
    date,
    availability_periods: input.slotsToPeriods(slots),
  }));
  if (!items.length) throw new Error("Er zijn geen aangepaste datums om op te slaan.");
  return mutationInvoke(input)({
    action: "upsert_warning_availability_overrides",
    idempotency_key: requiredText(input.idempotencyKey, "Mutatiesleutel"),
    expected_version: Number(record.version),
    customer_id: requiredText(record.customer_id, "Klant-ID"),
    object_id: requiredText(record.object_id, "Object-ID"),
    warning_address_id: requiredText(record.id, "Waarschuwingsadres-ID"),
    expected_versions: Object.fromEntries((record.specific_availability_overrides || []).map(item => [item.id, Number(item.version)])),
    data: {
      items,
      reason: cleanText(input.reason) || null,
    },
  });
}

export async function deleteWarningAvailabilityOverride(input = {}) {
  const record = input.record || {};
  const override = input.override || {};
  return mutationInvoke(input)({
    action: "delete_warning_availability_override",
    idempotency_key: requiredText(input.idempotencyKey, "Mutatiesleutel"),
    expected_version: Number(record.version),
    customer_id: requiredText(record.customer_id, "Klant-ID"),
    object_id: requiredText(record.object_id, "Object-ID"),
    warning_address_id: requiredText(record.id, "Waarschuwingsadres-ID"),
    override_id: requiredText(override.id, "Uitzondering-ID"),
    override_expected_version: Number(override.version),
    date: requiredText(input.date, "Datum"),
  });
}
