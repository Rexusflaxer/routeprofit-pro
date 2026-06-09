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

async function audit(base44: any, user: any, file: any, action: string, success: boolean, reason: string | null = null) {
  await base44.asServiceRole.entities.ManagedFileAccessLog.create({
    managed_file_id: file?.id || null,
    action,
    actor_user_id: user?.id || null,
    actor_email: user?.email || null,
    actor_name: user?.full_name || user?.name || null,
    owner_type: file?.owner_type || null,
    owner_id: file?.owner_id || null,
    company_id: file?.company_id || null,
    tenant_container_key: file?.tenant_container_key || null,
    source_entity: file?.source_entity || null,
    source_entity_id: file?.source_entity_id || null,
    success,
    reason,
    created_at: nowIso(),
    metadata: {
      encryption_key_id: file?.encryption_key_id || null,
      download_filename: file?.download_filename || null,
      security_classification: file?.security_classification || null
    }
  });
}

Deno.serve(async (req) => {
  let managedFile: any = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const managedFileId = body.managed_file_id;
    if (!managedFileId) return Response.json({ error: 'managed_file_id is verplicht' }, { status: 400 });

    managedFile = await base44.asServiceRole.entities.ManagedFile.get(managedFileId);
    if (!managedFile) return Response.json({ error: 'ManagedFile niet gevonden' }, { status: 404 });

    if (!managedFile.encrypted) {
      await audit(base44, user, managedFile, 'download', true, 'plaintext_legacy_file');
      return Response.json({
        encrypted: false,
        file_url: managedFile.file_url,
        download_filename: managedFile.download_filename,
        mime_type: managedFile.mime_type || 'application/octet-stream'
      });
    }

    if (!managedFile.encrypted_data_key || !managedFile.key_wrap_iv || !managedFile.encryption_iv) {
      await audit(base44, user, managedFile, 'access_denied', false, 'missing_encryption_metadata');
      return Response.json({ error: 'Encryptiemetadata ontbreekt.' }, { status: 409 });
    }

    const master = await importMasterKey(['decrypt']);
    const dataKey = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(managedFile.key_wrap_iv) },
      master,
      fromBase64(managedFile.encrypted_data_key)
    );

    await audit(base44, user, managedFile, 'key_unwrap', true);

    return Response.json({
      encrypted: true,
      raw_key_b64: toBase64(dataKey),
      file_url: managedFile.file_url,
      download_filename: managedFile.download_filename,
      mime_type: managedFile.mime_type || 'application/octet-stream',
      encryption_iv: managedFile.encryption_iv,
      encryption_algorithm: managedFile.encryption_algorithm,
      plaintext_sha256: managedFile.plaintext_sha256 || null
    });
  } catch (error) {
    try {
      const base44 = createClientFromRequest(req);
      const user = await base44.auth.me().catch(() => null);
      await audit(base44, user, managedFile, 'error', false, error.message);
    } catch {
      // Best-effort audit only.
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});
