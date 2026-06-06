import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { base44 } from "@/api/base44Client";

const SCOPE_LABELS = {
  full_security_worker: "Volledig beveiligingswerk",
  non_security_work_article_3_exception: "Artikel 3 lid 2 – geen beveiligingswerk",
  excluded_event_hospitality_security: "Uitgesloten – evenementen/horeca",
  cash_value_logistics: "Geld- en waardelogistiek",
  airport_schiphol: "Schiphol",
  unknown_manual_review: "Onbekend – handmatige review"
};

const FUNCTION_GROUP_LABELS = {
  objectbeveiliger_receptionist: "Objectbeveiliger / Receptionist",
  mobiel_surveillant: "Mobiel surveillant",
  winkelsurveillant: "Winkelsurveillant",
  brandwacht: "Brandwacht",
  geld_waardetransporteur: "Geld- en waardetransporteur",
  centralist: "Centralist",
  non_security_staff: "Niet-beveiligingspersoneel",
  unknown: "Onbekend"
};

export default function CaoApplicabilityPanel({ form, onChange, personnelId }) {
  const [resolving, setResolving] = useState(false);
  const [resolveResult, setResolveResult] = useState(null);

  const handleResolve = async () => {
    setResolving(true);
    setResolveResult(null);
    try {
      const res = await base44.functions.invoke('resolveCaoApplicability', {
        personnel_id: personnelId || undefined,
        personnel: personnelId ? undefined : form,
        work_context: {
          performs_security_work: form.performs_security_work,
          security_work_percentage: form.security_work_percentage,
          works_airport_schiphol: form.works_airport_schiphol,
          works_cash_value_logistics: form.works_cash_value_logistics
        },
        save: !!personnelId
      });
      const data = res.data;
      setResolveResult(data);

      if (data.success) {
        onChange('cao_scope_profile', data.cao_scope_profile);
        onChange('cao_applicability_manual_review_required', data.function_classification?.manual_review_required ?? true);
        onChange('cao_excluded_rule_ids', data.excluded_rule_ids || []);
        onChange('cao_applicable_rule_profile', data.payroll_rule_profile || null);
        onChange('cao_applicability_resolved_at', new Date().toISOString());
        if (data.function_classification?.cao_function_group && data.function_classification.cao_function_group !== 'unknown') {
          onChange('cao_function_group', data.function_classification.cao_function_group);
        }
      }
    } catch (e) {
      setResolveResult({ success: false, error: e.message });
    }
    setResolving(false);
  };

  const scopeProfile = form.cao_scope_profile;
  const isNonSecurity = scopeProfile === 'non_security_work_article_3_exception';
  const isFullSecurity = scopeProfile === 'full_security_worker';

  return (
    <div className="space-y-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CAO PB toepassingsprofiel</p>

      {/* Functietitel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Vrije functietitel</Label>
          <Input
            value={form.job_title_raw || ""}
            onChange={e => onChange("job_title_raw", e.target.value)}
            placeholder="Bijv. Klantrelatie medewerker, Objectbeveiliger"
          />
        </div>

        {/* Beveiligingswerk ja/nee/onbekend */}
        <div className="space-y-1">
          <Label>Doet medewerker normaal beveiligingswerk?</Label>
          <Select
            value={
              form.performs_security_work === true ? "yes"
              : form.performs_security_work === false ? "no"
              : "unknown"
            }
            onValueChange={v => onChange("performs_security_work", v === "yes" ? true : v === "no" ? false : null)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Ja – conform bijlage 2 CAO PB</SelectItem>
              <SelectItem value="no">Nee – normaal geen beveiligingswerk</SelectItem>
              <SelectItem value="unknown">Onbekend</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Percentage en functiegroep */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>% beveiligingswerk</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={form.security_work_percentage ?? ""}
            onChange={e => onChange("security_work_percentage", e.target.value === "" ? null : Number(e.target.value))}
            placeholder="0–100"
          />
        </div>

        <div className="space-y-1">
          <Label>CAO-functiegroep</Label>
          <Select
            value={form.cao_function_group || "unknown"}
            onValueChange={v => onChange("cao_function_group", v === "unknown" ? null : v)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(FUNCTION_GROUP_LABELS).map(([k, l]) => (
                <SelectItem key={k} value={k}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Functieniveau</Label>
          <Select
            value={form.cao_function_level || "unknown"}
            onValueChange={v => onChange("cao_function_level", v === "unknown" ? null : v)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="aspirant">Aspirant</SelectItem>
              <SelectItem value="a">A</SelectItem>
              <SelectItem value="b">B</SelectItem>
              <SelectItem value="c">C</SelectItem>
              <SelectItem value="d">D</SelectItem>
              <SelectItem value="e">E</SelectItem>
              <SelectItem value="leidinggevend">Leidinggevend</SelectItem>
              <SelectItem value="not_applicable">N.v.t.</SelectItem>
              <SelectItem value="unknown">Onbekend</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bijzondere scopes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Werkt op Schiphol?</Label>
          <Select
            value={form.works_airport_schiphol === true ? "yes" : form.works_airport_schiphol === false ? "no" : "unknown"}
            onValueChange={v => onChange("works_airport_schiphol", v === "yes" ? true : v === "no" ? false : null)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Ja</SelectItem>
              <SelectItem value="no">Nee</SelectItem>
              <SelectItem value="unknown">Onbekend</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Geld- en waardelogistiek?</Label>
          <Select
            value={form.works_cash_value_logistics === true ? "yes" : form.works_cash_value_logistics === false ? "no" : "unknown"}
            onValueChange={v => onChange("works_cash_value_logistics", v === "yes" ? true : v === "no" ? false : null)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Ja</SelectItem>
              <SelectItem value="no">Nee</SelectItem>
              <SelectItem value="unknown">Onbekend</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Artikel 3 lid 2 waarschuwing */}
      {form.performs_security_work === false && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex gap-2 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
          <div>
            <p className="font-medium">Artikel 3 lid 2 – beperkte CAO-toepassing</p>
            <p className="text-xs mt-1">Hoofdstuk 4 (behalve art. 37/38/41), hoofdstuk 5 en bijlage 2 zijn <strong>niet</strong> van toepassing. Bijzondere uren- en reistijdtoeslagen vervallen. Feestdagen en vakantiegeld blijven gelden.</p>
          </div>
        </div>
      )}

      {/* Huidig toepassingsprofiel */}
      {scopeProfile && (
        <div className={`rounded-lg border p-3 flex gap-2 text-sm ${
          isFullSecurity ? 'border-green-200 bg-green-50 text-green-800'
          : isNonSecurity ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-slate-200 bg-slate-50 text-slate-700'
        }`}>
          {isFullSecurity ? <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" /> : <ShieldOff className="w-4 h-4 shrink-0 mt-0.5" />}
          <div>
            <p className="font-medium">Huidig profiel: {SCOPE_LABELS[scopeProfile] || scopeProfile}</p>
            {form.cao_applicability_resolved_at && (
              <p className="text-xs mt-0.5 opacity-70">Bepaald op {new Date(form.cao_applicability_resolved_at).toLocaleDateString('nl-NL')}</p>
            )}
          </div>
        </div>
      )}

      {/* Resolve knop */}
      <Button type="button" variant="outline" onClick={handleResolve} disabled={resolving} className="gap-2">
        {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
        {resolving ? "Bezig met bepalen..." : "Bepaal CAO-toepassing"}
      </Button>

      {/* Resultaat */}
      {resolveResult && (
        <div className={`rounded-lg border p-3 text-sm ${resolveResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          {resolveResult.success ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-medium text-green-800">
                <CheckCircle2 className="w-4 h-4" />
                {SCOPE_LABELS[resolveResult.cao_scope_profile] || resolveResult.cao_scope_profile}
              </div>
              {resolveResult.warnings?.map((w, i) => (
                <p key={i} className="text-xs text-amber-700">{w}</p>
              ))}
              {resolveResult.function_classification?.manual_review_required && (
                <p className="text-xs text-amber-700">⚠ Handmatige review vereist voor functieindeling</p>
              )}
            </div>
          ) : (
            <p className="text-red-700">Fout: {resolveResult.error}</p>
          )}
        </div>
      )}
    </div>
  );
}