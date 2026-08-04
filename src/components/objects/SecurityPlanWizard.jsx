import React, { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { WizardPanel, WizardSteps } from "./ObjectWizardUi";
import { wizardStepMotion } from "@/components/ui-custom/wizardMotion";
import SecurityPlanDetailsStep from "./SecurityPlanDetailsStep";
import SecurityPlanDurationStep from "./SecurityPlanDurationStep";
import SecurityPlanEmptyStep from "./SecurityPlanEmptyStep";

const STEPS = [{ key: "type", label: "Soort" }, { key: "duration", label: "Duur" }, { key: "empty", label: "Stap 3" }];

export default function SecurityPlanWizard({ onCancel, onSave, saving, error }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ plan_type: "", title: "", description: "", duration_minutes: "" });
  const canNext = step === 0 ? form.plan_type && (form.plan_type === "full" || form.title.trim()) : step === 1 ? Number(form.duration_minutes) > 0 : true;
  const submit = () => onSave({ ...form, title: form.title.trim(), description: form.description.trim() || null, duration_minutes: Number(form.duration_minutes) });
  return <WizardPanel><WizardSteps stepIndex={step} steps={STEPS} label="Plan toevoegen" /><motion.div key={step} {...wizardStepMotion}>{step === 0 ? <SecurityPlanDetailsStep form={form} onChange={setForm} onSelectFull={() => setStep(1)} /> : step === 1 ? <SecurityPlanDurationStep value={form.duration_minutes} onChange={value => setForm(current => ({ ...current, duration_minutes: value }))} /> : <SecurityPlanEmptyStep />}</motion.div>{error && <p className="mt-4 text-xs text-destructive">{error.message}</p>}<div className="mt-5 flex items-center justify-between"><Button type="button" variant="ghost" size="sm" onClick={onCancel}>Annuleren</Button><div className="flex gap-2">{step > 0 && <Button type="button" variant="outline" size="sm" onClick={() => setStep(current => current - 1)} disabled={saving}>Vorige</Button>}<Button type="button" size="sm" onClick={() => step === 2 ? submit() : setStep(current => current + 1)} disabled={!canNext || saving}>{step === 2 ? (saving ? "Toevoegen..." : "Plan toevoegen") : "Volgende"}</Button></div></div></WizardPanel>;
}