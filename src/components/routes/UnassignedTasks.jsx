import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock, Euro, Package, ChevronDown, ChevronUp, Filter, X } from "lucide-react";

const WEEKDAYS = [
  { value: 1, label: "Ma" },
  { value: 2, label: "Di" },
  { value: 3, label: "Wo" },
  { value: 4, label: "Do" },
  { value: 5, label: "Vr" },
  { value: 6, label: "Za" },
  { value: 7, label: "Zo" },
];

export default function UnassignedTasks({ tasks, routes, objects, collectiefs }) {
  const [open, setOpen] = useState(false);
  const [selectedDays, setSelectedDays] = useState([]);
  const [selectedObjectIds, setSelectedObjectIds] = useState([]);

  const toggleValue = (value, setter) => {
    setter(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
  };

  const taskMatchesObject = (task, objectId) => {
    return task.object_id === objectId || (task.selected_object_ids || []).includes(objectId);
  };

  const unassignedTasks = useMemo(() => {
    // Verzamel welke taken op welke dagen al zijn toegewezen
    const taskDayUsage = {};
    
    routes.forEach(route => {
      (route.assigned_tasks || []).forEach(at => {
        if (!taskDayUsage[at.task_id]) {
          taskDayUsage[at.task_id] = [];
        }
        (at.days || []).forEach(day => {
          if (!taskDayUsage[at.task_id].includes(day)) {
            taskDayUsage[at.task_id].push(day);
          }
        });
      });
    });

    // Filter taken die nog niet volledig zijn toegewezen
    return tasks
      .map(task => {
        const taskWeekdays = task.weekdays || [];
        const usedDays = taskDayUsage[task.id] || [];
        const availableDays = taskWeekdays.filter(d => !usedDays.includes(d));
        
        return {
          ...task,
          availableDays,
          usedDays,
          isFullyAssigned: availableDays.length === 0 && taskWeekdays.length > 0
        };
      })
      .filter(task => !task.isFullyAssigned);
  }, [tasks, routes]);

  const objectOptions = useMemo(() => {
    return objects
      .filter(obj => unassignedTasks.some(task => taskMatchesObject(task, obj.id)))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [objects, unassignedTasks]);

  const filteredUnassignedTasks = useMemo(() => {
    return unassignedTasks.filter(task => {
      const dayMatch = selectedDays.length === 0 || (task.availableDays || []).some(day => selectedDays.includes(day));
      const objectMatch = selectedObjectIds.length === 0 || selectedObjectIds.some(objectId => taskMatchesObject(task, objectId));
      return dayMatch && objectMatch;
    });
  }, [unassignedTasks, selectedDays, selectedObjectIds]);

  const activeFilterCount = selectedDays.length + selectedObjectIds.length;

  const clearFilters = () => {
    setSelectedDays([]);
    setSelectedObjectIds([]);
  };

  const getObjectName = (task) => {
    const obj = objects.find(o => o.id === task.object_id);
    return obj ? obj.name : "Onbekend object";
  };

  const getCollectifName = (task) => {
    const collectief = collectiefs?.find(c => c.id === task.collectief_id);
    return collectief ? collectief.name : null;
  };

  const isCollectifTask = (task) => {
    return task.collectief_id && !task.object_id;
  };

  const getPricePerMinute = (task) => {
    if (task.is_free) return 0;
    if (task.pricing_type === 'per_minuut') {
      return task.price_amount || 0;
    } else {
      return task.duration_minutes > 0 ? (task.price_amount || 0) / task.duration_minutes : 0;
    }
  };

  if (unassignedTasks.length === 0) {
    return null;
  }

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-3 cursor-pointer select-none" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <CardTitle className="text-base">Nog niet toegewezen taken</CardTitle>
            <Badge className="bg-amber-100 text-amber-800 border-0">{filteredUnassignedTasks.length}/{unassignedTasks.length}</Badge>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </CardHeader>
      {open && (
      <CardContent>
        <div className="mb-4 space-y-3 rounded-lg border border-amber-200 bg-white/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-700">
              <Filter className="w-3.5 h-3.5" /> Filters
              {activeFilterCount > 0 && <span className="normal-case tracking-normal text-slate-500">({activeFilterCount} actief)</span>}
            </div>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
                <X className="w-3 h-3" /> Wissen
              </button>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Dag</p>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map(day => {
                const active = selectedDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    onClick={() => toggleValue(day.value, setSelectedDays)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${active ? 'border-amber-500 bg-amber-100 text-amber-800' : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300'}`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          {objectOptions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">Object</p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {objectOptions.map(obj => {
                  const active = selectedObjectIds.includes(obj.id);
                  return (
                    <button
                      key={obj.id}
                      onClick={() => toggleValue(obj.id, setSelectedObjectIds)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${active ? 'border-slate-700 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}
                    >
                      {obj.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {filteredUnassignedTasks.length === 0 ? (
            <div className="text-center py-6 text-sm text-slate-500 bg-white rounded-lg border border-slate-200">
              Geen taken gevonden met deze filters.
            </div>
          ) : filteredUnassignedTasks.map(task => (
            <div key={task.id} className="bg-white rounded-lg p-3 border border-slate-200">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                     {isCollectifTask(task) ? (
                       <>
                         <div className="flex items-center gap-1.5">
                           <Package className="w-4 h-4 text-blue-600" />
                           <span className="text-sm font-medium text-slate-900">{getCollectifName(task)}</span>
                         </div>
                         <Badge className="text-xs bg-blue-100 text-blue-800">
                           <Package className="w-3 h-3 mr-1" />
                           Collectief
                         </Badge>
                       </>
                     ) : (
                       <span className="text-sm font-medium text-slate-900">{getObjectName(task)}</span>
                     )}
                     <Badge variant="secondary" className="text-xs bg-slate-200 text-slate-700">
                       {task.task_type}
                     </Badge>
                   </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-2">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {task.duration_minutes} min
                    </span>
                    {task.is_free ? (
                      <Badge className="bg-green-50 text-green-700 border border-green-200 text-xs">
                        Service
                      </Badge>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Euro className="w-3 h-3" />
                        €{getPricePerMinute(task).toFixed(2)}/min
                      </span>
                    )}
                    {task.time_window_start && task.time_window_end && (
                      <span>{task.time_window_start} - {task.time_window_end}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    {task.availableDays && task.availableDays.length > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-amber-700 font-medium">Nog beschikbaar:</span>
                        <div className="flex gap-1">
                          {task.availableDays.map(d => (
                            <Badge key={d} className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0">
                              {WEEKDAYS.find(w => w.value === d)?.label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {task.usedDays && task.usedDays.length > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-green-700 font-medium">Toegewezen:</span>
                        <div className="flex gap-1">
                          {task.usedDays.map(d => (
                            <Badge key={d} className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0">
                              {WEEKDAYS.find(w => w.value === d)?.label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      )}
    </Card>
  );
}