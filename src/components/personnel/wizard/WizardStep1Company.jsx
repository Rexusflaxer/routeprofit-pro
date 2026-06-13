import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

const PROFILE_POLICY_LABELS = {
  local_only: "Alleen lokaal",
  profile_wins_after_acceptance: "Profiel wint na acceptatie",
  organization_override: "Organisatiekopie leidend"
};

const CONFLICT_STATUS_LABELS = {
  none: "Geen conflict",
  review_required: "Review nodig",
  profile_accepted: "Profiel geaccepteerd",
  local_copy_retained: "Lokale kopie bewaard",
};

const RELATION_OPTIONS = [
  {
    value: "loondienst",
    label: "Loondienst",
    description: "Medewerker in dienst van de organisatie."
  },
  {
    value: "zzp",
    label: "ZZP'er",
    description: "Zelfstandige ondernemer met een eigen profiel of lokaal dossier."
  }
];

export default function WizardStep1Company({ form, onChange }) {
  const setEmploymentType = (value) => {
    onChange("employee_type", value);
    onChange("relationship_type", value === "zzp" ? "self_employed" : "employee");
    onChange("profile_data_policy", value === "zzp" ? "profile_wins_after_acceptance" : "local_only");
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-1">
          <Label>Loondienst / ZZP</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {RELATION_OPTIONS.map(option => {
              const active = (form.employee_type || "loondienst") === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setEmploymentType(option.value)}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    active ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{option.label}</span>
                    {active && <Badge variant="secondary" className="text-xs">Gekozen</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
                </button>
              );
            })}
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

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Teamhub-koppelbeleid</Label>
            <Select value={form.profile_data_policy || "local_only"} onValueChange={v => onChange("profile_data_policy", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PROFILE_POLICY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Conflictstatus</Label>
            <Select value={form.profile_conflict_status || "none"} onValueChange={v => onChange("profile_conflict_status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CONFLICT_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <Switch checked={form.local_organization_copy_retained !== false} onCheckedChange={v => onChange("local_organization_copy_retained", v)} />
            <Label>Lokale organisatiekopie bewaren</Label>
          </div>
        </div>
      </div>
    </div>
  );
}
