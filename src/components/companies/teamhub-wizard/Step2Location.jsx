import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCompanyLocationLabel } from "@/lib/companyLocationScope";

export default function TeamhubStep2Location({ form, set, selectableTeamhubLocations }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Selecteer een vestiging</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Kies welke vestiging zichtbaar zal zijn in LOQ Teamhub.
        </p>
      </div>

      <div className="space-y-2 rounded-md border border-border bg-background p-4">
        <Label>Vestiging</Label>
        <Select
          value={form.teamhub_public_location_id || ""}
          onValueChange={(value) => set("teamhub_public_location_id", value || null)}
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