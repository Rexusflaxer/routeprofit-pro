import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

const FUNCTION_TYPES = [
  { value: "objectbeveiliger", label: "Objectbeveiliger" },
  { value: "receptie", label: "Receptie" },
  { value: "surveillant", label: "Surveillant" },
  { value: "binnendienst", label: "Binnendienst" },
  { value: "klantrelatie", label: "Klantrelatie" },
  { value: "planner", label: "Planner" },
  { value: "centralist", label: "Centralist" },
  { value: "verkeersregelaar", label: "Verkeersregelaar" },
  { value: "brandwacht", label: "Brandwacht" },
  { value: "installateur", label: "Installateur" },
  { value: "rechercheur", label: "Rechercheur" },
  { value: "host", label: "Host / Hostess" },
  { value: "other", label: "Overig" },
];

export default function WizardStep1Company({ form, onChange, companies, assignments, onAddAssignment, onRemoveAssignment }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Primair bedrijf</Label>
          <Select value={form.primary_company_id || "none"} onValueChange={v => onChange("primary_company_id", v === "none" ? null : v)}>
            <SelectTrigger><SelectValue placeholder="Kies bedrijf" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Geen —</SelectItem>
              {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Functietype</Label>
          <Select value={form.function_type || "unknown"} onValueChange={v => onChange("function_type", v === "unknown" ? null : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unknown">Kies functietype</SelectItem>
              {FUNCTION_TYPES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Loondienst / ZZP</Label>
          <Select value={form.employee_type || "loondienst"} onValueChange={v => onChange("employee_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="loondienst">Loondienst</SelectItem>
              <SelectItem value="zzp">ZZP</SelectItem>
            </SelectContent>
          </Select>
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

      <div className="space-y-2">
        <Label className="text-sm font-medium">Extra bedrijfskoppelingen</Label>
        <div className="space-y-2">
          {assignments.map((a, i) => {
            const co = companies.find(c => c.id === a.company_id);
            return (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border">
                <span className="text-sm flex-1">{co?.display_name || a.company_id}</span>
                <Badge variant="outline" className="text-xs">{a.relation_type}</Badge>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => onRemoveAssignment(i)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            );
          })}
          {companies.length > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={() => onAddAssignment(companies[0].id)}>
              <Plus className="w-3 h-3 mr-1" /> Bedrijf koppelen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
