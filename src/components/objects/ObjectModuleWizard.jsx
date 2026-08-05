import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Layers3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { wizardRevealMotion } from "@/components/ui-custom/wizardMotion";
import { ChoiceCard, Field, StepHeading, WizardPanel, WizardSteps } from "./ObjectWizardUi";
import { OBJECT_MODULE_CATALOG } from "./objectModuleConfig";

const STEPS = [
  { key: "type", label: "Module" },
  { key: "name", label: "Naam" },
];

export default function ObjectModuleWizard({ existingTypes = [], onCancel, onSave, saving = false, error = null }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState({ module_type: "", name: "" });
  const existingTypeSet = useMemo(() => new Set(existingTypes), [existingTypes]);
  const selectedDefinition = OBJECT_MODULE_CATALOG.find(item => item.key === form.module_type) || null;
  const chooseType = definition => {
    if (existingTypeSet.has(definition.key)) return;
    setForm(current => ({
      module_type: definition.key,
      name: !current.name || OBJECT_MODULE_CATALOG.some(item => item.label === current.name) ? definition.label : current.name,
    }));
    setStepIndex(1);
  };
  const validName = Boolean(form.name.trim());

  return <WizardPanel title="Objectmodule toevoegen" className="bg-card/30 backdrop-blur-xl">
    <div className="mx-auto max-w-5xl">
      <WizardSteps stepIndex={stepIndex} steps={STEPS} label="Stappen voor objectmodule" />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={STEPS[stepIndex].key} {...wizardRevealMotion}>
          {stepIndex === 0 ? <div className="space-y-4"><StepHeading title="Welke gedeelde module wil je gebruiken?" description="Elke module wordt één keer voor dit object ingericht. Beveiligingsplannen kunnen daarna dezelfde actuele gegevens gebruiken." /><div className="grid grid-cols-1 gap-2 lg:grid-cols-2">{OBJECT_MODULE_CATALOG.map(definition => { const Icon = definition.icon || Layers3; const alreadyAdded = existingTypeSet.has(definition.key); return <ChoiceCard key={definition.key} selected={form.module_type === definition.key} disabled={alreadyAdded} onClick={() => chooseType(definition)} title={definition.label} description={alreadyAdded ? "Al toegevoegd aan dit object" : definition.description} leading={<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card/60"><Icon className="h-4 w-4 text-primary" /></span>} className="min-h-20" />; })}</div></div> : <div className="space-y-4"><StepHeading title="Geef de module een herkenbare naam" description="Na toevoegen opent direct de werkruimte voor velden, catalogus, bevoegdheden en privacy." /><div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_240px]"><Field label="Modulenaam" htmlFor="object-module-name" required hint="Gebruik bijvoorbeeld ‘Sleutel- en middelenuitgifte receptie’. Dit verandert het moduletype niet."><Input id="object-module-name" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} autoFocus maxLength={120} placeholder={selectedDefinition?.label || "Objectmodule"} /></Field><div className="rounded-xl border border-border/70 bg-card/45 p-4 shadow-sm backdrop-blur-xl"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Gekozen module</p><p className="mt-1 text-sm font-medium">{selectedDefinition?.label}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{selectedDefinition?.description}</p></div></div></div>}
        </motion.div>
      </AnimatePresence>
      {error && <div role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error.message || "De module kon niet worden toegevoegd."}</div>}
      <div className="mt-5 flex items-center justify-between gap-3"><Button type="button" variant="ghost" size="sm" onClick={stepIndex === 0 ? onCancel : () => setStepIndex(0)} disabled={saving}><ArrowLeft className="h-4 w-4" /> {stepIndex === 0 ? "Annuleren" : "Terug"}</Button>{stepIndex === 0 ? <Button type="button" size="sm" onClick={() => setStepIndex(1)} disabled={!selectedDefinition || saving}>Volgende <ArrowRight className="h-4 w-4" /></Button> : <Button type="button" size="sm" onClick={() => onSave({ ...form, name: form.name.trim() })} disabled={!validName || saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers3 className="h-4 w-4" />} Module toevoegen</Button>}</div>
    </div>
  </WizardPanel>;
}
