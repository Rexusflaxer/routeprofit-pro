import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SECURITY_PLAN_TASK_TYPES, securityPlanStatus } from "./securityPlanConfig";

export default function SecurityPlanCategoryTable({ plans = [], expanded = [], onToggle, onOpen }) {
  const groups = SECURITY_PLAN_TASK_TYPES.map(category => ({ category, plans: plans.filter(plan => plan.task_type === category.key && plan.status !== "archived") })).filter(group => group.plans.length);
  return <Table>
    <TableHeader><TableRow className="bg-muted/25 hover:bg-muted/25"><TableHead className="pl-4 text-xs">Categorie / plan</TableHead><TableHead className="text-xs">Aantal</TableHead><TableHead className="pr-4 text-xs">Status</TableHead></TableRow></TableHeader>
    <TableBody>{groups.length ? groups.map(({ category, plans: categoryPlans }) => {
      const open = expanded.includes(category.key);
      return <React.Fragment key={category.key}>
        <TableRow className="cursor-pointer bg-card/30 hover:bg-muted/30" onClick={() => onToggle(category.key)}><TableCell className="pl-4"><span className="flex items-center gap-2 font-semibold">{open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}{category.label}</span></TableCell><TableCell className="text-muted-foreground">{categoryPlans.length}</TableCell><TableCell className="pr-4 text-muted-foreground">—</TableCell></TableRow>
        {open && categoryPlans.map(plan => { const status = securityPlanStatus(plan.status); return <TableRow key={plan.id} className="cursor-pointer hover:bg-muted/25" onClick={() => onOpen(plan.id)}><TableCell className="pl-10 font-medium">{plan.variant_name}</TableCell><TableCell className="text-muted-foreground">Plan</TableCell><TableCell className="pr-4"><Badge variant="outline" className={status.className}>{status.label}</Badge></TableCell></TableRow>; })}
      </React.Fragment>;
    }) : <TableRow><TableCell colSpan={3} className="h-52 text-center"><p className="text-sm font-medium">Nog geen beveiligingsplannen</p><p className="mt-1 text-xs text-muted-foreground">Voeg het eerste plan toe met de knop rechtsboven.</p></TableCell></TableRow>}</TableBody>
  </Table>;
}