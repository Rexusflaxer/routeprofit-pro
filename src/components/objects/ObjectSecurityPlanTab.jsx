import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import SecurityPlanCategoryTable from "./SecurityPlanCategoryTable";

const CATEGORIES = [
  { label: "Objectbeveiliging", description: "Beveiligingsinzet en werkzaamheden op het object." },
  { label: "Brand & Sluitronde", description: "Controle op brandveiligheid en het correct afsluiten van het object." },
  { label: "Externe sluitronde", description: "Afsluitende controleronde aan de buitenzijde van het object." },
  { label: "Externe controleronde", description: "Periodieke controle van terrein, gevels en buitenruimtes." },
  { label: "Openingsronde", description: "Werkzaamheden en controles voor het veilig openen van het object." },
  { label: "Mobiele Controleronde", description: "Controleronde uitgevoerd als onderdeel van mobiele surveillance." },
  { label: "Receptiedienst", description: "Receptie-, bezoekers- en toegangsgerelateerde beveiligingswerkzaamheden." },
];

export default function ObjectSecurityPlanTab({ object }) {
  const [selectedCategory, setSelectedCategory] = useState(null);

  if (selectedCategory) return <SecurityPlanCategoryTable object={object} title={selectedCategory} onBack={() => setSelectedCategory(null)} />;

  return (
    <div className="flex min-h-[620px] flex-col bg-card/35 backdrop-blur-xl">
      <div className="border-b border-border/70 bg-card/25 px-5 py-4 backdrop-blur-xl">
        <h2 className="text-sm font-semibold text-foreground">Beveiligingsplan</h2>
        <p className="mt-1 text-xs text-muted-foreground">De onderdelen van het beveiligingsplan voor dit object.</p>
      </div>
      {(
        <div className="p-5"><div className="grid grid-cols-1 gap-2">{CATEGORIES.map(category => category.label === "Brand & Sluitronde" ? (
          <button type="button" key={category.label} onClick={() => setSelectedCategory(category.label)} className="flex w-full items-center rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/50">
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{category.label}</span><span className="mt-1 block text-xs text-muted-foreground">{category.description}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ) : <article key={category.label} className="rounded-lg border border-border bg-card px-4 py-3"><p className="text-sm font-semibold text-foreground">{category.label}</p><p className="mt-1 text-xs text-muted-foreground">{category.description}</p></article>)}</div></div>
      )}
    </div>
  );
}