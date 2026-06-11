import React, { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit2 } from "lucide-react";
import TeamhubCompanyPreview from "@/components/teamhub/TeamhubCompanyPreview";

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
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Teamhub preview</h3>
            {form.teamhub_enabled ? (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Zichtbaar</Badge>
            ) : (
              <Badge variant="secondary">Niet zichtbaar</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Zo wordt dit bedrijf getoond wanneer een hoofdaannemer het profiel op de kaart opent.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit} className="gap-2">
          <Edit2 className="h-4 w-4" />
          Bewerken
        </Button>
      </div>

      <TeamhubCompanyPreview
        company={previewCompany}
        location={selectedLocation}
        effectiveWpbrLicenseType={effectiveWpbrLicenseType}
      />
    </div>
  );
}
