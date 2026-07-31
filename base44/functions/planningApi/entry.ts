// @ts-ignore Base44 resolves npm: imports in its Deno runtime.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

declare const Deno: {
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

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

const SHIFT_COPY_FIELDS = [
  'company_id',
  'customer_id',
  'customer_ids',
  'object_id',
  'object_ids',
  'route_id',
  'task_id',
  'customer_contract_line_id',
  'customer_name_snapshot',
  'object_name_snapshot',
  'route_name_snapshot',
  'service_name_snapshot',
  'service_date',
  'end_date',
  'start_time',
  'end_time',
  'timezone',
  'duration_minutes',
  'required_count',
  'cao_key',
  'service_function_type',
  'required_cao_function_group',
  'required_cao_function_level',
  'required_security_role_status',
  'required_qualification_types',
  'required_qualification_groups',
  'contract_assignment_policy',
  'performs_security_work',
  'security_work_percentage',
  'works_event_or_hospitality_security',
  'event_hospitality_cao_applies',
  'works_airport_schiphol',
  'works_cash_value_logistics',
  'customer_billable',
  'counts_toward_required_staffing',
  'service_context_snapshot',
] as const;

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function nowIso() {
  return new Date().toISOString();
}

function compact(value: unknown) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeToken(value: unknown) {
  return compact(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function asDate(value: unknown, field: string) {
  const text = compact(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new ApiError(400, `${field} moet YYYY-MM-DD zijn`);
  }
  const parsed = new Date(`${text}T12:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new ApiError(400, `${field} is geen geldige datum`);
  }
  return text;
}

function optionalDate(value: unknown, field: string) {
  return value == null || value === '' ? null : asDate(value, field);
}

function asTime(value: unknown, field: string) {
  const text = compact(value);
  const match = text.match(/^(\d{2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new ApiError(400, `${field} moet een geldige HH:MM-tijd zijn`);
  }
  return text;
}

function positiveInteger(value: unknown, field: string, minimum = 1) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < minimum) {
    throw new ApiError(400, `${field} moet een geheel getal vanaf ${minimum} zijn`);
  }
  return result;
}

function nonNegativeInteger(value: unknown, field: string) {
  return positiveInteger(value, field, 0);
}

function normalizeArray<T = unknown>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]).filter(item => item != null) as T[];
}

function uniqueStrings(value: unknown) {
  return [...new Set(normalizeArray(value).map(compact).filter(Boolean))];
}

function uniqueRecords<T>(records: T[], key: (record: T) => string) {
  return [...new Map(records.map(record => [key(record), record])).values()];
}

function pick(record: LooseRecord, fields: readonly string[]) {
  return Object.fromEntries(
    fields
      .filter(field => Object.prototype.hasOwnProperty.call(record, field))
      .map(field => [field, record[field]]),
  );
}

function requireAdmin(user: LooseRecord | null | undefined) {
  if (!user) throw new ApiError(401, 'Niet ingelogd');
  if (user.role !== 'admin') throw new ApiError(403, 'Alleen backofficebeheerders hebben toegang');
}

function requireId(body: LooseRecord, field: string) {
  const value = compact(body[field]);
  if (!value) throw new ApiError(400, `${field} is verplicht`);
  return value;
}

function revisionOf(record: LooseRecord) {
  const revision = Number(record?.revision);
  return Number.isInteger(revision) && revision > 0 ? revision : 1;
}

function actorName(user: LooseRecord) {
  return compact(user.full_name || user.display_name || user.name) || null;
}

function mutationContext(body: LooseRecord) {
  const idempotencyKey = compact(body.idempotency_key) || null;
  const correlationId = compact(body.correlation_id || idempotencyKey) || crypto.randomUUID();
  return { idempotencyKey, correlationId };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as LooseRecord)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function getRecord(base44: LooseRecord, entityName: string, id: string) {
  return base44.asServiceRole.entities[entityName].get(id).catch(() => null);
}

async function requireRecord(base44: LooseRecord, entityName: string, id: string, label: string) {
  const record = await getRecord(base44, entityName, id);
  if (!record) throw new ApiError(404, `${label} niet gevonden`);
  return record;
}

async function casUpdate(
  base44: LooseRecord,
  entityName: string,
  record: LooseRecord,
  expectedRevision: number,
  patch: LooseRecord,
) {
  const actualRevision = revisionOf(record);
  if (expectedRevision !== actualRevision) {
    throw new ApiError(409, 'Planning is intussen gewijzigd', {
      entity: entityName,
      id: record.id,
      expected_revision: expectedRevision,
      current_revision: actualRevision,
    });
  }
  const result = await base44.asServiceRole.entities[entityName].updateMany(
    { id: record.id, revision: expectedRevision },
    { $set: patch, $inc: { revision: 1 } },
  );
  if (!result?.success || result.updated !== 1) {
    const current = await getRecord(base44, entityName, record.id);
    throw new ApiError(409, 'Planning is intussen gewijzigd', {
      entity: entityName,
      id: record.id,
      expected_revision: expectedRevision,
      current_revision: current ? revisionOf(current) : null,
    });
  }
  return requireRecord(base44, entityName, record.id, entityName);
}

async function findReplay(base44: LooseRecord, action: string, idempotencyKey: string | null) {
  if (!idempotencyKey) return null;
  const events = await base44.asServiceRole.entities.PlanningAuditEvent
    .filter({ idempotency_key: idempotencyKey }, '-occurred_at', 20);
  if (!events.length) return null;
  const matching = events.find((event: LooseRecord) => event.action === action);
  if (!matching) {
    throw new ApiError(409, 'idempotency_key is al voor een andere planningactie gebruikt');
  }
  return matching;
}

function replayResult(event: LooseRecord) {
  return {
    ok: true,
    idempotent: true,
    ...(event.after_state || {}),
    audit_event_id: event.id,
    undoable: event.undoable === true,
    undo_token: event.undoable === true ? (event.undo_token || null) : null,
  };
}

async function appendAudit(
  base44: LooseRecord,
  user: LooseRecord,
  input: LooseRecord,
) {
  return base44.asServiceRole.entities.PlanningAuditEvent.create({
    action: input.action,
    resource_type: input.resource_type || null,
    resource_id: input.resource_id || null,
    shift_id: input.shift_id || null,
    assignment_id: input.assignment_id || null,
    publication_id: input.publication_id || null,
    before_state: input.before_state || null,
    after_state: input.after_state || null,
    actor_user_id: user.id || null,
    actor_name: actorName(user),
    actor_email: compact(user.email) || null,
    occurred_at: nowIso(),
    correlation_id: input.correlation_id,
    idempotency_key: input.idempotency_key || null,
    undoable: input.undoable === true,
    undo_token: input.undoable === true ? (input.undo_token || crypto.randomUUID()) : null,
    undo_of_event_id: input.undo_of_event_id || null,
    undo_payload: input.undo_payload || null,
    metadata: input.metadata || null,
  });
}

function warning(
  code: string,
  severity: 'info' | 'warning' | 'critical',
  message: string,
  source: string | null = null,
  details: LooseRecord | null = null,
) {
  return { code, severity, message, source, details };
}

function normalizeSuppliedWarnings(body: LooseRecord) {
  return normalizeArray<LooseRecord>(body.warning_snapshot || body.warnings)
    .map((item, index) => {
      if (typeof item === 'string') {
        return warning(`supplied_warning_${index + 1}`, 'warning', compact(item), 'planner');
      }
      const severity = ['info', 'warning', 'critical'].includes(item?.severity)
        ? item.severity
        : item?.critical === true
        ? 'critical'
        : 'warning';
      const title = compact(item?.title);
      const detail = compact(item?.detail);
      const details = item?.details && typeof item.details === 'object'
        ? { ...item.details, ...(detail ? { detail } : {}) }
        : detail
        ? { detail }
        : null;
      return warning(
        compact(item?.code) || `supplied_warning_${index + 1}`,
        severity,
        compact(item?.message || item?.reason)
          || [title, detail].filter(Boolean).join(': ')
          || 'Waarschuwing zonder omschrijving',
        compact(item?.source) || 'planner',
        details,
      );
    });
}

function dedupeWarnings(warnings: LooseRecord[]) {
  return uniqueRecords(
    warnings.filter(item => item?.code && item?.message),
    item => `${item.code}:${item.severity}:${item.message}`,
  );
}

function parseClockMinutes(value: unknown) {
  const match = compact(value).match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function dateOrdinal(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function shiftInterval(shift: LooseRecord) {
  const date = compact(shift.service_date);
  const startMinutes = parseClockMinutes(shift.start_time);
  const endMinutes = parseClockMinutes(shift.end_time);
  if (!date || startMinutes == null || endMinutes == null) return null;
  const start = dateOrdinal(date) * 1440 + startMinutes;
  const explicitEndDate = compact(shift.end_date);
  const endDay = explicitEndDate
    ? dateOrdinal(explicitEndDate)
    : dateOrdinal(date) + (endMinutes <= startMinutes ? 1 : 0);
  const end = endDay * 1440 + endMinutes;
  return end > start ? { start, end } : null;
}

function intervalsOverlap(a: LooseRecord, b: LooseRecord) {
  const first = shiftInterval(a);
  const second = shiftInterval(b);
  return !!first && !!second && first.start < second.end && second.start < first.end;
}

function dateInRange(date: string, start: unknown, end: unknown) {
  const from = compact(start);
  const until = compact(end) || from;
  return !!from && from <= date && date <= until;
}

function serviceContextFromShift(shift: LooseRecord, personnelId?: string) {
  return {
    ...(shift.service_context_snapshot || {}),
    personnel_id: personnelId || null,
    service_date: shift.service_date,
    company_id: shift.company_id || null,
    operating_company_id: shift.company_id || null,
    customer_id: shift.customer_id || null,
    object_id: shift.object_id || null,
    route_id: shift.route_id || null,
    task_id: shift.task_id || null,
    cao_key: shift.cao_key || null,
    function_type: shift.service_function_type || null,
    service_function_type: shift.service_function_type || null,
    cao_function_group: shift.required_cao_function_group || null,
    cao_function_level: shift.required_cao_function_level || null,
    security_role_status: shift.required_security_role_status || null,
    required_qualification_types: shift.required_qualification_types || [],
    required_qualification_groups: shift.required_qualification_groups || [],
    performs_security_work: shift.performs_security_work ?? null,
    security_work_percentage: shift.security_work_percentage ?? null,
    works_event_or_hospitality_security: shift.works_event_or_hospitality_security ?? null,
    event_hospitality_cao_applies: shift.event_hospitality_cao_applies ?? null,
    works_airport_schiphol: shift.works_airport_schiphol ?? null,
    works_cash_value_logistics: shift.works_cash_value_logistics ?? null,
    customer_billable: shift.customer_billable ?? null,
    counts_toward_required_staffing: shift.counts_toward_required_staffing ?? null,
    contract_assignment_policy: shift.contract_assignment_policy || 'allow_manual_review',
  };
}

function restrictionMatches(restriction: LooseRecord, shift: LooseRecord) {
  if (restriction.status === 'inactive' || restriction.may_work !== false) return false;
  if (!dateInRange(shift.service_date, restriction.valid_from || '0000-01-01', restriction.valid_until || '9999-12-31')) {
    return false;
  }
  const label = normalizeToken(restriction.scope_label);
  if (!label) return false;
  const valuesByScope: Record<string, unknown[]> = {
    customer: [shift.customer_id, shift.customer_name_snapshot],
    object: [shift.object_id, shift.object_name_snapshot],
    route: [shift.route_id, shift.route_name_snapshot],
    function_group: [shift.required_cao_function_group, shift.service_function_type],
    other: [
      shift.customer_id,
      shift.customer_name_snapshot,
      shift.object_id,
      shift.object_name_snapshot,
      shift.route_id,
      shift.route_name_snapshot,
      shift.required_cao_function_group,
      shift.service_function_type,
    ],
  };
  return (valuesByScope[restriction.scope_type] || valuesByScope.other)
    .map(normalizeToken)
    .filter(Boolean)
    .some(value => value === label || value.includes(label) || label.includes(value));
}

async function evaluateAssignmentWarnings(
  base44: LooseRecord,
  shift: LooseRecord,
  personnel: LooseRecord,
  currentAssignmentId: string | null,
  suppliedWarnings: LooseRecord[],
) {
  const warnings: LooseRecord[] = [...suppliedWarnings];
  let routingSnapshot: LooseRecord | null = null;
  let personnelContractId: string | null = null;

  if (personnel.status !== 'active' || personnel.is_active === false) {
    warnings.push(warning(
      'personnel_not_active',
      'critical',
      `Medewerker ${personnel.name || personnel.id} staat niet actief.`,
      'personnel',
    ));
  }

  const [personnelAssignments, absences, restrictions] = await Promise.all([
    base44.asServiceRole.entities.PlanningAssignment.filter({ personnel_id: personnel.id }).catch(() => []),
    base44.asServiceRole.entities.PersonnelAbsence.filter({ personnel_id: personnel.id }).catch(() => []),
    base44.asServiceRole.entities.PersonnelRestriction.filter({ personnel_id: personnel.id }).catch(() => []),
  ]);
  const comparisonAssignments = personnelAssignments.filter((assignment: LooseRecord) =>
    assignment.id !== currentAssignmentId && assignment.status !== 'removed'
  );
  const comparisonShifts = await Promise.all(
    uniqueStrings(comparisonAssignments.map((assignment: LooseRecord) => assignment.shift_id))
      .map(id => getRecord(base44, 'PlanningShift', id)),
  );
  const overlapping = comparisonShifts.filter((other: LooseRecord | null) =>
    other && other.status !== 'cancelled' && intervalsOverlap(shift, other)
  ) as LooseRecord[];
  if (overlapping.length) {
    warnings.push(warning(
      'shift_overlap',
      'critical',
      `Medewerker is al ingepland op ${overlapping.length} overlappende dienst${overlapping.length === 1 ? '' : 'en'}.`,
      'planning',
      { overlapping_shift_ids: overlapping.map(item => item.id) },
    ));
  }

  for (const absence of absences) {
    if (absence.status === 'rejected' || absence.status === 'closed') continue;
    if (!dateInRange(shift.service_date, absence.start_date, absence.end_date)) continue;
    const critical = absence.status === 'approved' || absence.status === 'active';
    warnings.push(warning(
      `personnel_absence_${absence.absence_type || 'unknown'}`,
      critical ? 'critical' : 'warning',
      critical
        ? `Medewerker is op deze datum afwezig (${absence.absence_type || 'afwezigheid'}).`
        : `Er staat een afwezigheidsaanvraag open (${absence.absence_type || 'afwezigheid'}).`,
      'personnel_absence',
      { absence_id: absence.id, status: absence.status },
    ));
  }

  for (const restriction of restrictions.filter((item: LooseRecord) => restrictionMatches(item, shift))) {
    warnings.push(warning(
      'personnel_restriction',
      'critical',
      restriction.reason
        ? `Actieve planningrestrictie: ${compact(restriction.reason)}`
        : `Medewerker mag volgens een actieve restrictie niet werken binnen ${restriction.scope_label}.`,
      'personnel_restriction',
      { restriction_id: restriction.id, scope_type: restriction.scope_type, scope_label: restriction.scope_label },
    ));
  }

  try {
    const response = await base44.asServiceRole.functions.invoke('resolveCaoPlanningAssignmentDecision', {
      personnel_id: personnel.id,
      company_id: shift.company_id || null,
      operating_company_id: shift.company_id || null,
      task_id: shift.task_id || null,
      object_id: shift.object_id || null,
      route_id: shift.route_id || null,
      service_date: shift.service_date,
      cao_key: shift.cao_key || null,
      service_context: serviceContextFromShift(shift, personnel.id),
      require_schedule_validation: false,
      run_schedule_validation: false,
      final_validation: false,
    });
    const decision = response?.data || response || null;
    routingSnapshot = decision;
    personnelContractId = decision?.contract_id || decision?.selected_contract?.id || null;
    normalizeArray(decision?.blocking_reasons).forEach((message, index) => {
      warnings.push(warning(
        `contract_cao_blocking_${index + 1}`,
        'critical',
        compact(message),
        'resolveCaoPlanningAssignmentDecision',
      ));
    });
    normalizeArray(decision?.manual_review_reasons).forEach((message, index) => {
      warnings.push(warning(
        `contract_cao_review_${index + 1}`,
        'warning',
        compact(message),
        'resolveCaoPlanningAssignmentDecision',
      ));
    });
    normalizeArray(decision?.warnings).forEach((message, index) => {
      warnings.push(warning(
        `contract_cao_warning_${index + 1}`,
        'info',
        compact(message),
        'resolveCaoPlanningAssignmentDecision',
      ));
    });
  } catch (error) {
    warnings.push(warning(
      'assignment_validation_unavailable',
      'warning',
      `Contract-/CAO-controle kon niet worden afgerond: ${(error as Error)?.message || String(error)}.`,
      'resolveCaoPlanningAssignmentDecision',
    ));
  }

  const snapshot = dedupeWarnings(warnings);
  return {
    warning_snapshot: snapshot,
    warning_codes: [...new Set(snapshot.map(item => item.code))],
    has_critical_warnings: snapshot.some(item => item.severity === 'critical'),
    contract_routing_snapshot: routingSnapshot,
    personnel_contract_id: personnelContractId,
  };
}

function consistentValue(values: unknown[]) {
  const distinct = uniqueStrings(values);
  return distinct.length === 1 ? distinct[0] : null;
}

function customerDisplayName(customer: LooseRecord | null | undefined) {
  return customer
    ? compact(customer.trade_name || customer.legal_name || customer.name) || null
    : null;
}

function routeBootstrapContext(
  execution: LooseRecord,
  route: LooseRecord,
  taskById: Map<string, LooseRecord>,
  objectById: Map<string, LooseRecord>,
  customerById: Map<string, LooseRecord>,
) {
  const taskIds = uniqueStrings((route.assigned_tasks || []).map((item: LooseRecord) => item.task_id));
  const tasks = taskIds.map(id => taskById.get(id)).filter(Boolean) as LooseRecord[];
  const objectIds = uniqueStrings(tasks.map(task => task.object_id));
  const objects = objectIds.map(id => objectById.get(id)).filter(Boolean) as LooseRecord[];
  const customerIds = uniqueStrings(objects.map(object => object.customer_id));
  const customers = customerIds.map(id => customerById.get(id)).filter(Boolean) as LooseRecord[];
  const onlyTask = tasks.length === 1 ? tasks[0] : null;
  const onlyObject = objects.length === 1 ? objects[0] : null;
  const onlyCustomer = customers.length === 1 ? customers[0] : null;
  const companyId = execution.operating_company_id
    || route.operating_company_id
    || consistentValue(tasks.map(task => task.operating_company_id))
    || consistentValue(objects.map(object => object.default_operating_company_id));

  return {
    taskIds,
    tasks,
    objectIds,
    objects,
    customerIds,
    customers,
    onlyTask,
    onlyObject,
    onlyCustomer,
    companyId,
  };
}

function legacyRoutingWarnings(execution: LooseRecord) {
  const snapshot = execution.contract_routing_snapshot || {};
  const warnings: LooseRecord[] = [];
  normalizeArray(snapshot.blocking_reasons).forEach((message, index) => {
    warnings.push(warning(`legacy_routing_blocking_${index + 1}`, 'critical', compact(message), 'RouteExecution'));
  });
  normalizeArray(snapshot.manual_review_reasons).forEach((message, index) => {
    warnings.push(warning(`legacy_routing_review_${index + 1}`, 'warning', compact(message), 'RouteExecution'));
  });
  normalizeArray(snapshot.warnings).forEach((message, index) => {
    warnings.push(warning(`legacy_routing_warning_${index + 1}`, 'info', compact(message), 'RouteExecution'));
  });
  if (execution.contract_routing_status === 'blocked' && warnings.every(item => item.severity !== 'critical')) {
    warnings.push(warning(
      'legacy_routing_blocked',
      'critical',
      'De bestaande route-uitvoering heeft een geblokkeerde contractroutering.',
      'RouteExecution',
    ));
  }
  return dedupeWarnings(warnings);
}

async function bootstrapRange(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  const replay = await findReplay(base44, 'bootstrap_range', context.idempotencyKey);
  if (replay) return replayResult(replay);

  const periodStart = asDate(body.period_start, 'period_start');
  const periodEnd = asDate(body.period_end, 'period_end');
  if (periodEnd < periodStart) throw new ApiError(400, 'period_end ligt voor period_start');

  const [executions, routes, tasks, objects, customers, existingShifts, existingAssignments] = await Promise.all([
    base44.asServiceRole.entities.RouteExecution.list('-service_date'),
    base44.asServiceRole.entities.Route.list(),
    base44.asServiceRole.entities.Task.list(),
    base44.asServiceRole.entities.SurveillanceObject.list(),
    base44.asServiceRole.entities.Customer.list(),
    base44.asServiceRole.entities.PlanningShift.list(),
    base44.asServiceRole.entities.PlanningAssignment.list(),
  ]) as LooseRecord[][];
  const routeById = new Map<string, LooseRecord>(routes.map((item: LooseRecord) => [String(item.id), item]));
  const taskById = new Map<string, LooseRecord>(tasks.map((item: LooseRecord) => [String(item.id), item]));
  const objectById = new Map<string, LooseRecord>(objects.map((item: LooseRecord) => [String(item.id), item]));
  const customerById = new Map<string, LooseRecord>(customers.map((item: LooseRecord) => [String(item.id), item]));
  const shiftBySourceKey = new Map<string, LooseRecord>(
    existingShifts.map((item: LooseRecord) => [String(item.source_key), item]),
  );
  const assignmentBySlot = new Map<string, LooseRecord>(
    existingAssignments.map((item: LooseRecord) => [`${item.shift_id}:${Number(item.slot_index)}`, item]),
  );
  const companyFilter = compact(body.company_id);
  const routeFilter = new Set(uniqueStrings(body.route_ids));
  const relevant = executions
    .filter((execution: LooseRecord) =>
      execution.service_date >= periodStart
      && execution.service_date <= periodEnd
      && (!companyFilter || execution.operating_company_id === companyFilter)
    )
    .filter((execution: LooseRecord) => {
      const routeId = compact(execution.source_route_id || execution.route_id);
      return routeFilter.size === 0 || routeFilter.has(routeId);
    });

  const createdShiftIds: string[] = [];
  const existingShiftIds: string[] = [];
  const createdAssignmentIds: string[] = [];
  const duplicateSourceKeys: string[] = [];
  const seenSourceKeys = new Set<string>();

  for (const execution of relevant) {
    const routeId = compact(execution.source_route_id || execution.route_id);
    if (!routeId || !execution.service_date) continue;
    const sourceKey = `route:${routeId}:${execution.service_date}`;
    if (seenSourceKeys.has(sourceKey)) {
      duplicateSourceKeys.push(sourceKey);
      continue;
    }
    seenSourceKeys.add(sourceKey);
    const route: LooseRecord = routeById.get(routeId) || {};
    const sourceContext = routeBootstrapContext(execution, route, taskById, objectById, customerById);
    let shift: LooseRecord | null = shiftBySourceKey.get(sourceKey) || null;

    if (!shift) {
      const task = sourceContext.onlyTask;
      const object = sourceContext.onlyObject;
      const customer = sourceContext.onlyCustomer;
      const requiredQualificationTypes = uniqueStrings([
        ...sourceContext.tasks.flatMap(item => item.required_qualification_types || []),
        ...sourceContext.objects.flatMap(item => item.default_required_qualification_types || []),
      ]);
      const requiredQualificationGroups = uniqueStrings([
        ...sourceContext.tasks.flatMap(item => item.required_qualification_groups || []),
        ...sourceContext.objects.flatMap(item => item.default_required_qualification_groups || []),
      ]);
      const startTime = asTime(execution.shift_start_time || route.time_window_start, 'shift_start_time');
      const endTime = asTime(execution.shift_end_time || route.time_window_end, 'shift_end_time');
      const createdShift: LooseRecord = await base44.asServiceRole.entities.PlanningShift.create({
        source_key: sourceKey,
        source_type: 'route',
        source_id: routeId,
        source_shift_id: null,
        source_route_execution_id: execution.id || null,
        company_id: sourceContext.companyId || null,
        customer_id: customer?.id || null,
        customer_ids: sourceContext.customerIds,
        object_id: object?.id || null,
        object_ids: sourceContext.objectIds,
        route_id: routeId,
        task_id: task?.id || null,
        customer_contract_line_id: null,
        customer_name_snapshot: customerDisplayName(customer),
        object_name_snapshot: object?.name || null,
        route_name_snapshot: execution.route_name || route.name || null,
        service_name_snapshot: execution.route_name || route.name || 'Route',
        service_date: execution.service_date,
        end_date: null,
        start_time: startTime,
        end_time: endTime,
        timezone: 'Europe/Amsterdam',
        duration_minutes: execution.total_planned_route_minutes ?? route.total_route_minutes ?? null,
        required_count: 1,
        cao_key: execution.contract_cao_key || route.cao_key || task?.cao_key || object?.cao_key || null,
        service_function_type: execution.contract_function_key
          || task?.service_function_type
          || object?.default_service_function_type
          || null,
        required_cao_function_group: task?.required_cao_function_group || object?.default_cao_function_group || null,
        required_cao_function_level: task?.required_cao_function_level || object?.default_cao_function_level || null,
        required_security_role_status: task?.required_security_role_status || object?.default_security_role_status || null,
        required_qualification_types: requiredQualificationTypes,
        required_qualification_groups: requiredQualificationGroups,
        contract_assignment_policy: task?.contract_assignment_policy
          || object?.contract_assignment_policy
          || 'allow_manual_review',
        performs_security_work: task?.performs_security_work ?? object?.default_performs_security_work ?? null,
        security_work_percentage: task?.security_work_percentage ?? object?.default_security_work_percentage ?? null,
        works_event_or_hospitality_security: task?.works_event_or_hospitality_security
          ?? object?.default_works_event_or_hospitality_security
          ?? null,
        event_hospitality_cao_applies: task?.event_hospitality_cao_applies
          ?? object?.default_event_hospitality_cao_applies
          ?? null,
        works_airport_schiphol: task?.works_airport_schiphol ?? object?.default_works_airport_schiphol ?? null,
        works_cash_value_logistics: task?.works_cash_value_logistics
          ?? object?.default_works_cash_value_logistics
          ?? null,
        customer_billable: task?.customer_billable ?? object?.default_customer_billable ?? null,
        counts_toward_required_staffing: task?.counts_toward_required_staffing
          ?? object?.default_counts_toward_required_staffing
          ?? null,
        service_context_snapshot: {
          bootstrap_source: 'RouteExecution',
          route_execution_id: execution.id || null,
          route_task_ids: sourceContext.taskIds,
          object_ids: sourceContext.objectIds,
          customer_ids: sourceContext.customerIds,
          original_contract_routing_snapshot: execution.contract_routing_snapshot || null,
        },
        status: execution.status === 'cancelled' ? 'cancelled' : 'draft',
        revision: 1,
        published_revision: 0,
        last_published_correlation_id: null,
        last_modified_by_user_id: user.id || null,
        last_modified_at: nowIso(),
        metadata: { bootstrap_source_status: execution.status || null },
      });
      shift = createdShift;
      shiftBySourceKey.set(sourceKey, shift);
      createdShiftIds.push(shift.id);
    } else {
      existingShiftIds.push(shift.id);
    }

    const slotKey = `${shift.id}:0`;
    if (execution.employee_id && !assignmentBySlot.has(slotKey)) {
      const warningSnapshot = legacyRoutingWarnings(execution);
      const assignment = await base44.asServiceRole.entities.PlanningAssignment.create({
        shift_id: shift.id,
        slot_index: 0,
        personnel_id: execution.employee_id,
        personnel_name_snapshot: execution.employee_name || 'Medewerker',
        personnel_contract_id: execution.personnel_contract_id || null,
        status: 'draft',
        warning_codes: warningSnapshot.map(item => item.code),
        warning_snapshot: warningSnapshot,
        has_critical_warnings: warningSnapshot.some(item => item.severity === 'critical'),
        contract_routing_snapshot: execution.contract_routing_snapshot || null,
        assigned_by_user_id: user.id || null,
        assigned_at: nowIso(),
        removed_by_user_id: null,
        removed_at: null,
        revision: 1,
        published_revision: 0,
        last_published_correlation_id: null,
        metadata: {
          bootstrap_source: 'RouteExecution',
          route_execution_id: execution.id || null,
        },
      });
      assignmentBySlot.set(slotKey, assignment);
      createdAssignmentIds.push(assignment.id);
    }
  }

  const result = {
    period_start: periodStart,
    period_end: periodEnd,
    considered_route_execution_count: relevant.length,
    created_shift_count: createdShiftIds.length,
    existing_shift_count: existingShiftIds.length,
    created_assignment_count: createdAssignmentIds.length,
    duplicate_source_keys: [...new Set(duplicateSourceKeys)],
    created_shift_ids: createdShiftIds,
    existing_shift_ids: existingShiftIds,
    created_assignment_ids: createdAssignmentIds,
  };
  await appendAudit(base44, user, {
    action: 'bootstrap_range',
    resource_type: 'PlanningRange',
    before_state: null,
    after_state: result,
    correlation_id: context.correlationId,
    idempotency_key: context.idempotencyKey,
    undoable: false,
  });
  return { ok: true, ...result, undoable: false, undo_token: null };
}

async function uniqueSlotAssignment(base44: LooseRecord, shiftId: string, slotIndex: number) {
  const records = await base44.asServiceRole.entities.PlanningAssignment.filter({
    shift_id: shiftId,
    slot_index: slotIndex,
  });
  if (records.length > 1) {
    throw new ApiError(409, 'Meerdere PlanningAssignment-records delen dezelfde dienstslot', {
      shift_id: shiftId,
      slot_index: slotIndex,
      assignment_ids: records.map((item: LooseRecord) => item.id),
    });
  }
  return records[0] || null;
}

async function markShiftDraft(
  base44: LooseRecord,
  shift: LooseRecord,
  expectedRevision: number,
  user: LooseRecord,
  extraPatch: LooseRecord = {},
) {
  return casUpdate(base44, 'PlanningShift', shift, expectedRevision, {
    ...extraPatch,
    status: shift.status === 'cancelled' ? 'cancelled' : 'draft',
    last_modified_by_user_id: user.id || null,
    last_modified_at: nowIso(),
  });
}

async function assignPersonnel(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  const replay = await findReplay(base44, 'assign', context.idempotencyKey);
  if (replay) return replayResult(replay);

  const shiftId = requireId(body, 'shift_id');
  const personnelId = requireId(body, 'personnel_id');
  const expectedShiftRevision = positiveInteger(body.expected_shift_revision, 'expected_shift_revision');
  const slotIndex = nonNegativeInteger(body.slot_index ?? 0, 'slot_index');
  const [shift, personnel] = await Promise.all([
    requireRecord(base44, 'PlanningShift', shiftId, 'Dienst'),
    requireRecord(base44, 'Personnel', personnelId, 'Medewerker'),
  ]);
  if (shift.status === 'cancelled') throw new ApiError(409, 'Een geannuleerde dienst kan niet worden bezet');
  if (slotIndex >= Number(shift.required_count || 1)) {
    throw new ApiError(400, 'slot_index valt buiten required_count');
  }

  const existing = await uniqueSlotAssignment(base44, shiftId, slotIndex);
  const sameShiftAssignments = await base44.asServiceRole.entities.PlanningAssignment.filter({
    shift_id: shiftId,
    personnel_id: personnelId,
  });
  const duplicateAssignment = sameShiftAssignments.find((item: LooseRecord) =>
    item.status !== 'removed' && item.id !== existing?.id
  );
  if (duplicateAssignment) {
    throw new ApiError(409, 'Medewerker is al aan deze dienst toegewezen', {
      shift_id: shiftId,
      personnel_id: personnelId,
      assignment_id: duplicateAssignment.id,
    });
  }
  const eligibility = await evaluateAssignmentWarnings(
    base44,
    shift,
    personnel,
    existing?.id || null,
    normalizeSuppliedWarnings(body),
  );
  const updatedShift = await markShiftDraft(base44, shift, expectedShiftRevision, user);
  const assignmentPayload = {
    personnel_id: personnel.id,
    personnel_name_snapshot: personnel.name
      || [personnel.call_name || personnel.first_name, personnel.name_prefix, personnel.last_name].filter(Boolean).join(' ')
      || 'Medewerker',
    personnel_contract_id: eligibility.personnel_contract_id,
    status: 'draft',
    warning_codes: eligibility.warning_codes,
    warning_snapshot: eligibility.warning_snapshot,
    has_critical_warnings: eligibility.has_critical_warnings,
    contract_routing_snapshot: eligibility.contract_routing_snapshot,
    assigned_by_user_id: user.id || null,
    assigned_at: nowIso(),
    removed_by_user_id: null,
    removed_at: null,
    last_published_correlation_id: existing?.last_published_correlation_id || null,
    metadata: {
      ...(existing?.metadata || {}),
      assignment_source: body.assignment_source || 'planning_ui',
    },
  };
  const assignment = existing
    ? await casUpdate(base44, 'PlanningAssignment', existing, revisionOf(existing), assignmentPayload)
    : await base44.asServiceRole.entities.PlanningAssignment.create({
        shift_id: shift.id,
        slot_index: slotIndex,
        ...assignmentPayload,
        revision: 1,
        published_revision: 0,
      });
  const result = { shift: updatedShift, assignment };
  const audit = await appendAudit(base44, user, {
    action: 'assign',
    resource_type: 'PlanningAssignment',
    resource_id: assignment.id,
    shift_id: shift.id,
    assignment_id: assignment.id,
    before_state: existing ? { shift, assignment: existing } : { shift, assignment: null },
    after_state: result,
    correlation_id: context.correlationId,
    idempotency_key: context.idempotencyKey,
    undoable: true,
    undo_payload: {
      action: existing ? 'assign' : 'unassign',
      shift_id: shift.id,
      assignment_id: assignment.id,
      slot_index: slotIndex,
      previous_shift: shift,
      previous_assignment: existing || null,
    },
  });
  return {
    ok: true,
    ...result,
    audit_event_id: audit.id,
    undoable: true,
    undo_token: audit.undo_token || null,
  };
}

async function unassignPersonnel(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  const replay = await findReplay(base44, 'unassign', context.idempotencyKey);
  if (replay) return replayResult(replay);

  const shiftId = requireId(body, 'shift_id');
  const expectedShiftRevision = positiveInteger(body.expected_shift_revision, 'expected_shift_revision');
  const shift = await requireRecord(base44, 'PlanningShift', shiftId, 'Dienst');
  let assignment: LooseRecord | null = null;
  if (body.assignment_id) {
    const loadedAssignment = await requireRecord(
      base44,
      'PlanningAssignment',
      compact(body.assignment_id),
      'Toewijzing',
    );
    if (loadedAssignment.shift_id !== shift.id) throw new ApiError(409, 'Toewijzing hoort niet bij deze dienst');
    assignment = loadedAssignment;
  } else {
    assignment = await uniqueSlotAssignment(base44, shift.id, nonNegativeInteger(body.slot_index ?? 0, 'slot_index'));
  }
  if (!assignment) throw new ApiError(404, 'Toewijzing niet gevonden');
  if (assignment.status === 'removed') {
    return { ok: true, idempotent: true, shift, assignment, undoable: false, undo_token: null };
  }

  const updatedShift = await markShiftDraft(base44, shift, expectedShiftRevision, user);
  const updatedAssignment = await casUpdate(base44, 'PlanningAssignment', assignment, revisionOf(assignment), {
    status: 'removed',
    removed_by_user_id: user.id || null,
    removed_at: nowIso(),
  });
  const result = { shift: updatedShift, assignment: updatedAssignment };
  const audit = await appendAudit(base44, user, {
    action: 'unassign',
    resource_type: 'PlanningAssignment',
    resource_id: assignment.id,
    shift_id: shift.id,
    assignment_id: assignment.id,
    before_state: { shift, assignment },
    after_state: result,
    correlation_id: context.correlationId,
    idempotency_key: context.idempotencyKey,
    undoable: true,
    undo_payload: {
      action: 'restore_assignment',
      shift_id: shift.id,
      assignment_id: assignment.id,
      previous_shift: shift,
      previous_assignment: assignment,
    },
  });
  return {
    ok: true,
    ...result,
    audit_event_id: audit.id,
    undoable: true,
    undo_token: audit.undo_token || null,
  };
}

async function restoreAssignment(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  const replay = await findReplay(base44, 'restore_assignment', context.idempotencyKey);
  if (replay) return replayResult(replay);

  const assignmentId = requireId(body, 'assignment_id');
  const expectedShiftRevision = positiveInteger(body.expected_shift_revision, 'expected_shift_revision');
  const assignment = await requireRecord(base44, 'PlanningAssignment', assignmentId, 'Toewijzing');
  const [shift, personnel] = await Promise.all([
    requireRecord(base44, 'PlanningShift', assignment.shift_id, 'Dienst'),
    requireRecord(base44, 'Personnel', assignment.personnel_id, 'Medewerker'),
  ]);
  if (shift.status === 'cancelled') throw new ApiError(409, 'Een toewijzing op een geannuleerde dienst kan niet worden hersteld');
  if (assignment.status !== 'removed') {
    return { ok: true, idempotent: true, shift, assignment, undoable: false, undo_token: null };
  }
  const sameSlot = await uniqueSlotAssignment(base44, shift.id, Number(assignment.slot_index));
  if (sameSlot && sameSlot.id !== assignment.id && sameSlot.status !== 'removed') {
    throw new ApiError(409, 'De bezettingsplaats is intussen opnieuw ingevuld');
  }
  const eligibility = await evaluateAssignmentWarnings(
    base44,
    shift,
    personnel,
    assignment.id,
    normalizeSuppliedWarnings(body),
  );
  const updatedShift = await markShiftDraft(base44, shift, expectedShiftRevision, user);
  const updatedAssignment = await casUpdate(base44, 'PlanningAssignment', assignment, revisionOf(assignment), {
    status: 'draft',
    warning_codes: eligibility.warning_codes,
    warning_snapshot: eligibility.warning_snapshot,
    has_critical_warnings: eligibility.has_critical_warnings,
    contract_routing_snapshot: eligibility.contract_routing_snapshot,
    personnel_contract_id: eligibility.personnel_contract_id,
    assigned_by_user_id: user.id || assignment.assigned_by_user_id || null,
    assigned_at: nowIso(),
    removed_by_user_id: null,
    removed_at: null,
  });
  const result = { shift: updatedShift, assignment: updatedAssignment };
  const audit = await appendAudit(base44, user, {
    action: 'restore_assignment',
    resource_type: 'PlanningAssignment',
    resource_id: assignment.id,
    shift_id: shift.id,
    assignment_id: assignment.id,
    before_state: { shift, assignment },
    after_state: result,
    correlation_id: context.correlationId,
    idempotency_key: context.idempotencyKey,
    undoable: true,
    undo_of_event_id: compact(body.undo_of_event_id) || null,
    undo_payload: {
      action: 'unassign',
      shift_id: shift.id,
      assignment_id: assignment.id,
      previous_shift: shift,
      previous_assignment: assignment,
    },
  });
  return {
    ok: true,
    ...result,
    audit_event_id: audit.id,
    undoable: true,
    undo_token: audit.undo_token || null,
  };
}

async function moveShift(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  const replay = await findReplay(base44, 'move', context.idempotencyKey);
  if (replay) return replayResult(replay);

  const shiftId = requireId(body, 'shift_id');
  const expectedShiftRevision = positiveInteger(body.expected_shift_revision, 'expected_shift_revision');
  const shift = await requireRecord(base44, 'PlanningShift', shiftId, 'Dienst');
  if (shift.status === 'cancelled') throw new ApiError(409, 'Een geannuleerde dienst kan niet worden verplaatst');
  const serviceDate = body.service_date ? asDate(body.service_date, 'service_date') : shift.service_date;
  const startTime = body.start_time ? asTime(body.start_time, 'start_time') : shift.start_time;
  const endTime = body.end_time ? asTime(body.end_time, 'end_time') : shift.end_time;
  const endDate = Object.prototype.hasOwnProperty.call(body, 'end_date')
    ? optionalDate(body.end_date, 'end_date')
    : shift.end_date || null;
  if (endDate && endDate < serviceDate) throw new ApiError(400, 'end_date ligt voor service_date');
  const updatedShift = await markShiftDraft(base44, shift, expectedShiftRevision, user, {
    service_date: serviceDate,
    end_date: endDate,
    start_time: startTime,
    end_time: endTime,
  });

  const assignments = await base44.asServiceRole.entities.PlanningAssignment.filter({ shift_id: shift.id });
  const updatedAssignments: LooseRecord[] = [];
  for (const assignment of assignments.filter((item: LooseRecord) => item.status !== 'removed')) {
    const personnel = await requireRecord(base44, 'Personnel', assignment.personnel_id, 'Medewerker');
    const eligibility = await evaluateAssignmentWarnings(
      base44,
      updatedShift,
      personnel,
      assignment.id,
      normalizeArray(assignment.warning_snapshot).filter((item: LooseRecord) => item.source === 'planner'),
    );
    updatedAssignments.push(await casUpdate(
      base44,
      'PlanningAssignment',
      assignment,
      revisionOf(assignment),
      {
        status: 'draft',
        warning_codes: eligibility.warning_codes,
        warning_snapshot: eligibility.warning_snapshot,
        has_critical_warnings: eligibility.has_critical_warnings,
        contract_routing_snapshot: eligibility.contract_routing_snapshot,
        personnel_contract_id: eligibility.personnel_contract_id,
      },
    ));
  }
  const result = { shift: updatedShift, assignments: updatedAssignments };
  const audit = await appendAudit(base44, user, {
    action: 'move',
    resource_type: 'PlanningShift',
    resource_id: shift.id,
    shift_id: shift.id,
    before_state: { shift, assignments },
    after_state: result,
    correlation_id: context.correlationId,
    idempotency_key: context.idempotencyKey,
    undoable: true,
    undo_payload: {
      action: 'move',
      shift_id: shift.id,
      previous_shift: shift,
      previous_assignments: assignments,
    },
  });
  return {
    ok: true,
    ...result,
    audit_event_id: audit.id,
    undoable: true,
    undo_token: audit.undo_token || null,
  };
}

const SHIFT_UNDO_FIELDS = [
  'service_date',
  'end_date',
  'start_time',
  'end_time',
  'status',
  'published_revision',
  'last_published_correlation_id',
] as const;

const ASSIGNMENT_UNDO_FIELDS = [
  'personnel_id',
  'personnel_name_snapshot',
  'personnel_contract_id',
  'status',
  'warning_codes',
  'warning_snapshot',
  'has_critical_warnings',
  'contract_routing_snapshot',
  'assigned_by_user_id',
  'assigned_at',
  'removed_by_user_id',
  'removed_at',
  'published_revision',
  'last_published_correlation_id',
  'metadata',
] as const;

async function restoreShiftForUndo(
  base44: LooseRecord,
  user: LooseRecord,
  shift: LooseRecord,
  expectedRevision: number,
  previousShift: LooseRecord | null,
) {
  const previousPatch = previousShift ? pick(previousShift, SHIFT_UNDO_FIELDS) : { status: 'draft' };
  if (previousShift?.status === 'published') {
    previousPatch.published_revision = expectedRevision + 1;
  }
  return casUpdate(base44, 'PlanningShift', shift, expectedRevision, {
    ...previousPatch,
    last_modified_by_user_id: user.id || null,
    last_modified_at: nowIso(),
  });
}

function assignmentUndoPatch(previousAssignment: LooseRecord, currentRevision: number) {
  const patch = pick(previousAssignment, ASSIGNMENT_UNDO_FIELDS);
  if (previousAssignment.status === 'published') patch.published_revision = currentRevision + 1;
  return patch;
}

async function undoPlanning(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  const replay = await findReplay(base44, 'undo', context.idempotencyKey);
  if (replay) return replayResult(replay);

  const auditEventId = requireId(body, 'audit_event_id');
  const undoToken = requireId(body, 'undo_token');
  const sourceEvent = await requireRecord(base44, 'PlanningAuditEvent', auditEventId, 'Audit-event');
  if (sourceEvent.undoable !== true || !sourceEvent.undo_payload) {
    throw new ApiError(409, 'Deze planningactie kan niet ongedaan worden gemaakt');
  }
  if (!sourceEvent.undo_token || sourceEvent.undo_token !== undoToken) {
    throw new ApiError(409, 'Undo-token is ongeldig of verlopen');
  }
  const earlierUndo = await base44.asServiceRole.entities.PlanningAuditEvent.filter({
    undo_of_event_id: sourceEvent.id,
  }, '-occurred_at', 20);
  const completedUndo = earlierUndo.find((event: LooseRecord) => event.action === 'undo');
  if (completedUndo) {
    return {
      ok: true,
      idempotent: true,
      ...(completedUndo.after_state || {}),
      audit_event_id: completedUndo.id,
      undoable: false,
      undo_token: null,
    };
  }

  const undoPayload = sourceEvent.undo_payload as LooseRecord;
  const undoAction = compact(undoPayload.action);
  if (!['unassign', 'restore_assignment', 'assign', 'move'].includes(undoAction)) {
    throw new ApiError(409, 'Undo-payload bevat geen toegestane herstelactie');
  }
  const shiftId = compact(undoPayload.shift_id || sourceEvent.shift_id);
  if (!shiftId) throw new ApiError(409, 'Undo-payload mist shift_id');
  const expectedShiftRevision = positiveInteger(body.expected_shift_revision, 'expected_shift_revision');
  const shift = await requireRecord(base44, 'PlanningShift', shiftId, 'Dienst');
  const previousShift = undoPayload.previous_shift && typeof undoPayload.previous_shift === 'object'
    ? undoPayload.previous_shift
    : null;
  const beforeState: LooseRecord = { shift };
  let updatedShift: LooseRecord;
  let result: LooseRecord;

  if (undoAction === 'unassign') {
    const assignmentId = compact(undoPayload.assignment_id || sourceEvent.assignment_id);
    if (!assignmentId) throw new ApiError(409, 'Undo-payload mist assignment_id');
    const assignment = await requireRecord(base44, 'PlanningAssignment', assignmentId, 'Toewijzing');
    if (assignment.shift_id !== shift.id) throw new ApiError(409, 'Undo-toewijzing hoort niet bij de dienst');
    beforeState.assignment = assignment;
    updatedShift = await restoreShiftForUndo(
      base44,
      user,
      shift,
      expectedShiftRevision,
      previousShift,
    );
    const previousAssignment = undoPayload.previous_assignment && typeof undoPayload.previous_assignment === 'object'
      ? undoPayload.previous_assignment
      : null;
    const assignmentPatch = previousAssignment
      ? assignmentUndoPatch(previousAssignment, revisionOf(assignment))
      : {
          status: 'removed',
          removed_by_user_id: user.id || null,
          removed_at: nowIso(),
        };
    const updatedAssignment = await casUpdate(
      base44,
      'PlanningAssignment',
      assignment,
      revisionOf(assignment),
      assignmentPatch,
    );
    result = { shift: updatedShift, assignment: updatedAssignment };
  } else if (undoAction === 'restore_assignment' || undoAction === 'assign') {
    const assignmentId = compact(undoPayload.assignment_id || sourceEvent.assignment_id);
    const previousAssignment = undoPayload.previous_assignment;
    if (!assignmentId || !previousAssignment || typeof previousAssignment !== 'object') {
      throw new ApiError(409, 'Undo-payload mist de vorige toewijzingsstaat');
    }
    const assignment = await requireRecord(base44, 'PlanningAssignment', assignmentId, 'Toewijzing');
    if (assignment.shift_id !== shift.id) throw new ApiError(409, 'Undo-toewijzing hoort niet bij de dienst');
    beforeState.assignment = assignment;
    updatedShift = await restoreShiftForUndo(
      base44,
      user,
      shift,
      expectedShiftRevision,
      previousShift,
    );
    const updatedAssignment = await casUpdate(
      base44,
      'PlanningAssignment',
      assignment,
      revisionOf(assignment),
      assignmentUndoPatch(previousAssignment, revisionOf(assignment)),
    );
    result = { shift: updatedShift, assignment: updatedAssignment };
  } else {
    const previousAssignments = normalizeArray<LooseRecord>(undoPayload.previous_assignments)
      .filter(item => item?.id && item.status !== 'removed');
    const currentAssignments = await base44.asServiceRole.entities.PlanningAssignment.filter({ shift_id: shift.id });
    beforeState.assignments = currentAssignments;
    updatedShift = await restoreShiftForUndo(
      base44,
      user,
      shift,
      expectedShiftRevision,
      previousShift,
    );
    const currentById = new Map<string, LooseRecord>(
      currentAssignments.map((item: LooseRecord) => [String(item.id), item]),
    );
    const restoredAssignments: LooseRecord[] = [];
    for (const previousAssignment of previousAssignments) {
      const current = currentById.get(String(previousAssignment.id));
      if (!current) throw new ApiError(409, `Toewijzing ${previousAssignment.id} ontbreekt voor move-undo`);
      restoredAssignments.push(await casUpdate(
        base44,
        'PlanningAssignment',
        current,
        revisionOf(current),
        assignmentUndoPatch(previousAssignment, revisionOf(current)),
      ));
    }
    result = { shift: updatedShift, assignments: restoredAssignments };
  }

  const audit = await appendAudit(base44, user, {
    action: 'undo',
    resource_type: sourceEvent.resource_type || 'PlanningShift',
    resource_id: sourceEvent.resource_id || shift.id,
    shift_id: shift.id,
    assignment_id: sourceEvent.assignment_id || null,
    before_state: beforeState,
    after_state: result,
    correlation_id: context.correlationId,
    idempotency_key: context.idempotencyKey,
    undoable: false,
    undo_of_event_id: sourceEvent.id,
    metadata: {
      source_action: sourceEvent.action,
      source_correlation_id: sourceEvent.correlation_id || null,
    },
  });
  return {
    ok: true,
    ...result,
    audit_event_id: audit.id,
    undoable: false,
    undo_token: null,
    undo_of_event_id: sourceEvent.id,
  };
}

async function copyShift(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  const replay = await findReplay(base44, 'copy', context.idempotencyKey);
  if (replay) return replayResult(replay);

  const sourceShiftId = requireId(body, 'shift_id');
  const expectedShiftRevision = positiveInteger(body.expected_shift_revision, 'expected_shift_revision');
  const source = await requireRecord(base44, 'PlanningShift', sourceShiftId, 'Brondienst');
  if (revisionOf(source) !== expectedShiftRevision) {
    throw new ApiError(409, 'Planning is intussen gewijzigd', {
      entity: 'PlanningShift',
      id: source.id,
      expected_revision: expectedShiftRevision,
      current_revision: revisionOf(source),
    });
  }
  if (source.status === 'cancelled') throw new ApiError(409, 'Een geannuleerde dienst kan niet worden gekopieerd');

  const sourceKey = `copy:${source.id}:${context.idempotencyKey || context.correlationId}`;
  const existing = await base44.asServiceRole.entities.PlanningShift.filter({ source_key: sourceKey });
  if (existing[0]) {
    return { ok: true, idempotent: true, shift: existing[0], assignments: [], undoable: false };
  }
  const serviceDate = body.service_date ? asDate(body.service_date, 'service_date') : source.service_date;
  const endDate = Object.prototype.hasOwnProperty.call(body, 'end_date')
    ? optionalDate(body.end_date, 'end_date')
    : source.end_date || null;
  const startTime = body.start_time ? asTime(body.start_time, 'start_time') : source.start_time;
  const endTime = body.end_time ? asTime(body.end_time, 'end_time') : source.end_time;
  const shift = await base44.asServiceRole.entities.PlanningShift.create({
    ...pick(source, SHIFT_COPY_FIELDS),
    source_key: sourceKey,
    source_type: 'copy',
    source_id: source.id,
    source_shift_id: source.id,
    source_route_execution_id: null,
    service_date: serviceDate,
    end_date: endDate,
    start_time: startTime,
    end_time: endTime,
    status: 'draft',
    revision: 1,
    published_revision: 0,
    last_published_correlation_id: null,
    last_modified_by_user_id: user.id || null,
    last_modified_at: nowIso(),
    metadata: {
      copied_from_shift_id: source.id,
      copy_correlation_id: context.correlationId,
    },
  });
  const result = { shift, assignments: [] };
  const audit = await appendAudit(base44, user, {
    action: 'copy',
    resource_type: 'PlanningShift',
    resource_id: shift.id,
    shift_id: shift.id,
    before_state: { source_shift: source },
    after_state: result,
    correlation_id: context.correlationId,
    idempotency_key: context.idempotencyKey,
    undoable: false,
  });
  return { ok: true, ...result, audit_event_id: audit.id, undoable: false, undo_token: null };
}

function shiftMatchesPublicationScope(shift: LooseRecord, body: LooseRecord, shiftIds: Set<string>) {
  if (shift.status === 'cancelled') return false;
  if (shiftIds.size && !shiftIds.has(String(shift.id))) return false;
  if (body.company_id && shift.company_id !== body.company_id) return false;
  if (body.customer_id && shift.customer_id !== body.customer_id) return false;
  if (body.object_id && shift.object_id !== body.object_id) return false;
  if (body.route_id && shift.route_id !== body.route_id) return false;
  if (body.period_start && shift.service_date < body.period_start) return false;
  if (body.period_end && shift.service_date > body.period_end) return false;
  return true;
}

function publicationShiftSnapshot(shift: LooseRecord) {
  return {
    id: shift.id,
    source_key: shift.source_key,
    source_type: shift.source_type,
    source_id: shift.source_id || null,
    company_id: shift.company_id || null,
    customer_id: shift.customer_id || null,
    customer_ids: shift.customer_ids || [],
    object_id: shift.object_id || null,
    object_ids: shift.object_ids || [],
    route_id: shift.route_id || null,
    task_id: shift.task_id || null,
    customer_name: shift.customer_name_snapshot || null,
    object_name: shift.object_name_snapshot || null,
    route_name: shift.route_name_snapshot || null,
    service_name: shift.service_name_snapshot,
    service_date: shift.service_date,
    end_date: shift.end_date || null,
    start_time: shift.start_time,
    end_time: shift.end_time,
    timezone: shift.timezone || 'Europe/Amsterdam',
    required_count: shift.required_count,
    company_cao_context: {
      cao_key: shift.cao_key || null,
      service_function_type: shift.service_function_type || null,
      required_cao_function_group: shift.required_cao_function_group || null,
      required_cao_function_level: shift.required_cao_function_level || null,
      required_security_role_status: shift.required_security_role_status || null,
      required_qualification_types: shift.required_qualification_types || [],
      required_qualification_groups: shift.required_qualification_groups || [],
    },
    status: shift.status,
    revision: revisionOf(shift),
    published_revision: Number(shift.published_revision || 0),
  };
}

function publicationAssignmentSnapshot(assignment: LooseRecord) {
  return {
    id: assignment.id,
    shift_id: assignment.shift_id,
    slot_index: assignment.slot_index,
    personnel_id: assignment.personnel_id,
    personnel_name: assignment.personnel_name_snapshot,
    personnel_contract_id: assignment.personnel_contract_id || null,
    warning_codes: assignment.warning_codes || [],
    warning_snapshot: assignment.warning_snapshot || [],
    has_critical_warnings: assignment.has_critical_warnings === true,
    status: assignment.status,
    revision: revisionOf(assignment),
    published_revision: Number(assignment.published_revision || 0),
  };
}

async function publishPlanning(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  if (context.idempotencyKey) {
    const existingPublication = await base44.asServiceRole.entities.PlanningPublication
      .filter({ idempotency_key: context.idempotencyKey }, '-published_at', 2);
    if (existingPublication[0]) {
      return {
        ok: true,
        idempotent: true,
        publication: existingPublication[0],
        undoable: false,
        undo_token: null,
      };
    }
  }
  const replay = await findReplay(base44, 'publish', context.idempotencyKey);
  if (replay) return replayResult(replay);

  const reason = compact(body.publication_reason || body.reason);
  if (!reason) throw new ApiError(400, 'publication_reason is verplicht');
  const requestedShiftIds = new Set(uniqueStrings(body.shift_ids));
  if (!requestedShiftIds.size) {
    asDate(body.period_start, 'period_start');
    asDate(body.period_end, 'period_end');
  }
  const allShifts = await base44.asServiceRole.entities.PlanningShift.list();
  const shifts = allShifts.filter((shift: LooseRecord) =>
    shiftMatchesPublicationScope(shift, body, requestedShiftIds)
  );
  if (!shifts.length) throw new ApiError(404, 'Geen publiceerbare diensten in deze scope');
  if (requestedShiftIds.size) {
    const found = new Set(shifts.map((item: LooseRecord) => String(item.id)));
    const missing = [...requestedShiftIds].filter(id => !found.has(id));
    if (missing.length) {
      throw new ApiError(409, 'Een of meer geselecteerde diensten bestaan niet of zijn geannuleerd', {
        missing_shift_ids: missing,
      });
    }
  }

  const expectedRevisions = body.expected_shift_revisions || {};
  if (body.expected_shift_revision != null && shifts.length !== 1) {
    throw new ApiError(400, 'expected_shift_revision kan alleen bij precies één dienst worden gebruikt');
  }
  for (const shift of shifts) {
    const expected = body.expected_shift_revision != null
      ? positiveInteger(body.expected_shift_revision, 'expected_shift_revision')
      : expectedRevisions[shift.id] != null
      ? positiveInteger(expectedRevisions[shift.id], `expected_shift_revisions.${shift.id}`)
      : revisionOf(shift);
    if (revisionOf(shift) !== expected) {
      throw new ApiError(409, 'Planning is intussen gewijzigd', {
        entity: 'PlanningShift',
        id: shift.id,
        expected_revision: expected,
        current_revision: revisionOf(shift),
      });
    }
  }

  const shiftIdSet = new Set(shifts.map((item: LooseRecord) => String(item.id)));
  const allAssignments = await base44.asServiceRole.entities.PlanningAssignment.list();
  const assignments = allAssignments.filter((assignment: LooseRecord) =>
    shiftIdSet.has(String(assignment.shift_id)) && assignment.status !== 'removed'
  );
  const criticalWarnings: LooseRecord[] = assignments.flatMap((assignment: LooseRecord) => {
    const items: LooseRecord[] = normalizeArray<LooseRecord>(assignment.warning_snapshot)
      .filter(item => item.severity === 'critical')
      .map(item => ({ assignment_id: assignment.id, shift_id: assignment.shift_id, ...item }));
    if (items.length === 0 && assignment.has_critical_warnings === true) {
      items.push({
        assignment_id: assignment.id,
        shift_id: assignment.shift_id,
        code: 'critical_warning_snapshot_missing',
        severity: 'critical',
        message: 'Toewijzing is als kritisch gemarkeerd, maar de waarschuwingsdetails ontbreken.',
        source: 'PlanningAssignment',
      });
    }
    return items;
  });
  const acknowledgementReason = compact(body.critical_warning_acknowledgement_reason);
  if (criticalWarnings.length > 0 && (
    body.acknowledge_critical_warnings !== true || !acknowledgementReason
  )) {
    throw new ApiError(409, 'Kritieke waarschuwingen vereisen expliciete bevestiging en een reden', {
      code: 'critical_warning_acknowledgement_required',
      critical_warning_count: criticalWarnings.length,
      critical_warnings: criticalWarnings,
    });
  }

  const publishedShifts: LooseRecord[] = [];
  for (const shift of shifts) {
    if (
      shift.status === 'published'
      && shift.last_published_correlation_id === context.correlationId
      && Number(shift.published_revision || 0) === revisionOf(shift)
    ) {
      publishedShifts.push(shift);
      continue;
    }
    const currentRevision = revisionOf(shift);
    publishedShifts.push(await casUpdate(base44, 'PlanningShift', shift, currentRevision, {
      status: 'published',
      published_revision: currentRevision + 1,
      last_published_correlation_id: context.correlationId,
      last_modified_by_user_id: user.id || null,
      last_modified_at: nowIso(),
    }));
  }

  const publishedAssignments: LooseRecord[] = [];
  for (const assignment of assignments) {
    if (
      assignment.status === 'published'
      && assignment.last_published_correlation_id === context.correlationId
      && Number(assignment.published_revision || 0) === revisionOf(assignment)
    ) {
      publishedAssignments.push(assignment);
      continue;
    }
    const currentRevision = revisionOf(assignment);
    publishedAssignments.push(await casUpdate(
      base44,
      'PlanningAssignment',
      assignment,
      currentRevision,
      {
        status: 'published',
        published_revision: currentRevision + 1,
        last_published_correlation_id: context.correlationId,
      },
    ));
  }

  const periodStart = body.period_start
    ? asDate(body.period_start, 'period_start')
    : publishedShifts.map(item => item.service_date).sort()[0];
  const periodEnd = body.period_end
    ? asDate(body.period_end, 'period_end')
    : publishedShifts.map(item => item.service_date).sort().at(-1);
  const scopeType = ['day', 'week', 'selection', 'range'].includes(body.scope_type)
    ? body.scope_type
    : requestedShiftIds.size
    ? 'selection'
    : 'range';
  const selectionHash = requestedShiftIds.size
    ? await sha256([...requestedShiftIds].sort().join(','))
    : null;
  const scopeKey = compact(body.scope_key) || (
    scopeType === 'selection'
      ? `selection:${selectionHash}`
      : [
          scopeType,
          body.company_id || '*',
          body.customer_id || '*',
          body.object_id || '*',
          periodStart,
          periodEnd,
        ].join(':')
  );
  const previous = await base44.asServiceRole.entities.PlanningPublication.filter(
    { scope_key: scopeKey },
    '-version',
  );
  const previousPublication = previous
    .sort((a: LooseRecord, b: LooseRecord) => Number(b.version || 0) - Number(a.version || 0))[0]
    || null;
  const warningCount = publishedAssignments.reduce(
    (sum, assignment) => sum + normalizeArray(assignment.warning_snapshot).length,
    0,
  );
  const snapshot = {
    schema_version: 1,
    scope: {
      scope_type: scopeType,
      scope_key: scopeKey,
      company_id: body.company_id || null,
      customer_id: body.customer_id || null,
      object_id: body.object_id || null,
      period_start: periodStart,
      period_end: periodEnd,
    },
    shifts: publishedShifts.map(publicationShiftSnapshot),
    assignments: publishedAssignments.map(publicationAssignmentSnapshot),
    warning_summary: {
      warning_count: warningCount,
      critical_warning_count: criticalWarnings.length,
      acknowledged_critical_warning_codes: [...new Set(criticalWarnings.map((item: LooseRecord) => item.code))],
      critical_warning_acknowledgement_reason: acknowledgementReason || null,
    },
  };
  const checksum = await sha256(stableStringify({
    snapshot,
    reason,
    correlation_id: context.correlationId,
  }));
  const publication = await base44.asServiceRole.entities.PlanningPublication.create({
    scope_type: scopeType,
    scope_key: scopeKey,
    company_id: body.company_id || null,
    customer_id: body.customer_id || null,
    object_id: body.object_id || null,
    period_start: periodStart,
    period_end: periodEnd,
    version: Number(previousPublication?.version || 0) + 1,
    supersedes_publication_id: previousPublication?.id || null,
    reason,
    critical_warning_acknowledgement_reason: acknowledgementReason || null,
    acknowledged_critical_warning_codes: [...new Set(criticalWarnings.map((item: LooseRecord) => item.code))],
    shift_count: publishedShifts.length,
    assignment_count: publishedAssignments.length,
    warning_count: warningCount,
    critical_warning_count: criticalWarnings.length,
    shift_ids: publishedShifts.map(item => item.id),
    assignment_ids: publishedAssignments.map(item => item.id),
    snapshot,
    checksum,
    published_by_user_id: user.id || null,
    published_by_name: actorName(user),
    published_by_email: compact(user.email) || null,
    published_at: nowIso(),
    correlation_id: context.correlationId,
    idempotency_key: context.idempotencyKey,
    metadata: {
      publication_source: body.publication_source || 'planning_ui',
    },
  });
  const result = { publication, shifts: publishedShifts, assignments: publishedAssignments };
  const audit = await appendAudit(base44, user, {
    action: 'publish',
    resource_type: 'PlanningPublication',
    resource_id: publication.id,
    publication_id: publication.id,
    before_state: {
      shift_revisions: shifts.map((item: LooseRecord) => ({
        id: item.id,
        revision: revisionOf(item),
        status: item.status,
      })),
      assignment_revisions: assignments.map((item: LooseRecord) => ({
        id: item.id,
        revision: revisionOf(item),
        status: item.status,
      })),
    },
    after_state: result,
    correlation_id: context.correlationId,
    idempotency_key: context.idempotencyKey,
    undoable: false,
  });
  return { ok: true, ...result, audit_event_id: audit.id, undoable: false, undo_token: null };
}

export {
  asDate,
  asTime,
  dedupeWarnings,
  intervalsOverlap,
  publicationAssignmentSnapshot,
  publicationShiftSnapshot,
  revisionOf,
  serviceContextFromShift,
  stableStringify,
};

Deno.serve(async (req) => {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  try {
    if (req.method !== 'POST') return json({ error: 'Alleen POST is toegestaan', request_id: requestId }, 405);
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    requireAdmin(user);
    const body = await req.json().catch(() => ({}));
    const action = compact(body.action);
    const context = mutationContext(body);

    if (action === 'bootstrap_range') return json(await bootstrapRange(base44, user, body, context));
    if (action === 'assign') return json(await assignPersonnel(base44, user, body, context));
    if (action === 'unassign') return json(await unassignPersonnel(base44, user, body, context));
    if (action === 'restore_assignment') return json(await restoreAssignment(base44, user, body, context));
    if (action === 'undo') return json(await undoPlanning(base44, user, body, context));
    if (action === 'move') return json(await moveShift(base44, user, body, context));
    if (action === 'copy') return json(await copyShift(base44, user, body, context), 201);
    if (action === 'publish') return json(await publishPlanning(base44, user, body, context), 201);
    return json({ error: 'Onbekende planningactie', request_id: requestId }, 400);
  } catch (error) {
    const status = Number((error as any)?.status || 500);
    console.error('[planningApi]', requestId, error);
    return json({
      error: status >= 500 ? 'Planningactie mislukt' : (error as Error)?.message || 'Planningactie mislukt',
      details: (error as any)?.details || undefined,
      request_id: requestId,
    }, status);
  }
});
