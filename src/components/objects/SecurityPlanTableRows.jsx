import React from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SecurityPlanTableRows({ plans, category, onEdit, disabled }) {
  if (!plans.length) return <tr><td colSpan={5} className="h-[360px] px-4 text-center text-muted-foreground">Nog geen plannen toegevoegd.</td></tr>;
  return plans.map(plan => <tr key={plan.id} className="border-b border-border/70"><td className="px-4 py-3"><p className="font-medium text-foreground">{plan.title}</p>{plan.description && <p className="mt-1 max-w-md truncate text-muted-foreground">{plan.description}</p>}</td><td className="px-4 py-3 text-muted-foreground">{category.supportsScope ? (plan.scope_type === "full" ? "Volledig" : "Gedeeltelijk") : "—"}</td><td className="px-4 py-3 text-muted-foreground">{category.durationRequired ? `${plan.duration_minutes || 0} min.` : "—"}</td><td className="px-4 py-3 text-muted-foreground">{plan.instructions?.length || 0}</td><td className="px-4 py-3 text-right"><Button type="button" variant="ghost" size="sm" onClick={() => onEdit(plan)} disabled={disabled}><Pencil className="h-3.5 w-3.5" /> Bewerken</Button></td></tr>);
}