import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, TrendingUp } from "lucide-react";
import { format } from "date-fns";

export default function MileageTracker({ vehicleId }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    mileage: 0,
    notes: ""
  });

  const queryClient = useQueryClient();

  const { data: mileages = [] } = useQuery({
    queryKey: ['vehicle-mileage', vehicleId],
    queryFn: () => base44.entities.VehicleMileage.filter({ vehicle_id: vehicleId }, '-date'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.VehicleMileage.create({ ...data, vehicle_id: vehicleId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-mileage', vehicleId] });
      setShowForm(false);
      setForm({ date: format(new Date(), 'yyyy-MM-dd'), mileage: 0, notes: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.VehicleMileage.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-mileage', vehicleId] });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  const latestMileage = mileages.length > 0 ? mileages[0].mileage : 0;

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            KM-stand bijhouden
          </CardTitle>
          <Button 
            size="sm" 
            onClick={() => setShowForm(!showForm)}
            className="bg-slate-900 hover:bg-slate-800"
          >
            <Plus className="w-4 h-4 mr-1" /> KM-stand toevoegen
          </Button>
        </div>
        {mileages.length > 0 && (
          <div className="mt-2">
            <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
              Huidige stand: {latestMileage.toLocaleString()} km
            </Badge>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Datum</Label>
                <Input 
                  type="date" 
                  value={form.date} 
                  onChange={(e) => setForm(prev => ({ ...prev, date: e.target.value }))} 
                  required 
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">KM-stand</Label>
                <Input 
                  type="number" 
                  value={form.mileage} 
                  onChange={(e) => setForm(prev => ({ ...prev, mileage: Number(e.target.value) }))} 
                  required 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Opmerkingen</Label>
              <Input 
                value={form.notes} 
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))} 
                placeholder="Optioneel"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                Annuleren
              </Button>
              <Button type="submit" size="sm" className="bg-slate-900 hover:bg-slate-800">
                Opslaan
              </Button>
            </div>
          </form>
        )}

        {mileages.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            Geen km-standen geregistreerd. Voeg de eerste toe om te beginnen.
          </div>
        ) : (
          <div className="space-y-2">
            {mileages.map((entry, idx) => {
              const prevMileage = mileages[idx + 1]?.mileage;
              const kmDiff = prevMileage ? entry.mileage - prevMileage : null;
              
              return (
                <div key={entry.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-900">
                        {format(new Date(entry.date), 'dd-MM-yyyy')}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {entry.mileage.toLocaleString()} km
                      </Badge>
                      {kmDiff && (
                        <span className="text-xs text-slate-500">
                          (+{kmDiff.toLocaleString()} km)
                        </span>
                      )}
                    </div>
                    {entry.notes && (
                      <p className="text-xs text-slate-500 mt-1">{entry.notes}</p>
                    )}
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => deleteMutation.mutate(entry.id)}
                    className="h-8 w-8 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}