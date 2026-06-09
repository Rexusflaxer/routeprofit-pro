import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Upload, CheckCircle } from "lucide-react";
import { downloadManagedFile, uploadManagedFile } from "@/lib/managedFiles";

const ID_DOC_LABELS = {
  passport: "Paspoort",
  id_card: "Identiteitskaart",
  residence_permit: "Verblijfsdocument",
  other: "Identiteitsdocument"
};

export default function WizardStep4Identity({ sensitiveData, onSensitiveChange, idDoc, onIdDocChange, form, personnelId, uploadSessionId }) {
  const [uploading, setUploading] = useState({ front: false, back: false });

  const uploadFile = async (side, file) => {
    setUploading(p => ({ ...p, [side]: true }));
    try {
      const sideLabel = side === "front" ? "voorzijde" : "achterzijde";
      const docLabel = ID_DOC_LABELS[idDoc.document_type] || "Identiteitsdocument";
      const result = await uploadManagedFile({
        file,
        ownerType: "personnel",
        ownerId: personnelId || null,
        companyId: form.primary_company_id || null,
        uploadSessionId,
        ownerLabel: form.name || `${form.first_name || ""} ${form.last_name || ""}`.trim() || "Medewerker",
        domain: "identity",
        category: `identity_document_${side}`,
        sourceEntity: "PersonnelDocument",
        sourceField: side === "front" ? "front_file_url" : "back_file_url",
        documentLabel: `${docLabel} ${sideLabel}`,
        documentNumber: idDoc.document_number || null,
        validFrom: idDoc.valid_from || null,
        validUntil: idDoc.valid_until || null,
        isSensitive: true,
        folderSegments: ["identity", idDoc.document_type || "identity-document", side]
      });
      onIdDocChange(side === "front" ? "front_file_url" : "back_file_url", result.file_url);
      onIdDocChange(side === "front" ? "front_file_id" : "back_file_id", result.managed_file_id);
      onIdDocChange(side === "front" ? "front_download_filename" : "back_download_filename", result.download_filename);
      onIdDocChange(side === "front" ? "front_logical_path" : "back_logical_path", result.logical_path);
    } finally {
      setUploading(p => ({ ...p, [side]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Document details */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Identiteitsdocument</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Type document</Label>
            <Select value={idDoc.document_type || "id_card"} onValueChange={v => onIdDocChange("document_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="passport">Paspoort</SelectItem>
                <SelectItem value="id_card">Identiteitskaart</SelectItem>
                <SelectItem value="residence_permit">Verblijfsdocument</SelectItem>
                <SelectItem value="other">Overig</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Documentnummer</Label>
            <Input value={idDoc.document_number || ""} onChange={e => onIdDocChange("document_number", e.target.value)} placeholder="AA000000" />
          </div>
          <div className="space-y-1">
            <Label>Geldig van</Label>
            <Input type="date" value={idDoc.valid_from || ""} onChange={e => onIdDocChange("valid_from", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Geldig tot</Label>
            <Input type="date" value={idDoc.valid_until || ""} onChange={e => onIdDocChange("valid_until", e.target.value)} />
          </div>
        </div>
      </div>

      {/* Upload voor- en achterzijde */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Document uploaden (identificatieplicht werkgever)</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {["front", "back"].map(side => {
            const url = side === "front" ? idDoc.front_file_url : idDoc.back_file_url;
            const fileId = side === "front" ? idDoc.front_file_id : idDoc.back_file_id;
            const downloadName = side === "front" ? idDoc.front_download_filename : idDoc.back_download_filename;
            const label = side === "front" ? "Voorzijde" : "Achterzijde";
            return (
              <div key={side} className="space-y-2">
                <Label>{label}</Label>
                {url ? (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <button type="button" onClick={() => downloadManagedFile({ managedFileId: fileId, fileUrl: url, filename: downloadName || label })} className="text-primary underline text-left">{downloadName || "Bekijken"}</button>
                    <button type="button" className="text-destructive text-xs" onClick={() => {
                      onIdDocChange(side === "front" ? "front_file_url" : "back_file_url", null);
                      onIdDocChange(side === "front" ? "front_file_id" : "back_file_id", null);
                      onIdDocChange(side === "front" ? "front_download_filename" : "back_download_filename", null);
                      onIdDocChange(side === "front" ? "front_logical_path" : "back_logical_path", null);
                    }}>Verwijderen</button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => e.target.files?.[0] && uploadFile(side, e.target.files[0])} />
                    <Button type="button" variant="outline" size="sm" disabled={uploading[side]} asChild>
                      <span><Upload className="w-3 h-3 mr-1" />{uploading[side] ? "Uploaden..." : `${label} uploaden`}</span>
                    </Button>
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Verificatie door werkgever */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
        <p className="text-sm font-medium">Identificatie geverifieerd door werkgever</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <Switch checked={!!sensitiveData.identity_verified_at_hire} onCheckedChange={v => onSensitiveChange("identity_verified_at_hire", v)} />
            <Label>Identiteit geverifieerd bij indiensttreding</Label>
          </div>
          <div className="space-y-1">
            <Label>Geverifieerd door</Label>
            <Input value={sensitiveData.identity_verified_by || ""} onChange={e => onSensitiveChange("identity_verified_by", e.target.value)} placeholder="Naam HR-medewerker" />
          </div>
          <div className="space-y-1">
            <Label>Verificatiedatum</Label>
            <Input type="date" value={sensitiveData.identity_verified_at || ""} onChange={e => onSensitiveChange("identity_verified_at", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Bewaartermijn kopie t/m</Label>
            <Input type="date" value={sensitiveData.identity_copy_retention_until || ""} onChange={e => onSensitiveChange("identity_copy_retention_until", e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}
