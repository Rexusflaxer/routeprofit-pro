import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageHeader from "../components/ui-custom/PageHeader";
import { Clock, Car, User, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

const STATUS_LABELS = { planned: "Gepland", downloaded: "Gedownload", active: "Actief", paused: "Gepauzeerd", completed: "Afgerond", cancelled: "Geannuleerd" };

export default function RouteExecutions() {
  const [status, setStatus] = useState("all");
  const { data: executions = [] } = useQuery({ queryKey: ["route-executions"], queryFn: () => base44.entities.RouteExecution.list("-generated_at") });
  const { data: tasks = [] } = useQuery({ queryKey: ["task-executions"], queryFn: () => base44.entities.TaskExecution.list() });
  const visible = status === "all" ? executions : executions.filter(item => item.status === status);

  return (
    <div className="space-y-6">
      <PageHeader title="Mobiele route-uitvoeringen" subtitle="Live voortgang van diensten, taken en mobiele sync" />
      <div className="flex flex-wrap gap-2">
        {["all", "planned", "active", "completed"].map(value => <Button key={value} variant={status === value ? "default" : "outline"} size="sm" onClick={() => setStatus(value)}>{value === "all" ? "Alles" : STATUS_LABELS[value]}</Button>)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {visible.map(route => {
          const routeTasks = tasks.filter(task => task.route_execution_id === route.id);
          const done = routeTasks.filter(task => ["completed", "skipped"].includes(task.status)).length;
          return (
            <Link key={route.id} to={`/RouteExecutionDetails?id=${route.id}`} className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-foreground">{route.route_name}</h3>
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <p className="flex items-center gap-2"><Clock className="w-4 h-4" />{route.shift_start_time} – {route.shift_end_time}</p>
                    <p className="flex items-center gap-2"><User className="w-4 h-4" />{route.employee_name || "Geen medewerker"}</p>
                    <p className="flex items-center gap-2"><Car className="w-4 h-4" />{route.vehicle_license_plate || "Geen voertuig"}</p>
                  </div>
                </div>
                <Badge>{STATUS_LABELS[route.status] || route.status}</Badge>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="w-4 h-4" />{done}/{routeTasks.length} taken afgerond</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}