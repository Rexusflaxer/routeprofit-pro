import React, { useState } from "react";
import { Award, BookOpen, CreditCard, Handshake, Mail, MapPin, Shield, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { getCompanyProfileLocations } from "@/lib/companyLocationScope";
import { getActiveWpbrLicenseType } from "@/lib/teamhubServiceRules";
import WpbrTab from "./WpbrTab";
import CaoTab from "./CaoTab";
import LocationsTab from "./LocationsTab";
import CompanyBankTab from "./CompanyBankTab";
import TeamhubTab from "./TeamhubTab";
import AccreditationsTab from "./AccreditationsTab";
import BranchMembershipsTab from "./BranchMembershipsTab";
import CompanyEmailTab from "./CompanyEmailTab";
import CompanyInsurancesTab from "./CompanyInsurancesTab";

const MENU_ITEMS = [
  { key: "wpbr", label: "WPBR-vergunning", icon: Shield },
  { key: "cao", label: "CAO", icon: BookOpen },
  { key: "branch_memberships", label: "Branchevereniging", icon: Handshake },
  { key: "accreditations", label: "Erkenningen", icon: Award },
  { key: "insurances", label: "Verzekeringen", icon: ShieldCheck },
  { key: "locations", label: "Vestigingen", icon: MapPin },
  { key: "teamhub", label: "LOQ Teamhub", icon: Handshake },
  { key: "bank", label: "Bank", icon: CreditCard },
  { key: "email", label: "E-mail", icon: Mail },
];

function hasTeamhubConfiguration(company) {
  return Boolean(
    company?.teamhub_configured_at ||
    company?.teamhub_public_location_id ||
    company?.teamhub_intro ||
    company?.teamhub_contact_name ||
    company?.teamhub_contact_email ||
    company?.teamhub_contact_phone ||
    (Array.isArray(company?.teamhub_service_types) && company.teamhub_service_types.length > 0) ||
    (Array.isArray(company?.teamhub_regions) && company.teamhub_regions.length > 0)
  );
}

function isExpiredLicense(license, today) {
  return license?.valid_until && license.valid_until < today;
}

function hasEmailSettingsAction(settings) {
  if (!settings) return false;
  if (settings.status === "action_required") return true;
  return Object.values(settings.channel_delivery_status || {}).some(channel => channel?.status === "hold");
}

function hasInsuranceAction(policy, today) {
  if (!policy || policy.status === "archived" || policy.status === "cancelled") return false;
  if (policy.status === "action_required" || policy.status === "expired") return true;
  return Boolean(policy.valid_until && policy.valid_until < today);
}

export default function CompanySidebarPanel({ companyId, companies, company }) {
  const getInitialActiveTab = () => {
    if (typeof window === "undefined") return "wpbr";
    const tab = new URLSearchParams(window.location.search).get("tab");
    return MENU_ITEMS.some(item => item.key === tab) ? tab : "wpbr";
  };

  const [active, setActive] = useState(getInitialActiveTab);

  const { data: accreditations = [] } = useQuery({
    queryKey: ["company-accreditations", companyId],
    queryFn: () => base44.entities.CompanyAccreditation.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const { data: wpbrLicenses = [], isLoading: wpbrLicensesLoading } = useQuery({
    queryKey: ["wpbr-licenses", companyId],
    queryFn: () => base44.entities.CompanyWpbrLicense.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId,
  });

  const { data: emailSettingsList = [] } = useQuery({
    queryKey: ["company-email-settings", companyId],
    queryFn: () => base44.entities.CompanyEmailSettings.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const { data: insurancePolicies = [] } = useQuery({
    queryKey: ["company-insurance-policies", companyId],
    queryFn: () => base44.entities.CompanyInsurancePolicy.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const { data: companyLocations = [], isLoading: companyLocationsLoading } = useQuery({
    queryKey: ["company-locations"],
    queryFn: () => base44.entities.CompanyLocation.list(),
    enabled: !!companyId,
  });

  const { data: companyLocationAssignments = [], isLoading: companyLocationAssignmentsLoading } = useQuery({
    queryKey: ["company-location-assignments"],
    queryFn: () => base44.entities.CompanyLocationAssignment.list(),
    enabled: !!companyId,
  });

  const today = new Date().toISOString().split("T")[0];
  const hasAccreditationAction = accreditations.some(a =>
    a.status !== "superseded" && (
      a.status === "expired" ||
      a.status === "pending_review" ||
      (a.valid_until && a.valid_until < today)
    )
  );
  const hasWpbrAction = wpbrLicenses.some(license =>
    license.status !== "superseded" && (
      license.status === "expired" ||
      isExpiredLicense(license, today)
    )
  );
  const activeWpbrLicenseType = getActiveWpbrLicenseType(wpbrLicenses);
  const teamhubLocationIds = new Set(
    getCompanyProfileLocations({
      companyId,
      company,
      locations: companyLocations,
      assignments: companyLocationAssignments,
    }).map(location => location.id)
  );
  const hasValidTeamhubLocation = !!company?.teamhub_public_location_id && teamhubLocationIds.has(company.teamhub_public_location_id);
  const hasTeamhubServices = Array.isArray(company?.teamhub_service_types) && company.teamhub_service_types.length > 0;
  const teamhubActionDataLoading = wpbrLicensesLoading || companyLocationsLoading || companyLocationAssignmentsLoading;
  const hasTeamhubAction = !teamhubActionDataLoading && hasTeamhubConfiguration(company) && (
    !activeWpbrLicenseType ||
    !hasValidTeamhubLocation ||
    !hasTeamhubServices
  );
  const hasEmailAction = emailSettingsList.some(hasEmailSettingsAction);
  const hasInsuranceAlert = insurancePolicies.some(policy => hasInsuranceAction(policy, today));

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden flex min-h-[200px]">
      {/* Left sidebar menu */}
      <div className="w-48 shrink-0 border-r border-border bg-muted/30 py-3">
        {MENU_ITEMS.map(item => {
          const hasAlert =
            (item.key === "wpbr" && hasWpbrAction) ||
            (item.key === "accreditations" && hasAccreditationAction) ||
            (item.key === "insurances" && hasInsuranceAlert) ||
            (item.key === "teamhub" && hasTeamhubAction) ||
            (item.key === "email" && hasEmailAction);
          return (
            <button
              key={item.key}
              onClick={() => setActive(item.key)}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors text-left
                ${active === item.key
                  ? "bg-background text-foreground border-r-2 border-primary"
                  : hasAlert
                    ? "border-r-2 border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-background/60"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                }`}
            >
              <item.icon className={`w-4 h-4 shrink-0 ${hasAlert && active !== item.key ? "text-amber-500" : ""}`} />
              <span className="flex-1">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right content */}
      <div className="flex-1 min-w-0">
        {active === "wpbr" && (
          <WpbrTab companyId={companyId} company={company} />
        )}

        {active === "locations" && (
          <LocationsTab companies={companies} companyId={companyId} company={company} />
        )}

        {active === "bank" && (
          <CompanyBankTab companies={company ? [company] : []} />
        )}

        {active === "email" && (
          <CompanyEmailTab companyId={companyId} company={company} />
        )}

        {active === "insurances" && (
          <CompanyInsurancesTab companyId={companyId} company={company} />
        )}

        {active === "cao" && (
          <CaoTab companyId={companyId} />
        )}

        {active === "branch_memberships" && (
          <BranchMembershipsTab companyId={companyId} company={company} />
        )}

        {active === "accreditations" && (
          <AccreditationsTab companyId={companyId} company={company} />
        )}

        {active === "teamhub" && (
          <TeamhubTab companyId={companyId} company={company} />
        )}
      </div>
    </div>
  );
}
