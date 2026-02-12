import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, X, Search, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function VehicleForm({ vehicle, onSave, onCancel }) {
  const [form, setForm] = useState(vehicle || {
    license_plate: "",
    brand: "",
    model: "",
    year: "",
    purchase_price: 0,
    residual_value: 0,
    depreciation_years: 5,
    fuel_cost_per_km: 0.15,
    maintenance_cost_per_km: 0.05,
    tire_cost_per_km: 0.02,
    insurance_per_month: 150,
    is_active: true,
  });

  const [lookingUp, setLookingUp] = useState(false);

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleLicensePlateLookup = async () => {
    if (!form.license_plate) return;
    
    setLookingUp(true);
    try {
      const { data } = await base44.functions.invoke('lookupLicensePlate', { 
        licensePlate: form.license_plate 
      });
      
      if (data.found) {
        setForm(prev => ({
          ...prev,
          brand: data.brand,
          model: data.model,
          year: data.year || prev.year,
        }));
      } else {
        alert(data.message || 'Kenteken niet gevonden');
      }
    } catch (error) {
      console.error('Error looking up license plate:', error);
      alert('Fout bij opzoeken kenteken');
    } finally {
      setLookingUp(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <Card className="border-0 shadow-lg mb-6">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">{vehicle ? "Voertuig bewerken" : "Nieuw voertuig"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
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
                {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-slate-500">Klik op zoeken om automatisch merk en model op te halen</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Merk</Label>
              <Input value={form.brand} onChange={(e) => handleChange("brand", e.target.value)} placeholder="Bijv. Volkswagen" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Model</Label>
              <Input value={form.model} onChange={(e) => handleChange("model", e.target.value)} placeholder="Bijv. Transporter" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Bouwjaar</Label>
              <Input type="number" value={form.year} onChange={(e) => handleChange("year", Number(e.target.value))} />
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-sm text-slate-700">Aanschaf & Afschrijving</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-slate-600">Aankoopprijs (€)</Label>
                <Input type="number" step="0.01" value={form.purchase_price} onChange={(e) => handleChange("purchase_price", Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-600">Restwaarde (€)</Label>
                <Input type="number" step="0.01" value={form.residual_value} onChange={(e) => handleChange("residual_value", Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-600">Afschrijving (jaar)</Label>
                <Input type="number" value={form.depreciation_years} onChange={(e) => handleChange("depreciation_years", Number(e.target.value))} />
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-sm text-slate-700">Variabele kosten per km</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-slate-600">Brandstof (€/km)</Label>
                <Input type="number" step="0.01" value={form.fuel_cost_per_km} onChange={(e) => handleChange("fuel_cost_per_km", Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-600">Onderhoud (€/km)</Label>
                <Input type="number" step="0.01" value={form.maintenance_cost_per_km} onChange={(e) => handleChange("maintenance_cost_per_km", Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-600">Banden (€/km)</Label>
                <Input type="number" step="0.01" value={form.tire_cost_per_km} onChange={(e) => handleChange("tire_cost_per_km", Number(e.target.value))} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Verzekering per maand (€)</Label>
            <Input type="number" step="0.01" value={form.insurance_per_month} onChange={(e) => handleChange("insurance_per_month", Number(e.target.value))} />
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