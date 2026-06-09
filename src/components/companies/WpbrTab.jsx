import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, Plus, X, Check, ExternalLink, ChevronRight, ChevronLeft } from "lucide-react";

const WPBR_TYPES = [
  { key: "ND",  label: "ND — Particuliere beveiligingsorganisatie",  desc: "Een organisatie die voor derde partijen beveiligingswerkzaamheden gaat verrichten en daarvoor vooral personen gebruikt. Hieronder vallen ook persoonsbeveiliging en beveiliging door voetbalstewards." },
  { key: "HND", label: "HND — Particulier beveiligingsbedrijf alleen voor horecabeveiliging", desc: "Een organisatie die voor derde partijen alleen in de horeca beveiligingswerkzaamheden gaat verrichten." },
  { key: "BD",  label: "BD — Particuliere bedrijfsbeveiligingsdienst", desc: "Een bedrijfsbeveiligingsdienst die voor de eigen onderneming beveiligingswerkzaamheden verricht." },
  { key: "HBD", label: "HBD — Particuliere bedrijfsbeveiligingsdienst voor de eigen horecaonderneming", desc: "Een bedrijfsbeveiligingsdienst die voor de eigen horecaonderneming(en) beveiligingswerkzaamheden verricht." },
  { key: "POB", label: "POB — Particulier Recherchebureau", desc: "Organisatie die met winstoogmerk recherchewerkzaamheden voor derden uitvoert." },
  { key: "PAC", label: "PAC — Particuliere Alarmcentrale", desc: "Een particuliere alarmcentrale die voor derden alarmsignalen ontvangt en beoordeelt. Indien nodig wordt assistentie gevraagd van de politie, andere overheidsinstanties of een particulier beveiligingsbedrijf." },
  { key: "VTC", label: "VTC — Particuliere Video Toezicht Centrale", desc: "Een videotoezichtcentrale die voor derden videobeelden ontvangt en beoordeelt. Indien nodig wordt assistentie gevraagd van de politie, andere overheidsinstanties of particulieren." },
  { key: "PGW", label: "PGW — Particulier Geld- en Waardentransportbedrijf", desc: "Een onderneming die voor derden geld en goederen van grote waarden vervoert." },
];

const EMPTY_FORM = {
  license_type: "", license_number: "", valid_from: "", valid_until: "",
  notes: "", document_file_url: "", document_filename: ""
};

function LicenseStatusBadge({ license }) {
  const today = new Date().toISOString().split("T")[0];
  const isExpired = license.valid_until && license.valid_until < today;
  if (license.status === "superseded") return <Badge variant="outline" className="text-xs text-muted-foreground">Vervangen</Badge>;
  if (isExpired || license.status === "expired") return <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Verlopen</Badge>;
  return <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200 border-0">Actief</Badge>;
}

// Step indicator
function WizardSteps({ step }) {
  const steps = ["Type", "Gegevens", "Document"];
  return (
    <div className="flex items-center gap-1 mb-4">
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-colors ${
            i + 1 === step ? "bg-primary text-primary-foreground" :
            i + 1 < step  ? "bg-muted text-muted-foreground line-through" :
                            "text-muted-foreground"
          }`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
              i + 1 === step ? "bg-primary-foreground text-primary" :
              i + 1 < step  ? "bg-muted-foreground/40 text-muted-foreground" :
                              "border border-muted-foreground/30 text-muted-foreground"
            }`}>{i + 1}</span>
            {s}
          </div>
          {i < steps.length - 1 && <div className="h-px flex-1 bg-border" />}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function WpbrTab({ companyId }) {
  const queryClient = useQueryClient();
  const wizardRef = useRef(null);
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: licenses = [] } = useQuery({
    queryKey: ["wpbr-licenses", companyId],
    queryFn: () => base44.entities.CompanyWpbrLicense.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const active = licenses.filter(l => l.status === "active");
      await Promise.all(active.map(l => base44.entities.CompanyWpbrLicense.update(l.id, { status: "superseded" })));
      return base44.entities.CompanyWpbrLicense.create({ ...data, company_id: companyId, status: "active" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wpbr-licenses", companyId] });
      cancelWizard();
    },
  });

  const cancelWizard = () => {
    setShowWizard(false);
    setStep(1);
    setForm(EMPTY_FORM);
  };

  const handleUpload = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(f => ({ ...f, document_file_url: file_url, document_filename: file.name }));
    } finally {
      setUploading(false);
    }
  };

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const activeLicenses = licenses.filter(l => l.status === "active");
  const historicLicenses = licenses.filter(l => l.status !== "active");

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">WPBR-vergunningen</h3>
        {!showWizard && (
          <Button size="sm" variant="outline" onClick={() => { setShowWizard(true); setTimeout(() => wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50); }}>
            <Plus className="w-4 h-4 mr-1" /> Nieuwe vergunning
          </Button>
        )}
      </div>

      {/* Wizard */}
      {showWizard && (
        <div ref={wizardRef} className="rounded-lg border border-primary/30 bg-muted/20 p-5">
          <WizardSteps step={step} />

          {/* Step 1: Kies type */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Kies het vergunningstype</p>
              <div className="grid grid-cols-1 gap-2">
                {WPBR_TYPES.map(t => (
                  <button
                    key={t.key}
                    onClick={() => { set("license_type", t.key); setStep(2); }}
                    className={`flex items-start justify-between px-4 py-3 rounded-lg border text-left transition-all hover:border-primary hover:bg-accent ${
                      form.license_type === t.key ? "border-primary bg-accent" : "border-border bg-card"
                    }`}
                  >
                    <div className="flex-1 pr-2">
                      <p className="text-sm font-semibold text-foreground">{t.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  </button>
                ))}
              </div>
              <div className="flex justify-end pt-1">
                <Button variant="ghost" size="sm" onClick={cancelWizard}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
              </div>
            </div>
          )}

          {/* Step 2: Vergunningsgegevens */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">
                Vergunningsgegevens — <span className="text-muted-foreground font-normal">{form.license_type}</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Vergunningsnummer</label>
                  <Input value={form.license_number} onChange={e => set("license_number", e.target.value)} className="h-8 text-sm" placeholder="Nummer..." />
                </div>
                <div className="sm:col-span-1" />
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Geldig vanaf</label>
                  <Input type="date" value={form.valid_from} onChange={e => set("valid_from", e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Geldig tot</label>
                  <Input type="date" value={form.valid_until} onChange={e => set("valid_until", e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Opmerkingen</label>
                <Input value={form.notes} onChange={e => set("notes", e.target.value)} className="h-8 text-sm" placeholder="Optioneel..." />
              </div>
              <div className="flex justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                <Button size="sm" onClick={() => setStep(3)}>Volgende <ChevronRight className="w-4 h-4 ml-1" /></Button>
              </div>
            </div>
          )}

          {/* Step 3: Document uploaden + opslaan */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-foreground">Vergunningsdocument uploaden</p>
              <p className="text-xs text-muted-foreground">Upload optioneel het officiële vergunningsdocument (PDF of afbeelding).</p>

              {form.document_file_url ? (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card">
                  <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                  <a href={form.document_file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex-1 truncate">
                    {form.document_filename || "Document"}
                  </a>
                  <button onClick={() => set("document_file_url", "")} className="text-muted-foreground hover:text-destructive">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed border-border hover:border-primary cursor-pointer transition-colors">
                  <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                  <Upload className="w-6 h-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{uploading ? "Uploaden..." : "Klik om document te uploaden"}</span>
                  <span className="text-xs text-muted-foreground">PDF of afbeelding</span>
                </label>
              )}

              <div className="flex justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => setStep(2)}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                  <Button size="sm" onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}>
                    <Check className="w-4 h-4 mr-1" /> {createMutation.isPending ? "Opslaan..." : "Vergunning opslaan"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active licenses */}
      {activeLicenses.length === 0 && !showWizard && (
        <p className="text-sm text-muted-foreground">Nog geen vergunning geregistreerd.</p>
      )}
      {activeLicenses.map(l => (
        <LicenseCard key={l.id} license={l} />
      ))}

      {/* Historic licenses */}
      {historicLicenses.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vorige vergunningen</p>
          {historicLicenses.map(l => (
            <LicenseCard key={l.id} license={l} muted />
          ))}
        </div>
      )}
    </div>
  );
}

function LicenseCard({ license, muted }) {
  return (
    <div className={`rounded-lg border p-4 space-y-2 ${muted ? "border-border/50 opacity-70" : "border-border bg-card"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{license.license_type || "Onbekend type"}</span>
          {license.license_number && <span className="text-sm text-muted-foreground">#{license.license_number}</span>}
          <LicenseStatusBadge license={license} />
        </div>
        {license.document_file_url && (
          <a href={license.document_file_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0">
            <FileText className="w-3.5 h-3.5" /> Document <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      <div className="flex gap-6 text-xs text-muted-foreground">
        {license.valid_from && <span>Vanaf: <strong className="text-foreground">{license.valid_from}</strong></span>}
        {license.valid_until && <span>Tot: <strong className="text-foreground">{license.valid_until}</strong></span>}
      </div>
      {license.notes && <p className="text-xs text-muted-foreground">{license.notes}</p>}
    </div>
  );
}