import React, { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toMonthlyAmount } from "../costs/CostHelpers";
import { Building2, Monitor, Users, Layers } from "lucide-react";

// Genereer een platte lijst van alle kostenposten uit CostSettings
function flattenCostItems(settings) {
  if (!settings) return [];
  const items = [];

  // Huisvestingskosten
  (settings.housing_costs || []).forEach(h => {
    const total = (h.rent_per_month || 0) + (h.utilities_per_month || 0) + (h.cleaning_per_month || 0) + (h.other_per_month || 0);
    if (total > 0) {
      items.push({
        id: `housing-${h.office_id}`,
        label: h.office_name || "Kantoor",
        monthlyAmount: total,
        category: "Huisvesting",
        icon: Building2,
        iconColor: "text-slate-500",
      });
    }
  });

  // Softwarekosten
  (settings.software_costs || []).forEach(s => {
    const monthly = toMonthlyAmount(s.amount || 0, s.period || "per_month");
    if (monthly > 0) {
      items.push({
        id: `software-${s.id}`,
        label: s.name || "Software",
        monthlyAmount: monthly,
        category: "Software",
        icon: Monitor,
        iconColor: "text-blue-500",
      });
    }
  });

  // Personeelsgebonden kostensecties
  (settings.personnel_cost_sections || []).forEach(sec => {
    (sec.items || []).forEach(it => {
      // Alleen meenemen als er een bedrag is
      if ((it.cost_per_person || 0) > 0) {
        const monthly = toMonthlyAmount(it.cost_per_person || 0, it.period || "per_year");
        items.push({
          id: `personnel-${it.id}`,
          label: it.name || "Personeelspost",
          sublabel: sec.section_name,
          monthlyAmount: monthly,
          costPerPerson: it.cost_per_person,
          period: it.period,
          category: "Personeelsgebonden",
          icon: Users,
          iconColor: "text-blue-500",
        });
      }
    });
  });

  // Vrije secties
  (settings.custom_cost_sections || []).forEach(sec => {
    (sec.items || []).forEach(it => {
      const monthly = toMonthlyAmount(it.amount || 0, it.period || "per_month");
      if (monthly > 0) {
        items.push({
          id: `custom-${it.id}`,
          label: it.name || "Kostenpost",
          sublabel: sec.section_name,
          monthlyAmount: monthly,
          category: sec.section_name || "Overig",
          icon: Layers,
          iconColor: "text-amber-500",
        });
      }
    });
  });

  return items;
}

export default function RouteOverheadSelector({ form, onChange, allRoutes = [] }) {
  const { data: costSettingsList = [] } = useQuery({
    queryKey: ["costSettings"],
    queryFn: () => base44.entities.CostSettings.list(),
  });
  const { data: allPersonnel = [] } = useQuery({
    queryKey: ["personnel"],
    queryFn: () => base44.entities.Personnel.list(),
  });

  const costSettings = costSettingsList[0];
  const costItems = useMemo(() => flattenCostItems(costSettings), [costSettings]);

  const binnendienst = allPersonnel.filter(p => p.function_type === "binnendienst" && p.is_active !== false);

  const selectedOverhead = form.overhead_cost_ids || [];
  const selectedBinnendienst = form.binnendienst_personnel_ids || [];

  const toggleOverhead = (id) => {
    const updated = selectedOverhead.includes(id)
      ? selectedOverhead.filter(x => x !== id)
      : [...selectedOverhead, id];
    onChange({ ...form, overhead_cost_ids: updated });
  };

  const toggleBinnendienst = (id) => {
    const updated = selectedBinnendienst.includes(id)
      ? selectedBinnendienst.filter(x => x !== id)
      : [...selectedBinnendienst, id];
    onChange({ ...form, binnendienst_personnel_ids: updated });
  };

  // Bereken voor elke kostenpost hoeveel routes hem delen (incl. huidige route)
  const routeCountFor = (itemId) => {
    const others = allRoutes.filter(r => r.id !== form.id && (r.overhead_cost_ids || []).includes(itemId));
    return others.length + (selectedOverhead.includes(itemId) ? 1 : 0);
  };

  // Groepeer kostenposten per categorie
  const categories = useMemo(() => {
    const map = {};
    costItems.forEach(item => {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    });
    return map;
  }, [costItems]);

  if (costItems.length === 0 && binnendienst.length === 0) return null;

  return (
    <div className="space-y-5">
      {/* Overhead kostenposten */}
      {costItems.length > 0 && (
        <div className="space-y-3">
          <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Overhead kostenposten toewijzen
          </Label>
          <p className="text-xs text-slate-400 -mt-2">
            Aangevinkte kosten worden gedeeld over alle routes die deze post hebben geselecteerd.
          </p>
          <div className="space-y-3">
            {Object.entries(categories).map(([cat, items]) => (
              <div key={cat}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{cat}</p>
                <div className="space-y-1.5">
                  {items.map(item => {
                    const checked = selectedOverhead.includes(item.id);
                    const routeCount = routeCountFor(item.id);
                    const sharedAmount = routeCount > 0 ? item.monthlyAmount / routeCount : item.monthlyAmount;
                    return (
                      <label
                        key={item.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? "bg-slate-800 border-slate-800 text-white"
                            : "bg-white border-slate-200 hover:border-slate-400 text-slate-700"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleOverhead(item.id)}
                          className={checked ? "border-white" : ""}
                        />
                        <item.icon className={`w-3.5 h-3.5 flex-shrink-0 ${checked ? "text-white/70" : item.iconColor}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium truncate ${checked ? "text-white" : "text-slate-800"}`}>{item.label}</p>
                          {item.sublabel && (
                            <p className={`text-[10px] ${checked ? "text-white/60" : "text-slate-400"}`}>{item.sublabel}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-xs font-semibold ${checked ? "text-white" : "text-slate-700"}`}>
                            €{sharedAmount.toFixed(2)}/mnd
                          </p>
                          {routeCount > 1 && (
                            <p className={`text-[10px] ${checked ? "text-white/60" : "text-slate-400"}`}>
                              gedeeld ÷ {routeCount} routes
                            </p>
                          )}
                          {routeCount <= 1 && (
                            <p className={`text-[10px] ${checked ? "text-white/60" : "text-slate-400"}`}>
                              €{item.monthlyAmount.toFixed(2)}/mnd totaal
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Binnendienst medewerkers */}
      {binnendienst.length > 0 && (
        <div className="space-y-3">
          <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Binnendienst medewerkers
          </Label>
          <p className="text-xs text-slate-400 -mt-2">
            Selecteer welke binnendienst medewerkers aan deze route zijn verbonden.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {binnendienst.map(p => {
              const checked = selectedBinnendienst.includes(p.id);
              return (
                <label
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                    checked
                      ? "bg-purple-700 border-purple-700 text-white"
                      : "bg-white border-slate-200 hover:border-purple-400 text-slate-700"
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleBinnendienst(p.id)}
                    className={checked ? "border-white" : ""}
                  />
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    checked ? "bg-white/20 text-white" : "bg-purple-100 text-purple-700"
                  }`}>
                    {p.name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium truncate ${checked ? "text-white" : "text-slate-800"}`}>{p.name}</p>
                    <p className={`text-[10px] ${checked ? "text-white/60" : "text-slate-400"}`}>
                      {p.employee_type === "zzp" ? "ZZP" : "Loondienst"}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}