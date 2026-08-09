export const INSTALLATION_TYPES = [
  { value: "alarm_system", label: "Alarminstallatie", description: "Inbraakdetectie, alarmsysteem of bedienpaneel." },
  { value: "fire_alarm_system", label: "Brandmeldinstallatie / BMC", description: "Brandmeldcentrale, detectie en eventuele doormelding." },
  { value: "evacuation_alarm", label: "Ontruimingsalarminstallatie", description: "Slow-whoop, bedienpaneel of ontruimingscentrale." },
  { value: "access_control", label: "Toegangscontrole", description: "Controller voor deuren, passen, tags of zones." },
  { value: "camera_system", label: "Camerasysteem", description: "CCTV, recorder, NVR of videomanagementsysteem." },
  { value: "intercom", label: "Intercom", description: "Deurintercom, spreek-luisterverbinding of centrale." },
  { value: "other", label: "Anders", description: "Leg een ander technisch beveiligingssysteem vast." },
];

const ALARM_LOGO_ROOT = "/installation-brand-logos/alarm-system";

const alarmBrand = ({
  value,
  slug,
  productFamilies = [],
  aliases = [],
  status = "current",
  note = "",
  logoBackground = "light",
}) => ({
  value,
  label: value,
  productFamilies,
  aliases,
  status,
  note,
  logoSrc: `${ALARM_LOGO_ROOT}/${slug}.png`,
  logoBackground,
});

/**
 * Canonieke merknamen voor professionele inbraakalarmsystemen.
 * Productlijnen staan bewust in productFamilies/aliases en worden niet als merk opgeslagen.
 * Legacymerken blijven apart beschikbaar, omdat de fysieke merknaam op een bestaande centrale
 * operationeel relevanter is dan de huidige eigenaar van de productlijn.
 */
export const ALARM_SYSTEM_BRAND_OPTIONS = [
  alarmBrand({ value: "ABUS", slug: "abus", productFamilies: ["Secvest", "Terxon"] }),
  alarmBrand({ value: "acre Security", slug: "acre-security", productFamilies: ["SPC", "InTRUSION"], aliases: ["acre", "acre Intrusion"] }),
  alarmBrand({ value: "Ajax Systems", slug: "ajax-systems", productFamilies: ["Superior", "Baseline", "Fibra"], aliases: ["Ajax"] }),
  alarmBrand({ value: "Aritech", slug: "aritech", productFamilies: ["Advisor Advanced", "ATS"], aliases: ["Aritech ATS"] }),
  alarmBrand({ value: "Bosch", slug: "bosch", productFamilies: ["B Series", "MAP"], status: "transition", note: "Voor bestaande Bosch-installaties; nieuwe intrusion-systemen vallen onder Radionix." }),
  alarmBrand({ value: "Comelit", slug: "comelit", productFamilies: ["VEDO"] }),
  alarmBrand({ value: "Dahua Technology", slug: "dahua-technology", productFamilies: ["AirShield"], aliases: ["Dahua"] }),
  alarmBrand({ value: "Daitem", slug: "daitem", productFamilies: ["e-Nova", "TwinBand"] }),
  alarmBrand({ value: "DSC", slug: "dsc", productFamilies: ["PowerSeries", "PowerSeries Neo", "PowerSeries Pro"] }),
  alarmBrand({ value: "ELDES", slug: "eldes", productFamilies: ["PITBULL", "ESIM"] }),
  alarmBrand({ value: "Eaton", slug: "eaton", productFamilies: ["Scantronic", "i-on"], aliases: ["Scantronic", "Menvier"] }),
  alarmBrand({ value: "Hikvision", slug: "hikvision", productFamilies: ["AX PRO", "AX Hybrid PRO"] }),
  alarmBrand({ value: "Honeywell", slug: "honeywell", productFamilies: ["Galaxy Flex", "Galaxy Dimension"], aliases: ["Honeywell Galaxy", "Galaxy"] }),
  alarmBrand({ value: "Inim", slug: "inim", productFamilies: ["Prime", "SmartLiving", "Solis"] }),
  alarmBrand({ value: "JABLOTRON", slug: "jablotron", productFamilies: ["JABLOTRON 100+", "Mercury"], aliases: ["Jablotron"] }),
  alarmBrand({ value: "Ksenia Security", slug: "ksenia-security", productFamilies: ["lares 4.0"], aliases: ["Ksenia"] }),
  alarmBrand({ value: "NOX Systems", slug: "nox-systems", productFamilies: ["NOX ONE", "NOX XL"], aliases: ["NOX"] }),
  alarmBrand({ value: "Orisec", slug: "orisec", productFamilies: ["CP-20K", "W-CP-40K"] }),
  alarmBrand({ value: "Paradox", slug: "paradox", productFamilies: ["Digiplex EVO", "Magellan", "Spectra"] }),
  alarmBrand({ value: "Pyronix", slug: "pyronix", productFamilies: ["Enforcer", "Euro"] }),
  alarmBrand({ value: "Radionix", slug: "radionix", productFamilies: ["G Series", "B Series"], status: "transition", note: "Het actuele intrusion-merk van KEENFINITY." }),
  alarmBrand({ value: "RISCO", slug: "risco", productFamilies: ["LightSYS", "ProSYS Plus", "WiComm Pro"], aliases: ["Risco", "Rokonet"] }),
  alarmBrand({ value: "SATEL", slug: "satel", productFamilies: ["INTEGRA", "PERFECTA", "VERSA"], aliases: ["Satel"] }),
  alarmBrand({ value: "Siemens", slug: "siemens", productFamilies: ["Siveillance Intrusion", "Sintony"] }),
  alarmBrand({ value: "Teletek Electronics", slug: "teletek-electronics", productFamilies: ["BRAVO", "ECLIPSE"], aliases: ["Teletek"] }),
  alarmBrand({ value: "TELENOT", slug: "telenot", productFamilies: ["complex", "hiplex"], aliases: ["Telenot"] }),
  alarmBrand({ value: "Texecom", slug: "texecom", productFamilies: ["Premier Elite", "Capture"] }),
  alarmBrand({ value: "UNii", slug: "unii", productFamilies: ["UNii 32", "UNii 128", "UNii 512"], aliases: ["Alphatronics UNii", "UNii Security"] }),
  alarmBrand({ value: "Visonic", slug: "visonic", productFamilies: ["PowerMaster", "PowerMax"] }),
];

const simpleBrandOptions = values => values.map(value => ({ value, label: value, aliases: [], productFamilies: [], status: "current", logoSrc: null, logoBackground: "light", note: "" }));

export const INSTALLATION_BRAND_OPTIONS = {
  alarm_system: ALARM_SYSTEM_BRAND_OPTIONS,
  fire_alarm_system: simpleBrandOptions(["Bosch", "Esser", "Hertek", "Honeywell", "Notifier", "Siemens", "Sterling", "Viking"]),
  evacuation_alarm: simpleBrandOptions(["Bosch", "Esser", "Hertek", "Honeywell", "Notifier", "Siemens"]),
  access_control: simpleBrandOptions(["2N", "ASSA ABLOY", "HID", "Nedap", "Paxton", "SALTO", "Suprema"]),
  camera_system: simpleBrandOptions(["Axis", "Avigilon", "Bosch", "Dahua", "Hanwha", "Hikvision", "Milestone"]),
  intercom: simpleBrandOptions(["2N", "Akuvox", "Commend", "Hikvision", "Robin", "Siedle"]),
  other: [],
};

// Tijdelijke compatibiliteit voor callers die alleen de opgeslagen merknamen nodig hebben.
export const INSTALLATION_BRANDS = Object.fromEntries(
  Object.entries(INSTALLATION_BRAND_OPTIONS).map(([type, options]) => [type, options.map(option => option.value)]),
);

const normalizeBrandValue = value => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .replace(/\s+/g, " ")
  .toLocaleLowerCase("nl-NL");

export const installationBrandOptions = type => INSTALLATION_BRAND_OPTIONS[type] || [];

export const findInstallationBrandOption = (type, value) => {
  const normalized = normalizeBrandValue(value);
  if (!normalized) return null;
  return installationBrandOptions(type).find(option => [option.value, option.label, ...option.aliases]
    .some(candidate => normalizeBrandValue(candidate) === normalized)) || null;
};

export const filterInstallationBrandOptions = (type, query) => {
  const normalized = normalizeBrandValue(query);
  if (!normalized) return installationBrandOptions(type);
  return installationBrandOptions(type).filter(option => [
    option.value,
    option.label,
    option.note,
    ...option.aliases,
    ...option.productFamilies,
  ].some(candidate => normalizeBrandValue(candidate).includes(normalized)));
};

const SWITCHING_CODE_FIELDS = [
  { key: "arming_code", label: "Inschakelcode", description: "Code om de installatie in te schakelen." },
  { key: "disarming_code", label: "Uitschakelcode", description: "Code om de installatie uit te schakelen." },
];

export const INSTALLATION_CREDENTIAL_FIELDS = Object.fromEntries(
  INSTALLATION_TYPES.map(type => [type.value, SWITCHING_CODE_FIELDS]),
);

export const INSTALLATION_LIFECYCLE_OPTIONS = [
  { value: "active", label: "Actief" },
  { value: "inactive", label: "Inactief" },
  { value: "decommissioned", label: "Buiten bedrijf" },
];

export const INSTALLATION_OPERATIONAL_OPTIONS = [
  { value: "unknown", label: "Nog niet gecontroleerd" },
  { value: "operational", label: "Bedrijfsvaardig" },
  { value: "fault", label: "Storing" },
  { value: "maintenance", label: "In onderhoud" },
];

export const INSTALLATION_STATUS = {
  unknown: { label: "Niet gecontroleerd", className: "border-border bg-muted text-muted-foreground" },
  operational: { label: "Bedrijfsvaardig", className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" },
  fault: { label: "Storing", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  maintenance: { label: "In onderhoud", className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300" },
};

export const INSTALLATION_LIFECYCLE_STATUS = {
  active: null,
  inactive: { label: "Inactief", className: "border-border bg-muted text-muted-foreground" },
  decommissioned: { label: "Buiten bedrijf", className: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" },
};

export const installationStatus = installation => INSTALLATION_LIFECYCLE_STATUS[installation.lifecycle_status]
  || INSTALLATION_STATUS[installation.operational_status]
  || INSTALLATION_STATUS.unknown;

export const installationTypeLabel = installation => installation.custom_type
  || INSTALLATION_TYPES.find(type => type.value === installation.installation_type)?.label
  || "Overig";

export const installationCredentialLabel = type => Object.values(INSTALLATION_CREDENTIAL_FIELDS).flat().find(item => item.key === type)?.label || "Beveiligde code";