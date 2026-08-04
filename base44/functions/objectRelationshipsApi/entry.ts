import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const TYPES = new Set(['pac', 'video_monitoring_center', 'security_installer', 'fire_safety_installer', 'camera_installer', 'access_control_installer', 'maintenance_provider', 'key_management', 'guarding_company', 'other']);
const text = value => String(value ?? '').trim();
const normalize = value => text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
const version = record => Number.isInteger(Number(record?.version)) && Number(record.version) > 0 ? Number(record.version) : 1;
const bounded = (value, label, max, required = false) => { const result = text(value); if (!result && required) fail(400, `${label} is verplicht`); if (result.length > max) fail(400, `${label} mag maximaal ${max} tekens bevatten`); return result || null; };

function safeOrganization(record) {
  return { id: record.id, name: record.name, relation_types: record.relation_types || [], website: record.website || null, logo_url: record.logo_url || null, certification: record.certification || null, source: record.source, status: record.status, version: version(record) };
}

function safeRelationship(record, organization) {
  return { id: record.id, customer_id: record.customer_id, object_id: record.object_id, organization_id: record.organization_id, relation_type: record.relation_type, custom_relation_label: record.custom_relation_label || null, reference_number: record.reference_number || null, phone: record.phone || null, email: record.email || null, notes: record.notes || null, status: record.status, version: version(record), organization: safeOrganization(organization) };
}

async function scope(base44, body, mutable = false) {
  const customerId = bounded(body.customer_id, 'Klant-ID', 200, true);
  const objectId = bounded(body.object_id, 'Object-ID', 200, true);
  const [customer, object] = await Promise.all([base44.asServiceRole.entities.Customer.get(customerId).catch(() => null), base44.asServiceRole.entities.SurveillanceObject.get(objectId).catch(() => null)]);
  if (!customer || !object) fail(404, 'Klant of object niet gevonden');
  if (object.customer_id !== customer.id) fail(409, 'Object hoort niet bij deze klant');
  if (mutable && (customer.status === 'archived' || object.status === 'archived')) fail(409, 'Gearchiveerde dossiers moeten eerst worden hersteld');
  return { customer, object };
}

async function organizationFor(base44, data, relationType) {
  if (text(data.organization_id)) {
    const organization = await base44.asServiceRole.entities.ThirdPartyOrganization.get(text(data.organization_id)).catch(() => null);
    if (!organization || organization.status !== 'active') fail(409, 'Deze instantie is niet beschikbaar');
    return organization;
  }
  const name = bounded(data.organization_name, 'Naam instantie', 200, true);
  const normalizedName = normalize(name);
  const matches = await base44.asServiceRole.entities.ThirdPartyOrganization.filter({ normalized_name: normalizedName, status: 'active' }, '+name', 10);
  if (matches.length > 1) fail(409, 'Meerdere instanties hebben dezelfde naam');
  if (matches[0]) {
    const types = Array.isArray(matches[0].relation_types) ? matches[0].relation_types : [];
    if (types.includes(relationType)) return matches[0];
    return base44.asServiceRole.entities.ThirdPartyOrganization.update(matches[0].id, { relation_types: [...new Set([...types, relationType])], version: version(matches[0]) + 1 });
  }
  const website = bounded(data.organization_website, 'Website', 2048);
  if (website && !/^https?:\/\//i.test(website)) fail(400, 'Website moet met http:// of https:// beginnen');
  return base44.asServiceRole.entities.ThirdPartyOrganization.create({ name, normalized_name: normalizedName, relation_types: [relationType], website, logo_url: null, certification: null, source: 'user_added', status: 'active', version: 1 });
}

async function appendEvent(base44, user, input) {
  return base44.asServiceRole.entities.CustomerEvent.create({ customer_id: input.customer_id, object_id: input.object_id, event_type: input.action.replaceAll('_', '.'), category: 'operations', action: input.action, actor_type: 'user', actor_id: user.id, actor_user_id: user.id, actor_name: user.full_name || user.email || 'Backofficegebruiker', outcome: 'success', summary: input.summary, source: 'objectRelationshipsApi', resource_type: 'ObjectRelationship', resource_id: input.resource_id, visibility: 'internal', occurred_at: new Date().toISOString(), idempotency_key: input.idempotency_key, payload: { action: input.action, result: { relationship_id: input.resource_id, customer_id: input.customer_id, object_id: input.object_id } } });
}

async function list(base44, body) {
  const { customer, object } = await scope(base44, body);
  const [relationships, organizations] = await Promise.all([base44.asServiceRole.entities.ObjectRelationship.filter({ customer_id: customer.id, object_id: object.id, status: 'active' }, '-updated_date', 500), base44.asServiceRole.entities.ThirdPartyOrganization.filter({ status: 'active' }, '+name', 2000)]);
  const byId = new Map(organizations.map(item => [item.id, item]));
  return { items: relationships.flatMap(item => byId.has(item.organization_id) ? [safeRelationship(item, byId.get(item.organization_id))] : []), organizations: organizations.map(safeOrganization) };
}

async function mutate(base44, user, action, body) {
  const { customer, object } = await scope(base44, body, true);
  const expectedVersion = Number(body.expected_version);
  const idempotencyKey = bounded(body.idempotency_key, 'Mutatiesleutel', 180, true);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) fail(400, 'expected_version is ongeldig');
  if (action === 'archive_object_relationship') {
    const current = await base44.asServiceRole.entities.ObjectRelationship.get(text(body.relationship_id)).catch(() => null);
    if (!current || current.object_id !== object.id || current.customer_id !== customer.id || current.status !== 'active') fail(409, 'Relatie hoort niet bij dit object');
    if (version(current) !== expectedVersion) fail(409, 'Relatie is intussen gewijzigd');
    const updated = await base44.asServiceRole.entities.ObjectRelationship.update(current.id, { status: 'archived', archived_at: new Date().toISOString(), archived_by_user_id: user.id, version: expectedVersion + 1 });
    await appendEvent(base44, user, { action, summary: 'Relatie gearchiveerd', resource_id: updated.id, customer_id: customer.id, object_id: object.id, idempotency_key: idempotencyKey });
    return { relationship: updated };
  }
  const data = body.data && typeof body.data === 'object' ? body.data : fail(400, 'data is verplicht');
  const relationType = text(data.relation_type);
  if (!TYPES.has(relationType)) fail(400, 'Kies een geldig relatietype');
  const organization = await organizationFor(base44, data, relationType);
  const patch = { organization_id: organization.id, relation_type: relationType, custom_relation_label: relationType === 'other' ? bounded(data.custom_relation_label, 'Omschrijving relatie', 120, true) : null, reference_number: bounded(data.reference_number, 'Referentienummer', 180), phone: bounded(data.phone, 'Telefoonnummer', 80), email: bounded(data.email, 'E-mailadres', 254), notes: bounded(data.notes, 'Notitie', 2000) };
  const duplicates = await base44.asServiceRole.entities.ObjectRelationship.filter({ object_id: object.id, organization_id: organization.id, relation_type: relationType, status: 'active' }, '-updated_date', 20);
  if (action === 'create_object_relationship') {
    if (expectedVersion !== 0) fail(409, 'Nieuwe relatie verwacht versie 0');
    const replay = await base44.asServiceRole.entities.ObjectRelationship.filter({ creation_idempotency_key: idempotencyKey }, '-created_date', 1);
    if (replay[0]) return { relationship: safeRelationship(replay[0], organization), replayed: true };
    if (duplicates.length) fail(409, 'Deze instantie is al met dit relatietype gekoppeld');
    const created = await base44.asServiceRole.entities.ObjectRelationship.create({ customer_id: customer.id, object_id: object.id, ...patch, status: 'active', creation_idempotency_key: idempotencyKey, version: 1 });
    await appendEvent(base44, user, { action, summary: `Relatie ${organization.name} toegevoegd`, resource_id: created.id, customer_id: customer.id, object_id: object.id, idempotency_key: idempotencyKey });
    return { relationship: safeRelationship(created, organization) };
  }
  const current = await base44.asServiceRole.entities.ObjectRelationship.get(text(body.relationship_id)).catch(() => null);
  if (!current || current.object_id !== object.id || current.customer_id !== customer.id || current.status !== 'active') fail(409, 'Relatie hoort niet bij dit object');
  if (version(current) !== expectedVersion) fail(409, 'Relatie is intussen gewijzigd');
  if (duplicates.some(item => item.id !== current.id)) fail(409, 'Deze instantie is al met dit relatietype gekoppeld');
  const updated = await base44.asServiceRole.entities.ObjectRelationship.update(current.id, { ...patch, version: expectedVersion + 1 });
  await appendEvent(base44, user, { action, summary: `Relatie ${organization.name} gewijzigd`, resource_id: updated.id, customer_id: customer.id, object_id: object.id, idempotency_key: idempotencyKey });
  return { relationship: safeRelationship(updated, organization) };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Niet ingelogd' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Alleen backofficebeheerders hebben toegang' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const action = text(body.action);
    const result = action === 'list_object_relationships' ? await list(base44, body) : await mutate(base44, user, action, body);
    return Response.json({ ok: true, ...result }, action.startsWith('create_') ? { status: 201 } : undefined);
  } catch (error) {
    const status = Number(error?.status || 500);
    console.error('[objectRelationshipsApi]', error);
    return Response.json({ error: status >= 500 ? 'Relatieactie mislukt' : error.message }, { status });
  }
}