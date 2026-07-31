import React from "react";
import { BadgeCheck, IdCard } from "lucide-react";

const PASS_LABELS = {
  green: "Groene pas",
  grey: "Grijze pas",
  temporary: "Tijdelijke pas",
  other: "Overige pas",
};

function formatDate(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("nl-NL");
}

export default function PersonnelCredentialsDetails({ qualifications = [], passes = [] }) {
  return (
    <div className="mt-2 grid gap-2 border-t border-border/70 pt-2 text-[10px]">
      <div>
        <p className="mb-1 flex items-center gap-1 font-semibold text-foreground"><BadgeCheck className="h-3 w-3 text-primary" /> Kwalificaties</p>
        {qualifications.length ? qualifications.map(item => (
          <p key={item.id} className="truncate text-muted-foreground">{item.name || item.qualification_type}</p>
        )) : <p className="text-muted-foreground">Geen kwalificaties vastgelegd</p>}
      </div>
      <div>
        <p className="mb-1 flex items-center gap-1 font-semibold text-foreground"><IdCard className="h-3 w-3 text-primary" /> Passen</p>
        {passes.length ? passes.map(item => (
          <p key={item.id} className="text-muted-foreground">
            {PASS_LABELS[item.pass_type] || "Beveiligingspas"}{item.pass_number ? ` · ${item.pass_number}` : ""}{item.valid_until ? ` · t/m ${formatDate(item.valid_until)}` : ""}
          </p>
        )) : <p className="text-muted-foreground">Geen passen vastgelegd</p>}
      </div>
    </div>
  );
}