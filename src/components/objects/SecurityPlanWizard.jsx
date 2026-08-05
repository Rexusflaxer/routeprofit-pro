import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Clock3, Layers3, Route, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { wizardStepMotion } from "@/components/ui-custom/wizardMotion";
import { ChoiceCard, Field, StepHeading, WizardPanel, WizardSteps } from "./ObjectWizardUi";
import {
  SECURITY_PLAN_DURATION_MODES,
  SECURITY_PLAN_SECTION_POLICIES,
  SECURITY_PLAN_TASK_TYPES,
  securityPlanExecutionModeForTaskType,
} from "./securityPlanConfig";

const STEPS = [
  { key: "type", label: "Taaktype" },
  { key: "variant", label: "Variant" },
  { key: "planning", label: "Uitvoering" },
];

function defaultsForType(taskType) {
  const executionMode = securityPlanExecutionModeForTaskType(taskType);
  const continuous = executionMode === "continuous_post";
  return {
    execution_mode: executionMode,
    duration_mode: continuous ? "schedule_defined" : "fixed",
    duration_minutes: continuous ? "" : "30",
    section_policy: "not_applicable",
  };
}

function TypeStep({ form, onChange, fixedTaskType = "" }) {
  const choose = taskType => onChange(current => ({
    ...current,
    task_type: taskType,
    custom_task_type: taskType === "other" ? current.custom_task_type : "",
    ...defaultsForType(taskType),
  }));
  if (fixedTaskType === "other") {
    return (
      <div className="space-y-4">
        <StepHeading title="Hoe heet dit eigen taaktype?" description="Gebruik een korte, herkenbare naam die ook in Taken en Planning duidelijk blijft." />
        <Field label="Eigen taaktype" htmlFor="security-plan-custom-type" required>
          <Input id="security-plan-custom-type" value={form.custom_task_type} onChange={event => onChange(current => ({ ...current, custom_task_type: event.target.value }))} placeholder="Bijvoorbeeld terreinbegeleiding" maxLength={120} autoFocus />
        </Field>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <StepHeading title="Wat voor taakvariant maakt u?" description="Kies de operationele taakfamilie. Binnen hetzelfde type kunt u later meerdere varianten beheren." />
      <div className="grid gap-2 md:grid-cols-2">
        {SECURITY_PLAN_TASK_TYPES.map(type => (
          <ChoiceCard key={type.key} selected={form.task_type === type.key} onClick={() => choose(type.key)} title={type.label} description={type.description} />
        ))}
      </div>
      {form.task_type === "other" && (
        <Field label="Eigen taaktype" htmlFor="security-plan-custom-type" required hint="Gebruik een korte, herkenbare naam die ook in Taken en Planning duidelijk blijft.">
          <Input id="security-plan-custom-type" value={form.custom_task_type} onChange={event => onChange(current => ({ ...current, custom_task_type: event.target.value }))} placeholder="Bijvoorbeeld terreinbegeleiding" maxLength={120} autoFocus />
        </Field>
      )}
    </div>
  );
}

function VariantStep({ form, onChange }) {
  return (
    <div className="space-y-5">
      <StepHeading title="Geef deze variant een duidelijke naam" description="Gebruik een naam die het verschil met andere varianten direct uitlegt, zoals Volledig, Werkdagen of Secties 1–4." />
      <Field label="Plannaam" htmlFor="security-plan-variant" required hint="Het taaktype hoeft niet opnieuw in de naam te staan.">
        <Input id="security-plan-variant" value={form.variant_name} onChange={event => onChange(current => ({ ...current, variant_name: event.target.value }))} placeholder="Bijvoorbeeld Volledige avondronde" maxLength={200} autoFocus />
      </Field>
    </div>
  );
}

function PlanningStep({ form, onChange }) {
  return (
    <div className="space-y-5">
      <StepHeading title="Leg de basis van de uitvoering vast" description="Na aanmaken opent de planwerkruimte voor instructies, secties en de looproute." />
      <div className="space-y-2">
        <p className="text-xs font-semibold text-foreground">Duur</p>
        <div className="grid gap-2 md:grid-cols-3">
          {SECURITY_PLAN_DURATION_MODES.map(mode => (
            <ChoiceCard key={mode.key} selected={form.duration_mode === mode.key} onClick={() => onChange(current => ({ ...current, duration_mode: mode.key, duration_minutes: mode.key === "fixed" ? current.duration_minutes || "30" : "" }))} title={mode.label} description={mode.description} />
          ))}
        </div>
      </div>
      {form.duration_mode === "fixed" && (
        <Field label="Geplande duur in minuten" htmlFor="security-plan-duration" required hint="Deze tijd wordt later gebruikt bij roosteren en het samenstellen van diensten.">
          <div className="relative max-w-xs">
            <Clock3 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="security-plan-duration" type="number" min="1" max="1440" step="1" value={form.duration_minutes} onChange={event => onChange(current => ({ ...current, duration_minutes: event.target.value }))} className="pl-9 pr-16" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">min.</span>
          </div>
        </Field>
      )}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-foreground">Objectsecties</p>
        <div className="grid gap-2 md:grid-cols-3">
          {SECURITY_PLAN_SECTION_POLICIES.map(policy => (
            <ChoiceCard key={policy.key} selected={form.section_policy === policy.key} onClick={() => onChange(current => ({ ...current, section_policy: policy.key }))} title={policy.label} description={policy.description} />
          ))}
        </div>
        {form.section_policy !== "not_applicable" && <p className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground"><Layers3 className="h-4 w-4 shrink-0 text-primary" /> De concrete secties selecteert u na aanmaken in Secties & route.</p>}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-border/70 bg-card/45 p-3"><ShieldCheck className="h-4 w-4 text-primary" /><p className="mt-2 text-xs font-medium">Concept</p><p className="mt-0.5 text-[11px] text-muted-foreground">U publiceert pas wanneer het plan gereed is.</p></div>
        <div className="rounded-lg border border-border/70 bg-card/45 p-3"><Layers3 className="h-4 w-4 text-primary" /><p className="mt-2 text-xs font-medium">Instructiestappen</p><p className="mt-0.5 text-[11px] text-muted-foreground">Werk de uitvoering uit in hoofdstukken.</p></div>
        <div className="rounded-lg border border-border/70 bg-card/45 p-3"><Route className="h-4 w-4 text-primary" /><p className="mt-2 text-xs font-medium">Route</p><p className="mt-0.5 text-[11px] text-muted-foreground">Teken deze optioneel op de plattegrond.</p></div>
      </div>
    </div>
  );
}

function initialSecurityPlanForm(initialTaskType) {
  return {
    task_type: initialTaskType || "",
    custom_task_type: "",
    variant_name: "",
    execution_mode: "",
    duration_mode: "",
    duration_minutes: "",
    section_policy: "not_applicable",
    default_section_ids: [],
    allowed_section_ids: [],
    instruction_blocks: [],
    floorplan_id: null,
    floorplan_revision: null,
    route_overlay: null,
    ...(initialTaskType ? defaultsForType(initialTaskType) : {}),
  };
}

export default function SecurityPlanWizard({ initialTaskType = "", categoryLabel = "", onCancel, onSave, saving, error }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => initialSecurityPlanForm(initialTaskType));
  const steps = useMemo(() => initialTaskType && initialTaskType !== "other"
    ? STEPS.filter(item => item.key !== "type")
    : STEPS, [initialTaskType]);
  const current = steps[step].key;
  const valid = useMemo(() => {
    if (current === "type") return Boolean(form.task_type && (form.task_type !== "other" || form.custom_task_type.trim()));
    if (current === "variant") return Boolean(form.variant_name.trim());
    return Boolean(form.duration_mode && form.section_policy && (form.duration_mode !== "fixed" || Number(form.duration_minutes) > 0));
  }, [current, form]);
  const submit = () => onSave({
    ...form,
    custom_task_type: form.task_type === "other" ? form.custom_task_type.trim() : null,
    variant_name: form.variant_name.trim(),
    duration_minutes: form.duration_mode === "fixed" ? Number(form.duration_minutes) : null,
  });
  const content = current === "type"
    ? <TypeStep form={form} onChange={setForm} fixedTaskType={initialTaskType} />
    : current === "variant"
      ? <VariantStep form={form} onChange={setForm} />
      : <PlanningStep form={form} onChange={setForm} />;

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
          {step > 0 && <Button type="button" variant="outline" size="sm" onClick={() => setStep(value => value - 1)} disabled={saving}>Vorige</Button>}
          <Button type="button" size="sm" onClick={() => step === steps.length - 1 ? submit() : setStep(value => value + 1)} disabled={!valid || saving}>
            {step === steps.length - 1 ? (saving ? "Aanmaken..." : "Concept aanmaken") : "Volgende"}
          </Button>
        </div>
      </div>
    </WizardPanel>
  );
}