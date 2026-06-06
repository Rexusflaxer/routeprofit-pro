import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, BookOpen, Info } from "lucide-react";
import { base44 } from "@/api/base44Client";

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

const LEVEL_LABELS = {
  aspirant: "Aspirant",
  a: "Niveau A",
  b: "Niveau B",
  c: "Niveau C",
  d: "Niveau D",
  e: "Niveau E",
  leidinggevend: "Leidinggevend (review)",
  not_applicable: "N.v.t.",
  unknown: "Onbekend"
};

const STATUS_CONFIG = {
  resolved: { color: "border-emerald-200 bg-emerald-50", badge: "bg-emerald-100 text-emerald-800", label: "Functie-indeling bepaald" },
  manual_review_required: { color: "border-orange-200 bg-orange-50", badge: "bg-orange-100 text-orange-800", label: "Handmatige review vereist" },
  not_applicable: { color: "border-slate-200 bg-slate-50", badge: "bg-slate-100 text-slate-700", label: "Bijlage 2 niet van toepassing" }
};

function ValidationRow({ label, ok, warn, value, detail }) {
  return (
    <div className="flex items-start justify-between text-xs py-1 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-1.5">
        {ok === true && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
        {ok === false && <XCircle className="w-3 h-3 text-red-500 shrink-0" />}
        {ok === null && <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />}
        <span className={ok === false ? "text-red-700" : ok === null ? "text-amber-700" : "text-slate-700"}>{label}</span>
      </div>
      <span className="text-slate-500 ml-2">{value}</span>
    </div>
  );
}

export default function CaoFunctionClassificationPanel({ form, onChange, personnelId }) {
  const [resolving, setResolving] = useState(false);
  const [result, setResult] = useState(null);

  const handleResolve = async () => {
    setResolving(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke('resolveCaoFunctionClassification', {
        personnel_id: personnelId || undefined,
        personnel: personnelId ? undefined : form,
        work_context: {
          performs_security_work: form.performs_security_work,
          security_work_percentage: form.security_work_percentage
        },
        save: !!personnelId
      });
      const data = res.data;
      setResult(data);

      if (data.success) {
        onChange('cao_function_classification_status', data.classification_status);
        onChange('cao_function_manual_review_reasons', data.manual_review_reasons || []);
        onChange('cao_scale_validation_status', data.scale_valid_for_classification === false
          ? 'invalid'
          : data.classification_status === 'not_applicable'
          ? 'not_applicable'
          : data.manual_review_required ? 'manual_review_required' : 'valid');
        onChange('payroll_final_allowed', data.payroll_final_allowed || false);
        onChange('cao_wage_rate_resolved_at', data.wage_rate_found ? new Date().toISOString() : null);
        if (data.cao_function_group && data.cao_function_group !== 'unknown') {
          onChange('cao_function_group', data.cao_function_group);
        }
        if (data.cao_function_level && data.cao_function_level !== 'unknown') {
          onChange('cao_function_level', data.cao_function_level);
        }
      }
    } catch (e) {
      setResult({ success: false, error: e.message });
    }
    setResolving(false);
  };

  const cachedStatus = form.cao_function_classification_status;
  const cachedValidation = form.cao_scale_validation_status;
  const cachedReasons = form.cao_function_manual_review_reasons || [];

  const statusCfg = STATUS_CONFIG[cachedStatus] || STATUS_CONFIG.manual_review_required;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Functie-indeling bijlage 2 CAO PB</p>
        <Button type="button" variant="outline" size="sm" onClick={handleResolve} disabled={resolving} className="gap-1.5 text-xs h-7">
          {resolving ? <Loader2 className="w-3 h-3 animate-spin" /> : <BookOpen className="w-3 h-3" />}
          {resolving ? "Bezig..." : "Bepaal indeling"}
        </Button>
      </div>

      {/* Huidig opgeslagen status */}
      {cachedStatus && !result && (
        <div className={`rounded-lg border p-3 text-sm ${statusCfg.color}`}>
          <div className="flex items-center gap-2 mb-2">
            {cachedStatus === 'resolved'
              ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              : <AlertTriangle className="w-4 h-4 text-orange-500" />}
            <span className="font-medium text-slate-800">{statusCfg.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.badge}`}>{cachedValidation || '—'}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
            <div><span className="text-slate-400">Functiegroep:</span> {FUNCTION_GROUP_LABELS[form.cao_function_group] || form.cao_function_group || '—'}</div>
            <div><span className="text-slate-400">Niveau:</span> {LEVEL_LABELS[form.cao_function_level] || form.cao_function_level || '—'}</div>
            <div><span className="text-slate-400">CAO-schaal:</span> {form.cao_scale ?? '—'}</div>
            <div><span className="text-slate-400">Periodiek:</span> {form.cao_period ?? '—'}</div>
          </div>
          {cachedReasons.length > 0 && (
            <div className="mt-2 space-y-1">
              {cachedReasons.map((r, i) => (
                <p key={i} className="text-xs text-orange-700 flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{r}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Resultaat na bepaling */}
      {result && (
        <div className={`rounded-lg border p-3 text-sm ${
          !result.success ? 'border-red-200 bg-red-50' :
          result.classification_status === 'resolved' ? 'border-emerald-200 bg-emerald-50' :
          result.classification_status === 'not_applicable' ? 'border-slate-200 bg-slate-50' :
          'border-orange-200 bg-orange-50'
        }`}>
          {!result.success ? (
            <p className="text-red-700 text-xs">Fout: {result.error}</p>
          ) : (
            <div className="space-y-3">
              {/* Status header */}
              <div className="flex items-center gap-2">
                {result.classification_status === 'resolved'
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  : result.classification_status === 'not_applicable'
                  ? <Info className="w-4 h-4 text-slate-500" />
                  : <AlertTriangle className="w-4 h-4 text-orange-500" />}
                <span className="font-semibold text-slate-800">
                  {STATUS_CONFIG[result.classification_status]?.label || result.classification_status}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  result.confidence === 'high' ? 'bg-emerald-100 text-emerald-700' :
                  result.confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {result.confidence === 'high' ? 'Hoge zekerheid' : result.confidence === 'medium' ? 'Gemiddelde zekerheid' : 'Lage zekerheid'}
                </span>
              </div>

              {/* Bijlage 2 check */}
              <div className="text-xs font-medium text-slate-600">
                Bijlage 2: {result.appendix_2_applies
                  ? <span className="text-emerald-700">Van toepassing</span>
                  : <span className="text-slate-500">Niet van toepassing (art. 3 lid 2)</span>}
              </div>

              {/* Classificatie details */}
              {result.appendix_2_applies && (
                <div className="rounded-md bg-white/60 border border-border/50 p-2 space-y-1">
                  <ValidationRow
                    label="Functiegroep"
                    ok={result.cao_function_group && result.cao_function_group !== 'unknown' ? true : false}
                    value={FUNCTION_GROUP_LABELS[result.cao_function_group] || result.cao_function_group || '—'}
                  />
                  <ValidationRow
                    label="Functieniveau"
                    ok={result.cao_function_level && result.cao_function_level !== 'unknown' ? true : false}
                    value={LEVEL_LABELS[result.cao_function_level] || result.cao_function_level || '—'}
                  />
                  <ValidationRow
                    label="Bijlage 2 suggestie schaal"
                    ok={result.suggested_cao_scale ? true : null}
                    value={result.suggested_cao_scale ? `Schaal ${result.suggested_cao_scale}` : 'Onbekend'}
                  />
                  <ValidationRow
                    label="Huidige schaal geldig"
                    ok={result.scale_valid_for_classification === true ? true : result.scale_valid_for_classification === false ? false : null}
                    value={result.current_cao_scale != null
                      ? `Schaal ${result.current_cao_scale}${result.suggested_cao_scale && result.current_cao_scale !== result.suggested_cao_scale ? ` ≠ bijlage 2 schaal ${result.suggested_cao_scale}` : ''}`
                      : 'Niet ingesteld'}
                  />
                  <ValidationRow
                    label="Periodiek geldig"
                    ok={result.period_valid_for_scale === true ? true : result.period_valid_for_scale === false ? false : null}
                    value={result.current_cao_period != null ? `Periodiek ${result.current_cao_period}` : 'Niet ingesteld'}
                  />
                  <ValidationRow
                    label="Uurloon gevonden"
                    ok={result.wage_rate_found}
                    value={result.hourly_rate != null ? `€ ${result.hourly_rate.toFixed(4)}/uur` : 'Niet gevonden'}
                  />
                </div>
              )}

              {/* Payroll final */}
              <div className={`text-xs font-semibold flex items-center gap-1.5 ${result.payroll_final_allowed ? 'text-emerald-700' : 'text-red-700'}`}>
                {result.payroll_final_allowed
                  ? <><CheckCircle2 className="w-3.5 h-3.5" />Payroll-export toegestaan</>
                  : <><XCircle className="w-3.5 h-3.5" />Payroll-export geblokkeerd (openstaande reviews)</>}
              </div>

              {/* Manual review reasons */}
              {result.manual_review_reasons?.length > 0 && (
                <div className="space-y-1">
                  {result.manual_review_reasons.map((r, i) => (
                    <p key={i} className="text-xs text-orange-700 flex items-start gap-1">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{r}
                    </p>
                  ))}
                </div>
              )}

              {/* Warnings */}
              {result.warnings?.filter(w => !result.manual_review_reasons?.includes(w))?.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 flex items-start gap-1">
                  <Info className="w-3 h-3 mt-0.5 shrink-0" />{w}
                </p>
              ))}

              {/* Bronregels */}
              {result.source_rule_ids?.length > 0 && (
                <p className="text-xs text-slate-400">Bronregels: {result.source_rule_ids.join(', ')}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
