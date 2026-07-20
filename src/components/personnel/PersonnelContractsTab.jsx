import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { jsPDF } from "jspdf";
import { base44 } from "@/api/base44Client";
import ManagedFilePreviewDialog from "@/components/files/ManagedFilePreviewDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buildAuditMetadata, getAuditActorLabel } from "@/lib/auditTrail";
import { uploadManagedFile } from "@/lib/managedFiles";
import {
  buildFunctionGroupsForWpbrLicenses,
  CAO_OPTIONS,
  FUNCTION_CATALOG_OPTIONS,
  functionLabel,
  SHARED_BACKOFFICE_FUNCTIONS,
} from "@/lib/securityCaoCatalog";
import {
  CAO_PARTICULIERE_BEVEILIGING_KEY,
  PB_CAO_FUNCTION_LEVEL_OPTIONS,
  pbFunctionGroupsForFunctions,
  pbSalaryScaleForFunctionLevel,
  suggestPbCaoFunctionGroup,
} from "@/lib/contractTemplateCatalog";
import {
  buildContractTemplateValues,
  getUnresolvedContractTemplatePlaceholders,
  renderContractTemplateBody,
  validateStandardContractTemplateContext,
} from "@/lib/contractTemplateRenderer";
import {
  formatPageNumber,
  normalizePageNumberSettings,
  pageNumberHorizontalAlignment,
} from "@/lib/letterheadDocumentSettings";
import { groupContractTemplateVersions } from "@/lib/contractTemplateEditor";
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  FileSignature,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Upload,
  X,
} from "lucide-react";

const CAO_OPTION_LABELS = Object.fromEntries(CAO_OPTIONS.map(option => [option.value, option.label]));
const FLEX_REFORM_EFFECTIVE_DATE = "2028-01-01";

const CALL_EXCEPTION_OPTIONS = [
  { value: "none", label: "Geen uitzondering" },
  { value: "minor", label: "Jonger dan 18 jaar" },
  { value: "pupil", label: "Scholier" },
  { value: "student", label: "Student" },
  { value: "aow", label: "AOW-gerechtigd" },
];

const CONTRACT_FORM_OPTIONS = [
  { value: "bepaalde_tijd", label: "Bepaalde tijd" },
  { value: "onbepaalde_tijd", label: "Onbepaalde tijd" },
  { value: "oproep", label: "Oproepovereenkomst" },
  { value: "stage", label: "Stage" },
  { value: "uitzend", label: "Uitzend" },
  { value: "payroll", label: "Payroll" },
  { value: "zzp", label: "ZZP" },
  { value: "unknown", label: "Onbekend" },
];

const EMPLOYMENT_MODEL_OPTIONS = [
  { value: "fulltime", label: "Fulltime" },
  { value: "parttime_fixed", label: "Parttime vast" },
  { value: "parttime_growth", label: "Parttime groeimodel" },
  { value: "zero_hours", label: "Nulurencontract" },
  { value: "call_agreement", label: "Nulurencontract" },
  { value: "min_max", label: "Min-max" },
  { value: "internship", label: "Stageovereenkomst (BOL / re-integratie)" },
  { value: "bbl", label: "Leerarbeidsovereenkomst (BBL)" },
  { value: "zzp", label: "ZZP / opdracht" },
  { value: "unknown", label: "Onbekend" },
];

const FUNCTION_TYPES = FUNCTION_CATALOG_OPTIONS;

const FUNCTION_TYPE_LABELS = Object.fromEntries(FUNCTION_TYPES.map(option => [option.value, option.label]));
const CONTRACT_FORM_LABELS = Object.fromEntries(CONTRACT_FORM_OPTIONS.map(option => [option.value, option.label]));
const EMPLOYMENT_MODEL_LABELS = Object.fromEntries(EMPLOYMENT_MODEL_OPTIONS.map(option => [option.value, option.label]));

const CONTRACT_MODEL_OPTIONS = [
  {
    value: "fulltime_fixed",
    label: "Fulltime dienstverband - bepaalde tijd",
    contract_form: "bepaalde_tijd",
    duration_type: "fixed",
    employment_model: "fulltime",
    default_hours: 36,
  },
  {
    value: "fulltime_indefinite",
    label: "Fulltime dienstverband - onbepaalde tijd",
    contract_form: "onbepaalde_tijd",
    duration_type: "indefinite",
    employment_model: "fulltime",
    default_hours: 36,
  },
  {
    value: "parttime_fixed",
    label: "Parttime vast - bepaalde tijd",
    contract_form: "bepaalde_tijd",
    duration_type: "fixed",
    employment_model: "parttime_fixed",
  },
  {
    value: "parttime_indefinite",
    label: "Parttime vast - onbepaalde tijd",
    contract_form: "onbepaalde_tijd",
    duration_type: "indefinite",
    employment_model: "parttime_fixed",
  },
  {
    value: "parttime_growth_fixed",
    label: "Parttime groeimodel - bepaalde tijd",
    contract_form: "bepaalde_tijd",
    duration_type: "fixed",
    employment_model: "parttime_growth",
    allowed_cao_keys: [CAO_PARTICULIERE_BEVEILIGING_KEY],
  },
  {
    value: "parttime_growth_indefinite",
    label: "Parttime groeimodel - onbepaalde tijd",
    contract_form: "onbepaalde_tijd",
    duration_type: "indefinite",
    employment_model: "parttime_growth",
    allowed_cao_keys: [CAO_PARTICULIERE_BEVEILIGING_KEY],
  },
  {
    value: "min_max_fixed",
    label: "Min-max - bepaalde tijd",
    contract_form: "oproep",
    underlying_contract_form: "bepaalde_tijd",
    duration_type: "fixed",
    employment_model: "min_max",
  },
  {
    value: "min_max_indefinite",
    label: "Min-max - onbepaalde tijd",
    contract_form: "oproep",
    underlying_contract_form: "onbepaalde_tijd",
    duration_type: "indefinite",
    employment_model: "min_max",
  },
  {
    value: "call_fixed",
    label: "Oproep / nuluren - bepaalde tijd",
    contract_form: "oproep",
    underlying_contract_form: "bepaalde_tijd",
    duration_type: "fixed",
    employment_model: "zero_hours",
  },
  {
    value: "call_indefinite",
    label: "Oproep / nuluren - onbepaalde tijd",
    contract_form: "oproep",
    underlying_contract_form: "onbepaalde_tijd",
    duration_type: "indefinite",
    employment_model: "zero_hours",
  },
  {
    value: "internship_fixed",
    label: "Stageovereenkomst (BOL / re-integratie)",
    contract_form: "stage",
    duration_type: "fixed",
    employment_model: "internship",
    learning_route: "article_14_internship",
    allowed_cao_keys: [CAO_PARTICULIERE_BEVEILIGING_KEY],
  },
  {
    value: "bbl_fixed",
    label: "Leerarbeidsovereenkomst (BBL)",
    contract_form: "bepaalde_tijd",
    duration_type: "fixed",
    employment_model: "bbl",
    learning_route: "bbl",
    allowed_cao_keys: [CAO_PARTICULIERE_BEVEILIGING_KEY],
  },
  {
    value: "zzp_assignment",
    label: "Overeenkomst van opdracht (ZZP)",
    contract_form: "zzp",
    duration_type: "fixed",
    employment_model: "zzp",
    show_in_employee_wizard: false,
  },
];

const CONTRACT_KIND_OPTIONS = [
  { value: "fulltime", label: "Fulltime dienstverband", description: "Een volledige arbeidsomvang volgens de gekozen cao." },
  { value: "parttime_fixed", label: "Parttime dienstverband", description: "Een vaste arbeidsomvang die lager is dan fulltime." },
  { value: "parttime_growth", label: "Parttime groeimodel", description: "Een vaste parttimebasis met de cao-afspraken van het groeimodel.", allowed_cao_keys: [CAO_PARTICULIERE_BEVEILIGING_KEY] },
  { value: "min_max", label: "Min-maxcontract", description: "Garantie-uren met een vooraf begrensde maximale inzet." },
  { value: "zero_hours", label: "Nulurencontract", description: "Een oproepovereenkomst zonder vaste arbeidsomvang." },
  { value: "internship", label: "Stageovereenkomst (BOL / re-integratie)", description: "Een leer- of re-integratietraject dat geen arbeidsovereenkomst is.", allowed_cao_keys: [CAO_PARTICULIERE_BEVEILIGING_KEY] },
  { value: "bbl", label: "Leerarbeidsovereenkomst (BBL)", description: "Een arbeidsovereenkomst naast de praktijkovereenkomst met de onderwijsinstelling.", allowed_cao_keys: [CAO_PARTICULIERE_BEVEILIGING_KEY] },
];

const DURATION_OPTIONS = [
  { value: "1_month", label: "1 maand", months: 1 },
  { value: "2_months", label: "2 maanden", months: 2 },
  { value: "6_months", label: "6 maanden", months: 6 },
  { value: "7_months", label: "7 maanden", months: 7 },
  { value: "1_year", label: "1 jaar", months: 12 },
  { value: "2_years", label: "2 jaar", months: 24 },
  { value: "3_years", label: "3 jaar", months: 36 },
  { value: "pok_end_date", label: "Einddatum volgens POK", months: null },
  { value: "free", label: "Vrije einddatum", months: null },
];

const DURATION_OPTION_LABELS = Object.fromEntries(DURATION_OPTIONS.map(option => [option.value, option.label]));

const MIN_MAX_WEEKDAY_OPTIONS = [
  { value: "monday", label: "Maandag" },
  { value: "tuesday", label: "Dinsdag" },
  { value: "wednesday", label: "Woensdag" },
  { value: "thursday", label: "Donderdag" },
  { value: "friday", label: "Vrijdag" },
  { value: "saturday", label: "Zaterdag" },
  { value: "sunday", label: "Zondag" },
];

const CALL_CHANNEL_OPTIONS = [
  { value: "employee_app", label: "Medewerkersapp" },
  { value: "email", label: "E-mail" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "Sms" },
  { value: "employee_app_and_email", label: "Medewerkersapp en e-mail" },
];

const INTERNSHIP_ROUTE_OPTIONS = [
  { value: "bol", label: "BOL-stage" },
  { value: "uwv_trial_placement", label: "UWV-proefplaatsing" },
  { value: "reintegration_measure", label: "Re-integratiemaatregel" },
  { value: "second_track_reintegration", label: "Tweede spoor" },
];

const INTERNSHIP_CONFIRMATION_FIELDS = [
  ["internship_supervision_confirmed", "Leren onder begeleiding staat centraal"],
  ["internship_relevant_practical_experience_confirmed", "Relevante praktijkervaring als beveiliger"],
  ["internship_above_strength_confirmed", "Bovenformatief en niet ter vervanging"],
  ["internship_not_customer_billed_confirmed", "Niet doorbelasten aan klant"],
  ["internship_rostered_confirmed", "Herkenbaar opnemen in rooster"],
  ["internship_one_to_one_guidance_confirmed", "Dagelijkse 1-op-1-begeleiding"],
  ["internship_uniform_label_confirmed", "Uniform vermeldt duidelijk 'stagiair'"],
  ["internship_agreement_with_institution_confirmed", "Instelling is partij bij de stageafspraken"],
  ["internship_working_times_documented", "Werktijden zijn vastgelegd"],
  ["internship_evaluation_agreement_documented", "Evaluatieafspraken zijn vastgelegd"],
  ["internship_compensation_documented", "Vergoeding en onkosten zijn vastgelegd"],
];

const DOCUMENT_STATUS_LABELS = {
  concept: "Concept",
  generated: "Gegenereerd",
  signed: "Getekend - controle nodig",
  scheduled: "Ingepland",
  active: "Actief",
  archived: "Gearchiveerd",
  expired: "Verlopen",
};

const DOCUMENT_STATUS_STYLES = {
  concept: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  generated: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
  signed: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
  scheduled: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200",
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  archived: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  expired: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
};

function toArrayText(value) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function fromArrayText(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getMinMaxBand(value) {
  const minPayPeriod = numberOrNull(value?.min_hours_per_pay_period);
  const maxPayPeriod = numberOrNull(value?.max_hours_per_pay_period);
  if (minPayPeriod !== null && maxPayPeriod !== null) {
    return { minimum: minPayPeriod, maximum: maxPayPeriod, period: "loonperiode" };
  }
  const minWeek = numberOrNull(value?.min_hours_per_week);
  const maxWeek = numberOrNull(value?.max_hours_per_week);
  if (minWeek !== null && maxWeek !== null) {
    return { minimum: minWeek, maximum: maxWeek, period: "week" };
  }
  return { minimum: null, maximum: null, period: null };
}

function legalReferenceDate(value) {
  return value?.contract_agreed_at || value?.signing_date || value?.contract_start_date || "";
}

function isStatutoryBandwidthModel(value) {
  if (value?.employment_contract_model !== "min_max" || legalReferenceDate(value) < FLEX_REFORM_EFFECTIVE_DATE) return false;
  const band = getMinMaxBand(value);
  return band.minimum !== null
    && band.maximum !== null
    && band.minimum > 0
    && band.maximum >= band.minimum
    && band.maximum <= band.minimum * 1.3;
}

function boolOrNull(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function boolToSelect(value) {
  if (value === true) return "true";
  if (value === false) return "false";
  return "unknown";
}

function uniqueValues(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function compact(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function formatDate(value, fallback = "-") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function dateKey(value, fallback = "9999-12-31") {
  if (!value) return fallback;
  return String(value).slice(0, 10);
}

function getYear(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
}

function addMonthsMinusOneDay(value, months) {
  if (!value || !months) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setMonth(date.getMonth() + months);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

function addMonths(value, months) {
  if (!value || !months) return "";
  const start = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return "";
  const originalDay = start.getUTCDate();
  const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(originalDay, lastDay));
  return target.toISOString().slice(0, 10);
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
  return source.map(item => ({
    weekday: item?.weekday || item?.day || item?.day_of_week || "",
    start_time: item?.start_time || item?.start || "09:00",
    end_time: item?.end_time || item?.end || "17:00",
    crosses_midnight: item?.crosses_midnight === true,
  })).filter(item => MIN_MAX_WEEKDAY_OPTIONS.some(day => day.value === item.weekday));
}

function durationLabel(value) {
  return DURATION_OPTION_LABELS[value] || "";
}

function getContractModel(value) {
  return CONTRACT_MODEL_OPTIONS.find(option => option.value === value) || null;
}

function contractModelAllowedForCao(option, caoKey) {
  if (!option || option.show_in_employee_wizard === false) return false;
  if (!Array.isArray(option.allowed_cao_keys) || option.allowed_cao_keys.length === 0) return true;
  return !!caoKey && option.allowed_cao_keys.includes(caoKey);
}

function contractKindAllowedForCao(option, caoKey) {
  return !Array.isArray(option?.allowed_cao_keys)
    || option.allowed_cao_keys.length === 0
    || option.allowed_cao_keys.includes(caoKey);
}

function modelForKindAndDuration(employmentModel, durationType) {
  return CONTRACT_MODEL_OPTIONS.find(option => (
    option.employment_model === employmentModel
    && option.duration_type === durationType
    && option.show_in_employee_wizard !== false
  )) || null;
}

function pbFunctionLevelForSalaryScale(scale) {
  const numericScale = Number(scale);
  return PB_CAO_FUNCTION_LEVEL_OPTIONS.find(option => pbSalaryScaleForFunctionLevel(option.value) === numericScale)?.value || null;
}

function probationMaximumMonths(form) {
  if (["internship", "zzp"].includes(form.employment_contract_model)) return 0;
  if (form.duration_type === "indefinite") return 2;
  if (!form.contract_start_date || !form.contract_end_date) return 0;
  const sixMonthBoundary = addMonths(form.contract_start_date, 6);
  if (form.contract_end_date < sixMonthBoundary) return 0;
  const twoYearBoundary = addMonths(form.contract_start_date, 24);
  return form.contract_end_date < twoYearBoundary ? 1 : 2;
}

function inferContractModel(value) {
  if (value.contract_model === "bbl_indefinite") return "";
  if (value.contract_model) return value.contract_model;
  const hasMinMaxHours = value.min_hours_per_pay_period || value.max_hours_per_pay_period
    || value.min_hours_per_week || value.max_hours_per_week;
  const sourceEmploymentModel = value.employment_contract_model || "unknown";
  const employmentModel = sourceEmploymentModel === "call_agreement"
    ? (hasMinMaxHours || value.call_agreement_type === "min_max" ? "min_max" : "zero_hours")
    : sourceEmploymentModel;
  const durationType = value.duration_type || (value.contract_form === "onbepaalde_tijd" ? "indefinite" : "fixed");
  if (employmentModel === "min_max" && value.call_agreement_type === "statutory_bandwidth") {
    return CONTRACT_MODEL_OPTIONS.find(option => (
      option.employment_model === "min_max" && option.duration_type === durationType
    ))?.value || "";
  }
  const candidate = CONTRACT_MODEL_OPTIONS.find(option => {
    if (option.contract_form !== value.contract_form) return false;
    if (option.duration_type !== durationType) return false;
    if (value.contract_form === "oproep" && option.underlying_contract_form !== value.underlying_contract_form) return false;
    return option.employment_model === employmentModel;
  });
  return candidate?.value || "";
}

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(number);
}

function rangesOverlap(startA, endA, startB, endB) {
  const aStart = dateKey(startA, "0000-01-01");
  const aEnd = dateKey(endA);
  const bStart = dateKey(startB, "0000-01-01");
  const bEnd = dateKey(endB);
  return aStart <= bEnd && bStart <= aEnd;
}

function effectiveEndForContract(contract) {
  if (contract?.effective_contract_end_date) return contract.effective_contract_end_date;
  if (contract?.statutory_conversion_applies === true || contract?.effective_duration_type === "indefinite") return null;
  return contract?.contract_end_date || null;
}

function hasMeaningfulSecurityRole(value) {
  return !!value && !["unknown", "not_applicable"].includes(value);
}

function isDateWithinOptionRange(option, date) {
  if (!date || !option) return true;
  const isoDate = String(date).slice(0, 10);
  if (option.valid_from && String(option.valid_from).slice(0, 10) > isoDate) return false;
  if (option.valid_until && String(option.valid_until).slice(0, 10) < isoDate) return false;
  return true;
}

function resolveAssignmentCaoKey(assignment, caoOptions = []) {
  if (assignment?.cao_key) return assignment.cao_key;
  if (!assignment?.cao_configuration_id) return null;
  return (caoOptions || []).find(option => option.id === assignment.cao_configuration_id)?.cao_key || null;
}

function buildCompanyCaoKeyOptions(assignments, referenceDate, caoOptions = []) {
  const activeAssignments = (assignments || []).filter(assignment => isDateWithinOptionRange(assignment, referenceDate));
  return uniqueValues(activeAssignments.map(assignment => resolveAssignmentCaoKey(assignment, caoOptions))).map(value => ({
    value,
    label: CAO_OPTION_LABELS[value] || value,
    assignment_count: activeAssignments.filter(assignment => resolveAssignmentCaoKey(assignment, caoOptions) === value).length,
  }));
}

function readableFunctionLabel(value) {
  return FUNCTION_TYPE_LABELS[value] || functionLabel(value);
}

function buildCompanyFunctionOptions(assignments, referenceDate, caoKey, caoOptions = [], selectedValue = null) {
  if (!caoKey) return [];
  const activeAssignments = (assignments || []).filter(assignment => isDateWithinOptionRange(assignment, referenceDate));
  const scopedAssignments = activeAssignments.filter(assignment => resolveAssignmentCaoKey(assignment, caoOptions) === caoKey);
  const configuredFunctions = uniqueValues(scopedAssignments.flatMap(assignment => assignment.applies_to_activities || []))
    .filter(value => value !== "all");
  const values = configuredFunctions;
  const withSelected = selectedValue && !values.includes(selectedValue)
    ? [...values, selectedValue]
    : values;
  return withSelected.map(value => ({ value, label: readableFunctionLabel(value) }));
}

function filterCaoConfigurationOptions(options, form) {
  const selectedId = form.cao_configuration_id || null;
  return (options || []).filter(option => {
    if (selectedId && option.id === selectedId) return true;
    if (form.cao_key && option.cao_key && option.cao_key !== form.cao_key) return false;
    if (!isDateWithinOptionRange(option, form.contract_start_date)) return false;
    return option.selectable !== false;
  });
}

function getSalaryTables(option) {
  return option?.salary_tables || option?.salaryTables || option?.wage_tables || option?.wageTables || option?.scales || [];
}

function extractWageRows(option, targetYear) {
  const rows = [];
  getSalaryTables(option).forEach(table => {
    const tableYear = Number(table.year || table.valid_year || table.period_year || table.effective_year || "");
    if (targetYear && tableYear && tableYear !== Number(targetYear)) return;
    const scales = table.scales || table.salary_scales || table.rows || [];
    scales.forEach(scale => {
      const scaleNumber = scale.scale ?? scale.schaal ?? scale.number ?? scale.level;
      const periods = scale.periods || scale.steps || scale.periodieken || scale.rows || [];
      if (Array.isArray(periods) && periods.length > 0) {
        periods.forEach(period => {
          const periodNumber = period.period ?? period.periodic ?? period.step ?? period.trede ?? period.number;
          const hourlyRate = period.hourly_rate ?? period.hourlyRate ?? period.rate ?? period.amount ?? period.value;
          rows.push({
            year: tableYear || targetYear,
            scale: scaleNumber,
            period: periodNumber,
            hourlyRate,
            label: `Schaal ${scaleNumber ?? "-"} / trede ${periodNumber ?? "-"}`,
          });
        });
      } else if (scale.hourly_rate || scale.rate || scale.amount) {
        rows.push({
          year: tableYear || targetYear,
          scale: scaleNumber,
          period: scale.period ?? scale.trede ?? 0,
          hourlyRate: scale.hourly_rate ?? scale.rate ?? scale.amount,
          label: `Schaal ${scaleNumber ?? "-"} / trede ${scale.period ?? scale.trede ?? 0}`,
        });
      }
    });
  });
  return rows;
}

function templateMatchesWizard(template, form) {
  if (!template || template.visible_in_contract_wizard === false) return false;
  if (template.template_type && template.template_type !== "employment_contract") return false;
  if (form.cao_key && template.cao_key && template.cao_key !== form.cao_key) return false;
  const model = getContractModel(form.contract_model);
  const formScope = template.contract_form_scope || "any";
  if (formScope !== "any" && formScope !== form.contract_form && formScope !== form.underlying_contract_form) return false;
  const modelScope = template.employment_model_scope === "call_agreement"
    ? "zero_hours"
    : (template.employment_model_scope || "any");
  if (modelScope !== "any" && modelScope !== model?.employment_model && modelScope !== form.employment_contract_model) return false;
  const expectedLearningRoute = model?.employment_model === "internship"
    ? "article_14_internship"
    : (model?.employment_model === "bbl" ? "bbl" : null);
  const templateLearningRoute = template.learning_route_scope || template.metadata?.learning_route_scope || null;
  if (templateLearningRoute && expectedLearningRoute && templateLearningRoute !== expectedLearningRoute) return false;
  if (templateLearningRoute && !expectedLearningRoute) return false;
  const durationScope = template.duration_type_scope || "any";
  if (durationScope !== "any" && durationScope !== form.duration_type) return false;
  const durationOptions = Array.isArray(template.duration_options) ? template.duration_options : [];
  const selectedDurationOption = form.duration_type === "indefinite" ? "indefinite" : form.duration_option;
  if (durationOptions.length > 0 && selectedDurationOption && !durationOptions.includes(selectedDurationOption)) return false;
  const probationScope = template.probation_scope || "any";
  if (probationScope === "with_probation" && form.probation_agreed !== "true") return false;
  if (probationScope === "without_probation" && form.probation_agreed !== "false") return false;
  if (probationScope === "not_applicable" && form.probation_agreed !== "not_applicable") return false;
  return true;
}

function initialForm(personnel) {
  const minHoursPerWeek = numberOrNull(personnel.min_hours);
  const maxHoursPerWeek = numberOrNull(personnel.max_hours);
  const initialCallModel = minHoursPerWeek !== null || maxHoursPerWeek !== null ? "min_max" : "zero_hours";
  const inferredModel = inferContractModel({
    contract_form: personnel.contract_form || "unknown",
    underlying_contract_form: personnel.underlying_contract_form || null,
    employment_contract_model: personnel.contract_form === "oproep" ? initialCallModel : "unknown",
    min_hours_per_week: personnel.min_hours,
  });
  const model = getContractModel(inferredModel);
  return {
    source_type: "",
    company_id: personnel.primary_company_id || null,
    cao_key: personnel.cao || null,
    cao_configuration_id: personnel.cao_configuration_id || null,
    contract_model: inferredModel,
    contract_form: model?.contract_form || personnel.contract_form || "unknown",
    underlying_contract_form: model?.underlying_contract_form || personnel.underlying_contract_form || null,
    employment_contract_model: model?.employment_model || (personnel.contract_form === "oproep" ? initialCallModel : "unknown"),
    call_agreement_type: model?.employment_model === "min_max" ? "min_max" : (personnel.contract_form === "oproep" ? initialCallModel : "not_applicable"),
    probation_agreed: "unknown",
    probation_context: "unknown",
    duration_type: model?.duration_type || (personnel.contract_form === "onbepaalde_tijd" ? "indefinite" : "fixed"),
    duration_option: "",
    contract_start_date: personnel.contract_start_date || new Date().toISOString().slice(0, 10),
    contract_end_date: personnel.contract_end_date || "",
    work_location: "",
    work_area: "Nederland",
    employer_representative_name: "",
    employer_representative_function: "",
    signing_place: "",
    signing_date: "",
    contract_agreed_at: "",
    call_contract_exception_profile: "none",
    call_contract_exception_average_hours_per_week: "",
    call_contract_exception_evidence_reference: "",
    call_contract_exception_valid_until: "",
    employee_already_receives_aow: "false",
    employee_aow_date: "",
    cao_scale: personnel.cao_scale ?? "",
    cao_period: personnel.cao_period ?? "",
    custom_hourly_rate: personnel.custom_hourly_rate ?? "",
    wage_table_year: getYear(personnel.contract_start_date || new Date()),
    hourly_rate_snapshot: personnel.custom_hourly_rate ?? "",
    salary_payment_frequency: personnel.salary_payment_frequency || (personnel.cao === CAO_PARTICULIERE_BEVEILIGING_KEY ? "four_weeks" : ""),
    written_scale_period_notice_confirmed: boolToSelect(personnel.written_scale_period_notice_confirmed),
    periodic_increase_due_confirmed: boolToSelect(personnel.periodic_increase_due_confirmed),
    function_type: personnel.function_type || null,
    allowed_function_types_text: personnel.function_type ? personnel.function_type : "",
    cao_function_group: personnel.cao_function_group || null,
    allowed_cao_function_groups_text: personnel.cao_function_group ? personnel.cao_function_group : "",
    cao_function_level: personnel.cao_function_level || null,
    allowed_cao_function_levels_text: personnel.cao_function_level ? personnel.cao_function_level : "",
    allowed_task_types_text: "",
    security_role_status: personnel.security_role_status || "unknown",
    performs_security_work: boolToSelect(personnel.performs_security_work),
    security_work_percentage: personnel.security_work_percentage ?? "",
    works_airport_schiphol: boolToSelect(personnel.works_airport_schiphol),
    works_cash_value_logistics: boolToSelect(personnel.works_cash_value_logistics),
    works_event_or_hospitality_security: boolToSelect(personnel.works_event_or_hospitality_security),
    event_hospitality_cao_applies: boolToSelect(personnel.event_hospitality_cao_applies),
    contract_hours_per_week: personnel.parttime_hours ?? "",
    contract_hours_per_pay_period: "",
    fulltime_reference_hours_per_week: "",
    fulltime_reference_hours_per_pay_period: "",
    min_hours_per_week: minHoursPerWeek ?? "",
    max_hours_per_week: maxHoursPerWeek ?? "",
    min_hours_per_pay_period: minHoursPerWeek === null ? "" : String(minHoursPerWeek * 4),
    max_hours_per_pay_period: maxHoursPerWeek === null ? "" : String(maxHoursPerWeek * 4),
    availability_windows: [],
    availability_timezone: "Europe/Amsterdam",
    call_channel: "",
    internship_type: "unknown",
    internship_institution_name: "",
    internship_institution_address: "",
    internship_institution_representative_name: "",
    internship_institution_representative_function: "",
    internship_institution_email: "",
    internship_education_name: "",
    internship_bpv_reference: "",
    internship_learning_company_recognition_number: "",
    internship_route_reference: "",
    internship_assignment_description: "",
    internship_learning_objectives: "",
    internship_practice_trainer_name: "",
    internship_institution_supervisor_name: "",
    internship_hours_per_week: "",
    internship_working_times: "",
    internship_evaluation_details: "",
    internship_compensation_applies: "unknown",
    internship_compensation_amount: "",
    internship_compensation_period: "maand",
    internship_expense_arrangement: "",
    internship_insurance_description: "",
    internship_attachments: "",
    internship_legal_representative_name: "",
    internship_supervision_confirmed: "false",
    internship_relevant_practical_experience_confirmed: "false",
    internship_above_strength_confirmed: "false",
    internship_not_customer_billed_confirmed: "false",
    internship_rostered_confirmed: "false",
    internship_one_to_one_guidance_confirmed: "false",
    internship_uniform_label_confirmed: "false",
    internship_agreement_with_institution_confirmed: "false",
    internship_working_times_documented: "false",
    internship_evaluation_agreement_documented: "false",
    internship_compensation_documented: "false",
    bbl_institution_name: "",
    bbl_education_name: "",
    bbl_practice_agreement_reference: "",
    bbl_learning_company_recognition_number: "",
    bbl_practice_trainer_name: "",
    industry_seniority_pay_periods: personnel.industry_seniority_pay_periods ?? "",
    industry_start_date: personnel.industry_start_date || "",
    prior_similar_work_status: "not_applicable",
    prior_external_employer_name: "",
    prior_external_contract_count: "",
    prior_external_first_start_date: "",
    prior_external_last_end_date: "",
    successor_employer_confirmed: "unknown",
    template_id: null,
    template_version: null,
    template_name_snapshot: null,
    letterhead_id: null,
    letterhead_name_snapshot: null,
    signed_file_id: null,
    existing_contract_file: null,
    notes: "",
  };
}

function formFromContract(contract) {
  const hasMinMaxHours = contract.min_hours_per_pay_period || contract.max_hours_per_pay_period
    || contract.min_hours_per_week || contract.max_hours_per_week;
  const employmentModel = contract.employment_contract_model === "call_agreement"
    ? (hasMinMaxHours || contract.call_agreement_type === "min_max" ? "min_max" : "zero_hours")
    : (contract.employment_contract_model || "unknown");
  const minHoursPerPeriod = contract.min_hours_per_pay_period
    ?? (contract.min_hours_per_week !== null && contract.min_hours_per_week !== undefined ? Number(contract.min_hours_per_week) * 4 : "");
  const maxHoursPerPeriod = contract.max_hours_per_pay_period
    ?? (contract.max_hours_per_week !== null && contract.max_hours_per_week !== undefined ? Number(contract.max_hours_per_week) * 4 : "");
  const minHoursPerWeek = contract.min_hours_per_week
    ?? (minHoursPerPeriod !== "" ? Number(minHoursPerPeriod) / 4 : "");
  const maxHoursPerWeek = contract.max_hours_per_week
    ?? (maxHoursPerPeriod !== "" ? Number(maxHoursPerPeriod) / 4 : "");
  const inferredModel = inferContractModel({
    ...contract,
    employment_contract_model: employmentModel,
    call_agreement_type: contract.call_agreement_type
      || (employmentModel === "min_max" ? "min_max" : (employmentModel === "zero_hours" ? "zero_hours" : "not_applicable")),
  });
  const isStoredStatutoryBandwidth = contract.call_agreement_type === "statutory_bandwidth";
  return {
    source_type: contract.source_type || (contract.generated_file_id ? "generated" : "uploaded_existing"),
    company_id: contract.company_id || null,
    cao_key: contract.cao_key || null,
    cao_configuration_id: contract.cao_configuration_id || null,
    contract_model: inferredModel,
    contract_form: isStoredStatutoryBandwidth ? "oproep" : (contract.contract_form || "unknown"),
    underlying_contract_form: isStoredStatutoryBandwidth
      ? (contract.contract_form || (contract.duration_type === "indefinite" ? "onbepaalde_tijd" : "bepaalde_tijd"))
      : (contract.underlying_contract_form || null),
    employment_contract_model: employmentModel,
    probation_agreed: contract.probation_agreed === true ? "true" : contract.probation_agreed === false ? "false" : (contract.probation_agreed === "not_applicable" ? "not_applicable" : "unknown"),
    probation_context: contract.probation_context || (contract.probation_agreed === false ? "not_applicable" : "unknown"),
    duration_type: contract.duration_type || (contract.contract_form === "onbepaalde_tijd" ? "indefinite" : "fixed"),
    duration_option: contract.duration_option || "",
    contract_start_date: contract.contract_start_date || "",
    contract_end_date: contract.contract_end_date || "",
    work_location: contract.work_location || "",
    work_area: contract.work_area || "",
    employer_representative_name: contract.employer_representative_name || "",
    employer_representative_function: contract.employer_representative_function || "",
    signing_place: contract.signing_place || "",
    signing_date: contract.signing_date || "",
    contract_agreed_at: contract.contract_agreed_at || contract.signing_date || "",
    call_contract_exception_profile: contract.call_contract_exception_profile || "none",
    call_contract_exception_average_hours_per_week: contract.call_contract_exception_average_hours_per_week ?? "",
    call_contract_exception_evidence_reference: contract.call_contract_exception_evidence_reference || "",
    call_contract_exception_valid_until: contract.call_contract_exception_valid_until || "",
    employee_already_receives_aow: boolToSelect(contract.employee_already_receives_aow),
    employee_aow_date: contract.employee_aow_date || "",
    cao_scale: contract.cao_scale ?? "",
    cao_period: contract.cao_period ?? "",
    custom_hourly_rate: contract.custom_hourly_rate ?? "",
    wage_table_year: contract.wage_table_year || getYear(contract.contract_start_date || new Date()),
    hourly_rate_snapshot: contract.hourly_rate_snapshot ?? contract.custom_hourly_rate ?? "",
    salary_payment_frequency: contract.salary_payment_frequency || "",
    written_scale_period_notice_confirmed: boolToSelect(contract.written_scale_period_notice_confirmed),
    periodic_increase_due_confirmed: boolToSelect(contract.periodic_increase_due_confirmed),
    function_type: contract.function_type || null,
    allowed_function_types_text: toArrayText(contract.allowed_function_types),
    cao_function_group: contract.cao_function_group || null,
    allowed_cao_function_groups_text: toArrayText(contract.allowed_cao_function_groups),
    cao_function_level: contract.cao_function_level || null,
    allowed_cao_function_levels_text: toArrayText(contract.allowed_cao_function_levels),
    allowed_task_types_text: toArrayText(contract.allowed_task_types),
    security_role_status: contract.security_role_status || "unknown",
    performs_security_work: boolToSelect(contract.performs_security_work),
    security_work_percentage: contract.security_work_percentage ?? "",
    works_airport_schiphol: boolToSelect(contract.works_airport_schiphol),
    works_cash_value_logistics: boolToSelect(contract.works_cash_value_logistics),
    works_event_or_hospitality_security: boolToSelect(contract.works_event_or_hospitality_security),
    event_hospitality_cao_applies: boolToSelect(contract.event_hospitality_cao_applies),
    contract_hours_per_week: contract.contract_hours_per_week ?? "",
    contract_hours_per_pay_period: contract.contract_hours_per_pay_period ?? "",
    fulltime_reference_hours_per_week: contract.fulltime_reference_hours_per_week ?? "",
    fulltime_reference_hours_per_pay_period: contract.fulltime_reference_hours_per_pay_period ?? "",
    min_hours_per_week: minHoursPerWeek,
    max_hours_per_week: maxHoursPerWeek,
    min_hours_per_pay_period: minHoursPerPeriod,
    max_hours_per_pay_period: maxHoursPerPeriod,
    availability_windows: normalizeAvailabilityWindows(contract.availability_windows),
    availability_timezone: contract.availability_timezone || "Europe/Amsterdam",
    call_channel: contract.call_channel || "",
    internship_type: contract.internship_type || "unknown",
    internship_institution_name: contract.internship_institution_name || "",
    internship_institution_address: contract.internship_institution_address || "",
    internship_institution_representative_name: contract.internship_institution_representative_name || "",
    internship_institution_representative_function: contract.internship_institution_representative_function || "",
    internship_institution_email: contract.internship_institution_email || "",
    internship_education_name: contract.internship_education_name || "",
    internship_bpv_reference: contract.internship_bpv_reference || "",
    internship_learning_company_recognition_number: contract.internship_learning_company_recognition_number || "",
    internship_route_reference: contract.internship_route_reference || "",
    internship_assignment_description: contract.internship_assignment_description || "",
    internship_learning_objectives: contract.internship_learning_objectives || "",
    internship_practice_trainer_name: contract.internship_practice_trainer_name || contract.internship_mentor_name || "",
    internship_institution_supervisor_name: contract.internship_institution_supervisor_name || "",
    internship_hours_per_week: contract.internship_hours_per_week ?? "",
    internship_working_times: contract.internship_working_times || "",
    internship_evaluation_details: contract.internship_evaluation_details || "",
    internship_compensation_applies: boolToSelect(contract.internship_compensation_applies),
    internship_compensation_amount: contract.internship_compensation_amount ?? "",
    internship_compensation_period: contract.internship_compensation_period || "maand",
    internship_expense_arrangement: contract.internship_expense_arrangement || "",
    internship_insurance_description: contract.internship_insurance_description || "",
    internship_attachments: contract.internship_attachments || "",
    internship_legal_representative_name: contract.internship_legal_representative_name || "",
    internship_supervision_confirmed: boolToSelect(contract.internship_supervision_confirmed),
    internship_relevant_practical_experience_confirmed: boolToSelect(contract.internship_relevant_practical_experience_confirmed),
    internship_above_strength_confirmed: boolToSelect(contract.internship_above_strength_confirmed),
    internship_not_customer_billed_confirmed: boolToSelect(contract.internship_not_customer_billed_confirmed),
    internship_rostered_confirmed: boolToSelect(contract.internship_rostered_confirmed),
    internship_one_to_one_guidance_confirmed: boolToSelect(contract.internship_one_to_one_guidance_confirmed),
    internship_uniform_label_confirmed: boolToSelect(contract.internship_uniform_label_confirmed),
    internship_agreement_with_institution_confirmed: boolToSelect(contract.internship_agreement_with_institution_confirmed),
    internship_working_times_documented: boolToSelect(contract.internship_working_times_documented),
    internship_evaluation_agreement_documented: boolToSelect(contract.internship_evaluation_agreement_documented),
    internship_compensation_documented: boolToSelect(contract.internship_compensation_documented),
    bbl_institution_name: contract.bbl_institution_name || "",
    bbl_education_name: contract.bbl_education_name || "",
    bbl_practice_agreement_reference: contract.bbl_practice_agreement_reference || "",
    bbl_learning_company_recognition_number: contract.bbl_learning_company_recognition_number || "",
    bbl_practice_trainer_name: contract.bbl_practice_trainer_name || "",
    industry_seniority_pay_periods: contract.industry_seniority_pay_periods ?? "",
    industry_start_date: contract.industry_start_date || "",
    prior_similar_work_status: contract.prior_similar_work_status || (contract.duration_type === "fixed" ? "unknown" : "not_applicable"),
    prior_external_employer_name: contract.chain_external_history?.employer_name || "",
    prior_external_contract_count: contract.chain_external_history?.contract_count ?? "",
    prior_external_first_start_date: contract.chain_external_history?.first_start_date || "",
    prior_external_last_end_date: contract.chain_external_history?.last_end_date || "",
    successor_employer_confirmed: boolToSelect(contract.chain_external_history?.successor_employer_confirmed),
    template_id: contract.template_id || null,
    template_version: contract.template_version || null,
    template_name_snapshot: contract.template_name_snapshot || null,
    letterhead_id: contract.letterhead_id || null,
    letterhead_name_snapshot: contract.letterhead_name_snapshot || null,
    signed_file_id: contract.signed_file_id || null,
    existing_contract_file: null,
    notes: contract.notes || "",
  };
}

function getMissingContractFields(form) {
  const missing = [];
  const isArticle14Internship = form.employment_contract_model === "internship";
  if (!form.source_type) missing.push("documentbron");
  if (!form.company_id) missing.push("bedrijf");
  if (!form.contract_model) missing.push("contractvorm");
  if (!isArticle14Internship && (!form.probation_agreed || form.probation_agreed === "unknown")) missing.push("proeftijdkeuze");
  if (form.source_type === "generated" && !form.template_id) missing.push("contracttemplate");
  if (form.source_type === "uploaded_existing" && !form.existing_contract_file && !form.signed_file_id) missing.push("contractdocument");
  if (!form.cao_key && form.contract_form !== "zzp") missing.push("CAO");
  if (!form.contract_start_date) missing.push("startdatum");
  if (form.duration_type === "fixed" && !form.contract_end_date) missing.push("einddatum");
  if (!form.function_type && fromArrayText(form.allowed_function_types_text).length === 0) missing.push("minimaal één functie");
  if (form.contract_form !== "zzp" && form.contract_form !== "stage" && !form.cao_scale && !form.cao_period && !form.custom_hourly_rate) {
    missing.push("loonschaal/trede");
  }
  if (form.contract_form !== "zzp" && form.contract_form !== "stage" && form.cao_key !== CAO_PARTICULIERE_BEVEILIGING_KEY && !form.salary_payment_frequency) {
    missing.push("betaalperiode loon");
  }
  const pbParttimeModel = form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY
    && ["parttime_fixed", "parttime_growth"].includes(form.employment_contract_model);
  if (pbParttimeModel && !form.contract_hours_per_pay_period) {
    missing.push("contracturen per loonperiode");
  } else if (["fulltime", "parttime_fixed", "parttime_growth"].includes(form.employment_contract_model) && !form.contract_hours_per_week && !form.contract_hours_per_pay_period) {
    missing.push("arbeidsduur");
  }
  if (pbParttimeModel && (form.performs_security_work === "false" || form.cao_function_group === "non_security_staff")
    && !form.fulltime_reference_hours_per_week && !form.fulltime_reference_hours_per_pay_period) {
    missing.push("fulltime referentienorm");
  }
  if (form.employment_contract_model === "min_max" && (!form.min_hours_per_pay_period || !form.max_hours_per_pay_period)) {
    missing.push("min-max uren");
  }
  if (form.employment_contract_model === "min_max") {
    const band = getMinMaxBand(form);
    if (band.minimum !== null && band.minimum <= 0) missing.push("minimumuren groter dan nul");
    if (band.minimum !== null && band.maximum !== null && band.maximum < band.minimum) missing.push("maximumuren minimaal gelijk aan minimumuren");
  }
  if (["min_max", "zero_hours", "call_agreement"].includes(form.employment_contract_model)
    && normalizeAvailabilityWindows(form.availability_windows).length === 0) {
    missing.push("beschikbaarheidsvensters");
  }
  if (["min_max", "zero_hours", "call_agreement"].includes(form.employment_contract_model) && !form.call_channel) missing.push("oproepkanaal");
  const futureLegacyCallModel = legalReferenceDate(form) >= FLEX_REFORM_EFFECTIVE_DATE
    && ["min_max", "zero_hours", "call_agreement"].includes(form.employment_contract_model);
  if (futureLegacyCallModel && !isStatutoryBandwidthModel(form)) {
    if (!form.call_contract_exception_profile || form.call_contract_exception_profile === "none") missing.push("wettelijke oproepuitzondering");
    const averageHours = numberOrNull(form.call_contract_exception_average_hours_per_week);
    if (averageHours === null || averageHours < 0 || averageHours > 16) missing.push("gemiddeld maximaal 16 uur per week");
    if (["pupil", "student"].includes(form.call_contract_exception_profile)) {
      if (!form.call_contract_exception_evidence_reference) missing.push("inschrijvingsbewijs");
      if (!form.call_contract_exception_valid_until) missing.push("geldigheid inschrijvingsbewijs");
    }
    if (form.call_contract_exception_profile === "aow") {
      if (form.employee_already_receives_aow !== "true") missing.push("bevestiging AOW-status");
      if (!form.employee_aow_date) missing.push("AOW-datum");
    }
  }
  if (form.employment_contract_model === "internship") {
    if (form.source_type === "generated" && !["pok_end_date", "free"].includes(form.duration_option)) missing.push("bron van de stage-einddatum");
    if (form.internship_type !== "bol" && form.duration_option === "pok_end_date") missing.push("vrije einddatum voor deze re-integratieroute");
    if (!["bol", "uwv_trial_placement", "reintegration_measure", "second_track_reintegration"].includes(form.internship_type)) missing.push("geldige stageroute");
    if (!form.internship_institution_name) missing.push("onderwijs- of re-integratie-instelling");
    if (!form.internship_institution_address) missing.push("adres instelling");
    if (!form.internship_institution_representative_name) missing.push("vertegenwoordiger instelling");
    if (!form.internship_institution_representative_function) missing.push("functie vertegenwoordiger instelling");
    if (!form.internship_institution_email) missing.push("e-mailadres instelling");
    if (!form.internship_education_name) missing.push("opleiding of re-integratietraject");
    if (form.internship_type === "bol" && !form.internship_bpv_reference) missing.push("POK/BPV-kenmerk");
    if (form.internship_type === "bol" && !form.internship_learning_company_recognition_number) missing.push("SBB-erkenning");
    if (["uwv_trial_placement", "reintegration_measure", "second_track_reintegration"].includes(form.internship_type) && !form.internship_route_reference) missing.push("routebesluit of toestemming");
    if (!form.internship_assignment_description) missing.push("stageopdracht");
    if (!form.internship_learning_objectives) missing.push("leerdoelen");
    if (!form.internship_practice_trainer_name) missing.push("praktijkopleider");
    if (!form.internship_institution_supervisor_name) missing.push("begeleider vanuit instelling");
    if (!numberOrNull(form.internship_hours_per_week)) missing.push("stage-uren per week");
    if (!form.internship_working_times) missing.push("stagewerktijden");
    if (!form.internship_evaluation_details) missing.push("evaluatieafspraken");
    if (!["true", "false"].includes(form.internship_compensation_applies)) missing.push("keuze stagevergoeding");
    if (form.internship_compensation_applies === "true" && !numberOrNull(form.internship_compensation_amount)) missing.push("bedrag stagevergoeding");
    if (!form.internship_expense_arrangement) missing.push("onkostenregeling");
    if (!form.internship_insurance_description) missing.push("verzekeringsafspraken");
    if (!form.internship_attachments) missing.push("stagebijlagen");
    INTERNSHIP_CONFIRMATION_FIELDS.forEach(([field, label]) => {
      if (form[field] !== "true") missing.push(label.toLowerCase());
    });
  }
  if (form.employment_contract_model === "bbl") {
    if (form.source_type === "generated" && form.duration_type !== "fixed") {
      missing.push("BBL-contract voor bepaalde tijd");
    }
    if (form.source_type === "generated" && !["pok_end_date", "free"].includes(form.duration_option)) missing.push("bron van de BBL-einddatum");
    if (!form.contract_hours_per_week && !form.contract_hours_per_pay_period) missing.push("arbeidsduur BBL");
    if (!form.bbl_institution_name) missing.push("onderwijsinstelling BBL");
    if (!form.bbl_education_name) missing.push("BBL-opleiding");
    if (!form.bbl_practice_agreement_reference) missing.push("praktijkovereenkomst BBL");
    if (!form.bbl_learning_company_recognition_number) missing.push("SBB-erkenning");
    if (!form.bbl_practice_trainer_name) missing.push("praktijkopleider BBL");
  }
  return missing;
}

function normalizedEmploymentModel(form) {
  if (form.employment_contract_model === "call_agreement") return "zero_hours";
  return form.employment_contract_model || null;
}

function parttimeModel(form) {
  if (form.employment_contract_model === "parttime_fixed") return "fixed";
  if (form.employment_contract_model === "parttime_growth") return "growth";
  if (form.employment_contract_model === "unknown") return "unknown";
  return "not_applicable";
}

function isActiveContract(contract) {
  if (["active", "scheduled", "signed", "expired"].includes(contract.document_status)) return true;
  return contract.document_status === "archived"
    && !!(contract.signed_at || contract.signed_file_id || contract.signed_file_url);
}

function companyLegalKey(companyId, companies) {
  const company = (companies || []).find(item => item.id === companyId);
  const kvk = String(company?.kvk_number || "").replace(/\D/g, "");
  return kvk ? `kvk:${kvk}` : `company:${companyId || "unknown"}`;
}

function validateConflicts(form, contracts, editingId, companies) {
  const issues = [];
  const warnings = [];
  if (!form.company_id || !form.contract_start_date) return { issues, warnings };

  const nextFunctions = uniqueValues([form.function_type, ...fromArrayText(form.allowed_function_types_text)]);
  const activeCandidates = (contracts || []).filter(contract => contract.id !== editingId && isActiveContract(contract));
  activeCandidates.forEach(contract => {
    if (!rangesOverlap(form.contract_start_date, form.contract_end_date, contract.contract_start_date, effectiveEndForContract(contract))) return;
    const otherFunctions = uniqueValues([contract.function_type, ...(contract.allowed_function_types || [])]);
    const duplicateFunctions = nextFunctions.filter(value => otherFunctions.includes(value));
    if (companyLegalKey(contract.company_id, companies) === companyLegalKey(form.company_id, companies)) {
      issues.push(`Er bestaat in deze periode al een contract bij dezelfde juridische werkgever. Voeg meerdere functies samen in één contract in plaats van overlappende contracten te maken.`);
      return;
    }
    if (duplicateFunctions.length > 0) {
      issues.push(`De functie ${duplicateFunctions.map(readableFunctionLabel).join(", ")} is in deze periode al gekoppeld aan een contract bij een ander bedrijf. Kies per functie één werkgever zodat planning en uitbetaling eenduidig blijven.`);
    } else {
      warnings.push("De medewerker heeft in dezelfde periode ook een contract bij een ander bedrijf. De applicatie controleert de gezamenlijke arbeidsduur en contractroutering.");
    }
  });

  return { issues, warnings };
}

function buildContractPayload(personnel, form, currentUser, auditActors, previous = {}) {
  const missing = getMissingContractFields(form);
  const contextReady = missing.length === 0;
  const generated = form.source_type === "generated";
  const documentStatus = "concept";
  const allowedFunctionTypes = fromArrayText(form.allowed_function_types_text);
  const allowedGroups = fromArrayText(form.allowed_cao_function_groups_text);
  const allowedLevels = fromArrayText(form.allowed_cao_function_levels_text);
  const employmentModel = normalizedEmploymentModel(form);
  const isCallAgreement = ["zero_hours", "min_max"].includes(employmentModel);
  const hasFixedHours = ["fulltime", "parttime_fixed", "parttime_growth", "bbl"].includes(employmentModel);
  const isMinMax = employmentModel === "min_max";
  const isStatutoryBandwidth = isStatutoryBandwidthModel({ ...form, employment_contract_model: employmentModel });
  const persistedContractForm = isStatutoryBandwidth
    ? (form.underlying_contract_form || (form.duration_type === "indefinite" ? "onbepaalde_tijd" : "bepaalde_tijd"))
    : (form.contract_form || "unknown");
  const fixedHoursOfferDueAt = isCallAgreement ? addMonths(form.contract_start_date, 12) : null;
  const fixedHoursOfferDeadlineAt = isCallAgreement ? addMonths(form.contract_start_date, 13) : null;
  const derivedPbFunctionLevel = form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY
    ? (form.cao_function_level || pbFunctionLevelForSalaryScale(form.cao_scale))
    : (form.cao_function_level || null);
  const derivedPrimaryFunctionGroup = form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY
    ? (suggestPbCaoFunctionGroup(form.function_type) || form.cao_function_group || null)
    : (form.cao_function_group || null);

  return {
    personnel_id: personnel.id,
    company_id: form.company_id || null,
    source_type: form.source_type || "generated",
    template_id: generated ? form.template_id || null : null,
    template_version: generated ? numberOrNull(form.template_version) : null,
    letterhead_id: generated ? form.letterhead_id || null : null,
    document_status: documentStatus,
    cao_key: form.cao_key || null,
    cao_configuration_id: null,
    contract_model: form.contract_model || null,
    legal_document_type: employmentModel === "internship" ? "internship_agreement" : "employment_agreement",
    learning_route: employmentModel === "bbl" ? "bbl" : (employmentModel === "internship" ? "article_14_internship" : null),
    contract_form: persistedContractForm,
    underlying_contract_form: isStatutoryBandwidth ? null : (form.contract_form === "oproep" ? (form.underlying_contract_form || "unknown") : null),
    employment_contract_model: employmentModel,
    parttime_contract_model: parttimeModel(form),
    probation_agreed: form.probation_agreed === "not_applicable" ? null : boolOrNull(form.probation_agreed),
    probation_context: form.probation_agreed === "true" ? (form.probation_context || "first_contract") : "not_applicable",
    duration_type: form.duration_type || null,
    duration_option: form.duration_option || null,
    duration_label: durationLabel(form.duration_option),
    contract_start_date: form.contract_start_date || null,
    contract_end_date: form.contract_end_date || null,
    contract_agreed_at: form.contract_agreed_at || null,
    call_contract_exception_profile: isCallAgreement ? (form.call_contract_exception_profile || "none") : "none",
    call_contract_exception_average_hours_per_week: isCallAgreement
      ? numberOrNull(form.call_contract_exception_average_hours_per_week)
      : null,
    call_contract_exception_evidence_reference: isCallAgreement
      ? (form.call_contract_exception_evidence_reference || null)
      : null,
    call_contract_exception_valid_until: isCallAgreement
      ? (form.call_contract_exception_valid_until || null)
      : null,
    employee_already_receives_aow: form.employee_already_receives_aow === "true",
    employee_aow_date: form.employee_aow_date || null,
    work_location: form.work_location || null,
    work_area: form.work_area || null,
    employer_representative_name: form.employer_representative_name || null,
    employer_representative_function: form.employer_representative_function || null,
    signing_place: form.signing_place || null,
    signing_date: form.signing_date || null,
    cao_scale: numberOrNull(form.cao_scale),
    cao_period: numberOrNull(form.cao_period),
    custom_hourly_rate: numberOrNull(form.custom_hourly_rate),
    wage_table_year: numberOrNull(form.wage_table_year),
    hourly_rate_snapshot: numberOrNull(form.hourly_rate_snapshot || form.custom_hourly_rate),
    salary_payment_frequency: form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY ? "four_weeks" : (form.salary_payment_frequency || null),
    template_name_snapshot: generated ? (form.template_name_snapshot || null) : null,
    letterhead_name_snapshot: generated ? (form.letterhead_name_snapshot || null) : null,
    written_scale_period_notice_confirmed: generated && numberOrNull(form.cao_scale) !== null
      ? true
      : boolOrNull(form.written_scale_period_notice_confirmed),
    periodic_increase_due_confirmed: boolOrNull(form.periodic_increase_due_confirmed),
    function_type: form.function_type || null,
    allowed_function_types: allowedFunctionTypes,
    function_assignments: allowedFunctionTypes.map(functionKey => ({
      function_key: functionKey,
      function_label: readableFunctionLabel(functionKey),
      is_primary: functionKey === form.function_type,
      cao_function_group: form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY
        ? (suggestPbCaoFunctionGroup(functionKey) || derivedPrimaryFunctionGroup)
        : derivedPrimaryFunctionGroup,
      cao_function_level: derivedPbFunctionLevel,
      cao_scale: numberOrNull(form.cao_scale),
    })),
    function_assignment_policy_version: "employee-contract-routing-v1",
    cao_function_group: derivedPrimaryFunctionGroup,
    allowed_cao_function_groups: allowedGroups,
    cao_function_level: derivedPbFunctionLevel,
    allowed_cao_function_levels: allowedLevels,
    allowed_task_types: fromArrayText(form.allowed_task_types_text),
    security_role_status: form.security_role_status || "unknown",
    allowed_security_role_statuses: hasMeaningfulSecurityRole(form.security_role_status) ? [form.security_role_status] : [],
    performs_security_work: boolOrNull(form.performs_security_work),
    security_work_percentage: numberOrNull(form.security_work_percentage),
    works_airport_schiphol: boolOrNull(form.works_airport_schiphol),
    works_cash_value_logistics: boolOrNull(form.works_cash_value_logistics),
    works_event_or_hospitality_security: boolOrNull(form.works_event_or_hospitality_security),
    event_hospitality_cao_applies: boolOrNull(form.event_hospitality_cao_applies),
    contract_hours_per_week: hasFixedHours ? numberOrNull(form.contract_hours_per_week) : null,
    contract_hours_per_pay_period: hasFixedHours ? numberOrNull(form.contract_hours_per_pay_period) : null,
    fulltime_reference_hours_per_week: ["parttime_fixed", "parttime_growth"].includes(employmentModel) ? numberOrNull(form.fulltime_reference_hours_per_week) : null,
    fulltime_reference_hours_per_pay_period: ["parttime_fixed", "parttime_growth"].includes(employmentModel) ? numberOrNull(form.fulltime_reference_hours_per_pay_period) : null,
    min_hours_per_week: isMinMax ? numberOrNull(form.min_hours_per_week) : null,
    max_hours_per_week: isMinMax ? numberOrNull(form.max_hours_per_week) : null,
    min_hours_per_pay_period: isMinMax ? numberOrNull(form.min_hours_per_pay_period) : null,
    max_hours_per_pay_period: isMinMax ? numberOrNull(form.max_hours_per_pay_period) : null,
    availability_windows: isCallAgreement
      ? normalizeAvailabilityWindows(form.availability_windows)
      : [],
    availability_timezone: isCallAgreement
      ? (form.availability_timezone || "Europe/Amsterdam")
      : null,
    call_channel: isCallAgreement ? (form.call_channel || null) : null,
    is_call_agreement: isCallAgreement && !isStatutoryBandwidth,
    call_agreement_type: isStatutoryBandwidth ? "statutory_bandwidth" : (isMinMax ? "min_max" : (employmentModel === "zero_hours" ? "zero_hours" : "not_applicable")),
    call_notice_days: isCallAgreement ? 4 : null,
    employee_notice_days: isCallAgreement ? 4 : null,
    no_work_no_pay_first_6_months: employmentModel === "zero_hours"
      ? false
      : previous.no_work_no_pay_first_6_months === true,
    payslip_call_agreement_indicator_required: isCallAgreement && !isStatutoryBandwidth,
    fixed_hours_offer_due_at: fixedHoursOfferDueAt,
    fixed_hours_offer_deadline_at: fixedHoursOfferDeadlineAt,
    fixed_hours_offer_status: isCallAgreement ? (previous.fixed_hours_offer_status || "not_due") : null,
    internship_type: employmentModel === "internship" ? (form.internship_type || "unknown") : "not_applicable",
    internship_has_employment_contract: employmentModel === "internship" ? false : null,
    internship_institution_name: employmentModel === "internship" ? (form.internship_institution_name || null) : null,
    internship_institution_address: employmentModel === "internship" ? (form.internship_institution_address || null) : null,
    internship_institution_representative_name: employmentModel === "internship" ? (form.internship_institution_representative_name || null) : null,
    internship_institution_representative_function: employmentModel === "internship" ? (form.internship_institution_representative_function || null) : null,
    internship_institution_email: employmentModel === "internship" ? (form.internship_institution_email || null) : null,
    internship_education_name: employmentModel === "internship" ? (form.internship_education_name || null) : null,
    internship_bpv_reference: employmentModel === "internship" ? (form.internship_bpv_reference || null) : null,
    internship_learning_company_recognition_number: employmentModel === "internship" ? (form.internship_learning_company_recognition_number || null) : null,
    internship_route_reference: employmentModel === "internship" ? (form.internship_route_reference || null) : null,
    internship_assignment_description: employmentModel === "internship" ? (form.internship_assignment_description || null) : null,
    internship_learning_objectives: employmentModel === "internship" ? (form.internship_learning_objectives || null) : null,
    internship_practice_trainer_name: employmentModel === "internship" ? (form.internship_practice_trainer_name || null) : null,
    internship_mentor_name: employmentModel === "internship" ? (form.internship_practice_trainer_name || null) : null,
    internship_institution_supervisor_name: employmentModel === "internship" ? (form.internship_institution_supervisor_name || null) : null,
    internship_hours_per_week: employmentModel === "internship" ? numberOrNull(form.internship_hours_per_week) : null,
    internship_working_times: employmentModel === "internship" ? (form.internship_working_times || null) : null,
    internship_evaluation_details: employmentModel === "internship" ? (form.internship_evaluation_details || null) : null,
    internship_compensation_applies: employmentModel === "internship" ? boolOrNull(form.internship_compensation_applies) : null,
    internship_compensation_amount: employmentModel === "internship" ? numberOrNull(form.internship_compensation_amount) : null,
    internship_compensation_period: employmentModel === "internship" ? (form.internship_compensation_period || null) : null,
    internship_expense_arrangement: employmentModel === "internship" ? (form.internship_expense_arrangement || null) : null,
    internship_insurance_description: employmentModel === "internship" ? (form.internship_insurance_description || null) : null,
    internship_attachments: employmentModel === "internship" ? (form.internship_attachments || null) : null,
    internship_legal_representative_name: employmentModel === "internship" ? (form.internship_legal_representative_name || null) : null,
    internship_supervision_confirmed: employmentModel === "internship" ? boolOrNull(form.internship_supervision_confirmed) : null,
    internship_relevant_practical_experience_confirmed: employmentModel === "internship" ? boolOrNull(form.internship_relevant_practical_experience_confirmed) : null,
    internship_above_strength_confirmed: employmentModel === "internship" ? boolOrNull(form.internship_above_strength_confirmed) : null,
    internship_not_customer_billed_confirmed: employmentModel === "internship" ? boolOrNull(form.internship_not_customer_billed_confirmed) : null,
    internship_rostered_confirmed: employmentModel === "internship" ? boolOrNull(form.internship_rostered_confirmed) : null,
    internship_one_to_one_guidance_confirmed: employmentModel === "internship" ? boolOrNull(form.internship_one_to_one_guidance_confirmed) : null,
    internship_uniform_label_confirmed: employmentModel === "internship" ? boolOrNull(form.internship_uniform_label_confirmed) : null,
    internship_agreement_with_institution_confirmed: employmentModel === "internship" ? boolOrNull(form.internship_agreement_with_institution_confirmed) : null,
    internship_working_times_documented: employmentModel === "internship" ? boolOrNull(form.internship_working_times_documented) : null,
    internship_evaluation_agreement_documented: employmentModel === "internship" ? boolOrNull(form.internship_evaluation_agreement_documented) : null,
    internship_compensation_documented: employmentModel === "internship" ? boolOrNull(form.internship_compensation_documented) : null,
    bbl_institution_name: employmentModel === "bbl" ? (form.bbl_institution_name || null) : null,
    bbl_education_name: employmentModel === "bbl" ? (form.bbl_education_name || null) : null,
    bbl_practice_agreement_reference: employmentModel === "bbl" ? (form.bbl_practice_agreement_reference || null) : null,
    bbl_learning_company_recognition_number: employmentModel === "bbl" ? (form.bbl_learning_company_recognition_number || null) : null,
    bbl_practice_trainer_name: employmentModel === "bbl" ? (form.bbl_practice_trainer_name || null) : null,
    industry_seniority_pay_periods: numberOrNull(form.industry_seniority_pay_periods),
    industry_start_date: form.industry_start_date || null,
    prior_similar_work_status: "not_applicable",
    chain_external_history: null,
    contract_context_status: contextReady ? "context_ready" : "draft_missing_context",
    contract_context_missing_fields: missing,
    contract_context_checked_at: new Date().toISOString(),
    cao_contract_rule_status: contextReady ? "unknown" : "blocked",
    planning_allowed: false,
    contract_final_allowed: false,
    payroll_final_allowed: false,
    is_current: false,
    notes: form.notes || null,
    metadata: buildAuditMetadata(currentUser, previous?.id ? "gewijzigd" : "toegevoegd", previous?.metadata || {}, auditActors),
  };
}

function normalizeContractClauseSections(source = {}) {
  const rawSections = Array.isArray(source.sections) ? source.sections : [];
  const sections = rawSections
    .map(section => String(section.text || "").trim())
    .filter(Boolean);
  if (sections.length > 0) return sections;

  const fallbackBody = String(source.body || "").trim();
  const fallbackSource = fallbackBody.replace(/^Artikel\s+\d+\s*[-–—].*?\n+/i, "").trim();
  const fallbackSections = fallbackSource
    .split(/\n+\s*(?=(?:x|\d+)\.\d+\s+)/i)
    .map(text => text.replace(/^(?:x|\d+)\.\d+\s*/i, "").trim())
    .filter(Boolean);
  if (fallbackSections.length > 0 && /^(?:x|\d+)\.\d+\s+/i.test(fallbackSource)) return fallbackSections;
  return fallbackSource ? [fallbackSource] : [];
}

function renumberArticleChunk(chunk = "", state) {
  return String(chunk || "").split(/(\r?\n)/).map(part => {
    if (/^\r?\n$/.test(part)) return part;
    let line = part;
    const headingMatch = line.match(/^(\s*)Artikel\s+(\d+)\b/i);
    if (headingMatch) {
      state.articleNumber += 1;
      state.currentOriginalArticle = headingMatch[2];
      state.currentRenderedArticle = state.articleNumber;
      line = line.replace(/^(\s*)Artikel\s+\d+\b/i, `$1Artikel ${state.currentRenderedArticle}`);
    }
    if (state.currentOriginalArticle && state.currentRenderedArticle) {
      line = line.replace(
        new RegExp(`^(\\s*)${state.currentOriginalArticle}\\.(\\d+)\\b`),
        `$1${state.currentRenderedArticle}.$2`,
      );
    }
    return line;
  }).join("");
}

function renderContractClauseArticle(clause, articleNumber) {
  if (!clause) return "";
  const sections = normalizeContractClauseSections(clause);
  const heading = `Artikel ${articleNumber} - ${clause.title || "Clausule"}`;
  if (sections.length === 0) return heading;
  return [heading, ...sections.map((text, index) => `${articleNumber}.${index + 1} ${text}`)].join("\n\n");
}

function expandClauseMarkers(templateBody, clauses = []) {
  const clauseMap = new Map((clauses || []).map(clause => [clause.id, clause]));
  const source = String(templateBody || "");
  const markerPattern = /\{\{\s*clausule:([^}]+)\s*\}\}/g;
  const state = { articleNumber: 0, currentOriginalArticle: null, currentRenderedArticle: null };
  let result = "";
  let cursor = 0;
  let match;

  while ((match = markerPattern.exec(source)) !== null) {
    result += renumberArticleChunk(source.slice(cursor, match.index), state);
    const id = String(match[1] || "").trim();
    const clause = clauseMap.get(id);
    if (clause) {
      state.articleNumber += 1;
      state.currentOriginalArticle = null;
      state.currentRenderedArticle = null;
      result += renderContractClauseArticle(clause, state.articleNumber);
    }
    cursor = markerPattern.lastIndex;
  }

  return result + renumberArticleChunk(source.slice(cursor), state);
}

function contractRenderValues(personnel, form, company) {
  return buildContractTemplateValues({ personnel, form, company });
}

function renderContractBody(personnel, form, company, template, clauses = []) {
  const fallbackBody = form.employment_contract_model === "internship"
    ? [
        "Stageovereenkomst (BOL / re-integratie)",
        "",
        "Deze stageovereenkomst wordt gesloten tussen het stagebedrijf, de stagiair en de onderwijs- of re-integratie-instelling.",
        "De stage begint op {{contract.startdatum}} en is gericht op leren onder begeleiding.",
        "Gebruik voor definitieve generatie het beheerde artikel-14-stagesjabloon.",
      ].join("\n")
    : [
        "Arbeidsovereenkomst",
        "",
        "Ondergetekenden:",
        "{{bedrijf.naam}}, hierna te noemen werkgever;",
        "en {{medewerker.naam}}, hierna te noemen werknemer;",
        "",
        "komen overeen dat werknemer per {{contract.startdatum}} werkzaam is als {{contract.functie}}.",
        "Op deze overeenkomst is {{contract.cao}} van toepassing.",
        "De overeengekomen contractvorm is {{contract.contractvorm}}.",
      ].join("\n");
  return renderContractTemplateBody(expandClauseMarkers(template?.body || fallbackBody, clauses), { personnel, form, company });
}

function makePdfFile({ personnel, form, company, template, letterhead, clauses = [] }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageNumberSettings = normalizePageNumberSettings(letterhead || {});
  const pageNumberAlignment = pageNumberHorizontalAlignment(pageNumberSettings);
  const millimeterToPoint = 72 / 25.4;
  const margin = 54;
  const pageBottom = 760;
  const continuationTop = 64;
  const lineHeight = 16;
  const documentTitleLineHeight = 22;
  const paragraphGap = 7;
  const isInternshipAgreement = form.employment_contract_model === "internship";
  const body = renderContractBody(personnel, form, company, template, clauses);
  const values = contractRenderValues(personnel, form, company);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let y = continuationTop;
  const paragraphs = body.split(/\n{2,}/).map(paragraph => paragraph.trim()).filter(Boolean);
  const paragraphLines = paragraphs.map(paragraph => doc.splitTextToSize(paragraph, 486));

  paragraphLines.forEach((lines, index) => {
    const isArticleHeading = /^Artikel\s+\d+\b/i.test(paragraphs[index]);
    const isDocumentHeading = index === 0;
    const ownHeight = isDocumentHeading
      ? documentTitleLineHeight + Math.max(0, lines.length - 1) * lineHeight + paragraphGap
      : lines.length * lineHeight + paragraphGap;
    const nextHeight = isArticleHeading && paragraphLines[index + 1]
      ? paragraphLines[index + 1].length * lineHeight + paragraphGap
      : 0;
    if (y > continuationTop && y + ownHeight + nextHeight > pageBottom) {
      doc.addPage();
      y = continuationTop;
    }

    if (isDocumentHeading && ownHeight <= pageBottom - continuationTop) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(lines[0], margin, y);
      y += documentTitleLineHeight;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      lines.slice(1).forEach(line => {
        doc.text(line, margin, y);
        y += lineHeight;
      });
      y += paragraphGap;
      return;
    }

    doc.setFontSize(10);
    doc.setFont("helvetica", isArticleHeading ? "bold" : "normal");
    if (ownHeight <= pageBottom - continuationTop) {
      doc.text(lines, margin, y);
      y += ownHeight;
      return;
    }

    lines.forEach(line => {
      if (y + lineHeight > pageBottom) {
        doc.addPage();
        y = continuationTop;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    });
    y += paragraphGap;
  });
  doc.setFont("helvetica", "normal");

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.text("PDF-snapshot gegenereerd door LOQ. Latere sjabloonwijzigingen wijzigen dit document niet.", margin, 806);
    if (pageNumberSettings.enabled) {
      doc.setFontSize(pageNumberSettings.font_size_pt);
      doc.setTextColor(100, 116, 139);
      doc.text(
        formatPageNumber(pageNumberSettings, page, pageCount),
        pageNumberSettings.x_mm * millimeterToPoint,
        pageNumberSettings.y_mm * millimeterToPoint,
        { align: pageNumberAlignment, baseline: "middle" },
      );
      doc.setTextColor(0, 0, 0);
    }
  }
  const blob = doc.output("blob");
  const documentSlug = isInternshipAgreement ? "stageovereenkomst" : "arbeidsovereenkomst";
  const safeName = `${values.employeeName.replace(/[^\w.-]+/g, "_")}_${documentSlug}_${form.contract_start_date || "concept"}.pdf`;
  return new File([blob], safeName, { type: "application/pdf" });
}

async function safeFilterEntity(entityName, filter, sort) {
  const entity = base44.entities?.[entityName];
  if (!entity?.filter) return [];
  try {
    return await entity.filter(filter, sort);
  } catch {
    return [];
  }
}

function contractFileDescriptor(contract) {
  if (contract.signed_file_id || contract.signed_file_url) {
    return {
      managedFileId: contract.signed_file_id,
      fileUrl: contract.signed_file_url,
      filename: contract.signed_download_filename || "Ondertekend contract",
      title: "Ondertekend contract",
    };
  }
  if (contract.generated_file_id || contract.generated_file_url) {
    return {
      managedFileId: contract.generated_file_id,
      fileUrl: contract.generated_file_url,
      filename: contract.generated_download_filename || "Gegenereerd contract",
      title: "Gegenereerd contract",
    };
  }
  return null;
}

function documentStatusBadge(status) {
  const key = status || "concept";
  return <Badge className={`${DOCUMENT_STATUS_STYLES[key] || DOCUMENT_STATUS_STYLES.concept} text-xs`}>{DOCUMENT_STATUS_LABELS[key] || key}</Badge>;
}

function firstNotificationMessage(notifications) {
  const notification = Array.isArray(notifications) ? notifications[0] : null;
  if (typeof notification === "string") return notification;
  return notification?.message || null;
}

function getCompanyLabel(companies, companyId) {
  const company = companies.find(item => item.id === companyId);
  return company?.display_name || company?.legal_name || companyId || "-";
}

function getLetterheadOptions(letterheads, companies, companyId) {
  const company = companies.find(item => item.id === companyId);
  const scoped = (letterheads || []).filter(item => item.company_id === companyId && item.status !== "archived");
  const legacy = company?.letterhead_file_url && scoped.length === 0
    ? [{
        id: "legacy-letterhead",
        company_id: companyId,
        name: "Standaard briefpapier",
        is_default: true,
        file_url: company.letterhead_file_url,
        file_id: company.letterhead_file_id,
        download_filename: company.letterhead_download_filename,
        logical_path: company.letterhead_logical_path,
        legacy: true,
      }]
    : [];
  return [...legacy, ...scoped].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name));
}

function Article14InternshipFields({ form, set }) {
  const isBol = form.internship_type === "bol";
  const needsRouteReference = ["uwv_trial_placement", "reintegration_measure", "second_track_reintegration"].includes(form.internship_type);

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <p className="text-sm font-semibold text-foreground">Stageafspraken volgens artikel 14</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Dit is geen arbeidsovereenkomst. Leren, bovenformatieve inzet en dagelijkse een-op-eenbegeleiding moeten feitelijk centraal blijven staan.
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground">Route en instelling</p>
          <p className="text-xs text-muted-foreground">BBL hoort niet in deze route en gebruikt een afzonderlijke leerarbeidsovereenkomst.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1">
            <Label>Stageroute *</Label>
            <Select value={form.internship_type || "unknown"} onValueChange={value => set("internship_type", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unknown">Kies route</SelectItem>
                {INTERNSHIP_ROUTE_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Onderwijs- of re-integratie-instelling *</Label>
            <Input value={form.internship_institution_name || ""} onChange={event => set("internship_institution_name", event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Adres instelling *</Label>
            <Input value={form.internship_institution_address || ""} onChange={event => set("internship_institution_address", event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Vertegenwoordiger instelling *</Label>
            <Input value={form.internship_institution_representative_name || ""} onChange={event => set("internship_institution_representative_name", event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Functie vertegenwoordiger *</Label>
            <Input value={form.internship_institution_representative_function || ""} onChange={event => set("internship_institution_representative_function", event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>E-mailadres instelling *</Label>
            <Input type="email" value={form.internship_institution_email || ""} onChange={event => set("internship_institution_email", event.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Opleiding of re-integratietraject *</Label>
            <Input value={form.internship_education_name || ""} onChange={event => set("internship_education_name", event.target.value)} />
          </div>
          {isBol && (
            <>
              <div className="space-y-1">
                <Label>POK/BPV-kenmerk *</Label>
                <Input value={form.internship_bpv_reference || ""} onChange={event => set("internship_bpv_reference", event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>SBB-erkenningsnummer *</Label>
                <Input value={form.internship_learning_company_recognition_number || ""} onChange={event => set("internship_learning_company_recognition_number", event.target.value)} />
              </div>
            </>
          )}
          {needsRouteReference && (
            <div className="space-y-1 md:col-span-2">
              <Label>Kenmerk toestemming, besluit of trajectplan *</Label>
              <Input value={form.internship_route_reference || ""} onChange={event => set("internship_route_reference", event.target.value)} />
              {form.internship_type === "uwv_trial_placement" && <p className="text-xs text-amber-700">Binnen deze CAO-preset mag de proefplaatsing maximaal twee maanden duren.</p>}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3 border-t border-border pt-5">
        <p className="text-sm font-medium text-foreground">Stageopdracht en begeleiding</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label>Concrete stageopdracht *</Label>
            <Textarea rows={3} value={form.internship_assignment_description || ""} onChange={event => set("internship_assignment_description", event.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Meetbare leerdoelen *</Label>
            <Textarea rows={3} value={form.internship_learning_objectives || ""} onChange={event => set("internship_learning_objectives", event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Praktijkopleider stagebedrijf *</Label>
            <Input value={form.internship_practice_trainer_name || ""} onChange={event => set("internship_practice_trainer_name", event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Begeleider vanuit instelling *</Label>
            <Input value={form.internship_institution_supervisor_name || ""} onChange={event => set("internship_institution_supervisor_name", event.target.value)} />
          </div>
        </div>
      </section>

      <section className="space-y-3 border-t border-border pt-5">
        <p className="text-sm font-medium text-foreground">Omvang, evaluatie en vergoeding</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1">
            <Label>Gemiddeld aantal stage-uren per week *</Label>
            <Input type="number" min="0.25" step="0.25" value={form.internship_hours_per_week || ""} onChange={event => set("internship_hours_per_week", event.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Stagedagen en tijdvakken *</Label>
            <Input value={form.internship_working_times || ""} onChange={event => set("internship_working_times", event.target.value)} placeholder="Bijv. maandag t/m donderdag, 08:00-16:30" />
          </div>
          <div className="space-y-1 md:col-span-2 xl:col-span-3">
            <Label>Evaluatiemomenten en werkwijze *</Label>
            <Textarea rows={2} value={form.internship_evaluation_details || ""} onChange={event => set("internship_evaluation_details", event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Stagevergoeding *</Label>
            <Select value={form.internship_compensation_applies || "unknown"} onValueChange={value => set("internship_compensation_applies", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unknown">Kies afspraak</SelectItem>
                <SelectItem value="true">Ja, vergoeding afgesproken</SelectItem>
                <SelectItem value="false">Geen stagevergoeding</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.internship_compensation_applies === "true" && (
            <>
              <div className="space-y-1">
                <Label>Brutobedrag *</Label>
                <Input type="number" min="0" step="0.01" value={form.internship_compensation_amount || ""} onChange={event => set("internship_compensation_amount", event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Periode *</Label>
                <Select value={form.internship_compensation_period || "maand"} onValueChange={value => set("internship_compensation_period", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uur">Per uur</SelectItem>
                    <SelectItem value="dag">Per dag</SelectItem>
                    <SelectItem value="vier_weken">Per vier weken</SelectItem>
                    <SelectItem value="maand">Per maand</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="space-y-1 md:col-span-2 xl:col-span-3">
            <Label>Onkostenregeling *</Label>
            <Textarea rows={2} value={form.internship_expense_arrangement || ""} onChange={event => set("internship_expense_arrangement", event.target.value)} placeholder="Beschrijf vergoeding of vermeld expliciet dat geen onkosten worden vergoed." />
          </div>
        </div>
      </section>

      <section className="space-y-3 border-t border-border pt-5">
        <p className="text-sm font-medium text-foreground">Verzekering, bijlagen en artikel-14-controle</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Verzekeringsdekking en meldprocedure *</Label>
            <Textarea rows={3} value={form.internship_insurance_description || ""} onChange={event => set("internship_insurance_description", event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Bijlagen bij de stageovereenkomst *</Label>
            <Textarea rows={3} value={form.internship_attachments || ""} onChange={event => set("internship_attachments", event.target.value)} placeholder="Bijv. POK, stageplan, SBB-erkenning en Wpbr-documenten" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Wettelijke vertegenwoordiger minderjarige</Label>
            <Input value={form.internship_legal_representative_name || ""} onChange={event => set("internship_legal_representative_name", event.target.value)} placeholder="Alleen invullen indien vereist" />
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {INTERNSHIP_CONFIRMATION_FIELDS.map(([field, label]) => (
            <label key={field} className={`flex min-h-11 cursor-pointer items-center gap-3 border px-3 py-2 text-sm ${form[field] === "true" ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground"}`}>
              <input type="checkbox" checked={form[field] === "true"} onChange={event => set(field, event.target.checked ? "true" : "false")} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

function BblLearningFields({ form, set }) {
  return (
    <section className="space-y-3 border-b border-border pb-5">
      <div>
        <p className="text-sm font-semibold text-foreground">Leerarbeidsovereenkomst (BBL)</p>
        <p className="mt-1 text-xs text-muted-foreground">Dit is een arbeidsovereenkomst met loon voor bepaalde tijd. Stem de einddatum af op de afzonderlijke praktijkovereenkomst met school en het erkende leerbedrijf.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-1">
          <Label>Onderwijsinstelling *</Label>
          <Input value={form.bbl_institution_name || ""} onChange={event => set("bbl_institution_name", event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>BBL-opleiding *</Label>
          <Input value={form.bbl_education_name || ""} onChange={event => set("bbl_education_name", event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Kenmerk praktijkovereenkomst *</Label>
          <Input value={form.bbl_practice_agreement_reference || ""} onChange={event => set("bbl_practice_agreement_reference", event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>SBB-erkenningsnummer *</Label>
          <Input value={form.bbl_learning_company_recognition_number || ""} onChange={event => set("bbl_learning_company_recognition_number", event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Praktijkopleider *</Label>
          <Input value={form.bbl_practice_trainer_name || ""} onChange={event => set("bbl_practice_trainer_name", event.target.value)} />
        </div>
        <div className="border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
          Aspirant-beveiliger · schaal 2 · loon per vier weken. De template verwerkt de specifieke CAO-opbouw voor de praktijkopleiding.
        </div>
      </div>
    </section>
  );
}

export default function PersonnelContractsTab({ personnel, companies = [] }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [form, setForm] = useState(() => initialForm(personnel));
  const [previewFile, setPreviewFile] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [showArchive, setShowArchive] = useState(false);
  const [signedUploadId, setSignedUploadId] = useState(null);
  const [wageScaleFilter, setWageScaleFilter] = useState(null);

  const { data: currentUser = null } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: auditActors = [] } = useQuery({
    queryKey: ["personnel-audit-actors", "contracts"],
    queryFn: () => base44.entities.Personnel.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["personnel_contracts", personnel.id],
    queryFn: () => base44.entities.PersonnelContract.filter({ personnel_id: personnel.id }),
  });

  const sortedContracts = useMemo(() => [...contracts].sort((a, b) =>
    String(b.contract_start_date || "").localeCompare(String(a.contract_start_date || ""))
  ), [contracts]);
  const activeContracts = useMemo(() => sortedContracts.filter(c => c.document_status === "active"), [sortedContracts]);
  const archivedContracts = useMemo(() => sortedContracts.filter(c => c.document_status !== "active"), [sortedContracts]);
  const visibleContracts = showArchive ? archivedContracts : activeContracts;

  const companyIds = useMemo(() => uniqueValues([
    form.company_id,
    ...companies.map(company => company.id),
    ...contracts.map(contract => contract.company_id),
  ].filter(Boolean)), [companies, contracts, form.company_id]);

  const { data: companyCaoAssignments = [], isLoading: companyCaoAssignmentsLoading } = useQuery({
    queryKey: ["company-cao-assignments", form.company_id],
    queryFn: () => base44.entities.CompanyCaoAssignment.filter({ company_id: form.company_id }, "-created_date"),
    enabled: !!form.company_id,
  });

  const selectedCaoConfigurationIds = useMemo(() => uniqueValues([
    personnel.cao_configuration_id,
    form.cao_configuration_id,
    ...contracts.map(contract => contract.cao_configuration_id),
    ...companyCaoAssignments.map(assignment => assignment.cao_configuration_id),
  ]), [companyCaoAssignments, contracts, form.cao_configuration_id, personnel.cao_configuration_id]);

  const { data: caoConfigurationOptions = [] } = useQuery({
    queryKey: ["cao-configuration-options", "personnel-contracts", personnel.id, selectedCaoConfigurationIds],
    queryFn: async () => {
      const { data } = await base44.functions.invoke("listCaoConfigurationOptions", {
        include_ids: selectedCaoConfigurationIds,
      });
      return data?.options || [];
    },
  });

  const { data: companyWpbrLicenses = [] } = useQuery({
    queryKey: ["company-wpbr-licenses", "personnel-contracts", form.company_id],
    queryFn: () => safeFilterEntity("CompanyWpbrLicense", { company_id: form.company_id }, "-created_date"),
    enabled: !!form.company_id,
  });

  const { data: contractTemplates = [] } = useQuery({
    queryKey: ["company-contract-templates", companyIds],
    queryFn: async () => {
      const lists = await Promise.all(companyIds.map(companyId => safeFilterEntity("CompanyContractTemplate", { company_id: companyId }, "-created_date")));
      return lists.flat();
    },
    enabled: companyIds.length > 0,
  });

  const { data: letterheads = [] } = useQuery({
    queryKey: ["company-letterheads", companyIds],
    queryFn: async () => {
      const lists = await Promise.all(companyIds.map(companyId => safeFilterEntity("CompanyLetterhead", { company_id: companyId }, "-created_date")));
      return lists.flat();
    },
    enabled: companyIds.length > 0,
  });

  const { data: contractClauses = [] } = useQuery({
    queryKey: ["company-contract-clauses", companyIds],
    queryFn: async () => {
      const lists = await Promise.all(companyIds.map(companyId => safeFilterEntity("CompanyContractClause", { company_id: companyId }, "sort_order")));
      return lists.flat();
    },
    enabled: companyIds.length > 0,
  });

  const selectedCompany = companies.find(company => company.id === form.company_id) || null;
  const publishedTemplates = useMemo(() => groupContractTemplateVersions((contractTemplates || [])
    .filter(template => template.company_id === form.company_id && template.status === "published" && templateMatchesWizard(template, form)))
    .map(group => group.versions[0])
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name)), [contractTemplates, form]);
  const letterheadOptions = useMemo(() => getLetterheadOptions(letterheads, companies, form.company_id), [companies, form.company_id, letterheads]);
  const selectedTemplate = contractTemplates.find(template => template.id === form.template_id) || null;
  const selectableDurationOptions = useMemo(() => {
    const persistedAllowed = Array.isArray(selectedTemplate?.duration_options) ? selectedTemplate.duration_options : [];
    const hasLegacyLearningDuration = ["internship", "bbl"].includes(form.employment_contract_model)
      && persistedAllowed.some(value => !["pok_end_date", "free"].includes(value));
    const allowed = hasLegacyLearningDuration ? ["pok_end_date", "free"] : persistedAllowed;
    const routeOptions = form.employment_contract_model === "internship"
      ? DURATION_OPTIONS.filter(option => (form.internship_type === "bol" ? ["pok_end_date", "free"] : ["free"]).includes(option.value))
      : form.employment_contract_model === "bbl"
        ? DURATION_OPTIONS.filter(option => ["pok_end_date", "free"].includes(option.value))
        : DURATION_OPTIONS.filter(option => option.value !== "pok_end_date");
    if (allowed.length === 0) return routeOptions;
    return routeOptions.filter(option => allowed.includes(option.value));
  }, [form.employment_contract_model, form.internship_type, selectedTemplate]);
  const selectedLetterhead = letterheadOptions.find(item => item.id === form.letterhead_id) || null;
  const selectedTemplateClauses = useMemo(() => (contractClauses || [])
    .filter(clause => clause.company_id === form.company_id && clause.status !== "archived"),
  [contractClauses, form.company_id]);
  const availableContractKinds = useMemo(
    () => CONTRACT_KIND_OPTIONS.filter(option => contractKindAllowedForCao(option, form.cao_key)),
    [form.cao_key]
  );
  const isArticle14Internship = form.employment_contract_model === "internship";
  const isBblModel = form.employment_contract_model === "bbl";
  const isLegacyCallModel = ["min_max", "zero_hours", "call_agreement"].includes(form.employment_contract_model);
  const futureFlexModel = legalReferenceDate(form) >= FLEX_REFORM_EFFECTIVE_DATE && isLegacyCallModel;
  const futureStatutoryBandwidth = isStatutoryBandwidthModel(form);
  const futureCallRequiresException = futureFlexModel && !futureStatutoryBandwidth;
  const legacyCallContinuesAfterReform = isLegacyCallModel
    && form.contract_start_date
    && form.contract_start_date < FLEX_REFORM_EFFECTIVE_DATE
    && (!form.contract_end_date || form.contract_end_date >= FLEX_REFORM_EFFECTIVE_DATE);
  const wageTableYear = getYear(form.contract_start_date || new Date());
  const companyCaoKeyOptions = useMemo(
    () => buildCompanyCaoKeyOptions(companyCaoAssignments, form.contract_start_date, caoConfigurationOptions),
    [caoConfigurationOptions, companyCaoAssignments, form.contract_start_date]
  );
  const companyFunctionOptions = useMemo(
    () => buildCompanyFunctionOptions(companyCaoAssignments, form.contract_start_date, form.cao_key, caoConfigurationOptions, form.function_type),
    [caoConfigurationOptions, companyCaoAssignments, form.cao_key, form.contract_start_date, form.function_type]
  );
  const wizardFunctionOptions = useMemo(() => {
    if (!isArticle14Internship) return companyFunctionOptions;
    return companyFunctionOptions.filter(option => suggestPbCaoFunctionGroup(option.value) !== "non_security_staff");
  }, [companyFunctionOptions, isArticle14Internship]);
  const wizardFunctionGroups = useMemo(() => {
    const allowed = new Set(wizardFunctionOptions.map(option => option.value));
    const catalogGroups = buildFunctionGroupsForWpbrLicenses(companyWpbrLicenses, form.cao_key)
      .map(group => ({ ...group, functions: group.functions.filter(value => allowed.has(value)) }))
      .filter(group => group.functions.length > 0);
    const groupedValues = new Set(catalogGroups.flatMap(group => group.functions));
    const ungroupedOffice = wizardFunctionOptions
      .map(option => option.value)
      .filter(value => SHARED_BACKOFFICE_FUNCTIONS.includes(value) && !groupedValues.has(value));
    const ungroupedOperational = wizardFunctionOptions
      .map(option => option.value)
      .filter(value => !SHARED_BACKOFFICE_FUNCTIONS.includes(value) && !groupedValues.has(value));
    return [
      ...catalogGroups,
      ...(ungroupedOperational.length > 0 ? [{ key: "contract_other_operational", label: "Operationele functies", functions: ungroupedOperational }] : []),
      ...(ungroupedOffice.length > 0 ? [{ key: "contract_shared_office", label: "Binnendienst functies", functions: ungroupedOffice, shared: true }] : []),
    ];
  }, [companyWpbrLicenses, form.cao_key, wizardFunctionOptions]);
  const selectedFunctionValues = useMemo(
    () => uniqueValues([form.function_type, ...fromArrayText(form.allowed_function_types_text)]),
    [form.allowed_function_types_text, form.function_type]
  );
  const selectedPbFunctionGroups = useMemo(
    () => pbFunctionGroupsForFunctions(selectedFunctionValues),
    [selectedFunctionValues]
  );
  const expectedPbSalaryScale = form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY
    ? pbSalaryScaleForFunctionLevel(form.cao_function_level)
    : null;
  const visibleCaoConfigurationOptions = filterCaoConfigurationOptions(caoConfigurationOptions, form);
  const activeCaoAssignmentConfigurationIds = useMemo(() => companyCaoAssignments
    .filter(assignment => isDateWithinOptionRange(assignment, form.contract_start_date))
    .filter(assignment => resolveAssignmentCaoKey(assignment, caoConfigurationOptions) === form.cao_key)
    .map(assignment => assignment.cao_configuration_id)
    .filter(Boolean), [caoConfigurationOptions, companyCaoAssignments, form.cao_key, form.contract_start_date]);
  const effectiveCaoConfiguration = caoConfigurationOptions.find(option => (
    activeCaoAssignmentConfigurationIds.includes(option.id)
    && isDateWithinOptionRange(option, form.contract_start_date)
  )) || visibleCaoConfigurationOptions[0] || null;
  const wageRows = useMemo(() => {
    const rows = extractWageRows(effectiveCaoConfiguration, wageTableYear);
    if (form.cao_key !== CAO_PARTICULIERE_BEVEILIGING_KEY) return rows;
    if (form.cao_function_group === "non_security_staff") return [];
    if (!expectedPbSalaryScale) return rows;
    return rows.filter(row => Number(row.scale) === expectedPbSalaryScale);
  }, [effectiveCaoConfiguration, expectedPbSalaryScale, form.cao_function_group, form.cao_key, wageTableYear]);
  const wageScaleOptions = useMemo(() => uniqueValues(wageRows.map(row => String(row.scale))).sort((a, b) => Number(a) - Number(b)), [wageRows]);
  const visibleWageRows = useMemo(() => wageScaleFilter === null
    ? wageRows
    : wageRows.filter(row => String(row.scale) === String(wageScaleFilter)), [wageRows, wageScaleFilter]);
  const conflicts = validateConflicts(form, contracts, editingId, companies);
  const missingFields = getMissingContractFields(form);
  const evaluationContract = useMemo(() => buildContractPayload(personnel, {
    ...form,
    cao_configuration_id: effectiveCaoConfiguration?.id || null,
    template_version: selectedTemplate?.version || null,
    template_name_snapshot: selectedTemplate?.name || null,
    letterhead_name_snapshot: selectedLetterhead?.name || null,
    wage_table_year: form.wage_table_year || wageTableYear,
  }, currentUser, auditActors, editingId ? contracts.find(contract => contract.id === editingId) || {} : {}), [
    auditActors,
    contracts,
    currentUser,
    editingId,
    form,
    personnel,
    effectiveCaoConfiguration?.id,
    selectedLetterhead?.name,
    selectedTemplate?.name,
    selectedTemplate?.version,
    wageTableYear,
  ]);
  const { data: contractEvaluation = null, isFetching: contractEvaluationLoading, error: contractEvaluationError } = useQuery({
    queryKey: ["personnel-contract-evaluation", personnel.id, editingId, evaluationContract],
    queryFn: async () => {
      const { data } = await base44.functions.invoke("managePersonnelContract", {
        action: "evaluate",
        contract_id: editingId || null,
        contract: evaluationContract,
      });
      return data?.evaluation || null;
    },
    enabled: wizardOpen
      && wizardStep === 10
      && !!form.company_id
      && !!form.contract_start_date
      && selectedFunctionValues.length > 0,
    retry: false,
  });
  const generatedPreview = useMemo(() => renderContractBody(personnel, form, selectedCompany, selectedTemplate, selectedTemplateClauses), [form, personnel, selectedCompany, selectedTemplate, selectedTemplateClauses]);
  const unresolvedTemplatePlaceholders = useMemo(
    () => form.source_type === "generated" ? getUnresolvedContractTemplatePlaceholders(generatedPreview) : [],
    [form.source_type, generatedPreview]
  );
  const standardTemplateValidation = useMemo(
    () => validateStandardContractTemplateContext({ personnel, form, company: selectedCompany || {}, template: selectedTemplate || {} }),
    [form, personnel, selectedCompany, selectedTemplate]
  );
  const isPbParttimeModel = form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY
    && ["parttime_fixed", "parttime_growth"].includes(form.employment_contract_model);
  const isPbGrowthParttime = isPbParttimeModel && form.employment_contract_model === "parttime_growth";
  const isPbMinMaxModel = form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY
    && form.employment_contract_model === "min_max";
  const isPbZeroHoursModel = form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY
    && ["zero_hours", "call_agreement"].includes(form.employment_contract_model);
  const isPbCallModel = isPbMinMaxModel || isPbZeroHoursModel;
  const isPbNonOperationalRole = form.performs_security_work === "false"
    || form.cao_function_group === "non_security_staff";
  const probationMonths = probationMaximumMonths(form);
  const connectedPriorContract = useMemo(() => {
    if (!form.company_id || !form.contract_start_date) return null;
    const employerKey = companyLegalKey(form.company_id, companies);
    return [...contracts]
      .filter(contract => contract.id !== editingId && isActiveContract(contract))
      .filter(contract => companyLegalKey(contract.company_id, companies) === employerKey)
      .filter(contract => contract.contract_start_date && contract.contract_start_date < form.contract_start_date)
      .filter(contract => {
        const endDate = effectiveEndForContract(contract);
        if (!endDate) return true;
        return addMonths(endDate, 6) >= form.contract_start_date;
      })
      .sort((a, b) => String(b.contract_start_date).localeCompare(String(a.contract_start_date)))[0] || null;
  }, [companies, contracts, editingId, form.company_id, form.contract_start_date]);
  const probationAllowed = probationMonths > 0 && !connectedPriorContract && !isArticle14Internship;

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const setCaoKey = (value) => setForm(prev => {
    const selectedModel = getContractModel(prev.contract_model);
    const keepSelectedModel = contractModelAllowedForCao(selectedModel, value);
    const caoChanged = prev.cao_key !== value;
    const next = {
      ...prev,
      cao_key: value,
      cao_configuration_id: null,
      template_id: null,
      ...(caoChanged ? {
        cao_function_group: "",
        allowed_cao_function_groups_text: "",
        cao_function_level: "",
        allowed_cao_function_levels_text: "",
        cao_scale: "",
        cao_period: "",
        custom_hourly_rate: "",
        hourly_rate_snapshot: "",
        written_scale_period_notice_confirmed: "unknown",
        periodic_increase_due_confirmed: "unknown",
      } : {}),
      ...(keepSelectedModel ? {} : {
        contract_model: "",
        contract_form: "unknown",
        underlying_contract_form: null,
        duration_type: "fixed",
        employment_contract_model: "unknown",
        call_agreement_type: "not_applicable",
        duration_option: "",
        contract_end_date: "",
        probation_agreed: "unknown",
        probation_context: "unknown",
      }),
    };
    if (value === CAO_PARTICULIERE_BEVEILIGING_KEY) {
      next.salary_payment_frequency = "four_weeks";
      if (prev.employment_contract_model === "fulltime") {
        next.contract_hours_per_week = "36";
        next.contract_hours_per_pay_period = "144";
      } else if (["parttime_fixed", "parttime_growth"].includes(prev.employment_contract_model)) {
        const periodHours = numberOrNull(prev.contract_hours_per_pay_period)
          ?? (numberOrNull(prev.contract_hours_per_week) !== null ? numberOrNull(prev.contract_hours_per_week) * 4 : null);
        next.contract_hours_per_pay_period = periodHours === null ? "" : String(periodHours);
        next.contract_hours_per_week = periodHours === null ? "" : String(Math.round((periodHours / 4) * 100) / 100);
      } else if (prev.employment_contract_model === "min_max") {
        const minPeriodHours = numberOrNull(prev.min_hours_per_pay_period)
          ?? (numberOrNull(prev.min_hours_per_week) !== null ? numberOrNull(prev.min_hours_per_week) * 4 : null);
        const maxPeriodHours = numberOrNull(prev.max_hours_per_pay_period)
          ?? (numberOrNull(prev.max_hours_per_week) !== null ? numberOrNull(prev.max_hours_per_week) * 4 : null);
        next.min_hours_per_pay_period = minPeriodHours === null ? "" : String(minPeriodHours);
        next.max_hours_per_pay_period = maxPeriodHours === null ? "" : String(maxPeriodHours);
        next.min_hours_per_week = minPeriodHours === null ? "" : String(Math.round((minPeriodHours / 4) * 100) / 100);
        next.max_hours_per_week = maxPeriodHours === null ? "" : String(Math.round((maxPeriodHours / 4) * 100) / 100);
      } else if (["zero_hours", "call_agreement"].includes(prev.employment_contract_model)) {
        next.contract_hours_per_week = "";
        next.contract_hours_per_pay_period = "";
        next.min_hours_per_week = "";
        next.max_hours_per_week = "";
        next.min_hours_per_pay_period = "";
        next.max_hours_per_pay_period = "";
      }
    }
    return next;
  });
  const setPbParttimePeriodHours = (value) => setForm(prev => {
    const periodHours = numberOrNull(value);
    return {
      ...prev,
      contract_hours_per_pay_period: value,
      contract_hours_per_week: periodHours === null ? "" : String(Math.round((periodHours / 4) * 100) / 100),
    };
  });
  const setPbFulltimeReferencePeriodHours = (value) => setForm(prev => {
    const periodHours = numberOrNull(value);
    return {
      ...prev,
      fulltime_reference_hours_per_pay_period: value,
      fulltime_reference_hours_per_week: periodHours === null ? "" : String(Math.round((periodHours / 4) * 100) / 100),
    };
  });
  const setPbMinMaxPeriodHours = (field, value) => setForm(prev => {
    const periodHours = numberOrNull(value);
    const weekField = field === "min_hours_per_pay_period" ? "min_hours_per_week" : "max_hours_per_week";
    return {
      ...prev,
      [field]: value,
      [weekField]: periodHours === null ? "" : String(Math.round((periodHours / 4) * 100) / 100),
    };
  });
  const toggleMinMaxAvailabilityDay = (weekday) => setForm(prev => {
    const windows = normalizeAvailabilityWindows(prev.availability_windows);
    const exists = windows.some(window => window.weekday === weekday);
    return {
      ...prev,
      availability_windows: exists
        ? windows.filter(window => window.weekday !== weekday)
        : [...windows, { weekday, start_time: "09:00", end_time: "17:00", crosses_midnight: false }],
    };
  });
  const updateMinMaxAvailabilityWindow = (weekday, field, value) => setForm(prev => ({
    ...prev,
    availability_windows: normalizeAvailabilityWindows(prev.availability_windows).map(window => (
      window.weekday === weekday ? { ...window, [field]: value } : window
    )),
  }));
  const setCompanyId = (value) => setForm(prev => {
    const companyId = value === "none" ? null : value;
    if (prev.company_id === companyId) return prev;
    const nextCompany = companies.find(item => item.id === companyId);
    const defaultWorkLocation = compact([
      nextCompany?.street_name || nextCompany?.street,
      nextCompany?.house_number,
      nextCompany?.house_number_addition,
      nextCompany?.city,
    ].filter(Boolean).join(" "));
    return {
      ...prev,
      company_id: companyId,
      cao_key: null,
      cao_configuration_id: null,
      contract_model: "",
      contract_form: "unknown",
      underlying_contract_form: null,
      duration_type: "fixed",
      employment_contract_model: "unknown",
      call_agreement_type: "not_applicable",
      duration_option: "",
      contract_end_date: "",
      probation_agreed: "unknown",
      probation_context: "unknown",
      template_id: null,
      letterhead_id: null,
      work_location: defaultWorkLocation,
      work_area: nextCompany?.country || "Nederland",
      signing_place: nextCompany?.city || "",
    };
  });

  const setContractModel = (value) => {
    const model = getContractModel(value);
    setForm(prev => {
      const next = {
        ...prev,
        contract_model: value,
        contract_form: model?.contract_form || prev.contract_form,
        underlying_contract_form: model?.underlying_contract_form || null,
        duration_type: model?.duration_type || prev.duration_type,
        employment_contract_model: model?.employment_model || prev.employment_contract_model,
        call_agreement_type: model?.employment_model === "min_max"
          ? "min_max"
          : (model?.employment_model === "zero_hours" ? "zero_hours" : "not_applicable"),
        template_id: null,
      };
      if (model?.employment_model === "fulltime" && prev.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY) {
        next.contract_hours_per_week = "36";
        next.contract_hours_per_pay_period = "144";
        next.salary_payment_frequency = "four_weeks";
      } else if (["parttime_fixed", "parttime_growth"].includes(model?.employment_model) && prev.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY) {
        const periodHours = numberOrNull(prev.contract_hours_per_pay_period)
          ?? (numberOrNull(prev.contract_hours_per_week) !== null ? numberOrNull(prev.contract_hours_per_week) * 4 : null);
        next.contract_hours_per_pay_period = periodHours === null ? "" : String(periodHours);
        next.contract_hours_per_week = periodHours === null ? "" : String(Math.round((periodHours / 4) * 100) / 100);
        next.salary_payment_frequency = "four_weeks";
      } else if (model?.employment_model === "min_max" && prev.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY) {
        const minPeriodHours = numberOrNull(prev.min_hours_per_pay_period)
          ?? (numberOrNull(prev.min_hours_per_week) !== null ? numberOrNull(prev.min_hours_per_week) * 4 : null);
        const maxPeriodHours = numberOrNull(prev.max_hours_per_pay_period)
          ?? (numberOrNull(prev.max_hours_per_week) !== null ? numberOrNull(prev.max_hours_per_week) * 4 : null);
        next.min_hours_per_pay_period = minPeriodHours === null ? "" : String(minPeriodHours);
        next.max_hours_per_pay_period = maxPeriodHours === null ? "" : String(maxPeriodHours);
        next.min_hours_per_week = minPeriodHours === null ? "" : String(Math.round((minPeriodHours / 4) * 100) / 100);
        next.max_hours_per_week = maxPeriodHours === null ? "" : String(Math.round((maxPeriodHours / 4) * 100) / 100);
        next.salary_payment_frequency = "four_weeks";
        next.contract_hours_per_week = "";
        next.contract_hours_per_pay_period = "";
      } else if (model?.employment_model === "zero_hours" && prev.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY) {
        next.contract_hours_per_week = "";
        next.contract_hours_per_pay_period = "";
        next.min_hours_per_week = "";
        next.max_hours_per_week = "";
        next.min_hours_per_pay_period = "";
        next.max_hours_per_pay_period = "";
        next.salary_payment_frequency = "four_weeks";
      } else if (model?.employment_model === "internship") {
        const securityFunctions = uniqueValues([
          prev.function_type,
          ...fromArrayText(prev.allowed_function_types_text),
        ]).filter(functionValue => {
          const group = suggestPbCaoFunctionGroup(functionValue);
          return group && group !== "non_security_staff";
        });
        const primaryFunction = securityFunctions.includes(prev.function_type)
          ? prev.function_type
          : (securityFunctions[0] || "");
        next.probation_agreed = "not_applicable";
        next.probation_context = "not_applicable";
        next.contract_hours_per_week = "";
        next.contract_hours_per_pay_period = "";
        next.function_type = primaryFunction;
        next.allowed_function_types_text = securityFunctions.join(", ");
        next.cao_function_group = primaryFunction ? suggestPbCaoFunctionGroup(primaryFunction) : "";
        next.performs_security_work = primaryFunction ? "true" : "unknown";
        next.cao_function_level = "not_applicable";
        next.cao_scale = "";
        next.cao_period = "";
        next.custom_hourly_rate = "";
        next.hourly_rate_snapshot = "";
        next.security_role_status = "not_applicable";
        next.internship_type = prev.internship_type === "unknown" ? "bol" : prev.internship_type;
        next.duration_option = next.internship_type === "bol" ? "pok_end_date" : "free";
        next.contract_end_date = "";
      } else if (model?.employment_model === "bbl" && prev.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY) {
        const securityFunctions = uniqueValues([
          prev.function_type,
          ...fromArrayText(prev.allowed_function_types_text),
        ]).filter(functionValue => {
          const group = suggestPbCaoFunctionGroup(functionValue);
          return group && group !== "non_security_staff";
        });
        const primaryFunction = securityFunctions.includes(prev.function_type)
          ? prev.function_type
          : (securityFunctions[0] || "");
        next.function_type = primaryFunction;
        next.allowed_function_types_text = securityFunctions.join(", ");
        next.cao_function_group = primaryFunction ? suggestPbCaoFunctionGroup(primaryFunction) : "";
        next.performs_security_work = primaryFunction ? "true" : "unknown";
        next.salary_payment_frequency = "four_weeks";
        next.security_role_status = "aspirant_beveiliger";
        next.cao_function_level = "aspirant";
        next.cao_scale = "2";
        next.cao_period = prev.cao_period || "0";
        next.duration_option = "pok_end_date";
        next.contract_end_date = "";
      } else if (model?.default_hours && !next.contract_hours_per_week) {
        next.contract_hours_per_week = String(model.default_hours);
      }
      if (model?.duration_type === "indefinite") {
        next.contract_end_date = "";
        next.duration_option = "";
        next.prior_similar_work_status = "not_applicable";
      } else if (!["internship", "bbl"].includes(model?.employment_model) && prev.duration_option === "pok_end_date") {
        next.contract_end_date = "";
        next.duration_option = "";
      }
      if (model?.duration_type === "fixed" && !["internship", "bbl"].includes(model?.employment_model)
        && prev.prior_similar_work_status === "not_applicable") {
        next.prior_similar_work_status = "unknown";
      }
      if (["internship", "bbl", "zzp"].includes(model?.employment_model)) {
        next.prior_similar_work_status = "not_applicable";
      }
      if (["internship", "zzp"].includes(model?.employment_model)) {
        next.probation_agreed = "not_applicable";
        next.probation_context = "not_applicable";
      }
      return next;
    });
  };

  const setContractKind = (employmentModel) => {
    const fixedOnly = ["internship", "bbl"].includes(employmentModel);
    const preferredDuration = fixedOnly ? "fixed" : (form.duration_type || "fixed");
    const model = modelForKindAndDuration(employmentModel, preferredDuration)
      || modelForKindAndDuration(employmentModel, "fixed");
    if (model) setContractModel(model.value);
  };

  const setContractDurationType = (durationType) => {
    const model = modelForKindAndDuration(form.employment_contract_model, durationType);
    if (!model) return;
    setContractModel(model.value);
    if (durationType === "indefinite") {
      setForm(prev => ({
        ...prev,
        contract_model: model.value,
        contract_form: model.contract_form,
        underlying_contract_form: model.underlying_contract_form || null,
        duration_type: "indefinite",
        duration_option: "",
        contract_end_date: "",
        prior_similar_work_status: "not_applicable",
      }));
    }
  };

  const setDurationOption = (value) => {
    setForm(prev => {
      const option = DURATION_OPTIONS.find(item => item.value === value);
      return {
        ...prev,
        duration_option: value,
        contract_end_date: option?.months
          ? addMonthsMinusOneDay(prev.contract_start_date, option.months)
          : (value === "pok_end_date" ? "" : prev.contract_end_date),
      };
    });
  };

  const setProbationChoice = (value) => {
    setForm(prev => ({
      ...prev,
      probation_agreed: value,
      probation_context: value === "true" ? "first_contract" : "not_applicable",
    }));
  };

  const selectWageRow = (row) => {
    setForm(prev => ({
      ...prev,
      cao_scale: row.scale ?? "",
      cao_period: row.period ?? "",
      custom_hourly_rate: row.hourlyRate ?? prev.custom_hourly_rate,
      hourly_rate_snapshot: row.hourlyRate ?? "",
      wage_table_year: row.year || wageTableYear,
      cao_function_level: prev.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY
        ? (pbFunctionLevelForSalaryScale(row.scale) || prev.cao_function_level)
        : prev.cao_function_level,
    }));
  };

  const toggleAllowedFunction = (value) => {
    setForm(prev => {
      const selected = uniqueValues([prev.function_type, ...fromArrayText(prev.allowed_function_types_text)]);
      const alreadySelected = selected.includes(value);
      const nextFunctions = alreadySelected
        ? selected.filter(item => item !== value)
        : [...selected, value];
      const nextPrimary = prev.function_type === value
        ? (nextFunctions[0] || null)
        : (prev.function_type || nextFunctions[0] || null);
      const suggestedGroup = prev.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY
        ? suggestPbCaoFunctionGroup(nextPrimary)
        : null;
      return {
        ...prev,
        function_type: nextPrimary,
        allowed_function_types_text: nextFunctions.join(", "),
        cao_function_group: suggestedGroup || null,
        performs_security_work: suggestedGroup
          ? (suggestedGroup === "non_security_staff" ? "false" : "true")
          : prev.performs_security_work,
        cao_function_level: suggestedGroup === "non_security_staff" ? "not_applicable" : prev.cao_function_level,
        cao_scale: suggestedGroup === "non_security_staff" ? "" : prev.cao_scale,
        cao_period: suggestedGroup === "non_security_staff" ? "" : prev.cao_period,
      };
    });
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["personnel_contracts", personnel.id] });
    queryClient.invalidateQueries({ queryKey: ["personnel"] });
    queryClient.invalidateQueries({ queryKey: ["company-contract-templates"] });
    queryClient.invalidateQueries({ queryKey: ["company-contract-clauses"] });
    queryClient.invalidateQueries({ queryKey: ["company-letterheads"] });
    queryClient.invalidateQueries({ queryKey: ["cao-configuration-options"] });
    queryClient.invalidateQueries({ queryKey: ["company-cao-assignments"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (conflicts.issues.length > 0) {
        throw new Error(conflicts.issues[0]);
      }
      if (form.source_type === "generated" && unresolvedTemplatePlaceholders.length > 0) {
        throw new Error(`Het contract bevat nog niet gekoppelde placeholders: ${unresolvedTemplatePlaceholders.join(", ")}.`);
      }
      if (form.source_type === "generated" && standardTemplateValidation.issues.length > 0) {
        throw new Error(standardTemplateValidation.issues[0]);
      }

      const previous = editingId ? contracts.find(contract => contract.id === editingId) || {} : {};
      const payload = buildContractPayload(personnel, {
        ...form,
        cao_configuration_id: effectiveCaoConfiguration?.id || null,
        template_version: selectedTemplate?.version || null,
        template_name_snapshot: selectedTemplate?.name || null,
        letterhead_name_snapshot: selectedLetterhead?.name || null,
        wage_table_year: form.wage_table_year || wageTableYear,
        signed_file_id: previous.signed_file_id || null,
      }, currentUser, auditActors, previous);
      const evaluationResponse = await base44.functions.invoke("managePersonnelContract", {
        action: "evaluate",
        contract_id: editingId || null,
        contract: payload,
      });
      const latestEvaluation = evaluationResponse.data?.evaluation;
      if (form.source_type === "generated" && latestEvaluation?.status !== "compliant") {
        throw new Error(latestEvaluation?.blocking_reasons?.[0]
          || latestEvaluation?.manual_review_reasons?.[0]
          || "Het contract moet eerst juridisch compleet zijn voordat een document kan worden gegenereerd.");
      }

      const draftResponse = await base44.functions.invoke("managePersonnelContract", {
        action: "save_draft",
        contract_id: editingId || null,
        contract: payload,
      });
      let record = draftResponse.data?.contract;
      if (!record?.id) throw new Error("Het contractconcept kon niet worden aangemaakt.");

      if (form.source_type === "generated") {
        const pdfFile = makePdfFile({
          personnel,
          form,
          company: selectedCompany,
          template: selectedTemplate,
          letterhead: selectedLetterhead,
          clauses: selectedTemplateClauses,
        });
        const result = await uploadManagedFile({
          file: pdfFile,
          ownerType: "personnel",
          ownerId: personnel.id,
          companyId: form.company_id,
          ownerLabel: personnel.full_name || personnel.display_name || "Medewerker",
          domain: "hr",
          category: "employment_contract",
          sourceEntity: "PersonnelContract",
          sourceEntityId: record.id,
          sourceField: "generated_file",
          documentLabel: selectedTemplate?.name
            || (form.employment_contract_model === "internship"
              ? "Stageovereenkomst (BOL / re-integratie)"
              : (form.employment_contract_model === "bbl" ? "Leerarbeidsovereenkomst (BBL)" : "Arbeidsovereenkomst")),
          validFrom: form.contract_start_date || null,
          validUntil: form.contract_end_date || null,
          isSensitive: true,
          uploadedBy: currentUser,
          auditActors,
          auditAction: editingId ? "gegenereerd bijgewerkt" : "gegenereerd",
          folderSegments: ["contracten"],
        });
        const attachedResponse = await base44.functions.invoke("managePersonnelContract", {
          action: "attach_generated",
          contract_id: record.id,
          generated_file_url: result.file_url,
          generated_file_id: result.managed_file_id,
          generated_download_filename: result.download_filename,
          generated_logical_path: result.logical_path,
        });
        record = attachedResponse.data?.contract || record;
      }

      if (form.source_type === "uploaded_existing" && form.existing_contract_file) {
        const result = await uploadManagedFile({
          file: form.existing_contract_file,
          ownerType: "personnel",
          ownerId: personnel.id,
          companyId: form.company_id,
          ownerLabel: personnel.full_name || personnel.display_name || "Medewerker",
          domain: "hr",
          category: "employment_contract",
          sourceEntity: "PersonnelContract",
          sourceEntityId: record.id,
          sourceField: "signed_file",
          documentLabel: "Bestaand arbeidscontract",
          validFrom: form.contract_start_date || null,
          validUntil: form.contract_end_date || null,
          isSensitive: true,
          uploadedBy: currentUser,
          auditActors,
          auditAction: editingId ? "vernieuwd" : "toegevoegd",
          folderSegments: ["contracten"],
        });
        const signedResponse = await base44.functions.invoke("managePersonnelContract", {
          action: "register_signed",
          contract_id: record.id,
          signed_file_url: result.file_url,
          signed_file_id: result.managed_file_id,
          signed_download_filename: result.download_filename,
          signed_logical_path: result.logical_path,
          contract_agreed_at: form.contract_agreed_at || form.signing_date || null,
        });
        record = signedResponse.data?.contract || record;
        return {
          record,
          activated: signedResponse.data?.activated === true,
          evaluation: signedResponse.data?.evaluation || null,
          notifications: signedResponse.data?.notifications || [],
        };
      }

      return { record, activated: false, evaluation: latestEvaluation };
    },
    onSuccess: (result) => {
      setWizardOpen(false);
      setWizardStep(1);
      setEditingId(null);
      setForm(initialForm(personnel));
      setActionMessage({
        type: "success",
        text: firstNotificationMessage(result?.notifications)
          || (result?.activated
          ? "Het getekende contract is gecontroleerd en actief gemaakt."
          : result?.record?.document_status === "signed"
            ? "Het getekende contract is opgeslagen en wacht op juridische controle."
            : "Het contractdocument is gegenereerd. Upload na ondertekening de getekende versie om het te activeren."),
      });
      refresh();
    },
    onError: (error) => {
      setActionMessage({ type: "error", text: error?.message || "Contract kon niet worden opgeslagen." });
    },
  });

  const lifecycleMutation = useMutation({
    mutationFn: async ({ action, contract }) => {
      const { data } = await base44.functions.invoke("managePersonnelContract", {
        action,
        contract_id: contract.id,
      });
      return data;
    },
    onSuccess: (data, variables) => {
      const labels = {
        archive: "Contract gearchiveerd.",
        revalidate: data?.activated
          ? "Contract opnieuw gecontroleerd en inzetbaar gemaakt."
          : "Hercontrole afgerond; het contract vraagt nog aandacht.",
      };
      setActionMessage({ type: "success", text: labels[variables.action] || "Contract bijgewerkt." });
      refresh();
    },
    onError: (error) => setActionMessage({
      type: "error",
      text: error?.response?.data?.error || error?.message || "De contractactie is mislukt.",
    }),
  });

  const signedUploadMutation = useMutation({
    mutationFn: async ({ contract, file }) => {
      const result = await uploadManagedFile({
        file,
        ownerType: "personnel",
        ownerId: personnel.id,
        companyId: contract.company_id,
        ownerLabel: personnel.full_name || personnel.display_name || "Medewerker",
        domain: "hr",
        category: "employment_contract",
        sourceEntity: "PersonnelContract",
        sourceEntityId: contract.id,
        sourceField: "signed_file",
        documentLabel: "Getekend arbeidscontract",
        validFrom: contract.contract_start_date || null,
        validUntil: contract.contract_end_date || null,
        isSensitive: true,
        uploadedBy: currentUser,
        auditActors,
        auditAction: "getekende versie toegevoegd",
        folderSegments: ["contracten"],
      });
      const { data } = await base44.functions.invoke("managePersonnelContract", {
        action: "register_signed",
        contract_id: contract.id,
        signed_file_url: result.file_url,
        signed_file_id: result.managed_file_id,
        signed_download_filename: result.download_filename,
        signed_logical_path: result.logical_path,
        contract_agreed_at: contract.contract_agreed_at || contract.signing_date || new Date().toISOString().slice(0, 10),
      });
      return data;
    },
    onSuccess: (data) => {
      setSignedUploadId(null);
      setActionMessage({
        type: "success",
        text: firstNotificationMessage(data?.notifications)
          || (data?.activated
          ? "De getekende versie is gecontroleerd en het contract is actief."
          : "De getekende versie is opgeslagen. Bekijk de aandachtspunten voordat het contract inzetbaar wordt."),
      });
      refresh();
    },
    onError: (error) => {
      setSignedUploadId(null);
      setActionMessage({
        type: "error",
        text: error?.response?.data?.error || error?.message || "De getekende versie kon niet worden verwerkt.",
      });
    },
  });

  const openNew = () => {
    setEditingId(null);
    setForm(initialForm(personnel));
    setWizardStep(1);
    setActionMessage(null);
    setWizardOpen(true);
  };

  const openEdit = (contract) => {
    setEditingId(contract.id);
    setForm(formFromContract(contract));
    setWizardStep(1);
    setActionMessage(null);
    setWizardOpen(true);
  };

  const openPreview = (contract) => {
    const descriptor = contractFileDescriptor(contract);
    if (!descriptor) {
      openEdit(contract);
      return;
    }
    setPreviewFile(descriptor);
  };

  const nextStep = () => setWizardStep(step => Math.min(step + 1, 10));
  const previousStep = () => setWizardStep(step => Math.max(step - 1, 1));

  useEffect(() => {
    if (!wizardOpen || !form.company_id || companyCaoAssignmentsLoading) return;
    setForm(prev => {
      if (companyCaoKeyOptions.length === 1 && prev.cao_key !== companyCaoKeyOptions[0].value) {
        return { ...prev, cao_key: companyCaoKeyOptions[0].value, cao_configuration_id: null };
      }
      if (prev.cao_key && !companyCaoKeyOptions.some(option => option.value === prev.cao_key)) {
        return { ...prev, cao_key: null, cao_configuration_id: null };
      }
      return prev;
    });
  }, [wizardOpen, form.company_id, companyCaoAssignmentsLoading, companyCaoKeyOptions]);

  useEffect(() => {
    if (!wizardOpen || form.letterhead_id || letterheadOptions.length === 0) return;
    const defaultLetterhead = letterheadOptions.find(option => option.is_default) || letterheadOptions[0];
    if (defaultLetterhead) set("letterhead_id", defaultLetterhead.id);
  }, [wizardOpen, form.letterhead_id, letterheadOptions]);

  useEffect(() => {
    if (!wizardOpen || form.source_type !== "generated" || !selectedTemplate?.default_letterhead_id) return;
    if (!letterheadOptions.some(option => option.id === selectedTemplate.default_letterhead_id)) return;
    if (form.letterhead_id !== selectedTemplate.default_letterhead_id) {
      set("letterhead_id", selectedTemplate.default_letterhead_id);
    }
  }, [wizardOpen, form.source_type, form.letterhead_id, selectedTemplate?.default_letterhead_id, letterheadOptions]);

  useEffect(() => {
    if (!wizardOpen || form.source_type !== "generated") return;
    if (form.template_id && !publishedTemplates.some(template => template.id === form.template_id)) {
      set("template_id", null);
      return;
    }
    if (!form.template_id && publishedTemplates.length > 0) set("template_id", publishedTemplates[0].id);
  }, [wizardOpen, form.source_type, form.template_id, publishedTemplates]);

  useEffect(() => {
    if (!wizardOpen || form.duration_type !== "fixed" || !form.duration_option || ["free", "pok_end_date"].includes(form.duration_option) || !form.contract_start_date) return;
    const option = DURATION_OPTIONS.find(item => item.value === form.duration_option);
    const nextEndDate = option?.months ? addMonthsMinusOneDay(form.contract_start_date, option.months) : "";
    if (nextEndDate && nextEndDate !== form.contract_end_date) set("contract_end_date", nextEndDate);
  }, [wizardOpen, form.duration_type, form.duration_option, form.contract_start_date, form.contract_end_date]);

  useEffect(() => {
    if (!wizardOpen || form.employment_contract_model !== "internship" || form.internship_type === "bol" || form.duration_option !== "pok_end_date") return;
    setForm(prev => ({ ...prev, duration_option: "free", contract_end_date: "" }));
  }, [wizardOpen, form.employment_contract_model, form.internship_type, form.duration_option]);

  useEffect(() => {
    if (!wizardOpen || probationAllowed || form.probation_agreed === "false" || form.probation_agreed === "not_applicable") return;
    setForm(prev => ({ ...prev, probation_agreed: "false", probation_context: "not_applicable" }));
  }, [form.probation_agreed, probationAllowed, wizardOpen]);

  useEffect(() => {
    if (wageScaleOptions.length === 0) {
      if (wageScaleFilter !== null) setWageScaleFilter(null);
      return;
    }
    const selectedScale = form.cao_scale ? String(form.cao_scale) : null;
    const nextScale = selectedScale && wageScaleOptions.includes(selectedScale)
      ? selectedScale
      : (wageScaleFilter && wageScaleOptions.includes(String(wageScaleFilter)) ? String(wageScaleFilter) : wageScaleOptions[0]);
    if (String(wageScaleFilter || "") !== String(nextScale || "")) setWageScaleFilter(nextScale);
  }, [form.cao_scale, wageScaleFilter, wageScaleOptions]);

  const stepItems = [
    "Documentbron",
    "Bedrijf",
    "Startdatum",
    "CAO",
    "Contractvorm",
    "Looptijd",
    "Functies",
    "Proeftijd",
    isArticle14Internship ? "Stageafspraken" : (isBblModel ? "Loon, uren & BBL" : "Loon & uren"),
    "Controle",
  ];
  const currentStepComplete = [
    !!form.source_type && (form.source_type !== "uploaded_existing" || !!form.existing_contract_file || !!form.signed_file_id),
    !!form.company_id,
    !!form.contract_start_date,
    !!form.cao_key,
    !!form.contract_model,
    form.duration_type !== "fixed" || (!!form.duration_option && !!form.contract_end_date),
    selectedFunctionValues.length > 0,
    isArticle14Internship || ["true", "false", "not_applicable"].includes(form.probation_agreed),
    true,
    true,
  ][wizardStep - 1];

  return (
    <div className="flex flex-col h-full">
      {actionMessage && (
        <div className={`mb-3 rounded-lg border p-3 text-sm ${actionMessage.type === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"}`}>
          {actionMessage.text}
        </div>
      )}

      <AnimatePresence initial={false}>
      {wizardOpen && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="rounded-none border-0 border-b border-primary/30 bg-muted/20 p-5 overflow-hidden"
        >
          {editingId && <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">Contract bewerken</p>}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              {stepItems.map((s, i) => (
                <React.Fragment key={s}>
                  <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full shrink-0 transition-colors ${i + 1 === wizardStep ? "bg-primary text-primary-foreground" : i + 1 < wizardStep ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "text-muted-foreground"}`}>
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${i + 1 === wizardStep ? "bg-primary-foreground text-primary" : i + 1 < wizardStep ? "text-green-700 dark:text-green-300" : "border border-muted-foreground/30 text-muted-foreground"}`}>{i + 1 < wizardStep ? "✓" : i + 1}</span>
                    <span className="hidden md:inline truncate">{s}</span>
                  </div>
                  {i < stepItems.length - 1 && <div className={`h-px flex-1 min-w-2 ${i + 1 < wizardStep ? "bg-green-200 dark:bg-green-900" : "bg-border"}`} />}
                </React.Fragment>
              ))}
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => setWizardOpen(false)} className="shrink-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative">
            <AnimatePresence mode="wait">
              <motion.div key={wizardStep} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: "easeOut" }}>
            {wizardStep === 1 && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Hoe wilt u het contract vastleggen?</p>
                  <p className="mt-1 text-sm text-muted-foreground">Kies direct of Secure-it een nieuw contract samenstelt of dat u een bestaand, ondertekend contract aan de historie toevoegt.</p>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { value: "generated", label: "Nieuw contract genereren", description: "Gebruik een gepubliceerd contractsjabloon en laat alle contractgegevens automatisch invullen." },
                    { value: "uploaded_existing", label: "Bestaand contract uploaden", description: "Voeg ook oudere contracten toe; de volledige keten wordt daarna opnieuw juridisch beoordeeld." },
                  ].map(option => {
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => { set("source_type", option.value); if (option.value === "generated") setWizardStep(2); }}
                        className={`flex min-h-16 items-center justify-between rounded-lg border px-4 py-3 text-left transition-all active:scale-[0.99] ${form.source_type === option.value ? "border-primary bg-accent" : "border-border bg-card hover:border-primary hover:bg-accent"}`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{option.label}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{option.description}</p>
                        </div>
                        {form.source_type === option.value ? <Check className="h-4 w-4 shrink-0 text-primary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      </button>
                    );
                  })}
                </div>
                {form.source_type === "uploaded_existing" && (
                  <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-primary/40 bg-primary/5 p-5 text-center transition-colors hover:bg-primary/10">
                    <Upload className="h-6 w-6 text-primary" />
                    <span className="mt-2 text-sm font-medium text-foreground">{form.existing_contract_file?.name || "Selecteer het bestaande contract"}</span>
                    <span className="mt-0.5 text-xs text-muted-foreground">PDF, JPG of PNG. OCR en documentherkenning kunnen hier later op aansluiten.</span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      onChange={event => { set("existing_contract_file", event.target.files?.[0] || null); setWizardStep(2); }}
                    />
                  </label>
                )}
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Kies het bedrijf waarmee deze medewerker het contract aangaat. De CAO's en sjablonen worden daarna hierop gefilterd.</p>
                <div className="grid grid-cols-1 gap-2">
                  {companies.map(company => (
                    <button
                      key={company.id}
                      type="button"
                      onClick={() => { setCompanyId(company.id); nextStep(); }}
                      className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all active:scale-[0.99] ${form.company_id === company.id ? "border-primary bg-accent" : "border-border bg-card hover:border-primary hover:bg-accent"}`}
                    >
                      <div>
                        <p className="font-semibold text-foreground">{company.display_name || company.legal_name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{company.legal_name && company.display_name !== company.legal_name ? company.legal_name : company.city || "Bedrijf"}</p>
                      </div>
                      {form.company_id === company.id ? <Check className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  ))}
                </div>
                {companies.length === 0 && <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Er zijn nog geen bedrijven beschikbaar voor dit contract.</p>}
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Wanneer begint het contract?</p>
                  <p className="mt-1 text-sm text-muted-foreground">De startdatum bepaalt welke bedrijfs-CAO, CAO-versie en salaristabel beschikbaar zijn. Dit werkt ook voor historische contracten.</p>
                </div>
                <div className="max-w-md space-y-1">
                  <Label>Startdatum *</Label>
                  <Input type="date" value={form.contract_start_date || ""} onChange={event => set("contract_start_date", event.target.value)} />
                </div>
              </div>
            )}

            {wizardStep === 4 && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{selectedCompany?.display_name || selectedCompany?.legal_name || "Geen bedrijf geselecteerd"}</p>
                  <p className="text-xs text-muted-foreground">Alleen CAO's die in het bedrijfsprofiel aan dit bedrijf zijn gekoppeld worden getoond.</p>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {companyCaoKeyOptions.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCaoKey(option.value)}
                      className={`flex min-h-16 items-center justify-between rounded-lg border px-4 py-3 text-left transition-all active:scale-[0.99] ${form.cao_key === option.value ? "border-primary bg-accent" : "border-border bg-card hover:border-primary hover:bg-accent"}`}
                    >
                      <div>
                        <p className="font-semibold text-foreground">{option.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">De juiste cao-versie en salaristabel worden automatisch bepaald op de contractstartdatum.</p>
                      </div>
                      {form.cao_key === option.value ? <Check className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  ))}
                </div>
                {form.company_id && !companyCaoAssignmentsLoading && companyCaoKeyOptions.length === 0 && (
                  <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    Dit bedrijf heeft nog geen actieve CAO-koppeling voor de gekozen contractdatum. Voeg deze eerst toe in het bedrijfsprofiel.
                  </p>
                )}
              </div>
            )}

            {wizardStep === 5 && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Kies het type dienstverband</p>
                  <p className="mt-1 text-sm text-muted-foreground">De looptijd wordt in de volgende stap gekozen. Alleen contractsoorten die passen bij de geselecteerde CAO worden getoond.</p>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {availableContractKinds.map(option => {
                    const selected = form.employment_contract_model === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setContractKind(option.value)}
                        className={`flex min-h-16 items-center justify-between rounded-lg border px-4 py-3 text-left transition-all active:scale-[0.99] ${selected ? "border-primary bg-accent" : "border-border bg-card hover:border-primary hover:bg-accent"}`}
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{option.label}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                        </div>
                        {selected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      </button>
                    );
                  })}
                </div>
                {availableContractKinds.length === 0 && (
                  <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    Voor deze CAO zijn nog geen ondersteunde contractvormen ingericht.
                  </p>
                )}
              </div>
            )}

            {wizardStep === 6 && (
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-medium text-foreground">Hoe lang loopt het contract?</p>
                  <p className="mt-1 text-sm text-muted-foreground">Kies de looptijd en, bij een tijdelijk contract, de manier waarop de einddatum wordt bepaald.</p>
                </div>

                {!isArticle14Internship && !isBblModel && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Looptijd</p>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { value: "fixed", label: "Bepaalde tijd", description: "Het contract eindigt op een vooraf vastgelegde einddatum." },
                        { value: "indefinite", label: "Onbepaalde tijd", description: "Het contract heeft geen vooraf vastgelegde einddatum." },
                      ].map(option => {
                        const selected = form.duration_type === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setContractDurationType(option.value)}
                            className={`flex min-h-16 items-center justify-between rounded-lg border px-4 py-3 text-left transition-all active:scale-[0.99] ${selected ? "border-primary bg-accent" : "border-border bg-card hover:border-primary hover:bg-accent"}`}
                          >
                            <div>
                              <p className="font-semibold text-foreground">{option.label}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                            </div>
                            {selected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {form.duration_type === "fixed" && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isArticle14Internship || isBblModel ? "Bron einddatum" : "Duur"}</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {selectableDurationOptions.map(option => {
                        const selected = form.duration_option === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setDurationOption(option.value)}
                            className={`flex min-h-12 items-center justify-between rounded-lg border px-4 py-3 text-left transition-all ${selected ? "border-primary bg-accent" : "border-border bg-card hover:border-primary hover:bg-accent"}`}
                          >
                            <span className="text-sm font-medium text-foreground">{option.label}</span>
                            {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                    <div className="max-w-md space-y-1">
                      <Label>{form.duration_option === "pok_end_date" ? "Einddatum volgens POK *" : "Einddatum *"}</Label>
                      <Input
                        type="date"
                        value={form.contract_end_date || ""}
                        onChange={event => set("contract_end_date", event.target.value)}
                        disabled={!!form.duration_option && !["free", "pok_end_date"].includes(form.duration_option)}
                      />
                      {form.duration_option === "pok_end_date" && (
                        <p className="text-xs text-muted-foreground">Neem de datum voorlopig over uit de POK. Upload en OCR van de POK worden in een vervolgstap toegevoegd.</p>
                      )}
                    </div>
                  </div>
                )}

                {legacyCallContinuesAfterReform && !futureFlexModel && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-4 text-sm dark:border-amber-700 dark:bg-amber-950/20">
                    <p className="font-medium text-foreground">Controle nodig voor 1 januari 2028</p>
                    <p className="mt-1 text-muted-foreground">Dit oproepcontract loopt door na de voorgenomen wetswijziging. De applicatie markeert het contract voor een tijdige herbeoordeling.</p>
                  </div>
                )}
                {isBblModel && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
                    Een BBL-leerarbeidsovereenkomst is hier altijd voor bepaalde tijd. De einddatum sluit aan op de POK of wordt als vrije einddatum vastgelegd.
                  </div>
                )}
              </div>
            )}

            {wizardStep === 7 && (
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-medium text-foreground">Functies binnen dit contract</p>
                  <p className="mt-1 text-sm text-muted-foreground">De eerste gekozen functie wordt automatisch de hoofdfunctie. De applicatie leidt vergunningcontext en CAO-indeling uit de geselecteerde functies af.</p>
                </div>
                {wizardFunctionGroups.length > 0 ? (
                  <div className="space-y-5">
                    {wizardFunctionGroups.map(group => (
                      <section key={group.key} className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
                          {group.shared && group.licenseTypes?.length > 0 && (
                            <span className="text-[11px] text-muted-foreground">Geldt voor {group.licenseTypes.join(" + ")}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {group.functions.map(value => {
                            const selected = selectedFunctionValues.includes(value);
                            const primary = form.function_type === value;
                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() => toggleAllowedFunction(value)}
                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/40"}`}
                              >
                                {readableFunctionLabel(value)}
                                {primary && <span className="rounded-full bg-primary-foreground/15 px-1.5 py-0.5 text-[10px]">Hoofd</span>}
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    Voor deze CAO zijn nog geen functies gekoppeld aan het bedrijf. Voeg de functies eerst toe via de CAO-instellingen van het bedrijf.
                  </p>
                )}
                {form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY && selectedPbFunctionGroups.length > 1 && (
                  <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    De functies vallen in meerdere CAO-functiegroepen. De hoofdfunctie bepaalt de primaire loonindeling; de servercontrole bewaakt de combinatie.
                  </p>
                )}
              </div>
            )}

            {wizardStep === 8 && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Proeftijd</p>
                  <p className="mt-1 text-sm text-muted-foreground">De toegestane keuze wordt automatisch bepaald uit contractduur en eerdere contracten bij dezelfde juridische werkgever.</p>
                </div>
                {isArticle14Internship ? (
                  <div className="flex min-h-16 items-center justify-between rounded-lg border border-primary bg-accent px-4 py-3">
                    <div>
                      <p className="font-semibold text-foreground">Niet van toepassing</p>
                      <p className="mt-1 text-xs text-muted-foreground">Een stageovereenkomst is geen arbeidsovereenkomst en bevat daarom geen proeftijd.</p>
                    </div>
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                ) : !probationAllowed ? (
                  <button
                    type="button"
                    onClick={() => setProbationChoice("false")}
                    className="flex min-h-16 w-full items-center justify-between rounded-lg border border-primary bg-accent px-4 py-3 text-left"
                  >
                    <div>
                      <p className="font-semibold text-foreground">Zonder proeftijd</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {connectedPriorContract
                          ? "Er is een aansluitend eerder contract bij dezelfde juridische werkgever; daarom wordt geen nieuwe proeftijd aangeboden."
                          : "De gekozen contractduur staat geen proeftijd toe."}
                      </p>
                    </div>
                    <Check className="h-4 w-4 text-primary" />
                  </button>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { value: "false", label: "Zonder proeftijd", description: "Het contract gaat direct in zonder proefperiode." },
                      { value: "true", label: "Met proeftijd", description: `Maximaal ${probationMonths} ${probationMonths === 1 ? "maand" : "maanden"}; de definitieve tekst volgt automatisch uit het sjabloon.` },
                    ].map(option => {
                      const selected = form.probation_agreed === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setProbationChoice(option.value)}
                          className={`flex min-h-16 items-center justify-between rounded-lg border px-4 py-3 text-left transition-all active:scale-[0.99] ${selected ? "border-primary bg-accent" : "border-border bg-card hover:border-primary hover:bg-accent"}`}
                        >
                          <div>
                            <p className="font-semibold text-foreground">{option.label}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                          </div>
                          {selected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {wizardStep === 9 && (
              <div className="space-y-5">
                {isArticle14Internship ? (
                  <Article14InternshipFields form={form} set={set} />
                ) : (
                  <>
                {isBblModel && <BblLearningFields form={form} set={set} />}
                <div>
                  <p className="text-sm font-medium text-foreground">Loon en arbeidsomvang</p>
                  <p className="mt-1 text-xs text-muted-foreground">De salaristabel en betaalperiode worden automatisch gekozen op basis van de CAO en contractstartdatum.</p>
                </div>
                {wageRows.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Schaal</span>
                      {wageScaleOptions.map(scale => (
                        <button
                          key={scale}
                          type="button"
                          onClick={() => setWageScaleFilter(scale)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${String(wageScaleFilter) === String(scale) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/40"}`}
                        >
                          Schaal {scale}
                        </button>
                      ))}
                    </div>
                    <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                      {visibleWageRows.map((row, index) => {
                        const selected = String(form.cao_scale) === String(row.scale) && String(form.cao_period) === String(row.period);
                        return (
                          <button
                            key={`${row.scale}-${row.period}-${index}`}
                            type="button"
                            onClick={() => selectWageRow(row)}
                            className={`flex min-h-14 items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${selected ? "border-primary bg-accent" : "border-border bg-card hover:border-primary hover:bg-accent"}`}
                          >
                            <div>
                              <p className="text-sm font-semibold text-foreground">Trede {row.period ?? "-"}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">{formatCurrency(row.hourlyRate)} per uur</p>
                            </div>
                            {selected ? <Check className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY && form.cao_function_group === "non_security_staff" ? (
                  <div className="max-w-sm space-y-1">
                    <Label>Bruto uurloon</Label>
                    <Input type="number" min="0" step="0.01" value={form.hourly_rate_snapshot ?? form.custom_hourly_rate ?? ""} onChange={event => {
                      set("hourly_rate_snapshot", event.target.value);
                      set("custom_hourly_rate", event.target.value);
                    }} />
                    <p className="text-xs text-muted-foreground">Voor deze niet-operationele functie geldt de CAO-functie- en salarisschaalindeling niet automatisch.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label>Loonschaal</Label>
                      <Input type="number" min="0" value={form.cao_scale ?? ""} onChange={event => set("cao_scale", event.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Trede / periodiek</Label>
                      <Input type="number" min="0" value={form.cao_period ?? ""} onChange={event => set("cao_period", event.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Uurloon snapshot</Label>
                      <Input type="number" min="0" step="0.01" value={form.hourly_rate_snapshot ?? form.custom_hourly_rate ?? ""} onChange={event => {
                        set("hourly_rate_snapshot", event.target.value);
                        set("custom_hourly_rate", event.target.value);
                      }} />
                    </div>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-3">
                  {isPbParttimeModel ? (
                    <>
                      <div className="space-y-1">
                        <Label>Vaste contracturen per loonperiode (4 weken)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="143.99"
                          step="0.25"
                          value={form.contract_hours_per_pay_period ?? ""}
                          onChange={event => setPbParttimePeriodHours(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          {isPbGrowthParttime
                            ? "Dit is de gegarandeerde vaste arbeidsduur. Extra inzet blijft gebonden aan de rooster- en urenregels van de cao."
                            : "Dit is de juridische arbeidsduur voor het vaste parttimemodel."}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/20 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {isPbGrowthParttime ? "Groeimodel" : "Gemiddeld per week"}
                        </p>
                        <p className="mt-1 text-sm text-foreground">{form.contract_hours_per_week || "-"} uur</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {isPbGrowthParttime
                            ? "Gemiddeld per week. Geen oproepcontract; boven 144 uur kan alleen met instemming worden gewerkt."
                            : "Automatisch: periode-uren gedeeld door vier."}
                        </p>
                      </div>
                      {isPbNonOperationalRole && (
                        <>
                          <div className="space-y-1">
                            <Label>Fulltime referentienorm per 4 weken</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.25"
                              value={form.fulltime_reference_hours_per_pay_period ?? ""}
                              onChange={event => setPbFulltimeReferencePeriodHours(event.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">Alleen nodig omdat 144 uur niet automatisch geldt voor niet-operationele functies.</p>
                          </div>
                          <div className="rounded-lg border border-border bg-muted/20 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fulltime norm per week</p>
                            <p className="mt-1 text-sm text-foreground">{form.fulltime_reference_hours_per_week || "-"} uur</p>
                            <p className="mt-1 text-xs text-muted-foreground">Automatisch afgeleid uit de bedrijfsnorm.</p>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {["fulltime", "parttime_fixed", "parttime_growth", "bbl"].includes(form.employment_contract_model) && (
                        <div className="space-y-1">
                          <Label>Uren per week</Label>
                          <Input type="number" min="0" value={form.contract_hours_per_week ?? ""} onChange={event => set("contract_hours_per_week", event.target.value)} />
                        </div>
                      )}
                      {["fulltime", "parttime_fixed", "parttime_growth", "bbl"].includes(form.employment_contract_model) && (
                        <div className="space-y-1">
                          <Label>Uren per loonperiode</Label>
                          <Input type="number" min="0" value={form.contract_hours_per_pay_period ?? ""} onChange={event => set("contract_hours_per_pay_period", event.target.value)} />
                        </div>
                      )}
                    </>
                  )}
                  {isPbMinMaxModel && (
                    <>
                      <div className="space-y-1">
                        <Label>Garantie-uren per loonperiode (4 weken)</Label>
                        <Input
                          type="number"
                          min="0.25"
                          max="143.75"
                          step="0.25"
                          value={form.min_hours_per_pay_period ?? ""}
                          onChange={event => setPbMinMaxPeriodHours("min_hours_per_pay_period", event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">Dit minimum wordt in iedere loonperiode betaald.</p>
                      </div>
                      <div className="space-y-1">
                        <Label>Maximumuren per loonperiode (4 weken)</Label>
                        <Input
                          type="number"
                          min="0.5"
                          max="144"
                          step="0.25"
                          value={form.max_hours_per_pay_period ?? ""}
                          onChange={event => setPbMinMaxPeriodHours("max_hours_per_pay_period", event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">Binnen dit maximum kan tijdig worden opgeroepen.</p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/20 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gemiddeld per week</p>
                        <p className="mt-1 text-sm text-foreground">
                          {form.min_hours_per_week || "-"} tot {form.max_hours_per_week || "-"} uur
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Automatisch afgeleid uit de vierweekse bandbreedte.</p>
                      </div>
                    </>
                  )}
                  {isPbZeroHoursModel && (
                    <div className="rounded-lg border border-border bg-muted/20 p-3 md:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Geen vaste arbeidsomvang</p>
                      <p className="mt-1 text-sm text-foreground">Geen vaste, minimum-, maximum- of garantie-uren</p>
                      <p className="mt-1 text-xs text-muted-foreground">De gewerkte en anderszins rechtens verschuldigde oproepuren worden per loonperiode betaald.</p>
                    </div>
                  )}
                  {isPbCallModel && (
                    <div className="space-y-1">
                      <Label>Oproepkanaal</Label>
                      <Select value={form.call_channel || "none"} onValueChange={value => set("call_channel", value === "none" ? "" : value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Kies oproepkanaal</SelectItem>
                          {CALL_CHANNEL_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Via dit kanaal wordt iedere oproep aantoonbaar verzonden.</p>
                    </div>
                  )}
                  {form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY ? (
                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Uitbetaling loon</p>
                      <p className="mt-1 text-sm text-foreground">Per loonperiode van vier weken</p>
                      <p className="mt-1 text-xs text-muted-foreground">Automatisch bepaald uit de CAO Particuliere Beveiliging.</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label>Uitbetaling loon</Label>
                      <Select value={form.salary_payment_frequency || "none"} onValueChange={value => set("salary_payment_frequency", value === "none" ? "" : value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Kies betaalperiode</SelectItem>
                          <SelectItem value="four_weeks">Per vier weken</SelectItem>
                          <SelectItem value="month">Per maand</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {futureStatutoryBandwidth && (
                    <div className="rounded-lg border border-emerald-300 bg-emerald-50/70 p-4 text-sm md:col-span-3 dark:border-emerald-700 dark:bg-emerald-950/20">
                      <p className="font-medium text-foreground">Wettelijk bandbreedtecontract</p>
                      <p className="mt-1 text-muted-foreground">De gekozen bandbreedte heeft een minimum boven nul en een maximum van ten hoogste 130% daarvan.</p>
                    </div>
                  )}
                  {futureCallRequiresException && (
                    <div className="space-y-4 rounded-lg border border-amber-300 bg-amber-50/70 p-4 md:col-span-3 dark:border-amber-700 dark:bg-amber-950/20">
                      <div>
                        <p className="font-medium text-foreground">Wettelijke uitzondering vereist</p>
                        <p className="mt-1 text-xs text-muted-foreground">Voor dit flexmodel vanaf 1 januari 2028 moet een geldige uitzonderingsgroep worden vastgelegd. De server controleert de combinatie en de maximale gemiddelde arbeidsduur.</p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <div className="space-y-1">
                          <Label>Uitzonderingsgroep</Label>
                          <Select value={form.call_contract_exception_profile || "none"} onValueChange={value => set("call_contract_exception_profile", value)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CALL_EXCEPTION_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>Gemiddeld aantal uren per week</Label>
                          <Input type="number" min="0" max="16" step="0.25" value={form.call_contract_exception_average_hours_per_week || ""} onChange={event => set("call_contract_exception_average_hours_per_week", event.target.value)} />
                        </div>
                        {form.call_contract_exception_profile === "minor" && (
                          <div className="rounded-lg border border-border bg-background/70 p-3 text-xs text-muted-foreground">De geboortedatum uit het medewerkersprofiel wordt automatisch gecontroleerd.</div>
                        )}
                        {["pupil", "student"].includes(form.call_contract_exception_profile) && (
                          <>
                            <div className="space-y-1">
                              <Label>Referentie inschrijvingsbewijs</Label>
                              <Input value={form.call_contract_exception_evidence_reference || ""} onChange={event => set("call_contract_exception_evidence_reference", event.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label>Bewijs geldig tot en met</Label>
                              <Input type="date" value={form.call_contract_exception_valid_until || ""} onChange={event => set("call_contract_exception_valid_until", event.target.value)} />
                            </div>
                          </>
                        )}
                        {form.call_contract_exception_profile === "aow" && (
                          <>
                            <button
                              type="button"
                              onClick={() => set("employee_already_receives_aow", form.employee_already_receives_aow === "true" ? "false" : "true")}
                              className={`flex min-h-10 items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${form.employee_already_receives_aow === "true" ? "border-primary bg-accent" : "border-border bg-card"}`}
                            >
                              Medewerker ontvangt AOW
                              {form.employee_already_receives_aow === "true" && <Check className="h-4 w-4 text-primary" />}
                            </button>
                            <div className="space-y-1">
                              <Label>AOW-datum</Label>
                              <Input type="date" value={form.employee_aow_date || ""} onChange={event => set("employee_aow_date", event.target.value)} />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  {isPbCallModel && (
                    <div className="space-y-3 rounded-lg border border-border p-4 md:col-span-3">
                      <div>
                        <Label>Referentiedagen en beschikbaarheid</Label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Leg vast op welke dagen en binnen welke tijdvakken de medewerker kan worden opgeroepen. Buiten deze vensters is de medewerker niet verplicht een oproep te aanvaarden. Deze beschikbaarheid is geen vaste arbeidsomvang.
                        </p>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-border">
                        {MIN_MAX_WEEKDAY_OPTIONS.map(day => {
                          const window = normalizeAvailabilityWindows(form.availability_windows)
                            .find(item => item.weekday === day.value);
                          return (
                            <div
                              key={day.value}
                              className="grid min-h-14 items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 sm:grid-cols-[140px_1fr_1fr_150px]"
                            >
                              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
                                <input
                                  type="checkbox"
                                  checked={!!window}
                                  onChange={() => toggleMinMaxAvailabilityDay(day.value)}
                                />
                                {day.label}
                              </label>
                              <Input
                                type="time"
                                aria-label={`Begintijd ${day.label}`}
                                value={window?.start_time || "09:00"}
                                disabled={!window}
                                onChange={event => updateMinMaxAvailabilityWindow(day.value, "start_time", event.target.value)}
                              />
                              <Input
                                type="time"
                                aria-label={`Eindtijd ${day.label}`}
                                value={window?.end_time || "17:00"}
                                disabled={!window}
                                onChange={event => updateMinMaxAvailabilityWindow(day.value, "end_time", event.target.value)}
                              />
                              <label className={`flex items-center gap-2 text-xs ${window ? "cursor-pointer text-muted-foreground" : "text-muted-foreground/50"}`}>
                                <input
                                  type="checkbox"
                                  checked={window?.crosses_midnight === true}
                                  disabled={!window}
                                  onChange={event => updateMinMaxAvailabilityWindow(day.value, "crosses_midnight", event.target.checked)}
                                />
                                Tot volgende dag
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                  </>
                )}
              </div>
            )}

            {wizardStep === 10 && (
              <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
                <div className="space-y-3">
                  {form.source_type === "generated" ? (
                    <section className="space-y-3 rounded-lg border border-border p-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Documentopmaak</p>
                        <p className="mt-1 text-xs text-muted-foreground">Kies het gepubliceerde sjabloon en briefpapier voor het definitieve contract.</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sjabloon</p>
                        {publishedTemplates.map(template => {
                          const selected = form.template_id === template.id;
                          return (
                            <button
                              key={template.id}
                              type="button"
                              onClick={() => set("template_id", template.id)}
                              className={`flex min-h-12 w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${selected ? "border-primary bg-accent" : "border-border bg-card hover:border-primary hover:bg-accent"}`}
                            >
                              <div>
                                <p className="text-sm font-medium text-foreground">{template.name}</p>
                                <p className="text-xs text-muted-foreground">Versie {template.version || 1}</p>
                              </div>
                              {selected ? <Check className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            </button>
                          );
                        })}
                        {publishedTemplates.length === 0 && <p className="text-sm text-amber-700">Geen gepubliceerd sjabloon gevonden voor deze combinatie van CAO, contractvorm, looptijd en proeftijd.</p>}
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Briefpapier</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => set("letterhead_id", null)}
                            className={`flex min-h-12 items-center justify-between rounded-lg border px-3 py-2 text-left ${!form.letterhead_id ? "border-primary bg-accent" : "border-border bg-card hover:border-primary hover:bg-accent"}`}
                          >
                            <span className="text-sm font-medium text-foreground">Zonder briefpapier</span>
                            {!form.letterhead_id && <Check className="h-4 w-4 text-primary" />}
                          </button>
                          {letterheadOptions.map(item => {
                            const selected = form.letterhead_id === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => set("letterhead_id", item.id)}
                                className={`flex min-h-12 items-center justify-between rounded-lg border px-3 py-2 text-left ${selected ? "border-primary bg-accent" : "border-border bg-card hover:border-primary hover:bg-accent"}`}
                              >
                                <span className="text-sm font-medium text-foreground">{item.name}{item.is_default ? " (standaard)" : ""}</span>
                                {selected && <Check className="h-4 w-4 text-primary" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </section>
                  ) : (
                    <section className="rounded-lg border border-border p-4">
                      <p className="text-sm font-semibold text-foreground">Geüpload contract</p>
                      <p className="mt-1 text-sm text-muted-foreground">{form.existing_contract_file?.name || "Het bestaande contractbestand is al gekoppeld."}</p>
                    </section>
                  )}
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Controle</p>
                    {missingFields.length === 0
                      && conflicts.issues.length === 0
                      && standardTemplateValidation.issues.length === 0
                      && unresolvedTemplatePlaceholders.length === 0 ? (
                      <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700">
                        <CheckCircle className="h-4 w-4" /> Contractbasis compleet.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2 text-sm text-amber-700">
                        {missingFields.length > 0 && <p>Ontbreekt: {missingFields.join(", ")}.</p>}
                        {conflicts.issues.map((issue, index) => <p key={index} className="text-destructive">{issue}</p>)}
                      </div>
                    )}
                    {standardTemplateValidation.issues.map((issue, index) => (
                      <p key={`template-issue-${index}`} className="mt-2 text-sm text-destructive">{issue}</p>
                    ))}
                    {unresolvedTemplatePlaceholders.length > 0 && (
                      <p className="mt-2 text-sm text-destructive">
                        Niet gekoppelde placeholders: {unresolvedTemplatePlaceholders.join(", ")}.
                      </p>
                    )}
                    {conflicts.warnings.map((warning, index) => (
                      <p key={index} className="mt-2 text-sm text-amber-700">{warning}</p>
                    ))}
                    {standardTemplateValidation.warnings.map((warning, index) => (
                      <p key={`template-warning-${index}`} className="mt-2 text-sm text-amber-700">{warning}</p>
                    ))}
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Juridische contractcontrole</p>
                        <p className="mt-1 text-xs text-muted-foreground">Servercontrole op keten, looptijd, functieconflicten, CAO-context en gezamenlijke contracturen.</p>
                      </div>
                      {contractEvaluationLoading ? (
                        <Badge variant="outline">Controleren...</Badge>
                      ) : contractEvaluation?.status === "compliant" ? (
                        <Badge className="bg-emerald-100 text-emerald-700">Gereed</Badge>
                      ) : contractEvaluation ? (
                        <Badge className="bg-amber-100 text-amber-700">Aandacht nodig</Badge>
                      ) : null}
                    </div>
                    {contractEvaluationError && (
                      <p className="mt-3 flex items-center gap-2 text-sm text-destructive">
                        <AlertTriangle className="h-4 w-4" /> {contractEvaluationError?.response?.data?.error || contractEvaluationError.message || "Controle kon niet worden uitgevoerd."}
                      </p>
                    )}
                    {contractEvaluation && (
                      <div className="mt-3 space-y-2 text-sm">
                        {contractEvaluation.chain?.status !== "not_applicable" && (
                          <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
                            <CalendarClock className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-foreground">Keten {contractEvaluation.chain?.position || "-"} van {contractEvaluation.chain?.contract_limit || "-"}</span>
                            <span className="text-muted-foreground">binnen {contractEvaluation.chain?.period_limit_months || "-"} maanden</span>
                          </div>
                        )}
                        {contractEvaluation.blocking_reasons?.map((reason, index) => (
                          <p key={`legal-block-${index}`} className="flex gap-2 text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {reason}</p>
                        ))}
                        {contractEvaluation.manual_review_reasons?.map((reason, index) => (
                          <p key={`legal-review-${index}`} className="flex gap-2 text-amber-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {reason}</p>
                        ))}
                        {contractEvaluation.warnings?.map((warning, index) => (
                          <p key={`legal-warning-${index}`} className="text-muted-foreground">{warning}</p>
                        ))}
                        {contractEvaluation.status === "compliant" && (
                          <p className="flex items-center gap-2 text-emerald-700"><CheckCircle className="h-4 w-4" /> Geen blokkades gevonden. Een gegenereerd document wordt pas actief na upload en controle van de getekende versie.</p>
                        )}
                      </div>
                    )}
                  </div>
                  {form.source_type === "generated" && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Vertegenwoordiger werkgever</Label>
                        <Input value={form.employer_representative_name || ""} onChange={event => set("employer_representative_name", event.target.value)} placeholder="Volledige naam" />
                      </div>
                      <div className="space-y-1">
                        <Label>Functie vertegenwoordiger</Label>
                        <Input value={form.employer_representative_function || ""} onChange={event => set("employer_representative_function", event.target.value)} placeholder="Bijv. directeur" />
                      </div>
                      <div className="space-y-1">
                        <Label>Plaats ondertekening</Label>
                        <Input value={form.signing_place || ""} onChange={event => set("signing_place", event.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Datum ondertekening</Label>
                        <Input type="date" value={form.signing_date || ""} onChange={event => set("signing_date", event.target.value)} />
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label>Interne notities</Label>
                    <Textarea rows={4} value={form.notes || ""} onChange={event => set("notes", event.target.value)} />
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Document</p>
                  {form.source_type === "generated" ? (
                    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{generatedPreview}</pre>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">{form.existing_contract_file?.name || "Geen nieuw bestand geselecteerd."}</p>
                  )}
                </div>
              </div>
            )}
              </motion.div></AnimatePresence></div>

          <div className="flex items-center justify-between border-t border-border p-4">
            {wizardStep > 1 && <Button type="button" variant="ghost" onClick={previousStep}><ChevronLeft className="mr-1 h-4 w-4" /> Terug</Button>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setWizardOpen(false)}>Annuleren</Button>
              {wizardStep < 10 ? (
                wizardStep > 2 && (<Button type="button" onClick={nextStep} disabled={!currentStepComplete}>
                  Volgende <ChevronRight className="ml-1 h-4 w-4" />
                </Button>)
              ) : (
                <Button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending
                    || contractEvaluationLoading
                    || missingFields.length > 0
                    || conflicts.issues.length > 0
                    || contractEvaluation?.status === "blocked"
                    || contractEvaluation?.status === "manual_review_required"
                    || (form.source_type === "generated" && (standardTemplateValidation.issues.length > 0 || unresolvedTemplatePlaceholders.length > 0))}
                >
                  <Save className="mr-1 h-4 w-4" /> {saveMutation.isPending ? "Opslaan..." : "Contract opslaan"}
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      <div className="overflow-x-auto">
      <div className="grid min-w-[1120px] grid-cols-[minmax(260px,1.6fr)_minmax(170px,1fr)_minmax(190px,1.1fr)_minmax(190px,1fr)_minmax(120px,.7fr)_270px] items-center border-b border-border bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="truncate">Contract / functie</span><span className="truncate">Bedrijf</span><span className="truncate">CAO / schaal</span><span className="truncate">Uren / model</span><span className="truncate">Door</span>
        <div className="flex items-center justify-end gap-2">
          {showArchive && <Badge className="bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 animate-pulse">Archief</Badge>}
          {showArchive ? <Button size="sm" variant="outline" onClick={() => setShowArchive(false)} className="h-7 px-2 text-xs whitespace-nowrap"><ChevronLeft className="w-3 h-3 mr-1" /> Actieve contracten</Button> : <Button size="sm" variant="outline" onClick={() => setShowArchive(true)} className="h-7 px-2 text-xs whitespace-nowrap"><Archive className="w-3 h-3 mr-1" /> Archief {archivedContracts.length > 0 ? `(${archivedContracts.length})` : ""}</Button>}
          {!showArchive && <Button size="sm" variant="outline" onClick={openNew} className="h-7 px-2 text-xs whitespace-nowrap"><Plus className="w-3 h-3 mr-1" /> Nieuw contract</Button>}
        </div>
      </div>
      {isLoading && <div className="p-6 text-sm text-muted-foreground">Contracten laden...</div>}
      {!isLoading && visibleContracts.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">{showArchive ? "Geen contracten in het archief." : "Nog geen contracten geregistreerd."}</div>}
      <div className="divide-y divide-border">
      {!isLoading && visibleContracts.map(contract => {
          const fileDescriptor = contractFileDescriptor(contract);
          const minPeriodHours = contract.min_hours_per_pay_period
            ?? (contract.min_hours_per_week !== null && contract.min_hours_per_week !== undefined ? Number(contract.min_hours_per_week) * 4 : null);
          const maxPeriodHours = contract.max_hours_per_pay_period
            ?? (contract.max_hours_per_week !== null && contract.max_hours_per_week !== undefined ? Number(contract.max_hours_per_week) * 4 : null);
          const persistedEmploymentModel = contract.employment_contract_model === "call_agreement"
            ? (contract.call_agreement_type === "min_max" || minPeriodHours !== null ? "min_max" : "zero_hours")
            : contract.employment_contract_model;
          const hoursLabel = persistedEmploymentModel === "zero_hours"
            ? "Geen vaste uren"
            : (persistedEmploymentModel === "min_max" && minPeriodHours !== null
              ? `Min-max ${minPeriodHours || "-"}-${maxPeriodHours || "-"} u/4 weken`
              : `${contract.contract_hours_per_week || contract.contract_hours_per_pay_period || "-"} u`);
          const contractTypeLabel = contract.legal_document_type === "internship_agreement" || persistedEmploymentModel === "internship"
            ? "Stageovereenkomst (BOL / re-integratie)"
            : (persistedEmploymentModel === "bbl"
              ? "Leerarbeidsovereenkomst (BBL)"
              : ({
                fulltime: "Fulltime dienstverband",
                parttime_fixed: "Parttime dienstverband",
                parttime_growth: "Parttime groeimodel",
                min_max: "Min-maxcontract",
                zero_hours: "Nulurencontract",
              }[persistedEmploymentModel] || CONTRACT_FORM_LABELS[contract.contract_form] || "Arbeidscontract"));
          return (
            <div
              key={contract.id}
              role="button"
              tabIndex={0}
              onClick={() => openPreview(contract)}
              onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") openPreview(contract);
              }}
              className="grid min-w-[1120px] w-full cursor-pointer grid-cols-[minmax(260px,1.6fr)_minmax(170px,1fr)_minmax(190px,1.1fr)_minmax(190px,1fr)_minmax(120px,.7fr)_270px] items-center px-4 py-4 text-left text-sm hover:bg-muted/30"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate font-semibold text-foreground">{contractTypeLabel}</p>
                  {showArchive && documentStatusBadge(contract.document_status)}
                  {contract.statutory_conversion_applies === true && <Badge className="shrink-0 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">Van rechtswege onbepaalde tijd</Badge>}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {(contract.function_assignments?.length
                    ? contract.function_assignments.map(item => item.function_label || readableFunctionLabel(item.function_key)).join(", ")
                    : readableFunctionLabel(contract.function_type)) || contract.cao_function_group || "Functie onbekend"}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {formatDate(contract.contract_start_date)}{effectiveEndForContract(contract) ? ` - ${formatDate(effectiveEndForContract(contract))}` : " - onbepaalde tijd"}
                </p>
              </div>
              <div className="truncate text-muted-foreground">{getCompanyLabel(companies, contract.company_id)}</div>
              <div className="truncate text-muted-foreground">{CAO_OPTION_LABELS[contract.cao_key] || contract.cao_key || "-"}{contract.cao_scale ? ` / ${contract.cao_scale}.${contract.cao_period || 0}` : ""}</div>
              <div className="truncate text-muted-foreground">{hoursLabel} · {EMPLOYMENT_MODEL_LABELS[persistedEmploymentModel] || persistedEmploymentModel || "-"}</div>
              <div className="truncate text-muted-foreground">{getAuditActorLabel(contract, auditActors)}</div>
              <div className="flex justify-end gap-1" onClick={event => event.stopPropagation()}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title={fileDescriptor ? "Contract bekijken" : "Concept bewerken"}
                  onClick={() => fileDescriptor ? openPreview(contract) : openEdit(contract)}
                >
                  {fileDescriptor ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                </Button>
                {["concept", "generated"].includes(contract.document_status) && (
                  <label
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Getekende versie uploaden"
                  >
                    {signedUploadMutation.isPending && signedUploadId === contract.id
                      ? <RefreshCw className="h-4 w-4 animate-spin" />
                      : <FileSignature className="h-4 w-4" />}
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      disabled={signedUploadMutation.isPending}
                      onChange={event => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        setSignedUploadId(contract.id);
                        signedUploadMutation.mutate({ contract, file });
                      }}
                    />
                  </label>
                )}
                {contract.document_status === "signed" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Juridische controle opnieuw uitvoeren"
                    disabled={lifecycleMutation.isPending}
                    onClick={() => lifecycleMutation.mutate({ action: "revalidate", contract })}
                  >
                    <RefreshCw className={`h-4 w-4 ${lifecycleMutation.isPending ? "animate-spin" : ""}`} />
                  </Button>
                )}
                {contract.document_status !== "archived" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="Contract archiveren"
                    disabled={lifecycleMutation.isPending}
                    onClick={() => {
                      if (window.confirm("Wilt u dit contract archiveren? Het wordt direct uitgesloten van planning en payroll.")) {
                        lifecycleMutation.mutate({ action: "archive", contract });
                      }
                    }}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </div>

      <ManagedFilePreviewDialog
        open={!!previewFile}
        onOpenChange={(open) => !open && setPreviewFile(null)}
        managedFileId={previewFile?.managedFileId}
        fileUrl={previewFile?.fileUrl}
        filename={previewFile?.filename}
        title={previewFile?.title || "Contract bekijken"}
      />
    </div>
  );
}