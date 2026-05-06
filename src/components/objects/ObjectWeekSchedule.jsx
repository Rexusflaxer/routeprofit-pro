import React from "react";
import { Clock, Pencil } from "lucide-react";

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

const HOUR_HEIGHT = 36;
const DAY_MINUTES = 24 * 60;
const HOURS = Array.from({ length: 25 }, (_, index) => index);

function getTaskPlacement(task) {
  const usesDeadline = task.task_type === "Sluitbegeleiding" || (task.task_type === "Openingsronde" && task.use_arrival_deadline);
  const start = usesDeadline
    ? timeToMinutes(task.arrival_deadline_time || task.time_window_start)
    : timeToMinutes(task.time_window_start);
  let end = usesDeadline
    ? start + Number(task.duration_minutes || 30)
    : timeToMinutes(task.time_window_end);

  if (!usesDeadline && task.time_window_end && end <= start) end = DAY_MINUTES;
  if (usesDeadline || !task.time_window_end) end = Math.max(end, start + Number(task.duration_minutes || 30));

  const clippedStart = Math.max(0, Math.min(DAY_MINUTES, start));
  const clippedEnd = Math.max(clippedStart + 15, Math.min(DAY_MINUTES, end));

  return {
    top: (clippedStart / 60) * HOUR_HEIGHT,
    height: Math.max(18, ((clippedEnd - clippedStart) / 60) * HOUR_HEIGHT),
  };
}

function CalendarTaskBlock({ task, onEdit }) {
  const placement = getTaskPlacement(task);

  return (
    <div
      className="absolute left-1 right-1 overflow-hidden rounded-md border border-blue-200 bg-blue-100/90 p-1.5 shadow-sm hover:bg-blue-100 hover:shadow-md transition-all group"
      style={{ top: placement.top + 2, height: Math.max(18, placement.height - 4) }}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-900">{task.task_type}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-700">
            <Clock className="w-3 h-3" /> {getTaskTime(task)}
          </p>
        </div>
        <button className="rounded p-1 text-slate-500 hover:bg-white/70 hover:text-slate-900" onClick={() => onEdit(task)}>
          <Pencil className="w-3 h-3" />
        </button>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">{task.duration_minutes || 0} min</span>
        {Number(task.repeat_count || 1) > 1 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{task.repeat_count}x</span>}
        {Number(task.min_minutes_between_other_tasks || 0) > 0 && <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">{task.min_minutes_between_other_tasks}m buffer</span>}
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

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[72px_repeat(7,minmax(120px,1fr))] border-b border-slate-200 bg-slate-50">
            <div className="border-r border-slate-200 px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Tijd</div>
            {WEEKDAYS.map(day => {
              const dayTasks = tasksForDay(day.value);
              return (
                <div key={day.value} className="border-r border-slate-200 px-3 py-3 last:border-r-0">
                  <p className="text-sm font-bold text-slate-900">{day.label}</p>
                  <p className="text-xs text-slate-400">{dayTasks.length} taak{dayTasks.length === 1 ? "" : "en"}</p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-[72px_repeat(7,minmax(120px,1fr))]">
            <div className="relative border-r border-slate-200 bg-slate-50" style={{ height: DAY_MINUTES / 60 * HOUR_HEIGHT }}>
              {HOURS.map(hour => (
                <div key={hour} className="absolute left-0 right-0 -translate-y-2 px-3 text-right text-xs font-medium text-slate-400" style={{ top: hour * HOUR_HEIGHT }}>
                  {String(hour).padStart(2, "0")}:00
                </div>
              ))}
            </div>

            {WEEKDAYS.map(day => {
              const dayTasks = tasksForDay(day.value);
              return (
                <div key={day.value} className="relative border-r border-slate-200 last:border-r-0" style={{ height: DAY_MINUTES / 60 * HOUR_HEIGHT }}>
                  {HOURS.map(hour => (
                    <div key={hour} className="absolute left-0 right-0 border-t border-slate-200" style={{ top: hour * HOUR_HEIGHT }} />
                  ))}
                  {dayTasks.map((task, index) => (
                    <CalendarTaskBlock key={`${task.id}-${day.value}-${index}`} task={task} onEdit={onEditTask} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}