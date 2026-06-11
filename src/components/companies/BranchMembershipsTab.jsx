import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Edit, Eye, FileText, Plus, Trash2, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import ManagedFilePreviewDialog from "@/components/files/ManagedFilePreviewDialog";
import { updateManagedFileSource, uploadManagedFile } from "@/lib/managedFiles";

const DELETE_PASSWORD = "verwijder";

const ASSOCIATION_OPTIONS = [
  {
    key: "nederlandse_veiligheidsbranche",
    label: "Nederlandse Veiligheidsbranche",
    shortLabel: "NVB",
    desc: "Particuliere beveiliging, EHB, GWT, PAC en POB",
    logoUrl: "https://d1p3jfjj2ztqji.cloudfront.net/wp-content/uploads/2019/12/06115338/logo-nvb-300x136.jpg",
  },
  {
    key: "vereniging_veiligheidsdomein_nederland",
    label: "Vereniging Veiligheidsdomein Nederland (VVNL)",
    shortLabel: "VVNL",
    desc: "Reguliere beveiliging, horeca/evenementen, verkeersregelaars, brandwachten en alarmdiensten",
    logoUrl: "https://veiligheidsdomein.nl/wp-content/uploads/2022/07/VVNL_Logo_Blauw_L-300x162.png",
  },
  {
    key: "veb",
    label: "Vereniging Erkende Beveiligingsbedrijven (VEB)",
    shortLabel: "VEB",
    desc: "Technische beveiligingsbedrijven, particuliere beveiligingsorganisaties en PAC",
    logoUrl: "https://veb.nl/wp-content/uploads/2024/10/VEB-Logo.png",
  },
  {
    key: "bpob",
    label: "Branchevereniging Particuliere Onderzoeksbureaus (BPOB)",
    shortLabel: "BPOB",
    desc: "Particuliere onderzoeksbureaus en recherchewerkzaamheden",
    logoUrl: "https://bpob.nl/wp-content/uploads/2024/10/BPOB_afkorting_Kleur_versie_1-300x139.png",
  },
  {
    key: "techniek_nederland",
    label: "Techniek Nederland",
    shortLabel: "TN",
    desc: "Brand- en beveiligingstechniek en technische installatiebedrijven",
    logoUrl: "https://www.technieknederland.nl/media/quvnnxsy/logo-techniek-nederland.svg",
  },
  {
    key: "nvb_bhv",
    label: "Nederlandse Vereniging Bedrijfshulpverlening (NVB-BHV)",
    shortLabel: "BHV",
    desc: "BHV-organisaties, BHV-opleiders en BHV-instructeurs",
    logoUrl: "https://nvb-bhv.nl/wp-content/themes/nvb/img/nvb_logo.svg",
  },
  {
    key: "other",
    label: "Andere branchevereniging",
    shortLabel: "Anders",
    desc: "Gebruik dit voor een eigen vereniging of niche-brancheorganisatie",
  },
];

const EMPTY_FORM = {
  association_type: "",
  association_name: "",
  membership_number: "",
  membership_type: "",
  member_since: "",
  valid_until: "",
  status: "active",
  public_profile_url: "",
  document_file_url: "",
  document_filename: "",
  document_file_id: "",
  document_download_filename: "",
  document_logical_path: "",
  document_metadata: null,
  notes: "",
};

function associationLabel(value) {
  return ASSOCIATION_OPTIONS.find(option => option.key === value)?.label || value || "Branchevereniging";
}

function associationMeta(value) {
  return ASSOCIATION_OPTIONS.find(option => option.key === value) || {
    key: value || "other",
    label: value || "Branchevereniging",
    shortLabel: "Org",
    desc: "",
  };
}

function effectiveAssociationName(membership) {
  return membership.association_name || associationLabel(membership.association_type);
}

function AssociationLogo({ associationType, className = "" }) {
  const [failed, setFailed] = useState(false);
  const association = associationMeta(associationType);
  const fallback = association.shortLabel || association.label?.slice(0, 3) || "Org";

  if (!association.logoUrl || failed) {
    return (
      <div className={`flex items-center justify-center rounded-md border border-border bg-muted text-[10px] font-semibold text-muted-foreground ${className}`}>
        {fallback}
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center rounded-md border border-border bg-white p-1 ${className}`}>
      <img
        src={association.logoUrl}
        alt={`${association.label} logo`}
        className="max-h-full max-w-full object-contain"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function isExpired(membership) {
  const today = new Date().toISOString().split("T")[0];
  return membership.valid_until && membership.valid_until < today;
}

function StatusBadge({ membership }) {
  if (membership.status === "cancelled") return <Badge variant="outline" className="text-xs text-muted-foreground">Beeindigd</Badge>;
  if (membership.status === "pending_review") return <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">Controle</Badge>;
  if (membership.status === "expired" || isExpired(membership)) return <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">Verlopen</Badge>;
  return <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200 border-0">Actief</Badge>;
}

function WizardSteps({ step }) {
  const steps = ["Vereniging", "Gegevens", "Bewijs"];
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
    if (password !== DELETE_PASSWORD) {
      setError(`Typ "${DELETE_PASSWORD}" om te bevestigen`);
      return;
    }
    onConfirm();
  };

  return (
    <div className="border-b border-destructive/20 bg-destructive/5 p-4">
      <div className="flex items-start gap-3 mb-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground">Branchevereniging verwijderen?</p>
          <p className="text-xs text-muted-foreground mt-0.5"><strong>{label}</strong> wordt verwijderd.</p>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground block">Typ <strong className="text-foreground font-mono">{DELETE_PASSWORD}</strong> om te bevestigen:</label>
        <div className="flex gap-2">
          <Input value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} placeholder={DELETE_PASSWORD} className={`h-8 text-sm font-mono max-w-[200px] ${error ? "border-destructive" : ""}`} onKeyDown={(event) => event.key === "Enter" && handleConfirm()} autoFocus />
          <Button variant="destructive" size="sm" onClick={handleConfirm} disabled={isPending}><Trash2 className="w-3.5 h-3.5 mr-1" />{isPending ? "Verwijderen..." : "Verwijderen"}</Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Annuleren</Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

export default function BranchMembershipsTab({ companyId, company }) {
  const queryClient = useQueryClient();
  const wizardRef = useRef(null);
  const [showWizard, setShowWizard] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [deleteId, setDeleteId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!showWizard) return undefined;
    const timer = setTimeout(() => wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    return () => clearTimeout(timer);
  }, [step, showWizard]);

  const { data: memberships = [] } = useQuery({
    queryKey: ["company-branch-memberships", companyId],
    queryFn: () => base44.entities.CompanyBranchMembership.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        ...data,
        company_id: companyId,
        association_name: data.association_name?.trim() || associationLabel(data.association_type),
        membership_number: data.membership_number?.trim() || null,
        membership_type: data.membership_type?.trim() || null,
        member_since: data.member_since || null,
        valid_until: data.valid_until || null,
        public_profile_url: data.public_profile_url?.trim() || null,
        document_file_url: data.document_file_url || null,
        document_filename: data.document_filename || null,
        document_file_id: data.document_file_id || null,
        document_download_filename: data.document_download_filename || null,
        document_logical_path: data.document_logical_path || null,
        document_metadata: data.document_metadata || null,
        notes: data.notes?.trim() || null,
      };
      const saved = editingId
        ? await base44.entities.CompanyBranchMembership.update(editingId, payload)
        : await base44.entities.CompanyBranchMembership.create(payload);
      if (saved?.id && data.document_file_id) {
        await updateManagedFileSource(data.document_file_id, {
          owner_id: companyId,
          company_id: companyId,
          source_entity_id: saved.id,
        });
      }
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-branch-memberships", companyId] });
      cancelWizard();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CompanyBranchMembership.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-branch-memberships", companyId] });
      setDeleteId(null);
    },
  });

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const selectAssociation = (association) => {
    setForm({
      ...EMPTY_FORM,
      association_type: association.key,
      association_name: association.key === "other" ? "" : association.label,
    });
    setErrors({});
    setStep(2);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setStep(1);
    setShowWizard(true);
  };

  const openEdit = (membership) => {
    setEditingId(membership.id);
    setForm({
      association_type: membership.association_type || "other",
      association_name: membership.association_name || associationLabel(membership.association_type),
      membership_number: membership.membership_number || "",
      membership_type: membership.membership_type || "",
      member_since: membership.member_since || "",
      valid_until: membership.valid_until || "",
      status: membership.status || "active",
      public_profile_url: membership.public_profile_url || "",
      document_file_url: membership.document_file_url || "",
      document_filename: membership.document_filename || "",
      document_file_id: membership.document_file_id || "",
      document_download_filename: membership.document_download_filename || "",
      document_logical_path: membership.document_logical_path || "",
      document_metadata: membership.document_metadata || null,
      notes: membership.notes || "",
    });
    setErrors({});
    setStep(2);
    setShowWizard(true);
  };

  const cancelWizard = () => {
    setShowWizard(false);
    setEditingId(null);
    setStep(1);
    setForm(EMPTY_FORM);
    setErrors({});
    setPreview(null);
  };

  const validateStep2 = () => {
    const nextErrors = {};
    if (!form.association_type) nextErrors.association_type = "Kies een branchevereniging.";
    if (!form.association_name?.trim()) nextErrors.association_name = "Naam is verplicht.";
    if (form.member_since && form.valid_until && form.valid_until <= form.member_since) {
      nextErrors.valid_until = "Geldig tot moet later zijn dan lid sinds.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleUpload = async (file) => {
    setUploading(true);
    try {
      const validYear = form.valid_until ? form.valid_until.slice(0, 4) : "zonder-einddatum";
      const result = await uploadManagedFile({
        file,
        ownerType: "company",
        ownerId: companyId,
        companyId,
        ownerLabel: company?.display_name || company?.legal_name || "Bedrijf",
        domain: "compliance",
        category: "company_branch_membership",
        sourceEntity: "CompanyBranchMembership",
        sourceEntityId: editingId || null,
        sourceField: "document_file_url",
        documentLabel: form.association_name || associationLabel(form.association_type),
        documentNumber: form.membership_number || null,
        validFrom: form.member_since || null,
        validUntil: form.valid_until || null,
        isSensitive: true,
        folderSegments: ["brancheverenigingen", form.association_type || "onbekend", validYear],
        metadata: {
          association_type: form.association_type || null,
          membership_number: form.membership_number || null,
        },
      });
      setForm(current => ({
        ...current,
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

  const membershipToDelete = memberships.find(membership => membership.id === deleteId);

  return (
    <div className="flex flex-col h-full">
      <AnimatePresence>
        {deleteId && membershipToDelete && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
            <DeleteConfirmBar
              label={effectiveAssociationName(membershipToDelete)}
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
            {editingId && <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">Branchevereniging bewerken</p>}
            {!editingId && <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">Nieuwe branchevereniging</p>}
            <WizardSteps step={step} />
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: "easeOut" }}>
                {step === 1 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-foreground">Kies de branchevereniging</p>
                    <div className="grid grid-cols-1 gap-2">
                      {ASSOCIATION_OPTIONS.map(association => (
                        <button
                          key={association.key}
                          type="button"
                          onClick={() => selectAssociation(association)}
                          className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99] ${
                            form.association_type === association.key ? "border-primary bg-accent" : "border-border bg-card"
                          }`}
                        >
                          <AssociationLogo associationType={association.key} className="mr-3 h-12 w-20 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-semibold text-foreground">{association.label}</span>
                            <span className="block text-xs text-muted-foreground mt-0.5">{association.desc}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                    {errors.association_type && <p className="text-xs text-destructive">{errors.association_type}</p>}
                    <div className="flex justify-end pt-1">
                      <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-foreground">
                      Lidmaatschapsgegevens <span className="text-muted-foreground font-normal">- {form.association_name || associationLabel(form.association_type)}</span>
                    </p>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                      {form.association_type === "other" && (
                        <div className="space-y-1 lg:col-span-2">
                          <Label>Naam branchevereniging</Label>
                          <Input
                            className={`h-8 ${errors.association_name ? "border-destructive" : ""}`}
                            value={form.association_name}
                            onChange={event => { set("association_name", event.target.value); setErrors(current => ({ ...current, association_name: undefined })); }}
                            placeholder="Naam van de branchevereniging"
                          />
                          {errors.association_name && <p className="text-xs text-destructive">{errors.association_name}</p>}
                        </div>
                      )}
                      <div className="space-y-1">
                        <Label>Lidnummer</Label>
                        <Input className="h-8" value={form.membership_number} onChange={event => set("membership_number", event.target.value)} placeholder="Optioneel" />
                      </div>
                      <div className="space-y-1">
                        <Label>Lidmaatschapstype</Label>
                        <Input className="h-8" value={form.membership_type} onChange={event => set("membership_type", event.target.value)} placeholder="Bijv. lid, aspirant, partner" />
                      </div>
                      <div className="space-y-1">
                        <Label>Status</Label>
                        <Select value={form.status} onValueChange={value => set("status", value)}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Actief</SelectItem>
                            <SelectItem value="pending_review">Te controleren</SelectItem>
                            <SelectItem value="expired">Verlopen</SelectItem>
                            <SelectItem value="cancelled">Beeindigd</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Lid sinds</Label>
                        <Input className="h-8" type="date" value={form.member_since} onChange={event => { set("member_since", event.target.value); setErrors(current => ({ ...current, valid_until: undefined })); }} />
                      </div>
                      <div className="space-y-1">
                        <Label>Geldig tot / hercontrole</Label>
                        <Input className={`h-8 ${errors.valid_until ? "border-destructive" : ""}`} type="date" value={form.valid_until} onChange={event => { set("valid_until", event.target.value); setErrors(current => ({ ...current, valid_until: undefined })); }} />
                        {errors.valid_until && <p className="text-xs text-destructive">{errors.valid_until}</p>}
                      </div>
                      <div className="space-y-1 lg:col-span-2">
                        <Label>Publieke ledenpagina</Label>
                        <Input className="h-8" value={form.public_profile_url} onChange={event => set("public_profile_url", event.target.value)} placeholder="https://..." />
                      </div>
                      <div className="space-y-1 lg:col-span-4">
                        <Label>Notities</Label>
                        <Textarea value={form.notes} onChange={event => set("notes", event.target.value)} rows={2} placeholder="Interne opmerkingen, contactpersoon of controle-informatie" />
                      </div>
                    </div>
                    <div className="flex justify-between pt-1">
                      {editingId ? (
                        <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => { setStep(1); setErrors({}); }}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                      )}
                      <Button size="sm" onClick={() => { if (validateStep2()) setStep(3); }}>Volgende <ChevronRight className="w-4 h-4 ml-1" /></Button>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-4">
                    <p className="text-sm font-medium text-foreground">Bewijsstuk of ledenbewijs</p>
                    <p className="text-xs text-muted-foreground">Upload optioneel een ledenbewijs, bevestigingsmail, certificaat of schermafbeelding van de ledenpagina.</p>

                    {form.document_file_url ? (
                      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
                        <FileText className="w-4 h-4 shrink-0 text-blue-600" />
                        <span className="flex-1 truncate text-sm text-muted-foreground">{form.document_download_filename || form.document_filename || "Document toegevoegd"}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setPreview(form)} className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700">
                          <Eye className="w-3.5 h-3.5" /> Bekijken
                        </Button>
                        <button type="button" onClick={() => setForm(current => ({ ...current, document_file_url: "", document_filename: "", document_file_id: "", document_download_filename: "", document_logical_path: "", document_metadata: null }))} className="text-muted-foreground hover:text-destructive">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 transition-colors hover:border-primary">
                        <input type="file" accept=".pdf,image/*" className="hidden" onChange={event => event.target.files?.[0] && handleUpload(event.target.files[0])} />
                        <Upload className="w-6 h-6 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{uploading ? "Uploaden..." : "Klik om bewijs te uploaden"}</span>
                        <span className="text-xs text-muted-foreground">PDF of afbeelding</span>
                      </label>
                    )}

                    <div className="rounded-lg border border-border bg-card p-4 text-sm">
                      <div className="flex items-center gap-3">
                        <AssociationLogo associationType={form.association_type} className="h-12 w-20 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-muted-foreground block mb-1">Branchevereniging</span>
                          <span className="font-medium text-foreground">{form.association_name || associationLabel(form.association_type)}</span>
                          {(form.membership_number || form.membership_type) && (
                            <p className="mt-1 text-xs text-muted-foreground">{[form.membership_number && `Lidnummer ${form.membership_number}`, form.membership_type].filter(Boolean).join(" - ")}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between pt-1">
                      <Button variant="ghost" size="sm" onClick={() => setStep(2)}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                        <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
                          <Check className="w-4 h-4 mr-1" /> {saveMutation.isPending ? "Opslaan..." : (editingId ? "Wijzigingen opslaan" : "Lidmaatschap opslaan")}
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

      <div className="flex items-center px-4 py-2 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="flex-1">Branchevereniging</span>
        <span className="w-28 shrink-0">Status</span>
        <span className="w-40 shrink-0">Lidnummer</span>
        <span className="w-44 shrink-0">Lidmaatschap</span>
        <div className="w-40 shrink-0 flex justify-end">
          {!showWizard && !deleteId && (
            <Button size="sm" variant="outline" onClick={openNew} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
              <Plus className="w-3 h-3 mr-1" /> Nieuwe vereniging
            </Button>
          )}
        </div>
      </div>

      {memberships.length === 0 && !showWizard && (
        <p className="px-4 py-3 text-sm text-muted-foreground">Nog geen branchevereniging geregistreerd.</p>
      )}

      <div className="divide-y divide-border">
        {memberships.map(membership => (
          <div key={membership.id} className="flex items-center px-4 py-3 group hover:bg-accent/30 transition-colors">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <AssociationLogo associationType={membership.association_type} className="h-10 w-16 shrink-0" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{effectiveAssociationName(membership)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[membership.membership_type, membership.public_profile_url].filter(Boolean).join(" - ") || associationLabel(membership.association_type)}
                </p>
              </div>
            </div>
            <div className="w-28 shrink-0"><StatusBadge membership={membership} /></div>
            <div className="w-40 shrink-0 text-sm text-muted-foreground">{membership.membership_number || "-"}</div>
            <div className="w-44 shrink-0 text-xs text-muted-foreground">
              {[membership.member_since && `Sinds ${membership.member_since}`, membership.valid_until && `Tot ${membership.valid_until}`].filter(Boolean).join("  ") || "Geen einddatum"}
            </div>
            <div className="flex w-40 shrink-0 justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {membership.document_file_url && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreview(membership)} title="Document bekijken"><Eye className="h-3.5 w-3.5" /></Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(membership)} title="Bewerken"><Edit className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteId(membership.id)} title="Verwijderen"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        ))}
      </div>

      <ManagedFilePreviewDialog
        open={!!preview}
        onOpenChange={(open) => { if (!open) setPreview(null); }}
        managedFileId={preview?.document_file_id}
        fileUrl={preview?.document_file_url}
        filename={preview?.document_download_filename || preview?.document_filename || "Document"}
        title="Ledenbewijs bekijken"
      />
    </div>
  );
}
