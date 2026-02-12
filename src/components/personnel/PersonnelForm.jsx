import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { X, Save } from "lucide-react";

export default function PersonnelForm({ person, onSave, onCancel }) {
  const [form, setForm] = useState(person || {
    name: "",
    base_hourly_rate: 14,
    evening_surcharge_pct: 30,
    night_surcharge_pct: 50,
    weekend_surcharge_pct: 50,
    holiday_surcharge_pct: 100,
    employer_costs_pct: 32,
    vacation_allowance_pct: 8,
    is_active: true,
  });

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  const effectiveRate = (surcharge) => {
    const base = form.base_hourly_rate || 0;
    const withSurcharge = base * (1 + (surcharge || 0) / 100);
    const withVacation = withSurcharge * (1 + (form.vacation_allowance_pct || 0) / 100);
    const withEmployer = withVacation * (1 + (form.employer_costs_pct || 0) / 100);
    return withEmployer;
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">{person ? "Medewerker bewerken" : "Nieuwe medewerker"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Naam</Label>
              <Input value={form.name} onChange={(e) => handleChange("name", e.target.value)} placeholder="Volledige naam" required />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Basisuurloon (€)</Label>
              <Input type="number" step="0.01" min="0" value={form.base_hourly_rate} onChange={(e) => handleChange("base_hourly_rate", Number(e.target.value))} required />
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Toeslagen (%)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Avond</Label>
                <Input type="number" min="0" value={form.evening_surcharge_pct} onChange={(e) => handleChange("evening_surcharge_pct", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Nacht</Label>
                <Input type="number" min="0" value={form.night_surcharge_pct} onChange={(e) => handleChange("night_surcharge_pct", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Weekend</Label>
                <Input type="number" min="0" value={form.weekend_surcharge_pct} onChange={(e) => handleChange("weekend_surcharge_pct", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Feestdag</Label>
                <Input type="number" min="0" value={form.holiday_surcharge_pct} onChange={(e) => handleChange("holiday_surcharge_pct", Number(e.target.value))} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Werkgeverslasten (%)</Label>
              <Input type="number" min="0" value={form.employer_costs_pct} onChange={(e) => handleChange("employer_costs_pct", Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Vakantiegeld (%)</Label>
              <Input type="number" min="0" value={form.vacation_allowance_pct} onChange={(e) => handleChange("vacation_allowance_pct", Number(e.target.value))} />
            </div>
          </div>

          <div className="bg-amber-50 rounded-xl p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-3">Effectieve uurkosten (incl. alle lasten)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="text-center">
                <p className="text-xs text-amber-600">Dag</p>
                <p className="text-lg font-bold text-amber-900">€{effectiveRate(0).toFixed(2)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-amber-600">Avond</p>
                <p className="text-lg font-bold text-amber-900">€{effectiveRate(form.evening_surcharge_pct).toFixed(2)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-amber-600">Nacht</p>
                <p className="text-lg font-bold text-amber-900">€{effectiveRate(form.night_surcharge_pct).toFixed(2)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-amber-600">Weekend</p>
                <p className="text-lg font-bold text-amber-900">€{effectiveRate(form.weekend_surcharge_pct).toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={form.is_active} onCheckedChange={(v) => handleChange("is_active", v)} />
            <Label>Actief</Label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
            <Button type="submit" className="bg-slate-900 hover:bg-slate-800"><Save className="w-4 h-4 mr-1" /> Opslaan</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}