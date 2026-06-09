import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function nowIso() { return new Date().toISOString(); }

function fromBase64(value: string): Uint8Array {
  const binary = atob(value || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function masterKeyId(): string {
  return Deno.env.get('MANAGED_FILE_MASTER_KEY_ID') || 'managed-file-master-v1';
}

async function importMasterKey(usage: KeyUsage[]) {
  const raw = Deno.env.get('MANAGED_FILE_MASTER_KEY_B64');
  if (!raw) {
    throw new Error('MANAGED_FILE_MASTER_KEY_B64 is niet geconfigureerd.');
  }
  const bytes = fromBase64(raw);
  if (bytes.byteLength !== 32) {
    throw new Error('MANAGED_FILE_MASTER_KEY_B64 moet exact 32 bytes base64 bevatten.');
  }
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, usage);
}

async function audit(base44: any, user: any, body: any, success: boolean, reason: string | null = null) {
  await base44.asServiceRole.entities.ManagedFileAccessLog.create({
    managed_file_id: body.managed_file_id || null,
    action: success ? 'key_wrap' : 'error',
    actor_user_id: user?.id || null,
    actor_email: user?.email || null,
    actor_name: user?.full_name || user?.name || null,
    owner_type: body.owner_type || body.context?.owner_type || null,
    owner_id: body.owner_id || body.context?.owner_id || null,
    company_id: body.company_id || body.context?.company_id || null,
    tenant_container_key: body.tenant_container_key || body.context?.tenant_container_key || null,
    source_entity: body.source_entity || body.context?.source_entity || null,
    source_entity_id: body.source_entity_id || body.context?.source_entity_id || null,
    success,
    reason,
    created_at: nowIso(),
    metadata: {
      encryption_algorithm: 'AES-256-GCM',
      key_wrap_algorithm: 'AES-256-GCM',
      key_id: masterKeyId()
    }
  });
}

Deno.serve(async (req) => {
  let body: any = {};
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    body = await req.json();
    const rawKeyB64 = body.raw_key_b64;
    if (!rawKeyB64) return Response.json({ error: 'raw_key_b64 is verplicht' }, { status: 400 });

    const dataKey = fromBase64(rawKeyB64);
    if (dataKey.byteLength !== 32) {
      await audit(base44, user, body, false, 'invalid_data_key_length');
      return Response.json({ error: 'Data key moet exact 32 bytes zijn.' }, { status: 400 });
    }

    const master = await importMasterKey(['encrypt']);
    const wrapIv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, master, dataKey);

    await audit(base44, user, body, true);

    return Response.json({
      encrypted_data_key: toBase64(wrapped),
      key_wrap_iv: toBase64(wrapIv),
      encryption_key_id: masterKeyId(),
      encryption_algorithm: 'AES-256-GCM',
      key_wrap_algorithm: 'AES-256-GCM'
    });
  } catch (error) {
    try {
      const base44 = createClientFromRequest(req);
      const user = await base44.auth.me().catch(() => null);
      await audit(base44, user, body, false, error.message);
    } catch {
      // Best-effort audit only.
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});
