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
  Archive,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Pencil,
  Plus,
  Save,
  Upload,
  X,
} from "lucide-react";

const CAO_OPTIONS = [
  { value: "cao_particuliere_beveiliging", label: "CAO Particuliere Beveiliging" },
  { value: "cao_evenementen_horecabeveiliging", label: "CAO Evenementen- en Horecabeveiliging" },
  { value: "cao_verkeersregelaars", label: "CAO Verkeersregelaars" },
  { value: "cao_veiligheidsdomein", label: "CAO Veiligheidsdomein" },
];

const CAO_OPTION_LABELS = Object.fromEntries(CAO_OPTIONS.map(option => [option.value, option.label]));

const CONTRACT_FORM_OPTIONS = [
  { value: "bepaalde_tijd", label: "Bepaalde tijd" },
  { value: "onbepaalde_tijd", label: "Onbepaalde tijd" },
  { value: "oproep", label: "Oproep / 0-uren" },
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
  { value: "call_agreement", label: "Oproep / nuluren" },
  { value: "min_max", label: "Min-max" },
  { value: "internship", label: "Stage" },
  { value: "zzp", label: "ZZP / opdracht" },
  { value: "unknown", label: "Onbekend" },
];

const FUNCTION_TYPES = [
  { value: "objectbeveiliger", label: "Objectbeveiliger" },
  { value: "receptie", label: "Receptie" },
  { value: "surveillant", label: "Surveillant" },
  { value: "alarmopvolging", label: "Alarmopvolging" },
  { value: "binnendienst", label: "Binnendienst" },
  { value: "klantrelatie", label: "Klantrelatie" },
  { value: "planner", label: "Planner" },
  { value: "centralist", label: "Centralist" },
  { value: "verkeersregelaar", label: "Verkeersregelaar" },
  { value: "brandwacht", label: "Brandwacht" },
  { value: "installateur", label: "Installateur" },
  { value: "rechercheur", label: "Rechercheur" },
  { value: "host", label: "Host / Hostess" },
  { value: "other", label: "Overig" },
];

const FUNCTION_TYPE_LABELS = Object.fromEntries(FUNCTION_TYPES.map(option => [option.value, option.label]));
const CONTRACT_FORM_LABELS = Object.fromEntries(CONTRACT_FORM_OPTIONS.map(option => [option.value, option.label]));
const EMPLOYMENT_MODEL_LABELS = Object.fromEntries(EMPLOYMENT_MODEL_OPTIONS.map(option => [option.value, option.label]));

const SECURITY_ROLE_OPTIONS = [
  { value: "aspirant_beveiliger", label: "Aspirant-beveiliger" },
  { value: "beveiliger", label: "Beveiliger" },
  { value: "leidinggevende", label: "Leidinggevende" },
  { value: "not_applicable", label: "Niet van toepassing" },
  { value: "unknown", label: "Onbekend" },
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
  return FUNCTION_TYPE_LABELS[value] || String(value || "").replace(/[_-]+/g, " ");
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

function initialForm(personnel) {
  const model = personnel.contract_form === "oproep" ? "call_agreement" : "unknown";
  return {
    source_type: "generated",
    company_id: personnel.primary_company_id || null,
    cao_key: personnel.cao || null,
    cao_configuration_id: personnel.cao_configuration_id || null,
    contract_form: personnel.contract_form || "unknown",
    underlying_contract_form: personnel.underlying_contract_form || null,
    employment_contract_model: model,
    contract_start_date: personnel.contract_start_date || "",
    contract_end_date: personnel.contract_end_date || "",
    cao_scale: personnel.cao_scale ?? "",
    cao_period: personnel.cao_period ?? "",
    custom_hourly_rate: personnel.custom_hourly_rate ?? "",
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
    min_hours_per_week: personnel.min_hours ?? "",
    max_hours_per_week: personnel.max_hours ?? "",
    min_hours_per_pay_period: "",
    max_hours_per_pay_period: "",
    industry_seniority_pay_periods: personnel.industry_seniority_pay_periods ?? "",
    industry_start_date: personnel.industry_start_date || "",
    template_id: null,
    letterhead_id: null,
    signed_file_id: null,
    existing_contract_file: null,
    notes: "",
  };
}

function formFromContract(contract) {
  const employmentModel = contract.employment_contract_model === "call_agreement" && contract.min_hours_per_week
    ? "min_max"
    : (contract.employment_contract_model || "unknown");
  return {
    source_type: contract.source_type || (contract.generated_file_id ? "generated" : "uploaded_existing"),
    company_id: contract.company_id || null,
    cao_key: contract.cao_key || null,
    cao_configuration_id: contract.cao_configuration_id || null,
    contract_form: contract.contract_form || "unknown",
    underlying_contract_form: contract.underlying_contract_form || null,
    employment_contract_model: employmentModel,
    contract_start_date: contract.contract_start_date || "",
    contract_end_date: contract.contract_end_date || "",
    cao_scale: contract.cao_scale ?? "",
    cao_period: contract.cao_period ?? "",
    custom_hourly_rate: contract.custom_hourly_rate ?? "",
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
    min_hours_per_week: contract.min_hours_per_week ?? "",
    max_hours_per_week: contract.max_hours_per_week ?? "",
    min_hours_per_pay_period: contract.min_hours_per_pay_period ?? "",
    max_hours_per_pay_period: contract.max_hours_per_pay_period ?? "",
    industry_seniority_pay_periods: contract.industry_seniority_pay_periods ?? "",
    industry_start_date: contract.industry_start_date || "",
    template_id: contract.template_id || null,
    letterhead_id: contract.letterhead_id || null,
    signed_file_id: contract.signed_file_id || null,
    existing_contract_file: null,
    notes: contract.notes || "",
  };
}

function getMissingContractFields(form) {
  const missing = [];
  if (!form.company_id) missing.push("bedrijf");
  if (form.source_type === "generated" && !form.template_id) missing.push("contracttemplate");
  if (form.source_type === "uploaded_existing" && !form.existing_contract_file && !form.signed_file_id) missing.push("contractdocument");
  if (!form.cao_key && form.contract_form !== "zzp") missing.push("CAO");
  if (!form.contract_form || form.contract_form === "unknown") missing.push("contractvorm");
  if (form.contract_form === "oproep" && (!form.underlying_contract_form || form.underlying_contract_form === "unknown")) {
    missing.push("onderliggende duurvorm");
  }
  if (!form.contract_start_date) missing.push("startdatum");
  if (!form.function_type && !form.cao_function_group && !form.cao_function_level && !hasMeaningfulSecurityRole(form.security_role_status)) {
    missing.push("functiecontext");
  }
  if (["parttime_fixed", "parttime_growth", "min_max"].includes(form.employment_contract_model) && !form.contract_hours_per_week && !form.contract_hours_per_pay_period && !form.min_hours_per_week) {
    missing.push("uren");
  }
  return missing;
}

function normalizedEmploymentModel(form) {
  if (form.employment_contract_model === "min_max") return "call_agreement";
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
    value.security_role_status || "",
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
    contract_form: form.contract_form || "unknown",
    underlying_contract_form: form.contract_form === "oproep" ? (form.underlying_contract_form || "unknown") : null,
    employment_contract_model: normalizedEmploymentModel(form),
    parttime_contract_model: parttimeModel(form),
    contract_start_date: form.contract_start_date || null,
    contract_end_date: form.contract_end_date || null,
    cao_scale: numberOrNull(form.cao_scale),
    cao_period: numberOrNull(form.cao_period),
    custom_hourly_rate: numberOrNull(form.custom_hourly_rate),
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
    contract_hours_per_week: numberOrNull(form.contract_hours_per_week),
    contract_hours_per_pay_period: numberOrNull(form.contract_hours_per_pay_period),
    min_hours_per_week: numberOrNull(form.min_hours_per_week),
    max_hours_per_week: numberOrNull(form.max_hours_per_week),
    min_hours_per_pay_period: numberOrNull(form.min_hours_per_pay_period),
    max_hours_per_pay_period: numberOrNull(form.max_hours_per_pay_period),
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

function replacePlaceholders(templateBody, values) {
  return String(templateBody || "")
    .replace(/\{\{\s*medewerker\.naam\s*\}\}/gi, values.employeeName)
    .replace(/\{\{\s*medewerker\.email\s*\}\}/gi, values.employeeEmail)
    .replace(/\{\{\s*bedrijf\.naam\s*\}\}/gi, values.companyName)
    .replace(/\{\{\s*contract\.startdatum\s*\}\}/gi, values.startDate)
    .replace(/\{\{\s*contract\.einddatum\s*\}\}/gi, values.endDate)
    .replace(/\{\{\s*contract\.functie\s*\}\}/gi, values.functionName)
    .replace(/\{\{\s*contract\.cao\s*\}\}/gi, values.cao)
    .replace(/\{\{\s*contract\.schaal\s*\}\}/gi, values.scale)
    .replace(/\{\{\s*contract\.periodiek\s*\}\}/gi, values.period)
    .replace(/\{\{\s*contract\.uren_per_week\s*\}\}/gi, values.hoursPerWeek)
    .replace(/\{\{\s*contract\.contractvorm\s*\}\}/gi, values.contractForm);
}

function contractRenderValues(personnel, form, company) {
  const employeeName = compact(personnel.full_name || personnel.display_name || [personnel.first_name, personnel.middle_name, personnel.last_name].filter(Boolean).join(" "));
  return {
    employeeName: employeeName || "Medewerker",
    employeeEmail: personnel.email || "-",
    companyName: company?.display_name || company?.legal_name || "Bedrijf",
    startDate: formatDate(form.contract_start_date),
    endDate: form.contract_end_date ? formatDate(form.contract_end_date) : "onbepaalde tijd",
    functionName: readableFunctionLabel(form.function_type) || form.cao_function_group || "-",
    cao: CAO_OPTION_LABELS[form.cao_key] || form.cao_key || "-",
    scale: form.cao_scale || "-",
    period: form.cao_period || "-",
    hoursPerWeek: form.contract_hours_per_week || form.min_hours_per_week || "-",
    contractForm: CONTRACT_FORM_LABELS[form.contract_form] || form.contract_form || "-",
  };
}

function renderContractBody(personnel, form, company, template) {
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
  return replacePlaceholders(template?.body || fallbackBody, contractRenderValues(personnel, form, company));
}

function makePdfFile({ personnel, form, company, template, letterhead }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 54;
  const title = template?.name || "Arbeidsovereenkomst";
  const body = renderContractBody(personnel, form, company, template);
  const values = contractRenderValues(personnel, form, company);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, 64);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(values.companyName, margin, 84);
  if (letterhead?.name) doc.text(`Briefpapier: ${letterhead.name}`, margin, 98);
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(body, 486);
  let y = 132;
  lines.forEach(line => {
    if (y > 760) {
      doc.addPage();
      y = 64;
    }
    doc.text(line, margin, y);
    y += 16;
  });
  doc.setFontSize(8);
  doc.text("PDF-snapshot gegenereerd door LOQ. Latere sjabloonwijzigingen wijzigen dit document niet.", margin, 806);
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
  ]), [companies, contracts, form.company_id]);

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

  const selectedCompany = companies.find(company => company.id === form.company_id) || null;
  const publishedTemplates = useMemo(() => (contractTemplates || [])
    .filter(template => template.company_id === form.company_id && template.status === "published")
    .sort((a, b) => a.name.localeCompare(b.name)), [contractTemplates, form.company_id]);
  const letterheadOptions = useMemo(() => getLetterheadOptions(letterheads, companies, form.company_id), [companies, form.company_id, letterheads]);
  const selectedTemplate = contractTemplates.find(template => template.id === form.template_id) || null;
  const selectedLetterhead = letterheadOptions.find(item => item.id === form.letterhead_id) || null;
  const companyCaoKeyOptions = useMemo(
    () => buildCompanyCaoKeyOptions(companyCaoAssignments, form.contract_start_date, caoConfigurationOptions),
    [caoConfigurationOptions, companyCaoAssignments, form.contract_start_date]
  );
  const companyFunctionOptions = useMemo(
    () => buildCompanyFunctionOptions(companyCaoAssignments, form.contract_start_date, form.cao_key, caoConfigurationOptions, form.function_type),
    [caoConfigurationOptions, companyCaoAssignments, form.cao_key, form.contract_start_date, form.function_type]
  );
  const visibleCaoConfigurationOptions = filterCaoConfigurationOptions(caoConfigurationOptions, form);
  const selectedCaoConfiguration = caoConfigurationOptions.find(option => option.id === form.cao_configuration_id) || null;
  const caoConfigurationSelectionWarning = selectedCaoConfigurationWarning(selectedCaoConfiguration, form);
  const conflicts = validateConflicts(form, contracts, editingId);
  const missingFields = getMissingContractFields(form);
  const generatedPreview = useMemo(() => renderContractBody(personnel, form, selectedCompany, selectedTemplate), [form, personnel, selectedCompany, selectedTemplate]);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const setCompanyId = (value) => setForm(prev => {
    const companyId = value === "none" ? null : value;
    if (prev.company_id === companyId) return prev;
    return {
      ...prev,
      company_id: companyId,
      cao_key: null,
      cao_configuration_id: null,
      template_id: null,
      letterhead_id: null,
    };
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["personnel_contracts", personnel.id] });
    queryClient.invalidateQueries({ queryKey: ["personnel"] });
    queryClient.invalidateQueries({ queryKey: ["company-contract-templates"] });
    queryClient.invalidateQueries({ queryKey: ["company-letterheads"] });
    queryClient.invalidateQueries({ queryKey: ["cao-configuration-options"] });
    queryClient.invalidateQueries({ queryKey: ["company-cao-assignments"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (conflicts.issues.length > 0) {
        throw new Error(conflicts.issues[0]);
      }

      const previous = editingId ? contracts.find(contract => contract.id === editingId) || {} : {};
      const payload = buildContractPayload(personnel, {
        ...form,
        template_version: selectedTemplate?.version || null,
        signed_file_id: previous.signed_file_id || null,
      }, currentUser, auditActors, previous);
      let record = editingId
        ? await base44.entities.PersonnelContract.update(editingId, payload)
        : await base44.entities.PersonnelContract.create(payload);

      if (form.source_type === "generated") {
        const pdfFile = makePdfFile({ personnel, form, company: selectedCompany, template: selectedTemplate, letterhead: selectedLetterhead });
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

  const archiveMutation = useMutation({
    mutationFn: async (contract) => base44.entities.PersonnelContract.update(contract.id, {
      document_status: "archived",
      is_current: false,
      planning_allowed: false,
      contract_final_allowed: false,
      payroll_final_allowed: false,
      metadata: buildAuditMetadata(currentUser, "gearchiveerd", contract.metadata || {}, auditActors),
    }),
    onSuccess: () => {
      setActionMessage({ type: "success", text: "Contract gearchiveerd." });
      refresh();
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

  const caoSelectDisabled = !form.company_id || companyCaoAssignmentsLoading || companyCaoKeyOptions.length === 0;

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
    if (!wizardOpen || form.template_id || publishedTemplates.length === 0) return;
    if (form.source_type === "generated") set("template_id", publishedTemplates[0].id);
  }, [wizardOpen, form.source_type, form.template_id, publishedTemplates]);

  const stepItems = ["Bron", "Basis", "CAO & loon", "Uren", "Document", "Controle"];

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
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ["generated", "Contract genereren", "Gebruik een gepubliceerde template en briefpapier. Het resultaat wordt als PDF-snapshot opgeslagen."],
                  ["uploaded_existing", "Bestaand contract toevoegen", "Upload een reeds getekend contract en vul de contractmetadata aan voor planning/payroll."],
                ].map(([value, title, description]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set("source_type", value)}
                    className={`rounded-lg border p-4 text-left transition-colors ${form.source_type === value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
                  >
                    <div className="flex items-center gap-2">
                      {value === "generated" ? <FileText className="h-4 w-4 text-primary" /> : <Upload className="h-4 w-4 text-primary" />}
                      <p className="font-medium text-sm">{title}</p>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{description}</p>
                  </button>
                ))}
              </div>
            )}

            {wizardStep === 2 && (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>Bedrijf</Label>
                  <Select value={form.company_id || "none"} onValueChange={setCompanyId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Kies bedrijf</SelectItem>
                      {companies.map(company => (
                        <SelectItem key={company.id} value={company.id}>{company.display_name || company.legal_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Functie</Label>
                  <Select value={form.function_type || "none"} onValueChange={value => {
                    const nextValue = value === "none" ? null : value;
                    set("function_type", nextValue);
                    if (nextValue && !form.allowed_function_types_text) set("allowed_function_types_text", nextValue);
                  }}>
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
                  <Label>Contractvorm</Label>
                  <Select value={form.contract_form || "unknown"} onValueChange={value => {
                    set("contract_form", value);
                    if (value !== "oproep") set("underlying_contract_form", null);
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONTRACT_FORM_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.contract_form === "oproep" && (
                  <div className="space-y-1">
                    <Label>Onderliggende duurvorm</Label>
                    <Select value={form.underlying_contract_form || "unknown"} onValueChange={value => set("underlying_contract_form", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bepaalde_tijd">Bepaalde tijd</SelectItem>
                        <SelectItem value="onbepaalde_tijd">Onbepaalde tijd</SelectItem>
                        <SelectItem value="unknown">Onbekend</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Startdatum</Label>
                  <Input type="date" value={form.contract_start_date || ""} onChange={event => set("contract_start_date", event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Einddatum</Label>
                  <Input type="date" value={form.contract_end_date || ""} onChange={event => set("contract_end_date", event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Beveiligingsstatus</Label>
                  <Select value={form.security_role_status || "unknown"} onValueChange={value => set("security_role_status", value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SECURITY_ROLE_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label>CAO</Label>
                    <Select value={form.cao_key || "none"} onValueChange={value => set("cao_key", value === "none" ? null : value)} disabled={caoSelectDisabled}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Kies CAO</SelectItem>
                        {companyCaoKeyOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.company_id && !companyCaoAssignmentsLoading && companyCaoKeyOptions.length === 0 && (
                      <p className="text-xs text-amber-700">Dit bedrijf heeft nog geen actieve CAO-koppeling op de contractdatum.</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Loonschaal</Label>
                    <Input type="number" min="0" value={form.cao_scale ?? ""} onChange={event => set("cao_scale", event.target.value)} placeholder="bijv. 3" />
                  </div>
                  <div className="space-y-1">
                    <Label>Periodiek</Label>
                    <Input type="number" min="0" value={form.cao_period ?? ""} onChange={event => set("cao_period", event.target.value)} placeholder="bijv. 1" />
                  </div>
                  <div className="space-y-1">
                    <Label>Afwijkend uurloon</Label>
                    <Input type="number" min="0" step="0.01" value={form.custom_hourly_rate ?? ""} onChange={event => set("custom_hourly_rate", event.target.value)} placeholder="alleen indien toegestaan" />
                  </div>
                  <div className="space-y-1">
                    <Label>Functiegroep</Label>
                    <Input value={form.cao_function_group || ""} onChange={event => set("cao_function_group", event.target.value || null)} placeholder="CAO-functiegroep" />
                  </div>
                  <div className="space-y-1">
                    <Label>Functieniveau</Label>
                    <Input value={form.cao_function_level || ""} onChange={event => set("cao_function_level", event.target.value || null)} placeholder="A, B, C..." />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label>CAO-configuratie</Label>
                    <Select value={form.cao_configuration_id || "auto"} onValueChange={value => set("cao_configuration_id", value === "auto" ? null : value)}>
                      <SelectTrigger><SelectValue placeholder="Automatisch bij finalisatie" /></SelectTrigger>
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
                  <div className="space-y-1">
                    <Label>Schaal schriftelijk bevestigd</Label>
                    <Select value={form.written_scale_period_notice_confirmed || "unknown"} onValueChange={value => set("written_scale_period_notice_confirmed", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unknown">Onbekend</SelectItem>
                        <SelectItem value="true">Ja</SelectItem>
                        <SelectItem value="false">Nee</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Periodiek verwerkt</Label>
                    <Select value={form.periodic_increase_due_confirmed || "unknown"} onValueChange={value => set("periodic_increase_due_confirmed", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unknown">Onbekend</SelectItem>
                        <SelectItem value="true">Ja</SelectItem>
                        <SelectItem value="false">Nee</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 4 && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Urenmodel</Label>
                    <Select value={form.employment_contract_model || "unknown"} onValueChange={value => set("employment_contract_model", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EMPLOYMENT_MODEL_OPTIONS.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {[
                    ["contract_hours_per_week", "Uren per week"],
                    ["contract_hours_per_pay_period", "Uren per loonperiode"],
                    ["min_hours_per_week", "Min. uren/week"],
                    ["max_hours_per_week", "Max. uren/week"],
                    ["min_hours_per_pay_period", "Min. uren/loonperiode"],
                    ["max_hours_per_pay_period", "Max. uren/loonperiode"],
                  ].map(([field, label]) => (
                    <div key={field} className="space-y-1">
                      <Label>{label}</Label>
                      <Input type="number" min="0" value={form[field] ?? ""} onChange={event => set(field, event.target.value)} />
                    </div>
                  ))}
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                  {[
                    ["performs_security_work", "Beveiligingswerk"],
                    ["works_airport_schiphol", "Schiphol/airport"],
                    ["works_cash_value_logistics", "Geld/waarde"],
                    ["works_event_or_hospitality_security", "Evenement/horeca"],
                  ].map(([field, label]) => (
                    <div key={field} className="space-y-1">
                      <Label>{label}</Label>
                      <Select value={form[field] || "unknown"} onValueChange={value => set(field, value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unknown">Onbekend</SelectItem>
                          <SelectItem value="true">Ja</SelectItem>
                          <SelectItem value="false">Nee</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {wizardStep === 5 && (
              <div className="space-y-4">
                {form.source_type === "generated" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Contracttemplate</Label>
                      <Select value={form.template_id || "none"} onValueChange={value => set("template_id", value === "none" ? null : value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Kies template</SelectItem>
                          {publishedTemplates.map(template => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name} v{template.version || 1}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {form.company_id && publishedTemplates.length === 0 && (
                        <p className="text-xs text-amber-700">Dit bedrijf heeft nog geen gepubliceerde contracttemplate.</p>
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
                    <div className="md:col-span-2 rounded-lg border border-border bg-muted/20 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview tekst</p>
                      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{generatedPreview}</pre>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Label>Bestaand contract uploaden</Label>
                    <label className="flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center hover:bg-muted/40">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="mt-2 text-sm font-medium">{form.existing_contract_file?.name || "Klik om contractdocument te uploaden"}</span>
                      <span className="text-xs text-muted-foreground">PDF, JPG of PNG</span>
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        className="hidden"
                        onChange={event => set("existing_contract_file", event.target.files?.[0] || null)}
                      />
                    </label>
                  </div>
                )}
              </div>
            )}

            {wizardStep === 6 && (
              <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
                <div className="space-y-3">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Controle</p>
                    {missingFields.length === 0 && conflicts.issues.length === 0 ? (
                      <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700">
                        <CheckCircle className="h-4 w-4" /> Contractbasis compleet.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2 text-sm text-amber-700">
                        {missingFields.length > 0 && <p>Ontbreekt: {missingFields.join(", ")}.</p>}
                        {conflicts.issues.map((issue, index) => <p key={index} className="text-destructive">{issue}</p>)}
                      </div>
                    )}
                    {conflicts.warnings.map((warning, index) => (
                      <p key={index} className="mt-2 text-sm text-amber-700">{warning}</p>
                    ))}
                  </div>
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
                <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || conflicts.issues.length > 0}>
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
          const hoursLabel = contract.employment_contract_model === "call_agreement" && contract.min_hours_per_week
            ? `Min-max ${contract.min_hours_per_week || "-"}-${contract.max_hours_per_week || "-"} u/w`
            : `${contract.contract_hours_per_week || contract.contract_hours_per_pay_period || "-"} u`;
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
              <div className="truncate text-muted-foreground">{hoursLabel} · {EMPLOYMENT_MODEL_LABELS[contract.employment_contract_model] || contract.employment_contract_model || "-"}</div>
              <div>{documentStatusBadge(contract.document_status)}</div>
              <div className="truncate text-muted-foreground">{getAuditActorLabel(contract, auditActors)}</div>
              <div className="flex justify-end gap-1">
                {fileDescriptor ? <Eye className="h-4 w-4 text-muted-foreground" /> : <Pencil className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>
          );
        })}
      </div>

      {sortedContracts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sortedContracts.slice(0, 3).map(contract => (
            <Button key={contract.id} type="button" variant="outline" size="sm" onClick={() => openEdit(contract)}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> {getCompanyLabel(companies, contract.company_id)}
            </Button>
          ))}
          {sortedContracts.filter(contract => contract.document_status !== "archived").slice(0, 3).map(contract => (
            <Button key={`archive-${contract.id}`} type="button" variant="outline" size="sm" onClick={() => archiveMutation.mutate(contract)} disabled={archiveMutation.isPending}>
              <Archive className="mr-1 h-3.5 w-3.5" /> Archiveer {formatDate(contract.contract_start_date)}
            </Button>
          ))}
        </div>
      )}

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
