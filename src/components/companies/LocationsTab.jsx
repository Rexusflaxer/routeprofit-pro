import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit, MapPin, Check, X, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const LOCATION_TYPES = {
  head_office: "Hoofdkantoor", branch: "Vestiging", warehouse: "Magazijn", other: "Overig",
};

const DELETE_PASSWORD = "verwijder";
const EMPTY_LOC = { name: "", location_type: "branch", street_name: "", house_number: "", house_number_addition: "", postal_code: "", city: "", country: "Nederland", is_active: true, is_route_office: false, notes: "" };

function DeleteConfirmBar({ label, onConfirm, onCancel, isPending }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const handleConfirm = () => {
    if (password !== DELETE_PASSWORD) { setError(`Typ "${DELETE_PASSWORD}" om te bevestigen`); return; }
    onConfirm();
  };
  return (
    <div className="border-b border-destructive/20 bg-destructive/5 p-4">
      <div className="flex items-start gap-3 mb-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground">Vestiging verwijderen?</p>
          <p className="text-xs text-muted-foreground mt-0.5"><strong>{label}</strong> wordt verwijderd.</p>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground block">Typ <strong className="text-foreground font-mono">{DELETE_PASSWORD}</strong> om te bevestigen:</label>
        <div className="flex gap-2">
          <Input value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder={DELETE_PASSWORD} className={`h-8 text-sm font-mono max-w-[200px] ${error ? "border-destructive" : ""}`} onKeyDown={(e) => e.key === "Enter" && handleConfirm()} autoFocus />
          <Button variant="destructive" size="sm" onClick={handleConfirm} disabled={isPending}><Trash2 className="w-3.5 h-3.5 mr-1" />{isPending ? "Verwijderen..." : "Verwijderen"}</Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Annuleren</Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

export default function LocationsTab({ companies }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_LOC);
  const [addressSugg, setAddressSugg] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const addrTimeout = useRef(null);
  const queryClient = useQueryClient();

  const { data: locations = [] } = useQuery({ queryKey: ["company-locations"], queryFn: () => base44.entities.CompanyLocation.list() });
  const { data: assignments = [] } = useQuery({ queryKey: ["company-location-assignments"], queryFn: () => base44.entities.CompanyLocationAssignment.list() });

  const saveMutation = useMutation({
    mutationFn: (data) => editingId ? base44.entities.CompanyLocation.update(editingId, data) : base44.entities.CompanyLocation.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["company-locations"] }); cancel(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CompanyLocation.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["company-locations"] }); setDeleteId(null); },
  });

  const openNew = () => { setEditingId(null); setForm(EMPTY_LOC); setShowForm(true); };
  const openEdit = (loc) => { setEditingId(loc.id); setForm(loc); setShowForm(true); };
  const cancel = () => { setShowForm(false); setEditingId(null); setForm(EMPTY_LOC); setShowSugg(false); };
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
    return assignments.filter(a => a.location_id === locId).map(a => companies.find(c => c.id === a.company_id)).filter(Boolean);
  };

  const locToDelete = locations.find(l => l.id === deleteId);

  return (
    <div className="flex flex-col h-full">

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteId && locToDelete && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
            <DeleteConfirmBar
              label={[locToDelete.street_name, locToDelete.house_number, locToDelete.city].filter(Boolean).join(" ") || "Vestiging"}
              onConfirm={() => deleteMutation.mutate(deleteId)}
              onCancel={() => setDeleteId(null)}
              isPending={deleteMutation.isPending}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="border-b border-primary/30 bg-muted/20 p-4">
            {editingId && <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">Vestiging bewerken</p>}
            <div className="flex flex-col sm:flex-row gap-3 items-start overflow-visible">
              <div className="w-40 shrink-0">
                <Select value={form.location_type} onValueChange={v => set("location_type", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(LOCATION_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex-1 relative">
                <Input value={form.street_name || ""} onChange={e => handleAddressQuery(e.target.value)} autoComplete="off" placeholder="Begin met typen voor adressuggesties..." className="h-8 text-sm" />
                {showSugg && addressSugg.length > 0 && (
                  <div className="absolute z-[200] w-full top-full mt-1 bg-popover border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {addressSugg.map((s, i) => (
                      <button key={i} type="button" onClick={() => selectAddress(s)} className="w-full px-3 py-2.5 text-left text-sm hover:bg-accent flex gap-2 text-foreground">
                        <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />{s.address}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancel}><X className="w-4 h-4" /></Button>
                <Button size="icon" className="h-8 w-8" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}><Check className="w-4 h-4" /></Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table header */}
      <div className="flex items-center px-4 py-2 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="w-28 shrink-0">Type</span>
        <span className="flex-1">Adres</span>
        {!showForm && !deleteId && (
          <Button size="sm" variant="outline" onClick={openNew} className="h-6 px-2 text-xs font-medium normal-case tracking-normal">
            <Plus className="w-3 h-3 mr-1" /> Vestiging toevoegen
          </Button>
        )}
      </div>

      {locations.length === 0 && !showForm && (
        <p className="px-4 py-3 text-sm text-muted-foreground">Nog geen vestigingen aangemaakt.</p>
      )}

      <div className="divide-y divide-border">
        {locations.map(loc => {
          const linkedCompanies = getCompaniesForLocation(loc.id);
          return (
            <div key={loc.id} className="flex items-center px-4 py-3 group hover:bg-accent/30 transition-colors">
              <div className="w-28 shrink-0">
                <Badge variant="secondary" className="text-xs">{LOCATION_TYPES[loc.location_type] || loc.location_type}</Badge>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{[loc.street_name, loc.house_number, loc.postal_code, loc.city].filter(Boolean).join(" ")}</p>
                {linkedCompanies.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {linkedCompanies.map(c => <span key={c.id} className="text-xs bg-muted rounded px-1.5 py-0.5 text-muted-foreground">{c.display_name}</span>)}
                  </div>
                )}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(loc)} title="Bewerken"><Edit className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteId(loc.id)} title="Verwijderen"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}