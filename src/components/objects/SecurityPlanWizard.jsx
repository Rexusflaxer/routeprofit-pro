import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { wizardStepMotion } from "@/components/ui-custom/wizardMotion";
import { Field, StepHeading, WizardPanel, WizardSteps } from "./ObjectWizardUi";
import { securityPlanExecutionModeForTaskType } from "./securityPlanConfig";

const STEPS = [{ key: "name", label: "Plannaam" }];

function PlanNameStep({ value, onChange }) {
  return (
    <div className="space-y-5">
      <StepHeading title="Geef het plan een duidelijke naam" description="Gebruik een korte, herkenbare naam." />
      <Field label="Plannaam" htmlFor="security-plan-name" required>
        <Input id="security-plan-name" value={value} onChange={event => onChange(event.target.value)} placeholder="Bijvoorbeeld Avondronde" maxLength={200} autoFocus />
      </Field>
    </div>
  );
}

function initialSecurityPlanForm(initialTaskType, categoryLabel) {
  const taskType = initialTaskType || "other";
  const executionMode = securityPlanExecutionModeForTaskType(taskType);
  return {
    task_type: taskType,
    custom_task_type: taskType === "other" ? categoryLabel || "Anders" : "",
    variant_name: "",
    execution_mode: executionMode,
    duration_mode: executionMode === "continuous_post" ? "schedule_defined" : "fixed",
    duration_minutes: null,
    section_policy: "not_applicable",
    default_section_ids: [],
    allowed_section_ids: [],
    instruction_blocks: [],
    floorplan_id: null,
    floorplan_revision: null,
    route_overlay: null,
  };
}

export default function SecurityPlanWizard({ initialTaskType = "", categoryLabel = "", onCancel, onSave, saving, error }) {
  const [step] = useState(0);
  const [form, setForm] = useState(() => initialSecurityPlanForm(initialTaskType, categoryLabel));
  const steps = STEPS;
  const current = steps[step].key;
  const valid = useMemo(() => Boolean(form.variant_name.trim()), [form.variant_name]);
  const submit = () => onSave({
    ...form,
    custom_task_type: form.task_type === "other" ? form.custom_task_type.trim() : null,
    variant_name: form.variant_name.trim(),
    duration_mode: form.duration_mode,
    duration_minutes: null,
  });
  const content = <PlanNameStep value={form.variant_name} onChange={variant_name => setForm(currentForm => ({ ...currentForm, variant_name }))} />;

  return (
    <WizardPanel className="bg-card/55 backdrop-blur-2xl">
      <WizardSteps stepIndex={step} steps={steps} label={categoryLabel ? `${categoryLabel} toevoegen` : "Beveiligingsplan toevoegen"} />
      <motion.div key={current} {...wizardStepMotion}>{content}</motion.div>
      {error && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <p>{error.message || "Het beveiligingsplan kon niet worden aangemaakt."}</p>
          {(error.status || error.requestId) && <p className="mt-1 text-[11px] opacity-80">{[error.status && `Status ${error.status}`, error.requestId && `Referentie ${error.requestId}`].filter(Boolean).join(" · ")}</p>}
        </div>
      )}
      <div className="mt-6 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>Annuleren</Button>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={submit} disabled={!valid || saving}>
            {saving ? "Aanmaken..." : "Concept aanmaken"}
          </Button>
        </div>
      </div>
    </WizardPanel>
  );
}
