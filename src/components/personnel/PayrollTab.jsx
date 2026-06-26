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
  AlertTriangle, Archive, ArrowLeft, Check, ChevronRight, Download,
  Eye, FileCheck2, FileText, ImageIcon, Loader2, Plus, RefreshCw,
  Send, Trash2, Upload, X,
} from "lucide-react";
import { buildAuditMetadata, getAuditActorLabel } from "@/lib/auditTrail";

const DELETE_PASSWORD = "verwijder";
const FORM_PDF_URL = "https://media.base44.com/files/public/698e307ed3aa4cab3729bbf1/4551ed708_model_opgaaf_gegevens_loonheffingen_lh0082z11fol-5.pdf";

// Table grid: omschrijving | loonheffingskorting | alleenstaande-ouderenkorting | status | door | acties
const PAYROLL_TABLE_GRID = "grid grid-cols-[minmax(200px,1fr)_160px_200px_120px_150px_minmax(240px,max-content)] gap-3";

function formatDate(v, fallback = "-") {
  if (!v) return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatCurrency(v) {
  if (v === null || v === undefined || v === "") return "-";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(v || 0));
}

function getRelationshipType(p) {
  return p.relationship_type || (p.employee_type === "zzp" ? "self_employed" : "employee");
}

function isArchivedPayrollDocument(doc) {
  return doc?.metadata?.archived === true;
}

function isDraftPayrollDocument(doc) {
  return doc?.verification_status === "pending_review" && doc?.metadata?.draft === true;
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
  if (isDraftPayrollDocument(doc)) return false;
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
  const drafts = nonArchived.filter(isDraftPayrollDocument);
  const regular = nonArchived.filter(d => !isDraftPayrollDocument(d));
  const sortedRegular = [...regular].sort((a, b) => payrollActiveSortValue(b).localeCompare(payrollActiveSortValue(a)));
  const active = sortedRegular.slice(0, 1);
  const effectiveArchived = sortedRegular.slice(1);
  return {
    active: [...active, ...drafts],
    archived: [...archived, ...effectiveArchived],
    effectiveArchived,
  };
}

function lhkLabel(val) {
  if (val === true) return "Ja";
  if (val === false) return "Nee";
  return "-";
}

function lhkFromDateLabel(val) {
  if (!val) return null;
  return formatDate(val);
}

// ─── Status Badge ──────────────────────────────────────────────────────────────

function PayrollStatusBadge({ doc, archived = false }) {
  if (archived || isArchivedPayrollDocument(doc)) {
    return <Badge className="text-xs bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 border-0 whitespace-nowrap">Gearchiveerd</Badge>;
  }
  if (isDraftPayrollDocument(doc)) {
    return <Badge className="text-xs bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-0 whitespace-nowrap">Concept</Badge>;
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
  return <Badge className="text-xs bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-0 whitespace-nowrap">Geüpload</Badge>;
}

// ─── Document Row ─────────────────────────────────────────────────────────────

function PayrollDocumentRow({
  doc, archived = false,
  onPreview, onOpenWizardStep2, onArchive, onRestore, onDelete,
  auditActors = [], restorePending = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const canPreview = hasPayrollDocumentUpload(doc);
  const isExpired = !archived && isExpiredPayrollDocument(doc);
  const isDraft = isDraftPayrollDocument(doc);
  const canArchive = !archived && !isDraft;
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
    if (isDraft) {
      onOpenWizardStep2?.(doc);
    } else if (isExpired) {
      setMenuOpen(cur => !cur);
    } else if (canPreview) {
      onPreview?.(doc);
    }
  };

  const meta = doc?.metadata || {};
  const lhk = meta.payroll_tax_credit_applies;
  const lhkFrom = meta.payroll_tax_credit_from;
  const aok = meta.single_elderly_credit_applies;

  return (
    <div
      className={`${PAYROLL_TABLE_GRID} relative items-center px-5 py-3 transition-colors ${
        isDraft || isExpired || canPreview ? "cursor-pointer hover:bg-accent/35" : ""
      }`}
      onClick={openRow}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          Loonheffingsformulier
        </p>
        {isDraft && <p className="mt-0.5 text-xs text-muted-foreground">Klik om het formulier in te voeren</p>}
      </div>

      {/* Loonheffingskorting */}
      <div className="min-w-0">
        {lhk === true ? (
          <div>
            <span className="text-sm text-foreground">Ja</span>
            {lhkFrom && <p className="text-xs text-muted-foreground">v.a. {formatDate(lhkFrom)}</p>}
          </div>
        ) : lhk === false ? (
          <div>
            <span className="text-sm text-foreground">Nee</span>
            {lhkFrom && <p className="text-xs text-muted-foreground">v.a. {formatDate(lhkFrom)}</p>}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        )}
      </div>

      {/* Alleenstaande-ouderenkorting */}
      <div className="min-w-0">
        <span className="text-sm text-foreground">{aok === true ? "Ja" : aok === false ? "Nee" : "-"}</span>
      </div>

      <div className="min-w-0">
        <PayrollStatusBadge doc={doc} archived={archived} />
      </div>

      <span className="min-w-0 truncate text-sm text-muted-foreground">{getAuditActorLabel(doc, auditActors)}</span>

      <div className="flex justify-end gap-1">
        {isDraft && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={e => { e.stopPropagation(); onOpenWizardStep2?.(doc); }} title="Formulier invoeren">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}
        {canPreview && !isDraft && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={e => { e.stopPropagation(); onPreview(doc); }} title="Document bekijken">
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )}
        {canArchive && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={e => { e.stopPropagation(); onArchive?.(doc); }} title="Naar archief">
            <Archive className="h-3.5 w-3.5" />
          </Button>
        )}
        {canRestore && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={e => { e.stopPropagation(); onRestore?.(doc); }} disabled={restorePending} title="Terugzetten naar actief">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
        {canDelete && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={e => { e.stopPropagation(); onDelete?.(doc); }} title="Definitief verwijderen">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {menuOpen && isExpired && (
        <div ref={menuRef}
          className="absolute right-4 top-11 z-50 min-w-[210px] overflow-hidden rounded-lg border border-border bg-popover py-1 text-sm shadow-lg"
          onClick={e => e.stopPropagation()}>
          {canPreview && (
            <button type="button"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-foreground transition-colors hover:bg-accent"
              onClick={() => { setMenuOpen(false); onPreview(doc); }}>
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              Document bekijken
            </button>
          )}
          <button type="button"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-foreground transition-colors hover:bg-accent"
            onClick={() => { setMenuOpen(false); onOpenWizardStep2?.(null); }}>
            <RefreshCw className="h-3.5 w-3.5 text-amber-500" />
            Loonheffingsformulier vernieuwen
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
          <DialogTitle>Loonheffingsformulier</DialogTitle>
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
                <Button variant="outline" size="sm"><Eye className="mr-1 h-4 w-4" /> Openen in nieuw venster</Button>
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
  useEffect(() => { if (!open) { setPassword(""); setError(""); } }, [open]);

  const handleConfirm = () => {
    if (password !== DELETE_PASSWORD) { setError(`Typ "${DELETE_PASSWORD}" om te bevestigen`); return; }
    onConfirm?.(document);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Document definitief verwijderen?</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Loonheffingsformulier wordt verwijderd.</p>
              <p className="mt-1 text-xs text-muted-foreground">Deze actie is alleen bedoeld voor verkeerd toegevoegde archiefdocumenten.</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Typ <strong className="font-mono text-foreground">{DELETE_PASSWORD}</strong> om te bevestigen</Label>
            <Input value={password} onChange={e => { setPassword(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleConfirm()} placeholder={DELETE_PASSWORD}
              className={`h-9 font-mono ${error ? "border-destructive" : ""}`} autoFocus />
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
// step 1: keuze (aanbieden / handmatig uploaden / downloaden + concept)
// step 2: loonheffingskorting vragen + upload (bij handmatig of bij concept-rij)

function PayrollDocumentWizard({ personnelId, person, isArchiveEntry = false, existingDraftDoc = null, onClose, onSaved, currentUser, auditActors = [] }) {
  const queryClient = useQueryClient();

  // When coming from a draft row, skip step 1 and go straight to step 2
  const [step, setStep] = useState(existingDraftDoc ? 2 : 1);

  const [lhkApplies, setLhkApplies] = useState(
    existingDraftDoc?.metadata?.payroll_tax_credit_applies === true ? "true" :
    existingDraftDoc?.metadata?.payroll_tax_credit_applies === false ? "false" : ""
  );
  const [lhkFrom, setLhkFrom] = useState(existingDraftDoc?.metadata?.payroll_tax_credit_from || "");
  const [aokApplies, setAokApplies] = useState(
    existingDraftDoc?.metadata?.single_elderly_credit_applies === true ? "true" :
    existingDraftDoc?.metadata?.single_elderly_credit_applies === false ? "false" : ""
  );
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState({});
  const fileInputRef = useRef(null);

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
    if (!lhkApplies) e.lhkApplies = "Verplicht";
    if (lhkApplies === "true" && !lhkFrom) e.lhkFrom = "Verplicht als loonheffingskorting van toepassing is";
    if (lhkApplies === "false" && !lhkFrom) e.lhkFrom = "Verplicht (datum niet meer van toepassing)";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Download PDF and create a concept record
  const downloadAndCreateDraftMutation = useMutation({
    mutationFn: async () => {
      // Archive existing active docs
      const existing = await base44.entities.PersonnelDocument.filter({ personnel_id: personnelId, category: "payroll_tax_statement" });
      const actionAt = new Date().toISOString();
      for (const doc of existing) {
        if (!doc.metadata?.archived && !isDraftPayrollDocument(doc)) {
          await base44.entities.PersonnelDocument.update(doc.id, {
            verification_status: "expired",
            metadata: buildAuditMetadata(currentUser, "gearchiveerd", {
              ...(doc.metadata || {}),
              archived: true,
              archived_at: actionAt,
            }, auditActors),
          });
        }
      }
      await base44.entities.PersonnelDocument.create({
        personnel_id: personnelId,
        category: "payroll_tax_statement",
        document_type: "Loonheffingsformulier",
        is_sensitive: true,
        verification_status: "pending_review",
        metadata: buildAuditMetadata(currentUser, "concept aangemaakt", {
          doc_category: "payroll_tax_statement",
          draft: true,
        }, auditActors),
      });
    },
    onSuccess: () => {
      // Trigger download
      const a = window.document.createElement("a");
      a.href = FORM_PDF_URL;
      a.download = "Loonheffingsformulier_belastingdienst.pdf";
      a.target = "_blank";
      a.click();
      queryClient.invalidateQueries({ queryKey: ["personnel-documents"] });
      onClose();
    },
  });

  // Save step 2 (manual upload or filling in existing draft)
  const saveMutation = useMutation({
    mutationFn: async () => {
      let fileUrl = existingDraftDoc ? payrollDocumentFileUrl(existingDraftDoc) : null;
      if (file) {
        setUploading(true);
        const res = await base44.integrations.Core.UploadFile({ file });
        fileUrl = res.file_url;
        setUploading(false);
      }

      const creditApplies = lhkApplies === "true" ? true : lhkApplies === "false" ? false : null;
      const singleElderlyApplies = aokApplies === "true" ? true : aokApplies === "false" ? false : null;

      const metaPayload = {
        doc_category: "payroll_tax_statement",
        archived: isArchiveEntry,
        front_file_url: fileUrl,
        payroll_tax_credit_applies: creditApplies,
        payroll_tax_credit_from: lhkFrom || null,
        single_elderly_credit_applies: singleElderlyApplies,
        draft: false,
      };

      if (existingDraftDoc) {
        // Update the existing draft to complete
        await base44.entities.PersonnelDocument.update(existingDraftDoc.id, {
          front_file_url: fileUrl,
          verification_status: isArchiveEntry ? "expired" : "verified",
          metadata: buildAuditMetadata(currentUser, "ingevuld", metaPayload, auditActors),
        });
      } else {
        // Archive existing active docs first
        const existing = await base44.entities.PersonnelDocument.filter({ personnel_id: personnelId, category: "payroll_tax_statement" });
        const actionAt = new Date().toISOString();
        for (const doc of existing) {
          if (!doc.metadata?.archived && !isDraftPayrollDocument(doc)) {
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
        await base44.entities.PersonnelDocument.create({
          personnel_id: personnelId,
          category: "payroll_tax_statement",
          document_type: "Loonheffingsformulier",
          front_file_url: fileUrl,
          is_sensitive: true,
          verification_status: isArchiveEntry ? "expired" : "verified",
          metadata: buildAuditMetadata(currentUser, isArchiveEntry ? "gearchiveerd" : "toegevoegd", metaPayload, auditActors),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personnel-documents"] });
      onSaved?.();
      onClose();
    },
  });

  const wizardTitle = isArchiveEntry
    ? "LOONHEFFINGSFORMULIER ARCHIVEREN"
    : existingDraftDoc
      ? "LOONHEFFINGSFORMULIER INVOEREN"
      : "LOONHEFFINGSFORMULIER TOEVOEGEN";

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="scroll-mt-4 border-b border-primary/30 bg-muted/20 p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{wizardTitle}</p>
        {step === 2 && !existingDraftDoc && (
          <button type="button" onClick={() => setStep(1)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3 w-3" /> Terug
          </button>
        )}
      </div>

      {/* ── Step 1: keuze ── */}
      {step === 1 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Aanbieden aan medewerker (nog niet geïmplementeerd) */}
          <button
            type="button"
            disabled
            className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 py-6 text-center opacity-50 cursor-not-allowed"
          >
            <Send className="h-8 w-8 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-semibold text-foreground">Aanbieden aan medewerker</p>
              <p className="mt-1 text-xs text-muted-foreground">Binnenkort beschikbaar via Teamhub</p>
            </div>
          </button>

          {/* Handmatig uploaden */}
          <button
            type="button"
            onClick={() => setStep(2)}
            className="flex flex-col items-center gap-3 rounded-lg border-2 border-border hover:border-primary bg-background hover:bg-accent/30 px-4 py-6 text-center cursor-pointer transition-colors"
          >
            <Upload className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">Handmatig uploaden</p>
              <p className="mt-1 text-xs text-muted-foreground">Vul het ingevulde formulier in en upload het document</p>
            </div>
            <ChevronRight className="h-4 w-4 text-primary" />
          </button>

          {/* Formulier downloaden */}
          <button
            type="button"
            onClick={() => downloadAndCreateDraftMutation.mutate()}
            disabled={downloadAndCreateDraftMutation.isPending}
            className="flex flex-col items-center gap-3 rounded-lg border-2 border-border hover:border-primary bg-background hover:bg-accent/30 px-4 py-6 text-center cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloadAndCreateDraftMutation.isPending
              ? <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
              : <Download className="h-8 w-8 text-muted-foreground" />
            }
            <div>
              <p className="text-sm font-semibold text-foreground">Formulier downloaden en handmatig aanbieden</p>
              <p className="mt-1 text-xs text-muted-foreground">Download het Belastingdienst-formulier en maak een concept aan om later in te voeren</p>
            </div>
          </button>
        </div>
      )}

      {/* ── Step 2: vragen + upload ── */}
      {step === 2 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: vragen */}
          <div className="space-y-5">
            {/* 2a Loonheffingskorting */}
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">2a — Loonheffingskorting toepassen?</Label>
              <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
                U kunt de loonheffingskorting maar door 1 werkgever laten toepassen.
              </p>
              <div className="flex flex-col gap-2">
                {[
                  { value: "true", label: "Ja, toepassen" },
                  { value: "false", label: "Nee, niet (meer) toepassen" },
                ].map(opt => (
                  <label key={opt.value} className={`flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${
                    lhkApplies === opt.value ? "border-primary bg-primary/5" : "border-border hover:bg-accent/30"
                  }`}>
                    <div className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                      lhkApplies === opt.value ? "border-primary" : "border-muted-foreground/40"
                    }`}>
                      {lhkApplies === opt.value && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                    <input type="radio" className="sr-only" value={opt.value} checked={lhkApplies === opt.value}
                      onChange={() => { setLhkApplies(opt.value); setErrors(e => ({ ...e, lhkApplies: undefined })); }} />
                    <span className="text-sm font-medium">{opt.label}</span>
                  </label>
                ))}
              </div>
              {errors.lhkApplies && <p className="mt-1 text-xs text-destructive">{errors.lhkApplies}</p>}

              {lhkApplies && (
                <div className="mt-3">
                  <Label className="text-xs text-muted-foreground">
                    {lhkApplies === "true" ? "Toepassen vanaf" : "Niet meer toepassen vanaf"} <span className="text-destructive">*</span>
                  </Label>
                  <Input type="date" value={lhkFrom} onChange={e => { setLhkFrom(e.target.value); setErrors(err => ({ ...err, lhkFrom: undefined })); }}
                    className={`mt-1 h-8 text-sm ${errors.lhkFrom ? "border-destructive" : ""}`} />
                  {errors.lhkFrom && <p className="mt-1 text-xs text-destructive">{errors.lhkFrom}</p>}
                </div>
              )}
            </div>

            {/* 2b Alleenstaande-ouderenkorting (alleen tonen als 2a = Ja) */}
            {lhkApplies === "true" && (
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">2b — Alleenstaande-ouderenkorting toepassen?</Label>
                <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
                  Alleen van toepassing als u recht hebt op AOW voor alleenstaanden.
                </p>
                <div className="flex flex-col gap-2">
                  {[
                    { value: "true", label: "Ja" },
                    { value: "false", label: "Nee" },
                  ].map(opt => (
                    <label key={opt.value} className={`flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${
                      aokApplies === opt.value ? "border-primary bg-primary/5" : "border-border hover:bg-accent/30"
                    }`}>
                      <div className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                        aokApplies === opt.value ? "border-primary" : "border-muted-foreground/40"
                      }`}>
                        {aokApplies === opt.value && <div className="h-2 w-2 rounded-full bg-primary" />}
                      </div>
                      <input type="radio" className="sr-only" value={opt.value} checked={aokApplies === opt.value}
                        onChange={() => setAokApplies(opt.value)} />
                      <span className="text-sm font-medium">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: upload */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Ingevuld formulier uploaden</Label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-primary bg-muted/20 hover:bg-accent/30 cursor-pointer transition-colors min-h-[180px] overflow-hidden"
            >
              {filePreview ? (
                <img src={filePreview} alt="Preview" className="w-full h-44 object-contain" />
              ) : file ? (
                <div className="text-center">
                  <FileCheck2 className="mx-auto h-8 w-8 text-primary" />
                  <p className="mt-2 text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">Klik om te vervangen</p>
                </div>
              ) : existingDraftDoc && hasPayrollDocumentUpload(existingDraftDoc) ? (
                <div className="text-center">
                  <FileCheck2 className="mx-auto h-8 w-8 text-primary" />
                  <p className="mt-2 text-sm font-medium text-foreground">Bestaand bestand</p>
                  <p className="text-xs text-muted-foreground">Klik om te vervangen</p>
                </div>
              ) : (
                <>
                  <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                  <span className="text-xs text-muted-foreground">Klik om te uploaden</span>
                  <span className="text-[10px] text-muted-foreground/60">JPG, PNG of PDF — optioneel</span>
                </>
              )}
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          </div>
        </div>
      )}

      {/* Footer buttons */}
      {(step === 2 || (step === 1 && false)) && (
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}><X className="mr-1 h-4 w-4" /> Annuleren</Button>
          <Button size="sm" onClick={() => { if (validate()) saveMutation.mutate(); }} disabled={saveMutation.isPending || uploading}>
            <Check className="mr-1 h-4 w-4" />
            {saveMutation.isPending ? "Opslaan..." : "Formulier opslaan"}
          </Button>
        </div>
      )}
      {step === 1 && (
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}><X className="mr-1 h-4 w-4" /> Annuleren</Button>
        </div>
      )}
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
  const [wizardDraftDoc, setWizardDraftDoc] = useState(null);
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

  const payrollAllDocs = useMemo(() => documents.filter(d => d.category === "payroll_tax_statement"), [documents]);
  const payrollSplit = useMemo(() => splitPayrollDocumentsByActiveState(payrollAllDocs), [payrollAllDocs]);
  const sortDocs = docs => [...docs].sort((a, b) => {
    // drafts always first
    if (isDraftPayrollDocument(a) && !isDraftPayrollDocument(b)) return -1;
    if (!isDraftPayrollDocument(a) && isDraftPayrollDocument(b)) return 1;
    return dateSortKey(b.valid_until).localeCompare(dateSortKey(a.valid_until));
  });
  const sortedActive = sortDocs(payrollSplit.active);
  const sortedArchived = sortDocs(payrollSplit.archived);

  const docsToAutoArchive = useMemo(
    () => payrollSplit.effectiveArchived.filter(doc => doc.metadata?.archived !== true),
    [payrollSplit]
  );
  const docsToAutoArchiveSignature = docsToAutoArchive.map(doc => `${doc.id}:${doc.valid_until || ""}`).join("|");

  useEffect(() => {
    if (docsToAutoArchive.length === 0) return undefined;
    let cancelled = false;
    Promise.all(docsToAutoArchive.map(doc => base44.entities.PersonnelDocument.update(doc.id, {
      verification_status: "expired",
      metadata: buildAuditMetadata(currentUser, "gearchiveerd", {
        ...(doc.metadata || {}), archived: true, archived_at: new Date().toISOString(),
      }, auditActors),
    }))).then(() => { if (!cancelled) queryClient.invalidateQueries({ queryKey: ["personnel-documents"] }); })
      .catch(err => console.error("Payroll auto-archive failed", err));
    return () => { cancelled = true; };
  }, [auditActors, currentUser, docsToAutoArchive, docsToAutoArchiveSignature, queryClient]);

  const archiveMutation = useMutation({
    mutationFn: doc => base44.entities.PersonnelDocument.update(doc.id, {
      verification_status: "expired",
      metadata: buildAuditMetadata(currentUser, "gearchiveerd", {
        ...(doc.metadata || {}), archived: true, archived_at: new Date().toISOString(),
      }, auditActors),
    }),
    onSuccess: () => {
      setArchiveMessage({ type: "success", text: "Loonheffingsformulier is naar het archief gezet." });
      queryClient.invalidateQueries({ queryKey: ["personnel-documents"] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async doc => {
      const allDocs = await base44.entities.PersonnelDocument.filter({ personnel_id: person.id, category: "payroll_tax_statement" }, "-created_date");
      const sameActiveDocs = allDocs.filter(item => item.id !== doc.id).filter(item => !isArchivedPayrollDocument(item));
      const winner = [doc, ...sameActiveDocs].sort((a, b) => comparePayrollRestoreCandidates(a, b, doc.id))[0];
      if (winner?.id !== doc.id) return { restored: false };
      const now = new Date().toISOString();
      await Promise.all(sameActiveDocs.map(activeDoc => base44.entities.PersonnelDocument.update(activeDoc.id, {
        verification_status: "expired",
        metadata: buildAuditMetadata(currentUser, "gearchiveerd", {
          ...(activeDoc.metadata || {}), archived: true, archived_at: now, archived_reason: "Vervangen door teruggezet archiefdocument",
        }, auditActors),
      })));
      await base44.entities.PersonnelDocument.update(doc.id, {
        verification_status: verificationStatusForActivePayrollDocument(doc),
        metadata: buildAuditMetadata(currentUser, "teruggezet", {
          ...(doc.metadata || {}), archived: false, archived_at: null, restored_from_archive_at: now,
        }, auditActors),
      });
      return { restored: true, replacedCount: sameActiveDocs.length };
    },
    onSuccess: result => {
      setArchiveMessage(result?.restored
        ? { type: "success", text: result.replacedCount > 0 ? "Loonheffingsformulier is teruggezet. Het eerdere actieve document is gearchiveerd." : "Loonheffingsformulier is teruggezet naar actieve documenten." }
        : { type: "warning", text: "Niet teruggezet: er is al een nieuwer actief document. Dit document blijft in het archief." }
      );
      queryClient.invalidateQueries({ queryKey: ["personnel-documents"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: doc => base44.entities.PersonnelDocument.delete(doc.id),
    onSuccess: () => { setDeleteDoc(null); queryClient.invalidateQueries({ queryKey: ["personnel-documents"] }); },
  });

  if (relationship === "self_employed") return <ZzpDetailsSection person={person} />;

  const openWizard = (archiveMode = false, draftDoc = null) => {
    setWizardArchiveMode(archiveMode);
    setWizardDraftDoc(draftDoc);
    setWizardOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      <AnimatePresence>
        {wizardOpen && (
          <PayrollDocumentWizard
            personnelId={person.id}
            person={person}
            isArchiveEntry={wizardArchiveMode}
            existingDraftDoc={wizardDraftDoc}
            onClose={() => { setWizardOpen(false); setWizardDraftDoc(null); }}
            onSaved={() => { setWizardOpen(false); setWizardDraftDoc(null); }}
            currentUser={currentUser}
            auditActors={auditActors}
          />
        )}
      </AnimatePresence>

      {/* Table header */}
      <div className={`${PAYROLL_TABLE_GRID} items-center border-b border-border bg-muted/30 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
        <span>Omschrijving</span>
        <span>Loonheffingskorting</span>
        <span>Alleenst.-ouderenkorting</span>
        <span>Status</span>
        <span>Door</span>
        {!wizardOpen && (
          <div className="flex flex-nowrap items-center justify-end gap-2">
            {showArchive && <Badge className="shrink-0 bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">Archief</Badge>}
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
                  <Plus className="w-3 h-3 mr-1" /> Nieuw formulier
                </Button>
              </>
            )}
          </div>
        )}
        {wizardOpen && (
          <div className="flex justify-end">
            {showArchive && <Badge className="shrink-0 bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">Archief</Badge>}
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
              <PayrollDocumentRow key={doc.id} doc={doc} archived
                onPreview={setPreviewDoc}
                onOpenWizardStep2={draft => openWizard(false, draft)}
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
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nog geen loonheffingsformulieren geregistreerd.</p>
      ) : (
        <div className="divide-y divide-border">
          {sortedActive.map(doc => (
            <PayrollDocumentRow key={doc.id} doc={doc}
              onPreview={setPreviewDoc}
              onOpenWizardStep2={draft => openWizard(false, draft)}
              onArchive={archiveMutation.mutate}
              onDelete={setDeleteDoc}
              auditActors={auditActors}
            />
          ))}
        </div>
      )}

      <PayrollDocumentPreviewDialog
        document={previewDoc} open={Boolean(previewDoc)}
        onOpenChange={open => { if (!open) setPreviewDoc(null); }}
      />
      <PayrollDeleteConfirmDialog
        document={deleteDoc} open={Boolean(deleteDoc)}
        onOpenChange={open => { if (!open) setDeleteDoc(null); }}
        onConfirm={doc => deleteMutation.mutate(doc)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}