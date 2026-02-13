import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Save, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";

const ACQUISITION_TYPES = [
  { value: "aankoop", label: "Aankoop (contant)" },
  { value: "banklening", label: "Lening via bank" },
  { value: "lease", label: "Lease" },
  { value: "private_lease", label: "Private lease" },
];

const FUEL_TYPES = [
  { value: "benzine", label: "Benzine" },
  { value: "diesel", label: "Diesel" },
  { value: "elektrisch", label: "Elektrisch" },
  { value: "hybride", label: "Hybride" },
  { value: "lpg", label: "LPG" },
];

const MAINTENANCE_TYPES = [
  { value: "per_km", label: "Per kilometer" },
  { value: "per_month", label: "Per maand" },
  { value: "per_quarter", label: "Per kwartaal" },
  { value: "per_year", label: "Per jaar" },
];

const INSURANCE_TYPES = [
  { value: "wa", label: "WA" },
  { value: "wa_beperkt_casco", label: "WA + Beperkt Casco" },
  { value: "all_risk", label: "All Risk" },
];

export default function VehicleForm({ vehicle, onSave, onCancel }) {
  const [form, setForm] = useState(() => {
    const base = vehicle || {
      license_plate: "",
      brand: "",
      model: "",
      year: new Date().getFullYear(),
      fuel_type: "benzine",
      acquisition_type: "aankoop",
      purchase_price: 0,
      residual_value: 0,
      depreciation_years: 5,
      monthly_lease_cost: 0,
      monthly_loan_payment: 0,
      fuel_cost_per_km: 0,
      maintenance_type: "per_km",
      maintenance_cost: 0,
      maintenance_interval_km: 10000,
      tire_type: "per_year",
      tire_cost: 0,
      tire_interval_km: 50000,
      insurance_type: "wa",
      insurance_per_month: 0,
      insurance_deductible: 0,
      is_active: true,
      actual_residual_value: 0,
      disposal_date: "",
    };
    
    // Auto-schatting restwaarde bij nieuwe voertuigen (30% van aankoopprijs)
    if (!vehicle && base.purchase_price > 0 && !base.residual_value) {
      base.residual_value = Math.round(base.purchase_price * 0.3);
    }
    
    return base;
  });

  const [lookingUp, setLookingUp] = useState(false);

  const handleChange = (field, value) => {
    setForm(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-schatting restwaarde bij aankoopprijs wijziging
      if (field === "purchase_price" && !prev.actual_residual_value) {
        updated.residual_value = Math.round(value * 0.3);
      }
      
      return updated;
    });
  };

  const handleLicensePlateLookup = async () => {
    if (!form.license_plate) return;
    setLookingUp(true);
    try {
      const { data } = await base44.functions.invoke('lookupLicensePlate', { 
        license_plate: form.license_plate 
      });
      if (data.brand) setForm(prev => ({ 
        ...prev, 
        brand: data.brand, 
        model: data.model,
        year: data.year,
        fuel_type: data.fuel_type || prev.fuel_type
      }));
    } catch (error) {
      console.error('Kenteken opzoeken mislukt:', error);
    } finally {
      setLookingUp(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  const requiresPurchaseInfo = form.acquisition_type === "aankoop" || form.acquisition_type === "banklening";
  const requiresLeaseInfo = form.acquisition_type === "lease" || form.acquisition_type === "private_lease";

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">{vehicle ? "Voertuig bewerken" : "Nieuw voertuig"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basisgegevens */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Voertuiggegevens</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Kenteken</Label>
                <div className="flex gap-2">
                  <Input 
                    value={form.license_plate} 
                    onChange={(e) => handleChange("license_plate", e.target.value.toUpperCase())} 
                    placeholder="XX-XX-XX" 
                    required 
                    className="flex-1"
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleLicensePlateLookup}
                    disabled={lookingUp || !form.license_plate}
                  >
                    <Search className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Brandstoftype</Label>
                <Select value={form.fuel_type} onValueChange={(v) => handleChange("fuel_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FUEL_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Merk</Label>
                <Input value={form.brand} onChange={(e) => handleChange("brand", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Model</Label>
                <Input value={form.model} onChange={(e) => handleChange("model", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Bouwjaar</Label>
                <Input type="number" value={form.year} onChange={(e) => handleChange("year", Number(e.target.value))} />
              </div>
            </div>
          </div>

          {/* Aanschaf */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Aanschaf</h3>
            
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Type aanschaf</Label>
              <Select value={form.acquisition_type} onValueChange={(v) => handleChange("acquisition_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACQUISITION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {requiresPurchaseInfo && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Aankoopprijs (€)</Label>
                  <Input type="number" step="0.01" value={form.purchase_price} onChange={(e) => handleChange("purchase_price", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Geschatte restwaarde (€)
                  </Label>
                  <Input type="number" step="0.01" value={form.residual_value} onChange={(e) => handleChange("residual_value", parseFloat(e.target.value) || 0)} />
                  <p className="text-[10px] text-slate-400">Automatisch 30% van aankoopprijs</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Afschrijving (jaren)</Label>
                  <Input type="number" value={form.depreciation_years} onChange={(e) => handleChange("depreciation_years", Number(e.target.value))} />
                </div>
              </div>
            )}

            {form.acquisition_type === "banklening" && (
              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Maandelijkse aflossing (€)</Label>
                  <Input type="number" step="0.01" value={form.monthly_loan_payment} onChange={(e) => handleChange("monthly_loan_payment", parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            )}

            {requiresLeaseInfo && (
              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Maandelijkse leasekosten (€)</Label>
                  <Input type="number" step="0.01" value={form.monthly_lease_cost} onChange={(e) => handleChange("monthly_lease_cost", parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            )}
          </div>

          {/* Variabele kosten */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Variabele kosten</h3>
            
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {form.fuel_type === "elektrisch" ? "Elektriciteit" : "Brandstof"} per km (€)
              </Label>
              <Input type="number" step="0.01" value={form.fuel_cost_per_km} onChange={(e) => handleChange("fuel_cost_per_km", parseFloat(e.target.value) || 0)} />
            </div>

            {/* Onderhoud */}
            <div className="bg-slate-50 p-4 rounded-lg space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Onderhoud</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-600">Berekeningswijze</Label>
                  <Select value={form.maintenance_type} onValueChange={(v) => handleChange("maintenance_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MAINTENANCE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-600">
                    Kosten (€{form.maintenance_type === "per_km" ? "" : form.maintenance_type === "per_month" ? "/mnd" : form.maintenance_type === "per_quarter" ? "/kwartaal" : "/jaar"})
                  </Label>
                  <Input type="number" step="0.01" value={form.maintenance_cost} onChange={(e) => handleChange("maintenance_cost", parseFloat(e.target.value) || 0)} />
                </div>
              </div>
              {form.maintenance_type === "per_km" && (
                <div className="space-y-2">
                  <Label className="text-xs text-slate-600">Onderhoud elke X kilometer</Label>
                  <Input type="number" value={form.maintenance_interval_km} onChange={(e) => handleChange("maintenance_interval_km", Number(e.target.value))} placeholder="Bijv. 10000" />
                  <p className="text-xs text-slate-500">Kosten per km: €{form.maintenance_interval_km > 0 ? (form.maintenance_cost / form.maintenance_interval_km).toFixed(4) : "0.0000"}</p>
                </div>
              )}
            </div>

            {/* Banden */}
            <div className="bg-slate-50 p-4 rounded-lg space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Banden</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-600">Berekeningswijze</Label>
                  <Select value={form.tire_type} onValueChange={(v) => handleChange("tire_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MAINTENANCE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-600">
                    Kosten (€{form.tire_type === "per_km" ? "" : form.tire_type === "per_month" ? "/mnd" : form.tire_type === "per_quarter" ? "/kwartaal" : "/jaar"})
                  </Label>
                  <Input type="number" step="0.01" value={form.tire_cost} onChange={(e) => handleChange("tire_cost", parseFloat(e.target.value) || 0)} />
                </div>
              </div>
              {form.tire_type === "per_km" && (
                <div className="space-y-2">
                  <Label className="text-xs text-slate-600">Banden vervangen elke X kilometer</Label>
                  <Input type="number" value={form.tire_interval_km} onChange={(e) => handleChange("tire_interval_km", Number(e.target.value))} placeholder="Bijv. 50000" />
                  <p className="text-xs text-slate-500">Kosten per km: €{form.tire_interval_km > 0 ? (form.tire_cost / form.tire_interval_km).toFixed(4) : "0.0000"}</p>
                </div>
              )}
            </div>
          </div>

          {/* Verzekering */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Verzekering</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Type</Label>
                <Select value={form.insurance_type} onValueChange={(v) => handleChange("insurance_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INSURANCE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Per maand (€)</Label>
                <Input type="number" step="0.01" value={form.insurance_per_month} onChange={(e) => handleChange("insurance_per_month", parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Eigen risico (€)</Label>
                <Input type="number" step="0.01" value={form.insurance_deductible} onChange={(e) => handleChange("insurance_deductible", parseFloat(e.target.value) || 0)} />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              <X className="w-4 h-4 mr-1" /> Annuleren
            </Button>
            <Button type="submit" className="bg-slate-900 hover:bg-slate-800">
              <Save className="w-4 h-4 mr-1" /> Opslaan
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}