import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Edit2 } from "lucide-react";
import TeamhubMap from "@/components/teamhub/TeamhubMap";

export default function TeamhubSummary({ form, company, selectableTeamhubLocations, effectiveWpbrLicenseType, onEdit }) {
  const selectedLocation = useMemo(
    () => selectableTeamhubLocations.find((loc) => loc.id === form.teamhub_public_location_id),
    [form.teamhub_public_location_id, selectableTeamhubLocations]
  );
  const previewCompany = { ...company, ...form };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Teamhub preview</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Zo wordt dit bedrijf getoond wanneer een hoofdaannemer het profiel op de kaart opent.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit} className="gap-2">
          <Edit2 className="h-4 w-4" />
          Bewerken
        </Button>
      </div>

      <TeamhubMap
        companies={[previewCompany]}
        locations={selectedLocation ? [selectedLocation] : selectableTeamhubLocations}
        defaultSelectedCompanyId={previewCompany.id}
        lockSelection
        showProfileCount={false}
        heightClassName="h-[560px] min-h-[460px]"
        emptyMessage="Selecteer een vestiging met coordinaten om de kaartpreview te tonen."
        effectiveWpbrLicenseType={effectiveWpbrLicenseType}
        interactive={false}
      />
    </div>
  );
}
