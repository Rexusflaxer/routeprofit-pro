import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Edit, Check, X, Building2, Phone, Mail, Globe, MapPin, FileText, Upload, Shield, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import WpbrTab from "@/components/companies/WpbrTab";
import SidebarPanel from "@/components/companies/CompanySidebarPanel";

const ROLE_LABELS = {
  holding: "Holding", operating_company: "Werkmaatschappij",
  sole_proprietor: "Eenmanszaak", other: "Overig",
};

const ACTIVITY_LABELS = {
  private_security: "Particuliere beveiliging", event_hospitality_security: "Evenementen/horeca",
  object_security: "Objectbeveiliging", mobile_surveillance: "Mobiele surveillance",
  alarm_center: "Alarmcentrale", video_surveillance_center: "Videotoezicht",
  security_installation: "Beveiligingsinstallaties", traffic_controller: "Verkeersregelaars",
  fire_watch: "Brandwacht", bhv: "BHV", private_investigation: "Recherche",
  reception_host: "Receptie/host", other: "Overig",
};

const ACTIVITIES = Object.entries(ACTIVITY_LABELS).map(([key, label]) => ({ key, label }));
const LEGAL_FORMS = ["BV", "NV", "VOF", "CV", "Eenmanszaak", "Maatschap", "Stichting", "Coöperatie", "Anders"];
const STATUS_COLORS = {
  active: "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-300",
  inactive: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  archived: "bg-red-50 text-red-600 dark:bg-red-900 dark:text-red-300",
};

function InfoRow({ label, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4 py-1">
      <span className="text-xs text-muted-foreground w-40 shrink-0 pt-1">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function ViewText({ value, fallback = "—" }) {
  return <span className="text-sm text-foreground font-medium">{value || fallback}</span>;
}

export default function CompanyDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const companyId = urlParams.get("id");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const addressTimeout = useRef(null);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showAddressSugg, setShowAddressSugg] = useState(false);

  const { data: companies = [] } = useQuery({
    queryKey: ["companies"],
    queryFn: () => base44.entities.Company.list(),
  });

  const company = companies.find(c => c.id === companyId);
  const holdingCompany = company?.holding_company_id
    ? companies.find(c => c.id === company.holding_company_id)
    : null;

  const { data: caoConfigurations = [] } = useQuery({
    queryKey: ["cao-configuration-options-detail"],
    queryFn: async () => {
      const ids = company?.default_cao_configuration_id ? [company.default_cao_configuration_id] : [];
      if (!ids.length) return [];
      const { data } = await base44.functions.invoke("listCaoConfigurationOptions", { include_ids: ids });
      return data?.options || [];
    },
    enabled: !!company,
  });

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.Company.update(companyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setEditing(false);
    },
  });

  const startEdit = () => {
    setForm({ ...company });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setForm(null);
  };

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleAddressQuery = (val) => {
    set("street_name", val);
    if (addressTimeout.current) clearTimeout(addressTimeout.current);
    if (val.length >= 3) {
      addressTimeout.current = setTimeout(async () => {
        const { data } = await base44.functions.invoke("searchAddress", { query: val });
        setAddressSuggestions(data.suggestions || []);
        setShowAddressSugg(true);
      }, 300);
    } else setShowAddressSugg(false);
  };

  const selectAddress = (s) => {
    setForm(f => ({
      ...f,
      street_name: s.street_name || s.address,
      house_number: s.house_number || f.house_number,
      postal_code: s.postal_code || f.postal_code,
      city: s.city || f.city,
    }));
    setShowAddressSugg(false);
  };

  const uploadLogo = async (file) => {
    setUploadingLogo(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set("logo_file_url", file_url);
    } finally {
      setUploadingLogo(false);
    }
  };

  const toggleActivity = (key) => {
    const current = form.activities || [];
    set("activities", current.includes(key) ? current.filter(a => a !== key) : [...current, key]);
  };

  if (!company && companies.length > 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <p>Bedrijf niet gevonden.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/Companies")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Terug naar bedrijven
        </Button>
      </div>
    );
  }

  if (!company) {
    return <div className="py-16 text-center text-muted-foreground text-sm">Laden...</div>;
  }

  const data = editing ? form : company;

  const address = [
    company.street_name && `${company.street_name} ${company.house_number || ""}${company.house_number_addition || ""}`.trim(),
    company.postal_code && company.city && `${company.postal_code} ${company.city}`,
    company.country !== "Nederland" ? company.country : null,
  ].filter(Boolean).join(", ");

  const caoName = caoConfigurations.find(c => c.id === company.default_cao_configuration_id);
  const holdingOptions = companies.filter(c => c.id !== companyId && c.company_role === "holding");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/Companies")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Bedrijven
        </Button>
      </div>

      {/* Company card */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Top banner */}
        <div className="bg-muted/40 border-b border-border px-6 py-5 flex items-center gap-5">
          <div className="w-16 h-16 rounded-xl border border-border bg-white flex items-center justify-center overflow-hidden shrink-0 relative group">
            {data.logo_file_url
              ? <img src={data.logo_file_url} alt="logo" className="object-contain w-full h-full p-1" />
              : <Building2 className="w-8 h-8 text-muted-foreground/50" />
            }
            {editing && (
              <label className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer rounded-xl">
                <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                <Upload className="w-5 h-5 text-white" />
              </label>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex flex-col gap-2 max-w-md">
                <div>
                  <span className="text-xs text-muted-foreground">Bedrijfsnaam</span>
                  <Input value={data.display_name || ""} onChange={e => set("display_name", e.target.value)} className="text-lg font-bold h-9 mt-0.5" placeholder="Bedrijfsnaam" />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Handelsnaam</span>
                  <Input value={data.legal_name || ""} onChange={e => set("legal_name", e.target.value)} className="text-sm h-8 mt-0.5" placeholder="Handelsnaam" />
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-foreground">{company.display_name}</h1>
                  <Badge variant="outline" className="text-xs">{ROLE_LABELS[company.company_role] || company.company_role}</Badge>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[company.status] || ""}`}>
                    {company.status === "active" ? "Actief" : company.status === "inactive" ? "Inactief" : "Gearchiveerd"}
                  </span>
                </div>
                {company.legal_name && company.legal_name !== company.display_name && (
                  <p className="text-sm text-muted-foreground mt-0.5">Handelsnaam: {company.legal_name}</p>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={cancelEdit}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
                <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
                  <Check className="w-4 h-4 mr-1" /> {saveMutation.isPending ? "Opslaan..." : "Opslaan"}
                </Button>
              </>
            ) : (
              <Button onClick={startEdit}>
                <Edit className="w-4 h-4 mr-1" /> Wijzigen
              </Button>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">

          {/* Juridisch */}
          <div className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Juridische gegevens</h3>
            <InfoRow label="KvK-nummer">
              {editing ? <Input value={data.kvk_number || ""} onChange={e => set("kvk_number", e.target.value)} className="h-8 text-sm" /> : <ViewText value={data.kvk_number} />}
            </InfoRow>
            <InfoRow label="RSIN">
              {editing ? <Input value={data.rsin || ""} onChange={e => set("rsin", e.target.value)} className="h-8 text-sm" /> : <ViewText value={data.rsin} />}
            </InfoRow>
            <InfoRow label="BTW-nummer">
              {editing ? <Input value={data.btw_number || ""} onChange={e => set("btw_number", e.target.value)} className="h-8 text-sm" /> : <ViewText value={data.btw_number} />}
            </InfoRow>
            <InfoRow label="Rechtsvorm">
              {editing
                ? <Select value={data.legal_form || ""} onValueChange={v => set("legal_form", v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Kies..." /></SelectTrigger>
                    <SelectContent>{LEGAL_FORMS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                  </Select>
                : <ViewText value={data.legal_form} />}
            </InfoRow>


            {(holdingOptions.length > 0 || holdingCompany) && (
              <InfoRow label="Onder holding">
                {editing
                  ? <Select value={data.holding_company_id || "none"} onValueChange={v => set("holding_company_id", v === "none" ? null : v)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Geen" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Geen</SelectItem>
                        {holdingOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  : <ViewText value={holdingCompany?.display_name} />}
              </InfoRow>
            )}
          </div>

          {/* Contact & Adres */}
          <div className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Contact & Adres</h3>
            <InfoRow label="Straatnaam">
              {editing
                ? <div className="relative">
                    <Input value={data.street_name || ""} onChange={e => handleAddressQuery(e.target.value)} className="h-8 text-sm" autoComplete="off" />
                    {showAddressSugg && addressSuggestions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {addressSuggestions.map((s, i) => (
                          <button key={i} type="button" onClick={() => selectAddress(s)} className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex gap-2 text-foreground">
                            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />{s.address}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                : <ViewText value={data.street_name} />}
            </InfoRow>
            <InfoRow label="Huisnummer">
              {editing
                ? <div className="flex gap-2">
                    <Input value={data.house_number || ""} onChange={e => set("house_number", e.target.value)} className="h-8 text-sm w-24" placeholder="Nr." />
                    <Input value={data.house_number_addition || ""} onChange={e => set("house_number_addition", e.target.value)} className="h-8 text-sm w-20" placeholder="Toev." />
                  </div>
                : <ViewText value={[data.house_number, data.house_number_addition].filter(Boolean).join(" ")} />}
            </InfoRow>
            <InfoRow label="Postcode">
              {editing ? <Input value={data.postal_code || ""} onChange={e => set("postal_code", e.target.value)} className="h-8 text-sm" /> : <ViewText value={data.postal_code} />}
            </InfoRow>
            <InfoRow label="Plaats">
              {editing ? <Input value={data.city || ""} onChange={e => set("city", e.target.value)} className="h-8 text-sm" /> : <ViewText value={data.city} />}
            </InfoRow>
            <InfoRow label="Land">
              {editing ? <Input value={data.country || "Nederland"} onChange={e => set("country", e.target.value)} className="h-8 text-sm" /> : <ViewText value={data.country} />}
            </InfoRow>
            <InfoRow label="Telefoon">
              {editing ? <Input value={data.phone || ""} onChange={e => set("phone", e.target.value)} className="h-8 text-sm" /> : <ViewText value={data.phone} />}
            </InfoRow>
            <InfoRow label="E-mail">
              {editing
                ? <Input type="email" value={data.email || ""} onChange={e => set("email", e.target.value)} className="h-8 text-sm" />
                : data.email ? <a href={`mailto:${data.email}`} className="text-sm text-foreground font-medium hover:underline">{data.email}</a> : <ViewText value={null} />}
            </InfoRow>
            <InfoRow label="Website">
              {editing
                ? <Input value={data.website || ""} onChange={e => set("website", e.target.value)} className="h-8 text-sm" placeholder="https://" />
                : data.website ? <a href={data.website} target="_blank" rel="noopener noreferrer" className="text-sm text-foreground font-medium hover:underline">{data.website}</a> : <ViewText value={null} />}
            </InfoRow>
          </div>

          {/* Activiteiten */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activiteiten</h3>
            {editing
              ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {ACTIVITIES.map(a => (
                    <label key={a.key} className="flex items-center gap-2 text-sm cursor-pointer p-1.5 rounded hover:bg-muted/50">
                      <Checkbox checked={(data.activities || []).includes(a.key)} onCheckedChange={() => toggleActivity(a.key)} />
                      {a.label}
                    </label>
                  ))}
                </div>
              : <div className="flex flex-wrap gap-1.5">
                  {(data.activities || []).length > 0
                    ? (data.activities || []).map(a => <span key={a} className="text-xs bg-muted text-foreground px-2 py-1 rounded-md">{ACTIVITY_LABELS[a] || a}</span>)
                    : <span className="text-sm text-muted-foreground">—</span>}
                </div>}
          </div>



          {/* Notities */}
          <div className="space-y-3 md:col-span-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notities</h3>
            {editing
              ? <Textarea value={data.notes || ""} onChange={e => set("notes", e.target.value)} rows={3} />
              : data.notes ? <p className="text-sm text-foreground whitespace-pre-wrap">{data.notes}</p> : <span className="text-sm text-muted-foreground">—</span>}
          </div>

          {/* Briefpapier */}
          {(data.letterhead_file_url || editing) && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Briefpapier</h3>
              {data.letterhead_file_url && (
                <a href={data.letterhead_file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                  <FileText className="w-4 h-4" /> Briefpapier bekijken
                </a>
              )}
            </div>
          )}
        </div>

        {/* Save bar at bottom when editing */}
        {editing && (
          <div className="border-t border-border bg-muted/30 px-6 py-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={cancelEdit}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
            <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
              <Check className="w-4 h-4 mr-1" /> {saveMutation.isPending ? "Opslaan..." : "Wijzigingen opslaan"}
            </Button>
          </div>
        )}
      </div>

      {/* WPBR & CAO sectie met sidebar-menu */}
      <SidebarPanel
        companyId={companyId}
        editing={editing}
        data={data}
        caoConfigurations={caoConfigurations}
        caoName={caoName}
        set={set}
        startEdit={startEdit}
        cancelEdit={cancelEdit}
        saveMutation={saveMutation}
        form={form}
        companies={companies}
        company={company}
      />
    </div>
  );
}