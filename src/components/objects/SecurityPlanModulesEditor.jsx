import React from "react";
import { Boxes, Link2, MousePointerClick, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createSecurityPlanClientId } from "./securityPlanConfig";

const TYPE_LABELS = {
  visitor_registration: "Bezoekersregistratie",
  item_issuance: "Middelenuitgifte",
  mail_package_receipt: "Post- & pakketregistratie",
  lost_and_found: "Gevonden voorwerpen",
  object_calendar: "Objectagenda",
  action_points: "Actiepunten",
};

function assignmentFor(value, moduleId) {
  return (Array.isArray(value) ? value : []).find(assignment => assignment.module_id === moduleId) || null;
}

function replaceAssignment(value, moduleId, nextAssignment) {
  const current = Array.isArray(value) ? value : [];
  const without = current.filter(assignment => assignment.module_id !== moduleId);
  if (!nextAssignment) return without.map((assignment, index) => ({ ...assignment, sequence: index + 1 }));
  return [...without, nextAssignment].map((assignment, index) => ({ ...assignment, sequence: index + 1 }));
}

export default function SecurityPlanModulesEditor({ modules = [], value = [], onChange }) {
  const selectedCount = value.length;
  if (!modules.length) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/25 px-6 text-center backdrop-blur-xl">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-card/50"><Boxes className="h-5 w-5 text-muted-foreground" /></div>
        <h3 className="mt-4 text-sm font-semibold">Nog geen actieve objectmodules</h3>
        <p className="mt-1 max-w-lg text-xs leading-relaxed text-muted-foreground">Voeg eerst in de objectkaart onder Modules een module toe, richt deze in en activeer de configuratie. Daarna kan dezelfde module veilig aan één of meerdere planvarianten worden gekoppeld.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border/70 bg-card/45 p-4 shadow-sm backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-primary" /> Modules voor deze planvariant</h3>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">Kies welke objectbrede modules tijdens deze taak relevant zijn. De configuratie blijft centraal op het object staan en wordt niet naar dit plan gekopieerd. Toekomstige operationele registraties gebruiken dezelfde objectdataset zodra de uitvoeringsflow is geactiveerd.</p>
          </div>
          <Badge variant="outline">{selectedCount} gekoppeld</Badge>
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        {modules.map(module => {
          const assignment = assignmentFor(value, module.id);
          const selected = Boolean(assignment);
          const available = module.status === "active" && Boolean(module.current_published_revision_id);
          const update = patch => onChange(replaceAssignment(value, module.id, {
            id: assignment?.id || createSecurityPlanClientId("module"),
            sequence: assignment?.sequence || value.length + 1,
            module_id: module.id,
            module_revision_id: module.current_published_revision_id || null,
            access_mode: assignment?.access_mode || "register",
            quick_action: assignment?.quick_action || false,
            instruction: assignment?.instruction || "",
            ...patch,
          }));
          return (
            <article key={module.id} className={`rounded-xl border p-4 shadow-sm backdrop-blur-xl transition-colors ${selected ? "border-primary/50 bg-primary/5" : "border-border/70 bg-card/45"}`}>
              <div className="flex items-start gap-3">
                <Checkbox
                  id={`plan-module-${module.id}`}
                  checked={selected}
                  onCheckedChange={checked => checked ? update({}) : onChange(replaceAssignment(value, module.id, null))}
                  disabled={!available && !selected}
                  aria-label={`${module.display_name} koppelen`}
                />
                <label htmlFor={`plan-module-${module.id}`} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block text-sm font-semibold">{module.display_name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{TYPE_LABELS[module.module_type] || "Objectmodule"} · gedeelde objectconfiguratie</span>
                </label>
                <Badge variant="outline" className={`shrink-0 ${available ? "border-emerald-300/60 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : "border-amber-300/60 bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}><ShieldCheck className="mr-1 h-3 w-3" /> {available ? "Actief" : module.status === "suspended" ? "Gepauzeerd" : "Niet beschikbaar"}</Badge>
              </div>

              {selected && (
                <div className="mt-4 space-y-4 border-t border-border/70 pt-4">
                  {!available && <div className="rounded-lg border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">Deze gekoppelde module is niet meer actief. Ontkoppel haar om het plan weer publiceerbaar te maken, of activeer de module opnieuw.</div>}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Gebruik binnen deze taak</Label>
                      <Select value={assignment.access_mode} onValueChange={access_mode => update({ access_mode })} disabled={!available}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="read">Alleen raadplegen</SelectItem>
                          <SelectItem value="register">Raadplegen en registreren</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/70 bg-background/30 px-3 py-2.5">
                      <Checkbox checked={assignment.quick_action} onCheckedChange={quick_action => update({ quick_action: Boolean(quick_action) })} disabled={!available} />
                      <span className="min-w-0"><span className="flex items-center gap-1.5 text-xs font-semibold"><MousePointerClick className="h-3.5 w-3.5" /> Snelle actie</span><span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">Toon de module prominent tijdens deze taak.</span></span>
                    </label>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`module-instruction-${module.id}`} className="text-xs font-semibold">Aanvullende instructie voor deze planvariant</Label>
                    <Textarea id={`module-instruction-${module.id}`} value={assignment.instruction || ""} onChange={event => update({ instruction: event.target.value })} disabled={!available} maxLength={500} rows={2} placeholder="Bijvoorbeeld: controleer openstaande uitgiftes vóór het sluiten." />
                    <p className="text-[11px] text-muted-foreground">Deze toelichting verandert de centrale modulebevoegdheden nooit.</p>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
