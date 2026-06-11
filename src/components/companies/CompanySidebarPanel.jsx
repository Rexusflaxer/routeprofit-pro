import React, { useState } from "react";
import { Award, BookOpen, CreditCard, Handshake, MapPin, Shield, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import WpbrTab from "./WpbrTab";
import CaoTab from "./CaoTab";
import LocationsTab from "./LocationsTab";
import CompanyBankTab from "./CompanyBankTab";
import TeamhubTab from "./TeamhubTab";
import AccreditationsTab from "./AccreditationsTab";
import BranchMembershipsTab from "./BranchMembershipsTab";

const MENU_ITEMS = [
  { key: "wpbr", label: "WPBR-vergunning", icon: Shield },
  { key: "cao", label: "CAO", icon: BookOpen },
  { key: "branch_memberships", label: "Branchevereniging", icon: Handshake },
  { key: "accreditations", label: "Erkenningen", icon: Award },
  { key: "locations", label: "Vestigingen", icon: MapPin },
  { key: "teamhub", label: "LOQ Teamhub", icon: Handshake },
  { key: "bank", label: "Bank", icon: CreditCard },
];

export default function CompanySidebarPanel({ companyId, companies, company }) {
  const [active, setActive] = useState("wpbr");

  const { data: accreditations = [] } = useQuery({
    queryKey: ["company-accreditations", companyId],
    queryFn: () => base44.entities.CompanyAccreditation.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const today = new Date().toISOString().split("T")[0];
  const hasAccreditationAction = accreditations.some(a =>
    a.status !== "superseded" && (
      a.status === "expired" ||
      a.status === "pending_review" ||
      (a.valid_until && a.valid_until < today)
    )
  );

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden flex min-h-[200px]">
      {/* Left sidebar menu */}
      <div className="w-48 shrink-0 border-r border-border bg-muted/30 py-3">
        {MENU_ITEMS.map(item => {
          const hasAlert = item.key === "accreditations" && hasAccreditationAction;
          return (
            <button
              key={item.key}
              onClick={() => setActive(item.key)}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors text-left
                ${active === item.key
                  ? "bg-background text-foreground border-r-2 border-primary"
                  : hasAlert
                    ? "border-r-2 border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-background/60"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                }`}
            >
              <item.icon className={`w-4 h-4 shrink-0 ${hasAlert && active !== item.key ? "text-amber-500" : ""}`} />
              <span className="flex-1">{item.label}</span>
            </button>
          );
        })}
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

        {active === "branch_memberships" && (
          <BranchMembershipsTab companyId={companyId} company={company} />
        )}

        {active === "accreditations" && (
          <AccreditationsTab companyId={companyId} company={company} />
        )}

        {active === "teamhub" && (
          <TeamhubTab companyId={companyId} company={company} />
        )}
      </div>
    </div>
  );
}