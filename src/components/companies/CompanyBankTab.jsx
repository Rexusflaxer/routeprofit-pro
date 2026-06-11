import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Edit, Eye, Upload, X, Check, ChevronRight, ChevronLeft, FileText, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ManagedFilePreviewDialog from "@/components/files/ManagedFilePreviewDialog";
import { buildManagedFileDescriptor, syncManagedFileDescriptor, uploadManagedFile } from "@/lib/managedFiles";

const ACCOUNT_TYPES = [
  { key: "normal", label: "Normale rekening", desc: "Standaard bedrijfsrekening" },
  { key: "g_account", label: "G-rekening", desc: "Geblokkeerde rekening voor loonheffingen/btw" },
];

const DELETE_PASSWORD = "verwijder";

const EMPTY_FORM = {
  company_id: "",
  account_type: "",
  iban: "",
  account_holder_name: "",
  bank_name: "",
  bic: "",
  notes: "",
  proof_file_url: "",
  proof_file_id: "",
  proof_download_filename: "",
  proof_logical_path: "",
};

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

function DeleteConfirmBar({ label, onConfirm, onCancel, isPending }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const handleConfirm = () => {
    if (password !== DELETE_PASSWORD) { setError(`Typ "${DELETE_PASSWORD}" om te bevestigen`); return; }
    onConfirm();
  };
  return (
    <div className="border-b border-destructive/20 bg-destructive/5 p-4">
      <div className="flex items-start gap-3 mb-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground">Rekening verwijderen?</p>
          <p className="text-xs text-muted-foreground mt-0.5"><strong>{label}</strong> wordt verwijderd.</p>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground block">Typ <strong className="text-foreground font-mono">{DELETE_PASSWORD}</strong> om te bevestigen:</label>
        <div className="flex gap-2">
          <Input value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder={DELETE_PASSWORD} className={`h-8 text-sm font-mono max-w-[200px] ${error ? "border-destructive" : ""}`} onKeyDown={(e) => e.key === "Enter" && handleConfirm()} autoFocus />
          <Button variant="destructive" size="sm" onClick={handleConfirm} disabled={isPending}><Trash2 className="w-3.5 h-3.5 mr-1" />{isPending ? "Verwijderen..." : "Verwijderen"}</Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Annuleren</Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

export default function CompanyBankTab({ companies }) {
  const companyId = companies[0]?.id || "";
  const company = companies[0];
  const queryClient = useQueryClient();
  const wizardRef = useRef(null);
  const [showWizard, setShowWizard] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [step, setStep] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [formPreviewOpen, setFormPreviewOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [deleteId, setDeleteId] = useState(null);

  useEffect(() => {
    if (showWizard) {
      const timer = setTimeout(() => {
        wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [step, showWizard]);

  const { data: accounts = [] } = useQuery({
    queryKey: ["company-bank-accounts", companyId],
    queryFn: () => base44.entities.CompanyBankAccount.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const getDocumentDescriptor = (data) => {
    const ibanDisplay = data.iban_masked || data.iban || "rekening";
    return buildManagedFileDescriptor({
      filename: data.proof_download_filename || data.proof_file_url?.split("/").pop() || "bankbewijs.pdf",
      ownerType: "company",
      ownerId: companyId,
      companyId,
      ownerLabel: company?.display_name || company?.legal_name || "Bedrijf",
      domain: "compliance",
      category: "company_bank_account",
      documentLabel: `Bankbewijs ${ibanDisplay}`,
      documentNumber: ibanDisplay,
      folderSegments: ["bank", ibanDisplay],
    });
  };

  const withCurrentDocumentDescriptor = (data) => {
    if (!data.proof_file_url) return data;
    const descriptor = getDocumentDescriptor(data);
    return {
      ...data,
      proof_download_filename: descriptor.download_filename,
      proof_logical_path: descriptor.logical_path,
    };
  };

  const syncManagedDocumentDescriptor = async (data, sourceEntityId) => {
    if (!data.proof_file_id) return;
    const ibanDisplay = data.iban_masked || data.iban || "rekening";
    await syncManagedFileDescriptor(data.proof_file_id, {
      filename: data.proof_download_filename || data.proof_file_url?.split("/").pop() || "bankbewijs.pdf",
      ownerType: "company",
      ownerId: companyId,
      companyId,
      ownerLabel: company?.display_name || company?.legal_name || "Bedrijf",
      domain: "compliance",
      category: "company_bank_account",
      documentLabel: `Bankbewijs ${ibanDisplay}`,
      documentNumber: ibanDisplay,
      folderSegments: ["bank", ibanDisplay],
    }, {
      owner_id: companyId,
      company_id: companyId,
      source_entity: "CompanyBankAccount",
      source_entity_id: sourceEntityId,
      source_field: "proof_file_url",
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const normalizedData = withCurrentDocumentDescriptor(data);
      if (editingId) {
        await syncManagedDocumentDescriptor(normalizedData, editingId);
        return base44.entities.CompanyBankAccount.update(editingId, {
          account_type: normalizedData.account_type,
          iban: normalizedData.iban,
          account_holder_name: normalizedData.account_holder_name || null,
          bank_name: normalizedData.bank_name || null,
          bic: normalizedData.bic || null,
          notes: normalizedData.notes || null,
          proof_file_url: normalizedData.proof_file_url || null,
          proof_file_id: normalizedData.proof_file_id || null,
          proof_download_filename: normalizedData.proof_download_filename || null,
          proof_logical_path: normalizedData.proof_logical_path || null,
        });
      }
      const created = await base44.entities.CompanyBankAccount.create({
        ...normalizedData,
        company_id: companyId,
      });
      if (created?.id && normalizedData.proof_file_id) {
        await syncManagedDocumentDescriptor(normalizedData, created.id);
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-bank-accounts", companyId] });
      cancelWizard();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CompanyBankAccount.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-bank-accounts", companyId] });
      setDeleteId(null);
    },
  });

  const cancelWizard = () => {
    setShowWizard(false);
    setFormPreviewOpen(false);
    setEditingId(null);
    setStep(1);
    setForm(EMPTY_FORM);
    setErrors({});
  };

  const startEdit = (account) => {
    setForm({
      company_id: account.company_id,
      account_type: account.account_type || "normal",
      iban: account.iban || "",
      account_holder_name: account.account_holder_name || "",
      bank_name: account.bank_name || "",
      bic: account.bic || "",
      notes: account.notes || "",
      proof_file_url: account.proof_file_url || "",
      proof_file_id: account.proof_file_id || "",
      proof_download_filename: account.proof_download_filename || "",
      proof_logical_path: account.proof_logical_path || "",
    });
    setEditingId(account.id);
    setStep(2);
    setShowWizard(true);
  };

  const formatIban = (value) => {
    const cleaned = value.replace(/\s/g, "").toUpperCase();
    const chunks = cleaned.match(/.{1,4}/g) || [];
    return chunks.join(" ");
  };

  const validateStep2 = () => {
    const e = {};
    const cleanIban = form.iban.replace(/\s/g, "");
    const ibanPattern = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{18,34}$/;
    if (!cleanIban) e.iban = "Verplicht";
    else if (cleanIban.length < 15) e.iban = "IBAN te kort";
    else if (!ibanPattern.test(cleanIban)) e.iban = "Ongeldig IBAN formaat";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleUpload = async (file) => {
    setUploading(true);
    try {
      const ibanDisplay = form.iban_masked || form.iban || "rekening";
      const result = await uploadManagedFile({
        file,
        ownerType: "company",
        ownerId: companyId,
        companyId,
        ownerLabel: company?.display_name || company?.legal_name || "Bedrijf",
        domain: "compliance",
        category: "company_bank_account",
        sourceEntity: "CompanyBankAccount",
        sourceField: "proof_file_url",
        documentLabel: `Bankbewijs ${ibanDisplay}`,
        documentNumber: ibanDisplay,
        isSensitive: true,
        folderSegments: ["bank", ibanDisplay],
      });
      setForm((f) => ({
        ...f,
        proof_file_url: result.file_url,
        proof_file_id: result.managed_file_id,
        proof_download_filename: result.download_filename,
        proof_logical_path: result.logical_path,
      }));
    } finally {
      setUploading(false);
    }
  };

  const set = (field, val) => setForm((f) => ({ ...f, [field]: val }));

  const accountToDelete = accounts.find(a => a.id === deleteId);
  const currentFormDocumentFilename = form.proof_download_filename || form.proof_file_url?.split("/").pop() || "Document toegevoegd";

  return (
    <div className="flex flex-col h-full">

      {/* Delete confirmation */}
      <AnimatePresence>
        {deleteId && accountToDelete && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
            <DeleteConfirmBar
              label={accountToDelete.iban_masked || accountToDelete.iban}
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
            {editingId && <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">Rekening bewerken</p>}
            <WizardSteps step={editingId ? step - 1 : step} />

            <div className="relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  {/* Step 1: Type (only for new) */}
                  {step === 1 && !editingId && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-foreground">Kies het rekeningtype</p>
                      <div className="grid grid-cols-1 gap-2">
                        {ACCOUNT_TYPES.map((t) => (
                          <button
                            key={t.key}
                            onClick={() => { set("account_type", t.key); setStep(2); }}
                            className={`flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99] ${
                              form.account_type === t.key ? "border-primary bg-accent" : "border-border bg-card"}`}
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

                  {/* Step 2: Gegevens */}
                  {step === 2 && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-foreground">
                        Rekeninggegevens — <span className="text-muted-foreground font-normal">{ACCOUNT_TYPES.find(t => t.key === form.account_type)?.label}</span>
                      </p>
                      {form.account_type === "g_account" && (
                        <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">Een G-rekening is geblokkeerd voor afdracht van loonheffingen en btw bij inleners- of ketenaansprakelijkheid.</p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="col-span-2 space-y-1">
                          <Label>IBAN *</Label>
                          <Input value={form.iban} onChange={(e) => { set("iban", formatIban(e.target.value)); setErrors((er) => ({ ...er, iban: undefined })); }} placeholder="NL91 ABNA 0417 1643 00" className={errors.iban ? "border-destructive" : ""} />
                          {errors.iban && <p className="text-xs text-destructive">{errors.iban}</p>}
                        </div>
                        <div className="space-y-1">
                          <Label>Rekeninghouder</Label>
                          <Input value={form.account_holder_name} onChange={(e) => set("account_holder_name", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Bank</Label>
                          <Input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label>BIC</Label>
                          <Input value={form.bic} onChange={(e) => set("bic", e.target.value)} placeholder="bijv. ABNANL2A" />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label>Opmerkingen</Label>
                          <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} />
                        </div>
                      </div>
                      <div className="flex justify-between pt-1">
                        {!editingId ? (
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
                      <p className="text-sm font-medium text-foreground">Bankbewijs {editingId ? "bijwerken" : "uploaden"}</p>
                      {!editingId && <p className="text-xs text-muted-foreground">Upload een kopie van het bankbewijs (PDF of afbeelding).</p>}

                      {form.proof_file_url ? (
                        <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card">
                          <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                          <span className="text-sm text-muted-foreground flex-1 truncate">{currentFormDocumentFilename}</span>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setFormPreviewOpen(true)} className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700">
                            <Eye className="w-3.5 h-3.5" /> Bekijken
                          </Button>
                          <button onClick={() => { setFormPreviewOpen(false); setForm((f) => ({ ...f, proof_file_url: "", proof_file_id: "", proof_download_filename: "", proof_logical_path: "" })); }} className="text-muted-foreground hover:text-destructive">
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
                          <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
                            <Check className="w-4 h-4 mr-1" /> {saveMutation.isPending ? "Opslaan..." : (editingId ? "Wijzigingen opslaan" : "Rekening opslaan")}
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
        <span className="flex-1">IBAN / Rekening</span>
        <span className="w-28 shrink-0">Type</span>
        {!deleteId && (
          <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setForm({ ...EMPTY_FORM, company_id: companyId }); setShowWizard(true); }} className="h-7 px-2 text-xs font-medium normal-case tracking-normal">
            <Plus className="w-3 h-3 mr-1" /> Rekening toevoegen
          </Button>
        )}
      </div>

      {accounts.length === 0 && (
        <p className="px-4 py-3 text-sm text-muted-foreground">Nog geen rekeningen voor dit bedrijf.</p>
      )}

      <div className="divide-y divide-border">
        {accounts.map(acc => (
          <div key={acc.id} className="flex items-center px-4 py-3 group hover:bg-accent/30 transition-colors">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-foreground">{acc.iban_masked || acc.iban}</span>
              {acc.account_holder_name && <span className="text-xs text-muted-foreground ml-2">{acc.account_holder_name}</span>}
              {acc.account_type === "g_account" && <span className="ml-2 text-xs text-amber-600 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> G-rekening</span>}
            </div>
            <div className="w-28 shrink-0">
              <Badge variant={acc.account_type === "g_account" ? "outline" : "secondary"} className={`text-xs ${acc.account_type === "g_account" ? "border-amber-400 text-amber-700" : ""}`}>
                {acc.account_type === "g_account" ? "G-rekening" : "Normaal"}
              </Badge>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(acc)} title="Bewerken"><Edit className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteId(acc.id)} title="Verwijderen"><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        ))}
      </div>

      <ManagedFilePreviewDialog
        open={formPreviewOpen}
        onOpenChange={setFormPreviewOpen}
        managedFileId={form.proof_file_id}
        fileUrl={form.proof_file_url}
        filename={currentFormDocumentFilename}
        title="Bankbewijs bekijken"
      />
    </div>
  );
}