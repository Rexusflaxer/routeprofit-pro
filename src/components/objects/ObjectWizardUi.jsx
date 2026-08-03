import React from "react";
import { Check } from "lucide-react";
import { Label } from "@/components/ui/label";

export function WizardSteps({ stepIndex, steps, label }) {
  return <ol className="mb-5 flex items-center gap-1" aria-label={label}>{steps.map((step, index) => <React.Fragment key={step.key}><li className={`flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${index === stepIndex ? "bg-primary text-primary-foreground" : index < stepIndex ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "text-muted-foreground"}`}><span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${index === stepIndex ? "bg-primary-foreground text-primary" : index < stepIndex ? "text-emerald-700" : "border border-muted-foreground/30"}`}>{index < stepIndex ? <Check className="h-3 w-3" /> : index + 1}</span><span className={index === stepIndex ? "block" : "hidden sm:block"}>{step.label}</span></li>{index < steps.length - 1 && <li className={`h-px min-w-3 flex-1 ${index < stepIndex ? "bg-emerald-200 dark:bg-emerald-900" : "bg-border"}`} />}</React.Fragment>)}</ol>;
}

export function StepHeading({ icon: Icon, title, description }) {
  return <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card"><Icon className="h-4 w-4 text-muted-foreground" /></span><div><h3 className="text-sm font-semibold text-foreground">{title}</h3><p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-muted-foreground">{description}</p></div></div>;
}

export function Field({ label, htmlFor, required = false, hint = null, children }) {
  return <div className="space-y-1.5"><Label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}{required ? " *" : ""}</Label>{children}{hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}</div>;
}

export function ChoiceCard({ selected, onClick, title, description = "" }) {
  return <button type="button" onClick={onClick} aria-pressed={selected} className={`flex min-h-[72px] w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${selected ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"}`}><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>{selected && <Check className="h-3 w-3 text-primary-foreground" />}</span><span className="min-w-0"><span className="block text-sm font-medium text-foreground">{title}</span>{description && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{description}</span>}</span></button>;
}