import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Clock, Euro, MapPin, Plus } from "lucide-react";

export default function AddTaskDialog({ open, onOpenChange, route, tasks, objects, collectiefs = [], routes, onAddTask }) {
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [repeatChoices, setRepeatChoices] = useState({});

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
    const assignedTaskIds = new Set((route.assigned_tasks || []).map(at => String(at.task_id)));

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
      // Voorkom dat dezelfde taak automatisch meerdere keren in dezelfde route komt
      if (assignedTaskIds.has(String(task.id))) return false;

      // Check of taak op de juiste dag(en) is
      const taskWeekdays = task.weekdays || [];
      const onSelectedDay = taskWeekdays.includes(selectedDay);
      const onNextDay = routeCrossesMiddnight && taskWeekdays.includes(nextDay);
      if (!onSelectedDay && !onNextDay) return false;

      // Check of taak al gebruikt is in andere route op die dag
      const usedDays = taskDayUsage[task.id] || [];
      const dayToCheck = onNextDay && !onSelectedDay ? nextDay : selectedDay;
      if (usedDays.includes(dayToCheck)) return false;

      // Check of taak qua tijdvenster/deadline binnen de route past (middernacht-bewust)
      const usesDeadline = task.task_type === "Sluitbegeleiding" || (task.task_type === "Openingsronde" && task.use_arrival_deadline && task.arrival_deadline_time);
      const taskStartStr = usesDeadline ? "00:00" : (task.time_window_start || "00:00");
      const taskEndStr = usesDeadline ? (task.arrival_deadline_time || "23:59") : (task.time_window_end || "23:59");
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
      setRepeatChoices({});
    }
    onOpenChange(isOpen);
  };

  const toggleTask = (taskId) => {
    const task = tasks.find(item => String(item.id) === String(taskId));
    setSelectedTaskIds(prev => {
      if (prev.includes(taskId)) {
        setRepeatChoices(current => {
          const next = { ...current };
          delete next[taskId];
          return next;
        });
        return prev.filter(id => id !== taskId);
      }

      if (Number(task?.repeat_count || 1) > 1) {
        setRepeatChoices(current => ({
          ...current,
          [taskId]: { mode: "single", repeat_index: 1 }
        }));
      }

      return [...prev, taskId];
    });
  };

  const handleRepeatChoiceChange = (taskId, patch) => {
    setRepeatChoices(prev => ({
      ...prev,
      [taskId]: { mode: "single", repeat_index: 1, ...(prev[taskId] || {}), ...patch }
    }));
  };

  const buildAssignment = (taskId) => {
    const task = tasks.find(item => String(item.id) === String(taskId));
    const repeatCount = Math.max(1, Number(task?.repeat_count || 1));
    const choice = repeatChoices[taskId] || { mode: "single", repeat_index: 1 };
    const base = {
      task_id: String(taskId),
      locked_to_route: true,
    };

    if (repeatCount <= 1 || choice.mode === "single") {
      return { ...base, locked_occurrence_count: 1 };
    }

    if (choice.mode === "specific") {
      return { ...base, repeat_index: Number(choice.repeat_index || 1), locked_occurrence_count: 1 };
    }

    return { ...base, lock_all_occurrences: true, locked_occurrence_count: repeatCount };
  };

  const handleAddSelected = () => {
    if (selectedTaskIds.length > 0) {
      onAddTask(selectedTaskIds.map(buildAssignment));
      setSelectedTaskIds([]);
      setRepeatChoices({});
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
            availableTasks.map(task => {
              const repeatCount = Math.max(1, Number(task.repeat_count || 1));
              const isSelected = selectedTaskIds.includes(task.id);
              const repeatChoice = repeatChoices[task.id] || { mode: "single", repeat_index: 1 };
              return (
              <div 
                key={task.id} 
                className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                  isSelected
                   ? 'bg-blue-50 border-blue-500'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                }`}
                onClick={() => toggleTask(task.id)}
              >
                <Checkbox 
                  checked={isSelected}
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
                    {(task.task_type === "Sluitbegeleiding" || (task.task_type === "Openingsronde" && task.use_arrival_deadline)) && task.arrival_deadline_time ? (
                      <Badge variant="outline" className="text-xs">
                        Aankomst vóór {task.arrival_deadline_time}
                      </Badge>
                    ) : task.time_window_start && task.time_window_end && (
                      <Badge variant="outline" className="text-xs">
                        {task.time_window_start} - {task.time_window_end}
                      </Badge>
                    )}
                    {repeatCount > 1 && (
                      <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-200">
                        {repeatCount} uitvoeringen
                      </Badge>
                    )}
                  </div>

                  {isSelected && repeatCount > 1 && (
                    <div className="mt-3 rounded-lg bg-white border border-blue-200 p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                      <p className="text-sm font-semibold text-slate-900">Deze taak heeft meerdere uitvoeringen</p>
                      <div className="space-y-2 text-sm text-slate-700">
                        <label className="flex items-center gap-2">
                          <input type="radio" name={`repeat-${task.id}`} checked={repeatChoice.mode === "single"} onChange={() => handleRepeatChoiceChange(task.id, { mode: "single", repeat_index: 1 })} />
                          Eén uitvoering vastzetten
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="radio" name={`repeat-${task.id}`} checked={repeatChoice.mode === "specific"} onChange={() => handleRepeatChoiceChange(task.id, { mode: "specific", repeat_index: 1 })} />
                          Specifieke uitvoering kiezen
                        </label>
                        {repeatChoice.mode === "specific" && (
                          <div className="ml-6 flex flex-wrap gap-2">
                            {Array.from({ length: repeatCount }, (_, i) => i + 1).map(index => (
                              <Button key={index} type="button" size="sm" variant={Number(repeatChoice.repeat_index || 1) === index ? "default" : "outline"} onClick={() => handleRepeatChoiceChange(task.id, { repeat_index: index })}>
                                Uitvoering {index}/{repeatCount}
                              </Button>
                            ))}
                          </div>
                        )}
                        <label className="flex items-center gap-2">
                          <input type="radio" name={`repeat-${task.id}`} checked={repeatChoice.mode === "all"} onChange={() => handleRepeatChoiceChange(task.id, { mode: "all" })} />
                          Alle uitvoeringen vastzetten
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
            })
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