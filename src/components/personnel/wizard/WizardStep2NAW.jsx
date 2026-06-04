import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Upload, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function WizardStep2NAW({ form, onChange }) {
  const [uploading, setUploading] = React.useState(false);

  const uploadPhoto = async (file) => {
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    onChange("photo_file_url", file_url);
    setUploading(false);
  };

  // Auto-fill display name from name parts
  const updateName = (field, value) => {
    onChange(field, value);
    const parts = {
      first_name: form.first_name || "",
      name_prefix: form.name_prefix || "",
      last_name: form.last_name || "",
      [field]: value,
    };
    const displayName = [parts.first_name, parts.name_prefix, parts.last_name].filter(Boolean).join(" ");
    if (displayName) onChange("name", displayName);
  };

  return (
    <div className="space-y-6">
      {/* Naam */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Naam</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>Initialen</Label>
            <Input value={form.initials || ""} onChange={e => onChange("initials", e.target.value)} placeholder="A.B." />
          </div>
          <div className="space-y-1">
            <Label>Voornamen (paspoort)</Label>
            <Input value={form.legal_first_names || ""} onChange={e => onChange("legal_first_names", e.target.value)} placeholder="Anna Beatrix" />
          </div>
          <div className="space-y-1">
            <Label>Roepnaam *</Label>
            <Input value={form.first_name || ""} onChange={e => updateName("first_name", e.target.value)} placeholder="Anna" />
          </div>
          <div className="space-y-1">
            <Label>Tussenvoegsel</Label>
            <Input value={form.name_prefix || ""} onChange={e => updateName("name_prefix", e.target.value)} placeholder="van der" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>Achternaam *</Label>
            <Input value={form.last_name || ""} onChange={e => updateName("last_name", e.target.value)} placeholder="Berg" />
          </div>
          <div className="space-y-1">
            <Label>Geslacht</Label>
            <Select value={form.gender || "unknown"} onValueChange={v => onChange("gender", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Man</SelectItem>
                <SelectItem value="female">Vrouw</SelectItem>
                <SelectItem value="other">Anders</SelectItem>
                <SelectItem value="unknown">Onbekend</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Geboortedatum</Label>
            <Input type="date" value={form.date_of_birth || ""} onChange={e => onChange("date_of_birth", e.target.value)} />
          </div>
        </div>
      </div>

      {/* Pasfoto */}
      <div className="space-y-2">
        <Label>Pasfoto</Label>
        <div className="flex items-center gap-3">
          {form.photo_file_url && (
            <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-border">
              <img src={form.photo_file_url} alt="foto" className="object-cover w-full h-full" />
              <button type="button" onClick={() => onChange("photo_file_url", null)} className="absolute top-0 right-0 bg-destructive text-destructive-foreground rounded-full p-0.5">
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
            <Button type="button" variant="outline" size="sm" disabled={uploading} asChild>
              <span><Upload className="w-3 h-3 mr-1" />{uploading ? "Uploaden..." : "Foto uploaden"}</span>
            </Button>
          </label>
        </div>
      </div>

      {/* Contact */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Contact</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1"><Label>E-mail</Label><Input type="email" value={form.email || ""} onChange={e => onChange("email", e.target.value)} /></div>
          <div className="space-y-1"><Label>Telefoon</Label><Input value={form.phone || ""} onChange={e => onChange("phone", e.target.value)} placeholder="+31 6 12345678" /></div>
        </div>
      </div>

      {/* Adres */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Woonadres</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-2 space-y-1"><Label>Straatnaam</Label><Input value={form.street_name || ""} onChange={e => onChange("street_name", e.target.value)} /></div>
          <div className="space-y-1"><Label>Huisnummer</Label><Input value={form.house_number || ""} onChange={e => onChange("house_number", e.target.value)} /></div>
          <div className="space-y-1"><Label>Toevoeging</Label><Input value={form.house_number_addition || ""} onChange={e => onChange("house_number_addition", e.target.value)} /></div>
          <div className="space-y-1"><Label>Postcode</Label><Input value={form.postal_code || ""} onChange={e => onChange("postal_code", e.target.value)} /></div>
          <div className="space-y-1"><Label>Plaats</Label><Input value={form.city || ""} onChange={e => onChange("city", e.target.value)} /></div>
          <div className="col-span-2 space-y-1"><Label>Land</Label><Input value={form.country || "Nederland"} onChange={e => onChange("country", e.target.value)} /></div>
        </div>
      </div>

      {/* Reiskostenadres */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Switch checked={!!form.travel_expense_address_differs} onCheckedChange={v => onChange("travel_expense_address_differs", v)} />
          <Label>Reiskostenvergoeding-adres wijkt af van woonadres</Label>
        </div>
        {form.travel_expense_address_differs && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pl-4 border-l-2 border-border">
            <div className="col-span-2 space-y-1"><Label>Straatnaam</Label><Input value={form.travel_street_name || ""} onChange={e => onChange("travel_street_name", e.target.value)} /></div>
            <div className="space-y-1"><Label>Huisnummer</Label><Input value={form.travel_house_number || ""} onChange={e => onChange("travel_house_number", e.target.value)} /></div>
            <div className="space-y-1"><Label>Toevoeging</Label><Input value={form.travel_house_number_addition || ""} onChange={e => onChange("travel_house_number_addition", e.target.value)} /></div>
            <div className="space-y-1"><Label>Postcode</Label><Input value={form.travel_postal_code || ""} onChange={e => onChange("travel_postal_code", e.target.value)} /></div>
            <div className="space-y-1"><Label>Plaats</Label><Input value={form.travel_city || ""} onChange={e => onChange("travel_city", e.target.value)} /></div>
          </div>
        )}
      </div>
    </div>
  );
}