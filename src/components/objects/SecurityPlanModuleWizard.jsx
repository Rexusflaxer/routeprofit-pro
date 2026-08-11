import React from "react";
import { Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoiceCard, StepHeading, WizardPanel, WizardSteps } from "./ObjectWizardUi";

const TYPE_LABELS = {
  visitor_registration: "Bezoekersregistratie",
  item_issuance: "Middelenuitgifte",
  mail_package_receipt: "Post- & pakketregistratie",
  lost_and_found: "Gevonden voorwerpen",
  object_calendar: "Objectagenda",
  action_points: "Actiepunten",
};

export function securityPlanModuleTypeLabel(module) {
  return TYPE_LABELS[module?.module_type] || "Objectmodule";
}

export default function SecurityPlanModuleWizard({ modules = [], onCancel, onSelect }) {
  return <WizardPanel className="bg-card/55 backdrop-blur-2xl"><WizardSteps stepIndex={0} steps={[{ key: "module", label: "Module" }]} label="Module toevoegen" /><div className="space-y-4"><StepHeading title="Welke module wilt u toevoegen?" description="Kies een beschikbare module om deze direct aan het beveiligingsplan toe te voegen." /><div className="grid grid-cols-1 gap-2">{modules.map(module => <ChoiceCard key={module.id} title={module.display_name || module.name || "Objectmodule"} description={securityPlanModuleTypeLabel(module)} leading={<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card/60"><Boxes className="h-4 w-4 text-primary" /></span>} onClick={() => onSelect(module)} />)}</div></div><div className="mt-6"><Button type="button" variant="ghost" size="sm" onClick={onCancel}>Annuleren</Button></div></WizardPanel>;
}