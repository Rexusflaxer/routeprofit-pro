import { objectCoordinatePair } from "@/lib/coordinates";

export const OBJECT_TYPE_OPTIONS = [
  { key: "office", label: "Kantoor / bedrijfspand", description: "Kantoor, hoofdkantoor of algemeen bedrijfspand." },
  { key: "retail_hospitality", label: "Winkel / horeca", description: "Filiaal, winkelcentrum, hotel of horecalocatie." },
  { key: "industrial_logistics", label: "Industrie / logistiek", description: "Productie, magazijn, distributie of logistiek terrein." },
  { key: "construction_site", label: "Bouwplaats / terrein", description: "Tijdelijk of permanent buitenterrein en bouwlocatie." },
  { key: "healthcare_education", label: "Zorg / onderwijs", description: "Zorginstelling, school, campus of opleidingslocatie." },
  { key: "residential", label: "Woonobject", description: "Wooncomplex, appartementen of beheerde woonlocatie." },
  { key: "event_temporary", label: "Evenement / tijdelijk", description: "Evenemententerrein of tijdelijke beveiligingslocatie." },
  { key: "parking", label: "Parkeerlocatie", description: "Parkeergarage, parkeerterrein of mobiliteitshub." },
  { key: "other", label: "Anders", description: "Een ander type fysieke beveiligingslocatie." },
];

const OBJECT_TYPE_LABELS = Object.fromEntries(OBJECT_TYPE_OPTIONS.map(option => [option.key, option.label]));

export function objectTypeLabel(value) {
  return OBJECT_TYPE_LABELS[value] || "Nog niet bepaald";
}

export function objectStatus(object = {}) {
  if (object.status) return object.status;
  if (object.is_active_customer_object === false || object.is_active === false) return "inactive";
  return "active";
}

export function objectAttentionItems(object = {}) {
  const items = [];
  if (!object.address) items.push("Locatie ontbreekt");
  else if (object.geocoding_status !== "verified" || !objectCoordinatePair(object)) {
    items.push("Locatie controleren");
  }
  if (objectStatus(object) === "concept") items.push("Object inrichten");
  return [...new Set(items)];
}

function normalized(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findPotentialObjectDuplicates(objects = [], candidate = {}) {
  const code = normalized(candidate.object_code).replaceAll(" ", "");
  const name = normalized(candidate.name);
  const address = normalized(candidate.address);

  return objects.filter(object => {
    const existingCode = normalized(object.object_code).replaceAll(" ", "");
    if (code && existingCode === code) return true;
    const sameName = name && normalized(object.name) === name;
    const sameAddress = address && normalized(object.address) === address;
    return sameName || sameAddress;
  });
}

export function objectMatchesSearch(object = {}, query = "") {
  const term = normalized(query);
  if (!term) return true;
  return [
    object.object_code,
    object.external_object_code,
    object.name,
    object.address,
    object.city,
    object.region,
    objectTypeLabel(object.object_type),
  ].some(value => normalized(value).includes(term));
}
