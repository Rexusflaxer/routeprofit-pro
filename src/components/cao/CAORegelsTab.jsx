import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Search, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 50;

const STATUS_CONFIG = {
  IMPLEMENTED: { label: "Implemented", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  PARTIAL: { label: "Partial", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  MISSING: { label: "Missing", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  REFERENCE: { label: "Reference", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" }
};

const AUTOMATION_LABELS = {
  automatic_or_calculation: "Automatisch",
  validation_or_policy: "Validatie",
  workflow_or_documentation: "Workflow",
  reference_or_policy: "Referentie/beleid",
  reference: "Referentie",
  // Legacy
  automatic: "Automatisch",
  manual_review_required: "Handmatige review",
  policy_only: "Beleid",
  not_payroll: "Geen payroll"
};

const RISK_COLORS = {
  low: "text-green-600",
  medium: "text-yellow-600",
  high: "text-red-600",
  critical: "text-red-800 font-bold"
};

const DOMAIN_LABELS = {
  payroll_wages_allowances: "Loon & Toeslagen",
  contract_employment: "Contract",
  leave_holidays: "Verlof",
  planning_working_time: "Planning",
  sickness_disability: "Ziekte",
  expenses_reimbursements: "Vergoedingen",
  pension_older_workers: "Pensioen",
  organization_social_policy_unions: "Organisatie",
  functions_diplomas_salary_scales: "Functies & Loonschalen",
  definitions: "Definities",
  scope_applicability: "Toepassingsgebied",
  protocols: "Protocollen",
  airport_schiphol: "Schiphol",
  cash_value_logistics: "Cash & Waarden",
  compliance_control_regulation: "Compliance",
  contract_change_mutation_list: "Contractwissel",
  payslip_template: "Loonstrook",
  travel_reimbursement_system: "Reiskosten",
  metadata: "Metadata",
  metadata_toc: "Inhoudsopgave",
  general_reference: "Algemeen"
};

export default function CAORegelsTab() {
  const [search, setSearch] = useState("");
  const [filterDomain, setFilterDomain] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterAutomation, setFilterAutomation] = useState("all");
  const [filterRisk, setFilterRisk] = useState("all");
  const [filterManualReview, setFilterManualReview] = useState("all");
  const [page, setPage] = useState(1);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["cao-rules-full"],
    queryFn: () => base44.entities.CAORule.list("-created_date", 2500)
  });

  const filtered = useMemo(() => {
    return rules.filter(r => {
      const q = search.toLowerCase();
      const matchSearch = !search ||
        r.rule_id?.toLowerCase().includes(q) ||
        r.rule_key?.toLowerCase().includes(q) ||
        r.article?.toLowerCase().includes(q) ||
        r.article_number?.toLowerCase().includes(q) ||
        r.rule_text_summary?.toLowerCase().includes(q) ||
        r.rule_text?.toLowerCase().includes(q) ||
        r.domain?.toLowerCase().includes(q);
      const matchDomain = filterDomain === "all" || r.domain === filterDomain;
      const matchStatus = filterStatus === "all" || r.implementation_status === filterStatus;
      const matchAutomation = filterAutomation === "all" ||
        r.automation_level === filterAutomation ||
        r.calculation_policy === filterAutomation;
      const matchRisk = filterRisk === "all" || r.risk_level === filterRisk;
      const matchManual = filterManualReview === "all" ||
        (filterManualReview === "yes" && r.manual_review_required) ||
        (filterManualReview === "no" && !r.manual_review_required);
      return matchSearch && matchDomain && matchStatus && matchAutomation && matchRisk && matchManual;
    });
  }, [rules, search, filterDomain, filterStatus, filterAutomation, filterRisk, filterManualReview]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset pagina bij filterwijziging
  const handleFilterChange = (setter) => (val) => {
    setter(val);
    setPage(1);
  };

  const uniqueDomains = useMemo(() => {
    const domains = [...new Set(rules.map(r => r.domain).filter(Boolean))];
    return domains.sort();
  }, [rules]);

  if (isLoading) return <div className="text-sm text-muted-foreground py-6 text-center">Laden...</div>;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Zoek op rule ID, artikel, tekst, domein..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={filterDomain} onValueChange={handleFilterChange(setFilterDomain)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Domein" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle domeinen</SelectItem>
            {uniqueDomains.map(d => (
              <SelectItem key={d} value={d}>{DOMAIN_LABELS[d] || d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={handleFilterChange(setFilterStatus)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAutomation} onValueChange={handleFilterChange(setFilterAutomation)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Automatisering" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle niveaus</SelectItem>
            {Object.entries(AUTOMATION_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterRisk} onValueChange={handleFilterChange(setFilterRisk)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Risico" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle risico's</SelectItem>
            <SelectItem value="low">Laag</SelectItem>
            <SelectItem value="medium">Midden</SelectItem>
            <SelectItem value="high">Hoog</SelectItem>
            <SelectItem value="critical">Kritiek</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterManualReview} onValueChange={handleFilterChange(setFilterManualReview)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Handmatige review" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="yes">Review vereist</SelectItem>
            <SelectItem value="no">Geen review</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Teller + paginering */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{filtered.length} regels gevonden (van {rules.length} totaal)</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span>Pagina {page} / {totalPages}</span>
            <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {paginated.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">Geen CAO-regels gevonden.</p>
          <p className="text-xs mt-1">Gebruik "Extraheer 2026 parameters" om regels te importeren, of pas de filters aan.</p>
        </div>
      )}

      <div className="space-y-1.5">
        {paginated.map(rule => {
          const status = STATUS_CONFIG[rule.implementation_status] || STATUS_CONFIG.MISSING;
          const autoLabel = AUTOMATION_LABELS[rule.automation_level] || AUTOMATION_LABELS[rule.calculation_policy] || "—";
          const riskColor = RISK_COLORS[rule.risk_level] || "text-muted-foreground";
          const hasManualReview = rule.manual_review_required;

          return (
            <Card key={rule.id} className={`border ${hasManualReview ? 'border-amber-200 dark:border-amber-900' : ''}`}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-xs font-mono font-semibold text-foreground">
                        {rule.rule_id || rule.rule_key}
                      </code>
                      {rule.article && (
                        <span className="text-xs text-muted-foreground">Art. {rule.article}</span>
                      )}
                      {rule.article_number && !rule.article && (
                        <span className="text-xs text-muted-foreground">Art. {rule.article_number}</span>
                      )}
                      {rule.pdf_page_start && (
                        <span className="text-xs text-muted-foreground">p.{rule.pdf_page_start}</span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${status.color}`}>
                        {status.label}
                      </span>
                      <span className="text-xs text-muted-foreground">{autoLabel}</span>
                      {rule.domain && (
                        <Badge variant="outline" className="text-xs py-0">
                          {DOMAIN_LABELS[rule.domain] || rule.domain}
                        </Badge>
                      )}
                      {hasManualReview && (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      )}
                      {rule.risk_level && rule.risk_level !== 'low' && (
                        <span className={`text-xs font-medium ${riskColor}`}>
                          {rule.risk_level.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {rule.rule_text_summary || rule.rule_text?.substring(0, 200)}
                    </p>
                    {rule.implemented_in && rule.implemented_in.length > 0 && (
                      <p className="text-xs text-green-600 mt-1">
                        ✓ {rule.implemented_in.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Paginering onderaan */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft className="w-4 h-4" />
            Vorige
          </Button>
          <span className="text-sm text-muted-foreground">Pagina {page} van {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Volgende
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}