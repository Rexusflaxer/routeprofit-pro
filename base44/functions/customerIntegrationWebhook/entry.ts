import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SIGNHOST_STATUS: Record<number, string> = {
  5: 'waiting_for_document',
  10: 'waiting_for_signer',
  20: 'in_progress',
  30: 'signed',
  40: 'rejected',
  50: 'expired',
  60: 'cancelled',
  70: 'failed',
};
const STORECOVE_FINAL_FAILURES = new Set(['failed', 'no_action_taken', 'rejected']);
const STORECOVE_DELIVERED = new Set([
  'succeeded',
  'acknowledged',
  'in_process',
  'under_query',
  'conditionally_accepted',
  'accepted',
  'partially_paid',
  'paid',
]);

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function nowIso() {
  return new Date().toISOString();
}

function env(name: string) {
  return String(Deno.env.get(name) || '').trim();
}

function normalizeHex(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/^sha1=/, '');
}

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

async function digestHex(algorithm: 'SHA-1' | 'SHA-256', value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest(algorithm, bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function signhostTransactionId(payload: any) {
  return String(payload?.Id || payload?.id || payload?.TransactionId || payload?.transactionId || '').trim();
}

function signhostStatusCode(payload: any) {
  return Number(payload?.Status ?? payload?.status ?? 0);
}

async function validateSignhost(req: Request, payload: any) {
  const sharedSecret = env('SIGNHOST_POSTBACK_SHARED_SECRET');
  const expectedSecurityHeader = env('SIGNHOST_POSTBACK_SECURITY_HEADER');
  if (!sharedSecret) return false;
  if (expectedSecurityHeader) {
    const actual = req.headers.get('authorization') || req.headers.get('x-signhost-security') || '';
    if (!constantTimeEqual(actual, expectedSecurityHeader)) return false;
  }
  const transactionId = signhostTransactionId(payload);
  const status = signhostStatusCode(payload);
  if (!transactionId || !status) return false;
  const expected = await digestHex('SHA-1', `${transactionId}||${status}|${sharedSecret}`);
  const actual = normalizeHex(req.headers.get('checksum') || payload?.Checksum);
  return Boolean(actual) && constantTimeEqual(actual, expected);
}

function validateStorecove(req: Request) {
  const expected = env('STORECOVE_WEBHOOK_SECRET');
  if (!expected) return false;
  const actual = req.headers.get('x-loq-storecove-secret')
    || req.headers.get('x-storecove-secret')
    || '';
  return constantTimeEqual(actual, expected);
}

async function createEventOnce(base44: any, event: Record<string, unknown>) {
  const idempotencyKey = String(event.idempotency_key || '');
  if (idempotencyKey) {
    const existing = await base44.asServiceRole.entities.CustomerEvent.filter({ idempotency_key: idempotencyKey });
    if (existing.length > 0) return { event: existing[0], duplicate: true };
  }
  const created = await base44.asServiceRole.entities.CustomerEvent.create({
    ...event,
    created_at: nowIso(),
  });
  return { event: created, duplicate: false };
}

async function uploadPrivateArtifact(
  base44: any,
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
  context: Record<string, any>,
) {
  const file = new File([bytes], filename, { type: mimeType || 'application/octet-stream' });
  const uploaded = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });
  const checksum = await digestHex('SHA-256', bytes);
  const companyId = String(context.company_id || '').trim();
  const customerId = String(context.customer_id || '').trim();
  const sourceType = String(context.source_type || 'commercial_artifact');
  const sourceId = String(context.source_id || 'unknown');
  const folderPath = `customers/${customerId}/commercial/${sourceType}/${sourceId}`;
  return base44.asServiceRole.entities.ManagedFile.create({
    owner_type: 'customer',
    owner_id: customerId,
    customer_id: customerId,
    customer_account_id: context.customer_account_id || null,
    company_id: companyId,
    tenant_container_key: `company:${companyId}`,
    owner_container_key: `customer:${customerId}`,
    access_scope: 'company',
    domain: 'commercial',
    category: context.category || 'commercial_evidence',
    source_entity: sourceType,
    source_entity_id: sourceId,
    display_name: filename,
    display_filename: filename,
    download_filename: filename,
    original_filename: filename,
    logical_path: `${folderPath}/${filename}`,
    folder_path: folderPath,
    mime_type: mimeType || 'application/octet-stream',
    stored_mime_type: mimeType || 'application/octet-stream',
    size_bytes: bytes.byteLength,
    file_uri: uploaded.file_uri,
    file_url: `private://${uploaded.file_uri}`,
    storage_visibility: 'private',
    portal_visible: false,
    encrypted: false,
    is_sensitive: true,
    security_classification: 'confidential',
    plaintext_sha256: checksum,
    status: 'active',
    uploaded_at: nowIso(),
    created_at: nowIso(),
  });
}

async function managedFileBytes(base44: any, managedFileId: string) {
  const managedFile = await base44.asServiceRole.entities.ManagedFile.get(managedFileId).catch(() => null);
  if (!managedFile) throw new Error('Documentbestand niet gevonden');
  let fileUrl = managedFile.file_url;
  if (managedFile.file_uri) {
    const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
      file_uri: managedFile.file_uri,
      expires_in: 120,
    });
    fileUrl = signed.signed_url;
  }
  if (!fileUrl || String(fileUrl).startsWith('private://')) throw new Error('Documentbestand is niet downloadbaar');
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Documentbestand ophalen mislukt (${response.status})`);
  return {
    managedFile,
    bytes: new Uint8Array(await response.arrayBuffer()),
    mime_type: response.headers.get('content-type') || managedFile.mime_type || 'application/pdf',
  };
}

async function fetchSignhostArtifacts(base44: any, signature: any, transactionId: string) {
  const apiToken = env('SIGNHOST_API_KEY');
  const appKey = env('SIGNHOST_APP_KEY');
  if (!apiToken || !appKey || !signature.provider_file_id) {
    return { pending: true, reason: 'signhost_artifact_credentials_or_file_id_missing' };
  }
  const headers = {
    Authorization: `APIKey ${apiToken}`,
    Application: `APPKey ${appKey}`,
  };
  const fileResponse = await fetch(
    `https://api.signhost.com/api/transaction/${encodeURIComponent(transactionId)}/file/${encodeURIComponent(signature.provider_file_id)}`,
    { headers },
  );
  const receiptResponse = await fetch(
    `https://api.signhost.com/api/file/receipt/${encodeURIComponent(transactionId)}`,
    { headers },
  );
  if (!fileResponse.ok || !receiptResponse.ok) {
    return {
      pending: true,
      reason: `signhost_artifact_fetch_failed:${fileResponse.status}:${receiptResponse.status}`,
    };
  }

  const context = {
    company_id: signature.company_id,
    customer_id: signature.customer_id,
    customer_account_id: signature.customer_account_id,
    source_type: signature.source_type,
    source_id: signature.source_id,
  };
  const signedBytes = new Uint8Array(await fileResponse.arrayBuffer());
  const receiptBytes = new Uint8Array(await receiptResponse.arrayBuffer());
  const signedFile = await uploadPrivateArtifact(
    base44,
    signedBytes,
    `${signature.source_type || 'document'}-${signature.source_id || transactionId}-signed.pdf`,
    fileResponse.headers.get('content-type') || 'application/pdf',
    context,
  );
  const receiptFile = await uploadPrivateArtifact(
    base44,
    receiptBytes,
    `${signature.source_type || 'document'}-${signature.source_id || transactionId}-receipt.pdf`,
    receiptResponse.headers.get('content-type') || 'application/pdf',
    context,
  );
  return {
    pending: false,
    signed_file_id: signedFile.id,
    receipt_file_id: receiptFile.id,
    signed_checksum: signedFile.plaintext_sha256,
  };
}

async function processSignhost(base44: any, req: Request, payload: any) {
  if (!await validateSignhost(req, payload)) {
    console.warn('[customerIntegrationWebhook] invalid Signhost webhook');
    return json({ ok: true });
  }
  const transactionId = signhostTransactionId(payload);
  const statusCode = signhostStatusCode(payload);
  const providerStatus = SIGNHOST_STATUS[statusCode] || `unknown_${statusCode}`;
  const checksum = normalizeHex(req.headers.get('checksum') || payload?.Checksum);
  const eventKey = `signhost:${transactionId}:${statusCode}:${checksum}`;
  const signatures = await base44.asServiceRole.entities.DocumentSignature.filter({
    provider: 'signhost',
    provider_transaction_id: transactionId,
  });
  let signature = signatures[0];
  if (!signature) {
    console.error('[customerIntegrationWebhook] unknown Signhost transaction', transactionId);
    return json({ ok: true });
  }

  const eventResult = await createEventOnce(base44, {
    company_id: signature.company_id,
    customer_id: signature.customer_id,
    customer_account_id: signature.customer_account_id || null,
    event_type: 'signature_webhook',
    action: `signhost_${providerStatus}`,
    source_type: 'DocumentSignature',
    source_id: signature.id,
    actor_type: 'integration',
    actor_name: 'Signhost',
    outcome: 'received',
    idempotency_key: eventKey,
    payload_checksum: checksum,
    external_reference: transactionId,
    summary: `Signhost transactie ${providerStatus}`,
  });
  if (eventResult.duplicate) {
    const current = await base44.asServiceRole.entities.DocumentSignature.get(signature.id).catch(() => null);
    if (
      current
      && current.last_webhook_checksum === checksum
      && current.provider_status === providerStatus
    ) {
      return json({ ok: true, duplicate: true });
    }
    // The audit event may have been persisted just before a worker crash. Resume
    // from the current durable signature state instead of silently dropping the retry.
    if (current) signature = current;
  }
  if (
    providerStatus !== 'signed'
    && ['signed', 'evidence_pending', 'rejected', 'expired', 'cancelled', 'failed'].includes(signature.status)
  ) {
    return json({ ok: true, ignored_out_of_order: true });
  }

  const updates: Record<string, unknown> = {
    provider_status: providerStatus,
    last_webhook_checksum: checksum,
    last_webhook_at: nowIso(),
    signer_snapshots: Array.isArray(payload?.Signers) ? payload.Signers.map((signer: any) => ({
      email: signer?.Email || signer?.email || null,
      activities: Array.isArray(signer?.Activities) ? signer.Activities : [],
    })) : [],
  };

  if (providerStatus === 'signed') {
    const artifacts = await fetchSignhostArtifacts(base44, signature, transactionId);
    if (artifacts.pending) {
      updates.status = 'evidence_pending';
      updates.failure_reason = artifacts.reason;
    } else {
      updates.status = 'signed';
      updates.signed_at = nowIso();
      updates.signed_managed_file_id = artifacts.signed_file_id;
      updates.receipt_managed_file_id = artifacts.receipt_file_id;
      updates.signed_checksum = artifacts.signed_checksum;
      updates.failure_reason = null;

      if (signature.source_type === 'CustomerQuote') {
        await casUpdateLatest(base44.asServiceRole.entities.CustomerQuote, signature.source_id, {
          status: 'accepted',
          accepted_at: nowIso(),
          signature_id: signature.id,
          document_signature_id: signature.id,
          signed_managed_file_id: artifacts.signed_file_id,
        });
      } else if (signature.source_type === 'CustomerContract') {
        await casUpdateLatest(base44.asServiceRole.entities.CustomerContract, signature.source_id, {
          status: 'signed',
          signed_at: nowIso(),
          signature_id: signature.id,
          document_signature_id: signature.id,
          signed_managed_file_id: artifacts.signed_file_id,
        });
      }
    }
  } else if (providerStatus === 'rejected') {
    updates.status = 'rejected';
    updates.rejected_at = nowIso();
  } else if (providerStatus === 'expired') {
    updates.status = 'expired';
    updates.expired_at = nowIso();
  } else if (providerStatus === 'cancelled') {
    updates.status = 'cancelled';
    updates.cancelled_at = nowIso();
  } else if (providerStatus === 'failed') {
    updates.status = 'failed';
    updates.failure_reason = 'signhost_transaction_failed';
  } else {
    updates.status = signature.status === 'signed' ? 'signed' : 'pending';
  }
  await casUpdateLatest(base44.asServiceRole.entities.DocumentSignature, signature.id, updates);
  return json({ ok: true });
}

function storecoveDeliveryStatus(event: string) {
  if (STORECOVE_FINAL_FAILURES.has(event)) return 'failed';
  if (event === 'rejected') return 'rejected';
  if (event === 'accepted') return 'accepted';
  if (STORECOVE_DELIVERED.has(event)) return 'delivered';
  if (event === 'cleared') return 'delivered';
  return 'processing';
}

const DELIVERY_STATUS_RANK: Record<string, number> = {
  not_scheduled: 0,
  queued: 1,
  sent: 2,
  processing: 3,
  delivered: 4,
  accepted: 5,
  rejected: 6,
  failed: 6,
};

function monotonicDeliveryStatus(current: unknown, incoming: string) {
  const currentStatus = String(current || 'not_scheduled');
  if (['accepted', 'rejected', 'failed'].includes(currentStatus)) return currentStatus;
  return (DELIVERY_STATUS_RANK[incoming] || 0) >= (DELIVERY_STATUS_RANK[currentStatus] || 0)
    ? incoming
    : currentStatus;
}

async function fetchStorecoveEvidence(base44: any, invoice: any, guid: string) {
  const apiKey = env('STORECOVE_API_KEY');
  if (!apiKey) return { pending: true, reason: 'storecove_api_key_missing' };
  const response = await fetch(
    `https://api.storecove.com/api/v2/document_submissions/${encodeURIComponent(guid)}/evidence/sending`,
    { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } },
  );
  if (!response.ok) return { pending: true, reason: `storecove_evidence_fetch_failed:${response.status}` };
  const evidence = await response.json();
  const managedFileIds: string[] = [];
  const documents = Array.isArray(evidence?.documents) ? evidence.documents.slice(0, 5) : [];
  for (let index = 0; index < documents.length; index += 1) {
    const document = documents[index];
    const documentUrl = document?.document || document?.url;
    if (!documentUrl || typeof documentUrl !== 'string') continue;
    const fileResponse = await fetch(documentUrl);
    if (!fileResponse.ok) continue;
    const bytes = new Uint8Array(await fileResponse.arrayBuffer());
    const type = fileResponse.headers.get('content-type') || document?.mime_type || 'application/octet-stream';
    const extension = type.includes('xml') ? 'xml' : type.includes('pdf') ? 'pdf' : 'bin';
    const file = await uploadPrivateArtifact(
      base44,
      bytes,
      `${invoice.invoice_number || invoice.id}-storecove-${index + 1}.${extension}`,
      type,
      {
        company_id: invoice.company_id,
        customer_id: invoice.customer_id,
        customer_account_id: invoice.customer_account_id,
        source_type: 'SalesInvoice',
        source_id: invoice.id,
      },
    );
    managedFileIds.push(file.id);
  }
  return { pending: false, evidence, managed_file_ids: managedFileIds };
}

async function processStorecove(base44: any, req: Request, payload: any) {
  if (!validateStorecove(req)) {
    console.warn('[customerIntegrationWebhook] invalid Storecove webhook');
    return json({ ok: true });
  }
  if (payload?.event_type !== 'document_submission' || !payload?.guid) return json({ ok: true });
  const guid = String(payload.guid);
  const event = String(payload.event || 'unknown');
  const eventKey = `storecove:${guid}:${event}:${String(payload.idempotencyGuid || '')}`;
  const invoices = await base44.asServiceRole.entities.SalesInvoice.filter({
    provider: 'storecove',
    provider_submission_id: guid,
  });
  let invoice = invoices[0];
  if (!invoice) {
    console.error('[customerIntegrationWebhook] unknown Storecove submission', guid);
    return json({ ok: true });
  }
  const eventResult = await createEventOnce(base44, {
    company_id: invoice.company_id,
    customer_id: invoice.customer_id,
    customer_account_id: invoice.customer_account_id,
    event_type: 'invoice_delivery_webhook',
    action: `storecove_${event}`,
    source_type: 'SalesInvoice',
    source_id: invoice.id,
    actor_type: 'integration',
    actor_name: 'Storecove',
    outcome: 'received',
    idempotency_key: eventKey,
    external_reference: guid,
    summary: `Storecove factuurstatus ${event}`,
  });
  if (eventResult.duplicate) {
    const current = await base44.asServiceRole.entities.SalesInvoice.get(invoice.id).catch(() => null);
    if (current?.last_delivery_event_key === eventKey) {
      return json({ ok: true, duplicate: true });
    }
    // Resume a retry when the event audit exists but the invoice update did not
    // complete (for example after a worker crash).
    if (current) invoice = current;
  }

  const deliveryStatus = monotonicDeliveryStatus(
    invoice.delivery_status,
    storecoveDeliveryStatus(event),
  );
  const updates: Record<string, unknown> = {
    provider_event: event,
    last_delivery_event_key: eventKey,
    provider_status: deliveryStatus,
    provider_details: payload.details || null,
    provider_response_document: payload.response_document || null,
    delivery_status: deliveryStatus,
    last_delivery_event_at: nowIso(),
  };
  if (STORECOVE_DELIVERED.has(event) || event === 'cleared') {
    updates.delivered_at = invoice.delivered_at || nowIso();
  }
  if (event === 'accepted') updates.accepted_at = nowIso();
  if (event === 'rejected') updates.rejected_at = nowIso();
  if (event === 'paid') {
    updates.payment_status = 'paid';
    updates.paid_at = nowIso();
  }

  if (event === 'succeeded' || event === 'acknowledged' || event === 'accepted') {
    const evidence = await fetchStorecoveEvidence(base44, invoice, guid);
    if (evidence.pending) {
      updates.delivery_evidence_status = 'pending';
      updates.delivery_evidence_error = evidence.reason;
    } else {
      updates.delivery_evidence_status = 'stored';
      updates.delivery_evidence = evidence.evidence;
      updates.delivery_evidence_managed_file_ids = evidence.managed_file_ids;
      updates.delivery_evidence_error = null;
    }
  }
  await casUpdateLatest(base44.asServiceRole.entities.SalesInvoice, invoice.id, updates);
  return json({ ok: true });
}

function assertAdmin(user: any) {
  if (!user || user.role !== 'admin') {
    const error = new Error('Forbidden');
    (error as any).status = 403;
    throw error;
  }
}

function required(value: unknown, label: string) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    const error = new Error(`${label} ontbreekt`);
    (error as any).status = 400;
    throw error;
  }
  return normalized;
}

function mutationEnvelope(body: any) {
  const idempotencyKey = required(body.idempotency_key, 'idempotency_key');
  const expectedVersion = Number(body.expected_version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    const error = new Error('expected_version moet een positief geheel getal zijn');
    (error as any).status = 400;
    throw error;
  }
  return { idempotencyKey, expectedVersion };
}

function recordVersion(record: any) {
  const version = Number(record?.version || 1);
  return Number.isInteger(version) && version > 0 ? version : 1;
}

async function casUpdateEntity(entity: any, record: any, expectedVersion: number, patch: Record<string, unknown>) {
  const actualVersion = recordVersion(record);
  if (actualVersion !== expectedVersion) {
    const error = new Error(`Versieconflict: verwacht ${expectedVersion}, actueel ${actualVersion}`);
    (error as any).status = 409;
    throw error;
  }
  const versionQuery = record.version == null
    ? { $or: [{ version: expectedVersion }, { version: { $exists: false } }] }
    : { version: expectedVersion };
  const result = await entity.updateMany(
    { id: record.id, ...versionQuery },
    { $set: patch, $inc: { version: 1 } },
  );
  if (!result?.success || result.updated !== 1) {
    const error = new Error('Record is intussen gewijzigd');
    (error as any).status = 409;
    throw error;
  }
  return entity.get(record.id);
}

async function casUpdateLatest(entity: any, id: string, patch: Record<string, unknown>, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const record = await entity.get(id).catch(() => null);
    if (!record) {
      const error = new Error('Record niet gevonden');
      (error as any).status = 404;
      throw error;
    }
    try {
      return await casUpdateEntity(entity, record, recordVersion(record), patch);
    } catch (error) {
      if (Number((error as any)?.status) !== 409 || attempt === attempts - 1) throw error;
    }
  }
  const error = new Error('Record kon niet veilig worden bijgewerkt');
  (error as any).status = 409;
  throw error;
}

async function deterministicGuid(value: string) {
  const hex = await digestHex('SHA-256', value);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function startSignhostSignature(base44: any, user: any, body: any) {
  assertAdmin(user);
  const { idempotencyKey, expectedVersion } = mutationEnvelope(body);
  const sourceType = required(body.source_type, 'source_type');
  const sourceId = required(body.source_id, 'source_id');
  const signerEmail = required(body.signer_email, 'signer_email').toLowerCase();
  const signerName = required(body.signer_name, 'signer_name');
  const unsignedManagedFileId = required(body.unsigned_managed_file_id, 'unsigned_managed_file_id');
  if (!['CustomerQuote', 'CustomerContract'].includes(sourceType)) {
    return json({ error: 'Alleen offertes en klantcontracten kunnen via Signhost worden verstuurd' }, 400);
  }

  const sourceEntity = sourceType === 'CustomerQuote'
    ? base44.asServiceRole.entities.CustomerQuote
    : base44.asServiceRole.entities.CustomerContract;
  let source = await sourceEntity.get(sourceId).catch(() => null);
  if (!source) return json({ error: 'Document niet gevonden' }, 404);
  const replay = await base44.asServiceRole.entities.DocumentSignature.filter({
    idempotency_key: idempotencyKey,
    source_type: sourceType,
    source_id: sourceId,
  });
  if (replay[0]) {
    return json({
      ok: true,
      signature_id: replay[0].id,
      provider_transaction_id: replay[0].provider_transaction_id || null,
      status: replay[0].status,
      idempotent: true,
    });
  }
  if (source.status !== 'approved') {
    return json({ error: 'Alleen een goedgekeurde documentversie kan ter ondertekening worden verstuurd' }, 409);
  }
  const definitiveFileId = sourceType === 'CustomerQuote'
    ? source.document_managed_file_id
    : source.unsigned_managed_file_id;
  if (!definitiveFileId || definitiveFileId !== unsignedManagedFileId) {
    return json({ error: 'Het gekozen bestand is niet de goedgekeurde, definitieve documentversie' }, 409);
  }
  const existing = await base44.asServiceRole.entities.DocumentSignature.filter({
    source_type: sourceType,
    source_id: sourceId,
    provider: 'signhost',
  });
  const active = existing.find((item: any) =>
    item.provider_transaction_id && !['failed', 'cancelled', 'expired', 'rejected'].includes(item.status)
  );
  if (active) {
    return json({
      ok: true,
      signature_id: active.id,
      provider_transaction_id: active.provider_transaction_id,
      idempotent: true,
    });
  }

  const apiToken = env('SIGNHOST_API_KEY');
  const appKey = env('SIGNHOST_APP_KEY');
  if (!apiToken || !appKey) return json({ error: 'Signhost is niet geconfigureerd' }, 409);
  const document = await managedFileBytes(base44, unsignedManagedFileId);
  if (
    document.managedFile.company_id !== source.company_id
    || document.managedFile.customer_id !== source.customer_id
    || document.managedFile.customer_account_id && document.managedFile.customer_account_id !== source.customer_account_id
    || document.managedFile.storage_visibility !== 'private'
    || document.managedFile.status && document.managedFile.status !== 'active'
    || !String(document.mime_type || '').toLowerCase().includes('pdf')
  ) {
    return json({ error: 'Het ondertekenbestand behoort niet tot deze klantrelatie of is niet een actief privé-PDF-bestand' }, 409);
  }
  source = await casUpdateEntity(sourceEntity, source, expectedVersion, {
    signature_lock_key: idempotencyKey,
    signature_lock_started_at: nowIso(),
  });
  const documentChecksum = document.managedFile.plaintext_sha256
    || await digestHex('SHA-256', document.bytes);
  const providerFileId = `${sourceType === 'CustomerQuote' ? 'offerte' : 'contract'}.pdf`;
  let signature = await base44.asServiceRole.entities.DocumentSignature.create({
    company_id: source.company_id,
    customer_id: source.customer_id,
    customer_account_id: source.customer_account_id,
    source_type: sourceType,
    source_id: sourceId,
    provider: 'signhost',
    provider_file_id: providerFileId,
    status: 'creating',
    signer_snapshots: [{ email: signerEmail, name: signerName }],
    unsigned_managed_file_id: unsignedManagedFileId,
    document_checksum: documentChecksum,
    idempotency_key: idempotencyKey,
    version: 1,
    created_by_user_id: user.id,
    created_at: nowIso(),
  });

  const headers = {
    Authorization: `APIKey ${apiToken}`,
    Application: `APPKey ${appKey}`,
    'Content-Type': 'application/json',
  };
  try {
    const transactionResponse = await fetch('https://api.signhost.com/api/transaction', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        Signers: [{
          Email: signerEmail,
          Verifications: [{ Type: 'Scribble', ScribbleName: signerName, ScribbleNameFixed: false }],
          SendSignRequest: true,
          SendSignConfirmation: true,
          SignRequestMessage: String(body.message || 'Wilt u dit document controleren en ondertekenen?'),
          DaysToRemind: Number(body.days_to_remind || 7),
        }],
        SendEmailNotifications: true,
        Reference: `${sourceType}:${sourceId}`,
      }),
    });
    const transaction = await transactionResponse.json().catch(() => ({}));
    if (!transactionResponse.ok) {
      throw new Error(transaction?.Message || transaction?.message || `Signhost transactie mislukt (${transactionResponse.status})`);
    }
    const transactionId = required(transaction?.Id || transaction?.id, 'Signhost transaction ID');

    const uploadResponse = await fetch(
      `https://api.signhost.com/api/transaction/${encodeURIComponent(transactionId)}/file/${encodeURIComponent(providerFileId)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `APIKey ${apiToken}`,
          Application: `APPKey ${appKey}`,
          'Content-Type': 'application/pdf',
        },
        body: document.bytes,
      },
    );
    if (!uploadResponse.ok) throw new Error(`Signhost documentupload mislukt (${uploadResponse.status})`);
    const startResponse = await fetch(
      `https://api.signhost.com/api/transaction/${encodeURIComponent(transactionId)}/start`,
      { method: 'PUT', headers },
    );
    if (!startResponse.ok) throw new Error(`Signhost transactie starten mislukt (${startResponse.status})`);

    signature = await casUpdateLatest(base44.asServiceRole.entities.DocumentSignature, signature.id, {
      provider_transaction_id: transactionId,
      provider_status: 'waiting_for_signer',
      status: 'pending',
      sent_at: nowIso(),
    });
    source = await casUpdateEntity(sourceEntity, source, recordVersion(source), {
      status: sourceType === 'CustomerQuote' ? 'sent' : 'sent_for_signature',
      signature_id: signature.id,
      document_signature_id: signature.id,
      sent_at: nowIso(),
      signature_lock_key: null,
      signature_lock_started_at: null,
    });
    await createEventOnce(base44, {
      company_id: source.company_id,
      customer_id: source.customer_id,
      customer_account_id: source.customer_account_id,
      event_type: 'signature_started',
      action: 'signhost_start',
      source_type: sourceType,
      source_id: sourceId,
      actor_type: 'user',
      actor_user_id: user.id,
      outcome: 'success',
      idempotency_key: `signhost:start:${signature.id}`,
      external_reference: transactionId,
      summary: `${sourceType === 'CustomerQuote' ? 'Offerte' : 'Contract'} ter ondertekening verstuurd`,
    });
    return json({ ok: true, signature_id: signature.id, provider_transaction_id: transactionId });
  } catch (error) {
    await casUpdateLatest(base44.asServiceRole.entities.DocumentSignature, signature.id, {
      status: 'failed',
      failure_reason: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function importManualSignature(base44: any, user: any, body: any) {
  assertAdmin(user);
  const { idempotencyKey, expectedVersion } = mutationEnvelope(body);
  const sourceType = required(body.source_type, 'source_type');
  const sourceId = required(body.source_id, 'source_id');
  const signedManagedFileId = required(body.signed_managed_file_id, 'signed_managed_file_id');
  const reason = required(body.reason, 'reason');
  if (!['CustomerQuote', 'CustomerContract'].includes(sourceType)) {
    return json({ error: 'Alleen offertes en klantcontracten kunnen handmatig worden geïmporteerd' }, 400);
  }

  const duplicate = await base44.asServiceRole.entities.DocumentSignature.filter({
    idempotency_key: idempotencyKey,
  });
  if (duplicate[0]) {
    return json({ ok: true, signature_id: duplicate[0].id, idempotent: true });
  }

  const sourceEntity = sourceType === 'CustomerQuote'
    ? base44.asServiceRole.entities.CustomerQuote
    : base44.asServiceRole.entities.CustomerContract;
  const source = await sourceEntity.get(sourceId).catch(() => null);
  if (!source) return json({ error: 'Document niet gevonden' }, 404);
  if (!['approved', 'sent', 'sent_for_signature'].includes(source.status)) {
    return json({ error: 'Alleen een goedgekeurde of reeds verzonden documentversie kan handmatig worden ondertekend' }, 409);
  }
  if (recordVersion(source) !== expectedVersion) {
    return json({ error: 'Documentversie is intussen gewijzigd' }, 409);
  }
  const signedDocument = await managedFileBytes(base44, signedManagedFileId);
  if (
    signedDocument.managedFile.company_id !== source.company_id
    || signedDocument.managedFile.customer_id !== source.customer_id
    || signedDocument.managedFile.customer_account_id && signedDocument.managedFile.customer_account_id !== source.customer_account_id
    || signedDocument.managedFile.storage_visibility !== 'private'
    || signedDocument.managedFile.status && signedDocument.managedFile.status !== 'active'
    || !String(signedDocument.mime_type || '').toLowerCase().includes('pdf')
  ) {
    return json({ error: 'Bewijsbestand behoort niet tot deze klantrelatie of is niet een actief privé-PDF-bestand' }, 409);
  }
  const checksum = signedDocument.managedFile.plaintext_sha256
    || await digestHex('SHA-256', signedDocument.bytes);
  const signedAt = body.signed_at ? new Date(body.signed_at).toISOString() : nowIso();
  const signature = await base44.asServiceRole.entities.DocumentSignature.create({
    company_id: source.company_id,
    customer_id: source.customer_id,
    customer_account_id: source.customer_account_id,
    source_type: sourceType,
    source_id: sourceId,
    provider: 'manual',
    status: 'signed',
    signer_snapshots: Array.isArray(body.signers) ? body.signers : [],
    unsigned_managed_file_id: source.document_managed_file_id || signedManagedFileId,
    signed_managed_file_id: signedManagedFileId,
    document_checksum: checksum,
    signed_checksum: checksum,
    signed_at: signedAt,
    manual_import_reason: reason,
    idempotency_key: idempotencyKey,
    version: 1,
    metadata: {
      imported_by_user_id: user.id,
      evidence_reference: body.evidence_reference || null,
    },
  });
  await casUpdateEntity(sourceEntity, source, expectedVersion, {
    status: sourceType === 'CustomerQuote' ? 'accepted' : 'signed',
    accepted_at: sourceType === 'CustomerQuote' ? signedAt : source.accepted_at || null,
    signed_at: signedAt,
    signature_id: signature.id,
    document_signature_id: signature.id,
    signed_managed_file_id: signedManagedFileId,
  });
  await createEventOnce(base44, {
    company_id: source.company_id,
    customer_id: source.customer_id,
    customer_account_id: source.customer_account_id,
    event_type: 'signature_manual_import',
    category: 'commercial',
    action: 'manual_signature_import',
    source_type: sourceType,
    source_id: sourceId,
    actor_type: 'user',
    actor_user_id: user.id,
    outcome: 'success',
    idempotency_key: `manual-signature:${idempotencyKey}`,
    summary: `${sourceType === 'CustomerQuote' ? 'Offerte' : 'Contract'} handmatig als ondertekend vastgelegd`,
  });
  return json({ ok: true, signature_id: signature.id }, 201);
}

function addressDto(address: any) {
  const streetAndNumber = [
    address?.street_name || address?.street,
    address?.house_number,
    address?.house_number_addition,
  ].filter(Boolean).join(' ');
  return {
    line1: address?.street_and_number || address?.line1 || address?.address_line_1 || streetAndNumber,
    line2: address?.line2 || address?.address_line_2 || undefined,
    city: address?.city || '',
    zip: address?.postal_code || address?.zip || '',
    country: address?.country_code || 'NL',
  };
}

function decimal(cents: unknown) {
  return Math.round(Number(cents || 0)) / 100;
}

function storecoveTaxCategory(line: any) {
  const percentage = Number(
    line.vat_rate_basis_points
      ?? line.vat_rate_bps
      ?? line.tax_rate_bps
      ?? 2100,
  ) / 100;
  return {
    country: 'NL',
    category: percentage === 0 ? 'Z' : 'S',
    percentage,
  };
}

function buildStorecoveInvoicePayload({
  invoice,
  lines,
  customer,
  customerAddress,
  account,
  legalEntityId,
  idempotencyGuid,
}: Record<string, any>) {
  const isCredit = invoice.document_type === 'credit_note';
  const peppolParticipantId = account.peppol_participant_id || account.peppol_identifier;
  const eIdentifiers = peppolParticipantId
    ? [{
      scheme: account.peppol_scheme_id || account.peppol_scheme || 'NL:KVK',
      id: peppolParticipantId,
    }]
    : [];
  const emails = account.allow_email_fallback === true && account.invoice_email
    ? [account.invoice_email]
    : [];
  const invoiceLines = lines.map((line: any, index: number) => ({
    lineId: String(line.sequence || line.line_number || index + 1),
    item: {
      name: line.description || `Dienst ${index + 1}`,
      description: line.description || undefined,
    },
    quantity: Number(
      line.quantity_minor != null
        ? line.quantity_minor / 1000
        : line.quantity_millis != null
          ? line.quantity_millis / 1000
          : line.quantity || 1,
    ),
    quantityUnitCode: line.unit_code || 'C62',
    amountExcludingTax: decimal(line.total_excluding_tax_cents ?? line.subtotal_cents),
    itemPrice: decimal(line.unit_price_cents),
    tax: storecoveTaxCategory(line),
  }));
  const publicIdentifiers: Array<Record<string, string>> = [];
  if (customer.kvk_number) {
    publicIdentifiers.push({ scheme: 'NL:KVK', id: String(customer.kvk_number).replace(/\s/g, '') });
  }
  if (customer.vat_number || customer.btw_number) {
    publicIdentifiers.push({ scheme: 'NL:VAT', id: String(customer.vat_number || customer.btw_number).replace(/\s/g, '') });
  }
  return {
    legalEntityId: Number(legalEntityId),
    idempotencyGuid,
    routing: { eIdentifiers, emails },
    document: {
      documentType: 'invoice',
      invoice: {
        invoiceNumber: invoice.invoice_number,
        issueDate: String(invoice.issue_date || '').slice(0, 10),
        dueDate: String(invoice.due_date || '').slice(0, 10),
        documentCurrencyCode: invoice.currency || 'EUR',
        invoiceTypeCode: isCredit ? 381 : 380,
        accountingCustomerParty: {
          party: {
            companyName: customer.legal_name || customer.trade_name || customer.name,
            address: addressDto(customerAddress),
          },
          publicIdentifiers,
        },
        invoiceLines,
        amountIncludingVat: decimal(invoice.total_including_tax_cents ?? invoice.total_cents),
        tax: (invoice.tax_breakdown || invoice.tax_summary || []).map((tax: any) => ({
          taxAmount: decimal(tax.tax_amount_cents ?? tax.tax_cents),
          taxableAmount: decimal(tax.taxable_amount_cents ?? tax.taxable_cents ?? tax.subtotal_cents),
          tax: {
            country: 'NL',
            category: Number(tax.rate_bps ?? tax.vat_rate_basis_points ?? 0) === 0 ? 'Z' : 'S',
            percentage: Number(tax.rate_bps ?? tax.vat_rate_basis_points ?? 0) / 100,
          },
        })),
        paymentMeans: (invoice.payment_iban || invoice.bank_account_snapshot?.iban) ? [{
          paymentMeansCode: 'credit_transfer',
          paymentId: invoice.payment_reference || invoice.invoice_number,
          iban: invoice.payment_iban || invoice.bank_account_snapshot?.iban,
        }] : undefined,
        note: invoice.notes || undefined,
        references: invoice.purchase_order_reference ? [{
          documentType: 'purchase_order',
          documentId: invoice.purchase_order_reference,
        }] : undefined,
      },
    },
  };
}

async function submitStorecoveInvoice(base44: any, user: any, body: any) {
  assertAdmin(user);
  const { idempotencyKey, expectedVersion } = mutationEnvelope(body);
  const invoiceId = required(body.invoice_id, 'invoice_id');
  let invoice = await base44.asServiceRole.entities.SalesInvoice.get(invoiceId).catch(() => null);
  if (!invoice) return json({ error: 'Factuur niet gevonden' }, 404);
  if ((invoice.lifecycle_status || invoice.status) !== 'issued') {
    return json({ error: 'Alleen uitgegeven facturen kunnen worden verzonden' }, 409);
  }
  if (invoice.provider_idempotency_key === idempotencyKey && invoice.provider_submission_id) {
    return json({ ok: true, provider_submission_id: invoice.provider_submission_id, idempotent: true });
  }
  if (invoice.provider_idempotency_key && invoice.provider_idempotency_key !== idempotencyKey) {
    return json({ error: 'Deze factuur is al door een andere afleveropdracht geclaimd' }, 409);
  }

  const [account, customer, settingsList, lines, addresses] = await Promise.all([
    base44.asServiceRole.entities.CustomerAccount.get(invoice.customer_account_id).catch(() => null),
    base44.asServiceRole.entities.Customer.get(invoice.customer_id).catch(() => null),
    base44.asServiceRole.entities.CompanyBillingSettings.filter({ company_id: invoice.company_id }),
    base44.asServiceRole.entities.SalesInvoiceLine.filter({ invoice_id: invoice.id }),
    base44.asServiceRole.entities.CustomerAddress.filter({ customer_id: invoice.customer_id }),
  ]);
  const settings = settingsList.find((item: any) => item.status !== 'archived') || settingsList[0];
  if (!account || !customer || !settings) return json({ error: 'Factuurconfiguratie is onvolledig' }, 409);
  if (settings.peppol_enabled !== true && settings.feature_flags?.peppol !== true) {
    return json({ error: 'Peppol is voor deze BV niet geactiveerd' }, 409);
  }
  const legalEntityId = settings.storecove_legal_entity_id;
  if (!legalEntityId) return json({ error: 'Storecove LegalEntity ontbreekt' }, 409);
  const peppolRequired = account.peppol_required === true
    || account.invoice_delivery_method === 'peppol'
    || account.invoice_delivery_channel === 'peppol';
  if (peppolRequired && (!account.peppol_scheme_id || !account.peppol_participant_id)) {
    return json({ error: 'Peppol-ontvanger ontbreekt; e-mailfallback is niet toegestaan' }, 409);
  }
  if (!lines.length) return json({ error: 'Factuur heeft geen regels' }, 409);

  const apiKey = env('STORECOVE_API_KEY');
  if (!apiKey) return json({ error: 'Storecove is niet geconfigureerd' }, 409);
  const idempotencyGuid = invoice.provider_idempotency_guid
    || await deterministicGuid(`storecove:${invoice.id}:${idempotencyKey}`);
  if (!invoice.provider_idempotency_key) {
    invoice = await casUpdateEntity(base44.asServiceRole.entities.SalesInvoice, invoice, expectedVersion, {
      provider: 'storecove',
      provider_idempotency_guid: idempotencyGuid,
      provider_idempotency_key: idempotencyKey,
      provider_status: 'submission_claimed',
      delivery_status: 'queued',
    });
  } else if (invoice.provider_idempotency_key === idempotencyKey && recordVersion(invoice) !== expectedVersion) {
    // Een retry na het atomisch claimen mag met de oorspronkelijke versie
    // doorgaan; de deterministische provider-GUID voorkomt dubbel afleveren.
  } else if (recordVersion(invoice) !== expectedVersion) {
    return json({ error: 'Factuur is intussen gewijzigd' }, 409);
  }
  const customerAddress = addresses.find((item: any) => item.id === invoice.billing_address_id)
    || addresses.find((item: any) => item.address_type === 'invoice')
    || addresses[0];
  const payload = buildStorecoveInvoicePayload({
    invoice,
    lines,
    customer,
    customerAddress,
    account,
    legalEntityId,
    idempotencyGuid,
  });
  const response = await fetch(`${env('STORECOVE_API_BASE_URL') || 'https://api.storecove.com/api/v2'}/document_submissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    await casUpdateLatest(base44.asServiceRole.entities.SalesInvoice, invoice.id, {
      provider: 'storecove',
      provider_status: 'submission_failed',
      delivery_status: 'failed',
      provider_details: result,
    });
    return json({ error: 'Storecove heeft de factuur geweigerd', details: result }, response.status === 422 ? 422 : 502);
  }
  const guid = required(result.guid || result.documentSubmissionGuid || result.document_submission_guid, 'Storecove submission GUID');
  await casUpdateLatest(base44.asServiceRole.entities.SalesInvoice, invoice.id, {
    provider: 'storecove',
    provider_submission_id: guid,
    provider_status: 'submitted',
    provider_details: result,
    delivery_status: 'queued',
    submitted_at: nowIso(),
  });
  await createEventOnce(base44, {
    company_id: invoice.company_id,
    customer_id: invoice.customer_id,
    customer_account_id: invoice.customer_account_id,
    event_type: 'invoice_delivery_started',
    action: 'storecove_submit',
    source_type: 'SalesInvoice',
    source_id: invoice.id,
    actor_type: 'user',
    actor_user_id: user.id,
    outcome: 'success',
    idempotency_key: `storecove:submit:${idempotencyGuid}`,
    external_reference: guid,
    summary: `Factuur ${invoice.invoice_number} aan Storecove aangeboden`,
  });
  return json({ ok: true, provider_submission_id: guid });
}

export {
  constantTimeEqual,
  signhostTransactionId,
  signhostStatusCode,
  storecoveDeliveryStatus,
  buildStorecoveInvoicePayload,
};

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const provider = String(
      url.searchParams.get('provider')
      || req.headers.get('x-loq-provider')
      || '',
    ).toLowerCase();
    const rawBody = await req.text();
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const base44 = createClientFromRequest(req);

    if (provider === 'signhost') return processSignhost(base44, req, payload);
    if (provider === 'storecove') return processStorecove(base44, req, payload);
    const user = await base44.auth.me();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (payload.action === 'start_signhost_signature') return startSignhostSignature(base44, user, payload);
    if (payload.action === 'import_manual_signature') return importManualSignature(base44, user, payload);
    if (payload.action === 'submit_storecove_invoice') return submitStorecoveInvoice(base44, user, payload);
    return json({ error: 'Onbekende integratieactie' }, 400);
  } catch (error) {
    console.error('[customerIntegrationWebhook]', error);
    const isProviderRequest = Boolean(
      new URL(req.url).searchParams.get('provider')
      || req.headers.get('x-loq-provider'),
    );
    if (isProviderRequest) {
      // Providers retry non-2xx responses. Return 200 and reconcile from the provider API.
      return json({ ok: true, queued_for_reconciliation: true });
    }
    return json({
      error: error instanceof Error ? error.message : 'Integratieactie mislukt',
    }, Number((error as any)?.status || 500));
  }
});
