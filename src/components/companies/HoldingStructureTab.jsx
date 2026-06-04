import React from "react";
import { Badge } from "@/components/ui/badge";
import { Building2, ChevronRight } from "lucide-react";

const ROLE_LABELS = {
  holding: "Holding",
  operating_company: "Werkmaatschappij",
  sole_proprietor: "Eenmanszaak",
  other: "Overig",
};

const STATUS_COLORS = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-slate-100 text-slate-600",
  archived: "bg-red-50 text-red-600",
};

export default function HoldingStructureTab({ companies }) {
  const holdings = companies.filter(c => c.company_role === "holding");
  const independents = companies.filter(c => c.company_role !== "holding" && !c.holding_company_id);
  const subsidiaries = companies.filter(c => c.holding_company_id);

  const CompanyRow = ({ company, indent = false }) => (
    <div className={`flex items-center gap-3 p-3 rounded-lg border border-slate-100 bg-white shadow-sm ${indent ? "ml-8" : ""}`}>
      {indent && <ChevronRight className="w-4 h-4 text-slate-300 -ml-5 shrink-0" />}
      <div className="p-1.5 rounded bg-slate-50">
        <Building2 className="w-4 h-4 text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-900">{company.display_name}</span>
          {company.trade_name && company.trade_name !== company.display_name && (
            <span className="text-xs text-slate-400">({company.trade_name})</span>
          )}
          <Badge variant="outline" className="text-xs">{ROLE_LABELS[company.company_role] || company.company_role}</Badge>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[company.status] || "bg-slate-100 text-slate-600"}`}>
            {company.status === "active" ? "Actief" : company.status === "inactive" ? "Inactief" : "Gearchiveerd"}
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          {company.kvk_number && `KvK: ${company.kvk_number}`}
          {company.city && ` · ${company.city}`}
        </p>
      </div>
    </div>
  );

  const HoldingGroup = ({ holding }) => {
    const children = subsidiaries.filter(c => c.holding_company_id === holding.id);
    return (
      <div className="space-y-2">
        <CompanyRow company={holding} />
        {children.map(child => <CompanyRow key={child.id} company={child} indent />)}
      </div>
    );
  };

  if (companies.length === 0) {
    return <p className="text-sm text-slate-400 py-8 text-center">Geen bedrijven aangemaakt.</p>;
  }

  return (
    <div className="space-y-6">
      {holdings.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Holdingstructuren</h3>
          <div className="space-y-4">
            {holdings.map(h => <HoldingGroup key={h.id} holding={h} />)}
          </div>
        </div>
      )}
      {independents.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Zelfstandige bedrijven</h3>
          <div className="space-y-2">
            {independents.map(c => <CompanyRow key={c.id} company={c} />)}
          </div>
        </div>
      )}
    </div>
  );
}