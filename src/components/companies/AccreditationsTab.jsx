import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, Edit, Eye, FileText, Plus, Trash2, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import ManagedFilePreviewDialog from "@/components/files/ManagedFilePreviewDialog";
import { TECHNICAL_ACCREDITATION_OPTIONS } from "@/lib/teamhubServiceRules";
import { updateManagedFileSource, uploadManagedFile } from "@/lib/managedFiles";

const DELETE_PASSWORD = "verwijder";

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
    .find(option => option.key === value)?.label || value || "Erkenning";
}

function categoryLabel(category) {
  return CATEGORY_OPTIONS.find(option => option.key === category)?.label || category || "Erkenning";
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
          <p className="text-sm font-semibold text-foreground">Erkenning verwijderen?</p>
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

export default function AccreditationsTab({ companyId, company }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

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
      const saved = editingId
        ? await base44.entities.CompanyAccreditation.update(editingId, payload)
        : await base44.entities.CompanyAccreditation.create(payload);
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
      queryClient.invalidateQueries({ queryKey: ["company-accreditations", companyId] });
      cancel();
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
    setForm(current => ({
      ...current,
      category,
      accreditation_type: firstOption.key,
      name: firstOption.label,
    }));
  };

  const setType = (type) => {
    setForm(current => ({
      ...current,
      accreditation_type: type,
      name: optionLabel(current.category, type),
    }));
  };

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
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
    setShowForm(true);
  };

  const cancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPreview(null);
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

  const itemToDelete = accreditations.find(item => item.id === deleteId);
  const activeWithoutDocument = form.status === "active" && !form.document_file_url;

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
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="border-b border-primary/30 bg-muted/20 p-5">
            <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">{editingId ? "Erkenning bewerken" : "Nieuwe erkenning"}</p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
              <div className="space-y-1">
                <Label>Categorie</Label>
                <Select value={form.category} onValueChange={setCategory}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORY_OPTIONS.map(option => <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1 lg:col-span-2">
                <Label>Type</Label>
                <Select value={form.accreditation_type} onValueChange={setType}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{(OPTIONS_BY_CATEGORY[form.category] || OTHER_OPTIONS).map(option => <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={value => set("status", value)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Actief</SelectItem>
                    <SelectItem value="pending_review">Actie nodig</SelectItem>
                    <SelectItem value="suspended">Geschorst</SelectItem>
                    <SelectItem value="expired">Verlopen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 lg:col-span-2">
                <Label>Naam</Label>
                <Input className="h-8" value={form.name} onChange={event => set("name", event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Uitgever / organisatie</Label>
                <Input className="h-8" value={form.issuer} onChange={event => set("issuer", event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Nummer</Label>
                <Input className="h-8" value={form.certificate_number} onChange={event => set("certificate_number", event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Geldig vanaf</Label>
                <Input className="h-8" type="date" value={form.valid_from} onChange={event => set("valid_from", event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Geldig tot</Label>
                <Input className="h-8" type="date" value={form.valid_until} onChange={event => set("valid_until", event.target.value)} />
              </div>
              <div className="space-y-1 lg:col-span-2">
                <Label>Bewijsstuk</Label>
                {form.document_file_url ? (
                  <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2">
                    <FileText className="h-3.5 w-3.5 text-blue-600" />
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{form.document_download_filename || form.document_filename || "Document"}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setPreview(form)} className="h-6 px-2 text-xs"><Eye className="h-3 w-3" /></Button>
                    <button type="button" onClick={() => setForm(current => ({ ...current, document_file_url: "", document_filename: "", document_file_id: "", document_download_filename: "", document_logical_path: "", document_metadata: null }))}>
                      <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:border-primary">
                    <input type="file" accept=".pdf,image/*" className="hidden" onChange={event => event.target.files?.[0] && handleUpload(event.target.files[0])} />
                    <Upload className="h-3.5 w-3.5" /> {uploading ? "Uploaden..." : "Upload bewijs"}
                  </label>
                )}
              </div>
              <div className="space-y-1 lg:col-span-4">
                <Label>Notities</Label>
                <Textarea value={form.notes} onChange={event => set("notes", event.target.value)} rows={2} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={cancel}>Annuleren</Button>
              <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.name?.trim() || activeWithoutDocument}>
                <Check className="h-4 w-4 mr-1" /> {saveMutation.isPending ? "Opslaan..." : "Opslaan"}
              </Button>
            </div>
            {activeWithoutDocument && (
              <p className="mt-2 text-right text-xs text-destructive">Upload eerst een bewijsstuk voordat je de status Actief opslaat.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center px-4 py-2 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="w-40 shrink-0">Categorie</span>
        <span className="flex-1 min-w-0">Erkenning</span>
        <span className="w-28 shrink-0">Status</span>
        <span className="w-44 shrink-0">Geldigheid</span>
        <div className="w-24 shrink-0 flex justify-end">
          {!showForm && !deleteId && (
            <Button size="sm" variant="outline" onClick={openNew} className="h-7 px-2 text-xs font-medium normal-case tracking-normal">
              <Plus className="w-3 h-3 mr-1" /> Nieuwe erkenning
            </Button>
          )}
        </div>
      </div>

      {accreditations.length === 0 && !showForm && (
        <p className="px-4 py-3 text-sm text-muted-foreground">Nog geen erkenningen of certificaten geregistreerd.</p>
      )}

      <div className="divide-y divide-border">
        {accreditations.map(item => (
          <div key={item.id} className="flex items-center px-4 py-3 group hover:bg-accent/30 transition-colors">
            <div className="w-40 shrink-0">
              <Badge variant="secondary" className="text-xs">{categoryLabel(item.category)}</Badge>
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{item.name || optionLabel(item.category, item.accreditation_type)}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[item.issuer, item.certificate_number].filter(Boolean).join(" - ") || optionLabel(item.category, item.accreditation_type)}
              </p>
            </div>
            <div className="w-28 shrink-0">{statusBadge(item)}</div>
            <div className="w-44 shrink-0 text-xs text-muted-foreground">
              {[item.valid_from && `Vanaf ${item.valid_from}`, item.valid_until && `Tot ${item.valid_until}`].filter(Boolean).join("  ") || "Geen einddatum"}
            </div>
            <div className="w-24 shrink-0 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {item.document_file_url && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreview(item)} title="Document bekijken"><Eye className="h-3.5 w-3.5" /></Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)} title="Bewerken"><Edit className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteId(item.id)} title="Verwijderen"><Trash2 className="h-3.5 w-3.5" /></Button>
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
        title="Erkenningsdocument bekijken"
      />
    </div>
  );
}