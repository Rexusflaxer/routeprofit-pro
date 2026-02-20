import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, MapPin, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "../components/ui-custom/PageHeader";
import EmptyState from "../components/ui-custom/EmptyState";
import ObjectForm from "../components/objects/ObjectForm";
import ObjectTable from "../components/objects/ObjectTable";
import TaskList from "../components/objects/TaskList";

export default function Objects() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showTasks, setShowTasks] = useState(false);
  const [taskObject, setTaskObject] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
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

  const handleViewTasks = (obj) => {
    setTaskObject(obj);
    setShowTasks(true);
  };

  const filteredObjects = objects.filter(obj =>
    obj.object_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    obj.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    obj.address?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Object bewerken" : "Nieuw object"}</DialogTitle>
          </DialogHeader>
          <ObjectForm object={editing} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null); }} />
        </DialogContent>
      </Dialog>

      <Dialog open={showTasks} onOpenChange={setShowTasks}>
         <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
           <DialogHeader>
             <DialogTitle>Taken voor {taskObject?.name}</DialogTitle>
           </DialogHeader>
           {taskObject && <TaskList objectId={taskObject.id} />}
         </DialogContent>
       </Dialog>

       {objects.length > 0 && (
         <div className="space-y-4">
           <div className="relative">
             <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
             <Input
               placeholder="Zoek op objectcode, naam of adres..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="pl-9 pr-9"
             />
             {searchTerm && (
               <button
                 onClick={() => setSearchTerm("")}
                 className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
               >
                 <X className="h-4 w-4" />
               </button>
             )}
           </div>
           <ObjectTable objects={filteredObjects} onEdit={handleEdit} onDelete={(id) => deleteMutation.mutate(id)} />
         </div>
       )}

       {objects.length > 0 && filteredObjects.length === 0 && (
         <EmptyState icon={MapPin} title="Geen resultaten" description={`Geen objecten gevonden met "${searchTerm}".`} />
       )}
      ) : !showForm && (
        <EmptyState icon={MapPin} title="Geen objecten" description="Voeg uw eerste bewakingsobject toe om te beginnen." actionLabel="Object toevoegen" onAction={() => setShowForm(true)} />
      )}
    </div>
  );
}