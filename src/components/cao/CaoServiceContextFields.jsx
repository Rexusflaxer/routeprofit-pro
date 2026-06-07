import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NULL_VALUE = "__null__";

const CAO_OPTIONS = [
  { value: "cao_particuliere_beveiliging", label: "Particuliere Beveiliging" },
  { value: "cao_evenementen_horecabeveiliging", label: "Evenementen- en horecabeveiliging" },
  { value: "cao_verkeersregelaars", label: "Verkeersregelaars" },
  { value: "cao_veiligheidsdomein", label: "Veiligheidsdomein" }
];

const FUNCTION_TYPE_OPTIONS = [
  { value: "objectbeveiliger", label: "Objectbeveiliger" },
  { value: "receptie", label: "Receptie" },
  { value: "surveillant", label: "Surveillant" },
  { value: "centralist", label: "Centralist" },
  { value: "verkeersregelaar", label: "Verkeersregelaar" },
  { value: "brandwacht", label: "Brandwacht" },
  { value: "rechercheur", label: "Rechercheur" },
  { value: "klantrelatie", label: "Klantrelatie" },
  { value: "binnendienst", label: "Binnendienst" },
  { value: "planner", label: "Planner" },
  { value: "installateur", label: "Installateur" },
  { value: "host", label: "Host" },
  { value: "other", label: "Anders" }
];

const FUNCTION_GROUP_OPTIONS = [
  { value: "objectbeveiliger_receptionist", label: "Objectbeveiliger / receptionist" },
  { value: "mobiel_surveillant", label: "Mobiel surveillant" },
  { value: "winkelsurveillant", label: "Winkelsurveillant" },
  { value: "brandwacht", label: "Brandwacht" },
  { value: "geld_waardetransporteur", label: "Geld- en waardetransporteur" },
  { value: "centralist", label: "Centralist" },
  { value: "non_security_staff", label: "Geen beveiligingswerk" }
];

const FUNCTION_LEVEL_OPTIONS = [
  { value: "aspirant", label: "Aspirant" },
  { value: "a", label: "A" },
  { value: "b", label: "B" },
  { value: "c", label: "C" },
  { value: "d", label: "D" },
  { value: "e", label: "E" },
  { value: "not_applicable", label: "N.v.t." },
  { value: "unknown", label: "Onbekend" }
];

const SECURITY_STATUS_OPTIONS = [
  { value: "aspirant_beveiliger", label: "Aspirant-beveiliger" },
  { value: "beveiliger", label: "Beveiliger" },
  { value: "leidinggevende", label: "Leidinggevende" },
  { value: "not_applicable", label: "N.v.t." },
  { value: "unknown", label: "Onbekend" }
];

const CONTRACT_POLICY_OPTIONS = [
  { value: "strict_contract_match", label: "Strikt contract" },
  { value: "allow_manual_review", label: "Review toestaan" },
  { value: "not_required", label: "Niet vereist" }
];

const BOOLEAN_OPTIONS = [
  { value: NULL_VALUE, label: "Onbekend" },
  { value: "true", label: "Ja" },
  { value: "false", label: "Nee" }
];

const FIELD_MAP = {
  task: {
    cao_key: "cao_key",
    service_function_type: "service_function_type",
    cao_function_group: "required_cao_function_group",
    cao_function_level: "required_cao_function_level",
    security_role_status: "required_security_role_status",
    contract_assignment_policy: "contract_assignment_policy",
    performs_security_work: "performs_security_work",
    security_work_percentage: "security_work_percentage",
    works_event_or_hospitality_security: "works_event_or_hospitality_security",
    event_hospitality_cao_applies: "event_hospitality_cao_applies",
    works_airport_schiphol: "works_airport_schiphol",
    works_cash_value_logistics: "works_cash_value_logistics",
    customer_billable: "customer_billable",
    counts_toward_required_staffing: "counts_toward_required_staffing"
  },
  object: {
    cao_key: "cao_key",
    service_function_type: "default_service_function_type",
    cao_function_group: "default_cao_function_group",
    cao_function_level: "default_cao_function_level",
    security_role_status: "default_security_role_status",
    contract_assignment_policy: "contract_assignment_policy",
    performs_security_work: "default_performs_security_work",
    security_work_percentage: "default_security_work_percentage",
    works_event_or_hospitality_security: "default_works_event_or_hospitality_security",
    event_hospitality_cao_applies: "default_event_hospitality_cao_applies",
    works_airport_schiphol: "default_works_airport_schiphol",
    works_cash_value_logistics: "default_works_cash_value_logistics",
    customer_billable: "default_customer_billable",
    counts_toward_required_staffing: "default_counts_toward_required_staffing"
  }
};

function nullableSelectValue(value) {
  return value === null || value === undefined || value === "" ? NULL_VALUE : String(value);
}

function booleanSelectValue(value) {
  if (value === true) return "true";
  if (value === false) return "false";
  return NULL_VALUE;
}

function parseNullable(value) {
  return value === NULL_VALUE ? null : value;
}

function parseBoolean(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function numberValue(value) {
  if (value === null || value === undefined) return "";
  return value;
}

function FieldSelect({ label, value, options, onChange }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</Label>
      <Select value={nullableSelectValue(value)} onValueChange={(next) => onChange(parseNullable(next))}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NULL_VALUE}>Niet ingesteld</SelectItem>
          {options.map(option => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function BooleanSelect({ label, value, onChange }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</Label>
      <Select value={booleanSelectValue(value)} onValueChange={(next) => onChange(parseBoolean(next))}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {BOOLEAN_OPTIONS.map(option => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function CaoServiceContextFields({ value, onChange, mode = "task" }) {
  const fields = FIELD_MAP[mode] || FIELD_MAP.task;
  const get = (name) => value?.[fields[name]];
  const set = (name, next) => onChange(fields[name], next);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FieldSelect label="CAO" value={get("cao_key")} options={CAO_OPTIONS} onChange={(next) => set("cao_key", next)} />
        <FieldSelect label="Functiesoort" value={get("service_function_type")} options={FUNCTION_TYPE_OPTIONS} onChange={(next) => set("service_function_type", next)} />
        <FieldSelect label="Contractmatch" value={get("contract_assignment_policy")} options={CONTRACT_POLICY_OPTIONS} onChange={(next) => set("contract_assignment_policy", next || "strict_contract_match")} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FieldSelect label="CAO-functiegroep" value={get("cao_function_group")} options={FUNCTION_GROUP_OPTIONS} onChange={(next) => set("cao_function_group", next)} />
        <FieldSelect label="CAO-niveau" value={get("cao_function_level")} options={FUNCTION_LEVEL_OPTIONS} onChange={(next) => set("cao_function_level", next)} />
        <FieldSelect label="Beveiligingsstatus" value={get("security_role_status")} options={SECURITY_STATUS_OPTIONS} onChange={(next) => set("security_role_status", next)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <BooleanSelect label="Beveiligingswerk" value={get("performs_security_work")} onChange={(next) => set("performs_security_work", next)} />
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Beveiligingswerk %</Label>
          <Input
            type="number"
            min="0"
            max="100"
            value={numberValue(get("security_work_percentage"))}
            onChange={(e) => {
              const raw = e.target.value;
              const next = raw === "" ? null : Number(raw);
              set("security_work_percentage", Number.isFinite(next) ? next : null);
            }}
          />
        </div>
        <BooleanSelect label="Schiphol" value={get("works_airport_schiphol")} onChange={(next) => set("works_airport_schiphol", next)} />
        <BooleanSelect label="Geld/waarde" value={get("works_cash_value_logistics")} onChange={(next) => set("works_cash_value_logistics", next)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <BooleanSelect label="Event/horeca" value={get("works_event_or_hospitality_security")} onChange={(next) => set("works_event_or_hospitality_security", next)} />
        <BooleanSelect label="Event-CAO" value={get("event_hospitality_cao_applies")} onChange={(next) => set("event_hospitality_cao_applies", next)} />
        <BooleanSelect label="Facturabel" value={get("customer_billable")} onChange={(next) => set("customer_billable", next)} />
        <BooleanSelect label="Bezetting" value={get("counts_toward_required_staffing")} onChange={(next) => set("counts_toward_required_staffing", next)} />
      </div>
    </div>
  );
}
