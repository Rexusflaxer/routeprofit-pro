import React, { useState } from "react";
import { Shield, BookOpen, MapPin, CreditCard } from "lucide-react";
import WpbrTab from "./WpbrTab";
import LocationsTab from "./LocationsTab";
import CompanyBankTab from "./CompanyBankTab";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Edit, X } from "lucide-react";

const MENU_ITEMS = [
  { key: "wpbr", label: "WPBR-vergunning", icon: Shield },
  { key: "cao", label: "CAO", icon: BookOpen },
  { key: "locations", label: "Vestigingen", icon: MapPin },
  { key: "bank", label: "Bank", icon: CreditCard },
];

export default function CompanySidebarPanel({
  companyId, editing, data, caoConfigurations, caoName,
  set, startEdit, cancelEdit, saveMutation, form, companies, company,
}) {
  const [active, setActive] = useState("wpbr");

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden flex min-h-[200px]">
      {/* Left sidebar menu */}
      <div className="w-48 shrink-0 border-r border-border bg-muted/30 py-3">
        {MENU_ITEMS.map(item => (
          <button
            key={item.key}
            onClick={() => setActive(item.key)}
            className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors text-left
              ${active === item.key
                ? "bg-background text-foreground border-r-2 border-primary"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
              }`}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {item.label}
          </button>
        ))}
      </div>

      {/* Right content */}
      <div className="flex-1 min-w-0">
        {active === "wpbr" && (
          <WpbrTab companyId={companyId} company={company} />
        )}

        {active === "locations" && (
          <LocationsTab companies={companies} />
        )}

        {active === "bank" && (
          <CompanyBankTab companies={company ? [company] : []} />
        )}

        {active === "cao" && (
          <div className="p-6 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Standaard CAO</h3>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {editing ? (
                <Select value={data.default_cao_configuration_id || "none"} onValueChange={v => set("default_cao_configuration_id", v === "none" ? null : v)}>
                  <SelectTrigger className="h-8 text-sm w-72"><SelectValue placeholder="Geen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Geen standaard —</SelectItem>
                    {caoConfigurations.map(c => (
                      <SelectItem key={c.id} value={c.id} disabled={c.selectable === false}>
                        {c.label || c.display_name || c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm font-medium text-foreground">
                  {caoName ? (caoName.label || caoName.display_name || caoName.name) : <span className="text-muted-foreground">—</span>}
                </span>
              )}
              {!editing && (
                <Button size="sm" variant="outline" onClick={startEdit}>
                  <Edit className="w-4 h-4 mr-1" /> Wijzigen
                </Button>
              )}
              {editing && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={cancelEdit}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
                  <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
                    <Check className="w-4 h-4 mr-1" /> Opslaan
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
