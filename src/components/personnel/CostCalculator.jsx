import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Calculator, Plus, X } from "lucide-react";

function getTodayDate() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().split("T")[0];
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function previewWarnings(result) {
  return [
    ...(Array.isArray(result?.calculation_warnings) ? result.calculation_warnings : []),
    ...(Array.isArray(result?.warnings) ? result.warnings : []),
    ...(Array.isArray(result?.scope_warnings) ? result.scope_warnings : []),
    ...(Array.isArray(result?.payroll_final_blocking_reasons) ? result.payroll_final_blocking_reasons : [])
  ].map(item => typeof item === "string" ? item : item?.message || item?.reason || "")
    .filter(Boolean);
}

export default function CostCalculator({ personnel }) {
  const [schedule, setSchedule] = useState([{ date: getTodayDate(), start_time: "08:00", end_time: "17:00" }]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const addShift = () => {
    setSchedule([...schedule, { date: getTodayDate(), start_time: "08:00", end_time: "17:00" }]);
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
    const hasIncompleteShift = schedule.some(shift => !shift.date || !shift.start_time || !shift.end_time);
    if (hasIncompleteShift) {
      setResult(null);
      setError("Vul bij elke dienst een datum, starttijd en eindtijd in.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data } = await base44.functions.invoke('calculatePersonnelCosts', {
        personnel_id: personnel.id,
        work_schedule: schedule,
        record_payroll_run: false,
        require_payroll_final: false,
        payroll_final: false,
        calculation_context: "concept_cost_preview"
      });
      if (data?.error || !Number.isFinite(data?.total_hours)) {
        throw new Error(data?.error || "Ongeldige berekening");
      }
      setResult(data);
    } catch (error) {
      setResult(null);
      setError("Kon de kosten niet berekenen. Controleer de ingevulde dienstgegevens.");
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
          Concept kostensimulatie
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Deze berekening is alleen een kostenpreview. Definitieve loonbetaling vereist een gefinaliseerd arbeidscontract, rooster-/planningvalidatie en een payroll-final loonrun.
        </div>

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
            <Calculator className="w-3.5 h-3.5 mr-1" /> Bereken conceptkosten
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-6 p-4 bg-slate-50 rounded-lg space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-semibold text-slate-800">Conceptpreview</span>
              </div>
              <Badge className="bg-amber-100 text-amber-800">
                Niet payroll-final
              </Badge>
            </div>

            {previewWarnings(result).length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-amber-800">
                {previewWarnings(result).slice(0, 3).map((warning, index) => (
                  <p key={index}>{warning}</p>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-700">Totaal uren</span>
              <span className="text-sm font-bold text-slate-900">{formatNumber(result.total_hours)}u</span>
            </div>
            
            {result.employee_type === 'loondienst' && (
              <>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">Salaris</span>
                  <span className="font-medium">€{result.payslip.base_salary.toFixed(2)}</span>
                </div>
                
                {result.payslip.vacation_hours_call_worker > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Vakantie-uren oproep</span>
                    <span className="font-medium">€{result.payslip.vacation_hours_call_worker.toFixed(2)}</span>
                  </div>
                )}
                
                {result.payslip.surcharges.evening_10.amount > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Toeslag avond 10%</span>
                    <span className="font-medium">€{result.payslip.surcharges.evening_10.amount.toFixed(2)}</span>
                  </div>
                )}
                
                {result.payslip.surcharges.night_20.amount > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Toeslag nacht 20%</span>
                    <span className="font-medium">€{result.payslip.surcharges.night_20.amount.toFixed(2)}</span>
                  </div>
                )}
                
                {result.payslip.surcharges.weekend_35.amount > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Toeslag weekend 35%</span>
                    <span className="font-medium">€{result.payslip.surcharges.weekend_35.amount.toFixed(2)}</span>
                  </div>
                )}
                
                {result.payslip.surcharges.holiday_50.amount > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Toeslag feestdag 50%</span>
                    <span className="font-medium">€{result.payslip.surcharges.holiday_50.amount.toFixed(2)}</span>
                  </div>
                )}
                
                {result.payslip.surcharges.new_years_eve_100.amount > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Toeslag oudejaarsdag 100%</span>
                    <span className="font-medium">€{result.payslip.surcharges.new_years_eve_100.amount.toFixed(2)}</span>
                  </div>
                )}
                
                {result.payslip.vacation_paid > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Doorbetalen ORT verlof</span>
                    <span className="font-medium">€{result.payslip.vacation_paid.toFixed(2)}</span>
                  </div>
                )}
                
                {result.payslip.is_call_worker && (
                  <>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Vakantietoeslag</span>
                      <span className="font-medium">€{result.payslip.accruals.vacation_allowance.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Eindejaarsuitkering</span>
                      <span className="font-medium">€{result.payslip.accruals.year_end_bonus.toFixed(2)}</span>
                    </div>
                  </>
                )}
                
                <div className="pt-2 border-t border-slate-300 flex justify-between items-center text-sm">
                  <span className="text-slate-600 font-semibold">Indicatief bruto totaal</span>
                  <span className="font-semibold">€{result.payslip.total_gross.toFixed(2)}</span>
                </div>
                
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">Werknemersbijdragen</span>
                  <span className="font-medium text-red-600">-€{result.payslip.employee_deductions.total.toFixed(2)}</span>
                </div>
                
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600 font-semibold">Indicatief netto</span>
                  <span className="font-semibold text-green-600">€{result.payslip.net_salary.toFixed(2)}</span>
                </div>
                
                <div className="pt-2 border-t border-slate-300 space-y-1">
                  {!result.payslip.is_call_worker && (
                    <>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-600">Vakantiegeld (8%)</span>
                        <span className="font-medium">€{result.payslip.accruals.vacation_allowance.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-600">Eindejaarsuitkering</span>
                        <span className="font-medium">€{result.payslip.accruals.year_end_bonus.toFixed(2)}</span>
                      </div>
                      {result.payslip.vacation_paid > 0 && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600">ORT verlof reservering</span>
                          <span className="font-medium">€{result.payslip.vacation_paid.toFixed(2)}</span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Werkgeverslasten</span>
                    <span className="font-medium">€{result.payslip.employer_costs.total.toFixed(2)}</span>
                  </div>
                </div>
              </>
            )}

            <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
              <span className="font-semibold text-slate-900">Indicatieve totale werkgeverskosten</span>
              <span className="text-lg font-bold text-slate-900">€{result.payslip.total_cost_employer.toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between items-center bg-amber-100 -mx-4 -mb-4 px-4 py-3 rounded-b-lg">
              <span className="text-sm font-semibold text-amber-900">Kosten per uur</span>
              <span className="text-lg font-bold text-amber-900">€{result.payslip.avg_cost_per_hour.toFixed(2)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
