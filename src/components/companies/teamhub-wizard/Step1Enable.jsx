import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function TeamhubStep1Enable({ form, set }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Zichtbaarheid in LOQ Teamhub</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Bepaal of dit bedrijfsprofiel zichtbaar is als onderaannemer in LOQ Teamhub.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-background p-4">
        <div className="min-w-0">
          <Label className="text-sm font-semibold">Weergeven in LOQ Teamhub</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Dit bedrijfsprofiel publiceren als beschikbare onderaannemer.
          </p>
        </div>
        <Switch
          checked={form.teamhub_enabled}
          onCheckedChange={(checked) => set("teamhub_enabled", checked)}
        />
      </div>
    </div>
  );
}