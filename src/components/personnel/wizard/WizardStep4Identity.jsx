import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Upload, CheckCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function WizardStep4Identity({ sensitiveData, onSensitiveChange, idDoc, onIdDocChange }) {
  const [uploading, setUploading] = useState({ front: false, back: false });

  const uploadFile = async (side, file) => {
    setUploading(p => ({ ...p, [side]: true }));
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    onIdDocChange(side === "front" ? "front_file_url" : "back_file_url", file_url);
    setUploading(p => ({ ...p, [side]: false }));
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
            const label = side === "front" ? "Voorzijde" : "Achterzijde";
            return (
              <div key={side} className="space-y-2">
                <Label>{label}</Label>
                {url ? (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline">Bekijken</a>
                    <button type="button" className="text-destructive text-xs" onClick={() => onIdDocChange(side === "front" ? "front_file_url" : "back_file_url", null)}>Verwijderen</button>
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