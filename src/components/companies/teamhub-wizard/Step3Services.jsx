import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { ChevronDown } from "lucide-react";
import {
  TEAMHUB_LICENSE_SERVICE_GROUPS,
  TEAMHUB_QUALIFICATION_SERVICE_KEYS,
  TEAMHUB_TECHNICAL_SERVICE_GROUPS,
  getTeamhubServicesByKeys,
  getTeamhubServiceDisabledReason,
  getWpbrLicenseLabel,
  isQualificationControlledTeamhubService,
  isTeamhubServiceAllowedForLicense,
} from "@/lib/teamhubServiceRules";

export default function TeamhubStep3Services({
  form,
  set,
  effectiveWpbrLicenseType,
  qualifiedServiceTypes,
  technicalCertificationTypes,
  qualificationDataLoading,
}) {
  const [expandedGroups, setExpandedGroups] = useState({});

  const isTeamhubServiceAllowed = (key) =>
    isTeamhubServiceAllowedForLicense(
      effectiveWpbrLicenseType,
      key,
      qualifiedServiceTypes,
      technicalCertificationTypes
    );

  const toggleService = (key) => {
    if (!isTeamhubServiceAllowed(key)) return;
    const current = form.teamhub_service_types || [];
    set(
      "teamhub_service_types",
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  const renderServiceOption = (activity) => {
    const qualificationCheckPending = qualificationDataLoading && isQualificationControlledTeamhubService(activity.key);
    const allowed = !qualificationCheckPending && isTeamhubServiceAllowed(activity.key);
    const disabledReason = qualificationCheckPending
      ? "Medewerkerscertificaten worden geladen."
      : getTeamhubServiceDisabledReason(
          effectiveWpbrLicenseType,
          activity.key,
          qualifiedServiceTypes,
          technicalCertificationTypes
        );
    const isSelected = (form.teamhub_service_types || []).includes(activity.key);

    return (
      <div key={activity.key} className="relative group/pill">
        <button
          onClick={() => allowed && toggleService(activity.key)}
          className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : allowed
              ? "border-border bg-card text-foreground hover:border-primary/40 cursor-pointer"
              : "border-border/50 bg-muted/30 text-muted-foreground opacity-50 cursor-not-allowed"
          }`}
        >
          {activity.label}
        </button>
        {!allowed && disabledReason && (
          <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 w-72 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md opacity-0 group-hover/pill:opacity-100 transition-opacity duration-150">
            {disabledReason}
            <div className="absolute left-4 top-full border-4 border-transparent border-t-border" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Selecteer diensten</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Vergunning: {effectiveWpbrLicenseType ? `${effectiveWpbrLicenseType} - ${getWpbrLicenseLabel(effectiveWpbrLicenseType)}` : "Geen actieve WPBR-vergunning"}
        </p>
      </div>

      <div className="space-y-3">
        {/* License-based services */}
        <div className="overflow-hidden rounded-md border border-border">
          <div className="border-b border-border bg-muted/40 px-3 py-2">
            <p className="text-xs font-semibold text-muted-foreground">Vergunning-gebonden diensten</p>
          </div>
          {TEAMHUB_LICENSE_SERVICE_GROUPS.map((group, idx) => {
            const isOpen = !!expandedGroups[group.key];
            const selectedCount = getTeamhubServicesByKeys(group.serviceKeys).filter(
              (a) => (form.teamhub_service_types || []).includes(a.key)
            ).length;
            return (
              <div key={group.key} className={idx > 0 ? "border-t border-border" : ""}>
                <button
                  type="button"
                  onClick={() => setExpandedGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
                >
                  <span className="text-xs font-medium text-foreground">{group.title}</span>
                  <div className="flex items-center gap-2">
                    {selectedCount > 0 && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        {selectedCount}
                      </span>
                    )}
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </button>
                {isOpen && (
                  <div className="flex flex-wrap gap-2 border-t border-border/50 bg-muted/10 px-3 py-3">
                    {getTeamhubServicesByKeys(group.serviceKeys).map(renderServiceOption)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Qualification-based services */}
        <div className="overflow-hidden rounded-md border border-border">
          <div className="border-b border-border bg-muted/40 px-3 py-2">
            <p className="text-xs font-semibold text-muted-foreground">Kwalificatie-gebonden diensten</p>
          </div>
          <div className="flex flex-wrap gap-2 px-3 py-3">
            {getTeamhubServicesByKeys(TEAMHUB_QUALIFICATION_SERVICE_KEYS).map(renderServiceOption)}
          </div>
        </div>

        {/* Technical services */}
        <div className="overflow-hidden rounded-md border border-border">
          <div className="border-b border-border bg-muted/40 px-3 py-2">
            <p className="text-xs font-semibold text-muted-foreground">Techniek & brandveiligheid</p>
          </div>
          {TEAMHUB_TECHNICAL_SERVICE_GROUPS.map((group, idx) => {
            const isOpen = !!expandedGroups[group.key];
            const selectedCount = getTeamhubServicesByKeys(group.serviceKeys).filter(
              (activity) => (form.teamhub_service_types || []).includes(activity.key)
            ).length;
            return (
              <div key={group.key} className={idx > 0 ? "border-t border-border" : ""}>
                <button
                  type="button"
                  onClick={() => setExpandedGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
                >
                  <span className="text-xs font-medium text-foreground">{group.title}</span>
                  <div className="flex items-center gap-2">
                    {selectedCount > 0 && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        {selectedCount}
                      </span>
                    )}
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </button>
                {isOpen && (
                  <div className="flex flex-wrap gap-2 border-t border-border/50 bg-muted/10 px-3 py-3">
                    {getTeamhubServicesByKeys(group.serviceKeys).map(renderServiceOption)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}