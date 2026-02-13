import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, Euro, Pencil, X } from "lucide-react";

const WEEKDAY_LABELS = {
  1: "Maandag",
  2: "Dinsdag",
  3: "Woensdag",
  4: "Donderdag",
  5: "Vrijdag",
  6: "Zaterdag",
  7: "Zondag",
};

export default function RouteDetailDialog({ route, open, onOpenChange, onEdit, vehicles }) {
  const { data: allTasks = [] } = useQuery({
    queryKey: ['all-tasks'],
    queryFn: () => base44.entities.Task.list(),
  });

  const { data: objects = [] } = useQuery({
    queryKey: ['objects'],
    queryFn: () => base44.entities.SurveillanceObject.list(),
  });

  const routeDetails = useMemo(() => {
    if (!route) return null;

    const assignedTaskIds = (route.assigned_tasks || []).map(at => at.task_id);
    const routeTasks = allTasks.filter(t => assignedTaskIds.includes(t.id));
    
    const totalServiceMin = routeTasks.reduce((s, t) => s + (t.duration_minutes || 0), 0);
    const vehicle = vehicles.find(v => v.id === route.vehicle_id);

    return {
      routeTasks,
      totalServiceMin,
      vehicle
    };
  }, [route, allTasks, vehicles]);

  if (!routeDetails || !route) return null;

  const getObjectName = (taskId) => {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return "Onbekend";
    const obj = objects.find(o => o.id === task.object_id);
    return obj ? obj.name : "Onbekend object";
  };

  const getTaskInfo = (taskId) => {
    return allTasks.find(t => t.id === taskId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>{route.name}</DialogTitle>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="h-6 w-6">
            <X className="w-4 h-4" />
          </Button>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basisgegevens */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dag</p>
              <p className="text-sm font-medium text-slate-900 mt-1">
                {route.weekdays?.map(d => WEEKDAY_LABELS[d]).join(", ")}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Voertuig</p>
              <p className="text-sm font-medium text-slate-900 mt-1">
                {routeDetails.vehicle ? `${routeDetails.vehicle.license_plate}` : "Niet ingesteld"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tijdsvenster</p>
              <p className="text-sm font-medium text-slate-900 mt-1">
                {route.time_window_start} - {route.time_window_end}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Taken</p>
              <p className="text-sm font-medium text-slate-900 mt-1">
                {routeDetails.routeTasks.length} taken
              </p>
            </div>
          </div>

          {/* Diensttijd */}
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-slate-700 font-medium">
              <Clock className="w-4 h-4" />
              Totale diensttijd: {routeDetails.totalServiceMin} minuten
            </div>
          </div>

          {/* Taken */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Taken op deze route</h3>
            <div className="space-y-2">
              {routeDetails.routeTasks.map(task => {
                const assignment = (route.assigned_tasks || []).find(at => at.task_id === task.id);
                const taskInfo = getTaskInfo(task.id);
                
                return (
                  <div key={task.id} className="border border-slate-200 rounded-lg p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-slate-900">{getObjectName(task.id)}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{taskInfo?.task_type}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {assignment?.days?.length || 0}x/week
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {task.duration_minutes} min
                      </span>
                      <span className="flex items-center gap-1">
                        <Euro className="w-3 h-3" />
                        €{task.price_amount || 0}
                      </span>
                      {taskInfo?.time_window_start && (
                        <span>{taskInfo.time_window_start} - {taskInfo.time_window_end}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Opmerkingen */}
          {route.notes && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Opmerkingen</p>
              <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{route.notes}</p>
            </div>
          )}

          {/* Bewerk knop */}
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Sluiten</Button>
            <Button onClick={() => { onEdit(route); onOpenChange(false); }} className="gap-2 bg-slate-900 hover:bg-slate-800">
              <Pencil className="w-4 h-4" />
              Bewerken
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}