import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

const TASK_TYPES = [
  "Mobiele Controleronde",
  "Externe Controleronde",
  "Externe Sluitronde",
  "Brand- en Sluitronde",
  "Openingsronde",
  "Sluitbegeleiding",
  "Grote collectief",
];

export default function TaskSpacingRulesEditor({
  rules = [],
  onChange,
  title = "Plannerregels voor dit object",
  description = "Welke taken mogen niet te snel na elkaar gebeuren?",
}) {
  const safeRules = Array.isArray(rules) ? rules : [];

  const updateRule = (index, field, value) => {
    onChange(safeRules.map((rule, i) => i === index ? { ...rule, [field]: value } : rule));
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500 mt-1">{description}</p>
      </div>

      {safeRules.map((rule, index) => (
        <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end rounded-lg border border-slate-200 bg-white p-3">
          <div className="md:col-span-4 space-y-1">
            <Label className="text-xs text-slate-500">Tussen</Label>
            <Select value={rule.task_type_a || ""} onValueChange={(value) => updateRule(index, "task_type_a", value)}>
              <SelectTrigger><SelectValue placeholder="Kies soort taak" /></SelectTrigger>
              <SelectContent>{TASK_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="md:col-span-4 space-y-1">
            <Label className="text-xs text-slate-500">En</Label>
            <Select value={rule.task_type_b || ""} onValueChange={(value) => updateRule(index, "task_type_b", value)}>
              <SelectTrigger><SelectValue placeholder="Kies soort taak" /></SelectTrigger>
              <SelectContent>{TASK_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="md:col-span-3 space-y-1">
            <Label className="text-xs text-slate-500">Minimaal minuten</Label>
            <Input type="number" min="1" value={rule.min_minutes || 60} onChange={(e) => updateRule(index, "min_minutes", Math.max(1, Number(e.target.value || 1)))} />
          </div>
          <Button type="button" variant="ghost" size="icon" className="md:col-span-1 text-red-600" onClick={() => onChange(safeRules.filter((_, i) => i !== index))}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...safeRules, { task_type_a: TASK_TYPES[0], task_type_b: TASK_TYPES[2], min_minutes: 60 }])}>
        <Plus className="w-4 h-4 mr-1" /> Regel toevoegen
      </Button>
    </div>
  );
}