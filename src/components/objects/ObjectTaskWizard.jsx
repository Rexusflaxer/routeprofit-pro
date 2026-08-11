import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WizardPanel, WizardSteps } from "./ObjectWizardUi";
import ObjectTaskTypeStep from "./ObjectTaskTypeStep";
import ObjectTaskPlanStep from "./ObjectTaskPlanStep";
import ObjectTaskTimingStep from "./ObjectTaskTimingStep";
import ObjectTaskRecurrenceStep from "./ObjectTaskRecurrenceStep";
import { taskDuration } from "./objectTaskConfig";
import { securityPlanExecutionModeForTaskType, securityPlanTaskTypeLabel } from "./securityPlanConfig";
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const STEPS = [{ key: "type", label: "Categorie" }, { key: "plan", label: "Plan" }, { key: "repeat", label: "Herhaling" }, { key: "time", label: "Rooster" }];
const legacyPeriods = task => task?.start_time && task?.end_time ? (task.weekdays || []).map(day => ({ days: [DAY_KEYS[day - 1]], start_time: task.start_time, end_time: task.end_time })) : [];
const minutes = value => value === "24:00" ? 1440 : Number(String(value || "00:00").slice(0, 2)) * 60 + Number(String(value || "00:00").slice(3, 5));
const legacyPeriodKey = (period, index) => `legacy:${period.days?.[0] || "day"}:${period.start_time}:${period.end_time}:${index}`;
const newPeriodKey = () => `period:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
const withInitialPeriodKeys = periods => periods.map((period, index) => ({ ...period, period_key: period.period_key || legacyPeriodKey(period, index) }));
const mergePeriodKeys = (previous, next) => {
  const unused = new Set(previous.map((_, index) => index));
  return next.map(period => {
    const day = period.days?.[0];
    const exactIndex = previous.findIndex((candidate, index) => unused.has(index)
      && candidate.days?.[0] === day
      && candidate.start_time === period.start_time
      && candidate.end_time === period.end_time);
    const overlapIndex = exactIndex >= 0 ? exactIndex : previous
      .map((candidate, index) => ({
        index,
        overlap: unused.has(index) && candidate.days?.[0] === day
          ? Math.max(0, Math.min(minutes(candidate.end_time), minutes(period.end_time)) - Math.max(minutes(candidate.start_time), minutes(period.start_time)))
          : 0,
      }))
      .sort((left, right) => right.overlap - left.overlap)[0];
    const matchedIndex = exactIndex >= 0 ? exactIndex : overlapIndex?.overlap > 0 ? overlapIndex.index : -1;
    if (matchedIndex >= 0) unused.delete(matchedIndex);
    return { ...period, period_key: matchedIndex >= 0 ? previous[matchedIndex].period_key : period.period_key || newPeriodKey() };
  });
};
const initial = task => ({ security_plan_id: task?.security_plan_id || "", task_type: task?.task_type || "", custom_task_type: task?.custom_task_type || "", execution_mode: task?.execution_mode || "", duration_minutes: task?.duration_minutes || 0, schedule_periods: withInitialPeriodKeys(task?.schedule_periods?.length ? task.schedule_periods : legacyPeriods(task)), recurrence_type: task?.recurrence_type || "weekly", valid_from: task?.valid_from || "", valid_until: task?.valid_until || "", specific_date: task?.specific_date || "", instructions: task?.instructions || "" });
export default function ObjectTaskWizard({ task, otherTasks = [], securityPlans = [], plansLoading, plansError, saving, error, onSave, onCancel }) {
  const [step, setStep] = useState(0), [form, setForm] = useState(() => initial(task));
  const change = (field, value) => setForm(current => ({ ...current, [field]: field === "schedule_periods" ? mergePeriodKeys(current.schedule_periods, value) : value }));
  const activePlans = securityPlans.filter(plan => plan.status !== "archived");
  const typeOptions = [...new Map(activePlans.map(plan => [plan.task_type, plan])).values()].map(plan => ({ value: plan.task_type, label: securityPlanTaskTypeLabel(plan.task_type), description: `${activePlans.filter(item => item.task_type === plan.task_type).length} ${activePlans.filter(item => item.task_type === plan.task_type).length === 1 ? "plan" : "plannen"} beschikbaar` }));
  const categoryPlans = activePlans.filter(plan => plan.task_type === form.task_type);
  const chooseType = option => { setForm(current => current.task_type === option.value ? current : { ...current, task_type: option.value, security_plan_id: "", custom_task_type: "", execution_mode: "", duration_minutes: 0, schedule_periods: [] }); setStep(1); };
  const choosePlan = plan => { const continuous = securityPlanExecutionModeForTaskType(plan.task_type) === "continuous_post"; const revision = plan.draft_revision || plan.current_revision || {}; setForm(current => ({ ...current, security_plan_id: plan.id, task_type: plan.task_type, custom_task_type: plan.task_type === "other" ? plan.custom_task_type || "Anders" : "", execution_mode: continuous ? "continuous" : "time_window", duration_minutes: continuous ? 0 : Number(revision.duration_minutes || 0), schedule_periods: current.security_plan_id && current.security_plan_id !== plan.id ? [] : current.schedule_periods })); setStep(2); };
  const valid = step === 0 ? Boolean(form.task_type) : step === 1 ? Boolean(form.security_plan_id) : step === 2 ? (form.recurrence_type === "one_time" ? Boolean(form.specific_date) : form.recurrence_type !== "date_range" || Boolean(form.valid_from && form.valid_until && form.valid_until >= form.valid_from)) : Boolean(form.schedule_periods.length && (form.execution_mode === "continuous" || Number(form.duration_minutes) > 0));
  const submit = () => { if (!valid) return; if (step < 3) return setStep(step + 1); const schedulePeriods = form.schedule_periods.map(period => ({ ...period, period_key: period.period_key || newPeriodKey() })), first = schedulePeriods[0], weekdays = [...new Set(schedulePeriods.flatMap(period => period.days).map(day => DAY_KEYS.indexOf(day) + 1))]; onSave({ ...form, schedule_periods: schedulePeriods, start_time: first.start_time, end_time: first.end_time, weekdays, duration_minutes: form.execution_mode === "continuous" ? taskDuration(first.start_time, first.end_time) : Number(form.duration_minutes), valid_from: form.recurrence_type === "date_range" ? form.valid_from : null, valid_until: form.recurrence_type === "date_range" ? form.valid_until : null, specific_date: form.recurrence_type === "one_time" ? form.specific_date : null }); };
  return <WizardPanel labelledBy="object-task-title"><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">{task ? "Taak wijzigen" : "Nieuwe taak"}</p><h2 id="object-task-title" className="sr-only">Objecttaak</h2><WizardSteps stepIndex={step} steps={STEPS} label="Voortgang taak" /><form onSubmit={event => { event.preventDefault(); submit(); }}><AnimatePresence mode="wait"><motion.div key={step} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-5">{step === 0 && <ObjectTaskTypeStep value={form.task_type} options={typeOptions} loading={plansLoading} error={plansError} onChoose={chooseType} />}{step === 1 && <ObjectTaskPlanStep plans={categoryPlans} selectedId={form.security_plan_id} loading={plansLoading} error={plansError} onChoose={choosePlan} />}{step === 2 && <ObjectTaskRecurrenceStep form={form} onChange={change} />}{step === 3 && <ObjectTaskTimingStep form={form} otherTasks={otherTasks} onChange={change} />}</motion.div></AnimatePresence>{error && <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error.message}</p>}<div className="mt-5 flex justify-between border-t border-border/70 pt-4">{step ? <Button type="button" variant="outline" onClick={() => setStep(step - 1)}><ArrowLeft /> Terug</Button> : <Button type="button" variant="outline" onClick={onCancel}>Annuleren</Button>}{step >= 2 && <Button type="submit" disabled={!valid || saving}>{saving ? <Loader2 className="animate-spin" /> : step === 3 ? <Check /> : null}{saving ? "Opslaan..." : step === 3 ? "Taak opslaan" : <>Volgende <ArrowRight /></>}</Button>}</div></form></WizardPanel>;
}
