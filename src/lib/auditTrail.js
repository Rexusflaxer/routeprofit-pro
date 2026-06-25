function compact(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeInitials(value) {
  const raw = compact(value).replace(/\s+/g, "");
  const lettersOnly = raw.replace(/\./g, "");
  if (/^[A-Za-z]{2,5}$/.test(raw)) {
    return `${raw.toUpperCase().split("").join(".")}.`;
  }
  if (/^[A-Za-z]{2,5}$/.test(lettersOnly)) {
    return `${lettersOnly.toUpperCase().split("").join(".")}.`;
  }
  const clean = raw.replace(/\.+/g, ".");
  if (!clean) return "";
  return clean.endsWith(".") ? clean : `${clean}.`;
}

function initialsFromParts(parts) {
  const initials = parts
    .map(part => compact(part)[0])
    .filter(Boolean)
    .map(letter => letter.toUpperCase())
    .join(".");
  return initials ? `${initials}.` : "";
}

function isEmailLike(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(compact(value));
}

function normalizeEmail(value) {
  const clean = compact(value).toLowerCase();
  return isEmailLike(clean) ? clean : "";
}

function uniqueValues(values) {
  return [...new Set(values.map(compact).filter(Boolean))];
}

function actorEmailCandidates(actor) {
  if (!actor) return [];
  if (typeof actor === "string") return uniqueValues([normalizeEmail(actor)]);

  const metadata = actor.metadata || actor.document_metadata || actor.proof_metadata || {};
  return uniqueValues([
    actor.email,
    actor.user_email,
    actor.login_email,
    actor.linked_user_email,
    actor.work_email,
    actor.private_email,
    actor.created_by_email,
    actor.uploaded_by_email,
    actor.last_action_by_email,
    metadata.email,
    metadata.user_email,
    metadata.login_email,
    metadata.linked_user_email,
    metadata.created_by_email,
    metadata.uploaded_by_email,
    metadata.last_action_by_email,
    isEmailLike(actor.full_name) ? actor.full_name : "",
    isEmailLike(actor.display_name) ? actor.display_name : "",
    isEmailLike(actor.name) ? actor.name : "",
    isEmailLike(metadata.created_by_display) ? metadata.created_by_display : "",
    isEmailLike(metadata.last_action_by_display) ? metadata.last_action_by_display : "",
  ].map(normalizeEmail));
}

function asDirectory(actorDirectory) {
  if (!actorDirectory) return [];
  return Array.isArray(actorDirectory) ? actorDirectory : [actorDirectory];
}

function matchActorByEmail(email, actorDirectory) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  return asDirectory(actorDirectory).find(candidate => actorEmailCandidates(candidate).includes(normalizedEmail)) || null;
}

export function resolveAuditActor(actor, actorDirectory = []) {
  if (!actor) return actor;
  const normalizedActor = typeof actor === "string"
    ? { email: isEmailLike(actor) ? actor : null, full_name: isEmailLike(actor) ? "" : actor }
    : actor;

  for (const email of actorEmailCandidates(normalizedActor)) {
    const match = matchActorByEmail(email, actorDirectory);
    if (match) {
      return {
        ...normalizedActor,
        ...match,
        metadata: {
          ...(match.metadata || {}),
          ...(normalizedActor.metadata || {}),
        },
        email: normalizedActor.email || match.email || email,
      };
    }
  }

  return normalizedActor;
}

export function formatAuditActorLabel(actor, actorDirectory = []) {
  if (!actor) return "";

  const resolvedActor = resolveAuditActor(actor, actorDirectory);
  const metadata = resolvedActor.metadata || {};
  const explicitInitials = normalizeInitials(resolvedActor.initials || resolvedActor.initialen || metadata.initials || metadata.initialen);
  const explicitLastName = compact(
    resolvedActor.last_name ||
    resolvedActor.lastname ||
    resolvedActor.family_name ||
    resolvedActor.surname ||
    resolvedActor.achternaam ||
    metadata.last_name ||
    metadata.lastname ||
    metadata.family_name ||
    metadata.surname ||
    metadata.achternaam
  );

  if (explicitInitials && explicitLastName) {
    const prefix = compact(resolvedActor.name_prefix || resolvedActor.prefix || metadata.name_prefix || metadata.prefix);
    return `${explicitInitials} ${[prefix, explicitLastName].filter(Boolean).join(" ")}`;
  }

  const fullName = compact(
    resolvedActor.full_name ||
    resolvedActor.display_name ||
    resolvedActor.name ||
    [resolvedActor.first_name, resolvedActor.middle_name, resolvedActor.last_name].filter(Boolean).join(" ") ||
    metadata.full_name ||
    metadata.display_name ||
    metadata.name
  );

  if (fullName && !isEmailLike(fullName)) {
    const parts = fullName.split(" ").filter(Boolean);
    if (parts.length > 1) {
      const lastName = parts[parts.length - 1];
      const initials = initialsFromParts(parts.slice(0, -1));
      return initials ? `${initials} ${lastName}` : lastName;
    }
    return fullName;
  }

  return "";
}

export function buildAuditMetadata(actor, action = "toegevoegd", previous = {}, actorDirectory = []) {
  const previousMetadata = previous || {};
  const now = new Date().toISOString();
  const resolvedActor = resolveAuditActor(actor, actorDirectory);
  const actorLabel = formatAuditActorLabel(resolvedActor, actorDirectory) || "Onbekend";
  const actorId = actor?.id || actor?.user_id || actor?.uid || resolvedActor?.id || resolvedActor?.user_id || resolvedActor?.uid || null;
  const actorEmail = actorEmailCandidates(resolvedActor)[0] || actorEmailCandidates(actor)[0] || null;

  return {
    ...previousMetadata,
    created_by_display: previousMetadata.created_by_display || actorLabel,
    created_by_user_id: previousMetadata.created_by_user_id || actorId,
    created_by_email: previousMetadata.created_by_email || actorEmail,
    created_at: previousMetadata.created_at || now,
    last_action_type: action,
    last_action_by_display: actorLabel,
    last_action_by_user_id: actorId,
    last_action_by_email: actorEmail,
    last_action_at: now,
  };
}

export function getAuditActorLabel(record, actorDirectory = []) {
  const metadata = record?.metadata || record?.document_metadata || record?.proof_metadata || {};
  const emailCandidates = uniqueValues([
    metadata.last_action_by_email,
    metadata.created_by_email,
    metadata.uploaded_by_email,
    record?.last_action_by_email,
    record?.created_by_email,
    record?.uploaded_by_email,
    record?.uploaded_by,
    record?.created_by,
  ].map(normalizeEmail));

  for (const email of emailCandidates) {
    const label = formatAuditActorLabel({ email }, actorDirectory);
    if (label) return label;
  }

  const displayCandidates = uniqueValues([
    metadata.last_action_by_display,
    metadata.created_by_display,
    record?.uploaded_by_display,
    record?.created_by_display,
    record?.uploaded_by,
    record?.created_by
  ]);

  for (const displayValue of displayCandidates) {
    if (isEmailLike(displayValue)) {
      const label = formatAuditActorLabel({ email: displayValue }, actorDirectory);
      if (label) return label;
      continue;
    }
    return displayValue;
  }

  return "-";
}
