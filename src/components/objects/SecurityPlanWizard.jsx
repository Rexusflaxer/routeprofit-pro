import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { wizardStepMotion } from "@/components/ui-custom/wizardMotion";
import { Field, StepHeading, WizardPanel, WizardSteps } from "./ObjectWizardUi";
import { SECURITY_PLAN_TASK_TYPES, securityPlanExecutionModeForTaskType } from "./securityPlanConfig";

const STEPS = [{ key: "category", label: "Categorie" }, { key: "name", label: "Plannaam" }];

function CategoryStep({ value, onChange }) {
  return <div className="space-y-4"><StepHeading title="Wat betreft het plan?" description="Kies het soort werkzaamheden waarvoor u een plan toevoegt." /><div className="grid grid-cols-1 gap-2">{SECURITY_PLAN_TASK_TYPES.map(category => <button key={category.key} type="button" onClick={() => onChange(category.key)} className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${value === category.key ? "border-primary bg-primary/5" : "border-border/70 bg-card/35 hover:bg-muted/30"}`}><span className="block text-sm font-semibold">{category.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{category.description}</span></button>)}</div></div>;
}

function NameStep({ form, onChange }) {
  const continuous = securityPlanExecutionModeForTaskType(form.task_type) === "continuous_post";
  return <div className="space-y-5"><StepHeading title="Geef het plan een naam" description="Gebruik een korte, herkenbare naam." /><Field label="Plannaam" htmlFor="security-plan-name" required><Input id="security-plan-name" value={form.variant_name} onChange={event => onChange({ variant_name: event.target.value })} placeholder="Bijvoorbeeld Avondronde" maxLength={200} autoFocus /></Field>{!continuous && <Field label="Opgenomen duur (minuten)" htmlFor="security-plan-duration" required><Input id="security-plan-duration" type="number" min="1" max="10080" step="1" value={form.duration_minutes} onChange={event => onChange({ duration_minutes: event.target.value })} placeholder="Bijvoorbeeld 30" /></Field>}</div>;
}

export default function SecurityPlanWizard({ onCancel, onSave, saving, error }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ task_type: "", variant_name: "", duration_minutes: "" });
  const current = STEPS[step].key;
  const continuous = securityPlanExecutionModeForTaskType(form.task_type) === "continuous_post";
  const valid = useMemo(() => current === "category" ? Boolean(form.task_type) : Boolean(form.variant_name.trim() && (continuous || Number(form.duration_minutes) > 0)), [continuous, current, form]);
  const submit = () => { const executionMode = securityPlanExecutionModeForTaskType(form.task_type); onSave({ ...form, custom_task_type: form.task_type === "other" ? "Anders" : null, variant_name: form.variant_name.trim(), execution_mode: executionMode, duration_mode: executionMode === "continuous_post" ? "schedule_defined" : "fixed", duration_minutes: executionMode === "continuous_post" ? null : Number(form.duration_minutes), section_policy: "not_applicable", default_section_ids: [], allowed_section_ids: [], instruction_blocks: [], module_assignments: [], floorplan_id: null, floorplan_revision: null, route_overlay: null }); };

  const selectCategory = task_type => {
    setForm(currentForm => ({ ...currentForm, task_type }));
    setStep(1);
  };

  return <WizardPanel className="bg-card/55 backdrop-blur-2xl"><WizardSteps stepIndex={step} steps={STEPS} label="Beveiligingsplan toevoegen" /><motion.div key={current} {...wizardStepMotion}>{current === "category" ? <CategoryStep value={form.task_type} onChange={selectCategory} /> : <NameStep form={form} onChange={changes => setForm(currentForm => ({ ...currentForm, ...changes }))} />}</motion.div>{error && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error.message || "Het beveiligingsplan kon niet worden aangemaakt."}</div>}<div className="mt-6 flex items-center justify-between gap-3"><Button type="button" variant="ghost" size="sm" onClick={step ? () => setStep(0) : onCancel} disabled={saving}>{step ? "Vorige" : "Annuleren"}</Button>{step === 1 && <Button type="button" size="sm" onClick={submit} disabled={!valid || saving}>{saving ? "Opslaan..." : "Opslaan"}</Button>}</div></WizardPanel>;
}