import React from "react";
import { Check, ChevronRight } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function WizardSteps({ stepIndex, steps, label }) {
  return (
    <ol className="mb-5 flex items-center gap-1" aria-label={label}>
      {steps.map((step, index) => {
        const active = index === stepIndex;
        const complete = index < stepIndex;
        return (
          <React.Fragment key={step.key}>
            <li
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors",
                active && "bg-primary text-primary-foreground",
                complete && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                !active && !complete && "text-muted-foreground",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  active && "bg-primary-foreground text-primary",
                  complete && "text-emerald-700 dark:text-emerald-300",
                  !active && !complete && "border border-muted-foreground/30",
                )}
              >
                {complete ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span className={active ? "block" : "hidden sm:block"}>{step.label}</span>
            </li>
            {index < steps.length - 1 && (
              <li aria-hidden="true" className={cn("h-px min-w-3 flex-1", complete ? "bg-emerald-500/25" : "bg-border/70")} />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}

export function StepHeading({ title, description, icon: _Icon = null }) {
  return <div><h3 className="text-sm font-medium text-foreground">{title}</h3>{description && <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">{description}</p>}</div>;
}

export function Field({ label, htmlFor, required = false, hint = null, children }) {
  return <div className="space-y-1.5"><Label htmlFor={htmlFor} className="text-xs font-semibold text-foreground">{label}{required && <span className="ml-1 text-destructive">*</span>}</Label>{children}{hint && <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}</div>;
}

export function ChoiceCard({ selected, onClick, title, description = "", icon: _Icon = null, leading = null, disabled = false, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      disabled={disabled}
      className={cn(
        "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-primary bg-accent"
          : "border-border bg-card hover:border-primary hover:bg-accent",
        className,
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-3">
        {leading}
        <span className="min-w-0">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {description && <> <span className="ml-2 text-xs text-muted-foreground">{description}</span></>}
        </span>
      </span>
      {selected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </button>
  );
}

export function WizardPanel({ children, title = undefined, labelledBy = undefined, className = "" }) {
  return (
    <section
      aria-label={title}
      aria-labelledby={labelledBy}
      className={cn("overflow-hidden border-b border-primary/30 bg-muted/20 p-5", className)}
    >
      {children}
    </section>
  );
}
