import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Car } from "lucide-react";

export default function VehicleTable({ vehicles, onEdit, onDelete }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="font-semibold text-slate-700">Kenteken</TableHead>
            <TableHead className="font-semibold text-slate-700">Voertuig</TableHead>
            <TableHead className="font-semibold text-slate-700">Afschrijving/mnd</TableHead>
            <TableHead className="font-semibold text-slate-700">Variabel/km</TableHead>
            <TableHead className="font-semibold text-slate-700">Verzekering/mnd</TableHead>
            <TableHead className="font-semibold text-slate-700">Status</TableHead>
            <TableHead className="font-semibold text-slate-700 text-right">Acties</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vehicles.map((vehicle) => {
            let monthlyFixed = 0;
            if (vehicle.acquisition_type === "lease" || vehicle.acquisition_type === "private_lease") {
              monthlyFixed = vehicle.monthly_lease_cost || 0;
            } else if (vehicle.acquisition_type === "banklening") {
              monthlyFixed = vehicle.monthly_loan_payment || 0;
            } else {
              monthlyFixed = ((vehicle.purchase_price - vehicle.residual_value) / (vehicle.depreciation_years * 12)) || 0;
            }
            
            let variableCostPerKm = vehicle.fuel_cost_per_km || 0;
            if (vehicle.maintenance_type === "per_km" && vehicle.maintenance_interval_km > 0) {
              variableCostPerKm += (vehicle.maintenance_cost || 0) / vehicle.maintenance_interval_km;
            }
            if (vehicle.tire_type === "per_km" && vehicle.tire_interval_km > 0) {
              variableCostPerKm += (vehicle.tire_cost || 0) / vehicle.tire_interval_km;
            }
            
            return (
              <TableRow key={vehicle.id}>
                <TableCell className="font-mono font-semibold text-slate-900">{vehicle.license_plate}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Car className="w-4 h-4 text-slate-400" />
                    <div>
                      <div className="font-medium text-slate-900">{vehicle.brand} {vehicle.model}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {vehicle.year && <span className="text-xs text-slate-500">{vehicle.year}</span>}
                        {vehicle.fuel_type && (
                          <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-600">
                            {vehicle.fuel_type}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium text-slate-900">€{monthlyFixed.toFixed(2)}</div>
                    <div className="text-xs text-slate-500">
                      {vehicle.acquisition_type === "lease" ? "lease" : 
                       vehicle.acquisition_type === "private_lease" ? "priv. lease" :
                       vehicle.acquisition_type === "banklening" ? "aflossing" : "afschrijving"}
                    </div>
                  </div>
                </TableCell>
                <TableCell>€{variableCostPerKm.toFixed(2)}</TableCell>
                <TableCell>€{(vehicle.insurance_per_month || 0).toFixed(2)}</TableCell>
                <TableCell>
                  <Badge className={vehicle.is_active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}>
                    {vehicle.is_active ? "Actief" : "Inactief"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(vehicle)}>
                      <Pencil className="w-4 h-4 text-slate-500" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(vehicle.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}