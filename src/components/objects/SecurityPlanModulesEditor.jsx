import React, { useState } from "react";
import { Boxes, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createSecurityPlanClientId } from "./securityPlanConfig";
import SecurityPlanModuleWizard, { securityPlanModuleTypeLabel } from "./SecurityPlanModuleWizard";

export default function SecurityPlanModulesEditor({ modules = [], value = [], onChange }) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const assignments = Array.isArray(value) ? value : [];
  const moduleById = new Map(modules.map(module => [module.id, module]));
  const available = modules.filter(module => module.status === "active" && module.current_published_revision_id && !assignments.some(item => item.module_id === module.id));
  const addModule = module => {
    onChange([...assignments, { id: createSecurityPlanClientId("module"), sequence: assignments.length + 1, module_id: module.id, module_revision_id: module.current_published_revision_id, access_mode: "register", quick_action: false, instruction: "" }]);
    setWizardOpen(false);
  };
  const removeModule = moduleId => onChange(assignments.filter(item => item.module_id !== moduleId).map((item, index) => ({ ...item, sequence: index + 1 })));

  return <div className="min-h-full">
    {wizardOpen && <SecurityPlanModuleWizard modules={available} onCancel={() => setWizardOpen(false)} onSelect={addModule} />}
    <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
      <div><h3 className="text-sm font-semibold">Modules in dit beveiligingsplan</h3><p className="mt-1 text-xs text-muted-foreground">Voeg modules toe die eerst in de tab Modules zijn aangemaakt en geactiveerd.</p></div>
      {!wizardOpen && <Button type="button" size="sm" disabled={!available.length} onClick={() => setWizardOpen(true)}><Plus className="h-3.5 w-3.5" /> Module toevoegen</Button>}
    </div>
    {assignments.length ? <Table><TableHeader><TableRow className="bg-muted/20 hover:bg-muted/20"><TableHead className="pl-4 text-xs">Module</TableHead><TableHead className="text-xs">Type</TableHead><TableHead className="pr-4 text-right text-xs">Actie</TableHead></TableRow></TableHeader><TableBody>{assignments.map(assignment => { const module = moduleById.get(assignment.module_id); return <TableRow key={assignment.id || assignment.module_id}><TableCell className="pl-4 font-medium">{module?.display_name || "Onbekende module"}</TableCell><TableCell className="text-muted-foreground">{securityPlanModuleTypeLabel(module)}</TableCell><TableCell className="pr-4 text-right"><Button type="button" variant="ghost" size="icon" onClick={() => removeModule(assignment.module_id)} aria-label={`${module?.display_name || "Module"} verwijderen`}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></TableCell></TableRow>; })}</TableBody></Table> : <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center"><Boxes className="h-5 w-5 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Nog geen modules toegevoegd</p><p className="mt-1 text-xs text-muted-foreground">Gebruik de knop Module toevoegen om een bestaande objectmodule te kiezen.</p></div>}
  </div>;
}