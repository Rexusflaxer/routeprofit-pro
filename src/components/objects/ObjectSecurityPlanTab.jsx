import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import SecurityPlanCategoryTable from "./SecurityPlanCategoryTable";
import { SECURITY_PLAN_CATEGORIES } from "./securityPlanConfig";

export default function ObjectSecurityPlanTab({ object }) {
  const [selectedCategory, setSelectedCategory] = useState(null);
  if (selectedCategory) return <SecurityPlanCategoryTable object={object} category={selectedCategory} onBack={() => setSelectedCategory(null)} />;
  return <div className="flex min-h-[620px] flex-col bg-card/35 backdrop-blur-xl"><div className="border-b border-border/70 bg-card/25 px-5 py-4 backdrop-blur-xl"><h2 className="text-sm font-semibold text-foreground">Beveiligingsplan</h2><p className="mt-1 text-xs text-muted-foreground">Maak per taakcategorie meerdere uitvoeringsplannen voor dit object.</p></div><div className="p-5"><div className="grid grid-cols-1 gap-2">{SECURITY_PLAN_CATEGORIES.map(category => <button type="button" key={category.key} onClick={() => setSelectedCategory(category)} className="flex w-full items-center rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/50"><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{category.label}</span><span className="mt-1 block text-xs text-muted-foreground">{category.description}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /></button>)}</div></div></div>;
}