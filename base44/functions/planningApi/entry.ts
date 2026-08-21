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

function versionOf(record: LooseRecord) {
  const version = Number(record?.version);
  return Number.isInteger(version) && version > 0 ? version : 1;
}

function actorName(user: LooseRecord) {
  return compact(user.full_name || user.display_name || user.name) || null;
}

function mutationContext(body: LooseRecord) {
  const idempotencyKey = compact(body.idempotency_key) || null;
  const correlationId = compact(body.correlation_id || idempotencyKey) || crypto.randomUUID();
  return { idempotencyKey, correlationId };
}

function requireMutationIdempotency(
  context: ReturnType<typeof mutationContext>,
  action: string,
) {
  if (!context.idempotencyKey) {
    throw new ApiError(400, `idempotency_key is verplicht voor planningactie ${action}`);
  }
}

function mutationRequestPayload(body: LooseRecord) {
  const {
    action: _action,
    idempotency_key: _idempotencyKey,
    correlation_id: _correlationId,
    ...payload
  } = body || {};
  return payload;
}

async function mutationRequestHash(action: string, body: LooseRecord) {
  const payload = mutationRequestPayload(body);
  return sha256(stableStringify({ action, payload }));
}

function assertReplayFingerprint(
  event: LooseRecord,
  user: LooseRecord,
  requestHash: string,
  action: string,
) {
  if (
    event.actor_user_id !== (user.id || null)
    || event.metadata?.request_hash !== requestHash
  ) {
    throw new ApiError(409, `idempotency_key hoort bij een andere ${action}-opdracht`);
  }
}

function matchingPlanningMutationMarker(
  shift: LooseRecord,
  action: string,
  context: ReturnType<typeof mutationContext>,
  user: LooseRecord,
  requestHash: string,
) {
  const marker = shift?.metadata?.planning_mutation;
  if (!marker || marker.idempotency_key !== context.idempotencyKey) return null;
  if (
    marker.action !== action
    || marker.request_hash !== requestHash
    || marker.actor_user_id !== (user.id || null)
  ) {
    throw new ApiError(409, `idempotency_key hoort bij een andere ${action}-opdracht`);
  }
  return marker;
}

function planningMutationMetadata(
  shift: LooseRecord,
  action: string,
  context: ReturnType<typeof mutationContext>,
  user: LooseRecord,
  requestHash: string,
) {
  const existing = matchingPlanningMutationMarker(shift, action, context, user, requestHash);
  return {
    ...(shift.metadata || {}),
    planning_mutation: {
      ...(existing || {}),
      action,
      idempotency_key: context.idempotencyKey,
      correlation_id: context.correlationId,
      actor_user_id: user.id || null,
      request_hash: requestHash,
      phase: 'state_written_audit_pending',
      started_at: existing?.started_at || nowIso(),
      updated_at: nowIso(),
    },
  };
}

function matchingSingleTaskOccurrenceMutation(
  occurrence: LooseRecord,
  context: ReturnType<typeof mutationContext>,
  user: LooseRecord,
  requestHash: string,
) {
  const marker = occurrence?.metadata?.single_task_occurrence_mutation;
  if (!marker || marker.idempotency_key !== context.idempotencyKey) return null;
  if (
    marker.request_hash !== requestHash
    || marker.actor_user_id !== (user.id || null)
  ) {
    throw new ApiError(409, 'idempotency_key hoort bij een andere losse taakwijziging');
  }
  return marker;
}

async function assertNoPendingLegacySingleTaskMigration(
  base44: LooseRecord,
  scope: {
    seriesIds?: unknown;
    occurrenceIds?: unknown;
    serviceDate?: string | null;
    objectId?: string | null;
  },
) {
  const requestedSeriesIds = uniqueStrings(scope.seriesIds);
  const directSeries = (await Promise.all(
    requestedSeriesIds.map(id => getRecord(base44, 'ObjectTaskScheduleSeries', id)),
  )).filter(Boolean) as LooseRecord[];
  const sourceSeriesIds = uniqueStrings(directSeries
    .filter(item => isAlternativeObjectTaskSeries(item))
    .map(item => item.metadata?.source_series_id));
  const sourceSeries = (await Promise.all(
    sourceSeriesIds.map(id => getRecord(base44, 'ObjectTaskScheduleSeries', id)),
  )).filter(Boolean) as LooseRecord[];
  const scopedSeries = uniqueRecords([...directSeries, ...sourceSeries], item => String(item.id));
  const seriesIds = new Set(uniqueStrings([
    ...requestedSeriesIds,
    ...scopedSeries.map(item => item.id),
  ]));
  const occurrenceIds = new Set(uniqueStrings(scope.occurrenceIds));
  const objectId = scope.objectId || scopedSeries.find(item => item.object_id)?.object_id || null;
  const hasPendingSeriesJournal = scopedSeries.some(item => {
    const journal = item.metadata?.legacy_single_task_migration_journal;
    return journal && journal.phase !== 'completed';
  });
  const query = hasPendingSeriesJournal && objectId
    ? { object_id: objectId }
    : scope.serviceDate
    ? { service_date: scope.serviceDate }
    : objectId
    ? { object_id: objectId }
    : null;
  if (!query || (!seriesIds.size && !occurrenceIds.size)) return;
  const exceptions = await filterAllRecords(
    base44.asServiceRole.entities.ObjectTaskScheduleException,
    query,
    '-created_date',
  );
  const pendingJournalSeries = scopedSeries.find(item => {
    const journal = item.metadata?.legacy_single_task_migration_journal;
    return journal
      && journal.phase !== 'completed'
      && !exceptions.some((exception: LooseRecord) => (
        exception.status === 'active'
        && String(exception.source_series_id || '') === String(item.id)
        && exception.metadata?.legacy_single_task_migration?.phase === 'completed'
        && exception.metadata?.legacy_single_task_migration?.migration_key
          === journal.migration_key
      ));
  });
  if (pendingJournalSeries) {
    const journal = pendingJournalSeries.metadata?.legacy_single_task_migration_journal;
    throw new ApiError(409, 'De herstelmigratie van deze oude losse taak moet eerst worden afgerond', {
      code: 'LEGACY_SINGLE_TASK_MIGRATION_RECOVERY_PENDING',
      source_series_id: pendingJournalSeries.id,
      migration_key: journal?.migration_key || null,
    });
  }
  const pending = exceptions.find((item: LooseRecord) => {
    const migration = item.metadata?.legacy_single_task_migration;
    if (!migration || migration.phase === 'completed') return false;
    return (
      seriesIds.has(String(item.source_series_id || ''))
      || seriesIds.has(String(item.alternative_series_id || ''))
      || occurrenceIds.has(String(migration.source_occurrence_id || ''))
      || occurrenceIds.has(String(migration.alternative_occurrence_id || ''))
    );
  });
  if (!pending) return;
  throw new ApiError(409, 'De herstelmigratie van deze oude losse taak moet eerst worden afgerond', {
    code: 'LEGACY_SINGLE_TASK_MIGRATION_RECOVERY_PENDING',
    exception_id: pending.id,
    migration_key: pending.metadata?.legacy_single_task_migration?.migration_key || null,
  });
}

async function assertNoForeignPendingSingleTaskOccurrenceMutation(
  base44: LooseRecord,
  occurrence: LooseRecord,
  context: ReturnType<typeof mutationContext>,
  user: LooseRecord,
  requestHash: string,
) {
  await assertNoPendingLegacySingleTaskMigration(base44, {
    seriesIds: [occurrence.object_task_schedule_series_id],
    occurrenceIds: [occurrence.id],
    serviceDate: occurrence.service_date || null,
  });
  const marker = occurrence?.metadata?.single_task_occurrence_mutation;
  if (!marker || marker.phase !== 'state_written_audit_pending') return;
  const ownedByThisExactMutation = (
    marker.idempotency_key === context.idempotencyKey
    && marker.actor_user_id === (user.id || null)
    && marker.request_hash === requestHash
  );
  if (ownedByThisExactMutation) return;
  const audits = await base44.asServiceRole.entities.PlanningAuditEvent.filter(
    { idempotency_key: marker.idempotency_key },
    '-occurred_at',
    20,
  );
  const completed = audits.some((event: LooseRecord) => (
    event.action === 'change_single_task_occurrence'
    && event.actor_user_id === marker.actor_user_id
    && event.metadata?.request_hash === marker.request_hash
  ));
  if (!completed) {
    throw new ApiError(409, 'Een eerdere wijziging van deze taak moet eerst worden hersteld', {
      code: 'TASK_OCCURRENCE_RECOVERY_PENDING',
      task_occurrence_id: occurrence.id,
      pending_idempotency_key: marker.idempotency_key,
    });
  }
}

async function assertNoForeignPendingMutation(
  base44: LooseRecord,
  shift: LooseRecord,
  context: ReturnType<typeof mutationContext>,
  expectedAction: string,
  user: LooseRecord,
  requestHash: string,
) {
  for (const occurrenceId of uniqueStrings(shift?.task_occurrence_ids)) {
    const occurrence = await getRecord(base44, 'PlanningTaskOccurrence', occurrenceId);
    if (occurrence) {
      await assertNoForeignPendingSingleTaskOccurrenceMutation(
        base44,
        occurrence,
        context,
        user,
        requestHash,
      );
    }
  }
  const marker = shift?.metadata?.planning_mutation;
  if (!marker || marker.phase !== 'state_written_audit_pending') return;
  const ownedByThisExactMutation = (
    marker.idempotency_key === context.idempotencyKey
    && marker.action === expectedAction
    && marker.actor_user_id === (user.id || null)
    && marker.request_hash === requestHash
  );
  if (ownedByThisExactMutation) return;
  const audits = await base44.asServiceRole.entities.PlanningAuditEvent.filter(
    { idempotency_key: marker.idempotency_key },
    '-occurred_at',
    20,
  );
  const completed = audits.some((event: LooseRecord) => (
    event.action === marker.action
    && event.actor_user_id === marker.actor_user_id
    && event.metadata?.request_hash === marker.request_hash
  ));
  if (!completed) {
    throw new ApiError(409, 'Een eerdere planningactie op deze dienst moet eerst worden hersteld', {
      shift_id: shift.id,
      pending_action: marker.action,
      pending_idempotency_key: marker.idempotency_key,
    });
  }
}

function unresolvedSharedBoundaryMutation(record: LooseRecord | null | undefined) {
  const state = record?.metadata?.shared_boundary_mutation;
  return state && state.phase !== 'completed' ? state : null;
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

async function listAllRecords(entity: LooseRecord, sort?: string) {
  const records = new Map<string, LooseRecord>();
  const pageSize = 5000;
  const stableSort = sort || 'created_date';
  for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
    const page = await entity.list(stableSort, pageSize, pageIndex * pageSize);
    page.forEach((record: LooseRecord) => records.set(String(record.id), record));
    if (page.length < pageSize) return [...records.values()];
  }
  throw new ApiError(503, 'De dataset is te groot om veilig in één planningactie te verwerken');
}

async function filterAllRecords(entity: LooseRecord, query: LooseRecord, sort?: string) {
  const records = new Map<string, LooseRecord>();
  const pageSize = 5000;
  const stableSort = sort || 'created_date';
  for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
    const page = await entity.filter(query, stableSort, pageSize, pageIndex * pageSize);
    page.forEach((record: LooseRecord) => records.set(String(record.id), record));
    if (page.length < pageSize) return [...records.values()];
  }
  throw new ApiError(503, 'De dataset is te groot om veilig in één planningactie te verwerken');
}

async function filterRecordsByValues(
  entity: LooseRecord,
  field: string,
  values: unknown,
  sort?: string,
) {
  const ids = uniqueStrings(values);
  if (!ids.length) return [];
  const records: LooseRecord[] = [];
  const chunkSize = 200;
  for (let index = 0; index < ids.length; index += chunkSize) {
    records.push(...await filterAllRecords(
      entity,
      { [field]: { $in: ids.slice(index, index + chunkSize) } },
      sort,
    ));
  }
  return uniqueRecords(records, item => String(item.id));
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

async function casVersionUpdate(
  base44: LooseRecord,
  entityName: string,
  record: LooseRecord,
  expectedVersion: number,
  patch: LooseRecord,
) {
  const actualVersion = versionOf(record);
  if (expectedVersion !== actualVersion) {
    throw new ApiError(409, 'De taak is intussen gewijzigd', {
      entity: entityName,
      id: record.id,
      expected_version: expectedVersion,
      current_version: actualVersion,
    });
  }
  const result = await base44.asServiceRole.entities[entityName].updateMany(
    { id: record.id, version: expectedVersion },
    { $set: patch, $inc: { version: 1 } },
  );
  if (!result?.success || result.updated !== 1) {
    const current = await getRecord(base44, entityName, record.id);
    throw new ApiError(409, 'De taak is intussen gewijzigd', {
      entity: entityName,
      id: record.id,
      expected_version: expectedVersion,
      current_version: current ? versionOf(current) : null,
    });
  }
  return requireRecord(base44, entityName, record.id, entityName);
}

const PLANNING_RESOURCE_LEASE_MS = 2 * 60 * 1000;
const PLANNING_LEASE_RENEWAL_CONCURRENCY = 8;
const PLANNING_LEASE_RELEASE_CONCURRENCY = 8;
// Skip only writes on a virtually fresh lease. Longer helpers can safely use
// the remaining 105 seconds; after 15 seconds every fence check renews to 120.
const PLANNING_RESOURCE_LEASE_RENEW_WINDOW_MS = PLANNING_RESOURCE_LEASE_MS - 15 * 1000;
const PLANNING_IDEMPOTENCY_CLAIM_MS = 2 * 60 * 1000;
const IDEMPOTENCY_REGISTRY_KEY = 'idempotency_registry:v2';
const MAX_COMPOSED_SHIFT_MINUTES = 24 * 60;
const MAX_COMPOSE_AND_ASSIGN_SHIFT_MINUTES = 12 * 60;

function coordinatorOrder(left: LooseRecord, right: LooseRecord) {
  const createdOrder = String(left.created_date || '').localeCompare(String(right.created_date || ''));
  return createdOrder || String(left.id).localeCompare(String(right.id));
}

async function planningCoordinatorRecords(base44: LooseRecord, coordinatorKey: string) {
  return filterAllRecords(
    base44.asServiceRole.entities.PlanningMutationCoordinator,
    { coordinator_key: coordinatorKey },
    'created_date',
  );
}

async function ensurePlanningCoordinator(
  base44: LooseRecord,
  user: LooseRecord,
  coordinatorKey: string,
  resourceType: string,
  resourceId: string,
) {
  let coordinators = await planningCoordinatorRecords(base44, coordinatorKey);
  if (!coordinators.length) {
    await base44.asServiceRole.entities.PlanningMutationCoordinator.create({
      coordinator_key: coordinatorKey,
      resource_type: resourceType,
      resource_id: resourceId,
      lease: null,
      revision: 1,
      last_modified_by_user_id: user.id || null,
      last_modified_at: nowIso(),
      metadata: { initialized_at: nowIso() },
    });
    // Base44 entities have no schema-level unique index. A deterministic
    // canonical reread makes concurrent lazy creation converge without
    // mutating a business/occurrence record.
    coordinators = await planningCoordinatorRecords(base44, coordinatorKey);
  }
  const coordinator = [...coordinators].sort(coordinatorOrder)[0];
  if (!coordinator) throw new ApiError(503, 'Planningcoordinator kon niet worden geïnitialiseerd');
  return coordinator;
}

async function resourceCoordinatorDescriptor(type: string, identity: string) {
  const normalizedIdentity = compact(identity);
  return {
    coordinatorKey: `${type}:${await sha256(normalizedIdentity)}`,
    resourceType: type,
    resourceId: normalizedIdentity,
  };
}

function leaseIsActive(lease: LooseRecord | null | undefined) {
  return lease?.status === 'pending' && Date.parse(lease.expires_at || '') > Date.now();
}

async function releasePlanningResourceLeases(
  base44: LooseRecord,
  user: LooseRecord,
  leases: LooseRecord[],
) {
  const orderedLeases = [...leases].reverse();
  const releaseErrors: Array<LooseRecord | null> = new Array(orderedLeases.length).fill(null);
  let nextLeaseIndex = 0;
  const releaseNextLease = async () => {
    while (nextLeaseIndex < orderedLeases.length) {
      const leaseIndex = nextLeaseIndex;
      nextLeaseIndex += 1;
      const lease = orderedLeases[leaseIndex];
      let released = false;
      for (let attempt = 0; attempt < 5 && !released; attempt += 1) {
        try {
          const coordinator = await requireRecord(
            base44,
            'PlanningMutationCoordinator',
            lease.coordinatorId,
            'Planningcoordinator',
          );
          if (!coordinator.lease || coordinator.lease.token !== lease.token) {
            released = true;
            continue;
          }
          await casUpdate(base44, 'PlanningMutationCoordinator', coordinator, revisionOf(coordinator), {
            lease: null,
            last_modified_by_user_id: user.id || null,
            last_modified_at: nowIso(),
            metadata: {
              ...(coordinator.metadata || {}),
              last_released_at: nowIso(),
              last_released_idempotency_key: lease.idempotencyKey || null,
            },
          });
          released = true;
        } catch (error) {
          if (attempt === 4) releaseErrors[leaseIndex] = {
            entity: 'PlanningMutationCoordinator',
            id: lease.coordinatorId,
            message: (error as Error)?.message || String(error),
          };
        }
      }
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(PLANNING_LEASE_RELEASE_CONCURRENCY, orderedLeases.length) },
    releaseNextLease,
  ));
  return releaseErrors.filter((error): error is LooseRecord => Boolean(error));
}

async function acquirePlanningResourceLeases(
  base44: LooseRecord,
  user: LooseRecord,
  context: ReturnType<typeof mutationContext>,
  requestHash: string,
  descriptors: LooseRecord[],
) {
  const uniqueDescriptors = [...new Map(
    descriptors.map(item => [item.coordinatorKey, item]),
  ).values()].sort((left, right) => left.coordinatorKey.localeCompare(right.coordinatorKey));
  const token = crypto.randomUUID();
  const acquired: LooseRecord[] = [];
  try {
    for (const descriptor of uniqueDescriptors) {
      const ensured = await ensurePlanningCoordinator(
        base44,
        user,
        descriptor.coordinatorKey,
        descriptor.resourceType,
        descriptor.resourceId,
      );
      let locked: LooseRecord | null = null;
      for (let attempt = 0; attempt < 5 && !locked; attempt += 1) {
        const coordinator = await requireRecord(base44, 'PlanningMutationCoordinator', ensured.id, 'Planningcoordinator');
        const pendingPublicationIntent = coordinator.metadata?.pending_publication_intent;
        if (pendingPublicationIntent && (
          pendingPublicationIntent.idempotency_key !== context.idempotencyKey
          || pendingPublicationIntent.actor_user_id !== (user.id || null)
          || pendingPublicationIntent.request_hash !== requestHash
        )) {
          throw new ApiError(409, 'Deze planningresource wacht op afronding van een publicatie', {
            resource_type: descriptor.resourceType,
            resource_id: descriptor.resourceId,
            publication_id: pendingPublicationIntent.publication_id || null,
            pending_idempotency_key: pendingPublicationIntent.idempotency_key || null,
          });
        }
        if (leaseIsActive(coordinator.lease)) {
          throw new ApiError(409, 'Deze planningresource wordt momenteel door een andere planningactie gewijzigd', {
            resource_type: descriptor.resourceType,
            resource_id: descriptor.resourceId,
            reservation_expires_at: coordinator.lease.expires_at,
          });
        }
        try {
          locked = await casUpdate(base44, 'PlanningMutationCoordinator', coordinator, revisionOf(coordinator), {
            lease: {
              token,
              status: 'pending',
              action: 'planning_assignment_mutation',
              idempotency_key: context.idempotencyKey,
              correlation_id: context.correlationId,
              request_hash: requestHash,
              actor_user_id: user.id || null,
              acquired_at: nowIso(),
              expires_at: new Date(Date.now() + PLANNING_RESOURCE_LEASE_MS).toISOString(),
            },
            last_modified_by_user_id: user.id || null,
            last_modified_at: nowIso(),
          });
        } catch (error) {
          if (Number((error as any)?.status) !== 409 || attempt === 4) throw error;
        }
      }
      if (!locked) throw new ApiError(409, 'Planningresource kon niet worden gereserveerd');
      acquired.push({
        coordinatorId: locked.id,
        coordinatorKey: descriptor.coordinatorKey,
        resourceType: descriptor.resourceType,
        resourceId: descriptor.resourceId,
        token,
        idempotencyKey: context.idempotencyKey,
        requestHash,
      });
    }
    return acquired;
  } catch (error) {
    await releasePlanningResourceLeases(base44, user, acquired);
    throw error;
  }
}

async function setPlanningPublicationIntent(
  base44: LooseRecord,
  user: LooseRecord,
  leases: LooseRecord[],
  intent: LooseRecord,
) {
  const orderedLeases = [
    ...leases.filter(item => item.resourceType === 'publication_scope'),
    ...leases.filter(item => item.resourceType !== 'publication_scope'),
  ];
  for (const lease of orderedLeases) {
    await renewPlanningResourceLeases(
      base44,
      user,
      planningPublicationLeasePair(leases, lease.resourceType, lease.resourceId),
    );
    const coordinator = await requireRecord(
      base44,
      'PlanningMutationCoordinator',
      lease.coordinatorId,
      'Planningcoordinator',
    );
    const existing = coordinator.metadata?.pending_publication_intent;
    if (existing && stableStringify(existing) !== stableStringify(intent)) {
      throw new ApiError(409, 'Planningresource hoort bij een andere pending publicatie', {
        resource_type: lease.resourceType,
        resource_id: lease.resourceId,
      });
    }
    if (existing) continue;
    await casUpdate(base44, 'PlanningMutationCoordinator', coordinator, revisionOf(coordinator), {
      metadata: {
        ...(coordinator.metadata || {}),
        pending_publication_intent: intent,
      },
      last_modified_by_user_id: user.id || null,
      last_modified_at: nowIso(),
    });
  }
}

async function clearPlanningPublicationIntent(
  base44: LooseRecord,
  user: LooseRecord,
  leases: LooseRecord[],
  intent: LooseRecord,
) {
  const orderedLeases = [
    ...leases.filter(item => item.resourceType !== 'publication_scope'),
    ...leases.filter(item => item.resourceType === 'publication_scope'),
  ];
  for (const lease of orderedLeases) {
    await renewPlanningResourceLeases(
      base44,
      user,
      planningPublicationLeasePair(leases, lease.resourceType, lease.resourceId),
    );
    const coordinator = await requireRecord(
      base44,
      'PlanningMutationCoordinator',
      lease.coordinatorId,
      'Planningcoordinator',
    );
    const existing = coordinator.metadata?.pending_publication_intent;
    if (!existing) continue;
    if (stableStringify(existing) !== stableStringify(intent)) {
      throw new ApiError(409, 'Een nieuwere publicatie-intentie blokkeert het vrijgeven van de planningresource', {
        resource_type: lease.resourceType,
        resource_id: lease.resourceId,
      });
    }
    const { pending_publication_intent: _pending, ...metadata } = coordinator.metadata || {};
    await casUpdate(base44, 'PlanningMutationCoordinator', coordinator, revisionOf(coordinator), {
      metadata: {
        ...metadata,
        last_completed_publication_intent_id: intent.intent_id,
        last_completed_publication_at: nowIso(),
      },
      last_modified_by_user_id: user.id || null,
      last_modified_at: nowIso(),
    });
  }
}

const planningPublicationLeaseIndexes = new WeakMap<LooseRecord[], {
  scopeLease: LooseRecord | undefined;
  byResource: Map<string, LooseRecord>;
}>();

function planningPublicationLeasePair(
  leases: LooseRecord[],
  resourceType: string,
  resourceId: string,
) {
  let index = planningPublicationLeaseIndexes.get(leases);
  if (!index) {
    index = {
      scopeLease: leases.find(item => item.resourceType === 'publication_scope'),
      byResource: new Map(leases.map(item => [
        `${item.resourceType}:${String(item.resourceId)}`,
        item,
      ])),
    };
    planningPublicationLeaseIndexes.set(leases, index);
  }
  const { scopeLease } = index;
  const resourceLease = index.byResource.get(`${resourceType}:${String(resourceId)}`);
  if (!scopeLease || !resourceLease) {
    throw new ApiError(409, 'Publicatiefence ontbreekt voor een target uit het immutable manifest', {
      resource_type: resourceType,
      resource_id: resourceId,
    });
  }
  return uniqueRecords([scopeLease, resourceLease], item => String(item.coordinatorId));
}

async function renewPlanningResourceLeases(
  base44: LooseRecord,
  user: LooseRecord,
  leases: LooseRecord[],
) {
  const renewLease = async (lease: LooseRecord) => {
    let renewed = false;
    for (let attempt = 0; attempt < 5 && !renewed; attempt += 1) {
      const coordinator = await requireRecord(base44, 'PlanningMutationCoordinator', lease.coordinatorId, 'Planningcoordinator');
      // An expired lease is fencing state, not a renewable ownership claim.
      // Rejecting it here prevents a delayed worker from reviving its lease
      // after a newer worker has legitimately taken over the resource.
      if (coordinator.lease?.token !== lease.token || !leaseIsActive(coordinator.lease)) {
        throw new ApiError(409, 'Planningreservering is verlopen; laad het rooster opnieuw', {
          resource_type: lease.resourceType,
          resource_id: lease.resourceId,
        });
      }
      const remainingLeaseMs = Date.parse(coordinator.lease.expires_at || '') - Date.now();
      if (remainingLeaseMs > PLANNING_RESOURCE_LEASE_RENEW_WINDOW_MS) {
        renewed = true;
        continue;
      }
      try {
        await casUpdate(base44, 'PlanningMutationCoordinator', coordinator, revisionOf(coordinator), {
          lease: {
            ...coordinator.lease,
            renewed_at: nowIso(),
            expires_at: new Date(Date.now() + PLANNING_RESOURCE_LEASE_MS).toISOString(),
          },
          last_modified_by_user_id: user.id || null,
          last_modified_at: nowIso(),
        });
        renewed = true;
      } catch (error) {
        if (Number((error as any)?.status) !== 409 || attempt === 4) throw error;
      }
    }
  };
  const renewalResults: PromiseSettledResult<void>[] = new Array(leases.length);
  let nextLeaseIndex = 0;
  const renewNextLease = async () => {
    while (nextLeaseIndex < leases.length) {
      const leaseIndex = nextLeaseIndex;
      nextLeaseIndex += 1;
      try {
        await renewLease(leases[leaseIndex]);
        renewalResults[leaseIndex] = { status: 'fulfilled', value: undefined };
      } catch (error) {
        renewalResults[leaseIndex] = { status: 'rejected', reason: error };
      }
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(PLANNING_LEASE_RENEWAL_CONCURRENCY, leases.length) },
    renewNextLease,
  ));
  const firstFailure = renewalResults.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (firstFailure) {
    throw firstFailure.reason;
  }
}

async function withPlanningResourceLeases<T>(
  base44: LooseRecord,
  user: LooseRecord,
  context: ReturnType<typeof mutationContext>,
  requestHash: string,
  descriptors: LooseRecord[],
  operation: (leases: LooseRecord[]) => Promise<T>,
) {
  const leases = await acquirePlanningResourceLeases(base44, user, context, requestHash, descriptors);
  let operationError: unknown = null;
  try {
    return await operation(leases);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    const releaseErrors = await releasePlanningResourceLeases(base44, user, leases);
    if (releaseErrors.length) {
      if (operationError && typeof operationError === 'object') {
        (operationError as any).details = {
          ...((operationError as any).details || {}),
          lease_release_errors: releaseErrors,
        };
      } else {
        throw new ApiError(503, 'Planningreservering kon niet worden vrijgegeven', {
          release_errors: releaseErrors,
        });
      }
    }
  }
}

async function mutateIdempotencyClaim(
  base44: LooseRecord,
  user: LooseRecord,
  context: ReturnType<typeof mutationContext>,
  requestHash: string,
  status: 'pending' | 'retryable' | 'completed',
) {
  const claimId = await sha256(`${user.id || 'anonymous'}:${context.idempotencyKey}`);
  const coordinator = await ensurePlanningCoordinator(
    base44,
    user,
    IDEMPOTENCY_REGISTRY_KEY,
    'idempotency_registry',
    'compose_and_assign',
  );
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await requireRecord(base44, 'PlanningMutationCoordinator', coordinator.id, 'Idempotencyregister');
    const claims = { ...(current.metadata?.claims || {}) };
    const claimMutationStartedAt = Date.now();
    for (const [storedClaimId, storedClaim] of Object.entries<LooseRecord>(claims)) {
      const expiresAt = Date.parse(storedClaim?.expires_at || '');
      if (!Number.isFinite(expiresAt) || expiresAt <= claimMutationStartedAt) delete claims[storedClaimId];
    }
    const existing = claims[claimId];
    if (existing?.request_hash && existing.request_hash !== requestHash) {
      throw new ApiError(409, 'idempotency_key hoort bij een andere compose_and_assign-opdracht');
    }
    if (
      status === 'pending'
      && existing?.status === 'pending'
      && Date.parse(existing.expires_at || '') > Date.now()
    ) {
      throw new ApiError(409, 'Deze compose_and_assign-opdracht wordt al verwerkt', {
        reservation_expires_at: existing.expires_at,
      });
    }
    if (status === 'completed') delete claims[claimId];
    else claims[claimId] = {
      idempotency_key: context.idempotencyKey,
      correlation_id: context.correlationId,
      actor_user_id: user.id || null,
      request_hash: requestHash,
      status,
      updated_at: nowIso(),
      expires_at: new Date(Date.now() + PLANNING_IDEMPOTENCY_CLAIM_MS).toISOString(),
    };
    try {
      await casUpdate(base44, 'PlanningMutationCoordinator', current, revisionOf(current), {
        metadata: { ...(current.metadata || {}), claims },
        last_modified_by_user_id: user.id || null,
        last_modified_at: nowIso(),
      });
      return { claimId, status };
    } catch (error) {
      if (Number((error as any)?.status) !== 409 || attempt === 7) throw error;
    }
  }
  throw new ApiError(409, 'Idempotencyclaim kon niet worden vastgelegd');
}

async function releaseComposeAndAssignOccurrenceReservations(
  base44: LooseRecord,
  user: LooseRecord,
  context: ReturnType<typeof mutationContext>,
  requestHash: string,
  occurrenceIds: string[],
  leases: LooseRecord[] = [],
) {
  const errors: LooseRecord[] = [];
  for (const occurrenceId of uniqueStrings(occurrenceIds)) {
    let released = false;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 8 && !released; attempt += 1) {
      try {
        const occurrence = await requireRecord(base44, 'PlanningTaskOccurrence', occurrenceId, 'Taakuitvoering');
        const reservation = occurrence.metadata?.planning_composition_reservation;
        const ownsReservation = reservation?.idempotency_key === context.idempotencyKey
          && reservation?.request_hash === requestHash
          && reservation?.actor_user_id === (user.id || null);
        const ownsCompletion = occurrence.metadata?.last_compose_and_assign_idempotency_key === context.idempotencyKey
          && occurrence.metadata?.last_compose_and_assign_request_hash === requestHash
          && occurrence.metadata?.last_compose_and_assign_actor_user_id === (user.id || null);
        if (!ownsReservation && !ownsCompletion) {
          released = true;
          continue;
        }
        const {
          planning_composition_reservation: _reservation,
          last_compose_and_assign_idempotency_key: _completedKey,
          last_compose_and_assign_correlation_id: _completedCorrelation,
          last_compose_and_assign_request_hash: _completedHash,
          last_compose_and_assign_actor_user_id: _completedActor,
          last_compose_and_assign_completed_at: _completedAt,
          ...metadata
        } = occurrence.metadata || {};
        await renewPlanningResourceLeases(base44, user, leases);
        await casUpdate(base44, 'PlanningTaskOccurrence', occurrence, revisionOf(occurrence), {
          metadata: {
            ...metadata,
            last_compose_and_assign_recovery_idempotency_key: context.idempotencyKey,
            last_compose_and_assign_recovery_request_hash: requestHash,
            last_compose_and_assign_recovery_actor_user_id: user.id || null,
            last_compose_and_assign_recovery_status: 'compensated',
            last_compose_and_assign_recovery_at: nowIso(),
          },
          last_modified_by_user_id: user.id || null,
          last_modified_at: nowIso(),
        });
        released = true;
      } catch (error) {
        lastError = error;
      }
    }
    if (!released) {
      errors.push({
        entity: 'PlanningTaskOccurrence',
        id: occurrenceId,
        message: (lastError as Error)?.message || String(lastError),
      });
    }
  }
  return errors;
}

async function releaseCompositionOccurrenceReservations(
  base44: LooseRecord,
  user: LooseRecord,
  context: ReturnType<typeof mutationContext>,
  requestHash: string,
  occurrenceIds: string[],
  leases: LooseRecord[] = [],
) {
  const errors: LooseRecord[] = [];
  for (const occurrenceId of uniqueStrings(occurrenceIds)) {
    const occurrenceLease = leases.find(item => (
      item.resourceType === 'task_occurrence'
      && String(item.resourceId) === String(occurrenceId)
    ));
    if (!occurrenceLease) continue;
    let released = false;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 8 && !released; attempt += 1) {
      try {
        const occurrence = await requireRecord(base44, 'PlanningTaskOccurrence', occurrenceId, 'Taakuitvoering');
        const reservation = occurrence.metadata?.planning_composition_reservation;
        const ownsReservation = reservation?.idempotency_key === context.idempotencyKey
          && reservation?.request_hash === requestHash
          && reservation?.actor_user_id === (user.id || null);
        if (!ownsReservation) {
          released = true;
          continue;
        }
        const { planning_composition_reservation: _reservation, ...metadata } = occurrence.metadata || {};
        await renewPlanningResourceLeases(base44, user, [occurrenceLease]);
        await casUpdate(base44, 'PlanningTaskOccurrence', occurrence, revisionOf(occurrence), {
          metadata: {
            ...metadata,
            last_composition_recovery_idempotency_key: context.idempotencyKey,
            last_composition_recovery_request_hash: requestHash,
            last_composition_recovery_actor_user_id: user.id || null,
            last_composition_recovery_status: 'reservation_released',
            last_composition_recovery_at: nowIso(),
            last_composition_recovery_revision: revisionOf(occurrence) + 1,
          },
          last_modified_by_user_id: user.id || null,
          last_modified_at: nowIso(),
        });
        released = true;
      } catch (error) {
        lastError = error;
      }
    }
    if (!released) {
      errors.push({
        entity: 'PlanningTaskOccurrence',
        id: occurrenceId,
        message: (lastError as Error)?.message || String(lastError),
      });
    }
  }
  return errors;
}

async function clearCompletedCompositionOccurrenceReservations(
  base44: LooseRecord,
  user: LooseRecord,
  context: ReturnType<typeof mutationContext>,
  requestHash: string,
  occurrenceIds: string[],
  leases: LooseRecord[] = [],
) {
  const errors: LooseRecord[] = [];
  for (const occurrenceId of uniqueStrings(occurrenceIds)) {
    const occurrenceLease = leases.find(item => (
      item.resourceType === 'task_occurrence'
      && String(item.resourceId) === String(occurrenceId)
    ));
    if (!occurrenceLease) {
      errors.push({
        entity: 'PlanningTaskOccurrence',
        id: occurrenceId,
        message: 'Taakuitvoering-fence ontbreekt tijdens afronding',
      });
      continue;
    }
    let cleared = false;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 8 && !cleared; attempt += 1) {
      try {
        const occurrence = await requireRecord(base44, 'PlanningTaskOccurrence', occurrenceId, 'Taakuitvoering');
        const reservation = occurrence.metadata?.planning_composition_reservation;
        if (!reservation) {
          cleared = true;
          continue;
        }
        const ownsReservation = reservation?.idempotency_key === context.idempotencyKey
          && reservation?.request_hash === requestHash
          && reservation?.actor_user_id === (user.id || null);
        const ownsCompletion = occurrence.metadata?.last_composition_idempotency_key === context.idempotencyKey
          && occurrence.metadata?.last_composition_request_hash === requestHash
          && occurrence.metadata?.last_composition_actor_user_id === (user.id || null);
        if (!ownsReservation || !ownsCompletion) {
          throw new ApiError(409, 'Taakuitvoering hoort bij een andere dienstsamenstelling', {
            task_occurrence_id: occurrenceId,
          });
        }
        const { planning_composition_reservation: _reservation, ...metadata } = occurrence.metadata || {};
        await renewPlanningResourceLeases(base44, user, [occurrenceLease]);
        await casUpdate(base44, 'PlanningTaskOccurrence', occurrence, revisionOf(occurrence), {
          metadata,
          last_modified_by_user_id: user.id || null,
          last_modified_at: nowIso(),
        });
        cleared = true;
      } catch (error) {
        lastError = error;
      }
    }
    if (!cleared) {
      errors.push({
        entity: 'PlanningTaskOccurrence',
        id: occurrenceId,
        message: (lastError as Error)?.message || String(lastError),
      });
    }
  }
  return errors;
}

async function compensateComposeAndAssign(
  base44: LooseRecord,
  user: LooseRecord,
  context: ReturnType<typeof mutationContext>,
  requestHash: string,
  state: LooseRecord,
  leases: LooseRecord[] = [],
) {
  const errors: LooseRecord[] = [];
  let shiftId = compact(state.shiftId);
  if (!shiftId) {
    try {
      const possibleShifts = await filterAllRecords(
        base44.asServiceRole.entities.PlanningShift,
        { source_key: `task-compose-and-assign:${context.idempotencyKey}` },
      );
      const matchingShifts = possibleShifts.filter((item: LooseRecord) => (
        item.metadata?.compose_and_assign?.request_hash === requestHash
        && item.metadata?.compose_and_assign?.actor_user_id === (user.id || null)
      ));
      if (matchingShifts.length > 1) {
        errors.push({
          entity: 'PlanningShift',
          message: 'Meerdere shifts gevonden tijdens compose_and_assign-compensatie',
          shift_ids: matchingShifts.map((item: LooseRecord) => item.id),
        });
      } else {
        shiftId = compact(matchingShifts[0]?.id);
      }
    } catch (error) {
      errors.push({ entity: 'PlanningShift', message: (error as Error)?.message || String(error) });
    }
  }
  if (shiftId) {
    let completedState = false;
    let shiftCancelled = false;
    let shiftError: unknown = null;
    for (let attempt = 0; attempt < 8 && !shiftCancelled && !completedState; attempt += 1) {
      try {
        const shift = await requireRecord(base44, 'PlanningShift', shiftId, 'Dienst');
        const recovery = shift.metadata?.compose_and_assign;
        if (
          recovery?.idempotency_key !== context.idempotencyKey
          || recovery?.request_hash !== requestHash
          || recovery?.actor_user_id !== (user.id || null)
        ) {
          throw new ApiError(409, 'Dienst hoort niet bij deze herstelopdracht', { shift_id: shiftId });
        }
        if (recovery.phase === 'completed') {
          completedState = true;
          continue;
        }
        if (shift.status === 'cancelled' && recovery.phase === 'compensated') {
          shiftCancelled = true;
          continue;
        }
        await renewPlanningResourceLeases(base44, user, leases);
        await casUpdate(base44, 'PlanningShift', shift, revisionOf(shift), {
          status: 'cancelled',
          last_modified_by_user_id: user.id || null,
          last_modified_at: nowIso(),
          metadata: {
            ...(shift.metadata || {}),
            compose_and_assign: {
              ...recovery,
              phase: 'compensated',
              compensated_at: nowIso(),
            },
          },
        });
        shiftCancelled = true;
      } catch (error) {
        shiftError = error;
      }
    }
    if (completedState) return errors;
    if (!shiftCancelled) errors.push({
      entity: 'PlanningShift',
      id: shiftId,
      message: (shiftError as Error)?.message || String(shiftError),
    });

    const segments = await filterAllRecords(
      base44.asServiceRole.entities.PlanningShiftTaskSegment,
      { shift_id: shiftId },
    ).catch((error: unknown) => {
      errors.push({ entity: 'PlanningShiftTaskSegment', message: (error as Error)?.message || String(error) });
      return [];
    });
    for (const segment of segments.filter((item: LooseRecord) => (
      item.status !== 'removed'
      && item.metadata?.composition_idempotency_key === context.idempotencyKey
      && item.metadata?.compose_and_assign_request_hash === requestHash
    ))) {
      let removed = false;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 8 && !removed; attempt += 1) {
        try {
          const current = await requireRecord(base44, 'PlanningShiftTaskSegment', segment.id, 'Taaksegment');
          if (current.status === 'removed') {
            removed = true;
            continue;
          }
          await renewPlanningResourceLeases(base44, user, leases);
          await casUpdate(base44, 'PlanningShiftTaskSegment', current, revisionOf(current), {
            status: 'removed',
            last_modified_by_user_id: user.id || null,
            last_modified_at: nowIso(),
            metadata: {
              ...(current.metadata || {}),
              compensated_by_compose_and_assign_key: context.idempotencyKey,
              compensated_at: nowIso(),
            },
          });
          removed = true;
        } catch (error) {
          lastError = error;
        }
      }
      if (!removed) {
        errors.push({
          entity: 'PlanningShiftTaskSegment',
          id: segment.id,
          message: (lastError as Error)?.message || String(lastError),
        });
      }
    }

    const assignments = await filterAllRecords(
      base44.asServiceRole.entities.PlanningAssignment,
      { shift_id: shiftId },
    ).catch((error: unknown) => {
      errors.push({ entity: 'PlanningAssignment', message: (error as Error)?.message || String(error) });
      return [];
    });
    for (const assignment of assignments.filter((item: LooseRecord) => (
      item.status !== 'removed'
      && item.metadata?.compose_and_assign_idempotency_key === context.idempotencyKey
      && item.metadata?.compose_and_assign_request_hash === requestHash
    ))) {
      let removed = false;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 8 && !removed; attempt += 1) {
        try {
          const current = await requireRecord(base44, 'PlanningAssignment', assignment.id, 'Toewijzing');
          if (current.status === 'removed') {
            removed = true;
            continue;
          }
          await renewPlanningResourceLeases(base44, user, leases);
          await casUpdate(base44, 'PlanningAssignment', current, revisionOf(current), {
            status: 'removed',
            removed_by_user_id: user.id || null,
            removed_at: nowIso(),
            metadata: {
              ...(current.metadata || {}),
              compensated_by_compose_and_assign_key: context.idempotencyKey,
              compensated_at: nowIso(),
            },
          });
          removed = true;
        } catch (error) {
          lastError = error;
        }
      }
      if (!removed) {
        errors.push({
          entity: 'PlanningAssignment',
          id: assignment.id,
          message: (lastError as Error)?.message || String(lastError),
        });
      }
    }
  }

  if (!errors.length) {
    errors.push(...await releaseComposeAndAssignOccurrenceReservations(
      base44,
      user,
      context,
      requestHash,
      normalizeArray<string>(state.requestedOccurrenceIds || state.reservedOccurrenceIds),
      leases,
    ));
  }
  return errors;
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
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes !== 0)) return null;
  return hours * 60 + minutes;
}

function dateOrdinal(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function dateFromOrdinal(value: number) {
  return new Date(value * 86400000).toISOString().slice(0, 10);
}

function addDateDays(value: string, days: number) {
  return dateFromOrdinal(dateOrdinal(value) + days);
}

function weekdayKey(value: string) {
  const day = new Date(`${value}T12:00:00.000Z`).getUTCDay();
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day];
}

function dateKeysBetween(start: string, end: string) {
  const first = dateOrdinal(start);
  const last = dateOrdinal(end);
  return Array.from({ length: last - first + 1 }, (_, index) => dateFromOrdinal(first + index));
}

function planningIntervalDates(shift: LooseRecord) {
  const startDate = asDate(shift.service_date, 'service_date');
  const startTime = asTime(shift.start_time, 'start_time');
  const endTime = asTime(shift.end_time, 'end_time');
  const endDate = shift.end_date
    ? asDate(shift.end_date, 'end_date')
    : parseClockMinutes(endTime)! <= parseClockMinutes(startTime)!
    ? addDateDays(startDate, 1)
    : startDate;
  return dateKeysBetween(startDate, endDate);
}

async function personnelDayDescriptors(personnelIds: string[], shifts: LooseRecord[]) {
  const descriptors: LooseRecord[] = [];
  for (const personnelId of uniqueStrings(personnelIds)) {
    for (const date of uniqueStrings(shifts.flatMap(planningIntervalDates))) {
      descriptors.push(await resourceCoordinatorDescriptor('personnel_day', `${personnelId}:${date}`));
    }
  }
  return descriptors;
}

function intervalFromParts(startDate: string, startTime: string, endDate: string, endTime: string) {
  const startMinutes = parseClockMinutes(startTime);
  const endMinutes = parseClockMinutes(endTime);
  if (startMinutes == null || endMinutes == null) return null;
  const start = dateOrdinal(startDate) * 1440 + startMinutes;
  const end = dateOrdinal(endDate) * 1440 + endMinutes;
  return end > start ? { start, end, duration: end - start } : null;
}

function normalizedPeriodInterval(serviceDate: string, startValue: unknown, endValue: unknown) {
  const rawStart = compact(startValue);
  const rawEnd = compact(endValue);
  const startMinutes = parseClockMinutes(rawStart);
  const endMinutes = parseClockMinutes(rawEnd);
  if (startMinutes == null || startMinutes >= 1440 || endMinutes == null) return null;
  const endDayOffset = endMinutes === 1440 || endMinutes <= startMinutes ? 1 : 0;
  const endDate = addDateDays(serviceDate, endDayOffset);
  const endTime = endMinutes === 1440 ? '00:00' : rawEnd;
  return {
    service_date: serviceDate,
    end_date: endDate,
    window_start_time: rawStart,
    window_end_time: endTime,
    interval: intervalFromParts(serviceDate, rawStart, endDate, endTime),
  };
}

function taskDefinitionPeriods(definition: LooseRecord) {
  const periods = normalizeArray<LooseRecord>(definition.schedule_periods)
    .filter(period => period?.start_time && period?.end_time && normalizeArray(period.days).length);
  if (periods.length) return periods;
  return uniqueStrings(definition.weekdays)
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value >= 1 && value <= 7)
    .map(value => ({
      days: [['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][value - 1]],
      start_time: definition.start_time,
      end_time: definition.end_time,
      period_key: null,
    }));
}

function taskDefinitionAppliesOnDate(definition: LooseRecord, serviceDate: string) {
  if (definition.status !== 'active') return false;
  if (definition.recurrence_type === 'one_time') return definition.specific_date === serviceDate;
  if (definition.recurrence_type === 'date_range') {
    return !!definition.valid_from
      && !!definition.valid_until
      && definition.valid_from <= serviceDate
      && serviceDate <= definition.valid_until;
  }
  if (definition.recurrence_type === 'weekly') {
    return (!definition.valid_from || definition.valid_from <= serviceDate)
      && (!definition.valid_until || serviceDate <= definition.valid_until);
  }
  return false;
}

function taskOccurrenceName(definition: LooseRecord) {
  const labels: Record<string, string> = {
    object_security: 'Objectbeveiliging',
    fire_closing_round: 'Brand- & sluitronde',
    external_closing_round: 'Externe sluitronde',
    external_control_round: 'Externe controleronde',
    opening_round: 'Openingsronde',
    mobile_control_round: 'Mobiele controleronde',
    reception: 'Receptiedienst',
    closing_assistance: 'Sluitbegeleiding',
    access_control: 'Toegangscontrole',
    fire_watch: 'Brandwacht',
    concierge: 'Portier / concierge',
    other: 'Andere taak',
  };
  return compact(definition.custom_task_type) || labels[definition.task_type] || 'Taak';
}

function occurrenceBlueprints(definition: LooseRecord, periodStart: string, periodEnd: string) {
  const results: LooseRecord[] = [];
  const periods = taskDefinitionPeriods(definition);
  for (const serviceDate of dateKeysBetween(periodStart, periodEnd)) {
    if (!taskDefinitionAppliesOnDate(definition, serviceDate)) continue;
    const dayKey = weekdayKey(serviceDate);
    periods.forEach((period, periodIndex) => {
      if (!normalizeArray(period.days).includes(dayKey)) return;
      const normalized = normalizedPeriodInterval(serviceDate, period.start_time, period.end_time);
      if (!normalized?.interval) return;
      const requiredMinutes = definition.execution_mode === 'continuous'
        ? normalized.interval.duration
        : Number(definition.duration_minutes || 0);
      if (!Number.isInteger(requiredMinutes) || requiredMinutes < 1 || requiredMinutes > normalized.interval.duration) return;
      const periodKey = compact(period.period_key)
        || `legacy:${dayKey}:${period.start_time}:${period.end_time}:${periodIndex}`;
      results.push({
        source_key: `object-task:${definition.id}:${periodKey}:${serviceDate}`,
        object_task_definition_id: definition.id,
        definition_version: positiveInteger(definition.version || 1, 'definition_version'),
        schedule_period_key: periodKey,
        task_type: definition.task_type,
        custom_task_type: compact(definition.custom_task_type) || null,
        execution_mode: definition.execution_mode,
        service_date: serviceDate,
        end_date: normalized.end_date,
        window_start_time: normalized.window_start_time,
        window_end_time: normalized.window_end_time,
        timezone: 'Europe/Amsterdam',
        required_minutes: requiredMinutes,
        task_name_snapshot: taskOccurrenceName(definition),
        instructions_snapshot: compact(definition.instructions) || null,
      });
    });
  }
  return results;
}

const OBJECT_TASK_TYPES = new Set([
  'object_security',
  'fire_closing_round',
  'external_closing_round',
  'external_control_round',
  'opening_round',
  'mobile_control_round',
  'reception',
  'closing_assistance',
  'access_control',
  'fire_watch',
  'concierge',
  'other',
]);

function amsterdamServerClock(reference = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(reference).filter(item => item.type !== 'literal').map(item => [item.type, item.value]));
  const time = `${parts.hour}:${parts.minute}`;
  return {
    timezone: 'Europe/Amsterdam',
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time,
    minute_of_day: parseClockMinutes(time) as number,
    iso: reference.toISOString(),
  };
}

function assertFutureSchedule(serviceDate: string, startTime: string, clock = amsterdamServerClock()) {
  if (serviceDate < clock.date || (
    serviceDate === clock.date && (parseClockMinutes(startTime) as number) <= clock.minute_of_day
  )) {
    throw new ApiError(409, 'Taken kunnen alleen na de huidige Amsterdamse datum en tijd worden ingepland', {
      code: 'TASK_SCHEDULE_IN_PAST',
      server_clock: clock,
      service_date: serviceDate,
      start_time: startTime,
    });
  }
}

function scheduleEndTime(value: unknown, field: string) {
  const text = compact(value);
  if (text === '24:00') return text;
  return asTime(value, field);
}

function isoWeekday(value: string) {
  const day = new Date(`${value}T12:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function recurrenceMatches(revision: LooseRecord, date: string) {
  const type = revision.recurrence_type || 'one_time';
  const interval = Math.max(1, Number(revision.recurrence_interval || revision.metadata?.recurrence_interval || 1));
  const effectiveFrom = revision.effective_from;
  const anchor = revision.recurrence_anchor_date || revision.metadata?.recurrence_anchor_date || effectiveFrom;
  if (!effectiveFrom || !anchor || date < effectiveFrom) return false;
  if (type === 'one_time') return date === effectiveFrom;
  if (type === 'weekly') return isoWeekday(date) === Number(revision.weekday)
    && (dateOrdinal(date) - dateOrdinal(anchor)) % (interval * 7) === 0;
  const [anchorYear, anchorMonth, anchorDay] = anchor.split('-').map(Number);
  const [year, month, day] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, type === 'yearly' ? anchorMonth : month, 0)).getUTCDate();
  if (type === 'monthly') return ((year * 12 + month) - (anchorYear * 12 + anchorMonth)) % interval === 0
    && day === Math.min(anchorDay, lastDay);
  return type === 'yearly' && (year - anchorYear) % interval === 0
    && month === anchorMonth && day === Math.min(anchorDay, lastDay);
}

function normalizedObjectTaskInput(body: LooseRecord) {
  const input = body.task || body.definition || body.task_definition || {};
  const taskType = compact(input.task_type || body.task_type);
  if (!OBJECT_TASK_TYPES.has(taskType)) throw new ApiError(400, 'task.task_type is ongeldig');
  const executionMode = compact(input.execution_mode || body.execution_mode);
  if (!['continuous', 'time_window'].includes(executionMode)) throw new ApiError(400, 'task.execution_mode moet continuous of time_window zijn');
  const customTaskType = compact(input.custom_task_type || body.custom_task_type) || null;
  if (taskType === 'other' && !customTaskType) throw new ApiError(400, 'task.custom_task_type is verplicht bij een andere taak');
  return {
    security_plan_id: compact(input.security_plan_id || body.security_plan_id) || null,
    security_plan_revision_id: compact(input.security_plan_revision_id || body.security_plan_revision_id) || null,
    task_type: taskType, custom_task_type: customTaskType, execution_mode: executionMode,
    duration_minutes: executionMode === 'time_window' ? positiveInteger(input.duration_minutes ?? body.duration_minutes, 'task.duration_minutes') : null,
    instructions: compact(input.instructions ?? body.instructions) || null,
  };
}

function suppliedScheduleBlocks(body: LooseRecord) {
  return normalizeArray<LooseRecord>(body.schedule_blocks ?? body.schedules ?? body.schedule ?? body.series)
    .filter(item => item && typeof item === 'object');
}

function normalizedScheduleBlock(input: LooseRecord, task: LooseRecord, fieldPrefix: string, clock = amsterdamServerClock()) {
  const serviceDate = asDate(input.service_date || input.effective_from || input.date, `${fieldPrefix}.service_date`);
  const startTime = asTime(input.start_time, `${fieldPrefix}.start_time`);
  const endTime = scheduleEndTime(input.end_time, `${fieldPrefix}.end_time`);
  const period = normalizedPeriodInterval(serviceDate, startTime, endTime);
  if (!period?.interval) throw new ApiError(400, `${fieldPrefix} heeft geen geldig tijdvenster`);
  assertFutureSchedule(serviceDate, startTime, clock);
  const suppliedType = compact(input.recurrence_type || input.repeat?.frequency || input.recurrence?.frequency);
  const recurrenceType = ['weekly', 'monthly', 'yearly'].includes(suppliedType) ? suppliedType : input.repeat_weekly === true ? 'weekly' : 'one_time';
  const recurrenceInterval = recurrenceType === 'one_time' ? 1 : positiveInteger(input.recurrence_interval || input.repeat?.interval || input.recurrence?.interval || input.metadata?.recurrence_interval || 1, `${fieldPrefix}.recurrence_interval`);
  if (recurrenceInterval > 52) throw new ApiError(400, `${fieldPrefix}.recurrence_interval is te groot`);
  const recurrenceEndDate = optionalDate(input.recurrence_end_date ?? input.end_date_recurrence ?? input.repeat?.end_date ?? input.recurrence?.end_date, `${fieldPrefix}.recurrence_end_date`);
  if (recurrenceEndDate && recurrenceEndDate < serviceDate) throw new ApiError(400, `${fieldPrefix}.recurrence_end_date ligt voor de eerste taak`);
  const requiredMinutes = task.execution_mode === 'continuous' ? period.interval.duration : positiveInteger(task.duration_minutes, 'task.duration_minutes');
  if (requiredMinutes > period.interval.duration) throw new ApiError(400, 'De taakduur past niet binnen het getekende tijdvenster');
  const recurrenceAnchorDate = optionalDate(
    input.recurrence_anchor_date || input.metadata?.recurrence_anchor_date,
    `${fieldPrefix}.recurrence_anchor_date`,
  ) || serviceDate;
  return { effective_from: serviceDate, recurrence_anchor_date: recurrenceAnchorDate, recurrence_type: recurrenceType, recurrence_interval: recurrenceInterval,
    weekday: isoWeekday(serviceDate), start_time: startTime, end_time: endTime,
    recurrence_end_date: recurrenceType === 'one_time' ? serviceDate : recurrenceEndDate, required_minutes: requiredMinutes };
}

function taskSeriesRevisionChain(series: LooseRecord | null, revisions: LooseRecord[]) {
  if (!series) return revisions;
  if (!series.current_revision_id) return [];
  const revisionById = new Map(revisions.map(item => [String(item.id), item]));
  const chain: LooseRecord[] = [];
  const visited = new Set<string>();
  let cursor = revisionById.get(String(series.current_revision_id)) || null;
  while (cursor && !visited.has(String(cursor.id))) {
    chain.push(cursor);
    visited.add(String(cursor.id));
    cursor = cursor.previous_revision_id
      ? revisionById.get(String(cursor.previous_revision_id)) || null
      : null;
  }
  return chain;
}

function taskRevisionForDate(
  revisions: LooseRecord[],
  serviceDate: string,
  series: LooseRecord | null = null,
) {
  return taskSeriesRevisionChain(series, revisions)
    .filter(item => item.effective_from <= serviceDate)
    .sort((left, right) => Number(right.revision_number || 0) - Number(left.revision_number || 0))[0] || null;
}

function taskScheduleRevisionApplies(revision: LooseRecord, serviceDate: string) {
  return Boolean(revision && revision.operation !== 'stop'
    && (!revision.recurrence_end_date || serviceDate <= revision.recurrence_end_date)
    && recurrenceMatches(revision, serviceDate));
}

function activeObjectTaskScheduleException(
  exceptions: LooseRecord[],
  series: LooseRecord,
  serviceDate: string,
) {
  return exceptions.find(item => (
    item.status === 'active'
    && item.service_date === serviceDate
    && (
      String(item.source_series_id || '') === String(series.id)
      || String(item.alternative_series_id || '') === String(series.id)
    )
  )) || null;
}

function isAlternativeObjectTaskSeries(series: LooseRecord) {
  return series?.metadata?.schedule_kind === 'alternative'
    || series?.metadata?.planning_alternative === true
    || series?.metadata?.alternative === true;
}

function nextScheduleOccurrenceDate(revision: LooseRecord, fromDate: string) {
  if (!revision || revision.operation === 'stop') return null;
  for (let offset = 0; offset <= 366 * 52; offset += 1) {
    const candidate = addDateDays(fromDate, offset);
    if (revision.recurrence_end_date && candidate > revision.recurrence_end_date) return null;
    if (recurrenceMatches(revision, candidate)) return candidate;
  }
  return null;
}

function scheduleSeriesBlueprints(
  definition: LooseRecord,
  series: LooseRecord[],
  revisions: LooseRecord[],
  periodStart: string,
  periodEnd: string,
  exceptions: LooseRecord[] = [],
) {
  const revisionsBySeries = new Map<string, LooseRecord[]>();
  for (const revision of revisions) {
    const key = String(revision.series_id);
    revisionsBySeries.set(key, [...(revisionsBySeries.get(key) || []), revision]);
  }
  const results: LooseRecord[] = [];
  for (const item of series.filter(value => value.status !== 'archived')) {
    const itemRevisions = revisionsBySeries.get(String(item.id)) || [];
    for (const serviceDate of dateKeysBetween(periodStart, periodEnd)) {
      const scheduleException = activeObjectTaskScheduleException(exceptions, item, serviceDate);
      const alternative = isAlternativeObjectTaskSeries(item);
      if (
        alternative
        && (
          scheduleException?.kind === 'cancelled'
          || String(scheduleException?.alternative_series_id || '') !== String(item.id)
        )
      ) continue;
      if (!alternative && String(scheduleException?.source_series_id || '') === String(item.id)) continue;
      const revision = taskRevisionForDate(itemRevisions, serviceDate, item);
      if (!taskScheduleRevisionApplies(revision, serviceDate)) continue;
      const normalized = normalizedPeriodInterval(serviceDate, revision.start_time, revision.end_time);
      if (!normalized?.interval) continue;
      const taskSnapshot = revision.task_snapshot || {};
      const executionMode = taskSnapshot.execution_mode || definition.execution_mode;
      const requiredMinutes = executionMode === 'continuous'
        ? normalized.interval.duration
        : Number(taskSnapshot.duration_minutes || definition.duration_minutes || 0);
      if (!Number.isInteger(requiredMinutes) || requiredMinutes < 1 || requiredMinutes > normalized.interval.duration) continue;
      const logicalSourceKey = alternative
        ? compact(scheduleException?.source_logical_key)
          || `object-task-series:${scheduleException?.source_series_key || item.metadata?.source_series_key || item.series_key}:${serviceDate}`
        : `object-task-series:${item.series_key}:${serviceDate}`;
      results.push({
        source_key: alternative
          ? `${logicalSourceKey}:alternative:${item.series_key}:r${Number(revision.revision_number)}`
          : `${logicalSourceKey}:r${Number(revision.revision_number)}`,
        logical_source_key: logicalSourceKey,
        object_task_definition_id: definition.id,
        object_task_schedule_series_id: item.id,
        object_task_schedule_revision_id: revision.id,
        schedule_series_key: item.series_key,
        schedule_revision_number: Number(revision.revision_number),
        definition_version: versionOf(definition),
        schedule_period_key: item.series_key,
        task_type: taskSnapshot.task_type || definition.task_type,
        custom_task_type: compact(taskSnapshot.custom_task_type || definition.custom_task_type) || null,
        execution_mode: executionMode,
        service_date: serviceDate,
        end_date: normalized.end_date,
        window_start_time: normalized.window_start_time,
        window_end_time: normalized.window_end_time,
        timezone: 'Europe/Amsterdam',
        required_minutes: requiredMinutes,
        task_name_snapshot: taskOccurrenceName({ ...definition, ...taskSnapshot }),
        instructions_snapshot: compact(taskSnapshot.instructions ?? definition.instructions) || null,
      });
    }
  }
  return results;
}

const TASK_OCCURRENCE_COMPARABLE_FIELDS = [
  'source_key',
  'logical_source_key',
  'object_task_definition_id',
  'object_task_schedule_series_id',
  'object_task_schedule_revision_id',
  'schedule_series_key',
  'schedule_revision_number',
  'schedule_period_key',
  'company_id',
  'customer_id',
  'object_id',
  'security_plan_id',
  'security_plan_revision_id',
  'task_type',
  'custom_task_type',
  'execution_mode',
  'service_date',
  'end_date',
  'window_start_time',
  'window_end_time',
  'timezone',
  'required_minutes',
  'task_name_snapshot',
  'customer_name_snapshot',
  'object_name_snapshot',
  'instructions_snapshot',
  'lifecycle_status',
] as const;

function taskOccurrenceSourceSnapshot(value: LooseRecord | null | undefined) {
  return value ? pick(value, TASK_OCCURRENCE_COMPARABLE_FIELDS) : null;
}

const TASK_OCCURRENCE_PLANNING_IMPACT_FIELDS = [
  'company_id',
  'customer_id',
  'object_id',
  'security_plan_id',
  'security_plan_revision_id',
  'security_plan_checksum',
  'task_type',
  'custom_task_type',
  'execution_mode',
  'service_date',
  'end_date',
  'window_start_time',
  'window_end_time',
  'timezone',
  'required_minutes',
  'task_name_snapshot',
  'customer_name_snapshot',
  'object_name_snapshot',
  'instructions_snapshot',
] as const;

function taskOccurrencePlanningImpactSnapshot(value: LooseRecord | null | undefined) {
  return value ? pick(value, TASK_OCCURRENCE_PLANNING_IMPACT_FIELDS) : null;
}

async function objectTaskOccurrenceContext(
  base44: LooseRecord,
  definition: LooseRecord,
  object: LooseRecord,
  customer: LooseRecord,
) {
  const securityPlan = definition.security_plan_id
    ? await getRecord(base44, 'ObjectSecurityPlan', definition.security_plan_id)
    : null;
  const publishedRevision = securityPlan?.current_published_revision_id
    ? await getRecord(base44, 'ObjectSecurityPlanRevision', securityPlan.current_published_revision_id)
    : null;
  const validRevision = publishedRevision?.status === 'published'
    && String(publishedRevision.security_plan_id) === String(securityPlan?.id)
    ? publishedRevision
    : null;
  const securityPlanSnapshot = securityPlan ? {
    plan: pick(securityPlan, [
      'id',
      'task_type',
      'category',
      'variant_name',
      'title',
      'current_published_revision_id',
      'latest_revision_number',
      'status',
    ]),
    published_revision: validRevision ? pick(validRevision, [
      'id',
      'security_plan_id',
      'customer_id',
      'object_id',
      'revision_number',
      'status',
      'summary',
      'duration_mode',
      'duration_minutes',
      'section_policy',
      'default_section_ids',
      'allowed_section_ids',
      'instruction_blocks',
      'module_assignments',
      'floorplan_id',
      'floorplan_revision',
      'route_overlay',
      'readiness_snapshot',
      'content_checksum',
      'published_at',
      'published_by_user_id',
      'version',
    ]) : null,
  } : null;
  return {
    company_id: object.default_operating_company_id || null,
    customer_id: customer.id,
    object_id: object.id,
    security_plan_id: securityPlan?.id || definition.security_plan_id || null,
    security_plan_revision_id: validRevision?.id || null,
    security_plan_snapshot: securityPlanSnapshot,
    security_plan_checksum: securityPlanSnapshot
      ? await sha256(stableStringify(securityPlanSnapshot))
      : null,
    customer_name_snapshot: customerDisplayName(customer),
    object_name_snapshot: object.name || 'Onbekend object',
    lifecycle_status: 'active',
  };
}

function activeSegmentsForOccurrence(occurrenceId: string, segments: LooseRecord[], shiftById: Map<string, LooseRecord>) {
  return segments.filter(segment => String(segment.task_occurrence_id) === occurrenceId
    && segment.status !== 'removed' && shiftById.get(String(segment.shift_id))?.status !== 'cancelled');
}

async function ensureTaskSourceChange(
  base44: LooseRecord, user: LooseRecord, context: ReturnType<typeof mutationContext>, revision: LooseRecord,
  sourceOccurrence: LooseRecord, replacementOccurrence: LooseRecord | null, shift: LooseRecord,
  segments: LooseRecord[], previousSnapshot: LooseRecord | null, desiredSnapshot: LooseRecord | null,
  changeType: 'schedule_changed' | 'schedule_stopped',
) {
  const changeKey = `${revision.id}:${sourceOccurrence.id}:${shift.id}`;
  const fingerprint = await sha256(stableStringify({ change_key: changeKey, previous_snapshot: previousSnapshot, desired_snapshot: desiredSnapshot }));
  const existing = (await filterAllRecords(base44.asServiceRole.entities.PlanningTaskSourceChange, { change_key: changeKey }, 'created_date')).sort(coordinatorOrder)[0] || null;
  if (existing) {
    if (existing.creation_request_fingerprint !== fingerprint) throw new ApiError(409, 'Bronwijzigingssleutel hoort bij een andere taakimpact', { source_change_id: existing.id });
    return existing;
  }
  const earlierOpen = await filterAllRecords(base44.asServiceRole.entities.PlanningTaskSourceChange, { task_occurrence_id: sourceOccurrence.id, shift_id: shift.id, status: 'open' }, '-detected_at');
  for (const item of earlierOpen) await casVersionUpdate(base44, 'PlanningTaskSourceChange', item, versionOf(item), {
    status: 'resolved', resolved_at: nowIso(), resolved_by_user_id: user.id || null,
    resolution_reason: 'Vervangen door een nieuwere wijziging van dezelfde taakreeks', metadata: { ...(item.metadata || {}), superseded_by_change_key: changeKey },
  });
  return base44.asServiceRole.entities.PlanningTaskSourceChange.create({
    change_key: changeKey, customer_id: sourceOccurrence.customer_id, object_id: sourceOccurrence.object_id,
    object_task_definition_id: sourceOccurrence.object_task_definition_id, schedule_series_id: revision.series_id,
    schedule_revision_id: revision.id, occurrence_id: sourceOccurrence.id, task_occurrence_id: sourceOccurrence.id,
    source_task_occurrence_id: sourceOccurrence.id, replacement_task_occurrence_id: replacementOccurrence?.id || null,
    shift_id: shift.id, shift_ids: [shift.id], segment_ids: uniqueStrings(segments.map(item => item.id)),
    service_date: sourceOccurrence.service_date, effective_from: revision.effective_from, change_type: changeType, status: 'open',
    previous_snapshot: previousSnapshot, desired_snapshot: desiredSnapshot, detected_at: nowIso(), detected_by_user_id: user.id || null,
    resolved_at: null, resolved_by_user_id: null, resolution_reason: null,
    creation_idempotency_key: await taskMutationStorageKey(context, `source-change:${sourceOccurrence.id}:${shift.id}:${revision.id}`),
    creation_request_fingerprint: fingerprint, version: 1, metadata: { correlation_id: context.correlationId },
  });
}

function minuteParts(value: number) {
  const minute = ((value % 1440) + 1440) % 1440;
  return { date: dateFromOrdinal(Math.floor(value / 1440)), time: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}` };
}

async function migrateTaskBoundaryImpact(base44: LooseRecord, user: LooseRecord, source: LooseRecord, replacement: LooseRecord | null, shift: LooseRecord, linked: LooseRecord[], allSegments: LooseRecord[]) {
  const desired = replacement
    ? intervalFromParts(
        replacement.service_date,
        replacement.window_start_time,
        replacement.end_date,
        replacement.window_end_time,
      )
    : null;
  if (replacement && !desired) throw new ApiError(409, 'Het nieuwe taakvenster is ongeldig');
  const activeShiftSegments = allSegments.filter(item => (
    String(item.shift_id) === String(shift.id) && item.status !== 'removed'
  ));
  if (shift.status === 'cancelled' && activeShiftSegments.length) {
    throw new ApiError(409, 'Een geannuleerde dienst kan niet opnieuw door een taakwijziging worden geopend', {
      code: 'TASK_BOUNDARY_CANCELLED_SHIFT_CONFLICT',
      shift_id: shift.id,
    });
  }
  const projected = new Map(activeShiftSegments.map(item => [String(item.id), item]));
  for (const segment of linked) {
    const current = segmentInterval(segment);
    if (!current) continue;
    const start = desired ? Math.max(current.start, desired.start) : current.start;
    const end = desired ? Math.min(current.end, desired.end) : current.start;
    if (!replacement || end <= start) {
      await casUpdate(base44, 'PlanningShiftTaskSegment', segment, revisionOf(segment), { status: 'removed', last_modified_by_user_id: user.id || null, last_modified_at: nowIso(), metadata: { ...(segment.metadata || {}), removed_by_task_boundary_change: true } });
      projected.delete(String(segment.id));
      continue;
    }
    const startPart = minuteParts(start), endPart = minuteParts(end);
    const updated = await casUpdate(base44, 'PlanningShiftTaskSegment', segment, revisionOf(segment), {
      task_occurrence_id: replacement.id, object_task_definition_id: replacement.object_task_definition_id,
      start_date: startPart.date, end_date: endPart.date, start_time: startPart.time, end_time: endPart.time, duration_minutes: end - start,
      task_type: replacement.task_type, task_name_snapshot: replacement.task_name_snapshot,
      customer_name_snapshot: replacement.customer_name_snapshot || null, object_name_snapshot: replacement.object_name_snapshot || null,
      instructions_snapshot: replacement.instructions_snapshot || null, status: 'draft', last_modified_by_user_id: user.id || null, last_modified_at: nowIso(),
      metadata: { ...(segment.metadata || {}), source_task_occurrence_id: source.id, migrated_by_task_boundary_change: true },
    });
    projected.set(String(segment.id), updated);
  }
  const pendingChanges = await filterAllRecords(base44.asServiceRole.entities.PlanningTaskSourceChange, { source_task_occurrence_id: source.id, shift_id: shift.id, status: 'open' }); for (const change of pendingChanges) await casVersionUpdate(base44, 'PlanningTaskSourceChange', change, versionOf(change), { status: 'resolved', resolved_at: nowIso(), resolved_by_user_id: user.id || null, resolution_reason: 'Dienstgrenzen automatisch aangepast aan de gewijzigde taaktijd' }); const remaining = [...projected.values()], intervals = remaining.map(segmentInterval).filter(Boolean) as { start: number; end: number }[];
  if (!remaining.length) {
    const cancelled = await casUpdate(base44, 'PlanningShift', shift, revisionOf(shift), { status: 'cancelled', task_occurrence_ids: [], task_segment_count: 0, last_modified_by_user_id: user.id || null, last_modified_at: nowIso(), metadata: { ...(shift.metadata || {}), cancelled_by_task_boundary_change: true } });
    const assignments = await filterAllRecords(base44.asServiceRole.entities.PlanningAssignment, { shift_id: shift.id });
    for (const assignment of assignments.filter(item => item.status !== 'removed')) await casUpdate(base44, 'PlanningAssignment', assignment, revisionOf(assignment), { status: 'removed', removed_by_user_id: user.id || null, removed_at: nowIso(), metadata: { ...(assignment.metadata || {}), removed_by_task_boundary_change: true } });
    return cancelled;
  }
  const start = Math.min(...intervals.map(item => item.start)), end = Math.max(...intervals.map(item => item.end));
  const startPart = minuteParts(start), endPart = minuteParts(end);
  const updatedShift = await casUpdate(base44, 'PlanningShift', shift, revisionOf(shift), {
    service_date: startPart.date, end_date: endPart.date === startPart.date ? null : endPart.date,
    start_time: startPart.time, end_time: endPart.time, duration_minutes: end - start,
    task_occurrence_ids: uniqueStrings(remaining.map(item => item.task_occurrence_id)), task_segment_count: remaining.length, status: 'draft',
    last_modified_by_user_id: user.id || null, last_modified_at: nowIso(),
    metadata: { ...(shift.metadata || {}), task_boundary_migrated_at: nowIso(), source_task_occurrence_id: source.id, replacement_task_occurrence_id: replacement?.id || null },
  });
  const assignments = await filterAllRecords(
    base44.asServiceRole.entities.PlanningAssignment,
    { shift_id: shift.id },
  );
  for (const assignment of assignments.filter(item => item.status !== 'removed')) {
    const personnel = await requireRecord(base44, 'Personnel', assignment.personnel_id, 'Medewerker');
    const suppliedWarnings = normalizeArray(assignment.warning_snapshot)
      .filter((item: LooseRecord) => item.source === 'planner');
    const eligibility = await evaluateAssignmentWarnings(
      base44,
      updatedShift,
      personnel,
      assignment.id,
      suppliedWarnings,
    );
    await casUpdate(base44, 'PlanningAssignment', assignment, revisionOf(assignment), {
      status: 'draft',
      personnel_contract_id: eligibility.personnel_contract_id,
      warning_codes: eligibility.warning_codes,
      warning_snapshot: eligibility.warning_snapshot,
      has_critical_warnings: eligibility.has_critical_warnings,
      contract_routing_snapshot: eligibility.contract_routing_snapshot,
      metadata: {
        ...(assignment.metadata || {}),
        task_boundary_revalidated_at: nowIso(),
        source_task_occurrence_id: source.id,
        replacement_task_occurrence_id: replacement?.id || null,
      },
    });
  }
  return updatedShift;
}

async function replaceTaskOccurrenceSnapshot(
  base44: LooseRecord, user: LooseRecord, sourceOccurrence: LooseRecord, desiredPayload: LooseRecord,
) {
  const candidates = await filterAllRecords(base44.asServiceRole.entities.PlanningTaskOccurrence, { source_key: desiredPayload.source_key }, 'created_date');
  let replacement = candidates.filter(item => item.lifecycle_status === 'active').sort(coordinatorOrder)[0] || null;
  if (replacement) {
    const expectedReplacement = { ...desiredPayload, supersedes_task_occurrence_id: sourceOccurrence.id, superseded_by_task_occurrence_id: null };
    const mismatchedFields = TASK_OCCURRENCE_COMPARABLE_FIELDS.filter(field => stableStringify(replacement[field] ?? null) !== stableStringify(expectedReplacement[field] ?? null));
    if (mismatchedFields.length) throw new ApiError(409, 'De vervangende taakuitvoering wijkt af van de gewenste bronsnapshot', { source_key: desiredPayload.source_key, task_occurrence_id: replacement.id, mismatched_fields: mismatchedFields });
  } else replacement = await base44.asServiceRole.entities.PlanningTaskOccurrence.create({ ...desiredPayload, supersedes_task_occurrence_id: sourceOccurrence.id, superseded_by_task_occurrence_id: null, revision: 1, published_revision: 0, last_published_correlation_id: null });
  const currentSource = await requireRecord(base44, 'PlanningTaskOccurrence', sourceOccurrence.id, 'Taakuitvoering');
  if (currentSource.lifecycle_status !== 'superseded' || String(currentSource.superseded_by_task_occurrence_id || '') !== String(replacement.id)) {
    await casUpdate(base44, 'PlanningTaskOccurrence', currentSource, revisionOf(currentSource), {
      lifecycle_status: 'superseded', superseded_by_task_occurrence_id: replacement.id, last_modified_by_user_id: user.id || null, last_modified_at: nowIso(),
      metadata: { ...(currentSource.metadata || {}), superseded_by_schedule_revision_id: desiredPayload.object_task_schedule_revision_id || null },
    });
  }
  return replacement;
}

async function resolveSatisfiedTaskSourceChanges(
  base44: LooseRecord,
  user: LooseRecord,
  changes: LooseRecord[],
  occurrences: LooseRecord[],
  segments: LooseRecord[],
  shifts: LooseRecord[],
) {
  const occurrenceById = new Map(occurrences.map(item => [String(item.id), item]));
  const shiftById = new Map(shifts.map(item => [String(item.id), item]));
  const resolvedIds: string[] = [];
  for (const change of changes.filter(item => item.status === 'open')) {
    const sourceOccurrence = occurrenceById.get(String(
      change.source_task_occurrence_id || change.task_occurrence_id || change.occurrence_id,
    ));
    const replacementOccurrence = change.replacement_task_occurrence_id
      ? occurrenceById.get(String(change.replacement_task_occurrence_id)) || null
      : null;
    const relevantSegments = activeSegmentsForOccurrence(
      String(change.source_task_occurrence_id || change.task_occurrence_id || change.occurrence_id),
      segments,
      shiftById,
    ).filter(item => normalizeArray(change.shift_ids || change.shift_id).map(String).includes(String(item.shift_id)));
    const sourceRemovedFromShift = relevantSegments.length === 0;
    let resolved = change.change_type === 'schedule_stopped' && sourceRemovedFromShift;
    if (change.change_type === 'schedule_changed' && sourceRemovedFromShift && replacementOccurrence?.lifecycle_status === 'active') {
      const coverage = occurrenceCoverage(replacementOccurrence, segments, shifts);
      resolved = coverage.allocated_minutes === coverage.required_minutes;
    }
    if (!resolved) continue;
    const current = await requireRecord(base44, 'PlanningTaskSourceChange', change.id, 'Taakbronwijziging');
    if (current.status !== 'open') continue;
    await casVersionUpdate(base44, 'PlanningTaskSourceChange', current, versionOf(current), {
      status: 'resolved',
      resolved_at: nowIso(),
      resolved_by_user_id: user.id || null,
      resolution_reason: relevantSegments.length
        ? 'De vervangende taak is volledig opnieuw ingepland'
        : change.change_type === 'schedule_changed'
        ? 'De oude taak is verwijderd en de vervangende taak is volledig gedekt'
        : 'De gestopte taak is niet meer aan deze actieve dienst gekoppeld',
    });
    resolvedIds.push(change.id);
  }
  return resolvedIds;
}

async function loadObjectTaskPlanningImpact(
  base44: LooseRecord,
  occurrences: LooseRecord[],
  options: {
    includeRemovedOccurrenceSegments?: boolean;
    extraShiftIds?: unknown;
  } = {},
) {
  const occurrenceIds = uniqueStrings(occurrences.map(item => item.id));
  const occurrenceSegments = await filterRecordsByValues(
    base44.asServiceRole.entities.PlanningShiftTaskSegment,
    'task_occurrence_id',
    occurrenceIds,
    '-start_date',
  );
  const linkedShiftIds = uniqueStrings(
    [
      ...occurrenceSegments
        .filter(item => options.includeRemovedOccurrenceSegments || item.status !== 'removed')
        .map(item => item.shift_id),
      ...normalizeArray(options.extraShiftIds),
    ],
  );
  const [shiftSegments, shifts] = await Promise.all([
    filterRecordsByValues(
      base44.asServiceRole.entities.PlanningShiftTaskSegment,
      'shift_id',
      linkedShiftIds,
      '-start_date',
    ),
    filterRecordsByValues(
      base44.asServiceRole.entities.PlanningShift,
      'id',
      linkedShiftIds,
    ),
  ]);
  return {
    segments: uniqueRecords([...occurrenceSegments, ...shiftSegments], item => String(item.id)),
    shifts,
    linked_shift_ids: linkedShiftIds,
  };
}

async function reconcileSeriesMaterializedOccurrences(
  base44: LooseRecord,
  user: LooseRecord,
  context: ReturnType<typeof mutationContext>,
  definition: LooseRecord,
  series: LooseRecord,
  revisions: LooseRecord[],
  effectiveFrom: string,
  triggeringRevision: LooseRecord,
  scheduleExceptions: LooseRecord[] = [],
  suppliedImpact: LooseRecord | null = null,
) {
  const [object, customer, occurrences, sourceChanges] = await Promise.all([
    requireRecord(base44, 'SurveillanceObject', definition.object_id, 'Object'),
    requireRecord(base44, 'Customer', definition.customer_id, 'Klant'),
    filterAllRecords(base44.asServiceRole.entities.PlanningTaskOccurrence, {
      object_task_schedule_series_id: series.id,
    }, '-service_date'),
    filterAllRecords(base44.asServiceRole.entities.PlanningTaskSourceChange, {
      schedule_series_id: series.id,
    }, '-detected_at'),
  ]);
  const relevantOccurrences = occurrences.filter(item => item.service_date >= effectiveFrom);
  const impact = suppliedImpact || await loadObjectTaskPlanningImpact(base44, relevantOccurrences);
  const segments: LooseRecord[] = normalizeArray<LooseRecord>(impact.segments);
  const shifts: LooseRecord[] = normalizeArray<LooseRecord>(impact.shifts);
  const contextPayload = await objectTaskOccurrenceContext(base44, definition, object, customer);
  const shiftById = new Map<string, LooseRecord>(shifts.map(item => [String(item.id), item]));
  const occurrenceById = new Map<string, LooseRecord>(occurrences.map(item => [String(item.id), item]));
  const result = {
    created_occurrence_ids: [] as string[],
    refreshed_occurrence_ids: [] as string[],
    superseded_occurrence_ids: [] as string[],
    source_change_ids: [] as string[],
  };
  for (const occurrence of occurrences.filter(item => (
    item.lifecycle_status === 'active' && item.service_date >= effectiveFrom
  ))) {
    const blueprint = scheduleSeriesBlueprints(
      definition,
      [series],
      revisions,
      occurrence.service_date,
      occurrence.service_date,
      scheduleExceptions,
    )[0] || null;
    const activeSegments = activeSegmentsForOccurrence(String(occurrence.id), segments, shiftById);
    const inboundChanges = sourceChanges.filter(item => (
      item.status === 'open'
      && String(item.replacement_task_occurrence_id || '') === String(occurrence.id)
    ));
    if (!blueprint) {
      if (!activeSegments.length) {
        await casUpdate(base44, 'PlanningTaskOccurrence', occurrence, revisionOf(occurrence), {
          lifecycle_status: 'superseded',
          last_modified_by_user_id: user.id || null,
          last_modified_at: nowIso(),
          metadata: {
            ...(occurrence.metadata || {}),
            superseded_by_schedule_revision_id: triggeringRevision.id,
          },
        });
        result.superseded_occurrence_ids.push(occurrence.id);
        if (!inboundChanges.length) continue;
      }
      const impacts: LooseRecord[] = [];
      const segmentsByShift = new Map<string, LooseRecord[]>();
      for (const segment of activeSegments) {
        const key = String(segment.shift_id);
        segmentsByShift.set(key, [...(segmentsByShift.get(key) || []), segment]);
      }
      for (const [shiftId, linkedSegments] of segmentsByShift) {
        const shift = shiftById.get(shiftId);
        if (!shift) continue;
        impacts.push({
          source_occurrence: occurrence,
          shift,
          segments: linkedSegments,
          previous_snapshot: taskOccurrencePlanningImpactSnapshot(occurrence),
        });
      }
      for (const inbound of inboundChanges) {
        const sourceOccurrence = occurrenceById.get(String(
          inbound.source_task_occurrence_id || inbound.task_occurrence_id || inbound.occurrence_id,
        ));
        const shift = shiftById.get(String(inbound.shift_id));
        if (!sourceOccurrence || !shift) continue;
        const linkedSegments = activeSegmentsForOccurrence(
          String(sourceOccurrence.id),
          segments,
          shiftById,
        ).filter(item => String(item.shift_id) === String(shift.id));
        if (!linkedSegments.length) continue;
        impacts.push({
          source_occurrence: sourceOccurrence,
          shift,
          segments: linkedSegments,
          previous_snapshot: inbound.previous_snapshot || taskOccurrencePlanningImpactSnapshot(sourceOccurrence),
        });
      }
      for (const impact of impacts) {
        const change = await ensureTaskSourceChange(
          base44,
          user,
          context,
          triggeringRevision,
          impact.source_occurrence,
          null,
          impact.shift,
          impact.segments,
          impact.previous_snapshot,
          null,
          'schedule_stopped',
        );
        result.source_change_ids.push(change.id);
      }
      continue;
    }
    const desired = {
      ...blueprint,
      ...contextPayload,
      last_modified_by_user_id: user.id || null,
      last_modified_at: nowIso(),
      metadata: {
        ...(occurrence.metadata || {}),
        bootstrap_source: 'ObjectTaskScheduleSeries',
        schedule_reconciled_at: nowIso(),
      },
    };
    const previousImpact = taskOccurrencePlanningImpactSnapshot(occurrence);
    const sourceChanged = stableStringify(taskOccurrenceSourceSnapshot(occurrence))
      !== stableStringify(taskOccurrenceSourceSnapshot(desired));
    if (!sourceChanged) continue;
    const replacement = await replaceTaskOccurrenceSnapshot(base44, user, occurrence, desired);
    result.created_occurrence_ids.push(replacement.id);
    result.superseded_occurrence_ids.push(occurrence.id);
    if (!activeSegments.length && !inboundChanges.length) continue;
    const impacts: LooseRecord[] = [];
    const segmentsByShift = new Map<string, LooseRecord[]>();
    for (const segment of activeSegments) {
      const key = String(segment.shift_id);
      segmentsByShift.set(key, [...(segmentsByShift.get(key) || []), segment]);
    }
    for (const [shiftId, linkedSegments] of segmentsByShift) {
      const shift = shiftById.get(shiftId);
      if (!shift) continue;
      impacts.push({
        source_occurrence: occurrence,
        shift,
        segments: linkedSegments,
        previous_snapshot: previousImpact,
      });
    }
    for (const inbound of inboundChanges) {
      const sourceOccurrence = occurrenceById.get(String(
        inbound.source_task_occurrence_id || inbound.task_occurrence_id || inbound.occurrence_id,
      ));
      const shift = shiftById.get(String(inbound.shift_id));
      if (!sourceOccurrence || !shift) continue;
      const linkedSegments = activeSegmentsForOccurrence(
        String(sourceOccurrence.id),
        segments,
        shiftById,
      ).filter(item => String(item.shift_id) === String(shift.id));
      if (!linkedSegments.length) continue;
      impacts.push({
        source_occurrence: sourceOccurrence,
        shift,
        segments: linkedSegments,
        previous_snapshot: inbound.previous_snapshot || taskOccurrencePlanningImpactSnapshot(sourceOccurrence),
      });
    }
    for (const impact of impacts) {
      await migrateTaskBoundaryImpact(
        base44, user, impact.source_occurrence, replacement,
        impact.shift, impact.segments, segments,
      );
      result.refreshed_occurrence_ids.push(replacement.id);
    }
  }
  return result;
}

function taskOccurrenceIdentityKey(occurrence: LooseRecord) {
  return [
    occurrence.object_task_definition_id,
    occurrence.service_date,
    occurrence.end_date,
    occurrence.window_start_time,
    occurrence.window_end_time,
  ].map(value => compact(value)).join('|');
}

function hasActivePlanningCompositionReservation(occurrence: LooseRecord) {
  const reservation = occurrence?.metadata?.planning_composition_reservation;
  return reservation?.status === 'pending' && Date.parse(reservation.expires_at || '') > Date.now();
}

async function reconcileTaskOccurrenceSourceKey(
  base44: LooseRecord,
  user: LooseRecord,
  sourceKey: string,
  occurrenceIdsWithSegments: Set<string>,
) {
  const candidates = (await filterAllRecords(
    base44.asServiceRole.entities.PlanningTaskOccurrence,
    { source_key: sourceKey },
    'created_date',
  )).filter(item => item.lifecycle_status === 'active');
  if (candidates.length <= 1) return candidates[0] || null;
  const linked = candidates.filter(item => occurrenceIdsWithSegments.has(String(item.id)));
  if (linked.length > 1) {
    throw new ApiError(409, 'Dubbele taakuitvoeringen hebben al planning en vereisen handmatige controle', {
      source_key: sourceKey,
      task_occurrence_ids: linked.map(item => item.id),
    });
  }
  const canonical = (linked[0] ? [linked[0]] : candidates)
    .sort((left, right) => String(left.created_date || left.id).localeCompare(String(right.created_date || right.id)))[0];
  for (const duplicate of candidates) {
    if (String(duplicate.id) === String(canonical.id)) continue;
    try {
      await casUpdate(base44, 'PlanningTaskOccurrence', duplicate, revisionOf(duplicate), {
        lifecycle_status: 'superseded',
        last_modified_by_user_id: user.id || null,
        last_modified_at: nowIso(),
        metadata: {
          ...(duplicate.metadata || {}),
          duplicate_of_task_occurrence_id: canonical.id,
          duplicate_reconciled_at: nowIso(),
        },
      });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) throw error;
    }
  }
  return requireRecord(base44, 'PlanningTaskOccurrence', canonical.id, 'Taakuitvoering');
}

async function reconcilePlanningShiftSourceKey(
  base44: LooseRecord,
  user: LooseRecord,
  sourceKey: string,
  beforeWrite: (() => Promise<void>) | null = null,
  assertCandidateWritable: ((shift: LooseRecord) => Promise<void>) | null = null,
) {
  const candidates = await filterAllRecords(
    base44.asServiceRole.entities.PlanningShift,
    { source_key: sourceKey },
    'created_date',
  );
  if (!candidates.length) return null;
  if (assertCandidateWritable) {
    for (const candidate of candidates) await assertCandidateWritable(candidate);
  }
  const activeCandidates = candidates.filter(item => item.status !== 'cancelled');
  const canonical = [...(activeCandidates.length ? activeCandidates : candidates)].sort(coordinatorOrder)[0];
  const candidateIds = new Set(candidates.map(item => String(item.id)));
  const assignments = (await listAllRecords(base44.asServiceRole.entities.PlanningAssignment))
    .filter(item => candidateIds.has(String(item.shift_id)));

  // Assignments on a duplicate parent may otherwise remain active after the
  // parent is cancelled. They are retired under the same source lease; the
  // RouteExecution bootstrap below will deterministically repopulate an empty
  // canonical slot from its source of truth.
  for (const assignment of assignments.filter(item => (
    String(item.shift_id) !== String(canonical.id) && item.status !== 'removed'
  ))) {
    if (beforeWrite) await beforeWrite();
    await casUpdate(base44, 'PlanningAssignment', assignment, revisionOf(assignment), {
      status: 'removed',
      removed_by_user_id: user.id || null,
      removed_at: nowIso(),
      metadata: {
        ...(assignment.metadata || {}),
        duplicate_parent_shift_id: assignment.shift_id,
        duplicate_of_shift_id: canonical.id,
        duplicate_source_key_reconciled_at: nowIso(),
      },
    });
  }

  const activeCanonicalBySlot = new Map<number, LooseRecord[]>();
  assignments
    .filter(item => String(item.shift_id) === String(canonical.id) && item.status !== 'removed')
    .forEach(item => {
      const slot = Number(item.slot_index || 0);
      activeCanonicalBySlot.set(slot, [...(activeCanonicalBySlot.get(slot) || []), item]);
    });
  for (const [slotIndex, slotAssignments] of activeCanonicalBySlot) {
    const [winner, ...duplicates] = [...slotAssignments].sort(coordinatorOrder);
    for (const duplicate of duplicates) {
      if (beforeWrite) await beforeWrite();
      await casUpdate(base44, 'PlanningAssignment', duplicate, revisionOf(duplicate), {
        status: 'removed',
        removed_by_user_id: user.id || null,
        removed_at: nowIso(),
        metadata: {
          ...(duplicate.metadata || {}),
          duplicate_of_assignment_id: winner.id,
          duplicate_slot_index: slotIndex,
          duplicate_source_key_reconciled_at: nowIso(),
        },
      });
    }
  }
  for (const duplicate of candidates) {
    if (String(duplicate.id) === String(canonical.id) || duplicate.status === 'cancelled') continue;
    let reconciled = false;
    for (let attempt = 0; attempt < 5 && !reconciled; attempt += 1) {
      const current = await requireRecord(base44, 'PlanningShift', duplicate.id, 'Dubbele dienst');
      if (current.status === 'cancelled') {
        reconciled = true;
        continue;
      }
      try {
        if (beforeWrite) await beforeWrite();
        await casUpdate(base44, 'PlanningShift', current, revisionOf(current), {
          status: 'cancelled',
          last_modified_by_user_id: user.id || null,
          last_modified_at: nowIso(),
          metadata: {
            ...(current.metadata || {}),
            duplicate_of_shift_id: canonical.id,
            duplicate_source_key_reconciled_at: nowIso(),
          },
        });
        reconciled = true;
      } catch (error) {
        if (Number((error as any)?.status) !== 409 || attempt === 4) throw error;
      }
    }
  }
  return requireRecord(base44, 'PlanningShift', canonical.id, 'Dienst');
}

function segmentInterval(segment: LooseRecord) {
  return intervalFromParts(segment.start_date, segment.start_time, segment.end_date, segment.end_time);
}

function mergeMinuteIntervals(intervals: { start: number; end: number }[]) {
  const sorted = intervals
    .filter(item => item.end > item.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: { start: number; end: number }[] = [];
  for (const item of sorted) {
    const previous = merged.at(-1);
    if (!previous || item.start > previous.end) merged.push({ ...item });
    else previous.end = Math.max(previous.end, item.end);
  }
  return merged;
}

function shiftAllowsActiveTaskSegments(shift: LooseRecord | null | undefined) {
  if (!shift || shift.status === 'cancelled') return false;
  const compositionState = shift.metadata?.planning_composition;
  if (compositionState && compositionState.phase !== 'completed') return false;
  const composeAndAssignState = shift.metadata?.compose_and_assign;
  return !composeAndAssignState || composeAndAssignState.phase === 'completed';
}

function activeTaskSegments(segments: LooseRecord[], shifts?: LooseRecord[]) {
  const shiftById = shifts
    ? new Map<string, LooseRecord>(shifts.map(shift => [String(shift.id), shift]))
    : null;
  return segments.filter(segment => (
    segment.status !== 'removed'
    && (!shiftById || shiftAllowsActiveTaskSegments(shiftById.get(String(segment.shift_id))))
  ));
}

function occurrenceCoverage(occurrence: LooseRecord, segments: LooseRecord[], shifts?: LooseRecord[]) {
  const active = activeTaskSegments(segments, shifts).filter(segment =>
    String(segment.task_occurrence_id) === String(occurrence.id)
  );
  const intervals = mergeMinuteIntervals(
    active.map(segmentInterval).filter((item): item is NonNullable<typeof item> => item != null),
  );
  const allocatedMinutes = intervals.reduce((sum, interval) => sum + interval.end - interval.start, 0);
  const requiredMinutes = Number(occurrence.required_minutes || 0);
  return {
    allocated_minutes: allocatedMinutes,
    required_minutes: requiredMinutes,
    remaining_minutes: Math.max(0, requiredMinutes - allocatedMinutes),
    coverage_status: allocatedMinutes <= 0 ? 'open' : allocatedMinutes >= requiredMinutes ? 'full' : 'partial',
    segment_count: active.length,
  };
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

function resolveShiftTiming(source: LooseRecord, body: LooseRecord) {
  const serviceDate = body.service_date ? asDate(body.service_date, 'service_date') : asDate(source.service_date, 'service_date');
  const startTime = body.start_time ? asTime(body.start_time, 'start_time') : asTime(source.start_time, 'start_time');
  const endTime = body.end_time ? asTime(body.end_time, 'end_time') : asTime(source.end_time, 'end_time');
  let endDate: string | null;
  if (Object.prototype.hasOwnProperty.call(body, 'end_date')) {
    endDate = optionalDate(body.end_date, 'end_date');
  } else if (body.service_date && source.end_date) {
    const dayDelta = dateOrdinal(serviceDate) - dateOrdinal(asDate(source.service_date, 'service_date'));
    endDate = addDateDays(asDate(source.end_date, 'end_date'), dayDelta);
  } else {
    endDate = source.end_date ? asDate(source.end_date, 'end_date') : null;
  }
  const interval = shiftInterval({ service_date: serviceDate, end_date: endDate, start_time: startTime, end_time: endTime });
  if (!interval) throw new ApiError(400, 'Dienstinterval moet een positieve duur hebben');
  const durationMinutes = interval.end - interval.start;
  if (durationMinutes > MAX_COMPOSED_SHIFT_MINUTES) {
    throw new ApiError(409, 'Een dienst mag maximaal 24 uur beslaan', {
      duration_minutes: durationMinutes,
      maximum_duration_minutes: MAX_COMPOSED_SHIFT_MINUTES,
    });
  }
  return {
    service_date: serviceDate,
    end_date: endDate,
    start_time: startTime,
    end_time: endTime,
    duration_minutes: durationMinutes,
  };
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
    customer_ids: shift.customer_ids || [],
    object_id: shift.object_id || null,
    object_ids: shift.object_ids || [],
    route_id: shift.route_id || null,
    task_id: shift.task_id || null,
    task_occurrence_ids: shift.task_occurrence_ids || [],
    task_segment_count: Number(shift.task_segment_count || 0),
    composition_warnings: normalizeArray(shift.service_context_snapshot?.composition_warnings),
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
  const coveredDates = planningIntervalDates(shift);
  if (!coveredDates.some(date => (
    dateInRange(date, restriction.valid_from || '0000-01-01', restriction.valid_until || '9999-12-31')
  ))) {
    return false;
  }
  const scopeId = compact(restriction.scope_id);
  const idsByScope: Record<string, string[]> = {
    customer: uniqueStrings([shift.customer_id, ...(shift.customer_ids || [])]),
    object: uniqueStrings([shift.object_id, ...(shift.object_ids || [])]),
    route: uniqueStrings([shift.route_id]),
  };
  if (scopeId && (idsByScope[restriction.scope_type] || []).includes(scopeId)) return true;
  if (scopeId && ['customer', 'object', 'route'].includes(restriction.scope_type)) return false;
  const label = normalizeToken(restriction.scope_label);
  if (!label) return false;
  const segmentContexts = normalizeArray<LooseRecord>(shift.service_context_snapshot?.segment_contexts);
  const valuesByScope: Record<string, unknown[]> = {
    customer: [shift.customer_id, ...(shift.customer_ids || []), shift.customer_name_snapshot, ...segmentContexts.map(item => item.customer_name)],
    object: [shift.object_id, ...(shift.object_ids || []), shift.object_name_snapshot, ...segmentContexts.map(item => item.object_name)],
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
  ignoredShiftIds: string[] = [],
) {
  const warnings: LooseRecord[] = [...suppliedWarnings];
  const coveredDates = planningIntervalDates(shift);
  let routingSnapshot: LooseRecord | null = null;
  let personnelContractId: string | null = null;
  const ignoredShiftIdSet = new Set(uniqueStrings(ignoredShiftIds));

  if (personnel.status !== 'active' || personnel.is_active === false) {
    warnings.push(warning(
      'personnel_not_active',
      'critical',
      `Medewerker ${personnel.name || personnel.id} staat niet actief.`,
      'personnel',
    ));
  }

  const firstCoveredDate = coveredDates[0] || asDate(shift.service_date, 'service_date');
  const lastCoveredDate = coveredDates.at(-1) || firstCoveredDate;
  const overlapCandidateDates = dateKeysBetween(
    addDateDays(firstCoveredDate, -1),
    lastCoveredDate,
  );
  const [candidateShifts, absences, restrictions] = await Promise.all([
    filterAllRecords(base44.asServiceRole.entities.PlanningShift, {
      service_date: { $in: overlapCandidateDates },
    }),
    filterAllRecords(base44.asServiceRole.entities.PersonnelAbsence, { personnel_id: personnel.id }),
    filterAllRecords(base44.asServiceRole.entities.PersonnelRestriction, { personnel_id: personnel.id }),
  ]);
  const relevantCandidateShifts = candidateShifts.filter((candidate: LooseRecord) => (
    candidate.status !== 'cancelled'
    && !ignoredShiftIdSet.has(String(candidate.id))
    && intervalsOverlap(shift, candidate)
  ));
  const personnelAssignments: LooseRecord[] = [];
  const candidateShiftIds = uniqueStrings(relevantCandidateShifts.map(item => item.id));
  for (let index = 0; index < candidateShiftIds.length; index += 200) {
    personnelAssignments.push(...await filterAllRecords(
      base44.asServiceRole.entities.PlanningAssignment,
      {
        personnel_id: personnel.id,
        shift_id: { $in: candidateShiftIds.slice(index, index + 200) },
      },
    ));
  }
  const assignedShiftIds = new Set(personnelAssignments
    .filter((assignment: LooseRecord) => (
      assignment.id !== currentAssignmentId
      && assignment.status !== 'removed'
    ))
    .map((assignment: LooseRecord) => String(assignment.shift_id)));
  const overlapping = relevantCandidateShifts.filter((other: LooseRecord) => (
    assignedShiftIds.has(String(other.id))
  ));
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
    const matchingDates = coveredDates.filter(date => dateInRange(date, absence.start_date, absence.end_date));
    if (!matchingDates.length) continue;
    const critical = absence.status === 'approved' || absence.status === 'active';
    warnings.push(warning(
      `personnel_absence_${absence.absence_type || 'unknown'}`,
      critical ? 'critical' : 'warning',
      critical
        ? `Medewerker is op ${matchingDates.join(', ')} afwezig (${absence.absence_type || 'afwezigheid'}).`
        : `Er staat een afwezigheidsaanvraag open (${absence.absence_type || 'afwezigheid'}).`,
      'personnel_absence',
      { absence_id: absence.id, status: absence.status, matching_dates: matchingDates },
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

  const routingResults = await Promise.all(coveredDates.map(async serviceDate => {
    const dateWarnings: LooseRecord[] = [];
    try {
      const response = await base44.asServiceRole.functions.invoke('resolveCaoPlanningAssignmentDecision', {
        personnel_id: personnel.id,
        company_id: shift.company_id || null,
        operating_company_id: shift.company_id || null,
        task_id: shift.task_id || null,
        object_id: shift.object_id || null,
        route_id: shift.route_id || null,
        service_date: serviceDate,
        cao_key: shift.cao_key || null,
        service_context: {
          ...serviceContextFromShift(shift, personnel.id),
          service_date: serviceDate,
          covered_service_dates: coveredDates,
        },
        require_schedule_validation: false,
        run_schedule_validation: false,
        final_validation: false,
      });
      const decision = response?.data || response || null;
      const dateCode = serviceDate.replaceAll('-', '_');
      normalizeArray(decision?.blocking_reasons).forEach((message, index) => {
        dateWarnings.push(warning(
          `contract_cao_blocking_${dateCode}_${index + 1}`,
          'critical',
          compact(message),
          'resolveCaoPlanningAssignmentDecision',
          { service_date: serviceDate },
        ));
      });
      normalizeArray(decision?.manual_review_reasons).forEach((message, index) => {
        dateWarnings.push(warning(
          `contract_cao_review_${dateCode}_${index + 1}`,
          'warning',
          compact(message),
          'resolveCaoPlanningAssignmentDecision',
          { service_date: serviceDate },
        ));
      });
      normalizeArray(decision?.warnings).forEach((message, index) => {
        dateWarnings.push(warning(
          `contract_cao_warning_${dateCode}_${index + 1}`,
          'info',
          compact(message),
          'resolveCaoPlanningAssignmentDecision',
          { service_date: serviceDate },
        ));
      });
      return { service_date: serviceDate, decision, warnings: dateWarnings, resolved: true };
    } catch (error) {
      dateWarnings.push(warning(
        `assignment_validation_unavailable_${serviceDate.replaceAll('-', '_')}`,
        'warning',
        `Contract-/CAO-controle voor ${serviceDate} kon niet worden afgerond: ${(error as Error)?.message || String(error)}.`,
        'resolveCaoPlanningAssignmentDecision',
        { service_date: serviceDate },
      ));
      return { service_date: serviceDate, decision: null, warnings: dateWarnings, resolved: false };
    }
  }));
  const routingDecisions: LooseRecord[] = [];
  for (const result of routingResults) {
    warnings.push(...result.warnings);
    if (result.resolved) {
      routingDecisions.push({ service_date: result.service_date, decision: result.decision });
    }
  }
  const routedContractIds = uniqueStrings(routingDecisions.map(item => (
    item.decision?.contract_id || item.decision?.selected_contract?.id
  )));
  if (routedContractIds.length > 1) {
    warnings.push(warning(
      'contract_changes_within_shift',
      'critical',
      'De contract-/CAO-routering wisselt binnen deze kalenderoverschrijdende dienst.',
      'resolveCaoPlanningAssignmentDecision',
      { covered_service_dates: coveredDates, contract_ids: routedContractIds },
    ));
  }
  personnelContractId = routedContractIds.length === 1 ? routedContractIds[0] : null;
  routingSnapshot = routingDecisions.length === 1
    ? routingDecisions[0].decision
    : {
        covered_service_dates: coveredDates,
        decisions: routingDecisions,
        contract_id: personnelContractId,
      };

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

async function taskMutationStorageKey(context: ReturnType<typeof mutationContext>, suffix: string) {
  return `planning-task:${(await sha256(`${context.idempotencyKey}:${suffix}`)).slice(0, 48)}`;
}

function requiredExpectedVersion(body: LooseRecord, allowZero = false) {
  const value = Number(body.expected_version);
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new ApiError(400, `expected_version is verplicht en moet ${allowZero ? '0 of hoger' : 'minimaal 1'} zijn`);
  }
  return value;
}

async function requireTaskObjectScope(
  base44: LooseRecord,
  body: LooseRecord,
) {
  const objectId = requireId(body, 'object_id');
  const object = await requireRecord(base44, 'SurveillanceObject', objectId, 'Object');
  const canonicalCustomerId = compact(object.customer_id);
  const suppliedCustomerId = compact(body.customer_id);
  if (!canonicalCustomerId) throw new ApiError(409, 'Het object is niet aan een klant gekoppeld');
  if (suppliedCustomerId && suppliedCustomerId !== canonicalCustomerId) {
    throw new ApiError(409, 'Het object hoort niet bij deze klant');
  }
  const customer = await requireRecord(base44, 'Customer', canonicalCustomerId, 'Klant');
  return { object, customer, customerId: canonicalCustomerId };
}

function assertCreationBinding(
  record: LooseRecord,
  user: LooseRecord,
  fingerprint: string,
  label: string,
) {
  if (
    record.creation_request_fingerprint !== fingerprint
    || record.creation_actor_user_id !== (user.id || null)
  ) {
    throw new ApiError(409, `De idempotency-sleutel hoort bij een andere ${label}`);
  }
}

async function scheduleRevisionPayload(
  user: LooseRecord,
  context: ReturnType<typeof mutationContext>,
  requestHash: string,
  definition: LooseRecord,
  series: LooseRecord,
  block: LooseRecord,
  revisionNumber: number,
  previousRevision: LooseRecord | null,
  operation: 'schedule' | 'stop',
  storageKey: string,
  taskSnapshotOverride: LooseRecord | null = null,
) {
  const taskSnapshot = taskSnapshotOverride || previousRevision?.task_snapshot || {
    task_type: definition.task_type,
    custom_task_type: compact(definition.custom_task_type) || null,
    execution_mode: definition.execution_mode,
    duration_minutes: definition.execution_mode === 'time_window' ? Number(definition.duration_minutes) : null,
    instructions: compact(definition.instructions) || null,
    security_plan_id: definition.security_plan_id || null,
    security_plan_revision_id: definition.security_plan_revision_id || null,
  };
  const content = {
    customer_id: definition.customer_id,
    object_id: definition.object_id,
    object_task_definition_id: definition.id,
    series_id: series.id,
    series_key: series.series_key,
    revision_number: revisionNumber,
    previous_revision_id: previousRevision?.id || null,
    operation,
    effective_from: block.effective_from,
    recurrence_anchor_date: block.recurrence_anchor_date
      || previousRevision?.recurrence_anchor_date
      || previousRevision?.metadata?.recurrence_anchor_date
      || block.effective_from,
    recurrence_type: block.recurrence_type || previousRevision?.recurrence_type || 'one_time', recurrence_interval: Number(block.recurrence_interval || previousRevision?.recurrence_interval || previousRevision?.metadata?.recurrence_interval || 1),
    weekday: operation === 'schedule' ? block.weekday : (previousRevision?.weekday || isoWeekday(block.effective_from)),
    start_time: operation === 'schedule' ? block.start_time : null,
    end_time: operation === 'schedule' ? block.end_time : null,
    recurrence_end_date: operation === 'schedule' ? block.recurrence_end_date : block.effective_from,
    timezone: 'Europe/Amsterdam',
    security_plan_id: definition.security_plan_id || null,
    security_plan_revision_id: definition.security_plan_revision_id || null,
    task_snapshot: taskSnapshot,
  };
  return {
    ...content,
    content_checksum: await sha256(stableStringify(content)),
    creation_idempotency_key: storageKey,
    creation_request_fingerprint: requestHash,
    created_by_user_id: user.id || null,
    created_at: nowIso(),
    metadata: { correlation_id: context.correlationId },
  };
}

async function advanceTaskScheduleSeriesRevision(
  base44: LooseRecord,
  user: LooseRecord,
  series: LooseRecord,
  targetRevision: LooseRecord,
  targetStatus: 'active' | 'stopped' = 'active',
) {
  if (
    String(series.current_revision_id || '') === String(targetRevision.id)
    && series.status === targetStatus
  ) return series;
  if (String(series.current_revision_id || '') === String(targetRevision.id)) {
    return casVersionUpdate(
      base44,
      'ObjectTaskScheduleSeries',
      series,
      versionOf(series),
      {
        status: targetStatus,
        last_modified_by_user_id: user.id || null,
        last_modified_at: nowIso(),
      },
    );
  }
  const currentRevision = series.current_revision_id
    ? await getRecord(base44, 'ObjectTaskScheduleRevision', series.current_revision_id)
    : null;
  const currentRevisionNumber = Math.max(
    Number(series.current_revision_number || 0),
    Number(currentRevision?.revision_number || 0),
  );
  const targetRevisionNumber = Number(targetRevision.revision_number || 0);
  if (currentRevisionNumber >= targetRevisionNumber) {
    throw new ApiError(409, 'Deze taakreeks heeft inmiddels een nieuwere revisie', {
      code: 'TASK_SERIES_NEWER_REVISION',
      series_id: series.id,
      current_revision_id: series.current_revision_id || null,
      current_revision_number: currentRevisionNumber,
      target_revision_id: targetRevision.id,
      target_revision_number: targetRevisionNumber,
    });
  }
  return casVersionUpdate(
    base44,
    'ObjectTaskScheduleSeries',
    series,
    versionOf(series),
    {
      current_revision_id: targetRevision.id,
      current_revision_number: targetRevisionNumber,
      status: targetStatus,
      last_modified_by_user_id: user.id || null,
      last_modified_at: nowIso(),
    },
  );
}

async function deterministicTaskStorageKey(identity: string) {
  return `planning-task:${(await sha256(identity)).slice(0, 48)}`;
}

async function promoteLegacyTaskSeries(
  base44: LooseRecord,
  user: LooseRecord,
  context: ReturnType<typeof mutationContext>,
  definition: LooseRecord,
) {
  const existing = await filterAllRecords(
    base44.asServiceRole.entities.ObjectTaskScheduleSeries,
    { object_task_definition_id: definition.id },
    'created_date',
  );
  if (existing.length) return existing;
  const periods = taskDefinitionPeriods(definition);
  const dayNumbers: Record<string, number> = {
    mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
  };
  const promoted: LooseRecord[] = [];
  for (let index = 0; index < periods.length; index += 1) {
    const period = periods[index];
    const periodKey = compact(period.period_key)
      || `legacy:${normalizeArray(period.days)[0] || 'day'}:${period.start_time}:${period.end_time}:${index}`;
    const fingerprint = await sha256(stableStringify({
      definition_id: definition.id,
      period_key: periodKey,
      days: period.days,
      start_time: period.start_time,
      end_time: period.end_time,
      recurrence_type: definition.recurrence_type,
      valid_from: definition.valid_from || null,
      valid_until: definition.valid_until || null,
      specific_date: definition.specific_date || null,
    }));
    const storageKey = await deterministicTaskStorageKey(`legacy-series:${definition.id}:${periodKey}`);
    let series = (await filterAllRecords(
      base44.asServiceRole.entities.ObjectTaskScheduleSeries,
      { creation_idempotency_key: storageKey },
      'created_date',
    )).sort(coordinatorOrder)[0] || null;
    if (!series) {
      series = await base44.asServiceRole.entities.ObjectTaskScheduleSeries.create({
        series_key: `legacy-${(await sha256(`${definition.id}:${periodKey}`)).slice(0, 24)}`,
        customer_id: definition.customer_id,
        object_id: definition.object_id,
        object_task_definition_id: definition.id,
        current_revision_id: null,
        current_revision_number: 0,
        status: 'active',
        timezone: 'Europe/Amsterdam',
        creation_idempotency_key: storageKey,
        creation_request_fingerprint: fingerprint,
        creation_actor_user_id: user.id || null,
        version: 1,
        last_modified_by_user_id: user.id || null,
        last_modified_at: nowIso(),
        metadata: {
          migration_source: 'ObjectTaskDefinition.schedule_periods',
          legacy_period_key: periodKey,
          correlation_id: context.correlationId,
        },
      });
    }
    const dayKey = compact(normalizeArray(period.days)[0]);
    const recurrenceType = definition.recurrence_type === 'one_time' ? 'one_time' : 'weekly';
    const effectiveFrom = recurrenceType === 'one_time'
      ? asDate(definition.specific_date, 'specific_date')
      : optionalDate(definition.valid_from, 'valid_from') || amsterdamServerClock().date;
    const block = {
      effective_from: effectiveFrom,
      recurrence_type: recurrenceType,
      weekday: dayNumbers[dayKey] || isoWeekday(effectiveFrom),
      start_time: scheduleEndTime(period.start_time, 'schedule_periods.start_time'),
      end_time: scheduleEndTime(period.end_time, 'schedule_periods.end_time'),
      recurrence_end_date: recurrenceType === 'one_time'
        ? effectiveFrom
        : optionalDate(definition.valid_until, 'valid_until'),
    };
    const revisionStorageKey = await deterministicTaskStorageKey(`legacy-revision:${definition.id}:${periodKey}:1`);
    let revision = (await filterAllRecords(
      base44.asServiceRole.entities.ObjectTaskScheduleRevision,
      { creation_idempotency_key: revisionStorageKey },
      'created_date',
    )).sort(coordinatorOrder)[0] || null;
    if (!revision) {
      revision = await base44.asServiceRole.entities.ObjectTaskScheduleRevision.create(await scheduleRevisionPayload(
        user,
        context,
        fingerprint,
        definition,
        series,
        block,
        1,
        null,
        'schedule',
        revisionStorageKey,
      ));
    }
    if (!series.current_revision_id) {
      series = await casVersionUpdate(base44, 'ObjectTaskScheduleSeries', series, versionOf(series), {
        current_revision_id: revision.id,
        current_revision_number: 1,
        last_modified_by_user_id: user.id || null,
        last_modified_at: nowIso(),
      });
    }
    promoted.push(series);
  }
  return promoted;
}

function objectTaskDefinitionLegacyMirror(
  definition: LooseRecord,
  series: LooseRecord[],
  revisions: LooseRecord[],
) {
  const revisionById = new Map(revisions.map(item => [String(item.id), item]));
  const active = series
    .filter(item => item.status !== 'archived' && !isAlternativeObjectTaskSeries(item))
    .map(item => ({ series: item, revision: revisionById.get(String(item.current_revision_id)) || null }))
    .filter(item => item.revision?.operation === 'schedule')
    .sort((left, right) => String(left.series.series_key).localeCompare(String(right.series.series_key)));
  if (!active.length) {
    return {
      schedule_periods: [],
      weekdays: [],
      valid_from: null,
      valid_until: null,
      specific_date: null,
    };
  }
  const first = active[0].revision;
  const allWeekly = active.every(item => item.revision.recurrence_type === 'weekly');
  const allOneTime = active.every(item => item.revision.recurrence_type === 'one_time');
  const boundedDates = active.map(item => item.revision.recurrence_end_date).filter(Boolean).sort();
  const hasUnboundedWeekly = active.some(item => (
    item.revision.recurrence_type === 'weekly' && !item.revision.recurrence_end_date
  ));
  const normalized = normalizedPeriodInterval(first.effective_from, first.start_time, first.end_time);
  return {
    start_time: first.start_time,
    end_time: first.end_time,
    duration_minutes: definition.execution_mode === 'continuous'
      ? normalized?.interval?.duration || definition.duration_minutes
      : definition.duration_minutes,
    schedule_periods: active.map(item => ({
      period_key: item.series.series_key,
      days: [['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][Number(item.revision.weekday) - 1]],
      start_time: item.revision.start_time,
      end_time: item.revision.end_time,
    })),
    recurrence_type: allOneTime && active.length === 1
      ? 'one_time'
      : allWeekly && !hasUnboundedWeekly && boundedDates.length
      ? 'date_range'
      : 'weekly',
    weekdays: [...new Set(active
      .filter(item => item.revision.recurrence_type === 'weekly')
      .map(item => Number(item.revision.weekday)))],
    valid_from: active.map(item => item.revision.effective_from).sort()[0] || null,
    valid_until: hasUnboundedWeekly ? null : boundedDates.at(-1) || null,
    specific_date: allOneTime && active.length === 1 ? first.effective_from : null,
  };
}

async function listObjectTasks(
  base44: LooseRecord,
  body: LooseRecord,
  user: LooseRecord | null = null,
) {
  const { object, customer, customerId } = await requireTaskObjectScope(base44, body);
  const seriesImpactRecovery = user
    ? await recoverPendingObjectTaskSeriesImpactMutations(base44, user, {
        objectId: object.id,
      })
    : [];
  const [definitions, allSeries, allRevisions, scheduleExceptions, sourceChanges] = await Promise.all([
    filterAllRecords(base44.asServiceRole.entities.ObjectTaskDefinition, { object_id: object.id }, '-updated_date'),
    filterAllRecords(base44.asServiceRole.entities.ObjectTaskScheduleSeries, { object_id: object.id }, 'created_date'),
    filterAllRecords(base44.asServiceRole.entities.ObjectTaskScheduleRevision, { object_id: object.id }, '-revision_number'),
    filterAllRecords(base44.asServiceRole.entities.ObjectTaskScheduleException, { object_id: object.id }, '-service_date'),
    filterAllRecords(base44.asServiceRole.entities.PlanningTaskSourceChange, { object_id: object.id }, '-detected_at'),
  ]);
  const revisionById = new Map(allRevisions.map(item => [String(item.id), item]));
  const taskRows = definitions.map(definition => {
    const series = allSeries.filter(item => String(item.object_task_definition_id) === String(definition.id));
    const definitionSourceChanges = sourceChanges.filter(item => (
      String(item.object_task_definition_id) === String(definition.id) && item.status === 'open'
    ));
    return {
      definition,
      series: series.map(item => ({
        series: item,
        current_revision: revisionById.get(String(item.current_revision_id)) || null,
        revisions: allRevisions
          .filter(revision => String(revision.series_id) === String(item.id))
          .sort((left, right) => Number(left.revision_number) - Number(right.revision_number)),
      })),
      source_changes: definitionSourceChanges,
      open_source_change_count: definitionSourceChanges.length,
    };
  });
  return {
    ok: true,
    object_id: object.id,
    customer_id: customerId,
    object: { id: object.id, name: object.name || null },
    customer: { id: customer.id, name: customerDisplayName(customer) },
    server_clock: amsterdamServerClock(),
    tasks: taskRows,
    exceptions: scheduleExceptions,
    source_changes: sourceChanges.filter(item => item.status === 'open'),
    series_impact_recovery: seriesImpactRecovery,
  };
}

async function createObjectTask(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  requireMutationIdempotency(context, 'create_object_task');
  if (requiredExpectedVersion(body, true) !== 0) {
    throw new ApiError(409, 'Een nieuwe taak moet expected_version 0 gebruiken');
  }
  const requestHash = await mutationRequestHash('create_object_task', body);
  const replay = await findReplay(base44, 'create_object_task', context.idempotencyKey);
  if (replay) {
    assertReplayFingerprint(replay, user, requestHash, 'create_object_task');
    return replayResult(replay);
  }
  const { object, customer, customerId } = await requireTaskObjectScope(base44, body);
  const task = normalizedObjectTaskInput(body);
  if (task.security_plan_id) {
    const plan = await requireRecord(base44, 'ObjectSecurityPlan', task.security_plan_id, 'Beveiligingsplan');
    if (String(plan.object_id) !== String(object.id) || String(plan.customer_id) !== String(customerId)) {
      throw new ApiError(409, 'Het beveiligingsplan hoort niet bij dit object en deze klant');
    }
    task.security_plan_revision_id = task.security_plan_revision_id || plan.current_published_revision_id || null;
    if (task.security_plan_revision_id) {
      const revision = await requireRecord(
        base44,
        'ObjectSecurityPlanRevision',
        task.security_plan_revision_id,
        'Beveiligingsplanrevisie',
      );
      if (String(revision.security_plan_id) !== String(plan.id) || revision.status !== 'published') {
        throw new ApiError(409, 'Alleen de actuele gepubliceerde beveiligingsplanrevisie kan worden gekoppeld');
      }
    }
  }
  const clock = amsterdamServerClock();
  const rawBlocks = suppliedScheduleBlocks(body);
  if (!rawBlocks.length) throw new ApiError(400, 'Teken minimaal één taak in het rooster');
  if (rawBlocks.length > 50) throw new ApiError(400, 'Per taak kunnen maximaal 50 roosterblokken worden opgeslagen');
  const blocks = rawBlocks.map((item, index) => normalizedScheduleBlock(item, task, `schedule_blocks.${index}`, clock));
  const duplicateKeys = blocks.map(item => `${item.effective_from}:${item.start_time}:${item.end_time}:${item.recurrence_type}:${item.recurrence_interval}`);
  if (new Set(duplicateKeys).size !== duplicateKeys.length) {
    throw new ApiError(409, 'Het rooster bevat dezelfde taak meer dan één keer');
  }
  const definitionStorageKey = await taskMutationStorageKey(context, 'definition');
  const descriptor = await resourceCoordinatorDescriptor('object_task_definition', `object:${object.id}`);
  return withPlanningResourceLeases(base44, user, context, requestHash, [descriptor], async leases => {
    let definition = (await filterAllRecords(
      base44.asServiceRole.entities.ObjectTaskDefinition,
      { creation_idempotency_key: definitionStorageKey },
      'created_date',
    )).sort(coordinatorOrder)[0] || null;
    if (definition) {
      assertCreationBinding(definition, user, requestHash, 'taakaanmaak');
    } else {
      const first = blocks[0];
      const firstNormalized = normalizedPeriodInterval(first.effective_from, first.start_time, first.end_time)!;
      const weekdays = [...new Set(blocks.filter(item => item.recurrence_type === 'weekly').map(item => item.weekday))];
      definition = await base44.asServiceRole.entities.ObjectTaskDefinition.create({
        customer_id: customerId,
        object_id: object.id,
        security_plan_id: task.security_plan_id,
        security_plan_revision_id: task.security_plan_revision_id,
        task_type: task.task_type,
        custom_task_type: task.custom_task_type,
        execution_mode: task.execution_mode,
        start_time: first.start_time,
        end_time: first.end_time,
        duration_minutes: task.execution_mode === 'continuous'
          ? firstNormalized.interval.duration
          : task.duration_minutes,
        schedule_periods: blocks.map((item, index) => ({
          period_key: `series-${index + 1}`,
          days: [weekdayKey(item.effective_from)],
          start_time: item.start_time,
          end_time: item.end_time,
        })),
        recurrence_type: first.recurrence_type === 'one_time' ? 'one_time' : 'weekly',
        weekdays,
        valid_from: blocks.map(item => item.effective_from).sort()[0],
        valid_until: blocks.map(item => item.recurrence_end_date).filter(Boolean).sort().at(-1) || null,
        specific_date: first.recurrence_type === 'one_time' ? first.effective_from : null,
        instructions: task.instructions,
        status: 'active',
        timezone: 'Europe/Amsterdam',
        creation_idempotency_key: definitionStorageKey,
        creation_request_fingerprint: requestHash,
        creation_actor_user_id: user.id || null,
        last_modified_by_user_id: user.id || null,
        last_modified_at: nowIso(),
        metadata: { correlation_id: context.correlationId, schedule_source: 'ObjectTaskScheduleSeries' },
        version: 1,
      });
    }
    const createdSeries: LooseRecord[] = [];
    for (let index = 0; index < blocks.length; index += 1) {
      await renewPlanningResourceLeases(base44, user, leases);
      const block = blocks[index];
      const seriesStorageKey = await taskMutationStorageKey(context, `series:${index}`);
      const seriesFingerprint = await sha256(stableStringify({ definition_id: definition.id, block }));
      let series = (await filterAllRecords(
        base44.asServiceRole.entities.ObjectTaskScheduleSeries,
        { creation_idempotency_key: seriesStorageKey },
        'created_date',
      )).sort(coordinatorOrder)[0] || null;
      if (series) assertCreationBinding(series, user, seriesFingerprint, 'taakreeks');
      else {
        series = await base44.asServiceRole.entities.ObjectTaskScheduleSeries.create({
          series_key: `ots-${(await sha256(`${definition.id}:${seriesStorageKey}`)).slice(0, 24)}`,
          customer_id: customerId,
          object_id: object.id,
          object_task_definition_id: definition.id,
          current_revision_id: null,
          current_revision_number: 0,
          status: 'active',
          timezone: 'Europe/Amsterdam',
          creation_idempotency_key: seriesStorageKey,
          creation_request_fingerprint: seriesFingerprint,
          creation_actor_user_id: user.id || null,
          version: 1,
          last_modified_by_user_id: user.id || null,
          last_modified_at: nowIso(),
          metadata: { correlation_id: context.correlationId },
        });
      }
      const revisionStorageKey = await taskMutationStorageKey(context, `series:${index}:revision:1`);
      let revision = (await filterAllRecords(
        base44.asServiceRole.entities.ObjectTaskScheduleRevision,
        { creation_idempotency_key: revisionStorageKey },
        'created_date',
      )).sort(coordinatorOrder)[0] || null;
      const revisionPayload = await scheduleRevisionPayload(
        user,
        context,
        seriesFingerprint,
        definition,
        series,
        block,
        1,
        null,
        'schedule',
        revisionStorageKey,
      );
      if (revision) {
        if (revision.creation_request_fingerprint !== seriesFingerprint) {
          throw new ApiError(409, 'De revisiesleutel hoort bij een andere taakreeks');
        }
      } else {
        revision = await base44.asServiceRole.entities.ObjectTaskScheduleRevision.create(revisionPayload);
      }
      if (!series.current_revision_id) {
        series = await casVersionUpdate(base44, 'ObjectTaskScheduleSeries', series, versionOf(series), {
          current_revision_id: revision.id,
          current_revision_number: 1,
          status: 'active',
          last_modified_by_user_id: user.id || null,
          last_modified_at: nowIso(),
        });
      } else if (String(series.current_revision_id) !== String(revision.id)) {
        throw new ApiError(409, 'De herstelde taakreeks verwijst naar een andere revisie');
      }
      createdSeries.push({ series, current_revision: revision });
    }
    const result = {
      definition,
      series: createdSeries,
      reconciled: {
        created_occurrence_ids: [],
        refreshed_occurrence_ids: [],
        superseded_occurrence_ids: [],
        source_change_ids: [],
      },
      source_changes: [],
      server_clock: clock,
    };
    const audit = await appendAudit(base44, user, {
      action: 'create_object_task',
      resource_type: 'ObjectTaskDefinition',
      resource_id: definition.id,
      before_state: null,
      after_state: result,
      correlation_id: context.correlationId,
      idempotency_key: context.idempotencyKey,
      undoable: false,
      metadata: { request_hash: requestHash },
    });
    return { ok: true, ...result, audit_event_id: audit.id };
  });
}

async function addObjectTaskSeries(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  const action = 'add_object_task_series';
  requireMutationIdempotency(context, action);
  const expectedVersion = requiredExpectedVersion(body);
  const requestHash = await mutationRequestHash(action, body);
  const replay = await findReplay(base44, action, context.idempotencyKey);
  if (replay) {
    assertReplayFingerprint(replay, user, requestHash, action);
    return replayResult(replay);
  }
  const { object, customerId } = await requireTaskObjectScope(base44, body);
  const definitionId = compact(body.task_definition_id || body.object_task_definition_id);
  if (!definitionId) throw new ApiError(400, 'task_definition_id is verplicht');
  let definition = await requireRecord(base44, 'ObjectTaskDefinition', definitionId, 'Objecttaak');
  if (String(definition.object_id) !== String(object.id) || String(definition.customer_id) !== customerId) {
    throw new ApiError(409, 'De taak hoort niet bij dit object en deze klant');
  }
  if (definition.status === 'archived') throw new ApiError(409, 'Een gearchiveerde taak kan niet worden uitgebreid');
  const task = {
    task_type: definition.task_type,
    custom_task_type: definition.custom_task_type || null,
    execution_mode: definition.execution_mode,
    duration_minutes: definition.execution_mode === 'time_window' ? definition.duration_minutes : null,
  };
  const rawBlock = normalizeArray<LooseRecord>(body.schedule_block || body.schedule || body.schedule_blocks)[0];
  if (!rawBlock) throw new ApiError(400, 'schedule_block is verplicht');
  const block = normalizedScheduleBlock(rawBlock, task, 'schedule_block', amsterdamServerClock());
  const descriptor = await resourceCoordinatorDescriptor('object_task_definition', definition.id);
  return withPlanningResourceLeases(base44, user, context, requestHash, [descriptor], async leases => {
    definition = await requireRecord(base44, 'ObjectTaskDefinition', definition.id, 'Objecttaak');
    const marker = definition.metadata?.last_add_series_mutation;
    const recovering = marker?.idempotency_key === context.idempotencyKey
      && marker?.request_hash === requestHash
      && marker?.actor_user_id === (user.id || null);
    if (!recovering && versionOf(definition) !== expectedVersion) {
      throw new ApiError(409, 'De taak is intussen gewijzigd', {
        expected_version: expectedVersion,
        current_version: versionOf(definition),
      });
    }
    await promoteLegacyTaskSeries(base44, user, context, definition);
    const seriesStorageKey = await taskMutationStorageKey(context, 'added-series');
    const seriesFingerprint = await sha256(stableStringify({ definition_id: definition.id, block }));
    let series = (await filterAllRecords(
      base44.asServiceRole.entities.ObjectTaskScheduleSeries,
      { creation_idempotency_key: seriesStorageKey },
      'created_date',
    )).sort(coordinatorOrder)[0] || null;
    if (series) assertCreationBinding(series, user, seriesFingerprint, 'nieuwe taakreeks');
    else {
      series = await base44.asServiceRole.entities.ObjectTaskScheduleSeries.create({
        series_key: `ots-${(await sha256(`${definition.id}:${seriesStorageKey}`)).slice(0, 24)}`,
        customer_id: definition.customer_id,
        object_id: definition.object_id,
        object_task_definition_id: definition.id,
        current_revision_id: null,
        current_revision_number: 0,
        status: 'active',
        timezone: 'Europe/Amsterdam',
        creation_idempotency_key: seriesStorageKey,
        creation_request_fingerprint: seriesFingerprint,
        creation_actor_user_id: user.id || null,
        version: 1,
        last_modified_by_user_id: user.id || null,
        last_modified_at: nowIso(),
        metadata: { correlation_id: context.correlationId },
      });
    }
    const revisionStorageKey = await taskMutationStorageKey(context, 'added-series:revision:1');
    let revision = (await filterAllRecords(
      base44.asServiceRole.entities.ObjectTaskScheduleRevision,
      { creation_idempotency_key: revisionStorageKey },
      'created_date',
    )).sort(coordinatorOrder)[0] || null;
    if (!revision) {
      revision = await base44.asServiceRole.entities.ObjectTaskScheduleRevision.create(await scheduleRevisionPayload(
        user,
        context,
        seriesFingerprint,
        definition,
        series,
        block,
        1,
        null,
        'schedule',
        revisionStorageKey,
      ));
    }
    if (!series.current_revision_id) {
      series = await casVersionUpdate(base44, 'ObjectTaskScheduleSeries', series, versionOf(series), {
        current_revision_id: revision.id,
        current_revision_number: 1,
        status: 'active',
        last_modified_by_user_id: user.id || null,
        last_modified_at: nowIso(),
      });
    }
    const [definitionSeries, definitionRevisions] = await Promise.all([
      filterAllRecords(base44.asServiceRole.entities.ObjectTaskScheduleSeries, {
        object_task_definition_id: definition.id,
      }, 'created_date'),
      filterAllRecords(base44.asServiceRole.entities.ObjectTaskScheduleRevision, {
        object_task_definition_id: definition.id,
      }, 'revision_number'),
    ]);
    const legacyMirror = objectTaskDefinitionLegacyMirror(
      definition,
      definitionSeries,
      definitionRevisions,
    );
    if (!recovering) {
      await renewPlanningResourceLeases(base44, user, leases);
      definition = await casVersionUpdate(base44, 'ObjectTaskDefinition', definition, expectedVersion, {
        ...legacyMirror,
        last_modified_by_user_id: user.id || null,
        last_modified_at: nowIso(),
        metadata: {
          ...(definition.metadata || {}),
          legacy_schedule_mirror: {
            source: 'ObjectTaskScheduleSeries',
            active_series_count: definitionSeries.filter(item => item.status === 'active').length,
            updated_at: nowIso(),
          },
          last_add_series_mutation: {
            idempotency_key: context.idempotencyKey,
            request_hash: requestHash,
            actor_user_id: user.id || null,
            series_id: series.id,
            completed_at: nowIso(),
          },
        },
      });
    }
    const result = {
      definition,
      series,
      current_revision: revision,
      reconciled: {
        created_occurrence_ids: [],
        refreshed_occurrence_ids: [],
        superseded_occurrence_ids: [],
        source_change_ids: [],
      },
      source_changes: [],
      server_clock: amsterdamServerClock(),
    };
    const audit = await appendAudit(base44, user, {
      action,
      resource_type: 'ObjectTaskScheduleSeries',
      resource_id: series.id,
      before_state: null,
      after_state: result,
      correlation_id: context.correlationId,
      idempotency_key: context.idempotencyKey,
      undoable: false,
      metadata: { request_hash: requestHash },
    });
    return { ok: true, ...result, audit_event_id: audit.id };
  });
}

function matchingObjectTaskSeriesImpactMutation(
  series: LooseRecord,
  context: ReturnType<typeof mutationContext>,
  user: LooseRecord,
  requestHash: string,
) {
  const marker = series?.metadata?.object_task_series_impact_mutation;
  if (!marker || marker.idempotency_key !== context.idempotencyKey) return null;
  if (
    marker.request_hash !== requestHash
    || marker.actor_user_id !== (user.id || null)
  ) {
    throw new ApiError(409, 'idempotency_key hoort bij een andere taakreeks-impact');
  }
  return marker;
}

async function assertNoForeignPendingObjectTaskSeriesImpactMutation(
  base44: LooseRecord,
  series: LooseRecord,
  context: ReturnType<typeof mutationContext>,
  user: LooseRecord,
  requestHash: string,
) {
  await assertNoPendingLegacySingleTaskMigration(base44, {
    seriesIds: [series.id],
    objectId: series.object_id || null,
  });
  const marker = series?.metadata?.object_task_series_impact_mutation;
  if (!marker) return;
  const ownedByThisExactMutation = (
    marker.idempotency_key === context.idempotencyKey
    && marker.actor_user_id === (user.id || null)
    && marker.request_hash === requestHash
  );
  if (ownedByThisExactMutation) return;
  if (marker.phase === 'impact_completed' && marker.audit_event_id) return;
  const audits = await base44.asServiceRole.entities.PlanningAuditEvent.filter(
    { idempotency_key: marker.idempotency_key },
    '-occurred_at',
    20,
  );
  const completed = audits.some((event: LooseRecord) => (
    event.action === marker.action
    && event.actor_user_id === marker.actor_user_id
    && event.metadata?.request_hash === marker.request_hash
    && event.resource_type === 'ObjectTaskScheduleSeries'
    && String(event.resource_id || '') === String(series.id)
  ));
  if (completed) return;
  throw new ApiError(409, 'Een eerdere wijziging van deze taakreeks moet eerst worden hersteld', {
    code: 'TASK_SERIES_IMPACT_RECOVERY_PENDING',
    series_id: series.id,
    pending_idempotency_key: marker.idempotency_key,
  });
}

function objectTaskSeriesImpactLinks(
  occurrences: LooseRecord[],
  segments: LooseRecord[],
) {
  const occurrenceIds = new Set(occurrences.map(item => String(item.id)));
  const shiftIdsByOccurrence = new Map<string, Set<string>>();
  for (const segment of segments) {
    if (
      segment.status === 'removed'
      || !occurrenceIds.has(String(segment.task_occurrence_id))
      || !segment.shift_id
    ) continue;
    const occurrenceId = String(segment.task_occurrence_id);
    const shiftIds = shiftIdsByOccurrence.get(occurrenceId) || new Set<string>();
    shiftIds.add(String(segment.shift_id));
    shiftIdsByOccurrence.set(occurrenceId, shiftIds);
  }
  return [...shiftIdsByOccurrence]
    .map(([occurrenceId, shiftIds]) => ({
      occurrence_id: occurrenceId,
      shift_ids: [...shiftIds].sort(),
    }))
    .sort((left, right) => left.occurrence_id.localeCompare(right.occurrence_id));
}

function mergeObjectTaskSeriesImpactLinks(...groups: unknown[]) {
  const shiftIdsByOccurrence = new Map<string, Set<string>>();
  for (const link of groups.flatMap(group => normalizeArray<LooseRecord>(
    group as LooseRecord | LooseRecord[] | null | undefined,
  ))) {
    const occurrenceId = compact(link.occurrence_id);
    if (!occurrenceId) continue;
    const shiftIds = shiftIdsByOccurrence.get(occurrenceId) || new Set<string>();
    uniqueStrings(link.shift_ids).forEach(id => shiftIds.add(id));
    shiftIdsByOccurrence.set(occurrenceId, shiftIds);
  }
  return [...shiftIdsByOccurrence]
    .map(([occurrenceId, shiftIds]) => ({
      occurrence_id: occurrenceId,
      shift_ids: [...shiftIds].sort(),
    }))
    .sort((left, right) => left.occurrence_id.localeCompare(right.occurrence_id));
}

function objectTaskSeriesImpactFingerprint(
  occurrences: LooseRecord[],
  impact: LooseRecord,
  assignments: LooseRecord[],
) {
  const occurrenceIds = new Set(occurrences.map(item => String(item.id)));
  return stableStringify({
    occurrences: occurrences.map(item => pick(item, [
      'id',
      'revision',
      'lifecycle_status',
      'superseded_by_task_occurrence_id',
      'object_task_schedule_revision_id',
      'service_date',
    ])).sort((left, right) => String(left.id).localeCompare(String(right.id))),
    shifts: normalizeArray<LooseRecord>(impact.shifts)
      .map(item => pick(item, [
        'id', 'revision', 'status', 'service_date', 'end_date', 'start_time', 'end_time',
      ]))
      .sort((left, right) => String(left.id).localeCompare(String(right.id))),
    segments: normalizeArray<LooseRecord>(impact.segments)
      .filter(item => occurrenceIds.has(String(item.task_occurrence_id)))
      .map(item => pick(item, [
        'id', 'revision', 'status', 'shift_id', 'task_occurrence_id',
        'start_date', 'end_date', 'start_time', 'end_time',
      ]))
      .sort((left, right) => String(left.id).localeCompare(String(right.id))),
    assignments: assignments
      .map(item => pick(item, [
        'id', 'revision', 'status', 'shift_id', 'personnel_id', 'slot_index',
      ]))
      .sort((left, right) => String(left.id).localeCompare(String(right.id))),
  });
}

async function completeObjectTaskSeriesBoundaryImpact(
  base44: LooseRecord,
  user: LooseRecord,
  series: LooseRecord,
  effectiveFrom: string,
  targetRevision: LooseRecord,
  marker: LooseRecord,
  leases: LooseRecord[],
) {
  const links = normalizeArray<LooseRecord>(marker.occurrence_shift_ids);
  if (!links.length) return;
  const occurrences = (await filterAllRecords(
    base44.asServiceRole.entities.PlanningTaskOccurrence,
    { object_task_schedule_series_id: series.id },
    '-service_date',
  )).filter(item => item.service_date >= effectiveFrom);
  const occurrenceById = new Map(occurrences.map(item => [String(item.id), item]));
  const impact = await loadObjectTaskPlanningImpact(base44, occurrences, {
    extraShiftIds: marker.linked_shift_ids,
  });
  const shiftById = new Map(impact.shifts.map(item => [String(item.id), item]));

  for (const link of links) {
    const source = occurrenceById.get(String(link.occurrence_id));
    if (!source) {
      throw new ApiError(409, 'Een taakuitvoering uit de reeksimpact ontbreekt', {
        code: 'TASK_SERIES_IMPACT_OCCURRENCE_MISSING',
        task_occurrence_id: link.occurrence_id,
      });
    }
    let replacement = source;
    const visited = new Set<string>();
    while (
      replacement.lifecycle_status === 'superseded'
      && replacement.superseded_by_task_occurrence_id
      && !visited.has(String(replacement.id))
    ) {
      visited.add(String(replacement.id));
      replacement = occurrenceById.get(String(replacement.superseded_by_task_occurrence_id))
        || await requireRecord(
          base44,
          'PlanningTaskOccurrence',
          replacement.superseded_by_task_occurrence_id,
          'Vervangende taakuitvoering',
        );
      occurrenceById.set(String(replacement.id), replacement);
    }
    if (
      replacement.lifecycle_status !== 'active'
      || String(replacement.object_task_schedule_revision_id || '') !== String(targetRevision.id)
    ) {
      throw new ApiError(409, 'De vervangende taakuitvoering van de reeksimpact is niet eenduidig', {
        code: 'TASK_SERIES_IMPACT_REPLACEMENT_INVALID',
        source_task_occurrence_id: source.id,
        replacement_task_occurrence_id: replacement.id,
        target_revision_id: targetRevision.id,
      });
    }
    if (String(source.id) === String(replacement.id)) continue;
    for (const shiftId of uniqueStrings(link.shift_ids)) {
      const shift = shiftById.get(String(shiftId));
      if (!shift) {
        throw new ApiError(409, 'Een dienst uit de taakreeks-impact ontbreekt', {
          code: 'TASK_SERIES_IMPACT_SHIFT_MISSING',
          shift_id: shiftId,
          source_task_occurrence_id: source.id,
        });
      }
      const linkedSegments = impact.segments.filter(item => (
        item.status !== 'removed'
        && String(item.shift_id) === String(shift.id)
        && String(item.task_occurrence_id) === String(source.id)
      ));
      await renewPlanningResourceLeases(base44, user, leases);
      await migrateTaskBoundaryImpact(
        base44,
        user,
        source,
        replacement,
        shift,
        linkedSegments,
        impact.segments,
      );
    }
  }
}

async function mutateObjectTaskSeries(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
  operation: 'schedule' | 'stop',
) {
  const action = operation === 'stop' ? 'stop_object_task_series' : 'change_object_task_series';
  requireMutationIdempotency(context, action);
  let expectedVersion = requiredExpectedVersion(body);
  const requestHash = await mutationRequestHash(action, body);
  const replay = await findReplay(base44, action, context.idempotencyKey);
  if (replay) {
    assertReplayFingerprint(replay, user, requestHash, action);
    return replayResult(replay);
  }
  const { object, customerId } = await requireTaskObjectScope(base44, body);
  const seriesId = requireId(body, 'series_id');
  const definitionId = compact(body.task_definition_id || body.object_task_definition_id);
  if (!definitionId) throw new ApiError(400, 'task_definition_id is verplicht');
  let definition = await requireRecord(base44, 'ObjectTaskDefinition', definitionId, 'Objecttaak');
  let series = await getRecord(base44, 'ObjectTaskScheduleSeries', seriesId);
  if (!series) {
    const migrationDescriptor = await resourceCoordinatorDescriptor('object_task_definition', definition.id);
    const promoted = await withPlanningResourceLeases(
      base44,
      user,
      context,
      requestHash,
      [migrationDescriptor],
      () => promoteLegacyTaskSeries(base44, user, context, definition),
    );
    series = promoted.find(item => (
      String(item.id) === seriesId
      || String(item.series_key) === seriesId
      || String(item.metadata?.legacy_period_key) === seriesId
    )) || null;
    if (series) expectedVersion = versionOf(series);
  }
  if (!series) throw new ApiError(404, 'Taakreeks niet gevonden');
  if (
    String(series.object_task_definition_id) !== String(definition.id)
    || String(series.object_id) !== String(object.id)
    || String(series.customer_id) !== String(customerId)
    || String(definition.object_id) !== String(object.id)
  ) throw new ApiError(409, 'De taakreeks hoort niet bij dit object en deze taak');
  if (series.status === 'archived') throw new ApiError(409, 'Een gearchiveerde taakreeks kan niet worden gewijzigd');
  const alternativeSeries = isAlternativeObjectTaskSeries(series);
  if (operation === 'schedule' && series.status === 'stopped') {
    throw new ApiError(409, 'Een gestopte taakreeks kan niet worden heropend; teken een nieuwe taakreeks');
  }
  await assertNoForeignPendingObjectTaskSeriesImpactMutation(
    base44,
    series,
    context,
    user,
    requestHash,
  );
  const effectiveFrom = asDate(body.effective_from || body.service_date, 'effective_from');
  const allRevisions = await filterAllRecords(
    base44.asServiceRole.entities.ObjectTaskScheduleRevision,
    { series_id: series.id },
    'revision_number',
  );
  const revisionStorageKey = await taskMutationStorageKey(context, 'series-revision');
  const preexistingRevision = (await filterAllRecords(
    base44.asServiceRole.entities.ObjectTaskScheduleRevision,
    { creation_idempotency_key: revisionStorageKey },
    'created_date',
  )).sort(coordinatorOrder)[0] || null;
  if (preexistingRevision && preexistingRevision.creation_request_fingerprint !== requestHash) {
    throw new ApiError(409, 'De idempotency-sleutel hoort bij een andere taakreekswijziging');
  }
  const currentRevision = preexistingRevision
    ? allRevisions.find(item => (
        String(item.id) === String(preexistingRevision.previous_revision_id || '')
      )) || null
    : taskRevisionForDate(allRevisions, effectiveFrom, series);
  if (!currentRevision) throw new ApiError(409, 'De taakreeks heeft op deze datum geen geldige revisie');
  if (!taskScheduleRevisionApplies(currentRevision, effectiveFrom)) {
    throw new ApiError(409, 'De gekozen datum is geen taakuitvoering van deze reeks');
  }
  const taskSnapshot = currentRevision.task_snapshot || {
    execution_mode: definition.execution_mode,
    duration_minutes: definition.duration_minutes,
  };
  let block: LooseRecord;
  if (operation === 'schedule') {
    const recurrenceEndSupplied = Object.prototype.hasOwnProperty.call(body, 'recurrence_end_date');
    block = normalizedScheduleBlock({
      ...currentRevision,
      ...body,
      service_date: effectiveFrom,
      repeat_weekly: body.repeat_weekly ?? currentRevision.recurrence_type === 'weekly',
      recurrence_end_date: recurrenceEndSupplied ? body.recurrence_end_date : currentRevision.recurrence_end_date,
    }, taskSnapshot, 'schedule', amsterdamServerClock());
    if (currentRevision.recurrence_type === 'weekly' && block.weekday !== Number(currentRevision.weekday)) {
      throw new ApiError(409, 'Wijzig een weekreeks vanaf een occurrence op dezelfde weekdag');
    }
    if (alternativeSeries && (
      block.recurrence_type !== 'one_time'
      || block.effective_from !== effectiveFrom
      || block.recurrence_anchor_date !== effectiveFrom
      || block.recurrence_end_date !== effectiveFrom
    )) {
      throw new ApiError(409, 'Een los taakalternatief mag alleen binnen de eigen datum worden gewijzigd', {
        code: 'TASK_ALTERNATIVE_MUST_REMAIN_ONE_TIME',
        series_id: series.id,
        service_date: effectiveFrom,
      });
    }
  } else {
    assertFutureSchedule(effectiveFrom, currentRevision.start_time, amsterdamServerClock());
    block = {
      effective_from: effectiveFrom,
      recurrence_type: currentRevision.recurrence_type,
      weekday: currentRevision.weekday,
      start_time: null,
      end_time: null,
      recurrence_end_date: effectiveFrom,
    };
  }
  if (!preexistingRevision && versionOf(series) !== expectedVersion) {
    throw new ApiError(409, 'De taakreeks is intussen gewijzigd', {
      expected_version: expectedVersion,
      current_version: versionOf(series),
    });
  }
  const recoveryImpactMarker = matchingObjectTaskSeriesImpactMutation(
    series,
    context,
    user,
    requestHash,
  );
  const affectedOccurrences = await filterAllRecords(base44.asServiceRole.entities.PlanningTaskOccurrence, { object_task_schedule_series_id: series.id }, '-service_date');
  const affectedIds = new Set(affectedOccurrences.filter(item => item.service_date >= effectiveFrom).map(item => String(item.id)));
  const [planningImpact, scheduleExceptions] = await Promise.all([
    loadObjectTaskPlanningImpact(
      base44,
      affectedOccurrences.filter(item => affectedIds.has(String(item.id))),
      { extraShiftIds: recoveryImpactMarker?.linked_shift_ids },
    ),
    filterAllRecords(
      base44.asServiceRole.entities.ObjectTaskScheduleException,
      { object_id: object.id },
      '-service_date',
    ),
  ]);
  const affectedSegments = planningImpact.segments;
  const affectedShifts = planningImpact.shifts;
  const linkedSegments = affectedSegments.filter(item => item.status !== 'removed' && affectedIds.has(String(item.task_occurrence_id)));
  const linkedShiftIds = planningImpact.linked_shift_ids;
  const planningAssignments = await filterRecordsByValues(
    base44.asServiceRole.entities.PlanningAssignment,
    'shift_id',
    linkedShiftIds,
  );
  const alternativeSourceSeriesId = alternativeSeries
    ? compact(series.metadata?.source_series_id)
    : null;
  if (alternativeSeries && !alternativeSourceSeriesId) {
    throw new ApiError(409, 'Het losse taakalternatief mist de koppeling met de oorspronkelijke blauwdruk', {
      code: 'TASK_ALTERNATIVE_SOURCE_MISSING',
      series_id: series.id,
    });
  }
  const relatedAlternativeExceptions = alternativeSeries
    ? scheduleExceptions.filter(item => (
        item.status === 'active'
        && item.service_date === effectiveFrom
        && (
          String(item.alternative_series_id || '') === String(series.id)
          || String(item.source_series_id || '') === String(alternativeSourceSeriesId)
        )
      ))
    : [];
  const linkedAlternativeException = relatedAlternativeExceptions[0] || null;
  if (alternativeSeries && relatedAlternativeExceptions.length !== 1) {
    throw new ApiError(409, 'Het losse taakalternatief is niet meer aan de oorspronkelijke blauwdruk gekoppeld', {
      code: relatedAlternativeExceptions.length
        ? 'TASK_ALTERNATIVE_EXCEPTION_AMBIGUOUS'
        : 'TASK_ALTERNATIVE_EXCEPTION_MISSING',
      series_id: series.id,
      service_date: effectiveFrom,
      exception_ids: relatedAlternativeExceptions.map(item => item.id),
    });
  }
  const preparedAlternativeStop = Boolean(
    linkedAlternativeException
    && operation === 'stop'
    && preexistingRevision
    && linkedAlternativeException.kind === 'cancelled'
    && linkedAlternativeException.metadata?.last_alternative_object_task_mutation?.idempotency_key
      === context.idempotencyKey
    && linkedAlternativeException.metadata?.last_alternative_object_task_mutation?.request_hash
      === requestHash
    && String(linkedAlternativeException.alternative_revision_id || '')
      === String(preexistingRevision.id),
  );
  if (linkedAlternativeException && (
    (linkedAlternativeException.kind === 'cancelled' && !preparedAlternativeStop)
    || String(linkedAlternativeException.alternative_series_id || '') !== String(series.id)
    || String(linkedAlternativeException.customer_id || '') !== String(series.customer_id || '')
    || String(linkedAlternativeException.object_id || '') !== String(series.object_id || '')
    || String(linkedAlternativeException.object_task_definition_id || '')
      !== String(series.object_task_definition_id || '')
    || String(linkedAlternativeException.source_series_id || '') !== String(alternativeSourceSeriesId)
  )) {
    throw new ApiError(409, 'De koppeling van het losse taakalternatief is ongeldig', {
      code: 'TASK_ALTERNATIVE_EXCEPTION_INVALID',
      exception_id: linkedAlternativeException.id,
      series_id: series.id,
    });
  }
  const linkedAlternativeSourceSeries = alternativeSourceSeriesId
    ? await requireRecord(
        base44,
        'ObjectTaskScheduleSeries',
        alternativeSourceSeriesId,
        'Oorspronkelijke taakreeks',
      )
    : null;
  if (linkedAlternativeSourceSeries && (
    isAlternativeObjectTaskSeries(linkedAlternativeSourceSeries)
    || String(linkedAlternativeSourceSeries.customer_id || '') !== String(series.customer_id || '')
    || String(linkedAlternativeSourceSeries.object_id || '') !== String(series.object_id || '')
    || String(linkedAlternativeSourceSeries.object_task_definition_id || '')
      !== String(series.object_task_definition_id || '')
  )) {
    throw new ApiError(409, 'De oorspronkelijke blauwdruk van het taakalternatief is ongeldig', {
      code: 'TASK_ALTERNATIVE_SOURCE_INVALID',
      source_series_id: linkedAlternativeSourceSeries.id,
      series_id: series.id,
    });
  }
  if (operation === 'schedule') {
    const shiftById = new Map(affectedShifts.map(item => [String(item.id), item]));
    const outside = uniqueRecords(linkedSegments.filter(segment => { const occurrence = affectedOccurrences.find(item => String(item.id) === String(segment.task_occurrence_id)); const desired = occurrence && normalizedPeriodInterval(occurrence.service_date, block.start_time, block.end_time)?.interval; const current = segmentInterval(segment); return !!desired && !!current && (current.end <= desired.start || current.start >= desired.end); }).map(segment => shiftById.get(String(segment.shift_id))).filter(Boolean), item => String(item.id));
    if (outside.length && body.confirm_remove_outside_shifts !== true) throw new ApiError(409, 'Bevestig dat volledig buitenvallende diensten mogen worden verwijderd', { code: 'TASK_SHIFT_REMOVAL_CONFIRMATION_REQUIRED', shifts: outside.map(item => ({ id: item.id, name: item.service_name_snapshot || 'Dienst', service_date: item.service_date, start_time: item.start_time, end_time: item.end_time })) });
  }
  const descriptors: LooseRecord[] = [
    await resourceCoordinatorDescriptor('object_task_definition', definition.id),
    await resourceCoordinatorDescriptor('object_task_series', series.id),
    ...(linkedAlternativeSourceSeries
      ? [await resourceCoordinatorDescriptor('object_task_series', linkedAlternativeSourceSeries.id)]
      : []),
    ...(linkedAlternativeException
      ? [await resourceCoordinatorDescriptor(
          'object_task_exception',
          `${linkedAlternativeException.source_series_id}:${linkedAlternativeException.service_date}`,
        )]
      : []),
    ...await Promise.all(affectedOccurrences
      .filter(item => item.service_date >= effectiveFrom)
      .map(item => resourceCoordinatorDescriptor('task_occurrence', item.id))),
    ...await Promise.all(linkedShiftIds.map(id => resourceCoordinatorDescriptor('shift_composition', id))),
  ];
  descriptors.push(...await personnelDayDescriptors(
    planningAssignments.filter(item => item.status !== 'removed').map(item => item.personnel_id),
    affectedShifts,
  ));
  return withPlanningResourceLeases(base44, user, context, requestHash, descriptors, async leases => {
    series = await requireRecord(base44, 'ObjectTaskScheduleSeries', series.id, 'Taakreeks');
    await assertNoForeignPendingObjectTaskSeriesImpactMutation(
      base44,
      series,
      context,
      user,
      requestHash,
    );
    let taskScheduleException = linkedAlternativeException
      ? await requireRecord(
          base44,
          'ObjectTaskScheduleException',
          linkedAlternativeException.id,
          'Taakuitzondering',
        )
      : null;
    if (taskScheduleException && (
      taskScheduleException.status !== 'active'
      || taskScheduleException.service_date !== effectiveFrom
      || String(taskScheduleException.alternative_series_id || '') !== String(series.id)
      || String(taskScheduleException.source_series_id || '') !== String(alternativeSourceSeriesId)
      || String(taskScheduleException.customer_id || '') !== String(series.customer_id || '')
      || String(taskScheduleException.object_id || '') !== String(series.object_id || '')
      || String(taskScheduleException.object_task_definition_id || '')
        !== String(series.object_task_definition_id || '')
      || (
        taskScheduleException.kind === 'cancelled'
        && !preparedAlternativeStop
      )
    )) {
      throw new ApiError(409, 'Het losse taakalternatief is intussen gewijzigd; laad het takenrooster opnieuw', {
        code: 'TASK_ALTERNATIVE_EXCEPTION_CHANGED',
        exception_id: taskScheduleException.id,
      });
    }
    const lockedRecoveryImpactMarker = matchingObjectTaskSeriesImpactMutation(
      series,
      context,
      user,
      requestHash,
    );
    const lockedAffectedOccurrences = (await filterAllRecords(
      base44.asServiceRole.entities.PlanningTaskOccurrence,
      { object_task_schedule_series_id: series.id },
      '-service_date',
    )).filter(item => item.service_date >= effectiveFrom);
    const lockedPlanningImpact = await loadObjectTaskPlanningImpact(
      base44,
      lockedAffectedOccurrences,
      { extraShiftIds: lockedRecoveryImpactMarker?.linked_shift_ids },
    );
    const lockedPlanningAssignments = await filterRecordsByValues(
      base44.asServiceRole.entities.PlanningAssignment,
      'shift_id',
      lockedPlanningImpact.linked_shift_ids,
    );
    if (
      !lockedRecoveryImpactMarker
      && objectTaskSeriesImpactFingerprint(
        affectedOccurrences.filter(item => item.service_date >= effectiveFrom),
        planningImpact,
        planningAssignments,
      ) !== objectTaskSeriesImpactFingerprint(
        lockedAffectedOccurrences,
        lockedPlanningImpact,
        lockedPlanningAssignments,
      )
    ) {
      throw new ApiError(409, 'De diensten bij deze taakreeks zijn intussen gewijzigd; probeer opnieuw', {
        code: 'TASK_SERIES_COMPOSITION_CHANGED',
        series_id: series.id,
      });
    }
    const impactLinks = mergeObjectTaskSeriesImpactLinks(
      lockedRecoveryImpactMarker?.occurrence_shift_ids,
      objectTaskSeriesImpactLinks(lockedAffectedOccurrences, lockedPlanningImpact.segments),
    );
    const impactMarker = {
      ...(lockedRecoveryImpactMarker || {}),
      phase: lockedRecoveryImpactMarker?.phase || 'state_written_audit_pending',
      action,
      idempotency_key: context.idempotencyKey,
      correlation_id: context.correlationId,
      request_hash: requestHash,
      request_payload: lockedRecoveryImpactMarker?.request_payload
        || mutationRequestPayload(body),
      actor_user_id: user.id || null,
      series_id: series.id,
      effective_from: effectiveFrom,
      occurrence_shift_ids: impactLinks,
      linked_shift_ids: uniqueStrings([
        ...normalizeArray(lockedRecoveryImpactMarker?.linked_shift_ids),
        ...lockedPlanningImpact.linked_shift_ids,
      ]),
      prepared_at: lockedRecoveryImpactMarker?.prepared_at || nowIso(),
    };
    const revisionNumber = Number(series.current_revision_number || currentRevision.revision_number || 0) + 1;
    const revisionPayload = await scheduleRevisionPayload(
      user,
      context,
      requestHash,
      definition,
      series,
      block,
      revisionNumber,
      currentRevision,
      operation,
      revisionStorageKey,
    );
    let revision = preexistingRevision;
    if (!revision) {
      if (versionOf(series) !== expectedVersion) {
        throw new ApiError(409, 'De taakreeks is intussen gewijzigd', {
          expected_version: expectedVersion,
          current_version: versionOf(series),
        });
      }
      revision = await base44.asServiceRole.entities.ObjectTaskScheduleRevision.create(revisionPayload);
    }
    await renewPlanningResourceLeases(base44, user, leases);
    const currentRevisionNumber = Number(series.current_revision_number || 0);
    const targetRevisionNumber = Number(revision.revision_number || 0);
    if (
      String(series.current_revision_id || '') !== String(revision.id)
      && currentRevisionNumber >= targetRevisionNumber
    ) {
      throw new ApiError(409, 'De taakreeks heeft na deze poging al een nieuwere revisie gekregen', {
        code: 'TASK_SERIES_NEWER_REVISION',
        series_id: series.id,
        current_revision_id: series.current_revision_id || null,
        current_revision_number: currentRevisionNumber,
        target_revision_id: revision.id,
        target_revision_number: targetRevisionNumber,
      });
    }
    // Store the exception target before advancing the alternative-series
    // pointer. Readers follow only the reachable revision chain, so a crash at
    // this point still renders the previous alternative (or the explicit
    // cancellation), while an idempotent retry can safely finish the pointer.
    if (taskScheduleException) {
      const targetExceptionKind = operation === 'stop' ? 'cancelled' : 'alternative';
      if (
        taskScheduleException.kind !== targetExceptionKind
        || String(taskScheduleException.alternative_revision_id || '') !== String(revision.id)
      ) {
        taskScheduleException = await casVersionUpdate(
          base44,
          'ObjectTaskScheduleException',
          taskScheduleException,
          versionOf(taskScheduleException),
          {
            kind: targetExceptionKind,
            alternative_revision_id: revision.id,
            last_modified_by_user_id: user.id || null,
            last_modified_at: nowIso(),
            metadata: {
              ...(taskScheduleException.metadata || {}),
              last_alternative_object_task_mutation: {
                action,
                idempotency_key: context.idempotencyKey,
                request_hash: requestHash,
                actor_user_id: user.id || null,
                series_id: series.id,
                revision_id: revision.id,
                prepared_at: nowIso(),
              },
            },
          },
        );
      }
    }
    const preparedImpactMarker = {
      ...impactMarker,
      revision_id: revision.id,
    };
    const storedImpactMarker = matchingObjectTaskSeriesImpactMutation(
      series,
      context,
      user,
      requestHash,
    );
    const targetSeriesStatus = operation === 'stop' ? 'stopped' : 'active';
    if (
      String(series.current_revision_id) !== String(revision.id)
      || series.status !== targetSeriesStatus
      || stableStringify(storedImpactMarker || null) !== stableStringify(preparedImpactMarker)
    ) {
      series = await casVersionUpdate(base44, 'ObjectTaskScheduleSeries', series, versionOf(series), {
        current_revision_id: revision.id,
        current_revision_number: Number(revision.revision_number),
        status: targetSeriesStatus,
        last_modified_by_user_id: user.id || null,
        last_modified_at: nowIso(),
        metadata: {
          ...(series.metadata || {}),
          object_task_series_impact_mutation: preparedImpactMarker,
        },
      });
    }
    const currentScheduleExceptions = taskScheduleException
      ? [
          ...scheduleExceptions.filter(item => String(item.id) !== String(taskScheduleException?.id)),
          taskScheduleException,
        ]
      : scheduleExceptions;
    const storedRevisions = await filterAllRecords(
      base44.asServiceRole.entities.ObjectTaskScheduleRevision,
      { series_id: series.id },
      'revision_number',
    );
    await renewPlanningResourceLeases(base44, user, leases);
    const reconciled = await reconcileSeriesMaterializedOccurrences(
      base44,
      user,
      context,
      definition,
      series,
      storedRevisions,
      effectiveFrom,
      revision,
      currentScheduleExceptions,
      lockedPlanningImpact,
    );
    if (operation === 'schedule' && preparedImpactMarker.linked_shift_ids.length) {
      await completeObjectTaskSeriesBoundaryImpact(
        base44,
        user,
        series,
        effectiveFrom,
        revision,
        preparedImpactMarker,
        leases,
      );
    }
    series = await requireRecord(base44, 'ObjectTaskScheduleSeries', series.id, 'Taakreeks');
    definition = await requireRecord(base44, 'ObjectTaskDefinition', definition.id, 'Objecttaak');
    const mirrorMutation = definition.metadata?.last_schedule_series_mutation;
    const mirrorAlreadyWritten = mirrorMutation?.idempotency_key === context.idempotencyKey
      && mirrorMutation?.request_hash === requestHash
      && mirrorMutation?.actor_user_id === (user.id || null);
    if (!mirrorAlreadyWritten) {
      const definitionSeries = await filterAllRecords(
        base44.asServiceRole.entities.ObjectTaskScheduleSeries,
        { object_task_definition_id: definition.id },
        'created_date',
      );
      const definitionRevisions = await filterAllRecords(
        base44.asServiceRole.entities.ObjectTaskScheduleRevision,
        { object_task_definition_id: definition.id },
        'revision_number',
      );
      const legacyMirror = objectTaskDefinitionLegacyMirror(
        definition,
        definitionSeries,
        definitionRevisions,
      );
      definition = await casVersionUpdate(
        base44,
        'ObjectTaskDefinition',
        definition,
        versionOf(definition),
        {
          ...legacyMirror,
          last_modified_by_user_id: user.id || null,
          last_modified_at: nowIso(),
          metadata: {
            ...(definition.metadata || {}),
            legacy_schedule_mirror: {
              source: 'ObjectTaskScheduleSeries',
              active_series_count: definitionSeries.filter(item => item.status === 'active').length,
              updated_at: nowIso(),
            },
            last_schedule_series_mutation: {
              action,
              idempotency_key: context.idempotencyKey,
              request_hash: requestHash,
              actor_user_id: user.id || null,
              series_id: series.id,
              revision_id: revision.id,
              completed_at: nowIso(),
            },
          },
        },
      );
    }
    const sourceChanges = await filterAllRecords(
      base44.asServiceRole.entities.PlanningTaskSourceChange,
      { schedule_revision_id: revision.id, status: 'open' },
      '-detected_at',
    );
    const result = {
      definition,
      series,
      current_revision: revision,
      task_schedule_exception: taskScheduleException,
      reconciled,
      source_changes: sourceChanges,
      server_clock: amsterdamServerClock(),
    };
    const audit = await appendAudit(base44, user, {
      action,
      resource_type: 'ObjectTaskScheduleSeries',
      resource_id: series.id,
      before_state: { series: { ...series, current_revision_id: currentRevision.id }, current_revision: currentRevision },
      after_state: result,
      correlation_id: context.correlationId,
      idempotency_key: context.idempotencyKey,
      undoable: false,
      metadata: { request_hash: requestHash, effective_from: effectiveFrom },
    });
    series = await requireRecord(base44, 'ObjectTaskScheduleSeries', series.id, 'Taakreeks');
    const finalImpactMarker = matchingObjectTaskSeriesImpactMutation(
      series,
      context,
      user,
      requestHash,
    );
    if (!finalImpactMarker) {
      throw new ApiError(409, 'De taakreeks-impactjournal is tijdens afronding gewijzigd', {
        code: 'TASK_SERIES_IMPACT_MARKER_CHANGED',
        series_id: series.id,
      });
    }
    if (
      finalImpactMarker.phase !== 'impact_completed'
      || finalImpactMarker.audit_event_id !== audit.id
    ) {
      series = await casVersionUpdate(
        base44,
        'ObjectTaskScheduleSeries',
        series,
        versionOf(series),
        {
          metadata: {
            ...(series.metadata || {}),
            object_task_series_impact_mutation: {
              ...finalImpactMarker,
              phase: 'impact_completed',
              audit_event_id: audit.id,
              completed_at: nowIso(),
            },
          },
          last_modified_by_user_id: user.id || null,
          last_modified_at: nowIso(),
        },
      );
    }
    return { ok: true, ...result, series, audit_event_id: audit.id };
  });
}

async function recoverObjectTaskSeriesImpactMutation(
  base44: LooseRecord,
  user: LooseRecord,
  inputSeries: LooseRecord,
) {
  const series = await requireRecord(
    base44,
    'ObjectTaskScheduleSeries',
    inputSeries.id,
    'Taakreeks',
  );
  const marker = series.metadata?.object_task_series_impact_mutation;
  if (!marker) return null;
  const audits = await base44.asServiceRole.entities.PlanningAuditEvent.filter(
    { idempotency_key: marker.idempotency_key },
    '-occurred_at',
    20,
  );
  const completedAudit = audits.find((event: LooseRecord) => (
    event.action === marker.action
    && event.actor_user_id === marker.actor_user_id
    && event.metadata?.request_hash === marker.request_hash
    && event.resource_type === 'ObjectTaskScheduleSeries'
    && String(event.resource_id || '') === String(series.id)
  )) || null;
  if (completedAudit) {
    const finalizationContext = {
      idempotencyKey: `series-impact-finalize:${completedAudit.id}`,
      correlationId: marker.correlation_id || completedAudit.correlation_id || completedAudit.id,
    };
    const finalizationHash = await sha256(stableStringify({
      series_id: series.id,
      audit_event_id: completedAudit.id,
      idempotency_key: marker.idempotency_key,
      request_hash: marker.request_hash,
    }));
    const descriptor = await resourceCoordinatorDescriptor('object_task_series', series.id);
    return withPlanningResourceLeases(
      base44,
      user,
      finalizationContext,
      finalizationHash,
      [descriptor],
      async () => {
        let currentSeries = await requireRecord(
          base44,
          'ObjectTaskScheduleSeries',
          series.id,
          'Taakreeks',
        );
        const currentMarker = currentSeries.metadata?.object_task_series_impact_mutation;
        const sameMarker = currentMarker
          && currentMarker.action === marker.action
          && currentMarker.idempotency_key === marker.idempotency_key
          && currentMarker.actor_user_id === marker.actor_user_id
          && currentMarker.request_hash === marker.request_hash;
        if (!sameMarker) {
          return {
            series_id: series.id,
            status: 'superseded',
            audit_event_id: completedAudit.id,
          };
        }
        if (
          currentMarker.phase !== 'impact_completed'
          || currentMarker.audit_event_id !== completedAudit.id
        ) {
          currentSeries = await casVersionUpdate(
            base44,
            'ObjectTaskScheduleSeries',
            currentSeries,
            versionOf(currentSeries),
            {
              metadata: {
                ...(currentSeries.metadata || {}),
                object_task_series_impact_mutation: {
                  ...currentMarker,
                  phase: 'impact_completed',
                  audit_event_id: completedAudit.id,
                  completed_at: currentMarker.completed_at || nowIso(),
                },
              },
              last_modified_by_user_id: user.id || null,
              last_modified_at: nowIso(),
            },
          );
        }
        return {
          series_id: currentSeries.id,
          status: 'completed',
          audit_event_id: completedAudit.id,
        };
      },
    );
  }
  if (marker.actor_user_id !== (user.id || null)) {
    return {
      series_id: series.id,
      status: 'blocked',
      code: 'TASK_SERIES_IMPACT_RECOVERY_ACTOR_MISMATCH',
      pending_actor_user_id: marker.actor_user_id || null,
    };
  }
  if (
    !['change_object_task_series', 'stop_object_task_series'].includes(marker.action)
    || !marker.idempotency_key
    || !marker.request_hash
    || !marker.request_payload
  ) {
    return {
      series_id: series.id,
      status: 'blocked',
      code: 'TASK_SERIES_IMPACT_RECOVERY_PAYLOAD_MISSING',
    };
  }
  const operation = marker.action === 'stop_object_task_series' ? 'stop' : 'schedule';
  const recoveryBody = mutationRequestPayload(marker.request_payload);
  const recoveryHash = await mutationRequestHash(marker.action, recoveryBody);
  if (recoveryHash !== marker.request_hash) {
    return {
      series_id: series.id,
      status: 'blocked',
      code: 'TASK_SERIES_IMPACT_RECOVERY_PAYLOAD_MISMATCH',
    };
  }
  try {
    const result = await mutateObjectTaskSeries(
      base44,
      user,
      recoveryBody,
      {
        idempotencyKey: marker.idempotency_key,
        correlationId: marker.correlation_id || marker.idempotency_key,
      },
      operation,
    );
    return {
      series_id: series.id,
      status: 'recovered',
      audit_event_id: result.audit_event_id || null,
      revision_id: result.current_revision?.id || marker.revision_id || null,
    };
  } catch (error) {
    return {
      series_id: series.id,
      status: 'blocked',
      code: compact((error as any)?.details?.code) || 'TASK_SERIES_IMPACT_RECOVERY_FAILED',
      reason: compact((error as Error)?.message) || 'De taakreeks kon niet automatisch worden hersteld',
      details: (error as any)?.details || null,
    };
  }
}

async function recoverPendingObjectTaskSeriesImpactMutations(
  base44: LooseRecord,
  user: LooseRecord,
  options: { objectId?: string | null; seriesIds?: unknown } = {},
) {
  const requestedSeriesIds = uniqueStrings(options.seriesIds);
  const candidates = requestedSeriesIds.length
    ? (await Promise.all(requestedSeriesIds.map(id => (
        getRecord(base44, 'ObjectTaskScheduleSeries', id)
      )))).filter(Boolean) as LooseRecord[]
    : options.objectId
    ? await filterAllRecords(
        base44.asServiceRole.entities.ObjectTaskScheduleSeries,
        { object_id: options.objectId },
        'created_date',
      )
    : await listAllRecords(
        base44.asServiceRole.entities.ObjectTaskScheduleSeries,
        'created_date',
      );
  const reports: LooseRecord[] = [];
  for (const series of candidates.filter(item => (
    item.metadata?.object_task_series_impact_mutation
    && (
      item.metadata.object_task_series_impact_mutation.phase !== 'impact_completed'
      || !item.metadata.object_task_series_impact_mutation.audit_event_id
    )
  ))) {
    const report = await recoverObjectTaskSeriesImpactMutation(base44, user, series);
    if (report) reports.push(report);
  }
  return reports;
}

async function completeSingleTaskOccurrenceMarkers(
  base44: LooseRecord,
  occurrenceIds: unknown,
  context: ReturnType<typeof mutationContext>,
  auditEventId: string | null,
) {
  const completed: LooseRecord[] = [];
  for (const occurrenceId of uniqueStrings(occurrenceIds)) {
    const occurrence = await getRecord(base44, 'PlanningTaskOccurrence', occurrenceId);
    const marker = occurrence?.metadata?.single_task_occurrence_mutation;
    if (!occurrence || !marker || marker.idempotency_key !== context.idempotencyKey) continue;
    if (marker.phase === 'completed' && marker.audit_event_id === auditEventId) {
      completed.push(occurrence);
      continue;
    }
    try {
      completed.push(await casUpdate(
        base44,
        'PlanningTaskOccurrence',
        occurrence,
        revisionOf(occurrence),
        {
          metadata: {
            ...(occurrence.metadata || {}),
            single_task_occurrence_mutation: {
              ...marker,
              phase: 'completed',
              audit_event_id: auditEventId,
              completed_at: nowIso(),
            },
          },
        },
      ));
    } catch (error) {
      if (Number((error as any)?.status) !== 409) throw error;
    }
  }
  return completed;
}

async function replaySingleTaskOccurrenceMutation(
  base44: LooseRecord,
  user: LooseRecord,
  replay: LooseRecord,
  context: ReturnType<typeof mutationContext>,
  requestHash: string,
) {
  assertReplayFingerprint(replay, user, requestHash, 'change_single_task_occurrence');
  const occurrenceIds = normalizeArray(replay.after_state?.task_occurrences).map(item => item.id);
  await completeSingleTaskOccurrenceMarkers(base44, occurrenceIds, context, replay.id || null);
  const freshOccurrences = await Promise.all(
    uniqueStrings(occurrenceIds).map(id => getRecord(base44, 'PlanningTaskOccurrence', id)),
  );
  const freshById = new Map(
    freshOccurrences.filter(Boolean).map(item => [String(item.id), item]),
  );
  const result = replayResult(replay);
  return {
    ...result,
    task_occurrences: normalizeArray(result.task_occurrences)
      .map(item => freshById.get(String(item.id)) || item),
  };
}

async function changeSingleTaskOccurrence(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  const action = 'change_single_task_occurrence';
  requireMutationIdempotency(context, action);
  const requestHash = await mutationRequestHash(action, body);
  const replay = await findReplay(base44, action, context.idempotencyKey);
  if (replay) {
    return replaySingleTaskOccurrenceMutation(base44, user, replay, context, requestHash);
  }

  const occurrenceId = requireId(body, 'occurrence_id');
  const expectedOccurrenceRevision = positiveInteger(
    body.expected_occurrence_revision,
    'expected_occurrence_revision',
  );
  const initialOccurrence = await requireRecord(
    base44,
    'PlanningTaskOccurrence',
    occurrenceId,
    'Taakuitvoering',
  );
  await assertNoForeignPendingSingleTaskOccurrenceMutation(
    base44,
    initialOccurrence,
    context,
    user,
    requestHash,
  );
  const initialRecoveryMarker = matchingSingleTaskOccurrenceMutation(
    initialOccurrence,
    context,
    user,
    requestHash,
  );
  if (initialOccurrence.lifecycle_status !== 'active' && !initialRecoveryMarker) {
    throw new ApiError(409, 'Deze taakuitvoering is intussen vervangen; laad het rooster opnieuw');
  }
  if (!initialRecoveryMarker && revisionOf(initialOccurrence) !== expectedOccurrenceRevision) {
    throw new ApiError(409, 'De taakuitvoering is intussen gewijzigd', {
      expected_revision: expectedOccurrenceRevision,
      current_revision: revisionOf(initialOccurrence),
    });
  }
  const sourceSeriesId = compact(initialOccurrence.object_task_schedule_series_id);
  const definitionId = compact(initialOccurrence.object_task_definition_id);
  if (!sourceSeriesId || !definitionId) {
    throw new ApiError(409, 'Deze taakuitvoering heeft geen actuele objecttaakblauwdruk');
  }
  const [initialSeries, definition] = await Promise.all([
    requireRecord(base44, 'ObjectTaskScheduleSeries', sourceSeriesId, 'Taakreeks'),
    requireRecord(base44, 'ObjectTaskDefinition', definitionId, 'Objecttaak'),
  ]);
  if (
    String(initialSeries.object_task_definition_id) !== String(definition.id)
    || String(initialSeries.object_id) !== String(initialOccurrence.object_id)
    || String(initialSeries.customer_id) !== String(initialOccurrence.customer_id)
  ) {
    throw new ApiError(409, 'De taakuitvoering hoort niet bij de geselecteerde objecttaak');
  }
  const cancelOccurrence = body.cancel_occurrence === true;
  const serviceDate = asDate(initialOccurrence.service_date, 'service_date');
  const startTime = cancelOccurrence
    ? initialOccurrence.window_start_time
    : asTime(body.start_time, 'start_time');
  const endTime = cancelOccurrence
    ? initialOccurrence.window_end_time
    : scheduleEndTime(body.end_time, 'end_time');
  const sourceRevisionId = compact(
    body.source_revision_id || initialOccurrence.object_task_schedule_revision_id,
  );
  if (!sourceRevisionId) throw new ApiError(409, 'De bronrevisie van deze taak ontbreekt');
  const taskSnapshot = {
    task_type: initialOccurrence.task_type || definition.task_type,
    custom_task_type: initialOccurrence.custom_task_type || definition.custom_task_type || null,
    execution_mode: initialOccurrence.execution_mode || definition.execution_mode,
    duration_minutes: initialOccurrence.execution_mode === 'time_window'
      ? Number(initialOccurrence.required_minutes || definition.duration_minutes)
      : null,
    instructions: initialOccurrence.instructions_snapshot || definition.instructions || null,
    security_plan_id: initialOccurrence.security_plan_id || definition.security_plan_id || null,
    security_plan_revision_id: initialOccurrence.security_plan_revision_id
      || definition.security_plan_revision_id
      || null,
  };
  const desiredBlock = cancelOccurrence
    ? null
    : normalizedScheduleBlock({
        service_date: serviceDate,
        start_time: startTime,
        end_time: endTime,
        recurrence_type: 'one_time',
        recurrence_interval: 1,
        recurrence_end_date: serviceDate,
        recurrence_anchor_date: serviceDate,
      }, taskSnapshot, 'single_occurrence', amsterdamServerClock());
  if (cancelOccurrence) {
    assertFutureSchedule(serviceDate, startTime, amsterdamServerClock());
  }

  const initialImpact = await loadObjectTaskPlanningImpact(base44, [initialOccurrence], {
    extraShiftIds: initialRecoveryMarker?.linked_shift_ids,
  });
  const initialAssignments = await filterRecordsByValues(
    base44.asServiceRole.entities.PlanningAssignment,
    'shift_id',
    initialImpact.linked_shift_ids,
  );
  const initialShiftById = new Map(initialImpact.shifts.map(item => [String(item.id), item]));
  const linkedSegments = initialImpact.segments.filter(item => (
    item.status !== 'removed'
    && String(item.task_occurrence_id) === String(initialOccurrence.id)
  ));
  const desiredInterval = cancelOccurrence
    ? null
    : normalizedPeriodInterval(serviceDate, startTime, endTime)?.interval;
  const outsideShiftCandidates: LooseRecord[] = cancelOccurrence
    ? linkedSegments.flatMap(segment => {
        const shift = initialShiftById.get(String(segment.shift_id));
        return shift ? [shift] : [];
      })
    : desiredInterval
    ? linkedSegments.filter(segment => {
        const current = segmentInterval(segment);
        return current && (current.end <= desiredInterval.start || current.start >= desiredInterval.end);
      }).flatMap(segment => {
        const shift = initialShiftById.get(String(segment.shift_id));
        return shift ? [shift] : [];
      })
    : [];
  const outsideShifts = uniqueRecords(outsideShiftCandidates, item => String(item.id));
  if (cancelOccurrence && outsideShifts.some(item => (
    item.status === 'published' || Number(item.published_revision || 0) > 0
  ))) {
    throw new ApiError(409, 'Een gepubliceerde dienst moet via een formele annulering worden afgehandeld', {
      code: 'TASK_PUBLISHED_SHIFT_CANCELLATION_REQUIRED',
      shifts: outsideShifts.map(item => ({
        id: item.id,
        name: item.service_name_snapshot || 'Dienst',
        service_date: item.service_date,
        start_time: item.start_time,
        end_time: item.end_time,
      })),
    });
  }
  if (outsideShifts.length && body.confirm_remove_outside_shifts !== true) {
    throw new ApiError(409, 'Bevestig dat volledig buitenvallende diensten mogen worden verwijderd', {
      code: 'TASK_SHIFT_REMOVAL_CONFIRMATION_REQUIRED',
      shifts: outsideShifts.map(item => ({
        id: item.id,
        name: item.service_name_snapshot || 'Dienst',
        service_date: item.service_date,
        start_time: item.start_time,
        end_time: item.end_time,
      })),
    });
  }

  const exceptionSourceSeriesId = isAlternativeObjectTaskSeries(initialSeries)
    ? compact(initialSeries.metadata?.source_series_id) || String(initialSeries.id)
    : String(initialSeries.id);
  const exceptionIdentity = `${exceptionSourceSeriesId}:${serviceDate}`;
  const descriptors: LooseRecord[] = [
    await resourceCoordinatorDescriptor(
      'planning_idempotency',
      String(context.idempotencyKey),
    ),
    await resourceCoordinatorDescriptor('object_task_definition', definition.id),
    await resourceCoordinatorDescriptor('object_task_series', initialSeries.id),
    await resourceCoordinatorDescriptor('object_task_exception', exceptionIdentity),
    await resourceCoordinatorDescriptor('task_occurrence', initialOccurrence.id),
    ...await Promise.all(initialImpact.linked_shift_ids.map(id => (
      resourceCoordinatorDescriptor('shift_composition', id)
    ))),
  ];
  descriptors.push(...await personnelDayDescriptors(
    initialAssignments.filter(item => item.status !== 'removed').map(item => item.personnel_id),
    initialImpact.shifts,
  ));
  return withPlanningResourceLeases(base44, user, context, requestHash, descriptors, async leases => {
    const serializedReplay = await findReplay(base44, action, context.idempotencyKey);
    if (serializedReplay) {
      return replaySingleTaskOccurrenceMutation(
        base44,
        user,
        serializedReplay,
        context,
        requestHash,
      );
    }
    let [occurrence, sourceSeries, sourceRevisions] = await Promise.all([
      requireRecord(base44, 'PlanningTaskOccurrence', initialOccurrence.id, 'Taakuitvoering'),
      requireRecord(base44, 'ObjectTaskScheduleSeries', initialSeries.id, 'Taakreeks'),
      filterAllRecords(
        base44.asServiceRole.entities.ObjectTaskScheduleRevision,
        { series_id: initialSeries.id },
        'revision_number',
      ),
    ]);
    await assertNoForeignPendingSingleTaskOccurrenceMutation(
      base44,
      occurrence,
      context,
      user,
      requestHash,
    );
    const recoveryMarker = matchingSingleTaskOccurrenceMutation(
      occurrence,
      context,
      user,
      requestHash,
    );
    if (!recoveryMarker && (
      occurrence.lifecycle_status !== 'active'
      || revisionOf(occurrence) !== expectedOccurrenceRevision
    )) {
      throw new ApiError(409, 'De taakuitvoering is intussen gewijzigd; laad het rooster opnieuw');
    }
    const sourceRevision = sourceRevisions.find(item => String(item.id) === sourceRevisionId) || null;
    const effectiveRevision = taskRevisionForDate(sourceRevisions, serviceDate, sourceSeries);
    if (
      !sourceRevision
      || String(occurrence.object_task_schedule_revision_id || '') !== String(sourceRevision.id)
      || !taskScheduleRevisionApplies(sourceRevision, serviceDate)
      || (!recoveryMarker && (
        !effectiveRevision
        || String(effectiveRevision.id) !== String(sourceRevision.id)
      ))
    ) {
      throw new ApiError(409, 'De taakblauwdruk is intussen gewijzigd; laad het rooster opnieuw');
    }
    const lockedImpact = await loadObjectTaskPlanningImpact(base44, [occurrence], {
      extraShiftIds: recoveryMarker?.linked_shift_ids,
    });
    const lockedAssignments = await filterRecordsByValues(
      base44.asServiceRole.entities.PlanningAssignment,
      'shift_id',
      lockedImpact.linked_shift_ids,
    );
    if (!recoveryMarker) {
      const segmentFingerprint = (items: LooseRecord[]) => stableStringify(items
        .filter(item => (
          item.status !== 'removed'
          && String(item.task_occurrence_id) === String(occurrence.id)
        ))
        .map(item => pick(item, [
          'id',
          'shift_id',
          'revision',
          'status',
          'start_date',
          'end_date',
          'start_time',
          'end_time',
        ]))
        .sort((left, right) => String(left.id).localeCompare(String(right.id))));
      const expectedShiftIds = [...initialImpact.linked_shift_ids].map(String).sort();
      const lockedShiftIds = [...lockedImpact.linked_shift_ids].map(String).sort();
      const assignmentFingerprint = (items: LooseRecord[]) => stableStringify(items
        .filter(item => item.status !== 'removed')
        .map(item => pick(item, [
          'id',
          'shift_id',
          'personnel_id',
          'slot_index',
          'revision',
          'status',
        ]))
        .sort((left, right) => String(left.id).localeCompare(String(right.id))));
      if (
        stableStringify(expectedShiftIds) !== stableStringify(lockedShiftIds)
        || segmentFingerprint(initialImpact.segments) !== segmentFingerprint(lockedImpact.segments)
        || assignmentFingerprint(initialAssignments) !== assignmentFingerprint(lockedAssignments)
      ) {
        throw new ApiError(409, 'De diensten bij deze taak zijn intussen gewijzigd; probeer opnieuw', {
          code: 'TASK_OCCURRENCE_COMPOSITION_CHANGED',
          task_occurrence_id: occurrence.id,
        });
      }
    }
    if (!recoveryMarker) {
      occurrence = await casUpdate(
        base44,
        'PlanningTaskOccurrence',
        occurrence,
        expectedOccurrenceRevision,
        {
          last_modified_by_user_id: user.id || null,
          last_modified_at: nowIso(),
          metadata: {
            ...(occurrence.metadata || {}),
            single_task_occurrence_mutation: {
              phase: 'state_written_audit_pending',
              idempotency_key: context.idempotencyKey,
              correlation_id: context.correlationId,
              request_hash: requestHash,
              actor_user_id: user.id || null,
              started_at: nowIso(),
              linked_shift_ids: lockedImpact.linked_shift_ids,
              linked_segment_ids: lockedImpact.segments
                .filter(item => (
                  item.status !== 'removed'
                  && String(item.task_occurrence_id) === String(occurrence.id)
                ))
                .map(item => item.id),
              assignment_identity: lockedAssignments
                .filter(item => item.status !== 'removed')
                .map(item => pick(item, ['id', 'shift_id', 'personnel_id', 'slot_index'])),
              request_payload: {
                occurrence_id: occurrence.id,
                source_revision_id: sourceRevision.id,
                start_time: cancelOccurrence ? null : startTime,
                end_time: cancelOccurrence ? null : endTime,
                ...(cancelOccurrence ? { cancel_occurrence: true } : {}),
                expected_occurrence_revision: expectedOccurrenceRevision,
                confirm_remove_outside_shifts: body.confirm_remove_outside_shifts === true,
              },
            },
          },
        },
      );
    }

    const dateExceptions = await filterAllRecords(
      base44.asServiceRole.entities.ObjectTaskScheduleException,
      { service_date: serviceDate },
      'created_date',
    );
    let activeException = dateExceptions.find(item => (
      item.status === 'active'
      && (
        String(item.source_series_id || '') === String(sourceSeries.id)
        || String(item.alternative_series_id || '') === String(sourceSeries.id)
      )
    )) || null;
    let targetSeries = sourceSeries;
    let targetRevision: LooseRecord | null = null;
    let scheduleExceptions = dateExceptions;
    const sourceIsAlternative = isAlternativeObjectTaskSeries(sourceSeries);
    const sourceRepeats = sourceRevision.recurrence_type !== 'one_time' && !sourceIsAlternative;
    if (sourceIsAlternative && (
      !activeException
      || String(activeException.alternative_series_id || '') !== String(sourceSeries.id)
      || String(activeException.source_series_id || '')
        !== String(sourceSeries.metadata?.source_series_id || '')
      || activeException.service_date !== serviceDate
    )) {
      throw new ApiError(409, 'Het losse taakalternatief is niet meer geldig gekoppeld', {
        code: 'TASK_ALTERNATIVE_EXCEPTION_INVALID',
        series_id: sourceSeries.id,
        service_date: serviceDate,
      });
    }

    if (sourceRepeats) {
      const exceptionKey = `object-task-exception:${(await sha256(exceptionIdentity)).slice(0, 48)}`;
      let scheduleException = dateExceptions.find(item => item.exception_key === exceptionKey) || null;
      if (
        scheduleException?.status === 'active'
        && scheduleException.metadata?.activated_by_idempotency_key !== context.idempotencyKey
      ) {
        throw new ApiError(409, 'Deze taakuitvoering heeft al een los alternatief; laad het rooster opnieuw');
      }
      if (!scheduleException) {
        scheduleException = await base44.asServiceRole.entities.ObjectTaskScheduleException.create({
          exception_key: exceptionKey,
          customer_id: occurrence.customer_id,
          object_id: occurrence.object_id,
          object_task_definition_id: definition.id,
          source_series_id: sourceSeries.id,
          source_series_key: sourceSeries.series_key,
          source_revision_id: sourceRevision.id,
          source_logical_key: occurrence.logical_source_key
            || `object-task-series:${sourceSeries.series_key}:${serviceDate}`,
          service_date: serviceDate,
          kind: cancelOccurrence ? 'cancelled' : 'alternative',
          alternative_series_id: null,
          alternative_revision_id: null,
          status: 'pending',
          creation_idempotency_key: await deterministicTaskStorageKey(`exception:${exceptionKey}`),
          creation_request_fingerprint: await sha256(stableStringify({
            source_series_id: sourceSeries.id,
            service_date: serviceDate,
          })),
          creation_actor_user_id: user.id || null,
          created_by_user_id: user.id || null,
          created_at: nowIso(),
          last_modified_by_user_id: user.id || null,
          last_modified_at: nowIso(),
          version: 1,
          metadata: {
            correlation_id: context.correlationId,
            origin_occurrence_id: occurrence.id,
          },
        });
      }
      if (!scheduleException) throw new ApiError(503, 'De taakuitzondering kon niet worden voorbereid');
      if (
        String(scheduleException.source_series_id) !== String(sourceSeries.id)
        || scheduleException.service_date !== serviceDate
      ) {
        throw new ApiError(409, 'De taakuitzondering hoort bij een andere blauwdruk');
      }
      const lockedException: LooseRecord = scheduleException;

      if (cancelOccurrence) {
        const cancelledException = (
          lockedException.status !== 'active'
          || lockedException.kind !== 'cancelled'
          || lockedException.alternative_series_id
          || lockedException.alternative_revision_id
        )
          ? await casVersionUpdate(
            base44,
            'ObjectTaskScheduleException',
            lockedException,
            versionOf(lockedException),
            {
              kind: 'cancelled',
              alternative_series_id: null,
              alternative_series_key: null,
              alternative_revision_id: null,
              status: 'active',
              last_modified_by_user_id: user.id || null,
              last_modified_at: nowIso(),
              metadata: {
                ...(lockedException.metadata || {}),
                activated_by_idempotency_key: context.idempotencyKey,
                activated_at: nowIso(),
                cancelled_from_planning: true,
              },
            },
          )
          : lockedException;
        scheduleException = cancelledException;
        activeException = cancelledException;
        targetSeries = sourceSeries;
        targetRevision = sourceRevision;
        scheduleExceptions = [
          ...dateExceptions.filter(item => String(item.id) !== String(cancelledException.id)),
          cancelledException,
        ];
      } else {
      if (lockedException.alternative_series_id) {
        targetSeries = await requireRecord(
            base44,
            'ObjectTaskScheduleSeries',
            lockedException.alternative_series_id,
            'Alternatieve taakreeks',
          );
      } else {
        const alternativeStorageKey = await deterministicTaskStorageKey(`alternative-series:${exceptionKey}`);
        const storedAlternativeSeries = (await filterAllRecords(
          base44.asServiceRole.entities.ObjectTaskScheduleSeries,
          { creation_idempotency_key: alternativeStorageKey },
          'created_date',
        )).sort(coordinatorOrder)[0] || null;
        if (storedAlternativeSeries) {
          targetSeries = storedAlternativeSeries;
        } else {
          targetSeries = await base44.asServiceRole.entities.ObjectTaskScheduleSeries.create({
            series_key: `ots-alt-${(await sha256(exceptionKey)).slice(0, 24)}`,
            customer_id: definition.customer_id,
            object_id: definition.object_id,
            object_task_definition_id: definition.id,
            current_revision_id: null,
            current_revision_number: 0,
            status: 'active',
            timezone: 'Europe/Amsterdam',
            creation_idempotency_key: alternativeStorageKey,
            creation_request_fingerprint: lockedException.creation_request_fingerprint,
            creation_actor_user_id: user.id || null,
            version: 1,
            last_modified_by_user_id: user.id || null,
            last_modified_at: nowIso(),
            metadata: {
              schedule_kind: 'alternative',
              alternative: true,
              planning_alternative: true,
              exception_key: exceptionKey,
              source_series_id: sourceSeries.id,
              source_series_key: sourceSeries.series_key,
              origin_occurrence_id: occurrence.id,
            },
          });
        }
      }
      const alternativeRevisions = await filterAllRecords(
        base44.asServiceRole.entities.ObjectTaskScheduleRevision,
        { series_id: targetSeries.id },
        'revision_number',
      );
      const previousAlternativeRevision = taskRevisionForDate(
        alternativeRevisions,
        serviceDate,
        targetSeries,
      );
      const revisionStorageKey = await taskMutationStorageKey(context, 'single-alternative-revision');
      targetRevision = (await filterAllRecords(
        base44.asServiceRole.entities.ObjectTaskScheduleRevision,
        { creation_idempotency_key: revisionStorageKey },
        'created_date',
      )).sort(coordinatorOrder)[0] || null;
      if (!targetRevision) {
        targetRevision = await base44.asServiceRole.entities.ObjectTaskScheduleRevision.create(
          await scheduleRevisionPayload(
            user,
            context,
            requestHash,
            definition,
            targetSeries,
            desiredBlock as LooseRecord,
            Number(targetSeries.current_revision_number || 0) + 1,
            previousAlternativeRevision,
            'schedule',
            revisionStorageKey,
            taskSnapshot,
          ),
        );
      }
      if (!targetRevision) throw new ApiError(503, 'De alternatieve taakrevisie kon niet worden opgeslagen');
      targetSeries = await advanceTaskScheduleSeriesRevision(
        base44,
        user,
        targetSeries,
        targetRevision,
      );
      if (
        lockedException.status !== 'active'
        || String(lockedException.alternative_series_id || '') !== String(targetSeries.id)
        || String(lockedException.alternative_revision_id || '') !== String(targetRevision.id)
      ) {
        scheduleException = await casVersionUpdate(
          base44,
          'ObjectTaskScheduleException',
          lockedException,
          versionOf(lockedException),
          {
            alternative_series_id: targetSeries.id,
            alternative_series_key: targetSeries.series_key,
            alternative_revision_id: targetRevision.id,
            status: 'active',
            last_modified_by_user_id: user.id || null,
            last_modified_at: nowIso(),
            metadata: {
              ...(lockedException.metadata || {}),
              activated_by_idempotency_key: context.idempotencyKey,
              activated_at: nowIso(),
            },
          },
        );
      } else {
        scheduleException = lockedException;
      }
      if (!scheduleException) throw new ApiError(503, 'De taakuitzondering kon niet worden geactiveerd');
      const activatedException = scheduleException;
      activeException = activatedException;
      scheduleExceptions = [
        ...dateExceptions.filter(item => String(item.id) !== String(activatedException.id)),
        activatedException,
      ];
      }
    } else {
      const singleSeriesBlock = cancelOccurrence
        ? {
            effective_from: serviceDate,
            recurrence_anchor_date: sourceRevision.recurrence_anchor_date || serviceDate,
            recurrence_type: sourceRevision.recurrence_type || 'one_time',
            recurrence_interval: Number(sourceRevision.recurrence_interval || 1),
            weekday: sourceRevision.weekday || isoWeekday(serviceDate),
            start_time: null,
            end_time: null,
            recurrence_end_date: serviceDate,
          }
        : desiredBlock;
      const revisionStorageKey = await taskMutationStorageKey(context, 'single-series-revision');
      targetRevision = (await filterAllRecords(
        base44.asServiceRole.entities.ObjectTaskScheduleRevision,
        { creation_idempotency_key: revisionStorageKey },
        'created_date',
      )).sort(coordinatorOrder)[0] || null;
      if (!targetRevision) {
        targetRevision = await base44.asServiceRole.entities.ObjectTaskScheduleRevision.create(
          await scheduleRevisionPayload(
            user,
            context,
            requestHash,
            definition,
            targetSeries,
            singleSeriesBlock as LooseRecord,
            Number(targetSeries.current_revision_number || sourceRevision.revision_number || 0) + 1,
            sourceRevision,
            cancelOccurrence ? 'stop' : 'schedule',
            revisionStorageKey,
            taskSnapshot,
          ),
        );
      }
      if (!targetRevision) throw new ApiError(503, 'De taakrevisie kon niet worden opgeslagen');
      targetSeries = await advanceTaskScheduleSeriesRevision(
        base44,
        user,
        targetSeries,
        targetRevision,
        cancelOccurrence ? 'stopped' : 'active',
      );
      if (
        sourceIsAlternative
        && activeException
        && (
          String(activeException.alternative_revision_id || '') !== String(targetRevision.id)
          || (cancelOccurrence && activeException.kind !== 'cancelled')
        )
      ) {
        const updatedActiveException = await casVersionUpdate(
          base44,
          'ObjectTaskScheduleException',
          activeException,
          versionOf(activeException),
          {
            kind: cancelOccurrence ? 'cancelled' : 'alternative',
            alternative_revision_id: targetRevision.id,
            last_modified_by_user_id: user.id || null,
            last_modified_at: nowIso(),
            metadata: {
              ...(activeException.metadata || {}),
              last_alternative_edit_idempotency_key: context.idempotencyKey,
              last_alternative_edit_at: nowIso(),
            },
          },
        );
        activeException = updatedActiveException;
        scheduleExceptions = [
          ...dateExceptions.filter(item => String(item.id) !== String(updatedActiveException.id)),
          updatedActiveException,
        ];
      }
    }

    await renewPlanningResourceLeases(base44, user, leases);
    if (!targetRevision) throw new ApiError(503, 'De taakrevisie ontbreekt na opslaan');
    if (!sourceIsAlternative && sourceRevision.recurrence_type === 'one_time') {
      const currentDefinition = await requireRecord(
        base44,
        'ObjectTaskDefinition',
        definition.id,
        'Objecttaak',
      );
      const mirrorMutation = currentDefinition.metadata?.last_single_occurrence_mirror_mutation;
      if (
        mirrorMutation?.idempotency_key !== context.idempotencyKey
        || mirrorMutation?.request_hash !== requestHash
      ) {
        const [definitionSeries, definitionRevisions] = await Promise.all([
          filterAllRecords(
            base44.asServiceRole.entities.ObjectTaskScheduleSeries,
            { object_task_definition_id: definition.id },
            'created_date',
          ),
          filterAllRecords(
            base44.asServiceRole.entities.ObjectTaskScheduleRevision,
            { object_task_definition_id: definition.id },
            'revision_number',
          ),
        ]);
        await casVersionUpdate(
          base44,
          'ObjectTaskDefinition',
          currentDefinition,
          versionOf(currentDefinition),
          {
            ...objectTaskDefinitionLegacyMirror(
              currentDefinition,
              definitionSeries,
              definitionRevisions,
            ),
            last_modified_by_user_id: user.id || null,
            last_modified_at: nowIso(),
            metadata: {
              ...(currentDefinition.metadata || {}),
              last_single_occurrence_mirror_mutation: {
                idempotency_key: context.idempotencyKey,
                request_hash: requestHash,
                revision_id: targetRevision.id,
                completed_at: nowIso(),
              },
            },
          },
        );
      }
    }
    let replacement: LooseRecord | null = null;
    if (cancelOccurrence) {
      const currentSource = await requireRecord(
        base44,
        'PlanningTaskOccurrence',
        occurrence.id,
        'Taakuitvoering',
      );
      if (
        currentSource.lifecycle_status !== 'superseded'
        || currentSource.superseded_by_task_occurrence_id
      ) {
        if (currentSource.lifecycle_status !== 'active') {
          throw new ApiError(409, 'De taakuitvoering is intussen vervangen; laad het rooster opnieuw');
        }
        occurrence = await casUpdate(
          base44,
          'PlanningTaskOccurrence',
          currentSource,
          revisionOf(currentSource),
          {
            lifecycle_status: 'superseded',
            superseded_by_task_occurrence_id: null,
            last_modified_by_user_id: user.id || null,
            last_modified_at: nowIso(),
            metadata: {
              ...(currentSource.metadata || {}),
              cancelled_from_planning: true,
              cancelled_from_planning_at: nowIso(),
              task_schedule_exception_id: activeException?.id || null,
            },
          },
        );
      } else {
        occurrence = currentSource;
      }
    } else {
      const targetBlueprint = scheduleSeriesBlueprints(
        definition,
        [targetSeries],
        [targetRevision],
        serviceDate,
        serviceDate,
        scheduleExceptions,
      )[0] || null;
      if (!targetBlueprint) {
        throw new ApiError(409, 'Het losse taakalternatief kon niet veilig worden opgebouwd');
      }
      const object = await requireRecord(base44, 'SurveillanceObject', occurrence.object_id, 'Object');
      const customer = await requireRecord(base44, 'Customer', occurrence.customer_id, 'Klant');
      const occurrenceContext = await objectTaskOccurrenceContext(base44, definition, object, customer);
      const desiredOccurrence = {
        ...targetBlueprint,
        ...occurrenceContext,
        last_modified_by_user_id: user.id || null,
        last_modified_at: nowIso(),
        metadata: {
          ...(occurrence.metadata || {}),
          bootstrap_source: 'ObjectTaskScheduleSeries',
          planning_alternative: Boolean(activeException),
          task_schedule_exception_id: activeException?.id || null,
          changed_from_planning_at: nowIso(),
        },
      };
      replacement = await replaceTaskOccurrenceSnapshot(
        base44,
        user,
        occurrence,
        desiredOccurrence,
      );
    }
    const currentImpact = await loadObjectTaskPlanningImpact(
      base44,
      replacement ? [occurrence, replacement] : [occurrence],
      {
        extraShiftIds: recoveryMarker?.linked_shift_ids
          || initialRecoveryMarker?.linked_shift_ids
          || initialImpact.linked_shift_ids,
      },
    );
    const shiftById = new Map(currentImpact.shifts.map(item => [String(item.id), item]));
    const segmentsByShift = new Map<string, LooseRecord[]>();
    currentImpact.segments
      .filter(item => item.status !== 'removed' && String(item.task_occurrence_id) === String(occurrence.id))
      .forEach(segment => {
        const key = String(segment.shift_id);
        segmentsByShift.set(key, [...(segmentsByShift.get(key) || []), segment]);
      });
    for (const shiftId of currentImpact.linked_shift_ids) {
      const taskSegments = segmentsByShift.get(String(shiftId)) || [];
      const shift = shiftById.get(shiftId);
      if (!shift) continue;
      await renewPlanningResourceLeases(base44, user, leases);
      await migrateTaskBoundaryImpact(
        base44,
        user,
        occurrence,
        replacement,
        shift,
        taskSegments,
        currentImpact.segments,
      );
    }

    const finalShiftIds = uniqueStrings(currentImpact.linked_shift_ids);
    const [finalSourceOccurrence, finalReplacement, finalShifts, finalSegments, finalAssignments] = await Promise.all([
      requireRecord(base44, 'PlanningTaskOccurrence', occurrence.id, 'Oorspronkelijke taakuitvoering'),
      replacement
        ? requireRecord(base44, 'PlanningTaskOccurrence', replacement.id, 'Vervangende taakuitvoering')
        : Promise.resolve(null),
      filterRecordsByValues(base44.asServiceRole.entities.PlanningShift, 'id', finalShiftIds),
      filterRecordsByValues(base44.asServiceRole.entities.PlanningShiftTaskSegment, 'shift_id', finalShiftIds, '-start_date'),
      filterRecordsByValues(base44.asServiceRole.entities.PlanningAssignment, 'shift_id', finalShiftIds),
    ]);
    const finalOccurrences: LooseRecord[] = finalReplacement
      ? [finalSourceOccurrence, finalReplacement]
      : [finalSourceOccurrence];
    const returnsAlternative = Boolean(
      activeException
      && activeException.kind === 'alternative'
      && isAlternativeObjectTaskSeries(targetSeries),
    );
    const result = {
      task_occurrences: finalOccurrences,
      shifts: finalShifts,
      segments: finalSegments,
      assignments: finalAssignments,
      removed_segment_ids: finalSegments.filter(item => item.status === 'removed').map(item => item.id),
      removed_assignment_ids: finalAssignments.filter(item => item.status === 'removed').map(item => item.id),
      task_schedule_exception: activeException,
      alternative_series: returnsAlternative ? targetSeries : null,
      alternative_revision: returnsAlternative ? targetRevision : null,
    };
    const audit = await appendAudit(base44, user, {
      action,
      resource_type: 'PlanningTaskOccurrence',
      resource_id: finalReplacement?.id || finalSourceOccurrence.id,
      before_state: {
        task_occurrence: initialOccurrence,
        source_series: initialSeries,
      },
      after_state: result,
      correlation_id: context.correlationId,
      idempotency_key: context.idempotencyKey,
      undoable: false,
      metadata: {
        request_hash: requestHash,
        source_task_occurrence_id: initialOccurrence.id,
        replacement_task_occurrence_id: finalReplacement?.id || null,
        task_schedule_exception_id: activeException?.id || null,
      },
    });
    const finalizedOccurrences = await completeSingleTaskOccurrenceMarkers(
      base44,
      finalOccurrences.map(item => item.id),
      context,
      audit.id,
    );
    const finalizedById = new Map(finalizedOccurrences.map(item => [String(item.id), item]));
    return {
      ok: true,
      ...result,
      task_occurrences: result.task_occurrences.map(item => finalizedById.get(String(item.id)) || item),
      audit_event_id: audit.id,
      undoable: false,
      undo_token: null,
    };
  });
}

type LegacySingleTaskMigrationCandidate = {
  migration_key: string;
  series: LooseRecord;
  source_revision: LooseRecord;
  single_revision: LooseRecord;
  resume_revision: LooseRecord;
  service_date: string;
  origin_occurrence_id: string | null;
  exception: LooseRecord | null;
  status: 'ready' | 'completed' | 'blocked';
  blocked_code: string | null;
  blocked_reason: string | null;
};

function detectLegacySingleTaskMigrations(
  seriesRecords: LooseRecord[],
  revisionRecords: LooseRecord[],
  exceptionRecords: LooseRecord[] = [],
) {
  const seriesById = new Map(seriesRecords.map(item => [String(item.id), item]));
  const revisionById = new Map(revisionRecords.map(item => [String(item.id), item]));
  const revisionsBySeries = new Map<string, LooseRecord[]>();
  for (const revision of revisionRecords) {
    const key = String(revision.series_id || '');
    revisionsBySeries.set(key, [...(revisionsBySeries.get(key) || []), revision]);
  }
  const candidates: LegacySingleTaskMigrationCandidate[] = [];
  for (const [seriesId, revisions] of revisionsBySeries) {
    const series = seriesById.get(seriesId);
    if (!series || isAlternativeObjectTaskSeries(series)) continue;
    const ordered = [...revisions].sort((left, right) => (
      Number(left.revision_number || 0) - Number(right.revision_number || 0)
      || String(left.id).localeCompare(String(right.id))
    ));
    const reachableIds = new Set<string>();
    let cursor = revisionById.get(String(series.current_revision_id || '')) || null;
    while (cursor && !reachableIds.has(String(cursor.id))) {
      reachableIds.add(String(cursor.id));
      cursor = revisionById.get(String(cursor.previous_revision_id || '')) || null;
    }
    const latestSinglesByDate = new Map<string, LooseRecord>();
    for (const revision of ordered) {
      if (
        revision.metadata?.planning_only_single_occurrence !== true
        || !reachableIds.has(String(revision.id))
      ) continue;
      const key = String(revision.effective_from || '');
      const current = latestSinglesByDate.get(key);
      if (!current || Number(revision.revision_number || 0) > Number(current.revision_number || 0)) {
        latestSinglesByDate.set(key, revision);
      }
    }
    for (const single of latestSinglesByDate.values()) {
      const serviceDate = String(single.effective_from || '');
      const occurrenceId = compact(single.metadata?.occurrence_id) || null;
      const migrationKey = `legacy-single-task:${series.id}:${serviceDate}:${single.id}`;
      const relatedException = exceptionRecords.find(item => (
        String(item.source_series_id || '') === String(series.id)
        && String(item.service_date || '') === serviceDate
      )) || null;
      const completed = relatedException?.status === 'active'
        && relatedException?.metadata?.legacy_single_task_migration?.migration_key === migrationKey
        && relatedException?.metadata?.legacy_single_task_migration?.phase === 'completed';
      let source = revisionById.get(String(single.previous_revision_id || '')) || null;
      const seenAncestors = new Set<string>();
      while (source && (
        source.metadata?.planning_only_single_occurrence === true
        || source.metadata?.planning_only_resume === true
        || source.metadata?.legacy_single_task_source_restore === true
      )) {
        if (seenAncestors.has(String(source.id))) {
          source = null;
          break;
        }
        seenAncestors.add(String(source.id));
        source = revisionById.get(String(source.previous_revision_id || '')) || null;
      }
      const resume = ordered.find(item => (
        item.metadata?.planning_only_resume === true
        && reachableIds.has(String(item.id))
        && Number(item.revision_number || 0) > Number(single.revision_number || 0)
        && (
          String(item.metadata?.occurrence_id || '') === String(occurrenceId || '')
          || String(item.previous_revision_id || '') === String(single.id)
        )
      )) || null;
      let blockedCode: string | null = null;
      let blockedReason: string | null = null;
      const block = (code: string, reason: string) => {
        blockedCode ||= code;
        blockedReason ||= reason;
      };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
        block('LEGACY_SINGLE_DATE_INVALID', 'De datum van de oude losse taak is ongeldig.');
      }
      if (!source || source.operation !== 'schedule') {
        block('LEGACY_SOURCE_REVISION_MISSING', 'De oorspronkelijke blauwdrukrevisie is niet eenduidig bereikbaar.');
      } else if (!['weekly', 'monthly', 'yearly'].includes(source.recurrence_type)) {
        block('LEGACY_SOURCE_NOT_REPEATING', 'De oorspronkelijke revisie bevat geen herstelbare herhaling.');
      } else if (!taskScheduleRevisionApplies(source, serviceDate)) {
        block('LEGACY_SOURCE_CADENCE_MISMATCH', 'De aangepaste datum hoort niet bij de oorspronkelijke cadans.');
      }
      if (
        single.operation !== 'schedule'
        || single.recurrence_type !== 'one_time'
        || (single.recurrence_end_date && single.recurrence_end_date !== serviceDate)
        || !single.start_time
        || !single.end_time
      ) {
        block('LEGACY_SINGLE_REVISION_INVALID', 'De oude losse taakrevisie heeft geen veilig herstelbaar tijdvenster.');
      }
      if (!resume) {
        block('LEGACY_RESUME_REVISION_MISSING', 'De oude hervattingsrevisie ontbreekt of is niet aan deze losse taak gekoppeld.');
      }
      const laterUnexpected = ordered.find(item => (
        reachableIds.has(String(item.id))
        && Number(item.revision_number || 0) > Number(single.revision_number || 0)
        && item.metadata?.planning_only_resume !== true
        && item.metadata?.planning_only_single_occurrence !== true
        && item.metadata?.legacy_single_task_source_restore !== true
      ));
      if (!completed && laterUnexpected) {
        block('LEGACY_NEWER_BLUEPRINT_REVISION', 'Na de oude planningbewerking bestaat een nieuwere blauwdrukrevisie; automatisch herschrijven is niet veilig.');
      }
      if (relatedException && (
        relatedException.metadata?.legacy_single_task_migration?.migration_key !== migrationKey
        || !['pending', 'active'].includes(relatedException.status)
      )) {
        block('LEGACY_EXCEPTION_CONFLICT', 'Voor deze datum bestaat al een andere taakuitzondering.');
      }
      candidates.push({
        migration_key: migrationKey,
        series,
        source_revision: source || {},
        single_revision: single,
        resume_revision: resume || {},
        service_date: serviceDate,
        origin_occurrence_id: occurrenceId,
        exception: relatedException,
        status: completed ? 'completed' : blockedCode ? 'blocked' : 'ready',
        blocked_code: blockedCode,
        blocked_reason: blockedReason,
      });
    }
  }
  return candidates.sort((left, right) => (
    left.service_date.localeCompare(right.service_date)
    || left.migration_key.localeCompare(right.migration_key)
  ));
}

function legacyMigrationReport(
  candidate: LegacySingleTaskMigrationCandidate,
  status: 'migrated' | 'completed' | 'blocked',
  details: LooseRecord = {},
) {
  return {
    migration_key: candidate.migration_key,
    status,
    source_series_id: candidate.series.id,
    source_revision_id: candidate.source_revision.id || null,
    single_revision_id: candidate.single_revision.id,
    resume_revision_id: candidate.resume_revision.id || null,
    service_date: candidate.service_date,
    origin_occurrence_id: candidate.origin_occurrence_id,
    ...details,
  };
}

async function migrateLegacySinglePlanningTasks(
  base44: LooseRecord,
  user: LooseRecord,
  bootstrapContext: ReturnType<typeof mutationContext>,
  snapshot: {
    series: LooseRecord[];
    revisions: LooseRecord[];
    exceptions: LooseRecord[];
    occurrences: LooseRecord[];
  },
) {
  const reports: LooseRecord[] = [];
  const candidates = detectLegacySingleTaskMigrations(
    snapshot.series,
    snapshot.revisions,
    snapshot.exceptions,
  );
  for (const candidate of candidates) {
    if (candidate.status === 'completed') {
      reports.push(legacyMigrationReport(candidate, 'completed', {
        exception_id: candidate.exception?.id || null,
        alternative_series_id: candidate.exception?.alternative_series_id || null,
      }));
      continue;
    }
    if (candidate.status === 'blocked') {
      reports.push(legacyMigrationReport(candidate, 'blocked', {
        code: candidate.blocked_code,
        reason: candidate.blocked_reason,
      }));
      continue;
    }
    const sourceOccurrences = snapshot.occurrences.filter(item => (
      String(item.object_task_schedule_series_id || '') === String(candidate.series.id)
      && item.service_date === candidate.service_date
    ));
    const activeSourceOccurrences = sourceOccurrences.filter(item => item.lifecycle_status === 'active');
    if (activeSourceOccurrences.length > 1) {
      reports.push(legacyMigrationReport(candidate, 'blocked', {
        code: 'LEGACY_MULTIPLE_ACTIVE_OCCURRENCES',
        reason: 'Er bestaan meerdere actieve taakuitvoeringen voor dezelfde oude taakdatum.',
        occurrence_ids: activeSourceOccurrences.map(item => item.id),
      }));
      continue;
    }
    const sourceOccurrence = activeSourceOccurrences[0]
      || sourceOccurrences.find(item => String(item.id) === String(candidate.origin_occurrence_id || ''))
      || null;
    let existingReplacementOccurrence: LooseRecord | null = null;
    if (
      sourceOccurrence?.lifecycle_status === 'superseded'
      && sourceOccurrence.superseded_by_task_occurrence_id
    ) {
      existingReplacementOccurrence = snapshot.occurrences.find(item => (
        String(item.id) === String(sourceOccurrence.superseded_by_task_occurrence_id)
      )) || null;
      const replacementSeries = snapshot.series.find(item => (
        String(item.id) === String(existingReplacementOccurrence?.object_task_schedule_series_id || '')
      ));
      if (
        !existingReplacementOccurrence
        || replacementSeries?.metadata?.migration_key !== candidate.migration_key
      ) {
        reports.push(legacyMigrationReport(candidate, 'blocked', {
          code: 'LEGACY_OCCURRENCE_REPLACEMENT_CONFLICT',
          reason: 'De oude taakuitvoering is al door een andere mutatie vervangen.',
          occurrence_id: sourceOccurrence.id,
          replacement_occurrence_id: sourceOccurrence.superseded_by_task_occurrence_id,
        }));
        continue;
      }
    }
    if (!existingReplacementOccurrence && candidate.exception?.alternative_series_id) {
      existingReplacementOccurrence = snapshot.occurrences.find(item => (
        String(item.object_task_schedule_series_id || '')
          === String(candidate.exception?.alternative_series_id || '')
        && item.service_date === candidate.service_date
        && item.lifecycle_status === 'active'
      )) || null;
    }
    const durableLegacyShiftIds = uniqueStrings(
      [
        ...normalizeArray(
          candidate.exception?.metadata?.legacy_single_task_migration?.linked_shift_ids,
        ),
        ...(candidate.series.metadata?.legacy_single_task_migration_journal?.migration_key
          === candidate.migration_key
          ? normalizeArray(
              candidate.series.metadata?.legacy_single_task_migration_journal?.linked_shift_ids,
            )
          : []),
      ],
    );
    const initialImpactOccurrences = [sourceOccurrence, existingReplacementOccurrence]
      .filter(Boolean) as LooseRecord[];
    const initialImpact = sourceOccurrence
      ? await loadObjectTaskPlanningImpact(base44, initialImpactOccurrences, {
          extraShiftIds: durableLegacyShiftIds,
        })
      : { segments: [], shifts: [], linked_shift_ids: [] };
    const sourceSegments = sourceOccurrence
      ? initialImpact.segments.filter(item => (
          item.status !== 'removed'
          && String(item.task_occurrence_id) === String(sourceOccurrence.id)
        ))
      : [];
    const knownShiftIds = new Set(initialImpact.shifts.map(item => String(item.id)));
    const missingShiftIds = uniqueStrings(sourceSegments
      .map(item => item.shift_id)
      .filter(id => !knownShiftIds.has(String(id))));
    if (missingShiftIds.length) {
      reports.push(legacyMigrationReport(candidate, 'blocked', {
        code: 'LEGACY_LINKED_SHIFT_MISSING',
        reason: 'Minimaal één gekoppelde dienst ontbreekt; de taakuitvoering is niet automatisch gemigreerd.',
        shift_ids: missingShiftIds,
      }));
      continue;
    }
    const cancelledShiftIds = uniqueStrings(initialImpact.shifts
      .filter(shift => (
        initialImpact.linked_shift_ids.includes(String(shift.id))
        && shift.status === 'cancelled'
      ))
      .map(shift => shift.id));
    if (cancelledShiftIds.length) {
      reports.push(legacyMigrationReport(candidate, 'blocked', {
        code: 'LEGACY_CANCELLED_SHIFT_CONFLICT',
        reason: 'Een geannuleerde dienst bevat nog actieve taaksegmenten; handmatige controle is vereist.',
        shift_ids: cancelledShiftIds,
      }));
      continue;
    }
    const sourceInterval = sourceOccurrence && normalizedPeriodInterval(
      sourceOccurrence.service_date,
      sourceOccurrence.window_start_time,
      sourceOccurrence.window_end_time,
    );
    const legacyInterval = normalizedPeriodInterval(
      candidate.service_date,
      candidate.single_revision.start_time,
      candidate.single_revision.end_time,
    );
    if (sourceSegments.length && (
      !sourceInterval?.interval
      || !legacyInterval?.interval
      || sourceInterval.interval.start !== legacyInterval.interval.start
      || sourceInterval.interval.end !== legacyInterval.interval.end
    )) {
      reports.push(legacyMigrationReport(candidate, 'blocked', {
        code: 'LEGACY_OCCURRENCE_SNAPSHOT_MISMATCH',
        reason: 'De geplande uitvoering wijkt af van de oude losse revisie; handmatige controle is vereist.',
      }));
      continue;
    }
    const initialAssignments = await filterRecordsByValues(
      base44.asServiceRole.entities.PlanningAssignment,
      'shift_id',
      initialImpact.linked_shift_ids,
    );
    const migrationHash = await sha256(candidate.migration_key);
    const migrationContext = {
      idempotencyKey: `legacy-single:${migrationHash.slice(0, 48)}`,
      correlationId: bootstrapContext.correlationId,
    };
    const requestHash = await sha256(stableStringify({
      migration_key: candidate.migration_key,
      source_revision_id: candidate.source_revision.id,
      single_revision_id: candidate.single_revision.id,
      resume_revision_id: candidate.resume_revision.id,
    }));
    const exceptionIdentity = `${candidate.series.id}:${candidate.service_date}`;
    const descriptors: LooseRecord[] = [
      await resourceCoordinatorDescriptor('object_task_definition', candidate.series.object_task_definition_id),
      await resourceCoordinatorDescriptor('object_task_series', candidate.series.id),
      await resourceCoordinatorDescriptor('object_task_exception', exceptionIdentity),
      ...await Promise.all(initialImpact.linked_shift_ids.map(id => (
        resourceCoordinatorDescriptor('shift_composition', id)
      ))),
    ];
    if (sourceOccurrence) {
      descriptors.push(await resourceCoordinatorDescriptor('task_occurrence', sourceOccurrence.id));
    }
    if (existingReplacementOccurrence) {
      descriptors.push(await resourceCoordinatorDescriptor(
        'task_occurrence',
        existingReplacementOccurrence.id,
      ));
    }
    descriptors.push(...await personnelDayDescriptors(
      initialAssignments.filter(item => item.status !== 'removed').map(item => item.personnel_id),
      initialImpact.shifts,
    ));
    try {
      const migrated = await withPlanningResourceLeases(
        base44,
        user,
        migrationContext,
        requestHash,
        descriptors,
        async leases => {
          let sourceSeries = await requireRecord(
            base44,
            'ObjectTaskScheduleSeries',
            candidate.series.id,
            'Oude taakreeks',
          );
          const definition = await requireRecord(
            base44,
            'ObjectTaskDefinition',
            sourceSeries.object_task_definition_id,
            'Objecttaak',
          );
          const currentRevisions = await filterAllRecords(
            base44.asServiceRole.entities.ObjectTaskScheduleRevision,
            { series_id: sourceSeries.id },
            'revision_number',
          );
          if (sourceOccurrence) {
            const lockedOccurrence = await requireRecord(
              base44,
              'PlanningTaskOccurrence',
              sourceOccurrence.id,
              'Oude taakuitvoering',
            );
            const lockedImpact = await loadObjectTaskPlanningImpact(base44, [lockedOccurrence], {
              extraShiftIds: initialImpact.linked_shift_ids,
            });
            const lockedAssignments = await filterRecordsByValues(
              base44.asServiceRole.entities.PlanningAssignment,
              'shift_id',
              lockedImpact.linked_shift_ids,
            );
            const compositionFingerprint = (
              occurrence: LooseRecord,
              impact: LooseRecord,
              assignments: LooseRecord[],
            ) => stableStringify({
              occurrence: pick(occurrence, [
                'id',
                'revision',
                'lifecycle_status',
                'superseded_by_task_occurrence_id',
              ]),
              shifts: normalizeArray<LooseRecord>(impact.shifts)
                .map(item => pick(item, ['id', 'revision', 'status', 'start_time', 'end_time']))
                .sort((left, right) => String(left.id).localeCompare(String(right.id))),
              segments: normalizeArray<LooseRecord>(impact.segments)
                .filter(item => (
                  item.status !== 'removed'
                  && String(item.task_occurrence_id) === String(occurrence.id)
                ))
                .map(item => pick(item, [
                  'id', 'revision', 'status', 'shift_id', 'start_date', 'end_date', 'start_time', 'end_time',
                ]))
                .sort((left, right) => String(left.id).localeCompare(String(right.id))),
              assignments: assignments
                .filter(item => item.status !== 'removed')
                .map(item => pick(item, ['id', 'revision', 'status', 'shift_id', 'personnel_id', 'slot_index']))
                .sort((left, right) => String(left.id).localeCompare(String(right.id))),
            });
            if (
              compositionFingerprint(sourceOccurrence, initialImpact, initialAssignments)
              !== compositionFingerprint(lockedOccurrence, lockedImpact, lockedAssignments)
            ) {
              throw new ApiError(409, 'De diensten bij de oude taak zijn intussen gewijzigd', {
                code: 'LEGACY_COMPOSITION_CHANGED_DURING_MIGRATION',
                occurrence_id: sourceOccurrence.id,
              });
            }
          }
          const currentUnexpected = currentRevisions.find(item => (
            Number(item.revision_number || 0) > Number(candidate.single_revision.revision_number || 0)
            && item.metadata?.planning_only_resume !== true
            && item.metadata?.planning_only_single_occurrence !== true
            && item.metadata?.legacy_single_task_source_restore !== true
          ));
          if (currentUnexpected) {
            throw new ApiError(409, 'Een nieuwere blauwdrukrevisie blokkeert de automatische legacy-migratie', {
              code: 'LEGACY_NEWER_BLUEPRINT_REVISION',
              revision_id: currentUnexpected.id,
            });
          }
          const existingLegacyJournal = sourceSeries.metadata
            ?.legacy_single_task_migration_journal;
          const existingJournalCompleted = existingLegacyJournal
            && existingLegacyJournal.phase !== 'completed'
            && (await filterAllRecords(
              base44.asServiceRole.entities.ObjectTaskScheduleException,
              { object_id: sourceSeries.object_id },
              '-created_date',
            )).some(item => (
              item.status === 'active'
              && String(item.source_series_id || '') === String(sourceSeries.id)
              && item.metadata?.legacy_single_task_migration?.phase === 'completed'
              && item.metadata?.legacy_single_task_migration?.migration_key
                === existingLegacyJournal.migration_key
            ));
          if (
            existingLegacyJournal
            && existingLegacyJournal.phase !== 'completed'
            && !existingJournalCompleted
            && existingLegacyJournal.migration_key !== candidate.migration_key
          ) {
            throw new ApiError(409, 'Een andere legacy-taakmigratie op deze reeks moet eerst worden hersteld', {
              code: 'LEGACY_SERIES_MIGRATION_RECOVERY_PENDING',
              migration_key: existingLegacyJournal.migration_key || null,
            });
          }
          const journalLinkedShiftIds = uniqueStrings([
            ...(existingLegacyJournal?.migration_key === candidate.migration_key
              ? normalizeArray(existingLegacyJournal?.linked_shift_ids)
              : []),
            ...initialImpact.linked_shift_ids,
          ]);
          if (
            existingLegacyJournal?.migration_key !== candidate.migration_key
            || existingLegacyJournal?.phase !== 'prepared'
            || stableStringify(uniqueStrings(existingLegacyJournal?.linked_shift_ids).sort())
              !== stableStringify([...journalLinkedShiftIds].sort())
          ) {
            sourceSeries = await casVersionUpdate(
              base44,
              'ObjectTaskScheduleSeries',
              sourceSeries,
              versionOf(sourceSeries),
              {
                metadata: {
                  ...(sourceSeries.metadata || {}),
                  legacy_single_task_migration_journal: {
                    ...(existingLegacyJournal?.migration_key === candidate.migration_key
                      ? existingLegacyJournal
                      : {}),
                    migration_key: candidate.migration_key,
                    phase: 'prepared',
                    service_date: candidate.service_date,
                    source_occurrence_id: sourceOccurrence?.id || null,
                    linked_shift_ids: journalLinkedShiftIds,
                    prepared_at: existingLegacyJournal?.migration_key === candidate.migration_key
                      ? existingLegacyJournal.prepared_at || nowIso()
                      : nowIso(),
                  },
                },
                last_modified_by_user_id: user.id || null,
                last_modified_at: nowIso(),
              },
            );
          }
          const restoreStorageKey = await deterministicTaskStorageKey(
            `${candidate.migration_key}:source-restore`,
          );
          let restoreRevision = (await filterAllRecords(
            base44.asServiceRole.entities.ObjectTaskScheduleRevision,
            { creation_idempotency_key: restoreStorageKey },
            'created_date',
          )).sort(coordinatorOrder)[0] || null;
          if (!restoreRevision) {
            const source = candidate.source_revision;
            const restoreBlock = {
              effective_from: candidate.service_date,
              recurrence_anchor_date: source.recurrence_anchor_date
                || source.metadata?.recurrence_anchor_date
                || source.effective_from,
              recurrence_type: source.recurrence_type,
              recurrence_interval: Number(
                source.recurrence_interval || source.metadata?.recurrence_interval || 1,
              ),
              weekday: source.weekday,
              start_time: source.start_time,
              end_time: source.end_time,
              recurrence_end_date: source.recurrence_end_date || null,
            };
            const previousRevision = sourceSeries.current_revision_id
              ? currentRevisions.find(item => String(item.id) === String(sourceSeries.current_revision_id)) || null
              : null;
            const payload = await scheduleRevisionPayload(
              user,
              migrationContext,
              requestHash,
              definition,
              sourceSeries,
              restoreBlock,
              Number(sourceSeries.current_revision_number || previousRevision?.revision_number || 0) + 1,
              previousRevision,
              'schedule',
              restoreStorageKey,
              source.task_snapshot || null,
            );
            restoreRevision = await base44.asServiceRole.entities.ObjectTaskScheduleRevision.create({
              ...payload,
              metadata: {
                ...(payload.metadata || {}),
                legacy_single_task_source_restore: true,
                migration_key: candidate.migration_key,
                source_revision_id: source.id,
                replaced_single_revision_id: candidate.single_revision.id,
                replaced_resume_revision_id: candidate.resume_revision.id,
              },
            });
          }
          if (String(sourceSeries.current_revision_id || '') !== String(restoreRevision.id)) {
            const current = await getRecord(
              base44,
              'ObjectTaskScheduleRevision',
              sourceSeries.current_revision_id,
            );
            if (
              Number(current?.revision_number || 0) < Number(restoreRevision.revision_number || 0)
            ) {
              sourceSeries = await advanceTaskScheduleSeriesRevision(
                base44,
                user,
                sourceSeries,
                restoreRevision,
              );
            } else if (current?.metadata?.legacy_single_task_source_restore !== true) {
              throw new ApiError(409, 'De taakreeks is na voorbereiding gewijzigd', {
                code: 'LEGACY_SERIES_CHANGED_DURING_MIGRATION',
              });
            }
          }

          const exceptionKey = `object-task-exception:${(await sha256(exceptionIdentity)).slice(0, 48)}`;
          const alternativeStorageKey = await deterministicTaskStorageKey(
            `${candidate.migration_key}:alternative-series`,
          );
          let alternativeSeries = (await filterAllRecords(
            base44.asServiceRole.entities.ObjectTaskScheduleSeries,
            { creation_idempotency_key: alternativeStorageKey },
            'created_date',
          )).sort(coordinatorOrder)[0] || null;
          if (!alternativeSeries) {
            alternativeSeries = await base44.asServiceRole.entities.ObjectTaskScheduleSeries.create({
              series_key: `ots-alt-legacy-${migrationHash.slice(0, 17)}`,
              customer_id: sourceSeries.customer_id,
              object_id: sourceSeries.object_id,
              object_task_definition_id: sourceSeries.object_task_definition_id,
              current_revision_id: null,
              current_revision_number: 0,
              status: 'active',
              timezone: 'Europe/Amsterdam',
              creation_idempotency_key: alternativeStorageKey,
              creation_request_fingerprint: requestHash,
              creation_actor_user_id: user.id || null,
              version: 1,
              last_modified_by_user_id: user.id || null,
              last_modified_at: nowIso(),
              metadata: {
                schedule_kind: 'alternative',
                alternative: true,
                planning_alternative: true,
                legacy_single_task_migration: true,
                migration_key: candidate.migration_key,
                exception_key: exceptionKey,
                source_series_id: sourceSeries.id,
                source_series_key: sourceSeries.series_key,
                origin_occurrence_id: candidate.origin_occurrence_id,
              },
            });
          }
          const alternativeRevisionStorageKey = await deterministicTaskStorageKey(
            `${candidate.migration_key}:alternative-revision`,
          );
          let alternativeRevision = (await filterAllRecords(
            base44.asServiceRole.entities.ObjectTaskScheduleRevision,
            { creation_idempotency_key: alternativeRevisionStorageKey },
            'created_date',
          )).sort(coordinatorOrder)[0] || null;
          if (!alternativeRevision) {
            const single = candidate.single_revision;
            const alternativeBlock = {
              effective_from: candidate.service_date,
              recurrence_anchor_date: candidate.service_date,
              recurrence_type: 'one_time',
              recurrence_interval: 1,
              weekday: isoWeekday(candidate.service_date),
              start_time: single.start_time,
              end_time: single.end_time,
              recurrence_end_date: candidate.service_date,
            };
            const payload = await scheduleRevisionPayload(
              user,
              migrationContext,
              requestHash,
              definition,
              alternativeSeries,
              alternativeBlock,
              1,
              null,
              'schedule',
              alternativeRevisionStorageKey,
              single.task_snapshot || candidate.source_revision.task_snapshot || null,
            );
            alternativeRevision = await base44.asServiceRole.entities.ObjectTaskScheduleRevision.create({
              ...payload,
              metadata: {
                ...(payload.metadata || {}),
                legacy_single_task_alternative: true,
                migration_key: candidate.migration_key,
                legacy_single_revision_id: single.id,
              },
            });
          }
          alternativeSeries = await advanceTaskScheduleSeriesRevision(
            base44,
            user,
            alternativeSeries,
            alternativeRevision,
          );

          const exceptionStorageKey = await deterministicTaskStorageKey(
            `${candidate.migration_key}:exception`,
          );
          const dateExceptions = await filterAllRecords(
            base44.asServiceRole.entities.ObjectTaskScheduleException,
            { service_date: candidate.service_date },
            'created_date',
          );
          let scheduleException = dateExceptions.find(item => (
            String(item.source_series_id || '') === String(sourceSeries.id)
          )) || null;
          if (!scheduleException) {
            scheduleException = await base44.asServiceRole.entities.ObjectTaskScheduleException.create({
              exception_key: exceptionKey,
              customer_id: sourceSeries.customer_id,
              object_id: sourceSeries.object_id,
              object_task_definition_id: sourceSeries.object_task_definition_id,
              source_series_id: sourceSeries.id,
              source_series_key: sourceSeries.series_key,
              source_revision_id: candidate.source_revision.id,
              source_logical_key: `object-task-series:${sourceSeries.series_key}:${candidate.service_date}`,
              service_date: candidate.service_date,
              kind: 'alternative',
              alternative_series_id: alternativeSeries.id,
              alternative_series_key: alternativeSeries.series_key,
              alternative_revision_id: alternativeRevision.id,
              status: 'pending',
              creation_idempotency_key: exceptionStorageKey,
              creation_request_fingerprint: requestHash,
              creation_actor_user_id: user.id || null,
              created_by_user_id: user.id || null,
              created_at: nowIso(),
              version: 1,
              last_modified_by_user_id: user.id || null,
              last_modified_at: nowIso(),
              metadata: {
                legacy_single_task_migration: {
                  migration_key: candidate.migration_key,
                  phase: 'prepared',
                  prepared_at: nowIso(),
                  source_occurrence_id: sourceOccurrence?.id || null,
                  linked_shift_ids: journalLinkedShiftIds,
                },
                origin_occurrence_id: candidate.origin_occurrence_id,
              },
            });
          }
          if (!scheduleException) {
            throw new ApiError(503, 'De legacy-taakuitzondering kon niet worden voorbereid');
          }
          let preparedException: LooseRecord = scheduleException;
          if (
            preparedException.metadata?.legacy_single_task_migration?.migration_key !== candidate.migration_key
            || String(preparedException.alternative_series_id || '') !== String(alternativeSeries.id)
          ) {
            throw new ApiError(409, 'De bestaande taakuitzondering hoort bij een andere wijziging', {
              code: 'LEGACY_EXCEPTION_CONFLICT',
              exception_id: preparedException.id,
            });
          }
          const preparedMigrationState = preparedException.metadata?.legacy_single_task_migration || {};
          const preparedLinkedShiftIds = uniqueStrings([
            ...normalizeArray(preparedMigrationState.linked_shift_ids),
            ...journalLinkedShiftIds,
          ]);
          if (
            stableStringify(uniqueStrings(preparedMigrationState.linked_shift_ids).sort())
              !== stableStringify([...preparedLinkedShiftIds].sort())
            || preparedMigrationState.source_occurrence_id !== (sourceOccurrence?.id || null)
          ) {
            preparedException = await casVersionUpdate(
              base44,
              'ObjectTaskScheduleException',
              preparedException,
              versionOf(preparedException),
              {
                metadata: {
                  ...(preparedException.metadata || {}),
                  legacy_single_task_migration: {
                    ...preparedMigrationState,
                    migration_key: candidate.migration_key,
                    phase: 'prepared',
                    prepared_at: preparedMigrationState.prepared_at || nowIso(),
                    source_occurrence_id: sourceOccurrence?.id || null,
                    linked_shift_ids: preparedLinkedShiftIds,
                  },
                },
                last_modified_by_user_id: user.id || null,
                last_modified_at: nowIso(),
              },
            );
          }

          await renewPlanningResourceLeases(base44, user, leases);
          const object = await requireRecord(base44, 'SurveillanceObject', sourceSeries.object_id, 'Object');
          const customer = await requireRecord(base44, 'Customer', sourceSeries.customer_id, 'Klant');
          const occurrenceContext = await objectTaskOccurrenceContext(
            base44,
            definition,
            object,
            customer,
          );
          const projectionException = {
            ...preparedException,
            status: 'active',
            alternative_series_id: alternativeSeries.id,
            alternative_revision_id: alternativeRevision.id,
          };
          const blueprint = scheduleSeriesBlueprints(
            definition,
            [alternativeSeries],
            [alternativeRevision],
            candidate.service_date,
            candidate.service_date,
            [projectionException],
          )[0] || null;
          if (!blueprint) {
            throw new ApiError(409, 'Het legacy-alternatief kan niet veilig worden geprojecteerd', {
              code: 'LEGACY_ALTERNATIVE_PROJECTION_FAILED',
            });
          }
          const desiredOccurrence: LooseRecord = {
            ...blueprint,
            ...occurrenceContext,
            lifecycle_status: 'active',
            last_modified_by_user_id: user.id || null,
            last_modified_at: nowIso(),
            metadata: {
              bootstrap_source: 'ObjectTaskScheduleSeries',
              planning_alternative: true,
              task_schedule_exception_id: preparedException.id,
              legacy_single_task_migration: candidate.migration_key,
            },
          };
          const alternativeOccurrences = await filterAllRecords(
            base44.asServiceRole.entities.PlanningTaskOccurrence,
            { object_task_schedule_series_id: alternativeSeries.id },
            '-service_date',
          );
          const activeAlternatives = alternativeOccurrences.filter(item => (
            item.lifecycle_status === 'active' && item.service_date === candidate.service_date
          ));
          if (activeAlternatives.length > 1) {
            throw new ApiError(409, 'Er bestaan meerdere actieve alternatieven voor de legacy-taak', {
              code: 'LEGACY_MULTIPLE_ACTIVE_ALTERNATIVES',
              occurrence_ids: activeAlternatives.map(item => item.id),
            });
          }
          let replacementOccurrence = activeAlternatives[0] || null;
          if (replacementOccurrence) {
            const mismatchedFields = TASK_OCCURRENCE_COMPARABLE_FIELDS.filter(field => (
              stableStringify(replacementOccurrence[field] ?? null)
              !== stableStringify(desiredOccurrence[field] ?? null)
            ));
            if (mismatchedFields.length) {
              throw new ApiError(409, 'Het bestaande legacy-alternatief wijkt af', {
                code: 'LEGACY_ALTERNATIVE_OCCURRENCE_CONFLICT',
                occurrence_id: replacementOccurrence.id,
                mismatched_fields: mismatchedFields,
              });
            }
          } else {
            replacementOccurrence = await base44.asServiceRole.entities.PlanningTaskOccurrence.create({
              ...desiredOccurrence,
              supersedes_task_occurrence_id: sourceOccurrence?.id || null,
              superseded_by_task_occurrence_id: null,
              revision: 1,
              published_revision: 0,
              last_published_correlation_id: null,
            });
          }
          if (!replacementOccurrence) {
            throw new ApiError(503, 'De alternatieve taakuitvoering kon niet worden voorbereid');
          }
          const targetOccurrence: LooseRecord = replacementOccurrence;

          let freshSourceOccurrence = sourceOccurrence
            ? await getRecord(base44, 'PlanningTaskOccurrence', sourceOccurrence.id)
            : null;
          if (freshSourceOccurrence) {
            const lockedImpact = await loadObjectTaskPlanningImpact(
              base44,
              [freshSourceOccurrence, targetOccurrence],
              { extraShiftIds: preparedLinkedShiftIds },
            );
            const shiftById = new Map(lockedImpact.shifts.map(item => [String(item.id), item]));
            const linkedByShift = new Map<string, LooseRecord[]>();
            lockedImpact.segments
              .filter(item => (
                item.status !== 'removed'
                && String(item.task_occurrence_id) === String(freshSourceOccurrence.id)
              ))
              .forEach(item => {
                const key = String(item.shift_id);
                linkedByShift.set(key, [...(linkedByShift.get(key) || []), item]);
              });
            for (const shiftId of preparedLinkedShiftIds) {
              const shift = shiftById.get(shiftId);
              if (!shift) {
                throw new ApiError(409, 'Een gekoppelde dienst verdween tijdens de legacy-migratie', {
                  code: 'LEGACY_LINKED_SHIFT_MISSING',
                  shift_id: shiftId,
                });
              }
              const linked = linkedByShift.get(shiftId) || [];
              await renewPlanningResourceLeases(base44, user, leases);
              await migrateTaskBoundaryImpact(
                base44,
                user,
                freshSourceOccurrence,
                targetOccurrence,
                shift,
                linked,
                lockedImpact.segments,
              );
            }
            freshSourceOccurrence = await requireRecord(
              base44,
              'PlanningTaskOccurrence',
              freshSourceOccurrence.id,
              'Oude taakuitvoering',
            );
            if (
              freshSourceOccurrence.lifecycle_status === 'active'
              || (
                freshSourceOccurrence.lifecycle_status === 'superseded'
                && !freshSourceOccurrence.superseded_by_task_occurrence_id
              )
            ) {
              await casUpdate(
                base44,
                'PlanningTaskOccurrence',
                freshSourceOccurrence,
                revisionOf(freshSourceOccurrence),
                {
                  lifecycle_status: 'superseded',
                  superseded_by_task_occurrence_id: targetOccurrence.id,
                  last_modified_by_user_id: user.id || null,
                  last_modified_at: nowIso(),
                  metadata: {
                    ...(freshSourceOccurrence.metadata || {}),
                    superseded_by_legacy_single_task_migration: candidate.migration_key,
                  },
                },
              );
            } else if (
              freshSourceOccurrence.lifecycle_status === 'superseded'
              && String(freshSourceOccurrence.superseded_by_task_occurrence_id || '')
                !== String(targetOccurrence.id)
            ) {
              throw new ApiError(409, 'De oude taakuitvoering is door een andere mutatie vervangen', {
                code: 'LEGACY_OCCURRENCE_REPLACEMENT_CONFLICT',
                occurrence_id: freshSourceOccurrence.id,
              });
            }
          }
          let currentException = await requireRecord(
            base44,
            'ObjectTaskScheduleException',
            preparedException.id,
            'Taakuitzondering',
          );
          if (
            currentException.status !== 'active'
            || currentException.metadata?.legacy_single_task_migration?.phase !== 'completed'
          ) {
            currentException = await casVersionUpdate(
              base44,
              'ObjectTaskScheduleException',
              currentException,
              versionOf(currentException),
              {
                source_revision_id: candidate.source_revision.id,
                alternative_series_id: alternativeSeries.id,
                alternative_series_key: alternativeSeries.series_key,
                alternative_revision_id: alternativeRevision.id,
                status: 'active',
                last_modified_by_user_id: user.id || null,
                last_modified_at: nowIso(),
                metadata: {
                  ...(currentException.metadata || {}),
                  legacy_single_task_migration: {
                    ...(currentException.metadata?.legacy_single_task_migration || {}),
                    migration_key: candidate.migration_key,
                    phase: 'completed',
                    completed_at: nowIso(),
                    source_restore_revision_id: restoreRevision.id,
                    alternative_occurrence_id: targetOccurrence.id,
                  },
                },
              },
            );
          }
          sourceSeries = await requireRecord(
            base44,
            'ObjectTaskScheduleSeries',
            sourceSeries.id,
            'Oude taakreeks',
          );
          const finalLegacyJournal = sourceSeries.metadata
            ?.legacy_single_task_migration_journal;
          if (finalLegacyJournal?.migration_key !== candidate.migration_key) {
            throw new ApiError(409, 'De legacy-taakmigratiejournal is tijdens afronding gewijzigd', {
              code: 'LEGACY_SERIES_MIGRATION_JOURNAL_CHANGED',
              source_series_id: sourceSeries.id,
            });
          }
          if (finalLegacyJournal.phase !== 'completed') {
            sourceSeries = await casVersionUpdate(
              base44,
              'ObjectTaskScheduleSeries',
              sourceSeries,
              versionOf(sourceSeries),
              {
                metadata: {
                  ...(sourceSeries.metadata || {}),
                  legacy_single_task_migration_journal: {
                    ...finalLegacyJournal,
                    phase: 'completed',
                    exception_id: currentException.id,
                    completed_at: nowIso(),
                  },
                },
                last_modified_by_user_id: user.id || null,
                last_modified_at: nowIso(),
              },
            );
          }
          return {
            source_restore_revision_id: restoreRevision.id,
            exception_id: currentException.id,
            alternative_series_id: alternativeSeries.id,
            alternative_revision_id: alternativeRevision.id,
            alternative_occurrence_id: targetOccurrence.id,
          };
        },
      );
      reports.push(legacyMigrationReport(candidate, 'migrated', migrated));
    } catch (error) {
      reports.push(legacyMigrationReport(candidate, 'blocked', {
        code: compact((error as any)?.details?.code) || 'LEGACY_MIGRATION_FAILED_CLOSED',
        reason: compact((error as Error)?.message) || 'De oude planningbewerking kon niet veilig worden gemigreerd.',
        details: (error as any)?.details || null,
      }));
    }
  }
  return reports;
}

async function bootstrapRange(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  requireMutationIdempotency(context, 'bootstrap_range');
  const requestHash = await mutationRequestHash('bootstrap_range', body);
  const replay = await findReplay(base44, 'bootstrap_range', context.idempotencyKey);
  if (replay) {
    assertReplayFingerprint(replay, user, requestHash, 'bootstrap_range');
    return replayResult(replay);
  }

  const periodStart = asDate(body.period_start, 'period_start');
  const periodEnd = asDate(body.period_end, 'period_end');
  if (periodEnd < periodStart) throw new ApiError(400, 'period_end ligt voor period_start');
  if (dateOrdinal(periodEnd) - dateOrdinal(periodStart) > 62) {
    throw new ApiError(400, 'Een planningsrange mag maximaal 63 dagen bevatten');
  }
  const seriesImpactRecoveryReports = await recoverPendingObjectTaskSeriesImpactMutations(
    base44,
    user,
  );

  let [
    executions,
    routes,
    tasks,
    objects,
    customers,
    existingShifts,
    existingAssignments,
    objectTaskDefinitions,
    objectTaskScheduleSeries,
    objectTaskScheduleRevisions,
    objectTaskScheduleExceptions,
    securityPlans,
    securityPlanRevisions,
    existingOccurrences,
    existingTaskSegments,
    existingTaskSourceChanges,
  ] = await Promise.all([
    listAllRecords(base44.asServiceRole.entities.RouteExecution, '-service_date'),
    listAllRecords(base44.asServiceRole.entities.Route),
    listAllRecords(base44.asServiceRole.entities.Task),
    listAllRecords(base44.asServiceRole.entities.SurveillanceObject),
    listAllRecords(base44.asServiceRole.entities.Customer),
    listAllRecords(base44.asServiceRole.entities.PlanningShift),
    listAllRecords(base44.asServiceRole.entities.PlanningAssignment),
    listAllRecords(base44.asServiceRole.entities.ObjectTaskDefinition, '-updated_date'),
    listAllRecords(base44.asServiceRole.entities.ObjectTaskScheduleSeries, 'created_date'),
    listAllRecords(base44.asServiceRole.entities.ObjectTaskScheduleRevision, '-revision_number'),
    listAllRecords(base44.asServiceRole.entities.ObjectTaskScheduleException, '-service_date'),
    listAllRecords(base44.asServiceRole.entities.ObjectSecurityPlan, '-updated_date'),
    listAllRecords(base44.asServiceRole.entities.ObjectSecurityPlanRevision, '-revision_number'),
    listAllRecords(base44.asServiceRole.entities.PlanningTaskOccurrence, '-service_date'),
    listAllRecords(base44.asServiceRole.entities.PlanningShiftTaskSegment, '-start_date'),
    listAllRecords(base44.asServiceRole.entities.PlanningTaskSourceChange, '-detected_at'),
  ]) as LooseRecord[][];
  const legacySingleTaskMigrationReports = await migrateLegacySinglePlanningTasks(
    base44,
    user,
    context,
    {
      series: objectTaskScheduleSeries,
      revisions: objectTaskScheduleRevisions,
      exceptions: objectTaskScheduleExceptions,
      occurrences: existingOccurrences,
    },
  );
  const blockedLegacySeriesIds = new Set(
    legacySingleTaskMigrationReports
      .filter(item => item.status === 'blocked')
      .map(item => String(item.source_series_id)),
  );
  if (legacySingleTaskMigrationReports.some(item => item.status !== 'completed')) {
    [
      existingShifts,
      existingAssignments,
      objectTaskDefinitions,
      objectTaskScheduleSeries,
      objectTaskScheduleRevisions,
      objectTaskScheduleExceptions,
      existingOccurrences,
      existingTaskSegments,
    ] = await Promise.all([
      listAllRecords(base44.asServiceRole.entities.PlanningShift),
      listAllRecords(base44.asServiceRole.entities.PlanningAssignment),
      listAllRecords(base44.asServiceRole.entities.ObjectTaskDefinition, '-updated_date'),
      listAllRecords(base44.asServiceRole.entities.ObjectTaskScheduleSeries, 'created_date'),
      listAllRecords(base44.asServiceRole.entities.ObjectTaskScheduleRevision, '-revision_number'),
      listAllRecords(base44.asServiceRole.entities.ObjectTaskScheduleException, '-service_date'),
      listAllRecords(base44.asServiceRole.entities.PlanningTaskOccurrence, '-service_date'),
      listAllRecords(base44.asServiceRole.entities.PlanningShiftTaskSegment, '-start_date'),
    ]);
  }
  const repairedSingleTaskOccurrenceIds: string[] = [];
  for (const occurrence of existingOccurrences.filter((item: LooseRecord) => (
    item.service_date <= periodEnd
    && (item.end_date || item.service_date) >= periodStart
    && item.metadata?.single_task_occurrence_mutation?.phase === 'state_written_audit_pending'
    && item.metadata.single_task_occurrence_mutation.actor_user_id === (user.id || null)
  ))) {
    const marker = occurrence.metadata.single_task_occurrence_mutation;
    try {
      await changeSingleTaskOccurrence(
        base44,
        user,
        {
          action: 'change_single_task_occurrence',
          ...marker.request_payload,
          idempotency_key: marker.idempotency_key,
          correlation_id: marker.correlation_id,
        },
        {
          idempotencyKey: marker.idempotency_key,
          correlationId: marker.correlation_id || context.correlationId,
        },
      );
      repairedSingleTaskOccurrenceIds.push(String(occurrence.id));
    } catch (error) {
      if (Number((error as any)?.status) !== 409) throw error;
    }
  }
  const repairedSharedBoundaryOccurrenceIds: string[] = [];
  const pendingSharedBoundaryRepairs: LooseRecord[] = [];
  for (const occurrence of existingOccurrences.filter((item: LooseRecord) => (
    item.lifecycle_status === 'active'
    && item.service_date <= periodEnd
    && (item.end_date || item.service_date) >= periodStart
    && unresolvedSharedBoundaryMutation(item)
  ))) {
    const boundaryState = occurrence.metadata.shared_boundary_mutation;
    const recoveryKey = `boundary-repair:${await sha256(
      boundaryState.operation_id || `${occurrence.id}:${boundaryState.idempotency_key}`,
    )}`;
    try {
      const recovery = await repairSharedTaskBoundary(
        base44,
        user,
        { action: REPAIR_SHARED_TASK_BOUNDARY_ACTION, task_occurrence_id: occurrence.id },
        { idempotencyKey: recoveryKey, correlationId: context.correlationId },
      );
      if (recovery?.repaired) repairedSharedBoundaryOccurrenceIds.push(String(occurrence.id));
    } catch (error) {
      if (Number((error as any)?.status) === 409 && (error as any)?.details?.reservation_expires_at) {
        pendingSharedBoundaryRepairs.push({
          task_occurrence_id: String(occurrence.id),
          retry_after: (error as any).details.reservation_expires_at,
        });
        continue;
      }
      throw error;
    }
  }
  if (repairedSharedBoundaryOccurrenceIds.length || repairedSingleTaskOccurrenceIds.length) {
    [
      existingShifts,
      existingAssignments,
      objectTaskDefinitions,
      objectTaskScheduleSeries,
      objectTaskScheduleRevisions,
      objectTaskScheduleExceptions,
      existingOccurrences,
      existingTaskSegments,
    ] = await Promise.all([
      listAllRecords(base44.asServiceRole.entities.PlanningShift),
      listAllRecords(base44.asServiceRole.entities.PlanningAssignment),
      listAllRecords(base44.asServiceRole.entities.ObjectTaskDefinition, '-updated_date'),
      listAllRecords(base44.asServiceRole.entities.ObjectTaskScheduleSeries, 'created_date'),
      listAllRecords(base44.asServiceRole.entities.ObjectTaskScheduleRevision, '-revision_number'),
      listAllRecords(base44.asServiceRole.entities.ObjectTaskScheduleException, '-service_date'),
      listAllRecords(base44.asServiceRole.entities.PlanningTaskOccurrence, '-service_date'),
      listAllRecords(base44.asServiceRole.entities.PlanningShiftTaskSegment, '-start_date'),
    ]);
  }
  const routeById = new Map<string, LooseRecord>(routes.map((item: LooseRecord) => [String(item.id), item]));
  const taskById = new Map<string, LooseRecord>(tasks.map((item: LooseRecord) => [String(item.id), item]));
  const objectById = new Map<string, LooseRecord>(objects.map((item: LooseRecord) => [String(item.id), item]));
  const customerById = new Map<string, LooseRecord>(customers.map((item: LooseRecord) => [String(item.id), item]));
  const securityPlanById = new Map<string, LooseRecord>(securityPlans.map((item: LooseRecord) => [String(item.id), item]));
  const securityPlanRevisionById = new Map<string, LooseRecord>(securityPlanRevisions.map((item: LooseRecord) => [String(item.id), item]));
  const shiftBySourceKey = new Map<string, LooseRecord>(
    existingShifts.map((item: LooseRecord) => [String(item.source_key), item]),
  );
  const existingShiftById = new Map<string, LooseRecord>(
    existingShifts.map((item: LooseRecord) => [String(item.id), item]),
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
  const createdOccurrenceIds: string[] = [];
  const refreshedOccurrenceIds: string[] = [];
  const supersededOccurrenceIds: string[] = [];
  const taskSourceChangeIds: string[] = [];
  const resolvedTaskSourceChangeIds: string[] = [];
  const invalidTaskDefinitionIds: string[] = [];
  const duplicateSourceKeys: string[] = [];
  const seenSourceKeys = new Set<string>();
  const supersededThisBootstrap = new Set<string>();

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
    const bootstrapStartTime = asTime(execution.shift_start_time || route.time_window_start, 'shift_start_time');
    const bootstrapEndTime = asTime(execution.shift_end_time || route.time_window_end, 'shift_end_time');
    const bootstrapDescriptor = await resourceCoordinatorDescriptor('bootstrap_source', sourceKey);
    const bootstrapDescriptors: LooseRecord[] = [bootstrapDescriptor];
    const existingSourceShifts = existingShifts.filter(item => item.source_key === sourceKey);
    const existingSourceShiftIds = new Set(existingSourceShifts.map(item => String(item.id)));
    const existingSourceAssignments = existingAssignments.filter(item => (
      item.status !== 'removed' && existingSourceShiftIds.has(String(item.shift_id))
    ));
    bootstrapDescriptors.push(...await Promise.all(existingSourceShifts.map(item => (
      resourceCoordinatorDescriptor('shift_composition', item.id)
    ))));
    bootstrapDescriptors.push(...await personnelDayDescriptors(
      existingSourceAssignments.map(item => item.personnel_id),
      existingSourceShifts,
    ));
    if (execution.employee_id) {
      bootstrapDescriptors.push(...await personnelDayDescriptors(
        [execution.employee_id],
        [{
          service_date: execution.service_date,
          end_date: execution.end_date || null,
          start_time: bootstrapStartTime,
          end_time: bootstrapEndTime,
        }],
      ));
    }
    const bootstrapRequestHash = await sha256(stableStringify({
      action: 'bootstrap_route_source',
      source_key: sourceKey,
      route_execution_id: execution.id || null,
    }));
    const bootstrapResult = await withPlanningResourceLeases(
      base44,
      user,
      context,
      bootstrapRequestHash,
      bootstrapDescriptors,
      async leases => {
        for (const existingSourceShift of existingSourceShifts) {
          const currentSourceShift = await requireRecord(
            base44,
            'PlanningShift',
            existingSourceShift.id,
            'Dienst',
          );
          await assertNoForeignPendingMutation(
            base44,
            currentSourceShift,
            context,
            'bootstrap_range',
            user,
            bootstrapRequestHash,
          );
        }
        await renewPlanningResourceLeases(base44, user, leases);
        let shift: LooseRecord | null = await reconcilePlanningShiftSourceKey(
          base44,
          user,
          sourceKey,
          () => renewPlanningResourceLeases(base44, user, leases),
          candidate => assertNoForeignPendingMutation(
            base44,
            candidate,
            context,
            'bootstrap_range',
            user,
            bootstrapRequestHash,
          ),
        );
        let createdShiftId: string | null = null;
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
          await renewPlanningResourceLeases(base44, user, leases);
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
            start_time: bootstrapStartTime,
            end_time: bootstrapEndTime,
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
          await renewPlanningResourceLeases(base44, user, leases);
          shift = await reconcilePlanningShiftSourceKey(
            base44,
            user,
            sourceKey,
            () => renewPlanningResourceLeases(base44, user, leases),
            candidate => assertNoForeignPendingMutation(
              base44,
              candidate,
              context,
              'bootstrap_range',
              user,
              bootstrapRequestHash,
            ),
          ) || createdShift;
          if (String(shift.id) === String(createdShift.id)) createdShiftId = shift.id;
        }

        const slotKey = `${shift.id}:0`;
        const slotAssignments = await filterAllRecords(base44.asServiceRole.entities.PlanningAssignment, {
          shift_id: shift.id,
          slot_index: 0,
        });
        const activeSlotAssignments = slotAssignments.filter(item => item.status !== 'removed');
        if (activeSlotAssignments.length > 1) {
          throw new ApiError(409, 'Meerdere actieve route-toewijzingen delen dezelfde dienstslot', {
            shift_id: shift.id,
            assignment_ids: activeSlotAssignments.map(item => item.id),
          });
        }
        let createdAssignment: LooseRecord | null = null;
        if (execution.employee_id && !activeSlotAssignments[0]) {
          const legacyWarnings = legacyRoutingWarnings(execution);
          const finalPersonnel = await getRecord(base44, 'Personnel', execution.employee_id);
          const eligibility = finalPersonnel
            ? await evaluateAssignmentWarnings(
                base44,
                shift,
                finalPersonnel,
                slotAssignments[0]?.id || null,
                legacyWarnings,
              )
            : null;
          const warningSnapshot = eligibility?.warning_snapshot || legacyWarnings;
          const assignmentPayload = {
            personnel_id: execution.employee_id,
            personnel_name_snapshot: finalPersonnel?.name || execution.employee_name || 'Medewerker',
            personnel_contract_id: eligibility?.personnel_contract_id || execution.personnel_contract_id || null,
            status: 'draft',
            warning_codes: warningSnapshot.map(item => item.code),
            warning_snapshot: warningSnapshot,
            has_critical_warnings: warningSnapshot.some(item => item.severity === 'critical'),
            contract_routing_snapshot: eligibility?.contract_routing_snapshot
              || execution.contract_routing_snapshot
              || null,
            assigned_by_user_id: user.id || null,
            assigned_at: nowIso(),
            removed_by_user_id: null,
            removed_at: null,
            published_revision: 0,
            last_published_correlation_id: null,
            metadata: {
              ...(slotAssignments[0]?.metadata || {}),
              bootstrap_source: 'RouteExecution',
              route_execution_id: execution.id || null,
              bootstrap_reactivated_at: slotAssignments[0] ? nowIso() : null,
              final_assignment_validation_at: finalPersonnel ? nowIso() : null,
            },
          };
          await renewPlanningResourceLeases(base44, user, leases);
          createdAssignment = slotAssignments[0]
            ? await casUpdate(
                base44,
                'PlanningAssignment',
                slotAssignments[0],
                revisionOf(slotAssignments[0]),
                assignmentPayload,
              )
            : await base44.asServiceRole.entities.PlanningAssignment.create({
                shift_id: shift.id,
                slot_index: 0,
                ...assignmentPayload,
                revision: 1,
              });
        }
        return { shift, createdShiftId, createdAssignment, slotKey };
      },
    );
    shiftBySourceKey.set(sourceKey, bootstrapResult.shift);
    if (bootstrapResult.createdShiftId) createdShiftIds.push(bootstrapResult.createdShiftId);
    else existingShiftIds.push(bootstrapResult.shift.id);
    if (bootstrapResult.createdAssignment) {
      assignmentBySlot.set(bootstrapResult.slotKey, bootstrapResult.createdAssignment);
      createdAssignmentIds.push(bootstrapResult.createdAssignment.id);
    }
  }

  const occurrenceHasActiveSegment = new Set(
    activeTaskSegments(existingTaskSegments, existingShifts)
      .map((item: LooseRecord) => String(item.task_occurrence_id)),
  );
  let reconciledOccurrences = existingOccurrences;
  const occurrenceSourceCounts = new Map<string, number>();
  for (const occurrence of existingOccurrences) {
    if (occurrence.lifecycle_status !== 'active') continue;
    const key = String(occurrence.source_key);
    occurrenceSourceCounts.set(key, Number(occurrenceSourceCounts.get(key) || 0) + 1);
  }
  for (const [sourceKey, count] of occurrenceSourceCounts) {
    if (count <= 1) continue;
    duplicateSourceKeys.push(sourceKey);
    await reconcileTaskOccurrenceSourceKey(base44, user, sourceKey, occurrenceHasActiveSegment);
  }
  if (duplicateSourceKeys.length) {
    reconciledOccurrences = await listAllRecords(base44.asServiceRole.entities.PlanningTaskOccurrence, '-service_date');
  }
  const occurrenceBySourceKey = new Map<string, LooseRecord>(
    reconciledOccurrences
      .filter((item: LooseRecord) => item.lifecycle_status === 'active')
      .map((item: LooseRecord) => [String(item.source_key), item]),
  );
  const occurrenceByIdentityKey = new Map<string, LooseRecord>(
    reconciledOccurrences
      .filter((item: LooseRecord) => item.lifecycle_status === 'active')
      .map((item: LooseRecord) => [taskOccurrenceIdentityKey(item), item]),
  );
  const occurrenceByLogicalSourceKey = new Map<string, LooseRecord>(
    reconciledOccurrences
      .filter((item: LooseRecord) => item.lifecycle_status === 'active' && item.logical_source_key)
      .map((item: LooseRecord) => [String(item.logical_source_key), item]),
  );
  const desiredOccurrenceSourceKeys = new Set<string>();
  const desiredOccurrenceIds = new Set<string>();

  for (const definition of objectTaskDefinitions.filter((item: LooseRecord) => item.status === 'active')) {
    const object = objectById.get(String(definition.object_id));
    const customer = customerById.get(String(definition.customer_id || object?.customer_id));
    if (!definition.id || !object || !customer) {
      invalidTaskDefinitionIds.push(String(definition.id || 'unknown'));
      continue;
    }
    let blueprints: LooseRecord[] = [];
    try {
      const allDefinitionSeries = objectTaskScheduleSeries.filter((item: LooseRecord) => (
        String(item.object_task_definition_id) === String(definition.id)
      ));
      const definitionSeries = allDefinitionSeries.filter((item: LooseRecord) => (
        !blockedLegacySeriesIds.has(String(item.id))
      ));
      blueprints = allDefinitionSeries.length
        ? scheduleSeriesBlueprints(
            definition,
            definitionSeries,
            objectTaskScheduleRevisions.filter((item: LooseRecord) => (
              String(item.object_task_definition_id) === String(definition.id)
            )),
            periodStart,
            periodEnd,
            objectTaskScheduleExceptions,
          )
        : occurrenceBlueprints(definition, periodStart, periodEnd);
    } catch {
      invalidTaskDefinitionIds.push(String(definition.id));
      continue;
    }
    const taskDefinitionDescriptor = await resourceCoordinatorDescriptor(
      'object_task_definition',
      definition.id,
    );
    await withPlanningResourceLeases(
      base44,
      user,
      context,
      requestHash,
      [taskDefinitionDescriptor],
      async definitionLeases => {
    const securityPlan = definition.security_plan_id
      ? securityPlanById.get(String(definition.security_plan_id)) || null
      : null;
    const publishedSecurityPlanRevision = securityPlan?.current_published_revision_id
      ? securityPlanRevisionById.get(String(securityPlan.current_published_revision_id)) || null
      : null;
    const validPublishedSecurityPlanRevision = publishedSecurityPlanRevision?.status === 'published'
      && String(publishedSecurityPlanRevision.security_plan_id) === String(securityPlan?.id)
      ? publishedSecurityPlanRevision
      : null;
    const securityPlanSnapshot = securityPlan ? {
      plan: {
        id: securityPlan.id,
        task_type: securityPlan.task_type || securityPlan.category || null,
        variant_name: securityPlan.variant_name || securityPlan.title || null,
        current_published_revision_id: securityPlan.current_published_revision_id || null,
        latest_revision_number: Number(securityPlan.latest_revision_number || 0),
        status: securityPlan.status || null,
      },
      published_revision: validPublishedSecurityPlanRevision ? pick(validPublishedSecurityPlanRevision, [
        'id',
        'security_plan_id',
        'customer_id',
        'object_id',
        'revision_number',
        'status',
        'summary',
        'duration_mode',
        'duration_minutes',
        'section_policy',
        'default_section_ids',
        'allowed_section_ids',
        'instruction_blocks',
        'module_assignments',
        'floorplan_id',
        'floorplan_revision',
        'route_overlay',
        'readiness_snapshot',
        'content_checksum',
        'published_at',
        'published_by_user_id',
        'version',
      ]) : null,
    } : null;
    const securityPlanChecksum = securityPlanSnapshot
      ? await sha256(stableStringify(securityPlanSnapshot))
      : null;

    for (const blueprint of blueprints) {
      await renewPlanningResourceLeases(base44, user, definitionLeases);
      desiredOccurrenceSourceKeys.add(blueprint.source_key);
      const payload = {
        ...blueprint,
        company_id: object.default_operating_company_id || null,
        customer_id: customer.id,
        object_id: object.id,
        security_plan_id: securityPlan?.id || definition.security_plan_id || null,
        security_plan_revision_id: validPublishedSecurityPlanRevision?.id || null,
        security_plan_snapshot: securityPlanSnapshot,
        security_plan_checksum: securityPlanChecksum,
        customer_name_snapshot: customerDisplayName(customer),
        object_name_snapshot: object.name || 'Onbekend object',
        lifecycle_status: 'active',
        last_modified_by_user_id: user.id || null,
        last_modified_at: nowIso(),
        metadata: {
          bootstrap_source: blueprint.object_task_schedule_series_id
            ? 'ObjectTaskScheduleSeries'
            : 'ObjectTaskDefinition',
          security_plan_review_required: Boolean(securityPlan && !validPublishedSecurityPlanRevision),
        },
      };
      let existing = occurrenceBySourceKey.get(blueprint.source_key)
        || (blueprint.logical_source_key
          ? occurrenceByLogicalSourceKey.get(String(blueprint.logical_source_key))
            || [...occurrenceByIdentityKey.values()].find(item => (
              !item.logical_source_key
              && taskOccurrenceIdentityKey(item) === taskOccurrenceIdentityKey(blueprint)
            ))
          : occurrenceByIdentityKey.get(taskOccurrenceIdentityKey(blueprint)));
      if (!existing) {
        const createdOccurrence = await base44.asServiceRole.entities.PlanningTaskOccurrence.create({
          ...payload,
          supersedes_task_occurrence_id: null,
          superseded_by_task_occurrence_id: null,
          revision: 1,
          published_revision: 0,
          last_published_correlation_id: null,
        });
        const occurrence = await reconcileTaskOccurrenceSourceKey(
          base44,
          user,
          blueprint.source_key,
          occurrenceHasActiveSegment,
        ) || createdOccurrence;
        if (String(occurrence.id) !== String(createdOccurrence.id)) duplicateSourceKeys.push(blueprint.source_key);
        occurrenceBySourceKey.set(blueprint.source_key, occurrence);
        if (blueprint.logical_source_key) {
          occurrenceByLogicalSourceKey.set(String(blueprint.logical_source_key), occurrence);
        }
        occurrenceByIdentityKey.set(taskOccurrenceIdentityKey(occurrence), occurrence);
        desiredOccurrenceIds.add(String(occurrence.id));
        createdOccurrenceIds.push(createdOccurrence.id);
        continue;
      }
      let currentOccurrence: LooseRecord = existing;
      desiredOccurrenceIds.add(String(currentOccurrence.id));
      if (hasActivePlanningCompositionReservation(currentOccurrence)) continue;
      const beforeImpact = taskOccurrencePlanningImpactSnapshot(currentOccurrence);
      const desiredImpact = taskOccurrencePlanningImpactSnapshot(payload);
      const sourceChanged = stableStringify(taskOccurrenceSourceSnapshot(currentOccurrence))
        !== stableStringify(taskOccurrenceSourceSnapshot(payload));
      const planningImpactChanged = stableStringify(beforeImpact) !== stableStringify(desiredImpact)
        || Boolean(blueprint.logical_source_key && !currentOccurrence.logical_source_key);
      if (sourceChanged && !planningImpactChanged) {
        currentOccurrence = await casUpdate(
          base44,
          'PlanningTaskOccurrence',
          currentOccurrence,
          revisionOf(currentOccurrence),
          {
            ...taskOccurrenceSourceSnapshot(payload),
            last_modified_by_user_id: user.id || null,
            last_modified_at: nowIso(),
            metadata: {
              ...(currentOccurrence.metadata || {}),
              source_snapshot_refreshed_by_bootstrap: true,
            },
          },
        );
        occurrenceBySourceKey.set(blueprint.source_key, currentOccurrence);
        if (blueprint.logical_source_key) {
          occurrenceByLogicalSourceKey.set(String(blueprint.logical_source_key), currentOccurrence);
        }
        refreshedOccurrenceIds.push(currentOccurrence.id);
        continue;
      }
      if (sourceChanged && planningImpactChanged) {
        const replacement = await replaceTaskOccurrenceSnapshot(
          base44,
          user,
          currentOccurrence,
          payload,
        );
        occurrenceBySourceKey.set(blueprint.source_key, replacement);
        if (blueprint.logical_source_key) {
          occurrenceByLogicalSourceKey.set(String(blueprint.logical_source_key), replacement);
        }
        occurrenceByIdentityKey.set(taskOccurrenceIdentityKey(replacement), replacement);
        desiredOccurrenceIds.delete(String(currentOccurrence.id));
        desiredOccurrenceIds.add(String(replacement.id));
        createdOccurrenceIds.push(replacement.id);
        supersededOccurrenceIds.push(currentOccurrence.id);
        supersededThisBootstrap.add(String(currentOccurrence.id));
        if (
          occurrenceHasActiveSegment.has(String(currentOccurrence.id))
          && blueprint.object_task_schedule_revision_id
        ) {
          const activeSegments = activeSegmentsForOccurrence(
            String(currentOccurrence.id),
            existingTaskSegments,
            existingShiftById,
          );
          const segmentsByShift = new Map<string, LooseRecord[]>();
          for (const segment of activeSegments) {
            const key = String(segment.shift_id);
            segmentsByShift.set(key, [...(segmentsByShift.get(key) || []), segment]);
          }
          const triggeringRevision = objectTaskScheduleRevisions.find((item: LooseRecord) => (
            String(item.id) === String(blueprint.object_task_schedule_revision_id)
          ));
          if (triggeringRevision) {
            for (const [shiftId, linkedSegments] of segmentsByShift) {
              const shift = existingShiftById.get(shiftId);
              if (!shift) continue;
              const change = await ensureTaskSourceChange(
                base44,
                user,
                context,
                triggeringRevision,
                currentOccurrence,
                replacement,
                shift,
                linkedSegments,
                beforeImpact,
                desiredImpact,
                'schedule_changed',
              );
              taskSourceChangeIds.push(change.id);
            }
          }
        }
      } else if (blueprint.logical_source_key) {
        occurrenceByLogicalSourceKey.set(String(blueprint.logical_source_key), currentOccurrence);
      }
    }
      },
    );
  }

  for (const occurrence of reconciledOccurrences) {
    if (
      occurrence.service_date < periodStart
      || occurrence.service_date > periodEnd
      || occurrence.lifecycle_status !== 'active'
      || supersededThisBootstrap.has(String(occurrence.id))
      || blockedLegacySeriesIds.has(String(occurrence.object_task_schedule_series_id || ''))
      || desiredOccurrenceSourceKeys.has(String(occurrence.source_key))
      || desiredOccurrenceIds.has(String(occurrence.id))
      || hasActivePlanningCompositionReservation(occurrence)
    ) continue;
    if (occurrenceHasActiveSegment.has(String(occurrence.id))) {
      const seriesId = compact(occurrence.object_task_schedule_series_id);
      const occurrenceSeries = seriesId
        ? objectTaskScheduleSeries.find((item: LooseRecord) => String(item.id) === seriesId) || null
        : null;
      let serviceRevision = seriesId
        ? taskRevisionForDate(
            objectTaskScheduleRevisions.filter((item: LooseRecord) => String(item.series_id) === seriesId),
            occurrence.service_date,
            occurrenceSeries,
          )
        : null;
      if (!serviceRevision) {
        // A pinned legacy bootstrap can create an occurrence without a
        // schedule-series reference even though the newer task already has
        // effective-dated series. If that occurrence was composed into a
        // shift, keep it immutable but surface the removal as a mandatory
        // planning source change instead of leaving stale work silently active.
        const definitionSeriesIds = new Set(objectTaskScheduleSeries
          .filter((item: LooseRecord) => (
            String(item.object_task_definition_id) === String(occurrence.object_task_definition_id)
            && item.status !== 'archived'
          ))
          .map((item: LooseRecord) => String(item.id)));
        const occurrenceWeekday = isoWeekday(occurrence.service_date);
        serviceRevision = objectTaskScheduleRevisions
          .filter((item: LooseRecord) => (
            definitionSeriesIds.has(String(item.series_id))
            && item.operation === 'schedule'
            && item.effective_from > occurrence.service_date
          ))
          .sort((left: LooseRecord, right: LooseRecord) => {
            const leftWeekdayRank = Number(left.weekday) === occurrenceWeekday ? 0 : 1;
            const rightWeekdayRank = Number(right.weekday) === occurrenceWeekday ? 0 : 1;
            return leftWeekdayRank - rightWeekdayRank
              || String(left.effective_from).localeCompare(String(right.effective_from))
              || Number(left.revision_number || 0) - Number(right.revision_number || 0);
          })[0] || null;
      }
      if (serviceRevision) {
        const linkedSegments = activeSegmentsForOccurrence(
          String(occurrence.id),
          existingTaskSegments,
          existingShiftById,
        );
        const segmentsByShift = new Map<string, LooseRecord[]>();
        for (const segment of linkedSegments) {
          const key = String(segment.shift_id);
          segmentsByShift.set(key, [...(segmentsByShift.get(key) || []), segment]);
        }
        for (const [shiftId, shiftSegments] of segmentsByShift) {
          const shift = existingShiftById.get(shiftId);
          if (!shift) continue;
          const change = await ensureTaskSourceChange(
            base44,
            user,
            context,
            serviceRevision,
            occurrence,
            null,
            shift,
            shiftSegments,
            taskOccurrencePlanningImpactSnapshot(occurrence),
            null,
            'schedule_stopped',
          );
          taskSourceChangeIds.push(change.id);
        }
      }
      continue;
    }
    await casUpdate(
      base44,
      'PlanningTaskOccurrence',
      occurrence,
      revisionOf(occurrence),
      {
        lifecycle_status: 'superseded',
        last_modified_by_user_id: user.id || null,
        last_modified_at: nowIso(),
        metadata: { ...(occurrence.metadata || {}), superseded_by_bootstrap: true },
      },
    );
    supersededOccurrenceIds.push(occurrence.id);
  }

  const [currentOccurrences, currentTaskSegments, currentShifts] = await Promise.all([
    listAllRecords(base44.asServiceRole.entities.PlanningTaskOccurrence, '-service_date'),
    listAllRecords(base44.asServiceRole.entities.PlanningShiftTaskSegment, '-start_date'),
    listAllRecords(base44.asServiceRole.entities.PlanningShift),
  ]);
  resolvedTaskSourceChangeIds.push(...await resolveSatisfiedTaskSourceChanges(
    base44,
    user,
    existingTaskSourceChanges,
    currentOccurrences,
    currentTaskSegments,
    currentShifts,
  ));

  const result = {
    period_start: periodStart,
    period_end: periodEnd,
    considered_route_execution_count: relevant.length,
    created_shift_count: createdShiftIds.length,
    existing_shift_count: existingShiftIds.length,
    created_assignment_count: createdAssignmentIds.length,
    created_task_occurrence_count: createdOccurrenceIds.length,
    refreshed_task_occurrence_count: refreshedOccurrenceIds.length,
    superseded_task_occurrence_count: supersededOccurrenceIds.length,
    open_task_source_change_count: [...new Set(taskSourceChangeIds)].length,
    resolved_task_source_change_count: [...new Set(resolvedTaskSourceChangeIds)].length,
    invalid_task_definition_ids: [...new Set(invalidTaskDefinitionIds)],
    duplicate_source_keys: [...new Set(duplicateSourceKeys)],
    created_shift_ids: createdShiftIds,
    existing_shift_ids: existingShiftIds,
    created_assignment_ids: createdAssignmentIds,
    created_task_occurrence_ids: createdOccurrenceIds,
    refreshed_task_occurrence_ids: refreshedOccurrenceIds,
    superseded_task_occurrence_ids: supersededOccurrenceIds,
    task_source_change_ids: [...new Set(taskSourceChangeIds)],
    resolved_task_source_change_ids: [...new Set(resolvedTaskSourceChangeIds)],
    repaired_shared_boundary_occurrence_ids: repairedSharedBoundaryOccurrenceIds,
    repaired_single_task_occurrence_ids: repairedSingleTaskOccurrenceIds,
    migrated_legacy_single_task_occurrences: legacySingleTaskMigrationReports
      .filter(item => item.status === 'migrated'),
    completed_legacy_single_task_occurrences: legacySingleTaskMigrationReports
      .filter(item => item.status === 'completed'),
    blocked_legacy_single_task_migrations: legacySingleTaskMigrationReports
      .filter(item => item.status === 'blocked'),
    blocked_legacy_single_task_series_ids: [...blockedLegacySeriesIds],
    object_task_series_impact_recovery: seriesImpactRecoveryReports,
    pending_shared_boundary_occurrence_ids: pendingSharedBoundaryRepairs.map(item => item.task_occurrence_id),
    pending_shared_boundary_repairs: pendingSharedBoundaryRepairs,
  };
  await appendAudit(base44, user, {
    action: 'bootstrap_range',
    resource_type: 'PlanningRange',
    before_state: null,
    after_state: result,
    correlation_id: context.correlationId,
    idempotency_key: context.idempotencyKey,
    undoable: false,
    metadata: { request_hash: requestHash },
  });
  return { ok: true, ...result, undoable: false, undo_token: null };
}

function commonBoolean(values: unknown[]) {
  const present = values.filter(value => typeof value === 'boolean') as boolean[];
  return present.length && present.every(value => value === present[0]) ? present[0] : null;
}

function normalizedCompositionSegment(input: LooseRecord, occurrence: LooseRecord) {
  const startDate = input.start_date ? asDate(input.start_date, 'segments.start_date') : occurrence.service_date;
  const startTime = asTime(input.start_time, 'segments.start_time');
  const endTime = asTime(input.end_time, 'segments.end_time');
  let endDate = input.end_date ? asDate(input.end_date, 'segments.end_date') : startDate;
  const startMinutes = parseClockMinutes(startTime) as number;
  const endMinutes = parseClockMinutes(endTime) as number;
  if (!input.end_date && endMinutes <= startMinutes) endDate = addDateDays(startDate, 1);
  const interval = intervalFromParts(startDate, startTime, endDate, endTime);
  if (!interval) throw new ApiError(400, 'Ieder taaksegment moet een positieve duur hebben');
  const occurrenceInterval = intervalFromParts(
    occurrence.service_date,
    occurrence.window_start_time,
    occurrence.end_date,
    occurrence.window_end_time,
  );
  if (!occurrenceInterval || interval.start < occurrenceInterval.start || interval.end > occurrenceInterval.end) {
    throw new ApiError(409, 'Taaksegment valt buiten het toegestane taakvenster', {
      task_occurrence_id: occurrence.id,
      occurrence_start: `${occurrence.service_date} ${occurrence.window_start_time}`,
      occurrence_end: `${occurrence.end_date} ${occurrence.window_end_time}`,
    });
  }
  return {
    task_occurrence_id: occurrence.id,
    object_task_definition_id: occurrence.object_task_definition_id,
    start_date: startDate,
    end_date: endDate,
    start_time: startTime,
    end_time: endTime,
    timezone: occurrence.timezone || 'Europe/Amsterdam',
    duration_minutes: interval.duration,
    company_id: occurrence.company_id || null,
    customer_id: occurrence.customer_id,
    object_id: occurrence.object_id,
    task_type: occurrence.task_type,
    task_name_snapshot: occurrence.task_name_snapshot,
    customer_name_snapshot: occurrence.customer_name_snapshot || null,
    object_name_snapshot: occurrence.object_name_snapshot || null,
    instructions_snapshot: occurrence.instructions_snapshot || null,
    _interval: interval,
  };
}

function compositionWarnings(segments: LooseRecord[]) {
  const warnings: LooseRecord[] = [];
  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const current = segments[index];
    const gapMinutes = current._interval.start - previous._interval.end;
    if (gapMinutes > 0) {
      warnings.push(warning(
        `composition_gap_${index}`,
        'info',
        `${gapMinutes} minuten zonder taak tussen ${previous.task_name_snapshot} en ${current.task_name_snapshot}.`,
        'PlanningShiftTaskSegment',
        { gap_minutes: gapMinutes, after_occurrence_id: previous.task_occurrence_id },
      ));
    }
    if (String(previous.object_id) !== String(current.object_id) && gapMinutes < 5) {
      warnings.push(warning(
        `object_transition_review_${index}`,
        'warning',
        'Overgang tussen twee objecten heeft minder dan 5 minuten reistijd. Controleer of dit uitvoerbaar is.',
        'PlanningShiftTaskSegment',
        { gap_minutes: gapMinutes, from_object_id: previous.object_id, to_object_id: current.object_id },
      ));
    }
  }
  return warnings;
}

async function composeShift(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  if (!context.idempotencyKey) throw new ApiError(400, 'idempotency_key is verplicht voor dienstsamenstelling');
  const requestedShiftId = compact(body.shift_id);
  const composeAndAssignMode = body.action === 'compose_and_assign';
  if (composeAndAssignMode && requestedShiftId) {
    throw new ApiError(400, 'compose_and_assign maakt altijd één nieuwe dienst');
  }
  const action = composeAndAssignMode
    ? 'compose_and_assign'
    : requestedShiftId
    ? 'update_shift_composition'
    : 'compose_shift';

  const requestedSegments = normalizeArray<LooseRecord>(body.segments);
  let requestedPersonnelId: string | null = null;
  let requestedSlotIndex = 0;
  let requestedRequiredCount: number | null = null;
  let compositionRequestHash: string;
  let composeAndAssignRequestHash: string | null = null;
  let compositionLeases: LooseRecord[] = [];
  let compositionBusinessWriteStarted = false;
  let composeAndAssignClaimed = false;
  const composeAndAssignState: LooseRecord = {
    shiftId: null,
    reservedOccurrenceIds: [],
    phaseCompleted: false,
    auditCompleted: false,
  };
  if (composeAndAssignMode) {
    requestedPersonnelId = requireId(body, 'personnel_id');
    requestedSlotIndex = nonNegativeInteger(body.slot_index ?? 0, 'slot_index');
    requestedRequiredCount = positiveInteger(body.required_count || 1, 'required_count');
    if (requestedSlotIndex >= requestedRequiredCount) {
      throw new ApiError(400, 'slot_index valt buiten required_count');
    }
  }
  compositionRequestHash = await sha256(stableStringify({
    action,
    shift_id: requestedShiftId || null,
    personnel_id: requestedPersonnelId,
    slot_index: composeAndAssignMode ? requestedSlotIndex : null,
    required_count: composeAndAssignMode ? requestedRequiredCount : body.required_count || null,
    expected_shift_revision: body.expected_shift_revision || null,
    service_name: compact(body.service_name || body.name) || null,
    assignment_source: compact(body.assignment_source) || (composeAndAssignMode ? 'compose_and_assign' : null),
    warnings: normalizeSuppliedWarnings(body),
    expected_occurrence_revisions: body.expected_occurrence_revisions || {},
    segments: requestedSegments.map(item => ({
      task_occurrence_id: compact(item.task_occurrence_id),
      start_date: compact(item.start_date) || null,
      end_date: compact(item.end_date) || null,
      start_time: compact(item.start_time),
      end_time: compact(item.end_time),
    })),
  }));
  if (composeAndAssignMode) composeAndAssignRequestHash = compositionRequestHash;
  const replay = await findReplay(base44, action, context.idempotencyKey);
  let pendingCompositionAudit: LooseRecord | null = null;
  let completedCompositionReplay: LooseRecord | null = null;
  if (replay) {
    if (
      replay.actor_user_id !== (user.id || null)
      || replay.metadata?.request_hash !== compositionRequestHash
    ) {
      throw new ApiError(409, 'idempotency_key hoort bij een andere dienstsamenstelling');
    }
    const replayShiftId = compact(replay.after_state?.shift?.id || replay.shift_id);
    const replayShift = replayShiftId
      ? await getRecord(base44, 'PlanningShift', replayShiftId)
      : null;
    if (replayShift?.metadata?.planning_composition?.phase === 'completed') {
      const replayOccurrenceIds = uniqueStrings([
        ...normalizeArray(replay.metadata?.affected_task_occurrence_ids),
        ...normalizeArray<LooseRecord>(replay.after_state?.task_occurrences).map(item => item.id),
      ]);
      const replayOccurrences = await Promise.all(
        replayOccurrenceIds.map(id => requireRecord(base44, 'PlanningTaskOccurrence', id, 'Taakuitvoering')),
      );
      const hasOwnedReservation = replayOccurrences.some(occurrence => {
        const reservation = occurrence.metadata?.planning_composition_reservation;
        return reservation?.idempotency_key === context.idempotencyKey
          && reservation?.request_hash === compositionRequestHash
          && reservation?.actor_user_id === (user.id || null);
      });
      if (!hasOwnedReservation) {
        if (composeAndAssignMode) {
          await mutateIdempotencyClaim(
            base44,
            user,
            context,
            composeAndAssignRequestHash as string,
            'completed',
          );
        }
        return replayResult(replay);
      }
      completedCompositionReplay = replay;
    } else {
      pendingCompositionAudit = replay;
    }
  }

  if (!requestedSegments.length) throw new ApiError(400, 'Voeg minimaal één taaksegment toe');
  if (requestedSegments.length > 50) throw new ApiError(400, 'Een dienst mag maximaal 50 taaksegmenten bevatten');
  const occurrenceIds = uniqueStrings(requestedSegments.map(item => item.task_occurrence_id));
  if (occurrenceIds.length > 50) throw new ApiError(400, 'Te veel verschillende taakuitvoeringen in één dienst');
  if (composeAndAssignMode) composeAndAssignState.requestedOccurrenceIds = occurrenceIds;
  const initialUpdateShift = requestedShiftId
    ? await requireRecord(base44, 'PlanningShift', requestedShiftId, 'Dienst')
    : null;
  const [initialUpdateSegments, initialUpdateAssignments] = requestedShiftId
    ? await Promise.all([
        filterAllRecords(base44.asServiceRole.entities.PlanningShiftTaskSegment, { shift_id: requestedShiftId })
          .then((items: LooseRecord[]) => items.filter(item => item.status !== 'removed')),
        filterAllRecords(base44.asServiceRole.entities.PlanningAssignment, { shift_id: requestedShiftId })
          .then((items: LooseRecord[]) => items.filter(item => item.status !== 'removed')),
      ])
    : [[], []];
  const initialCompositionRecovery = initialUpdateShift?.metadata?.planning_composition;
  if (
    initialCompositionRecovery?.idempotency_key === context.idempotencyKey
    && (
      initialCompositionRecovery?.request_hash !== compositionRequestHash
      || initialCompositionRecovery?.actor_user_id !== (user.id || null)
    )
  ) {
    throw new ApiError(409, 'idempotency_key hoort bij een andere bestaande dienstsamenstelling', {
      shift_id: initialUpdateShift?.id || null,
    });
  }
  const initialRecoveryOccurrenceIds = (
    initialCompositionRecovery?.phase !== 'completed'
    && initialCompositionRecovery?.idempotency_key === context.idempotencyKey
    && initialCompositionRecovery?.request_hash === compositionRequestHash
    && initialCompositionRecovery?.actor_user_id === (user.id || null)
  )
    ? normalizeArray(initialCompositionRecovery?.affected_occurrence_ids)
    : [];
  const completedReplayOccurrenceIds = completedCompositionReplay
    ? uniqueStrings([
        ...normalizeArray(completedCompositionReplay.metadata?.affected_task_occurrence_ids),
        ...normalizeArray<LooseRecord>(completedCompositionReplay.after_state?.task_occurrences).map(item => item.id),
      ])
    : [];
  const affectedOccurrenceIds = uniqueStrings([
    ...occurrenceIds,
    ...initialUpdateSegments.map((item: LooseRecord) => item.task_occurrence_id),
    ...initialRecoveryOccurrenceIds,
    ...completedReplayOccurrenceIds,
  ]);
  if (affectedOccurrenceIds.length > 100) {
    throw new ApiError(400, 'Te veel geraakte taakuitvoeringen in één dienstbewerking');
  }
  const affectedOccurrences = await Promise.all(
    affectedOccurrenceIds.map(id => requireRecord(base44, 'PlanningTaskOccurrence', id, 'Taakuitvoering')),
  );
  const requestedOccurrenceIdSet = new Set(occurrenceIds.map(String));
  const occurrences = affectedOccurrences.filter(item => requestedOccurrenceIdSet.has(String(item.id)));
  const requestedPersonnel = composeAndAssignMode
    ? await requireRecord(base44, 'Personnel', requestedPersonnelId as string, 'Medewerker')
    : null;
  const occurrenceById = new Map<string, LooseRecord>(occurrences.map(item => [String(item.id), item]));
  occurrences.forEach(occurrence => {
    if (occurrence.lifecycle_status !== 'active') {
      throw new ApiError(409, 'Een vervallen taakuitvoering kan niet worden ingepland', {
        task_occurrence_id: occurrence.id,
        lifecycle_status: occurrence.lifecycle_status,
      });
    }
    const boundaryState = unresolvedSharedBoundaryMutation(occurrence);
    if (boundaryState) {
      throw new ApiError(409, 'Een eerdere gedeelde grens moet eerst automatisch worden hersteld', {
        code: 'BOUNDARY_RECOVERY_REQUIRED',
        task_occurrence_id: occurrence.id,
        operation_id: boundaryState.operation_id || null,
      });
    }
  });

  const expectedOccurrenceRevisions = body.expected_occurrence_revisions || {};
  const expectedOccurrenceRevisionById = new Map<string, number>();
  for (const occurrence of affectedOccurrences) {
    if ((composeAndAssignMode || requestedShiftId) && expectedOccurrenceRevisions[occurrence.id] == null) {
      throw new ApiError(400, `expected_occurrence_revisions.${occurrence.id} is verplicht`);
    }
    const expected = expectedOccurrenceRevisions[occurrence.id] == null
      ? revisionOf(occurrence)
      : positiveInteger(
          expectedOccurrenceRevisions[occurrence.id],
          `expected_occurrence_revisions.${occurrence.id}`,
        );
    expectedOccurrenceRevisionById.set(String(occurrence.id), expected);
    const reservation = occurrence.metadata?.planning_composition_reservation;
    const ownsReservation = reservation?.idempotency_key === context.idempotencyKey
      && reservation?.actor_user_id === (user.id || null);
    const completedByThisComposition = occurrence.metadata?.last_composition_idempotency_key === context.idempotencyKey
      && occurrence.metadata?.last_composition_actor_user_id === (user.id || null);
    const compensatedByThisComposition = occurrence.metadata?.last_composition_recovery_idempotency_key === context.idempotencyKey
      && occurrence.metadata?.last_composition_recovery_request_hash === compositionRequestHash
      && occurrence.metadata?.last_composition_recovery_actor_user_id === (user.id || null)
      && Number(occurrence.metadata?.last_composition_recovery_revision) === revisionOf(occurrence);
    const completedByThisRequest = composeAndAssignMode
      && occurrence.metadata?.last_compose_and_assign_idempotency_key === context.idempotencyKey
      && occurrence.metadata?.last_compose_and_assign_actor_user_id === (user.id || null);
    const compensatedByThisRequest = composeAndAssignMode
      && occurrence.metadata?.last_compose_and_assign_recovery_idempotency_key === context.idempotencyKey
      && occurrence.metadata?.last_compose_and_assign_recovery_actor_user_id === (user.id || null);
    if (ownsReservation && reservation.request_hash !== compositionRequestHash) {
      throw new ApiError(409, 'idempotency_key hoort bij een andere taakreservering', {
        entity: 'PlanningTaskOccurrence',
        id: occurrence.id,
      });
    }
    if (completedByThisComposition
      && occurrence.metadata?.last_composition_request_hash !== compositionRequestHash) {
      throw new ApiError(409, 'idempotency_key hoort bij een andere afgeronde dienstsamenstelling', {
        entity: 'PlanningTaskOccurrence',
        id: occurrence.id,
      });
    }
    if (
      occurrence.metadata?.last_composition_recovery_idempotency_key === context.idempotencyKey
      && !compensatedByThisComposition
    ) {
      throw new ApiError(409, 'idempotency_key hoort bij een andere herstelde dienstsamenstelling', {
        entity: 'PlanningTaskOccurrence',
        id: occurrence.id,
      });
    }
    if (completedByThisRequest
      && occurrence.metadata?.last_compose_and_assign_request_hash !== composeAndAssignRequestHash) {
      throw new ApiError(409, 'idempotency_key hoort bij een andere afgeronde taakreservering', {
        entity: 'PlanningTaskOccurrence',
        id: occurrence.id,
      });
    }
    if (compensatedByThisRequest
      && occurrence.metadata?.last_compose_and_assign_recovery_request_hash !== composeAndAssignRequestHash) {
      throw new ApiError(409, 'idempotency_key hoort bij een andere gecompenseerde taakreservering', {
        entity: 'PlanningTaskOccurrence',
        id: occurrence.id,
      });
    }
    const reservationActive = reservation?.status === 'pending'
      && Date.parse(reservation.expires_at || '') > Date.now();
    if (reservationActive && !ownsReservation) {
      throw new ApiError(409, 'Deze taakdekking wordt op dit moment door een andere planner gewijzigd', {
        entity: 'PlanningTaskOccurrence',
        id: occurrence.id,
        reservation_expires_at: reservation.expires_at,
      });
    }
    if (
      revisionOf(occurrence) !== expected
      && !ownsReservation
      && !completedByThisComposition
      && !compensatedByThisComposition
      && !completedByThisRequest
      && !compensatedByThisRequest
    ) {
      throw new ApiError(409, 'Taakdekking is intussen gewijzigd', {
        entity: 'PlanningTaskOccurrence',
        id: occurrence.id,
        expected_revision: expected,
        current_revision: revisionOf(occurrence),
      });
    }
  }

  const normalizedSegments = requestedSegments
    .map(item => {
      const occurrence = occurrenceById.get(String(item.task_occurrence_id));
      if (!occurrence) throw new ApiError(404, 'Taakuitvoering niet gevonden');
      return normalizedCompositionSegment(item, occurrence);
    })
    .sort((a, b) => a._interval.start - b._interval.start || a._interval.end - b._interval.end)
    .map((segment, sequenceIndex) => ({ ...segment, sequence_index: sequenceIndex }));

  for (let index = 1; index < normalizedSegments.length; index += 1) {
    if (normalizedSegments[index]._interval.start < normalizedSegments[index - 1]._interval.end) {
      throw new ApiError(409, 'Taaksegmenten binnen één dienst mogen elkaar niet overlappen', {
        first_occurrence_id: normalizedSegments[index - 1].task_occurrence_id,
        second_occurrence_id: normalizedSegments[index].task_occurrence_id,
      });
    }
  }
  const compositionEnvelopeMinutes = (
    normalizedSegments.at(-1)!._interval.end - normalizedSegments[0]._interval.start
  );
  if (composeAndAssignMode && compositionEnvelopeMinutes > MAX_COMPOSE_AND_ASSIGN_SHIFT_MINUTES) {
    throw new ApiError(409, 'Een automatisch ingeplande dienst mag maximaal 12 uur beslaan', {
      duration_minutes: compositionEnvelopeMinutes,
      maximum_duration_minutes: MAX_COMPOSE_AND_ASSIGN_SHIFT_MINUTES,
    });
  }
  if (compositionEnvelopeMinutes > MAX_COMPOSED_SHIFT_MINUTES) {
    throw new ApiError(409, 'Een samengestelde dienst mag maximaal 24 uur beslaan', {
      duration_minutes: compositionEnvelopeMinutes,
      maximum_duration_minutes: MAX_COMPOSED_SHIFT_MINUTES,
    });
  }

  try {
    if (composeAndAssignMode) {
      await mutateIdempotencyClaim(
        base44,
        user,
        context,
        composeAndAssignRequestHash as string,
        'pending',
      );
      composeAndAssignClaimed = true;
    }

    const compositionDescriptors: LooseRecord[] = await Promise.all([
      ...affectedOccurrenceIds.map(id => resourceCoordinatorDescriptor('task_occurrence', id)),
      resourceCoordinatorDescriptor(
        'shift_composition',
        requestedShiftId || `source:task-composition:${context.idempotencyKey}`,
      ),
    ]);
    if (composeAndAssignMode) {
      compositionDescriptors.push(...await personnelDayDescriptors(
        [requestedPersonnelId as string],
        [{
          service_date: normalizedSegments[0].start_date,
          end_date: normalizedSegments.at(-1)?.end_date,
          start_time: normalizedSegments[0].start_time,
          end_time: normalizedSegments.at(-1)?.end_time,
        }],
      ));
    } else if (requestedShiftId && initialUpdateAssignments.length) {
      compositionDescriptors.push(...await personnelDayDescriptors(
        initialUpdateAssignments.map((item: LooseRecord) => item.personnel_id),
        [
          initialUpdateShift as LooseRecord,
          {
            service_date: normalizedSegments[0].start_date,
            end_date: normalizedSegments.at(-1)?.end_date,
            start_time: normalizedSegments[0].start_time,
            end_time: normalizedSegments.at(-1)?.end_time,
          },
        ],
      ));
    }
    compositionLeases = await acquirePlanningResourceLeases(
      base44,
      user,
      context,
      compositionRequestHash,
      compositionDescriptors,
    );

  const sourceKey = composeAndAssignMode
    ? `task-compose-and-assign:${context.idempotencyKey}`
    : `task-composition:${context.idempotencyKey}`;
  const sourceKeyMatches = requestedShiftId
    ? []
    : await filterAllRecords(base44.asServiceRole.entities.PlanningShift, { source_key: sourceKey });
  let reconciledSourceShift: LooseRecord | null = null;
  if (sourceKeyMatches.length > 1) {
    await renewPlanningResourceLeases(base44, user, compositionLeases);
    reconciledSourceShift = await reconcilePlanningShiftSourceKey(
      base44,
      user,
      sourceKey,
      () => renewPlanningResourceLeases(base44, user, compositionLeases),
      candidate => assertNoForeignPendingMutation(
        base44,
        candidate,
        context,
        action,
        user,
        compositionRequestHash,
      ),
    );
  }
  let shift = requestedShiftId
    ? await requireRecord(base44, 'PlanningShift', requestedShiftId, 'Dienst')
    : reconciledSourceShift || sourceKeyMatches[0] || null;
  let lockedUpdateAssignmentsAll: LooseRecord[] | null = null;
  if (requestedShiftId) {
    const [lockedSegments, lockedAssignments] = await Promise.all([
      filterAllRecords(base44.asServiceRole.entities.PlanningShiftTaskSegment, { shift_id: requestedShiftId }),
      filterAllRecords(base44.asServiceRole.entities.PlanningAssignment, { shift_id: requestedShiftId }),
    ]);
    const assignmentKeys = (items: LooseRecord[]) => items
      .filter(item => item.status !== 'removed')
      .map(item => `${item.id}:${item.personnel_id}:${Number(item.slot_index || 0)}:${revisionOf(item)}`)
      .sort();
    if (stableStringify(assignmentKeys(lockedAssignments)) !== stableStringify(assignmentKeys(initialUpdateAssignments))) {
      throw new ApiError(409, 'Dienstbezetting is intussen gewijzigd; laad het rooster opnieuw');
    }
    const lockedAffectedOccurrenceIds = uniqueStrings([
      ...occurrenceIds,
      ...lockedSegments
        .filter((item: LooseRecord) => item.status !== 'removed')
        .map((item: LooseRecord) => item.task_occurrence_id),
      ...initialRecoveryOccurrenceIds,
      ...completedReplayOccurrenceIds,
    ]).sort();
    if (stableStringify([...affectedOccurrenceIds].sort()) !== stableStringify(lockedAffectedOccurrenceIds)) {
      throw new ApiError(409, 'Dienstinhoud is intussen gewijzigd; laad het rooster opnieuw');
    }
    lockedUpdateAssignmentsAll = lockedAssignments;
    const targetRequiredCount = positiveInteger(
      body.required_count ?? shift?.required_count ?? 1,
      'required_count',
    );
    const activeLockedAssignments = lockedAssignments.filter(item => item.status !== 'removed');
    const invalidAssignmentSlots = activeLockedAssignments.filter(item => (
      Number(item.slot_index || 0) >= targetRequiredCount
    ));
    if (
      activeLockedAssignments.length > targetRequiredCount
      || invalidAssignmentSlots.length
    ) {
      throw new ApiError(409, 'required_count kan niet lager zijn dan de bestaande dienstbezetting', {
        shift_id: requestedShiftId,
        required_count: targetRequiredCount,
        active_assignment_count: activeLockedAssignments.length,
        invalid_assignment_ids: invalidAssignmentSlots.map(item => item.id),
      });
    }
  }
  if (shift) {
    await assertNoForeignPendingMutation(
      base44,
      shift,
      context,
      action,
      user,
      compositionRequestHash,
    );
  }
  if (composeAndAssignMode && shift) {
    const recovery = shift.metadata?.compose_and_assign;
    if (
      recovery?.idempotency_key !== context.idempotencyKey
      || recovery?.request_hash !== composeAndAssignRequestHash
      || recovery?.actor_user_id !== (user.id || null)
      || recovery?.personnel_id !== requestedPersonnelId
      || Number(recovery?.slot_index) !== requestedSlotIndex
    ) {
      throw new ApiError(409, 'Bestaande herstelstaat hoort bij een andere compose_and_assign-opdracht', {
        shift_id: shift.id,
      });
    }
    if (recovery.phase === 'completed') {
      const [storedSegments, storedAssignment] = await Promise.all([
        filterAllRecords(base44.asServiceRole.entities.PlanningShiftTaskSegment, { shift_id: shift.id }),
        recovery.assignment_id
          ? getRecord(base44, 'PlanningAssignment', recovery.assignment_id)
          : Promise.resolve(null),
      ]);
      const expectedSegmentIds = new Set(uniqueStrings(recovery.segment_ids));
      const activeStoredSegments = storedSegments.filter((item: LooseRecord) => item.status !== 'removed');
      const storedStateComplete = Boolean(
        storedAssignment
        && storedAssignment.status !== 'removed'
        && storedAssignment.metadata?.compose_and_assign_request_hash === composeAndAssignRequestHash
        && String(storedAssignment.personnel_id) === String(requestedPersonnelId)
        && Number(storedAssignment.slot_index) === requestedSlotIndex
        && activeStoredSegments.length === expectedSegmentIds.size
        && activeStoredSegments.every((item: LooseRecord) => expectedSegmentIds.has(String(item.id)))
      );
      if (storedStateComplete) {
        composeAndAssignState.shiftId = shift.id;
        composeAndAssignState.phaseCompleted = true;
        const recoveredResult = {
          shift,
          segments: activeStoredSegments,
          assignment: storedAssignment,
          assignments: [storedAssignment],
          task_occurrences: occurrences,
          composition_warnings: normalizeArray(shift.service_context_snapshot?.composition_warnings),
        };
        await renewPlanningResourceLeases(base44, user, compositionLeases);
        const recoveryAudit = await appendAudit(base44, user, {
          action,
          resource_type: 'PlanningShift',
          resource_id: shift.id,
          shift_id: shift.id,
          assignment_id: storedAssignment.id,
          before_state: { shift: null, segments: [], assignments: [] },
          after_state: recoveredResult,
          correlation_id: context.correlationId,
          idempotency_key: context.idempotencyKey,
          undoable: false,
          metadata: {
            request_hash: composeAndAssignRequestHash,
            assignment_source: compact(body.assignment_source) || 'compose_and_assign',
            task_occurrence_ids: occurrenceIds,
            task_segment_count: activeStoredSegments.length,
            recovered_completed_state: true,
          },
        });
        composeAndAssignState.auditCompleted = true;
        await mutateIdempotencyClaim(
          base44,
          user,
          context,
          composeAndAssignRequestHash as string,
          'completed',
        );
        await renewPlanningResourceLeases(base44, user, compositionLeases);
        const releaseErrors = await releasePlanningResourceLeases(base44, user, compositionLeases);
        compositionLeases = [];
        if (releaseErrors.length) {
          throw new ApiError(503, 'Planningactie is opgeslagen, maar de personeelsreservering kon niet worden vrijgegeven', {
            release_errors: releaseErrors,
          });
        }
        return {
          ok: true,
          idempotent: true,
          ...recoveredResult,
          audit_event_id: recoveryAudit.id,
          undoable: false,
          undo_token: null,
        };
      }
    }
  }
  const compositionRecovery = shift?.metadata?.planning_composition;
  if (
    compositionRecovery?.idempotency_key === context.idempotencyKey
    && (
      compositionRecovery?.request_hash !== compositionRequestHash
      || compositionRecovery?.actor_user_id !== (user.id || null)
    )
  ) {
    throw new ApiError(409, 'idempotency_key hoort bij een andere bestaande dienstsamenstelling', {
      shift_id: shift.id,
    });
  }
  const recovering = Boolean(
    shift
    && shift.metadata?.last_composition_idempotency_key === context.idempotencyKey
    && shift.metadata?.last_composition_actor_user_id === (user.id || null)
    && compositionRecovery?.request_hash === compositionRequestHash
    && compositionRecovery?.actor_user_id === (user.id || null)
  );
  const ownedComposeAndAssignRecovery = Boolean(
    composeAndAssignMode
    && shift?.metadata?.compose_and_assign?.idempotency_key === context.idempotencyKey
    && shift?.metadata?.compose_and_assign?.request_hash === composeAndAssignRequestHash
    && shift?.metadata?.compose_and_assign?.actor_user_id === (user.id || null)
    && shift?.metadata?.compose_and_assign?.phase !== 'completed'
  );
  const ownedCompositionRecovery = Boolean(
    shift
    && compositionRecovery?.idempotency_key === context.idempotencyKey
    && compositionRecovery?.request_hash === compositionRequestHash
    && compositionRecovery?.actor_user_id === (user.id || null)
    && compositionRecovery?.phase !== 'completed'
  );
  if (completedCompositionReplay) {
    const exactCompletedComposition = Boolean(
      compositionRecovery?.phase === 'completed'
      && compositionRecovery?.idempotency_key === context.idempotencyKey
      && compositionRecovery?.request_hash === compositionRequestHash
      && compositionRecovery?.actor_user_id === (user.id || null)
    );
    if (!exactCompletedComposition) {
      throw new ApiError(409, 'De afgeronde dienstsamenstelling hoort niet bij deze herstelopdracht', {
        shift_id: shift?.id || null,
      });
    }
    const occurrenceClearErrors = await clearCompletedCompositionOccurrenceReservations(
      base44,
      user,
      context,
      compositionRequestHash,
      affectedOccurrenceIds,
      compositionLeases,
    );
    if (occurrenceClearErrors.length) {
      throw new ApiError(503, 'Dienst is opgeslagen, maar taakreserveringen konden niet worden afgerond', {
        recovery_errors: occurrenceClearErrors,
      });
    }
    const releaseErrors = await releasePlanningResourceLeases(base44, user, compositionLeases);
    compositionLeases = [];
    if (releaseErrors.length) {
      throw new ApiError(503, 'Dienst is opgeslagen, maar de samenstellingsreservering kon niet worden vrijgegeven', {
        release_errors: releaseErrors,
      });
    }
    return replayResult(completedCompositionReplay);
  }
  if (shift?.status === 'cancelled' && !ownedComposeAndAssignRecovery && !ownedCompositionRecovery) {
    throw new ApiError(409, 'Een geannuleerde dienst kan niet worden samengesteld');
  }
  if (requestedShiftId && shift.source_type !== 'task' && !recovering) {
    throw new ApiError(409, 'Alleen een vanuit objecttaken samengestelde dienst kan hier worden bewerkt');
  }
  if (requestedShiftId && !recovering) {
    const expectedShiftRevision = positiveInteger(body.expected_shift_revision, 'expected_shift_revision');
    if (revisionOf(shift) !== expectedShiftRevision) {
      throw new ApiError(409, 'Planning is intussen gewijzigd', {
        entity: 'PlanningShift',
        id: shift.id,
        expected_revision: expectedShiftRevision,
        current_revision: revisionOf(shift),
      });
    }
  }

  if (pendingCompositionAudit) {
    if (!shift || !ownedCompositionRecovery) {
      throw new ApiError(409, 'De geaudite dienstsamenstelling heeft geen herstelbare pending dienst');
    }
    const storedSegments = (await filterAllRecords(
      base44.asServiceRole.entities.PlanningShiftTaskSegment,
      { shift_id: shift.id },
    )).filter((item: LooseRecord) => item.status !== 'removed');
    const expectedSegmentIds = new Set(uniqueStrings(
      normalizeArray<LooseRecord>(pendingCompositionAudit.after_state?.segments).map(item => item.id),
    ));
    const occurrenceStateComplete = affectedOccurrences.every(occurrence => {
      const reservation = occurrence.metadata?.planning_composition_reservation;
      const reservationOwnedByThisComposition = !reservation || (
        reservation.idempotency_key === context.idempotencyKey
        && reservation.request_hash === compositionRequestHash
        && reservation.actor_user_id === (user.id || null)
      );
      return occurrence.metadata?.last_composition_idempotency_key === context.idempotencyKey
        && occurrence.metadata?.last_composition_request_hash === compositionRequestHash
        && occurrence.metadata?.last_composition_actor_user_id === (user.id || null)
        && reservationOwnedByThisComposition;
    });
    const segmentStateComplete = storedSegments.length === expectedSegmentIds.size
      && storedSegments.every(item => expectedSegmentIds.has(String(item.id)));
    if (!occurrenceStateComplete || !segmentStateComplete) {
      throw new ApiError(409, 'De geaudite dienstsamenstelling is niet volledig herstelbaar', {
        shift_id: shift.id,
        occurrence_state_complete: occurrenceStateComplete,
        segment_state_complete: segmentStateComplete,
      });
    }
    await renewPlanningResourceLeases(base44, user, compositionLeases);
    const completedShift = await casUpdate(base44, 'PlanningShift', shift, revisionOf(shift), {
      status: 'draft',
      metadata: {
        ...(shift.metadata || {}),
        planning_composition: {
          ...(shift.metadata?.planning_composition || {}),
          phase: 'completed',
          segment_ids: storedSegments.map(item => item.id),
          completed_at: nowIso(),
        },
        ...(composeAndAssignMode ? {
          compose_and_assign: {
            ...(shift.metadata?.compose_and_assign || {}),
            phase: 'completed',
            assignment_id: pendingCompositionAudit.after_state?.assignment?.id || null,
            segment_ids: storedSegments.map(item => item.id),
            completed_at: nowIso(),
          },
        } : {}),
      },
      last_modified_by_user_id: user.id || null,
      last_modified_at: nowIso(),
    });
    const occurrenceClearErrors = await clearCompletedCompositionOccurrenceReservations(
      base44,
      user,
      context,
      compositionRequestHash,
      affectedOccurrenceIds,
      compositionLeases,
    );
    if (occurrenceClearErrors.length) {
      throw new ApiError(503, 'Dienst is hersteld, maar taakreserveringen konden niet worden afgerond', {
        recovery_errors: occurrenceClearErrors,
      });
    }
    const releaseErrors = await releasePlanningResourceLeases(base44, user, compositionLeases);
    compositionLeases = [];
    if (releaseErrors.length) {
      throw new ApiError(503, 'Dienst is hersteld, maar de samenstellingsreservering kon niet worden vrijgegeven', {
        release_errors: releaseErrors,
      });
    }
    if (composeAndAssignMode) {
      composeAndAssignState.phaseCompleted = true;
      composeAndAssignState.auditCompleted = true;
      await mutateIdempotencyClaim(
        base44,
        user,
        context,
        composeAndAssignRequestHash as string,
        'completed',
      );
    }
    return {
      ...replayResult(pendingCompositionAudit),
      shift: completedShift,
      segments: storedSegments,
      task_occurrences: affectedOccurrences,
    };
  }

  const segmentEntity = base44.asServiceRole.entities.PlanningShiftTaskSegment;
  const relevantSegmentReads = [
    filterAllRecords(
      segmentEntity,
      { task_occurrence_id: { $in: affectedOccurrenceIds } },
      '-start_date',
    ),
  ];
  if (shift?.id) {
    // A recovery/update can carry historical segments that are no longer in
    // the requested set. Keep those available for the replace/remove phase.
    relevantSegmentReads.push(filterAllRecords(segmentEntity, { shift_id: shift.id }, '-start_date'));
  }
  const relevantSegments = uniqueRecords(
    (await Promise.all(relevantSegmentReads)).flat(),
    item => String(item.id),
  );
  const relevantParentShiftIds = uniqueStrings([
    ...relevantSegments.map(item => item.shift_id),
    shift?.id,
  ]);
  const fetchedParentShifts = relevantParentShiftIds.length
    ? await filterAllRecords(
        base44.asServiceRole.entities.PlanningShift,
        { id: { $in: relevantParentShiftIds } },
      )
    : [];
  const relevantParentShifts = uniqueRecords(
    [...fetchedParentShifts, ...(shift ? [shift] : [])],
    item => String(item.id),
  );
  const otherActiveSegments = activeTaskSegments(relevantSegments, relevantParentShifts).filter((item: LooseRecord) =>
    (!shift || String(item.shift_id) !== String(shift.id))
    && occurrenceById.has(String(item.task_occurrence_id))
  );
  for (const occurrence of occurrences) {
    const proposed = normalizedSegments.filter(item => String(item.task_occurrence_id) === String(occurrence.id));
    const external = otherActiveSegments.filter((item: LooseRecord) =>
      String(item.task_occurrence_id) === String(occurrence.id)
    );
    const intervals = [...external, ...proposed]
      .map(segmentInterval)
      .filter((item): item is NonNullable<typeof item> => item != null)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    for (let index = 1; index < intervals.length; index += 1) {
      if (intervals[index].start < intervals[index - 1].end) {
        throw new ApiError(409, 'Dezelfde taakuitvoering is al op een overlappend moment ingepland', {
          task_occurrence_id: occurrence.id,
        });
      }
    }
    const allocatedMinutes = mergeMinuteIntervals(intervals)
      .reduce((sum, interval) => sum + interval.end - interval.start, 0);
    if (allocatedMinutes > Number(occurrence.required_minutes || 0)) {
      throw new ApiError(409, 'De taakuitvoering zou meer minuten krijgen dan vereist', {
        task_occurrence_id: occurrence.id,
        allocated_minutes: allocatedMinutes,
        required_minutes: Number(occurrence.required_minutes || 0),
      });
    }
  }

  const objectIds = uniqueStrings(occurrences.map(item => item.object_id));
  const customerIds = uniqueStrings(occurrences.map(item => item.customer_id));
  const [objects, customers] = await Promise.all([
    Promise.all(objectIds.map(id => requireRecord(base44, 'SurveillanceObject', id, 'Object'))),
    Promise.all(customerIds.map(id => requireRecord(base44, 'Customer', id, 'Klant'))),
  ]);
  const objectsWithoutOperatingCompany = objects.filter(item => !compact(item.default_operating_company_id));
  const companyIds = uniqueStrings(objects.map(item => item.default_operating_company_id));
  if (companyIds.length > 1) {
    throw new ApiError(409, 'Taken van verschillende uitvoerende bedrijven kunnen niet in één dienst', {
      company_ids: companyIds,
    });
  }
  // During the phased object/company rollout a task may already be plannable
  // while its object has no operating-company default yet. Never infer the one
  // known company for a partially configured multi-object shift: keep the
  // aggregate company unresolved until every object agrees on the same value.
  const resolvedCompanyId = objectsWithoutOperatingCompany.length === 0
    ? companyIds[0] || null
    : null;
  const firstSegment = normalizedSegments[0];
  const lastSegment = normalizedSegments.at(-1) as LooseRecord;
  const warnings = compositionWarnings(normalizedSegments);
  if (objectsWithoutOperatingCompany.length) {
    warnings.push(warning(
      'operating_company_unresolved',
      'warning',
      'Uitvoerend bedrijf is nog niet voor ieder object vastgelegd. De dienst kan als concept worden gepland, maar vereist handmatige controle voordat contract- en CAO-koppeling definitief zijn.',
      'SurveillanceObject',
      {
        object_ids: objectsWithoutOperatingCompany.map(item => item.id),
        configured_company_ids: companyIds,
      },
    ));
  }
  const requestedName = compact(body.service_name || body.name);
  const serviceName = requestedName.slice(0, 160) || (
    normalizedSegments.length === 1
      ? `${firstSegment.task_name_snapshot} · ${firstSegment.object_name_snapshot || 'Object'}`
      : `Samengestelde dienst · ${normalizedSegments.length} taken`
  );
  const strictPolicies = objects.map(item => item.contract_assignment_policy).filter(Boolean);
  const shiftPayload = {
    source_type: 'task',
    source_id: occurrences.length === 1 ? occurrences[0].object_task_definition_id : null,
    source_shift_id: null,
    source_route_execution_id: null,
    company_id: resolvedCompanyId,
    customer_id: customerIds.length === 1 ? customerIds[0] : null,
    customer_ids: customerIds,
    object_id: objectIds.length === 1 ? objectIds[0] : null,
    object_ids: objectIds,
    route_id: null,
    task_id: null,
    task_occurrence_ids: occurrenceIds,
    task_segment_count: normalizedSegments.length,
    customer_contract_line_id: null,
    customer_name_snapshot: customers.length === 1 ? customerDisplayName(customers[0]) : null,
    object_name_snapshot: objects.length === 1 ? objects[0].name || null : null,
    route_name_snapshot: null,
    service_name_snapshot: serviceName,
    service_date: firstSegment.start_date,
    end_date: lastSegment.end_date === firstSegment.start_date ? null : lastSegment.end_date,
    start_time: firstSegment.start_time,
    end_time: lastSegment.end_time,
    timezone: 'Europe/Amsterdam',
    duration_minutes: lastSegment._interval.end - firstSegment._interval.start,
    required_count: composeAndAssignMode
      ? requestedRequiredCount
      : positiveInteger(body.required_count || shift?.required_count || 1, 'required_count'),
    cao_key: consistentValue(objects.map(item => item.cao_key)),
    service_function_type: consistentValue(objects.map(item => item.default_service_function_type)),
    required_cao_function_group: consistentValue(objects.map(item => item.default_cao_function_group)),
    required_cao_function_level: consistentValue(objects.map(item => item.default_cao_function_level)),
    required_security_role_status: consistentValue(objects.map(item => item.default_security_role_status)),
    required_qualification_types: uniqueStrings(objects.flatMap(item => item.default_required_qualification_types || [])),
    required_qualification_groups: uniqueStrings(objects.flatMap(item => item.default_required_qualification_groups || [])),
    contract_assignment_policy: objectsWithoutOperatingCompany.length === 0
      && strictPolicies.length === objects.length
      && strictPolicies.every(item => item === 'strict_contract_match')
      ? 'strict_contract_match'
      : 'allow_manual_review',
    performs_security_work: commonBoolean(objects.map(item => item.default_performs_security_work)),
    security_work_percentage: objects.length === 1 ? objects[0].default_security_work_percentage ?? null : null,
    works_event_or_hospitality_security: commonBoolean(objects.map(item => item.default_works_event_or_hospitality_security)),
    event_hospitality_cao_applies: commonBoolean(objects.map(item => item.default_event_hospitality_cao_applies)),
    works_airport_schiphol: commonBoolean(objects.map(item => item.default_works_airport_schiphol)),
    works_cash_value_logistics: commonBoolean(objects.map(item => item.default_works_cash_value_logistics)),
    customer_billable: commonBoolean(objects.map(item => item.default_customer_billable)),
    counts_toward_required_staffing: commonBoolean(objects.map(item => item.default_counts_toward_required_staffing)),
    service_context_snapshot: {
      composition_source: 'ObjectTaskDefinition',
      task_occurrence_ids: occurrenceIds,
      object_task_definition_ids: uniqueStrings(occurrences.map(item => item.object_task_definition_id)),
      object_ids: objectIds,
      customer_ids: customerIds,
      segment_contexts: normalizedSegments.map(item => ({
        task_occurrence_id: item.task_occurrence_id,
        customer_id: item.customer_id,
        customer_name: item.customer_name_snapshot,
        object_id: item.object_id,
        object_name: item.object_name_snapshot,
        task_type: item.task_type,
        task_name: item.task_name_snapshot,
      })),
      composition_warnings: warnings,
    },
    // A compose_and_assign shift is invisible to all readers until the final
    // single-record commit flips both status and saga phase.
    // Every composition stays outside normal readers until its audit exists
    // and the final single-record commit marks the saga completed.
    status: 'cancelled',
    last_modified_by_user_id: user.id || null,
    last_modified_at: nowIso(),
    metadata: {
      ...(shift?.metadata || {}),
      last_composition_idempotency_key: context.idempotencyKey,
      last_composition_correlation_id: context.correlationId,
      last_composition_actor_user_id: user.id || null,
      planning_composition: {
        idempotency_key: context.idempotencyKey,
        correlation_id: context.correlationId,
        request_hash: compositionRequestHash,
        actor_user_id: user.id || null,
        affected_occurrence_ids: affectedOccurrenceIds,
        phase: 'pending',
        started_at: shift?.metadata?.planning_composition?.started_at || nowIso(),
      },
      ...(composeAndAssignMode ? {
        compose_and_assign: {
          idempotency_key: context.idempotencyKey,
          correlation_id: context.correlationId,
          request_hash: composeAndAssignRequestHash,
          actor_user_id: user.id || null,
          personnel_id: requestedPersonnelId,
          slot_index: requestedSlotIndex,
          phase: 'composition_pending',
          started_at: shift?.metadata?.compose_and_assign?.started_at || nowIso(),
        },
      } : {}),
    },
  };

  let requestedAssignmentBefore: LooseRecord | null = null;
  if (composeAndAssignMode) {
    requestedAssignmentBefore = shift
      ? await uniqueSlotAssignment(base44, shift.id, requestedSlotIndex)
      : null;
    if (
      requestedAssignmentBefore
      && requestedAssignmentBefore.status !== 'removed'
      && String(requestedAssignmentBefore.personnel_id) !== String(requestedPersonnelId)
    ) {
      throw new ApiError(409, 'De bezettingsplaats is al door een andere medewerker ingevuld', {
        shift_id: shift?.id || null,
        slot_index: requestedSlotIndex,
        assignment_id: requestedAssignmentBefore.id,
      });
    }
    if (shift) {
      const samePersonnelAssignments = await filterAllRecords(base44.asServiceRole.entities.PlanningAssignment, {
        shift_id: shift.id,
        personnel_id: requestedPersonnelId,
      });
      const duplicateAssignment = samePersonnelAssignments.find((item: LooseRecord) =>
        item.status !== 'removed' && item.id !== requestedAssignmentBefore?.id
      );
      if (duplicateAssignment) {
        throw new ApiError(409, 'Medewerker is al aan deze dienst toegewezen', {
          shift_id: shift.id,
          personnel_id: requestedPersonnelId,
          assignment_id: duplicateAssignment.id,
        });
      }
    }
  }

  const reservedOccurrences: LooseRecord[] = [];
  const reservationExpiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  await renewPlanningResourceLeases(base44, user, compositionLeases);
  for (const occurrence of [...affectedOccurrences].sort((left, right) => String(left.id).localeCompare(String(right.id)))) {
    await assertNoForeignPendingSingleTaskOccurrenceMutation(
      base44,
      occurrence,
      context,
      user,
      compositionRequestHash,
    );
    const reservation = occurrence.metadata?.planning_composition_reservation;
    if (
      reservation?.idempotency_key === context.idempotencyKey
      && reservation?.request_hash === compositionRequestHash
      && reservation?.actor_user_id === (user.id || null)
    ) {
      reservedOccurrences.push(occurrence);
      if (composeAndAssignMode) {
        composeAndAssignState.reservedOccurrenceIds = uniqueStrings([
          ...composeAndAssignState.reservedOccurrenceIds,
          occurrence.id,
        ]);
      }
      continue;
    }
    if (
      occurrence.metadata?.last_composition_idempotency_key === context.idempotencyKey
      && occurrence.metadata?.last_composition_request_hash === compositionRequestHash
      && occurrence.metadata?.last_composition_actor_user_id === (user.id || null)
      && !occurrence.metadata?.planning_composition_reservation
    ) {
      reservedOccurrences.push(occurrence);
      continue;
    }
    const compensatedByThisRequest = composeAndAssignMode
      && occurrence.metadata?.last_compose_and_assign_recovery_idempotency_key === context.idempotencyKey
      && occurrence.metadata?.last_compose_and_assign_recovery_actor_user_id === (user.id || null);
    const compensatedByThisComposition = occurrence.metadata?.last_composition_recovery_idempotency_key === context.idempotencyKey
      && occurrence.metadata?.last_composition_recovery_request_hash === compositionRequestHash
      && occurrence.metadata?.last_composition_recovery_actor_user_id === (user.id || null)
      && Number(occurrence.metadata?.last_composition_recovery_revision) === revisionOf(occurrence);
    const expectedRevision = compensatedByThisRequest || compensatedByThisComposition
      ? revisionOf(occurrence)
      : expectedOccurrenceRevisionById.get(String(occurrence.id)) as number;
    await renewPlanningResourceLeases(base44, user, compositionLeases);
    const reservedOccurrence = await casUpdate(
      base44,
      'PlanningTaskOccurrence',
      occurrence,
      expectedRevision,
      {
        last_modified_by_user_id: user.id || null,
        last_modified_at: nowIso(),
        metadata: {
          ...(occurrence.metadata || {}),
          planning_composition_reservation: {
            idempotency_key: context.idempotencyKey,
            correlation_id: context.correlationId,
            action,
            request_hash: compositionRequestHash,
            actor_user_id: user.id || null,
            status: 'pending',
            acquired_at: nowIso(),
            expires_at: reservationExpiresAt,
          },
        },
      },
    );
    reservedOccurrences.push(reservedOccurrence);
    if (composeAndAssignMode) {
      composeAndAssignState.reservedOccurrenceIds = uniqueStrings([
        ...composeAndAssignState.reservedOccurrenceIds,
        occurrence.id,
      ]);
    }
  }

  const beforeShift = shift;
  await renewPlanningResourceLeases(base44, user, compositionLeases);
  // From the first shift write onward, the occurrence reservation is the
  // durable fence that keeps a different key from overtaking this recovery.
  compositionBusinessWriteStarted = true;
  if (shift) {
    shift = await casUpdate(base44, 'PlanningShift', shift, revisionOf(shift), shiftPayload);
  } else {
    shift = await base44.asServiceRole.entities.PlanningShift.create({
      ...shiftPayload,
      source_key: sourceKey,
      revision: 1,
      published_revision: 0,
      last_published_correlation_id: null,
    });
  }
  if (composeAndAssignMode) composeAndAssignState.shiftId = shift.id;

  const previousSegments = relevantSegments.filter((item: LooseRecord) =>
    String(item.shift_id) === String(shift.id) && item.status !== 'removed'
  );
  for (const segment of previousSegments) {
    await renewPlanningResourceLeases(base44, user, compositionLeases);
    await casUpdate(base44, 'PlanningShiftTaskSegment', segment, revisionOf(segment), {
      status: 'removed',
      last_modified_by_user_id: user.id || null,
      last_modified_at: nowIso(),
      metadata: { ...(segment.metadata || {}), removed_by_composition_key: context.idempotencyKey },
    });
  }

  const createdSegments: LooseRecord[] = [];
  for (const segment of normalizedSegments) {
    const { _interval, ...safeSegment } = segment;
    await renewPlanningResourceLeases(base44, user, compositionLeases);
    createdSegments.push(await base44.asServiceRole.entities.PlanningShiftTaskSegment.create({
      ...safeSegment,
      shift_id: shift.id,
      status: 'draft',
      revision: 1,
      published_revision: 0,
      last_published_correlation_id: null,
      last_modified_by_user_id: user.id || null,
      last_modified_at: nowIso(),
      metadata: {
        composition_idempotency_key: context.idempotencyKey,
        composition_correlation_id: context.correlationId,
        ...(composeAndAssignMode ? {
          compose_and_assign_request_hash: composeAndAssignRequestHash,
        } : {}),
      },
    }));
  }

  const assignmentsBeforeMutation = lockedUpdateAssignmentsAll || await filterAllRecords(
    base44.asServiceRole.entities.PlanningAssignment,
    { shift_id: shift.id },
  );
  let requestedAssignment: LooseRecord | null = null;
  if (composeAndAssignMode) {
    const targetAssignment = await uniqueSlotAssignment(base44, shift.id, requestedSlotIndex);
    if (
      targetAssignment
      && targetAssignment.status !== 'removed'
      && String(targetAssignment.personnel_id) !== String(requestedPersonnelId)
    ) {
      throw new ApiError(409, 'De bezettingsplaats is intussen door een andere medewerker ingevuld', {
        shift_id: shift.id,
        slot_index: requestedSlotIndex,
        assignment_id: targetAssignment.id,
      });
    }
    const finalSuppliedWarnings = normalizeSuppliedWarnings(body);
    if (objectIds.length > 1) finalSuppliedWarnings.push(warning(
      'multi_object_shift_review',
      'warning',
      'Deze medewerker voert binnen één dienst taken op meerdere objecten uit; controleer autorisaties en reistijd.',
      'planner',
      { object_ids: objectIds },
    ));
    const provisionalWarnings = dedupeWarnings(finalSuppliedWarnings);
    const assignmentPayload = {
      personnel_id: requestedPersonnel?.id,
      personnel_name_snapshot: requestedPersonnel?.name
        || [requestedPersonnel?.call_name || requestedPersonnel?.first_name, requestedPersonnel?.name_prefix, requestedPersonnel?.last_name]
          .filter(Boolean)
          .join(' ')
        || 'Medewerker',
      personnel_contract_id: null,
      status: 'draft',
      warning_codes: [...new Set(provisionalWarnings.map(item => item.code))],
      warning_snapshot: provisionalWarnings,
      has_critical_warnings: provisionalWarnings.some(item => item.severity === 'critical'),
      contract_routing_snapshot: null,
      assigned_by_user_id: user.id || null,
      assigned_at: nowIso(),
      removed_by_user_id: null,
      removed_at: null,
      last_published_correlation_id: targetAssignment?.last_published_correlation_id || null,
      metadata: {
        ...(targetAssignment?.metadata || {}),
        assignment_source: compact(body.assignment_source) || 'compose_and_assign',
        compose_and_assign_idempotency_key: context.idempotencyKey,
        compose_and_assign_correlation_id: context.correlationId,
        compose_and_assign_request_hash: composeAndAssignRequestHash,
      },
    };
    const writtenAssignment: LooseRecord = targetAssignment
      ? await casUpdate(
          base44,
          'PlanningAssignment',
          targetAssignment,
          revisionOf(targetAssignment),
          assignmentPayload,
        )
      : await base44.asServiceRole.entities.PlanningAssignment.create({
          shift_id: shift.id,
          slot_index: requestedSlotIndex,
          ...assignmentPayload,
          revision: 1,
          published_revision: 0,
        });
    await renewPlanningResourceLeases(base44, user, compositionLeases);
    const finalPersonnel = await requireRecord(
      base44,
      'Personnel',
      requestedPersonnelId as string,
      'Medewerker',
    );
    const finalEligibility = await evaluateAssignmentWarnings(
      base44,
      shift,
      finalPersonnel,
      writtenAssignment.id,
      finalSuppliedWarnings,
    );
    await renewPlanningResourceLeases(base44, user, compositionLeases);
    requestedAssignment = await casUpdate(
      base44,
      'PlanningAssignment',
      writtenAssignment,
      revisionOf(writtenAssignment),
      {
        personnel_contract_id: finalEligibility.personnel_contract_id,
        warning_codes: finalEligibility.warning_codes,
        warning_snapshot: finalEligibility.warning_snapshot,
        has_critical_warnings: finalEligibility.has_critical_warnings,
        contract_routing_snapshot: finalEligibility.contract_routing_snapshot,
        metadata: {
          ...(writtenAssignment.metadata || {}),
          final_assignment_validation_at: nowIso(),
        },
      },
    );
  }

  const assignmentsForRevalidation = composeAndAssignMode && requestedAssignment
    ? [
        ...assignmentsBeforeMutation.filter(item => item.id !== requestedAssignment?.id),
        requestedAssignment,
      ]
    : assignmentsBeforeMutation;
  const updatedAssignments: LooseRecord[] = [];
  for (const assignment of assignmentsForRevalidation.filter((item: LooseRecord) => item.status !== 'removed')) {
    if (requestedAssignment && assignment.id === requestedAssignment.id) {
      updatedAssignments.push(requestedAssignment);
      continue;
    }
    const personnel = await requireRecord(base44, 'Personnel', assignment.personnel_id, 'Medewerker');
    const supplied = normalizeArray(assignment.warning_snapshot)
      .filter((item: LooseRecord) => item.source === 'planner');
    if (objectIds.length > 1) supplied.push(warning(
      'multi_object_shift_review',
      'warning',
      'Deze medewerker voert binnen één dienst taken op meerdere objecten uit; controleer autorisaties en reistijd.',
      'planner',
      { object_ids: objectIds },
    ));
    const eligibility = await evaluateAssignmentWarnings(base44, shift, personnel, assignment.id, supplied);
    await renewPlanningResourceLeases(base44, user, compositionLeases);
    updatedAssignments.push(await casUpdate(base44, 'PlanningAssignment', assignment, revisionOf(assignment), {
      status: 'draft',
      warning_codes: eligibility.warning_codes,
      warning_snapshot: eligibility.warning_snapshot,
      has_critical_warnings: eligibility.has_critical_warnings,
      contract_routing_snapshot: eligibility.contract_routing_snapshot,
      personnel_contract_id: eligibility.personnel_contract_id,
    }));
  }

  const finalizedOccurrences: LooseRecord[] = [];
  for (const occurrence of reservedOccurrences) {
    if (occurrence.metadata?.last_composition_idempotency_key === context.idempotencyKey
      && occurrence.metadata?.last_composition_request_hash === compositionRequestHash
      && occurrence.metadata?.last_composition_actor_user_id === (user.id || null)
      && !occurrence.metadata?.planning_composition_reservation) {
      finalizedOccurrences.push(occurrence);
      continue;
    }
    const {
      last_compose_and_assign_recovery_idempotency_key: _recoveryKey,
      last_compose_and_assign_recovery_request_hash: _recoveryHash,
      last_compose_and_assign_recovery_actor_user_id: _recoveryActor,
      last_compose_and_assign_recovery_status: _recoveryStatus,
      last_compose_and_assign_recovery_at: _recoveryAt,
      last_composition_recovery_idempotency_key: _compositionRecoveryKey,
      last_composition_recovery_request_hash: _compositionRecoveryHash,
      last_composition_recovery_actor_user_id: _compositionRecoveryActor,
      last_composition_recovery_status: _compositionRecoveryStatus,
      last_composition_recovery_at: _compositionRecoveryAt,
      last_composition_recovery_revision: _compositionRecoveryRevision,
      ...metadata
    } = occurrence.metadata || {};
    await renewPlanningResourceLeases(base44, user, compositionLeases);
    finalizedOccurrences.push(await casUpdate(
      base44,
      'PlanningTaskOccurrence',
      occurrence,
      revisionOf(occurrence),
      {
        last_modified_by_user_id: user.id || null,
        last_modified_at: nowIso(),
        metadata: {
          ...metadata,
          last_composition_idempotency_key: context.idempotencyKey,
          last_composition_correlation_id: context.correlationId,
          last_composition_request_hash: compositionRequestHash,
          last_composition_actor_user_id: user.id || null,
          last_composition_completed_at: nowIso(),
          ...(composeAndAssignMode ? {
            last_compose_and_assign_idempotency_key: context.idempotencyKey,
            last_compose_and_assign_correlation_id: context.correlationId,
            last_compose_and_assign_request_hash: composeAndAssignRequestHash,
            last_compose_and_assign_actor_user_id: user.id || null,
            last_compose_and_assign_completed_at: nowIso(),
          } : {}),
        },
      },
    ));
  }

  const completionPatch = {
    status: 'draft',
    metadata: {
      ...(shift.metadata || {}),
      planning_composition: {
        ...(shift.metadata?.planning_composition || {}),
        phase: 'completed',
        segment_ids: createdSegments.map(item => item.id),
        completed_at: nowIso(),
      },
      ...(composeAndAssignMode ? {
        compose_and_assign: {
          ...(shift.metadata?.compose_and_assign || {}),
          phase: 'completed',
          assignment_id: requestedAssignment?.id || null,
          segment_ids: createdSegments.map(item => item.id),
          completed_at: nowIso(),
        },
      } : {}),
    },
    last_modified_by_user_id: user.id || null,
    last_modified_at: nowIso(),
  };
  const anticipatedCompletedShift = {
    ...shift,
    ...completionPatch,
    revision: revisionOf(shift) + 1,
  };
  const anticipatedFinalizedOccurrences = finalizedOccurrences.map(occurrence => {
    const { planning_composition_reservation: _reservation, ...metadata } = occurrence.metadata || {};
    return {
      ...occurrence,
      revision: revisionOf(occurrence) + (_reservation ? 1 : 0),
      metadata,
    };
  });
  const result: LooseRecord = {
    shift: anticipatedCompletedShift,
    segments: createdSegments,
    assignments: updatedAssignments,
    ...(requestedAssignment ? { assignment: requestedAssignment } : {}),
    task_occurrences: anticipatedFinalizedOccurrences,
    composition_warnings: warnings,
  };
  await renewPlanningResourceLeases(base44, user, compositionLeases);
  const audit = await appendAudit(base44, user, {
    action,
    resource_type: 'PlanningShift',
    resource_id: shift.id,
    shift_id: shift.id,
    assignment_id: requestedAssignment?.id || null,
    before_state: composeAndAssignMode
      ? { shift: null, segments: [], assignments: [] }
      : { shift: beforeShift, segments: previousSegments, assignments: assignmentsBeforeMutation },
    after_state: result,
    correlation_id: context.correlationId,
    idempotency_key: context.idempotencyKey,
    undoable: false,
    metadata: {
      request_hash: compositionRequestHash,
      ...(composeAndAssignMode ? {
        assignment_source: compact(body.assignment_source) || 'compose_and_assign',
      } : {}),
      task_occurrence_ids: occurrenceIds,
      affected_task_occurrence_ids: affectedOccurrenceIds,
      task_segment_count: createdSegments.length,
    },
  });
  if (composeAndAssignMode) composeAndAssignState.auditCompleted = true;
  // The audit is the visibility gate for every composition. Until it exists
  // the shift remains cancelled+pending and cannot leak into normal readers.
  await renewPlanningResourceLeases(base44, user, compositionLeases);
  shift = await casUpdate(base44, 'PlanningShift', shift, revisionOf(shift), completionPatch);
  result.shift = shift;
  const occurrenceClearErrors = await clearCompletedCompositionOccurrenceReservations(
    base44,
    user,
    context,
    compositionRequestHash,
    affectedOccurrenceIds,
    compositionLeases,
  );
  if (occurrenceClearErrors.length) {
    throw new ApiError(503, 'Dienst is opgeslagen, maar taakreserveringen konden niet worden afgerond', {
      recovery_errors: occurrenceClearErrors,
    });
  }
  if (composeAndAssignMode) composeAndAssignState.phaseCompleted = true;
  if (composeAndAssignMode) {
    composeAndAssignState.auditCompleted = true;
    await mutateIdempotencyClaim(
      base44,
      user,
      context,
      composeAndAssignRequestHash as string,
      'completed',
    );
    await renewPlanningResourceLeases(base44, user, compositionLeases);
    const releaseErrors = await releasePlanningResourceLeases(base44, user, compositionLeases);
    compositionLeases = [];
    if (releaseErrors.length) {
      throw new ApiError(503, 'Planningactie is opgeslagen, maar de personeelsreservering kon niet worden vrijgegeven', {
        release_errors: releaseErrors,
      });
    }
  } else {
    const releaseErrors = await releasePlanningResourceLeases(base44, user, compositionLeases);
    compositionLeases = [];
    if (releaseErrors.length) {
      throw new ApiError(503, 'Dienst is opgeslagen, maar de samenstellingsreservering kon niet worden vrijgegeven', {
        release_errors: releaseErrors,
      });
    }
  }
  return { ok: true, ...result, audit_event_id: audit.id, undoable: false, undo_token: null };
  } catch (error) {
    if (composeAndAssignMode) {
      const recoveryErrors: LooseRecord[] = [];
      if (
        composeAndAssignClaimed
        && composeAndAssignState.phaseCompleted !== true
        && composeAndAssignState.auditCompleted !== true
      ) {
        try {
          // Compensation is itself fenced. A stale worker whose lease expired
          // or was replaced must never undo artifacts a newer retry now owns.
          await renewPlanningResourceLeases(base44, user, compositionLeases);
          recoveryErrors.push(...await compensateComposeAndAssign(
            base44,
            user,
            context,
            composeAndAssignRequestHash as string,
            composeAndAssignState,
            compositionLeases,
          ));
        } catch (fencingError) {
          recoveryErrors.push({
            entity: 'PlanningMutationCoordinator',
            message: (fencingError as Error)?.message || String(fencingError),
            compensation_skipped: true,
          });
        }
      }
      if (composeAndAssignClaimed) {
        try {
          await mutateIdempotencyClaim(
            base44,
            user,
            context,
            composeAndAssignRequestHash as string,
            'retryable',
          );
        } catch (claimError) {
          recoveryErrors.push({
            entity: 'PlanningMutationCoordinator',
            message: (claimError as Error)?.message || String(claimError),
          });
        }
      }
      recoveryErrors.push(...await releasePlanningResourceLeases(base44, user, compositionLeases));
      compositionLeases = [];
      if (recoveryErrors.length && error && typeof error === 'object') {
        (error as any).details = {
          ...((error as any).details || {}),
          compensation_errors: recoveryErrors,
        };
      }
    } else {
      const recoveryErrors = compositionBusinessWriteStarted
        ? []
        : await releaseCompositionOccurrenceReservations(
            base44,
            user,
            context,
            compositionRequestHash,
            affectedOccurrenceIds,
            compositionLeases,
          );
      recoveryErrors.push(...await releasePlanningResourceLeases(base44, user, compositionLeases));
      compositionLeases = [];
      if (recoveryErrors.length && error && typeof error === 'object') {
        (error as any).details = {
          ...((error as any).details || {}),
          compensation_errors: recoveryErrors,
        };
      }
    }
    throw error;
  }
}

const SHARED_TASK_BOUNDARY_ACTION = 'resize_shared_task_boundary';
const REPAIR_SHARED_TASK_BOUNDARY_ACTION = 'repair_shared_task_boundary';

function sharedBoundaryRecordProjection(record: LooseRecord) {
  return {
    id: record.id,
    revision: revisionOf(record),
    source_type: record.source_type || null,
    shift_id: record.shift_id || null,
    task_occurrence_id: record.task_occurrence_id || null,
    service_date: record.service_date || null,
    start_date: record.start_date || null,
    end_date: record.end_date || null,
    start_time: record.start_time || null,
    end_time: record.end_time || null,
    duration_minutes: Number(record.duration_minutes || 0),
    status: record.status || null,
  };
}

function sharedBoundaryAssignmentProjection(record: LooseRecord) {
  return {
    id: record.id,
    revision: revisionOf(record),
    shift_id: record.shift_id || record.planning_shift_id || null,
    personnel_id: record.personnel_id || null,
    slot_index: record.slot_index ?? null,
    status: record.status || null,
    warning_codes: normalizeArray(record.warning_codes),
    warning_snapshot: normalizeArray(record.warning_snapshot),
    has_critical_warnings: Boolean(record.has_critical_warnings),
    contract_routing_snapshot: record.contract_routing_snapshot || null,
    personnel_contract_id: record.personnel_contract_id || null,
  };
}

function sharedBoundaryAssignmentIdentity(record: LooseRecord) {
  return [
    String(record.id || ''),
    String(record.shift_id || record.planning_shift_id || ''),
    String(record.personnel_id || ''),
    String(record.slot_index ?? ''),
  ].join(':');
}

async function sharedBoundaryTargetHash(targetState: LooseRecord) {
  return sha256(stableStringify({
    shifts: normalizeArray<LooseRecord>(targetState?.shifts).map(sharedBoundaryRecordProjection),
    segments: normalizeArray<LooseRecord>(targetState?.segments).map(sharedBoundaryRecordProjection),
    assignments: normalizeArray<LooseRecord>(targetState?.assignments).map(sharedBoundaryAssignmentProjection),
  }));
}

function sharedBoundaryOccurrenceProjection(record: LooseRecord) {
  return {
    id: record.id,
    revision: revisionOf(record),
    service_date: record.service_date || null,
    end_date: record.end_date || null,
    required_minutes: Number(record.required_minutes || 0),
    lifecycle_status: record.lifecycle_status || null,
  };
}

function completedSharedBoundaryMutationState(
  state: LooseRecord,
  auditEventId: string,
  additions: LooseRecord = {},
) {
  return {
    schema_version: 2,
    operation_id: state.operation_id,
    idempotency_key: state.idempotency_key,
    correlation_id: state.correlation_id,
    request_hash: state.request_hash,
    actor_user_id: state.actor_user_id || null,
    task_occurrence_id: state.task_occurrence_id,
    left_shift_id: state.left_shift_id,
    right_shift_id: state.right_shift_id,
    left_segment_id: state.left_segment_id,
    right_segment_id: state.right_segment_id,
    assignment_ids: uniqueStrings([
      ...normalizeArray(state.assignment_ids),
      ...normalizeArray<LooseRecord>(state.before_state?.assignments).map(item => item.id),
    ]),
    boundary_date: state.boundary_date,
    boundary_time: state.boundary_time,
    target_hash: state.target_hash || null,
    phase: 'completed',
    effective_view: 'target',
    audit_event_id: auditEventId,
    started_at: state.started_at || null,
    applied_at: state.applied_at || null,
    completed_at: nowIso(),
    ...additions,
  };
}

function sharedBoundaryBusinessProjectionMatches(record: LooseRecord, projection: LooseRecord) {
  return [
    'service_date',
    'start_date',
    'end_date',
    'start_time',
    'end_time',
    'duration_minutes',
    'status',
  ].every(key => {
    const current = key === 'duration_minutes'
      ? Number(record[key] || 0)
      : record[key] ?? null;
    const expected = key === 'duration_minutes'
      ? Number(projection[key] || 0)
      : projection[key] ?? null;
    return current === expected;
  });
}

function sharedBoundaryOperationId(occurrenceId: string, context: ReturnType<typeof mutationContext>) {
  return `${occurrenceId}:${context.idempotencyKey}`;
}

function sharedBoundaryStateForMutation(
  occurrence: LooseRecord,
  context: ReturnType<typeof mutationContext>,
  user: LooseRecord,
  requestHash: string,
) {
  const state = occurrence?.metadata?.shared_boundary_mutation;
  if (!state || state.idempotency_key !== context.idempotencyKey) return null;
  if (
    state.request_hash !== requestHash
    || state.actor_user_id !== (user.id || null)
  ) {
    throw new ApiError(409, 'idempotency_key hoort bij een andere gedeelde grensbewerking');
  }
  return state;
}

function sharedBoundaryMinute(date: string, time: string) {
  return dateOrdinal(date) * 1440 + (parseClockMinutes(time) as number);
}

function sharedBoundaryShiftTiming(segment: LooseRecord) {
  const interval = segmentInterval(segment);
  if (!interval) throw new ApiError(409, 'Taaksegment heeft geen geldig positief interval');
  if (interval.duration > MAX_COMPOSED_SHIFT_MINUTES) {
    throw new ApiError(409, 'Een handmatig aangepaste dienst mag maximaal 24 uur beslaan', {
      duration_minutes: interval.duration,
      maximum_duration_minutes: MAX_COMPOSED_SHIFT_MINUTES,
    });
  }
  return {
    service_date: segment.start_date,
    end_date: segment.end_date === segment.start_date ? null : segment.end_date,
    start_time: segment.start_time,
    end_time: segment.end_time,
    duration_minutes: interval.duration,
  };
}

function buildSharedBoundaryPlan(
  occurrence: LooseRecord,
  leftShift: LooseRecord,
  rightShift: LooseRecord,
  leftSegment: LooseRecord,
  rightSegment: LooseRecord,
  boundaryDate: string,
  boundaryTime: string,
) {
  if (occurrence.lifecycle_status !== 'active') {
    throw new ApiError(409, 'Een vervallen taakuitvoering kan niet worden aangepast', {
      task_occurrence_id: occurrence.id,
      lifecycle_status: occurrence.lifecycle_status,
    });
  }
  if (String(leftShift.id) === String(rightShift.id)) {
    throw new ApiError(400, 'Een gedeelde grens vereist twee verschillende diensten');
  }
  for (const shift of [leftShift, rightShift]) {
    if (shift.source_type !== 'task' || shift.status === 'cancelled') {
      throw new ApiError(409, 'Alleen twee actieve diensten vanuit dezelfde objecttaak kunnen een grens delen', {
        shift_id: shift.id,
      });
    }
  }
  if (
    String(leftSegment.shift_id) !== String(leftShift.id)
    || String(rightSegment.shift_id) !== String(rightShift.id)
  ) {
    throw new ApiError(409, 'Een taaksegment hoort niet bij de opgegeven dienst');
  }
  if (leftSegment.status === 'removed' || rightSegment.status === 'removed') {
    throw new ApiError(409, 'Een verwijderd taaksegment kan niet worden aangepast');
  }
  if (
    String(leftSegment.task_occurrence_id) !== String(occurrence.id)
    || String(rightSegment.task_occurrence_id) !== String(occurrence.id)
  ) {
    throw new ApiError(409, 'Beide diensten moeten exact dezelfde actieve taakuitvoering vullen');
  }
  const leftInterval = segmentInterval(leftSegment);
  const rightInterval = segmentInterval(rightSegment);
  const occurrenceInterval = intervalFromParts(
    occurrence.service_date,
    occurrence.window_start_time,
    occurrence.end_date,
    occurrence.window_end_time,
  );
  if (!leftInterval || !rightInterval || !occurrenceInterval) {
    throw new ApiError(409, 'De gedeelde taakgrens heeft een ongeldig tijdsinterval');
  }
  if (leftInterval.end !== rightInterval.start) {
    throw new ApiError(409, 'Alleen exact aansluitende diensten kunnen met één gedeelde grens worden aangepast', {
      left_end: `${leftSegment.end_date} ${leftSegment.end_time}`,
      right_start: `${rightSegment.start_date} ${rightSegment.start_time}`,
    });
  }
  const boundaryMinute = sharedBoundaryMinute(boundaryDate, boundaryTime);
  if (boundaryMinute < occurrenceInterval.start || boundaryMinute > occurrenceInterval.end) {
    throw new ApiError(409, 'De nieuwe grens valt buiten het toegestane taakvenster');
  }
  if (boundaryMinute === leftInterval.end) {
    throw new ApiError(409, 'De gedeelde grens staat al op dit tijdstip');
  }
  if (boundaryMinute - leftInterval.start < 5 || rightInterval.end - boundaryMinute < 5) {
    throw new ApiError(409, 'Beide diensten moeten na het verplaatsen minimaal 5 minuten duren', {
      minimum_duration_minutes: 5,
    });
  }
  const proposedLeftSegment = {
    ...leftSegment,
    end_date: boundaryDate,
    end_time: boundaryTime,
    duration_minutes: boundaryMinute - leftInterval.start,
    status: 'draft',
  };
  const proposedRightSegment = {
    ...rightSegment,
    start_date: boundaryDate,
    start_time: boundaryTime,
    duration_minutes: rightInterval.end - boundaryMinute,
    status: 'draft',
  };
  const proposedLeftInterval = segmentInterval(proposedLeftSegment);
  const proposedRightInterval = segmentInterval(proposedRightSegment);
  if (
    !proposedLeftInterval
    || !proposedRightInterval
    || proposedLeftInterval.end !== proposedRightInterval.start
    || proposedLeftInterval.start !== leftInterval.start
    || proposedRightInterval.end !== rightInterval.end
  ) {
    throw new ApiError(409, 'De nieuwe gedeelde grens zou een gat of overlap veroorzaken');
  }
  const proposedLeftShift = {
    ...leftShift,
    ...sharedBoundaryShiftTiming(proposedLeftSegment),
    status: 'draft',
  };
  const proposedRightShift = {
    ...rightShift,
    ...sharedBoundaryShiftTiming(proposedRightSegment),
    status: 'draft',
  };
  return {
    oldBoundaryMinute: leftInterval.end,
    boundaryMinute,
    proposedLeftSegment,
    proposedRightSegment,
    proposedLeftShift,
    proposedRightShift,
  };
}

async function resizeSharedTaskBoundary(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  requireMutationIdempotency(context, SHARED_TASK_BOUNDARY_ACTION);
  const requestHash = await mutationRequestHash(SHARED_TASK_BOUNDARY_ACTION, body);
  const occurrenceId = requireId(body, 'task_occurrence_id');
  const replay = await findReplay(base44, SHARED_TASK_BOUNDARY_ACTION, context.idempotencyKey);
  if (replay) {
    assertReplayFingerprint(replay, user, requestHash, SHARED_TASK_BOUNDARY_ACTION);
    const replayOccurrence = await requireRecord(
      base44,
      'PlanningTaskOccurrence',
      occurrenceId,
      'Taakuitvoering',
    );
    if (unresolvedSharedBoundaryMutation(replayOccurrence)) {
      const repairKey = `repair:${await sha256(`${occurrenceId}:${context.idempotencyKey}`)}`;
      return repairSharedTaskBoundary(
        base44,
        user,
        { action: REPAIR_SHARED_TASK_BOUNDARY_ACTION, task_occurrence_id: occurrenceId },
        { idempotencyKey: repairKey, correlationId: context.correlationId },
      );
    }
    return {
      ...replayResult(replay),
      task_occurrences: [replayOccurrence],
    };
  }

  const leftShiftId = requireId(body, 'left_shift_id');
  const rightShiftId = requireId(body, 'right_shift_id');
  const leftSegmentId = requireId(body, 'left_segment_id');
  const rightSegmentId = requireId(body, 'right_segment_id');
  if (leftShiftId === rightShiftId || leftSegmentId === rightSegmentId) {
    throw new ApiError(400, 'Een gedeelde grens vereist twee verschillende diensten en segmenten');
  }
  const boundaryDate = asDate(body.boundary_date, 'boundary_date');
  const boundaryTime = asTime(body.boundary_time, 'boundary_time');

  const [initialOccurrence, initialLeftShift, initialRightShift, initialLeftSegment, initialRightSegment] = await Promise.all([
    requireRecord(base44, 'PlanningTaskOccurrence', occurrenceId, 'Taakuitvoering'),
    requireRecord(base44, 'PlanningShift', leftShiftId, 'Vroege dienst'),
    requireRecord(base44, 'PlanningShift', rightShiftId, 'Late dienst'),
    requireRecord(base44, 'PlanningShiftTaskSegment', leftSegmentId, 'Vroeg taaksegment'),
    requireRecord(base44, 'PlanningShiftTaskSegment', rightSegmentId, 'Laat taaksegment'),
  ]);
  const priorBoundaryState = unresolvedSharedBoundaryMutation(initialOccurrence);
  if (priorBoundaryState && (
    priorBoundaryState.idempotency_key !== context.idempotencyKey
    || priorBoundaryState.request_hash !== requestHash
    || priorBoundaryState.actor_user_id !== (user.id || null)
  )) {
    const recoveryKey = `boundary-repair:${await sha256(
      priorBoundaryState.operation_id || `${occurrenceId}:${priorBoundaryState.idempotency_key}`,
    )}`;
    await repairSharedTaskBoundary(
      base44,
      user,
      { action: REPAIR_SHARED_TASK_BOUNDARY_ACTION, task_occurrence_id: occurrenceId },
      { idempotencyKey: recoveryKey, correlationId: context.correlationId },
    );
    throw new ApiError(409, 'Een eerdere gedeelde grens is hersteld; laad de planning opnieuw', {
      code: 'PREVIOUS_BOUNDARY_RECOVERED',
      task_occurrence_id: occurrenceId,
      refresh_required: true,
    });
  }
  const initialOwnedState = sharedBoundaryStateForMutation(
    initialOccurrence,
    context,
    user,
    requestHash,
  );
  const beforeState = initialOwnedState?.before_state || null;
  const initialBasisLeftShift = beforeState?.shifts?.find((item: LooseRecord) => String(item.id) === leftShiftId)
    || initialLeftShift;
  const initialBasisRightShift = beforeState?.shifts?.find((item: LooseRecord) => String(item.id) === rightShiftId)
    || initialRightShift;
  const initialBasisLeftSegment = beforeState?.segments?.find((item: LooseRecord) => String(item.id) === leftSegmentId)
    || initialLeftSegment;
  const initialBasisRightSegment = beforeState?.segments?.find((item: LooseRecord) => String(item.id) === rightSegmentId)
    || initialRightSegment;
  const initialPlan = buildSharedBoundaryPlan(
    initialOccurrence,
    initialBasisLeftShift,
    initialBasisRightShift,
    initialBasisLeftSegment,
    initialBasisRightSegment,
    boundaryDate,
    boundaryTime,
  );
  const [initialLeftSegments, initialRightSegments, initialLeftAssignments, initialRightAssignments] = await Promise.all([
    filterAllRecords(base44.asServiceRole.entities.PlanningShiftTaskSegment, { shift_id: leftShiftId }),
    filterAllRecords(base44.asServiceRole.entities.PlanningShiftTaskSegment, { shift_id: rightShiftId }),
    filterAllRecords(base44.asServiceRole.entities.PlanningAssignment, { shift_id: leftShiftId }),
    filterAllRecords(base44.asServiceRole.entities.PlanningAssignment, { shift_id: rightShiftId }),
  ]);
  if (
    initialLeftSegments.filter(item => item.status !== 'removed').length !== 1
    || initialRightSegments.filter(item => item.status !== 'removed').length !== 1
  ) {
    throw new ApiError(409, 'De gedeelde grens is alleen beschikbaar voor diensten met exact één actief taaksegment');
  }
  const initialAssignments = [...initialLeftAssignments, ...initialRightAssignments]
    .filter(item => item.status !== 'removed');
  const descriptors: LooseRecord[] = await Promise.all([
    resourceCoordinatorDescriptor('task_occurrence', occurrenceId),
    resourceCoordinatorDescriptor('shift_composition', leftShiftId),
    resourceCoordinatorDescriptor('shift_composition', rightShiftId),
  ]);
  descriptors.push(...await personnelDayDescriptors(
    initialAssignments.map(item => item.personnel_id),
    [
      initialBasisLeftShift,
      initialBasisRightShift,
      initialPlan.proposedLeftShift,
      initialPlan.proposedRightShift,
    ],
  ));

  return withPlanningResourceLeases(base44, user, context, requestHash, descriptors, async leases => {
    let businessWriteStarted = false;
    let reservedByThisAttempt = false;
    try {
      let [occurrence, leftShift, rightShift, leftSegment, rightSegment] = await Promise.all([
        requireRecord(base44, 'PlanningTaskOccurrence', occurrenceId, 'Taakuitvoering'),
        requireRecord(base44, 'PlanningShift', leftShiftId, 'Vroege dienst'),
        requireRecord(base44, 'PlanningShift', rightShiftId, 'Late dienst'),
        requireRecord(base44, 'PlanningShiftTaskSegment', leftSegmentId, 'Vroeg taaksegment'),
        requireRecord(base44, 'PlanningShiftTaskSegment', rightSegmentId, 'Laat taaksegment'),
      ]);
      await Promise.all([
        assertNoForeignPendingMutation(
          base44,
          leftShift,
          context,
          SHARED_TASK_BOUNDARY_ACTION,
          user,
          requestHash,
        ),
        assertNoForeignPendingMutation(
          base44,
          rightShift,
          context,
          SHARED_TASK_BOUNDARY_ACTION,
          user,
          requestHash,
        ),
      ]);

      let ownedState = sharedBoundaryStateForMutation(occurrence, context, user, requestHash);
      const reservation = occurrence.metadata?.planning_composition_reservation;
      const ownsReservation = reservation?.idempotency_key === context.idempotencyKey
        && reservation?.request_hash === requestHash
        && reservation?.actor_user_id === (user.id || null);
      if (ownsReservation && reservation.action !== SHARED_TASK_BOUNDARY_ACTION) {
        throw new ApiError(409, 'idempotency_key hoort bij een andere taakreservering');
      }
      if (reservation && !ownsReservation && leaseIsActive(reservation)) {
        throw new ApiError(409, 'Deze taakdekking wordt op dit moment door een andere planner gewijzigd', {
          task_occurrence_id: occurrence.id,
          reservation_expires_at: reservation.expires_at,
        });
      }
      if (ownedState && (
        String(ownedState.task_occurrence_id) !== occurrenceId
        || String(ownedState.left_shift_id) !== leftShiftId
        || String(ownedState.right_shift_id) !== rightShiftId
        || String(ownedState.left_segment_id) !== leftSegmentId
        || String(ownedState.right_segment_id) !== rightSegmentId
        || ownedState.boundary_date !== boundaryDate
        || ownedState.boundary_time !== boundaryTime
      )) {
        throw new ApiError(409, 'De bestaande herstelstaat hoort bij een andere gedeelde grens');
      }

      const lockedBeforeState = ownedState?.before_state || null;
      const basisLeftShift = lockedBeforeState?.shifts?.find((item: LooseRecord) => String(item.id) === leftShiftId)
        || leftShift;
      const basisRightShift = lockedBeforeState?.shifts?.find((item: LooseRecord) => String(item.id) === rightShiftId)
        || rightShift;
      const basisLeftSegment = lockedBeforeState?.segments?.find((item: LooseRecord) => String(item.id) === leftSegmentId)
        || leftSegment;
      const basisRightSegment = lockedBeforeState?.segments?.find((item: LooseRecord) => String(item.id) === rightSegmentId)
        || rightSegment;
      const plan = buildSharedBoundaryPlan(
        occurrence,
        basisLeftShift,
        basisRightShift,
        basisLeftSegment,
        basisRightSegment,
        boundaryDate,
        boundaryTime,
      );
      const [leftSegments, rightSegments, leftAssignments, rightAssignments] = await Promise.all([
        filterAllRecords(base44.asServiceRole.entities.PlanningShiftTaskSegment, { shift_id: leftShiftId }),
        filterAllRecords(base44.asServiceRole.entities.PlanningShiftTaskSegment, { shift_id: rightShiftId }),
        filterAllRecords(base44.asServiceRole.entities.PlanningAssignment, { shift_id: leftShiftId }),
        filterAllRecords(base44.asServiceRole.entities.PlanningAssignment, { shift_id: rightShiftId }),
      ]);
      if (
        leftSegments.filter(item => item.status !== 'removed').length !== 1
        || rightSegments.filter(item => item.status !== 'removed').length !== 1
      ) {
        throw new ApiError(409, 'Dienstinhoud is intussen gewijzigd; laad het rooster opnieuw');
      }
      const activeAssignments = [...leftAssignments, ...rightAssignments]
        .filter(item => item.status !== 'removed');

      if (!ownedState) {
        const expectedShiftRevisions = body.expected_shift_revisions || {};
        const expectedSegmentRevisions = body.expected_segment_revisions || {};
        const expectedAssignmentRevisions = body.expected_assignment_revisions || {};
        const expectedOccurrenceRevision = positiveInteger(
          body.expected_occurrence_revision,
          'expected_occurrence_revision',
        );
        for (const shift of [leftShift, rightShift]) {
          const expected = positiveInteger(
            expectedShiftRevisions[shift.id],
            `expected_shift_revisions.${shift.id}`,
          );
          if (revisionOf(shift) !== expected) {
            throw new ApiError(409, 'Planning is intussen gewijzigd', {
              entity: 'PlanningShift',
              id: shift.id,
              expected_revision: expected,
              current_revision: revisionOf(shift),
            });
          }
        }
        for (const segment of [leftSegment, rightSegment]) {
          const expected = positiveInteger(
            expectedSegmentRevisions[segment.id],
            `expected_segment_revisions.${segment.id}`,
          );
          if (revisionOf(segment) !== expected) {
            throw new ApiError(409, 'Taaksegment is intussen gewijzigd', {
              entity: 'PlanningShiftTaskSegment',
              id: segment.id,
              expected_revision: expected,
              current_revision: revisionOf(segment),
            });
          }
        }
        if (revisionOf(occurrence) !== expectedOccurrenceRevision) {
          throw new ApiError(409, 'Taakdekking is intussen gewijzigd', {
            entity: 'PlanningTaskOccurrence',
            id: occurrence.id,
            expected_revision: expectedOccurrenceRevision,
            current_revision: revisionOf(occurrence),
          });
        }
        const expectedAssignmentIds = Object.keys(expectedAssignmentRevisions).sort();
        const activeAssignmentIds = activeAssignments.map(item => String(item.id)).sort();
        if (stableStringify(expectedAssignmentIds) !== stableStringify(activeAssignmentIds)) {
          throw new ApiError(409, 'Dienstbezetting is intussen gewijzigd; laad het rooster opnieuw', {
            expected_assignment_ids: expectedAssignmentIds,
            current_assignment_ids: activeAssignmentIds,
          });
        }
        for (const assignment of activeAssignments) {
          const expected = positiveInteger(
            expectedAssignmentRevisions[assignment.id],
            `expected_assignment_revisions.${assignment.id}`,
          );
          if (revisionOf(assignment) !== expected) {
            throw new ApiError(409, 'Dienstbezetting is intussen gewijzigd; laad het rooster opnieuw', {
              entity: 'PlanningAssignment',
              id: assignment.id,
              expected_revision: expected,
              current_revision: revisionOf(assignment),
            });
          }
        }
      } else {
        const beforeAssignmentIds = normalizeArray<LooseRecord>(ownedState.before_state?.assignments)
          .filter(item => item.status !== 'removed')
          .map(item => String(item.id))
          .sort();
        const currentAssignmentIds = activeAssignments.map(item => String(item.id)).sort();
        if (stableStringify(beforeAssignmentIds) !== stableStringify(currentAssignmentIds)) {
          throw new ApiError(409, 'Dienstbezetting is tijdens grensherstel gewijzigd');
        }
      }

      const allOccurrenceSegments = await filterAllRecords(
        base44.asServiceRole.entities.PlanningShiftTaskSegment,
        { task_occurrence_id: occurrenceId },
      );
      const otherOccurrenceSegments = allOccurrenceSegments.filter(item => (
        item.status !== 'removed'
        && String(item.id) !== leftSegmentId
        && String(item.id) !== rightSegmentId
      ));
      const otherParentShiftIds = uniqueStrings(otherOccurrenceSegments.map(item => item.shift_id));
      const otherParentShifts = otherParentShiftIds.length
        ? await filterAllRecords(base44.asServiceRole.entities.PlanningShift, { id: { $in: otherParentShiftIds } })
        : [];
      const proposedIntervals = [
        segmentInterval(plan.proposedLeftSegment),
        segmentInterval(plan.proposedRightSegment),
      ].filter((item): item is NonNullable<typeof item> => item != null);
      const otherIntervals = activeTaskSegments(otherOccurrenceSegments, otherParentShifts)
        .map(segmentInterval)
        .filter((item): item is NonNullable<typeof item> => item != null);
      for (const proposed of proposedIntervals) {
        if (otherIntervals.some(other => proposed.start < other.end && other.start < proposed.end)) {
          throw new ApiError(409, 'De nieuwe grens overlapt een andere dienst binnen dezelfde taakuitvoering');
        }
      }
      const allocatedMinutes = mergeMinuteIntervals([...proposedIntervals, ...otherIntervals])
        .reduce((sum, interval) => sum + interval.end - interval.start, 0);
      if (allocatedMinutes > Number(occurrence.required_minutes || 0)) {
        throw new ApiError(409, 'De taakuitvoering zou meer minuten krijgen dan vereist', {
          task_occurrence_id: occurrence.id,
          allocated_minutes: allocatedMinutes,
          required_minutes: Number(occurrence.required_minutes || 0),
        });
      }

      let assignmentPatches = ownedState?.assignment_patches || null;
      if (!assignmentPatches) {
        assignmentPatches = {};
        const proposedShiftById = new Map([
          [leftShiftId, plan.proposedLeftShift],
          [rightShiftId, plan.proposedRightShift],
        ]);
        for (const assignment of activeAssignments) {
          const personnel = await requireRecord(base44, 'Personnel', assignment.personnel_id, 'Medewerker');
          const supplied = normalizeArray(assignment.warning_snapshot)
            .filter((item: LooseRecord) => item.source === 'planner');
          const eligibility = await evaluateAssignmentWarnings(
            base44,
            proposedShiftById.get(String(assignment.shift_id)) as LooseRecord,
            personnel,
            assignment.id,
            supplied,
            [leftShiftId, rightShiftId],
          );
          assignmentPatches[assignment.id] = {
            status: 'draft',
            warning_codes: eligibility.warning_codes,
            warning_snapshot: eligibility.warning_snapshot,
            has_critical_warnings: eligibility.has_critical_warnings,
            contract_routing_snapshot: eligibility.contract_routing_snapshot,
            personnel_contract_id: eligibility.personnel_contract_id,
          };
        }
      }

      if (!ownedState) {
        const targetState = {
          shifts: [plan.proposedLeftShift, plan.proposedRightShift].map(sharedBoundaryRecordProjection),
          segments: [plan.proposedLeftSegment, plan.proposedRightSegment].map(sharedBoundaryRecordProjection),
          assignments: activeAssignments.map(assignment => ({
            ...assignment,
            ...(assignmentPatches[assignment.id] || {}),
          })).map(sharedBoundaryAssignmentProjection),
        };
        const mutationState = {
          schema_version: 2,
          operation_id: sharedBoundaryOperationId(occurrenceId, context),
          idempotency_key: context.idempotencyKey,
          correlation_id: context.correlationId,
          request_hash: requestHash,
          actor_user_id: user.id || null,
          actor_snapshot: {
            id: user.id || null,
            name: actorName(user),
            email: compact(user.email) || null,
          },
          task_occurrence_id: occurrenceId,
          left_shift_id: leftShiftId,
          right_shift_id: rightShiftId,
          left_segment_id: leftSegmentId,
          right_segment_id: rightSegmentId,
          boundary_date: boundaryDate,
          boundary_time: boundaryTime,
          phase: 'prepared',
          effective_view: 'before',
          moving_later: plan.boundaryMinute > plan.oldBoundaryMinute,
          started_at: nowIso(),
          before_state: {
            shifts: [leftShift, rightShift].map(sharedBoundaryRecordProjection),
            segments: [leftSegment, rightSegment].map(sharedBoundaryRecordProjection),
            assignments: activeAssignments.map(sharedBoundaryAssignmentProjection),
            task_occurrence: sharedBoundaryOccurrenceProjection(occurrence),
          },
          assignment_ids: activeAssignments.map(item => item.id),
          target_state: targetState,
          target_hash: await sharedBoundaryTargetHash(targetState),
          assignment_patches: assignmentPatches,
        };
        await renewPlanningResourceLeases(base44, user, leases);
        occurrence = await casUpdate(
          base44,
          'PlanningTaskOccurrence',
          occurrence,
          revisionOf(occurrence),
          {
            last_modified_by_user_id: user.id || null,
            last_modified_at: nowIso(),
            metadata: {
              ...(occurrence.metadata || {}),
              shared_boundary_mutation: mutationState,
              planning_composition_reservation: {
                idempotency_key: context.idempotencyKey,
                correlation_id: context.correlationId,
                action: SHARED_TASK_BOUNDARY_ACTION,
                request_hash: requestHash,
                actor_user_id: user.id || null,
                status: 'pending',
                acquired_at: nowIso(),
                expires_at: new Date(Date.now() + PLANNING_RESOURCE_LEASE_MS).toISOString(),
              },
            },
          },
        );
        ownedState = mutationState;
        reservedByThisAttempt = true;
      }

      const recordBoundaryMetadata = (record: LooseRecord, role: 'left' | 'right') => ({
        ...(record.metadata || {}),
        shared_boundary_mutation: {
          operation_id: ownedState?.operation_id || sharedBoundaryOperationId(occurrenceId, context),
          idempotency_key: context.idempotencyKey,
          correlation_id: context.correlationId,
          request_hash: requestHash,
          actor_user_id: user.id || null,
          task_occurrence_id: occurrenceId,
          role,
          boundary_date: boundaryDate,
          boundary_time: boundaryTime,
          phase: 'state_written_audit_pending',
          updated_at: nowIso(),
        },
      });
      const hasExactRecordMarker = (record: LooseRecord) => {
        const marker = record.metadata?.shared_boundary_mutation;
        if (!marker || marker.idempotency_key !== context.idempotencyKey) return false;
        if (marker.request_hash !== requestHash || marker.actor_user_id !== (user.id || null)) {
          throw new ApiError(409, 'Planningrecord hoort bij een andere gedeelde grensbewerking', {
            id: record.id,
          });
        }
        return true;
      };
      const segmentMatches = (record: LooseRecord, target: LooseRecord) => (
        record.start_date === target.start_date
        && record.end_date === target.end_date
        && record.start_time === target.start_time
        && record.end_time === target.end_time
        && Number(record.duration_minutes) === Number(target.duration_minutes)
        && record.status === 'draft'
      );
      const shiftMatches = (record: LooseRecord, target: LooseRecord) => (
        record.service_date === target.service_date
        && (record.end_date || null) === (target.end_date || null)
        && record.start_time === target.start_time
        && record.end_time === target.end_time
        && Number(record.duration_minutes) === Number(target.duration_minutes)
        && record.status === 'draft'
      );
      const writeSegment = async (record: LooseRecord, target: LooseRecord, role: 'left' | 'right') => {
        if (hasExactRecordMarker(record)) {
          if (!segmentMatches(record, target)) {
            throw new ApiError(409, 'Herstelbaar taaksegment wijkt af van de bedoelde grens', { id: record.id });
          }
          return record;
        }
        businessWriteStarted = true;
        await renewPlanningResourceLeases(base44, user, leases);
        return casUpdate(base44, 'PlanningShiftTaskSegment', record, revisionOf(record), {
          start_date: target.start_date,
          end_date: target.end_date,
          start_time: target.start_time,
          end_time: target.end_time,
          duration_minutes: target.duration_minutes,
          status: 'draft',
          last_modified_by_user_id: user.id || null,
          last_modified_at: nowIso(),
          metadata: recordBoundaryMetadata(record, role),
        });
      };
      const writeShift = async (record: LooseRecord, target: LooseRecord, role: 'left' | 'right') => {
        if (hasExactRecordMarker(record)) {
          if (!shiftMatches(record, target)) {
            throw new ApiError(409, 'Herstelbare dienst wijkt af van de bedoelde grens', { id: record.id });
          }
          return record;
        }
        businessWriteStarted = true;
        await renewPlanningResourceLeases(base44, user, leases);
        return casUpdate(base44, 'PlanningShift', record, revisionOf(record), {
          service_date: target.service_date,
          end_date: target.end_date,
          start_time: target.start_time,
          end_time: target.end_time,
          duration_minutes: target.duration_minutes,
          status: 'draft',
          last_modified_by_user_id: user.id || null,
          last_modified_at: nowIso(),
          metadata: {
            ...planningMutationMetadata(
              record,
              SHARED_TASK_BOUNDARY_ACTION,
              context,
              user,
              requestHash,
            ),
            shared_boundary_mutation: recordBoundaryMetadata(record, role).shared_boundary_mutation,
          },
        });
      };

      const movingLater = plan.boundaryMinute > plan.oldBoundaryMinute;
      if (movingLater) {
        rightShift = await writeShift(rightShift, plan.proposedRightShift, 'right');
        rightSegment = await writeSegment(rightSegment, plan.proposedRightSegment, 'right');
        leftSegment = await writeSegment(leftSegment, plan.proposedLeftSegment, 'left');
        leftShift = await writeShift(leftShift, plan.proposedLeftShift, 'left');
      } else {
        leftShift = await writeShift(leftShift, plan.proposedLeftShift, 'left');
        leftSegment = await writeSegment(leftSegment, plan.proposedLeftSegment, 'left');
        rightSegment = await writeSegment(rightSegment, plan.proposedRightSegment, 'right');
        rightShift = await writeShift(rightShift, plan.proposedRightShift, 'right');
      }

      const updatedAssignments: LooseRecord[] = [];
      for (const assignment of activeAssignments) {
        const marker = assignment.metadata?.shared_boundary_mutation;
        if (marker?.idempotency_key === context.idempotencyKey) {
          if (marker.request_hash !== requestHash || marker.actor_user_id !== (user.id || null)) {
            throw new ApiError(409, 'Toewijzing hoort bij een andere gedeelde grensbewerking', {
              assignment_id: assignment.id,
            });
          }
          updatedAssignments.push(assignment);
          continue;
        }
        businessWriteStarted = true;
        await renewPlanningResourceLeases(base44, user, leases);
        updatedAssignments.push(await casUpdate(
          base44,
          'PlanningAssignment',
          assignment,
          revisionOf(assignment),
          {
            ...assignmentPatches[assignment.id],
            metadata: {
              ...(assignment.metadata || {}),
              shared_boundary_mutation: {
                operation_id: ownedState?.operation_id || sharedBoundaryOperationId(occurrenceId, context),
                idempotency_key: context.idempotencyKey,
                correlation_id: context.correlationId,
                request_hash: requestHash,
                actor_user_id: user.id || null,
                boundary_date: boundaryDate,
                boundary_time: boundaryTime,
                phase: 'state_written_audit_pending',
                updated_at: nowIso(),
              },
            },
          },
        ));
      }

      const committedByThisRequest = occurrence.metadata?.last_shared_boundary_idempotency_key === context.idempotencyKey
        && occurrence.metadata?.last_shared_boundary_request_hash === requestHash
        && occurrence.metadata?.last_shared_boundary_actor_user_id === (user.id || null);
      if (!committedByThisRequest) {
        const currentReservation = occurrence.metadata?.planning_composition_reservation;
        if (
          currentReservation?.idempotency_key !== context.idempotencyKey
          || currentReservation?.request_hash !== requestHash
          || currentReservation?.actor_user_id !== (user.id || null)
        ) {
          throw new ApiError(409, 'Taakreservering voor de gedeelde grens ontbreekt');
        }
        const { planning_composition_reservation: _reservation, ...metadata } = occurrence.metadata || {};
        await renewPlanningResourceLeases(base44, user, leases);
        occurrence = await casUpdate(base44, 'PlanningTaskOccurrence', occurrence, revisionOf(occurrence), {
          last_modified_by_user_id: user.id || null,
          last_modified_at: nowIso(),
          metadata: {
            ...metadata,
            shared_boundary_mutation: {
              ...(metadata.shared_boundary_mutation || ownedState),
              phase: 'applied_audit_pending',
              effective_view: 'target',
              applied_at: nowIso(),
            },
            last_shared_boundary_idempotency_key: context.idempotencyKey,
            last_shared_boundary_correlation_id: context.correlationId,
            last_shared_boundary_request_hash: requestHash,
            last_shared_boundary_actor_user_id: user.id || null,
            last_shared_boundary_completed_at: nowIso(),
          },
        });
      }

      const result = {
        shifts: [leftShift, rightShift],
        segments: [leftSegment, rightSegment],
        assignments: updatedAssignments,
        task_occurrences: [occurrence],
        boundary: { date: boundaryDate, time: boundaryTime },
      };
      await renewPlanningResourceLeases(base44, user, leases);
      const audit = await appendAudit(base44, user, {
        action: SHARED_TASK_BOUNDARY_ACTION,
        resource_type: 'PlanningTaskOccurrence',
        resource_id: occurrence.id,
        before_state: ownedState?.before_state || null,
        after_state: result,
        correlation_id: context.correlationId,
        idempotency_key: context.idempotencyKey,
        undoable: false,
        metadata: {
          request_hash: requestHash,
          operation_id: ownedState?.operation_id || sharedBoundaryOperationId(occurrenceId, context),
          affected_shift_ids: [leftShiftId, rightShiftId],
          affected_segment_ids: [leftSegmentId, rightSegmentId],
          task_occurrence_id: occurrenceId,
          boundary_date: boundaryDate,
          boundary_time: boundaryTime,
        },
      });
      const committedOccurrence = await requireRecord(
        base44,
        'PlanningTaskOccurrence',
        occurrence.id,
        'Taakuitvoering',
      );
      const committedState = committedOccurrence.metadata?.shared_boundary_mutation;
      if (committedState?.phase !== 'completed') {
        await renewPlanningResourceLeases(base44, user, leases);
        occurrence = await casUpdate(
          base44,
          'PlanningTaskOccurrence',
          committedOccurrence,
          revisionOf(committedOccurrence),
          {
            last_modified_by_user_id: user.id || null,
            last_modified_at: nowIso(),
            metadata: {
              ...(committedOccurrence.metadata || {}),
              shared_boundary_mutation: completedSharedBoundaryMutationState(
                committedState || ownedState,
                audit.id,
              ),
            },
          },
        );
      } else {
        occurrence = committedOccurrence;
      }
      return {
        ok: true,
        ...result,
        task_occurrences: [occurrence],
        audit_event_id: audit.id,
        undoable: false,
        undo_token: null,
      };
    } catch (error) {
      if (reservedByThisAttempt && !businessWriteStarted) {
        try {
          const occurrence = await requireRecord(base44, 'PlanningTaskOccurrence', occurrenceId, 'Taakuitvoering');
          const reservation = occurrence.metadata?.planning_composition_reservation;
          if (
            reservation?.idempotency_key === context.idempotencyKey
            && reservation?.request_hash === requestHash
            && reservation?.actor_user_id === (user.id || null)
          ) {
            const {
              planning_composition_reservation: _reservation,
              shared_boundary_mutation: _boundaryState,
              ...metadata
            } = occurrence.metadata || {};
            await renewPlanningResourceLeases(base44, user, leases);
            await casUpdate(base44, 'PlanningTaskOccurrence', occurrence, revisionOf(occurrence), {
              last_modified_by_user_id: user.id || null,
              last_modified_at: nowIso(),
              metadata: {
                ...metadata,
                last_shared_boundary_recovery_idempotency_key: context.idempotencyKey,
                last_shared_boundary_recovery_request_hash: requestHash,
                last_shared_boundary_recovery_actor_user_id: user.id || null,
                last_shared_boundary_recovery_status: 'reservation_released',
                last_shared_boundary_recovery_at: nowIso(),
              },
            });
          }
        } catch (cleanupError) {
          if (error && typeof error === 'object') {
            (error as any).details = {
              ...((error as any).details || {}),
              compensation_errors: [{
                entity: 'PlanningTaskOccurrence',
                id: occurrenceId,
                message: (cleanupError as Error)?.message || String(cleanupError),
              }],
            };
          }
        }
      }
      throw error;
    }
  });
}

function sharedBoundaryTargetById(state: LooseRecord, collection: 'shifts' | 'segments', id: string) {
  return normalizeArray<LooseRecord>(state.target_state?.[collection])
    .find(item => String(item.id) === String(id)) || null;
}

function sharedBoundaryBeforeById(state: LooseRecord, collection: 'shifts' | 'segments', id: string) {
  return normalizeArray<LooseRecord>(state.before_state?.[collection])
    .find(item => String(item.id) === String(id)) || null;
}

function sharedBoundaryRecordPatch(target: LooseRecord, entityName: 'PlanningShift' | 'PlanningShiftTaskSegment') {
  const fields = entityName === 'PlanningShift'
    ? ['service_date', 'end_date', 'start_time', 'end_time', 'duration_minutes', 'status']
    : ['start_date', 'end_date', 'start_time', 'end_time', 'duration_minutes', 'status'];
  return Object.fromEntries(fields.map(field => [field, target[field] ?? null]));
}

function sharedBoundaryAssignmentMatches(record: LooseRecord, patch: LooseRecord) {
  return [
    'status',
    'warning_codes',
    'warning_snapshot',
    'has_critical_warnings',
    'contract_routing_snapshot',
    'personnel_contract_id',
  ].every(key => stableStringify(record[key] ?? null) === stableStringify(patch[key] ?? null));
}

function sharedBoundaryRepairConflict(
  entity: string,
  record: LooseRecord,
  state: LooseRecord,
) {
  throw new ApiError(409, 'Gedeelde grens kan niet automatisch worden hersteld door een afwijkende tussenwijziging', {
    code: 'BOUNDARY_RECOVERY_CONFLICT',
    entity,
    id: record.id,
    operation_id: state.operation_id || null,
  });
}

async function repairSharedTaskBoundary(
  base44: LooseRecord,
  recoveryUser: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  requireMutationIdempotency(context, REPAIR_SHARED_TASK_BOUNDARY_ACTION);
  const occurrenceId = requireId(body, 'task_occurrence_id');
  let initialOccurrence = await requireRecord(base44, 'PlanningTaskOccurrence', occurrenceId, 'Taakuitvoering');
  let state = initialOccurrence.metadata?.shared_boundary_mutation;
  if (!state) {
    return { ok: true, repaired: false, task_occurrences: [initialOccurrence] };
  }
  if (state.phase === 'completed') {
    const assignmentIds = uniqueStrings([
      ...normalizeArray(state.assignment_ids),
      ...normalizeArray<LooseRecord>(state.before_state?.assignments).map(item => item.id),
    ]);
    const [shifts, segments, assignments] = await Promise.all([
      Promise.all(uniqueStrings([state.left_shift_id, state.right_shift_id]).map(id => (
        requireRecord(base44, 'PlanningShift', id, 'Dienst')
      ))),
      Promise.all(uniqueStrings([state.left_segment_id, state.right_segment_id]).map(id => (
        requireRecord(base44, 'PlanningShiftTaskSegment', id, 'Taaksegment')
      ))),
      Promise.all(assignmentIds.map(id => (
        requireRecord(base44, 'PlanningAssignment', id, 'Toewijzing')
      ))),
    ]);
    return {
      ok: true,
      repaired: false,
      shifts,
      segments,
      assignments,
      task_occurrences: [initialOccurrence],
      boundary: { date: state.boundary_date, time: state.boundary_time },
      audit_event_id: state.audit_event_id || null,
      undoable: false,
      undo_token: null,
    };
  }

  const beforeLeftShift = sharedBoundaryBeforeById(state, 'shifts', state.left_shift_id);
  const beforeRightShift = sharedBoundaryBeforeById(state, 'shifts', state.right_shift_id);
  const beforeLeftSegment = sharedBoundaryBeforeById(state, 'segments', state.left_segment_id);
  const beforeRightSegment = sharedBoundaryBeforeById(state, 'segments', state.right_segment_id);
  if (!beforeLeftShift || !beforeRightShift || !beforeLeftSegment || !beforeRightSegment) {
    throw new ApiError(409, 'Gedeelde grens mist een volledige duurzame herstelstaat', {
      code: 'BOUNDARY_RECOVERY_STATE_INCOMPLETE',
      task_occurrence_id: occurrenceId,
    });
  }
  if (!state.target_state) {
    const legacyPlan = buildSharedBoundaryPlan(
      initialOccurrence,
      beforeLeftShift,
      beforeRightShift,
      beforeLeftSegment,
      beforeRightSegment,
      state.boundary_date,
      state.boundary_time,
    );
    state = {
      ...state,
      schema_version: 2,
      operation_id: state.operation_id || `${occurrenceId}:${state.idempotency_key}`,
      effective_view: state.phase === 'state_written_audit_pending' ? 'target' : 'before',
      moving_later: legacyPlan.boundaryMinute > legacyPlan.oldBoundaryMinute,
      target_state: {
        shifts: [legacyPlan.proposedLeftShift, legacyPlan.proposedRightShift],
        segments: [legacyPlan.proposedLeftSegment, legacyPlan.proposedRightSegment],
        assignments: normalizeArray<LooseRecord>(state.before_state?.assignments).map(assignment => ({
          ...assignment,
          ...(state.assignment_patches?.[assignment.id] || {}),
        })),
      },
    };
  }
  const computedTargetHash = await sharedBoundaryTargetHash(state.target_state);
  if (state.target_hash && state.target_hash !== computedTargetHash) {
    throw new ApiError(409, 'Duurzame doelstaat voor gedeelde grens is niet meer betrouwbaar', {
      code: 'BOUNDARY_RECOVERY_TARGET_HASH_MISMATCH',
      task_occurrence_id: occurrenceId,
      operation_id: state.operation_id || null,
    });
  }
  state = { ...state, target_hash: computedTargetHash };

  const initialAssignments = normalizeArray<LooseRecord>(state.before_state?.assignments);
  const targetLeftShift = sharedBoundaryTargetById(state, 'shifts', state.left_shift_id);
  const targetRightShift = sharedBoundaryTargetById(state, 'shifts', state.right_shift_id);
  const targetLeftSegment = sharedBoundaryTargetById(state, 'segments', state.left_segment_id);
  const targetRightSegment = sharedBoundaryTargetById(state, 'segments', state.right_segment_id);
  if (!targetLeftShift || !targetRightShift || !targetLeftSegment || !targetRightSegment) {
    throw new ApiError(409, 'Gedeelde grens mist doelrecords voor duurzaam herstel', {
      code: 'BOUNDARY_RECOVERY_TARGET_INCOMPLETE',
      task_occurrence_id: occurrenceId,
    });
  }

  const descriptorContext = {
    idempotencyKey: context.idempotencyKey,
    correlationId: context.correlationId,
  };
  const repairHash = await mutationRequestHash(REPAIR_SHARED_TASK_BOUNDARY_ACTION, {
    task_occurrence_id: occurrenceId,
    operation_id: state.operation_id,
  });
  const descriptors: LooseRecord[] = await Promise.all([
    resourceCoordinatorDescriptor('task_occurrence', occurrenceId),
    resourceCoordinatorDescriptor('shift_composition', state.left_shift_id),
    resourceCoordinatorDescriptor('shift_composition', state.right_shift_id),
  ]);
  descriptors.push(...await personnelDayDescriptors(
    initialAssignments.map(item => item.personnel_id),
    [beforeLeftShift, beforeRightShift, targetLeftShift, targetRightShift],
  ));

  return withPlanningResourceLeases(
    base44,
    recoveryUser,
    descriptorContext,
    repairHash,
    descriptors,
    async leases => {
      let occurrence = await requireRecord(base44, 'PlanningTaskOccurrence', occurrenceId, 'Taakuitvoering');
      let lockedState = occurrence.metadata?.shared_boundary_mutation;
      if (!lockedState || (lockedState.operation_id || `${occurrenceId}:${lockedState.idempotency_key}`) !== state.operation_id) {
        throw new ApiError(409, 'Gedeelde grensherstelstate is tijdens herstel vervangen', {
          code: 'BOUNDARY_RECOVERY_OPERATION_CHANGED',
          task_occurrence_id: occurrenceId,
        });
      }
      if (lockedState.phase === 'completed') {
        const assignmentIds = uniqueStrings([
          ...normalizeArray(lockedState.assignment_ids),
          ...normalizeArray<LooseRecord>(lockedState.before_state?.assignments).map(item => item.id),
        ]);
        const [shifts, segments, assignments] = await Promise.all([
          Promise.all([lockedState.left_shift_id, lockedState.right_shift_id].map((id: string) => (
            requireRecord(base44, 'PlanningShift', id, 'Dienst')
          ))),
          Promise.all([lockedState.left_segment_id, lockedState.right_segment_id].map((id: string) => (
            requireRecord(base44, 'PlanningShiftTaskSegment', id, 'Taaksegment')
          ))),
          Promise.all(assignmentIds.map(id => (
            requireRecord(base44, 'PlanningAssignment', id, 'Toewijzing')
          ))),
        ]);
        return {
          ok: true,
          repaired: false,
          shifts,
          segments,
          assignments,
          task_occurrences: [occurrence],
          boundary: { date: lockedState.boundary_date, time: lockedState.boundary_time },
          audit_event_id: lockedState.audit_event_id || null,
          undoable: false,
          undo_token: null,
        };
      }
      if (!lockedState.target_state) {
        await renewPlanningResourceLeases(base44, recoveryUser, leases);
        occurrence = await casUpdate(base44, 'PlanningTaskOccurrence', occurrence, revisionOf(occurrence), {
          last_modified_by_user_id: recoveryUser.id || null,
          last_modified_at: nowIso(),
          metadata: {
            ...(occurrence.metadata || {}),
            shared_boundary_mutation: state,
          },
        });
        lockedState = state;
      }
      const lockedTargetHash = await sharedBoundaryTargetHash(lockedState.target_state);
      if (
        (Number(lockedState.schema_version || 0) >= 2 && !lockedState.target_hash)
        || (lockedState.target_hash && lockedState.target_hash !== lockedTargetHash)
      ) {
        throw new ApiError(409, 'Duurzame doelstaat voor gedeelde grens is niet meer betrouwbaar', {
          code: 'BOUNDARY_RECOVERY_TARGET_HASH_MISMATCH',
          task_occurrence_id: occurrenceId,
          operation_id: lockedState.operation_id || null,
        });
      }

      let [leftShift, rightShift, leftSegment, rightSegment] = await Promise.all([
        requireRecord(base44, 'PlanningShift', state.left_shift_id, 'Vroege dienst'),
        requireRecord(base44, 'PlanningShift', state.right_shift_id, 'Late dienst'),
        requireRecord(base44, 'PlanningShiftTaskSegment', state.left_segment_id, 'Vroeg taaksegment'),
        requireRecord(base44, 'PlanningShiftTaskSegment', state.right_segment_id, 'Laat taaksegment'),
      ]);
      const currentAssignments = (await Promise.all([
        filterAllRecords(base44.asServiceRole.entities.PlanningAssignment, { shift_id: state.left_shift_id }),
        filterAllRecords(base44.asServiceRole.entities.PlanningAssignment, { shift_id: state.right_shift_id }),
      ])).flat().filter(item => item.status !== 'removed');
      const expectedAssignmentIdentities = initialAssignments
        .map(sharedBoundaryAssignmentIdentity)
        .sort();
      const currentAssignmentIdentities = currentAssignments
        .map(sharedBoundaryAssignmentIdentity)
        .sort();
      if (stableStringify(expectedAssignmentIdentities) !== stableStringify(currentAssignmentIdentities)) {
        throw new ApiError(409, 'Dienstbezetting is tijdens gedeelde-grensherstel gewijzigd', {
          code: 'BOUNDARY_RECOVERY_ASSIGNMENTS_CHANGED',
          task_occurrence_id: occurrenceId,
          expected_assignment_identities: expectedAssignmentIdentities,
          current_assignment_identities: currentAssignmentIdentities,
        });
      }

      const ensureTargetRecord = async (
        entityName: 'PlanningShift' | 'PlanningShiftTaskSegment',
        record: LooseRecord,
        before: LooseRecord,
        target: LooseRecord,
        role: 'left' | 'right',
      ) => {
        if (sharedBoundaryBusinessProjectionMatches(record, target)) return record;
        if (!sharedBoundaryBusinessProjectionMatches(record, before)) {
          sharedBoundaryRepairConflict(entityName, record, lockedState);
        }
        await renewPlanningResourceLeases(base44, recoveryUser, leases);
        return casUpdate(base44, entityName, record, revisionOf(record), {
          ...sharedBoundaryRecordPatch(target, entityName),
          last_modified_by_user_id: recoveryUser.id || null,
          last_modified_at: nowIso(),
          metadata: {
            ...(record.metadata || {}),
            ...(entityName === 'PlanningShift' ? {
              planning_mutation: {
                action: SHARED_TASK_BOUNDARY_ACTION,
                idempotency_key: lockedState.idempotency_key,
                correlation_id: lockedState.correlation_id,
                actor_user_id: lockedState.actor_user_id || null,
                request_hash: lockedState.request_hash,
                phase: 'state_written_audit_pending',
                started_at: lockedState.started_at || nowIso(),
                updated_at: nowIso(),
              },
            } : {}),
            shared_boundary_mutation: {
              operation_id: lockedState.operation_id,
              idempotency_key: lockedState.idempotency_key,
              correlation_id: lockedState.correlation_id,
              request_hash: lockedState.request_hash,
              actor_user_id: lockedState.actor_user_id || null,
              task_occurrence_id: occurrenceId,
              role,
              boundary_date: lockedState.boundary_date,
              boundary_time: lockedState.boundary_time,
              phase: 'state_written_audit_pending',
              recovered_by_user_id: recoveryUser.id || null,
              updated_at: nowIso(),
            },
          },
        });
      };

      if (lockedState.moving_later !== false) {
        rightShift = await ensureTargetRecord('PlanningShift', rightShift, beforeRightShift, targetRightShift, 'right');
        rightSegment = await ensureTargetRecord('PlanningShiftTaskSegment', rightSegment, beforeRightSegment, targetRightSegment, 'right');
        leftSegment = await ensureTargetRecord('PlanningShiftTaskSegment', leftSegment, beforeLeftSegment, targetLeftSegment, 'left');
        leftShift = await ensureTargetRecord('PlanningShift', leftShift, beforeLeftShift, targetLeftShift, 'left');
      } else {
        leftShift = await ensureTargetRecord('PlanningShift', leftShift, beforeLeftShift, targetLeftShift, 'left');
        leftSegment = await ensureTargetRecord('PlanningShiftTaskSegment', leftSegment, beforeLeftSegment, targetLeftSegment, 'left');
        rightSegment = await ensureTargetRecord('PlanningShiftTaskSegment', rightSegment, beforeRightSegment, targetRightSegment, 'right');
        rightShift = await ensureTargetRecord('PlanningShift', rightShift, beforeRightShift, targetRightShift, 'right');
      }

      const updatedAssignments: LooseRecord[] = [];
      for (const beforeAssignment of initialAssignments) {
        let assignment = await requireRecord(base44, 'PlanningAssignment', beforeAssignment.id, 'Toewijzing');
        const patch = lockedState.assignment_patches?.[assignment.id] || {};
        if (!sharedBoundaryAssignmentMatches(assignment, patch)) {
          const unchanged = [
            'shift_id',
            'planning_shift_id',
            'personnel_id',
            'slot_index',
            'status',
            'warning_codes',
            'warning_snapshot',
            'has_critical_warnings',
            'contract_routing_snapshot',
            'personnel_contract_id',
          ].every(key => stableStringify(assignment[key] ?? null) === stableStringify(beforeAssignment[key] ?? null));
          if (!unchanged) sharedBoundaryRepairConflict('PlanningAssignment', assignment, lockedState);
          await renewPlanningResourceLeases(base44, recoveryUser, leases);
          assignment = await casUpdate(
            base44,
            'PlanningAssignment',
            assignment,
            revisionOf(assignment),
            {
              ...patch,
              metadata: {
                ...(assignment.metadata || {}),
                shared_boundary_mutation: {
                  operation_id: lockedState.operation_id,
                  idempotency_key: lockedState.idempotency_key,
                  correlation_id: lockedState.correlation_id,
                  request_hash: lockedState.request_hash,
                  actor_user_id: lockedState.actor_user_id || null,
                  boundary_date: lockedState.boundary_date,
                  boundary_time: lockedState.boundary_time,
                  phase: 'state_written_audit_pending',
                  recovered_by_user_id: recoveryUser.id || null,
                  updated_at: nowIso(),
                },
              },
            },
          );
        }
        updatedAssignments.push(assignment);
      }

      const leftInterval = segmentInterval(leftSegment);
      const rightInterval = segmentInterval(rightSegment);
      if (!leftInterval || !rightInterval || leftInterval.end !== rightInterval.start) {
        throw new ApiError(409, 'Herstelde gedeelde grens bevat nog een gat of overlap', {
          code: 'BOUNDARY_RECOVERY_COVERAGE_INVALID',
          task_occurrence_id: occurrenceId,
        });
      }

      if (lockedState.effective_view !== 'target' || lockedState.phase === 'prepared') {
        const { planning_composition_reservation: _reservation, ...metadata } = occurrence.metadata || {};
        await renewPlanningResourceLeases(base44, recoveryUser, leases);
        occurrence = await casUpdate(base44, 'PlanningTaskOccurrence', occurrence, revisionOf(occurrence), {
          last_modified_by_user_id: recoveryUser.id || null,
          last_modified_at: nowIso(),
          metadata: {
            ...metadata,
            shared_boundary_mutation: {
              ...lockedState,
              phase: 'applied_audit_pending',
              effective_view: 'target',
              recovered_by_user_id: recoveryUser.id || null,
              recovery_correlation_id: context.correlationId,
              applied_at: nowIso(),
            },
            last_shared_boundary_idempotency_key: lockedState.idempotency_key,
            last_shared_boundary_correlation_id: lockedState.correlation_id,
            last_shared_boundary_request_hash: lockedState.request_hash,
            last_shared_boundary_actor_user_id: lockedState.actor_user_id || null,
            last_shared_boundary_completed_at: nowIso(),
          },
        });
        lockedState = occurrence.metadata.shared_boundary_mutation;
      }

      const result = {
        shifts: [leftShift, rightShift],
        segments: [leftSegment, rightSegment],
        assignments: updatedAssignments,
        task_occurrences: [occurrence],
        boundary: { date: lockedState.boundary_date, time: lockedState.boundary_time },
      };
      const priorAudits = await filterAllRecords(
        base44.asServiceRole.entities.PlanningAuditEvent,
        { idempotency_key: lockedState.idempotency_key },
        '-occurred_at',
      );
      let audit = priorAudits.find(item => (
        item.action === SHARED_TASK_BOUNDARY_ACTION
        && item.metadata?.request_hash === lockedState.request_hash
      )) || null;
      if (!audit) {
        await renewPlanningResourceLeases(base44, recoveryUser, leases);
        const originalActor = {
          id: lockedState.actor_user_id || null,
          name: lockedState.actor_snapshot?.name || null,
          email: lockedState.actor_snapshot?.email || null,
        };
        audit = await appendAudit(base44, originalActor, {
          action: SHARED_TASK_BOUNDARY_ACTION,
          resource_type: 'PlanningTaskOccurrence',
          resource_id: occurrenceId,
          before_state: lockedState.before_state || null,
          after_state: result,
          correlation_id: lockedState.correlation_id,
          idempotency_key: lockedState.idempotency_key,
          undoable: false,
          metadata: {
            request_hash: lockedState.request_hash,
            operation_id: lockedState.operation_id,
            affected_shift_ids: [lockedState.left_shift_id, lockedState.right_shift_id],
            affected_segment_ids: [lockedState.left_segment_id, lockedState.right_segment_id],
            task_occurrence_id: occurrenceId,
            boundary_date: lockedState.boundary_date,
            boundary_time: lockedState.boundary_time,
            recovered_by_user_id: recoveryUser.id || null,
            recovery_correlation_id: context.correlationId,
          },
        });
      }
      if (!audit) {
        throw new ApiError(500, 'Auditregistratie voor gedeelde grens kon niet worden bevestigd', {
          code: 'BOUNDARY_RECOVERY_AUDIT_MISSING',
          task_occurrence_id: occurrenceId,
        });
      }

      occurrence = await requireRecord(base44, 'PlanningTaskOccurrence', occurrenceId, 'Taakuitvoering');
      lockedState = occurrence.metadata?.shared_boundary_mutation;
      if (lockedState?.phase !== 'completed') {
        await renewPlanningResourceLeases(base44, recoveryUser, leases);
        occurrence = await casUpdate(base44, 'PlanningTaskOccurrence', occurrence, revisionOf(occurrence), {
          last_modified_by_user_id: recoveryUser.id || null,
          last_modified_at: nowIso(),
          metadata: {
            ...(occurrence.metadata || {}),
            shared_boundary_mutation: completedSharedBoundaryMutationState(lockedState, audit.id, {
              recovered_by_user_id: recoveryUser.id || null,
              recovery_correlation_id: context.correlationId,
            }),
          },
        });
      }
      return {
        ok: true,
        repaired: true,
        ...result,
        task_occurrences: [occurrence],
        audit_event_id: audit.id,
        undoable: false,
        undo_token: null,
      };
    },
  );
}

async function composeAndAssign(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  return composeShift(base44, user, { ...body, action: 'compose_and_assign' }, context);
}

async function cancelTaskShift(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  requireMutationIdempotency(context, 'cancel_task_shift');
  const requestHash = await mutationRequestHash('cancel_task_shift', body);
  const replay = await findReplay(base44, 'cancel_task_shift', context.idempotencyKey);
  if (replay) {
    assertReplayFingerprint(replay, user, requestHash, 'cancel_task_shift');
    return replayResult(replay);
  }

  const shiftId = requireId(body, 'shift_id');
  let shift = await requireRecord(base44, 'PlanningShift', shiftId, 'Dienst');
  const cancellationOwnedByKey = shift.metadata?.last_task_shift_cancellation_key === context.idempotencyKey;
  if (cancellationOwnedByKey && (
    shift.metadata?.last_task_shift_cancellation_request_hash !== requestHash
    || shift.metadata?.last_task_shift_cancellation_actor_user_id !== (user.id || null)
  )) {
    throw new ApiError(409, 'idempotency_key hoort bij een andere cancel_task_shift-opdracht');
  }
  let recovering = cancellationOwnedByKey;
  if (shift.source_type !== 'task') throw new ApiError(409, 'Alleen een dienst uit objecttaken kan hier worden verwijderd');
  if (Number(shift.published_revision || 0) > 0 || shift.status === 'published') {
    throw new ApiError(409, 'Een eerder gepubliceerde dienst moet via een formele annulering worden afgehandeld');
  }
  if (shift.status === 'cancelled' && !recovering) throw new ApiError(409, 'Deze dienst is al verwijderd');
  if (!recovering) {
    const expectedShiftRevision = positiveInteger(body.expected_shift_revision, 'expected_shift_revision');
    if (revisionOf(shift) !== expectedShiftRevision) {
      throw new ApiError(409, 'Planning is intussen gewijzigd', {
        entity: 'PlanningShift',
        id: shift.id,
        expected_revision: expectedShiftRevision,
        current_revision: revisionOf(shift),
      });
    }
  }

  const [segments, assignments] = await Promise.all([
    filterAllRecords(base44.asServiceRole.entities.PlanningShiftTaskSegment, { shift_id: shift.id }),
    filterAllRecords(base44.asServiceRole.entities.PlanningAssignment, { shift_id: shift.id }),
  ]);
  const occurrenceIds = uniqueStrings(segments.map(item => item.task_occurrence_id));
  const occurrences = await Promise.all(
    occurrenceIds.map(id => requireRecord(base44, 'PlanningTaskOccurrence', id, 'Taakuitvoering')),
  );
  const descriptors: LooseRecord[] = await Promise.all([
    resourceCoordinatorDescriptor('shift_composition', shift.id),
    ...occurrenceIds.map(id => resourceCoordinatorDescriptor('task_occurrence', id)),
  ]);
  descriptors.push(...await personnelDayDescriptors(
    assignments.filter(item => item.status !== 'removed').map(item => item.personnel_id),
    [shift],
  ));
  return withPlanningResourceLeases(base44, user, context, requestHash, descriptors, async leases => {
  shift = await requireRecord(base44, 'PlanningShift', shiftId, 'Dienst');
  await assertNoForeignPendingMutation(
    base44,
    shift,
    context,
    'cancel_task_shift',
    user,
    requestHash,
  );
  const lockedCancellationOwnedByKey = (
    shift.metadata?.last_task_shift_cancellation_key === context.idempotencyKey
  );
  if (lockedCancellationOwnedByKey && (
    shift.metadata?.last_task_shift_cancellation_request_hash !== requestHash
    || shift.metadata?.last_task_shift_cancellation_actor_user_id !== (user.id || null)
  )) {
    throw new ApiError(409, 'idempotency_key hoort bij een andere cancel_task_shift-opdracht');
  }
  recovering = lockedCancellationOwnedByKey;
  if (shift.source_type !== 'task') throw new ApiError(409, 'Alleen een dienst uit objecttaken kan hier worden verwijderd');
  if (Number(shift.published_revision || 0) > 0 || shift.status === 'published') {
    throw new ApiError(409, 'Een eerder gepubliceerde dienst moet via een formele annulering worden afgehandeld');
  }
  if (shift.status === 'cancelled' && !recovering) throw new ApiError(409, 'Deze dienst is al verwijderd');
  if (!recovering) {
    const expectedShiftRevision = positiveInteger(body.expected_shift_revision, 'expected_shift_revision');
    if (revisionOf(shift) !== expectedShiftRevision) {
      throw new ApiError(409, 'Planning is intussen gewijzigd', {
        entity: 'PlanningShift',
        id: shift.id,
        expected_revision: expectedShiftRevision,
        current_revision: revisionOf(shift),
      });
    }
  }
  const expectedOccurrenceRevisions = body.expected_occurrence_revisions || {};
  const reservedOccurrences: LooseRecord[] = [];
  const reservationExpiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  for (const occurrence of [...occurrences].sort((left, right) => String(left.id).localeCompare(String(right.id)))) {
    await assertNoForeignPendingSingleTaskOccurrenceMutation(
      base44,
      occurrence,
      context,
      user,
      requestHash,
    );
    const reservation = occurrence.metadata?.planning_composition_reservation;
    const ownsReservation = reservation?.idempotency_key === context.idempotencyKey
      && reservation?.request_hash === requestHash;
    const completedByThisRequest = occurrence.metadata?.last_task_shift_cancellation_key === context.idempotencyKey;
    const reservationActive = reservation?.status === 'pending'
      && Date.parse(reservation.expires_at || '') > Date.now();
    if (reservationActive && !ownsReservation) {
      throw new ApiError(409, 'Deze taakdekking wordt op dit moment door een andere planner gewijzigd', {
        task_occurrence_id: occurrence.id,
      });
    }
    const expected = expectedOccurrenceRevisions[occurrence.id] == null
      ? revisionOf(occurrence)
      : positiveInteger(expectedOccurrenceRevisions[occurrence.id], `expected_occurrence_revisions.${occurrence.id}`);
    if (revisionOf(occurrence) !== expected && !ownsReservation && !completedByThisRequest) {
      throw new ApiError(409, 'Taakdekking is intussen gewijzigd', {
        entity: 'PlanningTaskOccurrence',
        id: occurrence.id,
        expected_revision: expected,
        current_revision: revisionOf(occurrence),
      });
    }
    if (ownsReservation || completedByThisRequest) {
      reservedOccurrences.push(occurrence);
      continue;
    }
    await renewPlanningResourceLeases(base44, user, leases);
    reservedOccurrences.push(await casUpdate(base44, 'PlanningTaskOccurrence', occurrence, expected, {
      last_modified_by_user_id: user.id || null,
      last_modified_at: nowIso(),
      metadata: {
        ...(occurrence.metadata || {}),
        planning_composition_reservation: {
          idempotency_key: context.idempotencyKey,
          correlation_id: context.correlationId,
          action: 'cancel_task_shift',
          request_hash: requestHash,
          status: 'pending',
          acquired_at: nowIso(),
          expires_at: reservationExpiresAt,
        },
      },
    }));
  }

  const beforeState = { shift, segments, assignments };
  if (!recovering) {
    await renewPlanningResourceLeases(base44, user, leases);
    shift = await casUpdate(base44, 'PlanningShift', shift, revisionOf(shift), {
      status: 'cancelled',
      last_modified_by_user_id: user.id || null,
      last_modified_at: nowIso(),
      metadata: {
        ...(shift.metadata || {}),
        last_task_shift_cancellation_key: context.idempotencyKey,
        last_task_shift_cancellation_correlation_id: context.correlationId,
        last_task_shift_cancellation_request_hash: requestHash,
        last_task_shift_cancellation_actor_user_id: user.id || null,
      },
    });
  }
  const removedSegments: LooseRecord[] = [];
  for (const segment of segments.filter(item => item.status !== 'removed')) {
    await renewPlanningResourceLeases(base44, user, leases);
    removedSegments.push(await casUpdate(base44, 'PlanningShiftTaskSegment', segment, revisionOf(segment), {
      status: 'removed',
      last_modified_by_user_id: user.id || null,
      last_modified_at: nowIso(),
      metadata: { ...(segment.metadata || {}), removed_by_cancellation_key: context.idempotencyKey },
    }));
  }
  const removedAssignments: LooseRecord[] = [];
  for (const assignment of assignments.filter(item => item.status !== 'removed')) {
    await renewPlanningResourceLeases(base44, user, leases);
    removedAssignments.push(await casUpdate(base44, 'PlanningAssignment', assignment, revisionOf(assignment), {
      status: 'removed',
      removed_by_user_id: user.id || null,
      removed_at: nowIso(),
    }));
  }
  const updatedOccurrences: LooseRecord[] = [];
  for (const occurrence of reservedOccurrences) {
    if (occurrence.metadata?.last_task_shift_cancellation_key === context.idempotencyKey
      && !occurrence.metadata?.planning_composition_reservation) {
      updatedOccurrences.push(occurrence);
      continue;
    }
    const { planning_composition_reservation: _reservation, ...metadata } = occurrence.metadata || {};
    await renewPlanningResourceLeases(base44, user, leases);
    updatedOccurrences.push(await casUpdate(base44, 'PlanningTaskOccurrence', occurrence, revisionOf(occurrence), {
      last_modified_by_user_id: user.id || null,
      last_modified_at: nowIso(),
      metadata: {
        ...metadata,
        last_task_shift_cancellation_key: context.idempotencyKey,
        last_task_shift_cancellation_correlation_id: context.correlationId,
        last_task_shift_cancellation_request_hash: requestHash,
        last_task_shift_cancellation_completed_at: nowIso(),
      },
    }));
  }
  const result = {
    shift,
    removed_segment_ids: segments.map(item => item.id),
    removed_assignment_ids: assignments.map(item => item.id),
    task_occurrences: updatedOccurrences,
  };
  await renewPlanningResourceLeases(base44, user, leases);
  const audit = await appendAudit(base44, user, {
    action: 'cancel_task_shift',
    resource_type: 'PlanningShift',
    resource_id: shift.id,
    shift_id: shift.id,
    before_state: beforeState,
    after_state: result,
    correlation_id: context.correlationId,
    idempotency_key: context.idempotencyKey,
    undoable: false,
    metadata: { request_hash: requestHash },
  });
  return { ok: true, ...result, audit_event_id: audit.id, undoable: false, undo_token: null };
  });
}

async function uniqueSlotAssignment(base44: LooseRecord, shiftId: string, slotIndex: number) {
  const records = await filterAllRecords(base44.asServiceRole.entities.PlanningAssignment, {
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
  requireMutationIdempotency(context, 'assign');
  const requestHash = await mutationRequestHash('assign', body);
  const replay = await findReplay(base44, 'assign', context.idempotencyKey);
  if (replay) {
    assertReplayFingerprint(replay, user, requestHash, 'assign');
    return replayResult(replay);
  }

  const shiftId = requireId(body, 'shift_id');
  const personnelId = requireId(body, 'personnel_id');
  const expectedShiftRevision = positiveInteger(body.expected_shift_revision, 'expected_shift_revision');
  const slotIndex = nonNegativeInteger(body.slot_index ?? 0, 'slot_index');
  const initialShift = await requireRecord(base44, 'PlanningShift', shiftId, 'Dienst');
  const descriptors = await personnelDayDescriptors([personnelId], [initialShift]);
  descriptors.push(await resourceCoordinatorDescriptor('shift_composition', shiftId));
  return withPlanningResourceLeases(base44, user, context, requestHash, descriptors, async leases => {
    const [shift, personnel] = await Promise.all([
      requireRecord(base44, 'PlanningShift', shiftId, 'Dienst'),
      requireRecord(base44, 'Personnel', personnelId, 'Medewerker'),
    ]);
    await assertNoForeignPendingMutation(base44, shift, context, 'assign', user, requestHash);
    const recoveryMarker = matchingPlanningMutationMarker(
      shift,
      'assign',
      context,
      user,
      requestHash,
    );
    const recovering = Boolean(recoveryMarker);
    if (!recovering && revisionOf(shift) !== expectedShiftRevision) {
      throw new ApiError(409, 'Planning is intussen gewijzigd', {
        entity: 'PlanningShift',
        id: shift.id,
        expected_revision: expectedShiftRevision,
        current_revision: revisionOf(shift),
      });
    }
    if (shift.status === 'cancelled') throw new ApiError(409, 'Een geannuleerde dienst kan niet worden bezet');
    if (slotIndex >= Number(shift.required_count || 1)) {
      throw new ApiError(400, 'slot_index valt buiten required_count');
    }

    const existing = await uniqueSlotAssignment(base44, shiftId, slotIndex);
    const sameShiftAssignments = await filterAllRecords(base44.asServiceRole.entities.PlanningAssignment, {
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
    await renewPlanningResourceLeases(base44, user, leases);
    const updatedShift = recovering
      ? shift
      : await markShiftDraft(base44, shift, expectedShiftRevision, user, {
          metadata: planningMutationMetadata(shift, 'assign', context, user, requestHash),
        });
    const suppliedWarnings = dedupeWarnings(normalizeSuppliedWarnings(body));
    const assignmentPayload = {
      personnel_id: personnel.id,
      personnel_name_snapshot: personnel.name
        || [personnel.call_name || personnel.first_name, personnel.name_prefix, personnel.last_name].filter(Boolean).join(' ')
        || 'Medewerker',
      personnel_contract_id: null,
      status: 'draft',
      warning_codes: [...new Set(suppliedWarnings.map(item => item.code))],
      warning_snapshot: suppliedWarnings,
      has_critical_warnings: suppliedWarnings.some(item => item.severity === 'critical'),
      contract_routing_snapshot: null,
      assigned_by_user_id: user.id || null,
      assigned_at: nowIso(),
      removed_by_user_id: null,
      removed_at: null,
      last_published_correlation_id: existing?.last_published_correlation_id || null,
      metadata: {
        ...(existing?.metadata || {}),
        assignment_source: body.assignment_source || 'planning_ui',
        last_assign_idempotency_key: context.idempotencyKey,
        last_assign_request_hash: requestHash,
        last_assign_actor_user_id: user.id || null,
      },
    };
    await renewPlanningResourceLeases(base44, user, leases);
    const writtenAssignment = existing
      ? await casUpdate(base44, 'PlanningAssignment', existing, revisionOf(existing), assignmentPayload)
      : await base44.asServiceRole.entities.PlanningAssignment.create({
          shift_id: shift.id,
          slot_index: slotIndex,
          ...assignmentPayload,
          revision: 1,
          published_revision: 0,
        });
    await renewPlanningResourceLeases(base44, user, leases);
    const finalPersonnel = await requireRecord(base44, 'Personnel', personnelId, 'Medewerker');
    const finalEligibility = await evaluateAssignmentWarnings(
      base44,
      updatedShift,
      finalPersonnel,
      writtenAssignment.id,
      normalizeSuppliedWarnings(body),
    );
    await renewPlanningResourceLeases(base44, user, leases);
    const assignment = await casUpdate(
      base44,
      'PlanningAssignment',
      writtenAssignment,
      revisionOf(writtenAssignment),
      {
        personnel_contract_id: finalEligibility.personnel_contract_id,
        warning_codes: finalEligibility.warning_codes,
        warning_snapshot: finalEligibility.warning_snapshot,
        has_critical_warnings: finalEligibility.has_critical_warnings,
        contract_routing_snapshot: finalEligibility.contract_routing_snapshot,
        metadata: {
          ...(writtenAssignment.metadata || {}),
          final_assignment_validation_at: nowIso(),
        },
      },
    );
    const result = { shift: updatedShift, assignment };
    await renewPlanningResourceLeases(base44, user, leases);
    const audit = await appendAudit(base44, user, {
      action: 'assign',
      resource_type: 'PlanningAssignment',
      resource_id: assignment.id,
      shift_id: shift.id,
      assignment_id: assignment.id,
      before_state: recovering ? null : existing ? { shift, assignment: existing } : { shift, assignment: null },
      after_state: result,
      correlation_id: context.correlationId,
      idempotency_key: context.idempotencyKey,
      undoable: !recovering,
      metadata: { request_hash: requestHash, recovered_completed_state: recovering },
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
      undoable: audit.undoable === true,
      undo_token: audit.undoable === true ? (audit.undo_token || null) : null,
    };
  });
}

async function unassignPersonnel(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  requireMutationIdempotency(context, 'unassign');
  const requestHash = await mutationRequestHash('unassign', body);
  const replay = await findReplay(base44, 'unassign', context.idempotencyKey);
  if (replay) {
    assertReplayFingerprint(replay, user, requestHash, 'unassign');
    return replayResult(replay);
  }

  const shiftId = requireId(body, 'shift_id');
  const expectedShiftRevision = positiveInteger(body.expected_shift_revision, 'expected_shift_revision');
  const initialShift = await requireRecord(base44, 'PlanningShift', shiftId, 'Dienst');
  let initialAssignment: LooseRecord | null = null;
  if (body.assignment_id) {
    const loadedAssignment = await requireRecord(
      base44,
      'PlanningAssignment',
      compact(body.assignment_id),
      'Toewijzing',
    );
    if (loadedAssignment.shift_id !== initialShift.id) throw new ApiError(409, 'Toewijzing hoort niet bij deze dienst');
    initialAssignment = loadedAssignment;
  } else {
    initialAssignment = await uniqueSlotAssignment(
      base44,
      initialShift.id,
      nonNegativeInteger(body.slot_index ?? 0, 'slot_index'),
    );
  }
  if (!initialAssignment) throw new ApiError(404, 'Toewijzing niet gevonden');
  const descriptors = await personnelDayDescriptors([initialAssignment.personnel_id], [initialShift]);
  descriptors.push(await resourceCoordinatorDescriptor('shift_composition', shiftId));
  return withPlanningResourceLeases(base44, user, context, requestHash, descriptors, async leases => {
    const [shift, assignment] = await Promise.all([
      requireRecord(base44, 'PlanningShift', shiftId, 'Dienst'),
      requireRecord(base44, 'PlanningAssignment', initialAssignment.id, 'Toewijzing'),
    ]);
    if (
      String(assignment.shift_id) !== String(shift.id)
      || String(assignment.personnel_id) !== String(initialAssignment.personnel_id)
    ) throw new ApiError(409, 'Toewijzing is intussen gewijzigd; laad het rooster opnieuw');
    await assertNoForeignPendingMutation(base44, shift, context, 'unassign', user, requestHash);
    const recoveryMarker = matchingPlanningMutationMarker(
      shift,
      'unassign',
      context,
      user,
      requestHash,
    );
    const recovering = Boolean(recoveryMarker);
    if (!recovering && revisionOf(shift) !== expectedShiftRevision) {
      throw new ApiError(409, 'Planning is intussen gewijzigd', {
        entity: 'PlanningShift',
        id: shift.id,
        expected_revision: expectedShiftRevision,
        current_revision: revisionOf(shift),
      });
    }
    if (assignment.status === 'removed') {
      if (
        assignment.metadata?.last_unassign_idempotency_key !== context.idempotencyKey
        || assignment.metadata?.last_unassign_request_hash !== requestHash
        || assignment.metadata?.last_unassign_actor_user_id !== (user.id || null)
      ) {
        throw new ApiError(409, 'Deze toewijzing was al door een andere planningactie verwijderd');
      }
      await renewPlanningResourceLeases(base44, user, leases);
      const recoveryAudit = await appendAudit(base44, user, {
        action: 'unassign',
        resource_type: 'PlanningAssignment',
        resource_id: assignment.id,
        shift_id: shift.id,
        assignment_id: assignment.id,
        before_state: null,
        after_state: { shift, assignment },
        correlation_id: context.correlationId,
        idempotency_key: context.idempotencyKey,
        undoable: false,
        metadata: { request_hash: requestHash, recovered_completed_state: true },
      });
      return {
        ok: true,
        idempotent: true,
        shift,
        assignment,
        audit_event_id: recoveryAudit.id,
        undoable: false,
        undo_token: null,
      };
    }

    await renewPlanningResourceLeases(base44, user, leases);
    const updatedShift = recovering
      ? shift
      : await markShiftDraft(base44, shift, expectedShiftRevision, user, {
          metadata: planningMutationMetadata(shift, 'unassign', context, user, requestHash),
        });
    await renewPlanningResourceLeases(base44, user, leases);
    const updatedAssignment = await casUpdate(base44, 'PlanningAssignment', assignment, revisionOf(assignment), {
      status: 'removed',
      removed_by_user_id: user.id || null,
      removed_at: nowIso(),
      metadata: {
        ...(assignment.metadata || {}),
        last_unassign_idempotency_key: context.idempotencyKey,
        last_unassign_request_hash: requestHash,
        last_unassign_actor_user_id: user.id || null,
      },
    });
    const result = { shift: updatedShift, assignment: updatedAssignment };
    await renewPlanningResourceLeases(base44, user, leases);
    const audit = await appendAudit(base44, user, {
      action: 'unassign',
      resource_type: 'PlanningAssignment',
      resource_id: assignment.id,
      shift_id: shift.id,
      assignment_id: assignment.id,
      before_state: recovering ? null : { shift, assignment },
      after_state: result,
      correlation_id: context.correlationId,
      idempotency_key: context.idempotencyKey,
      undoable: !recovering,
      undo_payload: {
        action: 'restore_assignment',
        shift_id: shift.id,
        assignment_id: assignment.id,
        previous_shift: shift,
        previous_assignment: assignment,
      },
      metadata: { request_hash: requestHash, recovered_completed_state: recovering },
    });
    return {
      ok: true,
      ...result,
      audit_event_id: audit.id,
      undoable: audit.undoable === true,
      undo_token: audit.undoable === true ? (audit.undo_token || null) : null,
    };
  });
}

async function restoreAssignment(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  requireMutationIdempotency(context, 'restore_assignment');
  const requestHash = await mutationRequestHash('restore_assignment', body);
  const replay = await findReplay(base44, 'restore_assignment', context.idempotencyKey);
  if (replay) {
    assertReplayFingerprint(replay, user, requestHash, 'restore_assignment');
    return replayResult(replay);
  }

  const assignmentId = requireId(body, 'assignment_id');
  const expectedShiftRevision = positiveInteger(body.expected_shift_revision, 'expected_shift_revision');
  const initialAssignment = await requireRecord(base44, 'PlanningAssignment', assignmentId, 'Toewijzing');
  const initialShift = await requireRecord(base44, 'PlanningShift', initialAssignment.shift_id, 'Dienst');
  const descriptors = await personnelDayDescriptors([initialAssignment.personnel_id], [initialShift]);
  descriptors.push(await resourceCoordinatorDescriptor('shift_composition', initialShift.id));
  return withPlanningResourceLeases(base44, user, context, requestHash, descriptors, async leases => {
    const assignment = await requireRecord(base44, 'PlanningAssignment', assignmentId, 'Toewijzing');
    if (
      String(assignment.shift_id) !== String(initialAssignment.shift_id)
      || String(assignment.personnel_id) !== String(initialAssignment.personnel_id)
    ) {
      throw new ApiError(409, 'Toewijzing is intussen gewijzigd; laad het rooster opnieuw');
    }
    const [shift, personnel] = await Promise.all([
      requireRecord(base44, 'PlanningShift', assignment.shift_id, 'Dienst'),
      requireRecord(base44, 'Personnel', assignment.personnel_id, 'Medewerker'),
    ]);
    await assertNoForeignPendingMutation(base44, shift, context, 'restore_assignment', user, requestHash);
    const recoveryMarker = matchingPlanningMutationMarker(
      shift,
      'restore_assignment',
      context,
      user,
      requestHash,
    );
    const recovering = Boolean(recoveryMarker);
    if (!recovering && revisionOf(shift) !== expectedShiftRevision) {
      throw new ApiError(409, 'Planning is intussen gewijzigd', {
        entity: 'PlanningShift',
        id: shift.id,
        expected_revision: expectedShiftRevision,
        current_revision: revisionOf(shift),
      });
    }
    if (shift.status === 'cancelled') throw new ApiError(409, 'Een toewijzing op een geannuleerde dienst kan niet worden hersteld');
    if (assignment.status !== 'removed') {
      if (
        assignment.metadata?.last_restore_idempotency_key !== context.idempotencyKey
        || assignment.metadata?.last_restore_request_hash !== requestHash
        || assignment.metadata?.last_restore_actor_user_id !== (user.id || null)
      ) {
        throw new ApiError(409, 'Deze toewijzing is al door een andere planningactie hersteld');
      }
      await renewPlanningResourceLeases(base44, user, leases);
      const recoveryAudit = await appendAudit(base44, user, {
        action: 'restore_assignment',
        resource_type: 'PlanningAssignment',
        resource_id: assignment.id,
        shift_id: shift.id,
        assignment_id: assignment.id,
        before_state: null,
        after_state: { shift, assignment },
        correlation_id: context.correlationId,
        idempotency_key: context.idempotencyKey,
        undoable: false,
        metadata: { request_hash: requestHash, recovered_completed_state: true },
      });
      return {
        ok: true,
        idempotent: true,
        shift,
        assignment,
        audit_event_id: recoveryAudit.id,
        undoable: false,
        undo_token: null,
      };
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
    await renewPlanningResourceLeases(base44, user, leases);
    const updatedShift = recovering
      ? shift
      : await markShiftDraft(base44, shift, expectedShiftRevision, user, {
          metadata: planningMutationMetadata(shift, 'restore_assignment', context, user, requestHash),
        });
    await renewPlanningResourceLeases(base44, user, leases);
    const writtenAssignment = await casUpdate(base44, 'PlanningAssignment', assignment, revisionOf(assignment), {
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
      metadata: {
        ...(assignment.metadata || {}),
        last_restore_idempotency_key: context.idempotencyKey,
        last_restore_request_hash: requestHash,
        last_restore_actor_user_id: user.id || null,
      },
    });
    await renewPlanningResourceLeases(base44, user, leases);
    const finalPersonnel = await requireRecord(base44, 'Personnel', assignment.personnel_id, 'Medewerker');
    const finalEligibility = await evaluateAssignmentWarnings(
      base44,
      updatedShift,
      finalPersonnel,
      writtenAssignment.id,
      normalizeSuppliedWarnings(body),
    );
    await renewPlanningResourceLeases(base44, user, leases);
    const updatedAssignment = await casUpdate(
      base44,
      'PlanningAssignment',
      writtenAssignment,
      revisionOf(writtenAssignment),
      {
        warning_codes: finalEligibility.warning_codes,
        warning_snapshot: finalEligibility.warning_snapshot,
        has_critical_warnings: finalEligibility.has_critical_warnings,
        contract_routing_snapshot: finalEligibility.contract_routing_snapshot,
        personnel_contract_id: finalEligibility.personnel_contract_id,
        metadata: {
          ...(writtenAssignment.metadata || {}),
          final_assignment_validation_at: nowIso(),
          last_restore_idempotency_key: context.idempotencyKey,
          last_restore_request_hash: requestHash,
          last_restore_actor_user_id: user.id || null,
        },
      },
    );
    const result = { shift: updatedShift, assignment: updatedAssignment };
    await renewPlanningResourceLeases(base44, user, leases);
    const audit = await appendAudit(base44, user, {
      action: 'restore_assignment',
      resource_type: 'PlanningAssignment',
      resource_id: assignment.id,
      shift_id: shift.id,
      assignment_id: assignment.id,
      before_state: recovering ? null : { shift, assignment },
      after_state: result,
      correlation_id: context.correlationId,
      idempotency_key: context.idempotencyKey,
      undoable: !recovering,
      metadata: { request_hash: requestHash, recovered_completed_state: recovering },
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
      undoable: audit.undoable === true,
      undo_token: audit.undoable === true ? (audit.undo_token || null) : null,
    };
  });
}

async function moveShift(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  requireMutationIdempotency(context, 'move');
  const requestHash = await mutationRequestHash('move', body);
  const replay = await findReplay(base44, 'move', context.idempotencyKey);
  if (replay) {
    assertReplayFingerprint(replay, user, requestHash, 'move');
    return replayResult(replay);
  }

  const shiftId = requireId(body, 'shift_id');
  const expectedShiftRevision = positiveInteger(body.expected_shift_revision, 'expected_shift_revision');
  const initialShift = await requireRecord(base44, 'PlanningShift', shiftId, 'Dienst');
  const initialAssignments = (await filterAllRecords(
    base44.asServiceRole.entities.PlanningAssignment,
    { shift_id: shiftId },
  )).filter((item: LooseRecord) => item.status !== 'removed');
  const initialTiming = resolveShiftTiming(initialShift, body);
  const proposedInitialShift = {
    ...initialShift,
    ...initialTiming,
  };
  const descriptors = await personnelDayDescriptors(
    initialAssignments.map(item => item.personnel_id),
    [initialShift, proposedInitialShift],
  );
  descriptors.push(await resourceCoordinatorDescriptor('shift_composition', shiftId));
  return withPlanningResourceLeases(base44, user, context, requestHash, descriptors, async leases => {
    const shift = await requireRecord(base44, 'PlanningShift', shiftId, 'Dienst');
    await assertNoForeignPendingMutation(base44, shift, context, 'move', user, requestHash);
    const recoveryMarker = matchingPlanningMutationMarker(
      shift,
      'move',
      context,
      user,
      requestHash,
    );
    const recovering = Boolean(recoveryMarker);
    if (shift.status === 'cancelled') throw new ApiError(409, 'Een geannuleerde dienst kan niet worden verplaatst');
    if (!recovering && revisionOf(shift) !== expectedShiftRevision) {
      throw new ApiError(409, 'Planning is intussen gewijzigd', {
        entity: 'PlanningShift',
        id: shift.id,
        expected_revision: expectedShiftRevision,
        current_revision: revisionOf(shift),
      });
    }
    const [composedSegments, assignments] = await Promise.all([
      filterAllRecords(base44.asServiceRole.entities.PlanningShiftTaskSegment, { shift_id: shift.id }),
      filterAllRecords(base44.asServiceRole.entities.PlanningAssignment, { shift_id: shift.id }),
    ]);
    if (composedSegments.some((item: LooseRecord) => item.status !== 'removed')) {
      throw new ApiError(409, 'Pas tijden van een samengestelde dienst aan via Dienstinhoud; zo blijft taakdekking correct');
    }
    const activeAssignments = assignments.filter((item: LooseRecord) => item.status !== 'removed');
    const initialAssignmentKeys = initialAssignments
      .map(item => `${item.id}:${item.personnel_id}`)
      .sort();
    const currentAssignmentKeys = activeAssignments
      .map(item => `${item.id}:${item.personnel_id}`)
      .sort();
    if (stableStringify(currentAssignmentKeys) !== stableStringify(initialAssignmentKeys)) {
      throw new ApiError(409, 'Dienstbezetting is intussen gewijzigd; laad het rooster opnieuw');
    }
    const timing = resolveShiftTiming(shift, body);
    await renewPlanningResourceLeases(base44, user, leases);
    const updatedShift = recovering
      ? shift
      : await markShiftDraft(base44, shift, expectedShiftRevision, user, {
          ...timing,
          metadata: planningMutationMetadata(shift, 'move', context, user, requestHash),
        });

    const writtenAssignments: LooseRecord[] = [];
    for (const assignment of activeAssignments) {
      await renewPlanningResourceLeases(base44, user, leases);
      const personnel = await requireRecord(base44, 'Personnel', assignment.personnel_id, 'Medewerker');
      const eligibility = await evaluateAssignmentWarnings(
        base44,
        updatedShift,
        personnel,
        assignment.id,
        normalizeArray(assignment.warning_snapshot).filter((item: LooseRecord) => item.source === 'planner'),
      );
      await renewPlanningResourceLeases(base44, user, leases);
      writtenAssignments.push(await casUpdate(
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
          metadata: {
            ...(assignment.metadata || {}),
            last_move_idempotency_key: context.idempotencyKey,
            last_move_request_hash: requestHash,
            last_move_actor_user_id: user.id || null,
          },
        },
      ));
    }
    await renewPlanningResourceLeases(base44, user, leases);
    const updatedAssignments: LooseRecord[] = [];
    for (const writtenAssignment of writtenAssignments) {
      await renewPlanningResourceLeases(base44, user, leases);
      const finalPersonnel = await requireRecord(
        base44,
        'Personnel',
        writtenAssignment.personnel_id,
        'Medewerker',
      );
      const finalEligibility = await evaluateAssignmentWarnings(
        base44,
        updatedShift,
        finalPersonnel,
        writtenAssignment.id,
        normalizeArray(writtenAssignment.warning_snapshot).filter((item: LooseRecord) => item.source === 'planner'),
      );
      await renewPlanningResourceLeases(base44, user, leases);
      updatedAssignments.push(await casUpdate(
        base44,
        'PlanningAssignment',
        writtenAssignment,
        revisionOf(writtenAssignment),
        {
          warning_codes: finalEligibility.warning_codes,
          warning_snapshot: finalEligibility.warning_snapshot,
          has_critical_warnings: finalEligibility.has_critical_warnings,
          contract_routing_snapshot: finalEligibility.contract_routing_snapshot,
          personnel_contract_id: finalEligibility.personnel_contract_id,
          metadata: {
            ...(writtenAssignment.metadata || {}),
            final_assignment_validation_at: nowIso(),
            last_move_idempotency_key: context.idempotencyKey,
            last_move_request_hash: requestHash,
            last_move_actor_user_id: user.id || null,
          },
        },
      ));
    }
    const result = { shift: updatedShift, assignments: updatedAssignments };
    await renewPlanningResourceLeases(base44, user, leases);
    const audit = await appendAudit(base44, user, {
      action: 'move',
      resource_type: 'PlanningShift',
      resource_id: shift.id,
      shift_id: shift.id,
      before_state: recovering ? null : { shift, assignments },
      after_state: result,
      correlation_id: context.correlationId,
      idempotency_key: context.idempotencyKey,
      undoable: !recovering,
      metadata: { request_hash: requestHash, recovered_completed_state: recovering },
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
      undoable: audit.undoable === true,
      undo_token: audit.undoable === true ? (audit.undo_token || null) : null,
    };
  });
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
  extraPatch: LooseRecord = {},
) {
  const previousPatch = previousShift ? pick(previousShift, SHIFT_UNDO_FIELDS) : { status: 'draft' };
  if (previousShift?.status === 'published') {
    previousPatch.published_revision = expectedRevision + 1;
  }
  return casUpdate(base44, 'PlanningShift', shift, expectedRevision, {
    ...previousPatch,
    ...extraPatch,
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
  requireMutationIdempotency(context, 'undo');
  const requestHash = await mutationRequestHash('undo', body);
  const replay = await findReplay(base44, 'undo', context.idempotencyKey);
  if (replay) {
    assertReplayFingerprint(replay, user, requestHash, 'undo');
    return replayResult(replay);
  }

  const auditEventId = requireId(body, 'audit_event_id');
  const undoToken = requireId(body, 'undo_token');
  const sourceEvent = await requireRecord(base44, 'PlanningAuditEvent', auditEventId, 'Audit-event');
  if (sourceEvent.undoable !== true || !sourceEvent.undo_payload) {
    throw new ApiError(409, 'Deze planningactie kan niet ongedaan worden gemaakt');
  }
  if (!sourceEvent.undo_token || sourceEvent.undo_token !== undoToken) {
    throw new ApiError(409, 'Undo-token is ongeldig of verlopen');
  }
  const earlierUndo = await filterAllRecords(base44.asServiceRole.entities.PlanningAuditEvent, {
    undo_of_event_id: sourceEvent.id,
  }, '-occurred_at');
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
  const initialShift = await requireRecord(base44, 'PlanningShift', shiftId, 'Dienst');
  const previousShift = undoPayload.previous_shift && typeof undoPayload.previous_shift === 'object'
    ? undoPayload.previous_shift
    : null;
  const initialCurrentAssignments = undoAction === 'move'
    ? (await filterAllRecords(base44.asServiceRole.entities.PlanningAssignment, { shift_id: shiftId }))
        .filter((item: LooseRecord) => item.status !== 'removed')
    : [await requireRecord(
        base44,
        'PlanningAssignment',
        requireId({ assignment_id: undoPayload.assignment_id || sourceEvent.assignment_id }, 'assignment_id'),
        'Toewijzing',
      )];
  const previousAssignmentsForLock = undoAction === 'move'
    ? normalizeArray<LooseRecord>(undoPayload.previous_assignments).filter(item => item?.id && item.status !== 'removed')
    : undoPayload.previous_assignment && typeof undoPayload.previous_assignment === 'object'
    ? [undoPayload.previous_assignment]
    : [];
  const descriptors = await personnelDayDescriptors(
    [...initialCurrentAssignments, ...previousAssignmentsForLock].map(item => item.personnel_id),
    [initialShift, previousShift]
      .filter((item): item is LooseRecord => Boolean(item?.service_date && item?.start_time && item?.end_time)),
  );
  descriptors.push(await resourceCoordinatorDescriptor('shift_composition', shiftId));
  return withPlanningResourceLeases(base44, user, context, requestHash, descriptors, async leases => {
    const completedInsideLease = (await filterAllRecords(base44.asServiceRole.entities.PlanningAuditEvent, {
      undo_of_event_id: sourceEvent.id,
    }, '-occurred_at')).find((event: LooseRecord) => event.action === 'undo');
    if (completedInsideLease) {
      return {
        ok: true,
        idempotent: true,
        ...(completedInsideLease.after_state || {}),
        audit_event_id: completedInsideLease.id,
        undoable: false,
        undo_token: null,
      };
    }

    const shift = await requireRecord(base44, 'PlanningShift', shiftId, 'Dienst');
    await assertNoForeignPendingMutation(base44, shift, context, 'undo', user, requestHash);
    const recoveryMarker = matchingPlanningMutationMarker(
      shift,
      'undo',
      context,
      user,
      requestHash,
    );
    const recovering = Boolean(recoveryMarker);
    if (!recovering && revisionOf(shift) !== expectedShiftRevision) {
      throw new ApiError(409, 'Planning is intussen gewijzigd', {
        entity: 'PlanningShift',
        id: shift.id,
        expected_revision: expectedShiftRevision,
        current_revision: revisionOf(shift),
      });
    }
    const undoShiftMetadata = planningMutationMetadata(
      shift,
      'undo',
      context,
      user,
      requestHash,
    );
    const beforeState: LooseRecord = { shift };
    let updatedShift: LooseRecord;
    let result: LooseRecord;

    if (undoAction === 'unassign') {
      const assignmentId = compact(undoPayload.assignment_id || sourceEvent.assignment_id);
      if (!assignmentId) throw new ApiError(409, 'Undo-payload mist assignment_id');
      const assignment = await requireRecord(base44, 'PlanningAssignment', assignmentId, 'Toewijzing');
      if (
        assignment.shift_id !== shift.id
        || String(assignment.personnel_id) !== String(initialCurrentAssignments[0]?.personnel_id)
      ) throw new ApiError(409, 'Undo-toewijzing is intussen gewijzigd');
      beforeState.assignment = assignment;
      await renewPlanningResourceLeases(base44, user, leases);
      updatedShift = await restoreShiftForUndo(
        base44,
        user,
        shift,
        recovering ? revisionOf(shift) : expectedShiftRevision,
        previousShift,
        { metadata: undoShiftMetadata },
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
      await renewPlanningResourceLeases(base44, user, leases);
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
      if (
        assignment.shift_id !== shift.id
        || String(assignment.personnel_id) !== String(initialCurrentAssignments[0]?.personnel_id)
      ) throw new ApiError(409, 'Undo-toewijzing is intussen gewijzigd');
      beforeState.assignment = assignment;
      await renewPlanningResourceLeases(base44, user, leases);
      updatedShift = await restoreShiftForUndo(
        base44,
        user,
        shift,
        recovering ? revisionOf(shift) : expectedShiftRevision,
        previousShift,
        { metadata: undoShiftMetadata },
      );
      await renewPlanningResourceLeases(base44, user, leases);
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
      const currentAssignments = await filterAllRecords(base44.asServiceRole.entities.PlanningAssignment, { shift_id: shift.id });
      const currentActiveAssignmentKeys = currentAssignments
        .filter((item: LooseRecord) => item.status !== 'removed')
        .map((item: LooseRecord) => `${item.id}:${item.personnel_id}`)
        .sort();
      const initialActiveAssignmentKeys = initialCurrentAssignments
        .map((item: LooseRecord) => `${item.id}:${item.personnel_id}`)
        .sort();
      if (stableStringify(currentActiveAssignmentKeys) !== stableStringify(initialActiveAssignmentKeys)) {
        throw new ApiError(409, 'Dienstbezetting is intussen gewijzigd; laad het rooster opnieuw');
      }
      beforeState.assignments = currentAssignments;
      await renewPlanningResourceLeases(base44, user, leases);
      updatedShift = await restoreShiftForUndo(
        base44,
        user,
        shift,
        recovering ? revisionOf(shift) : expectedShiftRevision,
        previousShift,
        { metadata: undoShiftMetadata },
      );
      const currentById = new Map<string, LooseRecord>(
        currentAssignments.map((item: LooseRecord) => [String(item.id), item]),
      );
      const restoredAssignments: LooseRecord[] = [];
      for (const previousAssignment of previousAssignments) {
        const current = currentById.get(String(previousAssignment.id));
        if (!current) throw new ApiError(409, `Toewijzing ${previousAssignment.id} ontbreekt voor move-undo`);
        await renewPlanningResourceLeases(base44, user, leases);
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

    const activeAssignmentsAfterUndo = (await filterAllRecords(
      base44.asServiceRole.entities.PlanningAssignment,
      { shift_id: updatedShift.id },
    )).filter((item: LooseRecord) => item.status !== 'removed');
    const revalidatedAssignments: LooseRecord[] = [];
    for (const assignment of activeAssignmentsAfterUndo) {
      await renewPlanningResourceLeases(base44, user, leases);
      const finalPersonnel = await requireRecord(base44, 'Personnel', assignment.personnel_id, 'Medewerker');
      const finalEligibility = await evaluateAssignmentWarnings(
        base44,
        updatedShift,
        finalPersonnel,
        assignment.id,
        normalizeArray(assignment.warning_snapshot).filter((item: LooseRecord) => item.source === 'planner'),
      );
      await renewPlanningResourceLeases(base44, user, leases);
      revalidatedAssignments.push(await casUpdate(
        base44,
        'PlanningAssignment',
        assignment,
        revisionOf(assignment),
        {
          warning_codes: finalEligibility.warning_codes,
          warning_snapshot: finalEligibility.warning_snapshot,
          has_critical_warnings: finalEligibility.has_critical_warnings,
          contract_routing_snapshot: finalEligibility.contract_routing_snapshot,
          personnel_contract_id: finalEligibility.personnel_contract_id,
          metadata: {
            ...(assignment.metadata || {}),
            final_assignment_validation_at: nowIso(),
            undo_revalidated_at: nowIso(),
          },
        },
      ));
    }
    const revalidatedById = new Map(
      revalidatedAssignments.map((assignment: LooseRecord) => [String(assignment.id), assignment]),
    );
    if (result.assignment && revalidatedById.has(String(result.assignment.id))) {
      result.assignment = revalidatedById.get(String(result.assignment.id));
    }
    if (undoAction === 'move') result.assignments = revalidatedAssignments;

    await renewPlanningResourceLeases(base44, user, leases);
    const audit = await appendAudit(base44, user, {
      action: 'undo',
      resource_type: sourceEvent.resource_type || 'PlanningShift',
      resource_id: sourceEvent.resource_id || shift.id,
      shift_id: shift.id,
      assignment_id: sourceEvent.assignment_id || null,
      before_state: recovering ? null : beforeState,
      after_state: result,
      correlation_id: context.correlationId,
      idempotency_key: context.idempotencyKey,
      undoable: false,
      undo_of_event_id: sourceEvent.id,
      metadata: {
        request_hash: requestHash,
        recovered_completed_state: recovering,
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
  });
}

async function copyShift(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  requireMutationIdempotency(context, 'copy');
  const requestHash = await mutationRequestHash('copy', body);
  let replay = await findReplay(base44, 'copy', context.idempotencyKey);
  if (replay) {
    assertReplayFingerprint(replay, user, requestHash, 'copy');
    const replayShiftId = compact(replay.after_state?.shift?.id || replay.shift_id);
    const replayShift = replayShiftId ? await getRecord(base44, 'PlanningShift', replayShiftId) : null;
    if (!replayShift) {
      throw new ApiError(409, 'De geaudite kopiedienst ontbreekt en kan niet automatisch worden hersteld', {
        shift_id: replayShiftId || null,
      });
    }
    if (replayShift.metadata?.copy_saga?.phase === 'completed') return replayResult(replay);
  }

  const sourceShiftId = requireId(body, 'shift_id');
  const expectedShiftRevision = positiveInteger(body.expected_shift_revision, 'expected_shift_revision');
  const sourceKey = `copy:${sourceShiftId}:${context.idempotencyKey}`;
  const preflightCopyTargets = await filterAllRecords(
    base44.asServiceRole.entities.PlanningShift,
    { source_key: sourceKey },
  );
  const descriptors = await Promise.all([
    resourceCoordinatorDescriptor('copy_source', sourceKey),
    resourceCoordinatorDescriptor('shift_composition', sourceShiftId),
    ...preflightCopyTargets.map(item => resourceCoordinatorDescriptor('shift_composition', item.id)),
  ]);
  return withPlanningResourceLeases(base44, user, context, requestHash, descriptors, async leases => {
    const source = await requireRecord(base44, 'PlanningShift', sourceShiftId, 'Brondienst');
    const existingMatches = await filterAllRecords(
      base44.asServiceRole.entities.PlanningShift,
      { source_key: sourceKey },
    );
    for (const existingMatch of existingMatches) {
      await assertNoForeignPendingMutation(
        base44,
        existingMatch,
        context,
        'copy',
        user,
        requestHash,
      );
    }
    let existing = existingMatches.length > 1
      ? await reconcilePlanningShiftSourceKey(
          base44,
          user,
          sourceKey,
          () => renewPlanningResourceLeases(base44, user, leases),
          candidate => assertNoForeignPendingMutation(
            base44,
            candidate,
            context,
            'copy',
            user,
            requestHash,
          ),
        )
      : existingMatches[0] || null;
    if (!existing) {
      if (revisionOf(source) !== expectedShiftRevision) {
        throw new ApiError(409, 'Planning is intussen gewijzigd', {
          entity: 'PlanningShift',
          id: source.id,
          expected_revision: expectedShiftRevision,
          current_revision: revisionOf(source),
        });
      }
      await assertNoForeignPendingMutation(base44, source, context, 'copy', user, requestHash);
      if (source.status === 'cancelled') throw new ApiError(409, 'Een geannuleerde dienst kan niet worden gekopieerd');
      const composedSegments = await filterAllRecords(
        base44.asServiceRole.entities.PlanningShiftTaskSegment,
        { shift_id: source.id },
      );
      if (composedSegments.some((item: LooseRecord) => item.status !== 'removed')) {
        throw new ApiError(409, 'Een samengestelde dienst kan niet los worden gekopieerd; maak een nieuwe dienst uit de taakwerkvoorraad');
      }

      const timing = resolveShiftTiming(source, body);
      const initializedAt = nowIso();
      const intendedShift = {
        ...pick(source, SHIFT_COPY_FIELDS),
        source_key: sourceKey,
        source_type: 'copy',
        source_id: source.id,
        source_shift_id: source.id,
        source_route_execution_id: null,
        ...timing,
        status: 'draft',
        published_revision: 0,
        last_published_correlation_id: null,
        last_modified_by_user_id: user.id || null,
        last_modified_at: initializedAt,
      };
      const intendedShiftHash = await sha256(stableStringify(intendedShift));
      await renewPlanningResourceLeases(base44, user, leases);
      existing = await base44.asServiceRole.entities.PlanningShift.create({
        ...intendedShift,
        // A new copy remains outside every visible/publication scope until its
        // immutable intended state has a durable audit record.
        status: 'cancelled',
        revision: 1,
        metadata: {
          copied_from_shift_id: source.id,
          copy_correlation_id: context.correlationId,
          copy_idempotency_key: context.idempotencyKey,
          copy_request_hash: requestHash,
          copy_actor_user_id: user.id || null,
          planning_mutation: {
            action: 'copy',
            idempotency_key: context.idempotencyKey,
            correlation_id: context.correlationId,
            actor_user_id: user.id || null,
            request_hash: requestHash,
            phase: 'state_written_audit_pending',
            started_at: initializedAt,
            updated_at: initializedAt,
          },
          copy_saga: {
            phase: 'audit_pending',
            source_shift_id: source.id,
            source_shift_revision: revisionOf(source),
            intended_shift: intendedShift,
            intended_shift_hash: intendedShiftHash,
            initialized_at: initializedAt,
          },
        },
      });
    }

    if (
      existing.metadata?.copy_request_hash !== requestHash
      || existing.metadata?.copy_actor_user_id !== (user.id || null)
      || existing.metadata?.copy_saga?.source_shift_id !== sourceShiftId
      || Number(existing.metadata?.copy_saga?.source_shift_revision) !== expectedShiftRevision
    ) {
      throw new ApiError(409, 'idempotency_key hoort bij een andere copy-opdracht');
    }
    matchingPlanningMutationMarker(existing, 'copy', context, user, requestHash);
    const saga = existing.metadata?.copy_saga;
    const intendedShift = saga?.intended_shift;
    if (!intendedShift || typeof intendedShift !== 'object') {
      throw new ApiError(409, 'De kopiedienst mist het onveranderlijke doelsnapshot');
    }
    const intendedShiftHash = await sha256(stableStringify(intendedShift));
    if (intendedShiftHash !== saga.intended_shift_hash) {
      throw new ApiError(409, 'Het doelsnapshot van de kopiedienst is gewijzigd en vereist handmatige controle');
    }
    if (saga.phase === 'completed') {
      if (!replay) replay = await findReplay(base44, 'copy', context.idempotencyKey);
      if (!replay) {
        throw new ApiError(409, 'De zichtbare kopiedienst mist zijn verplichte audit-event');
      }
      assertReplayFingerprint(replay, user, requestHash, 'copy');
      return replayResult(replay);
    }
    if (saga.phase !== 'audit_pending' || existing.status !== 'cancelled') {
      throw new ApiError(409, 'De kopiedienst heeft een ongeldige herstelstatus', {
        shift_id: existing.id,
        copy_phase: saga.phase || null,
        shift_status: existing.status,
      });
    }

    if (!replay) replay = await findReplay(base44, 'copy', context.idempotencyKey);
    if (replay) assertReplayFingerprint(replay, user, requestHash, 'copy');
    let audit = replay;
    let auditedShift = replay?.after_state?.shift || null;
    if (!audit) {
      const completedAt = nowIso();
      const completedMetadata = {
        ...(existing.metadata || {}),
        planning_mutation: {
          ...(existing.metadata?.planning_mutation || {}),
          phase: 'completed',
          updated_at: completedAt,
          completed_at: completedAt,
        },
        copy_saga: {
          ...saga,
          phase: 'completed',
          completed_at: completedAt,
        },
      };
      auditedShift = {
        ...existing,
        ...intendedShift,
        status: 'draft',
        metadata: completedMetadata,
        revision: revisionOf(existing) + 1,
      };
      await renewPlanningResourceLeases(base44, user, leases);
      audit = await appendAudit(base44, user, {
        action: 'copy',
        resource_type: 'PlanningShift',
        resource_id: existing.id,
        shift_id: existing.id,
        before_state: {
          source_shift_id: sourceShiftId,
          source_shift_revision: expectedShiftRevision,
        },
        after_state: { shift: auditedShift, assignments: [] },
        correlation_id: context.correlationId,
        idempotency_key: context.idempotencyKey,
        undoable: false,
        metadata: {
          request_hash: requestHash,
          intended_shift_hash: intendedShiftHash,
          recovered_pending_state: existingMatches.length > 0,
        },
      });
    }
    if (
      !auditedShift
      || String(auditedShift.id) !== String(existing.id)
      || audit.metadata?.intended_shift_hash !== intendedShiftHash
      || auditedShift.metadata?.copy_saga?.intended_shift_hash !== intendedShiftHash
      || auditedShift.metadata?.copy_saga?.phase !== 'completed'
      || auditedShift.status !== 'draft'
    ) {
      throw new ApiError(409, 'Het audit-event bevat niet het bedoelde kopiesnapshot');
    }

    const current = await requireRecord(base44, 'PlanningShift', existing.id, 'Kopiedienst');
    if (current.metadata?.copy_saga?.phase === 'completed') return replayResult(audit);
    if (
      current.status !== 'cancelled'
      || current.metadata?.copy_saga?.phase !== 'audit_pending'
      || current.metadata?.copy_saga?.intended_shift_hash !== intendedShiftHash
    ) {
      throw new ApiError(409, 'De kopiedienst is tijdens herstel gewijzigd');
    }
    await renewPlanningResourceLeases(base44, user, leases);
    const finalizedShift = await casUpdate(
      base44,
      'PlanningShift',
      current,
      revisionOf(current),
      {
        ...intendedShift,
        status: 'draft',
        metadata: auditedShift.metadata,
      },
    );
    return {
      ok: true,
      idempotent: existingMatches.length > 0,
      shift: finalizedShift,
      assignments: [],
      audit_event_id: audit.id,
      undoable: false,
      undo_token: null,
    };
  });
}

function shiftMatchesPublicationScope(shift: LooseRecord, body: LooseRecord, shiftIds: Set<string>) {
  if (!shiftAllowsActiveTaskSegments(shift)) return false;
  if (shiftIds.size && !shiftIds.has(String(shift.id))) return false;
  if (body.company_id && shift.company_id !== body.company_id) return false;
  if (body.customer_id && !uniqueStrings([shift.customer_id, ...(shift.customer_ids || [])]).includes(String(body.customer_id))) return false;
  if (body.object_id && !uniqueStrings([shift.object_id, ...(shift.object_ids || [])]).includes(String(body.object_id))) return false;
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
    task_occurrence_ids: shift.task_occurrence_ids || [],
    task_segment_count: Number(shift.task_segment_count || 0),
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

function publicationOccurrenceSnapshot(
  occurrence: LooseRecord,
  segments: LooseRecord[],
  shifts?: LooseRecord[],
  coverageSnapshot?: LooseRecord,
) {
  return {
    id: occurrence.id,
    source_key: occurrence.source_key,
    object_task_definition_id: occurrence.object_task_definition_id,
    definition_version: occurrence.definition_version,
    schedule_period_key: occurrence.schedule_period_key,
    company_id: occurrence.company_id || null,
    customer_id: occurrence.customer_id,
    object_id: occurrence.object_id,
    security_plan_id: occurrence.security_plan_id || null,
    security_plan_revision_id: occurrence.security_plan_revision_id || null,
    security_plan_snapshot: occurrence.security_plan_snapshot || null,
    security_plan_checksum: occurrence.security_plan_checksum || null,
    task_type: occurrence.task_type,
    task_name: occurrence.task_name_snapshot,
    execution_mode: occurrence.execution_mode,
    service_date: occurrence.service_date,
    end_date: occurrence.end_date,
    window_start_time: occurrence.window_start_time,
    window_end_time: occurrence.window_end_time,
    required_minutes: occurrence.required_minutes,
    lifecycle_status: occurrence.lifecycle_status,
    coverage: coverageSnapshot?.coverage || occurrenceCoverage(occurrence, segments, shifts),
    coverage_basis: coverageSnapshot?.coverage_basis || {
      calculation: 'snapshot_scope_only',
      scope_shift_ids: uniqueStrings(shifts?.map(item => item.id) || []),
      scope_segment_ids: uniqueStrings(segments.map(item => item.id)),
      external_published_shift_ids: [],
      external_published_segment_ids: [],
      external_publication_evidence: [],
    },
    revision: revisionOf(occurrence),
    published_revision: Number(occurrence.published_revision || 0),
  };
}

function publicationTaskSegmentSnapshot(segment: LooseRecord) {
  return {
    id: segment.id,
    shift_id: segment.shift_id,
    task_occurrence_id: segment.task_occurrence_id,
    object_task_definition_id: segment.object_task_definition_id,
    sequence_index: segment.sequence_index,
    start_date: segment.start_date,
    end_date: segment.end_date,
    start_time: segment.start_time,
    end_time: segment.end_time,
    timezone: segment.timezone || 'Europe/Amsterdam',
    duration_minutes: segment.duration_minutes,
    company_id: segment.company_id || null,
    customer_id: segment.customer_id,
    object_id: segment.object_id,
    task_type: segment.task_type,
    task_name: segment.task_name_snapshot,
    customer_name: segment.customer_name_snapshot || null,
    object_name: segment.object_name_snapshot || null,
    instructions: segment.instructions_snapshot || null,
    status: segment.status,
    revision: revisionOf(segment),
    published_revision: Number(segment.published_revision || 0),
  };
}

function publicationPlanEntry(
  record: LooseRecord,
  patch: LooseRecord,
  fenceResourceType: string,
  fenceResourceId: string,
) {
  return {
    id: record.id,
    base_revision: revisionOf(record),
    target_revision: revisionOf(record) + 1,
    fence_resource_type: fenceResourceType,
    fence_resource_id: fenceResourceId,
    patch,
  };
}

function publicationTargetRecord(record: LooseRecord, entry: LooseRecord) {
  return {
    ...record,
    ...(entry.patch || {}),
    revision: Number(entry.target_revision),
  };
}

function exactPublicationFinalizationMarker(
  marker: LooseRecord | null | undefined,
  publication: LooseRecord,
  entry: LooseRecord,
  intentId: string,
  requestHash: string,
  manifestHash: string,
) {
  return Boolean(
    marker
    && String(marker.publication_id) === String(publication.id)
    && Number(marker.publication_version) === Number(publication.version)
    && marker.intent_id === intentId
    && marker.idempotency_key === publication.idempotency_key
    && marker.actor_user_id === (publication.metadata?.actor_user_id || null)
    && marker.request_hash === requestHash
    && marker.finalization_manifest_hash === manifestHash
    && Number(marker.base_revision) === Number(entry.base_revision)
    && Number(marker.target_revision) === Number(entry.target_revision)
  );
}

function immutablePublicationTarget(
  publication: LooseRecord,
  groupKey: string,
  entry: LooseRecord,
) {
  const snapshotTarget = normalizeArray<LooseRecord>(publication.snapshot?.[groupKey])
    .find(item => String(item.id) === String(entry.id));
  if (!snapshotTarget) {
    throw new ApiError(409, 'Immutable publicatiesnapshot mist een target uit het finalisatiemanifest', {
      group: groupKey,
      id: entry.id,
    });
  }
  return {
    ...snapshotTarget,
    ...(entry.patch || {}),
    revision: Number(entry.target_revision),
  };
}

function assertFrozenPublicationTargets(
  targetType: string,
  preflightTargets: LooseRecord[],
  freshTargets: LooseRecord[],
) {
  const preflightById = new Map(preflightTargets.map(item => [String(item.id), item]));
  const freshById = new Map(freshTargets.map(item => [String(item.id), item]));
  const addedIds = [...freshById.keys()].filter(id => !preflightById.has(id)).sort();
  const removedIds = [...preflightById.keys()].filter(id => !freshById.has(id)).sort();
  const changedIds = [...preflightById.keys()].filter(id => (
    freshById.has(id)
    && revisionOf(preflightById.get(id) as LooseRecord) !== revisionOf(freshById.get(id) as LooseRecord)
  )).sort();
  if (addedIds.length || removedIds.length || changedIds.length) {
    throw new ApiError(409, 'De publicatiescope is tijdens het reserveren gewijzigd; laad de planning opnieuw', {
      code: 'planning_publication_scope_changed',
      target_type: targetType,
      added_ids: addedIds,
      removed_ids: removedIds,
      changed_ids: changedIds,
    });
  }
}

async function finalizePlanningPublication(
  base44: LooseRecord,
  user: LooseRecord,
  publication: LooseRecord,
  audit: LooseRecord,
  leases: LooseRecord[],
) {
  const plan = publication.metadata?.finalization_manifest;
  const manifestHash = publication.metadata?.finalization_manifest_hash;
  const intentId = publication.metadata?.publication_intent_id;
  const requestHash = publication.metadata?.request_hash;
  if (!plan || !manifestHash || !intentId || !requestHash) {
    throw new ApiError(409, 'Publicatie mist het verplichte finalisatiemanifest');
  }
  if (await sha256(stableStringify(plan)) !== manifestHash) {
    throw new ApiError(409, 'Het finalisatiemanifest van de publicatie is gewijzigd');
  }
  if (
    audit.action !== 'publish'
    || String(audit.publication_id || audit.resource_id) !== String(publication.id)
    || audit.actor_user_id !== publication.metadata?.actor_user_id
    || audit.metadata?.request_hash !== requestHash
    || audit.metadata?.publication_checksum !== publication.checksum
    || audit.metadata?.finalization_manifest_hash !== manifestHash
  ) {
    throw new ApiError(409, 'Audit-event hoort niet exact bij deze publicatie');
  }

  const finalized: Record<string, LooseRecord[]> = {
    assignments: [],
    task_segments: [],
    task_occurrences: [],
    shifts: [],
  };
  const groups = [
    { key: 'assignments', entity: 'PlanningAssignment', label: 'Toewijzing' },
    { key: 'task_segments', entity: 'PlanningShiftTaskSegment', label: 'Taaksegment' },
    { key: 'task_occurrences', entity: 'PlanningTaskOccurrence', label: 'Taakuitvoering' },
    // Parent shifts are made visible only after every child state is durable.
    { key: 'shifts', entity: 'PlanningShift', label: 'Dienst' },
  ];
  for (const group of groups) {
    for (const entry of normalizeArray<LooseRecord>(plan[group.key])) {
      const current = await requireRecord(base44, group.entity, entry.id, group.label);
      const finalization = current.metadata?.publication_finalization;
      const alreadyFinalized = exactPublicationFinalizationMarker(
        finalization,
        publication,
        entry,
        intentId,
        requestHash,
        manifestHash,
      );
      if (alreadyFinalized) {
        // This marker is durable historical proof that the manifest target was
        // committed. A later legitimate planning mutation may have advanced
        // the live record; a replay must never roll that mutation back.
        finalized[group.key].push(immutablePublicationTarget(publication, group.key, entry));
        continue;
      }
      if (revisionOf(current) !== Number(entry.base_revision)) {
        throw new ApiError(409, 'Publicatiefinalisatie botst met een nieuwere planningwijziging', {
          entity: group.entity,
          id: entry.id,
          base_revision: entry.base_revision,
          target_revision: entry.target_revision,
          current_revision: revisionOf(current),
        });
      }
      const fallbackFence = group.key === 'task_occurrences'
        ? { resourceType: 'task_occurrence', resourceId: current.id }
        : { resourceType: 'shift_composition', resourceId: group.key === 'shifts' ? current.id : current.shift_id };
      const fenceResourceType = entry.fence_resource_type || fallbackFence.resourceType;
      const fenceResourceId = entry.fence_resource_id || fallbackFence.resourceId;
      if (
        group.key !== 'task_occurrences'
        && group.key !== 'shifts'
        && String(fenceResourceId) !== String(current.shift_id)
      ) {
        throw new ApiError(409, 'Finalisatiemanifest verwijst naar een andere parentdienst', {
          entity: group.entity,
          id: entry.id,
          manifest_shift_id: fenceResourceId,
          current_shift_id: current.shift_id,
        });
      }
      await renewPlanningResourceLeases(
        base44,
        user,
        planningPublicationLeasePair(leases, fenceResourceType, fenceResourceId),
      );
      finalized[group.key].push(await casUpdate(
        base44,
        group.entity,
        current,
        Number(entry.base_revision),
        {
          ...(entry.patch || {}),
          metadata: {
            ...(current.metadata || {}),
            publication_finalization: {
              publication_id: publication.id,
              publication_version: publication.version,
              intent_id: intentId,
              idempotency_key: publication.idempotency_key,
              actor_user_id: publication.metadata?.actor_user_id || null,
              request_hash: requestHash,
              finalization_manifest_hash: manifestHash,
              base_revision: Number(entry.base_revision),
              target_revision: Number(entry.target_revision),
              finalized_at: nowIso(),
            },
          },
        },
      ));
    }
  }
  const publicationIntent = publication.metadata?.publication_intent || {
    intent_id: intentId,
    idempotency_key: publication.idempotency_key,
    actor_user_id: publication.metadata?.actor_user_id || null,
    request_hash: requestHash,
    scope_key: publication.scope_key,
    manifest_hash: manifestHash,
    correlation_id: publication.correlation_id,
    prepared_at: publication.published_at,
  };
  await clearPlanningPublicationIntent(base44, user, leases, publicationIntent);
  return finalized;
}

async function committedExternalPublicationCoverage(
  base44: LooseRecord,
  excludedShiftIds: Set<string>,
) {
  const [publications, audits] = await Promise.all([
    listAllRecords(base44.asServiceRole.entities.PlanningPublication, '-published_at'),
    listAllRecords(base44.asServiceRole.entities.PlanningAuditEvent, '-occurred_at'),
  ]);
  const auditByPublicationId = new Map<string, LooseRecord>();
  for (const audit of audits.filter((item: LooseRecord) => item.action === 'publish')) {
    const publicationId = compact(audit.publication_id || audit.resource_id);
    if (publicationId && !auditByPublicationId.has(publicationId)) {
      auditByPublicationId.set(publicationId, audit);
    }
  }
  const committed = publications.filter((publication: LooseRecord) => {
    const audit = auditByPublicationId.get(String(publication.id));
    return Boolean(
      audit
      && audit.metadata?.publication_checksum === publication.checksum
      && audit.metadata?.request_hash === publication.metadata?.request_hash
      && audit.actor_user_id === publication.metadata?.actor_user_id
    );
  });
  const latestByScope = new Map<string, LooseRecord>();
  for (const publication of committed) {
    const key = String(publication.scope_key);
    const current = latestByScope.get(key);
    if (
      !current
      || Number(publication.version || 0) > Number(current.version || 0)
      || (
        Number(publication.version || 0) === Number(current.version || 0)
        && String(publication.published_at || publication.id) > String(current.published_at || current.id)
      )
    ) latestByScope.set(key, publication);
  }

  const candidatesBySegmentId = new Map<string, LooseRecord>();
  for (const publication of latestByScope.values()) {
    const shifts = normalizeArray<LooseRecord>(publication.snapshot?.shifts);
    const shiftById = new Map(shifts.map(item => [String(item.id), item]));
    for (const segment of normalizeArray<LooseRecord>(publication.snapshot?.task_segments)) {
      const shift = shiftById.get(String(segment.shift_id));
      if (
        !shift
        || excludedShiftIds.has(String(shift.id))
        || shift.status !== 'published'
        || segment.status !== 'published'
        || Number(shift.revision) !== Number(shift.published_revision)
        || Number(segment.revision) !== Number(segment.published_revision)
      ) continue;
      const evidence = {
        publication_id: publication.id,
        publication_version: Number(publication.version || 0),
        publication_checksum: publication.checksum,
        shift_id: shift.id,
        shift_revision: Number(shift.revision),
        segment_id: segment.id,
        segment_revision: Number(segment.revision),
      };
      const current = candidatesBySegmentId.get(String(segment.id));
      const candidatePublishedAt = String(publication.published_at || publication.id);
      const currentPublishedAt = String(current?.published_at || current?.publication_id || '');
      if (!current || candidatePublishedAt > currentPublishedAt || (
        candidatePublishedAt === currentPublishedAt
        && evidence.publication_version > current.evidence.publication_version
      )) {
        candidatesBySegmentId.set(String(segment.id), {
          shift,
          segment,
          evidence,
          published_at: publication.published_at || null,
          publication_id: publication.id,
        });
      }
    }
  }
  const candidates = [...candidatesBySegmentId.values()];
  return {
    shifts: uniqueRecords(candidates.map(item => item.shift), item => String(item.id)),
    segments: candidates.map(item => item.segment),
    evidenceBySegmentId: new Map(candidates.map(item => [String(item.segment.id), item.evidence])),
  };
}

async function planningPublicationScope(
  body: LooseRecord,
  requestedShiftIds: Set<string>,
  periodStart: string,
  periodEnd: string,
) {
  const scopeType = ['day', 'week', 'selection', 'range'].includes(body.scope_type)
    ? body.scope_type
    : requestedShiftIds.size
    ? 'selection'
    : 'range';
  const selectionHash = requestedShiftIds.size
    ? await sha256([...requestedShiftIds].sort().join(','))
    : null;
  const routeScope = compact(body.route_id) || '*';
  const suppliedScopeKey = compact(body.scope_key);
  const scopeKey = suppliedScopeKey
    ? `${suppliedScopeKey}:route:${routeScope}`
    : scopeType === 'selection'
    ? `selection:${selectionHash}:route:${routeScope}`
    : [
        scopeType,
        body.company_id || '*',
        body.customer_id || '*',
        body.object_id || '*',
        routeScope,
        periodStart,
        periodEnd,
      ].join(':');
  return { scopeType, scopeKey };
}

async function planningPublicationRequestHash(
  body: LooseRecord,
  requestedShiftIds: Set<string>,
  reason: string,
  scopeType: string,
  scopeKey: string,
  periodStart: string,
  periodEnd: string,
) {
  return sha256(stableStringify({
    action: 'publish',
    scope_type: scopeType,
    scope_key: scopeKey,
    company_id: compact(body.company_id) || null,
    customer_id: compact(body.customer_id) || null,
    object_id: compact(body.object_id) || null,
    route_id: compact(body.route_id) || null,
    period_start: periodStart,
    period_end: periodEnd,
    shift_ids: [...requestedShiftIds].sort(),
    expected_shift_revision: body.expected_shift_revision || null,
    expected_shift_revisions: body.expected_shift_revisions || {},
    publication_reason: reason,
    acknowledge_critical_warnings: body.acknowledge_critical_warnings === true,
    critical_warning_acknowledgement_reason: compact(body.critical_warning_acknowledgement_reason) || null,
  }));
}

async function planningPublicationRecoveryDescriptors(publication: LooseRecord) {
  const plan = publication.metadata?.finalization_manifest;
  const manifestHash = publication.metadata?.finalization_manifest_hash;
  if (!plan || !manifestHash || await sha256(stableStringify(plan)) !== manifestHash) {
    throw new ApiError(409, 'Publicatie mist een geldig immutable finalisatiemanifest');
  }
  const descriptors: LooseRecord[] = [
    await resourceCoordinatorDescriptor('publication_scope', publication.scope_key),
  ];
  const groupSpecs = [
    { key: 'shifts', fallbackType: 'shift_composition', fallbackParent: 'id' },
    { key: 'assignments', fallbackType: 'shift_composition', fallbackParent: 'shift_id' },
    { key: 'task_segments', fallbackType: 'shift_composition', fallbackParent: 'shift_id' },
    { key: 'task_occurrences', fallbackType: 'task_occurrence', fallbackParent: 'id' },
  ];
  for (const spec of groupSpecs) {
    const snapshotById = new Map(
      normalizeArray<LooseRecord>(publication.snapshot?.[spec.key])
        .map(item => [String(item.id), item]),
    );
    for (const entry of normalizeArray<LooseRecord>(plan[spec.key])) {
      const snapshotTarget = snapshotById.get(String(entry.id));
      const resourceType = entry.fence_resource_type || spec.fallbackType;
      const resourceId = compact(
        entry.fence_resource_id
        || (spec.fallbackParent === 'id' ? entry.id : snapshotTarget?.[spec.fallbackParent]),
      );
      if (!resourceId) {
        throw new ApiError(409, 'Publicatiemanifest mist de parentfence van een target', {
          group: spec.key,
          id: entry.id,
        });
      }
      descriptors.push(await resourceCoordinatorDescriptor(resourceType, resourceId));
    }
  }
  return uniqueRecords(descriptors, item => item.coordinatorKey);
}

async function completeExistingPlanningPublication(
  base44: LooseRecord,
  user: LooseRecord,
  context: ReturnType<typeof mutationContext>,
  requestHash: string,
  existingPublication: LooseRecord,
  leases: LooseRecord[],
) {
  if (
    existingPublication.metadata?.actor_user_id !== (user.id || null)
    || existingPublication.metadata?.request_hash !== requestHash
  ) {
    throw new ApiError(409, 'idempotency_key hoort bij een andere publicatieopdracht');
  }
  const recoveryShiftIds = uniqueStrings(
    existingPublication.metadata?.finalization_manifest?.shifts?.map((item: LooseRecord) => item.id)
    || existingPublication.shift_ids,
  );
  const recoveryShifts = await Promise.all(
    recoveryShiftIds.map(id => requireRecord(base44, 'PlanningShift', id, 'Dienst')),
  );
  for (const shift of recoveryShifts) {
    await assertNoForeignPendingMutation(base44, shift, context, 'publish', user, requestHash);
  }
  let replayAudit = await findReplay(base44, 'publish', context.idempotencyKey);
  if (!replayAudit) {
    await renewPlanningResourceLeases(base44, user, leases);
    replayAudit = await appendAudit(base44, user, {
      action: 'publish',
      resource_type: 'PlanningPublication',
      resource_id: existingPublication.id,
      publication_id: existingPublication.id,
      before_state: null,
      after_state: {
        publication: existingPublication,
        shifts: existingPublication.snapshot?.shifts || [],
        assignments: existingPublication.snapshot?.assignments || [],
        task_occurrences: existingPublication.snapshot?.task_occurrences || [],
        task_segments: existingPublication.snapshot?.task_segments || [],
      },
      correlation_id: existingPublication.correlation_id,
      idempotency_key: context.idempotencyKey,
      undoable: false,
      metadata: {
        request_hash: requestHash,
        publication_id: existingPublication.id,
        publication_checksum: existingPublication.checksum,
        finalization_manifest_hash: existingPublication.metadata?.finalization_manifest_hash,
        recovered_durable_publication: true,
      },
    });
  } else if (
    replayAudit.actor_user_id !== (user.id || null)
    || replayAudit.metadata?.request_hash !== requestHash
    || String(replayAudit.publication_id || replayAudit.resource_id) !== String(existingPublication.id)
    || replayAudit.metadata?.publication_checksum !== existingPublication.checksum
  ) {
    throw new ApiError(409, 'idempotency_key hoort bij een andere publicatieopdracht');
  }
  const finalized = await finalizePlanningPublication(
    base44,
    user,
    existingPublication,
    replayAudit,
    leases,
  );
  return {
    ok: true,
    idempotent: true,
    publication: existingPublication,
    shifts: finalized.shifts,
    assignments: finalized.assignments,
    task_occurrences: finalized.task_occurrences,
    task_segments: finalized.task_segments,
    audit_event_id: replayAudit.id,
    undoable: false,
    undo_token: null,
  };
}

async function publishPlanning(
  base44: LooseRecord,
  user: LooseRecord,
  body: LooseRecord,
  context: ReturnType<typeof mutationContext>,
) {
  if (!context.idempotencyKey) throw new ApiError(400, 'idempotency_key is verplicht om te publiceren');
  const reason = compact(body.publication_reason || body.reason);
  if (!reason) throw new ApiError(400, 'publication_reason is verplicht');
  const requestedShiftIds = new Set(uniqueStrings(body.shift_ids));
  if (!requestedShiftIds.size) {
    asDate(body.period_start, 'period_start');
    asDate(body.period_end, 'period_end');
  }
  const existingPublicationsBeforePreflight = await filterAllRecords(
    base44.asServiceRole.entities.PlanningPublication,
    { idempotency_key: context.idempotencyKey },
    '-published_at',
  );
  const existingPublicationBeforePreflight = existingPublicationsBeforePreflight
    .sort(coordinatorOrder)[0] || null;
  if (existingPublicationBeforePreflight) {
    const recoveryPeriodStart = body.period_start
      ? asDate(body.period_start, 'period_start')
      : asDate(existingPublicationBeforePreflight.period_start, 'period_start');
    const recoveryPeriodEnd = body.period_end
      ? asDate(body.period_end, 'period_end')
      : asDate(existingPublicationBeforePreflight.period_end, 'period_end');
    const recoveryScope = await planningPublicationScope(
      body,
      requestedShiftIds,
      recoveryPeriodStart,
      recoveryPeriodEnd,
    );
    const recoveryRequestHash = await planningPublicationRequestHash(
      body,
      requestedShiftIds,
      reason,
      recoveryScope.scopeType,
      recoveryScope.scopeKey,
      recoveryPeriodStart,
      recoveryPeriodEnd,
    );
    const recoveryDescriptors = await planningPublicationRecoveryDescriptors(
      existingPublicationBeforePreflight,
    );
    return withPlanningResourceLeases(
      base44,
      user,
      context,
      recoveryRequestHash,
      recoveryDescriptors,
      leases => completeExistingPlanningPublication(
        base44,
        user,
        context,
        recoveryRequestHash,
        existingPublicationBeforePreflight,
        leases,
      ),
    );
  }
  const preflightAllShifts = await listAllRecords(base44.asServiceRole.entities.PlanningShift);
  const preflightShifts = preflightAllShifts.filter((shift: LooseRecord) =>
    shiftMatchesPublicationScope(shift, body, requestedShiftIds)
  );
  if (!preflightShifts.length) throw new ApiError(404, 'Geen publiceerbare diensten in deze scope');
  if (requestedShiftIds.size) {
    const found = new Set(preflightShifts.map((item: LooseRecord) => String(item.id)));
    const missing = [...requestedShiftIds].filter(id => !found.has(id));
    if (missing.length) {
      throw new ApiError(409, 'Een of meer geselecteerde diensten bestaan niet of zijn geannuleerd', {
        missing_shift_ids: missing,
      });
    }
  }
  const periodStart = body.period_start
    ? asDate(body.period_start, 'period_start')
    : preflightShifts.map(item => item.service_date).sort()[0];
  const periodEnd = body.period_end
    ? asDate(body.period_end, 'period_end')
    : preflightShifts.map(item => item.service_date).sort().at(-1);
  const { scopeType, scopeKey } = await planningPublicationScope(
    body,
    requestedShiftIds,
    periodStart,
    periodEnd,
  );
  const requestHash = await planningPublicationRequestHash(
    body,
    requestedShiftIds,
    reason,
    scopeType,
    scopeKey,
    periodStart,
    periodEnd,
  );
  const publicationDescriptor = await resourceCoordinatorDescriptor('publication_scope', scopeKey);
  const preflightShiftIds = new Set(preflightShifts.map(item => String(item.id)));
  const preflightTaskSegments = (await listAllRecords(
    base44.asServiceRole.entities.PlanningShiftTaskSegment,
  )).filter((segment: LooseRecord) => (
    preflightShiftIds.has(String(segment.shift_id)) && segment.status !== 'removed'
  ));
  const preflightReferencedOccurrenceIds = new Set(
    uniqueStrings(preflightTaskSegments.map(item => item.task_occurrence_id)),
  );
  const preflightOccurrences = await listAllRecords(
    base44.asServiceRole.entities.PlanningTaskOccurrence,
    '-service_date',
  );
  const preflightOccurrenceIds = uniqueStrings(preflightOccurrences
    .filter((occurrence: LooseRecord) => (
      occurrence.lifecycle_status === 'active'
      && (
        preflightReferencedOccurrenceIds.has(String(occurrence.id))
        || (
          !body.route_id
          && occurrence.service_date >= periodStart
          && occurrence.service_date <= periodEnd
          && (!body.company_id || occurrence.company_id === body.company_id)
          && (!body.customer_id || occurrence.customer_id === body.customer_id)
          && (!body.object_id || occurrence.object_id === body.object_id)
        )
      )
    ))
    .map(item => item.id));
  const preflightOccurrenceIdSet = new Set(preflightOccurrenceIds);
  const publicationDescriptors = [
    publicationDescriptor,
    ...await Promise.all(preflightShifts.map((shift: LooseRecord) => (
      resourceCoordinatorDescriptor('shift_composition', shift.id)
    ))),
    ...await Promise.all(preflightOccurrenceIds.map(id => (
      resourceCoordinatorDescriptor('task_occurrence', id)
    ))),
  ];

  return withPlanningResourceLeases(
    base44,
    user,
    context,
    requestHash,
    publicationDescriptors,
    async leases => {
      const existingPublications = await filterAllRecords(
        base44.asServiceRole.entities.PlanningPublication,
        { idempotency_key: context.idempotencyKey },
        '-published_at',
      );
      const existingPublication = existingPublications.sort(coordinatorOrder)[0] || null;
      if (existingPublication) {
        return completeExistingPlanningPublication(
          base44,
          user,
          context,
          requestHash,
          existingPublication,
          leases,
        );
      }
      const replayAudit = await findReplay(base44, 'publish', context.idempotencyKey);
      if (replayAudit) {
        assertReplayFingerprint(replayAudit, user, requestHash, 'publish');
        throw new ApiError(409, 'Publicatie-audit bestaat zonder bijbehorend immutable publicatierecord');
      }

      const allShifts = await listAllRecords(base44.asServiceRole.entities.PlanningShift);
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
      assertFrozenPublicationTargets('shift', preflightShifts, shifts);

      for (const shift of shifts) {
        await assertNoForeignPendingMutation(base44, shift, context, 'publish', user, requestHash);
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
    const recoveringPublication = shift.status === 'published'
      && shift.last_published_correlation_id === context.correlationId;
    if (revisionOf(shift) !== expected && !recoveringPublication) {
      throw new ApiError(409, 'Planning is intussen gewijzigd', {
        entity: 'PlanningShift',
        id: shift.id,
        expected_revision: expected,
        current_revision: revisionOf(shift),
      });
    }
  }

  const shiftIdSet = new Set(shifts.map((item: LooseRecord) => String(item.id)));
  const [allAssignments, allTaskSegments, allOccurrences] = await Promise.all([
    listAllRecords(base44.asServiceRole.entities.PlanningAssignment),
    listAllRecords(base44.asServiceRole.entities.PlanningShiftTaskSegment, '-start_date'),
    listAllRecords(base44.asServiceRole.entities.PlanningTaskOccurrence, '-service_date'),
  ]);
  const assignments = allAssignments.filter((assignment: LooseRecord) =>
    shiftIdSet.has(String(assignment.shift_id)) && assignment.status !== 'removed'
  );
  const taskSegments = allTaskSegments.filter((segment: LooseRecord) =>
    shiftIdSet.has(String(segment.shift_id)) && segment.status !== 'removed'
  );
  assertFrozenPublicationTargets('task_segment', preflightTaskSegments, taskSegments);
  const referencedOccurrenceIds = new Set(
    taskSegments.map((segment: LooseRecord) => String(segment.task_occurrence_id)),
  );
  const occurrenceById = new Map<string, LooseRecord>(
    allOccurrences.map((occurrence: LooseRecord) => [String(occurrence.id), occurrence]),
  );
  // A source change is the actionable cause of a superseded referenced
  // occurrence. Report it before the generic lifecycle guard so callers can
  // route the planner to the exact shift and replacement occurrence.
  const openTaskSourceChanges = (await listAllRecords(
    base44.asServiceRole.entities.PlanningTaskSourceChange,
    '-detected_at',
  )).filter((change: LooseRecord) => (
    change.status === 'open'
    && (
      referencedOccurrenceIds.has(String(
        change.source_task_occurrence_id || change.task_occurrence_id || change.occurrence_id,
      ))
      || referencedOccurrenceIds.has(String(change.replacement_task_occurrence_id || ''))
      || normalizeArray(change.shift_ids || change.shift_id).some(id => shiftIdSet.has(String(id)))
    )
  ));
  if (openTaskSourceChanges.length) {
    throw new ApiError(409, 'Werk eerst alle wijzigingen uit het objectrooster in de planning bij', {
      code: 'TASK_SOURCE_CHANGE_REQUIRES_REPLAN',
      source_change_ids: uniqueStrings(openTaskSourceChanges.map(item => item.id)),
      shift_ids: uniqueStrings(openTaskSourceChanges.flatMap(item => item.shift_ids || item.shift_id)),
      task_occurrence_ids: uniqueStrings(openTaskSourceChanges.flatMap(item => [
        item.source_task_occurrence_id || item.task_occurrence_id || item.occurrence_id,
        item.replacement_task_occurrence_id,
      ])),
    });
  }
  const invalidReferencedOccurrences = [...referencedOccurrenceIds]
    .filter(id => occurrenceById.get(id)?.lifecycle_status !== 'active');
  if (invalidReferencedOccurrences.length) {
    throw new ApiError(409, 'Een of meer taaksegmenten verwijzen niet naar een actieve taakuitvoering', {
      task_occurrence_ids: invalidReferencedOccurrences,
    });
  }
  const occurrences = allOccurrences.filter((occurrence: LooseRecord) =>
    occurrence.lifecycle_status === 'active'
    && (
      referencedOccurrenceIds.has(String(occurrence.id))
      || (
        !body.route_id
        &&
        occurrence.service_date >= periodStart
        && occurrence.service_date <= periodEnd
        && (!body.company_id || occurrence.company_id === body.company_id)
        && (!body.customer_id || occurrence.customer_id === body.customer_id)
        && (!body.object_id || occurrence.object_id === body.object_id)
      )
    )
  );
  const unresolvedBoundaryOccurrence = occurrences.find((occurrence: LooseRecord) => (
    unresolvedSharedBoundaryMutation(occurrence)
  ));
  if (unresolvedBoundaryOccurrence) {
    const boundaryState = unresolvedSharedBoundaryMutation(unresolvedBoundaryOccurrence);
    throw new ApiError(409, 'Planning kan niet worden gepubliceerd zolang een gedeelde grens wordt hersteld', {
      code: 'BOUNDARY_RECOVERY_REQUIRED',
      task_occurrence_id: unresolvedBoundaryOccurrence.id,
      operation_id: boundaryState?.operation_id || null,
    });
  }
  const preflightRelevantOccurrences = preflightOccurrences.filter((occurrence: LooseRecord) => (
    preflightOccurrenceIdSet.has(String(occurrence.id))
  ));
  assertFrozenPublicationTargets('task_occurrence', preflightRelevantOccurrences, occurrences);
  const occurrenceIdsBySourceKey = occurrences.reduce((groups: Map<string, string[]>, occurrence: LooseRecord) => {
    const key = String(occurrence.source_key);
    groups.set(key, [...(groups.get(key) || []), String(occurrence.id)]);
    return groups;
  }, new Map<string, string[]>());
  const duplicateOccurrenceGroups = [...occurrenceIdsBySourceKey.entries()]
    .filter(([, ids]) => ids.length > 1);
  if (duplicateOccurrenceGroups.length) {
    throw new ApiError(409, 'Dubbele taakuitvoeringen moeten vóór publicatie worden hersteld', {
      duplicate_source_keys: duplicateOccurrenceGroups.map(([sourceKey, ids]) => ({ source_key: sourceKey, task_occurrence_ids: ids })),
    });
  }
  const reservedOccurrences = occurrences.filter(hasActivePlanningCompositionReservation);
  if (reservedOccurrences.length) {
    throw new ApiError(409, 'Wacht tot alle openstaande dienstbewerkingen zijn opgeslagen', {
      task_occurrence_ids: reservedOccurrences.map(item => item.id),
    });
  }
  const externalCommittedCoverage = await committedExternalPublicationCoverage(base44, shiftIdSet);
  const externalPublishedShifts = externalCommittedCoverage.shifts;
  const externalPublishedSegments = externalCommittedCoverage.segments;
  const coverageParentShifts = [...shifts, ...externalPublishedShifts];
  const coverageSegments = [...taskSegments, ...externalPublishedSegments];
  const coverageSnapshotByOccurrenceId = new Map<string, LooseRecord>();
  for (const occurrence of occurrences) {
    const occurrenceId = String(occurrence.id);
    const scopedEvidence = taskSegments.filter((segment: LooseRecord) => (
      String(segment.task_occurrence_id) === occurrenceId
    ));
    const externalEvidence = externalPublishedSegments.filter((segment: LooseRecord) => (
      String(segment.task_occurrence_id) === occurrenceId
    ));
    const externalPublicationEvidence = externalEvidence
      .map((segment: LooseRecord) => externalCommittedCoverage.evidenceBySegmentId.get(String(segment.id)))
      .filter(Boolean);
    coverageSnapshotByOccurrenceId.set(occurrenceId, {
      coverage: occurrenceCoverage(occurrence, coverageSegments, coverageParentShifts),
      coverage_basis: {
        calculation: 'scope_plus_external_published_parents',
        scope_shift_ids: uniqueStrings(scopedEvidence.map(item => item.shift_id)),
        scope_segment_ids: uniqueStrings(scopedEvidence.map(item => item.id)),
        external_published_shift_ids: uniqueStrings(externalEvidence.map(item => item.shift_id)),
        external_published_segment_ids: uniqueStrings(externalEvidence.map(item => item.id)),
        external_publication_evidence: externalPublicationEvidence,
      },
    });
  }
  const taskCoverageWarnings = occurrences.flatMap((occurrence: LooseRecord) => {
    const coverage = coverageSnapshotByOccurrenceId.get(String(occurrence.id))?.coverage
      || occurrenceCoverage(occurrence, taskSegments, shifts);
    if (coverage.allocated_minutes > coverage.required_minutes) {
      throw new ApiError(409, 'Taakdekking bevat een overallocatie en kan niet worden gepubliceerd', {
        task_occurrence_id: occurrence.id,
        ...coverage,
      });
    }
    const warnings: LooseRecord[] = [];
    if (coverage.coverage_status !== 'full') warnings.push({
      task_occurrence_id: occurrence.id,
      code: coverage.coverage_status === 'open' ? 'task_occurrence_unplanned' : 'task_occurrence_partially_planned',
      severity: 'critical',
      message: coverage.coverage_status === 'open'
        ? `${occurrence.task_name_snapshot} bij ${occurrence.object_name_snapshot || 'object'} is nog niet ingepland.`
        : `${occurrence.task_name_snapshot} bij ${occurrence.object_name_snapshot || 'object'} mist nog ${coverage.remaining_minutes} minuten.`,
      source: 'PlanningTaskOccurrence',
      details: coverage,
    });
    if (!occurrence.security_plan_revision_id || !occurrence.security_plan_snapshot?.published_revision) {
      warnings.push({
        task_occurrence_id: occurrence.id,
        code: 'task_security_plan_revision_missing',
        severity: 'critical',
        message: `${occurrence.task_name_snapshot} bij ${occurrence.object_name_snapshot || 'object'} heeft geen gepubliceerde beveiligingsplanrevisie.`,
        source: 'PlanningTaskOccurrence',
      });
    }
    return warnings;
  });
  const assignmentCriticalWarnings: LooseRecord[] = assignments.flatMap((assignment: LooseRecord) => {
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
  const compositionWarnings: LooseRecord[] = shifts.flatMap((shift: LooseRecord) => (
    normalizeArray<LooseRecord>(shift.service_context_snapshot?.composition_warnings)
      .map(item => ({ shift_id: shift.id, source: 'PlanningShiftTaskSegment', ...item }))
  ));
  const criticalWarnings: LooseRecord[] = [
    ...assignmentCriticalWarnings,
    ...taskCoverageWarnings,
    ...compositionWarnings.filter(item => item.severity === 'critical'),
  ];
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

  const scopeLease = leases.find(item => item.resourceType === 'publication_scope');
  const scopeCoordinator = scopeLease
    ? await requireRecord(base44, 'PlanningMutationCoordinator', scopeLease.coordinatorId, 'Planningcoordinator')
    : null;
  const existingIntent = scopeCoordinator?.metadata?.pending_publication_intent || null;
  const preparedAt = existingIntent?.prepared_at || nowIso();
  const publicationCorrelationId = existingIntent?.correlation_id || context.correlationId;
  const shiftPlan = shifts.map((shift: LooseRecord) => publicationPlanEntry(shift, {
    status: 'published',
    published_revision: revisionOf(shift) + 1,
    last_published_correlation_id: publicationCorrelationId,
    last_modified_by_user_id: user.id || null,
    last_modified_at: preparedAt,
  }, 'shift_composition', shift.id));
  const assignmentPlan = assignments.map((assignment: LooseRecord) => publicationPlanEntry(assignment, {
    status: 'published',
    published_revision: revisionOf(assignment) + 1,
    last_published_correlation_id: publicationCorrelationId,
  }, 'shift_composition', assignment.shift_id));
  const taskSegmentPlan = taskSegments.map((segment: LooseRecord) => publicationPlanEntry(segment, {
    status: 'published',
    published_revision: revisionOf(segment) + 1,
    last_published_correlation_id: publicationCorrelationId,
    last_modified_by_user_id: user.id || null,
    last_modified_at: preparedAt,
  }, 'shift_composition', segment.shift_id));
  const occurrencePlan = occurrences.map((occurrence: LooseRecord) => publicationPlanEntry(occurrence, {
    published_revision: revisionOf(occurrence) + 1,
    last_published_correlation_id: publicationCorrelationId,
    last_modified_by_user_id: user.id || null,
    last_modified_at: preparedAt,
  }, 'task_occurrence', occurrence.id));
  const finalizationManifest = {
    schema_version: 1,
    shifts: shiftPlan,
    assignments: assignmentPlan,
    task_segments: taskSegmentPlan,
    task_occurrences: occurrencePlan,
  };
  const finalizationManifestHash = await sha256(stableStringify(finalizationManifest));
  const publicationIntentId = await sha256(
    `${user.id || 'anonymous'}:${context.idempotencyKey}:${requestHash}`,
  );
  const publicationIntent = {
    intent_id: publicationIntentId,
    idempotency_key: context.idempotencyKey,
    actor_user_id: user.id || null,
    request_hash: requestHash,
    scope_key: scopeKey,
    manifest_hash: finalizationManifestHash,
    correlation_id: publicationCorrelationId,
    prepared_at: preparedAt,
  };
  await setPlanningPublicationIntent(base44, user, leases, publicationIntent);

  const publishedShifts = shifts.map((item, index) => publicationTargetRecord(item, shiftPlan[index]));
  const publishedAssignments = assignments.map((item, index) => publicationTargetRecord(item, assignmentPlan[index]));
  const publishedTaskSegments = taskSegments.map((item, index) => publicationTargetRecord(item, taskSegmentPlan[index]));
  const publishedOccurrences = occurrences.map((item, index) => publicationTargetRecord(item, occurrencePlan[index]));
  const previous = await filterAllRecords(
    base44.asServiceRole.entities.PlanningPublication,
    { scope_key: scopeKey },
    '-version',
  );
  const previousPublication = previous
    .sort((a: LooseRecord, b: LooseRecord) => Number(b.version || 0) - Number(a.version || 0))[0]
    || null;
  const warningCount = publishedAssignments.reduce(
    (sum, assignment) => sum + normalizeArray(assignment.warning_snapshot).length,
    0,
  ) + taskCoverageWarnings.length + compositionWarnings.length;
  const snapshot = {
    schema_version: 3,
    scope: {
      scope_type: scopeType,
      scope_key: scopeKey,
      company_id: body.company_id || null,
      customer_id: body.customer_id || null,
      object_id: body.object_id || null,
      route_id: body.route_id || null,
      period_start: periodStart,
      period_end: periodEnd,
    },
    shifts: publishedShifts.map(publicationShiftSnapshot),
    assignments: publishedAssignments.map(publicationAssignmentSnapshot),
    task_occurrences: publishedOccurrences.map(item => (
      publicationOccurrenceSnapshot(
        item,
        publishedTaskSegments,
        publishedShifts,
        coverageSnapshotByOccurrenceId.get(String(item.id)),
      )
    )),
    task_segments: publishedTaskSegments.map(publicationTaskSegmentSnapshot),
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
    correlation_id: publicationCorrelationId,
  }));
  await renewPlanningResourceLeases(base44, user, leases);
  const publication = await base44.asServiceRole.entities.PlanningPublication.create({
    scope_type: scopeType,
    scope_key: scopeKey,
    company_id: body.company_id || null,
    customer_id: body.customer_id || null,
    object_id: body.object_id || null,
    route_id: body.route_id || null,
    period_start: periodStart,
    period_end: periodEnd,
    version: Number(previousPublication?.version || 0) + 1,
    supersedes_publication_id: previousPublication?.id || null,
    reason,
    critical_warning_acknowledgement_reason: acknowledgementReason || null,
    acknowledged_critical_warning_codes: [...new Set(criticalWarnings.map((item: LooseRecord) => item.code))],
    shift_count: publishedShifts.length,
    assignment_count: publishedAssignments.length,
    task_occurrence_count: publishedOccurrences.length,
    task_segment_count: publishedTaskSegments.length,
    warning_count: warningCount,
    critical_warning_count: criticalWarnings.length,
    shift_ids: publishedShifts.map(item => item.id),
    assignment_ids: publishedAssignments.map(item => item.id),
    task_occurrence_ids: publishedOccurrences.map(item => item.id),
    task_segment_ids: publishedTaskSegments.map(item => item.id),
    snapshot,
    checksum,
    published_by_user_id: user.id || null,
    published_by_name: actorName(user),
    published_by_email: compact(user.email) || null,
    published_at: preparedAt,
    correlation_id: publicationCorrelationId,
    idempotency_key: context.idempotencyKey,
    metadata: {
      publication_source: body.publication_source || 'planning_ui',
      actor_user_id: user.id || null,
      request_hash: requestHash,
      publication_intent_id: publicationIntentId,
      publication_intent: publicationIntent,
      finalization_manifest: finalizationManifest,
      finalization_manifest_hash: finalizationManifestHash,
    },
  });
  const anticipatedResult = {
    publication,
    shifts: publishedShifts,
    assignments: publishedAssignments,
    task_occurrences: publishedOccurrences,
    task_segments: publishedTaskSegments,
  };
  await renewPlanningResourceLeases(base44, user, leases);
  const audit = await appendAudit(base44, user, {
    action: 'publish',
    resource_type: 'PlanningPublication',
    resource_id: publication.id,
    publication_id: publication.id,
    before_state: {
      shift_revisions: shifts.map((item: LooseRecord) => ({ id: item.id, revision: revisionOf(item), status: item.status })),
      assignment_revisions: assignments.map((item: LooseRecord) => ({ id: item.id, revision: revisionOf(item), status: item.status })),
      task_occurrence_revisions: occurrences.map((item: LooseRecord) => ({ id: item.id, revision: revisionOf(item), lifecycle_status: item.lifecycle_status })),
      task_segment_revisions: taskSegments.map((item: LooseRecord) => ({ id: item.id, revision: revisionOf(item), status: item.status })),
    },
    after_state: anticipatedResult,
    correlation_id: publicationCorrelationId,
    idempotency_key: context.idempotencyKey,
    undoable: false,
    metadata: {
      request_hash: requestHash,
      publication_id: publication.id,
      publication_checksum: checksum,
      finalization_manifest_hash: finalizationManifestHash,
    },
  });
  const finalized = await finalizePlanningPublication(base44, user, publication, audit, leases);
  return {
    ok: true,
    publication,
    shifts: finalized.shifts,
    assignments: finalized.assignments,
    task_occurrences: finalized.task_occurrences,
    task_segments: finalized.task_segments,
    audit_event_id: audit.id,
    undoable: false,
    undo_token: null,
  };
    },
  );
}

export {
  activeTaskSegments,
  addObjectTaskSeries,
  amsterdamServerClock,
  asDate,
  asTime,
  assertFutureSchedule,
  assignPersonnel,
  bootstrapRange,
  cancelTaskShift,
  changeSingleTaskOccurrence,
  composeAndAssign,
  composeShift,
  createObjectTask,
  coordinatorOrder,
  copyShift,
  dedupeWarnings,
  detectLegacySingleTaskMigrations,
  intervalsOverlap,
  mergeMinuteIntervals,
  migrateLegacySinglePlanningTasks,
  moveShift,
  normalizedPeriodInterval,
  occurrenceBlueprints,
  occurrenceCoverage,
  listObjectTasks,
  planningIntervalDates,
  publishPlanning,
  publicationAssignmentSnapshot,
  publicationOccurrenceSnapshot,
  publicationShiftSnapshot,
  publicationTaskSegmentSnapshot,
  recoverPendingObjectTaskSeriesImpactMutations,
  releasePlanningResourceLeases,
  repairSharedTaskBoundary,
  mutateObjectTaskSeries,
  resizeSharedTaskBoundary,
  renewPlanningResourceLeases,
  restoreAssignment,
  revisionOf,
  serviceContextFromShift,
  shiftAllowsActiveTaskSegments,
  stableStringify,
  unassignPersonnel,
  undoPlanning,
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

    if (action === 'list_object_tasks') return json(await listObjectTasks(base44, body, user));
    if (action === 'repair_object_task_series_impact') {
      const seriesId = requireId(body, 'series_id');
      const reports = await recoverPendingObjectTaskSeriesImpactMutations(base44, user, {
        seriesIds: [seriesId],
      });
      return json({ ok: true, series_id: seriesId, recovery: reports[0] || null });
    }
    if (action === 'create_object_task') {
      return json(await createObjectTask(base44, user, body, context), 201);
    }
    if (action === 'add_object_task_series') {
      return json(await addObjectTaskSeries(base44, user, body, context), 201);
    }
    if (action === 'change_object_task_series') {
      return json(await mutateObjectTaskSeries(base44, user, body, context, 'schedule'));
    }
    if (action === 'stop_object_task_series') {
      return json(await mutateObjectTaskSeries(base44, user, body, context, 'stop'));
    }
    if (action === 'change_single_task_occurrence') {
      return json(await changeSingleTaskOccurrence(base44, user, body, context));
    }
    if (action === 'bootstrap_range') return json(await bootstrapRange(base44, user, body, context));
    if (action === 'compose_and_assign') {
      return json(await composeAndAssign(base44, user, body, context), 201);
    }
    if (action === 'compose_shift' || action === 'update_shift_composition') {
      return json(await composeShift(base44, user, body, context), action === 'compose_shift' ? 201 : 200);
    }
    if (action === SHARED_TASK_BOUNDARY_ACTION) {
      return json(await resizeSharedTaskBoundary(base44, user, body, context));
    }
    if (action === REPAIR_SHARED_TASK_BOUNDARY_ACTION) {
      return json(await repairSharedTaskBoundary(base44, user, body, context));
    }
    if (action === 'cancel_task_shift') return json(await cancelTaskShift(base44, user, body, context));
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
