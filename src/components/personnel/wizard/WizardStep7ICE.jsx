import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload, Plus, Trash2, Phone } from "lucide-react";
import { downloadManagedFile, uploadManagedFile } from "@/lib/managedFiles";

export default function WizardStep7ICE({ iceContacts, onAddContact, onChangeContact, onRemoveContact, cvDoc, onCvChange, form, personnelId, uploadSessionId }) {
  const [uploadingCv, setUploadingCv] = useState(false);

  const uploadCv = async (file) => {
    setUploadingCv(true);
    try {
      const result = await uploadManagedFile({
        file,
        ownerType: "personnel",
        ownerId: personnelId || null,
        companyId: form.primary_company_id || null,
        uploadSessionId,
        ownerLabel: form.name || `${form.first_name || ""} ${form.last_name || ""}`.trim() || "Medewerker",
        domain: "identity",
        category: "cv",
        sourceEntity: "PersonnelDocument",
        sourceField: "file_url",
        documentLabel: "CV",
        isSensitive: true,
        folderSegments: ["identity", "cv"]
      });
      onCvChange("file_url", result.file_url);
      onCvChange("file_id", result.managed_file_id);
      onCvChange("file_download_filename", result.download_filename);
      onCvChange("file_logical_path", result.logical_path);
    } finally {
      setUploadingCv(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ICE contacten */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ICE – In Case of Emergency</p>
          <Button type="button" size="sm" variant="outline" onClick={() => onAddContact({ name: "", relationship: "", phone_1: "", phone_2: "", email: "", priority: iceContacts.length + 1 })}>
            <Plus className="w-3 h-3 mr-1" /> Contact toevoegen
          </Button>
        </div>
        <div className="space-y-3">
          {iceContacts.map((c, i) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Contact {i + 1}</span>
                </div>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onRemoveContact(i)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="space-y-1 col-span-2 md:col-span-1">
                  <Label className="text-xs">Naam *</Label>
                  <Input className="h-8 text-xs" value={c.name} onChange={e => onChangeContact(i, "name", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Relatie</Label>
                  <Input className="h-8 text-xs" value={c.relationship || ""} onChange={e => onChangeContact(i, "relationship", e.target.value)} placeholder="Partner, ouder…" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Telefoon 1</Label>
                  <Input className="h-8 text-xs" value={c.phone_1 || ""} onChange={e => onChangeContact(i, "phone_1", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Telefoon 2</Label>
                  <Input className="h-8 text-xs" value={c.phone_2 || ""} onChange={e => onChangeContact(i, "phone_2", e.target.value)} />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">E-mail</Label>
                  <Input className="h-8 text-xs" type="email" value={c.email || ""} onChange={e => onChangeContact(i, "email", e.target.value)} />
                </div>
              </div>
            </div>
          ))}
          {iceContacts.length === 0 && <p className="text-xs text-muted-foreground">Nog geen noodcontacten toegevoegd.</p>}
        </div>
      </div>

      {/* CV */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">CV</p>
        {cvDoc.file_url ? (
          <div className="flex items-center gap-2 text-sm">
            <button type="button" onClick={() => downloadManagedFile({ managedFileId: cvDoc.file_id, fileUrl: cvDoc.file_url, filename: cvDoc.file_download_filename || "CV" })} className="text-primary underline text-left">{cvDoc.file_download_filename || "CV bekijken"}</button>
            <button type="button" className="text-destructive text-xs" onClick={() => {
              onCvChange("file_url", null);
              onCvChange("file_id", null);
              onCvChange("file_download_filename", null);
              onCvChange("file_logical_path", null);
            }}>Verwijderen</button>
          </div>
        ) : (
          <label className="cursor-pointer">
            <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={e => e.target.files?.[0] && uploadCv(e.target.files[0])} />
            <Button type="button" variant="outline" size="sm" disabled={uploadingCv} asChild>
              <span><Upload className="w-3 h-3 mr-1" />{uploadingCv ? "Uploaden..." : "CV uploaden"}</span>
            </Button>
          </label>
        )}
      </div>
    </div>
  );
}
