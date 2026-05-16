import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import PageHeader from "../components/ui-custom/PageHeader";
import { Camera, FileText, ShieldCheck } from "lucide-react";

export default function RouteExecutionDetails() {
  const id = new URLSearchParams(window.location.search).get("id");
  const { data: executions = [] } = useQuery({ queryKey: ["route-execution", id], queryFn: () => base44.entities.RouteExecution.filter({ id }) });
  const route = executions[0];
  const { data: tasks = [] } = useQuery({ queryKey: ["route-execution-tasks", id], queryFn: () => base44.entities.TaskExecution.filter({ route_execution_id: id }), enabled: !!id });
  const { data: reports = [] } = useQuery({ queryKey: ["route-execution-reports", id], queryFn: () => base44.entities.MobileReport.filter({ route_execution_id: id }), enabled: !!id });
  const { data: photos = [] } = useQuery({ queryKey: ["route-execution-photos", id], queryFn: () => base44.entities.MobilePhoto.filter({ route_execution_id: id }), enabled: !!id });
  const { data: logs = [] } = useQuery({ queryKey: ["route-execution-logs", id], queryFn: () => base44.entities.MobileAuditLog.filter({ route_execution_id: id }, "-created_at"), enabled: !!id });

  if (!route) return <div className="text-sm text-slate-500">Route-uitvoering laden...</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={route.route_name} subtitle={`${route.employee_name || "Geen medewerker"} · ${route.vehicle_license_plate || "Geen voertuig"}`} />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white border rounded-xl p-4"><p className="text-xs text-slate-500">Status</p><Badge className="mt-2">{route.status}</Badge></div>
        <div className="bg-white border rounded-xl p-4"><p className="text-xs text-slate-500">Taken</p><p className="text-2xl font-bold">{tasks.length}</p></div>
        <div className="bg-white border rounded-xl p-4"><p className="text-xs text-slate-500">Rapportages</p><p className="text-2xl font-bold">{reports.length}</p></div>
        <div className="bg-white border rounded-xl p-4"><p className="text-xs text-slate-500">Foto’s</p><p className="text-2xl font-bold">{photos.length}</p></div>
      </div>
      <section className="bg-white border rounded-xl p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Takenlijst</h3>
        <div className="space-y-2">{tasks.sort((a,b)=>a.sequence_index-b.sequence_index).map(task => <div key={task.id} className="flex items-center justify-between border rounded-lg p-3"><div><p className="font-medium">{task.sequence_index}. {task.task_name}</p><p className="text-xs text-slate-500">{task.object_name} · {task.planned_arrival_time || "geen tijd"}</p></div><Badge variant="outline">{task.status}</Badge></div>)}</div>
      </section>
      <section className="bg-white border rounded-xl p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><FileText className="w-4 h-4" /> Rapportages & auditlog</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><div>{reports.map(report => <div key={report.id} className="border rounded-lg p-3 mb-2 text-sm">{report.report_type}: {report.report_text || "Geen tekst"}</div>)}</div><div>{logs.slice(0, 20).map(log => <div key={log.id} className="border rounded-lg p-3 mb-2 text-xs"><strong>{log.action}</strong><br />{log.created_at}</div>)}</div></div>
      </section>
      <section className="bg-white border rounded-xl p-4"><h3 className="font-semibold mb-3 flex items-center gap-2"><Camera className="w-4 h-4" /> Foto’s</h3><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{photos.map(photo => <a key={photo.id} href={photo.file_url} target="_blank" className="border rounded-lg p-2 text-xs truncate">{photo.caption || photo.file_url}</a>)}</div></section>
    </div>
  );
}