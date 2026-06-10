import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Eye, FileText, Upload, Plus, X, Check, ChevronRight, ChevronLeft, Edit, Trash2, AlertTriangle, Archive, RefreshCw } from "lucide-react";
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
  { key: "POB", label: "POB", desc: "Particuliere Alarmcentrale" },
];

const DELETE_PASSWORD = "verwijder";

const EMPTY_FORM = {
  license_type: "", license_number: "", valid_from: "", valid_until: "",
  notes: "", document_file_url: "", document_filename: "", document_file_id: "",
  document_download_filename: "", document_logical_path: "", document_metadata: null,
};

function isExpiredLicense(license) {
  const today = new Date().toISOString().split("T")[0];
  return license.valid_until && license.valid_until < today;
}

function LicenseStatusBadge({ license }) {
  if (license.status === "superseded") return <Badge variant="outline" className="text-xs text-muted-foreground">Vervangen</Badge>;
  if (license.status === "expired" || isExpiredLicense(license)) {
    return <Badge variant="outline" className="text-xs text-amber-600 border-amber-400 whitespace-nowrap">Actie vereist</Badge>;
  }
  return <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200 border-0">Actief</Badge>;
}

function WizardSteps({ step }) {
  const steps = ["Type", "Gegevens", "Document"];
  const CheckIcon = () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
  return (
    <div className="flex items-center gap-1 mb-4">
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-colors ${
            i + 1 === step ? "bg-primary text-primary-foreground" :
            i + 1 < step ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" :
            "text-muted-foreground"}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
              i + 1 === step ? "bg-primary-foreground text-primary" :
              i + 1 < step ? "text-green-700 dark:text-green-300" :
              "border border-muted-foreground/30 text-muted-foreground"}`}>
              {i + 1 < step ? <CheckIcon /> : i + 1}
            </span>
            {s}
          </div>
          {i < steps.length - 1 && <div className={`h-px flex-1 ${i + 1 < step ? "bg-green-200 dark:bg-green-900" : "bg-border"}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function DeleteConfirmDialog({ license, onConfirm, onCancel, isPending }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleConfirm = () => {
    if (password !== DELETE_PASSWORD) {
      setError(`Typ "${DELETE_PASSWORD}" om te bevestigen`);
      return;
    }
    onConfirm();
  };

  return (
    <div className="border-b border-destructive/20 bg-destructive/5 p-5">
      <div className="flex items-start gap-3 mb-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground">Vergunning verwijderen?</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Je staat op het punt de <strong>{license.license_type}</strong> vergunning #{license.license_number} te verwijderen.
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground block">
          Typ <strong className="text-foreground font-mono">{DELETE_PASSWORD}</strong> om te bevestigen:
        </label>
        <div className="flex gap-2">
          <Input
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            placeholder={DELETE_PASSWORD}
            className={`h-8 text-sm font-mono max-w-[200px] ${error ? "border-destructive" : ""}`}
            onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
            autoFocus
          />
          <Button variant="destructive" size="sm" onClick={handleConfirm} disabled={isPending}>
            <Trash2 className="w-3.5 h-3.5 mr-1" /> {isPending ? "Verwijderen..." : "Verwijderen"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Annuleren</Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

export default function WpbrTab({ companyId, company }) {
  const queryClient = useQueryClient();
  const wizardRef = useRef(null);
  const [showWizard, setShowWizard] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [renewingExpiredId, setRenewingExpiredId] = useState(null); // ID of expired license being renewed
  const [step, setStep] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [formPreviewOpen, setFormPreviewOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [deleteId, setDeleteId] = useState(null);
  const [showArchive, setShowArchive] = useState(false);

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
    enabled: !!companyId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editingId) {
        return base44.entities.CompanyWpbrLicense.update(editingId, {
          license_type: data.license_type,
          license_number: data.license_number,
          valid_from: data.valid_from || null,
          valid_until: data.valid_until || null,
          document_file_url: data.document_file_url || null,
          document_filename: data.document_filename || null,
          document_file_id: data.document_file_id || null,
          document_download_filename: data.document_download_filename || null,
          document_logical_path: data.document_logical_path || null,
          document_metadata: data.document_metadata || null,
        });
      }
      // Supersede all existing active/expired licenses of the same type (archive them)
      const sameType = licenses.filter((l) => l.license_type === data.license_type && l.status !== "superseded");
      await Promise.all(sameType.map((l) => base44.entities.CompanyWpbrLicense.update(l.id, { status: "superseded" })));
      const created = await base44.entities.CompanyWpbrLicense.create({ ...data, company_id: companyId, status: "active" });
      if (created?.id && data.document_file_id) {
        await updateManagedFileSource(data.document_file_id, {
          owner_id: companyId,
          company_id: companyId,
          source_entity_id: created.id,
        });
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wpbr-licenses", companyId] });
      cancelWizard();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CompanyWpbrLicense.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wpbr-licenses", companyId] });
      setDeleteId(null);
    },
  });

  const cancelWizard = () => {
    setShowWizard(false);
    setFormPreviewOpen(false);
    setEditingId(null);
    setRenewingExpiredId(null);
    setStep(1);
    setForm(EMPTY_FORM);
    setErrors({});
  };

  const startEdit = (license) => {
    setForm({
      license_type: license.license_type || "",
      license_number: license.license_number || "",
      valid_from: license.valid_from || "",
      valid_until: license.valid_until || "",
      notes: license.notes || "",
      document_file_url: license.document_file_url || "",
      document_filename: license.document_filename || "",
      document_file_id: license.document_file_id || "",
      document_download_filename: license.document_download_filename || "",
      document_logical_path: license.document_logical_path || "",
      document_metadata: license.document_metadata || null,
    });
    setEditingId(license.id);
    setStep(2);
    setShowWizard(true);
  };

  // Start renewal flow for an expired license — pre-fill type, clear dates/document
  const startRenew = (license) => {
    setForm({
      ...EMPTY_FORM,
      license_type: license.license_type || "",
    });
    setRenewingExpiredId(license.id);
    setEditingId(null);
    setStep(2);
    setShowWizard(true);
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
        metadata: { license_type: form.license_type || null, license_number: form.license_number || null },
      });
      setForm((f) => ({
        ...f,
        document_file_url: result.file_url,
        document_filename: result.download_filename,
        document_file_id: result.managed_file_id,
        document_download_filename: result.download_filename,
        document_logical_path: result.logical_path,
        document_metadata: { managed_file_id: result.managed_file_id, folder_path: result.folder_path },
      }));
    } finally {
      setUploading(false);
    }
  };

  const set = (field, val) => setForm((f) => ({ ...f, [field]: val }));

  // Active = not superseded. Expired ones stay visible with "Actie vereist"
  const activeLicenses = licenses.filter((l) => l.status !== "superseded");
  const archivedLicenses = licenses.filter((l) => l.status === "superseded");

  const licenseToDelete = licenses.find((l) => l.id === deleteId);
  const isRenewing = !!renewingExpiredId;

  return (
    <div className="flex flex-col h-full">

      {/* Delete confirmation */}
      <AnimatePresence>
        {deleteId && licenseToDelete && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
            <DeleteConfirmDialog
              license={licenseToDelete}
              onConfirm={() => deleteMutation.mutate(deleteId)}
              onCancel={() => setDeleteId(null)}
              isPending={deleteMutation.isPending}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wizard */}
      <AnimatePresence>
        {showWizard && (
          <motion.div
            ref={wizardRef}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-none border-0 border-b border-primary/30 bg-muted/20 p-5 overflow-hidden"
          >
            {editingId && <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">Vergunning bewerken</p>}
            {isRenewing && <p className="text-xs font-semibold text-amber-600 mb-3 uppercase tracking-wider">Vergunning vernieuwen — {form.license_type}</p>}
            <WizardSteps step={editingId || isRenewing ? step - 1 : step} />

            <div className="relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  {/* Step 1: Kies type (only for new, not edit/renew) */}
                  {step === 1 && !editingId && !isRenewing && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-foreground">Kies het vergunningstype</p>
                      <div className="grid grid-cols-1 gap-2">
                        {WPBR_TYPES.map((t) => (
                          <button
                            key={t.key}
                            onClick={() => { set("license_type", t.key); setStep(2); }}
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
                        {!editingId && !isRenewing ? (
                          <Button variant="ghost" size="sm" onClick={() => { setStep(1); setErrors({}); }}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                        )}
                        <Button size="sm" onClick={() => { if (validateStep2()) setStep(3); }}>Volgende <ChevronRight className="w-4 h-4 ml-1" /></Button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Document */}
                  {step === 3 && (
                    <div className="space-y-4">
                      <p className="text-sm font-medium text-foreground">Vergunningsdocument {editingId ? "bijwerken" : "uploaden"}</p>
                      {!editingId && <p className="text-xs text-muted-foreground">Upload het officiële vergunningsdocument (PDF of afbeelding). <span className="text-destructive font-medium">Verplicht.</span></p>}

                      {form.document_file_url ? (
                        <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card">
                          <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                          <span className="text-sm text-muted-foreground flex-1 truncate">Document toegevoegd</span>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setFormPreviewOpen(true)} className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700">
                            <Eye className="w-3.5 h-3.5" /> Bekijken
                          </Button>
                          <button onClick={() => { setFormPreviewOpen(false); setForm((f) => ({ ...f, document_file_url: "", document_filename: "", document_file_id: "", document_download_filename: "", document_logical_path: "", document_metadata: null })); }} className="text-muted-foreground hover:text-destructive">
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
                        <Button variant="ghost" size="sm" onClick={() => setStep(2)}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                          <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || (!editingId && !form.document_file_url)}>
                            <Check className="w-4 h-4 mr-1" /> {saveMutation.isPending ? "Opslaan..." : (editingId ? "Wijzigingen opslaan" : isRenewing ? "Vergunning vernieuwen" : "Vergunning opslaan")}
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

      {/* Table header */}
      <div className="flex items-center px-4 py-2 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="w-10 shrink-0">Type</span>
        <span className="w-24 shrink-0">Nummer</span>
        <span className="w-32 shrink-0">Status</span>
        <span className="flex-1">Geldigheid</span>
        {!showWizard && !deleteId && (
          <div className="flex items-center gap-2">
            {archivedLicenses.length > 0 && (
              <Button
                size="sm"
                variant={showArchive ? "secondary" : "outline"}
                onClick={() => setShowArchive(v => !v)}
                className="h-7 px-2 text-xs font-medium normal-case tracking-normal"
              >
                <Archive className="w-3 h-3 mr-1" /> Archief {showArchive ? "verbergen" : `(${archivedLicenses.length})`}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setShowWizard(true)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal">
              <Plus className="w-3 h-3 mr-1" /> Nieuwe vergunning
            </Button>
          </div>
        )}
      </div>

      {activeLicenses.length === 0 && !showWizard && (
        <p className="px-4 py-3 text-sm text-muted-foreground">Nog geen vergunning geregistreerd.</p>
      )}

      {/* Active + expired licenses */}
      <div className="divide-y divide-border">
        {activeLicenses.map((l) => (
          <LicenseCard
            key={l.id}
            license={l}
            onEdit={() => startEdit(l)}
            onDelete={() => setDeleteId(l.id)}
            onRenew={isExpiredLicense(l) ? () => startRenew(l) : undefined}
          />
        ))}
      </div>

      {/* Archive section */}
      <AnimatePresence>
        {showArchive && archivedLicenses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden border-t border-border"
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/20">
              <Archive className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Archief — vervangen vergunningen</p>
            </div>
            <div className="divide-y divide-border opacity-60">
              {archivedLicenses.map((l) => (
                <LicenseCard key={l.id} license={l} onDelete={() => setDeleteId(l.id)} muted />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ManagedFilePreviewDialog
        open={formPreviewOpen}
        onOpenChange={setFormPreviewOpen}
        managedFileId={form.document_file_id}
        fileUrl={form.document_file_url}
        filename={form.document_download_filename || form.document_filename || "Document"}
        title="Vergunningsdocument bekijken"
      />
    </div>
  );
}

function LicenseCard({ license, onEdit, onDelete, onRenew, muted }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null); // { x, y }
  const contextRef = useRef(null);
  const documentName = license.document_download_filename || license.document_filename || "Document";
  const expired = isExpiredLicense(license);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e) => {
      if (contextRef.current && !contextRef.current.contains(e.target)) setContextMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  const handleRowClick = (e) => {
    if (expired && onRenew) {
      // Show small context menu at click position
      const rect = e.currentTarget.getBoundingClientRect();
      setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else if (license.document_file_url) {
      setPreviewOpen(true);
    }
  };

  return (
    <>
      <div
        className={`relative flex items-center px-4 py-3 group transition-colors ${
          expired && onRenew
            ? "cursor-pointer hover:bg-accent/30"
            : license.document_file_url
            ? "cursor-pointer hover:bg-accent/50"
            : "hover:bg-accent/30"
        }`}
        onClick={handleRowClick}
      >
        <div className="w-10 shrink-0 flex items-center gap-1.5">
          {expired && onRenew && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
          <span className="text-sm font-semibold text-foreground">{license.license_type || "?"}</span>
        </div>
        <span className="w-24 shrink-0 text-sm text-muted-foreground">{license.license_number ? `#${license.license_number}` : "—"}</span>
        <div className="w-28 shrink-0">
          <LicenseStatusBadge license={license} />
        </div>
        <div className="flex-1 flex gap-4 text-xs text-muted-foreground">
          {license.valid_from && <span>Vanaf: <strong className="text-foreground">{license.valid_from}</strong></span>}
          {license.valid_until && <span>Tot: <strong className="text-foreground">{license.valid_until}</strong></span>}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          {onEdit && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="Bewerken">
              <Edit className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={onDelete} title="Verwijderen">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Context menu for expired licenses */}
        <AnimatePresence>
          {contextMenu && (
            <motion.div
              ref={contextRef}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              style={{ left: contextMenu.x, top: contextMenu.y }}
              className="absolute z-50 min-w-[180px] rounded-lg border border-border bg-popover shadow-lg py-1 text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-accent transition-colors text-foreground"
                onClick={() => { setContextMenu(null); onRenew(); }}
              >
                <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                Vergunning vernieuwen
              </button>
              {license.document_file_url && (
                <button
                  className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-accent transition-colors text-foreground"
                  onClick={() => { setContextMenu(null); setPreviewOpen(true); }}
                >
                  <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                  Document openen
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ManagedFilePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        managedFileId={license.document_file_id}
        fileUrl={license.document_file_url}
        filename={documentName}
        title={`WPBR ${license.license_type || "vergunning"}`}
      />
    </>
  );
}