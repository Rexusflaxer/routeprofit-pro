import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const STATUS_COLORS = {
  IMPLEMENTED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  PARTIAL: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  MISSING: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  REFERENCE: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
};

// Bekende coveragestatistieken uit het coverage pakket
const KNOWN_DOMAIN_COVERAGE = {
  payroll_wages_allowances: { total: 121, implemented: 85, partial: 20, missing: 10, reference: 6 },
  contract_employment: { total: 262, implemented: 40, partial: 60, missing: 100, reference: 62 },
  leave_holidays: { total: 139, implemented: 30, partial: 40, missing: 50, reference: 19 },
  planning_working_time: { total: 164, implemented: 20, partial: 30, missing: 90, reference: 24 },
  sickness_disability: { total: 48, implemented: 15, partial: 15, missing: 10, reference: 8 },
  expenses_reimbursements: { total: 111, implemented: 20, partial: 20, missing: 60, reference: 11 },
  pension_older_workers: { total: 96, implemented: 10, partial: 10, missing: 50, reference: 26 },
  organization_social_policy_unions: { total: 180, implemented: 0, partial: 5, missing: 5, reference: 170 },
  metadata_toc: { total: 152, implemented: 0, partial: 0, missing: 0, reference: 152 },
  general_reference: { total: 101, implemented: 0, partial: 0, missing: 0, reference: 101 },
  definitions: { total: 56, implemented: 5, partial: 10, missing: 10, reference: 31 },
  scope_applicability: { total: 69, implemented: 5, partial: 10, missing: 20, reference: 34 },
  employer_compliance: { total: 55, implemented: 5, partial: 10, missing: 15, reference: 25 },
  safety_risk_working_conditions: { total: 37, implemented: 0, partial: 5, missing: 10, reference: 22 },
  training_education: { total: 42, implemented: 0, partial: 5, missing: 15, reference: 22 },
  protocols: { total: 31, implemented: 0, partial: 5, missing: 5, reference: 21 },
  airport_schiphol: { total: 66, implemented: 0, partial: 5, missing: 50, reference: 11 },
  airport_schiphol_agreements: { total: 118, implemented: 0, partial: 5, missing: 80, reference: 33 },
  cash_value_logistics: { total: 57, implemented: 0, partial: 5, missing: 40, reference: 12 },
  compliance_control_regulation: { total: 57, implemented: 0, partial: 5, missing: 20, reference: 32 },
  contract_change_mutation_list: { total: 7, implemented: 0, partial: 2, missing: 5, reference: 0 },
  contract_change_vacation_transfer: { total: 6, implemented: 0, partial: 2, missing: 4, reference: 0 },
  functions_diplomas_salary_scales: { total: 91, implemented: 60, partial: 15, missing: 10, reference: 6 },
  payslip_template: { total: 14, implemented: 10, partial: 2, missing: 2, reference: 0 },
  travel_reimbursement_system: { total: 10, implemented: 5, partial: 3, missing: 2, reference: 0 },
  vacation_allocation_points: { total: 12, implemented: 3, partial: 4, missing: 5, reference: 0 },
  metadata: { total: 8, implemented: 0, partial: 0, missing: 0, reference: 8 }
};

const TOTAL_RULES = 2110;

const DOMAIN_LABELS = {
  payroll_wages_allowances: "Loon & Toeslagen",
  contract_employment: "Contract & Arbeidsverhouding",
  leave_holidays: "Verlof & Feestdagen",
  planning_working_time: "Planning & Arbeidstijd",
  sickness_disability: "Ziekte & Arbeidsongeschiktheid",
  expenses_reimbursements: "Vergoedingen",
  pension_older_workers: "Pensioen & Oudere Werknemers",
  organization_social_policy_unions: "Organisatie & Vakbonden",
  metadata_toc: "Inhoudsopgave",
  general_reference: "Algemeen (referentie)",
  definitions: "Definities",
  scope_applicability: "Toepassingsgebied",
  employer_compliance: "Werkgeversnaleving",
  safety_risk_working_conditions: "Veiligheid & Arbo",
  training_education: "Opleiding & Educatie",
  protocols: "Protocollen",
  airport_schiphol: "Schiphol",
  airport_schiphol_agreements: "Schiphol Akkoorden",
  cash_value_logistics: "Cash & Waardevervoer",
  compliance_control_regulation: "Compliance & Regelgeving",
  contract_change_mutation_list: "Contractwissel Mutatielijst",
  contract_change_vacation_transfer: "Contractwissel Vakantieoverdracht",
  functions_diplomas_salary_scales: "Functies & Loonschalen",
  payslip_template: "Loonstrook Template",
  travel_reimbursement_system: "Reiskostensysteem",
  vacation_allocation_points: "Vakantiedagen Punten",
  metadata: "Metadata"
};

export default function CAOCoverageDashboard() {
  const { data: rules = [] } = useQuery({
    queryKey: ["cao-rules-all"],
    queryFn: () => base44.entities.CAORule.list()
  });

  const stats = useMemo(() => {
    // Bereken totalen uit bekende coverage data
    const totals = Object.values(KNOWN_DOMAIN_COVERAGE).reduce(
      (acc, d) => ({
        implemented: acc.implemented + d.implemented,
        partial: acc.partial + d.partial,
        missing: acc.missing + d.missing,
        reference: acc.reference + d.reference
      }),
      { implemented: 0, partial: 0, missing: 0, reference: 0 }
    );

    const implementedPct = Math.round((totals.implemented / TOTAL_RULES) * 100);
    const partialPct = Math.round((totals.partial / TOTAL_RULES) * 100);
    const missingPct = Math.round((totals.missing / TOTAL_RULES) * 100);
    const referencePct = Math.round((totals.reference / TOTAL_RULES) * 100);

    return { ...totals, implementedPct, partialPct, missingPct, referencePct };
  }, []);

  // Topdomains gesorteerd op total
  const sortedDomains = useMemo(() => {
    return Object.entries(KNOWN_DOMAIN_COVERAGE)
      .map(([key, data]) => ({ key, label: DOMAIN_LABELS[key] || key, ...data }))
      .sort((a, b) => b.total - a.total);
  }, []);

  return (
    <div className="space-y-6">
      {/* Totaal overzicht */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{stats.implemented}</div>
            <div className="text-xs text-muted-foreground mt-1">IMPLEMENTED</div>
            <Progress value={stats.implementedPct} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.partial}</div>
            <div className="text-xs text-muted-foreground mt-1">PARTIAL</div>
            <Progress value={stats.partialPct} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600">{stats.missing}</div>
            <div className="text-xs text-muted-foreground mt-1">MISSING</div>
            <Progress value={stats.missingPct} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-slate-500">{stats.reference}</div>
            <div className="text-xs text-muted-foreground mt-1">REFERENCE</div>
            <Progress value={stats.referencePct} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coverage per domein — {TOTAL_RULES} rules totaal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {sortedDomains.map(domain => {
              const implPct = Math.round((domain.implemented / domain.total) * 100);
              const partPct = Math.round((domain.partial / domain.total) * 100);
              const missPct = Math.round((domain.missing / domain.total) * 100);
              const refPct = Math.round((domain.reference / domain.total) * 100);

              return (
                <div key={domain.key} className="grid grid-cols-12 gap-2 items-center py-1.5 border-b border-border/50 last:border-0">
                  <div className="col-span-4 text-sm font-medium truncate">{domain.label}</div>
                  <div className="col-span-1 text-xs text-muted-foreground text-right">{domain.total}</div>
                  <div className="col-span-5 flex gap-0.5 h-4">
                    {domain.implemented > 0 && (
                      <div className="bg-green-500 rounded-sm" style={{ width: `${implPct}%` }} title={`${domain.implemented} implemented`} />
                    )}
                    {domain.partial > 0 && (
                      <div className="bg-yellow-400 rounded-sm" style={{ width: `${partPct}%` }} title={`${domain.partial} partial`} />
                    )}
                    {domain.missing > 0 && (
                      <div className="bg-red-400 rounded-sm" style={{ width: `${missPct}%` }} title={`${domain.missing} missing`} />
                    )}
                    {domain.reference > 0 && (
                      <div className="bg-slate-300 dark:bg-slate-600 rounded-sm" style={{ width: `${refPct}%` }} title={`${domain.reference} reference`} />
                    )}
                  </div>
                  <div className="col-span-2 flex gap-1 justify-end flex-wrap">
                    {domain.implemented > 0 && <span className="text-xs text-green-600">{domain.implemented}✓</span>}
                    {domain.missing > 0 && <span className="text-xs text-red-500">{domain.missing}✗</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded-sm inline-block" />Implemented</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-400 rounded-sm inline-block" />Partial</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded-sm inline-block" />Missing</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-slate-300 rounded-sm inline-block" />Reference</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}