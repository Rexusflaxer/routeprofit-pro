import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SIGNED_URL_TTL_SECONDS = 120;
const PORTAL_MODULES = new Set([
  'overview',
  'objects',
  'planning',
  'requests',
  'reports',
  'documents',
  'commercial',
  'billing',
  'access_management',
]);
const PORTAL_ACTIONS = new Set(['read', 'create', 'download', 'manage', 'publish']);
const PUBLICATION_MODULE: Record<string, string> = {
  report: 'reports',
  planning: 'planning',
  schedule: 'planning',
  document: 'documents',
  quote: 'commercial',
  contract: 'commercial',
  invoice: 'billing',
  credit_note: 'billing',
  reminder: 'billing',
  other: 'overview',
  notice: 'overview',
};
const BLOCKED_PAYLOAD_KEYS = [
  'gps',
  'latitude',
  'longitude',
  'employee',
  'personnel',
  'internal',
  'alarm',
  'access_instruction',
  'entry_instruction',
  'walking_instruction',
  'parking_instruction',
  'secret',
  'token',
  'raw_key',
  'url',
  'uri',
  'file_url',
  'file_uri',
  'metadata',
  'exif',
  'bsn',
];

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizeArray<T = unknown>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean) as T[];
}

function uniqueStrings(value: unknown) {
  return [...new Set(normalizeArray(value).map(item => String(item || '').trim()).filter(Boolean))];
}

function isExpired(value: unknown) {
  if (!value) return false;
  const timestamp = new Date(String(value)).getTime();
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function isBlockedPayloadKey(key: string) {
  const normalized = key.trim().toLowerCase();
  return normalized.endsWith('_url')
    || normalized.endsWith('_uri')
    || BLOCKED_PAYLOAD_KEYS.some(blocked =>
      normalized === blocked
      || normalized.startsWith(`${blocked}_`)
      || normalized.endsWith(`_${blocked}`)
    );
}

function sanitizeSafePayload(value: unknown, depth = 0): unknown {
  if (depth > 8) return null;
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    return value.slice(0, 500).map(item => sanitizeSafePayload(item, depth + 1));
  }
  if (typeof value !== 'object') return null;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isBlockedPayloadKey(key))
      .map(([key, item]) => [key, sanitizeSafePayload(item, depth + 1)])
  );
}

function safeCustomerDto(customer: any) {
  if (!customer) return null;
  return {
    id: customer.id,
    customer_number: customer.customer_number || null,
    name: customer.trade_name || customer.legal_name || customer.name || null,
    legal_name: customer.legal_name || customer.name || null,
    customer_type: customer.customer_type || null,
    status: customer.status || 'active',
    language: customer.preferred_language || customer.language || 'nl',
  };
}

function safeObjectDto(object: any) {
  if (!object) return null;
  return {
    id: object.id,
    name: object.name || null,
    address: object.address || null,
    status: object.status || object.operational_status || 'active',
    service_summary: normalizeArray(object.service_types || object.services)
      .map(item => typeof item === 'string' ? item : item?.label || item?.name)
      .filter(Boolean),
  };
}

function safePublicationDto(publication: any) {
  return {
    id: publication.id,
    publication_type: publication.publication_type,
    source_type: publication.source_type || null,
    source_id: publication.source_id || null,
    object_id: publication.object_id || null,
    version: publication.version || 1,
    record_version: publication.record_version || 1,
    status: publication.status,
    safe_payload: sanitizeSafePayload(publication.safe_payload || {}),
    attachment_managed_file_ids: uniqueStrings(publication.attachment_managed_file_ids),
    published_at: publication.published_at || null,
    valid_from: publication.valid_from || null,
    valid_until: publication.valid_until || null,
    checksum: publication.checksum || null,
  };
}

function safeMembershipDto(membership: any) {
  return {
    id: membership.id,
    company_id: membership.company_id,
    customer_id: membership.customer_id,
    contact_id: membership.contact_id || null,
    status: membership.status,
    role_template: membership.role_template || 'viewer',
    valid_from: membership.valid_from || null,
    valid_until: membership.valid_until || null,
  };
}

function safeGrantDto(grant: any) {
  return {
    id: grant.id,
    module: grant.module,
    actions: uniqueStrings(grant.actions),
    scope_type: grant.scope_type || 'selected_objects',
    object_ids: uniqueStrings(grant.object_ids),
    status: grant.status || 'active',
  };
}

function grantIsActive(grant: any) {
  return Boolean(
    grant
    && grant.status === 'active'
    && !isExpired(grant.valid_until)
    && (!grant.valid_from || new Date(grant.valid_from).getTime() <= Date.now())
  );
}

function grantMatchesAction(grant: any, module: string, action: string) {
  return grantIsActive(grant)
    && grant.module === module
    && uniqueStrings(grant.actions).includes(action);
}

function grantAllows(grant: any, module: string, action: string, objectId?: string | null) {
  if (!grantMatchesAction(grant, module, action)) return false;
  if (['customer_wide', 'all_objects', 'customer_all_objects'].includes(grant.scope_type)) return true;
  if (!objectId) return false;
  return uniqueStrings(grant.object_ids).includes(objectId);
}

function objectAllowed(grants: any[], module: string, action: string, objectId?: string | null) {
  return grants.some(grant => grantAllows(grant, module, action, objectId));
}

async function appendAudit(base44: any, data: Record<string, unknown>) {
  try {
    await base44.asServiceRole.entities.CustomerPortalAuditLog.create({
      ...data,
      created_at: nowIso(),
    });
  } catch (error) {
    console.error('[customerPortalApi] audit_failed', error);
  }
}

async function activeMemberships(base44: any, user: any) {
  const records = await base44.asServiceRole.entities.CustomerPortalMembership.filter({
    user_id: user.id,
  });
  return records.filter((membership: any) =>
    membership.status === 'active'
    && !isExpired(membership.valid_until)
    && (!membership.valid_from || new Date(membership.valid_from).getTime() <= Date.now())
  );
}

async function membershipContext(base44: any, user: any, membershipId?: string) {
  const memberships = await activeMemberships(base44, user);
  const membership = membershipId
    ? memberships.find((item: any) => item.id === membershipId)
    : memberships[0];
  if (!membership) return null;

  const grants = (await base44.asServiceRole.entities.CustomerPortalGrant.filter({
    membership_id: membership.id,
  })).filter(grantIsActive);

  return { membership, grants, memberships };
}

function requireAdmin(user: any) {
  if (!user || user.role !== 'admin') {
    const error = new Error('Forbidden');
    (error as any).status = 403;
    throw error;
  }
}

function requireString(body: Record<string, unknown>, field: string) {
  const value = String(body[field] || '').trim();
  if (!value) {
    const error = new Error(`${field} is verplicht`);
    (error as any).status = 400;
    throw error;
  }
  return value;
}

function requireMutationInput(body: Record<string, unknown>, { existing = false } = {}) {
  const idempotencyKey = requireString(body, 'idempotency_key');
  const rawExpected = body.expected_version;
  if (rawExpected === undefined || rawExpected === null || rawExpected === '') {
    const error = new Error('expected_version is verplicht');
    (error as any).status = 400;
    throw error;
  }
  const expectedVersion = Number(rawExpected);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0 || (existing && expectedVersion < 1)) {
    const error = new Error('expected_version is ongeldig');
    (error as any).status = 400;
    throw error;
  }
  return { idempotencyKey, expectedVersion };
}

function assertExpectedVersion(record: any, expectedVersion: number, field = 'version') {
  const actualVersion = Number(record?.[field] || 1);
  if (actualVersion !== expectedVersion) {
    const error = new Error(`Versieconflict: verwacht ${expectedVersion}, actueel ${actualVersion}`);
    (error as any).status = 409;
    throw error;
  }
  return actualVersion + 1;
}

async function acceptInvitation(base44: any, user: any, body: Record<string, unknown>, requestId: string) {
  const { idempotencyKey, expectedVersion } = requireMutationInput(body, { existing: true });
  const invitationId = requireString(body, 'invitation_id');
  const token = requireString(body, 'token');
  const invitation = await base44.asServiceRole.entities.CustomerPortalInvitation.get(invitationId).catch(() => null);
  if (!invitation) return json({ error: 'Uitnodiging niet gevonden' }, 404);

  const emailMatches = normalizeEmail(invitation.normalized_email || invitation.email) === normalizeEmail(user.email);
  const tokenMatches = invitation.token_hash && await sha256(token) === invitation.token_hash;
  if (!emailMatches || !tokenMatches) {
    await appendAudit(base44, {
      user_id: user.id,
      company_id: invitation.company_id,
      customer_id: invitation.customer_id,
      action: 'invitation_accept',
      resource_type: 'CustomerPortalInvitation',
      resource_id: invitation.id,
      outcome: 'denied',
      reason: emailMatches ? 'token_mismatch' : 'email_mismatch',
      request_id: requestId,
    });
    return json({ error: 'Uitnodiging niet gevonden' }, 404);
  }
  if (invitation.status === 'revoked' || invitation.status === 'declined' || isExpired(invitation.expires_at)) {
    if (isExpired(invitation.expires_at) && invitation.status === 'pending') {
      await base44.asServiceRole.entities.CustomerPortalInvitation.update(invitation.id, { status: 'expired' });
    }
    return json({ error: 'Deze uitnodiging is niet meer geldig' }, 410);
  }
  if (invitation.status !== 'accepted') {
    assertExpectedVersion(invitation, expectedVersion);
  }

  const existing = await base44.asServiceRole.entities.CustomerPortalMembership.filter({
    invitation_id: invitation.id,
    user_id: user.id,
  });
  const activeMembership = existing.find((item: any) =>
    item.status === 'active'
    && !isExpired(item.valid_until)
    && (!item.valid_from || new Date(item.valid_from).getTime() <= Date.now())
  ) || null;
  const duplicateAudit = await base44.asServiceRole.entities.CustomerPortalAuditLog.filter({
    resource_type: 'CustomerPortalInvitation',
    resource_id: invitation.id,
    action: 'invitation_accept',
    idempotency_key: idempotencyKey,
    outcome: 'success',
  });
  if (duplicateAudit[0] && activeMembership) {
    return json({ ok: true, membership: safeMembershipDto(activeMembership), idempotent: true });
  }
  if (invitation.status === 'accepted' || existing.some((item: any) => ['revoked', 'suspended', 'expired'].includes(item.status))) {
    return json({ error: 'Deze portaaltoegang is ingetrokken; een nieuwe uitnodiging is vereist' }, 410);
  }

  let membership = activeMembership;
  if (!membership) {
    membership = await base44.asServiceRole.entities.CustomerPortalMembership.create({
      invitation_id: invitation.id,
      user_id: user.id,
      company_id: invitation.company_id,
      customer_id: invitation.customer_id,
      contact_id: invitation.contact_id || null,
      status: 'active',
      role_template: invitation.role_template || 'viewer',
      valid_from: nowIso(),
      valid_until: invitation.valid_until || null,
      accepted_terms_version: String(body.terms_version || 'v1'),
      accepted_terms_at: nowIso(),
      version: 1,
    });
  }

  if (invitation.status !== 'accepted') {
    await base44.asServiceRole.entities.CustomerPortalInvitation.update(invitation.id, {
      status: 'accepted',
      accepted_at: nowIso(),
      accepted_by_user_id: user.id,
      version: Number(invitation.version || 1) + 1,
    });
  }

  await appendAudit(base44, {
    membership_id: membership.id,
    user_id: user.id,
    company_id: invitation.company_id,
    customer_id: invitation.customer_id,
    action: 'invitation_accept',
    resource_type: 'CustomerPortalInvitation',
    resource_id: invitation.id,
    outcome: 'success',
    request_id: requestId,
    idempotency_key: idempotencyKey,
  });
  return json({ ok: true, membership: safeMembershipDto(membership) });
}

async function listPortalObjects(base44: any, context: any) {
  if (!context.grants.some((grant: any) => grantMatchesAction(grant, 'objects', 'read'))) {
    return json({ error: 'Forbidden' }, 403);
  }
  const all = await base44.asServiceRole.entities.SurveillanceObject.filter({
    customer_id: context.membership.customer_id,
  });
  const objects = all
    .filter((object: any) => objectAllowed(context.grants, 'objects', 'read', object.id))
    .map(safeObjectDto)
    .filter(Boolean);
  return json({ objects });
}

async function listPublications(base44: any, context: any, body: Record<string, unknown>) {
  const type = body.publication_type ? String(body.publication_type) : '';
  const records = await base44.asServiceRole.entities.CustomerPortalPublication.filter({
    company_id: context.membership.company_id,
    customer_id: context.membership.customer_id,
    status: 'published',
  });
  const publications = records
    .filter((publication: any) => !type || publication.publication_type === type)
    .filter((publication: any) => !publication.valid_from || new Date(publication.valid_from).getTime() <= Date.now())
    .filter((publication: any) => !isExpired(publication.valid_until))
    .filter((publication: any) => {
      const module = PUBLICATION_MODULE[publication.publication_type] || 'overview';
      return objectAllowed(context.grants, module, 'read', publication.object_id);
    })
    .map((publication: any) => {
      const module = PUBLICATION_MODULE[publication.publication_type] || 'overview';
      return {
        ...safePublicationDto(publication),
        can_download: objectAllowed(context.grants, module, 'download', publication.object_id),
      };
    });
  return json({ publications });
}

async function createPortalRequest(base44: any, user: any, context: any, body: Record<string, unknown>, requestId: string) {
  const { idempotencyKey, expectedVersion } = requireMutationInput(body);
  if (expectedVersion !== 0) return json({ error: 'expected_version moet 0 zijn voor een nieuwe aanvraag' }, 409);
  const objectId = body.object_id ? String(body.object_id) : null;
  if (!objectAllowed(context.grants, 'requests', 'create', objectId)) return json({ error: 'Forbidden' }, 403);
  const duplicates = await base44.asServiceRole.entities.CustomerRequest.filter({
    customer_id: context.membership.customer_id,
    idempotency_key: idempotencyKey,
  });
  if (duplicates[0]) {
    return json({ ok: true, request: {
      id: duplicates[0].id,
      request_type: duplicates[0].request_type,
      title: duplicates[0].title,
      status: duplicates[0].status,
      submitted_at: duplicates[0].submitted_at,
    }, idempotent: true });
  }
  if (objectId) {
    const object = await base44.asServiceRole.entities.SurveillanceObject.get(objectId).catch(() => null);
    if (!object || object.customer_id !== context.membership.customer_id) return json({ error: 'Object niet gevonden' }, 404);
  }

  const requestType = requireString(body, 'request_type');
  const title = requireString(body, 'title');
  const description = String(body.description || '').trim();
  const request = await base44.asServiceRole.entities.CustomerRequest.create({
    company_id: context.membership.company_id,
    customer_id: context.membership.customer_id,
    customer_account_id: context.membership.customer_account_id || null,
    object_id: objectId,
    contact_id: context.membership.contact_id || null,
    portal_membership_id: context.membership.id,
    request_type: requestType,
    title,
    description,
    desired_start_at: body.desired_start_at || null,
    desired_end_at: body.desired_end_at || null,
    priority: body.priority || 'normal',
    status: 'submitted',
    source: 'customer_portal',
    submitted_at: nowIso(),
    created_by_user_id: user.id,
    version: 1,
    idempotency_key: idempotencyKey,
  });

  await appendAudit(base44, {
    membership_id: context.membership.id,
    user_id: user.id,
    company_id: context.membership.company_id,
    customer_id: context.membership.customer_id,
    object_id: objectId,
    action: 'request_create',
    resource_type: 'CustomerRequest',
    resource_id: request.id,
    outcome: 'success',
    request_id: requestId,
    idempotency_key: idempotencyKey,
  });
  return json({ ok: true, request: {
    id: request.id,
    request_type: request.request_type,
    title: request.title,
    status: request.status,
    submitted_at: request.submitted_at,
  } }, 201);
}

async function createPortalFileUrl(base44: any, user: any, context: any, body: Record<string, unknown>, requestId: string) {
  const publicationId = requireString(body, 'publication_id');
  const managedFileId = requireString(body, 'managed_file_id');
  const publication = await base44.asServiceRole.entities.CustomerPortalPublication.get(publicationId).catch(() => null);
  if (
    !publication
    || publication.status !== 'published'
    || publication.company_id !== context.membership.company_id
    || publication.customer_id !== context.membership.customer_id
    || publication.valid_from && new Date(publication.valid_from).getTime() > Date.now()
    || isExpired(publication.valid_until)
  ) {
    return json({ error: 'Publicatie niet gevonden' }, 404);
  }
  const module = PUBLICATION_MODULE[publication.publication_type] || 'documents';
  if (!objectAllowed(context.grants, module, 'download', publication.object_id)) {
    return json({ error: 'Forbidden' }, 403);
  }
  if (!uniqueStrings(publication.attachment_managed_file_ids).includes(managedFileId)) {
    return json({ error: 'Bestand niet gevonden' }, 404);
  }

  const managedFile = await base44.asServiceRole.entities.ManagedFile.get(managedFileId).catch(() => null);
  if (
    !managedFile
    || managedFile.customer_id !== context.membership.customer_id
    || managedFile.company_id !== context.membership.company_id
    || !managedFile.file_uri
    || managedFile.portal_visible !== true
  ) {
    return json({ error: 'Bestand niet gevonden' }, 404);
  }

  const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
    file_uri: managedFile.file_uri,
    expires_in: SIGNED_URL_TTL_SECONDS,
  });
  await appendAudit(base44, {
    membership_id: context.membership.id,
    user_id: user.id,
    company_id: context.membership.company_id,
    customer_id: context.membership.customer_id,
    object_id: publication.object_id || null,
    action: 'file_download_url_create',
    resource_type: 'ManagedFile',
    resource_id: managedFile.id,
    outcome: 'success',
    request_id: requestId,
  });
  return json({
    signed_url: signed.signed_url,
    expires_in: SIGNED_URL_TTL_SECONDS,
    filename: managedFile.download_filename || managedFile.name || 'document',
    mime_type: managedFile.mime_type || 'application/octet-stream',
  });
}

async function createInvitation(base44: any, user: any, body: Record<string, unknown>, requestId: string) {
  requireAdmin(user);
  const { idempotencyKey, expectedVersion } = requireMutationInput(body);
  if (expectedVersion !== 0) return json({ error: 'expected_version moet 0 zijn voor een nieuwe uitnodiging' }, 409);
  const companyId = requireString(body, 'company_id');
  const customerId = requireString(body, 'customer_id');
  const email = normalizeEmail(requireString(body, 'email'));
  const duplicate = await base44.asServiceRole.entities.CustomerPortalInvitation.filter({
    company_id: companyId,
    customer_id: customerId,
    idempotency_key: idempotencyKey,
  });
  if (duplicate[0]) {
    return json({
      ok: true,
      invitation_id: duplicate[0].id,
      expires_at: duplicate[0].expires_at,
      idempotent: true,
    });
  }
  const customer = await base44.asServiceRole.entities.Customer.get(customerId).catch(() => null);
  const accounts = await base44.asServiceRole.entities.CustomerAccount.filter({
    company_id: companyId,
    customer_id: customerId,
  });
  if (!customer || !accounts.some((account: any) => account.status !== 'archived')) {
    return json({ error: 'Klantrelatie niet gevonden' }, 404);
  }

  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
  const pending = await base44.asServiceRole.entities.CustomerPortalInvitation.filter({
    company_id: companyId,
    customer_id: customerId,
    normalized_email: email,
    status: 'pending',
  });
  for (const existing of pending) {
    await base44.asServiceRole.entities.CustomerPortalInvitation.update(existing.id, {
      status: 'revoked',
      revoked_at: nowIso(),
      revoked_by_user_id: user.id,
      revoke_reason: 'replaced_by_new_invitation',
    });
  }

  let invitation = await base44.asServiceRole.entities.CustomerPortalInvitation.create({
    company_id: companyId,
    customer_id: customerId,
    contact_id: body.contact_id || null,
    email,
    normalized_email: email,
    token_hash: tokenHash,
    status: 'pending',
    expires_at: expiresAt,
    role_template: body.role_template || 'viewer',
    invited_by_user_id: user.id,
    created_at: nowIso(),
    invited_at: nowIso(),
    last_sent_at: nowIso(),
    idempotency_key: idempotencyKey,
    version: 1,
  });

  try {
    await base44.auth.inviteUser(email, 'user');
  } catch (error) {
    invitation = await base44.asServiceRole.entities.CustomerPortalInvitation.update(invitation.id, {
      status: 'delivery_failed',
      delivery_error: error instanceof Error ? error.message : String(error),
      delivery_failed_at: nowIso(),
      delivery_failure_reason: error instanceof Error ? error.message : String(error),
      version: Number(invitation.version || 1) + 1,
    });
    await appendAudit(base44, {
      user_id: user.id,
      company_id: companyId,
      customer_id: customerId,
      action: 'invitation_create',
      resource_type: 'CustomerPortalInvitation',
      resource_id: invitation.id,
      outcome: 'failed',
      reason: 'base44_user_invite_failed',
      request_id: requestId,
      idempotency_key: idempotencyKey,
    });
    return json({ error: 'Portaaluitnodiging kon niet worden verzonden', invitation_id: invitation.id }, 502);
  }

  const portalBaseUrl = String(Deno.env.get('CUSTOMER_PORTAL_BASE_URL') || body.portal_base_url || '').replace(/\/$/, '');
  const activationUrl = portalBaseUrl
    ? `${portalBaseUrl}/CustomerPortal?invitation=${encodeURIComponent(invitation.id)}&token=${encodeURIComponent(token)}`
    : null;
  await appendAudit(base44, {
    user_id: user.id,
    company_id: companyId,
    customer_id: customerId,
    action: 'invitation_create',
    resource_type: 'CustomerPortalInvitation',
    resource_id: invitation.id,
    outcome: 'success',
    request_id: requestId,
    idempotency_key: idempotencyKey,
  });
  return json({
    ok: true,
    invitation_id: invitation.id,
    activation_token: token,
    activation_url: activationUrl,
    expires_at: expiresAt,
  }, 201);
}

async function setMembershipGrants(base44: any, user: any, body: Record<string, unknown>, requestId: string) {
  requireAdmin(user);
  const { idempotencyKey, expectedVersion } = requireMutationInput(body, { existing: true });
  const membershipId = requireString(body, 'membership_id');
  const membership = await base44.asServiceRole.entities.CustomerPortalMembership.get(membershipId).catch(() => null);
  if (!membership) return json({ error: 'Lidmaatschap niet gevonden' }, 404);
  const duplicateAudits = await base44.asServiceRole.entities.CustomerPortalAuditLog.filter({
    membership_id: membership.id,
    idempotency_key: idempotencyKey,
    action: 'grants_replace',
  });
  if (duplicateAudits[0]) {
    const current = await base44.asServiceRole.entities.CustomerPortalGrant.filter({
      membership_id: membership.id,
    });
    return json({
      ok: true,
      grants: current.filter((grant: any) => grant.status === 'active').map(safeGrantDto),
      idempotent: true,
    });
  }
  const nextMembershipVersion = assertExpectedVersion(membership, expectedVersion);
  const customerObjects = await base44.asServiceRole.entities.SurveillanceObject.filter({
    customer_id: membership.customer_id,
  });
  const customerObjectIds = new Set(customerObjects.map((object: any) => object.id));
  const requested = normalizeArray(body.grants);
  const normalized = requested.map((grant: any) => {
    const module = String(grant?.module || '');
    const actions = uniqueStrings(grant?.actions);
    if (!PORTAL_MODULES.has(module) || actions.some(action => !PORTAL_ACTIONS.has(action))) {
      const error = new Error('Ongeldige portaalrechten');
      (error as any).status = 400;
      throw error;
    }
    const objectIds = grant?.scope_type === 'customer_wide' ? [] : uniqueStrings(grant?.object_ids);
    if (objectIds.some(objectId => !customerObjectIds.has(objectId))) {
      const error = new Error('Objectscope behoort niet volledig tot deze klant');
      (error as any).status = 409;
      throw error;
    }
    return {
      module,
      actions,
      scope_type: grant?.scope_type === 'customer_wide' ? 'customer_wide' : 'selected_objects',
      object_ids: objectIds,
    };
  });

  const existing = await base44.asServiceRole.entities.CustomerPortalGrant.filter({
    membership_id: membership.id,
  });
  for (const grant of existing.filter((item: any) => item.status !== 'revoked')) {
    await base44.asServiceRole.entities.CustomerPortalGrant.update(grant.id, {
      status: 'revoked',
      revoked_at: nowIso(),
      revoked_by_user_id: user.id,
      version: Number(grant.version || 1) + 1,
    });
  }
  const created = [];
  for (const grant of normalized) {
    created.push(await base44.asServiceRole.entities.CustomerPortalGrant.create({
      membership_id: membership.id,
      company_id: membership.company_id,
      customer_id: membership.customer_id,
      ...grant,
      status: 'active',
      granted_at: nowIso(),
      granted_by_user_id: user.id,
      version: 1,
    }));
  }
  await base44.asServiceRole.entities.CustomerPortalMembership.update(membership.id, {
    version: nextMembershipVersion,
  });

  await appendAudit(base44, {
    membership_id: membership.id,
    user_id: user.id,
    company_id: membership.company_id,
    customer_id: membership.customer_id,
    action: 'grants_replace',
    resource_type: 'CustomerPortalMembership',
    resource_id: membership.id,
    outcome: 'success',
    request_id: requestId,
    idempotency_key: idempotencyKey,
    permission_snapshot: created.map(safeGrantDto),
  });
  return json({ ok: true, grants: created.map(safeGrantDto) });
}

function buildPublicationPayload(type: string, source: any, requested: unknown) {
  const input = sanitizeSafePayload(requested || {}) as Record<string, unknown>;
  if (type === 'report') {
    return sanitizeSafePayload({
      report_type: source?.report_type || input?.report_type || null,
      report_text: input?.report_text ?? source?.report_text ?? null,
      checklist: input?.checklist || null,
      occurred_at: input?.occurred_at || source?.submitted_at || source?.created_at || null,
      photos: normalizeArray(input?.photos).map((photo: any) => ({
        managed_file_id: photo?.managed_file_id || null,
        name: photo?.name || null,
        caption: photo?.caption || null,
      })),
    });
  }
  if (type === 'invoice' || type === 'credit_note') {
    return sanitizeSafePayload({
      invoice_number: source?.invoice_number || input?.invoice_number || null,
      document_type: source?.document_type || type,
      issue_date: source?.issue_date || null,
      due_date: source?.due_date || null,
      currency: source?.currency || 'EUR',
      total_excluding_tax_cents: source?.total_excluding_tax_cents ?? source?.subtotal_cents ?? null,
      tax_total_cents: source?.tax_total_cents ?? null,
      total_including_tax_cents: source?.total_including_tax_cents ?? source?.total_cents ?? null,
      payment_status: source?.payment_status || null,
      description: input?.description || null,
    });
  }
  if (type === 'document') {
    return sanitizeSafePayload({
      name: source?.display_name || source?.download_filename || input?.name || null,
      category: source?.document_category || source?.category || input?.category || null,
      description: input?.description || null,
      valid_until: source?.valid_until || input?.valid_until || null,
    });
  }
  if (type === 'quote') {
    return sanitizeSafePayload({
      quote_number: source?.quote_number || input?.quote_number || null,
      title: source?.title || input?.title || null,
      version: source?.version_number || source?.version || input?.version || 1,
      issue_date: source?.issue_date || input?.issue_date || null,
      valid_until: source?.valid_until || input?.valid_until || null,
      currency: source?.currency || input?.currency || 'EUR',
      subtotal_cents: source?.subtotal_cents ?? input?.subtotal_cents ?? null,
      tax_total_cents: source?.tax_total_cents ?? input?.tax_total_cents ?? null,
      total_cents: source?.total_cents ?? input?.total_cents ?? null,
      description: input?.description || null,
    });
  }
  if (type === 'contract') {
    return sanitizeSafePayload({
      contract_number: source?.contract_number || input?.contract_number || null,
      title: source?.title || input?.title || null,
      version: source?.version_number || source?.version || input?.version || 1,
      start_date: source?.start_date || input?.start_date || null,
      end_date: source?.end_date || input?.end_date || null,
      currency: source?.currency || input?.currency || 'EUR',
      description: input?.description || null,
    });
  }
  if (type === 'planning') {
    return sanitizeSafePayload({
      title: input?.title || null,
      service_name: input?.service_name || source?.task_type || null,
      object_name: input?.object_name || null,
      starts_at: input?.starts_at || source?.planned_start || source?.scheduled_start || null,
      ends_at: input?.ends_at || source?.planned_end || source?.scheduled_end || null,
      status: input?.status || source?.status || null,
      description: input?.description || null,
    });
  }
  if (type === 'reminder') {
    return sanitizeSafePayload({
      title: input?.title || 'Betalingsherinnering',
      sequence: source?.sequence || input?.sequence || null,
      reminder_type: source?.reminder_type || input?.reminder_type || null,
      open_amount_cents: source?.open_amount_cents ?? input?.open_amount_cents ?? null,
      scheduled_for: source?.scheduled_for || input?.scheduled_for || null,
      sent_at: source?.sent_at || input?.sent_at || null,
      description: input?.description || null,
    });
  }
  return sanitizeSafePayload({
    title: input?.title || null,
    description: input?.description || null,
    occurred_at: input?.occurred_at || null,
    status: input?.status || null,
  });
}

async function publicationSource(base44: any, sourceType: string, sourceId: string) {
  const normalized = sourceType.toLowerCase();
  if (normalized === 'mobilereport' || normalized === 'mobile_report') {
    return base44.asServiceRole.entities.MobileReport.get(sourceId).catch(() => null);
  }
  if (normalized === 'managedfile' || normalized === 'managed_file') {
    return base44.asServiceRole.entities.ManagedFile.get(sourceId).catch(() => null);
  }
  if (normalized === 'salesinvoice' || normalized === 'sales_invoice') {
    return base44.asServiceRole.entities.SalesInvoice.get(sourceId).catch(() => null);
  }
  if (normalized === 'customerquote' || normalized === 'customer_quote') {
    return base44.asServiceRole.entities.CustomerQuote.get(sourceId).catch(() => null);
  }
  if (normalized === 'customercontract' || normalized === 'customer_contract') {
    return base44.asServiceRole.entities.CustomerContract.get(sourceId).catch(() => null);
  }
  if (normalized === 'planning') {
    return base44.asServiceRole.entities.TaskExecution.get(sourceId).catch(() => null);
  }
  if (normalized === 'paymentreminder' || normalized === 'payment_reminder') {
    return base44.asServiceRole.entities.PaymentReminder.get(sourceId).catch(() => null);
  }
  return null;
}

async function preparePublication(base44: any, user: any, body: Record<string, unknown>, requestId: string) {
  requireAdmin(user);
  const { idempotencyKey, expectedVersion } = requireMutationInput(body);
  if (expectedVersion !== 0) return json({ error: 'expected_version moet 0 zijn voor een nieuwe publicatieversie' }, 409);
  const companyId = requireString(body, 'company_id');
  const customerId = requireString(body, 'customer_id');
  const publicationType = requireString(body, 'publication_type');
  const sourceType = requireString(body, 'source_type');
  const sourceId = requireString(body, 'source_id');
  if (!PUBLICATION_MODULE[publicationType] && publicationType !== 'other') {
    return json({ error: 'Ongeldig publicatietype' }, 400);
  }

  const duplicate = await base44.asServiceRole.entities.CustomerPortalPublication.filter({
    company_id: companyId,
    customer_id: customerId,
    idempotency_key: idempotencyKey,
  });
  if (duplicate[0]) {
    return json({ ok: true, publication: safePublicationDto(duplicate[0]), idempotent: true });
  }

  const source: any = await publicationSource(base44, sourceType, sourceId);
  if (!source) return json({ error: 'Bron niet gevonden' }, 404);

  const objectId = String(body.object_id || source.object_id || '') || null;
  if (source.customer_id && source.customer_id !== customerId) return json({ error: 'Bron niet gevonden' }, 404);
  if (source.company_id && source.company_id !== companyId) return json({ error: 'Bron niet gevonden' }, 404);
  if (objectId) {
    const object = await base44.asServiceRole.entities.SurveillanceObject.get(objectId).catch(() => null);
    if (!object || object.customer_id !== customerId) return json({ error: 'Object niet gevonden' }, 404);
  }

  const safePayload = buildPublicationPayload(publicationType, source, body.safe_payload);
  const attachmentIds = uniqueStrings(body.attachment_managed_file_ids);
  for (const fileId of attachmentIds) {
    const file = await base44.asServiceRole.entities.ManagedFile.get(fileId).catch(() => null);
    if (
      !file
      || file.company_id !== companyId
      || file.customer_id !== customerId
      || !file.file_uri
      || (objectId && file.object_id && file.object_id !== objectId)
    ) {
      return json({ error: 'Een bijlage behoort niet tot deze publicatiescope' }, 409);
    }
  }
  const checksum = await sha256(stableStringify({ safe_payload: safePayload, attachment_ids: attachmentIds }));
  const previous = await base44.asServiceRole.entities.CustomerPortalPublication.filter({
    company_id: companyId,
    customer_id: customerId,
    source_type: sourceType,
    source_id: sourceId,
  });
  const publication = await base44.asServiceRole.entities.CustomerPortalPublication.create({
    company_id: companyId,
    customer_id: customerId,
    object_id: objectId,
    source_type: sourceType,
    source_id: sourceId,
    publication_type: publicationType,
    version: Math.max(0, ...previous.map((item: any) => Number(item.version || 0))) + 1,
    status: 'submitted',
    safe_payload: safePayload,
    attachment_managed_file_ids: attachmentIds,
    valid_from: body.valid_from || null,
    valid_until: body.valid_until || null,
    checksum,
    record_version: 1,
    idempotency_key: idempotencyKey,
  });
  await appendAudit(base44, {
    user_id: user.id,
    company_id: companyId,
    customer_id: customerId,
    object_id: objectId,
    action: 'publication_submit',
    resource_type: 'CustomerPortalPublication',
    resource_id: publication.id,
    outcome: 'success',
    request_id: requestId,
    idempotency_key: idempotencyKey,
  });
  return json({ ok: true, publication: safePublicationDto(publication) }, 201);
}

async function reviewPublication(base44: any, user: any, body: Record<string, unknown>, requestId: string) {
  requireAdmin(user);
  const { idempotencyKey, expectedVersion } = requireMutationInput(body, { existing: true });
  const publicationId = requireString(body, 'publication_id');
  const decision = requireString(body, 'decision');
  const publication = await base44.asServiceRole.entities.CustomerPortalPublication.get(publicationId).catch(() => null);
  if (!publication) return json({ error: 'Publicatie niet gevonden' }, 404);
  const duplicate = await base44.asServiceRole.entities.CustomerPortalAuditLog.filter({
    resource_type: 'CustomerPortalPublication',
    resource_id: publication.id,
    idempotency_key: idempotencyKey,
  });
  if (duplicate[0]) return json({ ok: true, publication: safePublicationDto(publication), idempotent: true });
  const nextVersion = assertExpectedVersion(publication, expectedVersion, 'record_version');
  const transitions: Record<string, { from: string[]; to: string }> = {
    start_review: { from: ['submitted'], to: 'review' },
    approve: { from: ['review'], to: 'approved' },
    request_correction: { from: ['review'], to: 'correction_requested' },
  };
  const transition = transitions[decision];
  if (!transition || !transition.from.includes(publication.status)) {
    return json({ error: `Ongeldige publicatieovergang vanuit ${publication.status}` }, 409);
  }
  if (decision === 'request_correction' && !String(body.reason || '').trim()) {
    return json({ error: 'Een correctiereden is verplicht' }, 400);
  }
  const updated = await base44.asServiceRole.entities.CustomerPortalPublication.update(publication.id, {
    status: transition.to,
    record_version: nextVersion,
    reviewed_by_user_id: user.id,
    reviewed_at: nowIso(),
    withdrawal_reason: decision === 'request_correction' ? String(body.reason) : null,
  });
  await appendAudit(base44, {
    user_id: user.id,
    company_id: publication.company_id,
    customer_id: publication.customer_id,
    object_id: publication.object_id || null,
    action: `publication_${decision}`,
    resource_type: 'CustomerPortalPublication',
    resource_id: publication.id,
    outcome: 'success',
    reason: body.reason || null,
    request_id: requestId,
    idempotency_key: idempotencyKey,
  });
  return json({ ok: true, publication: safePublicationDto(updated) });
}

async function publishApprovedPublication(base44: any, user: any, body: Record<string, unknown>, requestId: string) {
  requireAdmin(user);
  const { idempotencyKey, expectedVersion } = requireMutationInput(body, { existing: true });
  const publicationId = requireString(body, 'publication_id');
  const publication = await base44.asServiceRole.entities.CustomerPortalPublication.get(publicationId).catch(() => null);
  if (!publication) return json({ error: 'Publicatie niet gevonden' }, 404);
  const duplicate = await base44.asServiceRole.entities.CustomerPortalAuditLog.filter({
    resource_type: 'CustomerPortalPublication',
    resource_id: publication.id,
    action: 'publication_publish',
    idempotency_key: idempotencyKey,
  });
  if (duplicate[0]) return json({ ok: true, publication: safePublicationDto(publication), idempotent: true });
  if (publication.status !== 'approved') {
    return json({ error: 'Alleen een goedgekeurde publicatie kan worden gepubliceerd' }, 409);
  }
  const nextVersion = assertExpectedVersion(publication, expectedVersion, 'record_version');
  const previous = await base44.asServiceRole.entities.CustomerPortalPublication.filter({
    company_id: publication.company_id,
    customer_id: publication.customer_id,
    source_type: publication.source_type,
    source_id: publication.source_id,
    status: 'published',
  });
  for (const item of previous) {
    await base44.asServiceRole.entities.CustomerPortalPublication.update(item.id, {
      status: 'superseded',
      superseded_at: nowIso(),
      superseded_by_user_id: user.id,
      record_version: Number(item.record_version || 1) + 1,
    });
  }
  const updated = await base44.asServiceRole.entities.CustomerPortalPublication.update(publication.id, {
    status: 'published',
    record_version: nextVersion,
    published_by_user_id: user.id,
    published_at: nowIso(),
    valid_from: publication.valid_from || nowIso(),
  });
  for (const fileId of uniqueStrings(publication.attachment_managed_file_ids)) {
    await base44.asServiceRole.entities.ManagedFile.update(fileId, {
      portal_visible: true,
      publication_id: publication.id,
      portal_published_at: nowIso(),
      portal_checksum: publication.checksum,
    });
  }
  await appendAudit(base44, {
    user_id: user.id,
    company_id: publication.company_id,
    customer_id: publication.customer_id,
    object_id: publication.object_id || null,
    action: 'publication_publish',
    resource_type: 'CustomerPortalPublication',
    resource_id: publication.id,
    outcome: 'success',
    request_id: requestId,
    idempotency_key: idempotencyKey,
  });
  return json({ ok: true, publication: safePublicationDto(updated) });
}

async function startSupportSession(base44: any, user: any, body: Record<string, unknown>, requestId: string) {
  requireAdmin(user);
  const { idempotencyKey, expectedVersion } = requireMutationInput(body);
  if (expectedVersion !== 0) return json({ error: 'expected_version moet 0 zijn voor een supportsessie' }, 409);
  const companyId = requireString(body, 'company_id');
  const customerId = requireString(body, 'customer_id');
  const reason = requireString(body, 'reason');
  const ticketReference = requireString(body, 'ticket_reference');
  const scopes = uniqueStrings(body.scopes);
  if (!scopes.length || scopes.some(scope => !PORTAL_MODULES.has(scope))) {
    return json({ error: 'Een geldige, beperkte supportscope is verplicht' }, 400);
  }
  const duplicate = await base44.asServiceRole.entities.CustomerSupportSession.filter({
    actor_user_id: user.id,
    idempotency_key: idempotencyKey,
  });
  if (duplicate[0]) return json({ ok: true, session: duplicate[0], idempotent: true });
  const accounts = await base44.asServiceRole.entities.CustomerAccount.filter({
    company_id: companyId,
    customer_id: customerId,
  });
  if (!accounts.some((account: any) => account.status !== 'archived')) {
    return json({ error: 'Klantrelatie niet gevonden' }, 404);
  }
  const startedAt = nowIso();
  const requestedMinutes = Math.max(1, Math.min(60, Number(body.duration_minutes || 60)));
  const expiresAt = new Date(Date.now() + requestedMinutes * 60_000).toISOString();
  const session = await base44.asServiceRole.entities.CustomerSupportSession.create({
    actor_user_id: user.id,
    company_id: companyId,
    customer_id: customerId,
    reason,
    ticket_reference: ticketReference,
    scopes,
    read_only: true,
    status: 'active',
    started_at: startedAt,
    expires_at: expiresAt,
    version: 1,
    idempotency_key: idempotencyKey,
  });
  await appendAudit(base44, {
    user_id: user.id,
    company_id: companyId,
    customer_id: customerId,
    action: 'support_session_start',
    resource_type: 'CustomerSupportSession',
    resource_id: session.id,
    outcome: 'success',
    reason,
    request_id: requestId,
    idempotency_key: idempotencyKey,
    permission_snapshot: { scopes, read_only: true, ticket_reference: ticketReference },
  });
  return json({ ok: true, session }, 201);
}

async function supportContext(base44: any, user: any, body: Record<string, unknown>, requestId: string) {
  requireAdmin(user);
  const sessionId = requireString(body, 'support_session_id');
  const session = await base44.asServiceRole.entities.CustomerSupportSession.get(sessionId).catch(() => null);
  if (!session || session.actor_user_id !== user.id || session.status !== 'active') {
    return json({ error: 'Supportsessie niet gevonden' }, 404);
  }
  if (isExpired(session.expires_at)) {
    await base44.asServiceRole.entities.CustomerSupportSession.update(session.id, {
      status: 'expired',
      ended_at: nowIso(),
      version: Number(session.version || 1) + 1,
    });
    return json({ error: 'Supportsessie is verlopen' }, 410);
  }
  const [customer, objects, publications] = await Promise.all([
    base44.asServiceRole.entities.Customer.get(session.customer_id).catch(() => null),
    base44.asServiceRole.entities.SurveillanceObject.filter({ customer_id: session.customer_id }),
    base44.asServiceRole.entities.CustomerPortalPublication.filter({
      company_id: session.company_id,
      customer_id: session.customer_id,
      status: 'published',
    }),
  ]);
  if (!customer) return json({ error: 'Klant niet gevonden' }, 404);
  const scopes = new Set(uniqueStrings(session.scopes));
  await appendAudit(base44, {
    user_id: user.id,
    company_id: session.company_id,
    customer_id: session.customer_id,
    action: 'support_context_view',
    resource_type: 'CustomerSupportSession',
    resource_id: session.id,
    outcome: 'success',
    request_id: requestId,
    permission_snapshot: { scopes: [...scopes], read_only: true },
  });
  return json({
    support_session: {
      id: session.id,
      ticket_reference: session.ticket_reference,
      reason: session.reason,
      scopes: [...scopes],
      expires_at: session.expires_at,
      read_only: true,
    },
    customer: safeCustomerDto(customer),
    objects: scopes.has('objects') ? objects.map(safeObjectDto) : [],
    publications: publications
      .filter((publication: any) => scopes.has(PUBLICATION_MODULE[publication.publication_type] || 'overview'))
      .map(safePublicationDto),
  });
}

export {
  sanitizeSafePayload,
  grantAllows,
  safeCustomerDto,
  safeObjectDto,
  buildPublicationPayload,
};

Deno.serve(async (req) => {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'context');

    if (action === 'accept_invitation') return acceptInvitation(base44, user, body, requestId);
    if (action === 'create_invitation') return createInvitation(base44, user, body, requestId);
    if (action === 'set_membership_grants') return setMembershipGrants(base44, user, body, requestId);
    if (action === 'prepare_publication' || action === 'publish_resource') {
      return preparePublication(base44, user, body, requestId);
    }
    if (action === 'review_publication') return reviewPublication(base44, user, body, requestId);
    if (action === 'publish_publication') return publishApprovedPublication(base44, user, body, requestId);
    if (action === 'start_support_session') return startSupportSession(base44, user, body, requestId);
    if (action === 'support_context') return supportContext(base44, user, body, requestId);

    if (action === 'end_support_session') {
      requireAdmin(user);
      const { idempotencyKey, expectedVersion } = requireMutationInput(body, { existing: true });
      const sessionId = requireString(body, 'support_session_id');
      const session = await base44.asServiceRole.entities.CustomerSupportSession.get(sessionId).catch(() => null);
      if (!session || session.actor_user_id !== user.id) return json({ error: 'Supportsessie niet gevonden' }, 404);
      const duplicate = await base44.asServiceRole.entities.CustomerPortalAuditLog.filter({
        resource_type: 'CustomerSupportSession',
        resource_id: session.id,
        action: 'support_session_end',
        idempotency_key: idempotencyKey,
      });
      if (duplicate[0]) return json({ ok: true, idempotent: true });
      const nextVersion = assertExpectedVersion(session, expectedVersion);
      await base44.asServiceRole.entities.CustomerSupportSession.update(session.id, {
        status: 'ended',
        ended_at: nowIso(),
        ended_by_user_id: user.id,
        version: nextVersion,
      });
      await appendAudit(base44, {
        user_id: user.id,
        company_id: session.company_id,
        customer_id: session.customer_id,
        action: 'support_session_end',
        resource_type: 'CustomerSupportSession',
        resource_id: session.id,
        outcome: 'success',
        request_id: requestId,
        idempotency_key: idempotencyKey,
      });
      return json({ ok: true });
    }

    if (action === 'revoke_membership') {
      requireAdmin(user);
      const { idempotencyKey, expectedVersion } = requireMutationInput(body, { existing: true });
      const membershipId = requireString(body, 'membership_id');
      const membership = await base44.asServiceRole.entities.CustomerPortalMembership.get(membershipId).catch(() => null);
      if (!membership) return json({ error: 'Lidmaatschap niet gevonden' }, 404);
      const duplicate = await base44.asServiceRole.entities.CustomerPortalAuditLog.filter({
        resource_type: 'CustomerPortalMembership',
        resource_id: membership.id,
        action: 'membership_revoke',
        idempotency_key: idempotencyKey,
      });
      if (duplicate[0]) return json({ ok: true, idempotent: true });
      const nextVersion = assertExpectedVersion(membership, expectedVersion);
      await base44.asServiceRole.entities.CustomerPortalMembership.update(membership.id, {
        status: 'revoked',
        revoked_at: nowIso(),
        revoked_by_user_id: user.id,
        revoke_reason: body.reason || null,
        version: nextVersion,
      });
      if (membership.invitation_id) {
        const invitation = await base44.asServiceRole.entities.CustomerPortalInvitation
          .get(membership.invitation_id)
          .catch(() => null);
        if (invitation && invitation.status !== 'revoked') {
          await base44.asServiceRole.entities.CustomerPortalInvitation.update(invitation.id, {
            status: 'revoked',
            revoked_at: nowIso(),
            revoked_by_user_id: user.id,
            revoke_reason: body.reason || 'membership_revoked',
            version: Number(invitation.version || 1) + 1,
          });
        }
      }
      await appendAudit(base44, {
        membership_id: membership.id,
        user_id: user.id,
        company_id: membership.company_id,
        customer_id: membership.customer_id,
        action: 'membership_revoke',
        resource_type: 'CustomerPortalMembership',
        resource_id: membership.id,
        outcome: 'success',
        reason: body.reason || null,
        request_id: requestId,
        idempotency_key: idempotencyKey,
      });
      return json({ ok: true });
    }

    if (action === 'withdraw_publication') {
      requireAdmin(user);
      const { idempotencyKey, expectedVersion } = requireMutationInput(body, { existing: true });
      const publicationId = requireString(body, 'publication_id');
      const publication = await base44.asServiceRole.entities.CustomerPortalPublication.get(publicationId).catch(() => null);
      if (!publication) return json({ error: 'Publicatie niet gevonden' }, 404);
      const duplicate = await base44.asServiceRole.entities.CustomerPortalAuditLog.filter({
        resource_type: 'CustomerPortalPublication',
        resource_id: publication.id,
        action: 'publication_withdraw',
        idempotency_key: idempotencyKey,
      });
      if (duplicate[0]) return json({ ok: true, idempotent: true });
      const nextVersion = assertExpectedVersion(publication, expectedVersion, 'record_version');
      await base44.asServiceRole.entities.CustomerPortalPublication.update(publication.id, {
        status: 'withdrawn',
        withdrawn_at: nowIso(),
        withdrawn_by_user_id: user.id,
        withdrawal_reason: body.reason || null,
        record_version: nextVersion,
      });
      await appendAudit(base44, {
        user_id: user.id,
        company_id: publication.company_id,
        customer_id: publication.customer_id,
        object_id: publication.object_id || null,
        action: 'publication_withdraw',
        resource_type: 'CustomerPortalPublication',
        resource_id: publication.id,
        outcome: 'success',
        reason: body.reason || null,
        request_id: requestId,
        idempotency_key: idempotencyKey,
      });
      return json({ ok: true });
    }

    const context = await membershipContext(base44, user, body.membership_id ? String(body.membership_id) : undefined);
    if (!context) return json({ error: 'Geen actieve klantportaaltoegang' }, 403);
    const customer = await base44.asServiceRole.entities.Customer.get(context.membership.customer_id).catch(() => null);
    if (!customer || customer.status === 'archived') return json({ error: 'Klant niet gevonden' }, 404);

    if (action === 'context') {
      await appendAudit(base44, {
        membership_id: context.membership.id,
        user_id: user.id,
        company_id: context.membership.company_id,
        customer_id: context.membership.customer_id,
        action: 'portal_context_view',
        resource_type: 'Customer',
        resource_id: context.membership.customer_id,
        outcome: 'success',
        request_id: requestId,
        permission_snapshot: context.grants.map(safeGrantDto),
      });
      return json({
        customer: safeCustomerDto(customer),
        membership: safeMembershipDto(context.membership),
        memberships: context.memberships.map(safeMembershipDto),
        grants: context.grants.map(safeGrantDto),
      });
    }
    if (action === 'list_objects') return listPortalObjects(base44, context);
    if (action === 'list_publications') return listPublications(base44, context, body);
    if (action === 'create_request') return createPortalRequest(base44, user, context, body, requestId);
    if (action === 'create_file_url') return createPortalFileUrl(base44, user, context, body, requestId);

    return json({ error: 'Onbekende actie' }, 400);
  } catch (error) {
    const status = Number((error as any)?.status || 500);
    console.error('[customerPortalApi]', requestId, error);
    return json({
      error: status >= 500 ? 'Klantportaalactie mislukt' : (error as Error)?.message || 'Actie mislukt',
      request_id: requestId,
    }, status);
  }
});
