import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { downloadManagedFile, uploadManagedFile } from "@/lib/managedFiles";

const LICENSE_CATEGORIES = ["A", "A1", "A2", "AM", "B", "BE", "C", "CE", "C1", "C1E", "D", "DE", "D1", "D1E", "T"];

export default function WizardStep6Mobility({ driversLicense, onLicenseChange, bankAccount, onBankChange, form, personnelId, uploadSessionId }) {
  const [uploadingProof, setUploadingProof] = useState(false);

  const toggleCategory = (cat) => {
    const current = driversLicense.metadata?.categories || [];
    const updated = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
    onLicenseChange("metadata", { ...driversLicense.metadata, categories: updated });
  };

  const uploadBankProof = async (file) => {
    setUploadingProof(true);
    try {
      const iban = String(bankAccount.iban || "").replace(/\s/g, "");
      const result = await uploadManagedFile({
        file,
        ownerType: "personnel",
        ownerId: personnelId || null,
        companyId: form.primary_company_id || null,
        uploadSessionId,
        ownerLabel: form.name || `${form.first_name || ""} ${form.last_name || ""}`.trim() || "Medewerker",
        domain: "payroll",
        category: "bank_account_proof",
        sourceEntity: "PersonnelDocument",
        sourceField: "file_url",
        documentLabel: "Bewijs bankrekening",
        documentNumber: iban ? `IBAN-${iban.slice(-4)}` : null,
        validFrom: bankAccount.valid_from || null,
        isSensitive: true,
        folderSegments: ["payroll", "bank"]
      });
      onBankChange("_proof_file_url", result.file_url);
      onBankChange("_proof_file_id", result.managed_file_id);
      onBankChange("_proof_download_filename", result.download_filename);
      onBankChange("_proof_logical_path", result.logical_path);
    } finally {
      setUploadingProof(false);
    }
  };

  const hasLicense = !!driversLicense._enabled;

  return (
    <div className="space-y-6">
      {/* Rijbewijs */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Switch checked={hasLicense} onCheckedChange={v => onLicenseChange("_enabled", v)} />
          <Label className="font-medium">Rijbewijs aanwezig</Label>
        </div>
        {hasLicense && (
          <div className="space-y-4 border border-border rounded-xl p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Documentnummer</Label>
                <Input value={driversLicense.document_number || ""} onChange={e => onLicenseChange("document_number", e.target.value)} placeholder="1234567890" />
              </div>
              <div className="space-y-1">
                <Label>Geldig van</Label>
                <Input type="date" value={driversLicense.valid_from || ""} onChange={e => onLicenseChange("valid_from", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Geldig tot</Label>
                <Input type="date" value={driversLicense.valid_until || ""} onChange={e => onLicenseChange("valid_until", e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-sm mb-2 block">Categorieën</Label>
              <div className="flex flex-wrap gap-2">
                {LICENSE_CATEGORIES.map(cat => {
                  const active = (driversLicense.metadata?.categories || []).includes(cat);
                  return (
                    <button key={cat} type="button" onClick={() => toggleCategory(cat)}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-foreground"}`}>
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Verificatiestatus</Label>
              <Select value={driversLicense.verification_status || "uploaded"} onValueChange={v => onLicenseChange("verification_status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="uploaded">Geüpload</SelectItem>
                  <SelectItem value="pending_review">In beoordeling</SelectItem>
                  <SelectItem value="verified">Geverifieerd</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Bankrekening</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>IBAN</Label>
            <Input value={bankAccount.iban || ""} onChange={e => onBankChange("iban", e.target.value.toUpperCase())} placeholder="NL00 BANK 0000 0000 00" className="font-mono" />
          </div>
          <div className="space-y-1">
            <Label>Rekeninghouder</Label>
            <Input value={bankAccount.account_holder_name || ""} onChange={e => onBankChange("account_holder_name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Bank</Label>
            <Input value={bankAccount.bank_name || ""} onChange={e => onBankChange("bank_name", e.target.value)} placeholder="ABN AMRO, ING, etc." />
          </div>
          <div className="space-y-1">
            <Label>Geldig van</Label>
            <Input type="date" value={bankAccount.valid_from || ""} onChange={e => onBankChange("valid_from", e.target.value)} />
          </div>
        </div>
        <div className="mt-3 space-y-1">
          <Label>Bewijs bankrekening</Label>
          {bankAccount._proof_file_url ? (
            <div className="flex items-center gap-2 text-sm">
              <button type="button" onClick={() => downloadManagedFile({ managedFileId: bankAccount._proof_file_id, fileUrl: bankAccount._proof_file_url, filename: bankAccount._proof_download_filename || "Bewijs bankrekening" })} className="text-primary underline text-left">{bankAccount._proof_download_filename || "Bewijs bekijken"}</button>
              <button type="button" className="text-destructive text-xs" onClick={() => {
                onBankChange("_proof_file_url", null);
                onBankChange("_proof_file_id", null);
                onBankChange("_proof_download_filename", null);
                onBankChange("_proof_logical_path", null);
              }}>Verwijderen</button>
            </div>
          ) : (
            <label className="cursor-pointer">
              <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadBankProof(e.target.files[0])} />
              <Button type="button" variant="outline" size="sm" disabled={uploadingProof} asChild>
                <span><Upload className="w-3 h-3 mr-1" />{uploadingProof ? "Uploaden..." : "Bewijs uploaden"}</span>
              </Button>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
