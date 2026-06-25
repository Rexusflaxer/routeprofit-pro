import React, { useState, useRef, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Archive, Check, ChevronLeft, ChevronRight, Edit, Eye, FileText, Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import ManagedFilePreviewDialog from "@/components/files/ManagedFilePreviewDialog";
import { getEffectiveWpbrLicenseType, getWpbrLicenseLabel, TECHNICAL_ACCREDITATION_OPTIONS } from "@/lib/teamhubServiceRules";
import { buildManagedFileDescriptor, updateManagedFileSource, uploadManagedFile } from "@/lib/managedFiles";
import { buildAuditMetadata, getAuditActorLabel } from "@/lib/auditTrail";

const DELETE_PASSWORD = "verwijder";
// Header and rows share this grid so status, validity, and actions cannot drift out of alignment.
const ACCREDITATION_TABLE_GRID = "grid grid-cols-[minmax(120px,160px)_minmax(190px,1fr)_minmax(96px,116px)_minmax(180px,260px)_minmax(140px,180px)_minmax(250px,360px)] gap-3 xl:gap-4";

const CATEGORY_OPTIONS = [
  { key: "technical_certification", label: "Technische erkenning" },
  { key: "quality_mark", label: "Kwaliteitscertificaat" },
  { key: "other", label: "Overig" },
];

const QUALITY_OPTIONS = [
  { key: "iso_9001", label: "ISO 9001" },
  { key: "iso_27001", label: "ISO/IEC 27001" },
  { key: "iso_14001", label: "ISO 14001" },
  { key: "iso_45001", label: "ISO 45001" },
  { key: "iso_18788", label: "ISO 18788" },
  { key: "iso_22301", label: "ISO 22301" },
  { key: "vca", label: "VCA" },
  { key: "veb_pbo_kwaliteitsregeling", label: "VEB PBO Kwaliteitsregeling" },
  { key: "nvb_keurmerk_beveiliging", label: "Nederlandse Veiligheidsbranche Keurmerk Beveiliging" },
  { key: "nvb_keurmerk_evenementenbeveiliging", label: "Nederlandse Veiligheidsbranche Keurmerk Evenementenbeveiliging" },
  { key: "nvb_keurmerk_horecabeveiliging", label: "Nederlandse Veiligheidsbranche Keurmerk Horecabeveiliging" },
  { key: "nvb_keurmerk_gwt", label: "Nederlandse Veiligheidsbranche Keurmerk GWT" },
  { key: "nvb_keurmerk_pob", label: "Nederlandse Veiligheidsbranche Keurmerk POB" },
  { key: "vvnl_kwaliteitslabel_regulier", label: "Kwaliteitslabel Veiligheidsdomein - Reguliere beveiliging" },
  { key: "vvnl_kwaliteitslabel_ehb", label: "Kwaliteitslabel Veiligheidsdomein - Horeca- en evenementenbeveiliging" },
  { key: "bpob_keurmerk_particulier_onderzoeksbureau", label: "BPOB Keurmerk Particulier Onderzoeksbureau" },
  { key: "nvb_bhv_opleidingsinstituut", label: "NVB-BHV Opleidingsinstituut / instructeursregistratie" },
  { key: "other", label: "Ander kwaliteitscertificaat" },
];

const OTHER_OPTIONS = [
  { key: "other", label: "Overige erkenning of certificering" },
];

const OPTIONS_BY_CATEGORY = {
  technical_certification: TECHNICAL_ACCREDITATION_OPTIONS,
  quality_mark: QUALITY_OPTIONS,
  other: OTHER_OPTIONS,
};

const EMPTY_FORM = {
  category: "",
  accreditation_type: "",
  name: "",
  issuer: "",
  certificate_number: "",
  valid_from: "",
  valid_until: "",
  status: "active",
  document_file_url: "",
  document_filename: "",
  document_file_id: "",
  document_download_filename: "",
  document_logical_path: "",
  document_metadata: null,
  notes: "",
};

const CUSTOM_ISSUER_NEW_VALUE = "__new_issuer__";
const ISO_GENERIC_ISSUER = "Erkende certificatie-instelling";

const LEGACY_ACCREDITATION_LABELS = {
  "quality_mark:vvnl_kwaliteitslabel_verkeersregelaars": "Kwaliteitslabel Veiligheidsdomein - Verkeersregelaars",
};

const ISSUER_LOGO_RULES = [
  {
    shortLabel: "VEB",
    logoUrl: "https://veb.nl/wp-content/uploads/2024/10/VEB-Logo.png",
    match: ({ issuer, accreditationType }) => /vereniging erkende beveiligingsbedrijven|veb/i.test(issuer) || ["veb_4", "veb_pbo_kwaliteitsregeling"].includes(accreditationType),
  },
  {
    shortLabel: "NVB",
    logoUrl: "https://d1p3jfjj2ztqji.cloudfront.net/wp-content/uploads/2019/12/06115338/logo-nvb-300x136.jpg",
    match: ({ issuer, accreditationType }) => /nederlandse veiligheidsbranche/i.test(issuer) || accreditationType?.startsWith("nvb_keurmerk"),
  },
  {
    shortLabel: "KVL",
    logoUrl: "https://jouwveiligheidsdomein.nl/wp-content/uploads/2023/10/VVNL_kwaliteitslabel_RGB-1-300x96.png",
    match: ({ issuer, accreditationType, label }) => /veiligheidsdomein|sociaal fonds|sfv|vvnl/i.test(`${issuer} ${label}`) || accreditationType?.startsWith("vvnl_"),
  },
  {
    shortLabel: "BPOB",
    logoUrl: "https://media.base44.com/images/public/698e307ed3aa4cab3729bbf1/695cde5fc_BPOB_afkorting_Kleur_versie_1.png",
    match: ({ issuer, accreditationType }) => /bpob|particuliere onderzoeksbureaus/i.test(issuer) || accreditationType === "bpob_keurmerk_particulier_onderzoeksbureau",
  },
  {
    shortLabel: "BHV",
    logoUrl: "https://nvb-bhv.nl/wp-content/themes/nvb/img/nvb_logo.svg",
    match: ({ issuer, accreditationType }) => /nvb-bhv|bedrijfshulpverlening/i.test(issuer) || accreditationType === "nvb_bhv_opleidingsinstituut",
  },
  {
    shortLabel: "CCV",
    logoUrl: "https://www.hetccv.nl/app/themes/ccv/assets/images/logo.svg",
    match: ({ issuer, accreditationType }) => /ccv/i.test(issuer) || accreditationType?.startsWith("borg_") || accreditationType?.startsWith("ccv_"),
  },
  {
    shortLabel: "TN",
    logoUrl: "https://www.technieknederland.nl/media/quvnnxsy/logo-techniek-nederland.svg",
    match: ({ issuer }) => /techniek nederland/i.test(issuer),
  },
  {
    shortLabel: "ISO",
    match: ({ accreditationType, label }) => accreditationType?.startsWith("iso_") || /iso/i.test(label),
  },
  {
    shortLabel: "VCA",
    match: ({ accreditationType, label }) => accreditationType === "vca" || /vca/i.test(label),
  },
];

function issuerVisual({ issuer = "", accreditationType = "", label = "" }) {
  return ISSUER_LOGO_RULES.find(rule => rule.match({ issuer, accreditationType, label })) || {
    shortLabel: issuer?.slice(0, 3)?.toUpperCase() || "ORG",
  };
}

function isIsoAccreditationType(accreditationType = "") {
  return accreditationType?.startsWith("iso_");
}

function manualTypeForCategory(category = "") {
  return category === "technical_certification" ? "other_technical" : "other";
}

function isManualAccreditationType(category = "", accreditationType = "") {
  return category === "other" || accreditationType === "other" || accreditationType === "other_technical";
}

function usesCustomIssuerField(category = "", accreditationType = "") {
  return isIsoAccreditationType(accreditationType) || isManualAccreditationType(category, accreditationType);
}

function normalizeIssuerName(issuer = "") {
  return issuer.trim().replace(/\s+/g, " ");
}

function isGenericIsoIssuer(issuer = "") {
  return normalizeIssuerName(issuer).toLowerCase() === ISO_GENERIC_ISSUER.toLowerCase();
}

function issuerForDisplay(issuer = "", accreditationType = "") {
  if (accreditationType?.startsWith("vvnl_")) return "Sociaal Fonds Veiligheidsdomein (SFV)";
  if (isIsoAccreditationType(accreditationType)) {
    const normalizedIssuer = normalizeIssuerName(issuer);
    return normalizedIssuer || ISO_GENERIC_ISSUER;
  }
  if (accreditationType === "vca") return "SSVV / erkende certificatie-instelling";
  return issuer || "";
}

function issuerForForm(issuer = "", accreditationType = "") {
  if (isIsoAccreditationType(accreditationType)) {
    const normalizedIssuer = normalizeIssuerName(issuer);
    return isGenericIsoIssuer(normalizedIssuer) ? "" : normalizedIssuer;
  }
  return issuerForDisplay(issuer, accreditationType);
}

function IssuerLogo({ issuer, accreditationType, label, className = "" }) {
  const [failed, setFailed] = useState(false);
  const visual = issuerVisual({ issuer, accreditationType, label });
  const fallbackClass = visual.shortLabel === "ISO"
    ? "border-blue-800 bg-blue-950 text-white tracking-wide"
    : visual.shortLabel === "VCA"
      ? "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
      : "border-border bg-muted text-muted-foreground";

  if (!visual.logoUrl || failed) {
    return (
      <div className={`flex items-center justify-center rounded-md border text-[10px] font-semibold ${fallbackClass} ${className}`}>
        {visual.shortLabel}
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center rounded-md border border-border bg-white p-1 ${className}`}>
      <img
        src={visual.logoUrl}
        alt={`${visual.shortLabel} logo`}
        className="max-h-full max-w-full object-contain"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

const ACCREDITATION_PRESETS = [
  {
    category: "quality_mark",
    accreditation_type: "veb_pbo_kwaliteitsregeling",
    label: "VEB PBO Kwaliteitsregeling",
    issuer: "Vereniging Erkende Beveiligingsbedrijven (VEB)",
    group: "Particuliere beveiliging",
    licenseTypes: ["ND", "BD"],
    activityKeys: ["private_security", "object_security", "mobile_surveillance", "reception_host"],
    description: "Voor particuliere beveiligingsorganisaties en reguliere beveiligingsdiensten.",
  },
  {
    category: "quality_mark",
    accreditation_type: "nvb_keurmerk_beveiliging",
    label: "Nederlandse Veiligheidsbranche Keurmerk Beveiliging",
    issuer: "Nederlandse Veiligheidsbranche",
    group: "Particuliere beveiliging",
    licenseTypes: ["ND", "BD"],
    activityKeys: ["private_security", "object_security", "mobile_surveillance", "reception_host"],
    description: "Relevant bij reguliere beveiliging, objectbeveiliging en mobiele surveillance.",
  },
  {
    category: "quality_mark",
    accreditation_type: "vvnl_kwaliteitslabel_regulier",
    label: "Kwaliteitslabel Veiligheidsdomein - Reguliere beveiliging",
    issuer: "Sociaal Fonds Veiligheidsdomein (SFV)",
    group: "Particuliere beveiliging",
    licenseTypes: ["ND", "BD"],
    activityKeys: ["private_security", "object_security", "mobile_surveillance", "reception_host"],
    description: "Voor reguliere beveiligingsdiensten binnen het veiligheidsdomein.",
  },
  {
    category: "quality_mark",
    accreditation_type: "nvb_keurmerk_evenementenbeveiliging",
    label: "Nederlandse Veiligheidsbranche Keurmerk Evenementenbeveiliging",
    issuer: "Nederlandse Veiligheidsbranche",
    group: "Evenementen en horeca",
    licenseTypes: ["ND", "HND", "HBD"],
    activityKeys: ["event_hospitality_security"],
    description: "Voor bedrijven die evenementenbeveiliging uitvoeren.",
  },
  {
    category: "quality_mark",
    accreditation_type: "nvb_keurmerk_horecabeveiliging",
    label: "Nederlandse Veiligheidsbranche Keurmerk Horecabeveiliging",
    issuer: "Nederlandse Veiligheidsbranche",
    group: "Evenementen en horeca",
    licenseTypes: ["HND", "HBD"],
    activityKeys: ["event_hospitality_security"],
    description: "Voor horecabeveiliging en portiersdiensten.",
  },
  {
    category: "quality_mark",
    accreditation_type: "vvnl_kwaliteitslabel_ehb",
    label: "Kwaliteitslabel Veiligheidsdomein - Horeca- en evenementenbeveiliging",
    issuer: "Sociaal Fonds Veiligheidsdomein (SFV)",
    group: "Evenementen en horeca",
    licenseTypes: ["ND", "HND", "HBD"],
    activityKeys: ["event_hospitality_security"],
    description: "Voor evenementen- en horecabeveiliging.",
  },
  {
    category: "quality_mark",
    accreditation_type: "nvb_keurmerk_gwt",
    label: "Nederlandse Veiligheidsbranche Keurmerk GWT",
    issuer: "Nederlandse Veiligheidsbranche",
    group: "Geld- en waardentransport",
    licenseTypes: ["PGW"],
    activityKeys: ["cash_value_transport"],
    description: "Voor geld- en waardentransportbedrijven.",
  },
  {
    category: "quality_mark",
    accreditation_type: "nvb_keurmerk_pob",
    label: "Nederlandse Veiligheidsbranche Keurmerk POB",
    issuer: "Nederlandse Veiligheidsbranche",
    group: "Recherche",
    licenseTypes: ["POB"],
    activityKeys: ["private_investigation"],
    description: "Voor particuliere onderzoeksbureaus.",
  },
  {
    category: "quality_mark",
    accreditation_type: "bpob_keurmerk_particulier_onderzoeksbureau",
    label: "BPOB Keurmerk Particulier Onderzoeksbureau",
    issuer: "Branchevereniging Particuliere Onderzoeksbureaus (BPOB)",
    group: "Recherche",
    licenseTypes: ["POB"],
    activityKeys: ["private_investigation"],
    description: "Voor particuliere recherche en onderzoeksbureaus.",
  },
  {
    category: "quality_mark",
    accreditation_type: "nvb_bhv_opleidingsinstituut",
    label: "NVB-BHV Opleidingsinstituut / instructeursregistratie",
    issuer: "Nederlandse Vereniging Bedrijfshulpverlening (NVB-BHV)",
    group: "Aanvullende diensten",
    licenseTypes: [],
    activityKeys: ["bhv"],
    description: "Voor BHV-opleiders en instructeursregistratie.",
  },
  {
    category: "technical_certification",
    accreditation_type: "borg_e",
    label: "BORG-E elektronische inbraakbeveiliging",
    issuer: "CCV / erkende certificatie-instelling",
    group: "Technische beveiliging",
    licenseTypes: [],
    activityKeys: ["security_installation", "technical_security_other"],
    description: "Voor elektronische inbraakbeveiligingsinstallaties.",
  },
  {
    category: "technical_certification",
    accreditation_type: "borg_b",
    label: "BORG-B bouwkundige inbraakbeveiliging",
    issuer: "CCV / erkende certificatie-instelling",
    group: "Technische beveiliging",
    licenseTypes: [],
    activityKeys: ["security_installation", "technical_security_other"],
    description: "Voor bouwkundige inbraakbeveiliging.",
  },
  {
    category: "technical_certification",
    accreditation_type: "veb_4",
    label: "VEB 4 kwaliteitsregeling",
    issuer: "Vereniging Erkende Beveiligingsbedrijven (VEB)",
    group: "Technische beveiliging",
    licenseTypes: [],
    activityKeys: ["security_installation", "technical_security_other"],
    description: "Voor technische beveiligingsbedrijven en installateurs.",
  },
  {
    category: "technical_certification",
    accreditation_type: "ccv_bmi_leveren",
    label: "CCV Leveren brandmeldinstallaties",
    issuer: "CCV / erkende certificatie-instelling",
    group: "Brandveiligheidstechniek",
    licenseTypes: [],
    activityKeys: ["fire_alarm_installation", "fire_alarm_panel_bmc", "technical_security_other"],
    description: "Voor leveren van brandmeldinstallaties.",
  },
  {
    category: "technical_certification",
    accreditation_type: "ccv_bmi_onderhoud",
    label: "CCV Onderhoud brandmeldinstallaties",
    issuer: "CCV / erkende certificatie-instelling",
    group: "Brandveiligheidstechniek",
    licenseTypes: [],
    activityKeys: ["fire_alarm_installation", "fire_alarm_panel_bmc", "technical_security_other"],
    description: "Voor onderhoud aan brandmeldinstallaties.",
  },
  {
    category: "technical_certification",
    accreditation_type: "ccv_bmi_oai_installeren",
    label: "CCV Installeren BMI/OAI",
    issuer: "CCV / erkende certificatie-instelling",
    group: "Brandveiligheidstechniek",
    licenseTypes: [],
    activityKeys: ["fire_alarm_installation", "fire_alarm_panel_bmc", "technical_security_other"],
    description: "Voor installatie van brandmeld- en ontruimingsalarminstallaties.",
  },
  {
    category: "technical_certification",
    accreditation_type: "ccv_oai",
    label: "CCV Ontruimingsalarminstallaties",
    issuer: "CCV / erkende certificatie-instelling",
    group: "Brandveiligheidstechniek",
    licenseTypes: [],
    activityKeys: ["fire_alarm_installation", "fire_alarm_panel_bmc", "technical_security_other"],
    description: "Voor ontruimingsalarminstallaties.",
  },
];

const GENERAL_ACCREDITATION_PRESETS = [
  {
    category: "quality_mark",
    accreditation_type: "iso_9001",
    label: "ISO 9001",
    issuer: "Erkende certificatie-instelling",
    group: "Algemene ISO-certificeringen",
    description: "Kwaliteitsmanagement: legt processen, verantwoordelijkheden, interne audits en continue verbetering vast zodat dienstverlening aantoonbaar beheerst is.",
    defaultReasons: ["Optioneel"],
    alwaysSuggest: true,
  },
  {
    category: "quality_mark",
    accreditation_type: "iso_27001",
    label: "ISO/IEC 27001",
    issuer: "Erkende certificatie-instelling",
    group: "Algemene ISO-certificeringen",
    description: "Informatiebeveiliging: borgt risicoanalyse, toegangsbeheer, incidentafhandeling en bescherming van klant-, object- en personeelsgegevens.",
    defaultReasons: ["Optioneel"],
    alwaysSuggest: true,
  },
  {
    category: "quality_mark",
    accreditation_type: "iso_45001",
    label: "ISO 45001",
    issuer: "Erkende certificatie-instelling",
    group: "Algemene ISO-certificeringen",
    description: "Arbomanagement: helpt aantonen dat veilig en gezond werken structureel is georganiseerd voor beveiligers, supervisors en uitvoerend personeel.",
    defaultReasons: ["Optioneel"],
    alwaysSuggest: true,
  },
  {
    category: "quality_mark",
    accreditation_type: "iso_14001",
    label: "ISO 14001",
    issuer: "Erkende certificatie-instelling",
    group: "Algemene ISO-certificeringen",
    description: "Milieumanagement: relevant bij aanbestedingen en grotere opdrachtgevers wanneer duurzaamheid, vervoer, afval en energie aantoonbaar beheerst moeten zijn.",
    defaultReasons: ["Optioneel"],
    alwaysSuggest: true,
  },
  {
    category: "quality_mark",
    accreditation_type: "iso_22301",
    label: "ISO 22301",
    issuer: "Erkende certificatie-instelling",
    group: "Algemene ISO-certificeringen",
    description: "Business continuity: gericht op continuiteit van kritieke processen, bijvoorbeeld meldkamer-, alarmopvolging- en operationele dienstverlening.",
    defaultReasons: ["Optioneel"],
    alwaysSuggest: true,
  },
  {
    category: "quality_mark",
    accreditation_type: "iso_18788",
    label: "ISO 18788",
    issuer: "Erkende certificatie-instelling",
    group: "Beveiligingsspecifieke ISO-certificeringen",
    licenseTypes: ["ND", "BD", "HND", "HBD", "PGW", "PAC", "POB"],
    activityKeys: ["private_security", "object_security", "mobile_surveillance", "reception_host", "event_hospitality_security", "cash_value_transport", "private_investigation"],
    description: "Managementsysteem voor private security operations: internationaal kader voor risicobeheersing, wettelijke naleving, mensenrechten en operationele beveiligingsdiensten.",
    defaultReasons: ["Optioneel"],
    alwaysSuggest: true,
  },
  {
    category: "quality_mark",
    accreditation_type: "vca",
    label: "VCA",
    issuer: "SSVV / erkende certificatie-instelling",
    group: "Veilig werken",
    activityKeys: ["security_installation", "fire_alarm_installation", "fire_alarm_panel_bmc", "technical_security_other", "traffic_controller", "fire_watch"],
    description: "Veiligheid, gezondheid en milieu voor risicovol uitvoerend werk.",
  },
];

const MANUAL_ACCREDITATION_PRESET = {
  category: "other",
  accreditation_type: "other",
  label: "Andere erkenning of certificering",
  issuer: "",
  group: "Overig",
  description: "Gebruik dit wanneer de erkenning niet tussen de voorgestelde opties staat.",
  relevanceReasons: ["Handmatig"],
};

const BRANCH_REQUIRED_ACCREDITATION_KEYS = {
  nederlandse_veiligheidsbranche: {
    mkb: ["quality_mark:nvb_keurmerk_beveiliging"],
    ehb: ["quality_mark:nvb_keurmerk_evenementenbeveiliging", "quality_mark:nvb_keurmerk_horecabeveiliging"],
    gwt: ["quality_mark:nvb_keurmerk_gwt"],
    pob: ["quality_mark:nvb_keurmerk_pob"],
  },
  vereniging_veiligheidsdomein_nederland: {
    reguliere_beveiliging: ["quality_mark:vvnl_kwaliteitslabel_regulier"],
    evenementen_horeca: ["quality_mark:vvnl_kwaliteitslabel_ehb"],
  },
  veb: {
    techniek: ["technical_certification:veb_4"],
    pbo: ["quality_mark:veb_pbo_kwaliteitsregeling"],
  },
  nvb_bhv: {
    opleidingsinstituut_instructeur: ["quality_mark:nvb_bhv_opleidingsinstituut"],
  },
};

const BRANCH_MEMBERSHIP_LABELS = {
  nederlandse_veiligheidsbranche: "Nederlandse Veiligheidsbranche",
  vereniging_veiligheidsdomein_nederland: "Vereniging Veiligheidsdomein Nederland (VVNL)",
  veb: "Vereniging Erkende Beveiligingsbedrijven (VEB)",
  nvb_bhv: "Nederlandse Vereniging Bedrijfshulpverlening (NVB-BHV)",
};

const BRANCH_MEMBERSHIP_TYPE_LABELS = {
  mkb: "MKB - particuliere beveiliging",
  ehb: "EHB - evenementen en horeca",
  gwt: "GWT - geld- en waardetransport",
  pob: "POB - particulier onderzoeksbureau",
  reguliere_beveiliging: "Reguliere beveiliging",
  evenementen_horeca: "Evenementen-/horecabeveiliging",
  techniek: "Techniek",
  pbo: "PBO",
  opleidingsinstituut_instructeur: "Opleidingsinstituut / instructeur",
};

function optionLabel(category, value) {
  return (OPTIONS_BY_CATEGORY[category] || [])
    .find(o => o.key === value)?.label || LEGACY_ACCREDITATION_LABELS[`${category}:${value}`] || value || "Erkenning";
}

function categoryLabel(category) {
  return CATEGORY_OPTIONS.find(o => o.key === category)?.label || category || "Erkenning";
}

function presetKey(preset) {
  return `${preset.category}:${preset.accreditation_type}`;
}

function presetFromKey(key) {
  const [category, accreditationType] = key.split(":");
  return [...ACCREDITATION_PRESETS, ...GENERAL_ACCREDITATION_PRESETS]
    .find(preset => preset.category === category && preset.accreditation_type === accreditationType);
}

function companyActivityKeys(company) {
  return [...new Set([
    company?.primary_activity,
    ...(company?.activities || []),
    ...(company?.teamhub_service_types || []),
  ].filter(Boolean))];
}

function presetHasContextMatch(preset, activityKeys, licenseType, requiredKeys) {
  if (requiredKeys?.has(presetKey(preset))) return true;
  if (preset.alwaysSuggest || preset.defaultReasons?.length > 0) return true;
  if (licenseType && preset.licenseTypes?.includes(licenseType)) return true;
  return (preset.activityKeys || []).some(key => activityKeys.includes(key));
}

function presetRelevanceReasons(preset, licenseType, requiredKeys) {
  const isRequired = requiredKeys?.has(presetKey(preset));
  if (isRequired) return ["Verplicht via branche"];

  const reasons = [];
  if (licenseType && preset.licenseTypes?.includes(licenseType)) {
    reasons.push(`${licenseType} - ${getWpbrLicenseLabel(licenseType)}`);
  }
  reasons.push(...(preset.defaultReasons || []));
  return reasons;
}

function presetForType(category, type) {
  return [...ACCREDITATION_PRESETS, ...GENERAL_ACCREDITATION_PRESETS]
    .find(preset => preset.category === category && preset.accreditation_type === type);
}

function membershipTypeKeysForRequirement(membership, associationRequirements) {
  if (Array.isArray(membership.membership_types) && membership.membership_types.length > 0) {
    return membership.membership_types;
  }

  const legacyTypeText = (membership.membership_type || "").toLowerCase();
  if (!legacyTypeText) return [];

  return Object.keys(associationRequirements).filter(typeKey => {
    const label = (BRANCH_MEMBERSHIP_TYPE_LABELS[typeKey] || typeKey).toLowerCase();
    return legacyTypeText.includes(label) || legacyTypeText.includes(typeKey.replace(/_/g, " "));
  });
}

function customIssuerOptionsFromAccreditations(accreditations = []) {
  const byKey = new Map();

  (accreditations || []).forEach(item => {
    if (!usesCustomIssuerField(item.category, item.accreditation_type)) return;

    const issuer = normalizeIssuerName(item.issuer || "");
    if (!issuer || isGenericIsoIssuer(issuer)) return;

    const key = issuer.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, issuer);
  });

  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "nl"));
}

function requiredAccreditationActionsForMemberships(memberships = []) {
  const byKey = new Map();

  (memberships || [])
    .filter(membership => !membership.status || membership.status === "active")
    .forEach(membership => {
      const associationRequirements = BRANCH_REQUIRED_ACCREDITATION_KEYS[membership.association_type] || {};
      const selectedTypes = membershipTypeKeysForRequirement(membership, associationRequirements);

      selectedTypes.forEach(typeKey => {
        const requiredKeys = associationRequirements[typeKey] || [];
        requiredKeys.forEach(requiredKey => {
          const preset = presetFromKey(requiredKey);
          if (!preset) return;
          byKey.set(requiredKey, {
            category: preset.category,
            accreditation_type: preset.accreditation_type,
            name: preset.label,
            issuer: issuerForDisplay(preset.issuer, preset.accreditation_type),
            source_association_label: BRANCH_MEMBERSHIP_LABELS[membership.association_type] || membership.association_name || "Branchevereniging",
            source_membership_label: BRANCH_MEMBERSHIP_TYPE_LABELS[typeKey] || typeKey,
          });
        });
      });
    });

  return [...byKey.values()];
}

function relevantAccreditationPresets(company, licenseType, activeAccreditations = [], branchRequiredActions = []) {
  const activityKeys = companyActivityKeys(company);
  const requiredKeys = new Set(branchRequiredActions.map(presetKey));
  const existingKeys = new Set(
    (activeAccreditations || [])
      .map(item => item.category && item.accreditation_type ? `${item.category}:${item.accreditation_type}` : null)
      .filter(Boolean)
  );

  const relevant = ACCREDITATION_PRESETS
    .map(preset => ({
      ...preset,
      relevanceReasons: presetRelevanceReasons(preset, licenseType, requiredKeys),
      alreadyRegistered: existingKeys.has(presetKey(preset)),
    }))
    .filter(preset => presetHasContextMatch(preset, activityKeys, licenseType, requiredKeys))
    .sort((a, b) => {
      if (a.alreadyRegistered !== b.alreadyRegistered) return a.alreadyRegistered ? 1 : -1;
      return a.group.localeCompare(b.group, "nl") || a.label.localeCompare(b.label, "nl");
    });

  const general = GENERAL_ACCREDITATION_PRESETS
    .map(preset => ({
      ...preset,
      relevanceReasons: presetRelevanceReasons(preset, licenseType, requiredKeys),
      alreadyRegistered: existingKeys.has(presetKey(preset)),
    }))
    .filter(preset => presetHasContextMatch(preset, activityKeys, licenseType, requiredKeys))
    .sort((a, b) => {
      if (a.alreadyRegistered !== b.alreadyRegistered) return a.alreadyRegistered ? 1 : -1;
      return a.group.localeCompare(b.group, "nl") || a.label.localeCompare(b.label, "nl");
    });

  return [...relevant, ...general];
}

function displayAccreditationName(item) {
  const label = optionLabel(item.category, item.accreditation_type);
  const hasKnownLabel = label && label !== item.accreditation_type;
  return hasKnownLabel && !isManualAccreditationType(item.category, item.accreditation_type) ? label : item.name || label;
}

function accreditationNumberMeta(form) {
  const type = form.accreditation_type || "";
  if (type.startsWith("iso_") || type === "vca" || type.startsWith("borg_") || type.startsWith("ccv_")) {
    return {
      label: "Certificaatnummer",
      help: "Gebruik het certificaatnummer van de uitgevende certificatie-instelling.",
    };
  }
  if (type.startsWith("nvb_keurmerk") || type.startsWith("vvnl_") || type === "bpob_keurmerk_particulier_onderzoeksbureau") {
    return {
      label: "Keurmerknummer / registratienummer",
      help: "Gebruik het nummer uit het keurmerk- of kwaliteitslabelregister als dat beschikbaar is.",
    };
  }
  if (type === "nvb_bhv_opleidingsinstituut") {
    return {
      label: "Registratienummer",
      help: "Gebruik het opleidingsinstituut- of instructeursregistratienummer.",
    };
  }
  return {
    label: "Certificaatnummer / registratienummer",
    help: "Gebruik het nummer op het certificaat of in het officiële register. Laat leeg als er geen nummer is.",
  };
}

function groupPresets(presets) {
  return Object.entries(
    (presets || []).reduce((groups, preset) => {
      const group = preset.group || "Overig";
      return { ...groups, [group]: [...(groups[group] || []), preset] };
    }, {})
  );
}

function isArchivedStatus(status) {
  return status === "superseded" || status === "archived";
}

function isActionItem(item) {
  if (isArchivedStatus(item.status)) return false;
  const today = new Date().toISOString().split("T")[0];
  return item.status === "expired" || item.status === "pending_review" ||
    (item.valid_until && item.valid_until < today);
}

function statusBadge(item) {
  if (isArchivedStatus(item.status)) return <Badge variant="outline" className="text-xs text-muted-foreground border-border">Gearchiveerd</Badge>;
  const today = new Date().toISOString().split("T")[0];
  const expiredByDate = item.valid_until && item.valid_until < today;
  if (item.status === "suspended") return <Badge variant="outline" className="text-xs text-destructive border-destructive/40">Geschorst</Badge>;
  if (item.status === "pending_review") return <Badge className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-0">Actie nodig</Badge>;
  if (item.status === "expired" || expiredByDate) return <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">Verlopen</Badge>;
  return <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200 border-0">Actief</Badge>;
}

function ValidityText({ item }) {
  const hasValidity = item.valid_from || item.valid_until;
  if (!hasValidity) return <span className="text-xs text-muted-foreground">Geen einddatum</span>;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {item.valid_from && <span>Vanaf: <strong className="text-foreground">{item.valid_from}</strong></span>}
      {item.valid_until && <span>Tot: <strong className="text-foreground">{item.valid_until}</strong></span>}
    </div>
  );
}

function DeleteConfirmBar({ label, onConfirm, onCancel, isPending }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const handleConfirm = () => {
    if (password !== DELETE_PASSWORD) { setError(`Typ "${DELETE_PASSWORD}" om te bevestigen`); return; }
    onConfirm();
  };
  return (
    <div className="border-b border-destructive/20 bg-destructive/5 p-4">
      <div className="flex items-start gap-3 mb-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground">Erkenning verwijderen?</p>
          <p className="text-xs text-muted-foreground mt-0.5"><strong>{label}</strong> wordt verwijderd.</p>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground block">Typ <strong className="text-foreground font-mono">{DELETE_PASSWORD}</strong> om te bevestigen:</label>
        <div className="flex gap-2">
          <Input value={password} onChange={e => { setPassword(e.target.value); setError(""); }} placeholder={DELETE_PASSWORD} className={`h-8 text-sm font-mono max-w-[200px] ${error ? "border-destructive" : ""}`} onKeyDown={e => e.key === "Enter" && handleConfirm()} autoFocus />
          <Button variant="destructive" size="sm" onClick={handleConfirm} disabled={isPending}><Trash2 className="w-3.5 h-3.5 mr-1" />{isPending ? "Verwijderen..." : "Verwijderen"}</Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Annuleren</Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

function WizardSteps({ step }) {
  const steps = ["Erkenning", "Gegevens", "Document"];
  return (
    <div className="flex items-center gap-1 mb-4">
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-colors ${i + 1 === step ? "bg-primary text-primary-foreground" : i + 1 < step ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "text-muted-foreground"}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${i + 1 === step ? "bg-primary-foreground text-primary" : i + 1 < step ? "text-green-700 dark:text-green-300" : "border border-muted-foreground/30 text-muted-foreground"}`}>
              {i + 1 < step ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg> : i + 1}
            </span>
            {s}
          </div>
          {i < steps.length - 1 && <div className={`h-px flex-1 ${i + 1 < step ? "bg-green-200 dark:bg-green-900" : "bg-border"}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function AccreditationPresetRow({ preset, selected, onSelect }) {
  const isDisabled = preset.alreadyRegistered;
  const badgeClass = (reason) => {
    if (reason === "Verplicht via branche") return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border-0";
    if (reason === "Optioneel") return "bg-muted text-muted-foreground border-0";
    return "";
  };

  return (
    <button
      type="button"
      onClick={() => !isDisabled && onSelect(preset)}
      disabled={isDisabled}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md border text-left transition-colors ${
        isDisabled
          ? "border-border bg-muted/20 cursor-not-allowed opacity-60"
          : selected
            ? "border-primary bg-primary/10"
            : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"
      }`}
    >
      <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        isDisabled
          ? "border-green-400 bg-green-100 dark:bg-green-900/40"
          : selected
            ? "border-primary bg-primary"
            : "border-muted-foreground/30"
      }`}>
        {isDisabled
          ? <Check className="h-3 w-3 text-green-700 dark:text-green-400" />
          : selected
            ? <Check className="h-3 w-3 text-primary-foreground" />
            : null}
      </div>
      <IssuerLogo
        issuer={preset.issuer}
        accreditationType={preset.accreditation_type}
        label={preset.label}
        className="h-9 w-12 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{preset.label}</p>
        <p className="text-xs text-muted-foreground truncate">{preset.issuer || preset.description}</p>
        {preset.description && (
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground/90">
            {preset.description}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-1 shrink-0 items-center">
        {!isDisabled && (preset.relevanceReasons || []).map(reason => (
          <Badge key={reason} variant="secondary" className={`text-[11px] whitespace-nowrap ${badgeClass(reason)}`}>
            {reason}
          </Badge>
        ))}
        {isDisabled && (
          <Badge variant="outline" className="text-[11px] text-green-700 dark:text-green-400 border-green-300 dark:border-green-700 whitespace-nowrap">
            Al actief
          </Badge>
        )}
      </div>
    </button>
  );
}

function AccreditationPresetStep({ presets, manualPreset, selectedKey, onSelect, licenseType }) {
  const groups = groupPresets(presets);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Kies een erkenning</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Erkenningen die al actief zijn kunnen niet opnieuw worden toegevoegd.
          </p>
        </div>
        {licenseType && (
          <Badge variant="outline" className="text-xs">
            WPBR {licenseType}
          </Badge>
        )}
      </div>

      <div className="space-y-3">
        {groups.map(([group, groupPresetsForGroup]) => (
          <section key={group}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">{group}</p>
            <div className="space-y-1">
              {groupPresetsForGroup.map(preset => (
                <AccreditationPresetRow
                  key={presetKey(preset)}
                  preset={preset}
                  selected={selectedKey === presetKey(preset)}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">Overig</p>
        <button
          type="button"
          onClick={() => onSelect(manualPreset)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md border text-left transition-colors ${
            selectedKey === presetKey(manualPreset)
              ? "border-primary bg-primary/10"
              : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"
          }`}
        >
          <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            selectedKey === presetKey(manualPreset) ? "border-primary bg-primary" : "border-muted-foreground/30"
          }`}>
            {selectedKey === presetKey(manualPreset) && <Check className="h-3 w-3 text-primary-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Staat de juiste erkenning er niet tussen?</p>
            <p className="text-xs text-muted-foreground">Voeg handmatig een andere erkenning of certificering toe.</p>
          </div>
          <Badge variant="secondary" className="text-[11px] whitespace-nowrap shrink-0">Handmatig</Badge>
        </button>
      </section>
    </div>
  );
}

function IssuerSelectField({ value, options, creating, onSelect, onCustomChange, error, mode = "manual" }) {
  const selectValue = creating
    ? CUSTOM_ISSUER_NEW_VALUE
    : options.some(option => option === value)
      ? value
      : "";
  const isIso = mode === "iso";

  return (
    <div className="space-y-1">
      <Label>Uitgevende instantie</Label>
      <Select value={selectValue} onValueChange={onSelect}>
        <SelectTrigger className={`h-8 ${error ? "border-destructive" : ""}`}>
          <SelectValue placeholder={isIso ? "Kies certificatie-instelling" : "Kies instantie"} />
        </SelectTrigger>
        <SelectContent>
          {options.map(option => (
            <SelectItem key={option} value={option}>{option}</SelectItem>
          ))}
          <SelectItem value={CUSTOM_ISSUER_NEW_VALUE}>Nieuwe instantie toevoegen</SelectItem>
        </SelectContent>
      </Select>
      {creating && (
        <Input
          className={`h-8 ${error ? "border-destructive" : ""}`}
          value={value}
          onChange={e => onCustomChange(e.target.value)}
          placeholder={isIso ? "Naam certificatie-instelling" : "Naam uitgevende instantie"}
        />
      )}
      <p className="text-[11px] text-muted-foreground">
        {isIso
          ? "Gebruik de certificerende partij die op het ISO-certificaat staat."
          : "Gebruik de organisatie of instantie die de erkenning afgeeft."}
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// Row with context menu for action/expired items, direct preview for items with document
function AccreditationRow({ item, onEdit, onDelete, onRenew, onPreview }) {
  const [contextMenu, setContextMenu] = useState(null);
  const contextRef = useRef(null);
  const needsAction = isActionItem(item);
  const categoryText = categoryLabel(item.category);
  const titleText = displayAccreditationName(item);
  const displayIssuer = issuerForDisplay(item.issuer, item.accreditation_type);
  const subtitleText = [displayIssuer, item.certificate_number].filter(Boolean).join(" - ") || optionLabel(item.category, item.accreditation_type);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = e => { if (contextRef.current && !contextRef.current.contains(e.target)) setContextMenu(null); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  const handleRowClick = e => {
    if (item.status === "pending_review") {
      onEdit(item);
    } else if (needsAction && item.document_file_url) {
      const rect = e.currentTarget.getBoundingClientRect();
      setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else if (needsAction && !item.document_file_url) {
      onRenew(item);
    } else if (item.document_file_url) {
      onPreview(item);
    }
  };

  const isClickable = needsAction || !!item.document_file_url;

  return (
    <div
      className={`relative ${ACCREDITATION_TABLE_GRID} items-center px-4 py-3 group transition-colors ${isClickable ? "cursor-pointer hover:bg-accent/40" : "hover:bg-accent/30"}`}
      onClick={handleRowClick}
    >
      <div className="min-w-0">
        <Badge variant="secondary" className="max-w-full text-xs">
          <span className="truncate">{categoryText}</span>
        </Badge>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <IssuerLogo
          issuer={displayIssuer}
          accreditationType={item.accreditation_type}
          label={titleText}
          className="h-8 w-11 shrink-0"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{titleText}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitleText}</p>
        </div>
      </div>
      <div className="min-w-0">{statusBadge(item)}</div>
      <div className="min-w-0">
        <ValidityText item={item} />
      </div>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{getAuditActorLabel(item)}</span>
      <div className="min-w-0 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        {item.document_file_url && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onPreview(item)} title="Document bekijken"><Eye className="h-3.5 w-3.5" /></Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(item)} title="Bewerken"><Edit className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => onDelete(item.id)} title="Verwijderen"><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>

      <AnimatePresence>
        {contextMenu && (
          <motion.div
            ref={contextRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            className="absolute z-50 min-w-[200px] rounded-lg border border-border bg-popover shadow-lg py-1 text-sm"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-accent transition-colors text-foreground"
              onClick={() => { setContextMenu(null); onRenew(item); }}
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
              Erkenning vernieuwen
            </button>
            {item.document_file_url && (
              <button
                className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-accent transition-colors text-foreground"
                onClick={() => { setContextMenu(null); onPreview(item); }}
              >
                <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                Document openen
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AccreditationsTab({ companyId, company }) {
  const queryClient = useQueryClient();
  const wizardRef = useRef(null);

  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [editingId, setEditingId] = useState(null);
  const [renewingId, setRenewingId] = useState(null);
  const [isArchiveEntry, setIsArchiveEntry] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);
  const [formPreviewOpen, setFormPreviewOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [creatingIssuer, setCreatingIssuer] = useState(false);

  useEffect(() => {
    if (showWizard) {
      const timer = setTimeout(() => wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
      return () => clearTimeout(timer);
    }
  }, [wizardStep, showWizard]);

  const { data: accreditations = [] } = useQuery({
    queryKey: ["company-accreditations", companyId],
    queryFn: () => base44.entities.CompanyAccreditation.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId,
  });

  const { data: wpbrLicenses = [] } = useQuery({
    queryKey: ["wpbr-licenses", companyId],
    queryFn: () => base44.entities.CompanyWpbrLicense.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId,
  });

  const { data: branchMemberships = [] } = useQuery({
    queryKey: ["company-branch-memberships", companyId],
    queryFn: () => base44.entities.CompanyBranchMembership.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId,
  });
  const { data: currentUser = null } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });

  const branchRequiredActions = useMemo(
    () => requiredAccreditationActionsForMemberships(branchMemberships),
    [branchMemberships]
  );

  const branchRequiredActionByKey = useMemo(
    () => new Map(branchRequiredActions.map(action => [presetKey(action), action])),
    [branchRequiredActions]
  );

  const customIssuerOptions = useMemo(
    () => customIssuerOptionsFromAccreditations(accreditations),
    [accreditations]
  );

  const getDocumentDescriptor = (data) => buildManagedFileDescriptor({
    filename: data.document_download_filename || data.document_filename || "erkenningsdocument.pdf",
    ownerType: "company",
    ownerId: companyId,
    companyId,
    ownerLabel: company?.display_name || company?.legal_name || "Bedrijf",
    domain: "compliance",
    category: "company_accreditation",
    documentLabel: data.name || optionLabel(data.category, data.accreditation_type),
    documentNumber: data.certificate_number || null,
    validFrom: data.valid_from || null,
    validUntil: data.valid_until || null,
    folderSegments: ["erkenningen", data.category, data.accreditation_type],
  });

  const withCurrentDocumentDescriptor = (data) => {
    if (!data.document_file_url) return data;

    const descriptor = getDocumentDescriptor(data);
    return {
      ...data,
      document_filename: descriptor.download_filename,
      document_download_filename: descriptor.download_filename,
      document_logical_path: descriptor.logical_path,
      document_metadata: {
        ...(data.document_metadata || {}),
        managed_file_id: data.document_file_id || data.document_metadata?.managed_file_id || null,
        folder_path: descriptor.folder_path,
        category: data.category,
        accreditation_type: data.accreditation_type,
      },
    };
  };

  const syncManagedDocumentDescriptor = async (data, sourceEntityId) => {
    if (!data.document_file_id) return;

    const descriptor = getDocumentDescriptor(data);
    await updateManagedFileSource(data.document_file_id, {
      owner_id: companyId,
      company_id: companyId,
      source_entity_id: sourceEntityId,
      display_filename: descriptor.display_filename,
      download_filename: descriptor.download_filename,
      logical_path: descriptor.logical_path,
      folder_path: descriptor.folder_path,
      document_label: data.name || optionLabel(data.category, data.accreditation_type),
      document_number: data.certificate_number || null,
      valid_from: data.valid_from || null,
      valid_until: data.valid_until || null,
      metadata: {
        ...(data.document_metadata || {}),
        managed_file_id: data.document_file_id,
        folder_path: descriptor.folder_path,
        category: data.category,
        accreditation_type: data.accreditation_type,
      },
    });
  };

  const withDocumentAudit = (data, action) => ({
    ...data,
    document_metadata: data.document_file_url
      ? buildAuditMetadata(currentUser, action, data.document_metadata || {})
      : data.document_metadata || null,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const action = editingId ? "bijgewerkt" : renewingId ? "vernieuwd" : "toegevoegd";
      const normalizedData = withDocumentAudit(withCurrentDocumentDescriptor(data), action);
      const payload = {
        ...normalizedData,
        company_id: companyId,
        issuer: normalizedData.issuer?.trim() || null,
        certificate_number: normalizedData.certificate_number?.trim() || null,
        valid_from: normalizedData.valid_from || null,
        valid_until: normalizedData.valid_until || null,
        notes: normalizedData.notes?.trim() || null,
      };

      if (editingId) {
        await syncManagedDocumentDescriptor(normalizedData, editingId);
        return base44.entities.CompanyAccreditation.update(editingId, { ...payload, status: normalizedData.status || "active" });
      }

      // Archive entry: save directly as superseded
      if (isArchiveEntry) {
        const created = await base44.entities.CompanyAccreditation.create({ ...payload, status: "superseded" });
        if (created?.id && normalizedData.document_file_id) {
          await syncManagedDocumentDescriptor(normalizedData, created.id);
        }
        return created;
      }

      // Renewal: supersede existing active/expired records of same type
      if (renewingId) {
        const sameType = accreditations.filter(a => a.accreditation_type === normalizedData.accreditation_type && !isArchivedStatus(a.status));
        await Promise.all(sameType.map(a => base44.entities.CompanyAccreditation.update(a.id, {
          status: "superseded",
          document_metadata: a.document_file_url
            ? buildAuditMetadata(currentUser, "vernieuwd", a.document_metadata || {})
            : a.document_metadata || null,
        })));
      }

      const created = await base44.entities.CompanyAccreditation.create({ ...payload, status: "active" });
      if (created?.id && normalizedData.document_file_id) {
        await syncManagedDocumentDescriptor(normalizedData, created.id);
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-accreditations", companyId] });
      cancelWizard();
    },
  });

  const recreateRequiredActionIfNeeded = async (item) => {
    if (!item || isArchivedStatus(item.status)) return;

    const key = presetKey(item);
    const requiredAction = branchRequiredActionByKey.get(key);
    if (!requiredAction) return;

    const hasRemainingActiveRecord = accreditations.some(accreditation =>
      accreditation.id !== item.id &&
      !isArchivedStatus(accreditation.status) &&
      presetKey(accreditation) === key
    );
    if (hasRemainingActiveRecord) return;

    await base44.entities.CompanyAccreditation.create({
      company_id: companyId,
      category: requiredAction.category,
      accreditation_type: requiredAction.accreditation_type,
      name: requiredAction.name,
      issuer: requiredAction.issuer,
      certificate_number: null,
      valid_from: null,
      valid_until: null,
      status: "pending_review",
      notes: `Opnieuw aangemaakt omdat deze erkenning verplicht is vanuit ${requiredAction.source_association_label} (${requiredAction.source_membership_label}). Vul nummer, geldigheid en bewijsstuk aan.`,
    });
  };

  const deleteMutation = useMutation({
    mutationFn: async (item) => {
      await base44.entities.CompanyAccreditation.delete(item.id);
      await recreateRequiredActionIfNeeded(item);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-accreditations", companyId] });
      setDeleteId(null);
    },
  });

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const setIssuer = (value) => {
    setForm(current => ({ ...current, issuer: value }));
    setErrors(current => ({ ...current, issuer: undefined }));
  };

  const selectIssuer = (value) => {
    if (value === CUSTOM_ISSUER_NEW_VALUE) {
      setCreatingIssuer(true);
      setIssuer("");
      return;
    }

    setCreatingIssuer(false);
    setIssuer(value);
  };

  const setCategory = (category) => {
    const accreditationType = manualTypeForCategory(category);
    setForm(current => ({
      ...current,
      category,
      accreditation_type: accreditationType,
    }));
    setErrors(current => ({ ...current, accreditation_type: undefined }));
  };

  const selectPreset = (preset) => {
    const presetIsManual = presetKey(preset) === presetKey(MANUAL_ACCREDITATION_PRESET);
    const presetIsIso = isIsoAccreditationType(preset.accreditation_type);
    setCreatingIssuer(presetIsManual);
    setForm(current => ({
      ...current,
      category: preset.category,
      accreditation_type: preset.accreditation_type,
      name: presetIsManual ? "" : preset.label,
      issuer: presetIsIso || presetIsManual ? "" : issuerForDisplay(preset.issuer || "", preset.accreditation_type),
    }));
    setErrors(current => ({ ...current, accreditation_type: undefined, name: undefined, issuer: undefined }));
  };

  const openNew = () => {
    setEditingId(null);
    setRenewingId(null);
    setIsArchiveEntry(false);
    setForm(EMPTY_FORM);
    setErrors({});
    setCreatingIssuer(false);
    setWizardStep(1);
    setShowWizard(true);
  };

  const openArchiveEntry = () => {
    setEditingId(null);
    setRenewingId(null);
    setIsArchiveEntry(true);
    setForm(EMPTY_FORM);
    setErrors({});
    setCreatingIssuer(false);
    setWizardStep(1);
    setShowWizard(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setRenewingId(null);
    setIsArchiveEntry(false);
    setForm({
      category: item.category || "technical_certification",
      accreditation_type: item.accreditation_type || "other",
      name: displayAccreditationName(item),
      issuer: issuerForForm(item.issuer, item.accreditation_type),
      certificate_number: item.certificate_number || "",
      valid_from: item.valid_from || "",
      valid_until: item.valid_until || "",
      status: item.status === "pending_review" ? "active" : item.status || "active",
      document_file_url: item.document_file_url || "",
      document_filename: item.document_filename || "",
      document_file_id: item.document_file_id || "",
      document_download_filename: item.document_download_filename || "",
      document_logical_path: item.document_logical_path || "",
      document_metadata: item.document_metadata || null,
      notes: item.notes || "",
    });
    setCreatingIssuer(false);
    setErrors({});
    setWizardStep(2);
    setShowWizard(true);
  };

  const openRenew = (item) => {
    setEditingId(null);
    setRenewingId(item.id);
    setIsArchiveEntry(false);
    setForm({
      ...EMPTY_FORM,
      category: item.category || "technical_certification",
      accreditation_type: item.accreditation_type || "other",
      name: displayAccreditationName(item),
      issuer: issuerForForm(item.issuer, item.accreditation_type),
      status: "active",
    });
    setCreatingIssuer(false);
    setErrors({});
    setWizardStep(2);
    setShowWizard(true);
  };

  const cancelWizard = () => {
    setShowWizard(false);
    setEditingId(null);
    setRenewingId(null);
    setIsArchiveEntry(false);
    setWizardStep(1);
    setForm(EMPTY_FORM);
    setErrors({});
    setCreatingIssuer(false);
    setFormPreviewOpen(false);
  };

  // True when the accreditation type is a known/predefined option (not free-form "other")
  const isKnownType = (category, type) => {
    const opts = OPTIONS_BY_CATEGORY[category] || OTHER_OPTIONS;
    if (isManualAccreditationType(category, type)) return false;
    return opts.some(o => o.key === type);
  };

  const validateStep1 = () => {
    const e = {};
    if (!form.category || !form.accreditation_type) {
      e.accreditation_type = "Kies eerst een erkenning.";
    }
    if (!isKnownType(form.category, form.accreditation_type) && !form.name?.trim()) {
      e.name = "Naam is verplicht";
    }
    if (usesCustomIssuerField(form.category, form.accreditation_type) && !normalizeIssuerName(form.issuer)) {
      e.issuer = isIsoAccreditationType(form.accreditation_type)
        ? "Kies een bestaande certificatie-instelling of voeg een nieuwe instantie toe."
        : "Kies een bestaande instantie of voeg een nieuwe instantie toe.";
    }
    const today = new Date().toISOString().slice(0, 10);
    if (!isArchiveEntry) {
      // New or renewal: valid_until must be today or in the future
      if (form.valid_until && form.valid_until < today) {
        e.valid_until = "Verlopen erkenningen kunnen alleen via het archief worden toegevoegd.";
      }
    } else {
      // Archive entry: valid_until must be in the past
      if (form.valid_until && form.valid_until >= today) {
        e.valid_until = "Archief is alleen voor verlopen erkenningen (einddatum moet in het verleden liggen).";
      }
    }
    // valid_from must not be after valid_until
    if (form.valid_from && form.valid_until && form.valid_from > form.valid_until) {
      e.valid_from = "Startdatum mag niet na de einddatum liggen.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleUpload = async (file) => {
    setUploading(true);
    try {
      const result = await uploadManagedFile({
        file,
        ownerType: "company",
        ownerId: companyId,
        companyId,
        ownerLabel: company?.display_name || company?.legal_name || "Bedrijf",
        domain: "compliance",
        category: "company_accreditation",
        sourceEntity: "CompanyAccreditation",
        sourceEntityId: editingId || null,
        sourceField: "document_file_url",
        documentLabel: form.name || optionLabel(form.category, form.accreditation_type),
        documentNumber: form.certificate_number || null,
        validFrom: form.valid_from || null,
        validUntil: form.valid_until || null,
        isSensitive: true,
        folderSegments: ["erkenningen", form.category, form.accreditation_type],
        metadata: { category: form.category, accreditation_type: form.accreditation_type },
        uploadedBy: currentUser,
        auditAction: renewingId ? "vernieuwd" : "toegevoegd",
      });
      const nextMetadata = buildAuditMetadata(currentUser, renewingId ? "vernieuwd" : "toegevoegd", {
        managed_file_id: result.managed_file_id,
        folder_path: result.folder_path,
      });
      setForm(current => ({
        ...current,
        document_file_url: result.file_url,
        document_filename: result.download_filename,
        document_file_id: result.managed_file_id,
        document_download_filename: result.download_filename,
        document_logical_path: result.logical_path,
        document_metadata: nextMetadata,
      }));
    } finally {
      setUploading(false);
    }
  };

  const activeAccreditations = accreditations.filter(a => !isArchivedStatus(a.status));
  const archivedAccreditations = accreditations.filter(a => isArchivedStatus(a.status) && a.document_file_url);
  const effectiveWpbrLicenseType = useMemo(
    () => getEffectiveWpbrLicenseType(company, wpbrLicenses),
    [company, wpbrLicenses]
  );
  const suggestedPresets = useMemo(
    () => relevantAccreditationPresets(company, effectiveWpbrLicenseType, activeAccreditations, branchRequiredActions),
    [company, effectiveWpbrLicenseType, activeAccreditations, branchRequiredActions]
  );
  const selectedPresetKey = form.category && form.accreditation_type ? `${form.category}:${form.accreditation_type}` : "";
  const selectedWizardPresetKey = isManualAccreditationType(form.category, form.accreditation_type)
    ? presetKey(MANUAL_ACCREDITATION_PRESET)
    : selectedPresetKey;
  const itemToDelete = accreditations.find(item => item.id === deleteId);
  const isRenewing = !!renewingId;
  const documentRequired = wizardStep === 3 && (isArchiveEntry || !editingId || form.status === "active");
  const missingRequiredDocument = documentRequired && !form.document_file_url;
  const currentFormDocument = withCurrentDocumentDescriptor(form);
  const currentFormDocumentFilename = currentFormDocument.document_download_filename || currentFormDocument.document_filename || "Document toegevoegd";
  const numberFieldMeta = accreditationNumberMeta(form);
  const currentIssuer = issuerForDisplay(form.issuer, form.accreditation_type);
  const isIsoForm = isIsoAccreditationType(form.accreditation_type);
  const isManualForm = isManualAccreditationType(form.category, form.accreditation_type);
  const hasCustomIssuerField = usesCustomIssuerField(form.category, form.accreditation_type);

  return (
    <div className="flex flex-col h-full">
      <AnimatePresence>
        {deleteId && itemToDelete && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
            <DeleteConfirmBar
              label={itemToDelete.name || optionLabel(itemToDelete.category, itemToDelete.accreditation_type)}
              onConfirm={() => deleteMutation.mutate(itemToDelete)}
              onCancel={() => setDeleteId(null)}
              isPending={deleteMutation.isPending}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showWizard && (
          <motion.div
            ref={wizardRef}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="border-b border-primary/30 bg-muted/20 p-5"
          >
            {editingId && <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">Erkenning bewerken</p>}
            {isRenewing && <p className="text-xs font-semibold text-amber-600 mb-3 uppercase tracking-wider">Erkenning vernieuwen — {form.name}</p>}
            {!editingId && !isRenewing && <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">Nieuwe erkenning</p>}

            <WizardSteps step={wizardStep} />

            <AnimatePresence mode="wait">
              <motion.div key={wizardStep} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: "easeOut" }}>

                {wizardStep === 1 && (
                  <div className="space-y-4">
                    <AccreditationPresetStep
                      presets={suggestedPresets}
                      manualPreset={MANUAL_ACCREDITATION_PRESET}
                      selectedKey={selectedWizardPresetKey}
                      onSelect={selectPreset}
                      licenseType={effectiveWpbrLicenseType}
                    />
                    {errors.accreditation_type && <p className="text-xs text-destructive">{errors.accreditation_type}</p>}
                    <div className="flex justify-between pt-1">
                      <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                      <Button size="sm" onClick={() => { if (form.category && form.accreditation_type) setWizardStep(2); else setErrors(er => ({ ...er, accreditation_type: "Kies eerst een erkenning." })); }}>
                        Volgende <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}

                {wizardStep === 2 && (
                  <div className="space-y-3">
                    {(() => {
                      const showManualCategoryPicker = isManualForm && !isRenewing;
                      return (
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                          {showManualCategoryPicker && (
                            <div className="space-y-1">
                              <Label>Categorie</Label>
                              <Select value={form.category} onValueChange={setCategory}>
                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {CATEGORY_OPTIONS.map(o => (
                                    <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {isManualForm ? (
                            <div className="space-y-1 lg:col-span-2">
                              <Label>Naam</Label>
                              <Input
                                className={`h-8 ${errors.name ? "border-destructive" : ""}`}
                                value={form.name}
                                onChange={e => { set("name", e.target.value); setErrors(er => ({ ...er, name: undefined })); }}
                              />
                              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                            </div>
                          ) : (
                            <div className="space-y-1 lg:col-span-2">
                              <Label className="text-muted-foreground">Erkenning</Label>
                              <div className="h-8 flex items-center gap-2 px-3 rounded-md bg-muted/50 border border-border text-sm text-foreground">
                                <IssuerLogo
                                  issuer={currentIssuer}
                                  accreditationType={form.accreditation_type}
                                  label={form.name}
                                  className="h-5 w-8 shrink-0"
                                />
                                <span className="truncate">{form.name}</span>
                              </div>
                            </div>
                          )}

                          {hasCustomIssuerField ? (
                            <div className="space-y-1">
                              <IssuerSelectField
                                value={form.issuer}
                                options={customIssuerOptions}
                                creating={creatingIssuer}
                                onSelect={selectIssuer}
                                onCustomChange={setIssuer}
                                error={errors.issuer}
                                mode={isIsoForm ? "iso" : "manual"}
                              />
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <Label className="text-muted-foreground">Uitgevende instantie</Label>
                              <div className="h-8 flex items-center gap-2 px-3 rounded-md bg-muted/50 border border-border text-sm text-muted-foreground">
                                <IssuerLogo
                                  issuer={currentIssuer}
                                  accreditationType={form.accreditation_type}
                                  label={form.name}
                                  className="h-5 w-8 shrink-0"
                                />
                                <span className="truncate">{currentIssuer || "-"}</span>
                              </div>
                            </div>
                          )}

                          <div className="space-y-1">
                            <Label>{numberFieldMeta.label}</Label>
                            <Input className="h-8" value={form.certificate_number} onChange={e => set("certificate_number", e.target.value)} placeholder="Optioneel" />
                            <p className="text-[11px] text-muted-foreground">{numberFieldMeta.help}</p>
                          </div>
                          <div className="space-y-1">
                            <Label>Geldig vanaf</Label>
                            <Input className={`h-8 ${errors.valid_from ? "border-destructive" : ""}`} type="date" value={form.valid_from} onChange={e => { set("valid_from", e.target.value); setErrors(er => ({ ...er, valid_from: undefined })); }} />
                            {errors.valid_from && <p className="text-xs text-destructive">{errors.valid_from}</p>}
                          </div>
                          <div className="space-y-1">
                            <Label>Geldig tot</Label>
                            <Input className={`h-8 ${errors.valid_until ? "border-destructive" : ""}`} type="date" value={form.valid_until} onChange={e => { set("valid_until", e.target.value); setErrors(er => ({ ...er, valid_until: undefined })); }} />
                            {errors.valid_until && <p className="text-xs text-destructive">{errors.valid_until}</p>}
                          </div>
                        </div>
                      );
                    })()}
                    <div className="flex justify-between pt-1">
                      <div className="flex gap-2">
                        {!editingId && !isRenewing && (
                          <Button variant="ghost" size="sm" onClick={() => setWizardStep(1)}>
                            <ChevronLeft className="w-4 h-4 mr-1" /> Terug
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                      </div>
                      <Button size="sm" onClick={() => { if (validateStep1()) setWizardStep(3); }}>
                        Volgende <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}

                {wizardStep === 3 && (
                  <div className="space-y-4">
                    <p className="text-sm font-medium text-foreground">Bewijsstuk {editingId ? "bijwerken" : "uploaden"}</p>
                    {documentRequired && (
                      <p className="text-xs text-muted-foreground">
                        Upload het officiële certificaat of erkenningsdocument (PDF of afbeelding). <span className="text-destructive font-medium">Verplicht.</span>
                      </p>
                    )}

                    {form.document_file_url ? (
                      <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card">
                        <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                        <span className="text-sm text-muted-foreground flex-1 truncate">{currentFormDocumentFilename}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setFormPreviewOpen(true)} className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700">
                          <Eye className="w-3.5 h-3.5" /> Bekijken
                        </Button>
                        <button onClick={() => { setFormPreviewOpen(false); setForm(f => ({ ...f, document_file_url: "", document_filename: "", document_file_id: "", document_download_filename: "", document_logical_path: "", document_metadata: null })); }} className="text-muted-foreground hover:text-destructive">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed border-border hover:border-primary cursor-pointer transition-colors">
                        <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                        <Upload className="w-6 h-6 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{uploading ? "Uploaden..." : "Klik om document te uploaden"}</span>
                        <span className="text-xs text-muted-foreground">PDF of afbeelding</span>
                      </label>
                    )}

                    {missingRequiredDocument && (
                      <p className="text-xs text-destructive">Upload eerst een bewijsstuk voordat je de status Actief opslaat.</p>
                    )}

                    <div className="flex justify-between pt-1">
                      <Button variant="ghost" size="sm" onClick={() => setWizardStep(2)}>
                        <ChevronLeft className="w-4 h-4 mr-1" /> Terug
                      </Button>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                        <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || missingRequiredDocument}>
                          <Check className="w-4 h-4 mr-1" />
                          {saveMutation.isPending ? "Opslaan..." : (editingId ? "Wijzigingen opslaan" : isRenewing ? "Erkenning vernieuwen" : "Erkenning opslaan")}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`${ACCREDITATION_TABLE_GRID} items-center px-4 py-2 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
        <span className="min-w-0">Categorie</span>
        <span className="min-w-0">Erkenning</span>
        <span className="min-w-0">Status</span>
        <span className="min-w-0">Geldigheid</span>
        <span className="min-w-0 truncate">Door</span>
        <div className="min-w-0 flex flex-nowrap items-center justify-end gap-2">
          {showArchive && <Badge className="bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 animate-pulse mr-1">Archief</Badge>}
          {!showWizard && !deleteId && (
            showArchive ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowArchive(false)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                  <ChevronLeft className="w-3 h-3 mr-1" /> Actieve erkenningen
                </Button>
                <Button size="sm" variant="outline" onClick={openArchiveEntry} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                  <Plus className="w-3 h-3 mr-1" /> Voeg oude erkenning in archief
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowArchive(true)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                  <Archive className="w-3 h-3 mr-1" /> Archief {archivedAccreditations.length > 0 ? `(${archivedAccreditations.length})` : ""}
                </Button>
                <Button size="sm" variant="outline" onClick={openNew} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                  <Plus className="w-3 h-3 mr-1" /> Nieuwe erkenning
                </Button>
              </>
            )
          )}
        </div>
      </div>

      {!showArchive && (
        <>
          {activeAccreditations.length === 0 && !showWizard && (
            <p className="px-4 py-3 text-sm text-muted-foreground">Nog geen erkenningen of certificaten geregistreerd.</p>
          )}
          <div className="divide-y divide-border">
            {activeAccreditations.map(item => (
              <AccreditationRow
                key={item.id}
                item={item}
                onEdit={openEdit}
                onDelete={setDeleteId}
                onRenew={openRenew}
                onPreview={setPreview}
              />
            ))}
          </div>
        </>
      )}

      {showArchive && (
        <div className="divide-y divide-border">
          {archivedAccreditations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">Geen erkenningen in het archief.</p>
          ) : (
            archivedAccreditations.map(item => (
              <AccreditationRow
                key={item.id}
                item={item}
                onEdit={openEdit}
                onDelete={setDeleteId}
                onRenew={undefined}
                onPreview={setPreview}
              />
            ))
          )}
        </div>
      )}

      <ManagedFilePreviewDialog
        open={formPreviewOpen}
        onOpenChange={setFormPreviewOpen}
        managedFileId={form.document_file_id}
        fileUrl={form.document_file_url}
        filename={currentFormDocumentFilename}
        title="Erkenningsdocument bekijken"
      />
      <ManagedFilePreviewDialog
        open={!!preview}
        onOpenChange={open => { if (!open) setPreview(null); }}
        managedFileId={preview?.document_file_id}
        fileUrl={preview?.document_file_url}
        filename={preview?.document_download_filename || preview?.document_filename || "Document"}
        title="Erkenningsdocument bekijken"
      />
    </div>
  );
}
