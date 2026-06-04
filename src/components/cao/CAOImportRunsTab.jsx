import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, AlertTriangle, XCircle, Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

const STATUS_MAP = {
  running: { label: "Bezig", icon: Loader2, color: "text-blue-500", spin: true },
  completed: { label: "Voltooid", icon: CheckCircle, color: "text-green-600" },
  completed_with_review: { label: "Review vereist", icon: AlertTriangle, color: "text-amber-600" },
  failed: { label: "Mislukt", icon: XCircle, color: "text-red-500" }
};

const TRIGGER_LABELS = {
  manual: "Handmatig",
  scheduled: "Gepland",
  source_changed: "Bronwijziging"
};

export default function CAOImportRunsTab() {
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["cao-import-runs"],
    queryFn: () => base44.entities.CAOImportRun.list("-started_at", 20)
  });

  if (isLoading) return <div className="text-sm text-muted-foreground py-6 text-center">Laden...</div>;

  if (runs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">Nog geen import-runs uitgevoerd.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {runs.map(run => {
        const s = STATUS_MAP[run.status] || STATUS_MAP.completed;
        const Icon = s.icon;
        return (
          <Card key={run.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className={`flex items-center gap-1 text-sm font-medium ${s.color}`}>
                      <Icon className={`w-4 h-4 ${s.spin ? "animate-spin" : ""}`} />
                      {s.label}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {TRIGGER_LABELS[run.trigger_type] || run.trigger_type}
                    </Badge>
                    {run.detected_changes?.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {run.detected_changes.length} wijziging(en)
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {run.started_at && format(new Date(run.started_at), "d MMM yyyy HH:mm", { locale: nl })}
                    {run.finished_at && ` → ${format(new Date(run.finished_at), "HH:mm", { locale: nl })}`}
                  </p>
                  {run.summary && (
                    <p className="text-sm text-foreground mt-2">{run.summary}</p>
                  )}
                  {run.error_message && (
                    <p className="text-xs text-red-500 mt-1">{run.error_message}</p>
                  )}
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  {run.source_document_ids?.length || 0} bronnen
                  {run.created_configuration_id && (
                    <p className="text-green-600">Configuratie aangemaakt</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}