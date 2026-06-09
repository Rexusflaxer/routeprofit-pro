import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle, Pencil, Plus, RotateCw, Save, ShieldCheck, X } from "lucide-react";

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

const FUNCTION_TYPES = [
  { value: "objectbeveiliger", label: "Objectbeveiliger" },
  { value: "receptie", label: "Receptie" },
  { value: "surveillant", label: "Surveillant" },
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

const SECURITY_ROLE_OPTIONS = [
  { value: "aspirant_beveiliger", label: "Aspirant-beveiliger" },
  { value: "beveiliger", label: "Beveiliger" },
  { value: "leidinggevende", label: "Leidinggevende" },
  { value: "not_applicable", label: "Niet van toepassing" },
  { value: "unknown", label: "Onbekend" },
];

const STATUS_STYLES = {
  compliant: "bg-emerald-100 text-emerald-700",
  context_ready: "bg-blue-100 text-blue-700",
  draft_missing_context: "bg-red-50 text-red-700",
  blocked: "bg-red-50 text-red-700",
  manual_review_required: "bg-amber-100 text-amber-700",
  unknown: "bg-slate-100 text-slate-600",
  calculated: "bg-blue-100 text-blue-700",
};

function statusBadge(value, fallback = "unknown") {
  const status = value || fallback;
  return <Badge className={`${STATUS_STYLES[status] || STATUS_STYLES.unknown} text-xs`}>{status}</Badge>;
}

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
    warnings.push("Deze CAO-configuratie is niet actief en blijft alleen zichtbaar omdat het contract hier al aan gekoppeld is.");
  }
  if (form.cao_key && selectedOption.cao_key && selectedOption.cao_key !== form.cao_key) {
    warnings.push(`Deze CAO-configuratie hoort bij ${selectedOption.cao_key}, niet bij ${form.cao_key}.`);
  }
  if (!isDateWithinOptionRange(selectedOption, form.contract_start_date)) {
    warnings.push("Deze CAO-configuratie is niet geldig op de contractstartdatum.");
  }
  return warnings.length > 0 ? warnings.join(" ") : null;
}

function getMissingContractFields(form) {
  const missing = [];
  if (!form.company_id) missing.push("company_id");
  if (!form.cao_key) missing.push("cao_key");
  if (!form.contract_form || form.contract_form === "unknown") missing.push("contract_form");
  if (form.contract_form === "oproep" && (!form.underlying_contract_form || form.underlying_contract_form === "unknown")) {
    missing.push("underlying_contract_form");
  }
  if (!form.contract_start_date) missing.push("contract_start_date");
  if (!form.function_type && !form.cao_function_group && !form.cao_function_level && !hasMeaningfulSecurityRole(form.security_role_status)) {
    missing.push("function_type/cao_function_group/cao_function_level/security_role_status");
  }
  return missing;
}

function initialForm(personnel) {
  return {
    company_id: personnel.primary_company_id || null,
    cao_key: personnel.cao || null,
    cao_configuration_id: personnel.cao_configuration_id || null,
    contract_form: personnel.contract_form || "unknown",
    underlying_contract_form: personnel.underlying_contract_form || null,
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
    notes: "",
  };
}

function formFromContract(contract) {
  return {
    company_id: contract.company_id || null,
    cao_key: contract.cao_key || null,
    cao_configuration_id: contract.cao_configuration_id || null,
    contract_form: contract.contract_form || "unknown",
    underlying_contract_form: contract.underlying_contract_form || null,
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
    notes: contract.notes || "",
  };
}

function buildContractPayload(personnel, form) {
  const missing = getMissingContractFields(form);
  const contextReady = missing.length === 0;
  const allowedFunctionTypes = fromArrayText(form.allowed_function_types_text);
  const allowedGroups = fromArrayText(form.allowed_cao_function_groups_text);
  const allowedLevels = fromArrayText(form.allowed_cao_function_levels_text);

  return {
    personnel_id: personnel.id,
    company_id: form.company_id || null,
    cao_key: form.cao_key || null,
    cao_configuration_id: form.cao_configuration_id || null,
    contract_form: form.contract_form || "unknown",
    underlying_contract_form: form.contract_form === "oproep" ? (form.underlying_contract_form || "unknown") : null,
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
    contract_final_allowed: false,
    payroll_final_allowed: false,
    is_current: contextReady,
    notes: form.notes || null,
  };
}

export default function PersonnelContractsTab({ personnel, companies = [] }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(() => initialForm(personnel));
  const [lastFinalizeResult, setLastFinalizeResult] = useState(null);

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["personnel_contracts", personnel.id],
    queryFn: () => base44.entities.PersonnelContract.filter({ personnel_id: personnel.id }),
  });

  const sortedContracts = useMemo(() => [...contracts].sort((a, b) =>
    String(b.contract_start_date || "").localeCompare(String(a.contract_start_date || ""))
  ), [contracts]);

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

  const companyCaoKeyOptions = useMemo(
    () => buildCompanyCaoKeyOptions(companyCaoAssignments, form.contract_start_date, caoConfigurationOptions),
    [caoConfigurationOptions, companyCaoAssignments, form.contract_start_date]
  );
  const companyCaoKeySignature = useMemo(
    () => companyCaoKeyOptions.map(option => option.value).join("|"),
    [companyCaoKeyOptions]
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["personnel_contracts", personnel.id] });
    queryClient.invalidateQueries({ queryKey: ["personnel"] });
    queryClient.invalidateQueries({ queryKey: ["cao-configuration-options"] });
    queryClient.invalidateQueries({ queryKey: ["company-cao-assignments"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildContractPayload(personnel, form);
      if (editingId) return base44.entities.PersonnelContract.update(editingId, payload);
      return base44.entities.PersonnelContract.create(payload);
    },
    onSuccess: () => {
      setFormOpen(false);
      setEditingId(null);
      setForm(initialForm(personnel));
      refresh();
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: (contractId) => base44.functions.invoke("applyCaoContractRules", {
      action: "evaluate_contract_rules",
      contract_id: contractId,
      save: true,
    }),
    onSuccess: (res) => {
      setLastFinalizeResult(res.data || res);
      refresh();
    },
    onError: (error) => {
      setLastFinalizeResult(error?.response?.data || { error: error.message || "Finalisatie mislukt." });
    },
  });

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const setCompanyId = (value) => setForm(prev => {
    const companyId = value === "none" ? null : value;
    if (prev.company_id === companyId) return prev;
    return { ...prev, company_id: companyId, cao_key: null, cao_configuration_id: null };
  });
  const setCaoKey = (value) => setForm(prev => {
    const caoKey = value === "none" ? null : value;
    const selectedOption = caoConfigurationOptions.find(option => option.id === prev.cao_configuration_id);
    const nextConfigId = selectedOption && selectedOption.cao_key !== caoKey ? null : prev.cao_configuration_id;
    return { ...prev, cao_key: caoKey, cao_configuration_id: nextConfigId };
  });
  const setContractStartDate = (value) => setForm(prev => {
    const selectedOption = caoConfigurationOptions.find(option => option.id === prev.cao_configuration_id);
    const nextConfigId = selectedOption && !isDateWithinOptionRange(selectedOption, value) ? null : prev.cao_configuration_id;
    return { ...prev, contract_start_date: value, cao_configuration_id: nextConfigId };
  });
  const companyName = (id) => companies.find(company => company.id === id)?.display_name || id || "-";
  const openNew = () => {
    setEditingId(null);
    setForm(initialForm(personnel));
    setFormOpen(true);
    setLastFinalizeResult(null);
  };
  const openEdit = (contract) => {
    setEditingId(contract.id);
    setForm(formFromContract(contract));
    setFormOpen(true);
    setLastFinalizeResult(null);
  };

  const visibleCaoConfigurationOptions = filterCaoConfigurationOptions(caoConfigurationOptions, form);
  const selectedCaoConfiguration = caoConfigurationOptions.find(option => option.id === form.cao_configuration_id) || null;
  const caoConfigurationSelectionWarning = selectedCaoConfigurationWarning(selectedCaoConfiguration, form);
  const caoSelectDisabled = !form.company_id || companyCaoAssignmentsLoading || companyCaoKeyOptions.length === 0;

  useEffect(() => {
    if (!formOpen || !form.company_id || companyCaoAssignmentsLoading) return;
    setForm(prev => {
      if (prev.company_id !== form.company_id) return prev;
      if (companyCaoKeyOptions.length === 1 && prev.cao_key !== companyCaoKeyOptions[0].value) {
        return { ...prev, cao_key: companyCaoKeyOptions[0].value, cao_configuration_id: null };
      }
      if (prev.cao_key && !companyCaoKeyOptions.some(option => option.value === prev.cao_key)) {
        return { ...prev, cao_key: null, cao_configuration_id: null };
      }
      return prev;
    });
  }, [formOpen, form.company_id, form.cao_key, companyCaoAssignmentsLoading, companyCaoKeyOptions, companyCaoKeySignature]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Arbeidscontracten</p>
          <p className="text-sm text-muted-foreground">Contracten bepalen welk bedrijf, welke CAO en welke functiecontext planning/payroll mogen dragen.</p>
        </div>
        <Button type="button" onClick={openNew} size="sm">
          <Plus className="w-4 h-4 mr-1" /> Contract
        </Button>
      </div>

      {lastFinalizeResult && (
        <div className={`rounded-lg border p-3 text-sm ${lastFinalizeResult.contract_final_allowed ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          <div className="flex items-center gap-2 font-medium">
            {lastFinalizeResult.contract_final_allowed ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {lastFinalizeResult.contract_final_allowed ? "Contract final en payroll-ready als contractbasis" : "Contract niet final"}
          </div>
          {lastFinalizeResult.error && <p className="mt-1">{lastFinalizeResult.error}</p>}
          {(lastFinalizeResult.warnings || lastFinalizeResult.calculation_warnings || []).slice(0, 4).map((warning, index) => (
            <p key={index} className="mt-1 text-xs">{String(warning)}</p>
          ))}
          {(lastFinalizeResult.missing_evidence || []).slice(0, 4).map((item, index) => (
            <p key={index} className="mt-1 text-xs">Ontbreekt: {item.field || item.rule_id} - {item.message}</p>
          ))}
        </div>
      )}

      {formOpen && (
        <div className="rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">{editingId ? "Contract bewerken" : "Nieuw contract"}</p>
            <Button type="button" variant="ghost" size="icon" onClick={() => setFormOpen(false)}><X className="w-4 h-4" /></Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Werkgever/bedrijf</Label>
              <Select value={form.company_id || "none"} onValueChange={setCompanyId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kies bedrijf</SelectItem>
                  {companies.map(company => (
                    <SelectItem key={company.id} value={company.id}>{company.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Contract-CAO</Label>
              <Select value={form.cao_key || "none"} onValueChange={setCaoKey} disabled={caoSelectDisabled}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kies CAO</SelectItem>
                  {companyCaoKeyOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!form.company_id && <p className="text-xs text-muted-foreground">Kies eerst het bedrijf.</p>}
              {form.company_id && !companyCaoAssignmentsLoading && companyCaoKeyOptions.length === 0 && (
                <p className="text-xs text-amber-700">Dit bedrijf heeft nog geen actieve CAO-koppeling op de contractdatum.</p>
              )}
              {form.company_id && companyCaoKeyOptions.length === 1 && (
                <p className="text-xs text-muted-foreground">Automatisch gekoppeld aan de bedrijfs-CAO.</p>
              )}
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
              <Input type="date" value={form.contract_start_date || ""} onChange={event => setContractStartDate(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Einddatum</Label>
              <Input type="date" value={form.contract_end_date || ""} onChange={event => set("contract_end_date", event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Functietype</Label>
              <Select value={form.function_type || "none"} onValueChange={value => {
                set("function_type", value === "none" ? null : value);
                if (value !== "none" && !form.allowed_function_types_text) set("allowed_function_types_text", value);
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kies functie</SelectItem>
                  {FUNCTION_TYPES.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <div className="space-y-1">
              <Label>CAO-functiegroep</Label>
              <Input value={form.cao_function_group || ""} onChange={event => set("cao_function_group", event.target.value || null)} placeholder="objectbeveiliger_receptionist" />
            </div>
            <div className="space-y-1">
              <Label>CAO-functieniveau</Label>
              <Input value={form.cao_function_level || ""} onChange={event => set("cao_function_level", event.target.value || null)} placeholder="a, b, c, d, e" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label>Loonschaal</Label>
              <Input type="number" min="0" value={form.cao_scale ?? ""} onChange={event => set("cao_scale", event.target.value)} placeholder="bijv. 3" />
            </div>
            <div className="space-y-1">
              <Label>Periodiek</Label>
              <Input type="number" min="0" value={form.cao_period ?? ""} onChange={event => set("cao_period", event.target.value)} placeholder="bijv. 1" />
            </div>
            <div className="space-y-1">
              <Label>Vrij uurloon</Label>
              <Input type="number" min="0" step="0.01" value={form.custom_hourly_rate ?? ""} onChange={event => set("custom_hourly_rate", event.target.value)} placeholder="niet-beveiligingswerk" />
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
              <Label>Periodiekverhoging verwerkt</Label>
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Toegestane functietypes</Label>
              <Input value={form.allowed_function_types_text || ""} onChange={event => set("allowed_function_types_text", event.target.value)} placeholder="objectbeveiliger, receptie" />
            </div>
            <div className="space-y-1">
              <Label>Toegestane functiegroepen</Label>
              <Input value={form.allowed_cao_function_groups_text || ""} onChange={event => set("allowed_cao_function_groups_text", event.target.value)} placeholder="objectbeveiliger_receptionist" />
            </div>
            <div className="space-y-1">
              <Label>Toegestane functieniveaus</Label>
              <Input value={form.allowed_cao_function_levels_text || ""} onChange={event => set("allowed_cao_function_levels_text", event.target.value)} placeholder="c, d, e" />
            </div>
            <div className="space-y-1">
              <Label>Toegestane taaktypes</Label>
              <Input value={form.allowed_task_types_text || ""} onChange={event => set("allowed_task_types_text", event.target.value)} placeholder="receptiedienst, objectbeveiliging" />
            </div>
            <div className="space-y-1">
              <Label>Beveiligingswerk?</Label>
              <Select value={form.performs_security_work || "unknown"} onValueChange={value => set("performs_security_work", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unknown">Onbekend</SelectItem>
                  <SelectItem value="true">Ja</SelectItem>
                  <SelectItem value="false">Nee</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>% beveiligingswerk</Label>
              <Input type="number" min="0" max="100" value={form.security_work_percentage ?? ""} onChange={event => set("security_work_percentage", event.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              ["works_airport_schiphol", "Schiphol/airport"],
              ["works_cash_value_logistics", "Geld/waarde"],
              ["works_event_or_hospitality_security", "Evenement/horeca"],
              ["event_hospitality_cao_applies", "Event/horeca CAO geldt"],
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

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              ["contract_hours_per_week", "Uren/week"],
              ["contract_hours_per_pay_period", "Uren/loonperiode"],
              ["min_hours_per_week", "Min/week"],
              ["max_hours_per_week", "Max/week"],
              ["min_hours_per_pay_period", "Min/loonperiode"],
              ["max_hours_per_pay_period", "Max/loonperiode"],
            ].map(([field, label]) => (
              <div key={field} className="space-y-1">
                <Label>{label}</Label>
                <Input type="number" min="0" value={form[field] ?? ""} onChange={event => set(field, event.target.value)} />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Brancheancienniteit start</Label>
              <Input type="date" value={form.industry_start_date || ""} onChange={event => set("industry_start_date", event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Brancheancienniteit loonperioden</Label>
              <Input type="number" min="0" value={form.industry_seniority_pay_periods ?? ""} onChange={event => set("industry_seniority_pay_periods", event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>CAO-configuratie</Label>
              <Select value={form.cao_configuration_id || "auto"} onValueChange={value => set("cao_configuration_id", value === "auto" ? null : value)}>
                <SelectTrigger><SelectValue placeholder="Automatisch bij finalisatie" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automatisch bepalen bij finalisatie</SelectItem>
                  {visibleCaoConfigurationOptions.map(option => (
                    <SelectItem key={option.id} value={option.id} disabled={option.selectable === false}>
                      {caoConfigurationLabel(option)}{option.selectable === false ? " (niet actief)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {caoConfigurationSelectionWarning && (
                <p className="text-xs text-amber-700">{caoConfigurationSelectionWarning}</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Notities</Label>
            <Textarea rows={3} value={form.notes || ""} onChange={event => set("notes", event.target.value)} />
          </div>

          {getMissingContractFields(form).length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Ontbrekende contractbasis: {getMissingContractFields(form).join(", ")}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Annuleren</Button>
            <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="w-4 h-4 mr-1" /> {saveMutation.isPending ? "Opslaan..." : "Opslaan"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Contracten laden...</p>}
        {!isLoading && sortedContracts.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
            Nog geen arbeidscontracten vastgelegd.
          </div>
        )}
        {sortedContracts.map(contract => {
          const final = contract.contract_final_allowed === true && contract.payroll_final_allowed === true;
          return (
            <div key={contract.id} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {final ? <ShieldCheck className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                    <p className="font-medium text-sm">{companyName(contract.company_id)}</p>
                    {statusBadge(contract.contract_context_status)}
                    {statusBadge(contract.cao_contract_rule_status)}
                    {contract.is_current === false && <Badge className="bg-slate-100 text-slate-600 text-xs">niet current</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {contract.cao_key || "geen CAO"} | {contract.contract_form || "contractvorm onbekend"} | {contract.contract_start_date || "geen startdatum"}{contract.contract_end_date ? ` t/m ${contract.contract_end_date}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {contract.function_type || "functie onbekend"} | {contract.cao_function_group || "geen functiegroep"} | niveau {contract.cao_function_level || "-"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {contract.custom_hourly_rate ? `Vrij uurloon €${Number(contract.custom_hourly_rate).toFixed(2)}` : `Schaal ${contract.cao_scale ?? "-"}, periodiek ${contract.cao_period ?? "-"}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => openEdit(contract)}>
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Bewerken
                  </Button>
                  <Button type="button" size="sm" onClick={() => finalizeMutation.mutate(contract.id)} disabled={finalizeMutation.isPending}>
                    <RotateCw className="w-3.5 h-3.5 mr-1" /> Finaliseer
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className={contract.planning_allowed ? "text-emerald-700" : "text-amber-700"}>Planning: {contract.planning_allowed ? "toegestaan" : "niet final"}</div>
                <div className={contract.contract_final_allowed ? "text-emerald-700" : "text-amber-700"}>Contract: {contract.contract_final_allowed ? "final" : "niet final"}</div>
                <div className={contract.payroll_final_allowed ? "text-emerald-700" : "text-amber-700"}>Payroll: {contract.payroll_final_allowed ? "final" : "geblokkeerd"}</div>
                <div className="text-muted-foreground">Config: {contract.cao_configuration_id || "-"}</div>
              </div>

              {contract.contract_context_missing_fields?.length > 0 && (
                <div className="rounded border border-red-100 bg-red-50 p-2 text-xs text-red-700">
                  Ontbrekende context: {contract.contract_context_missing_fields.join(", ")}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
