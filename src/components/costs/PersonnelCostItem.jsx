import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { PERIOD_OPTIONS, FUNCTION_GROUPS, toMonthlyAmount } from "./CostHelpers";

/**
 * Personeelsgebonden kostenpost: kleding, PBM, opleiding etc.
 * Per medewerker, met functiegroep-filter en gebruiksduur.
 */
export default function PersonnelCostItem({ item, onChange, onDelete, personnelCounts = {} }) {
  const [expanded, setExpanded] = useState(false);

  const period = item.period || "per_year";
  const costPerPerson = item.cost_per_person || 0;
  const functionGroups = item.function_groups || ["all"];

  // Bereken aantal betrokken medewerkers
  const countPersonnel = () => {
    if (functionGroups.includes("all")) {
      return Object.values(personnelCounts).reduce((s, v) => s + v, 0);
    }
    return functionGroups.reduce((s, g) => s + (personnelCounts[g] || 0), 0);
  };

  const numPersonnel = countPersonnel();
  const totalAmount = costPerPerson * numPersonnel;
  const monthlyTotal = toMonthlyAmount(totalAmount, period);

  const toggleGroup = (group) => {
    if (group === "all") {
      onChange({ ...item, function_groups: ["all"] });
      return;
    }
    let groups = functionGroups.filter(g => g !== "all");
    if (groups.includes(group)) {
      groups = groups.filter(g => g !== group);
    } else {
      groups = [...groups, group];
    }
    onChange({ ...item, function_groups: groups.length === 0 ? ["all"] : groups });
  };

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-3 flex items-center gap-3">
        <div className="flex-1 grid grid-cols-12 gap-2 items-center">
          <div className="col-span-3">
            <Input
              value={item.name || ""}
              onChange={e => onChange({ ...item, name: e.target.value })}
              placeholder="bijv. Bedrijfskleding"
              className="text-sm font-medium"
            />
          </div>
          <div className="col-span-2">
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">€</span>
              <Input
                type="number" step="0.01" min="0"
                value={costPerPerson || ""}
                onChange={e => onChange({ ...item, cost_per_person: parseFloat(e.target.value) || 0 })}
                placeholder="0"
                className="pl-5 text-sm"
              />
            </div>
          </div>
          <div className="col-span-2">
            <Select value={period} onValueChange={v => onChange({ ...item, period: v })}>
              <SelectTrigger className="text-xs h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 text-xs text-slate-500 text-center">
            <span className="font-semibold text-slate-700">{numPersonnel}</span> personen
          </div>
          <div className="col-span-2 text-xs font-semibold text-slate-700 text-right">
            ≈ €{monthlyTotal.toFixed(2)}/mnd
          </div>
          <div className="col-span-1 flex justify-end gap-1">
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-slate-400" onClick={() => setExpanded(v => !v)}>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
            <Button type="button" size="icon" variant="ghost" className="text-red-400 hover:text-red-600 h-8 w-8" onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-200 p-3 bg-white space-y-3">
          <div>
            <Label className="text-xs text-slate-500 mb-2 block">Functiegroepen (wie draagt deze kosten?)</Label>
            <div className="flex flex-wrap gap-2">
              {FUNCTION_GROUPS.map(fg => {
                const active = functionGroups.includes(fg.value);
                return (
                  <button
                    key={fg.value}
                    type="button"
                    onClick={() => toggleGroup(fg.value)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-white text-slate-500 border-slate-300 hover:border-slate-500"
                    }`}
                  >
                    {fg.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              {functionGroups.includes("all") ? "Geldt voor alle medewerkers" : `Geldt voor: ${functionGroups.map(g => FUNCTION_GROUPS.find(f => f.value === g)?.label).join(", ")}`}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Notitie / specificatie</Label>
              <Input
                value={item.notes || ""}
                onChange={e => onChange({ ...item, notes: e.target.value })}
                placeholder="bijv. Zomerset + winterset"
                className="text-sm mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Leverancier (optioneel)</Label>
              <Input
                value={item.supplier || ""}
                onChange={e => onChange({ ...item, supplier: e.target.value })}
                placeholder="bijv. Bedrijfskleding BV"
                className="text-sm mt-1"
              />
            </div>
          </div>
          {numPersonnel > 0 && (
            <div className="text-xs bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-amber-800">
              <strong>Berekening:</strong> €{costPerPerson.toFixed(2)} × {numPersonnel} personen ÷ {
                period === "per_month" ? "1" : period === "per_quarter" ? "3" : period === "per_year" ? "12" : period === "per_2_years" ? "24" : period === "per_3_years" ? "36" : "60"
              } mnd = <strong>€{monthlyTotal.toFixed(2)}/mnd</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}