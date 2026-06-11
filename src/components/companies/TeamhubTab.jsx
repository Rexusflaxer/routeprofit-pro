import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import {
  getEffectiveWpbrLicenseType,
  getActiveTeamhubTechnicalCertificationTypes,
  getQualifiedTeamhubServiceTypes,
  sanitizeTeamhubServiceTypes } from
"@/lib/teamhubServiceRules";
import {
  getCompanyProfileLocations,
  hasCompanyLocationAssignment } from
"@/lib/companyLocationScope";
import TeamhubWizard from "./TeamhubWizard";
import TeamhubSummary from "./TeamhubSummary";

function getInitialForm(company) {
  const serviceTypes = Array.isArray(company?.teamhub_service_types) ?
  company.teamhub_service_types :
  [];

  return {
    teamhub_enabled: company?.teamhub_enabled === true,
    teamhub_configured_at: company?.teamhub_configured_at || null,
    teamhub_intro: company?.teamhub_intro || "",
    teamhub_contact_name: company?.teamhub_contact_name || "",
    teamhub_contact_email: company?.teamhub_contact_email || "",
    teamhub_contact_phone: company?.teamhub_contact_phone || "",
    teamhub_public_location_id: company?.teamhub_public_location_id || null,
    teamhub_service_types: serviceTypes,
    teamhub_regions: Array.isArray(company?.teamhub_regions) ? company.teamhub_regions : []
  };
}

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

export default function TeamhubTab({ companyId, company }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => getInitialForm(company));
  const [showWizard, setShowWizard] = useState(() => !hasTeamhubConfiguration(company));

  const { data: wpbrLicenses = [] } = useQuery({
    queryKey: ["wpbr-licenses", companyId],
    queryFn: () => base44.entities.CompanyWpbrLicense.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId
  });

  const { data: personnel = [], isLoading: personnelLoading } = useQuery({
    queryKey: ["personnel"],
    queryFn: () => base44.entities.Personnel.list(),
    enabled: !!companyId
  });

  const { data: personnelCompanyAssignments = [], isLoading: personnelCompanyAssignmentsLoading } = useQuery({
    queryKey: ["personnel-company-assignments", companyId],
    queryFn: () => base44.entities.PersonnelCompanyAssignment.filter({ company_id: companyId }),
    enabled: !!companyId
  });

  const { data: companyLocations = [], isLoading: companyLocationsLoading } = useQuery({
    queryKey: ["company-locations"],
    queryFn: () => base44.entities.CompanyLocation.list(),
    enabled: !!companyId
  });

  const { data: companyLocationAssignments = [], isLoading: companyLocationAssignmentsLoading } = useQuery({
    queryKey: ["company-location-assignments"],
    queryFn: () => base44.entities.CompanyLocationAssignment.list(),
    enabled: !!companyId
  });

  const { data: personnelQualifications = [], isLoading: personnelQualificationsLoading } = useQuery({
    queryKey: ["personnel-qualifications", companyId],
    queryFn: () => base44.entities.PersonnelQualification.list(),
    enabled: !!companyId
  });

  const { data: companyAccreditations = [], isLoading: companyAccreditationsLoading } = useQuery({
    queryKey: ["company-accreditations", companyId],
    queryFn: () => base44.entities.CompanyAccreditation.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId
  });

  const effectiveWpbrLicenseType = getEffectiveWpbrLicenseType(company, wpbrLicenses);
  const qualificationDataLoading = personnelLoading || personnelCompanyAssignmentsLoading || personnelQualificationsLoading;
  const teamhubReferencesLoading = qualificationDataLoading || companyLocationsLoading || companyLocationAssignmentsLoading || companyAccreditationsLoading;
  const qualifiedServiceTypes = useMemo(() => getQualifiedTeamhubServiceTypes({
    companyId,
    personnel,
    assignments: personnelCompanyAssignments,
    qualifications: personnelQualifications
  }), [companyId, personnel, personnelCompanyAssignments, personnelQualifications]);
  const technicalCertificationTypes = useMemo(
    () => getActiveTeamhubTechnicalCertificationTypes(companyAccreditations, company?.teamhub_technical_certifications || []),
    [companyAccreditations, company?.teamhub_technical_certifications]
  );
  const selectableTeamhubLocations = useMemo(() => {
    return getCompanyProfileLocations({
      companyId,
      company,
      locations: companyLocations,
      assignments: companyLocationAssignments
    }).
    sort((a, b) => String(a.name || a.city || "").localeCompare(String(b.name || b.city || ""), "nl"));
  }, [companyId, company, companyLocations, companyLocationAssignments]);
  const selectableTeamhubLocationIds = useMemo(
    () => new Set(selectableTeamhubLocations.map((location) => location.id)),
    [selectableTeamhubLocations]
  );

  const ensurePublicLocationAssignment = async (locationId) => {
    if (!companyId || !locationId || hasCompanyLocationAssignment(companyLocationAssignments, companyId, locationId)) return;
    await base44.entities.CompanyLocationAssignment.create({
      company_id: companyId,
      location_id: locationId,
      usage_type: "operational_branch",
      is_primary: false
    });
  };

  useEffect(() => {
    setForm(getInitialForm(company));
    setShowWizard(!hasTeamhubConfiguration(company));
  }, [company?.id]);

  useEffect(() => {
    if (qualificationDataLoading) return;
    setForm((current) => {
      const sanitized = sanitizeTeamhubServiceTypes(
        effectiveWpbrLicenseType,
        current.teamhub_service_types || [],
        qualifiedServiceTypes,
        technicalCertificationTypes
      );
      if (sanitized.length === (current.teamhub_service_types || []).length) return current;
      return { ...current, teamhub_service_types: sanitized };
    });
  }, [effectiveWpbrLicenseType, qualificationDataLoading, qualifiedServiceTypes, technicalCertificationTypes, company?.id]);

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      await ensurePublicLocationAssignment(payload.teamhub_public_location_id);
      return base44.entities.Company.update(companyId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["company-location-assignments"] });
    }
  });

  const set = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const save = () => {
    if (teamhubReferencesLoading) return;
    const publicLocationId = form.teamhub_public_location_id && selectableTeamhubLocationIds.has(form.teamhub_public_location_id) ?
    form.teamhub_public_location_id :
    null;
    const configuredAt = form.teamhub_configured_at || new Date().toISOString();

    const payload = {
      teamhub_enabled: form.teamhub_enabled === true,
      teamhub_configured_at: configuredAt,
      teamhub_intro: form.teamhub_intro?.trim() || null,
      teamhub_contact_name: form.teamhub_contact_name?.trim() || null,
      teamhub_contact_email: form.teamhub_contact_email?.trim() || null,
      teamhub_contact_phone: form.teamhub_contact_phone?.trim() || null,
      teamhub_public_location_id: publicLocationId,
      teamhub_service_types: sanitizeTeamhubServiceTypes(
        effectiveWpbrLicenseType,
        form.teamhub_service_types || [],
        qualifiedServiceTypes,
        technicalCertificationTypes
      ),
      teamhub_regions: form.teamhub_regions || []
    };

    setForm((current) => ({ ...current, ...payload }));
    saveMutation.mutate(payload);
    setShowWizard(false);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">LOQ Teamhub</p>
              {form.teamhub_enabled ?
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Zichtbaar</Badge> :

              <Badge variant="secondary">Niet zichtbaar</Badge>
              }
            </div>
            <p className="truncate text-xs text-muted-foreground">Onderaannemersprofiel voor diensten van hoofdaannemers</p>
          </div>
        </div>
      </div>

      <div className="p-4">
        {showWizard ? (
          <TeamhubWizard
            form={form}
            set={set}
            save={save}
            isSaving={saveMutation.isPending}
            selectableTeamhubLocations={selectableTeamhubLocations}
            selectableTeamhubLocationIds={selectableTeamhubLocationIds}
            effectiveWpbrLicenseType={effectiveWpbrLicenseType}
            qualifiedServiceTypes={qualifiedServiceTypes}
            technicalCertificationTypes={technicalCertificationTypes}
            qualificationDataLoading={qualificationDataLoading}
            teamhubReferencesLoading={teamhubReferencesLoading}
            company={company}
          />
        ) : (
          <TeamhubSummary
            form={form}
            company={company}
            selectableTeamhubLocations={selectableTeamhubLocations}
            effectiveWpbrLicenseType={effectiveWpbrLicenseType}
            onEdit={() => setShowWizard(true)}
            onToggleVisibility={() => {
              const newEnabled = !form.teamhub_enabled;
              set("teamhub_enabled", newEnabled);
              saveMutation.mutate({
                ...form,
                teamhub_enabled: newEnabled,
                teamhub_configured_at: form.teamhub_configured_at || new Date().toISOString()
              });
            }}
          />
        )}
      </div>
    </div>);

}