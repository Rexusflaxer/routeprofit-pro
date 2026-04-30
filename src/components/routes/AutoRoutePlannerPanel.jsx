import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Bot, CheckCircle2, Loader2, Route } from "lucide-react";

const WEEKDAY_LABELS = { 1: "Ma", 2: "Di", 3: "Wo", 4: "Do", 5: "Vr", 6: "Za", 7: "Zo" };

export default function AutoRoutePlannerPanel({ onPlanned }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runPlanner = async () => {
    setLoading(true);
    setError(null);
    const response = await base44.functions.invoke("autoPlanRoutes", {});
    if (response.data?.error) {
      setError(response.data.error);
      setResult(null);
    } else {
      setResult(response.data);
      onPlanned?.();
    }
    setLoading(false);
  };

  return (
    <Card className="border-green-200 bg-gradient-to-br from-green-50 to-white">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-slate-900">
          <Bot className="w-5 h-5 text-green-700" />
          Automatische routeplanner
        </CardTitle>
        <p className="text-sm text-slate-600">
          Laat de applicatie zelf bepalen hoeveel routes per dag nodig zijn, met maximaal de beschikbare voertuigen en diensten tot 10 uur.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={runPlanner} disabled={loading} className="bg-green-700 hover:bg-green-800">
          {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Route className="w-4 h-4 mr-1" />}
          Routes automatisch berekenen en aanmaken
        </Button>

        {error && (
          <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-green-800">
              <CheckCircle2 className="w-4 h-4" />
              <span className="font-semibold">{result.routes_created} routes aangemaakt</span>
              <Badge className="bg-green-100 text-green-800">{result.vehicles_available} voertuigen beschikbaar</Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {(result.day_summaries || []).map(day => (
                <div key={day.weekday} className="rounded-lg border border-slate-200 bg-white p-2 text-center">
                  <p className="text-xs font-bold text-slate-500">{WEEKDAY_LABELS[day.weekday]}</p>
                  <p className="text-sm font-semibold text-slate-900">{day.routes} routes</p>
                  <p className="text-xs text-slate-500">{day.tasks_planned} taken</p>
                </div>
              ))}
            </div>

            {(result.unplanned || []).length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900 mb-2">Niet ingeplande taken met advies</p>
                <div className="space-y-2">
                  {result.unplanned.map((item, index) => (
                    <div key={index} className="text-xs text-amber-900 bg-white/70 rounded-md p-2">
                      <strong>{WEEKDAY_LABELS[item.weekday]} · {item.task_type}</strong>: {item.reason}. {item.advice}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}