import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PageTransition from "@/components/ui-custom/PageTransition";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Users } from "lucide-react";
import { TEAMHUB_SERVICE_LABELS } from "@/lib/teamhubServiceRules";
import TeamhubMap from "@/components/teamhub/TeamhubMap";

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function serviceLabel(key) {
  return TEAMHUB_SERVICE_LABELS[key] || key;
}

export default function Teamhub() {
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");

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

  return (
    <PageTransition>
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

      <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-card p-3 lg:grid-cols-[minmax(0,1fr)_240px_240px]">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Zoek bedrijf, contactpersoon of regio"
            className="pl-9"
          />
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
      </div>

      {(isLoading || locationsLoading) && (
        <p className="py-10 text-center text-sm text-muted-foreground">Laden...</p>
      )}

      {!isLoading && !locationsLoading && filteredCompanies.length === 0 && (
        <div className="rounded-md border border-border bg-card py-12 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">Geen Teamhub-profielen gevonden</p>
          <p className="mt-1 text-xs text-muted-foreground">Pas filters aan of zet een bedrijfsprofiel zichtbaar in LOQ Teamhub.</p>
        </div>
      )}

      {!isLoading && !locationsLoading && filteredCompanies.length > 0 && (
        <TeamhubMap companies={filteredCompanies} locations={locations} />
      )}
    </PageTransition>
  );
}
