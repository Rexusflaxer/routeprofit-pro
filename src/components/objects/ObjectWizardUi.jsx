import React from "react";
import { Check } from "lucide-react";
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
                "flex min-w-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors",
                active && "bg-primary text-primary-foreground shadow-[0_5px_14px_hsl(var(--primary)/0.2)]",
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

export function StepHeading({ icon: Icon, title, description }) {
  return <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card/55 shadow-sm backdrop-blur-xl"><Icon className="h-4 w-4 text-muted-foreground" /></span><div><h3 className="text-sm font-semibold text-foreground">{title}</h3><p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-muted-foreground">{description}</p></div></div>;
}

export function Field({ label, htmlFor, required = false, hint = null, children }) {
  return <div className="space-y-1.5"><Label htmlFor={htmlFor} className="text-xs font-semibold text-foreground">{label}{required && <span className="ml-1 text-destructive">*</span>}</Label>{children}{hint && <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}</div>;
}

export function ChoiceCard({ selected, onClick, title, description = "", icon: Icon = null, disabled = false, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      disabled={disabled}
      className={cn(
        "group flex min-h-[76px] w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left shadow-sm backdrop-blur-xl transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-primary/60 bg-primary/10 shadow-[0_8px_24px_hsl(var(--primary)/0.11)]"
          : "border-border/70 bg-card/45 hover:border-primary/40 hover:bg-card/70 hover:shadow-md",
        className,
      )}
    >
      <span className={cn(
        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-border/80 bg-background/45 text-muted-foreground group-hover:border-primary/40",
      )}>
        {selected ? <Check className="h-3.5 w-3.5" /> : Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        {description && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{description}</span>}
      </span>
    </button>
  );
}

export function WizardPanel({ children, title = undefined, labelledBy = undefined, className = "" }) {
  return (
    <section
      aria-label={title}
      aria-labelledby={labelledBy}
      className={cn("overflow-hidden border-b border-border/70 bg-card/35 p-4 backdrop-blur-xl sm:p-5", className)}
    >
      {children}
    </section>
  );
}
