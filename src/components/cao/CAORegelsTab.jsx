import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Search } from "lucide-react";

const IMPACT_LABELS = {
  none: "Geen", wage: "Loon", surcharge: "Toeslag", overtime: "Overwerk",
  shift_change: "Roosterwijziging", allowance: "Vergoeding", leave: "Verlof",
  holiday: "Feestdag", sickness: "Ziekte", minus_hours: "Minuren",
  pension: "Pensioen", fund_premium: "Fondspremie", contract: "Contract",
  schedule_constraint: "Rooster", export_only: "Export", manual_review_required: "Review vereist"
};

const POLICY_CONFIG = {
  automatic: { label: "Automatisch", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  manual_review_required: { label: "Handmatige review", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  policy_only: { label: "Beleid", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  not_payroll: { label: "Geen payroll", color: "bg-muted text-muted-foreground" }
};

export default function CAORegelsTab() {
  const [search, setSearch] = useState("");
  const [filterImpact, setFilterImpact] = useState("all");
  const [filterPolicy, setFilterPolicy] = useState("all");

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["cao-rules"],
    queryFn: () => base44.entities.CAORule.list("-created_date", 200)
  });

  const filtered = rules.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      r.rule_key?.toLowerCase().includes(q) ||
      r.article_number?.toLowerCase().includes(q) ||
      r.article_title?.toLowerCase().includes(q) ||
      r.rule_text_summary?.toLowerCase().includes(q);
    const matchImpact = filterImpact === "all" || r.payroll_impact === filterImpact;
    const matchPolicy = filterPolicy === "all" || r.calculation_policy === filterPolicy;
    return matchSearch && matchImpact && matchPolicy;
  });

  if (isLoading) return <div className="text-sm text-muted-foreground py-6 text-center">Laden...</div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Zoek op artikel, regelsleutel, samenvatting..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterImpact} onValueChange={setFilterImpact}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Payroll impact" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle impacts</SelectItem>
            {Object.entries(IMPACT_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPolicy} onValueChange={setFilterPolicy}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Calculatiebeleid" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle beleidstypen</SelectItem>
            {Object.entries(POLICY_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} regels</p>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">Geen CAO-regels gevonden.</p>
          <p className="text-xs mt-1">Gebruik "Extraheer 2026 parameters" om regels te laden.</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(rule => {
          const policy = POLICY_CONFIG[rule.calculation_policy] || POLICY_CONFIG.not_payroll;
          return (
            <Card key={rule.id} className={`border ${rule.calculation_policy === 'manual_review_required' ? 'border-red-200 dark:border-red-900' : ''}`}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {rule.article_number && (
                        <span className="text-xs font-mono font-semibold text-foreground">
                          Art. {rule.article_number}
                        </span>
                      )}
                      {rule.article_title && (
                        <span className="text-sm font-medium text-foreground">{rule.article_title}</span>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {IMPACT_LABELS[rule.payroll_impact] || rule.payroll_impact}
                      </Badge>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${policy.color}`}>
                        {policy.label}
                      </span>
                      {rule.calculation_policy === 'manual_review_required' && (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{rule.rule_text_summary}</p>
                    {rule.source_quote_short && (
                      <p className="text-xs italic text-muted-foreground mt-1">"{rule.source_quote_short}"</p>
                    )}
                  </div>
                  <code className="text-xs text-muted-foreground font-mono shrink-0">
                    {rule.rule_key}
                  </code>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}