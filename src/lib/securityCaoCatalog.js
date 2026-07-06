export const CAO_OPTIONS = [
  { value: "cao_particuliere_beveiliging", label: "CAO Particuliere Beveiliging" },
  { value: "cao_evenementen_horecabeveiliging", label: "CAO Evenementen- en Horecabeveiliging" },
  { value: "cao_verkeersregelaars", label: "CAO Verkeersregelaars" },
  { value: "cao_veiligheidsdomein", label: "CAO Veiligheidsdomein" },
];

export const CAO_OPTION_LABELS = Object.fromEntries(CAO_OPTIONS.map(option => [option.value, option.label]));

export const WPBR_TYPES = [
  { key: "ND", label: "ND", desc: "Particuliere beveiligingsorganisatie" },
  { key: "HND", label: "HND", desc: "Particulier beveiligingsbedrijf alleen voor horecabeveiliging" },
  { key: "BD", label: "BD", desc: "Particuliere bedrijfsbeveiligingsdienst" },
  { key: "HBD", label: "HBD", desc: "Particuliere bedrijfsbeveiligingsdienst voor eigen horecaonderneming" },
  { key: "PAC", label: "PAC", desc: "Particuliere Alarmcentrale" },
  { key: "VTC", label: "VTC", desc: "Particuliere Video Toezicht Centrale" },
  { key: "PGW", label: "PGW", desc: "Particulier Geld- en Waardentransportbedrijf" },
  { key: "POB", label: "POB", desc: "Particulier Recherchebureau" },
];

export const WPBR_TYPE_LABELS = Object.fromEntries(WPBR_TYPES.map(type => [type.key, `${type.label} - ${type.desc}`]));

export const FUNCTION_LABELS = {
  unknown: "Onbekend",
  objectbeveiliger: "Objectbeveiliger",
  receptionist: "Receptionist",
  receptie: "Receptie",
  mobiel_surveillant: "Mobiel surveillant",
  surveillant: "Surveillant",
  alarmopvolging: "Alarmopvolging",
  winkelsurveillant: "Winkelsurveillant",
  centralist: "Centralist",
  centralist_pac: "Centralist PAC",
  centralist_vtc: "Centralist VTC",
  videosurveillant: "Videosurveillant",
  brandwacht: "Brandwacht",
  geld_waardetransporteur: "Geld- en waardetransporteur",
  waardetransport_chauffeur: "Chauffeur geld- en waardetransport",
  waardetransport_bijrijder: "Bijrijder geld- en waardetransport",
  particulier_onderzoeker: "Particulier onderzoeker",
  rechercheur: "Rechercheur",
  observant: "Observant",
  planner: "Planner",
  binnendienst: "Algemeen binnendienst",
  hr_manager: "HR-manager",
  sales_manager: "Sales manager",
  evenementenbeveiliger: "Evenementenbeveiliger",
  horecabeveiliger: "Horecabeveiliger",
  host: "Host / Hostess",
  verkeersregelaar: "Verkeersregelaar",
  toezichthouder: "Toezichthouder",
  handhaver: "Handhaver",
  boa: "BOA",
  installateur: "Installateur",
  klantrelatie: "Klantrelatie",
  other: "Overig",
};

export const FUNCTION_CATALOG_OPTIONS = Object.entries(FUNCTION_LABELS).map(([value, label]) => ({ value, label }));

const SUPPORT_FUNCTIONS = ["planner", "binnendienst"];
const OFFICE_FUNCTIONS = ["planner", "binnendienst", "hr_manager", "sales_manager"];

export const WPBR_ALLOWED_CAO_KEYS = {
  ND: ["cao_particuliere_beveiliging"],
  HND: ["cao_evenementen_horecabeveiliging", "cao_particuliere_beveiliging"],
  BD: ["cao_particuliere_beveiliging"],
  HBD: ["cao_evenementen_horecabeveiliging", "cao_particuliere_beveiliging"],
  PAC: ["cao_particuliere_beveiliging"],
  VTC: ["cao_particuliere_beveiliging"],
  PGW: ["cao_particuliere_beveiliging"],
  POB: ["cao_particuliere_beveiliging"],
};

export const WPBR_FUNCTION_GROUPS = {
  ND: [
    {
      key: "objectbeveiliging",
      label: "Objectbeveiliging",
      functions: ["objectbeveiliger", "receptionist", "mobiel_surveillant", "alarmopvolging", "winkelsurveillant", "brandwacht"],
    },
    { key: "ondersteuning", label: "Ondersteuning", functions: SUPPORT_FUNCTIONS },
  ],
  HND: [
    {
      key: "horeca_evenementen",
      label: "Horeca en evenementen",
      functions: ["horecabeveiliger", "evenementenbeveiliger", "host"],
    },
    { key: "ondersteuning", label: "Ondersteuning", functions: SUPPORT_FUNCTIONS },
  ],
  BD: [
    {
      key: "bedrijfsbeveiliging",
      label: "Bedrijfsbeveiliging",
      functions: ["objectbeveiliger", "receptionist", "mobiel_surveillant", "alarmopvolging", "brandwacht"],
    },
    { key: "ondersteuning", label: "Ondersteuning", functions: SUPPORT_FUNCTIONS },
  ],
  HBD: [
    {
      key: "eigen_horeca",
      label: "Eigen horecaonderneming",
      functions: ["horecabeveiliger", "host", "brandwacht"],
    },
    { key: "ondersteuning", label: "Ondersteuning", functions: SUPPORT_FUNCTIONS },
  ],
  PAC: [
    {
      key: "alarmcentrale",
      label: "Alarmcentrale",
      functions: ["centralist", "centralist_pac", "alarmopvolging"],
    },
    { key: "ondersteuning", label: "Ondersteuning", functions: SUPPORT_FUNCTIONS },
  ],
  VTC: [
    {
      key: "videotoezicht",
      label: "Videotoezichtcentrale",
      functions: ["centralist", "centralist_vtc", "videosurveillant", "toezichthouder"],
    },
    { key: "ondersteuning", label: "Ondersteuning", functions: SUPPORT_FUNCTIONS },
  ],
  PGW: [
    {
      key: "geld_waarde",
      label: "Geld- en waardetransport",
      functions: ["geld_waardetransporteur", "waardetransport_chauffeur", "waardetransport_bijrijder"],
    },
    { key: "ondersteuning", label: "Ondersteuning", functions: SUPPORT_FUNCTIONS },
  ],
  POB: [
    {
      key: "recherche",
      label: "Particuliere recherche",
      functions: ["particulier_onderzoeker", "rechercheur", "observant"],
    },
    { key: "ondersteuning", label: "Ondersteuning", functions: SUPPORT_FUNCTIONS },
  ],
};

export const DEFAULT_OFFICE_FUNCTIONS = OFFICE_FUNCTIONS;

export function uniqueStrings(values) {
  return [...new Set((values || []).map(value => String(value || "").trim()).filter(Boolean))];
}

export function functionLabel(value) {
  return FUNCTION_LABELS[value] || String(value || "").replace(/[_-]+/g, " ");
}

export function isExpiredWpbrLicense(license) {
  const today = new Date().toISOString().split("T")[0];
  return !!license?.valid_until && String(license.valid_until).slice(0, 10) < today;
}

export function getActiveWpbrLicenses(licenses = []) {
  return (licenses || []).filter(license =>
    license?.license_type &&
    license.status !== "superseded" &&
    license.status !== "expired" &&
    !isExpiredWpbrLicense(license)
  );
}

export function allowedCaoKeysForWpbrLicenses(licenses = []) {
  return uniqueStrings(getActiveWpbrLicenses(licenses).flatMap(license => WPBR_ALLOWED_CAO_KEYS[license.license_type] || []));
}

export function wpbrLicenseAllowsCao(licenseType, caoKey) {
  if (!licenseType || !caoKey) return false;
  return (WPBR_ALLOWED_CAO_KEYS[licenseType] || []).includes(caoKey);
}

export function buildFunctionGroupsForWpbrLicenses(licenses = [], caoKey = null) {
  const seen = new Set();
  return getActiveWpbrLicenses(licenses).flatMap(license => {
    const licenseType = license.license_type;
    if (caoKey && !wpbrLicenseAllowsCao(licenseType, caoKey)) return [];
    return (WPBR_FUNCTION_GROUPS[licenseType] || []).map(group => {
      const functions = group.functions.filter(value => {
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
      });
      return {
        key: `${licenseType}_${group.key}`,
        licenseType,
        label: `${licenseType} - ${group.label}`,
        functions,
      };
    }).filter(group => group.functions.length > 0);
  });
}
