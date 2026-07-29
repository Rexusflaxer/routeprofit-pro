function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeObjectIds(form) {
  if (!form?.object_scope || form.object_scope === "all") return [];
  if (form.object_scope !== "selected") {
    throw new Error("De objectbevoegdheid is ongeldig.");
  }

  const objectIds = [...new Set(
    (Array.isArray(form.object_ids) ? form.object_ids : [])
      .map(value => cleanText(String(value ?? "")))
      .filter(Boolean),
  )];
  if (!objectIds.length) {
    throw new Error("Selecteer minimaal één object.");
  }
  return objectIds;
}

function effectiveRoleKeys(form, makePrimary) {
  const configuredRoles = Array.isArray(form?.roles)
    ? form.roles.map(cleanText).filter(role => role && role !== "primary")
    : [];
  const roles = new Set(["operational", ...configuredRoles]);
  if (makePrimary) roles.add("primary");
  return [...roles];
}

/**
 * Creates the records that together form one customer contact.
 *
 * `invoke` is deliberately injected so callers can use the guarded customer
 * platform mutation boundary while unit tests can verify every request.
 *
 * @param {{
 *   customerId: string,
 *   customer?: Record<string, any>,
 *   existingContacts?: Array<Record<string, any>>,
 *   form?: Record<string, any>,
 *   idempotencyKey: string,
 *   invoke: (payload: Record<string, any>) => Promise<any>
 * }} options
 */
export async function createCustomerContactRecords({
  customerId,
  customer = {},
  existingContacts = [],
  form = {},
  idempotencyKey,
  invoke,
}) {
  if (!customerId) throw new Error("customerId is verplicht.");
  if (!idempotencyKey) throw new Error("idempotencyKey is verplicht.");
  if (typeof invoke !== "function") throw new Error("Een invoke-functie is verplicht.");

  const firstName = cleanText(form.first_name);
  const namePrefix = cleanText(form.name_prefix);
  const lastName = cleanText(form.last_name);
  const displayName = [firstName, namePrefix, lastName].filter(Boolean).join(" ");
  if (!firstName || !lastName) {
    throw new Error("Voornaam en achternaam zijn verplicht.");
  }

  const email = cleanText(form.email);
  const phone = cleanText(form.phone);
  const jobTitle = cleanText(form.job_title);
  if (!jobTitle) throw new Error("Selecteer of vul een functie in.");
  if (!email && !phone) throw new Error("Vul een e-mailadres of telefoonnummer in.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Vul een geldig e-mailadres in.");
  }
  const makePrimary = Boolean(form.is_primary || existingContacts.length === 0);
  const objectIds = normalizeObjectIds(form);
  const roleKeys = effectiveRoleKeys(form, makePrimary);

  const contactResult = await invoke({
    action: "create_customer_contact",
    idempotency_key: `${idempotencyKey}:contact`,
    expected_version: 0,
    customer_id: customerId,
    data: {
      display_name: displayName,
      first_name: firstName || null,
      middle_name: namePrefix || null,
      last_name: lastName || null,
      job_title: jobTitle,
      preferred_language: customer.preferred_language || customer.language || "nl",
      preferred_channel: email ? "email" : phone ? "phone" : null,
      is_primary: makePrimary,
      status: "active",
    },
  });

  const contact = contactResult?.contact;
  if (!contact?.id) {
    throw new Error("De contactpersoon is niet correct aangemaakt.");
  }

  const pointResults = [];
  if (email) {
    pointResults.push(await invoke({
      action: "create_contact_point",
      idempotency_key: `${idempotencyKey}:email`,
      expected_version: 0,
      contact_id: contact.id,
      data: {
        point_type: "email",
        label: "Zakelijk",
        value: email,
        is_primary: true,
        purposes: roleKeys,
        status: "active",
      },
    }));
  }
  if (phone) {
    pointResults.push(await invoke({
      action: "create_contact_point",
      idempotency_key: `${idempotencyKey}:phone`,
      expected_version: 0,
      contact_id: contact.id,
      data: {
        point_type: "phone",
        label: "Zakelijk",
        value: phone,
        is_primary: true,
        purposes: roleKeys,
        status: "active",
      },
    }));
  }

  const roleResults = [];
  for (const role of roleKeys) {
    roleResults.push(await invoke({
      action: "create_contact_role",
      idempotency_key: `${idempotencyKey}:role:${role}`,
      expected_version: 0,
      contact_id: contact.id,
      data: {
        role,
        object_ids: objectIds,
        is_primary: role === "primary",
        status: "active",
      },
    }));
  }

  return { contact, pointResults, roleResults };
}
