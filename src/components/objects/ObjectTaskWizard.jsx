import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WizardPanel, WizardSteps } from "./ObjectWizardUi";
import ObjectTaskTypeStep from "./ObjectTaskTypeStep";
import ObjectTaskPlanStep from "./ObjectTaskPlanStep";
import ObjectTaskTimingStep from "./ObjectTaskTimingStep";
import {
  securityPlanExecutionModeForTaskType,
  securityPlanTaskTypeLabel,
} from "./securityPlanConfig";

const STEPS = [
  { key: "type", label: "Categorie" },
  { key: "plan", label: "Plan" },
  { key: "schedule", label: "Rooster" },
];

function initialForm(task) {
  return {
    security_plan_id: task?.security_plan_id || "",
    task_type: task?.task_type || "",
    custom_task_type: task?.custom_task_type || "",
    execution_mode: task?.execution_mode || "",
    duration_minutes: Number(task?.duration_minutes || 0),
    schedule_entries: Array.isArray(task?.schedule_entries) ? task.schedule_entries : [],
    instructions: task?.instructions || "",
  };
}

export default function ObjectTaskWizard({
  task = null,
  contextData = null,
  securityPlans = [],
  plansLoading,
  plansError,
  weekStart,
  onWeekChange,
  serverClock,
  saving,
  error,
  onSave,
  onCancel,
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => initialForm(task));
  const change = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const activePlans = securityPlans.filter(plan => plan.status !== "archived");
  const typeOptions = [...new Map(activePlans.map(plan => [plan.task_type, plan])).values()].map(plan => {
    const count = activePlans.filter(item => item.task_type === plan.task_type).length;
    return {
      value: plan.task_type,
      label: securityPlanTaskTypeLabel(plan.task_type),
      description: `${count} ${count === 1 ? "plan" : "plannen"} beschikbaar`,
    };
  });
  const categoryPlans = activePlans.filter(plan => plan.task_type === form.task_type);

  const chooseType = option => {
    setForm(current => current.task_type === option.value
      ? current
      : {
        ...current,
        task_type: option.value,
        security_plan_id: "",
        custom_task_type: "",
        execution_mode: "",
        duration_minutes: 0,
        schedule_entries: [],
      });
    setStep(1);
  };

  const choosePlan = plan => {
    const continuous = securityPlanExecutionModeForTaskType(plan.task_type) === "continuous_post";
    const revision = plan.draft_revision || plan.current_revision || {};
    setForm(current => ({
      ...current,
      security_plan_id: plan.id,
      task_type: plan.task_type,
      custom_task_type: plan.task_type === "other" ? plan.custom_task_type || "Andere taak" : "",
      execution_mode: continuous ? "continuous" : "time_window",
      duration_minutes: continuous ? 0 : Number(revision.duration_minutes || 0),
      schedule_entries: current.security_plan_id && current.security_plan_id !== plan.id
        ? []
        : current.schedule_entries,
    }));
    setStep(2);
  };

  const valid = step === 0
    ? Boolean(form.task_type)
    : step === 1
      ? Boolean(form.security_plan_id)
      : Boolean(
        form.schedule_entries.length
        && (form.execution_mode === "continuous" || Number(form.duration_minutes) > 0),
      );

  const submit = () => {
    if (!valid || step !== 2) return;
    onSave({
      ...form,
      duration_minutes: form.execution_mode === "continuous" ? null : Number(form.duration_minutes),
    });
  };

  return (
    <WizardPanel labelledBy="object-task-title">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">
        {task ? "Taak wijzigen" : "Nieuwe taak"}
      </p>
      <h2 id="object-task-title" className="sr-only">Objecttaak</h2>
      <WizardSteps stepIndex={step} steps={STEPS} label="Voortgang taak" />
      <form onSubmit={event => { event.preventDefault(); submit(); }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            className="space-y-5"
          >
            {step === 0 && (
              <ObjectTaskTypeStep
                value={form.task_type}
                options={typeOptions}
                loading={plansLoading}
                error={plansError}
                onChoose={chooseType}
              />
            )}
            {step === 1 && (
              <ObjectTaskPlanStep
                plans={categoryPlans}
                selectedId={form.security_plan_id}
                loading={plansLoading}
                error={plansError}
                onChoose={choosePlan}
              />
            )}
            {step === 2 && (
              <ObjectTaskTimingStep
                form={form}
                contextData={contextData}
                weekStart={weekStart}
                onWeekChange={onWeekChange}
                serverClock={serverClock}
                onChange={change}
              />
            )}
          </motion.div>
        </AnimatePresence>
        {error && (
          <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error.message}
          </p>
        )}
        <div className="mt-5 flex justify-between border-t border-border/70 pt-4">
          {step ? (
            <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
              <ArrowLeft /> Terug
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={onCancel}>Annuleren</Button>
          )}
          {step === 2 && (
            <Button type="submit" disabled={!valid || saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />}
              {saving ? "Opslaan..." : "Taak opslaan"}
            </Button>
          )}
        </div>
      </form>
    </WizardPanel>
  );
}
