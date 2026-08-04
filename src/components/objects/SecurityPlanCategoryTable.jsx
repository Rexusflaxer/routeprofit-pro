import React from "react";
import { ArrowLeft } from "lucide-react";

export default function SecurityPlanCategoryTable({ title, onBack }) {
  return (
    <div className="p-5">
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Terug naar categorieën
      </button>
      <h3 className="mb-4 text-sm font-semibold text-foreground">{title}</h3>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-muted/50 text-muted-foreground">
            <tr><th className="px-4 py-3 font-medium">Onderdeel</th><th className="px-4 py-3 font-medium">Omschrijving</th><th className="px-4 py-3 font-medium">Status</th></tr>
          </thead>
          <tbody><tr><td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">Nog geen onderdelen toegevoegd.</td></tr></tbody>
        </table>
      </div>
    </div>
  );
}