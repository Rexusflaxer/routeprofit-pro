import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import {
  Archive, ArrowLeft, Banknote, BriefcaseBusiness, Check, Eye,
  FileCheck2, FileText, ImageIcon, Loader2, Plus, X,
} from "lucide-react";
import { buildAuditMetadata, getAuditActorLabel } from "@/lib/auditTrail";

const PAYROLL_TABLE_GRID = "grid grid-cols-[minmax(220px,1fr)_170px_140px_180px_180px] gap-3";

function formatDate(v, fallback = "-") {
  if (!v) return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatCurrency(v) {
  if (v === null || v === undefined || v === "") return "-";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(v || 0));
}

function getExpiryState(value) {
  if (!value) return null;
  const diffDays = (new Date(value) - new Date()) / 86400000;
  if (diffDays < 0) return { label: "Verlopen", className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200" };
  if (diffDays <= 30) return { label: "<30 dagen", className: "bg-orange-100 text-orange-700" };
  if (diffDays <= 90) return { label: "<90 dagen", className: "bg-amber-100 text-amber-700" };
  return null;
}

function getRelationshipType(p) {
  return p.relationship_type || (p.employee_type === "zzp" ? "self_employed" : "employee");
}

function isArchivedPayrollDocument(doc) {
  return doc?.metadata?.archived === true;
}

function payrollDocumentFileUrl(doc) {
  return doc?.front_file_url || doc?.metadata?.front_file_url || doc?.file_url || "";
}

function hasPayrollDocumentUpload(doc) {
  return Boolean(payrollDocumentFileUrl(doc));
}

function isImageFile(url) {
  return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url || "");
}

// ─── Document Row ─────────────────────────────────────────────────────────────

function PayrollDocumentRow({ doc, archived = false, onPreview }) {
  const expiry = getExpiryState(doc.valid_until);
  const canPreview = hasPayrollDocumentUpload(doc);

  const openRow = () => {
    if (canPreview) onPreview(doc);
  };

  return (
    <div
      className={`${PAYROLL_TABLE_GRID} relative items-center px-5 py-3 transition-colors ${
        canPreview ? "cursor-pointer hover:bg-accent/35" : ""
      } ${archived ? "opacity-75" : ""}`}
      onClick={openRow}
    >
      <div className="min-w-0">
        <p className={`truncate text-sm font-semibold ${archived ? "text-muted-foreground line-through" : "text-foreground"}`}>
          {doc.document_type || "Loonheffingsverklaring"}
        </p>
        {archived && <p className="mt-0.5 text-xs text-muted-foreground">Archiefkopie</p>}
      </div>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{doc.document_number || "-"}</span>
      <div className="min-w-0 flex items-center gap-2">
        <span className="text-sm text-foreground">{formatDate(doc.valid_until)}</span>
        {expiry && !archived && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${expiry.className}`}>{expiry.label}</span>
        )}
      </div>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{getAuditActorLabel(doc)}</span>
      <div className="flex justify-end">
        {canPreview && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={event => { event.stopPropagation(); onPreview(doc); }}
            title="Document bekijken"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Preview Dialog ────────────────────────────────────────────────────────────

function PayrollDocumentPreviewDialog({ document, open, onOpenChange }) {
  const fileUrl = payrollDocumentFileUrl(document);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{document?.document_type || "Loonheffingsverklaring"}</DialogTitle>
        </DialogHeader>
        {!fileUrl ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Voor dit document is nog geen upload beschikbaar.
          </p>
        ) : isImageFile(fileUrl) ? (
          <div className="flex max-h-[72vh] min-h-[360px] items-center justify-center overflow-auto rounded-lg border border-border bg-muted/20 p-3">
            <img src={fileUrl} alt="Document" className="max-h-[72vh] w-auto max-w-full object-contain" />
          </div>
        ) : (
          <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-border bg-muted/20 p-6">
            <div className="text-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">Dit is een PDF-document.</p>
              <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block">
                <Button variant="outline" size="sm">
                  <Eye className="mr-1 h-4 w-4" /> Openen in nieuw venster
                </Button>
              </a>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

function PayrollDocumentWizard({ personnelId, isArchiveEntry = false, onClose, onSaved, currentUser }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    document_type: "Loonheffingsverklaring",
    document_number: "",
    valid_from: "",
    valid_until: "",
  });
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState({});
  const fileInputRef = useRef(null);
  const today = new Date().toISOString().split("T")[0];

  const set = (field, val) => {
    setForm(f => ({ ...f, [field]: val }));
    setErrors(e => ({ ...e, [field]: undefined }));
  };

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    if (isImageFile(f.name)) {
      const reader = new FileReader();
      reader.onload = e => setFilePreview(e.target.result);
      reader.readAsDataURL(f);
    } else {
      setFilePreview(null);
    }
  };

  const validate = () => {
    const e = {};
    if (!form.valid_from) e.valid_from = "Verplicht";
    if (!form.valid_until) {
      e.valid_until = "Verplicht";
    } else if (isArchiveEntry && form.valid_until >= today) {
      e.valid_until = "Archief is voor verlopen documenten (einddatum moet in het verleden liggen).";
    } else if (!isArchiveEntry && form.valid_until <= today) {
      e.valid_until = "Document is verlopen — voeg verlopen documenten toe via het archief.";
    } else if (form.valid_from && form.valid_until <= form.valid_from) {
      e.valid_until = "Geldig tot moet later zijn dan geldig vanaf";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let fileUrl = null;
      if (file) {
        setUploading(true);
        const res = await base44.integrations.Core.UploadFile({ file });
        fileUrl = res.file_url;
        setUploading(false);
      }

      // Archive existing active payroll tax statement documents when adding a new active one
      if (!isArchiveEntry) {
        const existing = await base44.entities.PersonnelDocument.filter({ personnel_id: personnelId, category: "payroll_tax_statement" });
        const actionAt = new Date().toISOString();
        for (const doc of existing) {
          if (!doc.metadata?.archived) {
            await base44.entities.PersonnelDocument.update(doc.id, {
              verification_status: "expired",
              metadata: buildAuditMetadata(currentUser, "vernieuwd", {
                ...(doc.metadata || {}),
                archived: true,
                archived_at: actionAt,
              }),
            });
          }
        }
      }

      await base44.entities.PersonnelDocument.create({
        personnel_id: personnelId,
        category: "payroll_tax_statement",
        document_type: form.document_type || "Loonheffingsverklaring",
        document_number: form.document_number || null,
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
        front_file_url: fileUrl,
        is_sensitive: true,
        verification_status: isArchiveEntry ? "expired" : "verified",
        metadata: buildAuditMetadata(currentUser, isArchiveEntry ? "gearchiveerd" : "toegevoegd", {
          doc_category: "payroll_tax_statement",
          archived: isArchiveEntry,
          front_file_url: fileUrl,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personnel-documents"] });
      onSaved?.();
      onClose();
    },
  });

  const wizardTitle = isArchiveEntry ? "Loonheffingsdocument archiveren" : "Loonheffingsdocument toevoegen";

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="scroll-mt-4 border-b border-primary/30 bg-muted/20 p-5"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">{wizardTitle}</p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: form fields */}
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Type / omschrijving</Label>
            <Input
              value={form.document_type}
              onChange={e => set("document_type", e.target.value)}
              className="h-8 text-sm"
              placeholder="Loonheffingsverklaring"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Documentnummer</Label>
            <Input
              value={form.document_number}
              onChange={e => set("document_number", e.target.value)}
              className="h-8 text-sm"
              placeholder="Optioneel"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Geldig vanaf <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={form.valid_from}
                onChange={e => set("valid_from", e.target.value)}
                className={`h-8 text-sm ${errors.valid_from ? "border-destructive" : ""}`}
              />
              {errors.valid_from && <p className="mt-1 text-xs text-destructive">{errors.valid_from}</p>}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Geldig tot <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={form.valid_until}
                onChange={e => set("valid_until", e.target.value)}
                className={`h-8 text-sm ${errors.valid_until ? "border-destructive" : ""}`}
                max={isArchiveEntry ? today : undefined}
                min={isArchiveEntry ? undefined : today}
              />
              {errors.valid_until && <p className="mt-1 text-xs text-destructive">{errors.valid_until}</p>}
            </div>
          </div>
        </div>

        {/* Right: file upload */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Document uploaden</Label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-primary bg-muted/20 hover:bg-accent/30 cursor-pointer transition-colors min-h-[160px] overflow-hidden"
          >
            {filePreview ? (
              <img src={filePreview} alt="Preview" className="w-full h-40 object-contain" />
            ) : file ? (
              <div className="text-center">
                <FileCheck2 className="mx-auto h-8 w-8 text-primary" />
                <p className="mt-2 text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">Klik om te vervangen</p>
              </div>
            ) : (
              <>
                <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                <span className="text-xs text-muted-foreground">Klik om te uploaden</span>
                <span className="text-[10px] text-muted-foreground/60">JPG, PNG of PDF</span>
              </>
            )}
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}><X className="mr-1 h-4 w-4" /> Annuleren</Button>
        <Button size="sm" onClick={() => { if (validate()) saveMutation.mutate(); }} disabled={saveMutation.isPending || uploading}>
          <Check className="mr-1 h-4 w-4" />
          {saveMutation.isPending ? "Opslaan..." : "Document opslaan"}
        </Button>
      </div>
    </motion.div>
  );
}

// ─── ZZP Section ──────────────────────────────────────────────────────────────

function ZzpDetailsSection({ person }) {
  const rows = [
    { label: "Bedrijfsnaam", value: person.self_employed_company_name },
    { label: "KvK-nummer", value: person.self_employed_kvk_number },
    { label: "Btw-nummer", value: person.self_employed_vat_number },
    { label: "Aansprakelijkheid", value: person.self_employed_liability_insurance },
    { label: "Standaard uurtarief", value: formatCurrency(person.zzp_hourly_rate_excl_vat) },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <BriefcaseBusiness className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">ZZP-bedrijfsgegevens</h3>
        </div>
        <div className="p-4">
          {rows.map(r => (
            <div key={r.label} className="grid grid-cols-1 gap-1 border-b border-border/70 py-2 last:border-0 sm:grid-cols-[180px_1fr]">
              <span className="text-xs font-medium text-muted-foreground">{r.label}</span>
              <span className="text-sm text-foreground">{r.value || "-"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function PayrollTab({ person, documents }) {
  const queryClient = useQueryClient();
  const relationship = getRelationshipType(person);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardArchiveMode, setWizardArchiveMode] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  const { data: currentUser = null } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });

  // Loonheffingskorting state
  const [creditApplies, setCreditApplies] = useState(
    person.payroll_tax_credit_applies === true ? "true" :
    person.payroll_tax_credit_applies === false ? "false" : "unknown"
  );
  const [signedAt, setSignedAt] = useState(person.payroll_tax_statement_signed_at || "");
  const [creditSaved, setCreditSaved] = useState(false);

  useEffect(() => {
    setCreditApplies(
      person.payroll_tax_credit_applies === true ? "true" :
      person.payroll_tax_credit_applies === false ? "false" : "unknown"
    );
    setSignedAt(person.payroll_tax_statement_signed_at || "");
  }, [person]);

  const saveCreditMutation = useMutation({
    mutationFn: () => base44.entities.Personnel.update(person.id, {
      payroll_tax_credit_applies: creditApplies === "true" ? true : creditApplies === "false" ? false : null,
      payroll_tax_statement_signed_at: signedAt || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personnel"] });
      setCreditSaved(true);
      setTimeout(() => setCreditSaved(false), 2000);
    },
  });

  const payrollDocs = documents.filter(d => d.category === "payroll_tax_statement");
  const activeDocs = payrollDocs.filter(d => !isArchivedPayrollDocument(d));
  const archivedDocs = payrollDocs.filter(d => isArchivedPayrollDocument(d));
  const sortDocs = docs => [...docs].sort((a, b) => String(b.valid_until || "").localeCompare(String(a.valid_until || "")));
  const sortedActive = sortDocs(activeDocs);
  const sortedArchived = sortDocs(archivedDocs);

  if (relationship === "self_employed") {
    return <ZzpDetailsSection person={person} />;
  }

  const openWizard = (archiveMode = false) => {
    setWizardArchiveMode(archiveMode);
    setWizardOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      <AnimatePresence>
        {wizardOpen && (
          <PayrollDocumentWizard
            personnelId={person.id}
            isArchiveEntry={wizardArchiveMode}
            onClose={() => setWizardOpen(false)}
            onSaved={() => setWizardOpen(false)}
            currentUser={currentUser}
          />
        )}
      </AnimatePresence>

      {/* Loonheffingskorting section */}
      <div className="border-b border-border bg-muted/20 px-5 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loonheffingskorting</span>
          <Select value={creditApplies} onValueChange={v => { setCreditApplies(v); setCreditSaved(false); }}>
            <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Ja</SelectItem>
              <SelectItem value="false">Nee</SelectItem>
              <SelectItem value="unknown">Onbekend</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Verklaring getekend op</Label>
            <Input
              type="date"
              value={signedAt}
              onChange={e => { setSignedAt(e.target.value); setCreditSaved(false); }}
              className="h-7 w-36 text-xs"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-3 text-xs"
            onClick={() => saveCreditMutation.mutate()}
            disabled={saveCreditMutation.isPending}
          >
            {saveCreditMutation.isPending ? (
              <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Opslaan...</>
            ) : creditSaved ? (
              <><Check className="mr-1 h-3 w-3" /> Opgeslagen</>
            ) : (
              <><Check className="mr-1 h-3 w-3" /> Opslaan</>
            )}
          </Button>
        </div>
      </div>

      {/* Table header */}
      <div className={`${PAYROLL_TABLE_GRID} items-center border-b border-border bg-muted/30 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
        <span>Type / omschrijving</span>
        <span>Documentnummer</span>
        <span>Geldig tot</span>
        <span>Toegevoegd/vernieuwd door</span>
        {!wizardOpen && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {showArchive ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowArchive(false)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal">
                  <ArrowLeft className="w-3 h-3 mr-1" /> Actieve documenten
                </Button>
                <Button size="sm" variant="outline" onClick={() => openWizard(true)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal">
                  <Plus className="w-3 h-3 mr-1" /> Oud document
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowArchive(true)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal">
                  <Archive className="w-3 h-3 mr-1" /> Archief {sortedArchived.length > 0 ? `(${sortedArchived.length})` : ""}
                </Button>
                <Button size="sm" variant="outline" onClick={() => openWizard(false)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal">
                  <Plus className="w-3 h-3 mr-1" /> Nieuw document
                </Button>
              </>
            )}
          </div>
        )}
        {wizardOpen && <span />}
      </div>

      {/* Table rows */}
      {showArchive ? (
        sortedArchived.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Geen documenten in het archief.</p>
        ) : (
          <div className="divide-y divide-border">
            {sortedArchived.map(doc => (
              <PayrollDocumentRow key={doc.id} doc={doc} archived onPreview={setPreviewDoc} />
            ))}
          </div>
        )
      ) : sortedActive.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nog geen loonheffingsdocumenten geregistreerd.</p>
      ) : (
        <div className="divide-y divide-border">
          {sortedActive.map(doc => (
            <PayrollDocumentRow key={doc.id} doc={doc} onPreview={setPreviewDoc} />
          ))}
        </div>
      )}

      <PayrollDocumentPreviewDialog
        document={previewDoc}
        open={Boolean(previewDoc)}
        onOpenChange={open => { if (!open) setPreviewDoc(null); }}
      />
    </div>
  );
}