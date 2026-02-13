import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Route as RouteIcon, Trash2, Pencil } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import PageHeader from "../components/ui-custom/PageHeader";
import EmptyState from "../components/ui-custom/EmptyState";
import RouteBuilder from "../components/routes/RouteBuilder";
import RouteAnalysisCard from "../components/routes/RouteAnalysisCard";

export default function Routes() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const queryClient = useQueryClient();

  const { data: routes = [] } = useQuery({ queryKey: ["routes"], queryFn: () => base44.entities.Route.list() });
  const { data: objects = [] } = useQuery({ queryKey: ["objects"], queryFn: () => base44.entities.SurveillanceObject.list() });
  const { data: personnel = [] } = useQuery({ queryKey: ["personnel"], queryFn: () => base44.entities.Personnel.list() });
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => base44.entities.Vehicle.list() });
  const { data: costSettings = [] } = useQuery({ queryKey: ["costSettings"], queryFn: () => base44.entities.CostSettings.list() });

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
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Routes"
        subtitle="Bouw routes en analyseer winstgevendheid"
        actions={
          <Button onClick={() => { setEditing(null); setShowForm(true); }} className="bg-slate-900 hover:bg-slate-800">
            <Plus className="w-4 h-4 mr-1" /> Nieuwe route
          </Button>
        }
      />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <RouteBuilder route={editing} vehicles={vehicles} routes={routes} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null); }} />
          </motion.div>
        )}
      </AnimatePresence>

      {routes.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {routes.map(route => (
            <div key={route.id} className="relative group">
              <RouteAnalysisCard route={route} vehicles={vehicles} costSettings={cs} />
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7 bg-white" onClick={() => { setEditing(route); setShowForm(true); }}>
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7 bg-white text-red-500 hover:text-red-700" onClick={() => deleteMutation.mutate(route.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : !showForm && (
        <EmptyState icon={RouteIcon} title="Geen routes" description="Maak uw eerste surveillanceroute aan." actionLabel="Route aanmaken" onAction={() => setShowForm(true)} />
      )}
    </div>
  );
}