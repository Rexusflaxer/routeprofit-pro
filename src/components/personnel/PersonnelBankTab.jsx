import React, { useState, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import DocumentPreviewPanel from "@/components/personnel/DocumentPreviewPanel";
import { DocumentSideUpload, DocumentPhotoViewer } from "@/components/personnel/IdentityDocumentWizard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import { buildAuditMetadata, getAuditActorLabel } from "@/lib/auditTrail";
import { prepareBankAccountSensitiveData } from "@/lib/sensitiveFields";
import { uploadManagedFile } from "@/lib/managedFiles";
import { detectBankNameFromIban, recognizeBankCard } from "@/lib/bankOcr";
import bankCardGuideBack from "@/assets/bank-guides/abn-amro-bank-card-back.png";
import bankCardGuideFront from "@/assets/bank-guides/abn-amro-bank-card-front.png";

const BANK_CARD_GUIDE_IMAGES = {
  front: bankCardGuideFront,
  back: bankCardGuideBack,
};

const BANK_TABLE_GRID = "grid grid-cols-[minmax(240px,1.35fr)_minmax(130px,0.75fr)_minmax(130px,0.7fr)_minmax(130px,0.8fr)_minmax(84px,max-content)] gap-4";

function isArchivedBankAccount(acc) {
  return acc?.metadata?.archived === true;
}

function cleanIban(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9*]/g, "");
}

function formatIbanInput(value) {
  const cleaned = cleanIban(value).slice(0, 34);
  return (cleaned.match(/.{1,4}/g) || []).join(" ");
}

function isMaskedIban(value) {
  return cleanIban(value).includes("*");
}

function isImageFile(url) {
  return /\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i.test(url || "");
}

function isPdfUrl(url) {
  return /\.pdf($|\?)/i.test(url || "");
}

function bankAccountProofImages(acc) {
  if (!acc) return [];
  const meta = acc.metadata || {};
  const frontUrl = acc.proof_front_file_url || meta.proof_front_file_url || "";
  const backUrl = acc.proof_back_file_url || meta.proof_back_file_url || "";
  const legacyUrl = acc.proof_file_url || meta.proof_file_url || "";
  const images = [];

  if (frontUrl && isImageFile(frontUrl)) {
    images.push({
      src: frontUrl,
      label: "Voorkant bankpas",
      fileName: acc.proof_front_download_filename || "Voorkant bankpas",
    });
  }
  if (backUrl && backUrl !== frontUrl && isImageFile(backUrl)) {
    images.push({
      src: backUrl,
      label: "Achterkant bankpas",
      fileName: acc.proof_back_download_filename || "Achterkant bankpas",
    });
  }
  if (!images.length && legacyUrl && isImageFile(legacyUrl)) {
    images.push({
      src: legacyUrl,
      label: "Bankbewijs",
      fileName: acc.proof_download_filename || "Bankbewijs",
    });
  }

  return images;
}

function bankAccountFileUrl(acc) {
  const image = bankAccountProofImages(acc)[0];
  return image?.src || acc?.proof_file_url || acc?.metadata?.proof_file_url || "";
}

function hasBankAccountUpload(acc) {
  return Boolean(bankAccountFileUrl(acc));
}

function isPdfBankAccount(acc) {
  const url = bankAccountFileUrl(acc);
  return !bankAccountProofImages(acc).length && isPdfUrl(url);
}

function isVerifiedBankAccount(acc) {
  return acc?.verification_status === "verified";
}

function activeBankAccounts(accounts) {
  return [...(accounts || [])]
    .filter(acc => !isArchivedBankAccount(acc))
    .sort((a, b) => String(b.updated_date || b.created_date || b.id || "").localeCompare(String(a.updated_date || a.created_date || a.id || "")));
}

function normalizeMatchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/IJ/g, "Y")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function matchTokens(value) {
  return normalizeMatchText(value)
    .split(/\s+/)
    .filter(token => token.length > 1);
}

function countTokenMatches(expected, recognized) {
  const expectedTokens = matchTokens(expected);
  const recognizedTokens = matchTokens(recognized);
  if (!expectedTokens.length || !recognizedTokens.length) return 0;

  return expectedTokens.filter(expectedToken => (
    recognizedTokens.some(recognizedToken => (
      recognizedToken === expectedToken
      || recognizedToken.includes(expectedToken)
      || expectedToken.includes(recognizedToken)
    ))
  )).length;
}

function profileNameForMatch(person) {
  return [
    person?.legal_first_names || person?.first_name || person?.call_name,
    person?.name_prefix,
    person?.last_name,
  ].filter(Boolean).join(" ") || person?.name || "";
}

function profileLastNameForMatch(person) {
  return [person?.name_prefix, person?.last_name].filter(Boolean).join(" ") || "";
}

function buildBankHolderMatch(person, recognizedHolder) {
  const holder = String(recognizedHolder || "").trim();
  const profileName = profileNameForMatch(person);
  const profileLastName = profileLastNameForMatch(person);

  if (!holder || !matchTokens(profileName).length) {
    return {
      status: "unknown",
      profile_name: profileName,
      recognized_holder: holder,
      issues: [],
    };
  }

  const lastNameTokens = matchTokens(profileLastName);
  const lastNameMatches = lastNameTokens.length ? countTokenMatches(profileLastName, holder) > 0 : false;
  const fullNameMatchCount = countTokenMatches(profileName, holder);
  const hasConfidentMatch = lastNameMatches || fullNameMatchCount >= 2 || (!lastNameTokens.length && fullNameMatchCount >= 1);

  if (hasConfidentMatch) {
    return {
      status: "matched",
      profile_name: profileName,
      recognized_holder: holder,
      issues: [],
    };
  }

  return {
    status: "review",
    profile_name: profileName,
    recognized_holder: holder,
    issues: [
      "De rekeninghouder op de bankpas lijkt niet overeen te komen met dit medewerkersprofiel.",
    ],
  };
}

function BankStatusBadge({ acc }) {
  if (isVerifiedBankAccount(acc)) {
    return <Badge className="whitespace-nowrap border-0 bg-green-100 text-xs text-green-800 dark:bg-green-900/45 dark:text-green-200">Geverifieerd</Badge>;
  }
  return <Badge className="whitespace-nowrap border-0 bg-amber-100 text-xs text-amber-900 dark:bg-amber-900/45 dark:text-amber-200">Niet geverifieerd</Badge>;
}

function BankAccountRow({ acc, onPreview, onOpenActions, auditActors = [] }) {
  const isVerified = isVerifiedBankAccount(acc);
  const canPreview = hasBankAccountUpload(acc);
  const rowClickable = isVerified ? canPreview : true;
  const ibanDisplay = acc?.iban_masked || acc?.iban || "-";

  const handleRowClick = () => {
    if (isVerified && canPreview) {
      onPreview?.(acc);
      return;
    }
    if (!isVerified) {
      onOpenActions?.(acc);
    }
  };

  return (
    <div
      className={`${BANK_TABLE_GRID} items-center px-5 py-4 transition-colors ${rowClickable ? "cursor-pointer hover:bg-accent/35" : ""}`}
      onClick={handleRowClick}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{ibanDisplay}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Primair</p>
      </div>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{acc?.bank_name || "-"}</span>
      <div className="min-w-0"><BankStatusBadge acc={acc} /></div>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{getAuditActorLabel(acc, auditActors)}</span>
      <div className="flex justify-end gap-1">
        {canPreview && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={event => {
              event.stopPropagation();
              onPreview?.(acc);
            }}
            title="Document inzien"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )}
        {!isVerified && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={event => {
              event.stopPropagation();
              onOpenActions?.(acc);
            }}
            title="Bankpas verifiëren"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function BankAccountPreviewDialog({ account, open, onOpenChange }) {
  const images = bankAccountProofImages(account);
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
        ) : images.length ? (
          <div className="min-h-[420px]">
            <DocumentPhotoViewer images={images} />
          </div>
        ) : (
          <div className="h-[72vh] min-h-[420px]">
            <DocumentPreviewPanel url={fileUrl} isPdf={isPdf} fileName={fileName} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BankAccountActionsDialog({ account, open, onOpenChange, onPreview, onVerify }) {
  const canPreview = hasBankAccountUpload(account);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Bankrekening controleren</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Deze bankrekening is nog niet met een upload geverifieerd.
          </p>
          <div className="flex flex-col gap-2">
            {canPreview && (
              <Button
                type="button"
                variant="outline"
                className="justify-start"
                onClick={() => {
                  onOpenChange(false);
                  onPreview(account);
                }}
              >
                <Eye className="mr-2 h-4 w-4" />
                Document inzien
              </Button>
            )}
            <Button
              type="button"
              className="justify-start"
              onClick={() => {
                onOpenChange(false);
                onVerify(account);
              }}
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              Bankpas verifiëren
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BankReplaceConfirmDialog({ open, onOpenChange, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Bankrekening vervangen?</DialogTitle></DialogHeader>
        <div className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Er staat al een bankrekening actief.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Als je doorgaat en opslaat, wordt de huidige bankrekening vervangen. Voor bankrekeningen wordt geen archief bewaard.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={onConfirm}>Vervangen en doorgaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WizardSteps({ step, labels }) {
  return (
    <div className="mb-4 flex items-center gap-1">
      {labels.map((label, index) => (
        <React.Fragment key={label}>
          <div className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
            index + 1 === step
              ? "bg-primary text-primary-foreground"
              : index + 1 < step
                ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                : "text-muted-foreground"
          }`}>
            <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
              index + 1 === step
                ? "bg-primary-foreground text-primary"
                : index + 1 < step
                  ? "text-green-700 dark:text-green-300"
                  : "border border-muted-foreground/30 text-muted-foreground"
            }`}>
              {index + 1 < step ? (
                <Check className="h-3 w-3" />
              ) : index + 1}
            </span>
            {label}
          </div>
          {index < labels.length - 1 && (
            <div className={`h-px flex-1 ${index + 1 < step ? "bg-green-200 dark:bg-green-900" : "bg-border"}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function BankCardGuideImage({ side = "front" }) {
  const isBack = side === "back";
  return (
    <img
      src={isBack ? BANK_CARD_GUIDE_IMAGES.back : BANK_CARD_GUIDE_IMAGES.front}
      alt={isBack ? "Voorbeeld achterkant bankpas" : "Voorbeeld voorkant bankpas"}
      className="h-32 max-w-full object-contain drop-shadow-sm"
      role="img"
    />
  );
}

function BankUploadGuideCard({ frontUpload, backUpload }) {
  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-stretch gap-4">
        <div className="flex w-1/2 flex-col gap-1.5">{frontUpload}</div>
        <div className="w-px self-stretch bg-border" />
        <div className="flex w-1/2 flex-col">
          <div className="flex min-h-[120px] flex-1 items-center justify-center p-2">
            <BankCardGuideImage side="front" />
          </div>
          <div className="px-2 py-1.5">
            <p className="text-[11px] leading-snug text-muted-foreground">Voorzijde met chip.</p>
          </div>
        </div>
      </div>

      <div className="h-px bg-border" />

      <div className="flex items-stretch gap-4">
        <div className="flex w-1/2 flex-col gap-1.5">{backUpload}</div>
        <div className="w-px self-stretch bg-border" />
        <div className="flex w-1/2 flex-col">
          <div className="flex min-h-[120px] flex-1 items-center justify-center p-2">
            <BankCardGuideImage side="back" />
          </div>
          <div className="px-2 py-1.5">
            <p className="text-[11px] leading-snug text-muted-foreground">Achterzijde van de pas.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BankHolderMatchNotice({ match }) {
  if (!match || match.status !== "review") return null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="text-xs font-semibold">Controleer rekeninghouder</p>
          <p className="mt-0.5 text-xs opacity-85">
            De herkende naam op de bankpas lijkt niet bij dit medewerkersprofiel te horen.
          </p>
          <div className="mt-1 space-y-0.5 text-xs opacity-85">
            <p>Profiel: {match.profile_name || "Onbekend"}</p>
            <p>Bankpas: {match.recognized_holder || "Niet herkend"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BankAccountWizard({
  personnelId,
  person,
  existingAccount = null,
  replaceAccounts = [],
  onClose,
  onSaved,
  currentUser,
  auditActors = [],
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [iban, setIban] = useState(() => {
    const value = existingAccount?.iban_masked || existingAccount?.iban || "";
    return isMaskedIban(value) ? "" : formatIbanInput(value);
  });
  const [bankName, setBankName] = useState(existingAccount?.bank_name || "");
  const [frontFile, setFrontFile] = useState(null);
  const [frontPreview, setFrontPreview] = useState(null);
  const [backFile, setBackFile] = useState(null);
  const [backPreview, setBackPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [recognizedUploadKey, setRecognizedUploadKey] = useState("");
  const [recognizedHolderName, setRecognizedHolderName] = useState(existingAccount?.metadata?.recognized_account_holder_name || "");
  const [holderMatch, setHolderMatch] = useState(existingAccount?.metadata?.bank_holder_match || null);
  const [errors, setErrors] = useState({});
  const latestUploadKeyRef = useRef("");

  const uploadKey = [
    frontFile ? `${frontFile.name}-${frontFile.size}-${frontFile.lastModified}` : "",
    backFile ? `${backFile.name}-${backFile.size}-${backFile.lastModified}` : "",
  ].join("|");

  latestUploadKeyRef.current = uploadKey;

  const handleIbanChange = useCallback((value) => {
    const formatted = formatIbanInput(value);
    setIban(formatted);
    setErrors(current => ({ ...current, iban: undefined }));

    const detectedBank = detectBankNameFromIban(formatted);
    if (detectedBank) {
      setBankName(detectedBank);
    } else {
      const normalized = cleanIban(formatted);
      if (!normalized || (normalized.startsWith("NL") && normalized.length >= 8)) {
        setBankName("");
      }
    }
  }, []);

  const resetRecognition = useCallback(() => {
    setRecognizedUploadKey("");
    setRecognizedHolderName("");
    setHolderMatch(null);
  }, []);

  const applyRecognizedFields = useCallback((result) => {
    if (result.iban) {
      handleIbanChange(result.iban);
    }
    const holderName = result.account_holder_name || "";
    setRecognizedHolderName(holderName);
    setHolderMatch(buildBankHolderMatch(person, holderName));
  }, [handleIbanChange, person]);

  const runRecognition = useCallback(async () => {
    if ((!frontFile && !backFile) || recognizing || recognizedUploadKey === uploadKey) return;

    const currentUploadKey = uploadKey;
    setRecognizing(true);
    try {
      const result = await recognizeBankCard({ frontFile, backFile });
      if (latestUploadKeyRef.current !== currentUploadKey) return;
      applyRecognizedFields(result);
      setRecognizedUploadKey(currentUploadKey);
    } catch (error) {
      console.error("Bank card OCR failed", error);
      if (latestUploadKeyRef.current === currentUploadKey) {
        setRecognizedUploadKey(currentUploadKey);
      }
    } finally {
      setRecognizing(false);
    }
  }, [applyRecognizedFields, backFile, frontFile, recognizedUploadKey, recognizing, uploadKey]);

  const validate = () => {
    const nextErrors = {};
    const normalizedIban = cleanIban(iban);
    const ibanPattern = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;

    if (!normalizedIban) nextErrors.iban = "Verplicht";
    else if (isMaskedIban(normalizedIban)) nextErrors.iban = "Vul het volledige IBAN in";
    else if (normalizedIban.length < 15) nextErrors.iban = "IBAN te kort";
    else if (!ibanPattern.test(normalizedIban)) nextErrors.iban = "Ongeldig IBAN formaat";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const uploadProofFile = async (file, side, ibanMasked) => {
    if (!file) return null;
    const sideLabel = side === "front" ? "Voorkant bankpas" : "Achterkant bankpas";
    return uploadManagedFile({
      file,
      ownerType: "personnel",
      ownerId: personnelId,
      companyId: person?.primary_company_id || null,
      ownerLabel: person?.name || "Medewerker",
      domain: "hr",
      category: "bank_account_proof",
      sourceEntity: "PersonnelBankAccount",
      sourceField: side === "front" ? "proof_front_file_url" : "proof_back_file_url",
      documentLabel: sideLabel,
      documentNumber: ibanMasked,
      isSensitive: true,
      uploadedBy: currentUser,
      auditActors,
      auditAction: existingAccount ? "geverifieerd" : "toegevoegd",
      folderSegments: ["bank", ibanMasked, side],
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const normalizedIban = cleanIban(iban);
      const ibanMasked = `${normalizedIban.slice(0, 4)}****${normalizedIban.slice(-4)}`;
      const hasUpload = Boolean(frontFile || backFile);
      let frontUpload = null;
      let backUpload = null;

      if (hasUpload) {
        setUploading(true);
        try {
          frontUpload = await uploadProofFile(frontFile, "front", ibanMasked);
          backUpload = await uploadProofFile(backFile, "back", ibanMasked);
        } finally {
          setUploading(false);
        }
      }

      const sensitiveData = await prepareBankAccountSensitiveData(
        { iban: normalizedIban },
        { owner_type: "personnel", owner_id: personnelId, source_entity: "PersonnelBankAccount", source_field: "iban" }
      );

      let activeExistingToReplace = [];
      if (!existingAccount) {
        const existing = await base44.entities.PersonnelBankAccount.filter({ personnel_id: personnelId });
        activeExistingToReplace = existing.filter(acc => !isArchivedBankAccount(acc));
      }

      const frontProofUrl = frontUpload?.file_url || existingAccount?.proof_front_file_url || null;
      const backProofUrl = backUpload?.file_url || existingAccount?.proof_back_file_url || null;
      const primaryProof = frontUpload || backUpload || null;
      const proofFileUrl = primaryProof?.file_url || existingAccount?.proof_file_url || frontProofUrl || backProofUrl || null;

      const commonPayload = {
        personnel_id: personnelId,
        iban: sensitiveData.iban,
        iban_masked: sensitiveData.iban_masked,
        iban_encrypted_payload: sensitiveData.iban_encrypted_payload,
        sensitive_payload_version: sensitiveData.sensitive_payload_version,
        account_holder_name: null,
        bank_name: bankName || null,
        valid_from: null,
        valid_until: null,
        proof_file_url: proofFileUrl,
        proof_file_id: primaryProof?.managed_file_id || existingAccount?.proof_file_id || null,
        proof_download_filename: primaryProof?.download_filename || existingAccount?.proof_download_filename || null,
        proof_logical_path: primaryProof?.logical_path || existingAccount?.proof_logical_path || null,
        proof_front_file_url: frontProofUrl,
        proof_front_file_id: frontUpload?.managed_file_id || existingAccount?.proof_front_file_id || null,
        proof_front_download_filename: frontUpload?.download_filename || existingAccount?.proof_front_download_filename || null,
        proof_front_logical_path: frontUpload?.logical_path || existingAccount?.proof_front_logical_path || null,
        proof_back_file_url: backProofUrl,
        proof_back_file_id: backUpload?.managed_file_id || existingAccount?.proof_back_file_id || null,
        proof_back_download_filename: backUpload?.download_filename || existingAccount?.proof_back_download_filename || null,
        proof_back_logical_path: backUpload?.logical_path || existingAccount?.proof_back_logical_path || null,
        is_primary: true,
        verification_status: hasUpload ? "verified" : "pending_review",
      };

      const metaPayload = {
        ...(existingAccount?.metadata || {}),
        archived: false,
        proof_file_url: proofFileUrl,
        proof_front_file_url: frontProofUrl,
        proof_back_file_url: backProofUrl,
        verification_source: hasUpload ? "bank_card_upload" : "manual",
        recognized_account_holder_name: hasUpload ? recognizedHolderName || null : null,
        bank_holder_match: hasUpload ? holderMatch : null,
        replaced_bank_account_ids: existingAccount ? [] : replaceAccounts.map(acc => acc.id),
      };

      if (existingAccount) {
        await base44.entities.PersonnelBankAccount.update(existingAccount.id, {
          ...commonPayload,
          metadata: buildAuditMetadata(currentUser, hasUpload ? "geverifieerd" : "bijgewerkt", metaPayload, auditActors),
        });
        return;
      }

      await base44.entities.PersonnelBankAccount.create({
        ...commonPayload,
        metadata: buildAuditMetadata(currentUser, hasUpload ? "toegevoegd en geverifieerd" : "toegevoegd", metaPayload, auditActors),
      });

      for (const acc of activeExistingToReplace) {
        await base44.entities.PersonnelBankAccount.delete(acc.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personnel-bank-accounts"] });
      onSaved?.();
      onClose();
    },
  });

  const goToReview = async () => {
    setStep(2);
    if ((frontFile || backFile) && recognizedUploadKey !== uploadKey) {
      await runRecognition();
    }
  };

  const wizardTitle = existingAccount ? "Bankrekening verifiëren" : "Bankrekening toevoegen";
  const STEP_LABELS = ["Upload", "Controleren"];
  const scanPending = step === 2 && recognizing;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="scroll-mt-4 border-b border-primary/30 bg-muted/20 p-5"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">{wizardTitle}</p>
      <WizardSteps step={step} labels={STEP_LABELS} />
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: "easeOut" }}>
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <p className="mb-0.5 text-sm font-medium text-foreground">Bankpas uploaden</p>
                <p className="text-xs text-muted-foreground">
                  Upload een foto van de voor- en achterkant van de bankpas. Na het klikken op Volgende worden de gegevens automatisch gelezen. Uploaden is niet verplicht.
                </p>
              </div>

              <BankUploadGuideCard
                frontUpload={
                  <DocumentSideUpload
                    label="Voorkant"
                    hint="Upload hier de voorzijde met chip."
                    previewUrl={frontPreview}
                    onFileSelected={(file, preview) => {
                      setFrontFile(file);
                      setFrontPreview(preview);
                      resetRecognition();
                    }}
                  />
                }
                backUpload={
                  <DocumentSideUpload
                    label="Achterkant"
                    hint="Upload hier de achterzijde."
                    previewUrl={backPreview}
                    onFileSelected={(file, preview) => {
                      setBackFile(file);
                      setBackPreview(preview);
                      resetRecognition();
                    }}
                  />
                }
              />

              <div className="flex justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={onClose}><X className="mr-1 h-4 w-4" /> Annuleren</Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep(2)}>Overslaan</Button>
                  <Button size="sm" onClick={goToReview} disabled={!frontFile && !backFile}>
                    Volgende <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && scanPending && (
            <div className="space-y-4">
              <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-12 text-center">
                <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium text-foreground">IBAN lezen</p>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                  De upload wordt gecontroleerd op een IBAN. Zodra dit klaar is, opent de controle automatisch.
                </p>
              </div>
              <div className="flex justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}><ChevronLeft className="mr-1 h-4 w-4" /> Terug</Button>
                <Button variant="outline" size="sm" onClick={onClose}>Annuleren</Button>
              </div>
            </div>
          )}

          {step === 2 && !scanPending && (
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-sm font-medium text-foreground">Controleer en vul aan</p>
                <p className="text-xs text-muted-foreground">
                  Als er een IBAN is herkend, is deze alvast ingevuld. De banknaam wordt automatisch uit het IBAN afgeleid.
                </p>
              </div>

              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <Label>IBAN *</Label>
                      <Input
                        value={iban}
                        onChange={event => {
                          handleIbanChange(event.target.value);
                        }}
                        placeholder="NL91 ABNA 0417 1643 00"
                        className={errors.iban ? "border-destructive" : ""}
                      />
                      {errors.iban && <p className="text-xs text-destructive">{errors.iban}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label>Bank</Label>
                      <Input value={bankName} onChange={event => setBankName(event.target.value)} placeholder="Naam van de bank" />
                    </div>
                    <BankHolderMatchNotice match={holderMatch} />
                  </div>
                  <div className="pt-3">
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
                <Button variant="ghost" size="sm" onClick={() => { setStep(1); setErrors({}); }}><ChevronLeft className="mr-1 h-4 w-4" /> Terug</Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={onClose}>Annuleren</Button>
                  <Button size="sm" onClick={() => { if (validate()) saveMutation.mutate(); }} disabled={saveMutation.isPending || uploading}>
                    <Check className="mr-1 h-4 w-4" />
                    {saveMutation.isPending || uploading ? "Opslaan..." : "Rekening opslaan"}
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

export default function PersonnelBankTab({ person, bankAccounts, auditActors = [] }) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardAccount, setWizardAccount] = useState(null);
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [previewAcc, setPreviewAcc] = useState(null);
  const [actionAcc, setActionAcc] = useState(null);

  const { data: currentUser = null } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });

  const activeAccounts = useMemo(() => activeBankAccounts(bankAccounts), [bankAccounts]);
  const displayedAccounts = activeAccounts.slice(0, 1);

  const openNewWizard = () => {
    setWizardAccount(null);
    if (activeAccounts.length > 0) {
      setReplaceDialogOpen(true);
      return;
    }
    setWizardOpen(true);
  };

  const confirmReplace = () => {
    setReplaceDialogOpen(false);
    setWizardAccount(null);
    setWizardOpen(true);
  };

  const openVerifyWizard = (account) => {
    setWizardAccount(account);
    setWizardOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      <AnimatePresence>
        {wizardOpen && (
          <BankAccountWizard
            personnelId={person.id}
            person={person}
            existingAccount={wizardAccount}
            replaceAccounts={wizardAccount ? [] : activeAccounts}
            currentUser={currentUser}
            auditActors={auditActors}
            onClose={() => {
              setWizardOpen(false);
              setWizardAccount(null);
            }}
          />
        )}
      </AnimatePresence>

      <div className={`border-b border-border/70 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${BANK_TABLE_GRID}`}>
        <span>IBAN</span>
        <span>Bank</span>
        <span>Status</span>
        <span>Door</span>
        <div className="flex justify-end">
          {!wizardOpen && (
            <Button size="sm" variant="outline" onClick={openNewWizard}>
              <Plus className="mr-1 h-4 w-4" /> Nieuwe rekening
            </Button>
          )}
        </div>
      </div>

      {displayedAccounts.length > 0 ? (
        <div className="divide-y divide-border/70">
          {displayedAccounts.map(account => (
            <BankAccountRow
              key={account.id}
              acc={account}
              auditActors={auditActors}
              onPreview={setPreviewAcc}
              onOpenActions={setActionAcc}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center px-5 py-14 text-center">
          <p className="text-sm text-muted-foreground">Nog geen bankrekening geregistreerd.</p>
        </div>
      )}

      <BankAccountPreviewDialog
        account={previewAcc}
        open={Boolean(previewAcc)}
        onOpenChange={open => !open && setPreviewAcc(null)}
      />
      <BankAccountActionsDialog
        account={actionAcc}
        open={Boolean(actionAcc)}
        onOpenChange={open => !open && setActionAcc(null)}
        onPreview={setPreviewAcc}
        onVerify={openVerifyWizard}
      />
      <BankReplaceConfirmDialog
        open={replaceDialogOpen}
        onOpenChange={setReplaceDialogOpen}
        onConfirm={confirmReplace}
      />
    </div>
  );
}
