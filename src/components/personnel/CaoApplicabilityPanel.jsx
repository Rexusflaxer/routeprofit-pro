import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, ShieldOff, XCircle, Info } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CaoFunctionClassificationPanel from "@/components/personnel/CaoFunctionClassificationPanel";

const SCOPE_LABELS = {
  full_security_worker: "Volledig beveiligingswerk (bijlage 2)",
  non_security_work_article_3_exception: "Artikel 3 lid 2 – geen beveiligingswerk",
  excluded_event_hospitality_security: "Uitgesloten – evenementen-/horecabeveiliging",
  cash_value_logistics: "Geld- en waardelogistiek",
  airport_schiphol: "Schiphol (bijzondere scope)",
  mixed_security_work_manual_review: "Gemengd – handmatige review vereist",
  unknown_manual_review: "Onbekend – handmatige review vereist"
};

const SCOPE_COLORS = {
  full_security_worker: "border-green-200 bg-green-50 text-green-800",
  non_security_work_article_3_exception: "border-amber-200 bg-amber-50 text-amber-800",
  mixed_security_work_manual_review: "border-orange-200 bg-orange-50 text-orange-800",
  unknown_manual_review: "border-red-200 bg-red-50 text-red-800",
  excluded_event_hospitality_security: "border-slate-200 bg-slate-50 text-slate-700",
  cash_value_logistics: "border-blue-200 bg-blue-50 text-blue-800",
  airport_schiphol: "border-indigo-200 bg-indigo-50 text-indigo-800"
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
          works_cash_value_logistics: form.works_cash_value_logistics,
          works_event_or_hospitality_security: form.works_event_or_hospitality_security,
          event_hospitality_cao_applies: form.event_hospitality_cao_applies
        },
        save: !!personnelId
      });
      const data = res.data;
      setResolveResult(data);

      if (data.success) {
        onChange('cao_scope_profile', data.cao_scope_profile);
        onChange('cao_applicability_manual_review_required', data.manual_review_required ?? true);
        onChange('cao_excluded_rule_ids', data.excluded_rule_ids || []);
        onChange('cao_applicable_rule_profile', data.payroll_rule_profile || null);
        onChange('cao_applicability_resolved_at', new Date().toISOString());
        onChange('cao_applicability_source_rule_ids', data.source_rule_ids || []);
        onChange('cao_applicability_warnings', data.warnings || []);
        onChange('cao_excluded_articles', data.excluded_articles || []);
        onChange('cao_excluded_chapters', data.excluded_chapters || []);
        onChange('cao_function_classification', data.function_classification || null);
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
  const isManualReview = scopeProfile === 'mixed_security_work_manual_review' || scopeProfile === 'unknown_manual_review';

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
            type="number" min={0} max={100}
            value={form.security_work_percentage ?? ""}
            onChange={e => onChange("security_work_percentage", e.target.value === "" ? null : Number(e.target.value))}
            placeholder="0–100"
          />
          <p className="text-xs text-muted-foreground">0% = geen beveiliging, 100% = volledig beveiligingswerk</p>
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

        <div className="space-y-1">
          <Label>Evenementen-/horecabeveiliging?</Label>
          <Select
            value={form.works_event_or_hospitality_security === true ? "yes" : form.works_event_or_hospitality_security === false ? "no" : "unknown"}
            onValueChange={v => onChange("works_event_or_hospitality_security", v === "yes" ? true : v === "no" ? false : null)}
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
          <Label>Eigen event/horeca-CAO geldt?</Label>
          <Select
            value={form.event_hospitality_cao_applies === true ? "yes" : form.event_hospitality_cao_applies === false ? "no" : "unknown"}
            onValueChange={v => onChange("event_hospitality_cao_applies", v === "yes" ? true : v === "no" ? false : null)}
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

      {/* Huidig toepassingsprofiel */}
      {scopeProfile && (
        <div className={`rounded-lg border p-3 text-sm ${SCOPE_COLORS[scopeProfile] || 'border-slate-200 bg-slate-50 text-slate-700'}`}>
          <div className="flex items-start gap-2">
            {isFullSecurity ? <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              : isManualReview ? <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
              : <ShieldOff className="w-4 h-4 shrink-0 mt-0.5" />}
            <div className="space-y-1 flex-1">
              <p className="font-medium">{SCOPE_LABELS[scopeProfile] || scopeProfile}</p>
              {form.cao_applicability_resolved_at && (
                <p className="text-xs opacity-70">Bepaald op {new Date(form.cao_applicability_resolved_at).toLocaleDateString('nl-NL')}</p>
              )}
              {isManualReview && (
                <p className="text-xs font-medium">Handmatige review vereist voordat toeslagen/vergoedingen worden berekend.</p>
              )}
              {isNonSecurity && (
                <div className="text-xs space-y-0.5 mt-1">
                  <p className="font-medium">Niet van toepassing (art. 3 lid 2):</p>
                  <p>Art. 10 definitie fulltimer, art. 9 lid 1 sub c, hoofdstuk 4 (behalve 37/38/41), hoofdstuk 5, bijlage 2.</p>
                  <p className="font-medium mt-1">Wel van toepassing:</p>
                  <p>Art. 37 (loonsverhoging), art. 38 (eindejaarsuitkering), art. 41 (feestdagtoeslag), basisloon, vakantiegeld.</p>
                </div>
              )}
              {/* Bronregel-IDs */}
              {(form.cao_applicability_source_rule_ids || []).length > 0 && (
                <div className="text-xs opacity-70 mt-1">
                  Bronregels: {(form.cao_applicability_source_rule_ids || []).join(', ')}
                </div>
              )}
              {/* Conflicten */}
              {(form.cao_applicability_warnings || []).filter(w => w.startsWith('Conflicterende')).map((w, i) => (
                <p key={i} className="text-xs font-medium text-orange-700">{w}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bepaal-knop */}
      <Button type="button" variant="outline" onClick={handleResolve} disabled={resolving} className="gap-2">
        {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
        {resolving ? "Bezig met bepalen..." : "Bepaal CAO-toepassing"}
      </Button>

      {/* Functie-indeling sectie — alleen tonen als scope bepaald is */}
      {(scopeProfile || resolveResult?.success) && (
        <div className="rounded-xl border border-border p-4 mt-2">
          <CaoFunctionClassificationPanel form={form} onChange={onChange} personnelId={personnelId} />
        </div>
      )}

      {/* Resultaat na resolve */}
      {resolveResult && (
        <div className={`rounded-lg border p-3 text-sm ${
          !resolveResult.success ? 'border-red-200 bg-red-50'
          : resolveResult.manual_review_required ? 'border-orange-200 bg-orange-50'
          : 'border-green-200 bg-green-50'
        }`}>
          {resolveResult.success ? (
            <div className="space-y-2">
              <div className={`flex items-center gap-2 font-medium ${resolveResult.manual_review_required ? 'text-orange-800' : 'text-green-800'}`}>
                {resolveResult.manual_review_required
                  ? <XCircle className="w-4 h-4" />
                  : <CheckCircle2 className="w-4 h-4" />}
                {SCOPE_LABELS[resolveResult.cao_scope_profile] || resolveResult.cao_scope_profile}
              </div>

              {resolveResult.manual_review_required && (
                <p className="text-xs font-semibold text-orange-800">Handmatige review vereist</p>
              )}

              {/* Conflicten */}
              {(resolveResult.conflict_details || []).map((c, i) => (
                <p key={i} className="text-xs text-orange-700">Conflict: {c}</p>
              ))}

              {/* Warnings (niet conflicten) */}
              {(resolveResult.warnings || []).filter(w => !w.startsWith('Conflicterende')).map((w, i) => (
                <p key={i} className="text-xs text-amber-700">{w}</p>
              ))}

              {/* Bronregels */}
              {(resolveResult.source_rule_ids || []).length > 0 && (
                <p className="text-xs opacity-60">Bronregels: {resolveResult.source_rule_ids.join(', ')}</p>
              )}

              {/* Wat wel/niet van toepassing */}
              {resolveResult.payroll_rule_profile && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs font-semibold text-slate-700">Toepassingsprofiel:</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                    {[
                      ['Art. 37 loonsverhoging', resolveResult.payroll_rule_profile.apply_article_37_wage_increase],
                      ['Art. 38 eindejaarsuitkering', resolveResult.payroll_rule_profile.apply_article_38_year_end_bonus],
                      ['Art. 40 bijzondere uren', resolveResult.payroll_rule_profile.apply_article_40_special_hours],
                      ['Art. 41 feestdagen', resolveResult.payroll_rule_profile.apply_article_41_holidays],
                      ['Art. 42 overwerk', resolveResult.payroll_rule_profile.apply_article_42_overtime],
                      ['Hfdst. 5 vergoedingen', resolveResult.payroll_rule_profile.apply_chapter_5_reimbursements],
                      ['Bijlage 2 loontabel', resolveResult.payroll_rule_profile.apply_appendix_2_function_scales],
                    ].map(([label, applies]) => (
                      <div key={label} className={`flex items-center gap-1 ${applies ? 'text-green-700' : 'text-red-600'}`}>
                        {applies ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bijlage 2 schaal suggestie */}
              {resolveResult.function_classification?.suggested_cao_scale && (
                <div className="flex items-center gap-1 text-xs text-blue-700 mt-1">
                  <Info className="w-3 h-3" />
                  Suggestie bijlage 2 schaal: {resolveResult.function_classification.suggested_cao_scale}
                  {resolveResult.function_classification.confidence === 'medium' ? ' (indicatief)' : ' (lage zekerheid, controleer handmatig)'}
                </div>
              )}
              {resolveResult.payroll_rule_profile?.apply_appendix_2_function_scales === false && (
                <p className="text-xs text-amber-700">Bijlage 2 loontabel is niet van toepassing. Stel een eigen uurloon in.</p>
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
