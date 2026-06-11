import React, { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Archive, Check, ChevronLeft, ChevronRight, Edit, Eye, FileText, Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import ManagedFilePreviewDialog from "@/components/files/ManagedFilePreviewDialog";
import { TECHNICAL_ACCREDITATION_OPTIONS } from "@/lib/teamhubServiceRules";
import { updateManagedFileSource, uploadManagedFile } from "@/lib/managedFiles";

const DELETE_PASSWORD = "verwijder";
// Header and rows share this grid so status, validity, and actions cannot drift out of alignment.
const ACCREDITATION_TABLE_GRID = "grid grid-cols-[minmax(160px,180px)_minmax(260px,1fr)_minmax(112px,132px)_minmax(160px,190px)_minmax(240px,360px)] gap-4";

const CATEGORY_OPTIONS = [
  { key: "technical_certification", label: "Technische erkenning" },
  { key: "quality_mark", label: "Kwaliteitscertificaat" },
  { key: "other", label: "Overig" },
];

const QUALITY_OPTIONS = [
  { key: "iso_9001", label: "ISO 9001" },
  { key: "iso_27001", label: "ISO 27001" },
  { key: "vca", label: "VCA" },
  { key: "veb_pbo_kwaliteitsregeling", label: "VEB PBO Kwaliteitsregeling" },
  { key: "nvb_keurmerk_beveiliging", label: "Nederlandse Veiligheidsbranche Keurmerk Beveiliging" },
  { key: "nvb_keurmerk_evenementenbeveiliging", label: "Nederlandse Veiligheidsbranche Keurmerk Evenementenbeveiliging" },
  { key: "nvb_keurmerk_horecabeveiliging", label: "Nederlandse Veiligheidsbranche Keurmerk Horecabeveiliging" },
  { key: "nvb_keurmerk_gwt", label: "Nederlandse Veiligheidsbranche Keurmerk GWT" },
  { key: "nvb_keurmerk_pob", label: "Nederlandse Veiligheidsbranche Keurmerk POB" },
  { key: "vvnl_kwaliteitslabel_regulier", label: "VVNL Kwaliteitslabel Reguliere beveiliging" },
  { key: "vvnl_kwaliteitslabel_ehb", label: "VVNL Kwaliteitslabel Evenementen-/horecabeveiliging" },
  { key: "vvnl_kwaliteitslabel_verkeersregelaars", label: "VVNL Kwaliteitslabel Verkeersregelaars" },
  { key: "bpob_keurmerk_particulier_onderzoeksbureau", label: "BPOB Keurmerk Particulier Onderzoeksbureau" },
  { key: "nvb_bhv_opleidingsinstituut", label: "NVB-BHV Opleidingsinstituut / instructeursregistratie" },
  { key: "other", label: "Ander kwaliteitscertificaat" },
];

const OTHER_OPTIONS = [
  { key: "other", label: "Overige erkenning of certificering" },
];

const OPTIONS_BY_CATEGORY = {
  technical_certification: TECHNICAL_ACCREDITATION_OPTIONS,
  quality_mark: QUALITY_OPTIONS,
  other: OTHER_OPTIONS,
};

const EMPTY_FORM = {
  category: "technical_certification",
  accreditation_type: "borg_e",
  name: "BORG-E elektronische inbraakbeveiliging",
  issuer: "",
  certificate_number: "",
  valid_from: "",
  valid_until: "",
  status: "active",
  document_file_url: "",
  document_filename: "",
  document_file_id: "",
  document_download_filename: "",
  document_logical_path: "",
  document_metadata: null,
  notes: "",
};

function optionLabel(category, value) {
  return (OPTIONS_BY_CATEGORY[category] || [])
    .find(o => o.key === value)?.label || value || "Erkenning";
}

function categoryLabel(category) {
  return CATEGORY_OPTIONS.find(o => o.key === category)?.label || category || "Erkenning";
}

function isActionItem(item) {
  const today = new Date().toISOString().split("T")[0];
  return item.status === "expired" || item.status === "pending_review" ||
    (item.valid_until && item.valid_until < today);
}

function statusBadge(item) {
  const today = new Date().toISOString().split("T")[0];
  const expiredByDate = item.valid_until && item.valid_until < today;
  if (item.status === "suspended") return <Badge variant="outline" className="text-xs text-destructive border-destructive/40">Geschorst</Badge>;
  if (item.status === "pending_review") return <Badge className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-0">Actie nodig</Badge>;
  if (item.status === "expired" || expiredByDate) return <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">Verlopen</Badge>;
  return <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200 border-0">Actief</Badge>;
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
          <p className="text-sm font-semibold text-foreground">Erkenning verwijderen?</p>
          <p className="text-xs text-muted-foreground mt-0.5"><strong>{label}</strong> wordt verwijderd.</p>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground block">Typ <strong className="text-foreground font-mono">{DELETE_PASSWORD}</strong> om te bevestigen:</label>
        <div className="flex gap-2">
          <Input value={password} onChange={e => { setPassword(e.target.value); setError(""); }} placeholder={DELETE_PASSWORD} className={`h-8 text-sm font-mono max-w-[200px] ${error ? "border-destructive" : ""}`} onKeyDown={e => e.key === "Enter" && handleConfirm()} autoFocus />
          <Button variant="destructive" size="sm" onClick={handleConfirm} disabled={isPending}><Trash2 className="w-3.5 h-3.5 mr-1" />{isPending ? "Verwijderen..." : "Verwijderen"}</Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Annuleren</Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

function WizardSteps({ step }) {
  const steps = ["Gegevens", "Document"];
  return (
    <div className="flex items-center gap-1 mb-4">
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-colors ${i + 1 === step ? "bg-primary text-primary-foreground" : i + 1 < step ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "text-muted-foreground"}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${i + 1 === step ? "bg-primary-foreground text-primary" : i + 1 < step ? "text-green-700 dark:text-green-300" : "border border-muted-foreground/30 text-muted-foreground"}`}>
              {i + 1 < step ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg> : i + 1}
            </span>
            {s}
          </div>
          {i < steps.length - 1 && <div className={`h-px flex-1 ${i + 1 < step ? "bg-green-200 dark:bg-green-900" : "bg-border"}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

// Row with context menu for action/expired items, direct preview for items with document
function AccreditationRow({ item, onEdit, onDelete, onRenew, onPreview }) {
  const [contextMenu, setContextMenu] = useState(null);
  const contextRef = useRef(null);
  const needsAction = isActionItem(item);
  const categoryText = categoryLabel(item.category);
  const titleText = item.name || optionLabel(item.category, item.accreditation_type);
  const subtitleText = [item.issuer, item.certificate_number].filter(Boolean).join(" - ") || optionLabel(item.category, item.accreditation_type);
  const validityText = [item.valid_from && `Vanaf: ${item.valid_from}`, item.valid_until && `Tot: ${item.valid_until}`].filter(Boolean).join("  ") || "Geen einddatum";

  useEffect(() => {
    if (!contextMenu) return;
    const handler = e => { if (contextRef.current && !contextRef.current.contains(e.target)) setContextMenu(null); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  const handleRowClick = e => {
    if (needsAction && item.document_file_url) {
      const rect = e.currentTarget.getBoundingClientRect();
      setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else if (needsAction && !item.document_file_url) {
      onRenew(item);
    } else if (item.document_file_url) {
      onPreview(item);
    }
  };

  const isClickable = needsAction || !!item.document_file_url;

  return (
    <div
      className={`relative ${ACCREDITATION_TABLE_GRID} items-center px-4 py-3 group transition-colors ${isClickable ? "cursor-pointer hover:bg-accent/40" : "hover:bg-accent/30"}`}
      onClick={handleRowClick}
    >
      <div className="min-w-0">
        <Badge variant="secondary" className="max-w-full text-xs">
          <span className="truncate">{categoryText}</span>
        </Badge>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{titleText}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitleText}</p>
      </div>
      <div className="min-w-0">{statusBadge(item)}</div>
      <div className="min-w-0 truncate text-xs text-muted-foreground" title={validityText}>
        {validityText}
      </div>
      <div className="min-w-0 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        {item.document_file_url && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onPreview(item)} title="Document bekijken"><Eye className="h-3.5 w-3.5" /></Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(item)} title="Bewerken"><Edit className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => onDelete(item.id)} title="Verwijderen"><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>

      <AnimatePresence>
        {contextMenu && (
          <motion.div
            ref={contextRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            className="absolute z-50 min-w-[200px] rounded-lg border border-border bg-popover shadow-lg py-1 text-sm"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-accent transition-colors text-foreground"
              onClick={() => { setContextMenu(null); onRenew(item); }}
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
              Erkenning vernieuwen
            </button>
            {item.document_file_url && (
              <button
                className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-accent transition-colors text-foreground"
                onClick={() => { setContextMenu(null); onPreview(item); }}
              >
                <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                Document openen
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AccreditationsTab({ companyId, company }) {
  const queryClient = useQueryClient();
  const wizardRef = useRef(null);

  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [editingId, setEditingId] = useState(null);
  const [renewingId, setRenewingId] = useState(null);
  const [isArchiveEntry, setIsArchiveEntry] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);
  const [formPreviewOpen, setFormPreviewOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (showWizard) {
      const timer = setTimeout(() => wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
      return () => clearTimeout(timer);
    }
  }, [wizardStep, showWizard]);

  const { data: accreditations = [] } = useQuery({
    queryKey: ["company-accreditations", companyId],
    queryFn: () => base44.entities.CompanyAccreditation.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        ...data,
        company_id: companyId,
        issuer: data.issuer?.trim() || null,
        certificate_number: data.certificate_number?.trim() || null,
        valid_from: data.valid_from || null,
        valid_until: data.valid_until || null,
        notes: data.notes?.trim() || null,
      };

      if (editingId) {
        return base44.entities.CompanyAccreditation.update(editingId, { ...payload, status: data.status || "active" });
      }

      // Archive entry: save directly as superseded
      if (isArchiveEntry) {
        const created = await base44.entities.CompanyAccreditation.create({ ...payload, status: "superseded" });
        if (created?.id && data.document_file_id) {
          await updateManagedFileSource(data.document_file_id, { owner_id: companyId, company_id: companyId, source_entity_id: created.id });
        }
        return created;
      }

      // Renewal: supersede existing active/expired records of same type
      if (renewingId) {
        const sameType = accreditations.filter(a => a.accreditation_type === data.accreditation_type && a.status !== "superseded");
        await Promise.all(sameType.map(a => base44.entities.CompanyAccreditation.update(a.id, { status: "superseded" })));
      }

      const created = await base44.entities.CompanyAccreditation.create({ ...payload, status: "active" });
      if (created?.id && data.document_file_id) {
        await updateManagedFileSource(data.document_file_id, { owner_id: companyId, company_id: companyId, source_entity_id: created.id });
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-accreditations", companyId] });
      cancelWizard();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CompanyAccreditation.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-accreditations", companyId] });
      setDeleteId(null);
    },
  });

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const setCategory = (category) => {
    const firstOption = (OPTIONS_BY_CATEGORY[category] || OTHER_OPTIONS)[0];
    setForm(current => ({ ...current, category, accreditation_type: firstOption.key, name: firstOption.label }));
  };

  const setType = (type) => {
    setForm(current => ({ ...current, accreditation_type: type, name: optionLabel(current.category, type) }));
  };

  const openNew = () => {
    setEditingId(null);
    setRenewingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setWizardStep(1);
    setShowWizard(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setRenewingId(null);
    setForm({
      category: item.category || "technical_certification",
      accreditation_type: item.accreditation_type || "other",
      name: item.name || optionLabel(item.category, item.accreditation_type),
      issuer: item.issuer || "",
      certificate_number: item.certificate_number || "",
      valid_from: item.valid_from || "",
      valid_until: item.valid_until || "",
      status: item.status || "active",
      document_file_url: item.document_file_url || "",
      document_filename: item.document_filename || "",
      document_file_id: item.document_file_id || "",
      document_download_filename: item.document_download_filename || "",
      document_logical_path: item.document_logical_path || "",
      document_metadata: item.document_metadata || null,
      notes: item.notes || "",
    });
    setErrors({});
    setWizardStep(1);
    setShowWizard(true);
  };

  const openRenew = (item) => {
    setEditingId(null);
    setRenewingId(item.id);
    setForm({
      ...EMPTY_FORM,
      category: item.category || "technical_certification",
      accreditation_type: item.accreditation_type || "other",
      name: item.name || optionLabel(item.category, item.accreditation_type),
      issuer: item.issuer || "",
      status: "active",
    });
    setErrors({});
    setWizardStep(1);
    setShowWizard(true);
  };

  const cancelWizard = () => {
    setShowWizard(false);
    setEditingId(null);
    setRenewingId(null);
    setIsArchiveEntry(false);
    setWizardStep(1);
    setForm(EMPTY_FORM);
    setErrors({});
    setFormPreviewOpen(false);
  };

  // True when the accreditation type is a known/predefined option (not free-form "other")
  const isKnownType = (category, type) => {
    const opts = OPTIONS_BY_CATEGORY[category] || OTHER_OPTIONS;
    if (type === "other") return false;
    return opts.some(o => o.key === type);
  };

  const validateStep1 = () => {
    const e = {};
    if (!isKnownType(form.category, form.accreditation_type) && !form.name?.trim()) {
      e.name = "Naam is verplicht";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleUpload = async (file) => {
    setUploading(true);
    try {
      const result = await uploadManagedFile({
        file,
        ownerType: "company",
        ownerId: companyId,
        companyId,
        ownerLabel: company?.display_name || company?.legal_name || "Bedrijf",
        domain: "compliance",
        category: "company_accreditation",
        sourceEntity: "CompanyAccreditation",
        sourceEntityId: editingId || null,
        sourceField: "document_file_url",
        documentLabel: form.name || optionLabel(form.category, form.accreditation_type),
        documentNumber: form.certificate_number || null,
        validFrom: form.valid_from || null,
        validUntil: form.valid_until || null,
        isSensitive: true,
        folderSegments: ["erkenningen", form.category, form.accreditation_type],
        metadata: { category: form.category, accreditation_type: form.accreditation_type },
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

  const activeAccreditations = accreditations.filter(a => a.status !== "superseded");
  const archivedAccreditations = accreditations.filter(a => a.status === "superseded");
  const itemToDelete = accreditations.find(item => item.id === deleteId);
  const isRenewing = !!renewingId;
  const activeWithoutDocument = !form.document_file_url && wizardStep === 2 && !editingId;

  return (
    <div className="flex flex-col h-full">
      <AnimatePresence>
        {deleteId && itemToDelete && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
            <DeleteConfirmBar
              label={itemToDelete.name || optionLabel(itemToDelete.category, itemToDelete.accreditation_type)}
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
            {editingId && <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">Erkenning bewerken</p>}
            {isRenewing && <p className="text-xs font-semibold text-amber-600 mb-3 uppercase tracking-wider">Erkenning vernieuwen — {form.name}</p>}
            {!editingId && !isRenewing && <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">Nieuwe erkenning</p>}

            <WizardSteps step={wizardStep} />

            <AnimatePresence mode="wait">
              <motion.div key={wizardStep} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: "easeOut" }}>

                {wizardStep === 1 && (
                  <div className="space-y-3">
                    {(() => {
                      const knownType = isKnownType(form.category, form.accreditation_type);
                      return (
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                          {!isRenewing && (
                            <>
                              <div className="space-y-1">
                                <Label>Categorie</Label>
                                <Select value={form.category} onValueChange={setCategory}>
                                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                  <SelectContent>{CATEGORY_OPTIONS.map(o => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}</SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1 lg:col-span-2">
                                <Label>Type</Label>
                                <Select value={form.accreditation_type} onValueChange={setType}>
                                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                  <SelectContent>{(OPTIONS_BY_CATEGORY[form.category] || OTHER_OPTIONS).map(o => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}</SelectContent>
                                </Select>
                              </div>
                            </>
                          )}
                          {!knownType && (
                            <div className="space-y-1 lg:col-span-2">
                              <Label>Naam</Label>
                              <Input className={`h-8 ${errors.name ? "border-destructive" : ""}`} value={form.name} onChange={e => { set("name", e.target.value); setErrors(er => ({ ...er, name: undefined })); }} />
                              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                            </div>
                          )}
                          {!knownType && (
                            <div className="space-y-1">
                              <Label>Uitgever / organisatie</Label>
                              <Input className="h-8" value={form.issuer} onChange={e => set("issuer", e.target.value)} />
                            </div>
                          )}
                          <div className="space-y-1">
                            <Label>Nummer</Label>
                            <Input className="h-8" value={form.certificate_number} onChange={e => set("certificate_number", e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>Geldig vanaf</Label>
                            <Input className="h-8" type="date" value={form.valid_from} onChange={e => set("valid_from", e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>Geldig tot</Label>
                            <Input className="h-8" type="date" value={form.valid_until} onChange={e => set("valid_until", e.target.value)} />
                          </div>
                        </div>
                      );
                    })()}
                    <div className="flex justify-between pt-1">
                      <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                      <Button size="sm" onClick={() => { if (validateStep1()) setWizardStep(2); }}>
                        Volgende <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}

                {wizardStep === 2 && (
                  <div className="space-y-4">
                    <p className="text-sm font-medium text-foreground">Bewijsstuk {editingId ? "bijwerken" : "uploaden"}</p>
                    {!editingId && (
                      <p className="text-xs text-muted-foreground">
                        Upload het officiële certificaat of erkenningsdocument (PDF of afbeelding). <span className="text-destructive font-medium">Verplicht.</span>
                      </p>
                    )}

                    {form.document_file_url ? (
                      <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card">
                        <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                        <span className="text-sm text-muted-foreground flex-1 truncate">{form.document_download_filename || form.document_filename || "Document toegevoegd"}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setFormPreviewOpen(true)} className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700">
                          <Eye className="w-3.5 h-3.5" /> Bekijken
                        </Button>
                        <button onClick={() => { setFormPreviewOpen(false); setForm(f => ({ ...f, document_file_url: "", document_filename: "", document_file_id: "", document_download_filename: "", document_logical_path: "", document_metadata: null })); }} className="text-muted-foreground hover:text-destructive">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed border-border hover:border-primary cursor-pointer transition-colors">
                        <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                        <Upload className="w-6 h-6 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{uploading ? "Uploaden..." : "Klik om document te uploaden"}</span>
                        <span className="text-xs text-muted-foreground">PDF of afbeelding</span>
                      </label>
                    )}

                    {activeWithoutDocument && (
                      <p className="text-xs text-destructive">Upload eerst een bewijsstuk voordat je de status Actief opslaat.</p>
                    )}

                    <div className="flex justify-between pt-1">
                      <Button variant="ghost" size="sm" onClick={() => setWizardStep(1)}>
                        <ChevronLeft className="w-4 h-4 mr-1" /> Terug
                      </Button>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                        <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || activeWithoutDocument}>
                          <Check className="w-4 h-4 mr-1" />
                          {saveMutation.isPending ? "Opslaan..." : (editingId ? "Wijzigingen opslaan" : isRenewing ? "Erkenning vernieuwen" : "Erkenning opslaan")}
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

      <div className={`${ACCREDITATION_TABLE_GRID} items-center px-4 py-2 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
        <span className="min-w-0">Categorie</span>
        <span className="min-w-0">Erkenning</span>
        <span className="min-w-0">Status</span>
        <span className="min-w-0">Geldigheid</span>
        <div className="min-w-0 flex flex-wrap items-center justify-end gap-2">
          {showArchive && <Badge className="bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 animate-pulse mr-1">Archief</Badge>}
          {!showWizard && !deleteId && (
            showArchive ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowArchive(false)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                  <ChevronLeft className="w-3 h-3 mr-1" /> Actieve erkenningen
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setIsArchiveEntry(true); setWizardStep(1); setShowWizard(true); }} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                  <Plus className="w-3 h-3 mr-1" /> Voeg oude erkenning in archief
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowArchive(true)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                  <Archive className="w-3 h-3 mr-1" /> Archief {archivedAccreditations.length > 0 ? `(${archivedAccreditations.length})` : ""}
                </Button>
                <Button size="sm" variant="outline" onClick={openNew} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                  <Plus className="w-3 h-3 mr-1" /> Nieuwe erkenning
                </Button>
              </>
            )
          )}
        </div>
      </div>

      {!showArchive && (
        <>
          {activeAccreditations.length === 0 && !showWizard && (
            <p className="px-4 py-3 text-sm text-muted-foreground">Nog geen erkenningen of certificaten geregistreerd.</p>
          )}
          <div className="divide-y divide-border">
            {activeAccreditations.map(item => (
              <AccreditationRow
                key={item.id}
                item={item}
                onEdit={openEdit}
                onDelete={setDeleteId}
                onRenew={openRenew}
                onPreview={setPreview}
              />
            ))}
          </div>
        </>
      )}

      {showArchive && (
        <div className="divide-y divide-border">
          {archivedAccreditations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">Geen erkenningen in het archief.</p>
          ) : (
            archivedAccreditations.map(item => (
              <AccreditationRow
                key={item.id}
                item={item}
                onEdit={openEdit}
                onDelete={setDeleteId}
                onRenew={undefined}
                onPreview={setPreview}
              />
            ))
          )}
        </div>
      )}

      <ManagedFilePreviewDialog
        open={formPreviewOpen}
        onOpenChange={setFormPreviewOpen}
        managedFileId={form.document_file_id}
        fileUrl={form.document_file_url}
        filename={form.document_download_filename || form.document_filename || "Document"}
        title="Erkenningsdocument bekijken"
      />
      <ManagedFilePreviewDialog
        open={!!preview}
        onOpenChange={open => { if (!open) setPreview(null); }}
        managedFileId={preview?.document_file_id}
        fileUrl={preview?.document_file_url}
        filename={preview?.document_download_filename || preview?.document_filename || "Document"}
        title="Erkenningsdocument bekijken"
      />
    </div>
  );
}
