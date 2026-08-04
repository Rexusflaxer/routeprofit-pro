import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { WizardPanel, WizardSteps } from "./ObjectWizardUi";
import { wizardStepMotion } from "@/components/ui-custom/wizardMotion";
import SecurityPlanDetailsStep from "./SecurityPlanDetailsStep";
import SecurityPlanDurationStep from "./SecurityPlanDurationStep";
import SecurityPlanInstructionsStep from "./SecurityPlanInstructionsStep";
import SecurityPlanReviewStep from "./SecurityPlanReviewStep";

export default function SecurityPlanWizard({ category, initialValue, onCancel, onSave, saving, error }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ title: initialValue?.title || "", description: initialValue?.description || "", scope_type: initialValue?.scope_type || (category.supportsScope ? "" : "not_applicable"), duration_minutes: initialValue?.duration_minutes || "", instructions: initialValue?.instructions || [] });
  const steps = useMemo(() => [{ key: "basis", label: "Basis" }, ...(category.durationRequired ? [{ key: "duration", label: "Duur" }] : []), { key: "instructions", label: "Instructies" }, { key: "review", label: "Controle" }], [category]);
  const current = steps[step].key;
  const canNext = current === "basis" ? form.title.trim() && (!category.supportsScope || form.scope_type) : current === "duration" ? Number(form.duration_minutes) > 0 : true;
  const submit = () => onSave({ ...form, title: form.title.trim(), description: form.description.trim() || null, duration_minutes: category.durationRequired ? Number(form.duration_minutes) : null, instructions: form.instructions.map(item => item.trim()).filter(Boolean) });
  const content = current === "basis" ? <SecurityPlanDetailsStep form={form} category={category} onChange={setForm} /> : current === "duration" ? <SecurityPlanDurationStep value={form.duration_minutes} onChange={value => setForm(old => ({ ...old, duration_minutes: value }))} /> : current === "instructions" ? <SecurityPlanInstructionsStep instructions={form.instructions} onChange={value => setForm(old => ({ ...old, instructions: value }))} /> : <SecurityPlanReviewStep form={form} category={category} />;
  return <WizardPanel><WizardSteps stepIndex={step} steps={steps} label="Uitvoeringsplan" /><motion.div key={current} {...wizardStepMotion}>{content}</motion.div>{error && <p className="mt-4 text-xs text-destructive">{error.message}</p>}<div className="mt-5 flex items-center justify-between"><Button type="button" variant="ghost" size="sm" onClick={onCancel}>Annuleren</Button><div className="flex gap-2">{step > 0 && <Button type="button" variant="outline" size="sm" onClick={() => setStep(value => value - 1)} disabled={saving}>Vorige</Button>}<Button type="button" size="sm" onClick={() => current === "review" ? submit() : setStep(value => value + 1)} disabled={!canNext || saving}>{current === "review" ? (saving ? "Opslaan..." : "Plan opslaan") : "Volgende"}</Button></div></div></WizardPanel>;
}