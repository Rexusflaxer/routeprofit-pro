import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Plus, Trash2 } from "lucide-react";
import { downloadManagedFile, uploadManagedFile } from "@/lib/managedFiles";

const QUAL_TYPES = [
  { value: "beveiliger_2", label: "Beveiliger niveau 2" },
  { value: "beveiliger_3", label: "Beveiliger niveau 3" },
  { value: "horecaportier", label: "Horecaportier" },
  { value: "voetbalsteward", label: "Voetbalsteward" },
  { value: "verkeersregelaar", label: "Verkeersregelaar" },
  { value: "bhv", label: "BHV" },
  { value: "brandwacht", label: "Brandwacht" },
  { value: "alarminstallateur", label: "Alarminstallateur" },
  { value: "mbv", label: "MBV - Monteur Beveiligingssystemen" },
  { value: "tbv", label: "TBV - Technicus Beveiligingsinstallaties" },
  { value: "technisch_beveiligingsspecialist", label: "Technisch beveiligingsspecialist" },
  { value: "basis_brandmeldtechniek", label: "Basis Brandmeldtechniek" },
  { value: "beheerder_brandmeldinstallatie", label: "Beheerder brandmeldinstallatie" },
  { value: "projecteringsdeskundige_bmi", label: "Projecteringsdeskundige BMI" },
  { value: "installatiedeskundige_bmi_oai", label: "Installatiedeskundige BMI/OAI" },
  { value: "onderhoudsdeskundige_bmi", label: "Onderhoudsdeskundige BMI" },
  { value: "projecteringsdeskundige_cctv_vss", label: "Projecteringsdeskundige CCTV/VSS" },
  { value: "installatiedeskundige_cctv_vss", label: "Installatiedeskundige CCTV/VSS" },
  { value: "particulier_onderzoeker", label: "Particulier onderzoeker" },
  { value: "other", label: "Overig" },
];

export default function WizardStep5Compliance({ form, onChange, vogDoc, onVogDocChange, qualifications, onQualAdd, onQualChange, onQualRemove, personnelId, uploadSessionId }) {
  const [uploadingVog, setUploadingVog] = useState(false);

  const uploadVog = async (file) => {
    setUploadingVog(true);
    try {
      const result = await uploadManagedFile({
        file,
        ownerType: "personnel",
        ownerId: personnelId || null,
        companyId: form.primary_company_id || null,
        uploadSessionId,
        ownerLabel: form.name || `${form.first_name || ""} ${form.last_name || ""}`.trim() || "Medewerker",
        domain: "compliance",
        category: "vog",
        sourceEntity: "PersonnelDocument",
        sourceField: "file_url",
        documentLabel: "VOG",
        documentNumber: vogDoc.document_number || null,
        validFrom: vogDoc.valid_from || null,
        validUntil: vogDoc.valid_until || null,
        isSensitive: true,
        folderSegments: ["compliance", "vog"]
      });
      onVogDocChange("file_url", result.file_url);
      onVogDocChange("file_id", result.managed_file_id);
      onVogDocChange("file_download_filename", result.download_filename);
      onVogDocChange("file_logical_path", result.logical_path);
    } finally {
      setUploadingVog(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* VOG */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">VOG – Verklaring Omtrent Gedrag</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Documentnummer</Label>
            <Input value={vogDoc.document_number || ""} onChange={e => onVogDocChange("document_number", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Afgiftedatum</Label>
            <Input type="date" value={vogDoc.valid_from || ""} onChange={e => onVogDocChange("valid_from", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Geldig tot</Label>
            <Input type="date" value={vogDoc.valid_until || ""} onChange={e => onVogDocChange("valid_until", e.target.value)} />
          </div>
        </div>
        <div className="mt-2">
          {vogDoc.file_url ? (
            <div className="flex items-center gap-2 text-sm">
              <button type="button" onClick={() => downloadManagedFile({ managedFileId: vogDoc.file_id, fileUrl: vogDoc.file_url, filename: vogDoc.file_download_filename || "VOG" })} className="text-primary underline text-left">{vogDoc.file_download_filename || "VOG bekijken"}</button>
              <button type="button" className="text-destructive text-xs" onClick={() => {
                onVogDocChange("file_url", null);
                onVogDocChange("file_id", null);
                onVogDocChange("file_download_filename", null);
                onVogDocChange("file_logical_path", null);
              }}>Verwijderen</button>
            </div>
          ) : (
            <label className="cursor-pointer">
              <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadVog(e.target.files[0])} />
              <Button type="button" variant="outline" size="sm" disabled={uploadingVog} asChild>
                <span><Upload className="w-3 h-3 mr-1" />{uploadingVog ? "Uploaden..." : "VOG uploaden"}</span>
              </Button>
            </label>
          )}
        </div>
      </div>

      {/* Wpbr */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Wpbr / Toestemming beveiligingsactiviteiten</p>
        <div className="flex items-center gap-2 mb-3">
          <Switch checked={!!form.wpbr_required} onCheckedChange={v => onChange("wpbr_required", v)} />
          <Label>Wpbr-toestemming vereist voor functie</Label>
        </div>
        {form.wpbr_required && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.wpbr_status || "not_started"} onValueChange={v => onChange("wpbr_status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started">Nog niet aangevraagd</SelectItem>
                  <SelectItem value="requested">Aangevraagd</SelectItem>
                  <SelectItem value="approved">Goedgekeurd</SelectItem>
                  <SelectItem value="rejected">Afgewezen</SelectItem>
                  <SelectItem value="expired">Verlopen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Autoriteit</Label>
              <Select value={form.wpbr_authority || "korpschef"} onValueChange={v => onChange("wpbr_authority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="korpschef">Korpschef</SelectItem>
                  <SelectItem value="kmar">KMar</SelectItem>
                  <SelectItem value="justis">Justis</SelectItem>
                  <SelectItem value="other">Overig</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Toestemmingsnummer</Label>
              <Input value={form.wpbr_permission_number || ""} onChange={e => onChange("wpbr_permission_number", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Geldig van</Label>
              <Input type="date" value={form.wpbr_permission_valid_from || ""} onChange={e => onChange("wpbr_permission_valid_from", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Geldig tot</Label>
              <Input type="date" value={form.wpbr_permission_valid_until || ""} onChange={e => onChange("wpbr_permission_valid_until", e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {/* Diploma's & Certificaten */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Diploma's & Certificaten</p>
          <Button type="button" size="sm" variant="outline" onClick={() => onQualAdd({ qualification_type: "beveiliger_2", name: "", valid_from: "", valid_until: "", certificate_number: "", verification_status: "pending_review" })}>
            <Plus className="w-3 h-3 mr-1" /> Toevoegen
          </Button>
        </div>
        <div className="space-y-3">
          {qualifications.map((q, i) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-xs">{QUAL_TYPES.find(t => t.value === q.qualification_type)?.label || q.qualification_type}</Badge>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onQualRemove(i)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select value={q.qualification_type} onValueChange={v => onQualChange(i, "qualification_type", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{QUAL_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Naam / omschrijving</Label>
                  <Input className="h-8 text-xs" value={q.name} onChange={e => onQualChange(i, "name", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Geldig van</Label>
                  <Input className="h-8 text-xs" type="date" value={q.valid_from || ""} onChange={e => onQualChange(i, "valid_from", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Geldig tot</Label>
                  <Input className="h-8 text-xs" type="date" value={q.valid_until || ""} onChange={e => onQualChange(i, "valid_until", e.target.value)} />
                </div>
              </div>
            </div>
          ))}
          {qualifications.length === 0 && <p className="text-xs text-muted-foreground">Nog geen diploma's toegevoegd.</p>}
        </div>
      </div>
    </div>
  );
}
