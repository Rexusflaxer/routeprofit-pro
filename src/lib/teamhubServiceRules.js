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

export function getWpbrLicenseLabel(licenseType) {
  return WPBR_LICENSE_LABELS[licenseType] || licenseType || "Geen WPBR-vergunning";
}

export function getAllowedTeamhubServiceTypes(licenseType) {
  return ALLOWED_SERVICES_BY_WPBR_TYPE[licenseType] || [];
}

export function isTeamhubServiceAllowedForLicense(licenseType, serviceKey) {
  return getAllowedTeamhubServiceTypes(licenseType).includes(serviceKey);
}

export function sanitizeTeamhubServiceTypes(licenseType, serviceTypes = []) {
  const allowed = new Set(getAllowedTeamhubServiceTypes(licenseType));
  return (serviceTypes || []).filter(service => allowed.has(service));
}

export function getTeamhubServiceDisabledReason(licenseType, serviceKey) {
  if (isTeamhubServiceAllowedForLicense(licenseType, serviceKey)) return "";
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

export function getEffectiveWpbrLicenseType(company, licenses = []) {
  const activeLicense = (licenses || [])
    .filter(license => license?.status !== "superseded" && license?.status !== "expired" && !isExpiredLicense(license) && license.license_type)
    .sort((a, b) => String(b.valid_until || "").localeCompare(String(a.valid_until || "")))[0];

  return activeLicense?.license_type || company?.wpbr_license_type || null;
}
