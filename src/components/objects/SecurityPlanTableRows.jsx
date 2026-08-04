import React from "react";

export default function SecurityPlanTableRows({ plans }) {
  if (!plans.length) return <tr><td colSpan={4} className="h-[360px] px-4 text-center text-muted-foreground">Nog geen plannen toegevoegd.</td></tr>;
  return plans.map(plan => <tr key={plan.id} className="border-b border-border/70"><td className="px-4 py-3 font-medium text-foreground">{plan.title}</td><td className="px-4 py-3 text-muted-foreground">{plan.plan_type === "full" ? "Volledig" : "Aangepast"}</td><td className="px-4 py-3 text-muted-foreground">{plan.description || "—"}</td><td className="px-4 py-3 text-muted-foreground">{plan.duration_minutes} min.</td></tr>);
}