import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Play, AlertTriangle } from "lucide-react";

export default function CAOPayrollTestTab() {
  const [personnelId, setPersonnelId] = useState("");
  const [shiftDate, setShiftDate] = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("22:00");
  const [endTime, setEndTime] = useState("06:00");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { data: personnel = [] } = useQuery({
    queryKey: ["personnel-active"],
    queryFn: () => base44.entities.Personnel.filter({ is_active: true })
  });

  async function runTest() {
    if (!personnelId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await base44.functions.invoke("calculatePersonnelCosts", {
        personnel_id: personnelId,
        work_schedule: [{ date: shiftDate, start_time: startTime, end_time: endTime }]
      });
      setResult(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Payroll berekeningstest</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Medewerker</Label>
              <Select value={personnelId} onValueChange={setPersonnelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Kies medewerker..." />
                </SelectTrigger>
                <SelectContent>
                  {personnel.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — Schaal {p.cao_scale || "?"} P{p.cao_period || 0}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Datum</Label>
              <Input type="date" value={shiftDate} onChange={e => setShiftDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Starttijd</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Eindtijd</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
          <Button onClick={runTest} disabled={loading || !personnelId} className="gap-2">
            <Play className="w-4 h-4" />
            {loading ? "Berekenen..." : "Bereken"}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm">Resultaat: {result.personnel_name}</CardTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{result.total_hours}u gewerkt</span>
                  <span>à €{result.base_hourly_rate}/u</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.payslip && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="bg-muted rounded p-2">
                      <p className="text-muted-foreground">Basis loon</p>
                      <p className="font-semibold text-foreground">€{result.payslip.base_salary}</p>
                    </div>
                    <div className="bg-muted rounded p-2">
                      <p className="text-muted-foreground">Bruto totaal</p>
                      <p className="font-semibold text-foreground">€{result.payslip.total_gross}</p>
                    </div>
                    <div className="bg-muted rounded p-2">
                      <p className="text-muted-foreground">Netto loon</p>
                      <p className="font-semibold text-foreground">€{result.payslip.net_salary}</p>
                    </div>
                    <div className="bg-muted rounded p-2">
                      <p className="text-muted-foreground">Werkgeverskosten</p>
                      <p className="font-semibold text-foreground">€{result.payslip.total_cost_employer}</p>
                    </div>
                  </div>

                  {/* Toeslagen */}
                  <div>
                    <p className="text-xs font-semibold mb-2">Toeslagen</p>
                    <div className="space-y-1">
                      {Object.entries(result.payslip.surcharges || {}).map(([key, val]) =>
                        val.hours > 0 ? (
                          <div key={key} className="flex items-center justify-between text-xs border-b border-border pb-1">
                            <span className="text-muted-foreground">
                              {key.replace(/_/g, " ")}
                            </span>
                            <div className="flex items-center gap-3">
                              <span>{val.hours}u</span>
                              <span className="text-green-600">+€{val.amount}</span>
                            </div>
                          </div>
                        ) : null
                      )}
                    </div>
                  </div>

                  {/* Uren per type */}
                  {result.hours_by_type && (
                    <div>
                      <p className="text-xs font-semibold mb-2">Uren per tijdtype</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(result.hours_by_type).filter(([, v]) => v > 0).map(([k, v]) => (
                          <Badge key={k} variant="outline" className="text-xs">
                            {k}: {Math.round(v * 100) / 100}u
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {result.calculation_warnings?.length > 0 && (
                <Alert>
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription className="text-xs">
                    {result.calculation_warnings.map((w, i) => <p key={i}>{w}</p>)}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}