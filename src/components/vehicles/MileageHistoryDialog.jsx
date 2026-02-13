import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import MileageDialog from "./MileageDialog";

export default function MileageHistoryDialog({ vehicle, open, onClose }) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const queryClient = useQueryClient();

  const { data: mileages = [] } = useQuery({
    queryKey: ['vehicle-mileage', vehicle?.id],
    queryFn: () => base44.entities.VehicleMileage.filter({ vehicle_id: vehicle.id }, '-date'),
    enabled: !!vehicle?.id && open,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.VehicleMileage.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-mileage', vehicle?.id] });
    },
  });

  const addMileageMutation = useMutation({
    mutationFn: (data) => base44.entities.VehicleMileage.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-mileage', vehicle?.id] });
      setShowAddDialog(false);
    },
  });

  const latestMileage = mileages.length > 0 ? mileages[0].mileage : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              KM-stand historie - {vehicle?.license_plate}
            </DialogTitle>
            {mileages.length > 0 && (
              <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 w-fit mt-2">
                Huidige stand: {latestMileage.toLocaleString()} km
              </Badge>
            )}
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <Button 
              onClick={() => setShowAddDialog(true)}
              className="w-full bg-slate-900 hover:bg-slate-800"
            >
              <Plus className="w-4 h-4 mr-2" /> KM-stand toevoegen
            </Button>

            {mileages.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
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
          </div>
        </DialogContent>
      </Dialog>

      <MileageDialog 
        vehicleId={vehicle?.id}
        open={showAddDialog} 
        onClose={() => setShowAddDialog(false)}
        onSave={(data) => addMileageMutation.mutate(data)}
      />
    </>
  );
}