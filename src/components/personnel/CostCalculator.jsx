import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calculator, Plus, X } from "lucide-react";

export default function CostCalculator({ personnel }) {
  const [schedule, setSchedule] = useState([{ date: "", start_time: "08:00", end_time: "17:00" }]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const addShift = () => {
    setSchedule([...schedule, { date: "", start_time: "08:00", end_time: "17:00" }]);
  };

  const removeShift = (idx) => {
    setSchedule(schedule.filter((_, i) => i !== idx));
  };

  const updateShift = (idx, field, value) => {
    const updated = [...schedule];
    updated[idx][field] = value;
    setSchedule(updated);
  };

  const calculate = async () => {
    setLoading(true);
    try {
      const { data } = await base44.functions.invoke('calculatePersonnelCosts', {
        personnel_id: personnel.id,
        work_schedule: schedule
      });
      setResult(data);
    } catch (error) {
      console.error('Fout bij berekenen:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="w-4 h-4" />
          Kostencalculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {schedule.map((shift, idx) => (
            <div key={idx} className="flex gap-2 items-end">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-slate-600">Datum</Label>
                <Input type="date" value={shift.date} onChange={(e) => updateShift(idx, 'date', e.target.value)} />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-slate-600">Van</Label>
                <Input type="time" value={shift.start_time} onChange={(e) => updateShift(idx, 'start_time', e.target.value)} />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-slate-600">Tot</Label>
                <Input type="time" value={shift.end_time} onChange={(e) => updateShift(idx, 'end_time', e.target.value)} />
              </div>
              {schedule.length > 1 && (
                <Button type="button" variant="ghost" size="icon" onClick={() => removeShift(idx)} className="h-9 w-9">
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={addShift} size="sm">
            <Plus className="w-3.5 h-3.5 mr-1" /> Dienst toevoegen
          </Button>
          <Button type="button" onClick={calculate} disabled={loading} size="sm" className="bg-slate-900 hover:bg-slate-800">
            <Calculator className="w-3.5 h-3.5 mr-1" /> Bereken kosten
          </Button>
        </div>

        {result && (
          <div className="mt-6 p-4 bg-slate-50 rounded-lg space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-700">Totaal uren</span>
              <span className="text-sm font-bold text-slate-900">{result.total_hours.toFixed(2)}u</span>
            </div>
            
            {result.employee_type === 'loondienst' && (
              <>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">Brutoloon</span>
                  <span className="font-medium">€{result.breakdown.base_wage.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">Toeslagen</span>
                  <span className="font-medium">€{result.breakdown.surcharges.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">Vakantiegeld (8%)</span>
                  <span className="font-medium">€{result.breakdown.vacation_allowance.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">Eindejaarsuitkering</span>
                  <span className="font-medium">€{result.breakdown.year_end_bonus.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">Werkgeverslasten</span>
                  <span className="font-medium">€{result.breakdown.employer_costs.toFixed(2)}</span>
                </div>
              </>
            )}

            <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
              <span className="font-semibold text-slate-900">Totale kosten</span>
              <span className="text-lg font-bold text-slate-900">€{result.total_costs.toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between items-center bg-amber-100 -mx-4 -mb-4 px-4 py-3 rounded-b-lg">
              <span className="text-sm font-semibold text-amber-900">Kosten per uur</span>
              <span className="text-lg font-bold text-amber-900">€{result.avg_cost_per_hour.toFixed(2)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}