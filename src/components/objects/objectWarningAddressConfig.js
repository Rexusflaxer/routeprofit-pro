export const OBJECT_CARD_TABS = [
  { key: "tasks", label: "Taken" },
  { key: "security-plan", label: "Beveiligingsplan" },
  { key: "floor-plan", label: "Plattegrond" },
  { key: "warning-addresses", label: "Waarschuwingsadressen" },
  { key: "relationships", label: "Relaties" },
  { key: "keys", label: "Sleutels" },
  { key: "installations", label: "Installaties" },
  { key: "logbook", label: "Logboek" },
];

export const WARNING_RELATIONSHIP_OPTIONS = [
  {
    key: "keyholder",
    label: "Sleutelhouder",
    description: "Heeft toegang tot sleutels of kan het object openen.",
  },
  {
    key: "object_manager",
    label: "Objectbeheerder",
    description: "Is operationeel verantwoordelijk voor deze locatie.",
  },
  {
    key: "facility_manager",
    label: "Facilitair verantwoordelijke",
    description: "Beheert gebouw, terrein of facilitaire voorzieningen.",
  },
  {
    key: "owner_director",
    label: "Eigenaar / directie",
    description: "Is eindverantwoordelijk namens de klant.",
  },
  {
    key: "alarm_contact",
    label: "Alarmcontact",
    description: "Wordt bij alarm of calamiteit gewaarschuwd.",
  },
  {
    key: "emergency_service",
    label: "Storings- of nooddienst",
    description: "Externe dienst voor technische of operationele opvolging.",
  },
  {
    key: "other",
    label: "Anders",
    description: "Leg een andere relatie met het object vast.",
  },
];

export const AVAILABILITY_OPTIONS = [
  {
    key: "always",
    label: "Altijd bellen",
    description: "Deze contactpersoon mag 24 uur per dag worden gebeld.",
  },
  {
    key: "not_call_periods",
    label: "Niet-bellenperiode",
    description: "Leg vast op welke dagen en tijden niet gebeld mag worden.",
  },
  {
    key: "schedule",
    label: "Weekrooster",
    description: "Teken bereikbaarheid en momenten voor alleen noodgevallen.",
  },
];

export const WEEKDAY_OPTIONS = [
  { key: "mon", shortLabel: "Ma", label: "Maandag" },
  { key: "tue", shortLabel: "Di", label: "Dinsdag" },
  { key: "wed", shortLabel: "Wo", label: "Woensdag" },
  { key: "thu", shortLabel: "Do", label: "Donderdag" },
  { key: "fri", shortLabel: "Vr", label: "Vrijdag" },
  { key: "sat", shortLabel: "Za", label: "Zaterdag" },
  { key: "sun", shortLabel: "Zo", label: "Zondag" },
];

const RELATIONSHIP_LABELS = Object.fromEntries(
  WARNING_RELATIONSHIP_OPTIONS.map(option => [option.key, option.label]),
);

export function warningRelationshipLabel(record) {
  return record?.relationship_label
    || RELATIONSHIP_LABELS[record?.relationship_type]
    || "Waarschuwingscontact";
}

export function warningAvailabilityLabel(record) {
  if (record?.availability_mode === "schedule") return "Weekrooster";
  return record?.availability_mode === "not_call_periods" ? "Aangepast" : "24 uur bereikbaar";
}

export function formatObjectLogValue(value) {
  if (value === null || value === undefined || value === "") return "Niet ingesteld";
  if (typeof value === "boolean") return value ? "Ja" : "Nee";
  if (Array.isArray(value)) return value.join(", ") || "Niet ingesteld";
  if (typeof value === "object") return "Gewijzigd";
  return String(value);
}