import React from "react";
import { ArrowLeft } from "lucide-react";

export default function SecurityPlanCategoryTable({ title, onBack }) {
  return (
    <div className="flex min-h-[620px] flex-col bg-card/35 backdrop-blur-xl">
      <div className="flex items-center gap-3 border-b border-border/70 bg-card/25 px-4 py-3 backdrop-blur-xl">
        <button type="button" onClick={onBack} aria-label="Terug naar categorieën" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><ArrowLeft className="h-4 w-4" /></button>
        <div><h2 className="text-sm font-semibold text-foreground">{title}</h2><p className="mt-0.5 text-xs text-muted-foreground">0 onderdelen in dit beveiligingsplan</p></div>
      </div>
      <div className="min-h-0 flex-1 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Onderdeel</th><th className="px-4 py-3 font-medium">Omschrijving</th><th className="px-4 py-3 font-medium">Status</th></tr></thead>
          <tbody><tr><td colSpan={3} className="h-[360px] px-4 text-center text-muted-foreground">Nog geen onderdelen toegevoegd.</td></tr></tbody>
        </table>
      </div>
    </div>
  );
}