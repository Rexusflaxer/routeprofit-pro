import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

type LooseRecord = Record<string, any>;

class ApiError extends Error {
  status: number;
  details?: LooseRecord;

  constructor(status: number, message: string, details?: LooseRecord) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const QUOTE_TRANSITIONS: Record<string, string[]> = {
  draft: ['review', 'withdrawn'],
  review: ['draft', 'approved', 'withdrawn'],
  approved: ['review', 'sent', 'withdrawn'],
  sent: ['accepted', 'rejected', 'expired', 'withdrawn'],
  accepted: ['converted'],
  rejected: [],
  expired: [],
  withdrawn: [],
  converted: [],
};

const CONTRACT_TRANSITIONS: Record<string, string[]> = {
  draft: ['review', 'archived'],
  review: ['draft', 'approved', 'archived'],
  approved: ['review', 'sent_for_signature', 'archived'],
  sent_for_signature: ['signed', 'archived'],
  signed: ['active', 'archived'],
  active: ['suspended', 'ended', 'superseded'],
  suspended: ['active', 'ended', 'superseded'],
  ended: ['archived'],
  superseded: ['archived'],
  archived: [],
};

const REQUEST_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['in_review', 'cancelled'],
  in_review: ['accepted', 'rejected', 'cancelled'],
  accepted: ['scheduled', 'completed', 'cancelled'],
  rejected: [],
  scheduled: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const INVOICE_TRANSITIONS: Record<string, string[]> = {
  draft: ['review', 'cancelled'],
  review: ['draft', 'approved', 'cancelled'],
  approved: ['review', 'issue_pending'],
  issue_pending: ['issued', 'issue_failed'],
  issued: [],
  issue_failed: [],
  cancelled: [],
};

const REMINDER_TRANSITIONS: Record<string, string[]> = {
  draft: ['scheduled', 'cancelled'],
  scheduled: ['sent', 'failed', 'cancelled', 'paid'],
  sent: ['paid', 'cancelled'],
  failed: ['scheduled', 'cancelled'],
  cancelled: [],
  paid: [],
};

const INDEX_TRANSITIONS: Record<string, string[]> = {
  draft: ['review', 'cancelled'],
  review: ['draft', 'approved', 'cancelled'],
  approved: ['applied', 'cancelled'],
  applied: [],
  failed: ['review', 'cancelled'],
  cancelled: [],
};

const READ_ACTIONS = new Set([
  'get_customer_overview',
  'search_customer_objects',
  'list_object_warning_addresses',
  'list_object_logbook',
  'list_object_keys',
  'list_object_installations',
  'list_commercial',
  'list_billing',
  'validate_contract_rates',
]);

const MUTATION_ACTIONS = new Set([
  'create_customer',
  'update_customer',
  'set_customer_status',
  'delete_empty_customer',
  'create_customer_object',
  'update_customer_object_identity',
  'update_customer_object_operations',
  'set_customer_object_status',
  'create_object_warning_address', 'update_object_warning_address',
  'delete_object_warning_address', 'reorder_object_warning_addresses',
  'upsert_warning_availability_overrides', 'delete_warning_availability_override',
  'create_object_key', 'update_object_key', 'archive_object_key',
  'create_object_installation', 'update_object_installation', 'archive_object_installation',
  'create_customer_account',
  'update_customer_account',
  'archive_customer_account',
  'create_customer_address',
  'update_customer_address',
  'archive_customer_address',
  'create_customer_contact',
  'update_customer_contact',
  'archive_customer_contact',
  'create_contact_point',
  'update_contact_point',
  'archive_contact_point',
  'create_contact_role',
  'update_contact_role',
  'archive_contact_role',
  'create_customer_request',
  'transition_customer_request',
  'create_quote',
  'update_quote',
  'create_quote_line',
  'update_quote_line',
  'delete_quote_line',
  'revise_quote',
  'transition_quote',
  'convert_quote',
  'create_contract',
  'update_contract',
  'transition_contract',
  'create_contract_line',
  'update_contract_line',
  'transition_contract_line',
  'create_contract_rate',
  'update_contract_rate',
  'transition_contract_rate',
  'create_billing_candidate',
  'transition_billing_candidate',
  'create_invoice_draft',
  'create_invoice_run',
  'update_invoice',
  'transition_invoice',
  'issue_invoice',
  'create_credit_note',
  'set_invoice_dispute',
  'record_payment',
  'reverse_payment',
  'allocate_payment',
  'reverse_payment_allocation',
  'create_payment_reminder',
  'transition_payment_reminder',
  'create_indexation_run',
  'transition_indexation_run',
  'apply_indexation_run',
  'migrate_legacy_customers',
]);

const CUSTOMER_PATCH_FIELDS = [
  'customer_type',
  'legal_name',
  'trade_name',
  'kvk_number',
  'vat_number',
  'preferred_language',
  'logo_file_id',
  'onboarding_state',
  'metadata',
];
const ACCOUNT_PATCH_FIELDS = [
  'debtor_number',
  'status',
  'is_primary',
  'account_manager_id',
  'billing_name',
  'billing_address_id',
  'billing_contact_id',
  'invoice_email',
  'currency',
  'payment_term_days',
  'billing_frequency',
  'invoice_delivery_method',
  'peppol_required',
  'peppol_scheme_id',
  'peppol_participant_id',
  'allow_email_fallback',
  'customer_reference_required',
  'customer_reference_label',
  'default_company_bank_account_id',
  'finance_hold',
  'finance_hold_reason',
  'dunning_profile',
  'valid_from',
  'valid_until',
  'metadata',
];
const ADDRESS_PATCH_FIELDS = [
  'customer_account_id',
  'address_type',
  'label',
  'recipient_name',
  'street_name',
  'house_number',
  'house_number_addition',
  'address_line_2',
  'postal_code',
  'city',
  'region',
  'country_code',
  'country_name',
  'formatted_address',
  'is_primary',
  'status',
  'valid_from',
  'valid_until',
  'metadata',
];
const CONTACT_PATCH_FIELDS = [
  'display_name',
  'first_name',
  'middle_name',
  'last_name',
  'job_title',
  'department',
  'preferred_language',
  'preferred_channel',
  'is_primary',
  'status',
  'notes',
  'metadata',
];
const CONTACT_POINT_PATCH_FIELDS = [
  'point_type',
  'label',
  'value',
  'normalized_value',
  'is_primary',
  'purposes',
  'status',
  'consent_status',
  'verified_at',
  'metadata',
];
const CONTACT_ROLE_PATCH_FIELDS = [
  'customer_account_id',
  'role',
  'object_ids',
  'is_primary',
  'status',
  'valid_from',
  'valid_until',
  'notes',
];
const OBJECT_TYPES = new Set([
  'office',
  'retail_hospitality',
  'industrial_logistics',
  'construction_site',
  'healthcare_education',
  'residential',
  'event_temporary',
  'parking',
  'other',
]);
const OBJECT_GEOCODING_STATUSES = new Set(['unverified', 'verified', 'manual']);
const OBJECT_STATUS_TRANSITIONS: Record<string, string[]> = {
  concept: ['active', 'inactive', 'archived'],
  active: ['inactive', 'archived'],
  inactive: ['active', 'archived'],
  archived: ['inactive'],
};
const CUSTOMER_OBJECT_MUTATION_ACTIONS = new Set([
  'create_customer_object',
  'update_customer_object_identity',
  'update_customer_object_operations',
  'set_customer_object_status',
]);
const CUSTOMER_OBJECT_CAS_MUTATION_ACTIONS = new Set([
  'update_customer_object_identity',
  'update_customer_object_operations',
  'set_customer_object_status',
  'reorder_object_warning_addresses',
]);
const CUSTOMER_OBJECT_RECOVERY_LIMIT = 50;
const WARNING_ADDRESS_RECOVERY_LIMIT = 50;
const CUSTOMER_OBJECT_CREATE_RESERVATION_TTL_MS = 30 * 60 * 1000;
const OBJECT_CODE_MUTATION_LOCK_TTL_MS = 30 * 60 * 1000;
const OBJECT_KEY_MUTATION_LOCK_TTL_MS = 2 * 60 * 1000;
const WARNING_ADDRESS_MUTATION_LOCK_TTL_MS = 2 * 60 * 1000;
const OBJECT_INSTALLATION_MUTATION_LOCK_TTL_MS = 2 * 60 * 1000;
const OBJECT_IDENTITY_PATCH_FIELDS = [
  'object_code',
  'external_object_code',
  'name',
  'object_type',
  'logo_file_url',
  'logo_file_id',
  'logo_download_filename',
  'logo_logical_path',
  'address',
  'street_name',
  'house_number',
  'house_number_addition',
  'postal_code',
  'city',
  'country_code',
  'country_name',
  'latitude',
  'longitude',
  'geocoding_status',
  'bag_address_id',
  'region',
];
const WARNING_RELATIONSHIP_TYPES = new Set([
  'keyholder',
  'object_manager',
  'facility_manager',
  'owner_director',
  'alarm_contact',
  'emergency_service',
  'other',
]);
const WARNING_AVAILABILITY_MODES = new Set(['always', 'not_call_periods', 'schedule']);
const WARNING_MUTABLE_STATUSES = new Set(['active', 'inactive']);
const WARNING_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WARNING_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const WARNING_SLOT_START_PATTERN = /^([01]\d|2[0-3]):(?:00|30)$/;
const WARNING_SLOT_END_PATTERN = /^(?:([01]\d|2[0-3]):(?:00|30)|24:00)$/;
const WARNING_AVAILABILITY_KINDS = new Set(['available', 'emergency_only']);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OBJECT_KEY_TYPES = new Set(['key', 'tag', 'remote', 'access_card']);
const OBJECT_KEY_STATUSES = new Set(['in_storage', 'missing', 'out_of_service']);
const OBJECT_INSTALLATION_TYPES = new Set(['alarm_system', 'fire_alarm_system', 'camera_system', 'access_control', 'intercom', 'evacuation_alarm', 'other']);
const OBJECT_INSTALLATION_LIFECYCLES = new Set(['active', 'inactive', 'decommissioned', 'archived']);
const OBJECT_INSTALLATION_OPERATIONAL_STATUSES = new Set(['unknown', 'operational', 'fault', 'maintenance']);
const OBJECT_OPERATIONS_PATCH_FIELDS = [
  'parking_instruction',
  'entry_instruction',
  'walking_instruction',
  'object_notes',
  'safety_notes',
  'show_on_mobile_map',
  'mobile_map_priority',
  'notes',
];
const OBJECT_INSTRUCTION_FIELDS = [
  'parking_instruction',
  'entry_instruction',
  'walking_instruction',
  'object_notes',
  'safety_notes',
];
const QUOTE_PATCH_FIELDS = [
  'title',
  'description',
  'currency',
  'issue_date',
  'valid_until',
  'customer_reference',
  'customer_snapshot',
  'company_snapshot',
  'billing_address_snapshot',
  'subtotal_cents',
  'discount_cents',
  'tax_total_cents',
  'total_cents',
  'tax_summary',
  'template_id',
  'document_managed_file_id',
  'metadata',
];
const QUOTE_LINE_PATCH_FIELDS = [
  'sequence',
  'line_type',
  'service_code',
  'object_id',
  'collective_id',
  'description',
  'quantity_minor',
  'unit',
  'unit_price_cents',
  'discount_basis_points',
  'vat_rate_basis_points',
  'valid_from',
  'valid_until',
  'metadata',
];
const CONTRACT_PATCH_FIELDS = [
  'title',
  'description',
  'currency',
  'start_date',
  'end_date',
  'notice_period_days',
  'auto_renew',
  'billing_frequency',
  'customer_snapshot',
  'company_snapshot',
  'template_id',
  'unsigned_managed_file_id',
  'metadata',
];
const CONTRACT_LINE_PATCH_FIELDS = [
  'sequence',
  'service_code',
  'name',
  'description',
  'scope_type',
  'object_id',
  'collective_id',
  'billing_model',
  'billing_frequency',
  'included_quantity_minor',
  'currency',
  'vat_rate_basis_points',
  'status',
  'valid_from',
  'valid_until',
  'metadata',
];
const RATE_PATCH_FIELDS = [
  'rate_code',
  'unit',
  'amount_cents',
  'currency',
  'vat_rate_basis_points',
  'minimum_quantity_minor',
  'rounding_increment_minor',
  'priority',
  'price_index_profile_id',
  'status',
  'valid_from',
  'valid_until',
  'metadata',
];

const LIST_CONFIG: Record<string, LooseRecord> = {
  quote: {
    entity: 'CustomerQuote',
    searchFields: ['quote_number', 'title', 'customer_reference'],
    sortFields: ['created_date', 'updated_date', 'quote_number', 'valid_until', 'total_cents', 'status'],
  },
  contract: {
    entity: 'CustomerContract',
    searchFields: ['contract_number', 'title'],
    sortFields: ['created_date', 'updated_date', 'contract_number', 'start_date', 'end_date', 'status'],
  },
  rate: {
    entity: 'CustomerContractRate',
    searchFields: ['rate_code'],
    sortFields: ['created_date', 'updated_date', 'valid_from', 'valid_until', 'amount_cents', 'status'],
  },
  candidate: {
    entity: 'BillingCandidate',
    searchFields: ['description', 'block_code', 'block_reason'],
    sortFields: ['created_date', 'updated_date', 'service_date', 'total_cents', 'status'],
  },
  invoice: {
    entity: 'SalesInvoice',
    statusField: 'lifecycle_status',
    searchFields: ['invoice_number', 'customer_reference', 'payment_reference'],
    sortFields: ['created_date', 'updated_date', 'invoice_date', 'due_date', 'total_cents', 'open_cents', 'status'],
  },
  payment: {
    entity: 'Payment',
    searchFields: ['payment_reference', 'external_transaction_id', 'payer_name', 'description'],
    sortFields: ['created_date', 'updated_date', 'received_at', 'amount_cents', 'status'],
  },
  reminder: {
    entity: 'PaymentReminder',
    searchFields: ['failure_reason'],
    sortFields: ['created_date', 'updated_date', 'scheduled_for', 'sequence', 'status'],
  },
  run: {
    entity: 'InvoiceRun',
    searchFields: ['run_number'],
    sortFields: ['created_date', 'updated_date', 'period_start', 'period_end', 'total_cents', 'status'],
  },
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  return nowIso().slice(0, 10);
}

function asString(value: unknown) {
  return String(value ?? '').trim();
}

function requireString(body: LooseRecord, field: string) {
  const value = asString(body[field]);
  if (!value) throw new ApiError(400, `${field} is verplicht`);
  return value;
}

function requireObject(body: LooseRecord, field = 'data') {
  const value = body[field];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, `${field} moet een object zijn`);
  }
  return value as LooseRecord;
}

function requireInteger(value: unknown, field: string, minimum = 0) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new ApiError(400, `${field} moet een geheel getal van minimaal ${minimum} zijn`);
  }
  return number;
}

function requirePositiveCents(value: unknown, field: string) {
  const cents = requireInteger(value, field, 1);
  if (!Number.isSafeInteger(cents)) throw new ApiError(400, `${field} valt buiten het veilige bereik`);
  return cents;
}

function versionOf(record: LooseRecord) {
  const version = Number(record?.version);
  return Number.isInteger(version) && version > 0 ? version : 1;
}

function invoiceLifecycle(invoice: LooseRecord) {
  return invoice.lifecycle_status || invoice.status || 'draft';
}

function invoiceLifecyclePatch(status: string) {
  return { lifecycle_status: status, status };
}

function requireAdmin(user: LooseRecord | null | undefined) {
  if (!user) throw new ApiError(401, 'Niet ingelogd');
  if (user.role !== 'admin') throw new ApiError(403, 'Alleen backofficebeheerders hebben toegang');
}

function requireMutationEnvelope(body: LooseRecord) {
  const idempotencyKey = requireString(body, 'idempotency_key');
  if (idempotencyKey.length > 180) throw new ApiError(400, 'idempotency_key is te lang');
  const expectedVersion = requireInteger(body.expected_version, 'expected_version', 0);
  return { idempotencyKey, expectedVersion };
}

function pick(source: LooseRecord, fields: string[]) {
  return Object.fromEntries(fields.filter(field => Object.prototype.hasOwnProperty.call(source, field)).map(field => [field, source[field]]));
}

function normalizeName(value: unknown) {
  return asString(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeEmail(value: unknown) {
  return asString(value).toLowerCase();
}

function normalizePhone(value: unknown) {
  const valueAsString = asString(value);
  const prefix = valueAsString.startsWith('+') ? '+' : '';
  return prefix + valueAsString.replace(/\D/g, '');
}

function dateOnly(value: unknown) {
  const parsed = new Date(asString(value));
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function plusDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || !Number.isInteger(days)) throw new ApiError(400, 'Ongeldige datumverschuiving');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function previousDay(dateValue: string) {
  return plusDays(dateValue, -1);
}

function isDateInRange(date: string, from: unknown, until: unknown) {
  const lower = asString(from);
  const upper = asString(until);
  return (!lower || lower <= date) && (!upper || upper >= date);
}

function rangesOverlap(fromA: string, untilA: unknown, fromB: string, untilB: unknown) {
  const endA = asString(untilA) || '9999-12-31';
  const endB = asString(untilB) || '9999-12-31';
  return fromA <= endB && fromB <= endA;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function roundHalfUp(value: number) {
  if (!Number.isFinite(value)) throw new ApiError(400, 'Ongeldige financiële berekening');
  return Math.round(value + Number.EPSILON);
}

function calculateAmounts(quantityMinor: number, unitPriceCents: number, vatRateBasisPoints: number) {
  for (const [field, value] of Object.entries({ quantityMinor, unitPriceCents, vatRateBasisPoints })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new ApiError(400, `${field} moet een veilig, niet-negatief geheel getal zijn`);
  }
  if (vatRateBasisPoints > 10000) throw new ApiError(400, 'vat_rate_basis_points mag niet boven 10000 liggen');
  const subtotalCents = roundHalfUp((quantityMinor * unitPriceCents) / 1000);
  const taxCents = roundHalfUp((subtotalCents * vatRateBasisPoints) / 10000);
  if (![subtotalCents, taxCents, subtotalCents + taxCents].every(Number.isSafeInteger)) {
    throw new ApiError(400, 'Financiële berekening valt buiten het veilige bereik');
  }
  return {
    subtotal_cents: subtotalCents,
    tax_cents: taxCents,
    total_cents: subtotalCents + taxCents,
  };
}

function roundQuantity(quantityMinor: number, incrementMinor: number, minimumMinor: number) {
  const quantity = requireInteger(quantityMinor, 'quantity_minor', 0);
  const increment = Math.max(1, requireInteger(incrementMinor || 1, 'rounding_increment_minor', 1));
  const minimum = requireInteger(minimumMinor || 0, 'minimum_quantity_minor', 0);
  return Math.max(minimum, Math.ceil(quantity / increment) * increment);
}

function validateTransition(map: Record<string, string[]>, current: string, requested: string, label: string) {
  if (!(map[current] || []).includes(requested)) {
    throw new ApiError(409, `${label} kan niet van ${current} naar ${requested}`);
  }
}

function billingModelUnit(model: string) {
  return ({
    fixed_period: 'fixed',
    per_execution: 'execution',
    per_minute: 'minute',
    per_hour: 'hour',
    per_unit: 'unit',
    per_kilometer: 'kilometer',
  } as Record<string, string>)[model] || null;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function bytesFromBase64(value: string) {
  const binary = atob(value || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const INSTALLATION_HKDF_KEY_ID = 'managed-file-root-hkdf-object-installation-v1';
const INSTALLATION_CREDENTIAL_CLEANUP_GRACE_MS = 30 * 60 * 1000;

function validInstallationKeyBytes(encoded: string | undefined, message: string) {
  if (!encoded) throw new ApiError(503, message);
  try {
    const bytes = bytesFromBase64(encoded);
    if (bytes.byteLength !== 32) throw new Error('invalid length');
    return bytes;
  } catch {
    throw new ApiError(503, message);
  }
}

async function importInstallationAesKey(bytes: Uint8Array, usages: KeyUsage[] = ['encrypt', 'decrypt']) {
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, usages);
}

function installationDedicatedKeyring() {
  const raw = Deno.env.get('OBJECT_INSTALLATION_MASTER_KEYS_JSON');
  if (!raw) return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid keyring');
    return Object.fromEntries(Object.entries(parsed).flatMap(([keyId, entry]) => {
      const encoded = typeof entry === 'string' ? entry : asString((entry as LooseRecord)?.key_b64);
      return encoded ? [[keyId, encoded]] : [];
    }));
  } catch {
    throw new ApiError(503, 'De historische encryptiesleutels voor installatiecodes zijn ongeldig geconfigureerd');
  }
}

function managedFileKeyring() {
  const raw = Deno.env.get('MANAGED_FILE_MASTER_KEYS_JSON');
  if (!raw) return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid keyring');
    return Object.fromEntries(Object.entries(parsed).flatMap(([keyId, entry]) => {
      const encoded = typeof entry === 'string' ? entry : asString((entry as LooseRecord)?.key_b64);
      return encoded ? [[keyId, encoded]] : [];
    }));
  } catch {
    throw new ApiError(503, 'De historische beheerde hoofdsleutels zijn ongeldig geconfigureerd');
  }
}

function managedFileRootKeyBytes(keyId?: string) {
  const currentKeyId = Deno.env.get('MANAGED_FILE_MASTER_KEY_ID') || 'managed-file-master-v1';
  const requestedKeyId = keyId || currentKeyId;
  const current = requestedKeyId === currentKeyId ? Deno.env.get('MANAGED_FILE_MASTER_KEY_B64') : null;
  return {
    bytes: validInstallationKeyBytes(
      current || managedFileKeyring()[requestedKeyId],
      `De beheerde hoofdsleutel ${requestedKeyId} voor installatiecodes is niet beschikbaar`,
    ),
    keyId: requestedKeyId,
  };
}

async function dedicatedInstallationCredentialKey(keyId: string) {
  const currentKeyId = Deno.env.get('OBJECT_INSTALLATION_MASTER_KEY_ID') || 'object-installation-master-v1';
  const current = keyId === currentKeyId ? Deno.env.get('OBJECT_INSTALLATION_MASTER_KEY_B64') : null;
  const encoded = current || installationDedicatedKeyring()[keyId];
  const bytes = validInstallationKeyBytes(encoded, `De encryptiesleutel ${keyId || 'zonder ID'} voor installatiecodes is niet beschikbaar`);
  return { key: await importInstallationAesKey(bytes), keyId, keySource: 'dedicated' };
}

async function managedFileHkdfInstallationCredentialKey(keyId?: string) {
  const { bytes, keyId: resolvedKeyId } = managedFileRootKeyBytes(keyId);
  const root = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
  return {
    key: await crypto.subtle.deriveKey({
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('LOQ object installation credential salt v1'),
      info: new TextEncoder().encode('customerPlatformApi/ObjectInstallationCredential/AES-256-GCM/v1'),
    }, root, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
    keyId: resolvedKeyId,
    keySource: 'managed_file_hkdf',
  };
}

async function legacyManagedFileInstallationCredentialKey(keyId?: string) {
  const { bytes } = managedFileRootKeyBytes(keyId);
  return { key: await importInstallationAesKey(bytes, ['decrypt']), keySource: 'managed_file_legacy' };
}

async function installationCredentialKey() {
  if (Deno.env.get('OBJECT_INSTALLATION_MASTER_KEY_B64')) {
    return dedicatedInstallationCredentialKey(Deno.env.get('OBJECT_INSTALLATION_MASTER_KEY_ID') || 'object-installation-master-v1');
  }
  return managedFileHkdfInstallationCredentialKey();
}

async function installationCredentialDecryptKey(record: LooseRecord) {
  const keyId = asString(record.encryption_key_id);
  const keySource = asString(record.encryption_key_source);
  if (keySource === 'managed_file_hkdf' || (!keySource && keyId === INSTALLATION_HKDF_KEY_ID)) {
    return (await managedFileHkdfInstallationCredentialKey(keyId === INSTALLATION_HKDF_KEY_ID ? undefined : keyId)).key;
  }
  if (keySource === 'managed_file_legacy') return (await legacyManagedFileInstallationCredentialKey(keyId)).key;
  if (keySource === 'dedicated') return (await dedicatedInstallationCredentialKey(keyId)).key;
  if (keySource) throw new ApiError(409, 'De sleutelbron van een installatiecode is onbekend; handmatige controle vereist');

  // Records van vóór sleutelbronmetadata worden eenduidig afgeleid uit hun key-id.
  const currentDedicatedKeyId = Deno.env.get('OBJECT_INSTALLATION_MASTER_KEY_ID') || 'object-installation-master-v1';
  const dedicatedKeyring = installationDedicatedKeyring();
  if (keyId === currentDedicatedKeyId || dedicatedKeyring[keyId] || keyId.startsWith('object-installation-master-')) {
    return (await dedicatedInstallationCredentialKey(keyId)).key;
  }
  return (await legacyManagedFileInstallationCredentialKey(keyId)).key;
}

async function encryptInstallationCredential(value: string, context: string) {
  const { key, keyId, keySource } = await installationCredentialKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) },
    key,
    new TextEncoder().encode(value),
  );
  return {
    encrypted_value: bytesToBase64(encrypted),
    encryption_iv: bytesToBase64(iv),
    encryption_algorithm: 'AES-256-GCM',
    encryption_key_id: keyId,
    encryption_key_source: keySource,
  };
}

async function decryptInstallationCredential(record: LooseRecord, context: string) {
  const key = await installationCredentialDecryptKey(record);
  try {
    const decrypted = await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: bytesFromBase64(asString(record.encryption_iv)),
      additionalData: new TextEncoder().encode(context),
    }, key, bytesFromBase64(asString(record.encrypted_value)));
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new ApiError(409, 'Een bestaande installatiecode kon niet veilig worden ontsleuteld; handmatige controle vereist');
  }
}

function getEntity(base44: LooseRecord, entityName: string) {
  const handler = base44.asServiceRole.entities[entityName];
  if (!handler) throw new ApiError(500, `Entiteit ${entityName} is niet beschikbaar`);
  return handler;
}

async function getRecord(base44: LooseRecord, entityName: string, id: string) {
  return getEntity(base44, entityName).get(id).catch(() => null);
}

async function requireRecord(base44: LooseRecord, entityName: string, id: string, label = entityName) {
  const record = await getRecord(base44, entityName, id);
  if (!record) throw new ApiError(404, `${label} niet gevonden`);
  return record;
}

async function casUpdate(
  base44: LooseRecord,
  entityName: string,
  record: LooseRecord,
  expectedVersion: number,
  patch: LooseRecord,
) {
  const actualVersion = versionOf(record);
  if (expectedVersion !== actualVersion) {
    throw new ApiError(409, 'Record is intussen gewijzigd', {
      entity: entityName,
      id: record.id,
      expected_version: expectedVersion,
      current_version: actualVersion,
    });
  }

  const hasPersistedVersion = typeof record.version === 'number'
    && Number.isInteger(record.version)
    && record.version > 0;
  const versionQuery = hasPersistedVersion
    ? { version: expectedVersion }
    : record.version == null
      ? { $or: [{ version: null }, { version: { $exists: false } }] }
      : { version: record.version };
  const update = hasPersistedVersion
    ? { $set: patch, $inc: { version: 1 } }
    : { $set: { ...patch, version: expectedVersion + 1 } };
  const result = await getEntity(base44, entityName).updateMany(
    { id: record.id, ...versionQuery },
    update,
  );
  if (!result?.success || result.updated !== 1) {
    throw new ApiError(409, 'Record is intussen gewijzigd', {
      entity: entityName,
      id: record.id,
      expected_version: expectedVersion,
    });
  }
  return requireRecord(base44, entityName, record.id);
}

async function casUpdateLatest(base44: LooseRecord, entityName: string, id: string, patch: LooseRecord, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const record = await requireRecord(base44, entityName, id);
    try {
      return await casUpdate(base44, entityName, record, versionOf(record), patch);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409 || attempt === attempts - 1) throw error;
    }
  }
  throw new ApiError(409, 'Record kon niet veilig worden bijgewerkt');
}

function canonicalMutationValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(item => canonicalMutationValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as LooseRecord)
        .sort()
        .map(key => [key, canonicalMutationValue((value as LooseRecord)[key])]),
    );
  }
  return value;
}

async function mutationFingerprintHmacKey() {
  const dedicated = Deno.env.get('CUSTOMER_PLATFORM_FINGERPRINT_HMAC_KEY_B64');
  if (dedicated) {
    const bytes = validInstallationKeyBytes(dedicated, 'De HMAC-sleutel voor mutatiefingerprints is ongeldig geconfigureerd');
    return crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  }
  const rootBytes = validInstallationKeyBytes(
    Deno.env.get('MANAGED_FILE_MASTER_KEY_B64'),
    'De HMAC-sleutel voor beveiligde mutatiefingerprints is niet geconfigureerd',
  );
  const root = await crypto.subtle.importKey('raw', rootBytes, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: new TextEncoder().encode('LOQ customer platform mutation fingerprint salt v1'),
    info: new TextEncoder().encode('customerPlatformApi/credential-request-fingerprint/HMAC-SHA-256/v1'),
  }, root, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']);
}

async function credentialRequestHmac(credentialType: string, value: unknown) {
  const key = await mutationFingerprintHmacKey();
  const canonical = JSON.stringify(canonicalMutationValue(value));
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${credentialType}\u0000${canonical}`),
  );
  return `hmac-sha256:${[...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function protectedMutationFingerprintValue(value: unknown, key = ''): Promise<unknown> {
  if (key === 'credentials') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(await Promise.all(
        Object.entries(value as LooseRecord)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(async ([credentialType, credentialValue]) => [credentialType, await credentialRequestHmac(credentialType, credentialValue)]),
      ));
    }
    return credentialRequestHmac('credentials', value);
  }
  if (Array.isArray(value)) return Promise.all(value.map(item => protectedMutationFingerprintValue(item)));
  if (value && typeof value === 'object') {
    return Object.fromEntries(await Promise.all(
      Object.entries(value as LooseRecord).map(async ([nestedKey, nestedValue]) => [
        nestedKey,
        await protectedMutationFingerprintValue(nestedValue, nestedKey),
      ]),
    ));
  }
  return value;
}

async function mutationRequestFingerprint(action: string, body: LooseRecord) {
  const requestBody = Object.fromEntries(
    Object.entries(body).filter(([key]) => key !== 'idempotency_key'),
  );
  return sha256(JSON.stringify(canonicalMutationValue({
    action,
    body: await protectedMutationFingerprintValue(requestBody),
  })));
}

function mutationTarget(action: string, body: LooseRecord) {
  const targetFields = [
    'customer_id',
    'object_id',
    'warning_address_id',
    'override_id',
    'key_id',
    'key_assignment_id',
    'installation_id',
    'customer_account_id',
    'request_id',
    'quote_id',
    'contract_id',
    'contract_line_id',
    'contract_rate_id',
    'billing_candidate_id',
    'invoice_id',
    'payment_id',
    'allocation_id',
    'reminder_id',
    'indexation_run_id',
    'task_execution_id',
  ];
  const identifiers = targetFields
    .map(field => [field, asString(body[field])] as const)
    .filter(([, value]) => Boolean(value))
    .map(([field, value]) => `${field}:${value}`);
  return [action, ...identifiers].join('|');
}

function rejectIdempotencyReuse() {
  throw new ApiError(409, 'idempotency_key is al voor een andere mutatie gebruikt');
}

function sanitizedCustomerObjectReplay(storedResult: LooseRecord, customerId: string) {
  const storedObject = storedResult?.object;
  if (
    !storedResult ||
    typeof storedResult !== 'object' ||
    Array.isArray(storedResult) ||
    !storedObject ||
    typeof storedObject !== 'object' ||
    Array.isArray(storedObject) ||
    !asString(storedObject.id)
  ) {
    rejectIdempotencyReuse();
  }
  const transition = storedResult.transition;
  return {
    object: safeObjectMutationSummary({ ...storedObject, customer_id: customerId }, []),
    customer_id: customerId,
    ...(transition && typeof transition === 'object' && !Array.isArray(transition) ? {
      transition: pick(transition, ['from', 'to', 'reason']),
    } : {}),
    replayed: true,
    recovered_partial_creation: storedResult.recovered_partial_creation === true,
    resource_type: 'SurveillanceObject',
    resource_id: storedObject.id,
    category: 'operations',
  };
}

function legacyCustomerObjectCreateReplay(
  matching: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
) {
  const storedResult = matching.payload?.result;
  const storedObject = storedResult?.object;
  const data = requireObject(body);
  const customerId = requireString(body, 'customer_id');
  if (
    !storedResult ||
    typeof storedResult !== 'object' ||
    Array.isArray(storedResult) ||
    !storedObject ||
    typeof storedObject !== 'object' ||
    Array.isArray(storedObject) ||
    !asString(storedObject.id) ||
    matching.actor_id !== user.id ||
    asString(matching.customer_id || storedResult.customer_id || storedObject.customer_id) !== customerId ||
    normalizeName(storedObject.name) !== normalizeName(data.name) ||
    normalizeName(storedObject.address) !== normalizeName(data.address) ||
    asString(storedObject.object_type) !== asString(data.object_type) ||
    !asString(data.name) ||
    !asString(data.address) ||
    !asString(data.object_type)
  ) {
    rejectIdempotencyReuse();
  }
  return {
    ...sanitizedCustomerObjectReplay(storedResult, customerId),
    legacy_event_replay: true,
  };
}

async function mutationReplay(
  base44: LooseRecord,
  user: LooseRecord,
  action: string,
  body: LooseRecord,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const events = await getEntity(base44, 'CustomerEvent').filter({ idempotency_key: idempotencyKey }, '-created_date', 20);
  const matching = events.find((event: LooseRecord) => event.payload?.action === action && event.payload?.result);
  if (matching) {
    const storedFingerprint = asString(matching.payload?.request_fingerprint);
    if (CUSTOMER_OBJECT_MUTATION_ACTIONS.has(action)) {
      if (!storedFingerprint) {
        if (action === 'create_customer_object') {
          return legacyCustomerObjectCreateReplay(matching, user, body);
        }
        rejectIdempotencyReuse();
      }
      if (
        matching.actor_id !== user.id ||
        storedFingerprint !== requestFingerprint ||
        asString(matching.payload?.mutation_target) !== target
      ) {
        rejectIdempotencyReuse();
      }
      const customerId = requireString(body, 'customer_id');
      if (asString(matching.customer_id || matching.payload.result?.customer_id) !== customerId) {
        rejectIdempotencyReuse();
      }
      if (action === 'create_customer_object') {
        await releaseMatchingCustomerObjectCreation(
          base44,
          user,
          customerId,
          idempotencyKey,
          requestFingerprint,
          target,
        );
      }
      return sanitizedCustomerObjectReplay(matching.payload.result, customerId);
    } else if (
      storedFingerprint &&
      (
        matching.actor_id !== user.id ||
        storedFingerprint !== requestFingerprint ||
        asString(matching.payload?.mutation_target) !== target
      )
    ) {
      rejectIdempotencyReuse();
    }
    return matching.payload.result;
  }
  if (events.length) rejectIdempotencyReuse();
  return null;
}

async function customerObjectMutationMarkerReplay(
  base44: LooseRecord,
  user: LooseRecord,
  action: string,
  body: LooseRecord,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  if (!CUSTOMER_OBJECT_CAS_MUTATION_ACTIONS.has(action)) return null;
  const keyHash = await sha256(idempotencyKey);
  const warningOrderReplay = action === 'reorder_object_warning_addresses';
  const keyHashesField = warningOrderReplay
    ? 'warning_address_mutation_key_hashes'
    : 'customer_platform_mutation_key_hashes';
  const lastKeyHashField = warningOrderReplay
    ? 'warning_address_last_mutation_key_hash'
    : 'customer_platform_last_mutation_key_hash';
  const matches = await getEntity(base44, 'SurveillanceObject').filter({
    $or: [
      { [keyHashesField]: { $all: [keyHash] } },
      { [lastKeyHashField]: keyHash },
    ],
  }, '-updated_date', 2);
  if (matches.length > 1) {
    throw new ApiError(409, 'Mutatieherstel is niet eenduidig; handmatige reconciliatie vereist');
  }
  if (!matches.length) return null;

  const object = matches[0];
  const customerId = requireString(body, 'customer_id');
  const objectId = requireString(body, 'object_id');
  const recoveries = warningOrderReplay
    ? object.warning_address_mutation_recoveries
    : object.customer_platform_mutation_recoveries;
  const loggedRecovery = recoveries && typeof recoveries === 'object' && !Array.isArray(recoveries)
    ? recoveries[keyHash]
    : null;
  const recovery = loggedRecovery || (
    object[lastKeyHashField] === keyHash
      ? (warningOrderReplay
        ? object.warning_address_last_mutation_recovery
        : object.customer_platform_last_mutation_recovery)
      : null
  );
  if (
    object.id !== objectId ||
    object.customer_id !== customerId ||
    !recovery ||
    typeof recovery !== 'object' ||
    Array.isArray(recovery) ||
    recovery.action !== action ||
    recovery.actor_id !== user.id ||
    recovery.request_fingerprint !== requestFingerprint ||
    recovery.mutation_target !== target ||
    !recovery.result ||
    typeof recovery.result !== 'object' ||
    Array.isArray(recovery.result)
  ) {
    rejectIdempotencyReuse();
  }
  await requireRecord(base44, 'Customer', customerId, 'Klant');
  return recovery.result as LooseRecord;
}

async function warningAddressMutationMarkerReplay(
  base44: LooseRecord,
  user: LooseRecord,
  action: string,
  body: LooseRecord,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  if (![
    'update_object_warning_address',
    'delete_object_warning_address',
    'upsert_warning_availability_overrides',
    'delete_warning_availability_override',
  ].includes(action)) return null;
  const keyHash = await sha256(idempotencyKey);
  const matches = await getEntity(base44, 'ObjectWarningAddress').filter({
    $or: [
      { customer_platform_mutation_key_hashes: { $all: [keyHash] } },
      { customer_platform_last_mutation_key_hash: keyHash },
    ],
  }, '-updated_date', 2);
  if (matches.length > 1) {
    throw new ApiError(409, 'Waarschuwingsadresherstel is niet eenduidig; handmatige reconciliatie vereist');
  }
  if (!matches.length) return null;
  const warningAddress = matches[0];
  const recoveries = warningAddress.customer_platform_mutation_recoveries;
  const loggedRecovery = recoveries && typeof recoveries === 'object' && !Array.isArray(recoveries)
    ? recoveries[keyHash]
    : null;
  const recovery = loggedRecovery || (
    warningAddress.customer_platform_last_mutation_key_hash === keyHash
      ? warningAddress.customer_platform_last_mutation_recovery
      : null
  );
  if (!recovery) return null;
  if (
    warningAddress.id !== requireString(body, 'warning_address_id') ||
    warningAddress.customer_id !== requireString(body, 'customer_id') ||
    warningAddress.object_id !== requireString(body, 'object_id') ||
    recovery.action !== action ||
    recovery.actor_id !== user.id ||
    recovery.request_fingerprint !== requestFingerprint ||
    recovery.mutation_target !== target ||
    !recovery.result ||
    typeof recovery.result !== 'object' ||
    Array.isArray(recovery.result)
  ) rejectIdempotencyReuse();
  await requireCustomerObjectScope(base44, body);
  let orderProjection: LooseRecord | null = null;
  if (['update_object_warning_address', 'delete_object_warning_address'].includes(action)) {
    orderProjection = await reconcileWarningAddressOrderRecovery(
      base44,
      user,
      action,
      warningAddress,
      recovery,
      idempotencyKey,
      requestFingerprint,
      target,
    );
  }
  if (action === 'delete_object_warning_address') await deactivateWarningRoleIfUnused(base44, warningAddress);
  return {
    ...(recovery.result as LooseRecord),
    ...(orderProjection ? { warning_address_order_version: orderProjection.order_version } : {}),
  };
}

async function installationMutationMarkerReplay(
  base44: LooseRecord,
  user: LooseRecord,
  action: string,
  body: LooseRecord,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  if (!['update_object_installation', 'archive_object_installation'].includes(action)) return null;
  const keyHash = await sha256(idempotencyKey);
  const matches = await getEntity(base44, 'ObjectInstallation').filter({
    $or: [
      { customer_platform_mutation_key_hashes: { $all: [keyHash] } },
      { customer_platform_last_mutation_key_hash: keyHash },
    ],
  }, '-updated_date', 2);
  if (matches.length > 1) throw new ApiError(409, 'Installatieherstel is niet eenduidig; handmatige reconciliatie vereist');
  if (!matches.length) return null;
  const installation = matches[0];
  const recoveries = installation.customer_platform_mutation_recoveries;
  const loggedRecovery = recoveries && typeof recoveries === 'object' && !Array.isArray(recoveries)
    ? recoveries[keyHash]
    : null;
  const recovery = loggedRecovery || (
    installation.customer_platform_last_mutation_key_hash === keyHash
      ? installation.customer_platform_last_mutation_recovery
      : null
  );
  if (
    installation.id !== requireString(body, 'installation_id') ||
    installation.customer_id !== requireString(body, 'customer_id') ||
    installation.object_id !== requireString(body, 'object_id') ||
    !recovery || recovery.action !== action || recovery.actor_id !== user.id ||
    recovery.request_fingerprint !== requestFingerprint || recovery.mutation_target !== target ||
    !recovery.result || typeof recovery.result !== 'object' || Array.isArray(recovery.result)
  ) rejectIdempotencyReuse();
  await requireCustomerObjectScope(base44, body);
  return recovery.result as LooseRecord;
}

async function objectKeyMutationMarkerReplay(
  base44: LooseRecord,
  user: LooseRecord,
  action: string,
  body: LooseRecord,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const entityName = action === 'update_object_key'
    ? 'ObjectKey'
    : action === 'archive_object_key'
      ? 'ObjectKeyAssignment'
      : null;
  if (!entityName) return null;
  const keyHash = await sha256(idempotencyKey);
  const matches = await getEntity(base44, entityName).filter({
    $or: [
      { customer_platform_mutation_key_hashes: { $all: [keyHash] } },
      { customer_platform_last_mutation_key_hash: keyHash },
    ],
  }, '-updated_date', 2);
  if (matches.length > 1) throw new ApiError(409, 'Sleutelherstel is niet eenduidig; handmatige reconciliatie vereist');
  if (!matches.length) return null;
  const record = matches[0];
  const recoveries = record.customer_platform_mutation_recoveries;
  const loggedRecovery = recoveries && typeof recoveries === 'object' && !Array.isArray(recoveries)
    ? recoveries[keyHash]
    : null;
  const recovery = loggedRecovery || (
    record.customer_platform_last_mutation_key_hash === keyHash
      ? record.customer_platform_last_mutation_recovery
      : null
  );
  const expectedRecordId = action === 'update_object_key'
    ? requireString(body, 'key_id')
    : requireString(body, 'key_assignment_id');
  if (
    record.id !== expectedRecordId || !recovery || recovery.action !== action ||
    recovery.actor_id !== user.id || recovery.request_fingerprint !== requestFingerprint ||
    recovery.mutation_target !== target || !recovery.result ||
    typeof recovery.result !== 'object' || Array.isArray(recovery.result) ||
    recovery.result.customer_id !== requireString(body, 'customer_id') ||
    recovery.result.object_id !== requireString(body, 'object_id')
  ) rejectIdempotencyReuse();
  await requireCustomerObjectScope(base44, body);
  return recovery.result as LooseRecord;
}

const MUTATION_ACTION_SUMMARIES: Record<string, string> = {
  create_customer_object: 'Object toegevoegd',
  update_customer_object_identity: 'Objectgegevens gewijzigd',
  update_customer_object_operations: 'Operationele objectgegevens gewijzigd',
  set_customer_object_status: 'Objectstatus gewijzigd',
  create_object_warning_address: 'Waarschuwingsadres toegevoegd', update_object_warning_address: 'Waarschuwingsadres gewijzigd',
  delete_object_warning_address: 'Waarschuwingsadres verwijderd', reorder_object_warning_addresses: 'Belvolgorde waarschuwingsadressen gewijzigd',
  upsert_warning_availability_overrides: 'Specifieke bereikbaarheid gewijzigd',
  delete_warning_availability_override: 'Specifieke bereikbaarheid verwijderd',
  create_object_key: 'Sleutel toegevoegd',
  update_object_key: 'Sleutel gewijzigd',
  archive_object_key: 'Sleutel verwijderd',
  create_object_installation: 'Installatie toegevoegd',
  update_object_installation: 'Installatie gewijzigd',
  archive_object_installation: 'Installatie gearchiveerd',
  create_customer_contact: 'Contactpersoon toegevoegd',
  update_customer_contact: 'Contactpersoon gewijzigd',
  archive_customer_contact: 'Contactpersoon gearchiveerd',
  create_contact_point: 'Contactkanaal toegevoegd',
  update_contact_point: 'Contactkanaal gewijzigd',
  archive_contact_point: 'Contactkanaal gearchiveerd',
  create_contact_role: 'Contactbevoegdheid toegevoegd',
  update_contact_role: 'Contactbevoegdheid gewijzigd',
  archive_contact_role: 'Contactbevoegdheid gearchiveerd',
};

function mutationActionSummary(action: string) {
  return MUTATION_ACTION_SUMMARIES[action] || action.replaceAll('_', ' ');
}

async function appendEvent(base44: LooseRecord, input: LooseRecord) {
  const customerId = asString(input.customer_id);
  if (!customerId) return null;
  const existing = input.idempotency_key
    ? await getEntity(base44, 'CustomerEvent').filter({ idempotency_key: input.idempotency_key }, '-created_date', 1)
    : [];
  if (existing.length) return existing[0];
  return getEntity(base44, 'CustomerEvent').create({
    company_id: input.company_id || null,
    customer_id: customerId,
    customer_account_id: input.customer_account_id || null,
    object_id: input.object_id || null,
    event_type: input.event_type || input.action,
    category: input.category || 'change',
    action: input.action,
    actor_type: input.actor_type || 'user',
    actor_id: input.actor_id || null,
    actor_name: input.actor_name || null,
    actor_user_id: input.actor_user_id || (input.actor_type === 'user' ? input.actor_id || null : null),
    outcome: input.outcome || null,
    summary: input.summary || null,
    source: input.source || 'customerPlatformApi',
    resource_type: input.resource_type || null,
    resource_id: input.resource_id || null,
    payload: input.payload || null,
    visibility: 'internal',
    occurred_at: input.occurred_at || nowIso(),
    idempotency_key: input.idempotency_key || null,
  });
}

function eventContext(result: LooseRecord, body: LooseRecord) {
  const candidate =
    result.customer ||
    result.account ||
    result.address ||
    result.contact ||
    result.contact_point ||
    result.contact_role ||
    result.warning_address ||
    result.object ||
    result.request ||
    result.quote ||
    result.contract ||
    result.contract_line ||
    result.rate ||
    result.candidate ||
    result.invoice ||
    result.payment ||
    result.allocation ||
    result.reminder ||
    result.index_run ||
    {};
  return {
    company_id: candidate.company_id || result.company_id || body.company_id || null,
    customer_id: candidate.customer_id || (result.customer ? result.customer.id : null) || result.customer_id || body.customer_id || null,
    customer_account_id: candidate.customer_account_id || (result.account ? result.account.id : null) || body.customer_account_id || null,
    object_id: candidate.object_id || (result.object ? result.object.id : null) || body.object_id || null,
    resource_type: result.resource_type || null,
    resource_id: result.resource_id || candidate.id || null,
    category: result.category || 'change',
  };
}

async function recordMutationResult(
  base44: LooseRecord,
  user: LooseRecord,
  action: string,
  idempotencyKey: string,
  result: LooseRecord,
  body: LooseRecord,
  requestFingerprint: string,
  target: string,
) {
  const context = eventContext(result, body);
  if (!context.customer_id) return;
  const actorName = asString(user.full_name || user.display_name || user.name || user.email) || 'Backofficegebruiker';
  await appendEvent(base44, {
    ...context,
    event_type: action.replaceAll('_', '.'),
    action,
    actor_id: user.id,
    actor_user_id: user.id,
    actor_name: actorName,
    outcome: result.outcome || 'success',
    summary: result.summary || mutationActionSummary(action),
    idempotency_key: idempotencyKey,
    payload: {
      action,
      result,
      request_fingerprint: requestFingerprint,
      mutation_target: target,
    },
  });
}

function companySnapshot(company: LooseRecord) {
  return {
    id: company.id,
    legal_name: company.legal_name,
    trade_name: company.trade_name || company.display_name,
    kvk_number: company.kvk_number || null,
    vat_number: company.btw_number || null,
    address: {
      street_name: company.street_name || null,
      house_number: company.house_number || null,
      house_number_addition: company.house_number_addition || null,
      postal_code: company.postal_code || null,
      city: company.city || null,
      country: company.country || 'Nederland',
    },
  };
}

function customerSnapshot(customer: LooseRecord, account?: LooseRecord | null) {
  return {
    id: customer.id,
    customer_number: customer.customer_number || null,
    legal_name: customer.legal_name || customer.name,
    trade_name: customer.trade_name || customer.name,
    kvk_number: customer.kvk_number || null,
    vat_number: customer.vat_number || null,
    preferred_language: customer.preferred_language || 'nl',
    customer_account_id: account?.id || null,
    debtor_number: account?.debtor_number || null,
    invoice_email: account?.invoice_email || null,
  };
}

function addressSnapshot(address: LooseRecord | null) {
  if (!address) return {};
  return {
    id: address.id,
    recipient_name: address.recipient_name || null,
    street_name: address.street_name || null,
    house_number: address.house_number || null,
    house_number_addition: address.house_number_addition || null,
    address_line_2: address.address_line_2 || null,
    postal_code: address.postal_code || null,
    city: address.city || null,
    region: address.region || null,
    country_code: address.country_code || 'NL',
    country_name: address.country_name || 'Nederland',
    formatted_address: address.formatted_address || null,
  };
}

function bankSnapshot(bank: LooseRecord | null) {
  if (!bank) return {};
  return {
    id: bank.id,
    account_holder_name: bank.account_holder_name || null,
    iban_masked: bank.iban_masked || null,
    bank_name: bank.bank_name || null,
    bic: bank.bic || null,
  };
}

async function loadBillingSnapshots(base44: LooseRecord, companyId: string, customerId: string, accountId: string) {
  const [company, customer, account] = await Promise.all([
    requireRecord(base44, 'Company', companyId, 'Bedrijf'),
    requireRecord(base44, 'Customer', customerId, 'Klant'),
    requireRecord(base44, 'CustomerAccount', accountId, 'Klantrelatie'),
  ]);
  if (account.customer_id !== customerId || account.company_id !== companyId) {
    throw new ApiError(409, 'Klantrelatie hoort niet bij deze klant en BV');
  }
  const addresses = await getEntity(base44, 'CustomerAddress').filter({
    customer_id: customerId,
    status: 'active',
  }, '-is_primary', 200);
  const address =
    addresses.find((item: LooseRecord) => item.id === account.billing_address_id) ||
    addresses.find((item: LooseRecord) => item.customer_account_id === account.id && item.address_type === 'billing') ||
    addresses.find((item: LooseRecord) => item.address_type === 'billing' && item.is_primary) ||
    addresses.find((item: LooseRecord) => item.address_type === 'visiting' && item.is_primary) ||
    null;
  const settings = (await getEntity(base44, 'CompanyBillingSettings').filter({ company_id: companyId }, '-updated_date', 1))[0] || null;
  const bankId = account.default_company_bank_account_id || settings?.invoice_bank_account_id || settings?.default_bank_account_id;
  const bank = bankId ? await getRecord(base44, 'CompanyBankAccount', bankId) : null;
  return {
    company,
    customer,
    account,
    settings,
    company_snapshot: companySnapshot(company),
    customer_snapshot: customerSnapshot(customer, account),
    billing_address_snapshot: addressSnapshot(address),
    bank_account_snapshot: bankSnapshot(bank),
  };
}

function formatNumber(sequence: LooseRecord, number: number) {
  return `${sequence.prefix || ''}${String(number).padStart(Math.max(1, Number(sequence.padding) || 1), '0')}`;
}

async function reserveCommercialNumber(
  base44: LooseRecord,
  input: {
    companyId: string;
    documentType: string;
    fiscalYear: number;
    idempotencyKey: string;
    resourceType: string;
    resourceId: string;
  },
) {
  const reservations = await getEntity(base44, 'CommercialNumberReservation').filter({
    company_id: input.companyId,
    document_type: input.documentType,
    fiscal_year: input.fiscalYear,
    idempotency_key: input.idempotencyKey,
  }, '-created_date', 10);
  if (reservations.length) {
    const existing = reservations[0];
    if (
      (existing.resource_id && existing.resource_id !== input.resourceId) ||
      (existing.resource_type && existing.resource_type !== input.resourceType)
    ) {
      throw new ApiError(409, 'Nummerreservering hoort bij een ander document');
    }
    return existing;
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const sequences = await getEntity(base44, 'CommercialNumberSequence').filter({
      company_id: input.companyId,
      document_type: input.documentType,
      fiscal_year: input.fiscalYear,
      status: 'active',
    }, '-updated_date', 2);
    if (sequences.length !== 1) {
      throw new ApiError(409, 'Er moet exact één actieve nummerreeks bestaan', {
        company_id: input.companyId,
        document_type: input.documentType,
        fiscal_year: input.fiscalYear,
        matches: sequences.length,
      });
    }
    const sequence = sequences[0];

    if (
      sequence.last_idempotency_key === input.idempotencyKey &&
      sequence.last_issue_token_hash &&
      Number.isInteger(Number(sequence.last_reserved_number))
    ) {
      if (
        sequence.last_resource_id !== input.resourceId ||
        sequence.last_resource_type !== input.resourceType
      ) {
        throw new ApiError(409, 'idempotency_key is al door een ander document geclaimd');
      }
      const recovered = await getEntity(base44, 'CommercialNumberReservation').create({
        sequence_id: sequence.id,
        company_id: input.companyId,
        document_type: input.documentType,
        fiscal_year: input.fiscalYear,
        idempotency_key: input.idempotencyKey,
        issue_token_hash: sequence.last_issue_token_hash,
        reserved_number: Number(sequence.last_reserved_number),
        formatted_number: formatNumber(sequence, Number(sequence.last_reserved_number)),
        status: 'reserved',
        resource_type: input.resourceType,
        resource_id: input.resourceId,
        reserved_at: sequence.last_reserved_at || nowIso(),
        version: 1,
      }).catch(async () => {
        const retry = await getEntity(base44, 'CommercialNumberReservation').filter({
          company_id: input.companyId,
          document_type: input.documentType,
          fiscal_year: input.fiscalYear,
          idempotency_key: input.idempotencyKey,
        }, '-created_date', 1);
        const existing = retry[0] || null;
        if (
          existing &&
          (existing.resource_id !== input.resourceId || existing.resource_type !== input.resourceType)
        ) {
          throw new ApiError(409, 'Nummerreservering hoort bij een ander document');
        }
        return existing;
      });
      if (recovered) return recovered;
    }

    const reservedNumber = requireInteger(sequence.next_number, 'next_number', 1);
    const issueTokenHash = await sha256(`${input.idempotencyKey}|${crypto.randomUUID()}`);
    const result = await getEntity(base44, 'CommercialNumberSequence').updateMany(
      {
        id: sequence.id,
        version: versionOf(sequence),
        next_number: reservedNumber,
        status: 'active',
      },
      {
        $inc: { next_number: 1, version: 1 },
        $set: {
          last_reserved_number: reservedNumber,
          last_reserved_at: nowIso(),
          last_issue_token_hash: issueTokenHash,
          last_idempotency_key: input.idempotencyKey,
          last_resource_type: input.resourceType,
          last_resource_id: input.resourceId,
        },
      },
    );
    if (result?.success && result.updated === 1) {
      return getEntity(base44, 'CommercialNumberReservation').create({
        sequence_id: sequence.id,
        company_id: input.companyId,
        document_type: input.documentType,
        fiscal_year: input.fiscalYear,
        idempotency_key: input.idempotencyKey,
        issue_token_hash: issueTokenHash,
        reserved_number: reservedNumber,
        formatted_number: formatNumber(sequence, reservedNumber),
        status: 'reserved',
        resource_type: input.resourceType,
        resource_id: input.resourceId,
        reserved_at: nowIso(),
        version: 1,
      });
    }
  }
  throw new ApiError(409, 'Nummer kon door gelijktijdige uitgifte niet worden gereserveerd');
}

async function markReservation(
  base44: LooseRecord,
  reservation: LooseRecord,
  status: 'issued' | 'issue_failed',
  details: LooseRecord = {},
) {
  const patch = status === 'issued'
    ? { status, issued_at: nowIso(), ...details }
    : { status, failed_at: nowIso(), ...details };
  return casUpdateLatest(base44, 'CommercialNumberReservation', reservation.id, patch);
}

async function syncLegacyMirrors(base44: LooseRecord, customerId: string) {
  const [customer, contacts, points, addresses, accounts] = await Promise.all([
    requireRecord(base44, 'Customer', customerId, 'Klant'),
    getEntity(base44, 'CustomerContact').filter({ customer_id: customerId, status: 'active' }, '-is_primary', 250),
    getEntity(base44, 'CustomerContactPoint').filter({ customer_id: customerId, status: 'active' }, '-is_primary', 500),
    getEntity(base44, 'CustomerAddress').filter({ customer_id: customerId, status: 'active' }, '-is_primary', 250),
    getEntity(base44, 'CustomerAccount').filter({ customer_id: customerId, status: { $in: ['active', 'pending'] } }, '-is_primary', 100),
  ]);
  const primaryContact = contacts.find((item: LooseRecord) => item.is_primary) || contacts[0] || null;
  const primaryPoints = points.filter((item: LooseRecord) => item.contact_id === primaryContact?.id);
  const primaryEmail = primaryPoints.find((item: LooseRecord) => item.point_type === 'email' && item.is_primary) ||
    primaryPoints.find((item: LooseRecord) => item.point_type === 'email');
  const primaryPhone = primaryPoints.find((item: LooseRecord) => ['mobile', 'phone'].includes(item.point_type) && item.is_primary) ||
    primaryPoints.find((item: LooseRecord) => ['mobile', 'phone'].includes(item.point_type));
  const primaryAddress = addresses.find((item: LooseRecord) => item.address_type === 'visiting' && item.is_primary) ||
    addresses.find((item: LooseRecord) => item.address_type === 'visiting') ||
    addresses[0] ||
    null;
  const primaryAccount = accounts.find((item: LooseRecord) => item.is_primary) || accounts[0] || null;
  const displayName = customer.trade_name || customer.legal_name || customer.name;
  return casUpdateLatest(base44, 'Customer', customer.id, {
    name: displayName,
    normalized_name: normalizeName(displayName),
    contact_person: primaryContact?.display_name || '',
    email: primaryEmail?.value || '',
    phone: primaryPhone?.value || '',
    address: primaryAddress?.formatted_address ||
      [
        primaryAddress?.street_name,
        primaryAddress?.house_number,
        primaryAddress?.house_number_addition,
        primaryAddress?.postal_code,
        primaryAddress?.city,
      ].filter(Boolean).join(' '),
    primary_contact_id: primaryContact?.id || null,
    primary_customer_account_id: primaryAccount?.id || null,
  });
}

async function listRecords(base44: LooseRecord, body: LooseRecord, allowedViews: string[]) {
  const view = asString(body.view);
  if (!allowedViews.includes(view)) throw new ApiError(400, `view moet één van ${allowedViews.join(', ')} zijn`);
  const config = LIST_CONFIG[view];
  const page = requireInteger(body.page ?? 1, 'page', 1);
  const pageSize = Math.min(100, requireInteger(body.page_size ?? 25, 'page_size', 1));
  const companyId = asString(body.company_id);
  const status = asString(body.status);
  const customerId = asString(body.customer_id);
  const query: LooseRecord = {};
  if (companyId) query.company_id = companyId;
  if (customerId) query.customer_id = customerId;
  if (status) query[config.statusField || 'status'] = status;
  const search = asString(body.search);
  if (search && config.searchFields.length) {
    const regex = escapeRegex(search.slice(0, 120));
    query.$or = config.searchFields.map((field: string) => ({ [field]: { $regex: regex, $options: 'i' } }));
  }
  const requestedSort = asString(body.sort) || '-created_date';
  const field = requestedSort.replace(/^[+-]/, '');
  const sort = config.sortFields.includes(field) ? requestedSort : '-created_date';
  const entity = getEntity(base44, config.entity);
  const skip = (page - 1) * pageSize;
  const [items, ids, settings] = await Promise.all([
    entity.filter(query, sort, pageSize, skip),
    entity.filter(query, '+created_date', 5000, 0, ['id']),
    companyId
      ? getEntity(base44, 'CompanyBillingSettings').filter({ company_id: companyId }, '-updated_date', 1)
      : Promise.resolve([]),
  ]);
  let responseItems = items;
  if (view === 'candidate') {
    const executionIds = [...new Set(
      items.map((item: LooseRecord) => asString(item.task_execution_id)).filter(Boolean),
    )];
    const executions = executionIds.length
      ? await getEntity(base44, 'TaskExecution').filter(
        { id: { $in: executionIds } },
        '+created_date',
        executionIds.length,
        0,
        ['id', 'version'],
      )
      : [];
    const executionVersions = new Map(
      executions.map((execution: LooseRecord) => [execution.id, versionOf(execution)]),
    );
    responseItems = items.map((item: LooseRecord) => ({
      ...item,
      task_execution_version: item.task_execution_id
        ? executionVersions.get(item.task_execution_id) ?? null
        : null,
    }));
  }
  return {
    items: responseItems,
    total: ids.length,
    page,
    page_size: pageSize,
    total_is_capped: ids.length === 5000,
    feature_flags: settings[0]
      ? {
        commercial_contracts: settings[0].commercial_contracts_enabled === true || settings[0].feature_flags?.commercial_contracts === true,
        billing_shadow: settings[0].billing_shadow_mode === true || settings[0].feature_flags?.billing_shadow === true,
        invoice_issue: settings[0].invoice_issue_enabled === true || settings[0].feature_flags?.invoice_issue === true,
        auto_send: settings[0].auto_send_enabled === true || settings[0].feature_flags?.auto_send === true,
        collections: settings[0].collections_enabled === true || settings[0].feature_flags?.collections === true,
        peppol: settings[0].peppol_enabled === true || settings[0].feature_flags?.peppol === true,
        customer_portal: settings[0].customer_portal_enabled === true || settings[0].feature_flags?.customer_portal === true,
      }
      : {},
  };
}

function validateRateShape(data: LooseRecord): LooseRecord {
  const amount = requireInteger(data.amount_cents, 'amount_cents', 0);
  const vat = requireInteger(data.vat_rate_basis_points ?? 2100, 'vat_rate_basis_points', 0);
  if (vat > 10000) throw new ApiError(400, 'vat_rate_basis_points mag niet boven 10000 liggen');
  const validFrom = dateOnly(data.valid_from);
  if (!validFrom) throw new ApiError(400, 'valid_from moet een geldige datum zijn');
  const validUntil = data.valid_until ? dateOnly(data.valid_until) : null;
  if (validUntil && validUntil < validFrom) throw new ApiError(400, 'valid_until ligt vóór valid_from');
  const allowedUnits = ['fixed', 'execution', 'minute', 'hour', 'unit', 'kilometer'];
  if (!allowedUnits.includes(data.unit)) throw new ApiError(400, 'Ongeldige tariefeenheid');
  return {
    ...data,
    amount_cents: amount,
    vat_rate_basis_points: vat,
    valid_from: validFrom,
    valid_until: validUntil,
  };
}

async function rateValidation(base44: LooseRecord, contractLineId: string, excludeRateId?: string) {
  const rates = (await getEntity(base44, 'CustomerContractRate').filter({
    contract_line_id: contractLineId,
    status: { $in: ['active', 'draft'] },
  }, '+valid_from', 1000)).filter((rate: LooseRecord) => rate.id !== excludeRateId);
  const overlaps: LooseRecord[] = [];
  const gaps: LooseRecord[] = [];
  const byUnit = new Map<string, LooseRecord[]>();
  for (const rate of rates) {
    const list = byUnit.get(rate.unit) || [];
    list.push(rate);
    byUnit.set(rate.unit, list);
  }
  for (const [unit, unitRates] of byUnit) {
    unitRates.sort((a, b) => asString(a.valid_from).localeCompare(asString(b.valid_from)));
    for (let index = 0; index < unitRates.length; index += 1) {
      for (let compare = index + 1; compare < unitRates.length; compare += 1) {
        if (rangesOverlap(
          asString(unitRates[index].valid_from),
          unitRates[index].valid_until,
          asString(unitRates[compare].valid_from),
          unitRates[compare].valid_until,
        )) {
          overlaps.push({ unit, rate_ids: [unitRates[index].id, unitRates[compare].id] });
        }
      }
      const next = unitRates[index + 1];
      const currentUntil = asString(unitRates[index].valid_until);
      if (next && currentUntil && plusDays(currentUntil, 1) < asString(next.valid_from)) {
        gaps.push({
          unit,
          after_rate_id: unitRates[index].id,
          before_rate_id: next.id,
          from: plusDays(currentUntil, 1),
          until: previousDay(asString(next.valid_from)),
        });
      }
    }
  }
  return { rates, overlaps, gaps, valid: overlaps.length === 0 };
}

function rawQuantityForExecution(execution: LooseRecord, unit: string) {
  if (Number.isInteger(Number(execution.billable_quantity_minor)) && Number(execution.billable_quantity_minor) >= 0) {
    return Number(execution.billable_quantity_minor);
  }
  if (unit === 'fixed' || unit === 'execution' || unit === 'unit') return 1000;
  if (unit === 'minute') return Math.max(0, Number(execution.duration_minutes) || 0) * 1000;
  if (unit === 'hour') return roundHalfUp((Math.max(0, Number(execution.duration_minutes) || 0) * 1000) / 60);
  if (unit === 'kilometer') {
    const km = Number(execution.distance_from_previous_km || execution.metadata?.billable_distance_km || 0);
    return roundHalfUp(Math.max(0, km) * 1000);
  }
  return 0;
}

function blockedCandidateData(execution: LooseRecord, context: LooseRecord, code: string, reason: string, idempotencyKey: string) {
  return {
    company_id: context.company_id || execution.selling_company_id || execution.operating_company_id || 'unresolved',
    customer_id: context.customer_id || execution.customer_id || 'unresolved',
    customer_account_id: context.customer_account_id || execution.customer_account_id || 'unresolved',
    source_type: 'task_execution',
    source_id: execution.id,
    task_execution_id: execution.id,
    customer_contract_id: context.contract?.id || execution.customer_contract_id || null,
    customer_contract_line_id: context.line?.id || execution.customer_contract_line_id || null,
    customer_contract_rate_id: context.rate?.id || execution.customer_contract_rate_id || null,
    candidate_type: 'charge',
    status: 'blocked',
    block_code: code,
    block_reason: reason,
    service_date: context.service_date || null,
    description: execution.task_name || execution.task_type || 'Uitvoering',
    quantity_minor: 0,
    unit: context.unit || execution.billable_unit || 'execution',
    unit_price_cents: 0,
    subtotal_cents: 0,
    vat_rate_basis_points: 0,
    tax_cents: 0,
    total_cents: 0,
    currency: context.currency || execution.billing_currency || 'EUR',
    pricing_snapshot: {
      blocked: true,
      block_code: code,
      evaluated_at: nowIso(),
      execution_version: versionOf(execution),
    },
    customer_snapshot: execution.customer_snapshot || {},
    idempotency_key: idempotencyKey,
    version: 1,
  };
}

async function findExecutionPricing(base44: LooseRecord, execution: LooseRecord) {
  const context: LooseRecord = {};
  const [routeExecution, sourceTask, object] = await Promise.all([
    execution.route_execution_id ? getRecord(base44, 'RouteExecution', execution.route_execution_id) : null,
    execution.original_task_id ? getRecord(base44, 'Task', execution.original_task_id) : null,
    execution.object_id ? getRecord(base44, 'SurveillanceObject', execution.object_id) : null,
  ]);
  context.service_date =
    dateOnly(routeExecution?.service_date) ||
    dateOnly(execution.actual_completed_at) ||
    dateOnly(execution.actual_started_at) ||
    todayIso();
  context.customer_id = execution.customer_id || object?.customer_id || null;
  context.company_id = execution.selling_company_id || null;
  context.customer_account_id = execution.customer_account_id || null;

  if (execution.status !== 'completed') {
    return { context, blocked: ['execution_not_completed', 'De uitvoering is niet voltooid'] };
  }
  if (!execution.customer_billable) {
    return { context, blocked: ['not_customer_billable', 'De uitvoering is niet als klantfactureerbaar gemarkeerd'] };
  }
  if (execution.financial_review_status !== 'approved') {
    return { context, blocked: ['financial_review_required', 'Financiële goedkeuring ontbreekt'] };
  }
  if (!context.customer_id) {
    return { context, blocked: ['missing_customer', 'De uitvoering heeft geen klant-snapshot'] };
  }
  if (!context.company_id) {
    return { context, blocked: ['missing_selling_company', 'De verkopende BV ontbreekt'] };
  }

  const accounts = context.customer_account_id
    ? [await getRecord(base44, 'CustomerAccount', context.customer_account_id)].filter(Boolean)
    : await getEntity(base44, 'CustomerAccount').filter({
      customer_id: context.customer_id,
      company_id: context.company_id,
      status: 'active',
    }, '-is_primary', 10);
  if (accounts.length !== 1) {
    return {
      context,
      blocked: [
        accounts.length ? 'ambiguous_customer_account' : 'missing_customer_account',
        accounts.length ? 'Meerdere klantrelaties passen bij deze uitvoering' : 'Geen actieve klantrelatie gevonden',
      ],
    };
  }
  const account = accounts[0];
  context.customer_account_id = account.id;
  if (account.customer_id !== context.customer_id || account.company_id !== context.company_id) {
    return { context, blocked: ['company_mismatch', 'Klantrelatie, klant en verkopende BV komen niet overeen'] };
  }
  if (account.finance_hold) {
    return { context, blocked: ['finance_hold', account.finance_hold_reason || 'Klantrelatie staat op financiële blokkade'] };
  }

  let contracts: LooseRecord[] = [];
  if (execution.customer_contract_id) {
    const selected = await getRecord(base44, 'CustomerContract', execution.customer_contract_id);
    if (!selected) return { context, blocked: ['missing_contract', 'Geselecteerd contract bestaat niet'] };
    if (
      selected.company_id !== context.company_id ||
      selected.customer_id !== context.customer_id ||
      selected.customer_account_id !== account.id
    ) {
      return { context, blocked: ['company_mismatch', 'Geselecteerd contract hoort bij een andere klant, relatie of BV'] };
    }
    if (selected.status !== 'active') {
      return { context, blocked: ['invalid_contract_status', `Geselecteerd contract heeft status ${selected.status}`] };
    }
    contracts = [selected];
  } else {
    contracts = await getEntity(base44, 'CustomerContract').filter({
      customer_account_id: account.id,
      company_id: context.company_id,
      customer_id: context.customer_id,
      status: 'active',
    }, '-start_date', 100);
  }
  contracts = contracts.filter(contract =>
    contract.status === 'active' &&
    contract.company_id === context.company_id &&
    contract.customer_id === context.customer_id &&
    contract.customer_account_id === account.id &&
    isDateInRange(context.service_date, contract.start_date, contract.end_date));
  if (contracts.length !== 1) {
    return {
      context,
      blocked: [
        contracts.length ? 'overlapping_contract' : 'invalid_contract_status',
        contracts.length ? 'Meerdere actieve contracten passen bij de uitvoeringsdatum' : 'Geen actief contract voor de uitvoeringsdatum',
      ],
    };
  }
  context.contract = contracts[0];

  let lines: LooseRecord[] = [];
  if (execution.customer_contract_line_id) {
    const selected = await getRecord(base44, 'CustomerContractLine', execution.customer_contract_line_id);
    if (!selected) return { context, blocked: ['missing_contract_line', 'Geselecteerde contractregel bestaat niet'] };
    if (selected.contract_id !== context.contract.id) {
      return { context, blocked: ['contract_line_mismatch', 'Geselecteerde contractregel hoort bij een ander contract'] };
    }
    if (selected.status !== 'active') {
      return { context, blocked: ['invalid_contract_line_status', `Geselecteerde contractregel heeft status ${selected.status}`] };
    }
    lines = [selected];
  } else {
    lines = await getEntity(base44, 'CustomerContractLine').filter({
      contract_id: context.contract.id,
      status: 'active',
    }, '+sequence', 500);
  }
  lines = lines.filter(line => {
    if (
      line.contract_id !== context.contract.id ||
      line.status !== 'active' ||
      !isDateInRange(context.service_date, line.valid_from, line.valid_until)
    ) return false;
    if (line.service_code && line.service_code !== sourceTask?.task_type && line.service_code !== execution.task_type) return false;
    if (line.scope_type === 'object') return line.object_id === execution.object_id;
    if (line.scope_type === 'collective') return Boolean(sourceTask?.collectief_id && line.collective_id === sourceTask.collectief_id);
    return line.scope_type === 'customer';
  });
  if (lines.length !== 1) {
    return {
      context,
      blocked: [
        lines.length ? 'overlapping_contract_line' : 'missing_contract_line',
        lines.length ? 'Meerdere contractregels passen bij deze uitvoering' : 'Geen contractregel past bij dienst en objectscope',
      ],
    };
  }
  context.line = lines[0];
  context.unit = billingModelUnit(context.line.billing_model);
  if (!context.unit) return { context, blocked: ['unsupported_billing_model', 'Facturatiemodel wordt niet ondersteund'] };

  let rates: LooseRecord[] = [];
  if (execution.customer_contract_rate_id) {
    const selected = await getRecord(base44, 'CustomerContractRate', execution.customer_contract_rate_id);
    if (!selected) return { context, blocked: ['missing_rate', 'Geselecteerd tarief bestaat niet'] };
    if (
      selected.contract_id !== context.contract.id ||
      selected.contract_line_id !== context.line.id ||
      selected.company_id !== context.company_id ||
      selected.customer_id !== context.customer_id ||
      selected.customer_account_id !== account.id
    ) {
      return { context, blocked: ['company_mismatch', 'Geselecteerd tarief hoort bij een andere contractregel, klantrelatie of BV'] };
    }
    if (!['active', 'superseded', 'ended'].includes(selected.status)) {
      return { context, blocked: ['invalid_rate_status', `Geselecteerd tarief heeft status ${selected.status}`] };
    }
    rates = [selected];
  } else {
    rates = await getEntity(base44, 'CustomerContractRate').filter({
      contract_line_id: context.line.id,
      status: { $in: ['active', 'superseded', 'ended'] },
      unit: context.unit,
    }, '-priority', 500);
  }
  rates = rates.filter(rate =>
    rate.contract_id === context.contract.id &&
    rate.company_id === context.company_id &&
    rate.customer_id === context.customer_id &&
    rate.customer_account_id === account.id &&
    rate.unit === context.unit &&
    ['active', 'superseded', 'ended'].includes(rate.status) &&
    isDateInRange(context.service_date, rate.valid_from, rate.valid_until));
  if (rates.length !== 1) {
    return {
      context,
      blocked: [
        rates.length ? 'overlapping_rate' : 'missing_rate',
        rates.length ? 'Meerdere actieve tarieven overlappen op de uitvoeringsdatum' : 'Geen geldig tarief op de uitvoeringsdatum',
      ],
    };
  }
  context.rate = rates[0];
  context.currency = context.rate.currency || context.contract.currency || account.currency || 'EUR';
  return { context, blocked: null };
}

export async function materializeBillingCandidate(
  base44: LooseRecord,
  input: {
    executionId: string;
    expectedVersion: number;
    idempotencyKey: string;
    actorId?: string | null;
    actorType?: 'user' | 'system';
  },
) {
  const existing = await getEntity(base44, 'BillingCandidate').filter({
    idempotency_key: input.idempotencyKey,
  }, '-created_date', 1);
  if (existing.length) return { candidate: existing[0], replayed: true };

  const execution = await requireRecord(base44, 'TaskExecution', input.executionId, 'Uitvoering');
  if (versionOf(execution) !== input.expectedVersion) {
    throw new ApiError(409, 'Uitvoering is intussen gewijzigd', {
      expected_version: input.expectedVersion,
      current_version: versionOf(execution),
    });
  }
  if (execution.billing_candidate_id) {
    const candidate = await getRecord(base44, 'BillingCandidate', execution.billing_candidate_id);
    if (candidate) return { candidate, replayed: true };
  }

  const evaluated = await findExecutionPricing(base44, execution);
  let candidateData: LooseRecord;
  if (evaluated.blocked) {
    candidateData = blockedCandidateData(
      execution,
      evaluated.context,
      evaluated.blocked[0],
      evaluated.blocked[1],
      input.idempotencyKey,
    );
  } else {
    const { context } = evaluated;
    const rawQuantity = rawQuantityForExecution(execution, context.unit);
    const quantityMinor = roundQuantity(
      rawQuantity,
      Number(context.rate.rounding_increment_minor) || 1,
      Number(context.rate.minimum_quantity_minor) || 0,
    );
    const amounts = calculateAmounts(
      quantityMinor,
      Number(context.rate.amount_cents),
      Number(context.rate.vat_rate_basis_points),
    );
    candidateData = {
      company_id: context.company_id,
      customer_id: context.customer_id,
      customer_account_id: context.customer_account_id,
      source_type: 'task_execution',
      source_id: execution.id,
      task_execution_id: execution.id,
      customer_contract_id: context.contract.id,
      customer_contract_line_id: context.line.id,
      customer_contract_rate_id: context.rate.id,
      candidate_type: 'charge',
      status: 'pending',
      block_code: null,
      block_reason: null,
      service_date: context.service_date,
      description: execution.task_name || context.line.name,
      quantity_minor: quantityMinor,
      unit: context.unit,
      unit_price_cents: Number(context.rate.amount_cents),
      ...amounts,
      currency: context.currency,
      pricing_snapshot: {
        contract_id: context.contract.id,
        contract_version: versionOf(context.contract),
        contract_line_id: context.line.id,
        contract_rate_id: context.rate.id,
        contract_rate_version: versionOf(context.rate),
        rate_valid_from: context.rate.valid_from,
        rate_valid_until: context.rate.valid_until || null,
        evaluated_on_service_date: context.service_date,
        evaluated_at: nowIso(),
        raw_quantity_minor: rawQuantity,
        rounded_quantity_minor: quantityMinor,
      },
      customer_snapshot: execution.customer_snapshot || {},
      idempotency_key: input.idempotencyKey,
      version: 1,
    };
  }

  const candidate = await getEntity(base44, 'BillingCandidate').create(candidateData);
  const billingStatus = candidate.status === 'blocked' ? 'candidate_blocked' : 'candidate_pending';
  await casUpdate(base44, 'TaskExecution', execution, input.expectedVersion, {
    billing_candidate_id: candidate.id,
    billing_status: billingStatus,
    customer_id: candidate.customer_id === 'unresolved' ? execution.customer_id || null : candidate.customer_id,
    customer_account_id: candidate.customer_account_id === 'unresolved' ? execution.customer_account_id || null : candidate.customer_account_id,
    selling_company_id: candidate.company_id === 'unresolved' ? execution.selling_company_id || null : candidate.company_id,
    customer_contract_id: candidate.customer_contract_id,
    customer_contract_line_id: candidate.customer_contract_line_id,
    customer_contract_rate_id: candidate.customer_contract_rate_id,
    commercial_rate_snapshot: candidate.pricing_snapshot,
    billable_quantity_minor: candidate.quantity_minor,
    billable_unit: candidate.unit,
    billable_unit_price_cents: candidate.unit_price_cents,
    billable_subtotal_cents: candidate.subtotal_cents,
    billable_vat_rate_basis_points: candidate.vat_rate_basis_points,
    billable_tax_cents: candidate.tax_cents,
    billable_total_cents: candidate.total_cents,
    billing_currency: candidate.currency,
  });
  if (candidate.customer_id !== 'unresolved') {
    await appendEvent(base44, {
      company_id: candidate.company_id,
      customer_id: candidate.customer_id,
      customer_account_id: candidate.customer_account_id,
      object_id: execution.object_id || null,
      event_type: candidate.status === 'blocked' ? 'billing.candidate_blocked' : 'billing.candidate_created',
      category: 'billing',
      action: 'create_billing_candidate',
      actor_type: input.actorType || 'user',
      actor_id: input.actorId || null,
      resource_type: 'BillingCandidate',
      resource_id: candidate.id,
      payload: {
        action: 'create_billing_candidate',
        result: { candidate },
        block_code: candidate.block_code || null,
      },
      idempotency_key: input.idempotencyKey,
    });
  }
  return { candidate, replayed: false };
}

function invoiceLineFromCandidate(candidate: LooseRecord, invoice: LooseRecord, sequence: number) {
  return {
    invoice_id: invoice.id,
    company_id: candidate.company_id,
    customer_id: candidate.customer_id,
    customer_account_id: candidate.customer_account_id,
    billing_candidate_id: candidate.id,
    source_type: candidate.source_type,
    source_id: candidate.source_id,
    sequence,
    line_type: candidate.candidate_type === 'credit' ? 'correction' : 'service',
    description: candidate.description,
    service_date: candidate.service_date || null,
    period_start: candidate.period_start || null,
    period_end: candidate.period_end || null,
    quantity_minor: candidate.quantity_minor,
    unit: candidate.unit,
    unit_price_cents: candidate.unit_price_cents,
    subtotal_cents: candidate.subtotal_cents,
    vat_rate_basis_points: candidate.vat_rate_basis_points,
    tax_cents: candidate.tax_cents,
    total_cents: candidate.total_cents,
    source_snapshot: {
      source_type: candidate.source_type,
      source_id: candidate.source_id,
      billing_candidate_id: candidate.id,
      candidate_version: versionOf(candidate),
    },
    pricing_snapshot: candidate.pricing_snapshot,
    version: 1,
  };
}

async function createInvoiceFromCandidates(
  base44: LooseRecord,
  input: {
    candidateIds: string[];
    idempotencyKey: string;
    actorId: string | null;
    invoiceRunId?: string | null;
    expectedCandidateVersions?: Record<string, number>;
  },
) {
  const replay = await getEntity(base44, 'SalesInvoice').filter({ idempotency_key: input.idempotencyKey }, '-created_date', 1);
  if (replay.length) {
    const invoice = replay[0];
    let lines = await getEntity(base44, 'SalesInvoiceLine').filter({ invoice_id: invoice.id }, '+sequence', 1000);
    const existingCandidateIds = new Set(lines.map((line: LooseRecord) => line.billing_candidate_id).filter(Boolean));
    const missingIds = [...new Set(input.candidateIds.map(asString).filter(Boolean))]
      .filter(candidateId => !existingCandidateIds.has(candidateId));
    if (missingIds.length) {
      const missingCandidates = await Promise.all(
        missingIds.map(id => requireRecord(base44, 'BillingCandidate', id, 'Factuurkandidaat')),
      );
      const created = await getEntity(base44, 'SalesInvoiceLine').bulkCreate(
        missingCandidates.map((candidate, index) => invoiceLineFromCandidate(candidate, invoice, lines.length + index + 1)),
      );
      lines = [...lines, ...created];
    }
    return { invoice, lines, replayed: true, recovered_partial_creation: missingIds.length > 0 };
  }
  const candidateIds = [...new Set(input.candidateIds.map(asString).filter(Boolean))];
  if (!candidateIds.length) throw new ApiError(400, 'Minstens één billing_candidate_id is verplicht');
  if (candidateIds.length > 500) throw new ApiError(400, 'Maximaal 500 kandidaten per factuur');
  const candidates = await Promise.all(candidateIds.map(id => requireRecord(base44, 'BillingCandidate', id, 'Factuurkandidaat')));
  for (const candidate of candidates) {
    if (candidate.status !== 'approved') throw new ApiError(409, `Factuurkandidaat ${candidate.id} is niet goedgekeurd`);
    const expected = input.expectedCandidateVersions?.[candidate.id];
    if (expected != null && versionOf(candidate) !== expected) {
      throw new ApiError(409, `Factuurkandidaat ${candidate.id} is intussen gewijzigd`);
    }
  }
  const first = candidates[0];
  for (const candidate of candidates.slice(1)) {
    if (
      candidate.company_id !== first.company_id ||
      candidate.customer_id !== first.customer_id ||
      candidate.customer_account_id !== first.customer_account_id ||
      candidate.currency !== first.currency
    ) {
      throw new ApiError(409, 'Alle factuurkandidaten moeten dezelfde BV, klantrelatie en valuta hebben');
    }
  }
  const snapshots = await loadBillingSnapshots(
    base44,
    first.company_id,
    first.customer_id,
    first.customer_account_id,
  );
  if (snapshots.account.finance_hold) throw new ApiError(409, 'Klantrelatie staat op financiële blokkade');
  const subtotal = candidates.reduce((sum, candidate) => sum + Number(candidate.subtotal_cents || 0), 0);
  const taxTotal = candidates.reduce((sum, candidate) => sum + Number(candidate.tax_cents || 0), 0);
  const total = subtotal + taxTotal;
  const taxMap = new Map<number, { vat_rate_basis_points: number; taxable_cents: number; tax_cents: number }>();
  for (const candidate of candidates) {
    const rate = Number(candidate.vat_rate_basis_points || 0);
    const row = taxMap.get(rate) || { vat_rate_basis_points: rate, taxable_cents: 0, tax_cents: 0 };
    row.taxable_cents += Number(candidate.subtotal_cents || 0);
    row.tax_cents += Number(candidate.tax_cents || 0);
    taxMap.set(rate, row);
  }
  const invoiceDate = todayIso();
  const paymentTermDays = Number(snapshots.account.payment_term_days ?? snapshots.settings?.default_payment_term_days ?? 30);
  const invoice = await getEntity(base44, 'SalesInvoice').create({
    company_id: first.company_id,
    customer_id: first.customer_id,
    customer_account_id: first.customer_account_id,
    invoice_run_id: input.invoiceRunId || null,
    document_type: 'invoice',
    original_invoice_id: null,
    invoice_number: null,
    number_reservation_id: null,
    ...invoiceLifecyclePatch('draft'),
    delivery_status: 'not_scheduled',
    payment_status: 'not_due',
    dispute_hold: false,
    invoice_date: invoiceDate,
    issue_date: null,
    due_date: plusDays(invoiceDate, Math.max(0, paymentTermDays)),
    currency: first.currency,
    customer_reference: null,
    payment_reference: null,
    company_snapshot: snapshots.company_snapshot,
    customer_snapshot: snapshots.customer_snapshot,
    billing_address_snapshot: snapshots.billing_address_snapshot,
    bank_account_snapshot: snapshots.bank_account_snapshot,
    subtotal_cents: subtotal,
    tax_total_cents: taxTotal,
    total_cents: total,
    paid_cents: 0,
    open_cents: total,
    tax_summary: [...taxMap.values()],
    delivery_evidence_managed_file_ids: [],
    idempotency_key: input.idempotencyKey,
    version: 1,
    metadata: {
      source_candidate_ids: candidateIds,
      created_by_user_id: input.actorId,
    },
  });
  const lines = await getEntity(base44, 'SalesInvoiceLine').bulkCreate(
    candidates.map((candidate, index) => invoiceLineFromCandidate(candidate, invoice, index + 1)),
  );
  return { invoice, lines, replayed: false };
}

export {
  ApiError,
  appendEvent,
  billingModelUnit,
  calculateAmounts,
  createInvoiceFromCandidates,
  dateOnly,
  findExecutionPricing,
  isDateInRange,
  plusDays,
  rangesOverlap,
  reserveCommercialNumber,
  roundQuantity,
  validateTransition,
  versionOf,
};

async function assertCommercialFeature(base44: LooseRecord, companyId: string, allowMigration = false) {
  if (allowMigration) return null;
  const settings = (await getEntity(base44, 'CompanyBillingSettings').filter({ company_id: companyId }, '-updated_date', 2))[0] || null;
  const enabled = settings?.commercial_contracts_enabled === true || settings?.feature_flags?.commercial_contracts === true;
  if (!enabled) throw new ApiError(409, 'Commerciële contracten zijn voor deze BV nog niet geactiveerd');
  return settings;
}

async function assertInvoiceIssueFeature(base44: LooseRecord, companyId: string) {
  const settings = (await getEntity(base44, 'CompanyBillingSettings').filter({ company_id: companyId }, '-updated_date', 2))[0] || null;
  const enabled =
    settings?.status === 'active' &&
    settings?.billing_mode === 'live' &&
    (settings?.invoice_issue_enabled === true || settings?.feature_flags?.invoice_issue === true);
  if (!enabled) throw new ApiError(409, 'Factuuruitgifte is voor deze BV niet live geactiveerd');
  return settings;
}

async function ensurePrimaryInvariant(
  base44: LooseRecord,
  entityName: string,
  customerId: string,
  requestedPrimary: boolean,
  currentId?: string,
  extraQuery: LooseRecord = {},
) {
  if (!requestedPrimary) return;
  const records = await getEntity(base44, entityName).filter({
    customer_id: customerId,
    is_primary: true,
    ...extraQuery,
  }, '-updated_date', 20);
  if (records.some((record: LooseRecord) => record.id !== currentId && record.status !== 'archived')) {
    throw new ApiError(409, 'Er bestaat al een primair record; wijzig dat eerst expliciet');
  }
}

async function handleGetCustomerOverview(base44: LooseRecord, body: LooseRecord) {
  const customerId = requireString(body, 'customer_id');
  const customer = await requireRecord(base44, 'Customer', customerId, 'Klant');
  const [
    accounts,
    addresses,
    contacts,
    contactPoints,
    contactRoles,
    objects,
    quotes,
    contracts,
    invoices,
    requests,
    recentEvents,
  ] = await Promise.all([
    getEntity(base44, 'CustomerAccount').filter({ customer_id: customerId }, '-is_primary', 250),
    getEntity(base44, 'CustomerAddress').filter({ customer_id: customerId }, '-is_primary', 250),
    getEntity(base44, 'CustomerContact').filter({ customer_id: customerId }, '-is_primary', 250),
    getEntity(base44, 'CustomerContactPoint').filter({ customer_id: customerId }, '-is_primary', 500),
    getEntity(base44, 'CustomerContactRole').filter({ customer_id: customerId }, '-is_primary', 500),
    getEntity(base44, 'SurveillanceObject').filter({ customer_id: customerId }, '+name', 500),
    getEntity(base44, 'CustomerQuote').filter({ customer_id: customerId }, '-updated_date', 250),
    getEntity(base44, 'CustomerContract').filter({ customer_id: customerId }, '-updated_date', 250),
    getEntity(base44, 'SalesInvoice').filter({ customer_id: customerId }, '-invoice_date', 500),
    getEntity(base44, 'CustomerRequest').filter({ customer_id: customerId }, '-updated_date', 250),
    getEntity(base44, 'CustomerEvent').filter({ customer_id: customerId }, '-occurred_at', 30),
  ]);
  const activeObjects = objects.filter((item: LooseRecord) => item.is_active_customer_object !== false);
  const openInvoices = invoices.filter((item: LooseRecord) =>
    invoiceLifecycle(item) === 'issued' &&
    !['paid', 'written_off'].includes(item.payment_status) &&
    Number(item.open_cents || 0) !== 0);
  const primaryContact = contacts.find((item: LooseRecord) => item.id === customer.primary_contact_id) ||
    contacts.find((item: LooseRecord) => item.is_primary && item.status === 'active') ||
    null;
  const selectedCompanyId = asString(body.company_id) ||
    accounts.find((item: LooseRecord) => item.is_primary)?.company_id ||
    accounts[0]?.company_id ||
    '';
  const billingSettings = selectedCompanyId
    ? (await getEntity(base44, 'CompanyBillingSettings').filter({ company_id: selectedCompanyId }, '-updated_date', 1))[0] || null
    : null;
  return {
    customer,
    accounts,
    addresses,
    contacts,
    contact_points: contactPoints,
    contact_roles: contactRoles,
    summary: {
      active_object_count: activeObjects.length,
      active_contract_count: contracts.filter((item: LooseRecord) => item.status === 'active').length,
      open_request_count: requests.filter((item: LooseRecord) => !['completed', 'cancelled', 'rejected'].includes(item.status)).length,
      open_invoice_count: openInvoices.length,
      open_balance_cents: openInvoices.reduce((sum: number, item: LooseRecord) => sum + Number(item.open_cents || 0), 0),
      currency: accounts.find((item: LooseRecord) => item.is_primary)?.currency || 'EUR',
    },
    primary_contact: primaryContact
      ? {
        ...primaryContact,
        points: contactPoints.filter((item: LooseRecord) => item.contact_id === primaryContact.id),
        roles: contactRoles.filter((item: LooseRecord) => item.contact_id === primaryContact.id),
      }
      : null,
    active_objects: activeObjects.slice(0, 10),
    recent_quotes: quotes.slice(0, 10),
    recent_contracts: contracts.slice(0, 10),
    upcoming_requests: requests.filter((item: LooseRecord) => !['completed', 'cancelled', 'rejected'].includes(item.status)).slice(0, 10),
    recent_events: recentEvents,
    feature_flags: billingSettings
      ? {
        commercial_contracts: billingSettings.commercial_contracts_enabled === true || billingSettings.feature_flags?.commercial_contracts === true,
        billing_shadow: billingSettings.billing_shadow_mode === true || billingSettings.feature_flags?.billing_shadow === true,
        invoice_issue: billingSettings.invoice_issue_enabled === true || billingSettings.feature_flags?.invoice_issue === true,
        auto_send: billingSettings.auto_send_enabled === true || billingSettings.feature_flags?.auto_send === true,
        collections: billingSettings.collections_enabled === true || billingSettings.feature_flags?.collections === true,
        peppol: billingSettings.peppol_enabled === true || billingSettings.feature_flags?.peppol === true,
        customer_portal: billingSettings.customer_portal_enabled === true || billingSettings.feature_flags?.customer_portal === true,
      }
      : {},
  };
}

async function handleSearchCustomerObjects(base44: LooseRecord, body: LooseRecord) {
  const page = requireInteger(body.page ?? 1, 'page', 1);
  const pageSize = Math.min(100, requireInteger(body.page_size ?? 25, 'page_size', 1));
  const customerId = asString(body.customer_id);
  const search = asString(body.search).slice(0, 120);
  const status = asString(body.status);
  if (status && !Object.prototype.hasOwnProperty.call(OBJECT_STATUS_TRANSITIONS, status)) {
    throw new ApiError(400, 'Ongeldige objectstatus');
  }
  if (customerId) await requireRecord(base44, 'Customer', customerId, 'Klant');

  const query: LooseRecord = {};
  if (customerId) query.customer_id = customerId;
  if (status) query.status = status;
  if (search) {
    const literalRegex = escapeRegex(search);
    const normalizedRegex = escapeRegex(normalizedCodeSearchValue(search));
    let canonicalInternalRegex = normalizedRegex;
    try {
      canonicalInternalRegex = escapeRegex(canonicalObjectCode(search, true) as string);
    } catch {
      // De zoekterm kan ook een naam of adres zijn en hoeft dan geen geldige
      // interne objectcode te vormen.
    }
    query.$or = [
      { object_code: { $regex: literalRegex, $options: 'i' } },
      { object_code_normalized: { $regex: canonicalInternalRegex, $options: 'i' } },
      { external_object_code: { $regex: literalRegex, $options: 'i' } },
      { external_object_code_normalized: { $regex: normalizedRegex, $options: 'i' } },
      { name: { $regex: literalRegex, $options: 'i' } },
      { address: { $regex: literalRegex, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * pageSize;
  const records = await getEntity(base44, 'SurveillanceObject').filter(
    query,
    '+name',
    pageSize + 1,
    skip,
  );
  const hasMore = records.length > pageSize;
  return {
    items: records.slice(0, pageSize).map((object: LooseRecord) => ({
      ...safeObjectMutationSummary(object, []),
      updated_date: object.updated_date || null,
      created_date: object.created_date || null,
    })),
    page,
    page_size: pageSize,
    has_more: hasMore,
    next_page: hasMore ? page + 1 : null,
  };
}

async function handleCreateCustomer(base44: LooseRecord, body: LooseRecord, expectedVersion: number, idempotencyKey: string) {
  if (expectedVersion !== 0) throw new ApiError(409, 'Nieuwe klant verwacht expected_version 0');
  const data = (body.customer || body.data || {}) as LooseRecord;
  const accountData = (body.customer_account || body.account || {}) as LooseRecord;
  const companyId = asString(body.company_id || accountData.company_id);
  if (!companyId) throw new ApiError(400, 'Minstens één bedrijfsrelatie met company_id is verplicht');
  const company = await requireRecord(base44, 'Company', companyId, 'Bedrijf');
  if (company.status && company.status !== 'active') throw new ApiError(409, 'Bedrijfsrelatie moet actief zijn');
  const previousCreations = await getEntity(base44, 'Customer').filter({
    creation_idempotency_key: idempotencyKey,
  }, '-created_date', 2);
  if (previousCreations.length > 1) {
    throw new ApiError(409, 'Meerdere klanten delen dezelfde creation_idempotency_key; handmatige reconciliatie vereist');
  }
  if (previousCreations.length === 1) {
    const existingCustomer = previousCreations[0];
    let accounts = await getEntity(base44, 'CustomerAccount').filter({
      customer_id: existingCustomer.id,
      company_id: companyId,
      status: { $ne: 'archived' },
    }, '-is_primary', 20);
    if (!accounts.length) {
      accounts = [await getEntity(base44, 'CustomerAccount').create({
        customer_id: existingCustomer.id,
        company_id: companyId,
        debtor_number: asString(accountData.debtor_number) || null,
        status: accountData.status || 'active',
        is_primary: true,
        account_manager_id: accountData.account_manager_id || null,
        billing_name: accountData.billing_name || null,
        invoice_email: accountData.invoice_email || null,
        currency: accountData.currency || 'EUR',
        payment_term_days: Number(accountData.payment_term_days ?? 30),
        billing_frequency: accountData.billing_frequency || 'monthly',
        invoice_delivery_method: accountData.invoice_delivery_method || 'email',
        peppol_required: Boolean(accountData.peppol_required),
        allow_email_fallback: accountData.peppol_required ? Boolean(accountData.allow_email_fallback) : accountData.allow_email_fallback !== false,
        finance_hold: false,
        dunning_profile: accountData.dunning_profile || 'b2b_standard',
        version: 1,
        metadata: { ...(accountData.metadata || {}), creation_idempotency_key: idempotencyKey },
      })];
    }
    const [addresses, contacts] = await Promise.all([
      getEntity(base44, 'CustomerAddress').filter({ customer_id: existingCustomer.id }, '-is_primary', 250),
      getEntity(base44, 'CustomerContact').filter({ customer_id: existingCustomer.id }, '-is_primary', 250),
    ]);
    const mirrored = await syncLegacyMirrors(base44, existingCustomer.id);
    return {
      customer: mirrored,
      account: accounts[0],
      addresses,
      contact: contacts.find((item: LooseRecord) => item.is_primary) || contacts[0] || null,
      replayed: true,
      recovered_partial_creation: true,
      setup_incomplete: {
        requested_addresses_missing: (Array.isArray(body.addresses) ? body.addresses.length : body.address ? 1 : 0) > addresses.length,
        requested_primary_contact_missing: Boolean(body.primary_contact || body.contact) && contacts.length === 0,
      },
      resource_type: 'Customer',
      resource_id: existingCustomer.id,
      category: 'change',
    };
  }
  const displayName = asString(data.trade_name || data.legal_name || data.name);
  if (!displayName) throw new ApiError(400, 'Handelsnaam of statutaire naam is verplicht');
  const normalized = normalizeName(displayName);
  const duplicateFilters: LooseRecord[] = [{ normalized_name: normalized }];
  if (asString(data.kvk_number)) duplicateFilters.unshift({ kvk_number: asString(data.kvk_number) });
  const duplicates = await getEntity(base44, 'Customer').filter({ $or: duplicateFilters }, '-updated_date', 25);
  const liveDuplicates = duplicates.filter((customer: LooseRecord) => customer.status !== 'archived');
  if (liveDuplicates.length) {
    throw new ApiError(409, 'Mogelijke dubbele klant gevonden', {
      duplicate_customer_ids: liveDuplicates.map((customer: LooseRecord) => customer.id),
    });
  }
  const customer = await getEntity(base44, 'Customer').create({
    name: displayName,
    customer_type: data.customer_type || 'bedrijf',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    kvk_number: asString(data.kvk_number) || '',
    notes: data.notes || '',
    customer_number: asString(data.customer_number) || null,
    legal_name: asString(data.legal_name) || displayName,
    trade_name: asString(data.trade_name) || displayName,
    normalized_name: normalized,
    vat_number: asString(data.vat_number) || null,
    preferred_language: data.preferred_language || 'nl',
    status: 'concept',
    primary_contact_id: null,
    primary_customer_account_id: null,
    logo_file_id: data.logo_file_id || null,
    onboarding_state: {
      primary_contact: false,
      first_object: false,
      contract_or_rate: false,
      report_recipients: false,
      portal_access: false,
    },
    creation_idempotency_key: idempotencyKey,
    version: 1,
    metadata: { ...(data.metadata || {}), creation_company_id: companyId },
  });
  const account = await getEntity(base44, 'CustomerAccount').create({
    customer_id: customer.id,
    company_id: companyId,
    debtor_number: asString(accountData.debtor_number) || null,
    status: accountData.status || 'active',
    is_primary: true,
    account_manager_id: accountData.account_manager_id || null,
    billing_name: accountData.billing_name || null,
    invoice_email: accountData.invoice_email || null,
    currency: accountData.currency || 'EUR',
    payment_term_days: Number(accountData.payment_term_days ?? 30),
    billing_frequency: accountData.billing_frequency || 'monthly',
    invoice_delivery_method: accountData.invoice_delivery_method || 'email',
    peppol_required: Boolean(accountData.peppol_required),
    peppol_scheme_id: accountData.peppol_scheme_id || null,
    peppol_participant_id: accountData.peppol_participant_id || null,
    allow_email_fallback: accountData.peppol_required ? Boolean(accountData.allow_email_fallback) : accountData.allow_email_fallback !== false,
    customer_reference_required: Boolean(accountData.customer_reference_required),
    customer_reference_label: accountData.customer_reference_label || null,
    default_company_bank_account_id: accountData.default_company_bank_account_id || null,
    finance_hold: false,
    dunning_profile: accountData.dunning_profile || 'b2b_standard',
    version: 1,
    metadata: { ...(accountData.metadata || {}), creation_idempotency_key: idempotencyKey },
  });

  const createdAddresses: LooseRecord[] = [];
  const addresses = Array.isArray(body.addresses) ? body.addresses : body.address ? [body.address] : [];
  for (const [index, raw] of addresses.entries()) {
    if (!raw || typeof raw !== 'object') continue;
    createdAddresses.push(await getEntity(base44, 'CustomerAddress').create({
      customer_id: customer.id,
      customer_account_id: raw.customer_account_id || (raw.address_type === 'billing' ? account.id : null),
      address_type: raw.address_type || 'visiting',
      ...pick(raw, ADDRESS_PATCH_FIELDS),
      is_primary: raw.is_primary ?? index === 0,
      status: raw.status || 'active',
      version: 1,
    }));
  }

  let createdContact: LooseRecord | null = null;
  const contact = body.primary_contact || body.contact || null;
  if (contact && typeof contact === 'object' && asString(contact.display_name || contact.name)) {
    createdContact = await getEntity(base44, 'CustomerContact').create({
      customer_id: customer.id,
      ...pick(contact, CONTACT_PATCH_FIELDS),
      display_name: asString(contact.display_name || contact.name),
      is_primary: true,
      status: contact.status || 'active',
      version: 1,
    });
    const points = Array.isArray(contact.contact_points)
      ? contact.contact_points
      : [
        contact.email ? { point_type: 'email', value: contact.email, is_primary: true } : null,
        contact.phone ? { point_type: 'phone', value: contact.phone, is_primary: true } : null,
      ].filter(Boolean);
    for (const point of points) {
      await getEntity(base44, 'CustomerContactPoint').create({
        customer_id: customer.id,
        contact_id: createdContact.id,
        point_type: point.point_type,
        label: point.label || null,
        value: asString(point.value),
        normalized_value: point.point_type === 'email' ? normalizeEmail(point.value) : normalizePhone(point.value),
        is_primary: point.is_primary !== false,
        purposes: point.purposes || ['general'],
        status: point.status || 'active',
        consent_status: point.consent_status || 'not_required',
        version: 1,
      });
    }
    const roles = Array.isArray(contact.roles) && contact.roles.length ? contact.roles : ['primary'];
    for (const role of roles) {
      const roleValue = typeof role === 'string' ? role : role.role;
      await getEntity(base44, 'CustomerContactRole').create({
        customer_id: customer.id,
        customer_account_id: typeof role === 'object' ? role.customer_account_id || null : null,
        contact_id: createdContact.id,
        role: roleValue,
        object_ids: typeof role === 'object' ? role.object_ids || [] : [],
        is_primary: roleValue === 'primary',
        status: 'active',
        version: 1,
      });
    }
  }

  let customerNumber = customer.customer_number;
  if (!customerNumber) {
    const fiscalYear = new Date().getUTCFullYear();
    try {
      const reservation = await reserveCommercialNumber(base44, {
        companyId,
        documentType: 'customer',
        fiscalYear,
        idempotencyKey: `${idempotencyKey}:customer-number`,
        resourceType: 'Customer',
        resourceId: customer.id,
      });
      customerNumber = reservation.formatted_number;
      await casUpdateLatest(base44, 'Customer', customer.id, { customer_number: customerNumber });
      await markReservation(base44, reservation, 'issued');
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) throw error;
    }
  }
  const mirrored = await syncLegacyMirrors(base44, customer.id);
  return {
    customer: mirrored,
    account,
    addresses: createdAddresses,
    contact: createdContact,
    customer_number_pending: !customerNumber,
    resource_type: 'Customer',
    resource_id: customer.id,
    category: 'change',
  };
}

async function handleUpdateCustomer(base44: LooseRecord, body: LooseRecord, expectedVersion: number) {
  const customer = await requireRecord(base44, 'Customer', requireString(body, 'customer_id'), 'Klant');
  if (customer.status === 'archived') throw new ApiError(409, 'Gearchiveerde klant moet eerst worden hersteld');
  const data = requireObject(body);
  const patch = pick(data, CUSTOMER_PATCH_FIELDS);
  const displayName = asString(patch.trade_name || patch.legal_name || customer.trade_name || customer.legal_name || customer.name);
  if (!displayName) throw new ApiError(400, 'Klantnaam mag niet leeg zijn');
  patch.name = displayName;
  patch.normalized_name = normalizeName(displayName);
  if (patch.kvk_number) {
    const duplicates = await getEntity(base44, 'Customer').filter({ kvk_number: asString(patch.kvk_number) }, '-updated_date', 20);
    if (duplicates.some((item: LooseRecord) => item.id !== customer.id && item.status !== 'archived')) {
      throw new ApiError(409, 'KvK-nummer is al aan een andere klant gekoppeld');
    }
  }
  const updated = await casUpdate(base44, 'Customer', customer, expectedVersion, patch);
  return { customer: updated, resource_type: 'Customer', resource_id: updated.id };
}

async function handleSetCustomerStatus(base44: LooseRecord, user: LooseRecord, body: LooseRecord, expectedVersion: number) {
  const customer = await requireRecord(base44, 'Customer', requireString(body, 'customer_id'), 'Klant');
  const requested = requireString(body, 'status');
  const allowed: Record<string, string[]> = {
    concept: ['active', 'archived'],
    active: ['on_hold', 'inactive', 'archived'],
    on_hold: ['active', 'inactive', 'archived'],
    inactive: ['active', 'archived'],
    archived: ['inactive'],
  };
  validateTransition(allowed, customer.status || 'concept', requested, 'Klant');
  if (requested === 'archived' && !asString(body.reason)) throw new ApiError(400, 'Reden voor archiveren is verplicht');
  const patch: LooseRecord = { status: requested };
  if (requested === 'archived') {
    patch.archived_at = nowIso();
    patch.archived_by_user_id = user.id;
    patch.archive_reason = asString(body.reason);
  } else if (customer.status === 'archived') {
    patch.archived_at = null;
    patch.archived_by_user_id = null;
    patch.archive_reason = null;
  }
  const updated = await casUpdate(base44, 'Customer', customer, expectedVersion, patch);
  return { customer: updated, resource_type: 'Customer', resource_id: updated.id };
}

async function handleDeleteEmptyCustomer(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
  target: string,
) {
  const customerId = requireString(body, 'customer_id');
  const initialCustomer = await requireRecord(base44, 'Customer', customerId, 'Klant');
  if (versionOf(initialCustomer) !== expectedVersion) throw new ApiError(409, 'Klant is intussen gewijzigd');
  if (initialCustomer.status !== 'concept') throw new ApiError(409, 'Alleen een leeg concept kan definitief worden verwijderd');

  // De globale objectcodelock voorkomt dat de coördinerende klant precies
  // tijdens een objectcodewrite verdwijnt.
  const codeReservation = await reserveGlobalObjectCodeMutation(base44, user, idempotencyKey, target);
  try {
    const customer = await requireRecord(base44, 'Customer', customerId, 'Klant');
    const ownLockIncrement = codeReservation.coordinator_id === customer.id ? 1 : 0;
    if (versionOf(customer) !== expectedVersion + ownLockIncrement) {
      throw new ApiError(409, 'Klant is intussen gewijzigd');
    }
    if (customer.status !== 'concept') throw new ApiError(409, 'Alleen een leeg concept kan definitief worden verwijderd');
    const relationEntities = [
      'CustomerAccount',
      'CustomerAddress',
      'CustomerContact',
      'SurveillanceObject',
      'CustomerQuote',
      'CustomerContract',
      'CustomerRequest',
      'SalesInvoice',
      'CustomerPortalPublication',
    ];
    const relationCounts: LooseRecord = {};
    for (const entityName of relationEntities) {
      const records = await getEntity(base44, entityName).filter({ customer_id: customer.id }, '-created_date', 1, 0, ['id']);
      if (records.length) relationCounts[entityName] = records.length;
    }
    if (Object.keys(relationCounts).length) {
      throw new ApiError(409, 'Conceptklant heeft relaties en kan alleen worden gearchiveerd', { relations: relationCounts });
    }
    await getEntity(base44, 'Customer').delete(customer.id);
    return {
      deleted: true,
      customer_id: customer.id,
      resource_type: 'Customer',
      resource_id: customer.id,
    };
  } finally {
    try {
      await releaseGlobalObjectCodeMutation(base44, codeReservation);
    } catch (error) {
      console.error('[customerPlatformApi] object code mutation lock release failed during customer deletion', customerId, error);
    }
  }
}

function objectCoordinate(value: unknown, minimum: number, maximum: number, field: string) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new ApiError(400, `${field} bevat geen geldige coördinaat`);
  }
  return number;
}

function objectText(value: unknown, field: string, maximumLength: number, nullable = true) {
  if (value === null || value === undefined || value === '') {
    if (nullable) return null;
    throw new ApiError(400, `${field} is verplicht`);
  }
  if (typeof value !== 'string') throw new ApiError(400, `${field} moet tekst zijn`);
  const normalized = value.trim();
  if (!normalized && !nullable) throw new ApiError(400, `${field} is verplicht`);
  if (normalized.length > maximumLength) {
    throw new ApiError(400, `${field} mag maximaal ${maximumLength} tekens bevatten`);
  }
  return normalized || null;
}

function objectLifecycleStatus(object: LooseRecord) {
  if (asString(object.status)) return asString(object.status);
  if (object.is_active_customer_object === false || object.is_active === false) return 'inactive';
  return 'active';
}

const OBJECT_TYPE_LOG_LABELS: Record<string, string> = {
  office: 'Kantoor',
  retail_hospitality: 'Winkel of horeca',
  industrial_logistics: 'Industrie of logistiek',
  construction_site: 'Bouwplaats',
  healthcare_education: 'Zorg of onderwijs',
  residential: 'Wonen',
  event_temporary: 'Evenement of tijdelijk object',
  parking: 'Parkeerlocatie',
  other: 'Anders',
};

function objectIdentityChanges(before: LooseRecord, after: LooseRecord, changedFields: string[]) {
  const fields = new Set(changedFields);
  const changes: LooseRecord[] = [];
  if (fields.has('object_code') && asString(before.object_code) !== asString(after.object_code)) {
    changes.push({
      field: 'object_code',
      label: 'Objectcode',
      before: asString(before.object_code) || null,
      after: asString(after.object_code) || null,
    });
  }
  if (
    fields.has('external_object_code') &&
    asString(before.external_object_code) !== asString(after.external_object_code)
  ) {
    changes.push({
      field: 'external_object_code',
      label: 'Externe objectcode',
      before: asString(before.external_object_code) || null,
      after: asString(after.external_object_code) || null,
    });
  }
  if (fields.has('name') && asString(before.name) !== asString(after.name)) {
    changes.push({ field: 'name', label: 'Objectnaam', before: asString(before.name) || null, after: asString(after.name) || null });
  }
  if (
    ['address', 'street_name', 'house_number', 'house_number_addition', 'postal_code', 'city', 'country_code', 'country_name']
      .some(field => fields.has(field)) &&
    asString(before.address) !== asString(after.address)
  ) {
    changes.push({ field: 'address', label: 'Adres', before: asString(before.address) || null, after: asString(after.address) || null });
  }
  if (fields.has('object_type') && asString(before.object_type) !== asString(after.object_type)) {
    changes.push({
      field: 'object_type',
      label: 'Objecttype',
      before: OBJECT_TYPE_LOG_LABELS[asString(before.object_type)] || asString(before.object_type) || null,
      after: OBJECT_TYPE_LOG_LABELS[asString(after.object_type)] || asString(after.object_type) || null,
    });
  }
  if (['logo_file_url', 'logo_file_id', 'logo_download_filename', 'logo_logical_path'].some(field => fields.has(field))) {
    changes.push({
      field: 'logo',
      label: 'Logo',
      before: before.logo_file_id || before.logo_file_url ? 'Gewijzigd' : 'Niet ingesteld',
      after: after.logo_file_id || after.logo_file_url ? 'Gewijzigd' : 'Niet ingesteld',
    });
  }
  return changes;
}

function safeObjectMutationSummary(object: LooseRecord, changedFields: string[]) {
  const configuredInstructionCount = Number(object.configured_instruction_count);
  const effectiveChangedFields = changedFields.length
    ? changedFields
    : Array.isArray(object.changed_fields)
      ? object.changed_fields.filter((field: unknown) => typeof field === 'string')
      : [];
  return {
    id: object.id,
    customer_id: object.customer_id,
    object_code: object.object_code || null,
    external_object_code: object.external_object_code || null,
    name: object.name,
    address: object.address,
    city: object.city || null,
    region: object.region || null,
    object_type: object.object_type || null,
    logo_file_url: object.logo_file_url || null,
    logo_file_id: object.logo_file_id || null,
    logo_download_filename: object.logo_download_filename || null,
    logo_logical_path: object.logo_logical_path || null,
    status: objectLifecycleStatus(object),
    version: versionOf(object),
    geocoding_status: object.geocoding_status || 'unverified',
    show_on_mobile_map: object.show_on_mobile_map === true,
    is_active_customer_object: object.is_active_customer_object === true,
    configured_instruction_count: Number.isInteger(configuredInstructionCount) && configuredInstructionCount >= 0
      ? configuredInstructionCount
      : OBJECT_INSTRUCTION_FIELDS.filter(field => Boolean(asString(object[field]))).length,
    has_object_map: typeof object.has_object_map === 'boolean'
      ? object.has_object_map
      : Boolean(object.object_map_url || object.object_map_file_url),
    changed_fields: [...new Set(effectiveChangedFields)]
      .filter(field => !field.endsWith('_normalized'))
      .sort(),
  };
}

function customerObjectMutationResult(
  object: LooseRecord,
  changedFields: string[],
  extra: LooseRecord = {},
) {
  return {
    object: safeObjectMutationSummary(object, changedFields),
    object_id: object.id,
    customer_id: object.customer_id,
    ...extra,
    resource_type: 'SurveillanceObject',
    resource_id: object.id,
    category: 'operations',
  };
}

async function customerObjectPatchWithRecovery(
  input: {
    object: LooseRecord;
    patch: LooseRecord;
    expectedVersion: number;
    user: LooseRecord;
    action: string;
    idempotencyKey: string;
    requestFingerprint: string;
    target: string;
    extraResult?: LooseRecord;
  },
) {
  const mutationPatch = input.object.status
    ? input.patch
    : { status: objectLifecycleStatus(input.object), ...input.patch };
  const changedFields = Object.keys(mutationPatch);
  const projected = {
    ...input.object,
    ...mutationPatch,
    version: input.expectedVersion + 1,
  };
  const result = customerObjectMutationResult(projected, changedFields, input.extraResult);
  const keyHash = await sha256(input.idempotencyKey);
  const priorRecoveries = input.object.customer_platform_mutation_recoveries;
  const recoveryLog = priorRecoveries && typeof priorRecoveries === 'object' && !Array.isArray(priorRecoveries)
    ? priorRecoveries
    : {};
  const keyHashes = Array.isArray(input.object.customer_platform_mutation_key_hashes)
    ? input.object.customer_platform_mutation_key_hashes.filter((value: unknown) => typeof value === 'string')
    : [];
  const recovery = {
    action: input.action,
    actor_id: input.user.id,
    request_fingerprint: input.requestFingerprint,
    mutation_target: input.target,
    result,
    recorded_at: nowIso(),
  };
  const boundedKeyHashes = [
    ...new Set(keyHashes.filter((hash: string) => hash !== keyHash)),
    keyHash,
  ].slice(-CUSTOMER_OBJECT_RECOVERY_LIMIT);
  const boundedRecoveries = Object.fromEntries(
    boundedKeyHashes
      .map(hash => [hash, hash === keyHash ? recovery : recoveryLog[hash]])
      .filter(([, value]) => Boolean(value)),
  );
  return {
    changedFields,
    result,
    patch: {
      ...mutationPatch,
      customer_platform_last_mutation_key_hash: keyHash,
      customer_platform_last_mutation_recovery: recovery,
      customer_platform_mutation_key_hashes: boundedKeyHashes,
      customer_platform_mutation_recoveries: boundedRecoveries,
    },
  };
}

async function requireCustomerObjectForMutation(base44: LooseRecord, body: LooseRecord) {
  const customerId = requireString(body, 'customer_id');
  const objectId = requireString(body, 'object_id');
  const [customer, object] = await Promise.all([
    requireRecord(base44, 'Customer', customerId, 'Klant'),
    requireRecord(base44, 'SurveillanceObject', objectId, 'Object'),
  ]);
  if (customer.status === 'archived') {
    throw new ApiError(409, 'Objecten van een gearchiveerde klant kunnen niet worden gewijzigd');
  }
  if (object.customer_id !== customer.id) {
    throw new ApiError(409, 'Object hoort niet bij deze klant', { object_id: object.id, customer_id: customer.id });
  }
  return { customer, object };
}

async function requireCustomerObjectScope(base44: LooseRecord, body: LooseRecord) {
  const customerId = requireString(body, 'customer_id');
  const objectId = requireString(body, 'object_id');
  const [customer, object] = await Promise.all([
    requireRecord(base44, 'Customer', customerId, 'Klant'),
    requireRecord(base44, 'SurveillanceObject', objectId, 'Object'),
  ]);
  if (object.customer_id !== customer.id) {
    throw new ApiError(409, 'Object hoort niet bij deze klant', { object_id: object.id, customer_id: customer.id });
  }
  return { customer, object };
}

function warningContactDisplayName(contact: LooseRecord) {
  return asString(contact.display_name) ||
    [contact.first_name, contact.middle_name, contact.last_name].map(asString).filter(Boolean).join(' ') ||
    'Onbekende contactpersoon';
}

const WARNING_RELATIONSHIP_LABELS: Record<string, string> = {
  keyholder: 'Sleutelhouder',
  object_manager: 'Objectbeheerder',
  facility_manager: 'Facilitair beheerder',
  owner_director: 'Eigenaar of directie',
  alarm_contact: 'Alarmcontact',
  emergency_service: 'Hulpdienst',
  other: 'Anders',
};

function warningRelationshipDisplay(type: unknown, customLabel: unknown) {
  return asString(customLabel) || WARNING_RELATIONSHIP_LABELS[asString(type)] || asString(type) || 'Onbekend';
}

function warningTimeToSlot(value: string) {
  if (value === '24:00') return 48;
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 2) + (minutes / 30);
}

function normalizeWarningAvailabilityPeriods(value: unknown, availabilityMode: string) {
  if (availabilityMode !== 'schedule') return [];
  if (!Array.isArray(value)) throw new ApiError(400, 'availability_periods moet een lijst zijn');
  if (!value.length) throw new ApiError(400, 'Teken minimaal één bereikbaarheidsblok');
  if (value.length > 336) throw new ApiError(400, 'Het weekrooster bevat te veel blokken');
  const occupied = new Map(WARNING_DAYS.map(day => [day, new Set<number>()]));
  return value.map((period, index) => {
    if (!period || typeof period !== 'object' || Array.isArray(period)) {
      throw new ApiError(400, `Roosterblok ${index + 1} is ongeldig`);
    }
    const item = period as LooseRecord;
    const days = Array.isArray(item.days) ? [...new Set(item.days.map(asString))] : [];
    const startTime = asString(item.start_time);
    const endTime = asString(item.end_time);
    const kind = asString(item.kind);
    if (days.length !== 1 || !WARNING_DAYS.includes(days[0])) {
      throw new ApiError(400, `Roosterblok ${index + 1} heeft geen geldige dag`);
    }
    if (!WARNING_SLOT_START_PATTERN.test(startTime) || !WARNING_SLOT_END_PATTERN.test(endTime)) {
      throw new ApiError(400, `Roosterblok ${index + 1} moet op halve uren liggen`);
    }
    const startSlot = warningTimeToSlot(startTime);
    const endSlot = warningTimeToSlot(endTime);
    if (startSlot >= endSlot) throw new ApiError(400, `Roosterblok ${index + 1} heeft geen geldige eindtijd`);
    if (!WARNING_AVAILABILITY_KINDS.has(kind)) {
      throw new ApiError(400, `Roosterblok ${index + 1} heeft geen geldige bereikbaarheid`);
    }
    const daySlots = occupied.get(days[0]) as Set<number>;
    for (let slot = startSlot; slot < endSlot; slot += 1) {
      if (daySlots.has(slot)) throw new ApiError(400, `Roosterblok ${index + 1} overlapt een ander blok`);
      daySlots.add(slot);
    }
    return { days, start_time: startTime, end_time: endTime, kind };
  });
}

function normalizeWarningOverridePeriods(value: unknown) {
  if (!Array.isArray(value)) throw new ApiError(400, 'availability_periods moet een lijst zijn');
  if (value.length > 48) throw new ApiError(400, 'Een datumuitzondering bevat te veel blokken');
  const occupied = new Set<number>();
  return value.map((period, index) => {
    if (!period || typeof period !== 'object' || Array.isArray(period)) {
      throw new ApiError(400, `Uitzonderingsblok ${index + 1} is ongeldig`);
    }
    const item = period as LooseRecord;
    const startTime = asString(item.start_time);
    const endTime = asString(item.end_time);
    const kind = asString(item.kind);
    if (!WARNING_SLOT_START_PATTERN.test(startTime) || !WARNING_SLOT_END_PATTERN.test(endTime)) {
      throw new ApiError(400, `Uitzonderingsblok ${index + 1} moet op halve uren liggen`);
    }
    const startSlot = warningTimeToSlot(startTime);
    const endSlot = warningTimeToSlot(endTime);
    if (startSlot >= endSlot) throw new ApiError(400, `Uitzonderingsblok ${index + 1} heeft geen geldige eindtijd`);
    if (!WARNING_AVAILABILITY_KINDS.has(kind)) {
      throw new ApiError(400, `Uitzonderingsblok ${index + 1} heeft geen geldige bereikbaarheid`);
    }
    for (let slot = startSlot; slot < endSlot; slot += 1) {
      if (occupied.has(slot)) throw new ApiError(400, `Uitzonderingsblok ${index + 1} overlapt een ander blok`);
      occupied.add(slot);
    }
    return { start_time: startTime, end_time: endTime, kind };
  });
}

function normalizeWarningNotCallPeriods(value: unknown, availabilityMode: string) {
  if (availabilityMode !== 'not_call_periods') return [];
  if (!Array.isArray(value)) throw new ApiError(400, 'not_call_periods moet een lijst zijn');
  if (!value.length) throw new ApiError(400, 'Voeg minimaal één niet-bellenperiode toe');
  if (value.length > 21) throw new ApiError(400, 'Maximaal 21 niet-bellenperiodes toegestaan');
  return value.map((period, index) => {
    if (!period || typeof period !== 'object' || Array.isArray(period)) {
      throw new ApiError(400, `Niet-bellenperiode ${index + 1} is ongeldig`);
    }
    const daysInput = (period as LooseRecord).days;
    if (!Array.isArray(daysInput) || !daysInput.length) {
      throw new ApiError(400, `Kies minimaal één dag voor niet-bellenperiode ${index + 1}`);
    }
    const days = [...new Set(daysInput.map(asString))];
    if (days.some(day => !WARNING_DAYS.includes(day))) {
      throw new ApiError(400, `Niet-bellenperiode ${index + 1} bevat een ongeldige dag`);
    }
    const startTime = asString((period as LooseRecord).start_time);
    const endTime = asString((period as LooseRecord).end_time);
    if (!WARNING_TIME_PATTERN.test(startTime) || !WARNING_TIME_PATTERN.test(endTime)) {
      throw new ApiError(400, `Gebruik HH:MM voor niet-bellenperiode ${index + 1}`);
    }
    if (startTime === endTime) {
      throw new ApiError(400, `Begin- en eindtijd van niet-bellenperiode ${index + 1} moeten verschillen`);
    }
    return {
      days: WARNING_DAYS.filter(day => days.includes(day)),
      start_time: startTime,
      end_time: endTime,
    };
  });
}

function safeWarningPoint(point: LooseRecord) {
  return {
    id: point.id,
    point_type: point.point_type,
    label: point.label || null,
    value: point.value,
    is_primary: point.is_primary === true,
    status: point.status || 'active',
    version: versionOf(point),
  };
}

function safeWarningContactOption(
  contact: LooseRecord,
  points: LooseRecord[],
  assignedPointIds: Set<string> = new Set<string>(),
) {
  return {
    id: contact.id,
    display_name: warningContactDisplayName(contact),
    first_name: contact.first_name || null,
    middle_name: contact.middle_name || null,
    last_name: contact.last_name || null,
    job_title: contact.job_title || null,
    points: points
      .filter(point => point.contact_id === contact.id && (point.status === 'active' || assignedPointIds.has(point.id)))
      .filter(point => ['email', 'phone', 'mobile'].includes(asString(point.point_type)))
      .sort((left, right) => Number(right.is_primary === true) - Number(left.is_primary === true))
      .map(safeWarningPoint),
  };
}

function safeObjectWarningAddress(
  warningAddress: LooseRecord,
  contact: LooseRecord | null,
  points: LooseRecord[],
) {
  const contactPoints = points.filter(point => point.contact_id === warningAddress.contact_id);
  const primaryPoint = contactPoints.find(point => point.id === warningAddress.primary_contact_point_id) || null;
  const secondaryPoint = contactPoints.find(point => point.id === warningAddress.secondary_contact_point_id) || null;
  const emailPoint = contactPoints.find(point => point.status === 'active' && point.point_type === 'email' && point.is_primary) ||
    contactPoints.find(point => point.status === 'active' && point.point_type === 'email') ||
    null;
  return {
    id: warningAddress.id,
    customer_id: warningAddress.customer_id,
    object_id: warningAddress.object_id,
    contact_id: warningAddress.contact_id,
    contact_role_id: warningAddress.contact_role_id,
    primary_contact_point_id: warningAddress.primary_contact_point_id,
    secondary_contact_point_id: warningAddress.secondary_contact_point_id || null,
    display_name: contact ? warningContactDisplayName(contact) : 'Onbekende contactpersoon',
    job_title: contact?.job_title || null,
    email: emailPoint?.value || null,
    primary_phone: primaryPoint?.value || null,
    secondary_phone: secondaryPoint?.value || null,
    contact_points: [primaryPoint, secondaryPoint].filter(Boolean).map(safeWarningPoint),
    relationship_type: warningAddress.relationship_type,
    relationship_label: warningAddress.relationship_label || null,
    call_order: Number(warningAddress.call_order),
    availability_mode: warningAddress.availability_mode || 'always', availability_periods: Array.isArray(warningAddress.availability_periods) ? warningAddress.availability_periods : [],
    not_call_periods: Array.isArray(warningAddress.not_call_periods) ? warningAddress.not_call_periods : [],
    status: warningAddress.status || 'active',
    version: versionOf(warningAddress),
    updated_date: warningAddress.updated_date || null,
    created_date: warningAddress.created_date || null,
  };
}

function safeWarningAvailabilityOverride(record: LooseRecord) {
  return {
    id: record.id,
    warning_address_id: record.warning_address_id,
    customer_id: record.customer_id,
    object_id: record.object_id,
    dates: Array.isArray(record.dates) ? record.dates.map(asString).filter(Boolean).sort() : [],
    availability_status: record.availability_status || null,
    availability_periods: Array.isArray(record.availability_periods) ? record.availability_periods : [],
    reason: record.reason || null,
    record_status: record.record_status || 'active',
    supersedes_override_id: record.supersedes_override_id || null,
    version: versionOf(record),
    created_by_name: record.created_by_name || null,
    created_date: record.created_date || null,
    updated_date: record.updated_date || null,
  };
}

function effectiveWarningAvailabilityOverrides(records: LooseRecord[], warningAddresses: LooseRecord[] = []) {
  const recordsById = new Map(records.map(record => [record.id, record]));
  const projected: LooseRecord[] = [];
  const projectedDates = new Set<string>();
  for (const warningAddress of warningAddresses) {
    const heads = warningAddress.availability_override_heads;
    if (!heads || typeof heads !== 'object' || Array.isArray(heads)) continue;
    for (const [date, recordId] of Object.entries(heads as LooseRecord)) {
      const record = recordsById.get(asString(recordId));
      if (
        !record ||
        record.warning_address_id !== warningAddress.id ||
        record.customer_id !== warningAddress.customer_id ||
        record.object_id !== warningAddress.object_id
      ) continue;
      projectedDates.add(`${warningAddress.id}|${date}`);
      if ((record.record_status || 'active') !== 'deleted') projected.push({ ...record, dates: [date] });
    }
  }
  const sortedLegacy = records.filter(record => !record.record_status).sort((left, right) => {
    const leftTime = Date.parse(asString(left.created_date || left.updated_date)) || 0;
    const rightTime = Date.parse(asString(right.created_date || right.updated_date)) || 0;
    return rightTime - leftTime || asString(right.id).localeCompare(asString(left.id));
  });
  const effective = new Map<string, LooseRecord>();
  for (const record of sortedLegacy) {
    const dates = [...new Set((Array.isArray(record.dates) ? record.dates : []).map(asString).filter(Boolean))];
    for (const date of dates) {
      const key = `${record.warning_address_id}|${date}`;
      if (!projectedDates.has(key) && !effective.has(key)) effective.set(key, { ...record, dates: [date] });
    }
  }
  return [...projected, ...effective.values()];
}

async function hydrateWarningAvailabilityOverrideHeads(
  base44: LooseRecord,
  records: LooseRecord[],
  warningAddresses: LooseRecord[],
) {
  const recordsById = new Map(records.map(record => [asString(record.id), record]));
  const missingHeadIds = [...new Set(warningAddresses.flatMap(warningAddress => {
    const heads = warningAddress.availability_override_heads;
    if (!heads || typeof heads !== 'object' || Array.isArray(heads)) return [];
    return Object.values(heads as LooseRecord).map(asString).filter(id => id && !recordsById.has(id));
  }))];
  for (let offset = 0; offset < missingHeadIds.length; offset += 50) {
    const hydrated = await Promise.all(
      missingHeadIds.slice(offset, offset + 50).map(id => getRecord(base44, 'WarningAddressAvailabilityOverride', id)),
    );
    hydrated.filter(Boolean).forEach(record => recordsById.set(asString(record.id), record));
  }
  return [...recordsById.values()];
}

function warningAddressOrderVersion(object: LooseRecord) {
  const value = Number(object.warning_address_order_version);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function warningAddressOrderIds(object: LooseRecord, records: LooseRecord[]) {
  const activeRecords = records.filter(record => record.status !== 'archived');
  const activeIds = new Set(activeRecords.map(record => asString(record.id)).filter(Boolean));
  const configured = Array.isArray(object.warning_address_order_ids)
    ? object.warning_address_order_ids.map(asString).filter(Boolean)
    : [];
  const order = [...new Set(configured.filter(id => activeIds.has(id)))];
  const missing = activeRecords
    .filter(record => !order.includes(asString(record.id)))
    .sort((left, right) =>
      (Number(left.call_order) || Number.MAX_SAFE_INTEGER) - (Number(right.call_order) || Number.MAX_SAFE_INTEGER) ||
      asString(left.created_date).localeCompare(asString(right.created_date)) ||
      asString(left.id).localeCompare(asString(right.id)));
  return [...order, ...missing.map(record => asString(record.id)).filter(Boolean)];
}

function placeWarningAddressInOrder(orderIds: string[], warningAddressId: string, requestedOrder: number) {
  const withoutCurrent = orderIds.filter(id => id !== warningAddressId);
  const insertAt = Math.min(withoutCurrent.length, Math.max(0, requestedOrder - 1));
  withoutCurrent.splice(insertAt, 0, warningAddressId);
  return withoutCurrent;
}

function warningAddressProjectedOrderRecord(record: LooseRecord, orderedIds: string[]) {
  const index = orderedIds.indexOf(asString(record.id));
  return index >= 0 ? { ...record, call_order: index + 1 } : record;
}

async function warningAddressReferenceData(base44: LooseRecord, customerId: string) {
  const [contacts, points] = await Promise.all([
    getEntity(base44, 'CustomerContact').filter({ customer_id: customerId }, '+display_name', 500),
    getEntity(base44, 'CustomerContactPoint').filter({ customer_id: customerId }, '-is_primary', 1000),
  ]);
  return {
    contacts,
    points,
    contactById: new Map(contacts.map((contact: LooseRecord) => [contact.id, contact])),
  };
}

async function safeWarningAddressByRecord(base44: LooseRecord, warningAddress: LooseRecord) {
  const references = await warningAddressReferenceData(base44, warningAddress.customer_id);
  return safeObjectWarningAddress(
    warningAddress,
    references.contactById.get(warningAddress.contact_id) || null,
    references.points,
  );
}

async function handleListObjectWarningAddresses(base44: LooseRecord, body: LooseRecord) {
  const { customer, object } = await requireCustomerObjectScope(base44, body);
  const [warningAddresses, references, overrides] = await Promise.all([
    getEntity(base44, 'ObjectWarningAddress').filter({
      customer_id: customer.id,
      object_id: object.id,
    }, '+call_order', 500),
    warningAddressReferenceData(base44, customer.id),
    getEntity(base44, 'WarningAddressAvailabilityOverride').filter({
      customer_id: customer.id,
      object_id: object.id,
    }, '-updated_date', 2000),
  ]);
  const hydratedOverrides = await hydrateWarningAvailabilityOverrideHeads(base44, overrides, warningAddresses);
  const orderedIds = warningAddressOrderIds(object, warningAddresses);
  const items = warningAddresses
    .filter((warningAddress: LooseRecord) => warningAddress.status !== 'archived')
    .map((warningAddress: LooseRecord) => safeObjectWarningAddress(
      warningAddressProjectedOrderRecord(warningAddress, orderedIds),
      references.contactById.get(warningAddress.contact_id) || null,
      references.points,
    ))
    .sort((left: LooseRecord, right: LooseRecord) =>
      left.call_order - right.call_order || left.display_name.localeCompare(right.display_name, 'nl'));
  const activeWarningAddresses = warningAddresses.filter((item: LooseRecord) => item.status !== 'archived');
  const activeWarningAddressIds = new Set(activeWarningAddresses.map((item: LooseRecord) => asString(item.id)).filter(Boolean));
  const assignedPointIds = new Set<string>(activeWarningAddresses.flatMap((item: LooseRecord) =>
    [asString(item.primary_contact_point_id), asString(item.secondary_contact_point_id)].filter(Boolean)));
  const assignedContactIds = new Set<string>(activeWarningAddresses.map((item: LooseRecord) => asString(item.contact_id)).filter(Boolean));
  return {
    items,
    availability_overrides: effectiveWarningAvailabilityOverrides(hydratedOverrides, warningAddresses)
      .filter((record: LooseRecord) => activeWarningAddressIds.has(asString(record.warning_address_id)))
      .map(safeWarningAvailabilityOverride),
    contact_options: references.contacts
      .filter((contact: LooseRecord) => contact.status === 'active' && !assignedContactIds.has(contact.id))
      .map((contact: LooseRecord) => safeWarningContactOption(contact, references.points, assignedPointIds)),
    next_call_order: items.length + 1,
    order_version: warningAddressOrderVersion(object),
  };
}

const LOGBOOK_CHANGED_FIELD_LABELS: Record<string, string> = {
  object_code: 'Objectcode',
  external_object_code: 'Externe objectcode',
  name: 'Objectnaam',
  address: 'Adres',
  street_name: 'Straat',
  house_number: 'Huisnummer',
  house_number_addition: 'Toevoeging',
  postal_code: 'Postcode',
  city: 'Plaats',
  country_code: 'Landcode',
  country_name: 'Land',
  object_type: 'Objecttype',
  logo_file_url: 'Logo',
  logo_file_id: 'Logo',
  logo_download_filename: 'Logo',
  logo_logical_path: 'Logo',
  status: 'Status',
  is_active_customer_object: 'Operationele status',
  geocoding_status: 'Adrescontrole',
  latitude: 'Kaartpositie',
  longitude: 'Kaartpositie',
  region: 'Regio',
  parking_instruction: 'Parkeerinstructie',
  entry_instruction: 'Toegangsinstructie',
  walking_instruction: 'Looproute',
  object_notes: 'Objectnotitie',
  safety_notes: 'Veiligheidsnotitie',
  show_on_mobile_map: 'Mobiele kaart',
  mobile_map_priority: 'Kaartprioriteit',
  notes: 'Notitie',
};

const LOGBOOK_VALUE_FIELDS = new Set([
  'object_code',
  'external_object_code',
  'name',
  'address',
  'object_type',
  'logo',
  'contact',
  'relationship',
  'primary_phone',
  'secondary_phone',
  'call_order',
  'availability',
  'status',
  'installation_type',
  'custom_type',
  'brand',
  'model',
  'serial_number',
  'external_reference',
  'control_panel_location',
  'monitoring_connected',
  'monitoring_provider_name',
  'monitoring_connection_reference',
  'installer_name',
  'installer_phone',
  'commissioned_on',
  'last_tested_on',
  'next_maintenance_on',
  'lifecycle_status',
  'operational_status',
  'credential_types',
  'key_type',
  'key_set_id',
]);

function safeLogbookValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (!['string', 'number', 'boolean'].includes(typeof value)) return null;
  return String(value).slice(0, 500);
}

function safeExplicitLogbookChanges(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const field = asString((item as LooseRecord).field);
    const label = asString((item as LooseRecord).label);
    if (!LOGBOOK_VALUE_FIELDS.has(field) || !label) return [];
    return [{
      field,
      label: label.slice(0, 120),
      before: safeLogbookValue((item as LooseRecord).before),
      after: safeLogbookValue((item as LooseRecord).after),
    }];
  });
}

function derivedLogbookChanges(event: LooseRecord) {
  const result = event.payload?.result;
  const explicitValuesAreSafe =
    event.resource_type === 'ObjectWarningAddress' ||
    event.resource_type === 'ObjectInstallation' ||
    event.resource_type === 'ObjectKey' ||
    (
      event.resource_type === 'SurveillanceObject' &&
      event.action === 'update_customer_object_identity'
    );
  const explicit = explicitValuesAreSafe ? safeExplicitLogbookChanges(result?.changes) : [];
  if (explicit.length) return explicit;
  const changedFields = Array.isArray(result?.object?.changed_fields)
    ? result.object.changed_fields
    : Array.isArray(result?.changed_fields)
      ? result.changed_fields
      : [];
  const seenLabels = new Set<string>();
  return changedFields.slice(0, 50).flatMap((value: unknown) => {
    const field = asString(value);
    const label = LOGBOOK_CHANGED_FIELD_LABELS[field];
    if (!label || seenLabels.has(label)) return [];
    seenLabels.add(label);
    return [{ field, label, before: 'Gewijzigd', after: 'Gewijzigd', value_state: 'changed' }];
  });
}

function traceableActorName(event: LooseRecord, actorNames: Map<string, string> = new Map()) {
  if (asString(event.actor_name)) return asString(event.actor_name).slice(0, 180);
  if (event.actor_type === 'system') return 'LOQ systeem';
  if (event.actor_type === 'integration') return 'Integratie';
  const rawId = asString(event.actor_user_id || event.actor_id).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!rawId) return event.actor_type === 'customer_portal_user' ? 'Portaalgebruiker' : 'Onbekende gebruiker';
  if (actorNames.has(rawId)) return actorNames.get(rawId) as string;
  const reference = rawId.length > 14 ? `${rawId.slice(0, 8)}…${rawId.slice(-4)}` : rawId;
  return `${event.actor_type === 'customer_portal_user' ? 'Portaalgebruiker' : 'Gebruiker'} ${reference}`;
}

function safeObjectLogbookEvent(event: LooseRecord, actorNames: Map<string, string> = new Map()) {
  const result = event.payload?.result;
  return {
    id: event.id,
    occurred_at: event.occurred_at || event.created_at || event.created_date || null,
    action: event.action || event.event_type || 'object_change',
    summary: event.summary || result?.summary || mutationActionSummary(asString(event.action || event.event_type)),
    actor_name: traceableActorName(event, actorNames),
    category: event.category || 'change',
    outcome: event.outcome || result?.outcome || 'success',
    changes: derivedLogbookChanges(event),
  };
}

async function handleListObjectLogbook(base44: LooseRecord, body: LooseRecord) {
  const { customer, object } = await requireCustomerObjectScope(base44, body);
  const page = requireInteger(body.page ?? 1, 'page', 1);
  const pageSize = Math.min(100, requireInteger(body.page_size ?? 25, 'page_size', 1));
  const search = asString(body.search).slice(0, 120);
  const warningAddresses = await getEntity(base44, 'ObjectWarningAddress').filter({
    customer_id: customer.id,
    object_id: object.id,
  }, '-updated_date', 500);
  const objectEvents = await getEntity(base44, 'CustomerEvent').filter({
    customer_id: customer.id,
    object_id: object.id,
  }, '-occurred_at', 5000);
  const relatedIds: Record<string, Set<string>> = {
    ObjectWarningAddress: new Set(warningAddresses.map((item: LooseRecord) => asString(item.id)).filter(Boolean)),
    CustomerContact: new Set(warningAddresses.map((item: LooseRecord) => asString(item.contact_id)).filter(Boolean)),
    CustomerContactPoint: new Set(warningAddresses.flatMap((item: LooseRecord) => [
      asString(item.primary_contact_point_id),
      asString(item.secondary_contact_point_id),
    ]).filter(Boolean)),
    CustomerContactRole: new Set(warningAddresses.map((item: LooseRecord) => asString(item.contact_role_id)).filter(Boolean)),
  };
  objectEvents.forEach((event: LooseRecord) => {
    const historicalWarning = event.payload?.result?.warning_address;
    if (
      !historicalWarning ||
      historicalWarning.customer_id !== customer.id ||
      historicalWarning.object_id !== object.id
    ) return;
    relatedIds.ObjectWarningAddress.add(asString(historicalWarning.id));
    relatedIds.CustomerContact.add(asString(historicalWarning.contact_id));
    relatedIds.CustomerContactRole.add(asString(historicalWarning.contact_role_id));
    relatedIds.CustomerContactPoint.add(asString(historicalWarning.primary_contact_point_id));
    relatedIds.CustomerContactPoint.add(asString(historicalWarning.secondary_contact_point_id));
  });
  Object.values(relatedIds).forEach(ids => ids.delete(''));
  const relatedTypes = Object.entries(relatedIds).filter(([, ids]) => ids.size > 0);
  const relatedEventBatches = await Promise.all(
    relatedTypes.map(([resourceType]) => getEntity(base44, 'CustomerEvent').filter({
      customer_id: customer.id,
      resource_type: resourceType,
    }, '-occurred_at', 5000)),
  );
  const eventBatches = [objectEvents, ...relatedEventBatches];
  const totalIsCapped = eventBatches.some(batch => batch.length === 5000);
  const merged = new Map<string, LooseRecord>();
  eventBatches.flat().forEach((event: LooseRecord) => {
    const belongsToObject = event.object_id === object.id;
    const belongsToRelatedRecord = relatedIds[asString(event.resource_type)]?.has(asString(event.resource_id)) === true;
    if ((belongsToObject || belongsToRelatedRecord) && asString(event.id)) merged.set(event.id, event);
  });
  const unresolvedActorIds = new Set([...merged.values()]
    .filter((event: LooseRecord) => !asString(event.actor_name))
    .map((event: LooseRecord) => asString(event.actor_user_id || event.actor_id))
    .filter(Boolean));
  const actorNames = new Map<string, string>();
  if (unresolvedActorIds.size) {
    const personnel = await getEntity(base44, 'Personnel').list('+name', 2000, 0, [
      'name',
      'linked_user_id',
      'canonical_profile_user_id',
    ]);
    personnel.forEach((person: LooseRecord) => {
      const name = asString(person.name).slice(0, 180);
      if (!name) return;
      [person.linked_user_id, person.canonical_profile_user_id].map(asString).filter(Boolean).forEach(userId => {
        if (unresolvedActorIds.has(userId)) actorNames.set(userId, name);
      });
    });
  }
  const safeEvents = [...merged.values()]
    .sort((left, right) => {
      const leftTime = Date.parse(asString(left.occurred_at || left.created_at || left.created_date)) || 0;
      const rightTime = Date.parse(asString(right.occurred_at || right.created_at || right.created_date)) || 0;
      return rightTime - leftTime || asString(right.id).localeCompare(asString(left.id));
    })
    .map(event => safeObjectLogbookEvent(event, actorNames));
  const normalizedSearch = search.toLocaleLowerCase('nl-NL');
  const filtered = !normalizedSearch ? safeEvents : safeEvents.filter(event => [
    event.summary,
    event.action,
    event.actor_name,
    event.category,
    ...event.changes.flatMap((change: LooseRecord) => [change.label, change.before, change.after]),
  ].some(value => asString(value).toLocaleLowerCase('nl-NL').includes(normalizedSearch)));
  const skip = (page - 1) * pageSize;
  return {
    items: filtered.slice(skip, skip + pageSize),
    total: filtered.length,
    page,
    page_size: pageSize,
    total_is_capped: totalIsCapped,
  };
}

function hasExactWarningObjectScope(role: LooseRecord, objectId: string) {
  const objectIds = Array.isArray(role.object_ids) ? role.object_ids.map(asString).filter(Boolean) : [];
  return objectIds.length === 1 && objectIds[0] === objectId;
}

async function ensureObjectWarningContactRole(
  base44: LooseRecord,
  customerId: string,
  objectId: string,
  contactId: string,
) {
  const roles = await getEntity(base44, 'CustomerContactRole').filter({
    customer_id: customerId,
    contact_id: contactId,
    role: 'warning',
  }, '-updated_date', 250);
  const activeRole = roles.find((role: LooseRecord) =>
    role.status === 'active' && hasExactWarningObjectScope(role, objectId));
  if (activeRole) return activeRole;
  const inactiveRole = roles.find((role: LooseRecord) =>
    role.status === 'inactive' && hasExactWarningObjectScope(role, objectId));
  if (inactiveRole) {
    return casUpdateLatest(base44, 'CustomerContactRole', inactiveRole.id, {
      status: 'active',
      valid_until: null,
    });
  }
  return getEntity(base44, 'CustomerContactRole').create({
    customer_id: customerId,
    customer_account_id: null,
    contact_id: contactId,
    role: 'warning',
    object_ids: [objectId],
    is_primary: false,
    status: 'active',
    valid_from: null,
    valid_until: null,
    notes: null,
    version: 1,
  });
}

async function requireWarningPhonePoint(
  base44: LooseRecord,
  pointId: string,
  customerId: string,
  contactId: string,
  label: string,
) {
  const point = await requireRecord(base44, 'CustomerContactPoint', pointId, label);
  if (point.customer_id !== customerId || point.contact_id !== contactId) {
    throw new ApiError(409, `${label} hoort niet bij de gekozen contactpersoon`);
  }
  if (!['phone', 'mobile'].includes(asString(point.point_type))) {
    throw new ApiError(400, `${label} moet een telefoon- of mobiel nummer zijn`);
  }
  if (point.status !== 'active') throw new ApiError(409, `${label} is niet actief; kies een ander nummer`);
  const normalizedNumber = normalizePhone(asString(point.normalized_value) || point.value);
  if (!/^\+?\d{7,15}$/.test(normalizedNumber)) {
    throw new ApiError(409, `${label} bevat geen belbaar telefoonnummer`);
  }
  return point;
}

const WARNING_MUTABLE_FIELDS = [
  'contact_id',
  'primary_contact_point_id',
  'secondary_contact_point_id',
  'relationship_type',
  'relationship_label',
  'call_order',
  'availability_mode', 'availability_periods',
  'not_call_periods',
  'status',
];

async function normalizedWarningAddressData(
  base44: LooseRecord,
  customerId: string,
  objectId: string,
  data: LooseRecord,
  current?: LooseRecord | null,
) {
  if (current && !WARNING_MUTABLE_FIELDS.some(field => Object.prototype.hasOwnProperty.call(data, field))) {
    throw new ApiError(400, 'Geen wijzigingen voor het waarschuwingsadres opgegeven');
  }
  const contactId = asString(
    Object.prototype.hasOwnProperty.call(data, 'contact_id') ? data.contact_id : current?.contact_id,
  );
  if (!contactId) throw new ApiError(400, 'contact_id is verplicht');
  const contact = await requireRecord(base44, 'CustomerContact', contactId, 'Contactpersoon');
  if (contact.customer_id !== customerId) {
    throw new ApiError(409, 'Contactpersoon hoort bij een andere klant');
  }
  if (contact.status !== 'active' && current?.contact_id !== contactId) {
    throw new ApiError(409, 'Alleen een actieve contactpersoon kan worden gekozen');
  }

  const primaryContactPointId = asString(
    Object.prototype.hasOwnProperty.call(data, 'primary_contact_point_id')
      ? data.primary_contact_point_id
      : current?.primary_contact_point_id,
  );
  if (!primaryContactPointId) throw new ApiError(400, 'primary_contact_point_id is verplicht');
  await requireWarningPhonePoint(
    base44,
    primaryContactPointId,
    customerId,
    contactId,
    'Primair contactnummer',
  );

  const secondaryContactPointId = Object.prototype.hasOwnProperty.call(data, 'secondary_contact_point_id')
    ? asString(data.secondary_contact_point_id) || null
    : asString(current?.secondary_contact_point_id) || null;
  if (secondaryContactPointId) {
    if (secondaryContactPointId === primaryContactPointId) {
      throw new ApiError(400, 'Primair en tweede contactnummer moeten verschillen');
    }
    await requireWarningPhonePoint(
      base44,
      secondaryContactPointId,
      customerId,
      contactId,
      'Tweede contactnummer',
    );
  }

  const relationshipType = asString(
    Object.prototype.hasOwnProperty.call(data, 'relationship_type')
      ? data.relationship_type
      : current?.relationship_type,
  );
  if (!WARNING_RELATIONSHIP_TYPES.has(relationshipType)) {
    throw new ApiError(400, 'Kies een geldige relatie tot het object');
  }
  const relationshipLabel = objectText(
    Object.prototype.hasOwnProperty.call(data, 'relationship_label')
      ? data.relationship_label
      : current?.relationship_label,
    'relationship_label',
    120,
  );
  if (relationshipType === 'other' && !relationshipLabel) {
    throw new ApiError(400, 'Omschrijf de andere relatie tot het object');
  }

  const callOrder = requireInteger(
    Object.prototype.hasOwnProperty.call(data, 'call_order') ? data.call_order : current?.call_order,
    'call_order',
    1,
  );
  if (callOrder > 9_999) throw new ApiError(400, 'call_order mag maximaal 9999 zijn');
  const availabilityMode = asString(
    Object.prototype.hasOwnProperty.call(data, 'availability_mode')
      ? data.availability_mode
      : current?.availability_mode || 'always',
  );
  if (!WARNING_AVAILABILITY_MODES.has(availabilityMode)) {
    throw new ApiError(400, 'Kies een geldige bereikbaarheid');
  }
  const notCallPeriods = normalizeWarningNotCallPeriods(Object.prototype.hasOwnProperty.call(data, 'not_call_periods') ? data.not_call_periods : current?.not_call_periods || [], availabilityMode), availabilityPeriods = normalizeWarningAvailabilityPeriods(Object.prototype.hasOwnProperty.call(data, 'availability_periods') ? data.availability_periods : current?.availability_periods || [], availabilityMode);
  const status = asString(
    Object.prototype.hasOwnProperty.call(data, 'status') ? data.status : current?.status || 'active',
  );
  if (!WARNING_MUTABLE_STATUSES.has(status)) throw new ApiError(400, 'Kies een geldige actieve status');

  const objectAssignments = await getEntity(base44, 'ObjectWarningAddress').filter({
    customer_id: customerId,
    object_id: objectId,
  }, '+call_order', 500);
  const otherAssignments = objectAssignments.filter((item: LooseRecord) => item.id !== current?.id && item.status !== 'archived');
  const duplicateContact = otherAssignments.find((item: LooseRecord) => item.contact_id === contactId);
  if (duplicateContact) {
    throw new ApiError(409, 'Deze contactpersoon staat al bij de waarschuwingsadressen van dit object', {
      warning_address_id: duplicateContact.id,
    });
  }

  const contactRole = await ensureObjectWarningContactRole(base44, customerId, objectId, contactId);
  return {
    contact,
    patch: {
      contact_id: contactId,
      contact_role_id: contactRole.id,
      primary_contact_point_id: primaryContactPointId,
      secondary_contact_point_id: secondaryContactPointId,
      relationship_type: relationshipType,
      relationship_label: relationshipLabel,
      call_order: callOrder,
      availability_mode: availabilityMode, availability_periods: availabilityPeriods,
      not_call_periods: notCallPeriods,
      status,
    },
  };
}

const WARNING_DAY_LOG_LABELS: Record<string, string> = {
  mon: 'ma',
  tue: 'di',
  wed: 'wo',
  thu: 'do',
  fri: 'vr',
  sat: 'za',
  sun: 'zo',
};

function warningAvailabilityDisplay(warningAddress: LooseRecord) {
  if (warningAddress.availability_mode === 'schedule') return 'Weekrooster ingesteld'; else if (warningAddress.availability_mode !== 'not_call_periods') return 'Altijd bereikbaar';
  const periods = Array.isArray(warningAddress.not_call_periods) ? warningAddress.not_call_periods : [];
  return periods.map((period: LooseRecord) => {
    const days = Array.isArray(period.days)
      ? period.days.map((day: string) => WARNING_DAY_LOG_LABELS[day] || day).join(', ')
      : '';
    return `${days} ${asString(period.start_time)}–${asString(period.end_time)}`.trim();
  }).filter(Boolean).join('; ') || 'Niet-bellenperiodes ingesteld';
}

function warningStatusDisplay(value: unknown) {
  return asString(value) === 'inactive' ? 'Inactief' : 'Actief';
}

function warningAddressChanges(before: LooseRecord | null, after: LooseRecord) {
  const descriptors = [
    { field: 'contact', label: 'Contactpersoon', value: (item: LooseRecord) => item.display_name || null },
    {
      field: 'relationship',
      label: 'Relatie tot object',
      value: (item: LooseRecord) => warningRelationshipDisplay(item.relationship_type, item.relationship_label),
    },
    { field: 'primary_phone', label: 'Primair telefoonnummer', value: (item: LooseRecord) => item.primary_phone || null },
    { field: 'secondary_phone', label: 'Tweede telefoonnummer', value: (item: LooseRecord) => item.secondary_phone || null },
    { field: 'call_order', label: 'Belvolgorde', value: (item: LooseRecord) => String(item.call_order) },
    { field: 'availability', label: 'Bereikbaarheid', value: warningAvailabilityDisplay },
    { field: 'status', label: 'Status', value: (item: LooseRecord) => warningStatusDisplay(item.status) },
  ];
  return descriptors.flatMap(descriptor => {
    const beforeValue = before ? descriptor.value(before) : null;
    const afterValue = descriptor.value(after);
    if (before && beforeValue === afterValue) return [];
    return [{
      field: descriptor.field,
      label: descriptor.label,
      before: beforeValue,
      after: afterValue,
    }];
  });
}

function warningAddressMutationResult(
  warningAddress: LooseRecord,
  before: LooseRecord | null,
  replayed = false,
) {
  const changes = warningAddressChanges(before, warningAddress);
  const displayName = warningAddress.display_name || 'contactpersoon';
  return {
    warning_address: warningAddress,
    warning_address_id: warningAddress.id,
    customer_id: warningAddress.customer_id,
    object_id: warningAddress.object_id,
    changes,
    summary: before
      ? `Waarschuwingsadres van ${displayName} gewijzigd`
      : `Waarschuwingsadres van ${displayName} toegevoegd`,
    outcome: 'success',
    replayed,
    resource_type: 'ObjectWarningAddress',
    resource_id: warningAddress.id,
    category: 'operations',
  };
}

function warningAddressMutationLockVersion(object: LooseRecord) {
  const value = Number(object.warning_address_mutation_lock_version);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function warningAddressMutationLockVersionQuery(object: LooseRecord) {
  const value = object.warning_address_mutation_lock_version;
  return Number.isInteger(value) && value >= 0
    ? { warning_address_mutation_lock_version: value }
    : { $or: [
      { warning_address_mutation_lock_version: null },
      { warning_address_mutation_lock_version: { $exists: false } },
    ] };
}

async function reserveWarningAddressMutation(
  base44: LooseRecord,
  user: LooseRecord,
  objectId: string,
  action: string,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const ownerToken = crypto.randomUUID();
  const keyHash = await sha256(idempotencyKey);
  const reservedAt = nowIso();
  const lock = {
    owner_token: ownerToken,
    key_hash: keyHash,
    actor_id: user.id,
    action,
    request_fingerprint: requestFingerprint,
    mutation_target: target,
    reserved_at: reservedAt,
    expires_at: new Date(Date.parse(reservedAt) + WARNING_ADDRESS_MUTATION_LOCK_TTL_MS).toISOString(),
  };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const object = await requireRecord(base44, 'SurveillanceObject', objectId, 'Object');
    const current = object.warning_address_mutation_lock;
    if (current && typeof current === 'object' && !Array.isArray(current) && reservationIsCurrent(current)) {
      const sameRequest = current.key_hash === keyHash &&
        current.actor_id === user.id &&
        current.action === action &&
        current.request_fingerprint === requestFingerprint &&
        current.mutation_target === target;
      throw new ApiError(409, sameRequest
        ? 'Deze waarschuwingsadreswijziging is nog in verwerking; probeer opnieuw'
        : 'Een andere waarschuwingsadreswijziging op dit object is nog in verwerking; probeer opnieuw', {
        retryable: true,
        reservation_expires_at: current.expires_at || null,
      });
    }
    const currentVersion = warningAddressMutationLockVersion(object);
    const hasPersistedVersion = Number.isInteger(object.warning_address_mutation_lock_version) &&
      object.warning_address_mutation_lock_version >= 0;
    const update = hasPersistedVersion
      ? { $set: { warning_address_mutation_lock: lock }, $inc: { warning_address_mutation_lock_version: 1 } }
      : { $set: { warning_address_mutation_lock: lock, warning_address_mutation_lock_version: 1 } };
    const result = await getEntity(base44, 'SurveillanceObject').updateMany(
      { id: object.id, ...warningAddressMutationLockVersionQuery(object) },
      update,
    );
    if (result?.success && result.updated === 1) {
      return { object_id: object.id, owner_token: ownerToken, lock_version: currentVersion + 1 };
    }
  }
  throw new ApiError(409, 'Waarschuwingsadreswijziging kon niet veilig worden gereserveerd; probeer opnieuw', { retryable: true });
}

async function assertWarningAddressMutation(base44: LooseRecord, reservation: LooseRecord | null) {
  if (!reservation) throw new ApiError(409, 'Waarschuwingsadresreservering ontbreekt; probeer opnieuw', { retryable: true });
  const object = await requireRecord(base44, 'SurveillanceObject', reservation.object_id, 'Object');
  const current = object.warning_address_mutation_lock;
  if (
    current?.owner_token !== reservation.owner_token ||
    !reservationIsCurrent(current) ||
    warningAddressMutationLockVersion(object) !== reservation.lock_version
  ) {
    throw new ApiError(409, 'Waarschuwingsadresreservering is verlopen of overgenomen; probeer opnieuw', { retryable: true });
  }
  return object;
}

async function updateWarningAddressOrderUnderReservation(
  base44: LooseRecord,
  reservation: LooseRecord,
  orderedIds: string[],
  options: LooseRecord = {},
) {
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new ApiError(409, 'De canonieke belvolgorde bevat dubbele waarschuwingsadressen');
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const object = await assertWarningAddressMutation(base44, reservation);
    const currentOrderVersion = warningAddressOrderVersion(object);
    if (
      Number.isInteger(options.expected_order_version) &&
      Number(options.expected_order_version) !== currentOrderVersion
    ) {
      throw new ApiError(409, 'De belvolgorde is intussen gewijzigd; vernieuw en probeer opnieuw', {
        current_order_version: currentOrderVersion,
      });
    }
    const persistedIds = Array.isArray(object.warning_address_order_ids)
      ? object.warning_address_order_ids.map(asString).filter(Boolean)
      : [];
    const orderChanged = JSON.stringify(persistedIds) !== JSON.stringify(orderedIds);
    const extraPatch = options.patch && typeof options.patch === 'object' && !Array.isArray(options.patch)
      ? options.patch as LooseRecord
      : {};
    if (!orderChanged && !Object.keys(extraPatch).length) {
      return { object, order_version: currentOrderVersion, changed: false };
    }
    const setPatch: LooseRecord = { ...extraPatch };
    const increments: LooseRecord = { warning_address_mutation_lock_version: 1 };
    if (orderChanged) {
      setPatch.warning_address_order_ids = orderedIds;
      setPatch.warning_address_order_updated_at = nowIso();
      if (Number.isInteger(object.warning_address_order_version) && object.warning_address_order_version >= 0) {
        increments.warning_address_order_version = 1;
      } else {
        setPatch.warning_address_order_version = currentOrderVersion + 1;
      }
    }
    const result = await getEntity(base44, 'SurveillanceObject').updateMany(
      { id: object.id, ...warningAddressMutationLockVersionQuery(object) },
      { $set: setPatch, $inc: increments },
    );
    if (result?.success && result.updated === 1) {
      reservation.lock_version = warningAddressMutationLockVersion(object) + 1;
      const updated = await requireRecord(base44, 'SurveillanceObject', object.id, 'Object');
      return { object: updated, order_version: warningAddressOrderVersion(updated), changed: orderChanged };
    }
    if (attempt === 4) break;
  }
  throw new ApiError(409, 'De belvolgorde kon niet veilig worden opgeslagen; probeer opnieuw', { retryable: true });
}

async function releaseWarningAddressMutation(base44: LooseRecord, reservation: LooseRecord | null) {
  if (!reservation) return;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const object = await getRecord(base44, 'SurveillanceObject', reservation.object_id);
    if (!object || object.warning_address_mutation_lock?.owner_token !== reservation.owner_token) return;
    const currentVersion = warningAddressMutationLockVersion(object);
    if (currentVersion !== reservation.lock_version) return;
    const result = await getEntity(base44, 'SurveillanceObject').updateMany(
      { id: object.id, warning_address_mutation_lock_version: currentVersion },
      {
        $set: { warning_address_mutation_lock: null },
        $inc: { warning_address_mutation_lock_version: 1 },
      },
    );
    if (result?.success && result.updated === 1) return;
  }
  throw new ApiError(409, 'Waarschuwingsadresslot kon niet veilig worden vrijgegeven; probeer opnieuw', { retryable: true });
}

async function reconcileWarningAddressOrderRecovery(
  base44: LooseRecord,
  user: LooseRecord,
  action: string,
  warningAddress: LooseRecord,
  recovery: LooseRecord,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const recoveredIds = Array.isArray(recovery.result?.warning_address_order_ids)
    ? recovery.result.warning_address_order_ids.map(asString).filter(Boolean)
    : [];
  if (!recoveredIds.length && action !== 'delete_object_warning_address') return null;
  let reservation: LooseRecord | null = null;
  try {
    reservation = await reserveWarningAddressMutation(
      base44,
      user,
      warningAddress.object_id,
      action,
      idempotencyKey,
      requestFingerprint,
      target,
    );
    const [object, records] = await Promise.all([
      assertWarningAddressMutation(base44, reservation),
      getEntity(base44, 'ObjectWarningAddress').filter({
        customer_id: warningAddress.customer_id,
        object_id: warningAddress.object_id,
      }, '+call_order', 500),
    ]);
    const currentIds = warningAddressOrderIds(object, records);
    const activeIds = new Set(currentIds);
    const recoveryRecordedAt = Date.parse(asString(recovery.recorded_at));
    const projectionUpdatedAt = Date.parse(asString(object.warning_address_order_updated_at));
    const hasNewerProjection = Number.isFinite(recoveryRecordedAt) &&
      Number.isFinite(projectionUpdatedAt) &&
      projectionUpdatedAt >= recoveryRecordedAt;
    const desiredIds = hasNewerProjection
      ? currentIds
      : [
        ...new Set(recoveredIds.filter(id => activeIds.has(id))),
        ...currentIds.filter(id => !recoveredIds.includes(id)),
      ];
    return updateWarningAddressOrderUnderReservation(base44, reservation, desiredIds);
  } finally {
    await releaseWarningAddressMutation(base44, reservation);
  }
}

async function existingWarningAddressCreation(
  base44: LooseRecord,
  user: LooseRecord,
  customerId: string,
  objectId: string,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const matches = await getEntity(base44, 'ObjectWarningAddress').filter({
    creation_idempotency_key: idempotencyKey,
  }, '-created_date', 2);
  if (matches.length > 1) {
    throw new ApiError(409, 'Meerdere waarschuwingsadressen delen dezelfde idempotency_key; handmatige controle vereist');
  }
  if (!matches.length) return null;
  const warningAddress = matches[0];
  if (
    warningAddress.customer_id !== customerId ||
    warningAddress.object_id !== objectId ||
    warningAddress.creation_actor_user_id !== user.id ||
    warningAddress.creation_request_fingerprint !== requestFingerprint ||
    warningAddress.creation_mutation_target !== target
  ) {
    rejectIdempotencyReuse();
  }
  const safeWarningAddress = await safeWarningAddressByRecord(base44, warningAddress);
  return warningAddressMutationResult(safeWarningAddress, null, true);
}

async function handleObjectWarningAddress(
  base44: LooseRecord, user: LooseRecord, body: LooseRecord, expectedVersion: number,
  idempotencyKey: string, requestFingerprint: string, target: string, mode: 'create' | 'update',
) {
  const { customer, object } = await requireCustomerObjectForMutation(base44, body);
  if (object.status === 'archived') throw new ApiError(409, 'Gearchiveerd object moet eerst worden hersteld');
  const data = requireObject(body);
  const action = mode === 'create' ? 'create_object_warning_address' : 'update_object_warning_address';
  let reservation: LooseRecord | null = null;
  try {
    reservation = await reserveWarningAddressMutation(
      base44,
      user,
      object.id,
      action,
      idempotencyKey,
      requestFingerprint,
      target,
    );
    if (mode === 'create') {
      if (expectedVersion !== 0) throw new ApiError(409, 'Nieuw waarschuwingsadres verwacht expected_version 0');
      const replay = await existingWarningAddressCreation(base44, user, customer.id, object.id, idempotencyKey, requestFingerprint, target);
      if (replay) {
        const [coordinator, records] = await Promise.all([
          assertWarningAddressMutation(base44, reservation),
          getEntity(base44, 'ObjectWarningAddress').filter({ customer_id: customer.id, object_id: object.id }, '+call_order', 500),
        ]);
        const desiredOrder = placeWarningAddressInOrder(
          warningAddressOrderIds(coordinator, records),
          replay.warning_address_id,
          Number(replay.warning_address?.call_order) || records.length,
        );
        const projection = await updateWarningAddressOrderUnderReservation(base44, reservation, desiredOrder);
        return {
          ...replay,
          warning_address: {
            ...replay.warning_address,
            call_order: desiredOrder.indexOf(replay.warning_address_id) + 1,
          },
          warning_address_order_ids: desiredOrder,
          warning_address_order_version: projection.order_version,
        };
      }
      const normalized = await normalizedWarningAddressData(base44, customer.id, object.id, data);
      const warningAddress = await getEntity(base44, 'ObjectWarningAddress').create({
        customer_id: customer.id,
        object_id: object.id,
        ...normalized.patch,
        creation_idempotency_key: idempotencyKey,
        creation_request_fingerprint: requestFingerprint,
        creation_actor_user_id: user.id,
        creation_mutation_target: target,
        version: 1,
      });
      const [coordinator, records] = await Promise.all([
        assertWarningAddressMutation(base44, reservation),
        getEntity(base44, 'ObjectWarningAddress').filter({ customer_id: customer.id, object_id: object.id }, '+call_order', 500),
      ]);
      const desiredOrder = placeWarningAddressInOrder(
        warningAddressOrderIds(coordinator, records),
        warningAddress.id,
        Number(normalized.patch.call_order),
      );
      const projection = await updateWarningAddressOrderUnderReservation(base44, reservation, desiredOrder);
      const safeRecord = await safeWarningAddressByRecord(
        base44,
        warningAddressProjectedOrderRecord(warningAddress, desiredOrder),
      );
      return {
        ...warningAddressMutationResult(safeRecord, null),
        warning_address_order_ids: desiredOrder,
        warning_address_order_version: projection.order_version,
      };
    }

    const warningAddress = await requireRecord(base44, 'ObjectWarningAddress', requireString(body, 'warning_address_id'), 'Waarschuwingsadres');
    if (warningAddress.customer_id !== customer.id || warningAddress.object_id !== object.id) throw new ApiError(409, 'Waarschuwingsadres hoort niet bij dit object');
    if (warningAddress.status === 'archived') throw new ApiError(409, 'Een gearchiveerd waarschuwingsadres kan niet worden gewijzigd');
    if (versionOf(warningAddress) !== expectedVersion) throw new ApiError(409, 'Waarschuwingsadres is intussen gewijzigd');
    const [coordinator, records, references] = await Promise.all([
      assertWarningAddressMutation(base44, reservation),
      getEntity(base44, 'ObjectWarningAddress').filter({ customer_id: customer.id, object_id: object.id }, '+call_order', 500),
      warningAddressReferenceData(base44, customer.id),
    ]);
    const currentOrder = warningAddressOrderIds(coordinator, records);
    const projectedCurrent = warningAddressProjectedOrderRecord(warningAddress, currentOrder);
    const before = safeObjectWarningAddress(
      projectedCurrent,
      references.contactById.get(projectedCurrent.contact_id) || null,
      references.points,
    );
    const normalized = await normalizedWarningAddressData(base44, customer.id, object.id, data, projectedCurrent);
    const desiredOrder = placeWarningAddressInOrder(currentOrder, warningAddress.id, Number(normalized.patch.call_order));
    const recordChanged = Object.entries(normalized.patch).some(([field, value]) =>
      JSON.stringify(canonicalMutationValue(projectedCurrent[field])) !== JSON.stringify(canonicalMutationValue(value)));
    if (!recordChanged) {
      const projection = await updateWarningAddressOrderUnderReservation(base44, reservation, desiredOrder);
      return {
        ...warningAddressMutationResult(before, before),
        unchanged: true,
        summary: 'Waarschuwingsadres opgeslagen',
        warning_address_order_ids: desiredOrder,
        warning_address_order_version: projection.order_version,
      };
    }
    const projected = { ...warningAddress, ...normalized.patch, version: expectedVersion + 1 };
    const projectedSafe = safeObjectWarningAddress(
      warningAddressProjectedOrderRecord(projected, desiredOrder),
      references.contactById.get(projected.contact_id) || null,
      references.points,
    );
    const recoveryResult = {
      ...warningAddressMutationResult(projectedSafe, before),
      warning_address_order_ids: desiredOrder,
    };
    const recoveryPatch = await mutationRecoveryPatch(
      warningAddress,
      'update_object_warning_address',
      user,
      idempotencyKey,
      requestFingerprint,
      target,
      recoveryResult,
    );
    const updated = await casUpdate(base44, 'ObjectWarningAddress', warningAddress, expectedVersion, {
      ...normalized.patch,
      ...recoveryPatch,
    });
    const projection = await updateWarningAddressOrderUnderReservation(base44, reservation, desiredOrder);
    if (warningAddress.contact_role_id && warningAddress.contact_role_id !== updated.contact_role_id) {
      await deactivateWarningRoleIfUnused(base44, warningAddress);
    }
    const safeUpdated = await safeWarningAddressByRecord(
      base44,
      warningAddressProjectedOrderRecord(updated, desiredOrder),
    );
    return {
      ...warningAddressMutationResult(safeUpdated, before),
      warning_address_order_ids: desiredOrder,
      warning_address_order_version: projection.order_version,
    };
  } finally {
    await releaseWarningAddressMutation(base44, reservation);
  }
}

async function requireScopedWarningAddress(base44: LooseRecord, body: LooseRecord, mutable = false) {
  const scope = mutable
    ? await requireCustomerObjectForMutation(base44, body)
    : await requireCustomerObjectScope(base44, body);
  const warningAddress = await requireRecord(
    base44,
    'ObjectWarningAddress',
    requireString(body, 'warning_address_id'),
    'Waarschuwingsadres',
  );
  if (warningAddress.customer_id !== scope.customer.id || warningAddress.object_id !== scope.object.id) {
    throw new ApiError(409, 'Waarschuwingsadres hoort niet bij dit object');
  }
  if (mutable && (scope.object.status === 'archived' || warningAddress.status === 'archived')) {
    throw new ApiError(409, 'Gearchiveerde objectgegevens kunnen niet worden gewijzigd');
  }
  return { ...scope, warningAddress };
}

async function warningOverridePayloadFingerprint(payload: LooseRecord) {
  return sha256(JSON.stringify(canonicalMutationValue(payload)));
}

async function warningOverrideCreationReplay(
  base44: LooseRecord,
  knownRecords: LooseRecord[],
  creationKey: string,
) {
  const knownMatches = knownRecords.filter(record => record.creation_idempotency_key === creationKey);
  const matches = knownMatches.length
    ? knownMatches
    : await getEntity(base44, 'WarningAddressAvailabilityOverride').filter({ creation_idempotency_key: creationKey }, '-created_date', 2);
  if (matches.length > 1) {
    throw new ApiError(409, 'Bereikbaarheidsherstel is niet eenduidig; handmatige reconciliatie vereist');
  }
  return matches[0] || null;
}

function assertWarningOverrideCreationBinding(
  record: LooseRecord,
  user: LooseRecord,
  requestFingerprint: string,
  target: string,
  payloadFingerprint: string,
) {
  if (
    record.creation_actor_user_id !== user.id ||
    record.creation_request_fingerprint !== requestFingerprint ||
    record.creation_mutation_target !== target ||
    record.creation_payload_fingerprint !== payloadFingerprint
  ) rejectIdempotencyReuse();
}

async function handleUpsertWarningAvailabilityOverrides(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const { customer, object, warningAddress } = await requireScopedWarningAddress(base44, body, true);
  const data = requireObject(body);
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length || items.length > 180) throw new ApiError(400, 'Kies minimaal één en maximaal 180 aangepaste datums');
  const normalizedItems = items.map((item: unknown, index: number) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new ApiError(400, `Aanpassing ${index + 1} is ongeldig`);
    const date = asString((item as LooseRecord).date);
    if (!ISO_DATE_PATTERN.test(date) || dateOnly(date) !== date) throw new ApiError(400, `Datum ${index + 1} is ongeldig`);
    return { date, availability_periods: normalizeWarningOverridePeriods((item as LooseRecord).availability_periods) };
  });
  if (new Set(normalizedItems.map(item => item.date)).size !== normalizedItems.length) {
    throw new ApiError(400, 'Elke aangepaste datum mag maar één keer voorkomen');
  }
  const reason = objectText(data.reason, 'Reden', 160, true);
  const expectedVersions = body.expected_versions && typeof body.expected_versions === 'object' && !Array.isArray(body.expected_versions)
    ? body.expected_versions as LooseRecord
    : {};
  const recentExisting = await getEntity(base44, 'WarningAddressAvailabilityOverride').filter({
    warning_address_id: warningAddress.id,
    customer_id: customer.id,
    object_id: object.id,
  }, '-updated_date', 2000);
  const existing = await hydrateWarningAvailabilityOverrideHeads(base44, recentExisting, [warningAddress]);
  if (versionOf(warningAddress) !== expectedVersion) throw new ApiError(409, 'Het waarschuwingsadres is intussen gewijzigd');
  const effectivePrior = effectiveWarningAvailabilityOverrides(existing, [warningAddress]);
  const operations = normalizedItems.map(item => {
    const current = effectivePrior.find((record: LooseRecord) => record.warning_address_id === warningAddress.id && record.dates?.[0] === item.date) || null;
    const suppliedVersion = current ? Number(expectedVersions[current.id]) : null;
    if (current && (!Number.isInteger(suppliedVersion) || suppliedVersion !== versionOf(current))) {
      throw new ApiError(409, `De bereikbaarheid op ${item.date} is intussen gewijzigd`);
    }
    return { ...item, current };
  });
  const nextHeads = warningAddress.availability_override_heads && typeof warningAddress.availability_override_heads === 'object' && !Array.isArray(warningAddress.availability_override_heads)
    ? { ...warningAddress.availability_override_heads }
    : {};
  for (const item of operations) {
    const creationKey = `${idempotencyKey}:${item.date}`;
    const payload = {
      warning_address_id: warningAddress.id,
      customer_id: customer.id,
      object_id: object.id,
      date: item.date,
      availability_periods: item.availability_periods,
      reason,
      record_status: 'active',
      supersedes_override_id: item.current?.id || null,
    };
    const payloadFingerprint = await warningOverridePayloadFingerprint(payload);
    const replay = await warningOverrideCreationReplay(base44, existing, creationKey);
    if (replay) {
      if (
        replay.warning_address_id !== warningAddress.id ||
        replay.customer_id !== customer.id ||
        replay.object_id !== object.id
      ) rejectIdempotencyReuse();
      assertWarningOverrideCreationBinding(replay, user, requestFingerprint, target, payloadFingerprint);
      nextHeads[item.date] = replay.id;
      continue;
    }
    const created = await getEntity(base44, 'WarningAddressAvailabilityOverride').create({
      warning_address_id: warningAddress.id,
      customer_id: customer.id,
      object_id: object.id,
      dates: [item.date],
      availability_status: null,
      availability_periods: item.availability_periods,
      reason,
      record_status: 'active',
      supersedes_override_id: item.current?.id || null,
      created_by_user_id: user.id,
      created_by_name: asString(user.full_name || user.display_name || user.name || user.email) || 'Backofficegebruiker',
      creation_idempotency_key: creationKey,
      creation_request_fingerprint: requestFingerprint,
      creation_payload_fingerprint: payloadFingerprint,
      creation_actor_user_id: user.id,
      creation_mutation_target: target,
      version: 1,
    });
    nextHeads[item.date] = created.id;
  }
  const recoveryResult = {
    customer_id: customer.id,
    object_id: object.id,
    warning_address_id: warningAddress.id,
    warning_address_version: expectedVersion + 1,
    changed_dates: normalizedItems.map(item => item.date),
    summary: `Specifieke bereikbaarheid van ${warningContactDisplayName(await requireRecord(base44, 'CustomerContact', warningAddress.contact_id, 'Contactpersoon'))} gewijzigd`,
    resource_type: 'WarningAddressAvailabilityOverride',
    resource_id: warningAddress.id,
    category: 'operations',
  };
  const recoveryPatch = await mutationRecoveryPatch(warningAddress, 'upsert_warning_availability_overrides', user, idempotencyKey, requestFingerprint, target, recoveryResult);
  const finalized = await casUpdate(base44, 'ObjectWarningAddress', warningAddress, expectedVersion, {
    availability_override_heads: nextHeads,
    availability_override_updated_at: nowIso(),
    ...recoveryPatch,
  });
  return { ...recoveryResult, warning_address_version: versionOf(finalized) };
}

async function handleDeleteWarningAvailabilityOverride(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const { customer, object, warningAddress } = await requireScopedWarningAddress(base44, body, true);
  const override = await requireRecord(
    base44,
    'WarningAddressAvailabilityOverride',
    requireString(body, 'override_id'),
    'Bereikbaarheidsuitzondering',
  );
  if (
    override.warning_address_id !== warningAddress.id ||
    override.customer_id !== customer.id ||
    override.object_id !== object.id
  ) throw new ApiError(409, 'Bereikbaarheidsuitzondering hoort niet bij dit waarschuwingsadres');
  const overrideExpectedVersion = requireInteger(body.override_expected_version, 'override_expected_version', 1);
  if (overrideExpectedVersion !== versionOf(override)) throw new ApiError(409, 'Bereikbaarheidsuitzondering is intussen gewijzigd');
  const date = requireString(body, 'date');
  const dates = [...new Set((Array.isArray(override.dates) ? override.dates : []).map(asString).filter(Boolean))];
  if (!dates.includes(date)) throw new ApiError(409, 'De gekozen datum staat niet meer in deze uitzondering');
  if (versionOf(warningAddress) !== expectedVersion) throw new ApiError(409, 'Het waarschuwingsadres is intussen gewijzigd');
  const recentScopedOverrides = await getEntity(base44, 'WarningAddressAvailabilityOverride').filter({
    warning_address_id: warningAddress.id,
    customer_id: customer.id,
    object_id: object.id,
  }, '-updated_date', 2000);
  const scopedOverrides = await hydrateWarningAvailabilityOverrideHeads(base44, recentScopedOverrides, [warningAddress]);
  const current = effectiveWarningAvailabilityOverrides(scopedOverrides, [warningAddress])
    .find(record => record.dates?.[0] === date);
  if (!current || current.id !== override.id) throw new ApiError(409, 'De gekozen bereikbaarheidsuitzondering is intussen vervangen');
  const nextHeads = warningAddress.availability_override_heads && typeof warningAddress.availability_override_heads === 'object' && !Array.isArray(warningAddress.availability_override_heads)
    ? { ...warningAddress.availability_override_heads }
    : {};
  const creationKey = `${idempotencyKey}:${date}:deleted`;
  const payload = {
    warning_address_id: warningAddress.id,
    customer_id: customer.id,
    object_id: object.id,
    date,
    availability_periods: [],
    reason: 'Verwijderd via objectkaart',
    record_status: 'deleted',
    supersedes_override_id: override.id,
  };
  const payloadFingerprint = await warningOverridePayloadFingerprint(payload);
  const tombstone = await warningOverrideCreationReplay(base44, scopedOverrides, creationKey);
  if (tombstone) {
    if (
      tombstone.warning_address_id !== warningAddress.id ||
      tombstone.customer_id !== customer.id ||
      tombstone.object_id !== object.id
    ) rejectIdempotencyReuse();
    assertWarningOverrideCreationBinding(tombstone, user, requestFingerprint, target, payloadFingerprint);
    nextHeads[date] = tombstone.id;
  } else {
    const created = await getEntity(base44, 'WarningAddressAvailabilityOverride').create({
      warning_address_id: warningAddress.id,
      customer_id: customer.id,
      object_id: object.id,
      dates: [date],
      availability_status: null,
      availability_periods: [],
      reason: 'Verwijderd via objectkaart',
      record_status: 'deleted',
      supersedes_override_id: override.id,
      created_by_user_id: user.id,
      created_by_name: asString(user.full_name || user.display_name || user.name || user.email) || 'Backofficegebruiker',
      creation_idempotency_key: creationKey,
      creation_request_fingerprint: requestFingerprint,
      creation_payload_fingerprint: payloadFingerprint,
      creation_actor_user_id: user.id,
      creation_mutation_target: target,
      version: 1,
    });
    nextHeads[date] = created.id;
  }
  const recoveryResult = {
    customer_id: customer.id,
    object_id: object.id,
    warning_address_id: warningAddress.id,
    override_id: override.id,
    changed_dates: [date],
    summary: `Specifieke bereikbaarheid op ${date} verwijderd`,
    resource_type: 'WarningAddressAvailabilityOverride',
    resource_id: override.id,
    category: 'operations',
  };
  const recoveryPatch = await mutationRecoveryPatch(warningAddress, 'delete_warning_availability_override', user, idempotencyKey, requestFingerprint, target, recoveryResult);
  await casUpdate(base44, 'ObjectWarningAddress', warningAddress, expectedVersion, {
    availability_override_heads: nextHeads,
    availability_override_updated_at: nowIso(),
    ...recoveryPatch,
  });
  return recoveryResult;
}

async function handleWarningAvailabilityMutation(
  base44: LooseRecord,
  user: LooseRecord,
  action: string,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const { object } = await requireCustomerObjectForMutation(base44, body);
  let reservation: LooseRecord | null = null;
  try {
    reservation = await reserveWarningAddressMutation(
      base44,
      user,
      object.id,
      action,
      idempotencyKey,
      requestFingerprint,
      target,
    );
    await assertWarningAddressMutation(base44, reservation);
    if (action === 'upsert_warning_availability_overrides') {
      return handleUpsertWarningAvailabilityOverrides(
        base44,
        user,
        body,
        expectedVersion,
        idempotencyKey,
        requestFingerprint,
        target,
      );
    }
    if (action === 'delete_warning_availability_override') {
      return handleDeleteWarningAvailabilityOverride(
        base44,
        user,
        body,
        expectedVersion,
        idempotencyKey,
        requestFingerprint,
        target,
      );
    }
    throw new ApiError(400, 'Onbekende bereikbaarheidswijziging');
  } finally {
    await releaseWarningAddressMutation(base44, reservation);
  }
}

async function deactivateWarningRoleIfUnused(base44: LooseRecord, warningAddress: LooseRecord) {
  if (!warningAddress.contact_role_id) return;
  const activeWithRole = (await getEntity(base44, 'ObjectWarningAddress').filter({
    customer_id: warningAddress.customer_id,
    object_id: warningAddress.object_id,
    contact_role_id: warningAddress.contact_role_id,
  }, '-updated_date', 50)).filter((item: LooseRecord) => item.id !== warningAddress.id && item.status === 'active');
  if (activeWithRole.length) return;
  const role = await getRecord(base44, 'CustomerContactRole', warningAddress.contact_role_id);
  if (role?.status === 'active') await casUpdateLatest(base44, 'CustomerContactRole', role.id, { status: 'inactive', valid_until: todayIso() });
}

async function handleDeleteObjectWarningAddress(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const { customer, object } = await requireCustomerObjectForMutation(base44, body);
  if (object.status === 'archived') throw new ApiError(409, 'Gearchiveerd object moet eerst worden hersteld');
  let reservation: LooseRecord | null = null;
  try {
    reservation = await reserveWarningAddressMutation(
      base44,
      user,
      object.id,
      'delete_object_warning_address',
      idempotencyKey,
      requestFingerprint,
      target,
    );
    const record = await requireRecord(base44, 'ObjectWarningAddress', requireString(body, 'warning_address_id'), 'Waarschuwingsadres');
    if (record.customer_id !== customer.id || record.object_id !== object.id) throw new ApiError(409, 'Waarschuwingsadres hoort niet bij dit object');
    if (record.status === 'archived') throw new ApiError(409, 'Waarschuwingsadres is al gearchiveerd');
    if (versionOf(record) !== expectedVersion) throw new ApiError(409, 'Waarschuwingsadres is intussen gewijzigd');
    const [coordinator, records, references] = await Promise.all([
      assertWarningAddressMutation(base44, reservation),
      getEntity(base44, 'ObjectWarningAddress').filter({ customer_id: customer.id, object_id: object.id }, '+call_order', 500),
      warningAddressReferenceData(base44, customer.id),
    ]);
    const currentOrder = warningAddressOrderIds(coordinator, records);
    const warningAddress = safeObjectWarningAddress(
      warningAddressProjectedOrderRecord(record, currentOrder),
      references.contactById.get(record.contact_id) || null,
      references.points,
    );
    const desiredOrder = currentOrder.filter(id => id !== record.id);
    const projected = { ...warningAddress, status: 'archived', version: expectedVersion + 1 };
    const recoveryResult = {
      warning_address: projected,
      warning_address_id: record.id,
      customer_id: customer.id,
      object_id: object.id,
      archived: true,
      warning_address_order_ids: desiredOrder,
      changes: [{ field: 'status', label: 'Status', before: warningStatusDisplay(warningAddress.status), after: 'Gearchiveerd' }],
      summary: `Waarschuwingsadres van ${warningAddress.display_name} verwijderd`,
      resource_type: 'ObjectWarningAddress',
      resource_id: record.id,
      category: 'operations',
    };
    const recoveryPatch = await mutationRecoveryPatch(record, 'delete_object_warning_address', user, idempotencyKey, requestFingerprint, target, recoveryResult);
    const archivedRecord = await casUpdate(base44, 'ObjectWarningAddress', record, expectedVersion, {
      status: 'archived',
      archived_at: nowIso(),
      archived_by_user_id: user.id,
      ...recoveryPatch,
    });
    const projection = await updateWarningAddressOrderUnderReservation(base44, reservation, desiredOrder);
    await deactivateWarningRoleIfUnused(base44, archivedRecord);
    return {
      ...recoveryResult,
      warning_address: { ...projected, version: versionOf(archivedRecord) },
      warning_address_order_version: projection.order_version,
    };
  } finally {
    await releaseWarningAddressMutation(base44, reservation);
  }
}

async function handleReorderObjectWarningAddresses(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const { customer, object } = await requireCustomerObjectForMutation(base44, body);
  const orderedIds = Array.isArray(body.ordered_ids) ? body.ordered_ids.map(asString).filter(Boolean) : [];
  if (object.status === 'archived') throw new ApiError(409, 'Gearchiveerd object moet eerst worden hersteld');
  if (!orderedIds.length || orderedIds.length > 500 || new Set(orderedIds).size !== orderedIds.length) throw new ApiError(400, 'ordered_ids bevat geen geldige unieke volgorde');
  const expectedOrderVersion = requireInteger(body.expected_order_version, 'expected_order_version');
  const expectedVersions = body.expected_versions && typeof body.expected_versions === 'object' && !Array.isArray(body.expected_versions)
    ? body.expected_versions as LooseRecord
    : {};
  let reservation: LooseRecord | null = null;
  try {
    reservation = await reserveWarningAddressMutation(
      base44,
      user,
      object.id,
      'reorder_object_warning_addresses',
      idempotencyKey,
      requestFingerprint,
      target,
    );
    const [coordinator, unfilteredRecords] = await Promise.all([
      assertWarningAddressMutation(base44, reservation),
      getEntity(base44, 'ObjectWarningAddress').filter({ customer_id: customer.id, object_id: object.id }, '+call_order', 500),
    ]);
    const records = unfilteredRecords.filter((record: LooseRecord) => record.status !== 'archived');
    if (records.length !== orderedIds.length || records.some((record: LooseRecord) => !orderedIds.includes(record.id))) {
      throw new ApiError(409, 'De lijst is intussen gewijzigd; vernieuw en probeer opnieuw');
    }
    records.forEach((record: LooseRecord) => {
      if (Number(expectedVersions[record.id]) !== versionOf(record)) {
        throw new ApiError(409, 'Een waarschuwingsadres is intussen gewijzigd');
      }
    });
    if (warningAddressOrderVersion(coordinator) !== expectedOrderVersion) {
      throw new ApiError(409, 'De belvolgorde is intussen gewijzigd; vernieuw en probeer opnieuw');
    }
    const persistedIds = Array.isArray(coordinator.warning_address_order_ids)
      ? coordinator.warning_address_order_ids.map(asString).filter(Boolean)
      : [];
    const orderChanges = JSON.stringify(persistedIds) === JSON.stringify(orderedIds) ? 0 : 1;
    const recoveryResult = {
      customer_id: customer.id,
      object_id: object.id,
      ordered_ids: orderedIds,
      warning_address_order_ids: orderedIds,
      warning_address_order_version: expectedOrderVersion + orderChanges,
      summary: 'Belvolgorde waarschuwingsadressen gewijzigd',
      resource_type: 'SurveillanceObject',
      resource_id: object.id,
      category: 'operations',
    };
    const recoveryPatch = await warningAddressOrderRecoveryPatch(
      coordinator,
      user,
      idempotencyKey,
      requestFingerprint,
      target,
      recoveryResult,
    );
    const projection = await updateWarningAddressOrderUnderReservation(base44, reservation, orderedIds, {
      expected_order_version: expectedOrderVersion,
      patch: recoveryPatch,
    });
    return { ...recoveryResult, warning_address_order_version: projection.order_version };
  } finally {
    await releaseWarningAddressMutation(base44, reservation);
  }
}

function objectKeyMutationLockVersion(object: LooseRecord) {
  const value = Number(object.object_key_mutation_lock_version);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function objectKeyMutationLockVersionQuery(object: LooseRecord) {
  const value = object.object_key_mutation_lock_version;
  return Number.isInteger(value) && value >= 0
    ? { object_key_mutation_lock_version: value }
    : { $or: [
      { object_key_mutation_lock_version: null },
      { object_key_mutation_lock_version: { $exists: false } },
    ] };
}

async function reserveObjectKeyMutation(
  base44: LooseRecord,
  user: LooseRecord,
  objectId: string,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const ownerToken = crypto.randomUUID();
  const keyHash = await sha256(idempotencyKey);
  const reservedAt = nowIso();
  const lock = {
    owner_token: ownerToken,
    key_hash: keyHash,
    actor_id: user.id,
    request_fingerprint: requestFingerprint,
    mutation_target: target,
    reserved_at: reservedAt,
    expires_at: new Date(Date.parse(reservedAt) + OBJECT_KEY_MUTATION_LOCK_TTL_MS).toISOString(),
  };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const object = await requireRecord(base44, 'SurveillanceObject', objectId, 'Object');
    const current = object.object_key_mutation_lock;
    if (current && typeof current === 'object' && !Array.isArray(current) && reservationIsCurrent(current)) {
      const sameRequest = current.key_hash === keyHash
        && current.actor_id === user.id
        && current.request_fingerprint === requestFingerprint
        && current.mutation_target === target;
      throw new ApiError(409, sameRequest
        ? 'Deze sleutelwijziging is nog in verwerking; probeer opnieuw'
        : 'Een andere sleutelwijziging op dit object is nog in verwerking; probeer opnieuw', {
        retryable: true,
        reservation_expires_at: current.expires_at || null,
      });
    }
    const currentVersion = objectKeyMutationLockVersion(object);
    const hasPersistedVersion = Number.isInteger(object.object_key_mutation_lock_version)
      && object.object_key_mutation_lock_version >= 0;
    const update = hasPersistedVersion
      ? { $set: { object_key_mutation_lock: lock }, $inc: { object_key_mutation_lock_version: 1 } }
      : { $set: { object_key_mutation_lock: lock, object_key_mutation_lock_version: 1 } };
    const result = await getEntity(base44, 'SurveillanceObject').updateMany(
      { id: object.id, ...objectKeyMutationLockVersionQuery(object) },
      update,
    );
    if (result?.success && result.updated === 1) {
      return { object_id: object.id, owner_token: ownerToken, lock_version: currentVersion + 1 };
    }
  }
  throw new ApiError(409, 'Sleutelwijziging kon niet veilig worden gereserveerd; probeer opnieuw', { retryable: true });
}

async function releaseObjectKeyMutation(base44: LooseRecord, reservation: LooseRecord | null) {
  if (!reservation) return;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const object = await getRecord(base44, 'SurveillanceObject', reservation.object_id);
    if (!object || object.object_key_mutation_lock?.owner_token !== reservation.owner_token) return;
    const currentVersion = objectKeyMutationLockVersion(object);
    if (currentVersion !== reservation.lock_version) return;
    const result = await getEntity(base44, 'SurveillanceObject').updateMany(
      { id: object.id, object_key_mutation_lock_version: currentVersion },
      {
        $set: { object_key_mutation_lock: null },
        $inc: { object_key_mutation_lock_version: 1 },
      },
    );
    if (result?.success && result.updated === 1) return;
  }
  throw new ApiError(409, 'Sleutelwijzigingsslot kon niet veilig worden vrijgegeven; probeer opnieuw', { retryable: true });
}

function objectKeyCreationBindingMatches(
  record: LooseRecord,
  user: LooseRecord,
  requestFingerprint: string,
  target: string,
) {
  return record.creation_request_fingerprint === requestFingerprint
    && record.creation_actor_user_id === user.id
    && record.creation_mutation_target === target;
}

function normalizeObjectKeyNumber(value: unknown) {
  return asString(value).normalize('NFKC').toLocaleUpperCase('nl-NL').replace(/\s+/g, ' ').trim();
}

function safeObjectKey(record: LooseRecord, assignment: LooseRecord, options: LooseRecord = {}) {
  return {
    id: record.id,
    customer_id: assignment.customer_id,
    object_id: assignment.object_id,
    key_type: record.key_type,
    brand: record.brand,
    serial_number: record.serial_number || null,
    status: record.status || 'in_storage',
    version: versionOf(record),
    assignment_id: assignment.id,
    assignment_version: versionOf(assignment),
    key_set_id: assignment.key_set_id,
    created_date: record.created_date || null,
    updated_date: record.updated_date || null,
    read_only: options.read_only === true,
    integrity_notice: options.integrity_notice || null,
  };
}

function safeObjectKeySet(record: LooseRecord, keys: LooseRecord[]) {
  return {
    id: record.id,
    customer_id: record.customer_id,
    object_id: record.object_id,
    set_number: Number(record.set_number),
    display_label: record.display_label,
    key_number: record.key_number,
    version: versionOf(record),
    keys,
  };
}

async function objectKeySetForMutation(
  base44: LooseRecord,
  user: LooseRecord,
  customerId: string,
  objectId: string,
  body: LooseRecord,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const replay = await getEntity(base44, 'ObjectKeySet').filter({ creation_idempotency_key: `${idempotencyKey}:set` }, '-created_date', 2);
  if (replay.length > 1) throw new ApiError(409, 'Sleutelset-idempotency is niet eenduidig; handmatige controle vereist');
  if (replay.length) {
    const set = replay[0];
    if (
      set.customer_id !== customerId || set.object_id !== objectId || set.status === 'archived' ||
      !objectKeyCreationBindingMatches(set, user, requestFingerprint, target)
    ) rejectIdempotencyReuse();
    return { set, created: false };
  }
  const requestedSetId = asString(body.key_set_id);
  if (requestedSetId) {
    const set = await requireRecord(base44, 'ObjectKeySet', requestedSetId, 'Sleutelset');
    if (set.customer_id !== customerId || set.object_id !== objectId || set.status === 'archived') {
      throw new ApiError(409, 'Sleutelset hoort niet bij dit object');
    }
    return { set, created: false };
  }
  const keyNumber = objectText(body.set_key_number, 'Sleutelnummer', 80, false);
  const normalized = normalizeObjectKeyNumber(keyNumber);
  const existingSets = await getEntity(base44, 'ObjectKeySet').filter({ customer_id: customerId, object_id: objectId }, '-set_number', 500);
  const nextNumber = existingSets.reduce((highest: number, record: LooseRecord) => Math.max(highest, Number(record.set_number) || 0), 0) + 1;
  const set = await getEntity(base44, 'ObjectKeySet').create({
    customer_id: customerId,
    object_id: objectId,
    set_number: nextNumber,
    display_label: `Sleutelset ${nextNumber}`,
    key_number: keyNumber,
    key_number_normalized: normalized,
    status: 'active',
    creation_idempotency_key: `${idempotencyKey}:set`,
    creation_request_fingerprint: requestFingerprint,
    creation_actor_user_id: user.id,
    creation_mutation_target: target,
    version: 1,
  });
  return { set, created: true };
}

function normalizedObjectKeyData(data: LooseRecord) {
  const keyType = asString(data.key_type);
  if (!OBJECT_KEY_TYPES.has(keyType)) throw new ApiError(400, 'Kies een geldig sleuteltype');
  const brand = objectText(data.brand, 'Merk', 120, false);
  const serialNumber = objectText(data.serial_number, 'Serie-, pas- of tagnummer', 160, true);
  const status = asString(data.status) || 'in_storage';
  if (!OBJECT_KEY_STATUSES.has(status)) throw new ApiError(400, 'Kies een geldige sleutelstatus');
  return { key_type: keyType, brand, serial_number: serialNumber, status };
}

async function handleListObjectKeys(base44: LooseRecord, body: LooseRecord) {
  const { customer, object } = await requireCustomerObjectScope(base44, body);
  const [sets, assignments] = await Promise.all([
    getEntity(base44, 'ObjectKeySet').filter({ customer_id: customer.id, object_id: object.id }, '+set_number', 500),
    getEntity(base44, 'ObjectKeyAssignment').filter({ customer_id: customer.id, object_id: object.id }, '-created_date', 1000),
  ]);
  const activeAssignments = assignments.filter((assignment: LooseRecord) => assignment.status !== 'archived');
  const keys = await Promise.all(activeAssignments.map((assignment: LooseRecord) => getRecord(base44, 'ObjectKey', assignment.key_id)));
  const keyById = new Map(keys.filter(Boolean).map((record: LooseRecord) => [record.id, record]));
  const integrityIssues: LooseRecord[] = [];
  const safeSets = sets
    .filter((set: LooseRecord) => set.status !== 'archived')
    .map((set: LooseRecord) => safeObjectKeySet(set, activeAssignments
      .filter((assignment: LooseRecord) => assignment.key_set_id === set.id)
      .flatMap((assignment: LooseRecord) => {
        const key = keyById.get(assignment.key_id);
        if (!key) {
          integrityIssues.push({ assignment_id: assignment.id, reason: 'missing_key', message: 'Een sleutelkoppeling verwijst naar een ontbrekend sleutelrecord.' });
          return [];
        }
        if (key.owner_customer_id && key.owner_customer_id !== customer.id) {
          integrityIssues.push({ assignment_id: assignment.id, reason: 'customer_mismatch', message: 'Een oudere sleutelkoppeling heeft een conflicterende klantgrens en is geblokkeerd.' });
          return [];
        }
        const legacyOwner = !key.owner_customer_id;
        if (legacyOwner) integrityIssues.push({ assignment_id: assignment.id, reason: 'legacy_owner_missing', message: 'Een oudere sleutel heeft nog geen eenduidige klanteigenaar en is daarom alleen-lezen.' });
        return [safeObjectKey(key, assignment, legacyOwner ? { read_only: true, integrity_notice: 'Oud sleutelrecord zonder eenduidige klanteigenaar' } : {})];
      })));
  return {
    sets: safeSets,
    brands: [...new Set(safeSets.flatMap((set: LooseRecord) => set.keys.map((key: LooseRecord) => asString(key.brand))).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'nl')),
    integrity_issues: integrityIssues,
  };
}

async function requireScopedObjectKeyAssignment(base44: LooseRecord, body: LooseRecord) {
  const { customer, object } = await requireCustomerObjectForMutation(base44, body);
  const assignment = await requireRecord(base44, 'ObjectKeyAssignment', requireString(body, 'key_assignment_id'), 'Sleutelkoppeling');
  if (assignment.customer_id !== customer.id || assignment.object_id !== object.id || assignment.status === 'archived') {
    throw new ApiError(409, 'Sleutelkoppeling hoort niet bij dit object');
  }
  const key = await requireRecord(base44, 'ObjectKey', assignment.key_id, 'Sleutel');
  if (asString(body.key_id) && body.key_id !== key.id) throw new ApiError(409, 'Sleutel en koppeling horen niet bij elkaar');
  if (key.owner_customer_id !== customer.id) throw new ApiError(409, 'Dit oudere sleutelrecord heeft geen eenduidige klanteigenaar en kan niet veilig worden gewijzigd');
  const linkedAssignments = (await getEntity(base44, 'ObjectKeyAssignment').filter({ key_id: key.id }, '-created_date', 500))
    .filter((record: LooseRecord) => record.status !== 'archived');
  if (linkedAssignments.some((record: LooseRecord) => record.id !== assignment.id)) {
    throw new ApiError(409, 'Deze oudere sleutel is aan meerdere objecten gekoppeld en kan hier niet veilig worden gewijzigd');
  }
  return { customer, object, assignment, key };
}

async function handleCreateObjectKey(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const { customer, object } = await requireCustomerObjectForMutation(base44, body);
  if (object.status === 'archived') throw new ApiError(409, 'Gearchiveerd object moet eerst worden hersteld');
  if (expectedVersion !== 0) throw new ApiError(409, 'Nieuwe sleutel verwacht expected_version 0');
  const data = requireObject(body);
  const normalized = normalizedObjectKeyData(data);
  const replay = await getEntity(base44, 'ObjectKeyAssignment').filter({ creation_idempotency_key: `${idempotencyKey}:assignment` }, '-created_date', 2);
  if (replay.length > 1) throw new ApiError(409, 'Sleutel-idempotency is niet eenduidig; handmatige controle vereist');
  if (replay.length) {
    const assignment = replay[0];
    if (
      assignment.customer_id !== customer.id || assignment.object_id !== object.id || assignment.status !== 'active' ||
      !objectKeyCreationBindingMatches(assignment, user, requestFingerprint, target)
    ) rejectIdempotencyReuse();
    const key = await requireRecord(base44, 'ObjectKey', assignment.key_id, 'Sleutel');
    const set = await requireRecord(base44, 'ObjectKeySet', assignment.key_set_id, 'Sleutelset');
    const requestedSetId = asString(data.key_set_id);
    const setChoiceMatches = requestedSetId
      ? set.id === requestedSetId
      : set.creation_idempotency_key === `${idempotencyKey}:set`
        && set.key_number_normalized === normalizeObjectKeyNumber(data.set_key_number);
    if (
      key.owner_customer_id !== customer.id || key.creation_idempotency_key !== `${idempotencyKey}:key` ||
      key.creation_key_set_id !== set.id ||
      JSON.stringify(normalizedObjectKeyData(key)) !== JSON.stringify(normalized) ||
      !objectKeyCreationBindingMatches(key, user, requestFingerprint, target) ||
      set.customer_id !== customer.id || set.object_id !== object.id || set.status === 'archived' ||
      !setChoiceMatches ||
      (!requestedSetId && !objectKeyCreationBindingMatches(set, user, requestFingerprint, target))
    ) rejectIdempotencyReuse();
    return { customer_id: customer.id, object_id: object.id, key: safeObjectKey(key, assignment), key_set: safeObjectKeySet(set, [safeObjectKey(key, assignment)]), replayed: true, summary: 'Sleutel toegevoegd', resource_type: 'ObjectKey', resource_id: key.id, category: 'operations' };
  }
  const { set } = await objectKeySetForMutation(base44, user, customer.id, object.id, data, idempotencyKey, requestFingerprint, target);
  const keyMatches = await getEntity(base44, 'ObjectKey').filter({ creation_idempotency_key: `${idempotencyKey}:key` }, '-created_date', 5);
  if (keyMatches.length > 1) throw new ApiError(409, 'Sleutel-idempotency is niet eenduidig; handmatige controle vereist');
  let key = keyMatches[0] || null;
  if (key) {
    if (
      key.owner_customer_id !== customer.id || key.creation_key_set_id !== set.id ||
      JSON.stringify(normalizedObjectKeyData(key)) !== JSON.stringify(normalized) ||
      !objectKeyCreationBindingMatches(key, user, requestFingerprint, target)
    ) rejectIdempotencyReuse();
  } else {
    key = await getEntity(base44, 'ObjectKey').create({
      owner_customer_id: customer.id,
      ...normalized,
      creation_idempotency_key: `${idempotencyKey}:key`,
      creation_request_fingerprint: requestFingerprint,
      creation_actor_user_id: user.id,
      creation_mutation_target: target,
      creation_key_set_id: set.id,
      version: 1,
    });
  }
  const assignmentMatches = await getEntity(base44, 'ObjectKeyAssignment').filter({ creation_idempotency_key: `${idempotencyKey}:assignment` }, '-created_date', 5);
  if (assignmentMatches.length > 1) throw new ApiError(409, 'Sleutelkoppeling-idempotency is niet eenduidig; handmatige controle vereist');
  let assignment = assignmentMatches[0] || null;
  if (assignment) {
    if (
      assignment.customer_id !== customer.id || assignment.object_id !== object.id ||
      assignment.key_id !== key.id || assignment.key_set_id !== set.id || assignment.status !== 'active' ||
      !objectKeyCreationBindingMatches(assignment, user, requestFingerprint, target)
    ) rejectIdempotencyReuse();
  } else {
    assignment = await getEntity(base44, 'ObjectKeyAssignment').create({
      customer_id: customer.id,
      object_id: object.id,
      key_id: key.id,
      key_set_id: set.id,
      status: 'active',
      creation_idempotency_key: `${idempotencyKey}:assignment`,
      creation_request_fingerprint: requestFingerprint,
      creation_actor_user_id: user.id,
      creation_mutation_target: target,
      version: 1,
    });
  }
  const safeKey = safeObjectKey(key, assignment);
  return { customer_id: customer.id, object_id: object.id, key: safeKey, key_set: safeObjectKeySet(set, [safeKey]), summary: `Sleutel ${safeKey.serial_number || safeKey.brand} toegevoegd`, resource_type: 'ObjectKey', resource_id: key.id, category: 'operations' };
}

async function handleUpdateObjectKey(
  base44: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
  user: LooseRecord,
  requestFingerprint: string,
  target: string,
) {
  const { customer, object, assignment, key } = await requireScopedObjectKeyAssignment(base44, body);
  if (object.status === 'archived') throw new ApiError(409, 'Gearchiveerd object moet eerst worden hersteld');
  const data = requireObject(body);
  const normalized = normalizedObjectKeyData(data);
  const assignmentExpectedVersion = requireInteger(body.assignment_expected_version, 'assignment_expected_version', 1);
  if (assignmentExpectedVersion !== versionOf(assignment)) throw new ApiError(409, 'Sleutelkoppeling is intussen gewijzigd');
  if (asString(data.key_set_id) !== assignment.key_set_id || data.create_new_set === true) {
    throw new ApiError(409, 'Een bestaande sleutel kan niet stil naar een andere set worden verplaatst; archiveer en registreer de fysieke koppeling opnieuw');
  }
  const set = await requireRecord(base44, 'ObjectKeySet', assignment.key_set_id, 'Sleutelset');
  if (set.customer_id !== customer.id || set.object_id !== object.id || set.status === 'archived') throw new ApiError(409, 'Sleutelset hoort niet bij dit object');
  const before = safeObjectKey(key, assignment);
  const projected = safeObjectKey({ ...key, ...normalized, version: expectedVersion + 1 }, assignment);
  const labels: Record<string, string> = { key_type: 'Sleuteltype', brand: 'Merk', serial_number: 'Serie-, pas- of tagnummer', status: 'Status' };
  const changes = Object.entries(labels).flatMap(([field, label]) => canonicalMutationValue(before[field]) === canonicalMutationValue(projected[field]) ? [] : [{ field, label, before: before[field] || null, after: projected[field] || null }]);
  if (!changes.length) return { customer_id: customer.id, object_id: object.id, key: before, key_set: safeObjectKeySet(set, [before]), unchanged: true, summary: 'Sleutel opgeslagen', resource_type: 'ObjectKey', resource_id: key.id, category: 'operations' };
  const recoveryResult = { customer_id: customer.id, object_id: object.id, key: projected, key_set: safeObjectKeySet(set, [projected]), changes, summary: `Sleutel ${projected.serial_number || projected.brand} gewijzigd`, resource_type: 'ObjectKey', resource_id: key.id, category: 'operations' };
  const recoveryPatch = await mutationRecoveryPatch(key, 'update_object_key', user, idempotencyKey, requestFingerprint, target, recoveryResult);
  const updatedKey = await casUpdate(base44, 'ObjectKey', key, expectedVersion, { ...normalized, ...recoveryPatch });
  return { ...recoveryResult, key: safeObjectKey(updatedKey, assignment) };
}

async function handleArchiveObjectKey(
  base44: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  user: LooseRecord,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const { customer, object, assignment, key } = await requireScopedObjectKeyAssignment(base44, body);
  if (object.status === 'archived') throw new ApiError(409, 'Gearchiveerd object moet eerst worden hersteld');
  const safeKey = safeObjectKey(key, { ...assignment, status: 'archived', version: expectedVersion + 1 });
  const recoveryResult = { customer_id: customer.id, object_id: object.id, key: safeKey, archived: true, changes: [{ field: 'status', label: 'Objectkoppeling', before: 'Actief', after: 'Gearchiveerd' }], summary: `Sleutel ${safeKey.serial_number || safeKey.brand} verwijderd`, resource_type: 'ObjectKey', resource_id: key.id, category: 'operations' };
  const recoveryPatch = await mutationRecoveryPatch(assignment, 'archive_object_key', user, idempotencyKey, requestFingerprint, target, recoveryResult);
  await casUpdate(base44, 'ObjectKeyAssignment', assignment, expectedVersion, {
    status: 'archived',
    archived_at: nowIso(),
    archived_by_user_id: user.id,
    ...recoveryPatch,
  });
  return recoveryResult;
}

async function handleObjectKeyMutation(
  base44: LooseRecord,
  user: LooseRecord,
  action: string,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const { object } = await requireCustomerObjectForMutation(base44, body);
  const reservation = await reserveObjectKeyMutation(
    base44,
    user,
    object.id,
    idempotencyKey,
    requestFingerprint,
    target,
  );
  try {
    if (action === 'create_object_key') {
      return await handleCreateObjectKey(base44, user, body, expectedVersion, idempotencyKey, requestFingerprint, target);
    }
    if (action === 'update_object_key') {
      return await handleUpdateObjectKey(base44, body, expectedVersion, idempotencyKey, user, requestFingerprint, target);
    }
    if (action === 'archive_object_key') {
      return await handleArchiveObjectKey(base44, body, expectedVersion, user, idempotencyKey, requestFingerprint, target);
    }
    throw new ApiError(400, 'Onbekende sleutelmutatie');
  } finally {
    await releaseObjectKeyMutation(base44, reservation);
  }
}

const INSTALLATION_CREDENTIAL_TYPES_BY_INSTALLATION: Record<string, Set<string>> = {
  alarm_system: new Set(['switching_code', 'reset_code']),
  fire_alarm_system: new Set(['operator_code', 'reset_code', 'service_code']),
  evacuation_alarm: new Set(['operator_code', 'service_code']),
  camera_system: new Set(['service_code']),
  access_control: new Set(['service_code']),
  intercom: new Set(['service_code']),
  other: new Set(['switching_code', 'reset_code', 'operator_code', 'service_code']),
};
const INSTALLATION_CREDENTIAL_LABELS: Record<string, string> = {
  switching_code: 'Schakelcode',
  reset_code: 'Resetcode',
  operator_code: 'Bediencode',
  service_code: 'Servicecode',
};
const installationCredentialTypeLabel = (type: string) => INSTALLATION_CREDENTIAL_LABELS[type] || 'Beveiligde code';

function installationDate(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = asString(value);
  if (!ISO_DATE_PATTERN.test(normalized) || dateOnly(normalized) !== normalized) throw new ApiError(400, `${field} bevat geen geldige datum`);
  return normalized;
}

function normalizedInstallationData(data: LooseRecord) {
  const installationType = asString(data.installation_type);
  if (!OBJECT_INSTALLATION_TYPES.has(installationType)) throw new ApiError(400, 'Kies een geldig installatietype');
  const customType = objectText(data.custom_type, 'Ander installatietype', 120, true);
  if (installationType === 'other' && !customType) throw new ApiError(400, 'Omschrijf het andere installatietype');
  const monitoringConnected = data.monitoring_connected === true;
  const monitoringProviderName = objectText(data.monitoring_provider_name, 'Meldkamer of provider', 160, true);
  if (monitoringConnected && !monitoringProviderName) throw new ApiError(400, 'Vul de meldkamer of monitoringprovider in');
  const installerPhone = objectText(data.installer_phone, 'Telefoon onderhoudspartij', 40, true);
  if (installerPhone) {
    const normalizedPhone = normalizePhone(installerPhone);
    if (!/^\+?\d{7,15}$/.test(normalizedPhone)) throw new ApiError(400, 'Vul een geldig telefoonnummer voor de onderhoudspartij in');
  }
  const lifecycleStatus = asString(data.lifecycle_status) || 'active';
  if (!OBJECT_INSTALLATION_LIFECYCLES.has(lifecycleStatus) || lifecycleStatus === 'archived') throw new ApiError(400, 'Kies een geldige levenscyclusstatus');
  const operationalStatus = asString(data.operational_status) || 'unknown';
  if (!OBJECT_INSTALLATION_OPERATIONAL_STATUSES.has(operationalStatus)) throw new ApiError(400, 'Kies een geldige operationele toestand');
  const controlPanelLocation = objectText(data.control_panel_location ?? data.location, 'Locatie centrale of paneel', 240, true);
  const commissionedOn = installationDate(data.commissioned_on, 'Inbedrijfstellingsdatum');
  const lastTestedOn = installationDate(data.last_tested_on, 'Laatste testdatum');
  const nextMaintenanceOn = installationDate(data.next_maintenance_on, 'Volgende onderhoudsdatum');
  if (commissionedOn && lastTestedOn && lastTestedOn < commissionedOn) {
    throw new ApiError(400, 'De laatste testdatum kan niet vóór de inbedrijfstellingsdatum liggen');
  }
  if (commissionedOn && nextMaintenanceOn && nextMaintenanceOn < commissionedOn) {
    throw new ApiError(400, 'De onderhoudsdatum kan niet vóór de inbedrijfstellingsdatum liggen');
  }
  if (lastTestedOn && nextMaintenanceOn && nextMaintenanceOn < lastTestedOn) {
    throw new ApiError(400, 'De onderhoudsdatum kan niet vóór de laatste testdatum liggen');
  }
  return {
    installation_type: installationType,
    custom_type: installationType === 'other' ? customType : null,
    name: objectText(data.name, 'Installatienaam', 160, false),
    brand: objectText(data.brand, 'Merk', 120, true),
    model: objectText(data.model, 'Model', 120, true),
    serial_number: objectText(data.serial_number, 'Serienummer', 160, true),
    external_reference: objectText(data.external_reference, 'Externe referentie', 160, true),
    location: controlPanelLocation,
    control_panel_location: controlPanelLocation,
    monitoring_connected: monitoringConnected,
    monitoring_provider_name: monitoringConnected ? monitoringProviderName : null,
    monitoring_connection_reference: monitoringConnected ? objectText(data.monitoring_connection_reference, 'Aansluitreferentie', 160, true) : null,
    installer_name: objectText(data.installer_name, 'Installateur of onderhoudspartij', 160, true),
    installer_phone: installerPhone,
    commissioned_on: commissionedOn,
    last_tested_on: lastTestedOn,
    next_maintenance_on: nextMaintenanceOn,
    lifecycle_status: lifecycleStatus,
    operational_status: operationalStatus,
    status: lifecycleStatus,
  };
}

function normalizedInstallationCredentials(data: LooseRecord, installationType: string) {
  const credentials = data.credentials && typeof data.credentials === 'object' && !Array.isArray(data.credentials)
    ? data.credentials as LooseRecord
    : {};
  const allowed = INSTALLATION_CREDENTIAL_TYPES_BY_INSTALLATION[installationType] || new Set<string>();
  return Object.entries(credentials).flatMap(([credentialType, rawValue]) => {
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!value) return [];
    if (!allowed.has(credentialType)) throw new ApiError(400, `Code ${credentialType} past niet bij dit installatietype`);
    if (value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) throw new ApiError(400, 'Een installatiecode bevat ongeldige tekens of is te lang');
    return [{ credential_type: credentialType, value }];
  });
}

function normalizedInstallationCredentialRevocations(data: LooseRecord) {
  if (data.credentials_to_revoke === undefined || data.credentials_to_revoke === null) return [] as string[];
  if (!Array.isArray(data.credentials_to_revoke)) throw new ApiError(400, 'In te trekken installatiecodes hebben een ongeldig formaat');
  const knownTypes = new Set(Object.keys(INSTALLATION_CREDENTIAL_LABELS));
  const revocations = [...new Set(data.credentials_to_revoke.map(asString).filter(Boolean))];
  if (revocations.length > knownTypes.size || revocations.some(type => !knownTypes.has(type))) {
    throw new ApiError(400, 'Een in te trekken installatiecode is onbekend');
  }
  return revocations;
}

function legacyInstallationLifecycle(record: LooseRecord) {
  const explicit = asString(record.lifecycle_status);
  if (OBJECT_INSTALLATION_LIFECYCLES.has(explicit)) return explicit;
  return record.status === 'inactive' ? 'inactive' : record.status === 'archived' ? 'archived' : 'active';
}

function legacyInstallationOperationalStatus(record: LooseRecord) {
  const explicit = asString(record.operational_status);
  if (OBJECT_INSTALLATION_OPERATIONAL_STATUSES.has(explicit)) return explicit;
  return record.status === 'maintenance' ? 'maintenance' : 'unknown';
}

function safeObjectInstallation(record: LooseRecord, credentialTypes?: string[]) {
  const safeCredentialTypes = credentialTypes || (Array.isArray(record.credential_types)
    ? record.credential_types.map(asString).filter(Boolean)
    : []);
  return {
    id: record.id,
    customer_id: record.customer_id,
    object_id: record.object_id,
    installation_type: record.installation_type,
    custom_type: record.custom_type || null,
    name: record.name,
    brand: record.brand || null,
    model: record.model || null,
    serial_number: record.serial_number || null,
    external_reference: record.external_reference || null,
    control_panel_location: record.control_panel_location || record.location || null,
    monitoring_connected: record.monitoring_connected === true,
    monitoring_provider_name: record.monitoring_provider_name || null,
    monitoring_connection_reference: record.monitoring_connection_reference || null,
    installer_name: record.installer_name || null,
    installer_phone: record.installer_phone || null,
    commissioned_on: record.commissioned_on || null,
    last_tested_on: record.last_tested_on || null,
    next_maintenance_on: record.next_maintenance_on || null,
    lifecycle_status: legacyInstallationLifecycle(record),
    operational_status: legacyInstallationOperationalStatus(record),
    credential_types: [...new Set(safeCredentialTypes)].sort(),
    has_credentials: safeCredentialTypes.length > 0,
    version: versionOf(record),
    created_date: record.created_date || null,
    updated_date: record.updated_date || null,
  };
}

function installationCredentialContext(installation: LooseRecord, credentialType = 'bundle') {
  return `${installation.customer_id}|${installation.object_id}|${installation.id}|${credentialType}`;
}

function safeCredentialValues(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as Record<string, string>;
  return Object.fromEntries(Object.entries(value as LooseRecord).flatMap(([credentialType, rawValue]) => {
    const normalized = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!normalized || !['switching_code', 'reset_code', 'operator_code', 'service_code'].includes(credentialType)) return [];
    return [[credentialType, normalized]];
  })) as Record<string, string>;
}

async function installationCredentialState(base44: LooseRecord, installation: LooseRecord) {
  const pointerId = asString(installation.active_credential_id);
  if (pointerId) {
    const bundle = await requireRecord(base44, 'ObjectInstallationCredential', pointerId, 'Installatiecredential');
    if (
      bundle.customer_id !== installation.customer_id ||
      bundle.object_id !== installation.object_id ||
      bundle.installation_id !== installation.id ||
      bundle.credential_type !== 'bundle'
    ) throw new ApiError(409, 'De installatiecredential hoort niet bij deze installatie');
    const decrypted = await decryptInstallationCredential(bundle, installationCredentialContext(installation));
    let parsed: unknown;
    try {
      parsed = JSON.parse(decrypted);
    } catch {
      throw new ApiError(409, 'De installatiecredential heeft een ongeldig formaat; handmatige controle vereist');
    }
    const values = safeCredentialValues(parsed);
    return { values, types: Object.keys(values).sort(), bundle };
  }

  if (Number(installation.credential_storage_version) >= 1) {
    return { values: {} as Record<string, string>, types: [] as string[], bundle: null };
  }

  const legacy = await getEntity(base44, 'ObjectInstallationCredential').filter({
    customer_id: installation.customer_id,
    object_id: installation.object_id,
    installation_id: installation.id,
    status: 'active',
  }, '-created_date', 250);
  const values: Record<string, string> = {};
  for (const record of legacy) {
    const credentialType = asString(record.credential_type);
    if (credentialType === 'bundle' || values[credentialType]) continue;
    if (!['switching_code', 'reset_code', 'operator_code', 'service_code'].includes(credentialType)) continue;
    values[credentialType] = await decryptInstallationCredential(
      record,
      installationCredentialContext(installation, credentialType),
    );
  }
  return { values, types: Object.keys(values).sort(), bundle: null };
}

async function installationCredentialTypes(base44: LooseRecord, installations: LooseRecord[]) {
  const result = new Map<string, string[]>();
  const legacyInstallations = installations.filter((installation: LooseRecord) => {
    const snapshot = Array.isArray(installation.credential_types)
      ? installation.credential_types.map(asString).filter(Boolean)
      : [];
    if (Number(installation.credential_storage_version) >= 1 || snapshot.length || installation.active_credential_id) {
      result.set(installation.id, snapshot);
      return false;
    }
    return true;
  });
  if (!legacyInstallations.length) return result;
  const byScope = new Map<string, LooseRecord[]>();
  for (const installation of legacyInstallations) {
    const scope = `${installation.customer_id}|${installation.object_id}`;
    byScope.set(scope, [...(byScope.get(scope) || []), installation]);
  }
  for (const scopedInstallations of byScope.values()) {
    const sample = scopedInstallations[0];
    const allowedIds = new Set(scopedInstallations.map(record => record.id));
    const legacy = await getEntity(base44, 'ObjectInstallationCredential').filter({
      customer_id: sample.customer_id,
      object_id: sample.object_id,
      status: 'active',
    }, '-created_date', 2000);
    for (const record of legacy) {
      if (!allowedIds.has(record.installation_id) || record.credential_type === 'bundle') continue;
      result.set(record.installation_id, [...new Set([...(result.get(record.installation_id) || []), asString(record.credential_type)])]);
    }
  }
  return result;
}

async function createInstallationCredentialBundle(
  base44: LooseRecord,
  user: LooseRecord,
  installation: LooseRecord,
  values: Record<string, string>,
  idempotencyKey: string,
) {
  const credentialTypes = Object.keys(values).sort();
  if (!credentialTypes.length) return null;
  const creationKey = `${idempotencyKey}:credential-bundle`;
  const matches = await getEntity(base44, 'ObjectInstallationCredential').filter({
    installation_id: installation.id,
    creation_idempotency_key: creationKey,
  }, '-created_date', 5);
  if (matches.length) {
    const bundle = matches[0];
    if (
      bundle.customer_id !== installation.customer_id ||
      bundle.object_id !== installation.object_id ||
      bundle.credential_type !== 'bundle'
    ) rejectIdempotencyReuse();
    return bundle;
  }
  const serialized = JSON.stringify(Object.fromEntries(credentialTypes.map(type => [type, values[type]])));
  const encrypted = await encryptInstallationCredential(serialized, installationCredentialContext(installation));
  return getEntity(base44, 'ObjectInstallationCredential').create({
    customer_id: installation.customer_id,
    object_id: installation.object_id,
    installation_id: installation.id,
    credential_type: 'bundle',
    credential_types: credentialTypes,
    ...encrypted,
    status: 'stored',
    superseded_by_id: null,
    created_by_user_id: user.id,
    creation_idempotency_key: creationKey,
    version: 1,
  });
}

async function reconcileInstallationCredentialRecords(base44: LooseRecord, installationId: string) {
  const installation = await getRecord(base44, 'ObjectInstallation', installationId);
  if (!installation) return;
  const activeCredentialId = asString(installation.active_credential_id);
  const records = await getEntity(base44, 'ObjectInstallationCredential').filter({ installation_id: installationId }, '-created_date', 500);
  for (const record of records) {
    const isBundle = record.credential_type === 'bundle';
    const shouldBeActive = isBundle && record.id === activeCredentialId;
    const shouldSupersedeLegacy = !isBundle && Number(installation.credential_storage_version) >= 1;
    const nextStatus = shouldBeActive ? 'active' : (isBundle || shouldSupersedeLegacy ? 'superseded' : asString(record.status));
    const nextSupersededById = shouldBeActive ? null : activeCredentialId || null;
    if (nextStatus === record.status && (record.superseded_by_id || null) === nextSupersededById) continue;
    try {
      await casUpdateLatest(base44, 'ObjectInstallationCredential', record.id, {
        status: nextStatus,
        superseded_by_id: nextSupersededById,
      });
    } catch (error) {
      if (!(error instanceof ApiError) || ![404, 409].includes(error.status)) throw error;
    }
  }
}

async function bestEffortReconcileInstallationCredentials(base44: LooseRecord, installationId: string) {
  try {
    await reconcileInstallationCredentialRecords(base44, installationId);
  } catch (error) {
    console.error('[customerPlatformApi] installatiecredential-reconciliatie mislukt', installationId, error);
  }
}

async function cleanupStaleInstallationCredentials(base44: LooseRecord, installations: LooseRecord[]) {
  if (!installations.length) return;
  const byId = new Map(installations.map((installation: LooseRecord) => [installation.id, installation]));
  const sample = installations[0];
  const records = await getEntity(base44, 'ObjectInstallationCredential').filter({
    customer_id: sample.customer_id,
    object_id: sample.object_id,
    status: 'superseded',
  }, '+updated_date', 2000);
  const cutoff = Date.now() - INSTALLATION_CREDENTIAL_CLEANUP_GRACE_MS;
  for (const record of records) {
    if (!byId.has(record.installation_id)) continue;
    const lastChangedAt = Date.parse(asString(record.updated_date || record.created_date));
    if (!Number.isFinite(lastChangedAt) || lastChangedAt > cutoff) continue;
    const [installation, credential] = await Promise.all([
      getRecord(base44, 'ObjectInstallation', record.installation_id),
      getRecord(base44, 'ObjectInstallationCredential', record.id),
    ]);
    if (!installation || !credential || credential.status !== 'superseded') continue;
    if (asString(installation.active_credential_id) === credential.id) {
      await bestEffortReconcileInstallationCredentials(base44, installation.id);
      continue;
    }
    await getEntity(base44, 'ObjectInstallationCredential').delete(credential.id);
  }
}

async function bestEffortCleanupStaleInstallationCredentials(base44: LooseRecord, installations: LooseRecord[]) {
  try {
    await cleanupStaleInstallationCredentials(base44, installations);
  } catch (error) {
    console.error('[customerPlatformApi] opruimen van verweesde installatiecredentials mislukt', error);
  }
}

async function mutationRecoveryPatch(
  record: LooseRecord,
  action: string,
  user: LooseRecord,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
  result: LooseRecord,
) {
  const keyHash = await sha256(idempotencyKey);
  const priorRecoveries = record.customer_platform_mutation_recoveries;
  const recoveryLog = priorRecoveries && typeof priorRecoveries === 'object' && !Array.isArray(priorRecoveries)
    ? priorRecoveries
    : {};
  const priorHashes = Array.isArray(record.customer_platform_mutation_key_hashes)
    ? record.customer_platform_mutation_key_hashes.filter((value: unknown) => typeof value === 'string')
    : [];
  const recovery = {
    action,
    actor_id: user.id,
    request_fingerprint: requestFingerprint,
    mutation_target: target,
    result,
    recorded_at: nowIso(),
  };
  const boundedHashes = [...new Set([...priorHashes.filter((hash: string) => hash !== keyHash), keyHash])]
    .slice(-WARNING_ADDRESS_RECOVERY_LIMIT);
  return {
    customer_platform_last_mutation_key_hash: keyHash,
    customer_platform_last_mutation_recovery: recovery,
    customer_platform_mutation_key_hashes: boundedHashes,
    customer_platform_mutation_recoveries: Object.fromEntries(
      boundedHashes.map(hash => [hash, hash === keyHash ? recovery : recoveryLog[hash]]).filter(([, value]) => Boolean(value)),
    ),
  };
}

async function warningAddressOrderRecoveryPatch(
  object: LooseRecord,
  user: LooseRecord,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
  result: LooseRecord,
) {
  const keyHash = await sha256(idempotencyKey);
  const priorRecoveries = object.warning_address_mutation_recoveries;
  const recoveryLog = priorRecoveries && typeof priorRecoveries === 'object' && !Array.isArray(priorRecoveries)
    ? priorRecoveries
    : {};
  const priorHashes = Array.isArray(object.warning_address_mutation_key_hashes)
    ? object.warning_address_mutation_key_hashes.filter((value: unknown) => typeof value === 'string')
    : [];
  const recovery = {
    action: 'reorder_object_warning_addresses',
    actor_id: user.id,
    request_fingerprint: requestFingerprint,
    mutation_target: target,
    result,
    recorded_at: nowIso(),
  };
  const boundedHashes = [...new Set([...priorHashes.filter((hash: string) => hash !== keyHash), keyHash])]
    .slice(-WARNING_ADDRESS_RECOVERY_LIMIT);
  return {
    warning_address_last_mutation_key_hash: keyHash,
    warning_address_last_mutation_recovery: recovery,
    warning_address_mutation_key_hashes: boundedHashes,
    warning_address_mutation_recoveries: Object.fromEntries(
      boundedHashes.map(hash => [hash, hash === keyHash ? recovery : recoveryLog[hash]]).filter(([, value]) => Boolean(value)),
    ),
  };
}

function installationChanges(before: LooseRecord | null, after: LooseRecord, credentialChanges: LooseRecord[] = []) {
  const labels: Record<string, string> = {
    installation_type: 'Type', custom_type: 'Ander type', name: 'Naam', brand: 'Merk', model: 'Model',
    serial_number: 'Serienummer', external_reference: 'Externe referentie', control_panel_location: 'Locatie centrale',
    monitoring_connected: 'Doormelding', monitoring_provider_name: 'Meldkamer of provider', monitoring_connection_reference: 'Aansluitreferentie',
    installer_name: 'Onderhoudspartij', installer_phone: 'Telefoon onderhoudspartij', commissioned_on: 'In bedrijf sinds',
    last_tested_on: 'Laatst getest', next_maintenance_on: 'Volgend onderhoud', lifecycle_status: 'Levenscyclus',
    operational_status: 'Operationele toestand', credential_types: 'Ingestelde codes',
  };
  return [...Object.entries(labels).flatMap(([field, label]) => {
    const beforeValue = before?.[field] ?? null;
    const afterValue = after?.[field] ?? null;
    if (JSON.stringify(canonicalMutationValue(beforeValue)) === JSON.stringify(canonicalMutationValue(afterValue))) return [];
    return [{ field, label, before: Array.isArray(beforeValue) ? beforeValue.join(', ') : beforeValue, after: Array.isArray(afterValue) ? afterValue.join(', ') : afterValue }];
  }), ...credentialChanges];
}

async function handleListObjectInstallations(base44: LooseRecord, body: LooseRecord) {
  const { customer, object } = await requireCustomerObjectScope(base44, body);
  const records = await getEntity(base44, 'ObjectInstallation').filter({ customer_id: customer.id, object_id: object.id }, '-updated_date', 500);
  const active = records.filter((record: LooseRecord) => legacyInstallationLifecycle(record) !== 'archived');
  const credentials = await installationCredentialTypes(base44, active);
  await bestEffortCleanupStaleInstallationCredentials(base44, records);
  return { items: active.map((record: LooseRecord) => safeObjectInstallation(record, credentials.get(record.id) || [])) };
}

async function handleCreateObjectInstallation(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const { customer, object } = await requireCustomerObjectForMutation(base44, body);
  if (object.status === 'archived') throw new ApiError(409, 'Gearchiveerd object moet eerst worden hersteld');
  if (expectedVersion !== 0) throw new ApiError(409, 'Nieuwe installatie verwacht expected_version 0');
  const data = requireObject(body);
  const patch = normalizedInstallationData(data);
  const credentials = normalizedInstallationCredentials(data, patch.installation_type);
  if (normalizedInstallationCredentialRevocations(data).length) throw new ApiError(400, 'Een nieuwe installatie heeft nog geen codes om in te trekken');
  if (credentials.length) await installationCredentialKey();
  const credentialValues = Object.fromEntries(credentials.map(item => [item.credential_type, item.value]));
  const replay = await getEntity(base44, 'ObjectInstallation').filter({ creation_idempotency_key: idempotencyKey }, '-created_date', 2);
  if (replay.length > 1) throw new ApiError(409, 'Installatie-idempotency is niet eenduidig; handmatige controle vereist');
  if (replay.length) {
    let installation = replay[0];
    if (
      installation.customer_id !== customer.id || installation.object_id !== object.id ||
      installation.creation_request_fingerprint !== requestFingerprint ||
      installation.creation_actor_user_id !== user.id ||
      installation.creation_mutation_target !== target
    ) rejectIdempotencyReuse();
    if (credentials.length && !installation.active_credential_id) {
      const bundle = await createInstallationCredentialBundle(base44, user, installation, credentialValues, idempotencyKey);
      try {
        installation = await casUpdate(base44, 'ObjectInstallation', installation, versionOf(installation), {
          active_credential_id: bundle.id,
          credential_storage_version: 1,
          credential_types: Object.keys(credentialValues).sort(),
        });
      } finally {
        await bestEffortReconcileInstallationCredentials(base44, installation.id);
      }
    }
    const safe = safeObjectInstallation(installation);
    return { installation: safe, customer_id: customer.id, object_id: object.id, replayed: true, summary: `Installatie ${safe.name} toegevoegd`, resource_type: 'ObjectInstallation', resource_id: safe.id, category: 'operations' };
  }
  let installation = await getEntity(base44, 'ObjectInstallation').create({
    customer_id: customer.id,
    object_id: object.id,
    ...patch,
    active_credential_id: null,
    credential_storage_version: 1,
    credential_types: [],
    creation_idempotency_key: idempotencyKey,
    creation_request_fingerprint: requestFingerprint,
    creation_actor_user_id: user.id,
    creation_mutation_target: target,
    version: 1,
  });
  if (credentials.length) {
    const bundle = await createInstallationCredentialBundle(base44, user, installation, credentialValues, idempotencyKey);
    try {
      installation = await casUpdate(base44, 'ObjectInstallation', installation, versionOf(installation), {
        active_credential_id: bundle.id,
        credential_storage_version: 1,
        credential_types: Object.keys(credentialValues).sort(),
      });
    } finally {
      await bestEffortReconcileInstallationCredentials(base44, installation.id);
    }
  }
  const safe = safeObjectInstallation(installation);
  return { installation: safe, customer_id: customer.id, object_id: object.id, changes: installationChanges(null, safe), summary: `Installatie ${safe.name} toegevoegd`, resource_type: 'ObjectInstallation', resource_id: safe.id, category: 'operations' };
}

async function handleUpdateObjectInstallation(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const { customer, object } = await requireCustomerObjectForMutation(base44, body);
  if (object.status === 'archived') throw new ApiError(409, 'Gearchiveerd object moet eerst worden hersteld');
  const installation = await requireRecord(base44, 'ObjectInstallation', requireString(body, 'installation_id'), 'Installatie');
  if (installation.customer_id !== customer.id || installation.object_id !== object.id || legacyInstallationLifecycle(installation) === 'archived') throw new ApiError(409, 'Installatie hoort niet bij dit object');
  const data = requireObject(body);
  const patch = normalizedInstallationData(data);
  const credentials = normalizedInstallationCredentials(data, patch.installation_type);
  const revokedTypes = normalizedInstallationCredentialRevocations(data);
  if (versionOf(installation) !== expectedVersion) throw new ApiError(409, 'Installatie is intussen gewijzigd; vernieuw en controleer de wijzigingen');
  const currentCredentials = await installationCredentialState(base44, installation);
  const allowedTypes = INSTALLATION_CREDENTIAL_TYPES_BY_INSTALLATION[patch.installation_type] || new Set<string>();
  const desiredValues = Object.fromEntries(Object.entries(currentCredentials.values).filter(([type]) => allowedTypes.has(type))) as Record<string, string>;
  const replacementTypes = credentials.map(item => item.credential_type);
  if (revokedTypes.some(type => replacementTypes.includes(type))) throw new ApiError(400, 'Een installatiecode kan niet tegelijk worden vervangen en ingetrokken');
  const missingRevocations = revokedTypes.filter(type => !currentCredentials.types.includes(type));
  if (missingRevocations.length) throw new ApiError(409, 'Een in te trekken installatiecode is niet meer ingesteld; vernieuw en controleer de installatie');
  for (const credentialType of revokedTypes) delete desiredValues[credentialType];
  for (const credential of credentials) desiredValues[credential.credential_type] = credential.value;
  const removedTypes = currentCredentials.types.filter(type => !allowedTypes.has(type));
  const credentialsChanged = replacementTypes.length > 0 || revokedTypes.length > 0 || removedTypes.length > 0;
  let bundle = currentCredentials.bundle;
  if (credentialsChanged) {
    if (Object.keys(desiredValues).length) {
      await installationCredentialKey();
      bundle = await createInstallationCredentialBundle(base44, user, installation, desiredValues, idempotencyKey);
    } else {
      bundle = null;
    }
  }
  const credentialTypes = Object.keys(desiredValues).sort();
  const metadataChanged = Object.entries(patch).some(([field, value]) =>
    JSON.stringify(canonicalMutationValue(installation[field])) !== JSON.stringify(canonicalMutationValue(value)));
  if (!metadataChanged && !credentialsChanged) {
    const unchanged = safeObjectInstallation(installation, currentCredentials.types);
    return { installation: unchanged, customer_id: customer.id, object_id: object.id, unchanged: true, summary: 'Installatie opgeslagen', resource_type: 'ObjectInstallation', resource_id: installation.id, category: 'operations' };
  }
  const projected = {
    ...installation,
    ...patch,
    active_credential_id: credentialsChanged ? bundle?.id || null : installation.active_credential_id || null,
    credential_storage_version: 1,
    credential_types: credentialTypes,
    version: expectedVersion + 1,
  };
  const before = safeObjectInstallation(installation, currentCredentials.types);
  const after = safeObjectInstallation(projected, credentialTypes);
  const credentialChanges = [
    ...(replacementTypes.length ? [{ field: 'credential_types', label: 'Beveiligde codes vervangen', before: null, after: replacementTypes.map(type => installationCredentialTypeLabel(type)).join(', ') }] : []),
    ...(revokedTypes.length ? [{ field: 'credential_types', label: 'Beveiligde codes ingetrokken', before: revokedTypes.map(type => installationCredentialTypeLabel(type)).join(', '), after: null }] : []),
    ...(removedTypes.length ? [{ field: 'credential_types', label: 'Beveiligde codes verwijderd bij typewijziging', before: removedTypes.map(type => installationCredentialTypeLabel(type)).join(', '), after: null }] : []),
  ];
  const changes = installationChanges(before, after, credentialChanges);
  const recoveryResult = { installation: after, customer_id: customer.id, object_id: object.id, changes, summary: `Installatie ${after.name} gewijzigd`, resource_type: 'ObjectInstallation', resource_id: after.id, category: 'operations' };
  const recoveryPatch = await mutationRecoveryPatch(installation, 'update_object_installation', user, idempotencyKey, requestFingerprint, target, recoveryResult);
  let updated: LooseRecord;
  try {
    updated = await casUpdate(base44, 'ObjectInstallation', installation, expectedVersion, {
      ...patch,
      active_credential_id: projected.active_credential_id,
      credential_storage_version: 1,
      credential_types: credentialTypes,
      ...recoveryPatch,
    });
  } finally {
    await bestEffortReconcileInstallationCredentials(base44, installation.id);
  }
  return { ...recoveryResult, installation: safeObjectInstallation(updated, credentialTypes) };
}

async function handleArchiveObjectInstallation(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const { customer, object } = await requireCustomerObjectForMutation(base44, body);
  if (object.status === 'archived') throw new ApiError(409, 'Gearchiveerd object moet eerst worden hersteld');
  const installation = await requireRecord(base44, 'ObjectInstallation', requireString(body, 'installation_id'), 'Installatie');
  if (installation.customer_id !== customer.id || installation.object_id !== object.id || legacyInstallationLifecycle(installation) === 'archived') throw new ApiError(409, 'Installatie hoort niet bij dit object');
  const credentialState = await installationCredentialState(base44, installation);
  const before = safeObjectInstallation(installation, credentialState.types);
  const projected = { ...installation, lifecycle_status: 'archived', status: 'archived', archived_at: nowIso(), archived_by_user_id: user.id, version: expectedVersion + 1 };
  const after = safeObjectInstallation(projected, credentialState.types);
  const recoveryResult = { installation: after, customer_id: customer.id, object_id: object.id, archived: true, changes: installationChanges(before, after), summary: `Installatie ${before.name} gearchiveerd`, resource_type: 'ObjectInstallation', resource_id: installation.id, category: 'operations' };
  const recoveryPatch = await mutationRecoveryPatch(installation, 'archive_object_installation', user, idempotencyKey, requestFingerprint, target, recoveryResult);
  const updated = await casUpdate(base44, 'ObjectInstallation', installation, expectedVersion, {
    lifecycle_status: 'archived',
    status: 'archived',
    archived_at: projected.archived_at,
    archived_by_user_id: user.id,
    ...recoveryPatch,
  });
  return { ...recoveryResult, installation: safeObjectInstallation(updated) };
}

function objectInstallationMutationLockVersion(object: LooseRecord) {
  const value = Number(object.installation_mutation_lock_version);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function objectInstallationMutationLockVersionQuery(object: LooseRecord) {
  const value = object.installation_mutation_lock_version;
  return Number.isInteger(value) && value >= 0
    ? { installation_mutation_lock_version: value }
    : { $or: [
      { installation_mutation_lock_version: null },
      { installation_mutation_lock_version: { $exists: false } },
    ] };
}

async function reserveObjectInstallationMutation(
  base44: LooseRecord,
  user: LooseRecord,
  objectId: string,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const ownerToken = crypto.randomUUID();
  const keyHash = await sha256(idempotencyKey);
  const reservedAt = nowIso();
  const lock = {
    owner_token: ownerToken,
    key_hash: keyHash,
    actor_id: user.id,
    request_fingerprint: requestFingerprint,
    mutation_target: target,
    reserved_at: reservedAt,
    expires_at: new Date(Date.parse(reservedAt) + OBJECT_INSTALLATION_MUTATION_LOCK_TTL_MS).toISOString(),
  };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const object = await requireRecord(base44, 'SurveillanceObject', objectId, 'Object');
    const current = object.installation_mutation_lock;
    if (current && typeof current === 'object' && !Array.isArray(current) && reservationIsCurrent(current)) {
      const sameRequest = current.key_hash === keyHash
        && current.actor_id === user.id
        && current.request_fingerprint === requestFingerprint
        && current.mutation_target === target;
      throw new ApiError(409, sameRequest
        ? 'Deze installatiewijziging is nog in verwerking; probeer opnieuw'
        : 'Een andere installatiewijziging op dit object is nog in verwerking; probeer opnieuw', {
        retryable: true,
        reservation_expires_at: current.expires_at || null,
      });
    }
    const currentVersion = objectInstallationMutationLockVersion(object);
    const hasPersistedVersion = Number.isInteger(object.installation_mutation_lock_version)
      && object.installation_mutation_lock_version >= 0;
    const update = hasPersistedVersion
      ? { $set: { installation_mutation_lock: lock }, $inc: { installation_mutation_lock_version: 1 } }
      : { $set: { installation_mutation_lock: lock, installation_mutation_lock_version: 1 } };
    const result = await getEntity(base44, 'SurveillanceObject').updateMany(
      { id: object.id, ...objectInstallationMutationLockVersionQuery(object) },
      update,
    );
    if (result?.success && result.updated === 1) {
      return { object_id: object.id, owner_token: ownerToken, lock_version: currentVersion + 1 };
    }
  }
  throw new ApiError(409, 'Installatiewijziging kon niet veilig worden gereserveerd; probeer opnieuw', { retryable: true });
}

async function releaseObjectInstallationMutation(base44: LooseRecord, reservation: LooseRecord | null) {
  if (!reservation) return;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const object = await getRecord(base44, 'SurveillanceObject', reservation.object_id);
    if (!object || object.installation_mutation_lock?.owner_token !== reservation.owner_token) return;
    const currentVersion = objectInstallationMutationLockVersion(object);
    if (currentVersion !== reservation.lock_version) return;
    const result = await getEntity(base44, 'SurveillanceObject').updateMany(
      { id: object.id, installation_mutation_lock_version: currentVersion },
      {
        $set: { installation_mutation_lock: null },
        $inc: { installation_mutation_lock_version: 1 },
      },
    );
    if (result?.success && result.updated === 1) return;
  }
  throw new ApiError(409, 'Installatiewijzigingsslot kon niet veilig worden vrijgegeven; probeer opnieuw', { retryable: true });
}

async function handleObjectInstallationMutation(
  base44: LooseRecord,
  user: LooseRecord,
  action: string,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const { object } = await requireCustomerObjectForMutation(base44, body);
  const reservation = await reserveObjectInstallationMutation(
    base44,
    user,
    object.id,
    idempotencyKey,
    requestFingerprint,
    target,
  );
  try {
    if (action === 'create_object_installation') {
      return await handleCreateObjectInstallation(base44, user, body, expectedVersion, idempotencyKey, requestFingerprint, target);
    }
    if (action === 'update_object_installation') {
      return await handleUpdateObjectInstallation(base44, user, body, expectedVersion, idempotencyKey, requestFingerprint, target);
    }
    if (action === 'archive_object_installation') {
      return await handleArchiveObjectInstallation(base44, user, body, expectedVersion, idempotencyKey, requestFingerprint, target);
    }
    throw new ApiError(400, 'Onbekende installatiemutatie');
  } finally {
    await releaseObjectInstallationMutation(base44, reservation);
  }
}

function objectIdentityPatch(data: LooseRecord, object: LooseRecord) {
  const patch = pick(data, OBJECT_IDENTITY_PATCH_FIELDS);
  if (!Object.keys(patch).length) throw new ApiError(400, 'Geen objectgegevens opgegeven');

  if (Object.prototype.hasOwnProperty.call(patch, 'object_code')) {
    patch.object_code = canonicalObjectCode(patch.object_code, true);
    patch.object_code_normalized = normalizedObjectCode(patch.object_code);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'external_object_code')) {
    patch.external_object_code = objectCodeDisplayValue(
      patch.external_object_code,
      'Externe objectcode',
      120,
      false,
    );
    patch.external_object_code_normalized = patch.external_object_code
      ? normalizedExternalObjectCode(patch.external_object_code)
      : null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
    patch.name = objectText(patch.name, 'Objectnaam', 160, false);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'address')) {
    patch.address = objectText(patch.address, 'Objectadres', 320, false);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'object_type')) {
    patch.object_type = asString(patch.object_type);
  }
  const logoTextLimits: Record<string, number> = {
    logo_file_url: 4_096,
    logo_file_id: 240,
    logo_download_filename: 255,
    logo_logical_path: 2_048,
  };
  for (const [field, maximum] of Object.entries(logoTextLimits)) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      patch[field] = objectText(patch[field], field, maximum);
    }
  }
  if (
    patch.logo_file_url &&
    !patch.logo_file_url.startsWith('https://') &&
    !patch.logo_file_url.startsWith('/')
  ) {
    throw new ApiError(400, 'logo_file_url moet een veilige HTTPS- of applicatie-URL zijn');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'logo_file_url') && !patch.logo_file_url) {
    patch.logo_file_id = null;
    patch.logo_download_filename = null;
    patch.logo_logical_path = null;
  }

  const nullableTextLimits: Record<string, number> = {
    street_name: 180,
    house_number: 30,
    house_number_addition: 30,
    postal_code: 20,
    city: 120,
    country_name: 120,
    bag_address_id: 120,
    region: 120,
  };
  for (const [field, maximum] of Object.entries(nullableTextLimits)) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      patch[field] = objectText(patch[field], field, maximum);
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'postal_code') && patch.postal_code) {
    patch.postal_code = patch.postal_code.toUpperCase();
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'country_code')) {
    const countryCode = asString(patch.country_code).toUpperCase();
    if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
      throw new ApiError(400, 'country_code moet uit twee letters bestaan');
    }
    patch.country_code = countryCode || null;
  }

  const addressFields = [
    'address',
    'street_name',
    'house_number',
    'house_number_addition',
    'postal_code',
    'city',
    'country_code',
    'country_name',
  ];
  const addressChanged = addressFields.some(field => Object.prototype.hasOwnProperty.call(patch, field));
  const latitudeProvided = Object.prototype.hasOwnProperty.call(patch, 'latitude');
  const longitudeProvided = Object.prototype.hasOwnProperty.call(patch, 'longitude');
  if (latitudeProvided !== longitudeProvided) {
    throw new ApiError(400, 'Breedte- en lengtegraad moeten samen worden gewijzigd');
  }
  const coordinatePairProvided = latitudeProvided && longitudeProvided;
  const geocodingStatusProvided = Object.prototype.hasOwnProperty.call(patch, 'geocoding_status');
  if (coordinatePairProvided && !geocodingStatusProvided) {
    throw new ApiError(400, 'Coördinaten vereisen een expliciete geocodestatus');
  }
  if (addressChanged && !coordinatePairProvided) {
    patch.latitude = null;
    patch.longitude = null;
    patch.bag_address_id = null;
    patch.geocoding_status = 'unverified';
    patch.show_on_mobile_map = false;
  }

  if (coordinatePairProvided) {
    patch.latitude = objectCoordinate(patch.latitude, -90, 90, 'Breedtegraad');
    patch.longitude = objectCoordinate(patch.longitude, -180, 180, 'Lengtegraad');
    if ((patch.latitude === null) !== (patch.longitude === null)) {
      throw new ApiError(400, 'Breedte- en lengtegraad moeten samen worden ingevuld');
    }
    if (addressChanged && !Object.prototype.hasOwnProperty.call(patch, 'bag_address_id')) {
      patch.bag_address_id = null;
    }
    if (patch.latitude === null) patch.bag_address_id = null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'geocoding_status')) {
    patch.geocoding_status = asString(patch.geocoding_status) || 'unverified';
  }

  const merged = { ...object, ...patch };
  const name = asString(merged.name);
  const address = asString(merged.address);
  const objectType = asString(merged.object_type);
  const geocodingStatus = asString(merged.geocoding_status) || 'unverified';
  const latitude = objectCoordinate(merged.latitude, -90, 90, 'Breedtegraad');
  const longitude = objectCoordinate(merged.longitude, -180, 180, 'Lengtegraad');
  if (!name) throw new ApiError(400, 'Objectnaam is verplicht');
  if (name.length > 160) throw new ApiError(400, 'Objectnaam mag maximaal 160 tekens bevatten');
  if (!address) throw new ApiError(400, 'Objectadres is verplicht');
  if (!OBJECT_TYPES.has(objectType)) throw new ApiError(400, 'Kies een geldig objecttype');
  if (!OBJECT_GEOCODING_STATUSES.has(geocodingStatus)) throw new ApiError(400, 'Ongeldige geocodestatus');
  if ((latitude === null) !== (longitude === null)) {
    throw new ApiError(400, 'Breedte- en lengtegraad moeten samen worden ingevuld');
  }
  if (geocodingStatus !== 'unverified' && latitude === null) {
    throw new ApiError(400, 'Een geverifieerde of handmatige locatie vereist geldige coördinaten');
  }
  if (
    objectLifecycleStatus(object) !== 'active' ||
    latitude === null ||
    !['verified', 'manual'].includes(geocodingStatus)
  ) {
    patch.show_on_mobile_map = false;
  }
  return patch;
}

function objectOperationsPatch(data: LooseRecord, object: LooseRecord) {
  const patch = pick(data, OBJECT_OPERATIONS_PATCH_FIELDS);
  if (!Object.keys(patch).length) throw new ApiError(400, 'Geen operationele objectgegevens opgegeven');

  const longTextFields = [...OBJECT_INSTRUCTION_FIELDS, 'notes'];
  for (const field of longTextFields) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      patch[field] = objectText(patch[field], field, 20_000);
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'show_on_mobile_map') && typeof patch.show_on_mobile_map !== 'boolean') {
    throw new ApiError(400, 'show_on_mobile_map moet ja of nee zijn');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'mobile_map_priority')) {
    const priority = Number(patch.mobile_map_priority);
    if (!Number.isInteger(priority) || priority < -1_000 || priority > 1_000) {
      throw new ApiError(400, 'mobile_map_priority moet een geheel getal tussen -1000 en 1000 zijn');
    }
    patch.mobile_map_priority = priority;
  }

  if (patch.show_on_mobile_map === true) {
    if (objectLifecycleStatus(object) !== 'active') {
      throw new ApiError(409, 'Alleen een actief object kan op de mobiele objectkaart worden getoond');
    }
    const latitude = objectCoordinate(object.latitude, -90, 90, 'Breedtegraad');
    const longitude = objectCoordinate(object.longitude, -180, 180, 'Lengtegraad');
    if (latitude === null || longitude === null) {
      throw new ApiError(409, 'Het object heeft geldige locatiecoördinaten nodig voor de mobiele kaart');
    }
    if (!['verified', 'manual'].includes(object.geocoding_status)) {
      throw new ApiError(409, 'Controleer de kaartpositie voordat het object mobiel zichtbaar wordt');
    }
  }
  return patch;
}

function objectCodeDisplayValue(
  value: unknown,
  label: string,
  maximumLength: number,
  required: boolean,
) {
  if (value === null || value === undefined || value === '') {
    if (required) throw new ApiError(400, `${label} is verplicht`);
    return null;
  }
  if (typeof value !== 'string') throw new ApiError(400, `${label} moet tekst zijn`);
  const code = value.normalize('NFKC').trim();
  if (!code) {
    if (required) throw new ApiError(400, `${label} is verplicht`);
    return null;
  }
  if (code.length > maximumLength) {
    throw new ApiError(400, `${label} mag maximaal ${maximumLength} tekens bevatten`);
  }
  if (/[\u0000-\u001f\u007f]/.test(code)) {
    throw new ApiError(400, `${label} bevat ongeldige besturingstekens`);
  }
  return code;
}

function normalizedCodeSearchValue(value: unknown) {
  return asString(value)
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('nl-NL');
}

function canonicalObjectCode(value: unknown, required: boolean) {
  const display = objectCodeDisplayValue(value, 'Objectcode', 50, required);
  if (!display) return null;
  const code = display.toUpperCase().replace(/\s+/g, '-');
  if (code.length > 50) throw new ApiError(400, 'Objectcode mag maximaal 50 tekens bevatten');
  if (!/^[A-Z0-9][A-Z0-9._/-]*$/.test(code)) {
    throw new ApiError(400, 'Objectcode bevat ongeldige tekens');
  }
  return code;
}

function normalizedObjectCode(value: unknown) {
  return canonicalObjectCode(value, true) as string;
}

function normalizedExternalObjectCode(value: unknown) {
  const normalized = normalizedCodeSearchValue(value);
  if (normalized.length > 120) throw new ApiError(400, 'Externe objectcode mag maximaal 120 tekens bevatten');
  return normalized;
}

async function objectCodeExists(
  base44: LooseRecord,
  code: string,
  excludedObjectId = '',
  reservation: LooseRecord | null = null,
) {
  const normalized = normalizedObjectCode(code);
  const display = canonicalObjectCode(code, true) as string;
  const legacyDisplayPattern = `^${display
    .split('-')
    .map(part => escapeRegex(part))
    .join('(?:-|\\s+)')}$`;
  const matches = await getEntity(base44, 'SurveillanceObject').filter({
    $or: [
      { object_code_normalized: normalized },
      { object_code: { $regex: legacyDisplayPattern, $options: 'i' } },
    ],
  }, '+created_date', 100);
  const exactMatch = matches.find((object: LooseRecord) =>
    object.id !== excludedObjectId && (() => {
      try {
        return normalizedObjectCode(object.object_code) === normalized;
      } catch {
        return normalizedCodeSearchValue(object.object_code) === normalized;
      }
    })()) || null;
  if (exactMatch) return exactMatch;

  // Records van voor object_code_normalized kunnen NFKC-equivalent zijn zonder
  // door een Mongo-regex gevonden te worden (bijv. full-width tekens). Scan die
  // legacyset paginagewijs voordat een nieuwe code wordt toegelaten.
  const pageSize = 5_000;
  for (let skip = 0; ; skip += pageSize) {
    const legacyPage = await getEntity(base44, 'SurveillanceObject').list(
      '+created_date',
      pageSize,
      skip,
      ['id', 'object_code', 'object_code_normalized'],
    );
    if (reservation) await renewGlobalObjectCodeMutation(base44, reservation);
    const legacyMatch = legacyPage.find((object: LooseRecord) => {
      if (object.id === excludedObjectId || object.object_code_normalized) return false;
      try {
        return normalizedObjectCode(object.object_code) === normalized;
      } catch {
        return false;
      }
    });
    if (legacyMatch) return legacyMatch;
    if (legacyPage.length < pageSize) return null;
  }
}

async function rollbackRejectedObjectCodeMutation(
  base44: LooseRecord,
  updatedObject: LooseRecord,
  previousObject: LooseRecord,
  rejectedCode: string,
  idempotencyKey: string,
) {
  let previousCode: string;
  try {
    previousCode = canonicalObjectCode(previousObject.object_code, true) as string;
  } catch {
    previousCode = await generatedObjectCode(base44, {
      id: previousObject.customer_id,
      customer_number: previousObject.customer_id,
    });
  }
  const keyHash = await sha256(idempotencyKey);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = attempt === 0
      ? updatedObject
      : await requireRecord(base44, 'SurveillanceObject', updatedObject.id, 'Object');
    if (normalizedObjectCode(current.object_code) !== normalizedObjectCode(rejectedCode)) return current;

    const hashes = Array.isArray(current.customer_platform_mutation_key_hashes)
      ? current.customer_platform_mutation_key_hashes.filter((value: unknown) => typeof value === 'string')
      : [];
    const remainingHashes = hashes.filter((hash: string) => hash !== keyHash);
    const currentRecoveries = current.customer_platform_mutation_recoveries;
    const recoveries = currentRecoveries && typeof currentRecoveries === 'object' && !Array.isArray(currentRecoveries)
      ? currentRecoveries
      : {};
    const remainingRecoveries = Object.fromEntries(
      Object.entries(recoveries).filter(([hash]) => hash !== keyHash),
    );
    const rollbackPatch: LooseRecord = {
      object_code: previousCode,
      object_code_normalized: normalizedObjectCode(previousCode),
      customer_platform_mutation_key_hashes: remainingHashes,
      customer_platform_mutation_recoveries: remainingRecoveries,
    };
    if (current.customer_platform_last_mutation_key_hash === keyHash) {
      const lastHash = remainingHashes.at(-1) || null;
      rollbackPatch.customer_platform_last_mutation_key_hash = lastHash;
      rollbackPatch.customer_platform_last_mutation_recovery = lastHash
        ? remainingRecoveries[lastHash] || null
        : null;
    }
    try {
      return await casUpdate(base44, 'SurveillanceObject', current, versionOf(current), rollbackPatch);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409 || attempt === 4) throw error;
    }
  }
  throw new ApiError(500, 'Dubbele objectcode kon niet veilig worden teruggedraaid', {
    object_id: updatedObject.id,
    object_code: rejectedCode,
  });
}

async function generatedObjectCode(base44: LooseRecord, customer: LooseRecord) {
  const source = asString(customer.customer_number || customer.id)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(-8) || 'LOQ';
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
    const code = `OBJ-${source}-${suffix}`;
    if (!(await objectCodeExists(base44, code))) return code;
  }
  throw new ApiError(503, 'Er kon geen unieke objectcode worden gereserveerd');
}

async function markCustomerFirstObject(base44: LooseRecord, customer: LooseRecord) {
  if (customer.onboarding_state?.first_object === true) return customer;
  return casUpdateLatest(base44, 'Customer', customer.id, {
    onboarding_state: {
      ...(customer.onboarding_state || {}),
      first_object: true,
    },
  });
}

function customerObjectCreateBindingMatches(
  object: LooseRecord,
  user: LooseRecord,
  data: LooseRecord,
  requestFingerprint: string,
  target: string,
) {
  const bindingValues = [
    asString(object.creation_request_fingerprint),
    asString(object.creation_actor_user_id),
    asString(object.creation_mutation_target),
  ];
  const hasCreationBinding = bindingValues.some(Boolean);
  if (hasCreationBinding) {
    return object.creation_request_fingerprint === requestFingerprint
      && object.creation_actor_user_id === user.id
      && object.creation_mutation_target === target;
  }
  return normalizeName(object.name) === normalizeName(data.name)
    && normalizeName(object.address) === normalizeName(data.address)
    && asString(object.object_type) === asString(data.object_type)
    && Boolean(asString(data.name))
    && Boolean(asString(data.address))
    && Boolean(asString(data.object_type));
}

async function existingCustomerObjectCreation(
  base44: LooseRecord,
  user: LooseRecord,
  customer: LooseRecord,
  data: LooseRecord,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const previousCreations = await getEntity(base44, 'SurveillanceObject').filter({
    creation_idempotency_key: idempotencyKey,
  }, '-created_date', 2);
  if (previousCreations.length > 1) {
    throw new ApiError(409, 'Meerdere objecten delen dezelfde creation_idempotency_key; handmatige reconciliatie vereist');
  }
  if (!previousCreations.length) return null;

  const object = previousCreations[0];
  if (
    object.customer_id !== customer.id ||
    !customerObjectCreateBindingMatches(object, user, data, requestFingerprint, target)
  ) {
    rejectIdempotencyReuse();
  }
  await markCustomerFirstObject(base44, customer);
  return {
    object: customerObjectResponseRecord(object),
    customer_id: customer.id,
    replayed: true,
    recovered_partial_creation: true,
    resource_type: 'SurveillanceObject',
    resource_id: object.id,
    category: 'operations',
  };
}

function reservationIsCurrent(reservation: LooseRecord) {
  if (!reservation || typeof reservation !== 'object' || Array.isArray(reservation)) return false;
  const expiresAt = Date.parse(asString(reservation.expires_at));
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

async function reserveGlobalObjectCodeMutation(
  base44: LooseRecord,
  user: LooseRecord,
  idempotencyKey: string,
  target: string,
) {
  const ownerToken = crypto.randomUUID();
  const keyHash = await sha256(idempotencyKey);
  const reservedAt = nowIso();
  const lock = {
    owner_token: ownerToken,
    key_hash: keyHash,
    actor_id: user.id,
    mutation_target: target,
    reserved_at: reservedAt,
    expires_at: new Date(Date.parse(reservedAt) + OBJECT_CODE_MUTATION_LOCK_TTL_MS).toISOString(),
  };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const coordinators = await getEntity(base44, 'Customer').list(
      '+created_date',
      1,
      0,
      ['id', 'version', 'created_date', 'object_code_mutation_lock'],
    );
    const coordinator = coordinators[0];
    if (!coordinator) throw new ApiError(503, 'Objectcodecoördinator is niet beschikbaar');
    const current = coordinator.object_code_mutation_lock;
    if (current && typeof current === 'object' && !Array.isArray(current) && reservationIsCurrent(current)) {
      const sameRequest = current.key_hash === keyHash
        && current.actor_id === user.id
        && current.mutation_target === target;
      throw new ApiError(409, sameRequest
        ? 'Deze objectcodewijziging is nog in verwerking; probeer opnieuw'
        : 'Een andere objectcodewijziging is nog in verwerking; probeer opnieuw', {
        retryable: true,
        reservation_expires_at: current.expires_at || null,
      });
    }
    try {
      const updated = await casUpdate(base44, 'Customer', coordinator, versionOf(coordinator), {
        object_code_mutation_lock: lock,
      });
      if (updated.object_code_mutation_lock?.owner_token === ownerToken) {
        return { coordinator_id: coordinator.id, owner_token: ownerToken };
      }
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409 || attempt === 7) throw error;
    }
  }
  throw new ApiError(409, 'Objectcodewijziging kon niet veilig worden gereserveerd; probeer opnieuw', {
    retryable: true,
  });
}

async function releaseGlobalObjectCodeMutation(
  base44: LooseRecord,
  reservation: LooseRecord | null,
) {
  if (!reservation) return;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const coordinator = await getRecord(base44, 'Customer', reservation.coordinator_id);
    if (!coordinator || coordinator.object_code_mutation_lock?.owner_token !== reservation.owner_token) return;
    try {
      await casUpdate(base44, 'Customer', coordinator, versionOf(coordinator), {
        object_code_mutation_lock: null,
      });
      return;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409 || attempt === 4) throw error;
    }
  }
}

async function assertGlobalObjectCodeMutation(
  base44: LooseRecord,
  reservation: LooseRecord | null,
) {
  if (!reservation) throw new ApiError(409, 'Objectcode-reservering ontbreekt; probeer opnieuw', { retryable: true });
  const coordinator = await requireRecord(base44, 'Customer', reservation.coordinator_id, 'Objectcodecoördinator');
  const current = coordinator.object_code_mutation_lock;
  if (current?.owner_token !== reservation.owner_token || !reservationIsCurrent(current)) {
    throw new ApiError(409, 'Objectcode-reservering is verlopen of overgenomen; probeer opnieuw', {
      retryable: true,
    });
  }
  return coordinator;
}

async function renewGlobalObjectCodeMutation(
  base44: LooseRecord,
  reservation: LooseRecord,
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const coordinator = await assertGlobalObjectCodeMutation(base44, reservation);
    const current = coordinator.object_code_mutation_lock;
    try {
      return await casUpdate(base44, 'Customer', coordinator, versionOf(coordinator), {
        object_code_mutation_lock: {
          ...current,
          expires_at: new Date(Date.now() + OBJECT_CODE_MUTATION_LOCK_TTL_MS).toISOString(),
        },
      });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409 || attempt === 4) throw error;
    }
  }
  throw new ApiError(409, 'Objectcode-reservering kon niet worden verlengd; probeer opnieuw', {
    retryable: true,
  });
}

async function reserveCustomerObjectCreation(
  base44: LooseRecord,
  user: LooseRecord,
  customerId: string,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const ownerToken = crypto.randomUUID();
  const keyHash = await sha256(idempotencyKey);
  const reservedAt = nowIso();
  const reservation = {
    owner_token: ownerToken,
    key_hash: keyHash,
    actor_id: user.id,
    request_fingerprint: requestFingerprint,
    mutation_target: target,
    reserved_at: reservedAt,
    expires_at: new Date(Date.parse(reservedAt) + CUSTOMER_OBJECT_CREATE_RESERVATION_TTL_MS).toISOString(),
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const customer = await requireRecord(base44, 'Customer', customerId, 'Klant');
    if (customer.status === 'archived') {
      throw new ApiError(409, 'Aan een gearchiveerde klant kan geen object worden toegevoegd');
    }
    const current = customer.object_creation_reservation;
    if (current && typeof current === 'object' && !Array.isArray(current) && reservationIsCurrent(current)) {
      const sameRequest = current.key_hash === keyHash
        && current.actor_id === user.id
        && current.request_fingerprint === requestFingerprint
        && current.mutation_target === target;
      throw new ApiError(409, sameRequest
        ? 'Objectaanmaak met deze sleutel is nog in verwerking; probeer opnieuw'
        : 'Voor deze klant wordt al een object aangemaakt; probeer opnieuw', {
        retryable: true,
        reservation_expires_at: current.expires_at || null,
      });
    }
    try {
      const updated = await casUpdate(base44, 'Customer', customer, versionOf(customer), {
        object_creation_reservation: reservation,
      });
      if (updated.object_creation_reservation?.owner_token === ownerToken) return ownerToken;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409 || attempt === 4) throw error;
    }
  }
  throw new ApiError(409, 'Objectaanmaak kon niet veilig worden gereserveerd; probeer opnieuw', { retryable: true });
}

async function releaseCustomerObjectCreation(base44: LooseRecord, customerId: string, ownerToken: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const customer = await requireRecord(base44, 'Customer', customerId, 'Klant');
    if (customer.object_creation_reservation?.owner_token !== ownerToken) return;
    try {
      await casUpdate(base44, 'Customer', customer, versionOf(customer), {
        object_creation_reservation: null,
      });
      return;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409 || attempt === 4) throw error;
    }
  }
}

async function releaseMatchingCustomerObjectCreation(
  base44: LooseRecord,
  user: LooseRecord,
  customerId: string,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const customer = await requireRecord(base44, 'Customer', customerId, 'Klant');
  const reservation = customer.object_creation_reservation;
  if (!reservation || typeof reservation !== 'object' || Array.isArray(reservation)) return;
  const keyHash = await sha256(idempotencyKey);
  if (
    reservation.key_hash !== keyHash ||
    reservation.actor_id !== user.id ||
    reservation.request_fingerprint !== requestFingerprint ||
    reservation.mutation_target !== target ||
    !asString(reservation.owner_token)
  ) return;
  try {
    await releaseCustomerObjectCreation(base44, customerId, reservation.owner_token);
  } catch (error) {
    console.error('[customerPlatformApi] object creation reservation cleanup failed', customerId, error);
  }
}

function customerObjectResponseRecord(object: LooseRecord) {
  return safeObjectMutationSummary(object, []);
}

async function handleCreateCustomerObject(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  if (expectedVersion !== 0) throw new ApiError(409, 'Nieuw object verwacht expected_version 0');
  const customerId = requireString(body, 'customer_id');
  const customer = await requireRecord(base44, 'Customer', customerId, 'Klant');
  if (customer.status === 'archived') throw new ApiError(409, 'Aan een gearchiveerde klant kan geen object worden toegevoegd');
  const data = requireObject(body);

  const existingCreation = await existingCustomerObjectCreation(
    base44,
    user,
    customer,
    data,
    idempotencyKey,
    requestFingerprint,
    target,
  );
  if (existingCreation) {
    await releaseMatchingCustomerObjectCreation(
      base44,
      user,
      customerId,
      idempotencyKey,
      requestFingerprint,
      target,
    );
    return existingCreation;
  }

  const name = asString(data.name);
  const address = asString(data.address);
  const objectType = asString(data.object_type);
  if (!name) throw new ApiError(400, 'Objectnaam is verplicht');
  if (name.length > 160) throw new ApiError(400, 'Objectnaam mag maximaal 160 tekens bevatten');
  if (!address) throw new ApiError(400, 'Objectadres is verplicht');
  if (!OBJECT_TYPES.has(objectType)) throw new ApiError(400, 'Kies een geldig objecttype');

  let objectCode = canonicalObjectCode(data.object_code, false);
  if (objectCode) {
    const duplicateCode = await objectCodeExists(base44, objectCode);
    if (duplicateCode) {
      throw new ApiError(409, 'Objectcode is al in gebruik', { duplicate_object_id: duplicateCode.id });
    }
  } else {
    objectCode = await generatedObjectCode(base44, customer);
  }
  const objectCodeNormalized = normalizedObjectCode(objectCode);
  const externalObjectCode = objectCodeDisplayValue(
    data.external_object_code,
    'Externe objectcode',
    120,
    false,
  );
  const externalObjectCodeNormalized = externalObjectCode
    ? normalizedExternalObjectCode(externalObjectCode)
    : null;

  const customerObjects = await getEntity(base44, 'SurveillanceObject').filter({ customer_id: customerId }, '-updated_date', 1000);
  const normalizedName = normalizeName(name);
  const normalizedAddress = normalizeName(address);
  const possibleDuplicates = customerObjects.filter((object: LooseRecord) =>
    normalizeName(object.name) === normalizedName || normalizeName(object.address) === normalizedAddress);
  if (possibleDuplicates.length && body.duplicate_reviewed !== true) {
    throw new ApiError(409, 'Mogelijk dubbel object gevonden; controleer de bestaande objecten', {
      duplicate_object_ids: possibleDuplicates.map((object: LooseRecord) => object.id),
    });
  }

  const latitudeProvided = Object.prototype.hasOwnProperty.call(data, 'latitude');
  const longitudeProvided = Object.prototype.hasOwnProperty.call(data, 'longitude');
  if (latitudeProvided !== longitudeProvided) {
    throw new ApiError(400, 'Breedte- en lengtegraad moeten samen worden ingevuld');
  }
  const latitude = objectCoordinate(data.latitude, -90, 90, 'Breedtegraad');
  const longitude = objectCoordinate(data.longitude, -180, 180, 'Lengtegraad');
  if ((latitude === null) !== (longitude === null)) {
    throw new ApiError(400, 'Breedte- en lengtegraad moeten samen worden ingevuld');
  }
  const requestedGeocodingStatus = asString(data.geocoding_status) || 'unverified';
  if (!OBJECT_GEOCODING_STATUSES.has(requestedGeocodingStatus)) {
    throw new ApiError(400, 'Ongeldige geocodestatus');
  }
  if (requestedGeocodingStatus !== 'unverified' && latitude === null) {
    throw new ApiError(400, 'Een geverifieerde of handmatige locatie vereist geldige coördinaten');
  }
  const reservationOwner = await reserveCustomerObjectCreation(
    base44,
    user,
    customerId,
    idempotencyKey,
    requestFingerprint,
    target,
  );
  let objectCodeReservation: LooseRecord | null = null;
  try {
    const reservedCustomer = await requireRecord(base44, 'Customer', customerId, 'Klant');
    if (reservedCustomer.object_creation_reservation?.owner_token !== reservationOwner) {
      throw new ApiError(409, 'Objectaanmaakreservering is verlopen; probeer opnieuw', { retryable: true });
    }
    const racedCreation = await existingCustomerObjectCreation(
      base44,
      user,
      reservedCustomer,
      data,
      idempotencyKey,
      requestFingerprint,
      target,
    );
    if (racedCreation) return racedCreation;

    objectCodeReservation = await reserveGlobalObjectCodeMutation(
      base44,
      user,
      idempotencyKey,
      target,
    );
    const duplicateCode = await objectCodeExists(base44, objectCode, '', objectCodeReservation);
    if (duplicateCode) {
      throw new ApiError(409, 'Objectcode is al in gebruik', { duplicate_object_id: duplicateCode.id });
    }
    await assertGlobalObjectCodeMutation(base44, objectCodeReservation);
    const keyHash = await sha256(idempotencyKey);
    const object = await getEntity(base44, 'SurveillanceObject').create({
      customer_id: customerId,
      object_code: objectCode,
      object_code_normalized: objectCodeNormalized,
      external_object_code: externalObjectCode,
      external_object_code_normalized: externalObjectCodeNormalized,
      creation_idempotency_key: idempotencyKey,
      creation_request_fingerprint: requestFingerprint,
      creation_actor_user_id: user.id,
      creation_mutation_target: target,
      customer_platform_last_mutation_key_hash: keyHash,
      customer_platform_last_mutation_recovery: {
        action: 'create_customer_object',
        actor_id: user.id,
        request_fingerprint: requestFingerprint,
        mutation_target: target,
        recorded_at: nowIso(),
      },
      customer_platform_mutation_key_hashes: [keyHash],
      customer_platform_mutation_recoveries: {
        [keyHash]: {
          action: 'create_customer_object',
          actor_id: user.id,
          request_fingerprint: requestFingerprint,
          mutation_target: target,
          recorded_at: nowIso(),
        },
      },
      name,
      object_type: objectType,
      status: 'concept',
      address,
      street_name: asString(data.street_name) || null,
      house_number: asString(data.house_number) || null,
      house_number_addition: asString(data.house_number_addition) || null,
      postal_code: asString(data.postal_code).toUpperCase() || null,
      city: asString(data.city) || null,
      country_code: asString(data.country_code).toUpperCase() || 'NL',
      country_name: asString(data.country_name) || 'Nederland',
      latitude,
      longitude,
      geocoding_status: requestedGeocodingStatus,
      bag_address_id: latitude === null ? null : asString(data.bag_address_id) || null,
      region: asString(data.region) || null,
      is_active_customer_object: false,
      show_on_mobile_map: false,
      mobile_map_priority: 0,
      version: 1,
    });
    const racedCode = await objectCodeExists(base44, objectCode, object.id, objectCodeReservation);
    if (racedCode) {
      try {
        await getEntity(base44, 'SurveillanceObject').delete(object.id);
      } catch (error) {
        console.error('[customerPlatformApi] duplicate object code rollback failed', object.id, error);
        throw new ApiError(500, 'Dubbele objectcode kon niet veilig worden teruggedraaid', {
          object_id: object.id,
          duplicate_object_id: racedCode.id,
          object_code: objectCode,
        });
      }
      throw new ApiError(409, 'Objectcode is gelijktijdig door een ander object vastgelegd', {
        duplicate_object_id: racedCode.id,
        object_code: objectCode,
        retryable: false,
      });
    }
    await markCustomerFirstObject(base44, reservedCustomer);
    return {
      object: customerObjectResponseRecord(object),
      customer_id: customerId,
      resource_type: 'SurveillanceObject',
      resource_id: object.id,
      category: 'operations',
    };
  } finally {
    try {
      await releaseGlobalObjectCodeMutation(base44, objectCodeReservation);
    } catch (error) {
      console.error('[customerPlatformApi] object code mutation lock release failed', customerId, error);
    }
    try {
      await releaseCustomerObjectCreation(base44, customerId, reservationOwner);
    } catch (error) {
      console.error('[customerPlatformApi] object creation reservation release failed', customerId, error);
    }
  }
}

async function handleUpdateCustomerObjectIdentity(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const { object } = await requireCustomerObjectForMutation(base44, body);
  if (object.status === 'archived') {
    throw new ApiError(409, 'Gearchiveerd object moet eerst worden hersteld');
  }
  const requested = pick(requireObject(body), OBJECT_IDENTITY_PATCH_FIELDS);
  const changedInput = Object.fromEntries(Object.entries(requested).filter(([field, value]) =>
    JSON.stringify(canonicalMutationValue(object[field])) !== JSON.stringify(canonicalMutationValue(value))));
  if (!Object.keys(changedInput).length) throw new ApiError(400, 'Er zijn geen gewijzigde objectgegevens om op te slaan');
  const normalizedPatch = objectIdentityPatch(changedInput, object);
  const patch = Object.fromEntries(Object.entries(normalizedPatch).filter(([field, value]) =>
    JSON.stringify(canonicalMutationValue(object[field])) !== JSON.stringify(canonicalMutationValue(value))));
  if (!Object.keys(patch).length) throw new ApiError(400, 'Er zijn geen gewijzigde objectgegevens om op te slaan');
  const changesObjectCode = Object.prototype.hasOwnProperty.call(patch, 'object_code');
  const objectCodeReservation = changesObjectCode
    ? await reserveGlobalObjectCodeMutation(base44, user, idempotencyKey, target)
    : null;
  try {
    if (changesObjectCode) {
      const duplicateCode = await objectCodeExists(base44, patch.object_code, object.id, objectCodeReservation);
      if (duplicateCode) {
        throw new ApiError(409, 'Objectcode is al in gebruik', {
          duplicate_object_id: duplicateCode.id,
          object_code: patch.object_code,
        });
      }
    }
    const projected = { ...object, ...patch, version: expectedVersion + 1 };
    const changes = objectIdentityChanges(object, projected, Object.keys(patch));
    const prepared = await customerObjectPatchWithRecovery({
      object,
      patch,
      expectedVersion,
      user,
      action: 'update_customer_object_identity',
      idempotencyKey,
      requestFingerprint,
      target,
      extraResult: {
        changes,
        summary: 'Objectgegevens gewijzigd',
        outcome: 'success',
      },
    });
    if (changesObjectCode) await assertGlobalObjectCodeMutation(base44, objectCodeReservation);
    const updated = await casUpdate(base44, 'SurveillanceObject', object, expectedVersion, prepared.patch);
    if (changesObjectCode) {
      const racedCode = await objectCodeExists(base44, updated.object_code, updated.id, objectCodeReservation);
      if (racedCode) {
        await rollbackRejectedObjectCodeMutation(base44, updated, object, updated.object_code, idempotencyKey);
        throw new ApiError(409, 'Objectcode is buiten de applicatie gelijktijdig door een ander object vastgelegd', {
          duplicate_object_id: racedCode.id,
          object_code: updated.object_code,
          retryable: false,
        });
      }
    }
    return customerObjectMutationResult(updated, prepared.changedFields, {
      changes,
      summary: 'Objectgegevens gewijzigd',
      outcome: 'success',
    });
  } finally {
    try {
      await releaseGlobalObjectCodeMutation(base44, objectCodeReservation);
    } catch (error) {
      console.error('[customerPlatformApi] object code mutation lock release failed', object.id, error);
    }
  }
}

async function handleUpdateCustomerObjectOperations(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const { object } = await requireCustomerObjectForMutation(base44, body);
  if (object.status === 'archived') {
    throw new ApiError(409, 'Gearchiveerd object moet eerst worden hersteld');
  }
  const patch = objectOperationsPatch(requireObject(body), object);
  const prepared = await customerObjectPatchWithRecovery({
    object,
    patch,
    expectedVersion,
    user,
    action: 'update_customer_object_operations',
    idempotencyKey,
    requestFingerprint,
    target,
  });
  const updated = await casUpdate(base44, 'SurveillanceObject', object, expectedVersion, prepared.patch);
  // Bewust alleen een samenvatting: instructies en notities komen niet in recovery of CustomerEvent.payload.
  return customerObjectMutationResult(updated, prepared.changedFields);
}

async function handleSetCustomerObjectStatus(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
) {
  const { object } = await requireCustomerObjectForMutation(base44, body);
  const current = objectLifecycleStatus(object);
  const requested = requireString(body, 'status');
  validateTransition(OBJECT_STATUS_TRANSITIONS, current, requested, 'Object');
  const reason = asString(body.reason);
  if (requested === 'archived' && !reason) throw new ApiError(400, 'Reden voor archiveren is verplicht');
  if (reason.length > 1_000) throw new ApiError(400, 'Reden mag maximaal 1000 tekens bevatten');

  const patch: LooseRecord = {
    status: requested,
    is_active_customer_object: requested === 'active',
  };
  if (requested !== 'active') patch.show_on_mobile_map = false;
  if (requested === 'archived') {
    patch.archived_at = nowIso();
    patch.archived_by_user_id = user.id;
    patch.archive_reason = reason;
  } else if (current === 'archived') {
    patch.archived_at = null;
    patch.archived_by_user_id = null;
    patch.archive_reason = null;
  }
  const transition = {
    from: current,
    to: requested,
    reason: reason || null,
  };
  const prepared = await customerObjectPatchWithRecovery({
    object,
    patch,
    expectedVersion,
    user,
    action: 'set_customer_object_status',
    idempotencyKey,
    requestFingerprint,
    target,
    extraResult: { transition },
  });
  const updated = await casUpdate(base44, 'SurveillanceObject', object, expectedVersion, prepared.patch);
  return customerObjectMutationResult(updated, prepared.changedFields, { transition });
}

async function handleCustomerAccount(
  base44: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  mode: 'create' | 'update' | 'archive',
) {
  if (mode === 'create') {
    if (expectedVersion !== 0) throw new ApiError(409, 'Nieuw record verwacht expected_version 0');
    const data = requireObject(body);
    const customer = await requireRecord(base44, 'Customer', requireString(body, 'customer_id'), 'Klant');
    const company = await requireRecord(base44, 'Company', requireString(data, 'company_id'), 'Bedrijf');
    if (company.status && company.status !== 'active') throw new ApiError(409, 'Bedrijf is niet actief');
    const existing = await getEntity(base44, 'CustomerAccount').filter({
      customer_id: customer.id,
      company_id: company.id,
      status: { $ne: 'archived' },
    }, '-updated_date', 20);
    if (existing.length) throw new ApiError(409, 'Deze klant heeft al een bedrijfsrelatie met de BV');
    await ensurePrimaryInvariant(base44, 'CustomerAccount', customer.id, Boolean(data.is_primary));
    const account = await getEntity(base44, 'CustomerAccount').create({
      customer_id: customer.id,
      company_id: company.id,
      ...pick(data, ACCOUNT_PATCH_FIELDS),
      status: data.status || 'active',
      is_primary: Boolean(data.is_primary),
      currency: data.currency || 'EUR',
      payment_term_days: Number(data.payment_term_days ?? 30),
      billing_frequency: data.billing_frequency || 'monthly',
      invoice_delivery_method: data.invoice_delivery_method || 'email',
      peppol_required: Boolean(data.peppol_required),
      allow_email_fallback: data.peppol_required ? Boolean(data.allow_email_fallback) : data.allow_email_fallback !== false,
      finance_hold: Boolean(data.finance_hold),
      dunning_profile: data.dunning_profile || 'b2b_standard',
      version: 1,
    });
    await syncLegacyMirrors(base44, customer.id);
    return { account, customer_id: customer.id, resource_type: 'CustomerAccount', resource_id: account.id };
  }
  const account = await requireRecord(base44, 'CustomerAccount', requireString(body, 'customer_account_id'), 'Klantrelatie');
  if (mode === 'archive') {
    const updated = await casUpdate(base44, 'CustomerAccount', account, expectedVersion, {
      status: 'archived',
      archived_at: nowIso(),
      finance_hold: true,
      finance_hold_reason: asString(body.reason) || 'Klantrelatie gearchiveerd',
    });
    await syncLegacyMirrors(base44, account.customer_id);
    return { account: updated, resource_type: 'CustomerAccount', resource_id: updated.id };
  }
  if (account.status === 'archived') throw new ApiError(409, 'Gearchiveerde klantrelatie kan niet worden gewijzigd');
  const data = requireObject(body);
  await ensurePrimaryInvariant(base44, 'CustomerAccount', account.customer_id, Boolean(data.is_primary), account.id);
  const updated = await casUpdate(base44, 'CustomerAccount', account, expectedVersion, pick(data, ACCOUNT_PATCH_FIELDS));
  await syncLegacyMirrors(base44, account.customer_id);
  return { account: updated, resource_type: 'CustomerAccount', resource_id: updated.id };
}

async function handleCustomerAddress(
  base44: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  mode: 'create' | 'update' | 'archive',
) {
  if (mode === 'create') {
    if (expectedVersion !== 0) throw new ApiError(409, 'Nieuw record verwacht expected_version 0');
    const data = requireObject(body);
    const customerId = requireString(body, 'customer_id');
    await requireRecord(base44, 'Customer', customerId, 'Klant');
    await ensurePrimaryInvariant(
      base44,
      'CustomerAddress',
      customerId,
      Boolean(data.is_primary),
      undefined,
      { address_type: data.address_type || 'visiting' },
    );
    if (data.customer_account_id) {
      const account = await requireRecord(base44, 'CustomerAccount', data.customer_account_id, 'Klantrelatie');
      if (account.customer_id !== customerId) throw new ApiError(409, 'Klantrelatie hoort bij een andere klant');
    }
    const address = await getEntity(base44, 'CustomerAddress').create({
      customer_id: customerId,
      ...pick(data, ADDRESS_PATCH_FIELDS),
      address_type: data.address_type || 'visiting',
      is_primary: Boolean(data.is_primary),
      status: data.status || 'active',
      country_code: data.country_code || 'NL',
      country_name: data.country_name || 'Nederland',
      version: 1,
    });
    await syncLegacyMirrors(base44, customerId);
    return { address, resource_type: 'CustomerAddress', resource_id: address.id };
  }
  const address = await requireRecord(base44, 'CustomerAddress', requireString(body, 'address_id'), 'Adres');
  if (mode === 'archive') {
    const updated = await casUpdate(base44, 'CustomerAddress', address, expectedVersion, {
      status: 'archived',
      is_primary: false,
    });
    await syncLegacyMirrors(base44, address.customer_id);
    return { address: updated, resource_type: 'CustomerAddress', resource_id: updated.id };
  }
  const data = requireObject(body);
  if (Object.prototype.hasOwnProperty.call(data, 'customer_account_id')) {
    if (data.customer_account_id) {
      const account = await requireRecord(base44, 'CustomerAccount', data.customer_account_id, 'Klantrelatie');
      if (account.customer_id !== address.customer_id) {
        throw new ApiError(409, 'Klantrelatie hoort bij een andere klant');
      }
    } else {
      data.customer_account_id = null;
    }
  }
  await ensurePrimaryInvariant(
    base44,
    'CustomerAddress',
    address.customer_id,
    Boolean(data.is_primary),
    address.id,
    { address_type: data.address_type || address.address_type },
  );
  const updated = await casUpdate(base44, 'CustomerAddress', address, expectedVersion, pick(data, ADDRESS_PATCH_FIELDS));
  await syncLegacyMirrors(base44, address.customer_id);
  return { address: updated, resource_type: 'CustomerAddress', resource_id: updated.id };
}

async function handleCustomerContact(
  base44: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  mode: 'create' | 'update' | 'archive',
) {
  if (mode === 'create') {
    if (expectedVersion !== 0) throw new ApiError(409, 'Nieuw record verwacht expected_version 0');
    const data = requireObject(body);
    const customerId = requireString(body, 'customer_id');
    await requireRecord(base44, 'Customer', customerId, 'Klant');
    await ensurePrimaryInvariant(base44, 'CustomerContact', customerId, Boolean(data.is_primary));
    const displayName = asString(data.display_name);
    if (!displayName) throw new ApiError(400, 'display_name is verplicht');
    const contact = await getEntity(base44, 'CustomerContact').create({
      customer_id: customerId,
      ...pick(data, CONTACT_PATCH_FIELDS),
      display_name: displayName,
      is_primary: Boolean(data.is_primary),
      status: data.status || 'active',
      preferred_language: data.preferred_language || 'nl',
      preferred_channel: data.preferred_channel || 'email',
      version: 1,
    });
    await syncLegacyMirrors(base44, customerId);
    return { contact, resource_type: 'CustomerContact', resource_id: contact.id };
  }
  const contact = await requireRecord(base44, 'CustomerContact', requireString(body, 'contact_id'), 'Contactpersoon');
  if (mode === 'archive') {
    const updated = await casUpdate(base44, 'CustomerContact', contact, expectedVersion, {
      status: 'archived',
      is_primary: false,
    });
    await syncLegacyMirrors(base44, contact.customer_id);
    return { contact: updated, resource_type: 'CustomerContact', resource_id: updated.id };
  }
  const data = requireObject(body);
  await ensurePrimaryInvariant(base44, 'CustomerContact', contact.customer_id, Boolean(data.is_primary), contact.id);
  if (Object.prototype.hasOwnProperty.call(data, 'display_name') && !asString(data.display_name)) {
    throw new ApiError(400, 'display_name mag niet leeg zijn');
  }
  const updated = await casUpdate(base44, 'CustomerContact', contact, expectedVersion, pick(data, CONTACT_PATCH_FIELDS));
  await syncLegacyMirrors(base44, contact.customer_id);
  return { contact: updated, resource_type: 'CustomerContact', resource_id: updated.id };
}

async function handleContactPoint(
  base44: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  mode: 'create' | 'update' | 'archive',
) {
  if (mode === 'create') {
    if (expectedVersion !== 0) throw new ApiError(409, 'Nieuw record verwacht expected_version 0');
    const data = requireObject(body);
    const contact = await requireRecord(base44, 'CustomerContact', requireString(body, 'contact_id'), 'Contactpersoon');
    const value = asString(data.value);
    if (!value) throw new ApiError(400, 'value is verplicht');
    if (!['email', 'phone', 'mobile', 'other'].includes(data.point_type)) throw new ApiError(400, 'Ongeldig contactkanaal');
    const point = await getEntity(base44, 'CustomerContactPoint').create({
      customer_id: contact.customer_id,
      contact_id: contact.id,
      ...pick(data, CONTACT_POINT_PATCH_FIELDS),
      value,
      normalized_value: data.point_type === 'email' ? normalizeEmail(value) : normalizePhone(value),
      is_primary: Boolean(data.is_primary),
      purposes: data.purposes || [],
      status: data.status || 'active',
      consent_status: data.consent_status || 'not_required',
      version: 1,
    });
    await syncLegacyMirrors(base44, contact.customer_id);
    return { contact_point: point, resource_type: 'CustomerContactPoint', resource_id: point.id };
  }
  const point = await requireRecord(base44, 'CustomerContactPoint', requireString(body, 'contact_point_id'), 'Contactkanaal');
  if (mode === 'archive') {
    const updated = await casUpdate(base44, 'CustomerContactPoint', point, expectedVersion, {
      status: 'archived',
      is_primary: false,
    });
    await syncLegacyMirrors(base44, point.customer_id);
    return { contact_point: updated, resource_type: 'CustomerContactPoint', resource_id: updated.id };
  }
  const data = requireObject(body);
  const patch = pick(data, CONTACT_POINT_PATCH_FIELDS);
  if (Object.prototype.hasOwnProperty.call(patch, 'value')) {
    if (!asString(patch.value)) throw new ApiError(400, 'value mag niet leeg zijn');
    const pointType = patch.point_type || point.point_type;
    patch.normalized_value = pointType === 'email' ? normalizeEmail(patch.value) : normalizePhone(patch.value);
  }
  const updated = await casUpdate(base44, 'CustomerContactPoint', point, expectedVersion, patch);
  await syncLegacyMirrors(base44, point.customer_id);
  return { contact_point: updated, resource_type: 'CustomerContactPoint', resource_id: updated.id };
}

async function validateRoleObjects(base44: LooseRecord, customerId: string, objectIds: unknown) {
  const ids = Array.isArray(objectIds) ? [...new Set(objectIds.map(asString).filter(Boolean))] : [];
  if (ids.length > 250) throw new ApiError(400, 'Te veel objecten in één contactrol');
  for (const id of ids) {
    const object = await requireRecord(base44, 'SurveillanceObject', id, 'Object');
    if (object.customer_id !== customerId) throw new ApiError(409, 'Objectscope bevat een object van een andere klant');
  }
  return ids;
}

async function validateCustomerScope(
  base44: LooseRecord,
  customerId: string,
  input: LooseRecord,
  scopeType?: unknown,
) {
  const objectId = asString(input.object_id) || null;
  const collectiveId = asString(input.collective_id) || null;
  if (objectId && collectiveId) {
    throw new ApiError(400, 'Een regel kan niet tegelijk aan een object en een collectief zijn gekoppeld');
  }
  if (objectId) {
    const object = await requireRecord(base44, 'SurveillanceObject', objectId, 'Object');
    if (object.customer_id !== customerId) {
      throw new ApiError(409, 'Object hoort bij een andere klant');
    }
  }
  if (collectiveId) {
    const collective = await requireRecord(base44, 'Collectief', collectiveId, 'Collectief');
    if (collective.customer_id !== customerId) {
      throw new ApiError(409, 'Collectief hoort bij een andere klant');
    }
  }
  if (scopeType != null) {
    const normalizedScope = asString(scopeType);
    if (!['customer', 'object', 'collective'].includes(normalizedScope)) {
      throw new ApiError(400, 'Ongeldig scope_type');
    }
    if (normalizedScope === 'customer' && (objectId || collectiveId)) {
      throw new ApiError(400, 'Een klantbrede regel mag geen object- of collectiefkoppeling bevatten');
    }
    if (normalizedScope === 'object' && !objectId) {
      throw new ApiError(400, 'Een objectregel vereist object_id');
    }
    if (normalizedScope === 'collective' && !collectiveId) {
      throw new ApiError(400, 'Een collectiefregel vereist collective_id');
    }
  }
  return { object_id: objectId, collective_id: collectiveId };
}

async function handleContactRole(
  base44: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  mode: 'create' | 'update' | 'archive',
) {
  if (mode === 'create') {
    if (expectedVersion !== 0) throw new ApiError(409, 'Nieuw record verwacht expected_version 0');
    const data = requireObject(body);
    const contact = await requireRecord(base44, 'CustomerContact', requireString(body, 'contact_id'), 'Contactpersoon');
    const objectIds = await validateRoleObjects(base44, contact.customer_id, data.object_ids);
    if (data.customer_account_id) {
      const account = await requireRecord(base44, 'CustomerAccount', data.customer_account_id, 'Klantrelatie');
      if (account.customer_id !== contact.customer_id) throw new ApiError(409, 'Klantrelatie hoort bij een andere klant');
    }
    const role = await getEntity(base44, 'CustomerContactRole').create({
      customer_id: contact.customer_id,
      contact_id: contact.id,
      ...pick(data, CONTACT_ROLE_PATCH_FIELDS),
      role: requireString(data, 'role'),
      object_ids: objectIds,
      is_primary: Boolean(data.is_primary),
      status: data.status || 'active',
      version: 1,
    });
    return { contact_role: role, resource_type: 'CustomerContactRole', resource_id: role.id };
  }
  const role = await requireRecord(base44, 'CustomerContactRole', requireString(body, 'contact_role_id'), 'Contactrol');
  if (mode === 'archive') {
    const updated = await casUpdate(base44, 'CustomerContactRole', role, expectedVersion, {
      status: 'archived',
      is_primary: false,
    });
    return { contact_role: updated, resource_type: 'CustomerContactRole', resource_id: updated.id };
  }
  const data = requireObject(body);
  const patch = pick(data, CONTACT_ROLE_PATCH_FIELDS);
  if (Object.prototype.hasOwnProperty.call(data, 'customer_account_id')) {
    if (data.customer_account_id) {
      const account = await requireRecord(base44, 'CustomerAccount', data.customer_account_id, 'Klantrelatie');
      if (account.customer_id !== role.customer_id) {
        throw new ApiError(409, 'Klantrelatie hoort bij een andere klant');
      }
    } else {
      patch.customer_account_id = null;
    }
  }
  if (Object.prototype.hasOwnProperty.call(data, 'object_ids')) {
    patch.object_ids = await validateRoleObjects(base44, role.customer_id, data.object_ids);
  }
  const updated = await casUpdate(base44, 'CustomerContactRole', role, expectedVersion, patch);
  return { contact_role: updated, resource_type: 'CustomerContactRole', resource_id: updated.id };
}

async function handleCustomerRequest(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
  mode: 'create' | 'transition',
) {
  if (mode === 'create') {
    if (expectedVersion !== 0) throw new ApiError(409, 'Nieuw record verwacht expected_version 0');
    const data = requireObject(body);
    const customer = await requireRecord(base44, 'Customer', requireString(body, 'customer_id'), 'Klant');
    const account = await requireRecord(base44, 'CustomerAccount', requireString(data, 'customer_account_id'), 'Klantrelatie');
    if (account.customer_id !== customer.id) throw new ApiError(409, 'Klantrelatie hoort bij een andere klant');
    const scope = await validateCustomerScope(base44, customer.id, data);
    const request = await getEntity(base44, 'CustomerRequest').create({
      company_id: account.company_id,
      customer_id: customer.id,
      customer_account_id: account.id,
      object_id: scope.object_id,
      request_number: data.request_number || null,
      request_type: requireString(data, 'request_type'),
      title: requireString(data, 'title'),
      description: data.description || null,
      status: data.status || 'draft',
      priority: data.priority || 'normal',
      requested_for: data.requested_for || null,
      source: data.source || 'backoffice',
      submitted_by_user_id: data.status === 'submitted' ? user.id : null,
      submitted_at: data.status === 'submitted' ? nowIso() : null,
      version: 1,
      metadata: { ...(data.metadata || {}), idempotency_key: idempotencyKey },
    });
    return { request, resource_type: 'CustomerRequest', resource_id: request.id };
  }
  const request = await requireRecord(base44, 'CustomerRequest', requireString(body, 'request_id'), 'Aanvraag');
  const status = requireString(body, 'status');
  validateTransition(REQUEST_TRANSITIONS, request.status, status, 'Aanvraag');
  const patch: LooseRecord = { status };
  if (status === 'submitted') {
    patch.submitted_by_user_id = user.id;
    patch.submitted_at = nowIso();
  }
  if (['accepted', 'rejected'].includes(status)) {
    patch.reviewed_by_user_id = user.id;
    patch.reviewed_at = nowIso();
    patch.decision_reason = asString(body.reason) || null;
  }
  if (status === 'scheduled') {
    patch.planned_task_id = requireString(body, 'planned_task_id');
  }
  const updated = await casUpdate(base44, 'CustomerRequest', request, expectedVersion, patch);
  return { request: updated, resource_type: 'CustomerRequest', resource_id: updated.id };
}

function normalizedQuoteLine(data: LooseRecord): LooseRecord {
  const quantityMinor = requireInteger(data.quantity_minor, 'quantity_minor', 0);
  const unitPriceCents = requireInteger(data.unit_price_cents, 'unit_price_cents', 0);
  const discountBasisPoints = requireInteger(data.discount_basis_points ?? 0, 'discount_basis_points', 0);
  const vatRateBasisPoints = requireInteger(data.vat_rate_basis_points ?? 2100, 'vat_rate_basis_points', 0);
  if (discountBasisPoints > 10000 || vatRateBasisPoints > 10000) {
    throw new ApiError(400, 'Percentage in basispunten mag niet boven 10000 liggen');
  }
  const gross = calculateAmounts(quantityMinor, unitPriceCents, 0).subtotal_cents;
  const discount = roundHalfUp((gross * discountBasisPoints) / 10000);
  const subtotal = gross - discount;
  const tax = roundHalfUp((subtotal * vatRateBasisPoints) / 10000);
  return {
    ...data,
    quantity_minor: quantityMinor,
    unit_price_cents: unitPriceCents,
    discount_basis_points: discountBasisPoints,
    vat_rate_basis_points: vatRateBasisPoints,
    subtotal_cents: subtotal,
    tax_cents: tax,
    total_cents: subtotal + tax,
  };
}

async function recalculateQuoteTotals(base44: LooseRecord, quoteId: string) {
  const lines = await getEntity(base44, 'CustomerQuoteLine').filter({ quote_id: quoteId }, '+sequence', 1000);
  const subtotal = lines.reduce((sum: number, line: LooseRecord) => sum + Number(line.subtotal_cents || 0), 0);
  const tax = lines.reduce((sum: number, line: LooseRecord) => sum + Number(line.tax_cents || 0), 0);
  const taxMap = new Map<number, LooseRecord>();
  for (const line of lines) {
    const rate = Number(line.vat_rate_basis_points || 0);
    const row = taxMap.get(rate) || { vat_rate_basis_points: rate, taxable_cents: 0, tax_cents: 0 };
    row.taxable_cents += Number(line.subtotal_cents || 0);
    row.tax_cents += Number(line.tax_cents || 0);
    taxMap.set(rate, row);
  }
  const quote = await casUpdateLatest(base44, 'CustomerQuote', quoteId, {
    subtotal_cents: subtotal,
    discount_cents: 0,
    tax_total_cents: tax,
    total_cents: subtotal + tax,
    tax_summary: [...taxMap.values()],
  });
  return { quote, lines };
}

async function handleCreateQuote(
  base44: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
) {
  if (expectedVersion !== 0) throw new ApiError(409, 'Nieuwe offerte verwacht expected_version 0');
  const existingQuotes = await getEntity(base44, 'CustomerQuote').filter({ idempotency_key: idempotencyKey }, '-created_date', 1);
  if (existingQuotes.length) {
    const lines = await getEntity(base44, 'CustomerQuoteLine').filter({ quote_id: existingQuotes[0].id }, '+sequence', 1000);
    return { quote: existingQuotes[0], lines, replayed: true, recovered_partial_creation: true, resource_type: 'CustomerQuote', resource_id: existingQuotes[0].id, category: 'commercial' };
  }
  const data = requireObject(body);
  const customerId = requireString(body, 'customer_id');
  const account = await requireRecord(base44, 'CustomerAccount', requireString(data, 'customer_account_id'), 'Klantrelatie');
  if (account.customer_id !== customerId) throw new ApiError(409, 'Klantrelatie hoort bij een andere klant');
  await assertCommercialFeature(base44, account.company_id);
  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  if (rawLines.length > 500) throw new ApiError(400, 'Maximaal 500 offerteregels');
  const preparedLines = await Promise.all(rawLines.map(async (raw: LooseRecord) => {
    const line = normalizedQuoteLine(raw);
    const scope = await validateCustomerScope(base44, customerId, line);
    return { ...line, ...scope };
  }));
  const snapshots = await loadBillingSnapshots(base44, account.company_id, customerId, account.id);
  const quote = await getEntity(base44, 'CustomerQuote').create({
    company_id: account.company_id,
    customer_id: customerId,
    customer_account_id: account.id,
    quote_number: null,
    number_reservation_id: null,
    version: 1,
    document_version: 1,
    supersedes_quote_id: null,
    status: 'draft',
    title: requireString(data, 'title'),
    description: data.description || null,
    currency: data.currency || account.currency || 'EUR',
    issue_date: data.issue_date ? dateOnly(data.issue_date) : null,
    valid_until: data.valid_until ? dateOnly(data.valid_until) : null,
    customer_reference: data.customer_reference || null,
    customer_snapshot: snapshots.customer_snapshot,
    company_snapshot: snapshots.company_snapshot,
    billing_address_snapshot: snapshots.billing_address_snapshot,
    subtotal_cents: 0,
    discount_cents: 0,
    tax_total_cents: 0,
    total_cents: 0,
    tax_summary: [],
    template_id: data.template_id || null,
    document_managed_file_id: data.document_managed_file_id || null,
    idempotency_key: idempotencyKey,
    metadata: data.metadata || null,
  });
  if (preparedLines.length) {
    await getEntity(base44, 'CustomerQuoteLine').bulkCreate(preparedLines.map((line: LooseRecord, index: number) => {
      return {
        quote_id: quote.id,
        company_id: quote.company_id,
        customer_id: quote.customer_id,
        customer_account_id: quote.customer_account_id,
        sequence: line.sequence ?? index + 1,
        line_type: line.line_type || 'service',
        service_code: line.service_code || null,
        object_id: line.object_id || null,
        collective_id: line.collective_id || null,
        description: requireString(line, 'description'),
        quantity_minor: line.quantity_minor,
        unit: line.unit || 'each',
        unit_price_cents: line.unit_price_cents,
        discount_basis_points: line.discount_basis_points,
        vat_rate_basis_points: line.vat_rate_basis_points,
        subtotal_cents: line.subtotal_cents,
        tax_cents: line.tax_cents,
        total_cents: line.total_cents,
        valid_from: line.valid_from ? dateOnly(line.valid_from) : null,
        valid_until: line.valid_until ? dateOnly(line.valid_until) : null,
        version: 1,
        metadata: line.metadata || null,
      };
    }));
  }
  const recalculated = await recalculateQuoteTotals(base44, quote.id);
  return {
    quote: recalculated.quote,
    lines: recalculated.lines,
    resource_type: 'CustomerQuote',
    resource_id: quote.id,
    category: 'commercial',
  };
}

async function handleUpdateQuote(base44: LooseRecord, body: LooseRecord, expectedVersion: number) {
  const quote = await requireRecord(base44, 'CustomerQuote', requireString(body, 'quote_id'), 'Offerte');
  if (!['draft', 'review'].includes(quote.status)) {
    throw new ApiError(409, 'Na goedkeuring of verzending maakt een wijziging een nieuwe offerteversie');
  }
  const data = requireObject(body);
  const updated = await casUpdate(base44, 'CustomerQuote', quote, expectedVersion, pick(data, QUOTE_PATCH_FIELDS));
  return { quote: updated, resource_type: 'CustomerQuote', resource_id: updated.id, category: 'commercial' };
}

async function handleQuoteLine(
  base44: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  mode: 'create' | 'update' | 'delete',
) {
  if (mode === 'create') {
    if (expectedVersion !== 0) throw new ApiError(409, 'Nieuwe offerteregel verwacht expected_version 0');
    const quote = await requireRecord(base44, 'CustomerQuote', requireString(body, 'quote_id'), 'Offerte');
    if (!['draft', 'review'].includes(quote.status)) throw new ApiError(409, 'Offerte is onveranderlijk in deze status');
    const data = normalizedQuoteLine(requireObject(body));
    const scope = await validateCustomerScope(base44, quote.customer_id, data);
    const line = await getEntity(base44, 'CustomerQuoteLine').create({
      quote_id: quote.id,
      company_id: quote.company_id,
      customer_id: quote.customer_id,
      customer_account_id: quote.customer_account_id,
      ...pick(data, QUOTE_LINE_PATCH_FIELDS),
      ...scope,
      sequence: data.sequence ?? 1,
      line_type: data.line_type || 'service',
      description: requireString(data, 'description'),
      unit: data.unit || 'each',
      subtotal_cents: data.subtotal_cents,
      tax_cents: data.tax_cents,
      total_cents: data.total_cents,
      version: 1,
    });
    const totals = await recalculateQuoteTotals(base44, quote.id);
    return { quote: totals.quote, quote_line: line, resource_type: 'CustomerQuoteLine', resource_id: line.id, category: 'commercial' };
  }
  const line = await requireRecord(base44, 'CustomerQuoteLine', requireString(body, 'quote_line_id'), 'Offerteregel');
  const quote = await requireRecord(base44, 'CustomerQuote', line.quote_id, 'Offerte');
  if (!['draft', 'review'].includes(quote.status)) throw new ApiError(409, 'Offerte is onveranderlijk in deze status');
  if (mode === 'delete') {
    if (versionOf(line) !== expectedVersion) throw new ApiError(409, 'Offerteregel is intussen gewijzigd');
    await getEntity(base44, 'CustomerQuoteLine').delete(line.id);
    const totals = await recalculateQuoteTotals(base44, quote.id);
    return { quote: totals.quote, deleted_quote_line_id: line.id, customer_id: quote.customer_id, resource_type: 'CustomerQuoteLine', resource_id: line.id, category: 'commercial' };
  }
  const data = normalizedQuoteLine({ ...line, ...pick(requireObject(body), QUOTE_LINE_PATCH_FIELDS) });
  const scope = await validateCustomerScope(base44, quote.customer_id, data);
  const updated = await casUpdate(base44, 'CustomerQuoteLine', line, expectedVersion, {
    ...pick(data, QUOTE_LINE_PATCH_FIELDS),
    ...scope,
    subtotal_cents: data.subtotal_cents,
    tax_cents: data.tax_cents,
    total_cents: data.total_cents,
  });
  const totals = await recalculateQuoteTotals(base44, quote.id);
  return { quote: totals.quote, quote_line: updated, resource_type: 'CustomerQuoteLine', resource_id: updated.id, category: 'commercial' };
}

async function handleReviseQuote(
  base44: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
) {
  const source = await requireRecord(base44, 'CustomerQuote', requireString(body, 'quote_id'), 'Offerte');
  if (versionOf(source) !== expectedVersion) throw new ApiError(409, 'Offerte is intussen gewijzigd');
  if (!['sent', 'rejected', 'expired', 'withdrawn'].includes(source.status)) {
    throw new ApiError(409, 'Alleen een verzonden of afgesloten offerte kan een nieuwe versie krijgen');
  }
  const existing = await getEntity(base44, 'CustomerQuote').filter({ idempotency_key: idempotencyKey }, '-created_date', 1);
  if (existing.length) return { quote: existing[0], replayed: true, resource_type: 'CustomerQuote', resource_id: existing[0].id, category: 'commercial' };
  const override = body.data && typeof body.data === 'object' ? body.data : {};
  const quote = await getEntity(base44, 'CustomerQuote').create({
    company_id: source.company_id,
    customer_id: source.customer_id,
    customer_account_id: source.customer_account_id,
    quote_number: source.quote_number,
    number_reservation_id: source.number_reservation_id,
    version: 1,
    document_version: Number(source.document_version || 1) + 1,
    supersedes_quote_id: source.id,
    status: 'draft',
    ...pick({ ...source, ...override }, QUOTE_PATCH_FIELDS),
    document_managed_file_id: null,
    document_signature_id: null,
    reviewed_by_user_id: null,
    reviewed_at: null,
    sent_at: null,
    accepted_at: null,
    rejected_at: null,
    decision_note: null,
    converted_contract_id: null,
    idempotency_key: idempotencyKey,
    metadata: { ...(source.metadata || {}), ...(override.metadata || {}), revised_from_quote_id: source.id },
  });
  const sourceLines = await getEntity(base44, 'CustomerQuoteLine').filter({ quote_id: source.id }, '+sequence', 1000);
  if (sourceLines.length) {
    await getEntity(base44, 'CustomerQuoteLine').bulkCreate(sourceLines.map((line: LooseRecord) => ({
      ...pick(line, QUOTE_LINE_PATCH_FIELDS),
      quote_id: quote.id,
      company_id: quote.company_id,
      customer_id: quote.customer_id,
      customer_account_id: quote.customer_account_id,
      subtotal_cents: line.subtotal_cents,
      tax_cents: line.tax_cents,
      total_cents: line.total_cents,
      version: 1,
    })));
  }
  const totals = await recalculateQuoteTotals(base44, quote.id);
  return { quote: totals.quote, lines: totals.lines, resource_type: 'CustomerQuote', resource_id: quote.id, category: 'commercial' };
}

async function handleTransitionQuote(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
) {
  const quote = await requireRecord(base44, 'CustomerQuote', requireString(body, 'quote_id'), 'Offerte');
  const status = requireString(body, 'status');
  validateTransition(QUOTE_TRANSITIONS, quote.status, status, 'Offerte');
  if (status === 'converted') throw new ApiError(409, 'Gebruik convert_quote om een offerte om te zetten');
  const patch: LooseRecord = { status };
  let reservation: LooseRecord | null = null;
  if (status === 'approved') {
    const lines = await getEntity(base44, 'CustomerQuoteLine').filter({ quote_id: quote.id }, '+sequence', 1);
    if (!lines.length) throw new ApiError(409, 'Offerte heeft geen regels');
    patch.reviewed_by_user_id = user.id;
    patch.reviewed_at = nowIso();
  }
  if (status === 'sent') {
    if (!quote.document_managed_file_id) throw new ApiError(409, 'Een definitief offertedocument ontbreekt');
    const issueDate = quote.issue_date || todayIso();
    if (!quote.valid_until || quote.valid_until < issueDate) throw new ApiError(409, 'Offertegeldigheid ontbreekt of is verlopen');
    if (!quote.quote_number) {
      reservation = await reserveCommercialNumber(base44, {
        companyId: quote.company_id,
        documentType: 'quote',
        fiscalYear: Number(issueDate.slice(0, 4)),
        idempotencyKey: `${idempotencyKey}:number`,
        resourceType: 'CustomerQuote',
        resourceId: quote.id,
      });
      patch.quote_number = reservation.formatted_number;
      patch.number_reservation_id = reservation.id;
    }
    patch.issue_date = issueDate;
    patch.sent_at = nowIso();
  }
  if (status === 'accepted') patch.accepted_at = nowIso();
  if (status === 'rejected') {
    patch.rejected_at = nowIso();
    patch.decision_note = asString(body.reason) || null;
  }
  if (['expired', 'withdrawn'].includes(status)) patch.decision_note = asString(body.reason) || null;
  const updated = await casUpdate(base44, 'CustomerQuote', quote, expectedVersion, patch);
  if (reservation) await markReservation(base44, reservation, 'issued');
  return { quote: updated, resource_type: 'CustomerQuote', resource_id: updated.id, category: 'commercial' };
}

function quoteUnitToContract(unit: string) {
  if (unit === 'minute') return { billing_model: 'per_minute', rate_unit: 'minute' };
  if (unit === 'hour') return { billing_model: 'per_hour', rate_unit: 'hour' };
  if (unit === 'kilometer') return { billing_model: 'per_kilometer', rate_unit: 'kilometer' };
  if (unit === 'fixed' || ['day', 'week', 'month', 'year'].includes(unit)) return { billing_model: 'fixed_period', rate_unit: 'fixed' };
  return { billing_model: 'per_unit', rate_unit: 'unit' };
}

async function handleConvertQuote(
  base44: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
) {
  const quote = await requireRecord(base44, 'CustomerQuote', requireString(body, 'quote_id'), 'Offerte');
  if (versionOf(quote) !== expectedVersion) throw new ApiError(409, 'Offerte is intussen gewijzigd');
  if (quote.status !== 'accepted') throw new ApiError(409, 'Alleen een geaccepteerde offerte kan worden omgezet');
  const existing = await getEntity(base44, 'CustomerContract').filter({ source_quote_id: quote.id }, '-created_date', 10);
  if (existing.length) {
    const contract = existing[0];
    if (!quote.converted_contract_id) {
      await casUpdateLatest(base44, 'CustomerQuote', quote.id, { status: 'converted', converted_contract_id: contract.id });
    }
    return { quote: await requireRecord(base44, 'CustomerQuote', quote.id), contract, replayed: true, resource_type: 'CustomerContract', resource_id: contract.id, category: 'commercial' };
  }
  const data = body.data && typeof body.data === 'object' ? body.data : {};
  const contract = await getEntity(base44, 'CustomerContract').create({
    company_id: quote.company_id,
    customer_id: quote.customer_id,
    customer_account_id: quote.customer_account_id,
    source_quote_id: quote.id,
    contract_number: null,
    number_reservation_id: null,
    version: 1,
    document_version: 1,
    supersedes_contract_id: null,
    status: 'draft',
    title: data.title || quote.title,
    description: data.description ?? quote.description,
    currency: quote.currency,
    start_date: data.start_date ? dateOnly(data.start_date) : null,
    end_date: data.end_date ? dateOnly(data.end_date) : null,
    notice_period_days: data.notice_period_days ?? null,
    auto_renew: Boolean(data.auto_renew),
    billing_frequency: data.billing_frequency || 'monthly',
    customer_snapshot: quote.customer_snapshot,
    company_snapshot: quote.company_snapshot,
    template_id: data.template_id || null,
    unsigned_managed_file_id: null,
    signed_managed_file_id: null,
    document_signature_id: null,
    idempotency_key: idempotencyKey,
    metadata: { converted_from_quote_id: quote.id, quote_document_version: quote.document_version || 1 },
  });
  const quoteLines = await getEntity(base44, 'CustomerQuoteLine').filter({ quote_id: quote.id }, '+sequence', 1000);
  const contractLines: LooseRecord[] = [];
  const rates: LooseRecord[] = [];
  for (const quoteLine of quoteLines) {
    if (quoteLine.line_type === 'text') continue;
    const mapped = quoteUnitToContract(quoteLine.unit);
    const scopeType = quoteLine.object_id ? 'object' : quoteLine.collective_id ? 'collective' : 'customer';
    const line = await getEntity(base44, 'CustomerContractLine').create({
      contract_id: contract.id,
      company_id: contract.company_id,
      customer_id: contract.customer_id,
      customer_account_id: contract.customer_account_id,
      sequence: quoteLine.sequence,
      service_code: quoteLine.service_code || null,
      name: quoteLine.description,
      description: quoteLine.description,
      scope_type: scopeType,
      object_id: quoteLine.object_id || null,
      collective_id: quoteLine.collective_id || null,
      billing_model: mapped.billing_model,
      billing_frequency: contract.billing_frequency,
      included_quantity_minor: 0,
      currency: contract.currency,
      vat_rate_basis_points: quoteLine.vat_rate_basis_points,
      status: 'draft',
      valid_from: contract.start_date,
      valid_until: contract.end_date,
      version: 1,
      metadata: { source_quote_line_id: quoteLine.id },
    });
    contractLines.push(line);
    rates.push(await getEntity(base44, 'CustomerContractRate').create({
      contract_id: contract.id,
      contract_line_id: line.id,
      company_id: contract.company_id,
      customer_id: contract.customer_id,
      customer_account_id: contract.customer_account_id,
      rate_code: null,
      unit: mapped.rate_unit,
      amount_cents: quoteLine.unit_price_cents,
      currency: contract.currency,
      vat_rate_basis_points: quoteLine.vat_rate_basis_points,
      minimum_quantity_minor: 0,
      rounding_increment_minor: 1,
      priority: 0,
      price_index_profile_id: null,
      source_rate_id: null,
      status: 'draft',
      valid_from: contract.start_date || todayIso(),
      valid_until: contract.end_date,
      version: 1,
      metadata: { source_quote_line_id: quoteLine.id },
    }));
  }
  const convertedQuote = await casUpdate(base44, 'CustomerQuote', quote, expectedVersion, {
    status: 'converted',
    converted_contract_id: contract.id,
  });
  return {
    quote: convertedQuote,
    contract,
    contract_lines: contractLines,
    rates,
    resource_type: 'CustomerContract',
    resource_id: contract.id,
    category: 'commercial',
  };
}

async function handleCreateContract(
  base44: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
) {
  if (expectedVersion !== 0) throw new ApiError(409, 'Nieuw contract verwacht expected_version 0');
  const existingContracts = await getEntity(base44, 'CustomerContract').filter({ idempotency_key: idempotencyKey }, '-created_date', 1);
  if (existingContracts.length) {
    return { contract: existingContracts[0], replayed: true, recovered_partial_creation: true, resource_type: 'CustomerContract', resource_id: existingContracts[0].id, category: 'commercial' };
  }
  const data = requireObject(body);
  const customerId = requireString(body, 'customer_id');
  const account = await requireRecord(base44, 'CustomerAccount', requireString(data, 'customer_account_id'), 'Klantrelatie');
  if (account.customer_id !== customerId) throw new ApiError(409, 'Klantrelatie hoort bij een andere klant');
  await assertCommercialFeature(base44, account.company_id);
  const snapshots = await loadBillingSnapshots(base44, account.company_id, customerId, account.id);
  const startDate = data.start_date ? dateOnly(data.start_date) : null;
  const endDate = data.end_date ? dateOnly(data.end_date) : null;
  if (startDate && endDate && endDate < startDate) throw new ApiError(400, 'Contracteinde ligt vóór startdatum');
  const contract = await getEntity(base44, 'CustomerContract').create({
    company_id: account.company_id,
    customer_id: customerId,
    customer_account_id: account.id,
    source_quote_id: data.source_quote_id || null,
    contract_number: null,
    number_reservation_id: null,
    version: 1,
    document_version: 1,
    supersedes_contract_id: data.supersedes_contract_id || null,
    status: 'draft',
    title: requireString(data, 'title'),
    description: data.description || null,
    currency: data.currency || account.currency || 'EUR',
    start_date: startDate,
    end_date: endDate,
    notice_period_days: data.notice_period_days ?? null,
    auto_renew: Boolean(data.auto_renew),
    billing_frequency: data.billing_frequency || 'monthly',
    customer_snapshot: snapshots.customer_snapshot,
    company_snapshot: snapshots.company_snapshot,
    template_id: data.template_id || null,
    unsigned_managed_file_id: data.unsigned_managed_file_id || null,
    signed_managed_file_id: null,
    document_signature_id: null,
    idempotency_key: idempotencyKey,
    metadata: data.metadata || null,
  });
  return { contract, resource_type: 'CustomerContract', resource_id: contract.id, category: 'commercial' };
}

async function handleUpdateContract(base44: LooseRecord, body: LooseRecord, expectedVersion: number) {
  const contract = await requireRecord(base44, 'CustomerContract', requireString(body, 'contract_id'), 'Contract');
  if (!['draft', 'review'].includes(contract.status)) {
    throw new ApiError(409, 'Contractinhoud is na goedkeuring onveranderlijk; maak een opvolgende contractversie');
  }
  const data = requireObject(body);
  const patch = pick(data, CONTRACT_PATCH_FIELDS);
  const startDate = Object.prototype.hasOwnProperty.call(patch, 'start_date') ? dateOnly(patch.start_date) : contract.start_date;
  const endDate = Object.prototype.hasOwnProperty.call(patch, 'end_date') && patch.end_date ? dateOnly(patch.end_date) : patch.end_date ?? contract.end_date;
  if (startDate && endDate && endDate < startDate) throw new ApiError(400, 'Contracteinde ligt vóór startdatum');
  patch.start_date = startDate;
  patch.end_date = endDate;
  const updated = await casUpdate(base44, 'CustomerContract', contract, expectedVersion, patch);
  return { contract: updated, resource_type: 'CustomerContract', resource_id: updated.id, category: 'commercial' };
}

async function handleContractLine(
  base44: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  mode: 'create' | 'update' | 'transition',
) {
  if (mode === 'create') {
    if (expectedVersion !== 0) throw new ApiError(409, 'Nieuwe contractregel verwacht expected_version 0');
    const data = requireObject(body);
    const contract = await requireRecord(base44, 'CustomerContract', requireString(body, 'contract_id'), 'Contract');
    if (!['draft', 'review'].includes(contract.status)) {
      throw new ApiError(409, 'Contractinhoud is vanaf goedkeuring bevroren; maak een opvolgende contractversie');
    }
    const scopeType = data.scope_type || 'customer';
    const scope = await validateCustomerScope(base44, contract.customer_id, data, scopeType);
    const line = await getEntity(base44, 'CustomerContractLine').create({
      contract_id: contract.id,
      company_id: contract.company_id,
      customer_id: contract.customer_id,
      customer_account_id: contract.customer_account_id,
      ...pick(data, CONTRACT_LINE_PATCH_FIELDS),
      ...scope,
      sequence: data.sequence ?? 1,
      name: requireString(data, 'name'),
      scope_type: scopeType,
      billing_model: requireString(data, 'billing_model'),
      billing_frequency: data.billing_frequency || contract.billing_frequency,
      included_quantity_minor: Number(data.included_quantity_minor || 0),
      currency: data.currency || contract.currency,
      vat_rate_basis_points: Number(data.vat_rate_basis_points ?? 2100),
      status: 'draft',
      valid_from: data.valid_from ? dateOnly(data.valid_from) : contract.start_date,
      valid_until: data.valid_until ? dateOnly(data.valid_until) : contract.end_date,
      version: 1,
    });
    return { contract_line: line, resource_type: 'CustomerContractLine', resource_id: line.id, category: 'commercial' };
  }
  const line = await requireRecord(base44, 'CustomerContractLine', requireString(body, 'contract_line_id'), 'Contractregel');
  const contract = await requireRecord(base44, 'CustomerContract', line.contract_id, 'Contract');
  if (mode === 'update') {
    if (line.status !== 'draft' || !['draft', 'review'].includes(contract.status)) {
      throw new ApiError(409, 'Alleen een conceptregel in een conceptcontract kan inhoudelijk worden gewijzigd');
    }
    const data = requireObject(body);
    const patch = pick(data, CONTRACT_LINE_PATCH_FIELDS);
    const scopeType = patch.scope_type || line.scope_type;
    const scope = await validateCustomerScope(
      base44,
      contract.customer_id,
      { ...line, ...patch },
      scopeType,
    );
    const updated = await casUpdate(base44, 'CustomerContractLine', line, expectedVersion, {
      ...patch,
      ...scope,
      scope_type: scopeType,
    });
    return { contract_line: updated, resource_type: 'CustomerContractLine', resource_id: updated.id, category: 'commercial' };
  }
  const status = requireString(body, 'status');
  if (!['draft', 'review', 'approved'].includes(contract.status)) {
    throw new ApiError(409, 'Ondertekende of verzonden contractregels zijn bevroren; maak een opvolgend contract');
  }
  const transitions: Record<string, string[]> = {
    draft: ['active', 'archived'],
    active: ['suspended', 'ended', 'archived'],
    suspended: ['active', 'ended', 'archived'],
    ended: ['archived'],
    archived: [],
  };
  validateTransition(transitions, line.status, status, 'Contractregel');
  if (status === 'active') {
    if (contract.status !== 'approved') {
      throw new ApiError(409, 'Contractregels worden na goedkeuring en vóór verzending geactiveerd');
    }
    const rates = await getEntity(base44, 'CustomerContractRate').filter({ contract_line_id: line.id, status: 'active' }, '+valid_from', 1);
    if (!rates.length) throw new ApiError(409, 'Contractregel heeft geen actief tarief');
  }
  const updated = await casUpdate(base44, 'CustomerContractLine', line, expectedVersion, { status });
  return { contract_line: updated, resource_type: 'CustomerContractLine', resource_id: updated.id, category: 'commercial' };
}

async function handleContractRate(
  base44: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  mode: 'create' | 'update' | 'transition',
) {
  if (mode === 'create') {
    if (expectedVersion !== 0) throw new ApiError(409, 'Nieuw tarief verwacht expected_version 0');
    const data = validateRateShape(requireObject(body));
    const line = await requireRecord(base44, 'CustomerContractLine', requireString(body, 'contract_line_id'), 'Contractregel');
    const contract = await requireRecord(base44, 'CustomerContract', line.contract_id, 'Contract');
    if (!['draft', 'review'].includes(contract.status)) {
      throw new ApiError(409, 'Contracttarieven zijn vanaf goedkeuring bevroren; gebruik een opvolgend contract of goedgekeurde indexatierun');
    }
    const rate = await getEntity(base44, 'CustomerContractRate').create({
      contract_id: contract.id,
      contract_line_id: line.id,
      company_id: contract.company_id,
      customer_id: contract.customer_id,
      customer_account_id: contract.customer_account_id,
      ...pick(data, RATE_PATCH_FIELDS),
      currency: data.currency || contract.currency,
      status: 'draft',
      minimum_quantity_minor: Number(data.minimum_quantity_minor || 0),
      rounding_increment_minor: Number(data.rounding_increment_minor || 1),
      priority: Number(data.priority || 0),
      source_rate_id: data.source_rate_id || null,
      version: 1,
    });
    return { rate, resource_type: 'CustomerContractRate', resource_id: rate.id, category: 'commercial' };
  }
  const rate = await requireRecord(base44, 'CustomerContractRate', requireString(body, 'rate_id'), 'Tarief');
  const rateContract = await requireRecord(base44, 'CustomerContract', rate.contract_id, 'Contract');
  if (mode === 'update') {
    if (rate.status !== 'draft' || !['draft', 'review'].includes(rateContract.status)) {
      throw new ApiError(409, 'Een goedgekeurd, actief of historisch tarief is onveranderlijk; maak een opvolgende contractversie');
    }
    const data = validateRateShape({ ...rate, ...pick(requireObject(body), RATE_PATCH_FIELDS) });
    const updated = await casUpdate(base44, 'CustomerContractRate', rate, expectedVersion, pick(data, RATE_PATCH_FIELDS));
    return { rate: updated, resource_type: 'CustomerContractRate', resource_id: updated.id, category: 'commercial' };
  }
  const status = requireString(body, 'status');
  if (!['draft', 'review', 'approved'].includes(rateContract.status)) {
    throw new ApiError(409, 'Ondertekende of verzonden tarieven zijn bevroren; gebruik een opvolgend contract of goedgekeurde indexatierun');
  }
  const transitions: Record<string, string[]> = {
    draft: ['active', 'archived'],
    active: ['superseded', 'ended'],
    superseded: ['archived'],
    ended: ['archived'],
    archived: [],
  };
  validateTransition(transitions, rate.status, status, 'Tarief');
  if (status === 'active') {
    if (!['draft', 'review', 'approved'].includes(rateContract.status)) {
      throw new ApiError(409, 'Tarief kan na verzending of ondertekening niet handmatig worden geactiveerd');
    }
    const activeRates = await getEntity(base44, 'CustomerContractRate').filter({
      contract_line_id: rate.contract_line_id,
      unit: rate.unit,
      status: 'active',
    }, '+valid_from', 1000);
    const overlap = activeRates.find((item: LooseRecord) =>
      item.id !== rate.id &&
      rangesOverlap(rate.valid_from, rate.valid_until, item.valid_from, item.valid_until));
    if (overlap) {
      throw new ApiError(409, 'Tariefperiode overlapt een actief tarief', { overlapping_rate_id: overlap.id });
    }
  }
  const updated = await casUpdate(base44, 'CustomerContractRate', rate, expectedVersion, {
    status,
    ...(status === 'ended' && !rate.valid_until ? { valid_until: todayIso() } : {}),
  });
  return { rate: updated, resource_type: 'CustomerContractRate', resource_id: updated.id, category: 'commercial' };
}

async function handleTransitionContract(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
) {
  const contract = await requireRecord(base44, 'CustomerContract', requireString(body, 'contract_id'), 'Contract');
  const status = requireString(body, 'status');
  validateTransition(CONTRACT_TRANSITIONS, contract.status, status, 'Contract');
  const patch: LooseRecord = { status };
  let reservation: LooseRecord | null = null;
  if (status === 'approved') {
    const lines = await getEntity(base44, 'CustomerContractLine').filter({ contract_id: contract.id }, '+sequence', 1);
    if (!lines.length) throw new ApiError(409, 'Contract heeft geen contractregels');
    patch.approved_by_user_id = user.id;
    patch.approved_at = nowIso();
  }
  if (status === 'sent_for_signature') {
    if (!contract.unsigned_managed_file_id) throw new ApiError(409, 'Definitief ongetekend contractdocument ontbreekt');
    const signatures = await getEntity(base44, 'DocumentSignature').filter({
      source_type: { $in: ['customer_contract', 'CustomerContract'] },
      source_id: contract.id,
      provider: 'signhost',
    }, '-created_date', 20);
    const activeSignature = signatures.find((signature: LooseRecord) =>
      ['queued', 'pending', 'sent', 'in_progress'].includes(signature.status));
    if (!activeSignature) throw new ApiError(409, 'Start eerst een gevalideerde Signhost-transactie');
    if (!contract.contract_number) {
      const issueDate = dateOnly(activeSignature.sent_at) || todayIso();
      reservation = await reserveCommercialNumber(base44, {
        companyId: contract.company_id,
        documentType: 'contract',
        fiscalYear: Number(issueDate.slice(0, 4)),
        idempotencyKey: `${idempotencyKey}:number`,
        resourceType: 'CustomerContract',
        resourceId: contract.id,
      });
      patch.contract_number = reservation.formatted_number;
      patch.number_reservation_id = reservation.id;
    }
    patch.document_signature_id = activeSignature.id;
  }
  if (status === 'signed') {
    const reason = asString(body.manual_import_reason);
    const signedFileId = asString(body.signed_managed_file_id);
    if (!reason || !signedFileId) {
      throw new ApiError(409, 'Signed-status komt alleen via een terminale Signhost-status of handmatige bewijsimport');
    }
    const unsignedFile = await validateManagedResourceFile(
      base44,
      asString(contract.unsigned_managed_file_id),
      contract,
      'Ongetekend contractdocument',
    );
    const signedFile = await validateManagedResourceFile(
      base44,
      signedFileId,
      contract,
      'Ondertekend contractdocument',
    );
    const receiptFile = body.receipt_managed_file_id
      ? await validateManagedResourceFile(base44, asString(body.receipt_managed_file_id), contract, 'Ondertekenbewijs')
      : null;
    if (!unsignedFile.plaintext_sha256 || !signedFile.plaintext_sha256) {
      throw new ApiError(409, 'Werkelijke SHA-256 checksums ontbreken op de bewijsbestanden');
    }
    if (body.document_checksum && asString(body.document_checksum) !== unsignedFile.plaintext_sha256) {
      throw new ApiError(409, 'Checksum van het ongetekende document komt niet overeen met het opgeslagen bestand');
    }
    if (body.signed_checksum && asString(body.signed_checksum) !== signedFile.plaintext_sha256) {
      throw new ApiError(409, 'Checksum van het ondertekende document komt niet overeen met het opgeslagen bestand');
    }
    const signedAt = body.signed_at ? new Date(body.signed_at) : new Date();
    if (!Number.isFinite(signedAt.getTime()) || signedAt.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new ApiError(400, 'signed_at is ongeldig');
    }
    const signatureKey = `${idempotencyKey}:manual-signature`;
    const existingSignatures = await getEntity(base44, 'DocumentSignature').filter({
      idempotency_key: signatureKey,
    }, '-created_date', 1);
    if (existingSignatures[0] && existingSignatures[0].source_id !== contract.id) {
      throw new ApiError(409, 'Handmatige onderteken-idempotency hoort bij een ander contract');
    }
    const signature = existingSignatures[0] || await getEntity(base44, 'DocumentSignature').create({
      company_id: contract.company_id,
      customer_id: contract.customer_id,
      customer_account_id: contract.customer_account_id,
      source_type: 'customer_contract',
      source_id: contract.id,
      provider: 'manual',
      provider_transaction_id: null,
      status: 'signed',
      signer_snapshots: body.signer_snapshots || [],
      unsigned_managed_file_id: unsignedFile.id,
      signed_managed_file_id: signedFile.id,
      receipt_managed_file_id: receiptFile?.id || null,
      document_checksum: unsignedFile.plaintext_sha256,
      signed_checksum: signedFile.plaintext_sha256,
      signed_at: signedAt.toISOString(),
      manual_import_reason: reason,
      idempotency_key: signatureKey,
      version: 1,
    });
    patch.document_signature_id = signature.id;
    patch.signed_managed_file_id = signedFileId;
    patch.signed_at = signature.signed_at;
  }
  if (status === 'active') {
    if (!contract.signed_at || !contract.signed_managed_file_id) throw new ApiError(409, 'Ondertekend contractbewijs ontbreekt');
    if (!contract.start_date) throw new ApiError(409, 'Contractstartdatum ontbreekt');
    const lines = await getEntity(base44, 'CustomerContractLine').filter({ contract_id: contract.id, status: 'active' }, '+sequence', 500);
    if (!lines.length) throw new ApiError(409, 'Contract heeft geen actieve regels');
    for (const line of lines) {
      const rates = await getEntity(base44, 'CustomerContractRate').filter({
        contract_line_id: line.id,
        status: 'active',
      }, '+valid_from', 1000);
      if (!rates.length) throw new ApiError(409, `Contractregel ${line.id} heeft geen actief tarief`);
      const validation = await rateValidation(base44, line.id);
      if (validation.overlaps.length) throw new ApiError(409, `Contractregel ${line.id} heeft overlappende tarieven`);
    }
    patch.activated_at = nowIso();
  }
  if (['ended', 'superseded'].includes(status)) {
    patch.ended_at = nowIso();
    patch.end_reason = asString(body.reason) || null;
  }
  const updated = await casUpdate(base44, 'CustomerContract', contract, expectedVersion, patch);
  if (reservation) await markReservation(base44, reservation, 'issued');
  return { contract: updated, resource_type: 'CustomerContract', resource_id: updated.id, category: 'commercial' };
}

async function handleTransitionBillingCandidate(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
) {
  const candidate = await requireRecord(base44, 'BillingCandidate', requireString(body, 'billing_candidate_id'), 'Factuurkandidaat');
  const status = requireString(body, 'status');
  const transitions: Record<string, string[]> = {
    pending: ['approved', 'rejected', 'cancelled', 'blocked'],
    blocked: ['pending', 'rejected', 'cancelled'],
    ready: ['approved', 'rejected', 'cancelled'],
    approved: ['rejected', 'cancelled'],
    invoiced: [],
    rejected: [],
    cancelled: [],
  };
  validateTransition(transitions, candidate.status, status, 'Factuurkandidaat');
  if (status === 'approved' && candidate.block_code) {
    throw new ApiError(409, 'Geblokkeerde kandidaat moet eerst opnieuw worden beoordeeld zonder blokkeerreden');
  }
  const patch: LooseRecord = { status };
  if (status === 'approved') {
    patch.approved_by_user_id = user.id;
    patch.approved_at = nowIso();
  }
  if (status === 'pending' && candidate.status === 'blocked') {
    const reevaluated = await findExecutionPricing(
      base44,
      await requireRecord(base44, 'TaskExecution', candidate.task_execution_id, 'Uitvoering'),
    );
    if (reevaluated.blocked) {
      throw new ApiError(409, reevaluated.blocked[1], { block_code: reevaluated.blocked[0] });
    }
    patch.block_code = null;
    patch.block_reason = null;
  }
  const updated = await casUpdate(base44, 'BillingCandidate', candidate, expectedVersion, patch);
  if (candidate.task_execution_id) {
    const execution = await requireRecord(base44, 'TaskExecution', candidate.task_execution_id, 'Uitvoering');
    const executionExpected = requireInteger(body.task_execution_expected_version, 'task_execution_expected_version', 1);
    await casUpdate(base44, 'TaskExecution', execution, executionExpected, {
      billing_status: status === 'approved'
        ? 'candidate_approved'
        : status === 'blocked'
          ? 'candidate_blocked'
          : 'candidate_pending',
    });
  }
  return { candidate: updated, resource_type: 'BillingCandidate', resource_id: updated.id, category: 'billing' };
}

async function handleCreateInvoiceDraft(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
) {
  if (expectedVersion !== 0) throw new ApiError(409, 'Nieuwe conceptfactuur verwacht expected_version 0');
  const candidateIds = Array.isArray(body.billing_candidate_ids) ? body.billing_candidate_ids : [];
  const expectedCandidateVersions = body.candidate_expected_versions;
  if (!expectedCandidateVersions || typeof expectedCandidateVersions !== 'object') {
    throw new ApiError(400, 'candidate_expected_versions is verplicht');
  }
  const result = await createInvoiceFromCandidates(base44, {
    candidateIds,
    idempotencyKey,
    actorId: user.id,
    expectedCandidateVersions,
  });
  return {
    ...result,
    resource_type: 'SalesInvoice',
    resource_id: result.invoice.id,
    category: 'billing',
  };
}

async function handleCreateInvoiceRun(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
) {
  if (expectedVersion !== 0) throw new ApiError(409, 'Nieuwe factuurrun verwacht expected_version 0');
  const existing = await getEntity(base44, 'InvoiceRun').filter({ idempotency_key: idempotencyKey }, '-created_date', 1);
  if (existing.length) {
    const invoices = await getEntity(base44, 'SalesInvoice').filter({ invoice_run_id: existing[0].id }, '+created_date', 1000);
    return { invoice_run: existing[0], invoices, replayed: true, resource_type: 'InvoiceRun', resource_id: existing[0].id, category: 'billing' };
  }
  const companyId = requireString(body, 'company_id');
  const periodStart = dateOnly(requireString(body, 'period_start'));
  const periodEnd = dateOnly(requireString(body, 'period_end'));
  if (!periodStart || !periodEnd || periodEnd < periodStart) throw new ApiError(400, 'Ongeldige factuurperiode');
  const candidateIds = Array.isArray(body.billing_candidate_ids)
    ? [...new Set(body.billing_candidate_ids.map(asString).filter(Boolean))]
    : [];
  if (!candidateIds.length || candidateIds.length > 2000) throw new ApiError(400, 'Kies 1 tot 2000 factuurkandidaten');
  const candidates = await Promise.all(candidateIds.map(id => requireRecord(base44, 'BillingCandidate', id, 'Factuurkandidaat')));
  const expectedVersions = body.candidate_expected_versions;
  if (!expectedVersions || typeof expectedVersions !== 'object') throw new ApiError(400, 'candidate_expected_versions is verplicht');
  for (const candidate of candidates) {
    if (candidate.company_id !== companyId) throw new ApiError(409, 'Factuurkandidaat hoort bij een andere BV');
    if (candidate.status !== 'approved') throw new ApiError(409, `Factuurkandidaat ${candidate.id} is niet goedgekeurd`);
    if (versionOf(candidate) !== Number(expectedVersions[candidate.id])) {
      throw new ApiError(409, `Factuurkandidaat ${candidate.id} is intussen gewijzigd`);
    }
  }
  const run = await getEntity(base44, 'InvoiceRun').create({
    company_id: companyId,
    run_number: null,
    status: 'collecting',
    period_start: periodStart,
    period_end: periodEnd,
    filters_snapshot: body.filters || {},
    candidate_ids: candidateIds,
    invoice_ids: [],
    candidate_count: candidates.length,
    blocked_count: 0,
    invoice_count: 0,
    total_cents: candidates.reduce((sum, candidate) => sum + Number(candidate.total_cents || 0), 0),
    currency: body.currency || candidates[0]?.currency || 'EUR',
    started_by_user_id: user.id,
    started_at: nowIso(),
    errors: [],
    idempotency_key: idempotencyKey,
    version: 1,
  });
  const groups = new Map<string, LooseRecord[]>();
  for (const candidate of candidates) {
    const key = [candidate.customer_id, candidate.customer_account_id, candidate.currency].join('|');
    const group = groups.get(key) || [];
    group.push(candidate);
    groups.set(key, group);
  }
  const invoices: LooseRecord[] = [];
  const errors: LooseRecord[] = [];
  for (const [key, group] of groups) {
    try {
      const result = await createInvoiceFromCandidates(base44, {
        candidateIds: group.map(candidate => candidate.id),
        idempotencyKey: `${idempotencyKey}:invoice:${await sha256(key)}`,
        actorId: user.id,
        invoiceRunId: run.id,
        expectedCandidateVersions: Object.fromEntries(group.map(candidate => [candidate.id, versionOf(candidate)])),
      });
      invoices.push(result.invoice);
    } catch (error) {
      errors.push({
        group: key,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const updatedRun = await casUpdate(base44, 'InvoiceRun', run, 1, {
    status: errors.length ? 'partial_failed' : 'review',
    invoice_ids: invoices.map(invoice => invoice.id),
    invoice_count: invoices.length,
    errors,
    completed_at: nowIso(),
  });
  return { invoice_run: updatedRun, invoices, errors, resource_type: 'InvoiceRun', resource_id: run.id, category: 'billing' };
}

async function handleUpdateInvoice(base44: LooseRecord, body: LooseRecord, expectedVersion: number) {
  const invoice = await requireRecord(base44, 'SalesInvoice', requireString(body, 'invoice_id'), 'Factuur');
  if (!['draft', 'review'].includes(invoiceLifecycle(invoice)) || invoice.invoice_number) {
    throw new ApiError(409, 'Uitgegeven of genummerde factuurinhoud is onveranderlijk');
  }
  const data = requireObject(body);
  const allowed = [
    'invoice_date',
    'due_date',
    'customer_reference',
    'payment_reference',
    'pdf_managed_file_id',
    'ubl_managed_file_id',
    'metadata',
  ];
  const patch = pick(data, allowed);
  if (patch.invoice_date) patch.invoice_date = dateOnly(patch.invoice_date);
  if (patch.due_date) patch.due_date = dateOnly(patch.due_date);
  if (patch.invoice_date && patch.due_date && patch.due_date < patch.invoice_date) {
    throw new ApiError(400, 'Vervaldatum ligt vóór factuurdatum');
  }
  const updated = await casUpdate(base44, 'SalesInvoice', invoice, expectedVersion, patch);
  return { invoice: updated, resource_type: 'SalesInvoice', resource_id: updated.id, category: 'billing' };
}

async function handleTransitionInvoice(base44: LooseRecord, body: LooseRecord, expectedVersion: number) {
  const invoice = await requireRecord(base44, 'SalesInvoice', requireString(body, 'invoice_id'), 'Factuur');
  const status = requireString(body, 'status');
  validateTransition(INVOICE_TRANSITIONS, invoiceLifecycle(invoice), status, 'Factuur');
  if (['issue_pending', 'issued', 'issue_failed'].includes(status)) {
    throw new ApiError(409, 'Gebruik issue_invoice voor gecontroleerde nummering en uitgifte');
  }
  const updated = await casUpdate(base44, 'SalesInvoice', invoice, expectedVersion, {
    ...invoiceLifecyclePatch(status),
    ...(status === 'cancelled' ? { failure_reason: asString(body.reason) || 'Concept geannuleerd' } : {}),
  });
  return { invoice: updated, resource_type: 'SalesInvoice', resource_id: updated.id, category: 'billing' };
}

async function validateManagedResourceFile(
  base44: LooseRecord,
  managedFileId: string,
  resource: LooseRecord,
  label: string,
) {
  if (!managedFileId) throw new ApiError(409, `${label} ontbreekt`);
  const file = await requireRecord(base44, 'ManagedFile', managedFileId, label);
  if (file.company_id !== resource.company_id || file.customer_id !== resource.customer_id) {
    throw new ApiError(409, `${label} hoort niet bij deze BV en klant`);
  }
  if (file.storage_visibility && file.storage_visibility !== 'private') {
    throw new ApiError(409, `${label} moet privé opgeslagen zijn`);
  }
  return file;
}

function validateInvoiceSnapshot(invoice: LooseRecord, lines: LooseRecord[]) {
  if (!invoice.company_snapshot?.legal_name) throw new ApiError(409, 'Juridische BV-snapshot ontbreekt');
  if (!invoice.customer_snapshot?.legal_name) throw new ApiError(409, 'Juridische klantsnapshot ontbreekt');
  if (!invoice.billing_address_snapshot || !Object.keys(invoice.billing_address_snapshot).length) {
    throw new ApiError(409, 'Factuuradressnapshot ontbreekt');
  }
  if (!lines.length) throw new ApiError(409, 'Factuur heeft geen regels');
  const subtotal = lines.reduce((sum, line) => sum + Number(line.subtotal_cents || 0), 0);
  const tax = lines.reduce((sum, line) => sum + Number(line.tax_cents || 0), 0);
  const total = lines.reduce((sum, line) => sum + Number(line.total_cents || 0), 0);
  if (subtotal !== Number(invoice.subtotal_cents) || tax !== Number(invoice.tax_total_cents) || total !== Number(invoice.total_cents)) {
    throw new ApiError(409, 'Factuurtotalen komen niet overeen met de bevroren regels');
  }
}

async function handleIssueInvoice(
  base44: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
) {
  let invoice = await requireRecord(base44, 'SalesInvoice', requireString(body, 'invoice_id'), 'Factuur');
  if (invoiceLifecycle(invoice) === 'issued') {
    if (invoice.number_reservation_id) {
      const issuedReservation = await requireRecord(
        base44,
        'CommercialNumberReservation',
        invoice.number_reservation_id,
        'Nummerreservering',
      );
      if (issuedReservation.status !== 'issued') await markReservation(base44, issuedReservation, 'issued');
    }
    return { invoice, replayed: true, resource_type: 'SalesInvoice', resource_id: invoice.id, category: 'billing' };
  }
  if (!['approved', 'issue_pending', 'issue_failed'].includes(invoiceLifecycle(invoice))) {
    throw new ApiError(409, 'Alleen een goedgekeurde, lopende of herstelbare mislukte factuur kan worden uitgegeven');
  }
  if (versionOf(invoice) !== expectedVersion) throw new ApiError(409, 'Factuur is intussen gewijzigd');
  const settings = await assertInvoiceIssueFeature(base44, invoice.company_id);
  const [account, lines] = await Promise.all([
    requireRecord(base44, 'CustomerAccount', invoice.customer_account_id, 'Klantrelatie'),
    getEntity(base44, 'SalesInvoiceLine').filter({ invoice_id: invoice.id }, '+sequence', 1000),
  ]);
  if (account.finance_hold) throw new ApiError(409, 'Klantrelatie staat op financiële blokkade');
  if (invoice.dispute_hold) throw new ApiError(409, 'Factuur staat op geschilblokkade');
  if (account.peppol_required) {
    const peppolEnabled = settings.peppol_enabled === true || settings.feature_flags?.peppol === true;
    if (!peppolEnabled || !account.peppol_scheme_id || !account.peppol_participant_id) {
      throw new ApiError(409, 'Peppol-verplichte ontvanger is niet volledig geconfigureerd; e-mailfallback is niet toegestaan');
    }
  }
  validateInvoiceSnapshot(invoice, lines);
  const invoiceDate = invoice.invoice_date || todayIso();
  let reservation: LooseRecord;
  if (invoice.number_reservation_id) {
    reservation = await requireRecord(base44, 'CommercialNumberReservation', invoice.number_reservation_id, 'Nummerreservering');
  } else {
    reservation = await reserveCommercialNumber(base44, {
      companyId: invoice.company_id,
      documentType: invoice.document_type === 'credit_note' ? 'credit_note' : 'invoice',
      fiscalYear: Number(invoiceDate.slice(0, 4)),
      idempotencyKey: `${idempotencyKey}:number`,
      resourceType: 'SalesInvoice',
      resourceId: invoice.id,
    });
  }
  if (invoiceLifecycle(invoice) !== 'issue_pending') {
    invoice = await casUpdate(base44, 'SalesInvoice', invoice, expectedVersion, {
      ...invoiceLifecyclePatch('issue_pending'),
      invoice_number: reservation.formatted_number,
      number_reservation_id: reservation.id,
      invoice_date: invoiceDate,
      issue_date: invoiceDate,
    });
  } else if (
    invoice.number_reservation_id !== reservation.id ||
    invoice.invoice_number !== reservation.formatted_number
  ) {
    throw new ApiError(409, 'Lopende factuuruitgifte verwijst naar een andere nummerreservering');
  }
  const pdfId = asString(body.pdf_managed_file_id || invoice.pdf_managed_file_id);
  const ublId = asString(body.ubl_managed_file_id || invoice.ubl_managed_file_id);
  try {
    if (!pdfId) throw new ApiError(409, 'Definitieve factuur-PDF ontbreekt');
    await validateManagedResourceFile(base44, pdfId, invoice, 'Factuur-PDF');
    if (ublId) await validateManagedResourceFile(base44, ublId, invoice, 'UBL-bestand');
    for (const line of lines) {
      if (!line.billing_candidate_id) continue;
      const candidate = await requireRecord(base44, 'BillingCandidate', line.billing_candidate_id, 'Factuurkandidaat');
      if (candidate.status === 'invoiced' && candidate.invoice_line_id === line.id) continue;
      if (candidate.status !== 'approved') throw new ApiError(409, `Factuurkandidaat ${candidate.id} is niet meer goedgekeurd`);
      const updatedCandidate = await casUpdate(base44, 'BillingCandidate', candidate, versionOf(candidate), {
        status: 'invoiced',
        invoice_line_id: line.id,
      });
      if (updatedCandidate.task_execution_id) {
        const execution = await requireRecord(base44, 'TaskExecution', updatedCandidate.task_execution_id, 'Uitvoering');
        await casUpdate(base44, 'TaskExecution', execution, versionOf(execution), {
          billing_status: invoice.document_type === 'credit_note' ? 'credited' : 'invoiced',
        });
      }
    }
    invoice = await casUpdate(base44, 'SalesInvoice', invoice, versionOf(invoice), {
      ...invoiceLifecyclePatch('issued'),
      payment_status: invoice.total_cents <= 0 ? 'not_due' : 'open',
      pdf_managed_file_id: pdfId,
      ubl_managed_file_id: ublId || null,
      issued_at: nowIso(),
      failure_reason: null,
    });
    await markReservation(base44, reservation, 'issued');
    return { invoice, resource_type: 'SalesInvoice', resource_id: invoice.id, category: 'billing' };
  } catch (error) {
    invoice = await casUpdateLatest(base44, 'SalesInvoice', invoice.id, {
      ...invoiceLifecyclePatch('issue_failed'),
      failure_reason: error instanceof Error ? error.message : String(error),
      pdf_managed_file_id: pdfId || null,
      ubl_managed_file_id: ublId || null,
    });
    await markReservation(base44, reservation, 'issue_failed', {
      failure_reason: invoice.failure_reason,
    });
    return {
      invoice,
      issue_failed: true,
      failure_reason: invoice.failure_reason,
      resource_type: 'SalesInvoice',
      resource_id: invoice.id,
      category: 'billing',
    };
  }
}

async function handleCreateCreditNote(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
) {
  const original = await requireRecord(base44, 'SalesInvoice', requireString(body, 'original_invoice_id'), 'Originele factuur');
  if (versionOf(original) !== expectedVersion) throw new ApiError(409, 'Originele factuur is intussen gewijzigd');
  if (invoiceLifecycle(original) !== 'issued' || original.document_type !== 'invoice') {
    throw new ApiError(409, 'Creditnota vereist een uitgegeven originele factuur');
  }
  const existing = await getEntity(base44, 'SalesInvoice').filter({ idempotency_key: idempotencyKey }, '-created_date', 1);
  if (existing.length) {
    const lines = await getEntity(base44, 'SalesInvoiceLine').filter({ invoice_id: existing[0].id }, '+sequence', 1000);
    return { invoice: existing[0], lines, replayed: true, resource_type: 'SalesInvoice', resource_id: existing[0].id, category: 'billing' };
  }
  const originalLines = await getEntity(base44, 'SalesInvoiceLine').filter({ invoice_id: original.id }, '+sequence', 1000);
  const requested = Array.isArray(body.lines) && body.lines.length ? body.lines : originalLines.map((line: LooseRecord) => ({
    original_invoice_line_id: line.id,
    quantity_minor: line.quantity_minor,
  }));
  const selectedLines: LooseRecord[] = [];
  for (const [index, requestedLine] of requested.entries()) {
    const source = originalLines.find((line: LooseRecord) => line.id === requestedLine.original_invoice_line_id);
    if (!source) throw new ApiError(409, 'Creditregel verwijst niet naar de originele factuur');
    const quantity = requireInteger(requestedLine.quantity_minor ?? source.quantity_minor, 'quantity_minor', 1);
    if (quantity > Number(source.quantity_minor)) throw new ApiError(409, 'Creditregel overschrijdt originele hoeveelheid');
    const amounts = calculateAmounts(quantity, Number(source.unit_price_cents), Number(source.vat_rate_basis_points));
    selectedLines.push({
      source,
      sequence: index + 1,
      quantity_minor: -quantity,
      subtotal_cents: -amounts.subtotal_cents,
      tax_cents: -amounts.tax_cents,
      total_cents: -amounts.total_cents,
    });
  }
  const subtotal = selectedLines.reduce((sum, line) => sum + line.subtotal_cents, 0);
  const tax = selectedLines.reduce((sum, line) => sum + line.tax_cents, 0);
  const invoice = await getEntity(base44, 'SalesInvoice').create({
    company_id: original.company_id,
    customer_id: original.customer_id,
    customer_account_id: original.customer_account_id,
    invoice_run_id: null,
    document_type: 'credit_note',
    original_invoice_id: original.id,
    invoice_number: null,
    number_reservation_id: null,
    ...invoiceLifecyclePatch('draft'),
    delivery_status: 'not_scheduled',
    payment_status: 'not_due',
    dispute_hold: false,
    invoice_date: todayIso(),
    issue_date: null,
    due_date: null,
    currency: original.currency,
    customer_reference: original.customer_reference || null,
    payment_reference: null,
    company_snapshot: original.company_snapshot,
    customer_snapshot: original.customer_snapshot,
    billing_address_snapshot: original.billing_address_snapshot,
    bank_account_snapshot: original.bank_account_snapshot,
    subtotal_cents: subtotal,
    tax_total_cents: tax,
    total_cents: subtotal + tax,
    paid_cents: 0,
    open_cents: subtotal + tax,
    tax_summary: [],
    delivery_evidence_managed_file_ids: [],
    idempotency_key: idempotencyKey,
    version: 1,
    metadata: {
      correction_reason: requireString(body, 'reason'),
      created_by_user_id: user.id,
      original_invoice_number: original.invoice_number,
    },
  });
  const lines = await getEntity(base44, 'SalesInvoiceLine').bulkCreate(selectedLines.map(line => ({
    invoice_id: invoice.id,
    company_id: invoice.company_id,
    customer_id: invoice.customer_id,
    customer_account_id: invoice.customer_account_id,
    billing_candidate_id: null,
    original_invoice_line_id: line.source.id,
    source_type: 'correction',
    source_id: original.id,
    sequence: line.sequence,
    line_type: 'correction',
    description: `Correctie: ${line.source.description}`,
    service_date: line.source.service_date || null,
    period_start: line.source.period_start || null,
    period_end: line.source.period_end || null,
    quantity_minor: line.quantity_minor,
    unit: line.source.unit,
    unit_price_cents: line.source.unit_price_cents,
    subtotal_cents: line.subtotal_cents,
    vat_rate_basis_points: line.source.vat_rate_basis_points,
    tax_cents: line.tax_cents,
    total_cents: line.total_cents,
    source_snapshot: {
      original_invoice_id: original.id,
      original_invoice_number: original.invoice_number,
      original_invoice_line_id: line.source.id,
    },
    pricing_snapshot: line.source.pricing_snapshot,
    version: 1,
  })));
  return { invoice, lines, resource_type: 'SalesInvoice', resource_id: invoice.id, category: 'billing' };
}

async function handleSetInvoiceDispute(base44: LooseRecord, body: LooseRecord, expectedVersion: number) {
  const invoice = await requireRecord(base44, 'SalesInvoice', requireString(body, 'invoice_id'), 'Factuur');
  if (invoiceLifecycle(invoice) !== 'issued') throw new ApiError(409, 'Alleen een uitgegeven factuur kan een geschilblokkade krijgen');
  const hold = Boolean(body.dispute_hold);
  const reason = asString(body.reason);
  if (hold && !reason) throw new ApiError(400, 'Reden voor geschilblokkade is verplicht');
  const updated = await casUpdate(base44, 'SalesInvoice', invoice, expectedVersion, {
    dispute_hold: hold,
    dispute_reason: hold ? reason : null,
  });
  return { invoice: updated, resource_type: 'SalesInvoice', resource_id: updated.id, category: 'billing' };
}

async function handleRecordPayment(
  base44: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
) {
  if (expectedVersion !== 0) throw new ApiError(409, 'Nieuwe betaling verwacht expected_version 0');
  const existing = await getEntity(base44, 'Payment').filter({ idempotency_key: idempotencyKey }, '-created_date', 1);
  if (existing.length) return { payment: existing[0], replayed: true, resource_type: 'Payment', resource_id: existing[0].id, category: 'billing' };
  const data = requireObject(body);
  const companyId = requireString(data, 'company_id');
  const source = data.source || 'manual';
  const importFingerprint = asString(data.import_fingerprint);
  if (['csv_import', 'bank_import'].includes(source) && !importFingerprint) {
    throw new ApiError(400, 'import_fingerprint is verplicht voor deduplicerende import');
  }
  if (importFingerprint) {
    const duplicates = await getEntity(base44, 'Payment').filter({
      company_id: companyId,
      import_fingerprint: importFingerprint,
    }, '-created_date', 10);
    if (duplicates.length) return { payment: duplicates[0], replayed: true, resource_type: 'Payment', resource_id: duplicates[0].id, category: 'billing' };
  }
  const amount = requirePositiveCents(data.amount_cents, 'amount_cents');
  const payment = await getEntity(base44, 'Payment').create({
    company_id: companyId,
    customer_id: data.customer_id || null,
    customer_account_id: data.customer_account_id || null,
    payment_reference: data.payment_reference || null,
    source,
    external_transaction_id: data.external_transaction_id || null,
    import_fingerprint: importFingerprint || null,
    status: 'booked',
    received_at: data.received_at ? new Date(data.received_at).toISOString() : nowIso(),
    value_date: data.value_date ? dateOnly(data.value_date) : null,
    currency: data.currency || 'EUR',
    amount_cents: amount,
    allocated_cents: 0,
    unallocated_cents: amount,
    payer_name: data.payer_name || null,
    payer_iban_masked: data.payer_iban_masked || null,
    description: data.description || null,
    reversal_of_payment_id: null,
    idempotency_key: idempotencyKey,
    version: 1,
    metadata: data.metadata || null,
  });
  return { payment, customer_id: payment.customer_id, resource_type: 'Payment', resource_id: payment.id, category: 'billing' };
}

async function handleReversePayment(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
) {
  const payment = await requireRecord(base44, 'Payment', requireString(body, 'payment_id'), 'Betaling');
  if (versionOf(payment) !== expectedVersion) throw new ApiError(409, 'Betaling is intussen gewijzigd');
  if (payment.status === 'reversed') {
    const reversals = await getEntity(base44, 'Payment').filter({ reversal_of_payment_id: payment.id }, '-created_date', 1);
    return { payment, reversal: reversals[0] || null, replayed: true, resource_type: 'Payment', resource_id: payment.id, category: 'billing' };
  }
  const allocations = await getEntity(base44, 'PaymentAllocation').filter({
    payment_id: payment.id,
    status: 'active',
  }, '-allocated_at', 500);
  if (allocations.length) throw new ApiError(409, 'Draai eerst alle actieve betaalallocaties terug');
  const reason = requireString(body, 'reason');
  const updated = await casUpdate(base44, 'Payment', payment, expectedVersion, {
    status: 'reversed',
    reversed_at: nowIso(),
    reversal_reason: reason,
  });
  const reversal = await getEntity(base44, 'Payment').create({
    company_id: payment.company_id,
    customer_id: payment.customer_id || null,
    customer_account_id: payment.customer_account_id || null,
    payment_reference: payment.payment_reference || null,
    source: payment.source,
    external_transaction_id: null,
    import_fingerprint: null,
    status: 'booked',
    received_at: nowIso(),
    value_date: todayIso(),
    currency: payment.currency,
    amount_cents: -Number(payment.amount_cents),
    allocated_cents: 0,
    unallocated_cents: -Number(payment.amount_cents),
    payer_name: payment.payer_name || null,
    payer_iban_masked: payment.payer_iban_masked || null,
    description: `Reversal: ${reason}`,
    reversal_of_payment_id: payment.id,
    idempotency_key: `${idempotencyKey}:reversal`,
    version: 1,
    metadata: { reversed_by_user_id: user.id },
  });
  return { payment: updated, reversal, customer_id: payment.customer_id, resource_type: 'Payment', resource_id: payment.id, category: 'billing' };
}

async function handleAllocatePayment(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
) {
  const existing = await getEntity(base44, 'PaymentAllocation').filter({ idempotency_key: idempotencyKey }, '-created_date', 1);
  if (existing.length) {
    return { allocation: existing[0], replayed: true, resource_type: 'PaymentAllocation', resource_id: existing[0].id, category: 'billing' };
  }
  const payment = await requireRecord(base44, 'Payment', requireString(body, 'payment_id'), 'Betaling');
  if (versionOf(payment) !== expectedVersion) throw new ApiError(409, 'Betaling is intussen gewijzigd');
  const invoice = await requireRecord(base44, 'SalesInvoice', requireString(body, 'invoice_id'), 'Factuur');
  const invoiceExpectedVersion = requireInteger(body.invoice_expected_version, 'invoice_expected_version', 1);
  if (versionOf(invoice) !== invoiceExpectedVersion) throw new ApiError(409, 'Factuur is intussen gewijzigd');
  if (!['booked', 'partially_allocated'].includes(payment.status)) throw new ApiError(409, 'Betaling is niet beschikbaar voor allocatie');
  if (invoiceLifecycle(invoice) !== 'issued' || invoice.document_type !== 'invoice') throw new ApiError(409, 'Alleen een uitgegeven factuur kan een betaling ontvangen');
  if (invoice.dispute_hold) throw new ApiError(409, 'Factuur staat op geschilblokkade');
  if (
    payment.company_id !== invoice.company_id ||
    payment.currency !== invoice.currency ||
    (payment.customer_account_id && payment.customer_account_id !== invoice.customer_account_id)
  ) {
    throw new ApiError(409, 'Betaling en factuur verschillen in BV, klantrelatie of valuta');
  }
  const amount = requirePositiveCents(body.amount_cents, 'amount_cents');
  if (amount > Number(payment.unallocated_cents)) throw new ApiError(409, 'Allocatie overschrijdt onverdeeld betaalbedrag');
  if (amount > Number(invoice.open_cents)) throw new ApiError(409, 'Allocatie overschrijdt openstaand factuurbedrag; laat het restant als overbetaling staan');
  const newPaid = Number(invoice.paid_cents || 0) + amount;
  const newOpen = Number(invoice.total_cents) - newPaid;
  const updatedInvoice = await casUpdate(base44, 'SalesInvoice', invoice, invoiceExpectedVersion, {
    paid_cents: newPaid,
    open_cents: newOpen,
    payment_status: newOpen === 0 ? 'paid' : 'partially_paid',
    paid_at: newOpen === 0 ? nowIso() : null,
  });
  let updatedPayment: LooseRecord;
  try {
    const allocated = Number(payment.allocated_cents || 0) + amount;
    const unallocated = Number(payment.amount_cents) - allocated;
    updatedPayment = await casUpdate(base44, 'Payment', payment, expectedVersion, {
      customer_id: payment.customer_id || invoice.customer_id,
      customer_account_id: payment.customer_account_id || invoice.customer_account_id,
      allocated_cents: allocated,
      unallocated_cents: unallocated,
      status: unallocated === 0 ? 'allocated' : 'partially_allocated',
    });
  } catch (error) {
    await casUpdateLatest(base44, 'SalesInvoice', updatedInvoice.id, {
      paid_cents: invoice.paid_cents,
      open_cents: invoice.open_cents,
      payment_status: invoice.payment_status,
      paid_at: invoice.paid_at || null,
    }).catch(() => null);
    throw error;
  }
  const allocation = await getEntity(base44, 'PaymentAllocation').create({
    company_id: invoice.company_id,
    customer_id: invoice.customer_id,
    customer_account_id: invoice.customer_account_id,
    payment_id: payment.id,
    invoice_id: invoice.id,
    amount_cents: amount,
    status: 'active',
    allocated_by_user_id: user.id,
    allocated_at: nowIso(),
    idempotency_key: idempotencyKey,
    version: 1,
  });
  return { payment: updatedPayment, invoice: updatedInvoice, allocation, resource_type: 'PaymentAllocation', resource_id: allocation.id, category: 'billing' };
}

async function handleReversePaymentAllocation(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
) {
  const allocation = await requireRecord(base44, 'PaymentAllocation', requireString(body, 'allocation_id'), 'Betaalallocatie');
  if (versionOf(allocation) !== expectedVersion) throw new ApiError(409, 'Betaalallocatie is intussen gewijzigd');
  if (allocation.status === 'reversed') {
    return { allocation, replayed: true, resource_type: 'PaymentAllocation', resource_id: allocation.id, category: 'billing' };
  }
  const [payment, invoice] = await Promise.all([
    requireRecord(base44, 'Payment', allocation.payment_id, 'Betaling'),
    requireRecord(base44, 'SalesInvoice', allocation.invoice_id, 'Factuur'),
  ]);
  const paymentExpected = requireInteger(body.payment_expected_version, 'payment_expected_version', 1);
  const invoiceExpected = requireInteger(body.invoice_expected_version, 'invoice_expected_version', 1);
  if (versionOf(payment) !== paymentExpected || versionOf(invoice) !== invoiceExpected) {
    throw new ApiError(409, 'Betaling of factuur is intussen gewijzigd');
  }
  const reason = requireString(body, 'reason');
  const amount = Number(allocation.amount_cents);
  const newPaid = Math.max(0, Number(invoice.paid_cents || 0) - amount);
  const newOpen = Number(invoice.total_cents) - newPaid;
  const updatedInvoice = await casUpdate(base44, 'SalesInvoice', invoice, invoiceExpected, {
    paid_cents: newPaid,
    open_cents: newOpen,
    payment_status: newPaid === 0 ? (invoice.due_date && invoice.due_date < todayIso() ? 'overdue' : 'open') : 'partially_paid',
    paid_at: null,
  });
  let updatedPayment: LooseRecord;
  try {
    const allocated = Math.max(0, Number(payment.allocated_cents || 0) - amount);
    const unallocated = Number(payment.amount_cents) - allocated;
    updatedPayment = await casUpdate(base44, 'Payment', payment, paymentExpected, {
      allocated_cents: allocated,
      unallocated_cents: unallocated,
      status: allocated === 0 ? 'booked' : 'partially_allocated',
    });
  } catch (error) {
    await casUpdateLatest(base44, 'SalesInvoice', updatedInvoice.id, {
      paid_cents: invoice.paid_cents,
      open_cents: invoice.open_cents,
      payment_status: invoice.payment_status,
      paid_at: invoice.paid_at || null,
    }).catch(() => null);
    throw error;
  }
  const updatedAllocation = await casUpdate(base44, 'PaymentAllocation', allocation, expectedVersion, {
    status: 'reversed',
    reversed_by_user_id: user.id,
    reversed_at: nowIso(),
    reversal_reason: reason,
  });
  return {
    payment: updatedPayment,
    invoice: updatedInvoice,
    allocation: updatedAllocation,
    resource_type: 'PaymentAllocation',
    resource_id: allocation.id,
    category: 'billing',
  };
}

async function handlePaymentReminder(
  base44: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
  mode: 'create' | 'transition',
) {
  if (mode === 'create') {
    if (expectedVersion !== 0) throw new ApiError(409, 'Nieuwe herinnering verwacht expected_version 0');
    const duplicate = await getEntity(base44, 'PaymentReminder').filter({ idempotency_key: idempotencyKey }, '-created_date', 1);
    if (duplicate.length) {
      return { reminder: duplicate[0], replayed: true, resource_type: 'PaymentReminder', resource_id: duplicate[0].id, category: 'billing' };
    }
    const invoice = await requireRecord(base44, 'SalesInvoice', requireString(body, 'invoice_id'), 'Factuur');
    if (invoiceLifecycle(invoice) !== 'issued' || Number(invoice.open_cents) <= 0) throw new ApiError(409, 'Factuur heeft geen herinnerbaar openstaand bedrag');
    if (invoice.dispute_hold) throw new ApiError(409, 'Factuur staat op geschilblokkade');
    const [account, settings, existing] = await Promise.all([
      requireRecord(base44, 'CustomerAccount', invoice.customer_account_id, 'Klantrelatie'),
      getEntity(base44, 'CompanyBillingSettings').filter({ company_id: invoice.company_id }, '-updated_date', 1),
      getEntity(base44, 'PaymentReminder').filter({ invoice_id: invoice.id }, '-sequence', 100),
    ]);
    const collectionsEnabled = settings[0]?.collections_enabled === true || settings[0]?.feature_flags?.collections === true;
    if (!collectionsEnabled) throw new ApiError(409, 'Debiteurenbeheer is voor deze BV niet geactiveerd');
    if (account.dunning_profile === 'none') throw new ApiError(409, 'Klantrelatie is uitgesloten van herinneringen');
    const reminderType = body.reminder_type || (account.dunning_profile === 'b2c_wik14' ? 'wik14' : 'friendly');
    if (account.dunning_profile === 'b2c_wik14' && !['wik14', 'collection'].includes(reminderType)) {
      throw new ApiError(409, 'Consumentenflow vereist eerst een WIK14-kennisgeving');
    }
    if (reminderType === 'collection' && account.dunning_profile === 'b2c_wik14') {
      const wik14 = existing.find((item: LooseRecord) => item.reminder_type === 'wik14' && item.status === 'sent');
      if (!wik14 || plusDays(dateOnly(wik14.sent_at) || todayIso(), 14) > todayIso()) {
        throw new ApiError(409, 'WIK14-termijn van veertien dagen is nog niet verstreken');
      }
    }
    const sequence = existing.reduce((max: number, item: LooseRecord) => Math.max(max, Number(item.sequence || 0)), 0) + 1;
    const reminder = await getEntity(base44, 'PaymentReminder').create({
      company_id: invoice.company_id,
      customer_id: invoice.customer_id,
      customer_account_id: invoice.customer_account_id,
      invoice_id: invoice.id,
      sequence,
      reminder_type: reminderType,
      status: body.scheduled_for ? 'scheduled' : 'draft',
      channel: body.channel || 'email',
      scheduled_for: body.scheduled_for ? new Date(body.scheduled_for).toISOString() : null,
      due_date_snapshot: invoice.due_date || null,
      open_amount_cents: Number(invoice.open_cents),
      additional_costs_cents: requireInteger(body.additional_costs_cents ?? 0, 'additional_costs_cents', 0),
      recipient_snapshot: body.recipient_snapshot || {
        invoice_email: account.invoice_email || null,
        billing_contact_id: account.billing_contact_id || null,
      },
      document_managed_file_id: body.document_managed_file_id || null,
      idempotency_key: idempotencyKey,
      version: 1,
    });
    return { reminder, resource_type: 'PaymentReminder', resource_id: reminder.id, category: 'billing' };
  }
  const reminder = await requireRecord(base44, 'PaymentReminder', requireString(body, 'reminder_id'), 'Herinnering');
  const status = requireString(body, 'status');
  validateTransition(REMINDER_TRANSITIONS, reminder.status, status, 'Herinnering');
  const patch: LooseRecord = { status };
  if (status === 'scheduled') patch.scheduled_for = body.scheduled_for ? new Date(body.scheduled_for).toISOString() : nowIso();
  if (status === 'sent') patch.sent_at = body.sent_at ? new Date(body.sent_at).toISOString() : nowIso();
  if (status === 'failed') patch.failure_reason = requireString(body, 'reason');
  const updated = await casUpdate(base44, 'PaymentReminder', reminder, expectedVersion, patch);
  return { reminder: updated, resource_type: 'PaymentReminder', resource_id: updated.id, category: 'billing' };
}

async function handleCreateIndexationRun(
  base44: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
) {
  if (expectedVersion !== 0) throw new ApiError(409, 'Nieuwe indexatierun verwacht expected_version 0');
  const duplicate = await getEntity(base44, 'PriceIndexRun').filter({ idempotency_key: idempotencyKey }, '-created_date', 1);
  if (duplicate.length) {
    return { index_run: duplicate[0], replayed: true, resource_type: 'PriceIndexRun', resource_id: duplicate[0].id, category: 'commercial' };
  }
  const profile = await requireRecord(base44, 'PriceIndexProfile', requireString(body, 'price_index_profile_id'), 'Indexatieprofiel');
  if (profile.status !== 'active') throw new ApiError(409, 'Indexatieprofiel is niet actief');
  const percentage = Number(body.percentage_basis_points ?? profile.default_percentage_basis_points);
  if (!Number.isInteger(percentage) || percentage <= -10000 || percentage > 100000) {
    throw new ApiError(400, 'percentage_basis_points valt buiten toegestaan bereik');
  }
  const effectiveDate = dateOnly(requireString(body, 'effective_date'));
  if (!effectiveDate) throw new ApiError(400, 'Ongeldige ingangsdatum');
  const run = await getEntity(base44, 'PriceIndexRun').create({
    company_id: profile.company_id,
    price_index_profile_id: profile.id,
    effective_date: effectiveDate,
    percentage_basis_points: percentage,
    status: 'draft',
    source_snapshot: {
      profile_name: profile.name,
      method: profile.method,
      source_reference: body.source_reference || profile.source_reference || null,
      prepared_at: nowIso(),
    },
    affected_rate_ids: [],
    created_rate_ids: [],
    result_summary: null,
    idempotency_key: idempotencyKey,
    version: 1,
  });
  return { index_run: run, resource_type: 'PriceIndexRun', resource_id: run.id, category: 'commercial' };
}

async function handleTransitionIndexationRun(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
) {
  const run = await requireRecord(base44, 'PriceIndexRun', requireString(body, 'index_run_id'), 'Indexatierun');
  const status = requireString(body, 'status');
  validateTransition(INDEX_TRANSITIONS, run.status, status, 'Indexatierun');
  if (status === 'applied') throw new ApiError(409, 'Gebruik apply_indexation_run voor tariefversies');
  const patch: LooseRecord = { status };
  if (status === 'approved') {
    patch.approved_by_user_id = user.id;
    patch.approved_at = nowIso();
  }
  const updated = await casUpdate(base44, 'PriceIndexRun', run, expectedVersion, patch);
  return { index_run: updated, resource_type: 'PriceIndexRun', resource_id: updated.id, category: 'commercial' };
}

function indexedAmount(amountCents: number, percentageBasisPoints: number, roundingMode: string) {
  const raw = amountCents * (10000 + percentageBasisPoints) / 10000;
  if (roundingMode === 'up_cent') return Math.ceil(raw);
  if (roundingMode === 'down_cent') return Math.floor(raw);
  return Math.round(raw + Number.EPSILON);
}

async function handleApplyIndexationRun(
  base44: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
) {
  const run = await requireRecord(base44, 'PriceIndexRun', requireString(body, 'index_run_id'), 'Indexatierun');
  if (versionOf(run) !== expectedVersion) throw new ApiError(409, 'Indexatierun is intussen gewijzigd');
  if (run.status !== 'approved') throw new ApiError(409, 'Alleen een goedgekeurde indexatierun kan worden toegepast');
  const profile = await requireRecord(base44, 'PriceIndexProfile', run.price_index_profile_id, 'Indexatieprofiel');
  const allProfileRates = await getEntity(base44, 'CustomerContractRate').filter({
    company_id: run.company_id,
    price_index_profile_id: profile.id,
    status: 'active',
  }, '+valid_from', 5000);
  const rates = allProfileRates.filter((rate: LooseRecord) =>
    isDateInRange(run.effective_date, rate.valid_from, rate.valid_until));
  const expectedRates = body.rate_expected_versions;
  if (!expectedRates || typeof expectedRates !== 'object') throw new ApiError(400, 'rate_expected_versions is verplicht');
  for (const rate of rates) {
    if (versionOf(rate) !== Number(expectedRates[rate.id])) {
      throw new ApiError(409, `Tarief ${rate.id} is intussen gewijzigd`);
    }
    if (rate.valid_from >= run.effective_date) {
      throw new ApiError(409, `Tarief ${rate.id} start op of na de indexatiedatum`);
    }
    const overlappingActiveRates = await getEntity(base44, 'CustomerContractRate').filter({
      contract_line_id: rate.contract_line_id,
      unit: rate.unit,
      status: 'active',
    }, '+valid_from', 1000);
    const conflicting = overlappingActiveRates.find((other: LooseRecord) =>
      other.id !== rate.id &&
      isDateInRange(run.effective_date, other.valid_from, other.valid_until));
    if (conflicting) {
      throw new ApiError(409, `Tarief ${rate.id} overlapt op de indexatiedatum met ${conflicting.id}`);
    }
  }
  const created: LooseRecord[] = [];
  for (const rate of rates) {
    const amount = indexedAmount(
      Number(rate.amount_cents),
      Number(run.percentage_basis_points),
      profile.rounding_mode || 'half_up_cent',
    );
    if (!Number.isSafeInteger(amount) || amount < 0) throw new ApiError(409, `Indexatiebedrag voor tarief ${rate.id} is ongeldig`);
    const ended = await casUpdate(base44, 'CustomerContractRate', rate, Number(expectedRates[rate.id]), {
      status: 'superseded',
      valid_until: previousDay(run.effective_date),
    });
    created.push(await getEntity(base44, 'CustomerContractRate').create({
      contract_id: ended.contract_id,
      contract_line_id: ended.contract_line_id,
      company_id: ended.company_id,
      customer_id: ended.customer_id,
      customer_account_id: ended.customer_account_id,
      rate_code: ended.rate_code || null,
      unit: ended.unit,
      amount_cents: amount,
      currency: ended.currency,
      vat_rate_basis_points: ended.vat_rate_basis_points,
      minimum_quantity_minor: ended.minimum_quantity_minor || 0,
      rounding_increment_minor: ended.rounding_increment_minor || 1,
      priority: ended.priority || 0,
      price_index_profile_id: profile.id,
      source_rate_id: ended.id,
      status: 'active',
      valid_from: run.effective_date,
      valid_until: rate.valid_until || null,
      version: 1,
      metadata: {
        ...(ended.metadata || {}),
        price_index_run_id: run.id,
        percentage_basis_points: run.percentage_basis_points,
      },
    }));
  }
  const updated = await casUpdate(base44, 'PriceIndexRun', run, expectedVersion, {
    status: 'applied',
    affected_rate_ids: rates.map((rate: LooseRecord) => rate.id),
    created_rate_ids: created.map(rate => rate.id),
    result_summary: { affected: rates.length, created: created.length },
    applied_at: nowIso(),
  });
  return { index_run: updated, created_rates: created, resource_type: 'PriceIndexRun', resource_id: run.id, category: 'commercial' };
}

async function createMigrationIssue(
  base44: LooseRecord,
  user: LooseRecord,
  customer: LooseRecord,
  idempotencyKey: string,
  code: string,
  message: string,
  details: LooseRecord,
) {
  return appendEvent(base44, {
    customer_id: customer.id,
    event_type: 'customer.migration_issue',
    category: 'system',
    action: 'migration_issue',
    actor_type: 'system',
    actor_id: user.id,
    resource_type: 'Customer',
    resource_id: customer.id,
    payload: { code, message, ...details },
    idempotency_key: `${idempotencyKey}:issue:${customer.id}:${code}`,
  });
}

async function migrateLegacyCommercialDraft(
  base44: LooseRecord,
  customer: LooseRecord,
  account: LooseRecord,
  idempotencyKey: string,
) {
  const objects = await getEntity(base44, 'SurveillanceObject').filter({ customer_id: customer.id }, '+name', 1000);
  const collectives = await getEntity(base44, 'Collectief').filter({ customer_id: customer.id }, '+name', 1000);
  const objectIds = objects.map((item: LooseRecord) => item.id);
  const collectiveIds = collectives.map((item: LooseRecord) => item.id);
  const [objectTasks, collectiveTasks] = await Promise.all([
    objectIds.length
      ? getEntity(base44, 'Task').filter({ object_id: { $in: objectIds } }, '+created_date', 5000)
      : Promise.resolve([]),
    collectiveIds.length
      ? getEntity(base44, 'Task').filter({ collectief_id: { $in: collectiveIds } }, '+created_date', 5000)
      : Promise.resolve([]),
  ]);
  const tasksById = new Map<string, LooseRecord>();
  for (const task of [...objectTasks, ...collectiveTasks]) {
    if (!task.is_free && Number(task.price_amount) > 0) tasksById.set(task.id, task);
  }
  const tasks = [...tasksById.values()];
  if (!tasks.length) return { contract: null, line_count: 0 };
  const contractIdempotency = `${idempotencyKey}:legacy-contract:${customer.id}:${account.id}`;
  const existing = await getEntity(base44, 'CustomerContract').filter({ idempotency_key: contractIdempotency }, '-created_date', 1);
  if (existing.length) {
    const lines = await getEntity(base44, 'CustomerContractLine').filter({ contract_id: existing[0].id }, '+sequence', 5000);
    return { contract: existing[0], line_count: lines.length, replayed: true };
  }
  const [company] = await Promise.all([
    requireRecord(base44, 'Company', account.company_id, 'Bedrijf'),
  ]);
  const contract = await getEntity(base44, 'CustomerContract').create({
    company_id: account.company_id,
    customer_id: customer.id,
    customer_account_id: account.id,
    source_quote_id: null,
    contract_number: null,
    number_reservation_id: null,
    version: 1,
    document_version: 1,
    supersedes_contract_id: null,
    status: 'draft',
    title: 'Gemigreerde legacy taakprijzen',
    description: 'Conceptcontract ter controle; niet automatisch activeren.',
    currency: account.currency || 'EUR',
    start_date: null,
    end_date: null,
    notice_period_days: null,
    auto_renew: false,
    billing_frequency: account.billing_frequency || 'monthly',
    customer_snapshot: customerSnapshot(customer, account),
    company_snapshot: companySnapshot(company),
    template_id: null,
    unsigned_managed_file_id: null,
    signed_managed_file_id: null,
    document_signature_id: null,
    idempotency_key: contractIdempotency,
    metadata: {
      migration_source: 'legacy_task_prices',
      review_required: true,
      must_not_auto_activate: true,
    },
  });
  let sequence = 1;
  for (const task of tasks) {
    const perMinute = task.pricing_type === 'per_minuut';
    const scopeType = task.object_id ? 'object' : task.collectief_id ? 'collective' : 'customer';
    const line = await getEntity(base44, 'CustomerContractLine').create({
      contract_id: contract.id,
      company_id: contract.company_id,
      customer_id: contract.customer_id,
      customer_account_id: contract.customer_account_id,
      sequence,
      service_code: task.task_type || null,
      name: task.name || task.task_type || `Legacy taak ${sequence}`,
      description: 'Gemigreerd uit legacy Task.price_amount; controle en goedkeuring vereist.',
      scope_type: scopeType,
      object_id: task.object_id || null,
      collective_id: task.collectief_id || null,
      billing_model: perMinute ? 'per_minute' : 'per_execution',
      billing_frequency: 'on_completion',
      included_quantity_minor: 0,
      currency: contract.currency,
      vat_rate_basis_points: 2100,
      status: 'draft',
      valid_from: null,
      valid_until: null,
      version: 1,
      metadata: { legacy_task_id: task.id, migration_review_required: true },
    });
    await getEntity(base44, 'CustomerContractRate').create({
      contract_id: contract.id,
      contract_line_id: line.id,
      company_id: contract.company_id,
      customer_id: contract.customer_id,
      customer_account_id: contract.customer_account_id,
      rate_code: null,
      unit: perMinute ? 'minute' : 'execution',
      amount_cents: Math.round(Number(task.price_amount) * 100),
      currency: contract.currency,
      vat_rate_basis_points: 2100,
      minimum_quantity_minor: 0,
      rounding_increment_minor: 1,
      priority: 0,
      price_index_profile_id: null,
      source_rate_id: null,
      status: 'draft',
      valid_from: todayIso(),
      valid_until: null,
      version: 1,
      metadata: { legacy_task_id: task.id, migration_review_required: true },
    });
    sequence += 1;
  }
  return { contract, line_count: sequence - 1 };
}

async function handleMigrateLegacyCustomers(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
) {
  if (expectedVersion !== 0) throw new ApiError(409, 'Batchmigratie verwacht expected_version 0');
  const dryRun = body.dry_run !== false;
  const limit = Math.min(100, requireInteger(body.limit ?? 25, 'limit', 1));
  const skip = requireInteger(body.skip ?? 0, 'skip', 0);
  const customerId = asString(body.customer_id);
  const [customers, activeCompanies] = await Promise.all([
    customerId
      ? getEntity(base44, 'Customer').filter({ id: customerId }, '+created_date', 1)
      : getEntity(base44, 'Customer').list('+created_date', limit, skip),
    getEntity(base44, 'Company').filter({ status: 'active' }, '+created_date', 5000),
  ]);
  const results: LooseRecord[] = [];
  for (const customer of customers) {
    const result: LooseRecord = {
      customer_id: customer.id,
      dry_run: dryRun,
      created: [],
      issues: [],
      legacy_contract_line_count: 0,
    };
    let accounts = await getEntity(base44, 'CustomerAccount').filter({
      customer_id: customer.id,
      status: { $in: ['active', 'pending'] },
    }, '-is_primary', 100);
    if (!accounts.length) {
      if (activeCompanies.length === 1) {
        result.created.push('CustomerAccount');
        if (!dryRun) {
          const account = await getEntity(base44, 'CustomerAccount').create({
            customer_id: customer.id,
            company_id: activeCompanies[0].id,
            debtor_number: null,
            status: 'active',
            is_primary: true,
            account_manager_id: null,
            billing_name: customer.legal_name || customer.name,
            invoice_email: customer.email || null,
            currency: 'EUR',
            payment_term_days: 30,
            billing_frequency: 'monthly',
            invoice_delivery_method: 'email',
            peppol_required: false,
            allow_email_fallback: true,
            finance_hold: false,
            dunning_profile: customer.customer_type === 'particulier' ? 'b2c_wik14' : 'b2b_standard',
            version: 1,
            metadata: { migration_source: 'legacy_customer' },
          });
          accounts = [account];
        } else {
          accounts = [{
            id: 'dry-run-account',
            customer_id: customer.id,
            company_id: activeCompanies[0].id,
            currency: 'EUR',
            billing_frequency: 'monthly',
          }];
        }
      } else {
        const issue = {
          code: activeCompanies.length ? 'multiple_active_companies' : 'no_active_company',
          message: activeCompanies.length
            ? 'Geen automatische CustomerAccount: meerdere actieve BV’s'
            : 'Geen automatische CustomerAccount: geen actieve BV',
          active_company_ids: activeCompanies.map((company: LooseRecord) => company.id),
        };
        result.issues.push(issue);
        if (!dryRun) {
          await createMigrationIssue(base44, user, customer, idempotencyKey, issue.code, issue.message, issue);
        }
      }
    }

    let contacts = await getEntity(base44, 'CustomerContact').filter({ customer_id: customer.id }, '-is_primary', 100);
    if (!contacts.length && (asString(customer.contact_person) || asString(customer.email) || asString(customer.phone))) {
      result.created.push('CustomerContact');
      if (!dryRun) {
        const contact = await getEntity(base44, 'CustomerContact').create({
          customer_id: customer.id,
          display_name: asString(customer.contact_person) || customer.name,
          preferred_language: customer.preferred_language || 'nl',
          preferred_channel: customer.email ? 'email' : customer.phone ? 'phone' : 'none',
          is_primary: true,
          status: 'active',
          version: 1,
          metadata: { migration_source: 'legacy_customer' },
        });
        contacts = [contact];
        if (asString(customer.email)) {
          await getEntity(base44, 'CustomerContactPoint').create({
            customer_id: customer.id,
            contact_id: contact.id,
            point_type: 'email',
            value: asString(customer.email),
            normalized_value: normalizeEmail(customer.email),
            is_primary: true,
            purposes: ['general'],
            status: 'active',
            consent_status: 'not_required',
            version: 1,
            metadata: { migration_source: 'legacy_customer' },
          });
          result.created.push('CustomerContactPoint:email');
        }
        if (asString(customer.phone)) {
          await getEntity(base44, 'CustomerContactPoint').create({
            customer_id: customer.id,
            contact_id: contact.id,
            point_type: 'phone',
            value: asString(customer.phone),
            normalized_value: normalizePhone(customer.phone),
            is_primary: true,
            purposes: ['general'],
            status: 'active',
            consent_status: 'not_required',
            version: 1,
            metadata: { migration_source: 'legacy_customer' },
          });
          result.created.push('CustomerContactPoint:phone');
        }
        await getEntity(base44, 'CustomerContactRole').create({
          customer_id: customer.id,
          customer_account_id: accounts.length === 1 && accounts[0].id !== 'dry-run-account' ? accounts[0].id : null,
          contact_id: contact.id,
          role: 'primary',
          object_ids: [],
          is_primary: true,
          status: 'active',
          version: 1,
          notes: 'Gemigreerd uit legacy primaire contactvelden.',
        });
        result.created.push('CustomerContactRole');
      } else {
        result.created.push('CustomerContactPoint/Role');
      }
    }

    const addresses = await getEntity(base44, 'CustomerAddress').filter({ customer_id: customer.id }, '-is_primary', 100);
    if (!addresses.length && asString(customer.address)) {
      result.created.push('CustomerAddress');
      if (!dryRun) {
        await getEntity(base44, 'CustomerAddress').create({
          customer_id: customer.id,
          customer_account_id: null,
          address_type: 'visiting',
          label: 'Bezoekadres',
          formatted_address: asString(customer.address),
          address_line_2: asString(customer.address),
          country_code: 'NL',
          country_name: 'Nederland',
          is_primary: true,
          status: 'active',
          version: 1,
          metadata: {
            migration_source: 'legacy_customer',
            parsing_required: true,
          },
        });
      }
    }

    const activeAccounts = accounts.filter((account: LooseRecord) => ['active', 'pending'].includes(account.status || 'active'));
    if (activeAccounts.length === 1) {
      if (!dryRun && activeAccounts[0].id !== 'dry-run-account') {
        const commercial = await migrateLegacyCommercialDraft(base44, customer, activeAccounts[0], idempotencyKey);
        result.legacy_contract_id = commercial.contract?.id || null;
        result.legacy_contract_line_count = commercial.line_count;
        if (commercial.contract && !commercial.replayed) result.created.push('CustomerContract:draft');
      } else {
        result.legacy_pricing_action = 'would_create_draft_only';
      }
    } else if (activeAccounts.length > 1) {
      const issue = {
        code: 'multiple_customer_accounts',
        message: 'Legacy taakprijzen niet gemigreerd: meerdere klantrelaties, handmatige keuze vereist',
        customer_account_ids: activeAccounts.map((account: LooseRecord) => account.id),
      };
      result.issues.push(issue);
      if (!dryRun) await createMigrationIssue(base44, user, customer, idempotencyKey, issue.code, issue.message, issue);
    }

    if (!dryRun && result.created.length) {
      await syncLegacyMirrors(base44, customer.id);
      await appendEvent(base44, {
        company_id: activeAccounts.length === 1 ? activeAccounts[0].company_id : null,
        customer_id: customer.id,
        customer_account_id: activeAccounts.length === 1 ? activeAccounts[0].id : null,
        event_type: 'customer.legacy_migrated',
        category: 'system',
        action: 'migrate_legacy_customer',
        actor_type: 'system',
        actor_id: user.id,
        resource_type: 'Customer',
        resource_id: customer.id,
        payload: result,
        idempotency_key: `${idempotencyKey}:customer:${customer.id}`,
      });
    }
    results.push(result);
  }
  return {
    dry_run: dryRun,
    items: results,
    processed: results.length,
    next_skip: customerId || results.length < limit ? null : skip + results.length,
    customer_id: results[0]?.customer_id || null,
    resource_type: 'Customer',
    resource_id: results[0]?.customer_id || null,
    category: 'system',
  };
}

async function executeMutation(
  base44: LooseRecord,
  user: LooseRecord,
  action: string,
  body: LooseRecord,
  expectedVersion: number,
  idempotencyKey: string,
  requestFingerprint: string,
  target: string,
): Promise<LooseRecord> {
  switch (action) {
    case 'create_customer':
      return handleCreateCustomer(base44, body, expectedVersion, idempotencyKey);
    case 'update_customer':
      return handleUpdateCustomer(base44, body, expectedVersion);
    case 'set_customer_status':
      return handleSetCustomerStatus(base44, user, body, expectedVersion);
    case 'delete_empty_customer':
      return handleDeleteEmptyCustomer(base44, user, body, expectedVersion, idempotencyKey, target);
    case 'create_customer_object':
      return handleCreateCustomerObject(
        base44,
        user,
        body,
        expectedVersion,
        idempotencyKey,
        requestFingerprint,
        target,
      );
    case 'update_customer_object_identity':
      return handleUpdateCustomerObjectIdentity(
        base44,
        user,
        body,
        expectedVersion,
        idempotencyKey,
        requestFingerprint,
        target,
      );
    case 'update_customer_object_operations':
      return handleUpdateCustomerObjectOperations(
        base44,
        user,
        body,
        expectedVersion,
        idempotencyKey,
        requestFingerprint,
        target,
      );
    case 'set_customer_object_status':
      return handleSetCustomerObjectStatus(
        base44,
        user,
        body,
        expectedVersion,
        idempotencyKey,
        requestFingerprint,
        target,
      );
    case 'create_object_warning_address':
      return handleObjectWarningAddress(
        base44,
        user,
        body,
        expectedVersion,
        idempotencyKey,
        requestFingerprint,
        target,
        'create',
      );
    case 'update_object_warning_address': return handleObjectWarningAddress(base44, user, body, expectedVersion, idempotencyKey, requestFingerprint, target, 'update');
    case 'delete_object_warning_address': return handleDeleteObjectWarningAddress(base44, user, body, expectedVersion, idempotencyKey, requestFingerprint, target);
    case 'reorder_object_warning_addresses':
      return handleReorderObjectWarningAddresses(base44, user, body, idempotencyKey, requestFingerprint, target);
    case 'upsert_warning_availability_overrides':
    case 'delete_warning_availability_override':
      return handleWarningAvailabilityMutation(base44, user, action, body, expectedVersion, idempotencyKey, requestFingerprint, target);
    case 'create_object_key':
    case 'update_object_key':
    case 'archive_object_key':
      return handleObjectKeyMutation(base44, user, action, body, expectedVersion, idempotencyKey, requestFingerprint, target);
    case 'create_object_installation':
    case 'update_object_installation':
    case 'archive_object_installation':
      return handleObjectInstallationMutation(base44, user, action, body, expectedVersion, idempotencyKey, requestFingerprint, target);
    case 'create_customer_account':
      return handleCustomerAccount(base44, body, expectedVersion, 'create');
    case 'update_customer_account':
      return handleCustomerAccount(base44, body, expectedVersion, 'update');
    case 'archive_customer_account':
      return handleCustomerAccount(base44, body, expectedVersion, 'archive');
    case 'create_customer_address':
      return handleCustomerAddress(base44, body, expectedVersion, 'create');
    case 'update_customer_address':
      return handleCustomerAddress(base44, body, expectedVersion, 'update');
    case 'archive_customer_address':
      return handleCustomerAddress(base44, body, expectedVersion, 'archive');
    case 'create_customer_contact':
      return handleCustomerContact(base44, body, expectedVersion, 'create');
    case 'update_customer_contact':
      return handleCustomerContact(base44, body, expectedVersion, 'update');
    case 'archive_customer_contact':
      return handleCustomerContact(base44, body, expectedVersion, 'archive');
    case 'create_contact_point':
      return handleContactPoint(base44, body, expectedVersion, 'create');
    case 'update_contact_point':
      return handleContactPoint(base44, body, expectedVersion, 'update');
    case 'archive_contact_point':
      return handleContactPoint(base44, body, expectedVersion, 'archive');
    case 'create_contact_role':
      return handleContactRole(base44, body, expectedVersion, 'create');
    case 'update_contact_role':
      return handleContactRole(base44, body, expectedVersion, 'update');
    case 'archive_contact_role':
      return handleContactRole(base44, body, expectedVersion, 'archive');
    case 'create_customer_request':
      return handleCustomerRequest(base44, user, body, expectedVersion, idempotencyKey, 'create');
    case 'transition_customer_request':
      return handleCustomerRequest(base44, user, body, expectedVersion, idempotencyKey, 'transition');
    case 'create_quote':
      return handleCreateQuote(base44, body, expectedVersion, idempotencyKey);
    case 'update_quote':
      return handleUpdateQuote(base44, body, expectedVersion);
    case 'create_quote_line':
      return handleQuoteLine(base44, body, expectedVersion, 'create');
    case 'update_quote_line':
      return handleQuoteLine(base44, body, expectedVersion, 'update');
    case 'delete_quote_line':
      return handleQuoteLine(base44, body, expectedVersion, 'delete');
    case 'revise_quote':
      return handleReviseQuote(base44, body, expectedVersion, idempotencyKey);
    case 'transition_quote':
      return handleTransitionQuote(base44, user, body, expectedVersion, idempotencyKey);
    case 'convert_quote':
      return handleConvertQuote(base44, body, expectedVersion, idempotencyKey);
    case 'create_contract':
      return handleCreateContract(base44, body, expectedVersion, idempotencyKey);
    case 'update_contract':
      return handleUpdateContract(base44, body, expectedVersion);
    case 'transition_contract':
      return handleTransitionContract(base44, user, body, expectedVersion, idempotencyKey);
    case 'create_contract_line':
      return handleContractLine(base44, body, expectedVersion, 'create');
    case 'update_contract_line':
      return handleContractLine(base44, body, expectedVersion, 'update');
    case 'transition_contract_line':
      return handleContractLine(base44, body, expectedVersion, 'transition');
    case 'create_contract_rate':
      return handleContractRate(base44, body, expectedVersion, 'create');
    case 'update_contract_rate':
      return handleContractRate(base44, body, expectedVersion, 'update');
    case 'transition_contract_rate':
      return handleContractRate(base44, body, expectedVersion, 'transition');
    case 'create_billing_candidate':
      return {
        ...(await materializeBillingCandidate(base44, {
          executionId: requireString(body, 'task_execution_id'),
          expectedVersion,
          idempotencyKey,
          actorId: user.id,
          actorType: 'user',
        })),
        resource_type: 'BillingCandidate',
        category: 'billing',
      };
    case 'transition_billing_candidate':
      return handleTransitionBillingCandidate(base44, user, body, expectedVersion);
    case 'create_invoice_draft':
      return handleCreateInvoiceDraft(base44, user, body, expectedVersion, idempotencyKey);
    case 'create_invoice_run':
      return handleCreateInvoiceRun(base44, user, body, expectedVersion, idempotencyKey);
    case 'update_invoice':
      return handleUpdateInvoice(base44, body, expectedVersion);
    case 'transition_invoice':
      return handleTransitionInvoice(base44, body, expectedVersion);
    case 'issue_invoice':
      return handleIssueInvoice(base44, body, expectedVersion, idempotencyKey);
    case 'create_credit_note':
      return handleCreateCreditNote(base44, user, body, expectedVersion, idempotencyKey);
    case 'set_invoice_dispute':
      return handleSetInvoiceDispute(base44, body, expectedVersion);
    case 'record_payment':
      return handleRecordPayment(base44, body, expectedVersion, idempotencyKey);
    case 'reverse_payment':
      return handleReversePayment(base44, user, body, expectedVersion, idempotencyKey);
    case 'allocate_payment':
      return handleAllocatePayment(base44, user, body, expectedVersion, idempotencyKey);
    case 'reverse_payment_allocation':
      return handleReversePaymentAllocation(base44, user, body, expectedVersion);
    case 'create_payment_reminder':
      return handlePaymentReminder(base44, body, expectedVersion, idempotencyKey, 'create');
    case 'transition_payment_reminder':
      return handlePaymentReminder(base44, body, expectedVersion, idempotencyKey, 'transition');
    case 'create_indexation_run':
      return handleCreateIndexationRun(base44, body, expectedVersion, idempotencyKey);
    case 'transition_indexation_run':
      return handleTransitionIndexationRun(base44, user, body, expectedVersion);
    case 'apply_indexation_run':
      return handleApplyIndexationRun(base44, body, expectedVersion);
    case 'migrate_legacy_customers':
      return handleMigrateLegacyCustomers(base44, user, body, expectedVersion, idempotencyKey);
    default:
      throw new ApiError(400, 'Onbekende mutatie');
  }
}

export async function handleCustomerPlatformRequest(req: Request) {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  try {
    const base44 = createClientFromRequest(req) as LooseRecord;
    const user = await base44.auth.me().catch(() => null);
    requireAdmin(user);
    const body = await req.json().catch(() => ({})) as LooseRecord;
    const action = asString(body.action);
    if (!action) throw new ApiError(400, 'action is verplicht');

    if (READ_ACTIONS.has(action)) {
      if (action === 'get_customer_overview') return json(await handleGetCustomerOverview(base44, body));
      if (action === 'search_customer_objects') return json(await handleSearchCustomerObjects(base44, body));
      if (action === 'list_object_warning_addresses') return json(await handleListObjectWarningAddresses(base44, body));
      if (action === 'list_object_logbook') return json(await handleListObjectLogbook(base44, body));
      if (action === 'list_object_keys') return json(await handleListObjectKeys(base44, body));
      if (action === 'list_object_installations') return json(await handleListObjectInstallations(base44, body));
      if (action === 'list_commercial') return json(await listRecords(base44, body, ['quote', 'contract', 'rate']));
      if (action === 'list_billing') return json(await listRecords(base44, body, ['candidate', 'invoice', 'payment', 'reminder', 'run']));
      if (action === 'validate_contract_rates') {
        const result = await rateValidation(base44, requireString(body, 'contract_line_id'));
        return json({
          items: result.rates,
          total: result.rates.length,
          overlaps: result.overlaps,
          gaps: result.gaps,
          valid: result.valid,
          page: 1,
          page_size: result.rates.length,
        });
      }
    }

    if (!MUTATION_ACTIONS.has(action)) throw new ApiError(400, 'Onbekende actie');
    const { idempotencyKey, expectedVersion } = requireMutationEnvelope(body);
    const requestFingerprint = await mutationRequestFingerprint(action, body);
    const target = mutationTarget(action, body);
    const replay = await mutationReplay(base44, user, action, body, idempotencyKey, requestFingerprint, target);
    if (replay) return json({ ok: true, ...replay, replayed: true });
    const recovered = await warningAddressMutationMarkerReplay(
      base44,
      user,
      action,
      body,
      idempotencyKey,
      requestFingerprint,
      target,
    ) || await installationMutationMarkerReplay(
      base44,
      user,
      action,
      body,
      idempotencyKey,
      requestFingerprint,
      target,
    ) || await objectKeyMutationMarkerReplay(
      base44,
      user,
      action,
      body,
      idempotencyKey,
      requestFingerprint,
      target,
    ) || await customerObjectMutationMarkerReplay(
      base44,
      user,
      action,
      body,
      idempotencyKey,
      requestFingerprint,
      target,
    );
    if (recovered) {
      await recordMutationResult(
        base44,
        user,
        action,
        idempotencyKey,
        recovered,
        body,
        requestFingerprint,
        target,
      );
      return json({ ok: true, ...recovered, replayed: true, recovered_from_object_marker: true });
    }
    const result = await executeMutation(
      base44,
      user,
      action,
      body,
      expectedVersion,
      idempotencyKey,
      requestFingerprint,
      target,
    );
    if (!(action === 'migrate_legacy_customers' && result.dry_run)) {
      await recordMutationResult(
        base44,
        user,
        action,
        idempotencyKey,
        result,
        body,
        requestFingerprint,
        target,
      );
    }
    return json({ ok: true, ...result, replayed: Boolean(result.replayed) }, action.startsWith('create_') ? 201 : 200);
  } catch (error) {
    const status = Number((error as LooseRecord)?.status || 500);
    console.error('[customerPlatformApi]', requestId, error);
    return json({
      error: status >= 500 ? 'Klantplatformactie mislukt' : (error as Error)?.message || 'Actie mislukt',
      details: (error as LooseRecord)?.details || null,
      request_id: requestId,
    }, status);
  }
}

export default handleCustomerPlatformRequest;
