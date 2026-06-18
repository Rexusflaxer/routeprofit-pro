import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function WizardStep1Company({ form, onChange }) {
  const isSelfEmployed = form.relationship_type === "self_employed" || form.employee_type === "zzp";
  const profileLabel = isSelfEmployed ? "ZZP'er" : "Loondienstmedewerker";
  const profileDescription = isSelfEmployed
    ? "Je maakt een zelfstandig ondernemersprofiel aan."
    : "Je maakt een loondienstmedewerker aan.";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Je maakt aan</Label>
              <p className="mt-1 text-base font-semibold text-foreground">{profileLabel}</p>
              <p className="mt-1 text-sm text-muted-foreground">{profileDescription}</p>
            </div>
            <Badge variant="secondary" className="whitespace-nowrap">
              {isSelfEmployed ? "ZZP" : "Loondienst"}
            </Badge>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Status medewerker</Label>
          <Select value={form.status || "draft"} onValueChange={v => onChange("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Concept</SelectItem>
              <SelectItem value="onboarding">Onboarding</SelectItem>
              <SelectItem value="active">Actief</SelectItem>
              <SelectItem value="inactive">Inactief</SelectItem>
              <SelectItem value="archived">Gearchiveerd</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
