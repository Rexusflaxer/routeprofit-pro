import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers } from "lucide-react";
import { toMonthlyAmount } from "../costs/CostHelpers";

function flattenCostItems(settings) {
  if (!settings) return [];
  const items = [];

  (settings.housing_costs || []).forEach(h => {
    const total = (h.rent_per_month || 0) + (h.utilities_per_month || 0) + (h.cleaning_per_month || 0) + (h.other_per_month || 0);
    if (total > 0) items.push({ id: `housing-${h.office_id}`, label: h.office_name || "Kantoor", monthlyAmount: total, category: "Huisvesting" });
  });

  (settings.software_costs || []).forEach(s => {
    const monthly = toMonthlyAmount(s.amount || 0, s.period || "per_month");
    if (monthly > 0) items.push({ id: `software-${s.id}`, label: s.name || "Software", monthlyAmount: monthly, category: "Software" });
  });

  (settings.personnel_cost_sections || []).forEach(sec => {
    (sec.items || []).forEach(it => {
      if ((it.cost_per_person || 0) > 0) {
        const monthly = toMonthlyAmount(it.cost_per_person || 0, it.period || "per_year");
        items.push({ id: `personnel-${it.id}`, label: it.name || "Personeelspost", monthlyAmount: monthly, category: sec.section_name || "Personeelsgebonden" });
      }
    });
  });

  (settings.custom_cost_sections || []).forEach(sec => {
    (sec.items || []).forEach(it => {
      const monthly = toMonthlyAmount(it.amount || 0, it.period || "per_month");
      if (monthly > 0) items.push({ id: `custom-${it.id}`, label: it.name || "Kostenpost", monthlyAmount: monthly, category: sec.section_name || "Overig" });
    });
  });

  return items;
}

export default function RouteOverheadSummary({ route, allRoutes = [], costSettings }) {
  const selectedIds = route?.overhead_cost_ids || [];
  const allItems = useMemo(() => flattenCostItems(costSettings), [costSettings]);
  const selectedItems = allItems.filter(i => selectedIds.includes(i.id));

  if (selectedItems.length === 0) return null;

  const rows = selectedItems.map(item => {
    const sharedWithCount = allRoutes.filter(r => (r.overhead_cost_ids || []).includes(item.id)).length || 1;
    const amountForThisRoute = item.monthlyAmount / sharedWithCount;
    return { ...item, sharedWithCount, amountForThisRoute };
  });

  const totalMonthly = rows.reduce((s, r) => s + r.amountForThisRoute, 0);

  return (
    <Card className="border-0 shadow-sm border-l-4 border-l-amber-400">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="w-4 h-4 text-amber-500" />
          Overhead kostenposten
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {rows.map(row => (
          <div key={row.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
            <div>
              <p className="text-sm text-slate-800">{row.label}</p>
              <p className="text-xs text-slate-400">{row.category}{row.sharedWithCount > 1 ? ` · gedeeld over ${row.sharedWithCount} routes` : ""}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-700">€{row.amountForThisRoute.toFixed(2)}/mnd</p>
              {row.sharedWithCount > 1 && (
                <p className="text-xs text-slate-400">van €{row.monthlyAmount.toFixed(2)} totaal</p>
              )}
            </div>
          </div>
        ))}
        <div className="flex justify-between pt-2 border-t border-slate-200">
          <p className="text-sm font-semibold text-slate-700">Totaal overhead deze route</p>
          <p className="text-sm font-bold text-slate-900">€{totalMonthly.toFixed(2)}/mnd</p>
        </div>
      </CardContent>
    </Card>
  );
}