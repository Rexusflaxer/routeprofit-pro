import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import PageHeader from "../components/ui-custom/PageHeader";
import EmptyState from "../components/ui-custom/EmptyState";
import VehicleForm from "../components/vehicles/VehicleForm";
import VehicleTable from "../components/vehicles/VehicleTable";
import MileageTracker from "../components/vehicles/MileageTracker";

export default function VehiclesPage() {
  const [showForm, setShowForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const queryClient = useQueryClient();

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => base44.entities.Vehicle.list(),
  });

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
              {editingVehicle && editingVehicle.id && <MileageTracker vehicleId={editingVehicle.id} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {vehicles.length > 0 ? (
        <VehicleTable vehicles={vehicles} onEdit={handleEdit} onDelete={(id) => deleteMutation.mutate(id)} />
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
    </div>
  );
}