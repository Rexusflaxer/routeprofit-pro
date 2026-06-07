import React from "react";
import { CheckCircle, AlertCircle, Clock, XCircle } from "lucide-react";

function CheckItem({ ok, warn, label }) {
  if (ok) return (
    <div className="flex items-center gap-2 text-sm text-emerald-700">
      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
      {label}
    </div>
  );
  if (warn) return (
    <div className="flex items-center gap-2 text-sm text-amber-700">
      <Clock className="w-4 h-4 text-amber-500 shrink-0" />
      {label}
    </div>
  );
  return (
    <div className="flex items-center gap-2 text-sm text-red-700">
      <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
      {label}
    </div>
  );
}

export default function WizardStep8Review({ form, sensitiveData, idDoc, bankAccount, iceContacts, vogDoc }) {
  const isLoondienst = form.employee_type === "loondienst";
  const today = new Date();

  const expiryStatus = (date) => {
    if (!date) return null;
    const d = new Date(date);
    const diff = (d - today) / (1000 * 60 * 60 * 24);
    if (diff < 0) return "expired";
    if (diff <= 30) return "soon_30";
    if (diff <= 60) return "soon_60";
    if (diff <= 90) return "soon_90";
    return "ok";
  };

  // CAO-checks
  const scopeProfile = form.cao_scope_profile;
  const isScopeResolved = !!scopeProfile && !['unknown_manual_review', 'mixed_security_work_manual_review'].includes(scopeProfile);
  const isNonSecurity = scopeProfile === 'non_security_work_article_3_exception';
  const classificationStatus = form.cao_function_classification_status;
  const classificationOk = classificationStatus === 'resolved' || classificationStatus === 'not_applicable';
  const scaleValidationStatus = form.cao_scale_validation_status;
  const scaleOk = scaleValidationStatus === 'valid' || scaleValidationStatus === 'not_applicable';
  const hasBasis = isNonSecurity
    ? Number(form.custom_hourly_rate || 0) > 0
    : !!(form.cao_scale != null && form.cao_period != null);
  const payrollFinal = form.payroll_final_allowed === true;
  const classificationManualReasons = form.cao_function_manual_review_reasons || [];

  const checks = [
    { label: "Naam/weergavenaam", ok: !!form.name },
    { label: "E-mail", ok: !!form.email },
    { label: "Geboortedatum", ok: !!form.date_of_birth },
    { label: "Woonadres", ok: !!(form.street_name && form.city) },
    { label: "Primair bedrijf", ok: !!form.primary_company_id },
    { label: "Functietype gekozen", ok: !!form.function_type },
    ...(isLoondienst ? [
      { label: "Contract-CAO gekozen", ok: !!form.cao },
      { label: "Contractvorm gekozen", ok: !!form.contract_form && form.contract_form !== "unknown" },
      ...(form.contract_form === "oproep" ? [
        { label: "Onderliggende oproep-duurvorm", ok: !!form.underlying_contract_form && form.underlying_contract_form !== "unknown" },
      ] : []),
      { label: "Contractstartdatum", ok: !!form.contract_start_date },
      { label: "BSN (beveiligd)", ok: !!sensitiveData.bsn },
      { label: "Loonheffingsverklaring", ok: !!(form.payroll_tax_statement_file_url || form.payroll_tax_credit_applies !== undefined) },
      { label: "Identiteitsdocument", ok: !!(idDoc.document_type && (idDoc.front_file_url || idDoc.document_number)) },
      { label: "Bankrekening", ok: !!bankAccount.iban },
    ] : []),
  ];

  const complete = checks.every(c => c.ok);

  const expiryDocs = [
    { label: "Identiteitsdocument", date: idDoc.valid_until },
    { label: "VOG", date: vogDoc.valid_until },
    { label: "Wpbr toestemming", date: form.wpbr_permission_valid_until },
  ].filter(d => d.date);

  return (
    <div className="space-y-6">
      {/* Completeness */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Volledigheidscheck</p>
        <div className={`rounded-xl p-4 border space-y-2 ${complete ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          {checks.map((c, i) => <CheckItem key={i} ok={c.ok} label={c.label} />)}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {complete ? "✓ Dossier volledig voor loonadministratie." : "Ontbrekende gegevens kunnen later worden aangevuld."}
        </p>
      </div>

      {/* Vervaldatums */}
      {expiryDocs.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Vervaldatums</p>
          <div className="space-y-2">
            {expiryDocs.map((d, i) => {
              const s = expiryStatus(d.date);
              return (
                <div key={i} className="flex items-center justify-between text-sm rounded-lg border border-border p-2">
                  <span>{d.label}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    s === "expired" ? "bg-red-100 text-red-700" :
                    s === "soon_30" ? "bg-orange-100 text-orange-700" :
                    s === "soon_60" ? "bg-amber-100 text-amber-700" :
                    "bg-emerald-100 text-emerald-700"
                  }`}>
                    {s === "expired" ? "Verlopen" :
                     s === "soon_30" ? "Verloopt < 30 dgn" :
                     s === "soon_60" ? "Verloopt < 60 dgn" : d.date}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CAO-checks */}
      {isLoondienst && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">CAO-toepassingsprofiel & loonschaal</p>
          <div className={`rounded-xl p-4 border space-y-2 ${payrollFinal ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <CheckItem ok={isScopeResolved} label={
              isScopeResolved
                ? `CAO-toepassing bepaald (${scopeProfile})`
                : scopeProfile
                  ? `CAO-toepassing vereist review (${scopeProfile})`
                  : "CAO-toepassing nog niet bepaald"
            } />
            <CheckItem ok={classificationOk} warn={!classificationStatus} label={
              classificationStatus === 'resolved' ? "Functie-indeling bijlage 2 bepaald"
              : classificationStatus === 'not_applicable' ? "Bijlage 2 niet van toepassing (art. 3 lid 2)"
              : classificationStatus === 'manual_review_required' ? "Functie-indeling vereist handmatige review"
              : "Functie-indeling nog niet bepaald"
            } />
            <CheckItem ok={scaleOk} warn={!scaleValidationStatus} label={
              scaleValidationStatus === 'valid' ? `Loonschaal geldig (schaal ${form.cao_scale}, periodiek ${form.cao_period})`
              : scaleValidationStatus === 'not_applicable' ? "Loonschaal bijlage 2 niet van toepassing"
              : scaleValidationStatus === 'invalid' ? `Loonschaal ongeldig – schaal ${form.cao_scale} wijkt af van bijlage 2 of periodiek ontbreekt`
              : scaleValidationStatus === 'manual_review_required' ? "Loonschaal vereist handmatige review"
              : "Loonschaal/periodiek nog niet gevalideerd"
            } />
            <CheckItem ok={hasBasis} label={
              hasBasis
                ? (isNonSecurity ? "Eigen uurloon aanwezig" : "Loonbasis aanwezig")
                : (isNonSecurity
                  ? "Loonbasis ontbreekt – eigen uurloon verplicht omdat bijlage 2 niet van toepassing is"
                  : "Loonbasis ontbreekt – stel schaal/periodiek in")
            } />
            <CheckItem ok={payrollFinal} label={
              payrollFinal
                ? "Payroll-export toegestaan"
                : "Payroll-export geblokkeerd – openstaande reviews"
            } />

            {classificationManualReasons.length > 0 && (
              <div className="mt-2 pt-2 border-t border-amber-200 space-y-1">
                <p className="text-xs font-semibold text-amber-800">Openstaande functiereview-punten:</p>
                {classificationManualReasons.map((r, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                    <XCircle className="w-3 h-3 mt-0.5 shrink-0 text-red-500" />{r}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ICE */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">ICE-contacten</p>
        {iceContacts.length > 0
          ? <p className="text-sm text-emerald-700">✓ {iceContacts.length} noodcontact(en) opgegeven</p>
          : <p className="text-sm text-amber-700">⚠ Geen noodcontacten opgegeven</p>}
      </div>
    </div>
  );
}
