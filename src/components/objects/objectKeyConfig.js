export const OBJECT_KEY_STATUS_OPTIONS = [
  { value: "in_storage", label: "In beheer", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  { value: "missing", label: "Vermist", tone: "bg-destructive/10 text-destructive" },
  { value: "out_of_service", label: "Buiten gebruik", tone: "bg-muted text-muted-foreground" },
];

export function objectKeyStatus(status) {
  return OBJECT_KEY_STATUS_OPTIONS.find(option => option.value === status) || OBJECT_KEY_STATUS_OPTIONS[0];
}