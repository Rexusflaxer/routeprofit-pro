import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

declare const Deno: {
  env: { get(name: string): string | undefined };
};

type LooseRecord = Record<string, any>;
type AutomationActor = {
  id: string | null;
  type: 'user' | 'system';
};

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

const ALLOWED_ACTIONS = new Set([
  'run_due_work',
  'expire_quotes',
  'generate_billing_candidates',
  'schedule_reminders',
  'prepare_indexation',
  'collect_invoice_run',
]);

const DEFAULT_DUNNING_STEPS: Record<string, LooseRecord[]> = {
  b2b_standard: [
    { sequence: 1, reminder_type: 'friendly', days_after_due: 1, channel: 'email' },
    { sequence: 2, reminder_type: 'first', days_after_due: 7, channel: 'email' },
    { sequence: 3, reminder_type: 'second', days_after_due: 14, channel: 'email' },
    { sequence: 4, reminder_type: 'final', days_after_due: 21, channel: 'email' },
  ],
  b2c_wik14: [
    { sequence: 1, reminder_type: 'wik14', days_after_due: 1, channel: 'email' },
  ],
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function asString(value: unknown) {
  return String(value ?? '').trim();
}

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  return nowIso().slice(0, 10);
}

function dateOnly(value: unknown) {
  const parsed = new Date(asString(value));
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function plusDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || !Number.isInteger(days)) {
    throw new ApiError(400, 'Ongeldige datumverschuiving');
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isDateInRange(date: string, from: unknown, until: unknown) {
  const lower = asString(from);
  const upper = asString(until);
  return (!lower || lower <= date) && (!upper || upper >= date);
}

const COMMERCIAL_TASK_TYPE_KEYS = new Set([
  'object_security', 'fire_closing_round', 'external_closing_round',
  'external_control_round', 'opening_round', 'mobile_control_round',
  'reception', 'closing_assistance', 'access_control', 'fire_watch', 'concierge',
]);
const LEGACY_COMMERCIAL_TASK_TYPE_ALIASES: Record<string, string> = {
  objectbeveiliging: 'object_security',
  brand_en_sluitronde: 'fire_closing_round',
  brand_sluitronde: 'fire_closing_round',
  externe_sluitronde: 'external_closing_round',
  externe_controleronde: 'external_control_round',
  openingsronde: 'opening_round',
  mobiele_controleronde: 'mobile_control_round',
  receptie: 'reception',
  receptiedienst: 'reception',
  sluitbegeleiding: 'closing_assistance',
  toegangscontrole: 'access_control',
  brandwacht: 'fire_watch',
  portier: 'concierge',
  portier_concierge: 'concierge',
  concierge: 'concierge',
};

function normalizedCommercialTaskToken(value: unknown) {
  return asString(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function legacyCommercialTaskTypeKey(value: unknown) {
  const normalized = normalizedCommercialTaskToken(value);
  if (!normalized) return null;
  if (COMMERCIAL_TASK_TYPE_KEYS.has(normalized) && normalized !== 'other') return normalized;
  return LEGACY_COMMERCIAL_TASK_TYPE_ALIASES[normalized] || null;
}

function isCanonicalCommercialTaskTypeKey(value: unknown) {
  const key = asString(value);
  return COMMERCIAL_TASK_TYPE_KEYS.has(key)
    || /^other:[a-z0-9][a-z0-9._:-]{0,159}$/.test(key);
}

function canonicalContractLineTaskTypeKey(line: LooseRecord) {
  const explicit = asString(line.task_type_key);
  if (explicit) return isCanonicalCommercialTaskTypeKey(explicit) ? explicit : null;
  return legacyCommercialTaskTypeKey(line.service_code);
}

function uniqueCommercialValues(values: unknown[]) {
  return [...new Set(values.map(asString).filter(Boolean))];
}

function canonicalExecutionTaskType(
  execution: LooseRecord,
  sourceTask: LooseRecord | null,
) {
  const explicitKeys = uniqueCommercialValues([
    execution.task_type_key,
    execution.commercial_routing_snapshot?.task_type_key,
    sourceTask?.task_type_key,
  ]);
  const invalidExplicit = explicitKeys.filter(key => !isCanonicalCommercialTaskTypeKey(key));
  if (invalidExplicit.length) {
    return { key: null, blocked: ['invalid_task_type_key', 'De uitvoering bevat een ongeldige canonieke taaksoort'] };
  }
  const hasSpecificCustomKey = explicitKeys.some(key => key.startsWith('other:'));
  const legacyValues = uniqueCommercialValues([execution.task_type, sourceTask?.task_type]);
  const invalidLegacy = legacyValues.filter(value => (
    !(hasSpecificCustomKey && normalizedCommercialTaskToken(value) === 'other')
    && !legacyCommercialTaskTypeKey(value)
  ));
  if (invalidLegacy.length) {
    return { key: null, blocked: ['invalid_task_type_key', 'De legacy taaksoort kan niet veilig canoniek worden gemaakt'] };
  }
  const canonicalKeys = uniqueCommercialValues([
    ...explicitKeys,
    ...legacyValues.map(value => (
      hasSpecificCustomKey && normalizedCommercialTaskToken(value) === 'other'
        ? null
        : legacyCommercialTaskTypeKey(value)
    )),
  ]);
  if (canonicalKeys.length !== 1) {
    return {
      key: null,
      blocked: canonicalKeys.length
        ? ['task_type_mismatch', 'Taaksoort en canonieke taaksoortsleutel spreken elkaar tegen']
        : ['missing_task_type_key', 'De uitvoering mist een canonieke taaksoortsleutel'],
    };
  }
  return { key: canonicalKeys[0], blocked: null };
}

function frozenCommercialRouteEvidence(
  execution: LooseRecord,
  taskTypeKey: string,
  serviceDate: string,
) {
  const status = asString(execution.commercial_routing_status);
  if (!status) return { frozen: false, snapshot: null, blocked: null };
  if (status !== 'resolved') {
    return {
      frozen: false,
      snapshot: execution.commercial_routing_snapshot || null,
      blocked: ['commercial_route_not_resolved', `De commerciële uitvoeringsroute heeft status ${status}`],
    };
  }
  const snapshot = execution.commercial_routing_snapshot;
  const requiredMatches = [
    [snapshot?.task_type_key, taskTypeKey],
    [snapshot?.customer_id, execution.customer_id],
    [snapshot?.customer_account_id, execution.customer_account_id],
    [snapshot?.selling_company_id, execution.selling_company_id],
    [snapshot?.customer_contract_id, execution.customer_contract_id],
    [snapshot?.customer_contract_line_id, execution.customer_contract_line_id],
    [snapshot?.object_id, execution.object_id],
    [snapshot?.service_date, serviceDate],
  ];
  const valid = Number(snapshot?.schema_version) === 1
    && snapshot?.status === 'resolved'
    && snapshot?.customer_billable === true
    && requiredMatches.every(([left, right]) => asString(left) && asString(left) === asString(right))
    && Number.isInteger(Number(snapshot?.customer_contract_version))
    && Number(snapshot.customer_contract_version) > 0
    && Number.isInteger(Number(snapshot?.customer_contract_line_version))
    && Number(snapshot.customer_contract_line_version) > 0;
  return valid
    ? { frozen: true, snapshot, blocked: null }
    : {
        frozen: false,
        snapshot: snapshot || null,
        blocked: ['commercial_route_snapshot_invalid', 'De bevroren commerciële uitvoeringsroute mist sluitend publicatiebewijs'],
      };
}

function commercialLineScopeMatches(
  line: LooseRecord,
  execution: LooseRecord,
  collectiveById: Map<string, LooseRecord>,
) {
  if (line.scope_type === 'customer') return !line.object_id && !line.collective_id;
  if (line.scope_type === 'object') {
    return !line.collective_id && asString(line.object_id) === asString(execution.object_id);
  }
  if (line.scope_type === 'collective') {
    const collective = collectiveById.get(asString(line.collective_id));
    return !line.object_id
      && Boolean(collective)
      && asString(collective?.customer_id) === asString(line.customer_id)
      && (Array.isArray(collective?.object_ids) ? collective.object_ids : [])
        .map(asString)
        .includes(asString(execution.object_id));
  }
  return false;
}

function rangesOverlap(
  firstFrom: unknown,
  firstUntil: unknown,
  secondFrom: unknown,
  secondUntil: unknown,
) {
  const leftFrom = asString(firstFrom) || '0000-01-01';
  const leftUntil = asString(firstUntil) || '9999-12-31';
  const rightFrom = asString(secondFrom) || '0000-01-01';
  const rightUntil = asString(secondUntil) || '9999-12-31';
  return leftFrom <= rightUntil && rightFrom <= leftUntil;
}

function addMonthsClamped(dateValue: string, months: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match || !Number.isInteger(months)) throw new ApiError(400, 'Ongeldige contractperiode');
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const absoluteMonth = year * 12 + monthIndex + months;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = ((absoluteMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return [
    String(targetYear).padStart(4, '0'),
    String(targetMonth + 1).padStart(2, '0'),
    String(Math.min(day, lastDay)).padStart(2, '0'),
  ].join('-');
}

function periodBoundary(anchor: string, frequency: string, index: number) {
  if (!Number.isInteger(index) || index < 0) throw new ApiError(400, 'Ongeldige periode-index');
  if (frequency === 'weekly') return plusDays(anchor, index * 7);
  if (frequency === 'four_weekly') return plusDays(anchor, index * 28);
  if (frequency === 'monthly') return addMonthsClamped(anchor, index);
  if (frequency === 'quarterly') return addMonthsClamped(anchor, index * 3);
  if (frequency === 'annually') return addMonthsClamped(anchor, index * 12);
  return null;
}

function completedFixedPeriods(
  line: LooseRecord,
  contract: LooseRecord,
  cutoffDate: string,
  throughDate: string,
  maximum: number,
) {
  const frequency = asString(line.billing_frequency || contract.billing_frequency);
  if (!['weekly', 'four_weekly', 'monthly', 'quarterly', 'annually'].includes(frequency)) {
    return { periods: [] as LooseRecord[], skipped_reason: `billing_frequency_${frequency || 'missing'}` };
  }
  const anchor = dateOnly(line.valid_from || contract.start_date);
  if (!anchor) return { periods: [] as LooseRecord[], skipped_reason: 'missing_period_anchor' };
  const lastAllowed = [
    dateOnly(line.valid_until),
    dateOnly(contract.end_date),
    throughDate,
  ].filter(Boolean).sort()[0] || throughDate;
  const periods: LooseRecord[] = [];
  for (let index = 0; index < 5000 && periods.length < maximum; index += 1) {
    const periodStart = periodBoundary(anchor, frequency, index);
    const nextStart = periodBoundary(anchor, frequency, index + 1);
    if (!periodStart || !nextStart) break;
    const periodEnd = plusDays(nextStart, -1);
    if (periodStart > throughDate || periodEnd > lastAllowed) break;
    // Geen stille backbilling van een deelperiode vóór activering.
    if (periodStart < cutoffDate) continue;
    periods.push({
      period_start: periodStart,
      period_end: periodEnd,
      frequency,
      index,
    });
  }
  return { periods, skipped_reason: null };
}

function requireString(body: LooseRecord, field: string) {
  const value = asString(body[field]);
  if (!value) throw new ApiError(400, `${field} is verplicht`);
  return value;
}

function requireInteger(value: unknown, field: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ApiError(400, `${field} moet een geheel getal tussen ${minimum} en ${maximum} zijn`);
  }
  return parsed;
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

function roundHalfUp(value: number) {
  if (!Number.isFinite(value)) throw new ApiError(400, 'Ongeldige financiële berekening');
  return Math.round(value + Number.EPSILON);
}

function calculateAmounts(quantityMinor: number, unitPriceCents: number, vatRateBasisPoints: number) {
  for (const [field, value] of Object.entries({ quantityMinor, unitPriceCents, vatRateBasisPoints })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ApiError(400, `${field} moet een veilig, niet-negatief geheel getal zijn`);
    }
  }
  if (vatRateBasisPoints > 10000) {
    throw new ApiError(400, 'vat_rate_basis_points mag niet boven 10000 liggen');
  }
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
  const increment = requireInteger(incrementMinor || 1, 'rounding_increment_minor', 1);
  const minimum = requireInteger(minimumMinor || 0, 'minimum_quantity_minor', 0);
  return Math.max(minimum, Math.ceil(quantity / increment) * increment);
}

async function sha256Bytes(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

async function sha256(value: string) {
  const digest = await sha256Bytes(value);
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function derivedIdempotencyKey(...parts: unknown[]) {
  return `automation:${await sha256(parts.map(part => String(part ?? '')).join('|'))}`;
}

async function constantTimeSecretMatches(expected: string, supplied: string) {
  const [expectedDigest, suppliedDigest] = await Promise.all([
    sha256Bytes(expected),
    sha256Bytes(supplied),
  ]);
  let difference = 0;
  for (let index = 0; index < expectedDigest.length; index += 1) {
    difference |= expectedDigest[index] ^ suppliedDigest[index];
  }
  return expected.length > 0 && supplied.length > 0 && difference === 0;
}

async function authorize(req: Request, base44: LooseRecord): Promise<AutomationActor> {
  const configuredSecret = asString(Deno.env.get('CUSTOMER_AUTOMATION_SECRET'));
  const suppliedSecret = asString(req.headers.get('x-loq-automation-secret'));
  if (await constantTimeSecretMatches(configuredSecret, suppliedSecret)) {
    return { id: null, type: 'system' };
  }

  const user = await base44.auth.me().catch(() => null);
  if (!user) throw new ApiError(401, 'Niet geautoriseerd');
  if (user.role !== 'admin') {
    throw new ApiError(403, 'Alleen backofficebeheerders of de automatiseringsservice hebben toegang');
  }
  return { id: user.id || null, type: 'user' };
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
  if (actualVersion !== expectedVersion) {
    throw new ApiError(409, 'Record is intussen gewijzigd', {
      entity: entityName,
      id: record.id,
      expected_version: expectedVersion,
      current_version: actualVersion,
    });
  }
  const versionQuery = record.version == null
    ? { $or: [{ version: expectedVersion }, { version: { $exists: false } }] }
    : { version: expectedVersion };
  const result = await getEntity(base44, entityName).updateMany(
    { id: record.id, ...versionQuery },
    { $set: patch, $inc: { version: 1 } },
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

async function appendEvent(base44: LooseRecord, input: LooseRecord) {
  const customerId = asString(input.customer_id);
  if (!customerId) return null;
  if (input.idempotency_key) {
    const existing = await getEntity(base44, 'CustomerEvent').filter(
      { idempotency_key: input.idempotency_key },
      '-created_date',
      1,
    );
    if (existing.length) return existing[0];
  }
  return getEntity(base44, 'CustomerEvent').create({
    company_id: input.company_id || null,
    customer_id: customerId,
    customer_account_id: input.customer_account_id || null,
    object_id: input.object_id || null,
    event_type: input.event_type || input.action,
    category: input.category || 'system',
    action: input.action,
    actor_type: input.actor_type || 'system',
    actor_id: input.actor_id || null,
    source: 'commercialAutomation',
    resource_type: input.resource_type || null,
    resource_id: input.resource_id || null,
    payload: input.payload || null,
    visibility: 'internal',
    occurred_at: input.occurred_at || nowIso(),
    idempotency_key: input.idempotency_key || null,
  });
}

async function loadSettings(
  base44: LooseRecord,
  companyId: string,
  expectedVersion: number,
) {
  const settings = await getEntity(base44, 'CompanyBillingSettings').filter(
    { company_id: companyId },
    '-updated_date',
    2,
  );
  if (!settings.length) throw new ApiError(404, 'Facturatie-instellingen voor deze BV ontbreken');
  if (settings.length !== 1) {
    throw new ApiError(409, 'Meerdere facturatie-instellingen voor dezelfde BV gevonden');
  }
  const currentVersion = versionOf(settings[0]);
  if (currentVersion !== expectedVersion) {
    throw new ApiError(409, 'Facturatie-instellingen zijn intussen gewijzigd', {
      entity: 'CompanyBillingSettings',
      id: settings[0].id,
      expected_version: expectedVersion,
      current_version: currentVersion,
    });
  }
  return settings[0];
}

function featureEnabled(settings: LooseRecord, key: string, legacyField?: string) {
  if (settings.status !== 'active') return false;
  return settings.feature_flags?.[key] === true || Boolean(legacyField && settings[legacyField] === true);
}

function billingAutomationEnabled(settings: LooseRecord) {
  if (settings.status !== 'active' || !['shadow', 'live'].includes(settings.billing_mode)) return false;
  return settings.billing_mode === 'live' ||
    settings.billing_shadow_mode === true ||
    settings.feature_flags?.billing_shadow === true;
}

function billingActivationCutoff(settings: LooseRecord) {
  const raw = settings.metadata?.billing_activation_at || settings.feature_flags?.billing_activation_at;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function rawQuantityForExecution(execution: LooseRecord, unit: string) {
  if (Number.isInteger(Number(execution.billable_quantity_minor)) && Number(execution.billable_quantity_minor) >= 0) {
    return Number(execution.billable_quantity_minor);
  }
  if (unit === 'fixed' || unit === 'execution' || unit === 'unit') return 1000;
  if (unit === 'minute') return Math.max(0, Number(execution.duration_minutes) || 0) * 1000;
  if (unit === 'hour') {
    return roundHalfUp((Math.max(0, Number(execution.duration_minutes) || 0) * 1000) / 60);
  }
  if (unit === 'kilometer') {
    const kilometers = Number(execution.distance_from_previous_km || execution.metadata?.billable_distance_km || 0);
    return roundHalfUp(Math.max(0, kilometers) * 1000);
  }
  return 0;
}

function blockedCandidateData(
  execution: LooseRecord,
  context: LooseRecord,
  code: string,
  reason: string,
  idempotencyKey: string,
) {
  return {
    company_id: context.company_id || execution.selling_company_id || 'unresolved',
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

export async function findExecutionPricing(base44: LooseRecord, execution: LooseRecord) {
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
  const executionTaskType = canonicalExecutionTaskType(execution, sourceTask);
  if (executionTaskType.blocked) return { context, blocked: executionTaskType.blocked };
  context.task_type_key = executionTaskType.key;
  const frozenRoute = frozenCommercialRouteEvidence(execution, context.task_type_key, context.service_date);
  if (frozenRoute.blocked) return { context, blocked: frozenRoute.blocked };
  const frozenCommercialRoute = frozenRoute.frozen;
  context.commercial_routing_snapshot = frozenRoute.snapshot;

  let lines: LooseRecord[] = [];
  if (execution.customer_contract_line_id) {
    const selected = await getRecord(base44, 'CustomerContractLine', execution.customer_contract_line_id);
    if (!selected) return { context, blocked: ['missing_contract_line', 'Geselecteerde contractregel bestaat niet'] };
    lines = [selected];
  } else {
    lines = await getEntity(base44, 'CustomerContractLine').filter({
      customer_id: context.customer_id,
      status: 'active',
    }, '+sequence', 500);
  }
  if (!execution.customer_contract_line_id && lines.length >= 500) {
    return { context, blocked: ['contract_line_lookup_truncated', 'Te veel contractregels om de taakroutering volledig te bewijzen'] };
  }

  const needsCollectives = lines.some(line => line.scope_type === 'collective');
  const collectives = needsCollectives
    ? await getEntity(base44, 'Collectief').filter({ customer_id: context.customer_id }, '+name', 1000)
    : [];
  if (needsCollectives && collectives.length >= 1000) {
    return { context, blocked: ['collective_lookup_truncated', 'Te veel collectieven om de objectscope volledig te bewijzen'] };
  }
  const collectiveById = new Map(collectives.map((item: LooseRecord) => [String(item.id), item]));
  const scopedTaskLines: LooseRecord[] = [];
  for (const line of lines) {
    const historicalSelectedLine = frozenCommercialRoute
      && String(line.id) === String(execution.customer_contract_line_id);
    if (!['active', ...(historicalSelectedLine ? ['ended'] : [])].includes(line.status)) continue;
    if (!isDateInRange(context.service_date, line.valid_from, line.valid_until)) continue;
    if (!commercialLineScopeMatches(line, execution, collectiveById)) continue;
    const lineTaskTypeKey = canonicalContractLineTaskTypeKey(line);
    if (!lineTaskTypeKey) {
      if (execution.customer_contract_line_id) {
        return { context, blocked: ['invalid_contract_line_task_type', 'De geselecteerde contractregel heeft geen veilige canonieke taaksoort'] };
      }
      continue;
    }
    if (lineTaskTypeKey !== context.task_type_key) continue;
    if (
      String(line.customer_id) !== String(context.customer_id)
      || !asString(line.company_id)
      || (context.company_id && String(line.company_id) !== String(context.company_id))
      || !asString(line.customer_account_id)
      || (execution.customer_account_id && String(line.customer_account_id) !== String(execution.customer_account_id))
    ) {
      return { context, blocked: ['contract_line_context_mismatch', 'Contractregel, klantrelatie en verkopende BV komen niet overeen'] };
    }
    if (execution.customer_contract_id && String(line.contract_id) !== String(execution.customer_contract_id)) {
      return { context, blocked: ['contract_line_mismatch', 'Geselecteerde contractregel hoort bij een ander contract'] };
    }
    scopedTaskLines.push(line);
  }
  if (scopedTaskLines.length !== 1) {
    return {
      context,
      blocked: [
        scopedTaskLines.length ? 'overlapping_contract_line' : 'missing_contract_line',
        scopedTaskLines.length ? 'Meerdere contractregels passen bij taaksoort, datum en objectscope' : 'Geen contractregel past bij taaksoort, datum en objectscope',
      ],
    };
  }
  context.line = scopedTaskLines[0];
  if (
    frozenCommercialRoute
    && versionOf(context.line) < Number(frozenRoute.snapshot.customer_contract_line_version)
  ) {
    return { context, blocked: ['commercial_route_snapshot_version_mismatch', 'De contractregel is ouder dan het bevroren publicatiebewijs'] };
  }

  const contract = await getRecord(base44, 'CustomerContract', context.line.contract_id);
  if (!contract) return { context, blocked: ['missing_contract', 'Het hoofdcontract van de contractregel bestaat niet'] };
  const historicalSelectedContract = frozenCommercialRoute
    && String(contract.id) === String(execution.customer_contract_id)
    && String(context.line.id) === String(execution.customer_contract_line_id);
  const allowedContractStatuses = historicalSelectedContract
    ? ['active', 'ended', 'superseded']
    : ['active'];
  if (!allowedContractStatuses.includes(contract.status)) {
    return { context, blocked: ['invalid_contract_status', `Hoofdcontract heeft status ${contract.status}`] };
  }
  if (
    String(contract.id) !== String(context.line.contract_id)
    || !asString(contract.company_id)
    || (context.company_id && String(contract.company_id) !== String(context.company_id))
    || String(contract.customer_id) !== String(context.customer_id)
    || String(context.line.company_id) !== String(contract.company_id)
    || String(context.line.customer_id) !== String(contract.customer_id)
    || String(context.line.customer_account_id) !== String(contract.customer_account_id)
  ) {
    return { context, blocked: ['contract_context_mismatch', 'Hoofdcontract en contractregel bevatten tegenstrijdige klant- of BV-gegevens'] };
  }
  if (!asString(contract.start_date) || !isDateInRange(context.service_date, contract.start_date, contract.end_date)) {
    return { context, blocked: ['invalid_contract_period', 'Hoofdcontract dekt de uitvoeringsdatum niet'] };
  }
  if (
    frozenCommercialRoute
    && versionOf(contract) < Number(frozenRoute.snapshot.customer_contract_version)
  ) {
    return { context, blocked: ['commercial_route_snapshot_version_mismatch', 'Het hoofdcontract is ouder dan het bevroren publicatiebewijs'] };
  }
  context.contract = contract;
  context.company_id = contract.company_id;
  const account = await getRecord(base44, 'CustomerAccount', contract.customer_account_id);
  if (!account) return { context, blocked: ['missing_customer_account', 'De klantrelatie van het hoofdcontract bestaat niet'] };
  if (
    String(account.id) !== String(context.line.customer_account_id)
    || (execution.customer_account_id && String(account.id) !== String(execution.customer_account_id))
    || String(account.customer_id) !== String(context.customer_id)
    || String(account.company_id) !== String(context.company_id)
  ) {
    return { context, blocked: ['company_mismatch', 'Klantrelatie, contractregel en verkopende BV komen niet overeen'] };
  }
  if (account.finance_hold) {
    return { context, blocked: ['finance_hold', account.finance_hold_reason || 'Klantrelatie staat op financiële blokkade'] };
  }
  context.customer_account_id = account.id;
  context.unit = billingModelUnit(context.line.billing_model);
  if (!context.unit) {
    return { context, blocked: ['unsupported_billing_model', 'Facturatiemodel wordt niet ondersteund'] };
  }

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
    const allowedSelectedRateStatuses = frozenCommercialRoute
      ? ['active', 'superseded', 'ended']
      : ['active'];
    if (!allowedSelectedRateStatuses.includes(selected.status)) {
      return { context, blocked: ['invalid_rate_status', `Geselecteerd tarief heeft status ${selected.status}`] };
    }
    rates = [selected];
  } else {
    const allowedRateStatuses = frozenCommercialRoute
      ? ['active', 'superseded', 'ended']
      : ['active'];
    rates = await getEntity(base44, 'CustomerContractRate').filter({
      contract_line_id: context.line.id,
      status: { $in: allowedRateStatuses },
      unit: context.unit,
    }, '-priority', 500);
  }
  const allowedRateStatuses = frozenCommercialRoute
    ? ['active', 'superseded', 'ended']
    : ['active'];
  rates = rates.filter(rate =>
    rate.contract_id === context.contract.id &&
    rate.company_id === context.company_id &&
    rate.customer_id === context.customer_id &&
    rate.customer_account_id === account.id &&
    rate.unit === context.unit &&
    allowedRateStatuses.includes(rate.status) &&
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

async function linkExecutionToCandidate(
  base44: LooseRecord,
  execution: LooseRecord,
  expectedVersion: number,
  candidate: LooseRecord,
) {
  if (execution.billing_candidate_id === candidate.id) return execution;
  const billingStatus = candidate.status === 'blocked' ? 'candidate_blocked' : 'candidate_pending';
  return casUpdate(base44, 'TaskExecution', execution, expectedVersion, {
    billing_candidate_id: candidate.id,
    billing_status: billingStatus,
    customer_id: candidate.customer_id === 'unresolved' ? execution.customer_id || null : candidate.customer_id,
    customer_account_id: candidate.customer_account_id === 'unresolved'
      ? execution.customer_account_id || null
      : candidate.customer_account_id,
    selling_company_id: candidate.company_id === 'unresolved'
      ? execution.selling_company_id || null
      : candidate.company_id,
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
}

async function materializeBillingCandidate(
  base44: LooseRecord,
  input: {
    executionId: string;
    expectedVersion: number;
    idempotencyKey: string;
    actor: AutomationActor;
  },
) {
  const execution = await requireRecord(base44, 'TaskExecution', input.executionId, 'Uitvoering');
  if (versionOf(execution) !== input.expectedVersion) {
    throw new ApiError(409, 'Uitvoering is intussen gewijzigd', {
      expected_version: input.expectedVersion,
      current_version: versionOf(execution),
    });
  }
  if (execution.billing_candidate_id) {
    const linked = await getRecord(base44, 'BillingCandidate', execution.billing_candidate_id);
    if (linked) return { candidate: linked, replayed: true };
  }
  const existing = await getEntity(base44, 'BillingCandidate').filter(
    { idempotency_key: input.idempotencyKey },
    '-created_date',
    1,
  );
  if (existing.length) {
    await linkExecutionToCandidate(base44, execution, input.expectedVersion, existing[0]);
    return { candidate: existing[0], replayed: true };
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
    const vatRateBasisPoints = Number(
      context.rate.vat_rate_basis_points ?? context.line.vat_rate_basis_points ?? 0,
    );
    const amounts = calculateAmounts(
      quantityMinor,
      Number(context.rate.amount_cents),
      vatRateBasisPoints,
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
      vat_rate_basis_points: vatRateBasisPoints,
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
  await linkExecutionToCandidate(base44, execution, input.expectedVersion, candidate);
  if (candidate.customer_id !== 'unresolved') {
    await appendEvent(base44, {
      company_id: candidate.company_id,
      customer_id: candidate.customer_id,
      customer_account_id: candidate.customer_account_id,
      object_id: execution.object_id || null,
      event_type: candidate.status === 'blocked'
        ? 'billing.candidate_blocked'
        : 'billing.candidate_created',
      category: 'billing',
      action: 'generate_billing_candidates',
      actor_type: input.actor.type,
      actor_id: input.actor.id,
      resource_type: 'BillingCandidate',
      resource_id: candidate.id,
      payload: {
        execution_id: execution.id,
        execution_version: input.expectedVersion,
        candidate_status: candidate.status,
        block_code: candidate.block_code || null,
      },
      idempotency_key: await derivedIdempotencyKey(input.idempotencyKey, 'event'),
    });
  }
  return { candidate, replayed: false };
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

function customerSnapshot(customer: LooseRecord, account: LooseRecord) {
  return {
    id: customer.id,
    customer_number: customer.customer_number || null,
    legal_name: customer.legal_name || customer.name,
    trade_name: customer.trade_name || customer.name,
    kvk_number: customer.kvk_number || null,
    vat_number: customer.vat_number || null,
    preferred_language: customer.preferred_language || 'nl',
    customer_account_id: account.id,
    debtor_number: account.debtor_number || null,
    invoice_email: account.invoice_email || null,
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

async function loadBillingSnapshots(
  base44: LooseRecord,
  companyId: string,
  customerId: string,
  accountId: string,
) {
  const [company, customer, account] = await Promise.all([
    requireRecord(base44, 'Company', companyId, 'Bedrijf'),
    requireRecord(base44, 'Customer', customerId, 'Klant'),
    requireRecord(base44, 'CustomerAccount', accountId, 'Klantrelatie'),
  ]);
  if (account.company_id !== companyId || account.customer_id !== customerId) {
    throw new ApiError(409, 'Klantrelatie hoort niet bij de geselecteerde klant en BV');
  }
  const [addresses, settings] = await Promise.all([
    getEntity(base44, 'CustomerAddress').filter(
      { customer_id: customerId, status: 'active' },
      '-is_primary',
      200,
    ),
    getEntity(base44, 'CompanyBillingSettings').filter(
      { company_id: companyId },
      '-updated_date',
      1,
    ),
  ]);
  const address =
    addresses.find((item: LooseRecord) => item.id === account.billing_address_id) ||
    addresses.find((item: LooseRecord) =>
      item.customer_account_id === account.id && item.address_type === 'billing') ||
    addresses.find((item: LooseRecord) => item.address_type === 'billing' && item.is_primary) ||
    addresses.find((item: LooseRecord) => item.address_type === 'visiting' && item.is_primary) ||
    null;
  const billingSettings = settings[0] || null;
  const bankId =
    account.default_company_bank_account_id ||
    billingSettings?.invoice_bank_account_id ||
    billingSettings?.default_bank_account_id;
  const bank = bankId ? await getRecord(base44, 'CompanyBankAccount', bankId) : null;
  return {
    account,
    settings: billingSettings,
    company_snapshot: companySnapshot(company),
    customer_snapshot: customerSnapshot(customer, account),
    billing_address_snapshot: addressSnapshot(address),
    bank_account_snapshot: bankSnapshot(bank),
  };
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
    candidates: LooseRecord[];
    idempotencyKey: string;
    actor: AutomationActor;
    invoiceRunId: string;
  },
) {
  const replay = await getEntity(base44, 'SalesInvoice').filter(
    { idempotency_key: input.idempotencyKey },
    '-created_date',
    1,
  );
  if (replay.length) {
    const invoice = replay[0];
    let lines = await getEntity(base44, 'SalesInvoiceLine').filter(
      { invoice_id: invoice.id },
      '+sequence',
      1000,
    );
    const existingCandidateIds = new Set(
      lines.map((line: LooseRecord) => line.billing_candidate_id).filter(Boolean),
    );
    const missing = input.candidates.filter(candidate => !existingCandidateIds.has(candidate.id));
    for (const candidate of missing) {
      if (
        candidate.status !== 'approved' ||
        candidate.company_id !== invoice.company_id ||
        candidate.customer_id !== invoice.customer_id ||
        candidate.customer_account_id !== invoice.customer_account_id ||
        candidate.currency !== invoice.currency
      ) {
        throw new ApiError(409, `Ontbrekende factuurregel voor kandidaat ${candidate.id} kan niet veilig worden hersteld`);
      }
    }
    if (missing.length) {
      const created = await getEntity(base44, 'SalesInvoiceLine').bulkCreate(
        missing.map((candidate, index) =>
          invoiceLineFromCandidate(candidate, invoice, lines.length + index + 1)),
      );
      lines = [...lines, ...created];
    }
    return {
      invoice,
      lines,
      replayed: true,
      recovered_partial_creation: missing.length > 0,
    };
  }

  if (!input.candidates.length || input.candidates.length > 500) {
    throw new ApiError(400, 'Een conceptfactuur vereist 1 tot 500 kandidaten');
  }
  const expectedVersions = Object.fromEntries(
    input.candidates.map(candidate => [candidate.id, versionOf(candidate)]),
  );
  const candidates = await Promise.all(
    input.candidates.map(candidate =>
      requireRecord(base44, 'BillingCandidate', candidate.id, 'Factuurkandidaat')),
  );
  for (const candidate of candidates) {
    if (candidate.status !== 'approved') {
      throw new ApiError(409, `Factuurkandidaat ${candidate.id} is niet meer goedgekeurd`);
    }
    if (versionOf(candidate) !== expectedVersions[candidate.id]) {
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
      throw new ApiError(409, 'Een conceptfactuur mag maar één BV, klantrelatie en valuta bevatten');
    }
  }

  const snapshots = await loadBillingSnapshots(
    base44,
    first.company_id,
    first.customer_id,
    first.customer_account_id,
  );
  if (snapshots.account.finance_hold) {
    throw new ApiError(409, 'Klantrelatie staat op financiële blokkade');
  }
  const subtotalCents = candidates.reduce(
    (sum, candidate) => sum + Number(candidate.subtotal_cents || 0),
    0,
  );
  const taxTotalCents = candidates.reduce(
    (sum, candidate) => sum + Number(candidate.tax_cents || 0),
    0,
  );
  const taxMap = new Map<number, LooseRecord>();
  for (const candidate of candidates) {
    const rate = Number(candidate.vat_rate_basis_points || 0);
    const row = taxMap.get(rate) || {
      vat_rate_basis_points: rate,
      taxable_cents: 0,
      tax_cents: 0,
    };
    row.taxable_cents += Number(candidate.subtotal_cents || 0);
    row.tax_cents += Number(candidate.tax_cents || 0);
    taxMap.set(rate, row);
  }
  const invoiceDate = todayIso();
  const paymentTermDays = Number(
    snapshots.account.payment_term_days ??
    snapshots.settings?.default_payment_term_days ??
    30,
  );
  const invoice = await getEntity(base44, 'SalesInvoice').create({
    company_id: first.company_id,
    customer_id: first.customer_id,
    customer_account_id: first.customer_account_id,
    invoice_run_id: input.invoiceRunId,
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
    subtotal_cents: subtotalCents,
    tax_total_cents: taxTotalCents,
    total_cents: subtotalCents + taxTotalCents,
    paid_cents: 0,
    open_cents: subtotalCents + taxTotalCents,
    tax_summary: [...taxMap.values()],
    delivery_evidence_managed_file_ids: [],
    idempotency_key: input.idempotencyKey,
    version: 1,
    metadata: {
      source_candidate_ids: candidates.map(candidate => candidate.id),
      prepared_by: 'commercialAutomation',
      prepared_by_actor_id: input.actor.id,
      auto_issue: false,
      auto_send: false,
    },
  });
  const lines = await getEntity(base44, 'SalesInvoiceLine').bulkCreate(
    candidates.map((candidate, index) => invoiceLineFromCandidate(candidate, invoice, index + 1)),
  );
  return { invoice, lines, replayed: false };
}

async function expireQuotes(
  base44: LooseRecord,
  settings: LooseRecord,
  context: LooseRecord,
) {
  if (!featureEnabled(settings, 'commercial_contracts', 'commercial_contracts_enabled')) {
    return { skipped: true, reason: 'commercial_contracts_disabled', expired: 0, conflicts: 0 };
  }
  const today = todayIso();
  const quotes = await getEntity(base44, 'CustomerQuote').filter(
    { company_id: context.companyId, status: 'sent' },
    '+valid_until',
    Math.min(2000, context.limit * 5),
  );
  const due = quotes
    .filter((quote: LooseRecord) => asString(quote.valid_until) && quote.valid_until < today)
    .slice(0, context.limit);
  const items: LooseRecord[] = [];
  let conflicts = 0;
  for (const quote of due) {
    try {
      const updated = await casUpdate(base44, 'CustomerQuote', quote, versionOf(quote), {
        status: 'expired',
        decision_note: quote.decision_note || `Automatisch verlopen op ${today}`,
      });
      const eventKey = await derivedIdempotencyKey(
        context.idempotencyKey,
        'expire_quote',
        quote.id,
        versionOf(quote),
      );
      await appendEvent(base44, {
        company_id: updated.company_id,
        customer_id: updated.customer_id,
        customer_account_id: updated.customer_account_id,
        event_type: 'quote.expired',
        category: 'commercial',
        action: 'expire_quotes',
        actor_type: context.actor.type,
        actor_id: context.actor.id,
        resource_type: 'CustomerQuote',
        resource_id: updated.id,
        payload: {
          valid_until: updated.valid_until,
          previous_status: quote.status,
          resulting_status: updated.status,
        },
        idempotency_key: eventKey,
      });
      items.push({ id: updated.id, status: updated.status });
    } catch (error) {
      if ((error as LooseRecord)?.status === 409) {
        conflicts += 1;
        continue;
      }
      throw error;
    }
  }
  return { skipped: false, expired: items.length, conflicts, items };
}

async function generatePeriodicBillingCandidates(
  base44: LooseRecord,
  context: LooseRecord,
  cutoff: Date,
  maximum: number,
) {
  if (maximum < 1) {
    return {
      considered_lines: 0,
      considered_periods: 0,
      created: 0,
      blocked: 0,
      replayed: 0,
      items: [],
      errors: [],
      skipped_items: [],
    };
  }
  const cutoffDate = dateOnly(cutoff.toISOString());
  if (!cutoffDate) throw new ApiError(400, 'Ongeldige facturatie-activeringsdatum');
  const throughDate = todayIso();
  const lines = await getEntity(base44, 'CustomerContractLine').filter({
    company_id: context.companyId,
    billing_model: 'fixed_period',
    status: 'active',
  }, '+valid_from', Math.min(5000, Math.max(100, maximum * 10)));
  const contractCache = new Map<string, LooseRecord | null>();
  const accountCache = new Map<string, LooseRecord | null>();
  const customerCache = new Map<string, LooseRecord | null>();
  const rateCache = new Map<string, LooseRecord[]>();
  const items: LooseRecord[] = [];
  const errors: LooseRecord[] = [];
  const skippedItems: LooseRecord[] = [];
  let blocked = 0;
  let replayed = 0;
  let consideredPeriods = 0;

  for (const line of lines) {
    if (items.length >= maximum) break;
    let contract = contractCache.get(line.contract_id);
    if (contract === undefined) {
      contract = await getRecord(base44, 'CustomerContract', line.contract_id);
      contractCache.set(line.contract_id, contract);
    }
    if (!contract) {
      errors.push({ contract_line_id: line.id, reason: 'missing_contract' });
      continue;
    }
    const periodResult = completedFixedPeriods(
      line,
      contract,
      cutoffDate,
      throughDate,
      5000,
    );
    if (periodResult.skipped_reason) {
      skippedItems.push({
        contract_line_id: line.id,
        reason: periodResult.skipped_reason,
      });
      continue;
    }

    let account = accountCache.get(line.customer_account_id);
    if (account === undefined) {
      account = await getRecord(base44, 'CustomerAccount', line.customer_account_id);
      accountCache.set(line.customer_account_id, account);
    }
    let customer = customerCache.get(line.customer_id);
    if (customer === undefined) {
      customer = await getRecord(base44, 'Customer', line.customer_id);
      customerCache.set(line.customer_id, customer);
    }
    let rates = rateCache.get(line.id);
    if (!rates) {
      rates = await getEntity(base44, 'CustomerContractRate').filter({
        contract_line_id: line.id,
        status: { $in: ['active', 'superseded', 'ended'] },
        unit: 'fixed',
      }, '+valid_from', 1000);
      rateCache.set(line.id, rates);
    }

    for (const period of periodResult.periods) {
      if (items.length >= maximum) break;
      consideredPeriods += 1;
      const idempotencyKey = await derivedIdempotencyKey(
        context.companyId,
        'contract_period',
        line.id,
        period.period_start,
        period.period_end,
      );
      const existing = await getEntity(base44, 'BillingCandidate').filter(
        { idempotency_key: idempotencyKey },
        '-created_date',
        1,
      );
      if (existing.length) {
        const candidate = existing[0];
        if (
          candidate.company_id !== line.company_id ||
          candidate.customer_id !== line.customer_id ||
          candidate.customer_account_id !== line.customer_account_id ||
          candidate.customer_contract_line_id !== line.id
        ) {
          errors.push({
            contract_line_id: line.id,
            period_start: period.period_start,
            reason: 'idempotency_scope_mismatch',
          });
        } else {
          replayed += 1;
        }
        continue;
      }

      let block: [string, string] | null = null;
      if (
        contract.company_id !== context.companyId ||
        contract.customer_id !== line.customer_id ||
        contract.customer_account_id !== line.customer_account_id ||
        line.company_id !== context.companyId
      ) {
        block = ['company_mismatch', 'Contractregel, contract, klantrelatie en verkopende BV komen niet overeen'];
      } else if (contract.status !== 'active') {
        block = ['invalid_contract_status', `Contract heeft status ${contract.status}`];
      } else if (!account) {
        block = ['missing_customer_account', 'Klantrelatie bestaat niet'];
      } else if (
        account.company_id !== context.companyId ||
        account.customer_id !== line.customer_id
      ) {
        block = ['company_mismatch', 'Klantrelatie hoort bij een andere klant of BV'];
      } else if (account.status !== 'active') {
        block = ['invalid_customer_account_status', `Klantrelatie heeft status ${account.status}`];
      } else if (account.finance_hold) {
        block = ['finance_hold', account.finance_hold_reason || 'Klantrelatie staat op financiële blokkade'];
      } else if (!customer) {
        block = ['missing_customer', 'Klant bestaat niet'];
      }

      const overlappingRates = rates.filter(rate =>
        rangesOverlap(
          rate.valid_from,
          rate.valid_until,
          period.period_start,
          period.period_end,
        ));
      let rate: LooseRecord | null = null;
      if (!block && !overlappingRates.length) {
        block = ['missing_rate', 'Geen vast tarief dekt deze contractperiode'];
      } else if (!block && overlappingRates.length > 1) {
        block = ['overlapping_rate', 'Meerdere vaste tarieven overlappen deze contractperiode'];
      } else if (!block) {
        rate = overlappingRates[0];
        if (
          rate.company_id !== context.companyId ||
          rate.customer_id !== line.customer_id ||
          rate.customer_account_id !== line.customer_account_id ||
          rate.contract_id !== contract.id
        ) {
          block = ['company_mismatch', 'Tarief hoort bij een andere contractregel, klantrelatie of BV'];
        } else if (
          !isDateInRange(period.period_start, rate.valid_from, rate.valid_until) ||
          !isDateInRange(period.period_end, rate.valid_from, rate.valid_until)
        ) {
          block = ['incomplete_rate_coverage', 'Het tarief dekt niet de volledige contractperiode'];
        } else if (
          asString(rate.currency || line.currency || contract.currency || account?.currency || 'EUR') !==
          asString(line.currency || contract.currency || account?.currency || rate.currency || 'EUR')
        ) {
          block = ['currency_mismatch', 'Tarief en contractregel hebben verschillende valuta'];
        }
      }

      const quantityMinor = block ? 0 : 1000;
      const unitPriceCents = block ? 0 : requireInteger(rate?.amount_cents, 'amount_cents', 0);
      const vatRateBasisPoints = block
        ? 0
        : requireInteger(
          rate?.vat_rate_basis_points ?? line.vat_rate_basis_points ?? 0,
          'vat_rate_basis_points',
          0,
          10000,
        );
      const amounts = block
        ? { subtotal_cents: 0, tax_cents: 0, total_cents: 0 }
        : calculateAmounts(quantityMinor, unitPriceCents, vatRateBasisPoints);
      const candidate = await getEntity(base44, 'BillingCandidate').create({
        company_id: line.company_id,
        customer_id: line.customer_id,
        customer_account_id: line.customer_account_id,
        source_type: 'contract_period',
        source_id: `${line.id}:${period.period_start}:${period.period_end}`,
        task_execution_id: null,
        customer_contract_id: contract.id,
        customer_contract_line_id: line.id,
        customer_contract_rate_id: rate?.id || null,
        candidate_type: 'charge',
        status: block ? 'blocked' : 'pending',
        block_code: block?.[0] || null,
        block_reason: block?.[1] || null,
        service_date: period.period_end,
        period_start: period.period_start,
        period_end: period.period_end,
        description: `${line.name || 'Vaste dienstverlening'} (${period.period_start} t/m ${period.period_end})`,
        quantity_minor: quantityMinor,
        unit: 'fixed',
        unit_price_cents: unitPriceCents,
        ...amounts,
        vat_rate_basis_points: vatRateBasisPoints,
        currency: rate?.currency || line.currency || contract.currency || account?.currency || 'EUR',
        pricing_snapshot: {
          blocked: Boolean(block),
          block_code: block?.[0] || null,
          contract_id: contract.id,
          contract_version: versionOf(contract),
          contract_line_id: line.id,
          contract_line_version: versionOf(line),
          contract_rate_id: rate?.id || null,
          contract_rate_version: rate ? versionOf(rate) : null,
          billing_frequency: period.frequency,
          period_index: period.index,
          evaluated_at: nowIso(),
        },
        customer_snapshot: customer && account ? customerSnapshot(customer, account) : {},
        idempotency_key: idempotencyKey,
        version: 1,
        metadata: {
          generated_by: 'commercialAutomation',
          activation_cutoff: cutoff.toISOString(),
          auto_approve: false,
        },
      });
      if (candidate.status === 'blocked') blocked += 1;
      items.push({
        source_type: 'contract_period',
        contract_line_id: line.id,
        period_start: period.period_start,
        period_end: period.period_end,
        candidate_id: candidate.id,
        status: candidate.status,
        block_code: candidate.block_code || null,
        replayed: false,
      });
      await appendEvent(base44, {
        company_id: candidate.company_id,
        customer_id: candidate.customer_id,
        customer_account_id: candidate.customer_account_id,
        object_id: line.object_id || null,
        event_type: candidate.status === 'blocked'
          ? 'billing.periodic_candidate_blocked'
          : 'billing.periodic_candidate_created',
        category: 'billing',
        action: 'generate_billing_candidates',
        actor_type: context.actor.type,
        actor_id: context.actor.id,
        resource_type: 'BillingCandidate',
        resource_id: candidate.id,
        payload: {
          source_type: 'contract_period',
          contract_id: contract.id,
          contract_line_id: line.id,
          period_start: period.period_start,
          period_end: period.period_end,
          block_code: candidate.block_code || null,
        },
        idempotency_key: await derivedIdempotencyKey(idempotencyKey, 'event'),
      });
    }
  }
  return {
    considered_lines: lines.length,
    considered_periods: consideredPeriods,
    created: items.length,
    blocked,
    replayed,
    items,
    errors,
    skipped_items: skippedItems,
  };
}

async function generateBillingCandidates(
  base44: LooseRecord,
  settings: LooseRecord,
  context: LooseRecord,
) {
  if (!billingAutomationEnabled(settings)) {
    return {
      skipped: true,
      reason: 'billing_shadow_or_live_disabled',
      created: 0,
      blocked: 0,
      replayed: 0,
      errors: [],
    };
  }
  const cutoff = billingActivationCutoff(settings);
  if (!cutoff) {
    return {
      skipped: true,
      reason: 'missing_or_invalid_billing_activation_at',
      created: 0,
      blocked: 0,
      replayed: 0,
      errors: [],
    };
  }
  const periodicBudget = Math.max(1, Math.floor(context.limit / 3));
  const periodic = await generatePeriodicBillingCandidates(
    base44,
    context,
    cutoff,
    periodicBudget,
  );
  const executionBudget = Math.max(0, context.limit - periodic.created);
  const executions = await getEntity(base44, 'TaskExecution').filter({
    selling_company_id: context.companyId,
    status: 'completed',
    financial_review_status: 'approved',
    customer_billable: true,
  }, '-actual_completed_at', Math.min(2500, context.limit * 10));
  const eligible = executions.filter((execution: LooseRecord) => {
    if (execution.billing_candidate_id) return false;
    const completedAt = new Date(asString(execution.actual_completed_at));
    return Number.isFinite(completedAt.getTime()) && completedAt.getTime() >= cutoff.getTime();
  }).slice(0, executionBudget);

  const items: LooseRecord[] = [];
  const errors: LooseRecord[] = [];
  let blocked = 0;
  let replayed = 0;
  for (const execution of eligible) {
    try {
      const key = await derivedIdempotencyKey(
        context.companyId,
        'billing_candidate',
        execution.id,
        versionOf(execution),
      );
      const result = await materializeBillingCandidate(base44, {
        executionId: execution.id,
        expectedVersion: versionOf(execution),
        idempotencyKey: key,
        actor: context.actor,
      });
      if (result.candidate.status === 'blocked') blocked += 1;
      if (result.replayed) replayed += 1;
      items.push({
        execution_id: execution.id,
        candidate_id: result.candidate.id,
        status: result.candidate.status,
        block_code: result.candidate.block_code || null,
        replayed: result.replayed,
      });
    } catch (error) {
      errors.push({
        execution_id: execution.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    skipped: false,
    activation_at: cutoff.toISOString(),
    considered: eligible.length + periodic.considered_periods,
    created: items.length - replayed + periodic.created,
    blocked: blocked + periodic.blocked,
    replayed: replayed + periodic.replayed,
    errors: [...periodic.errors, ...errors],
    items: [...periodic.items, ...items],
    periodic,
  };
}

function dunningSteps(settings: LooseRecord, profile: string) {
  const configured = settings.reminder_schedule?.[profile];
  const rawSteps = Array.isArray(configured)
    ? configured
    : Array.isArray(configured?.steps)
      ? configured.steps
      : DEFAULT_DUNNING_STEPS[profile] || [];
  const allowedTypes = new Set(['friendly', 'first', 'second', 'final', 'wik14', 'collection']);
  const allowedChannels = new Set(['email', 'portal', 'post', 'manual']);
  return rawSteps
    .map((step: LooseRecord, index: number) => ({
      sequence: Number(step.sequence ?? index + 1),
      reminder_type: asString(step.reminder_type || step.type),
      days_after_due: Number(step.days_after_due ?? step.after_days ?? 0),
      channel: asString(step.channel || 'email'),
    }))
    .filter((step: LooseRecord) =>
      Number.isInteger(step.sequence) &&
      step.sequence > 0 &&
      Number.isInteger(step.days_after_due) &&
      step.days_after_due >= 0 &&
      allowedTypes.has(step.reminder_type) &&
      allowedChannels.has(step.channel))
    .sort((left: LooseRecord, right: LooseRecord) => left.sequence - right.sequence);
}

async function scheduleReminders(
  base44: LooseRecord,
  settings: LooseRecord,
  context: LooseRecord,
) {
  if (!featureEnabled(settings, 'collections', 'collections_enabled')) {
    return { skipped: true, reason: 'collections_disabled', scheduled: 0, items: [] };
  }
  const today = todayIso();
  const invoices = await getEntity(base44, 'SalesInvoice').filter(
    {
      company_id: context.companyId,
      payment_status: { $in: ['open', 'partially_paid', 'overdue'] },
    },
    '+due_date',
    Math.min(2000, context.limit * 5),
  );
  const eligible = invoices.filter((invoice: LooseRecord) =>
    invoiceLifecycle(invoice) === 'issued' &&
    Number(invoice.open_cents) > 0 &&
    !invoice.dispute_hold &&
    asString(invoice.due_date) &&
    invoice.due_date < today).slice(0, context.limit);
  const accountCache = new Map<string, LooseRecord | null>();
  const items: LooseRecord[] = [];
  const skipped: LooseRecord[] = [];
  for (const invoice of eligible) {
    let account = accountCache.get(invoice.customer_account_id);
    if (account === undefined) {
      account = await getRecord(base44, 'CustomerAccount', invoice.customer_account_id);
      accountCache.set(invoice.customer_account_id, account);
    }
    if (!account || account.company_id !== context.companyId || account.customer_id !== invoice.customer_id) {
      skipped.push({ invoice_id: invoice.id, reason: 'customer_account_mismatch' });
      continue;
    }
    if (account.finance_hold) {
      skipped.push({ invoice_id: invoice.id, reason: 'finance_hold' });
      continue;
    }
    const profile = account.dunning_profile || 'b2b_standard';
    if (profile === 'none' || profile === 'manual') {
      skipped.push({ invoice_id: invoice.id, reason: `dunning_profile_${profile}` });
      continue;
    }
    const steps = dunningSteps(settings, profile);
    if (!steps.length) {
      skipped.push({ invoice_id: invoice.id, reason: 'missing_dunning_steps' });
      continue;
    }
    const existing = await getEntity(base44, 'PaymentReminder').filter(
      { invoice_id: invoice.id },
      '+sequence',
      100,
    );
    const last = existing.at(-1);
    if (last && last.status !== 'sent') {
      skipped.push({ invoice_id: invoice.id, reason: `previous_reminder_${last.status}` });
      continue;
    }
    const nextSequence = last ? Number(last.sequence) + 1 : 1;
    const step = steps.find((candidate: LooseRecord) => candidate.sequence === nextSequence);
    if (!step) {
      skipped.push({ invoice_id: invoice.id, reason: 'dunning_profile_complete' });
      continue;
    }
    const triggerDate = plusDays(invoice.due_date, step.days_after_due);
    if (triggerDate > today) {
      skipped.push({ invoice_id: invoice.id, reason: 'not_due_yet', scheduled_for: triggerDate });
      continue;
    }
    const duplicate = existing.find((reminder: LooseRecord) => Number(reminder.sequence) === step.sequence);
    if (duplicate) {
      skipped.push({ invoice_id: invoice.id, reason: 'already_scheduled' });
      continue;
    }
    const reminderKey = await derivedIdempotencyKey(
      context.companyId,
      'payment_reminder',
      invoice.id,
      step.sequence,
      invoice.due_date,
    );
    const keyReplay = await getEntity(base44, 'PaymentReminder').filter(
      { idempotency_key: reminderKey },
      '-created_date',
      1,
    );
    if (keyReplay.length) {
      items.push({
        invoice_id: invoice.id,
        reminder_id: keyReplay[0].id,
        replayed: true,
      });
      continue;
    }
    const reminder = await getEntity(base44, 'PaymentReminder').create({
      company_id: context.companyId,
      customer_id: invoice.customer_id,
      customer_account_id: invoice.customer_account_id,
      invoice_id: invoice.id,
      sequence: step.sequence,
      reminder_type: step.reminder_type,
      status: 'scheduled',
      channel: step.channel,
      scheduled_for: nowIso(),
      due_date_snapshot: invoice.due_date,
      open_amount_cents: Number(invoice.open_cents),
      additional_costs_cents: 0,
      recipient_snapshot: {
        invoice_email: account.invoice_email || invoice.customer_snapshot?.invoice_email || null,
        billing_contact_id: account.billing_contact_id || null,
        billing_address: invoice.billing_address_snapshot || {},
        dunning_profile: profile,
        trigger_date: triggerDate,
      },
      document_managed_file_id: null,
      idempotency_key: reminderKey,
      version: 1,
    });
    await appendEvent(base44, {
      company_id: context.companyId,
      customer_id: invoice.customer_id,
      customer_account_id: invoice.customer_account_id,
      event_type: 'payment_reminder.scheduled',
      category: 'billing',
      action: 'schedule_reminders',
      actor_type: context.actor.type,
      actor_id: context.actor.id,
      resource_type: 'PaymentReminder',
      resource_id: reminder.id,
      payload: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number || null,
        sequence: reminder.sequence,
        reminder_type: reminder.reminder_type,
        scheduled_for: reminder.scheduled_for,
      },
      idempotency_key: await derivedIdempotencyKey(reminderKey, 'event'),
    });
    items.push({
      invoice_id: invoice.id,
      reminder_id: reminder.id,
      reminder_type: reminder.reminder_type,
      replayed: false,
    });
  }
  return {
    skipped: false,
    considered: eligible.length,
    scheduled: items.filter(item => !item.replayed).length,
    replayed: items.filter(item => item.replayed).length,
    items,
    skipped_items: skipped,
  };
}

async function prepareIndexation(
  base44: LooseRecord,
  settings: LooseRecord,
  context: LooseRecord,
) {
  if (!featureEnabled(settings, 'commercial_contracts', 'commercial_contracts_enabled')) {
    return { skipped: true, reason: 'commercial_contracts_disabled', prepared: 0, items: [] };
  }
  const today = todayIso();
  const profiles = await getEntity(base44, 'PriceIndexProfile').filter(
    { company_id: context.companyId, status: 'active' },
    '+next_index_date',
    Math.min(1000, context.limit * 5),
  );
  const due = profiles
    .filter((profile: LooseRecord) =>
      asString(profile.next_index_date) && profile.next_index_date <= today)
    .slice(0, context.limit);
  const items: LooseRecord[] = [];
  const skipped: LooseRecord[] = [];
  for (const profile of due) {
    const percentage = Number(profile.default_percentage_basis_points);
    if (!Number.isInteger(percentage) || percentage <= -10000 || percentage > 100000) {
      skipped.push({ profile_id: profile.id, reason: 'percentage_requires_review' });
      continue;
    }
    const effectiveDate = dateOnly(profile.next_index_date);
    if (!effectiveDate) {
      skipped.push({ profile_id: profile.id, reason: 'invalid_next_index_date' });
      continue;
    }
    const existing = await getEntity(base44, 'PriceIndexRun').filter({
      price_index_profile_id: profile.id,
      effective_date: effectiveDate,
    }, '-created_date', 10);
    if (existing.length) {
      items.push({ profile_id: profile.id, index_run_id: existing[0].id, replayed: true });
      continue;
    }
    const rates = await getEntity(base44, 'CustomerContractRate').filter({
      company_id: context.companyId,
      price_index_profile_id: profile.id,
      status: 'active',
    }, '+valid_from', 5000);
    if (!rates.length) {
      skipped.push({ profile_id: profile.id, reason: 'no_active_rates' });
      continue;
    }
    const runKey = await derivedIdempotencyKey(
      context.companyId,
      'price_index_run',
      profile.id,
      effectiveDate,
    );
    const run = await getEntity(base44, 'PriceIndexRun').create({
      company_id: context.companyId,
      price_index_profile_id: profile.id,
      effective_date: effectiveDate,
      percentage_basis_points: percentage,
      status: 'draft',
      source_snapshot: {
        profile_name: profile.name,
        profile_version: versionOf(profile),
        method: profile.method,
        rounding_mode: profile.rounding_mode,
        source_reference: profile.source_reference || null,
        prepared_at: nowIso(),
        prepared_by: 'commercialAutomation',
      },
      affected_rate_ids: rates.map((rate: LooseRecord) => rate.id),
      created_rate_ids: [],
      result_summary: {
        affected_rate_count: rates.length,
        auto_apply: false,
      },
      approved_by_user_id: null,
      approved_at: null,
      applied_at: null,
      failure_reason: null,
      idempotency_key: runKey,
      version: 1,
    });
    const customerIds = [...new Set(rates.map((rate: LooseRecord) => rate.customer_id).filter(Boolean))];
    for (const customerId of customerIds) {
      const sample = rates.find((rate: LooseRecord) => rate.customer_id === customerId);
      await appendEvent(base44, {
        company_id: context.companyId,
        customer_id: customerId,
        customer_account_id: sample?.customer_account_id || null,
        event_type: 'indexation.draft_prepared',
        category: 'commercial',
        action: 'prepare_indexation',
        actor_type: context.actor.type,
        actor_id: context.actor.id,
        resource_type: 'PriceIndexRun',
        resource_id: run.id,
        payload: {
          price_index_profile_id: profile.id,
          effective_date: effectiveDate,
          percentage_basis_points: percentage,
          affected_rate_count: rates.filter((rate: LooseRecord) => rate.customer_id === customerId).length,
          auto_apply: false,
        },
        idempotency_key: await derivedIdempotencyKey(runKey, 'event', customerId),
      });
    }
    items.push({
      profile_id: profile.id,
      index_run_id: run.id,
      affected_rate_count: rates.length,
      status: run.status,
      replayed: false,
    });
  }
  return {
    skipped: false,
    considered: due.length,
    prepared: items.filter(item => !item.replayed).length,
    replayed: items.filter(item => item.replayed).length,
    items,
    skipped_items: skipped,
  };
}

async function candidatesAlreadyInDrafts(base44: LooseRecord, candidates: LooseRecord[]) {
  if (!candidates.length) return new Set<string>();
  const ids = candidates.map(candidate => candidate.id);
  const lines = await getEntity(base44, 'SalesInvoiceLine').filter(
    { billing_candidate_id: { $in: ids } },
    '-created_date',
    Math.min(5000, ids.length * 10),
  );
  if (!lines.length) return new Set<string>();
  const invoiceIds = [...new Set(lines.map((line: LooseRecord) => line.invoice_id).filter(Boolean))];
  const invoices = await getEntity(base44, 'SalesInvoice').filter(
    { id: { $in: invoiceIds } },
    '-created_date',
    Math.min(5000, invoiceIds.length),
  );
  const activeInvoiceIds = new Set(
    invoices
      .filter((invoice: LooseRecord) => invoiceLifecycle(invoice) !== 'cancelled')
      .map((invoice: LooseRecord) => invoice.id),
  );
  return new Set(
    lines
      .filter((line: LooseRecord) => activeInvoiceIds.has(line.invoice_id))
      .map((line: LooseRecord) => line.billing_candidate_id),
  );
}

async function collectInvoiceRun(
  base44: LooseRecord,
  settings: LooseRecord,
  context: LooseRecord,
) {
  if (!billingAutomationEnabled(settings)) {
    return {
      skipped: true,
      reason: 'billing_shadow_or_live_disabled',
      invoice_run: null,
      invoices: [],
    };
  }
  const existingRuns = await getEntity(base44, 'InvoiceRun').filter(
    { idempotency_key: context.idempotencyKey },
    '-created_date',
    1,
  );
  if (existingRuns.length) {
    const invoices = await getEntity(base44, 'SalesInvoice').filter(
      { invoice_run_id: existingRuns[0].id },
      '+created_date',
      1000,
    );
    return {
      skipped: false,
      replayed: true,
      invoice_run: existingRuns[0],
      invoices,
      errors: existingRuns[0].errors || [],
    };
  }

  const queried = await getEntity(base44, 'BillingCandidate').filter({
    company_id: context.companyId,
    status: 'approved',
  }, '+service_date', Math.min(2000, context.limit * 4));
  const currency = settings.currency || 'EUR';
  const approved = queried
    .filter((candidate: LooseRecord) =>
      candidate.status === 'approved' &&
      !candidate.invoice_line_id &&
      (candidate.currency || 'EUR') === currency)
    .slice(0, context.limit);
  const alreadyDrafted = await candidatesAlreadyInDrafts(base44, approved);
  const candidates = approved.filter((candidate: LooseRecord) => !alreadyDrafted.has(candidate.id));
  if (!candidates.length) {
    return {
      skipped: true,
      reason: approved.length ? 'approved_candidates_already_in_invoice_drafts' : 'no_approved_candidates',
      invoice_run: null,
      invoices: [],
    };
  }

  const serviceDates = candidates
    .map((candidate: LooseRecord) => dateOnly(candidate.service_date || candidate.period_start))
    .filter(Boolean)
    .sort();
  const periodStart = serviceDates[0] || todayIso();
  const periodEnd = serviceDates.at(-1) || periodStart;
  const run = await getEntity(base44, 'InvoiceRun').create({
    company_id: context.companyId,
    run_number: null,
    status: 'collecting',
    period_start: periodStart,
    period_end: periodEnd,
    filters_snapshot: {
      source: 'commercialAutomation',
      approved_only: true,
      currency,
      auto_issue: false,
      auto_send: false,
      settings_version: versionOf(settings),
    },
    candidate_ids: candidates.map((candidate: LooseRecord) => candidate.id),
    invoice_ids: [],
    candidate_count: candidates.length,
    blocked_count: 0,
    invoice_count: 0,
    total_cents: candidates.reduce(
      (sum: number, candidate: LooseRecord) => sum + Number(candidate.total_cents || 0),
      0,
    ),
    currency,
    started_by_user_id: context.actor.id,
    started_at: nowIso(),
    completed_at: null,
    errors: [],
    idempotency_key: context.idempotencyKey,
    version: 1,
  });
  const groups = new Map<string, LooseRecord[]>();
  for (const candidate of candidates) {
    const key = [
      candidate.customer_id,
      candidate.customer_account_id,
      candidate.currency || 'EUR',
    ].join('|');
    const group = groups.get(key) || [];
    group.push(candidate);
    groups.set(key, group);
  }

  const invoices: LooseRecord[] = [];
  const errors: LooseRecord[] = [];
  for (const [groupKey, group] of groups) {
    try {
      const invoiceKey = await derivedIdempotencyKey(
        context.idempotencyKey,
        'invoice',
        groupKey,
        group.map(candidate => `${candidate.id}:${versionOf(candidate)}`).sort().join(','),
      );
      const result = await createInvoiceFromCandidates(base44, {
        candidates: group,
        idempotencyKey: invoiceKey,
        actor: context.actor,
        invoiceRunId: run.id,
      });
      invoices.push(result.invoice);
      await appendEvent(base44, {
        company_id: result.invoice.company_id,
        customer_id: result.invoice.customer_id,
        customer_account_id: result.invoice.customer_account_id,
        event_type: 'invoice.draft_prepared',
        category: 'billing',
        action: 'collect_invoice_run',
        actor_type: context.actor.type,
        actor_id: context.actor.id,
        resource_type: 'SalesInvoice',
        resource_id: result.invoice.id,
        payload: {
          invoice_run_id: run.id,
          candidate_ids: group.map(candidate => candidate.id),
          lifecycle_status: invoiceLifecycle(result.invoice),
          auto_issue: false,
          auto_send: false,
        },
        idempotency_key: await derivedIdempotencyKey(invoiceKey, 'event'),
      });
    } catch (error) {
      errors.push({
        group: groupKey,
        candidate_ids: group.map(candidate => candidate.id),
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
  return {
    skipped: false,
    replayed: false,
    invoice_run: updatedRun,
    invoices,
    errors,
  };
}

async function executeAction(
  base44: LooseRecord,
  action: string,
  settings: LooseRecord,
  context: LooseRecord,
) {
  if (action === 'expire_quotes') return expireQuotes(base44, settings, context);
  if (action === 'generate_billing_candidates') {
    return generateBillingCandidates(base44, settings, context);
  }
  if (action === 'schedule_reminders') return scheduleReminders(base44, settings, context);
  if (action === 'prepare_indexation') return prepareIndexation(base44, settings, context);
  if (action === 'collect_invoice_run') return collectInvoiceRun(base44, settings, context);
  throw new ApiError(400, 'Onbekende automatiseringsactie');
}

async function runDueWork(
  base44: LooseRecord,
  settings: LooseRecord,
  context: LooseRecord,
) {
  const actions = [
    'expire_quotes',
    'generate_billing_candidates',
    'schedule_reminders',
    'prepare_indexation',
    'collect_invoice_run',
  ];
  const results: LooseRecord = {};
  for (const action of actions) {
    const childContext = {
      ...context,
      idempotencyKey: await derivedIdempotencyKey(context.idempotencyKey, action),
    };
    try {
      results[action] = await executeAction(base44, action, settings, childContext);
    } catch (error) {
      results[action] = {
        error: error instanceof Error ? error.message : String(error),
        status: Number((error as LooseRecord)?.status || 500),
      };
    }
  }
  return results;
}

export async function handleCommercialAutomationRequest(req: Request) {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
  }
  if (req.method !== 'POST') return json({ error: 'Alleen POST is toegestaan', request_id: requestId }, 405);

  try {
    const base44 = createClientFromRequest(req) as LooseRecord;
    const actor = await authorize(req, base44);
    const body = await req.json().catch(() => ({})) as LooseRecord;
    const action = requireString(body, 'action');
    if (!ALLOWED_ACTIONS.has(action)) {
      throw new ApiError(400, 'Onbekende automatiseringsactie', {
        allowed_actions: [...ALLOWED_ACTIONS],
      });
    }
    const companyId = requireString(body, 'company_id');
    const idempotencyKey = requireString(body, 'idempotency_key');
    if (idempotencyKey.length > 180) throw new ApiError(400, 'idempotency_key is te lang');
    const expectedVersion = requireInteger(body.expected_version, 'expected_version', 1);
    const limit = body.limit == null
      ? 100
      : requireInteger(body.limit, 'limit', 1, 500);

    // Autorisatie is hierboven afgerond voordat de eerste service-role datalezing plaatsvindt.
    const settings = await loadSettings(base44, companyId, expectedVersion);
    const context = { companyId, idempotencyKey, expectedVersion, limit, actor };
    const result = action === 'run_due_work'
      ? await runDueWork(base44, settings, context)
      : await executeAction(base44, action, settings, context);
    return json({
      ok: true,
      action,
      company_id: companyId,
      settings_version: versionOf(settings),
      result,
    });
  } catch (error) {
    const status = Number((error as LooseRecord)?.status || 500);
    console.error('[commercialAutomation]', requestId, error);
    return json({
      error: status >= 500
        ? 'Commerciële automatisering mislukt'
        : (error as Error)?.message || 'Automatisering mislukt',
      details: (error as LooseRecord)?.details || null,
      request_id: requestId,
    }, status);
  }
}

export { canonicalContractLineTaskTypeKey, canonicalExecutionTaskType };
export default handleCommercialAutomationRequest;
