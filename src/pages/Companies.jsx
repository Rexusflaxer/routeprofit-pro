import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Building2, AlertCircle, Archive, ChevronLeft, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PageTransition from "@/components/ui-custom/PageTransition";

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

const STATUS_COLORS = {
  active: "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-300",
  inactive: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  archived: "bg-red-50 text-red-600 dark:bg-red-900 dark:text-red-300",
};

function CompaniesLoadingState() {
  return (
    <div className="rounded-xl border border-border bg-card/70 p-8 shadow-sm">
      <div className="mx-auto flex max-w-sm flex-col items-center text-center">
        <div className="relative mb-3 flex h-12 w-12 items-center justify-center">
          <div className="absolute inset-0 rounded-md border border-primary/20 bg-background/80 shadow-sm" />
          <div className="absolute inset-0 rounded-md border-2 border-primary/15 border-t-primary animate-spin" />
          <Building2 className="relative h-5 w-5 text-primary" />
        </div>
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span>Bedrijven laden</span>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">LOQ haalt actieve bedrijven en archiefstatussen op.</p>
      </div>
    </div>
  );
}

export default function Companies() {
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: () => base44.entities.Company.list(),
  });

  const selectedCaoConfigurationIds = [...new Set(companies
    .map(company => company.default_cao_configuration_id)
    .filter(Boolean))];

  const { data: caoConfigurations = [] } = useQuery({
    queryKey: ["cao-configuration-options", selectedCaoConfigurationIds],
    queryFn: async () => {
      const { data } = await base44.functions.invoke("listCaoConfigurationOptions", {
        include_ids: selectedCaoConfigurationIds,
      });
      return data?.options || [];
    },
  });

  const { data: companySettings = [] } = useQuery({
    queryKey: ["companySettings"],
    queryFn: () => base44.entities.CompanySettings.list(),
  });

  const createBlankCompanyMutation = useMutation({
    mutationFn: () => base44.entities.Company.create({
      display_name: "Nieuw bedrijf",
      legal_name: "Nieuw bedrijf",
      trade_name: null,
      kvk_number: null,
      rsin: null,
      btw_number: null,
      legal_form: null,
      status: "active",
      company_role: "operating_company",
      holding_company_id: null,
      primary_activity: null,
      activities: [],
      street_name: null,
      house_number: null,
      house_number_addition: null,
      postal_code: null,
      city: null,
      country: "Nederland",
      phone: null,
      email: null,
      website: null,
      teamhub_enabled: false,
      teamhub_service_types: [],
      teamhub_regions: [],
      notes: null,
    }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      navigate(`/CompanyDetail?id=${created.id}&new=1&edit=1`);
    },
  });

  const handleMigrateFromSettings = async () => {
    const settings = companySettings[0];
    if (!settings) return;
    setMigrateLoading(true);
    await base44.entities.Company.create({
      display_name: settings.company_name || "Mijn Bedrijf",
      legal_name: settings.company_name || "Mijn Bedrijf",
      kvk_number: settings.kvk_number || null,
      btw_number: settings.btw_number || null,
      postal_code: settings.postal_code || null,
      city: settings.city || null,
      phone: settings.phone || null,
      email: settings.email || null,
      status: "active",
      company_role: "operating_company",
      activities: ["private_security"],
      country: "Nederland",
    });
    queryClient.invalidateQueries({ queryKey: ["companies"] });
    setMigrateLoading(false);
  };

  const openNew = () => {
    if (!createBlankCompanyMutation.isPending) createBlankCompanyMutation.mutate();
  };

  const getCaoName = (id) => {
    const cao = caoConfigurations.find(c => c.id === id);
    return cao ? (cao.label || cao.display_name || cao.name) : null;
  };

  const activeCompanies = companies.filter(company => company.status !== "archived");
  const archivedCompanies = companies.filter(company => company.status === "archived");
  const visibleCompanies = showArchive ? archivedCompanies : activeCompanies;

  // Groepeer bedrijven: holdings bovenaan, dan hun werkmaatschappijen, dan zelfstandige bedrijven
  const getGroupedCompanies = () => {
    const holdings = visibleCompanies.filter(c => c.company_role === "holding");
    const subsidiaries = visibleCompanies.filter(c => c.holding_company_id);
    const independents = visibleCompanies.filter(c => c.company_role !== "holding" && !c.holding_company_id);
    const result = [];
    for (const holding of holdings) {
      result.push({ company: holding, isChild: false });
      const children = subsidiaries.filter(c => c.holding_company_id === holding.id);
      for (const child of children) result.push({ company: child, isChild: true });
    }
    // Subsidiaries zonder bekende holding
    const orphanSubsidiaries = subsidiaries.filter(c => !holdings.find(h => h.id === c.holding_company_id));
    for (const c of orphanSubsidiaries) result.push({ company: c, isChild: false });
    for (const c of independents) result.push({ company: c, isChild: false });
    return result;
  };
  const groupedCompanies = getGroupedCompanies();

  return (
    <PageTransition>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bedrijven</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Beheer juridische entiteiten, holdings en vestigingen</p>
        </div>
        <Button onClick={openNew} disabled={createBlankCompanyMutation.isPending}>
          <Plus className="w-4 h-4 mr-1" /> {createBlankCompanyMutation.isPending ? "Aanmaken..." : "Bedrijf toevoegen"}
        </Button>
      </div>

      {/* Migration banner */}
      {companies.length === 0 && companySettings.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 p-4">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">Nog geen bedrijven aangemaakt</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Er zijn bestaande instellingen beschikbaar ({companySettings[0].company_name}). Je kunt dit omzetten naar een eerste bedrijf.
            </p>
          </div>
          <Button size="sm" variant="outline" className="border-amber-400 text-amber-800 hover:bg-amber-100 shrink-0" onClick={handleMigrateFromSettings} disabled={migrateLoading}>
            {migrateLoading ? "Bezig..." : "Maak bedrijf uit huidige instellingen"}
          </Button>
        </div>
      )}

      {isLoading && <CompaniesLoadingState />}
      {!isLoading && (
        <div className="rounded-xl border border-border shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="flex items-center px-4 py-2 bg-muted/30 border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="flex-[2] min-w-0">Bedrijf</span>
            <span className="w-32 shrink-0">KvK</span>
            <span className="w-36 shrink-0">Rol</span>
            <span className="flex-[2] min-w-0">Activiteiten</span>
            <span className="w-32 shrink-0">CAO</span>
            <span className="w-28 shrink-0">LOQ Teamhub</span>
            {showArchive && <Badge className="mr-2 bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 animate-pulse">Archief</Badge>}
            <div className="shrink-0 flex items-center gap-2">
              {showArchive ? (
                <Button size="sm" variant="outline" onClick={() => setShowArchive(false)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                  <ChevronLeft className="w-3 h-3 mr-1" /> Actieve bedrijven
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setShowArchive(true)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                  <Archive className="w-3 h-3 mr-1" /> Archief {archivedCompanies.length > 0 ? `(${archivedCompanies.length})` : ""}
                </Button>
              )}
            </div>
          </div>
          {/* Rows */}
          <div className="divide-y divide-border">
            {groupedCompanies.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                {showArchive ? "Geen bedrijven in het archief." : "Nog geen bedrijven aangemaakt."}
              </p>
            )}
            {groupedCompanies.map(({ company, isChild }) => {
              const teamhubVisible = company.status === "active" && company.teamhub_enabled;

              return (
                <div
                  key={company.id}
                  className={`flex items-center px-4 py-3 cursor-pointer transition-colors group hover:bg-accent/50 ${
                    company.status === "archived" ? (showArchive ? "bg-muted/10" : "bg-muted/20 opacity-75") : ""
                  }`}
                  onClick={() => navigate(`/CompanyDetail?id=${company.id}`)}
                >
                  <div className={`flex-[2] min-w-0 flex items-center gap-2 ${isChild ? "pl-6 border-l-2 border-muted ml-1" : ""}`}>
                    {company.logo_file_url
                      ? <img src={company.logo_file_url} alt="logo" className="w-7 h-7 rounded object-contain bg-white border border-border p-0.5 shrink-0" />
                      : <div className="w-7 h-7 rounded bg-muted flex items-center justify-center shrink-0"><Building2 className="w-3.5 h-3.5 text-muted-foreground" /></div>
                    }
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{company.display_name}</p>
                        {company.status === "archived" && (
                          <Badge className={`shrink-0 text-xs ${STATUS_COLORS.archived}`}>Gearchiveerd</Badge>
                        )}
                      </div>
                      {company.trade_name && company.trade_name !== company.display_name && (
                        <p className="text-xs text-muted-foreground truncate">{company.trade_name}</p>
                      )}
                    </div>
                  </div>
                  <span className="w-32 shrink-0 text-sm text-muted-foreground">{company.kvk_number || "—"}</span>
                  <span className="w-36 shrink-0">
                    <span className="text-xs bg-muted text-foreground px-2 py-1 rounded font-medium">{ROLE_LABELS[company.company_role] || company.company_role}</span>
                  </span>
                  <div className="flex-[2] min-w-0 flex flex-wrap gap-1">
                    {(company.activities || []).slice(0, 2).map(a => (
                      <span key={a} className="text-xs bg-muted text-foreground px-1.5 py-0.5 rounded">{ACTIVITY_LABELS[a] || a}</span>
                    ))}
                    {(company.activities || []).length > 2 && (
                      <span className="text-xs text-muted-foreground">+{(company.activities || []).length - 2}</span>
                    )}
                  </div>
                  <span className="w-32 shrink-0 text-xs text-muted-foreground">
                    {company.default_cao_configuration_id ? getCaoName(company.default_cao_configuration_id) : "—"}
                  </span>
                  <span className="w-28 shrink-0">
                    <Badge className={teamhubVisible ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}>
                      {teamhubVisible ? "Zichtbaar" : "Niet zichtbaar"}
                    </Badge>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </PageTransition>
  );
}
