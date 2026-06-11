import React, { useState } from "react";
import { Shield, BookOpen, MapPin, CreditCard, Users } from "lucide-react";
import WpbrTab from "./WpbrTab";
import CaoTab from "./CaoTab";
import LocationsTab from "./LocationsTab";
import CompanyBankTab from "./CompanyBankTab";
import TeamhubTab from "./TeamhubTab";

const MENU_ITEMS = [
  { key: "wpbr", label: "WPBR-vergunning", icon: Shield },
  { key: "cao", label: "CAO", icon: BookOpen },
  { key: "teamhub", label: "LOQ Teamhub", icon: Users },
  { key: "locations", label: "Vestigingen", icon: MapPin },
  { key: "bank", label: "Bank", icon: CreditCard },
];

export default function CompanySidebarPanel({ companyId, companies, company }) {
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
          <LocationsTab companies={companies} companyId={companyId} company={company} />
        )}

        {active === "bank" && (
          <CompanyBankTab companies={company ? [company] : []} />
        )}

        {active === "cao" && (
          <CaoTab companyId={companyId} />
        )}

        {active === "teamhub" && (
          <TeamhubTab companyId={companyId} company={company} />
        )}
      </div>
    </div>
  );
}
