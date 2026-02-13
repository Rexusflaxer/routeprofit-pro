import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, X } from "lucide-react";

export default function SellVehicleDialog({ vehicle, open, onClose, onSave }) {
  const [form, setForm] = useState({
    actual_residual_value: vehicle?.actual_residual_value || 0,
    disposal_date: vehicle?.disposal_date || new Date().toISOString().split('T')[0],
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...vehicle,
      actual_residual_value: form.actual_residual_value,
      disposal_date: form.disposal_date,
      is_active: false
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Auto verkopen</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Daadwerkelijke restwaarde (€)
            </Label>
            <Input 
              type="number" 
              step="0.01" 
              value={form.actual_residual_value} 
              onChange={(e) => setForm(prev => ({ ...prev, actual_residual_value: parseFloat(e.target.value) || 0 }))}
              placeholder="Verkoopprijs"
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Datum uit gebruik
            </Label>
            <Input 
              type="date" 
              value={form.disposal_date} 
              onChange={(e) => setForm(prev => ({ ...prev, disposal_date: e.target.value }))}
              required
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="w-4 h-4 mr-1" /> Annuleren
            </Button>
            <Button type="submit" className="bg-slate-900 hover:bg-slate-800">
              <Save className="w-4 h-4 mr-1" /> Opslaan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}