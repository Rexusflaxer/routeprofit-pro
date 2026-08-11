import React from "react";
import { ListTodo, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PlanningEmployeePanel from "@/components/planning/PlanningEmployeePanel";
import PlanningTaskBacklog from "@/components/planning/PlanningTaskBacklog";

export default function PlanningSidePanel({ mode, onModeChange, taskCount, taskProps, employeeProps }) {
  return (
    <Tabs value={mode} onValueChange={onModeChange} className="flex h-full min-h-0 flex-col border-l border-border bg-muted/20">
      <div className="shrink-0 border-b border-border bg-card px-2 py-2">
        <TabsList className="grid h-8 w-full grid-cols-2 rounded-md p-0.5">
          <TabsTrigger value="tasks" className="h-7 gap-1 rounded px-2 text-[10px]">
            <ListTodo className="h-3 w-3" /> Taken
            <span className="rounded bg-muted px-1 text-[9px] tabular-nums">{taskCount}</span>
          </TabsTrigger>
          <TabsTrigger value="employees" className="h-7 gap-1 rounded px-2 text-[10px]">
            <Users className="h-3 w-3" /> Medewerkers
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="tasks" className="mt-0 min-h-0 flex-1 data-[state=active]:flex">
        <PlanningTaskBacklog {...taskProps} />
      </TabsContent>
      <TabsContent value="employees" className="mt-0 min-h-0 flex-1 data-[state=active]:flex">
        <PlanningEmployeePanel {...employeeProps} embedded />
      </TabsContent>
    </Tabs>
  );
}
