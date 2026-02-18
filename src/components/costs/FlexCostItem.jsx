import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { PERIOD_OPTIONS, toMonthlyAmount } from "./CostHelpers";

/**
 * Generieke kostenregel met naam, bedrag, periode en notitie.
 * toMonthly() converteert automatisch naar maandbedrag.
 */
export default function FlexCostItem({ item, onChange, onDelete, placeholder = "Omschrijving" }) {
  const monthly = toMonthlyAmount(item.amount || 0, item.period || "per_month");
  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <div className="col-span-4">
        <Input
          value={item.name || ""}
          onChange={e => onChange({ ...item, name: e.target.value })}
          placeholder={placeholder}
          className="text-sm"
        />
      </div>
      <div className="col-span-2">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">€</span>
          <Input
            type="number" step="0.01" min="0"
            value={item.amount || ""}
            onChange={e => onChange({ ...item, amount: parseFloat(e.target.value) || 0 })}
            placeholder="0"
            className="pl-5 text-sm"
          />
        </div>
      </div>
      <div className="col-span-2">
        <Select value={item.period || "per_month"} onValueChange={v => onChange({ ...item, period: v })}>
          <SelectTrigger className="text-xs h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2 text-center">
        <span className="text-xs text-slate-500 font-medium">≈ €{monthly.toFixed(2)}/mnd</span>
      </div>
      <div className="col-span-1">
        <Input
          value={item.notes || ""}
          onChange={e => onChange({ ...item, notes: e.target.value })}
          placeholder="Notitie"
          className="text-xs text-slate-400"
        />
      </div>
      <div className="col-span-1 flex justify-end">
        <Button type="button" size="icon" variant="ghost" className="text-red-400 hover:text-red-600 h-8 w-8" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}