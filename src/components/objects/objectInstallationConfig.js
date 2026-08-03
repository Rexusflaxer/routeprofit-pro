export const INSTALLATION_TYPES = [
  { value: "alarm_system", label: "Alarminstallatie" },
  { value: "fire_alarm_system", label: "Brandmeldinstallatie" },
  { value: "camera_system", label: "Camerasysteem" },
  { value: "access_control", label: "Toegangscontrole" },
  { value: "intercom", label: "Intercom" },
  { value: "evacuation_alarm", label: "Ontruimingsalarminstallatie" },
  { value: "other", label: "Overig" },
];

export const INSTALLATION_STATUS = {
  active: { label: "Actief", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  inactive: { label: "Inactief", className: "border-border bg-muted text-muted-foreground" },
  maintenance: { label: "Onderhoud", className: "border-amber-200 bg-amber-50 text-amber-700" },
};

export const installationTypeLabel = installation => installation.custom_type
  || INSTALLATION_TYPES.find(type => type.value === installation.installation_type)?.label
  || "Overig";