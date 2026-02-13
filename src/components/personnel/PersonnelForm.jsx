import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { X, Save } from "lucide-react";

const CONTRACT_TYPES = [
  { value: "fulltime", label: "Fulltime" },
  { value: "parttime", label: "Parttime" },
  { value: "0_uren", label: "0-urencontract" },
  { value: "min_max", label: "Min-max contract" },
];

// CAO Particuliere Beveiliging - Bijlage 4: Geldige perioden per schaal
const VALID_PERIODS_PER_SCALE = {
  2: { min: 0, max: 1 },
  3: { min: 1, max: 10 },
  4: { min: 2, max: 12 },
  5: { min: 4, max: 13 },
  6: { min: 5, max: 14 },
  7: { min: 6, max: 16 }
};

export default function PersonnelForm({ person, onSave, onCancel }) {
  const [form, setForm] = useState(person || {
    name: "",
    function_type: "surveillant",
    employee_type: "loondienst",
    contract_type: "fulltime",
    cao: "cao_particuliere_beveiliging",
    cao_scale: 3,
    cao_period: 0,
    is_active: true,
  });

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Valideer CAO periode indien CAO is gekozen
    if (form.employee_type === 'loondienst' && form.cao === 'cao_particuliere_beveiliging') {
      const scale = form.cao_scale || 3;
      const period = form.cao_period || 0;
      const validRange = VALID_PERIODS_PER_SCALE[scale];
      
      if (period < validRange.min || period > validRange.max) {
        alert(`Ongeldige periode: Voor schaal ${scale} zijn alleen perioden ${validRange.min} t/m ${validRange.max} toegestaan volgens de CAO.`);
        return;
      }
    }
    
    onSave(form);
  };

  const isZZP = form.employee_type === "zzp";
  const isLoondienst = form.employee_type === "loondienst";
  const usesCAO = form.cao === "cao_particuliere_beveiliging";

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">{person ? "Medewerker bewerken" : "Nieuwe medewerker"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basis */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Basisgegevens</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Naam</Label>
                <Input value={form.name} onChange={(e) => handleChange("name", e.target.value)} placeholder="Volledige naam" required />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Functie</Label>
                <Select value={form.function_type} onValueChange={(v) => handleChange("function_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="surveillant">Surveillant</SelectItem>
                    <SelectItem value="binnendienst">Binnendienst</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Type</Label>
                <Select value={form.employee_type} onValueChange={(v) => handleChange("employee_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zzp">ZZP'er</SelectItem>
                    <SelectItem value="loondienst">Loondienst</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ZZP Tarieven */}
          {isZZP && (
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">ZZP Tarieven (excl. BTW)</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Standaard uurloon (€)</Label>
                  <Input type="number" step="0.01" value={form.zzp_hourly_rate_excl_vat || ""} onChange={(e) => handleChange("zzp_hourly_rate_excl_vat", parseFloat(e.target.value) || 0)} required />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-600">Avond (optioneel)</Label>
                  <Input type="number" step="0.01" value={form.zzp_evening_rate || ""} onChange={(e) => handleChange("zzp_evening_rate", parseFloat(e.target.value) || 0)} placeholder="Laat leeg voor standaard" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-600">Nacht (optioneel)</Label>
                  <Input type="number" step="0.01" value={form.zzp_night_rate || ""} onChange={(e) => handleChange("zzp_night_rate", parseFloat(e.target.value) || 0)} placeholder="Laat leeg voor standaard" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-600">Weekend (optioneel)</Label>
                  <Input type="number" step="0.01" value={form.zzp_weekend_rate || ""} onChange={(e) => handleChange("zzp_weekend_rate", parseFloat(e.target.value) || 0)} placeholder="Laat leeg voor standaard" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-600">Feestdag (optioneel)</Label>
                  <Input type="number" step="0.01" value={form.zzp_holiday_rate || ""} onChange={(e) => handleChange("zzp_holiday_rate", parseFloat(e.target.value) || 0)} placeholder="Laat leeg voor standaard" />
                </div>
              </div>
            </div>
          )}

          {/* Loondienst */}
          {isLoondienst && (
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Loondienst</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Contract type</Label>
                  <Select value={form.contract_type} onValueChange={(v) => handleChange("contract_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONTRACT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {form.contract_type === "parttime" && (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Uren per week</Label>
                    <Input type="number" value={form.parttime_hours || ""} onChange={(e) => handleChange("parttime_hours", Number(e.target.value))} required />
                  </div>
                )}

                {form.contract_type === "min_max" && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Min uren</Label>
                      <Input type="number" value={form.min_hours || ""} onChange={(e) => handleChange("min_hours", Number(e.target.value))} required />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Max uren</Label>
                      <Input type="number" value={form.max_hours || ""} onChange={(e) => handleChange("max_hours", Number(e.target.value))} required />
                    </div>
                  </>
                )}
              </div>

              {/* CAO of eigen tarief */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tariefbepaling</Label>
                  <Select value={form.cao} onValueChange={(v) => handleChange("cao", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cao_particuliere_beveiliging">CAO Particuliere Beveiliging</SelectItem>
                      <SelectItem value="eigen_tarief">Eigen uurtarief</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {usesCAO && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-slate-600">Loonschaal (2-7)</Label>
                      <Input 
                        type="number" 
                        min="2" 
                        max="7" 
                        value={form.cao_scale} 
                        onChange={(e) => {
                          const newScale = Number(e.target.value);
                          const validRange = VALID_PERIODS_PER_SCALE[newScale];
                          // Reset periode naar minimum van nieuwe schaal als huidige periode ongeldig is
                          const newPeriod = (form.cao_period < validRange.min || form.cao_period > validRange.max) 
                            ? validRange.min 
                            : form.cao_period;
                          setForm(prev => ({ ...prev, cao_scale: newScale, cao_period: newPeriod }));
                        }} 
                      />
                      <p className="text-[10px] text-slate-400">Schaal bepaalt functieniveau</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-slate-600">
                        Periode ({VALID_PERIODS_PER_SCALE[form.cao_scale || 3].min}-{VALID_PERIODS_PER_SCALE[form.cao_scale || 3].max})
                      </Label>
                      <Input 
                        type="number" 
                        min={VALID_PERIODS_PER_SCALE[form.cao_scale || 3].min} 
                        max={VALID_PERIODS_PER_SCALE[form.cao_scale || 3].max} 
                        value={form.cao_period} 
                        onChange={(e) => handleChange("cao_period", Number(e.target.value))} 
                      />
                      <p className="text-[10px] text-slate-400">Periode = dienstjaren</p>
                    </div>
                  </div>
                )}

                {!usesCAO && (
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-600">Uurtarief (€)</Label>
                    <Input type="number" step="0.01" value={form.custom_hourly_rate || ""} onChange={(e) => handleChange("custom_hourly_rate", parseFloat(e.target.value) || 0)} required />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-4 border-t">
            <Switch checked={form.is_active} onCheckedChange={(v) => handleChange("is_active", v)} />
            <Label>Actief</Label>
          </div>

          <div className="flex justify-end gap-3">
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