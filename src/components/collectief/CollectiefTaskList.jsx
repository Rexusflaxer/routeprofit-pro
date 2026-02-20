import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Clock, Euro, Calendar, Scissors, Layers, Gift } from "lucide-react";
import CollectiefTaskForm from "./CollectiefTaskForm";

const WEEKDAY_LABELS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

export default function CollectiefTaskList({ collectief, objects, allCollectieven }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", "collectief", collectief.id],
    queryFn: () => base44.entities.Task.filter({ collectief_id: collectief.id }),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Task.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", "collectief", collectief.id] });
      setShowForm(false); setEditing(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", "collectief", collectief.id] });
      setShowForm(false); setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", "collectief", collectief.id] }),
  });

  const handleSave = (formData) => {
    const data = { ...formData, collectief_id: collectief.id };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const getPricePerMinute = (task) =>
    task.pricing_type === "per_minuut"
      ? task.price_amount || 0
      : task.duration_minutes > 0 ? (task.price_amount || 0) / task.duration_minutes : 0;

  const getItemCount = (task) =>
    (task.selected_object_ids?.length || 0) + (task.selected_sub_collectief_ids?.length || 0);

  const getTimePerItem = (task) => {
    const count = getItemCount(task);
    return count > 0 ? (task.duration_minutes / count).toFixed(1) : task.duration_minutes;
  };

  if (isLoading) return <div className="text-sm text-slate-500">Taken laden...</div>;

  return (
    <Card className="border-0 shadow-lg mt-4">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Taken voor dit collectief</CardTitle>
          <Button
            onClick={() => { setEditing(null); setShowForm(true); }}
            size="sm"
            className="bg-slate-900 hover:bg-slate-800"
          >
            <Plus className="w-4 h-4 mr-1" /> Taak toevoegen
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <CollectiefTaskForm
            task={editing}
            collectief={collectief}
            objects={objects}
            allCollectieven={allCollectieven}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        )}

        {tasks.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            Geen taken. Klik op "Taak toevoegen" om een ronde aan te maken.
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map(task => {
              const itemCount = getItemCount(task);
              const timePerItem = getTimePerItem(task);
              const windowCount = 1 + (task.extra_time_windows?.length || 0);

              return (
                <div key={task.id} className="border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <Badge variant="secondary" className="text-xs font-medium bg-slate-100 text-slate-800">
                          {task.task_type}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          €{getPricePerMinute(task).toFixed(2)}/min
                        </Badge>
                        {task.allow_split && (
                          <Badge className="text-xs bg-amber-50 text-amber-700 border border-amber-200">
                            <Scissors className="w-3 h-3 mr-1" /> Splits toegestaan
                          </Badge>
                        )}
                        {windowCount > 1 && (
                          <Badge className="text-xs bg-blue-50 text-blue-700 border border-blue-200">
                            {windowCount} tijdvensters
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{task.duration_minutes} min totaal</span>
                        </div>

                        {itemCount > 0 && (
                          <div className="flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-slate-400" />
                            <span>{itemCount} items · {timePerItem} min/item</span>
                          </div>
                        )}

                        {task.time_window_start && task.time_window_end && (
                          <div className="flex items-center gap-1.5 col-span-2">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{task.time_window_start} – {task.time_window_end}</span>
                            {task.extra_time_windows?.map((w, i) => (
                              <span key={i} className="text-slate-400">· {w.start} – {w.end}</span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-1.5">
                          <Euro className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {task.pricing_type === "per_taak"
                              ? `€${(task.price_amount || 0).toFixed(2)} per taak`
                              : `€${(task.price_amount || 0).toFixed(2)} per min`}
                          </span>
                        </div>

                        {task.weekdays?.length > 0 && (
                          <div className="flex items-center gap-1.5 col-span-2">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <div className="flex gap-1 flex-wrap">
                              {task.weekdays.sort((a, b) => a - b).map(day => (
                                <span key={day} className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-xs">
                                  {WEEKDAY_LABELS[day - 1]}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Selected items summary */}
                      {((task.selected_object_ids?.length > 0) || (task.selected_sub_collectief_ids?.length > 0)) && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {task.selected_object_ids?.map(oid => {
                            const obj = (objects || []).find(o => o.id === oid);
                            return obj ? (
                              <span key={oid} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                                {obj.object_code ? `[${obj.object_code}] ` : ""}{obj.name}
                              </span>
                            ) : null;
                          })}
                          {task.selected_sub_collectief_ids?.map(cid => {
                            const sub = (allCollectieven || []).find(c => c.id === cid);
                            return sub ? (
                              <span key={cid} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                                📦 {sub.name}
                              </span>
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-1 ml-3 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700"
                        onClick={() => { setEditing(task); setShowForm(true); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600"
                        onClick={() => deleteMutation.mutate(task.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}