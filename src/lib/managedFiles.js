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

  const uploadFile = cloneFileWithName(file, descriptor.download_filename);
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
    original_filename: file.name || null,
    display_filename: descriptor.display_filename,
    download_filename: descriptor.download_filename,
    logical_path: descriptor.logical_path,
    folder_path: descriptor.folder_path,
    extension: descriptor.extension,
    mime_type: file.type || null,
    size_bytes: typeof file.size === "number" ? file.size : null,
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
