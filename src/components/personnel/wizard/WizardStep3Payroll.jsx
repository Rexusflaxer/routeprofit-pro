import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Upload, Eye, EyeOff, Lock } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function WizardStep3Payroll({ form, onChange, sensitiveData, onSensitiveChange }) {
  const [showBsn, setShowBsn] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const uploadPayrollDoc = async (file) => {
    setUploadingDoc(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    onChange("payroll_tax_statement_file_url", file_url);
    setUploadingDoc(false);
  };

  return (
    <div className="space-y-6">
      {/* Geboortegegevens */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Geboorte & Nationaliteit</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1"><Label>Geboorteplaats</Label><Input value={form.place_of_birth || ""} onChange={e => onChange("place_of_birth", e.target.value)} /></div>
          <div className="space-y-1"><Label>Geboorteland</Label><Input value={form.country_of_birth || ""} onChange={e => onChange("country_of_birth", e.target.value)} /></div>
          <div className="space-y-1"><Label>Nationaliteit</Label><Input value={form.nationality || ""} onChange={e => onChange("nationality", e.target.value)} placeholder="Nederlands" /></div>
        </div>
      </div>

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
              <a href={form.payroll_tax_statement_file_url} target="_blank" rel="noopener noreferrer" className="underline">Huidig bestand bekijken</a>
              <button type="button" className="text-destructive text-xs" onClick={() => onChange("payroll_tax_statement_file_url", null)}>Verwijderen</button>
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

      {/* Payroll notities */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
        <Label className="text-amber-800">Loonadministratie notities (beveiligd)</Label>
        <textarea
          className="w-full text-sm rounded-lg border border-amber-200 bg-white p-2 resize-none"
          rows={3}
          value={sensitiveData.payroll_notes || ""}
          onChange={e => onSensitiveChange("payroll_notes", e.target.value)}
          placeholder="Intern gebruik – niet zichtbaar in personeelslijst"
        />
      </div>
    </div>
  );
}