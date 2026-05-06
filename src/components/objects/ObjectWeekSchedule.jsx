import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Pencil, Repeat, GitCompareArrows } from "lucide-react";

const WEEKDAYS = [
  { value: 1, label: "Maandag", short: "Ma" },
  { value: 2, label: "Dinsdag", short: "Di" },
  { value: 3, label: "Woensdag", short: "Wo" },
  { value: 4, label: "Donderdag", short: "Do" },
  { value: 5, label: "Vrijdag", short: "Vr" },
  { value: 6, label: "Zaterdag", short: "Za" },
  { value: 7, label: "Zondag", short: "Zo" },
];

const timeToMinutes = (time) => {
  if (!time) return 0;
  const [hours, minutes] = String(time).split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
};

function getTaskTime(task) {
  const usesDeadline = task.task_type === "Sluitbegeleiding" || (task.task_type === "Openingsronde" && task.use_arrival_deadline);
  if (usesDeadline && task.arrival_deadline_time) return `Aankomst vóór ${task.arrival_deadline_time}`;
  if (task.time_window_start && task.time_window_end) return `${task.time_window_start} – ${task.time_window_end}`;
  return "Geen tijdvenster";
}

function TaskScheduleCard({ task, onEdit }) {
  return (
    <div className="group rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-slate-300 hover:shadow-md transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 leading-snug">{task.task_type}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5" />
            <span>{getTaskTime(task)}</span>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-900" onClick={() => onEdit(task)}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="outline" className="text-[11px]">{task.duration_minutes || 0} min</Badge>
        {Number(task.repeat_count || 1) > 1 && (
          <Badge className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200">
            <Repeat className="w-3 h-3 mr-1" /> {task.repeat_count}x · {task.min_minutes_between_visits || 0} min herhaling
          </Badge>
        )}
        {Number(task.min_minutes_between_other_tasks || 0) > 0 && (
          <Badge className="text-[11px] bg-blue-50 text-blue-700 border border-blue-200">
            <GitCompareArrows className="w-3 h-3 mr-1" /> {task.min_minutes_between_other_tasks} min buffer
          </Badge>
        )}
      </div>
    </div>
  );
}

export default function ObjectWeekSchedule({ tasks, onEditTask }) {
  const tasksForDay = (day) => tasks
    .filter(task => !task.weekdays?.length || task.weekdays.includes(day))
    .sort((a, b) => timeToMinutes(a.arrival_deadline_time || a.time_window_start) - timeToMinutes(b.arrival_deadline_time || b.time_window_start));

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Weekplanning taken</h3>
          <p className="text-sm text-slate-500">Taken per dag, inclusief herhalingsafstand en buffer tussen verschillende taken.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
        {WEEKDAYS.map(day => {
          const dayTasks = tasksForDay(day.value);
          return (
            <div key={day.value} className="min-h-[220px] rounded-xl border border-slate-200 bg-white/70 p-3">
              <div className="sticky top-0 z-10 mb-3 flex items-center justify-between border-b border-slate-100 bg-white/80 pb-2 backdrop-blur">
                <div>
                  <p className="text-sm font-bold text-slate-900">{day.label}</p>
                  <p className="text-xs text-slate-400">{dayTasks.length} taak{dayTasks.length === 1 ? "" : "en"}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{day.short}</span>
              </div>

              <div className="space-y-3">
                {dayTasks.map((task, index) => (
                  <div key={`${task.id}-${day.value}-${index}`} className="relative">
                    {index > 0 && <div className="mx-auto mb-2 h-4 w-px border-l border-dashed border-slate-300" />}
                    <TaskScheduleCard task={task} onEdit={onEditTask} />
                  </div>
                ))}
                {dayTasks.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-xs text-slate-400">
                    Geen taken
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}