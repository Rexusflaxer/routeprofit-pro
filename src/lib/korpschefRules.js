import { normalizeWpbrLicenseType, WPBR_TYPE_LABELS } from "@/lib/securityCaoCatalog";

export const KORPSCHEF_LICENSE_TYPES = new Set([
  "ND",
  "HND",
  "BD",
  "HBD",
  "PAC",
  "VTC",
  "PGW",
  "POB",
]);

export const KORPSCHEF_DOCUMENT_CATEGORIES = new Set([
  "wpbr_permission",
  "wpbr_badge",
]);

export const KORPSCHEF_RECORD_STATUSES = {
  requested: "Aangevraagd",
  active: "Actief",
  expired: "Verlopen",
  rejected: "Afgewezen",
  revoked: "Ingetrokken",
  superseded: "Vervangen",
  archived: "Gearchiveerd",
};

export const WPBR_CARD_COLORS = [
  { value: "grey", label: "Grijs" },
  { value: "blue", label: "Blauw" },
  { value: "green", label: "Groen" },
  { value: "yellow", label: "Geel" },
  { value: "orange", label: "Oranje" },
  { value: "other", label: "Overig" },
];

export function compactKorpschefValue(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function normalizeKorpschefMatchValue(value) {
  return compactKorpschefValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function companyKorpschefLabel(company) {
  return compactKorpschefValue(
    company?.legal_name
    || company?.statutory_name
    || company?.registered_name
    || company?.display_name
    || company?.trade_name
  ) || "Bedrijf";
}

export function isRelevantWpbrLicense(license) {
  return KORPSCHEF_LICENSE_TYPES.has(normalizeWpbrLicenseType(license?.license_type));
}

export function isLicenseActiveOn(license, referenceDate = new Date().toISOString().slice(0, 10)) {
  if (!isRelevantWpbrLicense(license)) return false;
  if (["expired", "superseded"].includes(license?.status)) return false;
  if (license?.valid_from && license.valid_from > referenceDate) return false;
  if (license?.valid_until && license.valid_until < referenceDate) return false;
  return !license?.status || license.status === "active";
}

export function legacyCompanyWpbrLicense(company) {
  const licenseType = normalizeWpbrLicenseType(company?.wpbr_license_type);
  if (!KORPSCHEF_LICENSE_TYPES.has(licenseType)) return null;

  return {
    id: null,
    company_id: company.id,
    license_type: licenseType,
    license_number: company.wpbr_license_number || null,
    valid_until: company.wpbr_license_valid_until || null,
    status: "active",
    metadata: { legacy_company_field: true },
  };
}

export function companyWpbrLicenses(company, licenses = []) {
  const stored = licenses.filter(license => (
    license.company_id === company?.id && isRelevantWpbrLicense(license)
  ));
  if (stored.length > 0) return stored;
  const legacy = legacyCompanyWpbrLicense(company);
  return legacy ? [legacy] : [];
}

export function buildKorpschefCompanyOptions(companies = [], licenses = [], referenceDate) {
  return companies
    .filter(company => (company.status || "active") === "active")
    .map(company => {
      const companyLicenses = companyWpbrLicenses(company, licenses);
      if (companyLicenses.length === 0) return null;

      const activeLicenses = companyLicenses.filter(license => isLicenseActiveOn(license, referenceDate));
      const missing = [];
      if (!compactKorpschefValue(companyKorpschefLabel(company))) missing.push("juridische bedrijfsnaam");
      if (activeLicenses.length === 0) missing.push("actieve Wpbr-vergunning");

      return {
        company,
        licenses: companyLicenses,
        activeLicenses,
        selectable: missing.length === 0,
        missing,
      };
    })
    .filter(Boolean)
    .sort((a, b) => companyKorpschefLabel(a.company).localeCompare(companyKorpschefLabel(b.company), "nl"));
}

export function isKorpschefDocument(document) {
  return KORPSCHEF_DOCUMENT_CATEGORIES.has(document?.category);
}

export function korpschefRecordType(document) {
  if (document?.category === "wpbr_badge") return "wpbr_id";
  return "permission";
}

export function korpschefRecordStatus(document, referenceDate = new Date().toISOString().slice(0, 10)) {
  if (document?.metadata?.archived === true) return document.metadata?.record_status || "archived";
  const storedStatus = document?.metadata?.record_status;
  if (["rejected", "revoked", "superseded", "archived"].includes(storedStatus)) return storedStatus;
  if (document?.valid_until && document.valid_until < referenceDate) return "expired";
  if (document?.verification_status === "expired") return "expired";
  if (storedStatus === "requested") return "requested";
  return "active";
}

export function isArchivedKorpschefDocument(document, referenceDate) {
  return ["expired", "rejected", "revoked", "superseded", "archived"]
    .includes(korpschefRecordStatus(document, referenceDate));
}

export function korpschefDocumentLabel(document) {
  if (korpschefRecordType(document) === "permission") return "Toestemmingsbrief korpschef";
  const cardColor = WPBR_CARD_COLORS.find(option => option.value === document?.metadata?.card_color)?.label;
  return cardColor ? `${cardColor} legitimatiebewijs` : "Wpbr-legitimatiebewijs";
}

export function licenseSnapshotLabel(document) {
  const type = normalizeWpbrLicenseType(document?.metadata?.license_type);
  const number = compactKorpschefValue(document?.metadata?.license_number);
  if (!type && !number) return "Bedrijfscontext";
  if (!type) return `#${number}`;
  if (!number) return type;
  return `${type} #${number}`;
}

export function findMatchingWpbrLicense({ company, licenses = [], recognizedLicenseNumber = "" }) {
  const companyLicenses = companyWpbrLicenses(company, licenses);
  const activeLicenses = companyLicenses.filter(isLicenseActiveOn);
  const normalizedNumber = normalizeKorpschefMatchValue(recognizedLicenseNumber);
  const exact = normalizedNumber
    ? companyLicenses.find(license => (
        normalizeKorpschefMatchValue(license.license_number) === normalizedNumber
      ))
    : null;

  if (exact) {
    return {
      license: exact,
      status: "matched",
      explanation: `Automatisch gekoppeld aan ${WPBR_TYPE_LABELS[normalizeWpbrLicenseType(exact.license_type)] || exact.license_type}.`,
    };
  }

  if (!normalizedNumber && activeLicenses.length === 1) {
    return {
      license: activeLicenses[0],
      status: "inferred",
      explanation: "Automatisch afgeleid uit de enige actieve Wpbr-vergunning van dit bedrijf.",
    };
  }

  return {
    license: null,
    status: normalizedNumber ? "mismatch" : "company_only",
    explanation: normalizedNumber
      ? "Het vergunningnummer op het document komt niet overeen met een vergunning van het gekozen bedrijf."
      : "De vergunningcontext blijft op bedrijfsniveau omdat geen uniek vergunningnummer kon worden afgeleid.",
  };
}

export function buildLegacyKorpschefDocuments(securityPasses = []) {
  return securityPasses.map(pass => ({
    id: `legacy-pass-${pass.id}`,
    legacy_security_pass_id: pass.id,
    personnel_id: pass.personnel_id,
    company_id: pass.company_id || null,
    category: "wpbr_badge",
    document_type: "Legacy beveiligingspas",
    document_number: pass.pass_number || null,
    valid_from: pass.valid_from || null,
    valid_until: pass.valid_until || null,
    verification_status: pass.status === "expired" ? "expired" : "verified",
    metadata: {
      legacy_read_only: true,
      card_color: pass.pass_type === "temporary" ? "other" : pass.pass_type,
      record_status: pass.status === "approved" ? "active" : pass.status,
      authority: pass.authority || "korpschef",
    },
  }));
}
