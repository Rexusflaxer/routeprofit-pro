import React, { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Euro, MapPin, Plus } from "lucide-react";

export default function AddTaskDialog({ open, onOpenChange, route, tasks, objects, routes, onAddTask }) {
  const availableTasks = useMemo(() => {
    if (!route || !route.time_window_start || !route.time_window_end || !route.weekdays || route.weekdays.length === 0) {
      return [];
    }

    const selectedDay = route.weekdays[0];
    const routeStart = route.time_window_start;
    const routeEnd = route.time_window_end;
    
    // Verzamel alle al toegewezen taken
    const assignedTaskIds = (route.assigned_tasks || []).map(at => at.task_id);

    // Vind taken die al in andere routes zitten op dezelfde dag
    const taskDayUsage = {};
    routes.forEach(r => {
      if (r.id === route.id) return; // Skip huidige route
      
      (r.assigned_tasks || []).forEach(at => {
        if (!taskDayUsage[at.task_id]) taskDayUsage[at.task_id] = [];
        (at.days || []).forEach(day => {
          if (!taskDayUsage[at.task_id].includes(day)) {
            taskDayUsage[at.task_id].push(day);
          }
        });
      });
    });

    // Filter taken
    return tasks.filter(task => {
      // Check of taak al in deze route zit
      if (assignedTaskIds.includes(task.id)) return false;

      // Check of taak binnen tijdsvenster past
      const taskStart = task.time_window_start || "00:00";
      const taskEnd = task.time_window_end || "23:59";
      const fitsInWindow = taskStart >= routeStart && taskEnd <= routeEnd;
      if (!fitsInWindow) return false;

      // Check of taak op deze dag mag
      const taskWeekdays = task.weekdays || [];
      if (!taskWeekdays.includes(selectedDay)) return false;
      
      // Check of deze dag al gebruikt is in andere route
      const usedDays = taskDayUsage[task.id] || [];
      if (usedDays.includes(selectedDay)) return false;
      
      return true;
    });
  }, [tasks, route, routes]);

  const getObjectName = (task) => {
    const obj = objects.find(o => o.id === task.object_id);
    return obj ? obj.name : "Onbekend object";
  };

  const getObjectAddress = (task) => {
    const obj = objects.find(o => o.id === task.object_id);
    return obj ? obj.address : "";
  };

  const getPricePerMinute = (task) => {
    if (task.pricing_type === 'per_minuut') {
      return task.price_amount || 0;
    } else {
      return task.duration_minutes > 0 ? (task.price_amount || 0) / task.duration_minutes : 0;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Taak toevoegen</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-3 mt-4">
          {availableTasks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-slate-500">
                Geen beschikbare taken voor deze dag en tijdsvenster
              </p>
            </div>
          ) : (
            availableTasks.map(task => (
              <div 
                key={task.id} 
                className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
              >
                <MapPin className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{getObjectName(task)}</p>
                  <p className="text-xs text-slate-500 mb-2">{getObjectAddress(task)}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {task.task_type}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <Clock className="w-3 h-3 mr-1" />
                      {task.duration_minutes} min
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <Euro className="w-3 h-3 mr-1" />
                      €{getPricePerMinute(task).toFixed(2)}/min
                    </Badge>
                    {task.time_window_start && task.time_window_end && (
                      <Badge variant="outline" className="text-xs">
                        {task.time_window_start} - {task.time_window_end}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  className="bg-slate-900 hover:bg-slate-800 flex-shrink-0"
                  onClick={() => {
                    onAddTask(task.id);
                    onOpenChange(false);
                  }}
                >
                  <Plus className="w-4 h-4 mr-1" /> Toevoegen
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}