import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { X, Save, Car, Building2, User } from "lucide-react";

const CONTRACT_TYPES = [
  { value: "fulltime", label: "Fulltime" },
  { value: "parttime", label: "Parttime" },
  { value: "0_uren", label: "0-urencontract" },
  { value: "min_max", label: "Min-max contract" },
];

const VALID_PERIODS_PER_SCALE = {
  2: { min: 0, max: 1 },
  3: { min: 1, max: 10 },
  4: { min: 2, max: 12 },
  5: { min: 4, max: 13 },
  6: { min: 5, max: 14 },
  7: { min: 6, max: 16 }
};

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

// Helper: bereken maandelijkse kosten op basis van type
function toMonthly(cost, type, intervalKm, kmPerMonth) {
  if (!cost) return 0;
  if (type === "per_month") return cost;
  if (type === "per_quarter") return cost / 3;
  if (type === "per_year") return cost / 12;
  if (type === "per_km") {
    if (!intervalKm || intervalKm === 0) return 0;
    const costPerKm = cost / intervalKm;
    return costPerKm * (kmPerMonth || 0);
  }
  return 0;
}

function CostOwnerToggle({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="text-[10px] text-slate-500">Kosten voor:</span>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${value ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-300 hover:border-slate-500"}`}
      >
        <Building2 className="w-3 h-3" /> Bedrijf
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${!value ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-500 border-slate-300 hover:border-slate-500"}`}
      >
        <User className="w-3 h-3" /> Personeel
      </button>
      {!value && <span className="text-[10px] text-amber-600 italic">Geen bedrijfskosten – niet doorberekend</span>}
    </div>
  );
}

export default function PersonnelForm({ person, onSave, onCancel }) {
  const getDefaultCao = (functionType) =>
    functionType === "binnendienst" ? "eigen_tarief" : "cao_particuliere_beveiliging";

  const [form, setForm] = useState(person || {
    name: "",
    function_type: "surveillant",
    employee_type: "loondienst",
    contract_type: "fulltime",
    cao: "cao_particuliere_beveiliging",
    cao_scale: 3,
    cao_period: 0,
    is_active: true,
    company_car_maintenance_type: "per_km",
    company_car_maintenance_for_company: true,
    company_car_tire_type: "per_year",
    company_car_tire_for_company: true,
    company_car_insurance_type: "wa",
    company_car_insurance_for_company: true,
    company_car_acquisition_type: "lease",
    company_car_bijtelling_percentage: 16,
    company_car_depreciation_years: 5,
  });

  const handleFunctionTypeChange = (v) => {
    setForm(prev => ({
      ...prev,
      function_type: v,
      cao: prev.employee_type === "loondienst" ? getDefaultCao(v) : prev.cao,
    }));
  };

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (form.employee_type === 'loondienst' && form.cao === 'cao_particuliere_beveiliging') {
      const scale = form.cao_scale || 3;
      const period = form.cao_period || 0;
      const validRange = VALID_PERIODS_PER_SCALE[scale];
      if (period < validRange.min || period > validRange.max) {
        alert(`Ongeldige periode: Voor schaal ${scale} zijn alleen perioden ${validRange.min} t/m ${validRange.max} toegestaan.`);
        return;
      }
    }
    onSave(form);
  };

  const isZZP = form.employee_type === "zzp";
  const isLoondienst = form.employee_type === "loondienst";
  const usesCAO = form.cao === "cao_particuliere_beveiliging";
  const hasCar = !!form.company_car_license_plate || !!form._showCarSection;
  const acqType = form.company_car_acquisition_type || "lease";
  const isLease = acqType === "lease" || acqType === "private_lease";
  const isAankoop = acqType === "aankoop";
  const isBanklening = acqType === "banklening";

  // Live totaalberekening autokosten
  const carCosts = (() => {
    if (!hasCar) return null;
    const km = form.company_car_km_per_month || 0;
    const lease = isLease ? (form.company_car_monthly_lease_cost || 0) : 0;
    const lening = isBanklening ? (form.company_car_monthly_loan_payment || 0) : 0;
    const depreciation = isAankoop && form.company_car_purchase_price && form.company_car_depreciation_years
      ? ((form.company_car_purchase_price - (form.company_car_residual_value || 0)) / form.company_car_depreciation_years) / 12
      : 0;
    const fuel = (form.company_car_fuel_cost_per_km || 0) * km;
    const maintenanceMnd = form.company_car_maintenance_for_company
      ? toMonthly(form.company_car_maintenance_cost, form.company_car_maintenance_type, form.company_car_maintenance_interval_km, km)
      : 0;
    const tireMnd = form.company_car_tire_for_company
      ? toMonthly(form.company_car_tire_cost, form.company_car_tire_type, form.company_car_tire_interval_km, km)
      : 0;
    const insurance = form.company_car_insurance_for_company ? (form.company_car_insurance_per_month || 0) : 0;
    const total = lease + lening + depreciation + fuel + maintenanceMnd + tireMnd + insurance;
    return { lease, lening, depreciation, fuel, maintenanceMnd, tireMnd, insurance, total };
  })();

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
                <Select value={form.function_type} onValueChange={handleFunctionTypeChange}>
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
                      <Input type="number" min="2" max="7" value={form.cao_scale}
                        onChange={(e) => {
                          const newScale = Number(e.target.value);
                          if (newScale >= 2 && newScale <= 7) {
                            const validRange = VALID_PERIODS_PER_SCALE[newScale];
                            const newPeriod = (form.cao_period < validRange.min || form.cao_period > validRange.max) ? validRange.min : form.cao_period;
                            setForm(prev => ({ ...prev, cao_scale: newScale, cao_period: newPeriod }));
                          }
                        }} />
                      <p className="text-[10px] text-slate-400">Schaal bepaalt functieniveau</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-slate-600">Periode ({VALID_PERIODS_PER_SCALE[form.cao_scale || 3].min}-{VALID_PERIODS_PER_SCALE[form.cao_scale || 3].max})</Label>
                      <Input type="number" min={VALID_PERIODS_PER_SCALE[form.cao_scale || 3].min} max={VALID_PERIODS_PER_SCALE[form.cao_scale || 3].max} value={form.cao_period} onChange={(e) => handleChange("cao_period", Number(e.target.value))} />
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

          {/* Auto van de zaak */}
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Car className="w-4 h-4" /> Auto van de zaak
              </h3>
              <Switch
                checked={hasCar}
                onCheckedChange={(v) => {
                  if (!v) {
                    setForm(prev => ({
                      ...prev, _showCarSection: false,
                      company_car_license_plate: "", company_car_brand: "", company_car_model: "",
                      company_car_year: "", company_car_fiscal_value: "", company_car_bijtelling_percentage: 16,
                      company_car_fuel_type: "", company_car_acquisition_type: "lease",
                      company_car_monthly_lease_cost: "", company_car_monthly_loan_payment: "",
                      company_car_purchase_price: "", company_car_residual_value: "", company_car_depreciation_years: 5,
                      company_car_fuel_cost_per_km: "", company_car_km_per_month: "",
                      company_car_maintenance_type: "per_km", company_car_maintenance_cost: "",
                      company_car_maintenance_interval_km: "", company_car_maintenance_for_company: true,
                      company_car_tire_type: "per_year", company_car_tire_cost: "",
                      company_car_tire_interval_km: "", company_car_tire_for_company: true,
                      company_car_insurance_type: "wa", company_car_insurance_per_month: "",
                      company_car_insurance_deductible: "", company_car_insurance_for_company: true,
                    }));
                  } else {
                    handleChange("_showCarSection", true);
                  }
                }}
              />
            </div>

            {hasCar && (
              <div className="bg-blue-50 rounded-xl border border-blue-200 divide-y divide-blue-200">
                
                {/* 1. Voertuiggegevens */}
                <div className="p-4 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Voertuiggegevens</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Kenteken</Label>
                      <Input value={form.company_car_license_plate || ""} onChange={(e) => handleChange("company_car_license_plate", e.target.value.toUpperCase())} placeholder="AB-123-C" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Merk</Label>
                      <Input value={form.company_car_brand || ""} onChange={(e) => handleChange("company_car_brand", e.target.value)} placeholder="bijv. Volkswagen" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Model</Label>
                      <Input value={form.company_car_model || ""} onChange={(e) => handleChange("company_car_model", e.target.value)} placeholder="bijv. Golf" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Bouwjaar</Label>
                      <Input type="number" value={form.company_car_year || ""} onChange={(e) => handleChange("company_car_year", parseInt(e.target.value) || "")} placeholder="2022" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Brandstoftype</Label>
                      <Select value={form.company_car_fuel_type || ""} onValueChange={(v) => handleChange("company_car_fuel_type", v)}>
                        <SelectTrigger><SelectValue placeholder="Kies..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="benzine">Benzine</SelectItem>
                          <SelectItem value="diesel">Diesel</SelectItem>
                          <SelectItem value="elektrisch">Elektrisch</SelectItem>
                          <SelectItem value="hybride">Hybride</SelectItem>
                          <SelectItem value="lpg">LPG</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Cataloguswaarde (€)</Label>
                      <Input type="number" step="100" value={form.company_car_fiscal_value || ""} onChange={(e) => handleChange("company_car_fiscal_value", parseFloat(e.target.value) || "")} placeholder="48990" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Bijtelling (%)</Label>
                      <Input type="number" step="0.5" value={form.company_car_bijtelling_percentage ?? 16} onChange={(e) => handleChange("company_car_bijtelling_percentage", parseFloat(e.target.value) || 16)} />
                    </div>
                  </div>
                  {form.company_car_fiscal_value && form.company_car_bijtelling_percentage ? (
                    <p className="text-xs text-blue-700 bg-blue-100 rounded-lg px-3 py-2 inline-block">
                      Fiscale bijtelling medewerker: <strong>€{((form.company_car_fiscal_value * form.company_car_bijtelling_percentage / 100) / 12).toFixed(2)}/mnd</strong> (opgeteld bij loonkosten)
                    </p>
                  ) : null}
                </div>

                {/* 2. Aanschaf */}
                <div className="p-4 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Aanschaf</p>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Type aanschaf</Label>
                    <Select value={acqType} onValueChange={(v) => handleChange("company_car_acquisition_type", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lease">Lease</SelectItem>
                        <SelectItem value="private_lease">Private lease</SelectItem>
                        <SelectItem value="aankoop">Aankoop (contant)</SelectItem>
                        <SelectItem value="banklening">Lening via bank</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {isLease && (
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Maandelijkse leasekosten (€)</Label>
                      <Input type="number" step="0.01" value={form.company_car_monthly_lease_cost || ""} onChange={(e) => handleChange("company_car_monthly_lease_cost", parseFloat(e.target.value) || "")} placeholder="bijv. 690,60" />
                      <p className="text-[10px] text-slate-400">All-in maandbedrag leasemaatschappij</p>
                    </div>
                  )}
                  {isBanklening && (
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Maandelijkse aflossing (€)</Label>
                      <Input type="number" step="0.01" value={form.company_car_monthly_loan_payment || ""} onChange={(e) => handleChange("company_car_monthly_loan_payment", parseFloat(e.target.value) || "")} />
                    </div>
                  )}
                  {(isAankoop || isBanklening) && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">Aankoopprijs (€)</Label>
                        <Input type="number" step="100" value={form.company_car_purchase_price || ""} onChange={(e) => handleChange("company_car_purchase_price", parseFloat(e.target.value) || "")} placeholder="35000" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">Geschatte restwaarde (€)</Label>
                        <Input type="number" step="100" value={form.company_car_residual_value || ""} onChange={(e) => handleChange("company_car_residual_value", parseFloat(e.target.value) || "")} placeholder="10000" />
                        <p className="text-[10px] text-slate-400">Automatisch 30% van aankoopprijs</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">Afschrijving (jaren)</Label>
                        <Input type="number" min="1" max="15" value={form.company_car_depreciation_years ?? 5} onChange={(e) => handleChange("company_car_depreciation_years", parseInt(e.target.value) || 5)} />
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Variabele kosten */}
                <div className="p-4 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Variabele kosten</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">{form.company_car_fuel_type === "elektrisch" ? "Elektriciteit" : "Brandstof"} per km (€)</Label>
                      <Input type="number" step="0.001" value={form.company_car_fuel_cost_per_km || ""} onChange={(e) => handleChange("company_car_fuel_cost_per_km", parseFloat(e.target.value) || "")} placeholder="bijv. 0,12" />
                      <p className="text-[10px] text-slate-400">Benzine ~€0,14 · Diesel ~€0,10 · Elektrisch ~€0,04</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Geschatte km per maand</Label>
                      <Input type="number" step="50" value={form.company_car_km_per_month || ""} onChange={(e) => handleChange("company_car_km_per_month", parseInt(e.target.value) || "")} placeholder="bijv. 1500" />
                    </div>
                  </div>

                  {/* Onderhoud */}
                  <div className="bg-white rounded-lg p-3 space-y-2 border border-blue-100">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Onderhoud</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">Berekeningswijze</Label>
                        <Select value={form.company_car_maintenance_type || "per_km"} onValueChange={(v) => handleChange("company_car_maintenance_type", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {MAINTENANCE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">
                          Kosten (€{form.company_car_maintenance_type === "per_km" ? "" : form.company_car_maintenance_type === "per_month" ? "/mnd" : form.company_car_maintenance_type === "per_quarter" ? "/kwartaal" : "/jaar"})
                        </Label>
                        <Input type="number" step="0.01" value={form.company_car_maintenance_cost || ""} onChange={(e) => handleChange("company_car_maintenance_cost", parseFloat(e.target.value) || "")} placeholder="0" />
                      </div>
                    </div>
                    {form.company_car_maintenance_type === "per_km" && (
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">Onderhoud elke X kilometer</Label>
                        <Input type="number" value={form.company_car_maintenance_interval_km || ""} onChange={(e) => handleChange("company_car_maintenance_interval_km", Number(e.target.value))} placeholder="bijv. 10000" />
                        <p className="text-xs text-slate-500">Kosten per km: €{form.company_car_maintenance_interval_km > 0 ? ((form.company_car_maintenance_cost || 0) / form.company_car_maintenance_interval_km).toFixed(4) : "0.0000"}</p>
                      </div>
                    )}
                    <CostOwnerToggle label="Onderhoud" value={form.company_car_maintenance_for_company ?? true} onChange={(v) => handleChange("company_car_maintenance_for_company", v)} />
                  </div>

                  {/* Banden */}
                  <div className="bg-white rounded-lg p-3 space-y-2 border border-blue-100">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Banden</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">Berekeningswijze</Label>
                        <Select value={form.company_car_tire_type || "per_year"} onValueChange={(v) => handleChange("company_car_tire_type", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {MAINTENANCE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">
                          Kosten (€{form.company_car_tire_type === "per_km" ? "" : form.company_car_tire_type === "per_month" ? "/mnd" : form.company_car_tire_type === "per_quarter" ? "/kwartaal" : "/jaar"})
                        </Label>
                        <Input type="number" step="0.01" value={form.company_car_tire_cost || ""} onChange={(e) => handleChange("company_car_tire_cost", parseFloat(e.target.value) || "")} placeholder="0" />
                      </div>
                    </div>
                    {form.company_car_tire_type === "per_km" && (
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">Banden vervangen elke X kilometer</Label>
                        <Input type="number" value={form.company_car_tire_interval_km || ""} onChange={(e) => handleChange("company_car_tire_interval_km", Number(e.target.value))} placeholder="bijv. 50000" />
                        <p className="text-xs text-slate-500">Kosten per km: €{form.company_car_tire_interval_km > 0 ? ((form.company_car_tire_cost || 0) / form.company_car_tire_interval_km).toFixed(4) : "0.0000"}</p>
                      </div>
                    )}
                    <CostOwnerToggle label="Banden" value={form.company_car_tire_for_company ?? true} onChange={(v) => handleChange("company_car_tire_for_company", v)} />
                  </div>
                </div>

                {/* 4. Verzekering */}
                <div className="p-4 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Verzekering</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Type</Label>
                      <Select value={form.company_car_insurance_type || "wa"} onValueChange={(v) => handleChange("company_car_insurance_type", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {INSURANCE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Per maand (€)</Label>
                      <Input type="number" step="0.01" value={form.company_car_insurance_per_month || ""} onChange={(e) => handleChange("company_car_insurance_per_month", parseFloat(e.target.value) || "")} placeholder="0" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Eigen risico (€)</Label>
                      <Input type="number" step="0.01" value={form.company_car_insurance_deductible || ""} onChange={(e) => handleChange("company_car_insurance_deductible", parseFloat(e.target.value) || "")} placeholder="0" />
                    </div>
                  </div>
                  <CostOwnerToggle label="Verzekering" value={form.company_car_insurance_for_company ?? true} onChange={(v) => handleChange("company_car_insurance_for_company", v)} />
                </div>

                {/* 5. Totaaloverzicht */}
                {carCosts && carCosts.total > 0 && (
                  <div className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">Totale bedrijfskosten auto per maand</p>
                    <div className="bg-white rounded-lg p-3 space-y-1 text-xs border border-blue-100">
                      {carCosts.lease > 0 && <div className="flex justify-between text-slate-600"><span>Lease</span><span>€{carCosts.lease.toFixed(2)}</span></div>}
                      {carCosts.lening > 0 && <div className="flex justify-between text-slate-600"><span>Aflossing</span><span>€{carCosts.lening.toFixed(2)}</span></div>}
                      {carCosts.depreciation > 0 && <div className="flex justify-between text-slate-600"><span>Afschrijving</span><span>€{carCosts.depreciation.toFixed(2)}</span></div>}
                      {carCosts.fuel > 0 && <div className="flex justify-between text-slate-600"><span>Brandstof</span><span>€{carCosts.fuel.toFixed(2)}</span></div>}
                      {carCosts.maintenanceMnd > 0 && <div className="flex justify-between text-slate-600"><span>Onderhoud</span><span>€{carCosts.maintenanceMnd.toFixed(2)}</span></div>}
                      {carCosts.tireMnd > 0 && <div className="flex justify-between text-slate-600"><span>Banden</span><span>€{carCosts.tireMnd.toFixed(2)}</span></div>}
                      {carCosts.insurance > 0 && <div className="flex justify-between text-slate-600"><span>Verzekering</span><span>€{carCosts.insurance.toFixed(2)}</span></div>}
                      <div className="flex justify-between font-bold text-slate-900 border-t pt-1 mt-1">
                        <span>Totaal/mnd (bedrijfskosten)</span><span>€{carCosts.total.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500 text-[10px]">
                        <span>Per dag (÷ 22 werkdagen)</span><span>€{(carCosts.total / 22).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-4 border-t">
            <Switch checked={form.is_active !== false} onCheckedChange={(v) => handleChange("is_active", v)} />
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