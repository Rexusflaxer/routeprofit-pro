import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Eye, FileText, Upload, Plus, X, Check, ChevronRight, ChevronLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ManagedFilePreviewDialog from "@/components/files/ManagedFilePreviewDialog";
import { uploadManagedFile, updateManagedFileSource } from "@/lib/managedFiles";

const WPBR_TYPES = [
{ key: "ND", label: "ND", desc: "Particuliere beveiligingsorganisatie" },
{ key: "HND", label: "HND", desc: "Hoofd Nationaal Particulier beveiligingsbedrijf alleen voor horecabeveiliging" },
{ key: "BD", label: "BD", desc: "Particuliere bedrijfsbeveiligingsdienst" },
{ key: "PAC", label: "PAC", desc: "Particulier Alarm Centralist" },
{ key: "VTC", label: "VTC", desc: "Particuliere Video Toezicht Centrale" },
{ key: "PGW", label: "PGW", desc: "Particulier Geld- en Waardentransportbedrijf" },
{ key: "POB", label: "POB", desc: "Particuliere Alarmcentrale" }];


const EMPTY_FORM = {
  license_type: "", license_number: "", valid_from: "", valid_until: "",
  notes: "", document_file_url: "", document_filename: "", document_file_id: "",
  document_download_filename: "", document_logical_path: "", document_metadata: null
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
  const CheckIcon = () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );

  return (
    <div className="flex items-center gap-1 mb-4">
      {steps.map((s, i) =>
      <React.Fragment key={s}>
          <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-colors ${
        i + 1 === step ? "bg-primary text-primary-foreground" :
        i + 1 < step ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" :
        "text-muted-foreground"}`
        }>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
          i + 1 === step ? "bg-primary-foreground text-primary" :
          i + 1 < step ? "text-green-700 dark:text-green-300" :
          "border border-muted-foreground/30 text-muted-foreground"}`
          }>{i + 1 < step ? <CheckIcon /> : i + 1}</span>
            {s}
          </div>
          {i < steps.length - 1 && <div className={`h-px flex-1 ${i + 1 < step ? "bg-green-200 dark:bg-green-900" : "bg-border"}`} />}
        </React.Fragment>
      )}
    </div>);

}

export default function WpbrTab({ companyId, company }) {
  const queryClient = useQueryClient();
  const wizardRef = useRef(null);
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = backward
  const [uploading, setUploading] = useState(false);
  const [formPreviewOpen, setFormPreviewOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (showWizard) {
      const timer = setTimeout(() => {
        wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [step, showWizard]);

  const { data: licenses = [] } = useQuery({
    queryKey: ["wpbr-licenses", companyId],
    queryFn: () => base44.entities.CompanyWpbrLicense.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      // Supersede only same-type active licenses
      const sameTypeActive = licenses.filter((l) => l.status === "active" && l.license_type === data.license_type);
      await Promise.all(sameTypeActive.map((l) => base44.entities.CompanyWpbrLicense.update(l.id, { status: "superseded" })));
      const created = await base44.entities.CompanyWpbrLicense.create({ ...data, company_id: companyId, status: "active" });
      if (created?.id && data.document_file_id) {
        await updateManagedFileSource(data.document_file_id, {
          owner_id: companyId,
          company_id: companyId,
          source_entity_id: created.id
        });
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wpbr-licenses", companyId] });
      cancelWizard();
    }
  });

  const cancelWizard = () => {
    setShowWizard(false);
    setFormPreviewOpen(false);
    setStep(1);
    setForm(EMPTY_FORM);
    setErrors({});
  };

  const validateStep2 = () => {
    const e = {};
    if (!form.license_number.trim()) e.license_number = "Verplicht";
    if (!form.valid_from) e.valid_from = "Verplicht";
    if (!form.valid_until) e.valid_until = "Verplicht";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleUpload = async (file) => {
    setUploading(true);
    try {
      const licenseNumber = [form.license_type, form.license_number].filter(Boolean).join("-");
      const validYear = form.valid_until ? form.valid_until.slice(0, 4) : "zonder-einddatum";
      const result = await uploadManagedFile({
        file,
        ownerType: "company",
        ownerId: companyId,
        companyId,
        ownerLabel: company?.display_name || company?.legal_name || "Bedrijf",
        domain: "compliance",
        category: "company_wpbr_license",
        sourceEntity: "CompanyWpbrLicense",
        sourceField: "document_file_url",
        documentLabel: `WPBR ${form.license_type || "vergunning"}`,
        documentNumber: licenseNumber || null,
        validFrom: form.valid_from || null,
        validUntil: form.valid_until || null,
        isSensitive: true,
        folderSegments: ["wpbr", form.license_type || "onbekend", validYear],
        metadata: {
          license_type: form.license_type || null,
          license_number: form.license_number || null
        }
      });
      setForm((f) => ({
        ...f,
        document_file_url: result.file_url,
        document_filename: result.download_filename,
        document_file_id: result.managed_file_id,
        document_download_filename: result.download_filename,
        document_logical_path: result.logical_path,
        document_metadata: {
          managed_file_id: result.managed_file_id,
          folder_path: result.folder_path
        }
      }));
    } finally {
      setUploading(false);
    }
  };

  const set = (field, val) => setForm((f) => ({ ...f, [field]: val }));

  const activeLicenses = licenses.filter((l) => l.status === "active");
  const historicLicenses = licenses.filter((l) => l.status !== "active");

  return (
    <div className="space-y-4 p-6">

      {/* Wizard */}
      <AnimatePresence>
        {showWizard && (
          <motion.div
            ref={wizardRef}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-lg border border-primary/30 bg-muted/20 p-5 overflow-hidden"
          >
            <WizardSteps step={step} />

            <div className="relative">
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
                      <p className="text-sm font-medium text-foreground">Kies het vergunningstype</p>
                      <div className="grid grid-cols-1 gap-2">
                        {WPBR_TYPES.map((t) => (
                          <button
                            key={t.key}
                            onClick={() => { set("license_type", t.key); setDirection(1); setStep(2); }}
                            className={`flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99] ${
                              form.license_type === t.key ? "border-primary bg-accent" : "border-border bg-card"}`}
                          >
                            <div>
                              <span className="text-sm font-semibold text-foreground">{t.label}</span>
                              <span className="text-xs text-muted-foreground ml-2">{t.desc}</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
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
                          <div className="flex items-center gap-0">
                            <span className="inline-flex items-center h-8 px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm font-semibold text-foreground select-none">{form.license_type}</span>
                            <Input value={form.license_number} onChange={(e) => { set("license_number", e.target.value); setErrors((er) => ({ ...er, license_number: undefined })); }} className={`h-8 text-sm rounded-l-none ${errors.license_number ? "border-destructive" : ""}`} placeholder="Nummer..." />
                          </div>
                          {errors.license_number && <p className="text-xs text-destructive mt-1">{errors.license_number}</p>}
                        </div>
                        <div className="sm:col-span-1" />
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Geldig vanaf</label>
                          <Input type="date" value={form.valid_from} onChange={(e) => { set("valid_from", e.target.value); setErrors((er) => ({ ...er, valid_from: undefined })); }} className={`h-8 text-sm ${errors.valid_from ? "border-destructive" : ""}`} />
                          {errors.valid_from && <p className="text-xs text-destructive mt-1">{errors.valid_from}</p>}
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Geldig tot</label>
                          <Input type="date" value={form.valid_until} onChange={(e) => { set("valid_until", e.target.value); setErrors((er) => ({ ...er, valid_until: undefined })); }} className={`h-8 text-sm ${errors.valid_until ? "border-destructive" : ""}`} />
                          {errors.valid_until && <p className="text-xs text-destructive mt-1">{errors.valid_until}</p>}
                        </div>
                      </div>
                      <div className="flex justify-between pt-1">
                        <Button variant="ghost" size="sm" onClick={() => { setDirection(-1); setStep(1); setErrors({}); }}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                        <Button size="sm" onClick={() => { if (validateStep2()) { setDirection(1); setStep(3); } }}>Volgende <ChevronRight className="w-4 h-4 ml-1" /></Button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Document uploaden + opslaan */}
                  {step === 3 && (
                    <div className="space-y-4">
                      <p className="text-sm font-medium text-foreground">Vergunningsdocument uploaden</p>
                      <p className="text-xs text-muted-foreground">Upload het officiële vergunningsdocument (PDF of afbeelding). <span className="text-destructive font-medium">Verplicht.</span></p>

                      {form.document_file_url ? (
                        <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card">
                          <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                          <span className="text-sm text-muted-foreground flex-1 truncate">Document toegevoegd</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setFormPreviewOpen(true)}
                            className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700"
                            title="Document bekijken"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Bekijken
                          </Button>
                          <button onClick={() => { setFormPreviewOpen(false); setForm((f) => ({ ...f, document_file_url: "", document_filename: "", document_file_id: "", document_download_filename: "", document_logical_path: "", document_metadata: null })); }} className="text-muted-foreground hover:text-destructive" title="Verwijderen">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed border-border hover:border-primary cursor-pointer transition-colors">
                          <input type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                          <Upload className="w-6 h-6 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">{uploading ? "Uploaden..." : "Klik om document te uploaden"}</span>
                          <span className="text-xs text-muted-foreground">PDF of afbeelding</span>
                        </label>
                      )}

                      <div className="flex justify-between pt-1">
                        <Button variant="ghost" size="sm" onClick={() => { setDirection(-1); setStep(2); }}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                          <Button size="sm" onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending || !form.document_file_url}>
                            <Check className="w-4 h-4 mr-1" /> {createMutation.isPending ? "Opslaan..." : "Vergunning opslaan"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active licenses */}
      {activeLicenses.length === 0 && !showWizard ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nog geen vergunning geregistreerd</span>
            <Button size="sm" variant="outline" onClick={() => setShowWizard(true)} className="h-6 px-2 text-xs font-medium normal-case tracking-normal">
              <Plus className="w-3 h-3 mr-1" /> Nieuwe vergunning
            </Button>
          </div>
        </div>
      ) : activeLicenses.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[2.5rem_6rem_5rem_1fr_auto] px-4 py-2 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground items-center">
            <span>Type</span>
            <span>Nummer</span>
            <span>Status</span>
            <span>Geldigheid</span>
            {!showWizard && (
              <Button size="sm" variant="outline" onClick={() => setShowWizard(true)} className="h-6 px-2 text-xs font-medium normal-case tracking-normal">
                <Plus className="w-3 h-3 mr-1" /> Nieuwe vergunning
              </Button>
            )}
          </div>
          <div className="divide-y divide-border">
            {activeLicenses.map((l) => <LicenseCard key={l.id} license={l} />)}
          </div>
        </div>
      )}

      {/* Historic licenses */}
      {historicLicenses.length > 0 &&
      <div className="space-y-2 pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vorige vergunningen</p>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="divide-y divide-border opacity-70">
              {historicLicenses.map((l) => <LicenseCard key={l.id} license={l} muted />)}
            </div>
          </div>
        </div>
      }

      <ManagedFilePreviewDialog
        open={formPreviewOpen}
        onOpenChange={setFormPreviewOpen}
        managedFileId={form.document_file_id}
        fileUrl={form.document_file_url}
        filename={form.document_download_filename || form.document_filename || "Document"}
        title="Vergunningsdocument bekijken"
      />
    </div>);

}

function LicenseCard({ license, muted }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const documentName = license.document_download_filename || license.document_filename || "Document";
  return (
    <>
      <div
        className={`grid grid-cols-[2.5rem_6rem_5rem_1fr] items-center px-4 py-3 ${license.document_file_url ? "cursor-pointer hover:bg-accent/50 transition-colors" : ""}`}
        onClick={license.document_file_url ? () => setPreviewOpen(true) : undefined}
        title={license.document_file_url ? "Klik om vergunning te bekijken" : undefined}
      >
        <span className="text-sm font-semibold text-foreground">{license.license_type || "?"}</span>
        <span className="text-sm text-muted-foreground">{license.license_number ? `#${license.license_number}` : "—"}</span>
        <div><LicenseStatusBadge license={license} /></div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          {license.valid_from && <span>Vanaf: <strong className="text-foreground">{license.valid_from}</strong></span>}
          {license.valid_until && <span>Tot: <strong className="text-foreground">{license.valid_until}</strong></span>}
        </div>

      </div>
      <ManagedFilePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        managedFileId={license.document_file_id}
        fileUrl={license.document_file_url}
        filename={documentName}
        title={`WPBR ${license.license_type || "vergunning"}`}
      />
    </>);

}