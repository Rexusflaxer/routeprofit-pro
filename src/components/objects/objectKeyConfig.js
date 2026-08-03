export const OBJECT_KEY_TYPES = [
  { value: "key", label: "Sleutel", description: "Mechanische of elektronische sleutel." },
  { value: "tag", label: "Tag", description: "Druppel, key fob of RFID-tag." },
  { value: "remote", label: "Afstandsbediening", description: "Handzender voor poort, hek of deur." },
  { value: "access_card", label: "Toegangspas", description: "Fysieke pas of kaartcredential." },
];

export const KEY_BRANDS = {
  key: ["ASSA ABLOY", "DOM", "dormakaba", "CES", "EVVA", "M&C", "Nemef", "iLOQ"],
  tag: ["iLOQ", "SALTO", "DOM", "HID", "Paxton", "Nedap", "dormakaba"],
  remote: ["FAAC", "Hörmann", "Nice", "BFT", "CAME", "Somfy"],
  access_card: ["HID", "SALTO", "Paxton", "Nedap", "dormakaba", "ASSA ABLOY", "DOM"],
};

export const OBJECT_KEY_STATUS_OPTIONS = [
  { value: "in_storage", label: "In beheer", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  { value: "missing", label: "Vermist", tone: "bg-destructive/10 text-destructive" },
  { value: "out_of_service", label: "Buiten gebruik", tone: "bg-muted text-muted-foreground" },
];

export const keyTypeLabel = value => OBJECT_KEY_TYPES.find(option => option.value === value)?.label || "Sleutel";
export const objectKeyStatus = status => OBJECT_KEY_STATUS_OPTIONS.find(option => option.value === status) || OBJECT_KEY_STATUS_OPTIONS[0];