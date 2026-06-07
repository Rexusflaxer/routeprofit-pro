import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search, Upload, X, MapPin } from "lucide-react";

const ACTIVITIES = [
  { key: "private_security", label: "Particulier beveiligingsbedrijf" },
  { key: "event_hospitality_security", label: "Evenementen- en horecabeveiliging" },
  { key: "object_security", label: "Objectbeveiliging" },
  { key: "mobile_surveillance", label: "Mobiele surveillance" },
  { key: "alarm_center", label: "Particuliere alarmcentrale" },
  { key: "video_surveillance_center", label: "Videotoezichtcentrale" },
  { key: "security_installation", label: "Beveiligingsinstallaties / alarminstallateur" },
  { key: "traffic_controller", label: "Verkeersregelaars" },
  { key: "fire_watch", label: "Brandwacht" },
  { key: "bhv", label: "Bedrijfshulpverlening" },
  { key: "private_investigation", label: "Particulier onderzoek / recherche" },
  { key: "reception_host", label: "Receptie / hostdiensten" },
  { key: "other", label: "Overig" },
];

const LEGAL_FORMS = ["BV", "NV", "VOF", "CV", "Eenmanszaak", "Maatschap", "Stichting", "Coöperatie", "Anders"];
const WPBR_TYPES = ["ND", "HND", "BD", "PAC", "VTC", "PGW", "POB", "none", "other"];

export default function CompanyForm({ company, companies = [], caoConfigurations = [], onSave, onCancel }) {
  const [form, setForm] = useState(company || {
    display_name: "", legal_name: "", trade_name: "", kvk_number: "", rsin: "", btw_number: "",
    legal_form: "", status: "active", company_role: "operating_company", holding_company_id: null,
    primary_activity: null, activities: [], wpbr_license_type: null, wpbr_license_number: "", wpbr_license_valid_until: "",
    street_name: "", house_number: "", house_number_addition: "", postal_code: "", city: "", country: "Nederland",
    phone: "", email: "", website: "", logo_file_url: null, letterhead_file_url: null,
    default_cao_configuration_id: null, notes: "",
  });

  const [kvkSearch, setKvkSearch] = useState("");
  const [kvkResults, setKvkResults] = useState([]);
  const [kvkLoading, setKvkLoading] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showAddressSugg, setShowAddressSugg] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingLetterhead, setUploadingLetterhead] = useState(false);
  const addressTimeout = useRef(null);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleKvkSearch = async () => {
    if (!kvkSearch.trim()) return;
    setKvkLoading(true);
    try {
      const { data } = await base44.functions.invoke("searchKvK", { query: kvkSearch });
      setKvkResults(data.results || []);
    } finally {
      setKvkLoading(false);
    }
  };

  const applyKvkResult = (result) => {
    setForm(f => ({
      ...f,
      legal_name: result.name || f.legal_name,
      display_name: f.display_name || result.name || "",
      kvk_number: result.kvk_number || result.kvkNumber || f.kvk_number,
      street_name: result.street_name || result.streetName || f.street_name,
      house_number: result.house_number || result.houseNumber || f.house_number,
      postal_code: result.postal_code || result.postalCode || f.postal_code,
      city: result.city || f.city,
    }));
    setKvkResults([]);
  };

  const handleAddressQuery = (val) => {
    set("street_name", val);
    if (addressTimeout.current) clearTimeout(addressTimeout.current);
    if (val.length >= 3) {
      addressTimeout.current = setTimeout(async () => {
        const { data } = await base44.functions.invoke("searchAddress", { query: val });
        setAddressSuggestions(data.suggestions || []);
        setShowAddressSugg(true);
      }, 300);
    } else {
      setShowAddressSugg(false);
    }
  };

  const selectAddress = (s) => {
    setForm(f => ({
      ...f,
      street_name: s.street_name || s.address,
      house_number: s.house_number || f.house_number,
      postal_code: s.postal_code || f.postal_code,
      city: s.city || f.city,
      full_address: s.address,
    }));
    setShowAddressSugg(false);
  };

  const uploadFile = async (file, field, setLoading) => {
    setLoading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set(field, file_url);
    } finally {
      setLoading(false);
    }
  };

  const toggleActivity = (key) => {
    const current = form.activities || [];
    set("activities", current.includes(key) ? current.filter(a => a !== key) : [...current, key]);
  };

  const holdingOptions = companies.filter(c => c.id !== company?.id && c.company_role === "holding");

  return (
    <div className="space-y-4">
      <Tabs defaultValue="identity">
        <TabsList className="flex flex-wrap h-auto gap-1 mb-2">
          <TabsTrigger value="identity">Identiteit</TabsTrigger>
          <TabsTrigger value="activities">Activiteiten</TabsTrigger>
          <TabsTrigger value="address">Adres & Contact</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="cao">CAO's</TabsTrigger>
        </TabsList>

        {/* IDENTITEIT */}
        <TabsContent value="identity" className="space-y-4 pt-2">
          {/* KvK zoeken */}
          <div className="rounded-lg bg-muted/50 p-3 border border-border">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">KvK zoeken (optioneel)</Label>
            <div className="flex gap-2 mt-2">
              <Input value={kvkSearch} onChange={e => setKvkSearch(e.target.value)} placeholder="Bedrijfsnaam of KvK-nummer" onKeyDown={e => e.key === "Enter" && handleKvkSearch()} />
              <Button type="button" variant="outline" onClick={handleKvkSearch} disabled={kvkLoading}>
                <Search className="w-4 h-4" />
              </Button>
            </div>
            {kvkResults.length > 0 && (
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {kvkResults.map((r, i) => (
                  <button key={i} type="button" onClick={() => applyKvkResult(r)}
                    className="w-full text-left px-3 py-2 rounded bg-background border border-border text-sm hover:bg-accent hover:border-ring text-foreground">
                    <strong>{r.name}</strong> — {r.kvk_number || r.kvkNumber} — {r.city}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Weergavenaam *</Label>
              <Input value={form.display_name} onChange={e => set("display_name", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Juridische naam *</Label>
              <Input value={form.legal_name} onChange={e => set("legal_name", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Handelsnaam</Label>
              <Input value={form.trade_name || ""} onChange={e => set("trade_name", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>KvK-nummer</Label>
              <Input value={form.kvk_number || ""} onChange={e => set("kvk_number", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>RSIN</Label>
              <Input value={form.rsin || ""} onChange={e => set("rsin", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>BTW-nummer</Label>
              <Input value={form.btw_number || ""} onChange={e => set("btw_number", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Rechtsvorm</Label>
              <Select value={form.legal_form || ""} onValueChange={v => set("legal_form", v)}>
                <SelectTrigger><SelectValue placeholder="Kies..." /></SelectTrigger>
                <SelectContent>{LEGAL_FORMS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Rol</Label>
              <Select value={form.company_role} onValueChange={v => set("company_role", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="holding">Holding</SelectItem>
                  <SelectItem value="operating_company">Werkmaatschappij</SelectItem>
                  <SelectItem value="sole_proprietor">Eenmanszaak</SelectItem>
                  <SelectItem value="other">Overig</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {holdingOptions.length > 0 && (
              <div className="space-y-1 md:col-span-2">
                <Label>Onder holding</Label>
                <Select value={form.holding_company_id || "none"} onValueChange={v => set("holding_company_id", v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Geen holding" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Geen</SelectItem>
                    {holdingOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Actief</SelectItem>
                  <SelectItem value="inactive">Inactief</SelectItem>
                  <SelectItem value="archived">Gearchiveerd</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>

        {/* ACTIVITEITEN */}
        <TabsContent value="activities" className="space-y-4 pt-2">
          <div className="space-y-1">
            <Label>Primaire activiteit</Label>
            <Select value={form.primary_activity || "none"} onValueChange={v => set("primary_activity", v === "none" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Kies primaire activiteit" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Geen —</SelectItem>
                {ACTIVITIES.map(a => <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-2 block">Activiteiten (meerdere mogelijk)</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ACTIVITIES.map(a => (
                <label key={a.key} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded hover:bg-muted/50">
                  <Checkbox checked={(form.activities || []).includes(a.key)} onCheckedChange={() => toggleActivity(a.key)} />
                  {a.label}
                </label>
              ))}
            </div>
          </div>
          <div className="border-t pt-4">
            <Label className="text-sm font-semibold text-foreground mb-3 block">Wpbr-vergunning</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={form.wpbr_license_type || "none"} onValueChange={v => set("wpbr_license_type", v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Geen</SelectItem>
                    {WPBR_TYPES.filter(t => t !== "none").map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Vergunningsnummer</Label>
                <Input value={form.wpbr_license_number || ""} onChange={e => set("wpbr_license_number", e.target.value)} placeholder="Bijv. NL-1234567" />
              </div>
              <div className="space-y-1">
                <Label>Geldig tot</Label>
                <Input type="date" value={form.wpbr_license_valid_until || ""} onChange={e => set("wpbr_license_valid_until", e.target.value)} />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ADRES & CONTACT */}
        <TabsContent value="address" className="space-y-4 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 relative">
              <Label>Straatnaam</Label>
              <Input value={form.street_name || ""} onChange={e => handleAddressQuery(e.target.value)} autoComplete="off" />
              {showAddressSugg && addressSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {addressSuggestions.map((s, i) => (
                    <button key={i} type="button" onClick={() => selectAddress(s)} className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex gap-2 text-foreground">
                      <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />{s.address}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <div className="space-y-1 flex-1">
                <Label>Huisnummer</Label>
                <Input value={form.house_number || ""} onChange={e => set("house_number", e.target.value)} />
              </div>
              <div className="space-y-1 w-24">
                <Label>Toev.</Label>
                <Input value={form.house_number_addition || ""} onChange={e => set("house_number_addition", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Postcode</Label>
              <Input value={form.postal_code || ""} onChange={e => set("postal_code", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Plaats</Label>
              <Input value={form.city || ""} onChange={e => set("city", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Land</Label>
              <Input value={form.country || "Nederland"} onChange={e => set("country", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Telefoon</Label>
              <Input value={form.phone || ""} onChange={e => set("phone", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input type="email" value={form.email || ""} onChange={e => set("email", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Website</Label>
              <Input value={form.website || ""} onChange={e => set("website", e.target.value)} placeholder="https://" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notities</Label>
            <Textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} rows={3} />
          </div>
        </TabsContent>

        {/* BRANDING */}
        <TabsContent value="branding" className="space-y-5 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Logo</Label>
              {form.logo_file_url && (
                <div className="relative w-32 h-20 border border-border rounded-lg overflow-hidden bg-muted/50">
                  <img src={form.logo_file_url} alt="logo" className="object-contain w-full h-full p-1" />
                  <button type="button" onClick={() => set("logo_file_url", null)} className="absolute top-1 right-1 bg-white rounded-full p-0.5 shadow">
                    <X className="w-3 h-3 text-red-500" />
                  </button>
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer w-fit">
                <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0], "logo_file_url", setUploadingLogo)} />
                <Button type="button" variant="outline" size="sm" disabled={uploadingLogo}>
                  <Upload className="w-4 h-4 mr-1" /> {uploadingLogo ? "Uploaden..." : "Logo uploaden"}
                </Button>
              </label>
            </div>
            <div className="space-y-2">
              <Label>Briefpapier</Label>
              {form.letterhead_file_url && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <a href={form.letterhead_file_url} target="_blank" rel="noopener noreferrer" className="underline">Huidig bestand bekijken</a>
                  <button type="button" onClick={() => set("letterhead_file_url", null)}><X className="w-4 h-4 text-red-500" /></button>
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer w-fit">
                <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0], "letterhead_file_url", setUploadingLetterhead)} />
                <Button type="button" variant="outline" size="sm" disabled={uploadingLetterhead}>
                  <Upload className="w-4 h-4 mr-1" /> {uploadingLetterhead ? "Uploaden..." : "Briefpapier uploaden"}
                </Button>
              </label>
            </div>
          </div>
        </TabsContent>

        {/* CAO */}
        <TabsContent value="cao" className="space-y-4 pt-2">
          <div className="space-y-1">
            <Label>Standaard CAO</Label>
            <Select value={form.default_cao_configuration_id || "none"} onValueChange={v => set("default_cao_configuration_id", v === "none" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Kies een CAO" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Geen standaard —</SelectItem>
                {caoConfigurations.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.display_name || c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>Annuleren</Button>
        <Button type="button" onClick={() => onSave(form)}>Opslaan</Button>
      </div>
    </div>
  );
}
