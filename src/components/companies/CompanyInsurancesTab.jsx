import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ManagedFilePreviewDialog from "@/components/files/ManagedFilePreviewDialog";
import { buildManagedFileDescriptor, updateManagedFileSource, uploadManagedFile } from "@/lib/managedFiles";
import { buildAuditMetadata, getAuditActorLabel } from "@/lib/auditTrail";
import {
  AlertTriangle,
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit,
  Eye,
  FileText,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const DELETE_PASSWORD = "verwijder";
const INSURANCE_TABLE_GRID = "grid grid-cols-[minmax(220px,1.2fr)_minmax(180px,0.9fr)_minmax(108px,130px)_minmax(180px,260px)_minmax(140px,180px)_minmax(230px,300px)] gap-3 xl:gap-4";
const CUSTOM_PARTY_NEW_VALUE = "__new_party__";
const CUSTOM_PARTY_NONE_VALUE = "__no_party__";

const INSURANCE_OPTIONS = [
  {
    key: "company_liability",
    label: "Bedrijfsaansprakelijkheid (AVB)",
    group: "Kernverzekeringen",
    desc: "Schade aan personen of zaken tijdens werkzaamheden.",
    recommended: true,
  },
  {
    key: "professional_liability",
    label: "Beroepsaansprakelijkheid (BAV)",
    group: "Kernverzekeringen",
    desc: "Fouten, nalatigheid of verkeerd advies in professionele dienstverlening.",
    recommended: true,
  },
  {
    key: "employer_liability",
    label: "Werkgeversaansprakelijkheid",
    group: "Personeel en inzet",
    desc: "Aansprakelijkheid richting medewerkers bij werkgerelateerde schade.",
    recommended: true,
  },
  {
    key: "vehicle_fleet",
    label: "Voertuig- of wagenparkverzekering",
    group: "Personeel en inzet",
    desc: "WA/WAM en aanvullende dekking voor bedrijfsvoertuigen.",
    requiredReason: "WA/WAM is verplicht voor motorrijtuigen.",
    activityKeys: ["mobile_surveillance", "alarm_response"],
  },
  {
    key: "accident",
    label: "Ongevallenverzekering",
    group: "Personeel en inzet",
    desc: "Aanvullende dekking bij ongevallen tijdens uitvoering.",
    activityKeys: ["object_security", "mobile_surveillance", "event_hospitality_security", "alarm_response"],
  },
  {
    key: "sickness_absence",
    label: "Verzuimverzekering",
    group: "Personeel en inzet",
    desc: "Loonkosten en begeleiding bij ziekteverzuim.",
  },
  {
    key: "cyber",
    label: "Cyberverzekering",
    group: "Aanvullend",
    desc: "Incidenten rond digitale systemen, datalekken en herstelkosten.",
    activityKeys: ["object_security", "mobile_surveillance", "alarm_center", "video_surveillance_center"],
  },
  {
    key: "equipment_inventory",
    label: "Materieel en inventaris",
    group: "Aanvullend",
    desc: "Bedrijfsmiddelen zoals portofoons, sleutels, camera's en kantoorinventaris.",
  },
  {
    key: "legal_assistance",
    label: "Rechtsbijstand",
    group: "Aanvullend",
    desc: "Juridische ondersteuning bij zakelijke geschillen.",
  },
  {
    key: "directors_liability",
    label: "Bestuurdersaansprakelijkheid",
    group: "Aanvullend",
    desc: "Aansprakelijkheid van bestuurders of directie.",
  },
  {
    key: "other",
    label: "Andere verzekering",
    group: "Aanvullend",
    desc: "Gebruik dit voor een eigen of nicheverzekering.",
  },
];

const EMPTY_FORM = {
  insurance_type: "",
  insurance_name: "",
  insurer_name: "",
  broker_name: "",
  policy_number: "",
  coverage_amount: "",
  deductible_amount: "",
  valid_from: "",
  valid_until: "",
  has_no_expiry: false,
  renewal_notice_date: "",
  status: "active",
  required_reason: "",
  document_file_url: "",
  document_filename: "",
  document_file_id: "",
  document_download_filename: "",
  document_logical_path: "",
  document_metadata: null,
  notes: "",
};

const STATUS_LABELS = {
  active: "Actief",
  action_required: "Actie nodig",
  expired: "Verlopen",
  cancelled: "Beeindigd",
  archived: "Archief",
};

const STATUS_CLASSES = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  action_required: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  expired: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  cancelled: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  archived: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

function insuranceMeta(type) {
  return INSURANCE_OPTIONS.find(option => option.key === type) || INSURANCE_OPTIONS[INSURANCE_OPTIONS.length - 1];
}

function isArchived(policy) {
  return policy?.status === "archived" || policy?.status === "cancelled";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function deriveStatus(data) {
  if (data.status === "cancelled" || data.status === "archived") return data.status;
  if (data.valid_until && data.valid_until < todayIso()) return "expired";
  if (!data.document_file_url) return "action_required";
  return "active";
}

function validityText(policy) {
  if (policy.has_no_expiry) return policy.valid_from ? `Vanaf: ${policy.valid_from}` : "Geen einddatum";
  if (policy.valid_from && policy.valid_until) return `Vanaf: ${policy.valid_from}  Tot: ${policy.valid_until}`;
  if (policy.valid_until) return `Tot: ${policy.valid_until}`;
  return "Geen einddatum";
}

function normalizePartyName(value = "") {
  return value.trim().replace(/\s+/g, " ");
}

function partyOptionsFromPolicies(policies = [], fieldName) {
  const byKey = new Map();

  (policies || []).forEach(policy => {
    const value = normalizePartyName(policy?.[fieldName] || "");
    if (!value) return;

    const key = value.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, value);
  });

  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "nl"));
}

function WizardSteps({ step }) {
  const steps = ["Verzekering", "Gegevens", "Polisblad"];
  return (
    <div className="mb-4 flex items-center gap-1">
      {steps.map((label, index) => {
        const number = index + 1;
        const active = number === step;
        const done = number < step;
        return (
          <React.Fragment key={label}>
            <div className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : done
                  ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                  : "text-muted-foreground"
            }`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                active
                  ? "bg-primary-foreground text-primary"
                  : done
                    ? "text-green-700 dark:text-green-300"
                    : "border border-muted-foreground/30 text-muted-foreground"
              }`}>
                {done ? <Check className="h-3 w-3" /> : number}
              </span>
              {label}
            </div>
            {index < steps.length - 1 && (
              <div className={`h-px flex-1 ${done ? "bg-green-200 dark:bg-green-900" : "bg-border"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function DeleteConfirmBar({ label, onConfirm, onCancel, isPending }) {
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
    <div className="border-b border-destructive/20 bg-destructive/5 p-4">
      <div className="mb-3 flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div>
          <p className="text-sm font-semibold text-foreground">Verzekering verwijderen?</p>
          <p className="mt-0.5 text-xs text-muted-foreground"><strong>{label}</strong> wordt verwijderd.</p>
        </div>
      </div>
      <div className="space-y-2">
        <label className="block text-xs text-muted-foreground">
          Typ <strong className="font-mono text-foreground">{DELETE_PASSWORD}</strong> om te bevestigen:
        </label>
        <div className="flex flex-wrap gap-2">
          <Input
            value={password}
            onChange={(event) => { setPassword(event.target.value); setError(""); }}
            placeholder={DELETE_PASSWORD}
            className={`h-8 max-w-[200px] font-mono text-sm ${error ? "border-destructive" : ""}`}
            onKeyDown={(event) => event.key === "Enter" && handleConfirm()}
            autoFocus
          />
          <Button variant="destructive" size="sm" onClick={handleConfirm} disabled={isPending}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {isPending ? "Verwijderen..." : "Verwijderen"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Annuleren</Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

function InsuranceTypeOption({ option, selected, relevant, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[78px] items-center justify-between rounded-lg border px-4 py-3 text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99] ${
        selected ? "border-primary bg-accent" : "border-border bg-card"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{option.label}</span>
          {option.requiredReason && <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Verplicht bij voertuigen</Badge>}
          {option.recommended && <Badge variant="secondary">Aanbevolen</Badge>}
          {relevant && !option.recommended && !option.requiredReason && <Badge variant="outline">Relevant</Badge>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{option.desc}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function InsurancePartySelectField({
  label,
  value,
  options,
  creating,
  required = false,
  placeholder,
  newLabel,
  emptyLabel,
  customPlaceholder,
  help,
  error,
  onSelect,
  onCustomChange,
}) {
  const normalizedValue = normalizePartyName(value || "");
  const selectValue = creating
    ? CUSTOM_PARTY_NEW_VALUE
    : normalizedValue && options.some(option => option === normalizedValue)
      ? normalizedValue
      : !required && !normalizedValue
        ? CUSTOM_PARTY_NONE_VALUE
        : "";

  return (
    <div className="space-y-1">
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      <Select value={selectValue} onValueChange={onSelect}>
        <SelectTrigger className={`h-8 ${error ? "border-destructive" : ""}`}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {!required && <SelectItem value={CUSTOM_PARTY_NONE_VALUE}>{emptyLabel || "Geen"}</SelectItem>}
          {options.map(option => (
            <SelectItem key={option} value={option}>{option}</SelectItem>
          ))}
          <SelectItem value={CUSTOM_PARTY_NEW_VALUE}>{newLabel}</SelectItem>
        </SelectContent>
      </Select>
      {creating && (
        <Input
          className={`h-8 ${error ? "border-destructive" : ""}`}
          value={value}
          onChange={event => onCustomChange(event.target.value)}
          placeholder={customPlaceholder}
        />
      )}
      {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export default function CompanyInsurancesTab({ companyId, company }) {
  const queryClient = useQueryClient();
  const wizardRef = useRef(null);
  const [showWizard, setShowWizard] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [deleteId, setDeleteId] = useState(null);
  const [showArchive, setShowArchive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [creatingInsurer, setCreatingInsurer] = useState(false);
  const [creatingBroker, setCreatingBroker] = useState(false);

  useEffect(() => {
    if (!showWizard) return undefined;
    const timer = setTimeout(() => wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    return () => clearTimeout(timer);
  }, [step, showWizard]);

  const { data: policies = [] } = useQuery({
    queryKey: ["company-insurance-policies", companyId],
    queryFn: () => base44.entities.CompanyInsurancePolicy.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId,
  });
  const { data: currentUser = null } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: auditActors = [] } = useQuery({
    queryKey: ["personnel"],
    queryFn: () => base44.entities.Personnel.list(),
    staleTime: 5 * 60 * 1000,
  });

  const companyActivities = useMemo(() => new Set(company?.activities || []), [company]);
  const insurerOptions = useMemo(() => partyOptionsFromPolicies(policies, "insurer_name"), [policies]);
  const brokerOptions = useMemo(() => partyOptionsFromPolicies(policies, "broker_name"), [policies]);
  const groupedOptions = useMemo(() => {
    const scored = INSURANCE_OPTIONS.map(option => {
      const relevant = (option.activityKeys || []).some(key => companyActivities.has(key));
      const score = (option.recommended ? 20 : 0) + (option.requiredReason ? 15 : 0) + (relevant ? 10 : 0);
      return { ...option, relevant, score };
    }).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

    return scored.reduce((groups, option) => {
      groups[option.group] = groups[option.group] || [];
      groups[option.group].push(option);
      return groups;
    }, {});
  }, [companyActivities]);

  const getDocumentDescriptor = (data) => {
    const meta = insuranceMeta(data.insurance_type);
    const validYear = data.valid_until ? data.valid_until.slice(0, 4) : "doorlopend";
    return buildManagedFileDescriptor({
      filename: data.document_download_filename || data.document_filename || "polisblad.pdf",
      ownerType: "company",
      ownerId: companyId,
      companyId,
      ownerLabel: company?.display_name || company?.legal_name || "Bedrijf",
      domain: "compliance",
      category: "company_insurance_policy",
      documentLabel: data.insurance_name || meta.label,
      documentNumber: data.policy_number || null,
      validFrom: data.valid_from || null,
      validUntil: data.valid_until || null,
      folderSegments: ["verzekeringen", data.insurance_type || "overig", validYear],
    });
  };

  const withCurrentDocumentDescriptor = (data) => {
    if (!data.document_file_url) return data;
    const descriptor = getDocumentDescriptor(data);
    return {
      ...data,
      document_filename: descriptor.download_filename,
      document_download_filename: descriptor.download_filename,
      document_logical_path: descriptor.logical_path,
      document_metadata: {
        ...(data.document_metadata || {}),
        managed_file_id: data.document_file_id || data.document_metadata?.managed_file_id || null,
        folder_path: descriptor.folder_path,
        insurance_type: data.insurance_type || null,
        policy_number: data.policy_number || null,
      },
    };
  };

  const syncManagedDocumentDescriptor = async (data, sourceEntityId) => {
    if (!data.document_file_id) return;
    const descriptor = getDocumentDescriptor(data);
    await updateManagedFileSource(data.document_file_id, {
      owner_id: companyId,
      company_id: companyId,
      source_entity_id: sourceEntityId,
      display_filename: descriptor.display_filename,
      download_filename: descriptor.download_filename,
      logical_path: descriptor.logical_path,
      folder_path: descriptor.folder_path,
      document_label: data.insurance_name || insuranceMeta(data.insurance_type).label,
      document_number: data.policy_number || null,
      valid_from: data.valid_from || null,
      valid_until: data.valid_until || null,
      metadata: {
        ...(data.document_metadata || {}),
        managed_file_id: data.document_file_id,
        folder_path: descriptor.folder_path,
        insurance_type: data.insurance_type || null,
        policy_number: data.policy_number || null,
      },
    });
  };

  const withDocumentAudit = (data, action) => ({
    ...data,
    document_metadata: data.document_file_url
      ? buildAuditMetadata(currentUser, action, data.document_metadata || {}, auditActors)
      : data.document_metadata || null,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const normalized = withDocumentAudit(withCurrentDocumentDescriptor({
        ...data,
        status: deriveStatus(data),
        valid_until: data.has_no_expiry ? null : data.valid_until || null,
        renewal_notice_date: data.renewal_notice_date || null,
      }), editingId ? "bijgewerkt" : "toegevoegd");
      const payload = {
        company_id: companyId,
        insurance_type: normalized.insurance_type,
        insurance_name: normalized.insurance_name?.trim() || insuranceMeta(normalized.insurance_type).label,
        insurer_name: normalized.insurer_name?.trim(),
        broker_name: normalized.broker_name?.trim() || null,
        policy_number: normalized.policy_number?.trim(),
        coverage_amount: normalized.coverage_amount?.trim() || null,
        deductible_amount: normalized.deductible_amount?.trim() || null,
        valid_from: normalized.valid_from || null,
        valid_until: normalized.has_no_expiry ? null : normalized.valid_until || null,
        has_no_expiry: Boolean(normalized.has_no_expiry),
        renewal_notice_date: normalized.renewal_notice_date || null,
        status: normalized.status,
        required_reason: normalized.required_reason || insuranceMeta(normalized.insurance_type).requiredReason || null,
        document_file_url: normalized.document_file_url || null,
        document_filename: normalized.document_filename || null,
        document_file_id: normalized.document_file_id || null,
        document_download_filename: normalized.document_download_filename || null,
        document_logical_path: normalized.document_logical_path || null,
        document_metadata: normalized.document_metadata || null,
        notes: normalized.notes?.trim() || null,
      };
      const saved = editingId
        ? await base44.entities.CompanyInsurancePolicy.update(editingId, payload)
        : await base44.entities.CompanyInsurancePolicy.create(payload);
      if (saved?.id && normalized.document_file_id) {
        await syncManagedDocumentDescriptor(normalized, saved.id);
      }
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-insurance-policies", companyId] });
      cancelWizard();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CompanyInsurancePolicy.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-insurance-policies", companyId] });
      setDeleteId(null);
    },
  });

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const selectInsurer = (value) => {
    if (value === CUSTOM_PARTY_NEW_VALUE) {
      setCreatingInsurer(true);
      set("insurer_name", "");
      setErrors(current => ({ ...current, insurer_name: undefined }));
      return;
    }

    setCreatingInsurer(false);
    set("insurer_name", value);
    setErrors(current => ({ ...current, insurer_name: undefined }));
  };

  const selectBroker = (value) => {
    if (value === CUSTOM_PARTY_NEW_VALUE) {
      setCreatingBroker(true);
      set("broker_name", "");
      return;
    }

    setCreatingBroker(false);
    set("broker_name", value === CUSTOM_PARTY_NONE_VALUE ? "" : value);
  };

  const selectType = (option) => {
    setForm({
      ...EMPTY_FORM,
      insurance_type: option.key,
      insurance_name: option.key === "other" ? "" : option.label,
      required_reason: option.requiredReason || "",
    });
    setCreatingInsurer(false);
    setCreatingBroker(false);
    setErrors({});
    setStep(2);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setCreatingInsurer(false);
    setCreatingBroker(false);
    setErrors({});
    setStep(1);
    setShowWizard(true);
  };

  const openEdit = (policy) => {
    setEditingId(policy.id);
    setForm({
      insurance_type: policy.insurance_type || "other",
      insurance_name: policy.insurance_name || insuranceMeta(policy.insurance_type).label,
      insurer_name: policy.insurer_name || "",
      broker_name: policy.broker_name || "",
      policy_number: policy.policy_number || "",
      coverage_amount: policy.coverage_amount || "",
      deductible_amount: policy.deductible_amount || "",
      valid_from: policy.valid_from || "",
      valid_until: policy.valid_until || "",
      has_no_expiry: Boolean(policy.has_no_expiry),
      renewal_notice_date: policy.renewal_notice_date || "",
      status: policy.status || "active",
      required_reason: policy.required_reason || insuranceMeta(policy.insurance_type).requiredReason || "",
      document_file_url: policy.document_file_url || "",
      document_filename: policy.document_filename || "",
      document_file_id: policy.document_file_id || "",
      document_download_filename: policy.document_download_filename || "",
      document_logical_path: policy.document_logical_path || "",
      document_metadata: policy.document_metadata || null,
      notes: policy.notes || "",
    });
    setCreatingInsurer(false);
    setCreatingBroker(false);
    setErrors({});
    setStep(2);
    setShowWizard(true);
  };

  const cancelWizard = () => {
    setShowWizard(false);
    setEditingId(null);
    setStep(1);
    setForm(EMPTY_FORM);
    setCreatingInsurer(false);
    setCreatingBroker(false);
    setErrors({});
  };

  const validateStep2 = () => {
    const nextErrors = {};
    if (!form.insurance_type) nextErrors.insurance_type = "Kies een verzekering.";
    if (!form.insurance_name?.trim()) nextErrors.insurance_name = "Naam is verplicht.";
    if (!form.insurer_name?.trim()) nextErrors.insurer_name = "Verzekeraar is verplicht.";
    if (!form.policy_number?.trim()) nextErrors.policy_number = "Polisnummer is verplicht.";
    if (!form.valid_from) nextErrors.valid_from = "Ingangsdatum is verplicht.";
    if (!form.has_no_expiry && !form.valid_until) nextErrors.valid_until = "Einddatum is verplicht.";
    if (form.valid_from && form.valid_until && form.valid_until <= form.valid_from) {
      nextErrors.valid_until = "Einddatum moet later zijn dan ingangsdatum.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadManagedFile({
        file,
        ownerType: "company",
        ownerId: companyId,
        companyId,
        ownerLabel: company?.display_name || company?.legal_name || "Bedrijf",
        domain: "compliance",
        category: "company_insurance_policy",
        sourceEntity: "CompanyInsurancePolicy",
        sourceEntityId: editingId || null,
        sourceField: "document_file_url",
        documentLabel: form.insurance_name || insuranceMeta(form.insurance_type).label,
        documentNumber: form.policy_number || null,
        validFrom: form.valid_from || null,
        validUntil: form.has_no_expiry ? null : form.valid_until || null,
        isSensitive: true,
        folderSegments: ["verzekeringen", form.insurance_type || "overig", form.valid_until ? form.valid_until.slice(0, 4) : "doorlopend"],
        metadata: { insurance_type: form.insurance_type || null, policy_number: form.policy_number || null },
        uploadedBy: currentUser,
        auditActors,
        auditAction: editingId ? "bijgewerkt" : "toegevoegd",
      });
      const nextMetadata = buildAuditMetadata(currentUser, editingId ? "bijgewerkt" : "toegevoegd", {
        managed_file_id: result.managed_file_id,
        folder_path: result.folder_path,
      }, auditActors);
      setForm(current => ({
        ...current,
        document_file_url: result.file_url,
        document_filename: result.download_filename,
        document_file_id: result.managed_file_id,
        document_download_filename: result.download_filename,
        document_logical_path: result.logical_path,
        document_metadata: nextMetadata,
      }));
    } finally {
      setUploading(false);
    }
  };

  const activePolicies = policies.filter(policy => !isArchived(policy));
  const archivedPolicies = policies.filter(isArchived);
  const visiblePolicies = showArchive ? archivedPolicies : activePolicies;
  const policyToDelete = policies.find(policy => policy.id === deleteId);
  const currentFormDocument = withCurrentDocumentDescriptor(form);
  const currentDocumentName = currentFormDocument.document_download_filename || currentFormDocument.document_filename || "Polisblad toegevoegd";

  return (
    <div className="flex h-full flex-col">
      <AnimatePresence>
        {deleteId && policyToDelete && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
            <DeleteConfirmBar
              label={policyToDelete.insurance_name || insuranceMeta(policyToDelete.insurance_type).label}
              onConfirm={() => deleteMutation.mutate(deleteId)}
              onCancel={() => setDeleteId(null)}
              isPending={deleteMutation.isPending}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showWizard && (
          <motion.div
            ref={wizardRef}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="border-b border-primary/30 bg-muted/20 p-5"
          >
            {editingId && <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">Verzekering bewerken</p>}
            {!editingId && <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">Nieuwe verzekering</p>}
            <WizardSteps step={step} />

            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: "easeOut" }}>
                {step === 1 && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Kies het soort verzekering</p>
                      <p className="mt-1 text-xs text-muted-foreground">Begin met de polis die het bedrijf aantoonbaar heeft afgesloten.</p>
                    </div>
                    {Object.entries(groupedOptions).map(([group, options]) => (
                      <div key={group} className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
                        <div className="grid grid-cols-1 gap-2">
                          {options.map(option => (
                            <InsuranceTypeOption
                              key={option.key}
                              option={option}
                              relevant={option.relevant}
                              selected={form.insurance_type === option.key}
                              onClick={() => selectType(option)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    {errors.insurance_type && <p className="text-xs text-destructive">{errors.insurance_type}</p>}
                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-4">
                    <p className="text-sm font-medium text-foreground">
                      Polisgegevens <span className="font-normal text-muted-foreground">- {form.insurance_name || insuranceMeta(form.insurance_type).label}</span>
                    </p>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                      {form.insurance_type === "other" && (
                        <div className="space-y-1 lg:col-span-2">
                          <Label>Naam verzekering</Label>
                          <Input
                            className={`h-8 ${errors.insurance_name ? "border-destructive" : ""}`}
                            value={form.insurance_name}
                            onChange={event => { set("insurance_name", event.target.value); setErrors(current => ({ ...current, insurance_name: undefined })); }}
                          />
                          {errors.insurance_name && <p className="text-xs text-destructive">{errors.insurance_name}</p>}
                        </div>
                      )}
                      <div className="space-y-1 lg:col-span-2">
                        <InsurancePartySelectField
                          label="Verzekeraar"
                          value={form.insurer_name}
                          options={insurerOptions}
                          creating={creatingInsurer}
                          required
                          placeholder="Kies verzekeraar"
                          newLabel="Nieuwe verzekeraar toevoegen"
                          customPlaceholder="Naam verzekeraar"
                          help="Gebruik de verzekeraar die op de polis staat."
                          error={errors.insurer_name}
                          onSelect={selectInsurer}
                          onCustomChange={value => {
                            set("insurer_name", value);
                            setErrors(current => ({ ...current, insurer_name: undefined }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Polisnummer</Label>
                        <Input
                          className={`h-8 ${errors.policy_number ? "border-destructive" : ""}`}
                          value={form.policy_number}
                          onChange={event => { set("policy_number", event.target.value); setErrors(current => ({ ...current, policy_number: undefined })); }}
                          placeholder="Verplicht"
                        />
                        {errors.policy_number && <p className="text-xs text-destructive">{errors.policy_number}</p>}
                      </div>
                      <div className="space-y-1">
                        <InsurancePartySelectField
                          label="Tussenpersoon"
                          value={form.broker_name}
                          options={brokerOptions}
                          creating={creatingBroker}
                          placeholder="Kies tussenpersoon"
                          emptyLabel="Geen tussenpersoon"
                          newLabel="Nieuwe tussenpersoon toevoegen"
                          customPlaceholder="Naam tussenpersoon"
                          help="Optioneel: adviseur of intermediair die de polis beheert."
                          onSelect={selectBroker}
                          onCustomChange={value => set("broker_name", value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Geldig vanaf</Label>
                        <Input
                          type="date"
                          className={`h-8 ${errors.valid_from ? "border-destructive" : ""}`}
                          value={form.valid_from}
                          onChange={event => { set("valid_from", event.target.value); setErrors(current => ({ ...current, valid_from: undefined })); }}
                        />
                        {errors.valid_from && <p className="text-xs text-destructive">{errors.valid_from}</p>}
                      </div>
                      <div className="space-y-1">
                        <Label>Geldig tot</Label>
                        <Input
                          type="date"
                          className={`h-8 ${errors.valid_until ? "border-destructive" : ""}`}
                          value={form.valid_until}
                          onChange={event => { set("valid_until", event.target.value); setErrors(current => ({ ...current, valid_until: undefined })); }}
                          disabled={form.has_no_expiry}
                        />
                        {errors.valid_until && <p className="text-xs text-destructive">{errors.valid_until}</p>}
                      </div>
                      <div className="flex items-center gap-2 pt-6">
                        <Checkbox
                          id="insurance-no-expiry"
                          checked={form.has_no_expiry}
                          onCheckedChange={checked => {
                            set("has_no_expiry", Boolean(checked));
                            if (checked) set("valid_until", "");
                            setErrors(current => ({ ...current, valid_until: undefined }));
                          }}
                        />
                        <Label htmlFor="insurance-no-expiry" className="text-xs font-normal text-muted-foreground">Geen vaste einddatum</Label>
                      </div>
                      <div className="space-y-1">
                        <Label>Controle datum</Label>
                        <Input type="date" className="h-8" value={form.renewal_notice_date} onChange={event => set("renewal_notice_date", event.target.value)} />
                      </div>
                      <div className="space-y-1 lg:col-span-2">
                        <Label>Dekking</Label>
                        <Input className="h-8" value={form.coverage_amount} onChange={event => set("coverage_amount", event.target.value)} placeholder="Bijv. EUR 2.500.000 per gebeurtenis" />
                      </div>
                      <div className="space-y-1 lg:col-span-2">
                        <Label>Eigen risico</Label>
                        <Input className="h-8" value={form.deductible_amount} onChange={event => set("deductible_amount", event.target.value)} placeholder="Optioneel" />
                      </div>
                      <div className="space-y-1 lg:col-span-4">
                        <Label>Interne notitie <span className="font-normal text-muted-foreground">(optioneel)</span></Label>
                        <Textarea
                          value={form.notes}
                          onChange={event => set("notes", event.target.value)}
                          placeholder="Bijv. opdrachtgever vereist deze dekking of polis loopt via tussenpersoon."
                          className="min-h-[74px] text-sm"
                        />
                      </div>
                    </div>
                    {form.required_reason && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{form.required_reason}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1">
                      {editingId ? (
                        <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => { setStep(1); setErrors({}); }}>
                          <ChevronLeft className="mr-1 h-4 w-4" /> Terug
                        </Button>
                      )}
                      <Button size="sm" onClick={() => { if (validateStep2()) setStep(3); }}>
                        Volgende <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-start gap-3">
                        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{form.insurance_name || insuranceMeta(form.insurance_type).label}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {[form.insurer_name, form.policy_number && `Polis ${form.policy_number}`, validityText(form)].filter(Boolean).join(" - ")}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-card p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">Polisblad of verzekeringsbewijs</p>
                          <p className="mt-1 text-xs text-muted-foreground">Zonder polisblad wordt de verzekering opgeslagen als actiepunt.</p>
                        </div>
                        <label className="inline-flex h-8 cursor-pointer items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                          <Upload className="mr-1.5 h-3.5 w-3.5" />
                          {uploading ? "Uploaden..." : "Uploaden"}
                          <input
                            type="file"
                            accept=".pdf,image/*,.doc,.docx"
                            className="sr-only"
                            disabled={uploading}
                            onChange={event => handleUpload(event.target.files?.[0])}
                          />
                        </label>
                      </div>
                      {form.document_file_url ? (
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate text-sm font-medium text-foreground">{currentDocumentName}</span>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => setPreview(currentFormDocument)}>
                            <Eye className="mr-1 h-3.5 w-3.5" /> Bekijken
                          </Button>
                        </div>
                      ) : (
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                          Er is nog geen polisblad gekoppeld. Opslaan kan wel, maar de tab blijft als actiepunt zichtbaar.
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between pt-1">
                      <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                        <ChevronLeft className="mr-1 h-4 w-4" /> Terug
                      </Button>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                        <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || uploading}>
                          <Check className="mr-1 h-4 w-4" />
                          {saveMutation.isPending ? "Opslaan..." : "Verzekering opslaan"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="overflow-x-auto border-b border-border bg-muted/30">
        <div className={`${INSURANCE_TABLE_GRID} min-w-[920px] items-center px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
          <span className="min-w-0 truncate">Verzekering</span>
          <span className="min-w-0 truncate">Verzekeraar</span>
          <span className="min-w-0 truncate">Status</span>
          <span className="min-w-0 truncate">Geldigheid</span>
          <span className="min-w-0 truncate">Door</span>
          <div className="flex min-w-0 justify-end gap-2">
            {archivedPolicies.length > 0 && (
              <Button size="sm" variant={showArchive ? "secondary" : "outline"} onClick={() => setShowArchive(current => !current)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                <Archive className="mr-1 h-3 w-3" /> {showArchive ? "Actief" : `Archief (${archivedPolicies.length})`}
              </Button>
            )}
            {!showWizard && !deleteId && (
              <Button size="sm" variant="outline" onClick={openNew} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                <Plus className="mr-1 h-3 w-3" /> Nieuwe verzekering
              </Button>
            )}
          </div>
        </div>
      </div>

      {visiblePolicies.length === 0 && !showWizard && (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          {showArchive ? "Geen verzekeringen in het archief." : "Nog geen verzekeringen geregistreerd."}
        </p>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[920px] divide-y divide-border">
          {visiblePolicies.map(policy => {
            const meta = insuranceMeta(policy.insurance_type);
            const effectiveStatus = deriveStatus(policy);
            const hasAction = effectiveStatus === "action_required" || effectiveStatus === "expired";
            return (
              <div key={policy.id} className={`${INSURANCE_TABLE_GRID} group items-center px-4 py-3 transition-colors hover:bg-accent/30`}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${
                    hasAction ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300" : "border-border bg-muted/40 text-muted-foreground"
                  }`}>
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{policy.insurance_name || meta.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[meta.label !== policy.insurance_name ? meta.label : null, policy.policy_number && `Polis ${policy.policy_number}`].filter(Boolean).join(" - ")}
                    </p>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{policy.insurer_name || "-"}</p>
                  {policy.broker_name && <p className="truncate text-xs text-muted-foreground">{policy.broker_name}</p>}
                </div>
                <div className="min-w-0">
                  <Badge className={STATUS_CLASSES[effectiveStatus] || STATUS_CLASSES.active}>
                    {STATUS_LABELS[effectiveStatus] || effectiveStatus}
                  </Badge>
                </div>
                <div className="min-w-0 text-sm text-muted-foreground">
                  <span className="block truncate">{validityText(policy)}</span>
                  {policy.renewal_notice_date && <span className="block truncate text-xs">Controle: {policy.renewal_notice_date}</span>}
                </div>
                <span className="min-w-0 truncate text-sm text-muted-foreground">{getAuditActorLabel(policy, auditActors)}</span>
                <div className="flex min-w-0 justify-end gap-1">
                  {policy.document_file_url && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreview(policy)} title="Polisblad bekijken">
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(policy)} title="Bewerken">
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteId(policy.id)} title="Verwijderen">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ManagedFilePreviewDialog
        open={!!preview}
        onOpenChange={(open) => !open && setPreview(null)}
        managedFileId={preview?.document_file_id}
        fileUrl={preview?.document_file_url}
        filename={preview?.document_download_filename || preview?.document_filename || "Polisblad"}
        title="Polisblad bekijken"
        description={preview?.insurance_name || null}
      />
    </div>
  );
}
