import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INSTALLATION_TYPES } from "./objectInstallationConfig";

const emptyForm = { installation_type: "alarm_system", custom_type: "", name: "", brand: "", model: "", location: "", status: "active" };

export default function ObjectInstallationDialog({ open, onClose, onSave, saving, error }) {
  const [form, setForm] = useState(emptyForm);
  useEffect(() => { if (open) setForm(emptyForm); }, [open]);
  const field = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = event => { event.preventDefault(); onSave({ ...form, custom_type: form.installation_type === "other" ? form.custom_type.trim() : null }); };
  return <Dialog open={open} onOpenChange={value => !value && onClose()}><DialogContent><form onSubmit={submit} className="space-y-4">
    <DialogHeader><DialogTitle>Installatie toevoegen</DialogTitle><DialogDescription>Leg een technische installatie van dit object vast.</DialogDescription></DialogHeader>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="installation-type">Type</Label><select id="installation-type" value={form.installation_type} onChange={event => field("installation_type", event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{INSTALLATION_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></div>
      {form.installation_type === "other" && <div className="space-y-2 sm:col-span-2"><Label htmlFor="custom-type">Omschrijving type</Label><Input id="custom-type" value={form.custom_type} onChange={event => field("custom_type", event.target.value)} required /></div>}
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="installation-name">Naam</Label><Input id="installation-name" value={form.name} onChange={event => field("name", event.target.value)} placeholder="Bijv. hoofdalarminstallatie" required /></div>
      <div className="space-y-2"><Label htmlFor="installation-brand">Merk</Label><Input id="installation-brand" value={form.brand} onChange={event => field("brand", event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="installation-model">Model</Label><Input id="installation-model" value={form.model} onChange={event => field("model", event.target.value)} /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="installation-location">Locatie</Label><Input id="installation-location" value={form.location} onChange={event => field("location", event.target.value)} placeholder="Bijv. technische ruimte" /></div>
    </div>
    {error && <p className="text-xs text-destructive">{error.message}</p>}
    <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Annuleren</Button><Button type="submit" disabled={saving}>{saving ? "Opslaan..." : "Toevoegen"}</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}