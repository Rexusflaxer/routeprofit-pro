import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from "lucide-react";

function getTodayDate() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().split("T")[0];
}

export default function RouteAutoPlanner({ onFinished }) {
  const [planningDate, setPlanningDate] = useState(getTodayDate());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runPlanner = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await base44.functions.invoke("generateOptimalRoutes", { planning_date: planningDate });
      if (response.data?.error) throw new Error(response.data.error);
      setResult(response.data);
      onFinished?.();
    } catch (err) {
      setError("Routeplanning kon niet worden berekend. Controleer objectadressen, voertuigen en taken.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
          <Sparkles className="w-5 h-5 text-amber-600" />
          Automatische routeplanning
        </CardTitle>
        <p className="text-sm text-slate-600">
          Laat de applicatie automatisch 2 avondroutes en 1 nachtroute per dag maken, met zo min mogelijk reistijd en kosten.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3 items-end">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Planningsdatum</Label>
            <Input type="date" value={planningDate} onChange={(e) => setPlanningDate(e.target.value)} />
          </div>
          <Button onClick={runPlanner} disabled={loading} className="bg-slate-900 hover:bg-slate-800 w-full md:w-fit">
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
            Optimale routes berekenen en aanmaken
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 mt-0.5" /> {error}
          </div>
        )}

        {result && (
          <div className="space-y-3 rounded-xl border border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-green-800">
              <CheckCircle2 className="w-4 h-4" /> Planning aangemaakt
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-white text-green-800 border border-green-200">{result.routes_created || 0} routes</Badge>
              <Badge className="bg-white text-green-800 border border-green-200">{result.tasks_planned || 0} taken gepland</Badge>
              <Badge className="bg-white text-green-800 border border-green-200">{result.tasks_unplanned || 0} aandachtspunten</Badge>
            </div>
            {(result.warnings || []).length > 0 && (
              <div className="space-y-1 text-xs text-amber-800">
                {result.warnings.slice(0, 8).map((warning, idx) => <p key={idx}>• {warning}</p>)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}