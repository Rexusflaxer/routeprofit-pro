import {
  CalendarDays,
  CheckSquare2,
  PackageCheck,
  PackageOpen,
  SearchCheck,
  UsersRound,
} from "lucide-react";

export const OBJECT_MODULE_CATALOG = [
  {
    key: "visitor_registration",
    label: "Bezoekersregistratie",
    shortLabel: "Bezoekers",
    icon: UsersRound,
    description: "Registreer verwachte, aanwezige en vertrokken bezoekers met een controleerbare check-in en check-out.",
    defaultRetentionDays: 90,
  },
  {
    key: "item_issuance",
    label: "Middelenuitgifte",
    shortLabel: "Uitgifte",
    icon: PackageOpen,
    description: "Beheer een middelencatalogus, ontvangers, bevoegdheden, uitgiftevensters, retouren en afwijkingen.",
    defaultRetentionDays: 365,
  },
  {
    key: "mail_package_receipt",
    label: "Post- & pakketregistratie",
    shortLabel: "Post & pakketten",
    icon: PackageCheck,
    description: "Leg ontvangst, opslag, notificatie en gecontroleerde overdracht van post en pakketten vast.",
    defaultRetentionDays: 180,
  },
  {
    key: "lost_and_found",
    label: "Gevonden voorwerpen",
    shortLabel: "Gevonden",
    icon: SearchCheck,
    description: "Registreer gevonden eigendommen, bewaarlocatie, claimcontrole, overdracht en afloop.",
    defaultRetentionDays: 365,
  },
  {
    key: "object_calendar",
    label: "Objectagenda",
    shortLabel: "Agenda",
    icon: CalendarDays,
    description: "Plan objectafspraken, evenementen en reserveringen zonder deze met het beveiligingsrooster te vermengen.",
    defaultRetentionDays: 365,
  },
  {
    key: "action_points",
    label: "Actiepunten",
    shortLabel: "Acties",
    icon: CheckSquare2,
    description: "Beheer operationele actiepunten met eigenaar, prioriteit, deadline, opvolging en afrondbewijs.",
    defaultRetentionDays: 365,
  },
];

export const OBJECT_MODULE_TYPES = new Set(OBJECT_MODULE_CATALOG.map(item => item.key));

export const OBJECT_MODULE_FIELD_TYPES = [
  { value: "text", label: "Korte tekst" },
  { value: "textarea", label: "Lange tekst" },
  { value: "email", label: "E-mailadres" },
  { value: "phone", label: "Telefoonnummer" },
  { value: "number", label: "Getal" },
  { value: "date", label: "Datum" },
  { value: "time", label: "Tijd" },
  { value: "select", label: "Keuzelijst" },
  { value: "multiselect", label: "Meerkeuzelijst" },
  { value: "checkbox", label: "Ja / nee" },
  { value: "photo", label: "Foto" },
  { value: "signature", label: "Handtekening" },
];

export const OBJECT_MODULE_REFERENCE_TYPES = [
  { value: "person", label: "Personen" },
  { value: "employee", label: "Personeel" },
  { value: "room", label: "Kamers / ruimtes" },
  { value: "department", label: "Teams / afdelingen" },
  { value: "supplier", label: "Leveranciers" },
  { value: "host", label: "Contactpersonen / hosts" },
  { value: "recipient", label: "Ontvangers" },
  { value: "location", label: "Locaties" },
  { value: "resource", label: "Middelen" },
  { value: "other", label: "Andere keuzelijst" },
];

export const OBJECT_MODULE_RESPONSIBLE_ROLES = [
  { value: "object_manager", label: "Objectbeheerder" },
  { value: "facility_manager", label: "Facilitair verantwoordelijke" },
  { value: "security_coordinator", label: "Beveiligingscoordinator" },
  { value: "reception_lead", label: "Receptieverantwoordelijke" },
  { value: "operations", label: "Operationele planning" },
  { value: "other", label: "Andere verantwoordelijke" },
];

export const OBJECT_MODULE_WEEKDAYS = [
  { value: "mon", label: "Ma" },
  { value: "tue", label: "Di" },
  { value: "wed", label: "Wo" },
  { value: "thu", label: "Do" },
  { value: "fri", label: "Vr" },
  { value: "sat", label: "Za" },
  { value: "sun", label: "Zo" },
];

export const OBJECT_MODULE_STATUS = {
  concept: { label: "Concept", className: "border-slate-300/70 bg-slate-500/10 text-slate-700 dark:text-slate-200" },
  active: { label: "Actief", className: "border-emerald-300/70 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" },
  suspended: { label: "Gepauzeerd", className: "border-amber-300/70 bg-amber-500/10 text-amber-800 dark:text-amber-200" },
  archived: { label: "Gearchiveerd", className: "border-border bg-muted/40 text-muted-foreground" },
};

export const OBJECT_MODULE_REVISION_STATUS = {
  draft: { label: "Concept", className: OBJECT_MODULE_STATUS.concept.className },
  published: { label: "Gepubliceerd", className: OBJECT_MODULE_STATUS.active.className },
  superseded: { label: "Vervangen", className: "border-border bg-muted/40 text-muted-foreground" },
};

const DEFAULT_FIELDS = {
  visitor_registration: [
    ["visitor_name", "Naam bezoeker", "text", true],
    ["company", "Bedrijf", "text", false],
    ["host", "Contactpersoon / host", "select", false],
    ["arrival_at", "Aankomsttijd", "time", true],
    ["vehicle_plate", "Kenteken", "text", false],
  ],
  item_issuance: [
    ["issued_to", "Uitgegeven aan", "select", true],
    ["issued_at", "Uitgiftetijd", "time", true],
    ["expected_return_at", "Verwachte retourtijd", "time", false],
    ["purpose", "Reden van uitgifte", "textarea", false],
  ],
  mail_package_receipt: [
    ["recipient", "Ontvanger", "select", true],
    ["carrier", "Vervoerder", "select", false],
    ["received_at", "Ontvangsttijd", "time", true],
    ["storage_location", "Opslaglocatie", "select", false],
  ],
  lost_and_found: [
    ["description", "Omschrijving", "textarea", true],
    ["found_at", "Gevonden op", "date", true],
    ["found_location", "Vindplaats", "select", true],
    ["photo", "Foto", "photo", false],
  ],
  object_calendar: [
    ["title", "Titel", "text", true],
    ["starts_at", "Begint", "date", true],
    ["ends_at", "Eindigt", "date", true],
    ["location", "Locatie", "select", false],
  ],
  action_points: [
    ["title", "Actiepunt", "text", true],
    ["priority", "Prioriteit", "select", true, ["Laag", "Normaal", "Hoog", "Urgent"]],
    ["owner", "Eigenaar", "select", false],
    ["due_at", "Deadline", "date", false],
  ],
};

const REQUIRED_MODULE_FIELDS = Object.fromEntries(
  Object.entries(DEFAULT_FIELDS).map(([moduleType, fields]) => [
    moduleType,
    Object.fromEntries(fields.filter(([, , , required]) => required).map(([id, , fieldType]) => [id, fieldType])),
  ]),
);

export function createObjectModuleClientId(prefix = "module-item") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizedText(value) {
  return String(value ?? "").trim();
}

function defaultFieldDefinitions(moduleType) {
  return (DEFAULT_FIELDS[moduleType] || []).map(([key, label, fieldType, required, options = []], index) => ({
    id: key,
    label,
    field_type: fieldType,
    required,
    help_text: "",
    options,
    reference_list_id: null,
    sequence: index + 1,
    enabled: true,
  }));
}

function defaultWorkflowSettings(moduleType) {
  if (moduleType === "item_issuance") {
    return {
      allow_reservations: false,
      require_expected_return: true,
      require_condition_on_return: true,
      allow_authorized_override: false,
      block_critical_faults: true,
      default_due_minutes: 720,
    };
  }
  if (moduleType === "visitor_registration") return { allow_preregistration: true, require_host: false, maintain_evacuation_list: true, badge_enabled: false, automatic_checkout_minutes: 0 };
  if (moduleType === "mail_package_receipt") return { photo_on_receipt: false, require_recipient: true, pickup_proof: "none", reminders_enabled: true, office_hours_only: false };
  if (moduleType === "lost_and_found") return { require_photo: false, public_description_enabled: false, claim_verification_required: true, custody_tracking: true, disposal_approval_required: true };
  if (moduleType === "object_calendar") return { approval_required: false, conflict_detection: true, allow_recurring: true, reminders_enabled: true, default_duration_minutes: 60 };
  return { owner_required: true, due_date_required: false, completion_evidence_required: false, recurring_enabled: true, escalation_enabled: true };
}

export function emptyObjectModuleConfiguration(moduleType) {
  const definition = getObjectModuleDefinition(moduleType);
  return {
    summary: "",
    responsible_role: "object_manager",
    retention_days: definition?.defaultRetentionDays || 365,
    anonymize_after_retention: true,
    field_definitions: defaultFieldDefinitions(moduleType),
    reference_lists: [],
    catalog_items: [],
    availability_windows: [],
    authorization_rules: [],
    workflow_settings: defaultWorkflowSettings(moduleType),
    notification_settings: {
      enabled: false,
      channels: ["in_app"],
      reminder_minutes: [],
      escalation_role: null,
    },
  };
}

function normalizeFieldDefinition(field, index) {
  return {
    id: field?.id || createObjectModuleClientId("field"),
    label: String(field?.label || ""),
    field_type: OBJECT_MODULE_FIELD_TYPES.some(item => item.value === field?.field_type) ? field.field_type : "text",
    required: field?.required === true,
    help_text: String(field?.help_text || ""),
    options: Array.isArray(field?.options) ? field.options.map(String).map(value => value.trim()).filter(Boolean) : [],
    reference_list_id: field?.reference_list_id || null,
    sequence: index + 1,
    enabled: field?.enabled !== false && field?.active !== false,
  };
}

function normalizeReferenceList(list, index) {
  return {
    id: list?.id || createObjectModuleClientId("list"),
    name: String(list?.name || `Keuzelijst ${index + 1}`),
    subject_type: OBJECT_MODULE_REFERENCE_TYPES.some(item => item.value === list?.subject_type) ? list.subject_type : "other",
    description: String(list?.description || ""),
    entries: (Array.isArray(list?.entries) ? list.entries : []).map(entry => ({
      id: entry?.id || createObjectModuleClientId("entry"),
      label: String(entry?.label || ""),
      secondary_label: String(entry?.secondary_label || ""),
      external_reference: String(entry?.external_reference || ""),
      status: entry?.status === "inactive" || entry?.active === false ? "inactive" : "active",
    })),
    sequence: index + 1,
  };
}

function normalizeCatalogItem(item, index) {
  return {
    id: item?.id || createObjectModuleClientId("catalog"),
    name: String(item?.name || ""),
    code: String(item?.code || ""),
    category: String(item?.category || ""),
    description: String(item?.description || ""),
    tracking_mode: ["serialized", "quantity", "reference_only"].includes(item?.tracking_mode) ? item.tracking_mode : "serialized",
    quantity: Math.max(1, Number.parseInt(item?.quantity || "1", 10) || 1),
    expected_return_minutes: item?.expected_return_minutes == null || item.expected_return_minutes === ""
      ? null
      : Math.max(1, Number(item.expected_return_minutes) || 1),
    requires_authorization: item?.requires_authorization === true,
    eligibility_mode: item?.eligibility_mode === "allow_list" ? "allow_list" : "all",
    allowed_reference_entry_ids: Array.isArray(item?.allowed_reference_entry_ids) ? [...new Set(item.allowed_reference_entry_ids.filter(Boolean))] : [],
    denied_reference_entry_ids: Array.isArray(item?.denied_reference_entry_ids) ? [...new Set(item.denied_reference_entry_ids.filter(Boolean))] : [],
    availability_window_ids: Array.isArray(item?.availability_window_ids) ? [...new Set(item.availability_window_ids.filter(Boolean))] : [],
    status: item?.status === "inactive" || item?.active === false ? "inactive" : "active",
    sequence: index + 1,
  };
}

function normalizeAvailabilityWindow(window, index) {
  const days = Array.isArray(window?.days) ? window.days.filter(day => OBJECT_MODULE_WEEKDAYS.some(item => item.value === day)) : [];
  return {
    id: window?.id || createObjectModuleClientId("window"),
    name: String(window?.name || `Uitgiftevenster ${index + 1}`),
    days: [...new Set(days)],
    start_time: String(window?.start_time || "08:00"),
    end_time: String(window?.end_time || "18:00"),
  };
}

function normalizeAuthorizationRule(rule, index) {
  return {
    id: rule?.id || createObjectModuleClientId("rule"),
    name: String(rule?.name || `Bevoegdheidsregel ${index + 1}`),
    effect: rule?.effect === "deny" ? "deny" : "allow",
    catalog_item_ids: Array.isArray(rule?.catalog_item_ids) ? [...new Set(rule.catalog_item_ids.filter(Boolean))] : [],
    subject_entry_ids: Array.isArray(rule?.subject_entry_ids || rule?.reference_entry_ids) ? [...new Set((rule.subject_entry_ids || rule.reference_entry_ids).filter(Boolean))] : [],
    availability_window_ids: Array.isArray(rule?.availability_window_ids) ? [...new Set(rule.availability_window_ids.filter(Boolean))] : [],
    note: String(rule?.note || ""),
    status: rule?.status === "inactive" || rule?.active === false ? "inactive" : "active",
  };
}

export function normalizeObjectModuleConfiguration(moduleType, value) {
  const defaults = emptyObjectModuleConfiguration(moduleType);
  const source = value && typeof value === "object" ? value : {};
  return {
    summary: String(source.summary ?? defaults.summary),
    responsible_role: String(source.responsible_role || defaults.responsible_role),
    retention_days: Math.max(1, Number.parseInt(source.retention_days || defaults.retention_days, 10)),
    anonymize_after_retention: source.anonymize_after_retention !== false,
    field_definitions: (Array.isArray(source.field_definitions) ? source.field_definitions : defaults.field_definitions).map(normalizeFieldDefinition),
    reference_lists: (Array.isArray(source.reference_lists) ? source.reference_lists : defaults.reference_lists).map(normalizeReferenceList),
    catalog_items: (Array.isArray(source.catalog_items) ? source.catalog_items : defaults.catalog_items).map(normalizeCatalogItem),
    availability_windows: (Array.isArray(source.availability_windows) ? source.availability_windows : defaults.availability_windows).map(normalizeAvailabilityWindow),
    authorization_rules: (Array.isArray(source.authorization_rules) ? source.authorization_rules : defaults.authorization_rules).map(normalizeAuthorizationRule),
    workflow_settings: { ...defaults.workflow_settings, ...(source.workflow_settings || {}) },
    notification_settings: {
      ...defaults.notification_settings,
      ...(source.notification_settings || {}),
      channels: Array.isArray(source.notification_settings?.channels) ? source.notification_settings.channels : defaults.notification_settings.channels,
      reminder_minutes: Array.isArray(source.notification_settings?.reminder_minutes) ? source.notification_settings.reminder_minutes : defaults.notification_settings.reminder_minutes,
    },
  };
}

export function getObjectModuleDefinition(moduleOrType) {
  const key = typeof moduleOrType === "string" ? moduleOrType : moduleOrType?.module_type;
  return OBJECT_MODULE_CATALOG.find(item => item.key === key) || null;
}

export function objectModuleLabel(moduleOrType) {
  const module = typeof moduleOrType === "object" ? moduleOrType : null;
  return normalizedText(module?.display_name || module?.name) || getObjectModuleDefinition(moduleOrType)?.label || "Objectmodule";
}

export function objectModuleTypeLabel(moduleOrType) {
  return getObjectModuleDefinition(moduleOrType)?.label || "Andere module";
}

export function objectModuleStatus(value) {
  return OBJECT_MODULE_STATUS[value] || { label: value || "Onbekend", className: "border-border bg-muted/40 text-muted-foreground" };
}

export function objectModuleRevisionStatus(value) {
  return OBJECT_MODULE_REVISION_STATUS[value] || objectModuleStatus(value);
}

export function objectModuleReadiness(module, revision) {
  const configuration = normalizeObjectModuleConfiguration(module?.module_type, revision?.configuration || revision);
  const blocking = [];
  const warnings = [];
  if (!normalizedText(module?.display_name || module?.name)) blocking.push("Geef de module een herkenbare naam.");
  if (!configuration.field_definitions.some(field => field.enabled)) blocking.push("Activeer minimaal één registratieveld.");
  const enabledFields = new Map(configuration.field_definitions.filter(field => field.enabled).map(field => [field.id, field]));
  for (const [fieldId, expectedType] of Object.entries(REQUIRED_MODULE_FIELDS[module?.module_type] || {})) {
    const field = enabledFields.get(fieldId);
    if (!field) blocking.push("Een essentieel standaardveld is uitgeschakeld of verwijderd.");
    else if (!field.required || field.field_type !== expectedType) blocking.push(`${field.label} moet verplicht blijven en het oorspronkelijke invoertype behouden.`);
  }
  const invalidRequiredChoice = configuration.field_definitions.find(field => field.enabled && field.required && ["select", "multiselect"].includes(field.field_type) && !field.reference_list_id && !field.options.length);
  if (invalidRequiredChoice) blocking.push(`Koppel een keuzelijst of keuzes aan ${invalidRequiredChoice.label}.`);
  if (module?.module_type === "item_issuance") {
    if (!configuration.catalog_items.some(item => item.status === "active" && normalizedText(item.name) && normalizedText(item.code))) blocking.push("Voeg minimaal één actief middel met naam en unieke code aan de catalogus toe.");
    if (configuration.catalog_items.some(item => item.requires_authorization) && !configuration.authorization_rules.some(rule => rule.status === "active")) warnings.push("Bevoegdheidscontrole staat aan, maar er zijn nog geen regels ingericht.");
    if (!configuration.reference_lists.some(list => list.entries.some(entry => entry.status === "active"))) warnings.push("Voeg een lijst met personen, personeel, kamers of andere ontvangers toe.");
  }
  if (configuration.retention_days > 3650) warnings.push("De bewaartermijn is langer dan tien jaar. Controleer doel en grondslag.");
  return { blocking, warnings, ready: blocking.length === 0 };
}
