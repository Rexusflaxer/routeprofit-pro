import React from "react";
import { Car } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import SectionWrapper from "./SectionWrapper";

function calcCarCosts(p) {
  // Monthly fixed (lease of afschrijving)
  let monthlyFixed = 0;
  if (p.company_car_monthly_lease_cost) {
    monthlyFixed = p.company_car_monthly_lease_cost;
  } else if (p.company_car_fiscal_value && p.company_car_bijtelling_percentage) {
    // Geen lease: bereken afschrijving simpel op basis van cataloguswaarde
    // We gebruiken alleen beschikbare velden; bijtelling is niet = afschrijving, 
    // maar als geen lease cost opgegeven, schatten we 0 vaste kosten
    monthlyFixed = 0;
  }

  // Fiscale bijtelling (voor info, geen echte kostenpost voor bedrijf)
  const bijtelling = p.company_car_fiscal_value && p.company_car_bijtelling_percentage
    ? (p.company_car_fiscal_value * (p.company_car_bijtelling_percentage / 100)) / 12
    : 0;

  return { monthlyFixed, bijtelling };
}

export default function CompanyCarSection({ personnel = [] }) {
  const withCar = personnel.filter(p => p.is_active !== false && p.company_car_license_plate);

  if (withCar.length === 0) return null;

  const total = withCar.reduce((s, p) => {
    const { monthlyFixed } = calcCarCosts(p);
    return s + monthlyFixed;
  }, 0);

  return (
    <SectionWrapper icon={Car} title="Auto's van de zaak (personeel)" total={total}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold border-b border-slate-100">
              <th className="text-left pb-2 font-semibold">Medewerker</th>
              <th className="text-left pb-2 font-semibold">Kenteken</th>
              <th className="text-left pb-2 font-semibold">Voertuig</th>
              <th className="text-left pb-2 font-semibold">Type</th>
              <th className="text-right pb-2 font-semibold">Lease/mnd</th>
              <th className="text-right pb-2 font-semibold">Bijtelling/mnd</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {withCar.map(p => {
              const { monthlyFixed, bijtelling } = calcCarCosts(p);
              return (
                <tr key={p.id} className="py-2">
                  <td className="py-2">
                    <div className="font-medium text-slate-800">{p.name}</div>
                    <div className="text-xs text-slate-400">{p.function_type}</div>
                  </td>
                  <td className="py-2 font-mono font-semibold text-slate-700">{p.company_car_license_plate}</td>
                  <td className="py-2 text-slate-600">
                    {[p.company_car_brand, p.company_car_model, p.company_car_year].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="py-2">
                    {p.company_car_fuel_type ? (
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{p.company_car_fuel_type}</span>
                    ) : "—"}
                  </td>
                  <td className="py-2 text-right font-medium text-slate-800">
                    {monthlyFixed > 0 ? `€${monthlyFixed.toFixed(2)}` : "—"}
                  </td>
                  <td className="py-2 text-right text-slate-500">
                    {bijtelling > 0 ? `€${bijtelling.toFixed(2)}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {total > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200">
                <td colSpan={4} className="pt-2 text-xs text-slate-400">Totaal leaskosten medewerkers</td>
                <td className="pt-2 text-right font-semibold text-slate-700">€{total.toFixed(2)}/mnd</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </SectionWrapper>
  );
}