import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Car, Building2, Calculator } from "lucide-react";

export default function CostSettingsForm({ settings, onSave }) {
  const [form, setForm] = useState(settings || {
    label: "Standaard",
    vehicle_purchase_price: 30000,
    vehicle_residual_value: 10000,
    vehicle_depreciation_years: 5,
    fuel_cost_per_km: 0.12,
    maintenance_cost_per_km: 0.04,
    tire_cost_per_km: 0.02,
    insurance_per_month: 150,
    office_costs_per_month: 500,
    admin_salary_per_month: 2500,
    other_fixed_costs_per_month: 200,
  });

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  const depreciationPerMonth = ((form.vehicle_purchase_price || 0) - (form.vehicle_residual_value || 0)) / ((form.vehicle_depreciation_years || 1) * 12);
  const variableCostPerKm = (form.fuel_cost_per_km || 0) + (form.maintenance_cost_per_km || 0) + (form.tire_cost_per_km || 0);
  const totalFixedPerMonth = depreciationPerMonth + (form.insurance_per_month || 0) + (form.office_costs_per_month || 0) + (form.admin_salary_per_month || 0) + (form.other_fixed_costs_per_month || 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Car className="w-4 h-4 text-amber-600" /> Voertuigkosten
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Aankoopprijs (€)</Label>
              <Input type="number" min="0" value={form.vehicle_purchase_price} onChange={(e) => handleChange("vehicle_purchase_price", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Restwaarde (€)</Label>
              <Input type="number" min="0" value={form.vehicle_residual_value} onChange={(e) => handleChange("vehicle_residual_value", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Afschrijving (jaren)</Label>
              <Input type="number" min="1" value={form.vehicle_depreciation_years} onChange={(e) => handleChange("vehicle_depreciation_years", Number(e.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Brandstof (€/km)</Label>
              <Input type="number" step="0.001" min="0" value={form.fuel_cost_per_km} onChange={(e) => handleChange("fuel_cost_per_km", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Onderhoud (€/km)</Label>
              <Input type="number" step="0.001" min="0" value={form.maintenance_cost_per_km} onChange={(e) => handleChange("maintenance_cost_per_km", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Banden (€/km)</Label>
              <Input type="number" step="0.001" min="0" value={form.tire_cost_per_km} onChange={(e) => handleChange("tire_cost_per_km", Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Verzekering per maand (€)</Label>
            <Input type="number" min="0" value={form.insurance_per_month} onChange={(e) => handleChange("insurance_per_month", Number(e.target.value))} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-600" /> Kantoor- & vaste kosten
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Kantoorkosten (€/mnd)</Label>
              <Input type="number" min="0" value={form.office_costs_per_month} onChange={(e) => handleChange("office_costs_per_month", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Administratie salaris (€/mnd)</Label>
              <Input type="number" min="0" value={form.admin_salary_per_month} onChange={(e) => handleChange("admin_salary_per_month", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Overige vaste kosten (€/mnd)</Label>
              <Input type="number" min="0" value={form.other_fixed_costs_per_month} onChange={(e) => handleChange("other_fixed_costs_per_month", Number(e.target.value))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm bg-gradient-to-r from-slate-800 to-slate-900 text-white">
        <CardContent className="py-5">
          <div className="flex items-center gap-2 mb-4">
            <Calculator className="w-4 h-4 text-amber-400" />
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Samenvatting maandkosten</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-slate-400">Afschrijving/mnd</p>
              <p className="text-lg font-bold">€{depreciationPerMonth.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Variabel/km</p>
              <p className="text-lg font-bold">€{variableCostPerKm.toFixed(3)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Totaal vast/mnd</p>
              <p className="text-lg font-bold">€{totalFixedPerMonth.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Totaal vast/jaar</p>
              <p className="text-lg font-bold">€{(totalFixedPerMonth * 12).toFixed(2)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" className="bg-slate-900 hover:bg-slate-800"><Save className="w-4 h-4 mr-1" /> Opslaan</Button>
      </div>
    </form>
  );
}