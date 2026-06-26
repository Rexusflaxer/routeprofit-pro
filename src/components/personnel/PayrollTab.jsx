import React, { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, Archive, ArrowLeft, Check, Eye,
  FileCheck2, FileText, ImageIcon, Loader2, Plus, RefreshCw, Trash2, X,
} from "lucide-react";
import { buildAuditMetadata, getAuditActorLabel } from "@/lib/auditTrail";

const DELETE_PASSWORD = "verwijder";
const PAYROLL_TABLE_GRID = "grid grid-cols-[minmax(160px,200px)_minmax(130px,170px)_minmax(96px,124px)_minmax(110px,140px)_minmax(110px,1fr)_minmax(280px,max-content)] gap-3";

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

function dateSortKey(value) {
  if (!value) return "";
  const text = String(value).trim();
  const dutchDate = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dutchDate) return `${dutchDate[3]}-${dutchDate[2]}-${dutchDate[1]}`;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
  return text;
}

function payrollActiveSortValue(doc) {
  return [
    dateSortKey(doc?.valid_until),
    String(doc?.updated_date || doc?.created_date || ""),
    String(doc?.id || ""),
  ].join("|");
}

function isExpiredPayrollDocument(doc) {
  const today = new Date().toISOString().split("T")[0];
  return (doc?.valid_until && dateSortKey(doc.valid_until) < today) || doc?.verification_status === "expired";
}

function verificationStatusForActivePayrollDocument(doc) {
  const today = new Date().toISOString().split("T")[0];
  return doc?.valid_until && dateSortKey(doc.valid_until) < today ? "expired" : "verified";
}

function comparePayrollRestoreCandidates(a, b, restoreId) {
  const validUntilDiff = dateSortKey(b?.valid_until).localeCompare(dateSortKey(a?.valid_until));
  if (validUntilDiff !== 0) return validUntilDiff;

  const aIsRestore = a?.id === restoreId;
  const bIsRestore = b?.id === restoreId;
  if (aIsRestore && !bIsRestore) return 1;
  if (!aIsRestore && bIsRestore) return -1;

  return payrollActiveSortValue(b).localeCompare(payrollActiveSortValue(a));
}

function splitPayrollDocumentsByActiveState(docs) {
  const nonArchived = [];
  const archived = [];

  for (const doc of docs) {
    if (isArchivedPayrollDocument(doc)) {
      archived.push(doc);
    } else {
      nonArchived.push(doc);
    }
  }

  const sortedNonArchived = [...nonArchived].sort((a, b) =>
    payrollActiveSortValue(b).localeCompare(payrollActiveSortValue(a))
  );

  const active = sortedNonArchived.slice(0, 1);
  const effectiveArchived = sortedNonArchived.slice(1);

  return {
    active,
    archived: [...archived, ...effectiveArchived],
    effectiveArchived,
  };
}

// ─── Status Badge ──────────────────────────────────────────────────────────────

function PayrollStatusBadge({ doc, archived = false }) {
  if (archived || isArchivedPayrollDocument(doc)) {
    return <Badge className="text-xs bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 border-0 whitespace-nowrap">Gearchiveerd</Badge>;
  }
  if (isExpiredPayrollDocument(doc)) {
    return <Badge className="text-xs bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 border-0 whitespace-nowrap">Actie vereist</Badge>;
  }
  if (doc?.verification_status === "verified") {
    return <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200 border-0 whitespace-nowrap">Actief</Badge>;
  }
  if (doc?.verification_status === "pending_review") {
    return <Badge className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-0 whitespace-nowrap">In beoordeling</Badge>;
  }
  if (doc?.verification_status === "rejected") {
    return <Badge className="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-0 whitespace-nowrap">Afgekeurd</Badge>;
  }
  return <Badge className="text-xs bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-0 whitespace-nowrap">Geüpload</Badge>;
}

// ─── Document Row ─────────────────────────────────────────────────────────────

function PayrollDocumentRow({
  doc,
  archived = false,
  onPreview,
  onRenew,
  onArchive,
  onRestore,
  onDelete,
  auditActors = [],
  restorePending = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const expiry = getExpiryState(doc.valid_until);
  const canPreview = hasPayrollDocumentUpload(doc);
  const isExpired = !archived && isExpiredPayrollDocument(doc);
  const canArchive = !archived;
  const canRestore = archived;
  const canDelete = archived;

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = event => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  const openRow = () => {
    if (isExpired) {
      setMenuOpen(current => !current);
    } else if (canPreview) {
      onPreview?.(doc);
    }
  };

  return (
    <div
      className={`${PAYROLL_TABLE_GRID} relative items-center px-5 py-3 transition-colors ${
        isExpired || canPreview ? "cursor-pointer hover:bg-accent/35" : ""
      }`}
      onClick={openRow}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {doc.document_type || "Loonheffingsverklaring"}
        </p>
      </div>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{doc.document_number || "-"}</span>
      <div className="min-w-0">
        <PayrollStatusBadge doc={doc} archived={archived} />
      </div>
      <div className="min-w-0 flex items-center gap-2">
        <span className="text-sm text-foreground">{formatDate(doc.valid_until)}</span>
        {expiry && !archived && <Badge className={`text-xs ${expiry.className} border-0 whitespace-nowrap`}>{expiry.label}</Badge>}
      </div>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{getAuditActorLabel(doc, auditActors)}</span>
      <div className="flex justify-end gap-1">
        {canArchive && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={event => { event.stopPropagation(); onArchive?.(doc); }}
            title="Naar archief"
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
        )}
        {canRestore && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={event => { event.stopPropagation(); onRestore?.(doc); }}
            disabled={restorePending}
            title="Terugzetten naar actief"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
        {canDelete && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={event => { event.stopPropagation(); onDelete?.(doc); }}
            title="Definitief verwijderen"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {menuOpen && isExpired && (
        <div
          ref={menuRef}
          className="absolute right-4 top-11 z-50 min-w-[210px] overflow-hidden rounded-lg border border-border bg-popover py-1 text-sm shadow-lg"
          onClick={event => event.stopPropagation()}
        >
          {canPreview && (
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-foreground transition-colors hover:bg-accent"
              onClick={() => { setMenuOpen(false); onPreview(doc); }}
            >
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              Document bekijken
            </button>
          )}
          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-foreground transition-colors hover:bg-accent"
            onClick={() => { setMenuOpen(false); onRenew(); }}
          >
            <RefreshCw className="h-3.5 w-3.5 text-amber-500" />
            Loonheffingsverklaring vernieuwen
          </button>
        </div>
      )}
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

// ─── Delete Confirm Dialog ─────────────────────────────────────────────────────

function PayrollDeleteConfirmDialog({ document, open, onOpenChange, onConfirm, isPending }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setPassword("");
      setError("");
    }
  }, [open]);

  const handleConfirm = () => {
    if (password !== DELETE_PASSWORD) {
      setError(`Typ "${DELETE_PASSWORD}" om te bevestigen`);
      return;
    }
    onConfirm?.(document);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Document definitief verwijderen?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="text-sm">
              <p className="font-medium text-foreground">
                {document?.document_type || "Loonheffingsverklaring"} {document?.document_number ? `#${document.document_number}` : ""} wordt verwijderd.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Deze actie is alleen bedoeld voor verkeerd toegevoegde archiefdocumenten.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Typ <strong className="font-mono text-foreground">{DELETE_PASSWORD}</strong> om te bevestigen
            </Label>
            <Input
              value={password}
              onChange={event => { setPassword(event.target.value); setError(""); }}
              onKeyDown={event => event.key === "Enter" && handleConfirm()}
              placeholder={DELETE_PASSWORD}
              className={`h-9 font-mono ${error ? "border-destructive" : ""}`}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Annuleren</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isPending}>
            <Trash2 className="mr-1 h-4 w-4" /> {isPending ? "Verwijderen..." : "Verwijderen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

function PayrollDocumentWizard({ personnelId, isArchiveEntry = false, onClose, onSaved, currentUser, auditActors = [] }) {
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
              }, auditActors),
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
        }, auditActors),
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
          <FileText className="h-4 w-4 text-muted-foreground" />
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

export default function PayrollTab({ person, documents, auditActors = [] }) {
  const queryClient = useQueryClient();
  const relationship = getRelationshipType(person);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardArchiveMode, setWizardArchiveMode] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [deleteDoc, setDeleteDoc] = useState(null);
  const [archiveMessage, setArchiveMessage] = useState(null);

  const { data: currentUser = null } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!archiveMessage) return undefined;
    const timer = setTimeout(() => setArchiveMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [archiveMessage]);

  const payrollAllDocs = useMemo(
    () => documents.filter(d => d.category === "payroll_tax_statement"),
    [documents]
  );
  const payrollSplit = useMemo(
    () => splitPayrollDocumentsByActiveState(payrollAllDocs),
    [payrollAllDocs]
  );
  const sortDocs = docs => [...docs].sort((a, b) =>
    dateSortKey(b.valid_until).localeCompare(dateSortKey(a.valid_until))
  );
  const sortedActive = sortDocs(payrollSplit.active);
  const sortedArchived = sortDocs(payrollSplit.archived);

  const docsToAutoArchive = useMemo(
    () => payrollSplit.effectiveArchived.filter(doc => doc.metadata?.archived !== true),
    [payrollSplit]
  );
  const docsToAutoArchiveSignature = docsToAutoArchive
    .map(doc => `${doc.id}:${doc.valid_until || ""}`)
    .join("|");

  useEffect(() => {
    if (docsToAutoArchive.length === 0) return undefined;

    let cancelled = false;
    Promise.all(docsToAutoArchive.map(doc => base44.entities.PersonnelDocument.update(doc.id, {
      verification_status: "expired",
      metadata: buildAuditMetadata(currentUser, "gearchiveerd", {
        ...(doc.metadata || {}),
        archived: true,
        archived_at: new Date().toISOString(),
      }, auditActors),
    }))).then(() => {
      if (!cancelled) queryClient.invalidateQueries({ queryKey: ["personnel-documents"] });
    }).catch(error => {
      console.error("Payroll document auto-archive failed", error);
    });

    return () => {
      cancelled = true;
    };
  }, [auditActors, currentUser, docsToAutoArchive, docsToAutoArchiveSignature, queryClient]);

  const archiveMutation = useMutation({
    mutationFn: doc => base44.entities.PersonnelDocument.update(doc.id, {
      verification_status: "expired",
      metadata: buildAuditMetadata(currentUser, "gearchiveerd", {
        ...(doc.metadata || {}),
        archived: true,
        archived_at: new Date().toISOString(),
      }, auditActors),
    }),
    onSuccess: (_data, doc) => {
      setArchiveMessage({
        type: "success",
        text: `${doc.document_type || "Loonheffingsverklaring"} is naar het archief gezet.`,
      });
      queryClient.invalidateQueries({ queryKey: ["personnel-documents"] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async doc => {
      const allDocs = await base44.entities.PersonnelDocument.filter({ personnel_id: person.id, category: "payroll_tax_statement" }, "-created_date");
      const sameActiveDocs = allDocs
        .filter(item => item.id !== doc.id)
        .filter(item => !isArchivedPayrollDocument(item));

      const winner = [doc, ...sameActiveDocs]
        .sort((a, b) => comparePayrollRestoreCandidates(a, b, doc.id))[0];

      if (winner?.id !== doc.id) {
        return { restored: false, activeDoc: winner };
      }

      const now = new Date().toISOString();
      await Promise.all(sameActiveDocs.map(activeDoc => base44.entities.PersonnelDocument.update(activeDoc.id, {
        verification_status: "expired",
        metadata: buildAuditMetadata(currentUser, "gearchiveerd", {
          ...(activeDoc.metadata || {}),
          archived: true,
          archived_at: now,
          archived_reason: "Vervangen door teruggezet archiefdocument",
        }, auditActors),
      })));

      await base44.entities.PersonnelDocument.update(doc.id, {
        verification_status: verificationStatusForActivePayrollDocument(doc),
        metadata: buildAuditMetadata(currentUser, "teruggezet", {
          ...(doc.metadata || {}),
          archived: false,
          archived_at: null,
          restored_from_archive_at: now,
        }, auditActors),
      });

      return { restored: true, replacedCount: sameActiveDocs.length };
    },
    onSuccess: result => {
      if (result?.restored) {
        setArchiveMessage({
          type: "success",
          text: result.replacedCount > 0
            ? "Loonheffingsverklaring is teruggezet naar actief. Het eerdere actieve document is naar het archief gezet."
            : "Loonheffingsverklaring is teruggezet naar actieve documenten.",
        });
      } else {
        setArchiveMessage({
          type: "warning",
          text: "Niet teruggezet: er is al een nieuwer of even lang geldig actief document. Dit document blijft in het archief.",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["personnel-documents"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: doc => base44.entities.PersonnelDocument.delete(doc.id),
    onSuccess: () => {
      setDeleteDoc(null);
      queryClient.invalidateQueries({ queryKey: ["personnel-documents"] });
    },
  });

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
            auditActors={auditActors}
          />
        )}
      </AnimatePresence>

      {/* Table header */}
      <div className={`${PAYROLL_TABLE_GRID} items-center border-b border-border bg-muted/30 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
        <span>Type / omschrijving</span>
        <span>Documentnummer</span>
        <span>Status</span>
        <span>Geldig tot</span>
        <span>Door</span>
        {!wizardOpen && (
          <div className="flex flex-nowrap items-center justify-end gap-2">
            {showArchive && <Badge className="shrink-0 bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 animate-pulse">Archief</Badge>}
            {showArchive ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowArchive(false)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                  <ArrowLeft className="w-3 h-3 mr-1" /> Actieve documenten
                </Button>
                <Button size="sm" variant="outline" onClick={() => openWizard(true)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                  <Plus className="w-3 h-3 mr-1" /> Voeg oud document in archief
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowArchive(true)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                  <Archive className="w-3 h-3 mr-1" /> Archief {sortedArchived.length > 0 ? `(${sortedArchived.length})` : ""}
                </Button>
                <Button size="sm" variant="outline" onClick={() => openWizard(false)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                  <Plus className="w-3 h-3 mr-1" /> Nieuw document
                </Button>
              </>
            )}
          </div>
        )}
        {wizardOpen && (
          <div className="flex justify-end">
            {showArchive && <Badge className="shrink-0 bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 animate-pulse">Archief</Badge>}
          </div>
        )}
      </div>

      {/* Archive message */}
      {archiveMessage && !wizardOpen && (
        <div className="px-5 pt-3">
          <div className={`flex items-start gap-3 rounded-md border px-3 py-2 text-xs ${
            archiveMessage.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
          }`}>
            <span>{archiveMessage.text}</span>
          </div>
        </div>
      )}

      {/* Table rows */}
      {showArchive ? (
        sortedArchived.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Geen documenten in het archief.</p>
        ) : (
          <div className="divide-y divide-border">
            {sortedArchived.map(doc => (
              <PayrollDocumentRow
                key={doc.id}
                doc={doc}
                archived
                onPreview={setPreviewDoc}
                onRenew={() => openWizard()}
                onArchive={archiveMutation.mutate}
                onRestore={restoreMutation.mutate}
                onDelete={setDeleteDoc}
                auditActors={auditActors}
                restorePending={restoreMutation.isPending}
              />
            ))}
          </div>
        )
      ) : sortedActive.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nog geen loonheffingsdocumenten geregistreerd.</p>
      ) : (
        <div className="divide-y divide-border">
          {sortedActive.map(doc => (
            <PayrollDocumentRow
              key={doc.id}
              doc={doc}
              onPreview={setPreviewDoc}
              onRenew={() => openWizard()}
              onArchive={archiveMutation.mutate}
              onDelete={setDeleteDoc}
              auditActors={auditActors}
            />
          ))}
        </div>
      )}

      <PayrollDocumentPreviewDialog
        document={previewDoc}
        open={Boolean(previewDoc)}
        onOpenChange={open => { if (!open) setPreviewDoc(null); }}
      />
      <PayrollDeleteConfirmDialog
        document={deleteDoc}
        open={Boolean(deleteDoc)}
        onOpenChange={open => { if (!open) setDeleteDoc(null); }}
        onConfirm={doc => deleteMutation.mutate(doc)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}