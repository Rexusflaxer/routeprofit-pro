import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X, Save, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import TaskList from "./TaskList";
import CustomerSelect from "../ui-custom/CustomerSelect";
import TaskSpacingRulesEditor from "./TaskSpacingRulesEditor";

export default function ObjectForm({ object, onSave, onCancel }) {
  const [form, setForm] = useState(object || {
    object_code: "",
    customer_id: "",
    name: "",
    address: "",
    notes: "",
    task_spacing_rules: [],
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list(),
  });

  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const addressTimeoutRef = useRef(null);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleAddressChange = (value) => {
    handleChange("address", value);
    
    if (addressTimeoutRef.current) {
      clearTimeout(addressTimeoutRef.current);
    }

    if (value.length >= 3) {
      addressTimeoutRef.current = setTimeout(async () => {
        setLoadingAddress(true);
        try {
          const { data } = await base44.functions.invoke('searchAddress', { query: value });
          setAddressSuggestions(data.suggestions || []);
          setShowSuggestions(true);
        } catch (error) {
          console.error('Error fetching address suggestions:', error);
        } finally {
          setLoadingAddress(false);
        }
      }, 300);
    } else {
      setAddressSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectAddress = (suggestion) => {
    setForm(prev => ({
      ...prev,
      address: suggestion.address,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
    }));
    setShowSuggestions(false);
    setAddressSuggestions([]);
  };

  useEffect(() => {
    return () => {
      if (addressTimeoutRef.current) {
        clearTimeout(addressTimeoutRef.current);
      }
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.customer_id) {
      alert("Selecteer een klant voor dit object");
      return;
    }
    onSave({
      ...form,
      task_spacing_rules: (form.task_spacing_rules || []).filter(rule => rule.task_type_a && rule.task_type_b && Number(rule.min_minutes) > 0),
    });
  };

  return (
    <div className="space-y-6">
    <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Klant *</Label>
              {customers.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-500 bg-slate-50 rounded-lg">Geen klanten gevonden. Voeg eerst een klant toe.</div>
              ) : (
                <CustomerSelect customers={customers} value={form.customer_id} onValueChange={(v) => handleChange("customer_id", v)} placeholder="Selecteer een klant" />
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Objectcode</Label>
                <Input value={form.object_code || ""} onChange={(e) => handleChange("object_code", e.target.value)} placeholder="Bijv. OBJ-001" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Naam</Label>
                <Input value={form.name} onChange={(e) => handleChange("name", e.target.value)} placeholder="Bijv. Kantoor ABC" required />
              </div>
            </div>

            <div className="space-y-2 relative">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Adres</Label>
              <Input 
                value={form.address} 
                onChange={(e) => handleAddressChange(e.target.value)} 
                placeholder="Bijv. Stationsplein 1, Amsterdam" 
                required 
                autoComplete="off"
              />
              {loadingAddress && (
                <div className="absolute right-3 top-9 text-slate-400">
                  <div className="animate-spin h-4 w-4 border-2 border-slate-300 border-t-slate-600 rounded-full" />
                </div>
              )}
              {showSuggestions && addressSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {addressSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => selectAddress(suggestion)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-start gap-2 border-b border-slate-100 last:border-0"
                    >
                      <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                      <span className="text-slate-700">{suggestion.address}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Opmerkingen</Label>
              <Textarea value={form.notes} onChange={(e) => handleChange("notes", e.target.value)} rows={2} placeholder="Extra informatie..." />
            </div>

            <TaskSpacingRulesEditor
              rules={form.task_spacing_rules || []}
              onChange={(rules) => handleChange("task_spacing_rules", rules)}
              title="Plannerregels voor dit object"
              description="Welke taken mogen niet te snel na elkaar gebeuren?"
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
              <Button type="submit" className="bg-slate-900 hover:bg-slate-800"><Save className="w-4 h-4 mr-1" /> Opslaan</Button>
            </div>
    </form>

    {object && object.id && <TaskList objectId={object.id} />}
  </div>
  );
}