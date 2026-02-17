import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, ChevronDown, ChevronUp, TrendingUp, TrendingDown, BarChart2, Loader2, AlertCircle, RefreshCw, Car } from "lucide-react";

const WEEKDAY_LABELS = {
  1: "Maandag", 2: "Dinsdag", 3: "Woensdag", 4: "Donderdag",
  5: "Vrijdag", 6: "Zaterdag", 7: "Zondag"
};

function formatMinutes(minutes) {
  if (!minutes && minutes !== 0) return "–";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}u ${m}min` : `${h}u`;
}

function CostDetailRow({ label, value, highlight }) {
  return (
    <div className={`flex justify-between items-center text-sm py-1 ${highlight ? "font-semibold" : ""}`}>
      <span className="text-slate-600">{label}</span>
      <span className={highlight ? "text-slate-900" : "text-slate-700"}>€{value?.toFixed(2) ?? "0.00"}</span>
    </div>
  );
}

function PersonnelCostCard({ title, icon: Icon, iconColor, bgColor, borderColor, data, badge, badgeColor }) {
  const [expanded, setExpanded] = useState(false);

  if (!data) return null;

  const isZzp = data.employee_type === 'zzp';
  const isAverage = data.count !== undefined;

  const contractLabel = data.employee_type === 'zzp' ? 'ZZP' : 'Loondienst';
  const caoLabel = data.cao === 'cao_particuliere_beveiliging' && !isZzp
    ? `CAO schaal ${data.cao_scale ?? '-'}, periode ${data.cao_period ?? '0'}`
    : null;

  return (
    <Card className={`border-2 ${borderColor}`}>
      <CardHeader className={`${bgColor} rounded-t-lg pb-3`}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className={`w-5 h-5 ${iconColor}`} />
            {title}
          </CardTitle>
          {badge && (
            <Badge className={badgeColor}>{badge}</Badge>
          )}
        </div>
        {!isAverage && (
          <div className="mt-1 space-y-0.5">
            <p className="text-sm font-semibold text-slate-900">{data.name}</p>
            <p className="text-xs text-slate-500">
              {contractLabel}{caoLabel ? ` · ${caoLabel}` : ''}
              {data.employee_type === 'zzp' ? ` · €${data.base_hourly_rate?.toFixed(2)}/u excl. BTW` : ` · €${data.base_hourly_rate?.toFixed(2)}/u basis`}
            </p>
          </div>
        )}
        {isAverage && (
          <p className="text-xs text-slate-500 mt-1">{data.count} actieve surveillanten</p>
        )}
      </CardHeader>
      <CardContent className="pt-4">
        <div className="flex justify-between items-center mb-3">
          <div>
            <p className="text-xs text-slate-500">Totale loonkosten voor deze route</p>
            <p className="text-2xl font-bold text-slate-900">€{data.total_cost_employer?.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Kosten per uur</p>
            <p className="text-lg font-semibold text-slate-700">€{data.cost_per_hour?.toFixed(2)}</p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-slate-500 hover:text-slate-700"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
          {expanded ? "Verberg berekening" : "Toon berekening & details"}
        </Button>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Opbouw loonkosten</p>

            <CostDetailRow label={`Basissalaris (${data.total_hours?.toFixed(2)}u × €${data.base_hourly_rate?.toFixed(2)})`} value={data.base_salary} />

            {data.surcharges_total > 0 && (
              <>
                {data.surcharge_details?.map((s, i) => (
                  <CostDetailRow key={i} label={s.label} value={s.amount} />
                ))}
                <CostDetailRow label="Totaal toeslagen" value={data.surcharges_total} highlight />
              </>
            )}

            <div className="pt-1 border-t border-slate-100">
              <CostDetailRow label="Bruto loon" value={data.total_gross} highlight />
            </div>

            {!isZzp && data.employer_costs && (
              <>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-3 mb-1">Werkgeverslasten</p>
                {data.employer_costs.pension_premium > 0 && <CostDetailRow label="Pensioenpremie werkgever" value={data.employer_costs.pension_premium} />}
                {data.employer_costs.premium_awf > 0 && <CostDetailRow label="AWF premie" value={data.employer_costs.premium_awf} />}
                {data.employer_costs.premium_ww > 0 && <CostDetailRow label="WW premie" value={data.employer_costs.premium_ww} />}
                {data.employer_costs.premium_wia > 0 && <CostDetailRow label="WIA premie" value={data.employer_costs.premium_wia} />}
                {data.employer_costs.premium_wga > 0 && <CostDetailRow label="WGA premie" value={data.employer_costs.premium_wga} />}
                <CostDetailRow label="Totaal werkgeverslasten" value={data.employer_costs_total} highlight />
              </>
            )}

            {isZzp && data.employer_costs?.vat_21 > 0 && (
              <CostDetailRow label="BTW 21%" value={data.employer_costs.vat_21} />
            )}

            {!isZzp && data.accruals_total > 0 && (
              <>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-3 mb-1">Reserveringen</p>
                {data.accruals?.vacation_allowance > 0 && <CostDetailRow label="Vakantiegeld (8%)" value={data.accruals.vacation_allowance} />}
                {data.accruals?.year_end_bonus > 0 && <CostDetailRow label="Eindejaarsuitkering" value={data.accruals.year_end_bonus} />}
                <CostDetailRow label="Totaal reserveringen" value={data.accruals_total} highlight />
              </>
            )}

            <div className="pt-2 border-t border-slate-200 mt-2">
              <CostDetailRow label="Totale kosten werkgever" value={data.total_cost_employer} highlight />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VehicleCostCard({ data }) {
  const [expanded, setExpanded] = useState(false);
  if (!data) return null;

  const acqLabels = { aankoop: 'Aankoop', lease: 'Lease', private_lease: 'Private lease', banklening: 'Banklening' };

  return (
    <Card className="border-2 border-slate-200">
      <CardHeader className="bg-slate-50 rounded-t-lg pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Car className="w-5 h-5 text-slate-600" />
            Voertuigkosten
          </CardTitle>
          <Badge className="bg-slate-100 text-slate-800">{acqLabels[data.acquisition_type] || data.acquisition_type}</Badge>
        </div>
        <p className="text-sm font-semibold text-slate-900 mt-1">{data.vehicle_label}</p>
        <p className="text-xs text-slate-500">
          {data.km_per_service} km per dienst · {data.routes_with_vehicle} route{data.routes_with_vehicle !== 1 ? 's' : ''} · {data.total_services_per_week}x/week · {data.total_services_per_year} diensten/jaar
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="flex justify-between items-center mb-3">
          <div>
            <p className="text-xs text-slate-500">Voertuigkosten per dienst</p>
            <p className="text-2xl font-bold text-slate-900">€{data.total_per_service?.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Afschrijving/jaar</p>
            <p className="text-lg font-semibold text-slate-700">€{data.depreciation_per_year?.toFixed(2)}</p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-slate-500 hover:text-slate-700"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
          {expanded ? "Verberg berekening" : "Toon berekening & details"}
        </Button>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Vaste kosten (per dienst)</p>
            <CostDetailRow
              label={`${data.depreciation_label} ÷ ${data.total_services_per_year} diensten/jaar`}
              value={data.depreciation_per_service}
            />
            <CostDetailRow
              label={`Verzekering (€${data.insurance_per_year?.toFixed(2)}/jaar ÷ ${data.total_services_per_year} diensten)`}
              value={data.insurance_per_service}
            />

            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-3 mb-1">Variabele kosten (per dienst)</p>
            {data.km_per_service > 0 ? (
              <>
                <CostDetailRow
                  label={`Brandstof (${data.km_per_service} km × €${data.fuel_cost_per_km?.toFixed(3)}/km)`}
                  value={data.fuel_cost_per_service}
                />
                {data.maintenance_cost_per_service > 0 && (
                  <CostDetailRow label="Onderhoud" value={data.maintenance_cost_per_service} />
                )}
                {data.tire_cost_per_service > 0 && (
                  <CostDetailRow label="Banden" value={data.tire_cost_per_service} />
                )}
              </>
            ) : (
              <p className="text-xs text-slate-400 italic">Geen ritafstand bekend – variabele kosten zijn €0,00</p>
            )}

            <div className="pt-2 border-t border-slate-200 mt-2">
              <CostDetailRow label="Totaal voertuigkosten per dienst" value={data.total_per_service} highlight />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function RoutePersonnelCosts({ route }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedWeekday, setSelectedWeekday] = useState(null);

  const activeWeekday = selectedWeekday || route?.weekdays?.[0];

  const calculate = async (weekday, force = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await base44.functions.invoke('calculateRoutePersonnelCosts', {
        route_id: route.id,
        weekday: weekday || activeWeekday,
        force_recalculate: force
      });
      setData(response.data);
    } catch (err) {
      setError("Kon loonkosten niet berekenen. Controleer of er actieve surveillanten zijn.");
    } finally {
      setLoading(false);
    }
  };

  // Automatisch laden bij mount of dag-wijziging
  useEffect(() => {
    if (route?.id && activeWeekday) {
      calculate(activeWeekday);
    }
  }, [route?.id, activeWeekday]);

  return (
    <div className="space-y-6">
      {/* Dag selectie + dienst info */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            {(route.weekdays || []).length > 1 ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-slate-700">Loonkosten voor:</span>
                <div className="flex flex-wrap gap-2">
                  {(route.weekdays || []).map(day => (
                    <Button
                      key={day}
                      size="sm"
                      variant={activeWeekday === day ? "default" : "outline"}
                      onClick={() => setSelectedWeekday(day)}
                      className={activeWeekday === day ? "bg-slate-900" : ""}
                    >
                      {WEEKDAY_LABELS[day]}
                    </Button>
                  ))}
                </div>
              </div>
            ) : <div />}
            <Button
              size="sm"
              variant="outline"
              onClick={() => calculate(activeWeekday, true)}
              disabled={loading}
              className="text-slate-500 gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Herberekenen
            </Button>
          </div>
          {data && (
            <div className="space-y-1">
              <p className="text-xs text-slate-500">
                <span className="font-medium">{WEEKDAY_LABELS[activeWeekday]}</span>
                {" · "}Dienst <span className="font-medium">{data.start_time}–{data.end_time}</span>
                {data.alarm_standby
                  ? <span className="ml-1 text-amber-600 font-medium">· 🚨 Alarmdienst t/m {data.planned_end_time}</span>
                  : <span className="ml-1 text-slate-400">(gepland t/m {data.planned_end_time})</span>
                }
                <span className="ml-1 text-slate-400">· {data.total_surveillants} surveillanten</span>
              </p>
              {data.actual_shift_note && (
                <p className="text-xs text-blue-600">ℹ️ {data.actual_shift_note}</p>
              )}
            </div>
          )}
          {!data && !loading && !error && (
            <p className="text-xs text-slate-400">Berekening wordt geladen...</p>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {data && !loading && data.alarm_standby && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <span>🚨</span>
          <span><strong>Alarmdienst actief:</strong> de volledige tijd van {data.start_time} tot {data.end_time} wordt als diensttijd meegerekend in de kosten.</span>
        </div>
      )}
      {data && !loading && !data.alarm_standby && data.actual_shift_note && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <span>ℹ️</span>
          <span>{data.actual_shift_note}</span>
        </div>
      )}

      {data && !loading && data.vehicle_costs && (
        <VehicleCostCard data={data.vehicle_costs} />
      )}

      {data && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PersonnelCostCard
            title="Duurste surveillant"
            icon={TrendingUp}
            iconColor="text-red-600"
            bgColor="bg-red-50"
            borderColor="border-red-200"
            badge="Hoogste kosten"
            badgeColor="bg-red-100 text-red-800"
            data={data.most_expensive}
          />
          <PersonnelCostCard
            title="Gemiddelde loonkosten"
            icon={BarChart2}
            iconColor="text-blue-600"
            bgColor="bg-blue-50"
            borderColor="border-blue-200"
            badge={`${data.average.count} surveillanten`}
            badgeColor="bg-blue-100 text-blue-800"
            data={data.average}
          />
          <PersonnelCostCard
            title="Goedkoopste surveillant"
            icon={TrendingDown}
            iconColor="text-green-600"
            bgColor="bg-green-50"
            borderColor="border-green-200"
            badge="Laagste kosten"
            badgeColor="bg-green-100 text-green-800"
            data={data.cheapest}
          />
        </div>
      )}
    </div>
  );
}