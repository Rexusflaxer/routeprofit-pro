import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, MapPin, Clock, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { AnimatePresence, motion } from "framer-motion";
import PageHeader from "../components/ui-custom/PageHeader";
import RouteBuilder from "../components/routes/RouteBuilder";
import UnassignedTasks from "../components/routes/UnassignedTasks";
import FleetOptimizerPanel from "../components/routes/FleetOptimizerPanel";



const WEEKDAYS = [
  { value: 1, label: "Maandag" },
  { value: 2, label: "Dinsdag" },
  { value: 3, label: "Woensdag" },
  { value: 4, label: "Donderdag" },
  { value: 5, label: "Vrijdag" },
  { value: 6, label: "Zaterdag" },
  { value: 7, label: "Zondag" },
];

export default function Routes() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [activeDay, setActiveDay] = useState(1);
  const [showOptimizer, setShowOptimizer] = useState(false);
  const queryClient = useQueryClient();

  const { data: routes = [] } = useQuery({ queryKey: ["routes"], queryFn: () => base44.entities.Route.list() });
  const { data: folders = [] } = useQuery({ queryKey: ["folders"], queryFn: () => base44.entities.RouteFolder.list() });
  const { data: objects = [] } = useQuery({ queryKey: ["objects"], queryFn: () => base44.entities.SurveillanceObject.list() });
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => base44.entities.Vehicle.list() });
  const { data: tasks = [] } = useQuery({ queryKey: ["all-tasks"], queryFn: () => base44.entities.Task.list() });
  const { data: collectiefs = [] } = useQuery({ queryKey: ["collectiefs"], queryFn: () => base44.entities.Collectief.list() });

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
    const routeName = data.name?.trim() || "Lege route";
    if (editing?.id) {
      updateMutation.mutate({ id: editing.id, data: { ...data, name: routeName } });
    } else if (data.weekdays?.length > 1) {
      Promise.all(
        data.weekdays.map(day =>
          base44.entities.Route.create({ ...data, weekdays: [day], name: routeName })
        )
      ).then(() => {
        queryClient.invalidateQueries({ queryKey: ["routes"] });
        setShowForm(false);
        setEditing(null);
      });
    } else {
      createMutation.mutate({ ...data, name: routeName });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Routes"
        subtitle="Bouw routes en analyseer winstgevendheid"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setShowOptimizer(!showOptimizer); setShowForm(false); }} className="border-blue-300 text-blue-700 hover:bg-blue-50">
              <Zap className="w-4 h-4 mr-1" /> Google plannen
            </Button>
            <Button onClick={() => { setEditing(null); setShowForm(true); setShowOptimizer(false); }} className="bg-slate-900 hover:bg-slate-800">
              <Plus className="w-4 h-4 mr-1" /> Handmatig
            </Button>
          </div>
        }
      />

      <AnimatePresence>
        {showOptimizer && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <FleetOptimizerPanel
              onRoutesCreated={() => queryClient.invalidateQueries({ queryKey: ["routes"] })}
              onClose={() => setShowOptimizer(false)}
            />
          </motion.div>
        )}
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <RouteBuilder route={editing} vehicles={vehicles} routes={routes} folders={folders} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null); }} />
          </motion.div>
        )}
      </AnimatePresence>

      {tasks.length > 0 && <UnassignedTasks tasks={tasks} routes={routes} objects={objects} collectiefs={collectiefs} />}

      <div>
        {/* Dag-tabs horizontaal */}
        <div className="flex gap-1 border-b border-slate-200 mb-5 overflow-x-auto">
          {WEEKDAYS.map(day => {
            const count = routes.filter(r => r.weekdays?.includes(day.value)).length;
            const isActive = activeDay === day.value;
            return (
              <button
                key={day.value}
                onClick={() => setActiveDay(day.value)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
              >
                {day.label}
                {count > 0 && (
                  <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${isActive ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Routes voor de actieve dag */}
        {(() => {
          const dayRoutes = routes.filter(r => r.weekdays?.includes(activeDay));
          const dayLabel = WEEKDAYS.find(d => d.value === activeDay)?.label;
          return (
            <div>
              <div className="flex items-center justify-end mb-3">
                <button
                  onClick={() => { setEditing({ weekdays: [activeDay] }); setShowForm(true); }}
                  className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Route toevoegen
                </button>
              </div>
              {dayRoutes.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Geen routes gepland voor {dayLabel}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {dayRoutes.map(route => (
                    <div key={route.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow group">
                      <div className="flex items-start justify-between gap-2">
                        <Link to={createPageUrl(`RouteDetails?id=${route.id}`)} className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{route.name || 'Naamloze route'}</p>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                            {route.time_window_start && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {route.time_window_start} – {route.time_window_end}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {route.assigned_tasks?.length || 0} taken
                            </span>
                          </div>
                        </Link>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(route); setShowForm(true); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => deleteMutation.mutate(route.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}