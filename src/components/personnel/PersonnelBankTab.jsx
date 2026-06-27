import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import DocumentPreviewPanel from "@/components/personnel/DocumentPreviewPanel";
import { ImageCropDialog, DocumentSideUpload, DocumentPhotoViewer } from "@/components/personnel/IdentityDocumentWizard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, Archive, ArrowLeft, Check, ChevronLeft, ChevronRight,
  ImageIcon, Loader2, Plus, RefreshCw, Trash2, X,
} from "lucide-react";
import { buildAuditMetadata, getAuditActorLabel } from "@/lib/auditTrail";
import { prepareBankAccountSensitiveData } from "@/lib/sensitiveFields";
import { uploadManagedFile } from "@/lib/managedFiles";
import { recognizeBankCard } from "@/lib/bankOcr";

const BANK_CARD_SOURCE_IMAGE = "https://media.base44.com/images/public/698e307ed3aa4cab3729bbf1/18c07282b_ING016-07-Betaalpas_nfc_voorbeeld_300dpi_tcm14-136604.jpg";

const DELETE_PASSWORD = "verwijder";
const BANK_TABLE_GRID = "grid grid-cols-[minmax(140px,180px)_minmax(120px,160px)_minmax(100px,140px)_minmax(130px,160px)_minmax(110px,130px)_minmax(110px,1fr)_minmax(240px,max-content)] gap-3";

function formatDate(v, fallback = "-") {
  if (!v) return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function isArchivedBankAccount(acc) {
  return acc?.metadata?.archived === true;
}

function bankAccountFileUrl(acc) {
  return acc?.proof_file_url || "";
}

function hasBankAccountUpload(acc) {
  return Boolean(bankAccountFileUrl(acc));
}

function isImageFile(url) {
  return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url || "");
}

function isPdfUrl(url) {
  return /\.pdf$/i.test(url || "");
}

function isPdfBankAccount(acc) {
  return isPdfUrl(bankAccountFileUrl(acc));
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

function bankAccountSortValue(acc) {
  return [
    dateSortKey(acc?.valid_from),
    String(acc?.updated_date || acc?.created_date || ""),
    String(acc?.id || ""),
  ].join("|");
}

function isExpiredBankAccount(acc) {
  const today = new Date().toISOString().split("T")[0];
  return (acc?.valid_until && dateSortKey(acc.valid_until) < today) || acc?.verification_status === "expired";
}

function verificationStatusForActiveBankAccount(acc) {
  const today = new Date().toISOString().split("T")[0];
  return acc?.valid_until && dateSortKey(acc.valid_until) < today ? "expired" : "verified";
}

function splitBankAccountsByActiveState(accounts) {
  const active = [];
  const archived = [];
  for (const acc of accounts) {
    if (isArchivedBankAccount(acc)) {
      archived.push(acc);
    } else {
      active.push(acc);
    }
  }
  const sortedActive = [...active].sort((a, b) => bankAccountSortValue(b).localeCompare(bankAccountSortValue(a)));
  return {
    active: sortedActive,
    archived: [...archived].sort((a, b) => bankAccountSortValue(b).localeCompare(bankAccountSortValue(a))),
  };
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function BankStatusBadge({ acc, archived = false }) {
  if (archived || isArchivedBankAccount(acc)) {
    return <Badge className="text-xs bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 border-0 whitespace-nowrap">Gearchiveerd</Badge>;
  }
  if (isExpiredBankAccount(acc)) {
    return <Badge className="text-xs bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 border-0 whitespace-nowrap">Actie vereist</Badge>;
  }
  if (acc?.verification_status === "verified") {
    return <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200 border-0 whitespace-nowrap">Actief</Badge>;
  }
  if (acc?.verification_status === "pending_review") {
    return <Badge className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-0 whitespace-nowrap">In beoordeling</Badge>;
  }
  if (acc?.verification_status === "rejected") {
    return <Badge className="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-0 whitespace-nowrap">Afgekeurd</Badge>;
  }
  return <Badge className="text-xs bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-0 whitespace-nowrap">Onbekend</Badge>;
}

// ─── Bank Account Row ────────────────────────────────────────────────────────

function BankAccountRow({
  acc, archived = false,
  onPreview, onArchive, onRestore, onDelete,
  auditActors = [], restorePending = false,
}) {
  const canPreview = hasBankAccountUpload(acc);
  const canArchive = !archived;
  const canRestore = archived;
  const canDelete = archived;
  const ibanDisplay = acc?.iban_masked || acc?.iban || "-";
  const validity = [formatDate(acc?.valid_from), formatDate(acc?.valid_until)].filter(v => v !== "-").join(" — ");

  return (
    <div
      className={`${BANK_TABLE_GRID} relative items-center px-5 py-3 transition-colors ${canPreview ? "cursor-pointer hover:bg-accent/35" : ""}`}
      onClick={() => canPreview && onPreview?.(acc)}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{ibanDisplay}</p>
        {acc?.is_primary && !archived && <span className="text-xs text-primary">Primair</span>}
      </div>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{acc?.account_holder_name || "-"}</span>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{acc?.bank_name || "-"}</span>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{validity || "-"}</span>
      <div className="min-w-0"><BankStatusBadge acc={acc} archived={archived} /></div>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{getAuditActorLabel(acc, auditActors)}</span>
      <div className="flex justify-end gap-1">
        {canArchive && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={e => { e.stopPropagation(); onArchive?.(acc); }} title="Naar archief">
            <Archive className="h-3.5 w-3.5" />
          </Button>
        )}
        {canRestore && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={e => { e.stopPropagation(); onRestore?.(acc); }} disabled={restorePending} title="Terugzetten naar actief">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
        {canDelete && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={e => { e.stopPropagation(); onDelete?.(acc); }} title="Definitief verwijderen">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Preview Dialog ──────────────────────────────────────────────────────────

function BankAccountPreviewDialog({ account, open, onOpenChange }) {
  const fileUrl = bankAccountFileUrl(account);
  const fileName = account?.proof_download_filename || "Bankbewijs";
  const isPdf = isPdfBankAccount(account);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader><DialogTitle>Bankbewijs</DialogTitle></DialogHeader>
        {!fileUrl ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Voor deze rekening is nog geen bankbewijs beschikbaar.
          </p>
        ) : (
          <div className="h-[72vh] min-h-[420px]">
            <DocumentPreviewPanel url={fileUrl} isPdf={isPdf} fileName={fileName} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Confirm Dialog ───────────────────────────────────────────────────

function BankDeleteConfirmDialog({ account, open, onOpenChange, onConfirm, isPending }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (!open) { setPassword(""); setError(""); } }, [open]);
  const handleConfirm = () => {
    if (password !== DELETE_PASSWORD) { setError(`Typ "${DELETE_PASSWORD}" om te bevestigen`); return; }
    onConfirm?.(account);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Rekening definitief verwijderen?</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Bankrekening {account?.iban_masked || account?.iban} wordt verwijderd.</p>
              <p className="mt-1 text-xs text-muted-foreground">Deze actie is alleen bedoeld voor verkeerd toegevoegde rekeningen.</p>
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

// ─── Wizard Steps ────────────────────────────────────────────────────────────

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
          {i < labels.length - 1 && <div className={`h-px flex-1 ${i + 1 < step ? "bg-green-200 dark:bg-green-900" : "bg-border"}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Wizard ──────────────────────────────────────────────────────────────────

function BankCardGuideImage({ side = "front" }) {
  const isBack = side === "back";
  // Source image has three sections side by side: front (left), back (center), contactless (right).
  // CSS background cropping shows only the relevant third.
  return (
    <div
      className="h-36 w-[260px] rounded border border-border bg-white shadow-sm"
      style={{
        backgroundImage: `url(${BANK_CARD_SOURCE_IMAGE})`,
        backgroundSize: "300% auto",
        backgroundPosition: isBack ? "50% center" : "0% center",
        backgroundRepeat: "no-repeat",
      }}
      role="img"
      aria-label={isBack ? "Voorbeeld achterkant bankpas" : "Voorbeeld voorkant bankpas"}
    />
  );
}

function BankUploadGuideCard({ frontUpload, backUpload }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 w-full">
      <div className="flex items-stretch gap-4">
        <div className="w-1/2 flex flex-col gap-1.5">
          {frontUpload}
        </div>
        <div className="w-px bg-border self-stretch" />
        <div className="w-1/2 flex flex-col">
          <div className="flex flex-1 items-center justify-center p-2 min-h-[120px]">
            <BankCardGuideImage side="front" />
          </div>
          <div className="px-2 py-1.5">
            <p className="text-[11px] leading-snug text-muted-foreground">
              Voorzijde met chip.
            </p>
          </div>
        </div>
      </div>

      <div className="h-px bg-border" />

      <div className="flex items-stretch gap-4">
        <div className="w-1/2 flex flex-col gap-1.5">
          {backUpload}
        </div>
        <div className="w-px bg-border self-stretch" />
        <div className="w-1/2 flex flex-col">
          <div className="flex flex-1 items-center justify-center p-2 min-h-[120px]">
            <BankCardGuideImage side="back" />
          </div>
          <div className="px-2 py-1.5">
            <p className="text-[11px] leading-snug text-muted-foreground">
              Achterzijde van de pas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BankAccountWizard({ personnelId, person, isArchiveEntry = false, onClose, onSaved, currentUser, auditActors = [] }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [iban, setIban] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [bankName, setBankName] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [frontFile, setFrontFile] = useState(null);
  const [frontPreview, setFrontPreview] = useState(null);
  const [backFile, setBackFile] = useState(null);
  const [backPreview, setBackPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [recognizedUploadKey, setRecognizedUploadKey] = useState("");
  const [scanNotice, setScanNotice] = useState(null);
  const [errors, setErrors] = useState({});
  const latestUploadKeyRef = useRef("");

  const formatIban = (value) => {
    const cleaned = value.replace(/\s/g, "").toUpperCase();
    const chunks = cleaned.match(/.{1,4}/g) || [];
    return chunks.join(" ");
  };

  const uploadKey = [
    frontFile ? `${frontFile.name}-${frontFile.size}-${frontFile.lastModified}` : "",
    backFile ? `${backFile.name}-${backFile.size}-${backFile.lastModified}` : "",
  ].join("|");

  useEffect(() => {
    latestUploadKeyRef.current = uploadKey;
  }, [uploadKey]);

  const applyRecognizedFields = useCallback((result) => {
    if (result.iban && !iban) setIban(formatIban(result.iban));
    if (result.account_holder_name && !accountHolderName) setAccountHolderName(result.account_holder_name);
    if (result.bank_name && !bankName) setBankName(result.bank_name);
  }, [iban, accountHolderName, bankName]);

  const runRecognition = useCallback(async () => {
    if ((!frontFile && !backFile) || recognizing) return;
    if (recognizedUploadKey === uploadKey) return;

    const currentUploadKey = uploadKey;
    setRecognizing(true);
    setScanNotice(null);
    try {
      const result = await recognizeBankCard({ frontFile, backFile });
      if (latestUploadKeyRef.current !== currentUploadKey) return;
      applyRecognizedFields(result);
      setRecognizedUploadKey(currentUploadKey);
      const detected = result.detected_fields || [];
      if (detected.length > 0) {
        setScanNotice({ type: "success", text: `Bankpas gescand — ${detected.map(f => ({ iban: "IBAN", account_holder_name: "rekeninghouder", bank_name: "bank" }[f])).join(", ")} herkend.` });
      } else {
        setScanNotice({ type: "info", text: "Geen gegevens automatisch herkend. Vul de velden handmatig in." });
      }
    } catch (error) {
      console.error("Bank card OCR failed", error);
      if (latestUploadKeyRef.current === currentUploadKey) {
        setScanNotice({ type: "info", text: "De scan kon niet volledig worden afgerond. Vul de velden handmatig in." });
        setRecognizedUploadKey(currentUploadKey);
      }
    } finally {
      setRecognizing(false);
    }
  }, [applyRecognizedFields, backFile, frontFile, recognizedUploadKey, recognizing, uploadKey]);

  useEffect(() => {
    if (step !== 1 || (!frontFile && !backFile) || recognizing || recognizedUploadKey === uploadKey) return;
    runRecognition();
  }, [frontFile, backFile, recognizedUploadKey, recognizing, runRecognition, step, uploadKey]);

  const validate = () => {
    const e = {};
    const cleanIban = iban.replace(/\s/g, "");
    const ibanPattern = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;
    if (!cleanIban) e.iban = "Verplicht";
    else if (cleanIban.length < 15) e.iban = "IBAN te kort";
    else if (!ibanPattern.test(cleanIban)) e.iban = "Ongeldig IBAN formaat";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let proofFileUrl = null;
      let proofFileId = null;
      let proofDownloadFilename = null;
      let proofLogicalPath = null;

      if (frontFile || backFile) {
        setUploading(true);
        const cleanIban = iban.replace(/\s/g, "");
        const ibanMasked = cleanIban.slice(0, 4) + "****" + cleanIban.slice(-4);
        const fileToUpload = frontFile || backFile;
        const uploaded = await uploadManagedFile({
          file: fileToUpload,
          ownerType: "personnel",
          ownerId: personnelId,
          companyId: person?.primary_company_id || null,
          ownerLabel: person?.name || "Medewerker",
          domain: "hr",
          category: "bank_account_proof",
          sourceEntity: "PersonnelBankAccount",
          sourceField: "proof_file_url",
          documentLabel: "Bankbewijs",
          documentNumber: ibanMasked,
          isSensitive: true,
          uploadedBy: currentUser,
          auditActors,
          auditAction: "toegevoegd",
          folderSegments: ["bank", ibanMasked],
        });
        proofFileUrl = uploaded.file_url;
        proofFileId = uploaded.managed_file_id;
        proofDownloadFilename = uploaded.download_filename;
        proofLogicalPath = uploaded.logical_path;
        setUploading(false);
      }

      const sensitiveData = await prepareBankAccountSensitiveData(
        { iban: iban.replace(/\s/g, "") },
        { owner_type: "personnel", owner_id: personnelId, source_entity: "PersonnelBankAccount", source_field: "iban" }
      );

      if (!isArchiveEntry) {
        const existing = await base44.entities.PersonnelBankAccount.filter({ personnel_id: personnelId });
        const actionAt = new Date().toISOString();
        for (const acc of existing) {
          if (!acc.metadata?.archived) {
            await base44.entities.PersonnelBankAccount.update(acc.id, {
              is_primary: false,
              metadata: buildAuditMetadata(currentUser, "gearchiveerd", {
                ...(acc.metadata || {}),
                archived: true,
                archived_at: actionAt,
              }, auditActors),
            });
          }
        }
      }

      const metaPayload = {
        archived: isArchiveEntry,
        proof_file_url: proofFileUrl,
      };

      await base44.entities.PersonnelBankAccount.create({
        personnel_id: personnelId,
        iban: sensitiveData.iban,
        iban_masked: sensitiveData.iban_masked,
        iban_encrypted_payload: sensitiveData.iban_encrypted_payload,
        sensitive_payload_version: sensitiveData.sensitive_payload_version,
        account_holder_name: accountHolderName || null,
        bank_name: bankName || null,
        valid_from: validFrom || null,
        valid_until: validUntil || null,
        proof_file_url: proofFileUrl,
        proof_file_id: proofFileId,
        proof_download_filename: proofDownloadFilename,
        proof_logical_path: proofLogicalPath,
        is_primary: !isArchiveEntry,
        verification_status: isArchiveEntry ? "expired" : "verified",
        notes: notes || null,
        metadata: buildAuditMetadata(currentUser, isArchiveEntry ? "gearchiveerd" : "toegevoegd", metaPayload, auditActors),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personnel-bank-accounts"] });
      onSaved?.();
      onClose();
    },
  });

  const wizardTitle = isArchiveEntry ? "Bankrekening archiveren" : "Bankrekening toevoegen";
  const STEP_LABELS = ["Upload", "Controleren"];
  const scanPending = (Boolean(frontFile) || Boolean(backFile)) && recognizedUploadKey !== uploadKey && recognizing;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="scroll-mt-4 border-b border-primary/30 bg-muted/20 p-5"
    >
      <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">{wizardTitle}</p>
      <WizardSteps step={step} labels={STEP_LABELS} />
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: "easeOut" }}>

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-0.5">Bankpas uploaden</p>
                <p className="text-xs text-muted-foreground">
                  Upload een foto van de voor- en achterkant van de bankpas. Na het uploaden worden de gegevens automatisch gescand. Uploaden is niet verplicht — je kunt ook handmatig invullen.
                </p>
              </div>

              <BankUploadGuideCard
                frontUpload={
                  <DocumentSideUpload
                    label="Voorkant"
                    hint="Upload hier de voorzijde met chip."
                    previewUrl={frontPreview}
                    onFileSelected={(file, preview) => { setFrontFile(file); setFrontPreview(preview); }}
                  />
                }
                backUpload={
                  <DocumentSideUpload
                    label="Achterkant"
                    hint="Upload hier de achterzijde."
                    previewUrl={backPreview}
                    onFileSelected={(file, preview) => { setBackFile(file); setBackPreview(preview); }}
                  />
                }
              />

              {scanPending && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  Bankpas scannen...
                </div>
              )}

              <div className="flex justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep(2)}>Overslaan</Button>
                  <Button size="sm" onClick={() => setStep(2)} disabled={scanPending || (!frontFile && !backFile)}>
                    Volgende <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && scanPending && (
            <div className="space-y-4">
              <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-12 text-center">
                <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium text-foreground">Scan verwerken</p>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                  De bankpas wordt gelezen. Zodra dit klaar is, opent de controle automatisch.
                </p>
              </div>
              <div className="flex justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                <Button variant="outline" size="sm" onClick={onClose}>Annuleren</Button>
              </div>
            </div>
          )}

          {step === 2 && !scanPending && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Controleer en vul aan</p>
                <p className="text-xs text-muted-foreground">
                  Vergelijk de velden met de upload. Scroll met het muiswiel om in te zoomen, sleep om te verslepen.
                </p>
              </div>

              {scanNotice && (
                <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                  scanNotice.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200"
                    : "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-200"
                }`}>
                  <span>{scanNotice.text}</span>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                  <div className="space-y-1">
                    <Label>IBAN *</Label>
                    <Input value={iban} onChange={e => { const formatted = formatIban(e.target.value); setIban(formatted); setErrors(er => ({ ...er, iban: undefined })); }} placeholder="NL91 ABNA 0417 1643 00" className={errors.iban ? "border-destructive" : ""} />
                    {errors.iban && <p className="text-xs text-destructive">{errors.iban}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label>Rekeninghouder</Label>
                    <Input value={accountHolderName} onChange={e => setAccountHolderName(e.target.value)} placeholder="Naam van de rekeninghouder" />
                  </div>
                  <div className="space-y-1">
                    <Label>Bank</Label>
                    <Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Naam van de bank" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Geldig vanaf</Label>
                      <Input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Geldig tot</Label>
                      <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Notities <span className="font-normal text-muted-foreground">(optioneel)</span></Label>
                    <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Bijv. Hoofdrekening of spaarrekening" />
                  </div>
                  <div className="pt-1">
                    <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="h-7 px-2 text-xs text-muted-foreground">
                      Wijzig upload
                    </Button>
                  </div>
                </div>

                {(frontPreview || backPreview) && (
                  <DocumentPhotoViewer
                    images={[
                      ...(frontPreview ? [{ src: frontPreview, label: "Voorkant" }] : []),
                      ...(backPreview ? [{ src: backPreview, label: "Achterkant" }] : []),
                    ]}
                  />
                )}
              </div>

              <div className="flex justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => { setStep(1); setErrors({}); }}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={onClose}>Annuleren</Button>
                  <Button size="sm" onClick={() => { if (validate()) saveMutation.mutate(); }} disabled={saveMutation.isPending || uploading}>
                    <Check className="w-4 h-4 mr-1" />
                    {saveMutation.isPending ? "Opslaan..." : "Rekening opslaan"}
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

// ─── Main Tab ────────────────────────────────────────────────────────────────

export default function PersonnelBankTab({ person, bankAccounts, auditActors = [] }) {
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardArchiveMode, setWizardArchiveMode] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [previewAcc, setPreviewAcc] = useState(null);
  const [deleteAcc, setDeleteAcc] = useState(null);
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

  const bankSplit = useMemo(() => splitBankAccountsByActiveState(bankAccounts), [bankAccounts]);
  const sortedActive = bankSplit.active;
  const sortedArchived = bankSplit.archived;

  const archiveMutation = useMutation({
    mutationFn: acc => base44.entities.PersonnelBankAccount.update(acc.id, {
      is_primary: false,
      metadata: buildAuditMetadata(currentUser, "gearchiveerd", {
        ...(acc.metadata || {}),
        archived: true,
        archived_at: new Date().toISOString(),
      }, auditActors),
    }),
    onSuccess: () => {
      setArchiveMessage({ type: "success", text: "Bankrekening is naar het archief gezet." });
      queryClient.invalidateQueries({ queryKey: ["personnel-bank-accounts"] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async acc => {
      const existing = await base44.entities.PersonnelBankAccount.filter({ personnel_id: person.id });
      const now = new Date().toISOString();
      for (const existingAcc of existing) {
        if (existingAcc.id !== acc.id && !existingAcc.metadata?.archived) {
          await base44.entities.PersonnelBankAccount.update(existingAcc.id, {
            is_primary: false,
            metadata: buildAuditMetadata(currentUser, "gearchiveerd", {
              ...(existingAcc.metadata || {}),
              archived: true,
              archived_at: now,
              archived_reason: "Vervangen door teruggezet archiefdocument",
            }, auditActors),
          });
        }
      }
      await base44.entities.PersonnelBankAccount.update(acc.id, {
        is_primary: true,
        verification_status: verificationStatusForActiveBankAccount(acc),
        metadata: buildAuditMetadata(currentUser, "teruggezet", {
          ...(acc.metadata || {}),
          archived: false,
          archived_at: null,
          restored_from_archive_at: now,
        }, auditActors),
      });
    },
    onSuccess: () => {
      setArchiveMessage({ type: "success", text: "Bankrekening is teruggezet naar actief." });
      queryClient.invalidateQueries({ queryKey: ["personnel-bank-accounts"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: acc => base44.entities.PersonnelBankAccount.delete(acc.id),
    onSuccess: () => { setDeleteAcc(null); queryClient.invalidateQueries({ queryKey: ["personnel-bank-accounts"] }); },
  });

  const openWizard = (archiveMode = false) => {
    setWizardArchiveMode(archiveMode);
    setWizardOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      <AnimatePresence>
        {wizardOpen && (
          <BankAccountWizard
            personnelId={person.id}
            person={person}
            isArchiveEntry={wizardArchiveMode}
            onClose={() => setWizardOpen(false)}
            onSaved={() => setWizardOpen(false)}
            currentUser={currentUser}
            auditActors={auditActors}
          />
        )}
      </AnimatePresence>

      <div className={`${BANK_TABLE_GRID} items-center border-b border-border bg-muted/30 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
        <span>IBAN</span>
        <span>Rekeninghouder</span>
        <span>Bank</span>
        <span>Geldig</span>
        <span>Status</span>
        <span>Door</span>
        {!wizardOpen && (
          <div className="flex flex-nowrap items-center justify-end gap-2">
            {showArchive && <Badge className="shrink-0 bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">Archief</Badge>}
            {showArchive ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowArchive(false)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                  <ArrowLeft className="w-3 h-3 mr-1" /> Actieve rekeningen
                </Button>
                <Button size="sm" variant="outline" onClick={() => openWizard(true)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                  <Plus className="w-3 h-3 mr-1" /> Voeg oude rekening in archief
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowArchive(true)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                  <Archive className="w-3 h-3 mr-1" /> Archief {sortedArchived.length > 0 ? `(${sortedArchived.length})` : ""}
                </Button>
                <Button size="sm" variant="outline" onClick={() => openWizard(false)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                  <Plus className="w-3 h-3 mr-1" /> Nieuwe rekening
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

      {showArchive ? (
        sortedArchived.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Geen rekeningen in het archief.</p>
        ) : (
          <div className="divide-y divide-border">
            {sortedArchived.map(acc => (
              <BankAccountRow key={acc.id} acc={acc} archived
                onPreview={setPreviewAcc}
                onArchive={archiveMutation.mutate}
                onRestore={restoreMutation.mutate}
                onDelete={setDeleteAcc}
                auditActors={auditActors}
                restorePending={restoreMutation.isPending}
              />
            ))}
          </div>
        )
      ) : sortedActive.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nog geen bankrekening geregistreerd.</p>
      ) : (
        <div className="divide-y divide-border">
          {sortedActive.map(acc => (
            <BankAccountRow key={acc.id} acc={acc}
              onPreview={setPreviewAcc}
              onArchive={archiveMutation.mutate}
              onDelete={setDeleteAcc}
              auditActors={auditActors}
            />
          ))}
        </div>
      )}

      <BankAccountPreviewDialog
        account={previewAcc} open={Boolean(previewAcc)}
        onOpenChange={open => { if (!open) setPreviewAcc(null); }}
      />
      <BankDeleteConfirmDialog
        account={deleteAcc} open={Boolean(deleteAcc)}
        onOpenChange={open => { if (!open) setDeleteAcc(null); }}
        onConfirm={acc => deleteMutation.mutate(acc)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}