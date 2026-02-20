import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, MapPin } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import PageHeader from "../components/ui-custom/PageHeader";
import EmptyState from "../components/ui-custom/EmptyState";
import ObjectForm from "../components/objects/ObjectForm";
import ObjectTable from "../components/objects/ObjectTable";

export default function Objects() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const queryClient = useQueryClient();

  const { data: objects = [], isLoading } = useQuery({
    queryKey: ["objects"],
    queryFn: () => base44.entities.SurveillanceObject.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.SurveillanceObject.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["objects"] }); setShowForm(false); setEditing(null); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.SurveillanceObject.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["objects"] }); setShowForm(false); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.SurveillanceObject.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["objects"] }),
  });

  const handleSave = (data) => {
    // Controleer op dubbele objectcode
    if (data.object_code && data.object_code.trim() !== "") {
      const duplicate = objects.find(
        obj => obj.object_code?.trim().toLowerCase() === data.object_code.trim().toLowerCase()
          && obj.id !== editing?.id
      );
      if (duplicate) {
        alert(`Objectcode "${data.object_code}" is al in gebruik bij object "${duplicate.name}". Kies een unieke objectcode.`);
        return;
      }
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (obj) => {
    setEditing(obj);
    setShowForm(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Objecten"
        subtitle="Beheer de te bewaken locaties"
        actions={
          <Button onClick={() => { setEditing(null); setShowForm(true); }} className="bg-slate-900 hover:bg-slate-800">
            <Plus className="w-4 h-4 mr-1" /> Nieuw object
          </Button>
        }
      />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <ObjectForm object={editing} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null); }} />
          </motion.div>
        )}
      </AnimatePresence>

      {objects.length > 0 ? (
        <ObjectTable objects={objects} onEdit={handleEdit} onDelete={(id) => deleteMutation.mutate(id)} />
      ) : !showForm && (
        <EmptyState icon={MapPin} title="Geen objecten" description="Voeg uw eerste bewakingsobject toe om te beginnen." actionLabel="Object toevoegen" onAction={() => setShowForm(true)} />
      )}
    </div>
  );
}