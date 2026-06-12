import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { getCompanyLocationLabel } from "@/lib/companyLocationScope";

export default function TeamhubStep2Location({
  form,
  set,
  selectableTeamhubLocations,
  hasActiveWpbrLicense,
  hasSelectableTeamhubLocations,
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Selecteer een vestiging</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Kies welke vestiging zichtbaar zal zijn in LOQ Teamhub.
        </p>
      </div>

      {!hasActiveWpbrLicense && (
        <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Actieve WPBR-vergunning vereist</p>
            <p className="mt-0.5 text-xs">Voeg eerst een geldige WPBR-vergunning toe voordat dit bedrijf in Teamhub kan worden ingesteld.</p>
          </div>
        </div>
      )}

      {!hasSelectableTeamhubLocations && (
        <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Geen vestigingen beschikbaar</p>
            <p className="mt-0.5 text-xs">Voeg eerst minimaal één vestiging toe. Daarna kun je hier kiezen welke vestiging op Teamhub zichtbaar wordt.</p>
          </div>
        </div>
      )}

      <div className="space-y-2 rounded-md border border-border bg-background p-4">
        <Label>Vestiging</Label>
        <Select
          value={form.teamhub_public_location_id || ""}
          onValueChange={(value) => set("teamhub_public_location_id", value || null)}
          disabled={!hasActiveWpbrLicense || !hasSelectableTeamhubLocations}
        >
          <SelectTrigger>
            <SelectValue placeholder="Kies een vestiging (verplicht)" />
          </SelectTrigger>
          <SelectContent>
            {selectableTeamhubLocations.map((location) => (
              <SelectItem key={location.id} value={location.id}>
                {getCompanyLocationLabel(location)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Deze vestiging wordt gepubliceerd in uw Teamhub-profiel.
        </p>
      </div>
    </div>
  );
}
