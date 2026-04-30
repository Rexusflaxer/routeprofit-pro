import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Info } from "lucide-react";

export default function UnassignedTasksView({ unassigned = [] }) {
  if (unassigned.length === 0) return (
    <Card className="border-green-200 bg-green-50">
      <CardContent className="py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        </div>
        <p className="text-sm text-green-700 font-medium">Alle taken zijn succesvol ingepland!</p>
      </CardContent>
    </Card>
  );

  return (
    <Card className="border-red-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-red-700">
          <AlertTriangle className="w-4 h-4" />
          Niet ingeplande taken ({unassigned.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {unassigned.map((task, i) => (
          <div key={task.id || i} className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-800 text-sm">{task.task_name || task.name}</p>
                {task.address && <p className="text-xs text-slate-500">{task.address}</p>}
              </div>
              <Badge className={task.priority === "contractueel_verplicht" ? "bg-red-100 text-red-700" : task.priority === "belangrijk" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}>
                {task.priority === "contractueel_verplicht" ? "Verplicht" : task.priority === "belangrijk" ? "Belangrijk" : "Optioneel"}
              </Badge>
            </div>

            <div className="flex items-start gap-2 bg-white rounded-lg px-3 py-2 border border-red-100">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{task.reason}</p>
            </div>

            {task.advice && (
              <div className="flex items-start gap-2 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700"><strong>Advies:</strong> {task.advice}</p>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}