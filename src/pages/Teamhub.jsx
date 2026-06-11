import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PageTransition from "@/components/ui-custom/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Building2, List, Map as MapIcon, Search } from "lucide-react";
import { TEAMHUB_SERVICE_LABELS } from "@/lib/teamhubServiceRules";
import TeamhubMap from "@/components/teamhub/TeamhubMap";
import TeamhubCompanyPreview from "@/components/teamhub/TeamhubCompanyPreview";

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function serviceLabel(key) {
  return TEAMHUB_SERVICE_LABELS[key] || key;
}

function getCompanyName(company) {
  return company?.display_name || company?.trade_name || company?.legal_name || "Bedrijf";
}

function CompanyLogo({ company }) {
  if (company?.logo_file_url) {
    return (
      <img
        src={company.logo_file_url}
        alt=""
        className="h-9 w-9 shrink-0 rounded-md border border-border bg-white object-contain p-1"
      />
    );
  }

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
      <Building2 className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

function TeamhubListView({ companies, locationById, onOpenCompany }) {
  if (companies.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card py-12 text-center">
        <p className="text-sm font-medium text-foreground">Geen Teamhub-profielen gevonden</p>
        <p className="mt-1 text-xs text-muted-foreground">Pas de zoekopdracht of filters aan.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {companies.map(company => {
        const location = locationById.get(company.teamhub_public_location_id);
        return (
          <article key={company.id} className="overflow-hidden rounded-md border border-border bg-card">
            <TeamhubCompanyPreview
              company={company}
              location={location}
              className="rounded-none border-0 shadow-none"
            />
            <div className="flex justify-end border-t border-border bg-muted/20 px-4 py-3">
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => onOpenCompany(company)}>
                <MapIcon className="h-4 w-4" />
                Toon op kaart
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default function Teamhub() {
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [viewMode, setViewMode] = useState("map");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: () => base44.entities.Company.list(),
  });
  const { data: locations = [], isLoading: locationsLoading } = useQuery({
    queryKey: ["company-locations"],
    queryFn: () => base44.entities.CompanyLocation.list(),
  });

  const visibleCompanies = useMemo(
    () => companies.filter(company => company.status === "active" && company.teamhub_enabled === true),
    [companies]
  );

  const locationById = useMemo(
    () => new Map((locations || []).filter(location => location?.id).map(location => [location.id, location])),
    [locations]
  );

  const serviceOptions = useMemo(() => {
    const keys = new Set();
    visibleCompanies.forEach(company => {
      const services = company.teamhub_service_types?.length ? company.teamhub_service_types : company.activities || [];
      services.forEach(service => keys.add(service));
    });
    return [...keys].sort((a, b) => serviceLabel(a).localeCompare(serviceLabel(b), "nl"));
  }, [visibleCompanies]);

  const regionOptions = useMemo(() => {
    const labels = new Set();
    visibleCompanies.forEach(company => {
      (company.teamhub_regions || []).forEach(region => {
        const label = region.label || region.city;
        if (label) labels.add(label);
      });
    });
    return [...labels].sort((a, b) => a.localeCompare(b, "nl"));
  }, [visibleCompanies]);

  const filteredCompanies = useMemo(() => {
    const term = normalizeSearch(search);

    return visibleCompanies.filter(company => {
      const services = company.teamhub_service_types?.length ? company.teamhub_service_types : company.activities || [];
      const regions = company.teamhub_regions || [];
      const searchable = normalizeSearch([
        company.display_name,
        company.trade_name,
        company.legal_name,
        company.teamhub_intro,
        company.teamhub_contact_name,
        company.teamhub_contact_email,
        company.teamhub_contact_phone,
        company.email,
        company.phone,
        ...regions.map(region => region.label || region.city),
      ].filter(Boolean).join(" "));

      const matchesSearch = !term || searchable.includes(term);
      const matchesService = serviceFilter === "all" || services.includes(serviceFilter);
      const matchesRegion = regionFilter === "all" || regions.some(region => (region.label || region.city) === regionFilter);

      return matchesSearch && matchesService && matchesRegion;
    });
  }, [visibleCompanies, search, serviceFilter, regionFilter]);

  const searchSuggestions = useMemo(() => {
    if (!normalizeSearch(search)) return [];
    return filteredCompanies.slice(0, 8);
  }, [filteredCompanies, search]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    if (!filteredCompanies.some(company => company.id === selectedCompanyId)) {
      setSelectedCompanyId(null);
    }
  }, [filteredCompanies, selectedCompanyId]);

  const openCompanyOnMap = (company) => {
    setSearch(getCompanyName(company));
    setSelectedCompanyId(company.id);
    setSearchOpen(false);
    setViewMode("map");
  };

  return (
    <PageTransition className="flex min-h-[calc(100vh-1.5rem)] flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">LOQ Teamhub</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Beschikbare beveiligingsbedrijven voor onderaanneming</p>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span className="font-semibold text-foreground">{visibleCompanies.length}</span>
          <span className="ml-1 text-muted-foreground">profielen zichtbaar</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-card p-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
            onKeyDown={event => {
              if (event.key === "Enter" && searchSuggestions.length === 1) {
                openCompanyOnMap(searchSuggestions[0]);
              }
            }}
            placeholder="Zoek bedrijf, contactpersoon of regio"
            className="pl-9"
          />
          {searchOpen && normalizeSearch(search) && (
            <div className="absolute left-0 right-0 top-[calc(100%+0.375rem)] z-30 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
              {searchSuggestions.length > 0 ? (
                searchSuggestions.map(company => (
                  <button
                    key={company.id}
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted"
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => openCompanyOnMap(company)}
                  >
                    <CompanyLogo company={company} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{getCompanyName(company)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {(company.teamhub_regions || []).map(region => region.label || region.city).filter(Boolean).slice(0, 3).join(", ") || "Geen regio's opgegeven"}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-muted-foreground">Geen directe match</div>
              )}
            </div>
          )}
        </div>
        <Select value={serviceFilter} onValueChange={setServiceFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Diensttype" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle diensten</SelectItem>
            {serviceOptions.map(service => (
              <SelectItem key={service} value={service}>{serviceLabel(service)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={regionFilter} onValueChange={setRegionFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Regio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle regio's</SelectItem>
            {regionOptions.map(region => (
              <SelectItem key={region} value={region}>{region}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={value => {
            if (value) setViewMode(value);
          }}
          variant="outline"
          size="sm"
          className="justify-start lg:justify-end"
        >
          <ToggleGroupItem value="map" aria-label="Kaartweergave" className="gap-2 px-3">
            <MapIcon className="h-4 w-4" />
            Kaart
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="Lijstweergave" className="gap-2 px-3">
            <List className="h-4 w-4" />
            Lijst
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {(isLoading || locationsLoading) && (
        <p className="py-10 text-center text-sm text-muted-foreground">Laden...</p>
      )}

      {!isLoading && !locationsLoading && viewMode === "map" && (
        <TeamhubMap
          companies={filteredCompanies}
          locations={locations}
          heightClassName="h-[calc(100vh-12rem)] min-h-[640px]"
          selectedCompanyId={selectedCompanyId}
          onSelectedCompanyIdChange={setSelectedCompanyId}
          emptyMessage={
            visibleCompanies.length === 0
              ? "Geen zichtbare Teamhub-profielen met kaartlocatie"
              : "Geen bedrijven binnen deze filters"
          }
        />
      )}

      {!isLoading && !locationsLoading && viewMode === "list" && (
        <TeamhubListView
          companies={filteredCompanies}
          locationById={locationById}
          onOpenCompany={openCompanyOnMap}
        />
      )}
    </PageTransition>
  );
}
