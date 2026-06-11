import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PageTransition from "@/components/ui-custom/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Building2, Globe, Mail, MapPin, Phone, Search, ShieldCheck, Users } from "lucide-react";
import { TEAMHUB_SERVICE_LABELS } from "@/lib/teamhubServiceRules";

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function serviceLabel(key) {
  return TEAMHUB_SERVICE_LABELS[key] || key;
}

function regionLabel(region) {
  if (!region) return null;
  return region.label || region.city || "Regio";
}

function normalizeWebsite(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function CompanyLogo({ company }) {
  if (company.logo_file_url) {
    return (
      <img
        src={company.logo_file_url}
        alt=""
        className="h-12 w-12 shrink-0 rounded-md border border-border bg-white object-contain p-1"
      />
    );
  }

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
      <Building2 className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}

function TeamhubCompanyCard({ company }) {
  const services = company.teamhub_service_types?.length ? company.teamhub_service_types : company.activities || [];
  const regions = Array.isArray(company.teamhub_regions) ? company.teamhub_regions : [];
  const website = normalizeWebsite(company.website);

  return (
    <article className="rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <CompanyLogo company={company} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold text-foreground">{company.display_name}</h2>
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3 w-3" /> Onderaannemer
            </Badge>
          </div>
          {company.trade_name && company.trade_name !== company.display_name && (
            <p className="mt-0.5 text-xs text-muted-foreground">Handelsnaam: {company.trade_name}</p>
          )}
          {company.teamhub_intro && (
            <p className="mt-3 text-sm leading-6 text-foreground">{company.teamhub_intro}</p>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Diensten</p>
          <div className="flex flex-wrap gap-1.5">
            {services.length > 0 ? services.map(service => (
              <span key={service} className="rounded-md bg-muted px-2 py-1 text-xs text-foreground">
                {serviceLabel(service)}
              </span>
            )) : (
              <span className="text-sm text-muted-foreground">Nog niet opgegeven</span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Werkregio's</p>
          <div className="flex flex-wrap gap-1.5">
            {regions.length > 0 ? regions.map(region => (
              <span key={region.id || region.label} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                {regionLabel(region)}
              </span>
            )) : (
              <span className="text-sm text-muted-foreground">Nog niet opgegeven</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {company.wpbr_license_type && company.wpbr_license_type !== "none" && (
          <Badge variant="outline" className="gap-1">
            <ShieldCheck className="h-3 w-3" />
            WPBR {company.wpbr_license_type}{company.wpbr_license_number ? ` ${company.wpbr_license_number}` : ""}
          </Badge>
        )}
        <div className="flex flex-1 flex-wrap justify-end gap-2">
          {company.teamhub_contact_email && (
            <Button asChild variant="outline" size="sm">
              <a href={`mailto:${company.teamhub_contact_email}`}>
                <Mail className="h-3.5 w-3.5" /> Mail
              </a>
            </Button>
          )}
          {company.teamhub_contact_phone && (
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${company.teamhub_contact_phone}`}>
                <Phone className="h-3.5 w-3.5" /> Bel
              </a>
            </Button>
          )}
          {website && (
            <Button asChild variant="outline" size="sm">
              <a href={website} target="_blank" rel="noopener noreferrer">
                <Globe className="h-3.5 w-3.5" /> Website
              </a>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Teamhub() {
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: () => base44.entities.Company.list(),
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

      {isLoading && (
        <p className="py-10 text-center text-sm text-muted-foreground">Laden...</p>
      )}

      {!isLoading && filteredCompanies.length === 0 && (
        <div className="rounded-md border border-border bg-card py-12 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">Geen Teamhub-profielen gevonden</p>
          <p className="mt-1 text-xs text-muted-foreground">Pas filters aan of zet een bedrijfsprofiel zichtbaar in LOQ Teamhub.</p>
        </div>
      )}

      {filteredCompanies.length > 0 && (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {filteredCompanies.map(company => (
            <TeamhubCompanyCard key={company.id} company={company} />
          ))}
        </div>
      )}
    </PageTransition>
  );
}
