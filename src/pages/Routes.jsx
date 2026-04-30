import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Route as RouteIcon } from "lucide-react";

const WEEKDAY_LABELS = {
  1: "Maandag",
  2: "Dinsdag",
  3: "Woensdag",
  4: "Donderdag",
  5: "Vrijdag",
  6: "Zaterdag",
  7: "Zondag",
};
import { AnimatePresence, motion } from "framer-motion";
import PageHeader from "../components/ui-custom/PageHeader";
import EmptyState from "../components/ui-custom/EmptyState";
import RouteBuilder from "../components/routes/RouteBuilder";
import RouteAnalysisCard from "../components/routes/RouteAnalysisCard";
import UnassignedTasks from "../components/routes/UnassignedTasks";
import RouteFolderView from "../components/routes/RouteFolderView";
import FolderManagementBar from "../components/routes/FolderManagementBar";

export default function Routes() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const queryClient = useQueryClient();

  const { data: routes = [] } = useQuery({ queryKey: ["routes"], queryFn: () => base44.entities.Route.list() });
  const { data: folders = [] } = useQuery({ queryKey: ["folders"], queryFn: () => base44.entities.RouteFolder.list() });
  const { data: objects = [] } = useQuery({ queryKey: ["objects"], queryFn: () => base44.entities.SurveillanceObject.list() });
  const { data: personnel = [] } = useQuery({ queryKey: ["personnel"], queryFn: () => base44.entities.Personnel.list() });
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => base44.entities.Vehicle.list() });
  const { data: costSettings = [] } = useQuery({ queryKey: ["costSettings"], queryFn: () => base44.entities.CostSettings.list() });
  const { data: tasks = [] } = useQuery({ queryKey: ["all-tasks"], queryFn: () => base44.entities.Task.list() });
  const { data: collectiefs = [] } = useQuery({ queryKey: ["collectiefs"], queryFn: () => base44.entities.Collectief.list() });

  const cs = costSettings[0];

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Route.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["routes"] }); setShowForm(false); setEditing(null); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Route.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["routes"] }); setShowForm(false); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Route.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routes"] }),
  });

  const handleSave = (data) => {
    if (editing?.id) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Routes"
        subtitle="Bouw routes en analyseer winstgevendheid"
        actions={
          <div className="flex gap-2">
            <FolderManagementBar folders={folders} />
            <Button onClick={() => { setEditing(null); setShowForm(true); }} className="bg-slate-900 hover:bg-slate-800">
              <Plus className="w-4 h-4 mr-1" /> Nieuwe route
            </Button>
          </div>
        }
      />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <RouteBuilder route={editing} vehicles={vehicles} routes={routes} folders={folders} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null); }} />
          </motion.div>
        )}
      </AnimatePresence>

      {tasks && tasks.length > 0 && <UnassignedTasks tasks={tasks} routes={routes} objects={objects} collectiefs={collectiefs} />}

      <div className="border border-slate-200 rounded-xl bg-white p-6 min-h-[400px]">
        {folders.length > 0 ? (
          <RouteFolderView 
            routes={routes} 
            folders={folders} 
            vehicles={vehicles} 
            costSettings={cs} 
            onEdit={(route) => { setEditing(route); setShowForm(true); }} 
            onDelete={(id) => deleteMutation.mutate(id)}
            onAddRoute={(folderId, weekday) => {
              setEditing({
                folder_id: folderId,
                weekdays: [weekday],
                name: WEEKDAY_LABELS[weekday]
              });
              setShowForm(true);
            }}
          />
        ) : !showForm && (
          <div className="flex items-center justify-center h-[350px]">
            <EmptyState icon={RouteIcon} title="Geen routes" description="Maak eerst een uitschuifmap aan." />
          </div>
        )}
      </div>
    </div>
  );
}