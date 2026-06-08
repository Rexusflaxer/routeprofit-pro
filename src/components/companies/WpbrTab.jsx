import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, Plus, X, Check, ExternalLink } from "lucide-react";

const WPBR_TYPES = ["ND", "HND", "BD", "PAC", "VTC", "PGW", "POB", "other"];

function LicenseStatusBadge({ license }) {
  const today = new Date().toISOString().split("T")[0];
  const isExpired = license.valid_until && license.valid_until < today;
  if (license.status === "superseded") return <Badge variant="outline" className="text-xs text-muted-foreground">Vervangen</Badge>;
  if (isExpired || license.status === "expired") return <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Verlopen</Badge>;
  return <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200 border-0">Actief</Badge>;
}

export default function WpbrTab({ companyId }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    license_type: "", license_number: "", valid_from: "", valid_until: "", notes: "", document_file_url: "", document_filename: ""
  });

  const { data: licenses = [] } = useQuery({
    queryKey: ["wpbr-licenses", companyId],
    queryFn: () => base44.entities.CompanyWpbrLicense.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      // Mark previous active licenses as superseded
      const active = licenses.filter(l => l.status === "active");
      await Promise.all(active.map(l => base44.entities.CompanyWpbrLicense.update(l.id, { status: "superseded" })));
      return base44.entities.CompanyWpbrLicense.create({ ...data, company_id: companyId, status: "active" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wpbr-licenses", companyId] });
      setShowForm(false);
      setForm({ license_type: "", license_number: "", valid_from: "", valid_until: "", notes: "", document_file_url: "", document_filename: "" });
    },
  });

  const handleUpload = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(f => ({ ...f, document_file_url: file_url, document_filename: file.name }));
    } finally {
      setUploading(false);
    }
  };

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const activeLicenses = licenses.filter(l => l.status === "active");
  const historicLicenses = licenses.filter(l => l.status !== "active");

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">WPBR-vergunningen</h3>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nieuwe vergunning
          </Button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">Nieuwe vergunning toevoegen</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Type</label>
              <Select value={form.license_type || "none"} onValueChange={v => set("license_type", v === "none" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Kies type..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Kies type —</SelectItem>
                  {WPBR_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Vergunningsnummer</label>
              <Input value={form.license_number} onChange={e => set("license_number", e.target.value)} className="h-8 text-sm" placeholder="Nummer..." />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Geldig vanaf</label>
              <Input type="date" value={form.valid_from} onChange={e => set("valid_from", e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Geldig tot</label>
              <Input type="date" value={form.valid_until} onChange={e => set("valid_until", e.target.value)} className="h-8 text-sm" />
            </div>
          </div>

          {/* Document upload */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Vergunningsdocument</label>
            {form.document_file_url ? (
              <div className="flex items-center gap-2">
                <a href={form.document_file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                  <FileText className="w-4 h-4" /> {form.document_filename || "Document"}
                </a>
                <button onClick={() => set("document_file_url", "")} className="text-muted-foreground hover:text-destructive">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 cursor-pointer w-fit">
                <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                <Button type="button" variant="outline" size="sm" disabled={uploading} asChild>
                  <span><Upload className="w-4 h-4 mr-1" /> {uploading ? "Uploaden..." : "Document uploaden"}</span>
                </Button>
              </label>
            )}
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Opmerkingen</label>
            <Input value={form.notes} onChange={e => set("notes", e.target.value)} className="h-8 text-sm" placeholder="Optioneel..." />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
            <Button size="sm" onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}>
              <Check className="w-4 h-4 mr-1" /> {createMutation.isPending ? "Opslaan..." : "Opslaan"}
            </Button>
          </div>
        </div>
      )}

      {/* Active licenses */}
      {activeLicenses.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground">Nog geen vergunning geregistreerd.</p>
      )}
      {activeLicenses.map(l => (
        <LicenseCard key={l.id} license={l} />
      ))}

      {/* Historic licenses */}
      {historicLicenses.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vorige vergunningen</p>
          {historicLicenses.map(l => (
            <LicenseCard key={l.id} license={l} muted />
          ))}
        </div>
      )}
    </div>
  );
}

function LicenseCard({ license, muted }) {
  return (
    <div className={`rounded-lg border p-4 space-y-2 ${muted ? "border-border/50 opacity-70" : "border-border bg-card"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{license.license_type || "Onbekend type"}</span>
          {license.license_number && <span className="text-sm text-muted-foreground">#{license.license_number}</span>}
          <LicenseStatusBadge license={license} />
        </div>
        {license.document_file_url && (
          <a href={license.document_file_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0">
            <FileText className="w-3.5 h-3.5" /> Document <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      <div className="flex gap-6 text-xs text-muted-foreground">
        {license.valid_from && <span>Vanaf: <strong className="text-foreground">{license.valid_from}</strong></span>}
        {license.valid_until && <span>Tot: <strong className="text-foreground">{license.valid_until}</strong></span>}
      </div>
      {license.notes && <p className="text-xs text-muted-foreground">{license.notes}</p>}
    </div>
  );
}