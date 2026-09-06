import {
  Archive,
  CalendarDays,
  ContactRound,
  FileText,
  FolderOpen,
  History,
  LayoutDashboard,
  MapPinned,
  ScrollText,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { objectStatus, objectTypeLabel } from "@/components/customers/customerObjectConfig";
import { objectCoordinatePair } from "@/lib/coordinates";

export const OBJECT_DOSSIER_TABS = [
  { key: "overview", label: "Overzicht", icon: LayoutDashboard },
  { key: "details", label: "Objectgegevens", icon: MapPinned },
  { key: "contacts", label: "Contacten", icon: ContactRound },
  { key: "instructions", label: "Instructies", icon: ShieldCheck },
  { key: "planning", label: "Planning & taken", icon: CalendarDays },
  { key: "floorplans", label: "Plattegronden", icon: FolderOpen },
  { key: "reports", label: "Rapportages", icon: FileText },
  { key: "documents", label: "Documenten", icon: ScrollText },
  { key: "services", label: "Dienstverlening", icon: Settings2 },
  { key: "history", label: "Historie", icon: History },
  { key: "manage", label: "Beheer", icon: Archive },
];

export const OBJECT_STATUS_LABELS = {
  concept: "Concept",
  active: "Actief",
  inactive: "Inactief",
  archived: "Gearchiveerd",
};

export const OBJECT_STATUS_CLASSES = {
  concept: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  inactive: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  archived: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
};

export const GEOCODING_LABELS = {
  verified: "Adres geverifieerd",
  manual: "Handmatig geplaatst",
  unverified: "Locatie controleren",
};

export const GEOCODING_CLASSES = {
  verified: "border-emerald-200 bg-emerald-50 text-emerald-700",
  manual: "border-blue-200 bg-blue-50 text-blue-700",
  unverified: "border-amber-200 bg-amber-50 text-amber-700",
};

export const INSTRUCTION_FIELDS = [
  { key: "parking_instruction", label: "Parkeren", description: "Waar de medewerker veilig kan parkeren." },
  { key: "entry_instruction", label: "Aankomst en ingang", description: "Welke ingang en aankomstroute gebruikt wordt." },
  { key: "walking_instruction", label: "Looproute", description: "Operationele looproute op het terrein." },
  { key: "safety_notes", label: "Veiligheid", description: "Risico's en veiligheidsaandachtspunten." },
  { key: "object_notes", label: "Objectnotities", description: "Permanente interne objectinformatie." },
];

export const RESTRICTED_INSTRUCTION_FIELDS = [
  { key: "access_instruction", label: "Toegangsinformatie" },
  { key: "alarm_instruction", label: "Alarminformatie" },
  { key: "key_instruction", label: "Sleutelinformatie" },
];

export function getObjectStatus(object) {
  return objectStatus(object);
}

export function getObjectTypeLabel(value) {
  return objectTypeLabel(value);
}

export function objectHasCoordinates(object) {
  return Boolean(objectCoordinatePair(object));
}

export function objectInstructionCount(object) {
  return INSTRUCTION_FIELDS
    .filter(field => String(object?.[field.key] || "").trim()).length;
}

export function buildObjectReadiness({ object, scopedContacts = [], tasks = [], contractLines = [] }) {
  const coordinatesReady = objectHasCoordinates(object) && ["verified", "manual"].includes(object?.geocoding_status);
  const serviceReady = tasks.length > 0 || contractLines.some(line => ["active", "draft"].includes(line.status || "draft"));
  return [
    {
      key: "identity",
      label: "Basisgegevens",
      description: "Naam, type en adres zijn vastgelegd.",
      complete: Boolean(object?.name && object?.object_type && object?.address),
      tab: "details",
    },
    {
      key: "location",
      label: "Locatie gecontroleerd",
      description: "Het adres heeft een gecontroleerde kaartpositie.",
      complete: coordinatesReady,
      tab: "details",
    },
    {
      key: "contacts",
      label: "Operationeel contact",
      description: "Minstens één klantcontact is voor dit object beschikbaar.",
      complete: scopedContacts.length > 0,
      tab: "contacts",
    },
    {
      key: "instructions",
      label: "Instructies ingericht",
      description: "Minstens één operationele instructie is vastgelegd.",
      complete: objectInstructionCount(object) > 0,
      tab: "instructions",
    },
    {
      key: "service",
      label: "Dienstverlening gekoppeld",
      description: "Er is een taak of contractregel voor dit object.",
      complete: serviceReady,
      tab: "services",
    },
  ];
}

export function objectAddress(object) {
  if (String(object?.address || "").trim()) return object.address;
  const street = [object?.street_name, object?.house_number, object?.house_number_addition].filter(Boolean).join(" ");
  const city = [object?.postal_code, object?.city].filter(Boolean).join(" ");
  return [street, city, object?.country_name && object.country_name !== "Nederland" ? object.country_name : null]
    .filter(Boolean)
    .join(", ") || "Geen adres vastgelegd";
}
