import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Calculator } from "lucide-react";

/**
 * Panel voor contractvorm + proeftijdberekening conform CAO PB 2024-2026
 * Integreert met applyCaoContractRules functie
 */
export default function ContractRulesPanel({ form, onChange, personnelId }) {
  const [probationResult, setProbationResult] = useState(null);

  const probationMutation = useMutation({
    mutationFn: () => base44.functions.invoke("applyCaoContractRules", {
      action: "calculate_probation",
      cao_key: form.cao || null,
      company_id: form.primary_company_id || null,
      contract_form: form.contract_form,
      underlying_contract_form: form.underlying_contract_form || null,
      contract_start_date: form.contract_start_date,
      contract_end_date: form.contract_end_date,
      security_role_status: form.security_role_status,
      function_type: form.function_type || null,
      cao_function_group: form.cao_function_group || null,
      cao_function_level: form.cao_function_level || null,
      personnel: personnelId ? null : form,
      contract: {
        company_id: form.primary_company_id || null,
        cao_key: form.cao || null,
        contract_form: form.contract_form || "unknown",
        underlying_contract_form: form.underlying_contract_form || null,
        contract_start_date: form.contract_start_date || null,
        contract_end_date: form.contract_end_date || null,
        security_role_status: form.security_role_status || "unknown",
        function_type: form.function_type || null,
        cao_function_group: form.cao_function_group || null,
        cao_function_level: form.cao_function_level || null,
        performs_security_work: form.performs_security_work ?? null,
        security_work_percentage: form.security_work_percentage ?? null,
        works_airport_schiphol: form.works_airport_schiphol ?? null,
        works_cash_value_logistics: form.works_cash_value_logistics ?? null,
        works_event_or_hospitality_security: form.works_event_or_hospitality_security ?? null,
        event_hospitality_cao_applies: form.event_hospitality_cao_applies ?? null
      },
      personnel_id: personnelId || null
    }),
    onSuccess: (res) => {
      setProbationResult(res.data);
      if (res.data?.probation_period_months !== undefined && res.data?.probation_period_months !== null) {
        onChange("probation_period_months", res.data.probation_period_months);
        onChange("probation_period_source_rule_id", res.data.source_rule_ids?.[0] || null);
      }
    }
  });

  const probationOverridden = form.probation_period_months !== null &&
    probationResult !== null &&
    form.probation_period_months !== probationResult?.probation_period_months;

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Contractvorm & CAO-regels
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Contractvorm</Label>
          <Select
            value={form.contract_form || "unknown"}
            onValueChange={v => {
              onChange("contract_form", v);
              if (v !== "oproep") onChange("underlying_contract_form", null);
              setProbationResult(null);
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bepaalde_tijd">Bepaalde tijd</SelectItem>
              <SelectItem value="onbepaalde_tijd">Onbepaalde tijd</SelectItem>
              <SelectItem value="oproep">Oproep / 0-uren</SelectItem>
              <SelectItem value="stage">Stage</SelectItem>
              <SelectItem value="uitzend">Uitzend</SelectItem>
              <SelectItem value="payroll">Payroll</SelectItem>
              <SelectItem value="zzp">ZZP</SelectItem>
              <SelectItem value="unknown">Onbekend</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {form.contract_form === "oproep" && (
          <div className="space-y-1">
            <Label>Onderliggende duurvorm oproepcontract</Label>
            <Select
              value={form.underlying_contract_form || "unknown"}
              onValueChange={v => { onChange("underlying_contract_form", v); setProbationResult(null); }}
            >
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
          <Label>Beveiligingsfunctie-status</Label>
          <Select
            value={form.security_role_status || "unknown"}
            onValueChange={v => { onChange("security_role_status", v); setProbationResult(null); }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="aspirant_beveiliger">Aspirant-beveiliger</SelectItem>
              <SelectItem value="beveiliger">Beveiliger</SelectItem>
              <SelectItem value="leidinggevende">Leidinggevende</SelectItem>
              <SelectItem value="not_applicable">Niet van toepassing</SelectItem>
              <SelectItem value="unknown">Onbekend</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Startdatum contract</Label>
          <Input
            type="date"
            value={form.contract_start_date || ""}
            onChange={e => { onChange("contract_start_date", e.target.value); setProbationResult(null); }}
          />
        </div>

        {form.contract_form === "bepaalde_tijd" && (
          <div className="space-y-1">
            <Label>Einddatum contract</Label>
            <Input
              type="date"
              value={form.contract_end_date || ""}
              onChange={e => { onChange("contract_end_date", e.target.value); setProbationResult(null); }}
            />
          </div>
        )}
      </div>

      {/* Proeftijdberekening */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Proeftijd (CAO berekening)</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => probationMutation.mutate()}
            disabled={probationMutation.isPending || !form.cao || !form.contract_form || form.contract_form === "unknown"}
            className="gap-1.5"
          >
            <Calculator className="w-3.5 h-3.5" />
            {probationMutation.isPending ? "Berekenen..." : "Bereken CAO-proeftijd"}
          </Button>
        </div>

        {probationMutation.isError && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {probationMutation.error?.response?.data?.error ||
              probationMutation.error?.message ||
              "CAO-proeftijd kon niet worden berekend. Controleer contract-CAO en contractgegevens."}
          </p>
        )}

        {probationResult && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {probationResult.probation_period_months !== null ? (
                <>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium">
                    {probationResult.probation_period_months === 0
                      ? "Geen proeftijd"
                      : `${probationResult.probation_period_months} maand${probationResult.probation_period_months > 1 ? "en" : ""} proeftijd`}
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span className="text-sm text-muted-foreground">Kan niet worden berekend</span>
                </>
              )}
              {probationResult.source_rule_ids?.map(rid => (
                <Badge key={rid} variant="outline" className="text-xs font-mono">{rid}</Badge>
              ))}
            </div>
            {probationResult.contract_duration_months && (
              <p className="text-xs text-muted-foreground">
                Contractduur: {probationResult.contract_duration_months} maanden
              </p>
            )}
            {probationResult.warnings?.map((w, i) => (
              <p key={i} className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />{w}
              </p>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Proeftijd (maanden) — CAO berekend</Label>
            <Input
              type="number"
              min="0"
              max="3"
              value={form.probation_period_months ?? ""}
              readOnly
              className="bg-muted cursor-not-allowed opacity-70"
              placeholder="Klik 'Bereken CAO-proeftijd'"
            />
            <p className="text-xs text-muted-foreground">Alleen instelbaar via CAO-berekening</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Bronregel</Label>
            <Input
              value={form.probation_period_source_rule_id || ""}
              placeholder="CAO-PB-2024-R0315"
              className="font-mono text-xs bg-muted cursor-not-allowed opacity-70"
              readOnly
            />
          </div>
        </div>

        {/* Compliance override — only show if user explicitly requests deviation */}
        <div className="space-y-1">
          <Label className="text-xs text-amber-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Afwijking van CAO (compliance uitzondering)
          </Label>
          <Input
            value={form.probation_override_reason || ""}
            onChange={e => onChange("probation_override_reason", e.target.value)}
            placeholder="Laat leeg tenzij er een gedocumenteerde reden voor afwijking is"
            className={form.probation_override_reason ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : ""}
          />
          {form.probation_override_reason && (
            <p className="text-xs text-amber-600">
              Let op: afwijking van CAO-default wordt opgeslagen als compliance-uitzondering.
            </p>
          )}
        </div>
      </div>

      {/* Brancheancienniteit */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Brancheancienniteit start</Label>
          <Input
            type="date"
            value={form.industry_start_date || ""}
            onChange={e => onChange("industry_start_date", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Brancheancienniteit (loonperioden)</Label>
          <Input
            type="number"
            min="0"
            value={form.industry_seniority_pay_periods ?? ""}
            onChange={e => onChange("industry_seniority_pay_periods", e.target.value === "" ? null : Number(e.target.value))}
            placeholder="Berekend o.b.v. startdatum"
          />
          <p className="text-xs text-muted-foreground">Relevant voor wachtdag ziekte (art. R1149)</p>
        </div>
      </div>
    </div>
  );
}
