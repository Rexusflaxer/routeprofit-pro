import React from "react";
import { CheckCircle, AlertCircle, Clock } from "lucide-react";

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

  const checks = [
    { label: "Naam/weergavenaam", ok: !!form.name },
    { label: "E-mail", ok: !!form.email },
    { label: "Geboortedatum", ok: !!form.date_of_birth },
    { label: "Woonadres", ok: !!(form.street_name && form.city) },
    { label: "Primair bedrijf", ok: !!form.primary_company_id },
    ...(isLoondienst ? [
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