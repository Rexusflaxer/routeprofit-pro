import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  CAO_OPTIONS,
  FUNCTION_CATALOG_OPTIONS,
  functionLabel,
} from "@/lib/securityCaoCatalog";
import {
  CAO_PARTICULIERE_BEVEILIGING_KEY,
  PB_CAO_FUNCTION_GROUP_OPTIONS,
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
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Plus,
  Save,
  Upload,
  X,
} from "lucide-react";

const CAO_OPTION_LABELS = Object.fromEntries(CAO_OPTIONS.map(option => [option.value, option.label]));

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
  { value: "internship", label: "Stage" },
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
    default_hours: 40,
  },
  {
    value: "fulltime_indefinite",
    label: "Fulltime dienstverband - onbepaalde tijd",
    contract_form: "onbepaalde_tijd",
    duration_type: "indefinite",
    employment_model: "fulltime",
    default_hours: 40,
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
    label: "Stage - bepaalde tijd",
    contract_form: "stage",
    duration_type: "fixed",
    employment_model: "internship",
  },
  {
    value: "zzp_assignment",
    label: "Overeenkomst van opdracht (ZZP)",
    contract_form: "zzp",
    duration_type: "fixed",
    employment_model: "zzp",
  },
];

const CONTRACT_MODEL_LABELS = Object.fromEntries(CONTRACT_MODEL_OPTIONS.map(option => [option.value, option.label]));

const DURATION_OPTIONS = [
  { value: "1_month", label: "1 maand", months: 1 },
  { value: "2_months", label: "2 maanden", months: 2 },
  { value: "6_months", label: "6 maanden", months: 6 },
  { value: "7_months", label: "7 maanden", months: 7 },
  { value: "1_year", label: "1 jaar", months: 12 },
  { value: "2_years", label: "2 jaar", months: 24 },
  { value: "3_years", label: "3 jaar", months: 36 },
  { value: "free", label: "Vrij invullen", months: null },
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

const DOCUMENT_STATUS_LABELS = {
  concept: "Concept",
  generated: "Gegenereerd",
  signed: "Getekend",
  active: "Actief",
  archived: "Gearchiveerd",
  expired: "Verlopen",
};

const DOCUMENT_STATUS_STYLES = {
  concept: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  generated: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
  signed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
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

function inferContractModel(value) {
  if (value.contract_model) return value.contract_model;
  const hasMinMaxHours = value.min_hours_per_pay_period || value.max_hours_per_pay_period
    || value.min_hours_per_week || value.max_hours_per_week;
  const sourceEmploymentModel = value.employment_contract_model || "unknown";
  const employmentModel = sourceEmploymentModel === "call_agreement"
    ? (hasMinMaxHours || value.call_agreement_type === "min_max" ? "min_max" : "zero_hours")
    : sourceEmploymentModel;
  const durationType = value.duration_type || (value.contract_form === "onbepaalde_tijd" ? "indefinite" : "fixed");
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
  if (!caoKey) return FUNCTION_TYPES;
  const activeAssignments = (assignments || []).filter(assignment => isDateWithinOptionRange(assignment, referenceDate));
  const scopedAssignments = activeAssignments.filter(assignment => resolveAssignmentCaoKey(assignment, caoOptions) === caoKey);
  const configuredFunctions = uniqueValues(scopedAssignments.flatMap(assignment => assignment.applies_to_activities || []))
    .filter(value => value !== "all");
  const values = configuredFunctions.length > 0
    ? configuredFunctions
    : FUNCTION_TYPES.map(option => option.value);
  const withSelected = selectedValue && !values.includes(selectedValue)
    ? [...values, selectedValue]
    : values;
  return withSelected.map(value => ({ value, label: readableFunctionLabel(value) }));
}

function caoConfigurationLabel(option) {
  const label = option?.label || option?.display_name || option?.name || option?.cao_key || "CAO";
  const version = option?.version_label ? ` (${option.version_label})` : "";
  const validity = option?.valid_from || option?.valid_until
    ? ` | ${option.valid_from || "?"} t/m ${option.valid_until || "?"}`
    : "";
  return `${label}${version}${validity}`;
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

function selectedCaoConfigurationWarning(selectedOption, form) {
  if (!selectedOption) return null;
  const warnings = [];
  if (selectedOption.selectable === false) {
    warnings.push("Deze CAO-configuratie is niet actief en blijft zichtbaar omdat het contract hier al aan gekoppeld is.");
  }
  if (form.cao_key && selectedOption.cao_key && selectedOption.cao_key !== form.cao_key) {
    warnings.push(`Deze CAO-configuratie hoort bij ${selectedOption.cao_key}, niet bij ${form.cao_key}.`);
  }
  if (!isDateWithinOptionRange(selectedOption, form.contract_start_date)) {
    warnings.push("Deze CAO-configuratie is niet geldig op de contractstartdatum.");
  }
  return warnings.length > 0 ? warnings.join(" ") : null;
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
    source_type: "generated",
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
    contract_start_date: personnel.contract_start_date || "",
    contract_end_date: personnel.contract_end_date || "",
    work_location: "",
    work_area: "Nederland",
    employer_representative_name: "",
    employer_representative_function: "",
    signing_place: "",
    signing_date: new Date().toISOString().slice(0, 10),
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
    industry_seniority_pay_periods: personnel.industry_seniority_pay_periods ?? "",
    industry_start_date: personnel.industry_start_date || "",
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
    call_agreement_type: employmentModel === "min_max" ? "min_max" : (employmentModel === "zero_hours" ? "zero_hours" : "not_applicable"),
  });
  return {
    source_type: contract.source_type || (contract.generated_file_id ? "generated" : "uploaded_existing"),
    company_id: contract.company_id || null,
    cao_key: contract.cao_key || null,
    cao_configuration_id: contract.cao_configuration_id || null,
    contract_model: inferredModel,
    contract_form: contract.contract_form || "unknown",
    underlying_contract_form: contract.underlying_contract_form || null,
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
    industry_seniority_pay_periods: contract.industry_seniority_pay_periods ?? "",
    industry_start_date: contract.industry_start_date || "",
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
  if (!form.company_id) missing.push("bedrijf");
  if (!form.contract_model) missing.push("contractvorm");
  if (!form.probation_agreed || form.probation_agreed === "unknown") missing.push("proeftijdkeuze");
  if (form.probation_agreed === "true" && (!form.probation_context || form.probation_context === "unknown")) missing.push("context proeftijd");
  if (form.source_type === "generated" && !form.template_id) missing.push("contracttemplate");
  if (form.source_type === "uploaded_existing" && !form.existing_contract_file && !form.signed_file_id) missing.push("contractdocument");
  if (!form.cao_key && form.contract_form !== "zzp") missing.push("CAO");
  if (!form.contract_start_date) missing.push("startdatum");
  if (form.duration_type === "fixed" && !form.contract_end_date) missing.push("einddatum");
  if (!form.function_type && !form.cao_function_group && !form.cao_function_level) {
    missing.push("functiecontext");
  }
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
  if (["min_max", "zero_hours", "call_agreement"].includes(form.employment_contract_model)
    && normalizeAvailabilityWindows(form.availability_windows).length === 0) {
    missing.push("beschikbaarheidsvensters");
  }
  if (["min_max", "zero_hours", "call_agreement"].includes(form.employment_contract_model) && !form.call_channel) missing.push("oproepkanaal");
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

function functionContextKey(value) {
  return [
    value.company_id || "",
    value.function_type || "",
    value.cao_function_group || "",
    value.cao_function_level || "",
  ].join("|");
}

function isActiveContract(contract) {
  if (["archived", "expired", "concept", "generated"].includes(contract.document_status)) return false;
  return contract.is_current !== false || ["active", "signed"].includes(contract.document_status);
}

function validateConflicts(form, contracts, editingId) {
  const issues = [];
  const warnings = [];
  if (!form.company_id || !form.contract_start_date) return { issues, warnings };

  const nextContext = functionContextKey(form);
  const activeCandidates = (contracts || []).filter(contract => contract.id !== editingId && isActiveContract(contract));
  activeCandidates.forEach(contract => {
    if (contract.company_id !== form.company_id) return;
    if (!rangesOverlap(form.contract_start_date, form.contract_end_date, contract.contract_start_date, contract.contract_end_date)) return;
    if (functionContextKey(contract) === nextContext) {
      issues.push(`Overlap met actief contract bij ${contract.contract_start_date || "?"}${contract.contract_end_date ? ` t/m ${contract.contract_end_date}` : ""} voor dezelfde functiecontext.`);
      return;
    }
    warnings.push("Deze medewerker heeft in dezelfde periode al een actief contract bij dit bedrijf met een andere functiecontext. Controleer of planning/payroll dit bewust zo moet verwerken.");
  });

  return { issues, warnings };
}

function buildContractPayload(personnel, form, currentUser, auditActors, previous = {}) {
  const missing = getMissingContractFields(form);
  const contextReady = missing.length === 0;
  const generated = form.source_type === "generated";
  const uploadedExisting = form.source_type === "uploaded_existing";
  const activeUploadedContract = uploadedExisting && contextReady;
  const documentStatus = generated ? "generated" : (activeUploadedContract ? "active" : "concept");
  const allowedFunctionTypes = fromArrayText(form.allowed_function_types_text);
  const allowedGroups = fromArrayText(form.allowed_cao_function_groups_text);
  const allowedLevels = fromArrayText(form.allowed_cao_function_levels_text);
  const employmentModel = normalizedEmploymentModel(form);
  const isCallAgreement = ["zero_hours", "min_max"].includes(employmentModel);
  const hasFixedHours = ["fulltime", "parttime_fixed", "parttime_growth"].includes(employmentModel);
  const isMinMax = employmentModel === "min_max";
  const fixedHoursOfferDueAt = isCallAgreement ? addMonths(form.contract_start_date, 12) : null;
  const fixedHoursOfferDeadlineAt = isCallAgreement ? addMonths(form.contract_start_date, 13) : null;

  return {
    personnel_id: personnel.id,
    company_id: form.company_id || null,
    source_type: form.source_type || "generated",
    template_id: generated ? form.template_id || null : null,
    template_version: generated ? numberOrNull(form.template_version) : null,
    letterhead_id: generated ? form.letterhead_id || null : null,
    document_status: documentStatus,
    cao_key: form.cao_key || null,
    cao_configuration_id: form.cao_configuration_id || null,
    contract_model: form.contract_model || null,
    contract_form: form.contract_form || "unknown",
    underlying_contract_form: form.contract_form === "oproep" ? (form.underlying_contract_form || "unknown") : null,
    employment_contract_model: employmentModel,
    parttime_contract_model: parttimeModel(form),
    probation_agreed: form.probation_agreed === "not_applicable" ? null : boolOrNull(form.probation_agreed),
    probation_context: form.probation_agreed === "true" ? (form.probation_context || "unknown") : "not_applicable",
    duration_type: form.duration_type || null,
    duration_option: form.duration_option || null,
    duration_label: durationLabel(form.duration_option),
    contract_start_date: form.contract_start_date || null,
    contract_end_date: form.contract_end_date || null,
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
    written_scale_period_notice_confirmed: boolOrNull(form.written_scale_period_notice_confirmed),
    periodic_increase_due_confirmed: boolOrNull(form.periodic_increase_due_confirmed),
    function_type: form.function_type || null,
    allowed_function_types: allowedFunctionTypes,
    cao_function_group: form.cao_function_group || null,
    allowed_cao_function_groups: allowedGroups,
    cao_function_level: form.cao_function_level || null,
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
    is_call_agreement: isCallAgreement,
    call_agreement_type: isMinMax ? "min_max" : (employmentModel === "zero_hours" ? "zero_hours" : "not_applicable"),
    call_notice_days: isCallAgreement ? 4 : null,
    employee_notice_days: employmentModel === "zero_hours" ? 4 : null,
    no_work_no_pay_first_6_months: employmentModel === "zero_hours"
      ? false
      : previous.no_work_no_pay_first_6_months === true,
    payslip_call_agreement_indicator_required: isCallAgreement,
    fixed_hours_offer_due_at: fixedHoursOfferDueAt,
    fixed_hours_offer_deadline_at: fixedHoursOfferDeadlineAt,
    fixed_hours_offer_status: isCallAgreement ? (previous.fixed_hours_offer_status || "not_due") : null,
    industry_seniority_pay_periods: numberOrNull(form.industry_seniority_pay_periods),
    industry_start_date: form.industry_start_date || null,
    contract_context_status: contextReady ? "context_ready" : "draft_missing_context",
    contract_context_missing_fields: missing,
    contract_context_checked_at: new Date().toISOString(),
    cao_contract_rule_status: contextReady ? "unknown" : "blocked",
    planning_allowed: false,
    contract_final_allowed: activeUploadedContract,
    payroll_final_allowed: false,
    is_current: activeUploadedContract,
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
  const fallbackBody = [
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
  const paragraphGap = 7;
  const title = template?.name || "Arbeidsovereenkomst";
  const body = renderContractBody(personnel, form, company, template, clauses);
  const values = contractRenderValues(personnel, form, company);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, 64);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(values.companyName, margin, 84);
  if (letterhead?.name) doc.text(`Briefpapier: ${letterhead.name}`, margin, 98);
  doc.setFontSize(10);
  let y = 132;
  const paragraphs = body.split(/\n{2,}/).map(paragraph => paragraph.trim()).filter(Boolean);
  const paragraphLines = paragraphs.map(paragraph => doc.splitTextToSize(paragraph, 486));

  paragraphLines.forEach((lines, index) => {
    const isArticleHeading = /^Artikel\s+\d+\b/i.test(paragraphs[index]);
    const ownHeight = lines.length * lineHeight + paragraphGap;
    const nextHeight = isArticleHeading && paragraphLines[index + 1]
      ? paragraphLines[index + 1].length * lineHeight + paragraphGap
      : 0;
    if (y > continuationTop && y + ownHeight + nextHeight > pageBottom) {
      doc.addPage();
      y = continuationTop;
    }

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
  const safeName = `${values.employeeName.replace(/[^\w.-]+/g, "_")}_arbeidsovereenkomst_${form.contract_start_date || "concept"}.pdf`;
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

export default function PersonnelContractsTab({ personnel, companies = [] }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [form, setForm] = useState(() => initialForm(personnel));
  const [previewFile, setPreviewFile] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);

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

  const companyIds = useMemo(() => uniqueValues([
    form.company_id,
    ...companies.map(company => company.id),
    ...contracts.map(contract => contract.company_id),
  ].filter(Boolean)), [companies, contracts, form.company_id]);

  const selectedCaoConfigurationIds = useMemo(() => uniqueValues([
    personnel.cao_configuration_id,
    form.cao_configuration_id,
    ...contracts.map(contract => contract.cao_configuration_id)
  ]), [contracts, form.cao_configuration_id, personnel.cao_configuration_id]);

  const { data: caoConfigurationOptions = [] } = useQuery({
    queryKey: ["cao-configuration-options", "personnel-contracts", personnel.id, selectedCaoConfigurationIds],
    queryFn: async () => {
      const { data } = await base44.functions.invoke("listCaoConfigurationOptions", {
        include_ids: selectedCaoConfigurationIds,
      });
      return data?.options || [];
    },
  });

  const { data: companyCaoAssignments = [], isLoading: companyCaoAssignmentsLoading } = useQuery({
    queryKey: ["company-cao-assignments", form.company_id],
    queryFn: () => base44.entities.CompanyCaoAssignment.filter({ company_id: form.company_id }, "-created_date"),
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
    const allowed = Array.isArray(selectedTemplate?.duration_options) ? selectedTemplate.duration_options : [];
    if (allowed.length === 0) return DURATION_OPTIONS;
    return DURATION_OPTIONS.filter(option => allowed.includes(option.value));
  }, [selectedTemplate]);
  const selectedLetterhead = letterheadOptions.find(item => item.id === form.letterhead_id) || null;
  const selectedTemplateClauses = useMemo(() => (contractClauses || [])
    .filter(clause => clause.company_id === form.company_id && clause.status !== "archived"),
  [contractClauses, form.company_id]);
  const selectedContractModel = getContractModel(form.contract_model);
  const wageTableYear = getYear(form.contract_start_date || new Date());
  const companyCaoKeyOptions = useMemo(
    () => buildCompanyCaoKeyOptions(companyCaoAssignments, form.contract_start_date, caoConfigurationOptions),
    [caoConfigurationOptions, companyCaoAssignments, form.contract_start_date]
  );
  const companyFunctionOptions = useMemo(
    () => buildCompanyFunctionOptions(companyCaoAssignments, form.contract_start_date, form.cao_key, caoConfigurationOptions, form.function_type),
    [caoConfigurationOptions, companyCaoAssignments, form.cao_key, form.contract_start_date, form.function_type]
  );
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
  const selectedCaoConfiguration = caoConfigurationOptions.find(option => option.id === form.cao_configuration_id) || null;
  const effectiveCaoConfiguration = selectedCaoConfiguration || visibleCaoConfigurationOptions[0] || null;
  const caoConfigurationSelectionWarning = selectedCaoConfigurationWarning(selectedCaoConfiguration, form);
  const wageRows = useMemo(() => {
    const rows = extractWageRows(effectiveCaoConfiguration, wageTableYear);
    if (form.cao_key !== CAO_PARTICULIERE_BEVEILIGING_KEY) return rows;
    if (form.cao_function_group === "non_security_staff") return [];
    if (!expectedPbSalaryScale) return rows;
    return rows.filter(row => Number(row.scale) === expectedPbSalaryScale);
  }, [effectiveCaoConfiguration, expectedPbSalaryScale, form.cao_function_group, form.cao_key, wageTableYear]);
  const conflicts = validateConflicts(form, contracts, editingId);
  const missingFields = getMissingContractFields(form);
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

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const setCaoKey = (value) => setForm(prev => {
    const next = {
      ...prev,
      cao_key: value,
      cao_configuration_id: null,
      template_id: null,
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
      } else if (model?.default_hours && !next.contract_hours_per_week) {
        next.contract_hours_per_week = String(model.default_hours);
      }
      if (model?.duration_type === "indefinite") {
        next.contract_end_date = "";
        next.duration_option = "";
      }
      if (["internship", "zzp"].includes(model?.employment_model)) next.probation_agreed = "not_applicable";
      return next;
    });
  };

  const setDurationOption = (value) => {
    setForm(prev => {
      const option = DURATION_OPTIONS.find(item => item.value === value);
      return {
        ...prev,
        duration_option: value,
        contract_end_date: option?.months ? addMonthsMinusOneDay(prev.contract_start_date, option.months) : prev.contract_end_date,
      };
    });
  };

  const setProbationChoice = (value) => {
    setForm(prev => ({
      ...prev,
      probation_agreed: value,
      probation_context: value === "true"
        ? (prev.probation_context === "not_applicable" ? "unknown" : prev.probation_context)
        : "not_applicable",
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
    }));
  };

  const selectPrimaryFunction = (value) => {
    const nextValue = value === "none" ? null : value;
    setForm(prev => {
      const functions = uniqueValues([nextValue, ...fromArrayText(prev.allowed_function_types_text)]);
      const suggestedGroup = prev.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY
        ? suggestPbCaoFunctionGroup(nextValue)
        : "";
      return {
        ...prev,
        function_type: nextValue,
        allowed_function_types_text: functions.join(", "),
        cao_function_group: suggestedGroup || prev.cao_function_group,
        performs_security_work: suggestedGroup
          ? (suggestedGroup === "non_security_staff" ? "false" : "true")
          : prev.performs_security_work,
        salary_payment_frequency: suggestedGroup && suggestedGroup !== "non_security_staff"
          ? "four_weeks"
          : prev.salary_payment_frequency,
        cao_function_level: suggestedGroup === "non_security_staff" ? "not_applicable" : prev.cao_function_level,
        cao_scale: suggestedGroup === "non_security_staff" ? "" : prev.cao_scale,
        cao_period: suggestedGroup === "non_security_staff" ? "" : prev.cao_period,
      };
    });
  };

  const selectPbFunctionLevel = (value) => {
    const nextValue = value === "none" ? null : value;
    const expectedScale = pbSalaryScaleForFunctionLevel(nextValue);
    setForm(prev => ({
      ...prev,
      cao_function_level: nextValue,
      cao_scale: expectedScale ?? "",
      cao_period: expectedScale === Number(prev.cao_scale) ? prev.cao_period : "",
      hourly_rate_snapshot: expectedScale === Number(prev.cao_scale) ? prev.hourly_rate_snapshot : "",
      custom_hourly_rate: expectedScale === Number(prev.cao_scale) ? prev.custom_hourly_rate : "",
    }));
  };

  const toggleAllowedFunction = (value) => {
    setForm(prev => {
      const selected = new Set(fromArrayText(prev.allowed_function_types_text));
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
      if (prev.function_type) selected.add(prev.function_type);
      return { ...prev, allowed_function_types_text: [...selected].join(", ") };
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
        template_version: selectedTemplate?.version || null,
        template_name_snapshot: selectedTemplate?.name || null,
        letterhead_name_snapshot: selectedLetterhead?.name || null,
        wage_table_year: form.wage_table_year || wageTableYear,
        signed_file_id: previous.signed_file_id || null,
      }, currentUser, auditActors, previous);
      let record = editingId
        ? await base44.entities.PersonnelContract.update(editingId, payload)
        : await base44.entities.PersonnelContract.create(payload);

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
          documentLabel: selectedTemplate?.name || "Arbeidsovereenkomst",
          validFrom: form.contract_start_date || null,
          validUntil: form.contract_end_date || null,
          isSensitive: true,
          uploadedBy: currentUser,
          auditActors,
          auditAction: editingId ? "gegenereerd bijgewerkt" : "gegenereerd",
          folderSegments: ["contracten"],
        });
        record = await base44.entities.PersonnelContract.update(record.id, {
          generated_file_url: result.file_url,
          generated_file_id: result.managed_file_id,
          generated_download_filename: result.download_filename,
          generated_logical_path: result.logical_path,
          document_status: "generated",
          is_current: false,
          metadata: buildAuditMetadata(currentUser, "gegenereerd", record.metadata || {}, auditActors),
        });
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
        record = await base44.entities.PersonnelContract.update(record.id, {
          signed_file_url: result.file_url,
          signed_file_id: result.managed_file_id,
          signed_download_filename: result.download_filename,
          signed_logical_path: result.logical_path,
          document_status: missingFields.length === 0 ? "active" : "concept",
          is_current: missingFields.length === 0,
          contract_final_allowed: missingFields.length === 0,
          metadata: buildAuditMetadata(currentUser, "contractdocument toegevoegd", record.metadata || {}, auditActors),
        });
      }

      return record;
    },
    onSuccess: () => {
      setWizardOpen(false);
      setWizardStep(1);
      setEditingId(null);
      setForm(initialForm(personnel));
      setActionMessage({ type: "success", text: "Contract opgeslagen." });
      refresh();
    },
    onError: (error) => {
      setActionMessage({ type: "error", text: error?.message || "Contract kon niet worden opgeslagen." });
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

  const nextStep = () => setWizardStep(step => Math.min(step + 1, 6));
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
    if (!wizardOpen || form.duration_type !== "fixed" || !form.duration_option || form.duration_option === "free" || !form.contract_start_date) return;
    const option = DURATION_OPTIONS.find(item => item.value === form.duration_option);
    const nextEndDate = option?.months ? addMonthsMinusOneDay(form.contract_start_date, option.months) : "";
    if (nextEndDate && nextEndDate !== form.contract_end_date) set("contract_end_date", nextEndDate);
  }, [wizardOpen, form.duration_type, form.duration_option, form.contract_start_date, form.contract_end_date]);

  const stepItems = ["Bedrijf", "CAO", "Contractvorm", "Periode & functie", "Loon & uren", "Controle"];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Contracten</p>
          <p className="text-sm text-muted-foreground">Arbeidscontracten en contractdocumenten voor planning en payroll.</p>
        </div>
        <Button type="button" onClick={openNew} size="sm">
          <Plus className="mr-1 h-4 w-4" /> Nieuw contract
        </Button>
      </div>

      {actionMessage && (
        <div className={`rounded-lg border p-3 text-sm ${actionMessage.type === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"}`}>
          {actionMessage.text}
        </div>
      )}

      {wizardOpen && (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{editingId ? "Contract bewerken" : "Nieuw arbeidscontract"}</p>
                <p className="text-xs text-muted-foreground">Stap {wizardStep} van 6: {stepItems[wizardStep - 1]}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setWizardOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-6 gap-2">
              {stepItems.map((item, index) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setWizardStep(index + 1)}
                  className={`h-1.5 rounded-full transition-colors ${wizardStep >= index + 1 ? "bg-primary" : "bg-muted"}`}
                  aria-label={item}
                />
              ))}
            </div>
          </div>

          <div className="p-4">
            {wizardStep === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Kies het bedrijf waarmee deze medewerker het contract aangaat. De CAO's en sjablonen worden daarna hierop gefilterd.</p>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {companies.map(company => (
                    <button
                      key={company.id}
                      type="button"
                      onClick={() => setCompanyId(company.id)}
                      className={`rounded-lg border p-4 text-left transition-colors ${form.company_id === company.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
                    >
                      <p className="font-semibold text-foreground">{company.display_name || company.legal_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{company.legal_name && company.display_name !== company.legal_name ? company.legal_name : company.city || "Bedrijf"}</p>
                    </button>
                  ))}
                </div>
                {companies.length === 0 && <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Er zijn nog geen bedrijven beschikbaar voor dit contract.</p>}
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{selectedCompany?.display_name || selectedCompany?.legal_name || "Geen bedrijf geselecteerd"}</p>
                  <p className="text-xs text-muted-foreground">Alleen CAO's die in het bedrijfsprofiel aan dit bedrijf zijn gekoppeld worden getoond.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {companyCaoKeyOptions.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCaoKey(option.value)}
                      className={`rounded-lg border p-4 text-left transition-colors ${form.cao_key === option.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
                    >
                      <p className="font-semibold text-foreground">{option.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{option.assignment_count} bedrijfsconfiguratie{option.assignment_count === 1 ? "" : "s"}</p>
                    </button>
                  ))}
                </div>
                {form.company_id && !companyCaoAssignmentsLoading && companyCaoKeyOptions.length === 0 && (
                  <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    Dit bedrijf heeft nog geen actieve CAO-koppeling voor de gekozen contractdatum. Voeg deze eerst toe in het bedrijfsprofiel.
                  </p>
                )}
                <div className="max-w-xl space-y-1">
                  <Label>CAO-configuratie</Label>
                  <Select value={form.cao_configuration_id || "auto"} onValueChange={value => set("cao_configuration_id", value === "auto" ? null : value)}>
                    <SelectTrigger><SelectValue placeholder="Automatisch bepalen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Automatisch bepalen</SelectItem>
                      {visibleCaoConfigurationOptions.map(option => (
                        <SelectItem key={option.id} value={option.id} disabled={option.selectable === false}>
                          {caoConfigurationLabel(option)}{option.selectable === false ? " (niet actief)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {caoConfigurationSelectionWarning && <p className="text-xs text-amber-700">{caoConfigurationSelectionWarning}</p>}
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {CONTRACT_MODEL_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setContractModel(option.value)}
                      className={`rounded-lg border p-4 text-left transition-colors ${form.contract_model === option.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
                    >
                      <p className="font-semibold text-foreground">{option.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{CONTRACT_FORM_LABELS[option.contract_form] || option.contract_form} · {EMPLOYMENT_MODEL_LABELS[option.employment_model] || option.employment_model}</p>
                    </button>
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                  <div className="space-y-2">
                    <Label>Proeftijd</Label>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {[
                        ["true", "Met proeftijd"],
                        ["false", "Zonder proeftijd"],
                        ["not_applicable", "Niet van toepassing"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setProbationChoice(value)}
                          className={`rounded-lg border px-3 py-2 text-sm ${form.probation_agreed === value ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {form.probation_agreed === "true" && (
                      <div className="space-y-1 pt-2">
                        <Label>Is eerder vergelijkbaar werk verricht?</Label>
                        <Select value={form.probation_context || "unknown"} onValueChange={value => set("probation_context", value)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unknown">Kies de situatie</SelectItem>
                            <SelectItem value="first_contract">Nee, dit is het eerste contract</SelectItem>
                            <SelectItem value="successive_same_work">Ja, hetzelfde of vergelijkbaar werk</SelectItem>
                            <SelectItem value="successive_new_skills">Ja, maar de functie vraagt wezenlijk andere vaardigheden</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Ook eerder werk via een uitzend-, payroll- of andere opvolgende werkgever kan hierbij meetellen.</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Documentbron</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        ["generated", "Genereren uit sjabloon"],
                        ["uploaded_existing", "Oud contract uploaden"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => set("source_type", value)}
                          className={`rounded-lg border px-3 py-2 text-sm ${form.source_type === value ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {form.source_type === "generated" && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Sjabloon</Label>
                      <Select value={form.template_id || "none"} onValueChange={value => set("template_id", value === "none" ? null : value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Kies sjabloon</SelectItem>
                          {publishedTemplates.map(template => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name} v{template.version || 1}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {form.company_id && publishedTemplates.length === 0 && (
                        <p className="text-xs text-amber-700">Geen gepubliceerd sjabloon gevonden voor deze contractvorm/proeftijd.</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>Briefpapier</Label>
                      <Select value={form.letterhead_id || "none"} onValueChange={value => set("letterhead_id", value === "none" ? null : value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Geen briefpapier</SelectItem>
                          {letterheadOptions.map(item => (
                            <SelectItem key={item.id} value={item.id}>{item.name}{item.is_default ? " (standaard)" : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {wizardStep === 4 && (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1">
                  <Label>Startdatum</Label>
                  <Input type="date" value={form.contract_start_date || ""} onChange={event => set("contract_start_date", event.target.value)} />
                </div>
                {selectedContractModel?.duration_type === "fixed" && (
                  <>
                    <div className="space-y-1">
                      <Label>Duur</Label>
                      <Select value={form.duration_option || "free"} onValueChange={setDurationOption}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {selectableDurationOptions.map(option => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Einddatum</Label>
                      <Input type="date" value={form.contract_end_date || ""} onChange={event => set("contract_end_date", event.target.value)} disabled={form.duration_option && form.duration_option !== "free"} />
                    </div>
                  </>
                )}
                {selectedContractModel?.duration_type === "indefinite" && (
                  <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                    Onbepaalde tijd: er wordt geen einddatum gevraagd.
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Functietype</Label>
                  <Select value={form.function_type || "none"} onValueChange={selectPrimaryFunction}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Kies functie</SelectItem>
                      {companyFunctionOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>CAO-functiegroep</Label>
                  {form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY ? (
                    <Select value={form.cao_function_group || "none"} onValueChange={value => set("cao_function_group", value === "none" ? null : value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Kies functiegroep</SelectItem>
                        {PB_CAO_FUNCTION_GROUP_OPTIONS.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={form.cao_function_group || ""} onChange={event => set("cao_function_group", event.target.value || null)} placeholder="CAO-functiegroep" />
                  )}
                </div>
                <div className="space-y-1">
                  <Label>CAO-functieniveau</Label>
                  {form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY ? (
                    <Select value={form.cao_function_level || "none"} onValueChange={selectPbFunctionLevel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Kies functieniveau</SelectItem>
                        {PB_CAO_FUNCTION_LEVEL_OPTIONS.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={form.cao_function_level || ""} onChange={event => set("cao_function_level", event.target.value || null)} placeholder="CAO-functieniveau" />
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Standplaats</Label>
                  <Input value={form.work_location || ""} onChange={event => set("work_location", event.target.value)} placeholder="Vestiging of primaire werkplek" />
                </div>
                <div className="space-y-1">
                  <Label>Werkgebied</Label>
                  <Input value={form.work_area || ""} onChange={event => set("work_area", event.target.value)} placeholder="Bijv. Nederland of regio Midden" />
                </div>
                <div className="space-y-2 md:col-span-2 xl:col-span-3">
                  <Label>Functies binnen deze arbeidsovereenkomst</Label>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {companyFunctionOptions.map(option => {
                      const selected = selectedFunctionValues.includes(option.value);
                      const primary = form.function_type === option.value;
                      return (
                        <label
                          key={option.value}
                          className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm ${selected ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground"} ${primary ? "cursor-default" : "cursor-pointer hover:bg-muted/40"}`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={primary}
                            onChange={() => toggleAllowedFunction(option.value)}
                          />
                          <span className="min-w-0 flex-1 truncate">{option.label}</span>
                          {primary && <Badge variant="outline" className="text-[10px]">Hoofd</Badge>}
                        </label>
                      );
                    })}
                  </div>
                  {form.cao_key === CAO_PARTICULIERE_BEVEILIGING_KEY && selectedPbFunctionGroups.length > 1 && (
                    <p className="text-xs text-amber-700">
                      Meerdere CAO-functiegroepen geselecteerd. De gekozen hoofdfunctiegroep moet aansluiten op de werkzaamheden die ten minste 50% van de arbeidsduur beslaan.
                    </p>
                  )}
                </div>
              </div>
            )}

            {wizardStep === 5 && (
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-medium text-foreground">Salaristabel {wageTableYear}</p>
                  <p className="text-xs text-muted-foreground">Alleen de lonen uit het jaar van de contractstartdatum worden getoond.</p>
                </div>
                {wageRows.length > 0 ? (
                  <div className="overflow-hidden rounded-lg border border-border">
                    <div className="grid grid-cols-[1fr_1fr_1fr_1fr] bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <div>Schaal</div>
                      <div>Trede</div>
                      <div>Uurloon</div>
                      <div />
                    </div>
                    {wageRows.map((row, index) => {
                      const selected = String(form.cao_scale) === String(row.scale) && String(form.cao_period) === String(row.period);
                      return (
                        <button
                          key={`${row.scale}-${row.period}-${index}`}
                          type="button"
                          onClick={() => selectWageRow(row)}
                          className={`grid w-full grid-cols-[1fr_1fr_1fr_1fr] px-3 py-2 text-left text-sm hover:bg-muted/40 ${selected ? "bg-primary/5 text-primary" : ""}`}
                        >
                          <div>{row.scale ?? "-"}</div>
                          <div>{row.period ?? "-"}</div>
                          <div>{formatCurrency(row.hourlyRate)}</div>
                          <div className="text-right">{selected ? "Geselecteerd" : "Kies"}</div>
                        </button>
                      );
                    })}
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
                      {["fulltime", "parttime_fixed", "parttime_growth"].includes(form.employment_contract_model) && (
                        <div className="space-y-1">
                          <Label>Uren per week</Label>
                          <Input type="number" min="0" value={form.contract_hours_per_week ?? ""} onChange={event => set("contract_hours_per_week", event.target.value)} />
                        </div>
                      )}
                      {["fulltime", "parttime_fixed", "parttime_growth"].includes(form.employment_contract_model) && (
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
                  <div className="space-y-1">
                    <Label>Schaal schriftelijk bevestigd</Label>
                    <Select value={form.written_scale_period_notice_confirmed || "unknown"} onValueChange={value => set("written_scale_period_notice_confirmed", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unknown">Nog niet vastgelegd</SelectItem>
                        <SelectItem value="true">Ja</SelectItem>
                        <SelectItem value="false">Nee</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
              </div>
            )}

            {wizardStep === 6 && (
              <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
                <div className="space-y-3">
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
                  {form.source_type === "uploaded_existing" && (
                    <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center hover:bg-muted/40">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="mt-2 text-sm font-medium">{form.existing_contract_file?.name || "Klik om bestaand contract te uploaden"}</span>
                      <span className="text-xs text-muted-foreground">PDF, JPG of PNG</span>
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        className="hidden"
                        onChange={event => set("existing_contract_file", event.target.files?.[0] || null)}
                      />
                    </label>
                  )}
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
          </div>

          <div className="flex items-center justify-between border-t border-border p-4">
            <Button type="button" variant="ghost" onClick={previousStep} disabled={wizardStep === 1}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Terug
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setWizardOpen(false)}>Annuleren</Button>
              {wizardStep < 6 ? (
                <Button type="button" onClick={nextStep}>
                  Volgende <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending
                    || conflicts.issues.length > 0
                    || (form.source_type === "generated" && (standardTemplateValidation.issues.length > 0 || unresolvedTemplatePlaceholders.length > 0))}
                >
                  <Save className="mr-1 h-4 w-4" /> {saveMutation.isPending ? "Opslaan..." : "Contract opslaan"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-[minmax(220px,1.4fr)_minmax(160px,1fr)_minmax(150px,.9fr)_minmax(150px,.8fr)_minmax(140px,.8fr)_minmax(120px,.7fr)_minmax(130px,.8fr)_44px] border-b border-border bg-muted/30 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Contract / functie</div>
          <div>Bedrijf</div>
          <div>Periode</div>
          <div>CAO / schaal</div>
          <div>Uren / model</div>
          <div>Status</div>
          <div>Door</div>
          <div />
        </div>
        {isLoading && <div className="p-6 text-sm text-muted-foreground">Contracten laden...</div>}
        {!isLoading && sortedContracts.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">Nog geen arbeidscontracten vastgelegd.</div>
        )}
        {!isLoading && sortedContracts.map(contract => {
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
          return (
            <button
              key={contract.id}
              type="button"
              onClick={() => openPreview(contract)}
              className="grid w-full grid-cols-[minmax(220px,1.4fr)_minmax(160px,1fr)_minmax(150px,.9fr)_minmax(150px,.8fr)_minmax(140px,.8fr)_minmax(120px,.7fr)_minmax(130px,.8fr)_44px] items-center border-b border-border px-4 py-4 text-left text-sm last:border-b-0 hover:bg-muted/30"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{CONTRACT_FORM_LABELS[contract.contract_form] || "Arbeidscontract"}</p>
                <p className="truncate text-xs text-muted-foreground">{readableFunctionLabel(contract.function_type) || contract.cao_function_group || "Functie onbekend"}</p>
              </div>
              <div className="truncate text-muted-foreground">{getCompanyLabel(companies, contract.company_id)}</div>
              <div className="truncate text-muted-foreground">{formatDate(contract.contract_start_date)}{contract.contract_end_date ? ` - ${formatDate(contract.contract_end_date)}` : ""}</div>
              <div className="truncate text-muted-foreground">{CAO_OPTION_LABELS[contract.cao_key] || contract.cao_key || "-"}{contract.cao_scale ? ` / ${contract.cao_scale}.${contract.cao_period || 0}` : ""}</div>
              <div className="truncate text-muted-foreground">{hoursLabel} · {EMPLOYMENT_MODEL_LABELS[persistedEmploymentModel] || persistedEmploymentModel || "-"}</div>
              <div>{documentStatusBadge(contract.document_status)}</div>
              <div className="truncate text-muted-foreground">{getAuditActorLabel(contract, auditActors)}</div>
              <div className="flex justify-end gap-1">
                {fileDescriptor ? <Eye className="h-4 w-4 text-muted-foreground" /> : <Pencil className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>
          );
        })}
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
