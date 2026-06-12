export const TEAMHUB_SERVICE_OPTIONS = [
  { key: "private_security", label: "Particuliere beveiliging" },
  { key: "object_security", label: "Objectbeveiliging" },
  { key: "mobile_surveillance", label: "Mobiele surveillance" },
  { key: "alarm_response", label: "Alarmopvolging" },
  { key: "reception_host", label: "Receptie/host" },
  { key: "event_hospitality_security", label: "Evenementen/horeca" },
  { key: "alarm_center", label: "Alarmcentrale" },
  { key: "video_surveillance_center", label: "Videotoezicht" },
  { key: "cash_value_transport", label: "Geld- en waardetransport" },
  { key: "private_investigation", label: "Recherche" },
  { key: "security_installation", label: "Inbraakbeveiligingsinstallaties" },
  { key: "fire_alarm_installation", label: "Brandmeldinstallaties (BMI/OAI)" },
  { key: "fire_alarm_panel_bmc", label: "BMC / brandmeldcentrales" },
  { key: "technical_security_other", label: "Overige technische beveiliging" },
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
  ND: ["private_security", "object_security", "mobile_surveillance", "alarm_response", "reception_host", "event_hospitality_security"],
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
  security_installation: {
    label: "geldig MBV/TBV- of alarminstallateur-diploma",
    types: ["alarminstallateur", "mbv", "tbv"],
  },
  fire_alarm_installation: {
    label: "geldig BMI/OAI-diploma",
    types: [
      "basis_brandmeldtechniek",
      "projecteringsdeskundige_bmi",
      "installatiedeskundige_bmi_oai",
      "onderhoudsdeskundige_bmi",
    ],
  },
  fire_alarm_panel_bmc: {
    label: "geldig BMI/BMC-diploma",
    types: [
      "beheerder_brandmeldinstallatie",
      "projecteringsdeskundige_bmi",
      "installatiedeskundige_bmi_oai",
      "onderhoudsdeskundige_bmi",
    ],
  },
  technical_security_other: {
    label: "relevant technisch beveiligingscertificaat",
    types: ["alarminstallateur", "mbv", "tbv", "technisch_beveiligingsspecialist"],
  },
};

export const TECHNICAL_ACCREDITATION_OPTIONS = [
  { key: "borg_e", label: "BORG-E elektronische inbraakbeveiliging" },
  { key: "borg_b", label: "BORG-B bouwkundige inbraakbeveiliging" },
  { key: "veb_4", label: "VEB 4 kwaliteitsregeling" },
  { key: "ccv_bmi_leveren", label: "CCV Leveren brandmeldinstallaties" },
  { key: "ccv_bmi_onderhoud", label: "CCV Onderhoud brandmeldinstallaties" },
  { key: "ccv_bmi_oai_installeren", label: "CCV Installeren BMI/OAI" },
  { key: "ccv_oai", label: "CCV Ontruimingsalarminstallaties" },
  { key: "other_technical", label: "Overige technische erkenning" },
];

export const TEAMHUB_TECHNICAL_CERTIFICATION_OPTIONS = TECHNICAL_ACCREDITATION_OPTIONS;

const TECHNICAL_CERTIFICATION_REQUIREMENTS_BY_SERVICE = {
  security_installation: {
    label: "BORG-E, BORG-B, VEB 4 of vergelijkbare technische erkenning",
    types: ["borg_e", "borg_b", "veb_4", "other_technical"],
  },
  fire_alarm_installation: {
    label: "CCV-certificering voor leveren, onderhoud of installeren van BMI/OAI",
    types: ["ccv_bmi_leveren", "ccv_bmi_onderhoud", "ccv_bmi_oai_installeren", "ccv_oai", "other_technical"],
  },
  fire_alarm_panel_bmc: {
    label: "CCV-certificering voor BMI/OAI of brandmeldcentrale-werkzaamheden",
    types: ["ccv_bmi_leveren", "ccv_bmi_onderhoud", "ccv_bmi_oai_installeren", "ccv_oai", "other_technical"],
  },
  technical_security_other: {
    label: "relevante technische erkenning",
    types: ["borg_e", "borg_b", "veb_4", "ccv_bmi_leveren", "ccv_bmi_onderhoud", "ccv_bmi_oai_installeren", "ccv_oai", "other_technical"],
  },
};

export const TEAMHUB_LICENSE_SERVICE_GROUPS = [
  {
    key: "ND",
    title: "ND - Particuliere beveiligingsorganisatie",
    serviceKeys: ALLOWED_SERVICES_BY_WPBR_TYPE.ND,
  },
  {
    key: "HND",
    title: "HND - Horecabeveiliging voor derden",
    serviceKeys: ALLOWED_SERVICES_BY_WPBR_TYPE.HND,
  },
  {
    key: "PAC",
    title: "PAC - Particuliere alarmcentrale",
    serviceKeys: ALLOWED_SERVICES_BY_WPBR_TYPE.PAC,
  },
  {
    key: "VTC",
    title: "VTC - Video toezicht centrale",
    serviceKeys: ALLOWED_SERVICES_BY_WPBR_TYPE.VTC,
  },
  {
    key: "PGW",
    title: "PGW - Geld- en waardentransport",
    serviceKeys: ALLOWED_SERVICES_BY_WPBR_TYPE.PGW,
  },
  {
    key: "POB",
    title: "POB - Particulier recherchebureau",
    serviceKeys: ALLOWED_SERVICES_BY_WPBR_TYPE.POB,
  },
];

export const TEAMHUB_QUALIFICATION_SERVICE_KEYS = ["traffic_controller", "fire_watch", "bhv"];
export const TEAMHUB_TECHNICAL_SERVICE_GROUPS = [
  {
    key: "intrusion",
    title: "Inbraakbeveiliging",
    serviceKeys: ["security_installation"],
  },
  {
    key: "fire",
    title: "Brandveiligheidstechniek",
    serviceKeys: ["fire_alarm_installation", "fire_alarm_panel_bmc"],
  },
  {
    key: "technical_other",
    title: "Overige technische beveiliging",
    serviceKeys: ["technical_security_other"],
  },
];

const TEAMHUB_SERVICE_OPTIONS_BY_KEY = Object.fromEntries(
  TEAMHUB_SERVICE_OPTIONS.map(service => [service.key, service])
);

export function getWpbrLicenseLabel(licenseType) {
  return WPBR_LICENSE_LABELS[licenseType] || licenseType || "Geen WPBR-vergunning";
}

export function getTeamhubServicesByKeys(serviceKeys = []) {
  return (serviceKeys || []).map(serviceKey => TEAMHUB_SERVICE_OPTIONS_BY_KEY[serviceKey]).filter(Boolean);
}

function hasRequiredTechnicalCertification(serviceKey, technicalCertificationTypes = []) {
  const requirement = TECHNICAL_CERTIFICATION_REQUIREMENTS_BY_SERVICE[serviceKey];
  if (!requirement) return true;
  return requirement.types.some(type => (technicalCertificationTypes || []).includes(type));
}

export function getActiveTeamhubTechnicalCertificationTypes(accreditations = [], legacyCertificationTypes = [], referenceDate = null) {
  const today = referenceDate || new Date().toISOString().split("T")[0];
  const activeAccreditationTypes = (accreditations || [])
    .filter(accreditation => accreditation?.category === "technical_certification")
    .filter(accreditation => accreditation.status !== "suspended" && accreditation.status !== "expired")
    .filter(accreditation => !accreditation.valid_from || accreditation.valid_from <= today)
    .filter(accreditation => !accreditation.valid_until || accreditation.valid_until >= today)
    .map(accreditation => accreditation.accreditation_type)
    .filter(Boolean);

  return [...new Set([...(legacyCertificationTypes || []), ...activeAccreditationTypes])];
}

export function isTechnicalControlledTeamhubService(serviceKey) {
  return Boolean(TECHNICAL_CERTIFICATION_REQUIREMENTS_BY_SERVICE[serviceKey]);
}

export function getAllowedTeamhubServiceTypes(licenseType, qualifiedServiceTypes = [], technicalCertificationTypes = []) {
  return [...new Set([
    ...(ALLOWED_SERVICES_BY_WPBR_TYPE[licenseType] || []),
    ...(qualifiedServiceTypes || []).filter(serviceKey => hasRequiredTechnicalCertification(serviceKey, technicalCertificationTypes)),
  ])];
}

export function isQualificationControlledTeamhubService(serviceKey) {
  return Boolean(QUALIFICATION_REQUIREMENTS_BY_SERVICE[serviceKey]);
}

export function isTeamhubServiceAllowedForLicense(licenseType, serviceKey, qualifiedServiceTypes = [], technicalCertificationTypes = []) {
  return getAllowedTeamhubServiceTypes(licenseType, qualifiedServiceTypes, technicalCertificationTypes).includes(serviceKey);
}

export function sanitizeTeamhubServiceTypes(licenseType, serviceTypes = [], qualifiedServiceTypes = [], technicalCertificationTypes = []) {
  const allowed = new Set(getAllowedTeamhubServiceTypes(licenseType, qualifiedServiceTypes, technicalCertificationTypes));
  return (serviceTypes || []).filter(service => allowed.has(service));
}

export function getTeamhubServiceDisabledReason(licenseType, serviceKey, qualifiedServiceTypes = [], technicalCertificationTypes = []) {
  if (isTeamhubServiceAllowedForLicense(licenseType, serviceKey, qualifiedServiceTypes, technicalCertificationTypes)) return "";
  const technicalRequirement = TECHNICAL_CERTIFICATION_REQUIREMENTS_BY_SERVICE[serviceKey];
  if (technicalRequirement && !hasRequiredTechnicalCertification(serviceKey, technicalCertificationTypes)) {
    return `${TEAMHUB_SERVICE_LABELS[serviceKey] || "Deze dienst"} is alleen selecteerbaar wanneer het bedrijfsprofiel ${technicalRequirement.label} bevat.`;
  }
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

export function getActiveWpbrLicense(licenses = []) {
  return (licenses || [])
    .filter(license => license?.status !== "superseded" && license?.status !== "expired" && !isExpiredLicense(license) && license.license_type)
    .sort((a, b) => String(b.valid_until || "").localeCompare(String(a.valid_until || "")))[0] || null;
}

export function getActiveWpbrLicenseType(licenses = []) {
  return getActiveWpbrLicense(licenses)?.license_type || null;
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
  const activeLicense = getActiveWpbrLicense(licenses);

  return activeLicense?.license_type || company?.wpbr_license_type || null;
}
