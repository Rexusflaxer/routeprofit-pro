import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Edit, Building2, Phone, Mail, Globe, MapPin, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import CompanyForm from "@/components/companies/CompanyForm";
import LocationsTab from "@/components/companies/LocationsTab";
import CompanyBankTab from "@/components/companies/CompanyBankTab";

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

const STATUS_COLORS = {
  active: "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-300",
  inactive: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  archived: "bg-red-50 text-red-600 dark:bg-red-900 dark:text-red-300",
};

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4">
      <span className="text-xs text-muted-foreground w-36 shrink-0">{label}</span>
      <span className="text-sm text-foreground font-medium">{value}</span>
    </div>
  );
}

export default function CompanyDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const companyId = urlParams.get("id");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

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
      setEditOpen(false);
    },
  });

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

  const address = [
    company.street_name && `${company.street_name} ${company.house_number || ""}${company.house_number_addition || ""}`.trim(),
    company.postal_code && company.city && `${company.postal_code} ${company.city}`,
    company.country !== "Nederland" ? company.country : null,
  ].filter(Boolean).join(", ");

  const caoName = caoConfigurations.find(c => c.id === company.default_cao_configuration_id);

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
        {/* Top banner with logo */}
        <div className="bg-muted/40 border-b border-border px-6 py-5 flex items-center gap-5">
          <div className="w-16 h-16 rounded-xl border border-border bg-white flex items-center justify-center overflow-hidden shrink-0">
            {company.logo_file_url
              ? <img src={company.logo_file_url} alt="logo" className="object-contain w-full h-full p-1" />
              : <Building2 className="w-8 h-8 text-muted-foreground/50" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">{company.display_name}</h1>
              <Badge variant="outline" className="text-xs">{ROLE_LABELS[company.company_role] || company.company_role}</Badge>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[company.status] || ""}`}>
                {company.status === "active" ? "Actief" : company.status === "inactive" ? "Inactief" : "Gearchiveerd"}
              </span>
            </div>
            {company.legal_name && company.legal_name !== company.display_name && (
              <p className="text-sm text-muted-foreground mt-0.5">{company.legal_name}</p>
            )}
            {company.trade_name && company.trade_name !== company.display_name && (
              <p className="text-xs text-muted-foreground">Handelsnaam: {company.trade_name}</p>
            )}
          </div>
          <Button onClick={() => setEditOpen(true)}>
            <Edit className="w-4 h-4 mr-1" /> Wijzigen
          </Button>
        </div>

        {/* Details */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Juridisch */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Juridische gegevens</h3>
            <div className="space-y-2">
              <InfoRow label="KvK-nummer" value={company.kvk_number} />
              <InfoRow label="RSIN" value={company.rsin} />
              <InfoRow label="BTW-nummer" value={company.btw_number} />
              <InfoRow label="Rechtsvorm" value={company.legal_form} />
              {holdingCompany && <InfoRow label="Onder holding" value={holdingCompany.display_name} />}
              {company.wpbr_license_type && company.wpbr_license_type !== "none" && (
                <InfoRow label="WPBR-type" value={company.wpbr_license_type} />
              )}
              {company.wpbr_license_number && <InfoRow label="WPBR-nummer" value={company.wpbr_license_number} />}
              {company.wpbr_license_valid_until && <InfoRow label="WPBR geldig tot" value={company.wpbr_license_valid_until} />}
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact & Adres</h3>
            <div className="space-y-2">
              {address && (
                <div className="flex gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-foreground">{address}</span>
                </div>
              )}
              {company.phone && (
                <div className="flex gap-2 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-foreground">{company.phone}</span>
                </div>
              )}
              {company.email && (
                <div className="flex gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <a href={`mailto:${company.email}`} className="text-foreground hover:underline">{company.email}</a>
                </div>
              )}
              {company.website && (
                <div className="flex gap-2 text-sm">
                  <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                  <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline">{company.website}</a>
                </div>
              )}
            </div>
          </div>

          {/* Activiteiten */}
          {(company.activities || []).length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activiteiten</h3>
              <div className="flex flex-wrap gap-1.5">
                {(company.activities || []).map(a => (
                  <span key={a} className="text-xs bg-muted text-foreground px-2 py-1 rounded-md">
                    {ACTIVITY_LABELS[a] || a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* CAO */}
          {caoName && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CAO</h3>
              <span className="text-sm text-foreground">{caoName.label || caoName.display_name || caoName.name}</span>
            </div>
          )}

          {/* Briefpapier */}
          {company.letterhead_file_url && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Briefpapier</h3>
              <a href={company.letterhead_file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                <FileText className="w-4 h-4" /> Briefpapier bekijken
              </a>
            </div>
          )}

          {/* Notities */}
          {company.notes && (
            <div className="space-y-3 md:col-span-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notities</h3>
              <p className="text-sm text-foreground whitespace-pre-wrap">{company.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Vestigingen & Bank tabs */}
      <Tabs defaultValue="locations">
        <TabsList>
          <TabsTrigger value="locations">Vestigingen</TabsTrigger>
          <TabsTrigger value="bank">Bank / G-rekeningen</TabsTrigger>
        </TabsList>
        <TabsContent value="locations" className="pt-4">
          <LocationsTab companies={companies} />
        </TabsContent>
        <TabsContent value="bank" className="pt-4">
          <CompanyBankTab companies={[company]} />
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={v => setEditOpen(v)}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{company.display_name} bewerken</DialogTitle>
          </DialogHeader>
          <CompanyForm
            company={company}
            companies={companies}
            caoConfigurations={caoConfigurations}
            onSave={(data) => saveMutation.mutate(data)}
            onCancel={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}