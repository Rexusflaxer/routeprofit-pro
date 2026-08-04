import React, { useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";

const CATEGORIES = [
  { label: "Objectbeveiliging", description: "Beveiligingsinzet en werkzaamheden op het object." },
  { label: "Brand & Sluitronde", description: "Controle op brandveiligheid en het correct afsluiten van het object." },
  { label: "Externe sluitronde", description: "Afsluitende controleronde aan de buitenzijde van het object." },
  { label: "Externe controleronde", description: "Periodieke controle van terrein, gevels en buitenruimtes." },
  { label: "Openingsronde", description: "Werkzaamheden en controles voor het veilig openen van het object." },
  { label: "Mobiele Controleronde", description: "Controleronde uitgevoerd als onderdeel van mobiele surveillance." },
  { label: "Receptiedienst", description: "Receptie-, bezoekers- en toegangsgerelateerde beveiligingswerkzaamheden." },
];

export default function ObjectSecurityPlanTab() {
  const [view, setView] = useState("overview");
  const title = view === "overview" ? "Beveiligingsplan" : view === "fire-round" ? "Brand & Sluitronde" : "Volledige brand & sluitronde";
  const goBack = () => setView(view === "full-round" ? "fire-round" : "overview");

  return <div className="flex min-h-[620px] flex-col bg-card/35 backdrop-blur-xl"><div className="border-b border-border/70 bg-card/25 px-5 py-4 backdrop-blur-xl"><div className="flex items-center gap-2">{view !== "overview" && <button type="button" onClick={goBack} aria-label="Terug" className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><ArrowLeft className="h-4 w-4" /></button>}<div><h2 className="text-sm font-semibold text-foreground">{title}</h2>{view === "overview" && <p className="mt-1 text-xs text-muted-foreground">De onderdelen van het beveiligingsplan voor dit object.</p>}</div></div></div>{view === "overview" && <div className="grid grid-cols-1 gap-2 p-5">{CATEGORIES.map(category => category.label === "Brand & Sluitronde" ? <button key={category.label} type="button" onClick={() => setView("fire-round")} className="flex w-full items-center rounded-lg border border-border bg-card px-4 py-3 text-left hover:bg-accent/60"><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{category.label}</span><span className="mt-1 block text-xs text-muted-foreground">{category.description}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /></button> : <article key={category.label} className="rounded-lg border border-border bg-card px-4 py-3"><p className="text-sm font-semibold text-foreground">{category.label}</p><p className="mt-1 text-xs text-muted-foreground">{category.description}</p></article>)}</div>}{view === "fire-round" && <div className="p-5"><button type="button" onClick={() => setView("full-round")} className="flex w-full items-center rounded-lg border border-border bg-card px-4 py-3 text-left hover:bg-accent/60"><span className="flex-1 text-sm font-semibold text-foreground">Volledige brand & sluitronde</span><ChevronRight className="h-4 w-4 text-muted-foreground" /></button></div>}</div>;
}