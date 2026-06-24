function compact(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeInitials(value) {
  const clean = compact(value).replace(/\s+/g, "").replace(/\.+/g, ".");
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

export function formatAuditActorLabel(actor) {
  if (!actor) return "";

  const metadata = actor.metadata || {};
  const explicitInitials = normalizeInitials(actor.initials || actor.initialen || metadata.initials || metadata.initialen);
  const explicitLastName = compact(
    actor.last_name ||
    actor.lastname ||
    actor.family_name ||
    actor.surname ||
    metadata.last_name ||
    metadata.lastname ||
    metadata.family_name ||
    metadata.surname
  );

  if (explicitInitials && explicitLastName) return `${explicitInitials} ${explicitLastName}`;

  const fullName = compact(
    actor.full_name ||
    actor.display_name ||
    actor.name ||
    [actor.first_name, actor.middle_name, actor.last_name].filter(Boolean).join(" ") ||
    metadata.full_name ||
    metadata.display_name ||
    metadata.name
  );

  if (fullName) {
    const parts = fullName.split(" ").filter(Boolean);
    if (parts.length > 1) {
      const lastName = parts[parts.length - 1];
      const initials = initialsFromParts(parts.slice(0, -1));
      return initials ? `${initials} ${lastName}` : lastName;
    }
    return fullName;
  }

  return compact(actor.email) || "";
}

export function buildAuditMetadata(actor, action = "toegevoegd", previous = {}) {
  const previousMetadata = previous || {};
  const now = new Date().toISOString();
  const actorLabel = formatAuditActorLabel(actor) || "Onbekend";
  const actorId = actor?.id || actor?.user_id || actor?.uid || null;
  const actorEmail = actor?.email || null;

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

export function getAuditActorLabel(record) {
  const metadata = record?.metadata || record?.document_metadata || record?.proof_metadata || {};
  return (
    metadata.last_action_by_display ||
    metadata.created_by_display ||
    record?.uploaded_by_display ||
    record?.created_by_display ||
    record?.uploaded_by ||
    record?.created_by ||
    "-"
  );
}
