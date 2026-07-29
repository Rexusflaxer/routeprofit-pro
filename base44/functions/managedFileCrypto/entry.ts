// base44/functions/_shared/managedFileCrypto/unwrapManagedFileKey.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function fromBase64(value) {
  const binary = atob(value || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function toBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}
async function importMasterKey(usage) {
  const raw = Deno.env.get("MANAGED_FILE_MASTER_KEY_B64");
  if (!raw) {
    throw new Error("MANAGED_FILE_MASTER_KEY_B64 is niet geconfigureerd.");
  }
  const bytes = fromBase64(raw);
  if (bytes.byteLength !== 32) {
    throw new Error("MANAGED_FILE_MASTER_KEY_B64 moet exact 32 bytes base64 bevatten.");
  }
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, usage);
}
async function audit(base44, user, file, action, success, reason = null) {
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
async function handleUnwrapManagedFileKey(req) {
  let managedFile = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") {
      return Response.json({ error: "Bestand niet gevonden" }, { status: 404 });
    }
    const body = await req.json();
    const managedFileId = body.managed_file_id;
    if (!managedFileId) return Response.json({ error: "managed_file_id is verplicht" }, { status: 400 });
    managedFile = await base44.asServiceRole.entities.ManagedFile.get(managedFileId);
    if (!managedFile) return Response.json({ error: "ManagedFile niet gevonden" }, { status: 404 });
    let resolvedFileUrl = managedFile.file_url;
    if (managedFile.file_uri) {
      const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
        file_uri: managedFile.file_uri,
        expires_in: 120
      });
      resolvedFileUrl = signed.signed_url;
    }
    if (!managedFile.encrypted) {
      await audit(base44, user, managedFile, "download", true, "plaintext_legacy_file");
      return Response.json({
        encrypted: false,
        file_url: resolvedFileUrl,
        expires_in: managedFile.file_uri ? 120 : null,
        download_filename: managedFile.download_filename,
        mime_type: managedFile.mime_type || "application/octet-stream"
      });
    }
    if (!managedFile.encrypted_data_key || !managedFile.key_wrap_iv || !managedFile.encryption_iv) {
      await audit(base44, user, managedFile, "access_denied", false, "missing_encryption_metadata");
      return Response.json({ error: "Encryptiemetadata ontbreekt." }, { status: 409 });
    }
    const master = await importMasterKey(["decrypt"]);
    const dataKey = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(managedFile.key_wrap_iv) },
      master,
      fromBase64(managedFile.encrypted_data_key)
    );
    await audit(base44, user, managedFile, "key_unwrap", true);
    return Response.json({
      encrypted: true,
      raw_key_b64: toBase64(dataKey),
      file_url: resolvedFileUrl,
      expires_in: managedFile.file_uri ? 120 : null,
      download_filename: managedFile.download_filename,
      mime_type: managedFile.mime_type || "application/octet-stream",
      encryption_iv: managedFile.encryption_iv,
      encryption_algorithm: managedFile.encryption_algorithm,
      plaintext_sha256: managedFile.plaintext_sha256 || null
    });
  } catch (error) {
    try {
      const base44 = createClientFromRequest(req);
      const user = await base44.auth.me().catch(() => null);
      if (user?.role === "admin") {
        await audit(
          base44,
          user,
          managedFile,
          "error",
          false,
          error instanceof Error ? error.message : String(error)
        );
      }
    } catch {
    }
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

// base44/functions/_shared/managedFileCrypto/wrapManagedFileKey.ts
import { createClientFromRequest as createClientFromRequest2 } from "npm:@base44/sdk@0.8.31";
function nowIso2() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function fromBase642(value) {
  const binary = atob(value || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function toBase642(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function masterKeyId() {
  return Deno.env.get("MANAGED_FILE_MASTER_KEY_ID") || "managed-file-master-v1";
}
async function importMasterKey2(usage) {
  const raw = Deno.env.get("MANAGED_FILE_MASTER_KEY_B64");
  if (!raw) {
    throw new Error("MANAGED_FILE_MASTER_KEY_B64 is niet geconfigureerd.");
  }
  const bytes = fromBase642(raw);
  if (bytes.byteLength !== 32) {
    throw new Error("MANAGED_FILE_MASTER_KEY_B64 moet exact 32 bytes base64 bevatten.");
  }
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, usage);
}
async function audit2(base44, user, body, success, reason = null) {
  await base44.asServiceRole.entities.ManagedFileAccessLog.create({
    managed_file_id: body.managed_file_id || null,
    action: success ? "key_wrap" : "error",
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
    created_at: nowIso2(),
    metadata: {
      encryption_algorithm: "AES-256-GCM",
      key_wrap_algorithm: "AES-256-GCM",
      key_id: masterKeyId()
    }
  });
}
async function handleWrapManagedFileKey(req) {
  let body = {};
  try {
    const base44 = createClientFromRequest2(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") {
      return Response.json({ error: "Alleen backofficebeheerders hebben toegang" }, { status: 403 });
    }
    body = await req.json();
    const rawKeyB64 = body.raw_key_b64;
    if (!rawKeyB64) return Response.json({ error: "raw_key_b64 is verplicht" }, { status: 400 });
    const dataKey = fromBase642(rawKeyB64);
    if (dataKey.byteLength !== 32) {
      await audit2(base44, user, body, false, "invalid_data_key_length");
      return Response.json({ error: "Data key moet exact 32 bytes zijn." }, { status: 400 });
    }
    const master = await importMasterKey2(["encrypt"]);
    const wrapIv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv: wrapIv }, master, dataKey);
    await audit2(base44, user, body, true);
    return Response.json({
      encrypted_data_key: toBase642(wrapped),
      key_wrap_iv: toBase642(wrapIv),
      encryption_key_id: masterKeyId(),
      encryption_algorithm: "AES-256-GCM",
      key_wrap_algorithm: "AES-256-GCM"
    });
  } catch (error) {
    try {
      const base44 = createClientFromRequest2(req);
      const user = await base44.auth.me().catch(() => null);
      if (user?.role === "admin") {
        await audit2(base44, user, body, false, error instanceof Error ? error.message : String(error));
      }
    } catch {
    }
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

// base44/functions/managedFileCrypto/entry.ts
var HANDLERS = {
  wrap_key: handleWrapManagedFileKey,
  unwrap_key: handleUnwrapManagedFileKey
};
function json(data, status = 200) {
  return Response.json(data, { status });
}
Deno.serve(async (req) => {
  try {
    const body = await req.clone().json().catch(() => ({}));
    const action = String(body?.action || "");
    const handler = HANDLERS[action];
    if (!handler) {
      return json({
        error: "Onbekende bestandssleutelactie",
        allowed_actions: Object.keys(HANDLERS)
      }, 400);
    }
    return handler(req);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
