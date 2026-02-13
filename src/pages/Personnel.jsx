import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Users } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import PageHeader from "../components/ui-custom/PageHeader";
import EmptyState from "../components/ui-custom/EmptyState";
import PersonnelForm from "../components/personnel/PersonnelForm";
import PersonnelTable from "../components/personnel/PersonnelTable";
import CostCalculator from "../components/personnel/CostCalculator";

export default function Personnel() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedForCalc, setSelectedForCalc] = useState(null);
  const queryClient = useQueryClient();

  const { data: personnel = [] } = useQuery({
    queryKey: ["personnel"],
    queryFn: () => base44.entities.Personnel.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Personnel.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["personnel"] }); setShowForm(false); setEditing(null); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Personnel.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["personnel"] }); setShowForm(false); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Personnel.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["personnel"] }),
  });

  const handleSave = (data) => {
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Personeel"
        subtitle="Beheer medewerkers en loonkosten"
        actions={
          <Button onClick={() => { setEditing(null); setShowForm(true); }} className="bg-slate-900 hover:bg-slate-800">
            <Plus className="w-4 h-4 mr-1" /> Nieuwe medewerker
          </Button>
        }
      />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <PersonnelForm person={editing} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null); }} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {personnel.length > 0 ? (
            <PersonnelTable 
              personnel={personnel} 
              onEdit={(p) => { setEditing(p); setShowForm(true); setSelectedForCalc(null); }} 
              onDelete={(id) => deleteMutation.mutate(id)}
              onCalculate={(p) => { setSelectedForCalc(p); setShowForm(false); setEditing(null); }}
            />
          ) : !showForm && (
            <EmptyState icon={Users} title="Geen medewerkers" description="Voeg uw eerste medewerker toe." actionLabel="Medewerker toevoegen" onAction={() => setShowForm(true)} />
          )}
        </div>
        
        <div className="lg:col-span-1">
          {selectedForCalc ? (
            <CostCalculator personnel={selectedForCalc} />
          ) : (
            <Card className="border-slate-200 bg-slate-50">
              <CardContent className="pt-6 text-center text-sm text-slate-500">
                Selecteer een medewerker om kosten te berekenen
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}