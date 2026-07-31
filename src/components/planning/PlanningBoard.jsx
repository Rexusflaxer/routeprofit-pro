import React, { useMemo } from "react";
import { AlertTriangle, CalendarX2, MapPin, Route, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import PlanningShiftCard from "./PlanningShiftCard";

const dateFormatter = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" });
const shortDateFormatter = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });
const weekFormatter = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayName(personnel) {
  return personnel?.name
    || personnel?.display_name
    || [personnel?.call_name || personnel?.first_name, personnel?.name_prefix, personnel?.last_name]
      .filter(Boolean)
      .join(" ")
    || "Onbekende medewerker";
}

function assignmentWarnings(assignment) {
  return Array.isArray(assignment?.warnings)
    ? assignment.warnings
    : Array.isArray(assignment?.warning_snapshot)
    ? assignment.warning_snapshot
    : [];
}

function GroupLabel({ group, perspective }) {
  const Icon = group.icon || (perspective === "employee" ? UserRound : MapPin);
  return (
    <div className="sticky left-0 z-20 flex min-h-full w-[190px] shrink-0 items-start gap-2 border-r border-border bg-card px-2.5 py-2.5 shadow-[4px_0_10px_rgba(15,23,42,0.025)]">
      <span className={cn(
        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
        group.key === "vacant" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" : "bg-muted text-muted-foreground",
      )}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold text-foreground" title={group.label}>{group.label}</p>
        <p className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-muted-foreground">{group.subtitle}</p>
        {group.meta && <p className="mt-1 text-[9px] font-semibold text-primary">{group.meta}</p>}
      </div>
    </div>
  );
}

function DayHeader({ day, today }) {
  const isToday = dateKey(day) === dateKey(today);
  return (
    <div className={cn(
      "border-r border-border px-2 py-2 text-center last:border-r-0",
      isToday && "bg-primary/7",
    )}>
      <p className={cn("text-[10px] font-semibold capitalize text-muted-foreground", isToday && "text-primary")}>
        {dateFormatter.format(day)}
      </p>
      {isToday && <span className="mt-0.5 inline-block h-1 w-1 rounded-full bg-primary" />}
    </div>
  );
}

function ShiftCell({
  shifts,
  assignmentsByShift,
  selectedShiftId,
  onSelectShift,
  onUnassign,
  onMove,
  onCopy,
  compact,
}) {
  return (
    <div className="min-h-[92px] space-y-1 border-r border-border bg-background/35 p-1.5 last:border-r-0">
      {shifts.map(shift => (
        <PlanningShiftCard
          key={shift.id}
          shift={shift}
          assignments={assignmentsByShift.get(String(shift.id)) || []}
          selected={String(selectedShiftId || "") === String(shift.id)}
          onSelect={() => onSelectShift(shift)}
          onUnassign={assignment => onUnassign(shift, assignment)}
          onMove={onMove}
          onCopy={onCopy}
          compact={compact}
        />
      ))}
    </div>
  );
}

function WeekBand({
  week,
  groups,
  assignmentsByShift,
  selectedShiftId,
  onSelectShift,
  onUnassign,
  onMove,
  onCopy,
  perspective,
  showWeekLabel,
  today,
}) {
  const weekStart = week[0];
  const weekEnd = week[week.length - 1];
  return (
    <section className="min-w-[1040px] border-b border-border last:border-b-0">
      {showWeekLabel && (
        <div className="sticky left-0 z-30 flex h-7 items-center border-b border-border bg-muted/65 px-2.5 text-[10px] font-semibold text-muted-foreground">
          Week {getIsoWeek(weekStart)} · {weekFormatter.format(weekStart)} – {weekFormatter.format(weekEnd)}
        </div>
      )}
      <div className="sticky top-0 z-30 grid grid-cols-[190px_repeat(7,minmax(120px,1fr))] border-b border-border bg-card/95 backdrop-blur">
        <div className="sticky left-0 z-40 flex items-center border-r border-border bg-card px-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {perspective === "employee" ? "Medewerker" : "Object / dienst"}
        </div>
        {week.map(day => <DayHeader key={dateKey(day)} day={day} today={today} />)}
      </div>

      {groups.map(group => (
        <div key={`${group.key}-${dateKey(weekStart)}`} className="grid grid-cols-[190px_repeat(7,minmax(120px,1fr))] border-b border-border/80 last:border-b-0">
          <GroupLabel group={group} perspective={perspective} />
          {week.map(day => {
            const dayShifts = group.shifts
              .filter(shift => shift.service_date === dateKey(day))
              .sort((left, right) => (
                timeToMinutes(left.start_time) - timeToMinutes(right.start_time)
                || String(left.name || "").localeCompare(String(right.name || ""), "nl")
              ));
            return (
              <ShiftCell
                key={`${group.key}-${dateKey(day)}`}
                shifts={dayShifts}
                assignmentsByShift={assignmentsByShift}
                selectedShiftId={selectedShiftId}
                onSelectShift={onSelectShift}
                onUnassign={onUnassign}
                onMove={onMove}
                onCopy={onCopy}
                compact={showWeekLabel}
              />
            );
          })}
        </div>
      ))}
    </section>
  );
}

function getIsoWeek(date) {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = target.getDay() || 7;
  target.setDate(target.getDate() + 4 - day);
  const yearStart = new Date(target.getFullYear(), 0, 1);
  return Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
}

function timeToMinutes(time) {
  const [hours = 0, minutes = 0] = String(time || "00:00").split(":").map(Number);
  return Math.max(0, Math.min(1440, (Number(hours) || 0) * 60 + (Number(minutes) || 0)));
}

function DayTimeline({
  day,
  groups,
  assignmentsByShift,
  selectedShiftId,
  onSelectShift,
  onUnassign,
  onMove,
  onCopy,
  perspective,
}) {
  const hours = Array.from({ length: 25 }, (_, index) => index);
  const dayKey = dateKey(day);

  return (
    <div className="min-w-[1650px]">
      <div className="sticky top-0 z-30 grid grid-cols-[190px_1fr] border-b border-border bg-card/95 backdrop-blur">
        <div className="sticky left-0 z-40 border-r border-border bg-card px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {perspective === "employee" ? "Medewerker" : "Object / dienst"}
        </div>
        <div className="relative h-8">
          {hours.map(hour => (
            <span
              key={hour}
              className="absolute top-2 -translate-x-1/2 text-[9px] font-medium text-muted-foreground"
              style={{ left: `${(hour / 24) * 100}%` }}
            >
              {String(hour).padStart(2, "0")}:00
            </span>
          ))}
        </div>
      </div>

      {groups.map(group => {
        const shifts = group.shifts
          .filter(shift => shift.service_date === dayKey)
          .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
        const rowHeight = Math.max(86, shifts.length * 76 + 8);
        return (
          <div key={group.key} className="grid grid-cols-[190px_1fr] border-b border-border/80" style={{ minHeight: rowHeight }}>
            <GroupLabel group={group} perspective={perspective} />
            <div className="relative bg-background/35">
              {hours.map(hour => (
                <div
                  key={hour}
                  className="absolute inset-y-0 border-l border-border/65"
                  style={{ left: `${(hour / 24) * 100}%` }}
                />
              ))}
              {shifts.map((shift, index) => {
                const start = timeToMinutes(shift.start_time);
                let end = timeToMinutes(shift.end_time);
                if (end <= start) end = 1440;
                const width = Math.max(10, ((end - start) / 1440) * 100);
                return (
                  <PlanningShiftCard
                    key={shift.id}
                    shift={shift}
                    assignments={assignmentsByShift.get(String(shift.id)) || []}
                    selected={String(selectedShiftId || "") === String(shift.id)}
                    onSelect={() => onSelectShift(shift)}
                    onUnassign={assignment => onUnassign(shift, assignment)}
                    onMove={onMove}
                    onCopy={onCopy}
                    compact
                    className="absolute w-auto min-w-[170px] max-w-[320px]"
                    style={{ left: `${(start / 1440) * 100}%`, width: `${width}%`, top: index * 76 + 5 }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildObjectGroups(shifts, objectsById, routesById, customersById) {
  const groups = new Map();
  shifts.forEach(shift => {
    const object = objectsById.get(String(shift.object_id || ""));
    const route = routesById.get(String(shift.route_id || ""));
    const customer = customersById.get(String(shift.customer_id || object?.customer_id || ""));
    const key = shift.object_id
      ? `object:${shift.object_id}`
      : shift.route_id
      ? `route:${shift.route_id}`
      : shift.customer_id
      ? `customer:${shift.customer_id}`
      : `service:${shift.group_label || shift.name || "overig"}`;
    if (!groups.has(key)) {
      const label = shift.object_name
        || object?.name
        || shift.group_label
        || route?.name
        || customer?.trade_name
        || customer?.name
        || "Overige diensten";
      const subtitle = shift.object_address
        || object?.address
        || (route ? "Mobiele surveillance" : customer?.trade_name || customer?.name || "Geen object gekoppeld");
      groups.set(key, {
        key,
        label,
        subtitle,
        icon: shift.object_id ? MapPin : shift.route_id ? Route : CalendarX2,
        shifts: [],
      });
    }
    groups.get(key).shifts.push(shift);
  });
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, "nl"));
}

function buildEmployeeGroups(shifts, assignments, personnel, assignmentsByShift) {
  const personnelById = new Map(personnel.map(item => [String(item.id), item]));
  const shiftsById = new Map(shifts.map(item => [String(item.id), item]));
  const assignedShiftIds = new Set();
  const groups = [];

  const activePersonnel = personnel
    .filter(item => item.status === "active" || item.is_active === true)
    .sort((a, b) => displayName(a).localeCompare(displayName(b), "nl"));

  activePersonnel.forEach(person => {
    const personAssignments = assignments.filter(item => item.status !== "removed" && String(item.personnel_id) === String(person.id));
    const personShifts = personAssignments.map(item => shiftsById.get(String(item.planning_shift_id))).filter(Boolean);
    personShifts.forEach(shift => assignedShiftIds.add(String(shift.id)));
    const warningTotal = personAssignments.reduce((sum, item) => sum + assignmentWarnings(item).length, 0);
    groups.push({
      key: `personnel:${person.id}`,
      label: displayName(person),
      subtitle: person.cao_function_group || person.function_type || person.employee_type || "Functie niet vastgelegd",
      meta: warningTotal > 0 ? `${warningTotal} waarschuwingen` : null,
      icon: UserRound,
      shifts: personShifts,
    });
  });

  const vacant = shifts.filter(shift => {
    const required = Math.max(1, Number(shift.required_count || 1));
    const active = (assignmentsByShift.get(String(shift.id)) || []).filter(item => item.status !== "removed");
    return active.length < required;
  });
  if (vacant.length > 0) {
    groups.unshift({
      key: "vacant",
      label: "Nog te bezetten",
      subtitle: `${vacant.length} ${vacant.length === 1 ? "dienst" : "diensten"} met open plaatsen`,
      icon: AlertTriangle,
      shifts: vacant,
    });
  }
  return groups;
}

export default function PlanningBoard({
  perspective,
  view,
  days,
  weeks,
  shifts,
  assignments,
  personnel,
  objects,
  routes,
  customers,
  selectedShiftId,
  onSelectShift,
  onUnassign,
  onMove,
  onCopy,
  isLoading,
}) {
  const assignmentsByShift = useMemo(() => {
    const map = new Map();
    assignments.filter(item => item.status !== "removed").forEach(item => {
      const key = String(item.planning_shift_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return map;
  }, [assignments]);
  const objectsById = useMemo(() => new Map(objects.map(item => [String(item.id), item])), [objects]);
  const routesById = useMemo(() => new Map(routes.map(item => [String(item.id), item])), [routes]);
  const customersById = useMemo(() => new Map(customers.map(item => [String(item.id), item])), [customers]);
  const groups = useMemo(() => perspective === "employee"
    ? buildEmployeeGroups(shifts, assignments, personnel, assignmentsByShift)
    : buildObjectGroups(shifts, objectsById, routesById, customersById),
  [perspective, shifts, assignments, personnel, assignmentsByShift, objectsById, routesById, customersById]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
          Planning laden…
        </div>
      </div>
    );
  }

  if (shifts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-background p-6">
        <div className="max-w-sm rounded-lg border border-dashed border-border bg-card p-7 text-center">
          <CalendarX2 className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 text-[14px] font-semibold">Geen diensten in deze periode</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Diensten worden vanuit routes en later vanuit het klantdossier klaargezet. Kies een andere periode of maak de dienst bij de klant.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-auto bg-background">
      {view === "day" ? (
        <DayTimeline
          day={days[0]}
          groups={groups}
          assignmentsByShift={assignmentsByShift}
          selectedShiftId={selectedShiftId}
          onSelectShift={onSelectShift}
          onUnassign={onUnassign}
          onMove={onMove}
          onCopy={onCopy}
          perspective={perspective}
        />
      ) : (
        weeks.map(week => (
          <WeekBand
            key={dateKey(week[0])}
            week={week}
            groups={groups}
            assignmentsByShift={assignmentsByShift}
            selectedShiftId={selectedShiftId}
            onSelectShift={onSelectShift}
            onUnassign={onUnassign}
            onMove={onMove}
            onCopy={onCopy}
            perspective={perspective}
            showWeekLabel={view === "four_weeks"}
            today={new Date()}
          />
        ))
      )}
    </div>
  );
}
