import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Edit, MapPin, Building2, Check, X } from "lucide-react";

const LOCATION_TYPES = {
  head_office: "Hoofdkantoor", branch: "Vestiging", warehouse: "Magazijn", other: "Overig",
};

const EMPTY_LOC = { name: "", location_type: "branch", street_name: "", house_number: "", house_number_addition: "", postal_code: "", city: "", country: "Nederland", is_active: true, is_route_office: false, notes: "" };

export default function LocationsTab({ companies }) {
  const [showInlineForm, setShowInlineForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_LOC);
  const [addressSugg, setAddressSugg] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const addrTimeout = useRef(null);
  const queryClient = useQueryClient();

  const { data: locations = [] } = useQuery({ queryKey: ["company-locations"], queryFn: () => base44.entities.CompanyLocation.list() });
  const { data: assignments = [] } = useQuery({ queryKey: ["company-location-assignments"], queryFn: () => base44.entities.CompanyLocationAssignment.list() });

  const saveMutation = useMutation({
    mutationFn: (data) => editingId ? base44.entities.CompanyLocation.update(editingId, data) : base44.entities.CompanyLocation.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-locations"] });
      setShowInlineForm(false);
      setEditingId(null);
      setForm(EMPTY_LOC);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CompanyLocation.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-locations"] }),
  });

  const openNew = () => { setEditingId(null); setForm(EMPTY_LOC); setShowInlineForm(true); };
  const openEdit = (loc) => { setEditingId(loc.id); setForm(loc); setShowInlineForm(true); };
  const cancel = () => { setShowInlineForm(false); setEditingId(null); setForm(EMPTY_LOC); };
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
    <div className="rounded-xl border border-border bg-card shadow-sm">
      {/* Header met knop */}
      <div className="bg-muted/40 border-b border-border px-6 py-4 rounded-t-xl flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Vestigingen</h2>
        {!showInlineForm && (
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" />Vestiging toevoegen
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="divide-y divide-border">
        {locations.length === 0 && !showInlineForm && (
          <p className="text-sm text-muted-foreground py-6 text-center">Nog geen vestigingen aangemaakt.</p>
        )}

        {locations.map(loc => {
          const linkedCompanies = getCompaniesForLocation(loc.id);
          const isEditingThis = editingId === loc.id && showInlineForm;

          if (isEditingThis) {
            return (
              <div key={loc.id} className="px-6 py-4">
                <InlineForm
                  form={form} set={set}
                  addressSugg={addressSugg} showSugg={showSugg}
                  handleAddressQuery={handleAddressQuery} selectAddress={selectAddress}
                  onSave={() => saveMutation.mutate(form)}
                  onCancel={cancel}
                  saving={saveMutation.isPending}
                />
              </div>
            );
          }

          return (
            <div key={loc.id} className="flex items-start gap-3 px-6 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">{LOCATION_TYPES[loc.location_type] || loc.location_type}</Badge>
                  </div>
                  <p className="text-sm text-foreground mt-0.5">
                    {[loc.street_name, loc.house_number, loc.postal_code, loc.city].filter(Boolean).join(" ")}
                  </p>
                  {linkedCompanies.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {linkedCompanies.map(c => <span key={c.id} className="text-xs bg-muted rounded px-1.5 py-0.5 text-muted-foreground">{c.display_name}</span>)}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(loc)}><Edit className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => { if (confirm("Vestiging verwijderen?")) deleteMutation.mutate(loc.id); }}><Trash2 className="w-4 h-4" /></Button>
                </div>
            </div>
          );
        })}

        {/* Inline nieuw formulier */}
        {showInlineForm && !editingId && (
          <div className="px-6 py-4">
            <InlineForm
              form={form} set={set}
              addressSugg={addressSugg} showSugg={showSugg}
              handleAddressQuery={handleAddressQuery} selectAddress={selectAddress}
              onSave={() => saveMutation.mutate(form)}
              onCancel={cancel}
              saving={saveMutation.isPending}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function InlineForm({ form, set, addressSugg, showSugg, handleAddressQuery, selectAddress, onSave, onCancel, saving }) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start overflow-visible">
      <div className="w-40 shrink-0">
        <Select value={form.location_type} onValueChange={v => set("location_type", v)}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(LOCATION_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex-1 relative">
        <Input
          value={form.street_name || ""}
          onChange={e => handleAddressQuery(e.target.value)}
          autoComplete="off"
          placeholder="Begin met typen voor adressuggesties..."
          className="h-9 text-sm"
        />
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
        <Button size="icon" variant="ghost" onClick={onCancel}><X className="w-4 h-4" /></Button>
        <Button size="icon" onClick={onSave} disabled={saving}><Check className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}