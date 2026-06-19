import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Check, X, Globe, AlertTriangle } from "lucide-react";

// EU/EEA nationalities that can carry an identity card
const EU_EEA_NATIONALITIES = new Set([
  "Nederlandse", "Belgische", "Duitse", "Franse", "Italiaanse", "Spaanse", "Portugese",
  "Griekse", "Oostenrijkse", "Zweedse", "Finse", "Deense", "Ierse", "Luxemburgse",
  "Poolse", "Tsjechische", "Slowaakse", "Hongaarse", "Roemeense", "Bulgaarse",
  "Kroatische", "Sloveense", "Estse", "Letse", "Litouwse", "Maltese",
  "Cypriotische", "Zwitserse", "Noorse", "IJslandse",
]);

const NATIONALITY_TO_COUNTRY = {
  "Nederlandse": "Nederland", "Belgische": "België", "Duitse": "Duitsland",
  "Franse": "Frankrijk", "Italiaanse": "Italië", "Spaanse": "Spanje",
  "Portugese": "Portugal", "Griekse": "Griekenland", "Oostenrijkse": "Oostenrijk",
  "Zweedse": "Zweden", "Finse": "Finland", "Deense": "Denemarken",
  "Ierse": "Ierland", "Luxemburgse": "Luxemburg", "Poolse": "Polen",
  "Tsjechische": "Tsjechië", "Slowaakse": "Slowakije", "Hongaarse": "Hongarije",
  "Roemeense": "Roemenië", "Bulgaarse": "Bulgarije", "Kroatische": "Kroatië",
  "Sloveense": "Slovenië", "Estse": "Estland", "Letse": "Letland",
  "Litouwse": "Litouwen", "Maltese": "Malta", "Cypriotische": "Cyprus",
  "Zwitserse": "Zwitserland", "Noorse": "Noorwegen", "IJslandse": "IJsland",
  "Turkse": "Turkije", "Marokkaanse": "Marokko", "Algerijnse": "Algerije",
  "Tunesische": "Tunesië", "Egyptische": "Egypte", "Nigeriaanse": "Nigeria",
  "Ghanese": "Ghana", "Somalische": "Somalië", "Eritrese": "Eritrea",
  "Ethiopische": "Ethiopië", "Surinaamse": "Suriname", "Indonesische": "Indonesië",
  "Chinese": "China", "Indiaase": "India", "Pakistaanse": "Pakistan",
  "Syrische": "Syrië", "Iraakse": "Irak", "Iraanse": "Iran",
  "Afghaanse": "Afghanistan", "Oekraïense": "Oekraïne", "Russische": "Rusland",
  "Kazachse": "Kazachstan", "Congolese": "Congo", "Soedanese": "Soedan",
  "Libische": "Libië", "Jordaanse": "Jordanië", "Libanese": "Libanon",
  "Braziliaanse": "Brazilië", "Mexicaanse": "Mexico", "Colombiaanse": "Colombia",
};

function WizardSteps({ step, labels }) {
  return (
    <div className="flex items-center gap-1 mb-4">
      {labels.map((label, i) => (
        <React.Fragment key={label}>
          <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-colors ${
            i + 1 === step ? "bg-primary text-primary-foreground" :
            i + 1 < step ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" :
            "text-muted-foreground"}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
              i + 1 === step ? "bg-primary-foreground text-primary" :
              i + 1 < step ? "text-green-700 dark:text-green-300" :
              "border border-muted-foreground/30 text-muted-foreground"}`}>
              {i + 1 < step ? (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : i + 1}
            </span>
            {label}
          </div>
          {i < labels.length - 1 && (
            <div className={`h-px flex-1 ${i + 1 < step ? "bg-green-200 dark:bg-green-900" : "bg-border"}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function IdentityDocumentWizard({ personnelId, nationality, onClose, onSaved }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [docType, setDocType] = useState(null); // "passport" | "id_card"
  const [form, setForm] = useState({
    document_number: "",
    bsn: "",
    valid_from: "",
    valid_until: "",
    issuing_country: NATIONALITY_TO_COUNTRY[nationality] || "",
    issuing_authority: "",
    notes: "",
  });
  const [errors, setErrors] = useState({});

  const isEuEea = EU_EEA_NATIONALITIES.has(nationality);
  const isDutch = nationality === "Nederlandse";
  const isNonEu = !!nationality && !isEuEea;
  const countryLabel = NATIONALITY_TO_COUNTRY[nationality] || nationality || "Onbekend";

  const { data: sensitiveData = [] } = useQuery({
    queryKey: ["personnel-sensitive-data", personnelId],
    queryFn: () => base44.entities.PersonnelSensitiveData.filter({ personnel_id: personnelId }),
    enabled: !!personnelId,
  });

  const set = (field, val) => {
    setForm(f => ({ ...f, [field]: val }));
    setErrors(e => ({ ...e, [field]: undefined }));
  };

  const validateStep2 = () => {
    const e = {};
    const today = new Date().toISOString().split("T")[0];
    if (!form.document_number.trim()) e.document_number = "Verplicht";
    if (!form.valid_from) e.valid_from = "Verplicht";
    if (!form.valid_until) {
      e.valid_until = "Verplicht";
    } else if (form.valid_from && form.valid_until <= form.valid_from) {
      e.valid_until = "Geldig tot moet later zijn dan geldig vanaf";
    } else if (form.valid_until < today) {
      e.valid_until = "Geldig tot ligt in het verleden";
    }
    if (!form.issuing_country.trim()) e.issuing_country = "Verplicht";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const typeLabel = docType === "passport" ? "Paspoort" : "Identiteitskaart";
      const country = form.issuing_country || countryLabel;

      await base44.entities.PersonnelDocument.create({
        personnel_id: personnelId,
        category: "identity_document",
        document_type: `${typeLabel} (${country})`,
        document_number: form.document_number || null,
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
        is_sensitive: true,
        verification_status: "pending_review",
        notes: form.notes || null,
        metadata: {
          doc_type: docType,
          issuing_country: form.issuing_country,
          issuing_authority: form.issuing_authority || null,
          nationality,
          is_eu_eea: isEuEea,
        },
      });

      // Save BSN to PersonnelSensitiveData if provided
      if (form.bsn.trim()) {
        const existing = sensitiveData[0];
        if (existing) {
          await base44.entities.PersonnelSensitiveData.update(existing.id, { bsn: form.bsn.trim() });
        } else {
          await base44.entities.PersonnelSensitiveData.create({ personnel_id: personnelId, bsn: form.bsn.trim() });
        }
        queryClient.invalidateQueries({ queryKey: ["personnel-sensitive-data", personnelId] });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personnel-documents"] });
      onSaved?.();
      onClose();
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="border-b border-primary/30 bg-muted/20 p-5"
    >
      <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">
        Legitimatiebewijs toevoegen
        {nationality && (
          <span className="ml-2 text-muted-foreground font-normal normal-case tracking-normal">
            — {countryLabel} ({nationality})
          </span>
        )}
      </p>

      <WizardSteps step={step} labels={["Type", "Gegevens", "Controleren"]} />

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          {/* Step 1: Kies type */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Kies het type legitimatiebewijs</p>

              {isNonEu && nationality && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                  <Globe className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Op basis van de nationaliteit <strong>{nationality}</strong> is alleen een paspoort toegestaan.
                    Een EU/EEA-identiteitskaart is niet van toepassing.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => { setDocType("passport"); setStep(2); }}
                  className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99]"
                >
                  <div>
                    <span className="text-sm font-semibold text-foreground">Paspoort</span>
                    <span className="text-xs text-muted-foreground ml-2">{countryLabel} paspoort</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>

                {isEuEea && (
                  <button
                    onClick={() => { setDocType("id_card"); setStep(2); }}
                    className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99]"
                  >
                    <div>
                      <span className="text-sm font-semibold text-foreground">Identiteitskaart</span>
                      <span className="text-xs text-muted-foreground ml-2">{countryLabel} ID-kaart</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
              </div>

              <div className="flex justify-end pt-1">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  <X className="w-4 h-4 mr-1" /> Annuleren
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Documentgegevens */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">
                Documentgegevens —{" "}
                <span className="text-muted-foreground font-normal">
                  {docType === "passport" ? "Paspoort" : "Identiteitskaart"}
                </span>
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Documentnummer <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={form.document_number}
                    onChange={e => set("document_number", e.target.value)}
                    className={`h-8 text-sm font-mono ${errors.document_number ? "border-destructive" : ""}`}
                    placeholder={docType === "passport" ? "Bijv. NL1234567" : "Bijv. ID1234567NL"}
                  />
                  {errors.document_number && <p className="text-xs text-destructive mt-1">{errors.document_number}</p>}
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    BSN-nummer
                    {isDutch && <span className="text-destructive ml-1">*</span>}
                    {!isDutch && <span className="text-muted-foreground ml-1">(indien beschikbaar)</span>}
                  </label>
                  <Input
                    value={form.bsn}
                    onChange={e => set("bsn", e.target.value.replace(/\D/g, ""))}
                    className={`h-8 text-sm font-mono ${errors.bsn ? "border-destructive" : ""}`}
                    placeholder="000000000"
                    maxLength={9}
                  />
                  {!isDutch && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Buitenlandse medewerkers ontvangen een BSN na inschrijving in de BRP.
                    </p>
                  )}
                  {errors.bsn && <p className="text-xs text-destructive mt-1">{errors.bsn}</p>}
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Geldig vanaf <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="date"
                    value={form.valid_from}
                    onChange={e => set("valid_from", e.target.value)}
                    className={`h-8 text-sm ${errors.valid_from ? "border-destructive" : ""}`}
                  />
                  {errors.valid_from && <p className="text-xs text-destructive mt-1">{errors.valid_from}</p>}
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Geldig tot <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="date"
                    value={form.valid_until}
                    onChange={e => set("valid_until", e.target.value)}
                    className={`h-8 text-sm ${errors.valid_until ? "border-destructive" : ""}`}
                  />
                  {errors.valid_until && <p className="text-xs text-destructive mt-1">{errors.valid_until}</p>}
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Uitgevend land <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={form.issuing_country}
                    onChange={e => set("issuing_country", e.target.value)}
                    className={`h-8 text-sm ${errors.issuing_country ? "border-destructive" : ""}`}
                    placeholder="Bijv. Nederland"
                  />
                  {errors.issuing_country && <p className="text-xs text-destructive mt-1">{errors.issuing_country}</p>}
                </div>

                {isNonEu && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Uitgevende instantie</label>
                    <Input
                      value={form.issuing_authority}
                      onChange={e => set("issuing_authority", e.target.value)}
                      className="h-8 text-sm"
                      placeholder="Bijv. Ministry of Interior"
                    />
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Opmerkingen</label>
                  <Input
                    value={form.notes}
                    onChange={e => set("notes", e.target.value)}
                    className="h-8 text-sm"
                    placeholder="Optionele toelichting..."
                  />
                </div>
              </div>

              {isNonEu && (
                <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-900 dark:text-blue-200">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Voor niet-EU medewerkers is naast het paspoort een verblijfs- en/of werkvergunning vereist.
                    Registreer deze apart onder het tabblad <strong>Compliance</strong>.
                  </span>
                </div>
              )}

              <div className="flex justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => { setStep(1); setErrors({}); }}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Terug
                </Button>
                <Button size="sm" onClick={() => { if (validateStep2()) setStep(3); }}>
                  Volgende <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Controleer & opslaan */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-foreground">Controleer de gegevens en sla op</p>

              <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-sm">
                {[
                  { label: "Type", value: `${docType === "passport" ? "Paspoort" : "Identiteitskaart"} (${form.issuing_country || countryLabel})` },
                  { label: "Documentnummer", value: form.document_number, mono: true },
                  form.bsn ? { label: "BSN", value: "•".repeat(Math.max(0, form.bsn.length - 3)) + form.bsn.slice(-3), mono: true } : null,
                  { label: "Geldig van", value: form.valid_from },
                  { label: "Geldig tot", value: form.valid_until },
                  form.issuing_authority ? { label: "Instantie", value: form.issuing_authority } : null,
                  form.notes ? { label: "Opmerking", value: form.notes } : null,
                ].filter(Boolean).map(row => (
                  <div key={row.label} className="flex gap-4">
                    <span className="w-36 shrink-0 text-xs text-muted-foreground">{row.label}</span>
                    <span className={`font-medium ${row.mono ? "font-mono" : ""}`}>{row.value || "—"}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Terug
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={onClose}>Annuleren</Button>
                  <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                    <Check className="w-4 h-4 mr-1" />
                    {saveMutation.isPending ? "Opslaan..." : "Document opslaan"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}