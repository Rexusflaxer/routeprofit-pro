import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Globe, Mail, MapPin, Phone, ShieldCheck, Users, X } from "lucide-react";
import { getCompanyLocationAddressLabel } from "@/lib/companyLocationScope";
import { getTeamhubServicesByKeys, getWpbrLicenseLabel, TEAMHUB_SERVICE_LABELS } from "@/lib/teamhubServiceRules";

function normalizeWebsite(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function serviceLabel(key) {
  return TEAMHUB_SERVICE_LABELS[key] || key;
}

function getRegionLabel(region) {
  return region?.label || region?.city || "Regio";
}

function CompanyLogo({ company, size = "lg" }) {
  const className = size === "sm" ? "h-10 w-10" : "h-14 w-14";

  if (company?.logo_file_url) {
    return (
      <img
        src={company.logo_file_url}
        alt=""
        className={`${className} shrink-0 rounded-md border border-border bg-white object-contain p-1`}
      />
    );
  }

  return (
    <div className={`${className} flex shrink-0 items-center justify-center rounded-md border border-border bg-muted`}>
      <Building2 className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}

export default function TeamhubCompanyPreview({
  company,
  location = null,
  effectiveWpbrLicenseType = null,
  onClose = null,
  compact = false,
  className = "",
}) {
  const services = company?.teamhub_service_types?.length ? company.teamhub_service_types : company?.activities || [];
  const serviceOptions = getTeamhubServicesByKeys(services);
  const regions = Array.isArray(company?.teamhub_regions) ? company.teamhub_regions : [];
  const website = normalizeWebsite(company?.website);
  const contactName = company?.teamhub_contact_name;
  const email = company?.teamhub_contact_email || company?.email;
  const phone = company?.teamhub_contact_phone || company?.phone;
  const wpbrType = effectiveWpbrLicenseType || company?.wpbr_license_type;
  const wpbrLabel = wpbrType && wpbrType !== "none" ? `${wpbrType} - ${getWpbrLicenseLabel(wpbrType)}` : null;
  const address = location ? getCompanyLocationAddressLabel(location) : [
    company?.street_name,
    company?.house_number,
    company?.postal_code,
    company?.city,
  ].filter(Boolean).join(" ");

  return (
    <article className={`overflow-hidden rounded-md border border-border bg-card shadow-sm ${className}`}>
      <div className="border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex items-start gap-3">
          <CompanyLogo company={company} size={compact ? "sm" : "lg"} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-foreground">
                  {company?.display_name || company?.legal_name || "Bedrijf"}
                </h2>
                {company?.trade_name && company.trade_name !== company.display_name && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">Handelsnaam: {company.trade_name}</p>
                )}
              </div>
              {onClose && (
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="gap-1 text-xs">
                <Users className="h-3 w-3" /> Onderaannemer
              </Badge>
              {wpbrLabel && (
                <Badge variant="outline" className="gap-1 text-xs">
                  <ShieldCheck className="h-3 w-3" /> {wpbrLabel}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {company?.teamhub_intro && (
          <p className="mt-3 text-sm leading-6 text-foreground">{company.teamhub_intro}</p>
        )}
      </div>

      <div className="space-y-4 p-4">
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Diensten</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {services.length > 0 ? (
              (serviceOptions.length ? serviceOptions : services.map(key => ({ key, label: serviceLabel(key) }))).map(service => (
                <span key={service.key} className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground">
                  {service.label}
                </span>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">Nog niet opgegeven</span>
            )}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</p>
            {contactName && <p className="text-sm font-medium text-foreground">{contactName}</p>}
            <div className="space-y-1 text-sm text-muted-foreground">
              {email ? (
                <a className="flex items-center gap-2 hover:text-foreground" href={`mailto:${email}`}>
                  <Mail className="h-3.5 w-3.5" /> {email}
                </a>
              ) : (
                <p>E-mail niet opgegeven</p>
              )}
              {phone && (
                <a className="flex items-center gap-2 hover:text-foreground" href={`tel:${phone}`}>
                  <Phone className="h-3.5 w-3.5" /> {phone}
                </a>
              )}
              {website && (
                <a className="flex items-center gap-2 hover:text-foreground" href={website} target="_blank" rel="noopener noreferrer">
                  <Globe className="h-3.5 w-3.5" /> Website
                </a>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vestiging</p>
            {address ? (
              <p className="flex items-start gap-2 text-sm text-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>{address}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Geen vestiging opgegeven</p>
            )}
          </div>
        </section>

        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Werkgebied</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {regions.length > 0 ? regions.map(region => (
              <span key={region.id || getRegionLabel(region)} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground">
                <MapPin className="h-3 w-3 text-primary" />
                {getRegionLabel(region)}
              </span>
            )) : (
              <span className="text-sm text-muted-foreground">Geen regio's geselecteerd</span>
            )}
          </div>
        </section>
      </div>
    </article>
  );
}
