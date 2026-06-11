import React from "react";
import TeamhubRegionPicker from "../TeamhubRegionPicker";

export default function TeamhubStep4Regions({ form, set }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Selecteer werkgebied</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Bepaal in welke gemeenten dit bedrijf diensten aanbiedt.
        </p>
      </div>

      <TeamhubRegionPicker value={form.teamhub_regions} onChange={(regions) => set("teamhub_regions", regions)} />
    </div>
  );
}