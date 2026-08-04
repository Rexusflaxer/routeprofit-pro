import React, { useState } from "react";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import SecurityPlanTableRows from "./SecurityPlanTableRows";
import SecurityPlanWizard from "./SecurityPlanWizard";
import useSecurityPlans from "./useSecurityPlans";

export default function SecurityPlanCategoryTable({ object, title, onBack }) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const { plans, query, create } = useSecurityPlans(object);
  const save = form => create.mutate(form, { onSuccess: () => setWizardOpen(false) });
  return <div className="flex min-h-[620px] flex-col bg-card/35 backdrop-blur-xl">
    {wizardOpen && <SecurityPlanWizard onCancel={() => setWizardOpen(false)} onSave={save} saving={create.isPending} error={create.error} />}
    <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-card/25 px-4 py-3 backdrop-blur-xl"><div className="flex items-center gap-3"><button type="button" onClick={onBack} aria-label="Terug naar categorieën" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><ArrowLeft className="h-4 w-4" /></button><div><h2 className="text-sm font-semibold text-foreground">{title}</h2><p className="mt-0.5 text-xs text-muted-foreground">{plans.length} plan{plans.length === 1 ? "" : "nen"}</p></div></div>{!wizardOpen && <Button size="sm" onClick={() => setWizardOpen(true)}><Plus className="h-4 w-4" /> Plan toevoegen</Button>}</div>
    <div className="min-h-0 flex-1 overflow-x-auto">{query.isLoading ? <div className="flex min-h-[360px] items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Plannen laden...</div> : query.isError ? <div className="p-5 text-xs text-destructive">De plannen konden niet worden geladen.</div> : <table className="w-full text-left text-xs"><thead className="border-b border-border bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Naam</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Omschrijving</th><th className="px-4 py-3 font-medium">Minuten</th></tr></thead><tbody><SecurityPlanTableRows plans={plans} /></tbody></table>}</div>
  </div>;
}