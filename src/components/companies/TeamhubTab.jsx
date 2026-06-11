import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Building2, Check, Clock, Mail, Phone, Save, Users } from "lucide-react";
import {
  TEAMHUB_LICENSE_SERVICE_GROUPS,
  TEAMHUB_QUALIFICATION_SERVICE_KEYS,
  getEffectiveWpbrLicenseType,
  getQualifiedTeamhubServiceTypes,
  getTeamhubServicesByKeys,
  getTeamhubServiceDisabledReason,
  getWpbrLicenseLabel,
  isQualificationControlledTeamhubService,
  isTeamhubServiceAllowedForLicense,
  sanitizeTeamhubServiceTypes,
} from "@/lib/teamhubServiceRules";
import {
  getCompanyLocationLabel,
  getCompanyProfileLocations,
  hasCompanyLocationAssignment,
} from "@/lib/companyLocationScope";
import TeamhubRegionPicker from "./TeamhubRegionPicker";

function getInitialForm(company) {
  const serviceTypes = Array.isArray(company?.teamhub_service_types) && company.teamhub_service_types.length > 0
    ? company.teamhub_service_types
    : (company?.activities || []);

  return {
    teamhub_enabled: company?.teamhub_enabled === true,
    teamhub_intro: company?.teamhub_intro || "",
    teamhub_contact_name: company?.teamhub_contact_name || "",
    teamhub_contact_email: company?.teamhub_contact_email || "",
    teamhub_contact_phone: company?.teamhub_contact_phone || "",
    teamhub_public_location_id: company?.teamhub_public_location_id || null,
    teamhub_service_types: serviceTypes,
    teamhub_regions: Array.isArray(company?.teamhub_regions) ? company.teamhub_regions : [],
  };
}

export default function TeamhubTab({ companyId, company }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => getInitialForm(company));

  const { data: wpbrLicenses = [] } = useQuery({
    queryKey: ["wpbr-licenses", companyId],
    queryFn: () => base44.entities.CompanyWpbrLicense.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId,
  });

  const { data: personnel = [], isLoading: personnelLoading } = useQuery({
    queryKey: ["personnel"],
    queryFn: () => base44.entities.Personnel.list(),
    enabled: !!companyId,
  });

  const { data: personnelCompanyAssignments = [], isLoading: personnelCompanyAssignmentsLoading } = useQuery({
    queryKey: ["personnel-company-assignments", companyId],
    queryFn: () => base44.entities.PersonnelCompanyAssignment.filter({ company_id: companyId }),
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

  const { data: personnelQualifications = [], isLoading: personnelQualificationsLoading } = useQuery({
    queryKey: ["personnel-qualifications", companyId],
    queryFn: () => base44.entities.PersonnelQualification.list(),
    enabled: !!companyId,
  });

  const effectiveWpbrLicenseType = getEffectiveWpbrLicenseType(company, wpbrLicenses);
  const qualificationDataLoading = personnelLoading || personnelCompanyAssignmentsLoading || personnelQualificationsLoading;
  const teamhubReferencesLoading = qualificationDataLoading || companyLocationsLoading || companyLocationAssignmentsLoading;
  const qualifiedServiceTypes = useMemo(() => getQualifiedTeamhubServiceTypes({
    companyId,
    personnel,
    assignments: personnelCompanyAssignments,
    qualifications: personnelQualifications,
  }), [companyId, personnel, personnelCompanyAssignments, personnelQualifications]);
  const selectableTeamhubLocations = useMemo(() => {
    return getCompanyProfileLocations({
      companyId,
      company,
      locations: companyLocations,
      assignments: companyLocationAssignments,
    })
      .sort((a, b) => String(a.name || a.city || "").localeCompare(String(b.name || b.city || ""), "nl"));
  }, [companyId, company, companyLocations, companyLocationAssignments]);
  const selectableTeamhubLocationIds = useMemo(
    () => new Set(selectableTeamhubLocations.map(location => location.id)),
    [selectableTeamhubLocations]
  );

  const ensurePublicLocationAssignment = async (locationId) => {
    if (!companyId || !locationId || hasCompanyLocationAssignment(companyLocationAssignments, companyId, locationId)) return;
    await base44.entities.CompanyLocationAssignment.create({
      company_id: companyId,
      location_id: locationId,
      usage_type: "operational_branch",
      is_primary: false,
    });
  };

  useEffect(() => {
    setForm(getInitialForm(company));
  }, [company?.id]);

  useEffect(() => {
    if (qualificationDataLoading) return;
    setForm(current => {
      const sanitized = sanitizeTeamhubServiceTypes(effectiveWpbrLicenseType, current.teamhub_service_types || [], qualifiedServiceTypes);
      if (sanitized.length === (current.teamhub_service_types || []).length) return current;
      return { ...current, teamhub_service_types: sanitized };
    });
  }, [effectiveWpbrLicenseType, qualificationDataLoading, qualifiedServiceTypes, company?.id]);

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      await ensurePublicLocationAssignment(payload.teamhub_public_location_id);
      return base44.entities.Company.update(companyId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["company-location-assignments"] });
    },
  });

  const set = (field, value) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const toggleService = (key) => {
    if (!isTeamhubServiceAllowedForLicense(effectiveWpbrLicenseType, key, qualifiedServiceTypes)) return;
    const current = form.teamhub_service_types || [];
    set(
      "teamhub_service_types",
      current.includes(key) ? current.filter(item => item !== key) : [...current, key]
    );
  };

  const save = () => {
    if (teamhubReferencesLoading) return;
    const publicLocationId = form.teamhub_public_location_id && selectableTeamhubLocationIds.has(form.teamhub_public_location_id)
      ? form.teamhub_public_location_id
      : null;

    saveMutation.mutate({
      teamhub_enabled: form.teamhub_enabled === true,
      teamhub_intro: form.teamhub_intro?.trim() || null,
      teamhub_contact_name: form.teamhub_contact_name?.trim() || null,
      teamhub_contact_email: form.teamhub_contact_email?.trim() || null,
      teamhub_contact_phone: form.teamhub_contact_phone?.trim() || null,
      teamhub_public_location_id: publicLocationId,
      teamhub_service_types: sanitizeTeamhubServiceTypes(effectiveWpbrLicenseType, form.teamhub_service_types || [], qualifiedServiceTypes),
      teamhub_regions: form.teamhub_regions || [],
    });
  };

  const renderServiceOption = (activity) => {
    const qualificationCheckPending = qualificationDataLoading && isQualificationControlledTeamhubService(activity.key);
    const allowed = !qualificationCheckPending && isTeamhubServiceAllowedForLicense(effectiveWpbrLicenseType, activity.key, qualifiedServiceTypes);
    const disabledReason = qualificationCheckPending
      ? "Medewerkerscertificaten worden geladen."
      : getTeamhubServiceDisabledReason(effectiveWpbrLicenseType, activity.key, qualifiedServiceTypes);
    const isSelected = (form.teamhub_service_types || []).includes(activity.key);

    return (
      <label
        key={activity.key}
        title={disabledReason}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors cursor-pointer ${
          isSelected 
            ? "border-primary bg-primary/15 text-foreground font-semibold" 
            : allowed 
            ? "border-border bg-card text-foreground hover:border-primary/40" 
            : "border-border/50 bg-muted/30 text-muted-foreground opacity-50 cursor-not-allowed"
        }`}
      >
        <Checkbox
          checked={isSelected}
          disabled={!allowed}
          onCheckedChange={() => toggleService(activity.key)}
          className="h-3.5 w-3.5"
        />
        <span>{activity.label}</span>
      </label>
    );
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Users className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">LOQ Teamhub</p>
              {form.teamhub_enabled ? (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Zichtbaar</Badge>
              ) : (
                <Badge variant="secondary">Niet zichtbaar</Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">Onderaannemersprofiel voor diensten van hoofdaannemers</p>
          </div>
        </div>
        <Button size="sm" onClick={save} disabled={saveMutation.isPending || teamhubReferencesLoading}>
          {saveMutation.isPending || teamhubReferencesLoading ? (
            <>
              <Clock className="mr-1 h-4 w-4" /> {teamhubReferencesLoading ? "Laden..." : "Opslaan..."}
            </>
          ) : saveMutation.isSuccess ? (
            <>
              <Check className="mr-1 h-4 w-4" /> Opgeslagen
            </>
          ) : (
            <>
              <Save className="mr-1 h-4 w-4" /> Opslaan
            </>
          )}
        </Button>
      </div>

      <div className="space-y-5 p-4">
        <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-background p-4">
          <div className="min-w-0">
            <Label className="text-sm font-semibold">Weergeven in LOQ Teamhub</Label>
            <p className="mt-1 text-xs text-muted-foreground">Publiceer dit bedrijfsprofiel als beschikbare onderaannemer.</p>
          </div>
          <Switch checked={form.teamhub_enabled} onCheckedChange={checked => set("teamhub_enabled", checked)} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label>Publieke introductie</Label>
            <Textarea
              value={form.teamhub_intro}
              onChange={e => set("teamhub_intro", e.target.value)}
              rows={5}
              placeholder="Korte omschrijving van specialisaties, werkgebied en inzetbaarheid"
            />
          </div>

          <div className="space-y-3 rounded-md border border-border p-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Label className="font-semibold">Publiek contact</Label>
            </div>
            <div className="space-y-2">
              <Input
                value={form.teamhub_contact_name}
                onChange={e => set("teamhub_contact_name", e.target.value)}
                placeholder="Contactpersoon"
              />
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  value={form.teamhub_contact_email}
                  onChange={e => set("teamhub_contact_email", e.target.value)}
                  placeholder={company?.email || "teamhub@bedrijf.nl"}
                  className="pl-9"
                />
              </div>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={form.teamhub_contact_phone}
                  onChange={e => set("teamhub_contact_phone", e.target.value)}
                  placeholder={company?.phone || "Telefoonnummer"}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-md border border-border bg-background p-4">
          <Label>Vestiging op publieke kaart</Label>
          <Select
            value={form.teamhub_public_location_id || "none"}
            onValueChange={value => set("teamhub_public_location_id", value === "none" ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Kies vestiging" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Geen vestiging tonen</SelectItem>
              {selectableTeamhubLocations.map(location => (
                <SelectItem key={location.id} value={location.id}>
                  {getCompanyLocationLabel(location)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Alleen vestigingen die aan dit bedrijfsprofiel zijn gekoppeld kunnen later op de publieke kaart worden getoond.
          </p>
        </div>

        <div className="space-y-4">
          <Label>Diensten</Label>
          <p className="text-xs text-muted-foreground">
            Beveiligingsdiensten worden vrijgegeven op basis van vergunning: {effectiveWpbrLicenseType ? `${effectiveWpbrLicenseType} - ${getWpbrLicenseLabel(effectiveWpbrLicenseType)}` : "geen actieve WPBR-vergunning gevonden"}. Kwalificatiediensten worden vrijgegeven op basis van geldige medewerkerscertificaten.
          </p>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">Vergunning-gebonden diensten</p>
            {TEAMHUB_LICENSE_SERVICE_GROUPS.map(group => (
              <div key={group.key}>
                <p className="text-xs font-semibold text-muted-foreground mb-2">{group.title}</p>
                <div className="flex flex-wrap gap-2">
                  {getTeamhubServicesByKeys(group.serviceKeys).map(renderServiceOption)}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-semibold text-foreground">Kwalificatie-gebonden diensten</p>
            <div className="flex flex-wrap gap-2">
              {getTeamhubServicesByKeys(TEAMHUB_QUALIFICATION_SERVICE_KEYS).map(renderServiceOption)}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Werkregio's</Label>
          <TeamhubRegionPicker
            value={form.teamhub_regions}
            onChange={regions => set("teamhub_regions", regions)}
          />
        </div>
      </div>
    </div>
  );
}