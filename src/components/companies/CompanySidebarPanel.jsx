import React, { useState } from "react";
import { AlertTriangle, Archive, Award, BookOpen, ChevronDown, CreditCard, FileText, Handshake, Lock, Mail, MapPin, RotateCcw, Shield, ShieldCheck, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import CompanyTemplatesTab from "./CompanyTemplatesTab";

const MENU_ITEMS = [
  { key: "wpbr", label: "WPBR-vergunning", icon: Shield },
  { key: "cao", label: "CAO", icon: BookOpen },
  { key: "templates", label: "Sjablonen", icon: FileText, children: [
    { key: "letterhead", label: "Briefpapier" },
    { key: "contract_templates", label: "Contracttemplates" },
  ] },
  { key: "branch_memberships", label: "Branchevereniging", icon: Handshake },
  { key: "accreditations", label: "Erkenningen", icon: Award },
  { key: "insurances", label: "Verzekeringen", icon: ShieldCheck },
  { key: "locations", label: "Vestigingen", icon: MapPin },
  { key: "teamhub", label: "LOQ Teamhub", icon: Handshake },
  { key: "bank", label: "Bank", icon: CreditCard },
  { key: "email", label: "E-mail", icon: Mail },
  { key: "management", label: "Beheer", icon: Lock },
];

const MANAGEMENT_CONFIRMATION = "BEHEER";

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

function ProtectedManagementTab({
  company,
  isArchived,
  onArchive,
  onRestore,
  onPermanentDelete,
  archivePending,
  restorePending,
  permanentDeletePending,
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const companyName = company?.display_name || "dit bedrijf";

  const unlock = () => {
    if (confirmation.trim().toUpperCase() !== MANAGEMENT_CONFIRMATION) {
      setError(`Typ "${MANAGEMENT_CONFIRMATION}" om beheer te openen.`);
      return;
    }
    setUnlocked(true);
    setError("");
  };

  if (!unlocked) {
    return (
      <div className="p-6 space-y-5">
        <div>
          <p className="text-xs font-semibold text-primary uppercase tracking-wider">Beveiligd beheer</p>
          <h3 className="text-lg font-semibold text-foreground mt-1">Risico-acties zijn afgeschermd</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Hier staan acties die gevolgen hebben voor koppelingen, historie en zichtbaarheid. Open dit alleen wanneer je bewust een beheeractie voor dit bedrijfsprofiel wilt uitvoeren.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-muted/20 p-4 max-w-2xl">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Extra bevestiging</p>
              <p className="text-xs text-muted-foreground mt-1">
                Bij Google-, Microsoft- of andere externe login kan LOQ het accountwachtwoord niet opnieuw controleren in deze browser. Daarom vragen we hier een bewuste bevestiging voordat deze beheerknoppen zichtbaar worden.
              </p>
              <label className="mt-4 block text-xs font-medium text-muted-foreground">
                Typ <span className="font-mono font-semibold text-foreground">{MANAGEMENT_CONFIRMATION}</span> om beheer te openen
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <Input
                  value={confirmation}
                  onChange={(event) => {
                    setConfirmation(event.target.value);
                    setError("");
                  }}
                  className={`h-8 max-w-[220px] font-mono text-sm ${error ? "border-destructive" : ""}`}
                  placeholder={MANAGEMENT_CONFIRMATION}
                  onKeyDown={(event) => event.key === "Enter" && unlock()}
                />
                <Button type="button" size="sm" onClick={unlock}>
                  Beheer openen
                </Button>
              </div>
              {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <p className="text-xs font-semibold text-primary uppercase tracking-wider">Beveiligd beheer</p>
        <h3 className="text-lg font-semibold text-foreground mt-1">Beheeracties voor {companyName}</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Deze acties zijn bewust uit de profielheader gehaald. Gebruik ze alleen wanneer het bedrijf echt gearchiveerd, hersteld of juridisch definitief verwijderd mag worden.
        </p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" />
          <div>
            <p className="font-semibold">Controleer eerst of dit gevolgen heeft voor contracten, diensten, documenten of planning.</p>
            <p className="mt-1 text-xs opacity-90">
              Archiveren bewaart alle historie en schakelt zichtbaarheid uit. Definitief verwijderen kan alleen vanuit het archief en wordt nogmaals gecontroleerd op bewaarplichtige of actieve koppelingen.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {!isArchived ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <Archive className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Verplaatsen naar archief</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Het bedrijf blijft bewaard, maar wordt uit actief gebruik gehaald. Teamhub-zichtbaarheid wordt uitgeschakeld.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={onArchive}
                  disabled={archivePending}
                >
                  <Archive className="mr-1 h-3.5 w-3.5" />
                  {archivePending ? "Archiveren..." : "Verplaatsen naar archief"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Bedrijf herstellen</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Zet dit bedrijf terug naar actief gebruik. Controleer daarna opnieuw de tabs met vergunningen, diensten en Teamhub.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={onRestore}
                    disabled={restorePending}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    {restorePending ? "Herstellen..." : "Herstellen"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Definitief verwijderen</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Alleen mogelijk wanneer LOQ geen actieve of bewaarplichtige koppelingen vindt. Deze controle volgt in de bevestiging.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={onPermanentDelete}
                    disabled={permanentDeletePending}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Definitief verwijderen
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CompanySidebarPanel({
  companyId,
  companies,
  company,
  isArchived = false,
  onArchive,
  onRestore,
  onPermanentDelete,
  archivePending = false,
  restorePending = false,
  permanentDeletePending = false,
}) {
  const getInitialActiveTab = () => {
    if (typeof window === "undefined") return MENU_ITEMS[0].key;
    const tab = new URLSearchParams(window.location.search).get("tab");
    return MENU_ITEMS.some(item => item.key === tab) ? tab : MENU_ITEMS[0].key;
  };

  const [active, setActive] = useState(getInitialActiveTab);
  const [templateSubtab, setTemplateSubtab] = useState(null);
  const [templatesExpanded, setTemplatesExpanded] = useState(false);

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
          const isActive = active === item.key;
          return (
            <div key={item.key}>
              <button
                onClick={() => item.children ? setTemplatesExpanded(prev => !prev) : (setActive(item.key), setTemplatesExpanded(false))}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors text-left
                  ${isActive
                    ? "bg-background text-foreground border-r-2 border-primary"
                    : hasAlert
                      ? "border-r-2 border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-background/60"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  }`}
              >
                <item.icon className={`w-4 h-4 shrink-0 ${hasAlert && !isActive ? "text-amber-500" : ""}`} />
                <span className="flex-1">{item.label}</span>
                {item.children && (
                  <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform ${templatesExpanded ? "rotate-180" : ""}`} />
                )}
              </button>
              {item.children && templatesExpanded && (
                <div className="ml-4 border-l border-border pl-1.5">
                  {item.children.map(child => (
                    <button
                      key={child.key}
                      onClick={() => { setActive(item.key); setTemplateSubtab(child.key); setTemplatesExpanded(true); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left
                        ${isActive && templateSubtab === child.key
                          ? "text-foreground font-medium"
                          : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                        }`}
                    >
                      <span className={`h-2 w-2 rounded-full shrink-0 ${isActive && templateSubtab === child.key ? "bg-primary" : "bg-transparent"}`} />
                      <span className="flex-1">{child.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Right content */}
      <div className="flex-1 min-w-0">
        {!active && (
          <div className="flex h-full items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">Selecteer een tabblad om de gegevens te bekijken.</p>
          </div>
        )}
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

        {active === "templates" && (
          <CompanyTemplatesTab companyId={companyId} company={company} subTab={templateSubtab} />
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

        {active === "management" && (
          <ProtectedManagementTab
            company={company}
            isArchived={isArchived}
            onArchive={onArchive}
            onRestore={onRestore}
            onPermanentDelete={onPermanentDelete}
            archivePending={archivePending}
            restorePending={restorePending}
            permanentDeletePending={permanentDeletePending}
          />
        )}
      </div>
    </div>
  );
}