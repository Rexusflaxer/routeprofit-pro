import React from "react";
import { CalendarRange } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const WEEKS = Array.from({ length: 52 }, (_, index) => index + 1);

export default function ObjectTaskScheduleNavigator({ periods, periodKey, weekNumber, currentPeriodKey, currentWeekNumber, onPeriodChange, onWeekChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={periodKey} onValueChange={onPeriodChange}>
        <SelectTrigger className="h-8 w-[190px] bg-card text-xs" aria-label="Periode kiezen">
          <CalendarRange className="mr-1.5 h-3.5 w-3.5 text-primary" />
          <SelectValue placeholder="Kies een periode" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {periods.map(period => <SelectItem key={period.key} value={period.key} className={period.key === currentPeriodKey ? "font-semibold text-primary" : ""}>{period.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={String(weekNumber)} onValueChange={value => onWeekChange(Number(value))}>
        <SelectTrigger className="h-8 w-[120px] bg-card text-xs" aria-label="Week kiezen">
          <SelectValue placeholder="Week" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {WEEKS.map(week => <SelectItem key={week} value={String(week)} className={week === currentWeekNumber ? "font-semibold text-primary" : ""}>Week {week}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}