import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileUp,
  Loader2,
  X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { DocumentPhotoViewer, DocumentSideUpload } from "@/components/personnel/IdentityDocumentWizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buildAuditMetadata } from "@/lib/auditTrail";
import {
  companyKorpschefLabel,
  compactKorpschefValue,
  findMatchingWpbrLicense,
  normalizeKorpschefMatchValue,
  WPBR_CARD_COLORS,
} from "@/lib/korpschefRules";
import { updateManagedFileSource, uploadManagedFile } from "@/lib/managedFiles";

const STEP_LABELS = ["Documenttype", "Bedrijf", "Upload", "Controleren"];
const TODAY = () => new Date().toISOString().slice(0, 10);

const EMPTY_FORM = {
  record_type: "",
  company_id: "",
  document_reference: "",
  decision_date: "",
  valid_from: "",
  valid_until: "",
  card_color: "grey",
  card_number: "",
  card_role: "",
  personal_security: null,
  retail_surveillance: null,
  uniform_exemption: null,
  restriction_applies: null,
  restriction_text: "",
};

function fullPersonnelName(personnel) {
  const firstNames = personnel?.legal_first_names || personnel?.first_name || personnel?.call_name || "";
  return [firstNames, personnel?.name_prefix, personnel?.last_name]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim() || personnel?.name || "Medewerker";
}

function expectedLastName(personnel) {
  return [personnel?.name_prefix, personnel?.last_name].filter(Boolean).join(" ")
    || personnel?.last_name
    || personnel?.name
    || "";
}

function normalizedTokens(value) {
  return compactKorpschefValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(token => token.length > 1);
}

function valuesOverlap(left, right) {
  const leftTokens = normalizedTokens(left);
  const rightTokens = normalizedTokens(right);
  if (!leftTokens.length || !rightTokens.length) return null;
  const leftText = leftTokens.join(" ");
  const rightText = rightTokens.join(" ");
  if (leftText.includes(rightText) || rightText.includes(leftText)) return true;
  return leftTokens.every(token => rightTokens.includes(token))
    || rightTokens.every(token => leftTokens.includes(token));
}

function companyNameMatches(company, recognizedName) {
  if (!compactKorpschefValue(recognizedName)) return null;
  return [
    company?.legal_name,
    company?.statutory_name,
    company?.registered_name,
    company?.display_name,
    company?.trade_name,
  ].filter(Boolean).some(name => valuesOverlap(name, recognizedName));
}

function WizardSteps({ step }) {
  return (
    <div className="mb-4 flex items-center gap-1">
      {STEP_LABELS.map((label, index) => {
        const number = index + 1;
        const complete = number < step;
        const active = number === step;
        return (
          <React.Fragment key={label}>
            <div className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : complete
                  ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                  : "text-muted-foreground"
            }`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                active
                  ? "bg-primary-foreground text-primary"
                  : complete
                    ? "text-green-700 dark:text-green-300"
                    : "border border-muted-foreground/30 text-muted-foreground"
              }`}>
                {complete ? <Check className="h-3 w-3" /> : number}
              </span>
              {label}
            </div>
            {index < STEP_LABELS.length - 1 && (
              <div className={`h-px flex-1 ${complete ? "bg-green-200 dark:bg-green-900" : "bg-border"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function SingleDocumentUpload({ file, previewUrl, onFile, disabled }) {
  const inputRef = useRef(null);
  const isImage = file?.type?.startsWith("image/");
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="flex min-h-[150px] w-full flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/20 p-4 text-center transition-colors hover:border-primary hover:bg-accent/30 disabled:cursor-wait disabled:opacity-60"
      >
        {file ? (
          isImage && previewUrl ? (
            <img src={previewUrl} alt="Voorbeeld toestemmingsbrief" className="max-h-44 w-full object-contain" />
          ) : (
            <>
              <FileText className="mb-2 h-8 w-8 text-primary" />
              <span className="max-w-full truncate text-sm font-medium text-foreground">{file.name}</span>
              <span className="mt-1 text-xs text-muted-foreground">Klik om te vervangen</span>
            </>
          )
        ) : (
          <>
            <FileUp className="mb-2 h-8 w-8 text-muted-foreground/60" />
            <span className="text-sm font-medium text-foreground">Toestemmingsbrief uploaden</span>
            <span className="mt-1 text-xs text-muted-foreground">PDF, JPG of PNG</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={event => {
          const nextFile = event.target.files?.[0];
          if (nextFile) onFile(nextFile);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function PassGuide({ side }) {
  const front = side === "front";
  return (
    <div className="flex min-h-[120px] flex-1 items-center justify-center p-2">
      <div className="aspect-[1.57/1] w-full max-w-[320px] overflow-hidden rounded border border-border bg-white shadow-sm">
        <img
          src={front
            ? "/korpschef-guides/wpbr-id-front-example.png"
            : "/korpschef-guides/wpbr-id-back-example.png"}
          alt={front ? "Voorbeeld voorkant Wpbr-legitimatiebewijs" : "Voorbeeld achterkant Wpbr-legitimatiebewijs"}
          className="h-full w-full object-cover"
          draggable="false"
        />
      </div>
    </div>
  );
}

function PassUploadGuideCard({ frontUpload, backUpload }) {
  const rows = [
    {
      key: "front",
      title: "Voorkant",
      upload: frontUpload,
      description: "Voorzijde met persoonsgegevens, pasnummer, organisatie en geldigheid.",
    },
    {
      key: "back",
      title: "Achterkant",
      upload: backUpload,
      description: "Achterzijde met toestemming, ontheffingen en eventuele beperkingen.",
    },
  ];

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-card p-4">
      {rows.map((row, index) => (
        <React.Fragment key={row.key}>
          {index > 0 && <div className="h-px bg-border" />}
          <div className="flex items-stretch gap-4">
            <div className="flex w-1/2 min-w-0 flex-col gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{row.title}</p>
              {row.upload}
            </div>
            <div className="w-px self-stretch bg-border" />
            <div className="flex w-1/2 min-w-0 flex-col">
              <PassGuide side={row.key} />
              <div className="px-2 py-1.5">
                <p className="text-[11px] leading-snug text-muted-foreground">{row.description}</p>
              </div>
            </div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

function BooleanField({ id, checked, onCheckedChange, label }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <Checkbox id={id} checked={checked === true} onCheckedChange={value => onCheckedChange(value === true)} />
      {label}
    </label>
  );
}

export default function KorpschefDocumentWizard({
  personnel,
  companyOptions,
  licenses,
  isArchiveEntry = false,
  auditActors = [],
  onClose,
  onSaved,
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [permissionFile, setPermissionFile] = useState(null);
  const [permissionPreviewUrl, setPermissionPreviewUrl] = useState("");
  const [frontFile, setFrontFile] = useState(null);
  const [frontPreviewUrl, setFrontPreviewUrl] = useState("");
  const [backFile, setBackFile] = useState(null);
  const [backPreviewUrl, setBackPreviewUrl] = useState("");
  const [recognizedKey, setRecognizedKey] = useState("");
  const [recognizedPass, setRecognizedPass] = useState(null);
  const [scanQuality, setScanQuality] = useState(null);
  const [errors, setErrors] = useState({});
  const latestUploadKeyRef = useRef("");
  const recognitionInFlightKeyRef = useRef("");

  const { data: currentUser = null } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedOption = companyOptions.find(option => option.company.id === form.company_id) || null;
  const selectedCompany = selectedOption?.company || null;
  const uploadKey = [frontFile, backFile]
    .filter(Boolean)
    .map(file => `${file.name}:${file.size}:${file.lastModified}`)
    .join("|");
  const isPass = form.record_type === "wpbr_id";
  const scanPending = Boolean(isPass && frontFile && backFile && recognizedKey !== uploadKey);

  const setField = (field, value) => {
    setForm(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined, general: undefined }));
  };

  useEffect(() => {
    if (!permissionPreviewUrl?.startsWith("blob:")) return undefined;
    return () => URL.revokeObjectURL(permissionPreviewUrl);
  }, [permissionPreviewUrl]);

  useEffect(() => {
    latestUploadKeyRef.current = uploadKey;
  }, [uploadKey]);

  useEffect(() => {
    if (
      !isPass
      || !frontFile
      || !backFile
      || !uploadKey
      || recognizedKey === uploadKey
      || recognitionInFlightKeyRef.current === uploadKey
    ) return;
    const currentUploadKey = uploadKey;
    recognitionInFlightKeyRef.current = currentUploadKey;

    const runRecognition = async () => {
      try {
        const { recognizeWpbrPass } = await import("@/lib/wpbrPassOcr");
        const result = await recognizeWpbrPass({ frontFile, backFile });
        if (latestUploadKeyRef.current !== currentUploadKey) return;
        setRecognizedPass(result);
        setForm(current => ({
          ...current,
          valid_from: result.valid_from || current.valid_from,
          valid_until: result.valid_until || current.valid_until,
          card_number: result.card_number || current.card_number,
          card_role: result.card_role || current.card_role,
          personal_security: result.personal_security ?? current.personal_security,
          retail_surveillance: result.retail_surveillance ?? current.retail_surveillance,
          uniform_exemption: result.uniform_exemption ?? current.uniform_exemption,
          restriction_applies: result.restriction_applies ?? current.restriction_applies,
          restriction_text: result.restriction_text || current.restriction_text,
        }));
        setScanQuality(result.upload_quality || null);
        setRecognizedKey(currentUploadKey);
      } catch (error) {
        console.error("Wpbr-pass OCR failed", error);
        if (latestUploadKeyRef.current !== currentUploadKey) return;
        setScanQuality({
          status: "review",
          score: 0,
          title: "Handmatige controle nodig",
          summary: "De pas is ontvangen, maar de automatische herkenning kon niet volledig worden afgerond.",
          checks: [],
        });
        setRecognizedPass(null);
        setRecognizedKey(currentUploadKey);
      } finally {
        if (recognitionInFlightKeyRef.current === currentUploadKey) {
          recognitionInFlightKeyRef.current = "";
        }
      }
    };

    runRecognition();
  }, [backFile, frontFile, isPass, recognizedKey, uploadKey]);

  const licenseMatch = useMemo(() => {
    if (!selectedCompany) return { license: null, status: "company_only", explanation: "" };
    return findMatchingWpbrLicense({
      company: selectedCompany,
      licenses,
      recognizedLicenseNumber: recognizedPass?.license_number || "",
    });
  }, [licenses, recognizedPass?.license_number, selectedCompany]);

  const reviewIssues = useMemo(() => {
    if (!isPass || !selectedCompany) return [];
    const issues = [];
    const lastNameMatch = valuesOverlap(expectedLastName(personnel), recognizedPass?.last_name);
    const givenNamesMatch = valuesOverlap(
      personnel?.legal_first_names || personnel?.first_name || personnel?.call_name,
      recognizedPass?.given_names
    );
    const organizationMatch = companyNameMatches(selectedCompany, recognizedPass?.organization_name);

    if (lastNameMatch === false) {
      issues.push({
        severity: "critical",
        label: "Achternaam komt niet overeen",
        detail: `Personeelsprofiel: ${expectedLastName(personnel)}. Pas: ${recognizedPass?.last_name}.`,
      });
    }
    if (givenNamesMatch === false) {
      issues.push({
        severity: "warning",
        label: "Voornamen lijken af te wijken",
        detail: `Controleer of de pas bij ${fullPersonnelName(personnel)} hoort.`,
      });
    }
    if (
      personnel?.date_of_birth
      && recognizedPass?.birth_date
      && personnel.date_of_birth !== recognizedPass.birth_date
    ) {
      issues.push({
        severity: "critical",
        label: "Geboortedatum komt niet overeen",
        detail: `Personeelsprofiel: ${personnel.date_of_birth}. Pas: ${recognizedPass.birth_date}.`,
      });
    }
    if (organizationMatch === false) {
      issues.push({
        severity: "critical",
        label: "Organisatie komt niet overeen",
        detail: `De pas noemt ${recognizedPass?.organization_name}; gekozen is ${companyKorpschefLabel(selectedCompany)}.`,
      });
    }
    if (licenseMatch.status === "mismatch") {
      issues.push({
        severity: "critical",
        label: "Vergunningnummer komt niet overeen",
        detail: licenseMatch.explanation,
      });
    } else if (licenseMatch.status === "company_only") {
      issues.push({
        severity: "warning",
        label: "Vergunningcontext niet uniek afgeleid",
        detail: licenseMatch.explanation,
      });
    }
    if (scanQuality?.status === "review") {
      issues.push({
        severity: "warning",
        label: scanQuality.title || "Handmatige controle nodig",
        detail: scanQuality.summary,
      });
    }
    return issues;
  }, [
    isPass,
    licenseMatch,
    personnel,
    recognizedPass,
    scanQuality,
    selectedCompany,
  ]);

  const hasCriticalIssue = reviewIssues.some(issue => issue.severity === "critical");
  const verificationNeedsReview = reviewIssues.some(issue => issue.severity !== "critical")
    || licenseMatch.status === "company_only";

  const validateUpload = () => {
    const nextErrors = {};
    if (isPass) {
      if (!frontFile) nextErrors.front = "Upload de voorkant.";
      if (!backFile) nextErrors.back = "Upload de achterkant.";
    } else if (!permissionFile) {
      nextErrors.permission = "Upload de toestemmingsbrief.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateReview = () => {
    const nextErrors = {};
    if (isPass) {
      if (!form.valid_from) nextErrors.valid_from = "Begindatum is verplicht.";
      if (!form.valid_until) nextErrors.valid_until = "Einddatum is verplicht.";
      if (form.valid_from && form.valid_until && form.valid_until < form.valid_from) nextErrors.valid_until = "De einddatum ligt voor de begindatum.";
      if (!compactKorpschefValue(form.card_number)) nextErrors.card_number = "Pasnummer is verplicht.";
    } else if (!form.decision_date && !form.valid_from) {
      nextErrors.decision_date = "Vul de besluitdatum of ingangsdatum in.";
    }
    if (hasCriticalIssue) {
      nextErrors.general = "De pas sluit niet aan op de gekozen medewerker of het bedrijf. Controleer de uploads of ga terug naar Bedrijf.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!validateReview()) throw new Error("validation");
      const company = selectedCompany;
      const expiredByDate = Boolean(form.valid_until && form.valid_until < TODAY());
      const archived = isArchiveEntry || expiredByDate;
      const recordStatus = archived ? "expired" : "active";
      const category = isPass ? "wpbr_badge" : "wpbr_permission";
      const documentLabel = isPass ? "Wpbr-legitimatiebewijs" : "Toestemmingsbrief korpschef";
      const documentNumber = isPass ? form.card_number : form.document_reference;
      const ownerLabel = fullPersonnelName(personnel);
      const selectedLicense = licenseMatch.license;
      const holderLastName = expectedLastName(personnel);
      const holderGivenNames = personnel?.legal_first_names
        || personnel?.first_name
        || personnel?.call_name
        || "";

      const existing = await base44.entities.PersonnelDocument.filter({ personnel_id: personnel.id }, "-created_date");
      const duplicate = existing.find(document => (
        document.company_id === company.id
        && document.category === category
        && documentNumber
        && normalizeKorpschefMatchValue(document.document_number) === normalizeKorpschefMatchValue(documentNumber)
      ));
      if (duplicate) {
        setErrors(current => ({ ...current, general: "Dit documentnummer is al voor deze medewerker en dit bedrijf geregistreerd." }));
        throw new Error("duplicate");
      }

      let fileUpload = null;
      let frontUpload = null;
      let backUpload = null;
      const commonUpload = {
        ownerType: "personnel",
        ownerId: personnel.id,
        companyId: company.id,
        ownerLabel,
        domain: "compliance",
        category,
        sourceEntity: "PersonnelDocument",
        sourceEntityId: null,
        documentLabel,
        documentNumber: documentNumber || null,
        validFrom: form.valid_from || form.decision_date || null,
        validUntil: form.valid_until || null,
        isSensitive: true,
        uploadedBy: currentUser,
        auditActors,
        auditAction: archived ? "gearchiveerd" : "toegevoegd",
        folderSegments: ["korpschef", isPass ? "legitimatiebewijzen" : "toestemmingen"],
      };

      if (isPass) {
        frontUpload = await uploadManagedFile({
          ...commonUpload,
          file: frontFile,
          sourceField: "front_file_url",
          documentLabel: `${documentLabel} voorkant`,
        });
        backUpload = await uploadManagedFile({
          ...commonUpload,
          file: backFile,
          sourceField: "back_file_url",
          documentLabel: `${documentLabel} achterkant`,
        });
      } else {
        fileUpload = await uploadManagedFile({
          ...commonUpload,
          file: permissionFile,
          sourceField: "file_url",
        });
      }

      const metadata = buildAuditMetadata(currentUser, archived ? "gearchiveerd" : "toegevoegd", {
        korpschef_record: true,
        record_type: form.record_type,
        record_status: recordStatus,
        authority: "korpschef",
        decision_date: form.decision_date || null,
        organization_name: companyKorpschefLabel(company),
        license_id: selectedLicense?.id || null,
        license_type: selectedLicense?.license_type || null,
        license_number: selectedLicense?.license_number || recognizedPass?.license_number || null,
        license_match_status: licenseMatch.status,
        card_color: isPass ? form.card_color : null,
        card_role: isPass ? recognizedPass?.card_role || form.card_role || null : null,
        holder_last_name: isPass ? holderLastName : null,
        holder_given_names: isPass ? holderGivenNames : null,
        holder_birth_date: isPass ? personnel?.date_of_birth || null : null,
        personal_security: isPass ? form.personal_security : null,
        retail_surveillance: isPass ? form.retail_surveillance : null,
        uniform_exemption: isPass ? form.uniform_exemption : null,
        restriction_applies: isPass ? form.restriction_applies : null,
        restriction_text: isPass ? form.restriction_text || null : null,
        archived,
        archived_at: archived ? new Date().toISOString() : null,
        manual_document_check: false,
        background_verification_status: hasCriticalIssue
          ? "mismatch"
          : verificationNeedsReview
            ? "review"
            : "matched",
        background_verification_issues: reviewIssues.map(issue => ({
          severity: issue.severity,
          code: issue.label,
        })),
        ocr_organization_name: isPass ? recognizedPass?.organization_name || null : null,
        ocr_license_number: isPass ? recognizedPass?.license_number || null : null,
        ocr_holder_last_name: isPass ? recognizedPass?.last_name || null : null,
        ocr_holder_given_names: isPass ? recognizedPass?.given_names || null : null,
        ocr_holder_birth_date: isPass ? recognizedPass?.birth_date || null : null,
        ocr_quality_score: isPass ? scanQuality?.score ?? null : null,
      }, auditActors);

      if (!archived) {
        const sameTypeActive = existing.filter(document => (
          document.company_id === company.id
          && document.category === category
          && document.metadata?.archived !== true
          && (!document.valid_until || document.valid_until >= TODAY())
        ));
        await Promise.all(sameTypeActive.map(document => base44.entities.PersonnelDocument.update(document.id, {
          verification_status: "expired",
          metadata: buildAuditMetadata(currentUser, "vervangen", {
            ...(document.metadata || {}),
            record_status: "superseded",
            archived: true,
            archived_at: new Date().toISOString(),
          }, auditActors),
        })));
      }

      const created = await base44.entities.PersonnelDocument.create({
        personnel_id: personnel.id,
        company_id: company.id,
        category,
        document_type: documentLabel,
        document_number: documentNumber || null,
        valid_from: form.valid_from || form.decision_date || null,
        valid_until: form.valid_until || null,
        file_url: fileUpload?.file_url || null,
        file_id: fileUpload?.managed_file_id || null,
        file_download_filename: fileUpload?.download_filename || null,
        file_logical_path: fileUpload?.logical_path || null,
        front_file_url: frontUpload?.file_url || null,
        front_file_id: frontUpload?.managed_file_id || null,
        front_download_filename: frontUpload?.download_filename || null,
        front_logical_path: frontUpload?.logical_path || null,
        back_file_url: backUpload?.file_url || null,
        back_file_id: backUpload?.managed_file_id || null,
        back_download_filename: backUpload?.download_filename || null,
        back_logical_path: backUpload?.logical_path || null,
        verification_status: archived ? "expired" : verificationNeedsReview ? "pending_review" : "verified",
        is_sensitive: true,
        notes: null,
        metadata,
      });

      await Promise.all([
        fileUpload?.managed_file_id
          ? updateManagedFileSource(fileUpload.managed_file_id, { source_entity_id: created.id })
          : null,
        frontUpload?.managed_file_id
          ? updateManagedFileSource(frontUpload.managed_file_id, { source_entity_id: created.id })
          : null,
        backUpload?.managed_file_id
          ? updateManagedFileSource(backUpload.managed_file_id, { source_entity_id: created.id })
          : null,
      ].filter(Boolean));
      return created;
    },
    onSuccess: document => {
      queryClient.invalidateQueries({ queryKey: ["personnel-documents"] });
      queryClient.invalidateQueries({ queryKey: ["personnel-documents", personnel.id] });
      onSaved?.(document);
      onClose();
    },
    onError: error => {
      if (["validation", "duplicate"].includes(error?.message)) return;
      console.error("Korpschef document save failed", error);
      setErrors(current => ({
        ...current,
        general: error?.message || "Het document kon niet worden opgeslagen.",
      }));
    },
  });

  const chooseType = recordType => {
    setForm({ ...EMPTY_FORM, record_type: recordType });
    setStep(2);
    setErrors({});
  };

  const chooseCompany = companyId => {
    const option = companyOptions.find(item => item.company.id === companyId);
    if (!option?.selectable) return;
    setForm(current => ({ ...current, company_id: companyId }));
    setStep(3);
    setErrors({});
  };

  const goToReview = () => {
    if (!validateUpload()) return;
    setStep(4);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="border-b border-border bg-card px-5 py-4"
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {isArchiveEntry ? "Oud Korpschef-document toevoegen" : "Korpschef-document toevoegen"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            LOQ koppelt het document aan de medewerker en het gekozen bedrijf. De vergunningcontext wordt automatisch gecontroleerd.
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose} title="Sluiten">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <WizardSteps step={step} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.14 }}
        >
          {step === 1 && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">Welk document wil je toevoegen?</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Kies het document dat door de korpschef van politie is afgegeven.</p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => chooseType("permission")}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Toestemmingsbrief korpschef</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Besluit waarmee toestemming is verleend om voor het bedrijf te werken.</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  onClick={() => chooseType("wpbr_id")}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Wpbr-legitimatiebewijs</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Voor- en achterkant van de beveiligings- of recherchepas, inclusief OCR-controle.</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </div>
              <div className="flex justify-end pt-1">
                <Button variant="outline" size="sm" onClick={onClose}>Annuleren</Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">Voor welk bedrijf geldt dit document?</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Alleen actieve bedrijven met een Wpbr-context worden getoond.</p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {companyOptions.map(option => (
                  <button
                    key={option.company.id}
                    type="button"
                    disabled={!option.selectable}
                    onClick={() => chooseCompany(option.company.id)}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all ${
                      option.selectable
                        ? "border-border bg-card hover:border-primary hover:bg-accent active:scale-[0.99]"
                        : "cursor-not-allowed border-border bg-muted/40 opacity-60"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{companyKorpschefLabel(option.company)}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {option.selectable
                          ? `${option.activeLicenses.length} actieve Wpbr-${option.activeLicenses.length === 1 ? "vergunning" : "vergunningen"}`
                          : `Aanvullen: ${option.missing.join(", ")}`}
                      </p>
                    </div>
                    {option.selectable
                      ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      : <Badge variant="outline" className="shrink-0 text-xs">Niet gereed</Badge>}
                  </button>
                ))}
              </div>
              {companyOptions.length === 0 && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                  Er is geen actief bedrijf met een Wpbr-vergunning beschikbaar.
                </p>
              )}
              <div className="flex items-center justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> Terug
                </Button>
                <Button variant="outline" size="sm" onClick={onClose}>Annuleren</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {isPass ? "Upload het Wpbr-legitimatiebewijs" : "Upload de toestemmingsbrief"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{companyKorpschefLabel(selectedCompany)}</p>
              </div>

              {isPass ? (
                <PassUploadGuideCard
                  frontUpload={(
                    <>
                      <DocumentSideUpload
                        label="Voorkant uploaden"
                        hint="Zorg dat persoonsgegevens, pasnummer en geldigheid leesbaar zijn."
                        previewUrl={frontPreviewUrl}
                        onFileSelected={(file, previewUrl) => {
                          setFrontFile(file);
                          setFrontPreviewUrl(previewUrl);
                          setRecognizedKey("");
                          setRecognizedPass(null);
                          setScanQuality(null);
                        }}
                        uploading={false}
                        required
                      />
                      {errors.front && <p className="text-xs text-destructive">{errors.front}</p>}
                    </>
                  )}
                  backUpload={(
                    <>
                      <DocumentSideUpload
                        label="Achterkant uploaden"
                        hint="Zorg dat ontheffingen, beperkingen en toestemming leesbaar zijn."
                        previewUrl={backPreviewUrl}
                        onFileSelected={(file, previewUrl) => {
                          setBackFile(file);
                          setBackPreviewUrl(previewUrl);
                          setRecognizedKey("");
                          setRecognizedPass(null);
                          setScanQuality(null);
                        }}
                        uploading={false}
                        required
                      />
                      {errors.back && <p className="text-xs text-destructive">{errors.back}</p>}
                    </>
                  )}
                />
              ) : (
                <SingleDocumentUpload
                  file={permissionFile}
                  previewUrl={permissionPreviewUrl}
                  disabled={false}
                  onFile={file => {
                    setPermissionFile(file);
                    setPermissionPreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : "");
                    setErrors(current => ({ ...current, permission: undefined }));
                  }}
                />
              )}

              {errors.permission && <p className="text-xs text-destructive">{errors.permission}</p>}

              <div className="flex items-center justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> Terug
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={onClose}>Annuleren</Button>
                  <Button size="sm" onClick={goToReview}>
                    Controleren <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 4 && scanPending && (
            <div className="space-y-4">
              <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-12 text-center">
                <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium text-foreground">Scan verwerken</p>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                  De upload wordt gelezen. Zodra dit klaar is, opent de controle automatisch.
                </p>
              </div>
              <div className="flex items-center justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => setStep(3)}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> Terug
                </Button>
                <Button variant="outline" size="sm" onClick={onClose}>Annuleren</Button>
              </div>
            </div>
          )}

          {step === 4 && !scanPending && (
            <div className="space-y-4">
              <div className={`grid grid-cols-1 gap-5 ${
                isPass || permissionPreviewUrl
                  ? "xl:grid-cols-[minmax(0,1fr)_360px]"
                  : ""
              }`}>
                <div className="space-y-4">
                  {isPass ? (
                    <>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="pass-number">Pasnummer *</Label>
                          <Input id="pass-number" value={form.card_number} onChange={event => setField("card_number", event.target.value)} />
                          {errors.card_number && <p className="text-xs text-destructive">{errors.card_number}</p>}
                        </div>
                        <div className="space-y-1.5">
                          <Label>Kaartkleur *</Label>
                          <Select value={form.card_color} onValueChange={value => setField("card_color", value)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {WPBR_CARD_COLORS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">Controleer de kleur op de originele pas.</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="pass-valid-from">Geldig vanaf *</Label>
                          <Input id="pass-valid-from" type="date" value={form.valid_from} onChange={event => setField("valid_from", event.target.value)} />
                          {errors.valid_from && <p className="text-xs text-destructive">{errors.valid_from}</p>}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="pass-valid-until">Geldig tot en met *</Label>
                          <Input id="pass-valid-until" type="date" value={form.valid_until} onChange={event => setField("valid_until", event.target.value)} />
                          {errors.valid_until && <p className="text-xs text-destructive">{errors.valid_until}</p>}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
                        <BooleanField id="personal-security" checked={form.personal_security} onCheckedChange={value => setField("personal_security", value)} label="Persoonsbeveiliger" />
                        <BooleanField id="retail-surveillance" checked={form.retail_surveillance} onCheckedChange={value => setField("retail_surveillance", value)} label="Winkelsurveillant" />
                        <BooleanField id="uniform-exemption" checked={form.uniform_exemption} onCheckedChange={value => setField("uniform_exemption", value)} label="Ontheffing uniformdraagplicht" />
                        <BooleanField id="restriction-applies" checked={form.restriction_applies} onCheckedChange={value => setField("restriction_applies", value)} label="Beperking van toepassing" />
                      </div>
                      {form.restriction_applies && (
                        <div className="space-y-1.5">
                          <Label htmlFor="restriction-text">Beperking</Label>
                          <Textarea id="restriction-text" value={form.restriction_text} onChange={event => setField("restriction_text", event.target.value)} rows={2} />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="permission-reference">Kenmerk of besluitnummer</Label>
                        <Input id="permission-reference" value={form.document_reference} onChange={event => setField("document_reference", event.target.value)} />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="decision-date">Besluitdatum</Label>
                          <Input id="decision-date" type="date" value={form.decision_date} onChange={event => setField("decision_date", event.target.value)} />
                          {errors.decision_date && <p className="text-xs text-destructive">{errors.decision_date}</p>}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="permission-valid-from">Geldig vanaf</Label>
                          <Input id="permission-valid-from" type="date" value={form.valid_from} onChange={event => setField("valid_from", event.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="permission-valid-until">Geldig tot</Label>
                          <Input id="permission-valid-until" type="date" value={form.valid_until} onChange={event => setField("valid_until", event.target.value)} />
                        </div>
                      </div>
                    </>
                  )}

                  {hasCriticalIssue && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>De pas kan niet aan de gekozen medewerker of het bedrijf worden gekoppeld. Upload een duidelijkere scan of controleer je eerdere keuzes.</span>
                    </div>
                  )}
                </div>

                {isPass && (frontPreviewUrl || backPreviewUrl) && (
                  <DocumentPhotoViewer
                    images={[
                      ...(frontPreviewUrl ? [{ src: frontPreviewUrl, label: "Voorkant" }] : []),
                      ...(backPreviewUrl ? [{ src: backPreviewUrl, label: "Achterkant" }] : []),
                    ]}
                  />
                )}
                {!isPass && permissionPreviewUrl && (
                  <DocumentPhotoViewer
                    images={[{ src: permissionPreviewUrl, label: "Toestemmingsbrief" }]}
                  />
                )}
              </div>

              {errors.general && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{errors.general}</span>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-border pt-3">
                <Button variant="ghost" size="sm" onClick={() => setStep(3)}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> Terug
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={onClose}>Annuleren</Button>
                  <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || hasCriticalIssue}>
                    {saveMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
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
