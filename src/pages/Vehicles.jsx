import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AnimatePresence, motion } from "framer-motion";
import PageHeader from "../components/ui-custom/PageHeader";
import EmptyState from "../components/ui-custom/EmptyState";
import VehicleForm from "../components/vehicles/VehicleForm";
import VehicleTable from "../components/vehicles/VehicleTable";
import MileageTracker from "../components/vehicles/MileageTracker";
import SellVehicleDialog from "../components/vehicles/SellVehicleDialog";
import MileageHistoryDialog from "../components/vehicles/MileageHistoryDialog";

export default function VehiclesPage() {
  const [showForm, setShowForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [sellVehicle, setSellVehicle] = useState(null);
  const [mileageVehicle, setMileageVehicle] = useState(null);
  const queryClient = useQueryClient();

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => base44.entities.Vehicle.list(),
  });

  const { data: personnel = [] } = useQuery({
    queryKey: ["personnel"],
    queryFn: () => base44.entities.Personnel.list(),
  });

  const personnelWithCar = personnel.filter(p => p.company_car_license_plate);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Vehicle.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setShowForm(false);
      setEditingVehicle(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Vehicle.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setShowForm(false);
      setEditingVehicle(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Vehicle.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vehicles"] }),
  });



  const handleSave = (data) => {
    if (editingVehicle) {
      updateMutation.mutate({ id: editingVehicle.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (vehicle) => {
    setEditingVehicle(vehicle);
    setShowForm(true);
  };

  const handleSell = (vehicle) => {
    setSellVehicle(vehicle);
  };

  const handleAddMileage = (vehicle) => {
    setMileageVehicle(vehicle);
  };

  const handleToggleActive = (vehicle) => {
    updateMutation.mutate({ id: vehicle.id, data: { is_active: vehicle.is_active === false } });
  };

  const handleSaveSell = (data) => {
    updateMutation.mutate({ id: data.id, data });
    setSellVehicle(null);
  };



  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Voertuigen"
        subtitle="Beheer uw voertuigen en voertuigkosten"
        actions={
          <Button onClick={() => setShowForm(!showForm)} className="bg-slate-900 hover:bg-slate-800">
            <Plus className="w-4 h-4 mr-2" /> Voertuig toevoegen
          </Button>
        }
      />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <div className="space-y-6">
              <VehicleForm
                vehicle={editingVehicle}
                onSave={handleSave}
                onCancel={() => {
                  setShowForm(false);
                  setEditingVehicle(null);
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {vehicles.length > 0 ? (
        <VehicleTable 
          vehicles={vehicles} 
          onEdit={handleEdit} 
          onDelete={(id) => deleteMutation.mutate(id)}
          onSell={handleSell}
          onAddMileage={handleAddMileage}
          onToggleActive={handleToggleActive}
        />
      ) : (
        !showForm && (
          <EmptyState
            icon={Plus}
            title="Geen voertuigen"
            description="Voeg uw eerste voertuig toe om te beginnen"
            actionLabel="Voertuig toevoegen"
            onAction={() => setShowForm(true)}
          />
        )
      )}

      {/* Sectie: Auto's van de zaak (gekoppeld aan personeel) */}
      {personnelWithCar.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-purple-600" />
            <h2 className="text-base font-bold text-slate-800">Auto's van de zaak – Personeel</h2>
            <Badge className="bg-purple-100 text-purple-800">{personnelWithCar.length}</Badge>
          </div>
          <p className="text-xs text-slate-500 mb-4">Deze voertuigen zijn gekoppeld aan een medewerker. Beheer ze via de <a href="/Personnel" className="text-blue-600 underline">personeelspagina</a>.</p>
          <div className="bg-white rounded-xl border border-purple-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-purple-50 border-b border-purple-100">
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Medewerker</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Kenteken</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Voertuig</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Bijtelling</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Leasekosten/mnd</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Fiscale bijtelling/mnd</th>
                </tr>
              </thead>
              <tbody>
                {personnelWithCar.map(p => {
                  const bijtellingMnd = p.company_car_fiscal_value && p.company_car_bijtelling_percentage
                    ? (p.company_car_fiscal_value * p.company_car_bijtelling_percentage / 100) / 12
                    : null;
                  return (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-purple-50/30">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{p.name}</div>
                        <div className="text-xs text-slate-500">{p.function_type}</div>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900">{p.company_car_license_plate}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{p.company_car_brand} {p.company_car_model}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {p.company_car_year && <span className="text-xs text-slate-500">{p.company_car_year}</span>}
                          {p.company_car_fuel_type && (
                            <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-600">{p.company_car_fuel_type}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">{p.company_car_bijtelling_percentage ?? 16}%</td>
                      <td className="px-4 py-3">{p.company_car_monthly_lease_cost ? `€${p.company_car_monthly_lease_cost.toFixed(2)}` : '–'}</td>
                      <td className="px-4 py-3">{bijtellingMnd ? `€${bijtellingMnd.toFixed(2)}` : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SellVehicleDialog 
        vehicle={sellVehicle} 
        open={!!sellVehicle} 
        onClose={() => setSellVehicle(null)}
        onSave={handleSaveSell}
      />

      <MileageHistoryDialog 
        vehicle={mileageVehicle} 
        open={!!mileageVehicle} 
        onClose={() => setMileageVehicle(null)}
      />
    </div>
  );
}