import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, ChevronDown, ChevronUp, Users, User } from "lucide-react";
import { PERIOD_OPTIONS, FUNCTION_GROUPS, toMonthlyAmount } from "./CostHelpers";

const ASSIGN_MODE_LABELS = { group: "Functiegroep", specific: "Specifieke medewerkers" };

export default function PersonnelCostItem({ item, onChange, onDelete, personnelCounts = {}, allPersonnel = [] }) {
  const [expanded, setExpanded] = useState(false);

  const period = item.period || "per_year";
  const costPerPerson = item.cost_per_person || 0;
  const assignMode = item.assign_mode || "group"; // "group" | "specific"
  const functionGroups = item.function_groups || ["all"];
  const specificIds = item.specific_person_ids || [];

  // Bereken aantal + namen betrokken medewerkers
  const getInvolved = () => {
    if (assignMode === "specific") {
      return allPersonnel.filter(p => specificIds.includes(p.id));
    }
    if (functionGroups.includes("all")) {
      return allPersonnel.filter(p => p.is_active !== false);
    }
    return allPersonnel.filter(p => p.is_active !== false && functionGroups.includes(p.function_type));
  };

  const involved = getInvolved();
  const numPersonnel = involved.length;
  const monthlyTotal = toMonthlyAmount(costPerPerson * numPersonnel, period);

  const toggleGroup = (group) => {
    if (group === "all") { onChange({ ...item, function_groups: ["all"] }); return; }
    let groups = functionGroups.filter(g => g !== "all");
    groups = groups.includes(group) ? groups.filter(g => g !== group) : [...groups, group];
    onChange({ ...item, function_groups: groups.length === 0 ? ["all"] : groups });
  };

  const togglePerson = (id) => {
    const ids = specificIds.includes(id) ? specificIds.filter(i => i !== id) : [...specificIds, id];
    onChange({ ...item, specific_person_ids: ids });
  };

  const selectAll = () => onChange({ ...item, specific_person_ids: allPersonnel.filter(p => p.is_active !== false).map(p => p.id) });
  const deselectAll = () => onChange({ ...item, specific_person_ids: [] });

  const divisionLabel = { per_month: "1", per_quarter: "3", per_year: "12", per_2_years: "24", per_3_years: "36", per_5_years: "60", one_time: "60" };

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
      {/* Hoofdrij */}
      <div className="p-3 grid grid-cols-12 gap-2 items-center">
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
        <div className="col-span-2 text-xs text-center text-slate-500">
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

      {/* Uitklap details */}
      {expanded && (
        <div className="border-t border-slate-200 p-3 bg-white space-y-4">

          {/* Toewijzingsmodus toggle */}
          <div>
            <Label className="text-xs text-slate-500 mb-2 block">Toewijzen aan</Label>
            <div className="flex gap-2">
              {["group", "specific"].map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChange({ ...item, assign_mode: mode })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    assignMode === mode
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-500 border-slate-300 hover:border-slate-600"
                  }`}
                >
                  {mode === "group" ? <Users className="w-3 h-3" /> : <User className="w-3 h-3" />}
                  {ASSIGN_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>

          {/* Functiegroep selectie */}
          {assignMode === "group" && (
            <div>
              <Label className="text-xs text-slate-500 mb-2 block">Functiegroepen</Label>
              <div className="flex flex-wrap gap-2">
                {FUNCTION_GROUPS.map(fg => (
                  <button key={fg.value} type="button" onClick={() => toggleGroup(fg.value)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      functionGroups.includes(fg.value)
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-white text-slate-500 border-slate-300 hover:border-slate-500"
                    }`}>
                    {fg.label}
                    {fg.value !== "all" && <span className="ml-1 opacity-60">({personnelCounts[fg.value] || 0})</span>}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {functionGroups.includes("all") ? "Geldt voor alle actieve medewerkers" : `Geldt voor: ${functionGroups.map(g => FUNCTION_GROUPS.find(f => f.value === g)?.label).join(", ")}`}
              </p>
            </div>
          )}

          {/* Specifieke medewerkers selectie */}
          {assignMode === "specific" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-slate-500">Selecteer medewerkers</Label>
                <div className="flex gap-2">
                  <button type="button" onClick={selectAll} className="text-[10px] text-blue-600 hover:underline">Alles selecteren</button>
                  <span className="text-[10px] text-slate-300">|</span>
                  <button type="button" onClick={deselectAll} className="text-[10px] text-slate-500 hover:underline">Wissen</button>
                </div>
              </div>
              {allPersonnel.filter(p => p.is_active !== false).length === 0 ? (
                <p className="text-xs text-slate-400 italic">Geen actieve medewerkers gevonden</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {allPersonnel.filter(p => p.is_active !== false).map(p => {
                    const selected = specificIds.includes(p.id);
                    return (
                      <button key={p.id} type="button" onClick={() => togglePerson(p.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors text-left ${
                          selected
                            ? "bg-slate-800 text-white border-slate-800"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                        }`}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${selected ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>
                          {p.name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{p.name}</p>
                          <p className={`text-[9px] ${selected ? "text-white/60" : "text-slate-400"}`}>{p.function_type}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {specificIds.length > 0 && (
                <p className="text-[10px] text-slate-500 mt-1">{specificIds.length} medewerker(s) geselecteerd</p>
              )}
            </div>
          )}

          {/* Notitie & leverancier */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Notitie / specificatie</Label>
              <Input value={item.notes || ""} onChange={e => onChange({ ...item, notes: e.target.value })}
                placeholder="bijv. Zomerset + winterset" className="text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Leverancier (optioneel)</Label>
              <Input value={item.supplier || ""} onChange={e => onChange({ ...item, supplier: e.target.value })}
                placeholder="bijv. Bedrijfskleding BV" className="text-sm mt-1" />
            </div>
          </div>

          {/* Berekening samenvatting */}
          {numPersonnel > 0 && costPerPerson > 0 && (
            <div className="text-xs bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-amber-800">
              <strong>Berekening:</strong> €{costPerPerson.toFixed(2)} × {numPersonnel} personen ÷ {divisionLabel[period] || "12"} mnd = <strong>€{monthlyTotal.toFixed(2)}/mnd</strong>
              {assignMode === "specific" && involved.length > 0 && (
                <div className="mt-1 text-amber-700">{involved.map(p => p.name).join(", ")}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}