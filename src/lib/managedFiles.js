import { base44 } from "@/api/base44Client";

const MIME_EXTENSION = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx"
};

const ENCRYPTED_STORAGE_MIME = "application/octet-stream";

const OWNER_ROOTS = {
  company: "companies",
  personnel: "personnel",
  customer: "customers",
  object: "objects",
  route: "routes",
  vehicle: "vehicles",
  system: "system"
};

export function createManagedUploadSession(prefix = "upload") {
  const random = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

function compact(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function ascii(value) {
  return compact(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function safeFilenamePart(value, fallback = "Document") {
  const clean = ascii(value)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+-\s+/g, " - ")
    .replace(/-+/g, "-")
    .trim();
  return clean || fallback;
}

function slug(value, fallback = "unknown") {
  const clean = ascii(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || fallback;
}

function getExtension(file) {
  const originalName = file?.name || "";
  const nameExt = originalName.includes(".") ? originalName.split(".").pop() : "";
  const cleanExt = String(nameExt || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10);
  return cleanExt || MIME_EXTENSION[file?.type] || "bin";
}

function trimFilename(base, extension) {
  const maxBaseLength = 150 - extension.length;
  const normalized = safeFilenamePart(base);
  return `${normalized.slice(0, maxBaseLength).replace(/\s+-?$/, "")}.${extension}`;
}

function buildDatePart({ validUntil, validFrom, effectiveDate }) {
  if (validUntil) return `geldig-tot-${validUntil}`;
  if (validFrom) return `vanaf-${validFrom}`;
  if (effectiveDate) return `datum-${effectiveDate}`;
  return null;
}

function buildFilename({
  ownerLabel,
  documentLabel,
  documentNumber,
  validFrom,
  validUntil,
  effectiveDate,
  version,
  extension
}) {
  const parts = [
    safeFilenamePart(ownerLabel, "Eigenaar"),
    safeFilenamePart(documentLabel, "Document"),
    documentNumber ? safeFilenamePart(documentNumber) : null,
    buildDatePart({ validUntil, validFrom, effectiveDate }),
    version && version > 1 ? `v${version}` : null
  ].filter(Boolean);

  return trimFilename(parts.join(" - "), extension);
}

function ownerFolder({ ownerType, ownerId, companyId, ownerLabel, uploadSessionId }) {
  const ownerRoot = OWNER_ROOTS[ownerType] || OWNER_ROOTS.system;
  const label = slug(ownerLabel, ownerType);
  const ownerKey = ownerId || uploadSessionId || "pending";

  if (ownerType === "company") {
    return `companies/${label}_${companyId || ownerId || ownerKey}`;
  }

  if (companyId) {
    return `companies/company-${companyId}/${ownerRoot}/${label}_${ownerKey}`;
  }

  if (uploadSessionId) {
    return `pending/${uploadSessionId}/${ownerRoot}/${label}`;
  }

  return `${ownerRoot}/${label}_${ownerKey}`;
}

function buildFolderPath({
  ownerType,
  ownerId,
  companyId,
  ownerLabel,
  uploadSessionId,
  domain,
  category,
  folderSegments = []
}) {
  const root = ownerFolder({ ownerType, ownerId, companyId, ownerLabel, uploadSessionId });
  const customSegments = folderSegments.filter(Boolean).map((segment) => slug(segment));

  if (customSegments.length) {
    return [root, ...customSegments].join("/");
  }

  return [root, slug(domain, "files"), slug(category, "documents")].join("/");
}

function containerKeys({ ownerType, ownerId, companyId, uploadSessionId }) {
  const tenantId = companyId || (ownerType === "company" ? ownerId : null);
  return {
    tenant_container_key: tenantId ? `company:${tenantId}` : `pending:${uploadSessionId || "unknown"}`,
    owner_container_key: ownerId ? `${ownerType}:${ownerId}` : `pending:${uploadSessionId || "unknown"}`
  };
}

function cloneFileWithName(file, filename) {
  if (typeof File === "undefined") return file;
  return new File([file], filename, {
    type: file.type,
    lastModified: file.lastModified
  });
}

function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Base64(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return bytesToBase64(digest);
}

function assertCryptoSupport() {
  if (!crypto?.subtle || typeof File === "undefined") {
    throw new Error("Deze browser ondersteunt beveiligde bestandsencryptie niet.");
  }
}

async function encryptFileForUpload({
  file,
  descriptor,
  ownerType,
  ownerId,
  companyId,
  sourceEntity,
  sourceEntityId,
  sourceField,
  category,
  domain
}) {
  assertCryptoSupport();

  const plaintext = await file.arrayBuffer();
  const dataKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const rawKey = await crypto.subtle.exportKey("raw", dataKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, dataKey, plaintext);
  const plaintextSha256 = await sha256Base64(plaintext);
  const ciphertextSha256 = await sha256Base64(ciphertext);

  const { data } = await base44.functions.invoke("wrapManagedFileKey", {
    raw_key_b64: bytesToBase64(rawKey),
    context: {
      owner_type: ownerType,
      owner_id: ownerId || null,
      company_id: companyId || null,
      tenant_container_key: descriptor.tenant_container_key,
      source_entity: sourceEntity,
      source_entity_id: sourceEntityId,
      source_field: sourceField,
      category,
      domain
    }
  });

  if (!data?.encrypted_data_key || !data?.key_wrap_iv) {
    throw new Error("Encryptiesleutel kon niet veilig worden gewrapt.");
  }

  const encryptedFilename = `${descriptor.download_filename}.enc`;
  const encryptedFile = new File([ciphertext], encryptedFilename, {
    type: ENCRYPTED_STORAGE_MIME,
    lastModified: file.lastModified
  });

  return {
    uploadFile: encryptedFile,
    encryption: {
      encrypted: true,
      encryption_algorithm: data.encryption_algorithm || "AES-256-GCM",
      encryption_key_id: data.encryption_key_id,
      encryption_iv: bytesToBase64(iv),
      encrypted_data_key: data.encrypted_data_key,
      key_wrap_algorithm: data.key_wrap_algorithm || "AES-256-GCM",
      key_wrap_iv: data.key_wrap_iv,
      plaintext_sha256: plaintextSha256,
      ciphertext_sha256: ciphertextSha256,
      ciphertext_size_bytes: ciphertext.byteLength,
      storage_filename: encryptedFilename,
      stored_mime_type: ENCRYPTED_STORAGE_MIME
    }
  };
}

async function decryptManagedFile({ fileUrl, rawKeyB64, ivB64, mimeType }) {
  assertCryptoSupport();
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Bestand kon niet worden opgehaald (${response.status}).`);
  }
  const ciphertext = await response.arrayBuffer();
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(rawKeyB64),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivB64) },
    key,
    ciphertext
  );
  return new Blob([plaintext], { type: mimeType || "application/octet-stream" });
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "document";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function triggerUrlDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  if (filename) a.download = filename;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function normalizeBlobMimeType(blob, mimeType) {
  if (!mimeType || blob.type === mimeType) return blob;
  return blob.slice(0, blob.size, mimeType);
}

async function createPlainManagedFilePreview({ fileUrl, filename, mimeType = null }) {
  if (!fileUrl) throw new Error("Geen bestand beschikbaar om te bekijken.");

  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Bestand kon niet worden opgehaald (${response.status}).`);
    }

    const blob = normalizeBlobMimeType(await response.blob(), mimeType);
    return {
      url: URL.createObjectURL(blob),
      blob,
      filename: filename || "document",
      mimeType: blob.type || mimeType || null,
      encrypted: false,
      revoke: true,
      external: false
    };
  } catch (error) {
    console.warn("Managed file preview fetch failed; falling back to source URL:", error);
    return {
      url: fileUrl,
      blob: null,
      filename: filename || "document",
      mimeType,
      encrypted: false,
      revoke: false,
      external: true
    };
  }
}

function buildDescriptor(input) {
  const {
    file,
    ownerType,
    ownerId = null,
    companyId = null,
    uploadSessionId = null,
    ownerLabel,
    domain,
    category,
    documentLabel,
    documentNumber = null,
    validFrom = null,
    validUntil = null,
    effectiveDate = null,
    folderSegments = [],
    version = 1
  } = input;

  const extension = getExtension(file);
  const displayFilename = buildFilename({
    ownerLabel,
    documentLabel,
    documentNumber,
    validFrom,
    validUntil,
    effectiveDate,
    version,
    extension
  });
  const folderPath = buildFolderPath({
    ownerType,
    ownerId,
    companyId,
    ownerLabel,
    uploadSessionId,
    domain,
    category,
    folderSegments
  });

  return {
    extension,
    display_filename: displayFilename,
    download_filename: displayFilename,
    folder_path: folderPath,
    logical_path: `${folderPath}/${displayFilename}`,
    ...containerKeys({ ownerType, ownerId, companyId, uploadSessionId })
  };
}

export function buildManagedFileDescriptor(input) {
  const fallbackName = input.filename || input.downloadFilename || "document.bin";
  return buildDescriptor({
    ...input,
    file: input.file || {
      name: fallbackName,
      type: input.mimeType || null
    }
  });
}

function sensitivityDefaults(isSensitive) {
  return {
    access_scope: isSensitive ? "company" : "company",
    security_classification: isSensitive ? "strictly_confidential" : "internal"
  };
}

export async function uploadManagedFile(input) {
  const {
    file,
    ownerType,
    ownerId = null,
    companyId = null,
    uploadSessionId = null,
    ownerLabel,
    domain,
    category,
    sourceEntity = null,
    sourceEntityId = null,
    sourceField = null,
    documentLabel,
    documentNumber = null,
    validFrom = null,
    validUntil = null,
    effectiveDate = null,
    isSensitive = false,
    retentionUntil = null,
    metadata = {},
    folderSegments = [],
    version = 1
  } = input;

  const descriptor = buildDescriptor({
    file,
    ownerType,
    ownerId,
    companyId,
    uploadSessionId,
    ownerLabel,
    domain,
    category,
    documentLabel,
    documentNumber,
    validFrom,
    validUntil,
    effectiveDate,
    folderSegments,
    version
  });

  let uploadFile = cloneFileWithName(file, descriptor.download_filename);
  let encryption = {
    encrypted: false,
    encryption_algorithm: null,
    encryption_key_id: null,
    encryption_iv: null,
    encrypted_data_key: null,
    key_wrap_algorithm: null,
    key_wrap_iv: null,
    plaintext_sha256: null,
    ciphertext_sha256: null,
    ciphertext_size_bytes: null,
    storage_filename: descriptor.download_filename,
    stored_mime_type: file.type || null
  };

  if (isSensitive) {
    const encrypted = await encryptFileForUpload({
      file,
      descriptor,
      ownerType,
      ownerId,
      companyId,
      sourceEntity,
      sourceEntityId,
      sourceField,
      category,
      domain
    });
    uploadFile = encrypted.uploadFile;
    encryption = encrypted.encryption;
  }

  const { file_url } = await base44.integrations.Core.UploadFile({ file: uploadFile });
  const security = sensitivityDefaults(isSensitive);

  const managed = await base44.entities.ManagedFile.create({
    owner_type: ownerType,
    owner_id: ownerId || null,
    company_id: companyId || (ownerType === "company" ? ownerId : null) || null,
    upload_session_id: uploadSessionId || null,
    tenant_container_key: descriptor.tenant_container_key,
    owner_container_key: descriptor.owner_container_key,
    access_scope: security.access_scope,
    domain,
    category,
    source_entity: sourceEntity,
    source_entity_id: sourceEntityId,
    source_field: sourceField,
    file_url,
    storage_filename: encryption.storage_filename,
    original_filename: file.name || null,
    display_filename: descriptor.display_filename,
    download_filename: descriptor.download_filename,
    logical_path: descriptor.logical_path,
    folder_path: descriptor.folder_path,
    extension: descriptor.extension,
    mime_type: file.type || null,
    stored_mime_type: encryption.stored_mime_type,
    size_bytes: typeof file.size === "number" ? file.size : null,
    ciphertext_size_bytes: encryption.ciphertext_size_bytes,
    encrypted: encryption.encrypted,
    encryption_algorithm: encryption.encryption_algorithm,
    encryption_key_id: encryption.encryption_key_id,
    encryption_iv: encryption.encryption_iv,
    encrypted_data_key: encryption.encrypted_data_key,
    key_wrap_algorithm: encryption.key_wrap_algorithm,
    key_wrap_iv: encryption.key_wrap_iv,
    plaintext_sha256: encryption.plaintext_sha256,
    ciphertext_sha256: encryption.ciphertext_sha256,
    document_label: documentLabel || null,
    document_number: documentNumber || null,
    valid_from: validFrom || null,
    valid_until: validUntil || null,
    status: "active",
    version,
    is_sensitive: !!isSensitive,
    security_classification: security.security_classification,
    retention_until: retentionUntil || null,
    uploaded_at: new Date().toISOString(),
    uploaded_by: null,
    metadata: {
      ...metadata,
      owner_label: ownerLabel || null,
      commercial_container_policy: "company-scoped-managed-files-v1",
      encryption_policy: isSensitive ? "client-side-file-encryption-v1" : "not-required",
      folder_segments: folderSegments
    }
  });

  return {
    file_url,
    managed_file_id: managed.id,
    display_filename: managed.display_filename,
    download_filename: managed.download_filename,
    logical_path: managed.logical_path,
    folder_path: managed.folder_path,
    managed_file: managed
  };
}

export async function prepareManagedFilePreview({ managedFileId, fileUrl = null, filename = "document" }) {
  if (!managedFileId) {
    return createPlainManagedFilePreview({ fileUrl, filename });
  }

  const { data } = await base44.functions.invoke("unwrapManagedFileKey", {
    managed_file_id: managedFileId
  });

  if (!data) throw new Error("Bestand kon niet worden voorbereid voor weergave.");

  const resolvedFilename = data.download_filename || filename || "document";
  const resolvedMimeType = data.mime_type || null;

  if (!data.encrypted) {
    return createPlainManagedFilePreview({
      fileUrl: data.file_url || fileUrl,
      filename: resolvedFilename,
      mimeType: resolvedMimeType
    });
  }

  const blob = await decryptManagedFile({
    fileUrl: data.file_url,
    rawKeyB64: data.raw_key_b64,
    ivB64: data.encryption_iv,
    mimeType: resolvedMimeType
  });

  return {
    url: URL.createObjectURL(blob),
    blob,
    filename: resolvedFilename,
    mimeType: blob.type || resolvedMimeType,
    encrypted: true,
    revoke: true,
    external: false
  };
}

export function revokeManagedFilePreview(preview) {
  if (preview?.revoke && preview.url) {
    URL.revokeObjectURL(preview.url);
  }
}

export function downloadBlob(blob, filename = "document") {
  if (!blob) return;
  triggerBlobDownload(blob, filename);
}

export async function downloadManagedFile({ managedFileId, fileUrl = null, filename = "document" }) {
  try {
    if (!managedFileId) {
      if (!fileUrl) throw new Error("Geen bestand beschikbaar om te downloaden.");
      triggerUrlDownload(fileUrl, filename);
      return;
    }

    const { data } = await base44.functions.invoke("unwrapManagedFileKey", {
      managed_file_id: managedFileId
    });

    if (!data) throw new Error("Bestand kon niet worden voorbereid voor download.");

    if (!data.encrypted) {
      triggerUrlDownload(data.file_url || fileUrl, data.download_filename || filename);
      return;
    }

    const blob = await decryptManagedFile({
      fileUrl: data.file_url,
      rawKeyB64: data.raw_key_b64,
      ivB64: data.encryption_iv,
      mimeType: data.mime_type
    });
    triggerBlobDownload(blob, data.download_filename || filename);
  } catch (error) {
    console.error("Managed file download failed:", error);
    if (typeof window !== "undefined") {
      window.alert(error?.message || "Bestand kon niet veilig worden gedownload.");
    }
  }
}

export async function updateManagedFileSource(fileId, updates = {}) {
  if (!fileId) return null;
  return base44.entities.ManagedFile.update(fileId, updates);
}

export async function attachManagedFilesToOwner({
  uploadSessionId,
  ownerType,
  ownerId,
  companyId = null,
  ownerLabel = null
}) {
  if (!uploadSessionId || !ownerId) return [];
  const files = await base44.entities.ManagedFile.filter({ upload_session_id: uploadSessionId });

  return Promise.all(files.map((file) => {
    const merged = {
      ...file,
      owner_type: ownerType || file.owner_type,
      owner_id: ownerId,
      company_id: companyId || file.company_id || (ownerType === "company" ? ownerId : null),
      ownerLabel: ownerLabel || file.metadata?.owner_label || file.display_filename
    };
    const descriptor = buildDescriptor({
      file: { name: file.original_filename || file.download_filename, type: file.mime_type, size: file.size_bytes },
      ownerType: merged.owner_type,
      ownerId: merged.owner_id,
      companyId: merged.company_id,
      uploadSessionId,
      ownerLabel: merged.ownerLabel,
      domain: file.domain,
      category: file.category,
      documentLabel: file.document_label,
      documentNumber: file.document_number,
      validFrom: file.valid_from,
      validUntil: file.valid_until,
      folderSegments: file.metadata?.folder_segments || [],
      version: file.version || 1
    });
    const keys = containerKeys({
      ownerType: merged.owner_type,
      ownerId: merged.owner_id,
      companyId: merged.company_id,
      uploadSessionId
    });

    const updatePayload = {
      owner_type: merged.owner_type,
      owner_id: merged.owner_id,
      company_id: merged.company_id,
      tenant_container_key: keys.tenant_container_key,
      owner_container_key: keys.owner_container_key,
      folder_path: descriptor.folder_path,
      logical_path: `${descriptor.folder_path}/${file.download_filename}`,
      metadata: {
        ...(file.metadata || {}),
        attached_at: new Date().toISOString(),
        attached_owner_id: ownerId
      }
    };

    return base44.entities.ManagedFile.update(file.id, updatePayload)
      .then((updated) => updated || { ...file, ...updatePayload });
  }));
}
