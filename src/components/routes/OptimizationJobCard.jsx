import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle, Clock, RefreshCw } from "lucide-react";

const STATUS_LABELS = {
  queued: "In wachtrij",
  running: "Bezig",
  completed: "Voltooid",
  failed: "Mislukt",
};

const STATUS_STYLES = {
  queued: "bg-slate-100 text-slate-700",
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export default function OptimizationJobCard({ job, onRefresh, onLoadResult, refreshing }) {
  if (!job) return null;

  const status = job.status || "queued";
  const progress = Math.max(0, Math.min(100, Number(job.progress || 0)));
  const isCompleted = status === "completed";
  const isFailed = status === "failed";

  return (
    <div className="bg-white border border-blue-100 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {isCompleted ? <CheckCircle className="w-4 h-4 text-green-600" /> : isFailed ? <AlertTriangle className="w-4 h-4 text-red-600" /> : <Clock className="w-4 h-4 text-blue-600" />}
            <p className="text-sm font-semibold text-slate-900">Optimalisatiejob</p>
            <Badge className={STATUS_STYLES[status] || STATUS_STYLES.queued}>{STATUS_LABELS[status] || status}</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">Job-ID: {job.job_id || job.server_job_id}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Status
          </Button>
          {isCompleted && (
            <Button size="sm" onClick={onLoadResult} className="bg-green-700 hover:bg-green-800 text-white">
              Resultaat ophalen
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-slate-600">{progress}% · {job.message || "Optimalisatie loopt op de achtergrond"}</p>
      </div>

      {job.error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-2">
          {job.error}
        </div>
      )}
    </div>
  );
}