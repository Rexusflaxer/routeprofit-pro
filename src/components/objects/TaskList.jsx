import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Clock, Euro, Calendar, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import TaskForm from "./TaskForm";

const WEEKDAY_LABELS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

export default function TaskList({ objectId }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', objectId],
    queryFn: () => base44.entities.Task.filter({ object_id: objectId }),
  });

  const { data: allCollectieven = [] } = useQuery({
    queryKey: ['collectieven'],
    queryFn: () => base44.entities.Collectief.list(),
  });

  const { data: allCollectiefTasks = [] } = useQuery({
    queryKey: ['all-tasks-list'],
    queryFn: () => base44.entities.Task.list(),
  });

  // Find collectief tasks where this object is in selected_object_ids
  const collectiefTasks = allCollectiefTasks.filter(
    t => t.collectief_id && (t.selected_object_ids || []).includes(objectId)
  );

  const getCollectiefName = (collectiefId) => {
    return allCollectieven.find(c => c.id === collectiefId)?.name || "Collectief";
  };

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Task.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', objectId] });
      setShowForm(false);
      setEditing(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', objectId] });
      setShowForm(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', objectId] });
    },
  });

  const handleSave = (taskData) => {
    const data = { ...taskData, object_id: objectId };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (task) => {
    setEditing(task);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditing(null);
  };

  const getPricePerMinute = (task) => {
    if (task.pricing_type === 'per_minuut') {
      return task.price_amount || 0;
    } else {
      return task.duration_minutes > 0 ? (task.price_amount || 0) / task.duration_minutes : 0;
    }
  };

  if (isLoading) {
    return <div className="text-sm text-slate-500">Taken laden...</div>;
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Taken voor dit object</CardTitle>
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
          <TaskForm 
            task={editing} 
            onSave={handleSave} 
            onCancel={handleCancel} 
          />
        )}

        {collectiefTasks.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Via collectief</p>
            {collectiefTasks.map(task => (
              <div key={task.id} className="border border-blue-200 bg-blue-50 rounded-lg p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Layers className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  <span className="text-xs text-blue-700 font-medium">{getCollectiefName(task.collectief_id)}</span>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">{task.task_type}</Badge>
                  {Number(task.repeat_count || 1) > 1 && (
                    <Badge className="text-xs bg-amber-50 text-amber-700 border border-amber-200">
                      {task.repeat_count}x binnen venster
                    </Badge>
                  )}
                  <span className="text-xs text-slate-500">{task.duration_minutes} min</span>
                  {task.is_free ? (
                    <Badge className="text-xs bg-green-50 text-green-700 border border-green-200">
                      Service
                    </Badge>
                  ) : null}
                  {(task.task_type === "Sluitbegeleiding" || (task.task_type === "Openingsronde" && task.use_arrival_deadline)) && task.arrival_deadline_time ? (
                    <span className="text-xs text-slate-500">Aankomst vóór {task.arrival_deadline_time}</span>
                  ) : task.time_window_start && task.time_window_end && (
                    <span className="text-xs text-slate-500">{task.time_window_start} - {task.time_window_end}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tasks.length === 0 && collectiefTasks.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            Geen taken toegevoegd. Klik op "Taak toevoegen" om te beginnen.
          </div>
        ) : tasks.length === 0 ? null : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className="text-xs font-medium bg-slate-100 text-slate-800">
                        {task.task_type}
                      </Badge>
                      {Number(task.repeat_count || 1) > 1 && (
                        <Badge className="text-xs bg-amber-50 text-amber-700 border border-amber-200">
                          {task.repeat_count}x binnen venster
                        </Badge>
                      )}
                      {task.is_free ? (
                        <Badge className="text-xs bg-green-50 text-green-700 border border-green-200">
                          Service
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          €{getPricePerMinute(task).toFixed(2)}/min
                        </Badge>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{task.duration_minutes} min</span>
                      </div>
                      
                      {!task.is_free && (
                        <div className="flex items-center gap-1.5">
                          <Euro className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {task.pricing_type === 'per_taak'
                              ? `€${(task.price_amount || 0).toFixed(2)} per taak`
                              : `€${(task.price_amount || 0).toFixed(2)} per min`}
                          </span>
                        </div>
                      )}

                      {(task.task_type === "Sluitbegeleiding" || (task.task_type === "Openingsronde" && task.use_arrival_deadline)) && task.arrival_deadline_time ? (
                        <div className="flex items-center gap-1.5 col-span-2">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>Aankomst vóór {task.arrival_deadline_time}</span>
                        </div>
                      ) : task.time_window_start && task.time_window_end && (
                        <div className="flex items-center gap-1.5 col-span-2">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{task.time_window_start} - {task.time_window_end}</span>
                        </div>
                      )}

                      {task.weekdays && task.weekdays.length > 0 && (
                        <div className="flex items-center gap-1.5 col-span-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <div className="flex gap-1">
                            {task.weekdays.sort((a, b) => a - b).map(day => (
                              <span key={day} className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-xs">
                                {WEEKDAY_LABELS[day - 1]}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-1 ml-4">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleEdit(task)}
                      className="h-8 w-8 text-slate-400 hover:text-slate-700"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => deleteMutation.mutate(task.id)}
                      className="h-8 w-8 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}