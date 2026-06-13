import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Upload, Eye, EyeOff, Lock } from "lucide-react";
import { downloadManagedFile, uploadManagedFile } from "@/lib/managedFiles";

export default function WizardStep3Payroll({ form, onChange, sensitiveData, onSensitiveChange, personnelId, uploadSessionId }) {
  const [showBsn, setShowBsn] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const uploadPayrollDoc = async (file) => {
    setUploadingDoc(true);
    try {
      const result = await uploadManagedFile({
        file,
        ownerType: "personnel",
        ownerId: personnelId || null,
        companyId: form.primary_company_id || null,
        uploadSessionId,
        ownerLabel: form.name || `${form.first_name || ""} ${form.last_name || ""}`.trim() || "Medewerker",
        domain: "payroll",
        category: "payroll_tax_statement",
        sourceEntity: "Personnel",
        sourceEntityId: personnelId || null,
        sourceField: "payroll_tax_statement_file_url",
        documentLabel: "Loonheffingsverklaring",
        effectiveDate: form.payroll_tax_statement_signed_at || null,
        isSensitive: true,
        folderSegments: ["payroll", "loonheffingsverklaring"]
      });
      onChange("payroll_tax_statement_file_url", result.file_url);
      onChange("payroll_tax_statement_file_id", result.managed_file_id);
      onChange("payroll_tax_statement_download_filename", result.download_filename);
      onChange("payroll_tax_statement_logical_path", result.logical_path);
    } finally {
      setUploadingDoc(false);
    }
  };

  return (
    <div className="space-y-6">
      {form.employee_type === "zzp" && (
        <div className="rounded-xl border border-border p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ZZP-bedrijfsgegevens</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Bedrijfsnaam / handelsnaam</Label>
              <Input value={form.self_employed_company_name || ""} onChange={e => onChange("self_employed_company_name", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>KvK-nummer</Label>
              <Input value={form.self_employed_kvk_number || ""} onChange={e => onChange("self_employed_kvk_number", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Btw-nummer</Label>
              <Input value={form.self_employed_vat_number || ""} onChange={e => onChange("self_employed_vat_number", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Aansprakelijkheidsverzekering</Label>
              <Input value={form.self_employed_liability_insurance || ""} onChange={e => onChange("self_employed_liability_insurance", e.target.value)} placeholder="Polisnummer of verzekeraar" />
            </div>
            <div className="space-y-1">
              <Label>Standaard uurtarief excl. btw</Label>
              <Input type="number" step="0.01" value={form.zzp_hourly_rate_excl_vat || ""} onChange={e => onChange("zzp_hourly_rate_excl_vat", Number(e.target.value || 0))} />
            </div>
          </div>
        </div>
      )}

      {/* Geboortegegevens */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Geboorte & Nationaliteit</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1"><Label>Geboorteplaats</Label><Input value={form.place_of_birth || ""} onChange={e => onChange("place_of_birth", e.target.value)} /></div>
          <div className="space-y-1"><Label>Geboorteland</Label><Input value={form.country_of_birth || ""} onChange={e => onChange("country_of_birth", e.target.value)} /></div>
          <div className="space-y-1"><Label>Nationaliteit</Label><Input value={form.nationality || ""} onChange={e => onChange("nationality", e.target.value)} placeholder="Nederlands" /></div>
        </div>
      </div>

      {form.employee_type !== "zzp" && (
        <>
          {/* BSN - Beveiligde sectie */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-semibold text-amber-800">Beveiligde gegevens – alleen voor loonadministratie</p>
            </div>
            <p className="text-xs text-amber-700">BSN mag uitsluitend worden gebruikt voor loongegevens richting de Belastingdienst, niet als login of identificator.</p>
            <div className="space-y-1">
              <Label>BSN (Burgerservicenummer)</Label>
              <div className="flex gap-2">
                <Input
                  type={showBsn ? "text" : "password"}
                  value={sensitiveData.bsn || ""}
                  onChange={e => onSensitiveChange("bsn", e.target.value)}
                  placeholder="000000000"
                  className="font-mono"
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setShowBsn(v => !v)}>
                  {showBsn ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Loonheffingskorting */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Loonheffingskorting</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Loonheffingskorting van toepassing?</Label>
                <Select
                  value={form.payroll_tax_credit_applies === true ? "yes" : form.payroll_tax_credit_applies === false ? "no" : "unknown"}
                  onValueChange={v => onChange("payroll_tax_credit_applies", v === "yes" ? true : v === "no" ? false : null)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Ja</SelectItem>
                    <SelectItem value="no">Nee</SelectItem>
                    <SelectItem value="unknown">Onbekend</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Datum getekende verklaring</Label>
                <Input type="date" value={form.payroll_tax_statement_signed_at || ""} onChange={e => onChange("payroll_tax_statement_signed_at", e.target.value)} />
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <Label>Loonheffingsverklaring uploaden</Label>
              {form.payroll_tax_statement_file_url ? (
                <div className="flex items-center gap-2 text-sm text-primary">
                  <button type="button" onClick={() => downloadManagedFile({ managedFileId: form.payroll_tax_statement_file_id, fileUrl: form.payroll_tax_statement_file_url, filename: form.payroll_tax_statement_download_filename || "Loonheffingsverklaring" })} className="underline text-left">{form.payroll_tax_statement_download_filename || "Huidig bestand bekijken"}</button>
                  <button type="button" className="text-destructive text-xs" onClick={() => {
                    onChange("payroll_tax_statement_file_url", null);
                    onChange("payroll_tax_statement_file_id", null);
                    onChange("payroll_tax_statement_download_filename", null);
                    onChange("payroll_tax_statement_logical_path", null);
                  }}>Verwijderen</button>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadPayrollDoc(e.target.files[0])} />
                  <Button type="button" variant="outline" size="sm" disabled={uploadingDoc} asChild>
                    <span><Upload className="w-3 h-3 mr-1" />{uploadingDoc ? "Uploaden..." : "Verklaring uploaden"}</span>
                  </Button>
                </label>
              )}
            </div>
          </div>
        </>
      )}

      {/* Payroll notities */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
        <Label className="text-amber-800">
          {form.employee_type === "zzp" ? "Administratieve notities (beveiligd)" : "Loonadministratie notities (beveiligd)"}
        </Label>
        <textarea
          className="w-full text-sm rounded-lg border border-amber-200 bg-white p-2 resize-none"
          rows={3}
          value={sensitiveData.payroll_notes || ""}
          onChange={e => onSensitiveChange("payroll_notes", e.target.value)}
          placeholder="Intern gebruik"
        />
      </div>
    </div>
  );
}
