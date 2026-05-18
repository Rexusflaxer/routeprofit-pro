import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "../components/ui-custom/PageHeader";
import ExecutionDayCard from "../components/execution/ExecutionDayCard";
import { buildMonthDays, getMonthLabel, toDateKey } from "../components/execution/executionCalendarUtils";

export default function Uitvoering() {
  const today = useMemo(() => new Date(), []);
  const endOfYear = useMemo(() => new Date(today.getFullYear(), 11, 31), [today]);
  const [monthDate, setMonthDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const { data: routes = [] } = useQuery({ queryKey: ["routes"], queryFn: () => base44.entities.Route.list() });
  const { data: mobileExecutions = [] } = useQuery({ queryKey: ["route-executions"], queryFn: () => base44.entities.RouteExecution.list("-generated_at") });
  const monthDays = buildMonthDays(monthDate);
  const canGoNext = monthDate.getFullYear() < endOfYear.getFullYear() || monthDate.getMonth() < endOfYear.getMonth();
  const canGoPrev = monthDate.getFullYear() > today.getFullYear() || monthDate.getMonth() > today.getMonth();

  const changeMonth = (direction) => {
    setMonthDate(current => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Uitvoering"
        subtitle="Routes uit de blauwdruk zijn automatisch doorgepland op hun weekdagen tot het einde van dit jaar."
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <Button variant="ghost" size="icon" disabled={!canGoPrev} onClick={() => changeMonth(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-36 px-3 text-center text-sm font-bold capitalize text-slate-900">{getMonthLabel(monthDate)}</div>
            <Button variant="ghost" size="icon" disabled={!canGoNext} onClick={() => changeMonth(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        De Routes-pagina blijft de blauwdruk. Deze agenda toont de uitvoeringen per kalenderdag; starten doe je hier per route en datum.
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {monthDays.map(date => (
          <ExecutionDayCard
            key={toDateKey(date)}
            date={date}
            routes={routes}
            mobileExecutions={mobileExecutions}
            isToday={toDateKey(date) === toDateKey(today)}
          />
        ))}
      </div>
    </div>
  );
}