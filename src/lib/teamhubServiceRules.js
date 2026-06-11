export const TEAMHUB_SERVICE_OPTIONS = [
  { key: "private_security", label: "Particuliere beveiliging" },
  { key: "object_security", label: "Objectbeveiliging" },
  { key: "mobile_surveillance", label: "Mobiele surveillance" },
  { key: "reception_host", label: "Receptie/host" },
  { key: "event_hospitality_security", label: "Evenementen/horeca" },
  { key: "alarm_center", label: "Alarmcentrale" },
  { key: "video_surveillance_center", label: "Videotoezicht" },
  { key: "cash_value_transport", label: "Geld- en waardetransport" },
  { key: "private_investigation", label: "Recherche" },
  { key: "security_installation", label: "Beveiligingsinstallaties" },
  { key: "traffic_controller", label: "Verkeersregelaars" },
  { key: "fire_watch", label: "Brandwacht" },
  { key: "bhv", label: "BHV" },
  { key: "other", label: "Overig" },
];

export const TEAMHUB_SERVICE_LABELS = Object.fromEntries(
  TEAMHUB_SERVICE_OPTIONS.map(service => [service.key, service.label])
);

export const WPBR_LICENSE_LABELS = {
  ND: "Particuliere beveiligingsorganisatie",
  HND: "Horecabeveiliging voor derden",
  BD: "Bedrijfsbeveiligingsdienst voor eigen onderneming",
  HBD: "Bedrijfsbeveiligingsdienst voor eigen horecaonderneming",
  PAC: "Particuliere alarmcentrale",
  VTC: "Particuliere video toezicht centrale",
  PGW: "Particulier geld- en waardentransportbedrijf",
  POB: "Particulier recherchebureau",
  other: "Overige vergunning",
};

const ALLOWED_SERVICES_BY_WPBR_TYPE = {
  ND: ["private_security", "object_security", "mobile_surveillance", "reception_host", "event_hospitality_security"],
  HND: ["event_hospitality_security"],
  BD: [],
  HBD: [],
  PAC: ["alarm_center"],
  VTC: ["video_surveillance_center"],
  PGW: ["cash_value_transport"],
  POB: ["private_investigation"],
  other: [],
};

const OWN_COMPANY_ONLY_LICENSES = new Set(["BD", "HBD"]);

const QUALIFICATION_REQUIREMENTS_BY_SERVICE = {
  traffic_controller: {
    label: "geldig verkeersregelaar-certificaat",
    types: ["verkeersregelaar"],
  },
  fire_watch: {
    label: "geldig brandwacht-diploma",
    types: [
      "brandwacht",
      "rijksdiploma_brandwacht",
      "rijksdiploma_brandwacht_1e_klas",
      "rijksdiploma_hoofdbrandwacht",
    ],
  },
  bhv: {
    label: "geldig BHV-certificaat",
    types: ["bhv"],
  },
};

export function getWpbrLicenseLabel(licenseType) {
  return WPBR_LICENSE_LABELS[licenseType] || licenseType || "Geen WPBR-vergunning";
}

export function getAllowedTeamhubServiceTypes(licenseType, qualifiedServiceTypes = []) {
  return [...new Set([
    ...(ALLOWED_SERVICES_BY_WPBR_TYPE[licenseType] || []),
    ...(qualifiedServiceTypes || []),
  ])];
}

export function isQualificationControlledTeamhubService(serviceKey) {
  return Boolean(QUALIFICATION_REQUIREMENTS_BY_SERVICE[serviceKey]);
}

export function isTeamhubServiceAllowedForLicense(licenseType, serviceKey, qualifiedServiceTypes = []) {
  return getAllowedTeamhubServiceTypes(licenseType, qualifiedServiceTypes).includes(serviceKey);
}

export function sanitizeTeamhubServiceTypes(licenseType, serviceTypes = [], qualifiedServiceTypes = []) {
  const allowed = new Set(getAllowedTeamhubServiceTypes(licenseType, qualifiedServiceTypes));
  return (serviceTypes || []).filter(service => allowed.has(service));
}

export function getTeamhubServiceDisabledReason(licenseType, serviceKey, qualifiedServiceTypes = []) {
  if (isTeamhubServiceAllowedForLicense(licenseType, serviceKey, qualifiedServiceTypes)) return "";
  const qualificationRequirement = QUALIFICATION_REQUIREMENTS_BY_SERVICE[serviceKey];
  if (qualificationRequirement) {
    return `${TEAMHUB_SERVICE_LABELS[serviceKey] || "Deze dienst"} is alleen selecteerbaar wanneer er minimaal één actieve medewerker met een ${qualificationRequirement.label} in het personeelsbestand staat.`;
  }
  if (!licenseType || licenseType === "none") return "Voeg eerst een WPBR-vergunningstype toe.";
  if (OWN_COMPANY_ONLY_LICENSES.has(licenseType)) {
    return `${licenseType} is alleen voor beveiliging van de eigen onderneming en daarom niet selecteerbaar voor Teamhub-onderaanneming.`;
  }
  return `${TEAMHUB_SERVICE_LABELS[serviceKey] || "Deze dienst"} valt niet onder ${licenseType} - ${getWpbrLicenseLabel(licenseType)}.`;
}

function isExpiredLicense(license) {
  const today = new Date().toISOString().split("T")[0];
  return license?.valid_until && license.valid_until < today;
}

function isWithinDateRange(record, referenceDate) {
  if (record?.valid_from && record.valid_from > referenceDate) return false;
  if (record?.valid_until && record.valid_until < referenceDate) return false;
  return true;
}

function isActiveCompanyAssignment(assignment, referenceDate) {
  if (!assignment || assignment.assignment_status === "ended") return false;
  if (assignment.available_for_planning === false) return false;
  return isWithinDateRange(assignment, referenceDate);
}

function isValidQualification(qualification, referenceDate) {
  if (!qualification || qualification.verification_status !== "verified") return false;
  return isWithinDateRange(qualification, referenceDate);
}

export function getQualifiedTeamhubServiceTypes({ companyId, personnel = [], assignments = [], qualifications = [], referenceDate = null }) {
  if (!companyId) return [];

  const today = referenceDate || new Date().toISOString().split("T")[0];
  const activeAssignedPersonnelIds = new Set(
    (assignments || [])
      .filter(assignment => assignment.company_id === companyId && isActiveCompanyAssignment(assignment, today))
      .map(assignment => assignment.personnel_id)
      .filter(Boolean)
  );

  const activePersonnelIds = new Set(
    (personnel || [])
      .filter(person => person?.status === "active")
      .filter(person => person.primary_company_id === companyId || activeAssignedPersonnelIds.has(person.id))
      .map(person => person.id)
      .filter(Boolean)
  );

  const validQualificationTypes = new Set(
    (qualifications || [])
      .filter(qualification => isValidQualification(qualification, today))
      .filter(qualification => activePersonnelIds.has(qualification.personnel_id))
      .filter(qualification => !qualification.company_id || qualification.company_id === companyId)
      .map(qualification => qualification.qualification_type)
      .filter(Boolean)
  );

  return Object.entries(QUALIFICATION_REQUIREMENTS_BY_SERVICE)
    .filter(([, requirement]) => requirement.types.some(type => validQualificationTypes.has(type)))
    .map(([serviceKey]) => serviceKey);
}

export function getEffectiveWpbrLicenseType(company, licenses = []) {
  const activeLicense = (licenses || [])
    .filter(license => license?.status !== "superseded" && license?.status !== "expired" && !isExpiredLicense(license) && license.license_type)
    .sort((a, b) => String(b.valid_until || "").localeCompare(String(a.valid_until || "")))[0];

  return activeLicense?.license_type || company?.wpbr_license_type || null;
}
