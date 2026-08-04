export const INSTALLATION_TYPES = [
  { value: "alarm_system", label: "Alarminstallatie", description: "Inbraakdetectie, alarmsysteem of bedienpaneel." },
  { value: "fire_alarm_system", label: "Brandmeldinstallatie / BMC", description: "Brandmeldcentrale, detectie en eventuele doormelding." },
  { value: "evacuation_alarm", label: "Ontruimingsalarminstallatie", description: "Slow-whoop, bedienpaneel of ontruimingscentrale." },
  { value: "access_control", label: "Toegangscontrole", description: "Controller voor deuren, passen, tags of zones." },
  { value: "camera_system", label: "Camerasysteem", description: "CCTV, recorder, NVR of videomanagementsysteem." },
  { value: "intercom", label: "Intercom", description: "Deurintercom, spreek-luisterverbinding of centrale." },
  { value: "other", label: "Anders", description: "Leg een ander technisch beveiligingssysteem vast." },
];

export const INSTALLATION_BRANDS = {
  alarm_system: ["Ajax", "Alphatronics UNii", "Aritech ATS", "Bosch", "Honeywell Galaxy", "Jablotron", "RISCO", "Satel", "Siemens", "Texecom", "Vanderbilt"],
  fire_alarm_system: ["Bosch", "Esser", "Hertek", "Honeywell", "Notifier", "Siemens", "Sterling", "Viking"],
  evacuation_alarm: ["Bosch", "Esser", "Hertek", "Honeywell", "Notifier", "Siemens"],
  access_control: ["2N", "ASSA ABLOY", "HID", "Nedap", "Paxton", "SALTO", "Suprema"],
  camera_system: ["Axis", "Avigilon", "Bosch", "Dahua", "Hanwha", "Hikvision", "Milestone"],
  intercom: ["2N", "Akuvox", "Commend", "Hikvision", "Robin", "Siedle"],
  other: [],
};

export const INSTALLATION_CREDENTIAL_FIELDS = {
  alarm_system: [
    { key: "switching_code", label: "Schakelcode", description: "Code voor regulier in- en uitschakelen." },
    { key: "reset_code", label: "Resetcode", description: "Alleen vastleggen wanneer deze operationeel nodig is." },
  ],
  fire_alarm_system: [
    { key: "operator_code", label: "Bediencode", description: "Code voor bevoegde bediening van de centrale." },
    { key: "reset_code", label: "Resetcode", description: "Code voor herstel na verificatie volgens instructie." },
    { key: "service_code", label: "Servicecode", description: "Alleen als de beveiligingsorganisatie deze nodig heeft." },
  ],
  evacuation_alarm: [
    { key: "operator_code", label: "Bediencode", description: "Code voor bevoegde bediening." },
    { key: "service_code", label: "Servicecode", description: "Alleen vastleggen als deze operationeel nodig is." },
  ],
  access_control: [{ key: "service_code", label: "Beheer- of servicecode", description: "Geen persoonlijke pas-PIN of gebruikerscode." }],
  camera_system: [{ key: "service_code", label: "Servicecode", description: "Geen persoonlijk accountwachtwoord vastleggen." }],
  intercom: [{ key: "service_code", label: "Programmeer- of servicecode", description: "Alleen voor bevoegde operationele ondersteuning." }],
  other: [
    { key: "switching_code", label: "Schakelcode", description: "Optionele bediencode." },
    { key: "service_code", label: "Servicecode", description: "Optionele servicecode." },
  ],
};

export const INSTALLATION_LIFECYCLE_OPTIONS = [
  { value: "active", label: "Actief" },
  { value: "inactive", label: "Inactief" },
  { value: "decommissioned", label: "Buiten bedrijf" },
];

export const INSTALLATION_OPERATIONAL_OPTIONS = [
  { value: "unknown", label: "Nog niet gecontroleerd" },
  { value: "operational", label: "Bedrijfsvaardig" },
  { value: "fault", label: "Storing" },
  { value: "maintenance", label: "In onderhoud" },
];

export const INSTALLATION_STATUS = {
  unknown: { label: "Niet gecontroleerd", className: "border-border bg-muted text-muted-foreground" },
  operational: { label: "Bedrijfsvaardig", className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" },
  fault: { label: "Storing", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  maintenance: { label: "In onderhoud", className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300" },
};

export const INSTALLATION_LIFECYCLE_STATUS = {
  active: null,
  inactive: { label: "Inactief", className: "border-border bg-muted text-muted-foreground" },
  decommissioned: { label: "Buiten bedrijf", className: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" },
};

export const installationStatus = installation => INSTALLATION_LIFECYCLE_STATUS[installation.lifecycle_status]
  || INSTALLATION_STATUS[installation.operational_status]
  || INSTALLATION_STATUS.unknown;

export const installationTypeLabel = installation => installation.custom_type
  || INSTALLATION_TYPES.find(type => type.value === installation.installation_type)?.label
  || "Overig";

export const installationCredentialLabel = type => Object.values(INSTALLATION_CREDENTIAL_FIELDS).flat().find(item => item.key === type)?.label || "Beveiligde code";