import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Clock, Euro, MapPin, Plus } from "lucide-react";

export default function AddTaskDialog({ open, onOpenChange, route, tasks, objects, collectiefs = [], routes, onAddTask }) {
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);

  const availableTasks = useMemo(() => {
    if (!route || !route.time_window_start || !route.time_window_end || !route.weekdays || route.weekdays.length === 0) {
      return [];
    }

    const selectedDay = route.weekdays[0];
    const nextDay = selectedDay === 7 ? 1 : selectedDay + 1;

    const toMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

    const routeStartMin = toMinutes(route.time_window_start);
    let routeEndMin = toMinutes(route.time_window_end);
    const routeCrossesMiddnight = routeEndMin <= routeStartMin;
    if (routeCrossesMiddnight) routeEndMin += 24 * 60;

    // Verzamel alle al toegewezen taken
    const assignedTaskIds = (route.assigned_tasks || []).map(at => at.task_id);

    // Vind taken die al in andere routes zitten op dezelfde dag
    const taskDayUsage = {};
    routes.forEach(r => {
      if (r.id === route.id) return;
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

      // Check of taak op de juiste dag(en) is
      const taskWeekdays = task.weekdays || [];
      const onSelectedDay = taskWeekdays.includes(selectedDay);
      const onNextDay = routeCrossesMiddnight && taskWeekdays.includes(nextDay);
      if (!onSelectedDay && !onNextDay) return false;

      // Check of taak al gebruikt is in andere route op die dag
      const usedDays = taskDayUsage[task.id] || [];
      const dayToCheck = onNextDay && !onSelectedDay ? nextDay : selectedDay;
      if (usedDays.includes(dayToCheck)) return false;

      // Check of taak qua tijdvenster binnen de route past (middernacht-bewust)
      const taskStartStr = task.time_window_start || "00:00";
      const taskEndStr = task.time_window_end || "23:59";
      let taskStartMin = toMinutes(taskStartStr);
      let taskEndMin = toMinutes(taskEndStr);

      // Als de taak op de volgende dag valt, schuif de tijden 24u op
      if (onNextDay && !onSelectedDay) {
        taskStartMin += 24 * 60;
        taskEndMin += 24 * 60;
      } else if (taskEndMin <= taskStartMin) {
        // Taak zelf overschrijdt middernacht
        taskEndMin += 24 * 60;
      }

      // Taak moet overlappen met het routetijdvenster
      const fitsInWindow = taskStartMin < routeEndMin && taskEndMin > routeStartMin;
      if (!fitsInWindow) return false;

      return true;
    });
  }, [tasks, route, routes]);

  const getObjectName = (task) => {
    if (task.collectief_id) {
      const col = collectiefs.find(c => c.id === task.collectief_id);
      return col ? col.name : "Onbekend collectief";
    }
    const obj = objects.find(o => o.id === task.object_id);
    return obj ? obj.name : "Onbekend object";
  };

  const getObjectAddress = (task) => {
    if (task.collectief_id) {
      const col = collectiefs.find(c => c.id === task.collectief_id);
      return col?.address || "";
    }
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

  const handleOpenChange = (isOpen) => {
    if (!isOpen) {
      setSelectedTaskIds([]);
    }
    onOpenChange(isOpen);
  };

  const toggleTask = (taskId) => {
    setSelectedTaskIds(prev => 
      prev.includes(taskId) 
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const handleAddSelected = () => {
    if (selectedTaskIds.length > 0) {
      onAddTask(selectedTaskIds);
      setSelectedTaskIds([]);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Taken toevoegen</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-3 mt-4 overflow-y-auto flex-1">
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
                className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                  selectedTaskIds.includes(task.id)
                    ? 'bg-blue-50 border-blue-500'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                }`}
                onClick={() => toggleTask(task.id)}
              >
                <Checkbox 
                  checked={selectedTaskIds.includes(task.id)}
                  onCheckedChange={() => toggleTask(task.id)}
                  className="mt-1"
                />
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
              </div>
            ))
          )}
        </div>

        {availableTasks.length > 0 && (
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Annuleren
            </Button>
            <Button 
              onClick={handleAddSelected}
              disabled={selectedTaskIds.length === 0}
              className="bg-slate-900 hover:bg-slate-800"
            >
              <Plus className="w-4 h-4 mr-1" />
              {selectedTaskIds.length > 0 
                ? `${selectedTaskIds.length} ${selectedTaskIds.length === 1 ? 'taak' : 'taken'} toevoegen`
                : 'Selecteer taken'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}