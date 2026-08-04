import React, { useState } from "react";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import SecurityPlanTableRows from "./SecurityPlanTableRows";
import SecurityPlanWizard from "./SecurityPlanWizard";
import useSecurityPlans from "./useSecurityPlans";

export default function SecurityPlanCategoryTable({ object, category, onBack }) {
  const [editing, setEditing] = useState(undefined);
  const { plans, query, create, update } = useSecurityPlans(object, category.key);
  const close = () => setEditing(undefined);
  const save = form => editing?.id ? update.mutate({ id: editing.id, form, version: editing.version }, { onSuccess: close }) : create.mutate(form, { onSuccess: close });
  const open = plan => setEditing(plan || null);
  const busy = create.isPending || update.isPending;
  return <div className="flex min-h-[620px] flex-col bg-card/35 backdrop-blur-xl">{editing !== undefined && <SecurityPlanWizard key={editing?.id || "new"} category={category} initialValue={editing} onCancel={close} onSave={save} saving={busy} error={create.error || update.error} />}<div className="flex items-center justify-between gap-3 border-b border-border/70 bg-card/25 px-4 py-3 backdrop-blur-xl"><div className="flex items-center gap-3"><button type="button" onClick={onBack} aria-label="Terug naar categorieën" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><ArrowLeft className="h-4 w-4" /></button><div><h2 className="text-sm font-semibold text-foreground">{category.label}</h2><p className="mt-0.5 text-xs text-muted-foreground">{plans.length} uitvoeringsplan{plans.length === 1 ? "" : "nen"}</p></div></div>{editing === undefined && <Button size="sm" onClick={() => open(null)} disabled={object.status === "archived"}><Plus className="h-4 w-4" /> Plan toevoegen</Button>}</div><div className="min-h-0 flex-1 overflow-x-auto">{query.isLoading ? <div className="flex min-h-[360px] items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Plannen laden...</div> : query.isError ? <div className="p-5 text-xs text-destructive">De plannen konden niet worden geladen.</div> : <table className="w-full text-left text-xs"><thead className="border-b border-border bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Plan</th><th className="px-4 py-3 font-medium">Omvang</th><th className="px-4 py-3 font-medium">Duur</th><th className="px-4 py-3 font-medium">Instructies</th><th className="px-4 py-3" /></tr></thead><tbody><SecurityPlanTableRows plans={plans} category={category} onEdit={open} disabled={busy || object.status === "archived"} /></tbody></table>}</div></div>;
}