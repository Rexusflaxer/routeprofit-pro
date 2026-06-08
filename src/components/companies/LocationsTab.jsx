import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Edit, MapPin, Building2 } from "lucide-react";

const LOCATION_TYPES = {
  head_office: "Hoofdkantoor", branch: "Vestiging", warehouse: "Magazijn", other: "Overig",
};

const EMPTY_LOC = { name: "", location_type: "branch", street_name: "", house_number: "", house_number_addition: "", postal_code: "", city: "", country: "Nederland", is_active: true, is_route_office: false, notes: "" };

export default function LocationsTab({ companies }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_LOC);
  const [addressSugg, setAddressSugg] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const addrTimeout = useRef(null);
  const queryClient = useQueryClient();

  const { data: locations = [] } = useQuery({ queryKey: ["company-locations"], queryFn: () => base44.entities.CompanyLocation.list() });
  const { data: assignments = [] } = useQuery({ queryKey: ["company-location-assignments"], queryFn: () => base44.entities.CompanyLocationAssignment.list() });

  const saveMutation = useMutation({
    mutationFn: (data) => editing ? base44.entities.CompanyLocation.update(editing, data) : base44.entities.CompanyLocation.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["company-locations"] }); setDialogOpen(false); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CompanyLocation.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-locations"] }),
  });

  const openNew = () => { setEditing(null); setForm(EMPTY_LOC); setDialogOpen(true); };
  const openEdit = (loc) => { setEditing(loc.id); setForm(loc); setDialogOpen(true); };
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleAddressQuery = (val) => {
    set("street_name", val);
    if (addrTimeout.current) clearTimeout(addrTimeout.current);
    if (val.length >= 3) {
      addrTimeout.current = setTimeout(async () => {
        const { data } = await base44.functions.invoke("searchAddress", { query: val });
        setAddressSugg(data.suggestions || []);
        setShowSugg(true);
      }, 300);
    } else setShowSugg(false);
  };

  const selectAddress = (s) => {
    setForm(f => ({ ...f, street_name: s.address, full_address: s.address, latitude: s.latitude, longitude: s.longitude }));
    setShowSugg(false);
  };

  const getCompaniesForLocation = (locId) => {
    const asgns = assignments.filter(a => a.location_id === locId);
    return asgns.map(a => companies.find(c => c.id === a.company_id)).filter(Boolean);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" />Vestiging toevoegen</Button>
      </div>

      {locations.length === 0 && <p className="text-sm text-slate-400 py-8 text-center">Nog geen vestigingen aangemaakt.</p>}

      <div className="space-y-3">
        {locations.map(loc => {
          const linkedCompanies = getCompaniesForLocation(loc.id);
          return (
            <Card key={loc.id} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-slate-50">
                  <Building2 className="w-5 h-5 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{loc.name}</span>
                    <Badge variant="secondary" className="text-xs">{LOCATION_TYPES[loc.location_type] || loc.location_type}</Badge>
                    {loc.is_route_office && <Badge className="bg-blue-100 text-blue-800 text-xs">Route-kantoor</Badge>}
                    {!loc.is_active && <Badge variant="outline" className="text-xs text-red-600">Inactief</Badge>}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {[loc.street_name, loc.house_number, loc.postal_code, loc.city].filter(Boolean).join(" ")}
                  </p>
                  {linkedCompanies.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {linkedCompanies.map(c => <span key={c.id} className="text-xs bg-slate-100 rounded px-1.5 py-0.5 text-slate-600">{c.display_name}</span>)}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(loc)}><Edit className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => { if (confirm("Vestiging verwijderen?")) deleteMutation.mutate(loc.id); }}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Vestiging bewerken" : "Vestiging toevoegen"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={form.location_type} onValueChange={v => set("location_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(LOCATION_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 relative">
              <Label>Adres</Label>
              <Input value={form.street_name || ""} onChange={e => handleAddressQuery(e.target.value)} autoComplete="off" placeholder="Begin met typen voor adressuggesties..." />
              {showSugg && addressSugg.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {addressSugg.map((s, i) => (
                    <button key={i} type="button" onClick={() => selectAddress(s)} className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex gap-2 text-foreground">
                      <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />{s.address}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuleren</Button>
              <Button onClick={() => saveMutation.mutate(form)}>Opslaan</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}