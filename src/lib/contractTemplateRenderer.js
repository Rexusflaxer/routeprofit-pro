import { functionLabel } from "./securityCaoCatalog.js";
import {
  CAO_PARTICULIERE_BEVEILIGING_KEY,
  PB_CAO_FUNCTION_GROUP_OPTIONS,
  PB_CAO_FUNCTION_LEVEL_OPTIONS,
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

function uniqueStrings(values = []) {
  return [...new Set(values.map(value => compact(value)).filter(Boolean))];
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

function formatCurrency(value, fallback = "") {
  const number = toNumber(value);
  if (number === null) return fallback;
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(number);
}

function joinAddress({ street, houseNumber, addition, postalCode, city, country }) {
  const streetLine = compact([street, houseNumber, addition].filter(Boolean).join(" "));
  const cityLine = compact([postalCode, city].filter(Boolean).join(" "));
  return [streetLine, cityLine, compact(country)].filter(Boolean).join(", ");
}

function parseFunctionValues(form = {}) {
  const configured = String(form.allowed_function_types_text || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  return uniqueStrings([form.function_type, ...configured]);
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
    return `De arbeidsovereenkomst wordt aangegaan voor bepaalde tijd, van ${startDate} tot en met ${endDate}, en eindigt daarna van rechtswege zonder dat opzegging nodig is.`;
  }
  return "";
}

function contractAanzegClause(form = {}) {
  if (durationType(form) !== "fixed") return "De wettelijke aanzegplicht is bij deze arbeidsovereenkomst voor onbepaalde tijd niet van toepassing.";
  if (!hasSixMonthAanzegThreshold(form)) return "Voor deze contractduur geldt geen wettelijke aanzegtermijn van één maand.";
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
    if (durationType(form) === "fixed") {
      return `${employeeNotice} Deze tijdelijke arbeidsovereenkomst kan tussentijds worden opgezegd. Werkgever kan uitsluitend opzeggen met inachtneming van de wettelijke ontslaggrond en -procedure en de toepasselijke cao-opzegtermijn.`;
    }
    return `${employeeNotice} Werkgever kan uitsluitend opzeggen met inachtneming van de wettelijke ontslaggrond en -procedure en de toepasselijke cao-opzegtermijn.`;
  }
  if (durationType(form) === "fixed") {
    return "De arbeidsovereenkomst kan door ieder van de partijen schriftelijk tussentijds worden opgezegd tegen iedere dag, met inachtneming van de wettelijke opzeggingsregels en de cao-opzegtermijn van één loonperiode van vier weken.";
  }
  return "De arbeidsovereenkomst kan door ieder van de partijen schriftelijk worden opgezegd tegen iedere dag, met inachtneming van de wettelijke opzeggingsregels en de cao-opzegtermijn van twee loonperioden van in totaal acht weken, tenzij partijen rechtsgeldig schriftelijk een gelijke langere termijn overeenkomen.";
}

function contractHoursClause(form = {}) {
  const securityWork = resolveSecurityWork(form);
  const { hoursPerWeek, hoursPerPeriod } = resolvedContractHours(form);
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
  const periodPart = periodSalary !== null
    ? `, overeenkomend met ${formatCurrency(periodSalary)} bruto per loonperiode ${isPbMinMax(form) ? "over de garantie-uren" : "bij de overeengekomen arbeidsduur"}`
    : "";
  const additionalHours = isPbZeroHours(form)
    ? " Werkgever betaalt alle daadwerkelijk gewerkte en anderszins rechtens verschuldigde oproepuren volgens de cao en de wet; er geldt geen gegarandeerd periodeloon."
    : isPbMinMax(form)
    ? " Gewerkte of anderszins loongerechtigde uren boven de garantie-uren worden aanvullend betaald volgens de cao en de wet."
    : "";
  return `Het bruto basisuurloon bedraagt bij aanvang ${formatCurrency(hourlyRate)}${periodPart}, exclusief vakantiebijslag en toepasselijke toeslagen.${additionalHours}${classification}`;
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
    return "De hoofdfunctie is een niet-operationele functie. De cao-onderdelen die artikel 3 van de CAO Particuliere Beveiliging voor niet-beveiligingswerk uitzondert, zijn niet automatisch op werknemer van toepassing; de overeengekomen beloning en arbeidsduur staan in deze arbeidsovereenkomst.";
  }
  if (securityWork === true) {
    return `Voor de cao-indeling geldt functiegroep ${pbFunctionGroupLabel(form.cao_function_group)}, functieniveau ${pbFunctionLevelLabel(form.cao_function_level)}, salarisschaal ${compact(form.cao_scale)} en periodiek ${compact(form.cao_period)}.`;
  }
  return "";
}

function contractVacationClause(form = {}) {
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
  if (securityWork !== true) return `${base} Werknemer verricht geen operationele beveiligingswerkzaamheden zonder de daarvoor vereiste opleiding, vakbekwaamheid en legitimatie.`;
  return `${base} Voor beveiligingswerkzaamheden draagt werknemer het vereiste legitimatiebewijs tijdens het werk bij zich en levert werknemer dit bij het einde van de inzet of op eerste verzoek van werkgever in.`;
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
  const employeeName = compact(personnel.full_name || personnel.display_name || personnel.name
    || [personnel.legal_first_names || personnel.first_name, personnel.name_prefix, personnel.last_name].filter(Boolean).join(" "));
  const firstName = compact(personnel.first_name || personnel.call_name || personnel.legal_first_names);
  const lastName = compact([personnel.name_prefix, personnel.last_name].filter(Boolean).join(" "));
  const employeeAddress = joinAddress({
    street: personnel.street_name || personnel.street,
    houseNumber: personnel.house_number,
    addition: personnel.house_number_addition,
    postalCode: personnel.postal_code,
    city: personnel.city || personnel.place,
    country: personnel.country,
  });
  const companyAddress = joinAddress({
    street: company.street_name || company.street,
    houseNumber: company.house_number,
    addition: company.house_number_addition,
    postalCode: company.postal_code,
    city: company.city || company.place,
    country: company.country,
  });
  const functions = readableFunctionValues(form);
  const primaryFunction = functionLabel(form.function_type) || functions[0] || "";
  const additionalFunctions = functions.filter(value => value !== primaryFunction);
  const { hoursPerWeek, hoursPerPeriod } = resolvedContractHours(form);
  const minMaxHours = resolvedMinMaxHours(form);
  const hourlyRate = toNumber(form.hourly_rate_snapshot ?? form.custom_hourly_rate);
  const salaryHoursPerPeriod = isPbZeroHours(form)
    ? null
    : (isPbMinMax(form) ? minMaxHours.minHoursPerPeriod : hoursPerPeriod);
  const periodSalary = hourlyRate !== null && salaryHoursPerPeriod !== null ? hourlyRate * salaryHoursPerPeriod : null;
  const caoName = CAO_LABELS[form.cao_key] || compact(form.cao_key);
  const today = new Date().toISOString().slice(0, 10);

  const values = {
    bedrijf_statutaire_naam: compact(company.legal_name || company.display_name),
    bedrijf_handelsnaam: compact(company.trade_name || company.display_name || company.legal_name),
    bedrijf_rechtsvorm: compact(company.legal_form),
    bedrijf_adres_volledig: companyAddress,
    bedrijf_kvk: compact(company.kvk_number),
    bedrijf_btw_nummer: compact(company.btw_number),
    bedrijf_email: compact(company.email),
    bedrijf_telefoon: compact(company.phone),
    bedrijf_vertegenwoordiger_naam: compact(form.employer_representative_name),
    bedrijf_vertegenwoordiger_functie: compact(form.employer_representative_function),
    medewerker_volledige_naam: employeeName,
    medewerker_voornaam: firstName,
    medewerker_achternaam: lastName,
    medewerker_aanhef: deriveSalutation(personnel.gender),
    medewerker_geboortedatum: formatDate(personnel.date_of_birth || personnel.birth_date),
    medewerker_geboorteplaats: compact(personnel.place_of_birth || personnel.birth_place),
    medewerker_adres_volledig: employeeAddress,
    medewerker_email: compact(personnel.email),
    medewerker_telefoon: compact(personnel.phone),
    cao_naam: caoName,
    cao_versie: form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY ? "Versie 3 - juli 2026" : "",
    cao_functiegroep: pbFunctionGroupLabel(form.cao_function_group),
    cao_functieniveau: pbFunctionLevelLabel(form.cao_function_level),
    salarisschaal: compact(form.cao_scale),
    periodiek: compact(form.cao_period),
    bruto_uurloon: formatCurrency(hourlyRate),
    bruto_salaris_per_loonperiode: formatCurrency(periodSalary),
    contract_startdatum: formatDate(form.contract_start_date),
    contract_einddatum: formatDate(form.contract_end_date),
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
    contract_loonperiode_bepaling: contractPaymentPeriodClause(form),
    contract_vakantie_bepaling: contractVacationClause(form),
    contract_wpbr_bepaling: contractWpbrClause(form),
    hoofdfunctie: primaryFunction,
    functie_lijst: functions.join(", "),
    nevenfuncties_lijst: additionalFunctions.join(", "),
    contracturen_per_week: isPbZeroHours(form) ? "" : ((isPbMinMax(form) ? minMaxHours.minHoursPerWeek : hoursPerWeek) ?? ""),
    contracturen_per_periode: isPbZeroHours(form) ? "" : ((isPbMinMax(form) ? minMaxHours.minHoursPerPeriod : hoursPerPeriod) ?? ""),
    pensioenregeling_naam: "Stichting Bedrijfstakpensioenfonds voor de Particuliere Beveiliging",
    meldpunt_privacy_datalekken: compact(company.privacy_email || company.email || company.phone),
    contract_ondertekeningsplaats: compact(form.signing_place || company.city),
    contract_ondertekeningsdatum: formatDate(form.signing_date || today),
    exporteerdatum: formatDate(today),
  };

  return {
    ...values,
    "medewerker.naam": values.medewerker_volledige_naam,
    "medewerker.email": values.medewerker_email,
    "bedrijf.naam": values.bedrijf_statutaire_naam,
    "contract.startdatum": values.contract_startdatum,
    "contract.einddatum": values.contract_einddatum || "onbepaalde tijd",
    "contract.functie": values.hoofdfunctie,
    "contract.cao": values.cao_naam,
    "contract.schaal": values.salarisschaal,
    "contract.periodiek": values.periodiek,
    "contract.uren_per_week": values.contracturen_per_week,
    "contract.contractvorm": values.contract_duursoort,
    bedrijf_naam: values.bedrijf_statutaire_naam,
    bedrijf_adres: values.bedrijf_adres_volledig,
    bedrijf_postcode: compact(company.postal_code),
    bedrijf_plaats: compact(company.city),
    bedrijf_land: compact(company.country),
    medewerker_adres: values.medewerker_adres_volledig,
    medewerker_straatnaam: compact(personnel.street_name || personnel.street),
    medewerker_huisnummer: compact([personnel.house_number, personnel.house_number_addition].filter(Boolean).join(" ")),
    medewerker_postcode: compact(personnel.postal_code),
    medewerker_plaats: compact(personnel.city || personnel.place),
    medewerker_woonplaats: compact(personnel.city || personnel.place),
    medewerker_land: compact(personnel.country),
    startdatum: values.contract_startdatum,
    einddatum: values.contract_einddatum || "onbepaalde tijd",
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
    endDate: values.contract_einddatum || "onbepaalde tijd",
    functionName: values.hoofdfunctie,
    scale: values.salarisschaal,
    period: values.periodiek,
    hoursPerWeek: values.contracturen_per_week,
    contractForm: values.contract_duursoort,
  };
}

export function renderContractTemplateBody(templateBody, context = {}) {
  return replaceContractTemplatePlaceholders(templateBody, buildContractTemplateValues(context));
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
  const isCallPreset = isMinMaxPreset || isZeroHoursPreset;
  const isParttimePreset = isFixedParttimePreset || isGrowthParttimePreset;

  if (form.cao_key !== CAO_PARTICULIERE_BEVEILIGING_KEY) issues.push("Deze standaardtemplate mag alleen met de CAO Particuliere Beveiliging worden gebruikt.");
  if (isFulltimePreset && resolvedEmploymentModel(form) !== "fulltime") issues.push("Deze standaardtemplate is alleen geschikt voor een fulltime dienstverband.");
  if (isFixedParttimePreset && resolvedEmploymentModel(form) !== "parttime_fixed") issues.push("Deze standaardtemplate is alleen geschikt voor een parttime dienstverband volgens het vaste model; gebruik voor een groei-, oproep- of min-maxmodel een andere template.");
  if (isGrowthParttimePreset && resolvedEmploymentModel(form) !== "parttime_growth") issues.push("Deze standaardtemplate is alleen geschikt voor een parttime dienstverband volgens het groeimodel; gebruik voor een vast, oproep- of min-maxmodel een andere template.");
  if (isMinMaxPreset && resolvedEmploymentModel(form) !== "min_max") issues.push("Deze standaardtemplate is alleen geschikt voor een min-maxcontract; gebruik voor een nuluren-, vast of groeimodel een andere template.");
  if (isZeroHoursPreset && resolvedEmploymentModel(form) !== "zero_hours") issues.push("Deze standaardtemplate is alleen geschikt voor een nulurencontract; gebruik voor een min-maxcontract, voorovereenkomst of vaste arbeidsomvang een andere template.");
  const missingRequiredPlaceholders = getMissingStandardTemplatePlaceholders(template.body, preset.required_placeholders);
  if (missingRequiredPlaceholders.length > 0) issues.push(`In de standaardtemplate ontbreken verplichte placeholders: ${missingRequiredPlaceholders.join(", ")}.`);
  if (!compact(company.legal_name || company.display_name)) issues.push("De juridische bedrijfsnaam ontbreekt.");
  if (!compact(company.kvk_number)) issues.push("Het KvK-nummer van de werkgever ontbreekt.");
  if (!compact(company.street_name || company.street) || !compact(company.postal_code) || !compact(company.city)) issues.push("Het volledige adres van de werkgever ontbreekt.");
  if (!compact(personnel.full_name || personnel.display_name || personnel.name || personnel.first_name)) issues.push("De volledige naam van de medewerker ontbreekt.");
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
  if (!durationType(form)) issues.push("Kies of de arbeidsovereenkomst voor bepaalde of onbepaalde tijd geldt.");
  if (durationType(form) === "fixed" && !form.contract_end_date) issues.push("De einddatum ontbreekt bij een arbeidsovereenkomst voor bepaalde tijd.");
  if (!form.function_type) issues.push("Kies één hoofdfunctie.");
  if (!compact(form.work_location)) issues.push("Vul de standplaats in.");
  if (!compact(form.employer_representative_name)) issues.push("Vul de naam van de vertegenwoordiger van werkgever in.");
  if (!compact(form.employer_representative_function)) issues.push("Vul de functie van de vertegenwoordiger van werkgever in.");
  if (!compact(form.signing_place)) issues.push("Vul de plaats van ondertekening in.");
  if (!form.signing_date) issues.push("Vul de datum van ondertekening in.");
  if (!compact(company.privacy_email || company.email || company.phone)) issues.push("Vul bij het bedrijf een e-mailadres of telefoonnummer in voor privacy- en beveiligingsmeldingen.");
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
    if (!PB_SECURITY_FUNCTION_GROUPS.has(form.cao_function_group)) issues.push("Kies de bij de hoofdfunctie passende CAO-functiegroep.");
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

  const functions = parseFunctionValues(form);
  const mappedGroups = pbFunctionGroupsForFunctions(functions);
  const expectedPrimaryGroup = suggestPbCaoFunctionGroup(form.function_type);
  if (expectedPrimaryGroup && form.cao_function_group !== expectedPrimaryGroup) {
    issues.push(`De hoofdfunctie ${functionLabel(form.function_type)} hoort in deze configuratie bij CAO-functiegroep ${pbFunctionGroupLabel(expectedPrimaryGroup)}.`);
  }
  if (mappedGroups.length > 1) {
    warnings.push("De gekozen functies vallen in meerdere CAO-functiegroepen. De hoofdfunctie en inschaling moeten aansluiten op de werkzaamheden die ten minste 50% van de arbeidsduur beslaan.");
  }
  if (toBoolean(form.event_hospitality_cao_applies) === true) {
    issues.push("Voor deze medewerker is een evenementen- of horecabeveiligings-CAO gemarkeerd; gebruik daarom niet de CAO-PB-standaardtemplate.");
  }
  if (personnel.wpbr_status && personnel.wpbr_status !== "approved") {
    warnings.push("De Wpbr-toestemming van de medewerker staat niet op goedgekeurd. De medewerker mag niet worden ingezet zolang de vereiste toestemming ontbreekt.");
  }

  return { issues: uniqueStrings(issues), warnings: uniqueStrings(warnings) };
}

export function getTemplatePlaceholderDetails(body) {
  return extractContractTemplatePlaceholders(body).map(key => ({
    key,
    definition: getContractTemplatePlaceholderDefinition(key),
    known: key.startsWith("clausule:") || isKnownContractTemplatePlaceholder(key),
  }));
}
