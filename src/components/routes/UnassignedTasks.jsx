import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock, Euro, Package } from "lucide-react";

const WEEKDAYS = [
  { value: 1, label: "Ma" },
  { value: 2, label: "Di" },
  { value: 3, label: "Wo" },
  { value: 4, label: "Do" },
  { value: 5, label: "Vr" },
  { value: 6, label: "Za" },
  { value: 7, label: "Zo" },
];

export default function UnassignedTasks({ tasks, routes, objects }) {
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

  const getObjectName = (task) => {
    const obj = objects.find(o => o.id === task.object_id);
    return obj ? obj.name : "Onbekend object";
  };

  const getPricePerMinute = (task) => {
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
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-amber-600" />
          <CardTitle className="text-lg">Nog niet toegewezen taken</CardTitle>
        </div>
        <p className="text-sm text-slate-600 mt-1">
          {unassignedTasks.length} {unassignedTasks.length === 1 ? 'taak heeft' : 'taken hebben'} nog beschikbare dagen
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {unassignedTasks.map(task => (
            <div key={task.id} className="bg-white rounded-lg p-3 border border-slate-200">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-medium text-slate-900">{getObjectName(task)}</span>
                    <Badge variant="secondary" className="text-xs bg-slate-200 text-slate-700">
                      {task.task_type}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-2">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {task.duration_minutes} min
                    </span>
                    <span className="flex items-center gap-1">
                      <Euro className="w-3 h-3" />
                      €{getPricePerMinute(task).toFixed(2)}/min
                    </span>
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
    </Card>
  );
}