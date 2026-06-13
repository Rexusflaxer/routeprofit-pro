import React, { useEffect, useState, useRef } from "react";
import PageTransition from "@/components/ui-custom/PageTransition";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Edit, Check, X, Building2, MapPin, FileText, Upload, Handshake } from "lucide-react";
import { useNavigate } from "react-router-dom";
import SidebarPanel from "@/components/companies/CompanySidebarPanel";
import { uploadManagedFile, updateManagedFileSource } from "@/lib/managedFiles";

const ROLE_LABELS = {
  holding: "Holding", operating_company: "Werkmaatschappij",
  sole_proprietor: "Eenmanszaak", other: "Overig",
};

const ACTIVITY_LABELS = {
  private_security: "Particuliere beveiliging", event_hospitality_security: "Evenementen/horeca",
  object_security: "Objectbeveiliging", mobile_surveillance: "Mobiele surveillance",
  alarm_response: "Alarmopvolging", alarm_center: "Alarmcentrale", video_surveillance_center: "Videotoezicht",
  security_installation: "Beveiligingsinstallaties", traffic_controller: "Verkeersregelaars",
  fire_watch: "Brandwacht", bhv: "BHV", private_investigation: "Recherche",
  reception_host: "Receptie/host", other: "Overig",
};

const ACTIVITIES = Object.entries(ACTIVITY_LABELS).map(([key, label]) => ({ key, label }));
const LEGAL_FORMS = ["BV", "NV", "VOF", "CV", "Eenmanszaak", "Maatschap", "Stichting", "Coöperatie", "Anders"];
const NEW_COMPANY_PLACEHOLDER = "Nieuw bedrijf";
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

function editableCompanyForm(company, blankPlaceholder = false) {
  const shouldBlank = blankPlaceholder && company.display_name === NEW_COMPANY_PLACEHOLDER && company.legal_name === NEW_COMPANY_PLACEHOLDER;
  return {
    ...company,
    display_name: shouldBlank ? "" : company.display_name || "",
    legal_name: shouldBlank ? "" : company.legal_name || "",
    trade_name: company.trade_name || "",
    status: company.status || "inactive",
    company_role: company.company_role || "operating_company",
    country: company.country || "Nederland",
    activities: company.activities || [],
  };
}

function normalizeCompanyPayload(data) {
  const displayName = data.display_name?.trim() || NEW_COMPANY_PLACEHOLDER;
  const legalName = data.legal_name?.trim() || displayName;

  return {
    ...data,
    display_name: displayName,
    legal_name: legalName,
    trade_name: data.trade_name?.trim() || null,
    kvk_number: data.kvk_number?.trim() || null,
    rsin: data.rsin?.trim() || null,
    btw_number: data.btw_number?.trim() || null,
    legal_form: data.legal_form || null,
    holding_company_id: data.holding_company_id || null,
    primary_activity: data.primary_activity || null,
    activities: data.activities || [],
    street_name: data.street_name?.trim() || null,
    house_number: data.house_number?.trim() || null,
    house_number_addition: data.house_number_addition?.trim() || null,
    postal_code: data.postal_code?.trim() || null,
    city: data.city?.trim() || null,
    country: data.country?.trim() || "Nederland",
    phone: data.phone?.trim() || null,
    email: data.email?.trim() || null,
    website: data.website?.trim() || null,
    notes: data.notes?.trim() || null,
  };
}

function isEmptyDraftCompany(data = {}) {
  const textFields = [
    "display_name",
    "legal_name",
    "trade_name",
    "kvk_number",
    "rsin",
    "btw_number",
    "legal_form",
    "holding_company_id",
    "primary_activity",
    "street_name",
    "house_number",
    "house_number_addition",
    "postal_code",
    "city",
    "phone",
    "email",
    "website",
    "notes",
    "logo_file_url",
    "letterhead_file_url",
  ];

  return textFields.every(field => !String(data[field] || "").trim())
    && (data.country || "Nederland") === "Nederland"
    && (data.status || "inactive") === "inactive"
    && (data.company_role || "operating_company") === "operating_company"
    && !(data.activities || []).length;
}

export default function CompanyDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const companyId = urlParams.get("id");
  const isNewProfileFlow = urlParams.get("new") === "1";
  const shouldOpenInEditMode = isNewProfileFlow || urlParams.get("edit") === "1";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const addressTimeout = useRef(null);
  const initializedRequestedEdit = useRef(false);
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
    mutationFn: (data) => base44.entities.Company.update(companyId, normalizeCompanyPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setEditing(false);
      setForm(null);
      if (shouldOpenInEditMode) {
        navigate(`/CompanyDetail?id=${companyId}`, { replace: true });
      }
    },
  });

  const deleteDraftCompanyMutation = useMutation({
    mutationFn: () => base44.entities.Company.delete(companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      navigate("/Companies", { replace: true });
    },
  });

  const startEdit = () => {
    setForm(editableCompanyForm(company));
    setEditing(true);
  };

  const cancelEdit = () => {
    if (isNewProfileFlow && isEmptyDraftCompany(form)) {
      deleteDraftCompanyMutation.mutate();
      return;
    }

    setEditing(false);
    setForm(null);
    if (shouldOpenInEditMode) {
      navigate(`/CompanyDetail?id=${companyId}`, { replace: true });
    }
  };

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  useEffect(() => {
    if (!company || !shouldOpenInEditMode || initializedRequestedEdit.current) return;

    setForm(editableCompanyForm(company, isNewProfileFlow));
    setEditing(true);
    initializedRequestedEdit.current = true;
  }, [company, isNewProfileFlow, shouldOpenInEditMode]);

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
      const result = await uploadManagedFile({
        file,
        ownerType: "company",
        ownerId: companyId,
        companyId,
        ownerLabel: data.display_name || data.legal_name || "Bedrijf",
        domain: "branding",
        category: "company_logo",
        sourceEntity: "Company",
        sourceEntityId: companyId,
        sourceField: "logo_file_url",
        documentLabel: "Logo",
        isSensitive: false,
        folderSegments: ["branding", "logo"]
      });
      set("logo_file_url", result.file_url);
      set("logo_file_id", result.managed_file_id);
      set("logo_download_filename", result.download_filename);
      set("logo_logical_path", result.logical_path);
      await updateManagedFileSource(result.managed_file_id, { source_entity_id: companyId });
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
    <PageTransition>
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
                  {company.teamhub_enabled && (
                    <Badge variant="outline" className="gap-1 text-xs">
                      <Handshake className="h-3 w-3" /> Teamhub
                    </Badge>
                  )}
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
                <Button variant="outline" size="sm" onClick={cancelEdit} disabled={deleteDraftCompanyMutation.isPending}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
                <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
                  <Check className="w-4 h-4 mr-1" /> {saveMutation.isPending ? "Opslaan..." : "Opslaan"}
                </Button>
              </>
            ) : (
              <Button onClick={startEdit} variant="outline">
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
            <InfoRow label="Rol">
              {editing
                ? <Select value={data.company_role || "operating_company"} onValueChange={v => set("company_role", v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="holding">Holding</SelectItem>
                      <SelectItem value="operating_company">Werkmaatschappij</SelectItem>
                      <SelectItem value="sole_proprietor">Eenmanszaak</SelectItem>
                      <SelectItem value="other">Overig</SelectItem>
                    </SelectContent>
                  </Select>
                : <ViewText value={ROLE_LABELS[data.company_role] || data.company_role} />}
            </InfoRow>
            <InfoRow label="Status">
              {editing
                ? <Select value={data.status || "inactive"} onValueChange={v => set("status", v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Actief</SelectItem>
                      <SelectItem value="inactive">Inactief</SelectItem>
                      <SelectItem value="archived">Gearchiveerd</SelectItem>
                    </SelectContent>
                  </Select>
                : <ViewText value={data.status === "active" ? "Actief" : data.status === "inactive" ? "Inactief" : "Gearchiveerd"} />}
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
          <div className="space-y-3 md:col-span-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activiteiten</h3>
            {editing ? (
              <>
                <InfoRow label="Primaire activiteit">
                  <Select value={data.primary_activity || "none"} onValueChange={v => set("primary_activity", v === "none" ? null : v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Kies primaire activiteit" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Geen primaire activiteit</SelectItem>
                      {ACTIVITIES.map(activity => (
                        <SelectItem key={activity.key} value={activity.key}>{activity.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </InfoRow>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {ACTIVITIES.map(activity => (
                    <label key={activity.key} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm hover:bg-muted/50">
                      <Checkbox
                        checked={(data.activities || []).includes(activity.key)}
                        onCheckedChange={() => toggleActivity(activity.key)}
                      />
                      <span>{activity.label}</span>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(data.activities || []).length > 0 ? (
                  (data.activities || []).map(activity => (
                    <span key={activity} className="rounded bg-muted px-2 py-1 text-xs text-foreground">
                      {ACTIVITY_LABELS[activity] || activity}
                    </span>
                  ))
                ) : (
                  <ViewText value={null} />
                )}
              </div>
            )}
          </div>

          {/* Notities */}
          <div className="space-y-2 md:col-span-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notities</h3>
            {editing ? (
              <Textarea
                value={data.notes || ""}
                onChange={e => set("notes", e.target.value)}
                rows={3}
                placeholder="Interne notities over dit bedrijf"
              />
            ) : (
              <ViewText value={data.notes} />
            )}
          </div>


          {/* Briefpapier */}
          {(data.letterhead_file_url || editing) && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Briefpapier</h3>
              {data.letterhead_file_url && (
                <a href={data.letterhead_file_url} download={data.letterhead_download_filename || undefined} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                  <FileText className="w-4 h-4" /> {data.letterhead_download_filename || "Briefpapier bekijken"}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Save bar at bottom when editing */}
        {editing && (
          <div className="border-t border-border bg-muted/30 px-6 py-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={cancelEdit} disabled={deleteDraftCompanyMutation.isPending}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
            <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
              <Check className="w-4 h-4 mr-1" /> {saveMutation.isPending ? "Opslaan..." : "Wijzigingen opslaan"}
            </Button>
          </div>
        )}
      </div>

      {/* WPBR & CAO sectie met sidebar-menu */}
      <SidebarPanel
        companyId={companyId}
        companies={companies}
        company={company}
      />
    </PageTransition>
  );
}
