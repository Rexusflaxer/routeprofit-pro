import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Bot, CheckCircle2, Route } from "lucide-react";

function todayDate() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

export default function AutoRoutePlanner({ onPlanned }) {
  const [form, setForm] = useState({
    start_date: todayDate(),
    horizon_days: 7,
    target_shift_hours: 8,
    max_shift_hours: 10,
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const generateRoutes = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await base44.functions.invoke("autoGenerateRoutes", form);
      if (response.data?.error) throw new Error(response.data.error);
      setResult(response.data);
      onPlanned?.();
    } catch (err) {
      setError(err.message || "Automatische planning mislukt.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-blue-200 bg-blue-50/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-slate-900">
          <Bot className="w-5 h-5 text-blue-600" />
          Automatische routeplanning
        </CardTitle>
        <p className="text-sm text-slate-600">
          Laat de applicatie bepalen hoeveel routes nodig zijn per dag, maximaal op basis van de beschikbare voertuigen.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label>Startdatum</Label>
            <Input type="date" value={form.start_date} onChange={(e) => update("start_date", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Aantal dagen</Label>
            <Input type="number" min="1" max="31" value={form.horizon_days} onChange={(e) => update("horizon_days", Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Streefduur dienst</Label>
            <Input type="number" min="4" max="10" value={form.target_shift_hours} onChange={(e) => update("target_shift_hours", Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Max. dienstduur</Label>
            <Input type="number" min="4" max="12" value={form.max_shift_hours} onChange={(e) => update("max_shift_hours", Number(e.target.value))} />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Bestaande automatische routes worden vervangen; handmatig gemaakte routes blijven staan.
          </p>
          <Button onClick={generateRoutes} disabled={loading} className="bg-blue-700 hover:bg-blue-800">
            <Route className="w-4 h-4 mr-1" />
            {loading ? "Routes berekenen..." : "Bereken & maak routes"}
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="font-semibold text-slate-900">{result.routes_created} routes aangemaakt</span>
              </div>
              <Badge variant="secondary">Max. {result.max_routes_per_day} routes per dag</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {(result.daily_summaries || []).map(day => (
                <div key={day.date} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <div className="font-medium text-slate-800">{day.weekday} {day.date}</div>
                  <div className="text-slate-500">{day.routes_created} routes · {day.tasks_planned} taken gepland</div>
                </div>
              ))}
            </div>

            {(result.unplanned_tasks || []).length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4" /> Niet ingeplande taken
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {result.unplanned_tasks.map((item, index) => (
                    <div key={`${item.task_id}-${item.date}-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                      <div className="font-medium text-amber-900">{item.weekday} {item.date} · {item.task_type}</div>
                      <div className="text-amber-800 mt-1">{item.reason}</div>
                      <div className="text-amber-700 mt-1 text-xs">Advies: {item.advice}</div>
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