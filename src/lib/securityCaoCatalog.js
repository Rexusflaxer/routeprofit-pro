export const CAO_OPTIONS = [
  { value: "cao_particuliere_beveiliging", label: "CAO Particuliere Beveiliging" },
  { value: "cao_evenementen_horecabeveiliging", label: "CAO Evenementen- en Horecabeveiliging" },
  { value: "cao_verkeersregelaars", label: "CAO Verkeersregelaars" },
  { value: "cao_veiligheidsdomein", label: "CAO Veiligheidsdomein" },
];

export const CAO_OPTION_LABELS = Object.fromEntries(CAO_OPTIONS.map(option => [option.value, option.label]));

export const SECURITY_EMPLOYMENT_CAO_KEYS = [
  "cao_particuliere_beveiliging",
  "cao_evenementen_horecabeveiliging",
  "cao_veiligheidsdomein",
];

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
  bedrijfssurveillant: "Bedrijfssurveillant",
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
  roostermaker: "Roostermaker",
  operationeel_coordinator: "Operationeel coördinator",
  operationeel_manager: "Operationeel manager",
  administratief_medewerker: "Administratief medewerker",
  financieel_administratief: "Financieel administratief medewerker",
  salarisadministrateur: "Salarisadministrateur",
  hr_medewerker: "HR-medewerker",
  hr_manager: "HR-manager",
  accountmanager: "Accountmanager",
  sales_manager: "Sales manager",
  kwaliteitsmanager: "Kwaliteitsmanager",
  compliance_manager: "Compliance manager",
  directie: "Directie / management",
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

export const SHARED_BACKOFFICE_FUNCTIONS = [
  "binnendienst",
  "planner",
  "roostermaker",
  "operationeel_coordinator",
  "operationeel_manager",
  "administratief_medewerker",
  "financieel_administratief",
  "salarisadministrateur",
  "hr_medewerker",
  "hr_manager",
  "accountmanager",
  "sales_manager",
  "kwaliteitsmanager",
  "compliance_manager",
  "directie",
];

const OFFICE_FUNCTIONS = SHARED_BACKOFFICE_FUNCTIONS;

export const WPBR_ALLOWED_CAO_KEYS = {
  ND: ["cao_particuliere_beveiliging", "cao_evenementen_horecabeveiliging", "cao_veiligheidsdomein"],
  HND: ["cao_evenementen_horecabeveiliging", "cao_veiligheidsdomein", "cao_particuliere_beveiliging"],
  BD: ["cao_particuliere_beveiliging"],
  HBD: ["cao_evenementen_horecabeveiliging", "cao_veiligheidsdomein", "cao_particuliere_beveiliging"],
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
      caoKeys: ["cao_particuliere_beveiliging", "cao_veiligheidsdomein"],
      functions: ["objectbeveiliger", "receptie", "surveillant", "mobiel_surveillant", "centralist", "alarmopvolging", "winkelsurveillant", "brandwacht"],
    },
    {
      key: "evenementen_horeca",
      label: "Evenementen- en horecabeveiliging",
      caoKeys: ["cao_particuliere_beveiliging", "cao_evenementen_horecabeveiliging", "cao_veiligheidsdomein"],
      functions: ["evenementenbeveiliger", "horecabeveiliger", "host"],
    },
  ],
  HND: [
    {
      key: "horecabeveiliging",
      label: "Horecabeveiliging",
      caoKeys: ["cao_evenementen_horecabeveiliging", "cao_veiligheidsdomein", "cao_particuliere_beveiliging"],
      functions: ["horecabeveiliger"],
    },
  ],
  BD: [
    {
      key: "bedrijfsbeveiliging",
      label: "Bedrijfsbeveiliging",
      functions: ["objectbeveiliger", "receptie", "bedrijfssurveillant", "brandwacht"],
    },
  ],
  HBD: [
    {
      key: "eigen_horeca",
      label: "Eigen horecaonderneming",
      caoKeys: ["cao_evenementen_horecabeveiliging", "cao_veiligheidsdomein", "cao_particuliere_beveiliging"],
      functions: ["horecabeveiliger"],
    },
  ],
  PAC: [
    {
      key: "alarmcentrale",
      label: "Alarmcentrale",
      functions: ["centralist_pac"],
    },
  ],
  VTC: [
    {
      key: "videotoezicht",
      label: "Videotoezichtcentrale",
      functions: ["centralist_vtc", "videosurveillant", "toezichthouder"],
    },
  ],
  PGW: [
    {
      key: "geld_waarde",
      label: "Geld- en waardetransport",
      functions: ["geld_waardetransporteur", "waardetransport_chauffeur", "waardetransport_bijrijder"],
    },
  ],
  POB: [
    {
      key: "recherche",
      label: "Particuliere recherche",
      functions: ["particulier_onderzoeker", "rechercheur", "observant"],
    },
  ],
};

export const DEFAULT_OFFICE_FUNCTIONS = OFFICE_FUNCTIONS;

export function uniqueStrings(values) {
  return [...new Set((values || []).map(value => String(value || "").trim()).filter(Boolean))];
}

export function functionLabel(value) {
  return FUNCTION_LABELS[value] || String(value || "").replace(/[_-]+/g, " ");
}

export function isSecurityEmploymentCao(caoKey) {
  return SECURITY_EMPLOYMENT_CAO_KEYS.includes(caoKey);
}

export function functionGroupAllowsCao(group, caoKey) {
  return !caoKey || !Array.isArray(group?.caoKeys) || group.caoKeys.includes(caoKey);
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

export function activeWpbrLicenseTypesForCao(licenses = [], caoKey = null) {
  return uniqueStrings(getActiveWpbrLicenses(licenses)
    .map(license => license.license_type)
    .filter(licenseType => !caoKey || wpbrLicenseAllowsCao(licenseType, caoKey)));
}

export function isSharedBackofficeFunction(value) {
  return SHARED_BACKOFFICE_FUNCTIONS.includes(value);
}

export function resolveFunctionWpbrLicenseTypes(functionValue, licenses = [], caoKey = null) {
  const licenseTypes = activeWpbrLicenseTypesForCao(licenses, caoKey);
  if (!functionValue) return [];
  if (isSharedBackofficeFunction(functionValue)) return licenseTypes;
  return licenseTypes.filter(licenseType =>
    (WPBR_FUNCTION_GROUPS[licenseType] || []).some(group =>
      functionGroupAllowsCao(group, caoKey) && group.functions.includes(functionValue)
    )
  );
}

export function buildFunctionGroupsForWpbrLicenses(licenses = [], caoKey = null) {
  const seen = new Set();
  const licenseTypes = activeWpbrLicenseTypesForCao(licenses, caoKey);
  const operationGroups = getActiveWpbrLicenses(licenses).flatMap(license => {
    const licenseType = license.license_type;
    if (!licenseTypes.includes(licenseType)) return [];
    return (WPBR_FUNCTION_GROUPS[licenseType] || []).filter(group => functionGroupAllowsCao(group, caoKey)).map(group => {
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
  const sharedGroup = licenseTypes.length > 0
    ? [{
        key: "shared_binnendienst",
        licenseType: null,
        licenseTypes,
        label: "Binnendienst functies",
        functions: SHARED_BACKOFFICE_FUNCTIONS,
        shared: true,
      }]
    : [];
  return [...operationGroups, ...sharedGroup];
}
