import { functionLabel } from "./securityCaoCatalog.js";
import { formatAddress, normalizeAddressParts } from "./addressFormatting.js";
import { getOfficialPbWageRows } from "./caoPbWageTables.js";
import {
  CAO_PARTICULIERE_BEVEILIGING_KEY,
  PB_CAO_FUNCTION_GROUP_OPTIONS,
  PB_CAO_FUNCTION_LEVEL_OPTIONS,
  PB_ARTICLE_14_INTERNSHIP_STANDARD_TEMPLATE_ID,
  PB_BBL_EMPLOYMENT_STANDARD_TEMPLATE_ID,
  PB_FULLTIME_STANDARD_TEMPLATE_ID,
  PB_FULLTIME_REQUIRED_PLACEHOLDERS,
  PB_MIN_MAX_STANDARD_TEMPLATE_ID,
  PB_PARTTIME_GROWTH_STANDARD_TEMPLATE_ID,
  PB_PARTTIME_STANDARD_TEMPLATE_ID,
  PB_ZERO_HOURS_STANDARD_TEMPLATE_ID,
  getContractTemplatePlaceholderDefinition,
  getStandardContractTemplatePresetById,
  isKnownContractTemplatePlaceholder,
  pbFunctionGroupsForFunctions,
  pbSalaryScaleForFunctionLevel,
  suggestPbCaoFunctionGroup,
} from "./contractTemplateCatalog.js";

const CAO_LABELS = {
  cao_particuliere_beveiliging: "CAO Particuliere Beveiliging",
  cao_evenementen_horecabeveiliging: "CAO Evenementen- en Horecabeveiliging",
  cao_verkeersregelaars: "CAO Verkeersregelaars",
  cao_veiligheidsdomein: "CAO Veiligheidsdomein",
};

const PB_SECURITY_FUNCTION_GROUPS = new Set(PB_CAO_FUNCTION_GROUP_OPTIONS
  .map(option => option.value)
  .filter(value => value !== "non_security_staff"));

const PB_OFFICE_FUNCTIONS = new Set([
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
]);

const PB_FULLTIME_MODEL_ALIASES = new Set([
  "fulltime",
  "fulltime_employment",
  "fulltime_fixed",
  "fulltime_indefinite",
]);

const PB_FIXED_PARTTIME_MODEL_ALIASES = new Set([
  "parttime",
  "parttime_employment",
  "parttime_fixed",
  "parttime_indefinite",
]);

const PB_GROWTH_PARTTIME_MODEL_ALIASES = new Set([
  "parttime_growth",
  "parttime_growth_employment",
]);

const PB_MIN_MAX_MODEL_ALIASES = new Set([
  "min_max",
  "min_max_employment",
  "min_max_fixed",
  "min_max_indefinite",
]);

const PB_ZERO_HOURS_MODEL_ALIASES = new Set([
  "zero_hours",
  "zero_hours_employment",
  "call_employment",
  "call_fixed",
  "call_indefinite",
  "call_agreement",
]);

const PB_ARTICLE_14_INTERNSHIP_MODEL_ALIASES = new Set([
  "internship",
  "internship_fixed",
  "article_14_internship",
]);

const PB_BBL_MODEL_ALIASES = new Set([
  "bbl",
  "bbl_employment",
  "bbl_fixed",
  "bbl_indefinite",
]);

const WEEKDAY_OPTIONS = [
  ["monday", "maandag"],
  ["tuesday", "dinsdag"],
  ["wednesday", "woensdag"],
  ["thursday", "donderdag"],
  ["friday", "vrijdag"],
  ["saturday", "zaterdag"],
  ["sunday", "zondag"],
];

const WEEKDAY_LABELS = Object.fromEntries(WEEKDAY_OPTIONS);
const WEEKDAY_ORDER = Object.fromEntries(WEEKDAY_OPTIONS.map(([value], index) => [value, index]));

const CALL_CHANNEL_LABELS = {
  employee_app: "de medewerkersapp",
  email: "e-mail",
  whatsapp: "WhatsApp",
  sms: "sms",
  employee_app_and_email: "de medewerkersapp en e-mail",
};

/** @typedef {Record<string, any>} LooseRecord */

function compact(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function resolveCompanyLegalName(company = {}) {
  return compact(company.statutory_name || company.registered_name || company.legal_name);
}

function resolveEmployeeLegalName(personnel = {}) {
  const legalNameFromParts = compact([
    personnel.legal_first_names,
    personnel.name_prefix,
    personnel.last_name,
  ].filter(Boolean).join(" "));

  return legalNameFromParts
    || compact(personnel.legal_full_name)
    || compact(personnel.full_name)
    || compact(personnel.name)
    || compact([
      personnel.first_name || personnel.call_name,
      personnel.name_prefix,
      personnel.last_name,
    ].filter(Boolean).join(" "));
}

function uniqueStrings(values = []) {
  return [...new Set(values.map(value => compact(value)).filter(Boolean))];
}

function wpbrEvidenceWarnings(personnel = {}, form = {}) {
  const status = compact(personnel.wpbr_status || form.wpbr_status);
  const authority = compact(personnel.wpbr_authority || form.wpbr_authority);
  const permissionNumber = compact(personnel.wpbr_permission_number || form.wpbr_permission_number);
  const validFrom = personnel.wpbr_permission_valid_from || form.wpbr_permission_valid_from;
  const validUntil = personnel.wpbr_permission_valid_until || form.wpbr_permission_valid_until;
  const warnings = [];

  if (status !== "approved") {
    warnings.push(status
      ? `De Wpbr-toestemming staat op '${status}'. Het contract kan als concept worden voorbereid, maar mag niet worden geactiveerd en werknemer mag niet worden ingezet zolang de vereiste toestemming niet is goedgekeurd en geldig is.`
      : "De status van de Wpbr-toestemming ontbreekt. Het contract kan als concept worden voorbereid, maar mag niet worden geactiveerd en werknemer mag niet worden ingezet zolang de vereiste toestemming niet is goedgekeurd en geldig is.");
    return warnings;
  }

  if (!authority || !permissionNumber || !validFrom || !validUntil) {
    warnings.push("De Wpbr-toestemming staat op goedgekeurd, maar bevoegde instantie, bewijsnummer of geldigheidsdatums zijn onvolledig. Activering en inzet blijven geblokkeerd totdat het volledige bewijs is vastgelegd.");
  }
  return warnings;
}

function toBoolean(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatHours(value) {
  const number = toNumber(value);
  if (number === null) return "";
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(number);
}

function resolvedEmploymentModel(form = {}) {
  const explicitModel = String(form.employment_contract_model || "").trim().toLowerCase();
  if (explicitModel) {
    if (PB_FIXED_PARTTIME_MODEL_ALIASES.has(explicitModel)) return "parttime_fixed";
    if (PB_GROWTH_PARTTIME_MODEL_ALIASES.has(explicitModel)) return "parttime_growth";
    if (PB_MIN_MAX_MODEL_ALIASES.has(explicitModel)) return "min_max";
    if (PB_ZERO_HOURS_MODEL_ALIASES.has(explicitModel)) return "zero_hours";
    if (PB_ARTICLE_14_INTERNSHIP_MODEL_ALIASES.has(explicitModel)) return "internship";
    if (PB_BBL_MODEL_ALIASES.has(explicitModel)) return "bbl";
    if (PB_FULLTIME_MODEL_ALIASES.has(explicitModel)) return "fulltime";
    return explicitModel;
  }
  const candidates = [form.contract_model, form.employment_model_scope]
    .map(value => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  if (candidates.some(value => PB_FIXED_PARTTIME_MODEL_ALIASES.has(value))) return "parttime_fixed";
  if (candidates.some(value => PB_GROWTH_PARTTIME_MODEL_ALIASES.has(value))) return "parttime_growth";
  if (candidates.some(value => PB_MIN_MAX_MODEL_ALIASES.has(value))) return "min_max";
  if (candidates.some(value => PB_ZERO_HOURS_MODEL_ALIASES.has(value))) return "zero_hours";
  if (candidates.some(value => PB_ARTICLE_14_INTERNSHIP_MODEL_ALIASES.has(value))) return "internship";
  if (candidates.some(value => PB_BBL_MODEL_ALIASES.has(value))) return "bbl";
  if (candidates.some(value => PB_FULLTIME_MODEL_ALIASES.has(value))) return "fulltime";
  return candidates[0] || "";
}

function isPbFixedParttime(form = {}) {
  return form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY
    && resolvedEmploymentModel(form) === "parttime_fixed";
}

function isPbGrowthParttime(form = {}) {
  return form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY
    && resolvedEmploymentModel(form) === "parttime_growth";
}

function isPbMinMax(form = {}) {
  return form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY
    && resolvedEmploymentModel(form) === "min_max";
}

function isPbZeroHours(form = {}) {
  return form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY
    && resolvedEmploymentModel(form) === "zero_hours";
}

function isPbArticle14Internship(form = {}) {
  return form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY
    && resolvedEmploymentModel(form) === "internship";
}

function isPbBbl(form = {}) {
  return form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY
    && resolvedEmploymentModel(form) === "bbl";
}

function isPbParttime(form = {}) {
  return isPbFixedParttime(form) || isPbGrowthParttime(form);
}

function resolvedContractHours(form = {}, { allowPbFulltimeDefault = true } = {}) {
  const securityWork = resolveSecurityWork(form);
  const model = resolvedEmploymentModel(form);
  let hoursPerWeek = toNumber(form.contract_hours_per_week);
  let hoursPerPeriod = toNumber(form.contract_hours_per_pay_period);

  if (hoursPerPeriod === null && hoursPerWeek !== null) hoursPerPeriod = hoursPerWeek * 4;
  if (hoursPerWeek === null && hoursPerPeriod !== null) hoursPerWeek = hoursPerPeriod / 4;
  if (allowPbFulltimeDefault && securityWork === true && model === "fulltime") {
    if (hoursPerWeek === null) hoursPerWeek = 36;
    if (hoursPerPeriod === null) hoursPerPeriod = 144;
  }

  return { hoursPerWeek, hoursPerPeriod };
}

function resolvedMinMaxHours(form = {}) {
  let minHoursPerPeriod = toNumber(form.min_hours_per_pay_period);
  let maxHoursPerPeriod = toNumber(form.max_hours_per_pay_period);
  let minHoursPerWeek = toNumber(form.min_hours_per_week);
  let maxHoursPerWeek = toNumber(form.max_hours_per_week);

  if (minHoursPerPeriod === null && minHoursPerWeek !== null) minHoursPerPeriod = minHoursPerWeek * 4;
  if (maxHoursPerPeriod === null && maxHoursPerWeek !== null) maxHoursPerPeriod = maxHoursPerWeek * 4;
  if (minHoursPerWeek === null && minHoursPerPeriod !== null) minHoursPerWeek = minHoursPerPeriod / 4;
  if (maxHoursPerWeek === null && maxHoursPerPeriod !== null) maxHoursPerWeek = maxHoursPerPeriod / 4;

  return { minHoursPerPeriod, maxHoursPerPeriod, minHoursPerWeek, maxHoursPerWeek };
}

function normalizeAvailabilityWindows(value) {
  let source = value;
  if (typeof value === "string") {
    try {
      source = JSON.parse(value);
    } catch {
      source = [];
    }
  }
  if (!Array.isArray(source)) return [];
  return source
    .map(item => ({
      weekday: compact(item?.weekday || item?.day || item?.day_of_week).toLowerCase(),
      start_time: compact(item?.start_time || item?.start),
      end_time: compact(item?.end_time || item?.end),
      crosses_midnight: item?.crosses_midnight === true,
    }))
    .filter(item => WEEKDAY_LABELS[item.weekday] && item.start_time && item.end_time)
    .sort((a, b) => WEEKDAY_ORDER[a.weekday] - WEEKDAY_ORDER[b.weekday]);
}

function availabilityWindowLabel(window) {
  const nextDay = window.crosses_midnight ? " de volgende dag" : "";
  return `${WEEKDAY_LABELS[window.weekday]} van ${window.start_time} tot ${window.end_time}${nextDay}`;
}

function contractCallConditionsClause(form = {}) {
  const windows = normalizeAvailabilityWindows(form.availability_windows);
  const availability = windows.map(availabilityWindowLabel).join("; ");
  const channel = CALL_CHANNEL_LABELS[form.call_channel] || compact(form.call_channel);
  if (!availability || !channel) return "";
  const scope = isPbZeroHours(form)
    ? "Iedere oproep blijft gebonden aan de Arbeidstijdenwet, de cao en de overige regels uit dit artikel; door een oproep ontstaat niet automatisch een vaste arbeidsomvang."
    : "Iedere oproep blijft gebonden aan het overeengekomen maximum, de Arbeidstijdenwet, de cao en de overige regels uit dit artikel.";
  return `Werknemer is oproepbaar binnen de volgende overeengekomen beschikbaarheid: ${availability}. Werkgever doet oproepen schriftelijk of elektronisch via ${channel}. Buiten deze beschikbaarheid is werknemer niet verplicht een oproep te aanvaarden. ${scope}`;
}

function resolvedFulltimeReferenceHours(form = {}) {
  let hoursPerWeek = toNumber(form.fulltime_reference_hours_per_week);
  let hoursPerPeriod = toNumber(form.fulltime_reference_hours_per_pay_period);
  if (hoursPerPeriod === null && hoursPerWeek !== null) hoursPerPeriod = hoursPerWeek * 4;
  if (hoursPerWeek === null && hoursPerPeriod !== null) hoursPerWeek = hoursPerPeriod / 4;
  return { hoursPerWeek, hoursPerPeriod };
}

function dateValue(value) {
  if (!value) return null;
  const source = String(value).slice(0, 10);
  const date = new Date(`${source}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value, fallback = "") {
  const date = dateValue(value);
  if (!date) return fallback;
  return date.toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });
}

function todayInAmsterdam() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatCurrency(value, fallback = "") {
  const number = toNumber(value);
  if (number === null) return fallback;
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(number);
}

function parseFunctionValues(form = {}) {
  const configured = String(form.allowed_function_types_text || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  return uniqueStrings([form.function_type, ...configured])
    .filter(value => !["unknown", "all", "not_applicable"].includes(String(value).trim().toLowerCase()));
}

function readableFunctionValues(form = {}) {
  return parseFunctionValues(form).map(value => functionLabel(value));
}

function durationType(form = {}) {
  if (form.duration_type === "indefinite" || form.contract_form === "onbepaalde_tijd") return "indefinite";
  if (form.duration_type === "fixed" || form.contract_form === "bepaalde_tijd") return "fixed";
  return "";
}

function addMonthsMinusOneDay(value, months) {
  const date = dateValue(value);
  if (!date || !months) return null;
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(originalDay, lastDayOfTargetMonth));
  date.setDate(date.getDate() - 1);
  return date;
}

function hasSixMonthAanzegThreshold(form = {}) {
  const start = dateValue(form.contract_start_date);
  const end = dateValue(form.contract_end_date);
  if (!start || !end) return false;
  const threshold = addMonthsMinusOneDay(form.contract_start_date, 6);
  return !!threshold && end >= threshold;
}

function isLongerThanSixMonths(form = {}) {
  const end = dateValue(form.contract_end_date);
  const threshold = addMonthsMinusOneDay(form.contract_start_date, 6);
  return !!end && !!threshold && end > threshold;
}

function durationDescription(form = {}) {
  if (durationType(form) === "indefinite") return "onbepaalde tijd";
  const labels = {
    "1_month": "1 maand",
    "2_months": "2 maanden",
    "6_months": "6 maanden",
    "7_months": "7 maanden",
    "1_year": "1 jaar",
    "2_years": "2 jaar",
    "3_years": "3 jaar",
    "pok_end_date": "tot de einddatum volgens de praktijkovereenkomst (POK)",
  };
  return labels[form.duration_option] || compact(form.duration_label) || "bepaalde tijd";
}

function resolveSecurityWork(form = {}) {
  const explicit = toBoolean(form.performs_security_work);
  if (explicit !== null) return explicit;
  if (form.cao_function_group === "non_security_staff") return false;
  if (PB_SECURITY_FUNCTION_GROUPS.has(form.cao_function_group)) return true;
  const functions = parseFunctionValues(form);
  if (functions.length > 0 && functions.every(value => PB_OFFICE_FUNCTIONS.has(value))) return false;
  if (pbFunctionGroupsForFunctions(functions).some(value => PB_SECURITY_FUNCTION_GROUPS.has(value))) return true;
  return null;
}

function isCashValueLogistics(form = {}) {
  const explicit = toBoolean(form.works_cash_value_logistics);
  if (explicit !== null) return explicit;
  return form.cao_function_group === "geld_waardetransporteur"
    || parseFunctionValues(form).some(value => [
      "geld_waardetransporteur",
      "waardetransport_chauffeur",
      "waardetransport_bijrijder",
    ].includes(value));
}

function pbFunctionGroupLabel(value) {
  return PB_CAO_FUNCTION_GROUP_OPTIONS.find(option => option.value === value)?.label || compact(value);
}

function pbFunctionLevelLabel(value) {
  return PB_CAO_FUNCTION_LEVEL_OPTIONS.find(option => option.value === value)?.label || compact(value);
}

function contractDurationClause(form = {}) {
  const startDate = formatDate(form.contract_start_date);
  const endDate = formatDate(form.contract_end_date);
  if (durationType(form) === "indefinite") {
    return `De arbeidsovereenkomst wordt met ingang van ${startDate} aangegaan voor onbepaalde tijd.`;
  }
  if (durationType(form) === "fixed") {
    if (form.duration_option === "pok_end_date") {
      return `De arbeidsovereenkomst wordt met ingang van ${startDate} aangegaan voor bepaalde tijd tot en met ${endDate}. Deze einddatum is afgestemd op de afzonderlijke praktijkovereenkomst (POK). De arbeidsovereenkomst eindigt op die datum van rechtswege zonder dat opzegging nodig is.`;
    }
    return `De arbeidsovereenkomst wordt aangegaan voor bepaalde tijd, van ${startDate} tot en met ${endDate}, en eindigt daarna van rechtswege zonder dat opzegging nodig is.`;
  }
  return "";
}

function contractAanzegClause(form = {}) {
  if (durationType(form) !== "fixed") return "De wettelijke aanzegplicht is bij deze arbeidsovereenkomst voor onbepaalde tijd niet van toepassing.";
  if (!hasSixMonthAanzegThreshold(form)) {
    return "Voor deze contractduur geldt geen wettelijke aanzegplicht op grond van artikel 7:668 BW. Werkgever deelt werknemer op grond van de CAO Particuliere Beveiliging niettemin uiterlijk één maand voor de einddatum schriftelijk mee of de arbeidsovereenkomst wordt voortgezet en, zo ja, onder welke voorwaarden.";
  }
  return "Werkgever informeert werknemer uiterlijk één maand voor de einddatum schriftelijk of de arbeidsovereenkomst wordt voortgezet en, zo ja, onder welke voorwaarden. De gevolgen van niet of te laat aanzeggen volgen uit de wet en de cao.";
}

function contractProbationClause(form = {}) {
  if (form.probation_agreed === "false" || form.probation_agreed === false || form.probation_agreed === "not_applicable") {
    return "Partijen komen geen proeftijd overeen.";
  }
  if (form.probation_agreed !== "true" && form.probation_agreed !== true) return "";
  if (form.probation_context === "successive_same_work") {
    return "Partijen komen geen nieuwe proeftijd overeen, omdat sprake is van een opvolgend contract voor hetzelfde of vergelijkbaar werk.";
  }
  if (form.probation_context === "uwv_trial_placement_same_work") {
    return "Partijen komen geen proeftijd overeen, omdat werknemer onmiddellijk voorafgaand aan deze arbeidsovereenkomst via een UWV-proefplaatsing hetzelfde of vergelijkbaar werk bij werkgever heeft verricht.";
  }
  if (durationType(form) === "fixed" && !isLongerThanSixMonths(form)) {
    return "Partijen komen geen proeftijd overeen, omdat de tijdelijke arbeidsovereenkomst zes maanden of korter duurt.";
  }
  const aspirant = form.security_role_status === "aspirant_beveiliger" || form.cao_function_level === "aspirant";
  const months = durationType(form) === "indefinite" || aspirant ? 2 : 1;
  return `Partijen komen een proeftijd van ${months === 1 ? "één maand" : "twee maanden"} overeen. Tijdens de proeftijd kunnen beide partijen de arbeidsovereenkomst per direct beëindigen. Bij opzegging tijdens de proeftijd geldt tevens de cao-regel dat dit minimaal twaalf uur voor het begin van de eerstvolgende dienst gebeurt.`;
}

function contractTerminationClause(form = {}) {
  if (isPbZeroHours(form)) {
    const employeeNotice = "Werknemer kan schriftelijk opzeggen tegen iedere dag met een opzegtermijn van vier kalenderdagen, of een kortere termijn als de toepasselijke cao die rechtsgeldig bepaalt.";
    const employerRoute = "Werkgever kan de arbeidsovereenkomst alleen beëindigen met schriftelijke instemming van werknemer, na toestemming van UWV, door ontbinding door de kantonrechter of via een andere wettelijk toegestane route. Daarbij zijn een geldige ontslaggrond, de toepasselijke herplaatsingsverplichtingen en de wettelijke en cao-opzegregels vereist, voor zover de wet daarop geen uitzondering maakt.";
    if (durationType(form) === "fixed") {
      return `Deze tijdelijke arbeidsovereenkomst eindigt van rechtswege op de in artikel 1 vastgelegde einddatum. Partijen komen uitdrukkelijk overeen dat tussentijdse opzegging mogelijk is. ${employeeNotice} ${employerRoute}`;
    }
    return `${employeeNotice} ${employerRoute}`;
  }
  if (durationType(form) === "fixed") {
    return "Deze tijdelijke arbeidsovereenkomst eindigt van rechtswege op de in artikel 1 vastgelegde einddatum. Partijen komen uitdrukkelijk overeen dat tussentijdse opzegging mogelijk is. Werknemer kan schriftelijk opzeggen tegen iedere dag met een opzegtermijn van één loonperiode van vier weken. Werkgever kan vóór de einddatum alleen beëindigen met schriftelijke instemming van werknemer, na toestemming van UWV, door ontbinding door de kantonrechter of via een andere wettelijk toegestane route. Daarbij zijn een geldige ontslaggrond, de toepasselijke herplaatsingsverplichtingen en de wettelijke en cao-opzegregels vereist, voor zover de wet daarop geen uitzondering maakt.";
  }
  return "Werknemer kan schriftelijk opzeggen tegen iedere dag met een opzegtermijn van twee loonperioden van in totaal acht weken, tenzij partijen rechtsgeldig schriftelijk een gelijke langere termijn overeenkomen. Werkgever kan de arbeidsovereenkomst alleen beëindigen met schriftelijke instemming van werknemer, na toestemming van UWV, door ontbinding door de kantonrechter of via een andere wettelijk toegestane route. Daarbij zijn een geldige ontslaggrond, de toepasselijke herplaatsingsverplichtingen en de wettelijke en cao-opzegregels vereist, voor zover de wet daarop geen uitzondering maakt.";
}

function contractHoursClause(form = {}) {
  const securityWork = resolveSecurityWork(form);
  const { hoursPerWeek, hoursPerPeriod } = resolvedContractHours(form);
  if (isPbBbl(form)) {
    if (hoursPerWeek === null && hoursPerPeriod === null) return "";
    const weekPart = hoursPerWeek !== null ? `gemiddeld ${formatHours(hoursPerWeek)} uur per week` : "";
    const periodPart = hoursPerPeriod !== null ? `${formatHours(hoursPerPeriod)} uur per loonperiode van vier weken` : "";
    return `De overeengekomen arbeidsduur in de leerarbeidsovereenkomst (BBL) bedraagt ${[periodPart, weekPart].filter(Boolean).join(", overeenkomend met ")}. School-, praktijk- en werktijd worden toegepast volgens de praktijkovereenkomst, de wet en de cao. Een wijziging van de structurele arbeidsduur wordt schriftelijk vastgelegd.`;
  }
  if (isPbZeroHours(form)) {
    return "Partijen sluiten een oproepovereenkomst zonder vaste arbeidsomvang: een nulurencontract. Er gelden geen vaste contracturen, minimumuren, maximumuren of garantie-uren per week of loonperiode. Werkgever betaalt alle daadwerkelijk gewerkte en anderszins rechtens verschuldigde uren. Werknemer is binnen de overeengekomen beschikbaarheid verplicht gehoor te geven aan een tijdige oproep, met inachtneming van de wet, de cao en de Arbeidstijdenwet. Werknemer kan niet zonder instemming worden verplicht meer dan 144 uur per loonperiode van vier weken te werken. Incidentele oproepen wijzigen de arbeidsomvang niet automatisch; wettelijke en cao-rechten op basis van een structureel arbeidspatroon blijven volledig gelden.";
  }
  if (isPbMinMax(form)) {
    const {
      minHoursPerPeriod,
      maxHoursPerPeriod,
      minHoursPerWeek,
      maxHoursPerWeek,
    } = resolvedMinMaxHours(form);
    if (minHoursPerPeriod === null || maxHoursPerPeriod === null) return "";
    const weekText = minHoursPerWeek !== null && maxHoursPerWeek !== null
      ? `, gemiddeld minimaal ${formatHours(minHoursPerWeek)} en maximaal ${formatHours(maxHoursPerWeek)} uur per week`
      : "";
    return `Partijen sluiten een oproepovereenkomst in de vorm van een min-maxcontract. De garantie-omvang bedraagt ${formatHours(minHoursPerPeriod)} uur en de maximale arbeidsomvang ${formatHours(maxHoursPerPeriod)} uur per loonperiode van vier weken${weekText}. Werkgever betaalt in iedere loonperiode ten minste het loon over de garantie-uren, ook wanneer werknemer voor minder uren wordt opgeroepen. Gewerkte of anderszins loongerechtigde uren boven de garantie-uren worden aanvullend betaald. Werknemer is binnen de overeengekomen beschikbaarheid en bij een tijdige oproep verplicht te werken tot het overeengekomen maximum. Boven dat maximum bestaat alleen een verplichting na instemming van werknemer. Het maximum blijft binnen 144 uur per loonperiode; uren boven 144 worden uitsluitend met instemming gewerkt en de kwalificatie van meeruren en overuren volgt uit de cao. De arbeidsduur wijzigt niet automatisch door incidenteel extra werk.`;
  }
  if (isPbFixedParttime(form) && hoursPerPeriod !== null) {
    const weekText = hoursPerWeek !== null ? `, gemiddeld ${formatHours(hoursPerWeek)} uur per week` : "";
    if (securityWork === true) {
      const availabilityHours = Math.floor((((hoursPerPeriod / 144) * 200) + Number.EPSILON) * 100) / 100;
      return `Partijen kiezen het vaste parttimemodel. Werknemer werkt ${formatHours(hoursPerPeriod)} uur per loonperiode van vier weken${weekText} en is geen oproepkracht. Werkgever betaalt ten minste deze overeengekomen arbeidsduur. De maximale beschikbaarheid volgens de cao-formule (parttimepercentage maal 200 uur) bedraagt, naar beneden afgerond op twee decimalen, ${formatHours(availabilityHours)} uur per loonperiode, verdeeld over maximaal twintig tijdvakken en/of arbeidstijd. Een extra dienst buiten de vastgelegde tijdvakken of arbeidstijd wordt alleen in gezamenlijk overleg overeengekomen; meeruren, verschoven uren, min-uren en overwerk worden volgens de cao verwerkt en wijzigen de structurele arbeidsduur niet automatisch.`;
    }

    const reference = resolvedFulltimeReferenceHours(form);
    const referenceText = reference.hoursPerPeriod !== null
      ? ` De overeengekomen fulltime referentienorm voor deze functie bedraagt ${formatHours(reference.hoursPerPeriod)} uur per loonperiode van vier weken${reference.hoursPerWeek !== null ? `, gemiddeld ${formatHours(reference.hoursPerWeek)} uur per week` : ""}.`
      : "";
    return `Werknemer werkt parttime voor ${formatHours(hoursPerPeriod)} uur per loonperiode van vier weken${weekText}.${referenceText} De cao-definitie van 144 uur en de operationele regels van het vaste parttimemodel zijn door de uitzonderingen voor niet-operationele functies niet automatisch van toepassing. Extra uren worden alleen in onderling overleg gewerkt en wijzigen de structurele arbeidsduur niet automatisch.`;
  }
  if (isPbGrowthParttime(form) && hoursPerPeriod !== null) {
    const weekText = hoursPerWeek !== null ? `, gemiddeld ${formatHours(hoursPerWeek)} uur per week` : "";
    if (securityWork === true) {
      return `Partijen kiezen het parttime groeimodel. De vaste overeengekomen arbeidsduur bedraagt ${formatHours(hoursPerPeriod)} uur per loonperiode van vier weken${weekText}; werknemer is geen oproepkracht en dit is geen nuluren- of min-maxcontract. Werkgever betaalt ten minste de overeengekomen arbeidsduur. Werknemer kan volgens het tijdig vastgestelde rooster meer werken dan de contracturen, met inachtneming van de cao, de Arbeidstijdenwet en de geldende tijdvakken en arbeidstijd. Een extra dienst buiten de vastgestelde tijdvakken of arbeidstijd wordt door werkgever en werknemer samen overeengekomen. Werknemer kan niet worden verplicht boven 144 uur per loonperiode te werken; uren boven 144 worden alleen met instemming gewerkt. Uren boven de contractuele arbeidsduur tot en met 152 uur zijn meeruren en uren boven 152 uur zijn overuren. Minuren worden betaald, geregistreerd en eventueel later ingehaald volgens de algemene cao-regeling; vanaf 144 uur gebeurt inhalen in overleg, met maximaal 24 nieuwe minuren per loonperiode en een maximaal saldo van 40 minuren. Werkt werknemer gedurende de cao-meetperiode van dertien weken in een regelmatig patroon structureel meer, dan kan werknemer schriftelijk aanpassing van de contracturen verzoeken volgens artikel 11 van de cao. Extra gewerkte uren wijzigen de structurele arbeidsduur niet zonder die cao- of wettelijke procedure.`;
    }

    const reference = resolvedFulltimeReferenceHours(form);
    const referenceText = reference.hoursPerPeriod !== null
      ? ` De overeengekomen fulltime referentienorm voor deze niet-operationele functie bedraagt ${formatHours(reference.hoursPerPeriod)} uur per loonperiode van vier weken${reference.hoursPerWeek !== null ? `, gemiddeld ${formatHours(reference.hoursPerWeek)} uur per week` : ""}.`
      : "";
    return `Partijen kiezen het parttime groeimodel. De vaste overeengekomen arbeidsduur bedraagt ${formatHours(hoursPerPeriod)} uur per loonperiode van vier weken${weekText}; werknemer is geen oproepkracht en dit is geen nuluren- of min-maxcontract. Werkgever betaalt ten minste de overeengekomen arbeidsduur.${referenceText} Omdat werknemer normaal geen beveiligingswerk verricht, zijn de operationele fulltime definitie, functie- en loonindeling en vergoedingen die artikel 3 van de cao uitzondert niet automatisch van toepassing. Werknemer kan binnen het overeengekomen rooster en de geldende arbeidsvoorwaarden meer uren werken dan de contracturen. Extra uren, minuren en eventuele vergoedingen worden verwerkt volgens de voor werknemer geldende wet, cao-bepalingen en bedrijfs- of individuele arbeidsvoorwaarden. Werkt werknemer structureel meer, dan beoordelen partijen op schriftelijk verzoek en volgens de toepasselijke cao- en wettelijke procedure of de contracturen moeten worden aangepast.`;
  }
  if (securityWork === true) {
    return "Werknemer werkt fulltime voor 144 uur per loonperiode van vier weken, gemiddeld 36 uur per week. Een regulier jaar telt dertien loonperioden; een kalenderjaar met een drieënvijftigste week wordt verwerkt volgens de cao.";
  }
  if (hoursPerWeek !== null || hoursPerPeriod !== null) {
    const weekPart = hoursPerWeek !== null ? `gemiddeld ${hoursPerWeek} uur per week` : "";
    const periodPart = hoursPerPeriod !== null ? `${hoursPerPeriod} uur per loonperiode van vier weken` : "";
    return `Voor deze niet-operationele functie bedraagt de overeengekomen fulltime arbeidsduur ${[weekPart, periodPart].filter(Boolean).join(", overeenkomend met ")}. De cao-definitie van 144 uur voor operationele beveiligers is niet automatisch van toepassing.`;
  }
  return "";
}

function contractWorkplaceClause(form = {}, company = {}) {
  const location = compact(form.work_location) || compact(company.city);
  const area = compact(form.work_area);
  if (!location) return "";
  if (area) {
    return `De standplaats is ${location}. Vanwege de aard van de functie kan werknemer worden ingezet op wisselende locaties van werkgever of opdrachtgevers binnen ${area}.`;
  }
  return `De standplaats is ${location}. Vanwege de aard van de functie kan werknemer worden ingezet op andere locaties van werkgever of opdrachtgevers, voor zover dit redelijk is.`;
}

function contractSalaryClause(form = {}) {
  const hourlyRate = toNumber(form.hourly_rate_snapshot ?? form.custom_hourly_rate);
  const securityWork = resolveSecurityWork(form);
  const periodHours = isPbZeroHours(form)
    ? null
    : isPbMinMax(form)
    ? resolvedMinMaxHours(form).minHoursPerPeriod
    : resolvedContractHours(form).hoursPerPeriod;
  const periodSalary = hourlyRate !== null && periodHours !== null ? hourlyRate * periodHours : null;
  const classification = securityWork === true && form.cao_scale !== "" && form.cao_scale !== null && form.cao_scale !== undefined
    ? ` De beloning is bij aanvang ingedeeld in salarisschaal ${form.cao_scale}, periodiek ${form.cao_period ?? ""}.`
    : "";
  if (hourlyRate === null) return "";
  if (isPbBbl(form)) {
    const periodPart = periodSalary !== null
      ? ` Bij 100% van het basisuurloon komt dit bij de overeengekomen arbeidsduur overeen met ${formatCurrency(periodSalary)} bruto per loonperiode van vier weken.`
      : "";
    return `Het voor werknemer geldende bruto basisuurloon bedraagt ${formatCurrency(hourlyRate)} per uur, exclusief vakantiebijslag en toepasselijke toeslagen.${classification} Gedurende de eerste vier weken van de praktijkovereenkomst ontvangt werknemer overeenkomstig artikel 55 van de cao 50% van het voor de indeling geldende basisuurloon en vanaf de vijfde week 100%, tenzij dwingend recht of een gunstiger toepasselijke bepaling een hoger loon voorschrijft.${periodPart}`;
  }
  const periodPart = periodSalary !== null
    ? `, overeenkomend met ${formatCurrency(periodSalary)} bruto per loonperiode ${isPbMinMax(form) ? "over de garantie-uren" : "bij de overeengekomen arbeidsduur"}`
    : "";
  const additionalHours = isPbZeroHours(form)
    ? " Werkgever betaalt alle daadwerkelijk gewerkte en anderszins rechtens verschuldigde oproepuren volgens de cao en de wet; er geldt geen gegarandeerd periodeloon."
    : isPbMinMax(form)
    ? " Gewerkte of anderszins loongerechtigde uren boven de garantie-uren worden aanvullend betaald volgens de cao en de wet."
    : "";
  return `Het bruto basisuurloon bedraagt bij aanvang ${formatCurrency(hourlyRate)} per uur${periodPart}, exclusief vakantiebijslag en toepasselijke toeslagen.${additionalHours}${classification}`;
}

function contractSalaryClassificationClause(form = {}) {
  const scale = compact(form.cao_scale);
  const period = compact(form.cao_period);
  if (resolveSecurityWork(form) === false) {
    return "Voor deze niet-operationele functie is geen operationele CAO-PB-salarisschaal van toepassing. Het overeengekomen bruto basisuurloon en de betaalperiode zijn in de volgende leden vastgelegd.";
  }
  if (!scale || !period) return "De salarisschaal en periodiek moeten vóór ondertekening overeenkomstig de op de startdatum geldende loontabel schriftelijk worden vastgelegd.";
  return `Werknemer wordt bij aanvang voor de beloning ingedeeld in salarisschaal ${scale}, periodiek ${period}, overeenkomstig de op de startdatum geldende loontabel van de CAO Particuliere Beveiliging.`;
}

function contractBaseHourlyWageClause(form = {}) {
  const hourlyRate = toNumber(form.hourly_rate_snapshot ?? form.custom_hourly_rate);
  const periodHours = isPbZeroHours(form)
    ? null
    : isPbMinMax(form)
    ? resolvedMinMaxHours(form).minHoursPerPeriod
    : resolvedContractHours(form).hoursPerPeriod;
  const periodSalary = hourlyRate !== null && periodHours !== null ? hourlyRate * periodHours : null;
  if (hourlyRate === null) return "";

  if (isPbBbl(form)) {
    const periodPart = periodSalary !== null
      ? ` Bij 100% van het basisuurloon komt dit bij de overeengekomen arbeidsduur overeen met ${formatCurrency(periodSalary)} bruto per loonperiode van vier weken.`
      : "";
    return `Het voor de indeling geldende bruto basisuurloon bedraagt bij aanvang ${formatCurrency(hourlyRate)} per uur, exclusief vakantiebijslag en toepasselijke toeslagen. Gedurende de eerste vier weken van de praktijkovereenkomst ontvangt werknemer overeenkomstig artikel 55 van de cao 50% van dit basisuurloon en vanaf de vijfde week 100%, tenzij dwingend recht of een gunstiger toepasselijke bepaling een hoger loon voorschrijft.${periodPart}`;
  }

  const periodPart = periodSalary !== null
    ? ` Dit komt overeen met ${formatCurrency(periodSalary)} bruto per loonperiode van vier weken ${isPbMinMax(form) ? "over de garantie-uren" : "bij de overeengekomen arbeidsduur"}.`
    : "";
  const additionalHours = isPbZeroHours(form)
    ? " Werkgever betaalt alle daadwerkelijk gewerkte en anderszins rechtens verschuldigde oproepuren volgens de cao en de wet; er geldt geen gegarandeerd periodeloon."
    : isPbMinMax(form)
    ? " Gewerkte of anderszins loongerechtigde uren boven de garantie-uren worden aanvullend betaald volgens de cao en de wet."
    : "";
  return `Het bruto basisuurloon bedraagt bij aanvang ${formatCurrency(hourlyRate)} per uur, exclusief vakantiebijslag en toepasselijke toeslagen.${periodPart}${additionalHours}`;
}

function contractPaymentPeriodClause(form = {}) {
  const securityWork = resolveSecurityWork(form);
  if (form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY || securityWork === true || form.salary_payment_frequency === "four_weeks") {
    return "Werkgever betaalt het loon na afloop van iedere loonperiode van vier weken, onder inhouding van wettelijk of rechtsgeldig verschuldigde bedragen.";
  }
  if (form.salary_payment_frequency === "month") {
    return "Werkgever betaalt het loon na afloop van iedere kalendermaand, onder inhouding van wettelijk of rechtsgeldig verschuldigde bedragen.";
  }
  return "";
}

function contractFunctionClassificationClause(form = {}) {
  const securityWork = resolveSecurityWork(form);
  if (securityWork === false) {
    return "De overeengekomen werkzaamheden zijn niet-operationeel. Op de functie- en loonafspraken zijn de cao-bepalingen van toepassing die voor deze functie gelden.";
  }
  if (securityWork === true) {
    const functions = parseFunctionValues(form);
    const mappedGroups = pbFunctionGroupsForFunctions(functions);
    const functionGroup = pbFunctionGroupLabel(form.cao_function_group);
    if (mappedGroups.length > 1) {
      return `Werknemer wordt bij aanvang ingedeeld in functiegroep ${functionGroup}. Bij werkzaamheden uit meerdere functiegroepen is voor de indeling bepalend welke werkzaamheden werknemer structureel gedurende 50% of meer van de arbeidsduur verricht.`;
    }
    return `Werknemer wordt bij aanvang ingedeeld in functiegroep ${functionGroup}, overeenkomstig de cao.`;
  }
  return "";
}

function contractVacationClause(form = {}) {
  if (isPbBbl(form)) {
    const { hoursPerPeriod } = resolvedContractHours(form);
    if (isCashValueLogistics(form)) {
      return `Werknemer bouwt vakantie op naar rato van de betaalde arbeidstijd${hoursPerPeriod !== null ? ` van ${formatHours(hoursPerPeriod)} uur per loonperiode` : ""}. Voor geld- en waardelogistiek geldt daarbij de fulltime referentie van 180 vakantie-uren per kalenderjaar volgens hoofdstuk 15 van de cao.`;
    }
    return `Werknemer bouwt vakantie op naar rato van de betaalde arbeidstijd${hoursPerPeriod !== null ? ` van ${formatHours(hoursPerPeriod)} uur per loonperiode` : ""}. De fulltime referentie bedraagt 172,8 vakantie-uren per kalenderjaar volgens de cao.`;
  }
  if (isPbMinMax(form) || isPbZeroHours(form)) {
    return "Voor zover artikel 59 lid 3 van de cao werkgever en werknemer rechtsgeldig bindt, ontvangt werknemer per loonperiode een afzonderlijk gespecificeerde betaling van 9,24% over het daarvoor volgens de cao in aanmerking komende loon tot maximaal 144 uur als geldswaarde van de cao-vakantie-uren. Is die regeling niet bindend of gaat dwingend recht voor, dan bouwt werknemer over de loongerechtigde uren wettelijke en toepasselijke bovenwettelijke vakantie op en stelt werkgever werknemer in staat deze met behoud van loon op te nemen. Daarnaast ontvangt werknemer 8% vakantiebijslag over het daarvoor geldende bruto loon. In alle gevallen blijven het recht op daadwerkelijke jaarlijkse vakantie en rust, dwingendrechtelijke vakantie- en verlofrechten en gunstiger toepasselijke cao-bepalingen volledig gelden.";
  }
  if (isPbParttime(form)) {
    if (isCashValueLogistics(form)) {
      return "Werknemer bouwt vakantie op naar rato van de betaalde arbeidstijd per loonperiode. Voor geld- en waardelogistiek geldt daarbij de fulltime referentie van 180 vakantie-uren, overeenkomend met 25 vakantiedagen per kalenderjaar, volgens hoofdstuk 15 van de cao.";
    }
    return "Werknemer bouwt vakantie op naar rato van de betaalde arbeidstijd per loonperiode, tot maximaal 144 betaalde uren per loonperiode. De fulltime referentie bedraagt 172,8 vakantie-uren, overeenkomend met 24 vakantiedagen per kalenderjaar, volgens de cao.";
  }
  if (isCashValueLogistics(form)) {
    return "Bij een fulltime dienstverband in de geld- en waardelogistiek bouwt werknemer per kalenderjaar 180 vakantie-uren, overeenkomend met 25 vakantiedagen, op volgens hoofdstuk 15 van de cao.";
  }
  if (resolveSecurityWork(form) === false) {
    return "Bij een volledig kalenderjaar heeft werknemer recht op 20 wettelijke en 4 bovenwettelijke vakantiedagen volgens de cao. De omzetting naar vakantie-uren sluit aan op de voor deze niet-operationele functie overeengekomen fulltime arbeidsduur.";
  }
  return "Bij een fulltime dienstverband bouwt werknemer per kalenderjaar 172,8 vakantie-uren, overeenkomend met 24 vakantiedagen, op volgens de cao.";
}

function contractWpbrClause(form = {}) {
  const securityWork = resolveSecurityWork(form);
  const base = "Werknemer mag uitsluitend werkzaamheden voor werkgever verrichten indien en zolang werknemer beschikt over de vereiste toestemming van de korpschef en is voldaan aan de voor werknemer en de werkzaamheden geldende screening en betrouwbaarheidseisen op grond van de Wpbr en daarop gebaseerde regels.";
  const leadership = form.security_role_status === "leidinggevende"
    ? " Voor zover werknemer als leidinggevende of beleidsbepaler in de zin van de Wpbr optreedt, beschikt werknemer daarnaast over de daarvoor vereiste toestemming van de minister van Justitie en Veiligheid. Verricht werknemer tevens operationele werkzaamheden, dan blijven beide toestemmingsvereisten naast elkaar gelden."
    : "";
  if (securityWork !== true) return `${base}${leadership} Werknemer verricht geen operationele beveiligingswerkzaamheden zonder de daarvoor vereiste opleiding, vakbekwaamheid en legitimatie.`;
  return `${base}${leadership} Voor beveiligingswerkzaamheden draagt werknemer het vereiste legitimatiebewijs tijdens het werk bij zich en levert werknemer dit bij het einde van de inzet of op eerste verzoek van werkgever in.`;
}

function contractWpbrConsequencesClause() {
  return "Deze arbeidsovereenkomst is aangegaan onder de ontbindende voorwaarde dat de op grond van artikel 7 Wpbr vereiste toestemming voor werknemer wordt verleend en tijdens het dienstverband geldig blijft. Zodra werkgever uit een schriftelijk besluit van de korpschef of een andere bevoegde instantie objectief kan vaststellen dat de vereiste toestemming is geweigerd, ingetrokken of niet verlengd, treedt deze voorwaarde in en eindigt de arbeidsovereenkomst van rechtswege op de datum waarop dat besluit werking heeft, zonder dat opzegging nodig is. Dit geldt alleen voor zover werkgever geen beslissende invloed heeft gehad op het intreden van de voorwaarde en toepassing daarvan in de concrete omstandigheden rechtsgeldig is. Werkgever bevestigt de grond en einddatum schriftelijk aan werknemer. Wordt het besluit later herroepen of vernietigd, dan worden de gevolgen beoordeeld volgens de wet en de uitspraak of het besluit. Voor zover de ontbindende voorwaarde in het concrete geval geen rechtsgevolg heeft, blijft inzet verboden en volgt werkgever de toepasselijke wettelijke beëindigingsroute; deze bepaling sluit een wettelijke loonaanspraak niet op voorhand uit.";
}

function stageRouteClause(form = {}) {
  const route = compact(form.internship_type || form.stage_route).toLowerCase();
  const education = compact(form.internship_education_name || form.stage_education_name);
  const institution = compact(form.internship_institution_name);
  const reference = compact(form.internship_route_reference);
  if (route === "bol") {
    const pok = compact(form.internship_bpv_reference);
    const recognition = compact(form.internship_learning_company_recognition_number);
    return `De stage vindt plaats binnen de beroepsopleidende leerweg${education ? ` van ${education}` : ""}. ${institution || "De onderwijsinstelling"}, het stagebedrijf en stagiair voeren de stage uit overeenkomstig de geldige praktijkovereenkomst${pok ? ` met kenmerk ${pok}` : ""}. Het stagebedrijf is voor deze opleiding erkend als leerbedrijf${recognition ? ` onder nummer ${recognition}` : ""}.`;
  }
  if (route === "uwv_trial_placement") {
    return `De stage vindt plaats als door UWV goedgekeurde proefplaatsing${reference ? ` onder referentie ${reference}` : ""}. De proefplaatsing duurt op grond van artikel 14 van de cao maximaal twee maanden en wordt uitgevoerd volgens de UWV-toestemming en voorwaarden. Werkgever heeft vóór aanvang schriftelijk de intentie vastgelegd om stagiair bij voldoende functioneren aansluitend een arbeidsovereenkomst van ten minste zes maanden aan te bieden voor ten minste hetzelfde aantal uren als tijdens de proefplaatsing, voor zover ook aan de overige wettelijke en functievereisten is voldaan.`;
  }
  if (route === "reintegration_measure") {
    return `De stage vindt plaats als re-integratiemaatregel${institution ? ` onder begeleiding van ${institution}` : ""}${reference ? ` onder referentie ${reference}` : ""}. Doel, duur en uitvoering sluiten aan op het schriftelijke re-integratieplan en de voorwaarden van de betrokken instelling.`;
  }
  if (route === "second_track_reintegration") {
    return `De stage vindt plaats in het kader van een tweede-spoortraject${institution ? ` onder begeleiding van ${institution}` : ""}${reference ? ` onder referentie ${reference}` : ""}. Doel, duur en uitvoering sluiten aan op het schriftelijke plan van aanpak en de afspraken met de betrokken werkgever en instelling.`;
  }
  return "";
}

function stageDurationClause(form = {}) {
  const start = formatDate(form.contract_start_date);
  const end = formatDate(form.contract_end_date);
  if (!start || !end) return "";
  const sourceText = form.duration_option === "pok_end_date"
    ? " Deze einddatum is afgestemd op de praktijkovereenkomst (POK)."
    : "";
  return `De stage loopt van ${start} tot en met ${end}.${sourceText} De stage eindigt op die datum zonder dat opzegging nodig is, tenzij partijen haar eerder rechtsgeldig beëindigen volgens deze overeenkomst en de onderliggende praktijkovereenkomst of maatregel.`;
}

function stageWorkClause(form = {}) {
  const functions = readableFunctionValues(form);
  const assignment = compact(form.internship_assignment_description);
  const functionText = functions.length > 0 ? ` binnen de praktijkfunctie${functions.length === 1 ? "" : "s"} ${functions.join(", ")}` : "";
  return assignment
    ? `Stagiair verricht onder begeleiding de volgende leer- en praktijkwerkzaamheden${functionText}: ${assignment}`
    : "";
}

function stageWorkplaceClause(form = {}, company = {}) {
  const location = compact(form.work_location) || compact(company.city);
  const area = compact(form.work_area);
  if (!location) return "";
  return `De primaire stageplaats is ${location}${area ? ` en het overeengekomen werkgebied is ${area}` : ""}. Inzet op een andere locatie is alleen toegestaan wanneer die locatie past bij de stageopdracht, de begeleiding vooraf is geregeld en aan alle Wpbr- en veiligheidsvoorwaarden is voldaan.`;
}

function stageGuidanceClause(form = {}) {
  const trainer = compact(form.internship_practice_trainer_name || form.internship_mentor_name);
  const institutionSupervisor = compact(form.internship_institution_supervisor_name);
  if (!trainer || !institutionSupervisor) return "";
  return `De dagelijkse praktijkbegeleiding wordt verzorgd door ${trainer}. De begeleider namens de instelling is ${institutionSupervisor}. Het stagebedrijf plant dagelijks ten minste één bevoegde praktijkopleider per stagiair en waarborgt daarmee de vereiste één-op-éénbegeleiding.`;
}

function stageWorkingTimesClause(form = {}) {
  const hours = toNumber(form.internship_hours_per_week);
  const times = compact(form.internship_working_times);
  if (hours === null || !times) return "";
  return `De stageomvang bedraagt gemiddeld ${formatHours(hours)} uur per week. De overeengekomen stagedagen en tijdvakken zijn: ${times}. Stagiair wordt in het rooster opgenomen; de Arbeidstijdenwet, regels voor jeugdigen en de toepasselijke onderwijs- of re-integratieafspraken worden nageleefd.`;
}

function stageEvaluationClause(form = {}) {
  const agreement = compact(form.internship_evaluation_details);
  if (!agreement) return "";
  return `Partijen evalueren de stage als volgt: ${agreement}. De praktijkopleider en de begeleider van de instelling leggen de voortgang en gemaakte vervolgafspraken aantoonbaar vast.`;
}

function stageCompensationPeriodLabel(value) {
  return ({
    uur: "uur",
    dag: "dag",
    vier_weken: "vier weken",
    maand: "maand",
  })[compact(value)] || "maand";
}

function stageCompensationClause(form = {}) {
  const applies = toBoolean(form.internship_compensation_applies);
  const expenses = compact(form.internship_expense_arrangement);
  if (applies === false) {
    return `Partijen komen geen stagevergoeding overeen.${expenses ? ` Voor onkosten geldt: ${expenses}` : " Er geldt geen afzonderlijke onkostenvergoeding, tenzij partijen die later schriftelijk overeenkomen."}`;
  }
  const amount = toNumber(form.internship_compensation_amount);
  const period = stageCompensationPeriodLabel(form.internship_compensation_period);
  if (applies === true && amount !== null) {
    return `Het stagebedrijf betaalt een stagevergoeding van ${formatCurrency(amount)} bruto per ${period}.${expenses ? ` Voor onkosten geldt daarnaast: ${expenses}` : ""}`;
  }
  return "";
}

function stageWpbrClause(form = {}) {
  const functions = readableFunctionValues(form);
  const context = functions.length > 0 ? ` voor de overeengekomen praktijkfunctie${functions.length === 1 ? "" : "s"} ${functions.join(", ")}` : "";
  return `Stagiair verricht operationele beveiligingswerkzaamheden${context} uitsluitend indien en zolang de vereiste toestemming, geldige opleidingsverklaring, legitimatie, certificering en eventuele andere functie-eisen aanwezig zijn. De opleidingsuitzondering en het legitimatiebewijs voor een medewerker in opleiding worden alleen gebruikt binnen de toegestane termijn en voor de organisatie waarvoor zij zijn afgegeven.`;
}

function stageInsuranceClause(form = {}) {
  const insurance = compact(form.internship_insurance_description);
  if (!insurance) return "";
  return `Voor de stage gelden de volgende verzekeringen en meldafspraken: ${insurance}. Het stagebedrijf en de instelling informeren stagiair vóór aanvang over dekking, uitsluitingen en de procedure bij schade of een ongeval.`;
}

function stageTerminationClause(form = {}) {
  const route = compact(form.internship_type).toLowerCase();
  const routeText = route === "bol"
    ? "de praktijkovereenkomst en onderwijsregels"
    : route === "uwv_trial_placement"
    ? "de UWV-toestemming en voorwaarden"
    : "het re-integratieplan en de afspraken met de instelling";
  return `De stage kan vóór de einddatum schriftelijk worden beëindigd met instemming van partijen of wanneer voortzetting redelijkerwijs niet mogelijk of verantwoord is, nadat de betrokken partijen zijn gehoord en ${routeText} zijn gevolgd. Een acuut veiligheids-, integriteits- of bevoegdheidsrisico kan aanleiding zijn de activiteiten direct op te schorten in afwachting van een zorgvuldig besluit.`;
}

function ageOnDate(personnel = {}, referenceDate) {
  const birth = dateValue(personnel.date_of_birth || personnel.birth_date);
  const reference = dateValue(referenceDate);
  if (!birth || !reference) return null;
  let age = reference.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = reference.getUTCMonth() < birth.getUTCMonth()
    || (reference.getUTCMonth() === birth.getUTCMonth() && reference.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function stageMinorClause(personnel = {}, form = {}) {
  const age = ageOnDate(personnel, form.contract_start_date);
  if (age === null) return "";
  if (age >= 18) return "Stagiair is bij aanvang van de stage meerderjarig; medeondertekening door een wettelijke vertegenwoordiger is niet vereist.";
  const representative = compact(form.internship_legal_representative_name);
  if (!representative) return "";
  return `Stagiair is bij aanvang minderjarig. De wettelijke vertegenwoordiger ${representative} verklaart kennis te hebben genomen van deze overeenkomst en verleent, voor zover juridisch vereist, toestemming voor deelname aan de stage.`;
}

function bblLearningRouteClause(form = {}) {
  const education = compact(form.bbl_education_name);
  const institution = compact(form.bbl_institution_name);
  const trainer = compact(form.bbl_practice_trainer_name);
  if (!education || !institution || !trainer) return "";
  return `Werknemer volgt de beroepsbegeleidende leerweg ${education} bij ${institution} en doet als aspirant-beveiliger onder begeleiding van praktijkopleider ${trainer} werkervaring op. Deze overeenkomst is een arbeidsovereenkomst: werknemer verricht arbeid, ontvangt loon en behoudt de wettelijke en cao-rechten van een werknemer.`;
}

function bblPracticeAgreementClause(form = {}) {
  const reference = compact(form.bbl_practice_agreement_reference);
  const recognition = compact(form.bbl_learning_company_recognition_number);
  if (!reference || !recognition) return "";
  return `Naast deze arbeidsovereenkomst geldt de afzonderlijke praktijkovereenkomst tussen werknemer, onderwijsinstelling en werkgever met kenmerk ${reference}. Werkgever is voor de opleiding erkend als leerbedrijf onder nummer ${recognition}. De praktijkovereenkomst en deze arbeidsovereenkomst hebben ieder hun eigen rechtskarakter; het einde of wijzigen van één document beëindigt het andere niet automatisch.`;
}

function deriveSalutation(gender) {
  if (gender === "male") return "de heer";
  if (gender === "female") return "mevrouw";
  return "";
}

export function extractContractTemplatePlaceholders(body) {
  const matches = [...String(body || "").matchAll(/\{\{\s*([^}]+?)\s*\}\}|\{\$\s*([^}]+?)\s*\}/g)];
  return uniqueStrings(matches.map(match => match[1] || match[2]));
}

export function getUnknownContractTemplatePlaceholders(body) {
  return extractContractTemplatePlaceholders(body)
    .filter(key => !key.startsWith("clausule:") && !isKnownContractTemplatePlaceholder(key));
}

export function getUnresolvedContractTemplatePlaceholders(body) {
  return extractContractTemplatePlaceholders(body).filter(key => !key.startsWith("clausule:"));
}

export function replaceContractTemplatePlaceholders(templateBody, values = {}) {
  let result = String(templateBody || "");
  Object.entries(values).forEach(([key, value]) => {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result
      .replace(new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, "gi"), value ?? "")
      .replace(new RegExp(`\\{\\$\\s*${escapedKey}\\s*\\}`, "gi"), value ?? "");
  });
  return result;
}

/**
 * @param {{ personnel?: LooseRecord, form?: LooseRecord, company?: LooseRecord }} context
 */
export function buildContractTemplateValues({ personnel = {}, form = {}, company = {} } = {}) {
  personnel = personnel || {};
  form = form || {};
  company = company || {};
  const employeeLegalName = resolveEmployeeLegalName(personnel);
  const legalFirstNames = compact(personnel.legal_first_names);
  const firstName = compact(personnel.call_name || personnel.first_name || legalFirstNames);
  const lastName = compact([personnel.name_prefix, personnel.last_name].filter(Boolean).join(" "));
  const employeeAddressParts = normalizeAddressParts(personnel);
  const companyAddressParts = normalizeAddressParts(company);
  const employeeAddress = formatAddress(employeeAddressParts);
  const companyAddress = formatAddress(companyAddressParts);
  const functionKeys = parseFunctionValues(form);
  const functions = functionKeys.map(value => functionLabel(value));
  const storedPrimaryFunction = functionKeys.includes(form.function_type)
    ? functionLabel(form.function_type)
    : "";
  const primaryFunction = form.primary_function_status === "pending_work_history" && functions.length > 1
    ? "een van de overeengekomen inzetbare functies"
    : (storedPrimaryFunction || functions[0] || "");
  const additionalFunctions = functions.filter(value => value !== primaryFunction);
  const { hoursPerWeek, hoursPerPeriod } = resolvedContractHours(form);
  const minMaxHours = resolvedMinMaxHours(form);
  const hourlyRate = toNumber(form.hourly_rate_snapshot ?? form.custom_hourly_rate);
  const salaryHoursPerPeriod = isPbZeroHours(form)
    ? null
    : (isPbMinMax(form) ? minMaxHours.minHoursPerPeriod : hoursPerPeriod);
  const periodSalary = hourlyRate !== null && salaryHoursPerPeriod !== null ? hourlyRate * salaryHoursPerPeriod : null;
  const caoName = CAO_LABELS[form.cao_key] || compact(form.cao_key);
  const today = todayInAmsterdam();
  const pendingSignatureValue = "________________________";
  const pendingSignatureDate = "____-____-________";

  const values = {
    bedrijf_statutaire_naam: resolveCompanyLegalName(company),
    bedrijf_handelsnaam: compact(company.trade_name || company.display_name || company.legal_name),
    bedrijf_rechtsvorm: compact(company.legal_form),
    bedrijf_adres_volledig: companyAddress,
    bedrijf_kvk: compact(company.kvk_number),
    bedrijf_btw_nummer: compact(company.btw_number),
    bedrijf_email: compact(company.email),
    bedrijf_telefoon: compact(company.phone),
    bedrijf_vertegenwoordiger_naam: compact(form.employer_representative_name) || pendingSignatureValue,
    bedrijf_vertegenwoordiger_functie: compact(form.employer_representative_function) || pendingSignatureValue,
    medewerker_juridische_volledige_naam: employeeLegalName,
    medewerker_juridische_voornamen: legalFirstNames,
    medewerker_volledige_naam: employeeLegalName,
    medewerker_voornaam: firstName,
    medewerker_achternaam: lastName,
    medewerker_aanhef: deriveSalutation(personnel.gender),
    medewerker_geboortedatum: formatDate(personnel.date_of_birth || personnel.birth_date),
    medewerker_geboorteplaats: compact(personnel.place_of_birth || personnel.birth_place),
    medewerker_adres_volledig: employeeAddress,
    medewerker_email: compact(personnel.email),
    medewerker_telefoon: compact(personnel.phone),
    cao_naam: caoName,
    cao_versie: compact(form.cao_version_snapshot || form.cao_version_label)
      || (form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY ? "Versie 3 - juli 2026" : ""),
    cao_functiegroep: pbFunctionGroupLabel(form.cao_function_group),
    cao_functieniveau: pbFunctionLevelLabel(form.cao_function_level),
    salarisschaal: compact(form.cao_scale),
    periodiek: compact(form.cao_period),
    bruto_uurloon: formatCurrency(hourlyRate),
    bruto_salaris_per_loonperiode: formatCurrency(periodSalary),
    contract_startdatum: formatDate(form.contract_start_date),
    contract_einddatum: formatDate(form.contract_end_date),
    contract_einddatum_of_onbepaalde_tijd: durationType(form) === "indefinite"
      ? "onbepaalde tijd"
      : formatDate(form.contract_end_date),
    contract_duursoort: durationType(form) === "indefinite" ? "onbepaalde tijd" : "bepaalde tijd",
    contract_duur_omschrijving: durationDescription(form),
    contract_duur_bepaling: contractDurationClause(form),
    contract_aanzegtermijn_bepaling: contractAanzegClause(form),
    contract_proeftijd_bepaling: contractProbationClause(form),
    contract_opzegtermijn_bepaling: contractTerminationClause(form),
    contract_arbeidsduur_bepaling: contractHoursClause(form),
    contract_oproepvoorwaarden_bepaling: contractCallConditionsClause(form),
    contract_functie_indeling_bepaling: contractFunctionClassificationClause(form),
    contract_werkplek_bepaling: contractWorkplaceClause(form, company),
    contract_beloning_bepaling: contractSalaryClause(form),
    contract_loonindeling_bepaling: contractSalaryClassificationClause(form),
    contract_basisuurloon_bepaling: contractBaseHourlyWageClause(form),
    contract_loonperiode_bepaling: contractPaymentPeriodClause(form),
    contract_vakantie_bepaling: contractVacationClause(form),
    contract_wpbr_bepaling: contractWpbrClause(form),
    contract_wpbr_gevolgen_bepaling: contractWpbrConsequencesClause(),
    hoofdfunctie: primaryFunction,
    functie_lijst: functions.join(", "),
    nevenfuncties_lijst: additionalFunctions.join(", "),
    contracturen_per_week: isPbZeroHours(form) ? "" : ((isPbMinMax(form) ? minMaxHours.minHoursPerWeek : hoursPerWeek) ?? ""),
    contracturen_per_periode: isPbZeroHours(form) ? "" : ((isPbMinMax(form) ? minMaxHours.minHoursPerPeriod : hoursPerPeriod) ?? ""),
    pensioenregeling_naam: "Stichting Bedrijfstakpensioenfonds voor de Particuliere Beveiliging (Pensioenfonds Particuliere Beveiliging)",
    meldpunt_privacy_datalekken: compact(company.privacy_email || company.email || company.phone),
    contract_ondertekeningsplaats: compact(form.signing_place) || pendingSignatureValue,
    contract_ondertekeningsdatum: form.signing_date ? formatDate(form.signing_date) : pendingSignatureDate,
    stage_instelling_naam: compact(form.internship_institution_name),
    stage_instelling_adres: compact(form.internship_institution_address),
    stage_instelling_vertegenwoordiger_naam: compact(form.internship_institution_representative_name),
    stage_instelling_vertegenwoordiger_functie: compact(form.internship_institution_representative_function),
    stage_instelling_email: compact(form.internship_institution_email),
    stage_opleiding_naam: compact(form.internship_education_name),
    stage_bpv_kenmerk: compact(form.internship_bpv_reference),
    stage_leerbedrijf_erkenningsnummer: compact(form.internship_learning_company_recognition_number),
    stage_route_referentie: compact(form.internship_route_reference),
    stage_opdracht_omschrijving: compact(form.internship_assignment_description),
    stage_leerdoelen: compact(form.internship_learning_objectives),
    stage_praktijkopleider_naam: compact(form.internship_practice_trainer_name || form.internship_mentor_name),
    stage_instellingsbegeleider_naam: compact(form.internship_institution_supervisor_name),
    stage_uren_per_week: formatHours(form.internship_hours_per_week),
    stage_werktijden: compact(form.internship_working_times),
    stage_evaluatie_afspraken: compact(form.internship_evaluation_details),
    stage_vergoeding_bedrag: formatCurrency(form.internship_compensation_amount),
    stage_vergoeding_periode: stageCompensationPeriodLabel(form.internship_compensation_period),
    stage_onkostenregeling: compact(form.internship_expense_arrangement),
    stage_verzekering_omschrijving: compact(form.internship_insurance_description),
    stage_bijlagen_lijst: compact(form.internship_attachments),
    stage_wettelijke_vertegenwoordiger_naam: compact(form.internship_legal_representative_name),
    stage_route_bepaling: stageRouteClause(form),
    stage_duur_bepaling: stageDurationClause(form),
    stage_werkzaamheden_bepaling: stageWorkClause(form),
    stage_werkplek_bepaling: stageWorkplaceClause(form, company),
    stage_begeleiding_bepaling: stageGuidanceClause(form),
    stage_werktijden_bepaling: stageWorkingTimesClause(form),
    stage_evaluatie_bepaling: stageEvaluationClause(form),
    stage_vergoeding_bepaling: stageCompensationClause(form),
    stage_wpbr_bepaling: stageWpbrClause(form),
    stage_verzekering_bepaling: stageInsuranceClause(form),
    stage_beeindiging_bepaling: stageTerminationClause(form),
    stage_minderjarigheid_bepaling: stageMinorClause(personnel, form),
    bbl_onderwijsinstelling_naam: compact(form.bbl_institution_name),
    bbl_opleiding_naam: compact(form.bbl_education_name),
    bbl_praktijkovereenkomst_kenmerk: compact(form.bbl_practice_agreement_reference),
    bbl_leerbedrijf_erkenningsnummer: compact(form.bbl_learning_company_recognition_number),
    bbl_praktijkopleider_naam: compact(form.bbl_practice_trainer_name),
    bbl_leerroute_bepaling: bblLearningRouteClause(form),
    bbl_praktijkovereenkomst_bepaling: bblPracticeAgreementClause(form),
    exporteerdatum: formatDate(today),
  };

  return {
    ...values,
    "medewerker.naam": values.medewerker_volledige_naam,
    "medewerker.email": values.medewerker_email,
    "bedrijf.naam": values.bedrijf_statutaire_naam,
    "contract.startdatum": values.contract_startdatum,
    "contract.einddatum": values.contract_einddatum,
    "contract.functie": values.hoofdfunctie,
    "contract.cao": values.cao_naam,
    "contract.schaal": values.salarisschaal,
    "contract.periodiek": values.periodiek,
    "contract.uren_per_week": values.contracturen_per_week,
    "contract.contractvorm": values.contract_duursoort,
    bedrijf_naam: values.bedrijf_statutaire_naam,
    bedrijf_adres: values.bedrijf_adres_volledig,
    bedrijf_postcode: companyAddressParts.postal_code,
    bedrijf_plaats: companyAddressParts.city,
    bedrijf_land: companyAddressParts.country,
    medewerker_adres: values.medewerker_adres_volledig,
    medewerker_straatnaam: employeeAddressParts.street_name,
    medewerker_huisnummer: compact([employeeAddressParts.house_number, employeeAddressParts.house_number_addition].filter(Boolean).join(" ")),
    medewerker_postcode: employeeAddressParts.postal_code,
    medewerker_plaats: employeeAddressParts.city,
    medewerker_woonplaats: employeeAddressParts.city,
    medewerker_land: employeeAddressParts.country,
    startdatum: values.contract_startdatum,
    einddatum: values.contract_einddatum,
    functie: values.hoofdfunctie,
    cao: values.cao_naam,
    schaal: values.salarisschaal,
    trede: values.periodiek,
    uren_per_week: values.contracturen_per_week,
    contractvorm: values.contract_duursoort,
    leidinggevende: values.bedrijf_vertegenwoordiger_naam,
    meldpunt_geheimhouding: values.meldpunt_privacy_datalekken,
    meldpunt_bedrijfsmiddelen: values.meldpunt_privacy_datalekken,
    meldpunt_integriteit: values.meldpunt_privacy_datalekken,
    employeeName: values.medewerker_volledige_naam,
    employeeEmail: values.medewerker_email,
    companyName: values.bedrijf_statutaire_naam,
    startDate: values.contract_startdatum,
    endDate: values.contract_einddatum,
    functionName: values.hoofdfunctie,
    scale: values.salarisschaal,
    period: values.periodiek,
    hoursPerWeek: values.contracturen_per_week,
    contractForm: values.contract_duursoort,
  };
}

export function renderContractTemplateBody(templateBody, context = {}) {
  const legallyMigratedBody = String(templateBody || "")
    .replace(
      "10.3 Ontbreekt of vervalt een vereiste toestemming, legitimatie of vakbekwaamheid, dan zet werkgever werknemer niet in voor werkzaamheden waarvoor die eis geldt. Partijen beoordelen de gevolgen volgens de wet, de {$cao_naam} en de omstandigheden; deze bepaling veroorzaakt geen automatische beëindiging van de arbeidsovereenkomst.",
      "10.3 {$contract_wpbr_gevolgen_bepaling}\n10.4 Werknemer staakt de betrokken werkzaamheden direct en levert het legitimatiebewijs en andere Wpbr-gebonden middelen op eerste verzoek bij werkgever in.",
    )
    .replace(
      "10.5 Ontbreekt of vervalt een vereist document, dan zet werkgever werknemer niet in voor werkzaamheden waarvoor dat document nodig is. Partijen beoordelen eerst voortzetting of aanpassing van opleiding, werk en praktijkovereenkomst volgens wet en cao; deze bepaling veroorzaakt geen automatische beëindiging.",
      "10.5 {$contract_wpbr_gevolgen_bepaling}\n10.6 Ontbreekt of vervalt uitsluitend een opleidings- of praktijkdocument dat niet de Wpbr-toestemming betreft, dan zet werkgever werknemer niet in voor werkzaamheden waarvoor dat document nodig is en beoordelen partijen voortzetting of aanpassing van opleiding, werk en praktijkovereenkomst volgens wet en cao.",
    )
    .replace(
      "12.4 Werknemer meldt verlies, onbevoegde toegang, verkeerde verzending of een mogelijk datalek direct bij {$meldpunt_privacy_datalekken}.",
      "12.4 Werknemer meldt verlies, onbevoegde toegang, verkeerde verzending of een mogelijk datalek direct bij werkgever volgens de op dat moment geldende interne meldprocedure voor privacy- en beveiligingsincidenten.",
    )
    .replace(
      "12.4 Verlies, onbevoegde toegang, verkeerde verzending of een mogelijk datalek wordt direct gemeld bij {$meldpunt_privacy_datalekken} en de praktijkopleider.",
      "12.4 Verlies, onbevoegde toegang, verkeerde verzending of een mogelijk datalek wordt direct gemeld bij het stagebedrijf volgens de op dat moment geldende interne meldprocedure voor privacy- en beveiligingsincidenten en bij de praktijkopleider.",
    );
  return replaceContractTemplatePlaceholders(legallyMigratedBody, buildContractTemplateValues(context));
}

/** @param {LooseRecord} template */
function standardTemplatePreset(template = {}) {
  return getStandardContractTemplatePresetById(
    template.metadata?.standard_template_id || template.standard_template_id,
  );
}

export function getMissingStandardTemplatePlaceholders(body, requiredPlaceholders = PB_FULLTIME_REQUIRED_PLACEHOLDERS) {
  const present = new Set(extractContractTemplatePlaceholders(body));
  return requiredPlaceholders.filter(key => !present.has(key));
}

/**
 * @param {{ personnel?: LooseRecord, form?: LooseRecord, company?: LooseRecord, template?: LooseRecord }} context
 */
export function validateStandardContractTemplateContext({ personnel = {}, form = {}, company = {}, template = {} } = {}) {
  const issues = [];
  const warnings = [];
  const preset = standardTemplatePreset(template);
  if (!preset) return { issues, warnings };
  const isFulltimePreset = preset.id === PB_FULLTIME_STANDARD_TEMPLATE_ID;
  const isFixedParttimePreset = preset.id === PB_PARTTIME_STANDARD_TEMPLATE_ID;
  const isGrowthParttimePreset = preset.id === PB_PARTTIME_GROWTH_STANDARD_TEMPLATE_ID;
  const isMinMaxPreset = preset.id === PB_MIN_MAX_STANDARD_TEMPLATE_ID;
  const isZeroHoursPreset = preset.id === PB_ZERO_HOURS_STANDARD_TEMPLATE_ID;
  const isInternshipPreset = preset.id === PB_ARTICLE_14_INTERNSHIP_STANDARD_TEMPLATE_ID;
  const isBblPreset = preset.id === PB_BBL_EMPLOYMENT_STANDARD_TEMPLATE_ID;
  const isCallPreset = isMinMaxPreset || isZeroHoursPreset;
  const isParttimePreset = isFixedParttimePreset || isGrowthParttimePreset;

  if (form.cao_key !== CAO_PARTICULIERE_BEVEILIGING_KEY) issues.push("Deze standaardtemplate mag alleen met de CAO Particuliere Beveiliging worden gebruikt.");
  if (isFulltimePreset && resolvedEmploymentModel(form) !== "fulltime") issues.push("Deze standaardtemplate is alleen geschikt voor een fulltime dienstverband.");
  if (isFixedParttimePreset && resolvedEmploymentModel(form) !== "parttime_fixed") issues.push("Deze standaardtemplate is alleen geschikt voor een parttime dienstverband volgens het vaste model; gebruik voor een groei-, oproep- of min-maxmodel een andere template.");
  if (isGrowthParttimePreset && resolvedEmploymentModel(form) !== "parttime_growth") issues.push("Deze standaardtemplate is alleen geschikt voor een parttime dienstverband volgens het groeimodel; gebruik voor een vast, oproep- of min-maxmodel een andere template.");
  if (isMinMaxPreset && resolvedEmploymentModel(form) !== "min_max") issues.push("Deze standaardtemplate is alleen geschikt voor een min-maxcontract; gebruik voor een nuluren-, vast of groeimodel een andere template.");
  if (isZeroHoursPreset && resolvedEmploymentModel(form) !== "zero_hours") issues.push("Deze standaardtemplate is alleen geschikt voor een nulurencontract; gebruik voor een min-maxcontract, voorovereenkomst of vaste arbeidsomvang een andere template.");
  if (isInternshipPreset && resolvedEmploymentModel(form) !== "internship") issues.push("Deze standaardtemplate is alleen geschikt voor een stageovereenkomst (BOL / re-integratie) zonder arbeidsovereenkomst; BBL vereist de aparte leerarbeidsovereenkomst (BBL).");
  if (isBblPreset && resolvedEmploymentModel(form) !== "bbl") issues.push("Deze standaardtemplate is alleen geschikt voor een leerarbeidsovereenkomst (BBL); BOL en re-integratiestages vereisen de aparte stageovereenkomst.");
  const missingRequiredPlaceholders = getMissingStandardTemplatePlaceholders(template.body, preset.required_placeholders);
  if (missingRequiredPlaceholders.length > 0) issues.push(`In de standaardtemplate ontbreken verplichte placeholders: ${missingRequiredPlaceholders.join(", ")}.`);
  if (!resolveCompanyLegalName(company)) issues.push("De juridische bedrijfsnaam ontbreekt.");
  if (!compact(company.kvk_number)) issues.push("Het KvK-nummer van de werkgever ontbreekt.");
  if (!compact(company.street_name || company.street) || !compact(company.postal_code) || !compact(company.city)) issues.push("Het volledige adres van de werkgever ontbreekt.");
  if (!compact(personnel.legal_first_names) || !compact(personnel.last_name)) issues.push("Vul de volledige juridische voornamen en achternaam van de medewerker in. Een roepnaam is voor de partij-aanduiding niet voldoende.");
  if (!personnel.date_of_birth && !personnel.birth_date) issues.push("De geboortedatum van de medewerker ontbreekt.");
  if (!personnel.place_of_birth && !personnel.birth_place) issues.push("De geboorteplaats van de medewerker ontbreekt.");
  if (!compact(personnel.street_name || personnel.street) || !compact(personnel.postal_code) || !compact(personnel.city)) issues.push("Het volledige adres van de medewerker ontbreekt.");
  if (!form.contract_start_date) issues.push("De startdatum ontbreekt.");
  const contractStart = dateValue(form.contract_start_date);
  const presetValidFrom = dateValue(preset.legal_basis.valid_from);
  const presetValidUntil = dateValue(preset.legal_basis.valid_until);
  if (contractStart && presetValidFrom && contractStart < presetValidFrom) {
    issues.push(`Deze standaardtemplate is beoordeeld vanaf ${formatDate(preset.legal_basis.valid_from)}; kies voor deze eerdere ingangsdatum een passende CAO-versie.`);
  }
  if (contractStart && presetValidUntil && contractStart > presetValidUntil) {
    issues.push(`Deze standaardtemplate is beoordeeld tot en met ${formatDate(preset.legal_basis.valid_until)}; publiceer eerst een bijgewerkte CAO-versie voor deze ingangsdatum.`);
  }
  if (!compact(form.employer_representative_name)
    || !compact(form.employer_representative_function)
    || !compact(form.signing_place)
    || !form.signing_date) {
    warnings.push("Naam, functie, plaats, datum en handtekening van de werkgever worden bij ondertekening ingevuld. Controleer vóór activering dat het definitieve document volledig door alle vereiste partijen is ondertekend.");
  }
  if (isInternshipPreset) {
    if (form.contract_form !== "stage") issues.push("Een artikel-14-stage moet als stageovereenkomst worden opgeslagen en niet als arbeidsovereenkomst.");
    if (durationType(form) !== "fixed") issues.push("Een stageovereenkomst moet een concrete begin- en einddatum hebben.");
    if (!form.contract_end_date) issues.push("De einddatum van de stage ontbreekt.");
    if (parseFunctionValues(form).length === 0) issues.push("Kies minimaal één praktijkfunctie voor de stage.");
    if (!compact(form.work_location)) issues.push("Vul de primaire stageplaats in.");
    if (form.probation_agreed === true || form.probation_agreed === "true") issues.push("Een stageovereenkomst mag geen proeftijd bevatten.");

    const route = compact(form.internship_type).toLowerCase();
    const allowedRoutes = new Set(["bol", "uwv_trial_placement", "reintegration_measure", "second_track_reintegration"]);
    if (!allowedRoutes.has(route)) issues.push("Kies een toegestane artikel-14-route: BOL, UWV-proefplaatsing, re-integratiemaatregel of tweede spoor. BBL en algemene kantoorstages vallen buiten deze template.");
    if (resolveSecurityWork(form) !== true) issues.push("Deze artikel-14-template is alleen bedoeld voor relevante operationele praktijkervaring als beveiliger. Gebruik voor een kantoor- of managementstage een afzonderlijke algemene stageovereenkomst.");
    if (!compact(form.internship_institution_name)) issues.push("Vul de onderwijs- of re-integratie-instelling in.");
    if (!compact(form.internship_institution_address)) issues.push("Vul het adres van de onderwijs- of re-integratie-instelling in.");
    if (!compact(form.internship_institution_representative_name)) issues.push("Vul de vertegenwoordiger van de instelling in.");
    if (!compact(form.internship_institution_representative_function)) issues.push("Vul de functie van de vertegenwoordiger van de instelling in.");
    if (!compact(form.internship_institution_email)) issues.push("Vul het e-mailadres van de onderwijs- of re-integratie-instelling in.");
    if (!compact(form.internship_education_name)) issues.push("Vul de opleiding of het re-integratietraject in.");
    if (route === "bol") {
      if (!compact(form.internship_bpv_reference)) issues.push("Vul bij BOL het kenmerk van de praktijkovereenkomst (POK/BPV) in.");
      if (!compact(form.internship_learning_company_recognition_number)) issues.push("Vul bij BOL het SBB-erkenningsnummer van het leerbedrijf in.");
    } else if (allowedRoutes.has(route) && !compact(form.internship_route_reference)) {
      issues.push("Vul de referentie van de toestemming, maatregel of het trajectplan in.");
    }
    if (route !== "bol" && form.duration_option === "pok_end_date") {
      issues.push("De keuze 'Einddatum volgens POK' is alleen geschikt voor BOL. Kies voor deze re-integratieroute een vrije einddatum.");
    }
    if (route === "uwv_trial_placement") {
      const lastAllowedDay = addMonthsMinusOneDay(form.contract_start_date, 2);
      const endDate = dateValue(form.contract_end_date);
      if (lastAllowedDay && endDate && endDate > lastAllowedDay) {
        issues.push(`Een UWV-proefplaatsing binnen artikel 14 mag maximaal twee maanden duren. De laatste toegestane dag is ${formatDate(lastAllowedDay.toISOString())}.`);
      }
      if (toBoolean(form.internship_uwv_employment_intent_confirmed) !== true) {
        issues.push("Bevestig dat werkgever voor aanvang schriftelijk de intentie heeft vastgelegd om bij voldoende functioneren aansluitend ten minste zes maanden werk aan te bieden voor ten minste hetzelfde aantal uren als tijdens de UWV-proefplaatsing.");
      }
    }
    if (!compact(form.internship_assignment_description)) issues.push("Beschrijf de stageopdracht en werkzaamheden.");
    if (!compact(form.internship_learning_objectives)) issues.push("Leg de leerdoelen vast.");
    if (!compact(form.internship_practice_trainer_name || form.internship_mentor_name)) issues.push("Vul de praktijkopleider in.");
    if (!compact(form.internship_institution_supervisor_name)) issues.push("Vul de begeleider vanuit de instelling in.");
    if ((toNumber(form.internship_hours_per_week) ?? 0) <= 0) issues.push("Vul een positieve stageomvang per week in.");
    if (!compact(form.internship_working_times)) issues.push("Leg stagedagen en tijdvakken vast.");
    if (!compact(form.internship_evaluation_details)) issues.push("Leg de evaluatiemomenten en evaluatiewijze vast.");
    if (![true, false, "true", "false"].includes(form.internship_compensation_applies)) issues.push("Leg vast of een stagevergoeding geldt.");
    if (toBoolean(form.internship_compensation_applies) === true && toNumber(form.internship_compensation_amount) === null) issues.push("Vul de overeengekomen stagevergoeding in.");
    if (toBoolean(form.internship_compensation_applies) === true && !compact(form.internship_compensation_period)) issues.push("Kies de periode waarop de stagevergoeding betrekking heeft.");
    if (!compact(form.internship_expense_arrangement)) issues.push("Leg de onkostenregeling vast, ook wanneer geen onkosten worden vergoed.");
    if (!compact(form.internship_insurance_description)) issues.push("Leg de verzekeringsdekking en meldprocedure vast.");
    if (!compact(form.internship_attachments)) issues.push("Leg vast welke routeafhankelijke bijlagen onderdeel zijn van het stagedossier.");

    const confirmations = [
      ["internship_supervision_confirmed", "Bevestig dat leren onder begeleiding centraal staat."],
      ["internship_relevant_practical_experience_confirmed", "Bevestig dat het relevante praktijkervaring als beveiliger betreft."],
      ["internship_above_strength_confirmed", "Bevestig dat stagiair bovenformatief wordt ingezet."],
      ["internship_not_customer_billed_confirmed", "Bevestig dat stagiair niet aan de klant wordt doorberekend."],
      ["internship_rostered_confirmed", "Bevestig dat stagiair herkenbaar in het rooster wordt opgenomen."],
      ["internship_one_to_one_guidance_confirmed", "Bevestig dagelijkse één-op-éénbegeleiding."],
      ["internship_uniform_label_confirmed", "Bevestig de zichtbare aanduiding 'stagiair' op het uniform."],
      ["internship_agreement_with_institution_confirmed", "Bevestig dat de instelling partij is bij de stageafspraken."],
      ["internship_working_times_documented", "Bevestig dat de werktijden in de overeenkomst zijn vastgelegd."],
      ["internship_evaluation_agreement_documented", "Bevestig dat de evaluatieafspraken zijn vastgelegd."],
      ["internship_compensation_documented", "Bevestig dat vergoeding en onkosten zijn vastgelegd."],
    ];
    confirmations.forEach(([field, message]) => {
      if (toBoolean(form[field]) !== true) issues.push(message);
    });

    const age = ageOnDate(personnel, form.contract_start_date);
    if (age !== null && age < 18 && !compact(form.internship_legal_representative_name)) {
      issues.push("Vul bij een minderjarige stagiair de wettelijke vertegenwoordiger in.");
    }
    const functions = parseFunctionValues(form);
    if (functions.some(value => ["centralist_pac", "centralist_vtc", "videosurveillant", "geld_waardetransporteur", "waardetransport_chauffeur", "waardetransport_bijrijder"].includes(value))) {
      warnings.push("De gekozen praktijkfunctie heeft aanvullende opleidings-, certificerings- of vergunningseisen. Controleer vóór iedere operationele inzet de specifieke Wpbr-route en begeleiding.");
    }
    warnings.push(...wpbrEvidenceWarnings(personnel, form));
    return { issues: uniqueStrings(issues), warnings: uniqueStrings(warnings) };
  }

  if (!durationType(form)) issues.push("Kies of de arbeidsovereenkomst voor bepaalde of onbepaalde tijd geldt.");
  if (durationType(form) === "fixed" && !form.contract_end_date) issues.push("De einddatum ontbreekt bij een arbeidsovereenkomst voor bepaalde tijd.");
  if (parseFunctionValues(form).length === 0) issues.push("Selecteer minimaal één inzetbare functie voor dit contract.");
  if (!compact(form.work_location)) issues.push("Vul de standplaats in.");
  if (isBblPreset) {
    if (form.contract_form !== "bepaalde_tijd" || durationType(form) !== "fixed") {
      issues.push("Deze universele BBL-standaardtemplate is uitsluitend ingericht voor een leerarbeidsovereenkomst voor bepaalde tijd. Een overeenkomst voor onbepaalde tijd is niet categorisch verboden, maar vereist maatwerkafspraken over voortzetting na de opleiding en juridische beoordeling.");
    }
    if (!["pok_end_date", "free"].includes(form.duration_option)) issues.push("Kies voor BBL 'Einddatum volgens POK' of 'Vrije einddatum'.");
    if (!compact(form.bbl_institution_name)) issues.push("Vul de onderwijsinstelling voor de BBL-route in.");
    if (!compact(form.bbl_education_name)) issues.push("Vul de BBL-opleiding in.");
    if (!compact(form.bbl_practice_agreement_reference)) issues.push("Vul het kenmerk van de afzonderlijke praktijkovereenkomst in.");
    if (!compact(form.bbl_learning_company_recognition_number)) issues.push("Vul het SBB-erkenningsnummer van het leerbedrijf in.");
    if (!compact(form.bbl_practice_trainer_name)) issues.push("Vul de praktijkopleider voor de BBL-route in.");
    if (form.cao_function_level !== "aspirant") issues.push("Een leerarbeidsovereenkomst (BBL) voor beveiligingswerk moet als aspirant worden ingedeeld.");
    if (form.security_role_status !== "aspirant_beveiliger") issues.push("Markeer de werknemer als aspirant-beveiliger.");
    const bblHours = resolvedContractHours(form, { allowPbFulltimeDefault: false });
    if (bblHours.hoursPerPeriod === null || bblHours.hoursPerPeriod <= 0) issues.push("Vul de overeengekomen arbeidsduur van de leerarbeidsovereenkomst (BBL) in.");
    if (bblHours.hoursPerPeriod !== null && bblHours.hoursPerPeriod > 144) issues.push("De structurele arbeidsduur mag niet hoger zijn dan 144 uur per loonperiode van vier weken.");
  }
  if (!["true", "false", true, false].includes(form.probation_agreed)) issues.push("Kies of een proeftijd wordt overeengekomen.");
  if ((form.probation_agreed === "true" || form.probation_agreed === true) && durationType(form) === "fixed" && !isLongerThanSixMonths(form)) {
    issues.push("Bij een tijdelijk contract van zes maanden of korter mag geen proeftijd worden opgenomen.");
  }
  if (form.probation_agreed === "true" || form.probation_agreed === true) {
    if (!form.probation_context || form.probation_context === "unknown") {
      issues.push("Geef aan of dit het eerste contract is of een opvolgend contract; dit bepaalt of een proeftijd geldig kan zijn.");
    }
    if (form.probation_context === "successive_same_work") {
      issues.push("Bij een opvolgend contract voor hetzelfde of vergelijkbaar werk mag niet opnieuw een proeftijd worden opgenomen.");
    }
    if (form.probation_context === "uwv_trial_placement_same_work") {
      issues.push("Na een UWV-proefplaatsing voor hetzelfde of vergelijkbaar werk mag niet alsnog een proeftijd worden opgenomen.");
    }
    if (form.probation_context === "successive_new_skills") {
      warnings.push("Een nieuwe proeftijd bij een opvolgend contract is alleen verdedigbaar als de functie aantoonbaar andere vaardigheden of verantwoordelijkheden vraagt. Leg die reden vast en laat dit bij twijfel controleren.");
    }
  }

  const securityWork = resolveSecurityWork(form);
  const hoursPerWeek = toNumber(form.contract_hours_per_week);
  const hoursPerPeriod = toNumber(form.contract_hours_per_pay_period);
  const resolvedHours = resolvedContractHours(form, { allowPbFulltimeDefault: false });
  const minMaxHours = resolvedMinMaxHours(form);
  if (securityWork === null) issues.push("Leg vast of de medewerker normaal operationeel beveiligingswerk verricht.");
  if (isZeroHoursPreset) {
    const enteredHourFields = [
      form.contract_hours_per_week,
      form.contract_hours_per_pay_period,
      form.min_hours_per_week,
      form.max_hours_per_week,
      form.min_hours_per_pay_period,
      form.max_hours_per_pay_period,
    ].some(value => value !== "" && value !== null && value !== undefined);
    if (enteredHourFields) {
      issues.push("Een nulurencontract mag geen vaste, minimum-, maximum- of garantie-uren bevatten.");
    }
    if (form.call_agreement_type && form.call_agreement_type !== "zero_hours") {
      issues.push("Het gekozen oproeptype moet voor deze standaardtemplate op nuluren staan.");
    }
  }
  if (isMinMaxPreset) {
    const rawMinWeek = toNumber(form.min_hours_per_week);
    const rawMaxWeek = toNumber(form.max_hours_per_week);
    const { minHoursPerPeriod, maxHoursPerPeriod } = minMaxHours;
    if (minHoursPerPeriod === null) {
      issues.push("Vul het minimumaantal garantie-uren per loonperiode van vier weken in.");
    } else if (minHoursPerPeriod <= 0) {
      issues.push("Een min-maxcontract moet meer dan 0 garantie-uren per loonperiode hebben; kies voor nul garantie-uren het nulurenmodel.");
    }
    if (maxHoursPerPeriod === null) {
      issues.push("Vul het maximumaantal uren per loonperiode van vier weken in.");
    } else if (maxHoursPerPeriod > 144) {
      issues.push("Het maximum van een CAO-PB-min-maxcontract mag niet hoger zijn dan 144 uur per loonperiode van vier weken.");
    }
    if (minHoursPerPeriod !== null && maxHoursPerPeriod !== null) {
      if (maxHoursPerPeriod <= minHoursPerPeriod) {
        issues.push("Het maximum moet hoger zijn dan de garantie-uren; bij gelijke waarden hoort een contract met vaste arbeidsomvang.");
      }
      if (maxHoursPerPeriod === 144) {
        warnings.push("Het maximum staat op 144 uur per loonperiode. Uren daarboven kunnen niet eenzijdig worden opgedragen en worden uitsluitend volgens de cao verwerkt.");
      }
      if (minHoursPerPeriod > 0 && maxHoursPerPeriod / minHoursPerPeriod >= 3) {
        warnings.push("De bandbreedte tussen minimum en maximum is groot. Controleer of de garantie-uren een realistisch beeld geven van de structurele inzet.");
      }
    }
    if (rawMinWeek !== null && minHoursPerPeriod !== null && Math.abs((rawMinWeek * 4) - minHoursPerPeriod) > 0.01) {
      issues.push("De minimumuren per week en per loonperiode spreken elkaar tegen.");
    }
    if (rawMaxWeek !== null && maxHoursPerPeriod !== null && Math.abs((rawMaxWeek * 4) - maxHoursPerPeriod) > 0.01) {
      issues.push("De maximumuren per week en per loonperiode spreken elkaar tegen.");
    }

  }
  if (isCallPreset) {
    let rawAvailability = form.availability_windows;
    if (typeof rawAvailability === "string") {
      try {
        rawAvailability = JSON.parse(rawAvailability);
      } catch {
        rawAvailability = [];
      }
    }
    const availability = normalizeAvailabilityWindows(form.availability_windows);
    if (!Array.isArray(rawAvailability) || availability.length === 0) {
      issues.push("Leg ten minste één beschikbaarheidsvenster met dag, begin- en eindtijd vast.");
    } else if (availability.length !== rawAvailability.length) {
      issues.push("Een of meer beschikbaarheidsvensters zijn onvolledig.");
    }
    availability.forEach(window => {
      if (window.start_time === window.end_time) {
        issues.push(`De beschikbaarheid op ${WEEKDAY_LABELS[window.weekday]} heeft dezelfde begin- en eindtijd.`);
      }
      if (window.end_time < window.start_time && !window.crosses_midnight) {
        issues.push(`Markeer de beschikbaarheid op ${WEEKDAY_LABELS[window.weekday]} als doorlopend tot de volgende dag.`);
      }
    });
    if (!CALL_CHANNEL_LABELS[form.call_channel]) {
      issues.push("Kies via welk schriftelijk of elektronisch kanaal werkgever de oproep verstuurt.");
    }
    if (new Set(availability.map(window => window.weekday)).size === 7) {
      warnings.push("De beschikbaarheid omvat alle zeven dagen. Controleer of de tijdvakken noodzakelijk, realistisch en verenigbaar met rusttijden en privébelangen zijn.");
    }
  }
  if (securityWork === true) {
    if (!PB_SECURITY_FUNCTION_GROUPS.has(form.cao_function_group)) issues.push("De CAO-functiegroep kon niet automatisch uit de geselecteerde functies worden afgeleid.");
    if (!form.cao_function_level || form.cao_function_level === "not_applicable") issues.push("Kies het CAO-functieniveau voor de operationele functie.");
    if (isFulltimePreset && (hoursPerWeek !== 36 || hoursPerPeriod !== 144)) {
      issues.push("Een operationele fulltimer onder de CAO Particuliere Beveiliging moet zijn vastgelegd als 36 uur per week en 144 uur per loonperiode.");
    }
    if (isParttimePreset) {
      if (hoursPerPeriod === null) {
        issues.push(`Vul voor het ${isGrowthParttimePreset ? "parttime groeimodel" : "vaste parttimemodel"} een vast aantal contracturen per loonperiode van vier weken in.`);
      } else if (hoursPerPeriod <= 0 || hoursPerPeriod >= 144) {
        issues.push(`Een parttimer in het ${isGrowthParttimePreset ? "groeimodel" : "vaste model"} moet meer dan 0 en minder dan 144 contracturen per loonperiode hebben.`);
      }
      if (hoursPerWeek !== null && hoursPerPeriod !== null && Math.abs((hoursPerWeek * 4) - hoursPerPeriod) > 0.01) {
        issues.push("De weekuren en uren per loonperiode spreken elkaar tegen. De gemiddelde weekuren moeten gelijk zijn aan de periode-uren gedeeld door vier.");
      }
    }
    if (form.cao_scale === "" || form.cao_scale === null || form.cao_scale === undefined) issues.push("De salarisschaal ontbreekt.");
    if (form.cao_period === "" || form.cao_period === null || form.cao_period === undefined) issues.push("De periodiek ontbreekt.");
    const expectedSalaryScale = pbSalaryScaleForFunctionLevel(form.cao_function_level);
    if (!expectedSalaryScale) {
      issues.push("Kies een officieel CAO-functieniveau: aspirant of functie A tot en met E.");
    } else if (toNumber(form.cao_scale) !== expectedSalaryScale) {
      issues.push(`CAO-functieniveau ${pbFunctionLevelLabel(form.cao_function_level)} hoort bij salarisschaal ${expectedSalaryScale}.`);
    }
    const selectedScale = toNumber(form.cao_scale);
    const selectedPeriod = toNumber(form.cao_period);
    const selectedHourlyRate = toNumber(form.hourly_rate_snapshot ?? form.custom_hourly_rate);
    if (selectedScale !== null && selectedPeriod !== null && selectedHourlyRate !== null) {
      const officialWageRow = getOfficialPbWageRows(form.contract_start_date).find(row => (
        row.scale === selectedScale && row.period === selectedPeriod
      ));
      if (!officialWageRow) {
        issues.push("Voor de gekozen startdatum, salarisschaal en periodiek is geen officiële CAO-PB-loonregel beschikbaar. Publiceer of selecteer eerst de juiste loontabel.");
      } else if (Math.abs(officialWageRow.hourly_rate - selectedHourlyRate) > 0.005) {
        issues.push(`Het bruto basisuurloon hoort bij schaal ${selectedScale}, periodiek ${selectedPeriod} op de startdatum ${formatDate(form.contract_start_date)} ${formatCurrency(officialWageRow.hourly_rate)} te zijn.`);
      }
    }
  } else if (securityWork === false) {
    if (isFulltimePreset && hoursPerWeek === null && hoursPerPeriod === null) {
      issues.push("Vul voor de niet-operationele fulltime functie de overeengekomen arbeidsduur in.");
    }
    if (isParttimePreset) {
      if (hoursPerPeriod === null || hoursPerPeriod <= 0) {
        issues.push("Vul voor de niet-operationele parttime functie een vast aantal contracturen per loonperiode in.");
      } else if (hoursPerPeriod >= 144) {
        issues.push("De CAO Particuliere Beveiliging definieert een parttimer als een werknemer met minder dan 144 contracturen per loonperiode; laat een afwijkende niet-operationele omvang juridisch controleren.");
      }
      if (hoursPerWeek !== null && hoursPerPeriod !== null && Math.abs((hoursPerWeek * 4) - hoursPerPeriod) > 0.01) {
        issues.push("De weekuren en uren per loonperiode spreken elkaar tegen. De gemiddelde weekuren moeten gelijk zijn aan de periode-uren gedeeld door vier.");
      }
      const reference = resolvedFulltimeReferenceHours(form);
      const rawReferenceWeek = toNumber(form.fulltime_reference_hours_per_week);
      const rawReferencePeriod = toNumber(form.fulltime_reference_hours_per_pay_period);
      if (reference.hoursPerPeriod === null || reference.hoursPerPeriod <= 0) {
        issues.push("Vul voor de niet-operationele functie de fulltime referentienorm van het bedrijf in.");
      } else if (resolvedHours.hoursPerPeriod !== null && resolvedHours.hoursPerPeriod >= reference.hoursPerPeriod) {
        issues.push("De parttime arbeidsduur moet lager zijn dan de fulltime referentienorm voor deze niet-operationele functie.");
      }
      if (rawReferenceWeek !== null && rawReferencePeriod !== null && Math.abs((rawReferenceWeek * 4) - rawReferencePeriod) > 0.01) {
        issues.push("De fulltime referentienorm per week en per loonperiode spreken elkaar tegen.");
      }
    }
  }
  if (form.salary_payment_frequency && form.salary_payment_frequency !== "four_weeks") {
    issues.push("Binnen deze CAO-PB-standaardtemplate wordt het loon per loonperiode van vier weken betaald.");
  }
  if (toNumber(form.hourly_rate_snapshot ?? form.custom_hourly_rate) === null) issues.push("Het bruto uurloon ontbreekt.");

  const selectedFunctionKeys = parseFunctionValues(form);
  const primaryFunctionKey = selectedFunctionKeys.includes(form.function_type)
    ? form.function_type
    : selectedFunctionKeys[0];
  const expectedPrimaryGroup = suggestPbCaoFunctionGroup(primaryFunctionKey);
  if (expectedPrimaryGroup && form.cao_function_group !== expectedPrimaryGroup) {
    issues.push(`De automatisch afgeleide startindeling voor ${functionLabel(primaryFunctionKey)} hoort bij CAO-functiegroep ${pbFunctionGroupLabel(expectedPrimaryGroup)}.`);
  }
  if (toBoolean(form.event_hospitality_cao_applies) === true) {
    issues.push("Voor deze medewerker is een evenementen- of horecabeveiligings-CAO gemarkeerd; gebruik daarom niet de CAO-PB-standaardtemplate.");
  }
  warnings.push(...wpbrEvidenceWarnings(personnel, form));

  return { issues: uniqueStrings(issues), warnings: uniqueStrings(warnings) };
}

export function getTemplatePlaceholderDetails(body) {
  return extractContractTemplatePlaceholders(body).map(key => ({
    key,
    definition: getContractTemplatePlaceholderDefinition(key),
    known: key.startsWith("clausule:") || isKnownContractTemplatePlaceholder(key),
  }));
}
